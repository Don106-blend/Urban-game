"""Fase 2A dell'overhaul: porta ogni attacco nella fascia del suo SLOT di danno.

La potenza di un attacco dipende dal suo slot (rango di sblocco, cooldown, usi), non da chi
l'ha scritto (OVERHAUL_GAMEPLAY.md §5.5). Questo script e' la tabella: valori ASSOLUTI per
attacco, quindi e' riapplicabile (idempotente) dopo ogni giro di misure col harness.

    python tools/fase2_attacchi.py            # mostra il rapporto (nessuna scrittura)
    python tools/fase2_attacchi.py --applica  # scrive data/attacks.json

Fasce di slot (danno base senza margine, singolo bersaglio; il margine di un tiro vinto
aggiunge in media ~7) — la fascia del .md vale per la MISCHIA:
    slot      cooldown  mischia      split (totale)
    0 base    0         35-45        -
    1 r1/arma 0         70-90        120-150
    2 r2      0-1       90-120       150-190
    3 r3      1-2       120-160      190-240
    4 r4/ult  2-4       160-210      240-270

DISTANZA vs MISCHIA (trovato col harness, con una difesa competente): un colpo in mischia si
puo' PARARE — la parata dimezza il danno e il difensore sceglie dove incassarlo — uno a
distanza no. A pari danno i colpi a distanza vincevano molto di piu' (Scheggie da 140 rendeva
Pelle Invincibile imbattibile). Quindi: la mischia puo' salire fino al 15% sopra la fascia, il
singolo a distanza sta tra il 60% e l'80% della fascia (~ -30%). Gli split (area, non parabili,
spesso non schivabili) restano sulla fascia split. Un attacco multi-colpo conta il totale.

Regole fisse: nessun split sopra 270 totali; nessun ultimate senza cooldown; un attacco con
effetto nel tempo/debuff scala di ~10-15% (lo sconto e' ammesso sotto il minimo della fascia);
ogni attacco fuori fascia DEVE avere una motivazione (colonna MOTIVO).

Colonne: id -> (slot, danno per colpo, cooldown, motivo-se-fuori-fascia)
"""
import re
import sys

from datafix import carica, salva

FASCE = {0: ((35, 45), None), 1: ((70, 90), (120, 150)), 2: ((90, 120), (150, 190)),
         3: ((120, 160), (190, 240)), 4: ((160, 210), (240, 270))}
CD_FASCIA = {0: (0, 0), 1: (0, 0), 2: (0, 1), 3: (1, 2), 4: (2, 4)}
SCONTO_EFFETTO = 0.85   # un attacco con DoT/debuff puo' stare fino al 15% sotto il minimo
MISCHIA_SOPRA = 1.15    # la mischia (parabile) puo' superare del 15% il massimo della fascia
DISTANZA = (0.6, 0.8)   # il singolo a distanza sta tra il 60% e l'80% della fascia

# id: (slot, danno per colpo, cooldown, motivo)
TABELLA = {
    1:  (0, 40, 0, ""),                      # Pugno (base)
    2:  (1, 60, 0, "arma da 500¤ a 7 usi: ranged non parabile con munizioni limitate"),
    3:  (1, 110, 0, "unico colpo di Super Forza: sopra fascia (mischia parabile) e senza cooldown"),
    4:  (2, 85, 0, ""),
    5:  (3, 190, 1, ""),
    6:  (1, 100, 0, ""),
    7:  (3, 95, 1, ""),
    8:  (2, 150, 0, ""),
    9:  (1, 62, 0, ""),
    10: (4, 240, 3, ""),
    11: (1, 95, 0, ""),
    12: (2, 125, 0, ""),
    13: (4, 205, 2, ""),
    14: (1, 125, 0, ""),
    15:  (1, 70, 1, "debuff (affamare): cooldown 1 per non lanciarlo piu' volte nello stesso turno"),
    16:  (1, 70, 1, "debuff (affaticare): cooldown 1 per non lanciarlo piu' volte nello stesso turno"),
    17: (2, 150, 0, ""),
    18:  (1, 95, 0, ""),
    19:  (2, 80, 0, ""),
    20:  (1, 100, 0, ""),
    21:  (3, 95, 1, ""),
    22: (4, 250, 4, ""),
    23:  (3, 130, 0, "1 solo uso per duello con stordimento di 3 turni"),
    24: (2, 0, 5, "attacco speciale: scambia una statistica per 3 turni (nessun danno)"),
    25: (1, 60, 0, ""),
    26: (4, 150, 2, ""),
    27:  (1, 115, 1, "colpo di scudo: stordisce (-1 colpire, -1 sociale, -1 risposta) ed e' l'unico colpo di Campo di forza"),
    28: (1, 62, 0, ""),
    29: (2, 90, 1, ""),
    30: (4, 250, 2, ""),
    31: (1, 58, 0, ""),
    32: (2, 88, 1, ""),
    33: (4, 240, 2, ""),
    34: (1, 66, 0, ""),
    35: (2, 80, 2, "paralisi mentale (-1 azione per 2 turni): un controllo cosi' forte vuole cooldown 2"),
    36: (4, 240, 3, ""),
    37: (1, 95, 0, ""),
    38: (2, 92, 1, ""),
    39: (4, 205, 2, ""),
    40: (1, 100, 0, ""),
    41: (2, 150, 1, ""),
    42: (4, 250, 3, ""),
    43: (4, 250, 3, ""),
    44:  (2, 110, 1, ""),
    45: (1, 62, 0, ""),
    46: (2, 150, 1, ""),
    47: (4, 245, 2, ""),
    48:  (1, 40, 0, "Spada (150¤): lama con sanguinamento, deve valere il prezzo senza essere un'arma da fuoco"),
    49:  (1, 50, 0, "affondo perforante senza sanguinamento: alternativa al colpo di lama"),
    50:  (3, 140, 3, "EMP: l'effetto (augment/protesi spenti) e' il valore, il danno e' accessorio"),
    51: (0, 70, 0, "Colpo pesante: costa 2 azioni (35 per azione) e non e' parabile"),
    52:  (1, 55, 0, ""),
    53:  (3, 72, 1, ""),
    54: (1, 50, 0, ""),                      # Doppio pugno: 2 colpi x 50
    55: (3, 42, 2, ""),                      # Raffica a quattro braccia: 4 colpi x 42
    56: (1, 70, 0, ""),                      # Pugno cibernetico (Braccio prostetico)
}
# campi che lo script imposta oltre a danno/cooldown (id: {campo: valore})
EXTRA = {
    3:  {"skill_colpire": "fisico"},                  # Super Forza usava 'controllo' invece di 'fisico'
    15: {"tipo_danno": "magico"},                     # un attacco con danno non puo' essere 'nessuno'
    16: {"tipo_danno": "magico"},
    27: {"effetti_applicati": [{"effetto": 4, "turni": 1, "persistente": False}]},
}


def sorgenti():
    """id attacco -> rango minimo di sblocco da un potere (None se non e' di un potere)."""
    sblocco = {}
    for p in carica("powers.json"):
        for r, lst in p["attacchi"].items():
            for aid in lst:
                sblocco[aid] = min(sblocco.get(aid, 9), int(r))
    return sblocco


def fuori_fascia(slot, totale, cd, split, ranged, ha_effetto):
    (lo, hi), sp = FASCE[slot]
    if split:
        if sp is None:
            return "split in uno slot senza fascia split"
        lo, hi = sp
    elif ranged:
        lo, hi = lo * DISTANZA[0], hi * DISTANZA[1]
    else:
        hi = hi * MISCHIA_SOPRA
    if totale == 0:
        return ""
    sconto = SCONTO_EFFETTO if ha_effetto else 1.0
    if totale < lo * sconto or totale > hi:
        return f"danno {totale} fuori da {lo:.0f}-{hi:.0f}"
    c_lo, c_hi = CD_FASCIA[slot]
    if not c_lo <= cd <= c_hi:
        return f"cooldown {cd} fuori da {c_lo}-{c_hi}"
    return ""


def main():
    applica = "--applica" in sys.argv
    att = carica("attacks.json")
    sblocco = sorgenti()
    errori, righe = [], []
    for a in att:
        if a["id"] not in TABELLA:
            errori.append(f"attacco {a['id']} ({a['nome']}) non in tabella")
            continue
        slot, danno, cd, motivo = TABELLA[a["id"]]
        split = a.get("split_danni", False)
        ranged = a.get("ranged", False) and a.get("parabile", True)
        ha_effetto = bool(a.get("effetti_applicati")) or "effetti_applicati" in EXTRA.get(a["id"], {})
        totale = danno * max(1, a.get("colpi", 1))
        if a["id"] in sblocco and sblocco[a["id"]] != slot:
            errori.append(f"{a['id']} {a['nome']}: slot {slot} ma sbloccato a r{sblocco[a['id']]}")
        if split and totale > 270:
            errori.append(f"{a['id']} {a['nome']}: split sopra 270 totali")
        if slot == 4 and cd == 0:
            errori.append(f"{a['id']} {a['nome']}: ultimate senza cooldown")
        problema = fuori_fascia(slot, totale, cd, split, ranged, ha_effetto)
        if problema and not motivo:
            errori.append(f"{a['id']} {a['nome']}: {problema} senza motivazione")
        tipo = "split" if split else ("ranged" if ranged else "mischia")
        if a.get("colpi", 1) > 1:
            tipo += f" x{a['colpi']}"
        righe.append((a["id"], a["nome"], slot, a["danno"]["flat"], danno,
                      a.get("cooldown_turni", 0), cd, tipo, problema and motivo))
        a["danno"]["flat"] = danno
        a["cooldown_turni"] = cd
        for k, v in EXTRA.get(a["id"], {}).items():
            a[k] = v
        # le descrizioni scritte a mano con "Danno base: N" restano coerenti col dato
        if "Danno base:" in a.get("descrizione", ""):
            a["descrizione"] = re.sub(r"Danno base: \d+", f"Danno base: {danno}", a["descrizione"])
    print(f"{'id':>3} {'attacco':<28}{'slot':>4} {'danno':>11} {'cd':>6}  tipo       note")
    for i, n, s, d0, d1, c0, c1, tp, mot in righe:
        mod = "" if (d0, c0) == (d1, c1) else "*"
        print(f"{i:>3} {n:<28}{s:>4} {d0:>5}->{d1:<5} {c0:>2}->{c1:<2} {tp:<10}{mod} {mot}")
    if errori:
        print("\nERRORI:")
        for e in errori:
            print("  -", e)
        sys.exit(1)
    if applica:
        salva("attacks.json", att)
        print("\nscritto data/attacks.json")
    else:
        print("\n(nessuna scrittura: usa --applica)")


if __name__ == "__main__":
    main()
