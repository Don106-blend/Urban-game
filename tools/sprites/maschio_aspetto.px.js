// Aspetto del corpo base maschile: 16 capigliature, 3 maglie, 3 pantaloni, e le due texture dei colori.
// Si costruisce TUTTO con questo file (include il corpo base, quindi un solo `pxl build` rigenera ogni PNG).
// Regole (palette a indici, luce, contorno, overlay per pezzo): STILE_SPRITE.md, sezioni 4, 5, 8 e 13.
// I PNG sono a 5 grigi-indice come il corpo (k contorno, a ombra, b base, c luce, d riflesso): arena.js li ricolora con una
// rampa ricavata da un colore preso dalle texture `colori_capelli` / `colori_vestiti`.
include("maschio_base.px.js", { palette: true })

{
  // ---------------------------------------------------------------------------------------------------------------
  // utilita': celle in coordinate della TESTA (x verso il viso, y verso il basso; 0,0 = angolo alto-sinistro di testa.png)
  const bande = (keys) => { const out = []; const y0 = keys[0][0]
    lerp(keys).forEach(([a, b], i) => { for (let x = a; x <= b; x++) out.push([x, y0 + i]) })
    return out }
  const uni = (...liste) => liste.flat()
  const disco = (cx, cy, r) => { const o = []
    for (let y = Math.floor(cy - r) - 1; y <= Math.ceil(cy + r) + 1; y++) for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r) + 1; x++)
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) o.push([x, y])
    return o }
  // un tubo lungo una spezzata, con raggio da r0 a r1 (code, trecce, chignon)
  const tubo = (pts, r0, r1) => { const o = []; let lung = 0
    for (let i = 0; i < pts.length - 1; i++) lung += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
    let fatto = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], l = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(l * 2)
      for (let s = 0; s <= n; s++) { const t = s / n, r = r0 + (r1 - r0) * ((fatto + l * t) / lung); o.push(...disco(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r)) }
      fatto += l
    }
    return o }
  // dove finisce il viso: per ogni riga, l'ultima colonna dove i capelli possono arrivare (attaccatura)
  const ATT = { 4: 13, 5: 12, 6: 11, 7: 10, 8: 9, 9: 8, 10: 6, 11: 4, 12: 4, 13: 3 }
  const sulViso = (x, y) => y >= 4 && x > (ATT[y] ?? 3)
  const nelCranio = dentro(headSpans)                         // pixel della pelle della testa (senza il contorno)

  const HW = 32, HH = 50, OX = 10, OY = 10     // tela dei capelli; (OX, OY) = la testa (0,0): v. "offset" in aspetto.json
  const capelli = (id, celle, { cut, fili = [], rifl = [], lt = 2, dk = 2, dopo } = {}) => {
    const S = new Set()
    for (const [x, y] of celle) {
      if (cut && cut(x, y)) continue
      const cx = x + OX, cy = y + OY
      if (cx >= 1 && cy >= 1 && cx < HW - 1 && cy < HH - 1) S.add(cx + "," + cy)
    }
    const xy = (k) => k.split(",").map(Number)
    sprite("_capelli_" + id + "0", { w: HW, h: HH }, (c) => {
      for (const k of S) c.px(...xy(k), "b")
      // contorno scuro solo fuori dalla testa: sull'attaccatura dei capelli (contro la pelle) basta l'ombra dei capelli stessi
      for (const k of S) { const [x, y] = xy(k)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!S.has((x + dx) + "," + (y + dy)) && !nelCranio(x + dx - OX, y + dy - OY)) c.px(x + dx, y + dy, "k") }
    })
    sprite("capelli_" + id, { base: "_capelli_" + id + "0" }, toon(lt, dk), (c) => {
      for (const k of S) { const [x, y] = xy(k)        // l'attaccatura contro la pelle: ombra, mai luce
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !S.has((x + dx) + "," + (y + dy)) && nelCranio(x + dx - OX, y + dy - OY))) c.px(x, y, "a") }
      for (const pts of fili) for (const [x, y] of ln(pts)) { const cx = x + OX, cy = y + OY
        if (c.is(cx, cy, "b") || c.is(cx, cy, "c")) c.px(cx, cy, "a") }
      for (const [x, y] of rifl) if (c.is(x + OX, y + OY, "c")) c.px(x + OX, y + OY, "d")
      if (dopo) dopo(c, (x, y, k) => { if (c.is(x + OX, y + OY, "b") || c.is(x + OX, y + OY, "c") || c.is(x + OX, y + OY, "a")) c.px(x + OX, y + OY, k) })
    })
  }

  // ---------------------------------------------------------------------------------------------------------------
  // MASCHILI
  // M1 rasato: pelo corto aderente al cranio
  capelli("m1", bande([[0, 5, 10], [1, 2, 13], [2, 1, 13], [3, 1, 13], [4, 1, 12], [7, 1, 10], [9, 1, 8], [11, 2, 6], [13, 3, 4]]),
    { lt: 1, dk: 1, rifl: [[7, 1]] })
  // M2 corto: un po' di volume sopra, scalato ai lati
  capelli("m2", bande([[-2, 4, 10], [-1, 2, 12], [0, 0, 13], [1, -1, 14], [3, -1, 14], [4, -1, 13], [7, -1, 10], [9, -1, 8], [11, 0, 6], [13, 2, 4]]),
    { fili: [[[9, -1], [6, 1], [2, 4], [0, 8]], [[11, 0], [8, 3], [5, 6]], [[6, -2], [3, 0], [0, 3]]], rifl: [[6, -2], [7, -2]] })
  // M3 spazzola: cima piatta, ai lati cortissimo
  capelli("m3", bande([[-3, 3, 11], [-2, 2, 12], [-1, 1, 13], [0, 0, 14], [3, -1, 14], [4, -1, 13], [7, 0, 10], [9, 1, 8], [11, 2, 6], [13, 3, 4]]),
    { fili: [[[11, -2], [11, 3]], [[8, -2], [8, 1]], [[5, -2], [5, 1]], [[2, -1], [2, 3]]], rifl: [[4, -3], [5, -3], [6, -3]] })
  // M4 ciuffo: la cresta davanti sporge sulla fronte
  capelli("m4", bande([[-3, 3, 13], [-2, 2, 16], [-1, 1, 17], [0, 0, 17], [1, 0, 16], [2, -1, 15], [3, -1, 14], [4, -1, 12], [7, -1, 10], [9, -1, 8], [11, 0, 6], [13, 2, 4]]),
    { fili: [[[3, -1], [8, -2], [13, -1], [16, 0]], [[3, 1], [8, 0], [13, 1], [15, 2]], [[2, 5], [0, 8]]], rifl: [[9, -3], [10, -3], [13, -2]] })
  // M5 mohicano: cresta centrale a punte, ai lati rasato
  const punta = (x, h) => { const o = []
    for (let j = 0; j < h; j++) { const m = Math.floor((h - 1 - j) / 3); for (let i = -m; i <= m; i++) o.push([x + i, -j]) }
    return o }
  capelli("m5", uni(bande([[-1, 1, 13], [0, 0, 13], [1, 0, 13], [2, 0, 12], [3, 3, 12]]),
      punta(2, 6), punta(5, 8), punta(8, 7), punta(11, 5)),
    { lt: 1, dk: 1, fili: [[[3, -1], [3, 1]], [[7, -1], [7, 1]], [[10, -1], [10, 1]]] })
  // M6 medio pettinato: ciuffo laterale sulla fronte, copre l'orecchio
  capelli("m6", bande([[-3, 4, 11], [-2, 2, 13], [-1, 0, 14], [0, -1, 15], [2, -2, 15], [4, -2, 15], [5, -2, 13], [6, -2, 12], [7, -2, 10], [9, -2, 8], [11, -2, 6], [14, 0, 5], [15, 1, 5]]),
    { fili: [[[5, -3], [10, -2], [14, 1], [14, 4]], [[3, -2], [7, 0], [10, 3], [8, 6]], [[2, 4], [0, 9], [1, 13]]], rifl: [[8, -3], [9, -3], [12, -1]] })
  // M7 ricci: nuvola di ricci attorno alla testa
  capelli("m7", uni(disco(6.5, 3, 8.2), disco(-2, 2, 3), disco(0, -2.5, 3.2), disco(5, -4, 3.2), disco(11, -2, 3), disco(14, 2, 2.4),
      disco(-2.5, 7, 3), disco(0, 11, 2.8), disco(1.5, 13, 2.2), disco(3, -4, 2.8), disco(8, -4.5, 2.8)),
    { cut: (x, y) => sulViso(x, y) || y > 13, lt: 2, dk: 2, fili: [[[4, -2], [3, 1]], [[9, -2], [8, 1]], [[1, 4], [0, 7]], [[6, 2], [5, 5]]],
      rifl: [[9, -4], [10, -4], [6, -5]] })
  // M8 chignon maschile: capelli raccolti in alto dietro
  capelli("m8", uni(bande([[-1, 3, 12], [0, 1, 13], [1, 0, 14], [3, -1, 14], [4, -1, 13], [6, -1, 11], [8, 0, 9], [10, 1, 7], [12, 2, 5]]),
      disco(1.5, -3, 3.4)),
    { fili: [[[11, 0], [7, 0], [3, -1]], [[12, 3], [8, 3], [4, 4]]], rifl: [[0, -5], [1, -5]],
      dopo: (c, P) => { for (const x of [-1, 0, 1, 2, 3]) P(x, 0, "k") } })

  // ---------------------------------------------------------------------------------------------------------------
  // FEMMINILI
  // F1 caschetto: alla mascella, con la frangia di lato
  capelli("f1", bande([[-3, 3, 11], [-2, 1, 13], [-1, -1, 14], [0, -2, 15], [3, -3, 15], [5, -3, 14], [7, -3, 12], [10, -3, 11], [13, -3, 9], [15, -2, 7], [16, 0, 5]]),
    { cut: (x, y) => y >= 15 && x > 5, fili: [[[4, -2], [9, -1], [13, 2]], [[2, 4], [1, 10], [2, 15]], [[7, 3], [8, 9], [7, 14]]], rifl: [[8, -3], [9, -3], [12, -1]] })
  // F2 lunghi lisci: sulla schiena fino a meta' busto
  capelli("f2", bande([[-3, 3, 11], [-2, 1, 13], [-1, -1, 14], [0, -2, 15], [3, -3, 15], [5, -3, 14], [7, -3, 12], [9, -3, 10], [12, -3, 8], [14, -3, 5], [17, -4, 4],
      [24, -4, 3], [31, -4, 3], [35, -3, 2], [37, -2, 1]]),
    { fili: [[[4, -2], [9, -1], [13, 2]], [[1, 6], [-1, 16], [-2, 28], [-1, 36]], [[3, 9], [1, 20], [0, 32]]], rifl: [[8, -3], [9, -3], [12, -1]] })
  // F3 coda alta: tutti i capelli tirati su e dietro, la coda scende
  capelli("f3", uni(bande([[-2, 4, 11], [-1, 2, 13], [0, 0, 14], [1, -1, 14], [3, -1, 14], [4, -1, 13], [6, -1, 11], [8, 0, 9], [10, 1, 7], [12, 2, 5]]),
      tubo([[2, -1], [-2, 0], [-5, 4], [-6, 10], [-4, 16], [-3, 20]], 2.3, 0.8)),
    { fili: [[[9, -1], [5, 0], [1, 1]], [[-3, 1], [-5, 7], [-4, 14]], [[-1, 1], [-3, 8], [-3, 16]]], rifl: [[6, -2], [7, -2]],
      dopo: (c, P) => { for (const y of [-1, 0, 1]) P(1, y, "k"); P(2, 0, "k") } })
  // F4 treccia: capelli raccolti, la treccia scende sulla schiena
  capelli("f4", uni(bande([[-2, 4, 11], [-1, 2, 13], [0, 0, 14], [1, -1, 14], [3, -1, 14], [4, -1, 13], [6, -1, 11], [8, 0, 9], [10, 1, 7], [12, 2, 5]]),
      tubo([[1, 8], [-2, 14], [-3, 22], [-2, 30]], 2.3, 1.6)),
    { fili: [[[9, -1], [5, 0], [1, 2]]], rifl: [[6, -2], [7, -2]],
      dopo: (c, P) => { for (let y = 13; y <= 31; y += 3) for (const x of [-5, -4, -3, -2, -1, 0]) P(x - (y > 20 ? 0 : 1), y, "a")
        for (const x of [-4, -3, -2, -1]) P(x, 32, "k") } })
  // F5 chignon basso: crocchia sulla nuca
  capelli("f5", uni(bande([[-2, 4, 11], [-1, 2, 13], [0, 0, 14], [1, -1, 14], [3, -1, 14], [4, -1, 13], [6, -1, 11], [8, 0, 9], [10, 0, 7], [12, 1, 5]]),
      disco(0.5, 11.5, 3.9)),
    { fili: [[[9, -1], [5, 0], [1, 3], [-1, 8]], [[0, 9], [3, 12]], [[-2, 11], [1, 14]]], rifl: [[6, -2], [7, -2]],
      dopo: (c, P) => { for (const x of [-2, -1, 0, 1, 2]) P(x, 8, "k") } })
  // F6 frangia e lunghi: frangia piena sulla fronte, lunghi a scalare
  capelli("f6", bande([[-3, 3, 12], [-2, 1, 14], [-1, -1, 15], [0, -2, 16], [3, -3, 16], [5, -3, 15], [6, -3, 12], [8, -3, 10], [11, -3, 8], [14, -3, 5], [17, -4, 4],
      [22, -4, 3], [26, -4, 3], [29, -3, 2], [30, -3, 1], [31, -2, 0]]),
    { fili: [[[3, -2], [8, -1], [13, 1], [15, 4]], [[2, 3], [9, 3], [14, 5]], [[1, 7], [-1, 18], [-1, 28]], [[3, 9], [1, 20], [1, 28]]],
      rifl: [[8, -3], [9, -3], [13, -1]] })
  // F7 ricci lunghi: volume attorno alla testa e una cascata di ricci dietro
  capelli("f7", uni(disco(6, 3, 8), disco(-2, 3, 3.4), disco(0, -3, 3.4), disco(5, -4.5, 3.2), disco(11, -3, 3), disco(14, 1.5, 2.4),
      tubo([[-1, 8], [-3, 14], [-3, 22], [-2, 28]], 3.4, 2.6),
      disco(-5, 12, 2), disco(-6, 18, 2.2), disco(-5, 24, 2.2), disco(2, 17, 2), disco(2, 23, 2.2), disco(1, 28, 2), disco(-2, 30, 1.8)),
    { cut: (x, y) => sulViso(x, y) || (y >= 14 && x > 4) , fili: [[[4, -2], [3, 1]], [[9, -2], [8, 1]], [[-2, 10], [-3, 16], [-3, 24]], [[1, 12], [0, 20]]],
      rifl: [[9, -4], [10, -4], [6, -5]] })
  // F8 pixie: corto ai lati, ciuffo lungo sulla fronte, ciocche sulla nuca
  capelli("f8", bande([[-2, 4, 12], [-1, 2, 14], [0, 0, 16], [1, -1, 16], [3, -1, 16], [4, -1, 14], [5, -1, 12], [7, 0, 10], [9, 1, 8], [11, 1, 6], [13, 1, 4], [15, 1, 3]]),
    { lt: 1, dk: 2, fili: [[[4, -1], [9, -1], [14, 1], [16, 3]], [[2, 2], [8, 2], [13, 4]], [[1, 6], [0, 11], [1, 15]]], rifl: [[8, -2], [9, -2], [12, -1]] })

  // ---------------------------------------------------------------------------------------------------------------
  // anteprima: le 16 teste (sopra il busto, per vedere dove cadono i capelli lunghi)
  const nomi = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"]
  scene("capelli_anteprima", { w: 8 * 38, h: 2 * 60, bg: "#4a5160" },
    ...nomi.flatMap((id, i) => { const x = (i % 8) * 38 + 14, y = Math.floor(i / 8) * 60 + 12
      return [stamp("busto_sup", x, y + 18), stamp("testa", x, y), stamp("capelli_" + id, x - OX, y - OY)] }))
}

{
  // ---------------------------------------------------------------------------------------------------------------
  // VESTITI: un overlay per pezzo, nello STESSO canvas del pezzo di pelle e con la stessa sagoma. Si ricavano dal pezzo
  // (stessa luce e stessi toni), tagliati all'orlo e con i dettagli del tessuto: l'indice di colore e' lo stesso del corpo
  // (k contorno, a ombra, b base, c luce, d riflesso) e arena.js li ricolora con un colore preso da `colori_vestiti`.
  // Lo stesso PNG vale per il lato vicino (dx) e per quello lontano (sx, piu' scuro di un gradino a runtime).
  const INDICI = ["k", "a", "b", "c", "d"]
  const pieno = (c, x, y) => INDICI.some((k) => c.is(x, y, k))
  const taglia = (fn) => (c) => { const v = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && fn(x, y)) v.push([x, y])
    for (const [x, y] of v) c.px(x, y, "_") }
  // contorno scuro sui bordi nati dal taglio (orli, scollature): ogni pixel pieno con un vicino vuoto
  const bordo = (c) => { const v = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pieno(c, x, y) &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !pieno(c, x + dx, y + dy))) v.push([x, y])
    for (const [x, y] of v) c.px(x, y, "k") }
  const riga = (y, k, solo) => (c) => { for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && !c.is(x, y, "k") && (!solo || solo(x))) c.px(x, y, k) }
  const punti = (lista, k) => (c) => { for (const [x, y] of lista) if (pieno(c, x, y) && !c.is(x, y, "k")) c.px(x, y, k) }
  const fino = (y1, ...dopo) => [taglia((x, y) => y > y1), bordo, riga(y1 - 1, "a"), ...dopo]

  const V = (nome, base, ...ops) => sprite(nome, { base }, ...ops)

  // ---- maglie: canottiera, t-shirt, maniche lunghe. Il busto finisce sul fianco (riga 13 del busto basso).
  const orloBusto = fino(13)
  V("maglia_canottiera_busto_sup", "busto_sup",
    taglia((x, y) => (y <= 5 && x >= 9) || (y <= 3 && x <= 3)), bordo,
    riga(5, "a", (x) => x >= 6 && x <= 9), punti([[4, 15], [5, 16], [8, 12], [9, 13]], "a"))
  V("maglia_canottiera_busto_inf", "busto_inf", ...orloBusto, punti([[3, 4], [4, 5]], "a"))
  V("maglia_tshirt_busto_sup", "busto_sup", riga(1, "a"), punti([[4, 15], [5, 16], [3, 17], [8, 12], [9, 13]], "a"))
  V("maglia_tshirt_busto_inf", "busto_inf", ...orloBusto, punti([[3, 4], [4, 5], [10, 8]], "a"))
  V("maglia_tshirt_braccio_sup", "braccio_sup_dx", ...fino(12))
  V("maglia_lunga_busto_sup", "busto_sup", riga(1, "a"), punti([[4, 15], [5, 16], [3, 17], [8, 12], [9, 13]], "a"))
  V("maglia_lunga_busto_inf", "busto_inf", ...orloBusto, punti([[3, 4], [4, 5], [10, 8]], "a"))
  V("maglia_lunga_braccio_sup", "braccio_sup_dx", punti([[4, 19], [3, 20], [2, 21]], "a"))
  V("maglia_lunga_avambraccio", "avambraccio_dx", ...fino(12, riga(10, "c")))

  // ---- pantaloni: corti, tre quarti (con tasca), lunghi (con cucitura). Cominciano sotto l'orlo della maglia.
  const vita = [taglia((x, y) => y < 10), bordo]
  V("pantaloni_corti_busto_inf", "busto_inf", ...vita)
  V("pantaloni_corti_coscia", "coscia_dx", ...fino(16, riga(14, "c")), punti([[2, 22], [3, 21]], "a"))
  V("pantaloni_tre_quarti_busto_inf", "busto_inf", ...vita)
  V("pantaloni_tre_quarti_coscia", "coscia_dx",
    punti([[2, 21], [3, 22], [4, 23]], "a"),
    (c) => { for (let x = 4; x <= 7; x++) for (const y of [7, 11]) if (pieno(c, x, y) && !c.is(x, y, "k")) c.px(x, y, y === 7 ? "c" : "a")
      for (const y of [8, 9, 10]) if (pieno(c, 4, y) && !c.is(4, y, "k")) c.px(4, y, "a") })
  V("pantaloni_tre_quarti_stinco", "stinco_dx", ...fino(12, riga(10, "c")), punti([[2, 1], [3, 2]], "a"))
  V("pantaloni_lunghi_busto_inf", "busto_inf", ...vita)
  V("pantaloni_lunghi_coscia", "coscia_dx", punti([[2, 21], [3, 22], [4, 23]], "a"),
    punti([2, 4, 6, 8, 10, 12, 14, 16, 18].map((y) => [7, y]), "c"))
  V("pantaloni_lunghi_stinco", "stinco_dx", ...fino(24, riga(22, "c")), punti([[2, 1], [3, 2], [4, 3]], "a"),
    punti([2, 4, 6, 8, 10, 12, 14, 16, 18].map((y) => [6, y]), "c"))

  // ---------------------------------------------------------------------------------------------------------------
  // TEXTURE DEI COLORI (si campionano con un seed: colore = pixel a x = seed * larghezza)
  const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

  // vestiti: sezioni di colore di larghezza irregolare. Piu' larga = piu' comune: il bianco e' il piu' stretto (e raro).
  // Dentro ogni sezione il colore scorre da un po' piu' scuro a un po' piu' chiaro; fra due sezioni c'e' una sfumatura breve.
  const SEZIONI = [["jeans", "#3b5b8c", 22], ["nero", "#26262a", 16], ["grigio", "#7a7d83", 14], ["antracite", "#4a4d52", 10], ["blu notte", "#26315e", 12],
    ["verde bosco", "#2f5b3f", 9], ["marrone", "#6b4a32", 8], ["cachi", "#a99568", 8], ["rosso", "#b3342f", 7], ["bordeaux", "#6e2233", 6],
    ["senape", "#c4a030", 5], ["oliva", "#6f7a3a", 5], ["azzurro", "#5f9fd0", 5], ["arancio", "#d9772a", 4], ["rosa", "#d96f8f", 4],
    ["viola", "#6b4a99", 4], ["turchese", "#2f9a9a", 4], ["lime", "#9bd13a", 3], ["giallo", "#e9d23a", 3], ["bianco", "#f4f4f0", 2]]
  const LV = SEZIONI.reduce((s, x) => s + x[2], 0)
  sprite("colori_vestiti", { w: LV, h: 4 }, (c) => {
    const col = []
    for (const [, h, w] of SEZIONI) { const base = rgb(h)
      for (let i = 0; i < w; i++) col.push(base.map((v) => v * (0.9 + 0.2 * (w > 1 ? i / (w - 1) : 0.5)))) }
    const conf = []; let b0 = 0
    for (const [, , w] of SEZIONI) { b0 += w; if (b0 < LV) conf.push(b0) }
    const out = col.map((v, i) => { let r = v
      for (const b of conf) if (Math.abs(i + 0.5 - b) < 1.5) r = mix(col[b - 1], col[b], 0.5 + (i + 0.5 - b) / 3)
      return r })
    for (let x = 0; x < LV; x++) for (let y = 0; y < 4; y++) c.px(x, y, hex(...out[x]))
  })
  // capelli: un gradiente continuo di colori naturali. Le tinte comuni (nero, castano) occupano tanto spazio, le rare (rosso,
  // biondo platino, grigio) poco.
  const STOP = [[0, "#17110f"], [0.15, "#241811"], [0.3, "#3f2917"], [0.44, "#5e3b21"], [0.54, "#80552f"], [0.61, "#6f3320"], [0.67, "#a8501d"],
    [0.74, "#9a7a48"], [0.82, "#c9a460"], [0.89, "#e6d6a0"], [0.93, "#8f8d8a"], [0.97, "#cfcdca"], [1, "#efeeec"]]
  const LC = 128
  sprite("colori_capelli", { w: LC, h: 4 }, (c) => {
    for (let x = 0; x < LC; x++) { const u = x / (LC - 1); let i = 0
      while (i < STOP.length - 2 && u > STOP[i + 1][0]) i++
      const [u0, h0] = STOP[i], [u1, h1] = STOP[i + 1], col = mix(rgb(h0), rgb(h1), Math.max(0, Math.min(1, (u - u0) / (u1 - u0))))
      for (let y = 0; y < 4; y++) c.px(x, y, hex(...col)) }
  })

  // ---------------------------------------------------------------------------------------------------------------
  // anteprima: i 3x3 vestiti sul corpo grigio (pantaloni sotto, maglia sopra)
  const MAGLIE = ["canottiera", "tshirt", "lunga"], PANT = ["corti", "tre_quarti", "lunghi"]
  const pezzi = [["braccio_sup_sx", "braccio_sup", 12, 21], ["avambraccio_sx", "avambraccio", 12, 43], ["coscia_sx", "coscia", 19, 53], ["stinco_sx", "stinco", 19, 77],
    ["coscia_dx", "coscia", 15, 53], ["stinco_dx", "stinco", 15, 77], ["busto_sup", "busto_sup", 14, 18], ["busto_inf", "busto_inf", 14, 37],
    ["testa", null, 14, 0], ["braccio_sup_dx", "braccio_sup", 16, 21], ["avambraccio_dx", "avambraccio", 16, 43]]
  // (anteprima a colori: le stesse rampe che arena.js ricava a runtime, qui fissate)
  const RAMPE = { pelle: { k: "#2a1a14", a: "#a8693f", b: "#c98a5b", c: "#e0a979", d: "#f3c9a0" },
    jeans: { k: "#141d33", a: "#2a3d63", b: "#3b5b8c", c: "#5b7fb4", d: "#86a5d0" },
    rosso: { k: "#3a1210", a: "#842622", b: "#b3342f", c: "#d05a52", d: "#e48c84" },
    senape: { k: "#40340d", a: "#8c7222", b: "#c4a030", c: "#dcbf58", d: "#ecd98c" },
    bosco: { k: "#10241a", a: "#214230", b: "#2f5b3f", c: "#4f8060", d: "#80ab8c" } }
  const fatti = {}
  const col = (id, r) => { const n = "_pv_" + id + "_" + r
    if (!fatti[n]) { fatti[n] = 1; sprite(n, { base: id, swap: RAMPE[r] }) }
    return n }
  const vestito = (ox, m, p) => pezzi.flatMap(([nome, parte, x, y]) => {
    const out = [stamp(col(nome, "pelle"), ox + x, y)]
    if (parte) for (const [pref, r] of [["pantaloni_" + PANT[p] + "_", "jeans"], ["maglia_" + MAGLIE[m] + "_", ["rosso", "senape", "bosco"][m]]]) {
      const id = pref + parte
      if (has(id)) out.push(stamp(col(id, r), ox + x, y)) }
    return out })
  scene("vestiti_anteprima", { w: 9 * 46, h: 111, bg: "#4a5160" }, ...[0, 1, 2].flatMap((m) => [0, 1, 2].flatMap((p) => vestito((m * 3 + p) * 46, m, p))))
}
