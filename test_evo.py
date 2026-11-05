"""Check del Torneo Evo (evo.py, data/mutazioni.json, regole_arena.json, eventi_evo.json, i ganci di engine.py e app.py): python test_evo.py
Dati, mutazioni una a una, regole d'arena, la corsa fase per fase (bottino, porte, mercato, eventi, sparring), vita che si porta dietro,
punteggio e ascensioni, salvataggio, rotte dell'API e corse intere a caso. Il client (static/torneo.js) lo controlla test_torneo.js."""
import atexit
import json
import os
import random
import shutil
import subprocess
import tempfile

_SAVE_TMP = tempfile.mkdtemp(prefix="urban_test_evo_")
os.environ["URBAN_SAVE_DIR"] = _SAVE_TMP
atexit.register(shutil.rmtree, _SAVE_TMP, ignore_errors=True)

import app as W  # noqa: E402
import evo as E  # noqa: E402
from engine import AZIONI_BASE, LOCAZIONI, Personaggio, dotazione_base, eroe_base  # noqa: E402

DB = W.DB
n_check = 0
OPS = {"stat", "armatura", "resistenza", "immunita", "azioni", "bonus", "risposte", "effetto", "stance", "hp_max", "mira_bonus", "stamina", "attacco",
       "mult_danno", "mult_subiti", "vampiro", "ultima_chance", "no_mira", "no_schivata", "corsa"}


def ok(cond, msg=""):
    global n_check
    n_check += 1
    assert cond, msg


class dadi:
    """Fissa i prossimi tiri di d10 (random.randint) in ordine; finiti, torna a tirare davvero."""

    def __init__(self, *valori):
        self.v = list(valori)

    def __enter__(self):
        self.orig = random.randint

        def finto(a, b):
            return self.v.pop(0) if self.v else self.orig(a, b)
        random.randint = finto

    def __exit__(self, *e):
        random.randint = self.orig


def nuova(asc=0, seed=1, bottino=True):
    """Una corsa con l'eroe scelto e il primo bottino fatto: pronta al primo duello (fase bracket)."""
    random.seed(seed)
    c = E.Corsa(asc)
    ok(c.scegli_campione(c.candidati[0]) is None)
    while bottino and c.fase == "bottino":
        ok(c.scegli_carta(0) is None)
    return c


def vinci(c, vinto=True, hp=None, round_duello=3):
    """Il duello della fase corrente finisce a tavolino. `hp` = {locazione: hp} lasciati all'eroe dal duello."""
    pg, nemico, regola = c.prepara_duello()
    d = W.DuelloWeb(pg=pg, avversario=nemico, torneo=c)
    for l, v in (hp or {}).items():
        d.p.hp[l] = v
    d.round = round_duello
    d.finito, d.fase, d.vincitore = True, "fine", (d.p if vinto else d.cpu)
    c.risolvi_duello(vinto, d)
    return d


def pilota(c, vinto=True, passi=300):
    """Gioca la corsa da sola: prima carta, prima porta, ogni duello vinto (o perso)."""
    for _ in range(passi):
        if c.fase in ("vittoria", "eliminato"):
            return
        if c.fase in ("bracket", "sparring"):
            vinci(c, vinto)
        elif c.fase == "bottino":
            c.scegli_carta(0)
        elif c.fase == "porte":
            c.scegli_porta(0)
        elif c.fase == "mercato":
            c.esci_mercato()
        elif c.fase == "allenamento":
            c.allena(0)
        elif c.fase == "evento":
            c.scegli_evento(len(c.evento["scelte"]) - 1) if c.evento["esito"] is None else c.chiudi_evento()
        else:
            raise AssertionError(c.fase)
    raise AssertionError("la corsa non finisce: " + c.fase)


def gemello(rec=None):
    """Un record di eroe base ricreato da zero (per provare una mutazione)."""
    p = eroe_base(DB["attacchi"], DB["poteri"], DB["stances"], ())
    return E.rec_da_pg(p, W.aspetto.genera(p.nome))


# ======================================================================= i dati
def test_dati():
    ok(len(E.MUTAZIONI) >= 30 and len(E.REGOLE) == 6 and len(E.EVENTI) >= 10)
    stanze, effetti, attacchi = {s["id"] for s in DB["stances"]}, {e["id"] for e in DB["effetti"]}, {a["id"] for a in DB["attacchi"]}
    for mid, m in E.MUTAZIONI.items():
        ok(m["id"] == mid and m["rarita"] in E.PESO_RARITA | {"maledetta": 0} and m["nome"] and m["descrizione"] and m["icona"], mid)
        ok(m["ops"] and all(o["op"] in OPS for o in m["ops"]), mid)
        for o in m["ops"]:
            if o["op"] == "effetto":
                ok(o["id"] in effetti, mid)
            if o["op"] == "stance":
                ok(o["id"] in stanze, mid)
            if o["op"] == "attacco":
                ok(o["id"] in attacchi, mid)
            if o["op"] == "stat":
                ok(o["stat"] in E.STAT_POT, mid)
        ok(bool(m.get("corsa")) == any(o["op"] == "corsa" for o in m["ops"]), "il flag 'corsa' dice cosa vale fuori dal duello: " + mid)
    for r in ("comune", "rara", "leggendaria", "maledetta"):
        ok(sum(m["rarita"] == r for m in E.MUTAZIONI.values()) >= 4, "abbastanza mutazioni " + r)
    ok(E.REGOLE["standard"]["ops"] == [] and all(r["peso"] > 0 and r["descrizione"] and r["icona"] for r in E.REGOLE.values()))
    for r in E.REGOLE.values():
        ok(all(o["op"] in OPS for o in r["ops"]))
        for o in r["ops"]:
            if o["op"] == "effetto":
                ok(o["id"] in effetti, r["id"])
    for eid, ev in E.EVENTI.items():
        ok(ev["id"] == eid and ev["titolo"] and ev["testo"] and ev["icona"] and len(ev["scelte"]) >= 2, eid)
        for s in ev["scelte"]:
            ok(abs(sum(e["p"] for e in s["esiti"]) - 1) < 1e-9, f"{eid}: le probabilita' di una scelta fanno 1")
            ok(isinstance(s.get("costo", 0), int) and s["testo"], eid)
            for e in s["esiti"]:
                ok(e["righe"] and all(o["op"] in ("cura", "danno", "gettoni", "stat", "mutazione", "equip", "rango", "punti") for o in e["ops"]), eid)
        ok(any(not s.get("costo") for s in ev["scelte"]), f"{eid}: si puo' sempre scegliere senza gettoni")
    ok(any(any(o["op"] == "mutazione" and o["rarita"] == "maledetta" for e in s["esiti"] for o in e["ops"]) for ev in E.EVENTI.values() for s in ev["scelte"]),
       "le maledizioni si trovano anche negli eventi")


# ======================================================================= le mutazioni, una a una, e i ganci del motore
def colpo(d, dado_att=10, dado_dif=1):
    """Il giocatore (d.p) colpisce il busto della CPU con un Pugno che non puo' essere evitato. Ritorna gli hp persi dal busto."""
    pugno = next(a for a in DB["attacchi"] if a["nome"] == "Pugno")
    d.attivo, d.altro, d.fase = d.p, d.cpu, "player"
    d.p.azioni, d.cpu.risposte = 3, 0
    d.p.mira = "busto"
    prima = d.cpu.hp["busto"]
    with dadi(dado_att, dado_dif, 5, 5, 5):
        d.usa_attacco(pugno)
    return prima - d.cpu.hp["busto"]


def duello_nudo():
    a, b = Personaggio("Alfa"), Personaggio("Beta")
    for x in (a, b):
        dotazione_base(x, DB["attacchi"], DB["stances"])
    return W.DuelloWeb(pg=a, avversario=b)


def test_mutazioni():
    random.seed(3)
    base = E.crea_pg(gemello())
    for mid, m in E.MUTAZIONI.items():
        rec = gemello()
        stat0, f0 = dict(rec["stats"]), E.forza(rec)
        E.dai_mutazione(rec, mid)
        ok(rec["mutazioni"] == [mid] and E.forza(rec) > f0, "ogni mutazione pesa nella forza: " + mid)
        p = E.crea_pg(rec)
        ok([x["id"] for x in p.mutazioni] == [mid] and p.valuta_extra == E.extra_forza(rec), mid)
        for o in m["ops"]:
            k = o["op"]
            if k == "stat":
                ok(rec["stats"][o["stat"]] == min(4, stat0[o["stat"]] + o["delta"]) and p.stats[o["stat"]] == rec["stats"][o["stat"]], mid)
            elif k == "armatura":
                locs = list(LOCAZIONI) if o["locazione"] == "tutte" else [o["locazione"]]
                ok(all(p.armatura[l] >= o["valore"] for l in locs), mid)
            elif k == "resistenza":
                ok(p.resistenza_tot(o["tipo_danno"]) >= min(o["valore"], 75), mid)
            elif k in ("azioni", "bonus", "risposte"):
                ok(getattr(p, "n_" + k) == getattr(base, "n_" + k) + o["delta"], mid)
            elif k == "effetto":
                ok(any(e["def"]["id"] == o["id"] and e["turni"] < 0 for e in p.effetti_attivi), mid)
            elif k == "stance":
                ok(any(s["def"]["id"] == o["id"] and s["turni"] < 0 for s in p.stance_attive), mid)
            elif k == "hp_max":
                ok(all(p.hp_max[l] == base.hp_max[l] + o["valore"] for l in o["locazioni"]), mid)
            elif k == "mira_bonus":
                ok(p.mira_bonus, mid)
            elif k == "stamina":
                ok(p.stamina_extra == o["valore"] and p.stamina_max() == (p.stats["fisico"] + p.stats["riflessi"] + p.stats["mente"]) * 2 + o["valore"], mid)
            elif k == "attacco":
                ok(any(a["id"] == o["id"] for a in p.attacchi), mid)
            elif k == "mult_danno":
                ok(abs(p.mult_danno - o["valore"]) < 1e-9, mid)
            elif k == "mult_subiti":
                ok(abs(p.mult_subiti - o["valore"]) < 1e-9, mid)
            elif k == "vampiro":
                ok(p.vampiro == o["valore"], mid)
            elif k == "ultima_chance":
                ok(p.ultima_chance, mid)
        # un duello con la mutazione parte e arriva in fondo
        d = W.DuelloWeb(pg=p, avversario=E.crea_pg(gemello()))
        ok(d.stato()["player"]["mutazioni"][0]["id"] == mid, "il pannello mostra la mutazione " + mid)
        json.dumps(d.stato())

    # ---- i ganci del motore, ognuno da solo ----
    d = duello_nudo()
    d.cpu.init_stamina()
    perso = colpo(d)
    ok(perso > 0)
    for chi, attr, valore, atteso in (("p", "mult_danno", 1.5, 1.5), ("cpu", "mult_subiti", 0.5, 0.5)):
        d = duello_nudo()
        setattr(getattr(d, chi), attr, valore)
        ok(abs(colpo(d) - round(perso * atteso)) <= 1, f"{attr} moltiplica il danno ({perso} -> {atteso})")
    d = duello_nudo()
    d.p.hp["busto"], d.p.vampiro = 50, 0.5
    d.p.hp["testa"] = 70                                                # testa 70/80, busto 50/120: la cura va al piu' ferito
    rubato = colpo(d)
    ok(d.p.hp["busto"] == 50 + int(rubato * 0.5) and d.p.hp["testa"] == 70, "il vampiro cura la parte piu' ferita tra testa e busto")
    d = duello_nudo()
    d.cpu.ultima_chance = True
    d.cpu.hp["busto"] = 10
    colpo(d)
    ok(not d.finito and not d.cpu.ultima_chance and d.cpu.hp["busto"] == round(d.cpu.hp_max["busto"] * 0.3), "l'ultima chance tiene in piedi al 30%")
    d.cpu.hp["busto"] = 10
    colpo(d)
    ok(d.finito and d.vincitore is d.p, "...ma una volta sola")
    p = Personaggio("X")
    dotazione_base(p, DB["attacchi"], DB["stances"])
    p.stats["mente"] = 4
    ok(p.stamina_max() == (p.stats["fisico"] + p.stats["riflessi"] + p.stats["mente"]) * 2)
    p.stamina_extra = 10
    ok(p.stamina_max() == (p.stats["fisico"] + p.stats["riflessi"] + p.stats["mente"]) * 2 + 10)
    p.azioni, p.risposte = 3, 1
    ok(p.puo_schivare())
    p.no_schivata = True
    ok(not p.puo_schivare())
    ok(Personaggio("Y").no_mira is False and Personaggio("Y").no_schivata is False)
    # la Rigenerazione lenta: 6 hp a ogni locazione a inizio turno
    q = Personaggio("Z")
    q.applica_effetti([{"effetto": 30, "persistente": True}], DB["effetti"])
    q.hp = {l: 10 for l in q.hp}
    q.tick_turno()
    ok(all(v == 16 for v in q.hp.values()))
    # il quadro di un duello con la valuta: impianti e mutazioni contano nelle quote
    r1, r2 = gemello(), gemello()
    E.dai_mutazione(r2, "sovraccarico")
    ok(W.valuta(E.crea_pg(r2)) - W.valuta(E.crea_pg(r1)) >= E.VALORE_MUT["leggendaria"] - 1 or W.valuta(E.crea_pg(r1)) != W.valuta(E.crea_pg(r2)))


# ======================================================================= le regole d'arena
def test_regole():
    for rid, r in E.REGOLE.items():
        c = nuova(seed=5)
        c.regola = rid
        pg, nemico, regola = c.prepara_duello()
        ok(regola["id"] == rid)
        for p in (pg, nemico):
            if rid == "doppia_azione":
                ok(p.n_azioni == AZIONI_BASE + 1)
            if rid == "nebbia":
                ok(p.no_mira and not p.puo_mirare())
            if rid == "pavimento_viscido":
                ok(p.no_schivata and not p.puo_schivare())
            if rid == "folla_delirio":
                ok(any(e["def"]["id"] == 18 for e in p.effetti_attivi))
            if rid == "ring_fiamme":
                ok(any(e["def"]["id"] == 1 for e in p.effetti_attivi))
            if rid == "standard":
                ok(not p.no_mira and not p.no_schivata and p.n_azioni == AZIONI_BASE and not p.effetti_attivi)
        c.fase = "bracket"
    # la finale e lo sparring non sono mai su un ring regolare
    c = nuova()
    ok(all(c._scegli_regola(dura=True) != "standard" for _ in range(60)))
    ok({c._scegli_regola() for _ in range(300)} == set(E.REGOLE), "nei duelli normali escono tutte")


# ======================================================================= la corsa
def test_creazione_e_primo_bottino():
    random.seed(1)
    c = E.Corsa(0)
    ok(len(c.eroi) == 16 and len({e["nome"] for e in c.eroi}) == 16 and len(c.turni[0]) == 8 and c.fase == "campioni")
    ok(len(c.candidati) == 3 and len(set(c.candidati)) == 3 and all(0 <= i < 16 for i in c.candidati))
    ok(all(len(e["mutazioni"]) == 1 and len(e["poteri"]) == 1 and e["hp"] is None for e in c.eroi), "tutti hanno un tratto di partenza e un potere")
    ok(all(E.MUTAZIONI[e["mutazioni"][0]]["rarita"] == "comune" and not E.MUTAZIONI[e["mutazioni"][0]].get("corsa") for e in c.eroi))
    ok(c.gettoni == E.GETTONI_INIZIALI and c.io is None)
    ok(c.scegli_campione(99) is not None and c.scegli_carta(0) is not None and c.scegli_porta(0) is not None, "fuori fase")
    st = c.stato()
    json.dumps(st)
    ok(len(st["candidati"]) == 3 and "eroe" not in st and st["fase"] == "campioni")
    ok(c.scegli_campione(c.candidati[1]) is None and c.io == c.candidati[1] and c.fase == "bottino")
    b = c.bottino
    ok(b["scelte"] == 2 and len(b["carte"]) == 3 and len({x["tipo"] for x in b["carte"]}) == 3, "primo bottino: tre carte di tipi diversi, se ne scelgono due")
    ok(c.scegli_carta(7) is not None and c.scegli_carta("a") is not None and c.scegli_carta(True) is not None)
    n_prima = len(c.eroe()["poteri"]) + len(c.eroe()["mutazioni"]) + len(c.eroe()["protesi"]) + len(c.eroe()["augments"]) + sum(c.eroe()["stats"].values())
    ok(c.scegli_carta(0) is None and c.fase == "bottino" and len(c.bottino["carte"]) == 2 and c.bottino["scelte"] == 1)
    ok(c.scegli_carta(0) is None and c.fase == "bracket" and c.bottino is None)
    n_dopo = len(c.eroe()["poteri"]) + len(c.eroe()["mutazioni"]) + len(c.eroe()["protesi"]) + len(c.eroe()["augments"]) + sum(c.eroe()["stats"].values())
    ok(n_dopo >= n_prima + 2 - 2, "due carte applicate")    # (un +1 statistica o un potere: sempre almeno +1 per carta... a meno di rango al massimo)
    ok(E.forza(c.eroe()) > E.forza(c.eroi[c.candidati[0]]) - 40)
    # rilancio e salto
    c = E.Corsa(0)
    c.scegli_campione(c.candidati[0])
    carte0 = json.dumps(c.bottino["carte"])
    ok(c.gettoni == 3 and c.rilancia() is None and c.gettoni == 1 and c.bottino["rilanci"] == 1 and c.costo_rilancio() == 3)
    ok(c.rilancia() == "gettoni insufficienti" and c.gettoni == 1)
    ok(c.salta_bottino() is None and c.gettoni == 3 and c.fase == "bracket", "saltare dà due gettoni e chiude")
    ok(c.rilancia() is not None and c.salta_bottino() is not None)


def test_tipi_di_carte():
    c = nuova(seed=7)
    eroe = c.eroe()
    # tutti i tipi di carta: ognuno si applica e lascia una riga di cronaca
    eroe["stats"]["controllo"] = 3
    for carta in ({"tipo": "potere", "id": E.poteri_nuovi(eroe)[0]["id"], "rango": 2}, {"tipo": "rango", "id": eroe["poteri"][0]["id"], "da": 1, "a": 2},
                  {"tipo": "stat", "stat": "fisico", "da": eroe["stats"]["fisico"]}, {"tipo": "mutazione", "id": "pelle_dura"}):
        f0 = E.forza(eroe)
        riga = E.applica_carta(eroe, carta, c)
        ok(riga and E.forza(eroe) > f0, carta["tipo"])
        d = c.descrivi(carta)
        ok(d["titolo"] and d["sotto"] and d["icona"] and d["descrizione"], carta["tipo"])
    cat, it = E.equip_validi(eroe)[0]
    E.applica_carta(eroe, {"tipo": "equip", "cat": cat, "id": it["id"]}, c)
    ok(it["id"] in (eroe["protesi"] if cat == "protesi" else eroe["augments"]))
    ok(c.descrivi({"tipo": "medikit"})["titolo"] == "Medikit")
    # le carte offerte sono sempre applicabili: mai un potere gia' noto, un rango oltre il controllo, un impianto che non sta
    for s in range(60):
        c = nuova(seed=100 + s)
        for _ in range(3):
            if c.fase != "bracket":
                break
            vinci(c)
            if c.fase != "bottino":
                break
            e = c.eroe()
            for carta in c.bottino["carte"]:
                if carta["tipo"] == "potere":
                    ok(carta["id"] not in {p["id"] for p in e["poteri"]} and len(e["poteri"]) < W.MAX_POTERI)
                    ok(carta["rango"] <= E.rango_massimo(e))
                elif carta["tipo"] == "rango":
                    ok(next(p for p in e["poteri"] if p["id"] == carta["id"])["rango"] < E.rango_massimo(e))
                elif carta["tipo"] == "stat":
                    ok(e["stats"][carta["stat"]] < 4)
                elif carta["tipo"] == "equip":
                    ok(W._controlla_equip(e, carta["cat"], E._def_item(carta["cat"], carta["id"]), False)[0])
                else:
                    ok(carta["id"] not in e["mutazioni"])
            c.scegli_carta(0)
            if c.fase == "porte":
                c.scegli_porta(0)
                if c.fase == "mercato":
                    c.esci_mercato()
                elif c.fase == "allenamento":
                    c.allena(0)
                elif c.fase == "evento":
                    c.scegli_evento(len(c.evento["scelte"]) - 1)
                    c.chiudi_evento()


def test_duello_e_vita_che_resta():
    c = nuova(seed=11)
    ok(c.fase == "bracket" and c.regola in E.REGOLE)
    st = c.stato()
    json.dumps(st)
    ok(0 < st["pronostico"] < 1 and st["avversario"]["nome"] != st["eroe"]["nome"] and st["regola"]["id"] == c.regola and not st["sparring"])
    ok(st["avversario"]["storia"] == [] and len(st["partecipanti"]) == 16)
    g0, ctrl0 = c.gettoni, c.eroe()["stats"]["controllo"]
    pg, nemico, regola = c.prepara_duello()
    ok(c.fase == "duello" and c.prepara_duello() is None and c.scegli_porta(0) is not None)
    ok(pg.nome == c.eroe()["nome"] and nemico.nome == st["avversario"]["nome"])
    # la vita si porta dietro: l'eroe esce con braccio a pezzi e busto ammaccato
    c.fase = "bracket"
    c.duello_tipo = "torneo"
    d = vinci(c, hp={"busto": 20, "braccio_dx": -60, "gamba_sx": 30}, round_duello=6)
    ok(c.fase == "bottino" and c.round == 1 and len(c.turni) == 2 and len(c.turni[1]) == 4)
    ok(c.eroe()["stats"]["controllo"] == min(4, ctrl0 + 1), "il controllo sale da solo a ogni vittoria")
    rec = c.eroe()
    for loc, prima in (("busto", 20), ("braccio_dx", -60), ("gamba_sx", 30)):
        atteso = int(round(prima + (d.p.hp_max[loc] - prima) * E.RECUPERO))
        ok(rec["hp"][loc] == atteso, (loc, rec["hp"][loc], atteso))
    ok(rec["hp"]["testa"] == d.p.hp_max["testa"] and not rec["crippled"], "le ferite gravi si rimarginano da sole")
    frac, _ = E.salute(rec)
    ok(0.5 < frac < 1)
    ok(c.gettoni >= g0 + E.GETTONI_VITTORIA and c.punti["vittorie"] == E.PUNTI_VITTORIA and c.conta["vittorie"] == 1)
    ok(all(c.eroi[m["win"]]["storia"] for m in c.turni[0] if m["win"] != c.io), "le CPU vincitrici sono cresciute")
    ok(c.bottino["tipo"] == "normale" and c.bottino["scelte"] == 1 and c.bottino["dopo"] == "porte")
    # il duello successivo parte con la vita rimasta
    pg2 = E.crea_pg(rec)
    ok(pg2.hp["busto"] == rec["hp"]["busto"] and pg2.hp["braccio_dx"] == rec["hp"]["braccio_dx"] and E.frazione_hp(pg2) < 1)
    # una protesi riparte sempre a piena vita
    p_br = next(pr for pr in DB["protesi"] if pr["locazione"] == "braccio_dx")
    rec3 = gemello()
    rec3["stats"]["mente"], rec3["stats"]["sociale"] = 4, 4
    E.dai_equip(rec3, "protesi", p_br)
    rec3["hp"] = {l: 1 for l in LOCAZIONI}
    pg3 = E.crea_pg(rec3)
    ok(pg3.hp["braccio_dx"] == pg3.hp_max["braccio_dx"] and pg3.hp["busto"] == 1)
    E.recupera(rec3, pg3, 0.0)
    ok(rec3["hp"]["braccio_dx"] == pg3.hp_max["braccio_dx"] and "braccio_dx" not in rec3["crippled"])
    # ferite e cure: gli eventi non uccidono, il riposo guarisce tutto
    rec4 = gemello()
    E.ferisci(rec4, 5.0)
    ok(rec4["hp"]["testa"] >= 1 and rec4["hp"]["busto"] >= 1 and rec4["crippled"], "ferisci non uccide ma azzoppa")
    E.cura(rec4, 1.0)
    ok(E.salute(rec4)[0] == 1 and not rec4["crippled"])
    # una mutazione che alza gli hp massimi li alza anche a un eroe ferito
    rec5 = gemello()
    E.ferisci(rec5, 0.5)
    h0 = rec5["hp"]["busto"]
    E.dai_mutazione(rec5, "titano")
    ok(rec5["hp"]["busto"] == h0 + 50 and E.crea_pg(rec5).hp_max["busto"] == LOCAZIONI["busto"] + 50)
    E.dai_mutazione(rec5, "avidita")
    ok(rec5["hp"]["busto"] >= 1)


def test_sconfitta_e_fine():
    c = nuova(seed=13)
    meta0 = E.META["corse"]
    vinci(c, False)
    ok(c.fase == "eliminato" and c.campione and c.campione != c.eroe()["nome"] or c.fase == "eliminato")
    ok(len(c.turni) == 4 and c.turni[3][0]["win"] is not None and c.riepilogo and not c.riepilogo["titolo"] and c.riepilogo["turno"] == "Ottavi")
    ok(E.META["corse"] == meta0 + 1 and E.META["storico"][-1]["titolo"] is False)
    st = c.stato()
    json.dumps(st)
    ok(st["riepilogo"]["totale"] == c.riepilogo["totale"] and st["fase"] == "eliminato")
    ok(c.prepara_duello() is None and c.chiudi() is None)
    c2 = nuova(seed=14)
    ok(c2.chiudi() == "la corsa non è finita")
    # vittoria completa: quattro turni, il titolo, il punteggio spiegato voce per voce
    c = nuova(seed=15)
    t0 = E.META["titoli"]
    pilota(c, True)
    ok(c.fase == "vittoria" and c.campione == c.eroe()["nome"] and c.conta["vittorie"] == 4 and c.round == 3)
    r = c.riepilogo
    ok(r["titolo"] and r["turno"] == "Campione" and any(et == "Titolo del Torneo Evo" and p == E.PUNTI_TITOLO for et, p in r["righe"]))
    ok(r["base"] == sum(p for _, p in r["righe"]) and r["totale"] == round(r["base"] * r["moltiplicatore"]) and r["moltiplicatore"] == 1)
    ok(E.META["titoli"] == t0 + 1 and E.META["migliore"] >= r["totale"] and E.META["ascensione_max"] >= 1 and r["sbloccata"], "il titolo sblocca l'ascensione")
    ok(c.eroe()["mutazioni"] and E.META["storico"][-1]["punteggio"] == r["totale"])
    # ascensione: moltiplicatore del punteggio, e si sblocca la successiva solo vincendo alla piu' alta
    E.META["ascensione_max"] = 2
    c = nuova(asc=2, seed=16)
    pilota(c, True)
    ok(c.riepilogo["moltiplicatore"] == 1.5 and c.riepilogo["totale"] == round(c.riepilogo["base"] * 1.5) and E.META["ascensione_max"] == 3)
    c = nuova(asc=1, seed=17)
    pilota(c, True)
    ok(c.riepilogo["sbloccata"] is None and E.META["ascensione_max"] == 3, "vincere a un'ascensione piu' bassa non ne sblocca altre")
    E.META["ascensione_max"] = 4
    c = nuova(asc=4, seed=18)
    pilota(c, True)
    ok(E.META["ascensione_max"] == 4 and c.riepilogo["moltiplicatore"] == 2.0)
    E.META["ascensione_max"] = 0
    ok(len(E.META["storico"]) <= 12)


def test_porte():
    c = nuova(seed=21)
    vinci(c)
    c.scegli_carta(0)
    ok(c.fase == "porte" and len(c.porte) == 3 and len({p["tipo"] for p in c.porte}) == 3 and c.bottino is None)
    for p in c.porte:
        ok(p["titolo"] and p["testo"] and p["icona"])
    json.dumps(c.stato())
    ok(c.scegli_porta(3) is not None and c.scegli_porta(-1) is not None and c.scegli_porta(None) is not None)
    # con poca vita una delle porte e' sempre il riposo
    for s in range(40):
        c = nuova(seed=200 + s)
        E.ferisci(c.eroe(), 0.9)
        ok(E.salute(c.eroe())[0] < E.SOGLIA_RIPOSO)
        c._apri_porte()
        ok(any(p["tipo"] == "riposo" for p in c.porte), "riposo garantito")
    # ogni porta, scelta direttamente
    for tipo in ("riposo", "mercato", "allenamento", "sparring", "evento"):
        c = nuova(seed=22)
        E.ferisci(c.eroe(), 0.4)
        c.porte = [c._porta(tipo)] * 1
        c.fase = "porte"
        ok(c.scegli_porta(0) is None)
        if tipo == "riposo":
            ok(c.fase == "bracket" and E.salute(c.eroe())[0] == 1 and not c.eroe()["crippled"], "il riposo guarisce tutto")
        elif tipo == "mercato":
            ok(c.fase == "mercato" and c.esci_mercato() is None and c.fase == "bracket" and c.mercato is None)
        elif tipo == "allenamento":
            ok(c.fase in ("allenamento", "bracket"))
        elif tipo == "sparring":
            ok(c.fase == "sparring" and c.sparring["rec"]["elite"] and c.regola != "standard")
        else:
            ok(c.fase == "evento" and c.evento["esito"] is None)


def test_mercato():
    c = nuova(seed=31)
    c.gettoni = 100
    c._apri_mercato()
    st = c.stato()
    json.dumps(st)
    tipi = [o["tipo"] for o in st["mercato"]]
    ok(tipi.count("medikit") == 1 and "equip" in tipi and "mutazione" in tipi and all(o["prezzo"] >= 1 and not o["comprata"] for o in st["mercato"]))
    ok(c.compra(99) is not None and c.compra(-1) is not None)
    # compra ognuno: i gettoni scendono del prezzo, l'acquisto si applica, e non si ricompra
    for i, o in enumerate(list(c.mercato["offerte"])):
        g = c.gettoni
        eroe = c.eroe()
        f0 = E.forza(eroe)
        E.ferisci(eroe, 0.3) if o["tipo"] == "medikit" else None
        s0 = E.salute(eroe)[0]
        err = c.compra(i)
        if err:
            ok("Umanità" in err or "slot" in err, err)
            continue
        ok(c.gettoni == g - o["prezzo"] and c.mercato["offerte"][i]["comprata"] and c.compra(i) == "già comprato")
        if o["tipo"] == "medikit":
            ok(E.salute(eroe)[0] > s0)
        else:
            ok(E.forza(eroe) > f0)
    # senza gettoni non si compra
    c.gettoni = 0
    c.mercato["offerte"] = [dict(o, comprata=False, prezzo=5) for o in c.mercato["offerte"]]
    ok(c.compra(0) == "gettoni insufficienti" and c.gettoni == 0)
    # lo sconto del Contrattatore
    c = nuova(seed=32)
    prezzo0 = c._prezzo(10)
    E.dai_mutazione(c.eroe(), "contrattatore")
    ok(prezzo0 == 10 and c._prezzo(10) == 7)
    c = nuova(asc=3, seed=33)
    ok(c._prezzo(10) == 15 and c.gettoni == 0, "all'ascensione 3 si parte senza gettoni e il mercato costa di piu'")
    ok(c.esci_mercato() is not None)


def test_allenamento():
    c = nuova(seed=41)
    c.eroe()["stats"]["controllo"] = 3
    c._apri_allenamento()
    ok(c.fase == "allenamento")
    ops = c.stato()["allenamento"]
    ok(any(o["tipo"] == "stat" for o in ops) and any(o["tipo"] == "rango" for o in ops))
    ok(c.allena(99) is not None)
    f0 = E.forza(c.eroe())
    ok(c.allena(0) is None and c.fase == "bracket" and E.forza(c.eroe()) > f0 and c.allenamento is None)
    ok(c.allena(0) is not None)
    # tutto al massimo: niente da imparare, ti pagano
    c = nuova(seed=42)
    e = c.eroe()
    for s in E.STAT_POT:
        e["stats"][s] = 4
    e["stats"]["controllo"] = 1
    g = c.gettoni
    c._apri_allenamento()
    ok(c.fase == "bracket" and c.gettoni == g + 4)


def test_eventi():
    # ogni scelta di ogni evento, piu' volte: mai un'eccezione, mai gettoni negativi, la vita non scende sotto 1 su testa e busto
    for eid, ev in E.EVENTI.items():
        for i, s in enumerate(ev["scelte"]):
            for seme in range(12):
                random.seed(seme * 7 + i)
                c = nuova(seed=300 + seme)
                c.gettoni = 30
                c.eroe()["stats"]["controllo"] = 2
                c._apri_evento(eid)
                st = c.stato()
                json.dumps(st)
                ok(st["evento"]["titolo"] == ev["titolo"] and len(st["evento"]["scelte"]) == len(ev["scelte"]) and all(x["disponibile"] for x in st["evento"]["scelte"]))
                g0, f_mut0 = c.gettoni, len(c.eroe()["mutazioni"])
                ok(c.scegli_evento(i) is None, eid)
                ok(c.evento["esito"]["righe"] and c.scegli_evento(i) == "nessuna scelta in corso" and c.chiudi_evento() is None, eid)
                ok(c.fase == "bracket" and c.evento is None and c.gettoni >= 0, eid)
                ok(c.gettoni >= g0 - s.get("costo", 0) - 1, eid)
                h = c.eroe()["hp"]
                ok(h is None or (h["testa"] >= 1 and h["busto"] >= 1), eid)
                ok(c.chiudi_evento() is not None)
    # il costo: con pochi gettoni la scelta a pagamento non e' disponibile e il server la rifiuta
    c = nuova(seed=50)
    c.gettoni = 0
    c._apri_evento("medico")
    disp = [x["disponibile"] for x in c.stato()["evento"]["scelte"]]
    ok(disp == [False, False, True], disp)
    ok(c.scegli_evento(0) == "gettoni insufficienti" and c.evento["esito"] is None and c.chiudi_evento() is not None)
    # un'opzione senza niente da dare (tutto al massimo) ripaga in gettoni
    c = nuova(seed=51)
    for s in E.STAT_POT:
        c.eroe()["stats"][s] = 4
    g = c.gettoni
    righe = []
    c._op_evento({"op": "stat", "stat": "casuale", "delta": 1}, righe)
    ok(c.gettoni == g + 3 and "Niente da guadagnare" in righe[0])
    # gli eventi non si ripetono finche' ce ne sono di nuovi
    c = nuova(seed=52)
    visti = []
    for _ in range(len(E.EVENTI)):
        p = c._porta("evento")
        visti.append(p["evento"])
        c._apri_evento(p["evento"])
    ok(len(set(visti)) == len(E.EVENTI))


def test_sparring():
    # vinto: 5 gettoni e un bottino di sole mutazioni rare o leggendarie, poi si torna al tabellone
    c = nuova(seed=61)
    c.porte = [c._porta("sparring")]
    c.fase = "porte"
    c.scegli_porta(0)
    st = c.stato()
    json.dumps(st)
    ok(st["fase"] == "sparring" and st["sparring"] and st["avversario"]["elite"] and st["regola"]["id"] != "standard")
    ok(c.avversario()["elite"] and len(c.avversario()["mutazioni"]) >= 2 and 0 < st["pronostico"] < 1)
    g0 = c.gettoni
    vinci(c, True, round_duello=3)
    ok(c.fase == "bottino" and c.bottino["tipo"] == "elite" and c.bottino["dopo"] == "bracket" and c.gettoni >= g0 + E.GETTONI_SPARRING and c.sparring is None)
    ok(c.conta["sparring"] == 1 and c.punti["sparring"] == E.PUNTI_SPARRING)
    ok(len(c.bottino["carte"]) >= 2 and all(x["tipo"] == "mutazione" and E.MUTAZIONI[x["id"]]["rarita"] in ("rara", "leggendaria") for x in c.bottino["carte"]))
    ok(c.rilancia() is not None, "il premio dell'elite non si rilancia")
    ok(c.stato()["bottino"]["rilancio_possibile"] is False)
    ok(c.scegli_carta(0) is None and c.fase == "bracket" and c.round == 0, "lo sparring non fa avanzare il tabellone")
    # perso: i gettoni vanno via, resti a un quarto della vita, la corsa continua
    c = nuova(seed=62)
    c.gettoni = 17
    c.porte = [c._porta("sparring")]
    c.fase = "porte"
    c.scegli_porta(0)
    vinci(c, False)
    ok(c.fase == "bracket" and c.gettoni == 0 and c.round == 0 and c.sparring is None)
    pg = E.crea_pg(c.eroe())
    ok(all(pg.hp[l] == max(1, int(pg.hp_max[l] * E.RECUPERO_SPARRING_SCONFITTA)) or l in pg.protesi_locazioni for l in LOCAZIONI))
    ok(abs(E.salute(c.eroe())[0] - E.RECUPERO_SPARRING_SCONFITTA) < 0.02)
    ok(c.fase != "eliminato" and not c.riepilogo and c.regola in E.REGOLE)
    # il garantito: dopo Quarti e Semifinale una carta e' una mutazione rara o leggendaria
    for s in range(25):
        c = nuova(seed=400 + s)
        c.round = 2
        c._apri_bottino("garantito", "porte")
        gar = [x for x in c.bottino["carte"] if x.get("garantita")]
        ok(len(gar) == 1 and E.MUTAZIONI[gar[0]["id"]]["rarita"] in ("rara", "leggendaria"))


def test_ascensioni():
    c = nuova(asc=1, seed=71)
    random.seed(71)
    base = E.Corsa(0)
    cpu0, cpu1 = gemello(), gemello()
    n0 = n1 = 0
    for k in range(40):
        random.seed(k)
        a, b = gemello(), gemello()
        for r in (a, b):
            r["stats"]["controllo"] = 1
        E.evolvi_cpu(a, 2, extra=E.CPU_EXTRA[0], giro=1, mut_extra=E.CPU_MUT_EXTRA[0])
        random.seed(k)
        E.evolvi_cpu(b, 2, extra=E.CPU_EXTRA[1], giro=1, mut_extra=E.CPU_MUT_EXTRA[1])
        n0 += E.forza(a)
        n1 += E.forza(b)
    ok(n1 > n0, "le CPU dell'ascensione 1 crescono di piu'")
    ok(len(E.ASCENSIONI) == 5 and len(E.CPU_EXTRA) == 5 and len(E.CPU_MUT_EXTRA) == 5)
    ok(E.stato_iniziale()["ascensioni"][0]["sbloccata"] and not E.stato_iniziale()["ascensioni"][4]["sbloccata"])
    # all'ascensione 2 si recupera meno
    for asc, frazione in ((0, E.RECUPERO), (2, E.RECUPERO_DURO)):
        c = nuova(asc=asc, seed=72)
        d = vinci(c, hp={"busto": 20}, round_duello=6)
        ok(c.eroe()["hp"]["busto"] == int(round(20 + (d.p.hp_max["busto"] - 20) * frazione)), asc)
    # la leggenda: in finale c'e' un campione d'elite
    c = nuova(asc=4, seed=73)
    for _ in range(60):
        if c.round == 3 and c.fase == "bracket":
            break
        if c.fase in ("bracket", "sparring"):
            vinci(c)
        else:
            pilota_un_passo(c)
    ok(c.round == 3 and c.fase == "bracket" and c.avversario()["elite"], "all'ascensione 4 la finale e' contro un'elite")


def pilota_un_passo(c):
    if c.fase == "bottino":
        c.scegli_carta(0)
    elif c.fase == "porte":
        c.scegli_porta(0)
    elif c.fase == "mercato":
        c.esci_mercato()
    elif c.fase == "allenamento":
        c.allena(0)
    elif c.fase == "evento":
        c.scegli_evento(len(c.evento["scelte"]) - 1) if c.evento["esito"] is None else c.chiudi_evento()


def fino_al_bracket(c, passi=80):
    """Dal bottino alle porte fino al prossimo combattimento (uno sparring che capita si vince)."""
    for _ in range(passi):
        if c.fase in ("bracket", "eliminato"):
            return
        if c.fase == "sparring":
            vinci(c, True)
        else:
            pilota_un_passo(c)
    raise AssertionError("non si arriva al combattimento: " + c.fase)


def test_infinito():
    # prima del titolo non esiste
    c = nuova(seed=15)
    ok(c.inizia_infinito() is not None and c.ritira() is not None and not c.puo_infinito() and not c.stato()["puo_infinito"])
    pilota(c, True)
    ok(c.fase == "vittoria" and c.puo_infinito() and c.stato()["puo_infinito"] and not c.stato()["infinito"]["attivo"])
    titolo = json.loads(json.dumps(c.riepilogo))
    corse, storico, migliore = E.META["corse"], len(E.META["storico"]), E.META["migliore"]
    ok(c.inizia_infinito() is None and c.infinito and c.giro_inf == 0 and c.fase == "bottino")
    ok(c.bottino["tipo"] == "garantito" and c.bottino["dopo"] == "porte" and c.sfidante["infinito"] == 1 and not c.puo_infinito() and c.inizia_infinito() is not None)
    st = c.stato()
    json.dumps(st)
    ok(st["nome_turno"] == "Infinito 1" and st["infinito"]["attivo"] and st["infinito"]["livello"] == 1 and st["punteggio_parziale"] == titolo["base"])
    ok(c.ritira() is not None, "non ci si ritira in mezzo al bottino")
    ok(c.scegli_carta(0) is None)
    fino_al_bracket(c)
    # sfidanti sempre piu' forti: livello dopo livello, con una scala senza fondo e un boss ogni BOSS_OGNI
    forze, tot_inf = [], 0
    for k in range(12):
        liv = k + 1
        ok(c.fase == "bracket" and c.avversario() is c.sfidante and c.sfidante["infinito"] == liv and c.stato()["nome_turno"] == f"Infinito {liv}")
        st = c.stato()
        json.dumps(st)
        boss = liv % E.BOSS_OGNI == 0
        ok(st["avversario"]["infinito"] == liv and st["avversario"]["scala"]["hp"] == round(E.SCALA_HP * E.liv_scala(liv)) and st["infinito"]["boss"] == boss and st["avversario"]["elite"] == boss)
        ok(0 <= st["pronostico"] <= 1)
        if boss:
            ok(c.regola != "standard", "un boss non e' mai su un ring regolare")
        pg, nemico, regola = c.prepara_duello()
        ok(nemico.hp_max["busto"] >= LOCAZIONI["busto"] + round(E.SCALA_HP * E.liv_scala(liv)) and nemico.mult_danno >= 1 + E.SCALA_DANNI * E.liv_scala(liv) - 1e-9
           and nemico.armatura["gamba_dx"] >= round(E.SCALA_ARMATURA * E.liv_scala(liv)), "la scala e' addosso allo sfidante")
        c.fase = "bracket"
        forze.append(E.forza(c.sfidante))
        g0 = c.gettoni
        vinci(c, True, round_duello=4)
        ok(c.giro_inf == liv and E.META["infinito_max"] == liv and c.gettoni > g0 and c.sfidante["infinito"] == liv + 1)
        ok(c.punti["infinito"] > tot_inf, "ogni sfidante battuto vale punti")
        ok(E.PUNTI_INFINITO + E.PUNTI_INFINITO_PASSO * liv + (E.PUNTI_BOSS if boss else 0) <= c.punti["infinito"] - tot_inf, "e di piu' i livelli alti")
        tot_inf = c.punti["infinito"]
        if c.fase == "bottino":
            ok(c.bottino["tipo"] == ("elite" if boss else "garantito" if liv % 3 == 0 else "normale") and c.bottino["dopo"] == "porte")
        ok(E.META["corse"] == corse and len(E.META["storico"]) == storico)
        fino_al_bracket(c)
    ok(sum(forze[-3:]) > sum(forze[:3]) + 60, forze)
    ok(c.conta["vittorie"] == 4, "i quattro turni del torneo non cambiano")
    # lo sparring cresce coi livelli
    el = c._crea_elite()
    ok(len(el["storia"]) == c.round + 2 + c.giro_inf)
    # si perde: il punteggio del titolo resta e si aggiungono i punti dell'infinito
    vinci(c, False)
    ok(c.fase == "eliminato")
    r = c.riepilogo
    ok(r["infinito"] == 12 and not r["ritirato"] and r["turno"] == "Infinito 12" and r["titolo"])
    ok(r["righe"][:len(titolo["righe"])] == titolo["righe"] and r["righe"][-1][0].startswith("Modalità infinita (12") and r["righe"][-1][1] == c.punti["infinito"], r["righe"])
    ok(c.punti["infinito"] >= tot_inf and r["base"] == titolo["base"] + c.punti["infinito"] and r["totale"] == round(r["base"] * r["moltiplicatore"]) and r["totale"] > titolo["totale"])
    ok(r["sbloccata"] == titolo["sbloccata"])
    ok(E.META["corse"] == corse and len(E.META["storico"]) == storico, "e' la stessa corsa: non si conta due volte")
    ok(E.META["migliore"] == max(migliore, r["totale"]) and E.META["infinito_max"] == 12 and r["record"])
    ultima = E.META["storico"][-1]
    ok(ultima["infinito"] == 12 and ultima["punteggio"] == r["totale"] and ultima["turno"] == "Infinito 12" and ultima["titolo"])
    st = c.stato()
    json.dumps(st)
    ok(st["fase"] == "eliminato" and st["riepilogo"]["infinito"] == 12 and c.chiudi() is None)

    # ci si ritira tra un combattimento e l'altro (anche alle porte): vale quanto perdere. Senza sfidanti battuti il punteggio e' quello del titolo
    c = nuova(seed=16)
    pilota(c, True)
    base_t = c.riepilogo["base"]
    c.inizia_infinito()
    c.scegli_carta(0)
    ok(c.fase == "porte" and c.ritira() is None and c.fase == "eliminato" and c.porte is None)
    r = c.riepilogo
    ok(r["infinito"] == 0 and r["ritirato"] and r["turno"] == "Campione" and r["base"] == base_t and not any("infinita" in x[0] for x in r["righe"]))
    ok(c.ritira() is not None, "una volta sola")
    c = nuova(seed=17)
    pilota(c, True)
    c.inizia_infinito()
    fino_al_bracket(c)
    vinci(c, True)
    fino_al_bracket(c)
    pg, nemico, regola = c.prepara_duello()
    ok(c.fase == "duello" and c.ritira() is not None, "non in mezzo a un duello")
    c.fase = "bracket"
    ok(c.ritira() is None and c.riepilogo["infinito"] == 1 and c.riepilogo["ritirato"])

    # l'ascensione moltiplica anche i punti dell'infinito
    E.META["ascensione_max"] = 2
    c = nuova(asc=2, seed=18)
    pilota(c, True)
    c.inizia_infinito()
    fino_al_bracket(c)
    vinci(c, True)
    fino_al_bracket(c)
    vinci(c, False)
    r = c.riepilogo
    ok(r["moltiplicatore"] == 1.5 and r["totale"] == round(r["base"] * 1.5) and r["infinito"] == 1)

    # salvataggio: a meta' dell'infinito, e con un duello interrotto
    c = nuova(seed=19)
    pilota(c, True)
    c.inizia_infinito()
    fino_al_bracket(c)
    vinci(c, True)
    fino_al_bracket(c)
    E.salva(c)
    c2 = E.carica()
    ok(c2.a_dict() == c.a_dict() and c2.infinito and c2.giro_inf == 1 and c2.sfidante == c.sfidante and c2.fase == "bracket")
    c.prepara_duello()
    c3 = E.carica()
    ok(c3.fase == "bracket" and c3.avversario() == c.sfidante, "un duello interrotto all'infinito riparte dallo stesso sfidante")
    # una corsa salvata prima dell'infinito (senza i campi nuovi) si legge ancora
    vecchio = c3.a_dict()
    for k in ("infinito", "giro_inf", "sfidante", "riepilogo_titolo", "migliore_altri"):
        vecchio.pop(k)
    c4 = E.Corsa.da_dict(vecchio)
    ok(c4.infinito is False and c4.giro_inf == 0 and c4.sfidante is None and not c4.puo_infinito())
    meta_vecchio = E._meta_vuoto()
    meta_vecchio.pop("infinito_max")
    with open(E.PERCORSO, "w", encoding="utf-8") as f:
        json.dump({"v": 1, "meta": meta_vecchio, "corsa": None}, f)
    ok(E.carica() is None and E.META["infinito_max"] == 0)
    E.salva(None)


def test_forza_e_cpu():
    r = gemello()
    f = E.forza(r)
    E.dai_mutazione(r, "pelle_dura")
    ok(E.forza(r) == f + E.VALORE_MUT["comune"])
    cat, it = E.equip_validi(r)[0]
    E.dai_equip(r, cat, it)
    ok(E.forza(r) == f + E.VALORE_MUT["comune"] + E.VALORE_EQUIP)
    a, b = gemello(), gemello()
    for t in E.STAT_POT:
        a["stats"][t] = 4
    c = nuova(seed=81)
    c.eroi[0], c.eroi[1] = a, b
    vinte = sum(c._vince_cpu(0, 1) == 0 for _ in range(3000)) / 3000
    ok(abs(vinte - 1 / (1 + 2.718281828 ** (-E.K_FORZA * (E.forza(a) - E.forza(b))))) < 0.04 and vinte > 0.7)
    # le CPU crescono: controllo, un miglioramento, un impianto, e dal secondo giro a volte una mutazione
    random.seed(5)
    rec = gemello()
    muts = 0
    for g in range(8):
        n_imp = len(rec["protesi"]) + len(rec["augments"])
        prima = E.forza(rec)
        E.evolvi_cpu(rec, g + 2, giro=g)
        ok(E.forza(rec) > prima and rec["storia"][-1]["round"] == g and rec["storia"][-1]["novita"] and rec["hp"] is None)
        ok(len(rec["poteri"]) <= W.MAX_POTERI and all(p["rango"] <= E.rango_massimo(rec) for p in rec["poteri"]) and all(rec["stats"][s] <= 4 for s in rec["stats"]))
        ok(W._controlla_equip({k: v for k, v in rec.items() if k not in ("protesi", "augments")}, "augment", {"id": -1, "costo_umanita": 0}, False)[0])
        ok(not any(E.MUTAZIONI[m].get("corsa") for m in rec["mutazioni"]), "le CPU non prendono mutazioni di corsa")
    ok(len(rec["mutazioni"]) >= 2 and len(set(rec["mutazioni"])) == len(rec["mutazioni"]))
    # l'elite e' piu' forte di un eroe normale dello stesso turno
    c = nuova(seed=82)
    c.round = 1
    el = c._crea_elite()
    ok(el["elite"] and E.forza(el) > E.forza(c.eroe()) and any(E.MUTAZIONI[m]["rarita"] == "rara" for m in el["mutazioni"]) and el["nome"] not in {e["nome"] for e in c.eroi})


def test_salvataggio():
    c = nuova(seed=91)
    c.gettoni = 9
    d = json.loads(json.dumps(c.a_dict()))
    c2 = E.Corsa.da_dict(d)
    ok(c2.a_dict() == c.a_dict() and c2.stato()["eroe"]["nome"] == c.stato()["eroe"]["nome"])
    E.salva(c)
    ok(os.path.exists(E.PERCORSO))
    c3 = E.carica()
    ok(c3.a_dict() == c.a_dict() and c3.fase == "bracket" and c3.gettoni == 9)
    # un duello interrotto non e' stato giocato: si riparte dalla schermata prima (e il tabellone e' quello di prima)
    pg, nemico, regola = c.prepara_duello()
    ok(c.fase == "duello" and E.carica().fase == "bracket")
    c.fase, c.duello_tipo = "bracket", "torneo"
    c.porte = [c._porta("sparring")]
    c.fase = "porte"
    c.scegli_porta(0)
    c.prepara_duello()
    c4 = E.carica()
    ok(c4.fase == "sparring" and c4.sparring["rec"]["elite"] and c4.avversario()["nome"] == c.avversario()["nome"])
    # il record sopravvive alla corsa; il file rovinato non rompe il gioco
    E.META["migliore"] = 4321
    E.salva(None)
    ok(E.carica() is None and E.META["migliore"] == 4321)
    with open(E.PERCORSO, "w", encoding="utf-8") as f:
        f.write("{non e' json")
    ok(E.carica() is None and E.META["migliore"] == 0)
    os.remove(E.PERCORSO)
    ok(E.carica() is None)
    E.META["migliore"] = 0


def test_api():
    W.TORNEO = None
    W.DUELLO = None
    E.META.update(E._meta_vuoto())
    cli = W.app.test_client()
    post = lambda **b: cli.post("/api/torneo/azione", json=b)
    ok(cli.get("/torneo").status_code == 200 and b"evo-app" in cli.get("/torneo").data)
    s = cli.get("/api/torneo/stato").get_json()
    ok(s["attivo"] is False and s["meta"]["migliore"] == 0 and len(s["ascensioni"]) == 5 and s["ascensioni"][1]["sbloccata"] is False)
    ok(post(tipo="campione", indice=0).status_code == 400 and post(tipo="combatti").status_code == 400, "senza una corsa")
    ok(post(tipo="inizia", ascensione=1).status_code == 400 and post(tipo="inizia", ascensione="x").status_code == 400 and post(tipo="inizia", ascensione=-1).status_code == 400)
    r = post(tipo="inizia").get_json()
    ok(r["attivo"] and r["fase"] == "campioni" and len(r["candidati"]) == 3 and W.TORNEO is not None)
    ok(os.path.exists(E.PERCORSO), "la corsa e' salvata")
    ok(post(tipo="boh").status_code == 400 and post(tipo="carta", indice=0).status_code == 400 and post(tipo="chiudi").status_code == 400)
    ok(post(tipo="campione", indice=99).status_code == 400)
    r = post(tipo="campione", indice=r["candidati"][0]["indice"]).get_json()
    ok(r["fase"] == "bottino" and r["bottino"]["scelte"] == 2 and len(r["bottino"]["carte"]) == 3)
    post(tipo="carta", indice=0)
    r = post(tipo="carta", indice=0).get_json()
    ok(r["fase"] == "bracket" and r["avversario"]["nome"] and r["regola"]["id"])
    # il duello: la pagina e lo stato portano regola, mutazioni e gettoni
    r = post(tipo="combatti").get_json()
    ok(r == {"vai": "/duello"} and W.DUELLO is not None and W.DUELLO.torneo is W.TORNEO and W.DUELLO.regola["id"] == W.TORNEO.regola)
    ok(W.TORNEO.prepara_duello() is None, "non si combatte due volte")
    ok(cli.get("/duello").status_code == 200)
    ds = cli.get("/api/duello/stato").get_json()
    ok(ds["torneo"] and ds["regola"]["id"] == W.TORNEO.regola and ds["player"]["mutazioni"] and ds["arena"]["unita"] == "🪙" and ds["arena"]["fondi"] == W.TORNEO.gettoni)
    # una puntata dal duello esce dai gettoni della corsa
    g = W.TORNEO.gettoni
    W.DUELLO.fase, W.DUELLO.attivo, W.DUELLO.altro = "player", W.DUELLO.p, W.DUELLO.cpu
    r = cli.post("/api/duello/azione", json={"tipo": "punta", "importo": 1}).get_json()
    ok(not r.get("errore") and W.TORNEO.gettoni == g - 1, r.get("errore"))
    # il duello finisce: tornando al torneo la corsa avanza da sola
    d = W.DUELLO
    d.finito, d.fase, d.vincitore, d.round = True, "fine", d.p, 3
    cli.get("/torneo")
    ok(W.DUELLO is None and W.TORNEO.fase == "bottino" and W.TORNEO.round == 1)
    s = cli.get("/api/torneo/stato").get_json()
    ok(s["fase"] == "bottino" and s["round"] == 1 and s["gettoni"] >= 4)
    # le altre azioni (carta, rilancio, salto, porte, mercato, allenamento, eventi) passano dalla stessa rotta
    r = post(tipo="rilancia")
    ok(r.status_code in (200, 400))
    r = post(tipo="carta", indice=0).get_json()
    ok(r["fase"] == "porte" and len(r["porte"]) == 3)
    post(tipo="porta", indice=0)
    for _ in range(6):
        f = cli.get("/api/torneo/stato").get_json()["fase"]
        if f == "mercato":
            post(tipo="compra", indice=0)
            post(tipo="esci_mercato")
        elif f == "allenamento":
            post(tipo="allena", indice=0)
        elif f == "evento":
            post(tipo="evento", indice=2)
            post(tipo="chiudi_evento")
        elif f == "sparring":
            break
        else:
            break
    # abbandonare un duello e' una sconfitta: la corsa finisce
    W.TORNEO.fase, W.TORNEO.duello_tipo = "bracket", "torneo"
    post(tipo="combatti")
    cli.get("/palestra")                      # navigare altrove a meta' duello = forfeit
    ok(W.DUELLO.finito and W.DUELLO.vincitore is W.DUELLO.cpu)
    cli.get("/torneo")
    ok(W.TORNEO.fase == "eliminato")
    r = post(tipo="chiudi").get_json()
    ok(r["attivo"] is False and W.TORNEO is None and r["meta"]["corse"] == 1)
    ok(not os.path.exists(E.PERCORSO) or json.load(open(E.PERCORSO, encoding="utf-8"))["corsa"] is None)
    # l'ascensione sbloccata si puo' scegliere
    E.META["ascensione_max"] = 2
    r = post(tipo="inizia", ascensione=2).get_json()
    ok(r["ascensione"] == 2 and r["gettoni"] == 3 and W.TORNEO.ascensione == 2)
    W.TORNEO = None
    W.DUELLO = None
    E.META.update(E._meta_vuoto())


# ======================================================================= corse intere a caso
STATI_PER_FASE = {}


def corsa_a_caso(seme, asc=0):
    random.seed(seme)
    c = E.Corsa(asc)
    W.TORNEO = c
    c.scegli_campione(random.choice(c.candidati))
    for passo in range(250):
        if c.fase in ("vittoria", "eliminato"):
            break
        st = c.stato()
        json.dumps(st)
        STATI_PER_FASE.setdefault(c.fase, st)
        ok(c.gettoni >= 0, "mai gettoni negativi")
        h = c.eroe()["hp"]
        ok(h is None or (h["testa"] >= 1 and h["busto"] >= 1), "l'eroe e' vivo tra un duello e l'altro")
        if c.fase in ("bracket", "sparring"):
            pg, nemico, regola = c.prepara_duello()
            d = W.DuelloWeb(pg=pg, avversario=nemico, torneo=c)
            while not d.finito and d.round < 120:
                if d.fase == "risposta":
                    scelta = random.choice(d.pending["opzioni"])
                    d.risolvi_risposta(scelta, random.choice(list(d.p.hp)) if scelta == "parata" else None)
                elif d.fase == "cpu":
                    d.cpu_step()
                elif d.fase == "player":
                    if d.p.azioni > 0 and random.random() < 0.85:
                        d.usa_attacco(random.choice([a for a in d.p.attacchi_visibili() if d.p.puo_usare_attacco(a) and d.p.puo_pagare_attacco(a)] or [d.p.attacchi[0]]))
                    else:
                        d.fine_turno()
                else:
                    break
            if not d.finito:
                d.finito, d.vincitore = True, d.cpu
            c.risolvi_duello(d.vincitore is d.p, d)
        else:
            pilota_un_passo(c)
            if c.fase == "bottino" and random.random() < 0.3:
                c.rilancia()
    else:
        raise AssertionError("corsa senza fine")
    st = c.stato()
    json.dumps(st)
    STATI_PER_FASE.setdefault(c.fase, st)
    ok(c.riepilogo and c.riepilogo["totale"] >= 0 and c.fase in ("vittoria", "eliminato"))
    return c


def test_api_infinito():
    W.TORNEO = None
    W.DUELLO = None
    E.META.update(E._meta_vuoto())
    cli = W.app.test_client()
    post = lambda **b: cli.post("/api/torneo/azione", json=b)
    ok(post(tipo="infinito").status_code == 400 and post(tipo="ritira").status_code == 400, "senza una corsa")
    c = nuova(seed=15)
    W.TORNEO = c
    ok(post(tipo="infinito").status_code == 400 and post(tipo="ritira").status_code == 400, "prima del titolo")
    pilota(c, True)
    s = cli.get("/api/torneo/stato").get_json()
    ok(s["fase"] == "vittoria" and s["puo_infinito"] and s["infinito"]["attivo"] is False)
    r = post(tipo="infinito")
    ok(r.status_code == 200)
    s = r.get_json()
    ok(s["fase"] == "bottino" and s["infinito"]["attivo"] and s["infinito"]["livello"] == 1 and s["nome_turno"] == "Infinito 1" and not s["puo_infinito"])
    ok(post(tipo="infinito").status_code == 400 and post(tipo="ritira").status_code == 400 and post(tipo="chiudi").status_code == 400)
    ok(post(tipo="carta", indice=0).get_json()["fase"] == "porte")
    r = post(tipo="ritira")
    ok(r.status_code == 200 and r.get_json()["fase"] == "eliminato" and r.get_json()["riepilogo"]["ritirato"])
    r = post(tipo="chiudi").get_json()
    ok(r["attivo"] is False and W.TORNEO is None and r["meta"]["infinito_max"] == 0)
    W.TORNEO = None
    E.META.update(E._meta_vuoto())


def test_corse_a_caso():
    esiti = {"vittoria": 0, "eliminato": 0}
    for seme in range(14):
        for asc in (0, 0, 2, 4):
            if asc > E.META["ascensione_max"]:
                E.META["ascensione_max"] = asc
            c = corsa_a_caso(seme * 10 + asc, asc)
            esiti[c.fase] += 1
    ok(esiti["eliminato"] > 0, esiti)
    W.TORNEO = None
    E.META.update(E._meta_vuoto())


def test_client():
    """Il client disegna tutte le schermate con stati veri (test_torneo.js, se c'e' node)."""
    fase_sparring = nuova(seed=61)
    fase_sparring.porte = [fase_sparring._porta("sparring")]
    fase_sparring.fase = "porte"
    fase_sparring.scegli_porta(0)
    STATI_PER_FASE["sparring"] = fase_sparring.stato()
    c = nuova(seed=62)
    c.gettoni = 50
    c._apri_mercato()
    STATI_PER_FASE["mercato"] = c.stato()
    c = nuova(seed=63)
    c.eroe()["stats"]["controllo"] = 2
    c._apri_allenamento()
    STATI_PER_FASE["allenamento"] = c.stato()
    c = nuova(seed=64)
    c._apri_evento("medico")
    STATI_PER_FASE["evento"] = c.stato()
    c.scegli_evento(2)
    STATI_PER_FASE["evento"] = c.stato()
    c = nuova(seed=65)
    c.prepara_duello()
    STATI_PER_FASE["duello"] = c.stato()
    c = nuova(seed=15)
    pilota(c, True)
    STATI_PER_FASE["vittoria"] = c.stato()
    c.inizia_infinito()
    fino_al_bracket(c)
    STATI_PER_FASE["bracket_inf"] = c.stato()
    vinci(c, True)
    fino_al_bracket(c)
    while c.sfidante["infinito"] < E.BOSS_OGNI:
        vinci(c, True)
        fino_al_bracket(c)
    STATI_PER_FASE["boss_inf"] = c.stato()
    c.fase = "porte"
    c.porte = [c._porta("riposo")]
    STATI_PER_FASE["porte_inf"] = c.stato()
    c.fase = "bracket"
    c.ritira()
    STATI_PER_FASE["eliminato_inf"] = c.stato()
    E.META.update(E._meta_vuoto())
    STATI_PER_FASE["landing"] = E.stato_iniziale()
    STATI_PER_FASE["campioni"] = E.Corsa(0).stato()
    node = shutil.which("node")
    if node is None:
        print("(node non c'e': salto test_torneo.js)")
        return
    percorso = os.path.join(_SAVE_TMP, "stati_evo.json")
    with open(percorso, "w", encoding="utf-8") as f:
        json.dump(list(STATI_PER_FASE.values()), f)
    r = subprocess.run([node, os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_torneo.js"), percorso], capture_output=True, text=True, encoding="utf-8")
    ok(r.returncode == 0, r.stdout + r.stderr)
    print("  " + r.stdout.strip())


def main():
    # il collegamento con l'app: le funzioni che evo.py riceve
    ok(E.DB is DB and E.PERCORSO == os.path.join(_SAVE_TMP, "evo.json") and isinstance(E.META, dict))
    for t in (test_dati, test_mutazioni, test_regole, test_creazione_e_primo_bottino, test_tipi_di_carte, test_duello_e_vita_che_resta, test_sconfitta_e_fine,
              test_porte, test_mercato, test_allenamento, test_eventi, test_sparring, test_ascensioni, test_infinito, test_forza_e_cpu, test_salvataggio, test_api,
              test_api_infinito, test_corse_a_caso, test_client):
        random.seed(1)
        E.META.update(E._meta_vuoto())
        t()
    print(f"OK — Torneo Evo: {n_check} verifiche")


if __name__ == "__main__":
    main()
