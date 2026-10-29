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
| Disegno nel duello, sangue, ricolorazione | `static/arena.js` |
| Fisica dei corpi (scheletro, muscoli, ragdoll) | `static/fisica.js`, test: `node test_fisica.js` |
| Stili dell'arena | fondo di `static/style.css` (blocchi "arena" e "colonna centrale") |

Rigenerare i PNG (da `tools/sprites/`, `PXL` = `node <skill pxl>/bin/pxl.js`):

```
PXL build tools/sprites/maschio_base.px.js --out <cartella temporanea>
```

poi copiare `<out>/sprites/*.png` in `static/sprites/maschio/`. La scena `assemblato` (48x111) e lo sheet
`parti` servono a controllare a occhio: ingrandirli senza griglia (Pillow, `Image.NEAREST`, x4-x6) prima di
giudicare. Non usare lo `_preview` di pxl per giudicare le proporzioni: la griglia inganna.

## 2. Vista e canvas

- **Profilo, rivolto a destra.** Per far guardare a sinistra si specchia (CSS `scaleX(-1)`): **mai** disegnare
  una versione "sinistra" a mano.
- Canvas dell'omino assemblato: **48 x 111 px**. I pezzi vivono in questo spazio; le coordinate sono pixel
  dello sprite, non dello schermo. In gioco si ingrandisce di una **scala intera** (`--s`, 1-4, scelta da
  `arena.js` in base all'altezza dell'arena); mai scale frazionarie (pixel sbavati).
- Niente antialiasing, niente trasparenze parziali: pixel pieni o vuoti. Sul canvas
  `image-rendering: pixelated`.

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
- **Regola di posa**: `transform = translate(da) rotate(theta) translate(-perno)` con
  `theta = angolo(a - da) - angolo(a_riposo - da_riposo)`. A riposo `theta = 0` e ogni pezzo sta in
  `da - perno`. Un nuovo pezzo/overlay che segue un osso usa lo stesso `perno` del suo pezzo.
- Z-order a riposo (basso -> alto): braccio lontano, gamba lontana, gamba vicina, busto (sup, inf), testa,
  braccio vicino.

## 8. Customizzazione (overlay) — come aggiungerli senza rompere nulla

Idea di riferimento: *The Binding of Isaac* — il corpo base resta, sopra si impilano livelli che dipendono da
poteri/oggetti; ogni personaggio e' generato proceduralmente cambiando colori e livelli.

1. Un overlay e' **un PNG per pezzo**, nel **sistema di coordinate locale del pezzo** (origine = angolo in alto
   a sinistra del PNG del pezzo). Stessa dimensione del pezzo, oppure piu' grande con un offset dichiarato
   (capelli, cappelli, ali) — l'offset e' relativo al pezzo e ruota con lui.
2. Si disegna **dentro lo stesso elemento** del pezzo (un altro canvas sopra), cosi' eredita posa, rotazione,
   flash di colpo e specchio. Mai posizionarlo in coordinate del canvas intero.
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

`arena.js: disegna()`. Rumore a macchie (value noise, scala 3 px) + puntini, calcolato sulle coordinate dello
sprite **intero** (`y0`), cosi' le due meta' di un arto sono continue. Soglia `0.1 + 0.9 * danno` con
`danno = 1 - hp/hp_max` della locazione. Il tono segue quello sottostante (`a`->scuro, `b`, `c`, `d`->chiaro);
dove la soglia e' superata di 0.35 diventa il tono piu' scuro (coaguli). Il contorno `k` non si sporca.
Le locazioni con protesi non sanguinano.

## 10. Fisica: come si muove lo scheletro (`static/fisica.js`)

Lo scheletro e' la stessa lista di **giunti** del manifest, trattata come particelle (verlet): ogni pezzo e' un
osso `da -> a`, quindi **qualunque sprite o overlay appeso a un osso segue la fisica senza altro lavoro**.

- Ossa rigide; bacino (`vita, anca, anca_dx, anca_sx`) e parte alta del busto (`vita, collo_alto, spalle`) sono
  corpi rigidi incernierati in vita. Cerniere: ginocchio piega in avanti, gomito indietro.
- **Muscoli**: molle PD verso una posa bersaglio (bacino e piedi piantati, busto e testa sopra la vita vera,
  braccia penzoloni, ginocchia/gomiti da IK). Sono *molli* di proposito (periodo ~0,5-1,5 s): un colpo si vede.
- **Colpo** = impulso di velocita' sulla locazione colpita, proporzionale al danno (`0,15 + 0,02 * hp`, max 3 px/passo):
  la testa scatta, il busto si piega, la gamba si solleva. Poi i muscoli riportano in piedi. Mai a terra da vivi.
- **Locazione storpiata** (`crippled`): i muscoli di *quella* locazione si spengono e fa il ragdoll da sola. Una
  gamba sola: sta in piedi sull'altra. Due gambe: il bacino scende a terra e le braccia sane si puntellano
  (`seduto`). Senza arti: a terra.
- **Morte** (testa o busto a 0): tutti i muscoli spenti, spinta all'indietro; resta distesa. Una resa non uccide.
- Convenzioni: `-x` = indietro (la CPU e' specchiata dal CSS, quindi vale per entrambi); pavimento a y = 111;
  raggi di contatto in `RAGGIO` (la caviglia ha il piede sotto); passo fisso 1/60 s.
- Un nuovo corpo con gli stessi nomi di giunti/ossa funziona senza toccare la fisica; se cambiano le lunghezze delle
  ossa, ricontrollare `ARTI`/`MUSCOLO` in `fisica.js` e rifare girare `node test_fisica.js`.

## 11. Errori gia' fatti (non ripetere)

- Corpo frontale e tozzo: richiesto di profilo e sottile.
- Nome di classe CSS `.flash`: gia' usato dai messaggi di sistema (bordo giallo sui pezzi). I pezzi usano `.lampeggia`.
- Giudicare dalla `_preview` con griglia di pxl: ingrandire con Nearest, senza griglia, su fondo grigio chiaro.
- Cambiare l'altezza dell'arena in base ai menu: la zona dei combattenti e' **statica** (vedi `style.css`).
- Il browser di prova non esegue `requestAnimationFrame` (il ciclo della fisica non gira) e lo screenshot puo'
  mostrare un fotogramma vecchio: far avanzare la simulazione con `Arena.passi(n)`, poi fare **due** screenshot
  (o leggere le `transform` dei pezzi). La taratura vera si fa in Node con `test_fisica.js`.
