// Pezzi di corpo che i poteri sostituiscono (STILE_SPRITE.md sez. 18): le versioni RINFORZATE (Pelle Invincibile, dal rango 3) e gli
// avambracci APPUNTITI (Appendici Affilate). Si costruisce con `PXL build tools/sprites/maschio_poteri.px.js --out <cartella>`
// e si copiano in static/sprites/maschio/ i PNG `rinf_*` e `app_*` (il corpo base e' incluso solo per riusare le sue funzioni).
//
// Come il resto dei pezzi sono a 5 grigi-indice (k contorno, a ombra, b base, c luce, d riflesso), piu' UN indice solo dei rinforzati:
//   m = commessura tra le piastre (R=70: nel gioco diventa lava, fessura di cristallo o crepa a seconda del materiale).
// Nel gioco il materiale (pietra, ossidiana, ossidiana e lava, cristalli) lo mette `static/poteri.js`: qui si disegna solo la forma.
//
// Regola di posa dei rinforzati: la tela e' quella del pezzo base con UN pixel in piu' a sinistra e in alto (il corpo "cresce" da li'),
// quindi il perno e' il perno del base + (1, 1) e lo sprite si posa a (base - 1, base - 1). Il resto cresce a destra e in basso. Tra
// una tela e l'altra la crescita e' di 1 px per lato al massimo (~5% in lunghezza sui pezzi grandi).
include("maschio_base.px.js", { palette: true })
pal({ m: "#464646" })

// copia le forme del base, con `dietro`/`davanti` = [[riga0, riga1, px]] di crescita, `su` = la riga in piu' in cima, `giu` = righe in
// piu' in fondo. Tutto traslato di (1, 1): vedi sopra.
const cresci = (base, { dietro = [], davanti = [], su, giu = [] }) => {
  const s = base.map(([a, b]) => [a, b])
  for (const [y0, y1, d] of dietro) for (let y = y0; y <= y1; y++) s[y][0] -= d
  for (const [y0, y1, d] of davanti) for (let y = y0; y <= y1; y++) s[y][1] += d
  return [su, ...s, ...giu].map(([a, b]) => [a + 1, b + 1])
}
// un pezzo rinforzato: la forma, poi le commessure `m` (liste di punti [x, y] in coordinate della TELA FINALE, collegati) e i chiodi `d`
// `tacche` = righe (della tela finale) dove la sagoma rientra di 1 px per lato: e' li' che due piastre si toccano
const rinf = (nome, spans, opz, commessure = [], chiodi = [], tacche = []) => {
  for (const y of tacche) { const r = spans[y - 1]; if (r[1] - r[0] > 2) { r[0] += 1; r[1] -= 1 } }
  part("_" + nome, spans, opz)
  // una commessura sta solo sull'interno della sagoma: mai sul contorno ne' a ridosso del vuoto (il gioco la colora di lava o di cristallo)
  const pieno = (x, y) => y >= 0 && y < spans.length && x >= spans[y][0] && x <= spans[y][1]       // coordinate della griglia, senza contorno
  const opaco = (x, y) => pieno(x - 1, y - 1) || pieno(x - 2, y - 1) || pieno(x, y - 1) || pieno(x - 1, y - 2) || pieno(x - 1, y)
  const dentro = (x, y) => pieno(x - 1, y - 1) && opaco(x + 1, y) && opaco(x - 1, y) && opaco(x, y + 1) && opaco(x, y - 1)
  const segni = commessure.flatMap((pts) => ln(pts).filter(([x, y]) => dentro(x, y)).map(([x, y]) => px(x, y, "m")))
  sprite(nome, { base: "_" + nome }, ...segni, ...chiodi.map(([x, y]) => px(x, y, "d")))
}

// ---- TESTA: calotta piu' alta, nuca spessa, mascella pesante, collo con gorgiera
const testaR = cresci(headSpans, {
  su: [4, 9],
  dietro: [[1, 11, 1], [14, 17, 1]],
  davanti: [[4, 6, 1], [9, 13, 1], [14, 17, 1]],
})
rinf("rinf_testa", testaR, { lt: 2, dk: 2, hl: [[3, 6]] },
  [[[5, 4], [5, 9]], [[9, 6], [15, 6]], [[10, 12], [15, 12]]], [[8, 4], [12, 4]], [12])

// ---- BUSTO: spalle piu' alte, piastra dorsale, pettorale
const bustoSupR = cresci(torsoSpans.slice(0, TAGLIO.busto), {
  su: [2, 9],
  dietro: [[2, 18, 1]],
  davanti: [[3, 8, 1]],
})
rinf("rinf_busto_sup", bustoSupR, { lt: 2, dk: 2, hl: [[7, 10]] },
  [[[8, 9], [13, 9]], [[3, 13], [13, 13]]], [[10, 6], [10, 11]], [13])
const bustoInfR = cresci(torsoSpans.slice(TAGLIO.busto), {
  su: [1, 10],
  dietro: [[3, 18, 1]],
  davanti: [[0, 6, 1]],
})
rinf("rinf_busto_inf", bustoInfR, { lt: 2, dk: 2 },
  [[[2, 7], [13, 7]], [[2, 13], [13, 13]]], [[4, 10], [10, 10]], [7, 13])

// ---- BRACCIA: spallaccio, bracciale, pugno corazzato
for (const [lato, far] of [["dx", false], ["sx", true]]) {
  rinf("rinf_braccio_sup_" + lato, cresci(armSpans.slice(0, TAGLIO.braccio), {
    su: [0, 4],
    dietro: [[0, 8, 1]],
    davanti: [[1, 7, 1]],
  }), { hl: [[4, 9]], far },
  [[[1, 10], [6, 10]], [[1, 16], [5, 16]]], [[4, 5]], [10, 16])
  rinf("rinf_avambraccio_" + lato, cresci(armSpans.slice(TAGLIO.braccio), {
    su: [1, 4],
    dietro: [[0, 11, 1]],
    davanti: [[14, 23, 1]],
  }), { hl: [[3, 9]], far },
  [[[1, 7], [5, 7]], [[1, 15], [5, 15]]], [[3, 4]], [7, 15])
}

// ---- GAMBE: coscia piastrata, schiniere con ginocchiera e polpaccio
for (const [lato, far] of [["dx", false], ["sx", true]]) {
  rinf("rinf_coscia_" + lato, cresci(legSpans.slice(0, TAGLIO.gamba), {
    su: [0, 6],
    dietro: [[0, 21, 1]],
    davanti: [[0, 6, 1]],
  }), { hl: [[6, 14]], far },
  [[[1, 8], [8, 8]], [[1, 17], [7, 17]]], [[5, 4]], [8, 17])
  rinf("rinf_stinco_" + lato, cresci(legSpans.slice(TAGLIO.gamba), {
    su: [0, 5],
    dietro: [[0, 20, 1]],
    davanti: [[0, 6, 1]],
  }), { hl: [[8, 18]], far },
  [[[1, 8], [8, 8]], [[1, 20], [7, 20]]], [[6, 4]], [8, 20])
}

// ---- AVAMBRACCI APPUNTITI (Appendici Affilate): stessa tela e stesso perno del base; l'avambraccio si assottiglia fino a una punta
// sul davanti (come una lama), con uno sperone sul gomito. La mano scompare dentro la lama.
const lama = armSpans.slice(TAGLIO.braccio).map(([a, b], y) => {
  if (y < 8) return [a, b]
  const l = Math.max(1, Math.round(4 - (y - 8) * 3 / 16))
  return [b - l + 1, b]
})
lama[4] = [0, 4]; lama[5] = [0, 4]
for (const [lato, far] of [["dx", false], ["sx", true]]) part("app_avambraccio_" + lato, lama, { hl: [[10, 20]], far })

// ---- confronto a occhio (non sono pezzi): base a sinistra, rinforzato a destra, con i perni allineati
scene("confronto", { w: 100, h: 111, bg: "_" },
  stamp("braccio_sup_sx", 12, 21), stamp("avambraccio_sx", 12, 43), stamp("coscia_sx", 19, 53), stamp("stinco_sx", 19, 77),
  stamp("coscia_dx", 15, 53), stamp("stinco_dx", 15, 77), stamp("busto_sup", 14, 18), stamp("busto_inf", 14, 37), stamp("testa", 14, 0),
  stamp("braccio_sup_dx", 16, 21), stamp("avambraccio_dx", 16, 43),
  stamp("rinf_braccio_sup_sx", 60 + 12 - 1, 21 - 1), stamp("rinf_avambraccio_sx", 60 + 12 - 1, 43 - 1),
  stamp("rinf_coscia_sx", 60 + 19 - 1, 53 - 1), stamp("rinf_stinco_sx", 60 + 19 - 1, 77 - 1),
  stamp("rinf_coscia_dx", 60 + 15 - 1, 53 - 1), stamp("rinf_stinco_dx", 60 + 15 - 1, 77 - 1),
  stamp("rinf_busto_sup", 60 + 14 - 1, 18 - 1), stamp("rinf_busto_inf", 60 + 14 - 1, 37 - 1), stamp("rinf_testa", 60 + 14 - 1, 0 - 1),
  stamp("rinf_braccio_sup_dx", 60 + 16 - 1, 21 - 1), stamp("rinf_avambraccio_dx", 60 + 16 - 1, 43 - 1))
scene("appuntiti", { w: 40, h: 36, bg: "_" },
  stamp("avambraccio_dx", 3, 4), stamp("app_avambraccio_dx", 15, 4), stamp("app_avambraccio_sx", 27, 4))
// galleria: coppie base / rinforzato, una per pezzo (per giudicare le forme una alla volta)
scene("galleria", { w: 150, h: 70, bg: "_" },
  stamp("testa", 2, 2), stamp("rinf_testa", 22, 1),
  stamp("busto_sup", 44, 2), stamp("rinf_busto_sup", 62, 1),
  stamp("busto_inf", 84, 2), stamp("rinf_busto_inf", 102, 1),
  stamp("braccio_sup_dx", 126, 2), stamp("rinf_braccio_sup_dx", 138, 1),
  stamp("avambraccio_dx", 2, 30), stamp("rinf_avambraccio_dx", 14, 29),
  stamp("coscia_dx", 30, 30), stamp("rinf_coscia_dx", 44, 29),
  stamp("stinco_dx", 62, 30), stamp("rinf_stinco_dx", 90, 29))
