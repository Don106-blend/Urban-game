"""Check dell'avvio automatico (avvia.py): aggiornamento da GitHub senza toccare i progressi. python test_avvia.py (nessuna rete)"""
import io
import os
import shutil
import tempfile
import zipfile

import avvia as V

n = 0


def ok(c, m=""):
    global n
    n += 1
    assert c, m


def fai_zip(files):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for k, v in files.items():
            z.writestr("Urban-game-main/" + k, v)
        z.writestr("Urban-game-main/", "")
    return b.getvalue()


def main():
    tmp = tempfile.mkdtemp(prefix="urban_test_avvia_")
    try:
        os.makedirs(os.path.join(tmp, "save"))
        open(os.path.join(tmp, "save", "state.json"), "w").write("IL MIO SALVATAGGIO")
        open(os.path.join(tmp, "app.py"), "w").write("vecchio")
        z = fai_zip({"app.py": "nuovo", "data/a.json": "{}", "save/state.json": "DELL'AUTORE", ".versione": "x", "static/s/x.png": "png",
                     "../fuori.txt": "no", "a/../../fuori2.txt": "no"})
        scritti = V.applica_zip(z, tmp)
        ok(open(os.path.join(tmp, "app.py")).read() == "nuovo" and os.path.exists(os.path.join(tmp, "data", "a.json")))
        ok(open(os.path.join(tmp, "save", "state.json")).read() == "IL MIO SALVATAGGIO", "i progressi non si toccano")
        ok(not os.path.exists(os.path.join(tmp, ".versione")) and not os.path.exists(os.path.join(os.path.dirname(tmp), "fuori.txt")))
        ok(not os.path.exists(os.path.join(os.path.dirname(tmp), "fuori2.txt")) and scritti == 3, scritti)

        # il flusso di aggiorna() senza rete e senza git
        V.BASE, V.FILE_VERSIONE = tmp, os.path.join(tmp, ".versione")
        V.aggiorna_con_git = lambda: None
        V.sha_remoto = lambda: None
        ok(V.aggiorna() is False and V.sha_locale() is None, "senza rete si parte lo stesso")
        V.sha_remoto = lambda: "a" * 40
        ok(V.aggiorna() is False and V.sha_locale() == "a" * 40, "primo avvio: registra la versione")
        ok(V.aggiorna() is False, "stessa versione: niente")
        V.sha_remoto = lambda: "b" * 40
        V._get = lambda *a, **k: fai_zip({"app.py": "v2"})
        ok(V.aggiorna() is True and open(os.path.join(tmp, "app.py")).read() == "v2" and V.sha_locale() == "b" * 40, "versione nuova")
        ok(open(os.path.join(tmp, "save", "state.json")).read() == "IL MIO SALVATAGGIO")
        V._get = lambda *a, **k: (_ for _ in ()).throw(OSError("giu"))
        V.sha_remoto = lambda: "c" * 40
        ok(V.aggiorna() is False and V.sha_locale() == "b" * 40, "un download fallito non rompe niente")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"OK: {n} verifiche")


if __name__ == "__main__":
    main()
