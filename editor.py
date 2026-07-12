"""Urban RPG — editor di attacchi, poteri, skill, stance ed effetti (GUI Tkinter).
Salva in data/*.json, ID auto-incrementali.
Avvio: python editor.py
"""
import json
import os
import re
import tkinter as tk
from tkinter import ttk, messagebox

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
FILES = {k: os.path.join(DATA, f"{v}.json") for k, v in
         {"attacchi": "attacks", "poteri": "powers", "skill": "skills",
          "stance": "stances", "effetti": "effects", "equip": "equipment"}.items()}

STATS = ["fisico", "riflessi", "mente", "sociale", "controllo"]
TIPI_DANNO = ["contundente", "perforante", "taglio", "fuoco", "elettrico",
              "magico", "divino", "acido", "psionico", "gelo",
              "tutto", "nessuno"]
TIPI_EFFETTO_POTERE = ["armatura", "cura", "mod_statistica", "resistenza", "immunita",
                       "debolezza", "azioni", "locazione_extra", "mira_bonus"]
TIPI_MODIFICATORE = ["colpire_proprio", "colpire_avversario", "parata_sempre",
                     "distribuisci_danni", "resistenza", "immunita", "debolezza",
                     "mod_rango", "immune_melee", "armatura"]
TARGET_MOD = ["self", "avversario"]
TRIGGER_STANCE = ["attivo", "attiva", "vieni_colpito", "manchi", "subisci_danni", "fai_danni"]
TIPI_MOD_EFFETTO = ["mod_rango", "flat_risultato", "colpire", "azioni", "debolezza"]
LOCAZIONI_STANCE = ["tutte", "testa", "busto", "braccio_sx", "braccio_dx",
                    "gamba_sx", "gamba_dx"]
DADI_FISSI = ["d4", "d6", "d8", "d10", "d12", "d20"]  # dadi a taglia fissa, es. 2d6*30

AIUTO_STANCE = """STANCE — guida rapida

Una stance è una tattica che resta attiva per una certa DURATA. Finché è
attiva, i suoi MODIFICATORI PASSIVI valgono di continuo, mentre gli EFFETTI
NEL TEMPO scattano nel momento indicato dal TRIGGER.

DURATA
  • contrapposta: al momento dell'attivazione tiri il tuo dado Tattica meno
    quello dell'avversario; il risultato (se > 0) è il numero di turni.
  • fissa: dura il numero di turni indicato, senza tiro.
  (Le stance date da un potere come "attivate subito" durano tutto lo scontro.)

COOLDOWN E UTILIZZI
  • Cooldown: turni di attesa dopo che la stance TERMINA prima di poterla
    riattivare (0 = nessuna attesa). Il conto alla rovescia parte quando
    finisce (scadenza naturale, non quando viene attivata).
  • Numero massimo di utilizzi: se attivo, la stance può essere attivata solo
    per quel numero di volte in tutto il combattimento (poi resta bloccata).

QUANDO (trigger) — decide quando scattano gli effetti nel tempo:
  • attivo  : (default) i modificatori sono sempre attivi; gli effetti nel
              tempo partono all'attivazione.
  • attiva  : come sopra, gli effetti partono una volta all'attivazione.
  • vieni_colpito : ogni volta che un attacco ti va a segno.
  • manchi        : ogni volta che manchi (o vieni schivato/parato).
  • subisci_danni : ogni volta che perdi HP davvero.
  • fai_danni     : ogni volta che infliggi HP di danno.
  I MODIFICATORI PASSIVI restano sempre attivi finché la stance è attiva,
  a prescindere dal trigger: il trigger governa solo gli effetti nel tempo.

ALLORA — cosa fa la stance (attiva solo le sezioni che ti servono):

  MODIFICATORI PASSIVI:
    • colpire_proprio     : modifica il TUO tiro per colpire.
    • colpire_avversario  : modifica il tiro per colpire dell'AVVERSARIO.
        (flat = bonus/malus fisso; dado proprio/avversario = aggiunge il tuo
         dado meno quello avversario, es. Taunt col dado sociale.)
    • parata_sempre       : puoi sempre parare i colpi che ti raggiungono.
    • distribuisci_danni  : i danni che subisci vengono divisi su tutto il corpo.
    • resistenza          : riduce di 'valore' i danni di un tipo (o "tutto").
    • immunita            : annulla i danni di un tipo (o "tutto").
    • mod_rango           : +/- ranghi a una statistica/skill; 'target' sceglie
        se l'effetto è su di te (self) o sull'avversario. delta va in delta/val.
    • immune_melee        : le mosse non a distanza (ranged off) non ti toccano
        (es. stance Volo: chi è a terra non ti raggiunge).

  EFFETTI NEL TEMPO (su se stesso): DoT/cura applicati a TE quando scatta il trigger.
  EFFETTI NEL TEMPO (sull'avversario): applicati all'AVVERSARIO quando scatta.
  (Gli effetti veri e propri — bruciatura, cura, ecc. — si creano nella tab Effetti.)
"""


def carica(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return []


def salva(path, dati):
    os.makedirs(DATA, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(dati, f, ensure_ascii=False, indent=2)


def prossimo_id(items):
    return max((i["id"] for i in items), default=0) + 1


def num(var, default=0):
    """Legge un intero da una StringVar. Se il campo contiene testo sporco
    (es. "0-1" perché si è digitato senza selezionare il vecchio valore),
    recupera comunque l'ultimo numero scritto invece di azzerarlo in silenzio."""
    s = var.get().strip()
    try:
        return int(s)
    except (ValueError, tk.TclError):
        pass
    trovati = re.findall(r"-?\d+", s)
    return int(trovati[-1]) if trovati else default


def combo(parent, var, get_values, width):
    """Combobox con valori ricalcolati all'apertura del menu (sempre aggiornati)."""
    cb = ttk.Combobox(parent, textvariable=var, state="readonly", width=width)
    cb.configure(postcommand=lambda: cb.configure(values=get_values()))
    cb["values"] = get_values()
    return cb


def id_da_etichetta(s):
    return int(s.split(" - ")[0]) if s else None


def campo(parent, etichetta, widget):
    """Etichetta sopra al widget: leggibile senza dipendere dall'allineamento a colonne."""
    cella = ttk.Frame(parent)
    ttk.Label(cella, text=etichetta, foreground="#888").pack(anchor="w")
    widget.pack(anchor="w")
    cella.pack(side="left", padx=(0, 14))


class RigheDinamiche:
    """Base per liste di righe con bottone [+] e [x] per riga."""

    def __init__(self, parent, testo_btn="+"):
        self.frame = ttk.Frame(parent)
        self.righe = []
        self.btn = ttk.Button(self.frame, text=testo_btn, command=self.aggiungi)
        self.btn.pack(anchor="w", pady=2)

    def _registra(self, riga, dati):
        ttk.Button(riga, text="x", width=2,
                   command=lambda: self.rimuovi(riga)).pack(side="left", padx=2)
        riga.pack(anchor="w", pady=1, before=self.btn)
        self.righe.append((riga, dati))

    def rimuovi(self, riga):
        self.righe = [r for r in self.righe if r[0] is not riga]
        riga.destroy()

    def svuota(self):
        for r, _ in self.righe:
            r.destroy()
        self.righe = []

    def aggiungi(self, item=None):
        raise NotImplementedError

    def set(self, items):
        self.svuota()
        for i in items:
            self.aggiungi(i)


class RigheDadi(RigheDinamiche):
    """Righe 'n dadi | tipo dado'. Il dado può derivare da una statistica/skill
    oppure essere a taglia fissa (d4..d20), es. 2d6*30."""

    def __init__(self, parent, get_tipi):
        super().__init__(parent, "+ dado")
        self.get_tipi = get_tipi

    def aggiungi(self, item=None):
        item = item or {}
        riga = ttk.Frame(self.frame)
        nv = tk.StringVar(value=str(item.get("n", 1)))
        tv = tk.StringVar(value=item.get("tipo", "fisico"))
        tk.Spinbox(riga, from_=1, to=20, width=3, textvariable=nv).pack(side="left")
        combo(riga, tv, lambda: DADI_FISSI + self.get_tipi(), 20).pack(side="left", padx=3)
        self._registra(riga, (nv, tv))

    def get(self):
        return [{"n": num(nv, 1), "tipo": tv.get()} for _, (nv, tv) in self.righe]


class SelettoreRighe(RigheDinamiche):
    """Righe di combobox 'id - nome' (attacchi, stance...)."""

    def __init__(self, parent, get_valori):
        super().__init__(parent, "+")
        self.get_valori = get_valori

    def aggiungi(self, item=None):
        riga = ttk.Frame(self.frame)
        v = tk.StringVar(value=item or "")
        combo(riga, v, self.get_valori, 26).pack(side="left")
        self._registra(riga, v)

    def get(self):
        return [id_da_etichetta(v.get()) for _, v in self.righe if v.get()]

    def set_ids(self, ids):
        etichette = []
        for i in ids:
            etichette.append(next((e for e in self.get_valori()
                                   if e.startswith(f"{i} - ")), ""))
        self.set(etichette)

    def refresh_valori(self):
        """Aggiorna le opzioni dei combobox già creati, senza aspettare che l'utente
        li riapra (es. dopo aver salvato un nuovo attacco/stance in un'altra tab)."""
        valori = self.get_valori()
        for riga, _ in self.righe:
            for child in riga.winfo_children():
                if isinstance(child, ttk.Combobox):
                    child.configure(values=valori)


class RigheEffettiApplicati(RigheDinamiche):
    """Righe 'effetto (id - nome) | turni' per attacchi/poteri/stance."""

    def __init__(self, parent, get_valori):
        super().__init__(parent, "+ effetto")
        self.get_valori = get_valori

    def aggiungi(self, item=None):
        item = item or {}
        riga = ttk.Frame(self.frame)
        v = tk.StringVar()
        if item.get("effetto"):
            v.set(next((e for e in self.get_valori()
                        if e.startswith(f"{item['effetto']} - ")), ""))
        tv = tk.StringVar(value=str(item.get("turni", 1)))
        pv = tk.BooleanVar(value=item.get("persistente", False))
        combo(riga, v, self.get_valori, 26).pack(side="left")
        ttk.Label(riga, text="turni").pack(side="left", padx=(6, 2))
        tk.Spinbox(riga, from_=1, to=99, width=3, textvariable=tv).pack(side="left")
        ttk.Checkbutton(riga, text="persistente (finché il potere è attivo)",
                        variable=pv).pack(side="left", padx=6)
        self._registra(riga, (v, tv, pv))

    def get(self):
        return [{"effetto": id_da_etichetta(v.get()), "turni": num(tv, 1),
                 "persistente": pv.get()}
                for _, (v, tv, pv) in self.righe if v.get()]


class RigheEffettiPotere(RigheDinamiche):
    """Effetti istantanei dei poteri: armatura/cura (dadi), mod_statistica, resistenza."""

    def __init__(self, parent, get_tipi):
        super().__init__(parent, "+ effetto")
        self.get_tipi = get_tipi

    def aggiungi(self, item=None):
        item = item or {}
        dado = (item.get("dadi") or [{}])[0]
        riga = ttk.Frame(self.frame, relief="groove", borderwidth=1, padding=6)
        tv = tk.StringVar(value=item.get("tipo", "armatura"))
        nv = tk.StringVar(value=str(dado.get("n", 1)))
        dv = tk.StringVar(value=dado.get("tipo", "controllo"))
        fv = tk.StringVar(value=str(item.get("flat", 0)))
        mv = tk.StringVar(value=str(item.get("mult", 1)))
        sv = tk.StringVar(value=item.get("statistica", "fisico"))
        ev = tk.StringVar(value=str(item.get("delta", item.get("valore", item.get("hp", 1)))))
        dnv = tk.StringVar(value=item.get("tipo_danno", "contundente"))
        azv = tk.StringVar(value=str(item.get("azioni", 0)))
        bov = tk.StringVar(value=str(item.get("bonus", 0)))
        riv = tk.StringVar(value=str(item.get("risposte", 0)))
        lv = tk.StringVar(value=item.get("nome", ""))

        corpo = ttk.Frame(riga)
        corpo.pack(side="left")
        linea1 = ttk.Frame(corpo)
        linea1.pack(anchor="w")
        campo(linea1, "Tipo", combo(linea1, tv, lambda: TIPI_EFFETTO_POTERE, 15))
        campo(linea1, "N dadi (arm/cura)", tk.Spinbox(linea1, from_=0, to=20, width=4,
                                                      textvariable=nv))
        campo(linea1, "Dado", combo(linea1, dv, self.get_tipi, 17))
        campo(linea1, "Flat", ttk.Entry(linea1, textvariable=fv, width=6))
        campo(linea1, "Molt.", ttk.Entry(linea1, textvariable=mv, width=6))
        campo(linea1, "Nome locazione extra", ttk.Entry(linea1, textvariable=lv, width=14))

        linea2 = ttk.Frame(corpo)
        linea2.pack(anchor="w", pady=(6, 0))
        campo(linea2, "Statistica (mod)", combo(linea2, sv, self.get_tipi, 17))
        campo(linea2, "Delta / valore / hp", ttk.Entry(linea2, textvariable=ev, width=7))
        campo(linea2, "Tipo danno", combo(linea2, dnv, lambda: TIPI_DANNO, 13))
        campo(linea2, "Azioni", tk.Spinbox(linea2, from_=-9, to=9, width=4, textvariable=azv))
        campo(linea2, "Bonus", tk.Spinbox(linea2, from_=-9, to=9, width=4, textvariable=bov))
        campo(linea2, "Risposte", tk.Spinbox(linea2, from_=-9, to=9, width=4, textvariable=riv))

        self._registra(riga, (tv, nv, dv, fv, mv, sv, ev, dnv, azv, bov, riv, lv))
        riga.pack_configure(pady=4)

    def get(self):
        out = []
        for _, (tv, nv, dv, fv, mv, sv, ev, dnv, azv, bov, riv, lv) in self.righe:
            t = tv.get()
            if t == "mod_statistica":
                out.append({"tipo": t, "statistica": sv.get(), "delta": num(ev)})
            elif t == "resistenza":
                out.append({"tipo": t, "tipo_danno": dnv.get(), "valore": num(ev)})
            elif t in ("immunita", "debolezza"):
                out.append({"tipo": t, "tipo_danno": dnv.get()})
            elif t == "mira_bonus":
                out.append({"tipo": t})
            elif t == "locazione_extra":
                out.append({"tipo": t, "nome": lv.get().strip() or "extra",
                            "hp": num(ev, 50)})
            elif t == "azioni":
                out.append({"tipo": t, "azioni": num(azv), "bonus": num(bov),
                            "risposte": num(riv)})
            else:
                out.append({"tipo": t, "dadi": [{"n": num(nv, 1), "tipo": dv.get()}],
                            "flat": num(fv), "mult": num(mv, 1)})
        return out


class RigheModificatori(RigheDinamiche):
    """Modificatori passivi delle stance."""

    def __init__(self, parent, get_tipi):
        super().__init__(parent, "+ modificatore")
        self.get_tipi = get_tipi
    def aggiungi(self, item=None):
        item = item or {}
        riga = ttk.Frame(self.frame, relief="groove", borderwidth=1, padding=6)
        tv = tk.StringVar(value=item.get("tipo", "colpire_proprio"))
        fv = tk.StringVar(value=str(item.get("flat", 0)))
        dpv = tk.StringVar(value=item.get("dado_proprio", ""))
        dav = tk.StringVar(value=item.get("dado_avversario", ""))
        dnv = tk.StringVar(value=item.get("tipo_danno", "contundente"))
        vv = tk.StringVar(value=str(item.get("valore", item.get("delta",
                                                                item.get("mult", 0)))))
        sv = tk.StringVar(value=item.get("statistica", "fisico"))
        tgv = tk.StringVar(value=item.get("target", "self"))
        lv = tk.StringVar(value=item.get("locazione", "tutte"))
        con_vuoto = lambda: [""] + self.get_tipi()

        corpo = ttk.Frame(riga)
        corpo.pack(side="left")
        linea1 = ttk.Frame(corpo)
        linea1.pack(anchor="w")
        campo(linea1, "Tipo", combo(linea1, tv, lambda: TIPI_MODIFICATORE, 19))
        campo(linea1, "Flat", ttk.Entry(linea1, textvariable=fv, width=6))
        campo(linea1, "Dado proprio", combo(linea1, dpv, con_vuoto, 16))
        campo(linea1, "Dado avversario", combo(linea1, dav, con_vuoto, 16))

        linea2 = ttk.Frame(corpo)
        linea2.pack(anchor="w", pady=(6, 0))
        campo(linea2, "Tipo danno", combo(linea2, dnv, lambda: TIPI_DANNO, 13))
        campo(linea2, "Valore / delta / molt.", ttk.Entry(linea2, textvariable=vv, width=7))
        campo(linea2, "Statistica (mod rango)", combo(linea2, sv, self.get_tipi, 17))
        campo(linea2, "Target", combo(linea2, tgv, lambda: TARGET_MOD, 10))
        campo(linea2, "Locazione (armatura)", combo(linea2, lv, lambda: LOCAZIONI_STANCE, 12))

        self._registra(riga, (tv, fv, dpv, dav, dnv, vv, sv, tgv, lv))

    def get(self):
        out = []
        for _, (tv, fv, dpv, dav, dnv, vv, sv, tgv, lv) in self.righe:
            t = tv.get()
            if t in ("parata_sempre", "distribuisci_danni", "immune_melee"):
                out.append({"tipo": t})
            elif t == "resistenza":
                out.append({"tipo": t, "tipo_danno": dnv.get(), "valore": num(vv)})
            elif t in ("immunita", "debolezza"):
                out.append({"tipo": t, "tipo_danno": dnv.get()})
            elif t == "mod_rango":
                out.append({"tipo": t, "statistica": sv.get(), "delta": num(vv),
                            "target": tgv.get()})
            elif t == "armatura":
                out.append({"tipo": t, "flat": num(fv), "dado_proprio": dpv.get(),
                            "mult": num(vv, 1) or 1, "locazione": lv.get()})
            else:
                out.append({"tipo": t, "flat": num(fv),
                            "dado_proprio": dpv.get(), "dado_avversario": dav.get()})
        return out


class RigheModEffetto(RigheDinamiche):
    """Modificatori passivi di un Effetto (danno/cura nel tempo O debuff puro,
    es. stordimento): rango, flat al risultato, malus al colpire, azioni perse."""

    def __init__(self, parent, get_tipi):
        super().__init__(parent, "+ modificatore")
        self.get_tipi = get_tipi

    def aggiungi(self, item=None):
        item = item or {}
        riga = ttk.Frame(self.frame, relief="groove", borderwidth=1, padding=6)
        tv = tk.StringVar(value=item.get("tipo", "mod_rango"))
        sv = tk.StringVar(value=item.get("statistica", "fisico"))
        vv = tk.StringVar(value=str(item.get("delta", item.get("valore", 0))))
        cv = tk.StringVar(value=str(item.get("flat", 0)))
        azv = tk.StringVar(value=str(item.get("azioni", 0)))
        bov = tk.StringVar(value=str(item.get("bonus", 0)))
        riv = tk.StringVar(value=str(item.get("risposte", 0)))
        dnv = tk.StringVar(value=item.get("tipo_danno", "fuoco"))

        corpo = ttk.Frame(riga)
        corpo.pack(side="left")
        linea1 = ttk.Frame(corpo)
        linea1.pack(anchor="w")
        campo(linea1, "Tipo", combo(linea1, tv, lambda: TIPI_MOD_EFFETTO, 15))
        campo(linea1, "Statistica", combo(linea1, sv, self.get_tipi, 17))
        campo(linea1, "Delta / valore", ttk.Entry(linea1, textvariable=vv, width=7))
        campo(linea1, "Tipo danno (debolezza)", combo(linea1, dnv, lambda: TIPI_DANNO, 13))

        linea2 = ttk.Frame(corpo)
        linea2.pack(anchor="w", pady=(6, 0))
        campo(linea2, "Flat colpire", ttk.Entry(linea2, textvariable=cv, width=7))
        campo(linea2, "Azioni", tk.Spinbox(linea2, from_=-9, to=9, width=4, textvariable=azv))
        campo(linea2, "Bonus", tk.Spinbox(linea2, from_=-9, to=9, width=4, textvariable=bov))
        campo(linea2, "Risposte", tk.Spinbox(linea2, from_=-9, to=9, width=4, textvariable=riv))

        self._registra(riga, (tv, sv, vv, cv, azv, bov, riv, dnv))

    def get(self):
        out = []
        for _, (tv, sv, vv, cv, azv, bov, riv, dnv) in self.righe:
            t = tv.get()
            if t == "mod_rango":
                out.append({"tipo": t, "statistica": sv.get(), "delta": num(vv)})
            elif t == "flat_risultato":
                out.append({"tipo": t, "statistica": sv.get(), "valore": num(vv)})
            elif t == "colpire":
                out.append({"tipo": t, "flat": num(cv)})
            elif t == "debolezza":
                out.append({"tipo": t, "tipo_danno": dnv.get()})
            elif t == "azioni":
                out.append({"tipo": t, "azioni": num(azv), "bonus": num(bov),
                            "risposte": num(riv)})
        return out


class CrudTab(ttk.Frame):
    """Lista a sinistra, form a destra, Nuovo/Salva/Elimina."""
    file = None
    titolo = ""

    def __init__(self, parent, **getters):
        super().__init__(parent, padding=8)
        for k, v in getters.items():
            setattr(self, k, v)
        self.items = carica(self.file)
        self.edit_id = None
        sinistra = ttk.Frame(self)
        sinistra.pack(side="left", fill="y")
        box_lista = ttk.Frame(sinistra)
        box_lista.pack(fill="both", expand=True)
        self.lista = tk.Listbox(box_lista, width=28)
        sb_lista = ttk.Scrollbar(box_lista, orient="vertical", command=self.lista.yview)
        self.lista.configure(yscrollcommand=sb_lista.set)
        self.lista.pack(side="left", fill="both", expand=True)
        sb_lista.pack(side="right", fill="y")
        self.lista.bind("<<ListboxSelect>>", self._sel)
        bf = ttk.Frame(sinistra)
        bf.pack(fill="x", pady=4)
        ttk.Button(bf, text="Nuovo", command=self.nuovo).pack(side="left")
        ttk.Button(bf, text="Duplica", command=self.duplica).pack(side="left", padx=4)
        ttk.Button(bf, text="Elimina", command=self.elimina).pack(side="left")
        # Salva sempre visibile: il form può essere più alto dello schermo
        ttk.Button(sinistra, text="💾 SALVA", command=self.salva_item).pack(fill="x", pady=2)

        # form scrollabile in verticale
        destra = ttk.Frame(self)
        destra.pack(side="left", fill="both", expand=True, padx=10)
        self.canvas = tk.Canvas(destra, highlightthickness=0)
        sb = ttk.Scrollbar(destra, orient="vertical", command=self.canvas.yview)
        self.form = ttk.Frame(self.canvas)
        self.form.bind("<Configure>",
                       lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.create_window((0, 0), window=self.form, anchor="nw")
        self.canvas.configure(yscrollcommand=sb.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        # rotella del mouse attiva solo quando il puntatore è su questa tab
        self.canvas.bind("<Enter>", lambda e: self.canvas.bind_all("<MouseWheel>", self._wheel))
        self.canvas.bind("<Leave>", lambda e: self.canvas.unbind_all("<MouseWheel>"))

        self.costruisci_form(self.form)
        ttk.Button(self.form, text="Salva", command=self.salva_item).pack(anchor="w", pady=8)
        self.refresh()

    def _wheel(self, e):
        self.canvas.yview_scroll(-e.delta // 120, "units")

    def etichette(self):
        return [f"{i['id']} - {i['nome']}" for i in self.items]

    def refresh(self):
        self.lista.delete(0, "end")
        for e in self.etichette():
            self.lista.insert("end", e)

    def _modifiche_non_salvate(self):
        """True se il form differisce dall'elemento attualmente selezionato."""
        if self.edit_id is None or not self.nome.get().strip():
            return False
        vecchio = next((x for x in self.items if x["id"] == self.edit_id), None)
        if vecchio is None:
            return False
        nuovo = self.item_da_form()
        return nuovo is not None and any(vecchio.get(k) != v for k, v in nuovo.items())

    def _sel(self, _evt=None):
        s = self.lista.curselection()
        if not s:
            return
        item = self.items[s[0]]
        if item["id"] != self.edit_id and self._modifiche_non_salvate():
            if messagebox.askyesno(self.titolo, "Hai modifiche non salvate. Salvarle?"):
                self.salva_item()
        self.edit_id = item["id"]
        self.form_da_item(item)

    def nuovo(self):
        self.edit_id = None
        self.form_da_item({})

    def duplica(self):
        """Clona l'elemento selezionato con un nuovo id, per creare varianti al volo."""
        orig = next((x for x in self.items if x["id"] == self.edit_id), None)
        if orig is None:
            messagebox.showinfo(self.titolo, "Seleziona prima un elemento da duplicare.")
            return
        copia = json.loads(json.dumps(orig))  # deep copy
        copia["id"] = prossimo_id(self.items)
        copia["nome"] = f"{orig['nome']} (copia)"
        self.items.append(copia)
        salva(self.file, self.items)
        self.refresh()
        self.edit_id = copia["id"]
        self.form_da_item(copia)
        self.lista.selection_clear(0, "end")
        self.lista.selection_set("end")

    def salva_item(self):
        item = self.item_da_form()
        if item is None:
            return
        item["id"] = self.edit_id or prossimo_id(self.items)
        if self.edit_id:
            # i campi che il form non conosce (es. "speciale") non vanno persi al salvataggio
            vecchio = next((x for x in self.items if x["id"] == self.edit_id), {})
            item = {**vecchio, **item}
            self.items = [item if x["id"] == self.edit_id else x for x in self.items]
        else:
            self.items.append(item)
        self.edit_id = item["id"]
        salva(self.file, self.items)
        self.refresh()

    def elimina(self):
        s = self.lista.curselection()
        if not s:
            return
        it = self.items[s[0]]
        if messagebox.askyesno("Elimina", f"Eliminare '{it['nome']}'?"):
            self.items.pop(s[0])
            salva(self.file, self.items)
            self.nuovo()
            self.refresh()

    def chiedi_nome(self):
        nome = self.nome.get().strip()
        if not nome:
            messagebox.showwarning(self.titolo, "Serve un nome.")
            return None
        return nome

    def costruisci_form(self, form):
        raise NotImplementedError

    def form_da_item(self, item):
        raise NotImplementedError

    def item_da_form(self):
        raise NotImplementedError


class TabAttacchi(CrudTab):
    file = FILES["attacchi"]
    titolo = "Attacchi"

    def costruisci_form(self, form):
        self.nome = tk.StringVar()
        self.attivo_default = tk.BooleanVar()
        self.ranged = tk.BooleanVar()
        self.can_aim = tk.BooleanVar(value=True)
        self.can_dodge = tk.BooleanVar(value=True)
        self.split_danni = tk.BooleanVar()
        self.tipo_danno = tk.StringVar(value="contundente")
        self.skill_colpire = tk.StringVar(value="(default)")
        self.flat = tk.StringVar(value="0")
        self.mult = tk.StringVar(value="1")
        self.sostituisce = tk.StringVar(value="(nessuna)")
        self.cooldown_turni = tk.StringVar(value="0")
        self.usi_limitati = tk.BooleanVar()
        self.usi_massimi = tk.StringVar(value="1")

        r1 = ttk.Frame(form)
        r1.pack(anchor="w")
        ttk.Label(r1, text="Nome").pack(side="left")
        ttk.Entry(r1, textvariable=self.nome, width=34).pack(side="left", padx=6)
        ttk.Checkbutton(r1, text="Attivo di default", variable=self.attivo_default).pack(side="left")
        ttk.Label(form, text="Descrizione").pack(anchor="w", pady=(6, 0))
        self.descr = tk.Text(form, width=60, height=3)
        self.descr.pack(anchor="w", pady=2)
        flags = ttk.Frame(form)
        flags.pack(anchor="w", pady=2)
        ttk.Checkbutton(flags, text="Ranged", variable=self.ranged).pack(side="left")
        ttk.Checkbutton(flags, text="Può mirare", variable=self.can_aim).pack(side="left", padx=8)
        ttk.Checkbutton(flags, text="Schivabile", variable=self.can_dodge).pack(side="left")
        ttk.Checkbutton(flags, text="Split danni (tutte le locazioni)",
                        variable=self.split_danni).pack(side="left", padx=8)
        r2 = ttk.Frame(form)
        r2.pack(anchor="w", pady=2)
        ttk.Label(r2, text="Tipo danno").pack(side="left")
        combo(r2, self.tipo_danno, lambda: TIPI_DANNO, 14).pack(side="left", padx=6)
        ttk.Label(r2, text="Skill per colpire").pack(side="left", padx=(12, 0))
        combo(r2, self.skill_colpire, lambda: ["(default)"] + self.get_tipi(), 16).pack(
            side="left", padx=6)
        ttk.Label(form, text="(default: armi_distanza se ranged, armi_corpo_a_corpo altrimenti; "
                             "molti attacchi dei poteri usano controllo)").pack(anchor="w")
        ttk.Label(form, text="Dadi danno").pack(anchor="w", pady=(6, 0))
        self.dadi = RigheDadi(form, self.get_tipi)
        self.dadi.frame.pack(anchor="w")
        r3 = ttk.Frame(form)
        r3.pack(anchor="w", pady=2)
        ttk.Label(r3, text="Danno flat").pack(side="left")
        ttk.Entry(r3, textvariable=self.flat, width=6).pack(side="left", padx=6)
        ttk.Label(r3, text="Moltiplicatore").pack(side="left")
        ttk.Entry(r3, textvariable=self.mult, width=6).pack(side="left", padx=6)
        r4 = ttk.Frame(form)
        r4.pack(anchor="w", pady=2)
        ttk.Label(r4, text="Sostituisce azione").pack(side="left")
        combo(r4, self.sostituisce, lambda: ["(nessuna)"] + self.etichette(), 28).pack(
            side="left", padx=6)
        r5 = ttk.Frame(form)
        r5.pack(anchor="w", pady=4)
        ttk.Label(r5, text="Cooldown (turni prima di poterla riusare)").pack(side="left")
        tk.Spinbox(r5, from_=0, to=99, width=4, textvariable=self.cooldown_turni).pack(
            side="left", padx=(6, 16))
        self.chk_usi = ttk.Checkbutton(r5, text="Numero massimo di utilizzi",
                                       variable=self.usi_limitati, command=self.toggle_usi)
        self.chk_usi.pack(side="left")
        self.spin_usi = tk.Spinbox(r5, from_=1, to=99, width=4, textvariable=self.usi_massimi)
        self.spin_usi.pack(side="left", padx=6)
        self.toggle_usi()
        lf = ttk.LabelFrame(form, text="Effetti applicati al bersaglio (se a segno)", padding=4)
        lf.pack(anchor="w", fill="x", pady=6)
        self.eff_applicati = RigheEffettiApplicati(lf, self.get_effetti)
        self.eff_applicati.frame.pack(anchor="w")

    def form_da_item(self, a):
        self.nome.set(a.get("nome", ""))
        self.attivo_default.set(a.get("attivo_default", False))
        self.descr.delete("1.0", "end")
        self.descr.insert("1.0", a.get("descrizione", ""))
        self.ranged.set(a.get("ranged", False))
        self.can_aim.set(a.get("can_aim", True))
        self.can_dodge.set(a.get("can_dodge", True))
        self.split_danni.set(a.get("split_danni", False))
        self.tipo_danno.set(a.get("tipo_danno", "contundente"))
        self.skill_colpire.set(a.get("skill_colpire") or "(default)")
        danno = a.get("danno", {})
        self.dadi.set(danno.get("dadi", []))
        self.flat.set(str(danno.get("flat", 0)))
        self.mult.set(str(danno.get("mult", 1)))
        sost = a.get("sostituisce")
        self.sostituisce.set(next((e for e in self.etichette()
                                   if e.startswith(f"{sost} - ")), "(nessuna)"))
        self.cooldown_turni.set(str(a.get("cooldown_turni", 0)))
        self.usi_limitati.set(a.get("usi_limitati", False))
        self.usi_massimi.set(str(a.get("usi_massimi", 1)))
        self.toggle_usi()
        self.eff_applicati.set(a.get("effetti_applicati", []))

    def toggle_usi(self):
        self.spin_usi.configure(state="normal" if self.usi_limitati.get() else "disabled")

    def item_da_form(self):
        nome = self.chiedi_nome()
        if not nome:
            return None
        sost = self.sostituisce.get()
        return {
            "nome": nome,
            "descrizione": self.descr.get("1.0", "end").strip(),
            "ranged": self.ranged.get(),
            "can_aim": self.can_aim.get(),
            "can_dodge": self.can_dodge.get(),
            "attivo_default": self.attivo_default.get(),
            "split_danni": self.split_danni.get(),
            "tipo_danno": self.tipo_danno.get(),
            "skill_colpire": (self.skill_colpire.get()
                              if self.skill_colpire.get() != "(default)" else None),
            "danno": {"dadi": self.dadi.get(), "flat": num(self.flat),
                      "mult": num(self.mult, 1)},
            "sostituisce": id_da_etichetta(sost) if sost != "(nessuna)" else None,
            "cooldown_turni": num(self.cooldown_turni),
            "usi_limitati": self.usi_limitati.get(),
            "usi_massimi": num(self.usi_massimi, 1),
            "effetti_applicati": self.eff_applicati.get(),
        }


class TabPoteri(CrudTab):
    file = FILES["poteri"]
    titolo = "Poteri"

    def costruisci_form(self, form):
        self.nome = tk.StringVar()
        self.rango = tk.StringVar(value="1")

        r1 = ttk.Frame(form)
        r1.pack(anchor="w")
        ttk.Label(r1, text="Nome").pack(side="left")
        ttk.Entry(r1, textvariable=self.nome, width=34).pack(side="left", padx=6)
        ttk.Label(r1, text="Rango massimo").pack(side="left")
        tk.Spinbox(r1, from_=1, to=4, width=3, textvariable=self.rango).pack(side="left", padx=4)
        ttk.Label(form, text="Descrizione").pack(anchor="w", pady=(6, 0))
        self.descr = tk.Text(form, width=60, height=3)
        self.descr.pack(anchor="w", pady=2)
        ttk.Label(form, text="Ogni rango può ridefinire gli effetti istantanei/nel tempo "
                             "(non cumulativi: un rango vuoto eredita quello sotto, es. "
                             "armatura x10 al rango 1 resta valida finché il rango 4 non la "
                             "sovrascrive con x100). Attacchi e stance sbloccati invece si "
                             "accumulano rango dopo rango.").pack(anchor="w", pady=(0, 4))

        nb = ttk.Notebook(form)
        nb.pack(anchor="w", fill="both", pady=4)
        self.effetti, self.eff_tempo = {}, {}
        self.sel_attacchi, self.sel_stance, self.sel_stance_auto = {}, {}, {}
        for rg in (1, 2, 3, 4):
            tab = ttk.Frame(nb, padding=6)
            nb.add(tab, text=f"Rango {rg}")

            lf1 = ttk.LabelFrame(tab, text="Effetti istantanei (sovrascrivono i ranghi sotto)",
                                 padding=4)
            lf1.pack(anchor="w", fill="x", pady=4)
            self.effetti[rg] = RigheEffettiPotere(lf1, self.get_tipi)
            self.effetti[rg].frame.pack(anchor="w")

            lf2 = ttk.LabelFrame(tab, text="Effetti nel tempo su se stesso (sovrascrivono)",
                                 padding=4)
            lf2.pack(anchor="w", fill="x", pady=4)
            self.eff_tempo[rg] = RigheEffettiApplicati(lf2, self.get_effetti)
            self.eff_tempo[rg].frame.pack(anchor="w")

            sblocchi = ttk.Frame(tab)
            sblocchi.pack(anchor="w", pady=4)
            lf3 = ttk.LabelFrame(sblocchi, text="Attacchi sbloccati (cumulativi)", padding=4)
            lf3.grid(row=0, column=0, sticky="nw", padx=4)
            self.sel_attacchi[rg] = SelettoreRighe(lf3, self.get_attacchi)
            self.sel_attacchi[rg].frame.pack(anchor="w")
            lf4 = ttk.LabelFrame(sblocchi, text="Stance sbloccate (cumulative)", padding=4)
            lf4.grid(row=0, column=1, sticky="nw", padx=4)
            self.sel_stance[rg] = SelettoreRighe(lf4, self.get_stances)
            self.sel_stance[rg].frame.pack(anchor="w")
            lf5 = ttk.LabelFrame(sblocchi, text="Stance attivate subito (il rango sovrascrive)",
                                 padding=4)
            lf5.grid(row=0, column=2, sticky="nw", padx=4)
            self.sel_stance_auto[rg] = SelettoreRighe(lf5, self.get_stances)
            self.sel_stance_auto[rg].frame.pack(anchor="w")

    def refresh_selettori(self):
        """Aggiorna i menu di attacchi/stance già a video (es. tornando su questa tab
        dopo aver creato una nuova mossa in Attacchi)."""
        for sel in list(self.sel_attacchi.values()) + list(self.sel_stance.values()) \
                + list(self.sel_stance_auto.values()):
            sel.refresh_valori()

    def form_da_item(self, p):
        self.nome.set(p.get("nome", ""))
        self.rango.set(str(p.get("rango", 1)))
        self.descr.delete("1.0", "end")
        self.descr.insert("1.0", p.get("descrizione", ""))
        for rg in (1, 2, 3, 4):
            self.effetti[rg].set(p.get("effetti", {}).get(str(rg), []))
            self.eff_tempo[rg].set(p.get("effetti_nel_tempo", {}).get(str(rg), []))
            self.sel_attacchi[rg].set_ids(p.get("attacchi", {}).get(str(rg), []))
            self.sel_stance[rg].set_ids(p.get("stance", {}).get(str(rg), []))
            self.sel_stance_auto[rg].set_ids(p.get("stance_attivate", {}).get(str(rg), []))

    def item_da_form(self):
        nome = self.chiedi_nome()
        if not nome:
            return None
        return {
            "nome": nome,
            "descrizione": self.descr.get("1.0", "end").strip(),
            "rango": num(self.rango, 1),
            "effetti": {str(rg): e.get() for rg, e in self.effetti.items()},
            "effetti_nel_tempo": {str(rg): e.get() for rg, e in self.eff_tempo.items()},
            "attacchi": {str(rg): s.get() for rg, s in self.sel_attacchi.items()},
            "stance": {str(rg): s.get() for rg, s in self.sel_stance.items()},
            "stance_attivate": {str(rg): s.get() for rg, s in self.sel_stance_auto.items()},
        }


class TabSkill(CrudTab):
    file = FILES["skill"]
    titolo = "Skill"

    def costruisci_form(self, form):
        self.nome = tk.StringVar()
        self.fallback = tk.StringVar(value="fisico")
        r1 = ttk.Frame(form)
        r1.pack(anchor="w")
        ttk.Label(r1, text="Nome").pack(side="left")
        ttk.Entry(r1, textvariable=self.nome, width=30).pack(side="left", padx=6)
        r2 = ttk.Frame(form)
        r2.pack(anchor="w", pady=6)
        ttk.Label(r2, text="Statistica di fallback (se il personaggio non ha la skill)").pack(side="left")
        combo(r2, self.fallback, lambda: STATS, 12).pack(side="left", padx=6)

    def form_da_item(self, s):
        self.nome.set(s.get("nome", ""))
        self.fallback.set(s.get("fallback", "fisico"))

    def item_da_form(self):
        nome = self.chiedi_nome()
        if not nome:
            return None
        return {"nome": nome.lower().replace(" ", "_"), "fallback": self.fallback.get()}


class TabStance(CrudTab):
    file = FILES["stance"]
    titolo = "Stance"

    def costruisci_form(self, form):
        self.nome = tk.StringVar()
        self.attivo_default = tk.BooleanVar()
        self.durata_tipo = tk.StringVar(value="contrapposta")
        self.durata_turni = tk.StringVar(value="2")
        self.trigger = tk.StringVar(value="attivo")
        self.cooldown_turni = tk.StringVar(value="0")
        self.usi_limitati = tk.BooleanVar()
        self.usi_massimi = tk.StringVar(value="1")
        self.ha_mod = tk.BooleanVar()
        self.ha_self = tk.BooleanVar()
        self.ha_avv = tk.BooleanVar()

        r1 = ttk.Frame(form)
        r1.pack(anchor="w")
        ttk.Label(r1, text="Nome").pack(side="left")
        ttk.Entry(r1, textvariable=self.nome, width=34).pack(side="left", padx=6)
        ttk.Checkbutton(r1, text="Attiva di default", variable=self.attivo_default).pack(side="left")
        ttk.Button(r1, text="?", width=2, command=self.mostra_aiuto).pack(side="left", padx=8)
        ttk.Label(form, text="Descrizione").pack(anchor="w", pady=(6, 0))
        self.descr = tk.Text(form, width=60, height=3)
        self.descr.pack(anchor="w", pady=2)
        r2 = ttk.Frame(form)
        r2.pack(anchor="w", pady=4)
        ttk.Label(r2, text="Durata").pack(side="left")
        combo(r2, self.durata_tipo, lambda: ["contrapposta", "fissa"], 14).pack(side="left", padx=6)
        ttk.Label(r2, text="turni (se fissa)").pack(side="left")
        tk.Spinbox(r2, from_=1, to=99, width=3, textvariable=self.durata_turni).pack(side="left", padx=4)
        ttk.Label(r2, text="   Quando").pack(side="left", padx=(10, 0))
        combo(r2, self.trigger, lambda: TRIGGER_STANCE, 16).pack(side="left", padx=6)

        r2b = ttk.Frame(form)
        r2b.pack(anchor="w", pady=4)
        ttk.Label(r2b, text="Cooldown (turni prima di poterla riusare)").pack(side="left")
        tk.Spinbox(r2b, from_=0, to=99, width=4, textvariable=self.cooldown_turni).pack(
            side="left", padx=(6, 16))
        self.chk_usi = ttk.Checkbutton(r2b, text="Numero massimo di utilizzi",
                                       variable=self.usi_limitati, command=self.toggle_usi)
        self.chk_usi.pack(side="left")
        self.spin_usi = tk.Spinbox(r2b, from_=1, to=99, width=4, textvariable=self.usi_massimi)
        self.spin_usi.pack(side="left", padx=6)
        self.toggle_usi()

        ttk.Label(form, text="Allora (attiva solo le sezioni che ti servono):").pack(
            anchor="w", pady=(6, 0))
        self.chk_mod = ttk.Checkbutton(form, text="Modificatori passivi", variable=self.ha_mod,
                                       command=self.toggle_sezioni)
        self.chk_mod.pack(anchor="w")
        self.frm_mod = ttk.LabelFrame(form, text="Modificatori passivi", padding=4)
        self.modificatori = RigheModificatori(self.frm_mod, self.get_tipi)
        self.modificatori.frame.pack(anchor="w")

        self.chk_self = ttk.Checkbutton(form, text="Effetti nel tempo (su se stesso)",
                                        variable=self.ha_self, command=self.toggle_sezioni)
        self.chk_self.pack(anchor="w")
        self.frm_self = ttk.LabelFrame(form, text="Effetti nel tempo (su se stesso)", padding=4)
        self.eff_self = RigheEffettiApplicati(self.frm_self, self.get_effetti)
        self.eff_self.frame.pack(anchor="w")

        self.chk_avv = ttk.Checkbutton(form, text="Effetti nel tempo (sull'avversario)",
                                       variable=self.ha_avv, command=self.toggle_sezioni)
        self.chk_avv.pack(anchor="w")
        self.frm_avv = ttk.LabelFrame(form, text="Effetti nel tempo (sull'avversario)", padding=4)
        self.eff_avv = RigheEffettiApplicati(self.frm_avv, self.get_effetti)
        self.eff_avv.frame.pack(anchor="w")

    def toggle_usi(self):
        self.spin_usi.configure(state="normal" if self.usi_limitati.get() else "disabled")

    def toggle_sezioni(self):
        for var, chk, frm in [(self.ha_mod, self.chk_mod, self.frm_mod),
                              (self.ha_self, self.chk_self, self.frm_self),
                              (self.ha_avv, self.chk_avv, self.frm_avv)]:
            if var.get():
                frm.pack(anchor="w", fill="x", pady=(0, 4), after=chk)
            else:
                frm.pack_forget()

    def mostra_aiuto(self):
        win = tk.Toplevel(self.winfo_toplevel())
        win.title("Aiuto — Stance")
        txt = tk.Text(win, width=82, height=34, wrap="word")
        txt.pack(side="left", fill="both", expand=True)
        sc = ttk.Scrollbar(win, command=txt.yview)
        sc.pack(side="right", fill="y")
        txt["yscrollcommand"] = sc.set
        txt.insert("1.0", AIUTO_STANCE)
        txt["state"] = "disabled"

    def form_da_item(self, s):
        self.nome.set(s.get("nome", ""))
        self.attivo_default.set(s.get("attivo_default", False))
        self.descr.delete("1.0", "end")
        self.descr.insert("1.0", s.get("descrizione", ""))
        dur = s.get("durata", {})
        self.durata_tipo.set(dur.get("tipo", "contrapposta"))
        self.durata_turni.set(str(dur.get("turni", 2)))
        self.trigger.set(s.get("trigger", "attivo"))
        self.cooldown_turni.set(str(s.get("cooldown_turni", 0)))
        self.usi_limitati.set(s.get("usi_limitati", False))
        self.usi_massimi.set(str(s.get("usi_massimi", 1)))
        self.toggle_usi()
        mod = s.get("modificatori", [])
        eff_self = s.get("effetti_applicati", [])
        eff_avv = s.get("effetti_avversario", [])
        self.ha_mod.set(bool(mod))
        self.ha_self.set(bool(eff_self))
        self.ha_avv.set(bool(eff_avv))
        self.modificatori.set(mod)
        self.eff_self.set(eff_self)
        self.eff_avv.set(eff_avv)
        self.toggle_sezioni()

    def item_da_form(self):
        nome = self.chiedi_nome()
        if not nome:
            return None
        durata = {"tipo": self.durata_tipo.get()}
        if durata["tipo"] == "fissa":
            durata["turni"] = num(self.durata_turni, 1)
        return {
            "nome": nome,
            "descrizione": self.descr.get("1.0", "end").strip(),
            "attivo_default": self.attivo_default.get(),
            "durata": durata,
            "trigger": self.trigger.get(),
            "cooldown_turni": num(self.cooldown_turni),
            "usi_limitati": self.usi_limitati.get(),
            "usi_massimi": num(self.usi_massimi, 1),
            "modificatori": self.modificatori.get() if self.ha_mod.get() else [],
            "effetti_applicati": self.eff_self.get() if self.ha_self.get() else [],
            "effetti_avversario": self.eff_avv.get() if self.ha_avv.get() else [],
        }


class TabEffetti(CrudTab):
    file = FILES["effetti"]
    titolo = "Effetti"

    def costruisci_form(self, form):
        self.nome = tk.StringVar()
        self.tipo = tk.StringVar(value="danno")
        self.tipo_danno = tk.StringVar(value="fuoco")
        self.split = tk.BooleanVar()
        self.flat = tk.StringVar(value="0")
        self.mult = tk.StringVar(value="1")

        r1 = ttk.Frame(form)
        r1.pack(anchor="w")
        ttk.Label(r1, text="Nome").pack(side="left")
        ttk.Entry(r1, textvariable=self.nome, width=34).pack(side="left", padx=6)
        ttk.Label(form, text="Descrizione").pack(anchor="w", pady=(6, 0))
        self.descr = tk.Text(form, width=60, height=3)
        self.descr.pack(anchor="w", pady=2)
        r2 = ttk.Frame(form)
        r2.pack(anchor="w", pady=4)
        ttk.Label(r2, text="Tipo").pack(side="left")
        combo(r2, self.tipo, lambda: ["danno", "cura", "modificatore", "cancella_stance"],
              14).pack(side="left", padx=6)
        ttk.Label(r2, text="Tipo danno").pack(side="left")
        combo(r2, self.tipo_danno, lambda: TIPI_DANNO, 14).pack(side="left", padx=6)
        ttk.Checkbutton(r2, text="Split danni (tutte le locazioni, altrimenti quella colpita)",
                        variable=self.split).pack(side="left", padx=8)
        ttk.Label(form, text="Ammontare per turno (dadi + flat, x molt.) — solo se Tipo è "
                             "danno/cura. Con Tipo cancella_stance, dadi/flat/mult/modificatori "
                             "non contano: disattiva subito la stance manuale attiva del "
                             "bersaglio e ne fa partire il cooldown.").pack(anchor="w", pady=(6, 0))
        self.dadi = RigheDadi(form, self.get_tipi)
        self.dadi.frame.pack(anchor="w")
        r3 = ttk.Frame(form)
        r3.pack(anchor="w", pady=2)
        ttk.Label(r3, text="Flat").pack(side="left")
        ttk.Entry(r3, textvariable=self.flat, width=6).pack(side="left", padx=6)
        ttk.Label(r3, text="Moltiplicatore").pack(side="left")
        ttk.Entry(r3, textvariable=self.mult, width=6).pack(side="left", padx=6)

        lf = ttk.LabelFrame(form, text="Modificatori passivi (attivi finché dura l'effetto)",
                            padding=8)
        lf.pack(anchor="w", fill="x", pady=8)
        guida = ("mod_rango — ranghi +/- su una statistica/skill (mai sotto rango 1: oltre, "
                 "flat -2 fisso al risultato)\n"
                 "flat_risultato — +/- fisso al risultato di una statistica/skill, senza "
                 "toccare il rango\n"
                 "colpire — +/- fisso a tutti i tiri per colpire di chi subisce l'effetto\n"
                 "azioni — +/- azioni/bonus/risposte per questo turno (negativo per un debuff)")
        ttk.Label(lf, text=guida, foreground="#888", justify="left").pack(anchor="w", pady=(0, 8))
        self.modificatori = RigheModEffetto(lf, self.get_tipi)
        self.modificatori.frame.pack(anchor="w")

    def form_da_item(self, e):
        self.nome.set(e.get("nome", ""))
        self.descr.delete("1.0", "end")
        self.descr.insert("1.0", e.get("descrizione", ""))
        self.tipo.set(e.get("tipo", "danno"))
        self.tipo_danno.set(e.get("tipo_danno") or "fuoco")
        self.split.set(e.get("split", False))
        f = e.get("formula", {})
        self.dadi.set(f.get("dadi", []))
        self.flat.set(str(f.get("flat", 0)))
        self.mult.set(str(f.get("mult", 1)))
        self.modificatori.set(e.get("modificatori", []))

    def item_da_form(self):
        nome = self.chiedi_nome()
        if not nome:
            return None
        return {
            "nome": nome,
            "descrizione": self.descr.get("1.0", "end").strip(),
            "tipo": self.tipo.get(),
            "tipo_danno": self.tipo_danno.get() if self.tipo.get() == "danno" else "",
            "split": self.split.get(),
            "formula": {"dadi": self.dadi.get(), "flat": num(self.flat),
                        "mult": num(self.mult, 1)},
            "modificatori": self.modificatori.get(),
        }


class TabEquip(CrudTab):
    file = FILES["equip"]
    titolo = "Equipaggiamento"

    def costruisci_form(self, form):
        self.nome = tk.StringVar()
        self.valore = tk.StringVar(value="50")

        r1 = ttk.Frame(form)
        r1.pack(anchor="w")
        ttk.Label(r1, text="Nome").pack(side="left")
        ttk.Entry(r1, textvariable=self.nome, width=34).pack(side="left", padx=6)
        ttk.Label(r1, text="Valore (crediti)").pack(side="left")
        ttk.Entry(r1, textvariable=self.valore, width=8).pack(side="left", padx=6)
        ttk.Label(form, text="Descrizione").pack(anchor="w", pady=(6, 0))
        self.descr = tk.Text(form, width=60, height=3)
        self.descr.pack(anchor="w", pady=2)
        lf = ttk.LabelFrame(form, text="Attacchi sbloccati dall'arma", padding=4)
        lf.pack(anchor="w", fill="x", pady=6)
        self.sel_attacchi = SelettoreRighe(lf, self.get_attacchi)
        self.sel_attacchi.frame.pack(anchor="w")

    def form_da_item(self, e):
        self.nome.set(e.get("nome", ""))
        self.valore.set(str(e.get("valore", 50)))
        self.descr.delete("1.0", "end")
        self.descr.insert("1.0", e.get("descrizione", ""))
        self.sel_attacchi.set_ids(e.get("attacchi", []))

    def item_da_form(self):
        nome = self.chiedi_nome()
        if not nome:
            return None
        return {
            "nome": nome,
            "descrizione": self.descr.get("1.0", "end").strip(),
            "valore": num(self.valore, 50),
            "attacchi": self.sel_attacchi.get(),
        }


def main():
    root = tk.Tk()
    root.title("Urban RPG — Editor")
    # ogni campo Entry/Spinbox seleziona il proprio testo quando riceve il focus:
    # senza questo, digitare su un valore esistente lo concatena invece di sostituirlo
    # (es. "0" + digiti "-1" -> "0-1", che va perso al salvataggio)
    root.bind_class("TEntry", "<FocusIn>", lambda e: e.widget.selection_range(0, "end"))
    root.bind_class("Spinbox", "<FocusIn>", lambda e: e.widget.selection_range(0, "end"))
    nb = ttk.Notebook(root)
    tskill = TabSkill(nb)
    get_tipi = lambda: STATS + [s["nome"] for s in tskill.items]
    teff = TabEffetti(nb, get_tipi=get_tipi)
    get_effetti = lambda: teff.etichette()
    tatt = TabAttacchi(nb, get_tipi=get_tipi, get_effetti=get_effetti)
    tstance = TabStance(nb, get_tipi=get_tipi, get_effetti=get_effetti)
    tpot = TabPoteri(nb, get_tipi=get_tipi, get_effetti=get_effetti,
                     get_attacchi=lambda: tatt.etichette(),
                     get_stances=lambda: tstance.etichette())
    tequip = TabEquip(nb, get_attacchi=lambda: tatt.etichette())
    nb.add(tatt, text="Attacchi")
    nb.add(tpot, text="Poteri")
    nb.add(tequip, text="Equipaggiamento")
    nb.add(tskill, text="Skill")
    nb.add(tstance, text="Stance")
    nb.add(teff, text="Effetti")
    nb.bind("<<NotebookTabChanged>>", lambda e: tpot.refresh_selettori())
    nb.pack(fill="both", expand=True)
    root.mainloop()


if __name__ == "__main__":
    main()
