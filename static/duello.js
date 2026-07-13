/* Urban — client del duello: rende lo stato e invia azioni a /api/duello */
let S = null;          // ultimo stato ricevuto
let menu = null;       // null = menu principale; "attacchi" | "poteri" | "stance" | "mira" | "parata"
let cpuTimer = null;
const CPU_DELAY = 1600;  // pausa tra le azioni della CPU, per seguire cosa fa

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
  renderLog();
  renderAzioni();
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
    bookmaker = `<div class="arena-riga">Scommessa piazzata: <b>${ar.scommessa.importo}¤</b>
      a quota <b class="quota-val">${ar.scommessa.quota}x</b>
      <span class="muted">(vinci il duello → +${vincita}¤${dest})</span></div>`;
  } else {
    const massimo = inTorneo ? 500 : ar.crediti;
    const bozza = importoScommessaBozza ?? Math.min(50, massimo);
    bookmaker = `<div class="arena-riga">Quota attuale su di te: <b class="quota-val">${ar.quota}x</b>
      ${inTorneo ? `<span class="muted">— montepremi torneo: ${ar.torneo_pot}¤</span>` : ""}</div>
      <div class="arena-scommessa-form">
        <input type="number" id="importo-scommessa" min="1" max="${massimo}" step="1"
               value="${bozza}" oninput="importoScommessaBozza=this.value">
        <button class="btn btn-ghost" onclick="piazzaScommessa()">🎰 Scommetti su di te${dest}</button>
      </div>`;
  }

  let sponsor;
  if (ar.sponsor) {
    sponsor = `<div class="arena-riga sponsor-scelto${ar.sponsor.fallito ? " fallito" : ""}">
      <b>${ar.sponsor.nome}</b> <span class="muted">(+${ar.sponsor.bonus}¤${dest})</span><br>
      <span class="muted">${ar.sponsor.descrizione}</span>
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
    sponsor = `<div class="muted">Nessuna offerta.</div>`;
  }

  const pub = ar.pubblico;
  const pubblico = `
    <div class="hype-bar"><div class="hype-fill" style="width:${pub.hype}%"></div></div>
    <div class="arena-riga muted">${pub.testo}</div>
    <div class="arena-riga muted">${pub.tifo}</div>`;

  return `<div class="pan-sec arena-sec">
    <h4>🎰 Bookmaker</h4>${bookmaker}
    <h4>📣 Sponsor</h4>${sponsor}
    <h4>👥 Pubblico</h4>${pubblico}
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
  const poteri = p.poteri.map(x =>
    `<div>${x.nome} r${x.rango} ${x.attivo ? '<span class="tag-attiva">ATTIVO</span>' : ""}</div>`).join("");
  const augments = p.augments.map(x =>
    `<div>${x.nome} ${x.passivo ? '<span class="muted">[passivo]</span>' :
      (x.attivo ? '<span class="tag-attiva">ATTIVO</span>' : "")}</div>`).join("");
  const stance = p.stance.map(x =>
    `<div>${x.nome} ${x.turni != null ? `<span class="tag-attiva">${x.turni < 0 ? "PERMANENTE" : x.turni + " turni"}</span>` : ""}</div>`).join("");
  const effetti = p.effetti.map(x =>
    `<div>${x.nome} (${x.turni < 0 ? "persistente" : x.turni + " turni"})</div>`).join("");

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
    <div class="pan-sec"><h4>Locazioni</h4>${hp}</div>
    ${poteri ? `<div class="pan-sec pan-lista"><h4>Poteri</h4>${poteri}</div>` : ""}
    ${augments ? `<div class="pan-sec pan-lista"><h4>Augment</h4>${augments}</div>` : ""}
    ${stance ? `<div class="pan-sec pan-lista"><h4>Stance</h4>${stance}</div>` : ""}
    ${dove === "pan-player" ? renderArena() : ""}
    ${effetti ? `<div class="pan-sec pan-lista"><h4>Effetti</h4>${effetti}</div>` : ""}
  `;
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
    if (menu === "parata") {
      box.innerHTML = `<div class="titolo-menu">Dove incassi il colpo?</div>` +
        Object.keys(S.player.hp).map(l => bottone(l.replace(/_/g, " "),
          `invia({tipo:"risposta",scelta:"parata",loc:"${l}"})`)).join("") +
        bottone("← Indietro", "menu=null;render()", "btn-ghost");
      return;
    }
    box.innerHTML = `<div class="titolo-menu">⚠ L'attacco ti sta per colpire — come rispondi?</div>` +
      S.opzioni.map(o => {
        if (o === "parata") return bottone("Parata (scegli dove incassare)", 'menu="parata";render()', "btn-risposta");
        return bottone(o[0].toUpperCase() + o.slice(1),
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
        return bottone(`${a.nome}${extra} <span class="muted">[${a.tipo_danno}]</span> (1 azione)`,
          `invia({tipo:"attacco",id:${a.id}})`, "btn-azione", !a.ok);
      }).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else if (menu === "mira") {
    box.innerHTML = `<div class="titolo-menu">Mira: scegli la locazione (+4 difficoltà)</div>` +
      Object.keys(S.cpu.hp).map(l => bottone(l.replace(/_/g, " "),
        `invia({tipo:"mira",loc:"${l}"})`)).join("") +
      bottone("← Indietro", 'menu="attacchi";render()', "btn-ghost");
  } else if (menu === "poteri") {
    box.innerHTML = `<div class="titolo-menu">Poteri</div>` +
      m.poteri.map(p => bottone(`Attiva: ${p.nome} r${p.rango}` +
        (p.rotto ? ` <span class="muted">[arto a 0 hp]</span>` : "") +
        ` (1 azione, -${p.rango} stamina/turno)`,
        `invia({tipo:"potere",id:${p.id}})`, "btn-azione", !p.ok)).join("") +
      m.poteri_attivi.map(p => bottone(`Disattiva: ${p.nome} r${p.rango} (1 az. bonus)`,
        `invia({tipo:"disattiva_potere",id:${p.id}})`, "btn-azione", !p.ok)).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else if (menu === "augment") {
    box.innerHTML = `<div class="titolo-menu">Augment</div>` +
      m.augment.map(a => bottone(`Attiva: ${a.nome} (1 azione)`,
        `invia({tipo:"augment",id:${a.id}})`, "btn-azione", !a.ok)).join("") +
      m.augment_attivi.map(a => bottone(`Disattiva: ${a.nome}` +
        (a.turni_rimasti != null ? ` <span class="muted">[${a.turni_rimasti}t rimasti]</span>` : "") +
        ` (1 az. bonus)`,
        `invia({tipo:"disattiva_augment",id:${a.id}})`, "btn-azione", !a.ok)).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else if (menu === "stance") {
    box.innerHTML = `<div class="titolo-menu">Stance</div>` +
      m.stance.map(s => {
        let extra = "";
        if (s.cooldown > 0) extra = ` [ricarica: ${s.cooldown}]`;
        else if (s.usi_rimasti != null) extra = ` [usi: ${s.usi_rimasti}]`;
        return bottone(`${s.nome}${extra} (1 az. bonus)`,
          `invia({tipo:"stance",id:${s.id}})`, "btn-azione", !s.ok);
      }).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else {
    const haAttacchi = m.attacchi.some(a => a.ok) || m.mira;
    const haPoteri = m.poteri.some(p => p.ok) || m.poteri_attivi.some(p => p.ok);
    const haAugment = m.augment.some(a => a.ok) || m.augment_attivi.some(a => a.ok);
    const haStance = m.stance.some(s => s.ok);
    box.innerHTML = `<div class="titolo-menu">Il tuo turno</div>` +
      bottone("⚔ Attacchi", 'menu="attacchi";render()', "btn-azione", !haAttacchi) +
      bottone("✦ Poteri", 'menu="poteri";render()', "btn-azione", !haPoteri) +
      bottone("⚙ Augment", 'menu="augment";render()', "btn-azione", !haAugment) +
      bottone("♦ Stance", 'menu="stance";render()', "btn-azione", !haStance) +
      bottone("Fine turno →", 'invia({tipo:"fine_turno"})', "btn-volt") +
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

function renderSurvey() {
  return `<div class="survey">
    <div class="titolo-menu">Com'è andata? Le risposte migliorano l'avversario</div>
    ${SURVEY_DOMANDE.map(([k, testo]) => `
      <label class="survey-riga">
        <input type="checkbox" id="sv-${k}"> ${testo}
      </label>`).join("")}
    <textarea id="sv-commento" class="survey-commento" rows="3"
      placeholder="Commenti liberi sull'avversario o sulla partita (facoltativo)"></textarea>
    <button class="btn btn-volt" onclick="inviaSurvey()">Invia e continua</button>
    <button class="btn btn-ghost" onclick="saltaSurvey()">Salta</button>
  </div>`;
}

async function inviaSurvey() {
  const risposte = {};
  for (const [k] of SURVEY_DOMANDE) risposte[k] = el("sv-" + k).checked;
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
