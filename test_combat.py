"""Check minimale della logica di combattimento: python test_combat.py"""
from combat import Personaggio, LOCAZIONI, bonus_colpire, per_rango


def main():
    # danno pieno a testa/busto
    p = Personaggio("Test")
    p.applica_danno("busto", 30)
    assert p.hp["busto"] == 120

    # armatura assorbita prima degli hp
    p.armatura["testa"] = 20
    p.applica_danno("testa", 30)
    assert p.armatura["testa"] == 0 and p.hp["testa"] == 40

    # resistenza al tipo di danno, applicata prima di tutto
    p.resistenze["fuoco"] = 15
    p.applica_danno("busto", 40, "fuoco")
    assert p.hp["busto"] == 120 - 25

    # arto: danno pieno fino a 0, poi metà all'arto e metà distribuita
    p2 = Personaggio("Test2")
    p2.applica_danno("braccio_dx", 100)
    assert p2.hp["braccio_dx"] == 0
    testa_prima = p2.hp["testa"]
    p2.applica_danno("braccio_dx", 100)  # 50 all'arto, 50/5=10 alle altre 5
    assert p2.hp["braccio_dx"] == -50
    assert p2.hp["testa"] == testa_prima - 10
    p2.applica_danno("braccio_dx", 200)  # scende sotto -100 -> CRIPPLED
    assert "braccio_dx" in p2.crippled

    # sconfitta con testa a 0
    p2.hp["testa"] = 0
    assert p2.sconfitto()

    # stance distribuisci_danni: danni suddivisi su tutte le locazioni
    p3 = Personaggio("Test3")
    p3.stance_attive.append({"def": {"id": 99, "nome": "Assorbi",
                                     "modificatori": [{"tipo": "distribuisci_danni"}]},
                             "turni": 2})
    p3.applica_danno("testa", 60)
    assert all(p3.hp[l] == p3.hp_max[l] - 10 for l in LOCAZIONI)

    # modificatori al tiro per colpire (flat, proprio + avversario)
    a, d = Personaggio("A"), Personaggio("D")
    a.stance_attive.append({"def": {"modificatori": [{"tipo": "colpire_proprio", "flat": 1}]},
                            "turni": 1})
    d.stance_attive.append({"def": {"modificatori": [{"tipo": "colpire_avversario", "flat": -1}]},
                            "turni": 1})
    assert bonus_colpire(a, d) == 0  # +1 e -1 si annullano
    assert not a.ha_flag("parata_sempre")

    # formula: (dadi + flat) * mult — fisico rango 1 = D6
    p4 = Personaggio("Test4")
    dmg = p4.tira_formula({"dadi": [{"n": 1, "tipo": "fisico"}], "flat": 2, "mult": 10})
    assert dmg % 10 == 0 and 30 <= dmg <= 80

    # skill a 0 usa la statistica di ripiego (da skills.json)
    assert p4.rango_dado("armi_corpo_a_corpo") == p4.stats["fisico"]
    assert p4.rango_dado("tattica") == p4.stats["mente"]

    # effetto nel tempo: tick fa danni e scade
    p5 = Personaggio("Test5")
    p5.effetti_attivi.append({"def": {"nome": "Bruciatura", "tipo": "danno",
                                      "tipo_danno": "fuoco",
                                      "formula": {"dadi": [], "flat": 10, "mult": 1}},
                              "turni": 1})
    p5.tick_turno()
    assert sum(p5.hp_max.values()) - sum(p5.hp.values()) == 10
    assert not p5.effetti_attivi

    # attacco con split_danni: suddiviso su tutte le locazioni
    p9 = Personaggio("Test9")
    p9.applica_danno("testa", 60, split=True)
    assert all(p9.hp[l] == p9.hp_max[l] - 10 for l in LOCAZIONI)

    # DoT non-split: ticka sulla locazione colpita dall'attacco
    p10 = Personaggio("Test10")
    db_e = [{"id": 1, "nome": "Bruciatura", "tipo": "danno", "tipo_danno": "fuoco",
             "formula": {"dadi": [], "flat": 10, "mult": 1}}]
    p10.applica_effetti([{"effetto": 1, "turni": 1}], db_e, loc="gamba_sx")
    p10.tick_turno()
    assert p10.hp["gamba_sx"] == p10.hp_max["gamba_sx"] - 10

    # DoT con split: suddiviso su tutte le locazioni
    p11 = Personaggio("Test11")
    db_e2 = [{"id": 1, "nome": "Tempesta", "tipo": "danno", "tipo_danno": "elettrico",
              "split": True, "formula": {"dadi": [], "flat": 60, "mult": 1}}]
    p11.applica_effetti([{"effetto": 1, "turni": 1}], db_e2)
    p11.tick_turno()
    assert all(p11.hp[l] == p11.hp_max[l] - 10 for l in LOCAZIONI)

    # stance a durata fissa
    p6, p7 = Personaggio("X"), Personaggio("Y")
    sdef = {"id": 5, "nome": "Assorbi", "durata": {"tipo": "fissa", "turni": 2},
            "modificatori": [], "effetti_applicati": []}
    p6.attiva_stance(sdef, p7, [])
    assert p6.stance_attive and p6.stance_attive[0]["turni"] == 2

    # immunità da stance: annulla il tipo specifico, non gli altri
    pi = Personaggio("Imm")
    pi.stance_attive.append({"def": {"id": 50, "nome": "Manto",
                                     "modificatori": [{"tipo": "immunita",
                                                       "tipo_danno": "fuoco"}]},
                             "turni": -1})
    pi.applica_danno("busto", 100, "fuoco")
    assert pi.hp["busto"] == 150
    pi.applica_danno("busto", 30, "taglio")
    assert pi.hp["busto"] == 120
    # immunità "tutto" (permanente da potere) annulla ogni tipo
    pi.immunita.add("tutto")
    pi.applica_danno("busto", 30, "taglio")
    assert pi.hp["busto"] == 120

    # resistenza "tutto" copre ogni tipo di danno
    pr = Personaggio("Res")
    pr.resistenze["tutto"] = 15
    pr.applica_danno("busto", 40, "gelo")
    assert pr.hp["busto"] == 150 - 25

    # stance permanente (turni -1): il tick non la fa scadere
    pi.tick_turno()
    assert pi.stance_attive

    # potere che attiva subito una stance (permanente) e la rende conosciuta
    db_st2 = [{"id": 6, "nome": "Corpo di Fiamma",
               "modificatori": [{"tipo": "immunita", "tipo_danno": "fuoco"}]}]
    slot2 = {"def": {"nome": "Piro", "effetti": {}, "effetti_nel_tempo": {},
                     "attacchi": {}, "stance": {}, "stance_attivate": {"4": [6]}},
             "rango": 4, "attivo": False}
    pp = Personaggio("Piro")
    pp.attiva_potere(slot2, [], db_st2, [])
    assert pp.stance_attive and pp.stance_attive[0]["turni"] == -1
    assert pp.immune("fuoco") and not pp.immune("gelo")
    assert pp.stance_conosciute[0]["id"] == 6

    # effetto istantaneo "immunita" di un potere
    slot3 = {"def": {"nome": "X", "effetti": {"1": [{"tipo": "immunita",
                                                     "tipo_danno": "tutto"}]},
                     "effetti_nel_tempo": {}, "attacchi": {}, "stance": {}},
             "rango": 1, "attivo": False}
    pq = Personaggio("Q")
    pq.attiva_potere(slot3, [], [], [])
    assert pq.immune("acido")

    # per_rango: non cumulativo, eredita il rango pieno definito più vicino sotto
    mapping = {"1": ["a"], "2": [], "3": [], "4": ["b"]}
    assert per_rango(mapping, 1) == ["a"]
    assert per_rango(mapping, 3) == ["a"]  # 2 e 3 vuoti -> eredita il rango 1
    assert per_rango(mapping, 4) == ["b"]  # il rango 4 sovrascrive
    assert per_rango({"1": [], "2": [], "3": [], "4": []}, 2) == []

    # attivazione potere: armatura, resistenza, attacco che sostituisce, stance appresa
    db_att = [{"id": 1, "nome": "Pugno", "sostituisce": None},
              {"id": 3, "nome": "Colpo Devastante", "sostituisce": 1}]
    db_st = [{"id": 1, "nome": "Paladino"}]
    p8 = Personaggio("Test8")
    p8.attacchi = [db_att[0]]
    slot = {"def": {"nome": "Super Forza",
                    "effetti": {"1": [{"tipo": "armatura", "dadi": [], "flat": 5, "mult": 10},
                                      {"tipo": "resistenza", "tipo_danno": "fuoco", "valore": 20}],
                               "2": [], "3": [], "4": []},
                    "effetti_nel_tempo": {"1": [], "2": [], "3": [], "4": []},
                    "attacchi": {"1": [3]},
                    "stance": {"1": [1]}},
            "rango": 1, "attivo": False}
    p8.attiva_potere(slot, db_att, db_st, [])
    assert slot["attivo"]
    assert p8.armatura["testa"] == 50
    assert p8.resistenze["fuoco"] == 20
    assert [x["id"] for x in p8.attacchi] == [3]
    assert p8.stance_conosciute[0]["nome"] == "Paladino"

    # scaling per rango: rango 1 = x10, rango 4 = x100 (senza override ai ranghi 2-3)
    slot_scala = {"def": {"nome": "Pelle",
                          "effetti": {"1": [{"tipo": "armatura", "dadi": [], "flat": 1, "mult": 10}],
                                     "2": [], "3": [],
                                     "4": [{"tipo": "armatura", "dadi": [], "flat": 1, "mult": 100}]},
                          "effetti_nel_tempo": {"1": [], "2": [], "3": [], "4": []},
                          "attacchi": {}, "stance": {}},
                 "rango": 1, "attivo": False}
    p9 = Personaggio("Test9b")
    p9.attiva_potere(slot_scala, [], [], [])
    assert p9.armatura["testa"] == 10  # (1+0)*10 al rango 1
    slot_scala["rango"], slot_scala["attivo"] = 4, False
    p10 = Personaggio("Test10b")
    p10.attiva_potere(slot_scala, [], [], [])
    assert p10.armatura["testa"] == 100  # (1+0)*100 al rango 4

    # mod_rango self: +2 al proprio riflessi (rango base 1 -> 3), clampato a 4
    ps = Personaggio("Self")
    ps.stance_attive.append({"def": {"id": 60, "nome": "Focus",
                                     "modificatori": [{"tipo": "mod_rango", "statistica": "riflessi",
                                                       "delta": 2, "target": "self"}]},
                             "turni": 3})
    assert ps.rango_dado("riflessi") == 3
    ps.stats["riflessi"] = 4
    assert ps.rango_dado("riflessi") == 4  # clampato, non sale a 6

    # mod_rango avversario: -2 al riflessi di chi combatte contro di me
    pd = Personaggio("Debuffer")
    pd.stance_attive.append({"def": {"id": 61, "nome": "Intimidazione",
                                     "modificatori": [{"tipo": "mod_rango", "statistica": "riflessi",
                                                       "delta": -2, "target": "avversario"}]},
                             "turni": 3})
    bersaglio = Personaggio("Bersaglio")
    bersaglio.stats["riflessi"] = 3
    assert bersaglio.rango_dado("riflessi") == 3          # senza nemico passato, nessun effetto
    assert bersaglio.rango_dado("riflessi", pd) == 1       # 3-2=1, il debuff di pd si applica
    assert pd.rango_dado("riflessi", bersaglio) == pd.stats["riflessi"]  # il debuff non torna su pd

    # puo_mirare: serve almeno un attacco mirabile e un'azione libera
    pm = Personaggio("Mira")
    assert not pm.puo_mirare()  # nessun attacco
    pm.attacchi = [{"nome": "Lanciafiamme", "can_aim": False}]
    pm.azioni = 1
    assert not pm.puo_mirare()  # l'unico attacco non è mirabile
    pm.attacchi.append({"nome": "Pugno", "can_aim": True})
    assert pm.puo_mirare()
    pm.mira = "testa"
    assert not pm.puo_mirare()  # sta già mirando

    # effetto "azioni" (supervelocità): aumenta risorse per turno e quelle correnti
    pv = Personaggio("Veloce")
    pv.azioni, pv.bonus, pv.risposte = 1, 1, 1
    slot_vel = {"def": {"nome": "Supervelocità",
                        "effetti": {"1": [{"tipo": "azioni", "azioni": 2, "bonus": 1,
                                           "risposte": 0}]},
                        "effetti_nel_tempo": {}, "attacchi": {}, "stance": {}},
                "rango": 1, "attivo": False}
    pv.attiva_potere(slot_vel, [], [], [])
    assert pv.n_azioni == 3 and pv.n_bonus == 2
    assert pv.azioni == 3 and pv.bonus == 2  # effetto immediato anche nel turno corrente

    # trigger stance "vieni_colpito": applica un effetto nel tempo a sé quando colpito
    db_e3 = [{"id": 1, "nome": "Contraccolpo", "tipo": "danno", "tipo_danno": "fuoco",
              "formula": {"dadi": [], "flat": 5, "mult": 1}}]
    pt = Personaggio("Trigger")
    st_trig = {"trigger": "vieni_colpito", "effetti_applicati": [{"effetto": 1, "turni": 2}]}
    pt.stance_attive.append({"def": st_trig, "turni": 3})
    assert not pt.effetti_attivi
    pt.scatta_trigger("vieni_colpito", Personaggio("X"), db_e3)
    assert len(pt.effetti_attivi) == 1  # scattato
    pt.effetti_attivi.clear()
    pt.scatta_trigger("manchi", Personaggio("X"), db_e3)
    assert not pt.effetti_attivi  # trigger diverso: non scatta

    # trigger "fai_danni" con effetti_avversario: applica l'effetto al bersaglio
    attaccante = Personaggio("Att")
    st_avv = {"trigger": "fai_danni", "effetti_avversario": [{"effetto": 1, "turni": 1}]}
    attaccante.stance_attive.append({"def": st_avv, "turni": 2})
    vittima = Personaggio("Vitt")
    attaccante.scatta_trigger("fai_danni", vittima, db_e3)
    assert not attaccante.effetti_attivi  # l'effetto va all'avversario, non a sé
    assert len(vittima.effetti_attivi) == 1

    # attiva_stance con trigger evento: NON applica gli effetti all'attivazione
    pe = Personaggio("Ev")
    av = Personaggio("Av")
    pe.stats["mente"] = 4  # per vincere il tiro tattica contrapposto
    st_ev = {"nome": "Ritorsione", "durata": {"tipo": "fissa", "turni": 2},
             "trigger": "vieni_colpito", "effetti_applicati": [{"effetto": 1, "turni": 1}]}
    pe.attiva_stance(st_ev, av, db_e3)
    assert not pe.effetti_attivi  # niente all'attivazione, aspetta il trigger

    # mod_rango da un effetto attivo: -1 senza sfondare il floor
    pmr = Personaggio("ModRango")
    pmr.stats["mente"] = 3
    pmr.effetti_attivi.append({"def": {"nome": "Debuff", "modificatori":
                               [{"tipo": "mod_rango", "statistica": "mente", "delta": -1}]},
                               "turni": 2})
    assert pmr.rango_dado("mente") == 2

    # mod_rango che sfonderebbe il floor (rango 1 - 1 = 0): resta a 1, +flat -2 al risultato
    pfl = Personaggio("Floor")
    pfl.stats["mente"] = 1
    pfl.effetti_attivi.append({"def": {"nome": "Debuff2", "modificatori":
                               [{"tipo": "mod_rango", "statistica": "mente", "delta": -1}]},
                               "turni": 2})
    rango, malus = pfl._calcola_rango("mente")
    assert rango == 1 and malus == -2

    # flat_risultato: bonus/malus diretto al risultato di una specifica statistica
    pfr = Personaggio("FlatRis")
    pfr.effetti_attivi.append({"def": {"nome": "Precisione", "modificatori":
                               [{"tipo": "flat_risultato", "statistica": "controllo",
                                 "valore": 3}]}, "turni": 1})
    assert pfr._flat_risultato("controllo") == 3
    assert pfr._flat_risultato("mente") == 0  # non tocca altre statistiche

    # colpire da un effetto: -2 a tutti i tiri per colpire di chi lo subisce (Stordimento)
    pst = Personaggio("Stordito")
    bersaglio_neutro = Personaggio("Neutro")
    pst.effetti_attivi.append({"def": {"nome": "Stordimento", "modificatori":
                               [{"tipo": "mod_rango", "statistica": "mente", "delta": -1},
                                {"tipo": "colpire", "flat": -2}]}, "turni": 3})
    assert bonus_colpire(pst, bersaglio_neutro) == -2
    assert bonus_colpire(bersaglio_neutro, pst) == 0  # non colpisce chi combatte CONTRO lo stordito

    # azioni da un effetto: riduzione temporanea applicata al tick, senza scendere sotto 0
    paz = Personaggio("Rallentato")
    paz.n_azioni, paz.n_bonus, paz.n_risposte = 1, 1, 1
    paz.azioni, paz.bonus, paz.risposte = 1, 1, 1
    paz.effetti_attivi.append({"def": {"nome": "Rallentamento", "modificatori":
                               [{"tipo": "azioni", "azioni": -1, "bonus": -2, "risposte": 0}]},
                               "turni": 1})
    hp_prima = dict(paz.hp)
    paz.tick_turno()
    assert paz.azioni == 0
    assert paz.bonus == 0  # clampato: -1 - 2 non va sotto 0
    assert paz.risposte == 1
    assert paz.hp == hp_prima  # tipo "modificatore": nessun danno/cura applicato
    assert not paz.effetti_attivi  # durata 1: scaduto dopo il tick

    # stance con numero massimo di utilizzi: dopo averla esaurita non si riattiva più
    pu = Personaggio("Utilizzi")
    pu.stats["mente"] = 4  # per vincere sempre il tiro tattica contrapposto
    avv_u = Personaggio("AvvU")
    st_usi = {"id": 20, "nome": "Scatto", "durata": {"tipo": "fissa", "turni": 1},
             "usi_limitati": True, "usi_massimi": 1, "modificatori": [], "effetti_applicati": []}
    assert pu.puo_attivare_stance(st_usi)
    righe1 = pu.attiva_stance(st_usi, avv_u, [])
    assert pu.stance_attive and "termina" not in " ".join(righe1)
    assert not pu.puo_attivare_stance(st_usi)  # attiva (una sola per volta) e usi esauriti
    pu.tick_turno()  # durata 1: scade
    assert not pu.stance_attive
    assert not pu.puo_attivare_stance(st_usi)  # ancora bloccata: utilizzi esauriti
    righe2 = pu.attiva_stance(st_usi, avv_u, [])
    assert "esaurito" in righe2[0]
    assert not pu.stance_attive  # il secondo tentativo non l'ha riattivata

    # cooldown: parte quando la stance finisce, si scala di 1 ad ogni tuo turno
    pc = Personaggio("Cooldown")
    pc.stats["mente"] = 4
    avv_c = Personaggio("AvvC")
    st_cd = {"id": 21, "nome": "Scarica", "durata": {"tipo": "fissa", "turni": 1},
             "cooldown_turni": 2, "modificatori": [], "effetti_applicati": []}
    pc.attiva_stance(st_cd, avv_c, [])
    assert not pc.puo_attivare_stance(st_cd)  # attiva: una sola stance per volta
    assert pc.stato_stance(st_cd)["cooldown"] == 0  # il cooldown NON è ancora partito
    pc.tick_turno()  # dura 1 turno: scade qui e il cooldown parte a 2
    assert not pc.stance_attive
    assert not pc.puo_attivare_stance(st_cd)
    assert pc.stato_stance(st_cd)["cooldown"] == 2
    pc.tick_turno()
    assert pc.stato_stance(st_cd)["cooldown"] == 1
    assert not pc.puo_attivare_stance(st_cd)
    pc.tick_turno()
    assert pc.stato_stance(st_cd)["cooldown"] == 0
    assert pc.puo_attivare_stance(st_cd)
    righe3 = pc.attiva_stance(st_cd, avv_c, [])
    assert pc.stance_attive  # riattivabile dopo il cooldown

    # dadi a taglia fissa: 2d6*30 fa sempre un multiplo di 30 tra 60 e 360
    pdf = Personaggio("DadiFissi")
    for _ in range(20):
        dmg = pdf.tira_formula({"dadi": [{"n": 2, "tipo": "d6"}], "flat": 0, "mult": 30})
        assert dmg % 30 == 0 and 60 <= dmg <= 360
    assert 1 <= pdf.tira("d4") <= 4

    # attacco con utilizzi limitati e cooldown
    pa = Personaggio("AttLim")
    att_lim = {"id": 90, "nome": "Colpo unico", "usi_limitati": True, "usi_massimi": 1}
    assert pa.puo_usare_attacco(att_lim)
    pa.consuma_attacco(att_lim)
    assert not pa.puo_usare_attacco(att_lim)  # usi esauriti
    att_cd = {"id": 91, "nome": "Raffica", "cooldown_turni": 2}
    pa.consuma_attacco(att_cd)
    assert not pa.puo_usare_attacco(att_cd)  # in ricarica
    pa.tick_turno()
    pa.tick_turno()
    assert pa.puo_usare_attacco(att_cd)  # cooldown finito

    # locazione_extra: le ali si aggiungono, si colpiscono e vanno CRIPPLED
    pw_ali = {"def": {"nome": "Ali",
                      "effetti": {"1": [{"tipo": "locazione_extra", "nome": "ala_sx", "hp": 50},
                                        {"tipo": "locazione_extra", "nome": "ala_dx", "hp": 50}],
                                  "3": [{"tipo": "locazione_extra", "nome": "ala_sx", "hp": 100},
                                        {"tipo": "locazione_extra", "nome": "ala_dx", "hp": 100}]},
                      "effetti_nel_tempo": {}, "attacchi": {}, "stance": {},
                      "stance_attivate": {}},
              "rango": 1, "attivo": False}
    pal = Personaggio("Alato")
    pal.attiva_potere(pw_ali, [], [], [])
    assert pal.hp["ala_sx"] == 50 and pal.hp_max["ala_dx"] == 50
    pal.applica_danno("ala_sx", 60)   # 50 diretti, poi 10: 5 all'ala e 5/7 alle altre
    assert pal.hp["ala_sx"] == -5
    pal.applica_danno("ala_sx", 100)  # sfonda -50 -> CRIPPLED
    assert "ala_sx" in pal.crippled
    # rango 3: ali da 100 hp
    pw_ali["rango"], pw_ali["attivo"] = 3, False
    pal3 = Personaggio("Alato3")
    pal3.attiva_potere(pw_ali, [], [], [])
    assert pal3.hp["ala_sx"] == 100

    # stance_attivate: NON cumulative, il rango sovrascrive (con eredità dei vuoti)
    db_st_va = [{"id": 1, "nome": "VoloBase"}, {"id": 2, "nome": "VoloSupremo"}]
    pw_va = {"def": {"nome": "X", "effetti": {}, "effetti_nel_tempo": {},
                     "attacchi": {}, "stance": {},
                     "stance_attivate": {"1": [1], "2": [], "3": [2], "4": []}},
             "rango": 3, "attivo": False}
    pva = Personaggio("VA")
    pva.attiva_potere(pw_va, [], db_st_va, [])
    attive = [st["def"]["id"] for st in pva.stance_attive]
    assert attive == [2]  # solo la stance del rango 3, non quella del rango 1

    # immune_melee (stance Volo): flag esposto via ha_flag
    pvo = Personaggio("Volatore")
    pvo.stance_attive.append({"def": {"id": 95, "nome": "Volo",
                                      "modificatori": [{"tipo": "immune_melee"}]},
                              "turni": 3})
    assert pvo.ha_flag("immune_melee")

    # assorbi_caratteristica: scambia una statistica e la ripristina alla scadenza
    ass, vitt = Personaggio("Assorbe"), Personaggio("Vittima")
    for s in ass.stats:
        ass.stats[s] = 1
        vitt.stats[s] = 4
    righe_sw = ass.assorbi_caratteristica(vitt, 2)
    assert len(ass.swap_attivi) == 1
    stat_sw = ass.swap_attivi[0]["stat"]
    assert ass.stats[stat_sw] == 4 and vitt.stats[stat_sw] == 1  # invertite
    ass.tick_turno()
    assert ass.swap_attivi  # dura ancora
    ass.tick_turno()
    assert not ass.swap_attivi
    assert ass.stats[stat_sw] == 1 and vitt.stats[stat_sw] == 4  # ripristinate

    # limite massimo di 4 poteri per personaggio casuale
    from engine import carica_db, personaggio_casuale, valuta, MAX_POTERI
    db = carica_db()
    for _ in range(30):
        pc = personaggio_casuale(db["attacchi"], db["poteri"], db["stances"])
        assert len(pc.poteri) <= MAX_POTERI

    # valuta: punteggio deterministico dai componenti
    pv2 = Personaggio("Val")  # stats tutte a 1, skill a 0, nessun potere
    assert valuta(pv2) == 3 * 5
    pv2.stats["fisico"] = 4
    pv2.skills["tattica"] = 2
    pv2.poteri.append({"def": {"id": 1}, "rango": 3, "attivo": False})
    assert valuta(pv2) == 3 * 8 + 2 * 2 + 5 * 3

    # una sola stance attiva per volta (quelle permanenti da potere non contano)
    ps1 = Personaggio("UnaSola")
    ps1.stats["mente"] = 4
    avv_s = Personaggio("AvvS")
    st_a = {"id": 30, "nome": "Aggressivo", "durata": {"tipo": "fissa", "turni": 3},
            "modificatori": [], "effetti_applicati": []}
    st_b = {"id": 31, "nome": "Difensivo", "durata": {"tipo": "fissa", "turni": 3},
            "modificatori": [], "effetti_applicati": []}
    ps1.attiva_stance(st_a, avv_s, [])
    assert len(ps1.stance_attive) == 1
    assert not ps1.puo_attivare_stance(st_b)  # bloccata finché Aggressivo è attiva
    righe_b = ps1.attiva_stance(st_b, avv_s, [])
    assert "una sola per volta" in righe_b[0]
    assert len(ps1.stance_attive) == 1  # Difensivo NON si è attivata
    # una permanente da potere non blocca l'attivazione manuale
    ps2 = Personaggio("ConVolo")
    ps2.stance_attive.append({"def": {"id": 32, "nome": "VoloPerm", "modificatori": []},
                              "turni": -1})
    assert ps2.stance_manuale_attiva() is None
    assert ps2.puo_attivare_stance(st_a)
    # allo scadere, si può attivare l'altra
    for _ in range(3):
        ps1.tick_turno()
    assert not ps1.stance_attive
    assert ps1.puo_attivare_stance(st_b)

    # effetto "azioni" negativo (Affaticare): -1 bonus e -1 risposte al tick
    import json as _json
    eff_aff = next(e for e in _json.load(open("data/effects.json", encoding="utf-8"))
                   if e["nome"] == "Affaticare")
    paf = Personaggio("Affaticato")
    paf.azioni, paf.bonus, paf.risposte = 1, 1, 1
    paf.effetti_attivi.append({"def": eff_aff, "turni": 1})
    paf.tick_turno()
    assert paf.bonus == 0 and paf.risposte == 0 and paf.azioni == 1

    # Cancella_stance: annulla la stance manuale attiva e ne avvia il cooldown
    pcs = Personaggio("Cancellato")
    pcs.stats["mente"] = 4
    avv_cs = Personaggio("AvvCS")
    st_cs = {"id": 40, "nome": "Furia", "durata": {"tipo": "fissa", "turni": 5},
             "cooldown_turni": 3, "modificatori": [], "effetti_applicati": []}
    pcs.attiva_stance(st_cs, avv_cs, [])
    assert pcs.stance_attive and pcs.stato_stance(st_cs)["cooldown"] == 0
    righe_cs = pcs.cancella_stance_attiva()
    assert not pcs.stance_attive  # rimossa subito
    assert pcs.stato_stance(st_cs)["cooldown"] == 3  # cooldown partito come a scadenza naturale
    assert not pcs.puo_attivare_stance(st_cs)
    assert "viene annullata" in righe_cs[0]
    # nessuna stance attiva: messaggio "non ha nessuna stance", nessun errore
    righe_niente = pcs.cancella_stance_attiva()
    assert "non ha nessuna stance" in righe_niente[0]
    # passa dentro applica_effetti() con l'id reale dell'effetto nei dati di gioco
    db_e4 = [{"id": 1, "nome": "Cancella_stance", "tipo": "cancella_stance"}]
    pcs2 = Personaggio("Cancellato2")
    pcs2.stats["mente"] = 4
    st_cs2 = {"id": 41, "nome": "Ira", "durata": {"tipo": "fissa", "turni": 5},
              "cooldown_turni": 2, "modificatori": [], "effetti_applicati": []}
    pcs2.attiva_stance(st_cs2, avv_cs, [])
    righe_via_applica = pcs2.applica_effetti([{"effetto": 1}], db_e4)
    assert not pcs2.stance_attive
    assert pcs2.stato_stance(st_cs2)["cooldown"] == 2
    assert not pcs2.effetti_attivi  # istantaneo: non finisce in effetti_attivi

    # debolezza: +50% danni del tipo indicato
    pdeb = Personaggio("Debole")
    pdeb.effetti_attivi.append({"def": {"nome": "Debolezza", "modificatori":
                                [{"tipo": "debolezza", "tipo_danno": "fuoco"}]}, "turni": 2})
    hp0 = pdeb.hp["busto"]
    righe_deb = pdeb.applica_danno("busto", 40, "fuoco")
    assert hp0 - pdeb.hp["busto"] == 60  # 40 + 50%
    assert any("Debolezza" in r for r in righe_deb)
    hp1 = pdeb.hp["busto"]
    pdeb.applica_danno("busto", 40, "taglio")  # altro tipo: nessun extra
    assert hp1 - pdeb.hp["busto"] == 40

    # mira: costa 1 azione; con mira_bonus (Supersoldato) costa 1 bonus
    pm = Personaggio("Mirante")
    pm.attacchi = [{"id": 1, "nome": "Pugno", "can_aim": True}]
    pm.azioni, pm.bonus = 1, 1
    assert pm.puo_mirare()
    pm.consuma_mira()
    assert pm.azioni == 0 and pm.bonus == 1
    pm.mira_bonus = True
    pm.consuma_mira()
    assert pm.bonus == 0

    # stamina: max = (fisico+riflessi+mente)*2; i poteri attivi drenano il rango a turno
    pst = Personaggio("Stancabile")
    pst.stats.update({"fisico": 2, "riflessi": 3, "mente": 1})
    pst.init_stamina()
    assert pst.stamina == 12
    pw = {"def": {"nome": "PelleX", "effetti": {}, "effetti_nel_tempo": {},
                  "attacchi": {}, "stance": {}, "stance_attivate": {}},
          "rango": 4, "attivo": False}
    pst.poteri = [pw]
    pst.attiva_potere(pw, [], [], [])
    pst.tick_turno()
    assert pst.stamina == 8
    pst.stamina = 3  # non basta per 4: al prossimo tick il potere si spegne
    righe_st = pst.tick_turno()
    assert not pw["attivo"]
    assert any("esausto" in r for r in righe_st)

    # disattiva_potere: annulla ciò che il potere aveva concesso
    pdis = Personaggio("Disattiva")
    pdis.init_stamina()
    att_x = {"id": 99, "nome": "MossaX", "sostituisce": None}
    pw2 = {"def": {"nome": "PowerX",
                   "effetti": {"1": [{"tipo": "immunita", "tipo_danno": "fuoco"},
                                     {"tipo": "mira_bonus"},
                                     {"tipo": "azioni", "azioni": 1, "bonus": 0, "risposte": 0},
                                     {"tipo": "locazione_extra", "nome": "coda", "hp": 40}]},
                   "effetti_nel_tempo": {}, "attacchi": {"1": [99]}, "stance": {},
                   "stance_attivate": {}},
           "rango": 1, "attivo": False}
    pdis.poteri = [pw2]
    pdis.attiva_potere(pw2, [att_x], [], [])
    assert pdis.immune("fuoco") and pdis.mira_bonus and pdis.n_azioni == 2
    assert "coda" in pdis.hp and any(a["id"] == 99 for a in pdis.attacchi)
    pdis.disattiva_potere(pw2)
    assert not pdis.immune("fuoco") and not pdis.mira_bonus and pdis.n_azioni == 1
    assert "coda" not in pdis.hp and all(a["id"] != 99 for a in pdis.attacchi)

    # effetti nel tempo persistenti: non scadono, spariscono con la disattivazione del potere
    pper = Personaggio("Persistente")
    pper.init_stamina()
    db_eff_p = [{"id": 50, "nome": "Aura", "tipo": "modificatore",
                 "modificatori": [{"tipo": "colpire", "flat": 1}]}]
    pw3 = {"def": {"nome": "AuraPower", "effetti": {},
                   "effetti_nel_tempo": {"1": [{"effetto": 50, "turni": 1,
                                                "persistente": True}]},
                   "attacchi": {}, "stance": {}, "stance_attivate": {}},
           "rango": 1, "attivo": False}
    pper.poteri = [pw3]
    pper.attiva_potere(pw3, [], [], db_eff_p)
    assert pper.effetti_attivi and pper.effetti_attivi[0]["turni"] == -1
    pper.tick_turno()
    pper.tick_turno()
    assert pper.effetti_attivi  # persistente: non svanisce col tempo
    pper.disattiva_potere(pw3)
    assert not pper.effetti_attivi  # svanisce col potere

    # armatura da stance con locazione specifica, rimossa alla fine della stance
    par = Personaggio("Corazzato")
    par.stats["mente"] = 4
    avv_ar = Personaggio("AvvAr")
    st_ar = {"id": 60, "nome": "Corazza", "durata": {"tipo": "fissa", "turni": 1},
             "modificatori": [{"tipo": "armatura", "flat": 20, "dado_proprio": "",
                               "mult": 1, "locazione": "busto"}],
             "effetti_applicati": []}
    par.attiva_stance(st_ar, avv_ar, [])
    assert par.armatura["busto"] == 20 and par.armatura["testa"] == 0
    par.tick_turno()  # scade: l'armatura se ne va
    assert par.armatura["busto"] == 0

    # bracci in negativo: -2 a colpire per braccio, cumulativo
    pbr = Personaggio("Ferito")
    avv_br = Personaggio("AvvFer")
    assert bonus_colpire(pbr, avv_br) == 0
    pbr.hp["braccio_sx"] = -10
    assert pbr.malus_bracci() == -2
    assert bonus_colpire(pbr, avv_br) == -2
    pbr.hp["braccio_dx"] = -5
    assert pbr.malus_bracci() == -4  # cumulativo

    # gambe in negativo: -2 a schivare per gamba, cumulativo
    pbr.hp["gamba_sx"] = -1
    assert pbr.malus_gambe() == -2
    pbr.hp["gamba_dx"] = -20
    assert pbr.malus_gambe() == -4

    # braccio CRIPPLED blocca la mira (a meno di potere 2x2 attivo)
    pcr = Personaggio("Rotto")
    pcr.attacchi = [{"id": 1, "nome": "Pugno", "can_aim": True}]
    pcr.azioni = 1
    assert pcr.puo_mirare()
    pcr.crippled.add("braccio_dx")
    assert not pcr.puo_mirare()
    pcr.poteri = [{"def": {"nome": "2x2"}, "rango": 1, "attivo": True}]
    assert pcr.puo_mirare()  # 2x2 attivo compensa
    pcr.poteri[0]["attivo"] = False
    assert not pcr.puo_mirare()

    # gamba CRIPPLED toglie la schivata
    pga = Personaggio("Zoppo")
    assert pga.puo_schivare()
    pga.crippled.add("gamba_sx")
    assert not pga.puo_schivare()

    # eroe base: tutto rango 1, una tra fisico/riflessi/mente a 2, un potere r1
    from engine import eroe_base, costo_upgrade, nome_casuale, carica_db as _cdb
    db2 = _cdb()
    for _ in range(15):
        eb = eroe_base(db2["attacchi"], db2["poteri"], db2["stances"])
        assert len(eb.poteri) == 1 and eb.poteri[0]["rango"] == 1
        assert all(eb.skills[s] == 1 for s in eb.skills)
        alte = [s for s in ("fisico", "riflessi", "mente") if eb.stats[s] == 2]
        assert len(alte) == 1 and eb.stats["sociale"] == 1 and eb.stats["controllo"] == 1

    # costo upgrade: raddoppia a ogni grado
    assert [costo_upgrade(r) for r in (1, 2, 3)] == [1, 2, 4]

    # nomi: la galleria genera nomi diversi senza esaurirsi
    usati = set()
    for _ in range(100):
        usati.add(nome_casuale(usati))
    assert len(usati) == 100

    # xp: soglie esponenziali e level up con token
    import app as webapp
    assert webapp.soglia_xp(1) == 1000
    assert webapp.soglia_xp(2) == 1200
    assert 0.01 < webapp.PROB_NUOVO_POTERE < 0.10  # percentuale ragionevole
    rec = {"nome": "Test", "livello": 1, "xp": 0, "token": 0,
           "poteri": [{"id": 1, "rango": 1}],
           "stats": {s: 1 for s in ("fisico", "riflessi", "mente", "sociale",
                                    "controllo")}, "skills": {}}
    note = webapp.assegna_xp(rec, 2250)  # 1000 (lv2) + 1200 (lv3) + 50 avanzo
    assert rec["livello"] == 3 and rec["token"] == 2 and rec["xp"] == 50
    assert any("LIVELLO 3" in n for n in note)

    # upgrade potere vincolato dal rango di controllo
    upg = webapp.lista_upgrade({"nome": "T", "token": 10,
                                "stats": {"fisico": 1, "riflessi": 1, "mente": 1,
                                          "sociale": 1, "controllo": 1},
                                "skills": {"tattica": 1}, "poteri": [{"id": 1, "rango": 1}]})
    voce_pot = next(u for u in upg if u["tipo"] == "potere")
    assert not voce_pot["ok"] and "controllo" in voce_pot["motivo"]

    # ---- Torneo Evo ----
    t = webapp.TorneoEvo()
    assert len(t.eroi) == 16 and len(t.turni[0]) == 8 and t.fase == "intro"
    e = t.eroi[t.io]
    assert len(e.poteri) == 1 and e.stats["controllo"] == 1
    # danni prima della vittoria: a fine turno si cura il 75%
    e.hp["busto"] -= 100
    t.fase = "duello"
    t.risolvi_duello(True)
    assert t.fase == "risultato" and t.round == 1
    assert len(t.turni) == 2 and len(t.turni[1]) == 4
    assert e.stats["controllo"] == 2          # sale da solo a ogni vittoria
    assert e.hp["busto"] == 125               # 75% dei 100 danni recuperati
    assert e.stamina == e.stamina_max()       # stamina piena a ogni turno
    assert len(t.scelte["poteri"]) == 3 and t.scelte["rango"] == 2
    assert len(t.scelte["stats"]) == 2 and "controllo" not in t.scelte["stats"]
    assert t.scegli(-99, t.scelte["stats"][0]) is not None  # scelta non valida
    st0 = t.scelte["stats"][0]
    prima = e.stats[st0]
    assert t.scegli(t.scelte["poteri"][0]["id"], st0) is None
    assert len(e.poteri) == 2 and e.poteri[1]["rango"] == 2
    assert e.stats[st0] == prima + 1 and t.fase == "pronto"
    # sconfitta: eliminato, bracket completato in simulazione con un campione
    t.fase = "duello"
    t.risolvi_duello(False)
    assert t.fase == "eliminato" and t.campione and len(t.turni) == 4

    # vittoria completa: 4 turni vinti, 4 poteri, il campione entra nel box a LIV 5
    t2 = webapp.TorneoEvo()
    n_prima = len(webapp.STATO["personaggi"])
    for _ in range(4):
        t2.fase = "duello"
        t2.risolvi_duello(True)
        if t2.fase == "risultato":
            t2.scegli(t2.scelte["poteri"][0]["id"],
                      t2.scelte["stats"][0] if t2.scelte["stats"] else None)
    assert t2.fase == "vittoria" and t2.campione == t2.eroi[t2.io].nome
    assert len(t2.eroi[t2.io].poteri) == 4
    assert t2.eroi[t2.io].stats["controllo"] == 4
    assert len(webapp.STATO["personaggi"]) == n_prima + 1
    rec_c = webapp.STATO["personaggi"][-1]
    assert rec_c["livello"] == 5 and len(rec_c["poteri"]) == 4
    assert rec_c["bio"] == "Campione del Torneo Evo."
    webapp.STATO["personaggi"].pop()  # il campione di test non resta nel box vero
    webapp.salva_stato()

    # 5 poteri elementali completi (rango 1-4): sblocco attacchi + immunità permanente r4
    db5 = carica_db()
    poteri5 = {p["nome"]: p for p in db5["poteri"]}
    for nome, tipo_danno in [("Criocinesi", "gelo"), ("Acidocinesi", "acido"),
                             ("Telecinesi", "psionico"), ("Necromanzia", "magico"),
                             ("Geocinesi", "contundente")]:
        pw = poteri5[nome]
        assert pw["rango"] == 4
        assert all(pw["attacchi"][r] for r in ("1", "2", "4"))  # un attacco per rango giocato
        assert pw["stance"]["3"] and pw["stance_attivate"]["4"]
        p5 = Personaggio("Test" + nome)
        p5.stats["controllo"] = p5.stats["fisico"] = 4
        slot5 = {"def": pw, "rango": 4, "attivo": False}
        p5.poteri = [slot5]
        p5.attiva_potere(slot5, db5["attacchi"], db5["stances"], db5["effetti"])
        assert p5.immune(tipo_danno)  # la stance_attivate di rango 4 scatta subito

    # arto extra (Ali) a 0 hp: il potere si disattiva da solo e resta bloccato
    from engine import carica_db as _cdb2
    dbA = _cdb2()
    poteriA = {p["nome"]: p for p in dbA["poteri"]}
    pAli = Personaggio("Alato")
    pAli.stats["controllo"] = 4
    slotAli = {"def": poteriA["Ali"], "rango": 1, "attivo": False}
    pAli.poteri = [slotAli]
    pAli.attiva_potere(slotAli, dbA["attacchi"], dbA["stances"], dbA["effetti"])
    assert slotAli["attivo"] and "ala_sx" in pAli.hp
    assert pAli.puo_attivare_potere(slotAli)
    pAli.applica_danno("ala_sx", 999, "contundente")  # la spinge a 0 (o sotto)
    assert not slotAli["attivo"]  # si e' disattivato da solo
    assert not pAli.puo_attivare_potere(slotAli)  # bloccato: l'ala e' ancora rotta
    righe_blocco = pAli.attiva_potere(slotAli, dbA["attacchi"], dbA["stances"], dbA["effetti"])
    assert not slotAli["attivo"]  # il tentativo di riattivazione viene rifiutato
    assert "inutilizzabile" in righe_blocco[0]
    # una cura esterna riporta le ali sopra 0: ora si puo' riattivare (e tornano a piena vita)
    # (999 danni sfondano anche l'altra ala via splash: vanno guarite entrambe)
    pAli.hp["ala_sx"] = 10
    pAli.hp["ala_dx"] = 10
    assert pAli.puo_attivare_potere(slotAli)
    pAli.attiva_potere(slotAli, dbA["attacchi"], dbA["stances"], dbA["effetti"])
    assert slotAli["attivo"] and pAli.hp["ala_sx"] == pAli.hp_max["ala_sx"]

    # una disattivazione MANUALE (non forzata da arto rotto) rimuove la locazione come prima
    pAli.disattiva_potere(slotAli)
    assert "ala_sx" not in pAli.hp and "ala_sx" not in pAli.locazione_potere

    # stessa meccanica per 2x2 (braccia extra)
    p2x2 = Personaggio("Quattrobraccia")
    slot2x2 = {"def": poteriA["2x2"], "rango": 1, "attivo": False}
    p2x2.poteri = [slot2x2]
    p2x2.attiva_potere(slot2x2, dbA["attacchi"], dbA["stances"], dbA["effetti"])
    braccio = "secondo braccio Sx"
    assert braccio in p2x2.hp
    p2x2.applica_danno(braccio, 999, "contundente")
    assert not slot2x2["attivo"]
    assert not p2x2.puo_attivare_potere(slot2x2)

    # audit generale: ogni potere ha almeno un componente in ogni rango 1-4
    campi_pw = ["effetti", "effetti_nel_tempo", "attacchi", "stance", "stance_attivate"]
    for pw in dbA["poteri"]:
        for r in ("1", "2", "3", "4"):
            assert any(pw.get(c, {}).get(r) for c in campi_pw), \
                f"{pw['nome']} rango {r} e' vuoto"

    # ---- resa ----
    # il giocatore si arrende in un duello normale: sconfitta immediata
    rec_resa = {"id": 999, "nome": "Arrendevole", "stats": {s: 1 for s in
                ("fisico", "riflessi", "mente", "sociale", "controllo")},
                "skills": {}, "poteri": [], "hp": dict(LOCAZIONI), "crippled": [],
                "livello": 1, "xp": 0, "token": 0, "toughness": 0, "equip": [],
                "vittorie": 0, "sconfitte": 0, "morto": False}
    webapp.DUELLO = webapp.DuelloWeb(rec_resa)
    d_resa = webapp.DUELLO
    d_resa.fase = "player"
    d_resa.attivo, d_resa.altro = d_resa.p, d_resa.cpu
    err = d_resa.azione_player({"tipo": "resa"})
    assert err is None and d_resa.finito
    assert d_resa.vincitore is d_resa.cpu
    assert any("si arrende" in r["t"] for r in d_resa.log)

    # nel Torneo Evo la resa non esiste (né per il giocatore né per la CPU)
    p_t1, p_t2 = Personaggio("T1"), Personaggio("T2")
    from engine import dotazione_base as _dot
    db_resa = webapp.DB
    _dot(p_t1, db_resa["attacchi"], db_resa["stances"])
    _dot(p_t2, db_resa["attacchi"], db_resa["stances"])
    d_torneo = webapp.DuelloWeb(pg=p_t1, avversario=p_t2)
    d_torneo.fase = "player"
    d_torneo.attivo, d_torneo.altro = d_torneo.p, d_torneo.cpu
    err_t = d_torneo.azione_player({"tipo": "resa"})
    assert err_t == "nel Torneo Evo non ci si arrende" and not d_torneo.finito
    for l in d_torneo.cpu.hp:
        d_torneo.cpu.hp[l] = 1  # anche malridotta, nel torneo la CPU non si arrende
    assert not d_torneo._cpu_vuole_arrendersi()

    # la CPU si arrende (fuori dal torneo) solo se malridotta
    d_cpu = webapp.DuelloWeb(rec_resa)
    assert not d_cpu._cpu_vuole_arrendersi()  # a piena vita mai
    for l in d_cpu.cpu.hp:
        d_cpu.cpu.hp[l] = 1
    _rand = webapp.random.random
    webapp.random.random = lambda: 0.0  # forza il lancio probabilistico
    assert d_cpu._cpu_vuole_arrendersi()
    webapp.random.random = lambda: 0.99
    assert not d_cpu._cpu_vuole_arrendersi()  # il 50% può anche dire no
    webapp.random.random = _rand

    # ---- toughness: nessun guadagno senza danni subiti ----
    _salva, _crediti = webapp.salva_stato, webapp.STATO["crediti"]
    webapp.salva_stato = lambda: None  # niente scritture su disco nel test
    d_perf = webapp.DuelloWeb(dict(rec_resa, nome="Illeso", toughness=5))
    d_perf.finito = True
    d_perf.vincitore = d_perf.p  # vittoria senza un graffio
    webapp.DUELLO = d_perf
    webapp.chiudi_duello()
    assert d_perf.rec["toughness"] == 5  # nessun danno subito: tempra invariata
    assert d_perf.rec["xp"] > 0          # ma l'XP arriva comunque
    d_dmg = webapp.DuelloWeb(dict(rec_resa, nome="Ferito", toughness=5))
    d_dmg.finito = True
    d_dmg.vincitore = d_dmg.cpu
    d_dmg.p.hp["busto"] -= 100
    webapp.DUELLO = d_dmg
    webapp.chiudi_duello()
    assert d_dmg.rec["toughness"] == 5 + 1  # coi danni la tempra cresce
    webapp.salva_stato = _salva
    webapp.STATO["crediti"] = _crediti
    webapp.DUELLO = None

    # ---- arena: bookmaker live, sponsor, pubblico ----
    rec_arena = {"id": 998, "nome": "Scommettitore", "stats": {s: 1 for s in
                 ("fisico", "riflessi", "mente", "sociale", "controllo")},
                 "skills": {}, "poteri": [], "hp": dict(LOCAZIONI), "crippled": [],
                 "livello": 1, "xp": 0, "token": 0, "toughness": 0, "equip": [],
                 "vittorie": 0, "sconfitte": 0, "morto": False}
    _salva2 = webapp.salva_stato
    webapp.salva_stato = lambda: None
    webapp.STATO["crediti"] = 1000

    d_ar = webapp.DuelloWeb(dict(rec_arena))
    d_ar.fase = "player"
    d_ar.attivo, d_ar.altro = d_ar.p, d_ar.cpu
    assert d_ar.sponsor_offerte and len(d_ar.sponsor_offerte) == 2  # duello vero: offerte pronte

    # quota: pari forze e pari vita -> vicino alla parità; perdere vita alza la quota (sfavorito)
    q0 = d_ar.quota_attuale()
    d_ar.p.hp["busto"] -= d_ar.p.hp_max["busto"] // 2
    q1 = d_ar.quota_attuale()
    assert q1 > q0  # meno vita = quota più alta (comeback mechanic)

    # scommessa: piazzata in qualsiasi momento (qui è il turno del player, ma non richiesto)
    assert d_ar.azione_player({"tipo": "scommetti", "importo": 99999}) == "crediti insufficienti"
    prima_crediti = webapp.STATO["crediti"]
    err = d_ar.azione_player({"tipo": "scommetti", "importo": 100})
    assert err is None
    assert d_ar.scommessa == {"importo": 100, "quota": q1}
    assert webapp.STATO["crediti"] == prima_crediti - 100
    assert d_ar.azione_player({"tipo": "scommetti", "importo": 50}) == "hai già scommesso su questo duello"

    # sponsor: si sceglie tra le offerte, non due volte
    scelto = d_ar.sponsor_offerte[0]
    assert d_ar.azione_player({"tipo": "sponsor", "id": scelto["id"]}) is None
    assert d_ar.sponsor is scelto
    assert d_ar.azione_player({"tipo": "sponsor", "id": scelto["id"]}) == "hai già scelto uno sponsor"

    # pubblico: hype clampato 0-100, testo e tifo presenti
    d_ar._hype(1000)
    assert d_ar.hype == 100
    d_ar._hype(-1000)
    assert d_ar.hype == 0
    stato_pub = d_ar.pubblico_stato()
    assert "testo" in stato_pub and "tifo" in stato_pub

    # arena assente nel Torneo Evo (self.rec is None)
    pT, cT = Personaggio("PT"), Personaggio("CT")
    _dot(pT, webapp.DB["attacchi"], webapp.DB["stances"])
    _dot(cT, webapp.DB["attacchi"], webapp.DB["stances"])
    d_torneo2 = webapp.DuelloWeb(pg=pT, avversario=cT)
    assert d_torneo2.sponsor_offerte is None
    assert d_torneo2.info_arena() is None
    assert d_torneo2.azione_player({"tipo": "scommetti", "importo": 10}) == "questa modalità non ha scommesse"

    # sponsor "lampo": vince entro il round 3 -> condizione rispettata; oltre, fallita
    d_lampo = webapp.DuelloWeb(dict(rec_arena, nome="Lampo"))
    d_lampo.round = 2
    assert d_lampo._sponsor_condizione({"id": "lampo"}) is True
    assert not d_lampo._sponsor_fallito({"id": "lampo"})
    d_lampo.round = 5
    assert d_lampo._sponsor_condizione({"id": "lampo"}) is False
    assert d_lampo._sponsor_fallito({"id": "lampo"})

    # sponsor "bestia"/"stoico": mutuamente esclusivi sull'uso dei poteri
    d_pot = webapp.DuelloWeb(dict(rec_arena, nome="Potente"))
    assert d_pot._sponsor_condizione({"id": "bestia"}) is False
    assert d_pot._sponsor_condizione({"id": "stoico"}) is True
    d_pot.usato_potere = True
    assert d_pot._sponsor_condizione({"id": "bestia"}) is True
    assert d_pot._sponsor_condizione({"id": "stoico"}) is False
    assert d_pot._sponsor_fallito({"id": "stoico"})  # ha già usato un potere: impossibile ormai

    # sponsor "incassatore": bisogna essere scesi sotto il 30% degli hp totali
    d_inc = webapp.DuelloWeb(dict(rec_arena, nome="Incassa"))
    assert d_inc._sponsor_condizione({"id": "incassatore"}) is False
    d_inc.min_hp_pct = 0.2
    assert d_inc._sponsor_condizione({"id": "incassatore"}) is True

    # payout a fine duello: scommessa vinta paga importo*quota, sponsor paga solo se la
    # condizione (oltre alla vittoria) è rispettata
    d_fin = webapp.DuelloWeb(dict(rec_arena, nome="Finale"))
    d_fin.scommessa = {"importo": 100, "quota": 3.0}
    d_fin.sponsor = {"id": "lampo", "nome": "Sponsor Lampo", "bonus": 150,
                     "descrizione": "Paga se vinci entro il round 3."}
    d_fin.round = 2  # entro il round 3: condizione rispettata
    d_fin.finito = True
    d_fin.vincitore = d_fin.p
    prima = webapp.STATO["crediti"]
    webapp.DUELLO = d_fin
    webapp.chiudi_duello()
    atteso = prima + webapp.RICOMPENSA_VITTORIA + 300 + 150  # vittoria + scommessa(100*3) + sponsor
    assert webapp.STATO["crediti"] == atteso, (webapp.STATO["crediti"], atteso)

    webapp.salva_stato = _salva2
    webapp.DUELLO = None

    # ---- arena nel Torneo Evo: montepremi accumulato, riscattato solo da campioni ----
    _salva3 = webapp.salva_stato
    webapp.salva_stato = lambda: None
    webapp.STATO["crediti"] = 500

    t3 = webapp.TorneoEvo()
    t3.fase = "pronto"
    avv3 = t3.eroi[t3.avversario_idx()]
    d_t3 = webapp.DuelloWeb(pg=t3.eroi[t3.io], avversario=avv3, torneo=t3)
    d_t3.fase = "player"
    d_t3.attivo, d_t3.altro = d_t3.p, d_t3.cpu
    assert d_t3.arena_attiva and d_t3.sponsor_offerte  # arena attiva anche nel torneo
    assert d_t3.info_arena()["torneo_pot"] == 0

    # la puntata nel torneo NON tocca i crediti reali (è virtuale finché non vinci tutto)
    crediti_prima3 = webapp.STATO["crediti"]
    assert d_t3.azione_player({"tipo": "scommetti", "importo": 999999}) == \
        f"puntata massima nel torneo: {webapp.MAX_SCOMMESSA_TORNEO}¤"
    err3 = d_t3.azione_player({"tipo": "scommetti", "importo": 100})
    assert err3 is None
    assert webapp.STATO["crediti"] == crediti_prima3  # invariati: è virtuale

    # una vittoria di round accumula la vincita nel montepremi del torneo, non nei crediti
    d_t3.vincitore = d_t3.p
    t3.risolvi_duello(True, d_t3)
    assert t3.bonus_accumulato == int(100 * d_t3.scommessa["quota"])
    assert webapp.STATO["crediti"] == crediti_prima3  # ancora invariati

    # eliminazione: il montepremi accumulato va perso (mai accreditato)
    pot_prima_eliminazione = t3.bonus_accumulato
    assert pot_prima_eliminazione > 0
    t4 = webapp.TorneoEvo()
    t4.bonus_accumulato = 777
    t4.fase = "pronto"
    t4.risolvi_duello(False)  # sconfitta: nessun duello arena da risolvere qui, solo il forfeit del pot
    assert t4.fase == "eliminato"
    assert any("perso" in r for r in t4.log_arena)
    assert webapp.STATO["crediti"] == crediti_prima3  # il pot perso non è mai finito nei crediti

    # vittoria del torneo: _premia() riscatta l'intero montepremi accumulato in crediti veri
    t5 = webapp.TorneoEvo()
    t5.bonus_accumulato = 321
    crediti_prima5 = webapp.STATO["crediti"]
    t5._premia()
    assert webapp.STATO["crediti"] == crediti_prima5 + 321
    assert any("Campione" in r for r in t5.log_arena)
    webapp.STATO["personaggi"].pop()  # pulizia del campione fittizio di test

    webapp.salva_stato = _salva3

    print("OK — tutti i check passati")


if __name__ == "__main__":
    main()
