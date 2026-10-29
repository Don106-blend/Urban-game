/* Urban — client del duello: rende lo stato e invia azioni a /api/duello */
let S = null;          // ultimo stato ricevuto
let menu = null;       // null = menu principale; "attacchi" | "poteri" | "stance" | "mira" | "parata"
let cpuTimer = null;
const CPU_DELAY = 2600;  // pausa tra le azioni della CPU: il tempo di leggere la scheda dello scambio

/* abbandonare il combattimento in qualsiasi modo = sconfitta */
const MSG_ABBANDONO = "Sei sicuro di abbandonare il combattimento? Risulterà in una sconfitta.";
window.addEventListener("beforeunload", e => {
  if (S && !S.finito) {
    e.preventDefault();
    e.returnValue = MSG_ABBANDONO;
  }
});
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav a, .wordmark").forEach(a =>
    a.addEventListener("click", e => {
      if (S && !S.finito && !confirm(MSG_ABBANDONO)) e.preventDefault();
    }));
});

const el = id => document.getElementById(id);

async function fetchStato() {
  const r = await fetch("/api/duello/stato");
  S = await r.json();
  render();
  pianificaCpu();
}

async function invia(azione) {
  const r = await fetch("/api/duello/azione", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(azione),
  });
  S = await r.json();
  if (azione.tipo !== "cpu_step") menu = null; // dopo ogni scelta si torna al menu principale
  render();
  pianificaCpu();
}

function pianificaCpu() {
  clearTimeout(cpuTimer);
  if (S && S.fase === "cpu" && !S.finito) {
    cpuTimer = setTimeout(() => invia({tipo: "cpu_step"}), CPU_DELAY);
  }
}

/* ---------- render ---------- */
function render() {
  el("d-round").textContent = "ROUND " + S.round;
  // la mira dell'uno evidenzia la locazione bersaglio sulla scheda dell'altro
  renderPannello("pan-player", S.player, S.cpu.mira);
  renderPannello("pan-cpu", S.cpu, S.player.mira);
  renderScena();
  renderLog();
  renderAzioni();
  effettiNuoviEventi();
}

function staminaBar(r) {
  if (r.stamina == null) return "";
  const pct = r.stamina * 100 / Math.max(1, r.stamina_max);
  const cls = pct > 60 ? "pct-hi" : pct > 30 ? "pct-mid" : "pct-low";
  let tacche = "";
  for (let i = 0; i < r.stamina_max; i++)
    tacche += `<span class="tacca ${i < r.stamina ? "on " + cls : ""}"></span>`;
  return `<span class="stamina-bar" title="Stamina ${r.stamina}/${r.stamina_max}">⚡${tacche}</span>`;
}

/* ---------- arena: bookmaker live, sponsor, reazione del pubblico ---------- */
let importoScommessaBozza = null;  // sopravvive ai re-render mentre l'utente digita

function renderArena() {
  const ar = S.arena;
  if (!ar) return "";  // né duello normale né Torneo Evo: niente arena

  const inTorneo = ar.torneo_pot != null;
  const dest = inTorneo ? " nel montepremi del torneo" : "";

  let bookmaker;
  if (ar.scommessa) {
    const vincita = Math.round(ar.scommessa.importo * ar.scommessa.quota);
    bookmaker = `<div class="arena-riga">Puntati <b>${ar.scommessa.importo}¤</b>
      a <b class="quota-val">${ar.scommessa.quota}x</b>
      <span class="muted">→ +${vincita}¤ se vinci${inTorneo ? " (torneo)" : ""}</span></div>`;
  } else {
    const massimo = inTorneo ? 500 : ar.crediti;
    const bozza = importoScommessaBozza ?? Math.min(50, massimo);
    bookmaker = `<div class="arena-riga">Quota su di te: <b class="quota-val">${ar.quota}x</b>
      ${inTorneo ? `<span class="muted">· montepremi ${ar.torneo_pot}¤</span>` : ""}</div>
      <div class="arena-scommessa-form">
        <input type="number" id="importo-scommessa" min="1" max="${massimo}" step="1"
               value="${bozza}" oninput="importoScommessaBozza=this.value">
        <button class="btn btn-ghost" onclick="piazzaScommessa()" title="Scommetti su di te${dest}">🎰 Scommetti${inTorneo ? " (torneo)" : ""}</button>
      </div>`;
  }

  let sponsor;
  if (ar.sponsor) {
    sponsor = `<div class="arena-riga sponsor-scelto${ar.sponsor.fallito ? " fallito" : ""}">
      <b>${ar.sponsor.nome}</b> <span class="muted">+${ar.sponsor.bonus}¤ · ${ar.sponsor.descrizione}</span>
      ${ar.sponsor.fallito ? ' <span class="chip-crip">CONDIZIONE FALLITA</span>' : ""}
    </div>`;
  } else if (ar.sponsor_offerte && ar.sponsor_offerte.length) {
    sponsor = ar.sponsor_offerte.map(sp => `
      <div class="arena-sponsor-card">
        <div><b>${sp.nome}</b> <span class="muted">+${sp.bonus}¤</span></div>
        <div class="muted">${sp.descrizione}</div>
        <button class="btn btn-ghost" onclick='invia({tipo:"sponsor",id:"${sp.id}"})'>Firma</button>
      </div>`).join("");
  } else {
    sponsor = "";
  }

  const pub = ar.pubblico;
  const pubblico = `
    <div class="hype-bar"><div class="hype-fill" style="width:${pub.hype}%"></div></div>
    <div class="arena-riga muted" title="${esc(pub.tifo)}">${pub.testo}</div>`;

  return `<div class="pan-sec arena-sec">
    ${bookmaker}${sponsor}${pubblico}
  </div>`;
}

async function piazzaScommessa() {
  const val = parseInt(el("importo-scommessa").value, 10);
  if (!val || val <= 0) return;
  importoScommessaBozza = null;
  await invia({tipo: "scommetti", importo: val});
}

function renderPannello(dove, p, mira_su) {
  const hp = Object.entries(p.hp).map(([loc, h]) => {
    const pct = Math.max(0, Math.round(h.val * 100 / h.max));
    // le locazioni con protesi hanno sempre la barra blu (sono cibernetiche,
    // il colore non segue la tiera hi/mid/low come per la carne)
    const cls = h.protesi ? "pct-protesi" : pct > 60 ? "pct-hi" : pct > 30 ? "pct-mid" : "pct-low";
    const mirato = loc === mira_su;
    return `<div class="pan-loc${mirato ? " mirato" : ""}">
      <span>${mirato ? "🎯 " : ""}${h.protesi ? "⚙ " : ""}${loc.replace(/_/g, " ")}${h.crippled ? ' <span class="chip-crip">CR</span>' : ""}</span>
      <div class="hpbar"><div class="hpbar-fill ${cls}" style="width:${pct}%"></div></div>
      <span class="val">${h.val}${h.arm ? `<span class="chip-arm">+${h.arm}</span>` : ""}</span>
    </div>`;
  }).join("");

  const r = p.risorse;
  // liste in linea (a chip) per non allungare la scheda: niente scroll durante il duello
  const chip = (testo, tag, cls = "tag-attiva") => `<span class="pi">${esc(testo)}${tag ? ` <small class="${cls}">${tag}</small>` : ""}</span>`;
  const poteri = p.poteri.map(x => chip(`${x.nome} r${x.rango}`, x.attivo ? "ATTIVO" : "")).join("");
  const augments = p.augments.map(x => chip(x.nome, x.passivo ? "passivo" : (x.attivo ? "ATTIVO" : ""),
    x.passivo ? "muted" : "tag-attiva")).join("");
  const stance = p.stance.filter(x => x.turni != null).map(x =>
    chip(x.nome, x.turni < 0 ? "perm." : x.turni + "t")).join("");
  const effetti = p.effetti.map(x => chip(x.nome, x.turni < 0 ? "∞" : x.turni + "t", "chip-crip")).join("");
  const riga = (et, v) => v ? `<div class="pan-inline"><b>${et}</b>${v}</div>` : "";

  el(dove).innerHTML = `
    <div class="pan-nome"><span>${p.nome}</span>${p.turno ? '<span class="pan-turno">TURNO</span>' : ""}</div>
    <div class="pan-risorse">
      <span>AZ ${r.azioni}/${r.n_azioni}</span>
      <span>BONUS ${r.bonus}/${r.n_bonus}</span>
      <span>RISP ${r.risposte}/${r.n_risposte}</span>
      ${staminaBar(r)}
      ${p.mira ? `<span>MIRA: ${p.mira}</span>` : ""}
      ${p.emp_turni > 0 ? `<span class="chip-crip">⚡EMP: ${p.emp_turni}t</span>` : ""}
    </div>
    <div class="pan-sec pan-locs">${hp}</div>
    ${riga("Poteri", poteri)}${riga("Augment", augments)}${riga("Stance", stance)}${riga("Effetti", effetti)}
    ${dove === "pan-player" ? renderArena() : ""}
  `;
}

/* ---------- scena: l'ultimo scambio come scheda, non come righe di log ---------- */
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const nomeLoc = l => esc(String(l).replace(/_/g, " "));
const RISPOSTA_NOME = {parata: "Parata", schivata: "Schivata", "nessuna risposta": "Riflessi"};
const ESITI = {
  colpito: ["COLPITO", "hit"], parato: ["PARATO", "miss"],
  schivato: ["SCHIVATO", "miss"], retto: ["SCHIVATO D'ISTINTO", "miss"],
};
let ultimoMostrato = null;   // n dell'ultimo evento già disegnato (per animare solo i nuovi)
let ultimoEffetto = null;    // n dell'ultimo evento di cui sono usciti i numeri fluttuanti

function chipTags(info) {
  return info.tags.map(t => `<span class="chip-tag">${esc(t)}</span>`).join("");
}

function righeEffetti(info) {
  return info.effetti.map(e => `<div class="scena-effetto">
      <b>${esc(e.nome)}</b> <span class="muted">(${e.turni < 0 ? "persistente" : e.turni + (e.turni === 1 ? " turno" : " turni")})</span>
      — ${esc(e.desc)}</div>`).join("");
}

/* il blocco "cosa fa questo attacco": descrizione, sigle delle regole, effetti */
function blocchettoAttacco(info) {
  return `<div class="scena-desc">${info.desc ? esc(info.desc) : ""}</div>
    <div class="scena-tags">${chipTags(info)}</div>${righeEffetti(info)}`;
}

function dado(titolo, valore, sotto, classe) {
  return `<div class="dado ${classe || ""}"><div class="dado-titolo">${titolo}</div>
    <div class="dado-valore">${valore}</div><div class="dado-sotto">${sotto}</div></div>`;
}

function cartaColpo(ev) {
  const [esitoTesto, esitoCl] = ESITI[ev.esito];
  const att = ev.chi === "p" ? "p" : "c";
  const colpi = ev.colpi > 1 ? ` <span class="muted">· colpo ${ev.colpo}/${ev.colpi}</span>` : "";
  const bersaglio = ev.split ? "tutto il corpo" : nomeLoc(ev.loc_att);
  const sottoAtt = esc((ev.skill_att || "").replace(/_/g, " ")) +
    (ev.mod_att ? ` ${ev.mod_att > 0 ? "+" : ""}${ev.mod_att} stance` : "");
  const sottoDif = esc(ev.skill_dif) + (ev.pen_mira ? ` +${ev.pen_mira} mira` : "");
  const colpita = ev.esito === "colpito";
  let danno = "";
  if (colpita) {
    const passi = [`<span>base <b>${ev.base}</b></span>`];
    if (ev.margine) passi.push(`<span>margine <b>+${ev.margine}</b></span>`);
    if (ev.mitigato) passi.push(`<span>parata <b>÷2</b></span>`);
    if (ev.assorbito) passi.push(`<span>armatura <b>−${ev.assorbito}</b></span>`);
    danno = `<div class="danno-calcolo">${passi.join('<i>›</i>')}</div>
      <div class="danno-grande">${ev.hp_persi > 0 ? "−" + ev.hp_persi + " HP" : "nessun danno"}
        <span class="muted">${ev.split ? "su tutto il corpo" : "a " + nomeLoc(ev.loc)} · ${esc(ev.tipo_danno)}</span></div>
      ${ev.deviato ? `<div class="scena-nota">Con la parata ha scelto dove incassare: ${nomeLoc(ev.loc)} invece di ${nomeLoc(ev.loc_att)}.</div>` : ""}
      ${ev.ucciso ? `<div class="scena-ko">K.O.!</div>` : ""}`;
  }
  const dett = ev.dettagli.length
    ? `<ul class="scena-dettagli">${ev.dettagli.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  const eff = colpita && ev.effetti.length ? righeEffetti({effetti: ev.effetti}) : "";
  return `<div class="scena-intesta"><span class="chi-badge b-${att}">${esc(ev.attaccante)}</span>
      <span class="scena-azione">usa <b>${esc(ev.info.nome)}</b></span>${colpi}
      <span class="scena-bersaglio">${ev.mirata ? "🎯 " : ""}su ${bersaglio}</span></div>
    ${blocchettoAttacco({...ev.info, effetti: []})}
    <div class="dadi">
      ${dado("ATTACCO", ev.tiro_att, sottoAtt, colpita ? "vince" : "")}
      <div class="dadi-vs">VS</div>
      ${dado(esc(RISPOSTA_NOME[ev.risposta] || "Difesa").toUpperCase(), ev.tiro_dif, sottoDif, colpita ? "" : "vince")}
    </div>
    <div class="esito-colpo e-${esitoCl}">${esitoTesto}${ev.mitigato ? " · ATTUTITO" : ""}</div>
    ${danno}${eff}${dett}`;
}

function cartaEvento(ev) {
  const lato = ev.chi || "";
  const nome = ev.nome ? `<span class="chi-badge b-${lato}">${esc(ev.nome)}</span>` : "";
  const dett = ev.dettagli && ev.dettagli.length
    ? `<ul class="scena-dettagli">${ev.dettagli.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  switch (ev.tipo) {
    case "colpo": return cartaColpo(ev);
    case "inizio":
      return `<div class="scena-intesta"><span class="scena-azione">⚑ Iniziativa</span></div>
        <div class="dadi">${dado(esc(ev.nome1), ev.tiro1, "riflessi", ev.primo === ev.nome1 ? "vince" : "")}
          <div class="dadi-vs">VS</div>
          ${dado(esc(ev.nome2), ev.tiro2, "riflessi", ev.primo === ev.nome2 ? "vince" : "")}</div>
        <div class="esito-colpo e-info">${esc(ev.primo)} AGISCE PER PRIMO</div>`;
    case "turno":
      return `<div class="scena-intesta">${nome}<span class="scena-azione">inizia il turno</span></div>${dett}`;
    case "mira":
      return `<div class="scena-intesta">${nome}<span class="scena-azione">🎯 prende la mira su <b>${nomeLoc(ev.loc)}</b></span></div>
        <div class="scena-desc">I suoi colpi mirabili puntano lì${S && S.mira_dura_turno ? " per tutto il turno" : ""}, ma la difesa avversaria è più facile (+${S ? S.mira_pen : 1}).</div>`;
    case "potere":
    case "stance":
      return `<div class="scena-intesta">${nome}<span class="scena-azione">${ev.tipo === "stance" ? "♦ assume la stance" : "✦ attiva"} <b>${esc(ev.titolo)}</b>${ev.rango ? ` <span class="muted">r${ev.rango}</span>` : ""}</span></div>
        <div class="scena-desc">${esc(ev.desc)}</div>${ev.righe && ev.righe.length
          ? `<ul class="scena-dettagli">${ev.righe.map(x => `<li>${esc(x.trim())}</li>`).join("")}</ul>` : ""}`;
    default:
      return `<div class="scena-intesta">${nome}<span class="scena-azione"><b>${esc(ev.titolo || "")}</b></span></div>
        <div class="scena-desc">${esc(ev.desc || "")}</div>${dett}`;
  }
}

/* una riga per gli scambi precedenti */
function rigaCronaca(ev) {
  const n = ev.nome ? `<b class="c-${ev.chi}">${esc(ev.nome)}</b>` : "";
  let t;
  switch (ev.tipo) {
    case "colpo": {
      const [et, cl] = ESITI[ev.esito];
      const res = ev.esito === "colpito"
        ? `<span class="c-hit">${ev.hp_persi > 0 ? "−" + ev.hp_persi + " HP" : "0 danni"}</span> a ${ev.split ? "tutto il corpo" : nomeLoc(ev.loc)}`
        : `<span class="c-miss">${et.toLowerCase()}</span>`;
      t = `⚔ ${n} · ${esc(ev.info.nome)} <span class="muted">${ev.tiro_att} vs ${ev.tiro_dif}</span> → ${res}`;
      break;
    }
    case "inizio": t = `⚑ Iniziativa: parte ${esc(ev.primo)}`; break;
    case "turno": t = `▸ ${n} inizia il turno`; break;
    case "mira": t = `🎯 ${n} mira ${nomeLoc(ev.loc)}`; break;
    case "stance": t = `♦ ${n} · ${esc(ev.titolo)}`; break;
    case "potere": t = `✦ ${n} · ${esc(ev.titolo)}`; break;
    default: t = `${n} ${esc(ev.titolo || "")}`;
  }
  return `<div class="cron-riga">${t}</div>`;
}

function renderScena() {
  const box = el("d-scena");
  const evs = S.eventi || [];
  const ultimo = evs[evs.length - 1];
  const c = S.fase === "risposta" ? S.in_corso : null;
  const testata = `<div class="scena-top">
      <span class="chi-badge b-p">${esc(S.player.nome)}</span><span class="dadi-vs">VS</span>
      <span class="chi-badge b-c">${esc(S.cpu.nome)}</span></div>`;
  let corpo;
  let nuovo;
  if (c) {
    // attacco in arrivo: il tiro è già noto, la risposta no
    nuovo = "in-" + c.attacco + c.colpo + "-" + (ultimo ? ultimo.n : 0);
    const az = c.azioni_avversario;
    corpo = `<div class="scena-intesta"><span class="chi-badge b-c">${esc(c.attaccante)}</span>
        <span class="scena-azione">ti attacca con <b>${esc(c.info.nome)}</b></span>
        ${c.colpi > 1 ? `<span class="muted">· colpo ${c.colpo}/${c.colpi}</span>` : ""}
        <span class="scena-bersaglio">${c.mirata ? "🎯 " : ""}su ${c.split ? "tutto il corpo" : nomeLoc(c.locazione)}</span></div>
      ${blocchettoAttacco(c.info)}
      <div class="dadi">
        ${dado("ATTACCO", c.tiro, esc((c.skill || "").replace(/_/g, " ")), "")}
        <div class="dadi-vs">VS</div>
        ${dado("TUA DIFESA", "?", "scegli la risposta", "incerto")}
      </div>
      <div class="scena-nota">${az > 0
        ? `All'avversario restano ${az} ${az > 1 ? "azioni" : "azione"}: la risposta è una sola per round, forse conviene tenerla.`
        : "All'avversario non restano azioni: la risposta è gratis."}</div>`;
  } else if (ultimo) {
    nuovo = "ev-" + ultimo.n;
    corpo = cartaEvento(ultimo);
  } else {
    nuovo = "vuoto";
    corpo = `<div class="scena-desc">Il duello sta per cominciare.</div>`;
  }
  const lato = c ? "c" : (ultimo && ultimo.chi) || "";
  const precedenti = evs.slice(0, c ? evs.length : -1).slice(-5).reverse();
  box.innerHTML = testata +
    `<div class="scena-carta lato-${lato}${nuovo !== ultimoMostrato ? " entra" : ""}">${corpo}</div>` +
    (precedenti.length ? `<div class="cronaca"><div class="cron-titolo">Poco fa</div>${precedenti.map(rigaCronaca).join("")}</div>` : "");
  ultimoMostrato = nuovo;
}

/* numeri che si alzano dalla scheda di chi viene colpito, scossa sul bersaglio */
function effettiNuoviEventi() {
  const evs = S.eventi || [];
  const maxN = evs.length ? evs[evs.length - 1].n : 0;
  if (ultimoEffetto === null) { ultimoEffetto = maxN; return; }  // primo disegno: niente replay
  for (const ev of evs) {
    if (ev.n <= ultimoEffetto || ev.tipo !== "colpo") continue;
    const corner = document.querySelector(ev.chi === "p" ? ".corner-cpu" : ".corner-player");
    if (!corner) continue;
    const esito = ev.esito === "colpito" ? ["−" + ev.hp_persi, "fl-hit"] : [ESITI[ev.esito][0], "fl-miss"];
    const f = document.createElement("div");
    f.className = "fl " + esito[1];
    f.textContent = esito[0];
    corner.appendChild(f);
    setTimeout(() => f.remove(), 1500);
    if (ev.esito === "colpito" && ev.hp_persi > 0) {
      corner.classList.remove("colpita"); void corner.offsetWidth; corner.classList.add("colpita");
    }
  }
  ultimoEffetto = maxN;
}

function renderLog() {
  el("d-log").innerHTML = S.log.map(r => {
    const classi = [r.tag ? "l-" + r.tag : "", r.chi ? "chi-" + r.chi : ""]
      .filter(Boolean).join(" ");
    return `<div class="${classi}">${r.t}</div>`;
  }).join("");
  el("d-log").scrollTop = el("d-log").scrollHeight;
}

function bottone(testo, azioneJs, classe = "btn-azione", disabilitato = false) {
  return `<button class="btn ${classe}" ${disabilitato ? "disabled" : ""}
           onclick='${azioneJs}'>${testo}</button>`;
}

/* contenuto di un bottone-scheda: nome, riga di costi, e cosa fa */
function opz(nome, meta, desc, extra = "") {
  return `<span class="opz-nome">${nome}</span>` +
    (meta ? `<span class="opz-meta">${meta}</span>` : "") +
    (desc ? `<span class="opz-desc">${esc(desc)}</span>` : "") + extra;
}

function renderAzioni() {
  const box = el("d-azioni");

  if (S.finito) {
    const vinto = S.vinto_dal_player;
    const esito = `
      <div class="esito ${vinto ? "vittoria" : "sconfitta"}">
        ${vinto ? (S.torneo ? "VITTORIA!" : `VITTORIA! +¤${S.ricompensa}`) : "SCONFITTA"}
        — ${S.vincitore} vince
      </div>`;
    const dopo = S.torneo
      ? `<a class="btn btn-volt" href="/torneo">Torna al torneo →</a>`
      : `<a class="btn btn-volt" href="/box">Torna al box →</a>
         <a class="btn btn-ghost" href="/duelli">Nuovo duello</a>`;
    if (!S.survey_fatto) {
      box.innerHTML = esito + renderSurvey();
    } else {
      box.innerHTML = esito + dopo;
    }
    return;
  }

  if (S.fase === "cpu") {
    box.innerHTML = `<div class="attesa">L'avversario sta giocando…</div>`;
    return;
  }

  if (S.fase === "risposta") {
    const c = S.in_corso;
    if (menu === "parata") {
      box.innerHTML = `<div class="titolo-menu">Dove incassi il colpo?</div>` +
        Object.entries(S.player.hp).map(([l, h]) => bottone(
          `${l.replace(/_/g, " ")} <span class="muted">(${h.val}/${h.max}${h.arm ? ` +${h.arm}` : ""})</span>` +
          (c && l === c.locazione ? " ⚠ <span class=\"muted\">dove punta il colpo</span>" : ""),
          `invia({tipo:"risposta",scelta:"parata",loc:"${l}"})`)).join("") +
        bottone("← Indietro", "menu=null;render()", "btn-ghost");
      return;
    }
    // l'attacco in arrivo: il tiro e' gia' noto, la risposta e' UNA per round
    // il dettaglio dell'attacco (descrizione, tiro, bersaglio) è nella scheda della scena
    box.innerHTML = `<div class="titolo-menu">⚠ Stai per essere colpito — come rispondi?</div>` +
      S.opzioni.map(o => {
        const d = c && c.difese.find(x => x.scelta === o);
        const pct = d ? ` <span class="muted">— ${Math.round(d.p * 100)}% di reggere</span>` : "";
        const nota = d && d.nota ? ` title="${d.nota}"` : "";
        const nome = o === "nessuna risposta" ? "Nessuna risposta (riflessi)" : o[0].toUpperCase() + o.slice(1);
        if (o === "parata") return bottone(`Parata${pct}<br><span class="muted nota-difesa">${d ? d.nota : ""} — scegli dove</span>`,
          'menu="parata";render()', "btn-risposta");
        return bottone(`${nome}${pct}<br><span class="muted nota-difesa">${d ? d.nota : ""}</span>`,
          `invia({tipo:"risposta",scelta:"${o}"})`, "btn-risposta");
      }).join("");
    return;
  }

  // fase == "player"
  const m = S.menu;
  if (menu === "attacchi") {
    const costoMira = m.mira_costo === "bonus" ? "1 az. bonus" : "1 azione";
    box.innerHTML = `<div class="titolo-menu">Attacchi</div>` +
      bottone(`🎯 Prendi la mira (${costoMira})`, 'menu="mira";render()', "btn-azione", !m.mira) +
      m.attacchi.map(a => {
        let extra = "";
        if (a.cooldown > 0) extra = ` [ricarica: ${a.cooldown}]`;
        else if (a.usi_rimasti != null) extra = ` [usi: ${a.usi_rimasti}]`;
        const costo = a.costo_azioni || 1;
        const pc = a.p_colpire != null ? `≈${Math.round(a.p_colpire * 100)}% a segno` : "";
        const meta = [pc, `${costo} ${costo > 1 ? "azioni" : "azione"}`, extra.replace(/[\[\]]/g, "").trim()]
          .filter(Boolean).join(" · ");
        return bottone(opz(esc(a.nome), meta, a.info.desc,
            `<span class="scena-tags">${chipTags(a.info)}</span>${righeEffetti(a.info)}`),
          `invia({tipo:"attacco",id:${a.id}})`, "btn-azione btn-opz", !a.ok);
      }).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else if (menu === "mira") {
    box.innerHTML = `<div class="titolo-menu">Mira: scegli la locazione (+${S.mira_pen} alla difficoltà, ${S.mira_dura_turno ? "i colpi mirabili di questo turno puntano lì" : "il prossimo colpo punta lì"})</div>` +
      Object.keys(S.cpu.hp).map(l => bottone(l.replace(/_/g, " "),
        `invia({tipo:"mira",loc:"${l}"})`)).join("") +
      bottone("← Indietro", 'menu="attacchi";render()', "btn-ghost");
  } else if (menu === "poteri") {
    box.innerHTML = `<div class="titolo-menu">Poteri</div>` +
      m.poteri.map(p => bottone(opz(`Attiva: ${esc(p.nome)} r${p.rango}`,
        `1 azione · −${p.rango} stamina/turno` + (p.rotto ? " · arto a 0 hp" : ""), p.desc),
        `invia({tipo:"potere",id:${p.id}})`, "btn-azione btn-opz", !p.ok)).join("") +
      m.poteri_attivi.map(p => bottone(opz(`Disattiva: ${esc(p.nome)} r${p.rango}`, "1 az. bonus", p.desc),
        `invia({tipo:"disattiva_potere",id:${p.id}})`, "btn-azione btn-opz", !p.ok)).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else if (menu === "augment") {
    box.innerHTML = `<div class="titolo-menu">Augment</div>` +
      m.augment.map(a => bottone(opz(`Attiva: ${esc(a.nome)}`, "1 azione", a.desc),
        `invia({tipo:"augment",id:${a.id}})`, "btn-azione btn-opz", !a.ok)).join("") +
      m.augment_attivi.map(a => bottone(opz(`Disattiva: ${esc(a.nome)}`,
        "1 az. bonus" + (a.turni_rimasti != null ? ` · ${a.turni_rimasti} turni rimasti` : ""), a.desc),
        `invia({tipo:"disattiva_augment",id:${a.id}})`, "btn-azione btn-opz", !a.ok)).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else if (menu === "stance") {
    box.innerHTML = `<div class="titolo-menu">Stance</div>` +
      m.stance.map(s => {
        let extra = "";
        if (s.cooldown > 0) extra = ` [ricarica: ${s.cooldown}]`;
        else if (s.usi_rimasti != null) extra = ` [usi: ${s.usi_rimasti}]`;
        return bottone(opz(esc(s.nome), ["1 az. bonus", extra.replace(/[\[\]]/g, "").trim()].filter(Boolean).join(" · "), s.desc),
          `invia({tipo:"stance",id:${s.id}})`, "btn-azione btn-opz", !s.ok);
      }).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else {
    const haAttacchi = m.attacchi.some(a => a.ok) || m.mira;
    const haPoteri = m.poteri.some(p => p.ok) || m.poteri_attivi.some(p => p.ok);
    const haAugment = m.augment.some(a => a.ok) || m.augment_attivi.some(a => a.ok);
    const haStance = m.stance.some(s => s.ok);
    const nonRestaNulla = !(haAttacchi || haPoteri || haAugment);  // nessuna azione utile
    box.innerHTML = `<div class="titolo-menu">Il tuo turno</div>` +
      bottone("⚔ Attacchi", 'menu="attacchi";render()', "btn-azione", !haAttacchi) +
      bottone("✦ Poteri", 'menu="poteri";render()', "btn-azione", !haPoteri) +
      bottone("⚙ Augment", 'menu="augment";render()', "btn-azione", !haAugment) +
      bottone("♦ Stance", 'menu="stance";render()', "btn-azione", !haStance) +
      bottone("Fine turno →", 'invia({tipo:"fine_turno"})',
              nonRestaNulla ? "btn-volt btn-consigliato" : "btn-volt") +
      (S.torneo ? "" :
        bottone("🏳 Resa", 'if(confirm("Ti arrendi? Sconfitta immediata, ma eviti altri danni."))invia({tipo:"resa"})', "btn-ghost"));
  }
}

/* ---------- survey di fine duello (tara l'IA della CPU) ---------- */
const SURVEY_DOMANDE = [
  ["divertente", "Questo combattimento è stato divertente?"],
  ["troppo_debole", "L'avversario era troppo debole?"],
  ["troppo_forte", "L'avversario era troppo forte?"],
  ["intelligente", "Reputi l'avversario intelligente?"],
  ["poteri_corretti", "Ha utilizzato i propri poteri correttamente?"],
  ["tattiche_lodevoli", "Ha usato tattiche lodevoli?"],
  ["mira_corretta", "Ha utilizzato la mira correttamente?"],
  ["parti_critiche", "Ha mirato parti del corpo critiche?"],
  ["counter", "Ha usato le proprie risorse per counterare le tue?"],
  ["prevedibile", "L'avversario era prevedibile?"],
  ["tutti_poteri_subito", "Ha attivato tutti i propri poteri all'inizio della partita?"],
  ["partita_lunga", "La partita è durata troppo per colpa dell'avversario?"],
  ["stamina_corretta", "Si è gestito la stamina correttamente?"],
  ["stance_corrette", "Ha utilizzato le stance correttamente?"],
];

const SURVEY_STATI = [["si", "Sì"], ["no", "No"], ["boh", "Non so"]];

function renderSurvey() {
  return `<div class="survey">
    <div class="titolo-menu">Com'è andata? Le risposte migliorano l'avversario</div>
    <div class="muted">Rispondi solo a ciò che sai: «Non so» (il default) non cambia nulla.</div>
    ${SURVEY_DOMANDE.map(([k, testo]) => `
      <div class="survey-riga3">
        <span class="survey-testo">${testo}</span>
        <span class="survey-scelte">${SURVEY_STATI.map(([v, et]) => `
          <label><input type="radio" name="sv-${k}" value="${v}" ${v === "boh" ? "checked" : ""}> ${et}</label>`
        ).join("")}</span>
      </div>`).join("")}
    <textarea id="sv-commento" class="survey-commento" rows="3"
      placeholder="Commenti liberi sull'avversario o sulla partita (facoltativo)"></textarea>
    <button class="btn btn-volt" onclick="inviaSurvey()">Invia e continua</button>
    <button class="btn btn-ghost" onclick="saltaSurvey()">Salta</button>
  </div>`;
}

async function inviaSurvey() {
  const risposte = {};
  for (const [k] of SURVEY_DOMANDE) {
    const scelto = document.querySelector(`input[name="sv-${k}"]:checked`);
    risposte[k] = scelto ? scelto.value : "boh";
  }
  await fetch("/api/duello/survey", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({risposte, commento: el("sv-commento").value}),
  });
  S.survey_fatto = true;
  render();
}

function saltaSurvey() {
  S.survey_fatto = true;
  render();
}

fetchStato();
