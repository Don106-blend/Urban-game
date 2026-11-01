# Cyberware — niente più armi e armature

Rework dell'equipaggiamento (2026-11-01). Armi e armature erano un sistema a parte (2 slot arma, 1 armatura, nessun costo) in un gioco che
aveva già protesi, augment e Umanità: ora **tutto l'equipaggiamento è cyberware**. I dati si ricreano con `tools/fase7_cyberware.py`
(idempotente), la logica sta in `app.py` (`_controlla_equip`, `_equipaggia`, `migra_cyberware`, rotte `/negozio/*`), la pagina in
`templates/negozio.html` e `static/style.css` (blocco "il negozio del cyberware"); i test con `python test_cyberware.py`.

## 1. La conversione

Stesso effetto in combattimento e stesso prezzo di listino; in più, ora ogni pezzo occupa un posto nel corpo e **costa Umanità**.

| Prima | Dopo | Tipo | Umanità | Prezzo |
|---|---|---|---|---|
| Pistola | **Braccio-cannone** | protesi, braccio sinistro (120 hp, mai CRIPPLED) | 2 | 500¤ |
| Spada | **Lama monomolecolare** | augment passivo (sblocca taglio e affondo) | 1 | 150¤ |
| Casco da lotta | **Calotta in titanio** | augment passivo: +15 hp armatura sulla testa, −10% contundenti | 1 | 150¤ |
| Giubbotto antiproiettile | **Sottopelle balistico** | augment passivo: +50 hp armatura sul busto, −20% perforanti | 2 | 200¤ |
| Armatura da combattimento | **Esoscheletro da combattimento** | augment passivo: +10 hp per locazione, −8% contundenti, stance Corazza | 4 | 600¤ |

Cambiamenti di regole che ne vengono:
* **Le armature si sommano**, non c'è più «un'armatura sola»: il limite è l'Umanità (`(Mente + Sociale) × 2`, e un colloquio ben riuscito ne ridà un punto).
  Per questo Mente e Sociale diventano una scelta di build: chi vuole più impianti deve crescerle.
* **L'EMP li spegne**: gli impianti passivi sono augment, quindi un EMP toglie armature, resistenze e Lama finché dura (poi si riaccendono da soli,
  come prima per Placche Sottocutanee). Il Braccio-cannone, come ogni protesi, resta bloccato per la durata dell'EMP.
* **Una protesi per locazione, ma si può sostituire**: montarne una dove ce n'è già una manda la vecchia in magazzino (gratis da rimontare).
* **Chi se ne va lascia tutto in magazzino**: congedo, ritiro a istruttore e morte rimettono in magazzino protesi *e* augment (prima le protesi restavano
  sul corpo di chi lasciava la palestra).
* Le CPU, i rivali e gli eroi del Torneo comprano dallo stesso catalogo con gli stessi vincoli (una protesi per locazione, Umanità finita).
* Un `armatura` degli augment accetta una `locazione` (default `tutte`): un giubbotto copre solo il busto. L'editor la conserva (campo «Locazione»).

## 2. I vecchi salvataggi

`migra_cyberware` (all'avvio) converte ogni record con `armi` / `armatura_equip` / `equip`, il magazzino, gli aspiranti e i rivali:
* il vecchio oggetto diventa il nuovo (tabella `LEGACY_EQUIP`);
* se **non ci sta** (Umanità finita, posto occupato) finisce **in magazzino**, per gli allievi: niente si perde; per aspiranti e rivali si scarta;
* è idempotente (una seconda volta non cambia niente).

## 3. Il negozio (UI)

Prima: una lista di carte, ognuna con un menu a tendina per scegliere a chi dare l'oggetto e un bottone «Compra».
Ora **si parte dall'allievo e dal suo corpo**, come nella palestra (ritratti, tab, pallini):

* **Chi potenzi** (sinistra): gli allievi con ritratto, numero di impianti e Umanità a pallini. Un clic cambia allievo e mantiene i filtri.
* **Il corpo** (centro): la sagoma dell'allievo con i cinque posti per le protesi attorno (testa, braccia, gambe), ognuno con la protesi montata o «+ Protesi»,
  gli impianti interni (augment), l'Umanità libera e, se è ferito, il Medikit. Ogni impianto si toglie con ✕ (va in magazzino).
  Cliccando un posto il catalogo si filtra sulle protesi di quel posto.
* **Il catalogo** (destra): filtri Tutto / Protesi / Augment / Magazzino. Ogni scheda ha nome, tipo, costo in Umanità, prezzo, descrizione, etichette degli effetti
  e **un solo bottone**, già per quell'allievo: «Installa su Marta», «Sostituisci Braccio-cannone su Marta», «Monta su Marta · gratis»; se non si può,
  il bottone è spento e dice perché («Umanità insufficiente (servono 4, liberi 3)», «Crediti insufficienti», «è già installato»).
* Gli **attrezzi della palestra** sono un'altra scheda (tab). Dopo ogni azione si resta sulla stessa schermata (stesso allievo, stessi filtri).
* Sotto 1100px le tre colonne diventano una: la fascia degli allievi scorre di lato, poi corpo e catalogo. La scheda personaggio ha un link «Potenzia nel negozio →».

## 4. Misure

`python balance.py equip` (M5, oggetto contro eroe nudo, n=2000, seed 5), prima → dopo:

| | Prima | Dopo |
|---|---|---|
| Spada → Lama monomolecolare | 59% | 59% |
| Casco → Calotta | 61% | 61% |
| Giubbotto → Sottopelle | 60% | 59% |
| Armatura da combattimento → Esoscheletro | 66% | 65% |
| Pistola → Braccio-cannone | 52% | 51% |
| (nuova) Gamba corazzata | — | 63% |

Le metriche M5 fuori fascia sono le stesse di prima (Pistola/Cannone, Scudi, EMP, Reattore: non toccate da questo lavoro). Matchmaking (M9, L5 senza equip contro la CPU):
47% → 48%, in fascia; a livelli alti la CPU è un po' più forte (L12 40% → 38%, L16 41% → 35%) (la causa più probabile: le armature ora si sommano; non l'ho isolata con una misura).

## 5. Limiti e ganci

* Ogni posto ha **una sola protesi** (testa, braccio dx, braccio sx, gamba sx, gamba dx: la **Gamba corazzata**, 300¤, Umanità 1, 250 hp e stance Barriera sempre attiva, 63% in M5): la sostituzione c'è già ma ha senso solo quando ci saranno alternative per lo stesso posto.
* Il Braccio-cannone, come la Pistola di prima, sta appena sotto la fascia M5 (51%).
