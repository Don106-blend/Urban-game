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
| Capelli, maglie, pantaloni e texture dei colori (sorgente, manifest, assegnazione) | `tools/sprites/maschio_aspetto.px.js`, `static/sprites/maschio/aspetto.json`, `aspetto.py` (sez. 13) |
| Interno (scheletro, viscere, muscolo) sotto la pelle | `static/sprites/maschio/scheletro_*.png`, `carne_*.png` (sorgente: fondo di `maschio_base.px.js`, v. sez. 11) |
| Anteprima (grigio + due ricolorazioni) | `tools/sprites/anteprima_maschio.png` |
| Disegno nel duello (canvas), sangue, ricolorazione, scambi, effetti | `static/arena.js` |
| Motore fisico a corpi rigidi | `static/fisica.js` |
| Il combattente come ragdoll attivo (muscoli, passi, colpi, attacchi) | `static/pupazzo.js`, test: `node test_fisica.js` |
| Banco di prova della fisica nel browser | `tools/lab/arena.html` (v. sez. 10) |
| Fasciature (la garza al posto del sangue, in palestra) | `fascia_*.png` (sorgente: fondo di `maschio_aspetto.px.js`), manifest `aspetto.json` -> `fasciature` (v. sez. 16) |
| Oggetti della palestra (sacco, rack, lavagna...): sorgente, PNG, manifest | `tools/sprites/palestra.px.js`, `static/sprites/palestra/*.png` + `oggetti.json` (v. sez. 15) |
| La scena della palestra | `static/scena_palestra.js` (usa `Arena.kit` di `arena.js`) |
| Stili dell'arena | fondo di `static/style.css` (blocchi "arena" e "colonna centrale") |

Rigenerare i PNG (da `tools/sprites/`, `PXL` = `node <skill pxl>/bin/pxl.js`):

```
PXL build tools/sprites/maschio_aspetto.px.js --out <cartella temporanea>
```

(`maschio_aspetto.px.js` include il corpo base: un solo build rigenera TUTTO, pelle, interno, capelli, vestiti e texture; con
`maschio_base.px.js` da solo si ottiene soltanto il corpo e l'interno.)

poi copiare `<out>/sprites/*.png` in `static/sprites/maschio/` (ci sono anche `scheletro_*`, `carne_*`, `capelli_*`, `maglia_*`, `pantaloni_*`, `colori_*`). La scena `assemblato` (48x111) e lo sheet
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
- `scheletro`, `carne` (per pezzo, opzionali): i PNG dell'interno di quel pezzo (sez. 11). Stessa dimensione e stesso `perno` della pelle.
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

(Gli overlay di capelli e vestiti sono la sez. 13: seguono queste regole.)

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

## 11. Interno: scheletro, viscere, carne (`scheletro_*`, `carne_*`)

Sotto la pelle di ogni pezzo ci sono due livelli, **stesso canvas, stessa sagoma, stessi perni** (il test `node test_fisica.js`, blocco 3,
controlla dimensioni e sagome). Ordine di disegno per pezzo, dal basso: `scheletro` -> `carne` -> `pelle` (con il sangue).

- `scheletro_<pezzo>`: ossa (4 toni: `s` contorno scuro, `t` ombra, `o` base, `p` luce, `q` riflesso) piu', nel busto, **organi**: polmoni
  (`v u w`), cuore (`H h`), intestino (`j i g`). Testa: cranio con orbita, naso e denti, mascella, vertebre cervicali e trachea. Busto alto:
  gabbia toracica (costole, sterno, clavicola, colonna). Busto basso: lombari, sacro, bacino, anse intestinali. Arti: omero, ulna e radio,
  mano; femore e rotula; tibia, perone, piede. L'arto lontano (`_sx`) ha le stesse ossa un gradino piu' scure (`swap` p->o->t->s).
- `carne_<pezzo>`: la sagoma della pelle riletta in rossi (`M n m l L`: contorno, ombra, base, luce, riflesso; **piu' spenti del sangue**
  `SANGUE` di `arena.js`, che e' piu' vivo) con fibre muscolari (strisce lungo l'osso negli arti, oblique sul busto).
- **Colori veri**, non indici: l'interno non si ricolora (non dipende dalla pelle del combattente). Stile come il resto: luce da
  davanti-in-alto, niente antialiasing, 2-3 toni per materiale. Ossa e organi stanno **dentro la sagoma** (si ritagliano da soli nel
  sorgente: `dentro()`), quindi non escono mai dalla pelle.
- Nel sorgente: forme riempite (`rc` rettangolo, `el` ellisse, `ln` linea), `forma()` le ombreggia, `interno()` le registra. Per ritoccare
  un osso si cambia la funzione del pezzo (`armSup`, `thigh`, `shin`...), non il PNG.

**Quando si vede** (`arena.js`: `disegnaPelle`, `disegnaCarne`, `rango`): solo quando la locazione e' **in negativo**. `prof = -hp / hp_max`
(0..1; le protesi restano a 0). Con `prof > 0` la pelle viene strappata a macchie (alpha mask) e sotto si intravede la carne; piu'
si scende, piu' si strappa anche la carne e restano le ossa:

| hp (busto, max 120) | `prof` | pelle strappata | carne strappata | effetto |
|---|---|---|---|---|
| -20 | 0,17 | ~23% | ~10% | danneggiato, si intravede l'interno |
| -60 | 0,50 | ~62% | ~48% | mezzo corpo e' aperto |
| -100 | 0,83 | ~92% | ~83% | quasi sparito: ossa, organi e brandelli |
| -120 (= -max; un arto e' storpiato) | 1 | 98,5% | 97% | restano ossa e scampoli |

- La maschera e' un **rango per pixel** (percentile di rumore a macchie + distanza da un centro-ferita fisso per locazione e per
  combattente), quindi la quota strappata e' esattamente `quotaPelle(prof)` / `quotaCarne(prof)` e cresce sempre dagli stessi punti. La pelle
  strappata ha l'orlo di ferita (`BORDO_FERITA`), la carne ai bordi scurisce. Il sangue della pelle e' continuo a 0 hp (soglia 1) e cala piano.
- Testa e busto in negativo significano morte: si vedono sul cadavere. Gli arti in negativo si vedono da in piedi.
- Se un pezzo non ha `scheletro`/`carne` nel manifest il gioco funziona lo stesso (resta pelle + sangue).
- Provare nel laboratorio (`tools/lab/arena.html`): `lab.scena(null, {stato: {player: pg("A", {braccio_dx: -20, gamba_sx: -60}), cpu: pg("B", {busto: -100, testa: -80})}, n: 1, cols: 1, cella: 780, x0: 0.3, x1: 0.7})`.
  Dopo una scena con un morto **ricaricare la pagina** (`reset` non lo fa rialzare).

## 12. Errori gia' fatti (non ripetere)

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
- Capelli: contorno nero sull'attaccatura (sembra un berretto); capelli lunghi che coprono il collo; scordare `{ palette: true }` nell'`include` del file base.
- Vestiti: ritoccare un PNG in modo che esca dalla sagoma della pelle (la maschera di strappo e' definita sui pixel della pelle).
- Interno: ritoccare i PNG a mano invece del sorgente; disegnare ossa che escono dalla sagoma della pelle (nel sorgente si ritagliano da sole).
- Dare agli arti storpi solo "muscoli spenti": un avambraccio in equilibrio instabile ci mette secondi a cadere.

## 13. Aspetto: capelli, vestiti e colori (`maschio_aspetto.px.js`, `aspetto.json`, `aspetto.py`)

Ogni personaggio ha un **aspetto**: `{"sesso", "capelli", "maglia", "pantaloni", "copricapo", "seed"}` (`copricapo` puo' essere `null`). Capelli, maglia e pantaloni sono overlay
(sez. 8) **a indici** come il corpo (k contorno, a ombra, b base, c luce, d riflesso): il colore non e' nei PNG ma si ricava a runtime
dal `seed`, campionando due texture. Tutto e' dichiarato in `static/sprites/maschio/aspetto.json` (letto sia da `arena.js` sia dal
server, `aspetto.py`): per aggiungere una capigliatura o un indumento si disegna, si dichiara nel manifest e basta.

**Ordine dei livelli, per pezzo** (dal basso): scheletro -> carne -> pelle (con sangue) -> **pantaloni -> maglia** -> (sulla testa) **capelli**.
Gli indumenti stanno sopra il corpo e le ferite; il braccio vicino resta sopra i capelli (z del corpo).

### Capigliature (16)
- `capelli_<id>.png`, tela **32 x 50**; `offset` `[-10, -10]` = dove sta l'angolo alto-sinistro del PNG rispetto a quello di `testa.png`
  (cioe' la testa e' a (10, 10) nella tela: spazio per ciuffi, chignon, code e capelli lunghi sulla schiena). Il bordo della tela resta vuoto.
- Tag di **sesso** nel manifest: `"M"`, `"F"` o `"unisex"` (valida per entrambi, `aspetto.capelli_ammessi`). Oggi 8 M e 8 F, nessuna unisex.

| id | nome | sesso | note |
|---|---|---|---|
| m1 | Rasato | M | aderente al cranio |
| m2 | Corto | M | un po' di volume, ciocche verso la nuca |
| m3 | Spazzola | M | cima piatta, ai lati cortissimo |
| m4 | Ciuffo | M | la cresta sporge sulla fronte |
| m5 | Mohicano | M | cresta centrale a punte, ai lati rasato |
| m6 | Pettinato | M | ciuffo laterale, copre l'orecchio |
| m7 | Ricci | M | nuvola di ricci attorno alla testa |
| m8 | Chignon alto | M | raccolti in alto dietro, con il laccio |
| f1 | Caschetto | F | alla mascella |
| f2 | Lunghi lisci | F | sulla schiena fino a meta' busto |
| f3 | Coda alta | F | la coda scende dietro la testa |
| f4 | Treccia | F | treccia segmentata lungo la schiena |
| f5 | Chignon basso | F | crocchia sulla nuca |
| f6 | Frangia e lunghi | F | frangia piena, lunghi a scalare |
| f7 | Ricci lunghi | F | volume e cascata di ricci |
| f8 | Pixie | F | corto, ciuffo lungo sulla fronte |

- Come sono fatti (sorgente): `bande([[y, x_dietro, x_davanti], ...])` = profilo a righe interpolato (come il busto), `disco`, `tubo` (code,
  trecce, chignon), poi luce (`toon`), **fili** (ciocche, linee `a`) e **rifl** (riflessi `d`) a mano. Coordinate nel **sistema della testa**
  (x verso il viso, y in basso, 0,0 = angolo di `testa.png`, valori negativi = fuori dalla testa).
- **Attaccatura** (`ATT`): dove i capelli lasciano il viso, riga per riga (diagonale dalla fronte alla nuca). Il **contorno scuro `k` solo
  fuori dalla testa**: sull'attaccatura, contro la pelle, i capelli hanno solo il tono `a` (un contorno nero sulla fronte fa sembrare un berretto).
- I capelli lunghi tengono x <= 4 all'altezza del collo (righe 15+), altrimenti coprono il collo.
- A testa in negativo (cranio spaccato) i capelli si strappano come la pelle.

### Maglie e pantaloni (33 maglie e 23 pantaloni: 3 + 3 base, poi 10 + 10, poi altri 10 + 10, poi 10 maglie cyberpunk)
- Un overlay **per pezzo base** (`busto_sup`, `busto_inf`, `braccio_sup`, `avambraccio`, `coscia`, `stinco`): **stesso canvas e stessa sagoma** del pezzo di
  pelle (il test lo controlla: i pixel dell'indumento sono un sottoinsieme della pelle). Si ricavano dal pezzo (stessa luce, stessi toni),
  tagliati all'orlo (`fino(riga)`: taglia, contorno `k` sul bordo nuovo, ombra `a` sopra) e con i dettagli del tessuto. Il lato lontano (`_sx`)
  usa lo stesso PNG, **un gradino piu' scuro a runtime** (`FAR` in `arena.js`).

| tipo | pezzi | dove finisce | dettagli |
|---|---|---|---|
| maglia **canottiera** | busto_sup, busto_inf | spalline, scollatura davanti; orlo alla riga 13 del busto basso | pieghe sul petto |
| maglia **t-shirt** | + braccio_sup | manica alla riga 12 del braccio | colletto |
| maglia **lunga** | + braccio_sup, avambraccio | polsino alla riga 12 dell'avambraccio (mani scoperte) | piega al gomito |
| pantaloni **corti** | busto_inf (da riga 10), coscia | orlo alla riga 16 della coscia | risvolto, piega del ginocchio |
| pantaloni **tre quarti** | + stinco | orlo alla riga 12 dello stinco | tasca sulla coscia |
| pantaloni **lunghi** | + stinco | orlo alla riga 24 dello stinco (piede scoperto) | cucitura a punti |

**Gli altri 10 + 10** (`maschio_aspetto.px.js`, secondo blocco): stesse regole; dove un pezzo e' uguale a quello di un altro indumento (manica
lunga liscia, busto dei pantaloni lunghi...) il manifest punta allo stesso PNG, e si disegna solo cio' che cambia. Le operazioni (`taglia`, `bordo`,
`riga`, `punti`, `fino`) toccano solo pixel gia' presenti nella pelle: un indumento non puo' uscire dalla sagoma.

| maglie | com'e' | pantaloni | com'e' |
|---|---|---|---|
| polo | colletto e bottoni, manica corta | bermuda | al ginocchio |
| felpa | cappuccio, tasca a marsupio, polsini | cargo | tasche sulla coscia e sullo stinco |
| giacca di pelle | cerniera, bavero | jogger | banda laterale, polsino alla caviglia |
| gilet | senza maniche, cerniera, taschino | leggings | fino alla caviglia, riflessi |
| maglia a righe | righe orizzontali, manica corta | eleganti | piega centrale, cintura |
| dolcevita | collo alto, maniche lunghe | pantaloncini sportivi | cortissimi, banda laterale |
| camicia | colletto a V, bottoni | pinocchietto | sotto il ginocchio |
| maniche a tre quarti | polsino a meta' avambraccio | a zampa | fascia chiara sul fondo |
| top corto | finisce sotto il petto | gonna | pieghe, senza stinco |
| cappotto | lungo, cintura, doppiopetto | jeans con toppe | toppe e strappi (la pelle si vede) |

**Il terzo giro (altri 10 + 10)**, stesso metodo (`pixel(fn)` ritocca ogni pixel con una funzione `(x, y) -> tono`: fantasie a fiori, mimetico, quadri,
gessato, righe imbottite). Un capo puo' avere un `colore` fisso nel manifest al posto di quello preso dalla texture (gli stivali di cuoio).

| maglie | com'e' | pantaloni | com'e' |
|---|---|---|---|
| scollo a V | apertura a V sul petto | pelle | riflessi lucidi, cuciture |
| raglan | cuciture oblique spalla-ascella | mimetici | macchie mimetiche a due toni |
| camicia hawaiana | fantasia a fiori, scollo, bottoni | a quadri | righe orizzontali e verticali |
| bomber | corto in vita con elastico, cerniera, maniche lunghe | gessato | righe verticali sottili |
| tunica | lunga, cintura, maniche a tre quarti | kilt | gonna a quadri sopra il ginocchio |
| corsetto | senza maniche, allacciatura a incrocio | imbottiti | righe orizzontali trapuntate, polsino |
| parka | lungo, cappuccio, cerniera, tasche | harem | larghi, polsino alla caviglia |
| t-shirt strappata | buchi e orlo sfrangiato | cuoio e stivali | **colore fisso marrone**, gli stivali coprono il piede |
| maglia sportiva | senza maniche, bande laterali | con ginocchiere | rinforzi sulle ginocchia |
| cardigan | aperto, bottoni, tasche | strappati | buchi alle ginocchia, orlo sfrangiato |

**Cyberpunk (10 maglie, nessun pantalone)**, in fondo al terzo blocco del sorgente: il neon e' il tono `d` su fondo scuro, le scanalature sono `k` e `a`; il
disegno continua da un pezzo all'altro (`pixel((x, y) => FN(x, y + 19))`). Alcuni hanno un `colore` fisso nel manifest, perche' con un colore a caso perderebbero
cio' che li fa quelli che sono. Anteprima a colori: scene `cyber_anteprima_1` e `_2`.

| maglia | com'e' | colore |
|---|---|---|
| giacca a LED (`led`) | colletto alto, cerniera, due strisce di neon lungo il fianco e sulle maniche | fisso blu notte |
| corpetto tattico (`tattico`) | senza maniche, bretella a tracolla, tasche, cintura | dalla texture |
| impermeabile riflettente (`impermeabile`) | lungo, colletto alto, cintura, bande catarifrangenti sul busto e sulle maniche | dalla texture |
| tuta a circuiti (`circuiti`) | aderente, piste incise con un nodo a ogni capo | fisso ciano |
| corazza con spallacci (`spallacci`) | piastra sul petto, addome a placche, spalline e bracciali (il resto delle braccia e' pelle) | fisso grigio acciaio |
| piumino cromato (`cromato`) | cuciture orizzontali con il riflesso sotto, maniche lunghe | fisso argento |
| maglia a rete (`rete`) | solo i fili in un reticolo a rombi (la pelle si vede in mezzo), colletto e polsini pieni | dalla texture |
| tuta a pannelli (`tuta`) | nera, cuciture dei pannelli, rombo sul petto | fisso nero |
| giubbotto a borchie (`borchie`) | cerniera obliqua, risvolto, borchie sulle spalle e lungo l'orlo | fisso cuoio nero |
| camicia olografica (`olo`) | bande oblique dal buio al lampo, maniche corte | fisso viola |

### Strappi con i danni
`arena.js: disegnaVestiti`. Per un pezzo, `f = (1 - hp/hp_max) / 0.85` limitato a 0..1 (hp della sua **locazione**, come per il sangue):
**a 15% degli hp l'indumento di quella locazione e' tutto strappato** (f = 1). I pixel strappati sono quelli con rango minore (stessa
maschera a ranghi della sez. 11, `rango(lato, nome, 2)`: la quota strappata e' esattamente `f`, e cresce dai punti di ferita); sotto
si vede quello che c'e': pelle con il sangue, poi (in negativo) carne e ossa. I pixel che restano sul bordo di uno strappo scendono di un
gradino di tono (`SCURO`), e sugli stracci compare sangue (soglia `0.85 f`). Le protesi non si strappano.

### Copricapo (5 cappelli e 10 maschere)
- `copricapo_<id>.png`, **stessa tela e stesso offset dei capelli** (32 x 50, `[-10, -10]`), a indici, **sopra i capelli** (ultimo livello della testa).
  Contorno scuro pieno (sono oggetti sopra la testa, non capelli). Nel manifest: `tipo` (`cappello`/`maschera`), `non_con` (capigliature con cui non si
  abbinano: volumi che escono dal cappello, cioe' ciuffo, mohicano, ricci, chignon alto), `nascondi_capelli`, `colore` fisso opzionale.
- Cappelli: cappellino (visiera), berretto di lana (pompon), cappello a tesa larga, elmetto, bandana. Maschere: antigas (filtro), hockey (bianca),
  mascherina chirurgica (azzurra), passamontagna (copre tutta la testa, **nasconde i capelli**, fessura per gli occhi), maschera da ballo.
- **Maschere cyberpunk (5)**: visore cibernetico (fascia sugli occhi con la lente accesa e un'antenna dietro), respiratore a filtri (mascherina con filtro
  tondo sulla guancia, cinghia e tubo che scende sul collo), occhio cibernetico (fascia con una lente grande sull'occhio e un'antenna), casco integrale
  (copre tutta la testa e **nasconde i capelli**, visiera scura), placca cyborg (meta' del viso in metallo con lente e viti). Anteprima: scena `copricapo_cyber_anteprima`.
- Colori: `colore` fisso dove ha senso (antigas, hockey, chirurgica, visore, respiratore, placca cyborg), altrimenti preso dalla texture dei vestiti (tag 9 del seed).
- Assegnazione (`aspetto.py`): il 40% dei personaggi ne porta uno (`PROB_COPRICAPO`), scelto tra quelli compatibili con i capelli; la combinazione
  (capelli, maglia, pantaloni, copricapo) resta unica. I salvataggi di prima ricevono la chiave `copricapo` una volta sola (`completa`, anche `null`).
- Non si strappano, ma **cadono**: quando gli hp della testa scendono sotto il 50% (protesi escluse) il copricapo si stacca e fa il ragdoll (`staccaCopricapo` in
  `arena.js`: parte dalla posa della testa con uno scatto all'indietro e in su, gravita', rimbalzi smorzati, attrito a terra) e resta sul pavimento. Se copriva i capelli
  (passamontagna, casco) i capelli ricompaiono. Se gli hp risalgono (cura) torna in testa. Duello gia' finito: e' gia' a terra.

### Texture dei colori (il seed sceglie i colori)
- `colori_vestiti.png` (151 x 4): **20 sezioni di colore di larghezza irregolare**. Piu' larga = piu' comune (jeans 22, nero 16, grigio 14 ...); la
  piu' stretta, e rara, e' il **bianco** (2 px, circa l'1,3%). Dentro ogni sezione il colore scorre da un po' piu' scuro a un po' piu' chiaro,
  fra due sezioni c'e' una sfumatura di 2 px (e' un *gradiente* a sezioni, non colori piatti).
- `colori_capelli.png` (128 x 4): gradiente continuo di colori **naturali** (nero, castani, rame, biondi, platino, grigio, bianco); le tinte
  comuni occupano molto spazio, le rare (rosso, platino, grigio) poco.
- Campionamento (`arena.js: coloriAspetto`): `u = hash(seed, tag)` -> colonna `u * larghezza`, riga 1. Tag diversi per capelli (con un +-6% di
  luminosita' in piu', cosi' non sono mai identici), maglia e pantaloni; se maglia e pantaloni escono troppo simili (distanza < 55) i pantaloni
  si ricampionano. Il **seed e' l'unica cosa salvata**: ritoccare una texture cambia i colori di tutti coerentemente.
- Da un colore a una rampa (`rampa`): base `b` (limitata a luminosita' 0,15-0,86: ne' nero ne' bianco puri), `a` = 30% verso il nero, `k` =
  62% verso il nero, `c` = 20% verso il bianco, `d` = 42% verso il bianco. Stessi cinque indici del corpo.
- Per cambiare i colori: `SEZIONI` e `STOP` nel sorgente, rigenerare, nessun codice da toccare.

### Chi ha quale aspetto (`aspetto.py`, `app.py`)
- `genera(nome, usati)`: sesso dal nome proprio (`sesso_da_nome`: i personaggi non hanno un campo sesso; `NOMI_FEMMINILI`), capelli adatti al
  sesso, maglia e pantaloni a caso, seed a 32 bit. Cerca una combinazione (capelli, maglia, pantaloni) **non gia' in uso**: ogni personaggio e' unico.
- Dove: i **record del box** (`nuovo_record`, salvato nel record), i **contratti** (diversi dal box e tra loro), i **salvataggi vecchi** (migrazione
  `assegna_aspetti` all'avvio, una volta sola), la **CPU** di ogni duello (`cpu_bilanciata`, diversa dal giocatore), i **16 eroi del torneo**
  (tutti diversi; il campione se lo porta nel box). Il client lo riceve in `pannello()` -> `player.aspetto` / `cpu.aspetto`.
- Il corpo e' ancora solo il maschile: i capelli F stanno sulla stessa testa. Un futuro corpo femminile cambiera' le forme ma i capelli
  restano compatibili se tengono la stessa testa (nomi dei pezzi, giunti, riga di taglio).
- **Anteprima** nelle pagine Box, Contratti e Duelli: ogni carta ha sopra il nome un `<canvas class="anteprima" data-aspetto='{json}'>` che `static/anteprima.js` riempie con `Arena.anteprima(canvas, aspetto)` (`arena.js`, incluso nella pagina): corpo a riposo a scala 2, con pelle, maglia, pantaloni e capelli, stessi sprite e colori del duello; senza fisica. Nuovi pezzi del corpo o nuovi livelli vanno aggiunti anche li'.
- Prova nel laboratorio (`tools/lab/arena.html`): `pg("A", {busto: 40}, [], {capelli: "f2", maglia: "lunga", pantaloni: "corti", seed: 7})`.

## 14. Texture delle ferite, ali, braccia extra, volo e vittoria (`arena.js`, `pupazzo.js`)

### Ferite per tipo di danno
L'engine ricorda quanto danno di ogni tipo ha subito una locazione (`Personaggio.danni_tipo`, solo nel duello; `pannello()` lo manda nel campo
`hp[loc].tipi`). `arena.js: disegnaPelle` disegna uno strato per tipo, **uno sopra l'altro** (si sovrappongono), sopra il sangue:

| tipo | aspetto | note |
|---|---|---|
| contundente, taglio, ... (tutto il resto) | sangue rosso come prima | e' quello che resta: `danno - fuoco - acido - elettrico` (frazioni degli hp massimi) |
| **fuoco** | macchie **nere** (`FUOCO`) | soglia a macchie come il sangue |
| **acido** | verde giallastro con bolle scure (`ACIDO`) | **si applica lentamente: in 3 secondi** (`ACIDO_SECONDI`; `acidoVis` insegue `acidoObj` in `passo()`) |
| **elettrico** | **cicatrice da fulmine** ramificata (`FULMINE`) | rami a zig-zag con sotto-rami da un punto (`fulmine()`), ogni cella ha un ordine: piu' danno = il disegno si allunga dalla radice |

I numeri sono frazioni di `hp_max` (x1,7 per fuoco e acido: una botta da 30 su 100 si vede). Ogni tipo ha la sua maschera di rumore con un seme
diverso, quindi due tipi sullo stesso punto si mescolano. Il contorno `k` non si sporca. Le texture stanno sulla **pelle** (non sui vestiti, che si
strappano per conto loro, sez. 13). A duello gia' avviato, senza ricostruire lo stato, l'acido compare gia' del tutto (niente animazione).

### Ali (potere "Ali")
- `ali_ala.png` (46 x 50, indici, un'ala sola); `aspetto.json` -> `ali`: `perno` (il punto che sta sulla schiena) e `attacco` (pezzo `busto_sup`, punto
  (3, 7) nel pezzo). Si disegna due volte, lontana (piu' scura, `far`) e vicina; il colore e' una tinta naturale schiarita dalla texture dei capelli
  (`U(seed, 7)`): ogni personaggio ha ali diverse.
- Sono dietro al busto (la lontana dietro a tutto) e ruotano attorno al perno: **a riposo rialzate dietro le spalle** (`ALI.riposo`, -1,0 rad: prima erano
  ripiegate in basso e sembravano strane; leggero respiro), **in volo battono** (~1,9 Hz, `voloK` dosa il passaggio). Esistono solo se il potere e' attivo (`pannello().extra.ali`).
- Prova: `pg("A", {}, [], undefined, {ali: true, volo: true})` nel laboratorio; anteprima: scena `ali_anteprima` del sorgente.

### Volo (stance "Volo")
`Pupazzo.volo(true)`: il bacino sale di `T.quotaVolo` (15 px), i piedi si raccolgono (`T.piediVolo`), la molla regge **tutto** il peso e una coppia tiene
dritto il bacino (senza piedi a terra non lo fa nessuno: prima il corpo si piegava in avanti), con un dondolio lento. **In volo non si cammina**: la macchina dei passi non parte
(prima, spinto o in attacco, i piedi continuavano ad alternarsi come camminando) e i piedi penzolano appena dietro le anche. L'ombra si rimpicciolisce da sola.
Un colpo in volo scivola e rientra come a terra; `volo(false)` rimette a terra. Test: `node test_fisica.js`, blocco 2.9.

### Braccia extra (potere "2x2")
`disegnaBraccioExtra`: una **copia di ogni braccio** (stessa fisica, quindi segue il braccio vero), attaccata piu' in basso sul busto e ruotata attorno alla
spalla; pelle, maglia e ferite sono quelle del braccio. Sparisce con il potere (`pannello().extra.braccia`).

### Supervelocita' e Super Forza (effetti visivi legati al rango del potere ATTIVO)
`pannello().extra` porta `velocita` e `forza` = il rango del potere se e' attivo, 0 se no (`Personaggio.rango_potere_attivo`); `arena.js` li legge in `L.extra`.
- **Supervelocita'**: le animazioni del personaggio vanno **+25% per rango** (r1 1,25x, r2 1,5x, r3 1,75x, r4 2x), e tornano normali a potere spento. `avanzaL` fa piu' passi
  di fisica per ogni passo di scena (`VEL_RANGO`) e il disegno interpola sull'intero tratto; gli scambi (attacchi, schivate) partono dal pupazzo, quindi durano di meno da soli
  (un colpo: 55, 44, 37, 31, 28 passi per r0-r4).
- **Super Forza**: **braccia e busto piu' grandi del 18,75% per rango** (r4 = +75%, `FORZA_RANGO`), crescendo e calando con dolcezza. E' solo visivo: tutto cio' che e' di sopra
  al bacino (busto, braccia, ali, braccia extra) si ingrandisce attorno al bacino, che resta fermo, la testa sale col collo senza crescere, le gambe non cambiano. Per non far
  sbagliare i colpi, la mira passa da `forzaPunto`: la mano fisica va dove, ingrandita, tocca la locazione (e l'impatto, le scintille e l'impulso usano il punto che si vede).

### Vittoria (`Pupazzo.esulta`, `arena.js`)
A duello finito, quando gli scambi in corso sono finiti e il perdente e' caduto (o si e' arreso), dopo circa 0,9 s **chi ha vinto esulta** e non smette piu'
(la scena resta li'). Due animazioni, che `arena.js` sceglie su `St.vinto_dal_player` e sugli hp **totali** del vincitore (somma dei `val` / somma dei `max`):
- **`salti`**: braccia al cielo (un po' in avanti: la spalla non le porta dietro la verticale) e saltelli. Sempre, se ha almeno meta' degli hp totali; sotto, a sorte
  (50%) tra questa e l'altra. Un saltello: ci si accovaccia (0,12 s), una spinta sola (`T.saltoV`, circa 11 px di quota), in aria la molla non regge e i piedi
  si raccolgono, poi l'atterraggio (la molla riprende subito e il bacino parte basso, cosi' non rimbalza). Un saltello ogni `T.saltoPer` (0,6 s).
- **`braccio`**: **solo sotto meta' degli hp totali** (e a sorte). Un braccio solo al cielo (il destro, o il sinistro se e' storpio), l'altro che pende lungo il fianco,
  poi la testa si china (circa 40 gradi) e le spalle cedono. Niente saltelli.
- Casi limite: un braccio storpio non si alza; con una gamba storpia, da seduto o in volo alza le braccia ma non salta; senza braccia sane la testa si china
  comunque; la morte (`muori`) cancella la festa; se cadono in due non vince nessuno. Dal laboratorio: `Arena.festeggia("p", "salti" | "braccio")`.
- Prova: `node test_fisica.js`, blocco 2.10.

### Regola generale
Ali, braccia extra e volo dipendono **solo dallo stato attivo** (`extra`): a potere spento le texture extra non vengono piu' disegnate.

## 15. La palestra: oggetti, scena e i nuovi movimenti del pupazzo

La pagina della palestra (`static/palestra.js`) ha in cima una scena (`static/scena_palestra.js`) con gli allievi che fanno quello che hanno in
programma. Riusa i combattenti del ring senza copiarli: `Arena.kit` (in fondo ad `arena.js`) espone quel che serve a una scena con un numero qualunque
di allievi e una tela sua (`apriTela`, `crea`, `applica` = stato di un combattente da un oggetto-personaggio, `avanza` = un passo di fisica, `disegnaCombattente`...).
Il duello continua a funzionare come prima: `applicaPg` e `avanzaL` sono le due funzioni estratte da `update()` e `passo()`, e i semi del rumore
(`semeLato`) restano quelli di "p" e "c". Un combattente puo' stare piu' in alto (`L.dy`, la fila di dietro: chi riposa, studia, guarda).

**Pupazzo, cose nuove** (`pupazzo.js`, prova: `node test_fisica.js` blocco 2.11):
`rilassa(true|false)` = posa di chi non combatte (braccia lungo i fianchi, spalle e testa che cedono, respiro lento); `ciclo("pesi" | "corda", {fase, periodo})` =
un gesto che si ripete finche' non lo ferma `fermaCicli()` (pesi: dal petto sopra la testa con le ginocchia che lavorano; corda: un saltello per giro, atterra
morbido); `inCiclo()`. Le camminate lunghe non ci sono: il passo del pupazzo e' fatto per rientrare di pochi px, quindi in scena chi cambia postazione si dissolve e
rientra (0,2 + 0,3 s).

**Oggetti** (`tools/sprites/palestra.px.js`, 16 sprite). A differenza dei combattenti NON sono a 5 grigi-indice ricolorati dal gioco: hanno i colori veri (palette sobria e
fredda), contorno `k`, luce da davanti-in alto come il resto. Un pixel = una scala intera (2 px schermo). Rigenerarli:

```
PXL build tools/sprites/palestra.px.js --out <cartella temporanea>
python tools/sprites/palestra_manifest.py <cartella temporanea>
```

`palestra_manifest.py` copia i PNG in `static/sprites/palestra/` e scrive `oggetti.json` (dimensioni e **perno**: `fondo` = il centro del bordo basso, per cio' che sta per
terra; `alto` = per cio' che e' appeso, cioe' sacco, lampada, targhe; `centro` = il bilanciere in mano). Se uno sprite manca la scena disegna un segnaposto. Per aggiungere un
oggetto: disegnarlo in `palestra.px.js`, aggiungerlo a `PERNO` in `palestra_manifest.py`, e piazzarlo in `scena_palestra.js` (`oggettiMuro` / `oggettiPavimento`).

**Come si prova.** `python tools/demo_palestra.py` apre una palestra piena su una cartella temporanea (porta 5057). Nel browser di prova `requestAnimationFrame` non gira: dalla
console `ScenaPalestra.galleria()[0].passi(300)` fa avanzare e ridisegna la scena.


## 16. Fasciature (la palestra non mostra sangue: mostra la garza)

In palestra chi e' ferito non ha sangue, pelle strappata ne' carne in vista: ha una **fasciatura**. E' un overlay per pezzo come i vestiti (sez. 8 e 13), nel `static/sprites/maschio/`:
`fascia_testa`, `fascia_busto_sup`, `fascia_busto_inf`, `fascia_braccio_sup`, `fascia_avambraccio` (braccio e pugno: come le bende da boxe, il polso resta scoperto), `fascia_coscia`,
`fascia_stinco` (il piede no). Sorgente: il blocco in fondo a `tools/sprites/maschio_aspetto.px.js` (`fascia()`, `garza()`: giri diagonali, il lato in ombra e quello in luce del corpo si leggono
ancora); dichiarate in `aspetto.json` -> `fasciature` (`colore` crema, `pezzi`). A 5 grigi-indice come il resto: arena.js li ricolora col crema (`rampa`), `far` per l'arto lontano.

**Come si vedono** (`arena.js`: `applicaPg(lato, pg, primo, inPalestra)`, `disegnaFascia`): `g` = gravita' della locazione (`1 - hp/max`, 1 se storpia o in negativo, 0 per le protesi).
Sotto `FASCIA_MIN` (10%) niente; sopra, la garza copre **una fetta della locazione, piu' larga quanto piu' grave** (30% del suo sviluppo a 0, tutto a 1; continua tra i due pezzi di un
arto: coordinate dello sprite intero) e dal 40% in giu' di hp compaiono **macchie di sangue** sulla garza. Gli arti storpi restano storpi (la posa) ma fasciati. In palestra i vestiti restano
interi e il cappello al suo posto. Il duello non cambia (`inPalestra` e' falso).
Prova: `node test_fisica.js` (sagome); a occhio: demo della palestra (`python tools/demo_palestra.py`) e `ScenaPalestra.galleria()[0].passi(200)`.
Ricostruire: `PXL build tools/sprites/maschio_aspetto.px.js --out <tmp>` e copiare `fascia_*.png` in `static/sprites/maschio/`.


## 17. Cappotti con la falda staccata (trench e dieci cyberpunk)

Un cappotto ha il busto e le maniche come ogni maglia (overlay per pezzo, `pezzi` in `aspetto.json`) **piu' una falda**: un pezzo staccato del modello che scende sul
bacino e sulle cosce fino a dove vuole il cappotto, senza far parte delle gambe. Nel manifest e' la chiave `falda` della maglia: `{file, pezzo: "busto_inf", offset, perno}` (`offset` =
angolo alto-sinistra della falda nel sistema del busto basso, sempre riga 13; `perno` = dove si appende, in cima). Sprite a indici come il resto; il disegno e' `arena.js: disegnaFalda`.
- **Movimento.** E' un pendolo smorzato appeso al busto basso (`avanzaL`): se il corpo avanza si scosta all'indietro, poi ondeggia e si assesta; in volo si alza un poco. Sta sopra le gambe e sotto le braccia.
- **Danni.** Si strappa con i danni del **busto**, come il resto del cappotto ma **dall'orlo in su** (`rangoFalda`, `disegnaVestiti`), con il sangue sugli stracci.
- **I cappotti** (`maschio_aspetto.px.js`, blocchi "TRENCH" e "DIECI CAPPOTTI CYBERPUNK"; `falda(id, {w, h, riga, hem, forato, dett})`: `riga(y)` = estremi della riga, `hem(x)` = dove finisce la colonna, `forato(x, y)` = i buchi):
  `trench` (base, al ginocchio), `trench_neon` (dritto, al polpaccio, bordi al neon), `trench_asimm` (orlo in diagonale), `trench_corto` (giubbotto lungo), `trench_coda` (coda di rondine),
  `trench_manto` (mantello a campana, pieghe a raggiera), `trench_frange` (strisce di lunghezze diverse), `trench_piastre` (gonna di tre piastre coi cavi in mezzo),
  `trench_strascico` (spolverino che dietro trascina), `trench_aderente` (a matita fino alla caviglia, con spacco), `trench_zigzag` (orlo a dente di sega, piste di circuito).
  Colori fissi nel manifest per i piu' (`colore`). Per un cappotto nuovo: una `falda(...)`, i due overlay del busto, e la voce in `aspetto.json` (con `falda`).
- Test: `node test_fisica.js` (la falda sta nella tela, a indici, appesa al busto basso). Anteprima: scena `trench_cyber_anteprima`.
