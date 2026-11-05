/* Urban — arena del duello: due combattenti fisici (static/pupazzo.js) disegnati su un canvas, con sangue per locazione
   che cresce col danno (e, in negativo, pelle strappata su carne e ossa), ombre, schizzi, polvere e scosse dello schermo. Tutto in coordinate dello sprite (48x111,
   static/sprites/maschio/parti.json) ingrandite di una scala intera; i pezzi si disegnano alla posa interpolata tra
   due passi di fisica (60 Hz fissi), a posizione e angolo *reali* (niente scatti a pixel interi). API:
   Arena.update(S) (stato del duello), Arena.colpo(ev) (uno scambio), Arena.passi(n) (avanza a mano, per i test). */
const Arena = (() => {
  const BASE = "/static/sprites/maschio/";
  const DT = 1 / 60;
  // i 5 grigi dello sprite base (canale R) -> chiave; la skin e il sangue sono mappe sulle stesse chiavi
  const GRIGI = {38: "k", 106: "a", 142: "b", 178: "c", 216: "d"};
  const PELLI = {
    p: {k: [42, 26, 20], a: [168, 105, 63], b: [201, 138, 91], c: [224, 169, 121], d: [243, 201, 160]},
    c: {k: [30, 22, 28], a: [118, 84, 98], b: [150, 112, 124], c: [182, 144, 150], d: [214, 178, 178]},
  };
  const SANGUE = {a: [107, 13, 24], b: [163, 17, 31], c: [201, 32, 44], d: [232, 64, 74]};
  const PIEDI = {parte: "stinco", riga: 26, sovrapposizione: 3};   // come si ritaglia il piede dallo stinco (parti.json: "piedi")
  const GRAV = 1100;
  const DIST = 58;                  // distanza a riposo tra i due bacini (px sprite)
  const BORDO = 14;                 // fascia del pavimento in fondo all'arena (px schermo)

  const PO = typeof Poteri !== "undefined" ? Poteri : null;    // l'aspetto dei poteri (static/poteri.js): senza, il duello e' lo stesso ma senza effetti
  const MO = typeof Mosse !== "undefined" ? Mosse : null;      // le animazioni dei singoli attacchi (static/mosse.js): senza, ogni attacco ha l'animazione di base
  let man = null, parti = null;     // parti.json e i pezzi caricati
  let ring = null;                  // lo sfondo del ring (static/sprites/ring): {sfondo, luci} = immagini, null = non disponibile (resta il fondale a gradiente)
  let pot = null;                   // poteri.json: i pezzi che i poteri sostituiscono (rinforzati, appuntiti), in `parti[nome].rinf` / `.app`
  let asp = null;                   // aspetto.json + sprite di capelli e vestiti + texture dei colori (null = non disponibile)
  const locEstesa = {};             // locazione -> {y0, y1}: righe dello sprite intero che occupa
  const lati = {};                  // "p" | "c" -> combattente
  let tela = null, ctx = null, arenaEl = null;
  let W = 0, H = 0, S = 2, dpr = 1; // dimensioni (px schermo), scala dei pixel sprite, densita'
  let Wp = 0, pavY = 0;             // larghezza in px sprite; y schermo del pavimento
  let scalaFn = null;               // (W, H) -> scala intera: se c'e', decide lei (la palestra); altrimenti l'altezza dell'arena
  let ultimoT = 0, acc = 0, alpha = 0;
  let congela = 0, rallenta = 1, rallentaT = 0;    // hit-stop (secondi che restano), fattore di tempo e quanto dura ancora
  const scossa = {a: 0, x: 0, y: 0};  // scossa dello schermo
  const particelle = [], macchie = [];
  const futuri = [];                // eventi a tempo (secondi di simulazione): {t, fn}
  const coda = [];                  // scambi (colpi) in attesa di essere giocati
  let scambio = null;               // quello in corso
  let vittoria = null;              // fine del duello: {lato, tipo, avviata}; chi vince esulta quando gli scambi sono finiti
  let colori = {};
  let ultimoStato = null;
  let sagome = null, locSag = null; // "modo sagome": disegnaCombattente disegna sagome piatte al posto del corpo (per il mirino); locSag = locazione forzata (braccia extra)
  const mira = {attiva: false, lato: "c", stile: "mira", segna: null, cb: null, mx: 0, my: 0, dentro: false, hover: null, locs: [], pick: null, pickCtx: null};
  /* due mirini: "mira" (si sceglie dove colpire l'avversario: ambra e rosso) e "parata" (si sceglie con quale parte del PROPRIO corpo incassare: azzurro e blu) */
  const STILI_MIRA = {
    mira: {contorno: "#ffd34d", hover: "#ff2a3c", titolo: "MIRINO · scegli la parte del corpo · Esc per annullare", testo: "rgba(255,211,77,0.95)"},
    parata: {contorno: "#5ec8ff", hover: "#2f7bff", titolo: "PARATA · scegli dove incassare il colpo · Esc per annullare", testo: "rgba(130,205,255,0.97)"},
  };
  let luogo = null;                 // lo sfondo del duello (St.luogo): null = l'arena con la folla, "vicolo" = l'imboscata

  const hash = (x, y, s) => {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vn = (x, y, s) => {         // value noise: macchie coerenti, non puntini sparsi
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const lim = (x, a, b) => Math.min(b, Math.max(a, x));
  /* il seme che differenzia il rumore (macchie di sangue, ferite) tra i combattenti: "p" e "c" (il duello) come sempre,
     qualunque altro nome (la palestra) ne ha uno suo */
  const semeLato = (lato, c = 97) => lato === "p" ? 0 : lato === "c" ? c : c + 13 * (1 + [...String(lato)].reduce((t, ch) => t + ch.charCodeAt(0), 0) % 50);

  const leggi = (file) => new Promise(res => {
    if (!file) return res(null);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const cx = c.getContext("2d");
      cx.drawImage(img, 0, 0);
      res({tela: c, px: cx.getImageData(0, 0, img.width, img.height).data});
    };
    img.onerror = () => res(null);                  // l'interno e' facoltativo: senza, il corpo resta pelle e sangue
    img.src = BASE + file;
  });

  async function carica() {
    man = await (await fetch(BASE + "parti.json")).json();
    const lista = await Promise.all(Object.entries(man.parti).map(async ([nome, p]) => {
      const [pelle, sk, ca] = await Promise.all([leggi(p.file), leggi(p.scheletro), leggi(p.carne)]);
      return [nome, {...p, w: pelle.tela.width, h: pelle.tela.height, px: pelle.px, sk: sk && sk.tela, ca: ca && ca.px}];
    }));
    parti = Object.fromEntries(lista);
    // per ogni locazione, quanto e' lunga (in righe dello sprite intero): serve a centrare la ferita
    for (const p of Object.values(parti)) {
      const l = locEstesa[p.loc] = locEstesa[p.loc] || {y0: 1e9, y1: 0};
      l.y0 = Math.min(l.y0, p.y0); l.y1 = Math.max(l.y1, p.y0 + p.h);
    }
    await caricaAspetto();
    await caricaPoteri();
    await caricaRing();
  }

  /* lo sfondo del ring: due immagini (v. tools/sprites/ring_sfondo.px.js): il muro con corde, tribune e neon, e le luci (additive) */
  async function caricaRing() {
    const img = (f) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = "/static/sprites/ring/" + f; });
    const [sfondo, luci] = await Promise.all([img("ring_sfondo.png"), img("ring_luci.png")]);
    ring = sfondo ? {sfondo, luci} : null;
  }

  /* i pezzi che i poteri sostituiscono (static/sprites/maschio/poteri.json): rinforzati (Pelle Invincibile dal rango 3) e appuntiti (Appendici Affilate).
     Facoltativi: senza, restano il corpo e la pelle in materiale (rango 1-2). */
  async function caricaPoteri() {
    try {
      const m = await (await fetch(BASE + "poteri.json")).json();
      for (const [tipo, chiave] of [["rinforzato", "rinf"], ["appuntito", "app"]])
        await Promise.all(Object.entries(m[tipo].pezzi).map(async ([nome, f]) => {
          const r = await leggi(f);
          if (r && parti[nome]) parti[nome][chiave] = {w: r.tela.width, h: r.tela.height, px: r.px};
        }));
      pot = {margine: m.rinforzato.margine};
    } catch (e) { pot = null; }
  }

  /* capigliature, maglie, pantaloni e le due texture dei colori (static/sprites/maschio/aspetto.json). Senza, i combattenti
     restano nudi e pelati: il resto del gioco funziona uguale. */
  async function caricaAspetto() {
    try {
      const m = await (await fetch(BASE + "aspetto.json")).json();
      const L = async (f) => { const r = await leggi(f); return r && {w: r.tela.width, h: r.tela.height, px: r.px}; };
      const tex = {vestiti: await L(m.texture.vestiti), capelli: await L(m.texture.capelli)};
      const capelli = {}, maglie = {}, pantaloni = {};
      await Promise.all([
        ...m.capelli.map(async c => { capelli[c.id] = {...c, img: await L(c.file)}; }),
        ...[["maglie", maglie], ["pantaloni", pantaloni]].flatMap(([k, dest]) => m[k].map(async g => {
          dest[g.id] = {...g, img: Object.fromEntries(await Promise.all(Object.entries(g.pezzi).map(async ([parte, f]) => [parte, await L(f)])))};
          if (g.falda) dest[g.id].falda = {...g.falda, img: await L(g.falda.file)};          // un pezzo staccato appeso al busto (trench)
        }))]);
      const ali = m.ali ? {...m.ali, img: await L(m.ali.file)} : null;
      const copricapo = {};
      await Promise.all((m.copricapo || []).map(async c => { copricapo[c.id] = {...c, img: await L(c.file)}; }));
      let fasce = null;                                   // le fasciature (palestra): un overlay per pezzo, in un colore crema fisso
      if (m.fasciature) {
        const img = Object.fromEntries(await Promise.all(Object.entries(m.fasciature.pezzi).map(async ([parte, f]) => [parte, await L(f)])));
        fasce = {img, rp: rampa(m.fasciature.colore)};
      }
      asp = tex.vestiti && tex.capelli ? {tex, capelli, maglie, pantaloni, copricapo, ali: ali && ali.img ? ali : null, fasce} : null;
    } catch (e) { asp = null; }
  }

  /* ---- colori: l'aspetto di un personaggio porta solo un `seed`; i colori si campionano dalle texture (x = u * larghezza, con u
     derivato dal seed): le sezioni larghe della texture dei vestiti escono spesso, quella stretta (bianco) quasi mai. Da un
     colore si ricava una rampa k,a,b,c,d con la stessa logica dei 5 indici del corpo. */
  const mescola = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const U = (seed, tag) => hash((seed >>> 0) % 1000003, (seed >>> 20) & 0xfff, tag + 4242);
  function campiona(tex, u) {
    const x = Math.min(tex.w - 1, Math.floor(u * tex.w)), i = (tex.w + x) * 4;
    return [tex.px[i], tex.px[i + 1], tex.px[i + 2]];
  }
  function rampa(rgb) {
    const lum = (0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) / 255;
    let b = rgb;                                         // ne' nero ne' bianco pieni: non avrebbero ombre o luci
    if (lum < 0.15) b = mescola(b, [255, 255, 255], (0.15 - lum) / (1 - lum));
    else if (lum > 0.86) b = mescola(b, [0, 0, 0], (lum - 0.86) / lum);
    const r = {b, a: mescola(b, [0, 0, 0], 0.3), k: mescola(b, [0, 0, 0], 0.62), c: mescola(b, [255, 255, 255], 0.2), d: mescola(b, [255, 255, 255], 0.42)};
    for (const k of Object.keys(r)) r[k] = r[k].map(Math.round);
    return r;
  }
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const FAR = {k: "k", a: "a", b: "a", c: "b", d: "c"};       // arto lontano: un gradino piu' scuro, come la pelle
  const SCURO = {k: "k", a: "k", b: "a", c: "b", d: "c"};      // orlo strappato di un indumento: un gradino piu' scuro

  function coloriAspetto(a) {
    const capelli = campiona(asp.tex.capelli, U(a.seed, 1)).map(v => v * (0.94 + 0.12 * U(a.seed, 5)));
    const fisso = (tipo, id) => asp[tipo][id] && asp[tipo][id].colore;                 // un capo puo' avere un colore suo (cuoio, bianco...)
    const maglia = fisso("maglie", a.maglia) || campiona(asp.tex.vestiti, U(a.seed, 2));
    let pant = fisso("pantaloni", a.pantaloni) || campiona(asp.tex.vestiti, U(a.seed, 3));
    for (let k = 1; k < 6 && !fisso("pantaloni", a.pantaloni) && dist2(maglia, pant) < 55 * 55; k++) pant = campiona(asp.tex.vestiti, U(a.seed, 3 + 10 * k));   // maglia e pantaloni non si confondono
    const cop = a.copricapo && asp.copricapo[a.copricapo], cc = cop && (cop.colore || campiona(asp.tex.vestiti, U(a.seed, 9)));
    return {capelli: rampa(capelli), maglia: rampa(maglia), pantaloni: rampa(pant), copricapo: cc ? rampa(cc) : null};
  }

  /* Sotto la pelle c'e' l'interno (scheletro e viscere, poi la carne): quando una locazione va in NEGATIVO la pelle si strappa
     a macchie (alpha mask) e si intravede la carne, poi, piu' giu', l'osso. `prof` = -hp/hp_max in 0..1 (0 = non si vede niente,
     1 = a -hp_max: del corpo restano ossa e brandelli). Le maschere sono *ranghi* per pixel (percentili di rumore a macchie piu'
     la distanza da un centro-ferita fisso per locazione): cosi' la quota di pelle strappata e' esattamente quella voluta, e cresce
     sempre a partire dagli stessi punti. */
  const quotaPelle = (d) => d <= 0 ? 0 : Math.min(0.985, Math.max(0.08, 1 - Math.pow(1 - d, 1.4)));     // pelle strappata
  const quotaCarne = (d) => d <= 0.1 ? 0 : Math.min(0.97, Math.pow((d - 0.1) / 0.9, 0.9));             // carne strappata (dopo la pelle)
  const BORDO_FERITA = [92, 14, 26];
  /* Texture delle ferite per tipo di danno (sopra il sangue, nell'ordine fuoco, acido, fulmine: si sovrappongono). Il sangue rosso resta per
     tutto cio' che non e' uno di questi tre. Ogni tipo e' una mappa dei toni del corpo (a,b,c,d) -> colore. */
  const FUOCO = {a: [8, 8, 8], b: [22, 20, 20], c: [40, 36, 35], d: [62, 56, 54]};          // ustione: nero
  const ACIDO = {a: [66, 98, 18], b: [108, 150, 32], c: [150, 190, 52], d: [190, 224, 92]};  // corrosione: verde giallastro, butterata
  const FULMINE = {a: [118, 40, 52], b: [176, 72, 86], c: [222, 128, 132], d: [244, 184, 168]};   // cicatrice ramificata
  const ACIDO_SECONDI = 3;                                    // l'acido si "mangia" la pelle in tre secondi

  const semino = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* la cicatrice da fulmine di una locazione: rami che si diramano da un punto, ogni cella col suo "ordine" (0 = la radice, 1 = la punta
     piu' lontana): con un danno elettrico crescente il disegno si allunga dalla radice. Coordinate: x del pezzo, y dello sprite intero. */
  function fulmine(lato, loc) {
    const L = lati[lato];
    if (L.fulm[loc]) return L.fulm[loc];
    const ext = locEstesa[loc], len = Math.max(1, ext.y1 - ext.y0), sem = loc.length * 131 + loc.charCodeAt(2) + semeLato(lato, 977);
    const r = semino(sem), celle = new Map(), MAXL = 30;
    const metti = (x, y, o) => { const k = Math.round(x) + "," + Math.round(y); if (!(celle.has(k) && celle.get(k) <= o)) celle.set(k, o); };
    const ramo = (x, y, ang, n, prof) => {
      for (let i = 0; i < n; i++) {
        ang += (r() - 0.5) * (prof ? 1.5 : 0.95);                                     // zig-zag
        x += Math.cos(ang) * 1.1; y += Math.sin(ang) * 1.1;
        const o = (i + prof * 9) / (MAXL + 12);
        metti(x, y, o); if (!prof) metti(x + 1, y, o + 0.02);                          // il ramo principale e' piu' spesso
        if (prof < 2 && i > 3 && r() < 0.16) ramo(x, y, ang + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.6), Math.round(n * 0.55 - i * 0.25), prof + 1);
      }
    };
    const cx = 4 + 6 * r(), cy = ext.y0 + len * (0.25 + 0.5 * r()), base = r() * 6.28;
    metti(cx, cy, 0);
    for (let k = 0; k < 3; k++) ramo(cx, cy, base + k * 2.1 + (r() - 0.5), MAXL - k * 4, 0);
    return L.fulm[loc] = celle;
  }

  function rango(lato, nome, tipo) {
    const L = lati[lato], k = nome + tipo;
    if (L.rk[k]) return L.rk[k];
    const p = parti[nome], ext = locEstesa[p.loc], len = Math.max(1, ext.y1 - ext.y0);
    const sem = p.loc.length * 31 + p.loc.charCodeAt(p.loc.length - 1) + semeLato(lato) + tipo * 53;
    const cx = 2 + 8 * hash(sem, 1, 5), cy = ext.y0 + len * (0.2 + 0.6 * hash(sem, 2, 5));      // il centro della ferita
    const v = new Float32Array(p.w * p.h), idx = [];
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      if (!p.px[i * 4 + 3]) continue;
      const dd = Math.hypot((x - cx) * 1.3, p.y0 + y - cy) / (len * 0.8 + 6);
      v[i] = 0.5 * vn(x / 2.2, (y + p.y0) / 2.2, sem) + 0.15 * hash(x, y + p.y0, sem + 3) + 0.35 * Math.min(1, dd);
      idx.push(i);
    }
    idx.sort((a, b) => v[a] - v[b]);
    const r = new Float32Array(p.w * p.h).fill(-1);
    idx.forEach((i, n) => { r[i] = n / idx.length; });
    return L.rk[k] = r;
  }

  /* ranghi dei capelli (sprite piu' grande della testa, niente centro-ferita: solo macchie) */
  function rangoCapelli(lato) {
    const L = lati[lato], c = L.capelli, sem = 777 + semeLato(lato);
    if (c.rk) return c.rk;
    const w = c.img.w, h = c.img.h, v = new Float32Array(w * h), idx = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!c.img.px[i * 4 + 3]) continue;
      v[i] = 0.7 * vn(x / 2.2, y / 2.2, sem) + 0.3 * hash(x, y, sem + 3);
      idx.push(i);
    }
    idx.sort((a, b) => v[a] - v[b]);
    c.rk = new Float32Array(w * h).fill(-1);
    idx.forEach((i, n) => { c.rk[i] = n / idx.length; });
    return c.rk;
  }

  /* un'immagine a indici (capelli, indumenti) -> pixel colorati con una rampa; `r` (ranghi) e `q` = quota strappata, `blood` =
     soglia del sangue (0 = nessuno). I pixel strappati spariscono (si vede quello che sta sotto) e il bordo di quelli che restano
     si scurisce di un gradino. `y0` serve a rendere continuo il rumore del sangue tra le due meta' di un arto. */
  function coloraIndici(cv, img, rp, {far = false, r = null, q = 0, sangue = 0, y0 = 0, seed = 0} = {}) {
    const cx = cv.getContext("2d"), out = cx.createImageData(img.w, img.h), w = img.w, h = img.h;
    const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && img.px[(y * w + x) * 4 + 3] > 0;
    const resta = (x, y) => !r || r[y * w + x] >= q;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!img.px[i + 3] || !resta(x, y)) continue;
      let g = GRIGI[img.px[i]] || "b";
      if (far) g = FAR[g];
      if (r && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => op(x + dx, y + dy) && !resta(x + dx, y + dy))) g = SCURO[g];
      let col = rp[g];
      if (sangue && g !== "k" && 0.7 * vn(x / 3, (y + y0) / 3, seed + 500) + 0.3 * hash(x, y + y0, seed + 507) < sangue) col = SANGUE[g === "a" ? "a" : g];
      out.data.set([col[0], col[1], col[2], 255], i);
    }
    cx.putImageData(out, 0, 0);
  }

  /* i vestiti di un pezzo (pantaloni poi maglia): si strappano con i danni. `f` = 0 (intatto) .. 1 (strappato del tutto): vale
     (1 - hp/max) / 0.85, cioe' a 15% degli hp della locazione l'indumento non c'e' piu'. Strappi e orli, poi sangue sugli stracci. */
  /* ranghi di strappo della falda del cappotto (come rangoCapelli): l'orlo cede per primo, poi il resto a macchie */
  function rangoFalda(L) {
    const fa = L.falda;
    if (fa.rk) return fa.rk;
    const w = fa.img.w, h = fa.img.h, v = new Float32Array(w * h), idx = [], sem = 4141 + semeLato(L.lato);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!fa.img.px[i * 4 + 3]) continue;
      v[i] = 0.5 * vn(x / 2.2, y / 2.2, sem) + 0.15 * hash(x, y, sem + 3) + 0.35 * (1 - y / h);
      idx.push(i);
    }
    idx.sort((a, b) => v[a] - v[b]);
    fa.rk = new Float32Array(w * h).fill(-1);
    idx.forEach((i, n) => { fa.rk[i] = n / idx.length; });
    return fa.rk;
  }

  function disegnaVestiti(lato, nome, f) {
    const L = lati[lato], lista = L.vest[nome];
    if (L.falda && L.falda.pezzo === nome) {          // la falda si strappa coi danni del busto, come il resto del cappotto (ma dal fondo)
      const sem = 4141 + semeLato(lato);
      coloraIndici(L.falda.tela, L.falda.img, L.falda.rp, {r: f > 0 ? rangoFalda(L) : null, q: f, sangue: 0.85 * f, seed: sem});
    }
    if (!lista) return;
    const p = parti[nome], seed = p.loc.length * 31 + p.loc.charCodeAt(p.loc.length - 1) + semeLato(lato);
    const r = f > 0 ? rango(lato, nome, 2) : null;
    const lama = !!(PO && p.app && PO.lama(L, nome));              // l'avambraccio appuntito (Appendici Affilate): la manica non esce dalla sua sagoma
    for (const v of lista) {
      coloraIndici(v.tela, v.img, v.rp, {far: v.far, r, q: f, sangue: 0.85 * f, y0: p.y0, seed});
      if (lama) { const cx = v.tela.getContext("2d"); cx.globalCompositeOperation = "destination-in"; cx.drawImage(L.sagApp[nome], 0, 0); cx.globalCompositeOperation = "source-over"; }
    }
  }

  function disegnaCapelli(lato, prof) {
    const c = lati[lato].capelli;
    if (!c) return;
    coloraIndici(c.tela, c.img, c.rp, prof > 0 ? {r: rangoCapelli(lato), q: quotaPelle(prof)} : {});   // a testa spaccata anche i capelli vanno
  }

  /* La fasciatura di un pezzo (solo in palestra, al posto di sangue e carne): la garza dell'overlay `fascia_<pezzo>` in crema, su una fetta della
     locazione che si allarga con la gravita' `g` (0..1; continua tra i due pezzi di un arto: coordinate dello sprite intero), con macchie di sangue
     dal mezzo hp in giu'. La testa e' sempre una fascia sola. */
  const FASCIA_MIN = 0.1;                                      // sopra il 90% degli hp non si fascia
  function disegnaFascia(lato, nome, g) {
    const L = lati[lato], p = parti[nome], img = asp && asp.fasce && asp.fasce.img[nome.replace(/_(dx|sx)$/, "")];
    if (!(g > 0) || !img) { delete L.fasce[nome]; return; }
    const cv = L.fasce[nome] || (L.fasce[nome] = Object.assign(document.createElement("canvas"), {width: img.w, height: img.h}));
    const seed = p.loc.length * 31 + p.loc.charCodeAt(p.loc.length - 1) + semeLato(lato);
    coloraIndici(cv, img, asp.fasce.rp, {far: nome.endsWith("_sx"), sangue: g > 0.4 ? 0.05 + 0.55 * (g - 0.4) : 0, y0: p.y0, seed});
    if (nome === "testa") return;
    const ext = locEstesa[p.loc], len = ext.y1 - ext.y0, mezzo = len * (0.3 + 0.7 * g) / 2, centro = ext.y0 + len * (0.42 + 0.16 * hash(1, 2, seed));
    const a = Math.round(centro - mezzo - p.y0), b = Math.round(centro + mezzo - p.y0), cx = cv.getContext("2d");
    cx.globalCompositeOperation = "destination-out";
    if (a > 0) cx.fillRect(0, 0, img.w, a);
    if (b < img.h) cx.fillRect(0, b, img.w, img.h - b);
    cx.globalCompositeOperation = "source-atop"; cx.fillStyle = "rgb(" + asp.fasce.rp.a.join(",") + ")";      // il bordo del giro tagliato
    if (a > 0 && a < img.h) cx.fillRect(0, a, img.w, 1);
    if (b > 0 && b <= img.h) cx.fillRect(0, b - 1, img.w, 1);
    cx.globalCompositeOperation = "source-over";
  }

  /* dai a un combattente il suo aspetto: capigliatura, maglia, pantaloni, colori dal seed */
  function applicaAspetto(lato, a) {
    const L = lati[lato];
    L.vest = {}; L.capelli = null; L.cop = null; L.copStacc = null; L.ali = null; L.falda = null;
    if (!asp || !a) return;
    const col = coloriAspetto(a), base = (nome) => nome.replace(/_(dx|sx)$/, "");
    const tela = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
    for (const nome of Object.keys(parti)) {
      const lista = [];
      for (const [tipo, scelto, rp] of [["pantaloni", a.pantaloni, col.pantaloni], ["maglie", a.maglia, col.maglia]]) {
        const img = asp[tipo][scelto] && asp[tipo][scelto].img[base(nome)];
        if (img) lista.push({img, rp, far: nome.endsWith("_sx"), tela: tela(img.w, img.h)});
      }
      if (lista.length) L.vest[nome] = lista;
    }
    const fa = asp.maglie[a.maglia] && asp.maglie[a.maglia].falda;
    if (fa && fa.img) {                                // la falda del cappotto: stessa tinta della maglia, ma un pezzo a se' (v. disegnaFalda)
      L.falda = {img: fa.img, off: fa.offset, perno: fa.perno, pezzo: fa.pezzo, tela: tela(fa.img.w, fa.img.h), ang: 0, vel: 0, rp: col.maglia, rk: null};    // (si colora in disegnaVestiti)
    }
    const cop = a.copricapo && asp.copricapo[a.copricapo];
    const h = asp.capelli[a.capelli];
    L.copCoprePelo = !!(cop && cop.nascondi_capelli);
    if (h && h.img) L.capelli = {img: h.img, off: h.offset, rp: col.capelli, tela: tela(h.img.w, h.img.h), rk: null};
    if (cop && cop.img) { L.cop = {img: cop.img, off: cop.offset, tela: tela(cop.img.w, cop.img.h)}; coloraIndici(L.cop.tela, cop.img, col.copricapo); }
    for (const nome of Object.keys(parti)) disegnaVestiti(lato, nome, 0);
    disegnaCapelli(lato, 0);
    if (asp.ali) {                                    // le ali: piume di un colore naturale preso dalla texture dei capelli, schiarito
      const piume = rampa(mescola(campiona(asp.tex.capelli, U(a.seed, 7)), [255, 255, 255], 0.2)), w = asp.ali.img.w, h = asp.ali.img.h;
      L.ali = {vicina: tela(w, h), lontana: tela(w, h), perno: asp.ali.perno, att: asp.ali.attacco, fase: 6.28 * U(a.seed, 8)};
      coloraIndici(L.ali.vicina, asp.ali.img, piume); coloraIndici(L.ali.lontana, asp.ali.img, piume, {far: true});
    }
  }

  /* skin + sangue: una macchia di rumore decide quali pixel sono sporchi, `danno` (0..1) alza la soglia. Il rumore e' calcolato
     sulle coordinate dello sprite intero (y0), cosi' le due meta' di un arto sono continue. Con `prof` > 0 i pixel strappati
     spariscono e il bordo di quelli che restano e' un orlo di ferita. */
  function disegnaPelle(lato, nome, danno, prof) {
    const L = lati[lato], p = parti[nome], cv = L.tele[nome], cx = cv.getContext("2d");
    const seed = p.loc.length * 31 + p.loc.charCodeAt(p.loc.length - 1) + semeLato(lato);
    // i poteri: Pelle Invincibile mette un materiale al posto della pelle (e dal rango 3 un pezzo rinforzato), Appendici Affilate un avambraccio appuntito
    const rp = PO ? PO.rangoPelle(L, p.loc, nome) : 0, lama = !!(PO && p.app && PO.lama(L, nome)), px = lama ? p.app.px : p.px;
    L.rinfOn[nome] = rp >= 3 && !!p.rinf && !lama;
    L.vestOff[nome] = rp >= 3 || !!(PO && PO.pugnoSu(L, nome));                    // dal rango 3 il potere sostituisce il livello dei vestiti (anche sulla lama); il Pugno di Roccia lascia l'avambraccio nudo
    if (rp) {                                                                      // pietra e ossidiana sulla forma di sempre, rinforzata dal rango 3 (senza sangue: la pietra non sanguina)
      if (L.rinfOn[nome]) PO.coloraMateriale(L.telaR[nome], p.rinf, rp, {y0: p.y0, mx: pot.margine[0], my: pot.margine[1], seme: seed, fase: L.faseMat || 0});
      else PO.coloraMateriale(cv, {w: p.w, h: p.h, px}, rp, {y0: p.y0, seme: seed, fase: L.faseMat || 0});
      return;
    }
    const out = cx.createImageData(p.w, p.h);
    const soglia = prof > 0 ? 1 - 0.5 * Math.sqrt(prof) : danno > 0 ? 0.1 + 0.9 * danno : 0;   // (continua con il caso sotto: a 0 hp e' 1)
    const r = prof > 0 ? rango(lato, nome, 0) : null, q = quotaPelle(prof);
    const resta = (x, y) => x >= 0 && y >= 0 && x < p.w && y < p.h && r[y * p.w + x] >= q;
    const tip = L.tip[p.loc] || {}, fu = tip.fuoco || 0, ac = tip.acido || 0, el = tip.elettrico || 0;
    const fz = el > 0 ? fulmine(lato, p.loc) : null;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      if (!px[i + 3]) continue;
      if (r && r[y * p.w + x] < q) continue;                                   // strappata: si vede quello che sta sotto
      const g = GRIGI[px[i]] || "b", wy = y + p.y0;
      let col = PELLI[lato === "c" ? "c" : "p"][g];       // la pelle viola e' quella della CPU; tutti gli altri hanno la pelle normale
      if (g !== "k" && soglia) {
        const v = 0.7 * vn(x / 3, wy / 3, seed) + 0.3 * hash(x, wy, seed + 7);
        if (v < soglia) col = SANGUE[soglia - v > 0.35 ? "a" : g];
      }
      if (g !== "k") {   // ...poi, uno sopra l'altro: ustioni, acido, fulmini
        if (fu > 0 && 0.65 * vn(x / 2.5, wy / 2.5, seed + 900) + 0.35 * hash(x, wy, seed + 907) < 0.06 + 0.94 * Math.min(1, fu * 1.7)) col = FUOCO[g];
        if (ac > 0) {
          const v = 0.6 * vn(x / 2.2, wy / 2.2, seed + 1900) + 0.4 * hash(x, wy, seed + 1907);
          if (v < 0.06 + 0.94 * Math.min(1, ac * 1.7)) col = ACIDO[hash(x, wy, seed + 1950) < 0.14 ? "a" : g];   // con le bolle scure della corrosione
        }
        if (fz) { const o = fz.get(x + "," + wy); if (o !== undefined && o <= 0.12 + el * 1.25) col = FULMINE[g]; }
      }
      if (r && ((x > 0 && px[i - 4 + 3] && !resta(x - 1, y)) || (x < p.w - 1 && px[i + 4 + 3] && !resta(x + 1, y)) ||
                (y > 0 && px[i - p.w * 4 + 3] && !resta(x, y - 1)) || (y < p.h - 1 && px[i + p.w * 4 + 3] && !resta(x, y + 1))))
        col = BORDO_FERITA;
      out.data.set([col[0], col[1], col[2], 255], i);
    }
    cx.putImageData(out, 0, 0);
  }

  /* la carne: i pixel del suo sprite, strappati dopo la pelle (stessa idea, altra maschera); i bordi si scuriscono */
  function disegnaCarne(lato, nome, prof) {
    const p = parti[nome], cx = lati[lato].carne[nome].getContext("2d");
    cx.clearRect(0, 0, p.w, p.h);
    if (!(prof > 0) || !p.ca) return;
    const out = cx.createImageData(p.w, p.h), r = rango(lato, nome, 1), q = quotaCarne(prof);
    const resta = (x, y) => x >= 0 && y >= 0 && x < p.w && y < p.h && r[y * p.w + x] >= q;
    const lama = !!(PO && p.app && PO.lama(lati[lato], nome));      // avambraccio appuntito: la carne non esce dalla sua sagoma
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      if (!p.ca[i + 3] || r[y * p.w + x] < q || (lama && !p.app.px[i + 3])) continue;
      const bordo = (x > 0 && p.ca[i - 4 + 3] && !resta(x - 1, y)) || (x < p.w - 1 && p.ca[i + 4 + 3] && !resta(x + 1, y)) ||
                    (y > 0 && p.ca[i - p.w * 4 + 3] && !resta(x, y - 1)) || (y < p.h - 1 && p.ca[i + p.w * 4 + 3] && !resta(x, y + 1));
      const f = bordo ? 0.62 : 1;
      out.data.set([p.ca[i] * f, p.ca[i + 1] * f, p.ca[i + 2] * f, 255], i);
    }
    cx.putImageData(out, 0, 0);
  }

  /* silhouette bianca di un pezzo (per il lampo del colpo) */
  function sagomaDa(img) {                              // img = {w, h, px}: il pezzo base, o uno che lo sostituisce (rinforzato, appuntito)
    const c = document.createElement("canvas");
    c.width = img.w; c.height = img.h;
    const cx = c.getContext("2d"), out = cx.createImageData(img.w, img.h);
    for (let i = 0; i < img.w * img.h; i++) if (img.px[i * 4 + 3]) out.data.set([255, 255, 255, 255], i * 4);
    cx.putImageData(out, 0, 0);
    return c;
  }
  const sagoma = (nome) => sagomaDa(parti[nome]);

  function costruisci(lato) {
    const pup = new Pupazzo.Pupazzo(man);
    const L = {lato, f: lato === "p" ? 1 : -1, O: 0, pup, acidoVel: {}, tele: {}, carne: {}, rk: {}, sag: {}, chiave: {}, prof: {}, lamp: {}, voci: [], nome: "", vest: {}, capelli: null, cop: null, aspKey: null, tip: {}, dati: {}, acidoVis: {}, acidoObj: {}, fulm: {}, ali: null, extra: {}, tAnim: 0, fasce: {},
               ko: false, ultimo: null, xNome: 0,
               po: null, telaR: {}, sagR: {}, sagApp: {}, rinfOn: {}, vestOff: {}, locEx: {}, acq: 0, fuo: 0};      // i poteri: stato degli effetti, pezzi rinforzati (tela e sagoma), sagoma dell'avambraccio appuntito, quali pezzi sono rinforzati ora
    for (const [nome, p] of Object.entries(parti)) {
      const c = document.createElement("canvas"); c.width = p.w; c.height = p.h;
      L.tele[nome] = c; L.sag[nome] = sagoma(nome);
      L.carne[nome] = c.cloneNode();
      if (p.rinf) { L.telaR[nome] = Object.assign(document.createElement("canvas"), {width: p.rinf.w, height: p.rinf.h}); L.sagR[nome] = sagomaDa(p.rinf); }
      if (p.app) L.sagApp[nome] = sagomaDa(p.app);
    }
    // l'elenco dei pezzi da disegnare: ognuno appeso a un corpo, con lo scarto del suo angolo in alto a sinistra dal
    // centro di massa (a riposo). Il piede e' ritagliato dallo stinco, con qualche riga in comune che nasconde la giuntura.
    const pi = {...PIEDI, ...(man.piedi || {})};
    for (const [nome, p] of Object.entries(parti)) {
      const A = man.giunti[p.da], tl = [A[0] - p.perno[0], A[1] - p.perno[1]];
      const spezzato = nome.startsWith(pi.parte + "_");
      const voce = (id, cor, y0, h, z) => {
        const r = pup.rest[cor];
        L.voci.push({id, nome, corpo: cor, y0, h, ox: tl[0] - r.x, oy: tl[1] + y0 - r.y, z});
      };
      if (spezzato) {
        const lt = nome.slice(pi.parte.length + 1);
        voce(nome, nome, 0, Math.min(p.h, pi.riga + pi.sovrapposizione), p.z);
        voce("piede_" + lt, "piede_" + lt, pi.riga, p.h - pi.riga, p.z - 0.5);
      } else voce(nome, nome, 0, p.h, p.z);
    }
    L.voci.sort((a, b) => a.z - b.z);
    lati[lato] = L;
    for (const nome of Object.keys(parti)) disegnaPelle(lato, nome, 0, 0);
  }

  /* origine di ogni combattente nel mondo: i due bacini a `DIST` px l'uno dall'altro, al centro dell'arena */
  function piazza() {
    const x0 = man.giunti.anca[0];
    lati.p.O = Wp / 2 - DIST / 2 - x0;
    lati.c.O = Wp / 2 + DIST / 2 + x0;
  }

  /* i muri: dietro il bordo dell'arena (con un po' di margine), davanti il corpo dell'avversario (non si attraversano) */
  function muri() {
    for (const L of Object.values(lati)) {
      const dietro = L.f > 0 ? (6 - L.O) : (L.O - (Wp - 6));         // il bordo dietro, in coordinate locali
      L.pup.muri(dietro, 1e9);                                       // (quello davanti si aggiorna a ogni passo)
    }
  }

  function adatta() {
    if (!arenaEl) return;
    dpr = window.devicePixelRatio || 1;
    const w = arenaEl.clientWidth, h = arenaEl.clientHeight;
    if (w < 100 || h < 60) return;
    W = w; H = h;
    tela.width = Math.round(W * dpr); tela.height = Math.round(H * dpr);
    tela.style.width = W + "px"; tela.style.height = H + "px";
    S = scalaFn ? Math.max(1, Math.min(5, Math.floor(scalaFn(W, H)))) : Math.max(1, Math.min(5, Math.floor((H - BORDO - 26) / man.canvas[1])));
    Wp = W / S;
    pavY = H - BORDO;
    ctx = tela.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    if (lati.p) { piazza(); muri(); }
    const st = getComputedStyle(document.documentElement);
    colori = {line: st.getPropertyValue("--line").trim() || "#262b33", muted: st.getPropertyValue("--muted").trim() || "#8b93a1",
              volt: st.getPropertyValue("--volt").trim() || "#d7ff3e", danger: st.getPropertyValue("--danger").trim() || "#ff4655"};
  }

  /* ---------------------------------------------------------------------------------------------------- */
  /* disegno */
  const lerp = (a, b, k) => a + (b - a) * k;

  /* Il fondale del ring: l'immagine posata col bordo basso sulla linea dei piedi a scala intera (ripetuta specchiata se l'arena e' piu' larga),
     poi il pavimento (il tappeto del ring) sotto la linea. Le luci si disegnano dopo la folla (`disegnaLuciRing`). Senza immagini: il vecchio
     gradiente. */
  function disegnaFondale() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!ring) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#1a1e27"); g.addColorStop(0.7, "#0e1013");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#08090b"; ctx.fillRect(0, pavY, W, H - pavY);
      ctx.fillStyle = colori.line; ctx.fillRect(0, pavY, W, 1);
      return;
    }
    const im = ring.sfondo, w = im.width * S, h = im.height * S, y0 = pavY - h;
    if (y0 > 0) { ctx.fillStyle = "#080a0f"; ctx.fillRect(0, 0, W, Math.ceil(y0)); }                 // piu' alto dell'immagine: il buio del soffitto
    const x0 = Math.round((W - w) / 2), m = Math.ceil(Math.max(0, x0) / w);
    for (let t = -m; t <= m; t++) {                                                                   // la tela centrale, poi le copie specchiate a destra e a sinistra
      const x = x0 + t * w;
      if (x >= W || x + w <= 0) continue;
      if (t % 2) { ctx.save(); ctx.translate(x + w, 0); ctx.scale(-1, 1); ctx.drawImage(im, 0, y0, w, h); ctx.restore(); }
      else ctx.drawImage(im, x, y0, w, h);
    }
    // il pavimento: il tappeto del ring, con una riga chiara al bordo e le assi
    const u = Math.max(1, Math.round(S)), fh = H - pavY;
    ctx.fillStyle = "#0b0d13"; ctx.fillRect(0, pavY, W, fh);
    ctx.fillStyle = "#2a3350"; ctx.fillRect(0, pavY, W, u);
    ctx.fillStyle = "#151a28"; ctx.fillRect(0, pavY + u, W, Math.max(1, Math.floor(fh / 3)));
    ctx.fillStyle = "#10131c";
    for (let x = 0; x < W; x += 14 * u) ctx.fillRect(x, pavY + u, u, fh - u);
    ctx.fillStyle = "#7a1f2c"; ctx.fillRect(0, H - Math.max(2, u), W, Math.max(2, u));                // il bordo rosso del tappeto
  }

  /* le luci del ring (coni delle lampade, aloni dei neon): additive, sfarfallano piano e ogni tanto un neon salta */
  function disegnaLuciRing() {
    if (!ring || !ring.luci) return;
    const im = ring.luci, w = im.width * S, h = im.height * S, y0 = pavY - h, t = performance.now() / 1000;
    const x0 = Math.round((W - w) / 2), m = Math.ceil(Math.max(0, x0) / w);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.2 + 0.025 * Math.sin(t * 6.3) + 0.015 * Math.sin(t * 17) - (hash(Math.floor(t * 9), 7, 19) > 0.965 ? 0.1 : 0);
    for (let k = -m; k <= m; k++) {
      const x = x0 + k * w;
      if (x >= W || x + w <= 0) continue;
      if (k % 2) { ctx.save(); ctx.translate(x + w, 0); ctx.scale(-1, 1); ctx.drawImage(im, 0, y0, w, h); ctx.restore(); }
      else ctx.drawImage(im, x, y0, w, h);
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }

  /* i montanti degli angoli del ring: due pali imbottiti ai bordi dell'arena, dietro ai combattenti (le corde dello sfondo ci passano davanti) */
  function disegnaPali() {
    if (!ring) return;
    const u = Math.max(1, Math.round(S)), h = 104 * S, w = 7 * u;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const x of [1 * u, W - 8 * u]) {
      ctx.fillStyle = "#0a0c12"; ctx.fillRect(x - u, pavY - h - u, w + 2 * u, h + u);
      ctx.fillStyle = "#3a4258"; ctx.fillRect(x, pavY - h, w, h);                                     // il palo d'acciaio
      ctx.fillStyle = "#586079"; ctx.fillRect(x, pavY - h, u, h);
      ctx.fillStyle = "#262c3f"; ctx.fillRect(x + w - u, pavY - h, u, h);
      for (const yy of [86, 112, 138]) {                                                              // le fascette dove si attaccano le corde (stesse quote dello sfondo)
        const y = pavY - (160 - yy) * S - u;
        ctx.fillStyle = "#b82e3c"; ctx.fillRect(x - u, y, w + 2 * u, 5 * u);
        ctx.fillStyle = "#ff4655"; ctx.fillRect(x - u, y, w + 2 * u, u);
        ctx.fillStyle = "#681c26"; ctx.fillRect(x - u, y + 4 * u, w + 2 * u, u);
      }
      ctx.fillStyle = "#681c26"; ctx.fillRect(x - u, pavY - 26 * S, w + 2 * u, 26 * S);              // il cuscino imbottito in basso
      ctx.fillStyle = "#b82e3c"; ctx.fillRect(x - u, pavY - 26 * S, u, 26 * S);
    }
  }

  /* La folla, in alto e dietro i combattenti: due file di sagome. Tifano (braccia alzate, saltelli) per chi il tifo premia, siedono
     mogie dalla parte dell'altro, e all'Ovazione scattano in piedi quelle di chi la riceve. Il tifo viene dal server (St.folla.tifo:
     > 0 = giocatore, a sinistra); solo il duello la disegna (la palestra ha un altro fondale). */
  const folla = {tifo: 0, boato: 0, lato: 1, t0: 0};
  function disegnaFolla() {
    const ora = performance.now() / 1000, dt = folla.t0 ? Math.min(0.1, ora - folla.t0) : 0;
    folla.t0 = ora; folla.boato = Math.max(0, folla.boato - dt);
    const u = Math.max(1, Math.round(S)), passo = 11 * u;
    const base = Math.max(26, Math.min(pavY - 111 * S - 14, H * 0.3));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let r = 0; r < 2; r++) {
      const k = r ? 1 : 0.8, by = base - (1 - r) * 6 * u, w = Math.max(1, Math.round(k * u));
      for (let x = r ? 0 : -passo / 2, i = r * 31; x < W + passo; x += passo, i++) {
        const lato = x < W / 2 ? 1 : -1, ph = (i * 1.7) % 6.28;
        const e = Math.max(-1, Math.min(1, folla.boato > 0 && lato === folla.lato ? 1 : lato * folla.tifo / 70));
        const su = e > 0 ? Math.abs(Math.sin(ora * (3 + 3 * e) + ph)) * (1 + 2.5 * e) * u * k : 0;
        const y = by - su + (e < 0 ? -e * 2 * u : 0);
        ctx.fillStyle = r ? "#212733" : "#171b22";
        ctx.fillRect(x - 3 * w, y - 5 * w, 6 * w, 5 * w);                           // busto
        ctx.fillRect(x - 2 * w, y - 9 * w, 4 * w, 4 * w);                           // testa
        if (e > 0.35) {                                                              // braccia alzate, nel colore di chi tifano
          ctx.globalAlpha = 0.35 + 0.4 * e; ctx.fillStyle = lato > 0 ? colori.volt : colori.danger;
          ctx.fillRect(x - 2 * w, y - 9 * w, 4 * w, 4 * w);
          ctx.fillRect(x - 4 * w, y - 12 * w, w, 7 * w); ctx.fillRect(x + 3 * w, y - 12 * w, w, 7 * w);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  /* Il vicolo fatiscente dell'imboscata (duello mortale, St.luogo === "vicolo"): un muro di mattoni scrostato con finestre sbarrate,
     scala antincendio e tubo che perde, un bidone e delle casse in fondo, l'asfalto crepato e una lampada che sfarfalla. La parte
     ferma sta in una tela a parte (si rifa' al ridimensionamento), la lampada e la goccia si animano ogni fotogramma. Niente folla. */
  const vicolo = {tela: null, chiave: ""};
  const X_TUBO = 0.62, X_LAMPADA = 0.5;
  function costruisciVicolo() {
    const u = Math.max(1, Math.round(S)), c = document.createElement("canvas");
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    // il muro: mattoni sfalsati, qualcuno caduto, la malta scura
    const bw = 10 * u, bh = 5 * u;
    for (let r = 0, y = 0; y < pavY; r++, y += bh) {
      for (let k = 0, x = -(r % 2) * bw / 2; x < W; k++, x += bw) {
        const h = hash(k, r, 5), v = 20 + Math.floor(h * 14);
        if (h > 0.975) { R(x, y, bw, bh, "#07080a"); continue; }
        R(x, y, bw, bh, `rgb(${v + 7},${v + 1},${v - 1})`);
        R(x, y, bw, u, `rgb(${v + 13},${v + 6},${v + 3})`);
        R(x + bw - u, y, u, bh, "#0a0b0d"); R(x, y + bh - u, bw, u, "#0a0b0d");
      }
    }
    // intonaco scrostato e macchie d'umido
    for (let i = 0; i < 9; i++) {
      const x = hash(i, 1, 9) * W, y = hash(i, 2, 9) * pavY * 0.8, w = (14 + hash(i, 3, 9) * 26) * u, h = (8 + hash(i, 4, 9) * 16) * u;
      R(x, y, w, h, "#2b2d33"); R(x + 2 * u, y - 2 * u, w - 5 * u, 2 * u, "#2b2d33"); R(x - 2 * u, y + 3 * u, 2 * u, h - 6 * u, "#2b2d33");
      R(x + 3 * u, y + 2 * u, w * 0.5, h * 0.4, "#202228");
    }
    // finestre sbarrate con assi
    for (const fx of [0.2, 0.8]) {
      const x = W * fx - 9 * u, y = Math.max(6 * u, pavY * 0.16), w = 18 * u, h = 26 * u;
      R(x - 2 * u, y - 2 * u, w + 4 * u, h + 4 * u, "#0a0b0d"); R(x, y, w, h, "#10151f"); R(x, y, w, 3 * u, "#1c2a44");
      for (let i = 0; i < 3; i++) {
        const py = y + (2 + i * 8) * u, dx = (hash(i, Math.round(fx * 10), 11) - 0.5) * 4 * u;
        R(x - 3 * u + dx, py, w + 6 * u, 4 * u, "#3b2a1c"); R(x - 3 * u + dx, py, w + 6 * u, u, "#5e4129");
        R(x + dx, py + u, u, u, "#a8b0be"); R(x + w - u + dx, py + u, u, u, "#a8b0be");
      }
    }
    // scala antincendio a sinistra: piattaforma, ringhiera, rampa
    {
      const x = W * 0.06, y = pavY * 0.52, w = 40 * u;
      R(x, y, w, 2 * u, "#1b1e24"); R(x, y, w, u, "#343a45");
      for (let i = 0; i <= 10; i++) R(x + i * 4 * u, y - 8 * u, u, 8 * u, "#14171c");
      R(x, y - 8 * u, w, u, "#2a2e37");
      for (let i = 0; i < 9; i++) R(x + w + i * 3 * u, y + 2 * u + i * 3 * u, 6 * u, u, "#2a2e37");
      R(x + 2 * u, y + 2 * u, u, pavY * 0.1, "#14171c"); R(x + w - 3 * u, y + 2 * u, u, pavY * 0.1, "#14171c");
    }
    // tubo di scarico che perde, con le fascette e l'alone sotto
    {
      const x = W * X_TUBO;
      R(x, 0, 3 * u, pavY, "#1b1e24"); R(x, 0, u, pavY, "#2f343e");
      for (let y = 14 * u; y < pavY; y += 34 * u) R(x - u, y, 5 * u, 2 * u, "#3a404c");
      R(x - 2 * u, pavY - 5 * u, 7 * u, 5 * u, "#0a0b0d"); R(x - 4 * u, pavY - 2 * u, 11 * u, 2 * u, "#0a0b0d");
    }
    // un graffito che non dice niente di buono
    g.globalAlpha = 0.3;
    for (let i = 0; i < 8; i++) { R(W * 0.36 + i * 3 * u, pavY * 0.58 + i * 2 * u, 3 * u, 2 * u, "#d63a46"); R(W * 0.36 + (8 - i) * 3 * u, pavY * 0.58 + i * 2 * u, 3 * u, 2 * u, "#d63a46"); }
    g.globalAlpha = 1;
    // bidone (a sinistra, in fondo) e casse (a destra)
    {
      const x = W * 0.015, w = 34 * u, h = 20 * u, y = pavY - h + 2 * u;
      R(x, y, w, h, "#1d2b27"); R(x, y, w, 4 * u, "#2b3f39"); R(x - u, y - u, w + 2 * u, 3 * u, "#14201d"); R(x, y + h - 3 * u, w, 3 * u, "#0a0b0d");
      for (let i = 1; i < 5; i++) R(x + i * 7 * u, y + 5 * u, u, h - 8 * u, "#14201d");
      R(x + 6 * u, y + 6 * u, 2 * u, 9 * u, "#5a3a22"); R(x + 22 * u, y + 8 * u, 2 * u, 7 * u, "#5a3a22");    // ruggine
      R(x + w + 2 * u, pavY - 4 * u, 8 * u, 5 * u, "#0d1012"); R(x + w + 4 * u, pavY - 6 * u, 4 * u, 3 * u, "#0d1012");   // sacchi
    }
    for (const [dx, dy, s] of [[0, 0, 16], [17, 0, 14], [6, -15, 15]]) {
      const x = W * 0.935 + dx * u, y = pavY - (s - 1) * u + dy * u;
      R(x, y, s * u, s * u, "#3b2a1c"); R(x, y, s * u, 2 * u, "#5e4129"); R(x + 2 * u, y + 2 * u, (s - 4) * u, u, "#2a1d12");
      R(x + 2 * u, y + s * u - 3 * u, (s - 4) * u, u, "#2a1d12"); R(x + u, y + u, u, s * u - 2 * u, "#2a1d12"); R(x + s * u - 2 * u, y + u, u, s * u - 2 * u, "#2a1d12");
    }
    // l'asfalto: cordolo, crepe, pozze
    R(0, pavY, W, H - pavY, "#08090b"); R(0, pavY, W, u, "#2a2e37");
    for (let i = 0; i < 6; i++) { let x = hash(i, 5, 13) * W, y = pavY + 3 * u; for (let k = 0; k < 4; k++) { R(x, y, 5 * u, u, "#15181d"); x += 5 * u; y += (k % 2 ? -1 : 1) * u; } }
    for (const [fx, fw] of [[0.3, 26], [0.7, 18]]) { R(W * fx, pavY + 2 * u, fw * u, 2 * u, "#141b26"); R(W * fx + 3 * u, pavY + 2 * u, 8 * u, u, "#2c3d57"); }
    // buio ai bordi
    const v = g.createRadialGradient(W / 2, pavY * 0.55, H * 0.2, W / 2, pavY * 0.55, W * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.62)");
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    vicolo.tela = c; vicolo.chiave = [W, H, u, dpr].join("x");
  }

  function disegnaVicolo() {
    if (vicolo.chiave !== [W, H, Math.max(1, Math.round(S)), dpr].join("x")) costruisciVicolo();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(vicolo.tela, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = performance.now() / 1000, u = Math.max(1, Math.round(S));
    // la lampada: un cavo, un cappello, il cono di luce che sfarfalla e ogni tanto salta
    const lx = W * X_LAMPADA, ly = Math.max(14 * u, pavY * 0.2);
    const luce = 0.8 + 0.12 * Math.sin(t * 9) + 0.05 * Math.sin(t * 23) - (hash(Math.floor(t * 11), 3, 17) > 0.93 ? 0.6 : 0);
    ctx.fillStyle = "#0a0b0d"; ctx.fillRect(Math.round(lx), 0, u, ly);
    ctx.fillStyle = "#2a2e37"; ctx.fillRect(Math.round(lx - 5 * u), Math.round(ly), 11 * u, 3 * u);
    ctx.fillStyle = luce > 0.4 ? "#ffe6a3" : "#5a4f33"; ctx.fillRect(Math.round(lx - 3 * u), Math.round(ly + 3 * u), 7 * u, 2 * u);
    const cono = ctx.createRadialGradient(lx, ly + 4 * u, 2 * u, lx, ly + 4 * u, pavY * 0.95);
    cono.addColorStop(0, `rgba(255,226,150,${0.26 * Math.max(0, luce)})`); cono.addColorStop(1, "rgba(255,226,150,0)");
    ctx.fillStyle = cono; ctx.fillRect(0, 0, W, H);
    // la goccia dal tubo
    const ph = (t % 1.7) / 1.7, gx = W * X_TUBO + u, g0 = pavY * 0.55;
    ctx.fillStyle = "#6f8aa6";
    if (ph < 0.96) ctx.fillRect(Math.round(gx), Math.round(g0 + ph * ph * (pavY - g0 - 6 * u)), u, 2 * u);
    else { ctx.fillRect(Math.round(gx - 2 * u), pavY - u, u, u); ctx.fillRect(Math.round(gx + 3 * u), pavY - u, u, u); }
  }

  /* trasformazione mondo (px sprite, y = 111 sul pavimento) -> schermo, per un combattente (specchiato per la CPU) */
  function mondo(L) {
    const o = scossa.a > 0.01 ? [scossa.x, scossa.y] : [0, 0];
    ctx.setTransform(L.f * S * dpr, 0, 0, S * dpr, (L.O * S + o[0]) * dpr, (pavY - 111 * S + o[1] + (L.dy || 0) * S) * dpr);   // (dy: la palestra mette in fondo chi non si allena)
  }

  function posaCorpo(b) { return [lerp(b.px, b.x, alpha), lerp(b.py, b.y, alpha), lerp(b.pa, b.a, alpha)]; }

  function disegnaVoce(L, v) {
    const C = L.pup.corpi, b = C[v.corpo], [x, y, a] = posaCorpo(b);
    ctx.save();
    if (sagome && sagome.off) ctx.translate(sagome.off[0], sagome.off[1]);
    ctx.translate(x, y); ctx.rotate(a);
    const tela_ = L.tele[v.nome], pz = parti[v.nome], R = L.rinfOn[v.nome] ? pz.rinf : null;
    // Pelle Invincibile dal rango 3: il pezzo rinforzato (un px in piu' a sinistra e in alto: v. poteri.json) prende il posto di pelle e vestiti;
    // la sua tela parte da `t0` (se il pezzo e' tagliato, come lo stinco dal piede, si taglia alla stessa riga)
    const [mx, my] = R ? pot.margine : [0, 0], t0 = R && v.y0 ? v.y0 + my : 0, hh = R ? (v.y0 + v.h >= pz.h ? R.h : v.y0 + v.h + my) - t0 : 0;
    const dyR = v.oy + t0 - my - v.y0;
    if (sagome) {                                                               // mirino: la sagoma piatta della locazione (stessa forma di quello che si vede), niente vestiti ne' ferite
      const col = sagome.col(locSag || pz.loc);
      if (col) {
        const sg = tinta(R ? L.sagR[v.nome] : pz.app && PO && PO.lama(L, v.nome) ? L.sagApp[v.nome] : L.sag[v.nome], col);
        if (R) ctx.drawImage(sg, 0, t0, R.w, hh, v.ox - mx, dyR, R.w, hh);
        else ctx.drawImage(sg, 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
      }
      ctx.restore();
      return;
    }
    if (R) ctx.drawImage(L.telaR[v.nome], 0, t0, R.w, hh, v.ox - mx, dyR, R.w, hh);
    else {
      if (L.prof[pz.loc] > 0) {                                               // locazione in negativo: l'interno sotto la pelle
        const sk = pz.app && PO && PO.lama(L, v.nome) ? scheletroLama(pz) : pz.sk;
        if (sk) ctx.drawImage(sk, 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
        ctx.drawImage(L.carne[v.nome], 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
      }
      ctx.drawImage(tela_, 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
      const vs = L.vestOff[v.nome] ? null : L.vest[v.nome];                   // sopra pelle e ferite: pantaloni, poi maglia (non dal rango 3 di Pelle Invincibile)
      if (vs) for (const o of vs) ctx.drawImage(o.tela, 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
    }
    if (v.nome === "testa" && L.capelli && !(L.copCoprePelo && !L.copStacc)) ctx.drawImage(L.capelli.tela, v.ox + L.capelli.off[0], v.oy + L.capelli.off[1]);
    if (v.nome === "testa" && L.cop && !L.copStacc) ctx.drawImage(L.cop.tela, v.ox + L.cop.off[0], v.oy + L.cop.off[1]);      // cappelli e maschere: sopra i capelli
    const fa = L.fasce[v.nome];                                               // la fasciatura (palestra): sopra tutto, tranne il lampo del colpo
    if (fa) ctx.drawImage(fa, 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
    if (PO && L.po && !R && pz.sk) {                                          // Maledizione: lo scheletro traspare verde da sotto pelle e vestiti, e pulsa
      const m = PO.maledizione(L);
      if (m.k > 0.02) {
        const sv = scheletroVerde(pz);
        ctx.globalAlpha = m.k * (0.3 + 0.65 * m.pulsa); ctx.drawImage(sv, 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = m.k * 0.45 * m.pulsa; ctx.drawImage(sv, 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      }
    }
    const lamp = L.lamp[pz.loc];
    if (lamp > 0) {
      ctx.globalAlpha = Math.min(1, lamp * 2.2);
      if (R) ctx.drawImage(L.sagR[v.nome], 0, t0, R.w, hh, v.ox - mx, dyR, R.w, hh);
      else ctx.drawImage(pz.app && PO && PO.lama(L, v.nome) ? L.sagApp[v.nome] : L.sag[v.nome], 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
    }
    ctx.restore();
  }
  /* lo scheletro di un pezzo ricolorato di verde (Maledizione): ogni tono d'osso passa a un tono di verde (luce -> verde chiaro, ombra -> verde scuro) e
     le ossa restano leggibili; si fa una volta sola */
  const OSSO_VERDE = [[8, 52, 28, 150], [34, 160, 72, 200], [110, 240, 120, 235], [214, 255, 196, 255]];        // contorno, ombra, luce, riflesso
  function scheletroVerde(pz) {
    if (!pz.skVerde) {
      const c = Object.assign(document.createElement("canvas"), {width: pz.w, height: pz.h}), cx = c.getContext("2d");
      cx.drawImage(pz.sk, 0, 0);
      const im = cx.getImageData(0, 0, pz.w, pz.h), d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const r = d[i], k = OSSO_VERDE[r >= 225 ? 3 : r >= 185 ? 2 : r >= 110 ? 1 : 0];
        d[i] = k[0]; d[i + 1] = k[1]; d[i + 2] = k[2]; d[i + 3] = k[3];
      }
      cx.putImageData(im, 0, 0);
      pz.skVerde = c;
    }
    return pz.skVerde;
  }
  /* lo scheletro dell'avambraccio appuntito: le ossa della mano di sempre, tagliate alla sagoma della lama (si fa una volta sola) */
  function scheletroLama(pz) {
    if (!pz.skApp && pz.sk) {
      const c = Object.assign(document.createElement("canvas"), {width: pz.w, height: pz.h}), cx = c.getContext("2d");
      cx.drawImage(pz.sk, 0, 0);
      cx.globalCompositeOperation = "destination-in"; cx.drawImage(sagomaDa(pz.app), 0, 0);
      pz.skApp = c;
    }
    return pz.skApp || pz.sk;
  }

  /* un'ala (vicina o lontana): appesa al busto alto nel punto d'attacco, ruota attorno al perno. In volo batte (angolo = riposo + ampiezza
     * sin), altrimenti sta rialzata dietro le spalle e si muove appena. */
  const VEL_RANGO = 0.25;                 // Supervelocita': animazioni piu' veloci del 25% per rango (il quarto: il doppio)
  const STANCE_CORPO_ELETTRICO = 7, STANCE_RIFLESSI_FULMINEI = 12;      // id in data/stances.json
  const conStance = (L, id) => !!(L.extra && (L.extra.stance_ids || []).includes(id));
  const FORZA_RANGO = 0.1875;             // Super Forza: braccia e busto piu' grandi del 18,75% per rango (il quarto: +75%)
  const ALI = {riposo: -1.0};            // l'angolo delle ali a riposo (rad, rispetto a come sono disegnate): su e indietro, non ripiegate in basso
  function disegnaAla(L, lontana) {
    const al = L.ali, v = L.voci.find(q => q.nome === al.att.pezzo);
    if (!al || !v) return;
    const b = L.pup.corpi[v.corpo], [x, y, a] = posaCorpo(b), t = L.tAnim * 6.28 * 1.9 + al.fase + (lontana ? 0.5 : 0);
    const vola = L.pup.voloK, riposo = ALI.riposo + 0.05 * Math.sin(L.tAnim * 1.3 + al.fase);
    const batte = -0.75 + 0.62 * Math.sin(t) + (lontana ? 0.18 : 0);
    const ang = riposo + (batte - riposo) * vola;
    ctx.save();
    if (sagome && sagome.off) ctx.translate(sagome.off[0], sagome.off[1]);
    ctx.translate(x, y); ctx.rotate(a);
    ctx.translate(v.ox + al.att.punto[0] + (lontana ? 1 : 0), v.oy + al.att.punto[1] + (lontana ? -1 : 0));
    ctx.rotate(ang);
    const img = lontana ? al.lontana : al.vicina, col = sagome && sagome.col(lontana ? L.locEx.alaSx : L.locEx.alaDx);
    if (!sagome) ctx.drawImage(img, -al.perno[0], -al.perno[1]);
    else if (col) ctx.drawImage(tinta(img, col), -al.perno[0], -al.perno[1]);        // (le ali sono locazioni a se': ala_dx e ala_sx)
    ctx.restore();
  }

  /* braccia extra (potere 2x2): una copia di ogni braccio, attaccata piu' in basso sul busto e ruotata attorno alla spalla: segue il
     braccio vero (stessa fisica) ma con un altro angolo, quindi sembra un paio d'arti in piu'. Sparisce con il potere. */
  function disegnaBraccioExtra(L, lato) {
    const vs = L.voci.find(q => q.nome === "braccio_sup_" + lato), va = L.voci.find(q => q.nome === "avambraccio_" + lato);
    if (!vs || !va) return;
    const b = L.pup.corpi[vs.corpo], [x, y, a] = posaCorpo(b), pn = parti[vs.nome].perno;
    const lx = vs.ox + pn[0], ly = vs.oy + pn[1], c = Math.cos(a), sn = Math.sin(a);
    const Sx = x + c * lx - sn * ly, Sy = y + sn * lx + c * ly;                    // la spalla, nel mondo
    const lontana = lato === "sx";
    ctx.save();
    ctx.translate(Sx, Sy + (lontana ? 7 : 9)); ctx.rotate(lontana ? 0.5 : 0.62); ctx.translate(-Sx, -Sy);
    const prima = locSag;
    locSag = lontana ? L.locEx.brSx : L.locEx.brDx;                              // nel mirino le braccia extra sono la loro locazione ("Secondo braccio ...")
    disegnaVoce(L, vs); disegnaVoce(L, va);
    locSag = prima;
    ctx.restore();
  }

  /* il copricapo staccato: un oggetto a se' (posizione e angolo nel sistema di L), dietro ai combattenti non conta: si disegna sopra */
  function disegnaCopStacc(L) {
    const c = L.copStacc;
    if (!c) return;
    mondo(L);
    ctx.translate(c.x, c.y); ctx.rotate(c.a);
    ctx.drawImage(L.cop.tela, -c.cx, -c.cy);
  }

  /* ---- Super Forza: braccia e busto piu' grandi (un effetto solo visivo: la fisica resta quella del corpo di sempre) ----
     Busto, braccia (e le ali e le braccia extra, che stanno attaccate al busto) si ingrandiscono tutti dello stesso fattore `L.fk`
     attorno al bacino, che resta fermo: crescono verso l'alto e in fuori, le gambe no. La testa non cresce ma sale col collo.
     Il fattore entra anche nella mira: la mano fisica va dove, ingrandita, arriva alla locazione che deve colpire. */
  const forzaK = (L) => L && L.fk > 1.001 ? L.fk : 1;
  // un punto del corpo (un giunto dello sprite), nel sistema di L: alla posa interpolata (disegno) o a quella dell'ultimo passo (mira)
  function puntoCorpo(L, corpo, giunto, interp) {
    const b = L.pup.corpi[corpo], r = L.pup.rest[corpo], G = man.giunti[giunto];
    const [x, y, a] = interp ? posaCorpo(b) : [b.x, b.y, b.a], lx = G[0] - r.x, ly = G[1] - r.y, c = Math.cos(a), s = Math.sin(a);
    return [x + c * lx - s * ly, y + s * lx + c * ly];
  }
  const SU_FORZA = /^(busto_|braccio_|avambraccio_)/;        // cio' che cresce (le locazioni: busto e braccia)
  function trasformaForza(L, nome) {                         // dentro un ctx.save(), prima del disegno del pezzo
    const k = forzaK(L);
    if (k === 1) return;
    const P = puntoCorpo(L, "busto_inf", "anca", true);
    if (SU_FORZA.test(nome)) { ctx.translate(P[0], P[1]); ctx.scale(k, k); ctx.translate(-P[0], -P[1]); }
    else if (nome === "testa") { const N = puntoCorpo(L, "busto_sup", "collo_alto", true); ctx.translate((k - 1) * (N[0] - P[0]), (k - 1) * (N[1] - P[1])); }
  }
  // da un punto fisico di una locazione a dove si vede (e viceversa), nel sistema di L
  function forzaPunto(L, loc, p, inverso = false) {
    const k = forzaK(L);
    if (k === 1 || !p) return p;
    const P = puntoCorpo(L, "busto_inf", "anca", false);
    if (loc === "busto" || (loc && loc.startsWith("braccio"))) {
      const f = inverso ? 1 / k : k;
      return [P[0] + f * (p[0] - P[0]), P[1] + f * (p[1] - P[1])];
    }
    if (loc === "testa") {
      const N = puntoCorpo(L, "busto_sup", "collo_alto", false), s = inverso ? -1 : 1;
      return [p[0] + s * (k - 1) * (N[0] - P[0]), p[1] + s * (k - 1) * (N[1] - P[1])];
    }
    return p;
  }

  /* la falda del trench: un pezzo staccato, appeso al busto basso (ne segue la posa) con il suo ondeggiare; sta sopra le gambe e sotto le braccia */
  function disegnaFalda(L) {
    const f = L.falda, v = L.voci.find(q => q.nome === f.pezzo);
    if (!f || !v) return;
    const [x, y, a] = posaCorpo(L.pup.corpi[v.corpo]);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    const px = v.ox + f.off[0] + f.perno[0], py = v.oy + f.off[1] + f.perno[1];
    ctx.translate(px, py); ctx.rotate(f.ang + (L.pup.voloK || 0) * 0.15); ctx.translate(-px, -py);
    ctx.drawImage(f.tela, v.ox + f.off[0], v.oy + f.off[1]);
    ctx.restore();
  }

  /* quello che `static/poteri.js` chiede all'arena per disegnare: il contesto (gia' nello spazio di `mondo(L)`), la posa interpolata di un corpo e un
     giunto dello sprite nel sistema di L */
  const aiuti = {
    get ctx() { return ctx; },
    pos: (L, corpo) => posaCorpo(L.pup.corpi[corpo]),
    punto: (L, corpo, giunto, interp = true) => puntoCorpo(L, corpo, giunto, interp),
    ridisegna(L, nome) {                                    // un pezzo la cui pelle e' cambiata (Pugno di Roccia comincia o finisce)
      const d = L.dati[nome];
      if (d) disegnaPelle(L.lato, nome, d[0], d[1]);
    },
    rinfresca(L, fase) {                                    // lava che pulsa e cristalli che scintillano: i pezzi di rango 3-4 si ridisegnano con una fase nuova
      L.faseMat = fase;
      for (const [nome, p] of Object.entries(parti)) if (L.dati[nome] && PO.rangoPelle(L, p.loc) >= 3) disegnaPelle(L.lato, nome, L.dati[nome][0], L.dati[nome][1]);
    },
  };

  /* il corpo (senza gli effetti dei poteri): ali, braccia extra, pezzi con i loro livelli, falda del cappotto */
  function disegnaCorpo(L) {
    const su = (nome, fn) => { ctx.save(); trasformaForza(L, nome); fn(); ctx.restore(); };
    if (L.ali && L.extra.ali) su("busto_sup", () => disegnaAla(L, true));
    for (const v of L.voci) {
      if (L.extra.braccia && v.nome === "braccio_sup_sx") su("braccio_sup_sx", () => disegnaBraccioExtra(L, "sx"));
      if (L.ali && L.extra.ali && v.nome === "busto_sup") su("busto_sup", () => disegnaAla(L, false));
      if (L.extra.braccia && v.nome === "braccio_sup_dx") su("braccio_sup_dx", () => disegnaBraccioExtra(L, "dx"));
      su(v.nome, () => disegnaVoce(L, v));
      if (L.falda && v.nome === L.falda.pezzo && !L.vestOff.busto_inf && !sagome) su("busto_inf", () => disegnaFalda(L));    // (il cappotto non c'e' sotto la corazza)
    }
  }

  function disegnaCombattente(L) {
    mondo(L);
    if (!sagome && PO && L.po) PO.dietro(L, aiuti);                        // sfere e detriti che passano dietro, teschi, neve lontana
    if (!sagome && L.acq > 0.02) disegnaAcqua(L);                          // stance Forma d'acqua
    else if (!sagome && L.fuo > 0.02) disegnaFuoco(L);                     // stance Corpo di Fiamma
    else if (!sagome && L.ele > 0.02) disegnaElettrico(L);                 // stance Corpo Elettrico
    else disegnaCorpo(L);
    if (!sagome && PO && L.po) { mondo(L); PO.davanti(L, aiuti); }         // campo di forza, sfere davanti, aure, fulmini, neve vicina
  }

  /* ---- Forma d'acqua: il corpo intero (ogni livello: pelle, vestiti, capelli, cappelli, ali) diventa acqua semitrasparente. Si disegna il corpo
     di sempre su una tela nascosta (opaco, cosi' i livelli non si sommano) e i pixel passano da `Poteri.acqua`, che li ricolora e li rende
     trasparenti; poi si stampa il risultato. Dentro e fuori dalla stance `L.acq` (0..1) fa una dissolvenza incrociata col corpo vero. ---- */
  const acq = {cv: null, cx: null, out: null, ox: null};
  function disegnaAcqua(L) { disegnaTrasformato(L, L.acq, PO && PO.acqua, false); }
  /* Corpo di Fiamma: lo stesso procedimento dell'acqua, ma il corpo e' fuoco e LUMINOSO (si somma alla scena e ha un'aura) */
  function disegnaFuoco(L) { disegnaTrasformato(L, L.fuo, PO && PO.fuoco, true); }
  /* Corpo Elettrico: ancora lo stesso procedimento, ma il corpo e' energia (blu e bianco-giallo, con vene di fulmine) e l'aura e' azzurra */
  function disegnaElettrico(L) { disegnaTrasformato(L, L.ele, PO && PO.elettrico, true, ["rgba(150,210,255,0.45)", "rgba(70,130,255,0.18)", "rgba(40,80,255,0)"]); }
  function disegnaTrasformato(L, k, fn, luce, aura) {
    if (!fn) { disegnaCorpo(L); return; }
    // il riquadro attorno al corpo (px dello schermo, a risoluzione del dispositivo)
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const b of Object.values(L.pup.corpi)) {
      const X = (L.O + L.f * b.x) * S, Y = pavY - 111 * S + b.y * S;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
    }
    const m = 36 * S;
    const dx0 = Math.max(0, Math.floor((x0 - m) * dpr)), dy0 = Math.max(0, Math.floor((y0 - m) * dpr));
    const dw = Math.min(tela.width, Math.ceil((x1 + m) * dpr)) - dx0, dh = Math.min(tela.height, Math.ceil((y1 + m) * dpr)) - dy0;
    if (dw <= 0 || dh <= 0) return;
    if (!acq.cv || acq.cv.width !== tela.width || acq.cv.height !== tela.height) {
      acq.cv = Object.assign(document.createElement("canvas"), {width: tela.width, height: tela.height});
      acq.cx = acq.cv.getContext("2d", {willReadFrequently: true});
    }
    if (!acq.out || acq.out.width < dw || acq.out.height < dh) acq.out = Object.assign(document.createElement("canvas"), {width: dw, height: dh});
    const c0 = ctx;
    if (k < 0.98) { ctx.globalAlpha = 1 - k; disegnaCorpo(L); ctx.globalAlpha = 1; }          // il corpo vero svanisce mentre l'acqua arriva
    const a = acq.cx;
    a.setTransform(1, 0, 0, 1, 0, 0); a.imageSmoothingEnabled = false; a.clearRect(dx0, dy0, dw, dh);
    ctx = a; mondo(L);
    try { disegnaCorpo(L); } finally { ctx = c0; }
    const img = a.getImageData(dx0, dy0, dw, dh), pel = L.pup.corpi.busto_inf;
    fn(img.data, dw, dh, {cell: S * dpr, ox: dx0 - (L.O + L.f * pel.x) * S * dpr, oy: dy0 - (pavY - 111 * S + pel.y * S) * dpr, t: L.tAnim, seme: semeLato(L.lato)});
    const o = acq.out.getContext("2d");
    o.clearRect(0, 0, acq.out.width, acq.out.height); o.putImageData(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = k;
    ctx.drawImage(acq.out, 0, 0, dw, dh, dx0, dy0, dw, dh);
    if (luce) {                                                // luminoso: lo stesso corpo si somma alla scena, un po' sfocato, e intorno c'e' un'aura
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.3 * k;
      for (const [ox, oy] of [[-1.2, 0], [1.2, 0], [0, -1.6], [0, 1.2]]) ctx.drawImage(acq.out, 0, 0, dw, dh, dx0 + ox * S * dpr * 0.5, dy0 + oy * S * dpr * 0.5, dw, dh);
      const cx = (x0 + x1) / 2 * dpr, cy = (y0 + y1) / 2 * dpr, R = 50 * S * dpr, g = ctx.createRadialGradient(cx, cy, 2, cx, cy, R);
      const au = aura || ["rgba(255,150,40,0.4)", "rgba(255,90,14,0.16)", "rgba(255,60,8,0)"];
      g.addColorStop(0, au[0]); g.addColorStop(0.55, au[1]); g.addColorStop(1, au[2]);
      ctx.globalAlpha = k; ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
  }

  /* ombra sul pavimento: sotto i piedi, piu' piccola e chiara quando il corpo si alza; larga da morti */
  function disegnaOmbra(L) {
    const C = L.pup.corpi;
    const x = lerp(posaCorpo(C.piede_dx)[0], posaCorpo(C.piede_sx)[0], 0.5) + 4;
    const alt = Math.max(0, 111 - Math.max(posaCorpo(C.piede_dx)[1], posaCorpo(C.piede_sx)[1]) - 2.5);
    const k = lim(1 - alt / 40, 0.35, 1);
    mondo(L);
    ctx.fillStyle = `rgba(0,0,0,${0.38 * k})`;
    ctx.beginPath(); ctx.ellipse(x, 111, 21 * k + (L.pup.morto ? 16 : 0), 2.6, 0, 0, Math.PI * 2); ctx.fill();
  }

  function disegnaParticelle(davanti = false) {
    ctx.setTransform(S * dpr, 0, 0, S * dpr, (scossa.a > 0.01 ? scossa.x * dpr : 0), (pavY - 111 * S + (scossa.a > 0.01 ? scossa.y : 0)) * dpr);
    if (!davanti) for (const m of macchie) { ctx.fillStyle = m.col; ctx.fillRect(Math.round(m.x), 110.2, m.w, 1); }
    for (const q of particelle) {
      if (!!q.davanti !== davanti) continue;
      ctx.globalAlpha = Math.min(1, q.vita / q.fade);
      ctx.fillStyle = q.cols ? q.cols[Math.min(q.cols.length - 1, Math.floor((1 - q.vita / q.vita0) * q.cols.length))] : q.col;
      if (q.luce) ctx.globalCompositeOperation = "lighter";
      ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
      if (q.luce) ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
  }

  /* la parte degli effetti che sta DIETRO ai combattenti (l'onda che corre, le ombre dei massi) */
  function disegnaFxDietro() {
    if (!MO || !MO.dietro) return;
    ctx.setTransform(S * dpr, 0, 0, S * dpr, (scossa.a > 0.01 ? scossa.x * dpr : 0), (pavY - 111 * S + (scossa.a > 0.01 ? scossa.y : 0)) * dpr);
    MO.dietro(ctx);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }

  /* gli effetti delle animazioni degli attacchi (proiettili, scintille, schegge conficcate...): nello stesso spazio delle particelle */
  function disegnaFx() {
    if (!MO) return;
    ctx.setTransform(S * dpr, 0, 0, S * dpr, (scossa.a > 0.01 ? scossa.x * dpr : 0), (pavY - 111 * S + (scossa.a > 0.01 ? scossa.y : 0)) * dpr);
    MO.disegna(ctx);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }

  function disegnaProiettili() {
    ctx.setTransform(S * dpr, 0, 0, S * dpr, (scossa.a > 0.01 ? scossa.x * dpr : 0), (pavY - 111 * S + (scossa.a > 0.01 ? scossa.y : 0)) * dpr);
    for (const q of proiettili) {
      if (q.tipo === "onda" && PO) { PO.disegnaOnda(ctx, q); continue; }       // super urlo: onde soniche al posto del proiettile
      ctx.fillStyle = q.col;
      q.scia.forEach((p, i) => { ctx.globalAlpha = (i + 1) / (q.scia.length + 2) * 0.55; ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2); });
      ctx.globalAlpha = 0.3; ctx.fillRect(q.x - 3, q.y - 2.5, 6, 5);                   // alone
      ctx.globalAlpha = 1; ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
      ctx.fillStyle = "#fff"; ctx.fillRect(q.x - 0.5, q.y - 0.5, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /* i nomi stanno sopra la testa, ciascuno dal proprio lato (a sinistra del giocatore, a destra della CPU): cosi'
     non si sovrappongono neanche a guardia, quando i due sono vicini */
  function disegnaNomi() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "800 11px system-ui, sans-serif"; ctx.textBaseline = "alphabetic";
    for (const L of Object.values(lati)) {
      const x = (L.O + L.f * L.xNome) * S;
      ctx.textAlign = L.f > 0 ? "right" : "left";
      ctx.fillStyle = L.lato === "p" ? colori.volt : colori.danger;
      ctx.fillText((L.nome || "").toUpperCase(), x + (L.f > 0 ? 2 : -2) * S, Math.max(14, pavY - 111 * S - 6));
    }
  }

  function disegna() {
    if (!ctx || !lati.p) return;
    if (luogo === "vicolo") disegnaVicolo();      // il duello mortale: un vicolo, senza pubblico
    else { disegnaFondale(); disegnaPali(); disegnaFolla(); disegnaLuciRing(); }
    for (const L of Object.values(lati)) disegnaOmbra(L);
    disegnaParticelle(false);
    disegnaFxDietro();
    if (mira.attiva && lati[mira.lato]) disegnaConMirino();
    else {
      // chi e' in piedi dietro, chi e' caduto davanti non conta: si disegna prima la CPU, poi il giocatore
      disegnaCombattente(lati.c); disegnaCombattente(lati.p);
    }
    for (const L of Object.values(lati)) disegnaCopStacc(L);
    disegnaParticelle(true);                    // fiamme e scintille che stanno sopra i combattenti
    disegnaProiettili();
    disegnaFx();
    for (const L of Object.values(lati)) L.xNome = L.pup.corpi.busto_inf.x;
    disegnaNomi();
    if (mira.attiva) disegnaMirino();
  }

  /* ---------------------------------------------------------------------------------------------------- */
  /* IL MIRINO (alla Fallout VATS): con "Mira" il cursore diventa un mirino, la scena si scurisce tranne l'avversario (contorno ambra) e la parte del
     suo corpo sotto il mirino si accende di rosso; un clic la sceglie. Per sapere cosa c'e' sotto il cursore si ridisegna il bersaglio su una tela
     nascosta in "modo sagome" (lo stesso disegno del corpo, con Super Forza, ali e braccia extra, ma ogni locazione di un colore) e si legge il
     pixel: niente geometria da rifare. */
  const tinte = new WeakMap();
  function tinta(cv, col) {                                      // una copia piatta di una sagoma bianca, nel colore `col` (in cache)
    let m = tinte.get(cv);
    if (!m) tinte.set(cv, m = {});
    if (!m[col]) {
      const c = Object.assign(document.createElement("canvas"), {width: cv.width, height: cv.height}), x = c.getContext("2d");
      x.drawImage(cv, 0, 0);
      x.globalCompositeOperation = "source-in"; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
      m[col] = c;
    }
    return m[col];
  }
  function renderSagome(L, col, dest, off) {                    // disegna le sagome di L su `dest` (un contesto): col(loc) = colore o null
    const c0 = ctx;
    ctx = dest; sagome = {col, off};
    try { disegnaCombattente(L); } finally { ctx = c0; sagome = null; }
  }
  const locMira = () => { const st = ultimoStato && (mira.lato === "c" ? ultimoStato.cpu : ultimoStato.player); return st ? Object.keys(st.hp) : []; };

  /* quale locazione del bersaglio sta sotto il cursore (null = nessuna): il pixel esatto, altrimenti la sagoma piu' vicina entro ~1,2 pixel di sprite
     (gli arti sono sottili: il mirino perdona) */
  function sottoMirino() {
    const L = lati[mira.lato];
    if (!L || !mira.dentro || !tela) return null;
    if (!mira.pick || mira.pick.width !== tela.width || mira.pick.height !== tela.height) {
      mira.pick = Object.assign(document.createElement("canvas"), {width: tela.width, height: tela.height});
      mira.pickCtx = mira.pick.getContext("2d", {willReadFrequently: true});
    }
    const pc = mira.pickCtx;
    pc.setTransform(1, 0, 0, 1, 0, 0); pc.imageSmoothingEnabled = false; pc.clearRect(0, 0, mira.pick.width, mira.pick.height);
    mira.locs = locMira();
    renderSagome(L, (loc) => { const i = mira.locs.indexOf(loc); return i < 0 ? null : `rgb(${(i + 1) * 16},0,0)`; }, pc);
    const r = Math.max(2, Math.round(1.2 * S * dpr)), cx = Math.round(mira.mx * dpr), cy = Math.round(mira.my * dpr);
    const x0 = Math.max(0, cx - r), y0 = Math.max(0, cy - r), w = Math.min(mira.pick.width, cx + r + 1) - x0, h = Math.min(mira.pick.height, cy + r + 1) - y0;
    if (w <= 0 || h <= 0) return null;
    const d = pc.getImageData(x0, y0, w, h).data;
    let meglio = null, dmin = 1e9;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 250) continue;
      const dist = (x0 + x - cx) ** 2 + (y0 + y - cy) ** 2, idx = Math.round(d[i] / 16) - 1;
      if (dist < dmin && mira.locs[idx]) { dmin = dist; meglio = mira.locs[idx]; }
    }
    return meglio;
  }
  function aggiornaMira() {
    const h = sottoMirino();
    if (h !== mira.hover) { mira.hover = h; if (mira.cb && mira.cb.sopra) mira.cb.sopra(h); }
  }

  function disegnaConMirino() {
    const T = lati[mira.lato], A = lati[mira.lato === "c" ? "p" : "c"];
    disegnaCombattente(A);                                       // chi mira, scurito
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(3,5,9,0.6)"; ctx.fillRect(0, 0, tela.width, tela.height);
    const st = STILI_MIRA[mira.stile] || STILI_MIRA.mira;
    for (const o of [[1, 0], [-1, 0], [0, 1], [0, -1]]) renderSagome(T, () => st.contorno, ctx, o);       // il contorno del bersaglio, a pixel di sprite
    disegnaCombattente(T);
    if (mira.segna && mira.segna !== mira.hover) {               // (parata) dove punta il colpo in arrivo: un velo rosso che pulsa piano
      ctx.globalAlpha = 0.26 + 0.1 * Math.sin(performance.now() / 160);
      renderSagome(T, (loc) => loc === mira.segna ? "#ff2a3c" : null, ctx);
      ctx.globalAlpha = 1;
    }
    if (mira.hover) {                                            // la parte sotto il mirino: accesa, pulsa
      ctx.globalAlpha = 0.5 + 0.18 * Math.sin(performance.now() / 110);
      renderSagome(T, (loc) => loc === mira.hover ? st.hover : null, ctx);
      ctx.globalAlpha = 1;
    }
  }

  function disegnaMirino() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = "alphabetic";
    const st = STILI_MIRA[mira.stile] || STILI_MIRA.mira;
    ctx.font = "800 11px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillStyle = st.testo;
    ctx.fillText(st.titolo, W / 2, 14);
    if (!mira.dentro) return;
    const x = Math.round(mira.mx), y = Math.round(mira.my), rosso = !!mira.hover, col = rosso ? st.hover : st.contorno, r = 11;
    ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 4;
    const mirino = () => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(x + dx * (r - 3), y + dy * (r - 3)); ctx.lineTo(x + dx * (r + 7), y + dy * (r + 7)); ctx.stroke(); }
    };
    mirino();                                                    // l'ombra scura sotto, per leggerlo su qualunque sfondo
    ctx.strokeStyle = col; ctx.lineWidth = 2; mirino();
    ctx.fillStyle = col; ctx.fillRect(x - 1, y - 1, 2, 2);
    if (rosso) {                                                 // il nome della parte e i suoi hp, accanto al mirino
      const st = ultimoStato && (mira.lato === "c" ? ultimoStato.cpu : ultimoStato.player), h = st && st.hp[mira.hover];
      const testo = mira.hover.replace(/_/g, " ").toUpperCase() + (h ? `  ${Math.max(0, h.val)}/${h.max}` : "") + (mira.hover === mira.segna ? "  · COLPO QUI" : "");
      ctx.font = "800 11px ui-monospace, Consolas, monospace";
      const w = ctx.measureText(testo).width + 10, lx = x + r + 12 + w > W ? x - r - 12 - w : x + r + 12, ly = Math.max(18, y - 16);
      ctx.fillStyle = "rgba(8,10,14,0.82)"; ctx.fillRect(lx, ly - 12, w, 17);
      ctx.fillStyle = st.hover; ctx.fillRect(lx, ly - 12, 2, 17);
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "left"; ctx.fillText(testo, lx + 6, ly);
    }
  }

  /* `Arena.mira({scegli(loc), sopra(loc), lato, stile, segna})` accende il mirino. Di norma e' sull'avversario del giocatore (`lato` "c", stile "mira"); per la
     parata e' sul giocatore (`lato: "p"`, stile "parata", azzurro e blu) e `segna` = la locazione dove punta il colpo in arrivo. `Arena.mira(null)` lo spegne */
  function collegaMira(el) {
    const pos = (e) => { const b = el.getBoundingClientRect(); mira.mx = (e.clientX - b.left) * (W / Math.max(1, b.width)); mira.my = (e.clientY - b.top) * (H / Math.max(1, b.height)); mira.dentro = true; };
    el.addEventListener("pointermove", (e) => { if (!mira.attiva) return; pos(e); aggiornaMira(); });
    el.addEventListener("pointerdown", (e) => { if (!mira.attiva) return; pos(e); aggiornaMira(); });        // (al tocco non c'e' hover: il tocco sceglie)
    el.addEventListener("pointerleave", () => { if (!mira.attiva) return; mira.dentro = false; aggiornaMira(); });
    el.addEventListener("click", (e) => {
      if (!mira.attiva) return;
      pos(e); aggiornaMira();
      if (mira.hover && mira.cb && mira.cb.scegli) { const loc = mira.hover; mira.cb.scegli(loc); }
    });
  }
  function accendiMira(cb) {
    const lato = cb && cb.lato || "c", stile = cb && cb.stile || "mira";
    const cambia = !!cb !== mira.attiva || lato !== mira.lato || stile !== mira.stile;
    mira.attiva = !!cb; mira.cb = cb || null; mira.lato = lato; mira.stile = stile; mira.segna = cb && cb.segna || null;
    if (cambia) { mira.hover = null; if (!cb) mira.dentro = false; }
    if (tela) tela.style.cursor = mira.attiva ? "none" : "";
  }
  const statoMira = () => ({attiva: mira.attiva, hover: mira.hover, dentro: mira.dentro});
  /* per il laboratorio e i test: porta il mirino in un punto dell'arena (px dello schermo) e dice cosa c'e' sotto */
  function puntaMira(x, y) { mira.mx = x; mira.my = y; mira.dentro = true; aggiornaMira(); return mira.hover; }

  /* ---------------------------------------------------------------------------------------------------- */
  /* simulazione */
  /* una particella. Oltre a colore (`col`), vita, gravita' (`g`): `cols` = rampa di colori lungo la vita (il fuoco: dal bianco caldo al rosso scuro),
     `luce` = si somma alla scena invece di coprirla (fiamme, scintille), `attrito` = resistenza dell'aria, `davanti` = sta sopra i combattenti */
  function particella(o) { const q = {vita: 1, fade: 0.3, s: 1, g: GRAV, ...o}; q.vita0 = q.vita; particelle.push(q); if (particelle.length > 900) particelle.shift(); }

  /* coordinate: locale di un combattente -> mondo (px sprite) */
  const aMondo = (L, p) => [L.O + L.f * p[0], p[1]];
  const daMondo = (L, p) => [L.f * (p[0] - L.O), p[1]];

  function schizzi(punto, dir, forza, protesi) {
    const n = Math.round(5 + 16 * Math.min(1.4, forza));
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dir[1], dir[0]) + (Math.random() - 0.5) * 1.5;
      const v = 60 + Math.random() * (160 + 260 * forza);
      if (protesi) particella({x: punto[0], y: punto[1], vx: Math.cos(a) * v * 1.2, vy: Math.sin(a) * v - 60, s: 1,
                               vita: 0.25 + Math.random() * 0.3, fade: 0.15, col: Math.random() < 0.5 ? "#ffe38a" : "#ffffff", g: 500});
      else particella({x: punto[0], y: punto[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40 - Math.random() * 80,
                       s: Math.random() < 0.3 ? 2 : 1, vita: 1.2, fade: 0.2, macchia: true,
                       col: "rgb(" + SANGUE[["a", "b", "c", "d"][Math.floor(Math.random() * 4)]].join(",") + ")"});
    }
  }

  /* una stella di scintille all'impatto: raggi corti che si aprono in un attimo */
  function stella(punto, col, n, v) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      particella({x: punto[0], y: punto[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: 1.5, vita: 0.11, fade: 0.08, col, g: 0});
    }
  }

  function polvere(x) {
    for (let i = 0; i < 2; i++)
      particella({x: x + (Math.random() - 0.5) * 4, y: 109 + Math.random() * 1.5, vx: (Math.random() - 0.5) * 24, vy: -8 - Math.random() * 20,
                  s: 1 + (Math.random() < 0.3), vita: 0.45, fade: 0.3, col: "#6a6f78", g: -30});
  }

  function avanzaParticelle(dt) {
    for (let i = particelle.length - 1; i >= 0; i--) {
      const q = particelle[i];
      q.vita -= dt; q.vy += q.g * dt;
      if (q.attrito) { const f = Math.exp(-q.attrito * dt); q.vx *= f; q.vy *= f; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.y >= 110.5 && q.g > 0) {
        if (q.macchia) { macchie.push({x: q.x, w: 1 + (Math.random() < 0.4), col: q.col}); if (macchie.length > 160) macchie.shift(); }
        particelle.splice(i, 1); continue;
      }
      if (q.vita <= 0) particelle.splice(i, 1);
    }
  }

  /* un cappello o una maschera che cade dalla testa quando gli hp della testa scendono sotto il 50%: ragdoll semplice (gravita', rimbalzi
     smorzati, attrito sul pavimento) nel sistema locale di L; parte dalla posa della testa, con uno scatto all'indietro e in su */
  const COP_R = 7;
  function staccaCopricapo(L, subito) {
    const v = L.voci.find(q => q.nome === "testa"), b = L.pup.corpi.testa;
    if (!v || !L.cop) return;
    const cx = L.cop.tela.width / 2, cy = L.cop.tela.height / 2, lx = v.ox + L.cop.off[0] + cx, ly = v.oy + L.cop.off[1] + cy;
    const c = Math.cos(b.a), sn = Math.sin(b.a);
    L.copStacc = {cx, cy, x: b.x + c * lx - sn * ly, y: b.y + sn * lx + c * ly, a: b.a, vx: b.vx - 70 - Math.random() * 60, vy: b.vy - 140 - Math.random() * 80,
                  w: -6 - Math.random() * 10};
    if (subito) for (let i = 0; i < 240; i++) avanzaCopStacc(L.copStacc);
    else for (let i = 0; i < 5; i++) particella({x: L.O + L.f * L.copStacc.x, y: L.copStacc.y, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 60, s: 1, vita: 0.3, fade: 0.2, col: "#cfd6e0", g: 200});
  }
  function avanzaCopStacc(c) {
    c.vy += GRAV * DT; c.x += c.vx * DT; c.y += c.vy * DT; c.a += c.w * DT;
    if (c.y > 111 - COP_R) {
      c.y = 111 - COP_R;
      if (c.vy > 30) { c.vy *= -0.4; c.w *= 0.6 + 0.4 * Math.random(); c.vx *= 0.7; } else c.vy = 0;
      if (c.vy === 0) { c.vx *= 0.85; c.w = c.vx / COP_R; if (Math.abs(c.vx) < 1) { c.vx = 0; c.w = 0; } }
    }
  }

  /* un passo di un combattente: fisica del pupazzo, cappello caduto, acido sulla pelle, lampo dei colpi, polvere dei piedi.
     (Il duello lo chiama per i due contendenti, la palestra per ognuno dei suoi allievi.) */
  function avanzaL(L) {
    if (L.copStacc) avanzaCopStacc(L.copStacc);
    // Supervelocita': il corpo vive piu' in fretta (+25% per rango, +100% al quarto): piu' passi di fisica per ogni passo di scena
    // (passi, schivate, respiro, colpi: tutto dura meno; le azioni di scena seguono, perche' partono dal pupazzo). Il disegno interpola
    // sull'intero tratto percorso, non solo sull'ultimo passo
    // Riflessi Fulminei (stance di Elettrocinesi, id 12): finche' e' in corso le animazioni sono il 100% piu' veloci (come un quarto rango di Supervelocita')
    const vel = (L.extra.velocita || 0) + (conStance(L, STANCE_RIFLESSI_FULMINEI) ? 1 / VEL_RANGO : 0);
    L.velAcc = (L.velAcc || 0) + 1 + VEL_RANGO * vel;
    const n = Math.floor(L.velAcc); L.velAcc -= n;
    if (n <= 1) L.pup.passo(DT);
    else {
      const prima = Object.values(L.pup.corpi).map(b => [b, b.x, b.y, b.a]);
      for (let i = 0; i < n; i++) L.pup.passo(DT);
      for (const [b, x, y, a] of prima) { b.px = x; b.py = y; b.pa = a; }
    }
    L.tAnim += DT * (1 + VEL_RANGO * vel);
    {                                                        // Forma d'acqua: dissolvenza dentro e fuori, e gocce che cadono dal corpo
      const su = L.extra.acqua ? 1 : 0, v = L.acq || 0;
      L.acq = Math.abs(su - v) < 0.004 ? su : v + (su - v) * (1 - Math.exp(-DT * 4));
      if (L.acq > 0.5 && Math.random() < 0.07) {
        const b = L.pup.corpi[["busto_sup", "avambraccio_dx", "avambraccio_sx", "coscia_dx", "stinco_sx", "testa"][Math.floor(Math.random() * 6)]];
        particella({x: L.O + L.f * (b.x + (Math.random() - 0.5) * 5), y: b.y + (Math.random() - 0.3) * 6, vx: 0, vy: 8 + Math.random() * 14, s: 1, vita: 0.55, fade: 0.25, col: Math.random() < 0.5 ? "#7fd0f5" : "#c4eeff", g: 700});
      }
    }
    {                                                        // Corpo di Fiamma: dissolvenza dentro e fuori, e fiamme che salgono dal corpo
      const su = L.extra.fuoco ? 1 : 0, v = L.fuo || 0;
      L.fuo = Math.abs(su - v) < 0.004 ? su : v + (su - v) * (1 - Math.exp(-DT * 4));
      if (L.fuo > 0.4 && !L.ko) for (let i = 0; i < 2; i++) if (Math.random() < 0.5) {
        const b = L.pup.corpi[["busto_sup", "busto_inf", "testa", "avambraccio_dx", "avambraccio_sx", "coscia_dx", "coscia_sx", "stinco_dx", "stinco_sx"][Math.floor(Math.random() * 9)]];
        particella({x: L.O + L.f * (b.x + (Math.random() - 0.5) * 6), y: b.y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 12, vy: -16 - Math.random() * 34,
                    g: -40, s: Math.random() < 0.25 ? 2 : 1, vita: 0.45 + Math.random() * 0.4, fade: 0.25, cols: FIAMMA, luce: true, davanti: true});
      }
    }
    {                                                        // Corpo Elettrico: dissolvenza dentro e fuori, e scintille che saltano dal corpo
      const su = conStance(L, STANCE_CORPO_ELETTRICO) ? 1 : 0, v = L.ele || 0;
      L.ele = Math.abs(su - v) < 0.004 ? su : v + (su - v) * (1 - Math.exp(-DT * 4));
      if (L.ele > 0.4 && !L.ko) for (let i = 0; i < 2; i++) if (Math.random() < 0.45) {
        const b = L.pup.corpi[["busto_sup", "busto_inf", "testa", "avambraccio_dx", "avambraccio_sx", "coscia_dx", "coscia_sx", "stinco_dx", "stinco_sx"][Math.floor(Math.random() * 9)]];
        particella({x: L.O + L.f * (b.x + (Math.random() - 0.5) * 6), y: b.y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90,
                    g: 0, attrito: 3, s: Math.random() < 0.25 ? 2 : 1, vita: 0.12 + Math.random() * 0.14, fade: 0.06, cols: ELETTRICO, luce: true, davanti: true});
      }
    }
    if (L.sangue && L.sangue.length && !L.ko && Math.random() < 0.1 * Math.min(2, L.sangue.length)) {          // Sanguinamento: gocce di sangue dal punto ferito, che cadono e macchiano il pavimento
      const loc = L.sangue[Math.floor(Math.random() * L.sangue.length)], nomi = Pupazzo.LOC[loc] || Pupazzo.LOC[Object.keys(Pupazzo.LOC)[Math.floor(Math.random() * 6)]];
      const b = L.pup.corpi[nomi[Math.floor(Math.random() * nomi.length)]];
      if (b) particella({x: L.O + L.f * (b.x + (Math.random() - 0.5) * 5), y: b.y + (Math.random() - 0.3) * 6, vx: (Math.random() - 0.5) * 14, vy: -6 + Math.random() * 14,
                         s: Math.random() < 0.25 ? 2 : 1, vita: 1.4, fade: 0.2, macchia: true, g: 560, col: "rgb(" + SANGUE[["a", "b", "c", "d"][Math.floor(Math.random() * 4)]].join(",") + ")"});
    }
    if (PO && L.po) PO.passo(L, aiuti);                      // i poteri: effetti a mossa, braci, teschi, neve
    // la falda del cappotto e' appesa al busto basso come un pendolo smorzato: quando il corpo va avanti si scosta all'indietro, quando si ferma ondeggia
    if (L.falda) {
      const f = L.falda, b = L.pup.corpi[f.pezzo], vl = b.vx || 0, aw = b.w || 0;
      const bersaglio = Math.max(-0.7, Math.min(0.7, vl * 0.006 + aw * 0.04)) - b.a * 0.5;
      f.vel += (-190 * (f.ang - bersaglio) - 14 * f.vel) * DT;
      f.ang = Math.max(-0.9, Math.min(0.9, f.ang + f.vel * DT));
    }
    // Super Forza: braccia e busto crescono (e tornano) con dolcezza
    const kt = 1 + FORZA_RANGO * (L.extra.forza || 0);
    if (L.fk !== kt) { L.fk = L.fk || 1; L.fk += (kt - L.fk) * (1 - Math.exp(-DT * 5)); if (Math.abs(kt - L.fk) < 0.002) L.fk = kt; }
    for (const loc in L.acidoObj) {                          // l'acido sulla pelle: la texture avanza in tre secondi
      const d = L.acidoObj[loc] - (L.acidoVis[loc] || 0);
      if (Math.abs(d) < 1e-4) continue;
      const vel = (L.acidoVel[loc] || 0.3) * DT;
      L.acidoVis[loc] = Math.abs(d) <= vel ? L.acidoObj[loc] : (L.acidoVis[loc] || 0) + Math.sign(d) * vel;
      L.tip[loc] = {...(L.tip[loc] || {}), acido: L.acidoVis[loc]};
      if (Math.round(L.tAnim / DT) % 4 === 0 || L.acidoVis[loc] === L.acidoObj[loc])
        for (const [nome, p] of Object.entries(parti)) if (p.loc === loc && L.dati[nome]) disegnaPelle(L.lato, nome, L.dati[nome][0], L.dati[nome][1]);
    }
    for (const k in L.lamp) if (L.lamp[k] > 0) L.lamp[k] = Math.max(0, L.lamp[k] - DT * 3.2);
    // polvere sotto i piedi che scivolano
    const C = L.pup.corpi;
    for (const n of ["piede_dx", "piede_sx"]) {
      if (C[n].terra > 0 && C[n].scivola > 110 && Math.random() < 0.5) polvere(aMondo(L, [C[n].x, 0])[0]);
    }
  }

  function passo() {
    for (let i = futuri.length - 1; i >= 0; i--) if ((futuri[i].t -= DT) <= 0) { const f = futuri.splice(i, 1)[0]; f.fn(); }
    for (const L of Object.values(lati)) {
      // il muro davanti: la superficie piu' vicina dell'avversario (tronco, bacino, testa), in coordinate di L
      const altro = lati[L.lato === "p" ? "c" : "p"];
      let X = L.f > 0 ? 1e9 : -1e9;
      for (const n of ["busto_inf", "busto_sup", "testa"]) {
        const b = altro.pup.corpi[n], Xw = altro.O + altro.f * b.x;
        X = L.f > 0 ? Math.min(X, Xw - 6) : Math.max(X, Xw + 6);
      }
      L.pup.muroDavanti(L.f * (X - L.O) - 1);
      avanzaL(L);
    }
    avanzaScambio();
    if (MO) MO.passo(DT);
    avanzaParticelle(DT);
    scossa.a *= Math.exp(-DT * 14);
    scossa.x = (Math.random() - 0.5) * 2 * scossa.a; scossa.y = (Math.random() - 0.5) * 2 * scossa.a;
  }

  function ciclo(ts) {
    if (!ultimoT) ultimoT = ts;
    let dt = Math.min(0.1, (ts - ultimoT) / 1000); ultimoT = ts;
    if (rallentaT > 0) { rallentaT -= dt; if (rallentaT <= 0) rallenta = 1; }
    if (congela > 0) { congela -= dt; dt = 0; }
    // se gli scambi si accumulano (si gioca piu' in fretta di quanto si animi) la scena accelera per recuperare
    acc += dt * rallenta * (coda.length >= 4 ? 2.2 : coda.length >= 2 ? 1.5 : 1);
    while (acc >= DT) { passo(); acc -= DT; }
    alpha = acc / DT;
    disegna();
    requestAnimationFrame(ciclo);
  }

  /* ---------------------------------------------------------------------------------------------------- */
  /* gli scambi: la logica ha gia' deciso com'e' andata (colpito, parato, schivato); qui si mette in scena. Chi attacca
     carica e colpisce (a distanza lancia un proiettile), chi difende si scansa, para o incassa nel momento giusto: il
     colpo subito e' un impulso proporzionale al danno, il resto lo fa la fisica. */
  const COLORI_PROIETTILE = {fuoco: "#ff8a2a", gelo: "#8fe8ff", elettrico: "#fff27a", acido: "#9dff4a", psionico: "#e07bff",
                             magico: "#b86bff", perforante: "#ffe9b0", taglio: "#dfe8f0", contundente: "#cfd6e0"};
  const FIAMMA = ["#fff7c8", "#ffd24a", "#ff8a1f", "#e8400c", "#6a1a0c"];    // la rampa del fuoco: dal bianco caldo al rosso scuro
  const ELETTRICO = ["#ffffff", "#fff6a0", "#ffe250", "#ffb020"];            // le scintille del Corpo Elettrico
  const proiettili = [];
  const futuro = (secondi, fn) => futuri.push({t: Math.max(0.0001, secondi), fn});
  const tipoSchivata = loc => loc === "testa" ? "abbassa" : loc && loc.startsWith("gamba") ? "salto" : "indietro";

  function parametri(ev) {
    const tags = ((ev.info && ev.info.tags) || []).join(" ");
    const dist = /distanza/i.test(tags), pesante = /2 azioni/.test(tags), molti = (ev.colpi || 1) > 1;
    const stile = ev.tipo_danno === "taglio" ? "fendente" : ev.tipo_danno === "perforante" ? "affondo" : "pugno";
    return {dist, pesante, molti, stile, carica: pesante ? 0.32 : molti ? 0.09 : dist ? 0.14 : 0.17, colpo: pesante ? 0.14 : 0.1,
            recupero: molti ? 0.2 : pesante ? 0.44 : 0.34};
  }

  /* Il colpo "arriva" (a segno, parato o schivato) quando la sua animazione lo dice: SOLO da quel momento si segnano i danni, i numeri e il
     knockback (v. vista()). Cosi' la scena e la pagina non anticipano mai quello che l'animazione deve ancora mostrare. */
  const attesa = [];                // i colpi gia' decisi dal server la cui animazione non e' ancora arrivata al contatto
  const ascoltatori = [];           // chi vuole sapere quando un colpo arriva (la pagina: numeri fluttuanti, pannelli)
  const liberi = [];                // chi aspetta che la scena sia libera (nessun colpo in coda o in corso)
  let ultimoVisto = null;           // gli hp che la scena mostra adesso: {p, c}

  function rivela(ev) {
    if (!ev) return;
    const i = attesa.indexOf(ev);
    if (i >= 0) attesa.splice(i, 1);
    if (ev._riv) return;
    ev._riv = true;
    for (const f of ascoltatori) f(ev);
  }
  const occupata = () => attesa.length > 0 || !!scambio || coda.length > 0;
  /* lo stato da mostrare: finche' un colpo non e' arrivato gli hp, gli scambi e il resto restano com'erano prima di lui */
  function vista(St) {
    if (!St || !St.player || !St.cpu) return St;
    if (!attesa.length) { ultimoVisto = {p: St.player.hp, c: St.cpu.hp}; return St; }
    const n0 = attesa[0].n, prima = ultimoVisto || {p: St.player.hp, c: St.cpu.hp};
    return {...St, player: {...St.player, hp: prima.p}, cpu: {...St.cpu, hp: prima.c}, eventi: (St.eventi || []).filter(e => e.n < n0),
            finito: false, vinto_dal_player: null};
  }
  /* per le pagine: se la scena non risponde (scheda nascosta, animazioni bloccate) si lascia andare tutto */
  function liberaTutto() {
    for (const ev of attesa.slice()) rivela(ev);
    coda.length = 0; scambio = null; proiettili.length = 0;
    if (MO) MO.reset();
    for (const f of liberi.splice(0)) f();
  }

  /* un colpo per volta: se la scena ha un'animazione apposita per questo attacco (static/mosse.js) la recita lei, altrimenti la solita */
  function avviaScambio(ev) {
    const att = lati[ev.chi === "p" ? "p" : "c"], dif = lati[ev.chi === "p" ? "c" : "p"];
    const par = parametri(ev);
    if (PO) PO.mossa(att, ev.poteri, 1.2);                                 // una mossa di questi poteri: si accendono le aure "a mossa" (Assorbi, Anatema, Super Soldato)
    const urlo = !!(PO && par.dist && (ev.poteri || []).includes(PO.ID.URLO));      // le mosse di super urlo sono onde soniche
    const colpito = ev.esito === "colpito", parato = ev.esito === "parato";
    const locB = ev.split ? "busto" : (colpito ? ev.loc : (ev.loc_att || ev.loc || "busto"));
    const forza = colpito ? Math.max(0.06, (ev.hp_persi || 0) / 90) : 0;
    const protesi = !!ev.protesi;
    scambio = {t: 0, fine: false, ev, max: 4};
    // dove mirare: il davanti della locazione (per le parate, un poco piu' fuori, dove arrivera' l'avambraccio)
    const davanti = () => forzaPunto(dif, locB, dif.pup.fronte(locB));     // il davanti della locazione, come si vede (Super Forza)
    // il bersaglio della mano: dove deve arrivare la mano fisica perche', ingrandita da Super Forza, tocchi il punto voluto
    const punto = () => forzaPunto(att, "braccio_dx", daMondo(att, aMondo(dif, parato ? [davanti()[0] + 8, davanti()[1]] : davanti())), true);

    const reazione = (tipo) => {                                // la difesa parte un istante prima del colpo
      if (colpito) return;
      if (parato) dif.pup.para({mano: "dx", punto: () => { const d = davanti(); return forzaPunto(dif, "braccio_dx", [d[0] + 5, d[1]], true); }});
      else dif.pup.schiva(tipo || tipoSchivata(locB));
    };

    const contatto = (info, opz = {}) => {                      // la mano (o il proiettile) arriva
      rivela(ev);                                               // ...e solo adesso si segnano il danno e i numeri
      const pW = info && info.mondo ? info.mondo : info ? aMondo(att, forzaPunto(att, "braccio_dx", [info.x, info.y])) : aMondo(dif, davanti());   // punto d'impatto nel mondo (come si vede)
      const punta = forzaPunto(dif, ev.loc, daMondo(dif, pW), true);             // ...e nel sistema (fisico) del difensore
      if (colpito) {
        const dir = opz.dir || [-1, -0.14 - 0.08 * Math.random()];
        if (ev.ucciso) {
          dif.pup.muori(forza, dir); dif.ko = true;
          rallenta = 0.3; rallentaT = 0.5;                       // il colpo di grazia in ralenti (tempo reale)
        } else dif.pup.colpisci(ev.split ? "busto" : ev.loc, forza, dir, punta[0], punta[1]);
        dif.ultimo = {forza};
        for (const p of Object.values(parti)) if (ev.split || p.loc === ev.loc) dif.lamp[p.loc] = 1;
        if (!opz.senzaSchizzi) schizzi(pW, [dif.f * -1, -0.25], forza, protesi || !(ev.hp_persi > 0));          // senza danno: scintille, non sangue
        if (!opz.senzaStella) stella(pW, forza > 0.5 ? "#ffffff" : "#ffe9a0", 8, 130 + 120 * Math.min(1, forza));
        congela = Math.max(congela, 0.035 + 0.08 * Math.min(1, forza));
        scossa.a = Math.max(scossa.a, 0.8 + 3.2 * Math.min(1, forza));
        att.pup.spingiTutto(-20, 0);                              // il contraccolpo
      } else if (parato) {
        for (let i = 0; i < 7; i++) particella({x: pW[0], y: pW[1], vx: (Math.random() - 0.5) * 260 + dif.f * -80, vy: -Math.random() * 180,
                                                s: 1, vita: 0.25, fade: 0.15, col: "#ffe38a", g: 600});
        stella(pW, "#ffe38a", 6, 110);
        dif.pup.spingiTutto(-55, 0); att.pup.spingiTutto(-35, 0);
        congela = Math.max(congela, 0.03); scossa.a = Math.max(scossa.a, 0.8);
      } else {
        att.pup.spingiTutto(50, 0);                              // a vuoto: l'inerzia lo porta avanti
      }
    };

    const o = {mano: ((ev.colpo || 1) % 2) ? "dx" : "sx", distanza: par.dist, insegui: colpito, bersaglio: punto, stile: par.stile,
               carica: par.carica, colpo: par.colpo, recupero: par.recupero, tenuta: 0.06,
               anticipo: colpito ? 0 : 0.05, alAnticipo: reazione,
               alFine: () => { scambio && (scambio.fine = true); }};

    // un attacco con la sua animazione (static/mosse.js): ha in mano tutto quello che serve per recitarla e per dire quando il colpo arriva
    if (MO && MO.ha(ev)) {
      scambio.max = 7;
      const fine = () => { if (scambio && scambio.ev === ev) scambio.fine = true; };
      const mano = (l) => aMondo(att, forzaPunto(att, "braccio_" + l, att.pup._polso(l)));
      const impatto = (info) => info && info.mondo ? info.mondo : info ? aMondo(att, forzaPunto(att, "braccio_dx", [info.x, info.y])) : aMondo(dif, davanti());      // dove si vede l'impatto (come in contatto)
      MO.avvia(ev, {ev, att, dif, colpito, parato, locB, forza, base: o, davanti, punto, reazione, contatto, fine, mano, impatto, largo: Wp,
                    bersaglio: () => aMondo(dif, parato ? [davanti()[0] + 8, davanti()[1]] : davanti()),
                    pose: (L, nome) => posaCorpo(L.pup.corpi[nome]), aMondo, daMondo, particella, futuro,
                    giunto: (L, corpo, nome) => aMondo(L, puntoCorpo(L, corpo, nome, true)),                         // un giunto del corpo, nel mondo (la direzione di un avambraccio: le armi in mano)
                    pugno: (lato, durata) => { if (PO) PO.pugno(att, lato, durata, aiuti); },                       // l'avambraccio diventa pietra (Pugno di Roccia)
                    attacca: (extra) => att.pup.attacca({...o, ...extra}), gesto: (tipo, opz) => att.pup.gesto(tipo, opz),
                    scuoti: (a) => { scossa.a = Math.max(scossa.a, a); }});
      return;
    }

    if (!par.dist) {
      o.alContatto = contatto;
    } else {
      // a distanza: al rilascio parte un proiettile, che arriva dopo un tempo di volo
      o.alColpoInizio = () => {
        const bocca = att.pup.corpi.testa;                      // il grido parte dalla bocca, il resto dalla mano
        const da = urlo ? aMondo(att, [bocca.x + 7, bocca.y + 2]) : aMondo(att, forzaPunto(att, "braccio_dx", att.pup._polso(o.mano))), a = aMondo(dif, davanti());
        const dx = a[0] - da[0], dy = a[1] - da[1], d = Math.hypot(dx, dy), vel = urlo ? 230 : 650, tv = Math.max(urlo ? 0.34 : 0.11, d / vel);   // (le onde viaggiano piano: si vedono)
        proiettili.push({x: da[0], y: da[1], vx: dx / tv, vy: dy / tv, t: tv, t0: tv, tipo: urlo ? "onda" : null, col: COLORI_PROIETTILE[ev.tipo_danno] || "#cfd6e0", scia: []});
        att.pup.spingiTutto(-45, 0);
        for (let i = 0; i < 5; i++) particella({x: da[0], y: da[1], vx: att.f * (60 + Math.random() * 160), vy: (Math.random() - 0.5) * 120, s: 1,
                                                vita: 0.2, fade: 0.1, col: COLORI_PROIETTILE[ev.tipo_danno] || "#fff", g: 0});
        futuro(tv, () => contatto(null));
      };
    }
    att.pup.attacca(o);
  }

  function avanzaScambio() {
    for (let i = proiettili.length - 1; i >= 0; i--) {
      const q = proiettili[i];
      q.scia.push([q.x, q.y]); if (q.scia.length > 5) q.scia.shift();
      q.x += q.vx * DT; q.y += q.vy * DT; q.t -= DT;
      if (q.t <= 0) proiettili.splice(i, 1);
    }
    if (scambio) {
      scambio.t += DT;
      if (scambio.fine || scambio.t > (scambio.max || 4)) { rivela(scambio.ev); scambio = null; }      // (se per qualche motivo il contatto non c'e' stato, il colpo si segna adesso)
    }
    if (!scambio && coda.length) avviaScambio(coda.shift());
    if (!scambio && !coda.length) for (const L of Object.values(lati)) {
      if (L.morteAttesa && !L.ko) { L.ko = true; L.pup.muori((L.ultimo || {forza: 0.5}).forza); }
    }
    if (vittoria && !vittoria.avviata && !scambio && !coda.length) {
      const v = vittoria;
      v.avviata = true;
      futuro(0.9, () => { const L = lati[v.lato]; if (L && !L.ko) L.pup.esulta(v.tipo); });      // il tempo del colpo di grazia, poi la festa
    }
    if (liberi.length && !occupata()) for (const f of liberi.splice(0)) f();
  }

  /* come esulta chi vince: in salute, braccia al cielo e saltelli; sotto meta' degli hp totali, a sorte o quello o un braccio solo
     al cielo con la testa che si china */
  function tipoVittoria(pg) {
    let val = 0, max = 0;
    for (const h of Object.values(pg.hp)) { val += Math.max(0, h.val); max += h.max; }
    return max > 0 && val / max < 0.5 && Math.random() < 0.5 ? "braccio" : "salti";
  }

  /* ---------------------------------------------------------------------------------------------------- */
  /* Lo stato di UN combattente, da un oggetto-personaggio ({nome, aspetto, hp:{loc:{val,max,protesi,crippled,tipi}}, extra}):
     nome, aspetto, sangue e pelle strappata per locazione, arti storpi, cappello che cade, ali e braccia extra, morte.
     `primo` = e' la prima volta (le ferite non si animano). `inPalestra`: nessuno cade morto (chi e' in coma non si vede nemmeno) e le ferite
     sono fasciate al posto del sangue, della pelle strappata e dell'interno; i vestiti restano interi e il cappello al suo posto. */
  function applicaPg(lato, pg, primo, inPalestra = false) {
    const L = lati[lato];
    L.nome = pg.nome;
    const ks = Object.keys(pg.hp || {}), trova = (re) => ks.find((k) => re.test(k));
    L.locEx = {alaDx: trova(/^ala_?dx/i), alaSx: trova(/^ala_?sx/i), brDx: trova(/secondo braccio dx/i), brSx: trova(/secondo braccio sx/i)};      // (per il mirino)
    const chiaveAsp = JSON.stringify(pg.aspetto || null);
    if (L.aspKey !== chiaveAsp) { L.aspKey = chiaveAsp; applicaAspetto(lato, pg.aspetto); L.chiave = {}; }
    if (PO) PO.aggiorna(L, inPalestra ? null : pg);                // i poteri accesi (e dove la pelle e' ancora corazzata): prima dei pezzi, che ne dipendono
    for (const [nome, p] of Object.entries(parti)) {
      const h = pg.hp[p.loc];
      if (inPalestra) {                                                     // niente sangue: si vede la fasciatura (le protesi non hanno ferite)
        const g = !h || h.protesi ? 0 : h.crippled || h.val <= 0 ? 1 : Math.max(0, 1 - h.val / h.max);
        const liv = g < FASCIA_MIN ? 0 : Math.max(1, Math.round(g * 10)), chiaveF = "F" + liv;
        if (L.chiave[nome] !== chiaveF) {
          L.chiave[nome] = chiaveF; L.prof[p.loc] = 0; L.dati[nome] = [0, 0]; L.tip[p.loc] = {};
          disegnaPelle(lato, nome, 0, 0); disegnaCarne(lato, nome, 0); disegnaVestiti(lato, nome, 0);
          if (nome === "testa") disegnaCapelli(lato, 0);
          disegnaFascia(lato, nome, liv / 10);
        }
        continue;
      }
      const danno = !h || h.protesi ? 0 : Math.min(1, Math.max(0, 1 - h.val / h.max));   // le protesi non sanguinano
      const prof = !h || h.protesi ? 0 : Math.min(1, Math.max(0, -h.val / h.max));        // ...e non si strappano
      // texture per tipo di danno: frazione degli hp massimi tolta da fuoco, acido, fulmine (il sangue rosso e' il resto)
      const ti = (h && h.tipi) || {}, fr = (t) => h && !h.protesi ? Math.min(1, (ti[t] || 0) / h.max) : 0;
      const fu = fr("fuoco"), ac = fr("acido"), el = fr("elettrico"), rosso = prof > 0 ? danno : Math.max(0, danno - fu - ac - el);
      const chiave = rosso + "|" + prof + "|" + fu + "|" + ac + "|" + el + "|" + (PO ? PO.chiave(L, p.loc, nome) : "");
      if (L.chiave[nome] !== chiave) {
        L.chiave[nome] = chiave; L.prof[p.loc] = prof; L.dati[nome] = [rosso, prof];
        if (L.acidoObj[p.loc] !== ac) {
          const pri = primo || L.acidoObj[p.loc] === undefined;                // a duello gia' avviato non si anima: gia' li' da subito
          L.acidoVel[p.loc] = Math.abs(ac - (L.acidoVis[p.loc] || 0)) / ACIDO_SECONDI;
          L.acidoObj[p.loc] = ac;
          if (pri) L.acidoVis[p.loc] = ac;
        }
        L.tip[p.loc] = {fuoco: fu, acido: L.acidoVis[p.loc] || 0, elettrico: el};
        disegnaPelle(lato, nome, rosso, prof); disegnaCarne(lato, nome, prof);
        disegnaVestiti(lato, nome, Math.min(1, danno / 0.85));               // a 15% degli hp l'indumento e' tutto strappato
        if (nome === "testa") disegnaCapelli(lato, prof);
      }
    }
    for (const loc of Object.keys(Pupazzo.LOC)) {
      const h = pg.hp[loc];
      L.pup.storpia(loc, !!(h && h.crippled), primo);
    }
    const hT = pg.hp.testa, sotto = !inPalestra && hT && !hT.protesi && hT.val < hT.max * 0.5;      // sotto meta' degli hp della testa il copricapo cade
    if (sotto && L.cop && !L.copStacc) staccaCopricapo(L, primo);
    else if (!sotto && L.copStacc) L.copStacc = null;
    L.extra = pg.extra || {};                                    // ali (potere Ali), braccia extra (2x2), volo (stance): spariscono con loro
    L.sangue = inPalestra ? [] : (pg.effetti || []).filter(e => e.nome === "Sanguinamento").map(e => e.loc || null);          // chi sanguina (dove, se si sa)
    if (primo) { L.acq = L.extra.acqua ? 1 : 0; L.fuo = L.extra.fuoco ? 1 : 0; L.ele = conStance(L, STANCE_CORPO_ELETTRICO) ? 1 : 0; }                    // (Forma d'acqua: a duello gia' avviato niente dissolvenza)
    if (primo) L.fk = 1 + FORZA_RANGO * (L.extra.forza || 0);    // (a duello gia' avviato niente crescita: e' gia' cosi')
    L.pup.volo(!!L.extra.volo);
    const morto = !inPalestra && (pg.hp.testa.val <= 0 || pg.hp.busto.val <= 0);
    if (morto && !L.ko) {
      if (primo) { L.ko = true; L.pup.muori((L.ultimo || {forza: 0.5}).forza); L.pup.assesta(300); }   // duello gia' finito: subito a terra
      else L.morteAttesa = true;       // cade quando gli scambi in corso sono finiti (di norma lo fa il colpo di grazia)
    }

  }

  /* stato del duello */
  function update(St) {
    arenaEl = arenaEl || document.getElementById("d-arena");
    if (!arenaEl) return;
    if (!parti) {
      if (!update.carico) update.carico = carica().then(() => { update.carico = null; update(St); });
      return;
    }
    ultimoStato = St;
    folla.tifo = St.folla ? St.folla.tifo : 0;
    luogo = St.luogo || null;
    const primo = !lati.p;
    if (primo) {
      arenaEl.innerHTML = "";
      tela = document.createElement("canvas"); tela.className = "tela";
      arenaEl.appendChild(tela);
      collegaMira(tela);
      costruisci("p"); costruisci("c");
      new ResizeObserver(adatta).observe(arenaEl);
      adatta(); piazza(); muri();
      ultimoT = 0; requestAnimationFrame(ciclo);
    }
    for (const lato of ["p", "c"]) applicaPg(lato, lato === "p" ? St.player : St.cpu, primo);
    if (St.finito && !vittoria && typeof St.vinto_dal_player === "boolean") {
      const lato = St.vinto_dal_player ? "p" : "c", pg = lato === "p" ? St.player : St.cpu;
      const morto = pg.hp.testa.val <= 0 || pg.hp.busto.val <= 0;            // se cadono in due non vince nessuno
      vittoria = {lato, tipo: tipoVittoria(pg), avviata: morto};
    }
    if (primo) for (const L of Object.values(lati)) L.pup.assesta(40);
  }

  /* un colpo nuovo: si mette in coda e si recita quando tocca (uno alla volta) */
  function colpo(ev) {
    if (!lati.p) return;
    const pg = ultimoStato && (ev.chi === "p" ? ultimoStato.cpu : ultimoStato.player);
    ev.protesi = !!(pg && pg.hp[ev.loc] && pg.hp[ev.loc].protesi);      // le protesi scintillano invece di sanguinare
    ev._riv = false;
    coda.push(ev);
    attesa.push(ev);                                       // il suo danno si segna quando l'animazione arriva al contatto
    if (coda.length > 6) { const v = coda.shift(); /* troppi arretrati (scheda nascosta): si salta la scena */
      rivela(v);
      if (v.esito === "colpito" && v.hp_persi > 0) lati[v.chi === "p" ? "c" : "p"].pup.colpisci(v.split ? "busto" : v.loc, v.hp_persi / 90); }
  }

  /* un'azione che non e' un colpo (mira, potere, stance): un gesto di chi la compie, con un po' di scena */
  function evento(ev) {
    if (!lati.p) return;
    const att = lati[ev.chi === "p" ? "p" : "c"], dif = lati[ev.chi === "p" ? "c" : "p"];
    if (ev.tipo === "mira") {
      const davanti = () => daMondo(att, aMondo(dif, dif.pup.fronte(ev.loc || "busto")));
      att.pup.gesto("mira", {bersaglio: davanti});
    } else if (ev.tipo === "potere" || ev.tipo === "stance") {
      att.pup.gesto(ev.tipo);
      if (PO) PO.mossa(att, ev.poteri, 1.6);                      // la stance (o il potere) si vede subito: aure "a mossa" accese un po'
      const c = ev.tipo === "potere" ? "#b86bff" : "#7be0ff";
      futuro(0.3, () => {
        const x = att.O + att.f * att.pup.corpi.busto_sup.x;
        for (let i = 0; i < 14; i++) particella({x: x + (Math.random() - 0.5) * 18, y: 100 - Math.random() * 20, vx: (Math.random() - 0.5) * 30,
                                                 vy: -40 - Math.random() * 90, s: 1, vita: 0.7, fade: 0.4, col: c, g: -40});
      });
    } else if (ev.tipo === "azzardo" || ev.tipo === "folla") {
      /* un azzardo o l'ovazione della folla: un gesto di chi la vive e una pioggia di coriandoli sopra di lui (colore = com'e' andata) */
      const grande = ev.tipo === "folla" || ev.tag === "jackpot" || ev.azzardo === "ultima";
      att.pup.gesto(grande ? "potere" : "stance");
      if (ev.tipo === "folla" || ev.tag === "bene" || ev.tag === "jackpot" || (ev.azzardo === "ultima" && ev.riuscita)) {
        folla.boato = ev.tipo === "folla" || ev.tag === "jackpot" ? 2.4 : 1.4; folla.lato = ev.chi === "p" ? 1 : -1;      // la folla di chi ha vinto scatta in piedi
      }
      const col = {bene: "#21d0b2", jackpot: "#ffe38a", male: "#ff4655", neutro: "#8b93a1", rischio: "#ffb020"}[ev.tipo === "folla" ? "jackpot" : ev.tag] || "#ffe38a";
      futuro(0.25, () => {
        const x = att.O + att.f * att.pup.corpi.busto_sup.x, n = grande ? 34 : 16;
        for (let i = 0; i < n; i++)
          particella({x: x + (Math.random() - 0.5) * 70, y: 6 + Math.random() * 18, vx: (Math.random() - 0.5) * 36, vy: 8 + Math.random() * 36,
                      s: Math.random() < 0.3 ? 2 : 1, vita: 1.2, fade: 0.5, col: Math.random() < 0.3 ? "#ffffff" : col, g: 90});
      });
    }
  }

  function passi(n) {
    for (let i = 0; i < n; i++) passo();
    alpha = 1; disegna();
  }

  /* ricostruisce da zero i due combattenti (per il laboratorio: una scena dopo l'altra) */
  function reset(St) {
    coda.length = futuri.length = particelle.length = macchie.length = proiettili.length = attesa.length = 0;
    if (MO) MO.reset();
    scambio = null; vittoria = null; congela = 0; rallenta = 1; rallentaT = 0; scossa.a = 0; acc = 0;
    costruisci("p"); costruisci("c");
    adatta();
    update(St);
  }

  /* Anteprima di un personaggio (pagine Box e Contratti): il corpo a riposo, con pelle, maglia, pantaloni e capelli del suo aspetto, su
     un canvas qualsiasi. Stessi sprite e stessi colori del duello; niente fisica, quindi qui non serve Pupazzo. */
  let caricando = null;
  async function anteprima(cv, a, scala = 2) {
    if (!parti) await (caricando = caricando || carica());
    const [W0, H0] = man.canvas;
    cv.width = W0 * scala; cv.height = H0 * scala;
    const cx = cv.getContext("2d");
    cx.imageSmoothingEnabled = false;
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.scale(scala, scala);
    const tela = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
    const col = asp && a ? coloriAspetto(a) : null, base = (nome) => nome.replace(/_(dx|sx)$/, "");
    for (const [nome, p] of Object.entries(parti).sort((x, y) => x[1].z - y[1].z)) {
      const A = man.giunti[p.da], x = A[0] - p.perno[0], y = A[1] - p.perno[1];
      const pelle = tela(p.w, p.h), pc = pelle.getContext("2d"), out = pc.createImageData(p.w, p.h);
      for (let i = 0; i < p.w * p.h; i++) {
        if (!p.px[i * 4 + 3]) continue;
        const c = PELLI.p[GRIGI[p.px[i * 4]] || "b"];
        out.data.set([c[0], c[1], c[2], 255], i * 4);
      }
      pc.putImageData(out, 0, 0);
      cx.drawImage(pelle, x, y);
      if (!col) continue;
      for (const [tipo, scelto, rp] of [["pantaloni", a.pantaloni, col.pantaloni], ["maglie", a.maglia, col.maglia]]) {
        const img = asp[tipo][scelto] && asp[tipo][scelto].img[base(nome)];
        if (!img) continue;
        const t = tela(img.w, img.h);
        coloraIndici(t, img, rp, {far: nome.endsWith("_sx")});
        cx.drawImage(t, x, y);
      }
      const fa = nome === "busto_inf" && asp.maglie[a.maglia] && asp.maglie[a.maglia].falda;
      if (fa && fa.img) { const t = tela(fa.img.w, fa.img.h); coloraIndici(t, fa.img, col.maglia); cx.drawImage(t, x + fa.offset[0], y + fa.offset[1]); }
      const cop = nome === "testa" && a.copricapo && asp.copricapo[a.copricapo];
      const h = nome === "testa" && asp.capelli[a.capelli];
      if (h && h.img && !(cop && cop.nascondi_capelli)) { const t = tela(h.img.w, h.img.h); coloraIndici(t, h.img, col.capelli); cx.drawImage(t, x + h.offset[0], y + h.offset[1]); }
      if (cop && cop.img) { const t = tela(cop.img.w, cop.img.h); coloraIndici(t, cop.img, col.copricapo); cx.drawImage(t, x + cop.offset[0], y + cop.offset[1]); }
    }
  }

  /* La palestra (static/scena_palestra.js) riusa gli stessi combattenti: lo stesso corpo, aspetto, ferite, vestiti che si
     strappano, la stessa fisica. Qui le leve che servono a una scena con un numero qualunque di allievi e con la sua tela:
     niente di tutto questo cambia come funziona il duello. */
  function apriTela(el, o = {}) {
    arenaEl = el;
    scalaFn = o.scala || null;
    el.innerHTML = "";
    tela = document.createElement("canvas"); tela.className = "tela";
    el.appendChild(tela);
    new ResizeObserver(() => { adatta(); if (o.alResize) o.alResize(); }).observe(el);
    adatta();
    return tela;
  }
  const kit = {
    pronto: async () => { if (!parti) await (caricando = caricando || carica()); return !!parti; },
    man: () => man,
    apriTela,
    vista: () => ({ctx, S, dpr, pavY, W, H, Wp, colori}),
    crea: (chiave, o = {}) => { if (!lati[chiave]) costruisci(chiave); return Object.assign(lati[chiave], o); },
    rimuovi: (chiave) => { delete lati[chiave]; },
    applica: applicaPg, avanza: avanzaL, setAlpha: (a) => { alpha = a; },
    mondo, disegnaCombattente, disegnaOmbra, disegnaParticelle, disegnaCopStacc, avanzaParticelle,
    particella, schizzi, stella, polvere, aMondo, daMondo, DT, GRAV, ALI,
  };

  /* per la diagnostica */
  const stato = () => ({coda: coda.length, scambio: scambio && {t: scambio.t, fine: scambio.fine, esito: scambio.ev.esito}, congela, rallenta, futuri: futuri.length, particelle: particelle.length, vittoria});

  /* per il laboratorio: fa esultare un combattente a comando ("salti" o "braccio") */
  const festeggia = (lato, tipo) => lati[lato] && lati[lato].pup.esulta(tipo);

  return {update, reset, anteprima, colpo, evento, passi, disegna, stato, festeggia, vista, occupata, liberaTutto, pronta: () => !!lati.p,
          alImpatto: (fn) => ascoltatori.push(fn), quandoLibera: (fn) => liberi.push(fn), mira: accendiMira, statoMira, puntaMira, lati: () => lati, particella, scuoti: a => { scossa.a = Math.max(scossa.a, a); }, kit};
})();
