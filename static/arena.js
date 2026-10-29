/* Urban — arena del duello: due combattenti fatti di sprite articolati (static/sprites/maschio/parti.json),
   sangue per locazione che cresce col danno e fisica dei corpi (static/fisica.js): i colpi sono impulsi,
   le locazioni storpiate fanno il ragdoll, da morti si crolla. API: Arena.update(S), Arena.colpo(ev). */
const Arena = (() => {
  const BASE = "/static/sprites/maschio/";
  // i 5 grigi dello sprite base (canale R) -> chiave; la skin e il sangue sono mappe sulle stesse chiavi
  const GRIGI = {38: "k", 106: "a", 142: "b", 178: "c", 216: "d"};
  const PELLI = {
    p: {k: [42, 26, 20], a: [168, 105, 63], b: [201, 138, 91], c: [224, 169, 121], d: [243, 201, 160]},
    c: {k: [30, 22, 28], a: [118, 84, 98], b: [150, 112, 124], c: [182, 144, 150], d: [214, 178, 178]},
  };
  const SANGUE = {a: [107, 13, 24], b: [163, 17, 31], c: [201, 32, 44], d: [232, 64, 74]};

  let man = null;                   // parti.json
  let parti = null;                 // nome -> {...manifest, w, h, px}
  const lati = {};                  // "p" | "c" -> {fx, cv, el, danno, ko, ultimo, sk}
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
    man = await (await fetch(BASE + "parti.json")).json();
    const lista = await Promise.all(Object.entries(man.parti).map(([nome, p]) => new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        res([nome, {...p, w: img.width, h: img.height, px: ctx.getImageData(0, 0, img.width, img.height).data}]);
      };
      img.src = BASE + p.file;
    })));
    parti = Object.fromEntries(lista);
  }

  /* skin + sangue: una macchia di rumore decide quali pixel sono sporchi, `danno` (0..1) alza la soglia.
     Il rumore e' calcolato sulle coordinate dello sprite intero (y0), cosi' le due meta' di un arto sono continue. */
  function disegna(lato, nome, danno) {
    const p = parti[nome], cv = lati[lato].cv[nome], ctx = cv.getContext("2d");
    const out = ctx.createImageData(p.w, p.h);
    const seed = p.loc.length * 31 + p.loc.charCodeAt(p.loc.length - 1) + (lato === "p" ? 0 : 97);
    const soglia = danno > 0 ? 0.1 + 0.9 * danno : 0;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      if (!p.px[i + 3]) continue;
      const g = GRIGI[p.px[i]] || "b";
      let col = PELLI[lato][g];
      if (g !== "k" && soglia) {
        const v = 0.7 * vn(x / 3, (y + p.y0) / 3, seed) + 0.3 * hash(x, y + p.y0, seed + 7);
        if (v < soglia) col = SANGUE[soglia - v > 0.35 ? "a" : g];
      }
      out.data.set([col[0], col[1], col[2], 255], i);
    }
    ctx.putImageData(out, 0, 0);
  }

  /* ogni pezzo va dal giunto `da` al giunto `a`: lo sprite viene ruotato di quanto ruota quell'osso rispetto
     alla posa a riposo e appeso al giunto `da` per il suo perno. A riposo la rotazione e' 0. */
  function posa(L, pt) {
    for (const [nome, p] of Object.entries(man.parti)) {
      const A = pt[p.da], B = pt[p.a], A0 = man.giunti[p.da], B0 = man.giunti[p.a];
      let th = Math.atan2(B.y - A.y, B.x - A.x) - Math.atan2(B0[1] - A0[1], B0[0] - A0[0]);
      th = Math.atan2(Math.sin(th), Math.cos(th));                  // sempre l'angolo piu' corto
      // posizioni intere e rotazione "a scatti" (~3 gradi) con isteresi: un pezzo fermo non brilla di rotazioni
      // da frazioni di pixel, e al minimo tremolio della fisica non cambia nulla
      let q = L.ang[nome] ?? 0;
      if (Math.abs(th - q) > 0.03) q = Math.round(th / 0.05) * 0.05;
      L.ang[nome] = q;
      const t = `translate(${Math.round(A.x)}px,${Math.round(A.y)}px) rotate(${q.toFixed(2)}rad) translate(${-p.perno[0]}px,${-p.perno[1]}px)`;
      if (L.cache[nome] !== t) { L.cache[nome] = t; L.el[nome].style.transform = t; }
    }
  }

  function costruisci(lato) {
    const slot = document.createElement("div");
    slot.className = "f-slot";
    slot.innerHTML = `<div class="f-nome b-${lato}"></div>
      <div class="fighter f-${lato}"><div class="scala"><div class="fx"></div></div></div>`;
    const fx = slot.querySelector(".fx");
    const cv = {}, el = {};
    for (const [nome, p] of Object.entries(parti).sort((a, b) => a[1].z - b[1].z)) {
      const d = document.createElement("div");
      d.className = "parte";
      d.dataset.loc = p.loc;
      d.style.cssText = `width:${p.w}px;height:${p.h}px;z-index:${p.z}`;
      const c = document.createElement("canvas");
      c.width = p.w; c.height = p.h;
      d.appendChild(c);
      fx.appendChild(d);
      cv[nome] = c; el[nome] = d;
    }
    const ossa = Object.values(man.parti).map(p => [p.da, p.a]);
    lati[lato] = {fx, cv, el, cache: {}, ang: {}, danno: {}, ko: false, ultimo: null, nome: slot.querySelector(".f-nome"),
                  fighter: slot.querySelector(".fighter"), sk: new Fisica.Scheletro(man.giunti, ossa)};
    arenaEl.appendChild(slot);
    posa(lati[lato], lati[lato].sk.P);
  }

  /* un solo ciclo per entrambi: passi di fisica a 60 Hz fissi, poi si posano gli sprite */
  let ultimoT = 0, acc = 0;
  function ciclo(t) {
    acc += Math.min(100, t - ultimoT); ultimoT = t;
    while (acc >= 1000 / 60) { Object.values(lati).forEach(L => L.sk.passo()); acc -= 1000 / 60; }
    Object.values(lati).forEach(L => posa(L, L.sk.P));
    requestAnimationFrame(ciclo);
  }

  /* i muri della finestra: dietro il bordo dell'arena, davanti la linea di mezzo (i due non si attraversano).
     Si passano alla fisica nelle coordinate dello sprite di ciascuno (la CPU e' specchiata). */
  function muri() {
    const s = parseFloat(arenaEl.style.getPropertyValue("--s")) || 2;
    const A = arenaEl.getBoundingClientRect(), centro = (A.left + A.right) / 2;
    if (A.width < 100) return;                      // arena nascosta o non ancora impaginata: si tengono i muri di prima
    for (const [lato, L] of Object.entries(lati)) {
      const r = L.fighter.getBoundingClientRect();
      const locale = lato === "p" ? X => (X - r.left) / s : X => (r.right - X) / s;
      const dietro = locale(lato === "p" ? A.left + 1 : A.right - 1), davanti = locale(centro);
      // margini: gli sprite escono dalle giunture (schiena, mani, piedi lunghi 15 px verso l'avversario)
      const lo = Math.min(dietro, davanti) + 8, hi = Math.max(dietro, davanti) - 14;
      L.sk.muri(Math.min(lo, hi), Math.max(lo, hi));
    }
  }

  // scala intera dei pixel: la piu' grande che entra nell'altezza dell'arena (che dipende solo dalla finestra)
  function adatta() {
    const s = Math.max(1, Math.min(4, Math.floor((arenaEl.clientHeight - 44) / man.canvas[1])));
    arenaEl.style.setProperty("--s", s);
    muri();
  }

  function update(S) {
    arenaEl = arenaEl || document.getElementById("d-arena");
    if (!arenaEl) return;
    if (!parti) {
      if (!update.carico) update.carico = carica().then(() => { update.carico = null; update(S); });
      return;
    }
    const primo = !lati.p;
    if (primo) {
      arenaEl.innerHTML = "";
      costruisci("p"); costruisci("c");
      new ResizeObserver(adatta).observe(arenaEl);
      adatta();
      ultimoT = performance.now();
      requestAnimationFrame(ciclo);
    }
    let nomi = false;
    for (const lato of ["p", "c"]) {
      const pg = lato === "p" ? S.player : S.cpu, L = lati[lato];
      if (L.nome.textContent !== pg.nome) { L.nome.textContent = pg.nome; nomi = true; }
      for (const [nome, p] of Object.entries(parti)) {
        const h = pg.hp[p.loc];
        // le protesi non sanguinano
        const danno = !h || h.protesi ? 0 : Math.min(1, Math.max(0, 1 - h.val / h.max));
        if (L.danno[nome] !== danno) { L.danno[nome] = danno; disegna(lato, nome, danno); }
      }
      // una locazione storpiata perde i muscoli e fa il ragdoll da sola; il resto del corpo resta in piedi
      for (const loc of Object.keys(Fisica.LOC)) {
        const h = pg.hp[loc];
        L.sk.storpia(loc, !!(h && h.crippled), primo);
      }
      // si cade a terra solo da morti (testa o busto a zero): una resa lascia in piedi
      const morto = pg.hp.testa.val <= 0 || pg.hp.busto.val <= 0;
      if (morto && !L.ko) {
        L.ko = true;
        const u = L.ultimo || {loc: "busto", dmg: 30};
        // duello gia' finito al caricamento: subito a terra; altrimenti il colpo di grazia fa in tempo ad arrivare
        if (primo) L.sk.muori(u.dmg);
        else setTimeout(() => L.sk.muori(u.dmg), 350);
      }
    }
    // i nomi allargano gli slot e spostano i combattenti: i muri vanno ricalcolati PRIMA di far assestare i corpi
    if (nomi) muri();
    if (primo) for (const lato of ["p", "c"]) {
      const pg = lato === "p" ? S.player : S.cpu;
      lati[lato].sk.assesta(pg.hp.testa.val <= 0 || pg.hp.busto.val <= 0 ? 320 : 160);   // la posa iniziale e' gia' quella giusta (arti storpi, a terra...)
    }
  }

  /* un colpo nuovo, in fisica: chi attacca si sporge, chi difende riceve un impulso proporzionale al danno
     sulla locazione colpita (e la parte lampeggia), oppure schiva con un saltello o para */
  function colpo(ev) {
    if (!lati.p) return;
    const att = lati[ev.chi === "p" ? "p" : "c"], dif = lati[ev.chi === "p" ? "c" : "p"];
    // a distanza si punta e si sente il rinculo; in mischia si fa un passo avanti (meno a ogni colpo di una raffica)
    if ((ev.info && ev.info.tags || []).some(t => /distanza/i.test(t))) att.sk.spara();
    else att.sk.affonda(1 / Math.sqrt(Math.max(1, ev.colpi || 1)));
    if (ev.esito === "colpito" && ev.hp_persi > 0) {
      dif.sk.colpisci(ev.loc, ev.hp_persi, !!ev.split);
      dif.ultimo = {loc: ev.loc, dmg: ev.hp_persi};
      const bersagli = ev.split ? dif.fx.querySelectorAll(".parte") : dif.fx.querySelectorAll(`.parte[data-loc="${ev.loc}"]`);
      bersagli.forEach(b => {
        b.classList.remove("lampeggia"); void b.offsetWidth; b.classList.add("lampeggia");
      });
    } else if (ev.esito === "schivato") {
      dif.sk.schiva();
    } else {
      dif.sk.para();
    }
  }

  /* avanza la fisica a mano di n passi (un browser che non ridisegna, come quello dei test, non fa girare il ciclo) */
  function passi(n) {
    for (let i = 0; i < n; i++) Object.values(lati).forEach(L => L.sk.passo());
    Object.values(lati).forEach(L => posa(L, L.sk.P));
  }

  return {update, colpo, passi};
})();
