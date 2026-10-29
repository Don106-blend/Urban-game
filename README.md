# Urban

Gioco di combattimento a duelli (Arena con box, contratti, negozio, scommesse e sponsor; Torneo Evo a 16 eroi con draft).
Server Flask + editor dei dati in Tkinter. Nessuna dipendenza oltre a Flask.

## Come si usa

| Cosa | Comando |
|---|---|
| Gioco (http://127.0.0.1:5000) | `python app.py` oppure `avvia_app.bat` |
| Editor di attacchi, poteri, stance, effetti, oggetti | `python editor.py` oppure `avvia_editor.bat` |
| Test delle regole | `python test_combat.py` e `python test_editor.py` |
| Misure di bilanciamento | `python balance.py tutto` (v. sotto) |

I salvataggi stanno in `save/` (personaggi, crediti, feedback, profilo della CPU). Test e harness usano **sempre** una cartella
temporanea (`URBAN_SAVE_DIR`) e non li toccano mai. Per provare l'app su una copia del salvataggio:
`URBAN_SAVE_DIR=percorso/della/copia python app.py`.

## Regole di base (valori di `engine.py`)

- Tiro: `d10 + bonus di rango` con ranghi 1-4 = bonus 0/1/2/3. Colpisce chi *supera* il difensore (il pareggio va a chi si difende).
- Ogni turno: **3 azioni**, 1 azione bonus, e **1 sola risposta per round** (nessuna risposta = riflessi, parata, schivata).
  Il difensore vede il tiro d'attacco prima di scegliere. La parata dimezza il danno e sposta il colpo dove vuole il difensore.
- Il kit base è Pugno (1 azione) + Colpo pesante (2 azioni, non parabile). Mirare costa 1 azione e dà +1 al tiro del difensore.
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
python balance.py tutto
```

Opzioni: `--n` (duelli per cella), `--seed`, `--jobs`. Per prove "what-if" senza toccare i file:
`--set "MIRA_PENALITA=2;DANNO_ATT={\"51\":80}||PY||pw('Pelle Invincibile')['effetti']['3'][0]['flat']=40"`
(costanti di `engine`/`app`, campi degli attacchi e un frammento Python sui cataloghi in memoria).

## Struttura

`engine.py` regole e `Personaggio` · `app.py` server, duello web, torneo, IA, economia · `balance.py` harness ·
`editor.py` editor dati · `static/`, `templates/` interfaccia.

Il vecchio simulatore Tkinter (`combat.py`) è stato eliminato: era una seconda implementazione con le regole di prima dell'overhaul. Per simulare duelli c'è `balance.py`, che pilota il vero `DuelloWeb`.

## Schermata del duello
Il centro del duello ha due zone. In alto l'**arena**: i due combattenti sono ragdoll fisici (corpi rigidi, giunti con muscoli PD, attrito, passi per rientrare in guardia), disegnati su canvas a posizione reale e interpolata; un colpo li fa scivolare in proporzione al danno, la testa scatta, il sangue sporca la locazione colpita e, quando una locazione va in negativo, la pelle si strappa a macchie (maschera alpha) e sotto compaiono la carne e lo scheletro con le viscere (`scheletro_*`/`carne_*`, STILE_SPRITE.md sez. 11), un arto storpio penzola, due gambe storpie costringono in ginocchio, da morti si cade e si resta fermi. Chi attacca carica e colpisce (pugno, fendente, affondo; a distanza parte un proiettile), chi difende schiva (indietro, abbassandosi, saltando) o para, in coda uno scambio alla volta, con hit-stop e scossa dello schermo. In basso la **scena dei tiri**: l'ultimo scambio come scheda (chi attacca, con cosa, descrizione e sigle delle regole, i due tiri a confronto, l'esito e il calcolo del danno fino agli HP persi); il vecchio log testuale resta nello "Storico testuale" chiuso. Poteri, augment e stance hanno la descrizione nei menu. Il server prepara gli scambi in `DuelloWeb.eventi` (campo `eventi` dello stato) e la descrizione di un attacco in `info_attacco()`.

Fisica: `static/fisica.js` (motore a corpi rigidi), `static/pupazzo.js` (il combattente), `static/arena.js` (disegno e scambi); i test si lanciano con `node test_fisica.js`, il banco di prova nel browser e' `tools/lab/arena.html`. Il dettaglio e' in `STILE_SPRITE.md`, sez. 10.

Torneo Evo: a fine round tutti i danni vengono curati (anche gli arti CRIPPLED) e la stamina torna piena. Dopo ogni round anche le CPU vincitrici crescono come il giocatore: +1 Controllo, un potere, un upgrade di statistica e un oggetto di equipaggiamento (sempre, scelti tra le stesse offerte; `upgrade_torneo` e `avversario_upgrade` nello stato dicono cosa hanno preso).

**Aspetto.** Ogni personaggio (box, contratti, avversari, eroi del torneo) ha la sua capigliatura (16, con tag M/F), la sua maglia (canottiera, t-shirt, maniche lunghe) e i suoi pantaloni (corti, tre quarti, lunghi), con colori presi da due texture a gradiente a partire da un seed; nessuna combinazione si ripete (`aspetto.py`, STILE_SPRITE.md sez. 13). I vestiti stanno sopra le ferite e si strappano con i danni: a 15% degli hp di una locazione l'indumento di quella parte non c'è più.

**Tattiche (la CPU impara da te).** Il gioco registra ogni incontro (duelli del box e torneo) e le tue scelte: mira, attacco, poteri, stance, fine turno e come rispondi ai colpi, con le *occasioni* in cui potevi farlo (`tattiche.py`, file `save/incontri.jsonl`, una riga per incontro). Da lì la CPU impara: imita le tue frequenze (quanto mira, quanto accende poteri e stance, quanto sceglie l'attacco migliore), contrasta la tua difesa preferita (attacchi non schivabili contro chi schiva, a distanza o non parabili contro chi para), copia dove mira e come risponde, tranne sui colpi letali. Gli incontri vinti pesano più dei persi, contano gli ultimi 150, e servono almeno 3 incontri: prima la CPU si comporta come sempre. `GET /api/tattiche` mostra cosa ha imparato; il harness `balance.py` e i test non registrano nulla.
