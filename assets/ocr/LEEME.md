# Modelo de lectura rápido (español)

`spa-fast.traineddata.gz` es `spa.traineddata` de
[tesseract-ocr/tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast)
(licencia Apache 2.0), comprimido con gzip.

Lee un 30 % más rápido que el modelo `best_int` con el mismo acierto en
escaneos normales. Las páginas que salen con poca confianza se releen solas
con el modelo preciso (`@tesseract.js-data/spa`, `4.0.0_best_int`).

`scripts/ocr-navegador.mjs` lo copia a `public/ocr/` al construir la app.
