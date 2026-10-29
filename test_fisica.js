// Test della fisica dei combattenti (static/fisica.js). Uso: node test_fisica.js
// Misura anche, e stampa, quanto si spostano e in quanto tempo tornano in piedi (per tarare i muscoli).
const fs = require("fs");
const path = require("path");
const Fisica = require("./static/fisica.js");

const man = JSON.parse(fs.readFileSync(path.join(__dirname, "static/sprites/maschio/parti.json"), "utf8"));
const ossa = Object.values(man.parti).map(p => [p.da, p.a]);
const nuovo = () => new Fisica.Scheletro(man.giunti, ossa);
const log = (...a) => { if (process.env.VERBOSE) console.log(...a); };
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error("FALLITO:", msg); process.exitCode = 1; throw new Error(msg); } };

const sposta = (s, k) => Math.hypot(s.P[k].x - s.R[k].x, s.P[k].y - s.R[k].y);
// ginocchia e gomiti sono cerniere: basta che l'arto torni steso entro un paio di px, quindi non contano nel rientro
const maxSposta = (s) => Math.max(...Object.keys(s.P).filter(k => !/^(ginocchio|gomito)/.test(k)).map(k => sposta(s, k)));
const finiti = (s) => Object.values(s.P).every(p => Number.isFinite(p.x) && Number.isFinite(p.y));

/* esegue `passi` passi e ritorna {picco: spostamento massimo di `k`, rientro: primo passo dopo il picco in cui
   tutto il corpo e' tornato entro `tol` px dalla posa a riposo (-1 se mai)} */
function misura(s, k, passi, tol = 1.5) {
  let picco = 0, rientro = -1;
  for (let i = 0; i < passi; i++) {
    s.passo();
    picco = Math.max(picco, sposta(s, k));
    if (rientro < 0 && picco > tol && maxSposta(s) < tol) rientro = i;
  }
  return {picco, rientro};
}

// 1. a riposo resta in piedi (solo il respiro)
{
  const s = nuovo();
  s.assesta(300);
  ok(finiti(s), "riposo: valori finiti");
  ok(maxSposta(s) < 1.2, "a riposo non si muove: " + maxSposta(s));
  log("riposo", maxSposta(s).toFixed(2));
}

// 2. ogni locazione colpita: si sposta di piu' con piu' danno, non cade mai, torna in piedi
const CHIAVE = {testa: "cima", busto: "collo_alto", braccio_dx: "polso_dx", braccio_sx: "polso_sx",
                gamba_dx: "caviglia_dx", gamba_sx: "caviglia_sx"};
for (const [loc, k] of Object.entries(CHIAVE)) {
  let prec = 0;
  for (const danno of [8, 25, 60]) {
    const s = nuovo();
    s.assesta(30);
    s.colpisci(loc, danno);
    const {picco, rientro} = misura(s, k, 240, 1.5);
    log(loc.padEnd(11), "danno", String(danno).padStart(2), "picco", picco.toFixed(1).padStart(5), "rientro", rientro);
    ok(finiti(s), loc + ": valori finiti");
    ok(picco > prec, `${loc}: piu' danno, piu' spostamento (${danno}: ${picco} <= ${prec})`);
    prec = picco;
    ok(s.P.cima.y < 40 && s.P.vita.y < 70, `${loc} ${danno}: resta in piedi (cima ${s.P.cima.y.toFixed(0)}, vita ${s.P.vita.y.toFixed(0)})`);
    ok(picco <= 1.5 || (rientro >= 0 && rientro < 200), `${loc} ${danno}: torna in piedi entro ~3 s (rientro ${rientro})`);
  }
}
// ...e il colpo a una locazione sposta soprattutto quella
{
  const t = nuovo(); t.assesta(30); t.colpisci("testa", 40); t.assesta(8);
  ok(sposta(t, "cima") > 2 * sposta(t, "caviglia_dx"), "un colpo alla testa muove la testa, non i piedi");
  const g = nuovo(); g.assesta(30); g.colpisci("gamba_dx", 40); g.assesta(8);
  ok(Math.max(sposta(g, "ginocchio_dx"), sposta(g, "caviglia_dx")) > 2 * sposta(g, "cima"), "un colpo alla gamba muove la gamba, non la testa");
}

// 3. una gamba storpiata: resta in piedi sull'altra, il bacino cala un poco, la gamba penzola
{
  const s = nuovo();
  s.storpia("gamba_sx", true);
  s.assesta(300);
  log("una gamba: anca", s.P.anca.y.toFixed(1), "cima", s.P.cima.y.toFixed(1), "caviglia buona", s.P.caviglia_dx.y.toFixed(1));
  ok(finiti(s), "una gamba: valori finiti");
  ok(s.P.cima.y < 30 && s.P.anca.y - s.R.anca.y < 12, "una gamba storpia: sta ancora in piedi");
  ok(s.P.caviglia_dx.y > 100, "la gamba buona regge a terra");
  // la gamba storpia e' ragdoll: se la spingo, non torna da sola alla posa
  s.spingi("caviglia_sx", -4, 0); s.assesta(60);
  ok(sposta(s, "caviglia_sx") > 1.5 || s.P.caviglia_sx.y >= 100, "la gamba storpia non ha piu' muscoli");
}

// 4. due gambe storpiate: si siede a terra e si puntella sulle braccia
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
  // colpito, non crolla del tutto
  s.colpisci("busto", 40); s.assesta(300);
  ok(finiti(s) && P.cima.y < P.anca.y - 10, "seduto e colpito: torna su");
}

// 5. gambe e braccia storpie: non ha niente per tenersi su, ma il busto non e' morto
{
  const s = nuovo();
  for (const l of ["gamba_dx", "gamba_sx", "braccio_dx", "braccio_sx"]) s.storpia(l, true);
  s.assesta(400);
  ok(finiti(s), "senza arti: valori finiti");
  ok(s.P.anca.y > 95, "senza arti e' a terra");
}

// 6. la morte: tutti i muscoli spenti, finisce disteso a poca distanza (qualunque sia il danno)
for (const danno of [5, 40, 120]) {
  const s = nuovo();
  s.assesta(30);
  s.muori(danno, "busto");
  s.assesta(300);
  const P = s.P;
  log("morto", danno, ": cima", P.cima.y.toFixed(1), "vita", P.vita.y.toFixed(1), "x vita", P.vita.x.toFixed(1), "quieto", s.quieto());
  ok(finiti(s), "morto: valori finiti");
  ok(P.cima.y > 85 && P.vita.y > 90 && P.anca.y > 90, "da morto e' a terra");
  const xs = Object.values(P).map(p => p.x);
  ok(Math.min(...xs) > s.R.vita.x - 90 && Math.max(...xs) < s.R.vita.x + 60, "da morto cade vicino a dove stava");
  ok(P.vita.x < s.R.vita.x, "cade all'indietro");
  ok(s.quieto(0.3), "da morto si ferma");
}

// 7. attacco e schivata: movimenti piccoli, tornano a posto
for (const ev of ["affonda", "schiva", "para"]) {
  const s = nuovo();
  s.assesta(30);
  s[ev]();
  const {picco, rientro} = misura(s, "cima", 200, 1.5);
  log(ev, "picco", picco.toFixed(1), "rientro", rientro);
  ok(finiti(s) && s.P.cima.y < 40, ev + ": resta in piedi");
  ok(rientro >= 0 || picco < 1.5, ev + ": torna a posto");
}

// 8. colpi ripetuti (raffica) non lo buttano giu'
{
  const s = nuovo();
  s.assesta(30);
  for (let i = 0; i < 30; i++) { s.colpisci(["testa", "busto", "gamba_dx", "braccio_sx"][i % 4], 30); s.assesta(20); }
  s.assesta(300);
  ok(finiti(s) && s.P.cima.y < 40 && maxSposta(s) < 2, "dopo una raffica torna in piedi");
}

console.log(`OK � ${n} check passati`.replace("�", "-"));
