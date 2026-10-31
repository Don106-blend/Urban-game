# Urban

Gioco di combattimento a duelli in cui si e' l'**allenatore**: una palestra clandestina con un calendario, aspiranti da ingaggiare,
allenamenti, carattere, eventi, ring con il Banco (puntate, folla, azzardi). A parte, il Torneo Evo (16 eroi con draft, senza premi).
Server Flask + editor dei dati in Tkinter. Nessuna dipendenza oltre a Flask.

## Come si usa

| Cosa | Comando |
|---|---|
| Gioco (http://127.0.0.1:5000) | `python app.py` oppure `avvia_app.bat` |
| Editor di attacchi, poteri, stance, effetti, oggetti | `python editor.py` oppure `avvia_editor.bat` |
| Test delle regole | `python test_combat.py`, `python test_azzardo.py`, `python test_palestra.py`, `python test_editor.py`, `node test_fisica.js` |
| Misure di bilanciamento | `python balance.py tutto` (v. sotto) |
| Una palestra di prova nel browser (cartella temporanea) | `python tools/demo_palestra.py` (`--scenario base|vuota`), porta 5057 |
| I ritmi della palestra (punti, ferite, stress, fiducia) | `python tools/sim_palestra.py --settimane 60 --allievi 3 --duelli 4` |

I salvataggi stanno in `save/` (la partita, il profilo della CPU, i survey, gli incontri registrati per le tattiche). Una partita
nuova: la pagina Debug ("Partita nuova"), o cancellare `save/state.json`. Test e harness usano **sempre** una cartella
temporanea (`URBAN_SAVE_DIR`) e non li toccano mai. Per provare l'app su una copia del salvataggio:
`URBAN_SAVE_DIR=percorso/della/copia python app.py`.

## Regole di base (valori di `engine.py`)

- Tiro: `d10 + bonus di rango` con ranghi 1-4 = bonus 0/1/2/3. Colpisce chi *supera* il difensore (il pareggio va a chi si difende).
- Ogni turno: **3 azioni**, 1 azione bonus, e **1 sola risposta per round** (nessuna risposta = riflessi, parata, schivata).
  Il difensore vede il tiro d'attacco prima di scegliere. La parata dimezza il danno e sposta il colpo dove vuole il difensore.
- Il kit base è Pugno (1 azione) + Colpo pesante (2 azioni, **non si schiva, non si para e non si mira**: contro di lui restano solo i riflessi, perché la
  schivata riesce sempre e a 70 danni il pesante che si schiva valeva il 22-26% contro tre Pugni, qualunque fosse il danno; v. `tools/fase3_dati.py`).
  Mirare costa 1 azione e dà +1 al tiro del difensore.
- Un potere spento **non si può riaccendere nello stesso turno** (spegnere e riaccendere rinnovava armatura e cure per un'azione): `Personaggio.puo_attivare_potere`,
  flag `spento_ora` dello slot, azzerato da `tick_turno`. Vale anche per gli augment Attivi.
- Locazioni: testa 80, busto 120, quattro arti da 100. Si perde con testa o busto a 0. Un colpo non mirato prende il busto il doppio
  delle volte (la testa 1 su 7).
- Le resistenze sono percentuali (tetto 75%); l'armatura assorbe hp per locazione prima degli hp.
- I poteri sbloccano attacchi, stance ed effetti per rango; costano stamina a ogni turno.

## Dati (`data/*.json`) e strumenti

I contenuti sono JSON modificabili dall'editor. `tools/` contiene gli script **idempotenti** che hanno portato i dati dell'overhaul
alle fasce misurate: `fase1_dati.py`, `fase2_attacchi.py` (la tabella degli slot di danno, con motivazione di ogni attacco fuori
fascia; senza `--applica` stampa solo il rapporto), `fase2_poteri.py`, `fase2_oggetti.py`, `fase3_dati.py`.

## Harness di bilanciamento (`balance.py`)

Fa giocare il vero `DuelloWeb` a due IA e stampa le metriche di `OVERHAUL_GAMEPLAY.md` con la fascia di accettazione e PASS/FAIL.

```
python balance.py lunghezza     # durata dei duelli, decisi dalla testa, rimonte
python balance.py ladder         # peso del rango (vittoria con +1/+2/+3 ranghi)
python balance.py mira           # mira alla testa / al busto
python balance.py decisioni      # nessuna scelta del kit base è dominata
python balance.py equip          # ogni oggetto contro un eroe nudo
python balance.py poteri         # round-robin dei 20 poteri (--rango 1..4, --solo "Nome", --matrice)
python balance.py matchmaking    # eroe senza equip contro la CPU di pari livello
python balance.py torneo         # tornei Evo interi con draft a caso
python balance.py fuzz           # 100.000 duelli casuali: nessuna eccezione, nessun duello infinito
python balance.py azzardo        # il Banco: azzardi, folla, quote, clausole (v. AZZARDO.md)
python balance.py tutto
```

Opzioni: `--n` (duelli per cella), `--seed`, `--jobs`. Per prove "what-if" senza toccare i file:
`--set "MIRA_PENALITA=2;DANNO_ATT={\"51\":80}||PY||pw('Pelle Invincibile')['effetti']['3'][0]['flat']=40"`
(costanti di `engine`/`app`, campi degli attacchi e un frammento Python sui cataloghi in memoria).

## Struttura

`engine.py` regole e `Personaggio` · `app.py` server, duello web, torneo, IA, economia · `palestra.py` la vita fuori dal ring
(calendario, allenamento, tratti, eventi: logica pura, senza Flask) · `azzardo.py` il Banco: puntate, folla e azzardi del ring (logica pura) · `nemesi.py` i rivali che tornano, la loro memoria e i soprannomi (logica pura) · `balance.py` harness · `editor.py` editor dati ·
`static/`, `templates/` interfaccia · `data/` contenuti (anche `tratti.json`, `eventi_palestra.json`, `attrezzi.json`, `anagrafica.json`, `soprannomi.json`).

Il vecchio simulatore Tkinter (`combat.py`) è stato eliminato: era una seconda implementazione con le regole di prima dell'overhaul. Per simulare duelli c'è `balance.py`, che pilota il vero `DuelloWeb`.

## Schermata del duello
Il centro del duello ha due zone. In alto l'**arena**: i due combattenti sono ragdoll fisici (corpi rigidi, giunti con muscoli PD, attrito, passi per rientrare in guardia), disegnati su canvas a posizione reale e interpolata; un colpo li fa scivolare in proporzione al danno, la testa scatta, il sangue sporca la locazione colpita e, quando una locazione va in negativo, la pelle si strappa a macchie (maschera alpha) e sotto compaiono la carne e lo scheletro con le viscere (`scheletro_*`/`carne_*`, STILE_SPRITE.md sez. 11), un arto storpio penzola, due gambe storpie costringono in ginocchio, da morti si cade e si resta fermi. Chi attacca carica e colpisce (pugno, fendente, affondo; a distanza parte un proiettile), chi difende schiva (indietro, abbassandosi, saltando) o para, in coda uno scambio alla volta, con hit-stop e scossa dello schermo. In basso la **scena dei tiri**: l'ultimo scambio come scheda (chi attacca, con cosa, descrizione e sigle delle regole, i due tiri a confronto, l'esito e il calcolo del danno fino agli HP persi); il vecchio log testuale resta nello "Storico testuale" chiuso. Poteri, augment e stance hanno la descrizione nei menu. Il server prepara gli scambi in `DuelloWeb.eventi` (campo `eventi` dello stato) e la descrizione di un attacco in `info_attacco()`.

Fisica: `static/fisica.js` (motore a corpi rigidi), `static/pupazzo.js` (il combattente), `static/arena.js` (disegno e scambi); i test si lanciano con `node test_fisica.js`, il banco di prova nel browser e' `tools/lab/arena.html`. Il dettaglio e' in `STILE_SPRITE.md`, sez. 10.

Torneo Evo (modalita' a parte: non tocca la palestra, non dà crediti e **non dà l'eroe**; puntate e clausole sono soltanto un punteggio): a fine round tutti i danni vengono curati (anche gli arti CRIPPLED) e la stamina torna piena. Dopo ogni round anche le CPU vincitrici crescono come il giocatore: +1 Controllo, un potere, un upgrade di statistica e un oggetto di equipaggiamento (sempre, scelti tra le stesse offerte; `upgrade_torneo` e `avversario_upgrade` nello stato dicono cosa hanno preso).

**Aspetto.** Ogni personaggio (box, contratti, avversari, eroi del torneo) ha la sua capigliatura (16, con tag M/F), la sua maglia (canottiera, t-shirt, maniche lunghe) e i suoi pantaloni (corti, tre quarti, lunghi), con colori presi da due texture a gradiente a partire da un seed; nessuna combinazione si ripete (`aspetto.py`, STILE_SPRITE.md sez. 13). I vestiti stanno sopra le ferite e si strappano con i danni: a 15% degli hp di una locazione l'indumento di quella parte non c'è più.

**Ferite e poteri visibili.** Le ferite hanno la texture del danno subito, sovrapponibili: fuoco = nero, acido = si diffonde in tre secondi, elettrico = cicatrice da fulmine ramificata. Il potere Ali mostra le ali (che battono in volo), 2x2 aggiunge braccia extra, la stance Volo fa fluttuare il combattente; spenti, spariscono. Se le ali vengono distrutte (locazione a 0 hp) il potere si spegne **e le ali spariscono con lui**: dal turno dopo si può riaccendere, con le ali nuove a hp pieni. I vestiti sono 33 maglie (10 in stile cyberpunk) e 23 pantaloni, e il 40% dei personaggi porta un copricapo (5 cappelli, 10 maschere, 5 cyberpunk) (STILE_SPRITE.md sez. 13 e 14). A duello finito il vincitore esulta: braccia al cielo e saltelli, oppure (solo sotto meta' degli hp totali, a sorte) un braccio solo al cielo e la testa china.

**Tattiche (la CPU impara da te).** Il gioco registra ogni incontro (duelli del box e torneo) e le tue scelte: mira, attacco, poteri, stance, fine turno e come rispondi ai colpi, con le *occasioni* in cui potevi farlo (`tattiche.py`, file `save/incontri.jsonl`, una riga per incontro). Da lì la CPU impara: imita le tue frequenze (quanto mira, quanto accende poteri e stance, quanto sceglie l'attacco migliore), contrasta la tua difesa preferita (attacchi non schivabili contro chi schiva, a distanza o non parabili contro chi para), copia dove mira e come risponde, tranne sui colpi letali. Gli incontri vinti pesano più dei persi, contano gli ultimi 150, e servono almeno 3 incontri: prima la CPU si comporta come sempre. `GET /api/tattiche` mostra cosa ha imparato; il harness `balance.py` e i test non registrano nulla.

## Il Banco (il gambling dell'arena)

Nei duelli della palestra e nel Torneo Evo il ring ha un banco, una folla e tre azzardi (progetto e misure in `AZZARDO.md`, logica in `azzardo.py`,
prova con `python test_azzardo.py` e `python balance.py azzardo`). E' tutto opt-in: se nessuno azzarda il duello e' quello di sempre.

- **Puntate.** Fino a 4 sul proprio allievo, a quota viva `0,9 / p` (a 50% paga 1,8x: la casa trattiene il 10%), anche tutto il portafoglio; il tetto si
  stringe quando l'esito e' quasi scritto. Si puo' **incassare** prima della fine (puntata x quota x p, meno il 10%). Le **clausole** (Lampo, Stoico,
  Incassatore) sono scommesse speciali con una posta, firmabili nel round 1. Non si punta contro il proprio allievo. Nel Torneo le
  puntate sono punti virtuali (500 al massimo), mai crediti. La finestra del Banco (`dialog.pal-dlg`) si apre dalla striscia nella scheda del giocatore.
- **La folla.** Un tifo da −100 a +100 che segue chi batte le quote (un colpo improbabile a segno lo sposta, sbagliare l'ovvio lo fa fischiare), a media
  zero: premia la fortuna, non la forza. Sposta il dado degli azzardi (±1/2/3 pip) e a ±65 scatta l'**Ovazione** (+1 a colpire e ai riflessi per 2 turni, a
  chi la folla ama). Si vede nella barra in testata e nelle sagome in alto nell'arena, che tifano o siedono mogie.
- **Gli azzardi** (azione bonus, uno per turno, per **tutti e due** i combattenti): la **Ruota della Folla** (`d10 + dado della folla`: da sfiga nera a jackpot;
  a pari la casa vince), il **Rilancio** / **Tutto o niente** (il prossimo colpo ×1,4 / ×2,5, senza uccidere da solo; se manca si perde la risposta, si resta
  Esposto e, a Tutto o niente, anche azioni e un muscolo) e l'**Ultima Puntata** (una volta, con testa o busto sotto il 30%: 40% di rialzarsi, altrimenti si crolla
  e per un allievo della palestra scatta il tiro di morte). Li gioca anche la CPU, con la manopola `azzardo` del suo profilo (tarata dal questionario).
- **La serie.** Ogni azzardo riuscito alza di +20% il pagamento delle puntate aperte (fino a +100%); il primo che va male la spezza.

## I rivali (il Nemesis system)

Gli avversari non sono più generati a caso a ogni duello: sono persone che restano nel mondo, ricordano chi le ha battute e crescono (progetto e misure
in `NEMESI.md`, logica in `nemesi.py`, prova con `python test_nemesi.py`).

- **Chi si incontra.** La prima volta un rivale nasce dal matchmaking di sempre (lo "specchio" dell'allievo); poi, con un rivale adatto in giro (entro 2 livelli),
  il 60% delle volte è lui a tornare, pesato da chi ha un conto in sospeso. Al massimo 14 rivali in giro; chi ritorna è sempre nella fascia del matchmaking.
- **Si vede.** A inizio duello il riquadro **Rivale** (sotto la scheda della CPU), la riga nella scena e il log dicono se l'avversario è nuovo, se ti ha battuto
  («la tua nemesi»), se l'hai battuto, con il bilancio e la taglia.
- **Pesa.** Chi ha perso l'ultimo incontro (l'allievo *o* il rivale) parte con **Rivincita** (+1 a colpire e ai riflessi per 3 turni propri: misurato +6/+9 punti di
  vittoria tra pari); la folla parte dalla sua parte (tifo ±25); il Banco ne tiene conto nelle quote (primi 3 round); sul rivale pesa una **taglia** (+40¤ per ogni
  allievo che ha battuto, fino a +160¤); la vendetta compiuta dà fiducia e toglie stress all'allievo, la sconfitta con la stessa nemesi fa il contrario.
- **Il registro.** La pagina `/rivali` (menù «Rivali») elenca i rivali con livello, poteri, taglia e il bilancio con ciascuno dei tuoi allievi.
- **Crescono piano.** Dopo ogni incontro XP (100 se perdono, 450 se vincono), Token spesi come un allievo e un oggetto a ogni livello.
- **Soprannomi.** Dal livello 3 chiunque (allievi e rivali) ha diritto a un soprannome, preso dal pool dei suoi poteri (`data/soprannomi.json`: 14 per ognuno dei 20
  poteri + 30 generici). L'allievo lo cambia quando vuole dal menù «Soprannome» della scheda (`/personaggio/<id>`); compare come `Elena «Lama» Rossi` nella scheda,
  nei duelli e nel log. I nomi sono 167 + 134 cognomi.

## La Palestra (il gioco fuori dal ring)

Il giocatore e' un allenatore. Tutto e' logica pura in `palestra.py` sullo `stato` del salvataggio (si prova con `test_palestra.py`); le rotte
e il salvataggio stanno in `app.py`; la pagina e la scena in `templates/palestra.html`, `static/palestra.js`, `static/scena_palestra.js`.

- **Calendario.** Il tempo e' `stato["giorno"]` (0 = lunedi' del 7 gennaio 2030) e passa solo con "Fine giornata" / "Passa la settimana" (che si
  ferma a un evento o a domenica). Niente piu' tempo reale: la guarigione e' a giorni (20 hp per locazione al giorno, x1,75 se si riposa; in coma 10;
  Toughness e infermeria la accelerano). Ogni giorno ogni allievo fa UNA cosa: il suo **piano settimanale** (che si ripete), un duello, un ordine di riposo.
- **Sessioni.** Riposo, Palestra (Fisico/Riflessi), Studio (Mente/Tattica), Sparring (skill di combattimento; in coppia 2 punti a testa ma ci si fa male, da
  soli 0,5), Controllo (Controllo o un potere), Allenamento duro (2 punti su qualunque voce, molto stress), Lavoro di strada (soldi e Sociale, ma e' fuori).
  Il riposo automatico sostituisce le sessioni rischiose a chi e' troppo malconcio (non ai Cocciuti); in coma si riposa e basta; dall'allenamento non si va mai sotto 1 hp.
- **Crescita.** Salire di rango costa un Token (come prima) **e** richiede la maturazione della voce: 8/16/32 punti, che si guadagnano allenandosi
  (`PUNTI_BASE`). Il Token e' il permesso, l'allenamento la capacita': la velocita' massima di crescita non cambia, quindi la CPU "specchio" e il harness restano validi.
- **Persone.** Ogni allievo ha due tratti (se ne vede uno, il secondo si scopre dopo una settimana o parlandoci), fiducia, stress, legami con gli altri, eta' e storia
  (`data/tratti.json`, `data/anagrafica.json`). Sotto fiducia 25 rifiuta il ring (non i Leali); a stress alto gli infortuni aumentano; il "colloquio" settimanale
  (incoraggia / rimprovera / ascolta) funziona se azzecchi cosa ama o odia. Con la scelta giusta c'è anche il 50% di far recuperare un punto di **Umanità** (`P_UMANITA`): non ne alza il massimo, ricarica solo quelli consumati dagli impianti installati. Dopo i 34 anni si impara piu' piano; a 38 si propone il ritiro (resta come istruttore,
  +0,5 punti a chi allena la sua voce); chi muore lascia l'equipaggiamento in magazzino, un lascito all'amico piu' vicino e un lutto da gestire.
- **Le serate.** Si possono chiudere al massimo **3 giornate di fila senza una serata sul ring**; poi la prossima giornata non si chiude finché non si gioca
  almeno un duello (che azzera il conto). Tre pallini lo mostrano nella testata della palestra e nella pagina Serata (`palestra.serate()`, `MAX_SALTI`); "Passa la settimana"
  si ferma al terzo salto. Se nessuno può combattere (feriti, in coma, sfiduciati) il giorno non conta come saltato.
- **Eventi.** Una scelta ogni tanto (`data/eventi_palestra.json`: 19 eventi, con un piccolo linguaggio di effetti); bloccano il tempo finche' non rispondi.
- **Attrezzi e posti.** `data/attrezzi.json`: pesi, specchio, lavagna, manichino, infermeria, dormitorio (+2 posti; la palestra parte con 4), camera di controllo.
  Cio' che si toglie a un combattente va nel **magazzino** (si rimonta gratis), non si butta piu'.
- **La pagina.** E' una schermata sola, senza liste da scorrere (da 981 px in su la pagina non scorre mai; sotto si impila): in alto la **barra di comando** (titolo e data, la settimana, allievi,
  serate saltate, Registro, Struttura, Settimana, Fine giornata), al centro la **scena**, in basso **una cartina per allievo** (ritratto, livello, che cosa fa oggi, salute / fiducia / stress).
  Tutto il resto si apre a comparsa: toccando una cartina (o l'allievo nella scena) si apre la **scheda** nel cassetto a destra (Profilo, Programma, Allenamento; ‹ › per passare all'allievo dopo),
  i **cambi** (sessione di un giorno, cosa si allena, riposo) sono **menu a comparsa** (popover) sul bottone che li chiama, gli **eventi** si aprono da soli in una finestra (finche' non rispondi il
  tempo non passa; con la X li ritrovi nella barra), il **rapporto** della giornata e' un cartellino sulla scena (le ferite, chi matura, i soldi) col resto nel **Registro**, **Struttura** mostra attrezzi,
  istruttori e caduti. La scena sceglie da sola la scala degli sprite (1-4x) in base allo spazio; se avanza altezza il soffitto si vede con le travi. Tutto in `static/palestra.js` (rendering e comandi) e
  `static/style.css` (blocco "la pagina della palestra"); la scheda completa (colloquio, rango, equipaggiamento) resta `/personaggio/<id>`.
- **La scena.** In cima alla pagina gli allievi fanno davvero quello che hanno in programma, con gli stessi corpi del ring (`Arena.kit`: aspetto, ferite, vestiti che si
  strappano): colpiscono un sacco che oscilla (un pendolo di `fisica.js`), fanno sparring, sollevano un bilanciere, saltano la corda (`Pupazzo.ciclo`), studiano alla lavagna,
  scaricano il potere, riposano (`Pupazzo.rilassa`). Gli sprite degli oggetti: `tools/sprites/palestra.px.js` (STILE_SPRITE.md sez. 15). Chi e' in coma non si vede
  (e' in infermeria); chi e' ferito mostra una **fasciatura** al posto del sangue e della pelle strappata (STILE_SPRITE.md sez. 16).
- **Una scheda che non si ricarica.** `static/nav.js` (in `base.html`) fa passare i link e i moduli per `fetch` e sostituisce solo il `<main>`: la palestra, con la sua scena e i
  suoi ~200 sprite, resta viva (parcheggiata, `[data-viva]`, `window.Vive.palestra.sospendi/riprendi`) mentre si guardano Aspiranti, Negozio, Serata o una scheda, e al ritorno
  riprende con lo stato di adesso. Il ring e il Torneo Evo (`<body data-nav="completa">`: hanno timer e script propri) si aprono con un caricamento vero, e da li' la palestra va ricaricata.
- **Ganci per l'Opzione B (`OPZIONE_B_CIRCUITO.md`).** `palestra.GANCI_GIORNO`/`GANCI_SETTIMANA`, `stato["mondo"]`, `origine`/`nemici`/`registro` sul combattente,
  `app.genera_avversario()` (chi si incontra), `POSTA_BASE` (paga e rischio di morte di un duello), `app.nuovo_aspirante()` (le fonti di reclutamento).
