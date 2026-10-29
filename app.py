"""Urban — app web (Flask). Modalità Arena: box, contratti, negozio, duelli.
Avvio: python app.py  →  http://127.0.0.1:5000
La logica di gioco vive in engine.py (condivisa con l'editor e con il harness balance.py).
"""
import json
import os
import random
import re
import time

from flask import (Flask, render_template, redirect, url_for, request,
                   jsonify, flash)

import math

import aspetto
import tattiche
from engine import (BONUS_RANGO, LOCAZIONI, STATS, SKILLS, FALLBACK, MAX_POTERI, DADO_BASE,
                    MARGINE_CAP, MARGINE_FATTORE, MIRA_PENALITA, MIRA_DURA_TURNO, costo_azioni, prob_supera,
                    umanita_max,
                    Personaggio, personaggio_casuale, eroe_base, carica_db,
                    bonus_colpire, dotazione_base, valuta, costo_upgrade)

BASE = os.path.dirname(os.path.abspath(__file__))
# URBAN_SAVE_DIR: test e harness di bilanciamento girano su una cartella temporanea e non
# toccano mai i dati reali dell'utente (personaggi, crediti, feedback)
SAVE_DIR = os.environ.get("URBAN_SAVE_DIR") or os.path.join(BASE, "save")
STATE_FILE = os.path.join(SAVE_DIR, "state.json")

CREDITI_INIZIALI = 300
RICOMPENSA_VITTORIA = 150
PREZZO_MEDIKIT = 30
RIGEN_HP_MIN = 5    # hp al minuto per locazione, da coscienti
RIGEN_COMA_MIN = 1  # hp al minuto in coma: uscirne richiede ore
N_CONTRATTI = 3

# quote: P(vittoria) = sigmoide(K_VALUTA * dvaluta + K_HP * dhp), ricavati con una regressione
# logistica su 20.000 duelli veri (valuta e hp al round 3); MARGINE_BANCO = 1/(1-10%)
K_VALUTA = 0.036
K_HP = 3.0
MARGINE_BANCO = 1.1

MAX_SCOMMESSA_TORNEO = 500  # puntata virtuale per round nel Torneo Evo (niente crediti reali in gioco)

# ---------------------------------------------------------------- sponsor (Arena + Torneo Evo)
# ogni sponsor paga un bonus SOLO se vinci E rispetti la condizione (verificata da
# DuelloWeb._sponsor_condizione, che legge lo stato tracciato durante il duello).
SPONSOR = [
    {"id": "lampo", "nome": "Sponsor Lampo", "bonus": 150,
     "descrizione": "Paga se vinci entro il round 3."},
    {"id": "bestia", "nome": "Sponsor Bestia", "bonus": 80,
     "descrizione": "Paga se vinci avendo attivato almeno un potere."},
    {"id": "stoico", "nome": "Sponsor Stoico", "bonus": 180,
     "descrizione": "Paga se vinci senza mai attivare un potere."},
    {"id": "incassatore", "nome": "Sponsor Incassatore", "bonus": 220,
     "descrizione": "Paga se vinci dopo essere sceso sotto il 30% degli hp totali."},
]

app = Flask(__name__)
app.secret_key = "urban-dev"  # ponytail: fisso in dev; da env quando andrà online
app.json.sort_keys = False    # le locazioni hp devono restare in ordine testa→gambe
DB = carica_db()


# ---------------------------------------------------------------- stato persistente
# hp massimi per locazione PRIMA dell'overhaul (testa 50, busto 150): servono solo a migrare
# i salvataggi esistenti alle proporzioni nuove (v. migra_stato)
LOCAZIONI_V1 = {"testa": 50, "busto": 150, "braccio_sx": 100, "braccio_dx": 100,
                "gamba_sx": 100, "gamba_dx": 100}
HP_VERSIONE = 2  # 1 = testa 50 / busto 150; 2 = proporzioni dell'overhaul (engine.LOCAZIONI)


def stato_default():
    return {"crediti": CREDITI_INIZIALI, "personaggi": [], "prossimo_id": 1,
            "contratti": [], "hp_versione": HP_VERSIONE}


def migra_stato(stato):
    """Salvataggi dell'overhaul precedente: gli hp attuali di testa e busto passano alle nuove
    proporzioni (un personaggio sano resta sano, uno ferito al 60% resta al 60%). I valori
    <= 0 (coma) non si toccano. Campo `hp_versione` opzionale: assente = 1. Ritorna True se ha
    cambiato qualcosa."""
    if stato.get("hp_versione", 1) >= HP_VERSIONE:
        return False
    for c in stato.get("personaggi", []) + stato.get("contratti", []):
        hp = c.get("hp") or {}
        for loc, vecchio in LOCAZIONI_V1.items():
            if loc in hp and hp[loc] > 0 and LOCAZIONI[loc] != vecchio:
                hp[loc] = max(1, round(hp[loc] * LOCAZIONI[loc] / vecchio))
    stato["hp_versione"] = HP_VERSIONE
    return True


def carica_stato():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return stato_default()


def salva_stato():
    os.makedirs(SAVE_DIR, exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(STATO, f, ensure_ascii=False, indent=1)


def assegna_aspetti(stato):
    """Personaggi (box e contratti) senza un aspetto valido (salvataggi precedenti): ognuno riceve il suo,
    diverso dagli altri (v. aspetto.py). Ritorna True se ha cambiato qualcosa."""
    tutti = stato.get("personaggi", []) + stato.get("contratti", [])
    usati = [c["aspetto"] for c in tutti if aspetto.valido(c.get("aspetto"))]
    cambiato = False
    for c in tutti:
        if not aspetto.valido(c.get("aspetto")):
            c["aspetto"] = aspetto.genera(c["nome"], usati)
            usati.append(c["aspetto"])
            cambiato = True
    return cambiato


STATO = carica_stato()
_cambiato = migra_stato(STATO)
_cambiato = assegna_aspetti(STATO) or _cambiato
if _cambiato:
    salva_stato()


# ---------------------------------------------------------------- personaggi persistenti
MAX_ARMI = 2  # slot arma nell'inventario di un eroe


def nuovo_record(p):
    """Personaggio del motore -> record salvabile. Cattura anche l'equip eventualmente
    già presente sul Personaggio (es. un campione del Torneo Evo che ha raccolto item
    durante il torneo): per un eroe appena creato questi campi sono comunque vuoti."""
    protesi_ids = [pr["id"] for loc in p.protesi_locazioni
                   for pr in DB["protesi"] if pr["locazione"] == loc]
    return {"id": None, "nome": p.nome, "data_nascita": p.data_nascita,
            "bio": p.bio, "stats": dict(p.stats), "skills": dict(p.skills),
            "poteri": [{"id": s["def"]["id"], "rango": s["rango"]} for s in p.poteri],
            "hp": dict(p.hp), "crippled": sorted(p.crippled),
            "livello": 1, "xp": 0, "token": 0, "toughness": 0,
            "armi": list(getattr(p, "armi_equip", []))[:MAX_ARMI],
            "armatura_equip": getattr(p, "armatura_equip_id", None),
            "protesi": protesi_ids,
            "augments": [s["def"]["id"] for s in p.augments],
            "vittorie": 0, "sconfitte": 0, "morto": False,
            "aspetto": getattr(p, "aspetto", None) or aspetto.genera(
                p.nome, [c.get("aspetto") for c in STATO["personaggi"] + STATO.get("contratti", [])]),
            "last_heal": time.time()}


def umanita_max_record(c):
    """(rango mente + rango sociale) * 2 — letto direttamente dal record, senza
    dover costruire un Personaggio completo solo per due statistiche."""
    return (c["stats"].get("mente", 1) + c["stats"].get("sociale", 1)) * 2


def umanita_usata(c):
    """Umanità già spesa in protesi/augment installati (il limite è umanita_max())."""
    tot = 0
    for pid in c.get("protesi", []):
        pr = next((x for x in DB["protesi"] if x["id"] == pid), None)
        tot += (pr or {}).get("costo_umanita", 0)
    for aid in c.get("augments", []):
        ag = next((x for x in DB["augments"] if x["id"] == aid), None)
        tot += (ag or {}).get("costo_umanita", 0)
    return tot


def record_to_pg(c):
    """Record salvato -> Personaggio pronto al duello (armatura/stance/effetti resettati)."""
    p = Personaggio(c["nome"], c.get("data_nascita", ""), c.get("bio", ""))
    p.aspetto = c["aspetto"] if aspetto.valido(c.get("aspetto")) else aspetto.genera(c["nome"])
    p.stats.update(c.get("stats", {}))
    p.skills.update(c.get("skills", {}))
    p.hp = {l: min(c.get("hp", {}).get(l, LOCAZIONI[l]), LOCAZIONI[l]) for l in LOCAZIONI}
    p.crippled = set(c.get("crippled", []))
    dotazione_base(p, DB["attacchi"], DB["stances"])
    for pw in c.get("poteri", []):
        pd = next((x for x in DB["poteri"] if x["id"] == pw["id"]), None)
        if pd:
            p.poteri.append({"def": pd, "rango": pw["rango"], "attivo": False})
    # armi (fino a 2 slot): sbloccano attacchi (es. Pistola). "equip" = vecchi salvataggi.
    for eid in c.get("armi", c.get("equip", []))[:MAX_ARMI]:
        eq = next((x for x in DB["equip"] if x["id"] == eid), None)
        for aid in (eq or {}).get("attacchi", []):
            att = next((x for x in DB["attacchi"] if x["id"] == aid), None)
            if att and all(x["id"] != att["id"] for x in p.attacchi):
                p.attacchi.append(att)
    # armatura (1 slot): hp extra, resistenze, stance — permanente per tutto il duello
    if c.get("armatura_equip"):
        arm = next((x for x in DB["armor"] if x["id"] == c["armatura_equip"]), None)
        if arm:
            p.equipaggia_armatura(arm, DB["stances"], DB["effetti"])
    # protesi: sostituiscono la locazione, sbloccano attacchi/stance permanentemente
    for pid in c.get("protesi", []):
        pr = next((x for x in DB["protesi"] if x["id"] == pid), None)
        if pr:
            p.equipaggia_protesi(pr, DB["attacchi"], DB["stances"], DB["effetti"])
    # augment: i passivi sono sempre attivi da subito; gli attivi restano pronti da innescare
    for aid in c.get("augments", []):
        ad = next((x for x in DB["augments"] if x["id"] == aid), None)
        if ad:
            slot = {"def": ad, "rango": 1, "attivo": False}
            p.augments.append(slot)
            if not ad.get("attivo", True):
                p.attiva_potere(slot, DB["attacchi"], DB["stances"], DB["effetti"])
    p.livello = c.get("livello", 1)
    return p


# ---------------------------------------------------------------- xp e level up
XP_BASE = 1000


def soglia_xp(livello):
    """XP per passare al livello successivo: esponenziale, base 1000.
    ponytail: 1.2 tiene i primi ~20 livelli raggiungibili (lv10 ~4.3k, lv20 ~26k)."""
    return int(XP_BASE * (1.2 ** (livello - 1)))


def prob_nuovo_potere():
    """Chance di sbloccare un potere a ogni level up, tarata sulla progressione:
    portare TUTTO a rango 4 costa 7 token a voce (1+2+4); con 1 token a livello,
    i (MAX_POTERI-1) poteri mancanti si spalmano su quell'arco di level up."""
    voci = len(STATS) + len(SKILLS) + MAX_POTERI
    return round((MAX_POTERI - 1) / (voci * 7), 3)


PROB_NUOVO_POTERE = prob_nuovo_potere()  # con 5 stat + 4 skill + 4 poteri: ~3.3%


def assegna_xp(rec, xp):
    """Aggiunge xp al record, gestendo level up, Token e sblocchi casuali."""
    note = [f"{rec['nome']} guadagna {xp} XP."]
    rec["xp"] = rec.get("xp", 0) + xp
    while rec["xp"] >= soglia_xp(rec.get("livello", 1)):
        rec["xp"] -= soglia_xp(rec["livello"])
        rec["livello"] = rec.get("livello", 1) + 1
        rec["token"] = rec.get("token", 0) + 1
        note.append(f"LIVELLO {rec['livello']}! +1 Token 🧬")
        if len(rec.get("poteri", [])) < MAX_POTERI and random.random() < PROB_NUOVO_POTERE:
            noti = {pw["id"] for pw in rec["poteri"]}
            nuovi = [pw for pw in DB["poteri"] if pw["id"] not in noti]
            if nuovi:
                pw = random.choice(nuovi)
                rec["poteri"].append({"id": pw["id"], "rango": 1})
                note.append(f"⚡ NUOVO POTERE SBLOCCATO: {pw['nome']}!")
    return note


def stato_salute(c):
    if c.get("morto"):
        return "morto"
    if c["hp"]["testa"] <= 0 or c["hp"]["busto"] <= 0:
        return "coma"
    if any(c["hp"][l] < LOCAZIONI[l] for l in LOCAZIONI):
        return "ferito"
    return "pronto"


def riposa(c, ora=None):
    """Cura passiva nel box in base al tempo reale trascorso.
    Più si è feriti più tempo serve; dal coma si esce molto lentamente."""
    if c.get("morto"):
        return
    ora = ora or time.time()
    minuti = (ora - c.get("last_heal", ora)) / 60.0
    if minuti < 1:
        return  # granularità al minuto: last_heal resta indietro e il tempo si accumula
    # ponytail: rate fisso ricalcolato a ogni visita; niente simulazione minuto-per-minuto
    rate = RIGEN_COMA_MIN if stato_salute(c) == "coma" else RIGEN_HP_MIN
    rate *= 1 + c.get("toughness", 0) / 100  # la Toughness accorcia guarigione e coma
    amt = int(minuti * rate)
    if amt <= 0:
        return
    for l in LOCAZIONI:
        c["hp"][l] = min(LOCAZIONI[l], c["hp"][l] + amt)
    c["crippled"] = [l for l in c.get("crippled", []) if c["hp"][l] < LOCAZIONI[l]]
    c["last_heal"] = ora


def minuti_recupero(c):
    """Stima dei minuti al pieno recupero (None se morto o già al pieno)."""
    if c.get("morto"):
        return None
    rate = RIGEN_COMA_MIN if stato_salute(c) == "coma" else RIGEN_HP_MIN
    rate *= 1 + c.get("toughness", 0) / 100
    mancanti = max(LOCAZIONI[l] - c["hp"][l] for l in LOCAZIONI)
    return None if mancanti <= 0 else int(mancanti / rate)


def riposa_tutti():
    ora = time.time()
    for c in STATO["personaggi"]:
        riposa(c, ora)
    salva_stato()


def trova_record(pid):
    return next((c for c in STATO["personaggi"] if c["id"] == pid), None)


def sconta_duello_pendente():
    """Se l'app era stata chiusa a duello in corso (marcatore su disco),
    quel duello conta come sconfitta a tavolino."""
    pid = STATO.pop("duello_pendente", None)
    if pid is None:
        return
    rec = trova_record(pid)
    if rec and not rec.get("morto"):
        rec["sconfitte"] = rec.get("sconfitte", 0) + 1
    salva_stato()


sconta_duello_pendente()


def costo_contratto(c):
    return 50 + 15 * sum(c["stats"].values()) + 60 * len(c["poteri"])


def genera_contratti():
    usati = {c["nome"] for c in STATO["personaggi"]}
    usati_asp = [c.get("aspetto") for c in STATO["personaggi"]]
    pool = []
    for _ in range(N_CONTRATTI):
        p = eroe_base(DB["attacchi"], DB["poteri"], DB["stances"], usati)
        usati.add(p.nome)
        p.aspetto = aspetto.genera(p.nome, usati_asp)   # ognuno ha il suo, diverso da quelli del box e degli altri contratti
        usati_asp.append(p.aspetto)
        rec = nuovo_record(p)
        rec["costo"] = costo_contratto(rec)
        pool.append(rec)
    STATO["contratti"] = pool
    salva_stato()


# ---------------------------------------------------------------- duello web
def pannello(p, turno):
    return {
        "nome": p.nome, "turno": turno, "sconfitto": p.sconfitto(),
        "aspetto": getattr(p, "aspetto", None),
        "hp": {l: {"val": p.hp[l], "max": p.hp_max[l], "arm": p.armatura.get(l, 0),
                   "crippled": l in p.crippled, "protesi": l in p.protesi_locazioni}
               for l in p.hp},
        "risorse": {"azioni": p.azioni, "n_azioni": p.n_azioni,
                    "bonus": p.bonus, "n_bonus": p.n_bonus,
                    "risposte": p.risposte, "n_risposte": p.n_risposte,
                    "stamina": p.stamina, "stamina_max": p.stamina_max()},
        "mira": p.mira,
        "stats": {s: p.stats[s] for s in STATS},
        "poteri": [{"id": s["def"]["id"], "nome": s["def"]["nome"],
                    "rango": s["rango"], "attivo": s["attivo"]} for s in p.poteri],
        "augments": [{"id": s["def"]["id"], "nome": s["def"]["nome"],
                     "attivo": s["attivo"], "passivo": not s["def"].get("attivo", True)}
                    for s in p.augments],
        "stance": [{"id": s["id"], "nome": s["nome"],
                    "turni": next((x["turni"] for x in p.stance_attive
                                   if x["def"]["id"] == s["id"]), None),
                    "cooldown": p.stato_stance(s)["cooldown"],
                    "usi_rimasti": p.stato_stance(s)["usi_rimasti"]}
                   for s in p.stance_conosciute],
        "effetti": [{"nome": e["def"]["nome"], "turni": e["turni"]}
                    for e in p.effetti_attivi],
        "emp_turni": p.emp_turni,
    }


# ---------------------------------------------------------------- profilo CPU (impara dai survey)
PROFILO_FILE = os.path.join(SAVE_DIR, "cpu_profile.json")
FEEDBACK_FILE = os.path.join(SAVE_DIR, "feedback.jsonl")
PROFILO_DEFAULT = {"potere_subito": 0.8, "mira": 0.35, "stance": 0.5,
                   "aggressivita": 0.7, "bias_matchmaking": 0}
# limiti delle manopole: un profilo saturo (0.95 su tutto, come nel save dopo molti survey
# "tutto no") renderebbe la CPU deterministica e ingiocabile. Vale anche in lettura, cosi' un
# cpu_profile.json gia' saturo non va riscritto. bias_matchmaking e' OBSOLETO (v. bias per
# personaggio): resta nel file per compatibilita' ma non viene mai letto.
LIMITI_PROFILO = {"potere_subito": (0.3, 0.9), "mira": (0.05, 0.6), "stance": (0.1, 0.8),
                  "aggressivita": (0.3, 0.9)}
BIAS_MAX = 2          # livelli di scarto massimo della CPU rispetto al personaggio
DUELLI_PER_RIENTRO = 3  # il bias rientra di 1 ogni tanti duelli


def _limita(profilo):
    for chiave, (lo, hi) in LIMITI_PROFILO.items():
        profilo[chiave] = round(min(hi, max(lo, profilo[chiave])), 3)
    return profilo


def carica_profilo():
    if os.path.exists(PROFILO_FILE):
        with open(PROFILO_FILE, encoding="utf-8") as f:
            return _limita({**PROFILO_DEFAULT, **json.load(f)})
    return dict(PROFILO_DEFAULT)


def salva_profilo():
    os.makedirs(SAVE_DIR, exist_ok=True)
    with open(PROFILO_FILE, "w", encoding="utf-8") as f:
        json.dump(PROFILO, f, ensure_ascii=False, indent=1)


PROFILO = carica_profilo()

# incontri registrati (le scelte del giocatore) e il modello di tattiche che la CPU ne impara: v. tattiche.py
INCONTRI_FILE = os.path.join(SAVE_DIR, "incontri.jsonl")
MODELLO = tattiche.Modello(tattiche.carica_incontri(INCONTRI_FILE))


def _stato_risposta(v):
    """Una risposta del survey a tre stati: "si" | "no" | "boh" (non so). Un client vecchio
    manda booleani: True e' un si', False NON si distingue da 'non ho spuntato' -> boh."""
    if v is True or v == "si":
        return "si"
    return "no" if v == "no" else "boh"


def aggiorna_profilo(risposte, rec=None):
    """Il survey di fine duello sposta le manopole dell'IA (limiti in LIMITI_PROFILO) e il bias
    del personaggio. Solo le risposte ESPLICITE contano: 'non so' (il default) non sposta nulla.
    Prima 'non spuntato' valeva 'no' e saturava le manopole.
    ponytail: euristica a piccoli passi, niente ML finche' non serve davvero."""
    r = {k: _stato_risposta(v) for k, v in risposte.items()}
    if not any(v != "boh" for v in r.values()):
        return  # survey saltato o tutto 'non so': non tara nulla

    def spingi(chiave, delta):
        lo, hi = LIMITI_PROFILO[chiave]
        PROFILO[chiave] = round(min(hi, max(lo, PROFILO[chiave] + delta)), 3)

    if rec is not None:  # il bias e' del personaggio: troppo debole/forte sposta di un livello
        if r.get("troppo_debole") == "si":
            rec["bias"] = min(BIAS_MAX, rec.get("bias", 0) + 1)
        if r.get("troppo_forte") == "si":
            rec["bias"] = max(-BIAS_MAX, rec.get("bias", 0) - 1)
    if r.get("mira_corretta") == "no":
        spingi("mira", 0.05)
    if r.get("parti_critiche") == "no":
        spingi("mira", 0.03)
    if r.get("poteri_corretti") == "no":
        spingi("potere_subito", 0.05)
    if r.get("tutti_poteri_subito") == "si":
        spingi("potere_subito", -0.08)  # dumpare tutto al primo turno e' prevedibile
    if r.get("prevedibile") == "si":
        spingi("aggressivita", -0.05)
        spingi("stance", 0.05)
    if r.get("partita_lunga") == "si":
        spingi("aggressivita", 0.08)
    if r.get("stance_corrette") == "no":
        spingi("stance", 0.05)
    salva_profilo()


def rientro_bias(rec):
    """A fine duello: il bias del personaggio rientra di 1 punto ogni DUELLI_PER_RIENTRO duelli."""
    if not rec.get("bias"):
        rec["bias_duelli"] = 0
        return
    rec["bias_duelli"] = rec.get("bias_duelli", 0) + 1
    if rec["bias_duelli"] >= DUELLI_PER_RIENTRO:
        rec["bias_duelli"] = 0
        rec["bias"] += -1 if rec["bias"] > 0 else 1


def _spendi_token_cpu(c, token, categorie=("stat", "skill", "potere")):
    """Spende token in upgrade casuali validi (stesse regole del giocatore), solo nelle `categorie`."""
    while True:
        opzioni = []
        for s in STATS:
            if "stat" in categorie and c.stats[s] < 4 and token >= costo_upgrade(c.stats[s]):
                opzioni.append(("stat", s, costo_upgrade(c.stats[s])))
        for s in SKILLS:
            if "skill" in categorie and c.skills[s] < 4 and token >= costo_upgrade(c.skills[s]):
                opzioni.append(("skill", s, costo_upgrade(c.skills[s])))
        for slot in c.poteri:
            # il rango di un potere non può superare il rango del dado controllo
            if ("potere" in categorie and slot["rango"] < 4 and slot["rango"] < c.stats["controllo"]
                    and token >= costo_upgrade(slot["rango"])):
                opzioni.append(("potere", slot, costo_upgrade(slot["rango"])))
        if not opzioni:
            return token
        tipo, ogg, costo = random.choice(opzioni)
        token -= costo
        if tipo == "stat":
            c.stats[ogg] += 1
        elif tipo == "skill":
            c.skills[ogg] += 1
        else:
            ogg["rango"] += 1


def _applica_item_a(p, categoria, item):
    """Equipaggia arma/armatura/augment su un Personaggio vivo (CPU o eroe del Torneo
    Evo): stessa applicazione di record_to_pg, ma senza passare da un record salvato."""
    if categoria == "arma":
        if not hasattr(p, "armi_equip"):
            p.armi_equip = []
        p.armi_equip.append(item["id"])
        for aid in item.get("attacchi", []):
            att = next((x for x in DB["attacchi"] if x["id"] == aid), None)
            if att and all(x["id"] != att["id"] for x in p.attacchi):
                p.attacchi.append(att)
    elif categoria == "armatura":
        p.equipaggia_armatura(item, DB["stances"], DB["effetti"])
        p.armatura_equip_id = item["id"]  # per ricostruire il record, v. nuovo_record
    else:  # augment
        slot = {"def": item, "rango": 1, "attivo": False}
        p.augments.append(slot)
        if not item.get("attivo", True):  # passivo: attivo da subito, per sempre
            p.attiva_potere(slot, DB["attacchi"], DB["stances"], DB["effetti"])


# ---------------------------------------------------------------- CPU: budget, non lotteria (4A)
XP_MEDIO_DUELLO = 200       # 300 XP a vittoria, 100 a sconfitta, ~50% di vittorie
FRAZIONE_BUDGET_CPU = 0.12  # quota dei crediti attesi che la CPU spende in equipaggiamento
BUDGET_CPU_MAX = 800        # tetto: i crediti crescono come 1,2^livello, la CPU no


def crediti_attesi(livello):
    """Crediti che un giocatore ha incassato, a spanne, arrivando a `livello`: i duelli che
    servono (XP totali / XP medi a duello), meta' vinti a RICOMPENSA_VITTORIA l'uno, piu'
    i crediti iniziali (L5 ~ 2.300¤, L12 ~ 18.000¤)."""
    xp = sum(soglia_xp(l) for l in range(1, livello))
    # ponytail: assume 50% di vittorie e nessuna spesa in cure/contratti; per un valore reale
    # leggere vittorie/sconfitte del personaggio (rec["vittorie"], rec["sconfitte"]).
    return CREDITI_INIZIALI + RICOMPENSA_VITTORIA * (xp / XP_MEDIO_DUELLO) / 2


def budget_cpu(livello):
    return int(min(BUDGET_CPU_MAX, FRAZIONE_BUDGET_CPU * crediti_attesi(livello)))


def _equipaggia_cpu(c, livello):
    """La CPU compra come un giocatore: spende al piu' budget_cpu(livello) crediti, scegliendo
    a caso tra gli stessi cataloghi del negozio con gli STESSI vincoli (2 armi, 1 armatura,
    una protesi per locazione, umanita' per protesi e augment). Prima ogni oggetto veniva
    assegnato con una probabilita' crescente col livello: a L5 l'80% delle CPU aveva un'arma,
    il 49% un'armatura e il 100% protesi o augment che il giocatore non puo' permettersi
    (un eroe nudo di L5 vinceva il 27%, mira del .md: 42-50%)."""
    c.armi_equip = []
    budget = budget_cpu(livello)
    umanita_libera = umanita_max(c)
    catalogo = ([("arma", x) for x in DB["equip"]] + [("armatura", x) for x in DB["armor"]]
                + [("protesi", x) for x in DB["protesi"]]
                + [("augment", x) for x in DB["augments"]])
    random.shuffle(catalogo)  # ponytail: ordine d'acquisto casuale, non per valore/prezzo
    for categoria, item in catalogo:
        prezzo = item.get("valore", 0)
        if prezzo > budget:
            continue
        if categoria == "arma" and len(c.armi_equip) >= MAX_ARMI:
            continue
        if categoria == "armatura" and getattr(c, "armatura_equip_id", None) is not None:
            continue
        if categoria in ("protesi", "augment"):
            costo = item.get("costo_umanita", 0)
            if costo > umanita_libera:
                continue
            if categoria == "protesi" and item["locazione"] in c.protesi_locazioni:
                continue
            if categoria == "augment" and any(s["def"]["id"] == item["id"] for s in c.augments):
                continue
            umanita_libera -= costo
        if categoria == "protesi":
            c.equipaggia_protesi(item, DB["attacchi"], DB["stances"], DB["effetti"])
        else:
            _applica_item_a(c, categoria, item)
        budget -= prezzo


def eroe_livello(livello, nomi_usati=()):
    """Un eroe di un certo livello SENZA equip: eroe base cresciuto con gli stessi Token e gli
    stessi sblocchi casuali di un giocatore. E' la base della CPU (poi equipaggiata) e il
    termine di paragone del harness (M9)."""
    c = eroe_base(DB["attacchi"], DB["poteri"], DB["stances"], set(nomi_usati))
    c.livello = livello
    for _ in range(livello - 1):  # stessi sblocchi casuali del giocatore
        if len(c.poteri) < MAX_POTERI and random.random() < PROB_NUOVO_POTERE:
            noti = {s["def"]["id"] for s in c.poteri}
            nuovi = [pw for pw in DB["poteri"] if pw["id"] not in noti]
            if nuovi:
                c.poteri.append({"def": random.choice(nuovi), "rango": 1, "attivo": False})
    _spendi_token_cpu(c, livello - 1)
    return c


def costo_rango(rango):
    """Token per portare una voce da rango 1 a `rango`."""
    return sum(costo_upgrade(r) for r in range(1, rango))


def token_spesi(c):
    """Token che il giocatore ha davvero investito, divisi in (statistiche + skill, poteri). La
    statistica che parte a rango 2 e' gratis."""
    ss = sum(costo_rango(v) for v in (*c.stats.values(), *c.skills.values())) - costo_rango(2)
    return max(0, ss), sum(costo_rango(s["rango"]) for s in c.poteri)


def eroe_speculare(giocatore, extra, nomi_usati=()):
    """Eroe che rispecchia la costruzione del giocatore: stesso numero di poteri (scelti a caso) con
    gli stessi ranghi, e gli stessi Token (+-`extra`) in statistiche e skill, spesi a caso. Il
    livello da solo non dice quanto e' forte un eroe: chi ha 4 poteri e uno a rango 4 finiva contro
    una CPU con un solo potere a rango 1, perche' i poteri della CPU erano solo una lotteria."""
    c = eroe_base(DB["attacchi"], DB["poteri"], DB["stances"], set(nomi_usati))
    ranghi = sorted((s["rango"] for s in giocatore.poteri), reverse=True)[:MAX_POTERI]
    noti = {s["def"]["id"] for s in c.poteri}
    altri = [pw for pw in DB["poteri"] if pw["id"] not in noti]
    random.shuffle(altri)
    for pw in altri[:max(0, len(ranghi) - len(c.poteri))]:
        c.poteri.append({"def": pw, "rango": 1, "attivo": False})
    random.shuffle(ranghi)
    for slot, r in zip(c.poteri, ranghi):
        slot["rango"] = r
    token = token_spesi(giocatore)[0] + extra
    # il rango di un potere non supera il Controllo: lo si alza prima, a carico dello stesso budget
    while c.stats["controllo"] < max(ranghi, default=1):
        token -= costo_upgrade(c.stats["controllo"])
        c.stats["controllo"] += 1
    _spendi_token_cpu(c, max(0, token), ("stat", "skill"))
    return c


def cpu_bilanciata(giocatore, bias=0):
    """Matchmaking: la CPU rispecchia la build del giocatore (poteri e Token spesi, v.
    eroe_speculare), scostata del bias DEL PERSONAGGIO (limitato a +-BIAS_MAX, v. aggiorna_profilo)
    e di un po' di variabilita' (un Token = un livello); equipaggiamento a budget di livello."""
    bias = max(-BIAS_MAX, min(BIAS_MAX, bias))
    extra = bias + random.choice((-1, 0, 0, 1))
    livello = max(1, getattr(giocatore, "livello", 1) + extra)
    c = eroe_speculare(giocatore, extra, {giocatore.nome})
    c.livello = livello
    _equipaggia_cpu(c, livello)
    c.aspetto = aspetto.genera(c.nome, [getattr(giocatore, "aspetto", None)])   # diverso da quello del giocatore
    return c


def stima_danno(att):
    """Danno base a spanne di un attacco (senza margine), per la scelta della CPU."""
    f = att.get("danno", {})
    media_dadi = sum(d.get("n", 1) * 5 for d in f.get("dadi", []))  # ~media di un dado medio
    return (media_dadi + f.get("flat", 0)) * f.get("mult", 1)


MARGINE_ATTESO = 7      # danno medio che il margine del tiro aggiunge a un colpo a segno
PENALITA_MORTE = 120    # peso (in hp) che l'IA dà a un colpo letale su testa/busto
RUMORE_DIFESA = 0.06    # probabilita' di una risposta "sbagliata" (l'IA non e' un calcolatore)


def stima_colpo(att):
    """Danno medio di un colpo a segno: danno base + margine atteso."""
    return stima_danno(att) + MARGINE_ATTESO


def descrizione_effetto(e):
    """Che cosa fa un effetto nel tempo, in una frase (la descrizione dei dati, o una generata)."""
    if e.get("descrizione"):
        return e["descrizione"].strip('" ')
    parti = []
    if e.get("tipo") == "danno":
        parti.append(f"danni da {e.get('tipo_danno') or 'varia natura'} a ogni turno")
    elif e.get("tipo") == "cura":
        parti.append("cura a ogni turno")
    for m in e.get("modificatori", []):
        t = m.get("tipo")
        if t == "mod_rango":
            parti.append(f"{m['statistica']} {m['delta']:+d} ranghi")
        elif t == "colpire":
            parti.append(f"{m['flat']:+d} ai tiri per colpire")
        elif t == "azioni":
            for k, nome in (("azioni", "azioni"), ("bonus", "azioni bonus"), ("risposte", "risposte")):
                if m.get(k):
                    parti.append(f"{m[k]:+d} {nome} per turno")
        elif t == "debolezza":
            parti.append(f"+50% ai danni di tipo {m.get('tipo_danno')}")
    return ", ".join(parti) or "effetto"


def descrizione_attacco(att):
    """Testo libero dell'attacco (senza il 'Danno base: N' scritto a mano nei dati)."""
    return re.sub(r"\s*Danno base: \d+", "", att.get("descrizione") or "").strip()


def info_attacco(att):
    """Che cosa fa un attacco, per il giocatore: descrizione, sigle delle regole e effetti."""
    colpi, flat = max(1, att.get("colpi", 1)), att.get("danno", {}).get("flat", 0)
    tipo = att.get("tipo_danno", "contundente")
    tags = []
    if flat > 0:
        if att.get("split_danni"):
            tags.append(f"{flat} danni {tipo} su tutto il corpo")
        elif colpi > 1:
            tags.append(f"{colpi} colpi da {flat} {tipo}")
        else:
            tags.append(f"{flat} danni {tipo}")
    else:
        tags.append("nessun danno diretto")
    tags.append("a distanza (non si para)" if att.get("ranged") else
                ("mischia" if att.get("parabile", True) else "mischia, non si para"))
    if not att.get("can_dodge", True):
        tags.append("non si schiva")
    if not att.get("can_aim", True):
        tags.append("non si mira")
    if costo_azioni(att) > 1:
        tags.append(f"{costo_azioni(att)} azioni")
    if att.get("cooldown_turni", 0):
        tags.append(f"ricarica {att['cooldown_turni']} turni")
    if att.get("usi_limitati"):
        tags.append(f"{att.get('usi_massimi', 1)} usi per duello")
    if att.get("speciale") == "assorbi_caratteristica":
        tags.append(f"scambia una statistica a caso per {att.get('speciale_turni', 3)} turni")
    effetti = []
    for sp in att.get("effetti_applicati", []):
        e = next((x for x in DB["effetti"] if x["id"] == sp.get("effetto")), None)
        if e:
            effetti.append({"nome": e["nome"], "turni": sp.get("turni", 1),
                            "desc": descrizione_effetto(e)})
    return {"nome": att["nome"], "desc": descrizione_attacco(att), "tags": tags, "effetti": effetti}


class DuelloWeb:
    """Stato del duello lato server, pilotato da /api/duello/azione."""

    def __init__(self, record=None, pg=None, avversario=None, torneo=None):
        self.rec = record  # None = duello senza box: torneo (o CPU vs CPU)
        self.torneo = torneo  # riferimento al TorneoEvo, se questo duello ne fa parte
        if record is not None:
            self.p = record_to_pg(record)
            self.cpu = cpu_bilanciata(self.p, record.get("bias", 0))
        else:
            self.p = pg
            self.cpu = avversario
        self.p.init_stamina()
        self.cpu.init_stamina()
        self.log = []
        self.eventi = []     # scambi strutturati per la scena del client (v. evento)
        self._n_ev = 0
        self.finito = False
        self.vincitore = None
        self.chiuso = False  # ricompense/salvataggio applicati
        self.survey_fatto = False
        self.fase = None     # "player" | "cpu" | "risposta" | "fine"
        self.pending = None
        # arena: scommesse/sponsor/pubblico — nei duelli veri e nel Torneo Evo (dove i bonus
        # vinti si accumulano nel montepremi e si riscattano solo diventando campioni)
        self.arena_attiva = record is not None or torneo is not None
        self.scommessa = None    # {"importo": int, "quota": float}
        self.sponsor = None      # uno degli elementi di SPONSOR, una volta scelto
        self.sponsor_offerte = random.sample(SPONSOR, 2) if self.arena_attiva else None
        # le scelte del giocatore si registrano solo nel gioco vero (duello del box o torneo), mai nel harness
        self.reg = tattiche.Registratore("torneo" if torneo is not None else "duello") if self.arena_attiva else None
        self.usato_potere = False   # per lo sponsor "stoico"/"bestia"
        self.min_hp_pct = 1.0       # hp minimi (%) toccati dal player, per "incassatore"
        self.hype = 50               # umore del pubblico, 0-100
        self.scriv("=== DUELLO ===")
        self.scriv(f"{self.p.nome} (LIV {getattr(self.p, 'livello', 1)}) contro "
                   f"{self.cpu.nome} (LIV {getattr(self.cpu, 'livello', 1)}) — "
                   f"potenziale {valuta(self.p)} vs {valuta(self.cpu)}.")
        while True:
            r1 = self.p.tira("riflessi", self.cpu)
            r2 = self.cpu.tira("riflessi", self.p)
            self.scriv(f"Iniziativa: {self.p.nome} tira {r1}, {self.cpu.nome} tira {r2}.")
            if r1 != r2:
                break
            self.scriv("Pareggio, si ritira.")
        self.ordine = [self.p, self.cpu] if r1 > r2 else [self.cpu, self.p]
        self.scriv(f"{self.ordine[0].nome} agisce per primo.")
        self.round = 0
        self.evento("inizio", nome1=self.p.nome, tiro1=r1, nome2=self.cpu.nome, tiro2=r2,
                    primo=self.ordine[0].nome)
        self.nuovo_round()

    # ---------- log ----------
    def scriv(self, msg, tag=None):
        if tag is None:
            if "CRIPPLED" in msg or "sconfitt" in msg:
                tag = "crit"
            elif "immune" in msg:
                tag = "immune"
        attivo = getattr(self, "attivo", None)  # di chi è il turno mentre scriviamo
        chi = None if attivo is None else ("p" if attivo is self.p else "c")
        self.log.append({"t": msg, "tag": tag, "chi": chi})

    def evento(self, tipo, i0=None, **dati):
        """Registra uno scambio per la scena del client. i0 = indice del log da cui prendere le
        righe di dettaglio (quelle indentate: effetti, armatura, resistenze, trigger)."""
        attivo = getattr(self, "attivo", None)
        self._n_ev += 1
        ev = {"n": self._n_ev, "round": self.round if hasattr(self, "round") else 0, "tipo": tipo,
              "chi": None if attivo is None else ("p" if attivo is self.p else "c"),
              "nome": attivo.nome if attivo is not None else None,
              "dettagli": ([x["t"].strip() for x in self.log[i0:] if x["t"].startswith("  ")]
                           if i0 is not None else [])}
        ev.update(dati)
        self.eventi.append(ev)
        del self.eventi[:-40]

    # ---------- flusso ----------
    def nuovo_round(self):
        self.round += 1
        self.idx = 0
        for p in (self.p, self.cpu):
            p.azioni, p.bonus, p.risposte = p.n_azioni, p.n_bonus, p.n_risposte
        self.scriv(f"— ROUND {self.round} —", "round")
        self.inizia_turno()

    def inizia_turno(self):
        self.attivo = self.ordine[self.idx]
        self.altro = self.ordine[1 - self.idx]
        self.scriv(f"▸ Turno di {self.attivo.nome}", "turno")
        i0 = len(self.log)
        for r in self.attivo.tick_turno():
            self.scriv("  " + r)
        self._riattiva_augment_passivi(self.attivo)
        if len(self.log) > i0:   # effetti nel tempo, stamina, scadenze: una scheda "inizio turno"
            self.evento("turno", i0)
        self._traccia_hp_minimo()  # copre anche i danni nel tempo (DoT)
        self.check_sconfitta(self.attivo, self.altro)
        if not self.finito:
            self.fase = "player" if self.attivo is self.p else "cpu"

    def _riattiva_augment_passivi(self, chi):
        """Un augment Passivo resta sempre acceso: se un EMP l'ha appena spento e
        ora è finito (emp_turni tornato a 0), lo riaccende in automatico.
        Idempotente: sugli augment già attivi non fa nulla."""
        if chi.emp_turni > 0:
            return
        for slot in chi.augments:
            if not slot["def"].get("attivo", True) and not slot["attivo"]:
                for r in chi.attiva_potere(slot, DB["attacchi"], DB["stances"], DB["effetti"]):
                    self.scriv("  " + r)

    def fine_turno(self):
        if MIRA_DURA_TURNO:
            self.attivo.mira = None   # una mira di turno non si porta in quello dopo
        if self.idx == 0:
            self.idx = 1
            self.inizia_turno()
        else:
            self.nuovo_round()

    def check_sconfitta(self, chi, vincitore):
        if chi.sconfitto() and not self.finito:
            self.finito = True
            self.fase = "fine"
            self.vincitore = vincitore
            self.scriv(f"*** {chi.nome} è sconfitto! {vincitore.nome} vince! ***", "crit")

    # ---------- arena: bookmaker live, sponsor, pubblico ----------
    def prob_vittoria(self):
        """Probabilita' stimata di vittoria del player: logistica del gap di potenziale piu' quello
        di hp (frazione degli hp totali rimasti) — coefficienti misurati su duelli veri (v.
        K_VALUTA/K_HP). A inizio duello e' il gap di valuta; poi segue chi sta perdendo vita."""
        hp_p = sum(max(0, self.p.hp[l]) for l in self.p.hp) / max(1, sum(self.p.hp_max.values()))
        hp_c = sum(max(0, self.cpu.hp[l]) for l in self.cpu.hp) / max(1, sum(self.cpu.hp_max.values()))
        z = K_VALUTA * (valuta(self.p) - valuta(self.cpu)) + K_HP * (hp_p - hp_c)
        return 1 / (1 + math.exp(-z))

    def quota_attuale(self):
        """Quota per una scommessa sul player: l'inverso della probabilita' di vittoria con il
        margine del banco (a 50% paga 2.2x, come prima). È la leva del comeback: favorito 1.4x ->
        perdi metà vita -> sfavorito e la stessa scommessa paga di più. Una quota alta corrisponde
        a una vera possibilità di impresa (la scala dei ranghi 0/1/2/3 le rende possibili)."""
        return round(min(6.0, max(1.1, MARGINE_BANCO / max(self.prob_vittoria(), 1e-6))), 2)

    def _traccia_hp_minimo(self):
        if not self.arena_attiva:
            return
        tot = sum(max(0, self.p.hp[l]) for l in self.p.hp)
        mx = sum(self.p.hp_max.values())
        self.min_hp_pct = min(self.min_hp_pct, tot / max(1, mx))

    def _hype(self, delta):
        self.hype = max(0, min(100, self.hype + delta))

    def pubblico_stato(self):
        if self.hype >= 80:
            testo = "Il pubblico è in delirio!"
        elif self.hype >= 60:
            testo = "La folla è elettrizzata."
        elif self.hype >= 40:
            testo = "Il pubblico segue con interesse."
        elif self.hype >= 20:
            testo = "Qualche fischio dagli spalti."
        else:
            testo = "Il pubblico si sta annoiando..."
        q = self.quota_attuale()
        if q >= 2.5:
            tifo = f"Il pubblico sogna la rimonta di {self.p.nome}!"
        elif q <= 1.4:
            tifo = f"Il pubblico dà per scontata la vittoria di {self.p.nome}."
        else:
            tifo = "Il pubblico è diviso, equilibrio totale."
        return {"hype": self.hype, "testo": testo, "tifo": tifo}

    def _sponsor_fallito(self, sp):
        """Per il display live: la condizione (a parte vincere) è già impossibile?"""
        if sp["id"] == "lampo":
            return self.round > 3
        if sp["id"] == "stoico":
            return self.usato_potere
        return False  # bestia/incassatore restano raggiungibili fino alla fine

    def _sponsor_condizione(self, sp):
        """Verifica finale (a fine duello) della condizione dello sponsor, vittoria esclusa."""
        return {"lampo": self.round <= 3, "bestia": self.usato_potere,
                "stoico": not self.usato_potere,
                "incassatore": self.min_hp_pct <= 0.30}.get(sp["id"], False)

    def info_arena(self):
        if not self.arena_attiva:
            return None
        sponsor_vivo = None
        if self.sponsor is not None:
            sponsor_vivo = dict(self.sponsor, fallito=self._sponsor_fallito(self.sponsor))
        return {
            "quota": self.quota_attuale(),
            "scommessa": self.scommessa,
            "crediti": STATO["crediti"],
            "sponsor_offerte": self.sponsor_offerte if self.sponsor is None else None,
            "sponsor": sponsor_vivo,
            "pubblico": self.pubblico_stato(),
            # nel torneo le vincite non toccano i crediti reali finché non diventi campione
            "torneo_pot": self.torneo.bonus_accumulato if self.torneo is not None else None,
        }

    # ---------- azioni comuni ----------
    def usa_potere(self, chi, slot):
        if not chi.puo_attivare_potere(slot):
            self.scriv(f"{slot['def']['nome']} è inutilizzabile: un arto è a 0 hp.")
            return
        chi.azioni -= 1
        i0 = len(self.log)
        for r in chi.attiva_potere(slot, DB["attacchi"], DB["stances"], DB["effetti"]):
            self.scriv(r)
        self.evento("potere", i0 + 1, titolo=slot["def"]["nome"], rango=slot["rango"],
                    desc=slot["def"].get("descrizione", ""), righe=[x["t"] for x in self.log[i0:]])
        if chi is self.p:
            self.usato_potere = True
        self._hype(4)

    def usa_augment(self, chi, slot):
        if not chi.puo_attivare_augment(slot):
            self.scriv(f"{slot['def']['nome']} non è attivabile ora.")
            return
        chi.azioni -= 1
        i0 = len(self.log)
        for r in chi.attiva_augment(slot, DB["attacchi"], DB["stances"], DB["effetti"]):
            self.scriv(r)
        self.evento("potere", i0 + 1, titolo=slot["def"]["nome"], rango=None,
                    desc=slot["def"].get("descrizione", ""), righe=[x["t"] for x in self.log[i0:]])
        if chi is self.p:
            self.usato_potere = True  # un augment è meccanicamente un potere
        self._hype(4)

    def usa_stance(self, chi, sdef, avversario):
        chi.bonus -= 1
        i0 = len(self.log)
        for r in chi.attiva_stance(sdef, avversario, DB["effetti"]):
            self.scriv(r)
        self.evento("stance", i0 + 1, titolo=sdef["nome"], desc=sdef.get("descrizione", ""),
                    righe=[x["t"] for x in self.log[i0:]])
        self._hype(2)

    def usa_attacco(self, att):
        a, d = self.attivo, self.altro
        a.azioni -= costo_azioni(att)
        a.consuma_attacco(att)
        mirata = a.mira if att.get("can_aim") else None
        if not MIRA_DURA_TURNO:  # mira di turno: la cancella fine_turno(), non un attacco
            a.mira = None
        colpi = max(1, att.get("colpi", 1))
        # la locazione si decide una volta sola per l'intero attacco (anche multi-colpo):
        # è quella annunciata qui, e resta la stessa fino alla risoluzione del danno —
        # niente più un secondo tiro casuale indipendente più avanti che la contraddice
        loc = mirata if mirata in d.hp else d.locazione_casuale()
        self.scriv(f"{a.nome} usa {att['nome']} su {d.nome}"
                   + (f", mirando a {loc}." if mirata else f" (locazione casuale: {loc}).")
                   + (f" — {colpi} colpi!" if colpi > 1 else ""))
        # chi è anch'esso in volo raggiunge un bersaglio in volo pure in mischia
        if (not att.get("ranged") and d.ha_flag("immune_melee")
                and not a.ha_flag("immune_melee")):
            self.scriv(f"{d.nome} è in volo: le mosse non a distanza non lo raggiungono!",
                       "immune")
            return
        self._tira_colpo(att, mirata, loc, colpi)

    def _tira_colpo(self, att, mirata, loc, colpi_rimasti):
        """Un tiro per colpire (il primo, o l'ennesimo di un attacco a colpi multipli).
        Un solo tiro contrapposto decide il colpo: la scelta del difensore (gratis o a
        costo di una risposta) determina quale skill tira, non se il colpo va tirato.
        Quando le risposte finiscono, i colpi successivi ricadono su "nessuna risposta"
        (riflessi, gratis ma debole) — un tiro vero, non un auto-hit."""
        a, d = self.attivo, self.altro
        skill = att.get("skill_colpire") or ("armi_distanza" if att.get("ranged")
                                             else "armi_corpo_a_corpo")
        pen_mira = MIRA_PENALITA if mirata else 0
        mod = bonus_colpire(a, d)
        ta = a.tira(skill, d) + mod
        tot = att.get("colpi", 1)
        etichetta = f" [colpo {tot - colpi_rimasti + 1}/{tot}]" if tot > 1 else ""
        self.scriv(f"{a.nome} tira per colpire{etichetta}: {ta} ({skill}"
                   + (f", {mod:+d} da stance" if mod else "") + ").")
        opzioni = ["nessuna risposta"]
        if d.risposte > 0:
            # parata: mischia (o "parata_sempre"), sempre disponibile come alternativa
            # a basso rischio — nel modello a un solo tiro non c'è più un pareggio a
            # monte da richiedere per sbloccarla
            if (not att.get("ranged") and att.get("parabile", True)) \
                    or d.ha_flag("parata_sempre"):
                opzioni.append("parata")
            if att.get("can_dodge") and d.puo_schivare():
                opzioni.append("schivata")
        self.pending = {"att": att, "ta": ta, "pen_mira": pen_mira, "loc": loc,
                        "opzioni": opzioni, "mirata": mirata, "colpi_rimasti": colpi_rimasti,
                        "skill": skill, "mod": mod}
        if d is self.cpu:
            # difesa a valore atteso (v. scegli_difesa): usa la risposta quando conviene,
            # non a caso (feedback "non ha schivato quando poteva farlo")
            scelta, loc_parata = self.scegli_difesa(d, self.pending)
            if len(opzioni) > 1:
                self.scriv(f"({d.nome} [CPU] sceglie: {scelta})")
            self.risolvi_risposta(scelta, loc_parata)
        elif len(opzioni) == 1:
            self.risolvi_risposta(opzioni[0])
        else:
            self.fase = "risposta"

    def _continua_o_fine(self, att, mirata, loc, colpi_rimasti):
        """Dopo che un colpo si è risolto (a segno o mancato): se l'attacco ne ha
        altri in coda tira il prossimo (stessa locazione annunciata all'inizio),
        altrimenti il turno torna disponibile."""
        if self.finito:
            return
        if colpi_rimasti > 1:
            self._tira_colpo(att, mirata, loc, colpi_rimasti - 1)
        else:
            self.fase = "player" if self.attivo is self.p else "cpu"

    # ---------- IA: valore atteso (OVERHAUL 4D) ----------
    @staticmethod
    def _skill_attacco(att):
        return att.get("skill_colpire") or ("armi_distanza" if att.get("ranged")
                                            else "armi_corpo_a_corpo")

    def _loc_parata(self, d, danno):
        """Dove incassare un colpo parato: l'arto con piu' hp rimasti; testa e busto solo se
        gli arti sono tutti ridotti male (sono le locazioni che decidono il duello)."""
        def costo(l):
            rimasto = d.hp[l] + d.armatura.get(l, 0) - danno
            critica = l in ("testa", "busto")
            return (1000 if critica and rimasto <= 0 else 0) + (200 if critica else 0) - rimasto
        return min(d.hp, key=costo)

    def scegli_difesa(self, d, pend):
        """Difesa a valore atteso per il difensore d. Il tiro d'attacco e' gia' noto: per
        ogni risposta disponibile si stima P(cavarsela) e la perdita attesa (un colpo letale
        su testa/busto pesa PENALITA_MORTE). La risposta e' UNA per round: si spende adesso
        solo se il risparmio supera il valore di tenerla per un secondo colpo (se l'attaccante
        ha ancora azioni). Ritorna (scelta, locazione di parata). Usata da CPU e harness."""
        a = self.attivo
        att, ta, pen, loc = pend["att"], pend["ta"], pend["pen_mira"], pend["loc"]
        opzioni = pend["opzioni"]
        if len(opzioni) == 1:
            return opzioni[0], None
        colpo = stima_colpo(att)
        mg = d.malus_gambe()
        split = att.get("split_danni", False)
        bonus_att = a.bonus_tiro(self._skill_attacco(att), d) + bonus_colpire(a, d)
        l_par = self._loc_parata(d, colpo / 2)
        # bonus di difesa calcolati UNA volta (la stima li usa decine di volte)
        b_dif = {"nessuna risposta": d.bonus_tiro("riflessi", a),
                 "parata": d.bonus_tiro("armi_corpo_a_corpo", a),
                 "schivata": d.bonus_tiro("acrobatica", a) + mg}

        def regge(opz, t_att):
            if opz == "schivata":
                return 1.0   # la schivata riesce sempre (v. risolvi_risposta)
            t = t_att - b_dif[opz] - pen   # serve d10 >= t
            return min(1.0, max(0.0, (DADO_BASE + 1 - t) / DADO_BASE))

        def perdita(dm, l):
            hp_eff = d.hp.get(l, 0) + d.armatura.get(l, 0)
            letale = (not split) and l in ("testa", "busto") and dm >= hp_eff
            return dm + (PENALITA_MORTE if letale else 0)

        def risparmio(t_att):
            e0 = (1 - regge("nessuna risposta", t_att)) * perdita(colpo, loc)
            migliore, scelta = e0, "nessuna risposta"
            if "parata" in opzioni:
                e = (1 - regge("parata", t_att)) * perdita(colpo / 2, l_par)
                if e < migliore:
                    migliore, scelta = e, "parata"
            if "schivata" in opzioni:
                e = (1 - regge("schivata", t_att)) * perdita(colpo, loc)
                if e < migliore:
                    migliore, scelta = e, "schivata"
            return e0 - migliore, scelta

        ora, scelta = risparmio(ta)
        altri_colpi = a.azioni > 0 or pend.get("colpi_rimasti", 1) > 1
        # ponytail: il prossimo colpo e' ignoto: lo si stima "medio" (tiro d10 + bonus dell'attaccante)
        # con probabilita' 0.8 che esista; non conosce l'attacco ne' le azioni che l'IA avversaria
        # sceglierebbe davvero. Per superarlo: enumerare i colpi giocabili dell'attaccante.
        tenere = 0.0
        if altri_colpi:  # valore atteso della risposta sul prossimo colpo (tiro ignoto)
            tenere = 0.8 * sum(risparmio(r + bonus_att)[0]
                               for r in range(1, DADO_BASE + 1)) / DADO_BASE
        if random.random() < RUMORE_DIFESA:
            scelta = random.choice(opzioni)
        elif ora <= tenere or ora <= 0.5:
            scelta = "nessuna risposta"
        t = self._tat()
        if t is not None and perdita(colpo, loc) < PENALITA_MORTE:   # un colpo letale non si lascia al caso
            scelta = t.scegli_risposta(tattiche.tipo_attacco(att), opzioni) or scelta
        return scelta, (l_par if scelta == "parata" else None)

    NOTE_DIFESA = {"nessuna risposta": "i tuoi riflessi, gratis: se falliscono il colpo ti prende",
                   "parata": "se fallisce il danno si dimezza e scegli dove incassarlo",
                   "schivata": "riesce sempre: nega tutto il colpo (costa la risposta del round)"}

    def prob_difesa(self, d, pend):
        """P(il difensore regge) per ogni risposta disponibile contro il colpo in sospeso: il tiro
        d'attacco e' gia' noto. Sono i numeri che il client mostra al giocatore, cosi' la scelta
        'brucio la risposta adesso o la tengo per il secondo colpo?' e' informata."""
        a = self.attivo
        ta, pen = pend["ta"], pend["pen_mira"]
        base = {"nessuna risposta": d.bonus_tiro("riflessi", a),
                "parata": d.bonus_tiro("armi_corpo_a_corpo", a),
                "schivata": d.bonus_tiro("acrobatica", a) + d.malus_gambe()}
        return {opz: 1.0 if opz == "schivata" else
                round(min(1.0, max(0.0, (DADO_BASE + 1 - (ta - base[opz] - pen)) / DADO_BASE)), 2)
                for opz in pend["opzioni"]}

    def p_colpire_stimata(self, att, a, d):
        """Probabilita' stimata che un attacco vada a segno: contro la MIGLIORE difesa che il
        bersaglio puo' permettersi ora (riflessi, e parata/schivata se ha ancora la risposta)."""
        pen = MIRA_PENALITA if (a.mira and att.get("can_aim")) else 0
        difese = [d.bonus_tiro("riflessi", a)]
        if d.risposte > 0:
            if (not att.get("ranged") and att.get("parabile", True)) or d.ha_flag("parata_sempre"):
                difese.append(d.bonus_tiro("armi_corpo_a_corpo", a))
            if att.get("can_dodge") and d.puo_schivare():
                return 0.0   # la schivata riesce sempre: contro la migliore difesa non si colpisce
        k = (a.bonus_tiro(self._skill_attacco(att), d) + bonus_colpire(a, d)
             - max(difese) - pen)
        return round(prob_supera(k), 2)

    def info_attacco_in_corso(self):
        """Cosa sta per colpire il giocatore (solo in fase 'risposta'): attacco, tiro, bersaglio,
        azioni che restano all'avversario e le probabilita' di ogni risposta."""
        pend, a = self.pending, self.attivo
        att = pend["att"]
        return {"attacco": att["nome"], "info": info_attacco(att), "attaccante": a.nome,
                "skill": pend.get("skill"), "tiro": pend["ta"], "locazione": pend["loc"],
                "mirata": bool(pend.get("mirata")), "split": att.get("split_danni", False),
                "colpo": att.get("colpi", 1) - pend.get("colpi_rimasti", 1) + 1,
                "colpi": att.get("colpi", 1), "azioni_avversario": a.azioni,
                "difese": [{"scelta": opz, "p": p, "nota": self.NOTE_DIFESA.get(opz, "")}
                           for opz, p in self.prob_difesa(self.p, pend).items()]}

    def ev_attacco(self, att, a, d):
        """Danno atteso PER AZIONE di un attacco: P(colpire) x danno / costo in azioni. Il
        difensore si stima sui riflessi; se ha ancora la risposta, parata (dimezza) e
        schivata (nega) ne tolgono una parte (fattori di risposta, a spanne)."""
        pen = MIRA_PENALITA if (a.mira and att.get("can_aim")) else 0
        k = (a.bonus_tiro(self._skill_attacco(att), d) + bonus_colpire(a, d)
             - d.bonus_tiro("riflessi", a) - pen)
        f = 1.0
        if d.risposte > 0:
            if (not att.get("ranged") and att.get("parabile", True)) \
                    or d.ha_flag("parata_sempre"):
                f = 0.75
            elif att.get("can_dodge") and d.puo_schivare():
                f = 0.9
        extra = 6 * len(att.get("effetti_applicati", []))  # un DoT/debuff vale qualcosa
        # ponytail: f (0.75 parata, 0.9 schivata) e il +6 per effetto sono a spanne; per un valore
        # esatto simulare la migliore difesa del bersaglio e il danno vero degli effetti.
        return prob_supera(k) * (stima_colpo(att) * f + extra) / costo_azioni(att)

    def scegli_attacco(self, a, d):
        """Attacco della CPU: col danno atteso piu' alto con probabilita' `aggressivita`,
        altrimenti a sorte ma PESATO sul valore (non uniforme: niente mosse assurde)."""
        giocabili = a.attacchi_giocabili()
        if not giocabili:
            return None
        punti = [(self.ev_attacco(x, a, d), x) for x in giocabili]
        t = self._tat()
        if t is not None:  # contrasta la difesa preferita del giocatore (v. Modello.moltiplicatore_attacco)
            punti = [(e * t.moltiplicatore_attacco(x), x) for e, x in punti]
        if random.random() < self._prob("aggressivita", "migliore"):
            return max(punti, key=lambda t: t[0])[1]
        return random.choices([x for _, x in punti], [max(0.05, e) for e, _ in punti])[0]

    def risolvi_risposta(self, scelta, loc_parata=None):
        pend, self.pending = self.pending, None
        a, d = self.attivo, self.altro
        att, ta, pen_mira = pend["att"], pend["ta"], pend["pen_mira"]
        loc_attacco = pend["loc"]  # locazione annunciata a inizio attacco: non cambia hit dopo hit
        loc = loc_attacco
        mirata, colpi_rimasti = pend.get("mirata"), pend.get("colpi_rimasti", 1)
        tipo_danno = att.get("tipo_danno", "contundente")
        quota_prima = self.quota_attuale() if self.arena_attiva else None
        mitiga_meta = False
        i0 = len(self.log)
        base = margine = danno = danno_reale = 0
        assorbito = 0
        arm_prima = sum(d.armatura.values())
        split = att.get("split_danni", False)
        skill_dif = {"parata": "armi corpo a corpo", "schivata": "acrobatica"}.get(scelta, "riflessi")
        if scelta == "parata":
            d.risposte -= 1
            # solo la parata sceglie con cosa assorbire QUESTO colpo: non è la locazione
            # dell'attacco, resta locale a questa risoluzione (i colpi successivi tornano
            # a mirare loc_attacco)
            loc = loc_parata if loc_parata in d.hp else random.choice(list(d.hp))
            td = d.tira("armi_corpo_a_corpo", a) + pen_mira
            self.scriv(f"{d.nome} para: {td} (armi corpo a corpo"
                       + (f" +{pen_mira} mira" if pen_mira else "") + f") contro {ta}.")
            colpito = td < ta
            if colpito:
                mitiga_meta = True  # la parata non nega, ma attutisce sempre a metà
                self.scriv(f"{d.nome} non blocca del tutto: colpo attutito.")
            else:
                self.scriv(f"{d.nome} para il colpo!", "miss")
        elif scelta == "schivata":
            d.risposte -= 1
            # la schivata riesce SEMPRE e non si tira: il costo e' la risposta del round, e la offrono
            # solo gli attacchi schivabili e chi ha le gambe sane (v. puo_schivare)
            td = None
            colpito = False
            self.scriv(f"{d.nome} schiva!", "miss")
        else:
            td = d.tira("riflessi", a) + pen_mira
            self.scriv(f"{d.nome} regge sui riflessi: {td} (riflessi"
                       + (f" +{pen_mira} mira" if pen_mira else "") + f") contro {ta}.")
            colpito = td < ta
            if not colpito:
                self.scriv(f"{d.nome} schiva d'istinto!", "miss")
        if not colpito:
            self._hype({"schivata": 6, "parata": 4}.get(scelta, -2))
            for r in a.scatta_trigger("manchi", d, DB["effetti"]):
                self.scriv("  " + r)
        else:
            margine = min(max(ta - td, 0), MARGINE_CAP) * MARGINE_FATTORE
            base = a.tira_formula(att["danno"], d)
            danno = base + margine
            if mitiga_meta:
                danno //= 2
            self.scriv(f"Colpito! {danno} danni ({tipo_danno})"
                       + (" suddivisi su tutto il corpo." if split else f" a {loc}."), "hit")
            hp_prima = sum(d.hp.values())
            for r in d.applica_danno(loc, danno, tipo_danno, split=split):
                self.scriv("  " + r)
            # il pubblico si accende per i colpi pesanti, e va in delirio se è
            # il player-sfavorito (quota alta) a piazzare il colpo: la rimonta
            bonus_hype = 8 if (split or danno >= d.hp_max.get(loc, 100) * 0.3) else 5
            if a is self.p and quota_prima is not None and quota_prima >= 2.5:
                bonus_hype += 10
            self._hype(bonus_hype)
            if att.get("speciale") == "assorbi_caratteristica":
                for r in a.assorbi_caratteristica(d, att.get("speciale_turni", 3)):
                    self.scriv("  " + r)
            danno_reale = hp_prima - sum(d.hp.values())
            assorbito = max(0, arm_prima - sum(d.armatura.values()))
            for r in d.applica_effetti(att.get("effetti_applicati", []),
                                       DB["effetti"], loc=loc):
                self.scriv("  " + r)
            for r in d.scatta_trigger("vieni_colpito", a, DB["effetti"]):
                self.scriv("  " + r)
            if danno_reale > 0:
                for r in a.scatta_trigger("fai_danni", d, DB["effetti"]):
                    self.scriv("  " + r)
                for r in d.scatta_trigger("subisci_danni", a, DB["effetti"]):
                    self.scriv("  " + r)
            self.check_sconfitta(d, a)
        self._traccia_hp_minimo()
        self.evento(
            "colpo", i0, attaccante=a.nome, difensore=d.nome, info=info_attacco(att),
            loc=loc, loc_att=loc_attacco, mirata=bool(mirata), split=split,
            colpo=att.get("colpi", 1) - colpi_rimasti + 1, colpi=att.get("colpi", 1),
            tiro_att=ta, skill_att=pend.get("skill"), mod_att=pend.get("mod", 0),
            risposta=scelta, tiro_dif=td, skill_dif=skill_dif, pen_mira=pen_mira,
            esito=("colpito" if colpito else {"parata": "parato", "schivata": "schivato"}.get(scelta, "retto")),
            mitigato=mitiga_meta, deviato=colpito and not split and loc != loc_attacco,
            base=base, margine=margine, danno=danno, tipo_danno=tipo_danno,
            hp_persi=danno_reale, assorbito=assorbito, ucciso=d.sconfitto(),
            effetti=info_attacco(att)["effetti"] if colpito else [])
        self._continua_o_fine(att, mirata, loc_attacco, colpi_rimasti)

    # ---------- CPU ----------
    # ---------- resa ----------
    def resa(self, chi):
        """Chi si arrende consegna la sconfitta ma evita danni ulteriori."""
        self.finito = True
        self.fase = "fine"
        self.vincitore = self.cpu if chi is self.p else self.p
        self.scriv(f"🏳 {chi.nome} si arrende! {self.vincitore.nome} vince.", "crit")

    def _cpu_vuole_arrendersi(self):
        """La CPU getta la spugna se ha subito danni troppo ingenti (mai nel Torneo Evo)."""
        if self.rec is None:  # duello di torneo: la resa non esiste
            return False
        c = self.cpu
        tot = sum(max(0, c.hp[l]) for l in c.hp)
        mx = sum(c.hp_max.values())
        if tot > mx * 0.25 and c.hp["testa"] > c.hp_max["testa"] * 0.2:
            return False
        return random.random() < 0.5  # malridotta: 50% a turno di alzare bandiera bianca

    def cpu_step(self):
        """Un'azione della CPU per volta (il client richiama con un delay).
        Le probabilità vengono dal PROFILO, che si aggiorna con i survey."""
        a = self.attivo
        if self._cpu_vuole_arrendersi():
            self.resa(self.cpu)
            return
        # gestione stamina: se il drain sta per prosciugarla, spegne il più costoso
        # (poteri e augment Attivi pesano sullo stesso pool, v. Personaggio._costo_stamina)
        attivi = [(s, True) for s in a.poteri if s["attivo"]] + \
                 [(s, False) for s in a.augments
                  if s["attivo"] and s["def"].get("attivo", True)]
        drain = sum(a._costo_stamina(s, ep) for s, ep in attivi)
        if attivi and a.bonus > 0 and a.stamina is not None and a.stamina < drain * 2:
            peggiore, _ = max(attivi, key=lambda t: a._costo_stamina(*t))
            a.bonus -= 1
            self.scriv(f"{a.nome} risparmia le forze.")
            i0 = len(self.log)
            for r in a.disattiva_potere(peggiore):
                self.scriv("  " + r)
            self.evento("info", i0, titolo="Risparmia le forze",
                        desc="Spegne il potere più costoso per non finire la stamina.")
            return
        # mira: solo se dopo resta un'azione per attaccare (mirare costa 1 azione:
        # senza questo guard la CPU alternava mira/attacco dimezzando i suoi danni
        # — v. feedback "non mi ha fatto danni")
        if (a.puo_mirare() and (a.mira_bonus or a.azioni >= 2)
                and random.random() < self._prob("mira", "mira")):
            a.consuma_mira()
            critiche = [l for l in ("testa", "busto") if l in self.altro.hp]
            t = self._tat()
            # dove mira il giocatore (se ha abitudini note), altrimenti sulle parti critiche
            a.mira = (t.scegli_locazione(list(self.altro.hp)) if t else None) or random.choice(critiche or list(self.altro.hp))
            self.scriv(f"{a.nome} prende la mira su {a.mira}.")
            self.evento("mira", loc=a.mira)
            return
        if a.azioni > 0:
            # attiva poteri/augment solo se la stamina li sostiene per almeno 2 turni di drain
            # (quello gia' acceso + il nuovo): (drain + costo) * 2. VOLUTO: con statistiche
            # basse un potere di rango alto (r4 ha stamina 6 e costa 4/turno) la CPU non lo usa
            # mai, come un giocatore che non lo accenderebbe per spegnerlo al turno dopo.
            sostenibili = [(s, self.usa_potere) for s in a.poteri
                           if not s["attivo"] and a.puo_attivare_potere(s)
                           and (a.stamina or 0) >= (drain + s["rango"]) * 2] + \
                          [(s, self.usa_augment) for s in a.augments
                           if s["def"].get("attivo", True) and not s["attivo"]
                           and a.puo_attivare_augment(s)
                           and (a.stamina or 0) >= (drain + s["def"].get("costo_stamina", 1)) * 2]
            if sostenibili and random.random() < self._prob("potere_subito", "potere"):
                slot, azione = random.choice(sostenibili)
                azione(a, slot)
                return
            scelto = self.scegli_attacco(a, self.altro)
            if scelto is not None:
                self.usa_attacco(scelto)
                return
        if a.bonus > 0 and random.random() < self._prob("stance", "stance"):
            disponibili = [s for s in a.stance_conosciute
                           if all(x["def"]["id"] != s["id"] for x in a.stance_attive)
                           and a.puo_attivare_stance(s)]
            if disponibili:
                self.usa_stance(a, random.choice(disponibili), self.altro)
                return
        self.fine_turno()

    # ---------- API player ----------
    # ---------- registro delle scelte del giocatore (v. tattiche.py) ----------
    def _occasioni(self):
        """Che cosa poteva fare il giocatore adesso (stesse condizioni che la CPU usa per scegliere)."""
        a = self.p
        return {"mira": a.puo_mirare() and (a.mira_bonus or a.azioni >= 2),
                "potere": a.azioni >= 1 and (any(not s["attivo"] and a.puo_attivare_potere(s) for s in a.poteri)
                                             or any(s["def"].get("attivo", True) and not s["attivo"]
                                                    and a.puo_attivare_augment(s) for s in a.augments)),
                "stance": a.bonus >= 1 and any(all(x["def"]["id"] != s["id"] for x in a.stance_attive)
                                               and a.puo_attivare_stance(s) for s in a.stance_conosciute)}

    def _pre_registro(self, dati):
        """La decisione che il giocatore sta per prendere, con il suo contesto (prima che lo stato cambi);
        None se non va registrata."""
        if self.reg is None or self.finito:
            return None
        tipo, a, r = dati.get("tipo"), self.p, self.round
        if tipo == "risposta" and self.fase == "risposta" and self.pending:
            pend = self.pending
            return {"k": "risposta", "r": r, "scelta": dati.get("scelta"), "opz": list(pend["opzioni"]),
                    "t": tattiche.tipo_attacco(pend["att"]), "p": self.prob_difesa(self.p, pend)}
        if self.fase != "player":
            return None
        occ = self._occasioni()
        if tipo == "mira":
            return {"k": "mira", "r": r, "occ": occ, "loc": dati.get("loc")}
        if tipo == "attacco":
            att = next((x for x in a.attacchi_visibili() if x["id"] == dati.get("id")), None)
            if att is None:
                return None
            ev = {x["id"]: self.ev_attacco(x, a, self.cpu) for x in a.attacchi_giocabili()}
            best = att["id"] in ev and ev[att["id"]] >= max(ev.values()) - 1e-9
            return {"k": "attacco", "r": r, "occ": occ, "id": att["id"], "t": tattiche.tipo_attacco(att),
                    "mirata": a.mira if att.get("can_aim") else None, "best": best}
        if tipo in ("potere", "augment", "stance"):
            return {"k": tipo, "r": r, "occ": occ, "id": dati.get("id")}
        if tipo == "fine_turno":
            return {"k": "fine_turno", "r": r, "occ": occ}
        return None

    def azione_player(self, dati):
        """Esegue un'azione del giocatore, registrandola se riesce; ritorna un messaggio d'errore o None."""
        pre = self._pre_registro(dati)
        err = self._azione_player(dati)
        if pre is not None and err is None:
            self.reg.azione(pre.pop("k"), pre.pop("r"), pre.pop("occ", None), **pre)
        return err

    def _tat(self):
        """Il modello delle tattiche del giocatore, se questo duello ne usa uno (gioco vero, con dati a sufficienza)."""
        return MODELLO if self.reg is not None and MODELLO.pronto else None

    def _prob(self, chiave, tasso):
        """Una manopola del profilo CPU, spostata verso le abitudini del giocatore (v. Modello.fondi)."""
        t = self._tat()
        return PROFILO[chiave] if t is None else t.fondi(PROFILO[chiave], tasso)

    def _azione_player(self, dati):
        """Esegue un'azione del giocatore; ritorna un messaggio d'errore o None."""
        tipo = dati.get("tipo")
        if self.finito and tipo != "cpu_step":
            return "il duello è concluso"
        if tipo == "risposta":
            if self.fase != "risposta":
                return "nessuna risposta attesa"
            scelta = dati.get("scelta")
            if scelta not in self.pending["opzioni"]:
                return "scelta non valida"
            self.risolvi_risposta(scelta, dati.get("loc"))
            return None
        if tipo == "cpu_step":
            if self.fase == "cpu" and not self.finito:
                self.cpu_step()
            return None
        if tipo == "scommetti":
            # si può scommettere su se stessi in qualsiasi momento del duello,
            # non solo nel proprio turno: è la leva del "comeback" del bookmaker live
            if not self.arena_attiva:
                return "questa modalità non ha scommesse"
            if self.scommessa is not None:
                return "hai già scommesso su questo duello"
            importo = dati.get("importo")
            if not isinstance(importo, int) or importo <= 0:
                return "importo non valido"
            if self.rec is not None:
                # duello vero: puntata reale, scalata subito dai crediti
                if importo > STATO["crediti"]:
                    return "crediti insufficienti"
                STATO["crediti"] -= importo
                salva_stato()
            elif self.torneo is not None and importo > MAX_SCOMMESSA_TORNEO:
                return f"puntata massima nel torneo: {MAX_SCOMMESSA_TORNEO}¤"
            quota = self.quota_attuale()
            self.scommessa = {"importo": importo, "quota": quota}
            extra = (" (nel montepremi del torneo: si riscatta solo diventando campione)"
                    if self.torneo is not None else "")
            self.scriv(f"🎰 Scommessa piazzata: {importo}¤ su {self.p.nome} a quota {quota}x{extra}.")
            return None
        if tipo == "sponsor":
            if not self.arena_attiva:
                return "questa modalità non ha sponsor"
            if self.sponsor is not None:
                return "hai già scelto uno sponsor"
            sp = next((s for s in (self.sponsor_offerte or []) if s["id"] == dati.get("id")), None)
            if sp is None:
                return "sponsor non disponibile"
            self.sponsor = sp
            self.scriv(f"📣 {sp['nome']} ti sponsorizza: {sp['descrizione']}")
            return None
        if self.fase != "player":
            return "non è il tuo turno"
        a = self.p
        if tipo == "resa":
            if self.rec is None:
                return "nel Torneo Evo non ci si arrende"
            self.resa(self.p)
        elif tipo == "fine_turno":
            self.fine_turno()
        elif tipo == "mira":
            if not a.puo_mirare():
                return "non puoi prendere la mira"
            loc = dati.get("loc")
            if loc not in self.cpu.hp:
                return "locazione non valida"
            a.consuma_mira()
            a.mira = loc
            self.scriv(f"{a.nome} prende la mira su {loc} "
                       f"(+{MIRA_PENALITA} alla difficoltà, "
                       + ("i colpi mirabili di questo turno puntano lì)." if MIRA_DURA_TURNO
                          else "il prossimo attacco punta lì)."))
            self.evento("mira", loc=loc)
        elif tipo == "attacco":
            att = next((x for x in a.attacchi_visibili() if x["id"] == dati.get("id")), None)
            if att is None:
                return "attacco non disponibile"
            if not a.puo_pagare_attacco(att):
                return ("azioni esaurite" if a.azioni < 1
                        else f"{att['nome']} costa {costo_azioni(att)} azioni")
            if not a.puo_usare_attacco(att):
                return "attacco in ricarica o senza utilizzi rimasti"
            self.usa_attacco(att)
        elif tipo == "potere":
            slot = next((s for s in a.poteri
                         if s["def"]["id"] == dati.get("id") and not s["attivo"]), None)
            if slot is None:
                return "potere non disponibile"
            if a.azioni < 1:
                return "azioni esaurite"
            if not a.puo_attivare_potere(slot):
                return "potere inutilizzabile: un arto è a 0 hp"
            self.usa_potere(a, slot)
        elif tipo == "disattiva_potere":
            slot = next((s for s in a.poteri
                         if s["def"]["id"] == dati.get("id") and s["attivo"]), None)
            if slot is None:
                return "potere non attivo"
            if a.bonus < 1:
                return "azioni bonus esaurite"
            a.bonus -= 1
            for r in a.disattiva_potere(slot):
                self.scriv(r)
        elif tipo == "augment":
            slot = next((s for s in a.augments
                         if s["def"]["id"] == dati.get("id") and not s["attivo"]), None)
            if slot is None:
                return "augment non disponibile"
            if a.azioni < 1:
                return "azioni esaurite"
            if not a.puo_attivare_augment(slot):
                return "augment inutilizzabile (EMP o utilizzi esauriti)"
            self.usa_augment(a, slot)
        elif tipo == "disattiva_augment":
            slot = next((s for s in a.augments
                         if s["def"]["id"] == dati.get("id") and s["attivo"]
                         and s["def"].get("attivo", True)), None)
            if slot is None:
                return "augment non attivo"
            if a.bonus < 1:
                return "azioni bonus esaurite"
            a.bonus -= 1
            for r in a.disattiva_potere(slot):
                self.scriv(r)
        elif tipo == "stance":
            sdef = next((s for s in a.stance_conosciute
                         if s["id"] == dati.get("id")
                         and all(x["def"]["id"] != s["id"] for x in a.stance_attive)), None)
            if sdef is None:
                return "stance non disponibile"
            if a.bonus < 1:
                return "azioni bonus esaurite"
            if not a.puo_attivare_stance(sdef):
                return "stance in ricarica o senza utilizzi rimasti"
            self.usa_stance(a, sdef, self.cpu)
        else:
            return "azione sconosciuta"
        return None

    def azioni_player(self):
        a = self.p
        return {
            "attacchi": [{"id": x["id"], "nome": x["nome"],
                          "tipo_danno": x.get("tipo_danno", "contundente"),
                          "costo_azioni": costo_azioni(x),
                          "colpi": x.get("colpi", 1), "info": info_attacco(x),
                          "p_colpire": self.p_colpire_stimata(x, a, self.cpu),
                          "ok": a.puo_pagare_attacco(x) and a.puo_usare_attacco(x),
                          "cooldown": a.stato_attacco(x)["cooldown"],
                          "usi_rimasti": a.stato_attacco(x)["usi_rimasti"]}
                         for x in a.attacchi_visibili()],
            "mira": a.puo_mirare(),
            "mira_costo": "bonus" if a.mira_bonus else "azione",
            "poteri": [{"id": s["def"]["id"], "nome": s["def"]["nome"],
                        "rango": s["rango"], "desc": s["def"].get("descrizione", ""),
                        "ok": a.azioni >= 1 and a.puo_attivare_potere(s),
                        "rotto": not a.puo_attivare_potere(s)}
                       for s in a.poteri if not s["attivo"]],
            "poteri_attivi": [{"id": s["def"]["id"], "nome": s["def"]["nome"],
                               "rango": s["rango"], "ok": a.bonus >= 1}
                              for s in a.poteri if s["attivo"]],
            # solo gli augment Attivi compaiono qui: i Passivi non hanno un bottone,
            # sono sempre accesi (vedi record_to_pg)
            "augment": [{"id": s["def"]["id"], "nome": s["def"]["nome"],
                        "desc": s["def"].get("descrizione", ""),
                        "ok": a.azioni >= 1 and a.puo_attivare_augment(s)}
                       for s in a.augments if s["def"].get("attivo", True) and not s["attivo"]],
            "augment_attivi": [{"id": s["def"]["id"], "nome": s["def"]["nome"],
                                "turni_rimasti": s.get("turni_rimasti"), "ok": a.bonus >= 1}
                               for s in a.augments
                               if s["attivo"] and s["def"].get("attivo", True)],
            "stance": [{"id": s["id"], "nome": s["nome"], "desc": s.get("descrizione", ""),
                        "ok": a.bonus >= 1 and a.puo_attivare_stance(s),
                        "cooldown": a.stato_stance(s)["cooldown"],
                        "usi_rimasti": a.stato_stance(s)["usi_rimasti"]}
                       for s in a.stance_conosciute
                       if all(x["def"]["id"] != s["id"] for x in a.stance_attive)],
        }

    def stato(self):
        return {
            "fase": self.fase, "round": self.round, "finito": self.finito,
            "vincitore": self.vincitore.nome if self.vincitore else None,
            "vinto_dal_player": self.vincitore is self.p if self.finito else None,
            "ricompensa": RICOMPENSA_VITTORIA,
            "log": self.log,
            "player": pannello(self.p, self.attivo is self.p and not self.finito),
            "cpu": pannello(self.cpu, self.attivo is self.cpu and not self.finito),
            "opzioni": (self.pending or {}).get("opzioni", []) if self.fase == "risposta" else [],
            "in_corso": self.info_attacco_in_corso() if self.fase == "risposta" else None,
            "eventi": self.eventi[-12:],
            "menu": self.azioni_player() if self.fase == "player" else None,
            "locazioni": list(LOCAZIONI),
            "mira_pen": MIRA_PENALITA, "mira_dura_turno": MIRA_DURA_TURNO,
            "survey_fatto": self.survey_fatto,
            "torneo": self.rec is None,
            "arena": self.info_arena(),
        }


DUELLO = None  # ponytail: un solo duello alla volta (single-player locale)


# ---------------------------------------------------------------- torneo evo
class TorneoEvo:
    """Eliminazione diretta a 16: si parte da eroi base che evolvono a ogni turno.
    Il giocatore usa un personaggio casuale (non del box); se vince, entra nel box.
    ponytail: vive in memoria come DUELLO — riavviare il server azzera il torneo."""

    NOMI_TURNI = ["Ottavi", "Quarti", "Semifinale", "Finale"]
    STATS_POTENZIABILI = ("fisico", "riflessi", "mente", "sociale")

    def __init__(self):
        usati = set()
        self.eroi = []
        for _ in range(16):
            e = eroe_base(DB["attacchi"], DB["poteri"], DB["stances"], usati)
            usati.add(e.nome)
            e.armi_equip = []  # slot armi del torneo: vive sull'eroe, non su un record
            e.aspetto = aspetto.genera(e.nome, [x.aspetto for x in self.eroi])   # 16 aspetti tutti diversi
            self.eroi.append(e)
        self.io = random.randrange(16)
        ordine = list(range(16))
        random.shuffle(ordine)
        self.turni = [[{"a": ordine[i], "b": ordine[i + 1], "win": None}
                       for i in range(0, 16, 2)]]
        self.round = 0
        self.fase = "intro"  # intro | pronto | duello | risultato | oggetto | vittoria | eliminato
        self.scelte = None
        self.scelte_item = None
        self.campione = None
        # arena: le vincite di scommesse/sponsor di ogni round si accumulano qui e si
        # riscattano in crediti reali solo se si diventa campioni; altrimenti vanno perse
        self.bonus_accumulato = 0
        self.log_arena = []

    # ---------- bracket ----------
    def mio_match(self):
        return next((m for m in self.turni[self.round]
                     if self.io in (m["a"], m["b"])), None)

    def avversario_idx(self):
        m = self.mio_match()
        return m["b"] if m["a"] == self.io else m["a"]

    def _vince_cpu(self, a, b):
        """Scontro tra due CPU: stessa logistica delle quote (chi ha 30 punti di valuta in piu'
        vince ~75%, non il 59% del vecchio rapporto va/(va+vb))."""
        dv = valuta(self.eroi[a]) - valuta(self.eroi[b])
        return a if random.random() < 1 / (1 + math.exp(-K_VALUTA * dv)) else b

    # ---------- crescita ----------
    def _cura_totale(self, e):
        """Fine round: tutti i danni del round vengono curati (anche gli arti CRIPPLED), stamina piena."""
        for l in e.hp:
            e.hp[l] = e.hp_max[l]
        e.crippled = set()
        e.init_stamina()

    def _reset_combattimento(self, e):
        """Riporta l'eroe fuori dallo stato di duello (poteri spenti, effetti puliti)."""
        for slot in e.poteri:
            if slot.get("attivo"):
                e.disattiva_potere(slot)
        for slot in e.augments:
            # solo gli Attivi innescati a mano: i Passivi restano sempre accesi
            if slot["attivo"] and slot["def"].get("attivo", True):
                e.disattiva_potere(slot)
        e.effetti_attivi = []
        e.stance_attive = []
        e.stance_stato = {}
        e.attacco_stato = {}
        e.swap_attivi = []
        e.mira = None
        e.emp_turni = 0

    # ---------- equipaggiamento (armi/armatura/augment, pool condivisa col negozio) ----------
    def _pool_item_validi(self, e):
        """Item che l'eroe può ancora ricevere ora: stesso vincolo di slot/umanità di
        un personaggio vero (niente doppioni, niente sforare l'umanità disponibile)."""
        pool = [("arma", eq) for eq in DB["equip"]
                if len(e.armi_equip) < MAX_ARMI and eq["id"] not in e.armi_equip]
        pool += [("armatura", a) for a in DB["armor"]]
        umanita_libera = umanita_max(e) - sum(s["def"].get("costo_umanita", 0)
                                              for s in e.augments)
        pool += [("augment", ag) for ag in DB["augments"]
                if ag.get("costo_umanita", 0) <= umanita_libera
                and all(s["def"]["id"] != ag["id"] for s in e.augments)]
        return pool

    def _evolvi_cpu(self, e, rango_nuovo):
        """Le CPU vincitrici crescono come il giocatore, a ogni round: +1 Controllo, un potere nuovo, un
        upgrade di statistica e un oggetto di equipaggiamento. Scelgono tra le stesse offerte del
        giocatore (2 statistiche, 3 oggetti): la statistica a caso, l'oggetto di maggior valore.
        `e.upgrade_torneo` tiene la storia, per mostrarla."""
        e.stats["controllo"] = min(4, e.stats["controllo"] + 1)
        noti = {s["def"]["id"] for s in e.poteri}
        pool = [p for p in DB["poteri"] if p["id"] not in noti]
        nuovi = []
        if pool and len(e.poteri) < MAX_POTERI:
            pw = random.choice(pool)
            e.poteri.append({"def": pw, "rango": min(rango_nuovo, e.stats["controllo"]), "attivo": False})
            nuovi.append(f"potere {pw['nome']}")
        su = [s for s in self.STATS_POTENZIABILI if e.stats[s] < 4]
        random.shuffle(su)
        if su:
            stat = random.choice(su[:2])
            e.stats[stat] += 1
            nuovi.append(f"+1 {stat}")
        pool_item = self._pool_item_validi(e)
        random.shuffle(pool_item)
        offerti = pool_item[:3]
        if offerti:
            categoria, item = max(offerti, key=lambda t: t[1].get("valore", 0))
            _applica_item_a(e, categoria, item)
            nuovi.append(f"{categoria} {item['nome']}")
        if not hasattr(e, "upgrade_torneo"):
            e.upgrade_torneo = []
        e.upgrade_torneo.append({"round": self.round, "novita": nuovi})
        self._cura_totale(e)

    # ---------- arena: le vincite si accumulano, si riscattano solo da campioni ----------
    def _risolvi_arena(self, d):
        """Chiude scommessa/sponsor del duello appena finito: se vinto, il bonus va
        nel montepremi del torneo (niente crediti reali finché non vinci tutto)."""
        vinto = d.vincitore is d.p
        if d.scommessa:
            if vinto:
                vincita = int(d.scommessa["importo"] * d.scommessa["quota"])
                self.bonus_accumulato += vincita
                self.log_arena.append(f"🎰 +{vincita}¤ nel montepremi (scommessa a "
                                      f"{d.scommessa['quota']}x).")
            else:
                self.log_arena.append(f"🎰 Scommessa persa: {d.scommessa['importo']}¤ "
                                      "andati (non erano nel montepremi).")
        if d.sponsor:
            if vinto and d._sponsor_condizione(d.sponsor):
                self.bonus_accumulato += d.sponsor["bonus"]
                self.log_arena.append(f"📣 {d.sponsor['nome']}: +{d.sponsor['bonus']}¤ "
                                      "nel montepremi.")
            else:
                self.log_arena.append(f"📣 {d.sponsor['nome']}: condizione non rispettata.")

    # ---------- flusso ----------
    def risolvi_duello(self, vinto, duello=None):
        if duello is not None:
            self._risolvi_arena(duello)
        m = self.mio_match()
        m["win"] = self.io if vinto else self.avversario_idx()
        for match in self.turni[self.round]:
            if match["win"] is None:
                match["win"] = self._vince_cpu(match["a"], match["b"])
        vincitori = [x["win"] for x in self.turni[self.round]]
        if not vinto:
            # eliminato: simula il resto del torneo per incoronare comunque un campione
            while len(vincitori) > 1:
                prossimo = [{"a": vincitori[i], "b": vincitori[i + 1], "win": None}
                            for i in range(0, len(vincitori), 2)]
                for match in prossimo:
                    match["win"] = self._vince_cpu(match["a"], match["b"])
                self.turni.append(prossimo)
                vincitori = [x["win"] for x in prossimo]
            self.campione = self.eroi[vincitori[0]].nome
            self.fase = "eliminato"
            if self.bonus_accumulato:
                self.log_arena.append(f"💸 Eliminato: il montepremi ({self.bonus_accumulato}¤) "
                                      "è andato perso.")
            return
        if len(vincitori) == 1:
            self.campione = self.eroi[self.io].nome
            self.fase = "vittoria"
            self._premia()
            return
        # turno superato: ad ogni vittoria il controllo sale da solo
        rango_nuovo = self.round + 2
        for idx in vincitori:
            if idx != self.io:
                self._evolvi_cpu(self.eroi[idx], rango_nuovo)
        e = self.eroi[self.io]
        e.stats["controllo"] = min(4, e.stats["controllo"] + 1)
        self._reset_combattimento(e)
        self._cura_totale(e)
        noti = {s["def"]["id"] for s in e.poteri}
        pool = [p for p in DB["poteri"] if p["id"] not in noti]
        random.shuffle(pool)
        su = [s for s in self.STATS_POTENZIABILI if e.stats[s] < 4]
        random.shuffle(su)
        self.scelte = {"rango": rango_nuovo, "poteri": pool[:3], "stats": su[:2]}
        pool_item = self._pool_item_validi(e)
        random.shuffle(pool_item)
        self.scelte_item = pool_item[:3] or None
        self.turni.append([{"a": vincitori[i], "b": vincitori[i + 1], "win": None}
                           for i in range(0, len(vincitori), 2)])
        self.round += 1
        self.fase = "risultato"

    def scegli(self, potere_id, stat):
        if self.fase != "risultato" or not self.scelte:
            return "nessuna scelta in corso"
        pw = next((p for p in self.scelte["poteri"] if p["id"] == potere_id), None)
        if pw is None or (self.scelte["stats"] and stat not in self.scelte["stats"]):
            return "scelta non valida"
        e = self.eroi[self.io]
        e.poteri.append({"def": pw, "rango": min(self.scelte["rango"],
                                                 e.stats["controllo"], 4),
                         "attivo": False})
        if stat in self.scelte["stats"]:
            e.stats[stat] = min(4, e.stats[stat] + 1)
        self.scelte = None
        self.fase = "oggetto" if self.scelte_item else "pronto"
        return None

    def scegli_item(self, categoria, item_id):
        if self.fase != "oggetto" or not self.scelte_item:
            return "nessuna scelta di equipaggiamento in corso"
        item = next((it for cat, it in self.scelte_item
                    if cat == categoria and it["id"] == item_id), None)
        if item is None:
            return "scelta non valida"
        _applica_item_a(self.eroi[self.io], categoria, item)
        self.scelte_item = None
        self.fase = "pronto"
        return None

    def salta_item(self):
        if self.fase != "oggetto":
            return "nessuna scelta di equipaggiamento in corso"
        self.scelte_item = None
        self.fase = "pronto"
        return None

    def _premia(self):
        """Il campione entra nel box, riposato e già di livello 5."""
        e = self.eroi[self.io]
        self._reset_combattimento(e)
        rec = nuovo_record(e)
        rec["id"] = STATO["prossimo_id"]
        STATO["prossimo_id"] += 1
        rec["hp"] = dict(LOCAZIONI)
        rec["livello"] = 5
        rec["bio"] = "Campione del Torneo Evo."
        STATO["personaggi"].append(rec)
        if self.bonus_accumulato:
            # campione: tutto il montepremi accumulato durante il torneo diventa reale
            STATO["crediti"] += self.bonus_accumulato
            self.log_arena.append(f"🏆 Campione! Montepremi riscattato: +{self.bonus_accumulato}¤.")
        salva_stato()

    # ---------- api ----------
    def stato(self):
        return {
            "attivo": True, "fase": self.fase, "round": self.round,
            "nome_turno": self.NOMI_TURNI[min(self.round, 3)],
            "io": self.io,
            "partecipanti": [{"nome": e.nome, "potenza": valuta(e)} for e in self.eroi],
            "turni": self.turni,
            "eroe": {"nome": self.eroi[self.io].nome,
                     "stats": dict(self.eroi[self.io].stats),
                     "poteri": [{"nome": s["def"]["nome"], "rango": s["rango"]}
                                for s in self.eroi[self.io].poteri],
                     "armi": [eq["nome"] for eq in DB["equip"]
                              if eq["id"] in self.eroi[self.io].armi_equip],
                     "armatura_hp": sum(self.eroi[self.io].armatura.values()),
                     "augments": [s["def"]["nome"] for s in self.eroi[self.io].augments]},
            "avversario": (self.eroi[self.avversario_idx()].nome
                           if self.fase in ("pronto", "duello") and self.mio_match() else None),
            "avversario_upgrade": (getattr(self.eroi[self.avversario_idx()], "upgrade_torneo", [])
                                   if self.fase in ("pronto", "duello") and self.mio_match() else []),
            "scelte": ({"rango": self.scelte["rango"],
                        "poteri": [{"id": p["id"], "nome": p["nome"],
                                    "descrizione": p.get("descrizione", "")}
                                   for p in self.scelte["poteri"]],
                        "stats": self.scelte["stats"]} if self.scelte else None),
            "scelte_item": ([{"categoria": cat, "id": it["id"], "nome": it["nome"],
                              "descrizione": it.get("descrizione", "")}
                             for cat, it in self.scelte_item] if self.scelte_item else None),
            "campione": self.campione,
            "pool_nomi": [p["nome"] for p in DB["poteri"]],
            "pool_nomi_item": [it["nome"] for it in DB["equip"] + DB["armor"] + DB["augments"]],
            "bonus_accumulato": self.bonus_accumulato,
            "log_arena": self.log_arena[-6:],
        }


TORNEO = None


def abbandona_duello():
    """Interrompere il duello in qualsiasi modo = sconfitta a tavolino."""
    d = DUELLO
    if d is None or d.finito:
        return
    d.finito = True
    d.fase = "fine"
    d.vincitore = d.cpu
    d.scriv(f"{d.p.nome} abbandona il combattimento: sconfitta a tavolino.", "crit")
    chiudi_duello()


@app.before_request
def forfeit_su_uscita():
    # navigare altrove (o iniziare un altro duello) mentre un duello è in corso = sconfitta
    # endpoint None = richiesta 404 (es. favicon.ico): non è un abbandono
    if (DUELLO is not None and not DUELLO.finito
            and request.endpoint is not None
            and request.endpoint not in ("duello", "api_duello_stato",
                                         "api_duello_azione", "static")):
        abbandona_duello()


def _istantanea(p):
    return {"nome": p.nome, "livello": getattr(p, "livello", 1), "valuta": valuta(p), "stats": dict(p.stats),
            "poteri": [s["def"]["id"] for s in p.poteri]}


def registra_incontro(d):
    """Scrive su file l'incontro appena finito (le scelte del giocatore) e lo aggiunge al modello di
    tattiche: da ora la CPU lo conosce. Nel harness (nessun registro) non fa nulla."""
    if d.reg is None:
        return

    def frazione_hp(p):
        return sum(max(0, p.hp[l]) for l in p.hp) / max(1, sum(p.hp_max.values()))
    inc = d.reg.incontro(d.vincitore is d.p, d.round, _istantanea(d.p), _istantanea(d.cpu),
                         frazione_hp(d.p), frazione_hp(d.cpu))
    if inc is not None:
        tattiche.salva_incontro(INCONTRI_FILE, inc)
        MODELLO.aggiungi(inc)


def chiudi_duello():
    """Applica al box i danni del duello, ricompense comprese. Idempotente."""
    d = DUELLO
    if d is None or d.chiuso or not d.finito:
        return
    d.chiuso = True
    registra_incontro(d)
    if d.rec is None:  # duello di torneo: niente record del box da aggiornare
        return
    rec = d.rec
    rientro_bias(rec)
    # solo le locazioni base: gli arti extra dei poteri (es. ali) esistono solo in duello
    rec["hp"] = {l: d.p.hp[l] for l in LOCAZIONI}
    rec["crippled"] = sorted(l for l in d.p.crippled if l in LOCAZIONI)
    rec["last_heal"] = time.time()
    danni_subiti = sum(max(0, LOCAZIONI[l] - d.p.hp[l]) for l in LOCAZIONI)
    # oltre il fondo scala su testa/busto la morte è probabilistica:
    # la Toughness accumulata riduce la chance (min 10%)
    if d.p.hp["testa"] <= -LOCAZIONI["testa"] or d.p.hp["busto"] <= -LOCAZIONI["busto"]:
        prob = max(0.10, 0.75 - rec.get("toughness", 0) * 0.01)
        if random.random() < prob:
            rec["morto"] = True
            d.scriv(f"{rec['nome']} non ce l'ha fatta.", "crit")
        else:
            d.scriv(f"{rec['nome']} si aggrappa alla vita (Toughness)!", "crit")
    vittoria = d.vincitore is d.p
    if vittoria:
        rec["vittorie"] = rec.get("vittorie", 0) + 1
        STATO["crediti"] += RICOMPENSA_VITTORIA
    else:
        rec["sconfitte"] = rec.get("sconfitte", 0) + 1
    # bookmaker: la puntata è già stata scalata al momento della scommessa
    if d.scommessa:
        if vittoria:
            vincita = int(d.scommessa["importo"] * d.scommessa["quota"])
            STATO["crediti"] += vincita
            d.scriv(f"🎰 Scommessa vinta: +{vincita}¤ (quota {d.scommessa['quota']}x).", "crit")
        else:
            d.scriv(f"🎰 Scommessa persa: -{d.scommessa['importo']}¤.", "miss")
    # sponsor: paga solo se vinci E rispetti la condizione
    if d.sponsor:
        if vittoria and d._sponsor_condizione(d.sponsor):
            STATO["crediti"] += d.sponsor["bonus"]
            d.scriv(f"📣 {d.sponsor['nome']} paga il bonus: +{d.sponsor['bonus']}¤!", "crit")
        else:
            d.scriv(f"📣 {d.sponsor['nome']}: condizione non rispettata, nessun bonus.")
    if not rec.get("morto"):
        # Toughness: cresce incassando danni — senza danni subiti, niente tempra
        if danni_subiti > 0:
            guadagno_t = 1 + danni_subiti // 150
            rec["toughness"] = rec.get("toughness", 0) + guadagno_t
            d.scriv(f"Toughness +{guadagno_t} ({rec['toughness']}).")
        # XP: base sulla vittoria, scalato sul dislivello con l'avversario
        liv_p = rec.get("livello", 1)
        liv_c = getattr(d.cpu, "livello", liv_p)
        base = 300 if vittoria else 100
        xp = max(50, int(base * (1 + 0.25 * (liv_c - liv_p))))
        for nota in assegna_xp(rec, xp):
            d.scriv(nota, "round")
    STATO.pop("duello_pendente", None)  # duello concluso regolarmente
    salva_stato()


# ---------------------------------------------------------------- route
@app.context_processor
def inject_globals():
    return {"crediti": STATO["crediti"]}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/sandbox")
def sandbox():
    return render_template("sandbox.html")


@app.route("/api/tattiche")
def api_tattiche():
    """Che cosa ha imparato la CPU dalle scelte del giocatore (v. tattiche.py)."""
    return jsonify(MODELLO.sommario())


@app.route("/torneo")
def torneo():
    global DUELLO
    # un duello di torneo concluso (o abbandonato) fa avanzare il bracket
    if (TORNEO is not None and TORNEO.fase == "duello"
            and DUELLO is not None and DUELLO.finito and DUELLO.rec is None):
        TORNEO.risolvi_duello(DUELLO.vincitore is DUELLO.p, DUELLO)
        DUELLO = None
    return render_template("torneo.html")


@app.route("/api/torneo/stato")
def api_torneo_stato():
    if TORNEO is None:
        return jsonify({"attivo": False})
    return jsonify(TORNEO.stato())


@app.route("/api/torneo/azione", methods=["POST"])
def api_torneo_azione():
    global TORNEO, DUELLO
    dati = request.get_json(silent=True) or {}
    tipo = dati.get("tipo")
    if tipo == "inizia":
        TORNEO = TorneoEvo()
    elif TORNEO is None:
        return jsonify({"errore": "nessun torneo in corso"}), 400
    elif tipo == "avanti" and TORNEO.fase == "intro":
        TORNEO.fase = "pronto"
    elif tipo == "combatti" and TORNEO.fase == "pronto":
        avv = TORNEO.eroi[TORNEO.avversario_idx()]
        DUELLO = DuelloWeb(pg=TORNEO.eroi[TORNEO.io], avversario=avv, torneo=TORNEO)
        TORNEO.fase = "duello"
        return jsonify({"vai": url_for("duello")})
    elif tipo == "scegli":
        err = TORNEO.scegli(dati.get("potere"), dati.get("stat"))
        if err:
            return jsonify({"errore": err}), 400
    elif tipo == "scegli_item":
        err = TORNEO.scegli_item(dati.get("categoria"), dati.get("id"))
        if err:
            return jsonify({"errore": err}), 400
    elif tipo == "salta_item":
        err = TORNEO.salta_item()
        if err:
            return jsonify({"errore": err}), 400
    elif tipo == "chiudi" and TORNEO.fase in ("vittoria", "eliminato"):
        TORNEO = None
        return jsonify({"attivo": False})
    return jsonify(TORNEO.stato())


@app.route("/box")
def box():
    riposa_tutti()
    pgs = [{"rec": c, "stato": stato_salute(c), "recupero": minuti_recupero(c),
            "hp_tot": sum(max(0, c["hp"][l]) for l in LOCAZIONI),
            "hp_max_tot": sum(LOCAZIONI.values())} for c in STATO["personaggi"]]
    return render_template("box.html", personaggi=pgs)


@app.route("/personaggio/<int:pid>")
def personaggio(pid):
    riposa_tutti()
    c = trova_record(pid)
    if c is None:
        flash("Personaggio non trovato.")
        return redirect(url_for("box"))
    poteri = []
    for pw in c["poteri"]:
        pd = next((x for x in DB["poteri"] if x["id"] == pw["id"]), None)
        if pd:
            poteri.append({"id": pw["id"], "nome": pd["nome"], "rango": pw["rango"],
                           "descrizione": pd.get("descrizione", "")})
    armi = [e for e in DB["equip"] if e["id"] in c.get("armi", [])]
    armatura = next((a for a in DB["armor"] if a["id"] == c.get("armatura_equip")), None)
    protesi = [{"def": pr, "loc": pr["locazione"]} for pr in DB["protesi"]
              if pr["id"] in c.get("protesi", [])]
    augments = [a for a in DB["augments"] if a["id"] in c.get("augments", [])]
    return render_template("personaggio.html", c=c, stato=stato_salute(c),
                           recupero=minuti_recupero(c), poteri=poteri,
                           upgrades=lista_upgrade(c), armi=armi, armatura=armatura,
                           protesi=protesi, augments=augments,
                           umanita_max=umanita_max_record(c),
                           umanita_usata=umanita_usata(c), MAX_ARMI=MAX_ARMI,
                           soglia=soglia_xp(c.get("livello", 1)),
                           LOCAZIONI=LOCAZIONI, STATS=STATS, SKILLS=SKILLS,
                           BONUS_RANGO=BONUS_RANGO, FALLBACK=FALLBACK)


def lista_upgrade(c):
    """Le voci livellabili coi Token: stat, skill e poteri (vincolo controllo)."""
    token = c.get("token", 0)
    out = []
    for s in STATS:
        r = c["stats"].get(s, 1)
        if r < 4:
            costo = costo_upgrade(r)
            out.append({"tipo": "stat", "nome": s, "label": s, "rango": r,
                        "costo": costo, "ok": token >= costo, "motivo": ""})
    for s in SKILLS:
        r = c["skills"].get(s, 1)
        if r < 4:
            costo = costo_upgrade(r)
            out.append({"tipo": "skill", "nome": s, "label": s.replace("_", " "),
                        "rango": r, "costo": costo, "ok": token >= costo, "motivo": ""})
    for pw in c.get("poteri", []):
        pd = next((x for x in DB["poteri"] if x["id"] == pw["id"]), None)
        if pd is None or pw["rango"] >= 4:
            continue
        costo = costo_upgrade(pw["rango"])
        vincolo = pw["rango"] >= c["stats"].get("controllo", 1)
        out.append({"tipo": "potere", "nome": str(pw["id"]), "label": pd["nome"],
                    "rango": pw["rango"], "costo": costo,
                    "ok": token >= costo and not vincolo,
                    "motivo": "serve controllo più alto" if vincolo else ""})
    return out


@app.route("/personaggio/<int:pid>/upgrade", methods=["POST"])
def personaggio_upgrade(pid):
    c = trova_record(pid)
    if c is None:
        flash("Personaggio non trovato.")
        return redirect(url_for("box"))
    tipo, nome = request.form.get("tipo"), request.form.get("nome", "")
    token = c.get("token", 0)
    if tipo == "stat" and nome in c["stats"]:
        r = c["stats"][nome]
        if r < 4 and token >= costo_upgrade(r):
            c["token"] = token - costo_upgrade(r)
            c["stats"][nome] = r + 1
            flash(f"{nome} sale a rango {r + 1}.")
    elif tipo == "skill" and nome in c["skills"]:
        r = c["skills"][nome]
        if r < 4 and token >= costo_upgrade(r):
            c["token"] = token - costo_upgrade(r)
            c["skills"][nome] = r + 1
            flash(f"{nome} sale a rango {r + 1}.")
    elif tipo == "potere":
        pw = next((x for x in c["poteri"] if str(x["id"]) == nome), None)
        if pw and pw["rango"] < 4 and token >= costo_upgrade(pw["rango"]):
            # il rango di un potere non può superare il rango del dado controllo
            if pw["rango"] < c["stats"].get("controllo", 1):
                c["token"] = token - costo_upgrade(pw["rango"])
                pw["rango"] += 1
                flash(f"Potere a rango {pw['rango']}.")
            else:
                flash("Il rango del potere non può superare quello di controllo.")
    salva_stato()
    return redirect(url_for("personaggio", pid=pid))


@app.route("/contratti")
def contratti():
    if not STATO["contratti"]:
        genera_contratti()
    return render_template("contratti.html", contratti=STATO["contratti"],
                           STATS=STATS, DB=DB)


@app.route("/contratti/rinnova", methods=["POST"])
def contratti_rinnova():
    genera_contratti()
    return redirect(url_for("contratti"))


@app.route("/contratti/ingaggia/<int:idx>", methods=["POST"])
def contratti_ingaggia(idx):
    if idx < 0 or idx >= len(STATO["contratti"]):
        flash("Contratto non valido.")
        return redirect(url_for("contratti"))
    c = STATO["contratti"][idx]
    if STATO["crediti"] < c["costo"]:
        flash("Crediti insufficienti.")
        return redirect(url_for("contratti"))
    STATO["crediti"] -= c["costo"]
    c.pop("costo", None)
    c["id"] = STATO["prossimo_id"]
    STATO["prossimo_id"] += 1
    c["last_heal"] = time.time()
    STATO["personaggi"].append(c)
    STATO["contratti"].pop(idx)
    salva_stato()
    flash(f"{c['nome']} è entrato nel tuo box!")
    return redirect(url_for("box"))


@app.route("/negozio")
def negozio():
    riposa_tutti()
    curabili = [c for c in STATO["personaggi"]
                if not c.get("morto") and stato_salute(c) != "pronto"]
    vivi = [c for c in STATO["personaggi"] if not c.get("morto")]
    umanita = {c["id"]: (umanita_usata(c), umanita_max_record(c)) for c in vivi}
    return render_template("negozio.html", curabili=curabili, vivi=vivi,
                           equip=DB["equip"], armor=DB["armor"], protesi=DB["protesi"],
                           augments=DB["augments"], umanita=umanita,
                           max_armi=MAX_ARMI, prezzo_medikit=PREZZO_MEDIKIT)


@app.route("/negozio/equip", methods=["POST"])
def negozio_equip():
    """Acquista ed equipaggia arma/armatura/protesi/augment (categoria nel form)."""
    pid = request.form.get("pid", type=int)
    categoria = request.form.get("categoria")
    iid = request.form.get("iid", type=int)
    c = trova_record(pid)
    catalogo = {"arma": DB["equip"], "armatura": DB["armor"],
               "protesi": DB["protesi"], "augment": DB["augments"]}.get(categoria)
    if c is None or c.get("morto") or catalogo is None:
        flash("Acquisto non valido.")
        return redirect(url_for("negozio"))
    item = next((x for x in catalogo if x["id"] == iid), None)
    if item is None:
        flash("Oggetto non valido.")
        return redirect(url_for("negozio"))
    if STATO["crediti"] < item.get("valore", 0):
        flash("Crediti insufficienti.")
        return redirect(url_for("negozio"))

    if categoria == "arma":
        if iid in c.get("armi", []):
            flash(f"{c['nome']} possiede già {item['nome']}.")
            return redirect(url_for("negozio"))
        if len(c.get("armi", [])) >= MAX_ARMI:
            flash(f"{c['nome']} ha già {MAX_ARMI} armi equipaggiate: rimuovine una prima.")
            return redirect(url_for("negozio"))
        c.setdefault("armi", []).append(iid)
    elif categoria == "armatura":
        c["armatura_equip"] = iid  # sostituisce quella indossata, se c'era (nessun rimborso)
    elif categoria == "protesi":
        occupata = next((p for p in DB["protesi"] if p["id"] in c.get("protesi", [])
                         and p["locazione"] == item["locazione"]), None)
        if occupata:
            flash(f"{c['nome']} ha già una protesi su {item['locazione']}.")
            return redirect(url_for("negozio"))
        if umanita_usata(c) + item.get("costo_umanita", 0) > umanita_max_record(c):
            flash("Umanità insufficiente.")
            return redirect(url_for("negozio"))
        c.setdefault("protesi", []).append(iid)
    else:  # augment
        if iid in c.get("augments", []):
            flash(f"{c['nome']} ha già {item['nome']}.")
            return redirect(url_for("negozio"))
        if umanita_usata(c) + item.get("costo_umanita", 0) > umanita_max_record(c):
            flash("Umanità insufficiente.")
            return redirect(url_for("negozio"))
        c.setdefault("augments", []).append(iid)

    STATO["crediti"] -= item.get("valore", 0)
    salva_stato()
    flash(f"{item['nome']} consegnata a {c['nome']}.")
    return redirect(url_for("negozio"))


@app.route("/negozio/disequip", methods=["POST"])
def negozio_disequip():
    """Rimuove arma/armatura/protesi/augment equipaggiati. Nessun rimborso."""
    pid = request.form.get("pid", type=int)
    categoria = request.form.get("categoria")
    iid = request.form.get("iid", type=int)
    c = trova_record(pid)
    if c is None:
        flash("Personaggio non valido.")
        return redirect(url_for("negozio"))
    if categoria == "arma":
        c["armi"] = [x for x in c.get("armi", []) if x != iid]
    elif categoria == "armatura":
        c["armatura_equip"] = None
    elif categoria == "protesi":
        c["protesi"] = [x for x in c.get("protesi", []) if x != iid]
    elif categoria == "augment":
        c["augments"] = [x for x in c.get("augments", []) if x != iid]
    else:
        flash("Categoria non valida.")
        return redirect(url_for("negozio"))
    salva_stato()
    flash("Rimosso.")
    return redirect(url_for("negozio"))


@app.route("/negozio/medikit", methods=["POST"])
def negozio_medikit():
    pid = request.form.get("pid", type=int)
    c = trova_record(pid)
    if c is None or c.get("morto"):
        flash("Personaggio non valido.")
        return redirect(url_for("negozio"))
    if STATO["crediti"] < PREZZO_MEDIKIT:
        flash("Crediti insufficienti.")
        return redirect(url_for("negozio"))
    STATO["crediti"] -= PREZZO_MEDIKIT
    c["hp"] = dict(LOCAZIONI)
    c["crippled"] = []
    c["last_heal"] = time.time()
    salva_stato()
    flash(f"{c['nome']} è stato curato completamente.")
    return redirect(url_for("negozio"))


@app.route("/duelli")
def duelli():
    riposa_tutti()
    idonei = [{"rec": c, "stato": stato_salute(c)} for c in STATO["personaggi"]
              if stato_salute(c) in ("pronto", "ferito")]
    return render_template("duelli.html", idonei=idonei,
                           ricompensa=RICOMPENSA_VITTORIA)


@app.route("/duelli/avvia", methods=["POST"])
def duelli_avvia():
    global DUELLO
    pid = request.form.get("pid", type=int)
    c = trova_record(pid)
    if c is None or stato_salute(c) not in ("pronto", "ferito"):
        flash("Questo personaggio non può combattere.")
        return redirect(url_for("duelli"))
    DUELLO = DuelloWeb(c)
    # marcatore persistente: se il processo muore a duello aperto,
    # al prossimo avvio viene contata la sconfitta a tavolino
    STATO["duello_pendente"] = pid
    salva_stato()
    return redirect(url_for("duello"))


@app.route("/duello")
def duello():
    if DUELLO is None:
        return redirect(url_for("duelli"))
    return render_template("duello.html")


@app.route("/api/duello/stato")
def api_duello_stato():
    if DUELLO is None:
        return jsonify({"errore": "nessun duello in corso"}), 404
    return jsonify(DUELLO.stato())


@app.route("/api/duello/azione", methods=["POST"])
def api_duello_azione():
    if DUELLO is None:
        return jsonify({"errore": "nessun duello in corso"}), 404
    err = DUELLO.azione_player(request.get_json(silent=True) or {})
    if DUELLO.finito:
        chiudi_duello()
    stato = DUELLO.stato()
    if err:
        stato["errore"] = err
    return jsonify(stato)


@app.route("/api/duello/survey", methods=["POST"])
def api_duello_survey():
    """Survey di fine duello: salvato su file e usato per tarare l'IA della CPU."""
    if DUELLO is None or not DUELLO.finito:
        return jsonify({"errore": "nessun duello concluso"}), 400
    dati = request.get_json(silent=True) or {}
    risposte = dati.get("risposte", {})
    DUELLO.survey_fatto = True
    os.makedirs(SAVE_DIR, exist_ok=True)
    with open(FEEDBACK_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": time.time(), "vincitore": DUELLO.vincitore.nome,
                            "round": DUELLO.round, "risposte": risposte,
                            "commento": dati.get("commento", "").strip()},
                           ensure_ascii=False) + "\n")
    aggiorna_profilo(risposte, DUELLO.rec)
    if DUELLO.rec is not None:
        salva_stato()  # il bias vive nel record del personaggio
    return jsonify({"ok": True, "profilo": PROFILO})


# ---------------------------------------------------------------- debug
@app.route("/debug")
def debug():
    riposa_tutti()
    return render_template("debug.html",
                           personaggi=[{"rec": c, "stato": stato_salute(c)}
                                       for c in STATO["personaggi"]])


@app.route("/debug/crediti", methods=["POST"])
def debug_crediti():
    STATO["crediti"] = 999999
    salva_stato()
    flash("Crediti impostati a 999.999.")
    return redirect(url_for("debug"))


@app.route("/debug/cura", methods=["POST"])
def debug_cura():
    pid = request.form.get("pid", type=int)
    bersagli = STATO["personaggi"] if pid is None else \
        [c for c in STATO["personaggi"] if c["id"] == pid]
    for c in bersagli:
        c["hp"] = dict(LOCAZIONI)
        c["crippled"] = []
        c["morto"] = False  # in debug la cura resuscita anche i morti
        c["last_heal"] = time.time()
    salva_stato()
    flash("Cura completa applicata.")
    return redirect(url_for("debug"))


@app.route("/debug/elimina", methods=["POST"])
def debug_elimina():
    pid = request.form.get("pid", type=int)
    STATO["personaggi"] = [c for c in STATO["personaggi"] if c["id"] != pid]
    salva_stato()
    flash("Personaggio eliminato.")
    return redirect(url_for("debug"))


if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)
