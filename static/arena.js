/* Urban — arena del duello: due combattenti fatti di sprite articolati (static/sprites/maschio/parti.json),
   sangue per locazione che cresce col danno, animazioni di colpo e crollo a ragdoll.
   API: Arena.update(S), Arena.colpo(ev). */
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
  const lati = {};                  // "p" | "c" -> {fighter, fx, cv, el, danno, ko}
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
  const RIPOSO = () => Object.fromEntries(Object.entries(man.giunti).map(([k, [x, y]]) => [k, {x, y}]));
  function posa(L, pt) {
    for (const [nome, p] of Object.entries(man.parti)) {
      const A = pt[p.da], B = pt[p.a], A0 = man.giunti[p.da], B0 = man.giunti[p.a];
      const th = Math.atan2(B.y - A.y, B.x - A.x) - Math.atan2(B0[1] - A0[1], B0[0] - A0[0]);
      L.el[nome].style.transform =
        `translate(${A.x}px,${A.y}px) rotate(${th}rad) translate(${-p.perno[0]}px,${-p.perno[1]}px)`;
    }
  }

  /* ---------- ragdoll: scheletro a particelle (verlet) con ossa rigide, limiti di piegatura e pavimento ---------- */
  const GRAVITA = 0.3, PAVIMENTO = 111;
  const RAGGIO = {cima: 8, collo_alto: 4, vita: 6, anca: 6, anca_dx: 6, anca_sx: 6, spalla_dx: 4, spalla_sx: 4,
                  gomito_dx: 3, gomito_sx: 3, polso_dx: 3, polso_sx: 3, ginocchio_dx: 4, ginocchio_sx: 4,
                  caviglia_dx: 8, caviglia_sx: 8};
  const GRUPPI_RIGIDI = [["vita", "anca", "anca_dx", "anca_sx"], ["vita", "collo_alto", "spalla_dx", "spalla_sx"]];
  const LIMITI = [["cima", "vita", 0.75], ["collo_alto", "anca", 0.7], ["spalla_dx", "polso_dx", 0.3],
                  ["spalla_sx", "polso_sx", 0.3], ["anca_dx", "caviglia_dx", 0.5], ["anca_sx", "caviglia_sx", 0.5]];

  function ragdoll(L, istantaneo) {
    const P = {};
    for (const [k, [x, y]] of Object.entries(man.giunti)) P[k] = {x, y, px: x, py: y, r: RAGGIO[k] || 3};
    const dist = (a, b) => Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y);
    const vinc = [];                                    // [a, b, lunghezza, minimo?]
    const rigido = (a, b) => vinc.push([a, b, dist(a, b), false]);
    Object.values(man.parti).forEach(p => rigido(p.da, p.a));
    GRUPPI_RIGIDI.forEach(g => g.forEach((a, i) => g.slice(i + 1).forEach(b => rigido(a, b))));
    LIMITI.forEach(([a, b, f]) => vinc.push([a, b, dist(a, b) * f, true]));

    // il colpo di grazia spinge la parte alta indietro (-x: gli sprite guardano a destra), le ginocchia cedono in avanti
    for (const k of ["cima", "collo_alto", "spalla_dx", "spalla_sx", "polso_dx", "polso_sx"]) P[k].px += 3;
    P.cima.px += 1.2; P.vita.px += 1.5; P.anca.px += 0.8;
    P.ginocchio_dx.px -= 1.2; P.ginocchio_sx.px -= 1; P.caviglia_dx.px -= 3; P.caviglia_sx.px -= 2.6;   // i piedi scivolano avanti

    const passo = () => {
      for (const p of Object.values(P)) {
        const vx = (p.x - p.px) * 0.995, vy = (p.y - p.py) * 0.995;
        p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + GRAVITA;
      }
      for (let it = 0; it < 12; it++) {
        for (const [a, b, len, min] of vinc) {
          const A = P[a], B = P[b];
          const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1e-6;
          if (min && d >= len) continue;
          const f = (d - len) / d * 0.5;
          A.x += dx * f; A.y += dy * f; B.x -= dx * f; B.y -= dy * f;
        }
        for (const p of Object.values(P)) {
          if (p.y > PAVIMENTO - p.r) { p.y = PAVIMENTO - p.r; p.x += (p.px - p.x) * 0.03; }
        }
      }
    };
    const fermo = () => Object.values(P).every(p => Math.hypot(p.x - p.px, p.y - p.py) < 0.03);

    if (istantaneo) {
      for (let i = 0; i < 400 && !(i > 60 && fermo()); i++) passo();
      posa(L, P);
      return;
    }
    let ultimo = performance.now(), acc = 0, quieto = 0, n = 0;
    const frame = (t) => {
      acc += Math.min(100, t - ultimo); ultimo = t;
      while (acc >= 1000 / 60) { passo(); acc -= 1000 / 60; n++; quieto = fermo() ? quieto + 1 : 0; }
      posa(L, P);
      if (quieto < 20 && n < 420) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function costruisci(lato) {
    const slot = document.createElement("div");
    slot.className = "f-slot";
    slot.innerHTML = `<div class="f-nome b-${lato}"></div>
      <div class="fighter f-${lato}"><div class="scala"><div class="idle"><div class="fx"></div></div></div></div>`;
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
    lati[lato] = {fighter: slot.querySelector(".fighter"), fx, cv, el, danno: {}, ko: false, nome: slot.querySelector(".f-nome")};
    arenaEl.appendChild(slot);
    posa(lati[lato], RIPOSO());
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
    }
    for (const lato of ["p", "c"]) {
      const pg = lato === "p" ? S.player : S.cpu, L = lati[lato];
      L.nome.textContent = pg.nome;
      for (const [nome, p] of Object.entries(parti)) {
        const h = pg.hp[p.loc];
        // le protesi non sanguinano
        const danno = !h || h.protesi ? 0 : Math.min(1, Math.max(0, 1 - h.val / h.max));
        if (L.danno[nome] !== danno) { L.danno[nome] = danno; disegna(lato, nome, danno); }
      }
      const perso = S.finito && (lato === "p") === !S.vinto_dal_player;
      if (perso && !L.ko) {
        L.ko = true;
        // duello gia' finito al caricamento: subito a terra; altrimenti il colpo di grazia fa in tempo a finire
        if (primo) { L.fighter.classList.add("ko"); ragdoll(L, true); }
        else setTimeout(() => { L.fighter.classList.add("ko"); ragdoll(L, false); }, 450);
      }
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
