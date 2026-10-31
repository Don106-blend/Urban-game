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

{
  // ---------------------------------------------------------------------------------------------------------------
  // ALTRI VESTITI: 10 maglie e 10 pantaloni in piu' (stesse regole del blocco precedente: un overlay per pezzo, stessa sagoma della
  // pelle, indici di colore; le operazioni tagliano o ritoccano solo pixel che ci sono, quindi restano nella sagoma). Dove un pezzo
  // e' uguale a un altro indumento il manifest punta allo stesso PNG (es. manica lunga liscia): qui si disegna solo cio' che cambia.
  const INDICI = ["k", "a", "b", "c", "d"]
  const pieno = (c, x, y) => INDICI.some((k) => c.is(x, y, k))
  const taglia = (fn) => (c) => { const v = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && fn(x, y)) v.push([x, y])
    for (const [x, y] of v) c.px(x, y, "_") }
  const bordo = (c) => { const v = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pieno(c, x, y) &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !pieno(c, x + dx, y + dy))) v.push([x, y])
    for (const [x, y] of v) c.px(x, y, "k") }
  const riga = (y, k, solo) => (c) => { for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && !c.is(x, y, "k") && (!solo || solo(x))) c.px(x, y, k) }
  const punti = (lista, k) => (c) => { for (const [x, y] of lista) if (pieno(c, x, y) && !c.is(x, y, "k")) c.px(x, y, k) }
  const fino = (y1, ...dopo) => [taglia((x, y) => y > y1), bordo, riga(y1 - 1, "a"), ...dopo]
  const vert = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i])
  const orizz = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y])
  const scatola = (x0, y0, x1, y1) => [...orizz(y0, x0, x1), ...orizz(y1, x0, x1), ...vert(x0, y0, y1), ...vert(x1, y0, y1)]
  const V = (nome, base, ...ops) => sprite(nome, { base }, ...ops)
  const BS = "busto_sup", BI = "busto_inf", FIN13 = fino(13)
  const gilet = taglia((x, y) => (y <= 5 && x >= 9) || (y <= 3 && x <= 3))

  // ---- maglie
  V("maglia_polo_busto_sup", BS, riga(1, "c"), riga(2, "a", (x) => x >= 4 && x <= 9), punti(vert(10, 2, 6), "a"), punti([[10, 3], [10, 5]], "d"))
  V("maglia_polo_busto_inf", BI, ...FIN13)
  V("maglia_felpa_busto_sup", BS, riga(1, "c"), riga(2, "c"), riga(3, "a"), punti([[9, 4], [9, 5], [9, 6], [10, 6]], "d"), punti([[4, 15], [5, 16], [8, 12]], "a"))
  V("maglia_felpa_busto_inf", BI, ...fino(14, riga(13, "c"), punti([...orizz(4, 3, 9), ...vert(3, 4, 9), ...vert(9, 4, 9)], "a"), punti(orizz(5, 4, 8), "c")))
  V("maglia_giacca_busto_sup", BS, punti(vert(10, 1, 19), "k"), punti([[9, 1], [8, 2], [7, 3], [6, 4]], "a"), punti([[8, 1], [7, 2], [6, 3]], "c"))
  V("maglia_giacca_busto_inf", BI, punti(vert(10, 1, 13), "k"), ...fino(13, riga(12, "c")))
  V("maglia_gilet_busto_sup", BS, gilet, bordo, punti(vert(10, 6, 19), "k"), punti(scatola(3, 9, 5, 11), "a"))
  V("maglia_gilet_busto_inf", BI, punti(vert(10, 1, 13), "k"), ...FIN13)
  V("maglia_righe_busto_sup", BS, ...[1, 4, 7, 10, 13, 16, 19].map((y) => riga(y, "a")))
  V("maglia_righe_busto_inf", BI, ...FIN13, ...[2, 5, 8, 11].map((y) => riga(y, "a")))
  V("maglia_righe_braccio_sup", "braccio_sup_dx", ...fino(12), ...[2, 5, 8].map((y) => riga(y, "a")))
  V("maglia_dolcevita_busto_sup", BS, riga(0, "c"), riga(1, "c"), riga(2, "a"), riga(3, "a", (x) => x >= 3 && x <= 10))
  V("maglia_dolcevita_busto_inf", BI, ...fino(13, riga(12, "c"), riga(11, "a")))
  V("maglia_camicia_busto_sup", BS, punti([[9, 1], [8, 2], [7, 3], [6, 4]], "k"), punti([[10, 1], [9, 2], [8, 3], [7, 4]], "c"),
    punti([5, 8, 11, 14, 17].map((y) => [10, y]), "d"))
  V("maglia_camicia_busto_inf", BI, punti([2, 5, 8, 11].map((y) => [10, y]), "d"), ...FIN13)
  V("maglia_manica34_busto_sup", BS, riga(1, "a"), punti([[4, 15], [5, 16], [8, 12]], "a"))
  V("maglia_manica34_busto_inf", BI, ...FIN13)
  V("maglia_manica34_avambraccio", "avambraccio_dx", ...fino(5))
  V("maglia_crop_busto_sup", BS, ...fino(16, riga(1, "a")))
  V("maglia_cappotto_busto_sup", BS, punti([[9, 1], [8, 2], [7, 3], [6, 4], [5, 5]], "a"), punti([[10, 1], [9, 2], [8, 3], [7, 4], [6, 5]], "c"),
    punti([8, 11, 14, 17].flatMap((y) => [[8, y], [10, y]]), "d"))
  V("maglia_cappotto_busto_inf", BI, riga(10, "a"), punti([2, 5, 8, 12, 15, 18].flatMap((y) => [[8, y], [10, y]]), "d"), riga(18, "c"))

  // ---- pantaloni
  const tasca = (x0, y0, x1, y1) => [punti(orizz(y0, x0, x1), "c"), punti([...orizz(y1, x0, x1), ...vert(x0, y0 + 1, y1), ...vert(x1, y0 + 1, y1)], "a")]
  const piega = (x, y0, y1) => punti(vert(x, y0, y1), "a")
  V("pantaloni_bermuda_coscia", "coscia_dx", ...fino(22, riga(20, "c")), punti([[2, 22]], "a"))
  V("pantaloni_cargo_coscia", "coscia_dx", ...tasca(3, 12, 6, 17), punti([[2, 21], [3, 22], [4, 23]], "a"))
  V("pantaloni_cargo_stinco", "stinco_dx", ...fino(24, riga(22, "c")), ...tasca(2, 6, 5, 10), punti([[2, 1], [3, 2], [4, 3]], "a"))
  V("pantaloni_jogger_coscia", "coscia_dx", punti(vert(3, 2, 22), "c"), punti([[2, 21], [3, 22]], "a"))
  V("pantaloni_jogger_stinco", "stinco_dx", ...fino(24, riga(22, "a"), riga(21, "c")), punti(vert(3, 2, 19), "c"))
  V("pantaloni_leggings_coscia", "coscia_dx", punti([4, 7, 10, 13, 16, 19].flatMap((y) => [[6, y], [6, y + 1]]), "d"))
  V("pantaloni_leggings_stinco", "stinco_dx", ...fino(27, riga(26, "a")), punti([3, 6, 9, 12, 15, 18].flatMap((y) => [[5, y], [5, y + 1]]), "d"))
  V("pantaloni_eleganti_busto_inf", BI, taglia((x, y) => y < 10), bordo, riga(10, "k"), punti([[9, 11]], "d"))
  V("pantaloni_eleganti_coscia", "coscia_dx", piega(4, 1, 23))
  V("pantaloni_eleganti_stinco", "stinco_dx", ...fino(24, riga(22, "c")), piega(4, 1, 21))
  V("pantaloni_sportivi_coscia", "coscia_dx", ...fino(10, riga(8, "c")), punti(vert(3, 2, 7), "c"))
  V("pantaloni_pinocchietto_stinco", "stinco_dx", ...fino(6, riga(4, "c")), punti([[2, 1], [3, 2]], "a"))
  V("pantaloni_zampa_coscia", "coscia_dx", piega(4, 1, 23))
  V("pantaloni_zampa_stinco", "stinco_dx", ...fino(24, riga(23, "k", (x) => x !== 0), riga(21, "c"), riga(20, "a"), riga(19, "c")), piega(4, 1, 17))
  V("pantaloni_gonna_busto_inf", BI, taglia((x, y) => y < 10), bordo, riga(10, "a"), punti([3, 5, 7].flatMap((x) => vert(x, 12, 19)), "a"))
  V("pantaloni_gonna_coscia", "coscia_dx", ...fino(14, riga(12, "c")), punti([3, 5].flatMap((x) => vert(x, 1, 10)), "a"))
  V("pantaloni_toppe_coscia", "coscia_dx", punti(scatola(3, 15, 6, 19), "a"), punti([[4, 16], [5, 16], [4, 17], [5, 17], [4, 18], [5, 18]], "c"),
    taglia((x, y) => (x === 5 || x === 6) && y === 9), punti([[2, 21], [3, 22]], "a"))
  V("pantaloni_toppe_stinco", "stinco_dx", ...fino(24, riga(22, "c")), punti(scatola(2, 3, 5, 7), "a"), punti([[3, 4], [4, 4], [3, 5], [4, 5], [3, 6], [4, 6]], "c"),
    taglia((x, y) => (x === 3 || x === 4) && y === 14))

  // ---------------------------------------------------------------------------------------------------------------
  // ALI (potere Ali): un'ala sola, di profilo, che si disegna due volte (vicina e lontana, questa piu' scura a runtime). Tela 46 x 50, il
  // perno (dove l'ala si attacca alla schiena) e' a (40, 44): l'ala parte da li' verso l'alto e indietro. `arena.js` la fa battere
  // ruotandola attorno al perno; a riposo e' ripiegata. Indici come il corpo: il colore viene dal seed (texture dei capelli).
  const WW = 46, WH = 50, PX = 40, PY = 44
  // sagoma: bordo d'attacco che sale e curva all'indietro, bordo di uscita a penne (punte e rientranze)
  const SAGOMA = [[41, 45], [43, 31], [40, 17], [32, 8], [22, 4], [12, 5], [4, 10], [1, 17], [8, 19], [3, 26], [10, 28], [6, 34], [14, 35], [11, 41], [20, 40], [19, 46], [28, 42], [31, 47]]
  const dentroPoligono = (pts, x, y) => { let d = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j]
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d }
    return d }
  const S = new Set()
  for (let y = 1; y < WH - 1; y++) for (let x = 1; x < WW - 1; x++) if (dentroPoligono(SAGOMA, x + 0.5, y + 0.5)) S.add(x + "," + y)
  sprite("_ala0", { w: WW, h: WH }, (c) => {
    for (const k of S) c.px(...k.split(",").map(Number), "b")
    for (const k of S) { const [x, y] = k.split(",").map(Number)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!S.has((x + dx) + "," + (y + dy))) c.px(x + dx, y + dy, "k") }
  })
  sprite("ali_ala", { base: "_ala0" }, toon(2, 1), (c) => {
    const su = (x, y, k) => { if (c.is(x, y, "b") || c.is(x, y, "c") || c.is(x, y, "a")) c.px(x, y, k) }
    // le penne: linee che dal "polso" vanno verso ogni punta del bordo di uscita (ombra), e una luce subito sopra
    const polso = [37, 33]
    for (const [tx, ty] of [[1, 17], [3, 26], [6, 34], [11, 41], [19, 46], [31, 47]]) {
      const dx = tx - polso[0], dy = ty - polso[1], n = Math.max(Math.abs(dx), Math.abs(dy))
      for (let i = Math.floor(n * 0.2); i < n - 2; i++) { const x = Math.round(polso[0] + dx * i / n), y = Math.round(polso[1] + dy * i / n); su(x, y, "a"); su(x, y - 1, "c") } }
    // il bordo d'attacco: una fascia piu' chiara sull'avambraccio dell'ala, e qualche riflesso
    for (const [x, y] of [[41, 38], [41, 33], [40, 28], [39, 23], [37, 18], [34, 13], [30, 9], [25, 7], [19, 6], [13, 7]]) { su(x, y, "d"); su(x - 1, y, "c") }
  })
  scene("ali_anteprima", { w: 100, h: 60, bg: "#4a5160" }, stamp("ali_ala", 4, 4), stamp("ali_ala", 54, 4, { flip: "x" }))
}

{
  // ---------------------------------------------------------------------------------------------------------------
  // ANCORA 10 MAGLIE E 10 PANTALONI (terzo blocco, stesse regole dei due precedenti: si tocca solo cio' che c'e' nella pelle).
  const INDICI = ["k", "a", "b", "c", "d"]
  const pieno = (c, x, y) => INDICI.some((k) => c.is(x, y, k))
  const taglia = (fn) => (c) => { const v = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && fn(x, y)) v.push([x, y])
    for (const [x, y] of v) c.px(x, y, "_") }
  const bordo = (c) => { const v = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pieno(c, x, y) &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !pieno(c, x + dx, y + dy))) v.push([x, y])
    for (const [x, y] of v) c.px(x, y, "k") }
  const riga = (y, k, solo) => (c) => { for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && !c.is(x, y, "k") && (!solo || solo(x))) c.px(x, y, k) }
  const punti = (lista, k) => (c) => { for (const [x, y] of lista) if (pieno(c, x, y) && !c.is(x, y, "k")) c.px(x, y, k) }
  const pixel = (fn) => (c) => { const v = []                  // fn(x, y) -> tono o null, per ogni pixel pieno che non sia contorno
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && !c.is(x, y, "k")) { const k = fn(x, y); if (k) v.push([x, y, k]) }
    for (const [x, y, k] of v) c.px(x, y, k) }
  const fino = (y1, ...dopo) => [taglia((x, y) => y > y1), bordo, riga(y1 - 1, "a"), ...dopo]
  const vert = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i])
  const orizz = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y])
  const scatola = (x0, y0, x1, y1) => [...orizz(y0, x0, x1), ...orizz(y1, x0, x1), ...vert(x0, y0, y1), ...vert(x1, y0, y1)]
  const V = (nome, base, ...ops) => sprite(nome, { base }, ...ops)
  const BS = "busto_sup", BI = "busto_inf", FIN13 = fino(13)
  const gilet = taglia((x, y) => (y <= 5 && x >= 9) || (y <= 3 && x <= 3))
  const SCIARPA = (x, y) => (x * 3 + y * 2) % 7 === 0 ? "d" : (x * 2 + y * 5) % 9 === 0 ? "a" : null      // fantasia a fiori
  const CAMO = (x, y) => (x * 7 + y * 13) % 11 < 3 ? "a" : (x * 5 + y * 3) % 13 < 2 ? "c" : null           // mimetico: macchie di due toni
  const QUADRI = (x, y) => y % 5 === 0 ? "a" : x % 4 === 1 ? "c" : null
  const GESSATO = (x) => x % 3 === 1 ? "a" : null

  // ---- maglie (10)
  V("maglia_vscollo_busto_sup", BS, taglia((x, y) => [[7, 0], [8, 0], [9, 0], [8, 1], [9, 1], [10, 1], [9, 2], [10, 2], [10, 3]].some(([a, b]) => a === x && b === y)), bordo, riga(2, "a"))
  V("maglia_raglan_busto_sup", BS, punti([[4, 1], [4, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7], [9, 1], [9, 2], [10, 3], [10, 4], [10, 5], [10, 6], [10, 7]], "a"))
  V("maglia_hawaiana_busto_sup", BS, pixel(SCIARPA), punti([[9, 1], [8, 2], [7, 3]], "k"), punti([[10, 5], [10, 8], [10, 11]], "d"))
  V("maglia_hawaiana_busto_inf", BI, ...FIN13, pixel((x, y) => y < 12 ? SCIARPA(x, y + 19) : null))
  V("maglia_hawaiana_braccio_sup", "braccio_sup_dx", ...fino(12), pixel((x, y) => y < 11 ? SCIARPA(x, y) : null))
  V("maglia_bomber_busto_sup", BS, riga(1, "c"), riga(2, "a"), punti(vert(10, 3, 19), "k"))
  V("maglia_bomber_busto_inf", BI, punti(vert(10, 1, 7), "k"), ...fino(8, riga(7, "a"), riga(6, "c")))
  V("maglia_tunica_busto_sup", BS, riga(1, "a"), punti([[9, 2], [10, 3], [10, 4]], "a"))
  V("maglia_tunica_busto_inf", BI, riga(5, "c"), riga(6, "a"), punti([[10, 6]], "d"), riga(17, "c"), riga(18, "a"))
  V("maglia_corsetto_busto_sup", BS, gilet, bordo, ...[7, 9, 11, 13, 15, 17].map((y) => punti([[9, y], [10, y + 1]], "d")),
    punti(vert(9, 6, 19), "a"), riga(6, "c", (x) => x >= 2 && x <= 11))
  V("maglia_corsetto_busto_inf", BI, ...fino(8, riga(7, "c")), punti([[9, 2], [10, 3], [9, 4], [10, 5]], "d"), punti(vert(9, 1, 7), "a"))
  V("maglia_parka_busto_sup", BS, riga(0, "c"), riga(1, "c"), riga(2, "a"), riga(3, "a", (x) => x >= 3 && x <= 10), punti(vert(10, 4, 19), "k"),
    punti([[9, 4], [9, 5]], "d"))
  V("maglia_parka_busto_inf", BI, punti(vert(10, 1, 19), "k"), punti(scatola(3, 6, 8, 11), "a"), punti(orizz(7, 4, 7), "c"), riga(18, "c"))
  V("maglia_strappata_busto_sup", BS, riga(1, "a"), taglia((x, y) => [[3, 8], [4, 8], [4, 9], [8, 14], [6, 16], [7, 16]].some(([a, b]) => a === x && b === y)), bordo)
  V("maglia_strappata_busto_inf", BI, taglia((x, y) => y > 13), taglia((x, y) => y === 13 && x % 2 === 0), bordo, riga(12, "a"), taglia((x, y) => x === 4 && (y === 3 || y === 4)), bordo)
  V("maglia_strappata_braccio_sup", "braccio_sup_dx", ...fino(12), taglia((x, y) => x === 3 && y === 6), bordo)
  V("maglia_jersey_busto_sup", BS, gilet, bordo, punti(vert(11, 6, 19), "c"), punti(vert(2, 6, 19), "a"), riga(1, "c", (x) => x >= 4 && x <= 9))
  V("maglia_jersey_busto_inf", BI, ...FIN13, riga(11, "c"), riga(12, "a"), punti(vert(11, 1, 10), "c"))
  V("maglia_cardigan_busto_sup", BS, riga(1, "c"), riga(2, "c"), riga(3, "a", (x) => x >= 4 && x <= 10), punti(vert(10, 4, 19), "k"),
    punti([6, 9, 12, 15, 18].map((y) => [9, y]), "d"))
  V("maglia_cardigan_busto_inf", BI, punti(vert(10, 1, 15), "k"), punti([2, 5, 8, 11, 14].map((y) => [9, y]), "d"), ...fino(15, riga(14, "c")),
    punti(scatola(3, 6, 7, 10), "a"))

  // ---- pantaloni (10)
  const hemL = (y) => [taglia((x, yy) => yy > y), bordo, riga(y - 1, "a")]
  V("pantaloni_pelle_coscia", "coscia_dx", punti(vert(6, 2, 21), "d"), punti(vert(3, 1, 23), "a"), punti([[2, 21], [3, 22], [4, 23]], "a"))
  V("pantaloni_pelle_stinco", "stinco_dx", ...fino(24, riga(22, "c")), punti(vert(5, 2, 20), "d"), punti(vert(3, 1, 22), "a"))
  V("pantaloni_mimetici_coscia", "coscia_dx", pixel(CAMO))
  V("pantaloni_mimetici_stinco", "stinco_dx", ...fino(24, riga(22, "c")), pixel((x, y) => y < 22 ? CAMO(x, y + 24) : null))
  V("pantaloni_quadri_coscia", "coscia_dx", pixel(QUADRI))
  V("pantaloni_quadri_stinco", "stinco_dx", ...fino(24), pixel((x, y) => y < 23 ? QUADRI(x, y + 24) : null))
  V("pantaloni_gessato_coscia", "coscia_dx", pixel((x) => GESSATO(x)))
  V("pantaloni_gessato_stinco", "stinco_dx", ...fino(24, riga(22, "c")), pixel((x, y) => y < 22 ? GESSATO(x) : null))
  V("pantaloni_kilt_coscia", "coscia_dx", ...fino(12, riga(10, "c")), pixel((x, y) => y < 10 ? QUADRI(x, y) : null))
  V("pantaloni_imbottiti_coscia", "coscia_dx", pixel((x, y) => y % 4 === 0 ? "a" : y % 4 === 1 ? "c" : null))
  V("pantaloni_imbottiti_stinco", "stinco_dx", ...fino(24, riga(22, "a"), riga(21, "c")), pixel((x, y) => y < 20 ? (y % 4 === 0 ? "a" : y % 4 === 1 ? "c" : null) : null))
  V("pantaloni_harem_coscia", "coscia_dx", punti([[3, 4], [4, 5], [5, 4], [3, 10], [4, 11], [5, 10], [3, 16], [4, 17], [5, 16]], "a"))
  V("pantaloni_harem_stinco", "stinco_dx", ...fino(22, riga(20, "a"), riga(19, "c")), punti([[3, 6], [4, 7], [3, 12], [4, 13]], "a"))
  V("pantaloni_stivali_stinco", "stinco_dx", riga(17, "c"), riga(18, "a"), punti(orizz(16, 3, 6), "d"),
    pixel((x, y) => y >= 28 && y <= 30 ? "a" : null), punti(vert(4, 19, 27), "a"), riga(31, "a"))
  V("pantaloni_ginocchiere_coscia", "coscia_dx", punti(scatola(2, 19, 6, 23), "k"), punti([[3, 20], [4, 20], [5, 20], [3, 21], [4, 21]], "d"), punti([[5, 21], [3, 22], [4, 22], [5, 22]], "c"))
  V("pantaloni_ginocchiere_stinco", "stinco_dx", ...fino(24, riga(22, "c")), punti(scatola(2, 1, 6, 5), "k"), punti([[3, 2], [4, 2], [5, 2], [3, 3]], "d"), punti([[4, 3], [5, 3], [3, 4], [4, 4], [5, 4]], "c"))
  V("pantaloni_strappati_coscia", "coscia_dx", taglia((x, y) => (x >= 3 && x <= 5 && y >= 16 && y <= 18) || (x === 4 && y === 19)), bordo, punti([[2, 21], [3, 22]], "a"))
  V("pantaloni_strappati_stinco", "stinco_dx", ...hemL(24), taglia((x, y) => (x === 3 || x === 4) && y >= 3 && y <= 5), bordo,
    taglia((x, y) => y === 24 && x % 2 === 1), bordo)

  // ---------------------------------------------------------------------------------------------------------------
  // CYBERPUNK: altre 10 maglie (nessun pantalone). Il neon e' il tono "d" su un fondo scuro, le scanalature sono "k" e "a". Alcune hanno un
  // colore fisso nel manifest (tuta nera, piumino cromato...): con un colore a caso perderebbero cio' che le fa quelle che sono.
  const CIRC = (x, y) => { const u = x % 10, v = y % 8                       // circuito: un sentiero a gomito con un nodo a ogni capo
    return (v === 1 && u >= 1 && u <= 5) || (u === 5 && v >= 1 && v <= 4) || (v === 4 && u >= 5 && u <= 9) ? ((u === 1 && v === 1) || (u === 9 && v === 4) ? "d" : "a") : null }
  const PUFF = (x, y) => y % 5 === 0 ? "a" : y % 5 === 1 ? "d" : y % 5 === 2 ? "c" : null                    // piumino cromato: cuciture e riflessi orizzontali
  const HOLO = (x, y) => ["a", "b", "c", "d", "c", "b"][(x + y) % 6]                                          // olografica: bande oblique dal buio al lampo
  const RETE = (x, y) => (x + y) % 4 === 0 || (x - y + 40) % 4 === 0                                          // maglia a rete: i fili (il resto e' vuoto, si vede la pelle)
  const retina = (solido) => [taglia((x, y) => !solido(x, y) && !RETE(x, y)), pixel((x, y) => solido(x, y) ? "c" : "a")]
  const colloAlto = [riga(1, "c"), riga(2, "c"), riga(3, "a", (x) => x >= 3 && x <= 10)]
  const BRS = "braccio_sup_dx", AVB = "avambraccio_dx"

  // giacca a LED: strisce di neon lungo il fianco e sulle maniche
  V("maglia_led_busto_sup", BS, ...colloAlto, punti(vert(10, 4, 19), "k"), punti(vert(4, 5, 19), "d"), punti(vert(8, 5, 19), "d"), punti(vert(3, 5, 19), "k"))
  V("maglia_led_busto_inf", BI, punti(vert(10, 1, 15), "k"), ...fino(16), punti(vert(4, 1, 13), "d"), punti(vert(8, 1, 13), "d"), punti(vert(3, 1, 13), "k"))
  V("maglia_led_braccio_sup", BRS, punti(vert(3, 2, 22), "d"), punti(vert(2, 2, 22), "k"))
  V("maglia_led_avambraccio", AVB, ...fino(13, riga(11, "c")), punti(vert(3, 1, 9), "d"), punti(vert(2, 1, 9), "k"))

  // corpetto tattico: senza maniche, bretella a tracolla, tasche e cintura
  V("maglia_tattico_busto_sup", BS, gilet, bordo, punti(ln([[4, 2], [10, 17]]), "k"), punti(ln([[5, 2], [11, 17]]), "a"), punti([[7, 8], [8, 9]], "d"),
    punti(scatola(7, 12, 10, 16), "a"), punti(orizz(13, 8, 9), "c"))
  V("maglia_tattico_busto_inf", BI, ...fino(15, riga(14, "c")), punti(orizz(2, 3, 10), "k"), punti(orizz(3, 3, 10), "c"), punti([[7, 2], [8, 3]], "d"), punti(scatola(4, 7, 8, 12), "a"))

  // impermeabile riflettente: lungo, colletto alto, cintura, bande catarifrangenti
  V("maglia_impermeabile_busto_sup", BS, ...colloAlto, punti(vert(10, 5, 19), "k"), punti(ln([[9, 4], [7, 8]]), "a"), punti(ln([[8, 4], [6, 7]]), "c"),
    riga(13, "c"), riga(14, "d"))
  V("maglia_impermeabile_busto_inf", BI, punti(vert(10, 1, 19), "k"), riga(2, "a"), riga(3, "k"), punti([[9, 3]], "d"), riga(17, "c"), riga(18, "a"))
  V("maglia_impermeabile_braccio_sup", BRS, riga(12, "c"), riga(13, "d"), punti([[4, 21], [3, 22]], "a"))
  V("maglia_impermeabile_avambraccio", AVB, ...fino(13, riga(11, "c")), riga(4, "d"), riga(5, "c"))

  // tuta a circuiti: aderente, con le piste incise (il disegno continua da un pezzo all'altro)
  V("maglia_circuiti_busto_sup", BS, pixel(CIRC), riga(1, "c"), riga(2, "a"))
  V("maglia_circuiti_busto_inf", BI, pixel((x, y) => CIRC(x, y + 19)), ...fino(18))
  V("maglia_circuiti_braccio_sup", BRS, pixel((x, y) => CIRC(x + 2, y + 21)))
  V("maglia_circuiti_avambraccio", AVB, ...fino(13, riga(11, "c")), pixel((x, y) => y < 11 ? CIRC(x + 2, y + 42) : null))

  // corazza con spallacci: piastra sul petto, addome a placche, spalline e bracciali
  V("maglia_spallacci_busto_sup", BS, pixel((x, y) => x >= 4 && x <= 11 && y >= 4 && y <= 15 ? (x === 4 ? "a" : x >= 10 ? "d" : "c") : null),
    punti(scatola(4, 4, 11, 15), "k"), punti(vert(8, 5, 14), "a"), riga(1, "c"), riga(2, "a"))
  V("maglia_spallacci_busto_inf", BI, pixel((x, y) => y % 4 === 0 ? "k" : y % 4 === 1 ? "d" : "c"), ...fino(15))
  V("maglia_spallacci_braccio_sup", BRS, ...fino(10, riga(9, "a")), pixel((x, y) => y <= 3 ? "d" : y <= 7 ? "c" : null))
  V("maglia_spallacci_avambraccio", AVB, taglia((x, y) => y < 4 || y > 14), bordo, pixel((x) => x >= 4 ? "d" : "c"))

  // piumino cromato: cuciture orizzontali con il riflesso sotto
  V("maglia_cromato_busto_sup", BS, pixel(PUFF), ...colloAlto)
  V("maglia_cromato_busto_inf", BI, pixel((x, y) => PUFF(x, y + 19)), ...fino(17, riga(16, "a")))
  V("maglia_cromato_braccio_sup", BRS, pixel(PUFF))
  V("maglia_cromato_avambraccio", AVB, pixel((x, y) => PUFF(x, y + 22)), ...fino(13, riga(12, "a")))

  // maglia a rete: solo i fili (la pelle si vede in mezzo), con colletto e polsini pieni
  V("maglia_rete_busto_sup", BS, ...retina((x, y) => y <= 2))
  V("maglia_rete_busto_inf", BI, ...retina((x, y) => y >= 18))
  V("maglia_rete_braccio_sup", BRS, ...retina((x, y) => y >= 21))
  V("maglia_rete_avambraccio", AVB, ...fino(13), ...retina((x, y) => y >= 11))

  // tuta a pannelli: nera, con le cuciture dei pannelli e il rombo sul petto
  V("maglia_tuta_busto_sup", BS, riga(1, "c"), riga(2, "a"), punti(vert(3, 5, 19), "a"), punti(ln([[2, 4], [6, 9], [6, 14]]), "a"),
    punti([[8, 8], [7, 9], [8, 9], [9, 9], [8, 10]], "d"))
  V("maglia_tuta_busto_inf", BI, punti(vert(3, 1, 17), "a"), punti(orizz(9, 4, 10), "a"), punti([[7, 9]], "d"), ...fino(18))
  V("maglia_tuta_braccio_sup", BRS, punti(orizz(6, 1, 5), "a"), punti(orizz(14, 1, 5), "a"), punti([[3, 10]], "d"))
  V("maglia_tuta_avambraccio", AVB, ...fino(13, riga(11, "c")), punti(orizz(5, 2, 5), "a"), punti([[3, 8]], "d"))

  // giubbotto a borchie: cerniera obliqua, risvolto, borchie sulle spalle e lungo l'orlo
  V("maglia_borchie_busto_sup", BS, ...colloAlto, punti(ln([[4, 4], [10, 19]]), "k"), punti(ln([[10, 4], [6, 8], [10, 12]]), "a"),
    punti([[4, 3], [6, 3], [8, 3], [10, 3]], "d"))
  V("maglia_borchie_busto_inf", BI, punti(vert(10, 1, 15), "k"), ...fino(16), punti([[3, 14], [5, 14], [7, 14], [9, 14]], "d"))
  V("maglia_borchie_braccio_sup", BRS, punti([[3, 2], [3, 5], [3, 8]], "d"), punti([[4, 21], [3, 22]], "a"))
  V("maglia_borchie_avambraccio", AVB, ...fino(13, riga(11, "a")), punti([[3, 3], [3, 6], [3, 9]], "d"))

  // camicia olografica: bande oblique che scorrono dal buio al lampo (continuano da un pezzo all'altro)
  V("maglia_olo_busto_sup", BS, pixel(HOLO), riga(1, "c"), riga(2, "a"))
  V("maglia_olo_busto_inf", BI, pixel((x, y) => HOLO(x, y + 19)), ...fino(15))
  V("maglia_olo_braccio_sup", BRS, pixel((x, y) => HOLO(x + 11, y + 21)), ...fino(12))

  // anteprima: i 10 capi sul corpo a colori (pelle e capo, rampe fissate)
  const CYBER = ["led", "tattico", "impermeabile", "circuiti", "spallacci", "cromato", "rete", "tuta", "borchie", "olo"]
  const CY_COL = { led: [34, 36, 56], tattico: [74, 90, 70], impermeabile: [60, 64, 74], circuiti: [30, 170, 190], spallacci: [90, 96, 110],
    cromato: [150, 158, 172], rete: [190, 60, 90], tuta: [36, 36, 44], borchie: [46, 40, 42], olo: [120, 90, 210] }
  const rampaCy = ([r, g, b]) => { const f = (m, o = 0) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v * m + o))).toString(16).padStart(2, "0")).join("")
    return { k: f(0.4), a: f(0.7), b: f(1), c: f(1.2, 14), d: f(1.3, 70) } }
  const PELLE_CY = rampaCy([201, 138, 91])
  const sCy = (nome, rampa) => { const n = "_cy_" + nome + "_" + JSON.stringify(rampa).length + rampa.b; if (!has(n)) sprite(n, { base: nome, swap: rampa }); return n }
  const PZ_CY = [["braccio_sup_sx", "braccio_sup", 12, 21], ["avambraccio_sx", "avambraccio", 12, 43], ["coscia_sx", null, 19, 53], ["stinco_sx", null, 19, 77],
    ["coscia_dx", null, 15, 53], ["stinco_dx", null, 15, 77], ["busto_sup", "busto_sup", 14, 18], ["busto_inf", "busto_inf", 14, 37],
    ["testa", null, 14, 0], ["braccio_sup_dx", "braccio_sup", 16, 21], ["avambraccio_dx", "avambraccio", 16, 43]]
  const cyScena = (nome, ids) => scene(nome, { w: ids.length * 46, h: 56, bg: "#4a5160" }, ...ids.flatMap((id, i) => PZ_CY.filter((p) => p[1]).flatMap(([n, parte, x, y]) => {
    const out = [stamp(sCy(n, PELLE_CY), i * 46 + x, y - 16)]
    const g = "maglia_" + id + "_" + parte
    if (has(g)) out.push(stamp(sCy(g, rampaCy(CY_COL[id])), i * 46 + x, y - 16))
    return out })))
  cyScena("cyber_anteprima_1", CYBER.slice(0, 5))
  cyScena("cyber_anteprima_2", CYBER.slice(5))
}

{
  // ---------------------------------------------------------------------------------------------------------------
  // COPRICAPO: 5 cappelli e 5 maschere. Overlay della testa (stessa tela dei capelli: 32 x 50, offset [-10, -10], v. aspetto.json), a indici,
  // disegnati SOPRA i capelli. Contorno scuro pieno (sono oggetti sopra la testa). Coordinate nel sistema della testa (come i capelli).
  const bande = (keys) => { const out = []; const y0 = keys[0][0]
    lerp(keys).forEach(([a, b], i) => { for (let x = a; x <= b; x++) out.push([x, y0 + i]) })
    return out }
  const uni = (...liste) => liste.flat()
  const disco = (cx, cy, r) => { const o = []
    for (let y = Math.floor(cy - r) - 1; y <= Math.ceil(cy + r) + 1; y++) for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r) + 1; x++)
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) o.push([x, y])
    return o }
  const HW = 32, HH = 50, OX = 10, OY = 10
  const testaDentro = dentro(headSpans)
  const cop = (id, celle, { fili = [], rifl = [], lt = 2, dk = 2, dopo } = {}) => {
    const S = new Set()
    for (const [x, y] of celle) { const cx = x + OX, cy = y + OY; if (cx >= 1 && cy >= 1 && cx < HW - 1 && cy < HH - 1) S.add(cx + "," + cy) }
    const xy = (k) => k.split(",").map(Number)
    sprite("_cop_" + id + "0", { w: HW, h: HH }, (c) => {
      for (const k of S) c.px(...xy(k), "b")
      for (const k of S) { const [x, y] = xy(k)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!S.has((x + dx) + "," + (y + dy))) c.px(x + dx, y + dy, "k") }
    })
    sprite("copricapo_" + id, { base: "_cop_" + id + "0" }, toon(lt, dk), (c) => {
      const P = (x, y, k) => { if (c.is(x + OX, y + OY, "b") || c.is(x + OX, y + OY, "c") || c.is(x + OX, y + OY, "a")) c.px(x + OX, y + OY, k) }
      for (const pts of fili) for (const [x, y] of ln(pts)) P(x, y, "a")
      for (const [x, y] of rifl) if (c.is(x + OX, y + OY, "c")) c.px(x + OX, y + OY, "d")
      if (dopo) dopo(P, c)
    })
  }

  // cappelli
  cop("cappellino", uni(bande([[-2, 3, 11], [-1, 1, 13], [0, 0, 14], [2, -1, 14], [4, -1, 14], [5, -1, 12], [6, 0, 8]]), bande([[3, 13, 19], [4, 13, 20], [5, 13, 20], [6, 14, 18]]), disco(7, -3, 1.3)),
    { fili: [[[7, -2], [7, 4]], [[3, -1], [5, 4]], [[11, 0], [10, 4]]], rifl: [[5, -1], [6, -1]], dopo: (P) => { P(7, -3, "d"); for (let x = 14; x <= 19; x++) P(x, 5, "a") } })
  cop("berretto", uni(bande([[-4, 4, 9], [-3, 2, 11], [-2, 0, 13], [-1, -1, 14], [1, -2, 14], [5, -2, 14], [8, -2, 12], [10, -1, 8]]), disco(6, -6, 2.8)),
    { fili: [[[1, 6], [1, 10]], [[3, 6], [3, 10]], [[5, 6], [5, 10]], [[7, 6], [7, 10]], [[9, 6], [9, 10]], [[11, 6], [11, 9]]], rifl: [[4, -4], [5, -4]],
      dopo: (P) => { for (let x = -1; x <= 14; x++) { P(x, 3, "c"); P(x, 4, "a") } P(5, -7, "d"); P(6, -7, "d") } })
  cop("tesalarga", uni(bande([[-5, 3, 10], [-4, 2, 11], [-3, 2, 11], [-2, 2, 11], [-1, 2, 11], [0, 2, 11]]), bande([[1, -6, 19], [2, -7, 20], [3, -6, 19]])),
    { fili: [[[3, -4], [3, 0]], [[10, -4], [10, 0]]], rifl: [[5, -5], [6, -5]], dopo: (P) => { for (let x = 2; x <= 11; x++) P(x, 0, "a") } })
  cop("elmetto", bande([[-3, 3, 10], [-2, 1, 12], [-1, -1, 13], [0, -2, 14], [2, -2, 14], [5, -2, 14], [8, -2, 13], [10, -1, 9], [12, 0, 6], [13, 1, 5]]),
    { fili: [[[1, -2], [8, -3], [14, 1]], [[1, 8], [8, 9], [12, 6]]], rifl: [[3, -3], [4, -3], [5, -3]],
      dopo: (P) => { for (let y = 0; y <= 6; y++) P(8, y, "d"); for (let x = -1; x <= 4; x++) P(x, 11, "a") } })
  cop("bandana", uni(bande([[-1, 2, 11], [0, 0, 13], [1, -1, 14], [2, -1, 14], [3, -1, 14], [4, -1, 13], [5, 0, 12]]), disco(-2, 5, 2.2),
      ln([[-2, 6], [-6, 11], [-7, 13]], 2), ln([[-1, 6], [-3, 12]], 2)),
    { fili: [[[2, 3], [12, 3]], [[-2, 4], [-5, 10]]], rifl: [[4, 0], [8, 0]],
      dopo: (P) => { for (const [x, y] of [[3, 1], [6, 2], [9, 1], [5, 4], [11, 3], [1, 3]]) P(x, y, "d"); P(-3, 4, "k"); P(-2, 4, "k") } })

  // maschere
  cop("antigas", uni(bande([[4, 8, 14], [5, 7, 14], [6, 7, 14], [7, 7, 14], [8, 7, 15], [9, 7, 15], [10, 8, 15], [11, 9, 15], [12, 9, 14], [13, 10, 13]]),
      bande([[10, 14, 19], [11, 14, 20], [12, 14, 19]]), ln([[8, 4], [0, 2]], 2), ln([[8, 8], [0, 9]], 2)),
    { fili: [[[16, 10], [16, 12]], [[18, 10], [18, 12]]], rifl: [[9, 5], [10, 5]],
      dopo: (P) => { for (const [x, y] of [[10, 5], [11, 5], [12, 5], [10, 6], [11, 6], [12, 6]]) P(x, y, "d"); for (let y = 5; y <= 7; y++) P(9, y, "k"); P(19, 11, "k") } })
  cop("hockey", uni(bande([[3, 9, 14], [4, 8, 15], [5, 8, 15], [6, 8, 15], [7, 8, 15], [8, 8, 15], [9, 8, 15], [10, 8, 15], [11, 9, 15], [12, 9, 14], [13, 10, 13]]),
      ln([[8, 4], [0, 3]], 1), ln([[8, 9], [0, 10]], 1)),
    { fili: [[[11, 4], [11, 13]]], rifl: [[13, 4], [14, 5]],
      dopo: (P) => { for (const [x, y] of [[12, 6], [13, 6], [14, 6], [12, 7], [13, 7], [14, 7]]) P(x, y, "k"); for (const [x, y] of [[10, 9], [12, 9], [10, 11], [12, 11], [11, 10], [13, 10]]) P(x, y, "a") } })
  cop("chirurgica", uni(bande([[8, 9, 14], [9, 9, 15], [10, 9, 15], [11, 9, 15], [12, 10, 14]]), ln([[9, 8], [6, 6]], 1), ln([[9, 11], [6, 12]], 1)),
    { lt: 1, dk: 1, fili: [[[10, 10], [15, 10]]], dopo: (P) => { P(10, 9, "c"); P(11, 11, "c") } })
  cop("passamontagna", uni(bande([[-1, 4, 11], [0, 1, 13], [1, 0, 14], [3, 0, 14], [6, 0, 14], [9, 0, 14], [11, 1, 14], [13, 2, 13], [14, 3, 12], [15, 4, 9], [19, 4, 9]]).filter(([x, y]) => !(y >= 5 && y <= 7 && x >= 8)),
      []),
    { fili: [[[2, 3], [2, 10]], [[4, 8], [4, 15]], [[6, 12], [6, 16]], [[10, 12], [12, 12]]], rifl: [[5, 0], [6, 0]] })
  cop("domino", uni(bande([[4, 8, 14], [5, 7, 15], [6, 7, 15], [7, 8, 14], [8, 9, 13]]), ln([[8, 5], [0, 4]], 1)),
    { fili: [[[8, 6], [14, 6]]], rifl: [[9, 5], [10, 5]], dopo: (P) => { for (const [x, y] of [[10, 6], [11, 6], [13, 6], [12, 6]]) P(x, y, "k") } })

  const cn = ["cappellino", "berretto", "tesalarga", "elmetto", "bandana", "antigas", "hockey", "chirurgica", "passamontagna", "domino"]
  scene("copricapo_anteprima", { w: 10 * 38, h: 50, bg: "#4a5160" },
    ...cn.flatMap((id, i) => { const x = i * 38 + 14, y = 12
      return [stamp("busto_sup", x, y + 18), stamp("testa", x, y), stamp("copricapo_" + id, x - OX, y - OY)] }))

  // cyberpunk (5 maschere): stesse regole dei copricapo precedenti
  cop("visore", uni(bande([[5, 0, 15], [6, 0, 16], [7, 0, 15], [8, 7, 14]]), ln([[1, 5], [0, -1]])),
    { fili: [[[2, 5], [7, 5]]], rifl: [[3, 5]], dopo: (P) => { for (let x = 9; x <= 15; x++) P(x, 6, "d"); P(8, 6, "k"); P(7, 6, "k") } })
  cop("respiratore", uni(bande([[8, 7, 15], [9, 6, 15], [10, 6, 14], [11, 6, 14], [12, 6, 14], [13, 7, 13]]), disco(7, 11, 2.6), ln([[6, 8], [0, 5]]),
      ln([[8, 13], [8, 18], [11, 21]], 2)),
    { fili: [[[11, 9], [11, 13]], [[13, 9], [13, 13]]], rifl: [[14, 9]],
      dopo: (P) => { for (const [x, y] of [[7, 10], [7, 12], [6, 11], [8, 11]]) P(x, y, "k"); P(7, 11, "d") } })
  cop("oculare", uni(bande([[2, 1, 13], [3, 0, 14]]), disco(11, 6, 3.1), ln([[12, 3], [15, -2]])),
    { fili: [[[2, 2], [12, 2]]], rifl: [[3, 2]],
      dopo: (P) => { for (const [x, y] of disco(11, 6, 1.7)) P(x, y, "k"); P(11, 5, "d"); P(12, 5, "d"); P(11, 6, "d") } })
  cop("casco", bande([[-1, 3, 11], [0, 1, 13], [1, -1, 15], [3, -2, 15], [8, -2, 16], [12, -2, 15], [14, -1, 14], [15, 2, 13], [16, 3, 11]]),
    { fili: [[[2, -1], [8, -2], [14, 2]], [[10, 13], [15, 12]]], rifl: [[3, -1], [4, -1], [5, -1]],
      dopo: (P) => { for (const [x, y] of bande([[4, 8, 15], [5, 7, 16], [6, 7, 16], [7, 7, 16], [8, 8, 15], [9, 9, 14]])) P(x, y, "k")
        for (const [x, y] of [[10, 5], [11, 5], [9, 6]]) P(x, y, "d") } })
  cop("cyborg", bande([[2, 7, 13], [3, 6, 13], [4, 6, 14], [5, 6, 14], [6, 6, 14], [7, 6, 15], [8, 6, 15], [9, 6, 15], [10, 6, 14], [11, 7, 14], [12, 8, 13], [13, 9, 12]]),
    { fili: [[[10, 3], [10, 13]]], rifl: [[12, 3]],
      dopo: (P) => { for (const [x, y] of disco(11, 5.5, 1.6)) P(x, y, "k"); P(11, 5, "d"); P(12, 6, "d")
        for (const [x, y] of [[7, 3], [7, 11], [13, 11]]) P(x, y, "d"); for (let y = 8; y <= 12; y += 2) P(12, y, "k") } })

  const cyb = ["visore", "respiratore", "oculare", "casco", "cyborg"]
  scene("copricapo_cyber_anteprima", { w: 5 * 38, h: 50, bg: "#4a5160" },
    ...cyb.flatMap((id, i) => { const x = i * 38 + 14, y = 12
      return [stamp("busto_sup", x, y + 18), stamp("testa", x, y), stamp("copricapo_" + id, x - OX, y - OY)] }))
}

{
  // ---------------------------------------------------------------------------------------------------------------
  // FASCIATURE (STILE_SPRITE.md sez. 16): in palestra chi e' ferito non mostra sangue ne' carne ma una garza avvolta a spirale. Un overlay per pezzo
  // (stessa sagoma, indici di colore: arena.js li ricolora col crema di `aspetto.json: fasciature`), sopra pelle, vestiti e capelli. Il gioco
  // ne mostra una fetta della locazione, piu' larga quanto piu' grave e' la ferita (con macchie di sangue dal mezzo hp in giu'): qui si
  // disegna la fasciatura intera, lasciando scoperti giunti, polso e piede.
  const INDICI = ["k", "a", "b", "c", "d"]
  const pieno = (c, x, y) => INDICI.some((k) => c.is(x, y, k))
  const taglia = (fn) => (c) => { const v = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && fn(x, y)) v.push([x, y])
    for (const [x, y] of v) c.px(x, y, "_") }
  const bordo = (c) => { const v = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pieno(c, x, y) &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !pieno(c, x + dx, y + dy))) v.push([x, y])
    for (const [x, y] of v) c.px(x, y, "k") }
  const riga = (y, k, solo) => (c) => { for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && !c.is(x, y, "k") && (!solo || solo(x))) c.px(x, y, k) }
  // la garza: giri diagonali (un filo di luce sopra, l'ombra sotto), il tondo del corpo si legge ancora dal lato in ombra e da quello in luce
  const garza = (sh = 0, passo = 5, pend = 1) => (c) => { const v = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && !c.is(x, y, "k")) {
      const u = (x + pend * y + sh) % passo, ombra = c.is(x, y, "a"), luce = c.is(x, y, "d")
      v.push([x, y, u === 0 ? "a" : u === 1 ? "d" : ombra ? "a" : luce ? "c" : "b"]) }
    for (const [x, y, k] of v) c.px(x, y, k) }
  const fascia = (nome, base, y0, y1, ...altro) => sprite(nome, { base }, taglia((x, y) => y < y0 || y > y1), bordo, garza(), ...altro)

  fascia("fascia_testa", "testa", 1, 7, taglia((x, y) => y === 1 && (x < 4 || x > 11)), bordo, riga(7, "a"))      // un giro attorno alla fronte e al cranio
  fascia("fascia_busto_sup", "busto_sup", 2, 20, riga(20, "a"))
  fascia("fascia_busto_inf", "busto_inf", 0, 17, riga(17, "a"))
  fascia("fascia_braccio_sup", "braccio_sup_dx", 3, 21, riga(21, "a"))
  // l'avambraccio e' avambraccio + pugno: la garza copre il braccio e le nocche (come le bende da boxe), non il polso
  sprite("fascia_avambraccio", { base: "avambraccio_dx" }, taglia((x, y) => y < 2 || (y > 12 && y < 15) || y > 24), bordo, garza(1), riga(12, "a"), riga(24, "a"))
  fascia("fascia_coscia", "coscia_dx", 3, 22, riga(22, "a"))
  fascia("fascia_stinco", "stinco_dx", 2, 25, riga(25, "a"))

  const par = ["testa", "busto_sup", "busto_inf", "braccio_sup", "avambraccio", "coscia", "stinco"]
  scene("fasciature_anteprima", { w: 7 * 24, h: 40, bg: "#4a5160" },
    ...par.flatMap((n, i) => { const base = n === "braccio_sup" || n === "avambraccio" || n === "coscia" || n === "stinco" ? n + "_dx" : n
      return [stamp(base, i * 24 + 3, 4), stamp("fascia_" + n, i * 24 + 3, 4)] }))
}

{
  // ---------------------------------------------------------------------------------------------------------------
  // TRENCH: un cappotto lungo. Il busto e le maniche sono overlay come gli altri; la FALDA (le due ante che scendono fino a meta' coscia, sotto il
  // ginocchio) e' invece un pezzo staccato del modello (`maglia_trench_falda`, v. aspetto.json -> "falda"): non fa parte delle gambe, e' appeso
  // al busto basso e ne segue la posa, con un piccolo ritardo (arena.js). Coordinate della falda: x verso il petto, (0,0) = angolo alto-sinistro.
  const INDICI = ["k", "a", "b", "c", "d"]
  const pieno = (c, x, y) => INDICI.some((k) => c.is(x, y, k))
  const riga = (y, k, solo) => (c) => { for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && !c.is(x, y, "k") && (!solo || solo(x))) c.px(x, y, k) }
  const punti = (lista, k) => (c) => { for (const [x, y] of lista) if (pieno(c, x, y) && !c.is(x, y, "k")) c.px(x, y, k) }
  const V = (nome, base, ...ops) => sprite(nome, { base }, ...ops)
  const BS = "busto_sup", BI = "busto_inf"
  V("maglia_trench_busto_sup", BS, punti([[9, 1], [8, 2], [7, 3], [6, 4], [5, 5], [4, 6]], "a"), punti([[10, 1], [9, 2], [8, 3], [7, 4], [6, 5], [5, 6]], "c"),
    punti([[3, 1], [3, 2]], "c"), punti([8, 11, 14, 17].flatMap((y) => [[8, y], [10, y]]), "d"), riga(18, "a", (x) => x >= 6))
  V("maglia_trench_busto_inf", BI, punti([2, 5, 8].flatMap((y) => [[8, y], [10, y]]), "d"), riga(11, "a"), riga(12, "c"),
    punti([[8, 11], [9, 11], [10, 11], [9, 12]], "d"))

  const FW = 21, FH = 31, HEM = 28
  const sx = (y) => Math.round(3 - 2 * y / HEM)                         // bordo dietro: si allarga scendendo
  const dx = (y) => Math.round(16 + 2 * y / HEM)                        // bordo davanti
  const fine = (x, y) => y < HEM - 2 + Math.round(2 * (x - 1) / 16)      // l'orlo e' obliquo: piu' corto dietro, piu' lungo davanti
  const F = new Set()
  for (let y = 0; y < HEM; y++) for (let x = sx(y); x <= dx(y); x++) if (fine(x, y)) F.add(x + "," + y)
  sprite("_falda0", { w: FW, h: FH }, (c) => {
    for (const k of F) c.px(...k.split(",").map(Number), "b")
    for (const k of F) { const [x, y] = k.split(",").map(Number)
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!F.has((x + ax) + "," + (y + ay))) c.px(x + ax, y + ay, "k") }
  })
  sprite("maglia_trench_falda", { base: "_falda0" }, toon(2, 1), (c) => {
    const su = (x, y, k) => { if (c.is(x, y, "b") || c.is(x, y, "c") || c.is(x, y, "a")) c.px(x, y, k) }
    for (let y = 0; y < HEM; y++) {
      su(dx(y) - 3, y, "a")                                              // l'apertura davanti (cappotto doppiopetto)
      if (y > 17) su(sx(y) + 4, y, "a")                                  // lo spacco dietro
      if (y > 3 && y % 5 !== 0) su(sx(y) + 8, y, "a")                    // una piega
    }
    for (const y of [3, 8, 13, 18, 23]) { su(dx(y) - 2, y, "d"); su(dx(y) - 5, y, "d") }       // i bottoni
    for (let x = 1; x < FW - 1; x++) if (c.is(x, 0, "b") || c.is(x, 0, "c")) c.px(x, 0, "a")  // dove la falda si attacca alla cintura
  })
  scene("trench_anteprima", { w: 70, h: 90, bg: "#4a5160" }, stamp("coscia_dx", 22, 52), stamp("stinco_dx", 22, 76), stamp("busto_sup", 20, 4), stamp("busto_inf", 20, 25),
    stamp("maglia_trench_busto_sup", 20, 4), stamp("maglia_trench_busto_inf", 20, 25), stamp("maglia_trench_falda", 17, 38))
}

{
  // ---------------------------------------------------------------------------------------------------------------
  // DIECI CAPPOTTI CYBERPUNK sul modello del trench: busto e maniche come overlay, falda staccata (v. blocco "TRENCH") ma ogni cappotto ha la sua:
  // lunghezza (da giubbotto a pochi px da terra) e sagoma (dritta, asimmetrica, a coda di rondine, a mantello, a frange, a piastre, a strascico,
  // aderente con spacco, a zig-zag). Per ognuno `falda(id, {...})`: riga(y) = [x0, x1] della riga, hem(x) = riga dove finisce la colonna x, forato(x, y)
  // = buchi (frange, spacchi, fessure tra le piastre), dett = i dettagli. La falda attacca al busto basso alla riga 13: la cima e' larga 14 px a x = pad.
  const INDICI = ["k", "a", "b", "c", "d"]
  const pieno = (c, x, y) => INDICI.some((k) => c.is(x, y, k))
  const riga = (y, k, solo) => (c) => { for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && !c.is(x, y, "k") && (!solo || solo(x))) c.px(x, y, k) }
  const punti = (lista, k) => (c) => { for (const [x, y] of lista) if (pieno(c, x, y) && !c.is(x, y, "k")) c.px(x, y, k) }
  const pixel = (fn) => (c) => { const v = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pieno(c, x, y) && !c.is(x, y, "k")) { const k = fn(x, y); if (k) v.push([x, y, k]) }
    for (const [x, y, k] of v) c.px(x, y, k) }
  const vert = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i])
  const orizz = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y])
  const scatola = (x0, y0, x1, y1) => [...orizz(y0, x0, x1), ...orizz(y1, x0, x1), ...vert(x0, y0, y1), ...vert(x1, y0, y1)]
  const V = (nome, base, ...ops) => sprite(nome, { base }, ...ops)
  const BS = "busto_sup", BI = "busto_inf"
  const R = Math.round
  const CIRC = (x, y) => { const u = x % 10, v = y % 8
    return (v === 1 && u >= 1 && u <= 5) || (u === 5 && v >= 1 && v <= 4) || (v === 4 && u >= 5 && u <= 9) ? ((u === 1 && v === 1) || (u === 9 && v === 4) ? "d" : "a") : null }
  const lin = (x0, y0, x1, y1, fn) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let i = 0; i <= n; i++) fn(R(x0 + (x1 - x0) * i / n), R(y0 + (y1 - y0) * i / n)) }

  const falda = (id, { w, h, riga: righe, hem, forato = () => false, dett }) => {
    const F = new Set()
    for (let y = 0; y < h - 1; y++) { const [a, b] = righe(y); for (let x = a; x <= b; x++) if (y < hem(x) && !forato(x, y)) F.add(x + "," + y) }
    sprite("_f_" + id + "0", { w, h }, (c) => {
      for (const k of F) c.px(...k.split(",").map(Number), "b")
      for (const k of F) { const [x, y] = k.split(",").map(Number)
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!F.has((x + ax) + "," + (y + ay))) c.px(x + ax, y + ay, "k") }
    })
    sprite("maglia_" + id + "_falda", { base: "_f_" + id + "0" }, toon(2, 1), (c) => {
      const su = (x, y, k) => { if (c.is(x, y, "b") || c.is(x, y, "c") || c.is(x, y, "a")) c.px(x, y, k) }
      dett(su, righe, hem)
      for (let x = 0; x < w; x++) if (c.is(x, 0, "b") || c.is(x, 0, "c")) c.px(x, 0, "a")     // dove la falda si attacca alla cintura
    })
  }

  // 1. NEON: dritto, quasi al polpaccio, bordi e orlo al neon
  falda("trench_neon", { w: 20, h: 46, riga: (y) => [3 - R(y / 40), 16 + R(y / 40)], hem: () => 41,
    dett: (su, rg) => { for (let y = 1; y < 41; y++) { const [a, b] = rg(y); su(b - 1, y, "d"); if (y > 24) su(a + 4, y, "a"); if (y % 7) su(a + 7, y, "a") }
      for (let x = 2; x < 18; x++) su(x, 40, "d") } })
  V("maglia_trench_neon_busto_sup", BS, riga(1, "c"), riga(2, "c"), punti(vert(4, 4, 19), "d"), punti(vert(8, 4, 19), "d"), punti(vert(3, 4, 19), "k"))
  V("maglia_trench_neon_busto_inf", BI, punti(vert(4, 0, 10), "d"), punti(vert(8, 0, 10), "d"), punti(vert(3, 0, 10), "k"), riga(11, "a"), riga(12, "d"))

  // 2. ASIMMETRICO: l'orlo scende in diagonale, corto dietro e lungo davanti
  falda("trench_asimm", { w: 28, h: 44, riga: (y) => [4 - R(y / 25), 17 + R(y / 12)], hem: (x) => Math.min(40, 14 + R((x - 2) * 1.5)),
    dett: (su, rg, hem) => { for (let x = 2; x < 28; x++) { const e = hem(x); su(x, e - 1, "d"); su(x, e - 6, "a") }
      for (let y = 2; y < 38; y++) { const [, b] = rg(y); su(b - 3, y, "a"); if (y % 4 === 1) su(b - 2, y, "d") } } })
  V("maglia_trench_asimm_busto_sup", BS, punti(ln([[4, 2], [10, 18]]), "k"), punti(ln([[5, 2], [11, 18]]), "a"), punti(orizz(1, 3, 6), "c"), punti(orizz(2, 3, 5), "c"))
  V("maglia_trench_asimm_busto_inf", BI, punti(ln([[7, 0], [11, 10]]), "k"), punti(ln([[8, 0], [12, 10]]), "a"), riga(11, "a"), riga(12, "c"))

  // 3. CORTO: un giubbotto-cappotto, la falda arriva appena sotto il bacino, svasata
  falda("trench_corto", { w: 22, h: 18, riga: (y) => [3 - R(y * 1.5 / 14), 16 + R(y * 1.5 / 14)], hem: () => 15,
    dett: (su, rg) => { for (let y = 1; y < 15; y++) { const [, b] = rg(y); su(b - 3, y, "a") }
      for (const [x, y] of [...scatola(5, 5, 8, 8), ...scatola(11, 5, 14, 8)]) su(x, y, "a")
      for (let x = 3; x < 17; x += 2) { su(x, 13, "d"); su(x, 14, "a") } } })
  V("maglia_trench_corto_busto_sup", BS, riga(0, "c"), riga(1, "c"), riga(2, "a"), punti(vert(10, 3, 19), "k"), punti([[9, 3], [9, 5], [9, 7]], "d"))
  V("maglia_trench_corto_busto_inf", BI, punti(vert(10, 0, 12), "k"), riga(11, "a"), riga(12, "c"), punti([[2, 11], [5, 11], [8, 11]], "d"))

  // 4. CODA DI RONDINE: la falda si apre in due code lunghe ai lati, col vuoto in mezzo
  falda("trench_coda", { w: 20, h: 42, riga: (y) => [3 - R(y / 30), 16 + R(y / 30)], hem: (x) => 22 + Math.min(14, R(Math.abs(x - 9.5) * 2)),
    dett: (su, rg, hem) => { for (let y = 1; y < 22; y++) su(9, y, "a")
      for (let x = 2; x < 18; x++) su(x, hem(x) - 1, "d")
      for (let y = 4; y < 34; y++) { su(5, y, y % 6 ? "a" : "c"); su(14, y, y % 6 ? "a" : "c") } } })
  V("maglia_trench_coda_busto_sup", BS, punti([[9, 1], [8, 2], [7, 3], [6, 4], [5, 5], [4, 6]], "a"), punti([[10, 1], [9, 2], [8, 3], [7, 4], [6, 5], [5, 6]], "c"),
    punti(scatola(3, 12, 6, 14), "a"), riga(18, "a"))
  V("maglia_trench_coda_busto_inf", BI, riga(11, "a"), riga(12, "c"), punti([[8, 11], [9, 11], [10, 11], [9, 12]], "d"), punti(vert(9, 0, 10), "a"))

  // 5. MANTELLO: una A larga, a campana, che si apre molto dietro; pieghe a raggiera
  falda("trench_manto", { w: 30, h: 38, riga: (y) => [7 - R(6 * y / 30), 20 + R(7 * y / 30)], hem: (x) => 31 + R(3 * Math.sin(Math.PI * (x - 1) / 26)),
    dett: (su) => { for (let k = 0; k < 5; k++) { const x0 = 8 + 3 * k, x1 = x0 + (k - 2) * 5
        lin(x0, 2, x1, 31, (x, y) => { su(x, y, "a"); su(x + 1, y, "c") }) }
      for (let y = 1; y < 4; y++) su(19, y, "d") } })
  V("maglia_trench_manto_busto_sup", BS, riga(0, "c"), riga(1, "c"), riga(2, "c"), riga(3, "a"), punti([[9, 4], [9, 5]], "d"), riga(7, "a"))
  V("maglia_trench_manto_busto_inf", BI, punti(ln([[2, 0], [3, 10]]), "a"), punti(ln([[6, 0], [7, 10]]), "a"), punti(ln([[10, 0], [11, 10]]), "a"), riga(11, "a"))

  // 6. FRANGE: dritto e lungo, tagliato in strisce di lunghezze diverse (quelle sotto la riga 26)
  falda("trench_frange", { w: 20, h: 47, riga: (y) => [3 - R(y / 40), 16 + R(y / 40)], hem: (x) => 32 + ((x * 7) % 5) * 3, forato: (x, y) => y >= 26 && x % 3 === 0,
    dett: (su, rg, hem) => { for (let x = 2; x < 18; x++) if (x % 3) su(x, hem(x) - 1, "d")
      for (let x = 2; x < 18; x++) { su(x, 24, "a"); su(x, 25, "c") } } })
  V("maglia_trench_frange_busto_sup", BS, riga(1, "c"), riga(2, "a"), ...[3, 5, 7].map((y) => riga(y, "a", (x) => x % 2 === 0)), punti(vert(10, 4, 19), "k"))
  V("maglia_trench_frange_busto_inf", BI, punti(vert(10, 0, 12), "k"), riga(10, "a"), riga(11, "c"))

  // 7. PIASTRE: la falda e' una gonna di tre piastre, con le fessure in mezzo (restano i cavi al centro)
  falda("trench_piastre", { w: 20, h: 44, riga: (y) => [3 - R(y / 40), 16 + R(y / 40)], hem: () => 40,
    forato: (x, y) => ((y >= 12 && y < 14) || (y >= 26 && y < 28)) && !(x >= 9 && x <= 10),
    dett: (su, rg) => { for (const [y0, y1] of [[0, 11], [14, 25], [28, 39]]) { const [a0, b0] = rg(y0)
        for (let x = 2; x < 18; x++) { su(x, y0 + 1, "c"); su(x, y1, "a") }
        su(a0 + 2, y0 + 3, "d"); su(b0 - 2, y0 + 3, "d"); su(a0 + 2, y1 - 2, "d"); su(b0 - 2, y1 - 2, "d") }
      for (const y of [12, 13, 26, 27]) { su(9, y, "a"); su(10, y, "d") } } })
  V("maglia_trench_piastre_busto_sup", BS, punti(scatola(3, 6, 9, 12), "a"), punti(vert(6, 7, 11), "c"), punti(orizz(1, 3, 5), "d"), punti(orizz(2, 3, 5), "c"))
  V("maglia_trench_piastre_busto_inf", BI, riga(11, "a"), riga(12, "c"), punti([[3, 3], [9, 3], [3, 8], [9, 8]], "d"))

  // 8. STRASCICO: lo spolverino lungo, che dietro trascina quasi per terra e davanti e' molto piu' corto
  falda("trench_strascico", { w: 31, h: 48, riga: (y) => [14 - R(y * 0.3), 27 + R(y * 0.04)], hem: (x) => 44 - R(Math.max(0, x - 12) * 1.1),
    dett: (su, rg, hem) => { for (let y = 8; y < 44; y++) { const [a] = rg(y); su(a + 3, y, "a"); if (y > 16) su(a + 7, y, "a") }
      for (let x = 2; x < 30; x++) su(x, hem(x) - 1, "c") } })
  V("maglia_trench_strascico_busto_sup", BS, punti(ln([[3, 1], [9, 16]]), "k"), punti(ln([[4, 1], [10, 16]]), "a"), riga(1, "c"), riga(16, "c"), riga(17, "a"))
  V("maglia_trench_strascico_busto_inf", BI, riga(11, "a"), riga(12, "c"), punti([[9, 11], [9, 12]], "d"), punti(vert(10, 0, 10), "k"))

  // 9. ADERENTE: stretto come una matita fino alla caviglia, con uno spacco davanti
  falda("trench_aderente", { w: 20, h: 52, riga: (y) => [3 + R(y / 30), 16 - R(y / 30)], hem: () => 46, forato: (x, y) => y > 28 && x === 16 - R(y / 30) - 3,
    dett: (su, rg) => { for (let y = 1; y < 46; y++) { const [a, b] = rg(y); su(a + 3, y, "a"); su(b - 5, y, y % 5 ? "a" : "d") }
      for (let x = 3; x < 17; x++) { su(x, 44, "c"); su(x, 45, "a") } } })
  V("maglia_trench_aderente_busto_sup", BS, riga(1, "c"), riga(2, "a"), punti(vert(4, 4, 19), "a"), punti(vert(9, 4, 19), "a"), punti([[9, 6], [9, 10], [9, 14]], "d"))
  V("maglia_trench_aderente_busto_inf", BI, punti(vert(4, 0, 10), "a"), punti(vert(9, 0, 10), "a"), riga(11, "a"), riga(12, "c"))

  // 10. ZIG-ZAG: l'orlo a dente di sega, con le piste del circuito sul tessuto
  falda("trench_zigzag", { w: 22, h: 38, riga: (y) => [3 - R(y * 1.5 / 36), 16 + R(y * 1.5 / 36)], hem: (x) => 24 + Math.abs(((x * 2) % 12) - 6) * 2,
    dett: (su, rg, hem) => { for (let y = 1; y < 34; y++) for (let x = 1; x < 20; x++) { const k = CIRC(x, y); if (k) su(x, y, k) }
      for (let x = 2; x < 19; x++) su(x, hem(x) - 1, "d") } })
  V("maglia_trench_zigzag_busto_sup", BS, riga(1, "c"), riga(2, "a"), pixel((x, y) => y > 2 ? CIRC(x, y) : null))
  V("maglia_trench_zigzag_busto_inf", BI, pixel((x, y) => CIRC(x, y + 19)), riga(11, "a"))

  const ID = ["trench_neon", "trench_asimm", "trench_corto", "trench_coda", "trench_manto", "trench_frange", "trench_piastre", "trench_strascico", "trench_aderente", "trench_zigzag"]
  scene("trench_cyber_anteprima", { w: 10 * 44, h: 100, bg: "#4a5160" },
    ...ID.flatMap((id, i) => { const x = i * 44 + 16, pad = { trench_manto: 7, trench_strascico: 14, trench_asimm: 4 }[id] ?? 3
      return [stamp("coscia_dx", x + 2, 58), stamp("stinco_dx", x + 2, 82), stamp("busto_sup", x, 4), stamp("busto_inf", x, 25),
        stamp("maglia_" + id + "_busto_sup", x, 4), stamp("maglia_" + id + "_busto_inf", x, 25), stamp("maglia_" + id + "_falda", x - pad, 38)] }))
}
