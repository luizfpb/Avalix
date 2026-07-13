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
      // v2.0: reset de emergência (selfDestroying) removido. Quem abriu o app
      // durante a janela do reset teve o SW antigo destruído; quem não abriu
      // pega este SW novo direto no próximo acesso (sw.js é no-cache no
      // Cloudflare, então a troca acontece de qualquer forma).
      // Os icones ja entram pelos globPatterns abaixo. Evita URLs duplicadas no
      // manifesto de precache (includeAssets/includeManifestIcons + glob).
      includeManifestIcons: false,
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
        // poseDetect/vision_bundle (MediaPipe) idem: só baixam quando o
        // recurso é usado e o modelo/wasm vêm de CDN — fora do precache.
        globIgnores: [
          "**/pdfTheme-*.js",
          "**/assessmentPdf-*.js",
          "**/workoutPdf-*.js",
          "**/poseDetect-*.js",
          "**/vision_bundle-*.js",
        ],
        navigateFallback: "/index.html",
        // Nenhum chunk grande pode entrar por acidente quando um arquivo for
        // renomeado. O orçamento completo também é conferido no CI.
        maximumFileSizeToCacheInBytes: 750_000,
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
    // A suite completa roda arquivos jsdom pesados em paralelo. Em runners
    // Windows/CI mais lentos, testes que levam <2 s isoladamente podem passar
    // de 5 s sob contencao; 15 s ainda detecta travamentos sem gerar falsos
    // negativos por falta de CPU.
    testTimeout: 15_000,
  },
})
