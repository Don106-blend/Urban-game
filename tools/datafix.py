"""Utilita' comuni per ritoccare data/*.json con script riproducibili.
Scrive nello stesso formato dell'editor (indent=2, ensure_ascii=False), cosi' un ritocco
fatto da script e uno fatto dall'editor non producono differenze di formattazione."""
import json
import os

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def carica(nome):
    with open(os.path.join(DATA, nome), encoding="utf-8") as f:
        return json.load(f)


def salva(nome, dati):
    # i record restano ordinati per id (l'editor assegna id crescenti): l'ordine non dipende
    # da quale script ha creato un record per primo
    if isinstance(dati, list) and all(isinstance(x, dict) and "id" in x for x in dati):
        dati = sorted(dati, key=lambda x: x["id"])
    with open(os.path.join(DATA, nome), "w", encoding="utf-8") as f:
        json.dump(dati, f, ensure_ascii=False, indent=2)


def per_id(lista, i):
    return next(x for x in lista if x["id"] == i)
