"""Check dell'editor senza aprire la finestra: python test_editor.py

Costruisce tutte le tab, carica ogni voce di data/*.json nel form e la rilegge con
item_da_form(): salvando una voce NON toccata non deve cambiare nulla (nessun campo perso o
riscritto). Serve display (Tkinter): senza, il test si salta.
"""
import json
import os
import shutil
import tempfile
import tkinter as tk
from tkinter import ttk

import editor


def norm(v):
    """Forma canonica per il confronto: via le chiavi vuote/False/0 (equivalgono a 'assente'),
    perche' il form riscrive i default espliciti (es. persistente: false) senza cambiare il senso."""
    if isinstance(v, dict):
        return {k: norm(x) for k, x in v.items() if x not in (None, False, 0, "", [], {})}
    if isinstance(v, list):
        return [norm(x) for x in v]
    return v


def main():
    try:
        root = tk.Tk()
    except tk.TclError as e:
        print("SKIP — nessun display per Tkinter:", e)
        return
    root.withdraw()

    # lavora su una COPIA dei dati: un test non deve mai riscrivere data/*.json
    tmp = tempfile.mkdtemp(prefix="urban_editor_")
    try:
        shutil.copytree(editor.DATA, os.path.join(tmp, "data"))
        editor.DATA = os.path.join(tmp, "data")
        editor.FILES = {k: os.path.join(editor.DATA, os.path.basename(v))
                        for k, v in editor.FILES.items()}
        for cls in (editor.TabAttacchi, editor.TabPoteri, editor.TabSkill, editor.TabStance,
                    editor.TabEffetti, editor.TabEquip, editor.TabArmatura, editor.TabProtesi,
                    editor.TabAugment):
            nome = cls.file and os.path.basename(cls.file)
            cls.file = os.path.join(editor.DATA, nome)

        nb = ttk.Notebook(root)
        tskill = editor.TabSkill(nb)
        get_tipi = lambda: editor.STATS + [s["nome"] for s in tskill.items]
        teff = editor.TabEffetti(nb, get_tipi=get_tipi)
        get_effetti = lambda: teff.etichette()
        tatt = editor.TabAttacchi(nb, get_tipi=get_tipi, get_effetti=get_effetti)
        tstance = editor.TabStance(nb, get_tipi=get_tipi, get_effetti=get_effetti)
        tpot = editor.TabPoteri(nb, get_tipi=get_tipi, get_effetti=get_effetti,
                                get_attacchi=lambda: tatt.etichette(),
                                get_stances=lambda: tstance.etichette())
        tequip = editor.TabEquip(nb, get_attacchi=lambda: tatt.etichette())
        tarm = editor.TabArmatura(nb, get_stances=lambda: tstance.etichette(),
                                  get_effetti=get_effetti)
        tprot = editor.TabProtesi(nb, get_attacchi=lambda: tatt.etichette(),
                                  get_stances=lambda: tstance.etichette(),
                                  get_effetti=get_effetti)
        taug = editor.TabAugment(nb, get_tipi=get_tipi, get_effetti=get_effetti,
                                 get_attacchi=lambda: tatt.etichette(),
                                 get_stances=lambda: tstance.etichette())

        tot = 0
        for tab in (tatt, tpot, tskill, tstance, teff, tequip, tarm, tprot, taug):
            for item in tab.items:
                tab.edit_id = item["id"]
                tab.form_da_item(item)
                letto = tab.item_da_form()
                assert letto is not None, (tab.titolo, item["nome"])
                # come salva_item(): i campi che il form non conosce restano quelli vecchi
                fuso = {**item, **letto}
                # una chiave assente nell'originale che il form aggiunge col suo default non
                # e' una perdita; una chiave PRESENTE che cambia valore si
                diff = {k: (item[k], fuso.get(k)) for k in item if norm(item[k]) != norm(fuso.get(k))}
                assert not diff, (tab.titolo, item["nome"], diff)
                tot += 1

        # il danno con dadi/mult scritti a mano sopravvive al salvataggio dal form
        att = next(a for a in tatt.items if a["nome"] == "Pugno")
        tatt.edit_id = att["id"]
        att["danno"] = {"dadi": [{"n": 2, "tipo": "fisico"}], "flat": 10, "mult": 3}
        tatt.form_da_item(att)
        assert tatt.item_da_form()["danno"] == att["danno"], tatt.item_da_form()["danno"]

        # costo_azioni e parabile arrivano al JSON
        pesante = next(a for a in tatt.items if a.get("costo_azioni", 1) == 2)
        tatt.edit_id = pesante["id"]
        tatt.form_da_item(pesante)
        letto = tatt.item_da_form()
        assert letto["costo_azioni"] == 2 and letto["parabile"] == pesante.get("parabile", True)

        # la guida alle fasce avvisa quando si esce (split sopra 270, ultimate senza cooldown)
        tatt.form_da_item({"nome": "x", "split_danni": True, "danno": {"flat": 300},
                           "cooldown_turni": 0})
        tatt.aggiorna_fascia()
        assert "270" in tatt.avviso_fascia.get()
        tatt.slot_guida.set("r4 / ultimate")
        tatt.aggiorna_fascia()
        assert "cooldown" in tatt.avviso_fascia.get()
        print(f"OK — editor: {tot} voci rilette senza perdite")
    finally:
        root.destroy()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
