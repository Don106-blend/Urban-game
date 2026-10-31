"""Fase 5: gli effetti del gambling (v. AZZARDO.md e azzardo.py).

Gli azzardi in combattimento (Ruota della Folla, Raddoppia, Ultima Puntata) e le reazioni del pubblico (Ovazione) danno
bonus e malus a tempo con lo stesso meccanismo di tutti gli altri effetti: un +/- al tiro per colpire (`colpire`) e ai riflessi
(`flat_risultato`), che e' la difesa che non costa la risposta. Un pip vale un rango (scala 0/1/2/3). Gli effetti stanno in
`effects.json`, quindi si leggono e si ritoccano dall'editor come gli altri. Idempotente: un effetto gia' presente (per nome)
viene aggiornato, non duplicato."""
from datafix import carica, salva


def pip(n, descrizione):
    """Un effetto che sposta di `n` pip i tiri per colpire e i riflessi di chi lo porta."""
    return {
        "descrizione": descrizione,
        "tipo": "modificatore", "tipo_danno": "", "split": False,
        "formula": {"dadi": [], "flat": 0, "mult": 1},
        "modificatori": [{"tipo": "colpire", "flat": n},
                         {"tipo": "flat_risultato", "statistica": "riflessi", "valore": n}],
    }


NUOVI = {
    "Incitamento": pip(1, "La folla ti spinge: +1 ai tiri per colpire e ai riflessi."),
    "Boato": pip(2, "La folla ruggisce: +2 ai tiri per colpire e ai riflessi."),
    "Ovazione": pip(1, "Il pubblico e' in piedi per te: +1 ai tiri per colpire e ai riflessi."),
    "Furia": pip(2, "Una scarica di adrenalina: +2 ai tiri per colpire e ai riflessi."),
    "Fischi": pip(-1, "Il pubblico ti fischia: -1 ai tiri per colpire e ai riflessi."),
    "Sfiga nera": pip(-2, "Oggi non e' la tua serata: -2 ai tiri per colpire e ai riflessi."),
    "Esposto": {
        "descrizione": "Ti sei scoperto con un colpo azzardato: -1 ai riflessi (si somma).",
        "tipo": "modificatore", "tipo_danno": "", "split": False,
        "formula": {"dadi": [], "flat": 0, "mult": 1},
        "modificatori": [{"tipo": "flat_risultato", "statistica": "riflessi", "valore": -1}],
    },
}

effetti = carica("effects.json")
for nome, spec in NUOVI.items():
    corrente = next((e for e in effetti if e["nome"] == nome), None)
    if corrente is None:
        corrente = {"id": max(e["id"] for e in effetti) + 1, "nome": nome}
        effetti.append(corrente)
    corrente.update(spec)
salva("effects.json", effetti)
print("fase 5 dati: ok (" + ", ".join(NUOVI) + ")")
