#!/bin/sh
# Avvio di Urban su macOS/Linux (lancia con: sh avvia_app.sh): serve Python 3 (se manca: https://www.python.org/downloads/ o il gestore di pacchetti).
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 avvia.py; fi
if command -v python >/dev/null 2>&1; then exec python avvia.py; fi
echo "Python 3 non e' installato: installalo da https://www.python.org/downloads/ e riprova."
