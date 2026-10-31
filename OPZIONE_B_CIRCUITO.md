# Urban — Opzione B: Il Circuito (brief di implementazione)

> **Cos'è.** Brief per fare, in una sessione futura e a parte, la seconda direzione di gameplay scelta con il giocatore: *il Circuito*. È pensato per essere
> dato a un agente (Claude Code) come prompt principale, nello stile di `OVERHAUL_GAMEPLAY.md`. Contiene la fantasia, i sistemi con valori di partenza, i **ganci già lasciati
> nel codice** dalla Palestra (con i nomi veri), il formato proposto dello stato, le schermate, le fasi con i criteri di accettazione e i rischi.
> **Presuppone la Palestra (Opzione A) già fatta**: calendario, allenamento, tratti, eventi, magazzino, attrezzi, scena fisica (README, sezione "La Palestra").
> **Non tocca le regole del duello** (`engine.py`, `DuelloWeb`): tocca chi si incontra, cosa si rischia e cosa resta dopo. Tutto il resto del gioco resta com'è.
> Una copia leggibile di questo brief esiste anche come documento Claude ("Urban — Opzione B: Il Circuito").

## 1. La fantasia e la missione

Il giocatore non vince duelli: **conquista una città**. La lotta clandestina è un mondo di crew, distretti e rivali con un nome e una memoria; ogni combattimento sposta
qualcosa su una mappa che continua a muoversi anche quando non guardi. Oggi l'avversario è uno **specchio senza nome** della tua build (`cpu_bilanciata` → `eroe_speculare`):
vincere non è mai una conquista e non esiste uno sfidante più forte o più debole da scegliere. La missione è sostituire lo specchio con persone.

Una scena che il giocatore dovrebbe poter raccontare: *«Ho ucciso Brando, il numero tre delle Fonderie. Due duelli dopo la sua crew ha messo una taglia sulla mia lottatrice, e il
capo ha comprato un dossier su di me: "mira alla testa sei volte su dieci". È vero: lo dicono i miei stessi incontri registrati.»* (Nomi di esempio.)

**Regole di lavoro** (le stesse dell'overhaul): (1) lavora **per fasi** (§7), una fase = un blocco coerente, e non iniziare la successiva finché la precedente non rispetta i suoi criteri;
(2) **misura**: i valori di questo file sono di partenza, il harness decide quelli finali; (3) il cambiamento più piccolo che sposta la metrica vince (dati JSON e costanti prima, poi poche righe,
poi sistemi nuovi); le scorciatoie voluta si segnano con `# ponytail:`; (4) **non toccare `save/`** (test, harness e demo usano una cartella temporanea, `URBAN_SAVE_DIR`); non fare commit
né push se non richiesto; (5) il combattimento non cambia: `python test_combat.py`, `node test_fisica.js`, `python test_palestra.py` devono restare verdi.

## 2. Cosa c'è già (i ganci)

| Gancio | Dove | Cosa fa oggi | Come lo usa il Circuito |
|---|---|---|---|
| `stato["mondo"]` | `palestra.stato_palestra()` | un dict vuoto riservato nel salvataggio | lo stato del circuito (formato in §5) |
| `palestra.GANCI_GIORNO`, `GANCI_SETTIMANA` | `palestra.py` | liste vuote di funzioni `f(stato, db, rng, riepilogo)` chiamate a fine di ogni giorno / settimana | il **turno del mondo** (le crew si scontrano, crescono, qualcuno muore) |
| `app.genera_avversario(record, pg)` | `app.py` | ritorna `cpu_bilanciata(pg, bias)`: lo specchio | pesca lo **sfidante scelto** dal mondo; `DuelloWeb(record, avversario=...)` lo accetta già |
| `DuelloWeb(posta=...)`, `app.POSTA_BASE` | `app.py` | `{"nome", "paga", "morte"}`; `chiudi_duello` paga `d.posta["paga"]` e moltiplica la probabilità di morte per `d.posta["morte"]` | la **posta dei locali** (§4.2) |
| `origine`, `nemici`, `registro` sul combattente | `palestra.completa_record` | `origine` = id del distretto (dal quartiere della bio, `data/anagrafica.json`), `nemici` = `[]`, `registro` = righe `{g, t, tipo?, esito?, avv?}` | provenienza, vendette, memoria |
| `palestra.dopo_duello(stato, rec, vittoria, avversario, danni)` | `palestra.py` | fiducia, stress e una riga tipizzata nel registro (`tipo="duello"`, `esito`, `avv`) | registra *chi* è l'avversario (id NPC) e le vendette |
| `app.nuovo_aspirante()`, `genera_contratti()`, `aggiungi_aspirante()` | `app.py` | la fonte unica degli aspiranti (3 a settimana + passaparola a pagamento) | nuove **fonti** di reclutamento: stesso formato di record |
| `data/eventi_palestra.json`, `palestra._crea_evento`, `_applica` | `palestra.py` | eventi data-driven con un mini-linguaggio di effetti | eventi di crew, di vendetta, di territorio (nuovi requisiti di ruolo) |
| `GET /api/tattiche` (`tattiche.Modello.sommario()`) | `app.py`, `tattiche.py` | cosa ha imparato la CPU dal giocatore (mira, poteri, stance, difese preferite) | il **Dossier** "cosa sanno di te" |
| `TorneoEvo._vince_cpu`, `_evolvi_cpu`, `eroe_livello`, `engine.valuta` | `app.py`, `engine.py` | scontro CPU-contro-CPU (logistica sulla differenza di `valuta`), crescita di un eroe a ogni turno | il motore del **mondo vivo**, già scritto e provato |
| `data/anagrafica.json: quartieri` | dati | 6 quartieri con `id`, `nome`, `di` | i **distretti**: porto, fonderie, scalo, periferia, centro, sotterranei |
| `templates/sandbox.html` | template | segnaposto "il mondo aperto, sulla mappa reale" | la **Mappa** |
| `data/attrezzi.json`, `palestra.deposita/riprendi` (magazzino) | `palestra.py` | attrezzi della palestra e magazzino degli oggetti | pezzi rubati o recuperati in un territorio |

## 3. Cosa il Circuito cambia (e cosa no)

Cambia: **Duelli** (la serata) diventa **Sfide** (si sceglie lo sfidante dal distretto); **Aspiranti** ha altre fonti oltre al passaparola; **Sandbox** diventa **Mappa**; il **Torneo Evo**
resta una modalità a parte (non entra nel circuito: lo ha deciso il giocatore); la Palestra resta la base.
Non cambia: le regole del duello, il bilanciamento dei poteri, l'allenamento, i tratti, il calendario (un giorno = un giorno; il mondo fa un turno per giorno di gioco, non per click).

## 4. I sistemi (valori di partenza, da tarare con il harness)

### 4.1 Distretti e crew
La città ha 5-6 distretti (`quartieri` in `data/anagrafica.json`, i nomi vanno poi allineati alla mappa reale della Sandbox). Ognuno ha: un **livello d'ingresso** (1, 3, 5, 8, 12), una **crew** di
6 combattenti con nome (uno è il campione), un **tipo di locale** (§4.2) e una rendita se lo controlli. Le crew hanno un nome e un'identità (`stile`: chi mira, chi usa poteri…, dai dati dei
membri) ma nessuna regola nuova di combattimento.

### 4.2 Locali e posta
La differenza sta tutta dopo il duello, in `chiudi_duello` (via `posta`), non nelle regole:

| Locale | Paga per vittoria | Probabilità di morte (moltiplicatore) |
|---|---|---|
| Palestra di quartiere | 60¤ | 0 (nessuna) |
| Ring con medico (come oggi) | 150¤ | ×0,5 |
| Il Pozzo | 300¤, sponsor doppi | ×1,5 (tetto 1) |

### 4.3 Sfide a scelta
Si sceglie lo sfidante dalla classifica del distretto: livello, record, ferite recenti e **le quote del bookmaker** (`K_VALUTA`, `K_HP`: già calcolate) come stima di quanto è dura. Gli sfidanti
stanno a −1/+1 livelli dalla fascia del giocatore, il campione a +2, e si sfida il campione solo dopo aver battuto tre della sua crew. Lo **specchio** (`cpu_bilanciata`) resta per il Torneo Evo e per il
harness: non si elimina.

### 4.4 Il mondo vivo
A ogni giorno di gioco (`GANCI_GIORNO`) il mondo fa un turno: 3 scontri CPU-contro-CPU tra membri di crew (`_vince_cpu`), un'evoluzione ogni 2 turni ai vincitori (`_evolvi_cpu` portata sul record
persistente), qualcuno muore (stesso rischio dei locali), qualcuno cambia crew, arrivano facce nuove (`eroe_livello`). Serve una **regola di ricambio** perché le crew non si svuotino né si gonfino
(mantenere 6 per crew: i morti si rimpiazzano dopo 7 giorni con un nuovo di livello vicino alla media della crew).

### 4.5 Memoria, taglie e vendetta
Ogni persona ricorda chi l'ha battuta e chi l'ha storpiata (`nemici` sul record NPC e sul combattente). Uccidere o storpiare un membro mette una **taglia** della sua crew: paga +50% a chi sfida e batte
il tuo combattente (scade dopo 28 giorni). Battere due volte lo stesso rivale lo rende **reclutabile**.

### 4.6 Il Dossier
La schermata "Cosa sanno di te" mostra in fiction ciò che `tattiche.py` ha già imparato (quanto mira, che difesa preferisci, dove colpisci). Le crew ti studiano davvero, perché è la CPU a imparare
(`GET /api/tattiche`). Nessun codice di apprendimento nuovo: è una vista.

### 4.7 Reclutamento dal mondo
Il listino casuale non sparisce, ma ha altre **tre fonti finite**: *scouting* (mandi qualcuno in un distretto per N giorni e scopri 3 liberi con una storia), *rivali sconfitti* (statistiche e
oggetti intatti, cari: `costo_contratto` +50%, lealtà bassa → fiducia di partenza 25), *crew sciolte* (quando prendi un distretto i superstiti vanno sul mercato). Tutto in formato di record
(`nuovo_aspirante` è il modello).

### 4.8 Titoli e territori
Battere il campione ti dà il distretto: una rendita (40¤ al giorno di gioco), un canale di reclutamento e uno sponsor locale. Il Torneo Evo **non** diventa il finale del circuito (resta a parte).
Un titolo si perde se il campione di un'altra crew ti batte in una sfida di rivincita.

## 5. Stato e dati (proposta)

Tutto sotto `STATO["mondo"]`; nessun altro campo del salvataggio cambia. I combattenti NPC hanno **lo stesso formato dei record della palestra** (così `record_to_pg(rec)` e `DuelloWeb` funzionano senza
casi speciali), più qualche campo.

```json
"mondo": {
  "versione": 1,
  "turno": 0,
  "distretti": {"porto": {"nome": "il Porto", "livello": 1, "locale": "palestra_quartiere", "crew": "c_porto",
                           "controllo": null, "rendita": 40}},
  "crew": {"c_porto": {"nome": "I Ganci del Porto", "distretto": "porto", "capo": "n1", "membri": ["n1", "n2"], "ostilita": 0}},
  "npc": {"n1": {"record": {"...": "formato STATO['personaggi']"}, "crew": "c_porto", "stato": "attivo",
                  "vittorie": 3, "sconfitte": 1, "nemici": ["p3"]}},
  "taglie": [{"su": 3, "da": "c_porto", "bonus_pct": 50, "scade": 120}]
}
```

Funzioni nuove, tutte pure e testabili come `palestra.py` (un modulo nuovo, `circuito.py`, senza Flask): `crea_mondo(stato, rng)`, `turno_mondo(stato, db, rng)` (registrata in `GANCI_GIORNO`),
`sfidanti(stato, rec)`, `avversario_da_sfida(stato, rec, npc_id)` (ritorna un `Personaggio` per `DuelloWeb`), `dopo_sfida(stato, rec, npc_id, vittoria, ucciso, storpiato)`, `dossier(stato)`,
`fonti_reclutamento(stato)`. Compatibilità con i salvataggi: `stato["mondo"] == {}` significa "il circuito non è ancora stato avviato" (la Palestra funziona come oggi con lo specchio); `crea_mondo`
parte alla prima visita della Mappa.

## 6. Schermate

- **Sandbox → Mappa**: all'inizio un grafo di 5-6 nodi (i distretti) con chi comanda, la rendita e le sfide aperte; la mappa reale dopo. Un nodo apre la classifica del distretto.
- **Duelli → Sfide**: la lista degli sfidanti del distretto con livello, record, ferite recenti, quote e posta del locale; sceglie chi manda dalla Palestra (come oggi) e chi sfida.
- **Aspiranti → Mercato dei liberi**: i tre canali (§4.7) accanto al listino settimanale.
- **Palestra**: una bacheca dei rivali che ti cercano (taglie, rivincite) tra gli eventi; il **Dossier** come pagina collegata.
- **Scheda del personaggio**: nemici e debiti d'onore.

## 7. Fasi, criteri di accettazione, misure

| Fase | Cosa | Si è finito quando |
|---|---|---|
| 1 | `circuito.py`: stato, **un** distretto con una crew di 6 nominati, classifica, sfida a scelta (Duelli → Sfide) | `test_circuito.py` verde: gli NPC sono record validi e persistono nel salvataggio; `record_to_pg(npc)` e `DuelloWeb(rec, avversario=...)` funzionano; la Palestra senza mondo gira come prima |
| 2 | Memoria, taglie, rivincite, Dossier | uccidere/storpiare crea una taglia; il Dossier mostra le frequenze di `/api/tattiche`; `registro` ha righe tipizzate con l'id dell'avversario |
| 3 | Reclutamento dal mondo | tre canali finiti, nessun rinnovo gratuito infinito; il prezzo e la fiducia di partenza dei rivali sono quelli del §4.7 |
| 4 | Mondo vivo (`GANCI_GIORNO`), 5-6 distretti, locali con la posta, titoli e territori | 1000 giorni di mondo senza eccezioni, crew sempre a 6 membri, nessun duello infinito; la rendita entra a ogni giorno |

**Misure da aggiungere al harness (`balance.py`)** — l'obiettivo è che scegliere lo sfidante non rompa l'equità che oggi garantisce lo specchio (M9: un eroe L5 senza equip vince 42-50% contro la CPU di pari livello):
**M11** vittoria di un eroe a pari livello contro NPC della fascia −1 / 0 / +1: 62-72% / 42-52% / 28-38%; **M12** le quote del bookmaker sugli sfidanti sono calibrate (P stimata vs. frequenza reale, errore < 4 punti);
**M13** il mondo a 1000 turni: nessuna crew sotto 4 o sopra 8 membri, livello medio delle crew dentro la fascia del distretto ±2.

## 8. Rischi e decisioni ancora aperte

- **Equità.** Lo specchio garantisce partite pari; uno sfidante scelto può essere impari. Si attenua con le fasce di livello, le quote e la misura M11; mai alzando il livello del campione senza misurare.
- **Un mondo che va avanti da solo** ha bisogno della regola di ricambio (§4.4), altrimenti le crew si svuotano o si gonfiano.
- **Costo.** Grande, soprattutto di stato (circa 36 record persistenti, ognuno con il suo aspetto: `aspetto.genera` già evita le ripetizioni). Poco da disegnare, molto da bilanciare.
- **Aperte.** Quanto è cattivo il mondo (taglie, morti degli NPC)? Il giocatore può essere sconfitto *come crew* (perdere un distretto)? La mappa reale della Sandbox quando? Il Torneo Evo resta a parte (deciso).
- **Da non fare.** Non cambiare le regole del duello per "dare carattere" alle crew; non togliere `cpu_bilanciata` (serve al Torneo e al harness); non scrivere in `save/` dai test.
