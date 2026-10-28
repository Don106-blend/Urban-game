"""Fase 2B dell'overhaul: ritocchi ai POTERI (data/powers.json) e ai contenuti collegati
(nuovi attacchi/stance), con le misure del harness (M6).

Ordine: python tools/fase2_poteri.py  ->  python tools/fase2_attacchi.py --applica
        python balance.py poteri --n 4000   (r1 e r3, round-robin e contro nudo)
        python balance.py poteri --solo "Nome potere" --n 3000   (dettaglio di uno solo)

Idempotente: riscrive valori assoluti. Ruoli (OVERHAUL_GAMEPLAY.md §5.4): burst, tank,
controllo, mobilita', utility. Un potere con un'offensiva debole deve avere in cambio una
difesa/utility che valga; ogni potere sta in 44-58% di vittorie nel round-robin a ranghi
pari (r1 e r3), peggior matchup >= 30%.

Come si e' arrivati ai valori (ogni riga e' una misura, non una preferenza):
  * un attacco in mischia si puo' PARARE (la parata dimezza e sposta il colpo sugli arti), uno
    a distanza no: gli slot di tools/fase2_attacchi.py hanno quindi un premio per la mischia;
  * i poteri senza un attacco di slot al rango 1 stavano al 30-36% (Supervelocita', Campo di
    forza, Supersoldato, Super Forza, Assorbi Energia): ognuno ha ora un'offensiva o un passivo;
  * `effetti` e `stance_attivate` NON sono cumulativi tra ranghi (vale il rango posseduto o il
    piu' alto sotto di esso gia' definito): chi ridefinisce un rango deve ripetere cio' che
    vuole mantenere.
"""
import sys

from datafix import carica, salva

pw = carica("powers.json")
att = carica("attacks.json")
st = carica("stances.json")


def potere(nome):
    return next(p for p in pw if p["nome"] == nome)


def nuovo_attacco(i, **campi):
    """Crea (o aggiorna) un attacco con i default del modello dati."""
    base = {"id": i, "descrizione": "", "ranged": False, "can_aim": True, "can_dodge": True,
            "attivo_default": False, "tipo_danno": "contundente",
            "danno": {"dadi": [], "flat": 0, "mult": 1}, "sostituisce": None,
            "effetti_applicati": [], "split_danni": False, "skill_colpire": None,
            "cooldown_turni": 0, "usi_limitati": False, "usi_massimi": 1, "colpi": 1,
            "costo_azioni": 1}
    esistente = next((a for a in att if a["id"] == i), None)
    flat = campi.pop("danno", None)
    base.update(campi)
    if flat is not None:
        base["danno"] = {"dadi": [], "flat": flat, "mult": 1}
    if esistente is None:
        att.append(base)
    else:  # il danno e il cooldown li decide tools/fase2_attacchi.py: qui non si toccano
        esistente.update({k: v for k, v in base.items() if k not in ("danno", "cooldown_turni")})


def nuova_stance(i, **campi):
    base = {"id": i, "descrizione": "", "attivo_default": False,
            "durata": {"tipo": "contrapposta"}, "trigger": "attivo", "cooldown_turni": 0,
            "usi_limitati": False, "usi_massimi": 1, "modificatori": [],
            "effetti_applicati": [], "effetti_avversario": []}
    esistente = next((s for s in st if s["id"] == i), None)
    base.update(campi)
    if esistente is None:
        st.append(base)
    else:
        esistente.update(base)


def set_rango(mappa, valori):
    """mappa per rango {"1":[...],...}: imposta solo i ranghi indicati, azzera gli altri."""
    for r in "1234":
        mappa[r] = list(valori.get(int(r), []))


def armatura(v):
    return {"tipo": "armatura", "dadi": [], "flat": v, "mult": 1}


def mod_stat(stat, delta):
    return {"tipo": "mod_statistica", "statistica": stat, "delta": delta}


# ===================================================================== Pelle Invincibile
# Armatura 15/25/30/50 su OGNI locazione (era 55/170/575/1450: la testa, che ha 80 hp, aveva
# 575 hp di armatura al rango 3). Ruolo: tank in mischia. L'armatura da sola pesa poco
# (-10 hp = -2 punti): la forza di Pelle e' anche il Paladino e Pugno rinforzato.
p = potere("Pelle Invincibile")
set_rango(p["effetti"], {1: [armatura(15)], 2: [armatura(25)], 3: [armatura(30)],
                         4: [armatura(50)]})
p["descrizione"] = ("La pelle si indurisce: armatura (hp extra) su ogni locazione: +15 al rango 1, "
                    "+25 al 2, +30 al 3, +50 al 4. Ruolo: tank in mischia.")

# ===================================================================== Super Forza
# +1 alla skill di mischia (colpire e parare) e, dal rango 2, resistenza permanente del 25%:
# Colpo Devastante senza cooldown (era 'controllo' invece di 'fisico', cd 2 e nessun ripiego).
p = potere("Super Forza")
set_rango(p["effetti"], {1: [mod_stat("armi_corpo_a_corpo", 1)],
                         3: [mod_stat("armi_corpo_a_corpo", 1), mod_stat("fisico", 1)]})
set_rango(p["stance"], {2: [16]})
set_rango(p["stance_attivate"], {2: [16]})
p["descrizione"] = ("Forza sovrumana: +1 alla skill di mischia (+1 fisico dal rango 3) e, dal rango "
                    "2, -25% a tutti i danni subiti. Sostituisce il Pugno con Colpo Devastante (se non è "
                    "utilizzabile torna il Pugno).")

# ===================================================================== Supervelocita'
# Ruolo: mobilita'/tempo. Con 3 azioni base le azioni extra pesano molto: +1 bonus ai ranghi
# bassi, +1 azione al 3, +1 azione e +1 bonus al 4 (era +2 azioni: 5 per turno). I riflessi
# aumentati sono permanenti dal rango 1 (-1 al tiro per colpire di chi la attacca).
p = potere("Supervelocità")
set_rango(p["effetti"], {1: [{"tipo": "azioni", "azioni": 0, "bonus": 1, "risposte": 0}],
                         3: [{"tipo": "azioni", "azioni": 1, "bonus": 0, "risposte": 0}],
                         4: [{"tipo": "azioni", "azioni": 1, "bonus": 1, "risposte": 0}]})
set_rango(p["attacchi"], {1: [18], 2: [44]})
set_rango(p["stance_attivate"], {1: [11]})
p["descrizione"] = ("Ti muovi a velocità sovrumana: riflessi aumentati (-1 al tiro per colpire di "
                    "chi ti attacca), +1 azione bonus; dal rango 3 +1 azione, al 4 anche +1 "
                    "bonus. Sblocca Attacco Rapido e Raffica di Pugni.")

# ===================================================================== 2x2
# Ruolo: molti colpi. L'azione extra persistente arriva dal rango 3 (a rango 1 bastano le due
# braccia in piu'). Gli attacchi multi-colpo mettono sotto pressione l'UNICA risposta
# dell'avversario: ogni colpo e' un tiro separato (la risposta si spende sul primo).
nuovo_attacco(54, nome="Doppio pugno", descrizione="Due pugni in un colpo solo.",
              danno=50, colpi=2, tipo_danno="contundente")
nuovo_attacco(55, nome="Raffica a quattro braccia", descrizione="Quattro braccia, quattro colpi.",
              danno=42, colpi=4, tipo_danno="contundente", cooldown_turni=2)
p = potere("2x2")
set_rango(p["attacchi"], {1: [54], 2: [6], 3: [55], 4: [18]})
set_rango(p["effetti_nel_tempo"], {3: [{"effetto": 8, "turni": 1, "persistente": True}],
                                   4: [{"effetto": 8, "turni": 1, "persistente": True}]})
p["descrizione"] = ("Due braccia ti spuntano dalla schiena (2 arti extra da 100 hp): attacchi a "
                    "più colpi e, dal rango 3, un'azione extra ogni turno.")

# ===================================================================== Anatema
# Ruolo: controllo. I due debuff r1 fanno anche danno (70, cooldown 1) e logorano per 2 turni.
p = potere("Anatema")
p["descrizione"] = ("Puoi scagliare maledizioni: Affamare (-1 riflessi e fisico) e Affaticare "
                    "(-1 azione bonus e -1 risposta) fanno danno e debilitano per 2 turni.")

# ===================================================================== Assemblatore
# Curva piatta: forte presto (lama r1 piu' forte), meno forte tardi (niente resistenza permanente
# al rango 3: sommata a Fucile e Granata lo portava al 67%).
p = potere("Assemblatore")
set_rango(p["stance_attivate"], {})

# ===================================================================== Campo di forza
# Ruolo: tank/controllo. Barriera permanente (-20% ai danni, poi -25%), colpo di scudo che
# stordisce, armatura a campo e l'invulnerabilita' di un turno al rango 4.
nuova_stance(32, nome="Barriera", descrizione="Un campo di forza costante: -20% a tutti i danni subiti.",
             attivo_default=False, durata={"tipo": "contrapposta"},
             modificatori=[{"tipo": "resistenza", "tipo_danno": "tutto", "valore": 20}])
p = potere("Campo di forza")
set_rango(p["attacchi"], {1: [27]})
set_rango(p["stance"], {1: [14], 4: [15]})
set_rango(p["stance_attivate"], {1: [32], 3: [16]})
# ogni rango ha qualcosa (l'audit di test_combat.py lo richiede)
set_rango(p["effetti"], {2: [armatura(25)], 3: [armatura(40)]})
p["descrizione"] = ("Un campo di forza ti protegge: -20% ai danni (-25% dal rango 3), armatura "
                    "+25/+40 dal rango 2, Colpo di scudo che stordisce e Scudo contro la "
                    "mischia. Al rango 4 un turno di invulnerabilità.")

# ===================================================================== Assorbi Energia
# Ruolo: tank-ritorsione. I danni subiti si suddividono su tutto il corpo (PERMANENTE) e chi ti
# colpisce brucia; l'armatura per locazione assorbe le quote piccole. Nel round-robin non
# aveva alcuna offensiva e la stance durava 2 turni (31% al rango 1, 18% al 3).
nuova_stance(5, nome="Assorbi Energie",
             descrizione=("Tutti i danni subiti vengono suddivisi tra tutte le parti del corpo "
                          "e chi ti colpisce brucia per 2 turni."),
             durata={"tipo": "fissa", "turni": 3}, trigger="vieni_colpito", cooldown_turni=1,
             modificatori=[{"tipo": "distribuisci_danni"}],
             effetti_avversario=[{"effetto": 1, "turni": 2}])
p = potere("Assorbi Energia")
set_rango(p["stance"], {1: [16], 2: [14], 4: [15]})
set_rango(p["stance_attivate"], {1: [5], 3: [5, 32]})
set_rango(p["effetti"], {1: [armatura(8)], 2: [armatura(12)], 3: [armatura(22)],
                         4: [armatura(30)]})
p["descrizione"] = ("Assorbi i colpi: i danni si distribuiscono su tutto il corpo e chi ti "
                    "colpisce brucia. Armatura +8/+12/+22/+30 per locazione, barriera del 20% "
                    "dal rango 3.")

# ===================================================================== Supersoldato
# Ruolo: utility/cecchino. Mira come azione bonus + armi vere (mancava qualsiasi attacco).
nuovo_attacco(52, nome="Raffica controllata", descrizione="Una raffica breve e precisa.",
              ranged=True, tipo_danno="perforante", skill_colpire="armi_distanza",
              danno=55, effetti_applicati=[])
nuovo_attacco(53, nome="Tiro di precisione", descrizione="Un colpo solo, piazzato con calma.",
              ranged=True, tipo_danno="perforante", skill_colpire="armi_distanza",
              danno=72, cooldown_turni=1)
p = potere("Supersoldato")
set_rango(p["attacchi"], {1: [52], 3: [53]})
p["descrizione"] = ("Addestramento sovrumano: mirare costa 1 azione bonus invece di 1 azione; "
                    "sblocca Raffica controllata e Tiro di precisione e la mira migliora con il "
                    "rango (+1/+1/+2 al tiro per colpire).")

# ===================================================================== Telecinesi / Electro / Hydro / Ali / Geo
# Il rango 3 di questi poteri aveva solo stance a durata/cooldown: +1 controllo (la skill con
# cui colpiscono) e, per Geocinesi, una barriera.
p = potere("Telecinesi")
set_rango(p["effetti"], {1: [mod_stat("mente", 1)],
                         3: [mod_stat("mente", 1), mod_stat("controllo", 1)]})
p = potere("Electrocinesi")
set_rango(p["effetti"], {3: [mod_stat("controllo", 1)]})
p = potere("Hydrocinesi")
set_rango(p["effetti"], {3: [mod_stat("controllo", 1)]})
p = potere("Ali")
ali_r3 = [e for e in p["effetti"]["3"] if e["tipo"] == "locazione_extra"]
set_rango(p["effetti"], {1: p["effetti"]["1"], 3: ali_r3 + [mod_stat("controllo", 1)]})
p = potere("Geocinesi")
set_rango(p["effetti"], {1: [{"tipo": "resistenza", "tipo_danno": "contundente", "valore": 15}],
                         3: [{"tipo": "resistenza", "tipo_danno": "contundente", "valore": 15},
                             armatura(10)]})
set_rango(p["stance_attivate"], {3: [32], 4: [28]})
p["descrizione"] = ("Piega la roccia e la terra, corazzandosi: -15% ai danni contundenti, "
                    "barriera e armatura dal rango 3. Al rango 4 rende immuni a tutti i danni "
                    "di tipo contundente.")

if "--dry" not in sys.argv:
    salva("powers.json", pw)
    salva("attacks.json", att)
    salva("stances.json", st)
    print("fase 2B poteri: ok")
