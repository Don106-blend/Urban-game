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

  let man = null, parti = null;     // parti.json e i pezzi caricati
  let asp = null;                   // aspetto.json + sprite di capelli e vestiti + texture dei colori (null = non disponibile)
  const locEstesa = {};             // locazione -> {y0, y1}: righe dello sprite intero che occupa
  const lati = {};                  // "p" | "c" -> combattente
  let tela = null, ctx = null, arenaEl = null;
  let W = 0, H = 0, S = 2, dpr = 1; // dimensioni (px schermo), scala dei pixel sprite, densita'
  let Wp = 0, pavY = 0;             // larghezza in px sprite; y schermo del pavimento
  let ultimoT = 0, acc = 0, alpha = 0;
  let congela = 0, rallenta = 1, rallentaT = 0;    // hit-stop (secondi che restano), fattore di tempo e quanto dura ancora
  const scossa = {a: 0, x: 0, y: 0};  // scossa dello schermo
  const particelle = [], macchie = [];
  const futuri = [];                // eventi a tempo (secondi di simulazione): {t, fn}
  const coda = [];                  // scambi (colpi) in attesa di essere giocati
  let scambio = null;               // quello in corso
  let colori = {};
  let ultimoStato = null;

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
        }))]);
      asp = tex.vestiti && tex.capelli ? {tex, capelli, maglie, pantaloni} : null;
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
    const maglia = campiona(asp.tex.vestiti, U(a.seed, 2));
    let pant = campiona(asp.tex.vestiti, U(a.seed, 3));
    for (let k = 1; k < 6 && dist2(maglia, pant) < 55 * 55; k++) pant = campiona(asp.tex.vestiti, U(a.seed, 3 + 10 * k));   // maglia e pantaloni non si confondono
    return {capelli: rampa(capelli), maglia: rampa(maglia), pantaloni: rampa(pant)};
  }

  /* Sotto la pelle c'e' l'interno (scheletro e viscere, poi la carne): quando una locazione va in NEGATIVO la pelle si strappa
     a macchie (alpha mask) e si intravede la carne, poi, piu' giu', l'osso. `prof` = -hp/hp_max in 0..1 (0 = non si vede niente,
     1 = a -hp_max: del corpo restano ossa e brandelli). Le maschere sono *ranghi* per pixel (percentili di rumore a macchie piu'
     la distanza da un centro-ferita fisso per locazione): cosi' la quota di pelle strappata e' esattamente quella voluta, e cresce
     sempre a partire dagli stessi punti. */
  const quotaPelle = (d) => d <= 0 ? 0 : Math.min(0.985, Math.max(0.08, 1 - Math.pow(1 - d, 1.4)));     // pelle strappata
  const quotaCarne = (d) => d <= 0.1 ? 0 : Math.min(0.97, Math.pow((d - 0.1) / 0.9, 0.9));             // carne strappata (dopo la pelle)
  const BORDO_FERITA = [92, 14, 26];

  function rango(lato, nome, tipo) {
    const L = lati[lato], k = nome + tipo;
    if (L.rk[k]) return L.rk[k];
    const p = parti[nome], ext = locEstesa[p.loc], len = Math.max(1, ext.y1 - ext.y0);
    const sem = p.loc.length * 31 + p.loc.charCodeAt(p.loc.length - 1) + (lato === "p" ? 0 : 97) + tipo * 53;
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
    const L = lati[lato], c = L.capelli, sem = 777 + (lato === "p" ? 0 : 97);
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
  function disegnaVestiti(lato, nome, f) {
    const L = lati[lato], lista = L.vest[nome];
    if (!lista) return;
    const p = parti[nome], seed = p.loc.length * 31 + p.loc.charCodeAt(p.loc.length - 1) + (lato === "p" ? 0 : 97);
    const r = f > 0 ? rango(lato, nome, 2) : null;
    for (const v of lista) coloraIndici(v.tela, v.img, v.rp, {far: v.far, r, q: f, sangue: 0.85 * f, y0: p.y0, seed});
  }

  function disegnaCapelli(lato, prof) {
    const c = lati[lato].capelli;
    if (!c) return;
    coloraIndici(c.tela, c.img, c.rp, prof > 0 ? {r: rangoCapelli(lato), q: quotaPelle(prof)} : {});   // a testa spaccata anche i capelli vanno
  }

  /* dai a un combattente il suo aspetto: capigliatura, maglia, pantaloni, colori dal seed */
  function applicaAspetto(lato, a) {
    const L = lati[lato];
    L.vest = {}; L.capelli = null;
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
    const h = asp.capelli[a.capelli];
    if (h && h.img) L.capelli = {img: h.img, off: h.offset, rp: col.capelli, tela: tela(h.img.w, h.img.h), rk: null};
    for (const nome of Object.keys(parti)) disegnaVestiti(lato, nome, 0);
    disegnaCapelli(lato, 0);
  }

  /* skin + sangue: una macchia di rumore decide quali pixel sono sporchi, `danno` (0..1) alza la soglia. Il rumore e' calcolato
     sulle coordinate dello sprite intero (y0), cosi' le due meta' di un arto sono continue. Con `prof` > 0 i pixel strappati
     spariscono e il bordo di quelli che restano e' un orlo di ferita. */
  function disegnaPelle(lato, nome, danno, prof) {
    const p = parti[nome], cv = lati[lato].tele[nome], cx = cv.getContext("2d");
    const out = cx.createImageData(p.w, p.h);
    const seed = p.loc.length * 31 + p.loc.charCodeAt(p.loc.length - 1) + (lato === "p" ? 0 : 97);
    const soglia = prof > 0 ? 1 - 0.5 * Math.sqrt(prof) : danno > 0 ? 0.1 + 0.9 * danno : 0;   // (continua con il caso sotto: a 0 hp e' 1)
    const r = prof > 0 ? rango(lato, nome, 0) : null, q = quotaPelle(prof);
    const resta = (x, y) => x >= 0 && y >= 0 && x < p.w && y < p.h && r[y * p.w + x] >= q;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      if (!p.px[i + 3]) continue;
      if (r && r[y * p.w + x] < q) continue;                                   // strappata: si vede quello che sta sotto
      const g = GRIGI[p.px[i]] || "b";
      let col = PELLI[lato][g];
      if (g !== "k" && soglia) {
        const v = 0.7 * vn(x / 3, (y + p.y0) / 3, seed) + 0.3 * hash(x, y + p.y0, seed + 7);
        if (v < soglia) col = SANGUE[soglia - v > 0.35 ? "a" : g];
      }
      if (r && ((x > 0 && p.px[i - 4 + 3] && !resta(x - 1, y)) || (x < p.w - 1 && p.px[i + 4 + 3] && !resta(x + 1, y)) ||
                (y > 0 && p.px[i - p.w * 4 + 3] && !resta(x, y - 1)) || (y < p.h - 1 && p.px[i + p.w * 4 + 3] && !resta(x, y + 1))))
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
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      if (!p.ca[i + 3] || r[y * p.w + x] < q) continue;
      const bordo = (x > 0 && p.ca[i - 4 + 3] && !resta(x - 1, y)) || (x < p.w - 1 && p.ca[i + 4 + 3] && !resta(x + 1, y)) ||
                    (y > 0 && p.ca[i - p.w * 4 + 3] && !resta(x, y - 1)) || (y < p.h - 1 && p.ca[i + p.w * 4 + 3] && !resta(x, y + 1));
      const f = bordo ? 0.62 : 1;
      out.data.set([p.ca[i] * f, p.ca[i + 1] * f, p.ca[i + 2] * f, 255], i);
    }
    cx.putImageData(out, 0, 0);
  }

  /* silhouette bianca di un pezzo (per il lampo del colpo) */
  function sagoma(nome) {
    const p = parti[nome], c = document.createElement("canvas");
    c.width = p.w; c.height = p.h;
    const cx = c.getContext("2d"), out = cx.createImageData(p.w, p.h);
    for (let i = 0; i < p.w * p.h; i++) if (p.px[i * 4 + 3]) out.data.set([255, 255, 255, 255], i * 4);
    cx.putImageData(out, 0, 0);
    return c;
  }

  function costruisci(lato) {
    const pup = new Pupazzo.Pupazzo(man);
    const L = {lato, f: lato === "p" ? 1 : -1, O: 0, pup, tele: {}, carne: {}, rk: {}, sag: {}, chiave: {}, prof: {}, lamp: {}, voci: [], nome: "", vest: {}, capelli: null, aspKey: null,
               ko: false, ultimo: null, xNome: 0};
    for (const [nome, p] of Object.entries(parti)) {
      const c = document.createElement("canvas"); c.width = p.w; c.height = p.h;
      L.tele[nome] = c; L.sag[nome] = sagoma(nome);
      L.carne[nome] = c.cloneNode();
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
    S = Math.max(1, Math.min(5, Math.floor((H - BORDO - 26) / man.canvas[1])));
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

  function disegnaFondale() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a1e27"); g.addColorStop(0.7, "#0e1013");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#08090b"; ctx.fillRect(0, pavY, W, H - pavY);
    ctx.fillStyle = colori.line; ctx.fillRect(0, pavY, W, 1);
  }

  /* trasformazione mondo (px sprite, y = 111 sul pavimento) -> schermo, per un combattente (specchiato per la CPU) */
  function mondo(L) {
    const o = scossa.a > 0.01 ? [scossa.x, scossa.y] : [0, 0];
    ctx.setTransform(L.f * S * dpr, 0, 0, S * dpr, (L.O * S + o[0]) * dpr, (pavY - 111 * S + o[1]) * dpr);
  }

  function posaCorpo(b) { return [lerp(b.px, b.x, alpha), lerp(b.py, b.y, alpha), lerp(b.pa, b.a, alpha)]; }

  function disegnaCombattente(L) {
    mondo(L);
    const C = L.pup.corpi;
    for (const v of L.voci) {
      const b = C[v.corpo], [x, y, a] = posaCorpo(b);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(a);
      const tela_ = L.tele[v.nome], pz = parti[v.nome];
      if (L.prof[pz.loc] > 0) {                                                 // locazione in negativo: l'interno sotto la pelle
        if (pz.sk) ctx.drawImage(pz.sk, 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
        ctx.drawImage(L.carne[v.nome], 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
      }
      ctx.drawImage(tela_, 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
      const vs = L.vest[v.nome];                                                // sopra pelle e ferite: pantaloni, poi maglia
      if (vs) for (const o of vs) ctx.drawImage(o.tela, 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
      if (v.nome === "testa" && L.capelli) ctx.drawImage(L.capelli.tela, v.ox + L.capelli.off[0], v.oy + L.capelli.off[1]);
      const lamp = L.lamp[pz.loc];
      if (lamp > 0) {
        ctx.globalAlpha = Math.min(1, lamp * 2.2);
        ctx.drawImage(L.sag[v.nome], 0, v.y0, tela_.width, v.h, v.ox, v.oy, tela_.width, v.h);
      }
      ctx.restore();
    }
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

  function disegnaParticelle() {
    ctx.setTransform(S * dpr, 0, 0, S * dpr, (scossa.a > 0.01 ? scossa.x * dpr : 0), (pavY - 111 * S + (scossa.a > 0.01 ? scossa.y : 0)) * dpr);
    for (const m of macchie) { ctx.fillStyle = m.col; ctx.fillRect(Math.round(m.x), 110.2, m.w, 1); }
    for (const q of particelle) {
      ctx.globalAlpha = Math.min(1, q.vita / q.fade);
      ctx.fillStyle = q.col;
      ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
    }
    ctx.globalAlpha = 1;
  }

  function disegnaProiettili() {
    ctx.setTransform(S * dpr, 0, 0, S * dpr, (scossa.a > 0.01 ? scossa.x * dpr : 0), (pavY - 111 * S + (scossa.a > 0.01 ? scossa.y : 0)) * dpr);
    for (const q of proiettili) {
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
    disegnaFondale();
    for (const L of Object.values(lati)) disegnaOmbra(L);
    disegnaParticelle();
    // chi e' in piedi dietro, chi e' caduto davanti non conta: si disegna prima la CPU, poi il giocatore
    disegnaCombattente(lati.c); disegnaCombattente(lati.p);
    disegnaProiettili();
    for (const L of Object.values(lati)) L.xNome = L.pup.corpi.busto_inf.x;
    disegnaNomi();
  }

  /* ---------------------------------------------------------------------------------------------------- */
  /* simulazione */
  function particella(o) { particelle.push({vita: 1, fade: 0.3, s: 1, g: GRAV, ...o}); if (particelle.length > 500) particelle.shift(); }

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
      q.vita -= dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.y >= 110.5 && q.g > 0) {
        if (q.macchia) { macchie.push({x: q.x, w: 1 + (Math.random() < 0.4), col: q.col}); if (macchie.length > 160) macchie.shift(); }
        particelle.splice(i, 1); continue;
      }
      if (q.vita <= 0) particelle.splice(i, 1);
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
      L.pup.passo(DT);
      for (const k in L.lamp) if (L.lamp[k] > 0) L.lamp[k] = Math.max(0, L.lamp[k] - DT * 3.2);
      // polvere sotto i piedi che scivolano
      const C = L.pup.corpi;
      for (const n of ["piede_dx", "piede_sx"]) {
        if (C[n].terra > 0 && C[n].scivola > 110 && Math.random() < 0.5) polvere(aMondo(L, [C[n].x, 0])[0]);
      }
    }
    avanzaScambio();
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

  function avviaScambio(ev) {
    const att = lati[ev.chi === "p" ? "p" : "c"], dif = lati[ev.chi === "p" ? "c" : "p"];
    const par = parametri(ev);
    const colpito = ev.esito === "colpito", parato = ev.esito === "parato";
    const locB = ev.split ? "busto" : (colpito ? ev.loc : (ev.loc_att || ev.loc || "busto"));
    const forza = colpito ? Math.max(0.06, (ev.hp_persi || 0) / 90) : 0;
    const protesi = !!ev.protesi;
    scambio = {t: 0, fine: false, ev};
    // dove mirare: il davanti della locazione (per le parate, un poco piu' fuori, dove arrivera' l'avambraccio)
    const davanti = () => dif.pup.fronte(locB);
    const punto = () => daMondo(att, aMondo(dif, parato ? [davanti()[0] + 8, davanti()[1]] : davanti()));

    const reazione = () => {                                    // la difesa parte un istante prima del colpo
      if (colpito) return;
      if (parato) dif.pup.para({mano: "dx", punto: () => { const d = davanti(); return [d[0] + 5, d[1]]; }});
      else dif.pup.schiva(tipoSchivata(locB));
    };

    const contatto = (info) => {                                // la mano (o il proiettile) arriva
      const pW = info ? aMondo(att, [info.x, info.y]) : aMondo(dif, davanti());   // punto d'impatto nel mondo
      const punta = daMondo(dif, pW);                                            // ...e nel sistema del difensore
      if (colpito) {
        const dir = [-1, -0.14 - 0.08 * Math.random()];
        if (ev.ucciso) {
          dif.pup.muori(forza, dir); dif.ko = true;
          rallenta = 0.3; rallentaT = 0.5;                       // il colpo di grazia in ralenti (tempo reale)
        } else dif.pup.colpisci(ev.split ? "busto" : ev.loc, forza, dir, punta[0], punta[1]);
        dif.ultimo = {forza};
        for (const p of Object.values(parti)) if (ev.split || p.loc === ev.loc) dif.lamp[p.loc] = 1;
        schizzi(pW, [dif.f * -1, -0.25], forza, protesi || !(ev.hp_persi > 0));          // senza danno: scintille, non sangue
        stella(pW, forza > 0.5 ? "#ffffff" : "#ffe9a0", 8, 130 + 120 * Math.min(1, forza));
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
    if (!par.dist) {
      o.alContatto = contatto;
    } else {
      // a distanza: al rilascio parte un proiettile, che arriva dopo un tempo di volo
      o.alColpoInizio = () => {
        const da = aMondo(att, att.pup._polso(o.mano)), a = aMondo(dif, davanti());
        const dx = a[0] - da[0], dy = a[1] - da[1], d = Math.hypot(dx, dy), vel = 650, tv = Math.max(0.11, d / vel);
        proiettili.push({x: da[0], y: da[1], vx: dx / tv, vy: dy / tv, t: tv, col: COLORI_PROIETTILE[ev.tipo_danno] || "#cfd6e0", scia: []});
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
    if (scambio) { scambio.t += DT; if (scambio.fine || scambio.t > 4) scambio = null; }
    if (!scambio && coda.length) avviaScambio(coda.shift());
    if (!scambio && !coda.length) for (const L of Object.values(lati)) {
      if (L.morteAttesa && !L.ko) { L.ko = true; L.pup.muori((L.ultimo || {forza: 0.5}).forza); }
    }
  }

  /* ---------------------------------------------------------------------------------------------------- */
  /* stato del duello */
  function update(St) {
    arenaEl = arenaEl || document.getElementById("d-arena");
    if (!arenaEl) return;
    if (!parti) {
      if (!update.carico) update.carico = carica().then(() => { update.carico = null; update(St); });
      return;
    }
    ultimoStato = St;
    const primo = !lati.p;
    if (primo) {
      arenaEl.innerHTML = "";
      tela = document.createElement("canvas"); tela.className = "tela";
      arenaEl.appendChild(tela);
      costruisci("p"); costruisci("c");
      new ResizeObserver(adatta).observe(arenaEl);
      adatta(); piazza(); muri();
      ultimoT = 0; requestAnimationFrame(ciclo);
    }
    for (const lato of ["p", "c"]) {
      const pg = lato === "p" ? St.player : St.cpu, L = lati[lato];
      L.nome = pg.nome;
      const chiaveAsp = JSON.stringify(pg.aspetto || null);
      if (L.aspKey !== chiaveAsp) { L.aspKey = chiaveAsp; applicaAspetto(lato, pg.aspetto); L.chiave = {}; }
      for (const [nome, p] of Object.entries(parti)) {
        const h = pg.hp[p.loc];
        const danno = !h || h.protesi ? 0 : Math.min(1, Math.max(0, 1 - h.val / h.max));   // le protesi non sanguinano
        const prof = !h || h.protesi ? 0 : Math.min(1, Math.max(0, -h.val / h.max));        // ...e non si strappano
        const chiave = danno + "|" + prof;
        if (L.chiave[nome] !== chiave) {
          L.chiave[nome] = chiave; L.prof[p.loc] = prof;
          disegnaPelle(lato, nome, danno, prof); disegnaCarne(lato, nome, prof);
          disegnaVestiti(lato, nome, Math.min(1, danno / 0.85));               // a 15% degli hp l'indumento e' tutto strappato
          if (nome === "testa") disegnaCapelli(lato, prof);
        }
      }
      for (const loc of Object.keys(Pupazzo.LOC)) {
        const h = pg.hp[loc];
        L.pup.storpia(loc, !!(h && h.crippled), primo);
      }
      const morto = pg.hp.testa.val <= 0 || pg.hp.busto.val <= 0;
      if (morto && !L.ko) {
        if (primo) { L.ko = true; L.pup.muori((L.ultimo || {forza: 0.5}).forza); L.pup.assesta(300); }   // duello gia' finito: subito a terra
        else L.morteAttesa = true;       // cade quando gli scambi in corso sono finiti (di norma lo fa il colpo di grazia)
      }
    }
    if (primo) for (const L of Object.values(lati)) L.pup.assesta(40);
  }

  /* un colpo nuovo: si mette in coda e si recita quando tocca (uno alla volta) */
  function colpo(ev) {
    if (!lati.p) return;
    const pg = ultimoStato && (ev.chi === "p" ? ultimoStato.cpu : ultimoStato.player);
    ev.protesi = !!(pg && pg.hp[ev.loc] && pg.hp[ev.loc].protesi);      // le protesi scintillano invece di sanguinare
    coda.push(ev);
    if (coda.length > 6) { const v = coda.shift(); /* troppi arretrati (scheda nascosta): si salta la scena */
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
      const c = ev.tipo === "potere" ? "#b86bff" : "#7be0ff";
      futuro(0.3, () => {
        const x = att.O + att.f * att.pup.corpi.busto_sup.x;
        for (let i = 0; i < 14; i++) particella({x: x + (Math.random() - 0.5) * 18, y: 100 - Math.random() * 20, vx: (Math.random() - 0.5) * 30,
                                                 vy: -40 - Math.random() * 90, s: 1, vita: 0.7, fade: 0.4, col: c, g: -40});
      });
    }
  }

  function passi(n) {
    for (let i = 0; i < n; i++) passo();
    alpha = 1; disegna();
  }

  /* ricostruisce da zero i due combattenti (per il laboratorio: una scena dopo l'altra) */
  function reset(St) {
    coda.length = futuri.length = particelle.length = macchie.length = proiettili.length = 0;
    scambio = null; congela = 0; rallenta = 1; rallentaT = 0; scossa.a = 0; acc = 0;
    costruisci("p"); costruisci("c");
    adatta();
    update(St);
  }

  /* per la diagnostica */
  const stato = () => ({coda: coda.length, scambio: scambio && {t: scambio.t, fine: scambio.fine, esito: scambio.ev.esito}, congela, rallenta, futuri: futuri.length, particelle: particelle.length});

  return {update, reset, colpo, evento, passi, disegna, stato, lati: () => lati, particella, scuoti: a => { scossa.a = Math.max(scossa.a, a); }};
})();
