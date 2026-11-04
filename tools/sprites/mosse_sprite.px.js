// Gli sprite delle animazioni delle mosse (static/mosse.js): l'ONDA di Onda Anomala, il MAREMOTO (la stessa onda, piu' grande) e i MASSI della Frana.
// `PXL build tools/sprites/mosse_sprite.px.js --out <cartella>` e si copiano `sprites/{onda,maremoto,masso_*}.png` in static/sprites/mosse/.
//
// L'onda e' vista di profilo e viaggia verso DESTRA (il fronte e' a destra; l'arena la specchia se chi la evoca sta a destra). E' un muro d'acqua
// con il dorso che sale piano, la cresta che si curva in avanti in un labbro di schiuma e, sotto il labbro, il CAVO: vuoto, trasparente, cosi' chi sta
// dietro si intravede. Quattro fotogrammi (uno accanto all'altro, tela unica): le strisce di luce scorrono, il labbro dondola e la schiuma cambia.
// Palette: dalla schiuma bianca al blu profondo (la stessa dell'acqua delle sfere di Idrocinesi).
const ACQUA = [[246, 253, 255], [190, 238, 250], [104, 200, 238], [50, 140, 214], [24, 88, 168], [14, 52, 112]]   // schiuma, chiaro, medio, scuro, profondo, abisso
const k = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")

const hs = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) }

// profilo dell'onda in coordinate normalizzate (u: 0 dorso .. 1 fronte, v: 0 cima .. 1 fondo)
const U_CRESTA = 0.72, V_CRESTA = 0.07
const dorso = (u) => V_CRESTA + (0.93 - V_CRESTA) * Math.pow(1 - sm(u / U_CRESTA), 1.25)               // la superficie del dorso: bassa a sinistra, sale alla cresta
const labbro = (t, f) => [U_CRESTA + (0.995 - U_CRESTA) * Math.sin(t * 1.5708), V_CRESTA + (0.46 + 0.02 * Math.sin(f * 1.57) - V_CRESTA) * (1 - Math.cos(t * 1.5708))]   // l'arco del labbro, dalla cresta al becco
const fronte = (v) => U_CRESTA + (1 - U_CRESTA) * Math.pow(sm((v - 0.12) / 0.88), 1.1)                   // dov'e' la parete davanti a quella quota: parte sotto la cresta e si allarga verso il fondo (il cavo)

const onda = (nome, W, H) => {
  for (let f = 0; f < 4; f++) {
    sprite(`${nome}_f${f}`, { w: W, h: H }, (c) => {
      const P = (x, y, col) => { if (x >= 0 && y >= 0 && x < W && y < H) c.px(x, y, k(col)) }
      // il labbro: punti lungo l'arco, ognuno un tondino che cala di spessore verso il becco
      const lab = []
      for (let i = 0; i <= 90; i++) { const t = i / 90, [lu, lv] = labbro(t, f); lab.push([lu * (W - 1), lv * (H - 1), (0.075 - 0.05 * t) * H]) }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = x / (W - 1), v = y / (H - 1)
        const sup = u <= U_CRESTA ? dorso(u) : V_CRESTA
        // 1. il corpo: sotto la superficie del dorso, e (davanti alla cresta) sotto il labbro fino alla parete rientrante
        let dentro = u <= U_CRESTA ? v >= sup : v >= 0.12 && u <= fronte(v)
        // 2. il labbro (schiuma): il punto piu' vicino dell'arco
        let dLab = 1e9
        for (const [lx, ly, r] of lab) { const d = Math.hypot(x - lx, y - ly) - r; if (d < dLab) dLab = d }
        const nelLabbro = dLab < 0
        if (!dentro && !nelLabbro) {
          if (v < 0.5 && u > 0.55 && hs(x, y, 50 + f) < 0.02 && dLab < 4) P(x, y, ACQUA[0])         // schizzi sopra il labbro
          continue
        }
        // 3. il colore: profondita' sotto la superficie, strisce di luce che scorrono, schiuma sul bordo e alla base
        const prof = nelLabbro ? 0 : Math.min(v - sup, (fronte(v) - u) * 1.4 + 0.05)                  // (continuo alla cresta: niente scalino di colore)
        let i
        if (nelLabbro) i = dLab < -0.55 * (0.075 * H) ? 0 : 1
        else if (prof < 0.035) i = 0
        else if (prof < 0.1) i = 1
        else i = 2 + Math.min(3, Math.floor(prof * 4.6))
        const stria = Math.sin((u * 26 + v * 34 - f * 1.571) * 1.0 + 2.6 * Math.sin(v * 7))
        if (!nelLabbro && i >= 2 && i <= 4 && stria > 0.86) i = Math.max(1, i - 1)                            // una striscia piu' chiara
        if (!nelLabbro && i >= 2 && stria < -0.93) i = Math.min(5, i + 1)                                      // e una piu' scura
        const chiazza = hs((x >> 1) + f, (y >> 1), 60) + 0.3 * hs(x, y, 61)                                          // la schiuma alla base e sul fronte: a chiazze, non a granelli
        if (v > 0.86 && u > 0.5 && chiazza < 0.42 + (v - 0.86) * 4) i = chiazza < 0.28 ? 0 : 1
        else if (u > 0.88 && v > 0.5 && chiazza < 0.2) i = 0
        // il bordo del cavo (sotto il labbro, lato interno) in ombra: l'interno del tubo e' piu' scuro
        if (!nelLabbro && u > U_CRESTA && fronte(v) - u < 0.05) i = Math.max(i, 4)
        P(x, y, ACQUA[i])
      }
    })
  }
  sheet(nome, [`${nome}_f*`], { cols: 4, pad: 0 })
}
onda("onda", 72, 52)
onda("maremoto", 128, 92)

// ---- i massi della Frana: macchie irregolari con la luce in alto a sinistra, 4 toni piu' il contorno, qualche crepa
const ROCCIA = [[212, 200, 176], [160, 148, 126], [112, 100, 86], [72, 64, 56], [34, 29, 26]]   // luce, base, ombra, ombra scura, contorno
const masso = (nome, W, H, seme) => sprite(nome, { w: W, h: H }, (c) => {
  const cx = (W - 1) / 2, cy = (H - 1) / 2
  const raggio = (a) => 1 + 0.2 * Math.sin(a * 3 + seme) + 0.12 * Math.sin(a * 5 + seme * 2.3) + 0.08 * Math.sin(a * 8 + seme * 0.7)
  const stato = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / (W / 2), dy = (y - cy) / (H / 2), a = Math.atan2(dy, dx), d = Math.hypot(dx, dy) / raggio(a)
    stato.push(d < 0.92 ? 1 : 0)
  }
  const dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H && stato[y * W + x] === 1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!dentro(x, y)) continue
    const bordo = !dentro(x - 1, y) || !dentro(x + 1, y) || !dentro(x, y - 1) || !dentro(x, y + 1)
    if (bordo) { c.px(x, y, k(ROCCIA[4])); continue }
    const dx = (x - cx) / (W / 2), dy = (y - cy) / (H / 2)
    const luce = -(dx * 0.62 + dy * 0.78) + 0.35 * (hs(x >> 1, y >> 1, seme) - 0.5) + 0.12 * (hs(x, y, seme + 3) - 0.5)           // verso la fonte di luce (alto a sinistra) + grana
    let i = luce > 0.42 ? 0 : luce > -0.05 ? 1 : luce > -0.5 ? 2 : 3
    if (Math.abs(Math.sin((x * 0.9 - y * 0.55 + seme * 5) * 0.55 + 1.2 * Math.sin(y * 0.4))) < 0.075 && hs(x, y, seme + 9) < 0.8) i = Math.min(4, i + 1)  // una crepa diagonale
    c.px(x, y, k(ROCCIA[i]))
  }
})
masso("masso_1", 14, 12, 1); masso("masso_2", 18, 15, 2); masso("masso_3", 22, 18, 3)
masso("masso_4", 26, 21, 4); masso("masso_5", 30, 25, 5); masso("masso_6", 16, 16, 6)

// ---- le ARMI in mano: la mitraglietta del Super Soldato (Raffica controllata), il fucile da cecchino pesante (Tiro di precisione) e la falce delle anime
// di Necromanzia. Tutte guardano a DESTRA (la canna / la lama davanti) e si ruotano sull'avambraccio di chi le tiene; i punti d'impugnatura sono in
// static/mosse.js (ARMI). Le prime due sono metallo scuro con un filo di luce in alto a sinistra; la falce e' fuoco verde: si disegna semitrasparente.
const FERRO = { k: [14, 16, 20], d: [38, 43, 51], m: [68, 76, 88], l: [116, 128, 143], h: [172, 186, 202], b: [196, 150, 66], r: [170, 40, 40], v: [120, 200, 255] }
const griglia = (nome, righe, pal = FERRO) => {
  const W = Math.max(...righe.map((r) => r.length)), H = righe.length
  sprite(nome, { w: W, h: H }, (c) => righe.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) c.px(x, y, k(pal[ch])) })))
}
griglia("uzi", [
  "....kkkkkkkkkkkk...k..",
  "...kllllllllllllk..kk.",
  "...kmmmmmmmmmmmmkkkkkk",
  "...kddddddddddddmlllhk",
  "...kdddddddddddddkkkkk",
  "...kkkkkkkkkkkkkk.....",
  "....kmmdk.k....k......",
  "....kmmdk.kk..k.......",
  "....kmmdk..kkkk.......",
  "....kmddk.............",
  "....kddkk.............",
  "....kkkk..............",
])
griglia("cecchino", [
  "..............kkkkkkkkkkkkkkkk........................",
  ".............kvhhmmmmmmmmmmmmmkk......................",
  ".............kvvdddddddddddddddk......................",
  "..............kkkkmkkkkkkkkmkkk.......................",
  "kkkkkkkkkk..kkmlllllllllllllllkkkkkkkkkkkkkkkkkkkkkkk.",
  "kllllllllkkkkmmmmmmmmmmmmmmmmmmmmlllllllllllllllllhkk",
  "kmmmmmmmmmmmmdddddddddddddddmmmmmmmmmmmmmmmmmmmkkdhkk",
  "kdddddddddddkkkkkkkkkkkkkkkkdddddddddddddddddddkkkdkk",
  "kkkkkkkkkkdddkkdkkmmmmmkkkkkkkkkkkkkkkkkkkkkkkkk..kkk",
  ".........kdkkk.kddkkkkkk.kddk.......................k",
  "..........kkk..kdk......kdk.........................",
  "...............kkk.......k..........................",
])
// la falce: asta a sinistra (la mano la impugna verso il primo terzo), lama che si stacca in punta e si curva all'indietro; verde acceso
const VERDE_F = [[240, 255, 214], [150, 255, 120], [60, 214, 96], [24, 140, 68], [8, 72, 44]]    // filo, luce, corpo, ombra, buio
sprite("falce", { w: 52, h: 40 }, (c) => {
  const P = (x, y, i) => { if (x >= 0 && y >= 0 && x < 52 && y < 40) c.px(x, y, k(VERDE_F[i])) }
  for (let x = 1; x <= 43; x++) { P(x, 22, 1); P(x, 23, 2); P(x, 24, 3) }                           // l'asta: luce sopra, ombra sotto
  for (let x = 6; x <= 40; x += 7) { P(x, 22, 0); P(x, 25, 4) }                                         // i nodi
  P(0, 23, 4); P(0, 22, 3); P(0, 24, 4)
  const R0 = 15, CX = 29, CY = 22                                                                        // la lama e' un arco di cerchio che parte dalla punta dell'asta e gira verso il basso e verso la mano
  for (let y = 0; y < 40; y++) for (let x = 0; x < 52; x++) {
    const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx)                      // (a = 0: davanti all'asta; cresce girando verso il basso)
    if (a < -0.05 || a > 2.45) continue
    const s = Math.max(0, a) / 2.45, w = 5.0 * Math.pow(1 - s, 0.8) + 0.5                              // spessa alla base, una punta in fondo
    const q = (d - R0) / w                                                                              // -1 = il filo (dentro la curva), +1 = il dorso
    if (Math.abs(q) > 1) continue
    let i = q < -0.62 ? 0 : q < -0.15 ? 1 : q < 0.5 ? 2 : q < 0.82 ? 3 : 4
    if (q > -0.62 && hs(x, y, 8) < 0.16) i = Math.max(1, i - 1)
    P(x, y, i)
  }
})
