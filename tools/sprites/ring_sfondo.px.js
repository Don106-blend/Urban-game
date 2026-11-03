// Lo sfondo del ring nel duello (arena sotterranea): un muro di cemento con le corde del ring, le tribune dove sta la folla (la folla vera e'
// disegnata dal codice sopra a questo sfondo: `arena.js: disegnaFolla`), travi e lampade, neon e poster. Due immagini:
//   ring_sfondo  560x160, opaca. Il BORDO BASSO e' il pavimento: l'arena la posa con il fondo sulla linea dei piedi (pavY) a scala intera e,
//                se serve piu' larghezza, la ripete SPECCHIATA (le due estremita' non devono combaciare; niente scritte).
//   ring_luci    stessa tela, a pixel pieni su trasparente: coni delle lampade e aloni dei neon. L'arena la disegna in ADDITIVO con un po' di
//                trasparenza e la fa sfarfallare.
// `PXL build tools/sprites/ring_sfondo.px.js --out <cartella>` e si copiano `sprites/ring_*.png` in static/sprites/ring/ (STILE_SPRITE.md sez. 19).
const W = 560, H = 160

const hs = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
const vn = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
  const a = hs(xi, yi, s), b = hs(xi + 1, yi, s), c = hs(xi, yi + 1, s), d = hs(xi + 1, yi + 1, s), u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v }
const hex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16)) // soglie 0..1 per sfumare a punti

// tavolozza (la stessa famiglia dell'interfaccia: blu notte, volt, rosso pericolo)
const N0 = [8, 10, 15], N1 = [15, 19, 29], N2 = [24, 31, 46], N3 = [37, 48, 72], N4 = [58, 74, 108]
const K1 = [24, 28, 38], K2 = [34, 40, 54], K3 = [48, 57, 76], K4 = [70, 82, 106]            // cemento
const S1 = [118, 130, 158], S2 = [78, 88, 112], S3 = [48, 56, 76]                              // acciaio
const VO = [215, 255, 62], VO2 = [150, 190, 40], VO3 = [78, 100, 22]                            // volt
const RO = [255, 70, 85], RO2 = [184, 46, 60], RO3 = [104, 28, 38]                              // rosso
const LA = [255, 240, 194], LA2 = [255, 214, 120], LA3 = [196, 150, 62]                         // luce delle lampade
const BI = [232, 236, 244], BI2 = [160, 170, 190]                                               // corda bianca

const LAMPADE = [70, 190, 300, 420, 520], Y_LAMPADA = 15
const Y_CORDE = [86, 112, 138]                                                                 // altezza delle tre corde (dal bordo alto)
const NEON_CERCHIO = [150, 92], NEON_FRECCE = [405, 94]

sprite("ring_sfondo", { w: W, h: H }, (c) => {
  const P = (x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) c.px(x, y, typeof k === "string" ? k : hex(k)) }
  const R = (x, y, w, h, k) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P(x + i, y + j, k) }
  const linea = (x0, y0, x1, y1, k, sp = 1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; for (let a = 0; a < sp; a++) for (let b = 0; b < sp; b++) P(x + a, y + b, k) } }

  // ---- 1. l'aria dell'arena (in alto) e il cemento del muro (in basso)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let k
    if (y < 64) {                                                       // sala: notte blu con foschia che si addensa nelle tribune
      const t = y / 64, f = vn(x / 22, y / 11, 3), picco = Math.exp(-(((y - 38) / 15) ** 2))        // la sala e' piu' chiara dietro alla folla: le sagome scure spiccano
      k = mix(mix(N0, N2, t), [58, 76, 116], picco * (0.62 + 0.35 * f) + 0.03 * hs(x, y, 1))
    } else {                                                            // muro: cemento un po' piu' chiaro in alto (viene dalle luci), macchie d'umido
      const t = (y - 64) / (H - 64), f = vn(x / 7, y / 9, 5), g = vn(x / 31, y / 23, 9)
      k = mix(mix(K2, K1, t), K3, 0.2 * f * (1 - t) + 0.12 * g * (g > 0.55 ? 1 : 0))
      if (hs(x, y, 2) < 0.012) k = mix(k, K4, 0.5)
    }
    P(x, y, k)
  }

  // ---- 2. travi del soffitto e tubi
  R(0, 0, W, 4, S3); R(0, 0, W, 1, S2); R(0, 4, W, 1, N0)
  for (let x = -6; x < W; x += 16) { linea(x, 5, x + 8, 12, S3); linea(x + 8, 12, x + 16, 5, S3) }  // il traliccio
  R(0, 12, W, 2, S3); R(0, 12, W, 1, S2); R(0, 14, W, 1, N0)
  for (let x = 40; x < W; x += 96) { R(x, 4, 3, 10, S2); R(x, 4, 1, 10, S1) }                       // staffe

  // ---- 3. le tribune: tre gradini con la ringhiera; la folla (codice) sta in piedi sopra
  for (let i = 0; i < 70; i++) {                                         // luci lontane nella foschia (la sala e' enorme)
    const x = Math.floor(hs(i, 1, 31) * W), y = 17 + Math.floor(hs(i, 2, 31) * 24), k = hs(i, 3, 31) < 0.5 ? LA2 : hs(i, 4, 31) < 0.5 ? VO2 : RO2
    P(x, y, mix([58, 76, 116], k, 0.55)); if (hs(i, 5, 31) < 0.3) { P(x + 1, y, mix([58, 76, 116], k, 0.35)); P(x, y + 1, mix([58, 76, 116], k, 0.35)) }
  }
  for (const [yt, sp] of [[46, 0], [53, 1]]) {                           // i gradini: la folla (codice) sta in piedi sul primo
    R(0, yt, W, 7, mix(N3, N2, sp * 0.6)); R(0, yt, W, 1, S1); R(0, yt + 1, W, 1, mix(S2, N3, 0.4))
    for (let x = 0; x < W; x++) if (hs(x, yt, 4) < 0.07) P(x, yt + 3 + Math.floor(hs(x, yt, 6) * 3), N1)   // sedili
  }
  // la balaustra davanti alle tribune: cemento, striscia LED volt tratteggiata, imbottitura rossa
  R(0, 60, W, 10, K3); R(0, 60, W, 1, K4); R(0, 61, W, 1, K2)
  for (let x = 0; x < W; x++) { const on = ((x + 3) % 12) < 8; P(x, 63, on ? VO : VO3); if (on) P(x, 64, VO2) }
  R(0, 66, W, 4, RO3); R(0, 66, W, 1, RO2); R(0, 69, W, 1, N0)
  R(0, 70, W, 2, N0)                                                     // l'ombra sotto la balaustra

  // ---- 4. il muro di cemento: pannelli con le fughe, borchie, crepe
  for (let px = 0; px < W; px += 56) {
    R(px, 72, 1, 88, K1); R(px + 1, 72, 1, 88, K3)                        // fuga verticale (scura + bordo chiaro)
    for (const yy of [80, 150]) for (const xx of [px + 6, px + 50]) { R(xx, yy, 2, 2, K4); P(xx, yy + 1, K1) }   // borchie
  }
  R(0, 72, W, 1, K1); R(0, 73, W, 1, K3)
  for (let i = 0; i < 7; i++) {                                            // crepe che scendono
    let x = 20 + Math.floor(hs(i, 3, 11) * (W - 40)), y = 76 + Math.floor(hs(i, 4, 11) * 30)
    for (let k = 0; k < 16 + Math.floor(hs(i, 5, 11) * 20); k++) { P(x, y, K1); y += 1; x += hs(x, y, 13) < 0.5 ? 0 : (hs(x, y, 14) < 0.5 ? -1 : 1) }
  }
  // zoccolo di gomma in fondo (il bordo basso e' il pavimento)
  R(0, H - 5, W, 5, N0); R(0, H - 5, W, 1, S3); R(0, H - 4, W, 1, N1)

  // ---- 5. poster (senza scritte): un pugno rosso, un fulmine volt. Carta scrostata ai bordi.
  const poster = (x0, y0, w, h, fondo, disegna) => {
    R(x0 - 1, y0 - 1, w + 2, h + 2, N0); R(x0, y0, w, h, fondo)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hs(x0 + x, y0 + y, 21) < 0.07) P(x0 + x, y0 + y, mix(fondo, N0, 0.3))
    disegna(x0, y0, w, h)
    for (let x = 0; x < w; x++) if (hs(x, y0, 22) < 0.5) P(x0 + x, y0 + h - 1 - Math.floor(hs(x, 9, 23) * 3), K2)      // strappo in basso
  }
  poster(188, 82, 26, 36, N1, (x0, y0, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - w / 2, y - 14); if (d < 10) P(x0 + x, y0 + y, d < 7 ? RO : RO2) }
    R(x0 + 9, y0 + 22, 9, 9, N0); R(x0 + 10, y0 + 22, 7, 2, RO2); for (let i = 0; i < 4; i++) R(x0 + 10 + i * 2, y0 + 20, 2, 3, N0)   // un pugno stilizzato
    R(x0 + 2, y0 + h - 5, w - 4, 1, RO)
  })
  poster(352, 80, 22, 40, N0, (x0, y0, w, h) => {
    const bolt = [[11, 4], [5, 18], [10, 18], [8, 34], [18, 14], [12, 14], [16, 4]]
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {                                               // il fulmine (poligono pieno, test punto-in-poligono)
      let dentro = false
      for (let i = 0, j = bolt.length - 1; i < bolt.length; j = i++) { const [xi, yi] = bolt[i], [xj, yj] = bolt[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro }
      if (dentro) P(x0 + x, y0 + y, y < 18 ? VO : VO2)
    }
  })

  // ---- 6. neon (le forme; l'alone sta in ring_luci): un cerchio volt col fulmine rosso, e due frecce che puntano al ring
  { const [cx, cy] = NEON_CERCHIO
    for (let a = 0; a < 6.2832; a += 0.02) { P(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, VO); P(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, VO2) }
    linea(cx + 3, cy - 9, cx - 4, cy + 1, RO, 2); linea(cx - 4, cy + 1, cx + 4, cy + 1, RO, 2); linea(cx + 4, cy + 1, cx - 3, cy + 10, RO, 2)
    R(cx - 1, cy - 14, 2, 2, S2); R(cx - 1, cy + 13, 2, 2, S2) }                                          // i supporti
  { const [fx, fy] = NEON_FRECCE
    for (const dx of [0, 13]) { linea(fx + dx, fy - 12, fx + dx + 8, fy, VO, 2); linea(fx + dx + 8, fy, fx + dx, fy + 12, VO, 2) }
    R(fx - 6, fy - 16, 2, 34, S3); R(fx + 28, fy - 16, 2, 34, S3) }

  // ---- 7. lampade industriali appese alle travi: cavo, cappello a cono, lampadina
  for (const lx of LAMPADE) {
    R(lx, 14, 1, Y_LAMPADA - 14 + 3, S2)
    for (let i = 0; i < 6; i++) R(lx - 3 - i, Y_LAMPADA + 3 + i, 7 + 2 * i, 1, i === 0 ? S1 : i < 4 ? S2 : S3)   // il cappello (trapezio)
    R(lx - 2, Y_LAMPADA + 10, 5, 2, LA); R(lx - 1, Y_LAMPADA + 12, 3, 1, LA2)
  }

  // ---- 8. le corde del ring: rossa, bianca, rossa, dietro ai combattenti (le tiene il codice, qui solo le corde). Luce sopra, ombra sotto.
  Y_CORDE.forEach((y, i) => {
    const base = i === 1 ? [190, 196, 212] : [176, 48, 62], luce = i === 1 ? [232, 236, 246] : [222, 112, 122], ombra = i === 1 ? [112, 120, 142] : [104, 30, 42]   // corde un po' spente: non devono competere coi combattenti
    for (let x = 0; x < W; x++) {
      const tw = ((x + i * 2) % 6) < 3                                    // i trefoli: la luce e l'ombra si alternano di un pixel ogni tre
      P(x, y - 1, tw ? luce : base); P(x, y, tw ? base : luce); P(x, y + 1, tw ? ombra : base); P(x, y + 2, ombra); P(x, y + 3, N0)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------------
// ring_luci: coni delle lampade (a puntini di Bayer: il cono sfuma senza gradienti) e aloni dei neon
sprite("ring_luci", { w: W, h: H }, (c) => {
  const P = (x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) c.px(x, y, hex(k)) }
  const punto = (x, y, t, k) => { if (t > BAYER[y & 3][x & 3]) P(x, y, k) }
  for (const lx of LAMPADE) {
    for (let y = Y_LAMPADA + 12; y < H - 6; y++) {
      const d = y - (Y_LAMPADA + 12), semi = 5 + d * 0.62, fade = Math.pow(1 - d / (H - 30), 1.4)
      for (let x = Math.floor(lx - semi); x <= Math.ceil(lx + semi); x++) { const lat = 1 - Math.abs(x - lx) / semi; if (lat > 0) punto(x, y, 0.85 * fade * Math.pow(lat, 0.7), LA2) }
    }
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { const d = Math.hypot(x, y) / 9; if (d < 1) punto(lx + x, Y_LAMPADA + 11 + y, 1 - d, LA) }   // l'alone della lampadina
  }
  const alone = (cx, cy, r, k) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y) / r; if (d < 1) punto(cx + x, cy + y, 0.8 * (1 - d), k) } }
  alone(NEON_CERCHIO[0], NEON_CERCHIO[1], 30, VO); alone(NEON_CERCHIO[0], NEON_CERCHIO[1], 16, RO)
  alone(NEON_FRECCE[0] + 10, NEON_FRECCE[1], 30, VO)
})
