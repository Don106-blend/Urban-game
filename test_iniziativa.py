"""Check dell'iniziativa degli atleti sul ring (iniziativa.py, data/iniziative.json): python test_iniziativa.py
Ogni evento di ogni tratto viene forzato e verificato; poi duelli interi con e senza fiducia."""
import atexit
import os
import random
import shutil
import tempfile

_SAVE_TMP = tempfile.mkdtemp(prefix="urban_test_ini_")
os.environ["URBAN_SAVE_DIR"] = _SAVE_TMP
atexit.register(shutil.rmtree, _SAVE_TMP, ignore_errors=True)

import app as W  # noqa: E402
import iniziativa as I  # noqa: E402
import palestra as P  # noqa: E402
from engine import LOCAZIONI  # noqa: E402

DB, S = W.DB, W.STATO
n_check = 0


def ok(cond, msg=""):
    global n_check
    n_check += 1
    assert cond, msg


def partita():
    S.clear()
    S.update(W.stato_default())
    W.DUELLO = None


def allievo(**ov):
    rec = W.nuovo_aspirante({c["nome"] for c in S["personaggi"]}, [c.get("aspetto") for c in S["personaggi"]])
    rec.pop("costo", None)
    rec["id"] = S["prossimo_id"]
    S["prossimo_id"] += 1
    rec["tratti_noti"] = 2
    rec.update(ov)
    S["personaggi"].append(rec)
    return rec


_rnd = random


class Sempre:
    """Un `random` che fa scattare sempre l'iniziativa (random() = 0) ma sceglie davvero tra gli eventi."""
    random = staticmethod(lambda: 0.0)
    choices = staticmethod(_rnd.choices)
    choice = staticmethod(_rnd.choice)


def main():
    # ---------------------------------------------------------------- i dati
    stance_base = {s["nome"] for s in DB["stances"] if s.get("attivo_default")}
    nomi_effetti = {e["nome"] for e in DB["effetti"]}
    ids = set()
    ok(set(I.EVENTI) == set(P.TRATTI), "ogni tratto ha le sue iniziative, e solo quelli")
    for tid, lista in I.EVENTI.items():
        ok(len(lista) >= 5, f"{tid}: almeno 5 eventi (ne ha {len(lista)})")
        ok(len({e["quando"] for e in lista}) >= 3, f"{tid}: eventi in momenti diversi del duello")
        for e in lista:
            ok(e["id"] not in ids, "id unico " + e["id"])
            ids.add(e["id"])
            ok(e["quando"] in I.QUANDO and e["nome"] and "{nome}" in e["testo"] and e["fa"], e["id"])
            ok(set(e.get("cond", {})) <= {"hp_sotto", "hp_sopra", "avv_hp_sotto", "round_min"}, e["id"])
            for op in e["fa"]:
                ok(op["tipo"] in I.OPERAZIONI, e["id"])
                if op["tipo"] == "effetto":
                    ok(op["nome"] in nomi_effetti and op["turni"] >= 1 and op.get("su", "se") in ("se", "avv"), e["id"])
                if op["tipo"] == "stance":
                    ok(op["nome"] in stance_base, e["id"] + ": una stance che tutti conoscono")
                if op["tipo"] == "attacco":
                    ok(op["scelta"] in ("pesante", "pugno", "migliore", "peggiore"), e["id"])
                if op["tipo"] == "risposta":
                    ok(op["scelta"] in ("parata", "schivata", "nessuna"), e["id"])
                if op["tipo"] in ("cura", "danno"):
                    ok(op["quanto"] > 0 and (op["loc"] in LOCAZIONI or op["loc"] in ("arto", "braccio", "gamba")), e["id"])
                if op["tipo"] in ("azioni", "stamina"):
                    ok(op["delta"] != 0, e["id"])
            # le operazioni di ogni evento hanno senso nel momento in cui scattano
            tipi = {op["tipo"] for op in e["fa"]}
            if e["quando"] == "attacco":
                ok(tipi <= {"mira", "senza_mira", "attacco", "salta", "azioni", "effetto", "stance"}, e["id"])
            if e["quando"] == "risposta":
                ok(tipi <= {"risposta", "effetto", "stamina"}, e["id"])
            if e["quando"] in ("colpito", "colpisce"):
                ok("azioni" not in tipi and "salta" not in tipi, e["id"] + ": le azioni non si toccano fuori dal proprio turno")

    # ---------------------------------------------------------------- la probabilita': fiducia alta e stress basso = meno iniziativa
    base = {"tratti": [], "fiducia": 50, "stress": 0}
    ok(I.probabilita({"tratti": [], "fiducia": 100, "stress": 0}) == 0, "la fiducia piena e nessuno stress: ti ascolta sempre")
    ok(0.10 < I.probabilita(base) < 0.20, "fiducia media, nessuno stress: ~15% a occasione")
    for f in range(0, 100, 10):
        ok(I.probabilita(dict(base, fiducia=f + 10)) < I.probabilita(dict(base, fiducia=f)), "piu' fiducia, meno iniziativa")
    for s in range(0, 100, 10):
        ok(I.probabilita(dict(base, stress=s + 10)) > I.probabilita(dict(base, stress=s)), "piu' stress, piu' iniziativa")
    ok(I.probabilita({"tratti": [], "fiducia": 0, "stress": 100}) == I.P_MAX, "al massimo dello scontento vale P_MAX")
    ok(I.probabilita(dict(base, tratti=["leale"])) < I.probabilita(base) < I.probabilita(dict(base, tratti=["cocciuto"])),
       "il carattere pesa: il Leale ascolta, il Cocciuto no")
    ok(I.probabilita({"tratti": ["cocciuto", "orgoglioso"], "fiducia": 0, "stress": 100}) <= I.P_TETTO, "c'e' un tetto")

    # ---------------------------------------------------------------- ogni evento, forzato
    partita()
    ora = random.Random(1)
    n_forzati = 0
    for tid, lista in I.EVENTI.items():
        for e in lista:
            rec = allievo(tratti=[tid], fiducia=100, stress=0)         # (a fiducia piena non scatta nulla da solo durante la costruzione)
            d = W.DuelloWeb(rec)
            rec["fiducia"], rec["stress"] = 0, 100
            ok(d.iniz.info()["p"] > 0 and d.iniz.info()["tratti"], "scontento: ha una probabilita' vera")
            forza(d, e, ora)
            n_forzati += 1
    ok(n_forzati == sum(len(v) for v in I.EVENTI.values()) >= 12 * 5, "forzati tutti gli eventi")

    # ---------------------------------------------------------------- duelli interi
    random.seed(11)
    for fid, stress, atteso in ((100, 0, False), (0, 100, True)):
        tot_iniz = 0
        for k in range(14):
            partita()
            rec = allievo(tratti=list(P.TRATTI)[k % 12::6][:2] or ["leale"], fiducia=fid, stress=stress)
            d = W.DuelloWeb(rec)
            W.DUELLO = d
            n_round = {}
            for _ in range(600):
                if d.finito:
                    break
                if d.fase == "cpu":
                    d.azione_player({"tipo": "cpu_step"})
                elif d.fase == "risposta":
                    ok(d.azione_player({"tipo": "risposta", "scelta": d.pending["opzioni"][-1], "loc": "busto"}) is None)
                elif d.fase == "player":
                    a = d.p
                    if a.puo_mirare() and a.azioni >= 2 and not a.mira:
                        ok(d.azione_player({"tipo": "mira", "loc": "testa"}) is None)
                    giocabili = a.attacchi_giocabili()
                    if giocabili and a.azioni > 0:
                        err = d.azione_player({"tipo": "attacco", "id": random.choice(giocabili)["id"]})
                        ok(err is None, err)
                    else:
                        ok(d.azione_player({"tipo": "fine_turno"}) is None)
            ok(d.finito, "il duello finisce, con o senza iniziative")
            ev = [x for x in d.eventi if x["tipo"] == "iniziativa"]
            tutte = [x for x in d.log if "⚡" in x["t"]]
            tot_iniz += len(tutte)
            for x in ev:
                n_round[x["round"]] = n_round.get(x["round"], 0) + 1
            ok(all(n == 1 for n in n_round.values()), "al massimo una iniziativa per round")
            ok(all(x["chi"] == "p" for x in ev) and all(x["chi"] == "p" for x in tutte), "sono sempre dell'atleta del giocatore")
        ok((tot_iniz > 0) == atteso, f"fiducia {fid} stress {stress}: iniziative {tot_iniz}")

    # il Torneo Evo e il duello senza palestra non hanno fiducia: niente iniziativa
    pg = W.eroe_livello(1)
    dt = W.DuelloWeb(pg=pg, avversario=W.eroe_livello(1))
    ok(dt.iniz is None and "iniziativa" not in dt.stato()["player"], "niente iniziativa fuori dalla palestra")
    partita()
    rec = allievo(tratti=["leale"], fiducia=40, stress=30)
    st = W.DuelloWeb(rec).stato()["player"]["iniziativa"]
    ok(st["p"] == round(I.probabilita(rec) * 100) and st["fiducia"] == 40 and st["stress"] == 30, "il pannello dice quanto ti da' retta")
    print(f"OK — tutti i check passati ({n_check})")


def forza(d, e, ora):
    """Porta il duello in una situazione in cui `e` e' fattibile, lo fa scattare e controlla cosa e' successo."""
    c = e.get("cond", {})
    a, v = d.p, d.cpu
    for loc in a.hp:
        a.hp[loc] = int(a.hp_max[loc] * (0.4 if "hp_sotto" in c else 0.7))
    for loc in v.hp:
        v.hp[loc] = int(v.hp_max[loc] * (0.3 if "avv_hp_sotto" in c else 1.0))
    d.round = max(c.get("round_min", 0), d.round, 2)
    d.attivo, d.altro, d.fase = a, v, "player"
    a.azioni, a.bonus, a.risposte = 3, 1, 1
    a.stamina = a.stamina_max() // 2
    a.mira = None
    a.stance_attive = [x for x in a.stance_attive if x["turni"] < 0]
    for stato in a.stance_stato.values():
        stato["cooldown"] = 0
    d.iniz.ultimo_round = 0
    d.iniz.eventi = [dict(e, tratto=e.get("tratto") or d.rec["tratti"][0])]
    prima = (a.azioni, a.stamina, sum(a.hp.values()), len(a.effetti_attivi), len(a.stance_attive), len(d.log), len(v.effetti_attivi))
    I.random, vecchio = Sempre, I.random
    try:
        op = e["fa"][0]
        pugno = next(x for x in a.attacchi if x["nome"] == "Pugno")
        pesante = next(x for x in a.attacchi if x["nome"] == "Colpo pesante")
        if e["quando"] == "turno":
            d.iniz.turno()
        elif e["quando"] == "attacco":
            if op["tipo"] == "senza_mira":
                a.mira = "testa"
            scelto = pesante if op["tipo"] == "attacco" and op["scelta"] == "pugno" else pugno
            att = d.iniz.attacco(scelto)
            if op["tipo"] == "salta":
                ok(att is None and a.azioni == 3 - 1, e["id"])
            elif op["tipo"] == "attacco":
                ok(att is not None and att["id"] != scelto["id"], e["id"])
                if op["scelta"] == "pugno":
                    ok(att["nome"] == "Pugno", e["id"])
                if op["scelta"] == "pesante":
                    ok(att["nome"] == "Colpo pesante", e["id"])
            elif op["tipo"] == "mira":
                ok(a.mira is not None and att["id"] == scelto["id"], e["id"])
                if op["loc"] in LOCAZIONI:
                    ok(a.mira == op["loc"], e["id"])
            elif op["tipo"] == "senza_mira":
                ok(a.mira is None and att["id"] == scelto["id"], e["id"])
        elif e["quando"] == "risposta":
            voluta = "nessuna risposta" if op["scelta"] == "nessuna" else op["scelta"]
            propria = "schivata" if voluta != "schivata" else "parata"
            scelta, loc = d.iniz.risposta(propria, None, ["nessuna risposta", "parata", "schivata"])
            ok(scelta == voluta and (loc in a.hp) == (voluta == "parata"), e["id"])
        elif e["quando"] == "colpito":
            d.iniz.dopo_colpo(v, a, True, 10)
        else:
            d.iniz.dopo_colpo(a, v, True, 10)
    finally:
        I.random = vecchio
    ok(d.iniz.ultimo_round == d.round, e["id"] + ": e' scattata")
    ok(any("⚡" in x["t"] for x in d.log[prima[5]:]), e["id"] + ": nel log")
    ev = d.eventi[-1]
    ok(ev["tipo"] == "iniziativa" and ev["chi"] == "p" and ev["titolo"] == e["nome"] and ev["desc"].startswith(a.nome.split(" ")[0]), e["id"])
    dopo = (a.azioni, a.stamina, sum(a.hp.values()), len(a.effetti_attivi), len(a.stance_attive), len(d.log), len(v.effetti_attivi))
    tipo = op["tipo"]
    if tipo == "azioni":
        ok(dopo[0] == prima[0] + op["delta"], e["id"])
    elif tipo == "stamina":
        ok(dopo[1] == max(0, min(a.stamina_max(), prima[1] + op["delta"])), e["id"])
    elif tipo == "cura":
        ok(dopo[2] > prima[2], e["id"])
    elif tipo == "danno":
        ok(dopo[2] < prima[2], e["id"])
    elif tipo == "effetto":
        ok(dopo[3] == prima[3] + 1 or dopo[6] == prima[6] + 1, e["id"])
    elif tipo == "stance":
        ok(dopo[4] == prima[4] + 1, e["id"])
    # chi scrive "al momento giusto": un'iniziativa fatta nel turno dell'avversario non finisce nelle righe dell'altro
    ok(all(x["chi"] == "p" for x in d.log[prima[5]:] if "⚡" in x["t"]), e["id"])
    # un colpo che segue porta le note nella sua scheda
    if e["quando"] in ("attacco", "risposta"):
        ok(d.iniz.preleva_note() == [e["testo"].format(nome=a.nome.split(" ")[0])] and d.iniz.preleva_note() == [], e["id"])


if __name__ == "__main__":
    main()
