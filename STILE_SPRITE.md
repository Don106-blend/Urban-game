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

Ogni personaggio ha un **aspetto**: `{"sesso", "capelli", "maglia", "pantaloni", "seed"}`. Capelli, maglia e pantaloni sono overlay
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

### Maglie e pantaloni (3 + 3)
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

### Strappi con i danni
`arena.js: disegnaVestiti`. Per un pezzo, `f = (1 - hp/hp_max) / 0.85` limitato a 0..1 (hp della sua **locazione**, come per il sangue):
**a 15% degli hp l'indumento di quella locazione e' tutto strappato** (f = 1). I pixel strappati sono quelli con rango minore (stessa
maschera a ranghi della sez. 11, `rango(lato, nome, 2)`: la quota strappata e' esattamente `f`, e cresce dai punti di ferita); sotto
si vede quello che c'e': pelle con il sangue, poi (in negativo) carne e ossa. I pixel che restano sul bordo di uno strappo scendono di un
gradino di tono (`SCURO`), e sugli stracci compare sangue (soglia `0.85 f`). Le protesi non si strappano.

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
- Prova nel laboratorio (`tools/lab/arena.html`): `pg("A", {busto: 40}, [], {capelli: "f2", maglia: "lunga", pantaloni: "corti", seed: 7})`.
