import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // prompt (nao autoUpdate): o SW novo espera; quem aplica e o usuario, por
      // um toque no aviso (PwaUpdatePrompt) — sem reload surpresa no meio de um
      // formulario. injectRegister null porque registramos no componente.
      registerType: "prompt",
      injectRegister: null,
      // Emergency PWA reset: publishes a service worker that unregisters
      // itself and clears same-origin caches on the client's next SW update.
      // Remove this and deploy again after affected clients recover.
      selfDestroying: true,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "AvalixFit",
        short_name: "Avalix",
        description: "Avaliação física e postural para profissionais",
        lang: "pt-BR",
        theme_color: "#2A0E52",
        background_color: "#130A20",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Pré-cache só do shell estático (mesma origem). NUNCA cacheia o
        // Supabase (dados sensíveis, URLs assinadas, auth) — sem runtimeCaching
        // cross-origin de propósito; offline = o app abre, as chamadas de rede
        // falham com graça.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // os chunks de PDF só servem online (precisam dos dados do Supabase
        // pra gerar o laudo); fora do precache pra instalação leve. O pesado
        // (~1,5 MB) é o pdfTheme, que carrega o @react-pdf compartilhado.
        globIgnores: ["**/pdfTheme-*.js", "**/assessmentPdf-*.js", "**/workoutPdf-*.js"],
        navigateFallback: "/index.html",
        maximumFileSizeToCacheInBytes: 4_000_000,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
})
