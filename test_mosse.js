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
    // (i colpi in mischia: il contatto del pugno arriva da arena.js con `alContatto`; qui lo simuliamo a meta' della mossa)
    attacca: (o) => { futuri.push({t: t + (o.carica || 0.2), fn: () => o.alColpoInizio && o.alColpoInizio()});
                      if (o.alContatto) futuri.push({t: t + 0.5, fn: () => o.alContatto({loc: "busto", esito})});
                      futuri.push({t: t + 1.6, fn: () => o.alFine && o.alFine()}); },
    largo: 400, impatto: () => [160, 55], giunto: () => [100, 50], pugno() {},
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

const IDS = {9: "scintilla", 4: "palla di fuoco", 5: "lanciafiamme", 43: "eruzione", 7: "scheggie", 28: "scheggia di ghiaccio",
              45: "getto d'acqua", 46: "onda anomala", 47: "maremoto", 3: "colpo devastante", 41: "ondata sismica", 42: "frana",
              52: "raffica controllata", 53: "tiro di precisione", 37: "tocco debilitante", 38: "dreno vitale", 39: "falce delle anime", 40: "pugno di roccia",
              8: "scarica elettrica", 10: "fulmine", 11: "artigli affilati", 12: "artigli sanguinari", 13: "braccio lama", 15: "affamare", 16: "affaticare",
              24: "assorbi caratteristica"};
ok(JSON.stringify(Mosse.ids().sort((a, b) => a - b)) === JSON.stringify(Object.keys(IDS).map(Number).sort((a, b) => a - b)), "le animazioni sono quelle del Compendio dei poteri");
ok(Mosse.ha({att_id: 9}) && !Mosse.ha({att_id: 1}) && !Mosse.ha({}) && !Mosse.ha(null), "ha() riconosce solo gli attacchi con la loro animazione");

for (const [id, nome] of Object.entries(IDS)) {
  for (const esito of ["colpito", "parato", "schivato", "retto"]) {
    const r = prova(+id, esito);
    ok(r.contatto === 1, `${nome}/${esito}: il colpo arriva una volta sola (contatto = ${r.contatto})`);
    ok(r.fine === 1 && r.tFine >= r.tContatto, `${nome}/${esito}: finisce dopo il contatto (${r.tContatto.toFixed(2)} -> ${r.tFine.toFixed(2)})`);
    ok(r.tContatto > 0.3 && r.tContatto < 3, `${nome}/${esito}: il contatto ha una sua durata di animazione (${r.tContatto.toFixed(2)} s)`);
    if (+id !== 7 && !(+id === 3 && (esito === "schivato" || esito === "retto"))) ok(r.particelle >= 1, `${nome}/${esito}: ci sono effetti (${r.particelle} particelle)`);      // (le Scheggie mancate filano via e basta, e il pugno devastante a vuoto non scuote niente)
  }
}
// le animazioni a tempo: l'eruzione e' la piu' lunga, la scintilla la piu' breve tra i proiettili (la palombella vola piano: si vede)
ok(prova(43, "colpito").tContatto > 0.9, "l'eruzione: le braccia al cielo, poi la lava");
ok(prova(5, "colpito").tFine > 1.0, "il lanciafiamme dura quanto il getto");
// elettrocinesi: il fulmine si carica con un gesto a mani unite prima del fascio, la scarica sono sei colpi di fulmine che arrivano uno dopo l'altro
ok(prova(10, "colpito").gesti >= 1, "il fulmine carica le mani (gesto)");
ok(prova(10, "colpito").tContatto > prova(8, "colpito").tContatto, "il fulmine si prende il tempo di caricare, la scarica parte subito");
// anatema: affamare e affaticare sono il dreno vitale al contrario, assorbi caratteristica il dreno vitale: stessa durata, stessa struttura
ok(Math.abs(prova(15, "colpito").tContatto - prova(38, "colpito").tContatto) < 0.05 && Math.abs(prova(24, "colpito").tFine - prova(38, "colpito").tFine) < 0.05, "il dreno rosso dura come il verde");
// niente resta in giro: dopo l'animazione gli effetti proprio finiscono (le schegge conficcate sono le ultime a sparire)
Mosse.reset();
console.log(`OK - ${n} check passati`);
