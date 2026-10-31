/* Urban — la pagina della Palestra: UNA schermata, senza liste da scorrere.
   In alto la barra di comando (titolo, settimana, serate, comandi), poi la scena (scena_palestra.js) con gli allievi, in basso
   una cartina per allievo. Tutto il resto si apre a comparsa: la scheda dell'allievo (cassetto a destra, tre schede: profilo,
   programma, allenamento), gli eventi, il registro, la struttura; i cambi di piano e di allenamento sono menu (popover) sul
   bottone che li chiama. Lo stato si legge da /api/palestra/stato (palestra.vista() lato server) e si cambia con
   /api/palestra/azione: il server decide, questa pagina racconta e raccoglie le scelte. */
const app = document.getElementById("pal-app");
let S = null;               // la vista corrente
let scena = null;
let riepilogo = null;       // cosa e' successo nelle ultime giornate (si vede nel registro e, in breve, sulla scena)
let esitoEvento = null;     // cosa e' successo con l'ultima scelta
let occupato = false;
let sospesa = false;        // la pagina e' parcheggiata (v. nav.js): la scena non gira
const ui = {pid: null, tab: "profilo", regTab: "giorno", eventiVisti: ""};
let menu = null;            // il menu a comparsa aperto: {voci, onPick, ancora}
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const num = (n) => String(n).replace(".", ",");
const MOTIVI = {coma: "è in coma", ordine: "per ordine tuo", crollo: "è crollato dalla stanchezza", ferito: "è troppo malconcio",
                svogliato: "non ne ha voglia", rischio: "si allena anche ferito"};
const SPECIALI = {duello: "⚔", salta: "–", libero: "·"};
const $ = (id) => document.getElementById(id);

async function chiama(url, corpo) {
  const r = await fetch(url, corpo ? {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(corpo)} : {});
  return {ok: r.ok, dati: await r.json()};
}

async function azione(corpo) {
  if (occupato) return null;
  occupato = true;
  try {
    const {ok, dati} = await chiama("/api/palestra/azione", corpo);
    if (dati.stato) S = dati.stato;
    if (!ok) aviso(dati.errore || "Non si può.");
    else {
      if (dati.riepiloghi) riepilogo = dati.riepiloghi;
      if (dati.esito) esitoEvento = dati.esito;
      if (corpo.tipo === "avanti" || corpo.tipo === "settimana") esitoEvento = null;
    }
    disegnaTutto();
    if (scena) scena.aggiorna(S);
    if (ok && (corpo.tipo === "avanti" || corpo.tipo === "settimana")) { mostraToast(); if (dati.avviso) aviso(dati.avviso); }
    if (window.Nav) Nav.rinfrescaTesta();                 // la data (e i crediti) in alto
    return ok ? dati : null;
  } finally { occupato = false; }
}

/* ------------------------------------------------------------------------------------------------ avvisi sulla scena */
function aviso(t) {
  const wrap = document.querySelector(".pal-scena-wrap");
  if (!wrap) return;
  wrap.querySelector(".pal-aviso")?.remove();
  const el = document.createElement("div");
  el.className = "pal-aviso"; el.setAttribute("role", "status"); el.textContent = t;
  wrap.appendChild(el);
  clearTimeout(aviso.t); aviso.t = setTimeout(() => el.remove(), 3500);
}

/* il rapporto della giornata: poche righe sulla scena (le ferite, chi matura, i soldi, le note), il resto nel registro */
function mostraToast() {
  const box = $("pal-toasts");
  if (!box || !riepilogo || !riepilogo.length) return;
  const righe = [];
  for (const r of riepilogo) {
    for (const m of r.membri) {
      if (m.ferita) righe.push(["ferita", "⚠ " + m.testo]);
      if (m.crediti) righe.push(["nota", `+${m.crediti}¤ da ${m.nome.split(" ")[0]}`]);
    }
    for (const t of r.righe) righe.push(["nota", t]);
  }
  const titolo = riepilogo.length > 1 ? `Ultimi ${riepilogo.length} giorni` : "Ieri in palestra";
  const mostra = righe.slice(0, 4);
  box.innerHTML = `<div class="pal-toast" role="status">
      <div class="pal-toast-testa"><span>${titolo}</span><button type="button" class="pal-icona" data-az="toast-chiudi" aria-label="Chiudi">×</button></div>
      ${mostra.length ? mostra.map(([c, t]) => `<div class="pal-toast-riga ${c}">${esc(t)}</div>`).join("") : `<div class="pal-toast-riga">Giornata tranquilla: nessuno si è fatto male.</div>`}
      <div class="pal-toast-piede"><button type="button" class="btn btn-ghost btn-sm" data-az="reg" data-tab="giorno">${righe.length > 4 ? `Tutto il rapporto (+${righe.length - 4})` : "Rapporto completo"}</button></div>
    </div>`;
  clearTimeout(mostraToast.t);
  mostraToast.t = setTimeout(function nascondi() {
    if (box.querySelector(".pal-toast:hover")) { mostraToast.t = setTimeout(nascondi, 2000); return; }   // se ci si e' fermati sopra, resta
    box.innerHTML = "";
  }, 9000);
}

/* ------------------------------------------------------------------------------------------------ pezzi di pagina */
function nomeAttivita(att) { return (S.sessioni[att] || {}).nome || S.attivita_speciali[att] || att; }
function siglaAttivita(att) { return (S.sessioni[att] || {}).sigla || SPECIALI[att] || "·"; }

function barra(valore, tipo) {
  const v = Math.max(0, Math.min(100, valore));
  const cls = tipo === "stress" ? (v < 50 ? "pct-hi" : v < 80 ? "pct-mid" : "pct-low") : (v >= 50 ? "pct-hi" : v >= 25 ? "pct-mid" : "pct-low");
  return `<div class="hpbar"><div class="hpbar-fill ${cls}" style="width:${v}%"></div></div>`;
}

function hpPct(m) {
  let val = 0, mx = 0;
  for (const h of Object.values(m.hp)) { val += Math.max(0, h.val); mx += h.max; }
  return Math.round(100 * val / mx);
}

function vocePerChiave(m, chiave) {
  return chiave && m.focus ? Object.values(m.focus).flatMap(f => f.voci).find(v => v.chiave === chiave) : null;
}

/* le serate saltate: un pallino per ogni giornata chiusa senza salire sul ring (al massimo tre di fila; poi se ne gioca una) */
function pallini(se) {
  const pieni = se.fatta_oggi ? 0 : se.saltate;
  const dots = Array.from({length: se.max}, (_, i) => `<i class="pallino ${i < pieni ? "on" : ""}"></i>`).join("");
  const nota = se.bloccato ? "Oggi si combatte: la giornata non si chiude senza una serata."
    : se.fatta_oggi ? "Hai già fatto la serata di oggi: il conto riparte da zero."
    : !se.possibile ? "Oggi nessuno può salire sul ring: non conta come giornata saltata."
    : `Giornate chiuse di fila senza una serata (${se.saltate}/${se.max}). Alla terza, la prossima giornata richiede una serata.`;
  return `<a class="serate ${se.bloccato ? "bloccato" : ""}" href="/duelli" title="${esc(nota)}"><span>Serate saltate</span><span class="pallini">${dots}</span></a>`;
}

/* ---- barra di comando ---- */
function hud() {
  const p = S.eventi.length, se = S.serate;
  const stop = p ? "Prima rispondi agli eventi" : se.bloccato ? "Prima fai una serata" : "";
  const pieno = S.occupati >= S.capienza;
  const giorni = S.giorni.map((g, i) => `<div class="pal-giorno ${i === S.giorno_settimana ? "oggi" : i < S.giorno_settimana ? "passato" : ""}">${g}</div>`).join("");
  return `
    <div class="pal-titolo"><h1>LA PALESTRA</h1><div class="pal-data">${esc(S.data)}</div></div>
    <div class="pal-settimana" title="Giorno ${S.giorno + 1} della partita"><span>Sett. ${S.settimana}</span><div class="pal-giorni">${giorni}</div></div>
    <div class="pal-comandi">
      <span class="chip-info ${pieno ? "chip-pieno" : ""}" title="Allievi in palestra / posti">Allievi ${S.occupati}/${S.capienza}</span>
      ${pallini(se)}
      ${p ? `<button type="button" class="btn btn-risposta btn-sm pal-eventi-btn" data-az="dlg" data-dlg="evento">⚠ Eventi (${p})</button>` : ""}
      <button type="button" class="btn btn-ghost btn-sm" data-az="dlg" data-dlg="registro">📜 Registro</button>
      <button type="button" class="btn btn-ghost btn-sm" data-az="dlg" data-dlg="struttura">🏋 Struttura</button>
      <button type="button" class="btn btn-ghost btn-sm" data-az="settimana" title="${stop || "Passa la settimana (si ferma a un evento o alla domenica)"}" ${stop ? "disabled" : ""}>Settimana ⏩</button>
      <button type="button" class="btn btn-volt btn-sm" data-az="avanti" title="${stop || "Chiudi la giornata"}" ${stop ? "disabled" : ""}>Fine giornata ▶</button>
    </div>`;
}

/* ---- le cartine degli allievi ---- */
const cacheRit = new Map();            // "id:grande" -> {chiave, cv}: il ritratto si disegna una volta, poi si sposta da un ridisegno all'altro
function ritratto(m, grande = false) {
  return `<span class="pal-ritratto ${grande ? "grande" : ""}" data-ritratto="${m.id}" data-g="${grande ? 1 : 0}" aria-hidden="true"></span>`;
}
function montaRitratti(radice) {
  for (const sp of radice.querySelectorAll("[data-ritratto]")) {
    const m = S.membri.find(x => x.id === +sp.dataset.ritratto);
    if (!m) continue;
    const k = m.id + ":" + sp.dataset.g, chiave = JSON.stringify(m.aspetto);
    let c = cacheRit.get(k);
    if (!c || c.chiave !== chiave) {
      const cv = document.createElement("canvas");
      Arena.anteprima(cv, m.aspetto, 2);
      c = {chiave, cv}; cacheRit.set(k, c);
    }
    sp.replaceChildren(c.cv);
  }
}

function cartina(m) {
  const o = m.oggi, voce = vocePerChiave(m, o.voce);
  const stato = m.salute === "pronto" ? "" : `<i class="pal-punto ${m.salute}" title="${m.salute === "coma" ? "In coma" : "Ferito"}"></i>`;
  const motivo = o.motivo ? ` (${MOTIVI[o.motivo] || ""})` : "";
  return `<button type="button" class="pal-allievo stato-${m.salute} ${ui.pid === m.id ? "on" : ""}" data-az="allievo" data-id="${m.id}" aria-label="Apri la scheda di ${esc(m.nome)}">
      ${ritratto(m)}
      <span class="pal-al-info">
        <span class="pal-al-nome">${stato}<span>${esc(m.nome)}</span></span>
        <span class="pal-al-sub">Liv ${m.livello} · ${m.eta} anni${m.token ? ` · 🧬 ${m.token}` : ""}</span>
        <span class="pal-al-oggi" title="${esc(nomeAttivita(o.attivita) + (voce ? " · " + voce.nome : "") + motivo)}"><b class="pal-sigla">${esc(siglaAttivita(o.attivita))}</b>${esc(nomeAttivita(o.attivita))}${voce ? ` · ${esc(voce.nome)}` : ""}</span>
      </span>
      <span class="pal-mini">
        <span title="Salute ${hpPct(m)}%">Sal${barra(hpPct(m), "fiducia")}</span>
        <span title="Fiducia ${m.fiducia}/100">Fid${barra(m.fiducia, "fiducia")}</span>
        <span title="Stress ${m.stress}/100">Str${barra(m.stress, "stress")}</span>
      </span>
    </button>`;
}

function dock() {
  if (!S.membri.length) return `<div class="pal-vuota"><span>La palestra è vuota. Ci vuole qualcuno da allenare.</span><a class="btn btn-volt btn-sm" href="/contratti">Vai agli aspiranti →</a></div>`;
  return S.membri.map(cartina).join("");
}

/* ---- la scheda dell'allievo (cassetto) ---- */
const TAB_ALLIEVO = [["profilo", "Profilo"], ["programma", "Programma"], ["allena", "Allenamento"]];

function tabProfilo(m) {
  const o = m.oggi, voce = vocePerChiave(m, o.voce);
  const tratti = m.tratti.map(t => `<span class="tratto" title="${esc(t.descrizione)}">${esc(t.nome)}</span>`).join("") +
    Array.from({length: m.tratti_nascosti}, () => `<span class="tratto nascosto" title="Un tratto ancora da scoprire: parlaci, o aspetta una settimana">?</span>`).join("");
  const stato = m.salute === "pronto" ? "" : `<span class="badge badge-${m.salute}">${m.salute.toUpperCase()}</span>`;
  const riga = (et, v, tipo, titolo) => `<div class="pal-stat" title="${titolo}"><span>${et}</span>${barra(v, tipo)}<span>${v}</span></div>`;
  return `
    <div class="pal-riga-id">
      ${ritratto(m, true)}
      <div>
        <div class="pal-badges">${stato}<span class="badge badge-rango">LIV ${m.livello}</span><span class="muted">${m.eta} anni · ${m.vittorie}V / ${m.sconfitte}S</span>${m.token ? `<span class="token-mini" title="Token disponibili per salire di rango">🧬 ${m.token}</span>` : ""}</div>
        <div class="tratti-riga">${tratti}</div>
      </div>
    </div>
    <div class="pal-sez">
      <h3>Condizioni</h3>
      ${riga("Salute", hpPct(m), "fiducia", "Hp rimasti, in percentuale")}
      ${riga("Fiducia", m.fiducia, "fiducia", "Sotto 25 rifiuta il ring")}
      ${riga("Stress", m.stress, "stress", "A 100 crolla")}
      ${!m.vuole_combattere ? `<div class="pal-avviso-card">Non si fida abbastanza: rifiuta il ring.</div>` : ""}
    </div>
    <div class="pal-sez">
      <h3>Oggi</h3>
      <div class="pal-oggi"><b class="pal-sigla">${esc(siglaAttivita(o.attivita))}</b><b>${esc(nomeAttivita(o.attivita))}</b>${voce ? ` <span class="volt">· ${esc(voce.nome)}</span>` : ""}${o.motivo ? ` <span class="muted">(${MOTIVI[o.motivo] || ""})</span>` : ""}${o.partner != null ? ` <span class="muted">con ${esc((S.membri.find(x => x.id === o.partner) || {}).nome || "?")}</span>` : ""}</div>
    </div>
    <div class="pal-sez">
      <h3>Ordini</h3>
      <div class="pal-badges">
        <button type="button" class="btn btn-ghost btn-sm" data-az="riposo" data-id="${m.id}" aria-haspopup="menu">${o.motivo === "ordine" ? "Riposo ordinato ▾" : "Ordina il riposo ▾"}</button>
        <label class="pal-auto" title="Se è troppo malconcio per la sessione, riposa"><input type="checkbox" data-az="auto" data-id="${m.id}" ${m.auto_riposo ? "checked" : ""}> riposo automatico</label>
      </div>
    </div>`;
}

function tabProgramma(m) {
  const celle = S.giorni.map((g, i) => {
    const k = m.piano[i], s = S.sessioni[k] || {};
    return `<button type="button" class="pal-cella ${i === S.giorno_settimana ? "oggi" : ""}" data-az="giorno" data-id="${m.id}" data-g="${i}" aria-haspopup="menu"
        aria-label="${g}: ${esc(s.nome || k)}. Cambia"><span>${g}</span><span class="pal-sigla">${esc(s.sigla || "·")}</span><span>${esc(s.nome || k)}</span></button>`;
  }).join("");
  const oggi = m.oggi, previsto = S.sessioni[m.piano[S.giorno_settimana]];
  const diversa = oggi.attivita !== m.piano[S.giorno_settimana];
  return `
    <div class="pal-sez">
      <h3>Programma della settimana</h3>
      <div class="pal-piano">${celle}</div>
      <p class="muted">Tocca un giorno per cambiare sessione: il programma si ripete ogni settimana.</p>
    </div>
    ${diversa ? `<div class="pal-oggi">Oggi era in programma <b>${esc(previsto ? previsto.nome : "?")}</b>, ma fa <b>${esc(nomeAttivita(oggi.attivita))}</b>${oggi.motivo ? ` <span class="muted">(${MOTIVI[oggi.motivo] || ""})</span>` : ""}.</div>` : ""}`;
}

function tabAllena(m) {
  const righe = Object.entries(m.focus).map(([sid, f]) => {
    const v = f.voci.find(x => x.chiave === f.scelta);
    const nota = !v ? "" : v.pieno ? "Al massimo" : v.maturo ? "Matura: serve un Token per salire di rango" : `${num(v.punti)} / ${v.richiesti} punti per il rango ${v.rango + 1}`;
    const pct = !v || v.pieno ? 100 : Math.round(100 * v.punti / v.richiesti);
    return `<div class="pal-voce">
        <span>${esc(S.sessioni[sid].nome)}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-az="voce" data-id="${m.id}" data-s="${sid}" aria-haspopup="menu">${esc(v ? v.nome + " r" + v.rango : "—")} ▾</button>
        ${v ? barra(pct, "fiducia") : ""}
        <span class="pal-voce-nota">${esc(nota)}</span>
      </div>`;
  }).join("");
  return `<div class="pal-sez"><h3>Cosa allena in ogni sessione</h3>${righe}<p class="muted">Per salire di rango servono i punti (qui) e un Token (dai duelli): la scheda completa li spende.</p></div>`;
}

function drawerAllievo(m) {
  const i = S.membri.findIndex(x => x.id === m.id), n = S.membri.length;
  const corpo = {profilo: tabProfilo, programma: tabProgramma, allena: tabAllena}[ui.tab](m);
  return `
    <div class="pal-dlg-testa">
      <button type="button" class="pal-icona" data-az="prossimo" data-dir="-1" aria-label="Allievo precedente" ${n < 2 ? "disabled" : ""}>‹</button>
      <div class="pal-dlg-titolo"><h2>${esc(m.nome)}</h2><div class="fc-liv">${i + 1} di ${n}</div></div>
      <button type="button" class="pal-icona" data-az="prossimo" data-dir="1" aria-label="Allievo successivo" ${n < 2 ? "disabled" : ""}>›</button>
      <button type="button" class="pal-icona" data-az="chiudi" aria-label="Chiudi">×</button>
    </div>
    <div class="pal-tabs" role="tablist">${TAB_ALLIEVO.map(([k, t]) => `<button type="button" role="tab" class="pal-tab" aria-selected="${ui.tab === k}" data-az="tab" data-tab="${k}">${t}</button>`).join("")}</div>
    <div class="pal-dlg-corpo" role="tabpanel">${corpo}</div>
    <div class="pal-dlg-piede"><a class="btn btn-ghost btn-sm" href="/personaggio/${m.id}">Scheda completa →</a><span class="muted">Colloquio, rango, equipaggiamento.</span></div>`;
}

/* ---- gli eventi ---- */
function dlgEvento() {
  if (esitoEvento) {
    return `
      <div class="pal-dlg-testa"><div class="pal-dlg-titolo"><h2>Com'è andata</h2></div></div>
      <div class="pal-dlg-corpo"><p class="pal-testo">${esc(esitoEvento.esito)}</p>
        ${esitoEvento.righe.length ? `<ul class="pal-esito-righe">${esitoEvento.righe.map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}</div>
      <div class="pal-dlg-piede"><button type="button" class="btn btn-volt" data-az="esito-ok">${S.eventi.length ? "Prossimo evento →" : "Continua"}</button></div>`;
  }
  const e = S.eventi[0];
  if (!e) return `
      <div class="pal-dlg-testa"><div class="pal-dlg-titolo"><h2>Nessun evento</h2></div><button type="button" class="pal-icona" data-az="chiudi" aria-label="Chiudi">×</button></div>
      <div class="pal-dlg-corpo"><p class="muted">Niente da decidere: la giornata può passare.</p></div>`;
  return `
    <div class="pal-dlg-testa">
      <div class="pal-dlg-titolo"><h2>${esc(e.titolo)}</h2><div class="fc-liv">Da gestire${S.eventi.length > 1 ? ` · 1 di ${S.eventi.length}` : ""}</div></div>
      <button type="button" class="pal-icona" data-az="chiudi" aria-label="Chiudi: decidi dopo">×</button>
    </div>
    <div class="pal-dlg-corpo">
      <p class="pal-testo">${esc(e.testo)}</p>
      <div class="pal-scelte">${e.scelte.map(s => `<button type="button" class="btn btn-ghost pal-scelta" data-az="scelta" data-id="${e.id}" data-scelta="${s.id}" ${s.ok ? "" : "disabled"}>
          <span>${esc(s.testo)}</span>${s.ok ? "" : `<small>${esc(s.motivo)}</small>`}</button>`).join("")}</div>
    </div>
    <div class="pal-dlg-piede"><span class="muted">Finché non rispondi il tempo non passa.</span></div>`;
}

/* ---- il registro: il rapporto delle ultime giornate e il diario ---- */
function dlgRegistro() {
  let corpo;
  if (ui.regTab === "giorno") {
    if (!riepilogo || !riepilogo.length) corpo = `<p class="muted">Ancora nessuna giornata passata da quando hai aperto la palestra: premi "Fine giornata".</p>`;
    else {
      const righe = [];
      for (const r of riepilogo) {
        righe.push(`<div class="pal-rie-giorno">${esc(r.data)}</div>`);
        for (const m of r.membri) righe.push(`<div class="pal-rie-riga ${m.ferita ? "ferita" : ""} ${m.maturo ? "maturo" : ""}">${esc(m.testo)}${m.crediti ? ` <b class="volt">+${m.crediti}¤</b>` : ""}${m.curato && (m.attivita === "riposo") ? ` <span class="muted">(+${m.curato} hp)</span>` : ""}</div>`);
        for (const t of r.righe) righe.push(`<div class="pal-rie-riga nota">${esc(t)}</div>`);
      }
      corpo = righe.join("");
    }
  } else {
    corpo = S.registro.length ? `<ul class="registro-lista">${[...S.registro].reverse().map(r => `<li><span class="muted">g${r.g + 1}</span> ${esc(r.t)}</li>`).join("")}</ul>` : `<p class="muted">Ancora niente da raccontare.</p>`;
  }
  return `
    <div class="pal-dlg-testa"><div class="pal-dlg-titolo"><h2>Registro</h2></div><button type="button" class="pal-icona" data-az="chiudi" aria-label="Chiudi">×</button></div>
    <div class="pal-tabs" role="tablist">${[["giorno", "Ultime giornate"], ["diario", "Diario"]].map(([k, t]) => `<button type="button" role="tab" class="pal-tab" aria-selected="${ui.regTab === k}" data-az="reg-tab" data-tab="${k}">${t}</button>`).join("")}</div>
    <div class="pal-dlg-corpo" role="tabpanel">${corpo}</div>`;
}

/* ---- la struttura: attrezzi, istruttori, caduti ---- */
function dlgStruttura() {
  const attr = (S.attrezzi_info || []).map(a => `<li><b>${esc(a.nome)}</b><span class="muted">${esc(a.effetto)}</span></li>`).join("");
  const istr = S.istruttori.map(i => `<li><a href="/personaggio/${i.id}"><b>${esc(i.nome)}</b></a><span class="muted">${i.eta} anni · insegna ${esc(i.voce)}</span></li>`).join("");
  const cad = S.caduti.map(c => `<li><a href="/personaggio/${c.id}">✝ ${esc(c.nome)}</a><span class="muted">giorno ${c.giorno + 1}</span></li>`).join("");
  return `
    <div class="pal-dlg-testa"><div class="pal-dlg-titolo"><h2>Struttura</h2><div class="fc-liv">${S.occupati} allievi su ${S.capienza} posti</div></div><button type="button" class="pal-icona" data-az="chiudi" aria-label="Chiudi">×</button></div>
    <div class="pal-dlg-corpo">
      <div class="pal-sez"><h3>Attrezzi (${(S.attrezzi_info || []).length})</h3><ul class="pal-elenco">${attr}</ul></div>
      ${S.istruttori.length ? `<div class="pal-sez"><h3>Istruttori</h3><ul class="pal-elenco">${istr}</ul></div>` : ""}
      ${S.caduti.length ? `<div class="pal-sez"><h3>Muro dei caduti</h3><ul class="pal-elenco">${cad}</ul></div>` : ""}
    </div>
    <div class="pal-dlg-piede"><a class="btn btn-ghost btn-sm" href="/negozio#attrezzi">Altri attrezzi →</a><a class="btn btn-ghost btn-sm" href="/contratti">Aspiranti →</a></div>`;
}

/* ------------------------------------------------------------------------------------------------ finestre e menu */
const dlg = (n) => $("dlg-" + n);
function disegnaDlg(n) {
  const d = dlg(n);
  if (!d || !S) return;
  if (n === "allievo") {
    const m = S.membri.find(x => x.id === ui.pid);
    if (!m) { if (d.open) d.close(); return; }
    d.innerHTML = drawerAllievo(m);
  } else d.innerHTML = {evento: dlgEvento, registro: dlgRegistro, struttura: dlgStruttura}[n]();
  montaRitratti(d);
}
function apriDlg(n) {
  disegnaDlg(n);
  const d = dlg(n);
  if (d && !d.open) d.showModal();
}
function apriAllievo(pid) {
  if (!S || !S.membri.some(m => m.id === pid)) return;
  ui.pid = pid; ui.tab = "profilo";
  apriDlg("allievo");
  $("pal-dock").innerHTML = dock(); montaRitratti($("pal-dock"));
}
function chiudiTutto() {
  chiudiMenu();
  for (const d of app.querySelectorAll("dialog[open]")) d.close();
}

function chiudiMenu() {
  const el = $("pal-menu");
  if (!el || !menu) return;
  const ancora = menu.ancora;
  menu = null;
  try { if (el.matches(":popover-open")) el.hidePopover(); } catch (e) { /* non supportato */ }
  el.hidden = true;
  if (ancora && ancora.isConnected) ancora.focus({preventScroll: true});
}
/* un menu sul bottone `ancora`: voci = [{t, s, sel, off, ...}], onPick(voce) */
function apriMenu(ancora, titolo, voci, onPick) {
  const el = $("pal-menu");
  if (menu) chiudiMenu();
  menu = {voci, onPick, ancora};
  el.innerHTML = (titolo ? `<div class="pal-menu-titolo">${esc(titolo)}</div>` : "") +
    voci.map((v, i) => `<button type="button" role="menuitemradio" aria-checked="${v.sel ? "true" : "false"}" data-i="${i}" ${v.off ? "disabled" : ""} ${v.s ? `title="${esc(v.s)}"` : ""}>${esc(v.t)}${v.s ? `<small>${esc(v.s)}</small>` : ""}</button>`).join("");
  el.hidden = false;
  try { if (el.showPopover && !el.matches(":popover-open")) el.showPopover(); } catch (e) { /* senza popover resta sopra con position: fixed */ }
  const r = ancora.getBoundingClientRect();
  el.style.left = "0px"; el.style.top = "0px";
  const w = el.offsetWidth, h = el.offsetHeight;
  const x = Math.min(Math.max(8, r.left), innerWidth - w - 8);
  let y = r.bottom + 6;
  if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
  el.style.left = x + "px"; el.style.top = y + "px";
  (el.querySelector('button[aria-checked="true"]:not(:disabled)') || el.querySelector("button:not(:disabled)"))?.focus({preventScroll: true});
}

function menuPiano(ancora, m, g) {
  const voci = Object.entries(S.sessioni).map(([k, s]) => ({id: k, t: `${s.sigla} · ${s.nome}`, s: s.desc, sel: m.piano[g] === k}));
  apriMenu(ancora, `${m.nome.split(" ")[0]} · ${S.giorni[g]}`, voci, (v) => azione({tipo: "piano", pid: m.id, giorno: g, sessione: v.id}));
}
function menuFocus(ancora, m, sid) {
  const f = m.focus[sid];
  const voci = f.voci.map(v => ({id: v.chiave, t: `${v.nome} r${v.rango}`, off: v.pieno, sel: v.chiave === f.scelta,
                                  s: v.pieno ? "Al massimo" : v.maturo ? "Matura: serve un Token" : `${num(v.punti)} / ${v.richiesti} punti`}));
  apriMenu(ancora, S.sessioni[sid].nome, voci, (v) => azione({tipo: "focus", pid: m.id, sessione: sid, voce: v.id}));
}
function menuRiposo(ancora, m) {
  const voci = [1, 2, 3, 5, 7].map(n => ({id: n, t: n === 1 ? "1 giorno" : `${n} giorni`}));
  if (m.oggi.motivo === "ordine") voci.unshift({id: 0, t: "Annulla il riposo", s: "Torna al programma"});
  apriMenu(ancora, "Ordina il riposo", voci, (v) => azione({tipo: "riposo", pid: m.id, giorni: v.id}));
}

/* ------------------------------------------------------------------------------------------------ disegno e comandi */
function disegnaTutto() {
  if (!S) return;
  chiudiMenu();
  $("pal-hud").innerHTML = hud();
  $("pal-dock").innerHTML = dock(); montaRitratti($("pal-dock"));
  for (const n of ["allievo", "evento", "registro", "struttura"]) if (dlg(n).open) disegnaDlg(n);
  // gli eventi in sospeso si aprono da soli, una volta; se li chiudi con la X li ritrovi nella barra
  const ids = S.eventi.map(e => e.id).join(",");
  if (!ids) ui.eventiVisti = "";
  else if (ids !== ui.eventiVisti && !esitoEvento) { ui.eventiVisti = ids; apriDlg("evento"); }
  if (!S.eventi.length && !esitoEvento && dlg("evento").open) dlg("evento").close();
}

function prossimo(dir) {
  const i = S.membri.findIndex(m => m.id === ui.pid);
  if (i < 0 || S.membri.length < 2) return;
  ui.pid = S.membri[(i + dir + S.membri.length) % S.membri.length].id;
  disegnaDlg("allievo");
  $("pal-dock").innerHTML = dock(); montaRitratti($("pal-dock"));
}

app.addEventListener("click", (e) => {
  const voce = e.target.closest("#pal-menu button[data-i]");
  if (voce && menu) { const v = menu.voci[+voce.dataset.i], f = menu.onPick; chiudiMenu(); f(v); return; }
  if (e.target.tagName === "DIALOG") { e.target.close(); return; }                // un clic sullo sfondo chiude
  const el = e.target.closest("[data-az]");
  if (!el || !S || el.type === "checkbox") return;
  const az = el.dataset.az, id = el.dataset.id !== undefined ? +el.dataset.id : null;
  const m = id != null ? S.membri.find(x => x.id === id) : null;
  switch (az) {
    case "avanti": case "settimana": azione({tipo: az}); break;
    case "dlg": apriDlg(el.dataset.dlg); break;
    case "reg": ui.regTab = el.dataset.tab; apriDlg("registro"); break;
    case "reg-tab": ui.regTab = el.dataset.tab; disegnaDlg("registro"); break;
    case "allievo": apriAllievo(id); break;
    case "tab": ui.tab = el.dataset.tab; disegnaDlg("allievo"); break;
    case "prossimo": prossimo(+el.dataset.dir); break;
    case "chiudi": el.closest("dialog").close(); break;
    case "toast-chiudi": $("pal-toasts").innerHTML = ""; break;
    case "giorno": if (m) menuPiano(el, m, +el.dataset.g); break;
    case "voce": if (m) menuFocus(el, m, el.dataset.s); break;
    case "riposo": if (m) menuRiposo(el, m); break;
    case "scelta": azione({tipo: "evento", id, scelta: el.dataset.scelta}); break;
    case "esito-ok":
      esitoEvento = null;
      if (S.eventi.length) { ui.eventiVisti = S.eventi.map(x => x.id).join(","); disegnaDlg("evento"); } else dlg("evento").close();
      break;
  }
});
app.addEventListener("change", (e) => {
  const el = e.target.closest('[data-az="auto"]');
  if (el) azione({tipo: "auto_riposo", pid: +el.dataset.id, valore: el.checked});
});
/* passare col mouse su una cartina evidenzia l'allievo nella scena */
app.addEventListener("pointerover", (e) => { const c = e.target.closest(".pal-allievo"); if (scena && c) scena.hover = +c.dataset.id; });
app.addEventListener("pointerout", (e) => { if (scena && e.target.closest(".pal-allievo")) scena.hover = null; });
/* il menu si chiude con Esc (senza chiudere anche la finestra sotto) e con un clic fuori */
document.addEventListener("pointerdown", (e) => { if (menu && !e.target.closest("#pal-menu") && !e.target.closest("[aria-haspopup]")) chiudiMenu(); }, true);
document.addEventListener("keydown", (e) => {
  if (menu && app.isConnected && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); chiudiMenu(); return; }
  if (menu && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    const b = [...$("pal-menu").querySelectorAll("button:not(:disabled)")], i = b.indexOf(document.activeElement);
    if (b.length) { e.preventDefault(); b[(i + (e.key === "ArrowDown" ? 1 : -1) + b.length) % b.length].focus(); }
  }
}, true);

/* ------------------------------------------------------------------------------------------------ vita della pagina */
async function ricarica() {
  const {dati} = await chiama("/api/palestra/stato");
  S = dati;
  disegnaTutto();
  if (scena) scena.aggiorna(S);
}
/* La palestra resta viva mentre si guarda un'altra scheda (nav.js): al ritorno si riprende da dove era, con lo stato di adesso. */
window.Vive = window.Vive || {};
window.Vive.palestra = {
  sospendi() { sospesa = true; chiudiTutto(); if (scena) scena.pausa(); },
  riprendi() { sospesa = false; if (scena) scena.riprendi(); return S ? ricarica() : null; },
};

async function avvia() {
  app.innerHTML = `
    <div id="pal-hud" class="pal-hud"></div>
    <div class="pal-scena-wrap">
      <div class="arena pal-scena" id="pal-scena"><div class="pal-caricamento">Carico gli allievi…</div></div>
      <div class="pal-toasts" id="pal-toasts"></div>
    </div>
    <div id="pal-dock" class="pal-dock"></div>
    <dialog class="pal-dlg pal-drawer" id="dlg-allievo" aria-label="Scheda dell'allievo"></dialog>
    <dialog class="pal-dlg" id="dlg-evento" aria-label="Evento di palestra"></dialog>
    <dialog class="pal-dlg" id="dlg-registro" aria-label="Registro della palestra"></dialog>
    <dialog class="pal-dlg" id="dlg-struttura" aria-label="Struttura della palestra"></dialog>
    <div class="pal-menu" id="pal-menu" popover="manual" role="menu" hidden></div>`;
  for (const n of ["allievo", "evento", "registro", "struttura"]) {
    const d = dlg(n);
    d.addEventListener("cancel", (e) => { if (menu) { e.preventDefault(); chiudiMenu(); } });      // Esc chiude prima il menu
    d.addEventListener("close", () => {
      chiudiMenu();
      if (n === "allievo") { ui.pid = null; if (S) { $("pal-dock").innerHTML = dock(); montaRitratti($("pal-dock")); } }
      if (n === "evento" && esitoEvento) { esitoEvento = null; if (S) disegnaTutto(); }
    });
  }
  // la scena non si allunga oltre quel che serve alla sua scala (+ un po' di soffitto): lo spazio che avanza diventa margine, non un buco scuro
  const wrap = document.querySelector(".pal-scena-wrap"), sc = $("pal-scena");
  new ResizeObserver(() => {
    const H = wrap.clientHeight, W = wrap.clientWidth;
    const Sc = Math.max(1, Math.min(Math.floor((H - 14 + 40) / 141), Math.floor(W / 380)));
    sc.style.height = Math.min(H, 14 + 141 * Sc + 50) + "px";
  }).observe(wrap);
  const {dati} = await chiama("/api/palestra/stato");
  S = dati;
  disegnaTutto();
  try {
    scena = await ScenaPalestra.crea($("pal-scena"), {alClick: (pid) => apriAllievo(pid)});
    scena.aggiorna(S);
    if (sospesa) scena.pausa();
  } catch (e) {
    console.error("scena della palestra non disponibile", e);
    const el = $("pal-scena"); if (el) el.style.display = "none";
  }
}
avvia();
