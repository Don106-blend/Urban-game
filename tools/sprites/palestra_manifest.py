"""Porta gli sprite degli oggetti della palestra nel gioco: copia i PNG costruiti da pxl in static/sprites/palestra/ e scrive
oggetti.json (dimensioni e perno di ognuno), che scena_palestra.js legge.

    PXL build tools/sprites/palestra.px.js --out <cartella temporanea>
    python tools/sprites/palestra_manifest.py <cartella temporanea>

Il `perno` e' il punto dello sprite che il gioco mette sulle coordinate dell'oggetto: "fondo" = il centro del bordo basso (un
oggetto che sta per terra), "alto" = il centro del bordo alto (cio' che e' appeso: il sacco, la lampada, le targhe),
"centro" (il bilanciere in mano a chi lo solleva)."""
import json
import os
import shutil
import struct
import sys

QUI = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(os.path.dirname(os.path.dirname(QUI)), "static", "sprites", "palestra")
PERNO = {"sacco": "alto", "bilanciere": "centro", "pesi": "fondo", "pesi_vuoto": "fondo", "manichino": "fondo", "lavagna": "fondo",
         "bacheca": "fondo", "specchio": "fondo", "infermeria": "fondo", "dormitorio": "fondo", "camera": "fondo", "tatami": "fondo",
         "targa": "alto", "finestra": "fondo", "poster": "fondo", "lampada": "alto"}


def dimensioni(path):
    with open(path, "rb") as f:
        testa = f.read(24)
    assert testa[:8] == b"\x89PNG\r\n\x1a\n", path
    return struct.unpack(">II", testa[16:24])


def main(cartella):
    sorgente = os.path.join(cartella, "sprites")
    if not os.path.isdir(sorgente):
        sorgente = cartella
    os.makedirs(DEST, exist_ok=True)
    manifesto = {}
    for nome, perno in PERNO.items():
        src = os.path.join(sorgente, nome + ".png")
        if not os.path.exists(src):
            sys.exit(f"manca {src}: ricostruisci con PXL build")
        w, h = dimensioni(src)
        shutil.copyfile(src, os.path.join(DEST, nome + ".png"))
        p = {"fondo": [w // 2, h], "alto": [w // 2, 0], "centro": [w // 2, h // 2]}[perno]
        manifesto[nome] = {"file": nome + ".png", "w": w, "h": h, "perno": p}
    with open(os.path.join(DEST, "oggetti.json"), "w", encoding="utf-8") as f:
        json.dump(manifesto, f, ensure_ascii=False, indent=1)
    print(f"{len(manifesto)} sprite in {DEST}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
