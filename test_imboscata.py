"""Check dell'imboscata della nemesi ostile (duello mortale, scelta finale, sfondo "vicolo") e della ricarica di umanita' della Sala di
decompressione: python test_imboscata.py"""
import atexit
import os
import random
import shutil
import tempfile

_SAVE_TMP = tempfile.mkdtemp(prefix="urban_test_imb_")
os.environ["URBAN_SAVE_DIR"] = _SAVE_TMP
atexit.register(shutil.rmtree, _SAVE_TMP, ignore_errors=True)

import app as W  # noqa: E402
import engine as E  # noqa: E402
import nemesi as N  # noqa: E402
import palestra as P  # noqa: E402

S = W.STATO
n_check = 0


def ok(cond, msg=""):
    global n_check
    n_check += 1
    assert cond, msg


class Sempre:
    """Un rng che fa sempre scattare gli eventi (random() = 0)."""
    def random(self):
        return 0.0

    def shuffle(self, x):
        pass


def partita():
    S.clear()
    S.update(W.stato_default())
    W.DUELLO = None


def allievo():
    rec = W.nuovo_aspirante({c["nome"] for c in S["personaggi"]}, [c.get("aspetto") for c in S["personaggi"]])
    rec.pop("costo", None)
    rec["id"] = S["prossimo_id"]
    S["prossimo_id"] += 1
    rec["tratti_noti"] = 2
    rec["fiducia"] = 60
    S["personaggi"].append(rec)
    return rec


def rivale_battuto(rec, vinte):
    riv = W._nuovo_rivale(rec, W.record_to_pg(rec))
    S["rivali"].append(riv)
    riv["rapporti"] = {str(rec["id"]): {"vinte": vinte, "perse": 0, "ultimo": "a", "giorno": 1}}
    return riv


def imboscata():
    """Parte dall'evento vero: gancio quotidiano -> scelta -> duello mortale. Ritorna (allievo, rivale, duello)."""
    partita()
    rec = allievo()
    riv = rivale_battuto(rec, 5)
    rie = {"righe": [], "eventi_nuovi": []}
    W.nemesi_ostile(S, W.DB, Sempre(), rie)
    ev = next(e for e in S["palestra"]["eventi"] if e["tipo"] == "imboscata")
    ok(ev["a"] == rec["id"] and ev["extra"]["r"] == riv["id"] and riv["ostile"] == rec["id"], "l'evento nomina allievo e nemesi")
    d = P.descrivi_evento(S, ev)
    ok(riv["nome"] in d["testo"] and len(d["scelte"]) == 1, "il testo racconta chi e'")
    r = P.risolvi_evento(S, W.DB, ev["id"], "affronta")
    ok(r["ok"] and r["duello"] == "mortale" and r["a"] == rec["id"] and r["rivale"] == riv["id"])
    ok(W.avvia_imboscata(r["a"], r["rivale"]) == "/duello")
    return rec, riv, W.DUELLO


def main():
    # ============================================================ la probabilita' dell'evento
    partita()
    rec = allievo()
    riv = rivale_battuto(rec, 2)
    pid = rec["id"]
    ok(N.prob_ostile(riv, pid) == 0, "sotto soglia non cerca nessuno")
    riv["rapporti"][str(pid)]["vinte"] = N.SOGLIA_OSTILE
    p0 = N.prob_ostile(riv, pid)
    ok(p0 == N.P_OSTILE, "alla soglia, la probabilita' base")
    riv["rapporti"][str(pid)]["vinte"] += 3
    ok(N.prob_ostile(riv, pid) > p0, "piu' lo batti, piu' e' probabile")
    riv["rapporti"][str(pid)]["vinte"] = 99
    ok(N.prob_ostile(riv, pid) == N.P_OSTILE_MAX, "con un tetto")
    riv["rapporti"][str(pid)]["grazia"] = 99
    ok(N.prob_ostile(riv, pid) == 0, "la grazia azzera il conto")
    riv["rapporti"][str(pid)].pop("grazia")
    riv["ostile"] = pid
    ok(N.prob_ostile(riv, pid) == 0 and N.scegli_ostile([riv], pid, Sempre()) is None, "uno gia' ostile non si ripete")
    ok(riv not in N.adatti([riv], pid, riv["livello"]), "un ostile non si presenta come avversario normale")
    folla = [dict(riv, id=i, ostile=None, incontri=0) for i in range(30)] + [riv]
    N.pota(folla)
    ok(riv in folla, "la potatura non dimentica chi ti sta cercando")

    # ============================================================ l'evento e il duello mortale
    rec, riv, d = imboscata()
    ok(d.mortale and d.luogo == "vicolo" and d.tavolo is None and d.ordine[0] is d.cpu, "mortale, vicolo, niente azzardo, la nemesi inizia")
    ok(d.posta["paga"] == 0, "niente premio")
    ok(S["duello_pendente"] == rec["id"] and S["duello_mortale"], "marcatore persistente")
    st = d.stato()
    ok(st["mortale"] and st["luogo"] == "vicolo" and st["arena"] is None and st["folla"] is None and st["destino"]["atteso"] is False)
    ok(d._cpu_vuole_arrendersi() is False, "la CPU non si arrende")
    d.fase, d.attivo, d.altro = "player", d.p, d.cpu
    ok("ultimo sangue" in (d.azione_player({"tipo": "resa"}) or ""), "niente resa")
    ok(d.azione_player({"tipo": "azzardo", "id": 1}) is not None, "niente azzardo")
    ok(d.azione_player({"tipo": "punta", "importo": 10}) is not None, "niente puntate")
    ok(d.azione_player({"tipo": "destino", "scelta": "uccidi"}) == "nessuna scelta da fare", "il destino non si sceglie prima")
    ok(not d.finito, "il duello e' ancora aperto")
    # la partita gia' in corso non si abbandona avviandone un'altra
    client = W.app.test_client()
    resp = client.post("/duelli/avvia", data={"pid": rec["id"]})
    ok(resp.status_code == 302 and resp.headers["Location"].endswith("/duello") and W.DUELLO is d, (resp.status_code, resp.headers.get("Location"), W.DUELLO is d))

    # ---- sconfitta: l'allievo muore, la nemesi non e' piu' ostile
    d.finito, d.fase, d.vincitore = True, "fine", d.cpu
    W.chiudi_duello()
    ok(rec["morto"] and rec in P.caduti(S), "chi perde muore")
    ok("ostile" not in riv and N.rapporto(riv, rec["id"])["perse"] == 1, "la caccia e' finita, la nemesi ricorda")
    ok("duello_mortale" not in S and "duello_pendente" not in S, "marcatore tolto")

    # ---- vittoria: scelta finale
    rec, riv, d = imboscata()
    d.finito, d.fase, d.vincitore = True, "fine", d.p
    W.chiudi_duello()
    ok(not rec.get("morto") or rec["hp"]["testa"] <= -E.LOCAZIONI["testa"], "chi vince vive")
    ok(d.stato()["destino"]["atteso"] and d.stato()["destino"]["scelto"] is None and riv in S["rivali"], "la nemesi e' a terra: tocca al giocatore")
    ok(d.azione_player({"tipo": "destino", "scelta": "boh"}) == "scelta non valida")
    stress0, fid0 = rec["stress"], rec["fiducia"]
    ok(d.azione_player({"tipo": "destino", "scelta": "uccidi"}) is None and d.destino == "uccidi")
    ok(riv not in S["rivali"], "la nemesi muore: via dal registro")
    ok(rec["stress"] > stress0 and rec["fiducia"] < fid0, "pesa")
    ok(d.azione_player({"tipo": "destino", "scelta": "risparmia"}) == "nessuna scelta da fare", "una volta sola")
    ok(not d.stato()["destino"]["atteso"], "scelta fatta")

    rec, riv, d = imboscata()
    d.finito, d.fase, d.vincitore = True, "fine", d.p
    W.chiudi_duello()
    ok(d.azione_player({"tipo": "destino", "scelta": "risparmia"}) is None and riv in S["rivali"], "la grazia: resta in vita")
    ok(N.prob_ostile(riv, rec["id"]) == 0, "...e smette di cercarlo")
    riv["rapporti"][str(rec["id"])]["vinte"] += N.SOGLIA_OSTILE
    ok(N.prob_ostile(riv, rec["id"]) > 0, "servono altre sconfitte per riaccendere l'odio")
    ok(W.DUELLO is d and "ostile" not in riv)

    # ---- l'app chiusa a meta' di un duello mortale conta come sconfitta e morte
    rec, riv, d = imboscata()
    S["duello_pendente"], S["duello_mortale"] = rec["id"], True
    W.sconta_duello_pendente()
    ok(rec["morto"] and "duello_mortale" not in S, "abbandonare equivale a morire")
    partita()
    rec = allievo()
    S["duello_pendente"] = rec["id"]
    W.sconta_duello_pendente()
    ok(not rec.get("morto") and rec["sconfitte"] == 1, "il duello normale resta una sconfitta a tavolino")

    # ---- un duello mortale completo, giocato dalla CPU, finisce sempre
    for seme in range(6):
        random.seed(seme)
        rec, riv, d = imboscata()
        passi = 0
        while not d.finito and d.round < 120 and passi < 4000:
            passi += 1
            if d.fase == "risposta":
                s, loc = d.scegli_difesa(d.p, d.pending)
                d.risolvi_risposta(s, loc)
            else:
                d.cpu_step()
        ok(d.finito, f"duello mortale {seme} concluso")
        ok(not any("si arrende" in x["t"] for x in d.log), "nessuna resa nel log")
        W.chiudi_duello()
        ok(rec.get("morto") if d.vincitore is d.cpu else True, "chi perde muore")
        ok(P.membri_attivi(S) is not None)

    # ============================================================ la Sala di decompressione
    partita()
    rec = allievo()
    rec["protesi"], rec["augments"] = [], [W.DB["augments"][0]["id"]]
    rec["umanita_recuperata"] = 0
    spesa = W.umanita_usata(rec)
    ok(spesa > 0, "umanita' spesa in un impianto")
    rie = {"righe": []}
    W.umanita_settimanale(S, W.DB, random, rie)
    ok(W.umanita_usata(rec) == spesa and not rie["righe"], "senza la Sala non si recupera nulla")
    sala = P.ATTREZZI["decompressione"]
    ok(sala["prezzo"] > 0 and sala["umanita_settimanale"] == 1, "la Sala e' in negozio")
    S["palestra"]["attrezzi"].append("decompressione")
    W.umanita_settimanale(S, W.DB, random, rie)
    ok(W.umanita_usata(rec) == spesa - 1 and any("Sala di decompressione" in x for x in rie["righe"]), "ogni settimana un punto di umanita'")
    for _ in range(spesa + 3):
        W.umanita_settimanale(S, W.DB, random, rie)
    ok(W.umanita_usata(rec) == 0 and rec["umanita_recuperata"] == spesa, "mai oltre quella spesa")
    # il gancio e' agganciato davvero al calendario della palestra
    ok(W.umanita_settimanale in P.GANCI_SETTIMANA and W.nemesi_ostile in P.GANCI_GIORNO)

    print(f"OK: {n_check} verifiche")


if __name__ == "__main__":
    with W.app.test_request_context():     # (url_for)
        main()
