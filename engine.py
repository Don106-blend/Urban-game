"""Urban RPG — motore di gioco (nessuna GUI).
Contiene regole, dadi, Personaggio e generazione casuale.
Usato sia dal simulatore Tkinter (combat.py) sia dall'app web Flask (app.py).
"""
import json
import os
import random

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")

DADI = {1: 6, 2: 8, 3: 10, 4: 20}
DADI_FISSI = {"d4": 4, "d6": 6, "d8": 8, "d10": 10, "d12": 12, "d20": 20}
MAX_POTERI = 4
LOCAZIONI = {"testa": 50, "busto": 150, "braccio_sx": 100, "braccio_dx": 100,
             "gamba_sx": 100, "gamba_dx": 100}
ARTI = ("braccio_sx", "braccio_dx", "gamba_sx", "gamba_dx")
STATS = ["fisico", "riflessi", "mente", "sociale", "controllo"]
NOMI_PROPRI = ["Aris", "Luna", "Marco", "Sasha", "Ivan", "Nadia", "Teo", "Zoe",
               "Dario", "Mira", "Elia", "Vera", "Kai", "Nina", "Ruben", "Alba",
               "Ciro", "Greta", "Milo", "Irene", "Yuri", "Petra", "Leo", "Aida",
               "Bruno", "Cleo", "Dante", "Emma", "Furio", "Gaia", "Hugo", "Iris",
               "Jonas", "Kira", "Lino", "Maya", "Nico", "Olga", "Pablo", "Rita"]
COGNOMI = ["Kade", "Voss", "Ferri", "Reyes", "Petrov", "Kessler", "Marchetti",
           "Halloran", "Colombo", "Sokolova", "Marek", "Lindt", "Draven", "Costa",
           "Weiss", "Moreau", "Falk", "Serra", "Novak", "Quinn", "Rasmussen",
           "Bianchi", "Okafor", "Silva", "Katz", "Duarte", "Lindqvist", "Moretti",
           "Vance", "Iwata", "Krüger", "Esposito", "Nakamura", "Riva", "Volkov",
           "Greco", "Anand", "Leone", "Fontaine", "Barros"]


def nome_casuale(usati=()):
    """Nome completo casuale non ancora usato (galleria 40x40 combinazioni)."""
    for _ in range(200):
        nome = f"{random.choice(NOMI_PROPRI)} {random.choice(COGNOMI)}"
        if nome not in usati:
            return nome
    return f"{random.choice(NOMI_PROPRI)} {random.choice(COGNOMI)} II"


def per_rango(mapping, rango):
    """Effetti/effetti_nel_tempo di un potere sono definiti per rango (dict "1".."4").
    Non sono cumulativi: prende il rango posseduto, o il più alto sotto di esso
    già definito (es. rank1=x10 vale anche al rank2-3 finché rank4=x100 non lo sovrascrive)."""
    for r in range(rango, 0, -1):
        lst = mapping.get(str(r), [])
        if lst:
            return lst
    return []


def carica(nome_file):
    path = os.path.join(DATA, nome_file)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return []


def carica_db():
    """Tutti i database di gioco in un dict."""
    return {"attacchi": carica("attacks.json"), "poteri": carica("powers.json"),
            "stances": carica("stances.json"), "effetti": carica("effects.json"),
            "equip": carica("equipment.json")}


# skill definite in data/skills.json: nome + statistica di ripiego se il rango è 0
DB_SKILLS = carica("skills.json")
SKILLS = [s["nome"] for s in DB_SKILLS]
FALLBACK = {s["nome"]: s.get("fallback", "fisico") for s in DB_SKILLS}


def _valore_mod(m, proprietario, altro):
    """Valore di un modificatore di stance: flat + dado proprio - dado avversario."""
    v = m.get("flat", 0)
    if m.get("dado_proprio"):
        v += proprietario.tira(m["dado_proprio"])
    if m.get("dado_avversario"):
        v -= altro.tira(m["dado_avversario"])
    return v


def bonus_colpire(attaccante, difensore):
    """Somma dei modificatori al tiro per colpire dell'attaccante: dalle proprie stance,
    dai propri effetti attivi (es. stordimento), dalle stance del difensore
    e dai bracci feriti (-2 per braccio in negativo)."""
    tot = attaccante.malus_bracci()
    for st in attaccante.stance_attive:
        for m in st["def"].get("modificatori", []):
            if m["tipo"] == "colpire_proprio":
                tot += _valore_mod(m, attaccante, difensore)
    for e in attaccante.effetti_attivi:
        for m in e["def"].get("modificatori", []):
            if m["tipo"] == "colpire":
                tot += m.get("flat", 0)
    for st in difensore.stance_attive:
        for m in st["def"].get("modificatori", []):
            if m["tipo"] == "colpire_avversario":
                tot += _valore_mod(m, difensore, attaccante)
    return tot


class Personaggio:
    """Scheda personaggio + stato di combattimento."""

    def __init__(self, nome, data_nascita="", bio=""):
        self.nome = nome
        self.data_nascita = data_nascita
        self.bio = bio
        self.hp_max = dict(LOCAZIONI)
        self.hp = dict(LOCAZIONI)
        # locazioni extra: inattive e nascoste di default
        self.extra = {f"extra_{i}": None for i in range(1, 5)}
        self.stats = {s: 1 for s in STATS}
        self.skills = {s: 0 for s in SKILLS}
        self.movimento = "standard"
        self.n_azioni = 1
        self.n_bonus = 1
        self.n_risposte = 1
        self.poteri = []            # [{"def": potere, "rango": int, "attivo": bool}]
        self.attacchi = []          # definizioni attacco disponibili
        self.stance_conosciute = [] # definizioni stance conosciute
        self.stance_attive = []     # [{"def": stance, "turni": int}]
        self.stance_stato = {}      # id stance -> {"usi_rimasti": int|None, "cooldown": int}
        self.attacco_stato = {}     # id attacco -> {"usi_rimasti": int|None, "cooldown": int}
        self.swap_attivi = []       # scambi di statistiche in corso (assorbi_caratteristica)
        self.effetti_attivi = []    # [{"def": effetto, "turni": int}] (turni -1 = persistente)
        self.resistenze = {}        # tipo_danno -> riduzione flat (permanente, dai poteri)
        self.immunita = set()       # tipi di danno annullati (permanente, dai poteri)
        self.debolezze = set()      # tipi di danno subiti al +50% (permanente, dai poteri)
        self.armatura = {loc: 0 for loc in LOCAZIONI}
        self.crippled = set()
        self.locazione_potere = {}  # nome_loc -> slot potere che l'ha creata (Ali, 2x2...)
        # risorse del round corrente
        self.azioni = self.bonus = self.risposte = 0
        self.mira = None       # locazione mirata per il prossimo attacco
        self.mira_bonus = False  # True (es. Supersoldato): mirare costa 1 bonus invece di 1 azione
        self.stamina = None    # inizializzata a inizio combattimento (init_stamina)

    # ---------- dadi ----------
    def _mod_rango(self, tipo, target):
        """Somma i delta di rango dati dalle proprie stance attive di tipo mod_rango
        con questo target ("self" o "avversario") su questa statistica/skill."""
        return sum(m.get("delta", 0)
                   for st in self.stance_attive
                   for m in st["def"].get("modificatori", [])
                   if m["tipo"] == "mod_rango" and m.get("target") == target
                   and m.get("statistica") == tipo)

    def _mod_rango_effetti(self, tipo):
        """Delta di rango dai propri effetti attivi (sempre su di sé, nessun target)."""
        return sum(m.get("delta", 0)
                   for e in self.effetti_attivi
                   for m in e["def"].get("modificatori", [])
                   if m["tipo"] == "mod_rango" and m.get("statistica") == tipo)

    def _flat_risultato(self, tipo):
        """Flat espliciti (tipo flat_risultato) dati dai propri effetti attivi su una skill/stat."""
        return sum(m.get("valore", 0)
                   for e in self.effetti_attivi
                   for m in e["def"].get("modificatori", [])
                   if m["tipo"] == "flat_risultato" and m.get("statistica") == tipo)

    def _calcola_rango(self, tipo, avversario=None):
        """Rango effettivo (1-4) per un tiro, più l'eventuale malus da rango sfondato.
        Il rango non scende mai sotto 1: se il debuff lo spingerebbe più giù,
        il rango resta 1 e si applica un flat -2 al risultato del tiro."""
        if tipo in self.stats:
            base = self.stats[tipo]
        else:
            r = self.skills.get(tipo, 0)
            base = r if r > 0 else self.stats.get(FALLBACK.get(tipo, "fisico"), 1)
        delta = self._mod_rango(tipo, "self") + self._mod_rango_effetti(tipo)
        if avversario is not None:
            delta += avversario._mod_rango(tipo, "avversario")
        grezzo = base + delta
        rango = max(1, min(4, grezzo))
        malus_floor = -2 if grezzo < 1 else 0
        return rango, malus_floor

    def rango_dado(self, tipo, avversario=None):
        return self._calcola_rango(tipo, avversario)[0]

    def tira(self, tipo, avversario=None):
        if tipo in DADI_FISSI:  # dado a taglia fissa (es. "d6"), non legato a statistiche
            return random.randint(1, DADI_FISSI[tipo])
        rango, malus_floor = self._calcola_rango(tipo, avversario)
        flat = malus_floor + self._flat_risultato(tipo)
        return random.randint(1, DADI[rango]) + flat

    def tira_formula(self, f, avversario=None):
        """(somma dadi + flat) * mult — usata per danni ed effetti."""
        tot = sum(self.tira(d["tipo"], avversario)
                  for d in f.get("dadi", []) for _ in range(d.get("n", 1)))
        return (tot + f.get("flat", 0)) * f.get("mult", 1)

    def potere_attivo(self, nome):
        return any(s["attivo"] and s["def"]["nome"] == nome for s in self.poteri)

    def malus_bracci(self):
        """-2 a colpire per ogni braccio con hp in negativo (cumulativo)."""
        return -2 * sum(1 for l in self.hp if l.startswith("braccio") and self.hp[l] < 0)

    def malus_gambe(self):
        """-2 a schivare per ogni gamba con hp in negativo (cumulativo)."""
        return -2 * sum(1 for l in self.hp if l.startswith("gamba") and self.hp[l] < 0)

    def puo_schivare(self):
        """Una gamba CRIPPLED toglie la schivata."""
        return not any(l in self.crippled for l in self.hp if l.startswith("gamba"))

    def puo_mirare(self):
        risorsa = self.bonus if self.mira_bonus else self.azioni
        if risorsa <= 0 or self.mira or not any(att.get("can_aim") for att in self.attacchi):
            return False
        # un braccio CRIPPLED toglie la mira (il potere 2x2 compensa con gli arti extra)
        braccio_rotto = any(l in self.crippled for l in self.hp if l.startswith("braccio"))
        return not braccio_rotto or self.potere_attivo("2x2")

    def consuma_mira(self):
        """Mirare costa 1 azione (1 azione bonus con mira_bonus, es. Supersoldato)."""
        if self.mira_bonus:
            self.bonus -= 1
        else:
            self.azioni -= 1

    # ---------- stamina ----------
    def stamina_max(self):
        return (self.stats["fisico"] + self.stats["riflessi"] + self.stats["mente"]) * 2

    def init_stamina(self):
        self.stamina = self.stamina_max()

    # ---------- stato ----------
    def sconfitto(self):
        return self.hp["testa"] <= 0 or self.hp["busto"] <= 0

    def ha_flag(self, flag):
        return any(m["tipo"] == flag
                   for st in self.stance_attive
                   for m in st["def"].get("modificatori", []))

    def resistenza_tot(self, tipo_danno):
        # "tutto" copre ogni tipo di danno; "nessuno" non combacia mai
        tot = self.resistenze.get(tipo_danno, 0) + self.resistenze.get("tutto", 0)
        for st in self.stance_attive:
            for m in st["def"].get("modificatori", []):
                if m["tipo"] == "resistenza" and m.get("tipo_danno") in (tipo_danno, "tutto"):
                    tot += m.get("valore", 0)
        return tot

    def immune(self, tipo_danno):
        if "tutto" in self.immunita or tipo_danno in self.immunita:
            return True
        return any(m["tipo"] == "immunita" and m.get("tipo_danno") in (tipo_danno, "tutto")
                   for st in self.stance_attive
                   for m in st["def"].get("modificatori", []))

    def ha_debolezza(self, tipo_danno):
        """+50% danni di questo tipo: da poteri (permanente), stance o effetti attivi."""
        if "tutto" in self.debolezze or tipo_danno in self.debolezze:
            return True
        mods = [m for st in self.stance_attive
                for m in st["def"].get("modificatori", [])]
        mods += [m for e in self.effetti_attivi
                 for m in e["def"].get("modificatori", [])]
        return any(m["tipo"] == "debolezza" and m.get("tipo_danno") in (tipo_danno, "tutto")
                   for m in mods)

    # ---------- danni ----------
    def _assorbi(self, loc, danno):
        """Armatura della locazione: assorbe prima degli hp."""
        if self.armatura.get(loc, 0) > 0 and danno > 0:
            ass = min(self.armatura[loc], danno)
            self.armatura[loc] -= ass
            return danno - ass, [f"L'armatura assorbe {ass} danni su {loc}."]
        return danno, []

    def applica_danno(self, loc, danno, tipo_danno="contundente", split=False):
        """Applica danno a una locazione (o a tutte, se split), ritorna le righe di log."""
        if self.immune(tipo_danno):
            return [f"{self.nome} è immune ai danni di tipo {tipo_danno}!"]
        righe = []
        if self.ha_debolezza(tipo_danno) and danno > 0:
            extra = danno // 2
            danno += extra
            righe.append(f"Debolezza ({tipo_danno}): +{extra} danni.")
        res = self.resistenza_tot(tipo_danno)
        if res > 0 and danno > 0:
            rid = min(res, danno)
            danno -= rid
            righe.append(f"Resistenza ({tipo_danno}): -{rid} danni.")
        if danno <= 0:
            righe.append("Il colpo non fa danni.")
            return righe
        # le locazioni sono quelle del personaggio: include eventuali arti extra (es. ali)
        if split or self.ha_flag("distribuisci_danni"):
            quota = danno // len(self.hp)  # ponytail: resti della divisione persi
            righe.append(f"I danni vengono suddivisi: {quota} per locazione.")
            for l in self.hp:
                dmg, r2 = self._assorbi(l, quota)
                righe += r2
                if dmg > 0:
                    self.hp[l] -= dmg
        else:
            danno, r2 = self._assorbi(loc, danno)
            righe += r2
            if danno > 0 and loc in ("testa", "busto"):
                self.hp[loc] -= danno
                righe.append(f"{loc}: -{danno} ({self.hp[loc]} hp)")
            elif danno > 0:
                # arto: danno pieno finché è sopra 0, poi metà all'arto e metà alle altre parti
                if self.hp[loc] > 0:
                    diretto = min(self.hp[loc], danno)
                    self.hp[loc] -= diretto
                    danno -= diretto
                    righe.append(f"{loc}: -{diretto} ({self.hp[loc]} hp)")
                if danno > 0:
                    meta = danno // 2
                    self.hp[loc] -= meta
                    altre = [l for l in self.hp if l != loc]
                    quota = (danno - meta) // len(altre)  # ponytail: resti persi
                    for l in altre:
                        self.hp[l] -= quota
                    righe.append(f"{loc} è a 0: -{meta} all'arto ({self.hp[loc]} hp), "
                                 f"-{quota} a ciascuna altra locazione.")
        for l in self.hp:
            if l in ("testa", "busto"):
                continue
            if self.hp[l] <= -self.hp_max[l] and l not in self.crippled:
                self.crippled.add(l)
                righe.append(f"{l} è CRIPPLED!")
        # un arto extra (Ali, 2x2...) a 0 hp o meno disattiva il potere che l'ha creato
        for nome_loc, slot in list(self.locazione_potere.items()):
            if slot.get("attivo") and self.hp.get(nome_loc, 1) <= 0:
                righe.append(f"{nome_loc} è a 0 hp: {slot['def']['nome']} si disattiva!")
                righe += self.disattiva_potere(slot, preserva_locazioni=True)
        return righe

    # ---------- effetti nel tempo e stance ----------
    def applica_effetti(self, specs, db_effetti, loc=None, fonte=None):
        """Aggiunge effetti nel tempo (specs: [{"effetto": id, "turni": n, "persistente": bool}]).
        loc = locazione colpita, usata dagli effetti non-split per il tick.
        persistente = dura finché la fonte (il potere) resta attiva: turni -1.
        "cancella_stance" è istantaneo: non si aggiunge a effetti_attivi."""
        righe = []
        for sp in specs:
            edef = next((e for e in db_effetti if e["id"] == sp.get("effetto")), None)
            if edef is None:
                continue
            if edef.get("tipo") == "cancella_stance":
                righe += self.cancella_stance_attiva()
                continue
            turni = -1 if sp.get("persistente") else sp.get("turni", 1)
            self.effetti_attivi.append({"def": edef, "turni": turni, "loc": loc,
                                        "fonte": fonte})
            durata = "finché il potere è attivo" if turni < 0 else f"per {turni} turni"
            righe.append(f"{self.nome} è sotto {edef['nome']} {durata}.")
        return righe

    def tick_turno(self):
        """Inizio del proprio turno: effetti nel tempo e durata delle stance.
        mod_rango/flat_risultato/colpire sono controllati live (come le stance), non qui:
        solo "azioni" va applicato esplicitamente perché le risorse del turno sono un pool."""
        righe = []
        for stato in list(self.stance_stato.values()) + list(self.attacco_stato.values()):
            if stato["cooldown"] > 0:  # cooldown residui da turni precedenti
                stato["cooldown"] -= 1
        for sw in list(self.swap_attivi):
            sw["turni"] -= 1
            if sw["turni"] <= 0:
                self.stats[sw["stat"]] = sw["mio"]
                sw["avversario"].stats[sw["stat"]] = sw["suo"]
                self.swap_attivi.remove(sw)
                righe.append(f"L'assorbimento di {sw['stat']} termina: statistiche ripristinate.")
        for e in list(self.effetti_attivi):
            edef = e["def"]
            if edef.get("tipo") in ("danno", "cura"):
                amt = self.tira_formula(edef.get("formula", {}))
                if edef.get("tipo") == "cura":
                    for l in self.hp:
                        self.hp[l] = min(self.hp_max[l], self.hp[l] + amt)
                    righe.append(f"{edef['nome']}: +{amt} hp a ogni locazione.")
                elif edef.get("split"):
                    righe.append(f"{edef['nome']}: {amt} danni suddivisi su tutte le locazioni.")
                    righe += ["  " + r for r in
                              self.applica_danno("busto", amt, edef.get("tipo_danno", "contundente"),
                                                 split=True)]
                else:
                    # locazione colpita dall'attacco che ha applicato l'effetto, altrimenti casuale
                    loc = e.get("loc") or random.choice(list(self.hp))
                    righe.append(f"{edef['nome']}: {amt} danni a {loc}.")
                    righe += ["  " + r for r in
                              self.applica_danno(loc, amt, edef.get("tipo_danno", "contundente"))]
            for m in edef.get("modificatori", []):
                if m["tipo"] == "azioni":
                    self.azioni = max(0, self.azioni + m.get("azioni", 0))
                    self.bonus = max(0, self.bonus + m.get("bonus", 0))
                    self.risposte = max(0, self.risposte + m.get("risposte", 0))
            if e["turni"] < 0:  # persistente: dura finché il potere-fonte resta attivo
                continue
            e["turni"] -= 1
            if e["turni"] <= 0:
                self.effetti_attivi.remove(e)
                righe.append(f"{edef['nome']} svanisce.")
        for st in list(self.stance_attive):
            if st["turni"] < 0:  # permanente (attivata da un potere)
                continue
            st["turni"] -= 1
            if st["turni"] <= 0:
                righe += self._termina_stance(st)
        righe += self._tick_stamina()
        return righe

    def _tick_stamina(self):
        """I poteri attivi consumano stamina pari al proprio rango a ogni tuo turno.
        Se la stamina non basta, i poteri si spengono da soli (dal rango più alto)."""
        if self.stamina is None:
            self.init_stamina()
        attivi = [s for s in self.poteri if s["attivo"]]
        if not attivi:
            return []
        righe = []
        drain = sum(s["rango"] for s in attivi)
        self.stamina -= drain
        righe.append(f"Stamina: -{drain} ({max(self.stamina, 0)}/{self.stamina_max()}).")
        while self.stamina < 0 and attivi:
            peggiore = max(attivi, key=lambda s: s["rango"])
            righe.append(f"{self.nome} è esausto: {peggiore['def']['nome']} si spegne.")
            righe += self.disattiva_potere(peggiore)
            attivi.remove(peggiore)
            self.stamina += peggiore["rango"]  # quel potere non drena più questo turno
        self.stamina = max(0, self.stamina)
        return righe

    def _termina_stance(self, st, forzata=False):
        """Rimuove una stance attiva e avvia il suo cooldown. Usata sia allo scadere
        naturale (tick_turno) sia da una cancellazione forzata (cancella_stance_attiva),
        così il cooldown parte comunque quando la stance smette di essere attiva."""
        self.stance_attive.remove(st)
        verbo = "viene annullata" if forzata else "termina"
        righe = [f"La stance {st['def']['nome']} {verbo}."]
        # ponytail: l'armatura concessa se ne va con la stance anche se in parte consumata
        for l, amt in st.get("armatura_add", {}).items():
            self.armatura[l] = max(0, self.armatura.get(l, 0) - amt)
        cd = st["def"].get("cooldown_turni", 0)
        if cd:
            self.stato_stance(st["def"])["cooldown"] = cd
            righe.append(f"{st['def']['nome']} in ricarica per {cd} turni.")
        return righe

    def cancella_stance_attiva(self):
        """Disattiva forzatamente la stance manuale attiva, se c'è, avviandone il cooldown
        come se fosse scaduta da sola (effetto Cancella_stance)."""
        st = self.stance_manuale_attiva()
        if st is None:
            return [f"{self.nome} non ha nessuna stance attiva da annullare."]
        return self._termina_stance(st, forzata=True)

    def stato_stance(self, sdef):
        """Stato persistente (cooldown/utilizzi) di una stance per questo personaggio."""
        sid = sdef.get("id", id(sdef))  # id(sdef): fallback per stance senza id esplicito
        return self.stance_stato.setdefault(sid, {
            "usi_rimasti": sdef.get("usi_massimi", 1) if sdef.get("usi_limitati") else None,
            "cooldown": 0,
        })

    # ---------- cooldown/utilizzi degli attacchi ----------
    def stato_attacco(self, att):
        aid = att.get("id", id(att))
        return self.attacco_stato.setdefault(aid, {
            "usi_rimasti": att.get("usi_massimi", 1) if att.get("usi_limitati") else None,
            "cooldown": 0,
        })

    def puo_usare_attacco(self, att):
        stato = self.stato_attacco(att)
        if stato["cooldown"] > 0:
            return False
        return stato["usi_rimasti"] is None or stato["usi_rimasti"] > 0

    def consuma_attacco(self, att):
        """Da chiamare quando l'attacco viene usato: scala utilizzi e fa partire il cooldown
        (che scorre a inizio dei propri turni: 1 = riusabile già dal turno successivo)."""
        stato = self.stato_attacco(att)
        if stato["usi_rimasti"] is not None:
            stato["usi_rimasti"] -= 1
        stato["cooldown"] = att.get("cooldown_turni", 0)

    def assorbi_caratteristica(self, avversario, turni):
        """Scambia una statistica casuale con l'avversario per X turni."""
        s = random.choice(STATS)
        mio, suo = self.stats[s], avversario.stats[s]
        self.stats[s], avversario.stats[s] = suo, mio
        self.swap_attivi.append({"stat": s, "mio": mio, "suo": suo,
                                 "turni": turni, "avversario": avversario})
        return [f"{self.nome} assorbe {s}: {mio} ⇄ {suo} per {turni} turni."]

    def stance_manuale_attiva(self):
        """La stance attivata manualmente in corso (le permanenti da potere non contano)."""
        return next((st for st in self.stance_attive if st["turni"] >= 0), None)

    def puo_attivare_stance(self, sdef):
        if self.stance_manuale_attiva() is not None:
            return False  # una sola stance attiva per volta
        stato = self.stato_stance(sdef)
        if stato["cooldown"] > 0:
            return False
        return stato["usi_rimasti"] is None or stato["usi_rimasti"] > 0

    def attiva_stance(self, sdef, avversario, db_effetti):
        gia = self.stance_manuale_attiva()
        if gia is not None:
            return [f"Hai già una stance attiva ({gia['def']['nome']}): una sola per volta."]
        stato = self.stato_stance(sdef)
        if stato["cooldown"] > 0:
            return [f"{sdef['nome']} è ancora in ricarica ({stato['cooldown']} turni)."]
        if stato["usi_rimasti"] is not None:
            if stato["usi_rimasti"] <= 0:
                return [f"{sdef['nome']} ha esaurito gli utilizzi disponibili."]
            stato["usi_rimasti"] -= 1
        righe = []
        dur = sdef.get("durata", {"tipo": "contrapposta"})
        if dur.get("tipo") == "fissa":
            turni = dur.get("turni", 1)
            righe.append(f"{self.nome} entra in stance {sdef['nome']} ({turni} turni).")
        else:
            mio, suo = self.tira("tattica", avversario), avversario.tira("tattica", self)
            turni = mio - suo
            righe.append(f"{self.nome} tenta la stance {sdef['nome']}: "
                         f"tattica {mio} contro {suo} = {max(turni, 0)} turni.")
        if turni <= 0:
            righe.append("La stance non prende effetto.")
            return righe
        st = {"def": sdef, "turni": turni}
        self.stance_attive.append(st)
        # modificatore "armatura": hp extra su una locazione (o tutte) finché dura la stance
        for m in sdef.get("modificatori", []):
            if m["tipo"] == "armatura":
                amt = _valore_mod(m, self, avversario) * m.get("mult", 1)
                loc = m.get("locazione", "tutte")
                locs = list(self.armatura) if loc == "tutte" else [loc]
                agg = st.setdefault("armatura_add", {})
                for l in locs:
                    if l in self.armatura:
                        self.armatura[l] += amt
                        agg[l] = agg.get(l, 0) + amt
                righe.append(f"Armatura +{amt} su {loc}.")
        # trigger "attivo"/"attiva": gli effetti nel tempo partono subito, all'attivazione
        if sdef.get("trigger", "attivo") in ("attivo", "attiva"):
            righe += self._applica_effetti_stance(sdef, avversario, db_effetti)
        return righe

    def _applica_effetti_stance(self, sdef, avversario, db_effetti):
        """Applica gli effetti nel tempo di una stance: su di sé e/o sull'avversario."""
        righe = self.applica_effetti(sdef.get("effetti_applicati", []), db_effetti)
        if avversario is not None:
            righe += avversario.applica_effetti(sdef.get("effetti_avversario", []), db_effetti)
        return righe

    def scatta_trigger(self, evento, avversario, db_effetti):
        """Le stance attive con questo trigger applicano i loro effetti nel tempo."""
        righe = []
        for st in list(self.stance_attive):
            if st["def"].get("trigger", "attivo") == evento:
                righe += self._applica_effetti_stance(st["def"], avversario, db_effetti)
        return righe

    # ---------- poteri ----------
    def puo_attivare_potere(self, slot):
        """False se un arto extra di questo potere (Ali, 2x2...) è rimasto a 0 hp
        o meno da una disattivazione forzata: resta bloccato finché non guarisce."""
        for eff in per_rango(slot["def"].get("effetti", {}), slot["rango"]):
            if eff["tipo"] == "locazione_extra" and self.hp.get(eff.get("nome", "extra"), 1) <= 0:
                return False
        return True

    def attiva_potere(self, slot, db_attacchi, db_stances, db_effetti):
        """Attiva un potere: effetti istantanei, effetti nel tempo,
        attacchi e stance sbloccati fino al rango posseduto.
        Registra in slot["revert"] cosa annullare alla disattivazione."""
        if not self.puo_attivare_potere(slot):
            return [f"{slot['def']['nome']} è ancora inutilizzabile: un arto è a 0 hp."]
        slot["attivo"] = True
        rango = slot["rango"]
        revert = slot["revert"] = []
        righe = [f"{self.nome} attiva {slot['def']['nome']} (rango {rango})."]
        for eff in per_rango(slot["def"].get("effetti", {}), rango):
            if eff["tipo"] == "armatura":
                amt = self.tira_formula(eff)
                for l in self.armatura:
                    self.armatura[l] += amt
                revert.append(("armatura", amt))
                righe.append(f"Armatura +{amt} su ogni locazione.")
            elif eff["tipo"] == "cura":
                # ponytail: cura tutte le locazioni; scelta della locazione quando servirà
                amt = self.tira_formula(eff)
                for l in self.hp:
                    self.hp[l] = min(self.hp_max[l], self.hp[l] + amt)
                righe.append(f"Cura {amt} hp su ogni locazione.")
            elif eff["tipo"] == "mod_statistica":
                s, delta = eff["statistica"], eff["delta"]
                if s in self.stats:
                    self.stats[s] = max(1, min(4, self.stats[s] + delta))
                else:
                    self.skills[s] = max(0, min(4, self.skills.get(s, 0) + delta))
                revert.append(("mod_statistica", s, delta))
                righe.append(f"{s}: {'+' if delta >= 0 else ''}{delta}.")
            elif eff["tipo"] == "resistenza":
                t, v = eff.get("tipo_danno", "contundente"), eff.get("valore", 0)
                self.resistenze[t] = self.resistenze.get(t, 0) + v
                revert.append(("resistenza", t, v))
                righe.append(f"Resistenza {t} +{v}.")
            elif eff["tipo"] == "immunita":
                t = eff.get("tipo_danno", "nessuno")
                self.immunita.add(t)
                revert.append(("immunita", t))
                righe.append(f"Immunità ai danni di tipo {t}.")
            elif eff["tipo"] == "debolezza":
                t = eff.get("tipo_danno", "nessuno")
                self.debolezze.add(t)
                revert.append(("debolezza", t))
                righe.append(f"Debolezza ai danni di tipo {t} (+50%).")
            elif eff["tipo"] == "mira_bonus":
                self.mira_bonus = True
                revert.append(("mira_bonus",))
                righe.append("Mirare ora costa 1 azione bonus invece di 1 azione.")
            elif eff["tipo"] == "azioni":
                # supervelocità & co.: aumenta le risorse per turno (e subito quelle del turno corrente)
                d_az, d_bon, d_ris = eff.get("azioni", 0), eff.get("bonus", 0), eff.get("risposte", 0)
                self.n_azioni += d_az
                self.n_bonus += d_bon
                self.n_risposte += d_ris
                self.azioni += d_az
                self.bonus += d_bon
                self.risposte += d_ris
                revert.append(("azioni", d_az, d_bon, d_ris))
                parti = [f"{n:+d} {lbl}" for n, lbl in
                         ((d_az, "azioni"), (d_bon, "azioni bonus"), (d_ris, "risposte")) if n]
                righe.append("Velocità: " + ", ".join(parti) + "." if parti else "Velocità: nessun cambiamento.")
            elif eff["tipo"] == "locazione_extra":
                # nuovo "arto" (es. ali): colpibile, para, può diventare CRIPPLED
                nome_loc = eff.get("nome", "extra")
                hp = eff.get("hp", 50)
                self.hp[nome_loc] = hp
                self.hp_max[nome_loc] = hp
                self.armatura.setdefault(nome_loc, 0)
                self.locazione_potere[nome_loc] = slot
                revert.append(("locazione", nome_loc))
                righe.append(f"Nuova locazione: {nome_loc} ({hp} hp).")
        righe += self.applica_effetti(per_rango(slot["def"].get("effetti_nel_tempo", {}), rango),
                                      db_effetti, fonte=slot)
        for r in range(1, rango + 1):
            for aid in slot["def"].get("attacchi", {}).get(str(r), []):
                att = next((x for x in db_attacchi if x["id"] == aid), None)
                if att is None:
                    continue
                if att.get("sostituisce"):
                    rimpiazzato = next((x for x in self.attacchi
                                        if x["id"] == att["sostituisce"]), None)
                    self.attacchi = [x for x in self.attacchi if x["id"] != att["sostituisce"]]
                    if rimpiazzato is not None:
                        revert.append(("attacco_ripristina", rimpiazzato))
                        righe.append(f"{att['nome']} sostituisce {rimpiazzato['nome']}.")
                if all(x["id"] != att["id"] for x in self.attacchi):
                    self.attacchi.append(att)
                    revert.append(("attacco", att["id"]))
                    righe.append(f"Sbloccato: {att['nome']}.")
            for sid in slot["def"].get("stance", {}).get(str(r), []):
                sdef = next((x for x in db_stances if x["id"] == sid), None)
                if sdef and all(x["id"] != sid for x in self.stance_conosciute):
                    self.stance_conosciute.append(sdef)
                    revert.append(("stance_appresa", sid))
                    righe.append(f"Stance appresa: {sdef['nome']}.")
        # stance auto-attivate: NON cumulative — vale la lista del rango posseduto
        # (o del rango pieno più vicino sotto), così un rango alto può cambiarle
        for sid in per_rango(slot["def"].get("stance_attivate", {}), rango):
            sdef = next((x for x in db_stances if x["id"] == sid), None)
            if sdef is None:
                continue
            if all(x["id"] != sid for x in self.stance_conosciute):
                self.stance_conosciute.append(sdef)
                revert.append(("stance_appresa", sid))
            if all(x["def"]["id"] != sid for x in self.stance_attive):
                # turni -1 = permanente: dura finché dura il potere
                self.stance_attive.append({"def": sdef, "turni": -1})
                revert.append(("stance_perm", sid))
                righe.append(f"Stance {sdef['nome']} attivata dal potere (permanente).")
        return righe

    def disattiva_potere(self, slot, preserva_locazioni=False):
        """Spegne un potere attivo annullando ciò che aveva concesso (slot["revert"]).
        Cure e danni già inflitti restano; l'armatura concessa viene tolta anche se
        in parte consumata (ponytail: max(0, ...), niente contabilità fine).
        preserva_locazioni=True (disattivazione forzata per arto a 0 hp): le locazioni
        extra NON vengono rimosse, restano a hp<=0 come "arto rotto" finché non guarisce
        (vedi puo_attivare_potere) — riattivare il potere le ricrea comunque a piena vita."""
        if not slot.get("attivo"):
            return [f"{slot['def']['nome']} non è attivo."]
        slot["attivo"] = False
        righe = [f"{self.nome} disattiva {slot['def']['nome']}."]
        for azione in reversed(slot.pop("revert", [])):
            tipo = azione[0]
            if tipo == "locazione" and preserva_locazioni:
                continue
            if tipo == "armatura":
                for l in self.armatura:
                    self.armatura[l] = max(0, self.armatura[l] - azione[1])
            elif tipo == "mod_statistica":
                s, delta = azione[1], azione[2]
                if s in self.stats:
                    self.stats[s] = max(1, min(4, self.stats[s] - delta))
                else:
                    self.skills[s] = max(0, min(4, self.skills.get(s, 0) - delta))
            elif tipo == "resistenza":
                self.resistenze[azione[1]] = max(0, self.resistenze.get(azione[1], 0) - azione[2])
            elif tipo == "immunita":
                self.immunita.discard(azione[1])
            elif tipo == "debolezza":
                self.debolezze.discard(azione[1])
            elif tipo == "mira_bonus":
                self.mira_bonus = False
            elif tipo == "azioni":
                d_az, d_bon, d_ris = azione[1], azione[2], azione[3]
                self.n_azioni -= d_az
                self.n_bonus -= d_bon
                self.n_risposte -= d_ris
                self.azioni = max(0, self.azioni - d_az)
                self.bonus = max(0, self.bonus - d_bon)
                self.risposte = max(0, self.risposte - d_ris)
            elif tipo == "locazione":
                self.hp.pop(azione[1], None)
                self.hp_max.pop(azione[1], None)
                self.armatura.pop(azione[1], None)
                self.crippled.discard(azione[1])
                self.locazione_potere.pop(azione[1], None)
            elif tipo == "attacco":
                self.attacchi = [x for x in self.attacchi if x["id"] != azione[1]]
            elif tipo == "attacco_ripristina":
                if all(x["id"] != azione[1]["id"] for x in self.attacchi):
                    self.attacchi.append(azione[1])
            elif tipo == "stance_appresa":
                self.stance_conosciute = [s for s in self.stance_conosciute
                                          if s["id"] != azione[1]]
            elif tipo == "stance_perm":
                self.stance_attive = [st for st in self.stance_attive
                                      if not (st["turni"] < 0 and st["def"]["id"] == azione[1])]
        # gli effetti persistenti legati a questo potere svaniscono con lui
        for e in list(self.effetti_attivi):
            if e.get("fonte") is slot:
                self.effetti_attivi.remove(e)
                righe.append(f"{e['def']['nome']} svanisce.")
        return righe


def dotazione_base(p, db_attacchi, db_stances):
    """Assegna attacchi e stance di default a un personaggio."""
    p.attacchi = [a for a in db_attacchi if a.get("attivo_default")]
    if not p.attacchi and db_attacchi:
        p.attacchi = [db_attacchi[0]]  # nessun default definito: almeno un attacco
    p.stance_conosciute = [s for s in db_stances if s.get("attivo_default")]


def costo_upgrade(rango):
    """Token per salire dal rango attuale al successivo: raddoppia a ogni grado."""
    return 2 ** max(0, rango - 1)


def eroe_base(db_attacchi, db_poteri, db_stances, nomi_usati=()):
    """Eroe di livello 1: tutto a rango 1, una statistica fisica a rango 2,
    un solo potere di rango 1. Cresce con i Token del level up."""
    p = Personaggio(nome_casuale(nomi_usati),
                    data_nascita=(f"{random.randint(1, 28):02d}/"
                                  f"{random.randint(1, 12):02d}/"
                                  f"{random.randint(1970, 2005)}"))
    for s in SKILLS:
        p.skills[s] = 1
    p.stats[random.choice(("fisico", "riflessi", "mente"))] = 2
    dotazione_base(p, db_attacchi, db_stances)
    if db_poteri:
        p.poteri.append({"def": random.choice(db_poteri), "rango": 1, "attivo": False})
    return p


def personaggio_casuale(db_attacchi, db_poteri, db_stances, nomi_usati=()):
    p = Personaggio(nome_casuale(nomi_usati),
                    data_nascita=(f"{random.randint(1, 28):02d}/"
                                  f"{random.randint(1, 12):02d}/"
                                  f"{random.randint(1970, 2005)}"))
    for s in STATS:
        p.stats[s] = random.randint(1, 4)
    for s in SKILLS:
        p.skills[s] = random.choice([0, 0, 1, 1, 2])
    # solo gli attacchi "attivi di default"; il resto arriva dai poteri
    dotazione_base(p, db_attacchi, db_stances)
    scelti = [pw for pw in db_poteri if random.random() < 0.35]
    if len(scelti) > MAX_POTERI:
        scelti = random.sample(scelti, MAX_POTERI)
    for pw in scelti:  # rango indipendente per ogni potere
        p.poteri.append({"def": pw, "rango": random.randint(1, max(1, pw.get("rango", 1))),
                         "attivo": False})
    return p


def valuta(p):
    """Punteggio di forza approssimativo di un personaggio, per il matchmaking."""
    return (3 * sum(p.stats.values()) + 2 * sum(p.skills.values())
            + 5 * sum(s["rango"] for s in p.poteri))


def scheda(p, attivo=False, cpu=False):
    r = [("► " if attivo else "") + p.nome + (" [CPU]" if cpu else ""),
         f"Nato/a: {p.data_nascita}"]
    if p.bio:
        r.append(p.bio)
    r += ["", f"Azioni {p.azioni}/{p.n_azioni}  Bonus {p.bonus}/{p.n_bonus}  "
              f"Risposte {p.risposte}/{p.n_risposte}"]
    if p.stamina is not None:
        r.append(f"Stamina {p.stamina}/{p.stamina_max()}")
    if p.mira:
        r.append(f"Sta mirando a: {p.mira}")
    r += ["", "HP:"]
    for loc, mx in p.hp_max.items():
        extra = f" [+{p.armatura[loc]}]" if p.armatura[loc] else ""
        cr = "  CRIPPLED" if loc in p.crippled else ""
        r.append(f"  {loc:<11}{p.hp[loc]:>5}/{mx}{extra}{cr}")
    r += ["", "Statistiche:"]
    for s in STATS:
        r.append(f"  {s:<10} {p.stats[s]} (D{DADI[p.stats[s]]})")
    r.append(f"  movimento  {p.movimento}")
    r += ["", "Skill:"]
    for s in SKILLS:
        v = p.skills[s]
        r.append(f"  {s:<19} {v}" + ("" if v else f" (usa {FALLBACK.get(s, 'fisico')})"))
    r += ["", "Poteri:"]
    if not p.poteri:
        r.append("  nessuno")
    for slot in p.poteri:
        r.append(f"  {slot['def']['nome']} r{slot['rango']}"
                 + (" [ATTIVO]" if slot["attivo"] else ""))
    r += ["", "Stance:"]
    if not p.stance_conosciute:
        r.append("  nessuna")
    for s in p.stance_conosciute:
        att = next((x for x in p.stance_attive if x["def"]["id"] == s["id"]), None)
        if att:
            r.append(f"  {s['nome']} [ATTIVA, "
                     + ("permanente]" if att["turni"] < 0 else f"{att['turni']} turni]"))
        else:
            r.append(f"  {s['nome']}")
    if p.immunita:
        r += ["", "Immunità:"]
        for t in sorted(p.immunita):
            r.append(f"  {t}")
    if p.resistenze:
        r += ["", "Resistenze:"]
        for t, v in p.resistenze.items():
            if v:
                r.append(f"  {t}: {v}")
    if p.effetti_attivi:
        r += ["", "Effetti attivi:"]
        for e in p.effetti_attivi:
            r.append(f"  {e['def']['nome']} ({e['turni']} turni)")
    r += ["", "Attacchi:"]
    for a in p.attacchi:
        r.append(f"  {a['nome']} [{a.get('tipo_danno', 'contundente')}]")
    return "\n".join(r)
