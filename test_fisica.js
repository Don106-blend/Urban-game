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
  for (const [tipo, lista] of [["maglie", asp.maglie], ["pantaloni", asp.pantaloni]]) {
    ok(lista.length === 3, `3 ${tipo}`);
    for (const g of lista) for (const [parte, file] of Object.entries(g.pezzi)) {
      const img = png(file), dx = png(`${parte}${parte.startsWith("busto") ? "" : "_dx"}.png`), sx = man.parti[`${parte}_sx`] ? png(`${parte}_sx.png`) : dx;
      ok(img.w === dx.w && img.h === dx.h && img.w === sx.w && img.h === sx.h, `${file}: stessa dimensione del pezzo (il lato dx e sx usano lo stesso PNG)`);
      soloIndici(img, file);
      let dentro = true, pieni = 0;
      for (let i = 0; i < img.w * img.h; i++) if (img.alfa[i]) { pieni++; if (!dx.alfa[i]) dentro = false; }
      ok(dentro && pieni > 15, `${file}: sta dentro la sagoma del pezzo (${pieni} px)`);
    }
  }
  // le texture: una striscia di colori; nei vestiti il bianco e' la sezione piu' stretta
  const tv = png(asp.texture.vestiti), tc = png(asp.texture.capelli);
  ok(tv.w >= 100 && tc.w >= 100, "le texture sono abbastanza larghe da campionare");
  const bianchi = []; for (let x = 0; x < tv.w; x++) if (Math.min(...tv.rgb(x)) > 225 && tv.alfa[x]) bianchi.push(x);
  ok(bianchi.length >= 1 && bianchi.length <= 0.04 * tv.w, `nei vestiti il bianco e' una sezione stretta (${bianchi.length}/${tv.w})`);
  log("aspetto: 16 capigliature, 3 maglie, 3 pantaloni; texture", tv.w, "e", tc.w);
}

console.log(`OK - ${n} check passati`);
