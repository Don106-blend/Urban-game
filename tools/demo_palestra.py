"""Avvia l'app con una palestra di prova, su una cartella TEMPORANEA (mai sul salvataggio vero).

    python tools/demo_palestra.py                 # una palestra piena: attrezzi, feriti, un istruttore, due caduti
    python tools/demo_palestra.py --scenario base # solo gli attrezzi iniziali e due allievi
    python tools/demo_palestra.py --scenario vuota

Serve a guardare e provare la scena della palestra (static/scena_palestra.js) senza giocare per giorni: ogni allievo ha
un piano diverso, quindi il lunedi' si vede quasi ogni attivita'. La porta e' 5057 (variabile PORT)."""
import argparse
import os
import random
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(AQUI))
os.environ.setdefault("URBAN_SAVE_DIR", tempfile.mkdtemp(prefix="urban_demo_"))

import app as W  # noqa: E402
import palestra as P  # noqa: E402


def assumi(S, nome=None, **ov):
    rec = W.nuovo_aspirante({c["nome"] for c in S["personaggi"]}, [c.get("aspetto") for c in S["personaggi"]])
    rec.pop("costo", None)
    rec["id"] = S["prossimo_id"]
    S["prossimo_id"] += 1
    rec["tratti_noti"] = 2
    if nome:
        rec["nome"] = nome
    rec.update(ov)
    S["personaggi"].append(rec)
    return rec


def prepara(scenario, seme):
    random.seed(seme)
    S = W.STATO
    S.clear()
    S.update(W.stato_default())
    S["crediti"] = 5000
    if scenario == "vuota":
        W.genera_contratti()
        return
    if scenario == "base":
        a = assumi(S, "Marta Kade", piano=["sparring"] * 7)
        b = assumi(S, "Dino Voss", piano=["sparring"] * 7)
        W.genera_contratti()
        return
    for a in ("pesi", "specchio", "lavagna", "manichino", "camera_controllo", "infermeria", "dormitorio"):
        P.compra_attrezzo(S, a)
    piani = {
        "Marta Kade":   ("palestra", "stat:fisico"),
        "Dino Voss":    ("palestra", "stat:riflessi"),
        "Iris Moreau":  ("sparring", None),
        "Teo Costa":    ("sparring", None),
        "Nadia Falk":   ("studio", None),
        "Ruben Silva":  ("controllo", None),
        "Zoe Katz":     ("riposo", None),
    }
    gente = []
    for nome, (sess, voce) in piani.items():
        r = assumi(S, nome, piano=[sess] * 7)
        if voce:
            r["focus"] = {"palestra": voce}
        gente.append(r)
    P.cambia_legame(gente[2], gente[3], 50)
    gente[6]["hp"]["braccio_dx"] = 40                    # chi riposa: un po' malconcio
    gente[6]["hp"]["gamba_sx"] = 60
    gente[6]["stress"] = 70
    gente[1]["hp"]["busto"] = 70
    # un istruttore e due caduti (la targa sul muro)
    vecchio = assumi(S, "Bruno Leone", data_nascita=P.data_nascita_per_eta(41, 0), ruolo="istruttore", voce_istruttore="skill:tattica")
    for nome in ("Furio Esposito", "Cleo Petrov"):
        m = assumi(S, nome, morto=True, giorno_morte=0)
    W.genera_contratti()
    S["palestra"]["registro"] += [{"g": 0, "t": "Marta Kade batte Ivan Reyes.", "pid": 1}]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", default="pieno", choices=["pieno", "base", "vuota"])
    ap.add_argument("--seme", type=int, default=3)
    o = ap.parse_args()
    prepara(o.scenario, o.seme)
    W.salva_stato()
    print(f"Palestra di prova ({o.scenario}) su {os.environ['URBAN_SAVE_DIR']}  ->  http://127.0.0.1:{os.environ.get('PORT', 5057)}/palestra")
    W.app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5057)), debug=False, use_reloader=False)
