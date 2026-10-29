// Corpo base maschile, grigio neutro, VISTA DI PROFILO rivolto a destra (si specchia per guardare a sinistra).
// 5 grigi fissi (k contorno, a ombra, b base, c luce, d riflesso): la skin si cambia con una mappa
// indice -> colore, quindi NON aggiungere altri grigi. La luce arriva da davanti-alto, cosi' resta
// dal lato dell'avversario anche quando lo sprite viene specchiato.
// Proporzioni: cranio 14px interno, altezza totale 111px (~7 teste), arti sottili come nel reference.
// Regole complete (palette, luce, tagli, giunti, overlay): STILE_SPRITE.md nella radice del progetto.
pal({ k: "#262626", a: "#6a6a6a", b: "#8e8e8e", c: "#b2b2b2", d: "#d8d8d8",
  // interno (scheletro e viscere, v. fondo del file): colori veri, NON ricolorati dal gioco.
  s: "#3a2c28", t: "#8d7e66", o: "#cfc2a2", p: "#efe5c8", q: "#fffaea",           // osso: ombra, base, luce, riflesso
  M: "#2a0b14", n: "#4d1022", m: "#74202f", l: "#963440", L: "#b8575d",           // carne: contorno, ombra, base, luce, riflesso
  v: "#7c3a52", u: "#b0607a", w: "#cf8499",                                       // polmoni
  H: "#9c1628", h: "#c8293c",                                                     // cuore
  j: "#a2606c", i: "#cc8c94", g: "#e3b0b4" })                                     // intestino
ramps("abcd")

// Forma piatta in "b" + contorno, poi luce: `lt` px di luce sul bordo davanti/alto, `dk` px di ombra
// sul bordo dietro e 1px sotto. Va applicata DOPO il contorno (parte da una base).
const dist = (c, x, y, dx, dy) => { let n = 0; while (c.is(x + dx * (n + 1), y + dy * (n + 1), "b")) n++; return n }
const toon = (lt, dk) => (c) => {
  const out = []
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (!c.is(x, y, "b")) continue
    const dark = dist(c, x, y, -1, 0) < dk || dist(c, x, y, 0, 1) === 0
    const lit = dist(c, x, y, 1, 0) < lt || dist(c, x, y, 0, -1) < lt
    out.push([x, y, dark ? "a" : lit ? "c" : "b"])
  }
  for (const [x, y, k] of out) c.px(x, y, k)
}

// ogni riga e' [x_dietro, x_davanti] inclusi; w = larghezza della tela
const rows = (w, spans) => spans.map(([a, b]) => ".".repeat(a) + "b".repeat(b - a + 1) + ".".repeat(w - 1 - b)).join("\n")
const rep = (n, span) => Array(n).fill(span)
// profilo da punti chiave [y, dietro, davanti], interpolati e arrotondati riga per riga
const lerp = (keys) => {
  const out = []
  for (let i = 0; i < keys.length - 1; i++) {
    const [y0, a0, b0] = keys[i], [y1, a1, b1] = keys[i + 1]
    for (let y = y0; y < y1; y++) { const t = (y - y0) / (y1 - y0); out.push([Math.round(a0 + (a1 - a0) * t), Math.round(b0 + (b1 - b0) * t)]) }
  }
  out.push(keys[keys.length - 1].slice(1))
  return out
}

// part: crea "_nome0" (piatto + contorno) e "nome" (con luci). hl = righe dove mettere il riflesso "d".
// far: arto lontano, un gradino piu' scuro.
const part = (name, spans, { lt = 1, dk = 1, hl = [], far = false } = {}) => {
  const w = Math.max(...spans.map((s) => s[1])) + 1
  sprite("_" + name + "0", { outline: "k" }, rows(w, spans))
  const refl = hl.flatMap(([y0, y1]) => Array.from({ length: y1 - y0 + 1 }, (_, i) => px(spans[y0 + i][1] + 2 - lt, y0 + i + 1, "d")))
  sprite(name, { base: "_" + name + "0" }, toon(lt, dk), ...refl, ...(far ? [shade()] : []))
}

// ---- TESTA (con collo): 14 di profondita', naso di 1px, mascella, nuca. Niente lineamenti.
const headSpans = [[4,9],[2,11],[1,12],[0,12],[0,12],[0,12],[0,12],[0,13],[0,13],[0,12],[0,12],[1,12],[2,11],[3,10],
  ...rep(4,[3,8])]
part("testa", headSpans, { lt: 2, dk: 2, hl: [[3, 5]] })

// ---- BUSTO: spalle/torace, vita, bacino con i glutei dietro. 11 di profondita' massima
const torsoSpans = lerp([[0,3,8],[2,1,9],[5,0,10],[12,0,10],[16,1,9],[24,2,9],[29,1,9],[33,0,10],[37,1,9]])
// Ogni pezzo e' tagliato a meta' (forme invariate, ma contorno e luce rifatti per ciascuna meta') per avere
// l'articolazione: busto in vita, braccio al gomito, gamba al ginocchio. La meta' bassa va posata con la riga
// di contorno alta sulla riga `taglio` della meta' alta (vedi parti.json), cosi' la sagoma resta quella intera.
const TAGLIO = { busto: 19, braccio: 22, gamba: 24 }
part("busto_sup", torsoSpans.slice(0, TAGLIO.busto), { lt: 2, dk: 2, hl: [[7, 10]] })
part("busto_inf", torsoSpans.slice(TAGLIO.busto), { lt: 2, dk: 2 })

// ---- BRACCIO: spalla tonda, gomito, avambraccio, mano. Il destro e' il piu' vicino alla camera.
const armSpans = [[1,3],...rep(21,[0,4]),...rep(12,[1,4]),...rep(2,[1,3]),...rep(10,[1,4]),[2,3]]
for (const [lato, far] of [["dx", false], ["sx", true]]) {
  part("braccio_sup_" + lato, armSpans.slice(0, TAGLIO.braccio), { hl: [[4, 9]], far })
  part("avambraccio_" + lato, armSpans.slice(TAGLIO.braccio), { hl: [[3, 9]], far })
}

// ---- GAMBA: coscia, ginocchio, polpaccio che sporge dietro, caviglia, piede lungo 15 verso davanti
const legSpans = [...rep(7,[0,6]),...rep(13,[0,5]),...rep(3,[1,5]),...rep(10,[0,5]),...rep(12,[1,5]),...rep(6,[1,4]),
  [1,5],[0,8],[0,12],[0,14],[0,14]]
for (const [lato, far] of [["dx", false], ["sx", true]]) {
  part("coscia_" + lato, legSpans.slice(0, TAGLIO.gamba), { hl: [[6, 14]], far })
  part("stinco_" + lato, legSpans.slice(TAGLIO.gamba), { hl: [[8, 18]], far })
}

// ---- Anteprima assemblata (non e' uno dei pezzi). Ordine: braccio e gamba lontani, gamba vicina, busto,
// testa, braccio vicino; ogni meta' bassa sopra la sua meta' alta. Stesse coordinate di parti.json.
scene("assemblato", { w: 48, h: 111, bg: "_" },
  stamp("braccio_sup_sx", 12, 21), stamp("avambraccio_sx", 12, 43),
  stamp("coscia_sx", 19, 53), stamp("stinco_sx", 19, 77),
  stamp("coscia_dx", 15, 53), stamp("stinco_dx", 15, 77),
  stamp("busto_sup", 14, 18), stamp("busto_inf", 14, 37), stamp("testa", 14, 0),
  stamp("braccio_sup_dx", 16, 21), stamp("avambraccio_dx", 16, 43))

sheet("parti", ["testa", "busto_*", "braccio_*", "avambraccio_*", "coscia_*", "stinco_*"], { cols: 11, pad: 2 })

// =====================================================================================================================
// INTERNO: scheletro e viscere (`scheletro_*`) e muscolo (`carne_*`) di ogni pezzo, stesse dimensioni e stessi perni del
// pezzo di pelle. Il gioco li disegna SOTTO la pelle (scheletro, poi carne, poi pelle) e cancella a macchie la pelle e poi la
// carne man mano che la locazione va in negativo (arena.js). Colori veri, non indici: niente ricolorazione.
// Ossa e organi sono forme riempite con luce davanti-in-alto come il resto (2-3 toni per materiale).
// =====================================================================================================================
const dentro = (spans) => (x, y) => y >= 1 && y <= spans.length && x >= spans[y - 1][0] + 1 && x <= spans[y - 1][1] + 1
const rc = (x, y, w, h) => { const o = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.push([x + i, y + j]); return o }
const el = (cx, cy, rx, ry) => { const o = []
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.02) o.push([x, y])
  return o }
const ln = (pts, th = 1) => { const o = []
  for (let i = 0; i < pts.length - 1; i++) {
    let [x0, y0] = pts[i]; const [x1, y1] = pts[i + 1]
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let e = dx - dy
    for (;;) {
      for (let t = 0; t < th; t++) o.push(dy > dx ? [x0 + t, y0] : [x0, y0 + t])
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * e
      if (e2 > -dy) { e -= dy; x0 += sx }
      if (e2 < dx) { e += dx; y0 += sy }
    }
  }
  return o }
// rampe [ombra, base, luce]
const OSSO = ["t", "o", "p"], ASTA = ["t", "o", "o"], COSTA = ["p", "p", "p"], BUIO = ["s", "s", "s"]
const POLM = ["v", "u", "w"], CUORE = ["H", "H", "h"], GUT = ["j", "i", "g"], GUTL = ["j", "j", "j"]
// riempie `celle` (solo dentro la sagoma): ombra dove manca il vicino a sinistra o sotto, luce dove manca a destra o sopra.
// `piatto`: un solo tono (linee da 1 px, costole)
const forma = (c, ok, celle, rampa, piatto = false) => {
  const S = new Set(celle.filter(([x, y]) => ok(x, y)).map(([x, y]) => x + "," + y))
  for (const k of S) {
    const [x, y] = k.split(",").map(Number), ha = (dx, dy) => S.has((x + dx) + "," + (y + dy))
    c.px(x, y, piatto ? rampa[1] : (!ha(-1, 0) || !ha(0, 1)) ? rampa[0] : (!ha(1, 0) || !ha(0, -1)) ? rampa[2] : rampa[1])
  }
}
const interno = (nome, w, h, spans, disegna, lontano = false) => {
  const ok = dentro(spans)
  const stile = (c) => disegna({ c, ok, F: (cel, ramp, piatto) => forma(c, ok, cel, ramp, piatto) })
  sprite("scheletro_" + nome, { w, h }, stile)
}
// vertebre: blocchi con un disco scuro in mezzo
const colonna = (F, x, larg, righe, dischi) => {
  for (const [y0, y1] of righe) F(rc(x, y0, larg, y1 - y0 + 1), ASTA)
  for (const y of dischi) F(rc(x, y, larg, 1), BUIO, true)
}

// ---- testa: cranio, orbita, naso, mascella con denti, vertebre del collo e trachea
interno("testa", 16, 20, headSpans, ({ F }) => {
  F(ln([[9, 14], [9, 18]], 2), GUT, true)                                           // trachea (anelli)
  for (const y of [15, 17]) F(rc(8, y, 2, 1), GUTL, true)
  colonna(F, 4, 3, [[14, 15], [17, 18]], [16])                                      // vertebre cervicali
  F(el(7, 7, 6.2, 6.2), OSSO)                                                       // calotta
  F(rc(9, 8, 5, 3), OSSO)                                                           // faccia: mascella superiore
  F(ln([[7, 8], [12, 9]], 1), ASTA, true)                                           // arco dello zigomo
  F(el(10.5, 6, 1.6, 1.6), BUIO)                                                    // orbita
  F(rc(13, 8, 1, 2), BUIO)                                                          // apertura nasale
  F(rc(11, 10, 3, 1), [ "q", "q", "q" ], true)                                      // denti di sopra
  F(rc(7, 8, 2, 5), OSSO)                                                           // ramo della mandibola
  F(ln([[7, 12], [12, 12]], 2), OSSO)                                               // corpo della mandibola
  F(rc(12, 11, 2, 3), OSSO)                                                         // mento
  F(rc(10, 11, 3, 1), [ "q", "q", "q" ], true)                                      // denti di sotto
  F(rc(6, 9, 1, 1), BUIO, true)                                                     // canale dell'orecchio
})

// ---- busto alto: polmoni e cuore sotto la gabbia toracica (costole, sterno, clavicola, scapola, colonna)
interno("busto_sup", 13, 21, torsoSpans.slice(0, TAGLIO.busto), ({ F }) => {
  F(el(7.5, 9.5, 3.4, 6), POLM)                                                     // polmoni
  F(el(9, 13.5, 2, 2.2), CUORE)                                                   // cuore
  for (const y of [3, 6, 9, 12, 15]) F(ln([[4, y], [7, y + 1], [10, y + 3]]), COSTA, true)   // costole
  F(rc(10, 4, 2, 10), OSSO)                                                         // sterno
  F(ln([[5, 2], [8, 2], [11, 3]]), COSTA, true)                                     // clavicola
  colonna(F, 2, 2, [[2, 4], [6, 8], [10, 12], [14, 16], [18, 19]], [5, 9, 13, 17])  // colonna toracica
})

// ---- busto basso: intestino, ultime costole, vertebre lombari, sacro e bacino
interno("busto_inf", 13, 21, torsoSpans.slice(TAGLIO.busto), ({ F }) => {
  F(el(7.5, 5.5, 4, 4.6), GUT)                                                      // intestino
  F(ln([[4, 3], [6, 2], [9, 3]]), GUTL, true)                                       // anse
  F(ln([[4, 6], [7, 5], [10, 6]]), GUTL, true)
  F(ln([[5, 8], [8, 7], [10, 8]]), GUTL, true)
  F(ln([[4, 1], [7, 2], [9, 3]]), COSTA, true)                                      // ultima costola fluttuante
  colonna(F, 2, 3, [[1, 3], [5, 7]], [4, 8])                                        // vertebre lombari
  F(ln([[3, 9], [3, 12], [2, 15]], 2), OSSO)                                        // sacro e coccige
  F(el(6.5, 12, 3.2, 3.6), OSSO)                                                    // ala iliaca
  F(ln([[4, 8], [8, 8]]), COSTA, true)                                              // cresta iliaca
  F(rc(7, 14, 2, 3), BUIO, true)                                                    // forame otturatorio
  F(rc(5, 16, 3, 3), OSSO)                                                          // ischio
  F(rc(9, 15, 2, 3), OSSO)                                                          // pube
  F(rc(6, 17, 2, 1), BUIO, true)                                                    // cavita' dell'anca
})

// ---- braccio e avambraccio (vicino `dx`, lontano `sx` = ossa un gradino piu' scure)
const armSup = ({ F }) => {
  F(el(3, 3, 2.3, 2.3), OSSO)                                                       // testa dell'omero
  F(rc(3, 5, 2, 14), ASTA)                                                          // diafisi
  F(rc(2, 19, 4, 4), OSSO)                                                          // condili
  F(rc(3, 21, 2, 1), BUIO, true)                                                    // fossa del gomito
}
const forearm = ({ F }) => {
  F(rc(2, 1, 2, 3), OSSO)                                                           // olecrano
  F(ln([[3, 3], [3, 13]], 1), ASTA, true)                                           // ulna
  F(ln([[4, 3], [4, 13]], 1), OSSO, true)                                           // radio
  F(rc(3, 13, 3, 2), OSSO)                                                          // carpo
  F(rc(3, 15, 3, 5), OSSO)                                                          // metacarpi
  F(rc(3, 21, 3, 2), ASTA)                                                          // falangi
  F(rc(3, 20, 3, 1), BUIO, true); F(rc(3, 23, 2, 1), BUIO, true)                    // nocche
}
// ---- coscia (femore) e stinco (tibia, perone) con il piede
const thigh = ({ F }) => {
  F(el(4, 4, 2.4, 2.4), OSSO)                                                       // testa del femore
  F(rc(2, 5, 2, 2), OSSO)                                                           // grande trocantere
  F(rc(3, 7, 3, 14), ASTA)                                                          // diafisi
  F(rc(2, 21, 5, 4), OSSO)                                                          // condili
  F(el(5.5, 23, 1, 1.5), ["o", "p", "q"])                                           // rotula
  F(rc(3, 22, 2, 1), BUIO, true)
}
const shin = ({ F }) => {
  F(rc(2, 1, 4, 3), OSSO)                                                           // piatto tibiale
  F(rc(3, 4, 2, 20), ASTA)                                                          // tibia
  F(ln([[2, 5], [2, 24]], 1), OSSO, true)                                           // perone
  F(rc(3, 24, 3, 3), OSSO)                                                          // malleoli
  F(el(3.5, 30, 2.4, 2.2), OSSO)                                                    // calcagno
  F(ln([[5, 29], [8, 30], [13, 30]], 2), OSSO)                                      // tarso e metatarsi
  F(ln([[13, 31], [15, 31]], 1), ASTA, true)                                        // dita
}
const armSupSp = armSpans.slice(0, TAGLIO.braccio), forearmSp = armSpans.slice(TAGLIO.braccio)
const thighSp = legSpans.slice(0, TAGLIO.gamba), shinSp = legSpans.slice(TAGLIO.gamba)
interno("braccio_sup_dx", 7, 24, armSupSp, armSup)
interno("avambraccio_dx", 7, 27, forearmSp, forearm)
interno("coscia_dx", 9, 26, thighSp, thigh)
interno("stinco_dx", 17, 34, shinSp, shin)
// arto lontano: le stesse ossa, un gradino piu' scure (come la pelle)
for (const n of ["braccio_sup", "avambraccio", "coscia", "stinco"])
  sprite("scheletro_" + n + "_sx", { base: "scheletro_" + n + "_dx", swap: { q: "p", p: "o", o: "t", t: "s" } })

// ---- carne: la stessa sagoma della pelle (stessa luce, stessi toni di grigio) riletta in rossi, con le fibre
// muscolari: strisce lungo l'osso negli arti, oblique sul busto. Viene cancellata dopo la pelle.
const fibre = (tipo) => (c) => {
  const out = []
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (!c.is(x, y, "b")) continue
    const f = tipo === "busto" ? (x + y) % 5 === 0 : tipo === "arto" ? (x % 3 === 1 && (y + x * 4) % 9 < 6) : false
    if (f) out.push([x, y])
  }
  for (const [x, y] of out) c.px(x, y, "a")
}
const ROSSI = { k: "M", a: "n", b: "m", c: "l", d: "L" }
for (const [n, tipo] of [["testa", null], ["busto_sup", "busto"], ["busto_inf", "busto"], ["braccio_sup_dx", "arto"], ["braccio_sup_sx", "arto"],
    ["avambraccio_dx", "arto"], ["avambraccio_sx", "arto"], ["coscia_dx", "arto"], ["coscia_sx", "arto"], ["stinco_dx", "arto"], ["stinco_sx", "arto"]])
  sprite("carne_" + n, { base: n, swap: ROSSI }, ...(tipo ? [fibre(tipo)] : []))

// ---- anteprima: lo scheletro nudo, poi con la carne (stesso montaggio di "assemblato")
const monta = (pre, dx = 0) => [
  stamp(pre + "braccio_sup_sx", 12 + dx, 21), stamp(pre + "avambraccio_sx", 12 + dx, 43),
  stamp(pre + "coscia_sx", 19 + dx, 53), stamp(pre + "stinco_sx", 19 + dx, 77),
  stamp(pre + "coscia_dx", 15 + dx, 53), stamp(pre + "stinco_dx", 15 + dx, 77),
  stamp(pre + "busto_sup", 14 + dx, 18), stamp(pre + "busto_inf", 14 + dx, 37), stamp(pre + "testa", 14 + dx, 0),
  stamp(pre + "braccio_sup_dx", 16 + dx, 21), stamp(pre + "avambraccio_dx", 16 + dx, 43)]
scene("scheletro_assemblato", { w: 48, h: 111, bg: "_" }, ...monta("scheletro_"))
scene("carne_assemblata", { w: 48, h: 111, bg: "_" }, ...monta("carne_"))
// confronto a occhio: scheletro | scheletro + carne | pelle (non e' uno dei pezzi)
scene("interno_confronto", { w: 144, h: 111, bg: "#4a5160" },
  ...monta("scheletro_"), ...monta("scheletro_", 48), ...monta("carne_", 48),
  stamp("assemblato", 96, 0))
sheet("interno", ["scheletro_*", "carne_*"], { cols: 11, pad: 2 })
