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
  const bancario = ["punta", "clausola", "incassa"].includes(azione.tipo);
  if (azione.tipo !== "cpu_step" && !bancario) menu = null; // dopo ogni scelta si torna al menu principale
  if (bancario) erroreBanco = S.errore || null;
  else if (azione.tipo !== "cpu_step") erroreAzione = S.errore || null;
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
  Arena.update(S);
  renderFolla();
  renderScena();
  renderLog();
  renderAzioni();
  effettiNuoviEventi();
  if (el("dlg-banco").open) { if (S.finito) chiudiBanco(); else renderBanco(); }
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

/* ---------- il Banco: puntate, clausole, folla e azzardi (azzardo.py decide, qui si mostra) ---------- */
let importoBozza = null;        // l'importo che si sta scrivendo: sopravvive ai re-render
let erroreBanco = null;         // il rifiuto del server all'ultima puntata/incasso (S.errore), mostrato nella finestra del Banco
let erroreAzione = null;        // ...e all'ultima azione di combattimento, mostrato nel menu

const unitaTesto = () => (S.arena && S.arena.unita === "pt") ? " pt" : "¤";
const percento = x => Math.round(x * 100) + "%";

/* la barra della folla: a sinistra il giocatore (volt), a destra l'avversario (danger); parte dal centro verso chi la folla ama.
   Si aggiorna senza ricostruirsi, cosi' la barra scorre. */
function renderFolla() {
  const f = S.folla, box = el("d-folla");
  if (!f) { box.innerHTML = ""; return; }
  if (!box.firstChild) {
    box.innerHTML = `<div class="folla-barra"><i class="folla-fill"></i><i class="folla-centro"></i></div><div class="folla-testo"><span></span><b></b></div>`;
    box.title = `La folla tifa per chi batte i pronostici: un colpo improbabile a segno la sposta, sbagliare l'ovvio la fa fischiare. Sposta il dado dell'Azzardo e a ±${f.soglia} scatta l'Ovazione.`;
  }
  const fill = box.querySelector(".folla-fill"), dado = box.querySelector("b");
  fill.className = "folla-fill " + (f.tifo >= 0 ? "p" : "c");
  fill.style.width = Math.min(50, Math.abs(f.tifo) / 2) + "%";
  box.querySelector("span").textContent = f.testo;
  dado.textContent = f.scarto ? `dado ${f.scarto > 0 ? "+" : ""}${f.scarto}` : "";
  dado.className = f.scarto > 0 ? "volt" : f.scarto < 0 ? "danger" : "";
  box.setAttribute("aria-label", "Tifo della folla: " + f.testo);
}

/* la striscia nella scheda del giocatore: quota, puntate in gioco, serie; il resto sta nella finestra del Banco */
function renderArena() {
  const ar = S.arena;
  if (!ar) return "";  // né duello normale né Torneo Evo: niente arena
  const u = unitaTesto();
  const aperte = ar.schedine.filter(s => s.stato === "aperta");
  const inGioco = aperte.reduce((t, s) => t + s.importo, 0);
  return `<div class="pan-sec arena-sec">
    <div class="pan-inline"><b>Banco</b>
      <span class="pi" title="Quanto paga ogni ${u.trim()} puntato su di te, adesso">su di te <b class="quota-val">${ar.quota}x</b></span>
      <span class="pi" title="La probabilità di vittoria stimata dal banco">${percento(ar.p_vittoria)}</span>
      ${ar.serie ? `<span class="pi" title="Ogni azzardo riuscito alza il pagamento delle puntate aperte; il primo che va male lo spezza">serie ×${ar.moltiplicatore}</span>` : ""}
      ${ar.torneo_pot != null ? `<span class="pi" title="Il punteggio del torneo: non sono crediti">punteggio ${ar.torneo_pot}</span>` : ""}</div>
    <div class="arena-riga muted">${aperte.length ? `${aperte.length} ${aperte.length > 1 ? "puntate" : "puntata"} · ${inGioco}${u} in gioco` : "Nessuna puntata."}</div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="apriBanco()">🎰 ${aperte.length ? "Il Banco" : "Punta"}</button>
  </div>`;
}

function apriBanco() {
  const d = el("dlg-banco");
  erroreBanco = null;
  renderBanco();
  if (!d.open) d.showModal();
}
function chiudiBanco() { const d = el("dlg-banco"); if (d.open) d.close(); }
el("dlg-banco").addEventListener("click", e => { if (e.target === e.currentTarget) chiudiBanco(); });   // un clic sullo sfondo chiude

const massimoBanco = ar => Math.max(0, Math.min(ar.fondi, ar.limite));

/* la finestra: la posta, le clausole, le puntate aperte (con l'incasso) */
function renderBanco() {
  const d = el("dlg-banco"), ar = S.arena;
  if (!ar) return;
  const u = unitaTesto(), aperte = ar.schedine.filter(s => s.stato === "aperta"), massimo = massimoBanco(ar);
  const bozza = importoBozza != null ? importoBozza : Math.min(50, massimo);
  const campo = document.activeElement && document.activeElement.id === "banco-importo" ? document.activeElement : null;
  const cursore = campo ? campo.selectionStart : null;
  const preset = [["10%", 0.1], ["25%", 0.25], ["50%", 0.5], ["TUTTO", 1]].map(([t, f]) =>
    `<button type="button" class="btn btn-ghost btn-sm" onclick="presetBanco(${f})" ${massimo < 1 ? "disabled" : ""}>${t}</button>`).join("");
  const pieno = aperte.length >= ar.max_schedine;
  d.innerHTML = `
    <div class="pal-dlg-testa"><div class="pal-dlg-titolo"><h2>Il Banco</h2>
      <div class="fc-liv">${ar.unita === "pt" ? "Punti del torneo, non crediti" : `Hai ${ar.fondi}¤`} · su di te ${ar.quota}x · ${percento(ar.p_vittoria)}</div></div>
      <button type="button" class="pal-icona" onclick="chiudiBanco()" aria-label="Chiudi">×</button></div>
    <div class="pal-dlg-corpo">
      ${erroreBanco ? `<div class="pal-avviso-card" role="alert">${esc(erroreBanco)}</div>` : ""}
      <div class="pal-sez"><h3>Punta su ${esc(S.player.nome)}</h3>
        <div class="banco-form">
          <input id="banco-importo" class="banco-importo" type="number" min="1" max="${massimo}" step="1" value="${bozza}"
                 oninput="importoBozza=this.value;aggiornaAnteprima()" aria-label="Importo della puntata">
          <span class="muted">${u.trim()}</span>${preset}
        </div>
        <div class="banco-anteprima" id="banco-anteprima"></div>
        ${massimo < ar.fondi ? `<div class="pal-avviso-card">Il banco accetta al massimo ${massimo}${u} adesso: l'incontro è già quasi deciso.</div>` : ""}
        <div><button type="button" class="btn btn-volt" onclick="puntaBanco()" ${massimo < 1 || pieno ? "disabled" : ""}>🎰 Punta sull'esito</button>
          ${pieno ? `<span class="muted banco-nota"> Hai già ${ar.max_schedine} puntate aperte.</span>` : ""}</div>
      </div>
      ${ar.clausole.length ? `<div class="pal-sez"><h3>Clausole <span class="muted">— fino alla fine del round ${ar.finestra_clausole}</span></h3>
        ${ar.clausole.map(c => `<div class="pal-voce">
          <span>${esc(c.nome)} <b class="quota-val">${c.quota}x</b></span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="firmaClausola('${c.id}')" ${massimo < 1 || pieno ? "disabled" : ""}>Firma</button>
          <span class="pal-voce-nota">${esc(c.descrizione)} Paga solo se vinci e la condizione è vera.</span></div>`).join("")}</div>` : ""}
      <div class="pal-sez"><h3>Puntate aperte ${ar.serie ? `<span class="volt">· serie ×${ar.moltiplicatore}</span>` : ""}</h3>
        ${aperte.length ? aperte.map(s => `<div class="pal-voce">
          <span>${esc(s.nome)} · ${s.importo}${u} a ${s.quota}x${s.fallita ? ' <span class="chip-crip">CONDIZIONE PERSA</span>' : ""}</span>
          ${s.tipo === "esito" ? `<button type="button" class="btn btn-ghost btn-sm" onclick="incassaBanco(${s.id})" title="Esci adesso al prezzo di oggi: la casa trattiene il ${percento(ar.margine_incasso)}">Incassa ${s.incasso}${u}</button>` : "<span></span>"}
          <span class="pal-voce-nota">Se vinci: ${s.vincita}${u}${s.tipo === "esito" ? "" : ", se la condizione è vera"}</span></div>`).join("")
          : '<div class="muted banco-nota">Nessuna puntata aperta.</div>'}
      </div>
    </div>
    <div class="pal-dlg-piede"><span class="muted banco-nota">La casa trattiene il ${percento(ar.margine)} su ogni puntata. Ogni azzardo riuscito alza il pagamento
      delle puntate aperte (serie), il primo che va male la spezza. Fino a ${ar.max_schedine} puntate aperte.</span></div>`;
  if (campo) { const i = el("banco-importo"); i.focus(); i.setSelectionRange(cursore, cursore); }
  aggiornaAnteprima();
}

function aggiornaAnteprima() {
  const box = el("banco-anteprima"), inp = el("banco-importo");
  if (!box || !inp || !S.arena) return;
  const ar = S.arena, v = parseInt(inp.value, 10), u = unitaTesto();
  if (!v || v < 1) { box.innerHTML = '<span class="muted">Scrivi quanto vuoi puntare.</span>'; return; }
  const vincita = Math.floor(v * ar.quota * ar.moltiplicatore);
  box.innerHTML = `Se vinci: <b class="volt">+${vincita - v}${u}</b> <span class="muted">(incassi ${vincita}${u}${ar.serie ? `, con la serie ×${ar.moltiplicatore}` : ""})</span> · se perdi: <b class="danger">−${v}${u}</b>`;
}

function presetBanco(f) {
  importoBozza = Math.max(1, Math.floor(massimoBanco(S.arena) * f));
  el("banco-importo").value = importoBozza;
  aggiornaAnteprima();
}
async function puntaBanco() {
  const v = parseInt(el("banco-importo").value, 10);
  if (!v || v <= 0) return;
  importoBozza = null;
  await invia({tipo: "punta", importo: v});
}
async function firmaClausola(id) {
  const v = parseInt(el("banco-importo").value, 10);
  if (!v || v <= 0) return;
  importoBozza = null;
  await invia({tipo: "clausola", id, importo: v});
}
const incassaBanco = id => invia({tipo: "incassa", id});

/* a duello finito: com'e' andata al Banco, puntata per puntata */
function riassuntoBanco() {
  const ar = S.arena;
  if (!ar) return "";
  const u = unitaTesto(), chiuse = ar.schedine.filter(s => s.stato !== "aperta");
  if (!chiuse.length) return "";
  const netto = chiuse.reduce((t, s) => t + (s.stato === "persa" ? -s.importo : s.incassata - s.importo), 0);
  const segno = n => (n >= 0 ? "+" : "−") + Math.abs(n) + u;
  return `<div class="pan-inline banco-esito"><b>Banco</b>${chiuse.map(s => {
    const n = s.stato === "persa" ? -s.importo : s.incassata - s.importo;
    return `<span class="pi"><b class="${n >= 0 ? "volt" : "danger"}">${segno(n)}</b> ${esc(s.nome)}${s.stato === "incassata" ? " (incassata)" : ""}</span>`;
  }).join("")}<span class="pi">netto <b class="${netto >= 0 ? "volt" : "danger"}">${segno(netto)}</b></span></div>`;
}

/* chi e' questo avversario per il tuo allievo: nuovo, gia' battuto, il tuo nemico (Nemesis system, nemesi.py) */
function renderRivale() {
  const r = S.rivale;
  if (!r) return "";
  return `<div class="rivale-box ${r.stato}"><b>Rivale · liv ${r.livello}${r.incontri ? ` · ${r.incontri} incontri` : ""}</b>${esc(r.testo)}
    ${r.rivincita ? `<br>${r.rivincita === "a" ? "Tu cerchi" : "Lui cerca"} la rivincita: +1 per 3 turni.` : ""}
    ${r.taglia ? `<br><span class="taglia">Taglia +${r.taglia}¤ alla vittoria</span>` : ""}</div>`;
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
  // gli azzardi: un rilancio da giocare, l'Ultima Puntata gia' usata, la spinta della folla sul dado (uguale e contraria per i due lati)
  const az = p.azzardo || {};
  const azzardo = [az.rilancio ? chip(`Rilancio ×${az.mult}`, "da giocare") : "", az.ultima ? chip("Ultima Puntata", "giocata", "muted") : "",
                   az.scarto ? chip(`folla ${az.scarto > 0 ? "+" : ""}${az.scarto}`, "al dado", "muted") : ""].join("");

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
    ${riga("Poteri", poteri)}${riga("Augment", augments)}${riga("Stance", stance)}${riga("Effetti", effetti)}${riga("Azzardo", azzardo)}
    ${dove === "pan-player" ? renderArena() : renderRivale()}
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
  // la schivata non si tira: riesce sempre (tiro_dif nullo)
  const schiva = ev.risposta === "schivata";
  const sottoDif = schiva ? "riesce sempre" : esc(ev.skill_dif) + (ev.pen_mira ? ` +${ev.pen_mira} mira` : "");
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
      ${dado(esc(RISPOSTA_NOME[ev.risposta] || "Difesa").toUpperCase(), schiva ? "✓" : ev.tiro_dif, sottoDif, colpita ? "" : "vince")}
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
        <div class="esito-colpo e-info">${esc(ev.primo)} AGISCE PER PRIMO</div>
        ${S.rivale ? `<div class="scena-allarme ${S.rivale.stato}">${esc(S.rivale.breve || S.rivale.testo)}</div>` : ""}`;
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
    case "azzardo": return cartaAzzardo(ev, nome);
    case "folla":
      return `<div class="scena-intesta">${nome}<span class="scena-azione">📣 <b>${esc(ev.titolo)}</b></span></div>
        <div class="scena-desc">${esc(ev.desc)}</div>${dett}`;
    default:
      return `<div class="scena-intesta">${nome}<span class="scena-azione"><b>${esc(ev.titolo || "")}</b></span></div>
        <div class="scena-desc">${esc(ev.desc || "")}</div>${dett}`;
  }
}

/* un azzardo: la Ruota e l'Ultima Puntata mostrano il dado (d10 + la spinta della folla) e l'esito; il Rilancio dice cosa si e' giocato */
const CLASSE_ESITO = {bene: "e-bene", jackpot: "e-info", male: "e-male", neutro: "e-neutro", rischio: "e-info"};
function cartaAzzardo(ev, nome) {
  const righe = ev.righe && ev.righe.length
    ? `<ul class="scena-dettagli">${ev.righe.map(x => `<li>${esc(String(x).trim())}</li>`).join("")}</ul>` : "";
  if (ev.azzardo === "rilancia") {
    return `<div class="scena-intesta">${nome}<span class="scena-azione">🎲 rilancia: <b>${esc(ev.nome_esito)} ×${ev.mult}</b></span></div>
      <div class="scena-desc">${esc(ev.desc)}</div>`;
  }
  const spinta = ev.scarto ? `folla ${ev.scarto > 0 ? "+" : ""}${ev.scarto}` : "nessuna spinta";
  const ruota = ev.azzardo === "ruota";
  const buono = ev.tag === "bene" || ev.tag === "jackpot";
  return `<div class="scena-intesta">${nome}<span class="scena-azione">${ruota ? "🎲 chiede alla <b>Ruota della Folla</b>" : "🎲 si gioca tutto: <b>Ultima Puntata</b>"}</span></div>
    <div class="dadi">
      ${dado("D10", ev.tiro, spinta, "")}
      <div class="dadi-vs">${ruota ? "=" : "≥"}</div>
      ${ruota ? dado("TOTALE", ev.totale, esc(ev.nome_esito), buono ? "vince" : "")
              : dado("SERVE", ev.soglia, `hai fatto ${ev.totale}`, ev.riuscita ? "vince" : "")}
    </div>
    <div class="esito-colpo ${CLASSE_ESITO[ev.tag] || "e-info"}">${esc((ev.nome_esito || "").toUpperCase())}</div>
    ${ruota ? `<div class="scena-desc">${esc(ev.desc)}</div>` : ""}${righe}`;
}

/* un testo che sale dalla scheda di chi ha azzardato (o di chi la folla ha appena premiato) */
const CLASSE_FLOAT = {bene: "fl-bene", jackpot: "fl-jackpot", male: "fl-male", neutro: "fl-neutro", rischio: "fl-rischio"};
function galleggia(ev) {
  const corner = document.querySelector(ev.chi === "p" ? ".corner-player" : ".corner-cpu");
  if (!corner) return;
  const f = document.createElement("div");
  f.className = "fl " + (ev.tipo === "folla" ? "fl-jackpot" : CLASSE_FLOAT[ev.tag] || "fl-neutro");
  f.textContent = ev.tipo === "folla" ? "OVAZIONE!" : String(ev.nome_esito || "").toUpperCase();
  corner.appendChild(f);
  setTimeout(() => f.remove(), 1500);
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
      t = `⚔ ${n} · ${esc(ev.info.nome)} <span class="muted">${ev.tiro_att} vs ${ev.tiro_dif ?? "✓"}</span> → ${res}`;
      break;
    }
    case "inizio": t = `⚑ Iniziativa: parte ${esc(ev.primo)}`; break;
    case "turno": t = `▸ ${n} inizia il turno`; break;
    case "mira": t = `🎯 ${n} mira ${nomeLoc(ev.loc)}`; break;
    case "stance": t = `♦ ${n} · ${esc(ev.titolo)}`; break;
    case "potere": t = `✦ ${n} · ${esc(ev.titolo)}`; break;
    case "azzardo": t = `🎲 ${n} · ${esc(ev.nome_esito || ev.azzardo)}`; break;
    case "folla": t = `📣 ${esc(ev.titolo)} · ${n}`; break;
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
      ${S.cpu.azzardo && S.cpu.azzardo.rilancio ? `<div class="scena-allarme">🎲 RILANCIATO ×${S.cpu.azzardo.mult}: se lo eviti, ${esc(c.attaccante)} paga.</div>` : ""}
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
    if (ev.n <= ultimoEffetto) continue;
    if (ev.tipo !== "colpo") {
      if (["mira", "potere", "stance", "azzardo", "folla"].includes(ev.tipo)) Arena.evento(ev);
      if (ev.tipo === "azzardo" || ev.tipo === "folla") galleggia(ev);
      continue;
    }
    Arena.colpo(ev);
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

/* Le azioni a pallini. In cima al menu delle mosse (al centro): un pallino per ogni azione del turno (pieno = ancora disponibile) e,
   dopo un filo, un rombo per ogni azione bonus (le "extra"). Ogni mossa mostra con altrettanti pallini quante azioni costa. */
const NOME_COSTO = {az: ["azione", "azioni"], bonus: ["azione bonus", "azioni bonus"]};
function costoPallini(n, tipo = "az") {
  return `<span class="costo-pal ${tipo}" title="${n} ${NOME_COSTO[tipo][n > 1 ? 1 : 0]}">${"<i></i>".repeat(n)}</span>`;
}
function risorsePallini(r) {
  const serie = (tot, disp, tipo) => Array.from({length: tot}, (_, i) => `<i class="${tipo}${i < disp ? " on" : ""}"></i>`).join("");
  return `<div class="az-pallini" title="Azioni: ${r.azioni}/${r.n_azioni} · Azioni bonus: ${r.bonus}/${r.n_bonus}">
    <span class="az-serie">${serie(r.n_azioni, r.azioni, "az")}</span>${r.n_bonus ? `<span class="az-sep"></span><span class="az-serie">${serie(r.n_bonus, r.bonus, "bonus")}</span>` : ""}</div>`;
}
/* la testata del menu delle mosse: il titolo a sinistra, i pallini delle risorse al centro, a destra un avviso (il rilancio in corso, un rifiuto) */
function testaMenu(titolo, extra = "") {
  return `<div class="az-testa"><div class="titolo-menu">${titolo}</div>${risorsePallini(S.player.risorse)}<span class="az-extra">${extra}</span></div>`;
}

/* contenuto di un bottone-scheda: nome, riga di costi, e cosa fa */
function opz(nome, meta, desc, extra = "") {
  return `<span class="opz-nome">${nome}</span>` +
    (meta ? `<span class="opz-meta">${meta}</span>` : "") +
    (desc ? `<span class="opz-desc">${esc(desc)}</span>` : "") + extra;
}

/* il rilancio in corso e l'errore dell'ultima azione, in cima ai menu */
function bannerRilancio() {
  const az = S.player.azzardo;
  return az && az.rilancio ? `<span class="azz-attivo" title="Il prossimo colpo di questo turno fa ×${az.mult}; se non va a segno ti costa la risposta del round">🎲 Rilancio ×${az.mult} in corso</span>` : "";
}
function erroreMenu() { return erroreAzione ? `<span class="azz-errore" role="alert" title="${esc(erroreAzione)}">${esc(erroreAzione)}</span>` : ""; }

/* gli azzardi: la Ruota della Folla, il Rilancio (due livelli) e l'Ultima Puntata, con le probabilita' di adesso */
function menuAzzardo(az) {
  if (!az) return "";
  const r = az.ruota, ril = az.rilancia, ul = az.ultima;
  const per = t => r.esiti.filter(e => t === "bene" ? (e.tag === "bene" || e.tag === "jackpot") : e.tag === t).reduce((s, e) => s + e.prob, 0);
  const barra = `<span class="azz-barra" title="${esc(r.esiti.map(e => percento(e.prob) + " " + e.nome).join(" · "))}"><i class="male" style="width:${per("male") * 100}%"></i><i class="neutro" style="width:${per("neutro") * 100}%"></i><i class="bene" style="width:${per("bene") * 100}%"></i></span>`;
  const spinta = az.scarto ? `folla ${az.scarto > 0 ? "+" : ""}${az.scarto} al dado` : "dado senza spinta";
  let out = bottone(opz("🎲 Ruota della Folla", `${costoPallini(1, "bonus")} · ${spinta}`,
      `Fortuna o sfortuna a tempo, un po' di cura o di armatura: ${percento(per("male"))} male, ${percento(per("neutro"))} niente, ${percento(per("bene"))} bene.`, barra),
    'invia({tipo:"azzardo",id:"ruota"})', "btn-azione btn-opz azz-carta", !az.disponibile);
  const colpo = ril.colpo ? `${esc(ril.colpo.nome)} ≈${percento(ril.colpo.p)} a segno` : "nessun colpo può andare a segno ora";
  for (const l of ril.livelli) {
    out += bottone(opz(`🎲 ${esc(l.nome)} ×${l.mult}`, `${costoPallini(1, "bonus")} · ${colpo}`,
        `Il prossimo colpo di questo turno fa ×${l.mult}, senza uccidere da solo. Se non va a segno: perdi la risposta e resti Esposto −${l.esposto}`
        + (l.perde_azioni ? ", perdi le azioni che ti restano e ti strappi un muscolo." : ".")),
      `invia({tipo:"azzardo",id:"rilancia",livello:${l.livello}})`, "btn-azione btn-opz azz-carta", !(az.disponibile && ril.ok));
  }
  const morte = ul.rischio_morte != null ? ` · se crolli ${percento(ul.rischio_morte)} di morire` : "";
  out += bottone(opz("🎲 Ultima Puntata", `${costoPallini(1, "bonus")} · ${percento(ul.p)} di resistere${morte}`,
      ul.usata ? "Già giocata in questo duello."
        : ul.critico ? `Tiri d10 + folla: da ${ul.soglia} in su ti rialzi (testa e busto al ${percento(ul.ripresa)}, +1 azione, Furia); sotto, il corpo cede.`
        : `Si gioca una volta sola, quando testa o busto sono sotto il ${percento(ul.soglia_critica)}.`),
    ul.rischio_morte != null
      ? `if(confirm("Se fallisci l’allievo rischia la vita (${percento(ul.rischio_morte)}). Giochi l’Ultima Puntata?"))invia({tipo:"azzardo",id:"ultima"})`
      : 'invia({tipo:"azzardo",id:"ultima"})',
    "btn-azione btn-opz azz-carta", !ul.ok);
  return out;
}

function renderAzioni() {
  const box = el("d-azioni");

  if (S.finito) {
    const vinto = S.vinto_dal_player;
    const esito = `
      <div class="esito ${vinto ? "vittoria" : "sconfitta"}">
        ${vinto ? (S.torneo ? "VITTORIA!" : `VITTORIA! +¤${S.ricompensa}`) : "SCONFITTA"}
        — ${S.vincitore} vince
      </div>${riassuntoBanco()}`;
    const dopo = S.torneo
      ? `<a class="btn btn-volt" href="/torneo">Torna al torneo →</a>`
      : `<a class="btn btn-volt" href="/palestra">Torna alla palestra →</a>
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
    const ril = S.cpu.azzardo && S.cpu.azzardo.rilancio ? S.cpu.azzardo : null;
    box.innerHTML = `<div class="titolo-menu">⚠ Stai per essere colpito${ril ? ` (RILANCIATO ×${ril.mult})` : ""} — come rispondi?</div>` +
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
    box.innerHTML = testaMenu("Attacchi", bannerRilancio()) +
      bottone(`🎯 Prendi la mira ${costoPallini(1, m.mira_costo === "bonus" ? "bonus" : "az")}`, 'menu="mira";render()', "btn-azione", !m.mira) +
      m.attacchi.map(a => {
        let extra = "";
        if (a.cooldown > 0) extra = ` [ricarica: ${a.cooldown}]`;
        else if (a.usi_rimasti != null) extra = ` [usi: ${a.usi_rimasti}]`;
        const costo = a.costo_azioni || 1;
        const pc = a.p_colpire != null ? `≈${Math.round(a.p_colpire * 100)}% a segno` : "";
        const meta = [pc, costoPallini(costo), esc(extra.replace(/[\[\]]/g, "").trim())]
          .filter(Boolean).join(" · ");
        return bottone(opz(esc(a.nome), meta, a.info.desc,
            `<span class="scena-tags">${chipTags(a.info)}</span>${righeEffetti(a.info)}`),
          `invia({tipo:"attacco",id:${a.id}})`, "btn-azione btn-opz", !a.ok);
      }).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else if (menu === "mira") {
    box.innerHTML = testaMenu(`Mira: scegli la locazione (+${S.mira_pen} alla difficoltà, ${S.mira_dura_turno ? "i colpi mirabili di questo turno puntano lì" : "il prossimo colpo punta lì"})`) +
      Object.keys(S.cpu.hp).map(l => bottone(l.replace(/_/g, " "),
        `invia({tipo:"mira",loc:"${l}"})`)).join("") +
      bottone("← Indietro", 'menu="attacchi";render()', "btn-ghost");
  } else if (menu === "azzardo") {
    box.innerHTML = testaMenu("Azzardo — il banco non regala", bannerRilancio() + erroreMenu()) + menuAzzardo(m.azzardi) +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else if (menu === "poteri") {
    box.innerHTML = testaMenu("Poteri") +
      m.poteri.map(p => bottone(opz(`Attiva: ${esc(p.nome)} r${p.rango}`,
        `${costoPallini(1)} · −${p.rango} stamina/turno` + (p.rotto ? " · arto a 0 hp" : p.spento_ora ? " · spento in questo turno" : ""), p.desc),
        `invia({tipo:"potere",id:${p.id}})`, "btn-azione btn-opz", !p.ok)).join("") +
      m.poteri_attivi.map(p => bottone(opz(`Disattiva: ${esc(p.nome)} r${p.rango}`, costoPallini(1, "bonus"), p.desc),
        `invia({tipo:"disattiva_potere",id:${p.id}})`, "btn-azione btn-opz", !p.ok)).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else if (menu === "augment") {
    box.innerHTML = testaMenu("Augment") +
      m.augment.map(a => bottone(opz(`Attiva: ${esc(a.nome)}`, costoPallini(1), a.desc),
        `invia({tipo:"augment",id:${a.id}})`, "btn-azione btn-opz", !a.ok)).join("") +
      m.augment_attivi.map(a => bottone(opz(`Disattiva: ${esc(a.nome)}`,
        costoPallini(1, "bonus") + (a.turni_rimasti != null ? ` · ${a.turni_rimasti} turni rimasti` : ""), a.desc),
        `invia({tipo:"disattiva_augment",id:${a.id}})`, "btn-azione btn-opz", !a.ok)).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else if (menu === "stance") {
    box.innerHTML = testaMenu("Stance") +
      m.stance.map(s => {
        let extra = "";
        if (s.cooldown > 0) extra = ` [ricarica: ${s.cooldown}]`;
        else if (s.usi_rimasti != null) extra = ` [usi: ${s.usi_rimasti}]`;
        return bottone(opz(esc(s.nome), [costoPallini(1, "bonus"), esc(extra.replace(/[\[\]]/g, "").trim())].filter(Boolean).join(" · "), s.desc),
          `invia({tipo:"stance",id:${s.id}})`, "btn-azione btn-opz", !s.ok);
      }).join("") +
      bottone("← Indietro", "menu=null;render()", "btn-ghost");
  } else {
    const haAttacchi = m.attacchi.some(a => a.ok) || m.mira;
    const haPoteri = m.poteri.some(p => p.ok) || m.poteri_attivi.some(p => p.ok);
    const haAugment = m.augment.some(a => a.ok) || m.augment_attivi.some(a => a.ok);
    const haStance = m.stance.some(s => s.ok);
    const haAzzardo = !!(m.azzardi && m.azzardi.disponibile);
    const nonRestaNulla = !(haAttacchi || haPoteri || haAugment);  // nessuna azione utile
    box.innerHTML = testaMenu("Il tuo turno", bannerRilancio() + erroreMenu()) +
      bottone("⚔ Attacchi", 'menu="attacchi";render()', "btn-azione", !haAttacchi) +
      bottone("✦ Poteri", 'menu="poteri";render()', "btn-azione", !haPoteri) +
      bottone("⚙ Augment", 'menu="augment";render()', "btn-azione", !haAugment) +
      bottone("♦ Stance", 'menu="stance";render()', "btn-azione", !haStance) +
      (m.azzardi ? bottone("🎲 Azzardo", 'menu="azzardo";render()', "btn-azione", !haAzzardo) : "") +
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
  ["azzardo_troppo", "Ha azzardato (ruota, rilanci) troppo spesso?"],
  ["azzardo_poco", "Ha azzardato troppo poco?"],
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
