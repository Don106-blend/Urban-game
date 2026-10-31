"""Fase 6: l'effetto della rivincita (v. NEMESI.md e nemesi.py). Chi ha perso l'ultimo incontro con un rivale parte con +1 ai tiri per colpire e ai
riflessi per qualche turno: stesso meccanismo degli altri bonus a tempo (`colpire` + `flat_risultato` sui riflessi). Idempotente."""
from datafix import carica, salva

NUOVO = {"Rivincita": {
    "descrizione": "Vuoi la rivincita: +1 ai tiri per colpire e ai riflessi.",
    "tipo": "modificatore", "tipo_danno": "", "split": False,
    "formula": {"dadi": [], "flat": 0, "mult": 1},
    "modificatori": [{"tipo": "colpire", "flat": 1}, {"tipo": "flat_risultato", "statistica": "riflessi", "valore": 1}]}}
effetti = carica("effects.json")
for nome, spec in NUOVO.items():
    corrente = next((e for e in effetti if e["nome"] == nome), None)
    if corrente is None:
        corrente = {"id": max(e["id"] for e in effetti) + 1, "nome": nome}
        effetti.append(corrente)
    corrente.update(spec)
salva("effects.json", effetti)
print("fase 6 dati: ok (" + ", ".join(NUOVO) + ")")
