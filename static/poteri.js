/* Urban — l'aspetto dei poteri nel duello (STILE_SPRITE.md sez. 18). Un potere acceso si vede sul corpo e attorno al corpo, e gli aspetti
   si SOMMANO: un eroe con quattro poteri accesi li mostra tutti e quattro. Qui sta tutto cio' che e' solo grafica: i materiali della pelle
   (pietra, ossidiana, lava, cristallo), le sfere e i detriti che orbitano, le aure sulle mani, i fulmini, il campo di forza, la neve e le onde
   soniche. Il resto lo fa `arena.js`, che lo chiama in pochi punti (se questo file manca il gioco funziona lo stesso, senza effetti).

   Da dove arrivano i dati: `pannello().extra` (app.py) porta `poteri` = {id del potere: rango} dei poteri ACCESI e `stance_poteri` = gli id dei
   poteri con una stance in corso; ogni colpo e ogni stance portano `poteri` = i poteri accesi che hanno quella mossa. Per l'armatura di Pelle
   Invincibile si guarda `hp[loc].arm` (a 0 in quella locazione il materiale sparisce).
   Tutto si disegna nello spazio di `mondo(L)` (pixel dello sprite, +x verso l'avversario), quindi lo specchio della CPU e' gratis.
   Gli effetti "quando usi una mossa o una stance" (Assorbi Energia, Anatema, Super Soldato) si accendono con la mossa e con la stance in corso. */
const Poteri = (() => {
  const DT = 1 / 60;
  const ID = {PELLE: 1, PIRO: 3, ASSORBI: 4, ELETTRO: 5, APPENDICI: 6, ANATEMA: 8, URLO: 9, CAMPO: 13, SOLDATO: 14, HYDRO: 15, CRIO: 16, ACIDO: 17,
              TELE: 18, NECRO: 19, GEO: 20};
  const GRIGI = {38: "k", 106: "a", 142: "b", 178: "c", 216: "d"};     // gli indici dello sprite base (canale R), come in arena.js
  const CUCITURA = 70;                                                  // il sesto indice dei pezzi rinforzati: la commessura tra le piastre
  const TONI = ["k", "a", "b", "c", "d"], IDX = {k: 0, a: 1, b: 2, c: 3, d: 4};
  const LOCS = ["testa", "busto", "braccio_dx", "braccio_sx", "gamba_dx", "gamba_sx"];

  const lim = (x, a, b) => Math.min(b, Math.max(a, x));
  const hash = (x, y, s) => {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vn = (x, y, s) => {                                             // value noise (come in arena.js: macchie coerenti)
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* MATERIALI DELLA PELLE (Pelle Invincibile): rango 1 pietra, 2 ossidiana, 3 ossidiana con vene di lava (sui pezzi rinforzati), 4 cristalli
     verde acqua (sui rinforzati). Si colora lo sprite a indici: l'indice da' la luce (k contorno, a ombra, b base, c luce, d riflesso), la
     texture sposta il tono di un gradino o cambia colore (lava, fessure). Il rumore e' calcolato sulle coordinate dello sprite INTERO, cosi'
     le due meta' di un arto si leggono continue. */
  const RAMPE = {
    1: {k: [30, 28, 27], a: [82, 80, 76], b: [120, 118, 111], c: [158, 155, 146], d: [198, 194, 182]},          // pietra
    2: {k: [9, 5, 15], a: [28, 17, 46], b: [45, 29, 74], c: [80, 55, 124], d: [152, 122, 210]},                 // ossidiana
    4: {k: [4, 46, 50], a: [12, 104, 100], b: [30, 172, 152], c: [96, 228, 204], d: [214, 255, 243]},            // cristallo verde acqua
  };
  const LAVA = {nucleo: [255, 233, 132], mezzo: [255, 142, 32], orlo: [198, 54, 12], buio: [88, 20, 8]};
  const scala = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const tono = (R, g, t) => R[TONI[lim(IDX[g] + t, 1, 4)]];

  function pietra(g, x, y, s) {
    const R = RAMPE[1];
    if (g === "k" || g === "m") return g === "m" ? scala(R.k, 1.1) : R.k;
    const n = 0.6 * vn(x / 1.7, y / 1.7, s + 11) + 0.4 * hash(x, y, s + 13);
    if (Math.abs(vn(x / 4.6, y / 4.6, s + 17) - 0.5) < 0.02 && g !== "d") return R.k;       // crepe sottili
    return tono(R, g, n < 0.22 ? -1 : n > 0.8 ? 1 : 0);                                       // macchie: un gradino piu' scuro o piu' chiaro
  }

  function ossidiana(g, x, y, s, lava, fase = 0) {
    const R = RAMPE[2];
    if (g === "k") return R.k;
    if (lava) {                                                                                // vene di lava: nelle commessure e lungo i filoni
      const v = Math.abs(vn(x / 4.2, y / 4.2, s + 21) - 0.5);                                  // poche vene lunghe, non coriandoli
      const h = g === "m" ? 0 : v / 0.04;                                                      // 0 = nel mezzo del filone
      if (g === "m" || h < 1) {
        const c = g === "m" || h < 0.35 ? LAVA.nucleo : h < 0.7 ? LAVA.mezzo : LAVA.orlo;
        const pulsa = 0.78 + 0.34 * vn(x / 3.4 + fase * 0.5, y / 3.4 - fase * 0.35, s + 51);          // la lava respira: il bagliore scorre lungo le vene
        const q = scala(c, (g === "a" ? 0.72 : 1) * pulsa);
        return [Math.min(255, q[0]), Math.min(255, q[1]), Math.min(255, q[2])];
      }
    } else if (g === "m") return scala(R.k, 1.6);
    const n = vn(x / 2, y / 2, s + 29), lucido = ((x * 0.9 + y * 0.55) % 9 + 9) % 9 < 1;       // lucido come il vetro: strisce oblique di riflesso
    return tono(R, g, lucido && g !== "a" ? 1 : n < 0.14 ? -1 : hash(x, y, s + 31) < 0.015 ? 2 : 0);
  }

  function cella(x, y, sz, s) {                                                                // celle di Voronoi: le facce del cristallo
    const gx = Math.floor(x / sz), gy = Math.floor(y / sz);
    let d1 = 9, d2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = gx + i, cy = gy + j, d = Math.hypot(x - (cx + hash(cx, cy, s + 33)) * sz, y - (cy + hash(cx, cy, s + 37)) * sz);
      if (d < d1) { d2 = d1; d1 = d; id = hash(cx, cy, s + 41); } else if (d < d2) d2 = d;
    }
    return {id, bordo: d2 - d1};
  }
  function cristallo(g, x, y, s, fase = 0) {
    const R = RAMPE[4];
    if (g === "k") return R.k;
    if (g === "m") return [6, 70, 80];
    const q = cella(x, y, 4.4, s);
    let t = q.id < 0.22 ? -1 : q.id > 0.78 ? 1 : 0;
    if (q.bordo < 0.6) t += 1;                                                                 // lo spigolo tra due facce prende luce
    if (hash(x, y, s + 61 + (fase >> 1)) < 0.013) return [255, 255, 255];                             // scintillio: qualche pixel si accende e si spegne
    return tono(R, g, t);
  }

  /* il colore di un pixel di un pezzo: g = indice dello sprite ("m" = commessura), x e y = coordinate dello sprite intero */
  function colore(rango, g, x, y, seme, fase) {
    return rango <= 1 ? pietra(g, x, y, seme) : rango === 2 ? ossidiana(g, x, y, seme, false) : rango === 3 ? ossidiana(g, x, y, seme, true, fase) : cristallo(g, x, y, seme, fase);
  }

  /* colora `img` ({w, h, px}: RGBA di uno sprite a indici) nella tela `cv` col materiale del rango. `y0` = riga dello sprite intero da cui parte il pezzo
     (e `mx`, `my` il margine dei pezzi rinforzati: le loro coordinate si riportano su quelle del pezzo base, cosi' il rumore e' lo stesso) */
  function coloraMateriale(cv, img, rango, {y0 = 0, mx = 0, my = 0, seme = 0, fase = 0} = {}) {
    const cx = cv.getContext("2d"), out = cx.createImageData(img.w, img.h);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      if (!img.px[i + 3]) continue;
      const r = img.px[i], g = r === CUCITURA ? "m" : (GRIGI[r] || "b");
      const c = colore(rango, g, x - mx, y + y0 - my, seme, fase);
      out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255;
    }
    cx.putImageData(out, 0, 0);
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* STATO DI UN COMBATTENTE */
  const nuovo = () => ({ids: {}, eff: {}, vis: {}, fuori: {}, pronto: false, fase: 0, stance: new Set(), pelle: {}, app: false, mossa: {}, k: {}, t: Math.random() * 10, part: [], neve: null, teschi: [], fulm: 0});

  /* dallo stato del duello (`pg.extra`, `pg.hp`): quali poteri sono accesi e a che rango, quali hanno una stance in corso, dove la pelle e' ancora
     corazzata (armatura > 0 in quella locazione, e la locazione non e' storpia ne' a zero) */
  function aggiorna(L, pg) {
    const po = L.po || (L.po = nuovo()), ex = (pg && pg.extra) || {}, vecchi = po.ids, prima = po.pronto;
    po.pronto = true;
    po.ids = {};
    for (const [id, rango] of Object.entries(ex.poteri || {})) po.ids[+id] = +rango;
    // dissolvenze: un potere appena acceso compare piano (le orbite si allargano), uno spento svanisce invece di sparire: `eff` = acceso + in uscita
    for (const id of Object.keys(vecchi)) if (!(id in po.ids)) po.fuori[id] = vecchi[id];
    for (const id of Object.keys(po.ids)) { delete po.fuori[id]; if (!(id in po.vis)) po.vis[id] = prima ? 0 : 1; }
    po.eff = {...po.fuori, ...po.ids};
    po.stance = new Set((ex.stance_poteri || []).map(Number));
    po.pelle = {};
    const rp = po.ids[ID.PELLE];
    if (rp) for (const loc of LOCS) {
      const h = pg.hp && pg.hp[loc];
      if (h && h.arm > 0 && h.val > 0 && !h.crippled) po.pelle[loc] = rp;
    }
    po.app = !!po.ids[ID.APPENDICI];
    for (const id of Object.keys(po.ids)) if (!(id in po.k)) po.k[id] = 0;
  }

  /* una stringa che cambia quando cambia come un pezzo deve essere disegnato (serve a `applicaPg` per sapere se ridisegnarlo) */
  function chiave(L, loc, nome) {
    const po = L.po;
    if (!po) return "";
    return (po.pelle[loc] ? "P" + po.pelle[loc] : "") + (po.app && /^avambraccio_/.test(nome) ? "A" : "");
  }
  const rangoPelle = (L, loc) => (L.po && L.po.pelle[loc]) || 0;
  const lama = (L, nome) => !!(L.po && L.po.app && /^avambraccio_/.test(nome));

  /* una mossa o una stance di questi poteri e' in uso: gli effetti "quando usi..." si accendono per `durata` secondi */
  function mossa(L, ids, durata = 1.1) {
    if (!ids || !ids.length) return;
    const po = L.po || (L.po = nuovo());
    for (const id of ids) po.mossa[id] = Math.max(po.mossa[id] || 0, durata);
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* SPRITE degli effetti: piccole tele disegnate a pixel una volta sola, con le stesse regole del resto (niente antialiasing, pochi toni) */
  const cache = {};
  const tela = (w, h) => Object.assign(document.createElement("canvas"), {width: w, height: h});
  const memo = (k, fn) => cache[k] || (cache[k] = fn());
  const rgb = (c, a = 1) => a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  const SFERE = {                                               // nucleo, centro, bordo, orlo
    fuoco: [[255, 250, 214], [255, 205, 72], [255, 120, 20], [190, 36, 10]],
    blu: [[246, 253, 255], [140, 222, 255], [44, 120, 255], [22, 52, 170]],
    acqua: [[232, 253, 255], [128, 230, 242], [40, 160, 214], [20, 88, 150]],
    acido: [[248, 255, 214], [190, 244, 80], [98, 198, 44], [44, 120, 24]],
  };
  const ALONE = {fuoco: [255, 120, 30], blu: [60, 130, 255], acqua: [60, 190, 235], acido: [140, 235, 60]};

  /* una sfera di raggio r (px) a 3 fotogrammi. Il fuoco ha una lingua di fiamma che sale e ondeggia (la palla e' un fuoco, non un disco); l'acqua
     e l'acido hanno il fondo piu' scuro e un riflesso a mezzaluna. `ax`/`ay` = il centro della palla nella tela (da li' si ancora). */
  function sfera(r, tipo, fr) {
    return memo(`s${r}${tipo}${fr}`, () => {
      const fuoco = tipo === "fuoco" || tipo === "blu", alto = fuoco ? Math.round(1.9 * r) : 0, T = SFERE[tipo];
      const W = 2 * r + 5, H = 2 * r + 5 + alto, ax = W / 2, ay = alto + r + 2.5, cv = tela(W, H), cx = cv.getContext("2d");
      cv.ax = ax; cv.ay = ay;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - ax, dy = y + 0.5 - ay, a = Math.atan2(dy, dx);
        const rr = r + 0.5 + (fuoco ? 0.7 * (vn(Math.cos(a) * 2 + fr * 3.1, Math.sin(a) * 2 + fr * 1.7, 5) - 0.5) * 2 : 0), d = Math.hypot(dx, dy) / rr;
        let k = -1;
        if (d <= 1) {
          k = d < 0.38 ? 0 : d < 0.68 ? 1 : d < 0.9 ? 2 : 3;
          if (!fuoco) { if (dx + dy > r * 0.5 && d > 0.55) k = 3; if (dx + dy < -r * 0.4 && d > 0.3 && d < 0.8 && dx - dy < 0.5 * r) k = 0; }
        } else if (fuoco && dy < 0) {                                                    // la lingua: si stringe verso l'alto e dondola da un fotogramma all'altro
          const h = -dy / (1.9 * r + 0.5);
          if (h < 1) {
            const mezzo = r * 0.85 * Math.pow(1 - h, 1.15) + (vn(x * 0.45 + fr * 2.3, y * 0.45 - fr * 1.9, 9) - 0.5) * 1.5, mx = Math.abs(dx - (fr - 1) * 0.35 * h * r);
            if (mx < mezzo) { const e = mx / mezzo; k = e < 0.35 && h < 0.55 ? 1 : e < 0.7 ? 2 : 3; }
          }
        }
        if (k >= 0) { cx.fillStyle = rgb(T[k]); cx.fillRect(x, y, 1, 1); }
      }
      return cv;
    });
  }
  function alone(r, tipo) {                                    // un bagliore a gradini: si disegna in ADDITIVO (illumina, non sporca)
    return memo(`a${r}${tipo}`, () => {
      const D = 2 * r + 1, cv = tela(D, D), cx = cv.getContext("2d"), col = ALONE[tipo] || tipo;
      for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
        const d = Math.hypot(x + 0.5 - D / 2, y + 0.5 - D / 2) / (D / 2);
        if (d > 1) continue;
        cx.fillStyle = rgb(col, d < 0.22 ? 0.36 : d < 0.42 ? 0.24 : d < 0.6 ? 0.14 : d < 0.78 ? 0.07 : 0.03); cx.fillRect(x, y, 1, 1);   // cala piano: niente bordo netto
      }
      return cv;
    });
  }
  let FADE = 1;                                                // dissolvenza dell'effetto che si sta disegnando (0..1): la moltiplicano tutte le primitive
  function disegnaSprite(ctx, cv, x, y, a = 1, luce = false) {
    ctx.globalAlpha = a * FADE;
    if (luce) ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(cv, Math.round(x - (cv.ax != null ? cv.ax : cv.width / 2)), Math.round(y - (cv.ay != null ? cv.ay : cv.height / 2)));
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
  function pixel(ctx, x, y, col, a = 1, s = 1) { ctx.globalAlpha = a * FADE; ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), s, s); }

  /* sprite a griglia di caratteri (`.` vuoto) con una mappa carattere -> colore */
  function griglia(righe, mappa) {
    const cv = tela(righe[0].length, righe.length), cx = cv.getContext("2d");
    righe.forEach((r, y) => [...r].forEach((ch, x) => { if (mappa[ch]) { cx.fillStyle = rgb(mappa[ch]); cx.fillRect(x, y, 1, 1); } }));
    return cv;
  }
  const TESCHIO = ["..ooooo..", ".obbbbbo.", "obbbbbbbo", "obeebeebo", "obeebeebo", "obbbnbbbo", ".obbbbbo.", "..ottoto.", "...ooooo."];
  const OSSO = {o: [38, 32, 22], b: [232, 224, 192], e: [16, 14, 10], n: [70, 62, 44], t: [210, 202, 168]};
  const teschio = (occhi) => memo("tes" + occhi, () => griglia(TESCHIO, {...OSSO, e: occhi || OSSO.e}));
  const SASSI = [                                              // k contorno, c luce (in alto a sinistra), b base, s ombra
    ["...kkkkk..", "..kccbbbk.", ".kcccbbbsk", "kccbbbbbsk", "kcbbbbbssk", "kbbbbbsssk", ".kbbsssskk", "..kkkkkk.."],
    ["..kkkk.", ".kccbbk", "kccbbsk", "kcbbssk", ".kbsskk", "..kkk.."],
    ["..kkkk..", ".kccbbk.", "kccbbbsk", "kcbbbssk", ".kbsssk.", "..kkkk.."],
    ["..kkk..", ".kccbk.", "kcbbbsk", ".kbbssk", "..kkkk."],
    [".kkk.", "kcbbk", "kbbsk", "kbssk", ".kkk."],
    [".kkk..", "kcbbk.", "kbbssk", ".kkkk."],
    ["kcb.", "bssk", ".kk."],
    ["kk.", "kck", "bsk"],
  ];
  const SASSO = {k: [38, 32, 28], c: [196, 182, 158], b: [138, 124, 106], s: [88, 78, 66]};
  const sasso = (i) => memo("sasso" + i, () => griglia(SASSI[i], SASSO));
  const FIAMMA = [[".g.", "ggg", "gGg", ".G."], ["g..", "ggg", "GgG", ".G."], [".g.", ".gg", "gGg", "G.G"]];     // le fiamme verdi del teschio (3 fotogrammi)
  const fiamma = (f) => memo("fia" + f, () => griglia(FIAMMA[f], {g: [120, 255, 110], G: [38, 170, 60]}));

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* ANCORAGGI (nello spazio di L) e particelle */
  const centro = (L, A) => { const a = A.pos(L, "busto_sup"), b = A.pos(L, "busto_inf"); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  function mano(L, A, lato, interp = true) {                    // il centro della mano: un po' prima del polso, lungo l'avambraccio
    const p = A.punto(L, "avambraccio_" + lato, "polso_" + lato, interp), g = A.punto(L, "avambraccio_" + lato, "gomito_" + lato, interp);
    return [p[0] + (g[0] - p[0]) * 0.14, p[1] + (g[1] - p[1]) * 0.14];
  }
  function braccio(L, A, lato, t, interp = true) {              // un punto dell'avambraccio (0 = gomito, 1 = polso)
    const p = A.punto(L, "avambraccio_" + lato, "polso_" + lato, interp), g = A.punto(L, "avambraccio_" + lato, "gomito_" + lato, interp);
    return [g[0] + (p[0] - g[0]) * t, g[1] + (p[1] - g[1]) * t];
  }
  function particella(po, o) { po.part.push({vita: 0.6, fade: 0.25, s: 1, g: 0, vx: 0, vy: 0, ...o}); if (po.part.length > 260) po.part.shift(); }
  function avanzaParticelle(po) {
    for (let i = po.part.length - 1; i >= 0; i--) {
      const q = po.part[i];
      q.vita -= DT; q.vy += q.g * DT; q.x += q.vx * DT; q.y += q.vy * DT;
      if (q.vita <= 0) po.part.splice(i, 1);
    }
  }
  function disegnaParticelle(ctx, po) {
    for (const q of po.part) pixel(ctx, q.x, q.y, q.col, Math.min(1, q.vita / q.fade), q.s);
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* ORBITE: sfere e detriti attorno al corpo. Un punto dell'ellisse e' "davanti" al corpo quando sta nella metà bassa (piu' vicino a chi guarda):
     da li' si decide se disegnarlo prima del corpo (dietro) o dopo (davanti). */
  function puntoOrbita(c, rx, ry, th, inclina) { return [c[0] + rx * Math.cos(th), c[1] + ry * Math.sin(th) + inclina * rx * Math.cos(th)]; }

  /* l'elenco degli oggetti in orbita di L, ricalcolato a ogni disegno: {id, x, y, fronte, sprite, scia: [punti] ...}. Un potere appena acceso parte con
     l'orbita stretta e la allarga (vis 0 -> 1); ogni sfera si porta dietro la scia dei punti che ha appena percorso. */
  function orbitanti(L, A) {
    const po = L.po, t = po.t, c = centro(L, A), out = [];
    const vis = (id) => po.vis[id] == null ? 1 : po.vis[id];
    const orbita = (id, n, rx, ry, w, inclina, quota, fn, scia = 0) => {
      const k = 0.55 + 0.45 * vis(id);
      for (let i = 0; i < n; i++) {
        const th = w * t + (i * 2 * Math.PI) / n, P = (q) => puntoOrbita([c[0], c[1] + quota], rx * k, ry * k, q, inclina), [x, y] = P(th), sg = [];
        for (let j = 1; j <= scia; j++) sg.push(P(th - Math.sign(w) * j * 0.12));
        out.push({id, x, y, scia: sg, fronte: Math.sin(th) > 0, ...fn(i, th)});
      }
    };
    const fr = (i, rapido = 5) => Math.floor(t * 60 / rapido + i) % 3;
    if (po.eff[ID.PIRO]) {                                      // pirocinesi: 1 piccola, 1 grande, 2 grandi, 2 grandi e blu
      const r = po.eff[ID.PIRO], tipo = r >= 4 ? "blu" : "fuoco", raggio = r >= 2 ? 5 : 3;
      orbita(ID.PIRO, r >= 3 ? 2 : 1, 23, 10, 2.3, -0.22, -2, (i) => ({sprite: sfera(raggio, tipo, fr(i)), alone: alone(raggio + 5, tipo), fuoco: tipo, raggio}), 7);
    }
    for (const [id, tipo, w, inclina, rx, ry] of [[ID.HYDRO, "acqua", -1.9, 0.2, 25, 11], [ID.ACIDO, "acido", 1.6, 0.16, 27, 12]]) {
      const r = po.eff[id];
      if (!r) continue;
      if (r < 4) orbita(id, r, rx, ry, w, inclina, 2, () => ({sprite: sfera(4, tipo, 0), alone: alone(7, tipo), liquido: tipo}), 6);      // 1, 2, 3 sfere
      else {                                                                                                 // rango 4: un flusso continuo che si avvolge
        const N = 40, k = 0.55 + 0.45 * vis(id);
        for (let i = 0; i < N; i++) {
          const th = w * t - i * 0.14 * Math.sign(w), onda = 2.4 * Math.sin(th * 2 + t * 3), rr = i < 3 ? 3 : i < N - 12 ? 4 : i < N - 6 ? 3 : i < N - 2 ? 2 : 1;
          const [x, y] = puntoOrbita([c[0], c[1] + 2 + onda], rx * k, ry * k, th, inclina);
          out.push({id, x, y, fronte: Math.sin(th) > 0, sprite: sfera(Math.min(rr, 3), tipo, 0), alone: i % 6 === 0 && i < N - 8 ? alone(6, tipo) : null, scia: [], liquido: tipo, flusso: true});
        }
      }
    }
    if (po.eff[ID.GEO]) {                                       // geocinesi: rocce e detriti a distanze e velocita' diverse
      const r = po.eff[ID.GEO], N = 3 + r, k = 0.55 + 0.45 * vis(ID.GEO);
      for (let i = 0; i < N; i++) {
        const s = hash(i, 3, 7), rx = (15 + 17 * hash(i, 5, 7)) * k, w = (hash(i, 9, 7) < 0.5 ? -1 : 1) * (1.0 + 1.5 * hash(i, 11, 7));
        const th = w * t + 6.28 * hash(i, 13, 7), [x, y] = puntoOrbita([c[0], c[1] - 14 + 38 * hash(i, 17, 7)], rx, rx * 0.42, th, (s - 0.5) * 0.3);
        out.push({id: ID.GEO, x, y, scia: [], fronte: Math.sin(th) > 0, sprite: sasso([0, 2, 1, 3, 4, 2, 5, 6][i % 8])});
      }
      for (let i = 0; i < 6; i++) {                             // polvere di roccia: pixel che girano piu' vicino
        const rx = (12 + 20 * hash(i, 21, 7)) * k, th = (1.7 + hash(i, 23, 7)) * t * (i % 2 ? 1 : -1) + 6.28 * hash(i, 25, 7);
        const [x, y] = puntoOrbita([c[0], c[1] - 20 + 44 * hash(i, 27, 7)], rx, rx * 0.4, th, 0);
        out.push({id: ID.GEO, x, y, scia: [], fronte: Math.sin(th) > 0, polvere: true});
      }
    }
    return out;
  }

  function disegnaOrbitante(ctx, o, dietro, po) {
    FADE = po.vis[o.id] == null ? 1 : po.vis[o.id];
    const a = dietro ? 0.68 : 1;                                // quello che passa dietro il corpo e' piu' scuro
    if (o.polvere) { pixel(ctx, o.x, o.y, dietro ? "#6e6454" : "#b4a68e", 1); FADE = 1; ctx.globalAlpha = 1; return; }
    const n = o.scia.length;
    o.scia.forEach(([sx, sy], j) => {                           // la scia: fuoco = braci che si spengono e salgono, acqua e acido = gocce che si assottigliano
      const f = 1 - (j + 1) / (n + 1);
      if (o.fuoco) { const T = SFERE[o.fuoco], col = f > 0.66 ? T[1] : f > 0.33 ? T[2] : T[3]; pixel(ctx, sx - (f > 0.5 ? 1 : 0), sy - j * 0.8 - (f > 0.5 ? 1 : 0), rgb(col), 0.85 * f * a, f > 0.5 ? 2 : 1); }
      else if (o.liquido) { const T = SFERE[o.liquido], col = f > 0.5 ? T[1] : T[2]; pixel(ctx, sx - (f > 0.55 ? 1 : 0), sy - (f > 0.55 ? 1 : 0), rgb(col), 0.7 * f * a, f > 0.55 ? 2 : 1); }
    });
    if (o.alone) disegnaSprite(ctx, o.alone, o.x, o.y, a, true);
    disegnaSprite(ctx, o.sprite, o.x, o.y, a);
    FADE = 1;
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* TESCHI (necromanzia): seguono l'eroe con un ritardo (molla), rango 2 aura verde, rango 3 fiamme verdi, rango 4 tre teschi */
  const POSTI_TESCHI = [[-23, 4], [-33, 21], [-13, -15]];
  function passoTeschi(L, A) {
    const po = L.po, r = po.eff[ID.NECRO] || 0, n = r ? (r >= 4 ? 3 : 1) : 0;
    if (po.teschi.length > n) po.teschi.length = n;
    const h = A.punto(L, "testa", "collo_alto", false);
    while (po.teschi.length < n) {
      const [ox, oy] = POSTI_TESCHI[po.teschi.length];
      po.teschi.push({x: h[0] + ox, y: h[1] + oy, vx: 0, vy: 0});
    }
    po.teschi.forEach((s, i) => {
      const [ox, oy] = POSTI_TESCHI[i], bx = h[0] + ox, by = h[1] + oy + 2.6 * Math.sin(po.t * 1.9 + i * 2.1);
      s.vx += (60 * (bx - s.x) - 9 * s.vx) * DT; s.vy += (60 * (by - s.y) - 9 * s.vy) * DT;
      s.x += s.vx * DT; s.y += s.vy * DT;
      if (r >= 3 && Math.random() < 0.3) particella(po, {x: s.x + (Math.random() - 0.5) * 8, y: s.y - 2, vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 14, vita: 0.55, fade: 0.3,
                                                        col: Math.random() < 0.5 ? "#78ff6e" : "#26aa3c"});
    });
  }
  function disegnaTeschi(ctx, L) {
    const po = L.po, r = po.eff[ID.NECRO] || 0;
    po.teschi.forEach((s, i) => {
      if (r >= 2) {                                                                              // aura verde (pulsa)
        const p = 0.8 + 0.2 * Math.sin(po.t * 5 + i);
        disegnaSprite(ctx, alone(r >= 3 ? 12 : 10, [90, 255, 100]), s.x, s.y, p, true);
      }
      if (r >= 3) {                                                                              // una corona di fiamme verdi: sempre rivolte in su, piu' alte di lato e dietro
        for (let k = 0; k < 7; k++) {
          const th = (k / 7) * 6.28 + 0.3 * Math.sin(po.t * 2 + k), fx = s.x + 6.2 * Math.cos(th), fy = s.y + 4.6 * Math.sin(th) - 2.5 - (Math.sin(th) < 0 ? 1 : 0);
          const fi = fiamma(Math.floor(po.t * 11 + k * 1.7) % 3), dietro = Math.sin(th) < 0;
          ctx.globalAlpha = (dietro ? 0.7 : 1) * FADE;
          ctx.drawImage(fi, Math.round(fx - 1.5), Math.round(fy - 2));
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = FADE;
      ctx.drawImage(teschio(r >= 2 ? [150, 255, 130] : null), Math.round(s.x - 4.5), Math.round(s.y - 4.5));
      ctx.globalAlpha = 1;
      if (r >= 2) disegnaSprite(ctx, alone(2, [120, 255, 110]), s.x - 2, s.y - 0.5, 0.8, true), disegnaSprite(ctx, alone(2, [120, 255, 110]), s.x + 2, s.y - 0.5, 0.8, true);   // gli occhi brillano
    });
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* FULMINI: segmenti spezzati disegnati a pixel da (x, y) in direzione `ang`. Si rilanciano ogni 4 fotogrammi (il seme cambia) cosi' guizzano. */
  function segmento(ctx, x0, y0, x1, y1, col, a) {              // linea di Bresenham a pixel pieni
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx - dy;
    for (let n = 0; n < 64; n++) {
      pixel(ctx, x0, y0, col, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 > -dy) { e -= dy; x0 += sx; }
      if (e2 < dx) { e += dx; y0 += sy; }
    }
  }
  function fulmine(ctx, x, y, ang, lung, seme, col) {          // col = [bagliore, corpo, anima]
    const n = Math.max(3, Math.round(lung / 3.2)), pts = [[x, y]];
    let px = x, py = y;
    for (let i = 1; i <= n; i++) {
      const a = ang + (hash(seme, i, 3) - 0.5) * 1.5, l = lung / n;
      px += Math.cos(a) * l; py += Math.sin(a) * l;
      pts.push([px, py]);
    }
    for (let i = 0; i < n; i++) {
      segmento(ctx, pts[i][0] + 1, pts[i][1], pts[i + 1][0] + 1, pts[i + 1][1], col[0], 0.35);        // il bagliore (un pixel di lato)
      segmento(ctx, pts[i][0], pts[i][1] + 1, pts[i + 1][0], pts[i + 1][1] + 1, col[0], 0.35);
      segmento(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], col[1], 1);
    }
    for (let i = 1; i < n; i += 2) pixel(ctx, pts[i][0], pts[i][1], col[2], 1);
    if (hash(seme, 99, 5) < 0.45 && n > 3) {                                                         // un ramo
      const [bx, by] = pts[2], a = ang + (hash(seme, 98, 5) < 0.5 ? -1 : 1) * (0.7 + 0.5 * hash(seme, 97, 5));
      segmento(ctx, bx, by, bx + Math.cos(a) * lung * 0.4, by + Math.sin(a) * lung * 0.4, col[1], 0.85);
    }
  }
  const COL_FULMINE = {
    elettro: [[255, 226, 80], [255, 246, 150], [255, 255, 255]],
    anatema: [[110, 40, 190], [190, 110, 255], [240, 214, 255]],
    soldato: [[255, 52, 20], [255, 134, 40], [255, 226, 150]],
  };
  const rgbs = (c) => c.map((v) => rgb(v));
  const FULM = {elettro: rgbs(COL_FULMINE.elettro), anatema: rgbs(COL_FULMINE.anatema), soldato: rgbs(COL_FULMINE.soldato)};
  const rnd = (b, i, j, s) => hash(b * 131 + i, j * 17 + s, 777);

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* UN PASSO (60 Hz fissi, lo chiama arena.js per ogni combattente): intensita' degli effetti "a mossa", particelle, teschi, neve */
  function passo(L, A) {
    const po = L.po;
    if (!po) return;
    po.t += DT;
    for (const id of Object.keys(po.eff)) {                                       // dissolvenza: sale in ~0,3 s, scende in ~0,2 s e poi l'effetto sparisce davvero
      const su = id in po.ids ? 1 : 0, v = po.vis[id] == null ? su : po.vis[id];
      po.vis[id] = v + (su - v) * (1 - Math.exp(-DT * (su ? 3.5 : 5.5)));
      if (!su && po.vis[id] < 0.03) { delete po.fuori[id]; delete po.vis[id]; delete po.eff[id]; }
    }
    // la lava pulsa e i cristalli scintillano: ogni 8 passi l'arena ridisegna i pezzi di rango 3 e 4 con una fase nuova (si salta se non serve)
    if (Math.round(po.t / DT) % 8 === 0 && A.rinfresca && Object.values(po.pelle).some((r) => r >= 3)) { po.fase++; A.rinfresca(L, po.fase); }
    for (const id of Object.keys(po.mossa)) { po.mossa[id] -= DT; if (po.mossa[id] <= 0) delete po.mossa[id]; }
    const vivo = !L.ko && !(L.pup && L.pup.morto);
    for (const id of [ID.ASSORBI, ID.ANATEMA, ID.SOLDATO]) {                      // si accendono con una mossa o con una stance in corso
      const on = vivo && po.eff[id] && (po.stance.has(id) || po.mossa[id] > 0) ? 1 : 0;
      po.k[id] += (on - (po.k[id] || 0)) * (1 - Math.exp(-DT * (on ? 12 : 4)));
    }
    if (!vivo || !L.pup) { po.part.length = 0; return; }
    avanzaParticelle(po);
    // braci e gocce: nascono dalle sfere che orbitano
    if (po.eff[ID.PIRO] || po.eff[ID.HYDRO] || po.eff[ID.ACIDO] || po.eff[ID.GEO]) {
      for (const o of orbitanti(L, A)) {
        if (o.fuoco && Math.random() < 0.4) particella(po, {x: o.x + (Math.random() - 0.5) * 3, y: o.y, vx: (Math.random() - 0.5) * 14, vy: -10 - Math.random() * 16, vita: 0.5, fade: 0.3,
                                                          col: o.fuoco === "blu" ? (Math.random() < 0.5 ? "#9fe0ff" : "#3a7bff") : (Math.random() < 0.5 ? "#ffc43d" : "#ff6a14")});
        else if (o.liquido && !o.flusso && Math.random() < 0.05) particella(po, {x: o.x, y: o.y + 2, vx: 0, vy: 6, g: 260, vita: 0.45, fade: 0.2, col: o.liquido === "acqua" ? "#7ec8ff" : "#a8f04e"});
        else if (o.flusso && Math.random() < 0.03) particella(po, {x: o.x, y: o.y + 1, vy: 4, g: 240, vita: 0.4, fade: 0.2, col: o.liquido === "acqua" ? "#9fd8ff" : "#b6f04a"});
        else if (o.polvere === undefined && o.sprite && !o.fuoco && !o.liquido && Math.random() < 0.06) particella(po, {x: o.x, y: o.y + 2, vy: 8, g: 90, vita: 0.5, fade: 0.25, col: "#8a7e6a"});
      }
    }
    const h = A.punto(L, "testa", "collo_alto", false);
    if (po.eff[ID.TELE] && Math.random() < 0.18) particella(po, {x: h[0] + (Math.random() - 0.5) * 14, y: h[1] - 4 + Math.random() * 8, vx: (Math.random() - 0.5) * 6, vy: -9 - Math.random() * 8,
                                                                  vita: 0.8, fade: 0.4, col: Math.random() < 0.5 ? "#c58bff" : "#8a46d8"});
    if (po.k[ID.ASSORBI] > 0.3 && Math.random() < 0.5) {
      const m = mano(L, A, Math.random() < 0.5 ? "dx" : "sx", false);
      particella(po, {x: m[0] + (Math.random() - 0.5) * 8, y: m[1] + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 10, vy: -12 - Math.random() * 14, vita: 0.6, fade: 0.3,
                      col: Math.random() < 0.5 ? "#d4ecff" : "#9fd0ff"});
    }
    passoTeschi(L, A);
    passoNeve(L, A);
  }

  /* NEVE (criocinesi): fiocchi che cadono su tutta l'arena attorno all'eroe, dal cielo fino a terra dove si sciolgono. Coordinate di L. */
  function passoNeve(L, A) {
    const po = L.po;
    if (!po.eff[ID.CRIO]) { po.neve = null; return; }
    const bx = A.pos(L, "busto_inf")[0], N = 46 + 18 * (po.eff[ID.CRIO] - 1);
    if (!po.neve) {
      po.neve = [];
      for (let i = 0; i < N; i++) po.neve.push(nuovoFiocco(bx, -10 + 118 * Math.random()));      // gia' in aria: la neve non comincia da zero
    }
    while (po.neve.length < N) po.neve.push(nuovoFiocco(bx, -14 - 6 * Math.random()));
    for (let i = po.neve.length - 1; i >= 0; i--) {
      const f = po.neve[i];
      if (f.sciolto > 0) { f.sciolto -= DT; if (f.sciolto <= 0) po.neve.splice(i, 1); continue; }
      f.fase += DT * f.freq;
      f.x += (Math.sin(f.fase) * 7 + 3.5) * DT; f.y += f.vy * DT;
      if (f.y >= 109.5) { f.y = 110; f.sciolto = 0.5; }
    }
  }
  const nuovoFiocco = (bx, y) => ({x: bx - 80 + 160 * Math.random(), y, vy: 15 + 22 * Math.random(), fase: 6.28 * Math.random(), freq: 1 + 1.4 * Math.random(),
                                   grande: Math.random() < 0.2, dietro: Math.random() < 0.3, azzurro: Math.random() < 0.35, sciolto: 0});
  function disegnaNeve(ctx, po, dietro) {
    if (!po.neve) return;
    for (const f of po.neve) {
      if (f.dietro !== dietro) continue;
      const a = f.sciolto > 0 ? f.sciolto / 0.5 * 0.8 : dietro ? 0.55 : 0.9;
      pixel(ctx, f.x, f.y, f.azzurro ? "#bfe4ff" : "#ffffff", a, f.grande ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* CAMPO DI FORZA: una bolla attorno all'eroe, a righe di pixel (riempimento chiaro, orlo piu' forte, un riflesso che scorre). Si accende di
     piu' quando il corpo viene colpito (`lamp`: il lampo del colpo, 1 -> 0). */
  function disegnaCampo(ctx, L, A) {
    const c = centro(L, A), lampo = Math.max(0, ...Object.values(L.lamp || {})), t = L.po.t, F = FADE;
    const rx = 31, ry = 59, cy = c[1] + 5, cx = c[0] + 2;
    let prec = null;
    for (let y = Math.ceil(cy - ry); y <= Math.min(110, Math.floor(cy + ry)); y++) {
      const dy = (y + 0.5 - cy) / ry, hw = rx * Math.sqrt(Math.max(0, 1 - dy * dy)), x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
      ctx.globalAlpha = (0.07 + 0.35 * lampo) * F; ctx.fillStyle = "#7be0ff";
      ctx.fillRect(x0, y, x1 - x0, 1);
      // il reticolo: puntini a nido d'ape che si accendono a caso (l'energia che scorre nella bolla)
      ctx.fillStyle = "#bff3ff";
      for (let x = x0 + 2; x < x1 - 2; x++) if ((x + (Math.floor(y / 5) % 2) * 3) % 6 === 0 && y % 5 === 0) { ctx.globalAlpha = (0.1 + 0.3 * (hash(x, y, Math.floor(t * 3)) < 0.18 ? 1 : 0) + 0.3 * lampo) * F; ctx.fillRect(x, y, 1, 1); }
      ctx.globalAlpha = (0.55 + 0.4 * lampo) * F; ctx.fillStyle = "#c8f6ff";            // l'orlo: raccorda con la riga prima, niente buchi
      const w0 = prec ? Math.max(1, prec[0] - x0 + 1) : x1 - x0, w1 = prec ? Math.max(1, x1 - prec[1] + 1) : 0;
      ctx.fillRect(x0, y, w0, 1);
      if (w1) ctx.fillRect(x1 - w1, y, w1, 1);
      // il riflesso: brevi fasce oblique che scorrono lungo l'orlo (come il vetro curvo), non righe che attraversano tutto
      ctx.globalAlpha = (0.3 + 0.3 * lampo) * F; ctx.fillStyle = "#ffffff";
      for (let x = x0 + 1; x < x1 - 1; x++) if (Math.min(x - x0, x1 - 1 - x) < 8 && (((x + y * 0.8 - t * 15) % 64) + 64) % 64 < 4.5) ctx.fillRect(x, y, 1, 1);
      prec = [x0, x1];
    }
    // l'impronta a terra: un anello schiacciato che pulsa (la meta' vicina e' piu' marcata)
    ctx.fillStyle = "#c8f6ff";
    for (let a = 0; a < 6.283; a += 0.03) { ctx.globalAlpha = ((Math.sin(a) > 0 ? 0.3 : 0.12) + 0.1 * Math.sin(t * 3) + 0.3 * lampo) * F; ctx.fillRect(Math.round(cx + Math.cos(a) * rx * 0.9), Math.round(110 + Math.sin(a) * 2.4), 1, 1); }
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* IL DISEGNO: `dietro` prima del corpo, `davanti` dopo. A = {ctx, pos(L, corpo), punto(L, corpo, giunto, interp)} (arena.js). */
  function disegnaAura(ctx, x, y, r, col, a) { disegnaSprite(ctx, alone(r, col), x, y, a, true); }
  const vis = (po, id) => po.vis[id] == null ? 1 : po.vis[id];

  function dietro(L, A) {
    const po = L.po;
    if (!po || L.ko || (L.pup && L.pup.morto)) return;
    const ctx = A.ctx;
    FADE = vis(po, ID.CRIO); disegnaNeve(ctx, po, true);
    FADE = vis(po, ID.NECRO); if (po.eff[ID.NECRO]) disegnaTeschi(ctx, L);
    FADE = 1;
    if (po.eff[ID.PIRO] || po.eff[ID.HYDRO] || po.eff[ID.ACIDO] || po.eff[ID.GEO]) for (const o of orbitanti(L, A)) if (!o.fronte) disegnaOrbitante(ctx, o, true, po);
    FADE = 1; ctx.globalAlpha = 1;
  }

  function davanti(L, A) {
    const po = L.po;
    if (!po || L.ko || (L.pup && L.pup.morto)) return;
    const ctx = A.ctx, t = po.t, b = Math.floor(t * 15);
    FADE = vis(po, ID.CAMPO); if (po.eff[ID.CAMPO]) disegnaCampo(ctx, L, A);
    FADE = 1;
    if (po.eff[ID.PIRO] || po.eff[ID.HYDRO] || po.eff[ID.ACIDO] || po.eff[ID.GEO]) for (const o of orbitanti(L, A)) if (o.fronte) disegnaOrbitante(ctx, o, false, po);
    // aure sulle mani e sulla testa
    const k = (id) => po.k[id] || 0;
    if (k(ID.ASSORBI) > 0.02) for (const lato of ["dx", "sx"]) {
      const m = mano(L, A, lato), p = k(ID.ASSORBI) * (0.8 + 0.2 * Math.sin(t * 9 + (lato === "dx" ? 0 : 2)));
      disegnaAura(ctx, m[0], m[1], 9, [170, 214, 255], p);
      disegnaAura(ctx, m[0], m[1], 5, [226, 243, 255], p * 0.9);
    }
    if (po.eff[ID.TELE]) {
      FADE = vis(po, ID.TELE);
      const h = A.pos(L, "testa"), p = 0.82 + 0.18 * Math.sin(t * 4.3);
      disegnaAura(ctx, h[0] + 1, h[1] - 1, 15, [168, 88, 255], p);
      disegnaAura(ctx, h[0] + 1, h[1] - 1, 8, [214, 160, 255], p * 0.8);
      for (const lato of ["dx", "sx"]) { const m = mano(L, A, lato); disegnaAura(ctx, m[0], m[1], 9, [168, 88, 255], p); disegnaAura(ctx, m[0], m[1], 5, [214, 160, 255], p * 0.8); }
      FADE = 1;
    }
    // fulmini: sempre dalle mani (elettrocinesi), dagli avambracci quando si usa l'anatema, dal corpo col super soldato
    if (po.eff[ID.ELETTRO]) {
      FADE = vis(po, ID.ELETTRO);
      const n = po.eff[ID.ELETTRO] >= 3 ? 3 : 2;
      for (const [li, lato] of [[0, "dx"], [1, "sx"]]) {
        const m = mano(L, A, lato);
        disegnaSprite(ctx, alone(4, [255, 226, 110]), m[0], m[1], 0.55 + 0.4 * rnd(b, 5, li, 11), true);          // il bagliore della scintilla
        for (let i = 0; i < n; i++) fulmine(ctx, m[0], m[1], -2.6 + 3.4 * rnd(b, i, li, 1), 6 + 8 * rnd(b, i, li, 2), b * 7 + i * 3 + li, FULM.elettro);
      }
      FADE = 1;
    }
    if (k(ID.ANATEMA) > 0.25) {
      const n = Math.round(1 + 2 * k(ID.ANATEMA));
      for (const [li, lato] of [[0, "dx"], [1, "sx"]]) for (let i = 0; i < n; i++) {
        const o = braccio(L, A, lato, 0.15 + 0.85 * rnd(b, i, li, 3));
        disegnaSprite(ctx, alone(3, [150, 70, 230]), o[0], o[1], 0.7 * k(ID.ANATEMA), true);
        fulmine(ctx, o[0], o[1], 6.28 * rnd(b, i, li, 4), 9 + 9 * rnd(b, i, li, 5), b * 11 + i * 5 + li, FULM.anatema);
      }
    }
    if (k(ID.SOLDATO) > 0.25) {
      const n = Math.round(3 + 4 * k(ID.SOLDATO)), parti = [["busto_sup", null], ["busto_inf", null], ["testa", null], ["avambraccio_dx", "polso_dx"], ["avambraccio_sx", "polso_sx"], ["coscia_dx", null], ["stinco_dx", null]];
      for (let i = 0; i < n; i++) {
        const [corpo] = parti[Math.floor(rnd(b, i, 8, 6) * parti.length)], p = A.pos(L, corpo);
        disegnaSprite(ctx, alone(3, [255, 90, 30]), p[0] + (rnd(b, i, 8, 7) - 0.5) * 8, p[1] + (rnd(b, i, 8, 8) - 0.5) * 12, 0.6 * k(ID.SOLDATO), true);
        fulmine(ctx, p[0] + (rnd(b, i, 8, 7) - 0.5) * 8, p[1] + (rnd(b, i, 8, 8) - 0.5) * 12, 6.28 * rnd(b, i, 8, 9), 8 + 10 * rnd(b, i, 8, 10), b * 13 + i, FULM.soldato);
      }
    }
    FADE = 1; disegnaParticelle(ctx, po);
    FADE = vis(po, ID.CRIO); disegnaNeve(ctx, po, false);
    FADE = 1; ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------------------------------------------------------------------------- */
  /* ONDE SONICHE (super urlo): archi che si aprono a ventaglio lungo la traiettoria di un proiettile {x, y, vx, vy, t, t0} (coordinate del mondo). */
  function disegnaOnda(ctx, q) {
    const dir = Math.atan2(q.vy, q.vx), dx = Math.cos(dir), dy = Math.sin(dir), eta = (q.t0 || 0.3) - q.t;
    for (let k = 0; k < 4; k++) {
      const r = 5 + k * 4 + eta * 18, fx = q.x - dx * k * 6, fy = q.y - dy * k * 6, ext = 0.95 - 0.05 * k;
      const cx = fx - dx * r, cy = fy - dy * r, a = Math.max(0.12, 0.95 - 0.22 * k - Math.max(0, eta - 0.18) * 0.6);
      const col = k === 0 ? "#ffffff" : k === 1 ? "#d8f2ff" : "#9fd8ff", pas = 1 / r;
      for (let u = -ext; u <= ext; u += pas) pixel(ctx, cx + Math.cos(dir + u) * r, cy + Math.sin(dir + u) * r, col, a);
    }
    ctx.globalAlpha = 1;
  }

  return {ID, aggiorna, chiave, rangoPelle, lama, coloraMateriale, mossa, passo, dietro, davanti, disegnaOnda, CUCITURA};
})();
if (typeof module !== "undefined") module.exports = Poteri;
