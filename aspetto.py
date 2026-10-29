"""Aspetto dei personaggi: capigliatura, maglia, pantaloni e il seed dei colori.

Ogni personaggio (del box, avversario del duello, eroe del torneo) ha un `aspetto`:

    {"sesso": "M"|"F", "capelli": "m3", "maglia": "tshirt", "pantaloni": "lunghi", "seed": 123456789}

Gli id vengono da `static/sprites/maschio/aspetto.json` (le capigliature hanno il tag di sesso M, F o unisex). I COLORI
non si salvano: li ricava il client dal `seed` (static/arena.js), campionando le texture `colori_capelli.png` e
`colori_vestiti.png`. Lo stesso seed dà sempre gli stessi colori, anche se un domani si ritoccano le texture.

`genera` evita di ripetere una combinazione (capelli, maglia, pantaloni) gia' in uso: ogni personaggio ha la sua."""
import json
import os
import random

MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "sprites", "maschio", "aspetto.json")
_cache = {}

# nomi propri del gioco (engine.NOMI_PROPRI) che sono femminili; tutti gli altri sono maschili
NOMI_FEMMINILI = {"Luna", "Nadia", "Zoe", "Mira", "Vera", "Nina", "Alba", "Greta", "Irene", "Petra", "Aida", "Cleo",
                  "Emma", "Gaia", "Iris", "Kira", "Maya", "Olga", "Rita", "Sasha"}


def manifesto():
    if "m" not in _cache:
        with open(MANIFEST, encoding="utf-8") as f:
            _cache["m"] = json.load(f)
    return _cache["m"]


def sesso_da_nome(nome):
    """Il sesso del personaggio, dal nome proprio (i personaggi non hanno un campo sesso)."""
    return "F" if (nome or "").split(" ")[0] in NOMI_FEMMINILI else "M"


def capelli_ammessi(sesso):
    """Gli id delle capigliature adatte a questo sesso: quelle con il suo tag e quelle unisex."""
    return [c["id"] for c in manifesto()["capelli"] if c["sesso"] in (sesso, "unisex")]


def combinazione(a):
    return (a.get("capelli"), a.get("maglia"), a.get("pantaloni"))


def genera(nome, usati=(), rng=random, sesso=None):
    """Un aspetto nuovo per `nome`: capelli adatti al sesso, maglia e pantaloni a caso, un seed. `usati` = gli aspetti
    gia' in uso (None ignorati): si cerca una combinazione che non ci sia ancora (e un seed nuovo); se sono finite
    tutte, resta quella casuale (i colori cambiano comunque col seed)."""
    man = manifesto()
    sesso = sesso or sesso_da_nome(nome)
    usati = [u for u in usati if u]
    visti, seeds = {combinazione(u) for u in usati}, {u.get("seed") for u in usati}
    capelli = capelli_ammessi(sesso)
    for _ in range(80):
        a = {"sesso": sesso, "capelli": rng.choice(capelli), "maglia": rng.choice(man["maglie"])["id"],
             "pantaloni": rng.choice(man["pantaloni"])["id"], "seed": rng.getrandbits(32)}
        if combinazione(a) not in visti and a["seed"] not in seeds:
            return a
    return a


def valido(a):
    """L'aspetto di un salvataggio e' usabile? (ids esistenti, sesso M/F, seed intero)."""
    if not isinstance(a, dict):
        return False
    man = manifesto()
    return (a.get("sesso") in ("M", "F") and isinstance(a.get("seed"), int)
            and a.get("capelli") in {c["id"] for c in man["capelli"]}
            and a.get("maglia") in {m["id"] for m in man["maglie"]}
            and a.get("pantaloni") in {p["id"] for p in man["pantaloni"]})
