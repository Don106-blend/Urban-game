"""Urban RPG — simulatore di combattimento a turni (GUI Tkinter).
L'utente controlla il primo personaggio, la CPU il secondo. Dati da data/*.json.
La logica di gioco vive in engine.py (condivisa con l'app web).
Avvio: python combat.py
"""
import random
import tkinter as tk
from tkinter import ttk, messagebox

from engine import (DADI, LOCAZIONI, ARTI, STATS, SKILLS, FALLBACK,
                    per_rango, carica, bonus_colpire, Personaggio,
                    personaggio_casuale, scheda)

CPU_DELAY_MS = 900  # pausa tra un'azione e l'altra della CPU, per seguire cosa fa


class CombatApp:
    def __init__(self, root):
        self.root = root
        root.title("Urban RPG — Combattimento")
        self.db_attacchi = carica("attacks.json")
        self.db_poteri = carica("powers.json")
        self.db_stances = carica("stances.json")
        self.db_effetti = carica("effects.json")

        top = ttk.Frame(root, padding=6)
        top.pack(fill="x")
        self.lbl_stato = ttk.Label(top, text="", font=("TkDefaultFont", 11, "bold"))
        self.lbl_stato.pack(side="left")
        ttk.Button(top, text="Nuovo combattimento",
                   command=self.nuovo_combattimento).pack(side="right")

        centro = ttk.Frame(root, padding=6)
        centro.pack(fill="both", expand=True)
        self.pannelli = []
        for col in (0, 2):
            t = tk.Text(centro, width=38, height=42, state="disabled", font=("Consolas", 9))
            t.grid(row=0, column=col, sticky="ns", padx=4)
            self.pannelli.append(t)
        mid = ttk.Frame(centro)
        mid.grid(row=0, column=1, sticky="nsew", padx=4)
        centro.columnconfigure(1, weight=1)
        centro.rowconfigure(0, weight=1)

        logf = ttk.Frame(mid)
        logf.pack(fill="both", expand=True)
        self.txt_log = tk.Text(logf, height=16, state="disabled", wrap="word")
        self.txt_log.pack(side="left", fill="both", expand=True)
        sc = ttk.Scrollbar(logf, command=self.txt_log.yview)
        sc.pack(side="right", fill="y")
        self.txt_log["yscrollcommand"] = sc.set
        self.txt_log.tag_configure("hit", foreground="#1a7f37")
        self.txt_log.tag_configure("miss", foreground="#c0392b")
        self.txt_log.tag_configure("immune", foreground="#1565c0")
        self.txt_log.tag_configure("crit", foreground="#8e24aa",
                                   font=("TkDefaultFont", 9, "bold"))
        self.frm_azioni = ttk.Frame(mid, padding=4)
        self.frm_azioni.pack(fill="x")

        self.menu = None  # None = menu principale; "attacchi"/"poteri"/"stance" = sottomenu aperto
        self.nuovo_combattimento()

    # ---------- utilità ----------
    def log(self, msg="", tag=None):
        if tag is None:
            if "CRIPPLED" in msg or "sconfitto" in msg:
                tag = "crit"
            elif "immune" in msg:
                tag = "immune"
        self.txt_log["state"] = "normal"
        self.txt_log.insert("end", msg + "\n", tag or ())
        self.txt_log["state"] = "disabled"
        self.txt_log.see("end")

    def scegli(self, titolo, opzioni):
        """Dialogo modale: un bottone per opzione, ritorna la scelta (X = prima opzione)."""
        win = tk.Toplevel(self.root)
        win.title(titolo)
        win.transient(self.root)
        win.grab_set()
        scelta = tk.StringVar(value=opzioni[0])
        ttk.Label(win, text=titolo, padding=8).pack()
        for o in opzioni:
            ttk.Button(win, text=o,
                       command=lambda o=o: (scelta.set(o), win.destroy())).pack(
                fill="x", padx=16, pady=2)
        ttk.Frame(win, height=8).pack()
        win.wait_window()
        return scelta.get()

    def scegli_per(self, personaggio, titolo, opzioni):
        """Come scegli(), ma se il personaggio è la CPU decide da sola (nessun dialogo)."""
        if len(opzioni) == 1:
            return opzioni[0]
        if personaggio is self.cpu:
            scelta = random.choice(opzioni)
            self.log(f"({personaggio.nome} [CPU] sceglie: {scelta})")
            return scelta
        return self.scegli(titolo, opzioni)

    def controlla_sconfitta(self, p, vincitore):
        if p.sconfitto() and not self.finito:
            self.finito = True
            self.log(f"\n*** {p.nome} è sconfitto! {vincitore.nome} vince! ***")
            messagebox.showinfo("Fine combattimento",
                                f"{p.nome} è sconfitto!\n{vincitore.nome} vince!")

    # ---------- flusso di gioco ----------
    def nuovo_combattimento(self):
        self.txt_log["state"] = "normal"
        self.txt_log.delete("1.0", "end")
        self.txt_log["state"] = "disabled"
        c1 = personaggio_casuale(self.db_attacchi, self.db_poteri, self.db_stances)
        c2 = personaggio_casuale(self.db_attacchi, self.db_poteri, self.db_stances, {c1.nome})
        self.pg = [c1, c2]
        self.cpu = c2  # il secondo combattente è giocato dalla CPU
        c1.init_stamina()
        c2.init_stamina()
        self.finito = False
        self.log("=== NUOVO COMBATTIMENTO ===")
        self.log(f"{c1.nome} (tu) contro {c2.nome} (CPU).")
        while True:
            r1, r2 = c1.tira("riflessi", c2), c2.tira("riflessi", c1)
            self.log(f"Iniziativa: {c1.nome} tira {r1}, {c2.nome} tira {r2}.")
            if r1 != r2:
                break
            self.log("Pareggio, si ritira.")
        self.ordine = [c1, c2] if r1 > r2 else [c2, c1]
        self.log(f"{self.ordine[0].nome} agisce per primo.")
        self.round = 0
        self.nuovo_round()

    def nuovo_round(self):
        self.round += 1
        self.idx = 0
        for p in self.pg:
            p.azioni, p.bonus, p.risposte = p.n_azioni, p.n_bonus, p.n_risposte
        self.log(f"\n--- ROUND {self.round} ---")
        self.inizia_turno()

    def inizia_turno(self):
        self.attivo = self.ordine[self.idx]
        self.altro = self.ordine[1 - self.idx]
        self.menu = None
        self.log(f"Turno di {self.attivo.nome}.")
        for r in self.attivo.tick_turno():
            self.log("  " + r)
        self.controlla_sconfitta(self.attivo, self.altro)
        self.refresh()
        if not self.finito and self.attivo is self.cpu:
            self.root.after(CPU_DELAY_MS, self.turno_cpu)

    def fine_turno(self):
        if self.idx == 0:
            self.idx = 1
            self.inizia_turno()
        else:
            self.nuovo_round()

    def turno_cpu(self):
        self._passo_cpu()

    def _passo_cpu(self):
        """Un'azione della CPU per volta, poi si ri-schedula da sola con un delay
        (così si legge nel log cosa sta succedendo invece di vederlo tutto insieme)."""
        if self.finito:
            return
        a = self.attivo
        fatto = False
        if a.puo_mirare() and random.random() < 0.3:
            self.prendi_mira()
            fatto = True
        if not fatto and a.azioni > 0:
            inattivi = [s for s in a.poteri if not s["attivo"] and a.puo_attivare_potere(s)]
            if inattivi and random.random() < 0.7:
                self.usa_potere(random.choice(inattivi))
                fatto = True
            else:
                usabili = [x for x in a.attacchi if a.puo_usare_attacco(x)]
                if usabili:
                    self.usa_attacco(random.choice(usabili))
                    fatto = True
        if not fatto and a.bonus > 0:
            disponibili = [s for s in a.stance_conosciute
                           if all(st["def"]["id"] != s["id"] for st in a.stance_attive)
                           and a.puo_attivare_stance(s)]
            if disponibili and random.random() < 0.4:
                self.usa_stance(random.choice(disponibili))
                fatto = True
        if self.finito:
            return
        if fatto:
            self.root.after(CPU_DELAY_MS, self._passo_cpu)
        else:
            self.root.after(CPU_DELAY_MS, self.fine_turno)

    # ---------- azioni ----------
    def prendi_mira(self):
        a = self.attivo
        loc = self.scegli_per(a, f"{a.nome} prende la mira: dove?", list(self.altro.hp))
        a.consuma_mira()
        a.mira = loc
        self.log(f"{a.nome} prende la mira su {loc} "
                 "(+4 alla difficoltà, il prossimo attacco punta lì).")
        self.menu = None
        self.refresh()

    def disattiva_potere(self, slot):
        self.attivo.bonus -= 1
        for riga in self.attivo.disattiva_potere(slot):
            self.log(riga)
        self.menu = None
        self.refresh()

    def usa_potere(self, slot):
        if not self.attivo.puo_attivare_potere(slot):
            self.log(f"{slot['def']['nome']} è inutilizzabile: un arto è a 0 hp.")
            self.menu = None
            self.refresh()
            return
        self.attivo.azioni -= 1
        for riga in self.attivo.attiva_potere(slot, self.db_attacchi,
                                              self.db_stances, self.db_effetti):
            self.log(riga)
        self.menu = None
        self.refresh()

    def usa_stance(self, sdef):
        a = self.attivo
        a.bonus -= 1
        for riga in a.attiva_stance(sdef, self.altro, self.db_effetti):
            self.log(riga)
        self.menu = None
        self.refresh()

    def usa_attacco(self, att):
        a, d = self.attivo, self.altro
        a.azioni -= 1
        a.consuma_attacco(att)
        mirata = a.mira if att.get("can_aim") else None
        a.mira = None
        loc = mirata if mirata in d.hp else random.choice(list(d.hp))
        tipo_danno = att.get("tipo_danno", "contundente")
        self.log(f"{a.nome} usa {att['nome']} su {d.nome}"
                 + (f", mirando a {loc}." if mirata else f" (locazione casuale: {loc})."))
        # chi è anch'esso in volo raggiunge un bersaglio in volo pure in mischia
        if (not att.get("ranged") and d.ha_flag("immune_melee")
                and not a.ha_flag("immune_melee")):
            self.log(f"{d.nome} è in volo: le mosse non a distanza non lo raggiungono!",
                     tag="immune")
            self.menu = None
            self.refresh()
            return
        skill = att.get("skill_colpire") or ("armi_distanza" if att.get("ranged")
                                             else "armi_corpo_a_corpo")
        pen_mira = 4 if mirata else 0
        mod = bonus_colpire(a, d)
        ta = a.tira(skill, d) + mod
        td = d.tira("riflessi", a) + pen_mira
        patta = ta == td
        self.log(f"Tiro per colpire: {ta} ({skill}"
                 + (f", {mod:+d} da stance" if mod else "") + f") contro {td} (riflessi"
                 + (f" +{pen_mira} mira" if pen_mira else "") + ")."
                 + (" Patta!" if patta else ""))
        if ta < td:
            self.log(f"{a.nome} manca il colpo.", tag="miss")
            for riga in a.scatta_trigger("manchi", d, self.db_effetti):
                self.log("  " + riga)
            self.menu = None
            self.refresh()
            return
        # l'attacco supera la prova: solo ora il difensore può scegliere una risposta
        opzioni = ["nessuna risposta"]
        if d.risposte > 0:
            # ponytail: parata solo corpo a corpo e solo in patta; "parata_sempre" (Paladino) ignora entrambi
            if (patta and not att.get("ranged")) or d.ha_flag("parata_sempre"):
                opzioni.append("parata")
            if att.get("can_dodge") and d.puo_schivare():
                opzioni.append("schivata")
        risp = self.scegli_per(d, f"Risposta di {d.nome}?", opzioni)
        colpito = True
        if risp == "parata":
            d.risposte -= 1
            loc = self.scegli_per(d, f"{d.nome} para: dove incassa il colpo?", list(d.hp))
            self.log(f"{d.nome} para e incassa su {loc}.")
        elif risp == "schivata":
            d.risposte -= 1
            mg = d.malus_gambe()
            td2 = d.tira("acrobatica", a) + pen_mira + mg
            self.log(f"{d.nome} tenta la schivata: {td2} (acrobatica"
                     + (f" +{pen_mira} mira" if pen_mira else "")
                     + (f" {mg} gambe ferite" if mg else "") + f") contro {ta}.")
            colpito = td2 < ta
            if not colpito:
                self.log(f"{d.nome} schiva!", tag="miss")
        if not colpito:
            for riga in a.scatta_trigger("manchi", d, self.db_effetti):
                self.log("  " + riga)
        if colpito:
            danno = a.tira_formula(att["danno"], d)
            split = att.get("split_danni", False)
            self.log(f"Colpito! {danno} danni ({tipo_danno})"
                     + (" suddivisi su tutto il corpo." if split else f" a {loc}."), tag="hit")
            hp_prima = sum(d.hp.values())
            for riga in d.applica_danno(loc, danno, tipo_danno, split=split):
                self.log("  " + riga)
            if att.get("speciale") == "assorbi_caratteristica":
                for riga in a.assorbi_caratteristica(d, att.get("speciale_turni", 3)):
                    self.log("  " + riga)
            danno_reale = hp_prima - sum(d.hp.values())
            for riga in d.applica_effetti(att.get("effetti_applicati", []),
                                          self.db_effetti, loc=loc):
                self.log("  " + riga)
            # trigger delle stance conseguenti al colpo
            for riga in d.scatta_trigger("vieni_colpito", a, self.db_effetti):
                self.log("  " + riga)
            if danno_reale > 0:
                for riga in a.scatta_trigger("fai_danni", d, self.db_effetti):
                    self.log("  " + riga)
                for riga in d.scatta_trigger("subisci_danni", a, self.db_effetti):
                    self.log("  " + riga)
            self.controlla_sconfitta(d, a)
        self.menu = None
        self.refresh()

    # ---------- UI ----------
    def refresh(self):
        for i, p in enumerate(self.pg):
            t = self.pannelli[i]
            t["state"] = "normal"
            t.delete("1.0", "end")
            t.insert("end", scheda(p, attivo=(p is self.attivo and not self.finito),
                                   cpu=(p is self.cpu)))
            t["state"] = "disabled"
        self.lbl_stato["text"] = ("Combattimento finito" if self.finito
                                  else f"Round {self.round} — turno di {self.attivo.nome}")
        for w in self.frm_azioni.winfo_children():
            w.destroy()
        if self.finito:
            return
        a = self.attivo
        if a is self.cpu:
            ttk.Label(self.frm_azioni, text=f"{a.nome} (CPU) sta giocando...").pack(anchor="w")
            return
        {"attacchi": self._menu_attacchi, "poteri": self._menu_poteri,
         "stance": self._menu_stance}.get(self.menu, self._menu_principale)(a)
        ttk.Button(self.frm_azioni, text="Fine turno",
                   command=self.fine_turno).pack(fill="x", pady=(6, 1))

    def _apri_menu(self, sezione):
        self.menu = sezione
        self.refresh()

    def _indietro(self):
        self.menu = None
        self.refresh()

    def _menu_principale(self, a):
        b = ttk.Button(self.frm_azioni, text="Attacchi",
                       command=lambda: self._apri_menu("attacchi"))
        if (a.azioni < 1 or not a.attacchi) and not a.puo_mirare():
            b.state(["disabled"])
        b.pack(fill="x", pady=1)

        inattivi = [s for s in a.poteri if not s["attivo"]]
        attivi = [s for s in a.poteri if s["attivo"]]
        b = ttk.Button(self.frm_azioni, text="Poteri",
                       command=lambda: self._apri_menu("poteri"))
        # utile sia per attivare (1 azione) sia per disattivare (1 bonus)
        if not ((a.azioni >= 1 and inattivi) or (a.bonus >= 1 and attivi)):
            b.state(["disabled"])
        b.pack(fill="x", pady=1)

        disponibili = [s for s in a.stance_conosciute
                       if all(st["def"]["id"] != s["id"] for st in a.stance_attive)
                       and a.puo_attivare_stance(s)]
        b = ttk.Button(self.frm_azioni, text="Stance",
                       command=lambda: self._apri_menu("stance"))
        if a.bonus < 1 or not disponibili:
            b.state(["disabled"])
        b.pack(fill="x", pady=1)

    def _menu_attacchi(self, a):
        costo_mira = "1 azione bonus" if a.mira_bonus else "1 azione"
        b = ttk.Button(self.frm_azioni, text=f"Prendi la mira ({costo_mira})",
                       command=self.prendi_mira)
        if not a.puo_mirare():
            b.state(["disabled"])
        b.pack(fill="x", pady=1)
        for att in a.attacchi:
            stato = a.stato_attacco(att)
            extra = ""
            if stato["cooldown"] > 0:
                extra = f" [ricarica: {stato['cooldown']}]"
            elif stato["usi_rimasti"] is not None:
                extra = f" [usi: {stato['usi_rimasti']}]"
            b = ttk.Button(self.frm_azioni, text=f"{att['nome']}{extra} (1 azione)",
                           command=lambda att=att: self.usa_attacco(att))
            if a.azioni < 1 or not a.puo_usare_attacco(att):
                b.state(["disabled"])
            b.pack(fill="x", pady=1)
        ttk.Button(self.frm_azioni, text="< Indietro",
                   command=self._indietro).pack(fill="x", pady=(4, 1))

    def _menu_poteri(self, a):
        for slot in a.poteri:
            if not slot["attivo"]:
                rotto = not a.puo_attivare_potere(slot)
                extra = " [ARTO A 0 HP]" if rotto else ""
                b = ttk.Button(self.frm_azioni,
                               text=f"Attiva potere: {slot['def']['nome']}{extra} "
                                    f"(1 azione, -{slot['rango']} stamina/turno)",
                               command=lambda s=slot: self.usa_potere(s))
                if a.azioni < 1 or rotto:
                    b.state(["disabled"])
                b.pack(fill="x", pady=1)
            else:
                b = ttk.Button(self.frm_azioni,
                               text=f"Disattiva potere: {slot['def']['nome']} (1 azione bonus)",
                               command=lambda s=slot: self.disattiva_potere(s))
                if a.bonus < 1:
                    b.state(["disabled"])
                b.pack(fill="x", pady=1)
        ttk.Button(self.frm_azioni, text="< Indietro",
                   command=self._indietro).pack(fill="x", pady=(4, 1))

    def _menu_stance(self, a):
        for sdef in a.stance_conosciute:
            if all(st["def"]["id"] != sdef["id"] for st in a.stance_attive):
                stato = a.stato_stance(sdef)
                extra = ""
                if stato["cooldown"] > 0:
                    extra = f" [ricarica: {stato['cooldown']}]"
                elif stato["usi_rimasti"] is not None:
                    extra = f" [usi: {stato['usi_rimasti']}]"
                b = ttk.Button(self.frm_azioni,
                               text=f"Stance: {sdef['nome']}{extra} (1 azione bonus)",
                               command=lambda s=sdef: self.usa_stance(s))
                if a.bonus < 1 or not a.puo_attivare_stance(sdef):
                    b.state(["disabled"])
                b.pack(fill="x", pady=1)
        ttk.Button(self.frm_azioni, text="< Indietro",
                   command=self._indietro).pack(fill="x", pady=(4, 1))


if __name__ == "__main__":
    root = tk.Tk()
    CombatApp(root)
    root.mainloop()
