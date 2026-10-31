"""Il Nemesis system: gli avversari sono persone che tornano (progetto in NEMESI.md).

Logica pura, senza Flask (si prova da sola, v. test_nemesi.py); `app.py` la collega al matchmaking e al duello. Un RIVALE e' un
record come quello di un allievo (stesso formato, `record_to_pg` lo trasforma in combattente) con in piu':

* `rapporti`: per ogni allievo della palestra (id) com'e' andata tra loro: {vinte, perse, ultimo, giorno}: "vinte" sono le vittorie
  DELL'ALLIEVO sul rivale, "perse" le sue sconfitte; `ultimo` e' chi ha vinto l'ultima volta ("a" l'allievo, "r" il rivale);
* `vittorie` / `sconfitte` / `incontri`: la sua carriera; `soprannome` (dal livello 3, scelto dai suoi poteri).

Come pesa sul gioco (tutto in app.py / azzardo.py, qui solo i numeri e le regole di scelta):
RIVINCITA (chi ha perso l'ultimo incontro parte con +1 a colpire e ai riflessi per 3 turni, che sia l'allievo o il rivale), la folla che
la vuole (tifo di partenza), la quota che la sa (`prob_vittoria`), la TAGLIA su chi ha battuto i tuoi allievi e il segno che lascia
sull'allievo (fiducia e stress)."""
import json
import os
import random

BASE = os.path.dirname(os.path.abspath(__file__))
SOPRANNOME_LIVELLO = 3       # dal livello 3 un combattente si merita un soprannome
MAX_RIVALI = 14              # il mondo del ring e' piccolo: oltre questi, chi non e' mai stato incontrato due volte e' dimenticato
P_RITORNO = 0.6              # con un rivale adatto in giro, probabilita' che sia lui a presentarsi (altrimenti ne arriva uno nuovo)
PESO_STORIA = 2.0            # un rivale con cui l'allievo ha gia' un conto in sospeso pesa 1 + questo
FASCIA_LIVELLO = 2           # un rivale e' "adatto" entro tanti livelli dal livello di matchmaking dell'allievo (come BIAS_MAX)
K_RIVINCITA = 0.3            # quanto la rivincita sposta la logistica delle quote: +7,5% a 50% (misurato: +1 per 3 turni vale +6..9 punti tra pari)
TIFO_RIVINCITA = 25          # la folla vuole la rivincita: tifo di partenza (un pip sul dado) verso chi ha perso l'ultima volta
TURNI_RIVINCITA = 3
TAGLIA_PER_SCONFITTA = 40    # ¤ in piu' sulla vittoria per ogni allievo della palestra che il rivale ha battuto...
TAGLIA_MAX = 160             # ...fino a questo tetto
TOKEN_VITTORIA = 1.5         # il rivale che vince assapora la vittoria: XP in piu' (x) rispetto a una vittoria normale
STRESS_SCONFITTA = 8         # un allievo battuto di nuovo dal suo nemico: stress su, fiducia giu'
FIDUCIA_SCONFITTA = -6
STRESS_VENDETTA = -6         # un allievo che batte chi l'aveva battuto: stress giu', fiducia su
FIDUCIA_VENDETTA = 8

_cache = {}


def _soprannomi():
    if "s" not in _cache:
        with open(os.path.join(BASE, "data", "soprannomi.json"), encoding="utf-8") as f:
            _cache["s"] = json.load(f)
    return _cache["s"]


# ---------------------------------------------------------------- soprannomi
def soprannomi_disponibili(rec):
    """Il pool di un combattente: i soprannomi dei suoi poteri (quelli di tutti, senza doppioni); senza poteri il pool generico."""
    s = _soprannomi()
    out = []
    for pw in rec.get("poteri", []):
        for n in s["poteri"].get(str(pw["id"]), []):
            if n not in out:
                out.append(n)
    return out or list(s["generico"])


def puo_avere_soprannome(rec):
    return rec.get("livello", 1) >= SOPRANNOME_LIVELLO


def assegna_soprannome(rec, rng=random):
    """Un rivale che ha raggiunto il livello giusto si prende un soprannome dai suoi poteri (una volta sola). Ritorna il soprannome o None."""
    if rec.get("soprannome") or not puo_avere_soprannome(rec):
        return None
    rec["soprannome"] = rng.choice(soprannomi_disponibili(rec))
    return rec["soprannome"]


def imposta_soprannome(rec, scelto):
    """Il giocatore cambia il soprannome di un suo allievo, quando vuole: uno del suo pool, o niente (""). Ritorna un messaggio di rifiuto o None."""
    if not scelto:
        rec["soprannome"] = None
        return None
    if not puo_avere_soprannome(rec):
        return f"serve il livello {SOPRANNOME_LIVELLO}"
    if scelto not in soprannomi_disponibili(rec):
        return "soprannome non disponibile per i suoi poteri"
    rec["soprannome"] = scelto
    return None


def nome_completo(rec):
    """Nome (+ soprannome tra virgolette) come si legge nei duelli: Elena «Lama» Rossi."""
    nome, sopr = rec.get("nome", ""), rec.get("soprannome")
    if not sopr:
        return nome
    parti = nome.split(" ", 1)
    return f"{parti[0]} «{sopr}» {parti[1]}" if len(parti) > 1 else f"{nome} «{sopr}»"


# ---------------------------------------------------------------- la memoria
def rapporto(rival, pid):
    """Com'e' andata tra questo rivale e l'allievo `pid`: {vinte, perse, ultimo, giorno}; vuoto se non si sono mai incontrati."""
    return rival.get("rapporti", {}).get(str(pid)) or {"vinte": 0, "perse": 0, "ultimo": None, "giorno": None}


def conosciuti(rival, pid):
    r = rapporto(rival, pid)
    return r["vinte"] + r["perse"] > 0


def registra(rival, pid, vinto_allievo, giorno):
    """Fine di un incontro: il rivale ricorda. Ritorna il rapporto aggiornato."""
    r = dict(rapporto(rival, pid))
    r["vinte" if vinto_allievo else "perse"] += 1
    r["ultimo"] = "a" if vinto_allievo else "r"
    r["giorno"] = giorno
    rival.setdefault("rapporti", {})[str(pid)] = r
    rival["incontri"] = rival.get("incontri", 0) + 1
    if vinto_allievo:
        rival["sconfitte"] = rival.get("sconfitte", 0) + 1
    else:
        rival["vittorie"] = rival.get("vittorie", 0) + 1
    return r


def chi_cerca_rivincita(rival, pid):
    """'a' se l'ultima volta ha perso l'allievo, 'r' se ha perso il rivale, None se non si sono mai incontrati."""
    u = rapporto(rival, pid)["ultimo"]
    return None if u is None else ("a" if u == "r" else "r")


def etichetta(rival, pid, giorno=None):
    """La frase che avverte il giocatore (in UI e nel log): chi e' questo avversario per il suo allievo.
    `testo` e' la frase intera, `breve` la riga per la scena del duello (poco spazio)."""
    r = rapporto(rival, pid)
    if not (r["vinte"] + r["perse"]):
        base = "Un nome nuovo per il tuo allievo" if rival.get("incontri") else "Un volto nuovo sul ring"
        return {"stato": "nuovo", "breve": "Mai affrontato",
                "testo": base + (f": ha già combattuto {rival['incontri']} volte con altri" if rival.get("incontri") else ".")}
    quando = ""
    if giorno is not None and r["giorno"] is not None:
        d = giorno - r["giorno"]
        quando = " (oggi)" if d <= 0 else f" ({d} giorn{'o' if d == 1 else 'i'} fa)"
    conto = f"{r['vinte']}–{r['perse']}"
    if r["ultimo"] == "r":
        if r["perse"] >= 2:
            return {"stato": "nemico", "breve": f"La tua nemesi · {conto} · rivincita!",
                    "testo": f"La tua nemesi: ti ha battuto {r['perse']} volte, l'ultima{quando}. Bilancio {conto}."}
        return {"stato": "ti_ha_battuto", "breve": f"Ti ha già battuto · {conto} · rivincita!",
                "testo": f"Ti ha già battuto{quando}: è l'occasione per la rivincita. Bilancio {conto}."}
    if r["vinte"] >= 2:
        return {"stato": "domato", "breve": f"Battuto {r['vinte']} volte da te · {conto}",
                "testo": f"Ha già perso {r['vinte']} volte contro di te{quando}, e se lo ricorda. Bilancio {conto}."}
    return {"stato": "battuto", "breve": f"Ha già perso contro di te · {conto}",
            "testo": f"Ha già perso contro di te{quando}: vorrà la rivincita. Bilancio {conto}."}


def segno_rivincita(rival, pid):
    """+1 se a cercare la rivincita e' l'allievo (la quota lo sa), -1 se e' il rivale, 0 se non c'e'."""
    c = chi_cerca_rivincita(rival, pid)
    return {"a": 1, "r": -1}.get(c, 0)


def taglia(rival):
    """La taglia su un rivale: ¤ in piu' sulla vittoria per ogni allievo della palestra che ha battuto (fino al tetto)."""
    battuti = sum(r["perse"] for r in rival.get("rapporti", {}).values())
    return min(TAGLIA_MAX, TAGLIA_PER_SCONFITTA * battuti)


# ---------------------------------------------------------------- la scelta dell'avversario
def adatti(rivali, pid, livello_mm):
    """I rivali presentabili a questo allievo: non troppo lontani dal livello di matchmaking. `livello_mm` = livello + bias."""
    return [r for r in rivali if abs(r.get("livello", 1) - livello_mm) <= FASCIA_LIVELLO]


def scegli(rivali, pid, livello_mm, rng=random, ultimo_id=None):
    """Il rivale che torna, o None se stavolta ne arriva uno nuovo. Pesa di piu' chi ha un conto in sospeso con l'allievo e
    di meno quello che ha appena affrontato (niente repliche di fila)."""
    cand = adatti(rivali, pid, livello_mm)
    if not cand or rng.random() >= P_RITORNO:
        return None
    pesi = [(1.0 + PESO_STORIA * conosciuti(r, pid)) * (0.25 if r["id"] == ultimo_id else 1.0) for r in cand]
    return rng.choices(cand, pesi)[0]


def pota(rivali, protetti=()):
    """Il mondo e' piccolo: sopra MAX_RIVALI si dimentica il rivale meno memorabile (meno incontri, piu' debole). Ritorna i rimossi."""
    tolti = []
    while len(rivali) > MAX_RIVALI:
        liberi = [r for r in rivali if r["id"] not in protetti]
        if not liberi:
            break
        r = min(liberi, key=lambda x: (x.get("incontri", 0), x.get("livello", 1)))
        rivali.remove(r)
        tolti.append(r)
    return tolti
