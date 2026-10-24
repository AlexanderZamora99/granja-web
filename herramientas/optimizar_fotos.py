"""
Prepara las fotos de la granja para la web.

Uso (desde la carpeta granja-web):

    python herramientas/optimizar_fotos.py "C:/ruta/a/mis/fotos"

Para cada foto JPG/PNG/HEIC-convertida/WebP de la carpeta indicada:
  - la endereza según la orientación con que se tomó,
  - crea una versión grande (máx. 1600 px) y una miniatura (máx. 600 px) en WebP,
  - elimina los metadatos (modelo del celular, fecha, ubicación GPS),
  - y la agrega a fotos.json, conservando los textos que ya tuviera.

Las fotos originales no se modifican.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parent.parent
CARPETA_FOTOS = RAIZ / "fotos"
INDICE = RAIZ / "fotos.json"
EXTENSIONES = {".jpg", ".jpeg", ".png", ".webp"}
TAMANO_GRANDE = 1600
TAMANO_MINIATURA = 600


def nombre_seguro(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", texto.lower()).strip("-") or "foto"


def guardar(imagen: Image.Image, destino: Path, lado_maximo: int, calidad: int) -> tuple[int, int]:
    copia = imagen.copy()
    copia.thumbnail((lado_maximo, lado_maximo), Image.Resampling.LANCZOS)
    # Sin exif ni icc: la imagen nueva no lleva metadatos del original.
    copia.save(destino, "WEBP", quality=calidad, method=6)
    return copia.size


def main(origen: Path) -> None:
    # Nombres con emojis u otros símbolos no deben detener el proceso al imprimirlos.
    sys.stdout.reconfigure(errors="replace")
    if not origen.is_dir():
        sys.exit(f"No existe la carpeta: {origen}")

    CARPETA_FOTOS.mkdir(exist_ok=True)
    try:
        indice = json.loads(INDICE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        indice = {"fotos": []}
    textos = {f["grande"]: f.get("texto", "") for f in indice.get("fotos", [])}
    fotos = {f["grande"]: f for f in indice.get("fotos", [])}

    archivos = sorted(p for p in origen.iterdir() if p.suffix.lower() in EXTENSIONES)
    if not archivos:
        sys.exit("No se encontraron fotos JPG, PNG o WebP en esa carpeta.")

    for archivo in archivos:
        base = nombre_seguro(archivo.stem)
        grande = CARPETA_FOTOS / f"{base}.webp"
        miniatura = CARPETA_FOTOS / f"{base}-min.webp"
        with Image.open(archivo) as original:
            imagen = ImageOps.exif_transpose(original).convert("RGB")
            ancho, alto = guardar(imagen, grande, TAMANO_GRANDE, 80)
            guardar(imagen, miniatura, TAMANO_MINIATURA, 72)
        clave = f"fotos/{grande.name}"
        fotos[clave] = {
            "grande": clave,
            "miniatura": f"fotos/{miniatura.name}",
            "ancho": ancho,
            "alto": alto,
            "texto": textos.get(clave, ""),
        }
        kb = (grande.stat().st_size + miniatura.stat().st_size) // 1024
        # Solo ASCII: la consola de Windows (cp1252) no imprime símbolos como ✓.
        print(f"OK  {archivo.name} -> {grande.name} ({ancho}x{alto}, {kb} KB)")

    INDICE.write_text(
        json.dumps({"fotos": list(fotos.values())}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"\n{len(archivos)} foto(s) listas. Escribe un texto corto para cada una en fotos.json (opcional).")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
