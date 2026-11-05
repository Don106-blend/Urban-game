"""Torneo Evo — la corsa roguelike. TORNEO_EVO.md racconta il progetto; qui c'e' la logica, senza Flask.

Una corsa: 16 eroi base (tre ne offrono la scelta), eliminazione diretta Ottavi -> Finale. Dopo ogni vittoria si pesca il bottino (tre
carte: un potere, un rango, una statistica, un impianto o una mutazione) e si sceglie una porta (riposo, mercato, allenamento, sparring
d'elite, evento). La vita si porta dietro da un duello all'altro. I gettoni sono la moneta della corsa (mercato, rilanci, puntate).
Dopo il titolo c'e' la modalita' infinita (facoltativa): sfidanti sempre piu' forti, uno dopo l'altro, finche' non si perde.
Tutto lo stato e' JSON (dizionari di record, come in palestra): si salva dopo ogni mossa in save/evo.json e si riprende da dove si era.

Il modulo non importa `app` (si caricherebbe due volte lanciando app.py): `collega()` riceve il DB e le funzioni che servono."""
import json
import math
import os
import random

import aspetto
from engine import LOCAZIONI, MAX_POTERI, eroe_base, nome_casuale

DATI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def _json(nome):
    with open(os.path.join(DATI, nome), encoding="utf-8") as f:
        return json.load(f)


MUTAZIONI = {m["id"]: m for m in _json("mutazioni.json")}
REGOLE = {r["id"]: r for r in _json("regole_arena.json")}
EVENTI = {e["id"]: e for e in _json("eventi_evo.json")}

NOMI_TURNI = ["Ottavi", "Quarti", "Semifinale", "Finale"]
STAT_POT = ("fisico", "riflessi", "mente", "sociale")      # le statistiche che crescono (il controllo sale da solo, a ogni vittoria)
N_EROI = 16
N_CANDIDATI = 3

# il peso delle rarita' alla pesca; le maledette non si pescano a caso: si cercano (collezionista, altare, mercato, ascensione 4)
PESO_RARITA = {"comune": 62, "rara": 30, "leggendaria": 8}
PREZZO_MUT = {"comune": 4, "rara": 8, "leggendaria": 14, "maledetta": 3}     # al mercato, in gettoni
VALORE_MUT = {"comune": 6, "rara": 13, "leggendaria": 25, "maledetta": 10}   # quanto pesa una mutazione nella forza (misurato: balance.py mutazioni)
PUNTI_MUT = {"comune": 5, "rara": 15, "leggendaria": 40, "maledetta": 25}    # ...e nel punteggio finale
VALORE_EQUIP = 6
PESO_CARTE = {"potere": 20, "rango": 20, "stat": 18, "equip": 20, "mutazione": 28}
PESO_PORTE = {"riposo": 25, "mercato": 20, "allenamento": 20, "sparring": 16, "evento": 20}

# la forza di una scheda -> probabilita' di vittoria: la stessa logistica delle quote (app.K_VALUTA, K_HP)
K_FORZA, K_HP = 0.036, 3.0

RECUPERO = 0.45              # frazione della vita mancante che torna dopo ogni duello vinto
RECUPERO_DURO = 0.15         # ...dall'ascensione 2
RECUPERO_SPARRING_SCONFITTA = 0.25   # sparring perso: si esce a un quarto della vita
SOGLIA_RIPOSO = 0.55         # sotto questa vita una delle porte e' sempre il riposo
GETTONI_INIZIALI = 3
GETTONI_VITTORIA = 4
GETTONI_SPARRING = 5
GETTONI_SALTO = 2            # saltare il bottino
REROLL_BASE = 2              # il primo rilancio costa 2 gettoni, il secondo 3, ...
PREZZO_MEDIKIT = 3
SCONTO_MAX = 0.5

PUNTI_VITTORIA, PUNTI_SPARRING, PUNTI_SALUTE, PUNTI_GETTONE, PUNTI_TITOLO = 100, 50, 50, 10, 300
BONUS_ASCENSIONE = 0.25      # il punteggio finale cresce del 25% per ascensione

# la modalita' infinita: dopo il titolo, sfidanti sempre piu' forti. Lo sfidante di livello n e' cresciuto come un finalista piu' n giri e ha, oltre i limiti
# delle statistiche, dei poteri e delle mutazioni, una scala senza fondo (hp, armatura e danni crescono a ogni livello). Ogni BOSS_OGNI-esimo e' un boss.
PUNTI_INFINITO, PUNTI_INFINITO_PASSO, PUNTI_BOSS = 60, 20, 100      # una vittoria all'infinito vale 60 + 20 per livello (+100 per un boss)
BOSS_OGNI = 5
SCALA_HP, SCALA_ARMATURA, SCALA_DANNI = 25, 15, 0.08      # per livello: hp massimi di testa e busto, armatura su ogni locazione, moltiplicatore dei danni
VALORE_SCALA = 20                                         # quanto vale la scala di un livello nella forza (per il pronostico)

ASCENSIONI = [
    {"nome": "Esordiente", "regola": "Nessuna difficoltà in più."},
    {"nome": "Veterano", "regola": "Le CPU ottengono un miglioramento in più a ogni round e spesso una mutazione in più."},
    {"nome": "Spietato", "regola": "Tra un duello e l'altro recuperi solo il 15% della vita mancante."},
    {"nome": "Squattrinato", "regola": "Parti senza gettoni, le vittorie ne pagano 2 in meno e il Mercato costa il 50% in più. Le CPU mutano ancora di più."},
    {"nome": "Leggenda", "regola": "La Finale si gioca contro un campione d'élite."},
]
ASCENSIONE_MAX = len(ASCENSIONI) - 1
CPU_EXTRA = [0, 1, 1, 1, 1]       # miglioramenti in piu' delle CPU a ogni round, per ascensione
CPU_MUT_EXTRA = [0, 0.5, 0.5, 0.8, 1.0]   # ...e mutazioni in piu' (comuni o rare): la parte intera sempre, la frazione come probabilita'

# ---------------------------------------------------------------- collegamento con l'app
DB = None
_record_to_pg = None
_controlla = None
PERCORSO = None       # il file di salvataggio (None: niente salvataggio, e' il caso del harness)
META = None           # record e storico, sopravvivono alla corsa


def _meta_vuoto():
    return {"corse": 0, "titoli": 0, "migliore": 0, "ascensione_max": 0, "infinito_max": 0, "storico": []}


def collega(db, record_to_pg, controlla_equip, percorso=None):
    """Riceve il DB e le due funzioni dell'app (record -> Personaggio; un impianto sta su questo record?). Ritorna la corsa salvata, se c'e'."""
    global DB, _record_to_pg, _controlla, PERCORSO
    DB, _record_to_pg, _controlla, PERCORSO = db, record_to_pg, controlla_equip, percorso
    return carica()


def carica():
    global META
    META = _meta_vuoto()
    if not PERCORSO or not os.path.exists(PERCORSO):
        return None
    try:
        with open(PERCORSO, encoding="utf-8") as f:
            dati = json.load(f)
    except (OSError, ValueError):
        return None
    META.update(dati.get("meta") or {})
    if not dati.get("corsa"):
        return None
    corsa = Corsa.da_dict(dati["corsa"])
    corsa._riprendi()
    return corsa


def salva(corsa=None):
    if not PERCORSO:
        return
    os.makedirs(os.path.dirname(PERCORSO), exist_ok=True)
    tmp = PERCORSO + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"v": 1, "meta": META, "corsa": corsa.a_dict() if corsa else None}, f, ensure_ascii=False)
    os.replace(tmp, PERCORSO)


def stato_iniziale():
    """Cosa vede chi apre il torneo senza una corsa in corso: i record e le ascensioni sbloccate."""
    return {"attivo": False, "meta": META, "ascensioni": [dict(a, indice=i, sbloccata=i <= META["ascensione_max"])
                                                          for i, a in enumerate(ASCENSIONI)]}


# ---------------------------------------------------------------- i record dei combattenti (dizionari JSON, come in palestra)
def rec_da_pg(p, asp):
    return {"nome": p.nome, "data_nascita": p.data_nascita, "bio": "", "aspetto": asp, "livello": 1,
            "stats": dict(p.stats), "skills": dict(p.skills),
            "poteri": [{"id": s["def"]["id"], "rango": s["rango"]} for s in p.poteri],
            "protesi": [], "augments": [], "mutazioni": [], "hp": None, "crippled": [], "storia": [], "elite": False}


def _def_potere(pid):
    return next((p for p in DB["poteri"] if p["id"] == pid), None)


def _def_item(cat, iid):
    return next((x for x in (DB["protesi"] if cat == "protesi" else DB["augments"]) if x["id"] == iid), None)


def mosse_potere(pid, rango):
    """I nomi delle mosse che un potere da' a questo rango (cumulative)."""
    att = {a["id"]: a["nome"] for a in DB["attacchi"]}
    pw = _def_potere(pid)
    return [att[a] for r in range(1, rango + 1) for a in pw.get("attacchi", {}).get(str(r), []) if a in att]


def rango_massimo(rec):
    """Un potere non supera il Controllo, che sale di uno a ogni vittoria."""
    return min(4, rec["stats"].get("controllo", 1))


def stat_su(rec):
    return [s for s in STAT_POT if rec["stats"][s] < 4]


def poteri_su(rec):
    return [p for p in rec["poteri"] if p["rango"] < rango_massimo(rec)]


def poteri_nuovi(rec):
    if len(rec["poteri"]) >= MAX_POTERI:
        return []
    noti = {p["id"] for p in rec["poteri"]}
    return [p for p in DB["poteri"] if p["id"] not in noti]


def equip_validi(rec):
    """Gli impianti che questo record puo' ricevere adesso: stessi vincoli della palestra (una protesi per locazione, Umanita')."""
    out = []
    for cat, lista in (("protesi", DB["protesi"]), ("augment", DB["augments"])):
        out += [(cat, it) for it in lista if _controlla(rec, cat, it, False)[0]]
    return out


def dai_equip(rec, cat, item):
    rec["protesi" if cat == "protesi" else "augments"].append(item["id"])


def prezzo_equip(item):
    return max(2, min(12, round(item.get("valore", 0) / 100)))


def mutazioni_su(rec, corsa=True):
    """Le mutazioni che il record puo' ancora ricevere: non ripetute, e senza statistiche gia' al massimo."""
    out = []
    for m in MUTAZIONI.values():
        if m["id"] in rec["mutazioni"] or (m.get("corsa") and not corsa):
            continue
        if any(o["op"] == "stat" and rec["stats"][o["stat"]] >= 4 for o in m["ops"]):
            continue
        out.append(m)
    return out


def pesca_mutazione(rec, rarita=None, corsa=True, escludi=()):
    """Una mutazione a caso. `rarita`: None = secondo i pesi (maledette escluse); una rarita' o piu'; se quella non ha candidati, la piu' vicina."""
    cand = [m for m in mutazioni_su(rec, corsa) if m["id"] not in escludi]
    if not cand:
        return None
    if rarita is None:
        pesi = {r: PESO_RARITA[r] for r in PESO_RARITA if any(m["rarita"] == r for m in cand)}
        if not pesi:
            return random.choice(cand)
        r = random.choices(list(pesi), weights=list(pesi.values()))[0]
        return random.choice([m for m in cand if m["rarita"] == r])
    rarita = [rarita] if isinstance(rarita, str) else list(rarita)
    for r in rarita + ["rara", "comune", "leggendaria", "maledetta"]:
        scelte = [m for m in cand if m["rarita"] == r]
        if scelte:
            return random.choice(scelte)
    return None


def dai_mutazione(rec, mid):
    """La mutazione entra nel record. Le statistiche e gli hp massimi cambiano subito (e restano), il resto agisce in duello (applica_ops)."""
    rec["mutazioni"].append(mid)
    for o in MUTAZIONI[mid]["ops"]:
        if o["op"] == "stat":
            rec["stats"][o["stat"]] = min(4, rec["stats"][o["stat"]] + o["delta"])
        elif o["op"] == "hp_max" and rec.get("hp"):
            for l in o["locazioni"]:
                rec["hp"][l] = max(1, rec["hp"][l] + o["valore"])


def bonus_corsa(rec, chiave):
    """Somma gli effetti della corsa (non del duello) delle mutazioni del record: gettoni a vittoria, recupero, sconto."""
    return sum(o["valore"] for mid in rec["mutazioni"] for o in MUTAZIONI[mid]["ops"] if o["op"] == "corsa" and o["chiave"] == chiave)


def info_mut(mid):
    m = MUTAZIONI[mid]
    return {"id": mid, "nome": m["nome"], "rarita": m["rarita"], "icona": m.get("icona", ""), "descrizione": m["descrizione"]}


def forza(rec):
    """La forza di una scheda, per il pronostico e per le CPU: come engine.valuta, piu' gli impianti e le mutazioni."""
    return (3 * sum(rec["stats"].values()) + sum(rec["skills"].values()) + 2 * sum(p["rango"] for p in rec["poteri"])
            + extra_forza(rec))


def extra_forza(rec):
    return (VALORE_EQUIP * (len(rec["protesi"]) + len(rec["augments"])) + sum(VALORE_MUT[MUTAZIONI[m]["rarita"]] for m in rec["mutazioni"])
            + round(VALORE_SCALA * liv_scala(rec.get("infinito", 0))))


def liv_scala(n):
    """Quanta scala ha lo sfidante di livello `n`: lineare all'inizio, poi sempre piu' ripida (anche la build piu' forte, prima o poi, cede)."""
    return n + n * n / 25


def ops_scala(n):
    """La scala dell'infinito: cio' che lo sfidante di livello `n` ha in piu', senza limite."""
    L = liv_scala(n)
    return [{"op": "hp_max", "valore": round(SCALA_HP * L), "locazioni": ["testa", "busto"]}, {"op": "armatura", "valore": round(SCALA_ARMATURA * L), "locazione": "tutte"},
            {"op": "mult_danno", "valore": 1 + SCALA_DANNI * L}]


# ---------------------------------------------------------------- dal record al Personaggio del duello
def applica_ops(p, ops):
    """Le operazioni di una mutazione o di una regola d'arena sul Personaggio che sta per combattere. Le statistiche non ci sono: sono nel record."""
    for o in ops:
        k = o["op"]
        if k == "armatura":
            for l in (list(p.armatura) if o.get("locazione", "tutte") == "tutte" else [o["locazione"]]):
                if l in p.armatura:
                    p.armatura[l] += o["valore"]
        elif k == "resistenza":
            p.resistenze[o["tipo_danno"]] = p.resistenze.get(o["tipo_danno"], 0) + o["valore"]
        elif k == "immunita":
            p.immunita.add(o["tipo_danno"])
        elif k in ("azioni", "bonus", "risposte"):
            attr = "n_" + k
            setattr(p, attr, getattr(p, attr) + o["delta"])
        elif k == "effetto":
            p.applica_effetti([{"effetto": o["id"], "persistente": True}], DB["effetti"])
        elif k == "stance":
            sdef = next(s for s in DB["stances"] if s["id"] == o["id"])
            if all(x["id"] != sdef["id"] for x in p.stance_conosciute):
                p.stance_conosciute.append(sdef)
            if all(x["def"]["id"] != sdef["id"] for x in p.stance_attive):
                p.stance_attive.append({"def": sdef, "turni": -1})
        elif k == "hp_max":
            for l in o["locazioni"]:
                p.hp_max[l] += o["valore"]
                p.hp[l] = max(1, p.hp[l] + o["valore"])
        elif k == "mira_bonus":
            p.mira_bonus = True
        elif k == "stamina":
            p.stamina_extra += o["valore"]
        elif k == "attacco":
            att = next(a for a in DB["attacchi"] if a["id"] == o["id"])
            if all(a["id"] != att["id"] for a in p.attacchi):
                p.attacchi.append(att)
        elif k == "mult_danno":
            p.mult_danno *= o["valore"]
        elif k == "mult_subiti":
            p.mult_subiti *= o["valore"]
        elif k == "vampiro":
            p.vampiro += o["valore"]
        elif k == "ultima_chance":
            p.ultima_chance = True
        elif k == "no_mira":
            p.no_mira = True
        elif k == "no_schivata":
            p.no_schivata = True


def crea_pg(rec, ops_extra=()):
    """Il record diventa un Personaggio pronto al duello: impianti, mutazioni, regola d'arena e la vita che si porta dietro."""
    base = dict(rec, hp={})
    p = _record_to_pg(base)
    for mid in rec["mutazioni"]:
        applica_ops(p, [o for o in MUTAZIONI[mid]["ops"] if o["op"] != "stat"])
    if rec.get("infinito"):
        applica_ops(p, ops_scala(rec["infinito"]))
    applica_ops(p, ops_extra)
    hp = rec.get("hp")
    if hp:
        for l in LOCAZIONI:
            if l in hp and l not in p.protesi_locazioni:      # una protesi riparte sempre a piena vita
                p.hp[l] = min(hp[l], p.hp_max[l])
        p.crippled = {l for l in rec.get("crippled", []) if l in LOCAZIONI and l not in p.protesi_locazioni}
    p.mutazioni = [info_mut(m) for m in rec["mutazioni"]]
    p.valuta_extra = extra_forza(rec)
    p.livello = rec.get("livello", 1)
    return p


def frazione_hp(p):
    return sum(max(0, p.hp[l]) for l in LOCAZIONI) / max(1, sum(p.hp_max[l] for l in LOCAZIONI))


def salute(rec):
    """(frazione di vita rimasta, {locazione: (hp, max)}) di un record."""
    p = crea_pg(rec)
    return frazione_hp(p), {l: (p.hp[l], p.hp_max[l]) for l in LOCAZIONI}


def _scrivi_hp(rec, p, hp):
    rec["hp"] = hp
    rec["crippled"] = sorted(l for l in LOCAZIONI if l not in ("testa", "busto") and l not in p.protesi_locazioni and hp[l] <= -p.hp_max[l])


def recupera(rec, p, frazione):
    """Dopo un duello: torna `frazione` della vita mancante, a ogni locazione (le protesi, tutta). Le ferite gravi di un duello si rimarginano da sole."""
    hp = {}
    for l in LOCAZIONI:
        mx, v = p.hp_max[l], p.hp[l]
        hp[l] = mx if l in p.protesi_locazioni else int(round(v + (mx - v) * frazione))
        if l in ("testa", "busto"):
            hp[l] = max(1, hp[l])
    _scrivi_hp(rec, p, hp)


def cura(rec, frazione):
    recupera(rec, crea_pg(rec), frazione)


def ferisci(rec, frazione):
    """Perde `frazione` degli hp massimi di ogni locazione (testa e busto non scendono sotto 1: gli eventi non uccidono)."""
    p = crea_pg(rec)
    hp = {}
    for l in LOCAZIONI:
        if l in p.protesi_locazioni:
            hp[l] = p.hp_max[l]
            continue
        v = p.hp[l] - int(p.hp_max[l] * frazione)
        hp[l] = max(1, v) if l in ("testa", "busto") else v
    _scrivi_hp(rec, p, hp)


def prob_vittoria(a, b):
    z = K_FORZA * (forza(a) - forza(b)) + K_HP * (salute(a)[0] - salute(b)[0])
    return 1 / (1 + math.exp(-z))


def scheda(rec):
    """Tutto cio' che il client mostra di un combattente."""
    frac, locs = salute(rec)
    return {"nome": rec["nome"], "aspetto": rec["aspetto"], "stats": dict(rec["stats"]), "forza": forza(rec), "elite": rec.get("elite", False),
            "infinito": rec.get("infinito", 0), "scala": ({"hp": round(SCALA_HP * liv_scala(rec["infinito"])), "armatura": round(SCALA_ARMATURA * liv_scala(rec["infinito"])),
                                                           "danni": round(SCALA_DANNI * liv_scala(rec["infinito"]) * 100)} if rec.get("infinito") else None),
            "poteri": [{"id": p["id"], "nome": _def_potere(p["id"])["nome"], "rango": p["rango"],
                        "descrizione": _def_potere(p["id"]).get("descrizione", ""), "mosse": mosse_potere(p["id"], p["rango"])} for p in rec["poteri"]],
            "protesi": [{"id": i, "nome": _def_item("protesi", i)["nome"], "descrizione": _def_item("protesi", i).get("descrizione", "")} for i in rec["protesi"]],
            "augments": [{"id": i, "nome": _def_item("augment", i)["nome"], "descrizione": _def_item("augment", i).get("descrizione", "")} for i in rec["augments"]],
            "mutazioni": [info_mut(m) for m in rec["mutazioni"]], "storia": rec["storia"][-5:],
            "hp": {"frazione": round(frac, 3), "locazioni": {l: list(v) for l, v in locs.items()}}}


# ---------------------------------------------------------------- crescita delle CPU
def _pesca(pesi, n):
    pool, out = dict(pesi), []
    while pool and len(out) < n:
        k = random.choices(list(pool), weights=list(pool.values()))[0]
        out.append(k)
        del pool[k]
    return out


PESI_CPU = {"potere": 25, "rango": 15, "stat": 60}      # come sceglie di crescere una CPU (balance.py carte: un potere nuovo, giocato dall'IA, vale meno di una statistica)


def evolvi_cpu(rec, rango_nuovo, extra=0, giro=0, mut_extra=0):
    """Una CPU che vince cresce come il giocatore: +1 Controllo, uno o piu' miglioramenti (PESI_CPU), il migliore di tre impianti e, dal
    secondo giro, il 35% di una mutazione comune. `storia` tiene il conto, per mostrarlo."""
    rec["stats"]["controllo"] = min(4, rec["stats"]["controllo"] + 1)
    novita = []
    for _ in range(1 + extra):
        opz = {}
        if poteri_nuovi(rec):
            opz["potere"] = PESI_CPU["potere"]
        if poteri_su(rec):
            opz["rango"] = PESI_CPU["rango"]
        if stat_su(rec):
            opz["stat"] = PESI_CPU["stat"]
        if not opz:
            break
        k = _pesca(opz, 1)[0]
        if k == "potere":
            pw = random.choice(poteri_nuovi(rec))
            rec["poteri"].append({"id": pw["id"], "rango": min(rango_nuovo, rango_massimo(rec))})
            novita.append(f"potere {pw['nome']}")
        elif k == "rango":
            p = random.choice(poteri_su(rec))
            p["rango"] += 1
            novita.append(f"{_def_potere(p['id'])['nome']} al rango {p['rango']}")
        else:
            s = random.choice(stat_su(rec))
            rec["stats"][s] += 1
            novita.append(f"+1 {s}")
    validi = equip_validi(rec)
    if validi:
        cat, it = max(random.sample(validi, min(3, len(validi))), key=lambda t: t[1].get("valore", 0))
        dai_equip(rec, cat, it)
        novita.append(f"{cat} {it['nome']}")
    if giro >= 1 and random.random() < 0.35:
        m = pesca_mutazione(rec, "comune", corsa=False)
        if m:
            dai_mutazione(rec, m["id"])
            novita.append(f"mutazione {m['nome']}")
    for _ in range(int(mut_extra) + (1 if random.random() < mut_extra % 1 else 0)):
        m = pesca_mutazione(rec, "comune" if random.random() < 0.6 else "rara", corsa=False)
        if m:
            dai_mutazione(rec, m["id"])
            novita.append(f"mutazione {m['nome']}")
    rec["storia"].append({"round": giro, "novita": novita})
    rec["hp"], rec["crippled"] = None, []


# ---------------------------------------------------------------- la corsa
class Corsa:
    """Una corsa del Torneo Evo. Le fasi:
    campioni (si sceglie l'eroe) -> bracket (si vede l'avversario) -> duello -> bottino (tre carte) -> porte (riposo, mercato, allenamento,
    sparring, evento) -> bracket... fino a vittoria (il titolo) o eliminato. Ogni mossa ritorna None, o il motivo per cui non si puo' fare."""

    infinito = False             # la modalita' infinita e' in corso (c'e' il default sulla classe: le corse salvate prima non hanno questi campi)
    giro_inf = 0                 # gli sfidanti dell'infinito battuti
    sfidante = None              # il prossimo avversario dell'infinito (un record)
    riepilogo_titolo = None      # il riepilogo del titolo, da cui riparte il punteggio dell'infinito
    migliore_altri = 0           # il record prima di questa corsa

    def __init__(self, ascensione=0):
        self.ascensione = ascensione
        self.fase = "campioni"
        self.round = 0
        self.eroi, self.io, self.candidati, self.turni = [], None, [], []
        self.gettoni = 0 if ascensione >= 3 else GETTONI_INIZIALI
        self.regola = "standard"
        self.bottino = self.porte = self.mercato = self.evento = self.allenamento = self.sparring = None
        self.duello_tipo = "torneo"
        self.eventi_visti = []
        self.punti = {}
        self.conta = {"vittorie": 0, "sparring": 0, "mutazioni": 0}
        self.cronaca, self.avviso, self.log_arena = [], [], []
        self.campione = None
        self.riepilogo = None
        usati = set()
        for _ in range(N_EROI):
            p = eroe_base(DB["attacchi"], DB["poteri"], DB["stances"], usati)
            usati.add(p.nome)
            rec = rec_da_pg(p, aspetto.genera(p.nome, [e["aspetto"] for e in self.eroi]))
            dai_mutazione(rec, pesca_mutazione(rec, "comune", corsa=False)["id"])      # il tratto di partenza: tutti ne hanno uno
            self.eroi.append(rec)
        self.candidati = random.sample(range(N_EROI), N_CANDIDATI)
        ordine = list(range(N_EROI))
        random.shuffle(ordine)
        self.turni = [[{"a": ordine[i], "b": ordine[i + 1], "win": None} for i in range(0, N_EROI, 2)]]

    # ---------- salvataggio ----------
    def a_dict(self):
        return dict(self.__dict__)

    @classmethod
    def da_dict(cls, d):
        c = cls.__new__(cls)
        c.__dict__.update(d)
        return c

    def _riprendi(self):
        """Dopo un riavvio: un duello interrotto non si e' giocato, si torna alla schermata prima."""
        if self.fase == "duello":
            self.fase = "sparring" if self.duello_tipo == "sparring" else "bracket"

    def _fine(self):
        salva(self)
        return None

    def _nota(self, testo):
        self.avviso.append(testo)
        self.cronaca.append(testo)
        del self.cronaca[:-12]

    # ---------- bracket ----------
    def mio_match(self):
        return next((m for m in self.turni[self.round] if self.io in (m["a"], m["b"])), None)

    def avversario_idx(self):
        m = self.mio_match()
        return m["b"] if m["a"] == self.io else m["a"]

    def eroe(self):
        return self.eroi[self.io]

    def avversario(self):
        if self.fase == "sparring" or (self.fase == "duello" and self.duello_tipo == "sparring"):
            return self.sparring["rec"]
        if self.infinito:
            return self.sfidante
        return self.eroi[self.avversario_idx()]

    def _vince_cpu(self, a, b):
        dv = forza(self.eroi[a]) - forza(self.eroi[b])
        return a if random.random() < 1 / (1 + math.exp(-K_FORZA * dv)) else b

    def _scegli_regola(self, dura=False):
        """La regola d'arena del prossimo duello. La Finale e lo sparring non sono mai su un ring regolare."""
        pesi = {r["id"]: r["peso"] for r in REGOLE.values() if not (dura and r["id"] == "standard")}
        return random.choices(list(pesi), weights=list(pesi.values()))[0]

    def _entra_bracket(self):
        self.fase = "bracket"
        boss = bool(self.infinito and self.sfidante and self.sfidante.get("elite"))
        self.regola = self._scegli_regola(dura=boss if self.infinito else self.round == 3)

    # ---------- la scelta dell'eroe ----------
    def scegli_campione(self, i):
        if self.fase != "campioni":
            return "nessuna scelta in corso"
        if i not in self.candidati:
            return "scelta non valida"
        self.io = i
        self._nota(f"{self.eroe()['nome']} entra nel torneo.")
        self.avviso = []
        self._apri_bottino("normale", "bracket", scelte=2)       # si parte con un primo bottino (due carte su tre): l'eroe prende forma prima del primo duello
        return self._fine()

    # ---------- il duello ----------
    def prepara_duello(self):
        """(Personaggio dell'eroe, Personaggio dell'avversario, regola) del duello che sta per iniziare; None se non e' il momento."""
        if self.fase not in ("bracket", "sparring"):
            return None
        self.duello_tipo = "sparring" if self.fase == "sparring" else "torneo"
        regola = REGOLE[self.regola]
        eroe = crea_pg(self.eroe(), regola["ops"])
        nemico = crea_pg(self.avversario(), regola["ops"])
        self.fase = "duello"
        self.avviso = []
        self._fine()
        return eroe, nemico, regola

    def _risolvi_arena(self, d):
        """Paga le puntate ancora aperte del duello appena finito: le vincite tornano nei gettoni."""
        if d.tavolo is None or not d.tavolo.banco:
            return
        liq = d.tavolo.liquida(d.vincitore is d.p)
        self.gettoni += liq["totale"]
        self.log_arena.extend(testo for testo, _ in liq["righe"])
        del self.log_arena[:-12]

    def _punti(self, voce, n):
        self.punti["infinito" if self.infinito else voce] = self.punti.get("infinito" if self.infinito else voce, 0) + n      # all'infinito tutto si somma in una voce sola

    def risolvi_duello(self, vinto, duello=None):
        if self.fase != "duello":
            return
        eroe = self.eroe()
        pg = duello.p if duello is not None else crea_pg(eroe)
        round_duello = duello.round if duello is not None else 99
        if duello is not None:
            self._risolvi_arena(duello)
        frac = frazione_hp(pg)
        self.avviso = []
        if self.duello_tipo == "sparring":
            self._finisci_sparring(vinto, pg, frac)
        elif self.infinito:
            self._finisci_infinito(vinto, pg, frac, round_duello)
        else:
            self._finisci_match(vinto, pg, frac, round_duello)
        self._fine()

    def _premi_vittoria(self, pg, frac, round_duello):
        eroe = self.eroe()
        self._punti("salute", round(PUNTI_SALUTE * frac))
        if round_duello <= 4:
            self._punti("rapidita", 25)
        elif round_duello <= 7:
            self._punti("rapidita", 10)
        g = GETTONI_VITTORIA + int(bonus_corsa(eroe, "gettoni_vittoria")) + (1 if frac >= 0.7 else 0) + (1 if round_duello <= 5 else 0)
        if self.ascensione >= 3:
            g = max(1, g - 2)
        self.gettoni += g
        self._nota(f"Vittoria! +{g} gettoni" + (" (in salute)" if frac >= 0.7 else "") + (" (lampo)" if round_duello <= 5 else "") + ".")
        base = RECUPERO_DURO if self.ascensione >= 2 else RECUPERO
        recupera(eroe, pg, min(1.0, base + bonus_corsa(eroe, "recupero_extra")))

    def _finisci_match(self, vinto, pg, frac, round_duello):
        eroe = self.eroe()
        m = self.mio_match()
        m["win"] = self.io if vinto else self.avversario_idx()
        for match in self.turni[self.round]:
            if match["win"] is None:
                match["win"] = self._vince_cpu(match["a"], match["b"])
        vincitori = [x["win"] for x in self.turni[self.round]]
        if not vinto:
            while len(vincitori) > 1:           # eliminato: si simula il resto, per incoronare comunque un campione
                prossimo = [{"a": vincitori[i], "b": vincitori[i + 1], "win": None} for i in range(0, len(vincitori), 2)]
                for match in prossimo:
                    match["win"] = self._vince_cpu(match["a"], match["b"])
                self.turni.append(prossimo)
                vincitori = [x["win"] for x in prossimo]
            self.campione = self.eroi[vincitori[0]]["nome"]
            self.fase = "eliminato"
            self._chiudi(False)
            return
        self.conta["vittorie"] += 1
        self._punti("vittorie", PUNTI_VITTORIA)
        self._premi_vittoria(pg, frac, round_duello)
        if len(vincitori) == 1:
            self.campione = eroe["nome"]
            self.fase = "vittoria"
            self._chiudi(True)
            return
        for idx in vincitori:                    # i vincitori crescono, il turno dopo si incontrano
            if idx != self.io:
                evolvi_cpu(self.eroi[idx], self.round + 2, extra=CPU_EXTRA[self.ascensione], giro=self.round, mut_extra=CPU_MUT_EXTRA[self.ascensione])
        eroe["stats"]["controllo"] = min(4, eroe["stats"]["controllo"] + 1)
        self.turni.append([{"a": vincitori[i], "b": vincitori[i + 1], "win": None} for i in range(0, len(vincitori), 2)])
        self.round += 1
        if self.round == 3 and self.ascensione >= ASCENSIONE_MAX:       # Leggenda: in Finale c'e' un campione d'elite
            rivale = self.eroi[self.avversario_idx()]
            rivale["elite"] = True
            for g in range(2):
                evolvi_cpu(rivale, 4, giro=2 + g, mut_extra=1)
            m = pesca_mutazione(rivale, "rara", corsa=False)
            if m:
                dai_mutazione(rivale, m["id"])
        self._apri_bottino("garantito" if self.round >= 2 else "normale", "porte")

    # ---------- la modalita' infinita ----------
    def puo_infinito(self):
        return self.fase == "vittoria" and not self.infinito

    def inizia_infinito(self):
        """Dopo il titolo: si continua contro sfidanti sempre piu' forti, finche' non si perde (o ci si ritira). Il punteggio del titolo resta, ogni vittoria in
        piu' ne aggiunge; si riparte con un bottino garantito (una mutazione rara o leggendaria) e una porta."""
        if not self.puo_infinito():
            return "la modalità infinita si apre dopo la vittoria in finale"
        self.infinito = True
        self.giro_inf = 0
        self.riepilogo_titolo = dict(self.riepilogo)
        self.sfidante = None
        self.avviso = []
        self._nota("Modalità infinita: sfidanti sempre più forti, finché non perdi.")
        self._nuovo_sfidante()
        self._apri_bottino("garantito", "porte")
        return self._fine()

    def _nuovo_sfidante(self):
        """Lo sfidante di livello n: i finalisti hanno 3 giri di crescita, lui 3 + n (con gli extra dell'ascensione), e in piu' la scala senza fondo."""
        n = self.giro_inf + 1
        usati = {e["nome"] for e in self.eroi} | ({self.sfidante["nome"]} if self.sfidante else set())
        p = eroe_base(DB["attacchi"], DB["poteri"], DB["stances"], usati)
        rec = rec_da_pg(p, aspetto.genera(p.nome, [e["aspetto"] for e in self.eroi]))
        for g in range(3 + n):
            evolvi_cpu(rec, min(4, g + 2), extra=CPU_EXTRA[self.ascensione], giro=g, mut_extra=CPU_MUT_EXTRA[self.ascensione])
        if n % BOSS_OGNI == 0:                                    # un boss: un'élite con piu' crescita e una mutazione rara
            rec["elite"] = True
            for g in range(2):
                evolvi_cpu(rec, 4, giro=3 + n + g, mut_extra=1)
            m = pesca_mutazione(rec, "rara", corsa=False)
            if m:
                dai_mutazione(rec, m["id"])
        rec["infinito"] = n
        self.sfidante = rec

    def _finisci_infinito(self, vinto, pg, frac, round_duello):
        if not vinto:
            self.fase = "eliminato"
            self._chiudi_infinito()
            return
        n = self.giro_inf + 1
        boss = bool(self.sfidante.get("elite"))
        self.giro_inf = n
        self._punti("infinito", PUNTI_INFINITO + PUNTI_INFINITO_PASSO * n + (PUNTI_BOSS if boss else 0))
        META["infinito_max"] = max(META["infinito_max"], n)
        self._premi_vittoria(pg, frac, round_duello)
        self._nota(f"{'Boss' if boss else 'Sfidante'} di livello {n} battuto!")
        self._nuovo_sfidante()
        self._apri_bottino("elite" if boss else "garantito" if n % 3 == 0 else "normale", "porte")

    def ritira(self):
        """Ci si ritira dall'infinito tra un combattimento e l'altro: il punteggio resta quello (perdere o ritirarsi vale lo stesso)."""
        if not self.infinito or self.fase not in ("bracket", "porte"):
            return "ti puoi ritirare solo tra un combattimento e l'altro dell'infinito"
        self.porte = None
        self.fase = "eliminato"
        self._chiudi_infinito(ritirato=True)
        return self._fine()

    def _chiudi_infinito(self, ritirato=False):
        """Fine dell'infinito: il punteggio del titolo (gia' contato) piu' i punti dell'infinito, e il record dell'infinito."""
        eroe = self.eroe()
        t = self.riepilogo_titolo
        extra = self.punti.get("infinito", 0)
        righe = [list(r) for r in t["righe"]] + ([[f"Modalità infinita ({self.giro_inf} sfidanti battuti)", extra]] if extra else [])
        base = t["base"] + extra
        molt = t["moltiplicatore"]
        totale = round(base * molt)
        raggiunto = f"Infinito {self.giro_inf}" if self.giro_inf else "Campione"
        record = totale > self.migliore_altri
        META["migliore"] = max(META["migliore"], totale)
        META["infinito_max"] = max(META["infinito_max"], self.giro_inf)
        voce = META["storico"][-1] if META["storico"] else None
        if voce and voce["eroe"] == eroe["nome"] and voce.get("titolo"):          # la corsa e' gia' nello storico dal titolo: si aggiorna
            voce.update(punteggio=totale, turno=raggiunto, infinito=self.giro_inf, mutazioni=len(eroe["mutazioni"]))
        self.riepilogo = {"righe": righe, "base": base, "moltiplicatore": molt, "totale": totale, "turno": raggiunto, "record": record,
                          "sbloccata": t.get("sbloccata"), "titolo": True, "infinito": self.giro_inf, "ritirato": ritirato}

    def _finisci_sparring(self, vinto, pg, frac):
        eroe = self.eroe()
        nome = self.sparring["rec"]["nome"]
        self.sparring = None
        if vinto:
            self.conta["sparring"] += 1
            self._punti("sparring", PUNTI_SPARRING)
            self._punti("salute", round(PUNTI_SALUTE * frac / 2))
            self.gettoni += GETTONI_SPARRING
            self._nota(f"Sparring vinto contro {nome}! +{GETTONI_SPARRING} gettoni e un bottino raro.")
            base = RECUPERO_DURO if self.ascensione >= 2 else RECUPERO
            recupera(eroe, pg, min(1.0, base + bonus_corsa(eroe, "recupero_extra")))
            self._apri_bottino("elite", "bracket")
            return
        perso = self.gettoni
        self.gettoni = 0
        _scrivi_hp(eroe, pg, {l: pg.hp_max[l] if l in pg.protesi_locazioni else max(1, int(pg.hp_max[l] * RECUPERO_SPARRING_SCONFITTA))
                              for l in LOCAZIONI})
        self._nota(f"Sparring perso contro {nome}: perdi {perso} gettoni e ti rialzi a un quarto della vita. La corsa continua.")
        self._entra_bracket()

    # ---------- il bottino: tre carte ----------
    def _apri_bottino(self, tipo, dopo, scelte=1):
        self.bottino = {"tipo": tipo, "dopo": dopo, "rilanci": 0, "scelte": scelte, "carte": self._carte(tipo)}
        self.fase = "bottino"
        if not self.bottino["carte"]:                 # tutto al massimo: niente da scegliere
            self._chiudi_bottino()

    def _carte(self, tipo):
        eroe = self.eroe()
        if tipo == "elite":                           # lo sparring paga in mutazioni rare e leggendarie
            carte, scelte = [], set()
            for _ in range(3):
                m = pesca_mutazione(eroe, random.choices(["rara", "leggendaria"], weights=[60, 40])[0], escludi=scelte)
                if m:
                    scelte.add(m["id"])
                    carte.append({"tipo": "mutazione", "id": m["id"]})
            return carte
        pesi = {}
        if poteri_nuovi(eroe):
            pesi["potere"] = PESO_CARTE["potere"]
        if poteri_su(eroe):
            pesi["rango"] = PESO_CARTE["rango"]
        if stat_su(eroe):
            pesi["stat"] = PESO_CARTE["stat"]
        if equip_validi(eroe):
            pesi["equip"] = PESO_CARTE["equip"]
        if mutazioni_su(eroe):
            pesi["mutazione"] = PESO_CARTE["mutazione"]
        carte = []
        if tipo == "garantito":                       # dopo i Quarti e la Semifinale una carta e' sempre una mutazione rara o leggendaria
            m = pesca_mutazione(eroe, random.choices(["rara", "leggendaria"], weights=[75, 25])[0])
            if m:
                carte.append({"tipo": "mutazione", "id": m["id"], "garantita": True})
                pesi.pop("mutazione", None)
        for k in _pesca(pesi, 3 - len(carte)):
            carte.append(self._carta(k))
        random.shuffle(carte)
        return carte

    def _carta(self, k):
        eroe = self.eroe()
        if k == "potere":
            pw = random.choice(poteri_nuovi(eroe))
            return {"tipo": "potere", "id": pw["id"], "rango": min(self.round + 1, rango_massimo(eroe))}
        if k == "rango":
            p = random.choice(poteri_su(eroe))
            return {"tipo": "rango", "id": p["id"], "da": p["rango"], "a": p["rango"] + 1}
        if k == "stat":
            s = random.choice(stat_su(eroe))
            return {"tipo": "stat", "stat": s, "da": eroe["stats"][s]}
        if k == "equip":
            cat, it = random.choice(equip_validi(eroe))
            return {"tipo": "equip", "cat": cat, "id": it["id"]}
        return {"tipo": "mutazione", "id": pesca_mutazione(eroe)["id"]}

    def costo_rilancio(self):
        return REROLL_BASE + self.bottino["rilanci"]

    def rilancia(self):
        if self.fase != "bottino" or self.bottino["tipo"] == "elite":
            return "non si può rilanciare adesso"
        if self.gettoni < self.costo_rilancio():
            return "gettoni insufficienti"
        self.gettoni -= self.costo_rilancio()
        self.bottino["rilanci"] += 1
        self.bottino["carte"] = self._carte(self.bottino["tipo"])
        return self._fine()

    def scegli_carta(self, i):
        if self.fase != "bottino":
            return "nessun bottino da scegliere"
        if not isinstance(i, int) or isinstance(i, bool) or not 0 <= i < len(self.bottino["carte"]):
            return "scelta non valida"
        self._nota(applica_carta(self.eroe(), self.bottino["carte"].pop(i), self))
        self.bottino["scelte"] -= 1
        if self.bottino["scelte"] <= 0 or not self.bottino["carte"]:
            self._chiudi_bottino()
        return self._fine()

    def salta_bottino(self):
        if self.fase != "bottino":
            return "nessun bottino da scegliere"
        self.gettoni += GETTONI_SALTO
        self._nota(f"Rinunci al bottino: +{GETTONI_SALTO} gettoni.")
        self._chiudi_bottino()
        return self._fine()

    def _chiudi_bottino(self):
        dopo = self.bottino["dopo"]
        self.bottino = None
        if dopo == "porte":
            self._apri_porte()
        else:
            self._entra_bracket()

    # ---------- le porte ----------
    def _apri_porte(self):
        eroe = self.eroe()
        tipi = _pesca(PESO_PORTE, 3)
        if salute(eroe)[0] < SOGLIA_RIPOSO and "riposo" not in tipi:
            tipi[random.randrange(3)] = "riposo"
        self.porte = [self._porta(t) for t in tipi]
        self.fase = "porte"

    def _porta(self, tipo):
        if tipo == "riposo":
            return {"tipo": "riposo", "titolo": "Riposo", "icona": "🛏️", "testo": "Una branda e un po' di tranquillità: recuperi tutta la vita e le ferite guariscono."}
        if tipo == "mercato":
            return {"tipo": "mercato", "titolo": "Mercato nero", "icona": "🛒", "testo": "Impianti, mutazioni e medikit in cambio di gettoni."}
        if tipo == "allenamento":
            return {"tipo": "allenamento", "titolo": "Allenamento", "icona": "🏋️", "testo": "Scegli tu: +1 a una statistica oppure +1 al rango di un potere."}
        if tipo == "sparring":
            return {"tipo": "sparring", "titolo": "Sparring d'élite", "icona": "⚔️", "regola": self._scegli_regola(dura=True), "rec": self._crea_elite(),
                    "testo": "Un campione più forte di te. Se vinci: 5 gettoni e un bottino di mutazioni rare. Se perdi: perdi tutti i gettoni e resti a un quarto della vita, ma la corsa continua."}
        eid = random.choice([e for e in EVENTI if e not in self.eventi_visti] or list(EVENTI))
        return {"tipo": "evento", "titolo": EVENTI[eid]["titolo"], "icona": EVENTI[eid]["icona"], "evento": eid,
                "testo": "Un incontro lungo la strada. Non sai come andrà a finire."}

    def _crea_elite(self, finale=False):
        usati = {e["nome"] for e in self.eroi}
        p = eroe_base(DB["attacchi"], DB["poteri"], DB["stances"], usati)
        rec = rec_da_pg(p, aspetto.genera(p.nome, [e["aspetto"] for e in self.eroi]))
        rec["elite"] = True
        for g in range(self.round + 2 + (1 if finale else 0) + self.giro_inf):          # (all'infinito l'élite cresce coi livelli)
            evolvi_cpu(rec, min(4, g + 2), giro=g)
        m = pesca_mutazione(rec, "rara", corsa=False)
        if m:
            dai_mutazione(rec, m["id"])
        return rec

    def scegli_porta(self, i):
        if self.fase != "porte":
            return "nessuna porta da scegliere"
        if not isinstance(i, int) or isinstance(i, bool) or not 0 <= i < len(self.porte):
            return "scelta non valida"
        porta = self.porte[i]
        self.porte = None
        self.avviso = []
        eroe = self.eroe()
        if porta["tipo"] == "riposo":
            cura(eroe, 1.0)
            self._nota("Riposi: vita al massimo e ferite guarite.")
            self._entra_bracket()
        elif porta["tipo"] == "mercato":
            self._apri_mercato()
        elif porta["tipo"] == "allenamento":
            self._apri_allenamento()
        elif porta["tipo"] == "sparring":
            self.sparring = {"rec": porta["rec"]}
            self.regola = porta["regola"]
            self.fase = "sparring"
        else:
            self._apri_evento(porta["evento"])
        return self._fine()

    # ---------- il mercato ----------
    def _prezzo(self, base):
        return max(1, math.ceil(base * (1 - min(SCONTO_MAX, bonus_corsa(self.eroe(), "sconto_mercato"))) * (1.5 if self.ascensione >= 3 else 1)))

    def _apri_mercato(self):
        eroe = self.eroe()
        offerte = []
        validi = equip_validi(eroe)
        for cat, it in random.sample(validi, min(3, len(validi))):
            offerte.append({"tipo": "equip", "cat": cat, "id": it["id"], "prezzo": self._prezzo(prezzo_equip(it))})
        scelte = set()
        for _ in range(2):
            m = pesca_mutazione(eroe, "maledetta" if random.random() < 0.2 else None, escludi=scelte)
            if m:
                scelte.add(m["id"])
                offerte.append({"tipo": "mutazione", "id": m["id"], "prezzo": self._prezzo(PREZZO_MUT[m["rarita"]])})
        offerte.append({"tipo": "medikit", "prezzo": self._prezzo(PREZZO_MEDIKIT)})
        self.mercato = {"offerte": offerte}
        self.fase = "mercato"

    def compra(self, i):
        if self.fase != "mercato":
            return "il mercato è chiuso"
        if not isinstance(i, int) or isinstance(i, bool) or not 0 <= i < len(self.mercato["offerte"]):
            return "scelta non valida"
        o = self.mercato["offerte"][i]
        if o.get("comprata"):
            return "già comprato"
        if self.gettoni < o["prezzo"]:
            return "gettoni insufficienti"
        eroe = self.eroe()
        if o["tipo"] == "equip":
            item = _def_item(o["cat"], o["id"])
            if not _controlla(eroe, o["cat"], item, False)[0]:
                return "non puoi montarlo (slot o Umanità)"
        self.gettoni -= o["prezzo"]
        o["comprata"] = True
        if o["tipo"] == "medikit":
            cura(eroe, 0.5)
            self._nota("Medikit: recuperi metà della vita mancante.")
        else:
            self._nota(applica_carta(eroe, o, self))
        return self._fine()

    def esci_mercato(self):
        if self.fase != "mercato":
            return "il mercato è chiuso"
        self.mercato = None
        self._entra_bracket()
        return self._fine()

    # ---------- l'allenamento ----------
    def _apri_allenamento(self):
        eroe = self.eroe()
        opz = [{"tipo": "stat", "stat": s, "da": eroe["stats"][s]} for s in stat_su(eroe)]
        opz += [{"tipo": "rango", "id": p["id"], "da": p["rango"], "a": p["rango"] + 1} for p in poteri_su(eroe)]
        self.allenamento = {"opzioni": opz}
        self.fase = "allenamento"
        if not opz:
            self.gettoni += 4
            self._nota("Non c'è più niente da imparare: ti pagano 4 gettoni per lo sparring a vuoto.")
            self.allenamento = None
            self._entra_bracket()

    def allena(self, i):
        if self.fase != "allenamento":
            return "nessun allenamento in corso"
        if not isinstance(i, int) or isinstance(i, bool) or not 0 <= i < len(self.allenamento["opzioni"]):
            return "scelta non valida"
        self._nota(applica_carta(self.eroe(), self.allenamento["opzioni"][i], self))
        self.allenamento = None
        self._entra_bracket()
        return self._fine()

    # ---------- gli eventi ----------
    def _apri_evento(self, eid):
        ev = EVENTI[eid]
        self.eventi_visti.append(eid)
        self.evento = {"id": eid, "titolo": ev["titolo"], "icona": ev["icona"], "testo": ev["testo"], "esito": None,
                       "scelte": [{"testo": s["testo"], "costo": s.get("costo", 0)} for s in ev["scelte"]]}
        self.fase = "evento"

    def scegli_evento(self, i):
        if self.fase != "evento" or self.evento["esito"] is not None:
            return "nessuna scelta in corso"
        scelte = EVENTI[self.evento["id"]]["scelte"]
        if not isinstance(i, int) or isinstance(i, bool) or not 0 <= i < len(scelte):
            return "scelta non valida"
        s = scelte[i]
        if self.gettoni < s.get("costo", 0):
            return "gettoni insufficienti"
        self.gettoni -= s.get("costo", 0)
        r, acc = random.random(), 0.0
        esito = s["esiti"][-1]
        for e in s["esiti"]:
            acc += e["p"]
            if r < acc:
                esito = e
                break
        righe = []
        for o in esito["ops"]:
            self._op_evento(o, righe)
        self.evento["esito"] = {"righe": list(esito["righe"]), "effetti": righe}
        self._nota(" ".join(esito["righe"] + righe))
        return self._fine()

    def _op_evento(self, o, righe):
        eroe = self.eroe()
        k = o["op"]
        if k == "cura":
            cura(eroe, o["frazione"])
            righe.append(f"Recuperi il {round(o['frazione'] * 100)}% della vita mancante.")
        elif k == "danno":
            ferisci(eroe, o["frazione"])
            righe.append(f"Perdi il {round(o['frazione'] * 100)}% della vita.")
        elif k == "gettoni":
            self.gettoni += o["valore"]
            righe.append(f"+{o['valore']} gettoni.")
        elif k == "punti":
            self._punti("eventi", o["valore"])
        else:
            frase = {"stat": lambda: self._evento_stat(o), "mutazione": lambda: self._evento_mutazione(o),
                     "equip": self._evento_equip, "rango": self._evento_rango}[k]()
            if frase is None:                              # niente da dare: ti ripagano in gettoni
                self.gettoni += 3
                frase = "Niente da guadagnare: ti danno 3 gettoni."
            righe.append(frase)

    def _evento_stat(self, o):
        eroe = self.eroe()
        cand = stat_su(eroe) if o["stat"] == "casuale" else [o["stat"]]
        if not cand:
            return None
        s = random.choice(cand)
        eroe["stats"][s] += o["delta"]
        return f"+{o['delta']} {s}."

    def _evento_mutazione(self, o):
        m = pesca_mutazione(self.eroe(), o["rarita"])
        if m is None:
            return None
        dai_mutazione(self.eroe(), m["id"])
        return f"Mutazione: {m['icona']} {m['nome']}."

    def _evento_equip(self):
        validi = equip_validi(self.eroe())
        if not validi:
            return None
        cat, it = random.choice(validi)
        dai_equip(self.eroe(), cat, it)
        return f"Impianto: {it['nome']}."

    def _evento_rango(self):
        cand = poteri_su(self.eroe())
        if not cand:
            return None
        p = random.choice(cand)
        p["rango"] += 1
        return f"{_def_potere(p['id'])['nome']} sale al rango {p['rango']}."

    def chiudi_evento(self):
        if self.fase != "evento" or self.evento["esito"] is None:
            return "l'evento non è finito"
        self.evento = None
        self._entra_bracket()
        return self._fine()

    # ---------- la fine ----------
    def _chiudi(self, titolo):
        eroe = self.eroe()
        righe = [("Vittorie", self.punti.get("vittorie", 0)), ("Sparring d'élite", self.punti.get("sparring", 0)),
                 ("Salute a fine duello", self.punti.get("salute", 0)), ("Duelli rapidi", self.punti.get("rapidita", 0)),
                 ("Eventi", self.punti.get("eventi", 0)),
                 ("Mutazioni", sum(PUNTI_MUT[MUTAZIONI[m]["rarita"]] for m in eroe["mutazioni"])),
                 (f"Gettoni avanzati ({self.gettoni})", self.gettoni * PUNTI_GETTONE)]
        if titolo:
            righe.append(("Titolo del Torneo Evo", PUNTI_TITOLO))
        righe = [list(r) for r in righe if r[1]]
        base = sum(p for _, p in righe)
        molt = 1 + BONUS_ASCENSIONE * self.ascensione
        totale = round(base * molt)
        raggiunto = "Campione" if titolo else NOMI_TURNI[min(self.round, 3)]
        record = totale > META["migliore"]
        self.migliore_altri = META["migliore"]
        META["corse"] += 1
        META["titoli"] += 1 if titolo else 0
        META["migliore"] = max(META["migliore"], totale)
        sbloccata = None
        if titolo and self.ascensione == META["ascensione_max"] and self.ascensione < ASCENSIONE_MAX:
            META["ascensione_max"] += 1
            sbloccata = ASCENSIONI[META["ascensione_max"]]["nome"]
        META["storico"].append({"eroe": eroe["nome"], "punteggio": totale, "turno": raggiunto, "titolo": titolo,
                                "ascensione": self.ascensione, "mutazioni": len(eroe["mutazioni"])})
        del META["storico"][:-12]
        self.riepilogo = {"righe": righe, "base": base, "moltiplicatore": molt, "totale": totale, "turno": raggiunto,
                          "record": record, "sbloccata": sbloccata, "titolo": titolo}

    def chiudi(self):
        """La corsa e' finita e il giocatore ha visto il riepilogo: si torna alla schermata iniziale."""
        if self.fase not in ("vittoria", "eliminato"):
            return "la corsa non è finita"
        salva(None)
        return None

    # ---------- per il client ----------
    def stato(self):
        eroe = self.eroe() if self.io is not None else None
        inf = self.infinito
        out = {"attivo": True, "fase": self.fase, "round": self.round, "nome_turno": f"Infinito {self.giro_inf + 1}" if inf else NOMI_TURNI[min(self.round, 3)],
               "ascensione": self.ascensione, "ascensione_nome": ASCENSIONI[self.ascensione]["nome"], "gettoni": self.gettoni, "io": self.io,
               "partecipanti": [{"nome": e["nome"], "potenza": forza(e)} for e in self.eroi], "turni": self.turni,
               "cronaca": self.cronaca[-6:], "avviso": self.avviso, "log_arena": self.log_arena[-6:], "campione": self.campione,
               "riepilogo": self.riepilogo, "meta": META, "puo_infinito": self.puo_infinito(),
               "punteggio_parziale": (self.riepilogo_titolo["base"] + self.punti.get("infinito", 0)) if inf and self.riepilogo_titolo else sum(self.punti.values()),
               "infinito": {"attivo": inf, "vinti": self.giro_inf, "livello": self.giro_inf + 1, "record": META["infinito_max"],
                            "boss": bool(inf and self.sfidante and self.sfidante.get("elite") and (self.fase == "bracket" or (self.fase == "duello" and self.duello_tipo == "torneo")))}}
        if self.fase == "campioni":
            out["candidati"] = [dict(scheda(self.eroi[i]), indice=i) for i in self.candidati]
        if eroe is not None:
            out["eroe"] = scheda(eroe)
        if self.fase in ("bracket", "duello", "sparring") and eroe is not None:
            avv = self.avversario()
            out["avversario"] = scheda(avv)
            out["regola"] = REGOLE[self.regola]
            out["pronostico"] = round(prob_vittoria(eroe, avv), 3)
            out["sparring"] = self.duello_tipo == "sparring" or self.fase == "sparring"
        if self.fase == "bottino":
            b = self.bottino
            out["bottino"] = {"tipo": b["tipo"], "carte": [self.descrivi(c) for c in b["carte"]], "costo_rilancio": self.costo_rilancio(),
                              "rilancio_possibile": b["tipo"] != "elite", "scelte": b["scelte"]}
        if self.fase == "porte":
            out["porte"] = [{k: v for k, v in p.items() if k != "rec"} | ({"avversario": scheda(p["rec"]), "regola_info": REGOLE[p["regola"]]}
                                                                          if p["tipo"] == "sparring" else {}) for p in self.porte]
        if self.fase == "mercato":
            out["mercato"] = [dict(self.descrivi(o), prezzo=o["prezzo"], comprata=bool(o.get("comprata"))) for o in self.mercato["offerte"]]
        if self.fase == "allenamento":
            out["allenamento"] = [self.descrivi(o) for o in self.allenamento["opzioni"]]
        if self.fase == "evento":
            ev = dict(self.evento)
            ev["scelte"] = [dict(s, disponibile=self.gettoni >= s["costo"]) for s in ev["scelte"]]
            out["evento"] = ev
        return out

    def descrivi(self, c):
        """Una carta (o un'offerta) in parole, per il client."""
        t = c["tipo"]
        if t == "potere":
            pw = _def_potere(c["id"])
            return {"tipo": t, "titolo": pw["nome"], "sotto": f"Nuovo potere, rango {c['rango']}", "descrizione": pw.get("descrizione", ""),
                    "mosse": mosse_potere(c["id"], c["rango"]), "icona": "⚡"}
        if t == "rango":
            pw = _def_potere(c["id"])
            return {"tipo": t, "titolo": pw["nome"], "sotto": f"Rango {c['da']} → {c['a']}", "descrizione": "Mosse e effetti più forti.",
                    "mosse": mosse_potere(c["id"], c["a"]), "icona": "⬆️"}
        if t == "stat":
            return {"tipo": t, "titolo": c["stat"].capitalize(), "sotto": f"{c['da']} → {c['da'] + 1}", "descrizione": "Una statistica in più.", "icona": "📈"}
        if t == "equip":
            it = _def_item(c["cat"], c["id"])
            return {"tipo": t, "titolo": it["nome"], "sotto": "Protesi" if c["cat"] == "protesi" else "Augment", "descrizione": it.get("descrizione", ""),
                    "icona": "🦾" if c["cat"] == "protesi" else "🔌", "umanita": it.get("costo_umanita", 0)}
        if t == "mutazione":
            m = MUTAZIONI[c["id"]]
            return {"tipo": t, "titolo": m["nome"], "sotto": f"Mutazione {m['rarita']}", "descrizione": m["descrizione"], "icona": m.get("icona", "🧬"),
                    "rarita": m["rarita"], "garantita": bool(c.get("garantita"))}
        return {"tipo": t, "titolo": "Medikit", "sotto": "Cura", "descrizione": "Recuperi metà della vita mancante.", "icona": "💉"}


def applica_carta(rec, c, corsa=None):
    """Una carta (o un'offerta del mercato, o un'opzione dell'allenamento) entra nel record. Ritorna la riga di cronaca."""
    t = c["tipo"]
    if t == "potere":
        rec["poteri"].append({"id": c["id"], "rango": min(c["rango"], rango_massimo(rec))})
        return f"Nuovo potere: {_def_potere(c['id'])['nome']}."
    if t == "rango":
        p = next(x for x in rec["poteri"] if x["id"] == c["id"])
        p["rango"] = min(4, p["rango"] + 1)
        return f"{_def_potere(c['id'])['nome']} sale al rango {p['rango']}."
    if t == "stat":
        rec["stats"][c["stat"]] = min(4, rec["stats"][c["stat"]] + 1)
        return f"+1 {c['stat']}."
    if t == "equip":
        it = _def_item(c["cat"], c["id"])
        dai_equip(rec, c["cat"], it)
        return f"Impianto montato: {it['nome']}."
    dai_mutazione(rec, c["id"])
    if corsa is not None:
        corsa.conta["mutazioni"] += 1
    return f"Mutazione: {MUTAZIONI[c['id']]['nome']}."
