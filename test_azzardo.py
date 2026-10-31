"""Check del Banco (puntate, clausole, folla, azzardi) e della sua integrazione nel duello: python test_azzardo.py
La logica pura sta in azzardo.py; qui si prova anche attraverso DuelloWeb, il torneo e le rotte. Le misure di bilanciamento
(quanto vale ogni azzardo, calibrazione delle quote) sono in `python balance.py azzardo`."""
import atexit
import json
import math
import os
import random
import shutil
import tempfile

# come test_combat.py: il salvataggio vero non si tocca mai
_SAVE_TMP = tempfile.mkdtemp(prefix="urban_test_azz_")
os.environ["URBAN_SAVE_DIR"] = _SAVE_TMP
atexit.register(shutil.rmtree, _SAVE_TMP, ignore_errors=True)

import app as webapp  # noqa: E402
import azzardo as Z  # noqa: E402
from engine import LOCAZIONI, Personaggio, dotazione_base, personaggio_casuale  # noqa: E402

DB = webapp.DB
S = webapp.STATO
n_check = 0


def ok(cond, msg=""):
    global n_check
    n_check += 1
    assert cond, msg


class dadi:
    """Fissa i prossimi tiri di d10 (random.randint) in ordine; finiti, torna a tirare davvero."""

    def __init__(self, *valori):
        self.v = list(valori)

    def __enter__(self):
        self.orig = random.randint

        def finto(a, b):
            return self.v.pop(0) if self.v else self.orig(a, b)
        random.randint = finto

    def __exit__(self, *e):
        random.randint = self.orig


REC = {"id": 998, "nome": "Scommettitore", "stats": {s: 1 for s in ("fisico", "riflessi", "mente", "sociale", "controllo")},
       "skills": {}, "poteri": [], "hp": dict(LOCAZIONI), "crippled": [], "livello": 1, "xp": 0, "token": 0,
       "toughness": 0, "equip": [], "vittorie": 0, "sconfitte": 0, "morto": False}
PUGNO = next(a for a in DB["attacchi"] if a["nome"] == "Pugno")


def tocca_a(d, chi):
    """Il turno di `chi`, con le risorse piene e nessun azzardo gia' fatto."""
    d.attivo, d.altro = (d.p, d.cpu) if chi is d.p else (d.cpu, d.p)
    d.fase = "player" if chi is d.p else "cpu"
    chi.azioni, chi.bonus, chi.risposte = chi.n_azioni, chi.n_bonus, chi.n_risposte
    d.tavolo.azzardato.discard(d.tavolo.lato(chi))


def coppia():
    """Due combattenti nudi con gli azzardi accesi e senza soldi (come nel harness)."""
    a, b = Personaggio("Alfa"), Personaggio("Beta")
    for x in (a, b):
        dotazione_base(x, DB["attacchi"], DB["stances"])
        x.init_stamina()
    d = webapp.DuelloWeb(pg=a, avversario=b, azzardo_attivo=True)
    tocca_a(d, d.p)
    d.tavolo.tifo = 0.0
    return d


def duello_vero(crediti=1000, **ov):
    """Un duello della palestra (puntate in crediti veri), con il turno al giocatore."""
    S["crediti"] = crediti
    S["rivali"] = []                 # un avversario sempre nuovo: niente rivincita ne' taglia (quelle si provano in test_nemesi.py)
    d = webapp.DuelloWeb(dict(REC, **ov))
    tocca_a(d, d.p)
    return d


def effetti(chi):
    return [e["def"]["nome"] for e in chi.effetti_attivi]


def colpo(d, ta, td, scelta="nessuna risposta", loc="busto", att=PUGNO, loc_parata=None):
    """Fa risolvere a `d.attivo` un colpo contro `d.altro` con il tiro d'attacco `ta` e il tiro di difesa `td` (d10 puro)."""
    d.pending = {"att": att, "ta": ta, "pen_mira": 0, "loc": loc, "opzioni": [scelta], "mirata": None,
                 "colpi_rimasti": 1, "skill": "armi_corpo_a_corpo", "mod": 0}
    d.fase = "risposta"
    with dadi(td):
        d.risolvi_risposta(scelta, loc_parata)


def main():
    # ================================================================ funzioni pure
    ok(Z.quota(0.5) == 1.8, "a 50% paga 1,8x: la casa trattiene il 10%")
    ok(Z.quota(0.001) == Z.QUOTA_MAX and Z.quota(0.999) == Z.QUOTA_MIN, "la quota ha un tetto e un pavimento")
    ok(all(Z.quota(p / 100) >= Z.quota((p + 1) / 100) for p in range(5, 99)), "piu' sei favorito, meno paga")
    ok(Z.limite_puntata(0.5, 1000) == 1000 and Z.limite_puntata(0.3, 1000) == 1000 and Z.limite_puntata(0.7, 1000) == 1000,
       "finche' l'incontro e' aperto si puo' puntare tutto")
    ok(Z.limite_puntata(0.85, 1000) == 400 and Z.limite_puntata(0.15, 1000) == 400, "il tetto si stringe quando l'esito si scrive")
    ok(Z.limite_puntata(0.97, 1000) == 0 and Z.limite_puntata(0.02, 1000) == 0, "il banco non accetta puntate sul sicuro")
    ok(Z.moltiplicatore_serie(0) == 1.0 and Z.moltiplicatore_serie(3) == 1.6 and Z.moltiplicatore_serie(5) == 2.0
       and Z.moltiplicatore_serie(99) == 2.0 and Z.moltiplicatore_serie(-4) == 1.0, "la serie paga fino al +100%")
    ok(Z.valore_incasso(100, 2.0, 0, 0.5) == 90 and Z.valore_incasso(100, 2.0, 5, 0.5) == 180
       and Z.valore_incasso(100, 2.0, 0, 0.0) == 0, "l'incasso e' il pagamento atteso meno il margine")
    ok(Z.valore_incasso(100, 2.0, 0, 0.7) > Z.valore_incasso(100, 2.0, 0, 0.3), "piu' vinci, piu' vale la puntata")
    # la folla segue chi batte le quote, ed e' a media zero: la fortuna, non la forza
    for p in (0.1, 0.3, 0.5, 0.8, 0.95):
        ok(abs(p * Z.sorpresa(p, True) + (1 - p) * Z.sorpresa(p, False)) < 1e-9, f"sorpresa a media zero (p={p})")
    ok(Z.sorpresa(0.1, True) > Z.sorpresa(0.9, True) > 0 and Z.sorpresa(0.9, False) < Z.sorpresa(0.1, False) < 0,
       "l'improbabile fa piu' rumore dell'ovvio")
    ok([Z.scarto(t) for t in (0, 24, 25, 49, 50, 74, 75, 100, -25, -50, -80)] == [0, 0, 1, 1, 2, 2, 3, 3, -1, -2, -3])
    for sc in range(-3, 4):
        dist = Z.distribuzione_ruota(sc)
        ok(abs(sum(x["prob"] for x in dist) - 1) < 1e-9, f"la ruota somma a 1 (scarto {sc})")
    ok(all(x["id"] != "jackpot" for x in Z.distribuzione_ruota(0)) and all(x["id"] != "jackpot" for x in Z.distribuzione_ruota(1)),
       "il jackpot c'e' solo con la folla dalla tua (scarto >= 2)")
    ok(any(x["id"] == "jackpot" for x in Z.distribuzione_ruota(2)))
    evs = [Z.ruota_ev_sd(sc)[0] for sc in range(-3, 4)]
    ok(all(a < b for a, b in zip(evs, evs[1:])), "piu' la folla e' con te, piu' la ruota rende")
    ok(-12 <= evs[3] <= -3 and evs[5] > 15 and evs[0] < -25, f"a pari la casa vince, con la folla si gioca in attivo: {evs}")
    ok(Z.p_ultima(0) == 0.4 and Z.p_ultima(2) == 0.6 and Z.p_ultima(-3) == 0.1)
    ok({c["id"] for c in Z.CLAUSOLE} == {"lampo", "stoico", "incassatore"} and all(c["k"] > 1 for c in Z.CLAUSOLE),
       "le clausole pagano piu' della puntata semplice ('bestia' e 'testa' sono state tolte: macchine da soldi)")
    ok(webapp.PROFILO["azzardo"] == 0.5 or 0.1 <= webapp.PROFILO["azzardo"] <= 0.9, "la CPU ha una manopola dell'azzardo")
    ok("azzardo" in webapp.LIMITI_PROFILO)
    nomi_effetti = {e["nome"] for e in DB["effetti"]}
    ok(set(Z.FORTUNA) | {"Esposto"} <= nomi_effetti, "gli effetti del gambling stanno in effects.json (li ritocca l'editor)")

    # il questionario di fine duello tara anche l'azzardo della CPU, dentro i limiti
    salvato_prof = dict(webapp.PROFILO)
    webapp.PROFILO["azzardo"] = 0.5
    webapp.aggiorna_profilo({"azzardo_troppo": "si"})
    ok(abs(webapp.PROFILO["azzardo"] - 0.4) < 1e-9, "troppo azzardo: la CPU azzarda meno")
    webapp.aggiorna_profilo({"azzardo_poco": "si"})
    webapp.aggiorna_profilo({"azzardo_poco": "si"})
    ok(abs(webapp.PROFILO["azzardo"] - 0.6) < 1e-9, "troppo poco: azzarda di piu'")
    for _ in range(20):
        webapp.aggiorna_profilo({"azzardo_poco": "si"})
    ok(webapp.PROFILO["azzardo"] == webapp.LIMITI_PROFILO["azzardo"][1], "mai oltre il limite")
    webapp.PROFILO.clear()
    webapp.PROFILO.update(salvato_prof)

    # ================================================================ senza arena: niente puntate, niente azzardi
    a, b = Personaggio("X"), Personaggio("Y")
    for x in (a, b):
        dotazione_base(x, DB["attacchi"], DB["stances"])
    d0 = webapp.DuelloWeb(pg=a, avversario=b)
    ok(d0.tavolo is None and d0.info_arena() is None and d0.stato()["folla"] is None, "il duello di sempre non ha il tavolo")
    ok(d0.azione_player({"tipo": "punta", "importo": 10}) == "questa modalità non ha scommesse")
    ok(d0.azione_player({"tipo": "azzardo", "id": "ruota"}) == "questa modalità non ha azzardi")
    ok(d0.stato()["menu"] is None or d0.stato()["menu"].get("azzardi") is None)
    d1 = coppia()
    ok(d1.tavolo is not None and not d1.tavolo.banco and d1.info_arena() is None, "azzardi accesi, soldi spenti")
    ok(d1.azione_player({"tipo": "punta", "importo": 10}) == "questa modalità non ha scommesse")

    # ================================================================ il Banco: puntate
    d = duello_vero(1000)
    t = d.tavolo
    ok(t is not None and t.banco and d.arena_attiva)
    info = d.info_arena()
    ok(info["unita"] == "¤" and info["fondi"] == 1000 and info["quota"] == Z.quota(d.prob_vittoria()), info)
    json.dumps(d.stato())
    q0 = d.quota_attuale()
    ok(d.azione_player({"tipo": "punta", "importo": 0}) == "importo non valido")
    ok(d.azione_player({"tipo": "punta", "importo": -5}) == "importo non valido")
    ok(d.azione_player({"tipo": "punta", "importo": "50"}) == "importo non valido")
    ok(d.azione_player({"tipo": "punta", "importo": 5000}) == "crediti insufficienti")
    ok(S["crediti"] == 1000)
    ok(d.azione_player({"tipo": "punta", "importo": 100}) is None and S["crediti"] == 900, "la posta lascia subito i crediti")
    ok(len(t.aperte()) == 1 and t.aperte()[0].quota == q0 and t.aperte()[0].importo == 100)
    ok(d.azione_player({"tipo": "scommetti", "importo": 50}) is None and S["crediti"] == 850, "'scommetti' resta un alias")
    ok(d.azione_player({"tipo": "punta", "importo": 10}) is None and d.azione_player({"tipo": "punta", "importo": 10}) is None)
    ok(len(t.aperte()) == 4 and d.azione_player({"tipo": "punta", "importo": 10}) == "puoi tenere aperte al massimo 4 puntate")
    # il tetto si stringe quando l'incontro e' deciso
    d2 = duello_vero(1000)
    for l in d2.cpu.hp:
        d2.cpu.hp[l] = 1
    ok(d2.prob_vittoria() > 0.9, d2.prob_vittoria())
    err = d2.azione_player({"tipo": "punta", "importo": 500})
    ok(err and err.startswith("il banco accetta al massimo") and S["crediti"] == 1000, err)
    ok(d2.tavolo.limite() < 500)
    # incasso anticipato
    d3 = duello_vero(1000)
    d3.azione_player({"tipo": "punta", "importo": 200})
    s = d3.tavolo.aperte()[0]
    atteso = Z.valore_incasso(200, s.quota, 0, d3.prob_vittoria())
    ok(d3.tavolo.incasso(s) == atteso)
    ok(d3.azione_player({"tipo": "incassa", "id": s.id}) is None and S["crediti"] == 800 + atteso and s.stato == "incassata")
    ok(d3.azione_player({"tipo": "incassa", "id": s.id}) == "puntata non trovata", "non si incassa due volte")
    ok(not d3.tavolo.aperte() and d3.tavolo.liquida(True)["totale"] == 0, "una puntata incassata non si paga alla fine")
    # incassare dopo un colpo subito vale meno
    d4 = duello_vero(1000)
    d4.azione_player({"tipo": "punta", "importo": 200})
    prima = d4.tavolo.incasso(d4.tavolo.aperte()[0])
    d4.p.hp["busto"] -= 60
    ok(d4.tavolo.incasso(d4.tavolo.aperte()[0]) < prima, "il valore di una puntata segue il duello")
    d4.finito = True
    ok(d4.azione_player({"tipo": "punta", "importo": 5}) == "il duello è concluso")

    # ================================================================ clausole
    d = duello_vero(1000)
    t = d.tavolo
    ok({c["id"] for c in t.clausole_firmabili()} == {"lampo", "incassatore"}, "senza poteri lo Stoico non si offre")
    d_p = duello_vero(1000, poteri=[{"id": DB["poteri"][0]["id"], "rango": 1}])
    ok({c["id"] for c in d_p.tavolo.clausole_firmabili()} == {"lampo", "stoico", "incassatore"})
    ok(d.azione_player({"tipo": "clausola", "id": "zz", "importo": 10}) == "clausola non disponibile")
    ok(d.azione_player({"tipo": "clausola", "id": "lampo", "importo": 0}) == "importo non valido")
    ok(d.azione_player({"tipo": "clausola", "id": "lampo", "importo": 100}) is None and S["crediti"] == 900)
    cl = t.aperte()[0]
    ok(cl.tipo == "clausola" and cl.cl == "lampo" and cl.quota == round(d.quota_attuale() * Z.clausola("lampo")["k"], 2))
    ok(d.azione_player({"tipo": "clausola", "id": "lampo", "importo": 10}) == "clausola non disponibile", "una clausola una volta sola")
    ok(d.azione_player({"tipo": "incassa", "id": cl.id}) == "le clausole non si incassano prima della fine")
    d.round = 2
    ok(t.clausole_firmabili() == [] and d.azione_player({"tipo": "clausola", "id": "incassatore", "importo": 10}) == "clausola non disponibile",
       "le clausole si firmano all'inizio")
    # condizioni
    d = duello_vero()
    t = d.tavolo
    d.round = 2
    ok(t.clausola_ok("lampo") and not t.clausola_fallita("lampo"))
    d.round = 4
    ok(not t.clausola_ok("lampo") and t.clausola_fallita("lampo"))
    ok(t.clausola_ok("stoico") and not t.clausola_fallita("stoico"))
    d.usato_potere = True
    ok(not t.clausola_ok("stoico") and t.clausola_fallita("stoico"))
    ok(not t.clausola_ok("incassatore"))
    d.p.hp["busto"] = 15              # (80 + 15) / 200 = 47,5% di testa e busto
    d._traccia_hp_minimo()
    ok(d.min_hp_crit < 0.5 and t.clausola_ok("incassatore"), d.min_hp_crit)

    # ================================================================ la liquidazione (a duello finito)
    def finisci(d, vinto):
        d.finito, d.fase = True, "fine"
        d.vincitore = d.p if vinto else d.cpu
        webapp.DUELLO = d
        webapp.chiudi_duello()
        webapp.DUELLO = None

    d = duello_vero(1000)
    d.azione_player({"tipo": "punta", "importo": 100})
    d.azione_player({"tipo": "clausola", "id": "lampo", "importo": 50})
    q, ql = d.tavolo.aperte()[0].quota, d.tavolo.aperte()[1].quota
    d.round = 2
    finisci(d, True)
    atteso = 850 + webapp.RICOMPENSA_VITTORIA + int(100 * q) + int(50 * ql)
    ok(S["crediti"] == atteso, (S["crediti"], atteso))
    ok(any("Esito vinta" in r["t"] for r in d.log) and any("Lampo" in r["t"] and "vinta" in r["t"] for r in d.log))
    d = duello_vero(1000)
    d.azione_player({"tipo": "punta", "importo": 100})
    d.azione_player({"tipo": "clausola", "id": "lampo", "importo": 50})
    d.round = 6                      # vince, ma tardi: la clausola salta, la puntata semplice paga
    q = d.tavolo.aperte()[0].quota
    finisci(d, True)
    ok(S["crediti"] == 850 + webapp.RICOMPENSA_VITTORIA + int(100 * q), S["crediti"])
    ok(any("persa" in r["t"] for r in d.log))
    d = duello_vero(1000)
    d.azione_player({"tipo": "punta", "importo": 300})
    finisci(d, False)
    ok(S["crediti"] == 700, "perdere la puntata: i soldi non tornano")
    # la serie alza il pagamento di tutte le puntate aperte
    d = duello_vero(1000)
    d.azione_player({"tipo": "punta", "importo": 100})
    q = d.tavolo.aperte()[0].quota
    d.tavolo.serie = 3
    finisci(d, True)
    ok(S["crediti"] == 900 + webapp.RICOMPENSA_VITTORIA + int(100 * q * 1.6), S["crediti"])
    # idempotente
    totale = S["crediti"]
    ok(d.tavolo.liquida(True)["totale"] == 0 and S["crediti"] == totale)

    # ================================================================ la serie
    d = coppia()
    t = d.tavolo
    ok(t.serie_riuscita() and t.serie == 1)
    for _ in range(10):
        t.serie_riuscita()
    ok(t.serie == Z.SERIE_MAX)
    t.serie_spezzata()
    ok(t.serie == 0)
    for l in d.cpu.hp:                                           # incontro deciso: la serie non conta
        d.cpu.hp[l] = 1
    ok(d.prob_vittoria() > Z.FINESTRA_SERIE[1] and not t.serie_riuscita() and t.serie == 0, "il banco non premia le serie sul sicuro")

    # ================================================================ la folla
    d = coppia()
    t = d.tavolo
    t.dopo_scambio(d.p, d.cpu, "nessuna risposta", True, 0.2, 10, "braccio_sx", set(), False)
    ok(t.tifo > 20, "un colpo improbabile a segno: la folla e' del giocatore")
    t2 = coppia().tavolo
    t2.dopo_scambio(t2.d.cpu, t2.d.p, "nessuna risposta", True, 0.2, 10, "braccio_sx", set(), False)
    ok(abs(t2.tifo + t.tifo) < 1e-9, "lo stesso colpo della CPU sposta il tifo dall'altra parte, della stessa misura")
    t3 = coppia().tavolo
    t3.dopo_scambio(t3.d.p, t3.d.cpu, "nessuna risposta", False, 0.9, 0, "busto", set(), False)
    ok(t3.tifo < -20, "sbagliare l'ovvio: la folla fischia")
    t4 = coppia().tavolo
    t4.dopo_scambio(t4.d.p, t4.d.cpu, "schivata", False, 0.0, 0, "busto", set(), False)
    ok(t4.tifo == -Z.SPETTACOLO["schivata"], "chi schiva si prende gli applausi")
    t5 = coppia().tavolo
    t5.dopo_scambio(t5.d.p, t5.d.cpu, "nessuna risposta", True, 0.5, 40, "busto", {"braccio_sx"}, True)
    ok(t5.tifo >= Z.K_SORPRESA * 0.5 + Z.SPETTACOLO["colpo_grosso"] + Z.SPETTACOLO["arto"] + Z.SPETTACOLO["knockout"] - 1e-6)
    ok(t.scarto(t.d.p) == -t.scarto(t.d.cpu), "il dado della folla e' uguale e contrario per i due lati")
    t.tifo = 100
    t.nuovo_round()
    ok(t.tifo == round(100 * Z.DECADIMENTO, 2), "a ogni round la folla si raffredda")
    ok(isinstance(t.testo_folla(), str))
    # ovazione: per chi la folla ama, qualunque sia il lato
    for lato_p in (True, False):
        d = coppia()
        t = d.tavolo
        favorito = d.p if lato_p else d.cpu
        t.spingi(favorito, 80)
        ok(abs(t.tifo) >= 80)
        t._ovazione()
        ok("Ovazione" in effetti(favorito) and "Ovazione" not in effetti(t.avversario(favorito)), "bonus a chi la folla ama")
        ok(abs(t.tifo) == 80 - Z.PERDITA_OVAZIONE and t.stat["ovazioni"] == 1)
        ok(any(e["tipo"] == "folla" for e in d.eventi))
    # una sola fortuna alla volta: il bonus piu' debole non scalza quello forte, l'opposto lo cancella
    d = coppia()
    t = d.tavolo
    t._fortuna(d.p, "Boato", 2)
    t._fortuna(d.p, "Incitamento", 3)
    ok(effetti(d.p) == ["Boato"] and d.p.effetti_attivi[0]["turni"] == 3, "il piu' forte resta, rinnovato")
    t._fortuna(d.p, "Fischi", 2)
    ok(effetti(d.p) == ["Fischi"], "la sfortuna cancella la fortuna")
    t._fortuna(d.p, "Furia", 3)
    ok(effetti(d.p) == ["Furia"])
    # i pip dell'effetto contano davvero: +2 al tiro per colpire e ai riflessi
    ok(webapp.bonus_colpire(d.p, d.cpu) == 2 and d.p.bonus_tiro("riflessi", d.cpu) == 2, "Furia = +2 a colpire e ai riflessi")

    # ================================================================ gli azzardi: chi e quando
    d = coppia()
    t = d.tavolo
    ok(t.puo_azzardare(d.p) == (True, None))
    ok(t.puo_azzardare(d.cpu) == (False, "non è il tuo turno"))
    d.p.bonus = 0
    ok(t.puo_azzardare(d.p) == (False, "azioni bonus esaurite"))
    d.p.bonus = 1
    ok(t.azzarda(d.cpu, "ruota") == "non è il tuo turno")
    ok(t.azzarda(d.p, "boh") == "azzardo sconosciuto")
    with dadi(5):
        ok(t.azzarda(d.p, "ruota") is None)
    ok(d.p.bonus == 0 and t.stat["ruota"] == 1)
    d.p.bonus = 1
    ok(t.azzarda(d.p, "ruota") == "hai già azzardato in questo turno")
    t.inizio_turno(d.p)
    ok(t.puo_azzardare(d.p)[0], "al turno dopo si puo' di nuovo")
    d.fase = "risposta"
    ok(t.puo_azzardare(d.p) == (False, "non è il tuo turno"), "non si azzarda mentre si risponde a un colpo")

    # ================================================================ la ruota, faccia per faccia (d10 + scarto)
    def gira(x, tifo=0.0, chi_p=True, prepara=None):
        d = coppia()
        chi = d.p if chi_p else d.cpu
        tocca_a(d, chi)
        d.tavolo.tifo = tifo if chi_p else -tifo
        if prepara:
            prepara(d, chi)
        with dadi(x):
            ok(d.tavolo.azzarda(chi, "ruota") is None)
        return d, chi

    for chi_p in (True, False):              # tutto vale uguale per i due lati
        d, chi = gira(1, chi_p=chi_p)
        ok("Sfiga nera" in effetti(chi) and chi.stamina == chi.stamina_max() - 2, "1: sfiga nera")
        d, chi = gira(2, chi_p=chi_p)
        ok(effetti(chi) == ["Fischi"] and chi.effetti_attivi[0]["turni"] == 3, "2: fischi (la sfortuna dura 3 turni)")
        d, chi = gira(3, chi_p=chi_p, prepara=lambda d, c: setattr(c, "locazione_casuale", lambda: "gamba_sx"))
        ok(chi.hp["gamba_sx"] == 100 - Z.BOTTIGLIA_DANNO, "3: bottiglia")
        for x in (4, 5):
            d, chi = gira(x, chi_p=chi_p)
            ok(not chi.effetti_attivi and chi.hp == chi.hp_max and chi.azioni == chi.n_azioni, f"{x}: silenzio")
        d, chi = gira(6, chi_p=chi_p)
        ok(effetti(chi) == ["Incitamento"] and chi.effetti_attivi[0]["turni"] == 2, "6: incitamento (la fortuna, 2)")
        d, chi = gira(7, chi_p=chi_p, prepara=lambda d, c: setattr(c, "stamina", 3))
        ok(chi.azioni == chi.n_azioni + 1 and chi.stamina == 5, "7: adrenalina")
        d, chi = gira(8, chi_p=chi_p, prepara=lambda d, c: c.hp.update(braccio_dx=40, gamba_sx=70))
        ok(chi.hp["braccio_dx"] == 65 and chi.hp["gamba_sx"] == 70, "8: medikit alla locazione piu' ferita")
        d, chi = gira(9, chi_p=chi_p)
        ok(chi.armatura["busto"] == 25, "9: giubbotto")
        d, chi = gira(10, chi_p=chi_p)
        ok(effetti(chi) == ["Boato"], "10: boato")
        d, chi = gira(10, tifo=55, chi_p=chi_p, prepara=lambda d, c: c.hp.update(busto=100))
        ok(effetti(chi) == ["Furia"] and chi.hp["busto"] == 120 and chi.azioni == chi.n_azioni + 1, "scarto +2, d10 10: JACKPOT")
        ok(d.tavolo.stat["esiti"] == {"jackpot": 1})
    # la bottiglia non uccide mai
    d, chi = gira(3, prepara=lambda d, c: (c.hp.update(busto=5), setattr(c, "locazione_casuale", lambda: "busto")))
    ok(chi.hp["busto"] == 1 and not chi.sconfitto(), "la bottiglia lascia almeno 1 hp")
    d, chi = gira(3, prepara=lambda d, c: (c.hp.update(testa=10), c.armatura.update(testa=4), setattr(c, "locazione_casuale", lambda: "testa")))
    ok(chi.hp["testa"] >= 1 and not chi.sconfitto())
    # la folla dalla tua sposta il dado: lo stesso d10 vale di piu'
    d, chi = gira(8, tifo=60)            # scarto +2: 8 + 2 = 10 -> boato (a pari sarebbe un medikit)
    ok(effetti(chi) == ["Boato"], "con la folla dalla tua lo stesso d10 vale di piu'")
    d, chi = gira(3, tifo=-60)           # scarto -2: 3 - 2 = 1 -> sfiga nera
    ok("Sfiga nera" in effetti(chi), "con la folla contro un 3 diventa sfiga")
    # una ruota riuscita consuma meta' del tifo; il giocatore guadagna la serie, la CPU no (non ha soldi)
    d, chi = gira(8, tifo=60)                  # scarto +2: 8 + 2 = 10, un boato (non il jackpot)
    ok(d.tavolo.tifo == 30.0 and d.tavolo.serie == 1, (d.tavolo.tifo, d.tavolo.serie))
    d, chi = gira(10, tifo=60)                 # 10 + 2 = 12: jackpot, vale una serie doppia
    ok(d.tavolo.serie == 2)
    d, chi = gira(8, tifo=60, chi_p=False)
    ok(d.tavolo.tifo == -30.0 and d.tavolo.serie == 0, "la serie e' dei soldi del giocatore")
    d, chi = gira(1, prepara=lambda d, c: setattr(d.tavolo, "serie", 3))
    ok(d.tavolo.serie == 0, "un esito brutto spezza la serie")
    d, chi = gira(4, prepara=lambda d, c: setattr(d.tavolo, "serie", 3))
    ok(d.tavolo.serie == 3, "il silenzio non la tocca")
    ev = [e for e in d.eventi if e["tipo"] == "azzardo"][-1]
    ok(ev["azzardo"] == "ruota" and ev["tiro"] == 4 and ev["totale"] == 4 and ev["chi"] == "p", ev)

    # ================================================================ il rilancio
    def prepara_rilancio(liv, chi_p=True):
        d = coppia()
        chi = d.p if chi_p else d.cpu
        tocca_a(d, chi)
        ok(d.tavolo.azzarda(chi, "rilancia", liv) is None)
        return d, chi

    d = coppia()
    ok(d.tavolo.azzarda(d.p, "rilancia", 9) == "livello non valido")
    d.p.azioni = 0
    ok(d.tavolo.azzarda(d.p, "rilancia", 1) == "serve almeno un'azione per attaccare")
    d, chi = prepara_rilancio(1)
    ok(d.tavolo.rilancio_attivo(chi) == 1 and chi.bonus == 0)
    chi.bonus = 1
    d.tavolo.azzardato.clear()
    ok(d.tavolo.azzarda(chi, "rilancia", 2) == "hai già rilanciato la posta")
    # a segno: il danno cresce, una volta sola (lo stesso per i due lati)
    normale = PUGNO["danno"]["flat"] + 16             # 40 + il margine massimo (8 x 2)
    for chi_p in (True, False):
        for liv, mult in ((1, 1.4), (2, 2.5)):
            d, chi = prepara_rilancio(liv, chi_p)
            ok(d.tavolo.danno_rilanciato(chi, d.altro, "braccio_sx", normale) == int(normale * mult), (liv, mult))
            ok(d.tavolo.rilancio_attivo(chi) == 0 and d.tavolo.stat["rilanci_ok"] == 1)
            ok(d.tavolo.danno_rilanciato(chi, d.altro, "braccio_sx", normale) == normale, "dopo il primo colpo il danno e' normale")
        d, chi = prepara_rilancio(1, chi_p)
        dif = d.altro
        colpo(d, 20, 1, loc="braccio_sx")
        atteso = int(normale * 1.4)
        ok(dif.hp["braccio_sx"] == 100 - atteso, (chi_p, dif.hp["braccio_sx"], atteso))
        ok(d.tavolo.rilancio_attivo(chi) == 0 and d.tavolo.stat["rilanci_ok"] == 1)
        ok(d.tavolo.tifo * (1 if chi_p else -1) >= 12, "un rilancio riuscito accende la folla")
        colpo(d, 20, 1, loc="gamba_sx")                # il secondo colpo e' normale
        ok(dif.hp["gamba_sx"] == 100 - normale)
    # il rilancio non uccide da solo: lascia 1 hp, ma un colpo che uccideva gia' uccide
    d, chi = prepara_rilancio(2)
    d.altro.hp["busto"] = 100
    colpo(d, 20, 1)
    ok(d.altro.hp["busto"] == 1 and not d.finito, "Tutto o niente non chiude da solo")
    d, chi = prepara_rilancio(2)
    d.altro.hp["busto"] = 30
    colpo(d, 20, 1)
    ok(d.altro.hp["busto"] <= 0 and d.finito, "...ma il colpo che uccideva gia' uccide")
    # la parata dimezza il colpo rilanciato (prima il rilancio, poi la parata)
    d, chi = prepara_rilancio(1)
    colpo(d, 20, 1, scelta="parata", loc_parata="gamba_dx")
    ok(d.altro.hp["gamba_dx"] == 100 - int(normale * 1.4) // 2, d.altro.hp["gamba_dx"])
    # mancato: si paga (risposta, Esposto, azioni, contraccolpo)
    d, chi = prepara_rilancio(1)
    random.choice, scelta_orig = (lambda seq: seq[0]), random.choice
    try:
        colpo(d, 3, 10)
    finally:
        random.choice = scelta_orig
    ok(chi.risposte == 0 and effetti(chi) == ["Esposto"] and chi.azioni == chi.n_azioni and chi.hp == chi.hp_max,
       "Rilancio mancato: perde la risposta e resta Esposto, nient'altro")
    ok(d.tavolo.stat["rilanci_ko"] == 1 and d.tavolo.rilancio_attivo(chi) == 0)
    ok(chi.bonus_tiro("riflessi", d.altro) == -1, "Esposto = -1 ai riflessi")
    d, chi = prepara_rilancio(2)
    random.choice, scelta_orig = (lambda seq: seq[0]), random.choice
    try:
        colpo(d, 3, 10)
    finally:
        random.choice = scelta_orig
    ok(effetti(chi) == ["Esposto", "Esposto"] and chi.azioni == 0 and chi.risposte == 0, "Tutto o niente mancato costa di piu'")
    perso = int(Z.RILANCIO[2]["contraccolpo"] * Z.RILANCIO[2]["mult"] * webapp.stima_colpo(PUGNO))
    ok(chi.hp["braccio_sx"] == 100 - perso and all(chi.hp[l] == 100 for l in ("braccio_dx", "gamba_sx", "gamba_dx")),
       "il contraccolpo e' a un arto, mai a testa o busto")
    ok(chi.hp["testa"] == 80 and chi.hp["busto"] == 120)
    # un rilancio non usato scade a fine turno, senza costi
    d, chi = prepara_rilancio(2)
    d.fine_turno()
    ok(d.tavolo.rilancio_attivo(chi) == 0 and not chi.effetti_attivi and chi.risposte == chi.n_risposte)
    # contro chi e' in volo (le mosse in mischia non lo raggiungono) il colpo e' mancato
    d, chi = prepara_rilancio(1)
    d.altro.stance_attive.append({"def": {"id": 99, "nome": "Volo", "modificatori": [{"tipo": "immune_melee"}]}, "turni": 2})
    d.usa_attacco(PUGNO)
    ok(d.tavolo.stat["rilanci_ko"] == 1 and chi.risposte == 0, "un colpo che non arriva si paga lo stesso")
    # il rilancio e' dell'attaccante: la risposta di chi lo subisce vede il danno gia' maggiorato
    d, chi = prepara_rilancio(1)
    ok(d.stato()["player"]["azzardo"]["rilancio"] == 1, "il pannello mostra il rilancio in corso")

    # ================================================================ l'ultima puntata
    d = coppia()
    t = d.tavolo
    ok(t.azzarda(d.p, "ultima") == "l'Ultima Puntata si gioca una volta sola, a un passo dalla fine")
    ok(not t.menu(d.p)["ultima"]["ok"])
    for chi_p in (True, False):
        d = coppia()
        chi = d.p if chi_p else d.cpu
        tocca_a(d, chi)
        chi.hp["busto"] = 30                 # 25% del busto: sull'orlo
        ok(d.tavolo.puo_ultima(chi) and d.tavolo.menu(chi)["ultima"]["ok"])
        with dadi(7):
            ok(d.tavolo.azzarda(chi, "ultima") is None)
        ok(chi.hp["busto"] == 54 and chi.hp["testa"] == 80 and chi.azioni == chi.n_azioni + 1 and effetti(chi) == ["Furia"],
           (chi.hp, effetti(chi)))
        ok(not d.finito and d.tavolo.tifo * (1 if chi_p else -1) >= 40)
        ok(not d.tavolo.puo_ultima(chi), "una volta per duello")
        chi.hp["busto"] = 10
        d.tavolo.azzardato.clear()
        chi.bonus = 1
        ok(d.tavolo.azzarda(chi, "ultima") != None)
        ok(d.tavolo.stat["ultime_ok"] == 1)
        # il crollo: si finisce in zona morte e l'altro vince
        d = coppia()
        chi = d.p if chi_p else d.cpu
        tocca_a(d, chi)
        chi.hp["testa"] = 10
        with dadi(6):
            ok(d.tavolo.azzarda(chi, "ultima") is None)
        ok(chi.hp["testa"] == -80 and d.finito and d.vincitore is d.tavolo.avversario(chi), "il crollo e' una sconfitta")
    # a un passo dalla fine: con la folla dalla tua e' piu' probabile, contro e' piu' difficile
    d = coppia()
    d.p.hp["busto"] = 30
    d.tavolo.tifo = 55
    ok(d.tavolo.menu(d.p)["ultima"]["p"] == Z.p_ultima(2) and d.tavolo.menu(d.cpu)["ultima"]["p"] == Z.p_ultima(-2))
    # nella palestra il crollo puo' uccidere, e il giocatore lo sa in anticipo
    def allievo(**ov):
        S.clear()
        S.update(webapp.stato_default())
        rec = webapp.nuovo_aspirante(set(), [])
        rec.pop("costo", None)
        rec["id"] = S["prossimo_id"]
        S["prossimo_id"] += 1
        rec["tratti_noti"] = len(rec["tratti"])
        rec.update(ov)
        S["personaggi"].append(rec)
        S["crediti"] = 1000
        return rec

    d = webapp.DuelloWeb(allievo(toughness=10))
    tocca_a(d, d.p)
    d.p.hp["busto"] = 20
    ok(d.tavolo.rischio_morte(d.p) == 0.65 and d.tavolo.rischio_morte(d.cpu) is None, d.tavolo.rischio_morte(d.p))
    ok(d.tavolo.menu(d.p)["ultima"]["rischio_morte"] == 0.65)
    orig_random = random.random
    for morto, forzato in ((True, 0.0), (False, 0.99)):
        d = webapp.DuelloWeb(allievo(toughness=10))
        tocca_a(d, d.p)
        d.p.hp["busto"] = 20
        with dadi(1):
            d.tavolo.azzarda(d.p, "ultima")
        ok(d.finito and d.p.hp["busto"] == -120)
        random.random = lambda: forzato
        try:
            webapp.DUELLO = d
            webapp.chiudi_duello()
        finally:
            random.random = orig_random
            webapp.DUELLO = None
        ok(bool(d.rec.get("morto")) == morto, "il crollo dell'Ultima Puntata puo' uccidere l'allievo")
    # nel Torneo Evo non c'e' la morte: il rischio non esiste
    t6 = webapp.TorneoEvo()
    dt = webapp.DuelloWeb(pg=t6.eroi[t6.io], avversario=t6.eroi[t6.avversario_idx()], torneo=t6)
    ok(dt.rischio_morte(dt.p) is None)

    # ================================================================ la CPU azzarda con le stesse regole
    def cpu_vuole(chi_p, pol="folle", prepara=None):
        d = coppia()
        chi = d.p if chi_p else d.cpu
        tocca_a(d, chi)
        chi.pol_azzardo = pol
        d.tavolo.voglia[d.tavolo.lato(chi)] = 0.0
        if prepara:
            prepara(d, chi)
        return d, chi, d.tavolo.cpu_azzarda(chi, 1.0)
    for chi_p in (True, False):
        random.seed(5)
        d, chi, fatto = cpu_vuole(chi_p)
        ok(fatto and chi.bonus == 0 and d.tavolo.lato(chi) in d.tavolo.azzardato, "l'IA azzarda da entrambi i lati")
        d, chi, fatto = cpu_vuole(chi_p, pol="mai")
        ok(not fatto and chi.bonus == 1, "chi non vuole azzardare non azzarda")
    # saggia: con la folla dalla tua e il dado a favore gira la ruota; nel vantaggio netto non gioca d'azzardo
    d, chi, fatto = cpu_vuole(False, pol="saggio", prepara=lambda d, c: setattr(d.tavolo, "tifo", -70))
    ok(fatto and d.tavolo.stat["ruota"] == 1, "la CPU con la folla dalla sua gira la ruota")
    d, chi, fatto = cpu_vuole(False, pol="saggio", prepara=lambda d, c: (setattr(d.tavolo, "tifo", 0.0), c.hp.update({l: 5 for l in c.hp})))
    ok(fatto and d.tavolo.stat["ultima"] == 1, "disperata gioca l'Ultima Puntata")
    d, chi, fatto = cpu_vuole(False, pol="saggio", prepara=lambda d, c: d.p.hp.update({l: 5 for l in d.p.hp}))
    ok(not fatto and d.tavolo.stat["ruota"] == 0, "in vantaggio netto non rischia")
    # il turno non si blocca: la CPU di duelli interi finisce sempre
    random.seed(11)
    for i in range(60):
        usati = set()
        ps = []
        for _ in range(2):
            p = personaggio_casuale(DB["attacchi"], DB["poteri"], DB["stances"], usati)
            usati.add(p.nome)
            p.pol_azzardo = random.choice(("saggio", "folle", "mai"))
            ps.append(p)
        d = webapp.DuelloWeb(pg=ps[0], avversario=ps[1], azzardo_attivo=True)
        d.tavolo.tifo = random.uniform(-90, 90)
        passi = 0
        while not d.finito and d.round < 120 and passi < 5000:
            passi += 1
            if d.fase == "risposta":
                scelta, loc = d.scegli_difesa(d.p, d.pending)
                d.risolvi_risposta(scelta, loc)
            elif d.fase in ("player", "cpu"):
                d.cpu_step()
            else:
                break
            ok(-Z.TIFO_MAX <= d.tavolo.tifo <= Z.TIFO_MAX and d.p.bonus >= 0 and d.cpu.bonus >= 0)
        ok(d.finito, "ogni duello con gli azzardi finisce")
        json.dumps(d.stato())
    # chi non azzarda mai non azzarda mai; chi e' folle azzarda spesso
    for pol, minimo in (("mai", 0), ("folle", 8)):
        random.seed(3)
        tot = 0
        for i in range(10):
            a, b = personaggio_casuale(DB["attacchi"], DB["poteri"], DB["stances"], set()), Personaggio("B")
            dotazione_base(b, DB["attacchi"], DB["stances"])
            a.pol_azzardo = b.pol_azzardo = pol
            d = webapp.DuelloWeb(pg=a, avversario=b, azzardo_attivo=True)
            while not d.finito and d.round < 120:
                if d.fase == "risposta":
                    scelta, loc = d.scegli_difesa(d.p, d.pending)
                    d.risolvi_risposta(scelta, loc)
                else:
                    d.cpu_step()
            tot += d.tavolo.stat["ruota"] + d.tavolo.stat["rilancia"] + d.tavolo.stat["ultima"]
        ok(tot == 0 if pol == "mai" else tot >= minimo, (pol, tot))

    # ================================================================ l'API del duello
    d = duello_vero(1000)
    webapp.DUELLO = d
    cli = webapp.app.test_client()
    r = cli.get("/api/duello/stato").get_json()
    ok(r["arena"]["quota"] == d.quota_attuale() and r["folla"]["tifo"] == 0 and r["menu"]["azzardi"]["disponibile"], r["folla"])
    ok(set(r["menu"]["azzardi"]) >= {"ruota", "rilancia", "ultima", "scarto", "motivo"} and "colpo" in r["menu"]["azzardi"]["rilancia"])
    ok(set(r["player"]["azzardo"]) == {"rilancio", "mult", "ultima", "scarto"} and set(r["cpu"]["azzardo"]) == set(r["player"]["azzardo"]),
       "lo stesso pannello per i due lati")
    r = cli.post("/api/duello/azione", json={"tipo": "punta", "importo": 100}).get_json()
    ok("errore" not in r and len(r["arena"]["schedine"]) == 1 and r["arena"]["fondi"] == 900, r.get("errore"))
    r = cli.post("/api/duello/azione", json={"tipo": "punta", "importo": 99999}).get_json()
    ok(r["errore"] == "crediti insufficienti")
    sid = r["arena"]["schedine"][0]["id"]
    ok(r["arena"]["schedine"][0]["incasso"] is not None)
    r = cli.post("/api/duello/azione", json={"tipo": "incassa", "id": sid}).get_json()
    ok("errore" not in r and r["arena"]["schedine"][0]["stato"] == "incassata")
    tocca_a(d, d.p)
    with dadi(4):
        r = cli.post("/api/duello/azione", json={"tipo": "azzardo", "id": "ruota"}).get_json()
    ok("errore" not in r and r["menu"]["azzardi"]["disponibile"] is False and r["eventi"][-1]["tipo"] == "azzardo", r.get("errore"))
    r = cli.post("/api/duello/azione", json={"tipo": "azzardo", "id": "ruota"}).get_json()
    ok(r["errore"] == "azioni bonus esaurite" or r["errore"] == "hai già azzardato in questo turno")
    tocca_a(d, d.cpu)
    r = cli.post("/api/duello/azione", json={"tipo": "azzardo", "id": "ruota"}).get_json()
    ok(r["errore"] == "non è il tuo turno")
    webapp.DUELLO = None

    # ================================================================ il Torneo Evo: puntate in punti, mai in crediti
    S["crediti"] = 500
    t7 = webapp.TorneoEvo()
    t7.fase = "pronto"
    dt = webapp.DuelloWeb(pg=t7.eroi[t7.io], avversario=t7.eroi[t7.avversario_idx()], torneo=t7)
    tocca_a(dt, dt.p)
    ok(dt.arena_attiva and dt.tavolo.banco and dt.info_arena()["unita"] == "pt" and dt.info_arena()["torneo_pot"] == 0)
    ok(dt.azione_player({"tipo": "punta", "importo": 999999}) == "puntata massima nel torneo: 500 pt")
    ok(dt.azione_player({"tipo": "punta", "importo": 100}) is None and S["crediti"] == 500, "i punti non sono crediti")
    ok(dt.azione_player({"tipo": "clausola", "id": "lampo", "importo": 40}) is None and S["crediti"] == 500)
    s = dt.tavolo.aperte()[0]
    ok(dt.azione_player({"tipo": "incassa", "id": s.id}) is None and t7.bonus_accumulato == dt.tavolo.schedine[0].incassata > 0,
       "l'incasso anticipato va nel punteggio")
    pot = t7.bonus_accumulato
    ql = dt.tavolo.aperte()[0].quota
    dt.round = 2                      # vince entro il round 3: la clausola Lampo paga
    dt.finito, dt.fase, dt.vincitore = True, "fine", dt.p
    t7.risolvi_duello(True, dt)
    ok(t7.bonus_accumulato == pot + int(40 * ql), (t7.bonus_accumulato, pot, ql))
    ok(S["crediti"] == 500, "mai crediti veri")
    ok(any("vinta" in r for r in t7.log_arena))
    t8 = webapp.TorneoEvo()
    t8.fase = "pronto"
    dt = webapp.DuelloWeb(pg=t8.eroi[t8.io], avversario=t8.eroi[t8.avversario_idx()], torneo=t8)
    tocca_a(dt, dt.p)
    dt.azione_player({"tipo": "punta", "importo": 100})
    dt.finito, dt.fase, dt.vincitore = True, "fine", dt.cpu
    t8.risolvi_duello(False, dt)
    ok(t8.bonus_accumulato == 0 and S["crediti"] == 500 and t8.fase == "eliminato")

    print(f"OK: {n_check} verifiche")


if __name__ == "__main__":
    main()
