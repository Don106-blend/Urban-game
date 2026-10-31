"""Fase 3A dell'overhaul: secondo attacco nel kit base, 'Colpo pesante' (2 azioni, un solo tiro).

Ogni eroe, dal primo turno, sceglie tra due colpi leggeri (Pugno, 1 azione) e un colpo pesante
(2 azioni): con 2 azioni e UNA risposta per round, cambia anche cosa puo' fare il difensore
(una risposta contro due colpi, o contro uno). Valore di partenza 80: la parita' con due
Pugni sta a ~2x il colpo leggero. Idempotente.

Misurato col harness (`balance.py decisioni`): il pesante che si schiva (la schivata riesce SEMPRE e costa solo la
risposta del round) valeva il 22-26% contro tre Pugni, quale che fosse il danno (da 70 a 150 non cambiava: il difensore
spende la risposta lì e lo annulla). Per questo e' l'unico colpo del kit base che NON si evita: ne' parata, ne' schivata,
ne' mira; contro di lui restano i soli riflessi. A 70 danni: pesante vs Pugno x3 53%, durata mediana 6 round (M1 rientra),
mira testa/busto 60/39 (M4 rientra), nessuna strategia pura domina. Idempotente."""
from datafix import carica, salva

att = carica("attacks.json")
pesante = {
    "id": 51,
    "nome": "Colpo pesante",
    "descrizione": ("Un colpo a tutta forza: costa 2 azioni ma colpisce molto più forte di un pugno. "
                    "Non si può schivare né parare, né mirare: solo i riflessi lo fermano.\n\nDanno base: 70"),
    "ranged": False, "can_aim": False, "can_dodge": False, "parabile": False,
    "attivo_default": True,
    "tipo_danno": "contundente",
    "danno": {"dadi": [], "flat": 70, "mult": 1},
    "sostituisce": None, "effetti_applicati": [], "split_danni": False,
    "skill_colpire": None, "cooldown_turni": 0, "usi_limitati": False, "usi_massimi": 1,
    "colpi": 1, "costo_azioni": 2,
}
esistente = next((a for a in att if a["id"] == 51), None)
if esistente is None:
    att.append(pesante)
else:
    esistente.update(pesante)
# tutti gli altri attacchi: costo esplicito 1 (campo opzionale, ma l'editor lo mostra)
for a in att:
    a.setdefault("costo_azioni", 1)
salva("attacks.json", att)
print("fase 3A dati: ok (Colpo pesante id 51)")
