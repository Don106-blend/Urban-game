// Corpo base maschile, grigio neutro, VISTA DI PROFILO rivolto a destra (si specchia per guardare a sinistra).
// 5 grigi fissi (k contorno, a ombra, b base, c luce, d riflesso): la skin si cambia con una mappa
// indice -> colore, quindi NON aggiungere altri grigi. La luce arriva da davanti-alto, cosi' resta
// dal lato dell'avversario anche quando lo sprite viene specchiato.
// Proporzioni: cranio 14px interno, altezza totale 111px (~7 teste), arti sottili come nel reference.
// Regole complete (palette, luce, tagli, giunti, overlay): STILE_SPRITE.md nella radice del progetto.
pal({ k: "#262626", a: "#6a6a6a", b: "#8e8e8e", c: "#b2b2b2", d: "#d8d8d8" })
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
