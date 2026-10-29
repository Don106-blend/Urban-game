/* Urban — fisica dei combattenti.
   Uno scheletro a particelle (verlet) con ossa rigide, cerniere e pavimento, tenuto in piedi da "muscoli"
   (molle PD verso una posa bersaglio). I colpi sono impulsi di velocita' sulle particelle della locazione
   colpita; i muscoli li riassorbono e il combattente torna in piedi. Una locazione `storpiata` perde i muscoli e
   diventa un ragdoll solo lei; senza gambe il corpo si siede e si puntella sulle braccia; da morto tutti i
   muscoli si spengono. Nessun DOM: gira in Node (v. test_fisica.js) e nel browser (arena.js).
   Coordinate = pixel dello sprite (48x111, v. static/sprites/maschio/parti.json); -x = indietro. */
const Fisica = (() => {
  const G = 0.3;            // gravita' (px per passo^2, passo = 1/60 s)
  const PAV = 111;          // pavimento: bordo inferiore dello sprite
  const ITER = 12;          // iterazioni dei vincoli per passo
  const SMORZ = 0.995;      // smorzamento globale della velocita'
  const ATTRITO = 0.55;     // quota di velocita' orizzontale che resta a chi tocca terra
  const ATTRITO_MOLLE = 0.8; // idem per un arto senza muscoli
  const VMAX = 3;           // velocita' massima di un colpo (px/passo)

  // locazione di gioco -> particelle che la muovono
  const LOC = {
    testa: ["cima"],
    busto: ["collo_alto", "vita", "anca", "anca_dx", "anca_sx", "spalla_dx", "spalla_sx"],
    braccio_dx: ["gomito_dx", "polso_dx"], braccio_sx: ["gomito_sx", "polso_sx"],
    gamba_dx: ["ginocchio_dx", "caviglia_dx"], gamba_sx: ["ginocchio_sx", "caviglia_sx"],
  };
  const LOC_DI = {};
  for (const [l, ps] of Object.entries(LOC)) ps.forEach(p => { LOC_DI[p] = l; });

  // raggio di contatto col pavimento (la caviglia ha il piede sotto)
  const RAGGIO = {cima: 8, collo_alto: 4, vita: 6, anca: 6, anca_dx: 6, anca_sx: 6, spalla_dx: 4, spalla_sx: 4,
                  gomito_dx: 3, gomito_sx: 3, polso_dx: 3, polso_sx: 3, ginocchio_dx: 4, ginocchio_sx: 4,
                  caviglia_dx: 8, caviglia_sx: 8};
  // muscoli: [rigidita' kp, smorzamento kd] della molla verso il bersaglio
  const MUSCOLO = {
    cima: [0.008, 0.08], collo_alto: [0.02, 0.13], vita: [0.035, 0.17], anca: [0.035, 0.17],
    anca_dx: [0.02, 0.13], anca_sx: [0.02, 0.13], spalla_dx: [0, 0], spalla_sx: [0, 0],
    gomito_dx: [0.015, 0.11], gomito_sx: [0.015, 0.11], polso_dx: [0.012, 0.1], polso_sx: [0.012, 0.1],
    ginocchio_dx: [0.025, 0.14], ginocchio_sx: [0.025, 0.14], caviglia_dx: [0.04, 0.18], caviglia_sx: [0.04, 0.18],
  };
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
        this.P[k] = {x, y, px: x, py: y, r: RAGGIO[k] || 3};
      }
      const d = (a, b) => Math.hypot(this.R[a].x - this.R[b].x, this.R[a].y - this.R[b].y);
      this.d = d;
      this.vinc = [];                                   // [a, b, lunghezza, solo-minimo]
      ossa.forEach(([a, b]) => this.vinc.push([a, b, d(a, b), false]));
      GRUPPI.forEach(g => g.forEach((a, i) => g.slice(i + 1).forEach(b => this.vinc.push([a, b, d(a, b), false]))));
      LIMITI.forEach(([a, b, f, loc]) => this.vinc.push([a, b, d(a, b) * f, true, loc]));
      this.gain = {}; this.gainT = {};                  // forza dei muscoli per locazione: attuale e voluta
      for (const l of Object.keys(LOC)) { this.gain[l] = 1; this.gainT[l] = 1; }
      this.t = 0;
      this.morto = false;
    }

    /* ---- eventi ---- */
    /* velocita' (vx, vy) in piu' a una particella */
    spingi(nome, vx, vy = 0) {
      const p = this.P[nome];
      if (p) { p.px -= vx; p.py -= vy; }
    }

    /* colpo subito: impulso proporzionale al danno, sulla locazione colpita (tutto il corpo se `split`) */
    colpisci(loc, danno, split = false) {
      const v = Math.min(VMAX, 0.15 + danno * 0.02);
      const pesi = split ? Object.assign({}, ...Object.values(PESI)) : PESI[loc];
      if (!pesi) return;
      const su = SOLLEVA[loc] ?? 0.12;
      for (const [k, w] of Object.entries(pesi)) this.spingi(k, -v * w * (split ? 0.5 : 1), -v * w * su);
      for (const k of Object.keys(this.P)) this.spingi(k, -v * 0.22, 0);        // rinculo di tutto il corpo
    }

    /* chi attacca si sporge in avanti: spalle, braccia e testa */
    affonda(forza = 0.8) {
      for (const k of ["spalla_dx", "polso_dx", "gomito_dx", "cima", "collo_alto"]) this.spingi(k, forza);
      this.spingi("vita", forza * 0.3);
    }

    /* schivata: un saltello all'indietro */
    schiva() {
      for (const k of Object.keys(this.P)) this.spingi(k, -1.0, -1.5);
    }

    /* parata o colpo che non fa danni: le braccia si alzano e il busto cede un poco */
    para() {
      for (const k of ["polso_dx", "gomito_dx", "polso_sx", "gomito_sx", "collo_alto"]) this.spingi(k, -0.9, -0.5);
    }

    /* una locazione e' storpiata (o guarita): i muscoli si spengono (o riaccendono) in pochi passi */
    storpia(loc, si, subito = false) {
      if (!(loc in this.gain)) return;
      this.gainT[loc] = si ? 0 : 1;
      if (subito) this.gain[loc] = this.gainT[loc];
    }

    /* il colpo di grazia: i muscoli si spengono tutti e la parte alta vola indietro, i piedi scivolano avanti */
    muori(danno = 20, loc = "busto") {
      this.morto = true;
      for (const l of Object.keys(this.gain)) { this.gainT[l] = 0; this.gain[l] = 0; }
      const f = lim(1 + danno * 0.004, 1, 1.4);                  // piu' danno, caduta un po' piu' violenta
      for (const k of ["cima", "collo_alto", "spalla_dx", "spalla_sx", "polso_dx", "polso_sx"]) this.spingi(k, -1.5 * f);
      this.spingi("cima", -0.6 * f); this.spingi("vita", -0.8 * f); this.spingi("anca", -0.4 * f);
      this.spingi("ginocchio_dx", 1.2); this.spingi("ginocchio_sx", 1);
      this.spingi("caviglia_dx", 2.6); this.spingi("caviglia_sx", 2.2);
    }

    /* ---- simulazione ---- */
    /* posa bersaglio dei muscoli, dallo stato attuale: bacino piantato, busto e testa sopra la vita VERA, piedi
       piantati, braccia penzoloni. Senza gambe il bacino scende a terra e le braccia si puntellano. */
    _bersagli() {
      const R = this.R, P = this.P, g = this.gain, T = {};
      const sosteg = (g.gamba_dx + g.gamba_sx) / 2;              // 1 = due gambe, 0 = nessuna
      const D = sosteg >= 0.5 ? (1 - sosteg) * 3 : 1.5 + (0.5 - sosteg) * 94;   // quanto cala il bacino (47 = seduto)
      const seduto = lim((0.5 - sosteg) * 2, 0, 1);
      const lato = (g.gamba_sx - g.gamba_dx) * 2 * (1 - seduto); // su una gamba sola il peso va su quella
      const resp = Math.sin(this.t * 0.05) * 0.6 * (1 - seduto);  // respiro
      const avanti = seduto * 5;                                  // seduto ci si china sulle braccia
      for (const k of ["vita", "anca", "anca_dx", "anca_sx"]) T[k] = {x: R[k].x + lato, y: R[k].y + D};
      T.collo_alto = {x: P.vita.x + R.collo_alto.x - R.vita.x + avanti, y: P.vita.y + R.collo_alto.y - R.vita.y + resp};
      T.cima = {x: P.collo_alto.x + R.cima.x - R.collo_alto.x + avanti * 0.4,
                y: P.collo_alto.y + R.cima.y - R.collo_alto.y + resp * 0.5};
      for (const [loc, [b, m, e, dir]] of Object.entries(ARTI)) {
        let fine;
        if (loc.startsWith("gamba")) {
          fine = {x: R[e].x + lato, y: R[e].y};                   // piede piantato dove stava
        } else {
          const penzola = {x: P[b].x + R[e].x - R[b].x, y: P[b].y + R[e].y - R[b].y};
          fine = {x: penzola.x + 7 * seduto, y: seduto > 0 ? Math.min(penzola.y, PAV - 3) : penzola.y};
        }
        T[e] = fine;
        T[m] = ik(P[b], fine, this.d(b, m), this.d(m, e), dir);
      }
      return T;
    }

    passo() {
      this.t++;
      const P = this.P, g = this.gain;
      for (const l in g) {
        const dg = this.gainT[l] - g[l];
        g[l] = Math.abs(dg) < 0.01 ? this.gainT[l] : g[l] + dg * 0.12;
      }
      const T = this._bersagli();
      for (const [k, p] of Object.entries(P)) {
        const gk = g[LOC_DI[k]], [kp, kd] = MUSCOLO[k], tg = T[k];
        const vx = (p.x - p.px) * SMORZ, vy = (p.y - p.py) * SMORZ;
        let ax = 0, ay = G * (1 - gk);                             // il muscolo regge anche il peso
        if (tg && gk > 0) {
          ax += gk * (kp * (tg.x - p.x) - kd * vx);
          ay += gk * (kp * (tg.y - p.y) - kd * vy);
        }
        p.px = p.x; p.py = p.y; p.x += vx + ax; p.y += vy + ay;
      }
      for (let it = 0; it < ITER; it++) {
        for (const [a, b, len0, minimo, loc] of this.vinc) {
          const A = P[a], B = P[b];
          const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1e-6;
          const len = loc ? len0 * (0.2 + 0.8 * g[loc]) : len0;
          if (minimo && d >= len) continue;
          const f = (d - len) / d * 0.5;
          A.x += dx * f; A.y += dy * f; B.x -= dx * f; B.y -= dy * f;
        }
        for (const [b, m, e, dir] of Object.values(ARTI)) {        // cerniere: ginocchio avanti, gomito indietro
          const H = P[b], K = P[m], A = P[e];
          const dx = A.x - H.x, dy = A.y - H.y, d = Math.hypot(dx, dy);
          if (d < 1e-6) continue;
          const nx = dir * dy / d, ny = -dir * dx / d;             // lato in cui deve piegare
          const s = (K.x - H.x) * nx + (K.y - H.y) * ny;
          if (s < 0) { K.x -= s * nx * 0.5; K.y -= s * ny * 0.5; }
        }
        for (const p of Object.values(P)) if (p.y > PAV - p.r) p.y = PAV - p.r;
      }
      for (const [k, p] of Object.entries(P)) {
        // attrito a terra: un arto molle scivola piu' facilmente di uno che spinge
        if (p.y >= PAV - p.r - 0.01) p.px = p.x - (p.x - p.px) * (g[LOC_DI[k]] > 0.5 ? ATTRITO : ATTRITO_MOLLE);
      }
    }

    assesta(n) { for (let i = 0; i < n; i++) this.passo(); }

    /* tutto fermo (o quasi)? */
    quieto(soglia = 0.05) {
      return Object.values(this.P).every(p => Math.hypot(p.x - p.px, p.y - p.py) < soglia);
    }
  }

  return {Scheletro, LOC, PAV};
})();
if (typeof module !== "undefined") module.exports = Fisica;
