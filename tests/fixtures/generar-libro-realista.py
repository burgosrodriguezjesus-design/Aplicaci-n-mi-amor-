"""
Genera un libro de texto escaneado "de verdad" para probar la lectura, el
resumen y el esquema en las condiciones reales de un escaneo:

- índice, unidades, apartados y subapartados numerados;
- párrafos justificados en letra de libro, listas con viñetas, un cuadro
  sombreado de "Recuerda", una tabla con bordes, un gráfico con su pie y una
  "foto" (ruido) que el lector no debe convertir en palabras;
- cabecera y pie repetidos en cada página (el título del libro y el número);
- lo que NO es temario y el resumen debe separar: un ejemplo con una empresa
  inventada y su cálculo, un "Por ejemplo, Lucía…", un "¿Sabías que…?", un
  testimonio, el crédito de una foto, actividades numeradas con un test,
  "ACTIVIDADES FINALES" y los datos de autores, editorial e ISBN;
- lo que rodea al temario: portada con la ficha del curso, página de
  créditos, «Presentación», portadilla de unidad («En esta unidad
  aprenderás», «Objetivos»), una raya hecha con «= = =», un cartel dentro de
  una foto y la leyenda de un gráfico en letra pequeña;
- defectos del escáner: hoja un poco torcida, desenfoque, grano, fondo gris,
  sombra del lomo y compresión JPEG.

  python3 tests/fixtures/generar-libro-realista.py
"""
import io
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdfcanvas

random.seed(11)
ANCHO, ALTO = 1654, 2339  # A4 a 200 ppp
MARGEN = 150
FUENTES = "/usr/share/fonts/truetype/liberation"
CUERPO = ImageFont.truetype(f"{FUENTES}/LiberationSerif-Regular.ttf", 34)
NEGRITA = ImageFont.truetype(f"{FUENTES}/LiberationSerif-Bold.ttf", 34)
TITULO = ImageFont.truetype(f"{FUENTES}/LiberationSans-Bold.ttf", 54)
APARTADO = ImageFont.truetype(f"{FUENTES}/LiberationSans-Bold.ttf", 40)
SUBAPARTADO = ImageFont.truetype(f"{FUENTES}/LiberationSans-Bold.ttf", 35)
PEQUENA = ImageFont.truetype(f"{FUENTES}/LiberationSans-Regular.ttf", 26)
LIBRO = "Proceso integral de la actividad comercial"

# (tipo, texto). Tipos: unidad, apartado, sub, p (párrafo), vineta, recuerda,
# tabla, grafico, foto, salto, ejemplo (título, texto), cuadro (recuadro
# gris sin título), actividades (título), pequena (letra pequeña).
CONTENIDO = [
    ("portada", None),
    ("salto", None),
    ("creditos", None),
    ("salto", None),
    ("titulo_pagina", "Presentación"),
    ("p", "Este libro está dirigido a los alumnos del ciclo formativo de Gestión Administrativa. En cada unidad encontrarás ejemplos resueltos, actividades y un resumen final para repasar lo aprendido."),
    ("p", "Esperamos que te resulte útil y que disfrutes aprendiendo con él."),
    ("salto", None),
    ("indice", None),
    ("salto", None),
    ("unidad", "Unidad 4. El IVA en la actividad comercial"),
    ("objetivos", ["En esta unidad aprenderás:", "a distinguir el IVA repercutido del soportado;", "a liquidar el impuesto cada trimestre."]),
    ("p", "= = = = = = = = = = = = = = = = = = = = = = = = = ="),
    ("apartado", "1. Concepto y naturaleza del IVA"),
    ("p", "El impuesto sobre el valor añadido (IVA) es un tributo indirecto que grava el consumo de bienes y servicios. Se denomina indirecto porque no tiene en cuenta la capacidad económica de quien lo paga, sino el acto de consumo."),
    ("p", "La empresa actúa como recaudadora: cobra el IVA a sus clientes, paga el IVA a sus proveedores e ingresa en Hacienda la diferencia. Por eso se dice que el IVA es neutral para el empresario, ya que el coste lo soporta el consumidor final."),
    ("recuerda", "Recuerda: el IVA repercutido es el que la empresa cobra en sus ventas y el IVA soportado es el que paga en sus compras."),
    ("ejemplo", ("Ejemplo 4.1", "La empresa Muebles Ortega, S.L. vende una mesa por 500 € más IVA. El IVA repercutido es 500 × 21 % = 105 €, por lo que el cliente paga 605 € en total.")),
    ("apartado", "2. Tipos impositivos"),
    ("p", "La Ley del IVA establece tres tipos impositivos que se aplican sobre la base imponible según la naturaleza del bien o del servicio:"),
    ("vineta", "Tipo general del 21 %, que se aplica a la mayoría de los bienes y servicios."),
    ("vineta", "Tipo reducido del 10 %, para la hostelería, el transporte de viajeros y algunos alimentos."),
    ("vineta", "Tipo superreducido del 4 %, para el pan, la leche, los libros y los medicamentos."),
    ("tabla", [("Tipo", "Porcentaje", "Ejemplos"), ("General", "21 %", "Ropa, electrónica"), ("Reducido", "10 %", "Hostelería"), ("Superreducido", "4 %", "Pan, libros")]),
    ("p", "La base imponible está formada por el importe total de la contraprestación, incluidos los gastos de transporte y los envases, y excluidos los descuentos que figuren en la factura. Por ejemplo, si Lucía compra una lámpara de 80 € y paga 10 € de transporte, la base imponible es de 90 €."),
    ("cuadro", "¿Sabías que el IVA se aplicó por primera vez en Francia en 1954 y llegó a España en 1986?"),
    ("salto", None),
    ("apartado", "3. Liquidación del impuesto"),
    ("sub", "3.1. Cálculo de la cuota"),
    ("p", "La cuota a ingresar se obtiene restando al IVA repercutido el IVA soportado deducible. Si el resultado es positivo, la empresa debe ingresar la diferencia en Hacienda; si es negativo, puede compensarla en los periodos siguientes o solicitar la devolución."),
    ("grafico", "Figura 4.1. Evolución del IVA repercutido y soportado por trimestres."),
    ("sub", "3.2. Plazos de presentación"),
    ("p", "Las pequeñas y medianas empresas presentan el modelo 303 cada trimestre, durante los veinte primeros días naturales de abril, julio y octubre, y durante los treinta primeros días de enero. Además, presentan el resumen anual en el modelo 390."),
    ("recuerda", "Recuerda: un retraso en la presentación del modelo 303 conlleva recargos e intereses de demora."),
    ("actividades", "Actividades"),
    ("p", "1. Explica la diferencia entre el IVA repercutido y el IVA soportado."),
    ("p", "2. Calcula el IVA de una factura de 1.200 € al tipo general."),
    ("p", "3. ¿Qué modelo presentan las pymes cada trimestre?"),
    ("p", "a) El modelo 390.   b) El modelo 303.   c) El modelo 347."),
    ("salto", None),
    ("unidad", "Unidad 5. Gestión de existencias"),
    ("apartado", "1. Las existencias en la empresa"),
    ("p", "Las existencias son los bienes que la empresa tiene almacenados para venderlos o para incorporarlos al proceso productivo. Una buena gestión de existencias evita tanto la rotura de stock como el exceso de inventario, que inmoviliza recursos financieros."),
    ("foto", "Fotografía 5.1. Almacén de una empresa distribuidora."),
    ("pequena", "Foto: Javier Martínez / Shutterstock"),
    ("cuadro", "«En nuestro almacén hacemos inventario cada trimestre para evitar sorpresas», Laura Gómez, jefa de almacén de Distribuciones Norte."),
    ("apartado", "2. Clasificación de las existencias"),
    ("p", "Según su función en la empresa, las existencias se clasifican en:"),
    ("vineta", "Mercaderías: bienes adquiridos para venderlos sin transformarlos."),
    ("vineta", "Materias primas: bienes que se transforman en el proceso productivo."),
    ("vineta", "Productos terminados: bienes fabricados por la empresa y destinados a la venta."),
    ("vineta", "Envases y embalajes: recipientes que protegen la mercancía durante el transporte."),
    ("salto", None),
    ("apartado", "3. Métodos de valoración"),
    ("p", "Para valorar las salidas del almacén se utilizan principalmente dos métodos. El método del precio medio ponderado (PMP) calcula un precio medio cada vez que entra una partida. El método FIFO valora las salidas al precio de las existencias más antiguas, es decir, lo primero que entra es lo primero que sale."),
    ("p", "El stock de seguridad es la cantidad mínima de existencias que la empresa debe mantener para atender la demanda ante retrasos del proveedor. El punto de pedido indica el nivel de existencias en el que hay que realizar un nuevo pedido."),
    ("recuerda", "Recuerda: punto de pedido = stock de seguridad + consumo medio diario × plazo de entrega."),
    ("apartado", "4. El inventario"),
    ("p", "El inventario es la relación detallada y valorada de las existencias que hay en el almacén en una fecha determinada. Es obligatorio realizarlo al cierre de cada ejercicio económico y permite comprobar que el stock real coincide con el registrado en las fichas de almacén."),
    ("actividades", "ACTIVIDADES FINALES"),
    ("p", "1. Clasifica las siguientes existencias de una panadería: harina, pan y bolsas de papel."),
    ("p", "2. Calcula el punto de pedido si el stock de seguridad es de 50 unidades, el consumo diario es de 20 unidades y el plazo de entrega es de 5 días."),
    ("pequena", "Autores: Ana Pérez y Luis Romero. © Ediciones Didácticas, 2024. ISBN 978-84-1234-567-8."),
]

INDICE = [
    ("Unidad 4. El IVA en la actividad comercial", 3),
    ("1. Concepto y naturaleza del IVA", 3),
    ("2. Tipos impositivos", 3),
    ("3. Liquidación del impuesto", 4),
    ("Unidad 5. Gestión de existencias", 5),
    ("1. Las existencias en la empresa", 5),
    ("2. Clasificación de las existencias", 5),
    ("3. Métodos de valoración", 6),
    ("4. El inventario", 6),
]


def envolver(texto, fuente, ancho):
    palabras, lineas, actual = texto.split(), [], ""
    for palabra in palabras:
        prueba = (actual + " " + palabra).strip()
        if fuente.getlength(prueba) <= ancho:
            actual = prueba
        else:
            lineas.append(actual)
            actual = palabra
    if actual:
        lineas.append(actual)
    return lineas


def justificada(dibujo, x, y, linea, fuente, ancho, ultima):
    palabras = linea.split()
    if ultima or len(palabras) == 1:
        dibujo.text((x, y), linea, fill=(25, 25, 30), font=fuente)
        return
    libre = ancho - sum(fuente.getlength(p) for p in palabras)
    hueco = libre / (len(palabras) - 1)
    for palabra in palabras:
        dibujo.text((x, y), palabra, fill=(25, 25, 30), font=fuente)
        x += fuente.getlength(palabra) + hueco


class Pagina:
    def __init__(self, numero):
        self.numero = numero
        self.img = Image.new("RGB", (ANCHO, ALTO), (250, 249, 245))
        self.d = ImageDraw.Draw(self.img)
        self.y = 190
        # Cabecera y pie repetidos (lo que un buen resumen NO debe copiar).
        self.d.text((MARGEN, 80), LIBRO, fill=(110, 110, 115), font=PEQUENA)
        self.d.line((MARGEN, 125, ANCHO - MARGEN, 125), fill=(150, 150, 150), width=2)
        self.d.text((ANCHO // 2 - 10, ALTO - 110), str(numero), fill=(90, 90, 95), font=PEQUENA)

    def cabe(self, alto):
        return self.y + alto < ALTO - 180


def componer():
    paginas = [Pagina(1)]
    util = ANCHO - 2 * MARGEN
    for tipo, valor in CONTENIDO:
        pag = paginas[-1]
        if tipo == "salto" or (tipo in ("unidad",) and pag.y > 400):
            paginas.append(Pagina(len(paginas) + 1))
            if tipo == "salto":
                continue
            pag = paginas[-1]
        d = pag.d
        if tipo == "portada":
            y = 420
            for texto, fuente in [("Proceso integral de la", TITULO), ("actividad comercial", TITULO), ("", CUERPO),
                                  ("Ciclo Formativo de Grado Medio", APARTADO), ("Gestión Administrativa", APARTADO), ("", CUERPO),
                                  ("Ana Pérez · Luis Romero", CUERPO), ("", CUERPO), ("Ediciones Didácticas", NEGRITA)]:
                if texto:
                    d.text((ANCHO // 2 - fuente.getlength(texto) // 2, y), texto, fill=(25, 25, 35), font=fuente)
                y += 90
            continue
        if tipo == "creditos":
            y = 1500
            for texto in ["© Ediciones Didácticas, 2024", "ISBN: 978-84-1234-567-8", "Depósito legal: M-12345-2024",
                          "Reservados todos los derechos. Queda prohibida la reproducción total o parcial",
                          "de esta obra sin la autorización escrita de los titulares del copyright.", "Impreso en España"]:
                d.text((MARGEN, y), texto, fill=(60, 60, 65), font=PEQUENA)
                y += 44
            continue
        if tipo == "titulo_pagina":
            d.text((MARGEN, pag.y), valor, fill=(20, 20, 25), font=TITULO)
            pag.y += 120
            continue
        if tipo == "objetivos":
            lineas = valor
            alto = len(lineas) * 50 + 40
            d.rectangle((MARGEN, pag.y, ANCHO - MARGEN, pag.y + alto), fill=(240, 236, 250), outline=(150, 130, 200), width=2)
            for i, linea in enumerate(lineas):
                d.text((MARGEN + 30, pag.y + 20 + i * 50), ("• " if i else "") + linea, fill=(40, 30, 80), font=NEGRITA if i == 0 else CUERPO)
            pag.y += alto + 35
            d.text((MARGEN, pag.y), "Objetivos", fill=(40, 30, 80), font=SUBAPARTADO)
            pag.y += 60
            for linea in ["Conocer los tipos impositivos del IVA.", "Calcular la cuota a ingresar."]:
                d.text((MARGEN + 30, pag.y), "• " + linea, fill=(40, 30, 80), font=CUERPO)
                pag.y += 50
            pag.y += 30
            continue
        if tipo == "indice":
            d.text((MARGEN, pag.y), "Índice", fill=(20, 20, 25), font=TITULO)
            pag.y += 110
            for titulo, num in INDICE:
                fuente = APARTADO if titulo.startswith("Unidad") else CUERPO
                sangria = 0 if titulo.startswith("Unidad") else 50
                d.text((MARGEN + sangria, pag.y), titulo, fill=(25, 25, 30), font=fuente)
                ancho_t = fuente.getlength(titulo)
                puntos = "." * int((util - sangria - ancho_t - 60) / 12)
                d.text((MARGEN + sangria + ancho_t + 10, pag.y), puntos, fill=(120, 120, 120), font=CUERPO)
                d.text((ANCHO - MARGEN - 40, pag.y), str(num), fill=(25, 25, 30), font=fuente)
                pag.y += 64
        elif tipo == "unidad":
            d.rectangle((MARGEN - 20, pag.y - 15, ANCHO - MARGEN + 20, pag.y + 80), fill=(225, 230, 240))
            d.text((MARGEN, pag.y), valor, fill=(20, 30, 70), font=TITULO)
            pag.y += 140
        elif tipo in ("apartado", "sub"):
            fuente = APARTADO if tipo == "apartado" else SUBAPARTADO
            if not pag.cabe(120):
                paginas.append(Pagina(len(paginas) + 1))
                pag, d = paginas[-1], paginas[-1].d
            pag.y += 20
            d.text((MARGEN, pag.y), valor, fill=(20, 30, 70), font=fuente)
            pag.y += 75
        elif tipo in ("p", "vineta"):
            sangria = 50 if tipo == "vineta" else 0
            lineas = envolver(valor, CUERPO, util - sangria)
            for i, linea in enumerate(lineas):
                if not pag.cabe(50):
                    paginas.append(Pagina(len(paginas) + 1))
                    pag, d = paginas[-1], paginas[-1].d
                if tipo == "vineta" and i == 0:
                    d.ellipse((MARGEN + 12, pag.y + 14, MARGEN + 24, pag.y + 26), fill=(30, 30, 30))
                justificada(d, MARGEN + sangria, pag.y, linea, CUERPO, util - sangria, i == len(lineas) - 1)
                pag.y += 48
            pag.y += 22
        elif tipo == "recuerda":
            lineas = envolver(valor, NEGRITA, util - 60)
            alto = len(lineas) * 48 + 40
            if not pag.cabe(alto):
                paginas.append(Pagina(len(paginas) + 1))
                pag, d = paginas[-1], paginas[-1].d
            d.rectangle((MARGEN, pag.y, ANCHO - MARGEN, pag.y + alto), fill=(232, 232, 228), outline=(90, 90, 90), width=3)
            for i, linea in enumerate(lineas):
                d.text((MARGEN + 30, pag.y + 20 + i * 48), linea, fill=(20, 20, 25), font=NEGRITA)
            pag.y += alto + 35
        elif tipo in ("ejemplo", "cuadro"):
            titulo, texto = valor if tipo == "ejemplo" else (None, valor)
            lineas = envolver(texto, CUERPO, util - 60)
            alto = len(lineas) * 48 + 40 + (60 if titulo else 0)
            if not pag.cabe(alto):
                paginas.append(Pagina(len(paginas) + 1))
                pag, d = paginas[-1], paginas[-1].d
            d.rectangle((MARGEN, pag.y, ANCHO - MARGEN, pag.y + alto), fill=(238, 240, 246), outline=(120, 130, 160), width=2)
            y = pag.y + 20
            if titulo:
                d.text((MARGEN + 30, y), titulo, fill=(20, 30, 70), font=APARTADO)
                y += 60
            for i, linea in enumerate(lineas):
                d.text((MARGEN + 30, y + i * 48), linea, fill=(25, 25, 30), font=CUERPO)
            pag.y += alto + 35
        elif tipo == "actividades":
            if not pag.cabe(200):
                paginas.append(Pagina(len(paginas) + 1))
                pag, d = paginas[-1], paginas[-1].d
            pag.y += 30
            d.text((MARGEN, pag.y), valor, fill=(150, 40, 40), font=APARTADO)
            pag.y += 80
        elif tipo == "pequena":
            if not pag.cabe(60):
                paginas.append(Pagina(len(paginas) + 1))
                pag, d = paginas[-1], paginas[-1].d
            d.text((MARGEN, pag.y), valor, fill=(70, 70, 75), font=PEQUENA)
            pag.y += 60
        elif tipo == "tabla":
            filas = valor
            cols = [0, 330, 620, util]
            alto = len(filas) * 60
            if not pag.cabe(alto + 30):
                paginas.append(Pagina(len(paginas) + 1))
                pag, d = paginas[-1], paginas[-1].d
            for f, fila in enumerate(filas):
                y0 = pag.y + f * 60
                for c, celda in enumerate(fila):
                    d.rectangle((MARGEN + cols[c], y0, MARGEN + cols[c + 1], y0 + 60), outline=(60, 60, 60), width=2)
                    d.text((MARGEN + cols[c] + 15, y0 + 12), celda, fill=(20, 20, 25), font=NEGRITA if f == 0 else CUERPO)
            pag.y += alto + 40
        elif tipo == "grafico":
            alto = 420
            if not pag.cabe(alto + 80):
                paginas.append(Pagina(len(paginas) + 1))
                pag, d = paginas[-1], paginas[-1].d
            x0, y0 = MARGEN + 80, pag.y
            d.line((x0, y0, x0, y0 + alto), fill=(40, 40, 40), width=3)
            d.line((x0, y0 + alto, x0 + 1000, y0 + alto), fill=(40, 40, 40), width=3)
            for t, (a, b) in enumerate([(120, 80), (200, 150), (160, 170), (260, 190)]):
                bx = x0 + 60 + t * 230
                d.rectangle((bx, y0 + alto - a, bx + 70, y0 + alto), fill=(90, 110, 170))
                d.rectangle((bx + 80, y0 + alto - b, bx + 150, y0 + alto), fill=(190, 120, 80))
                d.text((bx + 20, y0 + alto + 10), f"T{t + 1}", fill=(40, 40, 40), font=PEQUENA)
            # Leyenda del gráfico, en letra pequeña.
            leyenda = ImageFont.truetype(f"{FUENTES}/LiberationSans-Regular.ttf", 20)
            d.rectangle((x0 + 760, y0 + 10, x0 + 780, y0 + 30), fill=(90, 110, 170))
            d.text((x0 + 790, y0 + 8), "Repercutido", fill=(40, 40, 40), font=leyenda)
            d.rectangle((x0 + 760, y0 + 45, x0 + 780, y0 + 65), fill=(190, 120, 80))
            d.text((x0 + 790, y0 + 43), "Soportado", fill=(40, 40, 40), font=leyenda)
            pag.y += alto + 60
            d.text((MARGEN, pag.y), valor, fill=(70, 70, 75), font=PEQUENA)
            pag.y += 70
        elif tipo == "foto":
            alto = 480
            if not pag.cabe(alto + 80):
                paginas.append(Pagina(len(paginas) + 1))
                pag, d = paginas[-1], paginas[-1].d
            foto = Image.effect_noise((util, alto), 70).convert("RGB").filter(ImageFilter.GaussianBlur(2))
            pag.img.paste(foto, (MARGEN, pag.y))
            # Un cartel dentro de la foto, en letra pequeña.
            d.rectangle((MARGEN + 520, pag.y + 150, MARGEN + 800, pag.y + 210), fill=(245, 245, 240))
            d.text((MARGEN + 545, pag.y + 163), "OFERTAS DE TEMPORADA", fill=(20, 20, 20), font=ImageFont.truetype(f"{FUENTES}/LiberationSans-Bold.ttf", 20))
            pag.y += alto + 20
            d.text((MARGEN, pag.y), valor, fill=(70, 70, 75), font=PEQUENA)
            pag.y += 70
    return paginas


def escanear(img):
    """Los defectos de un escáner de verdad."""
    img = img.rotate(random.uniform(-0.8, 0.8), resample=Image.BICUBIC, fillcolor=(245, 244, 240))
    sombra = Image.new("L", img.size, 0)
    ds = ImageDraw.Draw(sombra)
    for i in range(60):
        ds.line((i, 0, i, img.size[1]), fill=int(140 * (1 - i / 60)))
    img = Image.composite(Image.new("RGB", img.size, (40, 40, 40)), img, sombra)
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    grano = Image.effect_noise(img.size, 18).convert("RGB")
    img = Image.blend(img, grano, 0.06)
    return img


paginas = componer()
buf = io.BytesIO()
lienzo = pdfcanvas.Canvas(buf, pagesize=A4)
for pag in paginas:
    tmp = io.BytesIO()
    escanear(pag.img).convert("L").save(tmp, format="JPEG", quality=62)
    tmp.seek(0)
    lienzo.drawImage(ImageReader(tmp), 0, 0, width=A4[0], height=A4[1])
    lienzo.showPage()
lienzo.save()

destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), "libro-realista.pdf")
with open(destino, "wb") as f:
    f.write(buf.getvalue())
print("generado", destino, len(paginas), "páginas", len(buf.getvalue()) // 1024, "KB")
