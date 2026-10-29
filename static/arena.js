/* Urban — arena del duello: due combattenti fatti di sprite separati (static/sprites/maschio),
   sangue per locazione che cresce col danno, animazioni di colpo. API: Arena.update(S), Arena.colpo(ev). */
const Arena = (() => {
  const BASE = "/static/sprites/maschio/";
  // i 5 grigi dello sprite base (canale R) -> chiave; la skin e il sangue sono mappe sulle stesse chiavi
  const GRIGI = {38: "k", 106: "a", 142: "b", 178: "c", 216: "d"};
  const PELLI = {
    p: {k: [42, 26, 20], a: [168, 105, 63], b: [201, 138, 91], c: [224, 169, 121], d: [243, 201, 160]},
    c: {k: [30, 22, 28], a: [118, 84, 98], b: [150, 112, 124], c: [182, 144, 150], d: [214, 178, 178]},
  };
  const SANGUE = {a: [107, 13, 24], b: [163, 17, 31], c: [201, 32, 44], d: [232, 64, 74]};

  let parti = null;                 // loc -> {x, y, z, w, h, px}
  let tela = [48, 111];
  const lati = {};                  // "p" | "c" -> {slot, fx, cv: {loc: canvas}, danno: {loc: n}}
  let arenaEl = null;

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

  async function carica() {
    const man = await (await fetch(BASE + "parti.json")).json();
    tela = man.canvas;
    const lista = await Promise.all(Object.entries(man.parti).map(([loc, p]) => new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        res([loc, {...p, w: img.width, h: img.height, px: ctx.getImageData(0, 0, img.width, img.height).data}]);
      };
      img.src = BASE + p.file;
    })));
    parti = Object.fromEntries(lista);
  }

  /* skin + sangue: una macchia di rumore decide quali pixel sono sporchi, `danno` (0..1) alza la soglia */
  function disegna(lato, loc, danno) {
    const p = parti[loc], cv = lati[lato].cv[loc], ctx = cv.getContext("2d");
    const out = ctx.createImageData(p.w, p.h);
    const seed = loc.length * 31 + loc.charCodeAt(loc.length - 1) + (lato === "p" ? 0 : 97);
    const soglia = danno > 0 ? 0.1 + 0.9 * danno : 0;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      if (!p.px[i + 3]) continue;
      const g = GRIGI[p.px[i]] || "b";
      let col = PELLI[lato][g];
      if (g !== "k" && soglia) {
        const v = 0.7 * vn(x / 3, y / 3, seed) + 0.3 * hash(x, y, seed + 7);
        if (v < soglia) col = SANGUE[soglia - v > 0.35 ? "a" : g];
      }
      out.data.set([col[0], col[1], col[2], 255], i);
    }
    ctx.putImageData(out, 0, 0);
  }

  function costruisci(lato) {
    const slot = document.createElement("div");
    slot.className = "f-slot";
    slot.innerHTML = `<div class="f-nome b-${lato}"></div>
      <div class="fighter f-${lato}"><div class="idle"><div class="fx"></div></div></div>`;
    const fx = slot.querySelector(".fx");
    const cv = {};
    for (const [loc, p] of Object.entries(parti).sort((a, b) => a[1].z - b[1].z)) {
      const d = document.createElement("div");
      d.className = "parte";
      d.dataset.loc = loc;
      d.style.cssText = `left:calc(var(--s) * ${p.x}px);top:calc(var(--s) * ${p.y}px);` +
        `width:calc(var(--s) * ${p.w}px);height:calc(var(--s) * ${p.h}px);z-index:${p.z}`;
      const c = document.createElement("canvas");
      c.width = p.w; c.height = p.h;
      d.appendChild(c);
      fx.appendChild(d);
      cv[loc] = c;
    }
    lati[lato] = {slot, fx, cv, danno: {}};
    arenaEl.appendChild(slot);
  }

  // scala intera dei pixel: la piu' grande che entra nell'altezza disponibile
  function adatta() {
    if (!arenaEl) return;
    const s = Math.max(1, Math.min(5, Math.floor((arenaEl.clientHeight - 40) / tela[1])));
    arenaEl.style.setProperty("--s", s);
  }

  function update(S) {
    arenaEl = arenaEl || document.getElementById("d-arena");
    if (!arenaEl) return;
    if (!parti) {
      if (!update.carico) update.carico = carica().then(() => { update.carico = null; update(S); });
      return;
    }
    if (!lati.p) {
      arenaEl.innerHTML = "";
      costruisci("p"); costruisci("c");
      new ResizeObserver(adatta).observe(arenaEl);
      adatta();
    }
    for (const lato of ["p", "c"]) {
      const pg = lato === "p" ? S.player : S.cpu, L = lati[lato];
      L.slot.querySelector(".f-nome").textContent = pg.nome;
      for (const loc of Object.keys(parti)) {
        const h = pg.hp[loc];
        // le protesi non sanguinano
        const danno = !h || h.protesi ? 0 : Math.min(1, Math.max(0, 1 - h.val / h.max));
        if (L.danno[loc] !== danno) { L.danno[loc] = danno; disegna(lato, loc, danno); }
      }
      const perso = S.finito && (lato === "p") === !S.vinto_dal_player;
      L.fx.classList.toggle("ko", !!perso);
    }
  }

  const anima = (el, cl) => {
    el.classList.remove("attacca", "colpito", "schiva");
    void el.offsetWidth;
    el.classList.add(cl);
  };

  /* un colpo nuovo: chi attacca scatta in avanti, chi difende incassa (e la parte colpita lampeggia) o scarta */
  function colpo(ev) {
    if (!lati.p) return;
    const att = lati[ev.chi === "p" ? "p" : "c"], dif = lati[ev.chi === "p" ? "c" : "p"];
    anima(att.fx, "attacca");
    if (ev.esito === "colpito" && ev.hp_persi > 0) {
      anima(dif.fx, "colpito");
      const bersagli = ev.split ? dif.fx.querySelectorAll(".parte") : dif.fx.querySelectorAll(`.parte[data-loc="${ev.loc}"]`);
      bersagli.forEach(b => {
        b.classList.remove("lampeggia"); void b.offsetWidth; b.classList.add("lampeggia");
      });
    } else {
      anima(dif.fx, "schiva");
    }
  }

  return {update, colpo};
})();
