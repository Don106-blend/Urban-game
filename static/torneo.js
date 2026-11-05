/* Urban — Torneo Evo: la corsa roguelike. evo.py decide tutto, qui si mostra e si manda la scelta del giocatore. */
let S = null;
let errore = null;       // il rifiuto del server all'ultima azione
let ascScelta = 0;       // l'ascensione scelta nella schermata iniziale
let faseVista = null;    // per riportare in cima la pagina quando cambia la schermata

const el = id => document.getElementById(id);
const app = () => el("evo-app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

async function fetchStato() {
  S = await fetch("/api/torneo/stato").then(r => r.json());
  render();
}

async function azione(a) {
  const res = await fetch("/api/torneo/azione", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(a)});
  const r = await res.json();
  if (r.vai) { window.location.href = r.vai; return; }
  if (!res.ok) { errore = r.errore || "azione non valida"; render(); return; }
  errore = null;
  S = r;
  render();
}

/* ---------- pezzi comuni ---------- */
const RARITA = {comune: "comune", rara: "rara", leggendaria: "leggendaria", maledetta: "maledetta"};
const NOME_STAT = {fisico: "Fisico", riflessi: "Riflessi", mente: "Mente", sociale: "Sociale", controllo: "Controllo"};

function sagoma(aspetto, cls = "") {
  return `<div class="evo-sagoma ${cls}"><canvas class="anteprima" data-aspetto="${esc(JSON.stringify(aspetto))}" aria-hidden="true"></canvas></div>`;
}

function disegnaAnteprime() {
  if (typeof Arena === "undefined") return;
  document.querySelectorAll("canvas.anteprima[data-aspetto]").forEach(cv => {
    let a = null;
    try { a = JSON.parse(cv.dataset.aspetto); } catch (e) { /* corpo nudo */ }
    Arena.anteprima(cv, a);
  });
}

function chipMut(m, esteso = false) {
  return `<span class="evo-chip rar-${RARITA[m.rarita]}" title="${esc(m.nome)}: ${esc(m.descrizione)}">${m.icona} ${esteso ? `${esc(m.nome)} <small>${esc(m.descrizione)}</small>` : esc(m.nome)}</span>`;
}

function barraVita(frazione, cls = "") {
  const pct = Math.round(frazione * 100), k = pct > 60 ? "pct-hi" : pct > 30 ? "pct-mid" : "pct-low";
  return `<div class="evo-vita ${cls}" title="Vita rimasta: ${pct}%"><div class="hpbar"><div class="hpbar-fill ${k}" style="width:${pct}%"></div></div><span>${pct}%</span></div>`;
}

function statsHtml(stats) {
  return `<div class="evo-stats">${Object.entries(stats).map(([s, r]) =>
    `<div class="evo-stat"><span>${NOME_STAT[s] || s}</span><b>${"●".repeat(r)}${"○".repeat(4 - r)}</b></div>`).join("")}</div>`;
}

/* la scheda di un combattente: il tuo eroe, un candidato, l'avversario con i suoi punti di forza */
function schedaHtml(e, titolo = "", opz = {}) {
  const poteri = e.poteri.map(p => `<div class="evo-potere"><b>⚡ ${esc(p.nome)}</b> <span class="evo-rango">r${p.rango}</span>
      <small>${p.mosse.map(esc).join(" · ")}</small></div>`).join("") || '<div class="muted">nessun potere</div>';
  const impianti = [...e.protesi.map(x => `<span class="evo-chip" title="${esc(x.descrizione)}">🦾 ${esc(x.nome)}</span>`),
                    ...e.augments.map(x => `<span class="evo-chip" title="${esc(x.descrizione)}">🔌 ${esc(x.nome)}</span>`)].join("");
  const muts = e.mutazioni.map(m => chipMut(m, opz.mutazioniEstese)).join("");
  const storia = (opz.storia && e.storia.length) ? `<details class="evo-storia"><summary>Cosa ha raccolto finora</summary>
      ${e.storia.map(s => `<div>giro ${s.round + 1}: ${s.novita.map(esc).join(", ") || "—"}</div>`).join("")}</details>` : "";
  return `<div class="evo-scheda ${e.elite ? "elite" : ""} ${opz.cls || ""}">
    ${titolo ? `<div class="evo-eroe-sub">${titolo}</div>` : ""}
    ${e.scala ? `<div class="evo-scala" title="Oltre le statistiche, i poteri e le mutazioni: la scala dell'infinito non ha fondo">∞ livello ${e.infinito}: +${e.scala.hp} hp (testa e busto) · +${e.scala.armatura} armatura · +${e.scala.danni}% danni</div>` : ""}
    <div class="evo-scheda-testa">
      ${sagoma(e.aspetto)}
      <div class="evo-scheda-nome"><div class="evo-eroe-nome">${esc(e.nome)}${e.elite ? ' <span class="evo-elite">ÉLITE</span>' : ""}</div>
        <div class="muted evo-forza" title="Quanto vale la scheda: statistiche, poteri, impianti e mutazioni">forza ${e.forza}</div>
        ${barraVita(e.hp.frazione)}</div>
    </div>
    ${statsHtml(e.stats)}
    <div class="evo-poteri">${poteri}</div>
    ${impianti ? `<div class="evo-riga">${impianti}</div>` : ""}
    ${muts ? `<div class="evo-riga ${opz.mutazioniEstese ? "colonna" : ""}">${muts}</div>` : ""}
    ${storia}
  </div>`;
}

/* la striscia in alto: dove sei nella corsa, gettoni, il tuo eroe */
function hudHtml() {
  const tappe = ["Ottavi", "Quarti", "Semifinale", "Finale"].map((t, i) =>
    `<span class="evo-tappa ${i < S.round || inf() ? "fatta" : i === S.round ? "qui" : ""}" title="${t}">${i + 1}</span>`).join('<i></i>')
    + (inf() ? `<i></i><span class="evo-tappa qui evo-inf" title="Modalità infinita: livello ${inf().livello}">∞${inf().livello}</span>` : "");
  const e = S.eroe;
  return `<div class="evo-hud">
    <div class="evo-hud-eroe"><b>${esc(e.nome)}</b>${barraVita(e.hp.frazione, "corta")}</div>
    <div class="evo-track" title="Ottavi, Quarti, Semifinale, Finale">${tappe}</div>
    <div class="evo-gettoni" title="I gettoni servono al Mercato, ai rilanci e alle puntate del Banco">🪙 <b>${S.gettoni}</b></div>
    ${S.ascensione ? `<div class="evo-asc-chip" title="Ascensione ${S.ascensione}: ${esc(S.ascensione_nome)}">▲${S.ascensione}</div>` : ""}
    <div class="evo-hud-punti muted" title="Il punteggio che hai accumulato finora">${S.punteggio_parziale} pt</div>
  </div>
  ${e.mutazioni.length ? `<div class="evo-hud-mut">${e.mutazioni.map(m => chipMut(m)).join("")}</div>` : ""}`;
}

/* la modalita' infinita (dopo il titolo): {vinti, livello, record, boss} se e' in corso, altrimenti null */
const inf = () => (S.infinito && S.infinito.attivo ? S.infinito : null);
const ritiraHtml = () => inf() ? `<button class="btn btn-ghost evo-ritira" onclick="if (confirm('Ti ritiri dall\\'infinito? Il punteggio resta tuo.')) azione({tipo:'ritira'})"
    title="Perdere o ritirarsi vale lo stesso: il punteggio che hai fatto resta">Ritirati</button>` : "";

const avvisoHtml = () => (S.avviso && S.avviso.length) ? `<div class="evo-avviso">${S.avviso.map(esc).join("<br>")}</div>` : "";
const erroreHtml = () => errore ? `<div class="evo-errore" role="alert">${esc(errore)}</div>` : "";

/* ---------- bracket ---------- */
function bracketHtml() {
  const colonne = [];
  for (let t = 0; t < 4; t++) {
    const turno = S.turni[t], nMatch = 8 >> t;
    let html = `<div class="evo-col"><div class="evo-col-titolo">${["OTTAVI", "QUARTI", "SEMI", "FINALE"][t]}</div>`;
    for (let m = 0; m < nMatch; m++) {
      const match = turno ? turno[m] : null;
      html += `<div class="evo-match">${slotHtml(match, "a")}${slotHtml(match, "b")}</div>`;
    }
    colonne.push(html + "</div>");
  }
  const ultimo = S.turni[3];
  const campione = ultimo && ultimo[0].win != null ? S.partecipanti[ultimo[0].win].nome : "?";
  colonne.push(`<div class="evo-col"><div class="evo-col-titolo">CAMPIONE</div>
    <div class="evo-match evo-campione ${campione !== "?" ? "rivelato" : ""}"><div class="evo-slot">🏆 ${esc(campione)}</div></div></div>`);
  return `<div class="evo-bracket">${colonne.join("")}</div>`;
}

function slotHtml(match, lato) {
  if (!match) return `<div class="evo-slot vuoto">—</div>`;
  const idx = match[lato], p = S.partecipanti[idx];
  const ko = match.win != null && match.win !== idx ? " ko" : "";
  return `<div class="evo-slot${idx === S.io ? " io" : ""}${ko}${match.win === idx ? " avanza" : ""}">
    <span class="evo-nome">${esc(p.nome)}</span><span class="evo-pot">${p.potenza}</span>${ko ? '<span class="evo-x">✕</span>' : ""}</div>`;
}

/* ---------- schermate ---------- */
function render() {
  if (S.fase !== faseVista) { faseVista = S.fase; window.scrollTo(0, 0); }
  if (!S.attivo) renderLanding();
  else ({campioni: renderCampioni, bracket: renderScontro, sparring: renderScontro, duello: renderDuello, bottino: renderBottino, porte: renderPorte,
         mercato: renderMercato, allenamento: renderAllenamento, evento: renderEvento, vittoria: renderFine, eliminato: renderFine})[S.fase]();
  disegnaAnteprime();
}

function renderLanding() {
  const m = S.meta, asc = S.ascensioni;
  if (ascScelta > m.ascensione_max) ascScelta = 0;
  const storico = m.storico.slice().reverse().slice(0, 6).map(r => `<tr><td>${esc(r.eroe)}</td><td>${r.infinito ? "∞ " + r.infinito : esc(r.turno)}${r.titolo ? " 🏆" : ""}</td>
      <td>▲${r.ascensione}</td><td>${r.mutazioni} mut.</td><td><b>${r.punteggio}</b></td></tr>`).join("");
  app().innerHTML = `
    <div class="evo-hero">
      <div class="evo-kicker">MODALITÀ A PARTE</div>
      <h1 class="evo-title">TORNEO <span>EVO</span></h1>
      <p class="muted evo-pitch">Una corsa roguelike in 16: scegli un eroe tra tre, poi di vittoria in vittoria costruisci il tuo combattente.
      Dopo ogni duello peschi il bottino (poteri, ranghi, impianti, <b>mutazioni</b>) e scegli una porta: riposo, mercato, allenamento, sparring d'élite o un incontro.
      La vita non si ricarica da sola. Non tocca la tua palestra: si gioca per il punteggio e per provare tutto senza perdere tempo né denaro.</p>
      <div class="evo-meta">
        <div><b>${m.migliore}</b><span>miglior punteggio</span></div>
        <div><b>${m.corse}</b><span>corse</span></div>
        <div><b>${m.titoli}</b><span>titoli</span></div>
        <div title="Gli sfidanti battuti di fila nella modalità infinita, dopo il titolo"><b>${m.infinito_max}</b><span>record infinito</span></div>
      </div>
      <div class="evo-asc-scelta" role="radiogroup" aria-label="Ascensione">
        ${asc.map(a => `<button class="evo-asc ${a.indice === ascScelta ? "scelta" : ""}" role="radio" aria-checked="${a.indice === ascScelta}"
            ${a.sbloccata ? `onclick="ascScelta=${a.indice};render()"` : "disabled"} title="${a.sbloccata ? "" : "Vinci il titolo all'ascensione precedente per sbloccarla"}">
          <b>${a.indice ? "▲" + a.indice + " " : ""}${esc(a.nome)}</b>
          <small>${a.sbloccata ? esc(a.regola) : "🔒 bloccata"}</small>
          ${a.indice ? `<small class="volt">punteggio ×${(1 + 0.25 * a.indice).toFixed(2)}</small>` : ""}
        </button>`).join("")}
      </div>
      ${erroreHtml()}
      <button class="btn btn-volt evo-cta" onclick="azione({tipo:'inizia', ascensione:ascScelta})">INIZIA LA CORSA</button>
      ${storico ? `<table class="evo-storico"><caption>Ultime corse</caption>${storico}</table>` : ""}
    </div>`;
}

function renderCampioni() {
  app().innerHTML = `
    <div class="evo-intro">
      <div class="evo-kicker">SCEGLI IL TUO CAMPIONE</div>
      <h2 class="evo-vs">Tre atleti, un solo posto</h2>
      <p class="muted evo-nota">Gli altri due restano nel tabellone, e prima o poi li incontrerai. Ognuno ha un potere, una statistica forte e un tratto di partenza.</p>
      <div class="evo-candidati">
        ${S.candidati.map(c => `<div class="evo-candidato">${schedaHtml(c, "", {mutazioniEstese: true})}
          <button class="btn btn-volt" onclick="azione({tipo:'campione', indice:${c.indice}})">SCEGLI ${esc(c.nome.split(" ")[0]).toUpperCase()}</button></div>`).join("")}
      </div>
      ${erroreHtml()}
      <details class="evo-tabellone"><summary>Il tabellone</summary>${bracketHtml()}</details>
    </div>`;
}

function pronosticoHtml() {
  const p = Math.round(S.pronostico * 100);
  const [et, cls] = p >= 60 ? ["Favorito", "ok"] : p >= 45 ? ["Equilibrato", "mid"] : ["Sfavorito", "low"];
  return `<div class="evo-pron ${cls}" title="Il pronostico tiene conto della forza di entrambi e della vita che ti è rimasta">
    <span>${et}</span><div class="evo-pron-barra"><i style="width:${p}%"></i></div><b>${p}%</b></div>`;
}

function regolaHtml(r) {
  return r.id === "standard" ? `<div class="evo-regola std">${r.icona} ${esc(r.nome)}</div>`
    : `<div class="evo-regola"><b>${r.icona} Regola d'arena: ${esc(r.nome)}</b><span>${esc(r.descrizione)}</span></div>`;
}

function renderScontro() {
  const sparring = S.fase === "sparring";
  app().innerHTML = `
    <div class="evo-intro">
      ${hudHtml()}
      <div class="evo-kicker">${sparring ? "SPARRING D'ÉLITE" : inf() ? `${inf().boss ? "☠ BOSS · " : ""}INFINITO · LIVELLO ${inf().livello}` : S.nome_turno.toUpperCase()}</div>
      <h2 class="evo-vs">${esc(S.eroe.nome)} <span class="muted">vs</span> ${esc(S.avversario.nome)}</h2>
      ${sparring ? `<p class="muted evo-nota">Se vinci: 5 gettoni e un bottino di mutazioni rare. Se perdi: perdi tutti i gettoni e resti a un quarto della vita, ma la corsa continua.</p>` : ""}
      ${regolaHtml(S.regola)}
      ${pronosticoHtml()}
      ${avvisoHtml()}
      <div class="evo-vsrow">
        ${schedaHtml(S.eroe, "IL TUO CAMPIONE", {cls: "mio", mutazioniEstese: true})}
        <div class="evo-vsmezzo">VS</div>
        ${schedaHtml(S.avversario, sparring ? "L'ÉLITE" : inf() ? (inf().boss ? "IL BOSS" : "LO SFIDANTE") : "L'AVVERSARIO", {storia: true, mutazioniEstese: true})}
      </div>
      ${erroreHtml()}
      <button class="btn btn-volt evo-cta" onclick="azione({tipo:'combatti'})">⚔ COMBATTI</button>${sparring ? "" : ritiraHtml()}
      ${S.log_arena.length ? `<div class="evo-arena-log">${S.log_arena.map(esc).join("<br>")}</div>` : ""}
      ${sparring || inf() ? "" : `<details class="evo-tabellone"><summary>Il tabellone</summary>${bracketHtml()}</details>`}
    </div>`;
}

function renderDuello() {
  app().innerHTML = `
    <div class="evo-intro">
      <p class="muted">C'è un incontro in corso.</p>
      <a class="btn btn-volt" href="/duello">Vai al duello →</a>
    </div>`;
}

/* una carta: bottino, mercato, allenamento. Il colore è la rarità, il resto lo dice il testo */
function cartaHtml(c, azioneJs, opz = {}) {
  const rar = c.rarita ? "rar-" + c.rarita : "rar-neutra";
  const mosse = c.mosse && c.mosse.length ? `<div class="evo-carta-mosse">${c.mosse.map(esc).join(" · ")}</div>` : "";
  return `<button class="evo-carta ${rar} tipo-${c.tipo} ${opz.cls || ""}" ${opz.disabled ? "disabled" : ""} onclick="${azioneJs}" style="animation-delay:${(opz.i || 0) * 0.12}s">
    <div class="evo-carta-icona">${c.icona}</div>
    <div class="evo-carta-sotto">${esc(c.sotto)}</div>
    <div class="evo-carta-titolo">${esc(c.titolo)}</div>
    <div class="evo-carta-desc">${esc(c.descrizione)}</div>
    ${mosse}
    ${c.umanita ? `<div class="muted evo-carta-umanita">Umanità ${c.umanita}</div>` : ""}
    ${opz.prezzo != null ? `<div class="evo-prezzo">${opz.comprata ? "✓ comprato" : `🪙 ${opz.prezzo}`}</div>` : ""}
    ${c.garantita ? `<div class="evo-garantita">★ garantita</div>` : ""}
  </button>`;
}

function renderBottino() {
  const b = S.bottino, nuovaCorsa = b.scelte > 1;
  const titolo = b.tipo === "elite" ? "Il premio dell'élite" : nuovaCorsa ? "Il tuo primo bottino" : "Il bottino";
  app().innerHTML = `
    <div class="evo-intro">
      ${hudHtml()}
      <div class="evo-kicker">${b.tipo === "elite" ? "SPARRING VINTO" : nuovaCorsa ? "PRIMA DI COMINCIARE" : S.nome_turno === "Ottavi" ? "OTTAVI SUPERATI" : "AVANTI"}</div>
      <h2 class="evo-vs">${titolo} <span class="muted">— ${b.scelte > 1 ? `scegli ${b.scelte} carte` : "scegli una carta"}</span></h2>
      ${avvisoHtml()}
      <div class="evo-carte">${b.carte.map((c, i) => cartaHtml(c, `azione({tipo:'carta', indice:${i}})`, {i})).join("")}</div>
      ${erroreHtml()}
      <div class="evo-azioni-finali">
        ${b.rilancio_possibile ? `<button class="btn btn-ghost" ${S.gettoni < b.costo_rilancio ? "disabled" : ""} onclick="azione({tipo:'rilancia'})"
            title="Tre carte nuove">🔄 Rilancia (🪙 ${b.costo_rilancio})</button>` : ""}
        <button class="btn btn-ghost" onclick="azione({tipo:'salta'})" title="Nessuna carta, due gettoni">Salta (+2 🪙)</button>
      </div>
    </div>`;
}

function renderPorte() {
  app().innerHTML = `
    <div class="evo-intro">
      ${hudHtml()}
      <div class="evo-kicker">${inf() ? `UNA PAUSA PRIMA DEL LIVELLO ${inf().livello}` : `UNA PAUSA PRIMA DEI ${S.nome_turno.toUpperCase()}`}</div>
      <h2 class="evo-vs">Scegli una porta</h2>
      ${avvisoHtml()}
      <div class="evo-porte">
        ${S.porte.map((p, i) => `<button class="evo-porta tipo-${p.tipo}" onclick="azione({tipo:'porta', indice:${i}})" style="animation-delay:${i * 0.12}s">
          <div class="evo-carta-icona">${p.icona}</div>
          <div class="evo-carta-titolo">${esc(p.titolo)}</div>
          <div class="evo-carta-desc">${esc(p.testo)}</div>
          ${p.avversario ? `<div class="evo-porta-elite">${sagoma(p.avversario.aspetto, "piccola")}<div><b>${esc(p.avversario.nome)}</b>
              <small>forza ${p.avversario.forza} · ${p.avversario.poteri.map(x => esc(x.nome) + " r" + x.rango).join(", ")}</small>
              <small>${p.avversario.mutazioni.map(m => m.icona + " " + esc(m.nome)).join(" · ")}</small>
              <small>${p.regola_info.icona} ${esc(p.regola_info.nome)}</small></div></div>` : ""}
        </button>`).join("")}
      </div>
      ${erroreHtml()}
      ${inf() ? ritiraHtml() : `<details class="evo-tabellone"><summary>Il tabellone</summary>${bracketHtml()}</details>`}
    </div>`;
}

function renderMercato() {
  app().innerHTML = `
    <div class="evo-intro">
      ${hudHtml()}
      <div class="evo-kicker">MERCATO NERO</div>
      <h2 class="evo-vs">Cosa ti serve?</h2>
      ${avvisoHtml()}
      <div class="evo-carte">${S.mercato.map((o, i) => cartaHtml(o, `azione({tipo:'compra', indice:${i}})`,
        {i, prezzo: o.prezzo, comprata: o.comprata, disabled: o.comprata || S.gettoni < o.prezzo, cls: o.comprata ? "comprata" : ""})).join("")}</div>
      ${erroreHtml()}
      <div class="evo-azioni-finali"><button class="btn btn-volt" onclick="azione({tipo:'esci_mercato'})">Esci dal mercato →</button></div>
    </div>`;
}

function renderAllenamento() {
  app().innerHTML = `
    <div class="evo-intro">
      ${hudHtml()}
      <div class="evo-kicker">ALLENAMENTO</div>
      <h2 class="evo-vs">Su cosa lavori? <span class="muted">— una sola cosa</span></h2>
      ${avvisoHtml()}
      <div class="evo-carte">${S.allenamento.map((o, i) => cartaHtml(o, `azione({tipo:'allena', indice:${i}})`, {i})).join("")}</div>
      ${erroreHtml()}
    </div>`;
}

function renderEvento() {
  const ev = S.evento;
  const scelte = ev.esito ? "" : `<div class="evo-scelte-evento">${ev.scelte.map((s, i) =>
    `<button class="btn btn-ghost" ${s.disponibile ? "" : "disabled"} onclick="azione({tipo:'evento', indice:${i}})">${esc(s.testo)}${s.costo ? ` <b>🪙 ${s.costo}</b>` : ""}</button>`).join("")}</div>`;
  const esito = ev.esito ? `<div class="evo-esito"><p>${ev.esito.righe.map(esc).join(" ")}</p>
      ${ev.esito.effetti.map(e => `<div class="evo-effetto">${esc(e)}</div>`).join("")}
      <button class="btn btn-volt evo-cta" onclick="azione({tipo:'chiudi_evento'})">Prosegui →</button></div>` : "";
  app().innerHTML = `
    <div class="evo-intro">
      ${hudHtml()}
      <div class="evo-kicker">INCONTRO</div>
      <div class="evo-carta-icona grande">${ev.icona}</div>
      <h2 class="evo-vs">${esc(ev.titolo)}</h2>
      <p class="evo-testo-evento">${esc(ev.testo)}</p>
      ${scelte}${esito}
      ${erroreHtml()}
    </div>`;
}

function renderFine() {
  const vinto = S.fase === "vittoria", r = S.riepilogo;
  const coriandoli = vinto ? Array.from({length: 16}, (_, i) =>
    `<span class="coriandolo" style="left:${6 * i + 3}%; animation-delay:${(i % 5) * .35}s"></span>`).join("") : "";
  const righe = r.righe.map(([et, p]) => `<tr><td>${esc(et)}</td><td>+${p}</td></tr>`).join("");
  const fineInf = !vinto && r.infinito != null;                // finita la modalita' infinita (persa o ritirato): il titolo c'e' gia'
  const infinitaHtml = vinto && S.puo_infinito ? `<div class="evo-infinita">
      <h3>♾ Modalità infinita <small>facoltativa</small></h3>
      <p>Continua a combattere contro sfidanti sempre più forti, uno dopo l'altro, finché non perdi. Il tuo punteggio resta e ogni sfidante battuto ne aggiunge; ogni quinto è un boss.
      Parti con un bottino garantito. Il tuo record: <b>${S.infinito.record}</b>.</p>
      <button class="btn btn-volt" onclick="azione({tipo:'infinito'})">CONTINUA ALL'INFINITO</button></div>` : "";
  const titolo = vinto ? "CAMPIONE <span>EVO</span>" : fineInf ? (r.ritirato ? "RITIRATO" : "ELIMINATO") : "ELIMINATO";
  const sotto = vinto ? `${esc(S.eroe.nome)} ha vinto il Torneo Evo.`
    : fineInf ? `${esc(S.eroe.nome)} ha vinto il Torneo Evo e nella modalità infinita ha battuto <b>${r.infinito}</b> ${r.infinito === 1 ? "sfidante" : "sfidanti"}${r.ritirato ? " prima di ritirarsi" : ""}.`
    : `${esc(S.eroe.nome)} esce ai ${esc(S.nome_turno.toLowerCase())}. Il torneo l'ha vinto <b>${esc(S.campione)}</b>.`;
  app().innerHTML = `
    <div class="${vinto ? "evo-vittoria" : "evo-intro"}">${coriandoli}
      ${vinto ? '<div class="evo-trofeo">🏆</div>' : ""}
      <h1 class="evo-title ${vinto || r.ritirato ? "" : "evo-rosso"}">${titolo}</h1>
      <p class="muted">${sotto}</p>
      <table class="evo-riepilogo"><caption>Il punteggio</caption>${righe}
        ${r.moltiplicatore > 1 ? `<tr class="mol"><td>Ascensione ▲${S.ascensione} (${esc(S.ascensione_nome)})</td><td>×${r.moltiplicatore.toFixed(2)}</td></tr>` : ""}
        <tr class="tot"><td>TOTALE</td><td>${r.totale}</td></tr></table>
      ${r.record ? '<div class="evo-record">★ NUOVO RECORD</div>' : `<p class="muted">Il tuo record: ${S.meta.migliore}</p>`}
      ${r.sbloccata ? `<div class="evo-record">🔓 Ascensione sbloccata: ${esc(r.sbloccata)}</div>` : ""}
      ${fineInf && r.infinito >= S.meta.infinito_max && r.infinito > 0 ? `<div class="evo-record">♾ RECORD INFINITO: ${r.infinito}</div>` : ""}
      ${infinitaHtml}
      <div class="evo-vsrow solo">${schedaHtml(S.eroe, "IL TUO CAMPIONE", {mutazioniEstese: true})}</div>
      <details class="evo-tabellone"><summary>Il tabellone</summary>${bracketHtml()}</details>
      <div class="evo-azioni-finali">
        <button class="btn btn-volt" onclick="azione({tipo:'chiudi'})">Nuova corsa</button>
        <button class="btn btn-ghost" onclick="esciAllaPalestra()">Torna alla palestra →</button>
      </div>
    </div>`;
}

async function esciAllaPalestra() {
  await fetch("/api/torneo/azione", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({tipo: "chiudi"})});
  window.location.href = "/palestra";
}

fetchStato();
