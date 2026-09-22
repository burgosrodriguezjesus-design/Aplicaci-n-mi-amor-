"""Genera un temario con índice, temas, apartados y subapartados (PDF con texto).

Sirve para comprobar que la aplicación lee el índice del propio libro y
reconstruye sus niveles, en vez de adivinarlos por mayúsculas.
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas as pdfcanvas

ANCHO, ALTO = A4
MARGEN = 2.2 * cm

TEMARIO = [
    ("TEMA 1 - LA ACTIVIDAD COMERCIAL", [
        ("1.1 Concepto de actividad comercial", [
            "La actividad comercial es el conjunto de operaciones que permiten",
            "el intercambio de bienes y servicios entre productores y consumidores.",
            "Se define como comercio la compraventa habitual de mercancias con",
            "animo de lucro.",
            "IMPORTANTE: no confundir actividad comercial con actividad industrial.",
        ], [
            "Comercio mayorista: compra al fabricante y vende al minorista.",
            "Comercio minorista: vende al consumidor final.",
            "Comercio electronico: la operacion se cierra por medios digitales.",
        ]),
        ("1.2 Los sujetos del comercio", [
            "Se distinguen tres sujetos: el empresario, el intermediario y el cliente.",
            "El empresario es la persona fisica o juridica que ejerce la actividad",
            "en nombre propio y asume el riesgo.",
            "El margen comercial se calcula como M = PV - PC, donde PV es el precio",
            "de venta y PC el precio de coste.",
        ], [
            "Empresario individual: responde con todo su patrimonio.",
            "Sociedad mercantil: la responsabilidad se limita al capital aportado.",
        ]),
        ("1.3 El establecimiento comercial", [
            "El establecimiento es el lugar fisico o virtual donde se desarrolla",
            "la actividad. La superficie minima de un local de venta al publico",
            "es de 25 m2 en la mayoria de las ordenanzas municipales.",
        ], []),
    ]),
    ("TEMA 2 - EL PROCESO DE COMPRAVENTA", [
        ("2.1 Fases del proceso", [
            "El proceso de compraventa consta de cinco fases: pedido, albaran,",
            "factura, cobro y, en su caso, devolucion.",
            "Cada fase deja un documento que sirve de prueba ante terceros.",
        ], [
            "Pedido: la peticion formal del cliente.",
            "Albaran: acompana a la mercancia y acredita la entrega.",
            "Factura: documenta la operacion a efectos fiscales.",
            "Recibo: acredita el cobro.",
        ]),
        ("2.2 El calculo del precio", [
            "El precio de venta al publico se obtiene aplicando el margen y el",
            "impuesto correspondiente: PVP = PC x (1 + m) x (1 + t).",
            "El tipo general del impuesto sobre el valor anadido es del 21 %.",
            "RECUERDA: el descuento se aplica antes del impuesto, nunca despues.",
        ], []),
        ("2.3 Documentos mercantiles", [
            "La factura debe contener el numero, la fecha, los datos de las partes,",
            "la descripcion de la operacion, la base imponible y la cuota.",
        ], [
            "Factura completa: incluye todos los datos exigidos.",
            "Factura simplificada: solo para importes inferiores a 400 euros.",
        ]),
    ]),
    ("TEMA 3 - LA GESTION DEL ALMACEN", [
        ("3.1 Funciones del almacen", [
            "El almacen regula el flujo entre la compra y la venta y absorbe las",
            "diferencias de ritmo entre ambas.",
        ], [
            "Recepcion y control de la mercancia.",
            "Almacenamiento y conservacion.",
            "Preparacion de pedidos y expedicion.",
        ]),
        ("3.2 Valoracion de existencias", [
            "Las existencias se valoran por el metodo del precio medio ponderado",
            "o por el metodo FIFO, segun establezca la empresa.",
            "El precio medio ponderado se calcula como PMP = (Q1 x P1 + Q2 x P2) / (Q1 + Q2).",
        ], []),
        ("3.3 El inventario", [
            "El inventario es el recuento fisico de las existencias. Debe hacerse",
            "al menos una vez al ano, al cierre del ejercicio.",
            "ATENCION: una diferencia de inventario superior al 2 % indica un fallo",
            "de control, no un error de recuento.",
        ], []),
    ]),
]


def escribir(c, y, texto, tamano=11, negrita=False, sangria=0.0):
    if y < MARGEN + 2 * cm:
        c.showPage()
        y = ALTO - MARGEN
    c.setFont("Helvetica-Bold" if negrita else "Helvetica", tamano)
    c.drawString(MARGEN + sangria, y, texto)
    return y - (tamano + 7)


def main():
    ruta = os.path.join(os.path.dirname(__file__), "temario-con-indice.pdf")
    c = pdfcanvas.Canvas(ruta, pagesize=A4)

    # ── Portada
    c.setFont("Helvetica-Bold", 26)
    c.drawString(MARGEN, ALTO - 7 * cm, "PROCESO INTEGRAL DE LA")
    c.drawString(MARGEN, ALTO - 8.4 * cm, "ACTIVIDAD COMERCIAL")
    c.setFont("Helvetica", 13)
    c.drawString(MARGEN, ALTO - 10 * cm, "Grado superior · Administracion y finanzas")
    c.showPage()

    # ── Índice (con puntos de relleno y numeros de pagina impresos)
    paginas = {}
    pagina_actual = 3  # la primera de contenido, en numeracion impresa
    for tema, apartados in TEMARIO:
        paginas[tema] = pagina_actual
        for titulo, cuerpo, lista in apartados:
            paginas[titulo] = pagina_actual
            pagina_actual += 1
        pagina_actual += 0

    y = ALTO - MARGEN
    c.setFont("Helvetica-Bold", 18)
    c.drawString(MARGEN, y, "INDICE")
    y -= 1.2 * cm
    ancho_util = ANCHO - 2 * MARGEN
    for tema, apartados in TEMARIO:
        y = _linea_indice(c, y, tema, paginas[tema], ancho_util, negrita=True, sangria=0)
        for titulo, cuerpo, lista in apartados:
            y = _linea_indice(c, y, titulo, paginas[titulo], ancho_util, negrita=False, sangria=0.7 * cm)
    c.showPage()

    # ── Contenido
    for tema, apartados in TEMARIO:
        y = ALTO - MARGEN
        y = escribir(c, y, tema, tamano=17, negrita=True)
        y -= 6
        for titulo, cuerpo, lista in apartados:
            y = escribir(c, y, titulo, tamano=13, negrita=True)
            for linea in cuerpo:
                y = escribir(c, y, linea, tamano=11)
            for elemento in lista:
                y = escribir(c, y, "- " + elemento, tamano=11, sangria=0.6 * cm)
            y -= 10
            c.showPage()
            y = ALTO - MARGEN
    c.save()
    print("generado", ruta)


def _linea_indice(c, y, titulo, pagina, ancho_util, negrita, sangria):
    fuente = "Helvetica-Bold" if negrita else "Helvetica"
    c.setFont(fuente, 11)
    numero = str(pagina)
    ancho_titulo = c.stringWidth(titulo, fuente, 11)
    ancho_numero = c.stringWidth(numero, fuente, 11)
    hueco = ancho_util - sangria - ancho_titulo - ancho_numero - 6
    puntos = "." * max(3, int(hueco / c.stringWidth(".", fuente, 11)))
    c.drawString(MARGEN + sangria, y, titulo + " " + puntos + " " + numero)
    return y - 18


main()
