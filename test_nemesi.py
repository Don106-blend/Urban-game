"""Check del Nemesis system (rivali persistenti, memoria, rivincita, taglia), dei soprannomi e dell'umanita' recuperata:
python test_nemesi.py   (la logica pura sta in nemesi.py; qui si prova anche attraverso app.py, il duello e le rotte)"""
import atexit
import json
import math
import os
import random
import shutil
import tempfile

_SAVE_TMP = tempfile.mkdtemp(prefix="urban_test_nem_")
os.environ["URBAN_SAVE_DIR"] = _SAVE_TMP
atexit.register(shutil.rmtree, _SAVE_TMP, ignore_errors=True)

import app as W  # noqa: E402
import aspetto as A  # noqa: E402
import engine as E  # noqa: E402
import nemesi as N  # noqa: E402

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


def duella(rec, forza_ritorno=None):
    """Un duello intero dell'allievo con la CPU che guida i due lati, chiuso come in gioco. Ritorna il DuelloWeb."""
    for l in E.LOCAZIONI:
        rec["hp"][l] = E.LOCAZIONI[l]
    rec["crippled"], rec["morto"], rec["fiducia"] = [], False, 60
    S["giorno"] += 1
    rec["ultimo_duello"] = -9
    d = W.DuelloWeb(rec)
    W.DUELLO = d
    passi = 0
    while not d.finito and d.round < 120 and passi < 4000:
        passi += 1
        if d.fase == "risposta":
            s, loc = d.scegli_difesa(d.p, d.pending)
            d.risolvi_risposta(s, loc)
        else:
            d.cpu_step()
    if not d.finito:
        d.finito, d.fase, d.vincitore = True, "fine", d.cpu
    W.chiudi_duello()
    W.DUELLO = None
    return d


def main():
    # ============================================================ nomi e soprannomi
    ok(len(E.NOMI_PROPRI) >= 160 and len(E.COGNOMI) >= 130 and len(set(E.NOMI_PROPRI)) == len(E.NOMI_PROPRI)
       and len(set(E.COGNOMI)) == len(E.COGNOMI), "il pool dei nomi e' ampio e senza doppioni")
    ok(A.sesso_da_nome("Elena Rossi") == "F" and A.sesso_da_nome("Aldo Rossi") == "M" and A.sesso_da_nome("Luna Kade") == "F",
       "i nuovi nomi femminili sono riconosciuti")
    ok(A.NOMI_FEMMINILI <= set(E.NOMI_PROPRI), "ogni nome femminile e' nel pool")
    usati = set()
    for _ in range(300):
        usati.add(E.nome_casuale(usati))
    ok(len(usati) == 300, "300 nomi diversi")

    sopr = json.load(open(os.path.join(N.BASE, "data", "soprannomi.json"), encoding="utf-8"))
    ok(set(sopr["poteri"]) == {str(p["id"]) for p in DB["poteri"]}, "un pool di soprannomi per ogni potere")
    ok(all(len(v) >= 12 and len(set(v)) == len(v) for v in sopr["poteri"].values()) and len(sopr["generico"]) >= 20, "ampio")
    rec = {"nome": "Elena Rossi", "livello": 1, "poteri": [{"id": 11, "rango": 1}]}
    ok(N.nome_completo(rec) == "Elena Rossi" and not N.puo_avere_soprannome(rec))
    ok(N.imposta_soprannome(rec, "Falco") == f"serve il livello {N.SOPRANNOME_LIVELLO}", "il soprannome si sblocca livellando")
    rec["livello"] = 3
    ok(set(N.soprannomi_disponibili(rec)) == set(sopr["poteri"]["11"]), "il pool e' quello dei suoi poteri")
    ok(N.imposta_soprannome(rec, "Pugno di Ferro") == "soprannome non disponibile per i suoi poteri", "non quello di un altro potere")
    ok(N.imposta_soprannome(rec, "Falco") is None and N.nome_completo(rec) == "Elena «Falco» Rossi")
    rec["poteri"].append({"id": 2, "rango": 1})
    ok(N.imposta_soprannome(rec, "Pugno di Ferro") is None and rec["soprannome"] == "Pugno di Ferro", "si cambia quando si vuole")
    ok(N.imposta_soprannome(rec, "") is None and rec["soprannome"] is None and N.nome_completo(rec) == "Elena Rossi", "o lo si toglie")
    senza = {"livello": 5, "poteri": []}
    ok(N.assegna_soprannome(senza) in sopr["generico"], "senza poteri il pool generico")
    ok(N.assegna_soprannome(senza) is None, "una volta sola")
    nuovo = {"livello": 2, "poteri": [{"id": 5, "rango": 1}]}
    ok(N.assegna_soprannome(nuovo) is None)
    nuovo["livello"] = 3
    ok(N.assegna_soprannome(nuovo) in sopr["poteri"]["5"])

    # ============================================================ la memoria
    riv = {"id": 1, "livello": 3, "rapporti": {}, "incontri": 0}
    ok(not N.conosciuti(riv, 7) and N.chi_cerca_rivincita(riv, 7) is None and N.segno_rivincita(riv, 7) == 0 and N.taglia(riv) == 0)
    ok(N.etichetta(riv, 7)["stato"] == "nuovo")
    N.registra(riv, 7, False, 10)                          # l'allievo 7 perde
    ok(N.etichetta(riv, 7, 12)["stato"] == "ti_ha_battuto" and N.chi_cerca_rivincita(riv, 7) == "a" and N.segno_rivincita(riv, 7) == 1)
    ok("2 giorni fa" in N.etichetta(riv, 7, 12)["testo"] and "0–1" in N.etichetta(riv, 7, 12)["testo"])
    N.registra(riv, 7, False, 11)
    ok(N.etichetta(riv, 7, 11)["stato"] == "nemico" and N.taglia(riv) == 2 * N.TAGLIA_PER_SCONFITTA, "il nemico che ti ha battuto due volte")
    N.registra(riv, 7, True, 12)                           # stavolta vince l'allievo
    ok(N.etichetta(riv, 7, 12)["stato"] == "battuto" and N.chi_cerca_rivincita(riv, 7) == "r" and N.segno_rivincita(riv, 7) == -1)
    N.registra(riv, 7, True, 13)
    ok(N.etichetta(riv, 7, 13)["stato"] == "domato")
    ok(N.rapporto(riv, 7)["vinte"] == 2 and N.rapporto(riv, 7)["perse"] == 2 and riv["incontri"] == 4 and riv["vittorie"] == 2 and riv["sconfitte"] == 2)
    ok(N.etichetta(riv, 8)["stato"] == "nuovo" and "già combattuto 4 volte con altri" in N.etichetta(riv, 8)["testo"], "per un altro allievo e' nuovo, ma ha un passato")
    for i in range(10):
        N.registra(riv, 100 + i, False, 1)
    ok(N.taglia(riv) == N.TAGLIA_MAX, "la taglia ha un tetto")
    # la scelta
    class Rng:
        def __init__(self, r): self.r = r
        def random(self): return self.r
        def choices(self, c, pesi): return [max(zip(c, pesi), key=lambda t: t[1])[0]]
    rivali = [{"id": 1, "livello": 3, "rapporti": {}}, {"id": 2, "livello": 4, "rapporti": {"7": {"vinte": 1, "perse": 0, "ultimo": "a", "giorno": 1}}},
              {"id": 3, "livello": 9, "rapporti": {}}]
    ok(N.scegli(rivali, 7, 3, rng=Rng(0.99)) is None, "con probabilita' 40% ne arriva uno nuovo")
    ok(N.scegli(rivali, 7, 3, rng=Rng(0.0))["id"] == 2, "pesa di piu' chi ha un conto in sospeso")
    ok(N.scegli(rivali, 7, 20, rng=Rng(0.0)) is None, "nessuno e' adatto: ne arriva uno nuovo")
    ok(N.scegli(rivali, 7, 3, rng=Rng(0.0), ultimo_id=2)["id"] == 1, "ma non ripete quello appena affrontato se c'e' un'alternativa quasi pari")
    ok(all(r["id"] != 3 for r in N.adatti(rivali, 7, 3)), "un rivale troppo lontano per livello non si presenta")
    molti = [{"id": i, "livello": 1, "incontri": i} for i in range(20)]
    tolti = N.pota(molti, protetti={0})
    ok(len(molti) == N.MAX_RIVALI and len(tolti) == 20 - N.MAX_RIVALI and any(r["id"] == 0 for r in molti), "il mondo e' piccolo; il protetto resta")

    # ============================================================ il primo incontro crea un rivale, poi tornano
    partita()
    a = allievo(nome="Maya Test", livello=3, xp=0)
    ok(S["rivali"] == [] and S["prossimo_rivale"] == 1)
    random.seed(4)
    d = duella(a)
    ok(len(S["rivali"]) == 1 and d.rivale is S["rivali"][0], "la prima volta nasce un rivale e resta nel mondo")
    r0 = S["rivali"][0]
    ok(r0["id"] == 1 and r0["nome"] not in {c["nome"] for c in S["personaggi"]} and r0["nome"] != a["nome"], "con un nome suo")
    ok(r0["incontri"] == 1 and N.rapporto(r0, a["id"])["vinte"] + N.rapporto(r0, a["id"])["perse"] == 1, "ricorda l'incontro")
    ok((r0["soprannome"] is not None) == (r0["livello"] >= N.SOPRANNOME_LIVELLO), "il soprannome c'e' dal livello 3")
    ok(r0["soprannome"] is None or r0["soprannome"] in N.soprannomi_disponibili(r0), "e viene dai suoi poteri")
    ok(d.cpu.nome == N.nome_completo(r0) and d.cpu.aspetto == r0["aspetto"], "stesso volto e stesso nome ogni volta")
    json.dumps(S)
    # tornano: costringo il ritorno e lo stesso rivale si ripresenta, piu' forte
    liv0, xp0 = r0["livello"], r0["xp"]
    orig = random.random
    random.random = lambda: 0.0
    try:
        for l in E.LOCAZIONI:
            a["hp"][l] = E.LOCAZIONI[l]
        d2 = W.DuelloWeb(a)
    finally:
        random.random = orig
    ok(d2.rivale is r0 and len(S["rivali"]) == 1, "con un rivale adatto in giro e' lui a tornare")
    info = d2.info_rivale()
    ok(info["stato"] != "nuovo" and info["incontri"] == 1 and info["rivincita"] in ("a", "r"), info)
    ok(any("Rivale:" in r["t"] for r in d2.log), "il log avverte")
    json.dumps(d2.stato())
    ok(d2.stato()["rivale"]["testo"] == info["testo"])
    # la rivincita: a chi ha perso l'ultima volta
    for chi_p in (True, False):
        r0["rapporti"][str(a["id"])] = {"vinte": 0 if chi_p else 2, "perse": 1 if chi_p else 0, "ultimo": "r" if chi_p else "a", "giorno": 1}
        r0["rapporti"][str(a["id"])]["vinte"] = 0 if chi_p else 1
        r0["vittorie"] = 3
        random.random = lambda: 0.0
        try:
            d3 = W.DuelloWeb(a)
        finally:
            random.random = orig
        seeker = d3.p if chi_p else d3.cpu
        altro = d3.cpu if chi_p else d3.p
        ok([e["def"]["nome"] for e in seeker.effetti_attivi] == ["Rivincita"] and not altro.effetti_attivi, "+1 a chi ha perso l'ultima volta")
        ok(abs(d3.tavolo.tifo) == N.TIFO_RIVINCITA and (d3.tavolo.tifo > 0) == chi_p, "la folla la vuole")
        eff = seeker.effetti_attivi[0]
        ok(eff["turni"] == (3 if seeker is d3.ordine[0] else 4), "tre turni di gioco per tutti e due")
        base = 1 / (1 + math.exp(-W.K_VALUTA * (E.valuta(d3.p) - E.valuta(d3.cpu))))
        p0 = d3.prob_vittoria()
        ok((p0 > base + 0.02) if chi_p else (p0 < base - 0.02), ("la quota lo sa", p0, base))
        d3.round = N.TURNI_RIVINCITA + 2
        ok(abs(d3.prob_vittoria() - base) < 1e-9, "dopo i primi turni non conta piu'")

    # la taglia: il rivale che ha battuto i tuoi allievi vale di piu' alla vittoria
    r0["rapporti"] = {"99": {"vinte": 0, "perse": 2, "ultimo": "r", "giorno": 1}}
    random.random = lambda: 0.0
    try:
        d4 = W.DuelloWeb(a)
    finally:
        random.random = orig
    ok(d4.posta["paga"] == W.RICOMPENSA_VITTORIA + 2 * N.TAGLIA_PER_SCONFITTA and d4.stato()["ricompensa"] == d4.posta["paga"], "taglia sul rivale")
    ok(d4.info_rivale()["taglia"] == 2 * N.TAGLIA_PER_SCONFITTA and any("Taglia" in r["t"] for r in d4.log))

    # ============================================================ cosa lascia un incontro
    partita()
    a = allievo(nome="Giada Test", livello=3)
    riv = W._nuovo_rivale(a, W.record_to_pg(a))
    riv["livello"] = a["livello"]
    S["rivali"].append(riv)
    N.registra(riv, a["id"], False, 0)                    # una vecchia sconfitta: l'allievo vuole la rivincita
    a["fiducia"], a["stress"] = 50, 50
    d = W.DuelloWeb(a)
    d.rivale = riv
    d.finito, d.fase, d.vincitore = True, "fine", d.p
    W.DUELLO = d
    xp0, liv0, inc0 = riv["xp"], riv["livello"], riv["incontri"]
    W.chiudi_duello()
    W.DUELLO = None
    r = N.rapporto(riv, a["id"])
    ok(r["vinte"] == 1 and r["perse"] == 1 and r["ultimo"] == "a" and riv["incontri"] == inc0 + 1, "il rivale ricorda")
    ok(a["fiducia"] >= 50 + N.FIDUCIA_VENDETTA - 2 and a["ultimo_rivale"] == riv["id"], "la vendetta compiuta lascia il segno")
    ok(any("Vendetta" in x["t"] for x in d.log))
    ok(riv["xp"] != xp0 or riv["livello"] > liv0, "e cresce (piano)")
    # un rivale che vince assapora la vittoria: piu' XP che a perdere
    base = {"id": 5, "nome": "Tizio Caio", "stats": {s: 1 for s in E.STATS}, "skills": {s: 1 for s in E.SKILLS}, "poteri": [{"id": 1, "rango": 1}],
            "livello": 1, "xp": 0, "token": 0, "hp": dict(E.LOCAZIONI), "crippled": [], "armi": [], "armatura_equip": None, "protesi": [], "augments": []}
    v, p = dict(base, poteri=list(base["poteri"])), dict(base, poteri=list(base["poteri"]))
    W.cresce_rivale(v, False)
    W.cresce_rivale(p, True)
    ok(v["xp"] == int(300 * N.TOKEN_VITTORIA) and p["xp"] == 100, (v["xp"], p["xp"]))
    ric = dict(base, poteri=list(base["poteri"]), xp=999)
    righe = W.cresce_rivale(ric, False)
    ok(ric["livello"] == 2 and ric["token"] == 0 and any("sale di livello" in x for x in righe), "sale di livello e spende i Token come un allievo")
    ok(sum(ric["stats"].values()) + sum(ric["skills"].values()) > sum(base["stats"].values()) + sum(base["skills"].values()) or any(
        s["rango"] > 1 for s in ric["poteri"]), "...in statistiche o poteri")

    # ============================================================ crescita lenta nel tempo, matchmaking armonioso
    partita()
    random.seed(12)
    a = allievo(nome="Lena Test", livello=1)
    gap_ritorni, ritorni = [], 0
    for k in range(60):
        liv_a = a["livello"]
        d = duella(a)
        if d.rivale["incontri"] > 1:             # incontri dopo il suo registro: e' un volto gia' visto
            ritorni += 1
            gap_ritorni.append(d.rivale["livello"] - liv_a)
        a["morto"] = False
    ok(0 < len(S["rivali"]) <= N.MAX_RIVALI, f"il pool resta piccolo ({len(S['rivali'])})")
    ok(ritorni >= 20, ("dopo 60 duelli, molti sono volti gia' visti", ritorni))
    ok(all(abs(g) <= N.FASCIA_LIVELLO + 1 for g in gap_ritorni), ("chi torna e' sempre nella fascia del matchmaking", gap_ritorni))
    ok(sum(r["incontri"] for r in S["rivali"]) >= 30, "i rivali ricordano gli incontri")
    ok(len({r["nome"] for r in S["rivali"]}) == len(S["rivali"]), "nomi diversi")
    ok(max(r["livello"] for r in S["rivali"]) > 1, "i rivali crescono")
    json.dumps(S)

    # ============================================================ le rotte: soprannome e colloquio
    partita()
    a = allievo(nome="Rita Test", livello=2, poteri=[{"id": 11, "rango": 1}])
    cli = W.app.test_client()
    cli.post(f"/personaggio/{a['id']}/soprannome", data={"soprannome": "Falco"})
    ok(not a.get("soprannome"), "sotto il livello 3 no")
    a["livello"] = 3
    cli.post(f"/personaggio/{a['id']}/soprannome", data={"soprannome": "Falco"})
    ok(a["soprannome"] == "Falco")
    cli.post(f"/personaggio/{a['id']}/soprannome", data={"soprannome": "Maciste"})
    ok(a["soprannome"] == "Falco", "uno di un altro potere no")
    html = cli.get(f"/personaggio/{a['id']}").get_data(as_text=True)
    ok("«Falco»" in html and "Aquila" in html, "la scheda mostra il nome con il soprannome e il pool")
    cli.post(f"/personaggio/{a['id']}/soprannome", data={"soprannome": ""})
    ok(a["soprannome"] is None)
    d = W.DuelloWeb(dict(a, soprannome="Falco"))
    ok("«Falco»" in d.p.nome, "il duello usa il nome con il soprannome")

    # ============================================================ il registro dei rivali
    partita()
    cli = W.app.test_client()
    html = cli.get("/rivali").get_data(as_text=True)
    ok("Nessun rivale ancora" in html, "pagina vuota prima del primo duello")
    a = allievo(nome="Sara Test", livello=3, poteri=[{"id": 11, "rango": 1}])
    riv = W._nuovo_rivale(a, W.record_to_pg(a))
    riv["nome"] = "Ugo Bianchi"
    S["rivali"].append(riv)
    ok("Mai affrontato dai tuoi allievi" in cli.get("/rivali").get_data(as_text=True))
    N.registra(riv, a["id"], False, 0)
    N.registra(riv, a["id"], False, 1)
    N.registra(riv, 77, False, 1)                 # un allievo che non c'e' piu': conta per la taglia
    html = cli.get("/rivali").get_data(as_text=True)
    ok("Ugo" in html and "Sara Test" in html and "La tua nemesi" in html and f"TAGLIA ¤ {3 * N.TAGLIA_PER_SCONFITTA}" in html, "bilancio e taglia")
    ok('href="/rivali"' in html, "il link e' nel menu")

    print(f"OK: {n_check} verifiche")


if __name__ == "__main__":
    main()
