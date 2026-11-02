// Entwicklung: Server (tsx watch) und Client (Vite) zusammen starten. Läuft auf macOS, Windows und Linux.
// Den Client unter http://localhost:5173 öffnen; Vite leitet /ws an den Server weiter.
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const prozesse = ["@parrafraktor/server", "@parrafraktor/client"].map((ws) =>
  spawn(npm, ["run", "dev", "-w", ws], { stdio: "inherit", shell: process.platform === "win32" }),
);

const beende = () => {
  for (const p of prozesse) p.kill("SIGINT");
};
process.on("SIGINT", beende);
process.on("SIGTERM", beende);
for (const p of prozesse) p.on("exit", (code) => { if (code) beende(); });
