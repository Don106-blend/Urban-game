"""Fase 0.3 + 1B + 1D dell'overhaul: ritocchi ai dati per la nuova scala dei ranghi
(0/1/2/3: un pip vale un rango intero) e per le resistenze in percentuale.
Eseguire UNA volta (e' idempotente: riscrive valori assoluti, non delta)."""
from datafix import carica, salva, per_id

# ---- stance -------------------------------------------------------------------------
st = carica("stances.json")


def mod(stance, tipo):
    return next(m for m in stance["modificatori"] if m["tipo"] == tipo)


# 1B: i modificatori in pip si dividono per ~2-3 (minimo 1): un pip ora vale un rango
mod(per_id(st, 11), "colpire_avversario")["flat"] = -1           # Riflessi Aumentati -2 -> -1
mod(per_id(st, 12), "colpire_avversario")["flat"] = -2           # Riflessi Fulminei  -5 -> -2
per_id(st, 11)["descrizione"] = ("I tuoi riflessi sono aumentati, sei più difficile da colpire: "
                                 "-1 al tiro per colpire dell'avversario.")
per_id(st, 12)["descrizione"] = ("Sei estremamente rapido e pronto a tutto: -2 al tiro per "
                                 "colpire dell'avversario per un turno.")

# 0.3: stance 16 'Resistenza' era inerte (valore 0): 25% a ogni tipo di danno per 2 turni
s16 = per_id(st, 16)
mod(s16, "resistenza")["valore"] = 25
s16["descrizione"] = "Il corpo regge i colpi: -25% a tutti i danni subiti finché dura la stance."

# 0.3: 29/31 usavano colpire_avversario POSITIVO, che *aumenta* il tiro di chi attacca il
# possessore (l'opposto di quanto dicono le descrizioni): sono bonus al proprio tiro
s29 = per_id(st, 29)
m29 = mod(s29, "colpire_avversario")
m29["tipo"], m29["flat"] = "colpire_proprio", 1
s29["descrizione"] = "La tua mira è finalmente decente: +1 al tuo tiro per colpire."
s30 = per_id(st, 30)
m30 = mod(s30, "colpire_avversario")
m30["tipo"], m30["flat"] = "colpire_proprio", 1                # era un no-op (flat 0)
s30["descrizione"] = "Occhio attento: +1 al tuo tiro per colpire."
s31 = per_id(st, 31)
m31 = mod(s31, "colpire_avversario")
m31["tipo"], m31["flat"] = "colpire_proprio", 2
s31["descrizione"] = "Cecchino: +2 al tuo tiro per colpire."
salva("stances.json", st)

# ---- effetti ------------------------------------------------------------------------
ef = carica("effects.json")
e4 = per_id(ef, 4)
next(m for m in e4["modificatori"] if m["tipo"] == "colpire")["flat"] = -1   # Stordimento -2 -> -1
e4["descrizione"] = ("Abbassa di un rango il dado sociale, dà -1 a tutti i tiri per colpire "
                     "e toglie una risposta.")
salva("effects.json", ef)

# ---- armature: resistenze in percentuale (1D) ----------------------------------------
ar = carica("armor.json")
casco = per_id(ar, 3)
casco["resistenze"][0]["valore"] = 15       # 25 flat (azzerava il Pugno) -> 15%
casco["valore"] = 150                       # colpisce la locazione che uccide: costa di piu'
casco["descrizione"] = "Protegge la testa: +25 hp di armatura e -15% ai danni contundenti."
comb = per_id(ar, 2)
comb["resistenze"][0]["valore"] = 10        # 5 flat -> 10%
giub = per_id(ar, 1)
giub["resistenze"][0]["valore"] = 20        # 10 flat -> 20% (perforante)
salva("armor.json", ar)
print("fase 1 dati: ok")
