# Stile e proporzioni degli sprite di Urban

Documento di riferimento per chi (io, in una sessione futura) tocca gli sprite dei combattenti: nuovi corpi
base, overlay di customizzazione (poteri, vestiti, capelli...), ricolorazioni. **Leggerlo prima di disegnare
qualsiasi cosa**: serve a restare coerenti con il corpo base maschile (`maschio`) gia' fatto.

> Regola d'oro: ogni nuovo sprite deve poter sostituire o sovrapporsi a un pezzo esistente senza ritoccare
> il resto. Stesso canvas, stessi giunti, stessa palette a indici, stessa luce.

## 1. Dove sta cosa

| Cosa | Dove |
|---|---|
| Sorgente degli sprite (codice pxl, skill `pxl-pixel-art`) | `tools/sprites/maschio_base.px.js` |
| PNG finali dei pezzi + manifest | `static/sprites/maschio/*.png`, `static/sprites/maschio/parti.json` |
| Anteprima (grigio + due ricolorazioni) | `tools/sprites/anteprima_maschio.png` |
| Disegno nel duello (canvas), sangue, ricolorazione, scambi, effetti | `static/arena.js` |
| Motore fisico a corpi rigidi | `static/fisica.js` |
| Il combattente come ragdoll attivo (muscoli, passi, colpi, attacchi) | `static/pupazzo.js`, test: `node test_fisica.js` |
| Banco di prova della fisica nel browser | `tools/lab/arena.html` (v. sez. 10) |
| Stili dell'arena | fondo di `static/style.css` (blocchi "arena" e "colonna centrale") |

Rigenerare i PNG (da `tools/sprites/`, `PXL` = `node <skill pxl>/bin/pxl.js`):

```
PXL build tools/sprites/maschio_base.px.js --out <cartella temporanea>
```

poi copiare `<out>/sprites/*.png` in `static/sprites/maschio/`. La scena `assemblato` (48x111) e lo sheet
`parti` servono a controllare a occhio: ingrandirli senza griglia (Pillow, `Image.NEAREST`, x4-x6) prima di
giudicare. Non usare lo `_preview` di pxl per giudicare le proporzioni: la griglia inganna.

## 2. Vista e canvas

- **Profilo, rivolto a destra.** Per far guardare a sinistra si specchia (il canvas dell'arena disegna la CPU con
  scala x = -1): **mai** disegnare una versione "sinistra" a mano.
- Canvas dell'omino assemblato: **48 x 111 px**. I pezzi vivono in questo spazio; le coordinate sono pixel
  dello sprite, non dello schermo. In gioco si ingrandisce di una **scala intera** (1-5, scelta da `arena.js` in
  base all'altezza dell'arena); mai scale frazionarie. I pezzi si disegnano a posizione e rotazione *reali*
  (float, nearest-neighbour): niente arrotondamenti a pixel dello sprite, che farebbero scattare il movimento.
- Niente antialiasing, niente trasparenze parziali: pixel pieni o vuoti. Il canvas disegna con
  `imageSmoothingEnabled = false` e ha `image-rendering: pixelated`.

## 3. Proporzioni (corpo maschile)

Misure **con il contorno** (1 px per lato), salvo dove scritto "interno".

| Pezzo | File | Dimensione | Note |
|---|---|---|---|
| Testa + collo | `testa` | 16 x 20 | cranio 14 interno (16 col contorno), collo 4 righe; naso = 1 px; mascella quadrata; **nessun lineamento** (niente occhi, orecchie, bocca) |
| Busto, meta' alta | `busto_sup` | 13 x 21 | spalle/torace, profondita' massima 11 interna |
| Busto, meta' bassa | `busto_inf` | 13 x 21 | vita, bacino, glutei dietro |
| Braccio (sopra il gomito) | `braccio_sup_dx/sx` | 7 x 24 | larghezza 5 interna, spalla tonda |
| Avambraccio + mano | `avambraccio_dx/sx` | 7 x 27 | larghezza 4, polso 3, mano 4 |
| Coscia | `coscia_dx/sx` | 9 x 26 | larghezza 7 in alto, 6 poi 5 al ginocchio |
| Stinco + piede | `stinco_dx/sx` | 17 x 34 | polpaccio che sporge dietro, caviglia 4, **piede lungo 15 verso davanti**, alto 5 |

Rapporti da conservare:

- Altezza totale **111 px**: ~6,9 teste (cranio 16 px) o ~7,9 con il cranio interno. Gambe ~52% dell'altezza.
- Arti **sottili** (riferimento dell'utente): braccio ~6% dell'altezza, gamba ~8%, busto ~12% (profondita').
  Il primo tentativo "tozzo" e' stato scartato: se un nuovo corpo sembra spesso, e' sbagliato.
- Il braccio arriva a meta' coscia; il piede e' lungo circa un cranio.
- Un corpo diverso (es. femminile) puo' cambiare le forme ma deve **tenere nomi dei pezzi, giunti e riga di
  taglio**, cosi' scheletro, ragdoll e overlay restano validi.

La forma di ogni pezzo e' scritta nel sorgente come righe `[x_dietro, x_davanti]` (o punti chiave
interpolati, `lerp`): modificarle li', non ritoccare i PNG a mano.

## 4. Palette: 5 grigi fissi (indici)

| Chiave | Esadecimale | Canale R | Ruolo |
|---|---|---|---|
| `k` | `#262626` | 38 | contorno |
| `a` | `#6a6a6a` | 106 | ombra |
| `b` | `#8e8e8e` | 142 | base |
| `c` | `#b2b2b2` | 178 | luce |
| `d` | `#d8d8d8` | 216 | riflesso |

- Sono **indici**, non colori: `arena.js` ricolora leggendo il canale R (`GRIGI`) e sostituendo con la palette
  della pelle (`PELLI`). **Non aggiungere altri grigi** ne' tinte nei PNG base: un valore sconosciuto viene
  trattato come `b` e si perde l'ombreggiatura.
- Pelle giocatore/CPU e sangue (`SANGUE`) sono mappe `k,a,b,c,d -> RGB` dichiarate in `arena.js`. Ogni nuovo
  tono di pelle = una nuova mappa di 5 colori con la stessa scala scuro->chiaro.
- Gli overlay colorati (capelli, vestiti) possono usare palette proprie, ma con la stessa disciplina: pochi
  toni (2-4 per materiale), scala scuro->chiaro, contorno `k`.

## 5. Luce, ombre, contorno

- **Luce da davanti-in-alto** (lato dell'avversario): resta dal lato giusto anche quando lo sprite e' specchiato.
- Ogni pezzo parte da una forma piatta in `b`, riceve il contorno 1 px `k` (4 vicini, niente diagonali), poi la
  funzione `toon`: bordo davanti/alto = `c`, bordo dietro e 1 px sotto = `a`.
  - testa e busto: **2 px** di luce e **2 px** di ombra (`lt:2, dk:2`);
  - arti: **1 px** di luce e **1 px** di ombra (`lt:1, dk:1`).
- Riflessi `d`: strisce da 1 px sul bordo davanti (3-11 px di altezza), mai di piu'. Uno per pezzo.
- **Arto lontano** (`_sx`, il lato non rivolto alla camera): stessa forma, ma tutta la scala scende di un
  gradino (`shade()`: `b->a`, `c->b`, `d->c`). Il lato "dx" e' il vicino perche' il personaggio guarda a destra.
- Niente dithering, niente rumore "di riempimento": colore piatto + bande pulite. Segni sulla superficie
  solo se hanno una causa (cuciture, pieghe, ferite).

## 6. Articolazione: pezzi tagliati a meta'

Busto in vita, braccio al gomito, gamba al ginocchio. Ogni meta' ha **contorno e luce propri**, quindi la linea
di snodo si vede (come nel reference).

| Taglio | Righe interne della meta' alta | Posa della meta' bassa |
|---|---|---|
| busto | 19 | `y = y_alto + 19` |
| braccio | 22 | `y = y_alto + 22` |
| gamba | 24 | `y = y_alto + 24` |

La meta' bassa si posa con la **riga di contorno superiore sull'ultima riga interna della meta' alta**: la
sagoma totale resta quella del pezzo intero e la riga di snodo e' condivisa. La meta' bassa si disegna **sopra**
l'alta (z maggiore).

## 7. Manifest e scheletro (`parti.json`)

- `canvas`: `[48, 111]`.
- `giunti`: coordinate a riposo (nel canvas) di `cima`, `collo_alto`, `vita`, `anca`, e per ciascun lato
  `spalla_*`, `gomito_*`, `polso_*`, `anca_*`, `ginocchio_*`, `caviglia_*`. I lati `_sx` (lontani) sono
  spostati di -4 px (braccio) / +4 px (gamba) rispetto al vicino, solo per vederli entrambi a riposo.
- `parti[nome]`: `file`, `loc` (locazione di gioco: testa, busto, braccio_sx/dx, gamba_sx/dx), `z` (ordine di
  disegno), `da`/`a` (i due giunti dell'osso), `perno` (punto dello sprite appeso al giunto `da`, in pixel locali),
  `y0` (riga di partenza nello sprite intero: serve a rendere continuo il sangue tra le due meta').
- `piedi` (opzionale): `{parte: "stinco", riga: 26, sovrapposizione: 3}` = da quale riga dello sprite dello stinco si
  stacca il piede (corpo a se', con la caviglia), e quante righe condivide con lo stinco per nascondere la giuntura.
- **Regola di posa**: ogni pezzo e' appeso al suo corpo rigido (`pupazzo.js`); il disegno e'
  `translate(centro di massa) rotate(angolo del corpo) drawImage(pezzo, scarto)`, dove lo scarto porta il punto `perno`
  del pezzo sul giunto `da`. A riposo l'angolo e' 0 e ogni pezzo sta in `da - perno`. Un nuovo pezzo/overlay che segue un
  osso usa lo stesso `perno` del suo pezzo.
- Z-order a riposo (basso -> alto): braccio lontano, gamba lontana, gamba vicina, busto (sup, inf), testa,
  braccio vicino.

## 8. Customizzazione (overlay) — come aggiungerli senza rompere nulla

Idea di riferimento: *The Binding of Isaac* — il corpo base resta, sopra si impilano livelli che dipendono da
poteri/oggetti; ogni personaggio e' generato proceduralmente cambiando colori e livelli.

1. Un overlay e' **un PNG per pezzo**, nel **sistema di coordinate locale del pezzo** (origine = angolo in alto
   a sinistra del PNG del pezzo). Stessa dimensione del pezzo, oppure piu' grande con un offset dichiarato
   (capelli, cappelli, ali) — l'offset e' relativo al pezzo e ruota con lui.
2. Si disegna **nella stessa trasformazione** del pezzo (in `disegnaCombattente`, subito dopo il `drawImage` del pezzo,
   dentro lo stesso `save/restore`), cosi' eredita posa, rotazione, flash di colpo e specchio. Mai posizionarlo in
   coordinate dello sprite intero.
3. Ordine dei livelli per pezzo: `pelle` (base ricolorata) -> `sangue` (generato a runtime) -> `overlay
   vestiti/oggetti` -> `overlay poteri`. Il sangue sta **sotto** vestiti ma sopra la pelle; se si vuole il
   contrario va deciso e scritto qui.
4. Stile identico al base: profilo a destra, luce da davanti-in-alto, contorno 1 px `k`, 2-4 toni per materiale,
   niente antialiasing, scala intera. Un overlay che copre una giuntura (es. gonna sul bacino) deve avere il
   proprio taglio alla stessa riga del pezzo.
5. Per la ricolorazione procedurale usare i 5 indici anche negli overlay "di pelle" (barbe, cicatrici, tatuaggi);
   per tessuti/capelli, palette dedicate scelte a runtime.
6. Dichiarare overlay e offset nel manifest (nuova chiave per pezzo, es. `overlay`), non nel codice.
7. Le locazioni sono le 6 del gioco: sangue, flash, knockback e arto "storpiato" lavorano per **locazione**,
   quindi un overlay su `avambraccio_dx` appartiene alla locazione `braccio_dx`.

## 9. Sangue (generato, non disegnato)

`arena.js: disegnaPelle()`. Rumore a macchie (value noise, scala 3 px) + puntini, calcolato sulle coordinate dello
sprite **intero** (`y0`), cosi' le due meta' di un arto sono continue. Soglia `0.1 + 0.9 * danno` con
`danno = 1 - hp/hp_max` della locazione. Il tono segue quello sottostante (`a`->scuro, `b`, `c`, `d`->chiaro);
dove la soglia e' superata di 0.35 diventa il tono piu' scuro (coaguli). Il contorno `k` non si sporca.
Le locazioni con protesi non sanguinano.

## 10. Fisica: come si muovono i combattenti (`static/fisica.js`, `pupazzo.js`, `arena.js`)

Tre strati, dal basso:

1. **Motore (`fisica.js`)**: corpi rigidi 2D fatti di capsule, giunti a cerniera con limiti e **motori PD**, contatti col
   pavimento e coi muri (attrito di Coulomb, rimbalzo), gravita'. E' il risolutore "soft step" di Box2D 3: ogni passo
   (1/60 s) si divide in 4 sotto-passi; i vincoli sono molle implicite, quindi stabili per qualsiasi rigidezza e rapporto
   di massa. Un motore e' una molla smorzata sull'angolo relativo (`giunto.motore(hz, zeta, coppiaMax, obiettivo)`): `hz`
   vale per l'inerzia dell'arto *attorno al giunto* (Steiner), `zeta = 1` = niente sovraelongazione. Niente DOM, gira in Node.
2. **Pupazzo (`pupazzo.js`)**: il combattente come *ragdoll attivo*. 13 corpi rigidi (uno per pezzo di `parti.json`, piu' il
   **piede ritagliato dallo stinco** a runtime: righe `>= piedi.riga`, con `piedi.sovrapposizione` righe in comune che
   nascondono la giuntura; v. `parti.json` -> `piedi`). Masse antropometriche (testa 8%, busto 50%, cosce 10% ciascuna...).
   Ogni giunto ha un motore; la **posa** e' un insieme di bersagli (altezza del bacino, inclinazione di busto e testa, dove
   stanno mani e piedi) tradotti in angoli dalla cinematica inversa a due ossa. Tutto cio' che si vede muoversi ha
   inerzia: i colpi sono impulsi, gli arti frustano e si assestano, i piedi fanno attrito e scivolano.
3. **Arena (`arena.js`)**: due pupazzi, disegnati su **un canvas** (niente piu' DOM per pezzo) a posizione e angolo *reali*
   (float, interpolati tra due passi di fisica: niente scatti a pixel interi ne' rotazioni a gradini), con ombre, schizzi di
   sangue per locazione, scintille per le protesi, polvere dei piedi, proiettili per gli attacchi a distanza, hit-stop e
   scossa dello schermo, ralenti sul colpo di grazia. Ogni *scambio* (un colpo con il suo esito, deciso dalla logica) e'
   messo in scena a turno da una coda.

### Come sta in piedi
- Il corpo **non sta in piedi da solo** (due gambe rigide in parallelo e un appoggio di 12 px oscillano da un piede
  all'altro: provato). Lo regge una molla "di galleggiamento" sul bacino (`_assistenza`): verticale (regge ~60% del peso,
  il resto lo portano le gambe, quindi i piedi premono e l'attrito li tiene) e orizzontale, con forza limitata da quanto
  i piedi reggono per attrito (altrimenti li trascina). **Niente coppia che raddrizza il bacino** (litiga con le anche):
  se ne occupano le anche appoggiandosi ai piedi, piu' uno smorzatore sulla rotazione.
- I bersagli dei motori si calcolano in **spazio dei giunti dalla posa nominale** (bacino sopra i piedi, busto inclinato...),
  non da quella attuale: cosi' i muscoli reggono il peso e la forma richiama il corpo se qualcosa lo spinge. Eccezioni
  volute: le gambe partono dall'anca *vera* (non vanno mai in tensione) e un bersaglio nel mondo (colpi, parate) si mira
  con l'inclinazione *vera* del busto.
- **Passi** (`_passi`): ogni piede e' piantato oppure in volo. Se un piede e' lontano dal suo posto (`casa + offset`) si fa un
  passo, uno per volta, alternando i piedi; il centro d'appoggio `xs` aspetta i piedi (il corpo non "scia"). Il piede
  anteriore (`dx`) non supera quello posteriore (`sx`) nei bersagli (nel passo si superano, come camminando).
- **Posa di guardia**: il bacino sta ~2,6 px sotto la posizione a gambe tese (ginocchia piegate: una gamba tesa e' una
  singolarita' dell'IK), molleggio verticale di mezzo pixel, respiro e dondolio delle mani. Tutti i numeri sono in `T`
  (`pupazzo.js`); `MUSCOLI` = `[Hz, zeta, coppia massima]` per giunto.

### Colpi
- `colpisci(loc, forza, dir, px, py)`: `forza ~ danno/90` (0,1 leggero ... 1,5 devastante). Il corpo intero parte con una
  velocita' `45 + 170 * forza` (max 300 px/s) e **scivola come un blocco** (campo di frenata uguale su tutti i pezzi, piedi
  quasi senza attrito, bacino tenuto dritto da una coppia solo finche' scivola): 60 danni ~ 18 px, 100 ~ 37 px. Poi si
  rientra **a passi**. In piu' la parte colpita prende uno strattone *nel punto d'impatto* e una rotazione all'indietro (la
  testa scatta), e i muscoli cedono (`tono`) per un istante, in proporzione.
- La quantita' di moto dello strattone locale e' tolta al corpo intero: lo spostamento dipende dalla sola `forza`.
- **Parate**: la mano va incontro al punto d'impatto, resta, torna. **Schivate** (`indietro` per il corpo, `abbassa` per la
  testa, `salto` per le gambe: in volo la molla del bacino si spegne e i piedi si raccolgono).
- **Attacchi** (`attacca`): carica, colpo, tenuta, recupero; `stile` = `pugno`, `fendente` (arco dall'alto), `affondo`
  (piu' slancio); `distanza: true` punta il braccio e al rilascio chiama `alColpoInizio` (il proiettile lo crea l'arena).
  Il bacino avanza (i piedi lo seguono a passi rapidi), il busto si carica indietro e si lancia avanti. Il contatto scatta
  quando la mano e' davvero sul bersaglio (o poco dopo): `alContatto({x, y})`.
- **Locazione storpiata** (`storpia`): i suoi muscoli si spengono (un piccolo scossone fa partire il braccio che cede) e
  l'arto fa il ragdoll da solo. **Una gamba sola**: sta in piedi sull'altra e non torna a casa (resta dov'e'). **Due gambe**:
  ci si inginocchia (coscia in verticale, stinco disteso, bacino a ~29 px dal pavimento) e dopo un po' si e' fermi.
- **Morte** (`muori`): muscoli e molla spenti, spinta all'indietro modesta, cade, rimbalza poco e **si addormenta**
  (`mondo.dorme`: niente piu' calcoli ne' tremolii). Un cadavere colpito si muove e si riaddormenta.
- **Muri** (`muri(min, max)`): il bordo dietro e'  quello dell'arena; quello davanti (`muroDavanti`) segue la superficie piu'
  vicina dell'avversario (tronco, bacino, testa), cosi' i due non si attraversano mai e la mano si ferma sul petto.

### Convenzioni
- Pixel dello sprite, secondi, radianti; y verso il basso, **angoli positivi in senso orario** (come il CSS). Il pupazzo
  vive in coordinate *locali* (guarda a +x, -x = indietro): la CPU si specchia solo nel disegno (`arena.js`: `mondo(L)`).
  Un angolo di un osso e' la rotazione oraria dal "giu'": 0 = verticale, avanti = negativo.
- Pavimento a y = 111; il piede poggia con il bordo inferiore a 111 (capsule di raggio 2,5 a y = 108,5).
- Un nuovo corpo con gli stessi nomi di giunti/pezzi funziona senza toccare la fisica; se cambiano le lunghezze delle ossa,
  ricontrollare `CORPI`/`MUSCOLI`/`T` in `pupazzo.js` e rifare girare `node test_fisica.js`.

### Come si prova
- `node test_fisica.js` (`VERBOSE=1` stampa le misure): motore (caduta, attrito, pendolo, motori, rimbalzo, limiti, muri,
  sonno) e pupazzo (riposo senza tremare, colpi a ogni locazione, attacchi, schivate, parate, arti storpi, morte, muri,
  liscezza, determinismo, raffica casuale). Node e' in `C:\Program Files\nodejs` (puo' non essere nel PATH di bash).
- **Laboratorio** `tools/lab/arena.html`: stesso `fisica.js`/`pupazzo.js`/`arena.js` del gioco con uno stato finto, su un
  server statico (`python -m http.server 5056` dalla radice). Nel browser di prova `requestAnimationFrame` puo' non girare:
  `lab.scena(evento, {n, ogni, ...})` avanza la simulazione a passi e disegna un *foglio di fotogrammi* da fotografare, es.
  `lab.scena({chi: "c", esito: "colpito", hp_persi: 70, loc: "busto", info: {tags: ["mischia"]}, tipo_danno: "taglio"}, {n: 12, ogni: 6})`.
  Per giudicare il movimento guardare i fogli e, soprattutto, le misure di `test_fisica.js`: un fotogramma non dice se e' fluido.

## 11. Errori gia' fatti (non ripetere)

- Corpo frontale e tozzo: richiesto di profilo e sottile.
- Nome di classe CSS `.flash`: gia' usato dai messaggi di sistema (bordo giallo sui pezzi). I pezzi usano `.lampeggia`.
- Giudicare dalla `_preview` con griglia di pxl: ingrandire con Nearest, senza griglia, su fondo grigio chiaro.
- Cambiare l'altezza dell'arena in base ai menu: la zona dei combattenti e' **statica** (vedi `style.css`).
- Il browser di prova puo' non eseguire `requestAnimationFrame` e lo screenshot mostrare un fotogramma vecchio:
  far avanzare la simulazione a mano (`Arena.passi(n)`, o `lab.scena` del laboratorio) e rileggere i numeri.
- Rendere i pezzi a posizioni/angoli arrotondati ("pixel perfect"): fa scattare ogni movimento. Float + interpolazione.
- Mettere una coppia di "raddrizzamento" sul bacino mentre i piedi sono a terra: litiga con le anche (limit cycle).
- Far reggere tutto il peso alle gambe con un appoggio di 12 px: oscilla da un piede all'altro. Serve la molla di sostegno.
- Aspettarsi che un piede poco carico regga una spinta orizzontale forte: scivola. La spinta e' limitata dall'attrito.
- Dare agli arti storpi solo "muscoli spenti": un avambraccio in equilibrio instabile ci mette secondi a cadere.
