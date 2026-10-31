/* Urban — le schede senza ricaricare la pagina.
   Un link o un modulo di questo sito non fa piu' ricaricare tutto il documento: la pagina nuova si scarica con fetch e prende il
   posto del <main> (la testata con crediti e data si aggiorna). Cosi' la Palestra, con la sua scena fisica e i suoi ~200 sprite,
   resta viva mentre si guardano gli Aspiranti, il Negozio o la Serata: la sua radice ([data-viva]) viene solo parcheggiata
   fuori vista e ripresa, tale e quale, al ritorno. Una pagina viva dichiara in window.Vive[nome] due funzioni:
   sospendi() quando esce di scena e riprendi() quando rientra.
   Le pagine "pesanti" (il ring e il Torneo Evo: <body data-nav="completa">) hanno script con timer e variabili
   proprie e si aprono come sempre, con un caricamento vero; da quelle si esce allo stesso modo. */
(() => {
  if (!window.fetch || !window.DOMParser || !history.pushState || !window.URL) return;
  history.scrollRestoration = "manual";

  const PESANTI = /^\/(duello|torneo)(\/|$)/;           // si aprono con un caricamento vero
  const ESTERNI = /^\/(api|static)\//;                          // non sono pagine
  const chiaveSrc = (src) => new URL(src, location.href).pathname;
  const caricati = new Set();                                   // gli script con src gia' eseguiti in questo documento
  document.querySelectorAll("script[src]").forEach((s) => caricati.add(chiaveSrc(s.src)));
  const parcheggiate = {};                                      // nome -> radice viva parcheggiata
  let corrente = location.pathname + location.search;           // la pagina mostrata (senza #)
  let giro = 0;                                                 // la navigazione piu' recente vince
  let inVolo = false;                                           // un POST in corso: niente doppi invii

  window.Vive = window.Vive || {};
  const completa = () => document.body.dataset.nav === "completa";

  function stato(y) { try { history.replaceState({nav: 1, y: y ?? window.scrollY}, ""); } catch (e) { /* ignora */ } }
  const y0 = (history.state && history.state.y) || 0;           // dopo un ricaricamento si torna dov'ero
  stato(y0);
  if (y0) window.addEventListener("load", () => window.scrollTo(0, y0));
  let tScroll = 0;
  window.addEventListener("scroll", () => { clearTimeout(tScroll); tScroll = setTimeout(() => stato(), 200); }, {passive: true});

  /* ---- gli script di una pagina: in ordine, e una sola volta (le librerie), salvo quelli marcati data-ripeti ---- */
  function eseguiScript(vecchio) {
    return new Promise((fatto) => {
      const s = document.createElement("script");
      for (const a of vecchio.attributes) s.setAttribute(a.name, a.value);
      if (vecchio.getAttribute("src")) {
        s.async = false;
        s.onload = () => { s.remove(); fatto(); };
        s.onerror = () => { s.remove(); fatto(); };
        document.body.appendChild(s);
      } else { s.textContent = vecchio.textContent; document.body.appendChild(s); s.remove(); fatto(); }
    });
  }

  /* ---- la pagina viva che esce di scena viene parcheggiata, non distrutta ---- */
  function parcheggioEl() {
    let p = document.getElementById("nav-parcheggio");
    if (!p) { p = document.createElement("div"); p.id = "nav-parcheggio"; p.hidden = true; document.body.appendChild(p); }
    return p;
  }
  function congeda(main) {
    for (const el of main.querySelectorAll("[data-viva]")) {
      const nome = el.dataset.viva;
      try { window.Vive[nome] && window.Vive[nome].sospendi && window.Vive[nome].sospendi(); } catch (e) { console.error(e); }
      parcheggioEl().appendChild(el);
      parcheggiate[nome] = el;
    }
  }

  async function mostra(doc, url, {push, y}) {
    const main = document.querySelector("main.page"), nuova = doc.querySelector("main.page");
    if (!main || !nuova) { location.assign(url); return; }
    if (push) stato();
    congeda(main);

    document.title = doc.title;
    document.body.className = doc.body.className;
    document.body.dataset.nav = doc.body.dataset.nav || "";
    const top = document.querySelector(".topbar"), topNuova = doc.querySelector(".topbar");
    if (top && topNuova) top.replaceWith(document.importNode(topNuova, true));
    const vecchioFlash = document.querySelector(".flash-wrap"), flash = doc.querySelector(".flash-wrap");
    if (vecchioFlash) vecchioFlash.remove();
    if (flash && document.querySelector(".topbar")) document.querySelector(".topbar").after(document.importNode(flash, true));

    const frag = document.createDocumentFragment();
    for (const n of nuova.childNodes) frag.appendChild(document.importNode(n, true));
    frag.querySelectorAll("script").forEach((s) => s.remove());
    let ripresa = null;
    for (const seg of frag.querySelectorAll("[data-viva]")) {
      const nome = seg.dataset.viva;
      if (parcheggiate[nome]) { seg.replaceWith(parcheggiate[nome]); ripresa = nome; delete parcheggiate[nome]; }
    }
    main.replaceChildren(frag);
    for (const el of main.querySelectorAll("[data-viva]")) el.hidden = false;

    if (push) history.pushState({nav: 1, y: 0}, "", url);
    corrente = location.pathname + location.search;
    const h = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    window.scrollTo(0, y != null ? y : h ? h.getBoundingClientRect().top + window.scrollY - 70 : 0);

    for (const sc of nuova.querySelectorAll("script")) {
      const src = sc.getAttribute("src");
      if (src) {
        const k = chiaveSrc(src);
        if (caricati.has(k) && !sc.hasAttribute("data-ripeti")) continue;
        caricati.add(k);
      }
      await eseguiScript(sc);
    }
    if (ripresa) { try { window.Vive[ripresa] && window.Vive[ripresa].riprendi && window.Vive[ripresa].riprendi(); } catch (e) { console.error(e); } }
    document.dispatchEvent(new CustomEvent("nav:fatto", {detail: {url}}));
  }

  async function vai(url, {metodo = "GET", corpo = null, push = true, y = null, form = null} = {}) {
    const u = new URL(url, location.href);
    if (PESANTI.test(u.pathname) && metodo === "GET") { location.assign(u.href); return; }
    if (metodo !== "GET") { if (inVolo) return; inVolo = true; }
    const mio = ++giro;
    document.body.classList.add("nav-carico");
    try {
      let res;
      try { res = await fetch(u.href, {method: metodo, body: corpo, credentials: "same-origin"}); }
      catch (e) {                                              // rete assente: come prima, un caricamento vero
        if (form) { form.dataset.nonav = "1"; form.submit(); } else location.assign(u.href);
        return;
      }
      if (mio !== giro) return;
      const finale = res.url || u.href;
      if (!(res.headers.get("content-type") || "").includes("text/html")) { location.assign(finale); return; }
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      if (mio !== giro) return;
      if (doc.body.dataset.nav === "completa") { location.assign(finale); return; }
      const f = new URL(finale);
      // (la stessa pagina di prima, anche dopo un modulo: si aggiorna senza aggiungere una voce alla cronologia)
      await mostra(doc, finale, {push: push && !(f.pathname + f.search === corrente && !f.hash), y});
    } finally {
      if (metodo !== "GET") inVolo = false;
      if (mio === giro) document.body.classList.remove("nav-carico");
    }
  }

  /* ---- link e moduli ---- */
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || completa()) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || a.dataset.nonav !== undefined) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || ESTERNI.test(u.pathname) || PESANTI.test(u.pathname)) return;
    if (u.pathname + u.search === corrente && u.hash) return;     // un'ancora della stessa pagina: ci pensa il browser
    e.preventDefault();
    vai(u.href);
  });

  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (e.defaultPrevented || completa() || !(f instanceof HTMLFormElement) || f.dataset.nonav !== undefined) return;
    if (f.target && f.target !== "_self") return;
    const sub = e.submitter;
    const metodo = ((sub && sub.getAttribute("formmethod")) || f.getAttribute("method") || "get").toUpperCase();
    const u = new URL((sub && sub.getAttribute("formaction")) || f.getAttribute("action") || location.href, location.href);
    if (u.origin !== location.origin || ESTERNI.test(u.pathname) || (f.enctype || "").includes("multipart")) return;
    let dati;
    try { dati = new FormData(f, sub); } catch (err) { dati = new FormData(f); }
    e.preventDefault();
    const q = new URLSearchParams(dati);
    if (metodo === "GET") { u.search = q.toString(); vai(u.href); }
    else vai(u.href, {metodo: "POST", corpo: q, form: f});
  });

  window.addEventListener("popstate", () => {
    if (location.pathname + location.search === corrente) return;  // solo l'ancora e' cambiata
    if (completa() || PESANTI.test(location.pathname)) { location.reload(); return; }
    vai(location.href, {push: false, y: (history.state && history.state.y) || 0});
  });

  /* ---- per le pagine: andare altrove e rinfrescare la testata (crediti e data) senza cambiare pagina ---- */
  let nTesta = 0;
  async function rinfrescaTesta() {
    const mio = ++nTesta;
    try {
      const res = await fetch(location.pathname + location.search, {credentials: "same-origin"});
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      if (mio !== nTesta) return;                                  // una richiesta piu' recente e' gia' partita
      const top = document.querySelector(".topbar"), nuova = doc.querySelector(".topbar");
      if (top && nuova) top.replaceWith(document.importNode(nuova, true));
    } catch (e) { /* la testata resta com'era */ }
  }
  window.Nav = {vai: (url) => (PESANTI.test(new URL(url, location.href).pathname) ? location.assign(url) : vai(url)), rinfrescaTesta};
})();
