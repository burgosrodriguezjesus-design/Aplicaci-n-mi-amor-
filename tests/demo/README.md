# Pruebas de la demo en un navegador real

Comprueban lo que más cuesta ver a ojo: que un PDF **escaneado** acabe
convertido en resumen, esquema y audio en cualquier visor.

```bash
node scripts/build-demo-assets.mjs   # motor de lectura local (una vez)
node tests/demo/run.mjs              # levanta el servidor y pasa las 4 pruebas
```

| Prueba | Qué asegura |
| --- | --- |
| `estructura.mjs` | Lee el índice del libro, le pone los niveles buenos, cuadra las páginas y no pierde datos con unidades. |
| `repaso-ia.mjs` | El repaso con Claude reescribe cada apartado sin perder ninguno, y el audio se rehace con el texto nuevo. |
| `ocr-local.mjs` | Sin puente con Claude, el dispositivo lee el PDF escaneado él solo. |
| `ocr-fallback.mjs` | Si el visor dice que admite imágenes pero las rechaza, se pasa al motor local sin intervención. |
| `ocr-claude.mjs` | Cuando Claude sí puede ver imágenes, se usa esa vía (más rápida). |
| `ocr-libro.mjs` | 24 páginas escaneadas seguidas: mide el ritmo real por página. |

Y una más, que necesita la aplicación completa levantada (`npm start`):

| Prueba | Qué asegura |
| --- | --- |
| `instalable.mjs` | Manifiesto, iconos y comprobación de salud correctos; en iPhone se explica dónde tocar para instalar; una vez instalada deja de ofrecerse. |

```bash
npm start            # en una terminal
npm run test:instalable
```

El servidor local sirve `pdf.js` desde `node_modules` porque el entorno de
desarrollo no siempre alcanza la CDN; la versión publicada sí la usa.
