# Urban — Overhaul del gameplay (prompt principale)

> **Cos'è.** Brief per un overhaul completo del combattimento, pensato per essere dato a un agente (Claude Code) come prompt principale. Contiene: missione e regole di lavoro, come funziona oggi il gioco, diagnosi **misurata**, soluzioni a fasi con valori di partenza già provati, criteri di accettazione e le cose da non fare.
> **Come è stato misurato.** Il 2026-10-28, sul commit `0f51b9d`, facendo giocare il vero `DuelloWeb` da due IA su una copia isolata del progetto (mai su `save/`). Salvo diversa indicazione: 1.500–3.000 duelli per cella (errore ≈ ±2 punti). "win" = % di vittorie del primo lato. I numeri di riga si riferiscono a quel commit.

---

## 1. Missione

Rendere i duelli **più decisionali, più brevi e più equilibrati** senza snaturare il gioco. Oggi un duello tra eroi pari dura 13 round (mediana), si decide quasi sempre per fortuna sulla testa (92% delle morti), un rango in più su tutte le statistiche vale una vittoria quasi certa (92%) e pochi oggetti/poteri valgono più di tutto il resto. L'obiettivo non è aggiungere sistemi: è far sì che ogni turno abbia scelte vere e che nessuna fonte di potenza (rango, potere, oggetto) schiacci le altre.

**Regole di lavoro**
1. Lavora **per fasi** (§6). Una fase = un blocco di commit coerente. Non iniziare la successiva finché la precedente non rispetta i suoi criteri (§3).
2. **Misura prima e dopo.** I valori "di partenza" di questo file sono provati ma non definitivi: il harness (§11) decide quelli finali. Aggiorna la tabella §3 a ogni fase.
3. **Il cambiamento più piccolo che sposta la metrica vince**: prima costanti e dati JSON, poi poche righe di regola, solo per ultime le meccaniche nuove. Segna le scorciatoie volute con `# ponytail:` (convenzione già usata nel codice) indicando il limite e come superarlo.
4. **Non toccare `save/`** (dati reali dell'utente: personaggi, crediti, feedback). Test e harness usano una cartella temporanea (Fase 0.4). Non fare commit né push se l'utente non lo chiede.
5. **Compatibilità**: `save/state.json` deve continuare a caricarsi. Nessun cambio di schema dei record; campi nuovi opzionali con default.
6. **Stile**: codice e nomi in italiano, docstring brevi che spiegano il *perché*, nessuna nuova dipendenza, test nello stile esistente (`python test_combat.py`, asserzioni in `main()`, nessun framework).
7. **Tienilo allineato**: ogni campo nuovo nei JSON va esposto in `editor.py` (§10) e ogni costante di regola mostrata in UI deve venire dal server, non essere scritta a mano in JS.

**Visione: come deve sentirsi un duello (~7 round).** Apertura: stance/potere, si studia la scelta di bersaglio. Centro: ogni turno con 2 azioni si sceglie tra due colpi leggeri, un colpo pesante, una mira, un potere; chi difende vede il tiro d'attacco e decide se bruciare l'unica risposta adesso o tenerla per il secondo colpo. Chiusura: un colpo ben piazzato (testa/busto) o un'ultimate con cooldown chiude il duello; una rimonta è possibile ma non regalata.

---

## 2. Come funziona oggi (fatti verificati)

| Area | Regola attuale | Dove |
|---|---|---|
| Risorse per turno | 1 azione, 1 bonus, 1 risposta. Round a turni alternati; ordine da tiro di riflessi. | `engine.py:126-128`, `app.py:526-545` |
| Tiro | `d10 + BONUS_RANGO[rango]`, con `{1:0, 2:3, 3:6, 4:9}`. Rango effettivo 1–4. | `engine.py:15-16, 200-205` |
| Colpire | Un solo tiro contrapposto: attacco (skill) contro la risposta scelta dal difensore **dopo aver visto il tiro d'attacco**. **Il pareggio va al difensore** (`colpito = td < ta`). | `app.py:694-736, 749-828` |
| Risposte | `nessuna risposta` (riflessi, gratis); `parata` (armi_corpo_a_corpo, solo mischia: se perde il danno si dimezza e **il difensore sceglie dove incassare**); `schivata` (acrobatica, nega tutto). Consuma l'unica risposta del round. | `app.py:749-795` |
| Danno | `flat` dell'attacco + margine `min(ta−td, 8) × 2` (≈ +7 di media). Locazione fissata a inizio attacco (casuale o mirata). | `engine.py:20-21`, `app.py:796-797` |
| Locazioni/HP | testa 50, busto 150, 4 arti da 100. Sconfitto se testa **o** busto ≤ 0. Arto ≤ 0: l'eccesso va metà all'arto e metà alle altre locazioni; arto ≤ −max: CRIPPLED. | `engine.py:23-24, 295-357` |
| Mira | Costa l'azione (il bonus con Supersoldato); **+4** al tiro del difensore; consumata dal primo attacco. | `app.py:703, 972-981`, `engine.py:228-241` |
| Armatura/resistenze | HP extra per locazione assorbiti per primi; resistenze **flat** per tipo di danno (`rid = min(res, danno)`); immunità; debolezze +50%. | `engine.py:287-293, 307-311` |
| Stamina | Max `(fisico+riflessi+mente) × 2`, **nessuna rigenerazione**. Ogni potere attivo drena `rango`/turno; a zero si spengono (il più costoso prima) e con loro armatura, attacchi e stance concessi. | `engine.py:244-248, 456-481, 848-910` |
| Poteri | 20, rango max 4; sbloccano attacchi/stance per rango. 1 azione per attivare, 1 bonus per spegnere. Il rango non supera `controllo`. Un attacco con `sostituisce` **rimuove** quello sostituito. | `engine.py:727-910`, `app.py:644-664` |
| Stance | 31; una sola manuale alla volta; modificatori in "pip" sul tiro (±1…±5). | `engine.py:92-109, 548-618` |
| Kit base | Solo **Pugno** (35 contundente) + stance Difensivo/Aggressivo/Taunt (`attivo_default`). | `engine.py:913-919` |
| Danni nei dati | 50 attacchi da 7 a 425 (Lanciafiamme, sbloccato da Pirocinesi r3). | `data/attacks.json` |
| Progressione | XP per livello `1000×1.2^(L−1)`; 300 XP vittoria / 100 sconfitta; 1 Token/livello; rango 1→2→3→4 costa 1/2/4 Token. | `app.py:156-192, 1443-1449` |
| Economia | 300¤ iniziali, +150¤/vittoria. Pistola 500, Armatura 600, Giubbotto 200, Spada 150, Casco 50, medikit 30, contratto `50+15·Σstat+60·poteri`. | `app.py:22-27, 262`, `data/*.json` |
| CPU | `cpu_bilanciata`: eroe base + Token casuali + equip casuale con probabilità crescente col livello. IA `cpu_step` regolata da `PROFILO` (aggiornato dai survey). | `app.py:361-458, 850-908` |
| Modalità | Arena (box, contratti, negozio, duelli, scommesse, sponsor, hype) e Torneo Evo (16 eroi, draft di potere/stat/oggetto a ogni round vinto). | `app.py:1105-1330` |

---

## 3. Diagnosi misurata e criteri di accettazione

| ID | Metrica | Oggi | Dopo Fase 1 (provato) | Target finale |
|---|---|---|---|---|
| M1 | Durata di un duello pari (stat e skill 1, solo Pugno): mediana / p90 round | 13 / 25 | 7 / 14 | mediana 6–8, p90 ≤ 14 |
| M2 | P(colpire) a ranghi pari | 45% | 45% | 45% (non toccare) |
| M3 | Vittoria con +1 / +2 / +3 ranghi su tutte le stat e skill | 92 / 99 / 99% | 68 / 84 / 91% | 68–75 / 82–88 / 90–94% |
| M4 | Mira sempre (poi attacca) contro chi non mira: testa / busto | 27 / 3% | 57 / 18% | testa 55–62%, busto ≥ 35% (dopo Fase 2) |
| M5 | Oggetto contro nudo, ranghi pari: Pistola / Spada / Casco / Armatura da combattimento | 89 / 48 / 98 / 80% | 75 / 49 / 78 / 67% | ognuno 58–72%, crescente col prezzo |
| M6 | Potere contro il campo (round-robin, ranghi pari) | 34–82% (r1), 21–84% (r3) | non misurato | ogni potere 44–58%, peggior matchup ≥ 30% |
| M7 | Duelli (pari) decisi dalla testa | 92% | 91% | indicatore: ≤ 75% dopo Fase 2 |
| M8 | Rimonta: chi è avanti di ≥ 10 punti hp al round 3 vince | 66% | 62% | 58–68% (**non** aggiungere meccaniche di rimonta) |
| M9 | Eroe di livello L senza equip contro la CPU di pari livello (L5) | 27% | non misurato | 42–50% |
| M10 | Eccezioni / duelli non finiti su 100.000 duelli simulati | `KeyError` ricorrente / 0 | – | 0 / 0 |

### Cause, con l'evidenza

1. **Pochissime decisioni.** Un eroe nuovo ha un solo attacco di base; finché non attiva il potere il suo turno è "Pugno". La mira costa l'unica azione. Le stance valgono ±1 su un d10 con salti di rango da 3 pip, quindi quasi nulla. La risposta non è mai scarsa: 1 attacco per round contro 1 risposta per round.
2. **Scala dei ranghi a muro.** Con +3 pip a rango su un d10, P(colpire) è 45% a pari, **72%** con +1 rango, 90% con +2, 99% con +3 (e speculare: 21%, 6%, 0%). Su un duello intero +1 rango su tutto vale **92%** di vittoria. Non esistono sfide "quasi alla pari" tra livelli diversi, e le quote delle scommesse non possono pagare un'impresa che non accade mai.
3. **Il potere di un potere è il danno del suo primo attacco.** A rango 1 la classifica contro un eroe nudo segue quasi esattamente il danno del primo attacco sbloccato (Pelle Invincibile → *Pugno rinforzato* 170: 87%; Telecinesi 128: 82%; Appendici Affilate 128: 76%; Pirocinesi *scintilla* 42: 47%; Assemblatore 7: 45%; Supersoldato nessun attacco: 38%). L'armatura di Pelle Invincibile non c'entra: provando 20/30/45/60 invece di 55/170/575/1450 la vittoria resta 82–87%.
4. **Un solo potere domina il campo.** Round-robin a ranghi pari: Pelle Invincibile 82% (r1) e 84% (r3) di media contro tutti, peggior matchup 65–72%; in fondo Supersoldato 34%/21%, Assorbi Energia 36%/24%, Campo di forza 41%/26% (r1/r3).
5. **Resistenze flat contro danni flat = interruttore.** Il *Casco da lotta* (50¤: 25 armatura + 25 resistenza contundente sulla testa) fa vincere il **98%** contro un eroe nudo, perché il Pugno fa 35: 10 danni netti sulla locazione che uccide. In percentuale lo stesso Casco scende al 77%.
6. **Danni senza scala.** 35 (Pugno) → 180 (Pistola) → 425 (Lanciafiamme), rapporto 12×. La Pistola da sola dà l'**89%** a pari rango; un nudo di rango 4 batte comunque una Pistola di rango 1 al 91%. I danni *split* sopra 300 uccidono dalla testa da soli (`425 // 6 = 70 ≥ 50`): Lanciafiamme (nessun cooldown) e Lanciarazzi.
7. **La testa (50 hp) è l'unica via di morte praticabile**: il 92% delle sconfitte di un duello pari. La locazione è casuale (1/6 per colpo): la partita si decide su due colpi fortunati.
8. **La mira è una trappola.** +4 su un d10 porta la probabilità di colpire da 45% a 15%. Mirare sempre alla testa contro chi non mira: circa **28%** di vittoria (busto 3%; con la Pistola 20–22%). Solo con mira gratuita (Supersoldato) sulla testa si arriva al 59%.
9. **Durata e dispersione.** Duello pari: mediana 13 round, p10 = 4, p90 = 25. Nei duelli reali registrati (38, esclusi i "test automatico") mediana 8, massimo 29, 9 oltre i 15 round. Commento del giocatore: *"troppo lungo, troppo rng"*; un altro: *"non mi ha fatto danni"*. Il survey dà "divertente" nel 58% dei casi (18/31).
10. **CPU e matchmaking.** Contro la CPU di pari livello un eroe senza equip vince il 45% (L1), 37% (L3), **27% (L5)**, ~29% (L8–16): a L5 l'80% delle CPU ha un'arma, il 49% un'armatura e il 100% protesi o augment. Inoltre `save/cpu_profile.json` è saturo (`potere_subito 0.95, mira 0.95, stance 0.95, aggressivita 0.9, bias_matchmaking +20` contro i default 0.8/0.35/0.5/0.7/0): le caselle "positive" non spuntate (mira corretta, parti critiche, poteri corretti, stance corrette) contano come giudizio negativo e spingono le manopole; il bias è globale (+20 = CPU di 4 livelli sopra a *tutti* i personaggi). Nel save, due personaggi di livello 2–3 sono a 3/13 e 2/13 di vittorie.
11. **Difetti** (Fase 0): crash su danno nel tempo, attacco sostituito senza ripiego, stance con segno o valore sbagliato, test che scrivono nel salvataggio reale.

**Cosa NON è un problema (misurato).** (a) *Dadi nel danno*: sostituire il Pugno fisso da 35 con `2d10+24` o `1d20+24` (stessa media) non cambia la dispersione della durata (deviazione standard 8,5 → 8,3 round a 1 azione; 5,2 → 5,4 a 2 azioni). La varianza viene dal tiro per colpire e dalla locazione, non dal danno. (b) *Rimonta*: chi è avanti di ≥ 10 punti hp al round 3 vince il 62–66%: già sana. (c) *Vantaggio di iniziativa*: 52–53%, trascurabile.

---

## 4. Da preservare

La locazione come sistema di morte (testa/busto) e lo spillover degli arti; il tiro contrapposto singolo con difensore che vede il tiro d'attacco; la **parata che sposta il danno su una locazione scelta**; il modello dati (poteri → attacchi/stance/effetti per rango, `per_rango`, `revert`); stance, effetti nel tempo, augment/protesi/EMP/umanità; la stamina come limite ai poteri; il **draft del Torneo Evo** (è la parte con più feedback positivo: *"FINALMENTE HO VINTO UN TORNEO"*); il meta-livello Arena (scommesse, sponsor, hype); contenuto in JSON modificabile dall'editor.

---

## 5. Principi di design

1. Ogni turno offre **≥ 3 opzioni non dominate**; nessuna è sempre la migliore.
2. **Un rango è un passo percepibile, non un muro**: +1 rango ≈ 70% di vittoria, non 92%.
3. La fortuna sta nel *tiro*, la scelta sta nel *dove* e nel *quando*.
4. Ogni potere e oggetto ha un **ruolo** (burst, tank, controllo, mobilità, utility) e una **fascia di potenza** misurata (§3 M5, M6).
5. La potenza di un attacco dipende dal suo *slot* (rango di sblocco, cooldown, usi), non dall'autore che l'ha scritto.
6. Ogni modifica è misurata prima e dopo; ciò che non sposta una metrica non entra.

---

## 6. Piano a fasi

Ordine per rapporto effetto/costo. Le fasi 0–1 sono quasi solo costanti e correzioni.

### Fase 0 — Correzioni (nessun cambio di regole)

**0.1 Crash su danno nel tempo con locazione sparita.** `engine.py:415` usa `loc = e.get("loc") or random.choice(...)`: se la locazione memorizzata nell'effetto non esiste più (arto extra di Ali/2x2 rimosso allo spegnimento del potere), `applica_danno` fa `KeyError` a `engine.py:332` e la richiesta HTTP muore a metà duello. Riprodotto: effetto `danno` con `loc="ala_sx"` su un `Personaggio` senza quella locazione; ricorrente nei round-robin con 2x2. Fix di una riga: `loc = e["loc"] if e.get("loc") in self.hp else random.choice(list(self.hp))`. Aggiungere il test.

**0.2 Attacco sostituito senza ripiego.** Con Super Forza attivo `p.attacchi == ["Colpo Devastante"]` (il Pugno è stato rimosso, `engine.py:815-821`); mentre Colpo Devastante è in cooldown (2 turni) **non resta nessun attacco utilizzabile** e il turno è perso (verificato). Comportamento voluto: l'attacco sostituito resta nell'elenco ma è *oscurato* finché il sostituto è utilizzabile; torna disponibile quando il sostituto è in cooldown o senza usi. Mostrare nel menu solo gli attacchi non oscurati. Il `revert` per `attacco_ripristina` diventa superfluo. Test: attivare Super Forza, usare Colpo Devastante, verificare che il Pugno sia utilizzabile.

**0.3 Dati difettosi in `data/stances.json`** (verificare l'intenzione con l'utente):
- id 16 *Resistenza*: `valore: 0` → non fa nulla; è usata da 5 poteri (Super Forza r2, Assorbi Energia r2, Hydrocinesi r3, Assemblatore r3, Campo di forza r3). Default: resistenza `tutto` 25% (dopo 1D), 2 turni.
- id 29 *mira migliorata* (+1) e id 31 *cecchino* (+4) usano `colpire_avversario` positivo, che **aumenta il tiro di chi attacca il possessore** (`bonus_colpire`, `engine.py:105-108`); le descrizioni dicono l'opposto. Sono le stance auto-attive di Supersoldato r2–r4 (e id 29 anche della protesi *Retina Cibernetica*): contribuiscono al suo 33–45% contro un eroe nudo a ranghi pari. Default: `colpire_proprio`, +1 / +2 (scala 0/1/2/3).
- id 30 *Occhio attento*: `flat: 0`, nessuna descrizione → no-op. Default: `colpire_proprio +1` e una descrizione.

**0.4 I test non devono toccare il salvataggio reale.** `test_combat.py:654` importa `app`, che carica e riscrive `save/state.json` e `save/feedback.jsonl` (una sola esecuzione ha riscritto `last_heal` di tutti i personaggi e aggiunto una riga di feedback). Fix: `SAVE_DIR = os.environ.get("URBAN_SAVE_DIR") or os.path.join(BASE, "save")` (`app.py:19`; `PROFILO_FILE` e `FEEDBACK_FILE` ne derivano) e il test imposta `URBAN_SAVE_DIR` su una cartella temporanea **prima** di `import app`. Lo stesso vale per l'harness (§11).

**0.5 `combat.py` è una seconda implementazione con regole vecchie** (pareggio "patta", parata solo in patta, nessun margine né colpi multipli, `+4` mira scritto a mano). Default: eliminarlo e far importare il test da `engine` (`test_combat.py:2` oggi fa `from combat import ...`). Chiedere conferma se l'utente usa ancora il simulatore Tkinter.

### Fase 1 — Ritmo e regole base (costanti + poche righe)

Pacchetto provato **insieme** (duelli pari, solo Pugno, salvo diversa indicazione):

| | Oggi | Pacchetto |
|---|---|---|
| Durata mediana / p90 | 13 / 25 | **7 / 14** |
| +1 / +2 / +3 ranghi su tutto | 92 / 99 / 99% | **68 / 84 / 91%** |
| Mira testa / busto | 27 / 3% | **57 / 18%** |
| Pistola · Spada · Casco · Armatura | 88 · 48 · 98 · 79% | **75 · 49 · 78 · 67%** |

**1A. Azioni base 2** (`engine.py:126`: `n_azioni = 2`; `n_bonus` e `n_risposte` restano 1). Effetto isolato: durata mediana 13 → 8 (3 azioni: 5,5, troppo veloce). Con 2 attacchi per round e **una** risposta, la risposta diventa scarsa: decidere se spenderla sul primo colpo (di cui si conosce il tiro) o tenerla per il secondo è una scelta vera. I poteri che aggiungono azioni (Supervelocità r1/r4, 2x2 "Azione extra", Iniettore di Adrenalina) pesano meno in proporzione: rimisurarli in Fase 2. Test da aggiornare perché assumono base 1: `test_combat.py:232, 302, 562, 565, 1049`.

**1B. Scala dei ranghi `{1:0, 2:1, 3:2, 4:3}`** (`engine.py:16`). Provate anche 0/2/4/6 (+1 rango = 86%), 0/2/3/4 (84%): solo 0/1/2/3 porta +1 rango a ~71–74% (1 o 2 azioni). La UI (`personaggio.html`) legge `BONUS_RANGO`: si aggiorna da sola. **Conseguenze da ritarare** (un pip ora vale un rango intero, prima un terzo):
- tutti i modificatori in pip: *Riflessi Fulminei* −5 → −2; *cecchino* → +2; *Riflessi Aumentati* −2 → −1; effetto *Stordimento* `colpire −2` → −1; *Maledizione* −1 resta; `malus_bracci`/`malus_gambe` −2 per arto → −1 (`engine.py:216-222`); mira (1C). Regola: dividere i vecchi valori per ~2–3, minimo 1, poi verificare col harness;
- gli effetti che tirano un dado di statistica (`dadi: tipo=<stat>`: Corazza ×10, Corazza di Ghiaccio ×8, Pelle di Pietra ×10, Cura ×10, Sanguinamento, Taunt) scalano con la stessa tabella: a rango 4 il dado medio scende da 14,5 a 8,5. Ricontrollare un effetto per volta;
- `valuta()` (`engine.py:962`) e quindi le quote: ricalibrare (§9).

**1C. Penalità di mira come costante, valore 2** (`MIRA_PENALITA` in `engine.py`; oggi `4` scritto in `app.py:703`, nei testi `app.py:981` e `duello.js:253`, e in `combat.py`). A 2 azioni: penalità +4 → testa 29% / busto 2%; +3 → 44 / 9%; **+2 → 59 / 17%**; +1 → 69 / 29%. Con +2 la mira alla testa è una scelta vantaggiosa ma non obbligata; per il busto serve la Fase 2 (colpi da ≥ 85 lo rendono un bersaglio da 2 colpi). Esporre la penalità nello stato JSON (`S.mira_pen`) per il testo della UI.

**1D. Resistenze in percentuale** (`engine.py:309`: `rid = danno * min(res, 75) // 100`). `valore` di `armor.json`, `resistenze` dei poteri e modificatori `resistenza` delle stance diventano percentuali (0–75). Effetto: Casco 98% → 77%, Armatura da combattimento 80% → 74% (1 azione). Aggiornare etichette dell'editor, i test (`test_combat.py:17, 117, 170`) e ritarare i valori (Casco 25% → ~15%, Armatura contundente 5% → ~10%).

### Fase 2 — Contenuto: slot di danno, poteri, equipaggiamento

**2A. Tabella degli slot di danno** (valori base senza margine; applicare con uno script che legge i rangi di sblocco da `powers.json`, rivedere a mano le eccezioni; gli attacchi che infliggono anche un effetto nel tempo scalano di ~10–15%):

| Slot | Cooldown | Singolo bersaglio | Split (totale) |
|---|---|---|---|
| Base sempre disponibile | 0 | 35–45 | – |
| Sblocco rango 1 / arma comune | 0 | 70–90 | 120–150 |
| Sblocco rango 2 | 0–1 | 90–120 | 150–190 |
| Sblocco rango 3 | 1–2 | 120–160 | 190–240 |
| Sblocco rango 4 / ultimate | 2–4 | 160–210 | 240–**270** |

Regole fisse: (i) **nessun attacco split sopra 270 totali** — così una singola zampata non uccide dalla testa (270+16 di margine → 47 a locazione < 50); (ii) nessun ultimate senza cooldown; (iii) ogni attacco che oggi sta fuori fascia ha una riga di motivazione nel commit. Fuori fascia oggi: Lanciafiamme 425 (cd 0), Lanciarazzi 325, Eruzione 298, Fulmine 280, Falce delle Anime 298, Pugno rinforzato 170 (r1!), Pistola 180.

**2B. Poteri.** Vedi la matrice del §7. Obiettivo: M6. Procedura: portare ogni potere nella sua fascia con lo script 2A, poi iterare col harness (round-robin) fino a rientrare; non "correggere" un potere con un numero senza aver letto cosa sblocca per rango.

**2C. Equipaggiamento.** Vedi §8.

### Fase 3 — Decisioni (meccaniche piccole, solo se M3/M4/M5 sono già a posto)

**3A. `costo_azioni` e un secondo attacco nel kit base (consigliato).** Campo opzionale `costo_azioni` (default 1) su attacchi (poi su poteri e augment). `usa_attacco` lo sottrae (`app.py:674`), `azione_player`/`azioni_player` lo usano per `ok`, la CPU filtra gli attacchi che può permettersi (`app.py:893`). Il kit base diventa **Pugno** (1 azione, 35) + **Colpo pesante** (2 azioni, un solo tiro, `can_aim`, `can_dodge`, valore di partenza **80**). Così ogni eroe, dal primo turno, sceglie tra due colpi leggeri e uno pesante: provato (pacchetto Fase 1): pesante 70 → 53% contro due Pugni, 85 → 54%, 100 → 64%, 120 → 67%; la parità è a ~2× il colpo leggero. Cambia anche la risposta del difensore (una risposta contro due colpi o contro uno).

**3B. Idee non misurate (solo se una metrica le giustifica, una per volta):**
- *Locazione a scelta con margine alto*: se `ta−td ≥ 6` l'attaccante può spostare il colpo su un'altra locazione (momento "crit" senza costo e senza dadi nel danno). Metrica: M7 e dispersione di M1.
- *Hype con effetto meccanico* (oggi è solo narrativo): a hype ≥ 80, una volta per duello, il giocatore sfavorito ottiene +1 al prossimo tiro. Metrica: M8 non deve uscire dalla fascia.
- *Rigenerazione stamina* +1/turno senza poteri attivi: poteri a ritmo (burst / recupero). Metrica: durata attiva media dei poteri vs M1.
- *Margine in percentuale del danno* (`danno × (1 + 0.04 × margine)`) al posto del flat ×2, che pesa il 20% su un Pugno e il 4% su una Pistola. Metrica: M5.

### Fase 4 — Progressione, economia, IA, UI

**4A. CPU con un budget, non con una lotteria.** `_equipaggia_cpu` (`app.py:409-439`) usa probabilità `min(0.75, 0.12L)`, `min(0.65, 0.10L)`, `min(0.55, 0.08L)` per ogni oggetto: a L5 quasi tutte le CPU hanno 3+ oggetti che un giocatore non può permettersi (300¤ iniziali, +150¤/vittoria; a L5 ha incassato, a stima, ~2.000–3.000¤ in tutto). Regola: la CPU di livello L spende al più `budget(L)` ≈ 70% dei crediti attesi a quel livello (da `soglia_xp` e dal rateo di vittoria), scegliendo tra gli stessi cataloghi e con gli stessi vincoli di slot/umanità del negozio. Target M9.

**4B. Matchmaking per personaggio, limitato e con decadimento.** Il `bias_matchmaking` è globale e illimitato (`app.py:445-446`). Farlo per record (`rec["bias"]`), clamp ±2 livelli, rientro di 1 punto ogni 3 duelli.

**4C. Survey a tre stati.** `aggiorna_profilo` (`app.py:332-358`) tratta "non spuntato" come "no". Passare a tre stati (sì / no / non so; default non so) o riformulare le domande in forma di difetto ("ha mirato male?") così che il default non sposti nulla. Proporre all'utente il reset di `save/cpu_profile.json`.

**4D. IA di difesa e di attacco per valore atteso.** `_tira_colpo` (`app.py:721-732`) sceglie 75% schivata / 60% parata a prescindere dal tiro (commento: *"non ha schivato quando poteva farlo"*). Con 2 azioni e 1 risposta: calcolare per ogni opzione P(riuscita) dai ranghi e dal tiro d'attacco *già noto*, e tenere la risposta per il secondo colpo quando il primo è basso. `cpu_step`/`stima_danno` (`app.py:461-465, 893-899`) scelgono sempre il colpo più forte con `aggressivita 0.9` e ignorano cooldown, split e probabilità: sostituire con danno atteso = P(colpire) × danno, con un po' di rumore.

**4E. Pacing di XP e Token.** Obiettivo da verificare con una simulazione di carriera: primo upgrade entro il 4° duello; un potere/oggetto/rango ogni ~3–5 duelli nei primi 30. Con la scala 0/1/2/3 ogni Token vale meno in assoluto ma +1 su una sola skill sposta comunque P(colpire) da 45% a 55%: probabilmente non serve toccare 1 Token/livello. Decidere dopo M3/M9.

**4F. UI.** §10.

---

## 7. Poteri: matrice di diagnosi

"RR" = vittorie medie contro il campo (round-robin, ranghi pari, regole attuali). "Primo attacco" = danno del primo attacco sbloccato a rango 1.

| Potere | RR r1 | RR r3 | Primo attacco r1 | Perché | Direzione |
|---|---|---|---|---|---|
| Pelle Invincibile | **82%** | **84%** | *Pugno rinforzato* 170, nessun cooldown | Pistola gratuita al rango 1 + Paladino; armatura irrilevante | Primo attacco nello slot r1 (~85); armatura 25/40/60/90; ruolo tank |
| Appendici Affilate | 69% | 59% | Artigli 128 + sanguinamento | Troppo forte presto | Slot r1 con sanguinamento |
| Telecinesi | 64% | 52% | Spinta 128 (+1 mente) | Danno r1 alto | Spinta ~90, mantenere +1 mente |
| Necromanzia | 62% | 60% | Tocco 119 + Maledizione | Come sopra | Slot r1 |
| Criocinesi · Acidocinesi · Hydrocinesi | 62 · 61 · 60% | 57 · 54 · 45% | 102 · 85 · 102 | Cluster elementale: ok a r1, cala a r3 | Abbassare r1 (≤ 90), alzare r3 |
| Geocinesi | 54% | 44% | Pugno di roccia 85 | Idem | Idem |
| 2x2 | 51% | 68% | nessuno (azione extra persistente) | +1 azione a r1 e 2 locazioni extra (la locazione casuale si diluisce: testa 1/8) | Rimisurare dopo 1A; azione extra da r3 |
| super-urlo | 48% | 54% | Grido 85 split + stordimento | Equilibrato | Verificare dopo 1B |
| Ali | 45% | 34% | Battito d'ala 11 | Nessuna offensiva reale | Attacco di slot r1; 8 locazioni già aiutano |
| Electrocinesi | 42% | 44% | scintilla 42 | r3: stance *Riflessi Fulminei* −5 | −2; attacco r1 di slot |
| Pirocinesi | 41% | **73%** | scintilla 42 | r1 debole, r3 *Lanciafiamme* 425 split senza cooldown uccide dalla testa | Cap split, curva piatta |
| Super Forza | 41% | 38% | Colpo Devastante 85, `controllo`, cd 2 | Usa `controllo` invece di `fisico`; nessun ripiego (0.2); stance *Resistenza* inerte (0.3) | `skill_colpire: fisico`, Fase 0 |
| Campo di forza | 41% | 26% | nessuno | Solo stance con cooldown (Scudo cd 2; Campo di forza 1 turno, cd 5); vale solo col tempismo (commento dell'utente) | Trigger reattivo (`vieni_colpito`) o attacco di scudo vero |
| Assemblatore | 37% | 58% | Lama 7 + sanguinamento | r1 inutile, r3–4 forti | Curva piatta |
| Supervelocità | 37% | 58% | +1 azione bonus | r4: +2 az +1 bonus (93% contro nudo) | Dopo 1A: r4 = +1 az +1 bonus; r1 con un attacco di slot |
| Assorbi Energia | 36% | 24% | nessuno | Solo stance (r2 inerte); *Assorbi Energie* dura 2 turni, cd 1 | Componente offensiva o durata maggiore |
| Anatema | 36% | 55% | Affamare/Affaticare (nessun danno, cd 4) | r1 senza danno | Attacco di slot r1 + debuff |
| Supersoldato | 34% | 21% | nessuno (`mira_bonus`) | Mira inutile finché la mira è una trappola + stance con segno invertito | 0.3 + 1C; poi rimisurare |

Nota: l'IA che pilota i poteri difensivi (Campo di forza, Assorbi Energia) li usa male; i loro numeri sono una stima per difetto. Rimisurarli con un'IA che sa difendersi (4D).

---

## 8. Equipaggiamento ed economia

| Oggetto | Prezzo | Oggi (vs nudo) | Pacchetto F1 | Target F2 | Note |
|---|---|---|---|---|---|
| Pistola | 500 | 89% | 75% | 62–70% | Danno 80–90, 7 usi, a distanza (non parabile). Provato a 2 azioni: 180 → 88%, 120 → 83%, 100 → 81%, **80 → 72%** |
| Spada | 150 | 48% | 49% | 55–62% | Oggi equivale a niente: 7 danni + sanguinamento, il Pugno da 35 resta migliore. Darle un colpo da ~55 con sanguinamento breve |
| Casco da lotta | 50 | **98%** | 78% | 58–66% | Colpisce la locazione che uccide: prezzo ↑ (~150) e resistenza ~15% |
| Giubbotto antiproiettile | 200 | 51% | 49% | 55–60% | Inutile finché la testa decide; rimisurare dopo 2A |
| Armatura da combattimento | 600 | 80% | 67% | 62–70% | Più coerente in percentuale |
| Protesi, Augment, EMP | 100–3000 | non misurato | – | 55–68% | Misurarli col harness (un oggetto per volta) |

Regole: prezzo crescente col guadagno misurato (non con la fantasia); nessun oggetto sopra il 75% contro un nudo né sotto il 55%; il prezzo di un'armatura pesa la locazione (testa ≫ busto > arti), perché è la testa a decidere.

---

## 9. IA, matchmaking, survey

- Difese e attacchi della CPU per valore atteso: 4D. Parata della CPU oggi sceglie la locazione a caso (`app.py:732`), il giocatore la sceglie: asimmetria che premia l'umano; far scegliere alla CPU la locazione con più hp/armatura.
- La CPU non attiva un potere se la stamina non regge `(drain + rango) × 2` turni (`app.py:882-888`): con stat basse e potere r4 non lo usa mai. Va bene finché è voluto; documentarlo.
- `valuta()` (`engine.py:962`, pesi 3·Σstat + 2·Σskill + 5·Σrango poteri) guida quote e matchmaking. Dopo Fase 1–2: stimare dal harness la vittoria in funzione della differenza di `valuta` e ricalibrare i pesi (e il divisore `/30` di `quota_attuale`, `app.py:576`) con una logistica, così che una quota alta corrisponda a una vera possibilità di impresa (con la scala 0/1/2/3 esistono).
- Survey: 4C. Aggiungere il campo `bias` per personaggio nei record con default 0.

---

## 10. UI ed editor

**`static/duello.js`**: mostrare `AZ x/2` e i costi (`(1 azione)` / `(2 azioni)`); il testo della mira (`:253`) deve usare `S.mira_pen`; ridurre `CPU_DELAY` (`:5`, 1600 ms) a ~1000 perché un turno CPU contiene ora 2 azioni più risposte; auto-evidenziare "Fine turno" quando non restano azioni utili. Nessuna logica di regola in JS.

**`editor.py`**: `TabAttacchi.item_da_form` (`:708-731`) ricostruisce `danno` come `{"dadi": [], "flat": …, "mult": 1}` ad ogni salvataggio: qualunque `dadi` aggiunto a mano ai dati **verrebbe cancellato**; aggiungere il campo o preservarlo. `CrudTab.salva_item` (`:560-574`) fonde il vecchio item con il nuovo, quindi i campi sconosciuti sopravvivono, ma il form non permette di modificarli: aggiungere `costo_azioni`, il tipo di resistenza in percentuale (etichetta "%"), `bias` e ogni campo nuovo. Aggiornare le etichette ("Danno base" → mostrare la fascia di slot suggerita).

**Cose che mostrano regole e vanno controllate dopo 1B/1C/1D**: `templates/personaggio.html:65, 79` (bonus di rango), `negozio.html` (prezzi e resistenze), `torneo.js` (descrizioni delle scelte).

---

## 11. Harness di bilanciamento (da costruire in Fase 0/1 e usare sempre)

File `balance.py` nella radice, senza dipendenze, che usa il **vero** `DuelloWeb` su salvataggio temporaneo e stampa le metriche M1–M10 con le fasce di §3 e PASS/FAIL. Sottocomandi: `lunghezza`, `ladder`, `mira`, `equip`, `poteri` (vs nudo e round-robin), `matchmaking`, `fuzz` (100.000 duelli casuali: nessuna eccezione, nessun duello oltre 120 round), `tutto`. Opzioni: `--n`, `--seed`. Scheletro già provato:

```python
import os, tempfile, random
os.environ["URBAN_SAVE_DIR"] = tempfile.mkdtemp()   # prima di importare app (Fase 0.4)
import app, engine as E

def duello(p, c, cap=120):
    d = app.DuelloWeb(pg=p, avversario=c)           # record=None: niente arena, niente resa
    while not d.finito and d.round < cap:
        if d.fase == "risposta":                    # difende il lato "player": stessa euristica della CPU
            op = d.pending["opzioni"]
            s = ("schivata" if "schivata" in op and random.random() < .75 else
                 "parata" if "parata" in op and random.random() < .6 else "nessuna risposta")
            d.risolvi_risposta(s, random.choice(list(d.p.hp)))
        elif d.fase in ("player", "cpu"):
            d.cpu_step()                            # pilota entrambi i lati con la stessa IA
    return d
```

Costruzione dei combattenti: `Personaggio` con `stats`/`skills` tutte al rango r, `dotazione_base`, poi potere (`{"def": …, "rango": r, "attivo": False}`), armi (attacchi della voce di `equipment.json`), armatura (`equipaggia_armatura`). Per la mira: policy che chiama `consuma_mira()` e imposta `mira` prima di `usa_attacco`. Metriche da leggere dal log (`d.log[i]["t"]`/`["tag"]`) e da `d.round`. Round-robin: ≥ 100 duelli per coppia (20×19 coppie × 2 ranghi ≈ 1 minuto). Dopo la Fase 4D il harness deve usare la **stessa** funzione di difesa della CPU per entrambi i lati.

Test (`test_combat.py`): un blocco `# ---- overhaul fase N ----` per regola nuova, nello stile esistente. Da aggiungere: 0.1, 0.2, 1A–1D, 3A.

**Non misurato e quindi da misurare**: protesi/augment/EMP; Torneo Evo (probabilità di vittoria con scelte casuali ≈ 6% attesa, con scelte ragionevoli 15–30%); differenze tra IA e giocatore umano (l'umano sceglie dove parare, la CPU a caso); carriera completa (XP, Token, crediti) con una policy d'acquisto realistica.

---

## 12. Decisioni di default (così non ci si ferma) e domande aperte

| Tema | Default | Alternativa |
|---|---|---|
| Azioni | 2 base + `costo_azioni` | Punti azione generici (più codice, nessun beneficio misurato) |
| Scala ranghi | 0/1/2/3 | Le provate 0/2/4/6 e 0/2/3/4 lasciano +1 rango a 84–86% |
| Penalità mira | 2 | 1 se dopo Fase 2 la mira alla testa risulta ancora < 55% |
| Resistenze | percentuali, tetto 75% | Flat con tetto al 40% del danno |
| Dadi nel danno | **No** (inutili per il bilanciamento, misurato) | Opzionale per attacco, solo come "gusto" |
| HP delle locazioni | invariati (testa 50) | Alzare la testa a 60–80 solo se M7 resta > 75% dopo Fase 2 |
| Pareggio nei tiri | al difensore (invariato) | – |
| `combat.py` | eliminare | Allinearlo (non consigliato) |
| Meccaniche di rimonta | **No** (M8 è già sano) | – |

**Da chiedere all'utente prima di agire**: (1) l'intenzione delle stance 16/29/30/31 (§0.3); (2) se `combat.py` serve ancora; (3) se resettare `save/cpu_profile.json` (è un dato suo); (4) l'origine dei 994.240¤ nel save (probabile `/debug/crediti`): non influisce sul bilanciamento ma falsa ogni test d'economia fatto sul save reale — usare sempre crediti iniziali puliti.

---

## 13. Da non fare

- Aggiungere dadi al danno per "dare varietà": non cambia la dispersione (§3).
- Alzare tutti gli HP o tutti i danni per "allungare/accorciare": il rapporto tra le fasce conta, non la scala (§3 cause 3–6).
- Aggiungere sistemi (punti azione generici, meccaniche di rimonta, classi) prima di aver chiuso le Fasi 0–2.
- Correggere un potere con un numero senza leggere cosa sblocca per rango.
- Toccare `save/` o committare dati di gioco generati dalle simulazioni.
- Dare per buona una modifica senza rimisurare M1–M10.

---

## 14. Appendice: misure grezze (baseline, regole attuali)

**P(colpire) = P(d10+bonus A > d10+bonus D)** (righe: attaccante; colonne: difensore)

| | r1 | r2 | r3 | r4 |
|---|---|---|---|---|
| r1 | 45% | 21% | 6% | 0% |
| r2 | 72% | 45% | 21% | 6% |
| r3 | 90% | 72% | 45% | 21% |
| r4 | 99% | 90% | 72% | 45% |

**Azioni base → durata (pari):** 1 → 13 / 25; 2 → 8 / 16; 3 → 5,5 / 11 (mediana / p90).

**Scala dei ranghi, vittoria con +1 / +2 / +3 (1 azione):** 0/3/6/9 → 91 / 98 / 99%; 0/2/4/6 → 86 / 95 / 98%; 0/2/3/4 → 84 / 92 / 95%; **0/1/2/3 → 71 / 85 / 91%**. Hit%: a pari 45; con 0/1/2/3 gap 1 = 55% (inverso 36%), gap 2 = 64%, gap 3 = 72%.

**Mira (vittoria contro chi non mira), testa / busto:** 1 azione, +4 → 28 / 3; +3 → 44 / 8; +2 → 57 / 15; +1 → 69 / 27. 2 azioni, +4 → 29 / 2; +3 → 44 / 9; +2 → 59 / 17; +1 → 69 / 29. Pistola vs Pistola, +4 → 20 / 22. Mira gratuita (+4) testa / busto 59 / 18.

**Equipaggiamento contro nudo, 1 azione / 2 azioni:** Casco flat 98 / 97 → % 77 / 76; Armatura da combattimento flat 80 / 78 → % 74 / 71; Giubbotto 52 / 51 → 51 / 51.

**Potere contro eroe nudo, rango 1 (controllo = 1):** Pelle Invincibile 87, Telecinesi 82, Appendici 76, Acidocinesi 71, Necromanzia 70, Criocinesi 70, Hydrocinesi 66, Geocinesi 65, 2x2 59, super-urlo 57, Electrocinesi 54, Ali 53, Supervelocità 51, Super Forza 51, Anatema 49, Campo di forza 48, Assorbi Energia 47, Pirocinesi 47, Assemblatore 45, Supersoldato 38. A pari stat/rango 4: Supervelocità 93, 2x2 88, Pirocinesi 88, Pelle 88, … Campo di forza 48, Assorbi Energia 48, Supersoldato 33.

**Livello L senza equip contro `cpu_bilanciata`** (CPU con arma · armatura · protesi/augment): L1 45% (28 · 12 · 58%); L3 37% (60 · 30 · 93%); L5 27% (80 · 49 · 100%); L8 28% (94 · 67 · 100%); L12 29% (95 · 66 · 100%); L16 30% (94 · 62 · 100%).

**Feedback reali** (`save/feedback.jsonl`, esclusi i "test automatico"): 31 survey compilati, "divertente" 18 (58%), "troppo debole" 5, "troppo forte" 0, "partita lunga" 2; 38 duelli registrati: mediana 8 round, massimo 29, 9 oltre 15. Commenti: *"non ha schivato quando poteva farlo"*, *"non mi ha fatto danni"*, *"troppo lungo, troppo rng"*, *"campo di forza conviene usarlo in modo puramente difensivo, sarebbe saggio usarlo quando si è sotto mira"*, *"mi ha messo alle strette, mi sono dovuto arrendere (è una nota positiva)"*, *"FINALMENTE HO VINTO UN TORNEO"*.

**Test esistenti:** `python test_combat.py` passa sul commit `0f51b9d` ("OK — tutti i check passati"). Si tratta di un'unica funzione `main()` con ~1.350 righe di asserzioni.
