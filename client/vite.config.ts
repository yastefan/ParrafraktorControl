import preact from "@preact/preset-vite";
import { defaultClientConditions, defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Port des Servers im Entwicklungsbetrieb (npm run dev startet beide)
const SERVER = `http://localhost:${process.env.PORT ?? 8080}`;

export default defineConfig({
  // Workspace-Pakete aus dem Quelltext laden, nicht aus dist
  resolve: { conditions: ["source", ...defaultClientConditions] },
  server: {
    host: true,   // im LAN erreichbar, z. B. vom iPad
    proxy: { "/ws": { target: SERVER, ws: true } },
  },
  build: { target: "safari15" },
  plugins: [
    preact(),
    VitePWA({
      // Updates nicht automatisch einspielen: mitten in der Show soll die Seite nicht neu laden.
      // Der Client zeigt stattdessen einen Knopf "Neue Version".
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Parrafraktor",
        short_name: "Parrafraktor",
        description: "Steuerung für die Spiegel des Parrafraktors",
        lang: "de",
        display: "standalone",
        orientation: "any",
        background_color: "#0e0f11",
        theme_color: "#0e0f11",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Die ganze App liegt im Cache: Nach dem ersten Laden kommt nichts mehr übers WLAN außer dem WebSocket
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/ws/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
