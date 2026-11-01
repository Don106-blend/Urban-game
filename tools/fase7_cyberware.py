"""Fase 7: niente piu' armi e armature, solo cyberware (v. CYBERWARE.md). Pistola, Spada, Giubbotto, Casco e Armatura da combattimento
diventano protesi e augment: stesso effetto in combattimento e stesso prezzo, ma ora occupano un posto nel corpo e costano Umanita'.
Idempotente: riesegue solo aggiornando i cinque oggetti nuovi (per nome); toglie equipment.json e armor.json."""
import copy
import os

from datafix import DATA, carica, per_id, salva

RANGHI = ("1", "2", "3", "4")


def vuoto():
    return {r: [] for r in RANGHI}


def augment(nome, descrizione, valore, umanita, effetti=(), attacchi=(), stance=()):
    return {"nome": nome, "descrizione": descrizione, "valore": valore, "costo_umanita": umanita, "attivo": False, "costo_stamina": 0,
            "durata_turni": 0, "usi_limitati": False, "usi_massimi": 1,
            "effetti": {**vuoto(), "1": list(effetti)}, "effetti_nel_tempo": vuoto(),
            "attacchi": {**vuoto(), "1": list(attacchi)}, "stance": {**vuoto(), "1": list(stance)}, "stance_attivate": vuoto()}


AUGMENT = [
    augment("Lama monomolecolare", "Impianto passivo: una lama retrattile nell'avambraccio. Sblocca il colpo di taglio con sanguinamento e l'affondo perforante.",
            150, 1, attacchi=(48, 49)),
    augment("Calotta in titanio", "Impianto passivo: calotta sotto il cuoio capelluto. +15 hp di armatura sulla testa e -10% ai danni contundenti.",
            150, 1, effetti=({"tipo": "armatura", "dadi": [], "flat": 15, "mult": 1, "locazione": "testa"},
                             {"tipo": "resistenza", "tipo_danno": "contundente", "valore": 10})),
    augment("Sottopelle balistico", "Impianto passivo: fibre balistiche sul torace. +50 hp di armatura sul busto e -20% ai danni perforanti.",
            200, 2, effetti=({"tipo": "armatura", "dadi": [], "flat": 50, "mult": 1, "locazione": "busto"},
                             {"tipo": "resistenza", "tipo_danno": "perforante", "valore": 20})),
    augment("Esoscheletro da combattimento", "Impianto passivo: un esoscheletro sotto la pelle che copre tutto il corpo. +10 hp di armatura per locazione, "
            "-8% ai danni contundenti e la stance Corazza.",
            600, 4, effetti=({"tipo": "armatura", "dadi": [], "flat": 10, "mult": 1},
                             {"tipo": "resistenza", "tipo_danno": "contundente", "valore": 8}), stance=(17,)),
]
PROTESI = [{"nome": "Braccio-cannone", "descrizione": "Sostituisce il braccio sinistro con una canna integrata (120 hp, mai CRIPPLED): "
            "spara colpi a distanza (non si parano), 7 colpi per duello.", "valore": 500, "locazione": "braccio_sx", "hp": 120,
            "costo_umanita": 2, "attacchi": [2], "stance": [], "stance_attivate": [], "effetti_nel_tempo": []},
          {"nome": "Gamba corazzata", "descrizione": "Sostituisce la gamba destra con una struttura rinforzata (250 hp, mai CRIPPLED): la stance Barriera sempre attiva: -20% a tutti i danni subiti.", "valore": 300, "locazione": "gamba_dx", "hp": 250,
           "costo_umanita": 1, "attacchi": [], "stance": [], "stance_attivate": [32], "effetti_nel_tempo": []}]


def aggiorna(file, nuovi):
    dati = carica(file)
    for n in nuovi:
        corrente = next((x for x in dati if x["nome"] == n["nome"]), None)
        if corrente is None:
            corrente = {"id": max(x["id"] for x in dati) + 1}
            dati.append(corrente)
        corrente.update(copy.deepcopy(n))
    salva(file, dati)


aggiorna("augments.json", AUGMENT)
aggiorna("protesi.json", PROTESI)
for vecchio in ("equipment.json", "armor.json"):
    if os.path.exists(os.path.join(DATA, vecchio)):
        os.remove(os.path.join(DATA, vecchio))
print("fase 7 dati: ok (" + ", ".join(n["nome"] for n in AUGMENT + PROTESI) + ")")
