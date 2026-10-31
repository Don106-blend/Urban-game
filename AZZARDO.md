# Il Banco — il gambling dell'arena

Progetto e misure del rework di scommesse e reazioni del pubblico (2026-10-31). Il codice sta in `azzardo.py` (logica pura, senza
Flask) e si aggancia a `DuelloWeb` in `app.py`; l'interfaccia in `static/duello.js`, `templates/duello.html`, `static/style.css` e
`static/arena.js` (la folla disegnata); le misure con `python balance.py azzardo`; i test con `python test_azzardo.py`.

## 1. Cosa non andava

| Prima | Perché non era gambling |
|---|---|
| Una sola puntata, su di sé, a quota `1,1 / p` | A 50% pagava **2,2x**: il banco regalava il 10%. Chi puntava tutto a ogni duello aveva un valore atteso **+10%**: una macchina da soldi, non un rischio. |
| Quattro sponsor con un bonus fisso | Nessuna posta: se non rispettavi la condizione non perdevi niente. |
| L'«hype» (0-100) | Una barra che saliva e non faceva niente. |
| Tutto riservato al giocatore | La CPU non puntava, non azzardava, non sentiva la folla. Niente di quello che si faceva sul banco cambiava il combattimento. |

## 2. Principi

1. **Gambling puro**: una posta, una quota che dice il rischio, varianza vera e una casa che trattiene il suo. Chi azzarda a caso perde.
2. **Opt-in**: se nessuno azzarda il duello è quello di sempre. `balance.py` misura M1-M10 con l'arena spenta e non cambiano.
3. **Simmetria**: ogni effetto sul combattimento (la folla, i tre azzardi) vale per entrambi i lati, con le stesse regole e lo stesso dado.
   Li gioca anche la CPU (`Tavolo.cpu_azzarda`). Quello che resta solo del giocatore sono i soldi: la CPU non ha un portafoglio.
4. **Nessun potere gratis**: ogni azzardo ha un prezzo misurato, il suo punto di pareggio sta dove dice il testo, e ognuno è un po' peggio
   di non farlo quando non c'è un motivo (a pari la casa vince; serve la folla dalla tua, un colpo probabile o la disperazione).
5. **Quello che muove la fortuna è il dado di sempre**: la folla aggiunge pip (+1/+2/+3) al d10 delle giocate, come un rango.
6. **Le scommesse su cose che si pilotano si provano contro chi le pilota** (§5): una clausola che una strategia deliberata sfrutta non entra.

## 3. Le regole

### Il Banco (i soldi)

* **Quota**: `0,9 / p` (a 50% paga 1,8x), tra 1,1x e 10x. `p` è la stessa logistica calibrata di prima (`prob_vittoria`: gap di `valuta` + gap di hp).
* **Puntate multiple**: fino a 4 aperte, in qualsiasi momento (non solo nel proprio turno), anche tutto il portafoglio. **Non si punta contro il
  proprio allievo**: il banco non accetta chi si vende.
* **Tetto vivo**: libero finché `p` sta tra 30% e 70%, si stringe fino a zero a 95% / 5%. Nessuno ti lascia puntare sul sicuro.
* **Incasso anticipato**: `puntata × quota × serie × p × 0,9`, a qualsiasi momento. Andata e ritorno costa il ~19%.
* **Clausole** (le vecchie sponsor, ora con una posta): scommesse speciali firmabili fino alla fine del round 1; pagano `quota viva × k` se vinci
  **e** la condizione è vera.

  | Clausola | Condizione | k | k equo misurato (1 / P(condizione \| vinci)) |
  |---|---|---|---|
  | Lampo | vinci entro il round 3 | 3,2 | 3,7-4,2 (P = 24-27%) |
  | Incassatore | vinci dopo essere sceso sotto il 50% di testa + busto | 5,0 | 5,2-5,9 (P = 17-19%) |
  | Stoico | vinci senza mai accendere un potere (solo se ne hai) | 1,4 | non misurabile: l'IA li accende sempre; è il prezzo dell'handicap (senza poteri si vince ~9 punti in meno: 0,50 / 0,41) |

  Il k scritto sta **sotto** quello equo di proposito (§5). Tolte: la «Bestia» (vinci avendo acceso un potere: vera nel 99% dei casi) e il
  «Colpo alla testa» (vinci con un K.O. alla testa: +95% per ¤ a chi mira sempre alla testa).
* **Serie**: ogni azzardo riuscito (ruota in bene, rilancio a segno, Ultima Puntata) alza di +20% il pagamento di *tutte* le puntate aperte, fino
  a +100%; il primo che va male la spezza. Non conta se l'incontro è già deciso (`p` fuori da 20-80%): sarebbe un bonus gratis.

### La Folla (le reazioni del pubblico)

Un solo tifo, da −100 (con la CPU) a +100 (con il giocatore). **Segue chi batte le quote, non chi domina**: dopo ogni colpo si sposta di
`36 × (1 − p)` verso chi l'ha messo a segno (se andava a segno con probabilità `p`) o di `−36 × p` se l'ha mancato: a media zero, quindi
premia la fortuna e il coraggio, non la forza. In più piccoli bonus di spettacolo (schivata +4, parata +3, potere +3, stance +2, colpo
grosso +6, arto storpio +8, K.O. +10, rilancio a segno +12). A ogni round si raffredda del 12%.

* **Dado della folla**: `|tifo|` ≥ 25 / 50 / 75 → ±1 / ±2 / ±3 pip sul d10 della Ruota e dell'Ultima Puntata (uguale e contrario per i due lati).
* **Ovazione**: a ±65 la folla è in piedi per chi ama (+1 a colpire e ai riflessi per 2 turni, il tifo cala di 40). Scatta in ~24% dei duelli.
* Si vede: la barra in testata, un chip per lato sul dado, e nell'arena le sagome in alto tifano (braccia alzate, saltelli, nel colore di chi
  amano), siedono mogie dall'altra parte e scattano in piedi all'Ovazione.

### Gli Azzardi (in combattimento)

Costano l'**azione bonus**, **uno per turno**. Per tutti e due i combattenti.

* **Ruota della Folla**: si tira `d10 + dado della folla`. La sfortuna dura un turno più della fortuna (a 2 turni, a pari, la ruota valeva +0,4 punti
  di vittoria su 40.000 duelli: la casa non vinceva).

  | Totale | Esito | Effetto | Valore (hp eq.) |
  |---|---|---|---|
  | ≤ 1 | Sfiga nera | −2 a colpire e ai riflessi per 3 turni, −2 stamina | −170 |
  | 2 | Fischi | −1 a colpire e ai riflessi per 3 turni | −62 |
  | 3 | Bottiglia! | −25 hp a una locazione a caso (mai mortale) | −25 |
  | 4-5 | Silenzio | niente | 0 |
  | 6 | Incitamento | +1 a colpire e ai riflessi per 2 turni | +42 |
  | 7 | Adrenalina | +1 azione subito, +2 stamina | +25 |
  | 8 | Medikit dagli spalti | +25 hp alla locazione più ferita | +18 |
  | 9 | Giubbotto | +25 di armatura sul busto | +10 |
  | 10-11 | Boato | +2 a colpire e ai riflessi per 2 turni | +75 |
  | ≥ 12 | **JACKPOT** | Furia (+2) per 3 turni, +40 hp al busto, +1 azione | +180 |

  Valore atteso: −9 a pari (la casa vince), +16 con la folla +1, +40 con la +2. Il jackpot c'è solo con la folla dalla tua. Una ruota riuscita
  consuma metà del tifo. Una sola «fortuna» alla volta: la più recente vince, tranne un bonus più debole su uno più forte.
* **Rilancio** (livello 1) e **Tutto o niente** (livello 2): il prossimo colpo di questo turno fa ×1,4 / ×2,5, **senza uccidere da solo** (a testa e
  busto lascia almeno 1 hp). Se non va a segno si paga: si perde la risposta del round e si resta **Esposto** (−1 ai riflessi per punto);
  a «Tutto o niente» anche le azioni che restavano e un **contraccolpo** (60% del danno che avrebbe fatto, a un arto proprio: «ti strappi un
  muscolo»). Il punto di pareggio è ~50% a colpire per il Rilancio e ~55% per Tutto o niente. Contro chi può ancora schivare, solo i colpi
  non schivabili (il Colpo pesante) hanno una probabilità.
* **Ultima Puntata**: una volta per duello, con testa o busto sotto il 30%. `d10 + dado della folla ≥ 7` (40% a pari): chi resiste riparte con testa
  e busto al 45%, +1 azione, Furia; **chi crolla** va in zona morte (−hp massimi) ed è sconfitto: per un allievo della palestra scatta il tiro
  di morte di sempre (`min 10%, 75% − Toughness`), e l'interfaccia lo dice prima («se crolli 65% di morire»).

### La CPU azzarda

Decide **una volta per turno** (estrazione `voglia` contro la manopola `PROFILO["azzardo"]`, 0,5 di partenza, 0,1-0,9, tarata dal questionario di
fine duello con «troppo spesso / troppo poco») e sceglie il gioco con più utilità, `valore atteso + 0,3 × (0,5 − p) × deviazione`: chi sta sotto cerca la
varianza, chi è avanti la evita. Prima di arrendersi tenta l'Ultima Puntata se `p(riuscire) × 60% > p(vincere)`. Tre politiche per le prove:
`saggio` (questa), `mai`, `folle` (sceglie a caso, sempre).

## 4. Misure (`python balance.py azzardo`, n=8000, semi 2-21: tutti verdi)

| | Risultato | Fascia |
|---|---|---|
| Z1 controllo (nessuno azzarda) | 49-51% | 47-53 |
| Z1 azzarda con giudizio contro chi non azzarda | controllo −0,3 … +2,1 | non meno di −1,5, non oltre 58 |
| Z1 azzarda a caso contro chi non azzarda | **−5 punti** dal controllo (44-46%) | almeno 2 sotto |
| Z1 saggio contro saggio | 49,7-50,3% | 47-53 |
| Z2 giri di ruota / rilanci / Ultime Puntate per duello (due lati) | 1,4-1,8 / 1,2-1,4 / 0,04 | 0,3-2 / 0,2-2 / 0,03-0,3 |
| Z2 duelli con almeno un'Ovazione | 23-25% | 20-40 |
| Z3 una ruota al primo turno, scarto −1 / 0 / +1 / +2 | ~46-48 / 48,5-50,8 / 52 / 55% | a pari non oltre controllo +1,5; +2 batte −1 di 3+ |
| Z4 rilancio / Tutto o niente a colpo improbabile | 48-49 / 47-48% (sotto il controllo) | sotto il controllo |
| Z4 Tutto o niente a ≥ 45% → a ≥ 60% | cresce con la soglia | cresce |
| Ultima Puntata giocata sempre a testa o busto < 30% | 45% contro 50% di controllo; riuscita nel 37%, poi si vince il 64% | (informativo) |
| Z5 calibrazione delle quote (fasce con ≥ 300 casi) | scarto massimo 3-5 punti | ≤ 8 |
| Z5 ritorno per ¤ di una puntata cieca (tenuta / incassata al round 3) | 0,83 / 0,80 | 0,80-1 / 0,76-1 |
| Z6 clausole: k scritto non oltre il k equo | Lampo 3,2 ≤ 3,7-4,2 · Incassatore 5,0 ≤ 5,2-5,9 | scritto ≤ equo |
| Z6b clausole: la strategia migliore rende per ¤ | Lampo 0,91-0,92 · Incassatore 0,68-0,77 | ≤ 1,05 |
| Z7 eccezioni / duelli non finiti su ~8000 duelli con gli azzardi | 0 / 0 | 0 / 0 |

Lettura: chi gioca d'azzardo con giudizio non ci guadagna un vantaggio ma nemmeno ci perde (il premio è piccolo: 0-2 punti); chi azzarda a
caso paga 5 punti di vittorie; il tifo vale quando la fortuna è con te. I soldi sono dove sta il rischio: puntare il portafoglio è l'unica scelta che
cambia davvero il bilancio di una serata.

## 5. Scelte non ovvie

* **La stima della probabilità era gonfiata.** La stance Taunt tira dadi *dentro* il bonus a colpire: una stima sola (`p_colpire_stimata`) oscillava da
  −2 a +9 e chi aspettava il numero giusto sceglieva solo rumore (con un avversario in Taunt: stima 66%, realizzato 43%). Ora `p_colpire_stimata` è la media
  su 32 estrazioni quando una stance in campo tira dadi (e sistema anche la percentuale mostrata sui bottoni degli attacchi).
* **Un tetto relativo agli hp massimi non funzionava**: il Colpo pesante fa già 70+ danni, più del 60% di ogni locazione, quindi il rilancio non faceva
  niente ma costava lo stesso. Da qui «non uccide da solo» al posto del tetto, e i moltiplicatori misurati (con ×2 e ×3 conveniva anche al 30%).
* **Le clausole si provano contro chi le pilota.** Prezzate sulla media dell'IA, «Colpo alla testa» rendeva **1,95 per ¤** (+95%) a chi mirava sempre alla
  testa — la strategia dominante del gioco di base (M4) — e «Lampo» 1,12: in una scommessa su qualcosa che si controlla, il prezzo giusto è quello della
  strategia migliore, e per «Colpo alla testa» questo è ~1 (la condizione è vera in tutte le vittorie di chi mira alla testa: una clausola senza senso).
  Tolta; Lampo sta a 3,2 (la strategia migliore rende 0,92, il turista ~0,6: una scommessa da squalo); Incassatore non si sfrutta nemmeno facendosi colpire
  apposta (0,6-0,8). `Z6b` del harness lo rimisura.
* **`Rilancio` e non `Raddoppio`**: a ×1,4 non è più un raddoppio.
* **Ruota con jackpot a `d10 + folla ≥ 12`**: a pari non esiste, e la folla si guadagna giocando bene (o con fortuna), non si compra.
* **Niente puntate contro il proprio allievo**: con un'IA che si può battere in modo volontario (basta non difendersi o arrendersi) sarebbe un incasso sicuro.
* **La serie non conta a incontro deciso**: se no basterebbe girare la ruota negli ultimi turni, quando non c'è più niente da rischiare.

## 6. Limiti (e dove si può spingere)

* `valuta()` non conosce l'equipaggiamento: contro la CPU, che ne ha a budget di livello, le quote sono un po' ottimiste per un eroe nudo (un
  puntatore cieco rende 0,83 invece di 0,9). Per superarlo: un termine di `valuta` per il valore degli oggetti, rifatto con la regressione di §9 di
  `OVERHAUL_GAMEPLAY.md`.
* Le misure sono IA contro IA. Un giocatore umano sceglie meglio *quando* azzardare (è il suo premio) e può battere il banco scegliendo il momento
  delle puntate e dell'incasso; mirare sempre alla testa vale ~+5% per ¤ anche sulla puntata semplice (58% di vittoria a quota 1,8), ed è quello che
  M4 vuole.
* L'economia non è simulata (carriera, crediti nel tempo): con margine 10% e puntate multiple il banco è un pozzo di soldi per chi osa, non un rubinetto.
* Un debito (puntare più di quel che si ha, con un usuraio che si riprende i soldi dall'allievo) è il passo naturale dopo questo: i ganci sono
  `DuelloWeb.fondi / preleva / accredita`.
* Non si registrano le scelte d'azzardo del giocatore per `tattiche.py`: la CPU non impara *come* azzardi, solo il questionario sposta la manopola.
* Preesistente, non del Banco: nel fuzz di `balance.py` (equipaggiamento illimitato) un duello su ~20.000 non finisce entro 120 round — uno stallo tra due
  personaggi con il «Generatore di scudi» su entrambi i lati; e M3 (+1 rango = 66/82/89%) sta sul bordo della sua fascia con n piccoli.
