/* Urban — la scena della palestra: gli allievi della giornata che si allenano davvero, con gli stessi corpi del ring.
   Ogni allievo e' un combattente fisico (static/pupazzo.js, disegnato da static/arena.js con il suo aspetto, le sue ferite,
   i vestiti che si strappano): colpisce un sacco appeso che oscilla (un pendolo del motore fisico), fa sparring con un
   compagno, solleva un bilanciere, salta la corda, studia puntando alla lavagna, scarica il suo potere, o riposa.
   La scena non decide nulla: racconta quello che il server ha stabilito per OGGI (palestra.vista(): per ogni allievo l'attivita'
   di oggi, la voce che allena, il compagno di sparring). API: ScenaPalestra.crea(elemento, {alClick}) -> scena;
   scena.aggiorna(vista) a ogni cambio di stato; scena.passi(n) per i test. Gli oggetti (sprite) sono in
   static/sprites/palestra/ (manifest: oggetti.json); se mancano si disegna un segnaposto. */
const ScenaPalestra = (() => {
  const K = Arena.kit;
  const DT = K.DT;
  const BASE = "/static/sprites/palestra/";
  const XB = 25;               // x locale del bacino a riposo (px sprite)
  const PISTA = 111;           // y del pavimento
  const BORDO = 14;            // la fascia del pavimento in fondo alla tela (px schermo: v. arena.js)
  const STANDOFF = 50;         // distanza tra il bacino di chi colpisce e il centro del sacco
  const DISTANZA = 58;         // tra i bacini di due che fanno sparring
  const rnd = (a, b) => a + Math.random() * (b - a);
  const scegli = (v) => v[Math.floor(Math.random() * v.length)];
  const lim = (x, a, b) => Math.min(b, Math.max(a, x));
  const GALLERIA = [];         // (per i test) le scene create

  /* ------------------------------------------------------------------------------------------ oggetti (sprite) */
  let manifesto = null;
  const ogg = {};
  async function caricaOggetti() {
    if (manifesto) return;
    try { manifesto = await (await fetch(BASE + "oggetti.json")).json(); } catch (e) { manifesto = {}; }
    await Promise.all(Object.entries(manifesto).map(([id, o]) => new Promise(res => {
      const img = new Image();
      img.onload = () => { ogg[id] = {...o, img}; res(); };
      img.onerror = () => { ogg[id] = {...o, img: null}; res(); };
      img.src = BASE + o.file;
    })));
  }

  /* ------------------------------------------------------------------------------------------ il sacco: un pendolo fisico */
  class Sacco {
    constructor(x) {
      this.x = x; this.lung = 70; this.cima = -30;                    // pivot alla quota del soffitto
      this.mondo = new Fisica.Mondo({pavimento: 1e9});
      const ancora = this.mondo.corpo({x, y: this.cima, m: 1, I: 1, statico: true});
      this.m = 34;
      this.corpo = this.mondo.corpo({x, y: this.cima + this.lung, m: this.m, I: Fisica.asta(50, this.m, 8) * 1.3,
                                      forme: [{ax: 0, ay: -20, bx: 0, by: 20, r: 8}]});
      this.corpo.dmpA = 0.5; this.corpo.dmpL = 0.12;
      this.mondo.giunto(ancora, this.corpo, [0, 0], [0, -this.lung], {attrito: 3});
    }
    passo(dt) { this.mondo.passo(dt); }
    /* la x e la y del sacco, alla quota di `y` (per mirarci) */
    colpisci(wx, wy, v) { this.mondo.impulso(this.corpo, wx, wy, this.m * v, 0); }
    disegna(ctx) {
      const b = this.corpo, a = b.a, o = ogg.sacco;
      ctx.save();
      ctx.translate(this.x, this.cima); ctx.rotate(a);
      ctx.strokeStyle = "#5c6470"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, this.lung - 20); ctx.stroke();           // la catena
      ctx.setLineDash([1, 1.5]); ctx.strokeStyle = "#8d96a3"; ctx.beginPath(); ctx.moveTo(0.5, 0); ctx.lineTo(0.5, this.lung - 20); ctx.stroke(); ctx.setLineDash([]);
      if (o && o.img) ctx.drawImage(o.img, -o.perno[0], this.lung - 20 - o.perno[1]);
      else { ctx.fillStyle = "#7a2e2e"; ctx.fillRect(-8, this.lung - 22, 16, 44); }
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------------------------------ la scena */
  class Scena {
    constructor(el, opz = {}) {
      this.el = el; this.opz = opz;
      this.allievi = new Map();           // pid -> allievo
      this.istruttori = new Map();
      this.stato = null; this.layoutKey = "";
      this.t = 0; this.acc = 0; this.ultimo = 0; this.alpha = 1;
      this.sacco = null; this.coppie = new Map();
      this.pezzi = {pavimento: [], muro: []};
      this.caduti = [];
      this.attivo = true; this.hover = null;
      this.zz = [];                        // i "z" di chi dorme
      this.pos = {};                       // postazioni: nome -> x centrale
    }

    async avvia() {
      await Promise.all([K.pronto(), caricaOggetti()]);
      // la scala (1 pixel di sprite = S pixel di schermo) la sceglie lo spazio: piu' alta quanto piu' e' alta e larga la scena (sprite interi: niente sbavature).
      // Il pavimento e' BORDO px, il soffitto sta 141 px di sprite sopra (PISTA + 30): si concede di tagliarne un po' (40 px) pur di ingrandire; la larghezza
      // chiede almeno 440 px di sprite per le postazioni, sotto si stringono (v. sistema)
      this.tela = K.apriTela(this.el, {scala: (W, H) => Math.max(1, Math.min(Math.floor((H - BORDO + 40) / (PISTA + 30)), Math.floor(W / 380))),
                                       alResize: () => { this.layoutKey = ""; this.sistema(); }});
      this.tela.style.cursor = "default";
      this.tela.addEventListener("mousemove", (e) => { const p = this.sotto(e); this.hover = p; this.tela.style.cursor = p != null ? "pointer" : "default"; });
      this.tela.addEventListener("mouseleave", () => { this.hover = null; });
      this.tela.addEventListener("click", (e) => { const p = this.sotto(e); if (p != null && this.opz.alClick) this.opz.alClick(p); });
      this.rafId = requestAnimationFrame((ts) => this.ciclo(ts));
      return this;
    }

    /* la pagina e' parcheggiata (nav.js) o ritorna: la simulazione si ferma e riparte senza salti di tempo */
    pausa() { this.attivo = false; cancelAnimationFrame(this.rafId); }
    riprendi() {
      if (this.attivo) return;
      this.attivo = true; this.ultimo = 0; this.acc = 0;
      this.rafId = requestAnimationFrame((ts) => this.ciclo(ts));
    }

    distruggi() { this.attivo = false; cancelAnimationFrame(this.rafId); for (const a of [...this.allievi.values(), ...this.istruttori.values()]) K.rimuovi(a.chiave); }

    /* ---- il pavimento e le postazioni: dove si fa cosa, in funzione degli attrezzi che ci sono ---- */
    sistema() {
      const V = K.vista(); if (!V.ctx || !this.stato) return;
      const att = new Set(this.stato.attrezzi);
      const larg = [["sacco", 92], ...(att.has("pesi") ? [["pesi", 66]] : []), ...(att.has("manichino") ? [["manichino", 58]] : []),
                    ...(att.has("camera_controllo") ? [["camera", 74]] : []), ["tatami", 124], ["riposo", 86 + (att.has("infermeria") ? 30 : 0) + (att.has("dormitorio") ? 30 : 0)]];
      const tot = larg.reduce((s, [, w]) => s + w, 0), margine = 20, spazio = V.Wp - 2 * margine;
      const k = Math.min(1, spazio / tot), extra = Math.max(0, spazio - tot * k) / larg.length;
      let x = margine; this.pos = {}; this.larg = {};
      for (const [id, w0] of larg) {
        const w = w0 * k; this.pos[id] = x + extra / 2 + w / 2; this.larg[id] = w; x += w + extra;
      }
      this.k = k;
      // il sacco: appeso nel mezzo della sua postazione
      if (!this.sacco || Math.abs(this.sacco.x - this.pos.sacco) > 0.5) this.sacco = new Sacco(this.pos.sacco);
      // oggetti a muro: da sinistra a destra, sparsi nello spazio che resta, mai dietro ai due dello sparring sul tatami
      const muro = ["finestra", "poster", ...(att.has("specchio") ? ["specchio"] : []), att.has("lavagna") ? "lavagna" : "bacheca"];
      const zona = [this.pos.tatami - 62, this.pos.tatami + 62], libere = [];
      for (let x = margine + 24; x < V.Wp - margine - 24; x += 6) if ((x < zona[0] || x > zona[1]) && Math.abs(x - this.pos.sacco) > 30) libere.push(x);
      this.muro = muro.map((id, i) => ({id, x: libere[Math.min(libere.length - 1, Math.round((i + 0.5) / muro.length * libere.length))]}));
      this.muro.push({id: "lampada", x: this.pos.sacco + 6}, {id: "lampada", x: this.pos.tatami});
      const m = this.muro.find(o => o.id === "lavagna" || o.id === "bacheca");
      this.pos.studio = m ? m.x : V.Wp * 0.5;
      const sp = this.muro.find(o => o.id === "specchio");
      this.pos.specchio = sp ? sp.x : V.Wp * 0.3;
      this.assegna();
    }

    /* ---- chi sta dove ---- */
    assegna() {
      const V = K.vista(); if (!V.ctx || !this.stato) return;
      const att = new Set(this.stato.attrezzi), P = this.pos;
      // due file: davanti chi si allena, un po' piu' in alto e dietro chi riposa, studia o guarda; tra le file ci si puo' sovrapporre
      const file = {davanti: [], dietro: []};
      const DIETRO = new Set(["riposo", "salta", "studio", "istruttore"]);
      const fila = (st) => DIETRO.has(st) ? "dietro" : "davanti";
      const altra = (fl) => fl === "davanti" ? "dietro" : "davanti";
      const libero = (x, fl, margine = 38) => !file[fl].some(o => Math.abs(o - x) < margine) && !file[altra(fl)].some(o => Math.abs(o - x) < 18);
      const prenota = (x, fl) => { file[fl].push(x); return x; };
      const dove = new Map();              // pid -> {x, f, st, dy}
      const tutti = this.stato.membri;
      const per = (fn) => tutti.filter(m => m.oggi && !m.oggi.fuori && m.salute !== "coma" && fn(m.oggi, m));       // chi e' in coma non si vede: e' in infermeria, non in sala
      /* la prima posizione libera tra i candidati [x, faccia]; se non c'e', lo spazio libero piu' vicino a `vicino` (e allora
         la postazione e' `stFall`: chi non trova il sacco fa l'ombra, chi non trova il rack salta la corda) */
      const posa = (id, st, cand, vicino, stFall = st) => {
        let fl = fila(st);
        for (const [x, f] of cand) if (x > 18 && x < V.Wp - 18 && libero(x, fl)) { dove.set(id, {x: prenota(x, fl), f, st, dy: fl === "dietro" ? -6 : 0}); return; }
        fl = fila(stFall);
        for (let r = 0; r < 700; r += 12) for (const sg of [1, -1]) {
          const x = lim(vicino + sg * r, 22, V.Wp - 22);
          if (libero(x, fl)) { dove.set(id, {x: prenota(x, fl), f: x < V.Wp / 2 ? 1 : -1, st: stFall, dy: fl === "dietro" ? -6 : 0}); return; }
        }
        dove.set(id, {x: prenota(rnd(30, V.Wp - 30), fl), f: 1, st: stFall, dy: fl === "dietro" ? -6 : 0});
      };

      // sparring in coppia: sul tatami (la prima coppia), poi dove c'e' posto
      const pari = new Set();
      for (const m of per(o => o.attivita === "sparring" && o.partner != null)) {
        if (pari.has(m.id)) continue;
        pari.add(m.id); pari.add(m.oggi.partner);
        let c = null;
        for (let r = 0; r < 700 && c === null; r += 20) for (const sg of [0, 1, -1]) {
          const x = P.tatami + sg * r;
          if (x > 50 && x < V.Wp - 50 && libero(x - DISTANZA / 2, "davanti", 30) && libero(x + DISTANZA / 2, "davanti", 30)) { c = x; break; }
        }
        c = c ?? lim(rnd(70, V.Wp - 70), 70, V.Wp - 70);
        const a = m.id < m.oggi.partner ? m.id : m.oggi.partner, b = a === m.id ? m.oggi.partner : m.id;
        dove.set(a, {x: prenota(c - DISTANZA / 2, "davanti"), f: 1, st: "tatami", dy: 0});
        dove.set(b, {x: prenota(c + DISTANZA / 2, "davanti"), f: -1, st: "tatami", dy: 0});
      }
      // gli istruttori: ai lati del tatami, a guardare (nella fila di dietro)
      const istr = [...this.istruttori.values()];
      istr.forEach((a, i) => posa("i" + a.pid, "istruttore",
        [[P.tatami + (i % 2 ? -1 : 1) * (DISTANZA / 2 + 52 + 40 * Math.floor(i / 2)), i % 2 ? 1 : -1]], P.tatami));
      // il sacco: due posti, uno per lato (chi non trova posto fa l'ombra); riflessi senza specchio, e l'allenamento duro
      for (const m of per(o => (o.attivita === "duro") || (o.attivita === "palestra" && o.voce === "stat:riflessi" && !att.has("specchio"))))
        posa(m.id, "sacco", [[P.sacco - STANDOFF, 1], [P.sacco + STANDOFF, -1]], P.sacco + 80, "ombra");
      // il rack se c'e', se no la corda; i riflessi allo specchio
      for (const m of per(o => o.attivita === "palestra" && o.voce !== "stat:riflessi")) {
        if (att.has("pesi") && ![...dove.values()].some(d => d.st === "pesi")) posa(m.id, "pesi", [[P.pesi, 1]], P.pesi, "corda");
        else posa(m.id, "corda", [], P.pesi ?? V.Wp * 0.3);
      }
      for (const m of per(o => o.attivita === "palestra" && o.voce === "stat:riflessi" && att.has("specchio")))
        posa(m.id, "ombra", [[P.specchio - 26, 1], [P.specchio + 26, -1]], P.specchio);
      for (const m of per(o => o.attivita === "controllo"))
        posa(m.id, "controllo", P.camera != null ? [[P.camera - 24, 1], [P.camera + 24, -1]] : [], P.camera ?? V.Wp * 0.8);
      for (const m of per(o => o.attivita === "sparring" && o.partner == null)) {
        if (att.has("manichino")) posa(m.id, "manichino", [[P.manichino - 46, 1], [P.manichino + 46, -1]], P.manichino, "ombra");
        else posa(m.id, "ombra", [], V.Wp * 0.45);
      }
      for (const m of per(o => o.attivita === "studio"))
        posa(m.id, "studio", [[P.studio - 44, 1], [P.studio + 44, -1], [P.studio - 84, 1], [P.studio + 84, -1]], P.studio);
      let nRip = 0;
      for (const m of per(o => ["riposo", "salta"].includes(o.attivita))) {
        const st = o_riposo(m), k = Math.ceil(nRip / 2) * 30, sg = nRip % 2 ? 1 : -1;
        posa(m.id, st, [[P.riposo - 4 + sg * k, nRip % 2 ? -1 : 1], [P.riposo - 4 - sg * k, 1]], P.riposo); nRip++;
      }
      // applica: chi cambia postazione o attivita' si dissolve, si sposta e rientra
      for (const m of tutti) this.imposta(m, dove.get(m.id));
      for (const a of istr) this.imposta({id: "i" + a.pid, oggi: {attivita: "istruttore"}}, dove.get("i" + a.pid), a);
    }

    imposta(m, d, istr) {
      const a = istr || this.allievi.get(m.id); if (!a) return;
      const presente = !!d && !(m.oggi && m.oggi.fuori);
      const firma = presente ? [d.st, Math.round(d.x), d.f, m.oggi.attivita, m.oggi.voce, m.oggi.partner].join("|") : "assente";
      if (a.firma === firma) return;
      const primo = a.firma === undefined;
      a.firma = firma;
      a.dest = {presente, d, m};
      if (primo || !a.visibile) { this.applicaDest(a); a.alpha = presente ? 1 : 0; a.visibile = presente; a.fade = null; }
      else a.fade = {fase: "out", t: 0};
    }

    /* mette l'allievo nella sua nuova postazione e gli da' il copione della sua attivita' */
    applicaDest(a) {
      const {presente, d, m} = a.dest;
      const pup = a.pup;
      pup.fermaCicli(); pup.azioni = []; pup.rilassa(false); pup.assesta(2);
      a.script = null; a.coppia = null; a.az = null;
      a.visibile = presente;
      if (!presente) return;
      a.L.f = d.f; a.L.O = d.x - d.f * XB; a.L.dy = d.dy || 0; a.stazione = d.st;
      const att = m.oggi.attivita, voce = m.oggi.voce;
      a.attivita = att;
      const L = a.L;
      // un po' di casualita' perche' non facciano tutti la stessa cosa nello stesso istante
      const s = a.script = {tipo: d.st, att, t: 0, attesa: rnd(0.2, 1.2), mano: Math.random() < 0.5 ? "dx" : "sx"};
      if (d.st === "pesi") a.az = pup.ciclo("pesi", {fase: rnd(0, 2)});
      else if (d.st === "corda") a.az = pup.ciclo("corda", {fase: rnd(0, 0.5)});
      else if (["riposo", "salta", "istruttore", "libero", "studio"].includes(d.st)) pup.rilassa(true);
      if (d.st === "tatami" && m.oggi.partner != null) { s.tipo = "sparring"; a.coppia = Math.min(m.id, m.oggi.partner); }
      pup.storpia("gamba_dx", a.crippleG.dx); pup.storpia("gamba_sx", a.crippleG.sx);
    }

    /* ---- sincronizza con la vista del server ---- */
    aggiorna(stato) {
      this.stato = stato;
      const vivi = new Set();
      for (const m of stato.membri) {
        vivi.add(m.id);
        let a = this.allievi.get(m.id);
        if (!a) {
          const chiave = "g" + m.id;
          const L = K.crea(chiave); L.f = 1; L.O = -200;
          a = {pid: m.id, chiave, L, pup: L.pup, alpha: 0, visibile: false, firma: undefined, crippleG: {dx: false, sx: false}, salute: m.salute};
          this.allievi.set(m.id, a);
        }
        a.nome = m.nome; a.salute = m.salute; a.fiducia = m.fiducia; a.stress = m.stress; a.dati = m;
        const key = JSON.stringify([m.aspetto, m.hp]);
        if (a.key !== key) {
          const primo = a.key === undefined; a.key = key;
          K.applica(a.chiave, {nome: m.nome, aspetto: m.aspetto, hp: m.hp, extra: {}}, primo, true);
          a.crippleG = {dx: !!(m.hp.gamba_dx && m.hp.gamba_dx.crippled), sx: !!(m.hp.gamba_sx && m.hp.gamba_sx.crippled)};
          if (a.dest && a.dest.presente) {                    // le ferite cambiano, la postazione no: si rimette solo la posa da seduto
            a.pup.storpia("gamba_dx", a.crippleG.dx); a.pup.storpia("gamba_sx", a.crippleG.sx);
          }
        }
      }
      for (const [pid, a] of [...this.allievi]) if (!vivi.has(pid)) { K.rimuovi(a.chiave); this.allievi.delete(pid); }
      // gli istruttori
      const iv = new Set();
      for (const i of stato.istruttori) {
        iv.add(i.id);
        let a = this.istruttori.get(i.id);
        if (!a) { const chiave = "i" + i.id; const L = K.crea(chiave); L.f = -1; L.O = -200;
                  a = {pid: i.id, chiave, L, pup: L.pup, alpha: 0, visibile: false, firma: undefined, crippleG: {dx: false, sx: false}, salute: "pronto", istruttore: true}; this.istruttori.set(i.id, a); }
        a.nome = i.nome; a.dati = i;
        const key = JSON.stringify([i.aspetto, i.hp]);
        if (a.key !== key) { const primo = a.key === undefined; a.key = key; K.applica(a.chiave, {nome: i.nome, aspetto: i.aspetto, hp: i.hp, extra: {}}, primo, true); }
      }
      for (const [pid, a] of [...this.istruttori]) if (!iv.has(pid)) { K.rimuovi(a.chiave); this.istruttori.delete(pid); }
      this.caduti = stato.caduti.slice(-8);
      this.sistema();
    }

    sotto(e) {
      const r = this.tela.getBoundingClientRect(), V = K.vista();
      const x = (e.clientX - r.left) / V.S;
      let migliore = null, dmin = 26;
      for (const a of this.allievi.values()) {
        if (!a.visibile || a.alpha < 0.5) continue;
        const d = Math.abs(a.L.O + a.L.f * XB - x);
        if (d < dmin) { dmin = d; migliore = a.pid; }
      }
      return migliore;
    }

    /* ------------------------------------------------------------------------------------------ simulazione */
    ciclo(ts) {
      if (!this.attivo) return;
      if (!this.ultimo) this.ultimo = ts;
      const dt = Math.min(0.1, (ts - this.ultimo) / 1000); this.ultimo = ts;
      this.acc += dt;
      while (this.acc >= DT) { this.passo(); this.acc -= DT; }
      K.setAlpha(this.acc / DT);
      this.disegna();
      this.rafId = requestAnimationFrame((t) => this.ciclo(t));
    }

    passi(n) { for (let i = 0; i < n; i++) this.passo(); K.setAlpha(1); this.disegna(); }

    passo() {
      this.t += DT;
      if (this.sacco) this.sacco.passo(DT);
      for (const a of [...this.allievi.values(), ...this.istruttori.values()]) {
        // dissolvenza tra una postazione e l'altra
        if (a.fade) {
          a.fade.t += DT;
          if (a.fade.fase === "out") {
            a.alpha = Math.max(0, 1 - a.fade.t / 0.2);
            if (a.fade.t >= 0.2) { this.applicaDest(a); a.fade = a.visibile ? {fase: "in", t: 0} : null; if (!a.visibile) a.alpha = 0; }
          } else { a.alpha = Math.min(1, a.fade.t / 0.3); if (a.fade.t >= 0.3) a.fade = null; }
        }
        if (!a.visibile) continue;
        this.copione(a);
        K.avanza(a.L);
      }
      K.avanzaParticelle(DT);
      for (const z of this.zz) { z.t += DT; z.y -= 9 * DT; z.x += 3 * DT; }
      this.zz = this.zz.filter(z => z.t < 2.4);
    }

    /* il punto del sacco, in coordinate locali di chi lo colpisce */
    miraSacco(a) {
      const b = this.sacco.corpo, wx = b.x - a.L.f * 7, wy = 36 + rnd(-3, 3);
      return K.daMondo(a.L, [wx, wy]);
    }

    copione(a) {
      const s = a.script; if (!s) return;
      const pup = a.pup, L = a.L;
      s.t += DT;
      switch (s.tipo) {
        case "sacco": {
          if (pup.occupato()) break;
          s.attesa -= DT; if (s.attesa > 0) break;
          const pesante = s.att === "duro";
          s.mano = s.mano === "dx" ? "sx" : "dx";
          pup.attacca({mano: s.mano, insegui: true, bersaglio: () => this.miraSacco(a), stile: "pugno",
                       carica: pesante ? 0.2 : 0.13, colpo: 0.09, recupero: pesante ? 0.36 : 0.24, tenuta: 0.05,
                       alContatto: (i) => {
                         const w = K.aMondo(L, [i.x, i.y]);
                         this.sacco.colpisci(w[0], w[1], L.f * (pesante ? rnd(170, 230) : rnd(95, 150)));
                         for (let k = 0; k < 3; k++) K.particella({x: w[0], y: w[1], vx: rnd(-40, 40) + L.f * 40, vy: rnd(-50, 10), s: 1, vita: 0.25, fade: 0.15, col: "#9aa3b0", g: 120});
                         if (pesante && Math.random() < 0.5) K.particella({x: L.O + L.f * 24, y: 8, vx: rnd(-20, 20), vy: -30, s: 1, vita: 0.6, fade: 0.3, col: "#bfe8ff", g: 200});   // sudore
                       },
                       alFine: () => { s.attesa = pesante ? rnd(0.02, 0.35) : rnd(0, 0.18); }});
          break;
        }
        case "ombra": {
          if (pup.occupato()) break;
          s.attesa -= DT; if (s.attesa > 0) break;
          s.mano = s.mano === "dx" ? "sx" : "dx";
          const alt = rnd(22, 38);
          pup.attacca({mano: s.mano, insegui: false, bersaglio: () => [XB + 28, alt], stile: scegli(["pugno", "pugno", "affondo"]),
                       carica: 0.12, colpo: 0.09, recupero: 0.22, tenuta: 0.03, alFine: () => { s.attesa = rnd(0.1, 0.7); }});
          break;
        }
        case "manichino": {
          if (pup.occupato()) break;
          s.attesa -= DT; if (s.attesa > 0) break;
          s.mano = s.mano === "dx" ? "sx" : "dx";
          const lx = a.L.f * ((this.pos.manichino) - a.L.O) - 8;                        // il davanti del manichino (che sta tra i due posti)
          pup.attacca({mano: s.mano, insegui: false, bersaglio: () => [lx, rnd(22, 40)], stile: scegli(["pugno", "pugno", "fendente"]),
                       carica: 0.13, colpo: 0.09, recupero: 0.25, tenuta: 0.04,
                       alContatto: (i) => { const w = K.aMondo(L, [i.x, i.y]); for (let k = 0; k < 3; k++) K.particella({x: w[0], y: w[1], vx: rnd(-30, 30), vy: rnd(-40, 0), s: 1, vita: 0.2, fade: 0.12, col: "#b0a58c", g: 100}); },
                       alFine: () => { s.attesa = rnd(0.1, 0.6); }});
          break;
        }
        case "studio": {
          if (pup.occupato()) break;
          s.attesa -= DT; if (s.attesa > 0) break;
          const bx = this.pos.studio, by = 30 + rnd(-6, 4);
          pup.gesto("mira", {bersaglio: () => K.daMondo(L, [bx, by])});
          s.attesa = rnd(2.2, 4.2);
          break;
        }
        case "controllo": {
          if (pup.occupato()) break;
          s.attesa -= DT; if (s.attesa > 0) break;
          pup.gesto("potere");
          s.attesa = rnd(2, 3.4);
          const x = L.O + L.f * XB;
          setTimeout(() => { for (let i = 0; i < 12; i++) K.particella({x: x + rnd(-10, 10), y: 70 - rnd(0, 40), vx: rnd(-20, 20), vy: -rnd(30, 80), s: 1, vita: 0.8, fade: 0.4, col: scegli(["#b86bff", "#d9a8ff", "#7be0ff"]), g: -30}); }, 300);
          break;
        }
        case "sparring": this.sparring(a); break;
        case "riposo": case "salta": case "istruttore": {
          s.zz = (s.zz ?? rnd(1, 3)) - DT;
          if (s.zz <= 0 && s.tipo === "riposo") {
            s.zz = rnd(2.4, 4);
            this.zz.push({x: L.O + L.f * (XB + 4), y: 4, t: 0});
          }
          break;
        }
      }
    }

    /* lo sparring in coppia: uno scambio alla volta, a turno casuale; chi riceve para, schiva o incassa un colpo leggero */
    sparring(a) {
      if (a.coppia == null) return;
      let c = this.coppie.get(a.coppia);
      const altro = [...this.allievi.values()].find(x => x !== a && x.coppia === a.coppia && x.visibile && x.alpha > 0.9);
      if (!altro || a.alpha < 0.9) return;
      if (a.pid > altro.pid) return;                          // lo dirige quello con l'id piu' basso: una volta sola per coppia
      if (!c) { c = {attesa: rnd(0.6, 1.4), in: false}; this.coppie.set(a.coppia, c); }
      if (c.in || a.pup.occupato() || altro.pup.occupato()) return;
      c.attesa -= DT; if (c.attesa > 0) return;
      const att = Math.random() < 0.5 ? a : altro, dif = att === a ? altro : a;
      const r = Math.random(), esito = r < 0.4 ? "colpito" : r < 0.7 ? "parato" : "schivato";
      const loc = scegli(["busto", "busto", "testa", "braccio_dx", "gamba_dx"]);
      const davanti = () => dif.pup.fronte(loc);
      const bers = () => K.daMondo(att.L, K.aMondo(dif.L, esito === "parato" ? [davanti()[0] + 8, davanti()[1]] : davanti()));
      c.in = true;
      const reazione = () => {
        if (esito === "parato") dif.pup.para({mano: "dx", punto: () => { const d = davanti(); return [d[0] + 5, d[1]]; }});
        else if (esito === "schivato") dif.pup.schiva(loc === "testa" ? "abbassa" : loc.startsWith("gamba") ? "salto" : "indietro");
      };
      att.pup.attacca({mano: scegli(["dx", "sx"]), insegui: esito === "colpito", bersaglio: bers, stile: "pugno",
                       carica: 0.16, colpo: 0.1, recupero: 0.32, tenuta: 0.05, anticipo: esito === "colpito" ? 0 : 0.05, alAnticipo: reazione,
                       alContatto: (i) => {
                         const w = K.aMondo(att.L, [i.x, i.y]);
                         if (esito === "colpito") {
                           dif.pup.colpisci(loc, rnd(0.1, 0.24), [-1, -0.12 - 0.08 * Math.random()], K.daMondo(dif.L, w)[0], K.daMondo(dif.L, w)[1]);
                           K.stella(w, "#ffe9a0", 6, 90);
                         } else if (esito === "parato") { K.stella(w, "#ffe38a", 5, 80); dif.pup.spingiTutto(-35, 0); }
                         else att.pup.spingiTutto(40, 0);
                       },
                       alFine: () => { c.in = false; c.attesa = rnd(0.5, 1.2); }});
    }

    /* ------------------------------------------------------------------------------------------ disegno */
    disegna() {
      const V = K.vista(); if (!V.ctx) return;
      const ctx = V.ctx, S = V.S, dpr = V.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.fondale(V);
      const mondo = () => ctx.setTransform(S * dpr, 0, 0, S * dpr, 0, (V.pavY - PISTA * S) * dpr);
      mondo();
      ctx.imageSmoothingEnabled = false;
      this.oggettiMuro(ctx, V);
      this.oggettiPavimento(ctx, V, "dietro");
      // dietro: chi riposa o guarda; poi chi si allena
      const ordine = [...this.istruttori.values(), ...this.allievi.values()].filter(a => a.visibile && a.alpha > 0.01)
        .sort((x, y) => (rango(x) - rango(y)) || (x.L.O - y.L.O));
      for (const a of ordine) {
        ctx.globalAlpha = a.alpha;
        K.disegnaOmbra(a.L);
        K.disegnaCombattente(a.L);
        K.disegnaCopStacc(a.L);
        mondo();
        this.attrezziInUso(ctx, a);
      }
      ctx.globalAlpha = 1;
      mondo();
      if (this.sacco) this.sacco.disegna(ctx);
      this.oggettiPavimento(ctx, V, "davanti");
      K.disegnaParticelle();
      this.testi(V, ordine);
    }

    fondale(V) {
      const {ctx, W, H, pavY, S} = V;
      const g = ctx.createLinearGradient(0, 0, 0, pavY);
      g.addColorStop(0, "#181c24"); g.addColorStop(1, "#10131a");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, pavY);
      // pannelli del muro: righe orizzontali e giunti sfalsati
      ctx.fillStyle = "rgba(255,255,255,.035)";
      const passo = 22 * S;
      for (let y = pavY - passo; y > 0; y -= passo) { ctx.fillRect(0, y, W, 1); }
      for (let r = 0, y = pavY - passo; y > -passo; y -= passo, r++) for (let x = (r % 2) * 48 * S; x < W; x += 96 * S) ctx.fillRect(x, y, 1, passo);
      // il soffitto (se la scena e' piu' alta di quanto serva): il muro finisce dove sono appesi sacco e lampade
      const tetto = pavY - (PISTA + 30) * S - 4;
      if (tetto > 2) {
        const gt = ctx.createLinearGradient(0, 0, 0, tetto); gt.addColorStop(0, "#05060a"); gt.addColorStop(1, "#0d1015");
        ctx.fillStyle = gt; ctx.fillRect(0, 0, W, tetto);
        ctx.fillStyle = "rgba(255,255,255,.04)";                                      // le travi del soffitto
        for (let y = tetto - 9 * S; y > 0; y -= 20 * S) { ctx.fillRect(0, y, W, 3 * S); ctx.fillRect(0, y + 3 * S, W, 1); }
        ctx.fillStyle = "rgba(215,255,62,.10)"; ctx.fillRect(0, tetto, W, 1);
      }
      // zoccolo e pavimento
      ctx.fillStyle = "#0b0d11"; ctx.fillRect(0, pavY - 5 * S, W, 5 * S);
      ctx.fillStyle = "rgba(215,255,62,.10)"; ctx.fillRect(0, pavY - 5 * S, W, 1);
      ctx.fillStyle = "#08090b"; ctx.fillRect(0, pavY, W, H - pavY);
      ctx.fillStyle = "#262b33"; ctx.fillRect(0, pavY, W, 1);
      ctx.fillStyle = "rgba(255,255,255,.04)";
      for (let x = 0; x < W; x += 36 * S) ctx.fillRect(x, pavY + 1, 1, H - pavY);
      // luci: coni sotto le lampade
      ctx.save();
      for (const o of (this.muro || []).filter(o => o.id === "lampada")) {
        const lx = o.x * S, gr = ctx.createRadialGradient(lx, pavY * 0.25, 4, lx, pavY * 0.7, 200 * S / 2);
        gr.addColorStop(0, "rgba(255,226,150,.16)"); gr.addColorStop(1, "rgba(255,226,150,0)");
        ctx.fillStyle = gr; ctx.fillRect(lx - 120 * S, 0, 240 * S, pavY);
      }
      ctx.restore();
    }

    /* un oggetto a muro/pavimento: sprite col perno in `perno`, o un segnaposto */
    pezzo(ctx, id, x, y, opz = {}) {
      const o = ogg[id];
      if (o && o.img) { ctx.drawImage(o.img, Math.round(x - o.perno[0]), Math.round(y - o.perno[1])); return; }
      const w = (o && o.w) || 24, h = (o && o.h) || 30, px = (o && o.perno) || [w / 2, h];
      ctx.fillStyle = "rgba(120,130,150,.35)"; ctx.fillRect(x - px[0], y - px[1], w, h);
      ctx.strokeStyle = "rgba(215,255,62,.5)"; ctx.strokeRect(x - px[0] + .5, y - px[1] + .5, w - 1, h - 1);
    }

    oggettiMuro(ctx, V) {
      const at = new Set(this.stato ? this.stato.attrezzi : []);
      for (const o of this.muro || []) {
        const y = {finestra: 26, poster: 32, specchio: 100, lavagna: PISTA - 3, bacheca: 58, lampada: -32}[o.id] ?? 40;
        this.pezzo(ctx, o.id, o.x, y);
      }
      // le targhe dei caduti, in alto a destra
      const n = this.caduti.length;
      this.caduti.forEach((c, i) => {
        const x = V.Wp - 22 - (n - 1 - i) * 17, y = -4;
        this.pezzo(ctx, "targa", x, y);
      });
    }

    oggettiPavimento(ctx, V, strato) {
      if (!this.stato) return;
      const at = new Set(this.stato.attrezzi);
      const f = (id, x, y = PISTA - 1) => this.pezzo(ctx, id, x, y);
      if (strato === "dietro") {
        f("tatami", this.pos.tatami, PISTA + 3);
        if (at.has("camera_controllo")) f("camera", this.pos.camera, PISTA + 3);
        if (at.has("pesi")) f([...this.allievi.values()].some(a => a.visibile && a.stazione === "pesi" && a.alpha > 0.5) ? "pesi_vuoto" : "pesi", this.pos.pesi, PISTA - 2);
        if (at.has("manichino")) f("manichino", this.pos.manichino, PISTA - 2);
        let x = this.pos.riposo - 6;
        if (at.has("infermeria")) { f("infermeria", x - 6, PISTA - 3); x += 34; }
        if (at.has("dormitorio")) f("dormitorio", this.pos.riposo + (at.has("infermeria") ? 56 : 24), PISTA - 3);
      }
      // il bagliore della camera di controllo quando qualcuno la usa
      if (strato === "dietro" && at.has("camera_controllo")) {
        const uso = [...this.allievi.values()].some(a => a.visibile && a.stazione === "controllo");
        if (uso) { ctx.save(); ctx.globalAlpha = 0.25 + 0.15 * Math.sin(this.t * 4); ctx.fillStyle = "#b86bff"; ctx.fillRect(this.pos.camera - 32, PISTA - 2, 64, 3); ctx.restore(); }
      }
    }

    /* il bilanciere in mano a chi solleva pesi, la corda di chi salta */
    attrezziInUso(ctx, a) {
      if (!a.visibile) return;
      const pup = a.pup, L = a.L;
      ctx.save();
      ctx.globalAlpha = a.alpha;
      if (a.stazione === "pesi" && a.az) {
        const [ax, ay] = pup._polso("dx"), w = K.aMondo(L, [ax + 2, ay - 2]);
        this.pezzo(ctx, "bilanciere", w[0], w[1]);
      } else if (a.stazione === "corda" && a.az) {
        const [ax, ay] = pup._polso("dx"), c = K.aMondo(L, [ax, ay - 3]);
        const fase = a.az.u * Math.PI * 2, raggio = 36;
        ctx.strokeStyle = "#d7ff3e"; ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let t = -1.15; t <= 1.15; t += 0.12) {
          const ang = fase + t;
          const px = c[0] + L.f * Math.sin(ang) * raggio * 0.55, py = c[1] - Math.cos(ang) * raggio * 1.15 + 2;
          t === -1.15 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    testi(V, ordine) {
      const {ctx, S, dpr, pavY} = V;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = "alphabetic";
      for (const a of ordine) {
        const x = (a.L.O + a.L.f * XB) * S, y = Math.max(12, pavY - PISTA * S - 8);
        ctx.globalAlpha = a.alpha;
        ctx.textAlign = "center";
        const evid = this.hover === a.pid;
        const f = Math.max(1, S / 2.4);                                // le scritte crescono con la scena
        ctx.font = `800 ${Math.round(11 * f)}px system-ui, sans-serif`;
        ctx.fillStyle = a.istruttore ? "#21d0b2" : evid ? "#d7ff3e" : "#e8ecf1";
        ctx.fillText((a.nome || "").toUpperCase().split(" ")[0], x, y);
        ctx.font = `600 ${Math.round(9 * f)}px system-ui, sans-serif`;
        let riga = y + Math.round(11 * f);
        if (a.istruttore || evid) {                                    // il resto solo sotto il mouse: se no le etichette si sovrappongono
          ctx.fillStyle = "#8b93a1";
          const sotto = a.istruttore ? "istruttore" : (this.stato.sessioni[a.dati.oggi.attivita] || this.stato.attivita_speciali[a.dati.oggi.attivita] || {}).nome || "";
          ctx.fillText(sotto, x, riga); riga += Math.round(10 * f);
        }
        if (!a.istruttore && a.salute && a.salute !== "pronto") {
          ctx.fillStyle = "#ffb020";
          ctx.fillText("FERITO", x, riga);
        }
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
      for (const z of this.zz) {                                       // "z z Z" che salgono dalla testa di chi dorme
        ctx.globalAlpha = Math.max(0, 1 - z.t / 2.4) * 0.8; ctx.fillStyle = "#aeb7c4";
        ctx.font = `800 ${Math.round(8 + z.t * 3)}px system-ui, sans-serif`;
        ctx.fillText("z", z.x * S, pavY - (PISTA - z.y) * S);
      }
      ctx.globalAlpha = 1;
      // i caduti: il nome sotto la targa
      ctx.font = "600 8px system-ui, sans-serif"; ctx.fillStyle = "#6c7480"; ctx.textAlign = "center";
      const V2 = K.vista(), n = this.caduti.length;
      this.caduti.forEach((c, i) => {
        const x = (V2.Wp - 22 - (n - 1 - i) * 17) * S, y = (-4 + 18) * S + (pavY - PISTA * S);
        ctx.fillText((c.nome || "").split(" ")[0].slice(0, 7), x, y);
      });
    }
  }

  /* chi sta sullo sfondo si disegna prima: l'istruttore, chi riposa, chi studia; davanti chi si allena */
  function rango(a) {
    if (a.istruttore) return 0;
    const t = a.stazione;
    return t === "riposo" || t === "salta" ? 1 : t === "studio" ? 2 : 3;
  }
  function o_riposo(m) { return m.oggi.attivita === "salta" ? "salta" : "riposo"; }

  async function crea(el, opz) {
    const s = new Scena(el, opz);
    await s.avvia();
    GALLERIA.push(s);
    return s;
  }
  return {crea, galleria: () => GALLERIA};
})();
