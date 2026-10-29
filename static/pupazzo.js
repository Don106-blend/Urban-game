/* Urban — il pupazzo: un combattente come "ragdoll attivo".
   13 corpi rigidi (uno per pezzo dello sprite, con il piede staccato dallo stinco) legati da giunti a cerniera, ognuno
   con un motore PD ("muscolo") che lo porta verso la posa voluta. La posa non e' un'animazione a fotogrammi: e' un
   insieme di bersagli (altezza del bacino, inclinazione del busto, dove stanno mani e piedi) che la cinematica inversa
   traduce in angoli dei giunti. Il resto lo fa il motore fisico (fisica.js): inerzia, rimbalzi dei colpi, arti che
   frustano e si assestano, piedi che fanno attrito e scivolano.
   - In piedi: i muscoli tengono la forma, il bacino e' sostenuto da una molla "di galleggiamento" (una persona che sta
     su due gambe rigide in 12 px di appoggio non e' stabile: v. _assistenza) e si cammina a passi: un piede lontano dal
     suo posto si sposta dove serve.
   - Colpi: impulso sulla locazione colpita + spinta a tutto il corpo (che scivola e poi rientra a passi) + muscoli che
     cedono un istante. Attacchi, schivate e parate sono "azioni" che ritoccano la posa per un po'.
   - Locazione storpiata: i suoi muscoli si spengono, l'arto diventa un ragdoll. Due gambe: in ginocchio. Morte: tutto
     spento, si crolla e ci si addormenta.
   Coordinate = pixel dello sprite (48x111, v. static/sprites/maschio/parti.json); -x = indietro (la CPU si specchia
   solo al disegno). Nessun DOM: gira in Node (test_fisica.js) e nel browser (arena.js). */
const Pupazzo = (() => {
  const F = typeof require !== "undefined" ? require("./fisica.js") : Fisica;
  const {lim} = F;
  const PI = Math.PI;
  const lerp = (a, b, t) => a + (b - a) * t;
  const liscio = t => { t = lim(t, 0, 1); return t * t * (3 - 2 * t); };

  /* ---- il corpo: pezzi, masse, capsule. `da`/`a` sono i giunti dell'osso (parti.json); la capsula va dal punto t0 al
     punto t1 dell'osso con raggio r; `frac` e' la quota di massa (proporzioni antropometriche). */
  const MASSA = 70;
  const CORPI = {
    busto_inf:      {da: "vita", a: "anca",         frac: 0.20,  t0: 0.35, t1: 0.75, r: 6},
    busto_sup:      {da: "vita", a: "collo_alto",   frac: 0.30,  t0: 0.25, t1: 0.70, r: 6},
    testa:          {da: "collo_alto", a: "cima",   frac: 0.081, t0: 0.35, t1: 0.65, r: 7.5},
    braccio_sup_dx: {da: "spalla_dx", a: "gomito_dx", frac: 0.027, t0: 0.1, t1: 0.9, r: 3},
    avambraccio_dx: {da: "gomito_dx", a: "polso_dx",  frac: 0.022, t0: 0.1, t1: 0.95, r: 3},
    braccio_sup_sx: {da: "spalla_sx", a: "gomito_sx", frac: 0.027, t0: 0.1, t1: 0.9, r: 3},
    avambraccio_sx: {da: "gomito_sx", a: "polso_sx",  frac: 0.022, t0: 0.1, t1: 0.95, r: 3},
    coscia_dx:      {da: "anca_dx", a: "ginocchio_dx", frac: 0.10, t0: 0.15, t1: 0.95, r: 4},
    stinco_dx:      {da: "ginocchio_dx", a: "caviglia_dx", frac: 0.0465, t0: 0.12, t1: 0.95, r: 3.5},
    coscia_sx:      {da: "anca_sx", a: "ginocchio_sx", frac: 0.10, t0: 0.15, t1: 0.95, r: 4},
    stinco_sx:      {da: "ginocchio_sx", a: "caviglia_sx", frac: 0.0465, t0: 0.12, t1: 0.95, r: 3.5},
    piede_dx:       {frac: 0.045, piede: "dx"},      // (piu' pesanti del vero: reggono il corpo senza assistenza)
    piede_sx:       {frac: 0.045, piede: "sx"},
  };
  /* il piede e' l'ultima parte dello stinco: sotto la caviglia. Tallone e punta (centri delle capsule, raggio 2.5) */
  const PIEDE = {tallone: [-1.5, 6.5], punta: [11, 6.5], r: 2.5};

  /* giunti: [nome, genitore, figlio, giunto-ancoraggio, [min, max] rad, locazione, taratura del motore] */
  const GIUNTI = [
    ["vita_", "busto_inf", "busto_sup", "vita", [-0.55, 0.65], "busto"],
    ["collo", "busto_sup", "testa", "collo_alto", [-0.7, 0.7], "testa"],
    ["spalla_dx", "busto_sup", "braccio_sup_dx", "spalla_dx", [-3.1, 1.0], "braccio_dx"],
    ["gomito_dx", "braccio_sup_dx", "avambraccio_dx", "gomito_dx", [-2.7, 0.04], "braccio_dx"],
    ["spalla_sx", "busto_sup", "braccio_sup_sx", "spalla_sx", [-3.1, 1.0], "braccio_sx"],
    ["gomito_sx", "braccio_sup_sx", "avambraccio_sx", "gomito_sx", [-2.7, 0.04], "braccio_sx"],
    ["anca_dx", "busto_inf", "coscia_dx", "anca_dx", [-2.0, 0.8], "gamba_dx"],
    ["ginocchio_dx", "coscia_dx", "stinco_dx", "ginocchio_dx", [-0.04, 2.6], "gamba_dx"],
    ["caviglia_dx", "stinco_dx", "piede_dx", "caviglia_dx", [-0.7, 0.8], "gamba_dx"],
    ["anca_sx", "busto_inf", "coscia_sx", "anca_sx", [-2.0, 0.8], "gamba_sx"],
    ["ginocchio_sx", "coscia_sx", "stinco_sx", "ginocchio_sx", [-0.04, 2.6], "gamba_sx"],
    ["caviglia_sx", "stinco_sx", "piede_sx", "caviglia_sx", [-0.7, 0.8], "gamba_sx"],
  ];

  /* taratura dei muscoli: [frequenza Hz, smorzamento, coppia massima]. Alta = rigido, bassa = molle. */
  const MUSCOLI = {
    vita_: [12, 1.2, 2e6], collo: [8, 0.7, 2e5],
    spalla_dx: [14, 0.8, 4e5], gomito_dx: [14, 0.8, 3e5], spalla_sx: [14, 0.8, 4e5], gomito_sx: [14, 0.8, 3e5],
    anca_dx: [22, 1, 3e6], ginocchio_dx: [22, 1, 2.5e6], caviglia_dx: [30, 1, 2e6],
    anca_sx: [22, 1, 3e6], ginocchio_sx: [22, 1, 2.5e6], caviglia_sx: [30, 1, 2e6],
  };
  /* quando un muscolo e' spento (arto storpio, morte) le articolazioni restano un po' frenate: un ragdoll non e'
     un pendolo infinito. Coppia per rad/s. */
  const ATTRITO_GIUNTO = 4500;
  /* quanto un muscolo cede quando il tono cala (colpo subito): le gambe poco (reggono il corpo), il resto molto */
  const SENS = {vita_: 0.8, collo: 1, spalla_dx: 1, gomito_dx: 1, spalla_sx: 1, gomito_sx: 1,
                anca_dx: 0.2, ginocchio_dx: 0.2, caviglia_dx: 0.1, anca_sx: 0.2, ginocchio_sx: 0.2, caviglia_sx: 0.1};

  /* locazione di gioco -> corpi che la compongono */
  const LOC = {
    testa: ["testa"], busto: ["busto_sup", "busto_inf"],
    braccio_dx: ["braccio_sup_dx", "avambraccio_dx"], braccio_sx: ["braccio_sup_sx", "avambraccio_sx"],
    gamba_dx: ["coscia_dx", "stinco_dx", "piede_dx"], gamba_sx: ["coscia_sx", "stinco_sx", "piede_sx"],
  };
  const LATI = ["dx", "sx"];

  /* posa di guardia e passi */
  const T = {
    avanti: 5,               // il bacino sta cosi' tanti px davanti alle caviglie: il peso cade a meta' piede
    sprofonda: 2.6,          // il bacino sta cosi' tanti px sotto la posizione a gambe tese: ginocchia piegate
    offPiede: {dx: 5, sx: -5},        // dove stanno le caviglie rispetto al centro d'appoggio
    guardia: {dx: [14, -7], sx: [11, -4]},   // mani in guardia, relative alla spalla (avanti, su)
    passoSoglia: 6.5,        // il corpo e' scappato tanto dai piedi: si fa un passo
    passoSogliaCalmo: 3.0,   // da calmo si rifinisce di piu'
    passoMax: 26, passoAlt: 4.5, passoDur: 0.15, passoPausa: 0.02,
    calma: 0.35,             // secondi senza colpi prima di tornare a casa
    pesoMolla: 0.6,          // quota del peso (di cio' che sta sopra il bacino) che regge la molla; il resto lo portano le gambe
    muPiede: 2,              // attrito dei piedi col pavimento (alto: carichi poco, la molla regge parte del peso)
    hzSostegno: 6,           // frequenza della molla che regge il bacino in verticale
    hzSostX: 3,              // ...e in orizzontale (piu' morbida: un colpo sposta il corpo, poi torna)
    smorzaBacino: 20,        // 1/s: smorzamento della rotazione del bacino (sostegno e raddrizzamento li fanno le anche)
    forzaMax: 0.9,           // forza massima orizzontale della molla, in multipli del peso sostenuto
    frena: 700,              // px/s^2: con quanta forza si frena una scivolata (distanza = v^2 / (2 frena))
    muScivola: 0.003,        // attrito dei piedi mentre si scivola (quasi nullo: a frenare ci pensa lo stesso campo per tutto il corpo)
    velCasa: 60,             // px/s: a che velocita' il centro d'appoggio torna a casa
  };

  const cinema = (H, Tp, l1, l2, s) => {
    /* cinematica inversa a due ossa nel piano. Angolo di un osso = rotazione oraria dal "giu'" (come i corpi).
       s = +1: il gomito sporge all'indietro (braccia), -1: il ginocchio sporge in avanti (gambe). */
    const dx = Tp[0] - H[0], dy = Tp[1] - H[1];
    const d = lim(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.3);
    const psi = Math.atan2(-dx, dy);
    const al = Math.acos(lim((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const t1 = psi + s * al;
    const ex = H[0] - l1 * Math.sin(t1), ey = H[1] + l1 * Math.cos(t1);
    const t2 = Math.atan2(-(Tp[0] - ex), Tp[1] - ey);
    return [t1, t2, [ex, ey], d >= l1 + l2 - 0.31];
  };

  /* ---------------------------------------------------------------------------------------------------------------
     Azioni: ognuna ritocca per un po' la posa voluta (passo(dt, p) -> vero finche' dura) e poi finisce. Non muovono
     niente da sole: il motore fisico segue la posa con i muscoli, quindi ogni movimento ha inerzia, strattone e
     ritorno. Le coordinate sono locali al pupazzo (+x = verso l'avversario).
     --------------------------------------------------------------------------------------------------------------- */
  const easeOut = u => 1 - (1 - u) * (1 - u);
  const easeIn = u => u * u;
  const bump = u => Math.sin(PI * lim(u, 0, 1));          // 0 -> 1 -> 0

  const T_MAX_AVANZATA = 16;                              // quanto al massimo si avanza in un attacco (px)

  /* un colpo in mischia o a distanza: carica, colpo, tenuta, recupero. Il braccio che colpa insegue il bersaglio
     (se `o.insegui`), il busto si carica all'indietro e si lancia in avanti, il bacino avanza (i piedi lo seguono). */
  class Attacco {
    constructor(pup, o) {
      this.pup = pup; this.o = o;
      this.mano = o.mano || "dx";
      this.Tc = o.carica ?? 0.16; this.Ts = o.colpo ?? 0.1; this.Th = o.tenuta ?? 0.06; this.Tr = o.recupero ?? 0.32;
      this.t = 0; this.fase = 0; this.dist = !!o.distanza;
      this.stile = o.stile || "pugno";           // pugno | fendente (dall'alto in basso) | affondo (in linea, con piu' slancio)
      this.m0 = null; this.mT = null; this.mCont = null;       // mano a inizio colpo, bersaglio congelato, punto di contatto
      this.avanti = 0; this.giu = 0;
    }
    /* il bersaglio, e se non si insegue resta quello visto a inizio colpo */
    _bersaglio() {
      const b = this.o.bersaglio();
      if (this.o.insegui) return b;
      if (!this.mT) this.mT = b;
      return this.mT;
    }
    passo(dt, p) {
      const o = this.o, pup = this.pup, l = this.mano, altra = l === "dx" ? "sx" : "dx";
      this.t += dt;
      const guardia = p.mani[l].slice();
      p.scalaBraccio[l] = this.fase === 1 ? 3.2 : 2.0;
      const giu = this.giu;
      if (this.fase === 0) {                                   // ---- carica
        const u = lim(this.t / this.Tc, 0, 1), e = easeOut(u);
        if (o.alAnticipo && !this.anticipato && this.t >= this.Tc - (o.anticipo || 0)) { this.anticipato = true; o.alAnticipo(); }
        // la mano si ritrae di poco (il braccio e' lungo: un gomito troppo piegato sporgerebbe come un'ala di pollo)
        let m;
        if (this.dist) m = [guardia[0] - 4, guardia[1] + 2];
        else if (this.stile === "fendente") m = [-1, -19];                  // la mano sale sopra la spalla
        else if (this.stile === "affondo") m = [guardia[0] - 9, guardia[1] + 5];
        else m = [guardia[0] - 7, guardia[1] + 4];
        p.busto += -0.14 * e * (this.dist ? 0.4 : this.stile === "fendente" ? 1.2 : 1);
        p.sprofonda += (this.stile === "affondo" ? 2.2 : 1.4) * e;
        p.mani[l] = [lerp(guardia[0], m[0], e), lerp(guardia[1], m[1], e)];
        p.mani[altra][0] += 2.5 * e; p.mani[altra][1] -= 1.5 * e;
        p.avanza = -2.5 * e;
        if (this.t >= this.Tc) { this.fase = 1; this.t = 0; this.m0 = pup._polso(l); this.bersagliAvanti(); if (o.alColpoInizio) o.alColpoInizio(); }
        return true;
      }
      if (this.fase === 1) {                                   // ---- colpo
        const u = lim(this.t / this.Ts, 0, 1);
        const T = this._bersaglio();
        p.busto += lerp(-0.04, this.dist ? 0.12 : 0.20, liscio(u)) - 0.10 + 0.25 * giu / 26 * u;
        p.sprofonda += lerp(1.4, 0.4, u) + giu * easeOut(u);
        p.avanza = lerp(-2.5, this.avanti, easeOut(u));
        p.velXs = 190;
        p.passoVeloce = true;
        p.manoMondo[l] = this._mano(pup, u, T, p);
        p.mani[altra][0] -= 3 * u;
        // il contatto arriva quando la mano e' davvero al bersaglio (o, al piu', poco dopo): il braccio ha un po' di ritardo
        const mano = pup._polso(l);
        if (u >= 1 && (this.dist || Math.hypot(mano[0] - T[0], mano[1] - T[1]) < 4.5 || this.t > this.Ts + 0.2)) {
          this.fase = 2; this.t = 0; this.mCont = mano;
          if (o.alContatto) o.alContatto({x: this.mCont[0], y: this.mCont[1], bersaglio: T});
        }
        return true;
      }
      if (this.fase === 2) {                                   // ---- tenuta: il braccio resta, il corpo accompagna
        const T = this._bersaglio();
        p.busto += (this.dist ? 0.12 : 0.20) - 0.10 + 0.25 * giu / 26;
        p.sprofonda += 0.4 + giu;
        p.avanza = this.avanti; p.velXs = 200; p.passoVeloce = true;
        p.manoMondo[l] = this.mT && !this.o.insegui ? this.mT : T;
        if (this.t >= this.Th) { this.fase = 3; this.t = 0; }
        return true;
      }
      // ---- recupero: torna in guardia
      const u = lim(this.t / this.Tr, 0, 1), e = liscio(u);
      const T = this.o.insegui ? this._bersaglio() : this.mT;
      const S = pup._spalla(l);
      const gW = [S[0] + guardia[0], S[1] + guardia[1]];
      p.manoMondo[l] = [lerp(T[0], gW[0], e), lerp(T[1], gW[1], e)];
      p.busto += lerp(this.dist ? 0.12 : 0.20, 0.10, e) - 0.10 + 0.25 * giu / 26 * (1 - e);
      p.sprofonda += lerp(0.4, 0, e) + giu * (1 - e);
      p.avanza = lerp(this.avanti, 0, e);
      p.scalaBraccio[l] = 1.6;
      if (u >= 1) { if (o.alFine) o.alFine(); return false; }
      return true;
    }
    /* quanto avanzare per raggiungere il bersaglio: la distanza spalla-bersaglio meno il raggio del braccio */
    bersagliAvanti() {
      const T = this.o.bersaglio(), S = this.pup._spalla(this.mano);
      // un bersaglio basso (le gambe): ci si abbassa sulle ginocchia e ci si piega in avanti per arrivarci col braccio
      const dy = T[1] - S[1];
      this.giu = this.dist ? 0 : lim(dy - 28, 0, 26);
      if (this.dist) { this.avanti = 0; return; }
      const [l1, l2] = this.pup.L["braccio_" + this.mano];
      // quanto manca in orizzontale una volta tolto cio' che il braccio copre in diagonale (se il bersaglio e' basso, meno)
      const arrivo = Math.sqrt(Math.max(0, ((l1 + l2) * 0.86) ** 2 - Math.max(0, dy - this.giu) ** 2));
      this.avanti = lim((T[0] - S[0]) - arrivo - 6 /* la spalla si porta avanti col busto */, 0, T_MAX_AVANZATA + this.giu * 0.3);
      if (this.stile === "affondo") this.avanti = Math.min(T_MAX_AVANZATA, this.avanti + 2);
    }
    /* dove mirare con la mano: dalla posizione a inizio colpo al bersaglio (a distanza: il braccio si punta e basta) */
    _mano(pup, u, T, p) {
      if (this.dist) {
        const S = pup._spalla(this.mano), [l1, l2] = pup.L["braccio_" + this.mano];
        const dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy) || 1, r = (l1 + l2) * 0.97;
        const P = [S[0] + dx / d * r, S[1] + dy / d * r];
        const e = easeOut(u);
        return [lerp(this.m0[0], P[0], e), lerp(this.m0[1], P[1], e)];
      }
      const v = Math.min(1, u / 0.8);                           // il bersaglio e' raggiunto un po' prima della fine: il braccio ritarda
      const e = easeIn(v) * 0.5 + liscio(v) * 0.5;
      if (this.stile === "fendente") {                          // un arco: prima in avanti, poi giu' sul bersaglio
        return [lerp(this.m0[0], T[0], easeOut(v) * 0.7 + e * 0.3), lerp(this.m0[1], T[1], easeIn(v) * 0.6 + e * 0.4)];
      }
      return [lerp(this.m0[0], T[0], e), lerp(this.m0[1], T[1], e)];
    }
  }

  /* schivata: `indietro` (busto, colpi al corpo), `abbassa` (testa), `salto` (gambe) */
  class Schivata {
    constructor(pup, tipo, o = {}) {
      this.pup = pup; this.tipo = tipo; this.t = 0; this.o = o;
      this.dur = tipo === "salto" ? 0.66 : tipo === "abbassa" ? 0.46 : 0.42;
      this.partita = false;
    }
    passo(dt, p) {
      const pup = this.pup, u = lim(this.t / this.dur, 0, 1), b = bump(u), tipo = this.tipo;
      if (!this.partita) {
        this.partita = true;
        if (tipo === "indietro") pup.spingiTutto(-165, -30);
        if (tipo === "salto") { pup.spingiTutto(-85, -215); }
        if (tipo === "abbassa") pup.spingiTutto(-55, 0);
      }
      this.t += dt;
      if (tipo === "indietro") {
        p.busto += -0.34 * b; p.testa += -0.15 * b; p.sprofonda += 1.6 * b;
        p.mani.dx[1] -= 5 * b; p.mani.sx[1] -= 4 * b; p.mani.dx[0] -= 4 * b;
      } else if (tipo === "abbassa") {
        p.sprofonda += 15 * Math.min(1, b * 1.6); p.busto += 0.28 * b; p.testa += 0.2 * b;
        p.mani.dx[1] -= 3 * b; p.mani.sx[1] -= 3 * b;
      } else {
        p.sostegno *= u < 0.5 ? 0 : liscio((u - 0.5) / 0.25);                            // in volo non regge piu' il bacino
        p.alzaPiedi = 10 * Math.sin(PI * lim(u / 0.62, 0, 1));
        p.busto += -0.1 * b; p.mani.dx[1] -= 4 * b; p.mani.sx[1] -= 4 * b;
      }
      return u < 1;
    }
  }

  /* parata: la mano (di norma l'anteriore) va incontro al punto d'impatto, resta e poi torna */
  class Parata {
    constructor(pup, o) { this.pup = pup; this.o = o; this.t = 0; this.mano = o.mano || "dx"; }
    passo(dt, p) {
      const o = this.o, l = this.mano, S = this.pup._spalla(l);
      this.t += dt;
      const tIn = o.entra ?? 0.14, tOut = o.esce ?? 0.28;
      const quando = o.tieni ?? 0.25;
      let e;
      if (this.t < tIn) e = easeOut(this.t / tIn);
      else if (this.t < tIn + quando) e = 1;
      else e = 1 - liscio((this.t - tIn - quando) / tOut);
      const T = o.punto();
      const gW = [S[0] + p.mani[l][0], S[1] + p.mani[l][1]];
      p.manoMondo[l] = [lerp(gW[0], T[0], e), lerp(gW[1], T[1], e)];
      p.scalaBraccio[l] = 2.2;
      p.mani[l === "dx" ? "sx" : "dx"][1] -= 1.5 * e;
      p.busto += -0.05 * e; p.sprofonda += 0.6 * e;
      return this.t < tIn + quando + tOut;
    }
  }

  /* un gesto che non e' un colpo: puntare l'avversario (mira), caricare un potere, assumere una stance */
  class Gesto {
    constructor(pup, tipo, o = {}) { this.pup = pup; this.tipo = tipo; this.o = o; this.t = 0; this.dur = tipo === "mira" ? 0.7 : tipo === "potere" ? 0.85 : 0.5; }
    passo(dt, p) {
      const pup = this.pup, u = lim(this.t / this.dur, 0, 1), b = bump(u), k = Math.min(1, u / 0.25) * (u > 0.75 ? Math.max(0, (1 - u) / 0.25) : 1);
      this.t += dt;
      if (this.tipo === "mira") {                              // si china in avanti e punta la mano dove vuole colpire
        const S = pup._spalla("dx"), T = this.o.bersaglio ? this.o.bersaglio() : [S[0] + 40, S[1]];
        const dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy) || 1, r = 40;
        const gW = [S[0] + p.mani.dx[0], S[1] + p.mani.dx[1]];
        p.manoMondo.dx = [lerp(gW[0], S[0] + dx / d * r, k), lerp(gW[1], S[1] + dy / d * r, k)];
        p.busto += 0.1 * k; p.sprofonda += 1.5 * k; p.scalaBraccio.dx = 1.6;
      } else if (this.tipo === "potere") {                     // si raccoglie e si espande: pugni al petto, poi braccia aperte
        p.sprofonda += 2.5 * Math.sin(PI * Math.min(1, u * 1.4)); p.busto += -0.12 * k;
        const chiuso = Math.min(1, u / 0.45), aperto = Math.max(0, (u - 0.45) / 0.3) * (u > 0.8 ? Math.max(0, (1 - u) / 0.2) : 1);
        for (const l of LATI) {
          const g = p.mani[l];
          p.mani[l] = [lerp(lerp(g[0], 6, chiuso), 10 + (l === "sx" ? -2 : 0), aperto), lerp(lerp(g[1], 2, chiuso), 12, aperto)];
        }
        p.scalaBraccio.dx = p.scalaBraccio.sx = 1.5;
      } else {                                                 // stance: un breve assestamento
        p.sprofonda += 3 * b; p.busto += 0.08 * b;
      }
      return this.t < this.dur;
    }
  }

  class Pupazzo {
    /* man = parti.json; o.casa = x del bacino a riposo (default: quello dello sprite) */
    constructor(man, o = {}) {
      this.man = man;
      const G = man.giunti;
      this.pav = man.canvas[1];
      this.mondo = new F.Mondo({pavimento: this.pav, sotto: 4, hzContatto: 60});
      this.corpi = {}; this.giunti = {}; this.rest = {};
      const pt = k => G[k];
      for (const [nome, d] of Object.entries(CORPI)) {
        let caps;
        if (d.piede) {
          const c = pt("caviglia_" + d.piede);
          caps = [{x1: c[0] + PIEDE.tallone[0], y1: c[1] + PIEDE.tallone[1], x2: c[0] + PIEDE.punta[0], y2: c[1] + PIEDE.punta[1], r: PIEDE.r}];
        } else {
          const A = pt(d.da), B = pt(d.a);
          caps = [{x1: lerp(A[0], B[0], d.t0), y1: lerp(A[1], B[1], d.t0), x2: lerp(A[0], B[0], d.t1), y2: lerp(A[1], B[1], d.t1), r: d.r}];
        }
        const c = caps[0], cx = (c.x1 + c.x2) / 2, cy = (c.y1 + c.y2) / 2, L = Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + 2 * c.r;
        const m = d.frac * MASSA;
        const forme = [{ax: c.x1 - cx, ay: c.y1 - cy, bx: c.x2 - cx, by: c.y2 - cy, r: c.r}];
        const b = this.mondo.corpo({nome, x: cx, y: cy, m, I: F.asta(L, m, c.r) * 1.15, forme, mu: nome.startsWith("piede") ? T.muPiede : 0.8, e: 0.08});
        this.corpi[nome] = b;
        this.rest[nome] = {x: cx, y: cy};
      }
      this.loc = {};
      for (const [nome, A, B, anc, lm, loc] of GIUNTI) {
        const a = this.corpi[A], b = this.corpi[B], p = pt(anc);
        const j = this.mondo.giunto(a, b, [p[0] - this.rest[A].x, p[1] - this.rest[A].y], [p[0] - this.rest[B].x, p[1] - this.rest[B].y],
                                    {lim: lm, nome, attrito: ATTRITO_GIUNTO});
        this.giunti[nome] = j; this.loc[nome] = loc;
        const [hz, zeta, cm] = MUSCOLI[nome];
        j.motore(hz, zeta, cm, 0);
      }
      // lunghezze delle ossa degli arti (per la cinematica inversa) e punti d'ancoraggio
      const dist = (a, b) => Math.hypot(G[a][0] - G[b][0], G[a][1] - G[b][1]);
      this.L = {};
      for (const l of LATI) {
        this.L["gamba_" + l] = [dist("anca_" + l, "ginocchio_" + l), dist("ginocchio_" + l, "caviglia_" + l)];
        this.L["braccio_" + l] = [dist("spalla_" + l, "gomito_" + l), dist("gomito_" + l, "polso_" + l)];
      }
      this.alt = this.pav - G.caviglia_dx[1];       // altezza della caviglia da terra (px)
      // stato di controllo
      this.t = 0; this.tono = 1; this.morto = false;
      this.gain = {}; this.gainT = {};
      for (const l of Object.keys(LOC)) { this.gain[l] = 1; this.gainT[l] = 1; }
      this.casa = o.casa ?? G.anca[0];
      this.xs = this.casa;                          // centro d'appoggio: dove il corpo vuole stare (lo seguono bacino e piedi)
      this.vxs = 0; this.velXs = T.velCasa;         // velocita' con cui si muove, e il suo massimo
      this.calma = 999;                             // secondi dall'ultimo colpo
      this.piede = {};
      for (const l of LATI) {
        this.piede[l] = {x: this.casa + T.offPiede[l], stato: "a", x0: 0, x1: 0, t: 0, dur: 0, alt: 0, peso: 1, vivo: true};
      }
      this.pausa = 0; this.nPassi = 0; this.ultimoPiede = null;
      this.vento = {x: 0};                          // accelerazione orizzontale della molla di sostegno nell'ultimo passo (diagnostica)
      this.muro = [-1e9, 1e9];
      this.mondo.muro = this.muro;
      this.avanza = 0;                              // quanto l'appoggio e' voluto davanti a casa (affondi)
      this.scivola = false;                         // spinto da un colpo: il corpo scivola come un blocco
      this.azioni = [];                             // azioni in corso (attacchi, schivate, parate)
      this.passoVeloce = false; this.seduto = false; this.appoggio = null; this.sedutoX = null; this.cedimento = 0;
      this.corpoTot = Object.values(this.corpi).reduce((s, b) => s + b.m, 0);
      // massa e inerzia sostenute dal bacino (bacino, busto, testa, braccia)
      const su = ["busto_inf", "busto_sup", "testa", "braccio_sup_dx", "avambraccio_dx", "braccio_sup_sx", "avambraccio_sx"];
      this.massaSu = su.reduce((s, n) => s + this.corpi[n].m, 0);
      const B0 = this.corpi.busto_inf;
      this.inerziaSu = su.reduce((s, n) => { const b = this.corpi[n]; return s + b.I + b.m * ((b.x - B0.x) ** 2 + (b.y - B0.y) ** 2); }, 0);
      this.sostegno = 1;                            // 0..1: quanto la molla regge il bacino in verticale (0 in volo)
      // si assesta nella posa di guardia prima di mostrarsi (coi piedi scivolosi: raggiungono subito il loro posto)
      for (const l of LATI) this.corpi["piede_" + l].mu = 0.1;
      this.assesta(70);
      for (const l of LATI) this.corpi["piede_" + l].mu = T.muPiede;
      for (const b of Object.values(this.corpi)) { b.vx = b.vy = b.w = 0; }
      this.assesta(70);
      this.nPassi = 0;
    }

    /* ---- API ---- */
    muri(min, max) { this.muro[0] = min; this.muro[1] = max; this.mondo.sveglia(); }

    /* il muro davanti (verso l'avversario) si sposta con lui: non si aggiorna il sonno */
    muroDavanti(x) { this.muro[1] = x; }

    /* centro della locazione, per mirarci */
    punto(loc) {
      const c = this.corpi;
      switch (loc) {
        case "testa": return [c.testa.x, c.testa.y];
        case "busto": return [lerp(c.busto_sup.x, c.busto_inf.x, 0.3), lerp(c.busto_sup.y, c.busto_inf.y, 0.3)];
        case "braccio_dx": return [c.avambraccio_dx.x, c.avambraccio_dx.y];
        case "braccio_sx": return [c.avambraccio_sx.x, c.avambraccio_sx.y];
        case "gamba_dx": return [lerp(c.coscia_dx.x, c.stinco_dx.x, 0.5), lerp(c.coscia_dx.y, c.stinco_dx.y, 0.5)];
        case "gamba_sx": return [lerp(c.coscia_sx.x, c.stinco_sx.x, 0.5), lerp(c.coscia_sx.y, c.stinco_sx.y, 0.5)];
      }
      return [c.busto_inf.x, c.busto_inf.y];
    }

    /* il punto della locazione dove un colpo la raggiunge: lo spigolo davanti */
    fronte(loc) {
      const [x, y] = this.punto(loc);
      return [x + (loc === "testa" ? 7 : loc === "busto" ? 6 : 3), y];
    }

    /* locazione storpiata (o guarita): i muscoli di quell'arto si spengono (o riaccendono) */
    storpia(loc, si, subito = false) {
      if (!(loc in this.gain)) return;
      const eraSana = this.gainT[loc] > 0.5;
      this.gainT[loc] = si ? 0 : 1;
      if (subito) this.gain[loc] = this.gainT[loc];
      // un arto che cede parte con un piccolo scossone: senza, un avambraccio in equilibrio instabile ci metterebbe secondi a cadere
      if (si && eraSana && loc.startsWith("braccio")) { const l = loc.slice(8); this.corpi["avambraccio_" + l].w += 1.6; this.corpi["braccio_sup_" + l].w += 0.8; }
      this.mondo.sveglia();
    }

    /* il colpo di grazia: muscoli e molla di sostegno spenti, il corpo cade (nel verso del colpo) */
    muori(forza = 0.5, dir = [-1, -0.1]) {
      this.morto = true; this.mondo.sonno = true;
      for (const l of Object.keys(this.gain)) { this.gainT[l] = 0; this.gain[l] = 0; }
      this.tono = 0; this.scivola = false;
      for (const l of LATI) this.corpi["piede_" + l].mu = 0.8;
      const v = lim(45 + 75 * forza, 45, 150);
      for (const b of Object.values(this.corpi)) { b.vx += dir[0] * v; b.vy += -25; }
      this.corpi.testa.vx += dir[0] * 90; this.corpi.busto_sup.w += 1.8 * (dir[0] < 0 ? -1 : 1);
      this.mondo.sveglia();
    }

    /* colpo subito: `forza` ~ danno/90 (0.1 leggero ... 2 devastante), `dir` = verso del colpo (unitario, nel sistema
       di questo corpo: tipicamente indietro, un filo in su), (px, py) = punto d'impatto (se manca, il centro) */
    colpisci(loc, forza, dir = [-1, -0.12], px, py) {
      const m = this.mondo, c = this.corpi;
      forza = lim(forza, 0.05, 2.4);
      // 1. il corpo intero parte: velocita' proporzionale alla forza; scivola come un blocco e si ferma da solo
      const vc = lim(45 + 170 * forza, 45, 300);
      for (const b of Object.values(c)) { b.vx += dir[0] * vc; b.vy += dir[1] * vc * 0.3; }
      this._iniziaScivolata();
      // 2. la parte colpita prende uno strattone in piu', nel punto d'impatto: il collo si piega, il busto si inarca
      const parti = LOC[loc] || ["busto_sup"];
      const [ix, iy] = px === undefined ? this.punto(loc) : [px, py];
      const vl = lim(90 + 330 * forza, 90, 640) * (loc === "testa" ? 1.15 : 1);
      let px_ = 0, py_ = 0;
      for (const n of parti) {
        const b = c[n], dm = b.m * (1 / parti.length), jx = dir[0] * vl * dm, jy = dir[1] * vl * dm;
        m.impulso(b, ix, iy, jx, jy); px_ += jx; py_ += jy;
      }
      // la quantita' di moto dello strattone locale non spinge il corpo intero (di quello si occupa `vc`): si toglie
      // a tutti, e resta soltanto lo scarto tra la parte colpita e il resto
      for (const b of Object.values(c)) { b.vx -= px_ / this.corpoTot; b.vy -= py_ / this.corpoTot; }
      // ...e la scossa la fa ruotare all'indietro: la testa scatta, il busto si inarca
      const verso = Math.sign(dir[0] || -1);                       // un colpo da davanti (dir -x) ruota all'indietro (antiorario, negativo)
      const rot = (loc === "testa" ? 7 : loc === "busto" ? 3.5 : 2) * (0.6 + forza) * verso;
      for (const n of parti) c[n].w += rot;
      if (loc === "busto") c.testa.w += 4 * (0.5 + forza) * verso;
      // 3. i muscoli cedono un istante: piu' forte il colpo, piu' a lungo e piu' a fondo
      this.tono = Math.min(this.tono, lim(0.55 - 0.3 * forza, 0.12, 0.5));
      this.calma = 0;
      m.sveglia();
    }

    /* ------------------------------------------------------------------------------------------------------ */
    /* posa voluta in questo istante (coordinate locali): guardia e piccoli movimenti a riposo. Le azioni (colpi,
       schivate...) ne ritoccano i campi. Gli angoli sono assoluti (orari), le mani relative alla spalla. */
    _posa(dt = 0) {
      const t = this.t;
      const p = {
        sprofonda: T.sprofonda + 0.5 * Math.sin(t * 5.4),       // il rimbalzo del pugile: ginocchia che molleggiano
        busto: 0.10 + 0.012 * Math.sin(t * 2.1),                // inclinazione del busto (avanti = +)
        bacino: 0.03,
        testa: -0.02 + 0.01 * Math.sin(t * 1.3),
        mani: {dx: T.guardia.dx.slice(), sx: T.guardia.sx.slice()},
        manoMondo: {dx: null, sx: null},                        // se impostata: bersaglio assoluto della mano (colpi)
        piede: 0,                                               // inclinazione voluta dei piedi (0 = piatti a terra)
        xs: this.xs,
        avanza: 0,                                              // quanto l'appoggio e' voluto davanti a casa
        velXs: T.velCasa, passoVeloce: false,                   // quanto in fretta si sposta, e se i passi sono rapidi
        sostegno: 1,                                            // quanto il bacino e' retto in verticale (0 in volo)
        alzaPiedi: 0,                                           // i piedi si raccolgono (salti)
        scalaBraccio: {dx: 1, sx: 1},                           // forza dei muscoli delle braccia
      };
      p.mani.dx[1] += 0.9 * Math.sin(t * 2.1 + 0.4); p.mani.sx[1] += 0.9 * Math.sin(t * 2.1 + 1.2);
      p.mani.dx[0] += 0.7 * Math.sin(t * 1.4);
      this.seduto = !this.morto && this.gain.gamba_dx < 0.5 && this.gain.gamba_sx < 0.5;
      this.mondo.sonno = this.morto || this.seduto;
      if (this.seduto) {
        // senza gambe: il bacino sta a terra, il busto resta dritto e le braccia sane si puntellano davanti
        this.cedimento = Math.min(1, this.cedimento + dt / 0.7);               // ci si abbassa piano, non di colpo
        p.busto = lerp(p.busto, 0.04, liscio(this.cedimento)); p.bacino = 0; p.testa = 0; p.sostegno = 1;
        p.sprofonda = lerp(p.sprofonda, 29, liscio(this.cedimento));
        if (this.sedutoX === null) this.sedutoX = this.corpi.busto_inf.x;
        if (this.appoggio === null) this.appoggio = this.corpi.busto_inf.x + 14;       // dove si puntellano le mani: fisso
        for (const l of LATI) if (this.gain["braccio_" + l] > 0.5) {
          p.manoMondo[l] = [this.appoggio + (l === "sx" ? -3 : 0), this.pav - 3];
          p.scalaBraccio[l] = 0.12;                                                      // puntelli molli: il bacino arriva a terra
        }
      } else { this.appoggio = null; this.sedutoX = null; this.cedimento = 0; }
      if (this.azioni.length) this.azioni = this.azioni.filter(a => a.passo(dt, p));
      this.avanza = p.avanza; this.velXs = p.velXs; this.sostegno = p.sostegno; this.passoVeloce = p.passoVeloce;
      return p;
    }

    /* ---- azioni ---- */
    /* dove e' la mano `l` (il polso, con la mano un paio di px piu' in la') nel mondo */
    _polso(l) {
      const b = this.corpi["avambraccio_" + l], G = this.man.giunti, r = this.rest["avambraccio_" + l], q = G["polso_" + l];
      return b.mondo(q[0] - r.x, q[1] - r.y);
    }
    /* velocita' (vx, vy) in piu' a tutto il corpo (i piedi non si staccano da soli: l'attrito li tiene, o lo scivolamento) */
    spingiTutto(vx, vy = 0) {
      for (const b of Object.values(this.corpi)) { b.vx += vx; b.vy += vy; }
      if (vx !== 0) this._iniziaScivolata();
      this.mondo.sveglia();
    }
    /* da ora il corpo scivola come un blocco: i piedi (senza attrito) restano dove sono rispetto al bacino */
    _iniziaScivolata() {
      if (!this.scivola) {
        const B = this.corpi.busto_inf;
        for (const l of LATI) this.piede[l].rel = this._caviglia(l)[0] - B.x;
      }
      this.scivola = true;
      for (const l of LATI) this.corpi["piede_" + l].mu = T.muScivola;
    }
    /* attacco: vedi la classe Attacco per le opzioni */
    attacca(o) { this.azioni.push(new Attacco(this, o)); this.calma = 0; }
    gesto(tipo, o) { this.azioni.push(new Gesto(this, tipo, o)); this.calma = 0; }
    schiva(tipo, o) { this.azioni.push(new Schivata(this, tipo, o)); this.calma = 0; }
    para(o) { this.azioni.push(new Parata(this, o)); this.calma = 0; }
    occupato() { return this.azioni.length > 0; }

    /* macchina dei passi: ogni piede e' piantato in un punto o e' in volo verso un altro. Si fa un passo (uno per
       volta) quando il corpo e' scappato dall'appoggio (spinta, affondo) e, da calmi, per tornare a casa. */
    _passi(dt, p, ferma = false) {
      const C = this.corpi, F_ = this.piede, g = this.gain;
      this.calma += dt; this.pausa -= dt;
      this._muoviXs(dt);
      p.xs = this.xs;
      for (const l of LATI) {
        const f = F_[l];
        const viva = g["gamba_" + l] > 0.5 && !this.morto;
        if (!viva) { f.vivo = false; f.stato = "a"; f.x = this._caviglia(l)[0]; f.px = f.x; f.peso = 0; f.alt = 0; continue; }
        if (!f.vivo) { f.vivo = true; f.stato = "a"; f.x = this._caviglia(l)[0]; }
        if (f.stato === "v") {
          f.t += dt;
          const u = lim(f.t / f.dur, 0, 1);
          f.px = lerp(f.x0, f.x1, liscio(u));
          f.alt = T.passoAlt * (0.6 + f.dist / 40) * Math.sin(PI * u);
          f.peso = 1 - Math.sin(PI * u);
          if (f.t >= f.dur) {
            // il piede ha un po' di ritardo sul bersaglio: si aspetta (poco) che arrivi, prima di piantarlo
            const ank = this._caviglia(l)[0];
            if (Math.abs(ank - f.x1) > 1.5 && f.t < f.dur + 0.16) { f.px = f.x1; f.alt = 0; f.peso = 0.5; }
            else { f.stato = "a"; f.x = ank; f.peso = 1; f.alt = 0; this.pausa = T.passoPausa; }
          }
        } else {
          // piantato: il punto d'appoggio e' dove il piede sta davvero (l'attrito lo tiene li'): le gambe non vanno
          // mai in tensione per recuperare qualche pixel
          f.x = this.scivola ? this.corpi.busto_inf.x + f.rel : this._caviglia(l)[0];
          f.px = f.x; f.alt = 0; f.peso = 1;
        }
      }
      if (this.morto || this.pausa > 0 || ferma || this.scivola) return;
      if (LATI.some(l => F_[l].stato === "v" || !F_[l].vivo)) return;
      const calmo = this.calma >= T.calma;
      // ogni piede vuole stare a `xs + offset`. Si muove per primo quello piu' lontano dal suo posto; il piede
      // anteriore (dx) non supera mai quello posteriore (sx), cosi' le gambe non si incrociano
      const soglia = this.passoVeloce ? 2.5 : calmo ? T.passoSogliaCalmo : T.passoSoglia;
      const err = {};
      // il posto vero dei piedi e' a casa (piu' l'eventuale affondo), non dove si trova adesso il centro d'appoggio, che
      // aspetta i piedi: ogni passo va il piu' lontano che le gambe permettono (non oltre cio' che arriva dal bacino)
      const ancora = this.casa + this.avanza;
      for (const l of LATI) err[l] = (ancora + T.offPiede[l]) - F_[l].x;
      // ...ma si alternano: dopo un passo, tocca all'altro piede (se ne ha bisogno)
      const ordine = LATI.filter(l => Math.abs(err[l]) > soglia).sort((a, b) =>
        (a === this.ultimoPiede ? 1 : 0) * 1e3 - (b === this.ultimoPiede ? 1 : 0) * 1e3 + Math.abs(err[b]) - Math.abs(err[a]));
      let scelto = null, x1 = 0;
      for (const l of ordine) {
        const anca = this._anca(l)[0];
        let mira = lim(ancora + T.offPiede[l] + lim(this.vxs * 0.08, -6, 6), anca - 14, anca + 14);
        if (l === "dx") mira = Math.max(mira, F_.sx.x + 3); else mira = Math.min(mira, F_.dx.x - 3);
        mira = lim(mira, F_[l].x - T.passoMax, F_[l].x + T.passoMax);
        if (Math.abs(mira - F_[l].x) >= 1.5) { scelto = l; x1 = mira; break; }
      }
      if (!scelto) return;
      const f = F_[scelto];
      f.stato = "v"; f.t = 0; f.x0 = f.x; f.x1 = x1; f.dist = Math.abs(x1 - f.x);
      f.dur = lim(T.passoDur * (0.7 + f.dist / 24), 0.12, 0.3) * (this.passoVeloce ? 0.55 : 1);
      f.px = f.x; this.nPassi++; this.ultimoPiede = scelto;
    }

    /* il centro d'appoggio insegue la posizione voluta (casa piu' l'affondo) con moto dolce; in una scivolata
       e' il corpo a dettarlo */
    _muoviXs(dt) {
      if (this.scivola) {
        const B = this.corpi.busto_inf;
        this.xs = B.x - T.avanti - (this.rest.busto_inf.x - this.man.giunti.anca[0]); this.vxs = B.vx;
        return;
      }
      // su una gamba sola non si cammina: il corpo resta sopra l'unico piede che regge (e non torna a casa)
      const vive = LATI.filter(l => this.piede[l].vivo);
      if (vive.length === 1) { this.xs = this.piede[vive[0]].x - T.offPiede[vive[0]]; this.vxs = 0; return; }
      const d = (this.casa + this.avanza) - this.xs;
      // il corpo non scappa dai piedi: se sono rimasti indietro di troppo, il centro d'appoggio li aspetta (si cammina
      // col passo, non scivolando in avanti con le gambe che inseguono)
      const offM = (T.offPiede.dx + T.offPiede.sx) / 2, F_ = this.piede;
      const mezzo = (F_.dx.x + F_.sx.x) / 2 - offM;
      const lag = Math.max(0, (this.xs - mezzo) * (Math.sign(d) || 1)), ferma = liscio((lag - 4) / 7);   // solo se i piedi restano indietro
      const vmax = this.velXs * (1 - 0.92 * ferma);
      const vd = lim(d * 7, -vmax, vmax);
      this.vxs += (vd - this.vxs) * (1 - Math.exp(-dt * (this.passoVeloce ? 30 : 16)));
      this.xs += this.vxs * dt;
    }

    _caviglia(l) { const j = this.giunti["caviglia_" + l]; return j.A.mondo(j.lax, j.lay); }
    _anca(l) { const j = this.giunti["anca_" + l]; return j.A.mondo(j.lax, j.lay); }
    _spalla(l) { const j = this.giunti["spalla_" + l]; return j.A.mondo(j.lax, j.lay); }

    /* traduce la posa voluta in obiettivi dei motori. Tutto in spazio dei giunti: gli angoli relativi si ricavano dalla
       posa NOMINALE (bacino sopra i piedi, busto inclinato...), non da quella attuale: cosi' i muscoli reggono il peso e
       tengono la forma, e se qualcosa spinge il corpo la forma lo richiama. */
    _pilota(p, dt) {
      const J = this.giunti, G = this.man.giunti;
      const tono = this.tono;
      const setMot = (nome, obiettivo, scala = 1) => {
        const j = J[nome], [hz, zeta, cm] = MUSCOLI[nome];
        const k = (this.gain[this.loc[nome]] ?? 1) * lerp(1, tono, SENS[nome]) * scala;
        if (k < 0.03) { j.hz = 0; j.coppiaMax = 0; return; }
        j.motore(hz * Math.sqrt(k), zeta, cm * k, obiettivo);
      };
      setMot("vita_", p.busto - p.bacino);
      setMot("collo", p.testa - p.busto);
      // ---- bacino nominale: sopra la media dei piedi, a `sprofonda` px sotto la posizione a gambe tese
      const F_ = this.piede;
      const xc = this.xs + T.avanti;                             // x nominale del centro del bacino
      const dy = p.sprofonda;
      for (const l of LATI) {
        const [l1, l2] = this.L["gamba_" + l], f = F_[l];
        // le gambe partono dall'anca VERA (il peso lo regge la molla del bacino, non le gambe): cosi' non vanno mai in
        // tensione, comunque si muova il bacino; devono solo mettere il piede dove deve stare
        const H = this._anca(l);
        const Tp = [f.px, this.pav - this.alt - f.alt + 0.4 - p.alzaPiedi];
        const [t1, t2] = cinema(H, Tp, l1, l2, -1);
        if (this.gain["gamba_" + l] > 0.5 && !this.morto) {
          setMot("anca_" + l, t1 - p.bacino);
          setMot("ginocchio_" + l, t2 - t1);
          setMot("caviglia_" + l, p.piede - t2 + (f.stato === "v" ? 0.1 : 0));
        } else if (this.seduto) {
          // senza gambe ci si inginocchia: la coscia in verticale, lo stinco disteso a terra dietro (un puntello che
          // regge il bacino, e che il resto del corpo non deve fare per forza di cose)
          J["anca_" + l].motore(14, 1, 1.2e6, 0); J["ginocchio_" + l].motore(14, 1, 1.2e6, 1.57); J["caviglia_" + l].motore(10, 1, 4e5, 0.5);
        } else {
          for (const n of ["anca_", "ginocchio_", "caviglia_"]) setMot(n + l, 0, 0);
        }
      }
      // ---- braccia: la mano mira a un punto relativo alla spalla nominale (guardia) o assoluto (colpi)
      const vit = [G.vita[0] + (xc - G.anca[0]), G.vita[1] + dy], cb = Math.cos(p.busto), sb = Math.sin(p.busto);
      for (const l of LATI) {
        const [l1, l2] = this.L["braccio_" + l];
        const s0 = [G["spalla_" + l][0] - G.vita[0], G["spalla_" + l][1] - G.vita[1]];
        const S0 = p.manoMondo[l] ? this._spalla(l) : [vit[0] + cb * s0[0] - sb * s0[1], vit[1] + sb * s0[0] + cb * s0[1]];
        const m = p.mani[l], Tm = p.manoMondo[l] || [S0[0] + m[0], S0[1] + m[1]];
        const [t1, t2] = cinema(S0, Tm, l1, l2, +1);
        // un bersaglio nel mondo (colpi, parate) si mira con l'inclinazione VERA del busto: se il busto sbanda, il braccio
        // compensa e la mano arriva dove deve; in guardia invece segue la posa nominale
        setMot("spalla_" + l, t1 - (p.manoMondo[l] ? this.corpi.busto_sup.a : p.busto), p.scalaBraccio[l]);
        setMot("gomito_" + l, t2 - t1, p.scalaBraccio[l]);
      }
      this._assistenza(p, dt);
    }

    /* il bacino non sta in piedi da solo (due gambe rigide in parallelo e un appoggio di pochi px oscillano da un piede
       all'altro): lo regge una molla "di galleggiamento" con forza limitata, come nei controller di ragdoll attivi.
       Tira il bacino verso la sua posizione nominale (sopra i piedi, alla giusta altezza); un colpo la supera e sposta il
       corpo; da morti non c'e'. Durante una scivolata tutto il corpo e' frenato allo stesso modo.
       (Niente coppia che raddrizza il bacino mentre i piedi sono a terra: litiga con le anche e il busto, che lo tengono
       dritto appoggiandosi ai piedi; c'e' solo uno smorzatore sulla rotazione.) */
    _assistenza(p, dt) {
      const C = this.corpi, F_ = this.piede, G = this.man.giunti, B = C.busto_inf, g = this.mondo.g;
      const m = this.corpoTot;
      let cx = 0, cy = 0, vx = 0, vy = 0;
      for (const b of Object.values(C)) { cx += b.x * b.m; cy += b.y * b.m; vx += b.vx * b.m; vy += b.vy * b.m; }
      cx /= m; cy /= m; vx /= m; vy /= m;
      this.com = [cx, cy]; this.vcom = [vx, vy];                // baricentro e sua velocita' (anche per la diagnostica)
      this.vento.x = 0;
      if (this.morto) return;
      const M = this.massaSu, w = 2 * PI * T.hzSostegno, wx = 2 * PI * T.hzSostX;
      if (this.seduto) {                                       // seduto: il bacino e' retto a una quota bassa, e tenuto dritto
        const yn = this.rest.busto_inf.y + p.sprofonda, wt = 2 * PI * 5, ws = 2 * PI * 5;
        B.fx += lim(M * (ws * ws * (this.sedutoX - B.x) - 2 * ws * B.vx), -1.3 * M * g, 1.3 * M * g);
        B.fy += -0.92 * M * g + M * (w * w * (yn - B.y) - 2 * w * B.vy);
        B.tau += (B.I + 0.12 * this.inerziaSu) * (wt * wt * (-B.a) - 2 * wt * B.w);
        return;
      }
      if (this.scivola) {
        // spinto da un colpo: tutto il corpo e' frenato allo stesso modo (nessuna distorsione), i piedi scivolano
        if (Math.abs(vx) < 18) {
          this.scivola = false;
          for (const l of LATI) this.corpi["piede_" + l].mu = T.muPiede;
        } else {
          const ax = -Math.sign(vx) * T.frena * lim(Math.abs(vx) / 40, 0, 1);
          for (const b of Object.values(C)) b.fx += ax * b.m;
          this.vento.x = ax;
          // con i piedi che scivolano nessuno regge piu' il bacino: una coppia lo tiene dritto (senza piedi a terra
          // non litiga con le anche)
          const wt = 2 * PI * 4;
          B.tau += (B.I + 0.12 * this.inerziaSu) * (wt * wt * (p.bacino - B.a) - 2 * wt * B.w);
        }
      }
      // posizione nominale del bacino: sopra la media dei piedi (un poco davanti), a `sprofonda` px dalle gambe tese
      const xn = this.xs + T.avanti + (this.rest.busto_inf.x - G.anca[0]);
      const yn = this.rest.busto_inf.y + p.sprofonda;
      let fx = 0;
      // la spinta orizzontale non puo' superare quello che i piedi reggono per attrito: una spinta maggiore li trascinerebbe
      // (la molla regge parte del peso, quindi i piedi sono poco carichi: il limite lo dice il loro carico vero)
      const carico = (this.corpi.piede_dx.terra + this.corpi.piede_sx.terra) / (this.mondo.dt || (1 / 240));
      const fMax = Math.max(0.3 * M * g, Math.min(T.forzaMax * M * g, 0.75 * 2 * carico));
      if (!this.scivola) fx = lim(M * (wx * wx * (xn - B.x) - 2 * wx * B.vx), -fMax, fMax);
      const fy = this.sostegno * (-T.pesoMolla * M * g + M * (w * w * (yn - B.y) - 2 * w * B.vy));
      B.fx += fx; B.fy += fy;
      this.vento.x += fx / M;
      // solo uno smorzatore sulla rotazione del bacino (non cambia dov'e' l'equilibrio, quindi non litiga con le anche):
      // frena le oscillazioni lente del busto dopo uno slancio
      B.tau += -T.smorzaBacino * B.I * B.w;
    }

    /* un passo di simulazione (dt in secondi, di solito 1/60) */
    passo(dt) {
      this.t += dt;
      // i muscoli tornano a regime dopo un colpo
      if (!this.morto) this.tono += (1 - this.tono) * (1 - Math.exp(-dt * 3.2));
      for (const l in this.gain) {
        const d = this.gainT[l] - this.gain[l];
        this.gain[l] = Math.abs(d) < 0.01 ? this.gainT[l] : this.gain[l] + d * (1 - Math.exp(-dt * 9));
      }
      const p = this._posa(dt);
      this._passi(dt, p);
      this._pilota(p, dt);
      // arti con muscoli spenti: restano un po' frenati
      this.mondo.passo(dt);
    }

    assesta(n, dt = 1 / 60) { for (let i = 0; i < n; i++) this.passo(dt); }
  }

  return {Pupazzo, CORPI, GIUNTI, LOC, T, PIEDE, LATI, MUSCOLI};
})();
if (typeof module !== "undefined") module.exports = Pupazzo;
