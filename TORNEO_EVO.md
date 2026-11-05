# Torneo Evo — la corsa roguelike

Il Torneo Evo è una modalità a parte: non tocca la palestra, non dà crediti né l'eroe. Serve a **provare tanti poteri e impianti in una partita sola**, senza
passare dai livelli. Questo documento racconta come funziona dopo l'overhaul (prima era: 16 eroi, un potere nuovo e una statistica a ogni turno, e basta).
Logica in `evo.py` (senza Flask), dati in `data/mutazioni.json`, `data/regole_arena.json`, `data/eventi_evo.json`, client in `static/torneo.js`.

## L'idea

Una **corsa**: eliminazione diretta a 16 (Ottavi, Quarti, Semifinale, Finale). Non conta solo vincere: conta *come ci si arriva*. Tra un duello e l'altro si
costruisce il combattente con scelte che pesano (e che si possono sbagliare), la vita **non** si ricarica da sola, e c'è sempre una scelta rischiosa
(lo sparring d'élite, un evento, una maledizione) da pesare. A fine corsa un **punteggio**, un record e delle **ascensioni** che alzano la difficoltà.

## Il giro di una corsa

1. **Campioni.** Tre atleti tra i sedici (gli altri due restano nel tabellone). Ognuno ha un potere, una statistica forte e un *tratto di partenza* (una mutazione
   comune: tutti i sedici ne hanno una).
2. **Primo bottino.** Prima del primo duello l'eroe prende forma: tre carte di tipi diversi, se ne scelgono **due**.
3. **Tabellone.** Si vede l'avversario *prima* di combattere: statistiche, poteri con le mosse, impianti, mutazioni e **cosa ha raccolto** a ogni giro; la regola
   d'arena; un pronostico (forza di entrambi e vita rimasta).
4. **Duello.** Quello di sempre, con le mutazioni addosso, la regola d'arena e il Banco in **gettoni**.
5. **Bottino.** Si vince, e si pesca: tre carte, se ne sceglie una. Rilanciare costa 2, 3, 4… gettoni; saltare ne dà 2. Dopo i Quarti e la Semifinale una carta è
   sempre una mutazione rara o leggendaria.
6. **Porte.** Si scelgono una di tre (di cinque tipi): *Riposo* (vita al massimo, ferite guarite: sempre presente sotto il 55% di vita), *Mercato nero*,
   *Allenamento* (+1 a una statistica o a un rango, a scelta), *Sparring d'élite* (vedi sotto), *Incontro* (evento).
7. Si torna al tabellone, fino al titolo o all'eliminazione. Dopo il titolo, a scelta, la **modalità infinita** (v. sotto).

### Le carte del bottino
Un **potere nuovo** (rango = turno + 1, mai oltre il Controllo), il **rango di un potere** (mai oltre il Controllo, che sale di uno a ogni vittoria), una
**statistica**, un **impianto** (stessi vincoli della palestra: una protesi per locazione, Umanità finita) o una **mutazione**. Le tre carte sono sempre di tre
tipi diversi.

### La vita si porta dietro
Dopo ogni duello vinto torna il **45%** della vita *mancante* di ogni locazione (le protesi, tutta; le ferite gravi si rimarginano da sole). Il resto lo
fanno il Riposo, il medikit del Mercato, i medici clandestini. Con vita bassa si può scegliere la sicurezza (riposo) o il rischio (sparring).

### I gettoni 🪙
La moneta della corsa: Mercato, rilanci, eventi a pagamento e **puntate del Banco** (le stesse regole di sempre, ma si punta con i gettoni, quindi si
rischia qualcosa di vero). Si parte da 3. Ogni vittoria ne dà 4, +1 se si finisce con almeno il 70% di vita, +1 se si vince entro il round 5. Lo sparring
d'élite ne dà 5. I gettoni avanzati valgono 10 punti l'uno a fine corsa.

### Mutazioni
37 reliquie (`data/mutazioni.json`), in quattro rarità: **comune** (14), **rara** (12), **leggendaria** (7) e **maledetta** (4: danno un vantaggio grosso e un
prezzo). Ogni mutazione è una lista di `ops` (statistica, armatura, resistenza, azioni/risposte in più, effetto o stance permanente, hp massimi, stamina, un
attacco in più, moltiplicatori dei danni, vampirismo, ultima chance, o un effetto sulla corsa: gettoni a vittoria, recupero, sconto al mercato). Chi le ha le
vede nella scheda e nel duello. Il motore ha i ganci a zero per tutti: `stamina_extra`, `mult_danno`, `mult_subiti`, `vampiro`, `ultima_chance`, `no_mira`,
`no_schivata`, `valuta_extra`.

Il valore di ognuna è **misurato**: `python balance.py mutazioni` mette un eroe con la mutazione contro il suo gemello (stessa scheda, stessi dadi) e dice
quanta vittoria vale (comune 51–63%, rara 55–75%, leggendaria 65–82%, maledetta 54–72%). Misurandole se n'è buttata una rotta (la stance che divide i danni su tutto il corpo, tenuta sempre
accesa: 94% di vittoria) e quasi tutte le altre sono state ritoccate.

### Regole d'arena
Ogni duello ha la sua (`data/regole_arena.json`, con effetti su *entrambi* i combattenti): Ring regolare, Folla in delirio (+1 a colpire e riflessi), Ring in fiamme
(10 danni da fuoco a turno), Doppia azione (+1 azione), Nebbia fitta (nessuno mira), Pavimento viscido (nessuno schiva). La Finale e lo sparring non sono mai
su un ring regolare. Un chip nel duello la mostra, con la descrizione.

### Sparring d'élite
Una porta che si vede già dalla scelta: il tuo avversario, un'**élite** (più miglioramenti di un atleta del tabellone e una mutazione rara), la regola d'arena e il premio.
Si vince: **5 gettoni e un bottino di sole mutazioni rare o leggendarie**. Si perde: **perdi tutti i gettoni e resti a un quarto della vita, ma la corsa
continua** (lo sparring non elimina mai).

### Incontri (eventi)
Undici (`data/eventi_evo.json`), ognuno con 2–3 scelte e esiti probabilistici: il medico clandestino, il bookmaker, l'altare di ferro (sangue in cambio di una
mutazione rara o leggendaria), il collezionista (una maledizione e 5 gettoni), il vecchio campione, la rissa, la fontana strana, la cassa dimenticata, il
laboratorio abbandonato, il pozzo dei desideri, l'allenatore in disgrazia. Non uccidono mai (testa e busto non scendono sotto 1) e c'è sempre una scelta
gratuita. Non si ripetono finché ce ne sono di nuovi.

### Le CPU
Chi vince cresce come il giocatore: +1 Controllo, un miglioramento (nuovo potere 25%, rango 15%, statistica 60%), il migliore di tre impianti e, dal secondo
giro, il 35% di una mutazione comune. Si scontrano tra loro con la logistica della forza (`forza()`: statistiche, poteri, impianti e mutazioni, `K = 0,036`).

## Punteggio, record, ascensioni
Per ogni vittoria: 100; sparring vinto: 50; fino a 50 per la vita rimasta a fine duello; 25 (10) per un duello in ≤ 4 (7) round; 10 per gettone avanzato; per
ogni mutazione 5 / 15 / 40 / 25 (comune/rara/leggendaria/maledetta: chi sceglie una maledizione ci guadagna anche punti); 300 per il titolo. Il totale si
moltiplica per `1 + 0,25 × ascensione`. Il riepilogo di fine corsa mostra ogni voce. Record e ultime 12 corse sono in `save/evo.json` e restano.

| Ascensione | Cosa cambia | Titolo (bot a caso / bot furbo, misurato) |
|---|---|---|
| 0 Esordiente | niente | 11% / 23% |
| 1 Veterano | le CPU hanno un miglioramento in più a giro e spesso una mutazione in più | 6% / 14% |
| 2 Spietato | + recupero solo del 15% tra un duello e l'altro | 5% / 12% |
| 3 Squattrinato | + niente gettoni all'inizio, 2 in meno a vittoria, mercato +50%, CPU più mutate | 3,5% / 7% |
| 4 Leggenda | + la Finale è contro un campione d'élite | 0,2% / 2% |

Si sblocca la successiva vincendo il titolo alla più alta già sbloccata. «Bot a caso» sceglie tutto a caso; «bot furbo» sceglie per valore misurato (e **non**
prende poteri: vedi sotto). Entrambi giocano i duelli con la stessa IA delle CPU: un giocatore vero, che sa usare stance, mira e Banco, fa meglio.

## Modalità infinita (facoltativa)
Dopo la vittoria in Finale, la schermata del titolo offre **«Continua all'infinito»**: sfidanti sempre più forti, uno dopo l'altro, finché non si perde (o ci si ritira).
Il punteggio del titolo resta già contato (e salvato nello storico): l'infinito ci aggiunge sopra, e chi non sceglie niente non perde niente.

- **Come si riparte.** Subito un bottino garantito (una mutazione rara o leggendaria) e una porta, poi il primo sfidante. Dopo ogni vittoria: bottino (ogni terzo garantito, ogni
  quinto lo scrigno dell'élite: tre mutazioni rare o leggendarie) e una porta, come nella corsa. La vita continua a non ricaricarsi da sola; lo sparring d'élite c'è ancora e cresce
  coi livelli. Ci si può **ritirare** tra un combattimento e l'altro (anche alle porte): vale quanto perdere.
- **Lo sfidante di livello n.** È cresciuto come un finalista più *n* giri (con gli extra dell'ascensione) e ha, in più, una **scala senza fondo** che non dipende da statistiche,
  poteri o mutazioni (che prima o poi finiscono): `hp massimi di testa e busto +25·L`, `armatura su ogni locazione +15·L`, `danni ×(1 + 0,08·L)`, con `L = n + n²/25`
  (lineare all'inizio, poi sempre più ripida: anche la build più forte, prima o poi, cede). La scheda dello sfidante dice quanto ha di scala. Ogni quinto è un **boss**: un'élite con
  più crescita e una mutazione rara, sempre su una regola d'arena non regolare, e paga il bottino dell'élite.
- **Punteggio.** Ogni sfidante battuto vale `60 + 20·n` (+100 se è un boss), più la vita rimasta e la rapidità; tutto si somma in una voce («Modalità infinita») e si moltiplica per
  l'ascensione. Al titolo si aggiunge il record dell'infinito (`infinito_max`: gli sfidanti battuti di fila, nel salvataggio), e lo storico mostra «∞ n».
- **Misurato** (`python balance.py torneo`, che continua i bot all'infinito dopo il titolo): il bot a caso batte in mediana 1 sfidante; quello che sceglie per valore ne batte in mediana
  16–19 (p90 circa 30, massimo 36). Contro un'armatura così alta qualche duello non finisce in 120 round: nell'harness vale come sconfitta.
- **API.** `infinito` (solo da `vittoria`) e `ritira` (solo tra un combattimento e l'altro); `stato()` ha `puo_infinito` e `infinito: {attivo, vinti, livello, record, boss}`, e
  `nome_turno` diventa «Infinito n». Le corse salvate prima dell'infinito si leggono ancora.

## Una cosa che il bilanciamento ha mostrato
`python balance.py carte` misura anche le altre carte con lo stesso metodo: per chi lascia giocare i poteri all'IA, un **potere nuovo vale in media −10 punti di
forza** e un **rango in più −6** (accendere un potere costa un'azione e stamina, e l'IA li accende tutti), mentre una protesi vale +7, i riflessi +10 e le
mutazioni da +6 a +25. Per un giocatore vero, che accende il potere giusto al momento giusto, vale il contrario: è il motivo per cui il Torneo Evo esiste. Per questo
le CPU crescono più di statistica che di poteri, e il valore di `forza()` (che conta un potere come un vantaggio) resta quello di *progetto*, non quello dell'IA.
Migliorare come l'IA gioca i poteri renderebbe il Torneo più giusto, ma tocca il gioco intero: è un lavoro a parte.

## Salvataggio e API
Lo stato è tutto JSON (record di combattenti, come in palestra): si salva dopo ogni mossa in `save/evo.json` e si riprende alla riapertura (un duello interrotto
torna alla schermata prima). Il file contiene anche il record e le ultime corse.

`GET /api/torneo/stato`, `POST /api/torneo/azione {tipo, …}`: `inizia {ascensione}`, `campione {indice}`, `carta {indice}`, `rilancia`, `salta`, `porta {indice}`,
`compra {indice}`, `esci_mercato`, `allena {indice}`, `evento {indice}`, `chiudi_evento`, `combatti`, `infinito`, `ritira`, `chiudi`. Ogni risposta è lo stato nuovo; un rifiuto è un 400 con
`errore`. Cosa c'è in `stato()` dipende dalla fase (`campioni`, `bracket`, `duello`, `bottino`, `porte`, `mercato`, `allenamento`, `evento`, `sparring`,
`vittoria`, `eliminato`; la modalità infinita riusa `bracket`, `bottino`, `porte`...).

## Provarlo
```
python test_evo.py                       # dati, mutazioni una a una, corsa fase per fase, salvataggio, API, 56 corse intere a caso
node test_torneo.js stati.json           # il client (lo lancia test_evo.py con stati veri)
python balance.py torneo                 # corse intere: titolo con scelte a caso e da giocatore furbo
python balance.py mutazioni              # quanto vale ogni mutazione
python balance.py carte                  # e ogni altra carta del bottino
```
Aggiungere una mutazione o un evento è solo dati: basta una voce nel JSON (le `ops` disponibili sono in `evo.applica_ops`), poi `python balance.py mutazioni`
dice se sta nella fascia della sua rarità.
