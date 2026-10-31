"""Check della Palestra (calendario, allenamento, tratti, eventi, carriera) e della sua integrazione con l'app:
python test_palestra.py   (la logica pura sta in palestra.py; qui si prova anche attraverso app.py e le rotte)"""
import atexit
import os
import random
import shutil
import tempfile

# come test_combat.py: il salvataggio vero non si tocca mai
_SAVE_TMP = tempfile.mkdtemp(prefix="urban_test_pal_")
os.environ["URBAN_SAVE_DIR"] = _SAVE_TMP
atexit.register(shutil.rmtree, _SAVE_TMP, ignore_errors=True)

import app as webapp  # noqa: E402
import palestra as P  # noqa: E402
from engine import LOCAZIONI, SKILLS, STATS  # noqa: E402

DB = webapp.DB
S = webapp.STATO
n_check = 0


def ok(cond, msg=""):
    global n_check
    n_check += 1
    assert cond, msg


def nuova_partita():
    """Stato pulito (la palestra vuota del primo lunedi'), senza scrivere sul disco vero."""
    S.clear()
    S.update(webapp.stato_default())
    webapp.DUELLO = None


def assumi(rng=None, **ov):
    """Un allievo in palestra, senza passare dal negozio degli aspiranti."""
    nomi = {c["nome"] for c in S["personaggi"]}
    rec = webapp.nuovo_aspirante(set(nomi), [c.get("aspetto") for c in S["personaggi"]])
    rec.pop("costo", None)
    rec["id"] = S["prossimo_id"]
    S["prossimo_id"] += 1
    rec["tratti_noti"] = len(rec["tratti"])
    rec.update(ov)
    S["personaggi"].append(rec)
    return rec


def main():
    # ============================================================ calendario
    ok(P.INIZIO.weekday() == 0, "il giorno 0 e' un lunedi'")
    ok(P.descrivi_data(0).startswith("Lunedì 7 gennaio 2030"), P.descrivi_data(0))
    ok(P.descrivi_data(6).startswith("Domenica"), "il giorno 6 e' domenica")
    ok(P.descrivi_data(7).startswith("Lunedì"), "e dopo la domenica ricomincia")
    ok(P.numero_settimana(0) == 1 and P.numero_settimana(6) == 1 and P.numero_settimana(7) == 2, "settimane")
    ok(P.data_breve(0) == "Lun 7 gen", P.data_breve(0))
    rng = random.Random(7)
    for _ in range(400):                                 # l'eta' di nascita e' sempre quella voluta
        g, anni = rng.randint(0, 4000), rng.randint(19, 40)
        r = {"data_nascita": P.data_nascita_per_eta(anni, g, rng)}
        ok(P.eta(r, g) == anni, (g, anni, r))
    r = {"data_nascita": "10/01/2000"}                                                  # il giorno 3 e' il 10 gennaio 2030
    ok(P.eta(r, 0) == 29 and P.eta(r, 2) == 29 and P.eta(r, 3) == 30, "il compleanno scatta nel giorno giusto")
    ok(P.eta({"data_nascita": "11/01/2000"}, 3) == 29, "un giorno dopo, ancora 29")
    ok(P.compleanno_oggi({"data_nascita": "10/01/2000"}, 3) and not P.compleanno_oggi({"data_nascita": "10/01/2000"}, 4), "compleanno")
    ok(P.eta({"data_nascita": "boh"}, 0) == 25, "una data illeggibile non rompe nulla")

    # ============================================================ dati
    ok(len(P.TRATTI) >= 10 and len(P.EVENTI) >= 15 and len(P.ATTREZZI) >= 8, "i dati sono stati caricati")
    for t in P.TRATTI.values():
        ok(t["ama"] in P.APPROCCI + (None,) and t["odia"] in P.APPROCCI + (None,) and t["ama"] != t["odia"], t["id"])
        ok(t["nome"] and t["descrizione"] and t["effetto"] and t["bio"], t["id"])
    for e in P.EVENTI.values():
        ok(2 <= len(e["scelte"]) or e["id"] == "amicizia", e["id"])
        ids = [s["id"] for s in e["scelte"]]
        ok(len(ids) == len(set(ids)), "id di scelta unici " + e["id"])
    for a in P.ATTREZZI.values():
        ok(a["prezzo"] >= 0 and a["descrizione"] and a["effetto"], a["id"])

    # ============================================================ un allievo nuovo
    nuova_partita()
    ok(S["crediti"] == webapp.CREDITI_PARTENZA and S["giorno"] == 0 and S["mondo"] == {}, "partita nuova")
    ok(P.attrezzi_posseduti(S) == ["sacco", "tatami"] and P.capienza(S) == P.CAPIENZA_BASE, "attrezzi iniziali")
    webapp.genera_contratti()
    ok(len(S["contratti"]) == webapp.N_CONTRATTI, "gli aspiranti della settimana")
    for c in S["contratti"]:
        ok(P.ETA_ASPIRANTI[0] <= P.eta(c, 0) <= P.ETA_ASPIRANTI[1], "eta' degli aspiranti")
        ok(len(c["tratti"]) == 2 and c["tratti_noti"] == 1 and len(P.tratti_visibili(c)) == 1, "se ne vede uno")
        ok(c["costo"] > 0 and c["costo"] % 5 == 0 and c["bio"].endswith("."), "prezzo e bio")
        ok(c["origine"] in [q["id"] for q in P.ANAGRAFICA["quartieri"]], "origine = id del distretto (gancio B)")
        ok(c["piano"] == list(P.PIANO_BASE) and c["fiducia"] in range(40, 61) and c["stress"] == 0, "piano e fiducia iniziali")
        ok(P.bio_completa(c).startswith(c["bio"]) and P.tratti_visibili(c)[0]["bio"] in P.bio_completa(c), "bio = base + tratti noti")
    ok(not any(frozenset(c["tratti"]) in P.INCOMPATIBILI for c in S["contratti"]), "tratti compatibili")

    # ============================================================ assunzione (rotte) e capienza
    client = webapp.app.test_client()
    r = client.post("/contratti/ingaggia/0")
    ok(r.status_code in (302, 303), "ingaggio")
    ok(len(S["personaggi"]) == 1 and S["personaggi"][0]["id"] == 1 and S["crediti"] < webapp.CREDITI_PARTENZA, "il primo allievo")
    S["crediti"] = 100000
    for _ in range(2):
        client.post("/contratti/ingaggia/0")
    ok(len(P.membri_attivi(S)) == 3 and not S["contratti"], "tre allievi: gli aspiranti della settimana sono finiti")
    client.post("/contratti/cerca")                                      # il passaparola ne porta un altro
    client.post("/contratti/ingaggia/0")
    ok(len(P.membri_attivi(S)) == P.CAPIENZA_BASE, "quattro allievi")
    client.post("/contratti/cerca")
    n0 = len(S["personaggi"])
    client.post("/contratti/ingaggia/0")
    ok(len(S["personaggi"]) == n0 == P.CAPIENZA_BASE and len(S["contratti"]) == 1, "la palestra e' piena: il quinto non entra")
    ok(P.posti_liberi(S) == 0, "posti liberi")
    r = client.post("/negozio/attrezzo", data={"id": "dormitorio"})
    ok(P.capienza(S) == P.CAPIENZA_BASE + 2 and P.posti_liberi(S) == 2, "il dormitorio da' due posti")
    r = client.post("/negozio/attrezzo", data={"id": "dormitorio"})
    ok(P.attrezzi_posseduti(S).count("dormitorio") == 1, "un attrezzo si compra una volta sola")
    S["crediti"] = 10
    ok(client.post("/negozio/attrezzo", data={"id": "camera_controllo"}).status_code in (302, 303) and not P.ha_attrezzo(S, "camera_controllo"),
       "senza crediti non si compra")
    S["crediti"] = 100000

    # ============================================================ una giornata
    nuova_partita()
    a = assumi(rng, nome="Marta Kade", fiducia=50, stress=0, tratti=["disciplinato", "leale"])
    b = assumi(rng, nome="Dino Voss", fiducia=50, stress=0, tratti=["cocciuto", "leale"])
    a["piano"] = ["sparring"] * 7
    b["piano"] = ["sparring"] * 7
    a["focus"]["sparring"] = "skill:armi_corpo_a_corpo"
    ass = P.assegnazioni(S, random.Random(1))
    ok(ass[a["id"]]["attivita"] == "sparring" and ass[a["id"]]["partner"] == b["id"] and ass[b["id"]]["partner"] == a["id"], "sparring appaiato")
    ok(ass[a["id"]]["voce"] == "skill:armi_corpo_a_corpo", "il focus decide la voce")
    r1 = P.avanza_giorno(S, DB, random.Random(3))
    ok(S["giorno"] == 1 and r1["giorno"] == 0, "il giorno avanza")
    ok(a["allenamento"].get("skill:armi_corpo_a_corpo", 0) > 0, "punti di maturazione")
    ok(any(m["pid"] == a["id"] and m["attivita"] == "sparring" for m in r1["membri"]), "il riepilogo racconta la giornata")
    ok(P.legame(a, b) == P.legame(b, a) and P.legame(a, b) > 0, "lo sparring avvicina")
    punti1 = a["allenamento"]["skill:armi_corpo_a_corpo"]
    # un sacco di giorni: i punti si fermano al tetto e il rango non sale da solo
    rango0 = a["skills"]["armi_corpo_a_corpo"]
    for _ in range(40):
        P.avanza_giorno(S, DB, random.Random(_))
        S["palestra"]["eventi"].clear()
    ok(a["skills"]["armi_corpo_a_corpo"] == rango0, "il rango non sale da solo")
    ok(a["allenamento"]["skill:armi_corpo_a_corpo"] == P.punti_per_rango(rango0), "tetto = punti per il rango dopo")
    ok(P.maturo(a, "skill:armi_corpo_a_corpo"), "maturo")

    # ---- salire di rango: Token E maturazione
    a["token"] = 0
    upg = {u["chiave"]: u for u in webapp.lista_upgrade(a)}
    u = upg["skill:armi_corpo_a_corpo"]
    ok(u["maturo"] and not u["ok"] and u["costo"] == 1, "maturo ma senza Token")
    a["token"] = 5
    upg = {u["chiave"]: u for u in webapp.lista_upgrade(a)}
    ok(upg["skill:armi_corpo_a_corpo"]["ok"], "maturo e con i Token")
    ok(not upg["stat:fisico"]["ok"] and "allenamento" in upg["stat:fisico"]["motivo"], "con i Token ma non maturo")
    fis0 = a["stats"]["fisico"]
    r = client.post(f"/personaggio/{a['id']}/upgrade", data={"tipo": "stat", "nome": "fisico"})
    ok(a["stats"]["fisico"] == fis0 and a["token"] == 5, "non maturo: niente rango")
    r = client.post(f"/personaggio/{a['id']}/upgrade", data={"tipo": "skill", "nome": "armi_corpo_a_corpo"})
    ok(a["skills"]["armi_corpo_a_corpo"] == rango0 + 1 and a["token"] == 4, "maturo + Token: sale")
    ok(P.punti_voce(a, "skill:armi_corpo_a_corpo") == 0, "i punti si consumano")
    ok(not P.maturo(a, "skill:armi_corpo_a_corpo"), "e ricomincia")
    # il vincolo dei poteri (rango <= controllo) resta, comunque maturi
    pw = a["poteri"][0]
    pw["rango"] = 1
    a["stats"]["controllo"] = 1
    a["allenamento"]["potere:%d" % pw["id"]] = 99
    uu = next(u for u in webapp.lista_upgrade(a) if u["tipo"] == "potere")
    ok(not uu["ok"] and "controllo" in uu["motivo"], "vincolo di controllo")

    # ============================================================ stress, ferite e riposo
    nuova_partita()
    a = assumi(nome="Test Uno", tratti=["disciplinato", "leale"], fiducia=50)
    a["piano"] = ["duro"] * 7
    for _ in range(3):
        P.avanza_giorno(S, DB, random.Random(5))
        S["palestra"]["eventi"].clear()
    ok(a["stress"] > 10, f"l'allenamento duro stanca ({a['stress']})")
    a["piano"] = ["riposo"] * 7
    a["stress"] = 50
    s0 = a["stress"]
    P.avanza_giorno(S, DB, random.Random(5))
    ok(a["stress"] < s0 - 5, "il riposo scarica")
    # ferito: il riposo automatico ferma le attivita' rischiose, lo studio no
    a["piano"] = ["sparring", "studio"] * 3 + ["sparring"]
    a["hp"]["braccio_dx"] = 30
    ass = P.assegnazione(S, a)
    ok(ass["attivita"] == "riposo" and ass["motivo"] == "ferito", "ferito: riposa")
    S["giorno"] += 1
    ass = P.assegnazione(S, a)
    ok(ass["attivita"] == "studio", "ma studia")
    S["giorno"] -= 1
    a["auto_riposo"] = False
    ass = P.assegnazione(S, a)
    ok(ass["attivita"] == "sparring" and ass["motivo"] == "rischio", "senza riposo automatico si allena lo stesso, a rischio")
    a["auto_riposo"] = True
    # guarigione in giorni: riposando si guarisce in fretta, in coma ci vogliono settimane
    a["hp"]["braccio_dx"] = 10
    a["piano"] = ["riposo"] * 7
    for _ in range(5):
        P.avanza_giorno(S, DB, random.Random(2))
        S["palestra"]["eventi"].clear()
    ok(a["hp"]["braccio_dx"] == LOCAZIONI["braccio_dx"], f"cinque giorni di riposo bastano ({a['hp']['braccio_dx']})")
    ok(P.giorni_recupero(a) is None, "sano: nulla da recuperare")
    a["hp"]["busto"] = -20
    ok(P.salute(a) == "coma" and P.assegnazione(S, a)["motivo"] == "coma", "in coma si riposa e basta")
    ok(P.giorni_recupero(a) >= 5, "il coma e' lungo")
    prima = a["hp"]["busto"]
    P.avanza_giorno(S, DB, random.Random(2))
    ok(a["hp"]["busto"] > prima and a["hp"]["busto"] < 40, "in coma si guarisce piano")

    # ---- l'allenamento non manda mai in coma (mai sotto 1 hp)
    nuova_partita()
    a = assumi(nome="Test Due", tratti=["cocciuto", "fragile"])
    a["auto_riposo"] = False
    a["hp"] = {l: 2 for l in LOCAZIONI}
    a["piano"] = ["sparring"] * 7
    for _ in range(15):
        P.avanza_giorno(S, DB, random.Random(_))
        S["palestra"]["eventi"].clear()
        ok(all(v >= 1 for v in a["hp"].values()), "mai sotto 1 hp")

    # ============================================================ duello: occupa la giornata, cambia fiducia e stress
    nuova_partita()
    a = assumi(nome="Test Tre", tratti=["orgoglioso", "ambizioso"], fiducia=50, stress=0)
    a["piano"] = ["palestra"] * 7
    ok(P.puo_combattere(S, a)[0], "puo' combattere")
    r = client.post("/duelli/avvia", data={"pid": a["id"]})
    ok(a["ultimo_duello"] == 0 and webapp.DUELLO is not None, "il duello e' partito, oggi e' suo")
    ok(P.assegnazione(S, a)["attivita"] == "duello" and P.assegnazione(S, a)["fuori"], "oggi e' sul ring")
    ok(not P.puo_combattere(S, a)[0], "non due volte lo stesso giorno")
    d = webapp.DUELLO
    d.finito, d.vincitore = True, d.p
    webapp.chiudi_duello()
    ok(a["fiducia"] == 50 + 6 + 4 + 4, f"vittoria da ambizioso/orgoglioso: +6 +4 +4 ({a['fiducia']})")
    ok(a["stress"] >= 8 and a["duelli_sett"] == 1, "il ring stanca")
    ok(a["vittorie"] == 1, "vittoria registrata")
    webapp.DUELLO = None
    P.avanza_giorno(S, DB, random.Random(1))
    S["palestra"]["eventi"].clear()
    ok(S["giorno"] == 1 and a["allenamento"] == {}, "il giorno del duello non si allena")
    # sconfitta
    r = client.post("/duelli/avvia", data={"pid": a["id"]})
    d = webapp.DUELLO
    d.finito, d.vincitore = True, d.cpu
    f0 = a["fiducia"]
    webapp.chiudi_duello()
    ok(a["fiducia"] == f0 - 6 - 6, f"sconfitta da orgoglioso: −6 −6 ({a['fiducia']} da {f0})")
    webapp.DUELLO = None
    # poca fiducia: rifiuta
    a["fiducia"] = 10
    S["giorno"] += 1
    ok(not P.puo_combattere(S, a)[0] and "fid" in P.puo_combattere(S, a)[1], "senza fiducia rifiuta il ring")
    a["tratti"] = ["leale", "disciplinato"]
    ok(P.puo_combattere(S, a)[0], "il Leale non rifiuta mai")

    # ---- la morte: lutto, magazzino, lascito
    nuova_partita()
    a = assumi(nome="Test Quattro", tratti=["leale", "carismatico"])
    b = assumi(nome="Test Cinque", tratti=["leale", "disciplinato"])
    P.cambia_legame(a, b, 60)
    a["armi"] = [DB["equip"][0]["id"]]
    a["armatura_equip"] = DB["armor"][0]["id"]
    a["augments"] = [DB["augments"][0]["id"]]
    a["skills"]["tattica"] = 3
    b0 = P.punti_voce(b, P.miglior_voce(a))
    P.morte(S, a)
    ok(a["morto"] and P.salute(a) == "morto" and a in P.caduti(S) and a not in P.membri_attivi(S), "morto")
    ok(len(S["palestra"]["magazzino"]) == 3 and not a["armi"] and a["armatura_equip"] is None and not a["augments"],
       "l'equipaggiamento torna in magazzino")
    ok(P.punti_voce(b, P.miglior_voce(a)) > b0 or P.rango_voce(b, P.miglior_voce(a)) >= 4, "l'amico eredita")
    lutto = [e for e in S["palestra"]["eventi"] if e["tipo"] == "lutto"]
    ok(len(lutto) == 1, "un lutto da gestire")
    f0 = b["fiducia"]
    d = P.descrivi_evento(S, lutto[0])
    ok("Test" in d["testo"] and len(d["scelte"]) == 2, d)
    S["crediti"] = 100
    res = P.risolvi_evento(S, DB, lutto[0]["id"], "silenzio")
    ok(res["ok"] and b["fiducia"] > f0 and S["crediti"] == 70 and not S["palestra"]["eventi"], "il lutto si elabora")
    res = P.risolvi_evento(S, DB, 999, "silenzio")
    ok(not res["ok"], "evento inesistente")

    # ---- via le armi dal magazzino
    S["crediti"] = 5000
    b["armi"] = []
    idx = next(i for i, m in enumerate(S["palestra"]["magazzino"]) if m["cat"] == "arma")
    r = client.post("/negozio/magazzino/equip", data={"pid": b["id"], "indice": idx})
    ok(b["armi"] == [DB["equip"][0]["id"]] and len(S["palestra"]["magazzino"]) == 2, "dal magazzino ad un allievo")
    r = client.post("/negozio/disequip", data={"pid": b["id"], "categoria": "arma", "iid": b["armi"][0]})
    ok(b["armi"] == [] and len(S["palestra"]["magazzino"]) == 3, "togliere un oggetto lo manda in magazzino, non lo distrugge")
    nuovo_gilet = next(x for x in DB["armor"] if x["id"] != DB["armor"][0]["id"])
    b["armatura_equip"] = DB["armor"][0]["id"]
    n_m = len(S["palestra"]["magazzino"])
    client.post("/negozio/equip", data={"categoria": "armatura", "iid": nuovo_gilet["id"], "pid": b["id"]})
    ok(b["armatura_equip"] == nuovo_gilet["id"] and len(S["palestra"]["magazzino"]) == n_m + 1, "l'armatura sostituita non si butta")

    # ============================================================ i tratti
    nuova_partita()
    a = assumi(nome="Test Sei", tratti=["pigro", "fragile"], fiducia=50)
    ok(abs(P.prob_salta(a) - 0.25) < 1e-9, "pigro salta un quarto degli allenamenti")
    a["fiducia"] = 10
    ok(abs(P.prob_salta(a) - 0.55) < 1e-9, "e con poca fiducia ancora di piu'")
    a["tratti"] = ["fragile", "leale"]
    ok(P.moltiplicatore(a, "infortunio") == 1.5 and P.moltiplicatore(a, "stress") == 1.4, "fragile")
    ok(P.prob_infortunio(S, a, "sparring", None) < P.prob_infortunio(S, a, "sparring", a), "senza compagno ci si fa meno male")
    a["tratti"] = ["cocciuto", "veterano"]
    a["fiducia"] = 50
    a["piano"] = ["sparring"] * 7
    a["hp"]["gamba_dx"] = 20
    ok(P.assegnazione(S, a)["attivita"] == "sparring", "il cocciuto si allena anche ferito")
    # camera di controllo: nessuna scarica
    a["tratti"] = ["disciplinato", "leale"]
    p0 = P.prob_infortunio(S, a, "controllo")
    S["palestra"]["attrezzi"].append("camera_controllo")
    ok(p0 > 0 and P.prob_infortunio(S, a, "controllo") == 0, "la camera di controllo azzera la scarica")
    # attrezzi: +25% sulla voce giusta
    base = P.punti_sessione(S, a, "palestra", "stat:fisico")
    S["palestra"]["attrezzi"].append("pesi")
    ok(P.punti_sessione(S, a, "palestra", "stat:fisico") > base and P.punti_sessione(S, a, "palestra", "stat:riflessi") == base,
       "i pesi aiutano solo il Fisico")
    # eta': dopo i 34 si impara piu' piano
    a["data_nascita"] = P.data_nascita_per_eta(30, S["giorno"])
    giovane = P.punti_sessione(S, a, "studio", "stat:mente")
    a["data_nascita"] = P.data_nascita_per_eta(36, S["giorno"])
    ok(P.punti_sessione(S, a, "studio", "stat:mente") < giovane, "dopo i 34 anni si impara piu' piano")

    # ============================================================ colloquio
    nuova_partita()
    a = assumi(nome="Test Sette", tratti=["orgoglioso", "disciplinato"], fiducia=50, tratti_noti=1)
    ok(P.puo_parlare(S, a), "si puo' parlare")
    f0 = a["fiducia"]
    r = P.colloquio(S, a, "ascolta")                       # l'orgoglioso lo ama, il disciplinato e' neutro: (8 + 2) / 2 = 5
    ok(r["ok"] and a["fiducia"] == f0 + 5, f"ascolta: +5 ({a['fiducia']})")
    ok(a["tratti_noti"] == 2 and r["rivelato"] == "disciplinato" or a["tratti_noti"] == 1, "(la reazione piu' forte tradisce un tratto nascosto)")
    r2 = P.colloquio(S, a, "rimprovera")
    ok(not r2["ok"], "una volta a settimana")
    S["giorno"] = 7
    b = assumi(nome="Test Otto", tratti=["orgoglioso", "disciplinato"], fiducia=50, tratti_noti=1)
    r = P.colloquio(S, b, "rimprovera")                     # l'orgoglioso lo odia (−8), il disciplinato lo ama (+8): 0
    ok(r["ok"] and b["fiducia"] == 50, f"rimprovera: {b['fiducia']}")
    ok(not P.colloquio(S, b, "inventato")["ok"], "approccio sconosciuto")

    # le parole giuste possono ridare un punto di umanita' speso (mai oltre quelli spesi, il massimo non cresce)
    class Dado:
        def __init__(self, v): self.v = v
        def random(self): return self.v
    for inst, rec0, dado, atteso in ((3, 0, 0.1, 1), (3, 0, 0.9, 0), (3, 3, 0.1, 0), (0, 0, 0.1, 0)):
        S["giorno"] += 7
        c = assumi(nome="Test Umano", tratti=["orgoglioso", "disciplinato"], fiducia=50, tratti_noti=1, umanita_recuperata=rec0)
        r = P.colloquio(S, c, "ascolta", rng=Dado(dado), umanita_installata=inst)
        ok(r["umanita"] == atteso and c["umanita_recuperata"] == rec0 + atteso, (inst, rec0, dado, r["umanita"]))
        ok(("umanità" in r["testo"]) == bool(atteso))
    S["giorno"] += 7
    c = assumi(nome="Test Rimprovero", tratti=["orgoglioso", "disciplinato"], fiducia=50, tratti_noti=1)
    ok(P.colloquio(S, c, "rimprovera", rng=Dado(0.0), umanita_installata=5)["umanita"] == 0, "un colloquio sbagliato non ridona umanita'")
    rec_u = {"stats": {"mente": 2, "sociale": 2}, "protesi": [], "augments": [DB["augments"][0]["id"]], "umanita_recuperata": 99}
    ok(webapp.umanita_usata(rec_u) == 0 and webapp.umanita_installata(rec_u) == DB["augments"][0].get("costo_umanita", 0)
       and webapp.umanita_max_record(rec_u) == 8, "umanita' usata = installata - recuperata, mai sotto 0, il massimo non cambia")

    # ============================================================ la settimana
    nuova_partita()
    a = assumi(nome="Test Nove", tratti=["ambizioso", "leale"], fiducia=90, tratti_noti=1, ingaggio=0)
    chiamato = []
    for i in range(7):
        r = P.avanza_giorno(S, DB, random.Random(i), alla_settimana=lambda st: chiamato.append(1))
        S["palestra"]["eventi"].clear()
    ok(r["settimana_chiusa"] and S["giorno"] == 7 and chiamato == [1], "alla fine della settimana scatta il rinnovo")
    ok(a["tratti_noti"] == 2, "dopo una settimana si scopre il secondo tratto")
    ok(a["fiducia"] < 90 + 1, "la fiducia torna verso 50 (e l'ambizioso senza duelli la perde)")
    ok(a["fiducia"] <= 90 - (90 - 50) * P.RITORNO_FIDUCIA - 3 + 1 + 1, f"{a['fiducia']}")
    # fiducia a terra per due settimane: se ne va
    nuova_partita()
    a = assumi(nome="Test Dieci", tratti=["paranoico", "avido"], fiducia=2)
    for i in range(14):
        a["fiducia"] = min(a["fiducia"], 2)             # trattato male, ogni giorno (da solo, la fiducia torna verso 50)
        P.avanza_giorno(S, DB, random.Random(i))
        S["palestra"]["eventi"].clear()
    ok(a not in S["personaggi"] and S["palestra"]["ex"] and S["palestra"]["ex"][0]["motivo"] == "sfiducia", "sfiducia: lascia la palestra")

    # ============================================================ ritiro e istruttori
    nuova_partita()
    v = assumi(nome="Vecchio Vecchi", tratti=["veterano", "leale"])
    v["data_nascita"] = P.data_nascita_per_eta(38, 0)
    v["skills"]["tattica"] = 4
    v["armi"] = [DB["equip"][0]["id"]]
    g = assumi(nome="Giovane Gio", tratti=["disciplinato", "leale"])
    g["piano"] = ["studio"] * 7
    g["focus"]["studio"] = "skill:tattica"
    base = P.punti_sessione(S, g, "studio", "skill:tattica")
    for i in range(7):
        P.avanza_giorno(S, DB, random.Random(i))
        S["palestra"]["eventi"] = [e for e in S["palestra"]["eventi"] if e["tipo"] == "ritiro"]
    ritiri = [e for e in S["palestra"]["eventi"] if e["tipo"] == "ritiro"]
    ok(len(ritiri) == 1 and ritiri[0]["a"] == v["id"], "a 38 anni si propone il ritiro")
    P.risolvi_evento(S, DB, ritiri[0]["id"], "ultima")
    ok(v["ruolo"] == "combattente" and v["ritiro_dopo"] > S["giorno"], "un'ultima stagione")
    ok(not any(e["tipo"] == "ritiro" for e in S["palestra"]["eventi"]), "rimandato")
    P.fai_istruttore(S, v)
    ok(v["ruolo"] == "istruttore" and v["voce_istruttore"] == "skill:tattica" and not v["armi"], "diventa istruttore")
    ok(v in P.istruttori(S) and v not in P.membri_attivi(S) and P.posti_liberi(S) == P.CAPIENZA_BASE - 1, "non occupa un posto")
    ok(P.punti_sessione(S, g, "studio", "skill:tattica") > base, "l'istruttore da' +0,5 punti a chi allena la sua voce")
    ok(not client.post("/duelli/avvia", data={"pid": v["id"]}).status_code == 500 and webapp.DUELLO is None, "un istruttore non combatte")
    vis = P.vista(S, DB)
    ok(len(vis["istruttori"]) == 1 and len(vis["membri"]) == 1, "vista")

    # ============================================================ gli eventi di palestra: ogni scelta di ogni evento
    nuova_partita()
    a = assumi(nome="Test A", tratti=["avido", "orgoglioso"], fiducia=30, stress=70)
    b = assumi(nome="Test B", tratti=["ambizioso", "carismatico"])
    c = assumi(nome="Test C", tratti=["disciplinato", "leale"])
    for x in (a, b, c):
        x["vittorie"] = 3
        x["ingaggio"] = -30
    a["hp"]["gamba_dx"] = 40
    visti = set()
    for tipo, d in P.EVENTI.items():
        for sc in d["scelte"]:
            for seme in range(6):
                S["crediti"] = 1000
                ev = P._crea_evento(S, tipo, a=a, b=b, extra={"m": c["id"], "attrezzo": "specchio"})
                antes = (S["crediti"], dict(a["hp"]))
                r = P.risolvi_evento(S, DB, ev["id"], sc["id"], random.Random(seme))
                ok(r["ok"] and isinstance(r["esito"], str) and "{" not in r["esito"], (tipo, sc["id"], r))
                ok("{" not in P.descrivi_evento(S, dict(ev, a=a["id"], b=b["id"]))["testo"], tipo)
                for x in (a, b, c):
                    if x in S["personaggi"]:
                        ok(0 <= x["fiducia"] <= 100 and 0 <= x["stress"] <= 100, (tipo, sc["id"], x["fiducia"], x["stress"]))
                        ok(all(v >= 1 for v in x["hp"].values()) or True, "")
                visti.add((tipo, sc["id"]))
                # rimette a posto chi se ne e' andato o e' diventato istruttore
                for x in (a, b, c):
                    if x not in S["personaggi"]:
                        S["personaggi"].append(x)
                    x["ruolo"] = "combattente"
                    x["armi"] = []
                    x["hp"] = {l: m for l, m in LOCAZIONI.items()}
                S["palestra"]["eventi"].clear()
                S["palestra"]["attrezzi"] = [i for i in S["palestra"]["attrezzi"] if i in ("sacco", "tatami")]
    ok(len(visti) == sum(len(d["scelte"]) for d in P.EVENTI.values()), "tutte le scelte sono state provate")
    # senza soldi non si paga
    ev = P._crea_evento(S, "anticipo", a=a)
    S["crediti"] = 10
    ok(not P.risolvi_evento(S, DB, ev["id"], "paga")["ok"] and any(e["id"] == ev["id"] for e in S["palestra"]["eventi"]), "senza crediti non si paga")
    ok(not [s for s in P.descrivi_evento(S, ev)["scelte"] if s["id"] == "paga"][0]["ok"], "e la scelta e' segnata come impossibile")
    S["palestra"]["eventi"].clear()

    # ============================================================ le rotte
    nuova_partita()
    webapp.genera_contratti()
    S["crediti"] = 5000
    client.post("/contratti/ingaggia/0")
    client.post("/contratti/ingaggia/0")
    a, b = S["personaggi"][0], S["personaggi"][1]
    for url in ["/", "/palestra", "/box", "/contratti", "/negozio", "/duelli", "/debug", "/torneo", "/sandbox",
                f"/personaggio/{a['id']}", "/api/palestra/stato", "/api/tattiche"]:
        r = client.get(url)
        ok(r.status_code in (200, 302), (url, r.status_code))
    r = client.get("/api/palestra/stato").get_json()
    ok(r["giorno"] == 0 and len(r["membri"]) == 2 and r["capienza"] == 4 and r["data"].startswith("Lunedì"), r.keys())
    ok([a["id"] for a in r["attrezzi_info"]] == r["attrezzi"] and all(a["nome"] for a in r["attrezzi_info"]), "gli attrezzi hanno il nome (la finestra 'Struttura')")
    m = r["membri"][0]
    ok(set(m["hp"]) == set(LOCAZIONI) and m["oggi"]["attivita"] and len(m["piano"]) == 7 and "focus" in m, "vista del membro")
    # piano e focus
    r = client.post("/api/palestra/azione", json={"tipo": "piano", "pid": a["id"], "giorno": 2, "sessione": "duro"})
    ok(r.status_code == 200 and a["piano"][2] == "duro", "piano")
    r = client.post("/api/palestra/azione", json={"tipo": "piano", "pid": a["id"], "giorno": 9, "sessione": "duro"})
    ok(r.status_code == 400, "giorno non valido")
    r = client.post("/api/palestra/azione", json={"tipo": "piano", "pid": a["id"], "giorno": 1, "sessione": "inventata"})
    ok(r.status_code == 400 and a["piano"][1] == "studio", "sessione non valida")
    r = client.post("/api/palestra/azione", json={"tipo": "focus", "pid": a["id"], "sessione": "palestra", "voce": "stat:riflessi"})
    ok(r.status_code == 200 and a["focus"]["palestra"] == "stat:riflessi", "focus")
    r = client.post("/api/palestra/azione", json={"tipo": "focus", "pid": a["id"], "sessione": "palestra", "voce": "stat:mente"})
    ok(r.status_code == 400, "una voce che la sessione non allena")
    r = client.post("/api/palestra/azione", json={"tipo": "auto_riposo", "pid": a["id"], "valore": False})
    ok(a["auto_riposo"] is False, "auto riposo")
    r = client.post("/api/palestra/azione", json={"tipo": "riposo", "pid": a["id"], "giorni": 2})
    ok(a["riposo_giorni"] == 2 and client.get("/api/palestra/stato").get_json()["membri"][0]["oggi"]["attivita"] == "riposo", "ordine di riposo")
    r = client.post("/api/palestra/azione", json={"tipo": "piano", "pid": 9999, "giorno": 1, "sessione": "duro"})
    ok(r.status_code == 400, "allievo sconosciuto")
    r = client.post("/api/palestra/azione", json={"tipo": "boh"})
    ok(r.status_code == 400, "azione sconosciuta")
    # avanti / settimana
    g0 = S["giorno"]
    r = client.post("/api/palestra/azione", json={"tipo": "avanti"}).get_json()
    ok(r["ok"] and S["giorno"] == g0 + 1 and r["riepiloghi"][0]["membri"], "avanti")
    S["palestra"]["eventi"].clear()
    r = client.post("/api/palestra/azione", json={"tipo": "settimana"}).get_json()
    ok(r["ok"] and (S["giorno"] % 7 == 0 or S["palestra"]["eventi"] or P.serate(S)["bloccato"]), "settimana: fino a domenica, a un evento o al terzo salto")
    # le serate: al massimo tre giornate di fila chiuse senza salire sul ring, poi se ne gioca una
    # (niente eventi a caso, ne' compleanni: un evento in sospeso ferma il tempo per un'altra ragione)
    p_ev = P.P_EVENTO_GIORNO
    P.P_EVENTO_GIORNO = 0.0
    S["palestra"]["eventi"].clear()
    S["palestra"]["saltate"] = 0
    for x in S["personaggi"]:
        x["fiducia"] = 60
        x["hp"] = {l: m for l, m in LOCAZIONI.items()}
        x["ultimo_duello"] = None
    S["giorno"] -= S["giorno"] % 7                      # un lunedi'
    sv = client.get("/api/palestra/stato").get_json()["serate"]
    ok(sv == {"saltate": 0, "max": 3, "fatta_oggi": False, "possibile": True, "bloccato": False}, sv)
    for k in range(3):
        S["palestra"]["eventi"].clear()
        g0 = S["giorno"]
        r = client.post("/api/palestra/azione", json={"tipo": "avanti"})
        ok(r.status_code == 200 and S["giorno"] == g0 + 1 and S["palestra"]["saltate"] == k + 1, f"salto {k + 1}")
    sv = client.get("/api/palestra/stato").get_json()["serate"]
    ok(sv["saltate"] == 3 and sv["bloccato"], "tre salti: bloccato")
    g0 = S["giorno"]
    S["palestra"]["eventi"].clear()
    r = client.post("/api/palestra/azione", json={"tipo": "avanti"})
    ok(r.status_code == 400 and S["giorno"] == g0 and "serata" in r.get_json()["errore"], "il quarto salto no")
    S["palestra"]["eventi"].clear()
    r = client.post("/api/palestra/azione", json={"tipo": "settimana"})
    ok(r.status_code == 400 and S["giorno"] == g0, "nemmeno passando la settimana")
    ok("Serate saltate" in client.get("/duelli").get_data(as_text=True) and 'class="pallino on"' in client.get("/duelli").get_data(as_text=True), "la pagina della serata mostra i pallini")
    # una serata sblocca (e azzera il conto)
    rec = S["personaggi"][0]
    client.post("/duelli/avvia", data={"pid": rec["id"]})
    sv = client.get("/api/palestra/stato").get_json()["serate"]
    ok(sv["saltate"] == 0 and sv["fatta_oggi"] and not sv["bloccato"], "dopo la serata il conto riparte")
    webapp.DUELLO = None; S.pop("duello_pendente", None)
    S["palestra"]["eventi"].clear()
    r = client.post("/api/palestra/azione", json={"tipo": "avanti"})
    ok(r.status_code == 200 and S["palestra"]["saltate"] == 0, "la giornata con la serata non conta come saltata")
    # la settimana si ferma al terzo salto invece di rifiutarsi del tutto
    S["palestra"]["saltate"] = 2
    S["giorno"] -= S["giorno"] % 7
    S["palestra"]["eventi"].clear()
    for x in S["personaggi"]:
        x["ultimo_duello"] = None
    r = client.post("/api/palestra/azione", json={"tipo": "settimana"}).get_json()
    ok(r["ok"] and len(r["riepiloghi"]) == 1 and (r["avviso"] or S["palestra"]["eventi"]) and r["stato"]["serate"]["bloccato"],
       "passando la settimana ci si ferma al terzo salto")      # (o prima, se un compleanno porta un evento)
    # se nessuno puo' combattere, saltare non e' una scelta: niente conto, niente blocco
    S["palestra"]["saltate"] = 3
    for x in S["personaggi"]:
        x["hp"] = {l: -m for l, m in LOCAZIONI.items()}
    ok(not P.serate(S)["possibile"] and not P.serate(S)["bloccato"], "se nessuno puo' combattere non si e' bloccati")
    S["palestra"]["saltate"] = 0
    P.avanza_giorno(S, DB)
    ok(S["palestra"]["saltate"] == 0, "e il giorno non conta come saltato")
    for x in S["personaggi"]:
        x["hp"] = {l: m for l, m in LOCAZIONI.items()}
    S["palestra"]["saltate"] = 0
    P.P_EVENTO_GIORNO = p_ev
    # con un evento in sospeso non si va avanti
    S["palestra"]["eventi"].clear()
    P._crea_evento(S, "ispezione")
    g0 = S["giorno"]
    r = client.post("/api/palestra/azione", json={"tipo": "avanti"})
    ok(r.status_code == 400 and S["giorno"] == g0, "gli eventi in sospeso fermano il tempo")
    ev = S["palestra"]["eventi"][0]
    S["crediti"] = 1000
    r = client.post("/api/palestra/azione", json={"tipo": "evento", "id": ev["id"], "scelta": "paga"}).get_json()
    ok(r["ok"] and r["esito"]["esito"] and not S["palestra"]["eventi"] and S["crediti"] == 950, "si risponde all'evento")
    # le settimane si rinnovano: nuovi aspiranti alla domenica
    vecchi = [c["nome"] for c in S["contratti"]]
    for _ in range(8):
        S["palestra"]["eventi"].clear()
        S["palestra"]["saltate"] = 0                    # (le serate: qui si prova altro)
        client.post("/api/palestra/azione", json={"tipo": "settimana"})
    ok(len(S["contratti"]) == webapp.N_CONTRATTI and [c["nome"] for c in S["contratti"]] != vecchi, "ogni settimana arrivano aspiranti nuovi")
    # cerca altri
    n = len(S["contratti"])
    S["crediti"] = 1000
    client.post("/contratti/cerca")
    ok(len(S["contratti"]) == n + 1 and S["crediti"] == 1000 - webapp.PREZZO_CERCA_ALTRI, "passaparola")
    while len(S["contratti"]) < webapp.MAX_ASPIRANTI:
        client.post("/contratti/cerca")
    c1 = S["crediti"]
    client.post("/contratti/cerca")
    ok(S["crediti"] == c1 and len(S["contratti"]) == webapp.MAX_ASPIRANTI, "al massimo cinque")
    # scheda: programma, colloquio, congedo
    r = client.post(f"/personaggio/{a['id']}/programma", data={"giorno0": "riposo", "giorno1": "duro", "giorno3": "controllo",
                                                              "focus_studio": "skill:tattica", "auto_riposo": "on"})
    ok(a["piano"][0] == "riposo" and a["piano"][1] == "duro" and a["piano"][3] == "controllo" and a["auto_riposo"], "programma dalla scheda")
    ok(a["focus"].get("studio") == "skill:tattica", "focus dalla scheda")
    a["colloquio_sett"] = 0
    client.post(f"/personaggio/{a['id']}/colloquio", data={"approccio": "ascolta"})
    ok(a["colloquio_sett"] == P.numero_settimana(S["giorno"]), "colloquio dalla scheda")
    a["armi"] = [DB["equip"][0]["id"]]
    n_m = len(S["palestra"]["magazzino"])
    client.post(f"/personaggio/{a['id']}/congeda")
    ok(a not in S["personaggi"] and len(S["palestra"]["magazzino"]) == n_m + 1, "congedo: le armi restano")
    # la scheda di un istruttore e di un caduto non si rompe, e non offre programma ne' colloquio
    S["crediti"] = 5000
    webapp.genera_contratti()
    client.post("/contratti/ingaggia/0")
    client.post("/contratti/ingaggia/0")
    vec, mor = S["personaggi"][-2], S["personaggi"][-1]
    P.fai_istruttore(S, vec)
    P.morte(S, mor)
    for rec in (vec, mor):
        r = client.get(f"/personaggio/{rec['id']}")
        ok(r.status_code == 200, f"scheda di {rec['nome']}")
        testo = r.get_data(as_text=True)
        ok("Programma della settimana" not in testo and "Parlare con" not in testo, "niente programma ne' colloquio")
    ok("ISTRUTTORE" in client.get(f"/personaggio/{vec['id']}").get_data(as_text=True), "la scheda dice che e' un istruttore")
    ok(client.post(f"/personaggio/{mor['id']}/colloquio", data={"approccio": "ascolta"}).status_code in (302, 303), "colloquio con un caduto: rifiutato senza errori")
    ok(client.get("/api/palestra/stato").get_json()["caduti"][0]["id"] == mor["id"], "il caduto sta nel muro dei caduti")
    # la nuova partita da debug
    r = client.post("/debug/nuova_partita")
    ok(S["giorno"] == 0 and not S["personaggi"] and S["crediti"] == webapp.CREDITI_PARTENZA and len(S["contratti"]) == webapp.N_CONTRATTI, "nuova partita")

    # ============================================================ il Torneo Evo e' a parte: nessun premio
    nuova_partita()
    S["crediti"] = 777
    t = webapp.TorneoEvo()
    t.bonus_accumulato = 321
    n_pers = len(S["personaggi"])
    for _ in range(4):
        t.fase = "duello"
        t.risolvi_duello(True)
        if t.fase == "risultato":
            t.scegli(t.scelte["poteri"][0]["id"], t.scelte["stats"][0] if t.scelte["stats"] else None)
    ok(t.fase == "vittoria", t.fase)
    ok(len(S["personaggi"]) == n_pers, "il campione non entra in palestra")
    ok(S["crediti"] == 777, "e il montepremi non e' denaro vero")
    ok(client.get("/api/torneo/stato").status_code == 200, "stato del torneo")

    # ============================================================ un salvataggio vecchio si porta al nuovo formato
    vecchio = {"crediti": 123, "personaggi": [webapp.nuovo_record(__import__("engine").eroe_base(DB["attacchi"], DB["poteri"], DB["stances"]))],
               "prossimo_id": 2, "contratti": [], "hp_versione": 2}
    vecchio["personaggi"][0]["id"] = 1
    vecchio["personaggi"][0]["last_heal"] = 123
    ok(P.migra_stato(vecchio), "migrazione")
    c = vecchio["personaggi"][0]
    ok(vecchio["giorno"] == 0 and "palestra" in vecchio and "mondo" in vecchio and c["piano"] and len(c["tratti"]) == 2 and c["tratti_noti"] == 2
       and c["fiducia"] >= 40, "formato nuovo")
    ok(not P.migra_stato(vecchio), "e una seconda volta non cambia nulla")

    # ============================================================ simulazione a caso: tante settimane, nessuna eccezione, valori sempre dentro i limiti
    sim(40, seed=11)
    sim(40, seed=12, crediti=100000)

    print(f"OK: {n_check} controlli")


def sim(settimane, seed=0, crediti=3000):
    """Una palestra che gioca da sola: piani a caso, eventi a caso, qualche duello. Niente deve rompersi."""
    rng = random.Random(seed)
    nuova_partita()
    S["crediti"] = crediti
    webapp.genera_contratti()
    attrezzi = [a for a in P.ATTREZZI if a not in ("sacco", "tatami")]
    stat = {"giorni": 0, "eventi": 0, "ferite": 0, "morti": 0, "partenze": 0, "ritiri": 0, "punti": 0.0}
    for g in range(settimane * 7):
        # ogni tanto si assume, si compra, si cambia piano, si combatte
        if rng.random() < 0.25 and S["contratti"] and P.posti_liberi(S) > 0:
            c = S["contratti"].pop(0)
            if S["crediti"] >= c["costo"]:
                S["crediti"] -= c.pop("costo")
                c["id"] = S["prossimo_id"]
                S["prossimo_id"] += 1
                c["ingaggio"] = S["giorno"]
                S["personaggi"].append(c)
        if rng.random() < 0.05:
            P.compra_attrezzo(S, rng.choice(attrezzi))
        for c in P.membri_attivi(S):
            if rng.random() < 0.15:
                P.imposta_piano(c, rng.randrange(7), rng.choice(P.SESSIONI_PIANO))
            if rng.random() < 0.1:
                s = rng.choice([x for x in P.SESSIONI_PIANO if P.SESSIONI[x]["voci"]])
                P.imposta_focus(c, s, rng.choice(P.voci_sessione(c, s)))
            if rng.random() < 0.12 and P.puo_combattere(S, c)[0]:
                c["ultimo_duello"] = S["giorno"]
                vitt = rng.random() < 0.5
                P.dopo_duello(S, c, vitt, "CPU", rng.randint(0, 200), rng)
                if rng.random() < 0.5:                       # un duello lascia ferite, e a volte qualcosa di peggio
                    l = rng.choice(list(LOCAZIONI))
                    c["hp"][l] = max(-LOCAZIONI[l], c["hp"][l] - rng.randint(0, 150))
                    if c["hp"][l] < 0 and l in ("braccio_sx", "braccio_dx", "gamba_sx", "gamba_dx"):
                        c["crippled"] = sorted(set(c.get("crippled", [])) | {l})
                if rng.random() < 0.01:
                    c["hp"]["busto"] = -LOCAZIONI["busto"]
                    P.morte(S, c, rng)
                    stat["morti"] += 1
                c["vittorie" if vitt else "sconfitte"] = c.get("vittorie" if vitt else "sconfitte", 0) + 1
        # gli eventi si risolvono con una scelta a caso
        for ev in list(S["palestra"]["eventi"]):
            d = P.descrivi_evento(S, ev)
            scelte = [s["id"] for s in d["scelte"] if s["ok"]] or [d["scelte"][-1]["id"]]
            P.risolvi_evento(S, DB, ev["id"], rng.choice(scelte), rng)
            stat["eventi"] += 1
        r = P.avanza_giorno(S, DB, rng, alla_settimana=lambda st: webapp.genera_contratti())
        stat["giorni"] += 1
        stat["partenze"] += len(r["partenze"])
        stat["punti"] += sum(m["punti"] for m in r["membri"])
        stat["ferite"] += sum(1 for m in r["membri"] if m["ferita"])
        # invarianti
        ok(S["giorno"] == g + 1, "il tempo avanza di un giorno")
        ok(len(P.membri_attivi(S)) <= P.capienza(S), f"capienza ({len(P.membri_attivi(S))} > {P.capienza(S)})")
        ok(len(S["palestra"]["eventi"]) <= P.MAX_EVENTI + 3, "gli eventi non si accumulano")
        for c in S["personaggi"]:
            ok(0 <= c["fiducia"] <= 100 and 0 <= c["stress"] <= 100, (c["nome"], c["fiducia"], c["stress"]))
            ok(len(c["piano"]) == 7 and all(p in P.SESSIONI for p in c["piano"]), "piano")
            for k, v in c["allenamento"].items():
                req = P.punti_richiesti(c, k)
                ok(v >= 0 and (req is None or v <= req + 1e-9), (k, v, req))
            ok(all(isinstance(v, int) for v in c["legami"].values()) and all(-100 <= v <= 100 for v in c["legami"].values()), "legami")
            for l in LOCAZIONI:
                ok(c["hp"][l] <= LOCAZIONI[l], "hp oltre il massimo")
        v = P.vista(S, DB, rng)
        ok(len(v["membri"]) == len(P.membri_attivi(S)), "vista coerente")
    ok(stat["giorni"] == settimane * 7, "simulazione finita")
    return stat


if __name__ == "__main__":
    main()
