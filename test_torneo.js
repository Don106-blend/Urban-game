/* Check del client del Torneo Evo (static/torneo.js), senza browser: node test_torneo.js stati.json
   `stati.json` e' una lista di stati veri dell'API (li scrive test_evo.py): ogni schermata si disegna senza errori, senza "undefined" ne' "NaN",
   con i testi che servono, e i nomi (che vengono dal server) escono sempre sfuggiti. */
const fs = require("fs");
const path = require("path");

let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error("FALLITO:", m); process.exit(1); } };

const stati = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = {innerHTML: ""};
global.document = {getElementById: () => out, querySelectorAll: () => []};
global.window = {scrollTo() {}, location: {href: ""}};
global.fetch = async () => ({ok: true, json: async () => ({})});
const src = fs.readFileSync(path.join(__dirname, "static", "torneo.js"), "utf8").replace(/^fetchStato\(\);\s*$/m, "");
const client = new Function(src + "\nreturn {render, vai: s => { S = s; render(); }};")();

// per ogni fase, un pezzo di testo che la schermata deve avere
const ATTESO = {
  landing: ["INIZIA LA CORSA", "miglior punteggio", "record infinito"], campioni: ["SCEGLI IL TUO CAMPIONE", "SCEGLI "], bracket: ["COMBATTI", "VS"],
  sparring: ["COMBATTI", "SPARRING"], bottino: ["Salta", "carta"], porte: ["Scegli una porta"], mercato: ["Esci dal mercato", "Medikit"],
  allenamento: ["Su cosa lavori"], evento: ["INCONTRO"], vittoria: ["CAMPIONE", "TOTALE"], eliminato: ["TOTALE"], duello: ["duello"],
};
const viste = new Set();
for (const s of stati) {
  const fase = s.attivo ? s.fase : "landing";
  client.vai(s);
  const h = out.innerHTML;
  ok(h.length > 150, `${fase}: la schermata e' vuota`);
  ok(!/undefined|NaN|\[object/.test(h), `${fase}: valori mancanti nella schermata (${(h.match(/.{30}(undefined|NaN|\[object).{30}/) || [""])[0]})`);
  for (const t of ATTESO[fase] || []) ok(h.includes(t), `${fase}: manca "${t}"`);
  viste.add(fase);
}
for (const f of ["landing", "campioni", "bracket", "bottino", "porte", "vittoria", "eliminato"])
  ok(viste.has(f), `nessuno stato di prova per la fase ${f}`);

// la modalita' infinita: l'offerta dopo il titolo, lo sfidante (e il boss) e il ritiro durante, il riepilogo alla fine
const inf = {offerta: 0, scontro: 0, boss: 0, porte: 0, fine: 0};
for (const s of stati) {
  if (!s.attivo) continue;
  client.vai(s);
  const h = out.innerHTML, attiva = s.infinito && s.infinito.attivo;
  if (s.fase === "eliminato") ok(h.includes("ELIMINATO") || h.includes("RITIRATO"), "eliminato: manca il titolo della schermata");
  if (s.fase === "vittoria" && s.puo_infinito) { inf.offerta++; ok(h.includes("CONTINUA ALL'INFINITO") && h.includes("facoltativa"), "vittoria: manca l'offerta dell'infinito"); }
  if (s.fase === "bracket" && attiva) {
    inf.scontro++;
    ok(h.includes("INFINITO") && h.includes("Ritirati") && (h.includes("LO SFIDANTE") || h.includes("IL BOSS")) && !h.includes("Il tabellone") && h.includes("hp (testa e busto)"), "scontro dell'infinito: manca qualcosa");
    if (s.infinito.boss) { inf.boss++; ok(h.includes("BOSS"), "il boss non si vede"); }
  }
  if (s.fase === "porte" && attiva) { inf.porte++; ok(h.includes("LIVELLO") && h.includes("Ritirati") && !h.includes("Il tabellone"), "porte dell'infinito"); }
  if (s.fase === "eliminato" && s.riepilogo && s.riepilogo.infinito != null) { inf.fine++; ok(h.includes("modalità infinita") && h.includes("RITIRATO"), "fine dell'infinito"); }
}
ok(inf.offerta && inf.scontro && inf.boss && inf.porte && inf.fine, "stati di prova dell'infinito mancanti: " + JSON.stringify(inf));

// i nomi vengono dal server: mai HTML crudo
const base = stati.find(s => s.attivo && s.fase === "bracket");
const cattivo = JSON.parse(JSON.stringify(base));
cattivo.eroe.nome = "<img src=x onerror=alert(1)>";
cattivo.avversario.nome = "\"><script>alert(2)</script>";
client.vai(cattivo);
ok(!out.innerHTML.includes("<img src=x") && !out.innerHTML.includes("<script>"), "i nomi non sono sfuggiti");
ok(out.innerHTML.includes("&lt;img"), "il nome sfuggito si legge");

console.log(`OK - ${n} check passati (${viste.size} schermate)`);
