"""Urban — la Palestra: il giocatore e' un allenatore.

Tutto cio' che succede FUORI dal ring: un calendario di gioco al posto dell'orologio, l'allenamento che decide
come crescono i combattenti, il loro carattere (tratti, fiducia, stress, legami), gli eventi di palestra, l'eta',
il ritiro e la morte. Il combattimento non lo tocca: le regole del duello (engine.py, DuelloWeb) restano quelle.

Qui c'e' solo logica pura sul dict `stato` del salvataggio: niente Flask, niente tempo reale, niente stato globale
(il caso arriva da un `rng` passato dal chiamante, quindi si prova con un seme). Le rotte e il salvataggio stanno in
app.py. I contenuti sono in `data/`: tratti.json, eventi_palestra.json, attrezzi.json, anagrafica.json.

Il tempo e' il campo `stato["giorno"]` (0 = lunedi' della prima settimana): passa solo quando il giocatore preme
"Avanti". Ogni giorno ogni allievo fa UNA cosa (il suo piano settimanale, un duello, un ordine di riposo...) e
`avanza_giorno` la risolve: punti di allenamento, stress, ferite, soldi, guarigione, eventi.

La crescita di rango costa ancora un Token (lo da' il livello, cioe' i duelli) MA richiede anche punti di maturazione
nella voce (si guadagnano allenandosi): il Token e' il permesso, l'allenamento la capacita'. La velocita' massima di
crescita resta quindi quella di prima, e la CPU "specchio" e il harness di bilanciamento non cambiano.

Ganci per l'Opzione B (OPZIONE_B_CIRCUITO.md): `GANCI_GIORNO` e `GANCI_SETTIMANA` (funzioni chiamate a ogni giorno e a
ogni settimana), `stato["mondo"]` (un dict riservato), `origine` / `nemici` / `registro` sul combattente, e
l'argomento `alla_settimana` di `avanza_giorno`."""
import datetime
import math
import random

import aspetto as asp
from engine import LOCAZIONI, STATS, SKILLS, costo_upgrade, carica

# ---------------------------------------------------------------- calendario
INIZIO = datetime.date(2030, 1, 7)      # lunedi': il giorno 0 della partita
GIORNI = ("Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica")
GIORNI_BREVI = ("Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom")
MESI = ("gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre",
        "ottobre", "novembre", "dicembre")


def data_gioco(giorno):
    return INIZIO + datetime.timedelta(days=int(giorno))


def giorno_settimana(giorno):
    """0 = lunedi' ... 6 = domenica."""
    return int(giorno) % 7


def numero_settimana(giorno):
    return int(giorno) // 7 + 1


def descrivi_data(giorno):
    d = data_gioco(giorno)
    return f"{GIORNI[d.weekday()]} {d.day} {MESI[d.month - 1]} {d.year}"


def data_breve(giorno):
    d = data_gioco(giorno)
    return f"{GIORNI_BREVI[d.weekday()]} {d.day} {MESI[d.month - 1][:3]}"


# ---------------------------------------------------------------- regole (tutti i numeri da tarare stanno qui)
CAPIENZA_BASE = 4              # allievi che la palestra puo' ospitare (+2 col dormitorio)
PUNTI_BASE = 8                 # punti di maturazione per il rango 2; poi x2 e x4 come i Token (costo_upgrade): 8, 16, 32
FIDUCIA_INIZIALE = (40, 60)
SOGLIA_RIFIUTO = 25            # sotto questa fiducia rifiuta i duelli (se non e' Leale)
FIDUCIA_ALTA = 75              # sopra: +15% punti
STRESS_ALTO = 60               # sopra: gli infortuni aumentano
STRESS_CROLLO = 100            # a 100 si crolla: un giorno di riposo forzato
STRESS_NATURALE = -3           # ogni giorno di lavoro lo stress cala comunque un poco
RIGEN_GIORNO = 20              # hp per locazione al giorno, da coscienti
RIGEN_COMA_GIORNO = 10         # ...e in coma: uscirne richiede settimane
MOLT_RIPOSO = 1.75             # il riposo cura di piu'
RITORNO_FIDUCIA = 0.15         # ogni settimana la fiducia torna del 15% verso 50: va curata
P_EVENTO_GIORNO = 0.28         # probabilita' che un giorno porti un evento di palestra
MAX_EVENTI = 2                 # eventi in attesa di risposta, al massimo
MAX_SALTI = 3                  # giornate che si possono chiudere di fila senza una serata sul ring: poi se ne gioca almeno una
P_RISSA_STRADA = 0.08
ETA_CALO = 34                  # da qui in poi si impara piu' piano e ci si fa male di piu'
ETA_RITIRO = 38                # da qui si propone il ritiro
ETA_ASPIRANTI = (19, 36)
SOGLIA_ADDIO = 10              # fiducia: per due settimane sotto questa soglia e se ne va
PIANO_BASE = ("palestra", "studio", "sparring", "palestra", "sparring", "controllo", "riposo")
LEGAME_AMICI = 40
LEGAME_RIVALI = -30
APPROCCI = ("incoraggia", "rimprovera", "ascolta")
P_UMANITA = 0.5                # un colloquio azzeccato (le parole giuste) ridona un punto di umanita' spesa con questa probabilita'
SOGLIA_GIUSTA = 5              # fiducia guadagnata da cui un colloquio conta come "le parole giuste"
GANCI_GIORNO = []              # (stato, db, rng, riepilogo): funzioni chiamate a fine di ogni giorno (Opzione B: il mondo)
GANCI_SETTIMANA = []           # ...e a fine di ogni settimana

# Le sessioni che si possono mettere nel piano. `punti` = punti di maturazione base; `stress` = variazione di stress
# (negativa = recupero); `inf` = probabilita' di farsi male; `danno` = hp persi; `rischio` = sotto questa frazione
# di hp (nella locazione messa peggio) il riposo automatico la sostituisce con il riposo.
SESSIONI = {
    "riposo":    {"nome": "Riposo", "sigla": "R", "voci": [], "punti": 0, "stress": -14, "inf": 0.0, "danno": (0, 0),
                  "rischio": 0.0, "desc": "Si riposa: gli hp tornano in fretta e lo stress cala."},
    "palestra":  {"nome": "Palestra", "sigla": "P", "voci": ["stat:fisico", "stat:riflessi"], "punti": 1.0, "stress": 4,
                  "inf": 0.03, "danno": (10, 20), "rischio": 0.4,
                  "desc": "Pesi, corda e sacco. Allena Fisico o Riflessi."},
    "studio":    {"nome": "Studio", "sigla": "S", "voci": ["stat:mente", "skill:tattica"], "punti": 1.0, "stress": 2,
                  "inf": 0.0, "danno": (0, 0), "rischio": 0.0,
                  "desc": "Filmati, appunti e lavagna. Allena Mente o Tattica, anche da feriti."},
    "sparring":  {"nome": "Sparring", "sigla": "X", "voci": ["skill:armi_corpo_a_corpo", "skill:armi_distanza", "skill:acrobatica"],
                  "punti": 2.0, "stress": 6, "inf": 0.20, "danno": (15, 30), "rischio": 0.6,
                  "desc": "Si combatte per finta: 2 punti a testa, ma ci si fa male. Serve un compagno."},
    "controllo": {"nome": "Controllo", "sigla": "C", "voci": ["stat:controllo", "potere"], "punti": 1.0, "stress": 6,
                  "inf": 0.10, "danno": (15, 25), "rischio": 0.5,
                  "desc": "Si lavora sui poteri. A volte una scarica brucia: allena Controllo o un potere."},
    "duro":      {"nome": "Allenamento duro", "sigla": "D", "voci": ["*"], "punti": 2.0, "stress": 12, "inf": 0.15,
                  "danno": (10, 25), "rischio": 0.7,
                  "desc": "Si spreme il fisico: 2 punti su qualsiasi voce, molto stress."},
    "strada":    {"nome": "Lavoro di strada", "sigla": "L", "voci": ["stat:sociale"], "punti": 0.5, "stress": 3,
                  "inf": 0.0, "danno": (0, 0), "rischio": 0.4, "soldi": 25,
                  "desc": "Lavoretti fuori, a fare soldi e conoscenze. Allena Sociale, ma non e' in palestra."},
}
ATTIVITA_SPECIALI = {"duello": "Sul ring", "salta": "Salta l'allenamento", "libero": "Giorno libero"}
SESSIONI_PIANO = ("riposo", "palestra", "studio", "sparring", "controllo", "duro", "strada")

TRATTI = {t["id"]: t for t in carica("tratti.json")}
EVENTI = {e["id"]: e for e in carica("eventi_palestra.json")}
ATTREZZI = {a["id"]: a for a in carica("attrezzi.json")}
ANAGRAFICA = carica("anagrafica.json") or {"mestieri": [], "quartieri": []}
INCOMPATIBILI = {frozenset(c) for c in (("pigro", "fanatico"), ("pigro", "disciplinato"), ("pigro", "ambizioso"),
                                         ("fragile", "veterano"), ("carismatico", "paranoico"))}


# ---------------------------------------------------------------- utilita'
def nome_breve(rec):
    return (rec.get("nome") or "?").split(" ")[0]


def sesso(rec):
    a = rec.get("aspetto")
    return a["sesso"] if isinstance(a, dict) and a.get("sesso") in ("M", "F") else asp.sesso_da_nome(rec.get("nome"))


def salute(rec):
    """morto | coma | ferito | pronto (stessa logica che prima stava in app.py)."""
    if rec.get("morto"):
        return "morto"
    if rec["hp"]["testa"] <= 0 or rec["hp"]["busto"] <= 0:
        return "coma"
    if any(rec["hp"][l] < LOCAZIONI[l] for l in LOCAZIONI):
        return "ferito"
    return "pronto"


def peggiore(rec):
    """La frazione di hp della locazione messa peggio (1 = tutto sano, <= 0 = fondo scala)."""
    return min(rec["hp"].get(l, mx) / mx for l, mx in LOCAZIONI.items())


def _lim(x, a, b):
    return a if x < a else b if x > b else x


def _tondo(x, n=2):
    return round(x + 0.0, n)


def stato_palestra(stato):
    """La sezione `palestra` del salvataggio, con i valori mancanti (e il giorno): idempotente, serve anche a migrare."""
    stato.setdefault("giorno", 0)
    stato.setdefault("mondo", {})              # gancio per l'Opzione B: crew, distretti, rivali...
    p = stato.setdefault("palestra", {})
    p.setdefault("attrezzi", [i for i, a in ATTREZZI.items() if a.get("iniziale")])
    p.setdefault("magazzino", [])
    p.setdefault("eventi", [])
    p.setdefault("prossimo_evento", 1)
    p.setdefault("registro", [])
    p.setdefault("ultimo_evento", {})
    p.setdefault("oggi", {"giorno": -1, "tiri": {}})
    p.setdefault("ex", [])
    p.setdefault("saltate", 0)                 # giornate chiuse di fila senza una serata (si azzera quando se ne gioca una)
    p.setdefault("serata_giorno", -1)          # l'ultimo giorno in cui si e' giocata una serata
    return p


def tutti(stato):
    return stato.get("personaggi", [])


def membri_attivi(stato):
    """Gli allievi: combattenti vivi (non gli istruttori, non i morti)."""
    return [c for c in tutti(stato) if not c.get("morto") and c.get("ruolo", "combattente") == "combattente"]


def istruttori(stato):
    return [c for c in tutti(stato) if not c.get("morto") and c.get("ruolo") == "istruttore"]


def caduti(stato):
    return [c for c in tutti(stato) if c.get("morto")]


def trova(stato, pid):
    return next((c for c in tutti(stato) if c.get("id") == pid), None)


def registra(stato, testo, pid=None, rec=None, **extra):
    """Una riga nel registro della palestra (e, se c'e' un combattente, nel suo). `extra` = campi tipizzati che il testo non
    dice (tipo="duello", esito="v"|"s", avv="Nome"...): servono a chi legge il registro con il codice (l'Opzione B, v. OPZIONE_B_CIRCUITO.md)."""
    g = stato.get("giorno", 0)
    r = stato_palestra(stato)["registro"]
    r.append({"g": g, "t": testo, "pid": pid if pid is not None else (rec or {}).get("id"), **extra})
    del r[:-80]
    if rec is not None:
        rr = rec.setdefault("registro", [])
        rr.append({"g": g, "t": testo, **extra})
        del rr[:-60]


# ---------------------------------------------------------------- eta' e anagrafica
def _nascita(rec):
    try:
        g, m, a = (int(x) for x in str(rec.get("data_nascita", "")).split("/"))
        return datetime.date(a, m, g)
    except (ValueError, TypeError):
        return None


def eta(rec, giorno):
    n = _nascita(rec)
    if n is None:
        return 25
    d = data_gioco(giorno)
    return d.year - n.year - ((d.month, d.day) < (n.month, n.day))


def data_nascita_per_eta(anni, giorno, rng=random):
    """Una data di nascita (GG/MM/AAAA) che a `giorno` fa avere esattamente `anni` anni."""
    d = data_gioco(giorno)
    n = d - datetime.timedelta(days=int(365.2425 * anni) + rng.randint(0, 364))
    n = n.replace(day=min(n.day, 28))                    # mai un 29 febbraio: il compleanno cade ogni anno
    for _ in range(3):                                   # i bisestili spostano di un giorno: si corregge
        diff = d.year - n.year - ((d.month, d.day) < (n.month, n.day)) - anni
        if diff == 0:
            break
        n = n.replace(year=n.year + diff)
    return f"{n.day:02d}/{n.month:02d}/{n.year}"


def compleanno_oggi(rec, giorno):
    n = _nascita(rec)
    d = data_gioco(giorno)
    return n is not None and (n.month, n.day) == (d.month, d.day) and eta(rec, giorno) > 0


# ---------------------------------------------------------------- tratti
def tratti_di(rec):
    return [TRATTI[t] for t in rec.get("tratti", []) if t in TRATTI]


def ha_tratto(rec, tid):
    return tid in rec.get("tratti", [])


def moltiplicatore(rec, chiave):
    v = 1.0
    for t in tratti_di(rec):
        v *= t["mod"].get(chiave, 1.0)
    return v


def somma_mod(rec, chiave):
    return sum(t["mod"].get(chiave, 0) for t in tratti_di(rec))


def tratti_visibili(rec):
    return tratti_di(rec)[:rec.get("tratti_noti", 0)]


def tira_tratti(rng=random, n=2):
    ids = list(TRATTI)
    for _ in range(50):
        scelti = []
        while len(scelti) < n:
            i = rng.choices(ids, weights=[TRATTI[x].get("peso", 1.0) for x in ids])[0]
            if i not in scelti:
                scelti.append(i)
        if not any(frozenset((a, b)) in INCOMPATIBILI for a in scelti for b in scelti if a != b):
            return scelti
    return scelti


def _bio_base(rec, rng):
    m = rng.choice(ANAGRAFICA["mestieri"]) if ANAGRAFICA["mestieri"] else {"m": "Lottatore", "f": "Lottatrice"}
    q = rng.choice(ANAGRAFICA["quartieri"]) if ANAGRAFICA["quartieri"] else {"id": None, "nome": "la città", "di": "della città"}
    return f"{m[sesso(rec).lower()]} {q.get('di', 'di ' + q['nome'])}.", q["id"]


def bio_completa(rec):
    """La bio che si vede: quella di base piu' una frase per ogni tratto gia' scoperto."""
    frasi = [t.get("bio", "") for t in tratti_visibili(rec)]
    return " ".join(x for x in [rec.get("bio", "")] + frasi if x).strip()


# ---------------------------------------------------------------- il combattente della palestra
def completa_record(rec, stato, rng=random, nuovo=False):
    """Porta un record (di un aspirante o di un salvataggio vecchio) al formato della Palestra: aggiunge solo cio' che
    manca. `nuovo` = un aspirante appena generato: eta' e prezzo si calcolano adesso, e del secondo tratto si conosce solo
    il primo."""
    g = stato.get("giorno", 0)
    if nuovo:
        rec["data_nascita"] = data_nascita_per_eta(rng.randint(*ETA_ASPIRANTI), g, rng)
    rec.setdefault("ruolo", "combattente")
    if "tratti" not in rec:
        rec["tratti"] = tira_tratti(rng)
        rec["tratti_noti"] = 1 if nuovo else len(rec["tratti"])
    rec.setdefault("tratti_noti", len(rec["tratti"]))
    if nuovo and "tempra" not in rec:
        rec["toughness"] = rec.get("toughness", 0) + int(somma_mod(rec, "tempra"))
        rec["tempra"] = True
    rec.setdefault("fiducia", rng.randint(*FIDUCIA_INIZIALE))
    rec.setdefault("stress", 0)
    rec.setdefault("piano", list(PIANO_BASE))
    rec.setdefault("focus", {})
    rec.setdefault("allenamento", {})
    rec.setdefault("legami", {})
    rec.setdefault("registro", [])
    rec.setdefault("auto_riposo", True)
    rec.setdefault("riposo_giorni", 0)
    rec.setdefault("ultimo_duello", None)
    rec.setdefault("duelli_sett", 0)
    rec.setdefault("colloquio_sett", 0)
    rec.setdefault("settimane_sfiducia", 0)
    rec.setdefault("ingaggio", g)
    rec.setdefault("nemici", [])                       # gancio per l'Opzione B (vendette)
    if not rec.get("bio") or "origine" not in rec:
        bio, origine = _bio_base(rec, rng)
        if not rec.get("bio"):
            rec["bio"] = bio
        rec.setdefault("origine", origine)             # gancio per l'Opzione B: l'id del distretto
    if "costo" in rec and nuovo:
        m = 1.0
        for t in tratti_di(rec):
            m *= t.get("prezzo", 1.0)
        rec["costo"] = int(round(rec["costo"] * m / 5.0)) * 5
    # un piano con voci sconosciute (dati vecchi o a mano) non deve rompere la giornata
    rec["piano"] = [(p if p in SESSIONI else "riposo") for p in (list(rec["piano"]) + list(PIANO_BASE))[:7]]
    return rec


def migra_stato(stato, rng=random):
    """Porta un salvataggio qualsiasi al formato della Palestra. Ritorna True se ha cambiato qualcosa."""
    prima = repr(sorted(stato.keys()))
    stato_palestra(stato)
    cambiato = prima != repr(sorted(stato.keys()))
    for c in tutti(stato):
        if "piano" not in c or "tratti" not in c or "fiducia" not in c:
            completa_record(c, stato, rng)
            cambiato = True
    for c in stato.get("contratti", []):
        if "tratti" not in c:
            completa_record(c, stato, rng, nuovo=True)
            cambiato = True
    return cambiato


# ---------------------------------------------------------------- voci allenabili
def chiave_voce(tipo, nome):
    return f"{tipo}:{nome}"


def spezza(chiave):
    tipo, _, nome = chiave.partition(":")
    return tipo, nome


def rango_voce(rec, chiave):
    tipo, nome = spezza(chiave)
    if tipo == "stat":
        return rec["stats"].get(nome, 1)
    if tipo == "skill":
        return rec["skills"].get(nome, 1)
    if tipo == "potere":
        return next((p["rango"] for p in rec.get("poteri", []) if str(p["id"]) == nome), None)
    return None


def nome_voce(chiave, db=None):
    tipo, nome = spezza(chiave)
    if tipo == "potere":
        p = next((x for x in (db or {}).get("poteri", []) if str(x["id"]) == nome), None)
        return p["nome"] if p else f"Potere {nome}"
    return nome.replace("_", " ").capitalize()


def punti_per_rango(rango):
    """Punti di maturazione per salire dal rango `rango` al successivo (8, 16, 32)."""
    return PUNTI_BASE * costo_upgrade(max(1, rango))


def punti_voce(rec, chiave):
    return rec.get("allenamento", {}).get(chiave, 0.0)


def punti_richiesti(rec, chiave):
    r = rango_voce(rec, chiave)
    return None if r is None or r >= 4 else punti_per_rango(r)


def maturo(rec, chiave):
    req = punti_richiesti(rec, chiave)
    return req is not None and punti_voce(rec, chiave) >= req - 1e-9


def consuma_punti(rec, chiave, rango_prima):
    """Il rango e' salito: i punti della voce si azzerano (gli eccessi non esistono, sono tetto)."""
    rec.setdefault("allenamento", {})[chiave] = 0.0


def tutte_le_voci(rec):
    return (["stat:" + s for s in STATS] + ["skill:" + s for s in SKILLS]
            + ["potere:%s" % p["id"] for p in rec.get("poteri", [])])


def voci_sessione(rec, sessione):
    """Le voci che questa sessione puo' allenare per questo combattente."""
    out = []
    for v in SESSIONI[sessione]["voci"]:
        if v == "*":
            out += tutte_le_voci(rec)
        elif v == "potere":
            out += ["potere:%s" % p["id"] for p in rec.get("poteri", [])]
        elif v.startswith("skill:") and v[6:] not in SKILLS:
            continue
        else:
            out.append(v)
    return out


def voce_attiva(rec, sessione):
    """La voce che la sessione allena davvero: quella di `focus` se e' ancora allenabile, altrimenti la prima libera."""
    voci = voci_sessione(rec, sessione)
    libere = [v for v in voci if (rango_voce(rec, v) or 4) < 4]
    f = rec.get("focus", {}).get(sessione)
    if f in libere:
        return f
    return libere[0] if libere else None


def opzioni_focus(rec, db=None):
    """Per l'interfaccia: per ogni sessione con voci, le voci scelte e il loro stato di maturazione."""
    out = {}
    for sid in SESSIONI_PIANO:
        if not SESSIONI[sid]["voci"]:
            continue
        out[sid] = {"scelta": voce_attiva(rec, sid), "voci": [
            {"chiave": v, "nome": nome_voce(v, db), "rango": rango_voce(rec, v), "punti": _tondo(punti_voce(rec, v), 1),
             "richiesti": punti_richiesti(rec, v), "pieno": (rango_voce(rec, v) or 0) >= 4, "maturo": maturo(rec, v)}
            for v in voci_sessione(rec, sid)]}
    return out


def aggiungi_punti(rec, chiave, n):
    """Aggiunge punti a una voce (tetto = quelli che servono per il rango dopo). Ritorna i punti entrati davvero."""
    req = punti_richiesti(rec, chiave)
    if req is None or n <= 0:
        return 0.0
    al = rec.setdefault("allenamento", {})
    prima = al.get(chiave, 0.0)
    al[chiave] = _tondo(min(req, prima + n))
    return _tondo(al[chiave] - prima)


# ---------------------------------------------------------------- attrezzi, capienza e magazzino
def attrezzi_posseduti(stato):
    return [i for i in stato_palestra(stato)["attrezzi"] if i in ATTREZZI]


def ha_attrezzo(stato, aid):
    return aid in stato_palestra(stato)["attrezzi"]


def capienza(stato):
    return CAPIENZA_BASE + sum(ATTREZZI[a].get("capienza", 0) for a in attrezzi_posseduti(stato))


def posti_liberi(stato):
    return capienza(stato) - len(membri_attivi(stato))


def compra_attrezzo(stato, aid):
    """Ritorna (ok, messaggio). Scala i crediti."""
    a = ATTREZZI.get(aid)
    if a is None:
        return False, "Attrezzo sconosciuto."
    if ha_attrezzo(stato, aid):
        return False, f"{a['nome']} è già in palestra."
    if stato["crediti"] < a["prezzo"]:
        return False, "Crediti insufficienti."
    stato["crediti"] -= a["prezzo"]
    stato_palestra(stato)["attrezzi"].append(aid)
    registra(stato, f"Arriva in palestra: {a['nome']}.")
    return True, f"{a['nome']} montato in palestra."


def deposita(stato, categoria, iid):
    stato_palestra(stato)["magazzino"].append({"cat": categoria, "id": iid})


def riprendi(stato, indice):
    """Toglie dal magazzino l'oggetto in posizione `indice` e lo ritorna ({'cat','id'}) o None."""
    m = stato_palestra(stato)["magazzino"]
    return m.pop(indice) if 0 <= indice < len(m) else None


def svuota_equip(stato, rec, tutto=False):
    """Mette nel magazzino l'equipaggiamento del combattente: armi e armatura sempre; con `tutto` (morto) anche protesi
    e augment, che per un vivo restano sul suo corpo."""
    for iid in rec.get("armi", rec.get("equip", [])) or []:
        deposita(stato, "arma", iid)
    rec["armi"] = []
    rec.pop("equip", None)
    if rec.get("armatura_equip"):
        deposita(stato, "armatura", rec["armatura_equip"])
    rec["armatura_equip"] = None
    if tutto:
        for iid in rec.get("protesi", []):
            deposita(stato, "protesi", iid)
        for iid in rec.get("augments", []):
            deposita(stato, "augment", iid)
        rec["protesi"], rec["augments"] = [], []


# ---------------------------------------------------------------- legami
def legame(a, b):
    return a.get("legami", {}).get(str(b.get("id")), 0)


def cambia_legame(a, b, delta):
    """Il legame e' simmetrico, tra -100 e 100."""
    for x, y in ((a, b), (b, a)):
        d = x.setdefault("legami", {})
        d[str(y["id"])] = int(_lim(d.get(str(y["id"]), 0) + delta, -100, 100))


def amici_di(stato, rec):
    return [c for c in membri_attivi(stato) if c is not rec and legame(rec, c) >= LEGAME_AMICI]


def cambia_fiducia(rec, delta):
    rec["fiducia"] = int(_lim(round(rec.get("fiducia", 50) + delta), 0, 100))


def cambia_stress(rec, delta):
    rec["stress"] = int(_lim(round(rec.get("stress", 0) + delta), 0, 100))


# ---------------------------------------------------------------- la giornata di un allievo
def _tiro(stato, pid, rng):
    o = stato_palestra(stato)["oggi"]
    if o.get("giorno") != stato["giorno"]:
        o["giorno"], o["tiri"] = stato["giorno"], {}
    k = str(pid)
    if k not in o["tiri"]:
        o["tiri"][k] = (rng or random).random()
    return o["tiri"][k]


def prob_salta(rec):
    p = max([t["mod"].get("salta", 0.0) for t in tratti_di(rec)] or [0.0])
    if rec.get("fiducia", 50) < SOGLIA_RIFIUTO:
        p += 0.3
    return min(p, 0.8)


def soglia_rifiuto(rec):
    return min([t["mod"]["rifiuto"] for t in tratti_di(rec) if "rifiuto" in t["mod"]] or [SOGLIA_RIFIUTO])


def vuole_combattere(rec):
    """Un combattente con poca fiducia rifiuta i duelli (a meno di un tratto che lo impedisce, come Leale)."""
    return rec.get("fiducia", 50) >= soglia_rifiuto(rec)


def puo_combattere(stato, rec):
    """(ok, motivo) per mandarlo sul ring oggi."""
    if rec.get("ruolo", "combattente") != "combattente" or rec.get("morto"):
        return False, "non può combattere"
    if salute(rec) not in ("pronto", "ferito"):
        return False, "è in coma"
    if rec.get("ultimo_duello") == stato["giorno"]:
        return False, "ha già combattuto oggi"
    if not vuole_combattere(rec):
        return False, "non si fida abbastanza di te per salire sul ring"
    return True, ""


# ---------------------------------------------------------------- le serate: al massimo tre giornate di fila senza
def serata_possibile(stato):
    """Qualcuno puo' salire sul ring oggi? Se nessuno puo' (feriti, in coma, sfiduciati) saltare non e' una scelta."""
    return any(puo_combattere(stato, c)[0] for c in membri_attivi(stato))


def serate(stato):
    """Il conto delle serate saltate, per l'interfaccia: {saltate, max, fatta_oggi, possibile, bloccato}. `bloccato`: la giornata
    non si puo' chiudere finche' non si gioca una serata."""
    p = stato_palestra(stato)
    fatta = p["serata_giorno"] == stato["giorno"]
    possibile = serata_possibile(stato)
    n = min(p["saltate"], MAX_SALTI)
    return {"saltate": n, "max": MAX_SALTI, "fatta_oggi": fatta, "possibile": possibile, "bloccato": not fatta and possibile and n >= MAX_SALTI}


def registra_serata(stato):
    """Si e' avviata una serata: oggi non conta come giornata saltata e il conto riparte da zero."""
    p = stato_palestra(stato)
    p["serata_giorno"] = stato["giorno"]
    p["saltate"] = 0


def puo_chiudere_giornata(stato):
    """(ok, motivo): dopo tre giornate chiuse senza una serata, la prossima si gioca."""
    if serate(stato)["bloccato"]:
        return False, f"Hai chiuso {MAX_SALTI} giornate senza una serata: oggi qualcuno sale sul ring."
    return True, ""


def assegnazione(stato, rec, rng=None):
    """Cosa fa oggi questo allievo. Deterministico (il caso della pigrizia e' tirato una volta per giorno e conservato)."""
    g = stato["giorno"]
    wd = g % 7
    a = {"pid": rec["id"], "pianificata": rec["piano"][wd], "attivita": None, "voce": None, "partner": None,
         "motivo": None, "fuori": False}
    if rec.get("ultimo_duello") == g:
        a.update(attivita="duello", fuori=True)
        return a
    s = salute(rec)
    pian = a["pianificata"]
    if s == "coma":
        a.update(attivita="riposo", motivo="coma")
    elif rec.get("riposo_giorni", 0) > 0:
        a.update(attivita="riposo", motivo="ordine")
    elif rec.get("stress", 0) >= STRESS_CROLLO:
        a.update(attivita="riposo", motivo="crollo")
    else:
        sess = SESSIONI[pian]
        rischio_alto = pian != "riposo" and (peggiore(rec) < sess["rischio"] or (sess["rischio"] > 0 and rec.get("crippled")))
        if rischio_alto and rec.get("auto_riposo", True) and not somma_mod(rec, "ignora_riposo"):
            a.update(attivita="riposo", motivo="ferito")
        elif pian != "riposo" and _tiro(stato, rec["id"], rng) < prob_salta(rec):
            a.update(attivita="salta", motivo="svogliato")
        else:
            a["attivita"] = pian
            if rischio_alto:
                a["motivo"] = "rischio"            # si allena lo stesso, ferito: piu' infortuni
    if a["attivita"] in SESSIONI and SESSIONI[a["attivita"]]["voci"]:
        a["voce"] = voce_attiva(rec, a["attivita"])
    a["fuori"] = a["attivita"] == "strada"
    return a


def assegnazioni(stato, rng=None):
    """pid -> assegnazione, per tutti gli allievi; con i compagni di sparring appaiati."""
    for c in membri_attivi(stato):
        if "piano" not in c or "fiducia" not in c:        # un record arrivato senza passare dagli aspiranti
            completa_record(c, stato)
    out = {c["id"]: assegnazione(stato, c, rng) for c in membri_attivi(stato)}
    libere = sorted(pid for pid, a in out.items() if a["attivita"] == "sparring")
    usati = set()
    for pid in libere:
        if pid in usati:
            continue
        rec = trova(stato, pid)
        candidati = [q for q in libere if q != pid and q not in usati]
        if not candidati:
            continue
        migliore = max(candidati, key=lambda q: (legame(rec, trova(stato, q)), -q))
        out[pid]["partner"], out[migliore]["partner"] = migliore, pid
        usati.update((pid, migliore))
    return out


# ---------------------------------------------------------------- risoluzione di un giorno
def forza(rec):
    """Come engine.valuta(), sul record: statistiche x3, skill x1, poteri x2."""
    return (3 * sum(rec["stats"].values()) + sum(rec["skills"].values())
            + 2 * sum(p["rango"] for p in rec.get("poteri", [])))


def punti_sessione(stato, rec, att, voce, partner=None):
    base = SESSIONI[att]["punti"]
    if att == "sparring" and partner is None:
        base = 1.0 if ha_attrezzo(stato, "manichino") else 0.5
    m = moltiplicatore(rec, "punti")
    f = rec.get("fiducia", 50)
    if f >= FIDUCIA_ALTA:
        m *= 1.15
    elif f < SOGLIA_RIFIUTO:
        m *= 0.7
    anni = eta(rec, stato["giorno"])
    if anni >= ETA_RITIRO:
        m *= 0.6
    elif anni >= ETA_CALO:
        m *= 0.75
    for aid in attrezzi_posseduti(stato):
        b = ATTREZZI[aid].get("bonus")
        if b and b["sessione"] == att and b.get("voce", voce) == voce:
            m *= b["punti"]
    extra = 0.0
    if partner is not None:
        extra += somma_mod(partner, "compagni")
        if legame(rec, partner) >= LEGAME_AMICI:
            m *= 1.1
        elif legame(rec, partner) <= LEGAME_RIVALI:
            extra += 0.5                          # la rivalita' spinge, ma fa male (v. prob_infortunio)
    for i in istruttori(stato):
        if i.get("voce_istruttore") == voce:
            extra += 0.5
    return _tondo(base * m + extra)


def stress_sessione(rec, att):
    s = SESSIONI[att]["stress"] if att in SESSIONI else 0
    if s > 0:
        s *= moltiplicatore(rec, "stress")
        if att == "strada":
            s *= moltiplicatore(rec, "strada_stress")
    elif s < 0:
        s *= moltiplicatore(rec, "riposo")
    if att != "riposo":
        s += STRESS_NATURALE
    return s


def prob_infortunio(stato, rec, att, partner=None, rischio=False):
    sess = SESSIONI.get(att)
    if not sess:
        return 0.0
    p = sess["inf"]
    if att == "sparring" and partner is None:
        p = 0.0 if ha_attrezzo(stato, "manichino") else 0.05
    if sess["inf"] and any(ATTREZZI[a].get("sicuro") == att for a in attrezzi_posseduti(stato)):
        p = 0.0
    p *= moltiplicatore(rec, "infortunio")
    st = rec.get("stress", 0)
    if st > STRESS_ALTO:
        p *= 1 + (st - STRESS_ALTO) / 40 * 0.5
    if eta(rec, stato["giorno"]) >= ETA_CALO:
        p *= 1.25
    if rischio:
        p *= 1.5
    if partner is not None:
        l = legame(rec, partner)
        p *= 0.8 if l >= LEGAME_AMICI else 1.5 if l <= LEGAME_RIVALI else 1.0
    return _lim(p, 0.0, 0.6)


def locazioni_ferite_ok(rec, db=None):
    """Locazioni dove un infortunio d'allenamento puo' cadere: non la testa, non una protesi."""
    protesi = {pr["locazione"] for pr in (db or {}).get("protesi", []) if pr["id"] in rec.get("protesi", [])}
    return [l for l in ("braccio_sx", "braccio_dx", "gamba_sx", "gamba_dx", "busto") if l not in protesi]


def ferisci(rec, rng, lo, hi, db=None):
    """Un infortunio d'allenamento: mai sotto 1 hp (dall'allenamento non si va in coma). Ritorna {'loc','hp'} o None."""
    locs = locazioni_ferite_ok(rec, db)
    if not locs:
        return None
    loc = rng.choices(locs, weights=[1 if l == "busto" else 3 for l in locs])[0]
    dmg = rng.randint(lo, hi)
    persi = max(0, min(dmg, rec["hp"][loc] - 1))
    rec["hp"][loc] -= persi
    return {"loc": loc, "hp": persi} if persi else None


def cura(rec, n):
    """Rende fino a `n` hp a ogni locazione (mai oltre il massimo). Ritorna gli hp rientrati in tutto."""
    tot = 0
    for l, mx in LOCAZIONI.items():
        nuovo = min(mx, rec["hp"][l] + n)
        tot += max(0, nuovo - rec["hp"][l])
        rec["hp"][l] = max(rec["hp"][l], nuovo)
    rec["crippled"] = [l for l in rec.get("crippled", []) if rec["hp"][l] < LOCAZIONI[l]]
    return tot


def recupero(stato, rec, att):
    """La guarigione di un giorno. Ritorna gli hp rientrati in tutto."""
    base = RIGEN_COMA_GIORNO if salute(rec) == "coma" else RIGEN_GIORNO
    if att == "riposo":
        base *= MOLT_RIPOSO
        for aid in attrezzi_posseduti(stato):
            base *= ATTREZZI[aid].get("riposo", 1.0)
    base *= 1 + rec.get("toughness", 0) / 100
    n = int(round(base))
    return cura(rec, n) if n > 0 else 0


def _esito_sparring(a, b, rng):
    """Chi domina uno sparring: logistica sulla differenza di forza, come le quote."""
    p = 1 / (1 + math.exp(-0.036 * (forza(a) - forza(b))))
    return a if rng.random() < p else b


def _nome_loc(l):
    return l.replace("_", " ")


def avanza_giorno(stato, db=None, rng=random, alla_settimana=None):
    """Risolve la giornata di oggi e passa alla successiva. Ritorna il riepilogo per l'interfaccia:
    {giorno, data, membri:[{pid,nome,attivita,...}], righe:[...], eventi_nuovi:[id], settimana_chiusa: bool}."""
    stato_palestra(stato)
    g = stato["giorno"]
    if stato["palestra"]["serata_giorno"] != g and serata_possibile(stato):      # una giornata chiusa senza serata, potendola fare
        stato["palestra"]["saltate"] += 1
    primo_evento = stato["palestra"]["prossimo_evento"]
    ass = assegnazioni(stato, rng)
    attivi = membri_attivi(stato)
    rie = {"giorno": g, "data": descrivi_data(g), "membri": [], "righe": [], "eventi_nuovi": [], "settimana_chiusa": False,
           "partenze": []}

    # gli sparring appaiati si decidono una volta sola per coppia
    dominati = {}
    for pid, a in ass.items():
        q = a["partner"]
        if q is not None and pid < q:
            r1, r2 = trova(stato, pid), trova(stato, q)
            w = _esito_sparring(r1, r2, rng)
            dominati[pid] = dominati[q] = w["id"]

    for rec in attivi:
        a = ass[rec["id"]]
        att = a["attivita"]
        partner = trova(stato, a["partner"]) if a["partner"] is not None else None
        r = {"pid": rec["id"], "nome": rec["nome"], "attivita": att, "voce": a["voce"], "voce_nome": None, "motivo": a["motivo"],
             "partner": a["partner"], "punti": 0.0, "stress": 0, "ferita": None, "crediti": 0, "curato": 0, "maturo": False,
             "testo": ""}
        nb = nome_breve(rec)
        s = SESSIONI.get(att)
        if att == "duello":
            r["testo"] = f"{nb} ha combattuto stasera."
        elif att == "salta":
            r["testo"] = f"{nb} salta l'allenamento: non ne ha voglia."
        elif att == "riposo":
            why = {"coma": "è in coma", "ordine": "per ordine tuo", "crollo": "è crollato dalla stanchezza", "ferito": "è troppo malconcio"}.get(a["motivo"], "")
            r["testo"] = f"{nb} riposa" + (f" ({why})." if why else ".")
            if a["motivo"] == "ordine":
                rec["riposo_giorni"] = max(0, rec.get("riposo_giorni", 0) - 1)
            if a["motivo"] == "crollo":
                cambia_fiducia(rec, -5)
        else:
            voce = a["voce"]
            if voce is None and s["voci"]:
                r["testo"] = f"{nb} si allena, ma qui non ha più nulla da imparare."
            else:
                pts = punti_sessione(stato, rec, att, voce, partner) if s["punti"] else 0.0
                if pts and voce:
                    entrati = aggiungi_punti(rec, voce, pts)
                    r["punti"] = entrati
                    r["voce_nome"] = nome_voce(voce, db)
                    if entrati and maturo(rec, voce) and punti_voce(rec, voce) - entrati < punti_richiesti(rec, voce) - 1e-9:
                        r["maturo"] = True
                        rie["righe"].append(f"{nb} è maturo in {r['voce_nome']}: servirà un Token per salire di rango.")
                        registra(stato, f"{nb} ha maturato {r['voce_nome']}.", rec=rec)
                r["testo"] = f"{nb}: {s['nome'].lower()}" + (f" ({r['voce_nome']} +{str(r['punti']).replace('.', ',')})" if r["voce_nome"] else "") + "."
            if att == "strada":
                euro = int(round(s["soldi"] * moltiplicatore(rec, "strada") * rng.uniform(0.6, 1.4)))
                stato["crediti"] += euro
                r["crediti"] = euro
                if rng.random() < P_RISSA_STRADA:
                    _crea_evento(stato, "rissa_strada", a=rec)
            inf = prob_infortunio(stato, rec, att, partner, rischio=a["motivo"] == "rischio")
            if inf and rng.random() < inf:
                lo, hi = s["danno"]
                f = ferisci(rec, rng, lo, hi, db)
                if f:
                    r["ferita"] = f
                    r["testo"] += f" Si fa male: {_nome_loc(f['loc'])} −{f['hp']} hp."
                    registra(stato, f"{nb} si fa male in allenamento ({_nome_loc(f['loc'])} −{f['hp']}).", rec=rec)
            if att == "sparring" and partner is not None and pid_gt(rec, partner):      # (lo racconta uno solo dei due)
                cambia_legame(rec, partner, int(round(3 * moltiplicatore(rec, "legame") * moltiplicatore(partner, "legame"))))
                if dominati.get(rec["id"]) is not None:
                    vinc = trova(stato, dominati[rec["id"]])
                    perd = partner if vinc is rec else rec
                    rie["righe"].append(f"{nome_breve(vinc)} ha la meglio su {nome_breve(perd)} nello sparring.")
                    if somma_mod(perd, "rancore"):
                        cambia_legame(perd, vinc, -6)
                        cambia_fiducia(perd, -3)
                        registra(stato, f"{nome_breve(perd)} non ha digerito lo sparring perso con {nome_breve(vinc)}.", rec=perd)
        # stress, guarigione
        d_stress = stress_sessione(rec, att) if att in SESSIONI else (-3 if att == "salta" else 0)
        if att == "duello":
            d_stress = STRESS_NATURALE
        antes = rec.get("stress", 0)
        cambia_stress(rec, d_stress)
        r["stress"] = rec["stress"] - antes
        if rec["stress"] >= 85:
            cambia_fiducia(rec, -2)
        r["curato"] = recupero(stato, rec, "riposo" if att == "riposo" else "attivo")
        rie["membri"].append(r)

    # compleanni
    for rec in attivi:
        if compleanno_oggi(rec, g):
            _crea_evento(stato, "compleanno", a=rec)

    stato["giorno"] = g + 1
    stato_palestra(stato)["oggi"] = {"giorno": stato["giorno"], "tiri": {}}

    # eventi casuali
    if len(stato["palestra"]["eventi"]) < MAX_EVENTI and rng.random() < P_EVENTO_GIORNO:
        _crea_evento_casuale(stato, rng)
    rie["eventi_nuovi"] = [e["id"] for e in stato["palestra"]["eventi"] if e["id"] >= primo_evento]

    if stato["giorno"] % 7 == 0:
        rie["settimana_chiusa"] = True
        _chiudi_settimana(stato, db, rng, rie)
        if alla_settimana is not None:
            alla_settimana(stato)
        for f in GANCI_SETTIMANA:
            f(stato, db, rng, rie)
    for f in GANCI_GIORNO:
        f(stato, db, rng, rie)
    return rie


def pid_gt(a, b):
    """Per non annunciare due volte lo stesso sparring: lo racconta solo il combattente con l'id piu' basso."""
    return a["id"] < b["id"]


def _chiudi_settimana(stato, db, rng, rie):
    g = stato["giorno"]
    for rec in list(membri_attivi(stato)):
        nb = nome_breve(rec)
        if rec.get("tratti_noti", 0) < len(rec.get("tratti", [])) and g - rec.get("ingaggio", 0) >= 7:
            rec["tratti_noti"] += 1
            t = tratti_visibili(rec)[-1]
            rie["righe"].append(f"Dopo una settimana capisci com'è fatto {nb}: {t['nome']}.")
            registra(stato, f"Scoperto un tratto di {nb}: {t['nome']}.", rec=rec)
        f = rec.get("fiducia", 50)
        delta = (50 - f) * RITORNO_FIDUCIA + somma_mod(rec, "fiducia_settimana")
        if rec.get("duelli_sett", 0) == 0:
            delta += somma_mod(rec, "fiducia_senza_duello")
        cambia_fiducia(rec, delta)
        rec["duelli_sett"] = 0
        if rec["fiducia"] < SOGLIA_ADDIO:
            rec["settimane_sfiducia"] = rec.get("settimane_sfiducia", 0) + 1
            if rec["settimane_sfiducia"] >= 2:
                rie["partenze"].append(nb)
                rie["righe"].append(f"{nb} non si fida più di te e lascia la palestra.")
                congeda(stato, rec, "sfiducia")
                continue
        else:
            rec["settimane_sfiducia"] = 0
        if (eta(rec, g) >= ETA_RITIRO and g >= rec.get("ritiro_dopo", 0)
                and not any(e["tipo"] == "ritiro" and e["a"] == rec["id"] for e in stato["palestra"]["eventi"])):
            _crea_evento(stato, "ritiro", a=rec)
    rie["righe"].append(f"Si chiude la settimana {numero_settimana(g - 1)}.")


# ---------------------------------------------------------------- partenze, ritiro, morte
def congeda(stato, rec, motivo="congedo"):
    """L'allievo lascia la palestra (si porta via protesi e augment, lascia armi e armatura)."""
    svuota_equip(stato, rec)
    stato_palestra(stato)["ex"].append({"nome": rec["nome"], "giorno": stato["giorno"], "motivo": motivo})
    stato["personaggi"] = [c for c in stato["personaggi"] if c is not rec]
    for c in tutti(stato):
        c.get("legami", {}).pop(str(rec.get("id")), None)
    stato_palestra(stato)["eventi"] = [e for e in stato["palestra"]["eventi"] if rec.get("id") not in (e.get("a"), e.get("b"))]
    registra(stato, f"{rec['nome']} lascia la palestra ({motivo}).")


def miglior_voce(rec):
    return max(tutte_le_voci(rec), key=lambda k: (rango_voce(rec, k) or 0, 1 if k.startswith("stat:") else 0))


def fai_istruttore(stato, rec):
    """Il ritiro: smette di combattere e resta in palestra a insegnare la sua voce migliore."""
    svuota_equip(stato, rec)
    rec["ruolo"] = "istruttore"
    rec["voce_istruttore"] = miglior_voce(rec)
    registra(stato, f"{rec['nome']} si ritira dai ring: da oggi è un istruttore.", rec=rec)


def morte(stato, rec, rng=random):
    """Un allievo e' morto sul ring: l'equipaggiamento torna in magazzino, un amico eredita qualcosa, la palestra fa il lutto."""
    rec["morto"] = True
    rec["giorno_morte"] = stato["giorno"]
    stato_palestra(stato)["eventi"] = [e for e in stato["palestra"]["eventi"] if rec["id"] not in (e.get("a"), e.get("b"))]
    amici = amici_di(stato, rec)
    svuota_equip(stato, rec, tutto=True)
    registra(stato, f"✝ {rec['nome']} è morto sul ring.", rec=rec)
    if amici:
        erede = max(amici, key=lambda c: legame(rec, c))
        voce = miglior_voce(rec)
        entrati = aggiungi_punti(erede, voce, 2)
        if entrati:
            registra(stato, f"{nome_breve(erede)} eredita da {nome_breve(rec)} un po' di {nome_voce(voce)}.", rec=erede)
    if membri_attivi(stato):
        _crea_evento(stato, "lutto", extra={"m": rec["id"]})


def dopo_duello(stato, rec, vittoria, avversario="?", danni=0, rng=random):
    """Cio' che il ring lascia dentro l'allievo: fiducia, stress, un segno nel registro. Non tocca hp ne' XP (lo fa app)."""
    rec["ultimo_duello"] = stato["giorno"]
    rec["duelli_sett"] = rec.get("duelli_sett", 0) + 1
    if vittoria:
        cambia_fiducia(rec, 6 + somma_mod(rec, "fiducia_vittoria"))
        cambia_stress(rec, 8 * moltiplicatore(rec, "stress"))
    else:
        cambia_fiducia(rec, -6 + somma_mod(rec, "fiducia_sconfitta"))
        cambia_stress(rec, (12 + danni / 60.0) * moltiplicatore(rec, "stress"))
    registra(stato, f"{nome_breve(rec)} {'batte' if vittoria else 'perde con'} {avversario}.", rec=rec,
             tipo="duello", esito="v" if vittoria else "s", avv=avversario)


# ---------------------------------------------------------------- colloquio
def puo_parlare(stato, rec):
    return rec.get("colloquio_sett", 0) != numero_settimana(stato["giorno"])


def colloquio(stato, rec, approccio, rng=random, umanita_installata=0):
    """Parlare con un allievo, una volta a settimana. Ognuno ha una cosa che ama sentirsi dire e una che odia (i tratti):
    sbagliare costa fiducia, indovinare ne da' e fa capire com'e' fatto. Se azzecchi (le parole giuste) c'e' una probabilita' che
    recuperi un punto di umanita': ridona solo quelli spesi in protesi e augment (`umanita_installata`), mai oltre il massimo.
    Ritorna {ok, testo, fiducia, stress, rivelato, umanita}."""
    if approccio not in APPROCCI:
        return {"ok": False, "testo": "Non sai che dirgli."}
    if not puo_parlare(stato, rec):
        return {"ok": False, "testo": f"Hai già parlato con {nome_breve(rec)} questa settimana."}
    tr = tratti_di(rec)
    punteggi = []
    for t in tr:
        punteggi.append(8 if t.get("ama") == approccio else -8 if t.get("odia") == approccio else 2)
    delta = int(round(sum(punteggi) / max(1, len(punteggi))))
    d_stress = {"incoraggia": -3, "rimprovera": 4, "ascolta": -8}[approccio]
    rec["colloquio_sett"] = numero_settimana(stato["giorno"])
    cambia_fiducia(rec, delta)
    cambia_stress(rec, d_stress)
    # la reazione piu' forte tradisce un tratto: se era uno nascosto, lo si scopre
    rivelato = None
    if tr and rec.get("tratti_noti", 0) < len(tr):
        forti = [(abs(p), i) for i, p in enumerate(punteggi) if i >= rec["tratti_noti"] and abs(p) >= 8]
        if forti:
            rec["tratti_noti"] = max(rec["tratti_noti"], max(i for _, i in forti) + 1)
            rivelato = tratti_visibili(rec)[-1]
    nb = nome_breve(rec)
    umanita = 0
    if delta >= SOGLIA_GIUSTA and rec.get("umanita_recuperata", 0) < umanita_installata and rng.random() < P_UMANITA:
        rec["umanita_recuperata"] = rec.get("umanita_recuperata", 0) + 1
        umanita = 1
    if delta >= SOGLIA_GIUSTA:
        testo = f"{nb} si apre: le parole giuste, al momento giusto."
        if umanita:
            testo += f" Si sente un po' più umano: +1 umanità."
    elif delta >= 1:
        testo = f"{nb} annuisce. Non è sicur{'o' if sesso(rec) == 'M' else 'a'} di cosa pensare, ma ti ascolta."
    else:
        testo = f"{nb} si irrigidisce. Hai sbagliato tono."
    if rivelato:
        testo += f" Ora hai capito una cosa di {sesso_pron(rec)}: {rivelato['nome']}."
    registra(stato, f"Hai parlato con {nb} ({approccio}).", rec=rec)
    return {"ok": True, "testo": testo, "fiducia": delta, "stress": d_stress, "rivelato": rivelato["id"] if rivelato else None, "umanita": umanita}


def sesso_pron(rec):
    return "lui" if sesso(rec) == "M" else "lei"


# ---------------------------------------------------------------- eventi di palestra
def _req_ok(stato, rec, req, rif=None):
    """Il combattente rispetta i requisiti di un ruolo dell'evento? `rif` = il combattente del ruolo a (legami)."""
    g = stato["giorno"]
    if "tratto" in req and not ha_tratto(rec, req["tratto"]):
        return False
    if "tratto_o" in req and not any(ha_tratto(rec, t) for t in req["tratto_o"]):
        return False
    if "fiducia_min" in req and rec["fiducia"] < req["fiducia_min"]:
        return False
    if "fiducia_max" in req and rec["fiducia"] > req["fiducia_max"]:
        return False
    if "stress_min" in req and rec["stress"] < req["stress_min"]:
        return False
    if "eta_min" in req and eta(rec, g) < req["eta_min"]:
        return False
    if "giorni_min" in req and g - rec.get("ingaggio", 0) < req["giorni_min"]:
        return False
    if "vittorie_min" in req and rec.get("vittorie", 0) < req["vittorie_min"]:
        return False
    if req.get("ferito") and peggiore(rec) >= 0.85:
        return False
    if rif is not None and rif is not rec:
        l = legame(rif, rec)
        if "legame_min" in req and l < req["legame_min"]:
            return False
        if "legame_max" in req and l > req["legame_max"]:
            return False
    return True


def _in_attesa(stato):
    ids = set()
    for e in stato_palestra(stato)["eventi"]:
        ids.update(x for x in (e.get("a"), e.get("b")) if x is not None)
    return ids


def _crea_evento(stato, tipo, a=None, b=None, extra=None):
    p = stato_palestra(stato)
    ev = {"id": p["prossimo_evento"], "tipo": tipo, "giorno": stato["giorno"],
          "a": a["id"] if a else None, "b": b["id"] if b else None, "extra": dict(extra or {})}
    p["prossimo_evento"] += 1
    p["eventi"].append(ev)
    p["ultimo_evento"][tipo] = stato["giorno"]
    return ev


def _crea_evento_casuale(stato, rng):
    p = stato_palestra(stato)
    g = stato["giorno"]
    occupati = _in_attesa(stato)
    liberi = [c for c in membri_attivi(stato) if c["id"] not in occupati]
    if not membri_attivi(stato):
        return None
    scelte = []
    for ev in EVENTI.values():
        if ev.get("automatico") or g - p["ultimo_evento"].get(ev["id"], -999) < ev.get("cooldown", 7):
            continue
        rich = ev.get("richiede", {})
        if rich.get("attrezzo_regalabile") and not _regalabili(stato):
            continue
        ruoli = ev.get("ruoli", {})
        if not ruoli:
            scelte.append((ev.get("peso", 1.0), ev, None, None))
            continue
        for a in liberi:
            if not _req_ok(stato, a, ruoli.get("a", {})):
                continue
            w = ev.get("peso", 1.0)
            for tid, k in ev.get("peso_tratto", {}).items():
                if ha_tratto(a, tid):
                    w *= k
            if "b" not in ruoli:
                scelte.append((w, ev, a, None))
                continue
            for b in liberi:
                if b is not a and _req_ok(stato, b, ruoli["b"], rif=a):
                    scelte.append((w, ev, a, b))
    if not scelte:
        return None
    _, ev, a, b = rng.choices(scelte, weights=[s[0] for s in scelte])[0]
    extra = {}
    if ev.get("richiede", {}).get("attrezzo_regalabile"):
        extra["attrezzo"] = rng.choice(_regalabili(stato))
    return _crea_evento(stato, ev["id"], a=a, b=b, extra=extra)


def _regalabili(stato):
    return [i for i, a in ATTREZZI.items() if a.get("regalabile") and i not in stato_palestra(stato)["attrezzi"]]


class _Ctx(dict):
    def __missing__(self, k):
        return "?"


def _testo(stato, ev, txt):
    c = _Ctx()
    for r in ("a", "b"):
        rec = trova(stato, ev.get(r)) if ev.get(r) is not None else None
        if rec is not None:
            f = sesso(rec) == "F"
            c[r] = nome_breve(rec)
            c["eta_" + r] = eta(rec, stato["giorno"])
            c["o_" + r] = "a" if f else "o"
            c["lui_" + r] = "lei" if f else "lui"
    m = trova(stato, ev.get("extra", {}).get("m"))
    if m is not None:
        c["m"] = nome_breve(m)
    if ev.get("extra", {}).get("attrezzo") in ATTREZZI:
        c["attrezzo"] = ATTREZZI[ev["extra"]["attrezzo"]]["nome"].lower()
    return txt.format_map(c)


def descrivi_evento(stato, ev):
    d = EVENTI.get(ev["tipo"])
    if d is None:
        return None
    return {"id": ev["id"], "tipo": ev["tipo"], "titolo": d["titolo"], "testo": _testo(stato, ev, d["testo"]),
            "a": ev.get("a"), "b": ev.get("b"),
            "scelte": [{"id": s["id"], "testo": _testo(stato, ev, s["testo"]),
                        "ok": stato["crediti"] >= s.get("richiede_crediti", 0),
                        "motivo": "" if stato["crediti"] >= s.get("richiede_crediti", 0) else "crediti insufficienti"}
                       for s in d["scelte"]]}


def _bersagli(stato, ctx, chi):
    """I combattenti a cui si riferisce un effetto: a, b, tutti, altri (tutti tranne a), amici (del morto)."""
    if chi in ("a", "b"):
        return [ctx[chi]] if ctx.get(chi) is not None else []
    att = membri_attivi(stato)
    if chi == "tutti":
        return att
    if chi == "altri":
        return [c for c in att if c is not ctx.get("a")]
    if chi == "amici":
        m = ctx.get("m")
        return [c for c in att if m is not None and legame(m, c) >= LEGAME_AMICI]
    return []


def _fmt_delta(n):
    return f"+{n}" if n > 0 else f"−{abs(n)}"


def _applica(stato, db, ev, ctx, effetti, rng, righe, dopo):
    for e in effetti:
        if "caso" in e:
            _applica(stato, db, ev, ctx, e["allora"] if rng.random() < e["caso"] else e.get("altrimenti", []), rng, righe, dopo)
            continue
        if "testo" in e:
            righe.append(_testo(stato, ev, e["testo"]))
            continue
        if "crediti" in e:
            prima = stato["crediti"]
            stato["crediti"] = max(0, prima + e["crediti"])
            if stato["crediti"] != prima:
                righe.append(f"{_fmt_delta(stato['crediti'] - prima)}¤")
            continue
        if "legame" in e:
            ra, rb, d = e["legame"]
            if ctx.get(ra) is not None and ctx.get(rb) is not None:
                cambia_legame(ctx[ra], ctx[rb], d)
            continue
        if "attrezzo" in e:
            aid = ev.get("extra", {}).get("attrezzo") if e["attrezzo"] == "regalabile" else e["attrezzo"]
            if aid in ATTREZZI and aid not in stato_palestra(stato)["attrezzi"]:
                stato["palestra"]["attrezzi"].append(aid)
                registra(stato, f"Arriva in palestra: {ATTREZZI[aid]['nome']}.")
                righe.append(f"Nuovo attrezzo: {ATTREZZI[aid]['nome']}")
            continue
        for rec in _bersagli(stato, ctx, e.get("chi", "a")):
            nb = nome_breve(rec)
            if "fiducia" in e:                                   # (si racconta quanto e' cambiato davvero, non quanto era previsto)
                prima = rec["fiducia"]
                cambia_fiducia(rec, e["fiducia"])
                if rec["fiducia"] != prima:
                    righe.append(f"{nb}: fiducia {_fmt_delta(rec['fiducia'] - prima)}")
            if "stress" in e:
                prima = rec["stress"]
                cambia_stress(rec, e["stress"])
                if rec["stress"] != prima:
                    righe.append(f"{nb}: stress {_fmt_delta(rec['stress'] - prima)}")
            if "punti" in e:
                v = e.get("voce", "casuale")
                if v == "casuale":
                    libere = [k for k in tutte_le_voci(rec) if (rango_voce(rec, k) or 4) < 4]
                    v = rng.choice(libere) if libere else None
                elif v.startswith("sessione:"):
                    v = voce_attiva(rec, v[9:])
                n = aggiungi_punti(rec, v, e["punti"]) if v else 0
                if n:
                    righe.append(f"{nb}: {nome_voce(v, db)} +{str(n).replace('.', ',')} punti")
            if "ferita" in e:
                f = ferisci(rec, rng, e["ferita"][0], e["ferita"][1], db)
                if f:
                    righe.append(f"{nb}: {_nome_loc(f['loc'])} −{f['hp']} hp")
            if "cura" in e:
                cura(rec, e["cura"])
                righe.append(f"{nb}: curato")
            if "riposo" in e:
                rec["riposo_giorni"] = rec.get("riposo_giorni", 0) + e["riposo"]
                righe.append(f"{nb}: {e['riposo']} giorni di riposo")
            if "rinvia_ritiro" in e:
                rec["ritiro_dopo"] = stato["giorno"] + e["rinvia_ritiro"]
            if e.get("va_via"):
                dopo.append(("via", rec))
            if e.get("istruttore"):
                dopo.append(("istruttore", rec))


def risolvi_evento(stato, db, ev_id, scelta_id, rng=random):
    """Il giocatore sceglie. Ritorna {ok, esito, righe} o {ok: False, errore}."""
    p = stato_palestra(stato)
    ev = next((e for e in p["eventi"] if e["id"] == ev_id), None)
    if ev is None:
        return {"ok": False, "errore": "Evento non trovato."}
    d = EVENTI.get(ev["tipo"])
    sc = next((s for s in (d or {}).get("scelte", []) if s["id"] == scelta_id), None)
    if sc is None:
        return {"ok": False, "errore": "Scelta non valida."}
    if stato["crediti"] < sc.get("richiede_crediti", 0):
        return {"ok": False, "errore": "Crediti insufficienti."}
    ctx = {"a": trova(stato, ev.get("a")), "b": trova(stato, ev.get("b")), "m": trova(stato, ev.get("extra", {}).get("m"))}
    p["eventi"] = [e for e in p["eventi"] if e is not ev]
    righe, dopo = [], []
    esito = _testo(stato, ev, sc.get("esito", ""))
    scelta_txt = _testo(stato, ev, sc["testo"])          # (prima degli effetti: qualcuno potrebbe lasciare la palestra)
    _applica(stato, db, ev, ctx, sc.get("effetti", []), rng, righe, dopo)
    for cosa, rec in dopo:
        if rec not in tutti(stato):
            continue
        if cosa == "via":
            congeda(stato, rec, "scelta")
            righe.append(f"{nome_breve(rec)} lascia la palestra")
        elif cosa == "istruttore" and rec.get("ruolo", "combattente") == "combattente":
            fai_istruttore(stato, rec)
            righe.append(f"{nome_breve(rec)} diventa istruttore")
    registra(stato, f"{d['titolo']}: {scelta_txt}", pid=ev.get("a"))
    return {"ok": True, "esito": esito, "righe": righe}


# ---------------------------------------------------------------- la vista per l'interfaccia
def hp_visuale(rec, db=None):
    """Gli hp come li vuole il disegno dei combattenti (static/arena.js): val/max/protesi/crippled per locazione."""
    protesi = {pr["locazione"]: pr for pr in (db or {}).get("protesi", []) if pr["id"] in rec.get("protesi", [])}
    out = {}
    for l, mx in LOCAZIONI.items():
        if l in protesi:
            hp = protesi[l].get("hp", 100)
            out[l] = {"val": hp, "max": hp, "protesi": True, "crippled": False, "tipi": {}}
        else:
            out[l] = {"val": rec["hp"].get(l, mx), "max": mx, "protesi": False, "crippled": l in rec.get("crippled", []), "tipi": {}}
    return out


def giorni_recupero(rec, stato=None):
    """Giorni di riposo stimati per tornare al pieno (None se morto o gia' sano): si simula, perche' in coma si guarisce
    piano finche' non se ne esce."""
    if rec.get("morto"):
        return None
    hp = dict(rec["hp"])
    molt = MOLT_RIPOSO * (1 + rec.get("toughness", 0) / 100)
    if stato is not None:
        for aid in attrezzi_posseduti(stato):
            molt *= ATTREZZI[aid].get("riposo", 1.0)
    giorni = 0
    while any(hp[l] < LOCAZIONI[l] for l in LOCAZIONI) and giorni < 400:
        n = max(1, int(round((RIGEN_COMA_GIORNO if hp["testa"] <= 0 or hp["busto"] <= 0 else RIGEN_GIORNO) * molt)))
        hp = {l: min(LOCAZIONI[l], hp[l] + n) for l in LOCAZIONI}
        giorni += 1
    return giorni or None


def vista_membro(stato, rec, a, db=None):
    g = stato["giorno"]
    return {"id": rec["id"], "nome": rec["nome"], "aspetto": rec.get("aspetto"), "hp": hp_visuale(rec, db),
            "salute": salute(rec), "eta": eta(rec, g), "fiducia": rec.get("fiducia", 50), "stress": rec.get("stress", 0),
            "tratti": [{"id": t["id"], "nome": t["nome"], "descrizione": t["descrizione"]} for t in tratti_visibili(rec)],
            "tratti_nascosti": len(rec.get("tratti", [])) - rec.get("tratti_noti", 0),
            "piano": list(rec["piano"]), "auto_riposo": rec.get("auto_riposo", True),
            "focus": opzioni_focus(rec, db), "oggi": a, "livello": rec.get("livello", 1), "token": rec.get("token", 0),
            "vittorie": rec.get("vittorie", 0), "sconfitte": rec.get("sconfitte", 0),
            "vuole_combattere": vuole_combattere(rec), "giorni_recupero": giorni_recupero(rec, stato)}


def vista(stato, db=None, rng=random):
    """Tutto cio' che serve alla pagina della palestra, pronto per jsonify."""
    p = stato_palestra(stato)
    g = stato["giorno"]
    ass = assegnazioni(stato, rng)
    return {
        "giorno": g, "data": descrivi_data(g), "settimana": numero_settimana(g), "giorno_settimana": g % 7,
        "giorni": list(GIORNI_BREVI), "crediti": stato["crediti"],
        "membri": [vista_membro(stato, c, ass[c["id"]], db) for c in membri_attivi(stato)],
        "istruttori": [{"id": c["id"], "nome": c["nome"], "aspetto": c.get("aspetto"), "hp": hp_visuale(c, db), "eta": eta(c, g),
                        "voce": nome_voce(c.get("voce_istruttore", "stat:fisico"), db)} for c in istruttori(stato)],
        "caduti": [{"id": c["id"], "nome": c["nome"], "giorno": c.get("giorno_morte", 0)} for c in caduti(stato)],
        "attrezzi": attrezzi_posseduti(stato),
        "attrezzi_info": [{"id": i, "nome": ATTREZZI[i]["nome"], "effetto": ATTREZZI[i].get("effetto", "")} for i in attrezzi_posseduti(stato)],
        "capienza": capienza(stato), "occupati": len(membri_attivi(stato)),
        "eventi": [x for x in (descrivi_evento(stato, e) for e in p["eventi"]) if x],
        "registro": p["registro"][-14:],
        "sessioni": {k: {"nome": v["nome"], "sigla": v["sigla"], "desc": v["desc"]} for k, v in SESSIONI.items()},
        "attivita_speciali": ATTIVITA_SPECIALI,
        "ha_contratti": bool(stato.get("contratti")),
        "serate": serate(stato),
    }


# ---------------------------------------------------------------- piano e focus
def imposta_piano(rec, giorno, sessione):
    if not (0 <= giorno < 7) or sessione not in SESSIONI:
        return False
    rec["piano"][giorno] = sessione
    return True


def imposta_focus(rec, sessione, chiave):
    if sessione not in SESSIONI or chiave not in voci_sessione(rec, sessione):
        return False
    rec.setdefault("focus", {})[sessione] = chiave
    return True
