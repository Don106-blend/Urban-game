"""Il Banco — il gambling dell'arena (progetto e misure in AZZARDO.md).

Logica pura, senza Flask: il `DuelloWeb` (app.py) tiene un `Tavolo` per duello e gli passa gli scambi; il Tavolo non
conosce crediti ne' salvataggi, chiede al duello (`fondi`, `preleva`, `accredita`). Tre pezzi che parlano tra loro:

* IL BANCO (soldi). Puntate sul proprio allievo a quota viva, con il margine della casa e un tetto che si stringe quando
  l'esito e' gia' scritto; si puo' incassare prima della fine (a un prezzo equo meno il margine); le clausole
  (ex sponsor) sono scommesse speciali con una posta vera; la SERIE alza il pagamento delle puntate aperte a ogni azzardo
  riuscito e si spezza al primo che va male.
* LA FOLLA (reazioni). Il tifo e' UNO solo, da -100 (con la CPU) a +100 (con il giocatore), e segue chi batte le quote:
  chi riesce nell'improbabile lo alza, chi sbaglia l'ovvio lo perde. Non premia chi domina ma chi ha fortuna o coraggio, ed
  e' a media zero. Sposta di qualche pip il dado delle giocate, e a +-65 scatta l'Ovazione: un bonus a tempo per chi la
  folla ama. Vale per tutti e due i combattenti, sempre allo stesso modo.
* GLI AZZARDI (in combattimento). Costano l'azione bonus, uno per turno, e li ha CHIUNQUE sia al tavolo: Ruota della Folla,
  Rilancia, Ultima Puntata. Li gioca anche la CPU (`cpu_azzarda`), con le stesse regole e lo stesso dado.

Tutto e' opt-in: se nessuno azzarda, il duello e' quello di sempre (le metriche M1-M10 di OVERHAUL_GAMEPLAY.md restano valide)."""
import math
import random

ARTI = ("braccio_sx", "braccio_dx", "gamba_sx", "gamba_dx")

# ======================================================================================== il Banco
MARGINE_BANCO = 0.10        # la casa trattiene il 10%: a p = 50% paga 1,8x (prima pagava 2,2x, cioe' il 10% IN PIU' del giusto)
MARGINE_INCASSO = 0.10      # anche uscire in anticipo ha un prezzo
QUOTA_MIN, QUOTA_MAX = 1.10, 10.0
MAX_SCHEDINE = 4            # puntate aperte insieme (esito e clausole)
LIBERA_FINO_A = 0.40        # |2p-1| entro cui il tetto non si stringe (p tra 30% e 70%); a |2p-1| = 0,9 il banco chiude
SERIE_PASSO, SERIE_MAX = 0.20, 5     # +20% di pagamento per azzardo riuscito, fino a +100%
FINESTRA_SERIE = (0.20, 0.80)        # fuori da qui l'incontro e' deciso: il banco non premia la serie (sarebbe un bonus gratis)


def quota(p):
    """Pagamento (puntata compresa) per ogni ¤ sul giocatore, data la sua probabilita' di vittoria."""
    return round(min(QUOTA_MAX, max(QUOTA_MIN, (1 - MARGINE_BANCO) / max(p, 1e-6))), 2)


def limite_puntata(p, fondi):
    """Quanto il banco accetta ADESSO: tutto finche' l'incontro e' aperto, sempre meno man mano che e' deciso (nessuno ti lascia
    puntare sul sicuro). `fondi` e' il tetto di chi punta (i crediti, o il massimo del torneo)."""
    certezza = abs(2 * p - 1)
    f = 1.0 if certezza <= LIBERA_FINO_A else max(0.0, 1 - (certezza - LIBERA_FINO_A) / 0.5)
    return int(fondi * f)


def moltiplicatore_serie(serie):
    return round(1 + SERIE_PASSO * min(max(serie, 0), SERIE_MAX), 2)


def valore_incasso(importo, quota_, serie, p):
    """Prezzo per uscire adesso da una puntata sull'esito: il pagamento atteso (puntata x quota x serie x p) meno il margine."""
    return int(importo * quota_ * moltiplicatore_serie(serie) * max(0.0, min(1.0, p)) * (1 - MARGINE_INCASSO))


# Le clausole sono scommesse speciali: pagano solo se vinci E la condizione e' vera, `k` volte la quota. k = 1 / P(condizione | vinci),
# misurato con `python balance.py azzardo` sugli eroi del gioco vero, MA tenuto sotto quello che frutta la strategia migliore: sono
# scommesse su cose che il giocatore puo' pilotare, e nel gioco di base mirare alla testa e' la strategia dominante (M4). Prezzate sulla
# media, "Colpo alla testa" rendeva +95% per ¤ a chi mirava sempre alla testa (la condizione e' vera in quasi tutte le sue vittorie) ed e'
# stata tolta; "Lampo" a k = 3,8 rendeva +12% e sta a 3,2 (la strategia migliore rende ~0,94 per ¤, il giocatore medio ~0,6: una scommessa
# da squalo, non da turista). `Z6b` del harness lo controlla. Lo "Stoico" e' una scommessa sulla propria scelta: l'IA accende sempre i poteri,
# quindi non c'e' una frequenza da misurare; vale il prezzo dell'handicap (senza poteri si vince ~9 punti in meno: 0,50 / 0,41 = ~1,2-1,4).
# La "Bestia" di prima (vinci avendo acceso un potere) e' vera nel 99% dei casi: con k > 1 sarebbe una macchina da soldi, e non c'e' piu'.
CLAUSOLE = [
    {"id": "lampo", "nome": "Lampo", "k": 3.2, "descrizione": "Vinci entro il round 3."},
    {"id": "stoico", "nome": "Stoico", "k": 1.4, "descrizione": "Vinci senza mai accendere un potere.", "richiede_poteri": True},
    {"id": "incassatore", "nome": "Incassatore", "k": 5.0,
     "descrizione": "Vinci dopo essere sceso sotto il 50% di testa e busto."},
]
SOGLIA_INCASSATORE = 0.50
FINESTRA_CLAUSOLE = 1       # si firmano finche' non e' finito questo round


def clausola(cid):
    return next((c for c in CLAUSOLE if c["id"] == cid), None)


class Schedina:
    """Una puntata. `quota` e' il pagamento complessivo se vince (per una clausola: quota viva x k)."""

    def __init__(self, sid, importo, quota_, tipo="esito", cl=None, round_=1):
        self.id, self.importo, self.quota, self.tipo, self.cl, self.round = sid, importo, quota_, tipo, cl, round_
        self.stato = "aperta"           # aperta | vinta | persa | incassata
        self.incassata = 0              # quanto e' uscito (vinta/incassata)

    def nome(self):
        return "Esito" if self.tipo == "esito" else f"Clausola «{clausola(self.cl)['nome']}»"


# ======================================================================================== la Folla
TIFO_MAX = 100.0
K_SORPRESA = 36.0           # quanto sposta il tifo un colpo a segno allo 0% (a segno al 100% non sposta nulla)
DECADIMENTO = 0.88          # a ogni round la folla si raffredda
SOGLIE_SCARTO = (25, 50, 75)         # |tifo| che vale +1, +2, +3 pip sul dado delle giocate
SOGLIA_OVAZIONE = 65
PERDITA_OVAZIONE = 40       # il boato consuma tifo
# (misurato con i duelli del harness, senza azzardi: l'Ovazione scatta in ~30% dei duelli e il tifo sposta il dado ~40% del tempo)
SPETTACOLO = {"schivata": 4.0, "parata": 3.0, "potere": 3.0, "stance": 2.0, "colpo_grosso": 6.0, "arto": 8.0, "knockout": 10.0}
# gli effetti a tempo del gambling: una sola fortuna alla volta (la piu' recente vince, tranne un bonus piu' debole su uno piu' forte)
FORTUNA = {"Incitamento": 1, "Boato": 2, "Ovazione": 1, "Furia": 2, "Rivincita": 1, "Fischi": -1, "Sfiga nera": -2}


def scarto(tifo):
    """Pip che la folla aggiunge (o toglie) al dado di chi azzarda: da -3 a +3."""
    n = sum(1 for s in SOGLIE_SCARTO if abs(tifo) >= s)
    return n if tifo >= 0 else -n


def sorpresa(p_colpo, colpito):
    """Di quanto si sposta il tifo, verso l'attaccante (>0) o verso chi si difende (<0), per l'esito di un colpo che andava a segno
    con probabilita' `p_colpo`: l'improbabile fa rumore, l'ovvio no. A media zero: il tifo segue la fortuna, non la forza."""
    return K_SORPRESA * (1 - p_colpo) if colpito else -K_SORPRESA * p_colpo


# ======================================================================================== gli Azzardi
# La Ruota: d10 + scarto della folla. Sotto l'1 e' sfiga, sopra il 10 e' jackpot: il jackpot c'e' solo se la folla e' dalla tua.
# (soglia massima, id, nome, tag, descrizione, valore in hp equivalenti: serve all'IA, e' misurato con `balance.py azzardo`)
RUOTA = [
    (1, "sfiga", "Sfiga nera", "male", "-2 a colpire e ai riflessi per 3 turni e -2 stamina.", -170),
    (2, "fischi", "Fischi", "male", "-1 a colpire e ai riflessi per 3 turni.", -62),
    (3, "bottiglia", "Bottiglia!", "male", "Ti arriva una bottiglia: -25 hp a una locazione a caso (mai mortale).", -25),
    (5, "silenzio", "Silenzio", "neutro", "La folla non reagisce.", 0),
    (6, "incitamento", "Incitamento", "bene", "+1 a colpire e ai riflessi per 2 turni.", 42),
    (7, "adrenalina", "Adrenalina", "bene", "+1 azione subito e +2 stamina.", 25),
    (8, "medikit", "Medikit dagli spalti", "bene", "+25 hp alla locazione piu' ferita.", 18),
    (9, "giubbotto", "Giubbotto", "bene", "+25 di armatura sul busto.", 10),
    (11, "boato", "Boato", "bene", "+2 a colpire e ai riflessi per 2 turni.", 75),
    (99, "jackpot", "JACKPOT", "jackpot", "Furia (+2) per 3 turni, +40 hp al busto e +1 azione.", 180),
]
BOTTIGLIA_DANNO = 25
# ev(scarto) = -51, -33, ..., -9 (a pari), +16, +40: la casa vince a pari (la sfortuna dura 3 turni, la fortuna 2: misurato con 40.000 duelli, a pari
# la ruota con la sfortuna da 2 turni valeva +0,4 punti di vittoria); serve la folla dalla tua (o essere disperati) per giocare in attivo


def esito_ruota(m):
    return next(r for r in RUOTA if m <= r[0])


def distribuzione_ruota(sc):
    """Per ogni esito, la probabilita' con il dado spostato di `sc`."""
    prob = {}
    for x in range(1, 11):
        r = esito_ruota(x + sc)
        prob[r[1]] = prob.get(r[1], 0) + 0.1
    return [{"id": r[1], "nome": r[2], "tag": r[3], "desc": r[4], "prob": round(prob[r[1]], 2)}
            for r in RUOTA if r[1] in prob]


def ruota_ev_sd(sc):
    """Valore atteso e deviazione standard (in hp equivalenti) di un giro di ruota con scarto `sc`."""
    v = [esito_ruota(x + sc)[5] for x in range(1, 11)]
    m = sum(v) / 10
    return m, math.sqrt(sum((x - m) ** 2 for x in v) / 10)


# Rilancia: l'effetto vale per il PRIMO colpo del prossimo attacco di questo turno. Il danno cresce di `mult`, ma il rilancio non
# uccide da solo (a testa e busto lascia almeno 1 hp: il banco non chiude un incontro con un colpo azzardato). Se il colpo non va a
# segno chi ha azzardato paga: perde la risposta del round, resta Esposto (-1 ai riflessi per punto di `esposto`) e, a "Tutto o niente",
# anche le azioni che gli restavano e un contraccolpo (`contraccolpo` x il danno che avrebbe fatto, a un arto suo: ti strappi un muscolo).
# `g` e `costo` sono quanto valgono il guadagno (per punto di danno del colpo) e il prezzo del fallimento, in hp equivalenti: servono
# all'IA e sono misurati (AZZARDO.md). Il punto di pareggio e' ~50% a colpire per il Rilancio e ~55% per Tutto o niente: sopra conviene,
# sotto no (mai un'arma: la casa non regala).
RILANCIO = {
    1: {"nome": "Rilancio", "mult": 1.4, "esposto": 1, "perde_azioni": False, "contraccolpo": 0.0, "g": 0.7, "costo": 52},
    2: {"nome": "Tutto o niente", "mult": 2.5, "esposto": 2, "perde_azioni": True, "contraccolpo": 0.6, "g": 1.6, "costo": 160},
}

# Ultima Puntata: una volta per duello, quando testa o busto sono sotto il 30% (e ancora in piedi). d10 + scarto >= 7: 40% a pari.
ULTIMA_SOGLIA = 7
SOGLIA_CRITICA = 0.30
RIPRESA_ULTIMA = 0.45       # chi resiste riparte con testa e busto ad almeno il 45%
P_DOPO_ULTIMA = 0.60        # (per l'IA) la probabilita' di vincere dopo averla spuntata (misurato: 64%)


def p_ultima(sc):
    return sum(1 for x in range(1, 11) if x + sc >= ULTIMA_SOGLIA) / 10


# ======================================================================================== il tavolo
class Tavolo:
    """Lo stato del gambling di UN duello. `d` e' il DuelloWeb (duck typing: p, cpu, attivo, altro, finito, round, fase, scriv,
    evento, prob_vittoria, fondi, preleva, accredita, db); `banco` dice se ci sono anche le puntate (arena vera o torneo)."""

    def __init__(self, d, banco=True):
        self.d, self.banco = d, banco
        self.schedine = []
        self._sid = 1
        self.tifo = 0.0
        self.serie = 0
        self.rilancio = {}          # lato -> livello (in attesa del prossimo attacco)
        self.piano = {}             # lato -> id dell'attacco che la CPU ha deciso di rilanciare
        self.voglia = {}            # lato -> estrazione del turno: l'IA azzarda se e' sotto la sua audacia
        self.azzardato = set()      # lati che hanno gia' azzardato in questo turno
        self.ultima_usata = set()
        self.stat = {"ruota": 0, "rilancia": 0, "ultima": 0, "ovazioni": 0, "esiti": {}, "rilanci_ok": 0, "rilanci_ko": 0,
                     "ultime_ok": 0}

    # ---------------------------------------------------------------- identita'
    def lato(self, chi):
        return "p" if chi is self.d.p else "c"

    def avversario(self, chi):
        return self.d.cpu if chi is self.d.p else self.d.p

    def p_vince(self, chi):
        """Probabilita' stimata che `chi` vinca (la stessa funzione calibrata che fa le quote)."""
        p = self.d.prob_vittoria()
        return p if chi is self.d.p else 1 - p

    def unita(self):
        return "pt" if self.d.torneo is not None else "¤"

    # ---------------------------------------------------------------- il banco: puntate
    def quota(self):
        return quota(self.d.prob_vittoria())

    def limite(self):
        return limite_puntata(self.d.prob_vittoria(), self.d.fondi())

    def aperte(self):
        return [s for s in self.schedine if s.stato == "aperta"]

    def _puo_puntare(self):
        if not self.banco:
            return "questa modalità non ha scommesse"
        if self.d.finito:
            return "il duello è concluso"
        if len(self.aperte()) >= MAX_SCHEDINE:
            return f"puoi tenere aperte al massimo {MAX_SCHEDINE} puntate"
        return None

    def punta(self, importo):
        err = self._puo_puntare()
        if err:
            return err
        if not isinstance(importo, int) or isinstance(importo, bool) or importo <= 0:
            return "importo non valido"
        if importo > self.d.fondi():
            return "crediti insufficienti" if self.d.torneo is None else f"puntata massima nel torneo: {self.d.fondi()} pt"
        lim = self.limite()
        if importo > lim:
            return f"il banco accetta al massimo {lim}{self.unita()} adesso: l'incontro è già quasi deciso"
        q = self.quota()
        self.d.preleva(importo)
        s = Schedina(self._sid, importo, q, "esito", None, self.d.round)
        self._sid += 1
        self.schedine.append(s)
        self.d.scriv(f"🎰 Puntata: {importo}{self.unita()} su {self.d.p.nome} a quota {q}x "
                     f"(se vinci: {int(importo * q)}{self.unita()}).")
        return None

    def clausole_firmabili(self):
        """Le clausole che si possono ancora firmare: finche' l'incontro e' agli inizi e la condizione non e' gia' persa."""
        if not self.banco or self.d.finito or self.d.round > FINESTRA_CLAUSOLE:
            return []
        firmate = {s.cl for s in self.aperte() if s.tipo == "clausola"}
        ha_poteri = bool(self.d.p.poteri) or any(s["def"].get("attivo", True) for s in self.d.p.augments)
        return [c for c in CLAUSOLE if c["id"] not in firmate and not self.clausola_fallita(c["id"])
                and (ha_poteri or not c.get("richiede_poteri"))]

    def firma(self, cid, importo):
        err = self._puo_puntare()
        if err:
            return err
        c = next((x for x in self.clausole_firmabili() if x["id"] == cid), None)
        if c is None:
            return "clausola non disponibile"
        if not isinstance(importo, int) or isinstance(importo, bool) or importo <= 0:
            return "importo non valido"
        if importo > self.d.fondi():
            return "crediti insufficienti" if self.d.torneo is None else f"puntata massima nel torneo: {self.d.fondi()} pt"
        if importo > self.limite():
            return f"il banco accetta al massimo {self.limite()}{self.unita()} adesso"
        q = round(self.quota() * c["k"], 2)
        self.d.preleva(importo)
        s = Schedina(self._sid, importo, q, "clausola", cid, self.d.round)
        self._sid += 1
        self.schedine.append(s)
        self.d.scriv(f"🎰 Clausola «{c['nome']}»: {importo}{self.unita()} a {q}x se {c['descrizione'][0].lower()}{c['descrizione'][1:]}")
        return None

    def incasso(self, s):
        """Quanto vale ora uscire da una puntata sull'esito (le clausole non si incassano: dipendono da come si vince)."""
        if s.tipo != "esito" or s.stato != "aperta":
            return None
        return max(0, valore_incasso(s.importo, s.quota, self.serie, self.d.prob_vittoria()))

    def incassa(self, sid):
        s = next((x for x in self.aperte() if x.id == sid), None)
        if s is None:
            return "puntata non trovata"
        if s.tipo != "esito":
            return "le clausole non si incassano prima della fine"
        if self.d.finito:
            return "il duello è concluso"
        v = self.incasso(s)
        s.stato, s.incassata = "incassata", v
        self.d.accredita(v)
        self.d.scriv(f"🎰 Incasso anticipato: {v}{self.unita()} per una puntata di {s.importo}{self.unita()} "
                     f"({'+' if v >= s.importo else ''}{v - s.importo}{self.unita()}).", "crit" if v >= s.importo else "miss")
        return None

    # ---------------------------------------------------------------- clausole: condizioni
    def clausola_ok(self, cid):
        """Verifica finale della condizione (la vittoria si controlla a parte)."""
        d = self.d
        return {"lampo": d.round <= 3, "stoico": not d.usato_potere,
                "incassatore": d.min_hp_crit <= SOGLIA_INCASSATORE}.get(cid, False)

    def clausola_fallita(self, cid):
        """Per il display: la condizione (a parte vincere) e' gia' impossibile?"""
        d = self.d
        if cid == "lampo":
            return d.round > 3
        if cid == "stoico":
            return d.usato_potere
        return False

    # ---------------------------------------------------------------- la serie
    def serie_riuscita(self, n=1):
        p = self.d.prob_vittoria()
        if FINESTRA_SERIE[0] <= p <= FINESTRA_SERIE[1]:
            self.serie = min(SERIE_MAX, self.serie + n)
            return True
        return False

    def serie_spezzata(self):
        if self.serie:
            self.d.scriv("🎰 La serie si spezza.", "miss")
        self.serie = 0

    # ---------------------------------------------------------------- liquidazione
    def liquida(self, vinto):
        """A duello finito: paga le puntate aperte. Ritorna {'totale': n, 'righe': [(testo, tag)]}; i soldi li muove chi chiama."""
        m = moltiplicatore_serie(self.serie)
        u = self.unita()
        righe, totale = [], 0
        for s in self.aperte():
            ok = vinto and (s.tipo == "esito" or self.clausola_ok(s.cl))
            if ok:
                s.stato = "vinta"
                s.incassata = int(s.importo * s.quota * m)
                totale += s.incassata
                extra = f" (serie ×{m})" if m > 1 else ""
                righe.append((f"🎰 {s.nome()} vinta: +{s.incassata}{u} su {s.importo}{u} a {s.quota}x{extra}.", "crit"))
            else:
                s.stato = "persa"
                righe.append((f"🎰 {s.nome()} persa: -{s.importo}{u}.", "miss"))
        return {"totale": totale, "righe": righe}

    # ---------------------------------------------------------------- la folla
    def tifo_di(self, chi):
        return self.tifo if chi is self.d.p else -self.tifo

    def scarto(self, chi):
        return scarto(self.tifo_di(chi))

    def spingi(self, chi, delta):
        """Sposta il tifo verso `chi` (delta > 0) o verso l'altro (delta < 0)."""
        self.tifo = max(-TIFO_MAX, min(TIFO_MAX, self.tifo + (delta if chi is self.d.p else -delta)))

    def _fortuna(self, chi, nome, turni):
        """Un effetto a tempo del gambling su `chi`: una sola fortuna alla volta."""
        db = self.d.db["effetti"]
        eid = next((e["id"] for e in db if e["nome"] == nome), None)
        if eid is None:
            return []
        nuovo = FORTUNA[nome]
        for e in list(chi.effetti_attivi):
            vecchio = FORTUNA.get(e["def"]["nome"])
            if vecchio is None:
                continue
            if (vecchio > 0) == (nuovo > 0) and abs(vecchio) > abs(nuovo):
                e["turni"] = max(e["turni"], turni)        # un bonus piu' debole non scalza quello forte: lo rinnova e basta
                return []
            chi.effetti_attivi.remove(e)
        return chi.applica_effetti([{"effetto": eid, "turni": turni}], db)

    def _esposto(self, chi, n):
        db = self.d.db["effetti"]
        eid = next((e["id"] for e in db if e["nome"] == "Esposto"), None)
        return chi.applica_effetti([{"effetto": eid, "turni": 1}] * n, db) if eid is not None else []

    def dopo_scambio(self, a, dif, scelta, colpito, p_colpo, hp_persi, loc, arti_nuovi, ucciso):
        """Dopo ogni colpo: la folla reagisce a quanto era improbabile. `p_colpo` = probabilita' di andare a segno contro la
        difesa scelta."""
        if scelta == "schivata":
            self.spingi(dif, SPETTACOLO["schivata"])
        else:
            self.spingi(a, sorpresa(p_colpo, colpito))
            if not colpito and scelta == "parata":
                self.spingi(dif, SPETTACOLO["parata"])
        if colpito:
            if hp_persi >= 0.3 * dif.hp_max.get(loc, 100):
                self.spingi(a, SPETTACOLO["colpo_grosso"])
            if arti_nuovi:
                self.spingi(a, SPETTACOLO["arto"])
            if ucciso:
                self.spingi(a, SPETTACOLO["knockout"])
        self._ovazione()

    def spettacolo(self, chi, tipo):
        self.spingi(chi, SPETTACOLO[tipo])
        self._ovazione()

    def _ovazione(self):
        if abs(self.tifo) < SOGLIA_OVAZIONE or self.d.finito:
            return
        chi = self.d.p if self.tifo > 0 else self.d.cpu
        self.tifo -= math.copysign(PERDITA_OVAZIONE, self.tifo)
        self.stat["ovazioni"] += 1
        i0 = len(self.d.log)
        self.d.scriv(f"📣 OVAZIONE! Il pubblico è in piedi per {chi.nome}.", "crit")
        for r in self._fortuna(chi, "Ovazione", 2):
            self.d.scriv("  " + r)
        self.d.evento("folla", i0, chi=self.lato(chi), nome=chi.nome, titolo="Ovazione",
                      desc=f"Il pubblico è in piedi per {chi.nome}: +1 a colpire e ai riflessi per 2 turni.")

    def nuovo_round(self):
        self.tifo = round(self.tifo * DECADIMENTO, 2)

    def testo_folla(self):
        t = abs(self.tifo)
        chi = self.d.p if self.tifo > 0 else self.d.cpu
        if t >= SOGLIE_SCARTO[2]:
            return f"Il pubblico è in delirio per {chi.nome}!"
        if t >= SOGLIE_SCARTO[1]:
            return f"La folla è tutta per {chi.nome}."
        if t >= SOGLIE_SCARTO[0]:
            return f"Il pubblico tifa per {chi.nome}."
        return "Il pubblico è diviso."

    # ---------------------------------------------------------------- gli azzardi
    def critico(self, chi):
        """In piedi ma sull'orlo: testa o busto sotto il 30% (e sopra 0)."""
        return any(0 < chi.hp[l] <= SOGLIA_CRITICA * chi.hp_max[l] for l in ("testa", "busto"))

    def puo_azzardare(self, chi):
        d = self.d
        if d.finito or chi is not d.attivo or d.fase not in ("player", "cpu"):
            return False, "non è il tuo turno"
        if chi.bonus < 1:
            return False, "azioni bonus esaurite"
        if self.lato(chi) in self.azzardato:
            return False, "hai già azzardato in questo turno"
        return True, None

    def puo_ultima(self, chi):
        return self.lato(chi) not in self.ultima_usata and self.critico(chi)

    def rischio_morte(self, chi):
        """Chance che il crollo dell'Ultima Puntata sia mortale (solo per un allievo della palestra), o None."""
        return self.d.rischio_morte(chi)

    def _consuma(self, chi):
        chi.bonus -= 1
        self.azzardato.add(self.lato(chi))

    def azzarda(self, chi, aid, livello=1):
        ok, motivo = self.puo_azzardare(chi)
        if not ok:
            return motivo
        if aid == "ruota":
            self._consuma(chi)
            self._ruota(chi)
        elif aid == "rilancia":
            if livello not in RILANCIO:
                return "livello non valido"
            if self.rilancio.get(self.lato(chi)):
                return "hai già rilanciato la posta"
            if chi.azioni < 1:
                return "serve almeno un'azione per attaccare"
            self._consuma(chi)
            self._rilancia(chi, livello)
        elif aid == "ultima":
            if not self.puo_ultima(chi):
                return "l'Ultima Puntata si gioca una volta sola, a un passo dalla fine"
            self._consuma(chi)
            self._ultima(chi)
        else:
            return "azzardo sconosciuto"
        return None

    def _evento(self, chi, aid, i0, **dati):
        self.d.evento("azzardo", i0, chi=self.lato(chi), nome=chi.nome, azzardo=aid, righe=[x["t"] for x in self.d.log[i0:]], **dati)

    def _ruota(self, chi):
        d, sc = self.d, self.scarto(chi)
        i0 = len(d.log)
        x = random.randint(1, 10)
        m = x + sc
        r = esito_ruota(m)
        self.stat["ruota"] += 1
        self.stat["esiti"][r[1]] = self.stat["esiti"].get(r[1], 0) + 1
        d.scriv(f"🎲 {chi.nome} chiede alla folla: d10 {x}{sc:+d} = {m}. {r[2].upper()}!", "crit" if r[3] in ("bene", "jackpot") else "miss")
        righe = self._applica_esito(chi, r[1])
        for t in righe:
            d.scriv("  " + t)
        if r[3] in ("bene", "jackpot"):
            self.serie_riuscita(2 if r[3] == "jackpot" else 1) if chi is d.p else None
            self.spingi(chi, -0.5 * self.tifo_di(chi))      # la folla ha dato: si e' consumata a meta'
        elif r[3] == "male":
            if chi is d.p:
                self.serie_spezzata()
        self._evento(chi, "ruota", i0, tiro=x, scarto=sc, totale=m, esito=r[1], nome_esito=r[2], tag=r[3], desc=r[4])

    def _applica_esito(self, chi, eid):
        d, righe = self.d, []
        if eid == "sfiga":
            righe += self._fortuna(chi, "Sfiga nera", 3)
            if chi.stamina is not None:
                chi.stamina = max(0, chi.stamina - 2)
                righe.append(f"Stamina -2 ({chi.stamina}/{chi.stamina_max()}).")
        elif eid == "bottiglia":
            loc = chi.locazione_casuale()
            danno = BOTTIGLIA_DANNO
            if loc in ("testa", "busto"):
                danno = min(danno, max(0, chi.hp[loc] + chi.armatura.get(loc, 0) - 1))   # mai mortale
            righe.append(f"La bottiglia ti prende {loc}.")
            righe += chi.applica_danno(loc, danno, "contundente") if danno > 0 else ["Il colpo non fa danni."]
        elif eid == "fischi":
            righe += self._fortuna(chi, "Fischi", 3)
        elif eid == "silenzio":
            righe.append("Nessun effetto.")
        elif eid == "incitamento":
            righe += self._fortuna(chi, "Incitamento", 2)
        elif eid == "medikit":
            loc = max(chi.hp, key=lambda l: chi.hp_max.get(l, 0) - chi.hp[l])
            cura = min(25, chi.hp_max[loc] - chi.hp[loc])
            if cura > 0:
                chi.hp[loc] += cura
                righe.append(f"{loc}: +{cura} ({chi.hp[loc]} hp)")
            else:
                righe.append("Sei già in forma: nessun effetto.")
        elif eid == "adrenalina":
            chi.azioni += 1
            if chi.stamina is not None:
                chi.stamina = min(chi.stamina_max(), chi.stamina + 2)
            righe.append("+1 azione e +2 stamina.")
        elif eid == "giubbotto":
            chi.armatura["busto"] = chi.armatura.get("busto", 0) + 25
            righe.append("+25 di armatura sul busto.")
        elif eid == "boato":
            righe += self._fortuna(chi, "Boato", 2)
        elif eid == "jackpot":
            righe += self._fortuna(chi, "Furia", 3)
            chi.hp["busto"] = min(chi.hp_max["busto"], chi.hp["busto"] + 40)
            chi.azioni += 1
            righe.append(f"busto +40 ({chi.hp['busto']} hp) e +1 azione.")
        return righe

    def _rilancia(self, chi, livello):
        d, cfg = self.d, RILANCIO[livello]
        i0 = len(d.log)
        self.rilancio[self.lato(chi)] = livello
        self.stat["rilancia"] += 1
        d.scriv(f"🎲 {chi.nome}: {cfg['nome'].upper()}! Il prossimo colpo va ×{cfg['mult']:g}; se non va a segno, paga.", "crit")
        self._evento(chi, "rilancia", i0, livello=livello, nome_esito=cfg["nome"], mult=cfg["mult"], tag="rischio",
                     desc=f"Il prossimo colpo di questo turno fa ×{cfg['mult']:g} di danno (senza uccidere da solo). Se non va a "
                          f"segno perdi la risposta del round e resti Esposto"
                          f"{' e perdi le azioni che ti restano' if cfg['perde_azioni'] else ''}.")

    def rilancio_attivo(self, chi):
        return self.rilancio.get(self.lato(chi), 0)

    def danno_rilanciato(self, a, dif, loc, danno):
        """Il colpo e' andato a segno: se `a` aveva rilanciato, il danno cresce (senza uccidere da solo) e il rilancio e' consumato."""
        liv = self.rilancio.pop(self.lato(a), 0)
        if not liv:
            return danno
        nuovo = int(danno * RILANCIO[liv]["mult"])
        if loc in ("testa", "busto"):             # il rilancio non uccide da solo: lascia almeno 1 hp (armatura compresa)
            nuovo = max(danno, min(nuovo, dif.hp[loc] + dif.armatura.get(loc, 0) - 1))
        self.stat["rilanci_ok"] += 1
        self.d.scriv(f"🎲 La posta paga: {danno} → {nuovo} danni!", "crit")
        self.spingi(a, 12)
        if a is self.d.p:
            self.serie_riuscita(liv)
        return nuovo

    def rilancio_mancato(self, a, danno_atteso=0):
        """Il colpo e' stato evitato: chi aveva rilanciato paga. `danno_atteso` e' quello che il colpo avrebbe fatto di norma."""
        liv = self.rilancio.pop(self.lato(a), 0)
        if not liv:
            return
        cfg, d = RILANCIO[liv], self.d
        self.stat["rilanci_ko"] += 1
        righe = []
        if a.risposte > 0:
            a.risposte = 0
            righe.append("perde la risposta del round")
        self._esposto(a, cfg["esposto"])
        righe.append(f"resta Esposto (-{cfg['esposto']} ai riflessi)")
        if cfg["perde_azioni"] and a.azioni > 0:
            righe.append(f"perde le {a.azioni} azioni che gli restavano")
            a.azioni = 0
        if cfg["contraccolpo"] and danno_atteso:
            arti = [l for l in ARTI if l in a.hp and a.hp[l] > 0]
            if arti:
                loc = random.choice(arti)
                dmg = min(a.hp[loc], int(cfg["contraccolpo"] * cfg["mult"] * danno_atteso))
                a.hp[loc] -= dmg
                righe.append(f"si strappa un muscolo ({loc} -{dmg})")
        d.scriv(f"🎲 {a.nome} ha scommesso e ha perso: " + ", ".join(righe) + ".", "miss")
        self.spingi(a, -12)
        if a is d.p:
            self.serie_spezzata()

    def _ultima(self, chi):
        d, sc = self.d, self.scarto(chi)
        i0 = len(d.log)
        self.ultima_usata.add(self.lato(chi))
        self.stat["ultima"] += 1
        x = random.randint(1, 10)
        m = x + sc
        ok = m >= ULTIMA_SOGLIA
        d.scriv(f"🎲 {chi.nome} si gioca tutto: ULTIMA PUNTATA. d10 {x}{sc:+d} = {m} (serve {ULTIMA_SOGLIA}).", "crit")
        if ok:
            self.stat["ultime_ok"] += 1
            for l in ("testa", "busto"):
                chi.hp[l] = max(chi.hp[l], int(RIPRESA_ULTIMA * chi.hp_max[l]))
            chi.azioni += 1
            righe = self._fortuna(chi, "Furia", 3)
            d.scriv(f"RESISTE! {chi.nome} si rialza: testa {chi.hp['testa']}, busto {chi.hp['busto']}, +1 azione.", "crit")
            for t in righe:
                d.scriv("  " + t)
            self.spingi(chi, 40)
            if chi is d.p:
                self.serie_riuscita(3)
        else:
            critica = min(("testa", "busto"), key=lambda l: chi.hp[l] / chi.hp_max[l])
            chi.hp[critica] = -chi.hp_max[critica]         # il corpo cede: in zona morte
            d.scriv(f"CROLLA! {critica}: {chi.hp[critica]} hp.", "crit")
            self.spingi(chi, -30)
            if chi is d.p:
                self.serie_spezzata()
            d.check_sconfitta(chi, self.avversario(chi))
        self._evento(chi, "ultima", i0, tiro=x, scarto=sc, totale=m, soglia=ULTIMA_SOGLIA, riuscita=ok, tag="bene" if ok else "male",
                     nome_esito="Resiste!" if ok else "Crolla!")

    # ---------------------------------------------------------------- turni
    def inizio_turno(self, chi):
        self.azzardato.discard(self.lato(chi))
        self.voglia[self.lato(chi)] = random.random()      # l'IA decide una volta per turno se ha voglia di azzardare

    def fine_turno(self, chi):
        """Un rilancio non usato (nessun attacco) scade senza costi."""
        self.rilancio.pop(self.lato(chi), None)
        self.piano.pop(self.lato(chi), None)

    # ---------------------------------------------------------------- l'IA (la CPU e il harness)
    HP_PER_PROB = 1300       # quanti hp equivalenti vale un'unita' di probabilita' di vittoria (misurato: ~13 hp per punto)
    VARIANZA = 0.3           # quanto pesa il rischio: chi e' sotto cerca la varianza, chi e' avanti la evita

    def _utilita(self, ev, sd, p):
        return ev + self.VARIANZA * (0.5 - p) * sd

    def cpu_azzarda(self, chi, audacia):
        """La mossa d'azzardo di chi gioca come CPU. True se l'ha fatta. `audacia` (0-1) e' la voglia di giocare; la politica
        ('saggio', 'mai', 'folle') si imposta sul combattente (`pol_azzardo`) per misurarla."""
        pol = getattr(chi, "pol_azzardo", "saggio")
        if pol == "mai":
            return False
        ok, _ = self.puo_azzardare(chi)
        if not ok:
            return False
        d = self.d
        p, sc = self.p_vince(chi), self.scarto(chi)
        cand = []
        if self.puo_ultima(chi):
            cand.append((((p_ultima(sc) * P_DOPO_ULTIMA) - p) * self.HP_PER_PROB, "ultima", 1, None))
        ev, sd = ruota_ev_sd(sc)
        cand.append((self._utilita(ev, sd, p), "ruota", 1, None))
        if chi.azioni >= 1 and not self.rilancio.get(self.lato(chi)):
            scelto = self._attacco_da_rilanciare(chi)
            if scelto is not None:
                att, p_hit, danno = scelto
                for liv, cfg in RILANCIO.items():
                    guadagno = cfg["g"] * danno
                    ev_r = p_hit * guadagno - (1 - p_hit) * cfg["costo"]
                    sd_r = math.sqrt(p_hit * (1 - p_hit)) * (guadagno + cfg["costo"])
                    cand.append((self._utilita(ev_r, sd_r, p), "rilancia", liv, att))
        if pol == "folle":
            u, aid, liv, att = random.choice(cand)
        else:
            cand = [c for c in cand if c[0] > 0]
            if not cand or self.voglia.get(self.lato(chi), 1.0) >= audacia:
                return False
            u, aid, liv, att = max(cand, key=lambda c: c[0])
        if aid == "rilancia":
            self.piano[self.lato(chi)] = att["id"]
        return self.azzarda(chi, aid, liv) is None

    def _attacco_da_rilanciare(self, chi):
        """(attacco, probabilita' di colpire, danno atteso) del colpo che vale la pena rilanciare, o None."""
        d, altro = self.d, self.avversario(chi)
        best = None
        for att in chi.attacchi_giocabili():
            if not chi.puo_pagare_attacco(att) or att.get("danno", {}).get("flat", 0) <= 0:
                continue
            p_hit = d.p_colpire_stimata(att, chi, altro)       # (gia' mediata sui dadi delle stance)
            danno = d.stima_colpo_di(att)
            if p_hit <= 0:
                continue
            valore = p_hit * danno / max(1, att.get("costo_azioni", 1))
            if best is None or valore > best[0]:
                best = (valore, att, p_hit, danno)
        return None if best is None else best[1:]

    def attacco_pianificato(self, chi):
        aid = self.piano.get(self.lato(chi))
        return next((a for a in chi.attacchi_giocabili() if a["id"] == aid and chi.puo_pagare_attacco(a)), None) if aid else None

    # ---------------------------------------------------------------- per il client
    def schedine_info(self):
        u = self.unita()
        m = moltiplicatore_serie(self.serie)
        out = []
        for s in self.schedine:
            e = {"id": s.id, "tipo": s.tipo, "nome": s.nome(), "importo": s.importo, "quota": s.quota, "stato": s.stato,
                 "vincita": int(s.importo * s.quota * m), "incassata": s.incassata}
            if s.stato == "aperta":
                e["incasso"] = self.incasso(s)
                if s.tipo == "clausola":
                    e["fallita"] = self.clausola_fallita(s.cl)
            out.append(e)
        return out

    def info(self):
        """Lo stato del banco e della folla per il client."""
        d = self.d
        p = d.prob_vittoria()
        return {
            "unita": self.unita(), "banco": self.banco,
            "fondi": d.fondi() if self.banco else 0, "p_vittoria": round(p, 3),
            "quota": quota(p), "limite": self.limite() if self.banco else 0, "max_schedine": MAX_SCHEDINE,
            "schedine": self.schedine_info(),
            "clausole": [{"id": c["id"], "nome": c["nome"], "descrizione": c["descrizione"], "k": c["k"],
                          "quota": round(quota(p) * c["k"], 2)} for c in self.clausole_firmabili()],
            "serie": self.serie, "moltiplicatore": moltiplicatore_serie(self.serie), "serie_max": SERIE_MAX,
            "margine": MARGINE_BANCO, "margine_incasso": MARGINE_INCASSO, "finestra_clausole": FINESTRA_CLAUSOLE,
            "folla": {"tifo": round(self.tifo, 1), "scarto": scarto(self.tifo), "testo": self.testo_folla(),
                      "per": None if abs(self.tifo) < SOGLIE_SCARTO[0] else ("p" if self.tifo > 0 else "c"),
                      "soglia": SOGLIA_OVAZIONE},
        }

    def menu(self, chi):
        """Gli azzardi che `chi` ha davanti adesso, con le probabilita': il menu del giocatore."""
        ok, motivo = self.puo_azzardare(chi)
        sc = self.scarto(chi)
        ev, sd = ruota_ev_sd(sc)
        ult = self.puo_ultima(chi)
        sel = self._attacco_da_rilanciare(chi) if ok and chi.azioni >= 1 else None
        return {
            "disponibile": ok, "motivo": motivo, "scarto": sc,
            "ruota": {"esiti": distribuzione_ruota(sc), "ev": round(ev, 1)},
            "rilancia": {"attivo": self.rilancio_attivo(chi), "ok": ok and chi.azioni >= 1 and not self.rilancio_attivo(chi),
                         "colpo": None if sel is None else {"nome": sel[0]["nome"], "p": round(sel[1], 2)},
                          "livelli": [{"livello": k, "nome": c["nome"], "mult": c["mult"],
                                       "esposto": c["esposto"], "perde_azioni": c["perde_azioni"]}
                                      for k, c in RILANCIO.items()]},
            "ultima": {"ok": ok and ult, "usata": self.lato(chi) in self.ultima_usata, "critico": self.critico(chi),
                       "p": p_ultima(sc), "soglia": ULTIMA_SOGLIA, "rischio_morte": self.rischio_morte(chi),
                       "ripresa": RIPRESA_ULTIMA, "soglia_critica": SOGLIA_CRITICA},
        }

    def stato_lato(self, chi):
        """Cosa mostrare sul pannello di un combattente."""
        liv = self.rilancio_attivo(chi)
        return {"rilancio": liv, "mult": RILANCIO[liv]["mult"] if liv else 0, "ultima": self.lato(chi) in self.ultima_usata,
                "scarto": self.scarto(chi)}
