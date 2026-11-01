"""Check della Fase 7 (CYBERWARE.md): niente piu' armi e armature, e il negozio del cyberware. python test_cyberware.py
Prova la migrazione dei salvataggi di prima (armi/armatura -> protesi e augment) e le schermate del negozio."""
import atexit
import os
import shutil
import tempfile

_SAVE_TMP = tempfile.mkdtemp(prefix="urban_test_cyber_")
os.environ["URBAN_SAVE_DIR"] = _SAVE_TMP
atexit.register(shutil.rmtree, _SAVE_TMP, ignore_errors=True)

import app as W  # noqa: E402

DB, S = W.DB, W.STATO
n = 0


def ok(c, m=""):
    global n
    n += 1
    assert c, m


def partita():
    S.clear()
    S.update(W.stato_default())
    W.DUELLO = None


def vecchio(nome, mente=1, **ov):
    """Un allievo come lo salvava la versione con armi e armature."""
    rec = W.nuovo_aspirante({c["nome"] for c in S["personaggi"]}, [c.get("aspetto") for c in S["personaggi"]])
    rec.pop("costo", None)
    rec["id"] = S["prossimo_id"]
    S["prossimo_id"] += 1
    rec["nome"] = nome
    rec["stats"]["mente"] = rec["stats"]["sociale"] = mente
    rec.update(ov)
    S["personaggi"].append(rec)
    return rec


def nome(cat, iid):
    return next(x["nome"] for x in W._catalogo(cat) if x["id"] == iid)


def main():
    # ============================================================ il catalogo
    ok("equip" not in DB and "armor" not in DB, "niente armi e armature")
    for nm in ("Lama monomolecolare", "Calotta in titanio", "Sottopelle balistico", "Esoscheletro da combattimento"):
        ag = next(x for x in DB["augments"] if x["nome"] == nm)
        ok(not ag["attivo"] and ag["costo_umanita"] >= 1, nm)
    ok({v: k for k, v in W.LEGACY_EQUIP.items()}[("protesi", 4)] == ("arma", 1), "la pistola e' il Braccio-cannone")
    ok(all(nome(c, i) for c, i in W.LEGACY_EQUIP.values()), "ogni vecchio oggetto ha il suo nuovo")
    ok(all(any(p["locazione"] == loc for p in DB["protesi"]) for loc in W.LOCAZIONI_CORPO), "ogni posto del corpo ha almeno una protesi")

    # ============================================================ la migrazione
    partita()
    a = vecchio("Ada Vecchia", mente=1, armi=[1, 2], armatura_equip=3)             # umanita' 4: cannone 2 + lama 1 + calotta 1 ci stanno
    b = vecchio("Bea Vecchia", mente=1, armi=[1], armatura_equip=2)                # umanita' 4: cannone 2, poi l'esoscheletro (4) no -> magazzino
    c = vecchio("Cleo Vecchia", mente=3, equip=[2], armatura_equip=1)              # (chiave "equip": ancora piu' vecchia) umanita' 12
    S["palestra"]["magazzino"] = [{"cat": "arma", "id": 2}, {"cat": "armatura", "id": 3}, {"cat": "armatura", "id": 99}, {"cat": "augment", "id": 1}]
    asp = {"nome": "Aspirante", "armi": [1], "armatura_equip": 1, "stats": {"mente": 1, "sociale": 1}, "protesi": [], "augments": []}
    S["contratti"] = [asp]
    riv = {"id": 1, "nome": "Rivale Vecchio", "armi": [2], "armatura_equip": 3, "stats": {"mente": 1, "sociale": 1}, "protesi": [], "augments": []}
    S["rivali"] = [riv]
    ok(W.migra_cyberware(S) is True)
    ok(a["protesi"] == [4] and sorted(a["augments"]) == [8, 9] and W.umanita_usata(a) == 4, (a["protesi"], a["augments"]))
    ok("armi" not in a and "armatura_equip" not in a and "equip" not in a, "i campi vecchi spariscono")
    ok(b["protesi"] == [4] and b["augments"] == [] and {"cat": "augment", "id": 11} in S["palestra"]["magazzino"],
       "quello che non ci sta in Umanita' va in magazzino, non si perde")
    ok(sorted(c["augments"]) == [8, 10] and not c["protesi"], (c["augments"], c["protesi"]))
    mag = S["palestra"]["magazzino"]
    ok({"cat": "augment", "id": 8} in mag and {"cat": "augment", "id": 9} in mag and {"cat": "augment", "id": 1} in mag, "il magazzino e' convertito")
    ok(not any(m["cat"] in ("arma", "armatura") for m in mag), "...e senza oggetti che non esistono piu'")
    ok(asp["protesi"] == [4] and asp["augments"] == [10] and "armi" not in asp, "gli aspiranti si convertono")
    ok(riv["augments"] == [8, 9] and not riv["protesi"], "i rivali pure")
    ok(W.migra_cyberware(S) is False, "una seconda volta non cambia piu' niente")

    # ============================================================ record_to_pg e combattimento
    pg = W.record_to_pg(a)
    ok({2, 48, 49} <= {x["id"] for x in pg.attacchi} and pg.armatura["testa"] == 15, "la vecchia Ada combatte come prima")
    rec = W.nuovo_record(pg)
    ok(rec["protesi"] == [4] and "armi" not in rec and "armatura_equip" not in rec, "il record salvato e' nuovo")
    ok(W.valore_equip(a) == 500 + 150 + 150, W.valore_equip(a))

    # ============================================================ le schermate del negozio
    cli = W.app.test_client()
    ok(cli.get("/negozio").status_code == 200 and cli.get("/negozio?tab=attrezzi").status_code == 200)
    html = cli.get(f"/negozio?pid={c['id']}").get_data(as_text=True)
    ok("Il corpo di" in html and "Cleo" in html and "Lama monomolecolare" in html and "Sottopelle balistico" in html, "corpo e impianti")
    for k in ("protesi", "augment", "magazzino"):
        ok(cli.get(f"/negozio?pid={c['id']}&cat={k}").status_code == 200, k)
    ok(cli.get(f"/negozio?pid={c['id']}&cat=protesi&slot=braccio_sx").get_data(as_text=True).count("Braccio-cannone") >= 1, "il posto filtra le protesi")
    ok(cli.get("/negozio?pid=99999&cat=boh&slot=boh").status_code == 200, "parametri strani non rompono la pagina")
    # comprare dalla scheda: crediti e Umanita' contano, e si torna allo stesso allievo
    S["crediti"] = 10000
    r = cli.post("/negozio/equip", data={"pid": c["id"], "categoria": "protesi", "iid": 4, "cat": "protesi", "slot": "braccio_sx"})
    ok(r.status_code == 302 and f"pid={c['id']}" in r.headers["Location"] and "cat=protesi" in r.headers["Location"], r.headers["Location"])
    ok(c["protesi"] == [4] and S["crediti"] == 10000 - 500)
    S["crediti"] = 10
    cli.post("/negozio/equip", data={"pid": c["id"], "categoria": "augment", "iid": 9})
    ok(9 not in c["augments"], "senza crediti non si compra")
    # il negozio senza allievi
    S["personaggi"] = []
    ok("Nessun allievo" in cli.get("/negozio").get_data(as_text=True))
    print(f"OK: {n} verifiche")


if __name__ == "__main__":
    main()
