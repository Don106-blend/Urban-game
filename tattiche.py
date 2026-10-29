"""Tattiche: il gioco registra gli incontri e le scelte del giocatore, la CPU ne impara le tattiche.

Due pezzi, entrambi senza Flask (si provano da soli, v. test_combat.py):

* Registratore: durante un duello raccoglie ogni DECISIONE del giocatore (mira, attacco, potere,
  stance, fine turno, risposta a un colpo) con il contesto in cui l'ha presa, in particolare le
  OCCASIONI (poteva mirare? aveva un potere da accendere?): un "non l'ho fatto" vale quanto un "l'ho
  fatto". A duello chiuso l'incontro intero finisce in `save/incontri.jsonl`, una riga per incontro.
* Modello: statistiche pesate sugli ultimi incontri registrati. Un incontro vinto pesa piu' di uno
  perso (le tattiche che vincono sono quelle da copiare); gli incontri piu' vecchi sono dimenticati.
  La CPU lo usa in tre modi, tutti graduali (la fiducia cresce con i dati, mai oltre FIDUCIA_MAX):
    1. imita: mira, potere, stance e "attacco migliore" scivolano verso le frequenze del giocatore
       (nelle stesse occasioni), sopra le manopole del profilo (che arrivano dai survey);
    2. contrasta: sceglie di piu' gli attacchi che aggirano la sua difesa preferita (non schivabili
       contro chi schiva sempre, a distanza o non parabili contro chi para sempre);
    3. copia le abitudini: dove mira, e come risponde ai colpi (quando la stima del valore atteso non
       dice che e' letale).
Senza abbastanza incontri (MIN_INCONTRI) il modello e' neutro: la CPU si comporta come prima."""
import json
import os
import random
import time

PESO_VITTORIA = 1.0     # quanto conta una decisione presa in un incontro vinto...
PESO_SCONFITTA = 0.5    # ...e in uno perso
ULTIMI_INCONTRI = 150   # il modello ricorda solo gli ultimi: il giocatore cambia
MIN_INCONTRI = 3        # sotto questa soglia il modello non influenza la CPU
MIN_AZIONI = 3          # un incontro con meno scelte (abbandonato subito) non si registra
MAX_AZIONI = 600        # tetto per incontro (il file resta leggibile)
K_FIDUCIA = 25.0        # campioni pesati a cui la fiducia arriva a meta' del massimo
FIDUCIA_MAX = 0.6       # quanto, al massimo, il modello sposta una probabilita'
PROB_COPIA_RISPOSTA = 0.5  # (x fiducia) con che probabilita' la CPU risponde "come farebbe il giocatore"
FORZA_CONTRASTO = 0.8   # (x fiducia x tendenza) di quanto pesa di piu' un attacco che aggira la difesa preferita

# decisioni su cui il modello misura il tasso "scelto / occasioni"
TASSI = ("mira", "potere", "stance", "migliore")
LOCAZIONI_BERSAGLIO = ("testa", "busto", "braccio_sx", "braccio_dx", "gamba_sx", "gamba_dx")


def tipo_attacco(att):
    """Come arriva un colpo, dal punto di vista di chi lo subisce: "distanza" (non si para) o "mischia"."""
    return "distanza" if att.get("ranged") else "mischia"


# ---------------------------------------------------------------------------------------------- registro
class Registratore:
    """Le scelte del giocatore in un duello. `azioni` e' una lista di dict piccoli e serializzabili."""

    def __init__(self, modo="duello"):
        self.modo = modo
        self.azioni = []
        self.t0 = time.time()

    def azione(self, k, round_, occ=None, **dati):
        if len(self.azioni) >= MAX_AZIONI:
            return
        a = {"k": k, "r": round_}
        if occ:
            a["occ"] = {c: int(bool(v)) for c, v in occ.items()}
        a.update(dati)
        self.azioni.append(a)

    def incontro(self, vittoria, round_, giocatore, cpu, hp_giocatore, hp_cpu):
        """L'incontro da scrivere su file; None se il giocatore ha fatto troppo poco per dirne qualcosa."""
        if len(self.azioni) < MIN_AZIONI:
            return None
        return {"ts": round(self.t0), "modo": self.modo, "vittoria": bool(vittoria), "round": round_,
                "giocatore": giocatore, "cpu": cpu, "hp": [round(hp_giocatore, 2), round(hp_cpu, 2)],
                "azioni": self.azioni}


def salva_incontro(percorso, incontro):
    os.makedirs(os.path.dirname(percorso) or ".", exist_ok=True)
    with open(percorso, "a", encoding="utf-8") as f:
        f.write(json.dumps(incontro, ensure_ascii=False, separators=(",", ":")) + "\n")


def carica_incontri(percorso, ultimi=ULTIMI_INCONTRI):
    """Gli ultimi `ultimi` incontri del file (righe rovinate ignorate: il file e' solo un archivio)."""
    if not os.path.exists(percorso):
        return []
    righe = []
    with open(percorso, encoding="utf-8") as f:
        for riga in f:
            try:
                righe.append(json.loads(riga))
            except ValueError:
                continue
    return righe[-ultimi:]


# ---------------------------------------------------------------------------------------------- modello
class Modello:
    def __init__(self, incontri=()):
        self.incontri = []
        self._ricalcola()
        for inc in incontri:
            self.aggiungi(inc)

    def aggiungi(self, inc):
        self.incontri.append(inc)
        del self.incontri[:-ULTIMI_INCONTRI]
        self._ricalcola()

    # ---- statistiche
    def _ricalcola(self):
        self.tassi = {c: [0.0, 0.0] for c in TASSI}       # [scelto, occasioni] pesati
        self.risp = {}      # tipo di colpo -> scelta -> peso
        self.disp = {}      # tipo di colpo -> scelta -> peso delle volte in cui era possibile
        self.loc_mira = {}  # locazione -> peso
        self.n_risposte = 0.0
        for inc in self.incontri:
            w = PESO_VITTORIA if inc.get("vittoria") else PESO_SCONFITTA
            for a in inc.get("azioni", []):
                k, occ = a.get("k"), a.get("occ", {})
                for c in ("mira", "potere", "stance"):
                    if occ.get(c):
                        self.tassi[c][1] += w
                        if k == c or (c == "potere" and k == "augment"):
                            self.tassi[c][0] += w
                if k == "attacco" and "best" in a:
                    self.tassi["migliore"][1] += w
                    self.tassi["migliore"][0] += w * (1 if a["best"] else 0)
                if k == "mira" and a.get("loc"):
                    self.loc_mira[a["loc"]] = self.loc_mira.get(a["loc"], 0.0) + w
                if k == "risposta":
                    t = a.get("t", "mischia")
                    self.n_risposte += w
                    self.risp.setdefault(t, {})[a["scelta"]] = self.risp.get(t, {}).get(a["scelta"], 0.0) + w
                    for o in a.get("opz", []):
                        self.disp.setdefault(t, {})[o] = self.disp.get(t, {}).get(o, 0.0) + w

    @property
    def pronto(self):
        return len(self.incontri) >= MIN_INCONTRI

    @staticmethod
    def fiducia(campioni):
        return FIDUCIA_MAX * campioni / (campioni + K_FIDUCIA)

    # ---- 1. imitazione
    def tasso(self, chiave):
        """(frequenza con cui il giocatore sceglie `chiave` quando puo', occasioni pesate)."""
        s, o = self.tassi[chiave]
        return (s / o if o else 0.0), o

    def fondi(self, base, chiave):
        """`base` (manopola del profilo) spostata verso la frequenza del giocatore, quanto dicono i dati."""
        if not self.pronto:
            return base
        rate, n = self.tasso(chiave)
        w = self.fiducia(n)
        return base * (1 - w) + rate * w

    # ---- 2. contrasto
    def tendenza(self, tipo, scelta):
        """Quanto spesso il giocatore risponde `scelta` a un colpo di questo tipo quando puo' (0..1)."""
        d = self.disp.get(tipo, {}).get(scelta, 0.0)
        return self.risp.get(tipo, {}).get(scelta, 0.0) / d if d else 0.0

    def moltiplicatore_attacco(self, att):
        """>1 per gli attacchi che aggirano la risposta preferita del giocatore: non schivabili
        contro chi schiva, a distanza/non parabili contro chi para."""
        if not self.pronto:
            return 1.0
        t = tipo_attacco(att)
        w = self.fiducia(self.n_risposte) * FORZA_CONTRASTO
        m = 1.0
        if not att.get("can_dodge", True):
            m += w * self.tendenza("mischia", "schivata") * 0.5 + w * self.tendenza("distanza", "schivata") * 0.5
        if att.get("ranged") or not att.get("parabile", True):
            m += w * self.tendenza("mischia", "parata")
        return m

    # ---- 3. abitudini
    def scegli_locazione(self, ammesse, rng=random):
        """Dove mira il giocatore (pesato), tra le locazioni `ammesse`; None se non ce ne sono dati."""
        pesi = [(l, self.loc_mira.get(l, 0.0)) for l in ammesse]
        tot = sum(p for _, p in pesi)
        if not self.pronto or tot <= 0 or rng.random() >= self.fiducia(tot) / FIDUCIA_MAX * 0.5:
            return None
        return rng.choices([l for l, _ in pesi], [p for _, p in pesi])[0]

    def scegli_risposta(self, tipo, opzioni, rng=random):
        """Una risposta "alla maniera del giocatore" (campionata dalle sue frequenze), o None se non
        ce n'e' abbastanza o il caso dice di fare altro."""
        if not self.pronto or len(opzioni) < 2:
            return None
        hist = self.risp.get(tipo, {})
        pesi = [(o, hist.get(o, 0.0)) for o in opzioni]
        tot = sum(p for _, p in pesi)
        if tot <= 0 or rng.random() >= self.fiducia(tot) * PROB_COPIA_RISPOSTA / FIDUCIA_MAX:
            return None
        return rng.choices([o for o, _ in pesi], [p for _, p in pesi])[0]

    # ---- cosa ha imparato, in chiaro
    def sommario(self):
        out = {"incontri": len(self.incontri), "attivo": self.pronto,
               "vittorie": sum(1 for i in self.incontri if i.get("vittoria")), "tassi": {}}
        for c in TASSI:
            rate, n = self.tasso(c)
            out["tassi"][c] = {"frequenza": round(rate, 2), "occasioni": round(n, 1),
                               "fiducia": round(self.fiducia(n), 2)}
        out["risposte"] = {t: {s: round(self.tendenza(t, s), 2) for s in self.disp.get(t, {})} for t in self.disp}
        tot = sum(self.loc_mira.values())
        out["mira"] = {l: round(p / tot, 2) for l, p in sorted(self.loc_mira.items(), key=lambda x: -x[1])} if tot else {}
        return out
