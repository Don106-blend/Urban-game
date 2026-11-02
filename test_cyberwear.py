"""Check dei nuovi impianti (tools/fase8_cyberwear.py, CYBERWARE.md sez. 6) e della clausola Stoico. python test_cyberwear.py
Gira su un salvataggio temporaneo; i dadi si controllano a mano dove serve."""
import atexit
import os
import random
import shutil
import tempfile

_SAVE_TMP = tempfile.mkdtemp(prefix="urban_test_cyberwear_")
os.environ["URBAN_SAVE_DIR"] = _SAVE_TMP
atexit.register(shutil.rmtree, _SAVE_TMP, ignore_errors=True)

import app as W  # noqa: E402
import engine as E  # noqa: E402

DB = W.DB
n = 0


def ok(c, m=""):
    global n
    n += 1
    assert c, m


def aug(nome):
    return next(x for x in DB["augments"] if x["nome"] == nome)


def prot(nome):
    return next(x for x in DB["protesi"] if x["nome"] == nome)


def att(nome):
    return next(x for x in DB["attacchi"] if x["nome"] == nome)


def eroe(nome, *augments, mente=1, **stats):
    """Un combattente con questi impianti: i passivi gia' accesi, gli attivi pronti (come record_to_pg)."""
    p = E.Personaggio(nome)
    E.dotazione_base(p, DB["attacchi"], DB["stances"])
    p.stats["mente"] = mente
    p.stats.update(stats)
    for nm in augments:
        slot = {"def": aug(nm), "rango": 1, "attivo": False}
        p.augments.append(slot)
        if not slot["def"].get("attivo", True):
            p.attiva_potere(slot, DB["attacchi"], DB["stances"], DB["effetti"])
    p.init_stamina()
    return p


def slot_di(p, nome):
    return next(s for s in p.augments if s["def"]["nome"] == nome)


def duello(p, c):
    """Un duello con p come giocatore, a turno suo, con le risorse piene."""
    d = W.DuelloWeb(pg=p, avversario=c)
    d.attivo, d.altro = p, c
    p.azioni, p.bonus, p.risposte = p.n_azioni, p.n_bonus, p.n_risposte
    c.azioni, c.bonus, c.risposte = c.n_azioni, c.n_bonus, c.n_risposte
    d.fase = "player"
    return d


def dadi(attaccante, mente=None):
    """Dadi truccati: l'attaccante colpisce sempre (100), il difensore tira 1; `mente` fissa il suo dado Mente."""
    def tira(self, tipo, avversario=None):
        if self is attaccante:
            return mente if (tipo == "mente" and mente is not None) else 100
        return 1
    return tira


def main():
    # ============================================================ i dati
    nomi = ["Speedwear", "Convertitore nutrizionale", "Modulo DDOS", "Modulo di IA predittiva", "Cuscinetto di emergenza", "Berserker",
            "IA supportiva", "Armatura subdermale \"Biohazard\""]
    ok(all(any(a["nome"] == nm for a in DB["augments"]) for nm in nomi), "gli 8 impianti ci sono")
    ok(aug("Speedwear")["attivo"] and aug("Speedwear")["durata_turni"] == 3 and aug("Speedwear")["usi_massimi"] == 1, "Speedwear: 3 turni, 1 uso")
    ok(aug("Convertitore nutrizionale")["costo_bonus"] and aug("Convertitore nutrizionale")["istantaneo"], "Convertitore: azione bonus")
    ok(not aug("Modulo DDOS")["attivo"] and not aug("Cuscinetto di emergenza")["attivo"] and not aug("Berserker")["attivo"]
       and not aug("IA supportiva")["attivo"] and not aug("Armatura subdermale \"Biohazard\"")["attivo"], "i passivi sono passivi")
    ok(att("Morso")["cooldown_turni"] == 3 and att("DDOS")["usi_limitati"] and att("DDOS")["usi_massimi"] == 1, "Morso 3 turni, DDOS 1 uso")
    cyber = [x for x in DB["attacchi"] if x["nome"] == "Artigli sanguinari"]
    ok(len(cyber) == 1 and cyber[0]["cooldown_turni"] == 3, "gli Artigli sanguinari delle protesi hanno ricarica 3")
    ok(att("Artigli Sanguinari")["cooldown_turni"] == 0 and att("Artigli Sanguinari")["id"] != cyber[0]["id"],
       "...e non toccano quelli del potere Appendici Affilate")
    ok(prot("Wolf fangs")["locazione"] == "testa" and prot("Cyber artigli (dx)")["locazione"] == "braccio_dx"
       and prot("Cyber artigli (sx)")["locazione"] == "braccio_sx", "le protesi stanno ai loro posti")
    ok(all(x["costo_umanita"] >= 1 and x["valore"] > 0 for x in DB["augments"] + DB["protesi"]), "tutto costa Umanita' e crediti")

    # ============================================================ il bug: la clausola Stoico conta solo i poteri
    p, c = eroe("Ada", "Speedwear"), eroe("Bea")
    pw = {"def": next(x for x in DB["poteri"] if x["nome"] == "Supervelocità"), "rango": 1, "attivo": False}
    p.poteri.append(pw)
    d = duello(p, c)
    ok(not d.usato_potere)
    d.usa_augment(p, slot_di(p, "Speedwear"))
    ok(slot_di(p, "Speedwear")["attivo"] and not d.usato_potere, "un augment NON e' un potere: Stoico resta valido")
    d.usa_potere(p, pw)
    ok(d.usato_potere, "un potere sì")

    # ============================================================ Speedwear: come Supervelocita' al rango 1
    p = eroe("Ada", "Speedwear")
    p.stamina = 6
    ok(p.rango_potere_attivo("Supervelocità") == 0)
    p.azioni, p.bonus = 3, 1
    righe = p.attiva_augment(slot_di(p, "Speedwear"), DB["attacchi"], DB["stances"], DB["effetti"])
    ok(p.n_bonus == 2 and p.bonus == 2 and p.n_azioni == E.AZIONI_BASE, "+1 azione bonus come Supervelocita' r1")
    ok(any(a["nome"] == "Attacco Rapido" for a in p.attacchi) and any(s["def"]["nome"] == "Riflessi Aumentati" for s in p.stance_attive),
       "Attacco Rapido e Riflessi Aumentati")
    ok(p.rango_potere_attivo("Supervelocità") == 1 and W.pannello(p, True)["extra"]["velocita"] == 1, "si vede: velocita' 1 nella scena")
    ok(not p.puo_attivare_augment(slot_di(p, "Speedwear")), "una sola volta per combattimento")
    for _ in range(2):
        p.tick_turno()
    ok(slot_di(p, "Speedwear")["attivo"], "dopo 2 turni e' ancora acceso")
    p.tick_turno()
    ok(not slot_di(p, "Speedwear")["attivo"] and p.n_bonus == 1 and p.rango_potere_attivo("Supervelocità") == 0,
       "dopo 3 turni si spegne e restituisce tutto")
    ok(not p.puo_attivare_augment(slot_di(p, "Speedwear")), "...e non si riaccende")
    # Supervelocita' vera: Speedwear non la sostituisce, ma i ranghi non si sommano (vale il piu' alto)
    p2 = eroe("Zoe", "Speedwear")
    p2.poteri.append({"def": next(x for x in DB["poteri"] if x["nome"] == "Supervelocità"), "rango": 3, "attivo": True})
    p2.attiva_augment(slot_di(p2, "Speedwear"), DB["attacchi"], DB["stances"], DB["effetti"])
    ok(p2.rango_potere_attivo("Supervelocità") == 3)

    # ============================================================ Convertitore nutrizionale: 3 stamina -> 1 azione, con un bonus
    p, c = eroe("Ada", "Convertitore nutrizionale"), eroe("Bea")
    d = duello(p, c)
    sl = slot_di(p, "Convertitore nutrizionale")
    p.stamina = 2
    ok(not p.puo_attivare_augment(sl), "con meno di 3 stamina non si puo'")
    p.stamina = 7
    ok(p.puo_attivare_augment(sl) and p.puo_pagare_augment(sl))
    az0, bo0 = p.azioni, p.bonus
    d.usa_augment(p, sl)
    ok(p.stamina == 4 and p.azioni == az0 + 1 and p.bonus == bo0 - 1, (p.stamina, p.azioni, p.bonus))
    ok(not sl["attivo"], "non resta acceso: si puo' rifare")
    ok(not p.puo_pagare_augment(sl), "ma costa l'unica azione bonus del turno")
    ok(any(x["id"] == sl["def"]["id"] and x["costo"] == "bonus" for x in d.azioni_player()["augment"]), "il menu dice che costa un bonus")
    err = d._azione_player({"tipo": "augment", "id": sl["def"]["id"]})
    ok(err == "azioni bonus esaurite", err)

    # ============================================================ Modulo DDOS: la mossa, una volta, e il blocco degli augment
    orig = E.Personaggio.tira
    try:
        p, c = eroe("Ada", "Modulo DDOS", mente=2), eroe("Bea", "Speedwear", "Convertitore nutrizionale", "Modulo di IA predittiva")
        d = duello(p, c)
        ddos = att("DDOS")
        ok(any(a["id"] == ddos["id"] for a in p.attacchi), "il modulo sblocca la mossa")
        slot_c = slot_di(c, "Speedwear")
        c.attiva_augment(slot_c, DB["attacchi"], DB["stances"], DB["effetti"])
        E.Personaggio.tira = dadi(p, mente=3)
        hp0 = sum(c.hp.values())
        d.usa_attacco(ddos)
        ok(c.ddos_turni == 4, c.ddos_turni)
        ok(sum(c.hp.values()) == hp0, "il DDOS non fa danni, nemmeno col margine")
        ok(slot_c["attivo"], "gli augment gia' accesi non si spengono")
        ok(not c.puo_attivare_augment(slot_di(c, "Convertitore nutrizionale")) and not c.puo_attivare_augment(slot_di(c, "Modulo di IA predittiva")),
           "ma non se ne accende nessun altro")
        ok(not p.puo_usare_attacco(ddos), "il DDOS si usa una volta sola")
        for turno in range(3):
            c.tick_turno()
            ok(c.ddos_turni > 0 and not c.puo_attivare_augment(slot_di(c, "Modulo di IA predittiva")), f"turno {turno + 1}: ancora bloccato")
        righe = c.tick_turno()
        ok(c.ddos_turni == 0 and any("DDOS" in r for r in righe), "dopo 3 turni (1d Mente = 3) finisce")
        c.stamina = 9
        ok(c.puo_attivare_augment(slot_di(c, "Modulo di IA predittiva")) and c.puo_attivare_augment(slot_di(c, "Convertitore nutrizionale")))
        # la riaccensione automatica dei passivi aspetta la fine del DDOS
        c2 = eroe("Cat", "Berserker")
        c2.applica_emp(1)
        c2.emp_turni = 0
        c2.ddos_turni = 2
        c2.tick_turno()                         # (un impianto spento da un EMP si riaccende dal turno dopo)
        d._riattiva_augment_passivi(c2)
        ok(not slot_di(c2, "Berserker")["attivo"], "sotto DDOS i passivi spenti dall'EMP non tornano")
        c2.ddos_turni = 0
        d._riattiva_augment_passivi(c2)
        ok(slot_di(c2, "Berserker")["attivo"])
    finally:
        E.Personaggio.tira = orig

    # ============================================================ Modulo di IA predittiva: niente schivata, ricarica 10 - 1d Mente (min 2)
    p, c = eroe("Ada"), eroe("Bea", "Modulo di IA predittiva")
    d = duello(p, c)                        # Ada e' il giocatore (subisce), Bea e' la CPU col modulo e gioca il suo turno
    d.attivo, d.altro = c, p
    sl = slot_di(c, "Modulo di IA predittiva")
    orig = E.Personaggio.tira
    E.Personaggio.tira = dadi(c, mente=8)
    try:
        d.usa_augment(c, sl)
    finally:
        E.Personaggio.tira = orig
    ok(p.reazioni_bloccate and not p.puo_schivare(), "l'avversario non puo' schivare")
    ok(sl["def"]["ricarica"] == {"base": 10, "dado": "mente", "min": 2}, "i dati")
    ok(c.stato_augment(sl["def"])["cooldown"] == 2, "10 - 8 = 2, il minimo: " + str(c.stato_augment(sl["def"])["cooldown"]))
    ok(not c.puo_attivare_augment(sl), "in ricarica")
    d.usa_attacco(att("Pugno"))                 # Ada deve rispondere: la schivata non c'e'
    ok(d.fase == "risposta" and "schivata" not in d.pending["opzioni"] and "parata" in d.pending["opzioni"], d.pending["opzioni"])
    d.risolvi_risposta("nessuna risposta")
    d.fine_turno()
    ok(not p.reazioni_bloccate and p.puo_schivare(), "vale solo nel turno in cui e' stato usato")
    c3 = eroe("Cat", "Modulo di IA predittiva")
    s3 = slot_di(c3, "Modulo di IA predittiva")
    E.Personaggio.tira = dadi(c3, mente=8)
    try:
        c3.attiva_augment(s3, DB["attacchi"], DB["stances"], DB["effetti"], avversario=eroe("Dan"))
    finally:
        E.Personaggio.tira = orig
    c3.tick_turno()
    ok(not c3.puo_attivare_augment(s3), "dopo 1 turno ancora in ricarica")
    c3.tick_turno()
    ok(c3.puo_attivare_augment(s3), "dopo 2 e' pronto")
    for roll, atteso in ((1, 9), (10, 2), (13, 2), (5, 5)):                      # 10 - 1d Mente, mai meno di 2
        p2, c2 = eroe("A"), eroe("B", "Modulo di IA predittiva")
        s2 = slot_di(c2, "Modulo di IA predittiva")
        E.Personaggio.tira = dadi(c2, mente=roll)
        try:
            c2.attiva_augment(s2, DB["attacchi"], DB["stances"], DB["effetti"], avversario=p2)
        finally:
            E.Personaggio.tira = orig
        ok(c2.stato_augment(s2["def"])["cooldown"] == atteso, (roll, c2.stato_augment(s2["def"])["cooldown"]))

    # ============================================================ Cuscinetto di emergenza
    p = eroe("Ada", "Cuscinetto di emergenza")
    p.applica_danno("busto", 49)
    ok(p.armatura["busto"] == 0 and not p.cuscinetto_usato, "49 non basta")
    p.applica_danno("testa", 50)
    ok(p.armatura["testa"] == 50 and p.cuscinetto_usato, "50 hp veri in un colpo: +50 temporanei sulla locazione")
    righe = p.applica_danno("braccio_dx", 90)
    ok(p.armatura["braccio_dx"] == 0 and p.hp["braccio_dx"] == 10, "scatta una volta sola per combattimento")
    ok(p.armatura["testa"] == 50, "...e solo sulla locazione colpita")
    p = eroe("Bea", "Cuscinetto di emergenza")
    p.armatura["busto"] = 40
    p.applica_danno("busto", 80)                # 40 se li prende l'armatura, 40 gli hp: sotto soglia
    ok(not p.cuscinetto_usato and p.hp["busto"] == 80, "gli hp temporanei non contano")
    p.applica_danno("busto", 55)
    ok(p.cuscinetto_usato and p.armatura["busto"] == 50)
    p = eroe("Cleo", "Cuscinetto di emergenza")
    p.applica_danno("braccio_sx", 60)
    ok(p.armatura["braccio_sx"] == 50, "anche su un arto")
    p = eroe("Dora", "Cuscinetto di emergenza")
    p.applica_emp(2)
    p.applica_danno("busto", 70)
    ok(not p.cuscinetto_usato and p.armatura["busto"] == 0, "un EMP lo spegne")
    p = eroe("Eva", "Cuscinetto di emergenza")
    p.applica_danno("busto", 300, split=True)   # 50 a locazione
    ok(p.cuscinetto_usato and sum(1 for v in p.armatura.values() if v) == 1, "anche i danni diffusi, ma una locazione sola")

    # ============================================================ Berserker
    p = eroe("Ada", "Berserker")
    ok(p.bonus_berserker() == 0, "a vita piena non cambia nulla")
    mx = sum(p.hp_max.values())
    p.hp = {l: int(p.hp_max[l] * 0.05) for l in p.hp}
    ok(abs(p.bonus_berserker() - 0.75) < 0.01, p.bonus_berserker())
    p.hp = {l: 1 for l in p.hp}
    ok(p.bonus_berserker() == 0.75, "sotto il 5% il massimo resta +75%")
    p.hp = {l: p.hp_max[l] // 2 for l in p.hp}
    ok(0.38 < p.bonus_berserker() < 0.41, "a meta' vita: +39% (lineare)")
    p.hp = {l: p.hp_max[l] for l in p.hp}
    p.hp["testa"] = 0
    ok(0.09 < p.bonus_berserker() < 0.12, "conta la vita generale (80 hp su 600), non una locazione")
    p.applica_emp(2)
    ok(p.bonus_berserker() == 0, "un EMP lo spegne")
    # in combattimento: Pugno 40 + margine 16 = 56, +75% = 98
    a, b = eroe("Ada", "Berserker"), eroe("Bea")
    d = duello(a, b)
    a.hp = {l: max(1, int(a.hp_max[l] * 0.05)) for l in a.hp}
    b.hp = {l: 1000 for l in b.hp}
    b.risposte = 0                              # nessuna risposta: solo i riflessi (tirano 1)
    E.Personaggio.tira = dadi(a)
    try:
        d.usa_attacco(att("Pugno"))
    finally:
        E.Personaggio.tira = orig
    perso = 6000 - sum(b.hp.values())
    ok(perso == 56 + int(56 * a.bonus_berserker()), perso)
    ok(any("Berserker" in r["t"] for r in d.log), "il log lo dice")

    # ============================================================ IA supportiva e Biohazard
    p = eroe("Ada", "IA supportiva", mente=1)
    ok(p.stats["mente"] == 4, "+3 Mente: da 1 a 4")
    p = eroe("Bea", "IA supportiva", mente=3)
    ok(p.stats["mente"] == 4, "il rango non supera 4")
    p.applica_emp(1)
    ok(p.stats["mente"] == 3, "un EMP lo spegne")
    p = eroe("Cleo", "Armatura subdermale \"Biohazard\"")
    for t in ("fuoco", "elettrico", "gelo", "acido"):
        ok(p.resistenza_tot(t) == 30, t)
    ok(p.resistenza_tot("contundente") == 0 and p.resistenza_tot("perforante") == 0, "solo gli elementali")
    p.applica_danno("busto", 100, "fuoco")
    ok(p.hp["busto"] == 120 - 70, p.hp["busto"])

    # ============================================================ protesi e mosse
    for nome, loc in (("Wolf fangs", "testa"), ("Cyber artigli (dx)", "braccio_dx"), ("Cyber artigli (sx)", "braccio_sx")):
        pr = prot(nome)
        p = E.Personaggio("Ada")
        E.dotazione_base(p, DB["attacchi"], DB["stances"])
        p.equipaggia_protesi(pr, DB["attacchi"], DB["stances"], DB["effetti"])
        ok(p.hp[loc] == pr["hp"] and loc in p.protesi_locazioni and loc not in p.crippled, nome)
        mossa = next(a for a in p.attacchi if a["id"] in pr["attacchi"])
        ok(mossa["nome"] in ("Morso", "Artigli sanguinari") and mossa["cooldown_turni"] == 3, mossa["nome"])
        p.consuma_attacco(mossa)
        ok(p.stato_attacco(mossa)["cooldown"] == 3 and not p.puo_usare_attacco(mossa), "dopo l'uso, 3 turni di ricarica")
        for _ in range(3):
            p.tick_turno()
        ok(p.puo_usare_attacco(mossa), "...e poi si riusa")
        p.applica_emp(2)
        ok(not p.puo_usare_attacco(mossa), "l'EMP blocca la mossa della protesi")
    ok(W._controlla_equip({"stats": {"mente": 3, "sociale": 3}, "protesi": [], "augments": []}, "protesi", prot("Wolf fangs"))[0], "si installa")

    # ============================================================ la CPU non si rompe con i nuovi impianti: 80 duelli CPU contro CPU
    random.seed(8)
    nuovi_aug = [aug(x) for x in nomi]
    for i in range(80):
        a, b = eroe(f"A{i}"), eroe(f"B{i}")
        for q in (a, b):
            for ag in random.sample(nuovi_aug, 3):
                slot = {"def": ag, "rango": 1, "attivo": False}
                q.augments.append(slot)
                if not ag.get("attivo", True):
                    q.attiva_potere(slot, DB["attacchi"], DB["stances"], DB["effetti"])
            for pr in random.sample(DB["protesi"], 1):
                if pr["locazione"] not in q.protesi_locazioni:
                    q.equipaggia_protesi(pr, DB["attacchi"], DB["stances"], DB["effetti"])
            q.init_stamina()
        d = W.DuelloWeb(pg=a, avversario=b)
        passi = 0
        while not d.finito and passi < 900:
            passi += 1
            if d.fase == "risposta":
                s, loc = d.scegli_difesa(d.p, d.pending)
                d.risolvi_risposta(s, loc)
            else:
                d.cpu_step()
        ok(d.finito and d.round < 60, (i, d.round))
    # ============================================================ i bonus e malus ai tiri si leggono nelle schede
    p, c = eroe("A"), eroe("B")
    d = duello(p, c)
    ok(p.modificatori_tiri(c) == [] and d.stato()["player"]["modificatori"] == [], "senza niente, nessun modificatore")
    p.hp["braccio_dx"] = -5
    p.hp["gamba_sx"] = -5
    mt = {(m["tiro"], m["valore"]): m["fonte"] for m in d.stato()["player"]["modificatori"]}
    ok(mt.get(("colpire", -1)) == "braccio dx in negativo" and mt.get(("schivata", -1)) == "gamba sx in negativo", mt)
    p.hp["braccio_sx"] = -5
    p.crippled |= {"braccio_dx", "gamba_sx"}
    mt = d.stato()["player"]["modificatori"]
    ok(any(m["tiro"] == "colpire" and m["valore"] == -2 for m in mt), "due bracci: -2 a colpire")
    ok(any(m["tiro"] == "schivata" and m["valore"] is None for m in mt) and any(m["tiro"] == "mira" and m["valore"] is None for m in mt),
       "gamba e braccio CRIPPLED: niente schivata ne' mira")
    ok(not d.stato()["cpu"]["modificatori"], "l'avversario sano non ha modificatori")
    ok(sum(m["valore"] or 0 for m in mt if m["tiro"] == "colpire") == E.bonus_colpire(p, c), "la scheda e il tiro dicono la stessa cosa")
    c.applica_effetti([{"effetto": next(e["id"] for e in DB["effetti"] if e["nome"] == "Stordimento"), "turni": 2}], DB["effetti"])
    mt = c.modificatori_tiri(p)
    ok(any(m["fonte"] == "Stordimento" and m["tiro"] == "colpire" and m["valore"] == -1 for m in mt), "gli effetti si leggono")
    ok(any(m["fonte"] == "Stordimento" and m["unita"] == "rango" and m["tiro"] == "sociale" for m in mt), "...anche i delta di rango")
    ok(sum(m["valore"] for m in c.modificatori_tiri(p) if m["tiro"] == "colpire" and m["valore"]) == E.bonus_colpire(c, p))
    print(f"OK: {n} verifiche")


if __name__ == "__main__":
    main()
