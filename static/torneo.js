/* Urban — Torneo Evo: bracket a 16, evoluzione a ogni turno, slot machine dei poteri */
let S = null;
let vista = null;      // override locale: "scelte" dopo la schermata risultato
let slotTimer = [];
let sceltaPotere = null;
let sceltaStat = null;
let sceltaItem = null; // {categoria, id} dell'item selezionato in fase "oggetto"

const el = id => document.getElementById(id);
const app = () => el("evo-app");

async function fetchStato() {
  S = await fetch("/api/torneo/stato").then(r => r.json());
  render();
}

async function azione(a) {
  const r = await fetch("/api/torneo/azione", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(a),
  }).then(r => r.json());
  if (r.vai) { window.location.href = r.vai; return; }
  S = r;
  vista = null;
  render();
}

/* ---------- bracket ---------- */
function bracketHtml() {
  const colonne = [];
  const nTurni = 4;
  for (let t = 0; t < nTurni; t++) {
    const turno = S.turni[t];
    const nMatch = 8 >> t;
    let html = `<div class="evo-col"><div class="evo-col-titolo">${["OTTAVI", "QUARTI", "SEMI", "FINALE"][t]}</div>`;
    for (let m = 0; m < nMatch; m++) {
      const match = turno ? turno[m] : null;
      html += `<div class="evo-match">` +
        slotHtml(match, "a") + slotHtml(match, "b") + `</div>`;
    }
    colonne.push(html + "</div>");
  }
  // colonna campione
  const ultimo = S.turni[3];
  const campione = ultimo && ultimo[0].win != null ? S.partecipanti[ultimo[0].win].nome : "?";
  colonne.push(`<div class="evo-col"><div class="evo-col-titolo">CAMPIONE</div>
    <div class="evo-match evo-campione ${campione !== "?" ? "rivelato" : ""}">
      <div class="evo-slot">🏆 ${campione}</div></div></div>`);
  return `<div class="evo-bracket">${colonne.join("")}</div>`;
}

function slotHtml(match, lato) {
  if (!match) return `<div class="evo-slot vuoto">—</div>`;
  const idx = match[lato];
  const p = S.partecipanti[idx];
  const io = idx === S.io ? " io" : "";
  const ko = match.win != null && match.win !== idx ? " ko" : "";
  const avanza = match.win === idx ? " avanza" : "";
  return `<div class="evo-slot${io}${ko}${avanza}">
    <span class="evo-nome">${p.nome}</span>
    <span class="evo-pot">${p.potenza}</span>
    ${ko ? '<span class="evo-x">✕</span>' : ""}
  </div>`;
}

function potHtml() {
  const pot = S.bonus_accumulato || 0;
  const log = (S.log_arena || []).map(l => `<div class="evo-arena-riga">${l}</div>`).join("");
  return `<div class="evo-montepremi">
    <div class="evo-montepremi-val">🏅 Punteggio del torneo: <b>${pot}</b>
      <span class="muted">— soltanto un punteggio: il Torneo Evo non dà premi</span></div>
    ${log ? `<div class="evo-arena-log">${log}</div>` : ""}
  </div>`;
}

function eroeCard() {
  const e = S.eroe;
  const stats = Object.entries(e.stats).map(([s, r]) =>
    `<div class="evo-stat"><span>${s}</span><b>${"●".repeat(r)}${"○".repeat(4 - r)}</b></div>`).join("");
  const poteri = e.poteri.map(p => `<div>⚡ ${p.nome} <b>r${p.rango}</b></div>`).join("")
    || '<div class="muted">nessun potere</div>';
  const equip = [
    ...e.armi.map(n => `<div>🗡 ${n}</div>`),
    ...(e.armatura_hp ? [`<div>🛡 +${e.armatura_hp} hp armatura</div>`] : []),
    ...e.augments.map(n => `<div>🔩 ${n}</div>`),
  ].join("");
  return `<div class="evo-eroe">
    <div class="evo-eroe-nome">${e.nome}</div>
    <div class="evo-eroe-sub">IL TUO CAMPIONE</div>
    <div class="evo-stats">${stats}</div>
    <div class="evo-poteri">${poteri}</div>
    ${equip ? `<div class="evo-poteri">${equip}</div>` : ""}
  </div>`;
}

/* ---------- schermate ---------- */
function render() {
  slotTimer.forEach(clearTimeout);
  slotTimer = [];
  if (!S.attivo) return renderLanding();
  if (vista === "scelte") return renderScelte();
  ({intro: renderIntro, pronto: renderPronto, duello: renderDuello,
    risultato: renderRisultato, oggetto: renderOggetto, vittoria: renderVittoria,
    eliminato: renderEliminato})[S.fase]();
}

function renderLanding() {
  app().innerHTML = `
    <div class="evo-hero">
      <div class="evo-kicker">MODALITÀ A PARTE</div>
      <h1 class="evo-title">TORNEO <span>EVO</span></h1>
      <p class="muted evo-pitch">16 partecipanti. Si parte da zero: un eroe casuale, un potere.
      Ogni turno superato: cure, un potere nuovo a scelta tra tre, una statistica potenziata.
      Chi perde è fuori. È una modalità a parte: non tocca la tua palestra e non dà premi, solo la gloria.</p>
      <button class="btn btn-volt evo-cta" onclick='azione({tipo:"inizia"})'>INIZIA TORNEO</button>
    </div>`;
}

function renderIntro() {
  app().innerHTML = `
    <div class="evo-intro">
      <h1 class="evo-title evo-anim-in">TORNEO <span>EVO</span></h1>
      ${eroeCard()}
      ${bracketHtml()}
      <button class="btn btn-volt evo-cta" onclick='azione({tipo:"avanti"})'>VAI AGLI OTTAVI →</button>
    </div>`;
}

function renderPronto() {
  app().innerHTML = `
    <div class="evo-intro">
      <div class="evo-kicker">${S.nome_turno.toUpperCase()}</div>
      <h2 class="evo-vs">${S.eroe.nome} <span class="muted">vs</span> ${S.avversario}</h2>
      ${bracketHtml()}
      ${eroeCard()}
      ${potHtml()}
      <button class="btn btn-volt evo-cta" onclick='azione({tipo:"combatti"})'>⚔ COMBATTI</button>
    </div>`;
}

function renderDuello() {
  app().innerHTML = `
    <div class="evo-intro">
      <p class="muted">C'è un incontro in corso.</p>
      <a class="btn btn-volt" href="/duello">Vai al duello →</a>
    </div>`;
}

function renderRisultato() {
  app().innerHTML = `
    <div class="evo-intro">
      <div class="evo-kicker">RISULTATI — VERSO ${S.nome_turno.toUpperCase()}</div>
      ${bracketHtml()}
      ${potHtml()}
      <button class="btn btn-volt evo-cta" onclick='vista="scelte";render()'>
        🧬 SCEGLI IL POTENZIAMENTO →</button>
    </div>`;
}

function renderScelte() {
  sceltaPotere = null;
  sceltaStat = null;
  const sc = S.scelte;
  app().innerHTML = `
    <div class="evo-intro">
      <div class="evo-kicker">EVOLUZIONE</div>
      <h2 class="evo-vs">Scegli un potere <span class="muted">(rango ${sc.rango})</span></h2>
      <div class="evo-slots">
        ${sc.poteri.map((p, i) => `
          <div class="slot-card" id="slot-${i}" onclick="selezionaPotere(${i})">
            <div class="slot-nome">???</div>
            <div class="slot-desc"></div>
          </div>`).join("")}
      </div>
      <h2 class="evo-vs evo-sotto">Potenzia una statistica</h2>
      <div class="evo-statscelta">
        ${sc.stats.map(s => `
          <button class="btn btn-ghost stat-btn" id="stat-${s}"
                  onclick="selezionaStat('${s}')">${s} +1</button>`).join("")
          || '<span class="muted">tutte le statistiche al massimo</span>'}
      </div>
      <button class="btn btn-volt evo-cta" id="evo-conferma" disabled
              onclick="confermaScelta()">CONFERMA</button>
    </div>`;
  avviaSlot();
}

function avviaSlot() {
  const pool = S.pool_nomi;
  S.scelte.poteri.forEach((p, i) => {
    const card = el("slot-" + i);
    const nome = card.querySelector(".slot-nome");
    const giro = setInterval(() => {
      nome.textContent = pool[Math.floor(Math.random() * pool.length)];
    }, 65);
    slotTimer.push(setTimeout(() => {
      clearInterval(giro);
      nome.textContent = p.nome;
      card.querySelector(".slot-desc").textContent = p.descrizione;
      card.classList.add("fermo");
    }, 900 + i * 700));
    slotTimer.push(giro);
  });
}

function selezionaPotere(i) {
  const card = el("slot-" + i);
  if (!card.classList.contains("fermo")) return; // la slot sta ancora girando
  document.querySelectorAll(".slot-card").forEach(c => c.classList.remove("scelto"));
  card.classList.add("scelto");
  sceltaPotere = S.scelte.poteri[i].id;
  aggiornaConferma();
}

function selezionaStat(s) {
  document.querySelectorAll(".stat-btn").forEach(b => b.classList.remove("scelto"));
  el("stat-" + s).classList.add("scelto");
  sceltaStat = s;
  aggiornaConferma();
}

function aggiornaConferma() {
  el("evo-conferma").disabled = !(sceltaPotere != null
    && (sceltaStat != null || S.scelte.stats.length === 0));
}

function confermaScelta() {
  azione({tipo: "scegli", potere: sceltaPotere, stat: sceltaStat});
}

const ICONA_ITEM = {arma: "🗡", armatura: "🛡", augment: "🔩"};

function renderOggetto() {
  sceltaItem = null;
  const item = S.scelte_item;
  app().innerHTML = `
    <div class="evo-intro">
      <div class="evo-kicker">BOTTINO</div>
      <h2 class="evo-vs">Scegli un equipaggiamento</h2>
      <div class="evo-slots">
        ${item.map((it, i) => `
          <div class="slot-card" id="item-${i}" onclick="selezionaItem(${i})">
            <div class="slot-nome">???</div>
            <div class="slot-desc"></div>
          </div>`).join("")}
      </div>
      <div class="evo-azioni-finali">
        <button class="btn btn-volt evo-cta" id="evo-conferma-item" disabled
                onclick="confermaItem()">EQUIPAGGIA</button>
        <button class="btn btn-ghost" onclick="saltaItem()">Nessuno dei tre</button>
      </div>
    </div>`;
  avviaSlotItem();
}

function avviaSlotItem() {
  const pool = S.pool_nomi_item;
  S.scelte_item.forEach((it, i) => {
    const card = el("item-" + i);
    const nome = card.querySelector(".slot-nome");
    const giro = setInterval(() => {
      nome.textContent = pool[Math.floor(Math.random() * pool.length)];
    }, 65);
    slotTimer.push(setTimeout(() => {
      clearInterval(giro);
      nome.textContent = `${ICONA_ITEM[it.categoria]} ${it.nome}`;
      card.querySelector(".slot-desc").textContent = it.descrizione;
      card.classList.add("fermo");
    }, 900 + i * 700));
    slotTimer.push(giro);
  });
}

function selezionaItem(i) {
  const card = el("item-" + i);
  if (!card.classList.contains("fermo")) return; // la slot sta ancora girando
  document.querySelectorAll(".slot-card").forEach(c => c.classList.remove("scelto"));
  card.classList.add("scelto");
  const it = S.scelte_item[i];
  sceltaItem = {categoria: it.categoria, id: it.id};
  el("evo-conferma-item").disabled = false;
}

function confermaItem() {
  if (!sceltaItem) return;
  azione({tipo: "scegli_item", categoria: sceltaItem.categoria, id: sceltaItem.id});
}

function saltaItem() {
  azione({tipo: "salta_item"});
}

function renderVittoria() {
  const coriandoli = Array.from({length: 16}, (_, i) =>
    `<span class="coriandolo" style="left:${6 * i + 3}%; animation-delay:${(i % 5) * .35}s"></span>`).join("");
  app().innerHTML = `
    <div class="evo-vittoria">${coriandoli}
      <div class="evo-trofeo">🏆</div>
      <h1 class="evo-title">CAMPIONE <span>EVO</span></h1>
      <div class="evo-eroe-nome">${S.eroe.nome}</div>
      <p class="muted">Ha vinto il Torneo Evo. Nessun premio, nessun posto in palestra: resta la gloria.</p>
      ${eroeCard()}
      ${potHtml()}
      <div class="evo-azioni-finali">
        <button class="btn btn-volt" onclick='azione({tipo:"chiudi"})'>Nuovo torneo</button>
        <a class="btn btn-ghost" href="/palestra" onclick='azione({tipo:"chiudi"})'>Torna alla palestra →</a>
      </div>
    </div>`;
}

function renderEliminato() {
  app().innerHTML = `
    <div class="evo-intro">
      <h1 class="evo-title evo-rosso">ELIMINATO</h1>
      <p class="muted">${S.eroe.nome} esce ai ${S.nome_turno.toLowerCase()}.
        Il torneo l'ha vinto <b>${S.campione}</b>.</p>
      ${bracketHtml()}
      ${potHtml()}
      <button class="btn btn-volt evo-cta" onclick='azione({tipo:"chiudi"})'>NUOVO TORNEO</button>
    </div>`;
}

fetchStato();
