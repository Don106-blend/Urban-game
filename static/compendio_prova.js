/* Urban — la palestra di prova del Compendium: due pupazzi base su cui equipaggiare fino a 4 poteri (a qualsiasi rango) e provare ogni mossa,
   senza turni né limiti. Nessuno muore, e dopo qualche secondo di calma si rigenera tutto a vita piena (server: app.ProvaPoteri). */
let S = null;               // ultimo stato ricevuto
let lato = "p";             // il pupazzo su cui si equipaggia e con cui si agisce: "p" (blu) | "c" (rosso)
let rango = 1;              // il rango con cui si equipaggia il prossimo potere
let bersaglio = null;       // null = locazione casuale; altrimenti la locazione mirata (solo per le mosse mirabili)
let errore = null;
let timerRigenera = null;
let ultimoEffetto = null;   // n dell'ultimo evento di cui sono usciti i numeri e l'animazione
const RIGENERA_DOPO = 3200; // ms di calma prima di rigenerare i pupazzi a vita piena

const el = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const nomeLoc = l => esc(String(l).replace(/_/g, " "));
const altroLato = () => (lato === "p" ? "c" : "p");

async function carica() {
  S = await (await fetch("/api/compendio/prova/stato")).json();
  render();
  // dal Compendium: /compendio/prova?potere=ID&rango=R equipaggia subito quel potere sul pupazzo blu
  const q = new URLSearchParams(location.search), id = parseInt(q.get("potere"), 10), r = parseInt(q.get("rango"), 10);
  if (id) {
    history.replaceState(history.state, "", location.pathname);
    rango = Math.min(4, Math.max(1, r || 1));
    await invia({tipo: "equipaggia", id, rango});
  }
}

async function invia(azione) {
  const res = await fetch("/api/compendio/prova/azione", {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({lato, ...azione}),
  });
  S = await res.json();
  errore = S.errore || null;
  render();
  // dopo qualche secondo di calma i pupazzi tornano a vita piena (e l'armatura dei poteri e' di nuovo intera)
  clearTimeout(timerRigenera);
  if (S.danneggiato && azione.tipo !== "rigenera") {
    const arma = () => { timerRigenera = setTimeout(() => { if (Arena.occupata()) arma(); else invia({tipo: "rigenera"}); }, RIGENERA_DOPO); };
    arma();                                      // (le animazioni finiscono prima: si rigenera a scena ferma)
  }
}

/* ---------------- i pannelli laterali ---------------- */
function pannello(dove, p, chi) {
  const hp = Object.entries(p.hp).map(([loc, h]) => {
    const pct = Math.max(0, Math.round(h.val * 100 / h.max));
    const cls = pct > 60 ? "pct-hi" : pct > 30 ? "pct-mid" : "pct-low";
    return `<div class="pan-loc"><span>${nomeLoc(loc)}${h.crippled ? ' <span class="chip-crip">CR</span>' : ""}</span>
      <div class="hpbar"><div class="hpbar-fill ${cls}" style="width:${pct}%"></div></div>
      <span class="val">${h.val}${h.arm ? `<span class="chip-arm">+${h.arm}</span>` : ""}</span></div>`;
  }).join("");
  const chip = (t, tag, cls = "tag-attiva") => `<span class="pi">${esc(t)}${tag ? ` <small class="${cls}">${tag}</small>` : ""}</span>`;
  const riga = (et, v) => v ? `<div class="pan-inline"><b>${et}</b>${v}</div>` : "";
  const poteri = p.poteri.map(x => chip(`${x.nome} r${x.rango}`, x.attivo ? "ATTIVO" : "")).join("");
  const stance = p.stance.filter(x => x.turni != null).map(x => chip(x.nome, x.turni < 0 ? "perm." : "attiva")).join("");
  const effetti = p.effetti.map(x => chip(x.nome, x.turni < 0 ? "∞" : x.turni + "t", "chip-crip")).join("");
  const segno = n => (n >= 0 ? "+" : "−") + Math.abs(n);
  const tiri = (p.modificatori || []).map(m => chip(m.valore == null ? `${m.tiro}: no` : m.dado && !m.valore ? `${m.tiro} −dado` : `${m.tiro} ${segno(m.valore)}${m.unita ? " " + m.unita : ""}`,
    m.fonte, m.valore == null || m.valore < 0 ? "chip-crip" : "tag-attiva")).join("");
  const scelto = chi === lato;
  el(dove).innerHTML = `
    <button type="button" class="pan-nome prova-pan-nome" onclick="scegliLato('${chi}')" title="Equipaggia e usa le mosse di questo pupazzo">
      <span>${esc(p.nome)}</span>${scelto ? '<span class="pan-turno">IN USO</span>' : '<span class="muted">seleziona</span>'}</button>
    <div class="pan-sec pan-locs">${hp}</div>
    ${riga("Poteri", poteri)}${riga("Stance", stance)}${riga("Effetti", effetti)}${riga("Tiri", tiri)}`;
}

/* ---------------- l'ultimo scambio, in una riga (il dettaglio nel suggerimento) ---------------- */
function scena(V = S) {
  const evs = V.eventi || [], ev = evs[evs.length - 1];
  if (!ev) { el("d-scena").innerHTML = `<div class="prova-ticker muted">Equipaggia un potere qui sotto e prova le sue mosse. I pupazzi non muoiono e si rigenerano da soli.</div>`; return; }
  let testo, dett = [];
  if (ev.tipo === "colpo") {
    const esito = ev.esito === "colpito"
      ? `<b class="danger">${ev.hp_persi > 0 ? "−" + ev.hp_persi + " HP" : "nessun danno"}</b> ${ev.split ? "su tutto il corpo" : "a " + nomeLoc(ev.loc)} <span class="muted">· ${esc(ev.tipo_danno)}${ev.assorbito ? ` · armatura −${ev.assorbito}` : ""}</span>`
      : `<b>${esc({parato: "parato", schivato: "schivato", retto: "schivato d'istinto"}[ev.esito] || ev.esito)}</b>`;
    testo = `⚔ <span class="chi-badge b-${ev.chi}">${esc(ev.attaccante)}</span> <b>${esc(ev.info.nome)}</b>${ev.colpi > 1 ? ` <span class="muted">${ev.colpo}/${ev.colpi}</span>` : ""} ${ev.mirata ? "🎯 " : ""}→ ${esito}`;
    dett = [ev.info.desc, ...(ev.info.tags || []), ...(ev.dettagli || [])];
  } else {
    testo = `${ev.tipo === "stance" ? "♦" : "✦"} <span class="chi-badge b-${ev.chi}">${esc(ev.nome)}</span> <b>${esc(ev.titolo)}</b>${ev.rango ? ` <span class="muted">r${ev.rango}</span>` : ""} <span class="muted">${esc((ev.righe || []).map(x => String(x).trim()).slice(0, 3).join(" · "))}</span>`;
    dett = [ev.desc, ...(ev.righe || [])];
  }
  el("d-scena").innerHTML = `<div class="prova-ticker" title="${esc(dett.filter(Boolean).join(" — "))}">${testo}</div>`;
}

/* numeri che escono dal pupazzo colpito, e l'animazione dell'arena per gli eventi nuovi */
function effettiNuoviEventi() {
  const evs = S.eventi || [], maxN = evs.length ? evs[evs.length - 1].n : 0;
  if (ultimoEffetto === null) { ultimoEffetto = maxN; return; }
  for (const ev of evs) {
    if (ev.n <= ultimoEffetto) continue;
    if (ev.tipo !== "colpo") { if (["potere", "stance"].includes(ev.tipo)) Arena.evento(ev); continue; }
    if (Arena.pronta()) Arena.colpo(ev); else impatto(ev);           // la scena lo recita e, al contatto, chiama impatto()
  }
  ultimoEffetto = maxN;
}

/* il colpo e' arrivato nella scena: adesso si segnano danno, numero e scheda */
function impatto(ev) {
  const corner = document.querySelector(ev.chi === "p" ? ".corner-cpu" : ".corner-player");
  if (corner) {
    const f = document.createElement("div");
    f.className = "fl " + (ev.esito === "colpito" ? "fl-hit" : "fl-miss");
    f.textContent = ev.esito === "colpito" ? "−" + ev.hp_persi : "MANCATO";
    corner.appendChild(f);
    setTimeout(() => f.remove(), 1500);
  }
  if (S) render();
}
Arena.alImpatto(impatto);

/* ---------------- la parte bassa: poteri da equipaggiare, mosse da provare ---------------- */
const bottone = (testo, js, classe = "", dis = false, titolo = "") =>
  `<button type="button" class="btn prova-btn ${classe}" ${dis ? "disabled" : ""} ${titolo ? `title="${esc(titolo)}"` : ""} onclick='${js}'>${testo}</button>`;

function azioni() {
  const me = S.menu[lato], altro = S.menu[altroLato()], nomeLato = lato === "p" ? S.player.nome : S.cpu.nome;
  const equip = Object.fromEntries(me.poteri.map(x => [x.id, x.rango]));
  const pieno = me.poteri.length >= S.max_poteri;
  const lati = ["p", "c"].map(l => bottone(`${l === "p" ? "🔵" : "🔴"} ${esc(l === "p" ? S.player.nome : S.cpu.nome)}`, `scegliLato("${l}")`, l === lato ? "on" : "")).join("");
  const bers = bottone("🎯 casuale", "bersaglio=null;render()", bersaglio === null ? "on" : "", false, "Un colpo non mirato: il busto il doppio delle volte") +
    altro.locazioni.map(l => bottone(nomeLoc(l), `bersaglio="${l}";render()`, bersaglio === l ? "on" : "", false, "Le mosse mirabili colpiscono qui; le altre restano casuali")).join("");
  const ranghi = [1, 2, 3, 4].map(r => bottone(`R${r}`, `rango=${r};render()`, r === rango ? "on" : "", false, `Equipaggia al rango ${r}`)).join("");
  const potere = p => {
    const r = equip[p.id];
    const dis = !r && pieno || rango > p.rango_max;
    const titolo = r ? (r === rango ? "Toglilo" : `Passa al rango ${rango}`) : pieno ? `Già ${S.max_poteri} poteri: toglierne uno` : `Equipaggia al rango ${rango}`;
    const js = r === rango ? `invia({tipo:"rimuovi",id:${p.id}})` : `invia({tipo:"equipaggia",id:${p.id},rango:${rango}})`;
    return bottone(`${esc(p.nome)}${r ? ` <b>r${r}</b>` : ""}`, js, "potere" + (r ? " on" : ""), dis, `${titolo}. ${p.descrizione || ""}`);
  };
  const attacco = a => {
    const mirata = bersaglio && a.can_aim;
    const meta = [a.info.tags[0], a.colpi > 1 ? `${a.colpi} colpi` : "", a.costo_azioni > 1 ? `${a.costo_azioni} azioni` : "", bersaglio && !a.can_aim ? "non si mira" : ""].filter(Boolean).join(" · ");
    return bottone(`<b>${esc(a.nome)}</b><small>${esc(meta)}</small>`, `invia({tipo:"attacco",id:${a.id}${bersaglio ? `,loc:"${bersaglio}"` : ""}})`, "mossa" + (mirata ? " mirata" : ""), false,
      `${a.info.desc || ""}\n${a.info.tags.join(" · ")}${a.info.effetti.length ? "\nEffetti: " + a.info.effetti.map(e => e.nome + " — " + e.desc).join("; ") : ""}`);
  };
  const stance = s => bottone(`♦ ${esc(s.nome)}${s.attiva ? " <b>attiva</b>" : ""}`, `invia({tipo:"stance",id:${s.id}})`, "stance" + (s.attiva ? " on" : ""), false,
    (s.desc || "") + (s.da_potere ? " (data dal potere: dura finché è acceso)" : s.attiva ? " — clicca per spegnerla" : ""));
  el("d-azioni").innerHTML = `
    <div class="prova-riga prova-controlli"><span class="titolo-menu">Pupazzo</span>${lati}
      <span class="prova-sep"></span>
      <label class="prova-check" title="Il bersaglio non para e ogni colpo lo prende. Spento: tiro per colpire vero sui riflessi."><input type="checkbox" ${S.a_segno ? "checked" : ""} onchange='invia({tipo:"a_segno",valore:this.checked})'> sempre a segno</label>
      ${bottone("↻ Rigenera", 'invia({tipo:"rigenera"})', "", false, "Vita piena e armatura intera per tutti e due (succede da sola dopo qualche secondo)")}
      ${bottone("⏱ Avanza un turno", 'invia({tipo:"turno"})', "", false, "Fa scorrere un turno: effetti nel tempo (bruciature, cure) e durata delle stance. Facoltativo: qui di norma non ci sono turni")}
      ${bottone("⌫ Azzera", 'if(confirm("Togliere tutti i poteri a tutti e due i pupazzi?"))invia({tipo:"ripulisci"})', "", false, "Due pupazzi base, senza poteri")}</div>
    <div class="prova-riga"><span class="titolo-menu">Poteri di ${esc(nomeLato)} <span class="muted">(${me.poteri.length}/${S.max_poteri})</span></span>
      <span class="prova-ranghi" title="Il rango con cui si equipaggia">Rango ${ranghi}</span>
      ${errore ? `<span class="azz-errore" role="alert">${esc(errore)}</span>` : ""}</div>
    <div class="prova-riga prova-poteri">${S.poteri.map(potere).join("")}</div>
    <div class="prova-riga"><span class="titolo-menu">Mosse di ${esc(nomeLato)}</span>
      <span class="prova-ranghi">Bersaglio ${bers}</span></div>
    <div class="prova-riga prova-mosse">${me.attacchi.map(attacco).join("")}${me.stance.map(stance).join("")}</div>`;
}

function scegliLato(l) { lato = l; if (bersaglio && !S.menu[altroLato()].locazioni.includes(bersaglio)) bersaglio = null; render(); }

function render() {
  effettiNuoviEventi();                          // prima i colpi nuovi: finche' non arrivano al contatto Arena.vista tiene indietro i loro danni
  const V = Arena.vista(S);
  pannello("pan-player", V.player, "p");
  pannello("pan-cpu", V.cpu, "c");
  Arena.update(V);
  scena(V);
  azioni();
}

carica();
