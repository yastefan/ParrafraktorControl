import { render } from "preact";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app.js";
import { appState } from "./app-state.js";
import "./style.css";

// Service worker: keeps the app in the cache. Only works via HTTPS (or localhost).
// A new version is only loaded after tapping "New version".
if ("serviceWorker" in navigator && window.isSecureContext) {
  const update = registerSW({
    onNeedRefresh: () => appState.showUpdate(() => void update(true)),
  });
}

appState.start();
render(<App />, document.getElementById("app")!);
