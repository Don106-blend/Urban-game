"""Simula settimane di palestra con un giocatore di prova, per guardare i RITMI (non le regole: quelle le prova test_palestra.py):
quanti punti di allenamento si guadagnano, quante ferite, lo stress e la fiducia, quanti eventi, chi se ne va.

    python tools/sim_palestra.py                      # 40 settimane, 3 allievi, un duello ogni 3 giorni
    python tools/sim_palestra.py --settimane 80 --allievi 4 --duelli 3 --seme 7

Lavora su una cartella temporanea: il salvataggio vero non si tocca. Il "giocatore" lascia i piani come sono (quello di base),
sceglie a caso tra le risposte che si puo' permettere e manda sul ring chi se la sente, con una vittoria su due."""
import argparse
import os
import random
import statistics
import sys
import tempfile

QUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(QUI))
os.environ.setdefault("URBAN_SAVE_DIR", tempfile.mkdtemp(prefix="urban_sim_"))

import app as W  # noqa: E402
import palestra as P  # noqa: E402
from engine import LOCAZIONI  # noqa: E402


def gioca(settimane, allievi, duelli_sett, seme, intelligente=True):
    rng = random.Random(seme)
    S = W.STATO
    S.clear()
    S.update(W.stato_default())
    S["crediti"] = 100000
    W.genera_contratti()
    for _ in range(allievi):
        if not S["contratti"]:
            W.aggiungi_aspirante()
        c = S["contratti"].pop(0)
        c.pop("costo", None)
        c["id"] = S["prossimo_id"]
        S["prossimo_id"] += 1
        c["tratti_noti"] = len(c["tratti"])
        S["personaggi"].append(c)
    st = {"punti": 0.0, "ferite": 0, "danni": 0, "eventi": 0, "partenze": 0, "morti": 0, "maturi": 0, "salta": 0, "riposi": 0,
          "stress": [], "fiducia": [], "giorni_allievo": 0, "rifiuti": 0, "duelli": 0, "soldi_strada": 0,
          "rango_su": 0, "token_dati": 0.0, "token_fermi": 0.0}
    for g in range(settimane * 7):
        for ev in list(S["palestra"]["eventi"]):
            d = P.descrivi_evento(S, ev)
            ok = [s["id"] for s in d["scelte"] if s["ok"]] or [d["scelte"][-1]["id"]]
            P.risolvi_evento(S, W.DB, ev["id"], rng.choice(ok), rng)
            st["eventi"] += 1
        # i duelli: ogni giorno, con probabilita' tale da fare `duelli_sett` a settimana in tutta la palestra
        if S["giorno"] % 7 == 0:                                        # il lunedi': il giocatore decide cosa allenare
            for c in P.membri_attivi(S):
                for sid in P.SESSIONI_PIANO:
                    if P.SESSIONI[sid]["voci"]:
                        libere = [v for v in P.voci_sessione(c, sid) if (P.rango_voce(c, v) or 4) < 4]
                        if libere:
                            if intelligente:      # porta a termine la voce piu' avanti che non e' ancora matura (se no, una a caso)
                                aperte = [v for v in libere if not P.maturo(c, v)] or libere
                                P.imposta_focus(c, sid, max(aperte, key=lambda v: (P.punti_voce(c, v), rng.random())))
                            else:
                                P.imposta_focus(c, sid, rng.choice(libere))
        for c in P.membri_attivi(S):
            while c.get("token", 0) > 0:                                  # spende i Token dove c'e' una voce matura
                voce = next((u for u in W.lista_upgrade(c) if u["maturo"] and u["costo"] <= c["token"] and "controllo" not in u["motivo"]), None)
                if voce is None:
                    break
                c["token"] -= voce["costo"]
                if voce["tipo"] == "stat":
                    c["stats"][voce["nome"]] += 1
                elif voce["tipo"] == "skill":
                    c["skills"][voce["nome"]] += 1
                else:
                    next(x for x in c["poteri"] if str(x["id"]) == voce["nome"])["rango"] += 1
                P.consuma_punti(c, voce["chiave"], voce["rango"])
                st["rango_su"] += 1
            st["token_fermi"] += c.get("token", 0) / max(1, len(P.membri_attivi(S))) / 7.0         # Token in attesa di una voce matura
            if rng.random() < duelli_sett / 7.0 / max(1, allievi):
                ok, _ = P.puo_combattere(S, c)
                if not ok:
                    st["rifiuti"] += 1
                    continue
                vitt = rng.random() < 0.5
                c["ultimo_duello"] = S["giorno"]
                danno = rng.randint(30, 260)
                P.dopo_duello(S, c, vitt, "CPU", danno, rng)
                st["duelli"] += 1
                c["token"] = c.get("token", 0) + (1 if rng.random() < 0.18 else 0)       # ~ un Token ogni 5-6 duelli (XP: 200 a duello, 1000 x 1,2^n a livello)
                st["token_dati"] += 0.18
                for _ in range(rng.randint(1, 3)):                    # i colpi presi: qualche locazione ammaccata
                    l = rng.choice(list(LOCAZIONI))
                    c["hp"][l] = max(-LOCAZIONI[l] // 3, c["hp"][l] - rng.randint(10, danno))
                if vitt:
                    S["crediti"] += W.RICOMPENSA_VITTORIA
        r = P.avanza_giorno(S, W.DB, rng, alla_settimana=lambda s: W.genera_contratti())
        for m in r["membri"]:
            st["punti"] += m["punti"]
            st["giorni_allievo"] += 1
            st["ferite"] += 1 if m["ferita"] else 0
            st["danni"] += m["ferita"]["hp"] if m["ferita"] else 0
            st["maturi"] += 1 if m["maturo"] else 0
            st["salta"] += 1 if m["attivita"] == "salta" else 0
            st["riposi"] += 1 if m["attivita"] == "riposo" else 0
            st["soldi_strada"] += m["crediti"]
        st["partenze"] += len(r["partenze"])
        for c in P.membri_attivi(S):
            st["stress"].append(c["stress"])
            st["fiducia"].append(c["fiducia"])
    return st


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--settimane", type=int, default=40)
    ap.add_argument("--allievi", type=int, default=3)
    ap.add_argument("--duelli", type=float, default=2.5, help="duelli a settimana, in tutta la palestra")
    ap.add_argument("--seme", type=int, default=1)
    ap.add_argument("--a-caso", action="store_true", help="il giocatore sceglie cosa allenare a caso (non porta a termine le voci)")
    a = ap.parse_args()
    st = gioca(a.settimane, a.allievi, a.duelli, a.seme, intelligente=not a.a_caso)
    gs = max(1, st["giorni_allievo"])
    sett_all = gs / 7
    print(f"{a.settimane} settimane, {a.allievi} allievi, {a.duelli} duelli a settimana:")
    print(f"  punti di allenamento per allievo a settimana : {st['punti'] / sett_all:.1f}")
    print(f"  ferite d'allenamento per allievo a settimana  : {st['ferite'] / sett_all:.2f}  (hp persi in media {st['danni'] / max(1, st['ferite']):.0f})")
    print(f"  voci maturate per allievo a settimana         : {st['maturi'] / sett_all:.2f}")
    print(f"  ranghi saliti in tutto / per allievo a 10 sett. : {st['rango_su']} / {st['rango_su'] / max(1, a.allievi) / a.settimane * 10:.1f}")
    print(f"  Token fermi in media (nessuna voce matura)     : {st['token_fermi'] / max(1, st['giorni_allievo'] / a.allievi) * 7:.2f} per allievo")
    print(f"  giorni di riposo / saltati (su {gs})            : {st['riposi'] / gs:.0%} / {st['salta'] / gs:.0%}")
    print(f"  stress medio / max                            : {statistics.mean(st['stress']):.0f} / {max(st['stress'])}")
    print(f"  fiducia media / min                           : {statistics.mean(st['fiducia']):.0f} / {min(st['fiducia'])}")
    print(f"  eventi a settimana                            : {st['eventi'] / a.settimane:.1f}")
    print(f"  duelli fatti / rifiutati per sfiducia         : {st['duelli']} / {st['rifiuti']}")
    print(f"  partenze                                      : {st['partenze']}")


if __name__ == "__main__":
    main()
