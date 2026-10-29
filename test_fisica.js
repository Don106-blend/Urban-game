// Test della fisica dei combattenti (static/fisica.js). Uso: node test_fisica.js  (VERBOSE=1 stampa le misure)
// Oltre a controllare i comportamenti, stampa quanto si spostano e in quanto tempo tornano a casa (per tarare i muscoli).
const fs = require("fs");
const path = require("path");
const Fisica = require("./static/fisica.js");

const man = JSON.parse(fs.readFileSync(path.join(__dirname, "static/sprites/maschio/parti.json"), "utf8"));
const ossa = Object.values(man.parti).map(p => [p.da, p.a]);
const log = (...a) => { if (process.env.VERBOSE) console.log(...a); };
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error("FALLITO:", msg); process.exitCode = 1; throw new Error(msg); } };

/* un combattente in piedi e assestato; s.B = la sua posa di riposo vera (con la guardia un po' piegata) */
function nuovo() {
  const s = new Fisica.Scheletro(man.giunti, ossa);
  s.assesta(150);
  s.B = Object.fromEntries(Object.entries(s.P).map(([k, p]) => [k, {x: p.x, y: p.y}]));
  return s;
}
const sposta = (s, k) => Math.hypot(s.P[k].x - s.B[k].x, s.P[k].y - s.B[k].y);
const NUCLEO = ["cima", "collo_alto", "vita", "anca", "caviglia_dx", "caviglia_sx"];
const aCasa = (s, tol = 1.5) => NUCLEO.every(k => sposta(s, k) < tol) && s.piede.dx.stato === "p" && s.piede.sx.stato === "p";
const finiti = (s) => Object.values(s.P).every(p => Number.isFinite(p.x) && Number.isFinite(p.y));
const inPiedi = (s) => s.P.cima.y < s.P.anca.y - 15 && s.P.anca.y < 80;
const indietro = (s) => s.B.anca.x - s.P.anca.x;           // di quanto e' stato spinto via (px, positivo = indietro)

/* fa girare `passi` passi; ritorna il picco di spostamento di `k`, il massimo rinculo del bacino e il passo di rientro */
function misura(s, k, passi, tol = 1.5) {
  let picco = 0, rinculo = 0, rientro = -1;
  for (let i = 0; i < passi; i++) {
    s.passo();
    picco = Math.max(picco, sposta(s, k));
    rinculo = Math.max(rinculo, indietro(s));
    ok(finiti(s), "valori finiti");
    if (rientro < 0 && picco > tol && aCasa(s, tol)) rientro = i;
  }
  return {picco, rinculo, rientro};
}

// 1. a riposo: niente su e giu' delle gambe ne' del bacino, nessun passo; solo le braccia dondolano un filo
{
  const s = nuovo();
  const mn = {}, mx = {};
  let cambi = 0, prec = null;
  for (let i = 0; i < 900; i++) {
    s.passo();
    for (const [k, p] of Object.entries(s.P)) {
      mn[k] = Math.min(mn[k] ?? 1e9, p.y); mx[k] = Math.max(mx[k] ?? -1e9, p.y);
    }
    const posa = ["anca_dx", "ginocchio_dx", "caviglia_dx", "anca_sx", "ginocchio_sx", "caviglia_sx", "vita"]
      .map(k => Math.round(s.P[k].x) + "," + Math.round(s.P[k].y)).join("|");
    if (prec !== null && posa !== prec) cambi++;
    prec = posa;
  }
  const amp = (k) => mx[k] - mn[k];
  log("riposo: ampiezza y gamba/bacino", Math.max(...["anca", "vita", "anca_dx", "ginocchio_dx", "caviglia_dx", "ginocchio_sx", "caviglia_sx"].map(amp)).toFixed(3),
      "| braccia", Math.max(amp("gomito_sx"), amp("polso_sx")).toFixed(2), "| cambi posa gambe", cambi);
  for (const k of ["anca", "vita", "anca_dx", "anca_sx", "ginocchio_dx", "ginocchio_sx", "caviglia_dx", "caviglia_sx"]) {
    ok(amp(k) < 0.05, `a riposo ${k} non va su e giu' (${amp(k).toFixed(3)})`);
  }
  ok(cambi === 0, "a riposo le gambe non cambiano posa (" + cambi + ")");
  ok(s.nPassi === 0, "a riposo non cammina");
  ok(amp("polso_sx") < 1.5, "le braccia dondolano solo un filo");
}

// 2. ogni locazione colpita: si sposta di piu' con piu' danno, resta in piedi, torna a casa
const CHIAVE = {testa: "cima", busto: "collo_alto", braccio_dx: "polso_dx", braccio_sx: "polso_sx",
                gamba_dx: "caviglia_dx", gamba_sx: "caviglia_sx"};
for (const [loc, k] of Object.entries(CHIAVE)) {
  let prec = 0;
  for (const danno of [8, 25, 60]) {
    const s = nuovo();
    s.colpisci(loc, danno);
    let sempreInPiedi = true;
    const m = {picco: 0, rinculo: 0, rientro: -1};
    for (let i = 0; i < 500; i++) {
      s.passo();
      m.picco = Math.max(m.picco, sposta(s, k)); m.rinculo = Math.max(m.rinculo, indietro(s));
      if (!inPiedi(s)) sempreInPiedi = false;
      if (m.rientro < 0 && m.picco > 1.5 && i > 5 && aCasa(s)) m.rientro = i;
    }
    log(loc.padEnd(11), "danno", String(danno).padStart(2), "picco", m.picco.toFixed(1).padStart(5), "rinculo", m.rinculo.toFixed(1).padStart(5),
        "passi", s.nPassi, "a casa al passo", m.rientro);
    ok(finiti(s), loc + ": valori finiti");
    ok(m.picco > prec, `${loc}: piu' danno, piu' spostamento (${danno}: ${m.picco} <= ${prec})`);
    prec = m.picco;
    ok(sempreInPiedi, `${loc} ${danno}: non cade mai`);
    ok(m.rientro >= 0 && m.rientro < 400, `${loc} ${danno}: torna a casa (passo ${m.rientro})`);
    ok(aCasa(s, 1.2) && Math.abs(s.P.anca.x - s.B.anca.x) < 1.2, `${loc} ${danno}: a fine corsa e' dov'era`);
  }
}
// ...e il colpo a una locazione sposta soprattutto quella
{
  const t = nuovo(); t.colpisci("testa", 40); t.assesta(8);
  ok(sposta(t, "cima") > 1.4 * sposta(t, "caviglia_dx"), "un colpo alla testa muove la testa piu' dei piedi");
  const g = nuovo(); g.colpisci("gamba_dx", 40); g.assesta(8);
  ok(Math.max(sposta(g, "ginocchio_dx"), sposta(g, "caviglia_dx")) > 1.4 * sposta(g, "cima"), "un colpo alla gamba muove la gamba piu' della testa");
}

// 3. il knockback sposta DAVVERO il combattente, in proporzione al danno; poi torna a piedi dov'era
{
  let prec = 0;
  for (const danno of [10, 30, 60, 100]) {
    const s = nuovo();
    s.colpisci("busto", danno);
    const {rinculo, rientro} = misura(s, "anca", 600);
    log("rinculo busto", danno, ":", rinculo.toFixed(1), "px, passi", s.nPassi, ", a casa al passo", rientro);
    ok(rinculo > prec + 1, `piu' danno, piu' rinculo (${danno}: ${rinculo} vs ${prec})`);
    prec = rinculo;
    if (danno >= 30) ok(s.nPassi >= 2, `con ${danno} danni fa dei passi`);
    ok(rientro >= 0, `${danno}: torna al punto di partenza (${rientro})`);
  }
  ok(prec > 20, "con 100 danni arretra di piu' di 20 px");
}

// 4. i muri: il corpo non esce dai limiti, neppure a forza di colpi, di salti all'indietro, di affondi o da morto
{
  const s = nuovo();
  s.muri(s.B.anca.x - 25, s.B.anca.x + 40);
  const [lo, hi] = s.muro;
  let minX = 1e9, maxX = -1e9;
  const guarda = () => { for (const p of Object.values(s.P)) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); } };
  for (let i = 0; i < 25; i++) { s.colpisci("busto", 60); for (let j = 0; j < 20; j++) { s.passo(); guarda(); } }
  for (let i = 0; i < 12; i++) { s.schiva(); for (let j = 0; j < 25; j++) { s.passo(); guarda(); } }
  for (let i = 0; i < 25; i++) { s.affonda(2); for (let j = 0; j < 12; j++) { s.passo(); guarda(); } }
  log("muri", lo, hi, "-> x tra", minX.toFixed(1), "e", maxX.toFixed(1));
  ok(minX >= lo + 1.99 && maxX <= hi - 1.99, `il corpo resta tra i muri (${minX}, ${maxX})`);
  ok(finiti(s) && inPiedi(s), "contro il muro resta in piedi");
  s.muori(60);
  for (let j = 0; j < 400; j++) { s.passo(); guarda(); }
  ok(minX >= lo + 1.99 && maxX <= hi - 1.99, `anche da morto resta tra i muri (${minX}, ${maxX})`);
  ok(s.P.cima.y > 65 && s.P.anca.y > 90, "da morto, contro il muro, e' a terra (accartocciato)");
}

// 5. una gamba storpiata: resta in piedi sull'altra, non cammina piu', la gamba molle e' un ragdoll
{
  const s = nuovo();
  s.storpia("gamba_sx", true);
  s.assesta(300);
  log("una gamba: anca", s.P.anca.y.toFixed(1), "cima", s.P.cima.y.toFixed(1), "caviglia buona", s.P.caviglia_dx.y.toFixed(1));
  ok(finiti(s) && inPiedi(s), "una gamba storpia: sta ancora in piedi");
  ok(s.P.caviglia_dx.y > 100, "la gamba buona regge a terra");
  s.spingi("caviglia_sx", -4, 0); s.assesta(60);
  ok(sposta(s, "caviglia_sx") > 1.5 || s.P.caviglia_sx.y >= 100, "la gamba storpia non ha piu' muscoli");
  const p0 = s.nPassi;
  s.colpisci("busto", 60); s.assesta(300);
  ok(s.nPassi === p0 && inPiedi(s), "su una gamba sola non fa passi ma non cade");
  s.storpia("gamba_sx", false); s.assesta(100);
  s.colpisci("busto", 60); s.assesta(400);
  ok(s.nPassi > p0 && inPiedi(s), "guarita, cammina di nuovo");
}

// 6. due gambe storpiate: si siede a terra e si puntella sulle braccia
{
  const s = nuovo();
  s.storpia("gamba_dx", true); s.storpia("gamba_sx", true);
  s.assesta(400);
  const P = s.P;
  log("due gambe: anca", P.anca.y.toFixed(1), "vita", P.vita.y.toFixed(1), "cima", P.cima.y.toFixed(1),
      "polso", P.polso_dx.y.toFixed(1), "x", P.polso_dx.x.toFixed(1), "quieto", s.quieto());
  ok(finiti(s), "due gambe: valori finiti");
  ok(P.anca_dx.y > 95 && P.anca_sx.y > 95, "senza gambe il bacino e' a terra");
  ok(P.cima.y < P.vita.y - 10 && P.vita.y < P.anca.y - 8, "il busto resta eretto sulle braccia, non e' sdraiato");
  ok(P.polso_dx.y > 100 && P.polso_sx.y > 100, "le braccia si puntellano a terra");
  ok(s.quieto(0.3), "e' fermo");
  s.colpisci("busto", 40); s.assesta(300);
  ok(finiti(s) && P.cima.y < P.anca.y - 10, "seduto e colpito: torna su");
}

// 7. gambe e braccia storpie: non ha niente per tenersi su, ma il busto non e' morto
{
  const s = nuovo();
  for (const l of ["gamba_dx", "gamba_sx", "braccio_dx", "braccio_sx"]) s.storpia(l, true);
  s.assesta(400);
  ok(finiti(s), "senza arti: valori finiti");
  ok(s.P.anca.y > 95, "senza arti e' a terra");
}

// 8. la morte: finisce disteso a poca distanza, ferma e addormentata (nessun tremolio), qualunque sia il danno
for (const danno of [5, 40, 120]) {
  const s = nuovo();
  s.muori(danno);
  s.assesta(400);
  const P = s.P;
  log("morto", danno, ": cima", P.cima.y.toFixed(1), "vita", P.vita.y.toFixed(1), "x vita", P.vita.x.toFixed(1), "dorme", s.dorme);
  ok(finiti(s), "morto: valori finiti");
  ok(P.cima.y > 85 && P.vita.y > 90 && P.anca.y > 90, "da morto e' a terra");
  const xs = Object.values(P).map(p => p.x);
  ok(Math.min(...xs) > s.B.vita.x - 110 && Math.max(...xs) < s.B.vita.x + 30, "da morto cade vicino a dove stava, all'indietro");
  ok(P.vita.x < s.B.vita.x, "cade all'indietro");
  ok(s.dorme, "da morto, fermo, si addormenta");
  const prima = JSON.stringify(P);
  s.assesta(600);
  ok(JSON.stringify(P) === prima, "un cadavere non si muove piu' (neppure di un decimo di pixel)");
  s.colpisci("busto", 30); s.assesta(300);          // un colpo al cadavere lo muove e poi si riaddormenta
  ok(finiti(s) && s.dorme, "un cadavere colpito si riassesta e si riaddormenta");
}

// 9. attacco e schivata: chi attacca fa un passo avanti, chi schiva salta indietro, poi tornano a casa a piedi
{
  const a = nuovo();
  a.affonda(1.5);
  let avanti = 0;
  for (let i = 0; i < 400; i++) { a.passo(); avanti = Math.max(avanti, a.P.anca.x - a.B.anca.x); }
  log("affondo: avanti", avanti.toFixed(1), "px, passi", a.nPassi, "a casa", aCasa(a));
  ok(avanti > 2 && aCasa(a, 1.2), "chi attacca si sporge e torna a casa");
  const d = nuovo();
  d.schiva();
  let su = 0, dietro = 0;
  for (let i = 0; i < 400; i++) { d.passo(); su = Math.max(su, d.B.caviglia_dx.y - d.P.caviglia_dx.y); dietro = Math.max(dietro, indietro(d)); }
  log("schivata: salto", su.toFixed(1), "px, indietro", dietro.toFixed(1), "px, passi", d.nPassi, "a casa", aCasa(d));
  ok(su > 3 && dietro > 5 && aCasa(d, 1.2), "chi schiva salta all'indietro e poi torna");
  const p = nuovo();
  p.para(); p.assesta(300);
  ok(inPiedi(p) && aCasa(p, 1.5), "la parata non lo sposta di molto");
  const t = nuovo();
  t.spara();
  let braccio = 0;
  for (let i = 0; i < 300; i++) { t.passo(); braccio = Math.max(braccio, t.P.polso_dx.x - t.B.polso_dx.x); }
  ok(braccio > 3 && inPiedi(t) && aCasa(t, 1.5), "chi spara alza il braccio e poi torna a posto");
}

// 10. una raffica di colpi (anche a un'ora strana) non lo butta mai giu', e poi torna dov'era (con i muri, come in arena)
{
  const s = nuovo();
  s.muri(s.B.anca.x - 70, s.B.anca.x + 45);
  let seme = 7;
  const rnd = () => (seme = (seme * 16807) % 2147483647) / 2147483647;
  const locs = Object.keys(CHIAVE);
  let sempre = true;
  for (let i = 0; i < 60; i++) {
    const r = rnd();
    if (r < 0.6) s.colpisci(locs[Math.floor(rnd() * locs.length)], 5 + rnd() * 55);
    else if (r < 0.75) s.schiva();
    else if (r < 0.9) s.affonda(1 + rnd());
    else s.para();
    for (let j = 0, m = 3 + Math.floor(rnd() * 20); j < m; j++) { s.passo(); if (!inPiedi(s) || !finiti(s)) sempre = false; }
  }
  ok(sempre, "durante una raffica non cade mai");
  s.assesta(600);
  ok(aCasa(s, 1.2) && Math.abs(s.P.anca.x - s.B.anca.x) < 1.2, "dopo la raffica torna a casa");
}

console.log(`OK - ${n} check passati`);
