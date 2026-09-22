"""Genera un PDF escaneado largo (24 páginas, solo imágenes) para medir el ritmo del OCR."""
import io
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont

FUENTE = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
TITULO = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 42)

CUERPO = [
    "La tension electrica es el trabajo necesario para",
    "desplazar una carga entre dos puntos del circuito.",
    "Su unidad es el voltio (V) y se mide con el voltimetro.",
    "",
    "La intensidad de corriente es la cantidad de carga",
    "que atraviesa una seccion del conductor por segundo.",
    "Se mide en amperios (A) con un amperimetro en serie.",
    "",
    "La resistencia se opone al paso de la corriente y",
    "depende del material, la longitud y la seccion.",
    "Se mide en ohmios y se calcula con R = rho L / S.",
    "",
    "IMPORTANTE: no confundir potencia activa y aparente.",
    "La potencia activa se mide en vatios y la aparente",
    "en voltamperios; su relacion es el factor de potencia.",
]


def pagina(numero):
    img = Image.new("RGB", (1240, 1754), "white")
    dibujo = ImageDraw.Draw(img)
    dibujo.text((110, 110), "TEMA %d - INSTALACIONES ELECTRICAS" % (1 + numero // 5),
                fill=(15, 15, 20), font=TITULO)
    y = 210
    dibujo.text((110, y), "%d. Apartado numero %d" % (numero, numero),
                fill=(15, 15, 20), font=TITULO)
    y += 90
    for linea in CUERPO:
        if not linea:
            y += 26
            continue
        dibujo.text((110, y), linea, fill=(20, 20, 25), font=FUENTE)
        y += 50
    dibujo.text((110, 1660), "pagina %d" % numero, fill=(90, 90, 95), font=FUENTE)
    return img


buf = io.BytesIO()
lienzo = pdfcanvas.Canvas(buf, pagesize=A4)
for numero in range(1, 25):
    tmp = io.BytesIO()
    pagina(numero).save(tmp, format="JPEG", quality=78)
    tmp.seek(0)
    lienzo.drawImage(ImageReader(tmp), 0, 0, width=A4[0], height=A4[1])
    lienzo.showPage()
lienzo.save()

import os
destino = os.path.join(os.path.dirname(__file__), "escaneado-largo.pdf")
open(destino, "wb").write(buf.getvalue())
print("generado", destino, len(buf.getvalue()) // 1024, "KB")
