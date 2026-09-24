import type { NextConfig } from "next";

/**
 * Version que lleva dentro el codigo del navegador. La aplicacion instalada
 * la compara con la publicada para saber que tiene que recargarse.
 */
const version = (
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.RENDER_GIT_COMMIT ??
  "local"
).slice(0, 7);

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // Solo para las pruebas: un servidor con exactamente los ficheros que se
  // rastrean, que es lo mismo que Vercel mete en cada funcion.
  output: process.env.NEXT_STANDALONE ? "standalone" : undefined,
  // pdfjs-dist y bcryptjs deben ejecutarse en Node, nunca empaquetados para el edge.
  serverExternalPackages: [
    "pdfjs-dist",
    "@prisma/client",
    "bcryptjs",
    // Binario nativo: debe cargarse en tiempo de ejecución, no empaquetarse.
    "@napi-rs/canvas",
    "tesseract.js",
  ],
  // El reconocimiento de texto rasteriza cada pagina en un proceso aparte y
  // usa un motor compilado a WebAssembly. Ninguno de los dos se descubre
  // siguiendo los `import`, asi que hay que nombrarlos para que viajen al
  // servidor (imprescindible en alojamientos que empaquetan cada ruta).
  outputFileTracingIncludes: {
    "/api/**": [
      "./scripts/raster-worker.mjs",
      // El motor de reconocimiento arranca su hilo con `new Worker(ruta)`, y
      // lo que ese hilo carga no se ve al seguir los `import`. Sin estas
      // librerias, en Vercel no habia OCR ("no hay ningun motor disponible").
      "./node_modules/tesseract.js/package.json",
      "./node_modules/tesseract.js/src/**",
      "./node_modules/tesseract.js-core/package.json",
      "./node_modules/bmp-js/**",
      "./node_modules/is-url/**",
      "./node_modules/node-fetch/**",
      "./node_modules/whatwg-url/**",
      "./node_modules/tr46/**",
      "./node_modules/webidl-conversions/**",
      "./node_modules/regenerator-runtime/**",
      "./node_modules/wasm-feature-detect/**",
      "./node_modules/zlibjs/**",
      "./node_modules/tesseract.js-core/*.js",
      "./node_modules/tesseract.js-core/*.wasm",
      "./node_modules/@napi-rs/canvas*/**",
      // El idioma del reconocimiento. Sin el, habria que descargarlo en cada
      // arranque, y en un alojamiento sin disco no hay donde guardarlo.
      "./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**",
      "./assets/ocr/rapido/**",
      "./node_modules/@tesseract.js-data/spa/package.json",
      "./node_modules/pdfjs-dist/legacy/build/**",
    ],
  },
  // El rastreo de ficheros se trae carpetas enteras del proyecto que en el
  // servidor no pintan nada (pruebas, la demo, documentacion, PDF locales).
  outputFileTracingExcludes: {
    "/**": [
      "./tests/**",
      "./demo/**",
      "./docs/**",
      "./storage/**",
      "./.tmp-demo-web/**",
      "./docker/**",
      "./Dockerfile",
      "./docker-compose.yml",
      "./render.yaml",
      "./prisma/*.db*",
      // El lector de escaneados del navegador: se sirve como estático.
      "./public/ocr/**",
      // Cada funcion de Vercel puede pesar como mucho 250 MB y con todo esto
      // se quedaba a unos pocos. Nada de lo siguiente se usa en el servidor:
      // - los motores de Prisma para el "edge" (aqui va el motor de Node),
      "./node_modules/@prisma/client/runtime/*.wasm-base64.*",
      "./node_modules/@prisma/client/runtime/query_compiler_bg.*",
      // - el lienzo compilado para Linux con musl (Vercel usa glibc),
      "./node_modules/@napi-rs/canvas-linux-x64-musl/**",
      // - y los motores de reconocimiento que no son LSTM (se usa el LSTM).
      "./node_modules/tesseract.js-core/tesseract-core.wasm",
      "./node_modules/tesseract.js-core/tesseract-core.wasm.js",
      "./node_modules/tesseract.js-core/tesseract-core-simd.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-simd.wasm.js",
      "./node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm.js",
    ],
  },
  experimental: {
    // Los PDFs se suben por streaming a traves de rutas de API, no server actions.
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
