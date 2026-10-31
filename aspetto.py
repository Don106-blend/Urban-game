"""Aspetto dei personaggi: capigliatura, maglia, pantaloni e il seed dei colori.

Ogni personaggio (del box, avversario del duello, eroe del torneo) ha un `aspetto`:

    {"sesso": "M"|"F", "capelli": "m3", "maglia": "tshirt", "pantaloni": "lunghi", "copricapo": "berretto"|None, "seed": 123456789}

Gli id vengono da `static/sprites/maschio/aspetto.json` (le capigliature hanno il tag di sesso M, F o unisex). I COLORI
non si salvano: li ricava il client dal `seed` (static/arena.js), campionando le texture `colori_capelli.png` e
`colori_vestiti.png`. Lo stesso seed dà sempre gli stessi colori, anche se un domani si ritoccano le texture.

`genera` evita di ripetere una combinazione (capelli, maglia, pantaloni, copricapo) gia' in uso: ogni personaggio ha la sua."""
import json
import os
import random

MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "sprites", "maschio", "aspetto.json")
_cache = {}
PROB_COPRICAPO = 0.4   # quanti personaggi portano un cappello o una maschera

# nomi propri del gioco (engine.NOMI_PROPRI) che sono femminili; tutti gli altri sono maschili
NOMI_FEMMINILI = {"Luna", "Nadia", "Zoe", "Mira", "Vera", "Nina", "Alba", "Greta", "Irene", "Petra", "Aida", "Cleo",
                  "Emma", "Gaia", "Iris", "Kira", "Maya", "Olga", "Rita", "Sasha", "Alessia", "Bianca", "Chiara",
                  "Diana", "Elena", "Fabiola", "Giulia", "Helena", "Ilaria", "Jessica", "Katia", "Lidia", "Martina",
                  "Noemi", "Ornella", "Paola", "Raffaella", "Silvia", "Teresa", "Ursula", "Valentina", "Wanda",
                  "Ximena", "Yasmin", "Zora", "Agnese", "Beatrice", "Camilla", "Dalia", "Eleonora", "Francesca",
                  "Gemma", "Hana", "Ines", "Jana", "Laila", "Marta", "Nora", "Ofelia", "Priya", "Rosa", "Selene",
                  "Tamara", "Uma", "Viola", "Amira", "Brigitte", "Carmen", "Dasha", "Esther", "Fatima", "Galina",
                  "Hilda", "Ingrid", "Jolanda", "Karin", "Leila", "Mei", "Nikita", "Oksana", "Paloma", "Renata",
                  "Sonia"}


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
    return (a.get("capelli"), a.get("maglia"), a.get("pantaloni"), a.get("copricapo"))


def scegli_copricapo(capelli, rng=random):
    """Un cappello o una maschera compatibile con la capigliatura (alcuni volumi escono dal cappello: `non_con`), o None."""
    if rng.random() >= PROB_COPRICAPO:
        return None
    ammessi = [c["id"] for c in manifesto().get("copricapo", []) if capelli not in c.get("non_con", [])]
    return rng.choice(ammessi) if ammessi else None


def completa(a, rng=random):
    """Salvataggi precedenti ai copricapo: l'aspetto non ha la chiave `copricapo`; la si tira una volta sola. True se ha cambiato."""
    if "copricapo" in a:
        return False
    a["copricapo"] = scegli_copricapo(a["capelli"], rng)
    return True


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
        ca = rng.choice(capelli)
        a = {"sesso": sesso, "capelli": ca, "maglia": rng.choice(man["maglie"])["id"],
             "pantaloni": rng.choice(man["pantaloni"])["id"], "copricapo": scegli_copricapo(ca, rng), "seed": rng.getrandbits(32)}
        if combinazione(a) not in visti and a["seed"] not in seeds:
            return a
    return a


def valido(a):
    """L'aspetto di un salvataggio e' usabile? (ids esistenti, sesso M/F, seed intero)."""
    if not isinstance(a, dict):
        return False
    man = manifesto()
    return (a.get("sesso") in ("M", "F") and isinstance(a.get("seed"), int)
            and (a.get("copricapo") is None or a["copricapo"] in {c["id"] for c in man.get("copricapo", [])})
            and a.get("capelli") in {c["id"] for c in man["capelli"]}
            and a.get("maglia") in {m["id"] for m in man["maglie"]}
            and a.get("pantaloni") in {p["id"] for p in man["pantaloni"]})
