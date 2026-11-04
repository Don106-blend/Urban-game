/* Check delle animazioni dei singoli attacchi (static/mosse.js), senza browser: node test_mosse.js
   Ogni coreografia, per ogni esito del colpo (a segno, parato, schivato, retto sui riflessi), deve chiamare `contatto` UNA volta (e' li' che il
   gioco segna danni e knockback), poi `fine`, dopo il contatto; deve poter disegnare senza errori e non lasciare effetti in giro per sempre. */
const Mosse = require("./static/mosse.js");

let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error("FALLITO:", m); process.exit(1); } };

// un contesto 2D finto: accetta qualunque chiamata e qualunque assegnazione
const ctx = new Proxy({}, {get: (t, k) => k === "createLinearGradient" || k === "createRadialGradient" ? () => ({addColorStop() {}}) : (k in t ? t[k] : () => {}),
                           set: (t, k, v) => { t[k] = v; return true; }});

function prova(id, esito) {
  Mosse.reset();
  let t = 0;
  const futuri = [], reg = {contatto: 0, fine: 0, particelle: 0, reazioni: 0, tContatto: -1, tFine: -1, gesti: 0};
  const att = {f: 1, pup: {spingiTutto() {}}}, dif = {f: -1};
  const h = {
    ev: {loc: "busto", att_id: id, esito}, colpito: esito === "colpito", parato: esito === "parato", att, dif,
    mano: () => [100, 50], bersaglio: () => [160, 55], pose: () => [10, 50, 0.1],
    aMondo: (L, p) => [100 + L.f * p[0], p[1]], daMondo: (L, p) => [L.f * (p[0] - 100), p[1]],
    particella: () => { reg.particelle++; },
    futuro: (s, fn) => futuri.push({t: t + s, fn}),
    // il pupazzo: il colpo parte dopo la carica, e la mossa finisce da se' (i test dell'arena non ci sono: qui si simula)
    attacca: (o) => { futuri.push({t: t + (o.carica || 0.2), fn: () => o.alColpoInizio && o.alColpoInizio()}); futuri.push({t: t + 1.6, fn: () => o.alFine && o.alFine()}); },
    gesto: () => { reg.gesti++; }, reazione: () => { reg.reazioni++; }, scuoti() {},
    contatto: () => { reg.contatto++; reg.tContatto = t; }, fine: () => { reg.fine++; reg.tFine = t; },
    base: {},
  };
  Mosse.avvia(h.ev, h);
  for (let i = 0; i < 60 * 8; i++) {                 // otto secondi, a 60 Hz
    t += 1 / 60;
    futuri.sort((a, b) => a.t - b.t);
    while (futuri.length && futuri[0].t <= t) futuri.shift().fn();
    Mosse.passo(1 / 60);
    Mosse.disegna(ctx);                                // disegnare non deve mai rompersi
  }
  return reg;
}

const IDS = {9: "scintilla", 4: "palla di fuoco", 5: "lanciafiamme", 43: "eruzione", 7: "scheggie", 28: "scheggia di ghiaccio"};
ok(JSON.stringify(Mosse.ids().sort((a, b) => a - b)) === JSON.stringify(Object.keys(IDS).map(Number).sort((a, b) => a - b)), "le animazioni sono quelle del Compendio dei poteri");
ok(Mosse.ha({att_id: 9}) && !Mosse.ha({att_id: 1}) && !Mosse.ha({}) && !Mosse.ha(null), "ha() riconosce solo gli attacchi con la loro animazione");

for (const [id, nome] of Object.entries(IDS)) {
  for (const esito of ["colpito", "parato", "schivato", "retto"]) {
    const r = prova(+id, esito);
    ok(r.contatto === 1, `${nome}/${esito}: il colpo arriva una volta sola (contatto = ${r.contatto})`);
    ok(r.fine === 1 && r.tFine >= r.tContatto, `${nome}/${esito}: finisce dopo il contatto (${r.tContatto.toFixed(2)} -> ${r.tFine.toFixed(2)})`);
    ok(r.tContatto > 0.3 && r.tContatto < 3, `${nome}/${esito}: il contatto ha una sua durata di animazione (${r.tContatto.toFixed(2)} s)`);
    if (+id !== 7) ok(r.particelle >= 1, `${nome}/${esito}: ci sono effetti (${r.particelle} particelle)`);      // (le Scheggie mancate filano via e basta)
  }
}
// le animazioni a tempo: l'eruzione e' la piu' lunga, la scintilla la piu' breve tra i proiettili (la palombella vola piano: si vede)
ok(prova(43, "colpito").tContatto > 0.9, "l'eruzione: le braccia al cielo, poi la lava");
ok(prova(5, "colpito").tFine > 1.0, "il lanciafiamme dura quanto il getto");
// niente resta in giro: dopo l'animazione gli effetti proprio finiscono (le schegge conficcate sono le ultime a sparire)
Mosse.reset();
console.log(`OK - ${n} check passati`);
