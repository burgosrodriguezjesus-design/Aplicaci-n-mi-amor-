from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.units import cm

styles = getSampleStyleSheet()
h1 = ParagraphStyle('h1', parent=styles['Heading1'], fontSize=18, spaceAfter=12)
h2 = ParagraphStyle('h2', parent=styles['Heading2'], fontSize=14, spaceAfter=8)
body = ParagraphStyle('body', parent=styles['BodyText'], fontSize=10.5, leading=15)

content = [
 ("h1","TEMA 1 - FUNDAMENTOS DE INSTALACIONES ELECTRICAS"),
 ("p","Este tema recoge los conceptos basicos necesarios para comprender el funcionamiento de cualquier instalacion electrica de baja tension. Se estudian las magnitudes fundamentales, las leyes que las relacionan y los elementos de proteccion mas habituales."),
 ("h2","1. Conceptos fundamentales"),
 ("h2","1.1 Tension electrica"),
 ("p","La tension electrica, tambien llamada diferencia de potencial, es el trabajo necesario para desplazar una carga electrica entre dos puntos de un circuito. Se representa con la letra V y su unidad en el Sistema Internacional es el voltio (V)."),
 ("p","Definicion: la tension entre dos puntos A y B es el trabajo por unidad de carga que realiza el campo electrico para trasladar una carga desde A hasta B."),
 ("p","Valores habituales en Espana: 230 V entre fase y neutro, y 400 V entre fases en sistemas trifasicos."),
 ("h2","1.2 Intensidad de corriente"),
 ("p","La intensidad es la cantidad de carga electrica que atraviesa la seccion de un conductor por unidad de tiempo. Se representa con la letra I y su unidad es el amperio (A)."),
 ("p","I = Q / t, donde Q es la carga en culombios y t el tiempo en segundos."),
 ("h2","1.3 Resistencia electrica"),
 ("p","La resistencia mide la oposicion que presenta un material al paso de la corriente. Se representa con R y su unidad es el ohmio. Depende de la resistividad del material, de la longitud del conductor y de su seccion: R = rho * L / S."),
 ("PAGE",""),
 ("h2","2. Ley de Ohm"),
 ("p","La ley de Ohm establece que la tension aplicada a un conductor es directamente proporcional a la intensidad que circula por el y a su resistencia."),
 ("p","V = I x R"),
 ("p","De esta expresion se deducen: I = V / R y R = V / I. Es la relacion mas utilizada en el calculo de circuitos de corriente continua."),
 ("p","Ejemplo: si aplicamos 230 V a una resistencia de 46 ohmios, la intensidad sera de 5 A."),
 ("h2","3. Potencia electrica"),
 ("p","La potencia electrica es la energia consumida por unidad de tiempo. Su unidad es el vatio (W). En corriente continua se calcula como P = V x I."),
 ("p","En corriente alterna monofasica se introduce el factor de potencia: P = V x I x cos(fi). En trifasica: P = raiz de 3 x V x I x cos(fi)."),
 ("p","IMPORTANTE PARA EL EXAMEN: no confundir potencia activa (W), potencia reactiva (VAr) y potencia aparente (VA)."),
 ("PAGE",""),
 ("h1","TEMA 2 - PROTECCIONES Y CONDUCTORES"),
 ("h2","1. Elementos de proteccion"),
 ("p","Toda instalacion debe proteger frente a sobrecargas, cortocircuitos y contactos indirectos. Los dispositivos principales son el interruptor automatico magnetotermico, el interruptor diferencial y el limitador de sobretension."),
 ("h2","1.1 Interruptor magnetotermico"),
 ("p","Protege el circuito frente a sobrecargas mediante un elemento termico bimetalico y frente a cortocircuitos mediante un elemento magnetico. Las curvas mas usadas son B, C y D."),
 ("h2","1.2 Interruptor diferencial"),
 ("p","Detecta fugas de corriente a tierra comparando la corriente de entrada y la de salida. Sensibilidad habitual: 30 mA en viviendas y 300 mA en proteccion contra incendios."),
 ("h2","2. Seccion de los conductores"),
 ("p","La seccion se calcula por criterio de intensidad maxima admisible y por criterio de caida de tension. La caida de tension maxima admitida es del 3% en alumbrado y del 5% en fuerza para instalaciones interiores."),
 ("p","Formula de caida de tension en monofasica: e = 2 x L x I x cos(fi) / (gamma x S)."),
 ("p","Los colores normalizados son: marron o negro o gris para fases, azul para el neutro y amarillo-verde para el conductor de proteccion."),
]

story = []
for kind, text in content:
    if kind == "PAGE":
        story.append(PageBreak())
    elif kind == "h1":
        story.append(Paragraph(text, h1))
    elif kind == "h2":
        story.append(Paragraph(text, h2))
    else:
        story.append(Paragraph(text, body))
        story.append(Spacer(1, 0.2*cm))

doc = SimpleDocTemplate("sample.pdf", pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
doc.build(story)
print("ok")
