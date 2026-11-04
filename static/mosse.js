/* Urban — le animazioni dei singoli attacchi. Ogni attacco che ha qui la sua coreografia la recita al posto di quella di base (arena.js: pugno
   o proiettile dritto): cosa fa il corpo di chi attacca (i gesti: static/pupazzo.js), cosa vola, cosa brucia, cosa si conficca.
   Il server ha gia' deciso com'e' andata (a segno, parato, schivato): l'animazione lo mette in scena e dice QUANDO il colpo arriva chiamando
   `h.contatto()`: solo da quel momento il gioco segna danni, numeri e knockback (arena.js: rivela/vista). Ogni coreografia deve quindi
   chiamare `contatto` una volta, e `fine` un po' dopo.

   `h` e' quello che l'arena mette in mano: i due combattenti (`att`, `dif`), com'e' andata (`colpito`, `parato`), `mano(lato)` e `bersaglio()`
   (punti nel mondo, in px sprite), `attacca(extra)` e `gesto(tipo, opz)` per muovere il corpo di chi attacca, `reazione()` per far scansare o
   parare chi difende, `futuro(secondi, fn)`, `particella(o)`. Gli effetti propri (proiettili, emettitori, schegge conficcate) vivono qui, in `fx`.

   Sono animazioni a pixel come il resto: pochi colori, luce additiva per il fuoco, niente antialiasing voluto. Le prime sono quelle di Pirocinesi
   (scintilla, palla di fuoco, lanciafiamme, eruzione), poi le Scheggie e la Scheggia di Ghiaccio. */
const Mosse = (() => {
  const lim = (x, a, b) => Math.min(b, Math.max(a, x));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const FIAMMA = ["#fff7c8", "#ffd24a", "#ff8a1f", "#e8400c", "#6a1a0c"];      // dal bianco caldo al rosso scuro
  const BRACE = ["#ffd24a", "#ff8a1f", "#e8400c", "#6a1a0c"];
  const CALDA = ["#ffd86a", "#ff9a2a", "#ff6a14", "#d93a0a", "#6a1a0c"];          // il getto e la lava: partono gia' gialle (il bianco, sommato, abbaglia)
  const GELO = ["#ffffff", "#bff4ff", "#7fdcff", "#4aa8e8"];
  const fx = [];                         // gli effetti in corso: {passo(dt) -> falso quando finisce, disegna(ctx)}
  const PEZZO = {testa: "testa", busto: "busto_sup", braccio_dx: "avambraccio_dx", braccio_sx: "avambraccio_sx", gamba_dx: "coscia_dx", gamba_sx: "coscia_sx"};

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* primitive */
  function fiamma(h, x, y, vx, vy, o = {}) {              // una lingua di fuoco: luminosa, sale, cambia colore mentre si spegne
    h.particella({x, y, vx, vy, g: o.g ?? -70, attrito: o.attrito ?? 1.2, s: o.s ?? (Math.random() < 0.3 ? 2 : 1), vita: o.vita ?? rnd(0.3, 0.6), fade: 0.22,
                  cols: o.cols || FIAMMA, luce: true, davanti: true});
  }
  function emettitore(durata, fn, disegna) {              // chiama fn(dt, t) a ogni passo per `durata` secondi
    const e = {t: 0, passo(dt) { this.t += dt; fn(dt, this.t); return this.t < durata; }, disegna: disegna && ((ctx) => disegna(ctx, e.t))};
    fx.push(e);
    return e;
  }
  function disco(ctx, x, y, r, col, a, luce) {
    ctx.globalAlpha = a; ctx.globalCompositeOperation = luce ? "lighter" : "source-over"; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
  function discoPixel(ctx, x, y, r, cols) {               // un disco a pixel, a cerchi concentrici (dal bordo al nucleo)
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    const X = Math.round(x), Y = Math.round(y);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.hypot(i, j);
      if (d > r + 0.35) continue;
      ctx.fillStyle = cols[Math.min(cols.length - 1, Math.floor((1 - d / (r + 0.5)) * cols.length))];
      ctx.fillRect(X + i, Y + j, 1, 1);
    }
  }
  function lampo(x, y, r, durata, col) {                 // un bagliore additivo che si allarga e svanisce
    fx.push({t: 0, passo(dt) { this.t += dt; return this.t < durata; },
             disegna(ctx) { const k = this.t / durata; disco(ctx, x, y, r * (0.35 + 0.65 * k), col, 0.32 * (1 - k), true); disco(ctx, x, y, r * 0.4 * (1 - k * 0.5), "#ffd890", 0.26 * (1 - k), true); }});
  }
  function scoppioFuoco(h, x, y, n, forza = 1) {         // una vampata: fiamme in tutte le direzioni, e il bagliore
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.2832), v = rnd(30, 120) * forza;
      fiamma(h, x, y, Math.cos(a) * v, Math.sin(a) * v - 30 * forza, {g: -30, attrito: 2.4, vita: rnd(0.25, 0.55), s: Math.random() < 0.35 ? 2 : 1});
    }
    lampo(x, y, 11 * forza + 4, 0.28, "#ff8a1f");
  }
  /* fiamme sul corpo di chi e' stato colpito (o sta per esserlo): lingue che salgono da pezzi a caso */
  function bruciaCorpo(h, L, durata) {
    const pezzi = ["busto_sup", "busto_inf", "testa", "avambraccio_dx", "avambraccio_sx", "coscia_dx", "coscia_sx", "stinco_dx", "stinco_sx"];
    emettitore(durata, (dt, t) => {
      const f = lim((durata - t) / 0.4, 0, 1);
      for (let i = 0; i < 2; i++) if (Math.random() < 0.7 * f) {
        const b = h.pose(L, pezzi[Math.floor(Math.random() * pezzi.length)]), w = h.aMondo(L, [b[0] + rnd(-4, 4), b[1] + rnd(-5, 5)]);
        fiamma(h, w[0], w[1], rnd(-10, 10), -rnd(18, 46), {g: -50, vita: rnd(0.3, 0.6)});
      }
    });
  }
  /* la mano di chi lancia fuoco prende fuoco (le mosse di Pirocinesi: tutte): fiamme e un bagliore finche' dura la mossa */
  function fiammeMano(h, durata, forza = 1, lati = ["dx"]) {
    emettitore(durata, (dt, t) => {
      const f = lim((durata - t) / 0.3, 0, 1) * lim(t / 0.1, 0, 1) * forza;
      for (const l of lati) {
        const m = h.mano(l);
        if (Math.random() < 0.9 * f) fiamma(h, m[0] + rnd(-1.5, 1.5), m[1] + rnd(-1, 1), rnd(-9, 9), -rnd(14, 40), {g: -60});
        if (Math.random() < 0.25 * f) fiamma(h, m[0], m[1], rnd(-5, 5), -rnd(30, 60), {s: 2, vita: rnd(0.2, 0.35)});
      }
    }, (ctx, t) => {
      const f = lim((durata - t) / 0.3, 0, 1) * lim(t / 0.1, 0, 1) * forza;
      for (const l of lati) { const m = h.mano(l); disco(ctx, m[0], m[1] - 1, 5 + Math.sin(t * 40) * 0.8, "#ff8a1f", 0.26 * f, true); disco(ctx, m[0], m[1] - 1, 2.6, "#ffe27a", 0.35 * f, true); }
    });
  }

  /* un proiettile che parte da (x0, y0) e arriva in (x1, y1) in `tv` secondi, anche con una parabola (`g` px/s^2: la palombella) */
  function proiettile({x0, y0, x1, y1, tv, g = 0, tipo, scia, fine}) {
    const vx = (x1 - x0) / tv, vy = (y1 - y0 - 0.5 * g * tv * tv) / tv;
    const q = {t: 0, x: x0, y: y0, ang: Math.atan2(vy, vx), tipo};
    fx.push({
      passo(dt) {
        q.t += dt;
        const tt = Math.min(q.t, tv);
        q.x = x0 + vx * tt; q.y = y0 + vy * tt + 0.5 * g * tt * tt;
        q.ang = Math.atan2(vy + g * tt, vx);
        if (scia) scia(q, dt);
        if (q.t >= tv) { if (fine) fine(q); return false; }
        return true;
      },
      disegna(ctx) { disegnaProiettile(ctx, q); },
    });
    return q;
  }

  function disegnaScheggia(ctx, x, y, ang, lung, tipo, a = 1) {   // una scheggia: una punta lunga e sottile (ghiaccio azzurro con la luce, scheggia chiara con l'ombra)
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.globalAlpha = a; ctx.globalCompositeOperation = "source-over";
    const g = tipo === "ghiaccio";
    ctx.fillStyle = g ? "#9fe4ff" : "#d6cba8";
    ctx.beginPath(); ctx.moveTo(lung, 0); ctx.lineTo(-lung * 0.45, -2); ctx.lineTo(-lung * 0.75, 0); ctx.lineTo(-lung * 0.45, 2); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 0.6; ctx.strokeStyle = g ? "#3d86b8" : "#6b5a3a"; ctx.stroke();
    ctx.strokeStyle = g ? "#ffffff" : "#fff6dc"; ctx.beginPath(); ctx.moveTo(-lung * 0.35, -0.3); ctx.lineTo(lung * 0.8, 0); ctx.stroke();
    ctx.restore();
    if (g && a > 0.5) disco(ctx, x + Math.cos(ang) * lung, y + Math.sin(ang) * lung, 2.4, "#aee9ff", 0.3 * a, true);
  }
  function disegnaProiettile(ctx, q) {
    if (q.tipo === "scintilla") {
      disco(ctx, q.x, q.y, 4.2, "#ffb040", 0.3, true); disco(ctx, q.x, q.y, 2.4, "#ffe27a", 0.55, true);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#fff6c0"; ctx.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2);
    } else if (q.tipo === "palla") {
      disco(ctx, q.x, q.y, 10, "#ff6a14", 0.22, true); disco(ctx, q.x, q.y, 6.5, "#ffb040", 0.3, true);
      discoPixel(ctx, q.x, q.y, 5, ["#a02808", "#d93a0a", "#ff7a16", "#ffc13a", "#fff4b8"]);
    } else if (q.tipo === "scheggia" || q.tipo === "ghiaccio") {
      disegnaScheggia(ctx, q.x, q.y, q.ang, q.tipo === "ghiaccio" ? 8 : 7, q.tipo);
    }
  }

  /* una scheggia conficcata: resta dov'e' entrata, attaccata al pezzo del corpo colpito (segue il corpo mentre barcolla), e sparisce da sola */
  function conficca(h, L, loc, mondo, dirMondo, tipo, vita) {
    const nome = PEZZO[loc] || "busto_sup", b = h.pose(L, nome), p = h.daMondo(L, mondo);
    const c = Math.cos(b[2]), s = Math.sin(b[2]), d0 = p[0] - b[0], d1 = p[1] - b[1];
    const ox = c * d0 + s * d1, oy = -s * d0 + c * d1;          // il punto d'ingresso nel sistema del pezzo
    const rel = Math.atan2(dirMondo[1], dirMondo[0] * L.f) - b[2];
    fx.push({t: 0, passo(dt) { this.t += dt; return this.t < vita; },
             disegna(ctx) {
               const q = h.pose(L, nome), cc = Math.cos(q[2]), ss = Math.sin(q[2]);
               const w = h.aMondo(L, [q[0] + cc * ox - ss * oy, q[1] + ss * ox + cc * oy]), al = rel + q[2];
               const sp = lim((vita - this.t) / 0.7, 0, 1);       // gli ultimi 0,7 s: si accorcia e svanisce
               disegnaScheggia(ctx, w[0], w[1], Math.atan2(Math.sin(al), L.f * Math.cos(al)), (tipo === "ghiaccio" ? 8 : 7) * (0.35 + 0.65 * sp), tipo, sp);
             }});
  }

  /* una scheggia che cade a terra (parata) o resta nell'aria e svanisce (mancata) */
  function scheggiaLibera(x, y, vx, vy, tipo, vita) {
    const q = {t: 0, x, y, vx, vy, ang: Math.atan2(vy, vx), w: rnd(-9, 9)};
    fx.push({passo(dt) { q.t += dt; q.vy += 520 * dt; q.x += q.vx * dt; q.y = Math.min(110, q.y + q.vy * dt); q.ang += q.w * dt; if (q.y >= 110) { q.vx *= 0.9; q.w = 0; } return q.t < vita; },
             disegna(ctx) { disegnaScheggia(ctx, q.x, q.y, q.ang, tipo === "ghiaccio" ? 8 : 7, tipo, lim((vita - q.t) / 0.5, 0, 1)); }});
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* LE COREOGRAFIE */

  /* scintilla: una piccola scintilla parte dal braccio destro e arriva sul bersaglio con una palombella (un lancio dal basso, ad arco) */
  function scintilla(ev, h) {
    fiammeMano(h, 0.8);
    h.attacca({distanza: true, stile: "palombella", carica: 0.26, colpo: 0.13, tenuta: 0.05, recupero: 0.3, anticipo: 0, alAnticipo: null, alFine: () => {},
      alColpoInizio() {
        const da = h.mano("dx"), a = h.bersaglio(), d = Math.hypot(a[0] - da[0], a[1] - da[1]), tv = lim(d / 190, 0.55, 0.85);
        for (let i = 0; i < 6; i++) fiamma(h, da[0], da[1], rnd(0, 70) * h.att.f, -rnd(20, 90), {vita: rnd(0.15, 0.3)});
        h.futuro(Math.max(0.02, tv - 0.32), () => h.reazione());
        proiettile({x0: da[0], y0: da[1], x1: a[0], y1: a[1], tv, g: 820, tipo: "scintilla",
          scia: (q) => { for (let i = 0; i < 2; i++) h.particella({x: q.x + rnd(-1, 1), y: q.y + rnd(-1, 1), vx: rnd(-14, 14), vy: rnd(-10, 22), g: 60, s: 1, vita: rnd(0.18, 0.4), fade: 0.15, cols: BRACE, luce: true, davanti: true}); },
          fine: () => { scoppioFuoco(h, a[0], a[1], 12, 0.8); h.contatto(null); h.futuro(0.4, h.fine); }});
      }});
  }

  /* palla di fuoco: una sfera di fuoco lascia la mano e vola dritta sull'avversario, con la coda di fiamme; all'arrivo esplode */
  function palla(ev, h) {
    fiammeMano(h, 0.65);
    h.attacca({distanza: true, carica: 0.26, colpo: 0.12, tenuta: 0.06, recupero: 0.34, alFine: () => {},
      alColpoInizio() {
        const da = h.mano("dx"), a = h.bersaglio(), d = Math.hypot(a[0] - da[0], a[1] - da[1]), tv = Math.max(0.17, d / 480);
        h.att.pup.spingiTutto(-45, 0);
        scoppioFuoco(h, da[0], da[1], 8, 0.5);
        proiettile({x0: da[0], y0: da[1], x1: a[0], y1: a[1], tv, tipo: "palla",
          scia: (q) => { for (let i = 0; i < 3; i++) fiamma(h, q.x - Math.cos(q.ang) * 3 + rnd(-2, 2), q.y - Math.sin(q.ang) * 3 + rnd(-2, 2), -Math.cos(q.ang) * rnd(10, 50) + rnd(-12, 12), rnd(-22, 4) - 12, {vita: rnd(0.25, 0.5), s: Math.random() < 0.4 ? 2 : 1}); },
          fine: () => { scoppioFuoco(h, a[0], a[1], 26, 1.25); h.contatto(null); if (h.colpito) bruciaCorpo(h, h.dif, 0.9); h.futuro(0.45, h.fine); }});
      }});
  }

  /* lanciafiamme: il braccio destro si tende verso l'avversario e un getto continuo di particelle di fuoco parte dalla mano, come un vero lanciafiamme */
  function lanciafiamme(ev, h) {
    fiammeMano(h, 1.7, 1.3);
    h.attacca({distanza: true, carica: 0.28, colpo: 0.14, tenuta: 1.05, recupero: 0.4, alFine: () => {},
      alColpoInizio() {
        h.att.pup.spingiTutto(-35, 0);
        const d0 = (() => { const da = h.mano("dx"), a = h.bersaglio(); return Math.hypot(a[0] - da[0], a[1] - da[1]); })(), tv = lim(d0 / 330, 0.2, 0.34);
        emettitore(1.1, (dt, t) => {
          const da = h.mano("dx"), a = h.bersaglio(), base = Math.atan2(a[1] - da[1], a[0] - da[0]), f = lim((1.1 - t) / 0.25, 0, 1);
          for (let i = 0; i < 9; i++) if (Math.random() < f) {
            const an = base + rnd(-0.17, 0.17), v = rnd(220, 380);
            fiamma(h, da[0] + Math.cos(an) * 4, da[1] + Math.sin(an) * 4, Math.cos(an) * v, Math.sin(an) * v, {g: -22, attrito: 0.8, vita: rnd(0.32, 0.68), s: Math.random() < 0.55 ? 3 : 2, cols: CALDA});
          }
          if (Math.random() < 0.8 * f) fiamma(h, da[0] + Math.cos(base) * 6, da[1] + Math.sin(base) * 6, Math.cos(base) * 150, Math.sin(base) * 150, {s: 4, vita: 0.3, attrito: 1.4, cols: CALDA});
        }, (ctx, t) => { const da = h.mano("dx"); disco(ctx, da[0] + 3 * h.att.f, da[1], 7, "#ff7a16", 0.28 * lim((1.1 - t) / 0.25, 0, 1), true); });
        h.futuro(tv, () => {
          h.contatto(null);
          bruciaCorpo(h, h.dif, h.colpito ? 1.5 : 0.6);                           // il bersaglio e' avvolto dalle fiamme finche' il getto dura
          h.futuro(0.8, h.fine);
        });
      }});
  }

  /* eruzione: chi la usa alza le braccia al cielo e sotto l'avversario le fiamme sbucano dal terreno, dritte verso l'alto */
  function eruzione(ev, h) {
    fiammeMano(h, 1.3, 1.2, ["dx", "sx"]);
    h.gesto("cielo", {durata: 1.3});
    const t0 = 0.55;                                       // le braccia sono in alto: il terreno cede
    h.futuro(t0 - 0.12, () => h.reazione("salto"));
    h.futuro(t0, () => {
      h.scuoti(2);
      emettitore(1.15, (dt, t) => {
        const c = h.pose(h.dif, "busto_inf"), bx = h.aMondo(h.dif, [c[0], 0])[0], k = lim(t / 0.2, 0, 1) * lim((1.15 - t) / 0.3, 0, 1);
        for (let i = 0; i < 16; i++) if (Math.random() < k) fiamma(h, bx + rnd(-12, 12), 109 + rnd(-1, 1), rnd(-26, 26), -rnd(190, 380), {g: 330, attrito: 0.3, vita: rnd(0.5, 0.95), s: Math.random() < 0.55 ? 3 : 2, cols: CALDA});
        if (Math.random() < 0.5 * k) h.particella({x: bx + rnd(-9, 9), y: 108, vx: rnd(-40, 40), vy: -rnd(120, 260), g: 520, s: 2, vita: 0.9, fade: 0.3, cols: BRACE, luce: true, davanti: true});
        if (Math.random() < 0.5 * k) h.particella({x: bx + rnd(-14, 14), y: 109, vx: rnd(-30, 30), vy: -rnd(20, 60), g: 80, s: 2, vita: 0.7, fade: 0.3, col: "#3a2a24", davanti: true});     // zolle e fumo
      }, (ctx, t) => {
        const c = h.pose(h.dif, "busto_inf"), bx = h.aMondo(h.dif, [c[0], 0])[0], k = lim(t / 0.2, 0, 1) * lim((1.15 - t) / 0.3, 0, 1);
        disco(ctx, bx, 108, 15, "#ff5a10", 0.3 * k, true); disco(ctx, bx, 108, 8, "#ffc13a", 0.4 * k, true);       // il bagliore sul terreno
        const col = ctx.createLinearGradient(0, 108, 0, 30); col.addColorStop(0, "rgba(255,120,24,0.5)"); col.addColorStop(1, "rgba(255,90,10,0)");      // la colonna di luce del getto
        ctx.globalAlpha = 0.55 * k; ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = col; ctx.fillRect(bx - 13, 30, 26, 78);
      });
    });
    h.futuro(t0 + 0.45, () => {
      const a = h.bersaglio();
      h.contatto(null, {dir: [-0.3, -1.7]});               // chi e' colpito viene lanciato in alto dal getto
      lampo(a[0], a[1], 22, 0.45, "#ff7a16");
      if (h.colpito) bruciaCorpo(h, h.dif, 1.4);
    });
    h.futuro(t0 + 1.35, h.fine);
  }

  /* scheggie (n = 3) e scheggia di ghiaccio (n = 1): le braccia fanno un arco dal basso verso l'alto e le schegge partono verso l'avversario.
     Se colpiscono si conficcano nel punto colpito e spariscono da sole; se vengono parate cadono, se mancano filano via. */
  function schegge(ev, h, n, tipo) {
    const ghiaccio = tipo === "ghiaccio", tRil = 0.42, scarto = 0.075;
    h.gesto("arco", {durata: 0.66});
    h.futuro(tRil - 0.03, () => h.reazione());
    h.futuro(tRil, () => h.att.pup.spingiTutto(-40, 0));
    let tUltimo = 0;
    for (let i = 0; i < n; i++) {
      const centro = i - (n - 1) / 2;
      h.futuro(tRil + i * scarto, () => {
        const da = h.mano("dx"), a0 = h.bersaglio(), a = [a0[0] + rnd(-1, 1), a0[1] + centro * 3.4];
        da[1] += centro * 1.8;
        const dx = a[0] - da[0], dy = a[1] - da[1], d = Math.hypot(dx, dy), tv = Math.max(0.14, d / 600), ultima = i === n - 1;
        if (ghiaccio) for (let k = 0; k < 6; k++) h.particella({x: da[0], y: da[1], vx: rnd(-30, 60) * h.att.f, vy: rnd(-40, 20), g: 60, s: 1, vita: 0.4, fade: 0.2, cols: GELO, luce: true, davanti: true});
        // a segno: la scheggia arriva nel punto; parata: si ferma sulla mano e cade; mancata: continua oltre e va via
        const fine = h.colpito || h.parato ? a : [a[0] + dx / d * 120, a[1] + dy / d * 120];
        const tvTot = h.colpito || h.parato ? tv : tv * (1 + 120 / d);
        proiettile({x0: da[0], y0: da[1], x1: fine[0], y1: fine[1], tv: tvTot, tipo,
          scia: ghiaccio ? (q) => { for (let k = 0; k < 2; k++) h.particella({x: q.x + rnd(-1.2, 1.2), y: q.y + rnd(-1.2, 1.2), vx: rnd(-8, 8), vy: rnd(6, 20), g: 30, s: 1, vita: rnd(0.35, 0.7), fade: 0.2, cols: GELO, luce: true, davanti: true}); } : null,
          fine: (q) => {
            const dir = [dx / d, dy / d];
            if (h.colpito) {
              conficca(h, h.dif, h.ev.loc, [q.x, q.y], dir, tipo, rnd(2.6, 3.4));
              for (let k = 0; k < (ghiaccio ? 8 : 4); k++) h.particella({x: q.x, y: q.y, vx: rnd(-50, 50), vy: rnd(-60, 20), g: 260, s: 1, vita: 0.4, fade: 0.2, cols: ghiaccio ? GELO : ["#fff6dc", "#d6cba8"], luce: ghiaccio, davanti: true});
            } else if (h.parato) {
              scheggiaLibera(q.x, q.y, -dir[0] * 40 + rnd(-20, 20), -rnd(60, 120), tipo, 1.4);
              h.particella({x: q.x, y: q.y, vx: 0, vy: 0, s: 3, vita: 0.12, fade: 0.1, col: "#ffe38a", luce: true, davanti: true});
            } else scheggiaLibera(q.x, q.y, dir[0] * 150, dir[1] * 60, tipo, 1.0);
            if (ultima) { h.contatto({mondo: [q.x, q.y]}); h.futuro(0.45, h.fine); }
          }});
        tUltimo = Math.max(tUltimo, tRil + i * scarto + tvTot);
      });
    }
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* chi ha un'animazione apposita, e le funzioni dell'arena */
  const TAB = {
    9: scintilla,                                              // Pirocinesi: scintilla
    4: palla,                                                  // Pirocinesi: Palla di fuoco
    5: lanciafiamme,                                           // Pirocinesi: Lanciafiamme
    43: eruzione,                                              // Pirocinesi: Eruzione
    7: (ev, h) => schegge(ev, h, 3, "scheggia"),               // Scheggie (Pelle Invincibile, Appendici Affilate)
    28: (ev, h) => schegge(ev, h, 1, "ghiaccio"),              // Criocinesi: Scheggia di Ghiaccio
  };
  const ha = (ev) => ev && ev.att_id != null && ev.att_id in TAB;
  function avvia(ev, h) { TAB[ev.att_id](ev, h); }
  function passo(dt) { for (let i = fx.length - 1; i >= 0; i--) if (!fx[i].passo(dt)) fx.splice(i, 1); }
  function disegna(ctx) { for (const f of fx) if (f.disegna) f.disegna(ctx); }
  const reset = () => { fx.length = 0; };

  return {ha, avvia, passo, disegna, reset, ids: () => Object.keys(TAB).map(Number), conta: () => fx.length};
})();
if (typeof module !== "undefined") module.exports = Mosse;
