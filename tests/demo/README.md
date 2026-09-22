# Pruebas de la demo en un navegador real

Comprueban lo que más cuesta ver a ojo: que un PDF **escaneado** acabe
convertido en resumen, esquema y audio en cualquier visor.

```bash
node scripts/build-demo-assets.mjs   # motor de lectura local (una vez)
node tests/demo/run.mjs              # levanta el servidor y pasa las 4 pruebas
```

| Prueba | Qué asegura |
| --- | --- |
| `ocr-local.mjs` | Sin puente con Claude, el dispositivo lee el PDF escaneado él solo. |
| `ocr-fallback.mjs` | Si el visor dice que admite imágenes pero las rechaza, se pasa al motor local sin intervención. |
| `ocr-claude.mjs` | Cuando Claude sí puede ver imágenes, se usa esa vía (más rápida). |
| `ocr-libro.mjs` | 24 páginas escaneadas seguidas: mide el ritmo real por página. |

El servidor local sirve `pdf.js` desde `node_modules` porque el entorno de
desarrollo no siempre alcanza la CDN; la versión publicada sí la usa.
