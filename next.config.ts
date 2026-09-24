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
      "./node_modules/tesseract.js/src/**",
      "./node_modules/tesseract.js-core/*.js",
      "./node_modules/tesseract.js-core/*.wasm",
      "./node_modules/@napi-rs/canvas*/**",
      // El idioma del reconocimiento. Sin el, habria que descargarlo en cada
      // arranque, y en un alojamiento sin disco no hay donde guardarlo.
      "./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**",
      "./node_modules/@tesseract.js-data/spa/package.json",
      "./node_modules/pdfjs-dist/legacy/build/**",
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
