"""Avvio di Urban: controlla se su GitHub c'e' una versione nuova (e la scarica), si assicura che Flask ci sia, poi parte il gioco.

    python avvia.py            (o avvia_app.bat su Windows, che prima controlla anche Python)

Gli aggiornamenti non toccano mai `save/` (i progressi di chi gioca) ne' `.versione`. Se la cartella e' un clone git si usa `git pull`;
altrimenti (zip scaricato da GitHub) si scarica lo zip del ramo e si copiano i file sopra a quelli vecchi.
Senza rete, o se GitHub non risponde, il gioco parte comunque con la versione che c'e'. Solo libreria standard."""
import io
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import webbrowser
import zipfile

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = "Don106-blend/Urban-game"
RAMO = "main"
FILE_VERSIONE = os.path.join(BASE, ".versione")
TIMEOUT = 6
NON_TOCCARE = {"save", ".git", ".versione", "__pycache__", ".claude"}      # primo livello dello zip che l'aggiornamento non sovrascrive


def _get(url, accept=None, timeout=TIMEOUT):
    req = urllib.request.Request(url, headers={"User-Agent": "urban-avvia", **({"Accept": accept} if accept else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def sha_remoto():
    """L'ultimo commit del ramo su GitHub (testo di 40 caratteri), o None se non raggiungibile."""
    try:
        s = _get(f"https://api.github.com/repos/{REPO}/commits/{RAMO}", accept="application/vnd.github.sha").decode().strip()
        return s if len(s) == 40 else None
    except Exception:
        return None


def sha_locale():
    try:
        with open(FILE_VERSIONE, encoding="utf-8") as f:
            return f.read().strip() or None
    except OSError:
        return None


def scrivi_versione(sha):
    with open(FILE_VERSIONE, "w", encoding="utf-8") as f:
        f.write(sha)


def applica_zip(dati, dest=None):
    """Copia i file di uno zip di GitHub (un'unica cartella radice) in `dest`, tranne NON_TOCCARE. Ritorna quanti file ha scritto."""
    dest = dest or BASE          # (letto qui, non nel default: BASE cambia nei test)
    n = 0
    with zipfile.ZipFile(io.BytesIO(dati)) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            parti = info.filename.split("/", 1)
            if len(parti) < 2 or not parti[1]:
                continue
            rel = parti[1]
            if rel.split("/", 1)[0] in NON_TOCCARE or ".." in rel.split("/"):
                continue
            percorso = os.path.join(dest, *rel.split("/"))
            os.makedirs(os.path.dirname(percorso), exist_ok=True)
            with z.open(info) as src, open(percorso, "wb") as out:
                shutil.copyfileobj(src, out)
            n += 1
    return n


def _git(*args):
    return subprocess.run(["git", *args], cwd=BASE, capture_output=True, text=True, timeout=60)


def aggiorna_con_git():
    """Clone git: fetch e pull senza merge. Ritorna (aggiornato, messaggio) o None se non e' un clone usabile."""
    if not os.path.isdir(os.path.join(BASE, ".git")) or shutil.which("git") is None:
        return None
    try:
        if _git("fetch", "--quiet", "origin", RAMO).returncode != 0:
            return (False, "GitHub non raggiungibile: si gioca con la versione che c'è.")
        if _git("rev-parse", "HEAD").stdout.strip() == _git("rev-parse", "FETCH_HEAD").stdout.strip():
            return (False, "Il gioco è aggiornato.")
        r = _git("pull", "--ff-only", "--quiet", "origin", RAMO)
        if r.returncode != 0:
            return (False, "C'è un aggiornamento ma ci sono modifiche locali che lo bloccano: aggiorna a mano con git.")
        return (True, "Aggiornato all'ultima versione.")
    except Exception:
        return (False, "Aggiornamento saltato (git non risponde).")


def aggiorna():
    """Controlla GitHub e aggiorna se serve. Non solleva mai: al peggio il gioco parte com'e'."""
    try:
        via_git = aggiorna_con_git()
        if via_git is not None:
            print(via_git[1])
            return via_git[0]
        remoto = sha_remoto()
        if remoto is None:
            print("GitHub non raggiungibile: si gioca con la versione che c'è.")
            return False
        locale = sha_locale()
        if locale is None:          # primo avvio di una copia scaricata: e' quella piu' recente al momento del download
            scrivi_versione(remoto)
            print("Versione registrata.")
            return False
        if locale == remoto:
            print("Il gioco è aggiornato.")
            return False
        print("Nuova versione trovata: la scarico...")
        dati = _get(f"https://codeload.github.com/{REPO}/zip/refs/heads/{RAMO}", timeout=120)
        n = applica_zip(dati)
        scrivi_versione(remoto)
        print(f"Aggiornato ({n} file). I tuoi progressi non sono stati toccati.")
        return True
    except Exception as e:
        print(f"Aggiornamento saltato ({e.__class__.__name__}).")
        return False


def assicura_flask():
    """Flask e' l'unica dipendenza: se manca lo installa (per l'utente, senza permessi di amministratore)."""
    try:
        import flask  # noqa: F401
        return True
    except ImportError:
        pass
    print("Flask non c'è: lo installo (serve internet, un minuto)...")
    pip = [sys.executable, "-m", "pip", "install", "--user", "flask"]
    if subprocess.run(pip).returncode != 0:                      # pip assente: lo si prepara e si riprova
        subprocess.run([sys.executable, "-m", "ensurepip", "--user"])
        subprocess.run(pip)
    import importlib
    importlib.invalidate_caches()
    try:
        import flask  # noqa: F401
        return True
    except ImportError:
        print("Non sono riuscito a installare Flask. Prova a mano:  python -m pip install flask")
        return False


def porta_libera(inizio=5000):
    for p in range(inizio, inizio + 20):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    return inizio


def apri_browser(porta):
    time.sleep(1.5)
    webbrowser.open(f"http://127.0.0.1:{porta}")


def main():
    os.chdir(BASE)
    sys.path.insert(0, BASE)
    aggiorna()
    if not assicura_flask():
        input("Premi Invio per chiudere...")
        return 1
    import app
    porta = porta_libera()
    print(f"Urban parte su http://127.0.0.1:{porta}  (chiudi questa finestra per fermarlo)")
    threading.Thread(target=apri_browser, args=(porta,), daemon=True).start()
    app.app.run(host="127.0.0.1", port=porta, debug=False, use_reloader=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
