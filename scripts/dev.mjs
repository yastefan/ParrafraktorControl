// Entwicklung: Server (tsx watch) und Client (Vite) zusammen starten. Läuft auf macOS, Windows und Linux.
// Den Client unter http://localhost:5173 öffnen; Vite leitet /ws an den Server weiter.
// Wer den Port des Servers (8080) öffnet, wird zu Vite weitergeleitet statt einen alten Build zu sehen.
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const VITE_PORT = 5173;
const prozesse = ["@parrafraktor/server", "@parrafraktor/client"].map((ws) =>
  spawn(npm, ["run", "dev", "-w", ws, ...(ws.endsWith("client") ? ["--", "--port", String(VITE_PORT), "--strictPort"] : [])], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, PARRAFRAKTOR_VITE_PORT: String(VITE_PORT) },
  }),
);

const beende = () => {
  for (const p of prozesse) p.kill("SIGINT");
};
process.on("SIGINT", beende);
process.on("SIGTERM", beende);
for (const p of prozesse) p.on("exit", (code) => { if (code) beende(); });
