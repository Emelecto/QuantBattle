#!/usr/bin/env python3
"""Wiring Colab para los notebooks de QuantBattle (Emelecto/QuantBattle, rama main).

1) Reemplaza el placeholder de org (TU_ORG) por Emelecto en las celdas
   colab-first y verifica que la URL raw resultante apunte a un CSV existente.
2) Inserta como PRIMERA celda markdown de cada notebook el badge "Open in Colab"
   (solo si no existe ya).
3) Valida: todos los ipynb parsean, la primera celda es el badge y las URLs raw
   apuntan a CSVs existentes.
4) Crea web/content/cursos/<curso>/colab.md con la lista 'Abrir en Colab'.

Uso:  python colab_wiring.py        (idempotente, sin push)
"""
import glob
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))  # web/content/cursos
ORG = "Emelecto"
REPO = "QuantBattle"
BRANCH = "main"

CURSOS_NOMBRE = {
    "fundamentos": "Fundamentos",
    "python": "Python cuantitativo",
    "mates": "Matemáticas",
    "riesgo": "Riesgo",
    "ml": "Machine learning",
    "torneos": "Torneos",
}

BADGE_TPL = (
    "<a href='https://colab.research.google.com/github/"
    "{org}/{repo}/blob/{branch}/web/content/cursos/{curso}/notebooks/{nb}' "
    "target='_parent'><img src='https://colab.research.google.com/assets/"
    "colab-badge.svg'/></a>"
)


def badge_html(curso, nb):
    return BADGE_TPL.format(org=ORG, repo=REPO, branch=BRANCH, curso=curso, nb=nb)


def titulo_nb(path):
    try:
        d = json.load(open(path, encoding="utf-8"))
        cells = d.get("cells", [])
        if cells:
            src = "".join(cells[0].get("source", [])).strip()
            # tras insertar el badge, la celda 0 es el badge: usar la siguiente
            if "colab.research.google.com" in src and len(cells) > 1:
                src = "".join(cells[1].get("source", [])).strip()
            line = src.split("\n")[0].strip().lstrip("# ").strip()
            return line or os.path.basename(path)
    except Exception:
        pass
    return os.path.basename(path)


def main():
    nbs = sorted(glob.glob(os.path.join(BASE, "*", "notebooks", "*.ipynb")))
    print(f"Notebooks: {len(nbs)}")
    errores = []

    for nb in nbs:
        curso = os.path.basename(os.path.dirname(os.path.dirname(nb)))
        nombre = os.path.basename(nb)
        with open(nb, encoding="utf-8") as f:
            d = json.load(f)  # 3) parsea
        cells = d.get("cells", [])

        # 1) placeholders de org en celdas colab-first
        # (ojo: algunos notebooks traen "source" como str o como lista de
        # caracteres sueltos; se opera sobre el texto unido y se re-empaqueta)
        for c in cells:
            orig = c.get("source", [])
            es_str = isinstance(orig, str)
            texto = orig if es_str else "".join(orig)
            if "TU_ORG" in texto or "ORG sin reemplazar" in texto:
                texto = texto.replace('ORG = "TU_ORG"', 'ORG = "Emelecto"')
                texto = texto.replace(
                    "# <-- reemplazala por tu usuario u organizacion de GitHub",
                    "# organizacion fija del repo Emelecto/QuantBattle",
                )
                texto = texto.replace("TU_ORG", "Emelecto")
                texto = texto.replace(
                    "si falla (sin red u ORG sin reemplazar), usa el CSV local",
                    "si falla (sin red), usa el CSV local",
                )
                if es_str:
                    c["source"] = texto
                else:
                    c["source"] = texto.splitlines(keepends=True)

        # 1b) verifica URLs raw resultantes -> CSV existente en el repo
        for c in cells:
            src = "".join(c.get("source", []))
            mm = re.search(r'CSV_NOMBRE\s*=\s*"([^"]+)"', src)
            if mm:
                csv_path = os.path.join(BASE, curso, "data", mm.group(1))
                if not os.path.exists(csv_path):
                    errores.append(f"{curso}/{nombre}: falta {csv_path}")
            mm2 = re.search(r"URL = '(https://raw\.githubusercontent\.com/[^']+)'", src)
            if mm2:
                url = mm2.group(1)
                rel = url.split(f"/{BRANCH}/", 1)[-1]
                if not os.path.exists(os.path.join(BASE, *rel.split("web/content/cursos/")[-1].split("/"))):
                    errores.append(f"{curso}/{nombre}: URL raw sin CSV local: {url}")

        # 2) badge como primera celda (solo si no existe)
        primera = "".join(cells[0].get("source", [])) if cells else ""
        hay_badge = any("colab.research.google.com" in "".join(c.get("source", [])) for c in cells)
        if "colab.research.google.com" not in primera:
            if hay_badge:
                errores.append(f"{curso}/{nombre}: badge existe pero no es primera celda")
            else:
                cells.insert(0, {
                    "cell_type": "markdown",
                    "metadata": {},
                    "source": [badge_html(curso, nombre)],
                })
                d["cells"] = cells

        with open(nb, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
            f.write("\n")

    # 3) validacion final
    for nb in nbs:
        curso = os.path.basename(os.path.dirname(os.path.dirname(nb)))
        nombre = os.path.basename(nb)
        try:
            d = json.load(open(nb, encoding="utf-8"))
        except Exception as e:
            errores.append(f"{curso}/{nombre}: no parsea ({e})")
            continue
        cells = d.get("cells", [])
        if not cells or "colab.research.google.com/assets/colab-badge.svg" not in "".join(
            cells[0].get("source", [])
        ):
            errores.append(f"{curso}/{nombre}: primera celda no es el badge")
            continue
        esperado = badge_html(curso, nombre)
        if esperado not in "".join(cells[0].get("source", [])):
            errores.append(f"{curso}/{nombre}: badge con URL inesperada")
        blob = open(nb, encoding="utf-8").read()
        if "TU_ORG" in blob:
            errores.append(f"{curso}/{nombre}: queda TU_ORG sin reemplazar")
        fuentes = "".join("".join(c.get("source", [])) for c in cells)
        if "{ORG}/QuantBattle" in fuentes and 'ORG = "Emelecto"' not in fuentes:
            errores.append(f"{curso}/{nombre}: f-string con ORG sin definir")

    # 4) colab.md por curso
    cursos = sorted({os.path.basename(os.path.dirname(os.path.dirname(n))) for n in nbs})
    for curso in cursos:
        propios = sorted([n for n in nbs if os.path.basename(os.path.dirname(os.path.dirname(n))) == curso])
        lineas = [
            f"# Abrir en Colab — {CURSOS_NOMBRE.get(curso, curso)}",
            "",
            "Cada notebook se abre en Google Colab con un clic. "
            "Los datos se descargan solos desde el repo (con respaldo local si no hay red).",
            "",
        ]
        for nb in propios:
            nombre = os.path.basename(nb)
            url = (
                f"https://colab.research.google.com/github/{ORG}/{REPO}/blob/{BRANCH}"
                f"/web/content/cursos/{curso}/notebooks/{nombre}"
            )
            lineas.append(f"- [Abrir en Colab: {titulo_nb(nb)}]({url})")
        lineas += ["", f"_{len(propios)} notebooks en total._", ""]
        with open(os.path.join(BASE, curso, "colab.md"), "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lineas))

    print(f"cursos: {len(cursos)} | colab.md creados: {len(cursos)}")
    if errores:
        print(f"ERRORES ({len(errores)}):")
        for e in errores:
            print(" -", e)
        sys.exit(1)
    print("OK: parsean, badge primero, sin placeholders, CSVs existen, colab.md listos.")


if __name__ == "__main__":
    main()
