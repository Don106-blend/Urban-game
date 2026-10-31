// Gli oggetti della palestra (static/scena_palestra.js): sacco, bilanciere e rack, manichino, lavagna, bacheca, specchio,
// infermeria, dormitorio, camera di controllo, tatami, targa dei caduti, finestra, poster, lampada.
// Diversamente dai combattenti NON sono ricolorati dal gioco (niente 5 grigi a indici): hanno i loro colori veri, sobri e un po'
// freddi come il resto di Urban, con il contorno scuro `k` e la luce da davanti-in alto (chiaro a destra e sopra, ombra a sinistra
// e sotto), cosi' stanno bene accanto ai pupazzi. Un pixel dello sprite = una scala intera in gioco (2 px schermo).
// Si costruisce: PXL build tools/sprites/palestra.px.js --out <cartella temporanea>; poi tools/sprites/palestra_manifest.py
// copia i PNG in static/sprites/palestra/ e scrive oggetti.json (dimensioni e perno di ognuno).
pal({
  k: "#14171c",                                                      // contorno
  a: "#2a2e37", b: "#3d4350", c: "#586070", d: "#7b8596", e: "#a3adbd", f: "#d0d7e2",       // metallo e cemento, dal buio alla luce
  r: "#5a2024", R: "#8e3434", S: "#b84c46", T: "#d8756a",                                   // cuoio rosso (il sacco)
  w: "#3b2a1c", W: "#5e4129", x: "#85603a", X: "#b0834f",                                   // legno
  g: "#1f3a30", G: "#2c5446", h: "#3b7260", H: "#5f9a86",                                   // verde (lavagna, tatami)
  v: "#d7ff3e", V: "#a8cc2a", t: "#21d0b2", p: "#b86bff", P: "#2a1f3d", q: "#d9a8ff",       // volt, teal, viola della camera
  n: "#8a7248", N: "#b79c6e", m: "#d6c192", y: "#e8e0cc", Y: "#e8d36a",                     // tela, carta
  u: "#8a5f3a", U: "#a67a4e",                                                               // sughero
  i: "#54708a", I: "#7f9bb5", j: "#a8c4d8", J: "#d8ecf6",                                   // vetro
  z: "#10151f", Z: "#1c2a44", o: "#33496b", O: "#6d86a8", l: "#ffe6a3", L: "#fff6d6",       // notte e luci
  C: "#d63a46", s: "#cdd6e0", F: "#eef2f7",                                                 // croce rossa, lenzuola
  B: "#3a5a8a", D: "#7fa6c4", E: "#4a7a5a", K: "#2a3a55", M: "#a8b0be", Q: "#6c4a2e"        // coperte, ottone, ruote
})

// ---------------------------------------------------------------------------------------------------------------- il sacco
// 16 x 40 + contorno. Appeso dall'anello in alto (il perno e' li'): la catena la disegna il gioco.
sprite("sacco", { w: 16, h: 40, outline: "k" },
  // il corpo: un cilindro di cuoio, smussato in cima e in fondo
  poly([2, 4, 14, 4, 16, 6, 16, 37, 14, 40, 2, 40, 0, 37, 0, 6], "R"),
  rect(0, 6, 4, 31, "r"), rect(4, 5, 2, 33, "r"),                       // ombra a sinistra
  rect(11, 5, 3, 33, "S"), rect(14, 6, 2, 31, "S"), rect(12, 8, 1, 26, "T"),   // luce a destra
  // cinghie
  rect(0, 11, 16, 2, "a"), hline(0, 11, 16, "b"), rect(0, 31, 16, 2, "a"), hline(0, 31, 16, "b"),
  px(2, 11, "e"), px(8, 11, "e"), px(13, 11, "e"), px(2, 31, "e"), px(8, 31, "e"), px(13, 31, "e"),
  // il nastro volt
  rect(0, 19, 16, 4, "V"), hline(0, 19, 16, "v"), rect(11, 19, 5, 4, "v"), hline(0, 22, 16, "V"),
  // cuciture
  vline(4, 14, 3, "r"), vline(4, 24, 5, "r"), vline(9, 14, 3, "R"), vline(9, 24, 5, "R"),
  // l'anello e il cappuccio in alto
  rect(5, 0, 6, 4, "c"), rect(5, 0, 6, 1, "e"), rect(5, 3, 6, 1, "b"), px(7, 1, "k"), px(8, 1, "k"))

// ---------------------------------------------------------------------------------------------------------------- il bilanciere
// 38 x 11: visto di fronte, dischi ai due lati. Lo tiene in mano chi solleva pesi; sul rack (sotto) e' lo stesso.
sprite("_bil", { w: 38, h: 11 },
  rect(5, 5, 28, 1, "e"), rect(5, 6, 28, 1, "d"),                         // la sbarra
  vline(15, 5, 2, "c"), vline(17, 5, 2, "c"), vline(21, 5, 2, "c"), vline(23, 5, 2, "c"),   // la zigrinatura
  // dischi a sinistra
  rect(0, 0, 3, 11, "a"), rect(0, 0, 1, 11, "b"), rect(2, 1, 1, 9, "k"),
  rect(3, 1, 2, 9, "b"), rect(3, 1, 1, 9, "c"),
  rect(5, 4, 1, 3, "f"),
  // dischi a destra (specchiati, luce da destra)
  rect(35, 0, 3, 11, "a"), rect(37, 0, 1, 11, "c"), rect(35, 1, 1, 9, "k"),
  rect(33, 1, 2, 9, "b"), rect(34, 1, 1, 9, "c"),
  rect(32, 4, 1, 3, "f"))
sprite("bilanciere", { base: "_bil", outline: "k" })

// ---------------------------------------------------------------------------------------------------------------- il rack con la panca
// 46 x 40. `pesi` ha il bilanciere appoggiato; `pesi_vuoto` no (quando qualcuno lo sta sollevando).
const rack = (con) => [
  // basi e montanti
  rect(1, 36, 9, 4, "b"), rect(36, 36, 9, 4, "b"), hline(1, 36, 9, "d"), hline(36, 36, 9, "d"),
  rect(3, 1, 4, 36, "c"), rect(3, 1, 1, 36, "b"), rect(6, 1, 1, 36, "d"),
  rect(39, 1, 4, 36, "c"), rect(39, 1, 1, 36, "b"), rect(42, 1, 1, 36, "d"),
  hline(3, 1, 4, "e"), hline(39, 1, 4, "e"),
  // i fori dei supporti, le staffe, le sicure
  px(5, 6, "a"), px(5, 10, "a"), px(5, 14, "a"), px(5, 18, "a"), px(41, 6, "a"), px(41, 10, "a"), px(41, 14, "a"), px(41, 18, "a"),
  rect(7, 11, 4, 2, "d"), rect(7, 12, 4, 1, "b"), rect(35, 11, 4, 2, "d"), rect(35, 12, 4, 1, "b"),
  rect(7, 26, 4, 1, "d"), rect(35, 26, 4, 1, "d"),
  // la panca, davanti
  rect(13, 26, 20, 4, "K"), rect(13, 26, 20, 1, "B"), rect(13, 29, 20, 1, "a"), rect(28, 27, 4, 2, "B"),
  rect(15, 30, 2, 7, "b"), rect(29, 30, 2, 7, "b"), rect(14, 36, 4, 1, "a"), rect(28, 36, 4, 1, "a"),
  ...(con ? [stamp("_bil", 4, 8)] : [])]
sprite("pesi", { w: 46, h: 40, outline: "k" }, ...rack(true))
sprite("pesi_vuoto", { w: 46, h: 40, outline: "k" }, ...rack(false))

// ---------------------------------------------------------------------------------------------------------------- il manichino
// 20 x 68: un busto di tela imbottita su un palo, con le braccia mozze e un bersaglio sul petto.
sprite("manichino", { w: 20, h: 68, outline: "k" },
  // base
  ellipse(10, 65, 9, 2, "a"), ellipse(10, 64, 8, 2, "b"), hline(5, 63, 10, "d"),
  rect(9, 44, 3, 20, "c"), rect(9, 44, 1, 20, "b"), rect(11, 44, 1, 20, "d"),
  // il busto
  poly([4, 14, 16, 14, 17, 20, 16, 44, 4, 44, 3, 20], "N"),
  rect(3, 20, 3, 24, "n"), rect(5, 15, 2, 28, "n"),
  rect(12, 15, 3, 28, "m"), rect(15, 20, 2, 23, "m"),
  hline(4, 30, 12, "n"), hline(4, 31, 12, "N"), hline(4, 38, 12, "n"), hline(4, 39, 12, "N"),
  vline(10, 15, 29, "n"),
  // il bersaglio
  ring(10, 23, 3, "C"), px(10, 23, "C"), px(9, 23, "C"), px(11, 23, "C"), px(10, 22, "C"), px(10, 24, "C"),
  // il nastro volt della palestra
  rect(3, 34, 14, 2, "V"), hline(3, 34, 14, "v"),
  // le braccia mozze
  poly([0, 17, 3, 17, 3, 29, 0, 27], "n"),
  poly([17, 17, 20, 17, 20, 27, 17, 29], "N"), rect(18, 18, 2, 9, "m"),
  // la testa
  ellipse(10, 8, 5, 6, "N"), ellipse(10, 8, 5, 6, "n", true),
  rect(11, 4, 3, 8, "m"), rect(5, 5, 2, 7, "n"),
  hline(6, 8, 8, "n"), hline(7, 9, 6, "n"))

// ---------------------------------------------------------------------------------------------------------------- la lavagna
// 44 x 58: una lavagna su un cavalletto, con una guardia disegnata col gesso.
sprite("lavagna", { w: 44, h: 58, outline: "k" },
  // il cavalletto
  poly([8, 44, 12, 44, 8, 58, 5, 58], "W"), poly([32, 44, 36, 44, 39, 58, 36, 58], "x"),
  rect(8, 51, 28, 2, "W"), hline(8, 51, 28, "x"),
  // la cornice
  rect(0, 0, 44, 44, "W"), hline(0, 0, 44, "x"), vline(43, 0, 44, "x"), hline(0, 43, 44, "w"), vline(0, 0, 44, "w"),
  rect(2, 2, 40, 38, "g"),
  rect(2, 2, 40, 12, "G"), grad(2, 2, 40, 38, "GgGg", "v", 0.6),
  // il vassoio dei gessi
  rect(2, 40, 40, 3, "X"), hline(2, 40, 40, "m"), rect(6, 40, 5, 1, "F"), rect(30, 40, 3, 2, "y"), rect(33, 41, 3, 1, "e"),
  // il disegno: due sagome e le frecce di una guardia
  ring(11, 12, 4, "F"), px(11, 12, "F"), vline(11, 17, 7, "F"), line(11, 19, 6, 23, "F"), line(11, 19, 16, 22, "F"),
  ring(32, 12, 4, "e"), vline(32, 17, 7, "e"), line(32, 19, 27, 22, "e"), line(32, 19, 37, 23, "e"),
  line(17, 10, 26, 12, "Y"), px(25, 10, "Y"), px(25, 14, "Y"), px(26, 12, "Y"),
  line(16, 24, 22, 30, "v"), px(22, 30, "v"), px(20, 30, "v"), px(22, 28, "v"),
  hline(6, 31, 10, "F"), hline(6, 34, 14, "e"), hline(24, 34, 12, "e"), hline(6, 37, 7, "e"))

// ---------------------------------------------------------------------------------------------------------------- la bacheca
// 34 x 26: sughero con avvisi, un calendario, una foto.
sprite("bacheca", { w: 34, h: 26, outline: "k" },
  rect(0, 0, 34, 26, "W"), hline(0, 0, 34, "x"), vline(33, 0, 26, "x"), hline(0, 25, 34, "w"), vline(0, 0, 26, "w"),
  rect(2, 2, 30, 22, "U"), rect(2, 2, 30, 4, "X"),
  // briciole di sughero
  px(5, 10, "u"), px(9, 20, "u"), px(14, 9, "u"), px(20, 19, "u"), px(27, 17, "u"), px(30, 8, "u"), px(24, 21, "u"), px(17, 14, "u"),
  // un foglio con righe
  rect(4, 4, 9, 11, "y"), hline(5, 6, 6, "d"), hline(5, 8, 7, "d"), hline(5, 10, 5, "d"), hline(5, 12, 7, "d"), px(8, 4, "C"),
  // un biglietto giallo
  rect(15, 5, 6, 6, "Y"), hline(16, 7, 4, "n"), hline(16, 9, 3, "n"), px(17, 5, "C"),
  // una foto
  rect(23, 4, 7, 8, "F"), rect(24, 5, 5, 5, "b"), rect(25, 7, 3, 3, "d"), px(26, 6, "e"), px(26, 4, "t"),
  // il calendario
  rect(8, 16, 12, 6, "F"), hline(8, 16, 12, "C"), px(10, 18, "k"), px(12, 18, "k"), px(14, 18, "k"), px(16, 18, "k"), px(11, 20, "k"), px(13, 20, "k"), px(17, 20, "C"),
  rect(23, 15, 7, 6, "s"), hline(24, 17, 5, "d"), hline(24, 19, 4, "d"), px(26, 15, "v"))

// ---------------------------------------------------------------------------------------------------------------- la parete a specchi
// 56 x 64: uno specchio intero, con una sbarra a mezza altezza.
sprite("specchio", { w: 56, h: 64, outline: "k" },
  rect(0, 0, 56, 64, "a"), hline(0, 0, 56, "c"), vline(55, 0, 64, "b"), vline(0, 0, 64, "b"),
  rect(2, 2, 52, 60, "I"),
  rect(2, 2, 52, 8, "j"), rect(2, 10, 52, 2, "j"),                          // la luce dall'alto
  rect(2, 2, 3, 60, "i"), rect(2, 56, 52, 6, "i"), rect(2, 60, 52, 2, "c"),     // l'ombra del bordo
  // i riflessi diagonali
  poly([12, 2, 22, 2, 8, 46, 2, 46, 2, 30], "J"), poly([26, 2, 29, 2, 15, 46, 12, 46], "J"),
  poly([48, 2, 54, 2, 54, 20, 40, 52, 36, 52], "j"), poly([36, 2, 38, 2, 30, 20, 28, 20], "J"),
  // il pavimento riflesso e la sbarra
  hline(2, 52, 52, "i"), hline(2, 53, 52, "I"),
  rect(0, 40, 56, 3, "x"), hline(0, 40, 56, "X"), hline(0, 42, 56, "w"), rect(4, 43, 2, 4, "c"), rect(50, 43, 2, 4, "c"),
  rect(4, 43, 2, 1, "e"), rect(50, 43, 2, 1, "e"))

// ---------------------------------------------------------------------------------------------------------------- l'infermeria
// 52 x 34: una branda con le lenzuola pulite e un armadietto con la croce rossa.
sprite("infermeria", { w: 52, h: 34, outline: "k" },
  // l'armadietto a muro
  rect(36, 0, 15, 13, "F"), hline(36, 0, 15, "f"), vline(36, 0, 13, "s"), vline(50, 0, 13, "s"), hline(36, 12, 15, "d"),
  rect(42, 3, 3, 7, "C"), rect(40, 5, 7, 3, "C"), hline(42, 3, 3, "C"),
  // la flebo
  vline(30, 1, 15, "c"), rect(27, 1, 7, 1, "d"), rect(28, 2, 5, 6, "J"), rect(29, 3, 3, 4, "j"), px(30, 8, "j"), vline(30, 9, 4, "j"),
  // la branda
  rect(2, 14, 2, 18, "c"), rect(46, 19, 2, 13, "c"),
  rect(1, 22, 47, 3, "d"), hline(1, 22, 47, "e"), hline(1, 24, 47, "b"),
  rect(3, 25, 2, 7, "b"), rect(44, 25, 2, 7, "b"),
  ellipse(4, 32, 2, 1, "a"), ellipse(45, 32, 2, 1, "a"),
  rect(3, 17, 44, 5, "s"), hline(3, 17, 44, "F"), hline(3, 21, 44, "d"),
  // il cuscino e la coperta
  rect(4, 14, 11, 4, "F"), hline(5, 14, 9, "f"), hline(5, 17, 9, "s"),
  rect(16, 15, 31, 7, "D"), hline(16, 15, 31, "j"), hline(16, 21, 31, "I"), vline(24, 16, 5, "I"), vline(33, 16, 5, "I"), vline(40, 16, 5, "I"),
  hline(16, 18, 31, "I"))

// ---------------------------------------------------------------------------------------------------------------- il dormitorio
// 48 x 48: un letto a castello con una scaletta.
sprite("dormitorio", { w: 48, h: 48, outline: "k" },
  // i montanti
  rect(1, 0, 3, 48, "W"), vline(1, 0, 48, "x"), rect(44, 0, 3, 48, "W"), vline(46, 0, 48, "x"),
  rect(0, 46, 6, 2, "w"), rect(42, 46, 6, 2, "w"),
  // il letto in alto
  rect(4, 13, 40, 2, "x"), hline(4, 13, 40, "X"), rect(4, 14, 40, 1, "w"),
  rect(5, 5, 38, 8, "B"), hline(5, 5, 38, "O"), rect(5, 9, 38, 4, "K"), hline(5, 9, 38, "B"),
  rect(5, 3, 9, 4, "F"), hline(6, 3, 7, "f"), hline(6, 6, 7, "s"),
  vline(22, 6, 7, "o"), vline(30, 6, 7, "o"),
  // il letto in basso
  rect(4, 35, 40, 2, "x"), hline(4, 35, 40, "X"), rect(4, 36, 40, 1, "w"),
  rect(5, 27, 38, 8, "E"), hline(5, 27, 38, "H"), rect(5, 31, 38, 4, "G"), hline(5, 31, 38, "h"),
  rect(5, 25, 9, 4, "F"), hline(6, 25, 7, "f"), hline(6, 28, 7, "s"),
  vline(22, 28, 7, "h"), vline(30, 28, 7, "h"),
  // la scaletta a destra
  rect(40, 14, 2, 22, "x"), hline(40, 18, 4, "X"), hline(40, 23, 4, "X"), hline(40, 28, 4, "X"), hline(40, 33, 4, "X"),
  // un borsone sotto il letto
  rect(8, 41, 14, 5, "a"), hline(8, 41, 14, "c"), rect(13, 40, 4, 1, "d"), hline(8, 43, 14, "b"), rect(17, 44, 2, 2, "v"))

// ---------------------------------------------------------------------------------------------------------------- la camera di controllo
// 66 x 12: un cerchio di cemento rinforzato per terra, con le rune accese. Visto di scorcio: un'ellisse.
sprite("camera", { w: 66, h: 12, outline: "k" },
  ellipse(33, 6, 33, 6, "a"), ellipse(33, 5, 33, 5, "b"), ellipse(33, 5, 32, 4, "c"),
  ellipse(33, 6, 28, 5, "P"), ellipse(33, 6, 28, 5, "p", true),
  ellipse(33, 6, 22, 4, "P"), ellipse(33, 6, 22, 4, "q", true),
  ellipse(33, 6, 10, 2, "P"), ellipse(33, 6, 10, 2, "p", true),
  // le rune sul bordo
  px(33, 1, "q"), px(32, 1, "p"), px(34, 1, "p"), px(15, 3, "q"), px(14, 3, "p"), px(51, 3, "q"), px(52, 3, "p"),
  px(8, 6, "q"), px(7, 6, "p"), px(58, 6, "q"), px(59, 6, "p"), px(15, 9, "q"), px(51, 9, "q"), px(33, 11, "q"),
  px(33, 6, "q"), px(32, 6, "p"), px(34, 6, "p"), px(33, 5, "p"), px(33, 7, "p"))

// ---------------------------------------------------------------------------------------------------------------- il tatami
// 100 x 8: tre materassini accostati, visti di scorcio.
sprite("tatami", { w: 100, h: 8, outline: "k" },
  rect(0, 0, 100, 5, "h"), hline(0, 0, 100, "H"), rect(0, 5, 100, 3, "g"),
  rect(0, 1, 100, 1, "h"),
  // le giunzioni tra i materassini
  rect(33, 0, 1, 8, "g"), rect(66, 0, 1, 8, "g"), px(34, 0, "H"), px(67, 0, "H"),
  // una fascia blu su un materassino, il segno di chi ci combatte sopra
  rect(48, 0, 5, 5, "B"), rect(48, 0, 5, 1, "O"), rect(48, 5, 5, 3, "K"),
  // le ombre degli angoli e qualche segno di usura
  px(2, 2, "G"), px(5, 3, "G"), px(14, 1, "G"), px(21, 3, "G"), px(27, 2, "G"), px(40, 3, "G"), px(60, 2, "G"), px(72, 3, "G"), px(81, 1, "G"), px(90, 3, "G"),
  px(10, 2, "H"), px(37, 2, "H"), px(75, 2, "H"), px(95, 1, "H"))

// ---------------------------------------------------------------------------------------------------------------- la targa dei caduti
// 12 x 17: una targa di ottone sul muro, con una croce incisa.
sprite("targa", { w: 12, h: 17, outline: "k" },
  rect(0, 0, 12, 17, "n"), hline(0, 0, 12, "m"), vline(11, 0, 17, "N"), hline(0, 16, 12, "w"), vline(0, 0, 17, "w"),
  px(1, 1, "k"), px(10, 1, "k"), px(1, 15, "k"), px(10, 15, "k"),
  vline(5, 3, 7, "m"), vline(6, 3, 7, "m"), hline(3, 5, 6, "m"), hline(3, 6, 6, "N"),
  hline(2, 12, 8, "N"), hline(3, 14, 6, "n"))

// ---------------------------------------------------------------------------------------------------------------- la finestra
// 38 x 44: una finestra a quattro vetri sulla notte della citta'.
sprite("finestra", { w: 38, h: 44, outline: "k" },
  rect(0, 0, 38, 44, "c"), hline(0, 0, 38, "e"), vline(0, 0, 44, "b"), vline(37, 0, 44, "d"), rect(0, 41, 38, 3, "b"),
  // i quattro vetri
  ...[[2, 2], [20, 2], [2, 22], [20, 22]].map(([x, y]) => [
    rect(x, y, 16, 18, "Z"), grad(x, y, 16, 18, "ZZooO", "v", 0.7),
    rect(x, y + 12, 16, 6, "z"), rect(x + 2, y + 9, 4, 9, "z"), rect(x + 8, y + 11, 3, 7, "z"), rect(x + 12, y + 8, 3, 10, "z"),
    px(x + 3, y + 11, "l"), px(x + 4, y + 14, "l"), px(x + 9, y + 13, "l"), px(x + 13, y + 11, "l"), px(x + 13, y + 15, "l"),
    poly([x + 11, y, x + 16, y, x + 16, y + 6], "O")]).flat(),
  // i riflessi sul vetro
  poly([4, 3, 7, 3, 3, 12, 2, 12], "j"), poly([22, 23, 25, 23, 21, 32, 20, 32], "j"))

// ---------------------------------------------------------------------------------------------------------------- il poster
// 24 x 34: il manifesto della serata.
sprite("poster", { w: 28, h: 38, outline: "k" },
  rect(0, 0, 28, 38, "R"), hline(0, 0, 28, "S"), vline(27, 0, 38, "S"), hline(0, 37, 28, "r"), vline(0, 0, 38, "r"),
  box(2, 2, 24, 34, "v"),
  text(5, 5, "URBAN", "v"), hline(5, 11, 19, "V"),
  // un guantone: cuoio chiaro col pollice, il polsino bianco con la riga rossa
  ellipse(15, 19, 6, 5, "T"), ellipse(15, 19, 6, 5, "k", true), ellipse(9, 22, 2, 3, "T"), ellipse(9, 22, 2, 3, "k", true),
  rect(11, 15, 7, 2, "m"), px(12, 15, "F"),
  rect(11, 24, 9, 5, "F"), rect(11, 24, 9, 1, "k"), rect(11, 28, 9, 1, "k"), hline(11, 26, 9, "C"), vline(10, 24, 5, "k"), vline(20, 24, 5, "k"),
  text(8, 31, "RING", "v"))

// ---------------------------------------------------------------------------------------------------------------- la lampada
// 14 x 20: una lampada a campana appesa a un filo. La luce sul pavimento la fa il gioco.
sprite("lampada", { w: 14, h: 20, outline: "k" },
  vline(6, 0, 5, "c"), vline(7, 0, 5, "d"),
  poly([6, 5, 8, 5, 13, 13, 1, 13], "b"), poly([8, 5, 8, 5, 13, 13, 8, 13], "c"), poly([7, 6, 8, 6, 12, 12, 8, 12], "d"),
  hline(1, 13, 12, "d"), hline(1, 13, 12, "c"), px(2, 13, "e"),
  ellipse(7, 16, 3, 2, "l"), ellipse(7, 16, 2, 1, "L"), hline(5, 14, 4, "l"))
