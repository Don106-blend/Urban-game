"""Fase 2C dell'overhaul: equipaggiamento (armi, armature, protesi, augment) in fascia.

Obiettivo (OVERHAUL_GAMEPLAY.md §8): ogni oggetto vince 58-72% contro un eroe nudo a ranghi
pari, il guadagno cresce col prezzo (non con la fantasia), nessuno sopra il 75% o sotto il 55%;
il prezzo di un'armatura pesa la locazione (testa >> busto > arti) perche' e' la testa a decidere.

    python tools/fase2_oggetti.py && python tools/fase2_attacchi.py --applica
    python balance.py equip --n 6000

Idempotente (valori assoluti). Cosa e' stato trovato col harness:
  * il Casco da lotta con resistenza FLAT azzerava il Pugno sulla testa (98%): ora percentuale;
  * la Retina Cibernetica sostituiva la testa con 50 hp, ma la testa base e' ora 80: era un
    peggioramento; lo Stabilizzatore di genoma dava +2 stamina, inutile a chi non ha poteri;
  * contro un difensore competente la parata dimezza i colpi in mischia: le armi a distanza
    (Pistola) e i colpi sovrumani del Braccio prostetico guadagnavano troppo;
  * l'EMP (attivato 1 turno, 4 stamina) costava piu' di quanto rendeva contro chi non ha
    augment: ora dura 3 turni, costa 1 stamina e ha 2 usi.
"""
import sys

from datafix import carica, salva

eq = carica("equipment.json")
ar = carica("armor.json")
pr = carica("protesi.json")
ag = carica("augments.json")
att = carica("attacks.json")
st = carica("stances.json")


def per_nome(lista, nome):
    return next(x for x in lista if x["nome"] == nome)


def nuovo_attacco(i, **campi):
    base = {"id": i, "descrizione": "", "ranged": False, "can_aim": True, "can_dodge": True,
            "attivo_default": False, "tipo_danno": "contundente",
            "danno": {"dadi": [], "flat": 0, "mult": 1}, "sostituisce": None,
            "effetti_applicati": [], "split_danni": False, "skill_colpire": None,
            "cooldown_turni": 0, "usi_limitati": False, "usi_massimi": 1, "colpi": 1,
            "costo_azioni": 1}
    esistente = next((a for a in att if a["id"] == i), None)
    flat = campi.pop("danno", None)
    base.update(campi)
    if flat is not None:
        base["danno"] = {"dadi": [], "flat": flat, "mult": 1}
    if esistente is None:
        att.append(base)
    else:  # danno/cooldown li decide tools/fase2_attacchi.py
        esistente.update({k: v for k, v in base.items() if k not in ("danno", "cooldown_turni")})


# ===================================================================== armi
per_nome(eq, "Pistola")["descrizione"] = ("Una pistola comune: colpo a distanza (non si para), "
                                          "7 colpi per duello.")
per_nome(eq, "Spada")["descrizione"] = ("Una lama: colpo di taglio con sanguinamento e affondo "
                                        "perforante.")

# ===================================================================== armature
# Casco da lotta: la locazione che uccide; resistenza in percentuale (era 25 flat = 98%)
c = per_nome(ar, "Casco da lotta")
c["armatura_hp"] = 15
c["resistenze"] = [{"tipo_danno": "contundente", "valore": 10}]
c["valore"] = 150
c["descrizione"] = "Protegge la testa: +15 hp di armatura e -10% ai danni contundenti."
# Giubbotto: busto 50 hp + perforante 20% (a 40 hp rendeva meno di un Casco da 150¤)
g = per_nome(ar, "Giubbotto antiproiettile")
g["armatura_hp"], g["valore"] = 50, 200
g["resistenze"] = [{"tipo_danno": "perforante", "valore": 20}]
g["descrizione"] = "Protegge il busto: +50 hp di armatura e -20% ai danni perforanti."
# Armatura da combattimento: tutto il corpo; la stance Corazza (hp = d(controllo) x 8)
a = per_nome(ar, "Armatura da combattimento")
a["armatura_hp"] = 10
a["resistenze"] = [{"tipo_danno": "contundente", "valore": 8}]
a["valore"] = 600
a["descrizione"] = ("Corazza pesante che copre tutto il corpo: +10 hp di armatura per locazione, "
                    "-8% ai danni contundenti e la stance Corazza.")
corazza = next(s for s in st if s["id"] == 17)
corazza["modificatori"][0]["mult"] = 8
corazza["descrizione"] = ("Ti copri di armatura: hp extra (1 dado controllo x8) finché dura la "
                          "stance.")

# ===================================================================== protesi
# Braccio prostetico: 200 hp e un pugno cibernetico (70, mischia); Gamba: riflessi aumentati
# PERMANENTI; Retina: testa da 100 hp (la testa base e' 80) + mira migliorata.
nuovo_attacco(56, nome="Pugno cibernetico", descrizione="Un pugno meccanico, preciso e pesante.",
              sostituisce=1, tipo_danno="contundente", skill_colpire="fisico", danno=70)
b = per_nome(pr, "Braccio prostetico")
b["hp"] = 200
b["attacchi"] = [56]
b["descrizione"] = ("Sostituisce completamente il braccio (200 hp, mai CRIPPLED): colpisce più "
                    "forte con il Pugno cibernetico.")
g = per_nome(pr, "Gamba prostetica")
g["stance"], g["stance_attivate"] = [], [11]
g["descrizione"] = ("Sostituisce completamente la gamba: servomotori per riflessi più rapidi "
                    "(-1 al tiro per colpire di chi ti attacca).")
r = per_nome(pr, "Retina Cybernetica")
r["hp"] = 100
r["descrizione"] = ("Sostituisce l'occhio e rinforza la testa (100 hp): +1 al tuo tiro per "
                    "colpire.")

# ===================================================================== augment
a = per_nome(ag, "spine celate")
a["effetti"]["1"] = [{"tipo": "armatura", "dadi": [], "flat": 30, "mult": 1}]
a["descrizione"] = ("Spine retrattili: +30 hp di armatura per locazione e chi ti colpisce "
                    "sanguina. Si attiva (2 usi).")
# Stabilizzatore di genoma: rigenerazione (la stamina serviva solo a chi ha poteri)
a = per_nome(ag, "Stabilizzatore di genoma")
a["effetti_nel_tempo"]["1"] = [{"effetto": 2, "turni": 4, "persistente": False}]
a["durata_turni"] = 0
a["descrizione"] = ("Stabilizza il corpo: rigenera 15 hp per locazione all'inizio di ogni turno "
                    "per 4 turni (1 uso).")
a = per_nome(ag, "Iniettore di Adrenalina")
a["effetti"]["1"] = [{"tipo": "azioni", "azioni": 2, "bonus": 0, "risposte": 0}]
a["durata_turni"], a["costo_stamina"] = 3, 2
a["descrizione"] = ("Una scarica di adrenalina sintetica: +2 azioni extra ogni turno per 3 turni "
                    "(2 usi).")
a = per_nome(ag, "Generatore di scudi Mk-1")
a["effetti"]["1"] = [{"tipo": "armatura", "dadi": [], "flat": 30, "mult": 1}]
a["descrizione"] = "Genera uno scudo: +30 hp di armatura per locazione per 4 turni (1 uso)."
a = per_nome(ag, "E.M.P")
a["costo_stamina"], a["durata_turni"], a["usi_massimi"] = 1, 3, 2
a["descrizione"] = ("Impulso elettromagnetico: sblocca il colpo EMP per 3 turni (2 usi), che "
                    "spegne augment e protesi dell'avversario.")

if "--dry" not in sys.argv:
    effetti = carica("effects.json")
    for e in effetti:
        if e["id"] == 2:
            e["formula"]["flat"] = 15
            e["descrizione"] = "Cura 15 hp a tutte le locazioni all'inizio di ogni turno."
    salva("effects.json", effetti)
    salva("equipment.json", eq)
    salva("armor.json", ar)
    salva("protesi.json", pr)
    salva("augments.json", ag)
    salva("attacks.json", att)
    salva("stances.json", st)
    print("fase 2C oggetti: ok")
