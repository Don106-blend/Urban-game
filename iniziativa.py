"""Urban — l'iniziativa degli atleti sul ring: ogni tanto il tuo combattente non ti ascolta, o fa qualcosa di sua testa.

Dare ordini da bordo ring non e' controllo totale. A ogni "occasione" (inizio del suo turno, un attacco che gli ordini, una risposta
che gli chiedi, un colpo che prende o che dà) c'e' una probabilita' che l'atleta decida da solo: cambia l'attacco, sposta la mira,
si mette in guardia, non si copre, si lascia prendere dalla furia... Cosa fa dipende dal suo TRATTO di carattere (data/iniziative.json:
almeno cinque eventi per tratto); quanto spesso dipende da quanto si fida di te e da quanto e' sotto stress:

    propensione = 0.65 * (1 - fiducia/100) + 0.35 * stress/100         (0 = ti ascolta sempre, 1 = fa quello che vuole)
    probabilita = P_MAX * propensione * (moltiplicatore "iniziativa" dei tratti)

Piu' fiducia e meno stress = meno iniziativa. Al massimo UNA iniziativa per round (non si accavallano), e solo per il combattente
della palestra (non nel Torneo Evo, non nel Compendio: li' non ci sono fiducia e stress).

Logica pura: niente Flask. Parla col duello (app.DuelloWeb) solo tramite gli attributi che gli passa il chiamante.
I punti di aggancio sono quattro: `turno()`, `attacco()`, `risposta()`, `dopo_colpo()`."""
import random

import palestra
from engine import ARTI, carica, costo_azioni

DATI = carica("iniziative.json")
EVENTI = DATI.get("tratti", {}) if isinstance(DATI, dict) else {}
# probabilita' di base al massimo di propensione (fiducia 0, stress 100): con fiducia 50 e stress 0 vale ~15%, con fiducia 90 ~3%
P_MAX = 0.45
P_TETTO = 0.7
PROPENSIONE_FIDUCIA, PROPENSIONE_STRESS = 0.65, 0.35
# non tutte le occasioni pesano uguale: l'inizio del turno e' la piu' naturale, un ordine disatteso la meno
PESO_FASE = {"turno": 1.0, "attacco": 0.6, "risposta": 0.8, "colpito": 0.8, "colpisce": 0.8}
QUANDO = tuple(PESO_FASE)
OPERAZIONI = ("mira", "senza_mira", "attacco", "effetto", "stance", "azioni", "stamina", "risposta", "salta", "cura", "danno")


def propensione(rec):
    """Quanto questo atleta e' incline a fare di testa sua, 0..1: poca fiducia e tanto stress."""
    f = min(100, max(0, rec.get("fiducia", 50))) / 100
    s = min(100, max(0, rec.get("stress", 0))) / 100
    return PROPENSIONE_FIDUCIA * (1 - f) + PROPENSIONE_STRESS * s


def probabilita(rec):
    """La probabilita' base (0..P_TETTO) che a un'occasione l'atleta agisca di testa sua."""
    return round(min(P_TETTO, P_MAX * propensione(rec) * palestra.moltiplicatore(rec, "iniziativa")), 3)


def eventi_di(rec):
    """Gli eventi possibili per questo atleta: quelli di ognuno dei suoi tratti (ciascuno porta con se' il tratto)."""
    return [dict(e, tratto=t) for t in rec.get("tratti", []) for e in EVENTI.get(t, [])]


def _frazione_hp(p):
    return sum(max(0, p.hp[l]) for l in p.hp) / max(1, sum(p.hp_max.values()))


class Iniziativa:
    def __init__(self, duello, rec):
        self.d = duello
        self.rec = rec
        self.eventi = eventi_di(rec)
        self.ultimo_round = 0     # l'ultimo round in cui e' successo qualcosa: al massimo una iniziativa per round
        self.note = []            # le iniziative che hanno cambiato l'azione in corso: la scheda del colpo le mostra

    # ---------- cosa si vede ----------
    def info(self):
        """Per il pannello del giocatore: la probabilita' di adesso e da cosa dipende."""
        return {"p": round(probabilita(self.rec) * 100), "fiducia": self.rec.get("fiducia", 50), "stress": self.rec.get("stress", 0),
                "tratti": [palestra.TRATTI[t]["nome"] for t in self.rec.get("tratti", []) if t in palestra.TRATTI]}

    def preleva_note(self):
        note, self.note = self.note, []
        return note

    # ---------- le quattro occasioni ----------
    def turno(self):
        """Inizio del turno del giocatore: l'atleta puo' mettersi in guardia, scaldarsi, attaccare per conto suo..."""
        self._tira("turno", {})

    def attacco(self, att):
        """Il giocatore ha ordinato `att`: ritorna l'attacco da tirare davvero (o None se l'atleta lascia cadere l'azione)."""
        ctx = {"att": att}
        if self._tira("attacco", ctx) and ctx.get("salta"):
            return None
        return ctx["att"]

    def risposta(self, scelta, loc, opzioni):
        """Il giocatore ha scelto come rispondere a un colpo: l'atleta puo' fare diversamente. Ritorna (scelta, locazione di parata)."""
        ctx = {"scelta": scelta, "loc": loc, "opzioni": opzioni}
        self._tira("risposta", ctx)
        return ctx["scelta"], ctx["loc"]

    def dopo_colpo(self, attaccante, difensore, colpito, danno_reale):
        """Dopo uno scambio: il giocatore ha preso un colpo (hp persi) o ne ha dato uno a segno."""
        d = self.d
        if not colpito or d.finito:
            return
        if difensore is d.p and danno_reale > 0:
            self._tira("colpito", {})
        elif attaccante is d.p:
            self._tira("colpisce", {})

    # ---------- scelta ----------
    def _tira(self, quando, ctx):
        d = self.d
        if d.finito or self.ultimo_round == d.round:
            return False
        validi = [e for e in self.eventi if e["quando"] == quando and self._cond(e.get("cond")) and all(self._fattibile(op, ctx) for op in e["fa"])]
        if not validi or random.random() >= probabilita(self.rec) * PESO_FASE[quando]:
            return False
        e = random.choices(validi, [x.get("peso", 1.0) for x in validi])[0]
        self.ultimo_round = d.round
        righe = [r for op in e["fa"] for r in self._esegui(op, ctx)]
        self._racconta(e, righe, quando)
        return True

    def _cond(self, c):
        """Condizioni facoltative di un evento: hp_sotto/hp_sopra (frazione degli hp dell'atleta), avv_hp_sotto, round_min."""
        if not c:
            return True
        d = self.d
        mio, suo = _frazione_hp(d.p), _frazione_hp(d.cpu)
        return (mio <= c.get("hp_sotto", 9) and mio >= c.get("hp_sopra", -1) and suo <= c.get("avv_hp_sotto", 9)
                and d.round >= c.get("round_min", 0))

    # ---------- le operazioni (ognuna: fattibile? / esegui -> righe di dettaglio) ----------
    def _locazione(self, nome, bersaglio):
        if nome in bersaglio.hp:
            return nome
        gruppi = {"braccio": [l for l in bersaglio.hp if l.startswith("braccio")], "gamba": [l for l in bersaglio.hp if l.startswith("gamba")],
                  "arto": [l for l in ARTI if l in bersaglio.hp]}
        return random.choice(gruppi.get(nome) or list(bersaglio.hp))

    def _scegli_attacco(self, regola, escluso=None):
        """L'attacco che l'atleta sceglie con questa regola tra quelli che puo' giocare ora (diverso da `escluso`)."""
        d = self.d
        giocabili = [x for x in d.p.attacchi_giocabili() if escluso is None or x["id"] != escluso["id"]]
        per_nome = {"pesante": "Colpo pesante", "pugno": "Pugno"}
        if regola in per_nome:
            return next((x for x in giocabili if x["nome"] == per_nome[regola]), None)
        punti = [(d.ev_attacco(x, d.p, d.cpu), x) for x in giocabili]
        if not punti:
            return None
        return (max if regola == "migliore" else min)(punti, key=lambda t: t[0])[1]

    def _stance(self, nome):
        return next((s for s in self.d.p.stance_conosciute if s["nome"] == nome), None)

    def _effetto(self, nome):
        return next((e for e in self.d.db["effetti"] if e["nome"] == nome), None)

    def _fattibile(self, op, ctx):
        """Un'iniziativa che non cambierebbe niente non si tira nemmeno (e non consuma il round)."""
        p, t = self.d.p, op["tipo"]
        if t == "mira":
            return "att" not in ctx or bool(ctx["att"].get("can_aim"))
        if t == "senza_mira":
            return bool(p.mira) and bool(ctx.get("att", {}).get("can_aim"))
        if t == "attacco":
            return self._scegli_attacco(op["scelta"], ctx.get("att")) is not None
        if t == "effetto":
            return self._effetto(op["nome"]) is not None
        if t == "stance":
            s = self._stance(op["nome"])
            return s is not None and p.puo_attivare_stance(s)
        if t == "azioni":
            return p.azioni + op["delta"] >= 0 and op["delta"] != 0 and (op["delta"] > 0 or p.azioni > 0)
        if t == "stamina":
            return p.stamina is not None and (p.stamina > 0 if op["delta"] < 0 else p.stamina < p.stamina_max())
        if t == "risposta":
            voluta = "nessuna risposta" if op["scelta"] == "nessuna" else op["scelta"]
            return voluta in ctx.get("opzioni", ()) and voluta != ctx.get("scelta")
        if t == "salta":
            return "att" in ctx
        if t == "cura":
            return p.hp[op["loc"]] < p.hp_max[op["loc"]]
        return t == "danno"

    def _esegui(self, op, ctx):
        d, p, t = self.d, self.d.p, op["tipo"]
        if t == "mira":
            p.mira = self._locazione(op["loc"], d.cpu)
            return [f"mira su {p.mira.replace('_', ' ')}"]
        if t == "senza_mira":
            dove, p.mira = p.mira, None
            return [f"lascia perdere la mira su {dove.replace('_', ' ')}"]
        if t == "attacco":
            att = self._scegli_attacco(op["scelta"], ctx.get("att"))
            if "att" in ctx:                       # al posto di quello ordinato
                ctx["att"] = att
                return [f"tira {att['nome']}"]
            d.usa_attacco(att)                      # a inizio turno: attacca per conto suo (paga le azioni come sempre)
            return [f"attacca con {att['nome']}"]
        if t == "effetto":
            chi = p if op.get("su", "se") == "se" else d.cpu
            return chi.applica_effetti([{"effetto": self._effetto(op["nome"])["id"], "turni": op["turni"]}], d.db["effetti"])
        if t == "stance":
            return p.attiva_stance(self._stance(op["nome"]), d.cpu, d.db["effetti"])
        if t == "azioni":
            p.azioni = max(0, p.azioni + op["delta"])
            return [f"{op['delta']:+d} {'azione' if abs(op['delta']) == 1 else 'azioni'} in questo turno"]
        if t == "stamina":
            p.stamina = max(0, min(p.stamina_max(), p.stamina + op["delta"]))
            return [f"stamina {op['delta']:+d} ({p.stamina}/{p.stamina_max()})"]
        if t == "risposta":
            ctx["scelta"] = "nessuna risposta" if op["scelta"] == "nessuna" else op["scelta"]
            ctx["loc"] = d._loc_parata(p, 20) if ctx["scelta"] == "parata" else None     # dove incassare lo sceglie lui
            return [f"risponde con {ctx['scelta']}"]
        if t == "salta":
            p.azioni = max(0, p.azioni - costo_azioni(ctx["att"]))
            ctx["salta"] = True
            return [f"{ctx['att']['nome']} non parte: l'azione è persa"]
        if t == "cura":
            p.hp[op["loc"]] = min(p.hp_max[op["loc"]], p.hp[op["loc"]] + op["quanto"])
            return [f"+{op['quanto']} hp al {op['loc']}"]
        loc = self._locazione(op["loc"], p)       # danno
        return [f"{loc.replace('_', ' ')}: -{op['quanto']} hp"] + [r.strip() for r in p.applica_danno(loc, op["quanto"], "contundente")]

    # ---------- il racconto ----------
    def _racconta(self, e, righe, quando):
        d = self.d
        testo = e["testo"].format(nome=d.p.nome.split(" ")[0])
        d.scriv(f"⚡ {testo}", "iniz")
        d.log[-1]["chi"] = "p"        # anche se capita nel turno dell'avversario: e' una riga del tuo lato
        for r in righe:
            d.scriv("  " + r, "iniz")
            d.log[-1]["chi"] = "p"
        d.evento("iniziativa", chi="p", nome=d.p.nome, titolo=e["nome"], tratto=palestra.TRATTI[e["tratto"]]["nome"], desc=testo,
                 righe=[r.strip() for r in righe], quando=quando)
        if quando in ("attacco", "risposta"):
            self.note.append(testo)
