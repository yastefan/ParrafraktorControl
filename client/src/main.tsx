import { render } from "preact";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app.js";
import { laden } from "./laden.js";
import "./stil.css";

// Service Worker: hält die App im Cache. Läuft nur über HTTPS (oder localhost).
// Eine neue Version wird erst nach Tippen auf "Neue Version" geladen.
if ("serviceWorker" in navigator && window.isSecureContext) {
  const aktualisieren = registerSW({
    onNeedRefresh: () => laden.zeigeUpdate(() => void aktualisieren(true)),
  });
}

laden.starte();
render(<App />, document.getElementById("app")!);
