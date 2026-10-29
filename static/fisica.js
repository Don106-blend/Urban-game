/* Urban — fisica dei combattenti.
   Uno scheletro a particelle (verlet) con ossa rigide, masse, cerniere, pavimento e muri, tenuto in piedi da
   "muscoli" (molle PD verso una posa bersaglio). I colpi sono impulsi di velocita' sulla locazione colpita e sul
   corpo intero: il combattente rincula, scivola, fa dei passi per non cadere e, calmato, torna a piedi dov'era.
   Una locazione `storpiata` perde i muscoli e fa il ragdoll da sola; senza gambe il corpo si siede e si puntella
   sulle braccia; da morto tutti i muscoli si spengono e, fermo, il corpo si addormenta (niente piu' calcoli,
   niente piu' tremolii). Nessun DOM: gira in Node (v. test_fisica.js) e nel browser (arena.js).
   Coordinate = pixel dello sprite (48x111, v. static/sprites/maschio/parti.json); -x = indietro. */
const Fisica = (() => {
  const G = 0.3;            // gravita' (px per passo^2, passo = 1/60 s)
  const PAV = 111;          // pavimento: bordo inferiore dello sprite
  const ITER = 12;          // iterazioni dei vincoli per passo
  const SMORZ = 0.995;      // smorzamento globale della velocita'
  const ATTRITO = 0.8;      // quota di velocita' orizzontale che resta a chi tocca terra: si scivola, ma ci si ferma
  const VMAX = 3;           // velocita' massima di un colpo sulla locazione (px/passo)
  const POSA_BASSA = 2;     // il bacino sta 2 px sotto la posizione a gambe tese: guardia, ginocchia un po' piegate
  const RX = 2;             // raggio contro i muri
  // passi
  const PASSO_DUR = 10;     // durata di un passo (passi di simulazione)
  const PASSO_ALT = 6;      // quanto si alza il piede
  const PASSO_MAX = 12;     // lunghezza massima di un passo verso casa
  const PASSO_PAUSA = 2;    // pausa tra un passo e il successivo
  const SOGLIA_BIL = 5;     // se il bacino si allontana tanto dai piedi, si fa un passo per riprenderlo
  const SOGLIA_CASA = 0.9;  // si torna a casa finche' un piede e' piu' lontano di cosi'
  const CALMA_CASA = 30;    // passi senza colpi prima di tornare al posto di partenza

  // locazione di gioco -> particelle che la muovono
  const LOC = {
    testa: ["cima"],
    busto: ["collo_alto", "vita", "anca", "anca_dx", "anca_sx", "spalla_dx", "spalla_sx"],
    braccio_dx: ["gomito_dx", "polso_dx"], braccio_sx: ["gomito_sx", "polso_sx"],
    gamba_dx: ["ginocchio_dx", "caviglia_dx"], gamba_sx: ["ginocchio_sx", "caviglia_sx"],
  };
  const LOC_DI = {};
  for (const [l, ps] of Object.entries(LOC)) ps.forEach(p => { LOC_DI[p] = l; });

  // raggio di contatto col pavimento (la caviglia ha il piede sotto: 9 px, come a riposo)
  const RAGGIO = {cima: 8, collo_alto: 4, vita: 6, anca: 6, anca_dx: 6, anca_sx: 6, spalla_dx: 4, spalla_sx: 4,
                  gomito_dx: 3, gomito_sx: 3, polso_dx: 3, polso_sx: 3, ginocchio_dx: 4, ginocchio_sx: 4,
                  caviglia_dx: 9, caviglia_sx: 9};
  // masse relative: il bacino e' pesante, mani e testa leggere (nei vincoli, chi pesa meno si sposta di piu')
  const MASSA = {cima: 1, collo_alto: 2, vita: 5, anca: 5, anca_dx: 3.5, anca_sx: 3.5, spalla_dx: 1.6, spalla_sx: 1.6,
                 gomito_dx: 0.6, gomito_sx: 0.6, polso_dx: 0.35, polso_sx: 0.35, ginocchio_dx: 1.5, ginocchio_sx: 1.5,
                 caviglia_dx: 2.5, caviglia_sx: 2.5};
  // muscoli: [rigidita' kp, smorzamento kd, moltiplicatore della rigidita' verticale] della molla verso il bersaglio.
  // Il bacino e' morbido in orizzontale (puo' essere spinto) e saldo in verticale (non si affloscia).
  const MUSCOLO = {
    cima: [0.008, 0.08], collo_alto: [0.02, 0.13], vita: [0.03, 0.17, 2.5], anca: [0.03, 0.17, 2.5],
    anca_dx: [0.02, 0.13, 2.5], anca_sx: [0.02, 0.13, 2.5], spalla_dx: [0, 0], spalla_sx: [0, 0],
    gomito_dx: [0.015, 0.11], gomito_sx: [0.015, 0.11], polso_dx: [0.012, 0.1], polso_sx: [0.012, 0.1],
    ginocchio_dx: [0.06, 0.22], ginocchio_sx: [0.06, 0.22], caviglia_dx: [0.12, 0.3, 1.5], caviglia_sx: [0.12, 0.3, 1.5],
  };
  // quanto del proprio peso regge il muscolo (le braccia pendono un po' e oscillano come pendoli)
  const COMP = {gomito_dx: 0.85, gomito_sx: 0.85, polso_dx: 0.85, polso_sx: 0.85};
  // corpi rigidi (tutte le distanze fisse): bacino e parte alta del busto, incernierati in vita
  const GRUPPI = [["vita", "anca", "anca_dx", "anca_sx"], ["vita", "collo_alto", "spalla_dx", "spalla_sx"]];
  // distanze minime (frazione di quella a riposo): niente teste nel petto, gambe o braccia ripiegate del tutto
  // (con la locazione dell'arto: quando e' storpiato il limite si abbassa, cosi' una gamba molle puo' ripiegarsi
  // sotto il corpo che si siede invece di fare da puntello)
  const LIMITI = [["cima", "vita", 0.75], ["collo_alto", "anca", 0.7], ["spalla_dx", "polso_dx", 0.3, "braccio_dx"],
                  ["spalla_sx", "polso_sx", 0.3, "braccio_sx"], ["anca_dx", "caviglia_dx", 0.5, "gamba_dx"],
                  ["anca_sx", "caviglia_sx", 0.5, "gamba_sx"]];
  // arti: [base, giunto di mezzo, estremo, verso della cerniera: +1 piega in avanti (ginocchio), -1 indietro (gomito)]
  const ARTI = {
    gamba_dx: ["anca_dx", "ginocchio_dx", "caviglia_dx", 1], gamba_sx: ["anca_sx", "ginocchio_sx", "caviglia_sx", 1],
    braccio_dx: ["spalla_dx", "gomito_dx", "polso_dx", -1], braccio_sx: ["spalla_sx", "gomito_sx", "polso_sx", -1],
  };
  // dove va un colpo: peso dell'impulso su ogni particella della locazione colpita
  const PESI = {
    testa: {cima: 1.2, collo_alto: 0.35},
    busto: {collo_alto: 1, spalla_dx: 1, spalla_sx: 1, cima: 0.7, vita: 0.45, anca: 0.25},
    braccio_dx: {gomito_dx: 0.9, polso_dx: 1.3, spalla_dx: 0.15}, braccio_sx: {gomito_sx: 0.9, polso_sx: 1.3, spalla_sx: 0.15},
    gamba_dx: {ginocchio_dx: 1, caviglia_dx: 1.7, anca_dx: 0.25}, gamba_sx: {ginocchio_sx: 1, caviglia_sx: 1.7, anca_sx: 0.25},
  };
  // quanto il colpo solleva (invece di spingere soltanto): una gamba colpita stacca il piede da terra
  const SOLLEVA = {gamba_dx: 2, gamba_sx: 2};

  const lim = (x, a, b) => Math.min(b, Math.max(a, x));
  const LATI = ["dx", "sx"];

  /* giunto di mezzo di un arto a due ossa, con base H ed estremo A fissati: cerchio-cerchio, dalla parte `dir` */
  function ik(H, A, l1, l2, dir) {
    const dx = A.x - H.x, dy = A.y - H.y, d = Math.hypot(dx, dy) || 1e-6;
    const dd = Math.min(d, l1 + l2 - 1e-3);
    const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dx / d, uy = dy / d;
    return {x: H.x + ux * a + dir * uy * h, y: H.y + uy * a - dir * ux * h};
  }

  class Scheletro {
    /* giunti: {nome: [x, y]} a riposo; ossa: [[da, a], ...] (da parti.json) */
    constructor(giunti, ossa) {
      this.R = {}; this.P = {};
      for (const [k, [x, y]] of Object.entries(giunti)) {
        this.R[k] = {x, y};
        this.P[k] = {x, y, px: x, py: y, r: RAGGIO[k] || 3, im: 1 / (MASSA[k] || 1)};
      }
      const d = (a, b) => Math.hypot(this.R[a].x - this.R[b].x, this.R[a].y - this.R[b].y);
      this.d = d;
      this.vinc = [];                                   // [a, b, lunghezza, solo-minimo, locazione]
      ossa.forEach(([a, b]) => this.vinc.push([a, b, d(a, b), false]));
      GRUPPI.forEach(g => g.forEach((a, i) => g.slice(i + 1).forEach(b => this.vinc.push([a, b, d(a, b), false]))));
      LIMITI.forEach(([a, b, f, loc]) => this.vinc.push([a, b, d(a, b) * f, true, loc]));
      this.gain = {}; this.gainT = {};                  // forza dei muscoli per locazione: attuale e voluta
      for (const l of Object.keys(LOC)) { this.gain[l] = 1; this.gainT[l] = 1; }
      this.piede = {};                                  // dove e' piantato ogni piede e come sta camminando
      for (const l of LATI) {
        const c = this.R["caviglia_" + l];
        this.piede[l] = {x: c.x, tx: c.x, ty: c.y, stato: "p", t: 0, x0: c.x, x1: c.x, vivo: true};
      }
      this.muro = [-1e9, 1e9];                          // limiti orizzontali dove puo' stare (la finestra dell'arena)
      this.t = 0;
      this.calma = 999;                                 // passi dall'ultimo colpo
      this.pausa = 0;                                   // pausa tra due passi
      this.rilascio = 0;                                // passi in cui i muscoli cedono (colpo incassato, salto)
      this.nPassi = 0;                                  // passi fatti finora
      this.morto = false;
      this.ancoraX = null;
      this.dorme = false;                               // un morto fermo non si calcola piu'
      this.fermo = 0;
    }

    /* ---- eventi ---- */
    sveglia() { this.dorme = false; this.fermo = 0; }

    /* limiti orizzontali (nelle coordinate dello sprite): i muri della finestra, il corpo non esce */
    muri(min, max) {
      this.muro = [min, max];
      this.sveglia();
    }

    /* velocita' (vx, vy) in piu' a una particella */
    spingi(nome, vx, vy = 0) {
      const p = this.P[nome];
      if (p) { p.px -= vx; p.py -= vy; this.sveglia(); }
    }

    /* colpo subito: impulso proporzionale al danno sulla locazione colpita (tutto il corpo se `split`), piu' lo
       spostamento di tutto il corpo: rincula, scivola e fa dei passi per restare in piedi */
    colpisci(loc, danno, split = false) {
      const v = Math.min(VMAX, 0.15 + danno * 0.02);
      const pesi = split ? Object.assign({}, ...Object.values(PESI)) : PESI[loc];
      if (!pesi) return;
      const su = SOLLEVA[loc] ?? 0.12;
      for (const [k, w] of Object.entries(pesi)) this.spingi(k, -v * w * (split ? 0.5 : 1), -v * w * su);
      for (const k of Object.keys(this.P)) this.spingi(k, -v * 1.4, 0);
      this.calma = 0;
      this.rilascio = Math.max(this.rilascio, 4 + Math.min(10, danno * 0.15));
    }

    /* chi attacca si sporge e fa un passo avanti: spalle, braccia, testa e tutto il corpo */
    affonda(forza = 1) {
      for (const k of ["spalla_dx", "polso_dx", "gomito_dx", "cima", "collo_alto"]) this.spingi(k, 0.8 * forza);
      this.spingi("vita", 0.25 * forza);
      for (const k of Object.keys(this.P)) this.spingi(k, 0.9 * forza, 0);
      this.calma = 0;
      this.rilascio = Math.max(this.rilascio, 3);
    }

    /* attacco a distanza: il braccio si alza e punta, il corpo sente il rinculo */
    spara() {
      this.spingi("polso_dx", 1.4, -0.9); this.spingi("gomito_dx", 0.8, -0.5);
      for (const k of Object.keys(this.P)) this.spingi(k, -0.35, 0);
      this.calma = 0;
    }

    /* schivata: un salto all'indietro, i piedi staccano da terra e si atterra piu' lontano */
    schiva() {
      for (const k of Object.keys(this.P)) this.spingi(k, -1.3, -1.9);
      this.calma = 0;
      this.rilascio = Math.max(this.rilascio, 12);
    }

    /* parata o colpo che non fa danni: le braccia si alzano e il busto cede un poco */
    para() {
      for (const k of ["polso_dx", "gomito_dx", "polso_sx", "gomito_sx", "collo_alto"]) this.spingi(k, -0.9, -0.5);
      for (const k of Object.keys(this.P)) this.spingi(k, -0.3, 0);
      this.calma = 0;
    }

    /* una locazione e' storpiata (o guarita): i muscoli si spengono (o riaccendono) in pochi passi */
    storpia(loc, si, subito = false) {
      if (!(loc in this.gain)) return;
      const eraSana = this.gainT[loc] > 0.5;
      this.gainT[loc] = si ? 0 : 1;
      if (subito) this.gain[loc] = this.gainT[loc];
      if (si && eraSana && loc.startsWith("gamba")) {             // cedendo, il piede scivola avanti (e il ginocchio con lui)
        this.spingi("caviglia_" + loc.slice(6), 1.6, -0.3);
        this.spingi("ginocchio_" + loc.slice(6), 0.9);
      }
      this.sveglia();
    }

    /* porta la velocita' orizzontale media del corpo (pesata sulle masse) a `vx`: le spinte interne (la parte alta
       indietro, i piedi avanti) non devono far andare il corpo da nessuna parte per conto loro */
    _porta(vx) {
      let q = 0, m = 0;
      for (const p of Object.values(this.P)) { q += (p.x - p.px) / p.im; m += 1 / p.im; }
      const d = vx - q / m;
      for (const p of Object.values(this.P)) p.px -= d;
    }

    /* il colpo di grazia: i muscoli si spengono tutti e la parte alta vola indietro, i piedi scivolano avanti */
    muori(danno = 20) {
      this.morto = true;
      for (const l of Object.keys(this.gain)) { this.gainT[l] = 0; this.gain[l] = 0; }
      const f = lim(1 + danno * 0.004, 1, 1.4);                  // piu' danno, caduta un po' piu' violenta
      for (const k of ["cima", "collo_alto", "spalla_dx", "spalla_sx", "polso_dx", "polso_sx"]) this.spingi(k, -1.5 * f);
      this.spingi("cima", -0.6 * f); this.spingi("vita", -0.8 * f); this.spingi("anca", -0.4 * f);
      this.spingi("ginocchio_dx", 1.2); this.spingi("ginocchio_sx", 1);
      this.spingi("caviglia_dx", 2.6); this.spingi("caviglia_sx", 2.2);
      this._porta(-0.8 * f);                                      // il corpo, nel complesso, cade all'indietro
    }

    /* ---- simulazione ---- */
    /* macchina dei passi: ogni piede e' piantato in un punto del pavimento oppure e' in volo verso uno nuovo.
       Si fa un passo (uno alla volta, solo con due gambe sane) quando il bacino si e' allontanato troppo da un
       piede (si rincorre il bacino spinto via) oppure, da calmi, quando i piedi non sono a casa (si ritorna). */
    _passi() {
      const P = this.P, R = this.R, g = this.gain;
      this.calma++;
      this.pausa--;
      for (const l of LATI) {
        const f = this.piede[l], k = "caviglia_" + l;
        if (g["gamba_" + l] < 0.5) { f.vivo = false; f.stato = "p"; f.tx = P[k].x; f.ty = R[k].y; continue; }
        if (!f.vivo) { f.vivo = true; f.x = P[k].x; f.stato = "p"; }
        if (f.stato === "s") {
          f.t++;
          const u = Math.min(1, f.t / PASSO_DUR);
          f.tx = f.x0 + (f.x1 - f.x0) * u * u * (3 - 2 * u);
          f.ty = R[k].y - PASSO_ALT * Math.sin(Math.PI * u);
          if (u >= 1) { f.stato = "p"; f.x = f.x1; this.pausa = PASSO_PAUSA; }
        } else {
          // appena colpito, il piede si pianta dove e' scivolato; da calmo resta dov'e'
          if (this.calma < CALMA_CASA && Math.abs(P[k].x - f.x) > 2) f.x = P[k].x;
          f.tx = f.x; f.ty = R[k].y;
        }
      }
      if (this.morto || this.pausa > 0) return;
      if (LATI.some(l => g["gamba_" + l] < 0.8 || this.piede[l].stato === "s")) return;
      // prima l'equilibrio: se il bacino e' finito fuori dall'appoggio dei piedi (spinto via), il piede da quel lato
      // fa un passo per riprenderlo, e atterra un po' avanti nel verso della spinta
      const X = P.anca.x;
      const appoggio = LATI.map(l => ({l, b: this.piede[l].x - (R["caviglia_" + l].x - R.anca.x)})).sort((a, b) => a.b - b.b);
      let scelto = null, mira = 0;
      const lato = X < appoggio[0].b - SOGLIA_BIL ? appoggio[0] : X > appoggio[1].b + SOGLIA_BIL ? appoggio[1] : null;
      if (lato) {
        scelto = lato.l;
        mira = X + (R["caviglia_" + scelto].x - R.anca.x) + lim((P.anca.x - P.anca.px) * 6, -6, 6);
      }
      // poi, da calmi, verso casa: si muove il piede piu' lontano
      if (!scelto && this.calma >= CALMA_CASA) {
        let lontano = SOGLIA_CASA;
        for (const l of LATI) {
          const d = R["caviglia_" + l].x - this.piede[l].x;
          if (Math.abs(d) > lontano) { lontano = Math.abs(d); scelto = l; mira = this.piede[l].x + lim(d, -PASSO_MAX, PASSO_MAX); }
        }
      }
      if (!scelto) return;
      const f = this.piede[scelto];
      f.x1 = lim(mira, f.x - 14, f.x + 14);
      if (Math.abs(f.x1 - f.x) < 0.5) return;
      f.stato = "s"; f.t = 0; f.x0 = P["caviglia_" + scelto].x;
      this.nPassi++;
    }

    /* posa bersaglio dei muscoli, dallo stato attuale: bacino sopra i piedi, busto e testa sopra la vita VERA,
       piedi dove li dice la macchina dei passi, braccia penzoloni. Senza gambe il bacino scende a terra e le
       braccia si puntellano. */
    _bersagli() {
      const R = this.R, P = this.P, g = this.gain, T = {};
      const sosteg = (g.gamba_dx + g.gamba_sx) / 2;              // 1 = due gambe, 0 = nessuna
      const D = sosteg >= 0.5 ? POSA_BASSA + (1 - sosteg) * 3     // quanto cala il bacino (47 = seduto)
        : POSA_BASSA + 1.5 + (0.5 - sosteg) * 2 * (47.5 - POSA_BASSA - 1.5);
      const seduto = lim((0.5 - sosteg) * 2, 0, 1);
      const resp = Math.sin(this.t * 0.05), dondolo = Math.sin(this.t * 0.031);   // respiro e dondolio: solo in orizzontale
      const avanti = seduto * 5;                                  // seduto ci si china sulle braccia
      // il bacino sta sopra la media dei piedi (quello in volo conta per dove atterra)
      const xs = LATI.filter(l => g["gamba_" + l] >= 0.5)
        .map(l => this.piede[l].tx - (R["caviglia_" + l].x - R.anca.x));
      if (xs.length) this.ancoraX = null;                         // senza piedi sani il bacino resta dove le gambe hanno ceduto
      else if (this.ancoraX == null) this.ancoraX = P.anca.x;
      const bx = xs.length ? xs.reduce((a, b) => a + b) / xs.length : this.ancoraX;
      for (const k of ["vita", "anca", "anca_dx", "anca_sx"]) T[k] = {x: bx + R[k].x - R.anca.x, y: R[k].y + D};
      T.collo_alto = {x: P.vita.x + R.collo_alto.x - R.vita.x + avanti + resp * 0.3 * (1 - seduto),
                      y: P.vita.y + R.collo_alto.y - R.vita.y};
      T.cima = {x: P.collo_alto.x + R.cima.x - R.collo_alto.x + avanti * 0.4 + dondolo * 0.6 * (1 - seduto),
                y: P.collo_alto.y + R.cima.y - R.collo_alto.y};
      for (const [loc, [b, m, e, dir]] of Object.entries(ARTI)) {
        let fine;
        if (loc.startsWith("gamba")) {
          const f = this.piede[loc.slice(6)];
          fine = {x: f.tx, y: f.ty};
        } else {
          const fase = loc.endsWith("dx") ? 0 : 2.1;
          // braccia rilassate: un filo piu' corte della lunghezza piena (gomito appena piegato) e un po' di dondolio
          const penzola = {x: P[b].x + R[e].x - R[b].x + Math.sin(this.t * 0.027 + fase) * 1.8 * (1 - seduto),
                           y: P[b].y + R[e].y - R[b].y - 1.5};
          fine = {x: penzola.x + 7 * seduto, y: seduto > 0 ? Math.min(penzola.y, PAV - 3) : penzola.y};
        }
        T[e] = fine;
        T[m] = ik(P[b], fine, this.d(b, m), this.d(m, e), dir);
      }
      return T;
    }

    passo() {
      if (this.dorme) return;
      this.t++;
      const P = this.P, g = this.gain;
      for (const l in g) {
        const dg = this.gainT[l] - g[l];
        g[l] = Math.abs(dg) < 0.01 ? this.gainT[l] : g[l] + dg * 0.12;
      }
      this.rilascio = Math.max(0, this.rilascio - 1);
      const mus = 1 - 0.85 * lim(this.rilascio / 6, 0, 1);       // i muscoli cedono un istante a ogni colpo
      this._passi();
      const T = this._bersagli();
      for (const [k, p] of Object.entries(P)) {
        const gk = g[LOC_DI[k]], [kp, kd, fy = 1] = MUSCOLO[k], tg = T[k];
        const vx = (p.x - p.px) * SMORZ, vy = (p.y - p.py) * SMORZ;
        let ax = 0, ay = G * (1 - gk * (COMP[k] ?? 1));            // il muscolo regge (quasi tutto) il peso
        if (tg && gk > 0) {
          const m = gk * mus;
          ax += m * (kp * (tg.x - p.x) - kd * vx);
          ay += m * (kp * fy * (tg.y - p.y) - kd * Math.sqrt(fy) * vy);
        }
        p.px = p.x; p.py = p.y; p.x += vx + ax; p.y += vy + ay;
      }
      const [xmin, xmax] = this.muro;
      const urto = new Set();
      for (let it = 0; it < ITER; it++) {
        for (const [a, b, len0, minimo, loc] of this.vinc) {
          const A = P[a], B = P[b];
          const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1e-6;
          const len = loc ? len0 * (0.2 + 0.8 * g[loc]) : len0;
          if (minimo && d >= len) continue;
          const c = (d - len) / d, wa = A.im / (A.im + B.im), wb = 1 - wa;   // chi pesa meno si sposta di piu'
          A.x += dx * c * wa; A.y += dy * c * wa; B.x -= dx * c * wb; B.y -= dy * c * wb;
        }
        for (const [b, m, e, dir] of Object.values(ARTI)) {        // cerniere: ginocchio avanti, gomito indietro
          const H = P[b], K = P[m], A = P[e];
          const dx = A.x - H.x, dy = A.y - H.y, d = Math.hypot(dx, dy);
          if (d < 1e-6) continue;
          const nx = dir * dy / d, ny = -dir * dx / d;             // lato in cui deve piegare
          const s = (K.x - H.x) * nx + (K.y - H.y) * ny;
          if (s < 0) {                                              // (la correzione si ripartisce: nessuna spinta netta)
            const c = -s * 0.5;
            K.x += c * nx; K.y += c * ny; H.x -= c * nx * 0.5; H.y -= c * ny * 0.5; A.x -= c * nx * 0.5; A.y -= c * ny * 0.5;
          }
        }
        for (const [k, p] of Object.entries(P)) {
          if (p.y > PAV - p.r) p.y = PAV - p.r;
          if (p.x < xmin + RX) { p.x = xmin + RX; urto.add(k); }
          else if (p.x > xmax - RX) { p.x = xmax - RX; urto.add(k); }
        }
      }
      for (const [k, p] of Object.entries(P)) {
        if (urto.has(k)) p.px = p.x;                                // il muro ferma
        // attrito a terra, e da fermi si sta fermi
        if (p.y >= PAV - p.r - 0.01) {
          p.px = p.x - (p.x - p.px) * ATTRITO;
          if (Math.abs(p.x - p.px) < 0.02) p.px = p.x;
        }
      }
      // un corpo morto, fermo, si addormenta: niente piu' micro-movimenti
      if (this.morto) {
        const fermo = Object.values(P).every(p => Math.hypot(p.x - p.px, p.y - p.py) < 0.04);
        this.fermo = fermo ? this.fermo + 1 : 0;
        if (this.fermo > 30) {
          for (const p of Object.values(P)) { p.px = p.x; p.py = p.y; }
          this.dorme = true;
        }
      }
    }

    assesta(n) { for (let i = 0; i < n; i++) this.passo(); }

    /* tutto fermo (o quasi)? */
    quieto(soglia = 0.05) {
      return this.dorme || Object.values(this.P).every(p => Math.hypot(p.x - p.px, p.y - p.py) < soglia);
    }
  }

  return {Scheletro, LOC, PAV};
})();
if (typeof module !== "undefined") module.exports = Fisica;
