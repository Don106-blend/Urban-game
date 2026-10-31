/* Disegna le anteprime dei personaggi: ogni <canvas class="anteprima" data-aspetto='{json}'> riceve il corpo con il suo aspetto
   (v. Arena.anteprima in arena.js, che va incluso prima). Usato dalle pagine Aspiranti, Serata e Scheda. */
document.querySelectorAll("canvas.anteprima[data-aspetto]").forEach(cv => {
  let a = null;
  try { a = JSON.parse(cv.dataset.aspetto); } catch (e) { /* senza aspetto: corpo nudo */ }
  Arena.anteprima(cv, a);
});
