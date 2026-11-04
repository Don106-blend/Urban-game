"""Check del Compendium (catalogo dei poteri a tutti i ranghi) e della palestra di prova (pupazzi base, mosse senza limiti, nessuno muore):
python test_compendio.py"""
import atexit
import os
import random
import shutil
import tempfile

_SAVE_TMP = tempfile.mkdtemp(prefix="urban_test_comp_")
os.environ["URBAN_SAVE_DIR"] = _SAVE_TMP
atexit.register(shutil.rmtree, _SAVE_TMP, ignore_errors=True)

import app as W  # noqa: E402
from engine import LOCAZIONI, MAX_POTERI, STATS  # noqa: E402

DB = W.DB
n_check = 0


def ok(cond, msg=""):
    global n_check
    n_check += 1
    assert cond, msg


def main():
    # ---------------------------------------------------------------- il catalogo: ogni potere, ogni rango, tutte le sue mosse
    cat = W.catalogo_poteri()
    ok(len(cat) == len(DB["poteri"]) and len(cat) >= 20, "ogni potere e' nel Compendio")
    att_nome = {a["id"]: a["nome"] for a in DB["attacchi"]}
    sta_nome = {s["id"]: s["nome"] for s in DB["stances"]}
    for pw, voce in zip(DB["poteri"], cat):
        ok(voce["nome"] == pw["nome"] and voce["rango_max"] == pw["rango"] == len(voce["ranghi"]), pw["nome"])
        viste_att, viste_sta = set(), set()
        for r in voce["ranghi"]:
            ids = [a["id"] for a in r["attacchi"]]
            ok(viste_att <= set(ids), pw["nome"] + ": le mosse dei ranghi bassi restano ai ranghi alti")
            ok({a["id"] for a in r["attacchi"] if a["nuovo"]} == set(ids) - viste_att, pw["nome"] + ": 'nuovo' = arriva proprio a questo rango")
            viste_att |= set(ids)
            ok(all(a["nome"] and a["tags"] and "id" in a for a in r["attacchi"]), "ogni mossa ha nome e sigle")
            ids_s = {s["id"] for s in r["stance"] if not s["attivata"]}
            ok(viste_sta <= ids_s, pw["nome"] + ": anche le stance si tengono")
            viste_sta |= ids_s
            ok(all(isinstance(e, str) and e for e in r["effetti"]), "gli effetti sono descritti")
        # tutto quello che il potere da' nei dati si vede nel Compendio (all'ultimo rango)
        ok(viste_att == {a for l in pw.get("attacchi", {}).values() for a in l}, pw["nome"] + ": nessuna mossa nascosta")
        ok(viste_sta == {s for l in pw.get("stance", {}).values() for s in l}, pw["nome"] + ": nessuna stance nascosta")
    ok(W.descrivi_formula({"dadi": [{"n": 1, "tipo": "controllo"}], "flat": 2, "mult": 10}) == "(1d controllo + 2) × 10", "formule in chiaro")
    ok(W.descrivi_formula({"dadi": [], "flat": 15, "mult": 1}) == "15", "formula semplice")

    # ---------------------------------------------------------------- i pupazzi base
    pr = W.ProvaPoteri()
    for q in (pr.p, pr.cpu):
        ok(all(v == 1 for v in q.stats.values()) and not q.poteri and q.aspetto is None, "pupazzo base: tutto a 1, niente poteri, nessun aspetto")
        ok([a["nome"] for a in q.attacchi] == ["Pugno", "Colpo pesante"] and {s["nome"] for s in q.stance_conosciute} == {"Difensivo", "Aggressivo", "Taunt"}, "il kit base")
    st = pr.stato()
    ok(st["fase"] == "prova" and not st["finito"] and st["max_poteri"] == MAX_POTERI == 4 and len(st["poteri"]) == len(DB["poteri"]), "lo stato per il client")
    ok(st["player"]["aspetto"] is None and st["cpu"]["aspetto"] is None, "il client disegna i pupazzi di base")

    # ---------------------------------------------------------------- equipaggiare: fino a 4 poteri, a qualunque rango
    ids = [p["id"] for p in DB["poteri"]]
    for k, pid in enumerate(ids[:MAX_POTERI]):
        ok(pr.azione_prova({"tipo": "equipaggia", "lato": "p", "id": pid, "rango": 1 + k % 4}) is None, "equipaggia")
    ok(len(pr.p.poteri) == MAX_POTERI and all(s["attivo"] for s in pr.p.poteri), "quattro poteri, tutti accesi subito")
    ok("Al massimo 4" in pr.azione_prova({"tipo": "equipaggia", "lato": "p", "id": ids[4], "rango": 1}), "il quinto no")
    ok(len(pr.p.poteri) == MAX_POTERI and not pr.cpu.poteri, "il rifiuto non cambia niente, e l'altro pupazzo e' a parte")
    ok(pr.azione_prova({"tipo": "equipaggia", "lato": "c", "id": ids[4], "rango": 4}) is None and len(pr.cpu.poteri) == 1, "ogni pupazzo ha i suoi 4 posti")
    pid0 = ids[0]
    ok(pr.azione_prova({"tipo": "equipaggia", "lato": "p", "id": pid0, "rango": 4}) is None, "si cambia il rango di uno equipaggiato")
    ok(next(s["rango"] for s in pr.p.poteri if s["def"]["id"] == pid0) == 4 and len(pr.p.poteri) == MAX_POTERI, "rango cambiato, ancora 4 poteri")
    for rango in (0, 5, "2", None):
        ok(pr.azione_prova({"tipo": "equipaggia", "lato": "p", "id": pid0, "rango": rango}) is not None, f"rango {rango!r} non valido")
    ok(pr.azione_prova({"tipo": "equipaggia", "lato": "p", "id": 9999, "rango": 1}) is not None, "potere inesistente")
    ok(pr.azione_prova({"tipo": "rimuovi", "lato": "p", "id": pid0}) is None and len(pr.p.poteri) == MAX_POTERI - 1, "si toglie un potere")
    ok(pr.azione_prova({"tipo": "rimuovi", "lato": "p", "id": pid0}) is not None, "... una volta sola")
    ok(pr.azione_prova({"tipo": "boh"}) is not None, "azione sconosciuta")
    pr.azione_prova({"tipo": "ripulisci"})
    ok(not pr.p.poteri and not pr.cpu.poteri and pr.p.hp == pr.p.hp_max, "azzera: due pupazzi nudi")

    # ---------------------------------------------------------------- senza limiti: ogni mossa di ogni potere al rango massimo, e nessuno muore
    random.seed(3)
    n_mosse = 0
    for pw in DB["poteri"]:
        pr.azione_prova({"tipo": "ripulisci"})
        ok(pr.azione_prova({"tipo": "equipaggia", "lato": "p", "id": pw["id"], "rango": pw["rango"]}) is None, pw["nome"])
        menu = pr.stato()["menu"]["p"]
        ok({a["nome"] for a in menu["attacchi"]} >= {"Pugno", "Colpo pesante"}, pw["nome"] + ": le mosse del potere si aggiungono al kit")
        for a in menu["attacchi"]:
            for ripeti in range(3):                                         # (nessuna ricarica, nessun uso a esaurimento)
                loc = random.choice([None] + list(LOCAZIONI))
                err = pr.azione_prova({"tipo": "attacco", "lato": "p", "id": a["id"], **({"loc": loc} if loc else {})})
                ok(err is None, f"{pw['nome']} / {a['nome']}: {err}")
                n_mosse += 1
                for q in (pr.p, pr.cpu):
                    ok(q.hp["testa"] >= 1 and q.hp["busto"] >= 1 and not q.sconfitto(), f"{pw['nome']} / {a['nome']}: nessuno muore")
                ok(not pr.finito and pr.stato()["fase"] == "prova" and pr.pending is None, "la prova non finisce mai e non aspetta risposte")
                ev = [e for e in pr.eventi if e["tipo"] == "colpo"][-1]
                ok(ev["esito"] == "colpito", f"{a['nome']}: a segno (sempre a segno)")
        # le stance: si accendono e si spengono, una per volta, anche se a tiro di tattica
        for s in pr.stato()["menu"]["p"]["stance"]:
            if s["da_potere"]:
                ok(pr.azione_prova({"tipo": "stance", "lato": "p", "id": s["id"]}) is not None, "una stance del potere non si spegne a mano")
                continue
            ok(pr.azione_prova({"tipo": "stance", "lato": "p", "id": s["id"]}) is None, f"{pw['nome']} / {s['nome']}")
            ok(any(x["def"]["id"] == s["id"] for x in pr.p.stance_attive), f"{s['nome']}: attiva (qui non ci sono turni: dura finche' non la si spegne)")
            ok(sum(1 for x in pr.p.stance_attive if x["turni"] >= 0) == 1, "una stance manuale per volta")
            ok(pr.azione_prova({"tipo": "stance", "lato": "p", "id": s["id"]}) is None
               and not any(x["def"]["id"] == s["id"] and x["turni"] >= 0 for x in pr.p.stance_attive), f"{s['nome']}: si spegne")
        pr.azione_prova({"tipo": "rigenera"})
    ok(n_mosse > 100, "provate tutte le mosse")

    # ---------------------------------------------------------------- rigenerare: vita piena, armatura intera, ferite sparite
    pr.azione_prova({"tipo": "ripulisci"})
    pr.azione_prova({"tipo": "equipaggia", "lato": "c", "id": next(p["id"] for p in DB["poteri"] if p["nome"] == "Pelle Invincibile"), "rango": 4})
    arm0 = dict(pr.cpu.armatura)
    ok(arm0["busto"] > 0, "Pelle Invincibile da' armatura")
    pr.azione_prova({"tipo": "equipaggia", "lato": "p", "id": next(p["id"] for p in DB["poteri"] if p["nome"] == "Pirocinesi"), "rango": 4})
    for _ in range(6):
        for a in pr.stato()["menu"]["p"]["attacchi"]:
            pr.azione_prova({"tipo": "attacco", "lato": "p", "id": a["id"]})
    ok(pr.stato()["danneggiato"] and (any(v < pr.cpu.hp_max[l] for l, v in pr.cpu.hp.items()) or pr.cpu.armatura != arm0), "colpiti")
    pr.azione_prova({"tipo": "rigenera"})
    ok(all(pr.cpu.hp[l] == pr.cpu.hp_max[l] for l in pr.cpu.hp) and not pr.cpu.crippled and pr.cpu.armatura == arm0, "rigenerato: vita piena e armatura intera")
    ok(not pr.stato()["danneggiato"], "e il client lo sa")
    ok(pr.cpu.poteri and pr.cpu.poteri[0]["attivo"], "i poteri restano equipaggiati")

    # ---------------------------------------------------------------- il tiro: a segno o con la difesa vera
    pr.azione_prova({"tipo": "ripulisci"})
    pr.azione_prova({"tipo": "a_segno", "valore": False})
    ok(not pr.stato()["a_segno"], "tiro vero")
    random.seed(5)
    esiti = set()
    for _ in range(60):
        pr.azione_prova({"tipo": "attacco", "lato": "p", "id": pr.p.attacchi[0]["id"]})
        esiti.add([e for e in pr.eventi if e["tipo"] == "colpo"][-1]["esito"])
        pr.azione_prova({"tipo": "rigenera"})
    ok(esiti == {"colpito", "retto"}, f"senza 'sempre a segno' si puo' anche mancare ({esiti})")
    pr.azione_prova({"tipo": "a_segno", "valore": True})

    # ---------------------------------------------------------------- il turno facoltativo: scorrono le bruciature
    pr.azione_prova({"tipo": "ripulisci"})
    pr.azione_prova({"tipo": "equipaggia", "lato": "p", "id": next(p["id"] for p in DB["poteri"] if p["nome"] == "Pirocinesi"), "rango": 2})
    pr.azione_prova({"tipo": "attacco", "lato": "p", "id": next(a["id"] for a in pr.p.attacchi if a["nome"] == "Palla di fuoco")})
    ok(any(e["def"]["nome"] == "Bruciatura" for e in pr.cpu.effetti_attivi), "la Palla di fuoco brucia")
    pr.azione_prova({"tipo": "turno"})
    ok(not pr.cpu.effetti_attivi and pr.cpu.hp["testa"] >= 1 and pr.stato()["fase"] == "prova", "un turno: la bruciatura scorre e finisce, nessuno muore")

    # ---------------------------------------------------------------- le rotte
    cli = W.app.test_client()
    ok(cli.get("/compendio").status_code == 200 and "Compendium" in cli.get("/").get_data(as_text=True), "la pagina e la voce nel menu")
    r = cli.get("/api/compendio/catalogo").get_json()
    ok(len(r) == len(DB["poteri"]) and r[0]["ranghi"][0]["attacchi"], "il catalogo via API")
    W.PROVA = None
    ok(cli.get("/api/compendio/prova/stato").status_code == 404, "la prova non e' aperta finche' non la si apre")
    ok(cli.get("/compendio/prova").status_code == 200 and W.PROVA is not None, "aprire la prova la crea")
    s = cli.post("/api/compendio/prova/azione", json={"tipo": "equipaggia", "lato": "p", "id": 3, "rango": 2}).get_json()
    ok(s["player"]["poteri"][0]["nome"] == "Pirocinesi" and not s.get("errore"), "equipaggiare via API")
    s = cli.post("/api/compendio/prova/azione", json={"tipo": "equipaggia", "lato": "p", "id": 3, "rango": 9}).get_json()
    ok(s.get("errore"), "un errore torna al client")
    ok(cli.get("/api/compendio/prova/stato").get_json()["menu"]["p"]["poteri"] == [{"id": 3, "nome": "Pirocinesi", "rango": 2}], "lo stato via API")
    for url in ("/", "/duelli", "/palestra", "/sandbox"):
        ok(cli.get(url).status_code in (200, 302), url)
    print(f"OK — tutti i check passati ({n_check})")


if __name__ == "__main__":
    main()
