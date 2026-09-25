import type { Metadata, Viewport } from "next";
import { Literata, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

/** Interfaz: moderna y muy legible en pantallas pequeñas. */
const fuenteUi = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-ui",
  display: "swap",
});

/** Lectura del material: pensada para leer mucho rato sin cansarse. */
const fuenteLectura = Literata({
  subsets: ["latin", "latin-ext"],
  variable: "--font-read",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "alicIA · convierte tus PDF en material de estudio",
    template: "%s · alicIA",
  },
  description:
    "Sube tus apuntes en PDF y obtén automáticamente un resumen completo, un esquema de estudio y un audiolibro fiel al documento original.",
  applicationName: "alicIA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "alicIA", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-192.png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b10" },
  ],
};

/**
 * Se aplica el tema antes de pintar para evitar el parpadeo blanco
 * al cargar en modo oscuro.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("estudia-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${fuenteUi.variable} ${fuenteLectura.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
          {/* En todas las pantallas, tambien antes de entrar: asi se pone al dia. */}
          <ServiceWorkerRegistrar />
        </ThemeProvider>
      </body>
    </html>
  );
}
