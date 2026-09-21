import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist y bcryptjs deben ejecutarse en Node, nunca empaquetados para el edge.
  serverExternalPackages: [
    "pdfjs-dist",
    "@prisma/client",
    "bcryptjs",
    // Binario nativo: debe cargarse en tiempo de ejecución, no empaquetarse.
    "@napi-rs/canvas",
    "tesseract.js",
  ],
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
