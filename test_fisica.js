// Test della fisica dei combattenti (static/fisica.js = motore a corpi rigidi, static/pupazzo.js = il ragdoll attivo).
// Uso: node test_fisica.js   (VERBOSE=1 stampa le misure, utile per tarare)
// Controlla due livelli: il motore (caduta, attrito, pendolo, motori PD, rimbalzo, limiti...) e il pupazzo (sta in piedi
// senza tremare, un colpo lo fa scivolare e rientrare a passi, gli attacchi arrivano a segno, schivate e parate, arti
// storpi, morte, muri). Nessun valore tarato nei dati di gioco: solo la fisica.
const fs = require("fs");
const path = require("path");
const Fisica = require("./static/fisica.js");
const PU = require("./static/pupazzo.js");
const {Pupazzo} = PU;

const man = JSON.parse(fs.readFileSync(path.join(__dirname, "static/sprites/maschio/parti.json"), "utf8"));
const log = (...a) => { if (process.env.VERBOSE) console.log(...a); };
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error("FALLITO:", msg); process.exitCode = 1; throw new Error(msg); } };
const DT = 1 / 60;
const f2 = x => x.toFixed(2);

/* ====================================================================================================================
   1. IL MOTORE
   ==================================================================================================================== */
{
  // caduta libera: y = g t^2 / 2
  const m = new Fisica.Mondo({pavimento: 1e9}); const b = m.corpo({x: 0, y: 0, m: 1, I: 1}); b.dmpL = 0;
  for (let i = 0; i < 60; i++) m.passo(DT);
  ok(Math.abs(b.y - 550) < 6, `caduta libera (${b.y})`);
}
{
  // una capsula in piedi poggia sul pavimento e si ferma; di piatto, e inclinata, si assesta
  const m = new Fisica.Mondo();
  const v = m.corpo({x: 0, y: 50, m: 2, I: Fisica.asta(20, 2, 3), forme: [{ax: 0, ay: -10, bx: 0, by: 10, r: 3}]});
  const p = m.corpo({x: 30, y: 100, m: 2, I: Fisica.asta(20, 2, 3), a: 0.2, forme: [{ax: -10, ay: 0, bx: 10, by: 0, r: 3}]});
  for (let i = 0; i < 240; i++) m.passo(DT);
  ok(Math.abs(v.y - 98) < 0.7 && Math.abs(v.vy) < 0.5, "capsula in piedi: poggia sul pavimento");
  ok(Math.abs(p.y - 108) < 0.7 && Math.abs(p.a) < 0.02, "capsula di piatto: si assesta");
}
{
  // attrito di Coulomb: scivola v^2 / (2 mu g)
  const m = new Fisica.Mondo(); const b = m.corpo({x: 0, y: 108, m: 2, I: Fisica.asta(20, 2, 3), mu: 0.5, forme: [{ax: -10, ay: 0, bx: 10, by: 0, r: 3}]});
  for (let i = 0; i < 10; i++) m.passo(DT);
  b.vx = 300; const x0 = b.x;
  for (let i = 0; i < 600 && Math.abs(b.vx) > 0.5; i++) m.passo(DT);
  const att = 300 * 300 / (2 * 0.5 * 1100);
  log("attrito: scivola", f2(b.x - x0), "atteso", f2(att));
  ok(Math.abs(b.x - x0 - att) / att < 0.08, "distanza di frenata con attrito");
}
{
  // pendolo: periodo di un'asta incernierata a un'estremita'
  const m = new Fisica.Mondo({pavimento: 1e9}); const S = m.corpo({x: 0, y: 0, m: 1, I: 1, statico: true});
  const L = 60, mm = 3, R = m.corpo({x: 0, y: L / 2, m: mm, I: Fisica.asta(L, mm, 0)}); R.dmpA = 0; R.dmpL = 0;
  m.giunto(S, R, [0, 0], [0, -L / 2]); R.a = 0.15;
  let prev = R.a; const tc = [];
  for (let i = 0; i < 600; i++) { m.passo(DT); if (prev > 0 && R.a <= 0) tc.push(i * DT); prev = R.a; }
  const T = (tc[tc.length - 1] - tc[0]) / (tc.length - 1), Tatt = 2 * Math.PI * Math.sqrt(2 * L / (3 * 1100));
  log("pendolo: T", T.toFixed(4), "atteso", Tatt.toFixed(4));
  ok(Math.abs(T - Tatt) / Tatt < 0.03, "periodo del pendolo");
}
{
  // catena appesa e strattonata: i giunti restano uniti
  const m = new Fisica.Mondo({pavimento: 1e9}); let prev = m.corpo({x: 0, y: 0, m: 1, I: 1, statico: true}); const cs = [];
  for (let i = 0; i < 10; i++) { const c = m.corpo({x: 0, y: 10 + i * 20, m: 2, I: Fisica.asta(20, 2, 0)}); m.giunto(prev, c, [0, i ? 10 : 0], [0, -10]); prev = c; cs.push(c); }
  cs[9].vx = 200;
  let maxd = 0;
  for (let i = 0; i < 300; i++) { m.passo(DT); for (const j of m.giunti) { const [ax, ay] = j.A.mondo(j.lax, j.lay), [bx, by] = j.B.mondo(j.lbx, j.lby); maxd = Math.max(maxd, Math.hypot(ax - bx, ay - by)); } }
  ok(maxd < 1.5, `giunti uniti sotto strappo (${maxd})`);
}
for (const [hz, zeta] of [[6, 1], [10, 1], [20, 1]]) {
  // motore PD: risposta a gradino, senza sovraelongazione se critico, e con la frequenza giusta
  const m = new Fisica.Mondo({pavimento: 1e9, g: 0}); const S = m.corpo({x: 0, y: 0, m: 1, I: 1, statico: true});
  const R = m.corpo({x: 0, y: 20, m: 2, I: Fisica.asta(40, 2, 0)}); R.dmpA = 0; R.dmpL = 0;
  const j = m.giunto(S, R, [0, 0], [0, -20]); j.motore(hz, zeta, 1e9, 0.6);
  let t95 = -1, pico = 0;
  for (let i = 0; i < 120; i++) { m.passo(DT); pico = Math.max(pico, j.angolo); if (t95 < 0 && j.angolo > 0.57) t95 = i * DT; }
  log(`motore PD ${hz} Hz: t95 ${t95.toFixed(3)} s`);
  ok(Math.abs(j.angolo - 0.6) < 0.01, "il motore PD arriva all'obiettivo");
  ok(pico < 0.6 * 1.02, "motore critico: nessuna sovraelongazione");
  ok(t95 > 3 / (2 * Math.PI * hz) && t95 < 8 / (2 * Math.PI * hz), `il tempo di risposta segue la frequenza (${t95})`);
}
{
  // la coppia massima limita il motore
  const m = new Fisica.Mondo({pavimento: 1e9, g: 0}); const S = m.corpo({x: 0, y: 0, m: 1, I: 1, statico: true});
  const R = m.corpo({x: 0, y: 20, m: 2, I: Fisica.asta(40, 2, 0)});
  const j = m.giunto(S, R, [0, 0], [0, -20]); j.motore(10, 1, 1e3, 1);
  for (let i = 0; i < 20; i++) m.passo(DT);
  ok(j.angolo < 0.3, "con poca coppia il motore non arriva in fretta");
}
{
  // rimbalzo: la velocita' dopo l'urto ~ e * quella prima
  const m = new Fisica.Mondo(); const b = m.corpo({x: 0, y: 20, m: 1, I: Fisica.asta(6, 1, 3), e: 0.5, forme: [{ax: 0, ay: 0, bx: 0, by: 0, r: 3}]});
  let visto = false;
  for (let i = 0; i < 120 && !visto; i++) { const vp = b.vy; m.passo(DT); if (vp > 0 && b.vy < 0) { visto = true; ok(Math.abs(b.vy / -vp - 0.5) < 0.12, "restituzione"); } }
  ok(visto, "rimbalza");
}
{
  // limiti dei giunti e muri (anche a 1500 px/s), poi il sonno
  const m = new Fisica.Mondo({pavimento: 1e9}); const S = m.corpo({x: 0, y: 0, m: 1, I: 1, statico: true});
  const R = m.corpo({x: 0, y: 20, m: 2, I: Fisica.asta(40, 2, 0)}); R.dmpA = 0.1;
  const j = m.giunto(S, R, [0, 0], [0, -20], {lim: [-0.4, 0.4]});
  R.vx = -300; let mn = 0, mx = 0;
  for (let i = 0; i < 240; i++) { m.passo(DT); mn = Math.min(mn, j.angolo); mx = Math.max(mx, j.angolo); }
  ok(mn > -0.46 && mx < 0.46, "i limiti dei giunti reggono");
  const w = new Fisica.Mondo(); w.muro = [-10, 10];
  const b = w.corpo({x: 0, y: 100, m: 2, I: Fisica.asta(20, 2, 3), forme: [{ax: 0, ay: -10, bx: 0, by: 10, r: 3}]});
  b.vx = 1500; for (let i = 0; i < 120; i++) w.passo(DT);
  ok(b.x <= 7.5, "il muro tiene a 1500 px/s");
  const z = new Fisica.Mondo({sonno: true}); z.corpo({x: 0, y: 50, m: 2, I: Fisica.asta(20, 2, 3), forme: [{ax: 0, ay: -10, bx: 0, by: 10, r: 3}]});
  for (let i = 0; i < 300; i++) z.passo(DT);
  ok(z.dorme, "un corpo fermo si addormenta");
}

/* ====================================================================================================================
   2. IL PUPAZZO
   ==================================================================================================================== */
const nuovo = (o) => new Pupazzo(man, o);
const finiti = (p) => Object.values(p.corpi).every(b => [b.x, b.y, b.a, b.vx, b.vy, b.w].every(Number.isFinite));
const inPiedi = (p) => p.corpi.testa.y < p.corpi.busto_inf.y - 15 && p.corpi.busto_inf.y < 70;      // (abbassarsi per schivare porta il bacino a ~66)
const caviglia = (p, l) => p._caviglia(l);
const casaPiedi = (p, tol = 2) => ["dx", "sx"].every(l => Math.abs(caviglia(p, l)[0] - (p.casa + PU.T.offPiede[l])) < tol);
const aCasa = (p, x0, tol = 1.5) => Math.abs(p.corpi.busto_inf.x - x0) < tol && casaPiedi(p, 3.6) && p.piede.dx.stato === "a" && p.piede.sx.stato === "a";

// 2.1 a riposo: sta in piedi senza tremare, i piedi poggiano sempre, non cammina
{
  const p = nuovo(); p.assesta(60);
  const C = p.corpi, mn = {}, mx = {}, mnx = {}, mxx = {};
  let aria = 0, N = 600, vmax = 0;
  const n0 = p.nPassi;
  for (let i = 0; i < N; i++) {
    p.passo(DT);
    if (C.piede_dx.terra === 0 && C.piede_sx.terra === 0) aria++;
    for (const [k, b] of Object.entries(C)) { mn[k] = Math.min(mn[k] ?? 1e9, b.y); mx[k] = Math.max(mx[k] ?? -1e9, b.y); mnx[k] = Math.min(mnx[k] ?? 1e9, b.x); mxx[k] = Math.max(mxx[k] ?? -1e9, b.x); }
    vmax = Math.max(vmax, Math.abs(C.busto_inf.vx));
  }
  const ampY = k => mx[k] - mn[k], ampX = k => mxx[k] - mnx[k];
  log("riposo: ampiezza y bacino", f2(ampY("busto_inf")), "testa", f2(ampY("testa")), "| x bacino", f2(ampX("busto_inf")), "| piedi y", f2(ampY("piede_dx")), f2(ampY("piede_sx")), "x", f2(ampX("piede_dx")), f2(ampX("piede_sx")), "| aria", aria, "| vmax", f2(vmax));
  ok(finiti(p) && inPiedi(p), "a riposo sta in piedi");
  ok(ampY("busto_inf") < 1.6 && ampX("busto_inf") < 0.6, "il bacino non traballa (solo il molleggio della guardia)");
  ok(ampY("piede_dx") < 0.4 && ampY("piede_sx") < 0.4 && ampX("piede_dx") < 0.4, "i piedi stanno fermi");
  ok(aria === 0, "almeno un piede poggia sempre");
  ok(p.nPassi === n0, "a riposo non cammina");
  ok(vmax < 25, `il bacino non ha scatti (${vmax})`);
  for (const k of ["piede_dx", "piede_sx"]) ok(Math.abs(C[k].y - 108.5) < 0.8, `${k} poggia sul pavimento (${C[k].y})`);
}

// 2.2 un colpo a ogni locazione, a danni crescenti: scivola in proporzione, non cade mai, torna a casa a passi
{
  const LOCS = ["testa", "busto", "braccio_dx", "braccio_sx", "gamba_dx", "gamba_sx"];
  for (const loc of LOCS) {
    let prec = 0;
    for (const forza of [0.12, 0.4, 0.9, 1.6]) {
      const p = nuovo(); p.assesta(60);
      const C = p.corpi, x0 = C.busto_inf.x;
      p.colpisci(loc, forza);
      let indietro = 0, sempre = true, rientro = -1;
      for (let i = 0; i < 360; i++) {
        p.passo(DT);
        indietro = Math.max(indietro, x0 - C.busto_inf.x);
        if (!inPiedi(p) || !finiti(p)) sempre = false;
        if (rientro < 0 && i > 20 && aCasa(p, x0)) rientro = i;
      }
      log(loc.padEnd(11), "forza", forza, "indietro", f2(indietro), "rientro al passo", rientro, "passi", p.nPassi);
      ok(sempre, `${loc} ${forza}: non cade mai`);
      ok(indietro >= prec - 1.5, `${loc} ${forza}: piu' forza, piu' scivolata (${indietro} < ${prec})`);
      prec = indietro;
      ok(rientro >= 0 && rientro < 330, `${loc} ${forza}: torna a casa (${rientro})`);
      ok(p._caviglia("dx")[0] > p._caviglia("sx")[0] + 2, `${loc} ${forza}: a fine corsa il piede anteriore sta davanti`);   // (nei passi le gambe si superano, ma poi si rimettono in ordine)
      if (forza >= 0.9) ok(p.nPassi >= 2, `${loc} ${forza}: rientra a passi`);
    }
    ok(prec > 25, `${loc}: con un colpo fortissimo arretra di piu' di 25 px (${prec})`);
  }
  // la parte colpita si muove piu' delle altre
  const t = nuovo(); t.assesta(60); const th = t.corpi.testa.x, tp = t.corpi.piede_dx.x; t.colpisci("testa", 0.9);
  let dh = 0; for (let i = 0; i < 6; i++) { t.passo(DT); dh = Math.max(dh, Math.abs(t.corpi.testa.a)); }
  ok(dh > 0.3, `un colpo alla testa la fa scattare all'indietro (${dh} rad)`);
}

// 2.3 un attacco: carica, colpo e contatto a segno, poi si torna in guardia
for (const stile of ["pugno", "fendente", "affondo"]) {
  const p = nuovo(); p.assesta(60);
  const C = p.corpi, x0 = C.busto_inf.x;
  const T = [x0 + 54, 32];                      // il davanti del petto di un avversario a 58 px (la distanza di guardia dell'arena)
  let ev = {}, t0 = p.t, lean = 0, avanti = 0, sempre = true;
  p.attacca({stile, bersaglio: () => T, insegui: true,
             alColpoInizio: () => { ev.inizio = p.t - t0; },
             alContatto: (i) => { ev.contatto = p.t - t0; ev.err = Math.hypot(i.x - T[0], i.y - T[1]); },
             alFine: () => { ev.fine = p.t - t0; }});
  for (let i = 0; i < 150; i++) {
    p.passo(DT);
    lean = Math.max(lean, C.busto_sup.a); avanti = Math.max(avanti, C.busto_inf.x - x0);
    if (!inPiedi(p) || !finiti(p)) sempre = false;
  }
  log(stile, "inizio", f2(ev.inizio), "contatto", f2(ev.contatto), "errore", f2(ev.err), "fine", f2(ev.fine), "lean", f2(lean), "avanza", f2(avanti));
  ok(ev.inizio > 0.1 && ev.inizio < 0.25, `${stile}: la carica dura un battito (${ev.inizio})`);
  ok(ev.contatto > ev.inizio + 0.05 && ev.contatto < 0.6, `${stile}: il contatto arriva presto (${ev.contatto})`);
  ok(ev.err < 6, `${stile}: la mano e' sul bersaglio al contatto (${ev.err} px)`);
  ok(ev.fine > ev.contatto && ev.fine < 1.2, `${stile}: finisce e torna in guardia (${ev.fine})`);
  ok(sempre && lean < 0.62, `${stile}: resta in piedi, il busto non si piega troppo (${lean})`);
  ok(avanti > 2 && avanti < 32, `${stile}: fa un passo avanti ragionevole (${avanti})`);
  p.assesta(120);
  ok(aCasa(p, x0, 2), `${stile}: poi torna a casa`);
  ok(!p.occupato(), `${stile}: nessuna azione rimasta`);
}

// 2.4 un attacco a distanza: il braccio si alza e punta, al rilascio scatta il callback (il proiettile lo fa l'arena)
{
  const p = nuovo(); p.assesta(60);
  const C = p.corpi, x0 = C.busto_inf.x;
  let rilascio = -1, t0 = p.t, maxBraccio = 0;
  p.attacca({distanza: true, bersaglio: () => [x0 + 54, 30], insegui: false, alColpoInizio: () => { rilascio = p.t - t0; }});
  for (let i = 0; i < 120; i++) { p.passo(DT); maxBraccio = Math.max(maxBraccio, p._polso("dx")[0] - x0); }
  ok(rilascio > 0.1 && rilascio < 0.3, `a distanza: il rilascio arriva (${rilascio})`);
  ok(maxBraccio > 30, `a distanza: il braccio si tende verso l'avversario (${maxBraccio})`);
  ok(inPiedi(p) && finiti(p), "a distanza: resta in piedi");
}

// 2.5 schivate: indietro / abbassa / salto, poi di nuovo a casa
for (const tipo of ["indietro", "abbassa", "salto"]) {
  const p = nuovo(); p.assesta(60);
  const C = p.corpi, x0 = C.busto_inf.x, y0 = C.testa.y, yp = C.piede_dx.y;
  p.schiva(tipo);
  let indietro = 0, giu = 0, su = 0, sempre = true;
  for (let i = 0; i < 240; i++) {
    p.passo(DT);
    indietro = Math.max(indietro, x0 - C.busto_inf.x); giu = Math.max(giu, C.testa.y - y0); su = Math.max(su, yp - C.piede_dx.y);
    if (!inPiedi(p) || !finiti(p)) sempre = false;
  }
  log("schivata", tipo, "indietro", f2(indietro), "testa giu'", f2(giu), "piedi su", f2(su));
  ok(sempre, `${tipo}: non cade`);
  if (tipo === "indietro") ok(indietro > 8, `indietro: si sposta all'indietro (${indietro})`);
  if (tipo === "abbassa") ok(giu > 9, `abbassa: la testa scende (${giu})`);
  if (tipo === "salto") ok(su > 5, `salto: i piedi si staccano (${su})`);
  ok(aCasa(p, x0, 2.5), `${tipo}: poi torna a casa`);
}

// 2.6 parata: la mano va incontro al punto d'impatto e li' resta
{
  const p = nuovo(); p.assesta(60);
  const C = p.corpi, x0 = C.busto_inf.x, P = [x0 + 22, 22];
  let err = 99, t0 = p.t;
  p.para({mano: "dx", punto: () => P});
  for (let i = 0; i < 40; i++) { p.passo(DT); if (i >= 12) err = Math.min(err, Math.hypot(p._polso("dx")[0] - P[0], p._polso("dx")[1] - P[1])); }
  ok(err < 6, `parata: la mano arriva al punto (${err})`);
  p.assesta(120); ok(aCasa(p, x0, 2) && !p.occupato(), "parata: poi torna in guardia");
}

// 2.7 arti storpi: una gamba (sta in piedi sull'altra), un braccio (penzola), due gambe (si siede e si addormenta)
{
  const p = nuovo(); p.assesta(60); p.storpia("gamba_sx", true);
  p.assesta(240);
  ok(finiti(p) && inPiedi(p), "una gamba storpia: sta ancora in piedi");
  const C = p.corpi; const bacino = C.busto_inf.y;
  p.colpisci("busto", 0.6); p.assesta(300);
  ok(inPiedi(p) && finiti(p), "su una gamba sola: un colpo non lo butta giu'");
  p.storpia("gamba_sx", false); p.assesta(120);
  ok(inPiedi(p), "guarita, torna normale");
  const b = nuovo(); b.assesta(60); b.storpia("braccio_dx", true, true); b.assesta(200);
  const pj = b._polso("dx"), sp = b._spalla("dx");
  ok(pj[1] > sp[1] + 25 && inPiedi(b), `braccio storpio: penzola (${pj[1]} > ${sp[1]})`);
  const s = nuovo(); s.assesta(60); s.storpia("gamba_dx", true, true); s.storpia("gamba_sx", true, true);
  s.assesta(500);
  log("seduto: bacino", f2(s.corpi.busto_inf.y), "testa", f2(s.corpi.testa.y), "dorme", s.mondo.dorme);
  ok(finiti(s) && s.corpi.testa.y < s.corpi.busto_inf.y - 15, "senza gambe: si siede con il busto dritto");
  ok(s.mondo.dorme, "senza gambe: poi sta fermo (si addormenta)");
  ok(Math.abs(s.corpi.busto_inf.x - s.casa) < 70, "senza gambe: resta vicino a dove era");
}

// 2.8 la morte: cade all'indietro, a terra, ferma e addormentata; un cadavere colpito si muove e si riaddormenta
for (const forza of [0.1, 0.7, 1.6]) {
  const p = nuovo(); p.assesta(60);
  const C = p.corpi, x0 = C.busto_inf.x;
  p.muori(forza);
  p.assesta(480);
  log("morto forza", forza, "testa y", f2(C.testa.y), "bacino x", f2(C.busto_inf.x - x0), "dorme", p.mondo.dorme);
  ok(finiti(p), "morto: valori finiti");
  ok(C.testa.y > 85 && C.busto_inf.y > 90, "da morto e' a terra");
  ok(C.busto_inf.x < x0 + 5 && x0 - C.busto_inf.x < 80, `cade all'indietro, vicino a dove stava (${x0 - C.busto_inf.x})`);
  ok(p.mondo.dorme, "da morto, fermo, si addormenta");
  const prima = JSON.stringify(Object.values(C).map(b => [b.x, b.y, b.a]));
  p.assesta(300);
  ok(JSON.stringify(Object.values(C).map(b => [b.x, b.y, b.a])) === prima, "un cadavere non si muove piu'");
}

// 2.9 i muri: il corpo non esce dai limiti, a forza di colpi, schivate e attacchi, da vivo e da morto
{
  const p = nuovo(); p.assesta(60);
  const C = p.corpi, x0 = C.busto_inf.x;
  p.muri(x0 - 30, x0 + 40);
  const [lo, hi] = p.muro;
  let minX = 1e9, maxX = -1e9;
  const guarda = () => { for (const b of Object.values(C)) { for (const fo of b.forme) { minX = Math.min(minX, b.x - fo.r - 18); maxX = Math.max(maxX, b.x + fo.r + 18); } minX = Math.min(minX, b.x - 4); maxX = Math.max(maxX, b.x + 4); } };
  let minC = 1e9, maxC = -1e9;
  const guardaC = () => { for (const b of Object.values(C)) { minC = Math.min(minC, b.x); maxC = Math.max(maxC, b.x); } };
  for (let i = 0; i < 12; i++) { p.colpisci("busto", 1.2); for (let j = 0; j < 30; j++) { p.passo(DT); guardaC(); } }
  for (let i = 0; i < 6; i++) { p.schiva("indietro"); for (let j = 0; j < 40; j++) { p.passo(DT); guardaC(); } }
  for (let i = 0; i < 6; i++) { p.attacca({bersaglio: () => [x0 + 54, 32], insegui: true}); for (let j = 0; j < 60; j++) { p.passo(DT); guardaC(); } }
  log("muri", f2(lo), f2(hi), "-> centri tra", f2(minC), "e", f2(maxC));
  ok(minC >= lo - 0.5 && maxC <= hi + 1, `i corpi restano tra i muri (${minC}, ${maxC})`);
  ok(finiti(p) && inPiedi(p), "contro il muro resta in piedi");
  p.muori(1.5); p.assesta(300);
  minC = 1e9; maxC = -1e9; for (let j = 0; j < 100; j++) { p.passo(DT); guardaC(); }
  ok(minC >= lo - 0.5, "anche da morto resta dietro al muro");
}

// 2.10 la scena e' liscia: niente scatti nei movimenti di un duello (un pugno e un colpo subito)
{
  const att = nuovo(), dif = nuovo(); att.assesta(60); dif.assesta(60);
  const prec = {}; let maxPasso = 0, maxAcc = 0, maxAng = 0;
  const guarda = (p, nome) => {
    for (const [k, b] of Object.entries(p.corpi)) {
      const key = nome + k;
      if (prec[key]) {
        const d = Math.hypot(b.x - prec[key].x, b.y - prec[key].y), da = Math.abs(b.a - prec[key].a);
        maxPasso = Math.max(maxPasso, d); maxAng = Math.max(maxAng, da);
        if (prec[key].d !== undefined) maxAcc = Math.max(maxAcc, Math.abs(d - prec[key].d));
        prec[key].d = d;
      }
      prec[key] = {x: b.x, y: b.y, a: b.a, d: prec[key] ? prec[key].d : undefined};
    }
  };
  const x0 = att.corpi.busto_inf.x;
  att.attacca({bersaglio: () => [x0 + 54, 32], insegui: true, alContatto: () => dif.colpisci("busto", 0.7)});
  for (let i = 0; i < 180; i++) { att.passo(DT); dif.passo(DT); guarda(att, "a"); guarda(dif, "d"); }
  log("liscezza: passo massimo", f2(maxPasso), "px/passo, variazione di passo", f2(maxAcc), "angolo max", f2(maxAng), "rad/passo");
  ok(maxPasso < 14, `nessun pezzo salta (${maxPasso} px in un passo)`);
  ok(maxAng < 0.7, `nessun pezzo ruota di scatto (${maxAng} rad in un passo)`);
}

// 2.11 determinismo: due pupazzi con gli stessi comandi hanno la stessa storia
{
  const a = nuovo(), b = nuovo();
  const copione = (p) => { p.assesta(30); p.colpisci("testa", 0.8); p.assesta(40); p.attacca({bersaglio: () => [90, 32], insegui: true}); p.assesta(90); p.schiva("salto"); p.assesta(90); };
  copione(a); copione(b);
  ok(JSON.stringify(Object.values(a.corpi).map(c => [c.x, c.y, c.a])) === JSON.stringify(Object.values(b.corpi).map(c => [c.x, c.y, c.a])), "la simulazione e' deterministica");
}

// 2.12 raffica casuale: nessuna eccezione, nessun valore impazzito, e a fine corsa e' in piedi a casa
{
  const p = nuovo(); p.assesta(60);
  const C = p.corpi, x0 = C.busto_inf.x;
  p.muri(x0 - 80, x0 + 40);
  let seme = 11; const rnd = () => (seme = (seme * 16807) % 2147483647) / 2147483647;
  const LOCS = ["testa", "busto", "braccio_dx", "braccio_sx", "gamba_dx", "gamba_sx"];
  let sempre = true;
  for (let i = 0; i < 80; i++) {
    const r = rnd();
    if (!p.occupato()) {
      if (r < 0.45) p.colpisci(LOCS[Math.floor(rnd() * 6)], 0.1 + rnd() * 1.5);
      else if (r < 0.6) p.schiva(["indietro", "abbassa", "salto"][Math.floor(rnd() * 3)]);
      else if (r < 0.8) p.attacca({stile: ["pugno", "fendente", "affondo"][Math.floor(rnd() * 3)], bersaglio: () => [C.busto_inf.x + 54, 20 + rnd() * 40], insegui: rnd() < 0.5});
      else p.para({mano: "dx", punto: () => [C.busto_inf.x + 22, 24]});
    }
    for (let j = 0, m = 5 + Math.floor(rnd() * 40); j < m; j++) { p.passo(DT); if (!finiti(p) || !inPiedi(p)) sempre = false; }
  }
  ok(sempre, "durante una raffica di eventi non cade e non impazzisce");
  p.assesta(480);
  ok(aCasa(p, x0, 2.5), "dopo la raffica torna a casa");
}

// 2.9 stance Volo: il corpo fluttua (bacino piu' in alto, piedi in aria), ondeggia piano, e torna a terra
{
  const p = nuovo(); p.assesta(60);
  const C = p.corpi, y0 = C.busto_inf.y;
  p.volo(true); p.assesta(240);
  let mn = 1e9, mx = -1e9, pmin = 1e9;
  for (let i = 0; i < 300; i++) { p.passo(DT); mn = Math.min(mn, C.busto_inf.y); mx = Math.max(mx, C.busto_inf.y); pmin = Math.min(pmin, 108.5 - Math.max(C.piede_dx.y, C.piede_sx.y)); }
  const sale = y0 - (mn + mx) / 2;
  log("volo: sale", f2(sale), "ondeggia", f2(mx - mn), "piedi da terra", f2(pmin));
  ok(finiti(p) && sale > 9 && sale < 22, `in volo il bacino sale (${f2(sale)} px)`);
  ok(mx - mn < 5, `in volo ondeggia piano (${f2(mx - mn)} px)`);
  ok(pmin > 2, `in volo i piedi non toccano terra (${f2(pmin)} px)`);
  const n0 = p.nPassi;                                   // in volo le gambe non camminano: ne' da fermo, ne' se spinto o se attacca
  p.colpisci("busto", 0.8); p.assesta(240);
  p.attacca({stile: "affondo", bersaglio: () => [C.busto_inf.x + 54, 30], insegui: true}); p.assesta(120);
  p.colpisci("busto", 1.2); p.assesta(240);
  ok(p.nPassi === n0, `in volo non si fanno passi (${p.nPassi - n0})`);
  ok(finiti(p) && C.busto_inf.y < y0 - 5, "un colpo in volo non lo fa cadere");
  p.volo(false); p.assesta(420);
  ok(finiti(p) && Math.abs(C.busto_inf.y - y0) < 2 && C.piede_dx.terra + C.piede_sx.terra > 0, "finito il volo torna a terra");
}

// 2.10 vittoria: "salti" = braccia al cielo e saltelli, "braccio" = un braccio solo al cielo e la testa che si china.
// Un braccio storpio non si alza, senza gambe (o in volo) non si salta, la morte ferma la festa.
{
  const prova = (tipo, prep, sec = 5) => {
    const p = nuovo(); p.assesta(60); if (prep) { prep(p); p.assesta(200); }
    const C = p.corpi, y0 = C.busto_inf.y;
    p.esulta(tipo);
    let su = 0, giu = 0, partenze = 0, inAria = false, tocca = false;
    for (let i = 0; i < sec * 60; i++) {
      p.passo(DT);
      const y = C.busto_inf.y; su = Math.min(su, y - y0); giu = Math.max(giu, y - y0);
      const aria = C.piede_dx.terra + C.piede_sx.terra === 0 && y - y0 < -3;
      if (aria && !inAria) partenze++; inAria = aria;
    }
    const alta = l => C.testa.y - p._polso(l)[1];                // > 0: la mano e' sopra il centro della testa
    return {p, C, su, giu, partenze, alta, dx: alta("dx"), sx: alta("sx"), chino: C.testa.a - C.busto_sup.a};
  };
  const s1 = prova("salti");
  log("vittoria salti: mani", f2(s1.dx), f2(s1.sx), "saltelli", s1.partenze, "sale", f2(-s1.su), "scende", f2(s1.giu));
  ok(finiti(s1.p) && s1.dx > 12 && s1.sx > 12, `salti: tutte e due le mani sopra la testa (${f2(s1.dx)}, ${f2(s1.sx)})`);
  ok(s1.partenze >= 6 && -s1.su > 8 && -s1.su < 20, `salti: saltella (${s1.partenze} saltelli, ${f2(-s1.su)} px di quota)`);
  ok(s1.giu < 9, `salti: atterra morbido senza crollare (${f2(s1.giu)} px)`);
  const s2 = prova("braccio");
  log("vittoria braccio: mani", f2(s2.dx), f2(s2.sx), "testa chinata", f2(s2.chino));
  ok(finiti(s2.p) && Math.max(s2.dx, s2.sx) > 12 && Math.min(s2.dx, s2.sx) < -20, `braccio: uno solo al cielo, l'altro lungo il fianco (${f2(s2.dx)}, ${f2(s2.sx)})`);
  ok(s2.chino > 0.35, `braccio: la testa si china (${f2(s2.chino)} rad)`);
  ok(s2.partenze === 0 && -s2.su < 2.5, "braccio: non salta");
  const s3 = prova("salti", p => p.storpia("braccio_dx", true, true));
  ok(s3.dx < 0 && s3.sx > 12, `salti: il braccio storpio resta giu' (${f2(s3.dx)}) e l'altro sale (${f2(s3.sx)})`);
  const s4 = prova("braccio", p => p.storpia("braccio_dx", true, true));
  ok(s4.dx < 0 && s4.sx > 12, "braccio: se il destro e' storpio alza il sinistro");
  const s5 = prova("salti", p => p.storpia("gamba_dx", true, true));
  ok(finiti(s5.p) && s5.partenze === 0 && s5.dx > 12 && s5.sx > 12, "salti: con una gamba storpia alza le braccia ma non salta");
  const s6 = prova("salti", p => { p.storpia("gamba_dx", true, true); p.storpia("gamba_sx", true, true); });
  ok(finiti(s6.p) && s6.partenze === 0 && s6.dx > 12 && s6.sx > 12, "salti: da seduto alza le braccia (e non salta)");
  const s7 = prova("salti", p => p.volo(true), 4);
  ok(finiti(s7.p) && s7.partenze === 0 && s7.dx > 12, "salti: in volo alza le braccia ma non saltella");
  const s8 = prova("braccio", p => { p.storpia("braccio_dx", true, true); p.storpia("braccio_sx", true, true); });
  ok(finiti(s8.p) && s8.chino > 0.35, "braccio: senza braccia sane china comunque la testa");
  s1.p.muori(0.5); s1.p.assesta(120);
  ok(s1.p.festa === null && s1.p.morto && finiti(s1.p), "la morte ferma la festa");
  const m = nuovo(); m.muori(0.5); m.esulta("salti");
  ok(m.festa === null, "un morto non festeggia");
}

// 2.11 la palestra: posa rilassata, pesi, corda (cicli che si ripetono finche' non si fermano), seduti che si rialzano
{
  // rilassato: le braccia scendono lungo i fianchi senza far cadere nessuno; si torna in guardia quando si smette
  const p = nuovo(); p.assesta(60);
  const guardia = p._polso("dx")[1];
  p.rilassa(true); p.assesta(150);
  log("rilassato: mano dx y", f2(p._polso("dx")[1]), "guardia", f2(guardia));
  ok(finiti(p) && inPiedi(p), "rilassato: sta in piedi");
  ok(p._polso("dx")[1] > guardia + 25 && p._polso("sx")[1] > guardia + 25, "rilassato: le mani scendono lungo i fianchi");
  p.rilassa(false); p.assesta(150);
  ok(Math.abs(p._polso("dx")[1] - guardia) < 2, "e si torna in guardia");
}
{
  // pesi: dal petto sopra la testa, a ripetizione, senza cadere
  const p = nuovo(); p.assesta(60);
  const C = p.corpi, x0 = C.busto_inf.x;
  const c = p.ciclo("pesi");
  ok(p.inCiclo() && p.occupato(), "il ciclo e' in corso");
  let mano = 1e9, basso = 1e9, sempre = true, salita = 0, prima = 1e9;
  for (let i = 0; i < 60 * 12; i++) {
    p.passo(DT);
    const y = p._polso("dx")[1];
    mano = Math.min(mano, y); basso = Math.min(basso, 0);
    if (!inPiedi(p) || !finiti(p)) sempre = false;
    if (y < prima - 0.01) salita++; prima = y;
  }
  log("pesi: mano piu' alta y", f2(mano), "testa", f2(C.testa.y), "deriva", f2(C.busto_inf.x - x0));
  ok(sempre, "pesi: resta in piedi per tutte le ripetizioni");
  ok(mano < C.testa.y - 15, `pesi: a ogni ripetizione le mani passano sopra la testa (${f2(mano)} contro ${f2(C.testa.y)})`);
  ok(Math.abs(C.busto_inf.x - x0) < 4, "pesi: non si sposta");
  p.fermaCicli(); p.assesta(150);
  ok(!p.inCiclo() && !p.occupato() && inPiedi(p), "pesi: fermato il ciclo, la fatica finisce");
}
{
  // corda: saltelli a ritmo, resta dov'e'
  const p = nuovo(); p.assesta(60);
  const C = p.corpi, x0 = C.busto_inf.x, y0 = C.busto_inf.y;
  p.ciclo("corda", {periodo: 0.62});
  let quota = 0, sempre = true, atterrati = 0, inAria = false;
  for (let i = 0; i < 60 * 12; i++) {
    p.passo(DT);
    quota = Math.max(quota, y0 - C.busto_inf.y);
    const aria = C.piede_dx.terra + C.piede_sx.terra === 0 && y0 - C.busto_inf.y > 3;
    if (inAria && !aria) atterrati++; inAria = aria;
    if (!inPiedi(p) || !finiti(p)) sempre = false;
  }
  log("corda: quota", f2(quota), "atterraggi", atterrati, "deriva", f2(C.busto_inf.x - x0));
  ok(sempre, "corda: non crolla mai, nemmeno all'atterraggio");
  ok(quota > 8 && quota < 22, `corda: salta (${f2(quota)} px)`);
  ok(atterrati >= 12 && atterrati <= 24, `corda: un saltello a giro (${atterrati} in 12 s)`);
  ok(Math.abs(C.busto_inf.x - x0) < 6, "corda: resta nello stesso punto");
  p.fermaCicli(); p.assesta(120);
  ok(inPiedi(p) && !p.occupato(), "corda: poi si ferma");
}
{
  // due gambe spente = seduto per terra; guarite, si rialza
  const p = nuovo(); p.assesta(60);
  p.storpia("gamba_dx", true); p.storpia("gamba_sx", true); p.assesta(240);
  ok(p.seduto && p.corpi.busto_inf.y > 70 && finiti(p), "seduto: il bacino e' a terra");
  p.storpia("gamba_dx", false); p.storpia("gamba_sx", false); p.assesta(240);
  ok(!p.seduto && inPiedi(p) && finiti(p), "guarito: si rialza");
}

/* ====================================================================================================================
   3. L'INTERNO DEGLI SPRITE (scheletro e carne sotto la pelle: static/sprites/maschio/{scheletro,carne}_*.png)
   ==================================================================================================================== */
{
  // PNG a 8 bit senza interlaccio, a palette o RGBA (come li scrive pxl): decodifica minima, solo per confrontare le sagome.
  // Restituisce `alfa[i]` per pixel.
  const zlib = require("zlib");
  const png = (file) => {
    const b = fs.readFileSync(path.join(__dirname, "static/sprites/maschio", file));
    ok(b.readUInt32BE(0) === 0x89504e47, `${file}: e' un PNG`);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20), tipo = b[25], bpp = tipo === 6 ? 4 : 1;
    ok(b[24] === 8 && (tipo === 6 || tipo === 3) && b[28] === 0, `${file}: 8 bit, a palette o RGBA, senza interlaccio`);
    const idat = []; let trns = null, plte = null;
    for (let o = 8; o < b.length;) {
      const len = b.readUInt32BE(o), t = b.toString("latin1", o + 4, o + 8);
      if (t === "IDAT") idat.push(b.subarray(o + 8, o + 8 + len));
      if (t === "tRNS") trns = b.subarray(o + 8, o + 8 + len);
      if (t === "PLTE") plte = b.subarray(o + 8, o + 8 + len);
      o += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * bpp), riga = w * bpp;
    for (let y = 0; y < h; y++) {
      const f = raw[y * (riga + 1)], src = y * (riga + 1) + 1;
      for (let x = 0; x < riga; x++) {
        const a = x >= bpp ? px[y * riga + x - bpp] : 0, up = y ? px[(y - 1) * riga + x] : 0, ul = x >= bpp && y ? px[(y - 1) * riga + x - bpp] : 0;
        const pr = a + up - ul, pa = Math.abs(pr - a), pb = Math.abs(pr - up), pc = Math.abs(pr - ul);
        const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? up : ul;
        px[y * riga + x] = (raw[src + x] + (f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : f === 4 ? paeth : 0)) & 255;
      }
    }
    const alfa = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alfa[i] = tipo === 6 ? px[i * 4 + 3] : (trns && px[i] < trns.length ? trns[px[i]] : 255);
    // canale rosso di ogni pixel: gli sprite a indici (capelli, vestiti) usano solo i 5 grigi del corpo (v. STILE_SPRITE.md sez. 4)
    const rosso = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) rosso[i] = tipo === 6 ? px[i * 4] : plte[px[i] * 3];
    const rgb = (i) => tipo === 6 ? [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]] : [plte[px[i] * 3], plte[px[i] * 3 + 1], plte[px[i] * 3 + 2]];
    return {w, h, alfa, rosso, rgb};
  };
  let pezzi = 0;
  for (const [nome, p] of Object.entries(man.parti)) {
    if (!p.scheletro && !p.carne) continue;
    pezzi++;
    ok(p.scheletro && p.carne, `${nome}: scheletro e carne vanno in coppia`);
    const pelle = png(p.file), sk = png(p.scheletro), ca = png(p.carne);
    ok(sk.w === pelle.w && sk.h === pelle.h && ca.w === pelle.w && ca.h === pelle.h, `${nome}: scheletro e carne hanno le dimensioni della pelle`);
    let carneFuori = 0, carneBuchi = 0, ossa = 0, ossaFuori = 0;
    for (let i = 0; i < pelle.w * pelle.h; i++) {
      const sagoma = pelle.alfa[i] > 0, c = ca.alfa[i] > 0, o = sk.alfa[i] > 0;
      if (c && !sagoma) carneFuori++;
      if (sagoma && !c) carneBuchi++;
      if (o) { ossa++; if (!sagoma) ossaFuori++; }
    }
    ok(carneFuori === 0 && carneBuchi === 0, `${nome}: la carne ha la stessa sagoma della pelle`);
    ok(ossa > 20 && ossaFuori === 0, `${nome}: lo scheletro c'e' e sta dentro la sagoma (${ossa} px, ${ossaFuori} fuori)`);
  }
  ok(pezzi === Object.keys(man.parti).length, "ogni pezzo ha il suo interno");
  log("interno: ", pezzi, "pezzi con scheletro e carne");

  // ---- aspetto: capigliature, maglie, pantaloni e texture dei colori (aspetto.json)
  const asp = JSON.parse(fs.readFileSync(path.join(__dirname, "static/sprites/maschio/aspetto.json"), "utf8"));
  const GRIGI = new Set([38, 106, 142, 178, 216]);
  const soloIndici = (img, file) => {
    for (let i = 0; i < img.w * img.h; i++) if (img.alfa[i] && !GRIGI.has(img.rosso[i])) ok(false, `${file}: un colore che non e' uno dei 5 indici (R=${img.rosso[i]})`);
    return true;
  };
  ok(asp.capelli.length === 16, "16 capigliature");
  ok(asp.capelli.filter((c) => c.sesso === "M").length === 8 && asp.capelli.filter((c) => c.sesso === "F").length === 8, "8 maschili e 8 femminili");
  ok(asp.capelli.every((c) => ["M", "F", "unisex"].includes(c.sesso)) && new Set(asp.capelli.map((c) => c.id)).size === 16, "ogni capigliatura ha un id e un tag di sesso valido");
  const testa = png("testa.png");
  for (const c of asp.capelli) {
    const img = png(c.file);
    ok(img.w >= testa.w && img.h >= testa.h, `${c.id}: la tela dei capelli contiene la testa`);
    soloIndici(img, c.file);
    // il PNG dei capelli copre l'angolo alto-sinistro della testa a `offset` (negativo = fuori dalla testa): niente sul bordo, che deve restare vuoto
    ok(c.offset[0] < 0 && c.offset[1] < 0 && c.offset[0] + img.w > testa.w && c.offset[1] + img.h > testa.h, `${c.id}: l'offset porta la testa dentro la tela`);
    let sul = 0; for (let x = 0; x < img.w; x++) sul += (img.alfa[x] + img.alfa[(img.h - 1) * img.w + x] > 0 ? 1 : 0);
    for (let y = 0; y < img.h; y++) sul += (img.alfa[y * img.w] + img.alfa[y * img.w + img.w - 1] > 0 ? 1 : 0);
    ok(sul === 0, `${c.id}: i capelli non toccano il bordo della tela`);
    ok(img.rosso.some((v, i) => img.alfa[i] && v === 38) && img.rosso.some((v, i) => img.alfa[i] && v >= 142), `${c.id}: ha contorno e toni di capello`);
  }
  for (const [tipo, lista, n] of [["maglie", asp.maglie, 44], ["pantaloni", asp.pantaloni, 23]]) {
    ok(lista.length === n && new Set(lista.map((g) => g.id)).size === n, `${n} ${tipo} (3 base + 10 + 10, le maglie anche 10 cyberpunk)`);
    for (const g of lista) for (const [parte, file] of Object.entries(g.pezzi)) {
      const img = png(file), dx = png(`${parte}${parte.startsWith("busto") ? "" : "_dx"}.png`), sx = man.parti[`${parte}_sx`] ? png(`${parte}_sx.png`) : dx;
      ok(img.w === dx.w && img.h === dx.h && img.w === sx.w && img.h === sx.h, `${file}: stessa dimensione del pezzo (il lato dx e sx usano lo stesso PNG)`);
      soloIndici(img, file);
      let dentro = true, pieni = 0;
      for (let i = 0; i < img.w * img.h; i++) if (img.alfa[i]) { pieni++; if (!dx.alfa[i]) dentro = false; }
      ok(dentro && pieni > 15, `${file}: sta dentro la sagoma del pezzo (${pieni} px)`);
    }
  }
  // le falde dei cappotti (trench e 10 cyberpunk): un pezzo staccato, a indici, appeso al busto basso; il perno sta nella tela e sulla riga di cima
  const conFalda = asp.maglie.filter((g) => g.falda);
  ok(conFalda.length === 11, `11 cappotti con la falda (${conFalda.length})`);
  for (const g of conFalda) {
    const f = g.falda, img = png(f.file);
    soloIndici(img, f.file);
    ok(f.pezzo === "busto_inf" && man.parti[f.pezzo] && f.offset.length === 2 && f.offset[1] === 13, `${g.id}: la falda e' appesa al busto basso`);
    ok(f.perno[0] >= 0 && f.perno[0] < img.w && f.perno[1] === 0, `${g.id}: il perno della falda sta nella tela, in cima`);
    let nelBordo = 0; for (let y = 0; y < img.h; y++) if (img.alfa[y * img.w + img.w - 1]) nelBordo++;
    for (let x = 0; x < img.w; x++) if (img.alfa[(img.h - 1) * img.w + x]) nelBordo++;
    ok(nelBordo === 0, `${g.id}: la falda non esce dalla tela a destra e in basso (${nelBordo} px sul bordo)`);
    ok(img.alfa.reduce((n, v) => n + (v ? 1 : 0), 0) > 60, `${g.id}: la falda ha una sagoma`);
  }
  // copricapo: 5 cappelli e 10 maschere (5 cyberpunk), sulla tela dei capelli, a indici (il colore fisso e' nel manifest)
  ok(asp.copricapo.length === 15 && asp.copricapo.filter((c) => c.tipo === "cappello").length === 5, "5 cappelli e 10 maschere");
  for (const c of asp.copricapo) {
    const img = png(c.file);
    soloIndici(img, c.file);
    ok(img.w === 32 && img.h === 50 && c.offset[0] === -10 && c.offset[1] === -10, `${c.id}: stessa tela e stesso offset dei capelli`);
    ok(img.alfa.reduce((n, v) => n + (v ? 1 : 0), 0) > 40, `${c.id}: ha una sagoma`);
    ok((c.non_con || []).every((id) => asp.capelli.some((h) => h.id === id)), `${c.id}: le capigliature incompatibili esistono`);
    ok(!c.colore || (c.colore.length === 3 && c.colore.every((v) => v >= 0 && v <= 255)), `${c.id}: colore fisso valido`);
  }
  // le ali (potere Ali): un'ala sola, a indici, con il perno dentro la tela e l'attacco su un pezzo del corpo
  const ala = png(asp.ali.file);
  soloIndici(ala, asp.ali.file);
  ok(asp.ali.perno[0] < ala.w && asp.ali.perno[1] < ala.h && man.parti[asp.ali.attacco.pezzo], "il perno dell'ala sta nella tela e l'attacco e' un pezzo del corpo");
  ok(ala.alfa.reduce((n, v) => n + (v ? 1 : 0), 0) > 400, "l'ala ha una sagoma piena");
  // le fasciature (palestra): un overlay per pezzo, a indici, dentro la sagoma, con un colore crema; coprono solo una parte del pezzo
  const fa = asp.fasciature;
  ok(fa && fa.colore.length === 3 && fa.colore.every((v) => v >= 150 && v <= 255), "le fasciature hanno un colore chiaro");
  ok(JSON.stringify(Object.keys(fa.pezzi).sort()) === JSON.stringify(["avambraccio", "braccio_sup", "busto_inf", "busto_sup", "coscia", "stinco", "testa"]), "una fasciatura per ogni pezzo (i lati dx e sx usano lo stesso PNG)");
  for (const [parte, file] of Object.entries(fa.pezzi)) {
    const img = png(file), dx = png(`${parte}${parte.startsWith("busto") || parte === "testa" ? "" : "_dx"}.png`);
    soloIndici(img, file);
    let dentro = true, pieni = 0, base = 0;
    for (let i = 0; i < img.w * img.h; i++) { if (dx.alfa[i]) base++; if (img.alfa[i]) { pieni++; if (!dx.alfa[i]) dentro = false; } }
    ok(img.w === dx.w && img.h === dx.h && dentro && pieni > 30 && pieni < base, `${file}: dentro la sagoma, e lascia scoperto qualcosa (${pieni}/${base} px)`);
  }
  // le texture: una striscia di colori; nei vestiti il bianco e' la sezione piu' stretta
  const tv = png(asp.texture.vestiti), tc = png(asp.texture.capelli);
  ok(tv.w >= 100 && tc.w >= 100, "le texture sono abbastanza larghe da campionare");
  const bianchi = []; for (let x = 0; x < tv.w; x++) if (Math.min(...tv.rgb(x)) > 225 && tv.alfa[x]) bianchi.push(x);
  ok(bianchi.length >= 1 && bianchi.length <= 0.04 * tv.w, `nei vestiti il bianco e' una sezione stretta (${bianchi.length}/${tv.w})`);
  log("aspetto: 16 capigliature, 44 maglie, 23 pantaloni, 15 copricapo; texture", tv.w, "e", tc.w);

  // ---- i pezzi dei poteri (poteri.json, sorgente tools/sprites/maschio_poteri.px.js): i rinforzati di Pelle Invincibile (dal rango 3) e gli
  // avambracci appuntiti di Appendici Affilate. Stessi nomi dei pezzi, stessi indici di grigio (piu' la commessura, R = 70).
  const pot = JSON.parse(fs.readFileSync(path.join(__dirname, "static/sprites/maschio/poteri.json"), "utf8"));
  ok(pot.cucitura === 70, "la commessura dei rinforzati e' il sesto indice (R = 70)");
  ok(JSON.stringify(Object.keys(pot.rinforzato.pezzi).sort()) === JSON.stringify(Object.keys(man.parti).sort()), "un pezzo rinforzato per ogni pezzo del corpo");
  const [mrx, mry] = pot.rinforzato.margine;
  ok(mrx === 1 && mry === 1, "i rinforzati hanno un pixel in piu' a sinistra e in alto (l'arena li posa a base - 1)");
  let areaBase = 0, areaRinf = 0, altBase = 0, altRinf = 0;
  for (const [nome, file] of Object.entries(pot.rinforzato.pezzi)) {
    const r = png(file), b = png(man.parti[nome].file), indici = new Set([...GRIGI, pot.cucitura]);
    ok(r.alfa.every((a) => a === 0 || a === 255), `${file}: pixel pieni o vuoti`);
    ok(r.rosso.every((v, i) => !r.alfa[i] || indici.has(v)), `${file}: solo i 5 indici e la commessura`);
    ok(r.w >= b.w && r.w <= b.w + 2 && r.h >= b.h && r.h <= b.h + 2, `${file}: cresce di 1-2 px sulla tela del pezzo base (${b.w}x${b.h} -> ${r.w}x${r.h})`);
    let sopra = 0, bas = 0, cucit = 0, cucitFuori = 0;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.alfa[y * b.w + x]) { bas++; if (r.alfa[(y + mry) * r.w + x + mrx]) sopra++; }
    ok(sopra >= 0.9 * bas, `${file}: contiene il pezzo base (a meno delle tacche tra le piastre: ${sopra}/${bas} px)`);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      if (!(r.alfa[y * r.w + x] && r.rosso[y * r.w + x] === pot.cucitura)) continue;
      cucit++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!r.alfa[(y + dy) * r.w + x + dx]) cucitFuori++;
    }
    ok(cucit >= 3 && cucitFuori === 0, `${file}: ha commessure (${cucit} px) e nessuna e' sul bordo della sagoma (${cucitFuori} px sul bordo)`);
    const q = man.parti[nome].perno;
    ok(q[0] + mrx < r.w && q[1] + mry < r.h, `${file}: il perno (${q[0] + mrx}, ${q[1] + mry}) sta nella tela`);
    areaBase += bas; areaRinf += r.alfa.filter((a) => a).length;
    if (nome === "busto_sup" || nome === "busto_inf" || nome === "testa" || nome === "coscia_dx" || nome === "stinco_dx") { altBase += b.h; altRinf += r.h; }
  }
  ok(areaRinf / areaBase > 1.05 && areaRinf / areaBase < 1.3, `i rinforzati sono piu' grandi (area x${(areaRinf / areaBase).toFixed(2)}) ma non di troppo`);
  ok(altRinf / altBase > 1.03 && altRinf / altBase < 1.08, `in altezza i pezzi grandi crescono di circa il 5% (x${(altRinf / altBase).toFixed(3)})`);
  for (const [nome, file] of Object.entries(pot.appuntito.pezzi)) {
    const a = png(file), b = png(man.parti[nome].file);
    ok(a.w === b.w && a.h === b.h, `${file}: stessa tela del pezzo base (il perno resta quello)`);
    ok(a.rosso.every((v, i) => !a.alfa[i] || GRIGI.has(v)), `${file}: solo i 5 indici`);
    const larg = (img, y) => { let n = 0; for (let x = 0; x < img.w; x++) if (img.alfa[y * img.w + x]) n++; return n; };
    let ultima = img_ultima(a);
    function img_ultima(img) { for (let y = img.h - 1; y >= 0; y--) if (larg(img, y)) return y; return -1; }
    ok(larg(a, ultima) <= 2 && larg(b, img_ultima(b)) >= 2 && larg(a, 18) < larg(b, 18), `${file}: si assottiglia fino a una punta (larghezza in fondo ${larg(a, ultima)}, a riga 18 ${larg(a, 18)} contro ${larg(b, 18)})`);
    ok(a.alfa.filter((v) => v).length < b.alfa.filter((v) => v).length, `${file}: e' piu' sottile del pezzo base`);
  }
  log("poteri: 11 pezzi rinforzati (area x" + (areaRinf / areaBase).toFixed(2) + ", altezza x" + (altRinf / altBase).toFixed(3) + ") e 2 avambracci appuntiti");
}

/* ====================================================================================================================
   4. L'ASPETTO DEI POTERI (static/poteri.js): stato, materiali della pelle, effetti "a mossa", neve, teschi, disegno senza errori
   ==================================================================================================================== */
{
  // un canvas finto: abbastanza per far girare il codice che disegna (e contare quante volte disegna)
  let disegni = 0;
  const ctxFinto = () => new Proxy({}, {
    get: (t, k) => k in t ? t[k] : k === "createImageData" ? (w, h) => ({data: new Uint8ClampedArray(w * h * 4)}) :
      k === "fillRect" || k === "drawImage" ? () => { disegni++; } : () => undefined,
    set: (t, k, v) => { t[k] = v; return true; },
  });
  globalThis.document = {createElement: () => { const c = {width: 0, height: 0}; c.ctx = ctxFinto(); c.getContext = () => c.ctx; return c; }};
  const Poteri = require("./static/poteri.js");
  const ID = Poteri.ID;
  ok(Object.keys(ID).length === 15, "i 15 poteri con un aspetto");
  const potere = JSON.parse(fs.readFileSync(path.join(__dirname, "data/powers.json"), "utf8"));
  const nomeDi = (id) => (potere.find((x) => x.id === id) || {}).nome;
  const NOMI = {PELLE: "Pelle Invincibile", PIRO: "Pirocinesi", ASSORBI: "Assorbi Energia", ELETTRO: "Electrocinesi", APPENDICI: "Appendici Affilate", ANATEMA: "Anatema",
                URLO: "super-urlo", CAMPO: "Campo di forza", SOLDATO: "Supersoldato", HYDRO: "Hydrocinesi", CRIO: "Criocinesi", ACIDO: "Acidocinesi", TELE: "Telecinesi",
                NECRO: "Necromanzia", GEO: "Geocinesi"};
  for (const [k, id] of Object.entries(ID)) ok(nomeDi(id) === NOMI[k], `l'id ${id} di ${k} e' il potere "${NOMI[k]}" in powers.json (${nomeDi(id)})`);

  // ---- stato: dove la pelle e' ancora corazzata, chi e' acceso, quando un pezzo va ridisegnato
  const hp = (o) => Object.fromEntries(Object.entries(o).map(([l, [val, arm, crippled]]) => [l, {val, arm, crippled: !!crippled}]));
  const L = {};
  Poteri.aggiorna(L, {extra: {poteri: {"1": 3, "6": 1}, stance_poteri: [4]}, hp: hp({testa: [80, 30], busto: [120, 0], braccio_dx: [50, 5, true], braccio_sx: [0, 9], gamba_dx: [10, 1], gamba_sx: [100, 1]})});
  ok(L.po.ids[1] === 3 && L.po.ids[6] === 1 && L.po.stance.has(4), "poteri accesi col rango e stance in corso");
  ok(JSON.stringify(L.po.pelle) === JSON.stringify({testa: 3, gamba_dx: 3, gamba_sx: 3}), "la pelle e' corazzata solo dove c'e' armatura, la locazione ha hp e non e' storpia");
  ok(Poteri.rangoPelle(L, "testa") === 3 && Poteri.rangoPelle(L, "busto") === 0, "rango del materiale per locazione");
  ok(Poteri.chiave(L, "testa", "testa") === "P3" && Poteri.chiave(L, "busto", "busto_sup") === "", "la chiave di ridisegno dice se il pezzo e' in materiale");
  ok(Poteri.chiave(L, "braccio_dx", "avambraccio_dx") === "A" && Poteri.chiave(L, "braccio_dx", "braccio_sup_dx") === "", "Appendici Affilate: solo gli avambracci sono lame");
  ok(Poteri.lama(L, "avambraccio_sx") && !Poteri.lama(L, "braccio_sup_sx"), "lama() solo sugli avambracci");
  const k0 = Poteri.chiave(L, "testa", "testa");
  Poteri.aggiorna(L, {extra: {poteri: {"1": 3}}, hp: hp({testa: [80, 0], busto: [1, 1], braccio_dx: [1, 1], braccio_sx: [1, 1], gamba_dx: [1, 1], gamba_sx: [1, 1]})});
  ok(Poteri.chiave(L, "testa", "testa") !== k0 && Poteri.rangoPelle(L, "testa") === 0 && Poteri.rangoPelle(L, "busto") === 3, "armatura distrutta in una locazione: solo li' il materiale sparisce e il pezzo va ridisegnato");
  ok(!Poteri.lama(L, "avambraccio_dx"), "senza Appendici Affilate niente lame");
  Poteri.aggiorna(L, null);
  ok(Object.keys(L.po.ids).length === 0 && Object.keys(L.po.pelle).length === 0, "senza stato (la palestra) non c'e' nessun effetto");

  // ---- materiali: ogni rango ha il suo colore; la pietra e' grigia, l'ossidiana scura, la lava arancione, il cristallo verde acqua
  const img = {w: 24, h: 24, px: new Uint8Array(24 * 24 * 4)};
  const IND = [38, 106, 142, 178, 216, 70];
  for (let i = 0; i < 24 * 24; i++) { const v = IND[(i * 7 + (i >> 3)) % IND.length]; img.px.set([v, v, v, i % 17 === 0 ? 0 : 255], i * 4); }
  const colora = (rango) => {
    const cv = document.createElement("canvas"); let dati = null;
    cv.ctx.createImageData = (w, h) => (dati = {data: new Uint8ClampedArray(w * h * 4)});
    cv.ctx.putImageData = () => {};
    Poteri.coloraMateriale(cv, img, rango, {y0: 20, seme: 7});
    let r = 0, g = 0, b = 0, m = 0, lava = 0, vuoti = 0, pieni = 0, trasp = 0;
    for (let i = 0; i < 24 * 24; i++) {
      const a = dati.data[i * 4 + 3];
      if (img.px[i * 4 + 3] === 0) { trasp++; if (a === 0) vuoti++; continue; }
      if (a === 255) pieni++;
      const R = dati.data[i * 4], G = dati.data[i * 4 + 1], B = dati.data[i * 4 + 2];
      r += R; g += G; b += B; m++;
      if (R > 200 && B < 150 && G > 100) lava++;
    }
    return {r: r / m, g: g / m, b: b / m, lava, vuoti, pieni, m, trasp};
  };
  const mat = [1, 2, 3, 4].map(colora);
  ok(mat.every((q) => q.pieni === q.m && q.vuoti === q.trasp), "i materiali riempiono ogni pixel dello sprite (pieno) e lasciano i trasparenti");
  ok(Math.abs(mat[0].r - mat[0].g) < 14 && Math.abs(mat[0].g - mat[0].b) < 14 && mat[0].g > 70 && mat[0].g < 160, `rango 1: pietra, grigia (${mat[0].r | 0},${mat[0].g | 0},${mat[0].b | 0})`);
  ok(mat[1].r + mat[1].g + mat[1].b < 3 * 85 && mat[1].b > mat[1].g, `rango 2: ossidiana, scura e violacea (${mat[1].r | 0},${mat[1].g | 0},${mat[1].b | 0})`);
  ok(mat[2].lava > mat[1].lava + 5 && mat[1].lava === 0, `rango 3: ossidiana con la lava (${mat[2].lava} px di lava, 0 senza)`);
  ok(mat[3].g > mat[3].r * 1.6 && mat[3].b > mat[3].r * 1.4, `rango 4: cristalli verde acqua (${mat[3].r | 0},${mat[3].g | 0},${mat[3].b | 0})`);
  ok(JSON.stringify(colora(2)) === JSON.stringify(colora(2)), "il materiale e' deterministico (stesso seme, stessi pixel)");

  // ---- un passo alla volta: le aure "a mossa" salgono con una stance o una mossa e scendono dopo; teschi, neve
  const A = {ctx: ctxFinto(), pos: () => [20, 50, 0], punto: (_L, _c, _g) => [20, 50]};
  const nuovoL = (poteri, stance = []) => { const x = {lamp: {}, pup: {morto: false}, ko: false}; Poteri.aggiorna(x, {extra: {poteri, stance_poteri: stance}, hp: hp({})}); return x; };
  const passi = (x, k) => { for (let i = 0; i < k; i++) Poteri.passo(x, A); };
  const L2 = nuovoL({"4": 1, "8": 2, "14": 3}, [4]);
  passi(L2, 60);
  ok(L2.po.k[4] > 0.99 && L2.po.k[8] < 0.01 && L2.po.k[14] < 0.01, "una stance in corso accende Assorbi Energia; Anatema e Super Soldato aspettano una mossa");
  Poteri.mossa(L2, [8], 0.5);
  passi(L2, 20);
  ok(L2.po.k[8] > 0.4 && L2.po.k[14] < 0.01, `la mossa di Anatema accende solo Anatema (${L2.po.k[8].toFixed(2)})`);
  passi(L2, 120);
  ok(L2.po.k[8] < 0.05, "...e si spegne a mossa finita");
  Poteri.mossa(L2, undefined, 1); Poteri.mossa(L2, [], 1);
  ok(Object.keys(L2.po.mossa).length === 0, "una mossa senza poteri non accende niente");
  L2.ko = true; passi(L2, 90);
  ok(L2.po.k[4] < 0.05 && L2.po.part.length === 0, "chi cade non ha piu' aure ne' particelle");

  const L3 = nuovoL({"16": 3, "19": 4, "3": 4, "15": 4, "17": 4, "20": 4, "5": 4, "18": 2});
  passi(L3, 400);
  ok(L3.po.neve && L3.po.neve.length >= 40 && L3.po.neve.every((f) => Number.isFinite(f.x) && f.y <= 110.5), "criocinesi: nevica (fiocchi in aria, mai sotto il pavimento)");
  ok(L3.po.teschi.length === 3 && L3.po.teschi.every((s) => Math.hypot(s.x - 20, s.y - 50) < 60), "necromanzia rango 4: tre teschi che seguono l'eroe");
  ok(L3.po.part.length > 0 && L3.po.part.length <= 260, "braci, gocce e polvere ci sono e sono limitate");
  const L4 = nuovoL({"19": 1}); passi(L4, 60);
  ok(L4.po.teschi.length === 1 && L4.po.neve === null, "necromanzia rango 1: un teschio, e senza criocinesi niente neve");
  Poteri.aggiorna(L3, {extra: {poteri: {}}, hp: hp({})}); passi(L3, 2);
  ok(L3.po.teschi.length === 0 && L3.po.neve === null, "spenti i poteri spariscono teschi e neve");

  // ---- il disegno gira senza errori con tutti i poteri insieme (e non disegna niente senza poteri o da morti)
  const tutti = Object.fromEntries(Object.values(ID).map((id) => [id, 4]));
  const L5 = nuovoL(tutti, [4, 8, 14]);
  passi(L5, 120);
  disegni = 0; Poteri.dietro(L5, A); Poteri.davanti(L5, A);
  ok(disegni > 200, `tutti i poteri insieme si disegnano (${disegni} operazioni)`);
  const L6 = nuovoL({}); passi(L6, 10); disegni = 0; Poteri.dietro(L6, A); Poteri.davanti(L6, A);
  ok(disegni === 0, "senza poteri non si disegna niente");
  L5.ko = true; disegni = 0; Poteri.dietro(L5, A); Poteri.davanti(L5, A);
  ok(disegni === 0, "un caduto non ha effetti");
  disegni = 0; Poteri.disegnaOnda(A.ctx, {x: 40, y: 50, vx: 200, vy: 0, t: 0.2, t0: 0.34});
  ok(disegni > 10, "le onde soniche si disegnano");
  log("poteri: stato, materiali, effetti a mossa, neve, teschi e disegno ok");
}

console.log(`OK - ${n} check passati`);
