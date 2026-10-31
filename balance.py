"""Harness di bilanciamento di Urban: fa giocare il VERO DuelloWeb a due IA e stampa le
metriche M1-M10 di OVERHAUL_GAMEPLAY.md §3 con la fascia di accettazione e PASS/FAIL.

    python balance.py lunghezza   # M1, M2, M7, M8: durata e dispersione di un duello pari
    python balance.py ladder      # M3: vittoria con +1/+2/+3 ranghi su tutto
    python balance.py mira        # M4: mira sempre alla testa / al busto contro chi non mira
    python balance.py decisioni   # nessuna scelta del kit base (pesante, mira, pugno) e' dominata
    python balance.py equip       # M5: ogni oggetto contro un eroe nudo, ranghi pari
    python balance.py poteri      # M6: round-robin dei poteri (--rango 1..4, --solo "Nome", --matrice)
    python balance.py matchmaking # M9: eroe di livello L senza equip contro la CPU di pari livello
    python balance.py torneo      # tornei Evo interi con draft a caso: robustezza e % di vittoria
    python balance.py fuzz        # M10: duelli casuali, nessuna eccezione, nessun duello infinito
    python balance.py azzardo     # Z1-Z7: il Banco (azzardi, folla, quote, clausole), v. AZZARDO.md
    python balance.py tutto       # tutto quanto sopra

Opzioni: --n (duelli per cella), --seed, --jobs (processi), --root (albero da misurare),
--set (what-if, v. applica_what_if: costanti, campi degli attacchi e frammenti Python sui
cataloghi in memoria, senza toccare i file).

Gira SEMPRE su un salvataggio temporaneo (URBAN_SAVE_DIR) e con il profilo CPU neutro
(PROFILO_DEFAULT), cosi' le misure non dipendono dal save dell'utente ne' lo toccano.
Nessuna dipendenza esterna: multiprocessing della libreria standard.
"""
import argparse
import atexit
import copy
import os
import random
import shutil
import statistics
import sys
import tempfile
import time
import traceback
from collections import Counter
from concurrent.futures import ProcessPoolExecutor

if "--root" in sys.argv:  # va letto prima degli import: i processi figli ereditano l'env
    os.environ["BALANCE_ROOT"] = sys.argv[sys.argv.index("--root") + 1]
if "--set" in sys.argv:   # what-if: --set "MARGINE_FATTORE=3;MIRA_PENALITA=1" (JSON per i valori)
    os.environ["BALANCE_SET"] = sys.argv[sys.argv.index("--set") + 1]
RADICE = os.environ.get("BALANCE_ROOT") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, RADICE)
if not os.environ.get("URBAN_SAVE_DIR"):
    # prima di importare app: app carica (e riscrive) lo stato dal SAVE_DIR
    _tmp = tempfile.mkdtemp(prefix="urban_balance_")
    os.environ["URBAN_SAVE_DIR"] = _tmp
    atexit.register(shutil.rmtree, _tmp, ignore_errors=True)

import app  # noqa: E402
import engine as E  # noqa: E402


_COST_ORIG = {}   # (nome modulo, costante) -> valore originale
_MODULI = {"engine": E, "app": app}
WHAT_IF = os.environ.get("BALANCE_SET", "")   # propagato a ogni lavoro (vedi partite)
# chiavi speciali: {id attacco: valore} -> campo dell'attacco ("danno" = danno.flat)
CAMPI_ATT = {"DANNO_ATT": "danno", "CD_ATT": "cooldown_turni", "COSTO_ATT": "costo_azioni",
             "PARABILE_ATT": "parabile", "SPLIT_ATT": "split_danni", "RANGED_ATT": "ranged"}


def _att(i):
    return next(q for q in app.DB["attacchi"] if q["id"] == int(i))


SEP_PY = "||PY||"   # nel what-if: "K=v;K=v||PY||codice python"
_DB_ORIG = copy.deepcopy(app.DB)


def applica_what_if(testo):
    """what-if "K=v;K=v||PY||codice": sovrascrive costanti di engine/app (valori JSON), le chiavi
    speciali di CAMPI_ATT ({id attacco: valore}) e, dopo SEP_PY, esegue un frammento Python
    con DB/app/E e gli accessori pw(nome), at(id), st(id) per ritoccare i dati in memoria.
    Ogni chiamata riparte dai valori ORIGINALI (non e' cumulativa): si puo' cambiare what-if
    tra un lavoro e l'altro nello stesso processo. Le chiavi numeriche dei dict tornano interi."""
    import json
    for (m, k), v in _COST_ORIG.items():
        setattr(_MODULI[m], k, v)
    _COST_ORIG.clear()
    for k, lista in app.DB.items():   # ripristino in-place dei cataloghi
        lista[:] = copy.deepcopy(_DB_ORIG[k])
    testo, _, codice = (testo or "").partition(SEP_PY)
    for kv in filter(None, testo.split(";")):
        k, v = kv.split("=", 1)
        v = json.loads(v)
        if k in CAMPI_ATT:
            for i, x in v.items():
                q = _att(i)
                if k == "DANNO_ATT":
                    q["danno"]["flat"] = x
                else:
                    q[CAMPI_ATT[k]] = x
            continue
        if isinstance(v, dict) and all(str(a).isdigit() for a in v):
            v = {int(a): b for a, b in v.items()}  # es. BONUS_RANGO: chiavi di nuovo intere
        for nome, mod in _MODULI.items():
            if hasattr(mod, k):
                _COST_ORIG.setdefault((nome, k), getattr(mod, k))
                setattr(mod, k, v)
    if codice.strip():
        trova = lambda lista, c, v: next(x for x in app.DB[lista] if x[c] == v)
        exec(codice, {"app": app, "E": E, "DB": app.DB, "json": json,
                      "pw": lambda n: trova("poteri", "nome", n), "at": lambda i: trova("attacchi", "id", i),
                      "st": lambda i: trova("stances", "id", i), "ef": lambda i: trova("effetti", "id", i)})


DB = app.DB
CAP_ROUND = 120


# ------------------------------------------------------------------ costruzione combattenti
def _per_nome(catalogo, nome):
    return next(x["id"] for x in catalogo if x["nome"].lower() == nome.lower())


def spec(stat=1, skill=None, poteri=(), armi=(), armatura=None, protesi=(), augments=(),
         mira=None, stats=None, profilo=None, solo=None, azzardo=None, forza=None, tifo0=None, nodifesa=False):
    """Descrizione picklable di un combattente. poteri = [(nome|id, rango)], armi/armatura/
    protesi/augments per nome o id. mira = None | "testa" | "busto": policy 'mira sempre'.
    profilo = override delle manopole dell'IA (es. {"mira": 0}) per tutta la durata del duello.
    solo = nome di un attacco da usare SEMPRE quando e' giocabile (policy per misurare se una
    scelta e' dominata); se non e' giocabile decide la solita IA.
    azzardo = None (il duello e' quello di sempre) | "mai" | "saggio" | "folle": accende folla e azzardi (azzardo.py) per
    TUTTI e due e dice come azzarda questo lato. forza = una giocata da fare SEMPRE appena si puo' ("ruota", "ruota1" una
    volta sola, "r1@55" = Rilancio solo se il colpo va a segno con >= 55%...); tifo0 = tifo di partenza (>0 per questo lato)."""
    return {"stat": stat, "skill": stat if skill is None else skill, "stats": stats or {},
            "poteri": list(poteri), "armi": list(armi), "armatura": armatura,
            "protesi": list(protesi), "augments": list(augments), "mira": mira,
            "profilo": profilo or {}, "solo": solo, "azzardo": azzardo, "forza": forza, "tifo0": tifo0, "nodifesa": nodifesa}


def _id(catalogo, x):
    return x if isinstance(x, int) else _per_nome(catalogo, x)


def costruisci(sp, nome):
    """Combattente vero: passa da record_to_pg, cosi' equip e dotazione sono quelli del gioco."""
    stats = {s: sp["stat"] for s in E.STATS}
    stats.update(sp["stats"])
    rec = {"nome": nome, "stats": stats, "skills": {s: sp["skill"] for s in E.SKILLS},
           "poteri": [{"id": _id(DB["poteri"], p), "rango": r} for p, r in sp["poteri"]],
           "armi": [_id(DB["equip"], a) for a in sp["armi"]],
           "armatura_equip": (_id(DB["armor"], sp["armatura"]) if sp["armatura"] else None),
           "protesi": [_id(DB["protesi"], x) for x in sp["protesi"]],
           "augments": [_id(DB["augments"], x) for x in sp["augments"]],
           "hp": {}, "crippled": [], "livello": 1}
    return app.record_to_pg(rec)


# ------------------------------------------------------------------ pilotaggio del duello
def profilo_neutro():
    app.PROFILO.update(app.PROFILO_DEFAULT)


def difendi(d):
    """Il lato 'player' risponde con la STESSA scelta della CPU. Il ripiego (la vecchia euristica
    75% schivata / 60% parata) serve solo a misurare un albero precedente all'overhaul."""
    f = getattr(d, "scegli_difesa", None)
    if f is not None:
        scelta, loc = f(d.p, d.pending)
        d.risolvi_risposta(scelta, loc)
        return
    op = d.pending["opzioni"]
    s = ("schivata" if "schivata" in op and random.random() < .75 else
         "parata" if "parata" in op and random.random() < .6 else "nessuna risposta")
    d.risolvi_risposta(s, random.choice(list(d.p.hp)))


def _step_mira(loc):
    """Policy 'mira sempre': se puo' prende la mira su `loc`, per il resto e' l'IA normale
    (stesse stance, stessi poteri): cosi' l'unica differenza dall'avversario e' la mira."""
    def step(d):
        a = d.attivo
        if a.azioni > 0 and a.mira is None and a.puo_mirare():
            a.consuma_mira()
            a.mira = loc
            return
        if a.mira and a.azioni > 0:   # con la mira presa si attacca con un colpo MIRABILE
            mirabili = [x for x in a.attacchi_giocabili() if x.get("can_aim")]
            if mirabili:
                d.usa_attacco(max(mirabili, key=lambda x: d.ev_attacco(x, a, d.altro)))
                return
        d.cpu_step()
    return step


def _step_solo(nome, loc=None):
    """Policy 'usa sempre questo attacco' (con mira opzionale su `loc` se serve almeno 1 az. in piu')."""
    def step(d):
        a = d.attivo
        if a.azioni > 0:
            if loc and a.mira is None and a.puo_mirare() and a.azioni > 1:
                a.consuma_mira()
                a.mira = loc
                return
            scelte = [x for x in a.attacchi_giocabili() if x["nome"] == nome]
            if scelte:
                d.usa_attacco(scelte[0])
                return
        d.cpu_step()
    return step


def hp_tot(p):
    return sum(max(0, v) for v in p.hp.values())


def hp_crit(p):
    """hp di testa+busto: le locazioni che decidono il duello (M8 misura chi e' avanti QUI)."""
    return max(0, p.hp["testa"]) + max(0, p.hp["busto"])


def _step_forza(nome):
    """Policy di prova del gambling: gioca SEMPRE quell'azzardo appena puo' (per misurare quanto vale la giocata, non l'IA che la
    sceglie); per il resto decide la solita IA. "ruota" a ogni turno, "ruota1" una volta sola, "ultima", "r1@55" / "r2@65" =
    Rilancio / Tutto o niente solo se il colpo che si rilancia va a segno con almeno quella percentuale."""
    def step(d):
        a, t = d.attivo, d.tavolo
        if t.puo_azzardare(a)[0]:
            if nome == "ruota" or (nome == "ruota1" and t.stat["ruota"] == 0):
                t.azzarda(a, "ruota")
                return
            if nome == "ultima" and t.puo_ultima(a):
                t.azzarda(a, "ultima")
                return
            if nome.startswith("r") and "@" in nome and a.azioni >= 1:
                liv, soglia = nome[1:].split("@")
                s = t._attacco_da_rilanciare(a)
                if s is not None and s[1] * 100 >= int(soglia):
                    t.piano[t.lato(a)] = s[0]["id"]
                    t.azzarda(a, "rilancia", int(liv))
                    return
        d.cpu_step()
    return step


def gioca(sp_a, sp_b, cap=CAP_ROUND, costruiti=None):
    """Un duello A (lato 'player') contro B (lato 'cpu'). Ritorna un dict di misure."""
    pa, pb = costruiti or (costruisci(sp_a, "A"), costruisci(sp_b, "B"))
    gambling = sp_a.get("azzardo") is not None or sp_b.get("azzardo") is not None
    d = app.DuelloWeb(pg=pa, avversario=pb, azzardo_attivo=True if gambling else None)
    if gambling:
        pa.pol_azzardo = sp_a.get("azzardo") or "mai"
        pb.pol_azzardo = sp_b.get("azzardo") or "mai"
        if sp_a.get("tifo0") is not None:
            d.tavolo.tifo = float(sp_a["tifo0"])
        if sp_b.get("tifo0") is not None:
            d.tavolo.tifo = -float(sp_b["tifo0"])

    def politica(sp):
        if sp.get("forza"):
            return _step_forza(sp["forza"])
        if sp.get("solo"):
            return _step_solo(sp["solo"], sp.get("mira"))   # mira (se c'e') poi sempre quell'attacco
        return _step_mira(sp["mira"]) if sp["mira"] else (lambda dd: dd.cpu_step())
    pol = {id(pa): politica(sp_a), id(pb): politica(sp_b)}
    diff3 = None
    while not d.finito and d.round < cap:
        if diff3 is None and d.round >= 3:
            diff3 = hp_crit(pa) - hp_crit(pb)  # inizio round 3: chi e' avanti dove conta?
        if d.fase == "risposta":
            if sp_a.get("nodifesa"):         # strategia di prova: chi subisce non si difende mai (si fa colpire apposta)
                d.risolvi_risposta("nessuna risposta", None)
            else:
                difendi(d)
        elif d.fase in ("player", "cpu"):
            pol[id(d.attivo)](d)
        else:
            break
    perdente = None if d.vincitore is None else (pb if d.vincitore is pa else pa)
    out = {"a": d.vincitore is pa, "finito": d.finito, "round": d.round,
           "testa": perdente is not None and perdente.hp["testa"] <= 0,
           "diff3": diff3}
    if gambling:       # le statistiche del tavolo (azzardi giocati, ovazioni...) e le condizioni delle clausole
        out["az"] = {k: v for k, v in d.tavolo.stat.items() if k != "esiti"}
        out["az"]["esiti"] = dict(d.tavolo.stat["esiti"])
        out["clausole"] = {c["id"]: d.tavolo.clausola_ok(c["id"]) for c in app.azzardo.CLAUSOLE}
    return out


def _lavoro_partite(args):
    sp_a, sp_b, n, seed, cap, wi = args
    applica_what_if(wi)
    random.seed(seed)
    profilo_neutro()
    app.PROFILO.update(sp_a["profilo"])
    app.PROFILO.update(sp_b["profilo"])
    return [gioca(sp_a, sp_b, cap) for _ in range(n)]


# ------------------------------------------------------------------ esecuzione parallela
class Esecutore:
    def __init__(self, jobs):
        self.jobs = max(1, jobs)
        self.pool = ProcessPoolExecutor(max_workers=self.jobs) if self.jobs > 1 else None

    def mappa(self, fn, lavori):
        if self.pool is None:
            return [fn(x) for x in lavori]
        return list(self.pool.map(fn, lavori, chunksize=1))

    def chiudi(self):
        if self.pool:
            self.pool.shutdown()


def partite(es, coppie, n, seed, cap=CAP_ROUND, blocco=250):
    """coppie = [(sp_a, sp_b), ...] -> per ogni coppia la lista di n risultati.
    Spezza ogni coppia in blocchi cosi' i processi restano tutti occupati."""
    lavori, indice = [], []
    for i, (sa, sb) in enumerate(coppie):
        resto, k = n, 0
        while resto > 0:
            m = min(blocco, resto)
            lavori.append((sa, sb, m, seed * 1_000_003 + i * 997 + k, cap, WHAT_IF))
            indice.append(i)
            resto -= m
            k += 1
    out = [[] for _ in coppie]
    for i, ris in zip(indice, es.mappa(_lavoro_partite, lavori)):
        out[i].extend(ris)
    return out


def pct(ris, campo="a"):
    return 100.0 * sum(1 for r in ris if r[campo]) / max(1, len(ris))


def quantile(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))] if xs else 0


# ------------------------------------------------------------------ output
class Report:
    def __init__(self):
        self.righe = []
        self.fail = 0

    def riga(self, idm, nome, valore, fascia, ok):
        stato = "PASS" if ok else "FAIL"
        if not ok:
            self.fail += 1
        print(f"  {idm:<4}{nome:<46}{valore:<26}{fascia:<24}{stato}")

    def info(self, testo):
        print(f"      {testo}")


def _entro(v, lo, hi):
    return lo <= v <= hi


# ------------------------------------------------------------------ metriche
def m_lunghezza(es, a, rep):
    print("\n[M1 M2 M7 M8] duello pari (stat e skill 1, kit base)")
    (ris,) = partite(es, [(spec(1), spec(1))], a.n, a.seed)
    rounds = [r["round"] for r in ris]
    med, p90 = statistics.median(rounds), quantile(rounds, 0.9)
    rep.riga("M1", "durata mediana / p90 (round)", f"{med:g} / {p90}",
             "mediana 6-8, p90 <= 14", _entro(med, 6, 8) and p90 <= 14)
    nf = sum(1 for r in ris if not r["finito"])
    rep.info(f"p10 {quantile(rounds, 0.1)}, deviazione std {statistics.pstdev(rounds):.1f}, "
             f"duelli non finiti {nf}")
    testa = pct(ris, "testa")
    rep.riga("M7", "duelli decisi dalla testa", f"{testa:.0f}%", "<= 75% (dopo Fase 2)",
             testa <= 75)
    avanti = [r for r in ris if r["diff3"] is not None and abs(r["diff3"]) >= 10]
    if avanti:
        vinti = sum(1 for r in avanti if (r["diff3"] > 0) == r["a"])
        v = 100.0 * vinti / len(avanti)
        rep.riga("M8", "avanti di >=10 hp critici al round 3 vince", f"{v:.0f}%  (n={len(avanti)})",
                 "58-68%", _entro(v, 58, 68))


def p_colpire():
    """M2: P(d10 + bonus A > d10 + bonus D) a ranghi pari (il pareggio va a chi si difende)."""
    return 100.0 * E.prob_supera(0)


def m_ladder(es, a, rep):
    print("\n[M3] vittoria con +1/+2/+3 ranghi su tutte le stat e skill (base kit)")
    coppie = [(spec(1 + g), spec(1)) for g in (1, 2, 3)]
    ris = partite(es, coppie, a.n, a.seed + 1)
    v = [pct(r) for r in ris]
    bande = [(68, 75), (82, 88), (90, 94)]
    ok = all(_entro(x, lo, hi) for x, (lo, hi) in zip(v, bande))
    rep.riga("M3", "vittoria +1 / +2 / +3 ranghi", " / ".join(f"{x:.0f}" for x in v) + "%",
             "68-75 / 82-88 / 90-94", ok)
    rep.riga("M2", "P(colpire) a ranghi pari", f"{p_colpire():.0f}%", "45% (non toccare)",
             _entro(p_colpire(), 43, 47))


def m_mira(es, a, rep):
    print("\n[M4] mira sempre (poi attacca) contro chi non mira (ranghi pari, kit base)")
    nomira = {"mira": 0.0}  # chi non mira davvero non mira: nemmeno per scelta dell'IA
    ris = partite(es, [(spec(1, mira="testa", profilo=nomira), spec(1)),
                       (spec(1, mira="busto", profilo=nomira), spec(1))], a.n, a.seed + 2)
    t, b = pct(ris[0]), pct(ris[1])
    rep.riga("M4", "mira testa / busto", f"{t:.0f} / {b:.0f}%",
             "testa 55-62, busto >= 35", _entro(t, 55, 62) and b >= 35)


STRATEGIE = {   # strategie pure del kit base: nome -> kwargs di spec()
    "Pugno x3": dict(solo="Pugno"),
    "Pesante": dict(solo="Colpo pesante"),
    "Mira T+Pugno": dict(mira="testa"),
    "Mira B+Pugno": dict(mira="busto"),
    "Mira T+Pesante": dict(solo="Colpo pesante", mira="testa"),
    "Mira B+Pesante": dict(solo="Colpo pesante", mira="busto"),
}


def m_decisioni(es, a, rep):
    """Principio 1 (§5): ogni turno offre scelte vere e nessuna e' sempre la migliore. Matrice di
    vittorie tra strategie pure del kit base (ranghi pari). Criteri: il Colpo pesante e' una
    vera alternativa al Pugno (40-60%), nessuna strategia vince in media oltre il 66% o sotto il
    34%, e nessuna batte TUTTE le altre di piu' di 12 punti nel suo caso peggiore (la mira alla
    testa vale ~60% contro chi non mira: e' voluto, M4; sono soglie euristiche, non del .md)."""
    print("\n[Principio 1] matrice delle strategie del kit base (% di vittorie della RIGA contro la colonna)")
    nm = {"mira": 0.0}   # niente mira "per scelta dell'IA": decide la policy
    nomi = list(STRATEGIE)
    coppie, idx = [], []
    for i, x in enumerate(nomi):
        for j, y in enumerate(nomi):
            if j > i:
                coppie.append((spec(1, profilo=nm, **STRATEGIE[x]), spec(1, profilo=nm, **STRATEGIE[y])))
                idx.append((i, j))
    ris = partite(es, coppie, max(1500, a.n // 2), a.seed + 8)
    M = [[50.0] * len(nomi) for _ in nomi]
    for (i, j), r in zip(idx, ris):
        M[i][j] = pct(r)
        M[j][i] = 100 - M[i][j]
    print(" " * 18 + " ".join(f"{n[:11]:>11}" for n in nomi) + "      media")
    medie, peggiori = [], []
    for i, n in enumerate(nomi):
        altri = [M[i][j] for j in range(len(nomi)) if j != i]
        medie.append(sum(altri) / len(altri))
        peggiori.append(min(altri))
        print(f"{n:<18}" + " ".join(f"{M[i][j]:>10.0f}%" if j != i else f"{'-':>11}" for j in range(len(nomi)))
              + f"     {medie[-1]:.0f}%")
    pes = M[nomi.index("Pesante")][nomi.index("Pugno x3")]
    rep.riga("D", "Colpo pesante vs Pugno x3", f"{pes:.0f}%", "40-60% (alternativa vera)", _entro(pes, 40, 60))
    rep.riga("D", "media piu' alta / piu' bassa tra le strategie", f"{max(medie):.0f}% / {min(medie):.0f}%",
             "<= 66% / >= 34%", max(medie) <= 66 and min(medie) >= 34)
    dom = max(peggiori) - 50
    rep.riga("D", "margine di chi batte tutti nel caso peggiore", f"{dom:+.0f} punti", "<= +12",
             dom <= 12)


def _items():
    """(etichetta, kwargs di spec, prezzo) di ogni oggetto dei cataloghi."""
    out = []
    for e in DB["equip"]:
        out.append((e["nome"], {"armi": [e["id"]]}, e.get("valore", 0)))
    for x in DB["armor"]:
        out.append((x["nome"], {"armatura": x["id"]}, x.get("valore", 0)))
    for x in DB["protesi"]:
        out.append((x["nome"], {"protesi": [x["id"]]}, x.get("valore", 0)))
    for x in DB["augments"]:
        out.append((x["nome"], {"augments": [x["id"]]}, x.get("valore", 0)))
    return out


def m_equip(es, a, rep):
    print("\n[M5] oggetto contro eroe nudo (ranghi pari 1)")
    items = _items()
    ris = partite(es, [(spec(1, **kw), spec(1)) for _, kw, _ in items], a.n, a.seed + 3)
    righe = sorted(((pct(r), nome, prezzo) for r, (nome, _, prezzo) in zip(ris, items)),
                   key=lambda t: t[2])
    tutti = True
    for v, nome, prezzo in righe:
        ok = _entro(v, 55, 75)
        tutti = tutti and ok
        rep.riga("M5", f"{nome} ({prezzo}¤)", f"{v:.0f}%", "55-75% (target 58-72)", ok)
    prezzi = [(prezzo, v) for v, _, prezzo in righe]
    rep.info("prezzo crescente col guadagno: "
             + ("; ".join(f"{p}¤->{v:.0f}%" for p, v in prezzi)))


def m_solo_potere(es, a, rep, nome, ranghi):
    """Riga di UN potere contro tutti gli altri (e contro un nudo), con il dettaglio."""
    altri = [p["nome"] for p in DB["poteri"] if p["nome"].lower() != nome.lower()]
    nome = next(p["nome"] for p in DB["poteri"] if p["nome"].lower() == nome.lower())
    print(f"\n[M6] {nome}: dettaglio contro ogni altro potere (vittorie di {nome})")
    for r in ranghi:
        coppie = [(spec(r, poteri=[(nome, r)]), spec(r, poteri=[(y, r)])) for y in altri]
        coppie.append((spec(r, poteri=[(nome, r)]), spec(r)))
        ris = partite(es, coppie, max(150, a.n // 10), a.seed + 20 + r)
        v = [pct(x) for x in ris]
        media = sum(v[:-1]) / len(altri)
        det = "  ".join(f"{y[:9]} {x:.0f}" for y, x in sorted(zip(altri, v[:-1]), key=lambda t: t[1]))
        print(f"  r{r}: media {media:.0f}%  | contro nudo {v[-1]:.0f}%  | peggiori->migliori: {det}")


def m_poteri(es, a, rep):
    ranghi = [a.rango] if a.rango else [1, 3]
    nomi = [p["nome"] for p in DB["poteri"]]
    if a.solo:
        return m_solo_potere(es, a, rep, a.solo, ranghi)
    print("\n[M6] poteri")
    for r in ranghi:
        # contro un nudo (controllo = r: il potere non puo' superarlo)
        ris = partite(es, [(spec(r, poteri=[(n, r)]), spec(r)) for n in nomi],
                      max(200, a.n // 5), a.seed + 4)
        nudo = {n: pct(x) for n, x in zip(nomi, ris)}
        # round-robin: ogni coppia ordinata una volta, n per coppia (metà per lato)
        coppie, chiavi = [], []
        for i, x in enumerate(nomi):
            for y in nomi[i + 1:]:
                coppie.append((spec(r, poteri=[(x, r)]), spec(r, poteri=[(y, r)])))
                chiavi.append((x, y))
        per_coppia = max(60, a.n // 20)
        ris = partite(es, coppie, per_coppia, a.seed + 5 + r)
        vitt, tot, peggior = Counter(), Counter(), {}
        coppie_pct = []
        for (x, y), rr in zip(chiavi, ris):
            coppie_pct.append((100.0 * sum(1 for q in rr if q["a"]) / len(rr), x, y))
            wx = sum(1 for q in rr if q["a"])
            n_ = len(rr)
            vitt[x] += wx
            tot[x] += n_
            vitt[y] += n_ - wx
            tot[y] += n_
            peggior[x] = min(peggior.get(x, 100), 100.0 * wx / n_)
            peggior[y] = min(peggior.get(y, 100), 100.0 * (n_ - wx) / n_)
        print(f"  -- rango {r}: contro nudo | round-robin medio | peggior matchup")
        ok_tutti = True
        for n in sorted(nomi, key=lambda n: -vitt[n] / tot[n]):
            rr_ = 100.0 * vitt[n] / tot[n]
            ok = _entro(rr_, 44, 58) and peggior[n] >= 30
            ok_tutti = ok_tutti and ok
            print(f"      {n:<22}{nudo[n]:>5.0f}% {rr_:>8.0f}% {peggior[n]:>9.0f}%"
                  f"   {'ok' if ok else '<-- fuori fascia'}")
        if a.matrice:
            estremi = sorted(coppie_pct, key=lambda t: -abs(t[0] - 50))[:14]
            print("      coppie piu' sbilanciate:  " + " | ".join(
                f"{(x if p >= 50 else y)} batte {(y if p >= 50 else x)} {max(p, 100 - p):.0f}%"
                for p, x, y in estremi))
        rep.riga("M6", f"poteri r{r}: tutti in fascia 44-58%, worst >= 30%", "tutti ok" if ok_tutti
                 else "fuori fascia", "ogni potere 44-58%", ok_tutti)


def _eroe_livello(L):
    """Eroe di livello L senza equip: stessa crescita della CPU (token casuali, poteri)."""
    f = getattr(app, "eroe_livello", None)
    if f is not None:
        return f(L)
    c = E.eroe_base(DB["attacchi"], DB["poteri"], DB["stances"], set())
    c.livello = L
    for _ in range(L - 1):
        if len(c.poteri) < E.MAX_POTERI and random.random() < app.PROB_NUOVO_POTERE:
            noti = {s["def"]["id"] for s in c.poteri}
            nuovi = [pw for pw in DB["poteri"] if pw["id"] not in noti]
            if nuovi:
                c.poteri.append({"def": random.choice(nuovi), "rango": 1, "attivo": False})
    app._spendi_token_cpu(c, L - 1)
    return c


def _lavoro_matchmaking(args):
    L, n, seed = args
    applica_what_if(WHAT_IF)
    random.seed(seed)
    profilo_neutro()
    vittorie, rounds = 0, []
    for _ in range(n):
        h = _eroe_livello(L)
        h.nome = "Eroe"
        c = app.cpu_bilanciata(h)
        d = app.DuelloWeb(pg=h, avversario=c)
        while not d.finito and d.round < CAP_ROUND:
            if d.fase == "risposta":
                difendi(d)
            elif d.fase in ("player", "cpu"):
                d.cpu_step()
            else:
                break
        vittorie += d.vincitore is h
        rounds.append(d.round)
    return vittorie, n, rounds


def m_matchmaking(es, a, rep):
    print("\n[M9] eroe di livello L senza equip contro la CPU di pari livello")
    livelli = [1, 3, 5, 8, 12, 16]
    lavori = []
    for L in livelli:
        for k in range(8):
            lavori.append((L, max(50, a.n // 8), a.seed * 7919 + L * 131 + k))
    ris = es.mappa(_lavoro_matchmaking, lavori)
    per_liv = {}
    for (L, _, _), (v, n, _) in zip(lavori, ris):
        w, t = per_liv.get(L, (0, 0))
        per_liv[L] = (w + v, t + n)
    for L in livelli:
        w, t = per_liv[L]
        print(f"      L{L:<3}{100.0 * w / t:>5.0f}%  (n={t})")
    w5, t5 = per_liv[5]
    v5 = 100.0 * w5 / t5
    rep.riga("M9", "eroe L5 senza equip vs CPU L5", f"{v5:.0f}%", "42-50%", _entro(v5, 42, 50))


def _lavoro_fuzz(args):
    n, seed = args
    applica_what_if(WHAT_IF)
    random.seed(seed)
    profilo_neutro()
    eccez, lunghi, vittorie, rounds = Counter(), 0, 0, []
    esempi = {}
    for _ in range(n):
        try:
            usati = set()
            ps = []
            for _k in range(2):
                p = E.personaggio_casuale(DB["attacchi"], DB["poteri"], DB["stances"], usati)
                usati.add(p.nome)
                p.livello = random.randint(1, 20)
                if random.random() < 0.5:   # budget illimitato: stressa TUTTI gli oggetti
                    salvati = (app.BUDGET_CPU_MAX, app.FRAZIONE_BUDGET_CPU)
                    app.BUDGET_CPU_MAX, app.FRAZIONE_BUDGET_CPU = 10 ** 9, 1.0
                    app._equipaggia_cpu(p, p.livello)
                    app.BUDGET_CPU_MAX, app.FRAZIONE_BUDGET_CPU = salvati
                else:
                    app._equipaggia_cpu(p, p.livello)
                ps.append(p)
            d = app.DuelloWeb(pg=ps[0], avversario=ps[1])
            while not d.finito and d.round < CAP_ROUND:
                if d.fase == "risposta":
                    difendi(d)
                elif d.fase in ("player", "cpu"):
                    d.cpu_step()
                else:
                    break
            if not d.finito:
                lunghi += 1
            rounds.append(d.round)
        except Exception as ex:  # noqa: BLE001 — e' esattamente quello che cerchiamo
            tb = traceback.extract_tb(ex.__traceback__)[-1]
            firma = f"{type(ex).__name__}: {ex} @ {os.path.basename(tb.filename)}:{tb.lineno}"
            eccez[firma] += 1
            esempi.setdefault(firma, traceback.format_exc())
    return eccez, lunghi, rounds, esempi


def m_fuzz(es, a, rep):
    print("\n[M10] fuzz: duelli casuali (personaggi, poteri ed equip a caso)")
    n = a.fuzz_n
    blocchi = max(es.jobs * 4, n // 2500)
    per = n // blocchi
    ris = es.mappa(_lavoro_fuzz, [(per, a.seed * 31 + i) for i in range(blocchi)])
    eccez, lunghi, rounds, esempi = Counter(), 0, [], {}
    for e, l, r, ex in ris:
        eccez.update(e)
        lunghi += l
        rounds += r
        for k, v in ex.items():
            esempi.setdefault(k, v)
    tot = per * blocchi
    rep.riga("M10", f"eccezioni su {tot} duelli", str(sum(eccez.values())), "0",
             sum(eccez.values()) == 0)
    rep.riga("M10", f"duelli non finiti entro {CAP_ROUND} round", str(lunghi), "0", lunghi == 0)
    rep.info(f"durata media {statistics.mean(rounds):.1f} round, p99 {quantile(rounds, .99)}, "
             f"max {max(rounds)}")
    for firma, c in eccez.most_common(5):
        rep.info(f"{c}x {firma}")
        print(esempi[firma])


def _lavoro_torneo(args):
    """Un lotto di tornei interi: il giocatore pilotato dalla stessa IA della CPU, scelte del
    draft (potere, statistica, oggetto) a caso. Ritorna (vinti, eccezioni, round superati)."""
    n, seed = args
    applica_what_if(WHAT_IF)
    random.seed(seed)
    profilo_neutro()
    vinti, eccezioni, superati = 0, Counter(), []
    for _ in range(n):
        try:
            t = app.TorneoEvo()
            app.TORNEO = t
            t.fase = "pronto"
            giro = 0
            while t.fase not in ("vittoria", "eliminato"):
                if t.fase == "pronto":
                    avv = t.eroi[t.avversario_idx()]
                    d = app.DuelloWeb(pg=t.eroi[t.io], avversario=avv, torneo=t)
                    while not d.finito and d.round < CAP_ROUND:
                        if d.fase == "risposta":
                            difendi(d)
                        elif d.fase in ("player", "cpu"):
                            d.cpu_step()
                        else:
                            break
                    if not d.finito:       # duello infinito = sconfitta (e lo segnaliamo)
                        eccezioni["duello infinito nel torneo"] += 1
                        d.finito, d.vincitore = True, d.cpu
                    t.risolvi_duello(d.vincitore is d.p, d)
                    giro += 1
                elif t.fase == "risultato":
                    pw = random.choice(t.scelte["poteri"])
                    stat = random.choice(t.scelte["stats"]) if t.scelte["stats"] else None
                    t.scegli(pw["id"], stat)
                elif t.fase == "oggetto":
                    cat, it = random.choice(t.scelte_item)
                    t.scegli_item(cat, it["id"])
                else:
                    raise RuntimeError(f"fase torneo inattesa: {t.fase}")
            vinti += t.fase == "vittoria"
            superati.append(giro)
        except Exception as ex:  # noqa: BLE001
            tb = traceback.extract_tb(ex.__traceback__)[-1]
            eccezioni[f"{type(ex).__name__}: {ex} @ {os.path.basename(tb.filename)}:{tb.lineno}"] += 1
    app.TORNEO = None
    return vinti, eccezioni, superati


def m_torneo(es, a, rep):
    print("\n[Torneo Evo] tornei interi, draft a caso (attesa: 1/16 = 6,25% di vincerlo)")
    blocchi = es.jobs * 2
    per = max(10, a.n // blocchi // 4)
    ris = es.mappa(_lavoro_torneo, [(per, a.seed * 13 + i) for i in range(blocchi)])
    vinti = sum(r[0] for r in ris)
    eccez = Counter()
    giri = []
    for r in ris:
        eccez.update(r[1])
        giri += r[2]
    tot = per * blocchi
    v = 100.0 * vinti / tot
    rep.riga("T", f"vittoria del torneo ({tot} tornei)", f"{v:.1f}%", "3-12% (attesa ~6%)",
             _entro(v, 3, 12))
    rep.riga("T", "eccezioni / duelli infiniti nei tornei", str(sum(eccez.values())), "0",
             sum(eccez.values()) == 0)
    if giri:
        rep.info(f"round giocati in media {statistics.mean(giri):.2f} su 4")
    for firma, c in eccez.most_common(5):
        rep.info(f"{c}x {firma}")


# ------------------------------------------------------------------ il Banco (AZZARDO.md)
def _lavoro_quote(args):
    """Duelli tra un eroe e la CPU "specchio" (di forza diversa), con gli azzardi accesi. Ritorna, per ogni inizio round, la
    probabilita' stimata dal banco e l'esito; e quanto renderebbe a un giocatore CIECO una puntata di 100 tenuta fino alla fine o
    incassata al round 3."""
    n, seed = args
    applica_what_if(WHAT_IF)
    random.seed(seed)
    profilo_neutro()
    Z = app.azzardo
    pts, ritorni = [], {"tieni_r1": [], "tieni_r3": [], "incassa_r1_r3": [], "clausole_vinte": []}
    for _ in range(n):
        h = _eroe_livello(random.choice((1, 3, 5, 8)))
        h.nome = "Eroe"
        c = app.cpu_bilanciata(h, random.choice((-2, -1, 0, 0, 1, 2)))
        h.pol_azzardo = c.pol_azzardo = "saggio"
        d = app.DuelloWeb(pg=h, avversario=c, azzardo_attivo=True)
        vista = {}
        while not d.finito and d.round < CAP_ROUND:
            if d.round not in vista:
                vista[d.round] = d.prob_vittoria()
            if d.fase == "risposta":
                difendi(d)
            elif d.fase in ("player", "cpu"):
                d.cpu_step()
            else:
                break
        vinto = d.vincitore is h
        pts += [(r, p, vinto) for r, p in vista.items()]
        if vinto:        # le clausole si misurano sui duelli vinti, con gli eroi del gioco vero (poteri a caso, CPU specchio)
            ritorni["clausole_vinte"].append({c["id"]: d.tavolo.clausola_ok(c["id"]) for c in Z.CLAUSOLE})
        q1 = Z.quota(vista[1])
        ritorni["tieni_r1"].append(100 * q1 if vinto else 0)
        if 3 in vista:
            ritorni["tieni_r3"].append(100 * Z.quota(vista[3]) if vinto else 0)
            ritorni["incassa_r1_r3"].append(100 * q1 * vista[3] * (1 - Z.MARGINE_INCASSO))
        else:
            ritorni["incassa_r1_r3"].append(100 * q1 if vinto else 0)
    return pts, ritorni


def m_azzardo(es, a, rep):
    print("\n[Z] il Banco: azzardi, folla, quote (AZZARDO.md)")
    n = max(2000, a.n)
    S = lambda **kw: spec(1, **kw)
    mai = S(azzardo="mai")

    # 1) il gambling non e' un'arma ne' una condanna: chi azzarda bene guadagna poco, chi azzarda a caso perde
    ris = partite(es, [(mai, mai), (S(azzardo="saggio"), mai), (S(azzardo="folle"), mai),
                       (S(azzardo="saggio"), S(azzardo="saggio"))], n, a.seed + 40)
    ctrl, saggio, folle, ss = (pct(r) for r in ris)
    rep.riga("Z1", "nessuno azzarda (controllo, deve stare a 50%)", f"{ctrl:.1f}%", "47-53%", _entro(ctrl, 47, 53))
    rep.riga("Z1", "azzardare con giudizio, contro chi non azzarda", f"{saggio:.1f}% ({saggio - ctrl:+.1f})",
             "non meno di -1,5; non oltre 58%", ctrl - 1.5 <= saggio <= 58)
    rep.riga("Z1", "azzardare a caso, contro chi non azzarda", f"{folle:.1f}% ({folle - ctrl:+.1f})",
             "almeno 2 punti sotto (si paga)", folle <= ctrl - 2)
    rep.riga("Z1", "saggio contro saggio (simmetria)", f"{ss:.1f}%", "47-53%", _entro(ss, 47, 53))
    lung = [statistics.mean(x["round"] for x in r) for r in ris]
    rep.info(f"round medi: nessuno {lung[0]:.2f} | saggio {lung[1]:.2f} | folle {lung[2]:.2f} | saggio-saggio {lung[3]:.2f}")

    # 2) quanto si azzarda e che cosa succede (saggio contro saggio)
    r = ris[3]
    tot = {k: sum(x["az"][k] for x in r) / len(r) for k in ("ruota", "rilancia", "ultima")}
    ov = 100.0 * sum(1 for x in r if x["az"]["ovazioni"] > 0) / len(r)
    ult = sum(x["az"]["ultima"] for x in r)
    rep.riga("Z2", "giri di ruota per duello (entrambi i lati)", f"{tot['ruota']:.2f}", "0,3-2", _entro(tot["ruota"], 0.3, 2))
    rep.riga("Z2", "rilanci per duello", f"{tot['rilancia']:.2f}", "0,2-2", _entro(tot["rilancia"], 0.2, 2))
    rep.riga("Z2", "Ultime Puntate per duello", f"{tot['ultima']:.2f}", "0,03-0,3", _entro(tot["ultima"], 0.03, 0.3))
    rep.riga("Z2", "duelli con almeno un'Ovazione", f"{ov:.0f}%", "20-40%", _entro(ov, 20, 40))
    rok = sum(x["az"]["rilanci_ok"] for x in r)
    rko = sum(x["az"]["rilanci_ko"] for x in r)
    rep.info(f"rilanci a segno {rok} / mancati {rko}; Ultima Puntata riuscita {sum(x['az']['ultime_ok'] for x in r)} su {ult}")
    esiti = Counter()
    for x in r:
        esiti.update(x["az"]["esiti"])
    ruote = sum(esiti.values()) or 1
    rep.info("esiti della ruota: " + ", ".join(f"{k} {100.0 * v / ruote:.0f}%" for k, v in esiti.most_common()))

    # 3) la ruota vale quello che dice la tabella: a pari la casa vince, con la folla dalla tua si gioca in attivo
    print("      -- un giro di ruota al primo turno (A) contro chi non azzarda, a diversi scarti della folla")
    prove = [("scarto -1 (folla contro)", -30), ("scarto 0", 0), ("scarto +1", 30), ("scarto +2", 55)]
    ris = partite(es, [(S(azzardo="mai", forza="ruota1", tifo0=t), mai) for _, t in prove], n, a.seed + 41)
    v = [pct(x) for x in ris]
    for (nome, t), x in zip(prove, v):
        ev = app.azzardo.ruota_ev_sd(app.azzardo.scarto(t))[0]
        rep.info(f"{nome:<26} vittoria di A {x:.1f}%   (EV della tabella {ev:+.0f} hp equivalenti)")
    rep.riga("Z3", "ruota a pari: la casa non perde (non regala)", f"{v[1]:.1f}% ({v[1] - ctrl:+.1f})", "<= controllo +1,5", v[1] <= ctrl + 1.5)
    rep.riga("Z3", "ruota con la folla +2 batte quella contraria", f"{v[3]:.1f}% vs {v[0]:.1f}%", "+2 > -1 di 3+ punti",
             v[3] - v[0] >= 3)

    # 4) rilanciare conviene solo quando il colpo e' probabile
    print("      -- il Rilancio / Tutto o niente di A, fatto solo se il colpo va a segno con almeno X%")
    prove = [("r1@30", "Rilancio se >= 30%"), ("r1@45", "Rilancio se >= 45%"), ("r1@60", "Rilancio se >= 60%"),
             ("r2@45", "Tutto o niente se >= 45%"), ("r2@60", "Tutto o niente se >= 60%"), ("r2@75", "Tutto o niente se >= 75%")]
    ris = partite(es, [(S(azzardo="mai", forza=f), mai) for f, _ in prove], n, a.seed + 42)
    v = {f: pct(x) for (f, _), x in zip(prove, ris)}
    for (f, nome), x in zip(prove, ris):
        usati = sum(y["az"]["rilancia"] for y in x) / len(x)
        ok = sum(y["az"]["rilanci_ok"] for y in x)
        ko = sum(y["az"]["rilanci_ko"] for y in x)
        rep.info(f"{nome:<28} vittoria di A {pct(x):.1f}%   ({usati:.2f} per duello, a segno {100.0 * ok / max(1, ok + ko):.0f}%)")
    rep.riga("Z4", "rilanciare un colpo improbabile si paga", f"{v['r1@30']:.1f}% / {v['r2@45']:.1f}%",
             f"sotto il controllo ({ctrl:.1f}%)", v["r1@30"] < ctrl and v["r2@45"] < ctrl)
    # (il Rilancio semplice vale poco a ogni uso: la differenza tra soglie si perde nel rumore; Tutto o niente si vede bene)
    rep.riga("Z4", "Tutto o niente: piu' il colpo e' probabile, meglio rende", f"{v['r2@45']:.1f}% -> {v['r2@60']:.1f}%",
             "cresce con la soglia", v["r2@60"] > v["r2@45"])

    # 5) l'Ultima Puntata (sempre, appena si e' in zona critica) e' un tiro di disperazione, non una scorciatoia
    ris = partite(es, [(S(azzardo="mai", forza="ultima"), mai)], n, a.seed + 43)
    u = ris[0]
    nu = sum(x["az"]["ultima"] for x in u)
    giocata = [x for x in u if x["az"]["ultima"]]
    riuscita = [x for x in giocata if x["az"]["ultime_ok"]]
    p_dopo = 100.0 * sum(1 for x in riuscita if x["a"]) / max(1, len(riuscita))
    rep.info(f"Ultima Puntata giocata sempre a testa o busto < 30%: vittoria di A {pct(u):.1f}% (controllo {ctrl:.1f}%); "
             f"giocata in {100.0 * len(giocata) / len(u):.0f}% dei duelli, riuscita nel "
             f"{100.0 * sum(x['az']['ultime_ok'] for x in u) / max(1, nu):.0f}% dei casi; "
             f"dopo il successo vince il {p_dopo:.0f}% (P_DOPO_ULTIMA nel codice: {int(100 * app.azzardo.P_DOPO_ULTIMA)}%)")

    # 6) le quote: calibrazione, margine della casa, prezzo dell'incasso
    blocchi = es.jobs * 2
    per = max(60, n // blocchi // 2)
    out = out_quote = es.mappa(_lavoro_quote, [(per, a.seed * 53 + i) for i in range(blocchi)])
    pts = [p for o in out for p in o[0]]
    print("      -- calibrazione delle quote: probabilita' stimata dal banco a inizio round contro la vittoria vera")
    fasce = [(0.0, 0.15), (0.15, 0.3), (0.3, 0.45), (0.45, 0.55), (0.55, 0.7), (0.7, 0.85), (0.85, 1.01)]
    scarto_max = 0.0
    for lo, hi in fasce:
        sel = [(p, v_) for _, p, v_ in pts if lo <= p < hi]
        if len(sel) < 50:
            continue
        pm = sum(p for p, _ in sel) / len(sel)
        vv = sum(1 for _, v_ in sel if v_) / len(sel)
        if len(sel) >= 300:      # le fasce piccole (le code) ballano di 3-4 punti solo per il campione: si mostrano, non si contano
            scarto_max = max(scarto_max, abs(pm - vv))
        rep.info(f"p in [{lo:.2f}, {hi:.2f}): stimata {100 * pm:.0f}%  vera {100 * vv:.0f}%  (n={len(sel)})")
    rep.riga("Z5", "scarto massimo tra stimata e vera (fasce con >= 300 casi)", f"{100 * scarto_max:.0f} punti",
             "<= 8 punti", scarto_max <= 0.08)
    # (puntata e incasso hanno ognuno il suo margine del 10%: andata e ritorno ~0,81, quindi la fascia dell'incasso e' piu' larga)
    for k, nome, lo in (("tieni_r1", "puntata cieca al round 1, tenuta", 0.80), ("tieni_r3", "puntata cieca al round 3, tenuta", 0.80),
                        ("incassa_r1_r3", "puntata al round 1, incassata al round 3", 0.76)):
        xs = [x for o in out for x in o[1][k]]
        m = statistics.mean(xs) / 100.0
        rep.riga("Z5", f"ritorno per ¤: {nome}", f"{m:.2f}", f"{lo:.2f}-1,00 (la casa trattiene il suo)", _entro(m, lo, 1.00))

    # 7) le clausole pagano k = 1 / P(condizione | vinci), misurato sugli eroi del gioco vero (poteri a caso contro la CPU specchio)
    vinte = [x for o in out_quote for x in o[1]["clausole_vinte"]]
    print(f"      -- clausole: probabilita' della condizione tra i {len(vinte)} duelli vinti dall'eroe, e k che ne segue")
    for c in app.azzardo.CLAUSOLE:
        if c.get("richiede_poteri"):
            rep.info(f"clausola {c['nome']}: una scommessa sulla propria scelta (l'IA accende sempre i poteri, nulla da misurare); "
                     f"k = {c['k']} e' il prezzo dell'handicap")
            continue
        pc = sum(1 for x in vinte if x[c["id"]]) / max(1, len(vinte))
        k = 1 / pc if pc else float("inf")
        rep.riga("Z6", f"clausola {c['nome']}: P(condizione | vinci) {100 * pc:.0f}%", f"k equo = {k:.2f}",
                 f"k scritto {c['k']} <= equo", pc > 0 and c["k"] <= k * 1.05)

    # 7b) le clausole sono scommesse su cose che si possono pilotare: nessuna strategia deve farne una macchina da soldi (EV per ¤ <= 1)
    nm = {"mira": 0.0}
    strat = [("IA di sempre", S(azzardo="mai")), ("mira sempre alla testa", S(azzardo="mai", mira="testa", profilo=nm)),
             ("mira sempre al busto", S(azzardo="mai", mira="busto", profilo=nm)),
             ("solo Colpo pesante", S(azzardo="mai", solo="Colpo pesante", profilo=nm)),
             ("solo Pugno", S(azzardo="mai", solo="Pugno", profilo=nm)),
             ("non si difende mai", S(azzardo="mai", nodifesa=True)),
             ("mira testa, non si difende", S(azzardo="mai", mira="testa", profilo=nm, nodifesa=True))]
    ris = partite(es, [(sp, mai) for _, sp in strat], n, a.seed + 45)
    q0 = app.azzardo.quota(0.5)
    peggiore = {}
    for (nome, _), r in zip(strat, ris):
        for c in app.azzardo.CLAUSOLE:
            if c.get("richiede_poteri"):
                continue
            pc = sum(1 for x in r if x["a"] and x["clausole"][c["id"]]) / len(r)       # P(vinci E la condizione)
            ev = pc * q0 * c["k"]
            if ev > peggiore.get(c["id"], (0, ""))[0]:
                peggiore[c["id"]] = (ev, nome)
    for cid, (ev, nome) in peggiore.items():
        rep.riga("Z6b", f"clausola {cid}: strategia migliore ({nome})", f"{ev:.2f} per ¤", "<= 1,05 (nessuna macchina da soldi)", ev <= 1.05)

    # 8) robustezza: duelli casuali con gli azzardi accesi
    fz = max(2000, a.n)
    out = es.mappa(_lavoro_fuzz_azzardo, [(fz // blocchi, a.seed * 71 + i) for i in range(blocchi)])
    eccez, lunghi = Counter(), 0
    for e, lu in out:
        eccez.update(e)
        lunghi += lu
    rep.riga("Z7", f"eccezioni su {fz // blocchi * blocchi} duelli con gli azzardi", str(sum(eccez.values())), "0",
             sum(eccez.values()) == 0)
    rep.riga("Z7", f"duelli non finiti entro {CAP_ROUND} round", str(lunghi), "0", lunghi == 0)
    for firma, c in eccez.most_common(3):
        rep.info(f"{c}x {firma}")


def _lavoro_fuzz_azzardo(args):
    n, seed = args
    applica_what_if(WHAT_IF)
    random.seed(seed)
    profilo_neutro()
    eccez, lunghi = Counter(), 0
    for _ in range(n):
        try:
            usati, ps = set(), []
            for _k in range(2):
                p = E.personaggio_casuale(DB["attacchi"], DB["poteri"], DB["stances"], usati)
                usati.add(p.nome)
                p.livello = random.randint(1, 20)
                app._equipaggia_cpu(p, p.livello)
                p.pol_azzardo = random.choice(("saggio", "saggio", "folle", "mai"))
                ps.append(p)
            d = app.DuelloWeb(pg=ps[0], avversario=ps[1], azzardo_attivo=True)
            d.tavolo.tifo = random.uniform(-90, 90)
            while not d.finito and d.round < CAP_ROUND:
                if d.fase == "risposta":
                    difendi(d)
                elif d.fase in ("player", "cpu"):
                    d.cpu_step()
                else:
                    break
            lunghi += not d.finito
        except Exception as ex:  # noqa: BLE001
            tb = traceback.extract_tb(ex.__traceback__)[-1]
            eccez[f"{type(ex).__name__}: {ex} @ {os.path.basename(tb.filename)}:{tb.lineno}"] += 1
    return eccez, lunghi


COMANDI = {"lunghezza": m_lunghezza, "ladder": m_ladder, "mira": m_mira,
           "decisioni": m_decisioni, "equip": m_equip,
           "poteri": m_poteri, "matchmaking": m_matchmaking, "torneo": m_torneo, "fuzz": m_fuzz,
           "azzardo": m_azzardo}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("comando", choices=list(COMANDI) + ["tutto"])
    ap.add_argument("--n", type=int, default=2000, help="duelli per cella (default 2000)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--rango", type=int, default=0, help="poteri: solo questo rango (1..4)")
    ap.add_argument("--fuzz-n", dest="fuzz_n", type=int, default=100_000)
    ap.add_argument("--matrice", action="store_true", help="poteri: stampa le coppie piu' sbilanciate")
    ap.add_argument("--solo", help="poteri: solo la riga di questo potere (dettaglio per avversario)")
    ap.add_argument("--root", help="albero da misurare (default: la cartella di balance.py)")
    ap.add_argument("--set", help='what-if su costanti, es. "MARGINE_FATTORE=3;MIRA_PENALITA=1"')
    a = ap.parse_args()
    t0 = time.time()
    rep = Report()
    es = Esecutore(a.jobs)
    try:
        for nome in (list(COMANDI) if a.comando == "tutto" else [a.comando]):
            COMANDI[nome](es, a, rep)
    finally:
        es.chiudi()
    print(f"\n{'FAIL' if rep.fail else 'OK'}: {rep.fail} metriche fuori fascia "
          f"({time.time() - t0:.0f}s, seed {a.seed}, n {a.n})")
    return 1 if rep.fail else 0


if __name__ == "__main__":
    sys.exit(main())
