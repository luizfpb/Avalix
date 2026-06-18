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
      registerType: "autoUpdate",
      injectRegister: "auto",
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
        // o chunk do PDF (~1,5 MB) só serve online (precisa dos dados do
        // Supabase pra gerar o laudo); fora do precache pra instalação leve.
        globIgnores: ["**/assessmentPdf-*.js"],
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
