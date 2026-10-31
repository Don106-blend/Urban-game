# Il Nemesis system — gli avversari sono persone che tornano

Progetto e misure del rework degli avversari (2026-10-31). La logica pura sta in `nemesi.py` (senza Flask, si prova da sola) e si aggancia a
`app.py` (matchmaking, `DuelloWeb`, fine duello); l'interfaccia in `static/duello.js` e `static/style.css`; i contenuti in
`data/soprannomi.json` e nell'effetto «Rivincita» (`tools/fase6_nemesi.py`, idempotente); i test con `python test_nemesi.py`.

## 1. Cosa non andava

Ogni duello generava un avversario nuovo (`cpu_bilanciata`) e lo buttava via. Niente di quello che facevi aveva un seguito: nessuno ricordava
chi l'aveva battuto, nessuno cresceva, nessuno aveva un volto. Né il giocatore né la folla né il banco avevano un motivo per ricordarsi di un
incontro.

## 2. Principi

1. **Il matchmaking resta quello di prima.** Un rivale *nuovo* nasce sempre da `cpu_bilanciata` (lo specchio dell'allievo + il suo `bias`);
   uno *vecchio* si ripresenta solo se è entro ±2 livelli dal livello di matchmaking dell'allievo (`FASCIA_LIVELLO`, come `BIAS_MAX`).
2. **Persistenti, non onnipotenti.** I rivali sono record come quelli degli allievi (stesso formato, `record_to_pg` li fa combattere), vivono in
   `STATO["rivali"]` (al massimo 14), crescono **piano** e non sono mai più forti di quanto il matchmaking permetta.
3. **Simmetria.** Chi ha perso l'ultimo incontro cerca la rivincita, che sia l'allievo o il rivale: stessi numeri, stesso dado.
4. **Si vede e si sente.** Il gioco avverte (riquadro, scena, log) se l'avversario è nuovo, se ti ha battuto o se l'hai battuto; e conta in
   combattimento, nelle quote e nei soldi.

## 3. Le regole

### Chi si incontra (`scegli_rivale` / `nemesi.scegli`)

* La **prima volta** (nessun rivale adatto in giro) ne nasce uno nuovo con un nome, un volto e un'attrezzatura suoi, e resta nel mondo.
* Con almeno un rivale adatto, **il 60% delle volte è lui a tornare** (`P_RITORNO`), pesato: chi ha un conto in sospeso con *quell'allievo* pesa
  `1 + 2` volte di più (`PESO_STORIA`), chi si è appena affrontato un quarto (niente repliche di fila).
* Il mondo è piccolo: sopra 14 rivali si dimentica il meno memorabile (meno incontri, poi livello più basso; mai quello appena creato).

### La memoria (`nemesi.registra`)

Per ogni allievo (id) il rivale ricorda `{vinte, perse, ultimo, giorno}` (`vinte` = vittorie dell'allievo) e porta in giro `incontri`,
`vittorie`, `sconfitte`. Lo stato verso un allievo è uno di cinque, e **il gioco lo dice a inizio duello** (`etichetta`):

| Stato | Quando | Testo |
|---|---|---|
| `nuovo` | mai affrontato (anche se ha combattuto con altri) | «Un volto nuovo sul ring» / «ha già combattuto N volte con altri» |
| `ti_ha_battuto` | l'ultima l'ha vinta lui | «Ti ha già battuto (N giorni fa): è l'occasione per la rivincita. Bilancio 0–1» |
| `nemico` | ti ha battuto almeno 2 volte e l'ultima è sua | «La tua nemesi: ti ha battuto N volte» |
| `battuto` | l'ultima l'hai vinta tu | «Ha già perso contro di te: vorrà la rivincita» |
| `domato` | l'hai battuto almeno 2 volte e l'ultima è tua | «Ha già perso N volte contro di te, e se lo ricorda» |

Le frasi sono neutre rispetto al genere del rivale (che può essere donna).

### Quanto pesa

| Cosa | Regola | Perché |
|---|---|---|
| **Rivincita** | chi ha perso l'ultima volta parte con l'effetto «Rivincita»: +1 a colpire e ai riflessi per 3 turni propri (`turni` 3 a chi agisce per primo, 4 a chi agisce per secondo: stessi turni di gioco) | **misurato** tra due combattenti identici: +5,8 / +6,9 / +8,8 punti di vittoria (stat 1/2/3, n=2000 per cella, occupa lo slot di fortuna della folla (`FORTUNA` in `azzardo.py`): non si somma a Ovazione, Incitamento…) |
| **Folla** | il tifo parte a ±25 (un pip sul dado della folla) verso chi cerca la rivincita | la folla ama il ritorno, non il favorito |
| **Quota** | `prob_vittoria` somma `K_RIVINCITA = 0,3` alla logistica per i primi 3 round, col segno di chi cerca la rivincita (+7,5% a 50%) | il Banco sa che l'allievo (o il rivale) è motivato: le quote restano oneste |
| **Taglia** | +40¤ alla vittoria per ogni sconfitta che il rivale ha inflitto a **qualsiasi** allievo della palestra, tetto +160¤ (`posta["paga"]`) | sconfiggere chi ha battuto i tuoi vale di più |
| **Allievo** | vendetta compiuta (batti chi ti aveva battuto): fiducia +8, stress −6. Perdi di nuovo col nemico: fiducia −6, stress +8 | il carattere dell'allievo reagisce (tratto Orgoglioso: già «non dimentica una sconfitta») |

### Come cresce il rivale (`cresce_rivale`, a fine duello)

* XP: **100** se ha perso, **450** se ha vinto (`300 × TOKEN_VITTORIA`): assapora la vittoria, ma un allievo ne guadagna molti di più in un duello
  e combatte molto di più. Stessi livelli, stessa tabella XP, stessi Token (`_spendi_token_cpu`), stessi sblocchi di un allievo.
* A ogni **livello** compra **un** oggetto (entro il `budget_cpu` del livello e la sua umanità libera, come in negozio).
* Dal **livello 3** si prende un soprannome dai suoi poteri.

## 4. Nomi e soprannomi

* **Nomi**: 167 nomi propri (83 femminili, riconosciuti da `aspetto.sesso_da_nome`) e 134 cognomi, senza doppioni: erano 40 e 40 (20 femminili).
* **Soprannome** (`data/soprannomi.json`): un pool **per potere** (tutti i 20 poteri × 14 soprannomi = 280, es. Pelle Invincibile → «il Muro»,
  «Corazza», «Granito»; Assorbi Energia → «Sanguisuga», «Batteria», «il Pozzo») più un pool generico di 30 per chi non ha poteri. Il pool di un
  combattente è l'unione dei pool dei suoi poteri: se ne cambia, cambia anche il pool.
* Si **sblocca al livello 3** (`SOPRANNOME_LIVELLO`), per allievi e rivali: a quel livello l'allievo riceve la nota «Ha un nome che circola: può
  scegliersi un soprannome», un rivale ne pesca uno a caso.
* **L'allievo lo cambia quando vuole** dalla scheda (`/personaggio/<id>`, menù «Soprannome»; si può togliere); il server rifiuta uno che non è nel suo
  pool o prima del livello 3. Compare come `Elena «Lama» Rossi` nella scheda, nel duello, nel riquadro del rivale e nel log.

## 5. Misure

`python test_nemesi.py` (75 verifiche, su un salvataggio temporaneo) e simulazione di 6 allievi × 80 duelli (CPU contro CPU, tutti i duelli chiusi
come in gioco, stessa palestra):

| | Misurato |
|---|---|
| Duelli contro un volto già visto | **53–68%** (atteso ~60% = `P_RITORNO`) |
| Rivali in giro a fine corsa | 14 (il tetto: il mondo si ricicla) |
| Rivale più incontrato | 8–12 volte in 80 duelli |
| Livello del rivale che torna vs allievo | in media **−0,6…−1,1** (mai oltre il matchmaking ±2) |
| Vittorie dell'allievo | **40–58%** (media 49%: il matchmaking regge anche con la memoria) |
| Allievo a fine corsa | livello 7–8; il rivale più forte 7–9 |

La Rivincita è la sola novità che sposta direttamente le probabilità, ed è misurata (§3). `balance.py` e il Torneo passano `avversario=`
esplicito: non hanno rivali, e le loro metriche non cambiano.

## 6. Limiti e ganci

* **Il registro** sta in `/rivali` (menù «Rivali»): una carta per rivale con volto, livello, bilancio V/S, poteri, taglia e, per ogni allievo
  attivo che l'ha incontrato, lo stato («La tua nemesi · 0–2 · rivincita!»). Non mostra gli allievi usciti dalla palestra (contano solo per la taglia).
* Il Torneo Evo è una modalità a parte e non ha rivali persistenti.
* I soprannomi dei rivali non sono modificabili e per ora non compaiono nelle carte della palestra (solo scheda e duello).
* **Opzione B** (OPZIONE_B_CIRCUITO.md): `genera_avversario` è già il punto in cui, invece di un rivale del pool, si pescherà un membro vero
  di una crew di distretto; la memoria (`rapporti`) e la Rivincita varrebbero invariate.
