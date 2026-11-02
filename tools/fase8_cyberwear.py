"""Fase 8: nuovi cyberwear e protesi (v. CYBERWARE.md, sez. "Nuovi impianti"). Idempotente: riesegue aggiornando per nome (augment, protesi)
o per id (attacchi) quello che qui e' scritto, e lascia in pace il resto. Le regole speciali stanno in engine.py (campo "speciale"):

* Speedwear: attivo, una volta per combattimento, 3 turni: come Supervelocita' al rango 1 (azione bonus, Attacco Rapido, Riflessi Aumentati) e si vede
  come tale (`come_potere`);
* Convertitore nutrizionale: azione bonus, 3 stamina -> 1 azione extra (`istantaneo`, `costo_bonus`, `speciale: convertitore`);
* Modulo DDOS: passivo, sblocca la mossa DDOS (una volta per combattimento: niente augment accesi per 1d Mente turni);
* Modulo di IA predittiva: attivo, niente schivata all'avversario per questo turno, ricarica 10 - 1d Mente turni (minimo 2);
* Cuscinetto di emergenza: passivo, la prima locazione che perde 50+ hp in un colpo ne ottiene 50 temporanei;
* Berserker: passivo, +danno con la vita persa (fino a +75% al 5% rimasto);
* IA supportiva: passivo, +3 Mente; Biohazard: passivo, -30% ai danni elementali.
Protesi: Wolf fangs (testa, mossa Morso) e Cyber artigli (braccio destro o sinistro, mossa Artigli sanguinari), entrambe con ricarica 3 turni."""
import copy

from datafix import carica, per_id, salva

RANGHI = ("1", "2", "3", "4")


def vuoto():
    return {r: [] for r in RANGHI}


def augment(nome, descrizione, valore, umanita, attivo=False, effetti=(), attacchi=(), stance_attivate=(), **extra):
    a = {"nome": nome, "descrizione": descrizione, "valore": valore, "costo_umanita": umanita, "attivo": attivo, "costo_stamina": 0,
         "durata_turni": 0, "usi_limitati": False, "usi_massimi": 1,
         "effetti": {**vuoto(), "1": list(effetti)}, "effetti_nel_tempo": vuoto(),
         "attacchi": {**vuoto(), "1": list(attacchi)}, "stance": vuoto(), "stance_attivate": {**vuoto(), "1": list(stance_attivate)}}
    a.update(extra)
    return a


# ids degli attacchi nuovi (gli esistenti arrivano a 56)
ID_MORSO, ID_DDOS, ID_ARTIGLI_CYBER = 57, 58, 59

AUGMENT = [
    augment("Speedwear", "Una sovrapposizione neuromuscolare: per 3 turni ti muovi come chi ha Supervelocità al rango 1 (+1 azione bonus, "
            "riflessi aumentati, Attacco Rapido). Un solo uso per combattimento.",
            450, 2, attivo=True, costo_stamina=1, durata_turni=3, usi_limitati=True, usi_massimi=1,
            effetti=({"tipo": "azioni", "azioni": 0, "bonus": 1, "risposte": 0},), attacchi=(18,), stance_attivate=(11,),
            come_potere={"nome": "Supervelocità", "rango": 1}),
    augment("Convertitore nutrizionale", "Un bioreattore sotto lo sterno: con un'azione bonus converte 3 punti di stamina in 1 azione extra, subito.",
            300, 1, attivo=True, istantaneo=True, costo_bonus=True, speciale="convertitore"),
    augment("Modulo DDOS", "Impianto passivo: sblocca la mossa DDOS, una volta per combattimento. Se va a segno, per 1d Mente turni l'avversario "
            "non può accendere augment (quelli già accesi restano accesi).",
            500, 2, attacchi=(ID_DDOS,)),
    augment("Modulo di IA predittiva", "Anticipa le mosse dell'avversario: nel turno in cui lo attivi non può schivare. "
            "Si ricarica in 10 − 1d Mente turni (minimo 2).",
            600, 2, attivo=True, istantaneo=True, speciale="ia_predittiva", ricarica={"base": 10, "dado": "mente", "min": 2}),
    augment("Cuscinetto di emergenza", "Impianto passivo: la prima locazione che subisce 50 o più danni ai suoi hp (non a quelli temporanei) in un "
            "solo colpo ottiene 50 hp temporanei.",
            350, 1, speciale="cuscinetto"),
    augment("Berserker", "Impianto passivo: il danno che infliggi cresce con la vita generale persa, fino a +75% quando ne resta il 5%.",
            400, 2, speciale="berserker"),
    augment("IA supportiva", "Impianto passivo: un'intelligenza di supporto che ragiona con te. +3 a Mente (il rango non supera mai 4).",
            500, 2, effetti=({"tipo": "mod_statistica", "statistica": "mente", "delta": 3},)),
    augment("Armatura subdermale \"Biohazard\"", "Impianto passivo: una pelle di polimeri sigillanti. Tutti i danni elementali "
            "(fuoco, elettrico, gelo, acido) sono ridotti del 30%.",
            450, 2, effetti=tuple({"tipo": "resistenza", "tipo_danno": t, "valore": 30} for t in ("fuoco", "elettrico", "gelo", "acido"))),
]

PROTESI = [
    {"nome": "Wolf fangs", "descrizione": "Sostituisce la dentatura e rinforza la testa (100 hp, mai CRIPPLED): sblocca la mossa Morso "
     "(ricarica 3 turni).", "valore": 350, "locazione": "testa", "hp": 100, "costo_umanita": 2, "attacchi": [ID_MORSO], "stance": [],
     "stance_attivate": [], "effetti_nel_tempo": []},
    {"nome": "Cyber artigli (dx)", "descrizione": "Sostituisce il braccio destro con artigli retrattili (120 hp, mai CRIPPLED): sblocca la mossa "
     "Artigli sanguinari (ricarica 3 turni).", "valore": 450, "locazione": "braccio_dx", "hp": 120, "costo_umanita": 2,
     "attacchi": [ID_ARTIGLI_CYBER], "stance": [], "stance_attivate": [], "effetti_nel_tempo": []},
    {"nome": "Cyber artigli (sx)", "descrizione": "Sostituisce il braccio sinistro con artigli retrattili (120 hp, mai CRIPPLED): sblocca la mossa "
     "Artigli sanguinari (ricarica 3 turni).", "valore": 450, "locazione": "braccio_sx", "hp": 120, "costo_umanita": 2,
     "attacchi": [ID_ARTIGLI_CYBER], "stance": [], "stance_attivate": [], "effetti_nel_tempo": []},
]


def attacchi_nuovi(esistenti):
    """Morso, DDOS e gli Artigli sanguinari delle protesi (una copia degli Artigli Sanguinari del potere Appendici Affilate, ma con ricarica 3
    e senza sostituire nulla: cambiare la ricarica a quelli del potere ne cambierebbe il bilanciamento)."""
    artigli = copy.deepcopy(per_id(esistenti, 12))
    artigli.update(id=ID_ARTIGLI_CYBER, nome="Artigli sanguinari", descrizione="Artigli retrattili: cercano il sangue.",
                   sostituisce=None, cooldown_turni=3)
    return [
        {"id": ID_MORSO, "nome": "Morso", "descrizione": "Un morso feroce, a zanne scoperte: ferisce e fa sanguinare.", "ranged": False,
         "can_aim": True, "can_dodge": True, "attivo_default": False, "split_danni": False, "tipo_danno": "perforante",
         "skill_colpire": "fisico", "danno": {"dadi": [], "mult": 1, "flat": 110}, "sostituisce": None,
         "effetti_applicati": [{"effetto": 3, "turni": 2, "persistente": False}], "cooldown_turni": 3, "usi_limitati": False,
         "usi_massimi": 1, "colpi": 1, "costo_azioni": 1, "parabile": True},
        {"id": ID_DDOS, "nome": "DDOS", "descrizione": "Un attacco informatico: se va a segno, per 1d Mente turni l'avversario non può accendere "
         "augment (quelli già accesi restano accesi). Una volta per combattimento.", "ranged": True, "can_aim": False, "can_dodge": False,
         "attivo_default": False, "split_danni": False, "tipo_danno": "nessuno", "skill_colpire": "mente",
         "danno": {"dadi": [], "mult": 1, "flat": 0}, "sostituisce": None, "speciale": "ddos", "senza_danno": True, "effetti_applicati": [],
         "cooldown_turni": 0, "usi_limitati": True, "usi_massimi": 1, "colpi": 1, "costo_azioni": 1, "parabile": False},
        artigli,
    ]


def upsert(file, nuovi, chiave):
    dati = carica(file)
    for n in nuovi:
        corrente = next((x for x in dati if x[chiave] == n[chiave]), None)
        if corrente is None:
            corrente = {} if "id" in n else {"id": max(x["id"] for x in dati) + 1}
            dati.append(corrente)
        corrente.update(copy.deepcopy(n))
    salva(file, dati)


upsert("attacks.json", attacchi_nuovi(carica("attacks.json")), "id")
upsert("augments.json", AUGMENT, "nome")
upsert("protesi.json", PROTESI, "nome")
print("fase 8 dati: ok (" + ", ".join(n["nome"] for n in AUGMENT + PROTESI) + " + Morso, DDOS, Artigli sanguinari)")
