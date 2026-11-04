/* Urban — il Compendium: ogni potere a ogni rango, con mosse, stance ed effetti (dati da /api/compendio/catalogo). Solo lettura. */
(() => {
  const lista = document.getElementById("comp-lista"), dett = document.getElementById("comp-dettaglio");
  if (!lista || !dett) return;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  let catalogo = [], potere = null, rango = 1;

  const chip = t => `<span class="chip-tag">${esc(t)}</span>`;

  function cartaMossa(a) {
    const effetti = a.effetti.map(e => `<div class="scena-effetto"><b>${esc(e.nome)}</b> <span class="muted">(${e.turni < 0 ? "persistente" : e.turni + (e.turni === 1 ? " turno" : " turni")})</span> — ${esc(e.desc)}</div>`).join("");
    return `<div class="comp-carta${a.nuovo ? " nuova" : ""}">
      <div class="comp-carta-testa"><b>${esc(a.nome)}</b>${a.nuovo ? '<span class="comp-nuovo">nuova a questo rango</span>' : ""}</div>
      ${a.sostituisce ? `<div class="muted">Prende il posto di ${esc(a.sostituisce)} finché si può usare</div>` : ""}
      <div class="scena-tags">${a.tags.map(chip).join("")}</div>
      ${a.desc ? `<div class="scena-desc">${esc(a.desc)}</div>` : ""}${effetti}</div>`;
  }

  function cartaStance(s) {
    const meta = [`durata: ${s.durata}`, s.cooldown ? `ricarica ${s.cooldown} turni` : "", s.usi ? `${s.usi} uso/i per duello` : ""].filter(Boolean);
    return `<div class="comp-carta${s.nuova ? " nuova" : ""}">
      <div class="comp-carta-testa"><b>${esc(s.nome)}</b>${s.nuova ? '<span class="comp-nuovo">nuova a questo rango</span>' : ""}
        ${s.attivata ? '<span class="comp-nuovo fissa">si attiva da sola con il potere</span>' : ""}</div>
      <div class="scena-tags">${(s.attivata ? ["permanente finché il potere è acceso"] : meta).map(chip).join("")}</div>
      ${s.desc ? `<div class="scena-desc">${esc(s.desc)}</div>` : ""}</div>`;
  }

  function sezione(titolo, corpo, vuoto) {
    return `<div class="comp-sez"><h3>${titolo}</h3>${corpo || `<div class="muted">${vuoto}</div>`}</div>`;
  }

  function disegnaLista() {
    lista.innerHTML = catalogo.map(p => `<button type="button" class="comp-voce${p === potere ? " on" : ""}" data-id="${p.id}">${esc(p.nome)}</button>`).join("");
  }

  function disegna() {
    const r = potere.ranghi[Math.min(rango, potere.rango_max) - 1];
    // quel che porta ogni rango, in una riga: si vede subito dove arrivano le mosse nuove
    const riga = potere.ranghi.map(x => {
      const nuovi = [...x.attacchi.filter(a => a.nuovo).map(a => a.nome), ...x.stance.filter(s => s.nuova).map(s => s.nome)];
      return `<button type="button" class="comp-rango${x.rango === r.rango ? " on" : ""}" data-rango="${x.rango}">
        <b>Rango ${x.rango}</b><span>${nuovi.length ? esc(nuovi.join(", ")) : "rafforza quello che ha"}</span></button>`;
    }).join("");
    dett.innerHTML = `
      <div class="comp-testa"><h2>${esc(potere.nome)}</h2>
        <a class="btn btn-volt btn-sm" href="/compendio/prova?potere=${potere.id}&rango=${r.rango}" title="Equipaggia il potere a questo rango su un pupazzo e provalo">Provalo al rango ${r.rango} →</a></div>
      <p class="muted">${esc(potere.descrizione)}</p>
      <div class="comp-ranghi">${riga}</div>
      ${sezione("Effetti all'accensione", r.effetti.length ? `<ul class="comp-elenco">${r.effetti.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : "", "Nessun effetto immediato a questo rango.")}
      ${r.effetti_nel_tempo.length ? sezione("Effetti nel tempo", `<ul class="comp-elenco">${r.effetti_nel_tempo.map(e =>
        `<li><b>${esc(e.nome)}</b> <span class="muted">(${e.turni == null ? "finché il potere è acceso" : e.turni + " turni"})</span> — ${esc(e.desc)}</li>`).join("")}</ul>`) : ""}
      ${sezione(`Mosse (${r.attacchi.length})`, r.attacchi.map(cartaMossa).join(""), "Questo potere non dà mosse a questo rango.")}
      ${sezione(`Stance (${r.stance.length})`, r.stance.map(cartaStance).join(""), "Nessuna stance a questo rango.")}
      <p class="muted comp-nota">Le mosse e le stance dei ranghi più bassi restano tue anche ai ranghi più alti. Costo del potere sul ring: stamina pari al rango, a ogni turno.</p>`;
  }

  function scegli(id, r) {
    potere = catalogo.find(p => p.id === id) || catalogo[0];
    rango = r || 1;
    history.replaceState(history.state, "", "#potere-" + potere.id);
    disegnaLista();
    disegna();
  }

  lista.addEventListener("click", e => {
    const b = e.target.closest(".comp-voce");
    if (b) scegli(parseInt(b.dataset.id, 10), rango);
  });
  dett.addEventListener("click", e => {
    const b = e.target.closest(".comp-rango");
    if (b) { rango = parseInt(b.dataset.rango, 10); disegna(); }
  });

  fetch("/api/compendio/catalogo").then(r => r.json()).then(c => {
    catalogo = c;
    const m = /^#potere-(\d+)$/.exec(location.hash);
    scegli(m ? parseInt(m[1], 10) : catalogo[0].id, 1);
  });
})();
