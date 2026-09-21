"""Genera un PDF SIN capa de texto (como un apunte escaneado con el móvil)."""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.lib.units import cm
from PIL import Image, ImageDraw, ImageFont
import io

LINEAS = [
    "TEMA 1 - FUNDAMENTOS DE INSTALACIONES",
    "",
    "1. Tension electrica",
    "La tension electrica es el trabajo necesario para",
    "desplazar una carga entre dos puntos del circuito.",
    "Su unidad es el voltio (V).",
    "",
    "2. Ley de Ohm",
    "V = I x R",
    "De aqui se deducen I = V / R y R = V / I.",
    "",
    "IMPORTANTE: no confundir potencia activa y aparente.",
]

def pagina_imagen(titulo):
    img = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(img)
    try:
        fuente = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 34)
        fuente_t = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 44)
    except OSError:
        fuente = ImageFont.load_default()
        fuente_t = fuente
    y = 120
    for i, linea in enumerate(LINEAS):
        if not linea:
            y += 30
            continue
        draw.text((110, y), linea, fill=(15, 15, 20), font=fuente_t if i == 0 else fuente)
        y += 62 if i == 0 else 52
    draw.text((110, 1650), titulo, fill=(90, 90, 95), font=fuente)
    return img

buf = io.BytesIO()
c = pdfcanvas.Canvas(buf, pagesize=A4)
for n in (1, 2):
    img = pagina_imagen(f"pagina {n}")
    tmp = io.BytesIO()
    img.save(tmp, format="JPEG", quality=80)
    tmp.seek(0)
    from reportlab.lib.utils import ImageReader
    c.drawImage(ImageReader(tmp), 0, 0, width=A4[0], height=A4[1])
    c.showPage()
c.save()
open("escaneado.pdf", "wb").write(buf.getvalue())
print("escaneado.pdf generado")
