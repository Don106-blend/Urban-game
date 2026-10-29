/* Urban — motore fisico 2D a corpi rigidi.
   Pensato per i combattenti (ragdoll articolati) ma generico: corpi fatti di capsule, giunti a cerniera con limiti
   e motori PD, contatti con pavimento e muri (attrito di Coulomb, rimbalzo), gravita'. Nessun DOM: gira in Node
   (v. test_fisica.js) e nel browser (pupazzo.js, arena.js).

   Il risolutore e' quello "soft step" di Box2D 3 (Erin Catto): ogni passo si divide in sotto-passi; a ogni
   sotto-passo si integrano le velocita', si applicano i vincoli come molle implicite (stabili per qualunque
   rigidezza e rapporto di massa), si integrano le posizioni e si rilassano i vincoli senza correzione di posizione.
   I contatti sono "speculativi": un corpo veloce non attraversa mai il pavimento. I motori dei giunti sono molle
   smorzate sull'angolo relativo (frequenza + smorzamento, con coppia massima): sono i "muscoli" dei pupazzi.

   Unita': pixel dello sprite, secondi, radianti. Y verso il basso, angoli positivi in senso orario (come il CSS).
   Corpo.x/y = centro di massa; le forme sono capsule {ax, ay, bx, by, r} nel sistema locale del corpo. */
const Fisica = (() => {
  const PI2 = Math.PI * 2;
  const lim = (x, a, b) => (x < a ? a : x > b ? b : x);

  /* coefficienti di un vincolo morbido: da frequenza propria e smorzamento a (bias, massa, impulso) */
  function morbido(hz, zeta, h) {
    if (hz <= 0) return {bias: 0, massa: 1, impulso: 0};
    const w = PI2 * hz, a1 = 2 * zeta + h * w, a2 = h * w * a1, a3 = 1 / (1 + a2);
    return {bias: w / a1, massa: a2 * a3, impulso: a3};
  }

  /* momento d'inerzia di un'asta (lunghezza L, spessore 2r) di massa m, attorno al suo centro */
  const asta = (L, m, r = 0) => m * (L * L / 12 + r * r / 4);

  class Corpo {
    constructor(o) {
      this.nome = o.nome || "";
      this.x = o.x; this.y = o.y; this.a = o.a || 0;
      this.vx = 0; this.vy = 0; this.w = 0;
      this.m = o.m; this.I = o.I;
      this.im = o.statico ? 0 : 1 / o.m; this.iI = o.statico ? 0 : 1 / o.I;   // statico: non si muove mai
      this.forme = o.forme || [];
      this.mu = o.mu ?? 0.9;              // attrito col terreno
      this.e = o.e ?? 0.1;                // rimbalzo
      this.fx = 0; this.fy = 0; this.tau = 0;   // forze esterne per il prossimo passo (si azzerano da sole)
      this.dmpL = o.dmpL ?? 0.02;         // smorzamento lineare (1/s)
      this.dmpA = o.dmpA ?? 0.25;         // smorzamento angolare (1/s)
      this.px = this.x; this.py = this.y; this.pa = this.a;      // posa del passo precedente (per interpolare)
      this.x0 = this.x; this.y0 = this.y; this.a0 = this.a;      // posa a inizio passo (per i contatti)
      this.terra = 0;                     // impulso normale sul pavimento nell'ultimo passo: 0 = in volo
      this.scivola = 0;                   // velocita' di scivolamento sul pavimento nell'ultimo passo
    }
    /* punto locale -> mondo */
    mondo(lx, ly) {
      const c = Math.cos(this.a), s = Math.sin(this.a);
      return [this.x + c * lx - s * ly, this.y + s * lx + c * ly];
    }
    /* velocita' (mondo) del punto locale */
    velocita(lx, ly) {
      const c = Math.cos(this.a), s = Math.sin(this.a), rx = c * lx - s * ly, ry = s * lx + c * ly;
      return [this.vx - this.w * ry, this.vy + this.w * rx];
    }
  }

  /* cerniera tra A e B. Gli ancoraggi sono locali. `rif` = angolo relativo (B - A) a riposo; `lim` = [min, max]
     dell'angolo relativo a `rif`. Il motore PD (hz > 0) porta l'angolo relativo a `obiettivo` come una molla
     smorzata, con coppia al piu' `coppiaMax`. `attrito` = smorzamento viscoso (coppia per rad/s). */
  class Giunto {
    constructor(A, B, ancA, ancB, o = {}) {
      this.A = A; this.B = B;
      this.lax = ancA[0]; this.lay = ancA[1]; this.lbx = ancB[0]; this.lby = ancB[1];
      this.rif = o.rif ?? 0;
      this.lim = o.lim || null;
      this.nome = o.nome || "";
      this.hz = 0; this.zeta = 1; this.coppiaMax = 0; this.obiettivo = 0;
      this.attrito = o.attrito ?? 0;
      this.ix = 0; this.iy = 0; this.iMot = 0; this.iLo = 0; this.iHi = 0;   // impulsi accumulati (warm start)
    }
    get angolo() { return this.B.a - this.A.a - this.rif; }
    /* il motore: frequenza, smorzamento, coppia massima, angolo voluto */
    motore(hz, zeta, coppiaMax, obiettivo) {
      this.hz = hz; this.zeta = zeta; this.coppiaMax = coppiaMax; this.obiettivo = obiettivo;
    }
  }

  class Mondo {
    constructor(o = {}) {
      this.g = o.g ?? 1100;                  // px/s^2
      this.pavimento = o.pavimento ?? 111;   // y del terreno
      this.muro = [-1e9, 1e9];               // limiti orizzontali (x minimo, x massimo)
      this.sotto = o.sotto ?? 4;             // sotto-passi per passo
      this.corpi = []; this.giunti = [];
      this.hzContatto = o.hzContatto ?? 30;
      this.zetaContatto = o.zetaContatto ?? 10;
      this.hzGiunto = o.hzGiunto ?? 60;
      this.zetaGiunto = o.zetaGiunto ?? 2;
      this.spinta = o.spinta ?? 260;         // velocita' massima con cui un contatto espelle una penetrazione (px/s)
      this.tolleranza = o.tolleranza ?? 0.25;  // penetrazione tollerata (px)
      this.vmax = 6000; this.wmax = 80;
      this.contatti = []; this.memoria = new Map();   // contatti del passo e impulsi del passo prima
      this.dorme = false; this.fermo = 0; this.sonno = o.sonno ?? false;
      this.t = 0;
    }
    corpo(o) { const c = new Corpo(o); this.corpi.push(c); return c; }
    giunto(A, B, ancA, ancB, o) { const j = new Giunto(A, B, ancA, ancB, o); this.giunti.push(j); return j; }
    sveglia() { this.dorme = false; this.fermo = 0; }

    /* impulso (jx, jy) applicato al punto (px, py) del mondo di un corpo */
    impulso(c, px, py, jx, jy) {
      c.vx += c.im * jx; c.vy += c.im * jy;
      c.w += c.iI * ((px - c.x) * jy - (py - c.y) * jx);
      this.sveglia();
    }

    /* contatti col pavimento e coi muri: un punto per ogni estremo di ogni capsula */
    _collide(dt) {
      const out = this.contatti; out.length = 0;
      const PAV = this.pavimento, [xmin, xmax] = this.muro;
      this.corpi.forEach((b, bi) => {
        const sp = Math.hypot(b.vx, b.vy) + Math.abs(b.w) * 30;
        const margine = 3 + sp * dt * 1.5;               // contatti speculativi: si vede in anticipo cosa si toccera'
        b.forme.forEach((f, fi) => {
          for (let e = 0; e < 2; e++) {
            const [px, py] = b.mondo(e ? f.bx : f.ax, e ? f.by : f.ay), r = f.r;
            // 0 = pavimento, 1 = muro sinistro, 2 = muro destro
            const s0 = PAV - (py + r), s1 = (px - r) - xmin, s2 = xmax - (px + r);
            if (s0 < margine) out.push(this._contatto(b, (bi * 16 + fi * 2 + e) * 3, px, py + r, 0, -1, s0));
            if (s1 < margine) out.push(this._contatto(b, (bi * 16 + fi * 2 + e) * 3 + 1, px - r, py, 1, 0, s1));
            if (s2 < margine) out.push(this._contatto(b, (bi * 16 + fi * 2 + e) * 3 + 2, px + r, py, -1, 0, s2));
          }
        });
      });
      // (la memoria dei contatti del passo prima serve solo al warm start: si rifa' a ogni passo)
      this.memoria = new Map(out.map(c => [c.chiave, c]));
    }

    _contatto(b, chiave, px, py, nx, ny, s0) {
      const rx = px - b.x, ry = py - b.y, tx = -ny, ty = nx;
      const rn = rx * ny - ry * nx, rt = rx * ty - ry * tx;
      const vx = b.vx - b.w * ry, vy = b.vy + b.w * rx;
      const prec = this._precedenti && this._precedenti.get(chiave);
      return {
        b, chiave, nx, ny, tx, ty, rx, ry, s0,
        mn: 1 / (b.im + b.iI * rn * rn), mt: 1 / (b.im + b.iI * rt * rt),
        vrel: vx * nx + vy * ny,
        iN: prec ? prec.iN : 0, iT: prec ? prec.iT : 0, iNmax: 0,
      };
    }

    _giuntiRisolvi(h, bias, S) {
      for (const j of this.giunti) {
        const A = j.A, B = j.B, mA = A.im, mB = B.im, iA = A.iI, iB = B.iI, ie = iA + iB;
        const cA = Math.cos(A.a), sA = Math.sin(A.a), cB = Math.cos(B.a), sB = Math.sin(B.a);
        const rax = cA * j.lax - sA * j.lay, ray = sA * j.lax + cA * j.lay;
        const rbx = cB * j.lbx - sB * j.lby, rby = sB * j.lbx + cB * j.lby;
        // ---- motore PD sull'angolo relativo
        if (ie > 0) {
          const axial = 1 / ie, cdot = B.w - A.w;
          if (j.hz > 0 && j.coppiaMax > 0) {
            // la frequenza vale per l'inerzia *attorno al giunto* (Steiner), non attorno al centro di massa:
            // un arto che ruota su un perno e' piu' pigro del suo momento d'inerzia proprio
            const iAg = iA > 0 ? 1 / (1 / iA + (rax * rax + ray * ray) / mA) : 0;
            const iBg = iB > 0 ? 1 / (1 / iB + (rbx * rbx + rby * rby) / mB) : 0;
            const Sd = morbido(j.hz, j.zeta, h), C = B.a - A.a - j.rif - j.obiettivo;
            let imp = -(1 / (iAg + iBg)) * Sd.massa * (cdot + Sd.bias * C) - Sd.impulso * j.iMot;
            const mx = j.coppiaMax * h, nuovo = lim(j.iMot + imp, -mx, mx);
            imp = nuovo - j.iMot; j.iMot = nuovo;
            A.w -= iA * imp; B.w += iB * imp;
          }
          if (j.attrito > 0) {                            // smorzamento viscoso implicito
            const imp = -(B.w - A.w) * (h * j.attrito) / (1 + h * j.attrito * ie);
            A.w -= iA * imp; B.w += iB * imp;
          }
          // ---- limiti
          if (j.lim) {
            const ang = B.a - A.a - j.rif;
            let C = ang - j.lim[0], b = 0, ms = 1, is = 0;                // minimo
            if (C > 0) b = C / h;
            else if (bias) { b = S.bias * C; ms = S.massa; is = S.impulso; }
            let imp = -axial * ms * (B.w - A.w + b) - is * j.iLo;
            let nuovo = Math.max(j.iLo + imp, 0);
            imp = nuovo - j.iLo; j.iLo = nuovo;
            A.w -= iA * imp; B.w += iB * imp;
            C = j.lim[1] - ang; b = 0; ms = 1; is = 0;                    // massimo
            if (C > 0) b = C / h;
            else if (bias) { b = S.bias * C; ms = S.massa; is = S.impulso; }
            imp = -axial * ms * (A.w - B.w + b) - is * j.iHi;
            nuovo = Math.max(j.iHi + imp, 0);
            imp = nuovo - j.iHi; j.iHi = nuovo;
            A.w += iA * imp; B.w -= iB * imp;
          }
        }
        // ---- cerniera: i due ancoraggi restano uniti
        const dvx = B.vx - B.w * rby - A.vx + A.w * ray, dvy = B.vy + B.w * rbx - A.vy - A.w * rax;
        let bx = 0, by = 0, ms = 1, is = 0;
        if (bias) {
          bx = S.bias * (B.x + rbx - A.x - rax); by = S.bias * (B.y + rby - A.y - ray);
          ms = S.massa; is = S.impulso;
        }
        const k11 = mA + mB + ray * ray * iA + rby * rby * iB;
        const k12 = -ray * rax * iA - rby * rbx * iB;
        const k22 = mA + mB + rax * rax * iA + rbx * rbx * iB;
        let det = k11 * k22 - k12 * k12; det = det !== 0 ? 1 / det : 0;
        const ex = dvx + bx, ey = dvy + by;
        const ix = -ms * det * (k22 * ex - k12 * ey) - is * j.ix, iy = -ms * det * (k11 * ey - k12 * ex) - is * j.iy;
        j.ix += ix; j.iy += iy;
        A.vx -= mA * ix; A.vy -= mA * iy; A.w -= iA * (rax * iy - ray * ix);
        B.vx += mB * ix; B.vy += mB * iy; B.w += iB * (rbx * iy - rby * ix);
      }
    }

    _giuntiWarm() {
      for (const j of this.giunti) {
        const A = j.A, B = j.B;
        const cA = Math.cos(A.a), sA = Math.sin(A.a), cB = Math.cos(B.a), sB = Math.sin(B.a);
        const rax = cA * j.lax - sA * j.lay, ray = sA * j.lax + cA * j.lay;
        const rbx = cB * j.lbx - sB * j.lby, rby = sB * j.lbx + cB * j.lby;
        const axial = j.iMot + j.iLo - j.iHi;
        A.vx -= A.im * j.ix; A.vy -= A.im * j.iy; A.w -= A.iI * (rax * j.iy - ray * j.ix + axial);
        B.vx += B.im * j.ix; B.vy += B.im * j.iy; B.w += B.iI * (rbx * j.iy - rby * j.ix + axial);
      }
    }

    _contattiRisolvi(h, bias, S) {
      const inv = 1 / h;
      for (const c of this.contatti) {
        const b = c.b;
        // separazione attuale: quella a inizio passo piu' quanto il punto si e' mosso lungo la normale
        const da = b.a - b.a0, cs = Math.cos(da), sn = Math.sin(da);
        const rx = cs * c.rx - sn * c.ry, ry = sn * c.rx + cs * c.ry;
        const s = c.s0 + (b.x - b.x0 + rx - c.rx) * c.nx + (b.y - b.y0 + ry - c.ry) * c.ny;
        let vb = 0, ms = 1, is = 0;
        if (s > 0) vb = s * inv;                                             // speculativo
        else if (bias) {
          vb = Math.max(S.bias * (s + this.tolleranza), -this.spinta);
          if (s + this.tolleranza > 0) vb = 0;
          ms = S.massa; is = S.impulso;
        }
        // attrito per primo: la non penetrazione e' piu' importante
        let vx = b.vx - b.w * c.ry, vy = b.vy + b.w * c.rx;
        const vt = vx * c.tx + vy * c.ty;
        let imp = -c.mt * vt;
        const mx = b.mu * c.iN, nuovoT = lim(c.iT + imp, -mx, mx);
        imp = nuovoT - c.iT; c.iT = nuovoT;
        b.vx += b.im * imp * c.tx; b.vy += b.im * imp * c.ty; b.w += b.iI * (c.rx * c.ty - c.ry * c.tx) * imp;
        // normale
        vx = b.vx - b.w * c.ry; vy = b.vy + b.w * c.rx;
        const vn = vx * c.nx + vy * c.ny;
        imp = -c.mn * ms * (vn + vb) - is * c.iN;
        const nuovoN = Math.max(c.iN + imp, 0);
        imp = nuovoN - c.iN; c.iN = nuovoN; c.iNmax = Math.max(c.iNmax, nuovoN);
        b.vx += b.im * imp * c.nx; b.vy += b.im * imp * c.ny; b.w += b.iI * (c.rx * c.ny - c.ry * c.nx) * imp;
      }
    }

    _contattiWarm() {
      for (const c of this.contatti) {
        const b = c.b, px = c.iN * c.nx + c.iT * c.tx, py = c.iN * c.ny + c.iT * c.ty;
        b.vx += b.im * px; b.vy += b.im * py; b.w += b.iI * (c.rx * py - c.ry * px);
      }
    }

    /* rimbalzo: a fine passo, chi ha urtato forte rimbalza in proporzione a `e` */
    _rimbalzo() {
      for (const c of this.contatti) {
        const b = c.b;
        if (c.vrel > -70 || c.iNmax === 0 || b.e === 0) continue;
        const vx = b.vx - b.w * c.ry, vy = b.vy + b.w * c.rx, vn = vx * c.nx + vy * c.ny;
        let imp = -c.mn * (vn + b.e * c.vrel);
        const nuovo = Math.max(c.iN + imp, 0);
        imp = nuovo - c.iN; c.iN = nuovo;
        b.vx += b.im * imp * c.nx; b.vy += b.im * imp * c.ny; b.w += b.iI * (c.rx * c.ny - c.ry * c.nx) * imp;
      }
    }

    /* un passo di `dt` secondi, in `sotto` sotto-passi */
    passo(dt) {
      if (this.dorme) { this.corpi.forEach(b => { b.px = b.x; b.py = b.y; b.pa = b.a; b.fx = b.fy = b.tau = 0; }); return; }
      const n = this.sotto, h = dt / n, corpi = this.corpi;
      this.dt = h;                                    // durata di un sotto-passo: gli impulsi accumulati sono per questa durata
      for (const b of corpi) { b.px = b.x; b.py = b.y; b.pa = b.a; b.x0 = b.x; b.y0 = b.y; b.a0 = b.a; }
      this._precedenti = this.memoria;
      this._collide(dt);
      const Sc = morbido(this.hzContatto, this.zetaContatto, h);
      const Sg = morbido(this.hzGiunto, this.zetaGiunto, h);
      for (let i = 0; i < n; i++) {
        for (const b of corpi) {
          if (b.im === 0) continue;
          b.vx += h * (b.fx * b.im); b.vy += h * (this.g + b.fy * b.im); b.w += h * b.tau * b.iI;
          b.vx /= 1 + h * b.dmpL; b.vy /= 1 + h * b.dmpL; b.w /= 1 + h * b.dmpA;
          b.vx = lim(b.vx, -this.vmax, this.vmax); b.vy = lim(b.vy, -this.vmax, this.vmax); b.w = lim(b.w, -this.wmax, this.wmax);
        }
        this._giuntiWarm(); this._contattiWarm();
        this._giuntiRisolvi(h, true, Sg); this._contattiRisolvi(h, true, Sc);
        for (const b of corpi) { if (b.im === 0) continue; b.x += h * b.vx; b.y += h * b.vy; b.a += h * b.w; }
        this._giuntiRisolvi(h, false, Sg); this._contattiRisolvi(h, false, Sc);
      }
      this._rimbalzo();
      for (const b of corpi) { b.fx = b.fy = b.tau = 0; b.terra = 0; b.scivola = 0; }
      for (const c of this.contatti) {
        if (c.ny === -1) {
          c.b.terra += c.iN;
          const vt = Math.abs(c.b.vx - c.b.w * c.ry);
          if (c.iN > 0) c.b.scivola = Math.max(c.b.scivola, vt);
        }
      }
      this.t += dt;
      // sonno: se tutto e' fermo da un po' non si calcola piu' (niente tremolii, niente costi)
      if (this.sonno) {
        const fermo = corpi.every(b => Math.hypot(b.vx, b.vy) < 1.5 && Math.abs(b.w) < 0.04);
        this.fermo = fermo ? this.fermo + 1 : 0;
        if (this.fermo > 40) {
          this.dorme = true;
          for (const b of corpi) { b.vx = b.vy = b.w = 0; }
          for (const j of this.giunti) { j.ix = j.iy = j.iMot = j.iLo = j.iHi = 0; }
        }
      }
    }
  }

  return {Mondo, Corpo, Giunto, asta, morbido, lim, PI2};
})();
if (typeof module !== "undefined") module.exports = Fisica;
