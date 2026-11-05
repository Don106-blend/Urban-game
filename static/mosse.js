/* Urban — le animazioni dei singoli attacchi. Ogni attacco che ha qui la sua coreografia la recita al posto di quella di base (arena.js: pugno
   o proiettile dritto): cosa fa il corpo di chi attacca (i gesti: static/pupazzo.js), cosa vola, cosa brucia, cosa si conficca.
   Il server ha gia' deciso com'e' andata (a segno, parato, schivato): l'animazione lo mette in scena e dice QUANDO il colpo arriva chiamando
   `h.contatto()`: solo da quel momento il gioco segna danni, numeri e knockback (arena.js: rivela/vista). Ogni coreografia deve quindi
   chiamare `contatto` una volta, e `fine` un po' dopo.

   `h` e' quello che l'arena mette in mano: i due combattenti (`att`, `dif`), com'e' andata (`colpito`, `parato`), `mano(lato)` e `bersaglio()`
   (punti nel mondo, in px sprite), `attacca(extra)` e `gesto(tipo, opz)` per muovere il corpo di chi attacca, `reazione()` per far scansare o
   parare chi difende, `futuro(secondi, fn)`, `particella(o)`. Gli effetti propri (proiettili, emettitori, schegge conficcate) vivono qui, in `fx`.

   Sono animazioni a pixel come il resto: pochi colori, luce additiva per il fuoco, niente antialiasing voluto. Le prime sono quelle di Pirocinesi
   (scintilla, palla di fuoco, lanciafiamme, eruzione), poi le Scheggie e la Scheggia di Ghiaccio, poi quelle di Idrocinesi (getto, onda anomala,
   maremoto) e di Super Forza (colpo devastante, ondata sismica, frana), poi Super Soldato (raffica controllata e tiro di precisione, con le armi in mano),
   Necromanzia (tocco debilitante, dreno vitale, falce delle anime: fuoco verde), Geocinesi (pugno di roccia), Elettrocinesi (scarica elettrica, fulmine),
   Appendici Affilate (artigli affilati, artigli sanguinari, braccio lama) e Anatema (affamare, affaticare, assorbi caratteristica: il dreno vitale, rosso). Gli sprite dell'onda, dei massi e delle
   armi: static/sprites/mosse (tools/sprites/mosse_sprite.px.js). */
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
  function lampo(x, y, r, durata, col, col2 = "#ffd890") {                 // un bagliore additivo che si allarga e svanisce
    fx.push({t: 0, passo(dt) { this.t += dt; return this.t < durata; },
             disegna(ctx) { const k = this.t / durata; disco(ctx, x, y, r * (0.35 + 0.65 * k), col, 0.32 * (1 - k), true); disco(ctx, x, y, r * 0.4 * (1 - k * 0.5), col2, 0.26 * (1 - k), true); }});
  }
  function scoppioFuoco(h, x, y, n, forza = 1) {         // una vampata: fiamme in tutte le direzioni, e il bagliore
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.2832), v = rnd(30, 120) * forza;
      fiamma(h, x, y, Math.cos(a) * v, Math.sin(a) * v - 30 * forza, {g: -30, attrito: 2.4, vita: rnd(0.25, 0.55), s: Math.random() < 0.35 ? 2 : 1});
    }
    lampo(x, y, 11 * forza + 4, 0.28, "#ff8a1f");
  }
  /* fiamme sul corpo di chi e' stato colpito (o sta per esserlo): lingue che salgono da pezzi a caso */
  function bruciaCorpo(h, L, durata, cols = null) {
    const pezzi = ["busto_sup", "busto_inf", "testa", "avambraccio_dx", "avambraccio_sx", "coscia_dx", "coscia_sx", "stinco_dx", "stinco_sx"];
    emettitore(durata, (dt, t) => {
      const f = lim((durata - t) / 0.4, 0, 1);
      for (let i = 0; i < 2; i++) if (Math.random() < 0.7 * f) {
        const b = h.pose(L, pezzi[Math.floor(Math.random() * pezzi.length)]), w = h.aMondo(L, [b[0] + rnd(-4, 4), b[1] + rnd(-5, 5)]);
        fiamma(h, w[0], w[1], rnd(-10, 10), -rnd(18, 46), {g: -50, vita: rnd(0.3, 0.6), cols});
      }
    });
  }
  /* la mano di chi lancia fuoco prende fuoco (le mosse di Pirocinesi: tutte): fiamme e un bagliore finche' dura la mossa */
  function fiammeMano(h, durata, forza = 1, lati = ["dx"], pal = null) {          // pal = {cols, glow: [esterno, interno]}: di base il fuoco, ma anche il fuoco verde
    emettitore(durata, (dt, t) => {
      const f = lim((durata - t) / 0.3, 0, 1) * lim(t / 0.1, 0, 1) * forza;
      for (const l of lati) {
        const m = h.mano(l);
        if (Math.random() < 0.9 * f) fiamma(h, m[0] + rnd(-1.5, 1.5), m[1] + rnd(-1, 1), rnd(-9, 9), -rnd(14, 40), {g: -60, cols: pal && pal.cols});
        if (Math.random() < 0.25 * f) fiamma(h, m[0], m[1], rnd(-5, 5), -rnd(30, 60), {s: 2, vita: rnd(0.2, 0.35), cols: pal && pal.cols});
      }
    }, (ctx, t) => {
      const f = lim((durata - t) / 0.3, 0, 1) * lim(t / 0.1, 0, 1) * forza;
      const g = (pal && pal.glow) || ["#ff8a1f", "#ffe27a"];
      for (const l of lati) { const m = h.mano(l); disco(ctx, m[0], m[1] - 1, 5 + Math.sin(t * 40) * 0.8, g[0], 0.26 * f, true); disco(ctx, m[0], m[1] - 1, 2.6, g[1], 0.35 * f, true); }
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
    } else if (q.tipo === "pallottola" || q.tipo === "colpo") {          // una scia di luce lunga e sottile (la pallottola) o piu' lunga e grossa (il colpo del cecchino)
      const pes = q.tipo === "colpo", L = pes ? 30 : 12, dx = Math.cos(q.ang), dy = Math.sin(q.ang), w = pes ? 2 : 1;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < L; i++) {
        const a = 1 - i / L;
        ctx.globalAlpha = 0.9 * a * a; ctx.fillStyle = i < 3 ? "#fffbe8" : pes ? "#ffb060" : "#ffe08a";
        ctx.fillRect(Math.round(q.x - dx * i), Math.round(q.y - dy * i), w, w);
      }
      disco(ctx, q.x, q.y, pes ? 4.5 : 2.6, pes ? "#ff9a30" : "#ffd060", pes ? 0.4 : 0.3, true);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
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
  /* IDROCINESI E SUPER FORZA: getto d'acqua, onda anomala, maremoto, colpo devastante, ondata sismica, frana */
  const ACQUA = ["#f6fdff", "#beeefa", "#68c8ee", "#328cd6", "#185ca8", "#0e3470"];     // dalla schiuma all'abisso (come lo sprite dell'onda)
  const SCHIUMA = [ACQUA[0], ACQUA[1], ACQUA[2], ACQUA[3]];
  const ROCCIA = ["#d4c8b0", "#a09480", "#706452", "#3a322c"];
  const TERRA = ["#8a7560", "#5a4636", "#33281f"];
  const BASE_SPR = "/static/sprites/mosse/";
  const carica = (f) => { if (typeof Image === "undefined") return null; const i = new Image(); i.src = BASE_SPR + f; return i; };
  const SPR = {onda: carica("onda.png"), maremoto: carica("maremoto.png"), massi: [1, 2, 3, 4, 5, 6].map((n) => carica(`masso_${n}.png`))};
  const pronta = (i) => !!(i && i.complete && i.naturalWidth > 0);
  const liscia = (t) => { t = lim(t, 0, 1); return t * t * (3 - 2 * t); };

  /* uno schizzo d'acqua: gocce e schiuma che saltano in tutte le direzioni (o in un ventaglio attorno a `dir`) e ricadono */
  function spruzzo(h, x, y, n, forza = 1, dir = null) {
    for (let i = 0; i < n; i++) {
      const a = dir ? Math.atan2(dir[1], dir[0]) + rnd(-0.9, 0.9) : rnd(-3.14, 0), v = rnd(40, 200) * forza;
      h.particella({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30 * forza, g: 700, attrito: 0.4, s: Math.random() < 0.3 ? 2 : 1, vita: rnd(0.4, 0.9), fade: 0.2, cols: SCHIUMA, davanti: true});
    }
  }
  /* un anello a pixel che si allarga (onda sonica, onda d'urto) */
  function anello(ctx, x, y, r, col, a, sp = 2, ry = 1) {
    ctx.globalAlpha = a; ctx.fillStyle = col;
    const passo = Math.max(0.03, 1.2 / Math.max(r, 4));
    for (let t = 0; t < 6.2832; t += passo) ctx.fillRect(Math.round(x + Math.cos(t) * r), Math.round(y + Math.sin(t) * r * ry), sp, sp);
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /* getto d'acqua: il braccio destro si tende e un getto continuo di acqua, lo stesso flusso di perle che gira attorno agli idrocineti, parte dalla mano
     e va a battere sulla parte colpita (se non colpisce, la oltrepassa). Il getto si allunga, tiene e si ritira. */
  function getto(ev, h) {
    const T = 0.7;                                          // quanto dura il getto (dalla partenza alla coda che lascia la mano)
    h.attacca({distanza: true, carica: 0.24, colpo: 0.12, tenuta: 0.75, recupero: 0.36, alFine: () => {},
      alColpoInizio() {
        h.att.pup.spingiTutto(-30, 0);
        const centro = () => { const m = h.mano("dx"), a = h.bersaglio(), d = dist(m, a) || 1, dx = (a[0] - m[0]) / d, dy = (a[1] - m[1]) / d; return {m, a, d, dx, dy}; };
        const g0 = centro(), tv = lim(g0.d / 340, 0.14, 0.32);
        h.futuro(Math.max(0.02, tv - 0.16), () => h.reazione());
        const fine = (g) => (h.colpito || h.parato) ? g.a : [g.a[0] + g.dx * 150, g.a[1] + g.dy * 150];              // se non colpisce, il getto va oltre
        fx.push({t: 0,
          passo(dt) {
            this.t += dt;
            const g = centro(), e = fine(g), testa = lim(this.t / tv, 0, 1);
            if (this.t >= tv && this.t < T + 0.12 && Math.random() < 0.9 && (h.colpito || h.parato)) {         // dove batte: acqua che schizza indietro e in alto
              h.particella({x: g.a[0], y: g.a[1], vx: -g.dx * rnd(30, 120) + rnd(-30, 30), vy: -rnd(40, 150), g: 700, s: Math.random() < 0.3 ? 2 : 1, vita: rnd(0.3, 0.7), fade: 0.2, cols: SCHIUMA, davanti: true});
              h.particella({x: g.a[0], y: g.a[1], vx: -g.dx * rnd(10, 60), vy: -rnd(10, 60), g: 400, s: 2, vita: 0.25, fade: 0.2, cols: SCHIUMA, davanti: true});
            }
            if (Math.random() < 0.6) h.particella({x: g.m[0] + g.dx * rnd(3, 20) + rnd(-1, 1), y: g.m[1] + g.dy * rnd(3, 20) + rnd(-2, 2), vx: rnd(-10, 10), vy: rnd(4, 30), g: 500, s: 1, vita: rnd(0.2, 0.4), fade: 0.15, cols: SCHIUMA, davanti: true});
            return this.t < T + 0.22;
          },
          disegna(ctx) {
            const g = centro(), e = fine(g), testa = lim(this.t / tv, 0, 1), coda = lim((this.t - T) / 0.2, 0, 1);
            const dx = e[0] - g.m[0], dy = e[1] - g.m[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
            ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.28 * (1 - coda); ctx.fillStyle = "#58c0f0";
            ctx.beginPath(); ctx.arc(g.m[0] + ux * 2, g.m[1] + uy * 2, 6 + Math.sin(this.t * 40), 0, 6.2832); ctx.fill();            // il bagliore alla mano
            ctx.globalCompositeOperation = "source-over";
            const s0 = coda * L, s1 = testa * L;
            for (let s = s0; s <= s1; s += 1.6) {                                    // le perle del flusso, una dietro l'altra, con l'ondeggiare del getto
              const env = Math.min(1, (s - s0) / 8) * Math.min(1, (s1 - s) / 6 + 0.35);
              const w = Math.sin(s * 0.34 - this.t * 36) * 1.7 * Math.min(1, s / 14), r = (1.5 + 0.7 * Math.sin(s * 0.21 + this.t * 20)) * (0.6 + 0.4 * env) + (s < 6 ? -0.4 : 0);
              discoPixel(ctx, g.m[0] + ux * s + px * w, g.m[1] + uy * s + py * w, Math.round(r + 0.5), [ACQUA[4], ACQUA[3], ACQUA[2], ACQUA[1]]);
            }
            for (let k = 0; k < 14; k++) {                                           // schiuma sulle perle: pixel chiari che corrono
              const s = s0 + ((k * 13.7 + this.t * 170) % Math.max(4, s1 - s0));
              if (s < s1) { ctx.globalAlpha = 0.9; ctx.fillStyle = ACQUA[0]; ctx.fillRect(Math.round(g.m[0] + ux * s + px * Math.sin(s * 0.34 - this.t * 36) * 1.7 - 0.5), Math.round(g.m[1] + uy * s + py * Math.sin(s * 0.34 - this.t * 36) * 1.7 - 1), 1, 1); }
            }
            ctx.globalAlpha = 1;
          }});
        h.futuro(tv, () => {
          h.contatto(null);
          if (h.colpito || h.parato) { const a = h.bersaglio(); spruzzo(h, a[0], a[1], 18, 1, [-g0.dx, -0.4]); lampo(a[0], a[1], 12, 0.3, "#58c0f0"); }
          h.futuro(T - tv + 0.3, h.fine);
        });
      }});
  }

  /* L'ONDATA (Onda Anomala e Maremoto): chi la usa alza le braccia; dietro di lui, da fuori scena, sale un'onda che corre verso l'avversario passandogli
     alle spalle; quando e' vicina le braccia si abbassano e la indicano; l'onda si schianta sul bersaglio (o, se lo manca, lo oltrepassa e lascia lo schermo).
     `M`: sprite, dimensioni di un fotogramma, tempo di arrivo, quanta schiuma e quanta scossa. */
  function ondata(ev, h, M) {
    const att = h.att, dir = att.f, w = M.w, hh = M.h, W = h.largo || 450, colpisce = h.colpito || h.parato;
    const xTorso = () => h.aMondo(h.dif, [h.pose(h.dif, "busto_inf")[0], 0])[0], xCast = h.aMondo(att, [h.pose(att, "busto_inf")[0], 0])[0];
    const x0 = dir > 0 ? -14 : W + 14, xC = xTorso() - dir * 4, tArr = M.tArr, E = (u) => Math.pow(lim(u, 0, 1), 1.45);
    const dopo = (dir > 0 ? W + w + 20 : -w - 20), vFin = Math.abs(xC - x0) / tArr * 1.9;       // se manca, l'onda continua alla velocita' che aveva e esce dall'altra parte
    const xf = (t) => t <= tArr ? x0 + (xC - x0) * E(t / tArr) : colpisce ? xC + dir * 18 * liscia((t - tArr) / 0.5) : xC + dir * vFin * (t - tArr);
    // quando il fronte passa dal combattente che l'ha evocata: da li' le braccia si abbassano e puntano (la transizione dura 0,24 s)
    const uC = lim((xCast - x0) / (xC - x0), 0.2, 0.95), tCast = tArr * Math.pow(uC, 1 / 1.45), tPunta = Math.max(0.5, tCast - 0.18);
    h.gesto("evoca", {durata: tArr + 0.45, punta: tPunta, bersaglio: () => h.daMondo(att, h.bersaglio())});
    h.futuro(Math.max(0.02, tArr - 0.3), () => h.reazione("salto"));
    const o = {t: 0, crollo: -1,
      passo(dt) {
        this.t += dt;
        const x = xf(this.t);
        if (this.t < tArr + 0.05 || !colpisce) {                                       // la scia: schiuma che resta sul pavimento dietro il fronte
          for (let i = 0; i < M.scia; i++) h.particella({x: x - dir * rnd(0, w * 0.7), y: 109 + rnd(-1, 2), vx: dir * rnd(10, 60), vy: -rnd(5, 60), g: 320, s: Math.random() < 0.35 ? 2 : 1, vita: rnd(0.3, 0.7), fade: 0.2, cols: SCHIUMA, davanti: true});
        }
        if (this.t < tArr && M.rombo) h.scuoti(M.rombo * liscia(this.t / tArr));          // il maremoto: il terreno trema
        if (this.crollo < 0 && this.t >= tArr && colpisce) {                             // lo schianto
          this.crollo = 0;
          for (let i = 0; i < M.schizzi; i++) h.particella({x: xC + rnd(-6, 6), y: 111 - rnd(2, hh * 0.9), vx: dir * rnd(30, 250) * M.forza, vy: -rnd(20, 280) * M.forza, g: 640, attrito: 0.3, s: Math.random() < 0.3 ? 3 : Math.random() < 0.5 ? 2 : 1, vita: rnd(0.5, 1.1), fade: 0.25, cols: SCHIUMA, davanti: true});
          lampo(xC, 111 - hh * 0.4, hh * 0.55, 0.42, "#58c0f0");
          h.scuoti(M.scossa);
        }
        if (this.crollo >= 0) {
          this.crollo += dt;
          if (this.crollo < 0.7) for (let i = 0; i < M.scia * 2; i++) h.particella({x: xC + dir * rnd(-4, 40), y: 109 + rnd(-2, 2), vx: dir * rnd(40, 160), vy: -rnd(0, 40), g: 260, s: Math.random() < 0.4 ? 2 : 1, vita: rnd(0.3, 0.7), fade: 0.2, cols: SCHIUMA, davanti: true});     // l'acqua si riversa sul pavimento
        }
        if (!colpisce && x * dir > dopo * dir) return false;
        return this.crollo < 0 || this.crollo < 0.75;
      },
      disegna(ctx, fronte) {
        const t = this.t, x = xf(t), crollo = this.crollo, k = crollo < 0 ? 0 : liscia(crollo / 0.55);
        if (!!fronte !== (crollo >= 0)) return;                                       // dietro ai combattenti finche' corre, davanti quando si schianta
        const alta = Math.round(hh * (1 - 0.85 * k)), im = SPR[M.sprite];
        ctx.globalAlpha = 0.93 * (1 - 0.6 * k * k); ctx.globalCompositeOperation = "source-over";
        if (pronta(im)) {
          const fr = Math.floor(t * 12) % 4, sy = hh - alta;
          if (dir > 0) ctx.drawImage(im, fr * w, sy, w, alta, Math.round(x - w), 112 - alta, w, alta);
          else { ctx.save(); ctx.translate(Math.round(x), 0); ctx.scale(-1, 1); ctx.drawImage(im, fr * w, sy, w, alta, -w, 112 - alta, w, alta); ctx.restore(); }
        } else {                                                                       // (senza immagini: una cresta a poligono)
          ctx.fillStyle = ACQUA[3]; ctx.beginPath(); ctx.moveTo(x - dir * w, 112); ctx.lineTo(x - dir * w * 0.2, 112 - alta); ctx.lineTo(x, 112 - alta * 0.5); ctx.lineTo(x, 112); ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }};
    fx.push({passo: (dt) => o.passo(dt), dietro: (ctx) => o.disegna(ctx, false), disegna: (ctx) => o.disegna(ctx, true)});
    h.futuro(tArr, () => { h.contatto(null, {dir: [-1, -0.5]}); });
    h.futuro(tArr + (colpisce ? 0.85 : (dopo - xC) * dir / vFin + 0.2), h.fine);
  }

  /* colpo devastante: il pugno e' quello di sempre, ma quando colpisce (o viene parato) dal punto d'impatto parte un'onda sonica: anelli che si allargano
     di colpo, uno scoppio di polvere e la scossa */
  function devastante(ev, h) {
    h.attacca({alFine: () => {}, alContatto(info) {
      h.contatto(info);
      if (h.colpito || h.parato) {
        const p = h.impatto(info), k = h.colpito ? 1 : 0.6;
        fx.push({t: 0, passo(dt) { this.t += dt; return this.t < 0.6; },
          disegna(ctx) {
            for (let i = 0; i < 3; i++) {
              const u = (this.t - i * 0.07) / 0.42;
              if (u < 0 || u > 1) continue;
              const r = (3 + 46 * k * (1 - Math.pow(1 - u, 2.2))), a = (1 - u) * (i === 0 ? 0.95 : 0.7);
              anello(ctx, p[0], p[1], r, i === 0 ? "#ffffff" : i === 1 ? "#d6eeff" : "#a4cdf0", a, i === 0 ? 2 : 1, 0.92);
            }
            disco(ctx, p[0], p[1], 14 * k * (1 - this.t / 0.6), "#ffffff", 0.35 * Math.max(0, 1 - this.t / 0.2), true);
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
          }});
        for (let i = 0; i < 18 * k; i++) { const a = rnd(0, 6.2832), v = rnd(60, 190) * k; h.particella({x: p[0], y: p[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 20, g: 200, attrito: 2.2, s: Math.random() < 0.4 ? 2 : 1, vita: rnd(0.25, 0.5), fade: 0.2, cols: ["#ffffff", "#cfd6e0", "#8a93a1"], davanti: true}); }
        h.scuoti(3.2 * k);
      }
      h.futuro(0.55, h.fine);
    }});
  }

  /* ondata sismica: chi la usa si abbassa e sbatte i pugni a terra; dal punto dove colpiscono una gobba di terra corre sul pavimento verso l'avversario,
     alzando polvere e sassi e lasciando crepe nel pavimento; lo raggiunge, lo scaglia in aria */
  function sismica(ev, h) {
    const tS = 0.5, f = h.att.f;
    h.gesto("sbatte", {durata: 1.15, alza: 0.34, sbatte: tS});
    let x0 = 0, xT = 0, tv = 0.4, crepe = [];
    h.futuro(tS, () => {
      const m = h.mano("dx"), a = h.bersaglio();
      x0 = m[0] + f * 4; xT = a[0] - f * 2;
      tv = lim(Math.abs(xT - x0) / 270, 0.2, 0.55);
      let y = 112; crepe = [[x0, y]];
      for (let s = 4; s <= Math.abs(xT - x0) + 14; s += 3.5) { y = lim(y + rnd(-1.4, 1.4), 111, 117); crepe.push([x0 + f * s, y]); }
      h.scuoti(4);
      for (let i = 0; i < 26; i++) { const an = rnd(-3.0, -0.15), v = rnd(50, 210); h.particella({x: x0, y: 109, vx: Math.cos(an) * v, vy: Math.sin(an) * v, g: 800, attrito: 0.6, s: Math.random() < 0.4 ? 2 : 1, vita: rnd(0.4, 0.9), fade: 0.2, cols: i % 3 ? ROCCIA : TERRA, davanti: true}); }
      for (let i = 0; i < 12; i++) h.particella({x: x0 + rnd(-6, 6), y: 109, vx: rnd(-50, 50), vy: -rnd(10, 40), g: -10, attrito: 1.2, s: 2, vita: rnd(0.5, 0.9), fade: 0.4, cols: ["#8a8070", "#5a5448", "#3a352c"], davanti: true});     // la polvere
      fx.push({t: 0,
        passo(dt) {
          this.t += dt;
          const xs = x0 + f * Math.min(Math.abs(xT - x0), Math.abs(xT - x0) * this.t / tv);
          if (this.t < tv + 0.1) {
            for (let i = 0; i < 2; i++) h.particella({x: xs + rnd(-8, 8), y: 109 + rnd(-1, 2), vx: f * rnd(0, 40) + rnd(-20, 20), vy: -rnd(30, 120), g: 520, attrito: 0.5, s: Math.random() < 0.5 ? 2 : 1, vita: rnd(0.3, 0.7), fade: 0.2, cols: Math.random() < 0.5 ? ROCCIA : TERRA, davanti: true});
            if (Math.random() < 0.7) h.particella({x: xs + rnd(-10, 6), y: 110, vx: rnd(-15, 15), vy: -rnd(10, 40), g: -20, attrito: 1.2, s: 2, vita: rnd(0.5, 0.9), fade: 0.4, cols: ["#8a8070", "#5a5448", "#3a352c"], davanti: true});
            h.scuoti(1.2);
          }
          return this.t < tv + 1.6;
        },
        disegna(ctx) {                                                                                       // la gobba di terra, e le crepe che restano
          const xs = x0 + f * Math.min(Math.abs(xT - x0), Math.abs(xT - x0) * this.t / tv), viva = this.t < tv + 0.1;
          const dis = lim((tv + 1.6 - this.t) / 0.6, 0, 1);
          ctx.globalAlpha = dis; ctx.fillStyle = "#16110d";
          for (const [cx, cy] of crepe) if ((cx - x0) * f <= (xs - x0) * f + 2) ctx.fillRect(Math.round(cx), Math.round(cy), 2, 1);
          if (viva) for (let dx = -26; dx <= 4; dx++) {                                                       // il profilo: sale dietro il fronte e cala davanti
            const ht = Math.round(8 * Math.exp(-Math.pow((dx + 9) / 8, 2)) * (0.7 + 0.3 * Math.sin(this.t * 40 + dx)));
            const x = Math.round(xs - f * dx);
            if (ht <= 0) continue;
            ctx.globalAlpha = 1; ctx.fillStyle = TERRA[2]; ctx.fillRect(x, 111 - ht, 1, ht);
            ctx.fillStyle = TERRA[1]; ctx.fillRect(x, 111 - ht + 1, 1, Math.max(0, ht - 2));
            ctx.fillStyle = TERRA[0]; ctx.fillRect(x, 111 - ht, 1, 1);
          }
          ctx.globalAlpha = 1;
        }});
      h.futuro(Math.max(0.02, tv - 0.22), () => h.reazione("salto"));
      h.futuro(tv, () => {
        h.contatto(null, {dir: [-0.5, -1.4]});
        const b = h.bersaglio();
        for (let i = 0; i < 22; i++) h.particella({x: b[0] + rnd(-9, 9), y: 109, vx: rnd(-60, 60), vy: -rnd(100, 280), g: 820, s: Math.random() < 0.4 ? 2 : 1, vita: rnd(0.4, 0.9), fade: 0.2, cols: i % 2 ? ROCCIA : TERRA, davanti: true});
        h.scuoti(3.2);
        h.futuro(0.9, h.fine);
      });
    });
  }

  /* frana: braccia al cielo e poi puntate; dall'alto cadono massi, con l'ombra che cresce a terra, e battono sull'avversario: scoppiano in schegge e polvere.
     Se la frana lo manca, i massi si piantano nel terreno, rimbalzano e si sbriciolano. */
  function frana(ev, h) {
    const tPunta = 0.5, tVia = 0.62, colpisce = h.colpito || h.parato, g = 1500, N = 6, PRINCIPALE = 2;
    h.gesto("evoca", {durata: 1.75, punta: tPunta, bersaglio: () => h.daMondo(h.att, h.bersaglio())});
    const massi = [], a0 = h.bersaglio(), bx = a0[0];
    const scelti = [[-2, 4], [-26, 2], [0, 5], [24, 3], [-12, 1], [14, 0]];                // [spostamento x, sprite]: 6 massi, uno al centro (il principale: arriva sul bersaglio)
    let tMain = 0;
    scelti.forEach(([dx, k], i) => {
      const im = k, sw = [14, 18, 22, 26, 30, 16][im], sh = [12, 15, 18, 21, 25, 16][im];
      const x = bx + (i === PRINCIPALE ? 0 : dx) + rnd(-2, 2), y0 = -58 - i * 7, sulCorpo = colpisce && Math.abs(x - bx) < 15;
      const yFine = sulCorpo ? a0[1] - 6 + (i === PRINCIPALE ? 0 : rnd(-10, 6)) : 111 - sh / 2;
      const tc = Math.sqrt(2 * (yFine - y0) / g), t0 = tVia + i * 0.085;
      massi.push({x, y: y0, vy: 0, im, sw, sh, ang: rnd(-0.5, 0.5), w: rnd(-5, 5), t0, tL: t0 + tc, yFine, sulCorpo, stato: 0, riposo: 0});
      if (i === PRINCIPALE) tMain = t0 + tc;
    });
    h.futuro(Math.max(0.02, tMain - 0.26), () => h.reazione());
    const scoppia = (m, forza) => {
      for (let i = 0; i < 12 * forza; i++) h.particella({x: m.x + rnd(-4, 4), y: m.y + rnd(-3, 3), vx: rnd(-130, 130), vy: -rnd(30, 200), g: 900, attrito: 0.4, s: Math.random() < 0.4 ? 2 : 1, vita: rnd(0.4, 0.95), fade: 0.2, cols: ROCCIA, davanti: true});
      for (let i = 0; i < 6; i++) h.particella({x: m.x + rnd(-7, 7), y: m.y + rnd(-2, 4), vx: rnd(-30, 30), vy: -rnd(10, 45), g: -20, attrito: 1.2, s: 2, vita: rnd(0.5, 1), fade: 0.4, cols: ["#8a8070", "#5a5448", "#3a352c"], davanti: true});
      h.scuoti(1.4 + m.sh / 14);
    };
    fx.push({t: 0, fatti: 0,
      passo(dt) {
        this.t += dt;
        let vivi = false;
        for (const [i, m] of massi.entries()) {
          if (this.t < m.t0) { vivi = true; continue; }
          if (m.stato === 0) {                                                              // cade
            const s = this.t - m.t0; m.vy = g * s; m.y = -58 - i * 7 + 0.5 * g * s * s; m.ang += m.w * dt; vivi = true;
            if (m.y >= m.yFine) {
              m.y = m.yFine;
              if (i === PRINCIPALE) h.contatto(null, {dir: [-0.8, -0.5]});
              if (m.sulCorpo) { m.stato = 2; scoppia(m, 1.4); }                              // sul bersaglio: scoppia
              else { m.stato = 1; m.vy = -m.vy * 0.22; m.w *= 0.4; scoppia(m, 0.7); }       // a terra: rimbalza
              this.fatti++;
            }
          } else if (m.stato === 1) {                                                       // a terra: rimbalza, si ferma, dopo un po' si sbriciola
            m.vy += g * dt; m.y += m.vy * dt; m.ang += m.w * dt;
            if (m.y >= m.yFine) { m.y = m.yFine; if (m.vy > 40) m.vy = -m.vy * 0.3; else { m.vy = 0; m.w = 0; } }
            m.riposo += dt; vivi = vivi || m.riposo < 1.3;
            if (m.riposo > 1.0 && m.riposo - dt <= 1.0) scoppia({...m}, 0.5);
          }
        }
        return vivi;
      },
      dietro(ctx) {                                                                         // le ombre a terra: crescono mentre il masso scende
        for (const m of massi) {
          if (this.t < m.t0 || m.stato !== 0) continue;
          const k = lim(1 - (m.yFine - m.y) / 190, 0, 1);
          ctx.globalAlpha = 0.12 + 0.35 * k; ctx.fillStyle = "#000";
          ctx.beginPath(); ctx.ellipse(m.x, 111, 3 + m.sw * 0.45 * k, 1.2 + 1.2 * k, 0, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
      disegna(ctx) {
        for (const m of massi) {
          if (this.t < m.t0 || m.stato === 2) continue;
          const dis = m.stato === 1 ? lim((1.0 - m.riposo) / 0.2 + 1, 0, 1) : 1, im = SPR.massi[m.im];
          if (m.stato === 1 && m.riposo > 1.0) continue;
          ctx.save(); ctx.translate(Math.round(m.x), Math.round(m.y)); ctx.rotate(m.ang); ctx.globalAlpha = dis;
          if (pronta(im)) ctx.drawImage(im, -m.sw / 2, -m.sh / 2, m.sw, m.sh);
          else { ctx.fillStyle = ROCCIA[1]; ctx.fillRect(-m.sw / 2, -m.sh / 2, m.sw, m.sh); }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }});
    h.futuro(Math.max(...massi.map((m) => m.tL)) + 0.85, h.fine);
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* SUPER SOLDATO, NECROMANZIA, GEOCINESI: raffica controllata, tiro di precisione, tocco debilitante, dreno vitale, falce delle anime, pugno di roccia */
  const VERDE = ["#f2ffd9", "#b6ff7a", "#4de05a", "#1c9a46", "#0b4a2c"];          // il fuoco verde della Necromanzia: dal bianco-verde alla brace scura
  const VERDE_MANO = {cols: VERDE, glow: ["#2ed45c", "#d8ffb0"]};
  const PIOMBO = ["#fff6d0", "#ffd86a", "#ff9a2a"];                                 // le vampate delle bocche da fuoco
  /* le armi in mano: `ancora` = il punto dello sprite che sta nella mano (destra), `fronte` = dove la sinistra regge il fusto (fucile), `bocca` = la canna */
  const ARMI = {
    uzi: {ancora: [6, 7], bocca: [22, 3]},
    cecchino: {ancora: [15, 8], fronte: [26, 8], bocca: [53, 5.5]},
    falce: {ancora: [14, 23]},
  };
  for (const n of Object.keys(ARMI)) SPR[n] = carica(n + ".png");

  /* dov'e' la mano e dove punta l'avambraccio (nel mondo): le armi si tengono e si ruotano su questo */
  function polso(h, lato) {
    const g = h.giunto(h.att, "avambraccio_" + lato, "gomito_" + lato), p = h.giunto(h.att, "avambraccio_" + lato, "polso_" + lato);
    const ang = Math.atan2(p[1] - g[1], p[0] - g[0]);
    return {x: p[0] + Math.cos(ang) * 1.5, y: p[1] + Math.sin(ang) * 1.5, ang};
  }
  /* un'arma che compare in mano a chi attacca (la destra) e ci resta `durata` secondi. Segue la mano; un fucile segue la linea tra le due mani.
     `rinculo` (px) la spinge indietro e rientra da solo; `mondo(x, y)` porta un punto dello sprite nel mondo; `bocca()` e' la canna. `luce`: una copia additiva sopra. */
  function arma(h, nome, durata, o = {}) {
    const A = ARMI[nome], e = {t: 0, rinculo: 0, ang: 0, x: 0, y: 0};
    const aggiorna = () => {
      const m = polso(h, "dx");
      let ang = m.ang;
      if (A.fronte) { const s = polso(h, "sx"), dx = s.x - m.x, dy = s.y - m.y; if (Math.hypot(dx, dy) > 5) ang = Math.atan2(dy, dx); }
      e.ang = ang; e.x = m.x - Math.cos(ang) * e.rinculo; e.y = m.y - Math.sin(ang) * e.rinculo;
    };
    e.mondo = (lx, ly) => { const c = Math.cos(e.ang), s = Math.sin(e.ang), X = lx - A.ancora[0], Y = (ly - A.ancora[1]) * h.att.f; return [e.x + c * X - s * Y, e.y + s * X + c * Y]; };
    e.bocca = () => e.mondo(A.bocca[0], A.bocca[1]);
    e.passo = (dt) => { e.t += dt; e.rinculo = Math.max(0, e.rinculo - dt * 24); aggiorna(); return e.t < durata; };
    e.disegna = (ctx) => {
      const im = SPR[nome];
      if (!pronta(im)) return;
      const a = (o.alfa ?? 1) * lim(e.t / 0.08, 0, 1) * lim((durata - e.t) / 0.16, 0, 1);
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang); ctx.scale(1, h.att.f); ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = a; ctx.drawImage(im, -A.ancora[0], -A.ancora[1]);
      if (o.luce) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = o.luce * a; ctx.drawImage(im, -A.ancora[0], -A.ancora[1]); }
      ctx.restore();
    };
    aggiorna();
    fx.push(e);
    return e;
  }

  /* la vampata di una bocca da fuoco: scintille in un cono davanti alla canna e un lampo. forza > 1 = un colpo pesante */
  function bagliore(h, a, ang, forza = 1) {
    for (let i = 0; i < 5 * forza; i++) {
      const an = ang + rnd(-0.45, 0.45), v = rnd(90, 280) * forza;
      h.particella({x: a[0], y: a[1], vx: Math.cos(an) * v, vy: Math.sin(an) * v, g: 0, attrito: 4, s: forza > 1 ? 2 : 1, vita: rnd(0.06, 0.15), fade: 0.06, cols: PIOMBO, luce: true, davanti: true});
    }
    lampo(a[0] + Math.cos(ang) * 3, a[1] + Math.sin(ang) * 3, 7 * forza + 2, 0.1 * forza, "#ffb040");
  }
  function bossolo(h, p, grosso = false) {               // il bossolo che salta fuori e rimbalza
    h.particella({x: p[0], y: p[1], vx: -h.att.f * rnd(10, 45), vy: -rnd(70, 130), g: 800, s: grosso ? 2 : 1, vita: 0.7, fade: 0.2, col: "#d6a84a", davanti: true});
  }
  /* dove arriva una pallottola: a segno scintille (e gocce se c'e' sangue), parata scintille gialle, mancata polvere */
  function impattoPallottola(h, p, dir, k = 1) {
    if (h.colpito) {
      const sangue = !h.ev.protesi && h.ev.hp_persi > 0;
      for (let i = 0; i < 4 * k; i++) h.particella({x: p[0], y: p[1], vx: dir[0] * rnd(30, 120) * k + rnd(-40, 40), vy: dir[1] * rnd(10, 60) + rnd(-70, 20), g: 500, s: Math.random() < 0.3 ? 2 : 1, vita: rnd(0.25, 0.5), fade: 0.15,
                                                    cols: sangue ? ["#c0261c", "#8a1410", "#5a0c0c"] : PIOMBO, luce: !sangue, davanti: true});
      lampo(p[0], p[1], 5 * k + 1, 0.12, "#ffd060");
    } else if (h.parato) {
      for (let i = 0; i < 5 * k; i++) h.particella({x: p[0], y: p[1], vx: -h.att.f * rnd(20, 140) * k, vy: -rnd(20, 120), g: 600, s: 1, vita: rnd(0.15, 0.3), fade: 0.1, cols: PIOMBO, luce: true, davanti: true});
      lampo(p[0], p[1], 6 * k + 1, 0.14, "#ffe38a");
    } else {
      for (let i = 0; i < 4 * k; i++) h.particella({x: p[0], y: Math.min(108, p[1]), vx: rnd(-30, 30), vy: -rnd(10, 70) * k, g: 160, s: Math.random() < 0.4 ? 2 : 1, vita: rnd(0.3, 0.6), fade: 0.25, cols: ["#9a8c78", "#6a5d4c"], davanti: true});
    }
  }
  /* una pallottola dalla bocca `m` al punto `a`: se non colpisce (ne' e' parata) prosegue oltre e va a battere lontano */
  function pallottola(h, m, a, o = {}) {
    const dx = a[0] - m[0], dy = a[1] - m[1], d = Math.hypot(dx, dy) || 1, pes = !!o.pesante, vel = pes ? 1700 : 950, colpisce = h.colpito || h.parato;
    const fin = colpisce ? a : [a[0] + dx / d * 220, Math.min(109, a[1] + dy / d * 220)], dF = Math.hypot(fin[0] - m[0], fin[1] - m[1]);
    proiettile({x0: m[0], y0: m[1], x1: fin[0], y1: fin[1], tv: Math.max(0.045, dF / vel), tipo: pes ? "colpo" : "pallottola",
                fine: (q) => { impattoPallottola(h, [q.x, q.y], [dx / d, dy / d], pes ? 2.2 : 1); if (o.fine) o.fine(q); }});
  }

  /* raffica controllata: una mitraglietta compare nella mano destra, il braccio si tende e parte una raffica di sei colpi: vampate, bossoli, la mano
     che sussulta; ogni pallottola va a segno (scintille, gocce), e' parata o passa oltre. Il colpo "conta" alla terza. */
  function raffica(ev, h) {
    const N = 6, ritmo = 0.075;
    const uzi = arma(h, "uzi", 1.55);
    h.attacca({distanza: true, carica: 0.22, colpo: 0.1, tenuta: 0.8, recupero: 0.3, alFine: () => {},
      alColpoInizio() {
        h.futuro(0.07, () => h.reazione());
        for (let i = 0; i < N; i++) h.futuro(0.1 + i * ritmo, () => {
          const m = uzi.bocca(), a0 = h.bersaglio(), a = [a0[0] + rnd(-1.5, 1.5), a0[1] + rnd(-3.5, 3.5)];
          bagliore(h, m, uzi.ang, 1);
          bossolo(h, uzi.mondo(14, 2));
          uzi.rinculo = 2.4;
          h.att.pup.spingiTutto(-12, 0);
          pallottola(h, m, a, {fine: (q) => {
            if (i === 2) h.contatto({mondo: [q.x, q.y]});
            if (i === N - 1) h.futuro(0.4, h.fine);
          }});
        });
      }});
  }

  /* tiro di precisione: un fucile da cecchino pesante compare tra le braccia (la destra sull'impugnatura, la sinistra sul fusto), si prende la mira col
     puntatore laser rosso, poi il colpo: vampata enorme, rinculo che spinge indietro tutto il corpo, bossolo grosso e fumo; la pallottola e' una scia lunga. */
  function cecchino(ev, h) {
    const tSp = 1.0, DUR = 1.85;
    h.gesto("imbraccia", {durata: DUR, bersaglio: () => h.bersaglio()});
    const fucile = arma(h, "cecchino", DUR);
    fx.push({t: 0, passo(dt) { this.t += dt; return this.t < tSp; },
      disegna(ctx) {                                                                  // il puntatore laser: una linea sottile e un punto che sfarfalla sul bersaglio
        const k = lim((this.t - 0.4) / 0.2, 0, 1);
        if (k <= 0) return;
        const m = fucile.bocca(), a = h.bersaglio(), d = Math.hypot(a[0] - m[0], a[1] - m[1]), n = Math.floor(d / 2);
        ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "#ff3a3a";
        for (let i = 0; i < n; i++) { ctx.globalAlpha = 0.34 * k; ctx.fillRect(Math.round(m[0] + (a[0] - m[0]) * i / n), Math.round(m[1] + (a[1] - m[1]) * i / n), 1, 1); }
        const fl = 0.7 + 0.3 * Math.sin(this.t * 60);
        disco(ctx, a[0], a[1], 3.5, "#ff2020", 0.35 * k * fl, true); disco(ctx, a[0], a[1], 1.4, "#ffd0c0", 0.85 * k * fl, true);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      }});
    h.futuro(tSp - 0.05, () => h.reazione());
    h.futuro(tSp, () => {
      const m = fucile.bocca(), a = h.bersaglio();
      bagliore(h, m, fucile.ang, 2.6);
      fucile.rinculo = 6;
      h.att.pup.spingiTutto(-100, 0);
      h.scuoti(2.4);
      bossolo(h, fucile.mondo(24, 3), true);
      for (let i = 0; i < 7; i++) h.particella({x: m[0], y: m[1], vx: Math.cos(fucile.ang) * rnd(10, 60) + rnd(-10, 10), vy: -rnd(8, 34), g: -10, attrito: 1.5, s: 2, vita: rnd(0.6, 1.1), fade: 0.5, cols: ["#c8ccd2", "#8a909a"], davanti: true});   // il fumo
      fx.push({t: 0, passo(dt) { this.t += dt; return this.t < 0.3; },
               disegna(ctx) { const u = this.t / 0.3; anello(ctx, m[0] + Math.cos(fucile.ang) * 6, m[1] + Math.sin(fucile.ang) * 6, 3 + 16 * u, "#ffe9b0", 0.7 * (1 - u), 1, 1.4); ctx.globalAlpha = 1; }});
      pallottola(h, m, a, {pesante: true, fine: (q) => {
        if (h.colpito || h.parato) { lampo(q.x, q.y, 14, 0.25, "#ffb040"); h.scuoti(2); }
        h.contatto({mondo: [q.x, q.y]});
        h.futuro(0.85, h.fine);
      }});
    });
  }

  /* un'esplosione di fuoco verde: fiamme in tutte le direzioni e il bagliore (come scoppioFuoco, ma verde) */
  function scoppioVerde(h, x, y, n, forza = 1) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.2832), v = rnd(30, 120) * forza;
      fiamma(h, x, y, Math.cos(a) * v, Math.sin(a) * v - 30 * forza, {g: -30, attrito: 2.4, vita: rnd(0.25, 0.55), s: Math.random() < 0.35 ? 2 : 1, cols: VERDE});
    }
    lampo(x, y, 11 * forza + 4, 0.3, "#2ed45c", "#d8ffb0");
  }
  /* anime che salgono: tante piccole fiammelle verdi che ondeggiano verso l'alto da un punto (i colpi di Necromanzia che feriscono) */
  function anime(h, x, y, n) {
    for (let i = 0; i < n; i++) h.futuro(rnd(0, 0.5), () => fiamma(h, x + rnd(-8, 8), y + rnd(-6, 8), rnd(-8, 8), -rnd(24, 50), {g: -10, attrito: 0.6, vita: rnd(0.7, 1.2), s: 1, cols: VERDE}));
  }

  /* tocco debilitante: il pugno e' quello di sempre, ma la mano brucia di fuoco verde; al contatto un'esplosione verde e fiamme che salgono dal colpito */
  function tocco(ev, h) {
    fiammeMano(h, 1.05, 1.15, ["dx"], VERDE_MANO);
    h.attacca({alFine: () => {}, alContatto(info) {
      h.contatto(info);
      if (h.colpito || h.parato) {
        const p = h.impatto(info);
        scoppioVerde(h, p[0], p[1], h.colpito ? 16 : 8, h.colpito ? 1 : 0.6);
        if (h.colpito) { bruciaCorpo(h, h.dif, 0.8, VERDE); anime(h, p[0], p[1], 6); }
        h.scuoti(h.colpito ? 1.6 : 0.8);
      }
      h.futuro(0.5, h.fine);
    }});
  }

  /* le palette del drenaggio: il verde della Necromanzia e il rosso di Anatema. Ognuna dice le fiamme (`cols`), la mano, il guizzo all'arrivo (`lampo`), il filo e le palline */
  const ROSSO = ["#fff0e8", "#ffa090", "#ff4a3a", "#c01820", "#5a0a10"];
  const PAL_VERDE = {cols: VERDE, mano: VERDE_MANO, lampo: ["#2ed45c", "#d8ffb0"], filo: ["#7dff78", "#e2ffc2"], mote: ["#35d65e", "#e2ffc2"]};
  const PAL_ROSSO = {cols: ROSSO, mano: {cols: ROSSO, glow: ["#e02a2a", "#ffd0c0"]}, lampo: ["#e02a2a", "#ffd0c0"], filo: ["#ff6a60", "#ffd8d0"], mote: ["#ff3a3a", "#ffd0c0"]};

  /* drenaggio (dreno vitale, assorbi caratteristica, affamare, affaticare): il braccio si tende, un filo di luce guizza dalla mano al bersaglio e da li' un
     flusso di fuoco viene risucchiato verso chi lo usa: palline di fiamma che seguono un arco e svuotano chi e' afflitto. Parato: il flusso parte e si spegne
     a un quarto di strada; mancato: il filo cerca e non trova niente. `inverso`: il flusso va dall'altra parte, e' chi lo usa che espelle (affamare e
     affaticare: le palline partono dalla mano e vanno a riversarsi sul bersaglio). `P` = la palette (verde per la Necromanzia, rosso per Anatema). */
  function drenaggio(ev, h, P = PAL_VERDE, inverso = false) {
    const DUR = 1.15, tFilo = 0.16, colpito = h.colpito, parato = h.parato;
    fiammeMano(h, 0.5 + tFilo + DUR * 0.85, 1, ["dx"], P.mano);
    h.attacca({distanza: true, carica: 0.28, colpo: 0.12, tenuta: DUR + 0.25, recupero: 0.34, alFine: () => {},
      alColpoInizio() {
        const durata = tFilo + (colpito ? DUR : parato ? 0.45 : 0.3);
        const mote = [], bez = (a, c, b, u) => [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]];
        let acc = 0;
        fx.push({t: 0,
          passo(dt) {
            this.t += dt;
            const m = h.mano("dx"), flusso = (colpito && this.t > tFilo && this.t < tFilo + DUR * 0.8) || (parato && this.t > tFilo && this.t < tFilo + 0.22);
            if (flusso) {
              acc += (colpito ? 58 : 36) * dt;
              while (acc >= 1) {
                acc--;
                const a0 = h.bersaglio(), a = [a0[0] + rnd(-4, 4), a0[1] + rnd(-10, 10)];
                mote.push({t: 0, vita: rnd(0.5, 0.75), a, c: [(a[0] + m[0]) / 2 + rnd(-8, 8), Math.min(a[1], m[1]) - rnd(10, 30)], hist: []});
              }
            }
            for (let i = mote.length - 1; i >= 0; i--) {
              const q = mote[i];
              q.t += dt;
              const u = Math.pow(q.t / q.vita, 1.35), tope = parato && !inverso ? 0.28 : 1;
              q.p = inverso ? bez(m, q.c, q.a, Math.min(1, u)) : bez(q.a, q.c, m, Math.min(1, u));
              q.hist.push(q.p); if (q.hist.length > 5) q.hist.shift();
              if (Math.random() < 0.5) fiamma(h, q.p[0], q.p[1], rnd(-8, 8), rnd(-18, -4), {g: -30, vita: rnd(0.18, 0.32), s: 1, cols: P.cols});
              if (u >= tope) {
                if (u >= 1) { const e = inverso ? q.a : m; lampo(e[0], e[1], 5, 0.18, P.lampo[0], P.lampo[1]); }       // arriva: un guizzo (alla mano se risucchia, sul bersaglio se espelle)
                else h.particella({x: q.p[0], y: q.p[1], vx: rnd(-30, 30), vy: rnd(-40, 0), g: 200, s: 1, vita: 0.2, fade: 0.1, cols: P.cols, luce: true, davanti: true});    // parato: si spegne
                mote.splice(i, 1);
              }
            }
            return this.t < durata || mote.length > 0;
          },
          disegna(ctx) {
            const m = h.mano("dx"), a = h.bersaglio(), t = this.t, testa = lim(t / tFilo, 0, 1) * (colpito || parato ? 1 : 0.55);
            const al = colpito ? lim((tFilo + DUR - t) / 0.3, 0, 1) * 0.55 : lim((durata - t) / 0.2, 0, 1) * 0.55;       // il filo: resta finche' dura il flusso
            ctx.globalCompositeOperation = "lighter";
            if (al > 0) for (let i = 0; i <= 26; i++) {
              const u = i / 26 * testa, x = m[0] + (a[0] - m[0]) * u, y = m[1] + (a[1] - m[1]) * u, w = Math.sin(u * 14 + t * 55) * 2.2 * Math.sin(u * 3.14);
              ctx.globalAlpha = al; ctx.fillStyle = i % 3 ? P.filo[0] : P.filo[1];
              ctx.fillRect(Math.round(x), Math.round(y + w), 1, 1);
            }
            for (const q of mote) {
              if (!q.p) continue;
              q.hist.forEach((p, i) => disco(ctx, p[0], p[1], 0.8 + 0.5 * i / q.hist.length, P.mote[0], 0.4 * (i + 1) / q.hist.length, true));
              disco(ctx, q.p[0], q.p[1], 3.6, P.mote[0], 0.3, true); disco(ctx, q.p[0], q.p[1], 1.5, P.mote[1], 0.75, true);
            }
            ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
          }});
        h.futuro(tFilo, () => {
          h.contatto(null);
          if (colpito) bruciaCorpo(h, h.dif, DUR * 0.8, P.cols);
          else if (parato) h.particella({x: h.bersaglio()[0], y: h.bersaglio()[1], vx: 0, vy: 0, s: 3, vita: 0.14, fade: 0.1, col: P.filo[0], luce: true, davanti: true});
          h.futuro(colpito ? DUR + 0.2 : 0.55, h.fine);
        });
      }});
  }
  const dreno = (ev, h) => drenaggio(ev, h, PAL_VERDE, false);

  /* falce delle anime: nella mano destra compare una falce di fuoco verde, semitrasparente, che brucia lungo la lama; un fendente dall'alto, e al
     contatto la lama lascia nell'aria un arco di fuoco verde e dal colpito salgono anime. Poi la falce si dissolve in fiamme. */
  function falce(ev, h) {
    const DUR = 1.4, f = h.att.f, lama = arma(h, "falce", DUR, {alfa: 0.74, luce: 0.4});
    const m0 = h.mano("dx");
    scoppioVerde(h, m0[0], m0[1], 10, 0.8);
    emettitore(DUR, (dt, t) => {
      const k = lim(t / 0.15, 0, 1) * lim((DUR - t) / 0.2, 0, 1);
      for (let i = 0; i < 3; i++) if (Math.random() < 0.8 * k) {                       // fiamme lungo il filo della lama
        const a = rnd(0, 2.4), p = lama.mondo(29 + 15 * Math.cos(a), 22 + 15 * Math.sin(a));
        fiamma(h, p[0], p[1], rnd(-8, 8), -rnd(10, 36), {g: -40, vita: rnd(0.3, 0.55), s: Math.random() < 0.3 ? 2 : 1, cols: VERDE});
      }
      if (Math.random() < 0.5 * k) { const p = lama.mondo(rnd(4, 42), 23); fiamma(h, p[0], p[1], rnd(-5, 5), -rnd(8, 22), {g: -30, vita: rnd(0.25, 0.4), cols: VERDE}); }     // e lungo l'asta
    });
    h.attacca({stile: "fendente", carica: 0.34, colpo: 0.14, tenuta: 0.2, recupero: 0.4, alFine: () => {}, alContatto(info) {
      h.contatto(info);
      const p = h.impatto(info);
      fx.push({t: 0, passo(dt) { this.t += dt; return this.t < 0.38; },                  // l'arco lasciato dalla lama: un fendente dall'alto-dietro al basso-davanti
        disegna(ctx) {
          const t = this.t, testa = lim(t / 0.1, 0, 1), al = lim((0.38 - t) / 0.28, 0, 1), cx = p[0] - f * 10, cy = p[1] - 24, R = 30;
          ctx.globalCompositeOperation = "lighter";
          for (let i = 0; i <= 40; i++) {
            const u = i / 40;
            if (u > testa) break;
            const an = -2.0 + 2.45 * u, sp = 1 + 3 * Math.sin(u * 3.14) * (0.4 + 0.6 * u), x = cx + f * Math.cos(an) * R, y = cy + Math.sin(an) * R;
            ctx.fillStyle = "#35d65e"; ctx.globalAlpha = 0.45 * al; ctx.fillRect(Math.round(x - sp), Math.round(y - sp), sp * 2, sp * 2);
            ctx.fillStyle = "#e2ffc2"; ctx.globalAlpha = 0.85 * al; ctx.fillRect(Math.round(x - sp / 3), Math.round(y - sp / 3), Math.max(1, Math.round(sp * 0.7)), Math.max(1, Math.round(sp * 0.7)));
          }
          ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        }});
      if (h.colpito || h.parato) {
        scoppioVerde(h, p[0], p[1], h.colpito ? 14 : 7, h.colpito ? 1.1 : 0.6);
        if (h.colpito) anime(h, p[0], p[1], 9);
        h.scuoti(h.colpito ? 2.2 : 1);
      }
      h.futuro(0.55, h.fine);
    }});
  }

  /* pugno di roccia: l'avambraccio di chi colpisce diventa pietra (la texture della pietra al posto di pelle e vestiti) per la durata della mossa; il
     pugno e' quello di sempre, e al contatto la pietra scheggia e alza polvere */
  function pugnoRoccia(ev, h) {
    const lato = (h.base && h.base.mano) || "dx";
    h.pugno(lato, 1.2);
    emettitore(0.4, (dt, t) => {                                                       // mentre la pelle si indurisce: grani di pietra si staccano
      const m = h.mano(lato);
      if (Math.random() < 0.9) h.particella({x: m[0] + rnd(-6, 2) * h.att.f, y: m[1] + rnd(-4, 4), vx: rnd(-14, 14), vy: rnd(-26, 4), g: 180, s: 1, vita: rnd(0.2, 0.45), fade: 0.15, cols: ROCCIA, davanti: true});
    });
    h.attacca({alFine: () => {}, alContatto(info) {
      h.contatto(info);
      if (h.colpito || h.parato) {
        const p = h.impatto(info), k = h.colpito ? 1 : 0.6;
        for (let i = 0; i < 12 * k; i++) { const a = rnd(0, 6.2832), v = rnd(40, 160) * k; h.particella({x: p[0], y: p[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8 - 30, g: 520, attrito: 0.6, s: Math.random() < 0.4 ? 2 : 1, vita: rnd(0.3, 0.6), fade: 0.2, cols: ROCCIA, davanti: true}); }
        for (let i = 0; i < 5 * k; i++) h.particella({x: p[0] + rnd(-4, 4), y: p[1] + rnd(-3, 3), vx: rnd(-20, 20), vy: -rnd(8, 30), g: -8, attrito: 1, s: 2, vita: rnd(0.4, 0.8), fade: 0.3, cols: ["#a89c88", "#7a6e5c"], davanti: true});     // polvere
        h.scuoti(2.6 * k);
      }
      h.futuro(0.45, h.fine);
    }});
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* ELETTROCINESI E APPENDICI AFFILATE: scarica elettrica, fulmine, artigli affilati, artigli sanguinari, braccio lama */
  const ELETTRO = ["#ffffff", "#fff6a0", "#ffe250", "#ffb020"];                       // le scintille elettriche: dal bianco al giallo-arancio
  /* un rumore deterministico: i fulmini guizzano cambiando seme ogni tanto, non a ogni disegno (altrimenti tremolerebbero senza senso) */
  const sr = (s, i) => { const x = Math.sin(s * 127.1 + i * 311.7) * 43758.5453; return x - Math.floor(x); };

  /* la linea spezzata di un fulmine da (x0, y0) a (x1, y1): scarti di lato (`amp` px al massimo) che si spengono alle due estremita' */
  function spezzata(x0, y0, x1, y1, amp, seme) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, n = Math.max(3, Math.round(d / 6)), ux = dx / d, uy = dy / d, pts = [[x0, y0]];
    for (let i = 1; i < n; i++) {
      const u = i / n, o = (sr(seme, i) - 0.5) * 2 * amp * Math.min(1, u * 5, (1 - u) * 5);
      pts.push([x0 + dx * u - uy * o, y0 + dy * u + ux * o]);
    }
    pts.push([x1, y1]);
    return pts;
  }
  function linea(ctx, x0, y0, x1, y1, w) {                           // una retta a pixel (Bresenham), spessa `w`
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, o = w >> 1;
    let e = dx - dy;
    for (let n = 0; n < 400; n++) {
      ctx.fillRect(x0 - o, y0 - o, w, w);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 > -dy) { e -= dy; x0 += sx; }
      if (e2 < dx) { e += dx; y0 += sy; }
    }
  }
  function traccia(ctx, pts, w, col, a) {
    ctx.globalAlpha = a; ctx.fillStyle = col;
    for (let i = 0; i < pts.length - 1; i++) linea(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w);
  }
  function disegnaFulmine(ctx, pts, w, a = 1) {                       // l'alone (additivo), il corpo giallo e l'anima bianca
    ctx.globalCompositeOperation = "lighter";
    traccia(ctx, pts, w + 4, "#ff9a20", 0.14 * a); traccia(ctx, pts, w + 2, "#ffd23a", 0.3 * a);
    ctx.globalCompositeOperation = "source-over";
    traccia(ctx, pts, w, "#fff27a", 0.95 * a); traccia(ctx, pts, Math.max(1, w - 2), "#ffffff", a);
    ctx.globalAlpha = 1;
  }
  /* un fulmine vivo da `getA()` a `getB()` per `durata` secondi: parte dalla mano e arriva in `cresce` secondi, guizza (nuovo disegno ogni `ritmo`), con rami */
  function fulmineVivo(getA, getB, durata, o = {}) {
    const w = o.w ?? 2, amp = o.amp ?? 6, rami = o.rami ?? 2, cresce = o.cresce ?? 0.05, ritmo = o.ritmo ?? 0.04, dissolvi = o.dissolvi ?? 0.12, base = o.seme ?? 0;
    fx.push({t: 0, passo(dt) { this.t += dt; return this.t < durata; },
      disegna(ctx) {
        const A = getA(), B = getB(), seme = Math.floor(this.t / ritmo) + base, u = lim(this.t / cresce, 0, 1), al = lim((durata - this.t) / dissolvi, 0, 1);
        const E = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u], pts = spezzata(A[0], A[1], E[0], E[1], amp, seme);
        disegnaFulmine(ctx, pts, w, al);
        for (let k = 0; k < rami && pts.length > 3; k++) {              // i rami: brevi diramazioni da punti a caso
          const i = 1 + Math.floor(sr(seme, 50 + k) * (pts.length - 2)), p = pts[i], q = pts[i + 1];
          const an = Math.atan2(q[1] - p[1], q[0] - p[0]) + (sr(seme, 60 + k) < 0.5 ? -1 : 1) * (0.5 + 0.9 * sr(seme, 70 + k)), L = 9 + 14 * sr(seme, 80 + k);
          disegnaFulmine(ctx, spezzata(p[0], p[1], p[0] + Math.cos(an) * L, p[1] + Math.sin(an) * L, 2.5, seme + k), 1, al * 0.9);
        }
      }});
  }
  function scint(h, x, y, vx, vy, o = {}) {                           // una scintilla elettrica
    h.particella({x, y, vx, vy, g: o.g ?? 0, attrito: o.attrito ?? 3, s: o.s ?? 1, vita: o.vita ?? rnd(0.08, 0.2), fade: 0.06, cols: ELETTRO, luce: true, davanti: true});
  }
  function raggiera(h, x, y, n, forza = 1) {                          // una raggiera di scintille e il bagliore: dove cade una scarica
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.2832), v = rnd(50, 200) * forza; scint(h, x, y, Math.cos(a) * v, Math.sin(a) * v - 20, {s: Math.random() < 0.3 ? 2 : 1, vita: rnd(0.1, 0.28), g: 300}); }
    lampo(x, y, 8 * forza + 3, 0.18, "#ffd23a", "#ffffff");
  }
  /* la mano di chi lancia elettricita' crepita: scintille e un bagliore finche' dura la mossa */
  function scintilleMano(h, durata, forza = 1, lati = ["dx"]) {
    emettitore(durata, (dt, t) => {
      const f = lim((durata - t) / 0.3, 0, 1) * lim(t / 0.1, 0, 1) * forza;
      for (const l of lati) { const m = h.mano(l); if (Math.random() < 0.8 * f) scint(h, m[0] + rnd(-2, 2), m[1] + rnd(-2, 2), rnd(-40, 40), rnd(-50, 10), {vita: rnd(0.1, 0.22)}); }
    }, (ctx, t) => {
      const f = lim((durata - t) / 0.3, 0, 1) * lim(t / 0.1, 0, 1) * forza, seme = Math.floor(t / 0.05);
      ctx.globalCompositeOperation = "source-over";
      for (const [i, l] of lati.entries()) {
        const m = h.mano(l);
        disco(ctx, m[0], m[1], 5 + Math.sin(t * 50), "#ffd23a", 0.25 * f, true); disco(ctx, m[0], m[1], 2.4, "#ffffff", 0.4 * f, true);
        for (let j = 0; j < 2; j++) { const an = sr(seme, i * 5 + j) * 6.2832; if (sr(seme, i * 5 + j + 20) < 0.75 * f) disegnaFulmine(ctx, spezzata(m[0], m[1], m[0] + Math.cos(an) * 8, m[1] + Math.sin(an) * 8, 1.5, seme + j), 1, f); }
      }
    });
  }
  /* il corpo di chi e' colpito e' attraversato dalla corrente: archi corti e un bagliore sui pezzi indicati (di norma tutto il corpo) */
  function elettrizza(h, L, durata, pezzi) {
    pezzi = pezzi || ["testa", "busto_sup", "busto_inf", "avambraccio_dx", "avambraccio_sx", "coscia_dx", "coscia_sx", "stinco_dx", "stinco_sx"];
    const centro = (nome) => { const b = h.pose(L, nome); return h.aMondo(L, [b[0], b[1]]); };
    fx.push({t: 0, passo(dt) { this.t += dt; return this.t < durata; },
      disegna(ctx) {
        const k = lim((durata - this.t) / 0.25, 0, 1) * lim(this.t / 0.05, 0, 1), seme = Math.floor(this.t / 0.05);
        pezzi.forEach((nome, i) => {
          const c = centro(nome);
          disco(ctx, c[0], c[1], 7, "#ffd23a", 0.15 * k, true);
          for (let j = 0; j < 2; j++) {
            const a = sr(seme, i * 7 + j) * 6.2832, a2 = a + (sr(seme, i * 7 + j + 5) - 0.5) * 1.6, r = 6 + 7 * sr(seme, i * 7 + j + 3);
            disegnaFulmine(ctx, spezzata(c[0] + Math.cos(a) * 2, c[1] + Math.sin(a) * 2, c[0] + Math.cos(a2) * r, c[1] + Math.sin(a2) * r, 2, seme + i + j), 1, k);
          }
        });
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      }});
    emettitore(durata, (dt, t) => {
      const f = lim((durata - t) / 0.3, 0, 1);
      if (Math.random() < 0.7 * f) { const c = centro(pezzi[Math.floor(Math.random() * pezzi.length)]); scint(h, c[0] + rnd(-4, 4), c[1] + rnd(-5, 5), rnd(-70, 70), rnd(-90, 10), {g: 200, vita: rnd(0.12, 0.3)}); }
    });
  }

  /* scarica elettrica: chi la usa tende il braccio e una serie di scariche parte dalla mano e si pianta, una dopo l'altra, su ogni parte del corpo
     dell'avversario (testa, busto, le due braccia, le due gambe), con una raggiera di scintille e il corpo percorso dalla corrente. Parata: le scariche
     si schiantano sulla mano che para; schivata: si piantano a terra tutt'attorno a dove stava. */
  function scarica(ev, h) {
    const PARTI = ["testa", "busto_sup", "avambraccio_dx", "avambraccio_sx", "coscia_dx", "coscia_sx"], PASSO = 0.085;
    scintilleMano(h, 0.45 + PARTI.length * PASSO + 0.3, 1.1);
    h.attacca({distanza: true, carica: 0.3, colpo: 0.12, tenuta: 0.55, recupero: 0.36, alFine: () => {},
      alColpoInizio() {
        h.att.pup.spingiTutto(-30, 0);
        h.futuro(0.02, () => h.reazione());
        const b0 = h.bersaglio();
        PARTI.forEach((nome, i) => h.futuro(0.06 + i * PASSO, () => {
          let P;
          if (h.colpito) { const b = h.pose(h.dif, nome); P = h.aMondo(h.dif, [b[0], b[1]]); }
          else if (h.parato) { const a = h.bersaglio(); P = [a[0] + rnd(-5, 5), a[1] + rnd(-9, 9)]; }
          else P = [b0[0] + rnd(-24, 24), 109 + rnd(-1, 1)];
          fulmineVivo(() => h.mano("dx"), () => P, 0.22, {w: 1 + (i % 2), amp: 7, rami: 1, seme: i * 13});
          raggiera(h, P[0], P[1], h.colpito ? 8 : 5, 0.8);
          if (h.colpito) elettrizza(h, h.dif, 0.5, [nome]);
          if (i === 2) h.contatto(null);
          if (i === PARTI.length - 1) h.futuro(0.5, h.fine);
        }));
      }});
  }

  /* fulmine: chi lo usa unisce le mani davanti al petto e le carica di tanti fulmini (archi fra le due mani e attorno a ciascuna, scintille che convergono,
     il bagliore che cresce); poi tende il braccio e rilascia un unico fascio di fulmine, spesso e ramificato, che va a colpire l'avversario (e a
     scuoterlo da capo a piedi). Parato: il fascio si schianta sulla mano; schivato: passa oltre, dove stava. */
  function fulmine(ev, h) {
    const TC = 0.8, colpisce = h.colpito || h.parato;
    h.gesto("raccoglie", {durata: TC + 0.12});
    emettitore(TC, (dt, t) => {                                               // le scintille corrono verso le mani
      const k = lim(t / TC, 0, 1);
      for (const l of ["dx", "sx"]) {
        const m = h.mano(l);
        if (Math.random() < 0.3 + 0.7 * k) { const a = rnd(0, 6.2832), r = rnd(10, 20); scint(h, m[0] + Math.cos(a) * r, m[1] + Math.sin(a) * r, -Math.cos(a) * rnd(50, 110), -Math.sin(a) * rnd(50, 110), {vita: r / 80, attrito: 0}); }
      }
    }, (ctx, t) => {
      const k = lim(t / TC, 0, 1), seme = Math.floor(t / 0.045), mm = [h.mano("dx"), h.mano("sx")];
      ctx.globalCompositeOperation = "source-over";
      mm.forEach((m, i) => {
        disco(ctx, m[0], m[1], 4 + 8 * k, "#ffd23a", 0.18 + 0.2 * k, true); disco(ctx, m[0], m[1], 2 + 2.5 * k, "#ffffff", 0.35 + 0.3 * k, true);
        for (let j = 0, n = 2 + Math.floor(5 * k); j < n; j++) {
          const an = sr(seme, i * 9 + j) * 6.2832, L = 5 + 13 * k * (0.5 + sr(seme, i * 9 + j + 40));
          disegnaFulmine(ctx, spezzata(m[0], m[1], m[0] + Math.cos(an) * L, m[1] + Math.sin(an) * L, 2, seme + j), 1, 0.9);
        }
      });
      if (dist(mm[0], mm[1]) > 2) for (let j = 0; j < 1 + Math.floor(2 * k); j++) disegnaFulmine(ctx, spezzata(mm[0][0], mm[0][1], mm[1][0], mm[1][1], 2 + 3 * k, seme * 3 + j), 1 + (j === 0 ? 1 : 0), 0.95);
      ctx.globalAlpha = 1;
    });
    h.futuro(TC - 0.2, () => h.attacca({distanza: true, carica: 0.2, colpo: 0.1, tenuta: 0.95, recupero: 0.4, alFine: () => {},
      alColpoInizio() {
        const T = 0.62, tv = 0.07, a0 = h.bersaglio(), m0 = h.mano("dx"), d0 = dist(a0, m0) || 1, ux = (a0[0] - m0[0]) / d0, uy = (a0[1] - m0[1]) / d0;
        const fine = () => colpisce ? h.bersaglio() : [a0[0] + ux * 130, a0[1] + uy * 130];
        h.att.pup.spingiTutto(-70, 0);
        h.scuoti(2);
        h.reazione();
        raggiera(h, m0[0], m0[1], 14, 1.2);
        fulmineVivo(() => h.mano("dx"), fine, T, {w: 3, amp: 5, rami: 4, cresce: tv, seme: 5, ritmo: 0.035, dissolvi: 0.2});
        fulmineVivo(() => h.mano("dx"), fine, T - 0.1, {w: 1, amp: 11, rami: 1, cresce: tv, seme: 77});
        emettitore(T, (dt, t) => {                                              // scintille lungo il fascio
          const A = h.mano("dx"), B = fine(), f = lim((T - t) / 0.2, 0, 1);
          for (let i = 0; i < 3; i++) if (Math.random() < f) { const u = Math.random(); scint(h, A[0] + (B[0] - A[0]) * u + rnd(-3, 3), A[1] + (B[1] - A[1]) * u + rnd(-3, 3), rnd(-70, 70), rnd(-70, 70)); }
        });
        h.futuro(tv, () => {
          h.contatto(null);
          const B = fine();
          raggiera(h, B[0], B[1], colpisce ? 22 : 10, colpisce ? 1.5 : 0.9);
          lampo(B[0], B[1], 20, 0.35, "#ffd23a", "#ffffff");
          if (h.colpito) elettrizza(h, h.dif, 1.0);
          h.scuoti(3);
          emettitore(T - tv, (dt, t) => { if (Math.random() < 0.8) { const P = fine(); scint(h, P[0], P[1], rnd(-90, 90), rnd(-110, 0), {g: 300, vita: rnd(0.12, 0.3)}); } });
          h.futuro(T + 0.2, h.fine);
        });
      }}));
  }

  /* una striscia luminosa lasciata nell'aria da un fendente: i punti `pts` (a un pixel l'uno dall'altro) si accendono uno dopo l'altro (la testa corre in
     `corsa` secondi, dopo `ritardo`), la striscia e' sottile alle estremita' e piu' spessa a meta' (`sp`), poi svanisce */
  function striscia(pts, {ritardo = 0, corsa = 0.1, dur = 0.38, sp = 3, cols = ["#ffffff", "#bfe8ff", "#5fb8ff"], luce = true} = {}) {
    fx.push({t: -ritardo, passo(dt) { this.t += dt; return this.t < dur; },
      disegna(ctx) {
        if (this.t < 0) return;
        const testa = lim(this.t / corsa, 0, 1), al = lim((dur - this.t) / (dur * 0.7), 0, 1), n = pts.length;
        ctx.globalCompositeOperation = luce ? "lighter" : "source-over";
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1);
          if (u > testa) break;
          const s = Math.max(1, Math.round(sp * Math.pow(Math.sin(Math.PI * u), 0.6))), x = Math.round(pts[i][0]), y = Math.round(pts[i][1]), o = s >> 1;
          ctx.fillStyle = cols[2]; ctx.globalAlpha = 0.4 * al; ctx.fillRect(x - s, y - s, s * 2 + 1, s * 2 + 1);
          ctx.fillStyle = cols[1]; ctx.globalAlpha = 0.85 * al; ctx.fillRect(x - o, y - o, s, s);
          ctx.fillStyle = cols[0]; ctx.globalAlpha = al; ctx.fillRect(x - (s > 2 ? 1 : 0), y - (s > 2 ? 1 : 0), s > 2 ? 2 : 1, s > 2 ? 2 : 1);
        }
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      }});
  }
  const rettaPunti = (a, b, bow = 0) => {                              // una retta (con un po' di curva) da a a b, a un punto per pixel
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, n = Math.ceil(d), pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n, o = bow * Math.sin(Math.PI * u); pts.push([a[0] + dx * u - dy / d * o, a[1] + dy * u + dx / d * o]); }
    return pts;
  };
  const arcoPunti = (cx, cy, R, a0, a1, f) => {                       // un arco di cerchio (specchiato da `f`)
    const n = Math.ceil(R * Math.abs(a1 - a0)), pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + f * Math.cos(a) * R, cy + Math.sin(a) * R]); }
    return pts;
  };
  const SANGUE = ["#e03a2c", "#b3121b", "#7a0c10", "#4a0508"];
  function spruzzoSangue(h, x, y, n, dir, forza = 1) {                 // gocce di sangue che saltano in un ventaglio e cadono
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dir[1], dir[0]) + rnd(-0.8, 0.8), v = rnd(40, 170) * forza;
      h.particella({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 520, s: Math.random() < 0.3 ? 2 : 1, vita: rnd(0.4, 0.9), fade: 0.15, cols: SANGUE, davanti: true});
    }
  }
  const sanguina = (h) => !h.ev.protesi && h.ev.hp_persi > 0;           // il colpo ferisce la carne (una protesi non sanguina)

  /* artigli affilati: tre graffi paralleli in diagonale, sottili e chiari come lame, che si accendono uno dopo l'altro; scintille d'acciaio dove il colpo
     arriva (e qualche goccia se ferisce) */
  function artigliAffilati(ev, h) {
    h.attacca({stile: "pugno", alFine: () => {}, alContatto(info) {
      h.contatto(info);
      const p = h.impatto(info), f = h.att.f;
      for (const k of [-1, 0, 1]) {                                          // tre strisce parallele: la direzione e' in basso-avanti, le righe si spostano di lato
        const o = k * 6, a = [p[0] + f * (-12 - o * 0.78), p[1] - 17 + o * 0.63], b = [p[0] + f * (13 - o * 0.78), p[1] + 16 + o * 0.63];
        striscia(rettaPunti(a, b, 1.5), {ritardo: (k + 1) * 0.035, corsa: 0.08, dur: 0.34, sp: 2, cols: ["#ffffff", "#d7efff", "#7fb4e0"]});
      }
      const k = h.colpito ? 1 : h.parato ? 0.6 : 0.4;
      for (let i = 0; i < 9 * k + 2; i++) { const a = rnd(-0.4, 1.6), v = rnd(60, 190) * k; h.particella({x: p[0], y: p[1], vx: Math.cos(a) * v * h.att.f, vy: Math.sin(a) * v - 30, g: 300, attrito: 1.2, s: 1, vita: rnd(0.12, 0.3), fade: 0.1, cols: ["#ffffff", "#cfe8ff", "#8ab8e0"], luce: true, davanti: true}); }
      if (h.colpito && sanguina(h)) spruzzoSangue(h, p[0], p[1], 6, [-h.att.f * 0.4, -0.7], 0.8);
      if (h.colpito || h.parato) h.scuoti(1.2);
      h.futuro(0.5, h.fine);
    }});
  }

  /* artigli sanguinari: due fendenti rosso sangue che si incrociano (una X), larghi e un po' curvi, col centro caldo; uno spruzzo di sangue nel ventaglio del
     colpo e una macchia di gocce che cadono */
  function artigliSanguinari(ev, h) {
    h.attacca({alFine: () => {}, alContatto(info) {
      h.contatto(info);
      const p = h.impatto(info), f = h.att.f, col = ["#ffe6dc", "#ff4a3a", "#a01018"];
      striscia(rettaPunti([p[0] + f * -16, p[1] - 18], [p[0] + f * 16, p[1] + 17], 4), {corsa: 0.09, dur: 0.46, sp: 3, cols: col});
      striscia(rettaPunti([p[0] + f * -16, p[1] + 18], [p[0] + f * 16, p[1] - 17], -4), {ritardo: 0.09, corsa: 0.09, dur: 0.46, sp: 3, cols: col});
      const k = h.colpito ? 1 : h.parato ? 0.55 : 0.35;
      spruzzoSangue(h, p[0], p[1], Math.round(16 * k) + 3, [-f * 0.5, -0.6], 1.1 * k + 0.2);
      for (let i = 0; i < 8 * k; i++) h.futuro(rnd(0.05, 0.4), () => h.particella({x: p[0] + rnd(-9, 9), y: p[1] + rnd(-12, 10), vx: rnd(-8, 8), vy: rnd(0, 20), g: 480, s: 1, vita: rnd(0.4, 0.8), fade: 0.15, cols: SANGUE, davanti: true}));
      lampo(p[0], p[1], 12, 0.25, "#e02a2a", "#ffd0c0");
      if (h.colpito || h.parato) h.scuoti(h.colpito ? 2 : 1);
      h.futuro(0.55, h.fine);
    }});
  }

  /* braccio lama: l'avambraccio e' una lama, e il fendente e' un solo grande arco metallico, azzurro e bianco, con due archi fantasma che lo inseguono; al
     contatto un lampo orizzontale attraversa il bersaglio e saltano scintille d'acciaio */
  function braccioLama(ev, h) {
    h.attacca({stile: "affondo", alFine: () => {}, alContatto(info) {
      h.contatto(info);
      const p = h.impatto(info), f = h.att.f, cx = p[0] - f * 8, cy = p[1] - 22;
      striscia(arcoPunti(cx, cy, 33, -2.35, 0.55, f), {corsa: 0.1, dur: 0.42, sp: 5, cols: ["#ffffff", "#bff3ff", "#4aa8e8"]});
      striscia(arcoPunti(cx, cy, 29, -2.3, 0.5, f), {ritardo: 0.025, corsa: 0.1, dur: 0.34, sp: 3, cols: ["#e8fbff", "#7fd8ff", "#2f78c8"]});
      striscia(arcoPunti(cx, cy, 37, -2.25, 0.45, f), {ritardo: 0.05, corsa: 0.1, dur: 0.3, sp: 2, cols: ["#ffffff", "#9fe6ff", "#2f78c8"]});
      striscia(rettaPunti([p[0] - f * 22, p[1]], [p[0] + f * 22, p[1]]), {ritardo: 0.08, corsa: 0.05, dur: 0.2, sp: 2, cols: ["#ffffff", "#ffffff", "#9fe6ff"]});
      const k = h.colpito ? 1 : h.parato ? 0.7 : 0.4;
      for (let i = 0; i < 14 * k + 2; i++) { const a = rnd(0, 6.2832), v = rnd(60, 220) * k; h.particella({x: p[0], y: p[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 420, attrito: 1, s: Math.random() < 0.3 ? 2 : 1, vita: rnd(0.12, 0.32), fade: 0.1, cols: ["#ffffff", "#ffe9a0", "#ffc040"], luce: true, davanti: true}); }
      if (h.colpito && sanguina(h)) spruzzoSangue(h, p[0], p[1], 7, [-f * 0.4, -0.6], 0.9);
      lampo(p[0], p[1], 14, 0.2, "#7fd8ff", "#ffffff");
      if (h.colpito || h.parato) h.scuoti(h.colpito ? 2.6 : 1.2);
      h.futuro(0.55, h.fine);
    }});
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
    45: getto,                                                 // Idrocinesi: Getto d'Acqua
    46: (ev, h) => ondata(ev, h, {sprite: "onda", w: 72, h: 52, tArr: 1.25, scia: 2, schizzi: 110, forza: 1, scossa: 3.6, rombo: 0}),             // Idrocinesi: Onda Anomala
    47: (ev, h) => ondata(ev, h, {sprite: "maremoto", w: 128, h: 92, tArr: 1.55, scia: 4, schizzi: 240, forza: 1.5, scossa: 6.5, rombo: 1.1}),     // Idrocinesi: Maremoto
    3: devastante,                                             // Super Forza: Colpo Devastante
    41: sismica,                                               // Super Forza e Geocinesi: Ondata Sismica
    42: frana,                                                 // Super Forza e Geocinesi: Frana
    52: raffica,                                               // Super Soldato: Raffica controllata
    53: cecchino,                                              // Super Soldato: Tiro di precisione
    37: tocco,                                                 // Necromanzia: Tocco debilitante
    38: dreno,                                                 // Necromanzia: Dreno vitale
    39: falce,                                                 // Necromanzia: Falce delle anime
    40: pugnoRoccia,                                           // Geocinesi: Pugno di roccia
    8: scarica,                                                // Elettrocinesi: Scarica elettrica
    10: fulmine,                                               // Elettrocinesi: Fulmine
    11: artigliAffilati,                                       // Appendici Affilate: Artigli Affilati
    12: artigliSanguinari,                                     // Appendici Affilate: Artigli Sanguinari
    13: braccioLama,                                           // Appendici Affilate: Braccio Lama
    15: (ev, h) => drenaggio(ev, h, PAL_ROSSO, true),          // Anatema: Affamare (come il dreno vitale, ma rosso e al contrario: espelle)
    16: (ev, h) => drenaggio(ev, h, PAL_ROSSO, true),          // Anatema: Affaticare
    24: (ev, h) => drenaggio(ev, h, PAL_ROSSO, false),         // Anatema: Assorbi caratteristica (come il dreno vitale, ma rosso)
  };
  const ha = (ev) => ev && ev.att_id != null && ev.att_id in TAB;
  function avvia(ev, h) { TAB[ev.att_id](ev, h); }
  function passo(dt) { for (let i = fx.length - 1; i >= 0; i--) if (!fx[i].passo(dt)) fx.splice(i, 1); }
  function disegna(ctx) { for (const f of fx) if (f.disegna) f.disegna(ctx); }
  function dietro(ctx) { for (const f of fx) if (f.dietro) f.dietro(ctx); }               // cio' che sta dietro ai combattenti (l'onda che corre, le ombre dei massi)
  const reset = () => { fx.length = 0; };

  return {ha, avvia, passo, disegna, dietro, reset, ids: () => Object.keys(TAB).map(Number), conta: () => fx.length};
})();
if (typeof module !== "undefined") module.exports = Mosse;
