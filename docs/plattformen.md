# Plattformen

ParrafraktorControl läuft auf macOS, Windows und dem Raspberry Pi. Diese Seite ist der eine Ort, an dem steht, was sich zwischen ihnen unterscheidet und wo das eingerichtet wird.

## Grundsatz

Der Server fragt nie, auf welchem System er läuft. Unterschiede kommen nur von außen: über Umgebungsvariablen und Systemdienste, die `pi/einrichten.sh` (bzw. am Mac der Aufruf von Hand) setzt. Was der Pi anders macht, lässt sich am Mac mit denselben Variablen nachstellen und testen.

| Umgebungsvariable | Mac/Windows (Entwicklung) | Pi (`pi/einrichten.sh`) |
|---|---|---|
| `PORT` | 8080 | 443 mit Zertifikat, sonst 80 |
| `HTTP_PORT` | – | 80 (nur mit Zertifikat) |
| `TLS_CERT`, `TLS_KEY` | – | `zertifikate/server*.pem`, wenn vorhanden |
| `PARRAFRAKTOR_DATEN` | `./daten` (`npm start`), `server/daten` (`npm run dev`) | `/daten/parrafraktor` |
| `PARRAFRAKTOR_VITE_PORT` | 5173 (setzt `npm run dev`) | – |
| `STREAMDECK=aus` | bei Bedarf | – |

## Was wo gilt

| Thema | macOS | Windows | Raspberry Pi | Eingerichtet in |
|---|---|---|---|---|
| Node | ≥ 22.18 (empfohlen 24) | ≥ 22.18 | 24 von NodeSource (Debian hat nur 20) | `pi/einrichten.sh` |
| Stream Deck + | Elgato-Software beenden | Elgato-Software beenden | udev-Regel, Gruppe `plugdev` | README, `pi/einrichten.sh` |
| Schrift fürs Stream Deck | Systemschrift | Systemschrift | `fonts-dejavu-core`, in `bilder.ts` als `PultSans` registriert | `pi/pakete.sh` |
| Native Pakete (`node-hid`, `@napi-rs/canvas`, `jpeg-turbo`) | vorgebaut | vorgebaut | vorgebaut für arm64; Build-Werkzeuge als Rückfall | `pi/pakete.sh` |
| Stromausfall | – | – | Schreibschutz (Overlay, `recurse=0`), Datenpartition `/daten`, fsync + `.bak` | `pi/einrichten.sh`, `server/src/speicher.ts` |
| Absturz, Hänger | – | – | systemd `Restart=always`, Hardware-Watchdog | `pi/einrichten.sh` |
| Logs | Konsole | Konsole | journald nur im RAM | `pi/einrichten.sh` |
| Netz | wie eingestellt | wie eingestellt | feste IP im Lichtnetz, eigenes WLAN (5 GHz) | `pi/einrichten.sh` |
| HTTPS | mkcert, Port wählbar | mkcert, Port wählbar | 443 + HTTP 80 als Rückfall | `pi/einrichten.sh` |
| Ohne MA starten | Einstellung „Autostart output“ | ebenso | ebenso, Dienst startet beim Hochfahren | Client (Einstellungen) |
| Updates | `git pull`, `npm ci` | ebenso | `pi/wartung.sh aus` → `update` → `an` | `pi/wartung.sh` |
| RS485 (DMX über UART) | – | – | geplant, Benutzer schon in `dialout` | – |

## Wie geprüft wird

- **Bei jedem PR (GitHub Actions, `.github/workflows/pruefen.yml`):** Linux auf ARM (wie der Pi) mit der Mindestversion von Node und mit Node 24, dazu macOS und Windows. Jeweils `npm ci`, Typecheck, Tests, Build, dann ob die nativen Pakete fürs Stream Deck laden. Das fängt Fehler wie „npm wirft das Stream-Deck-Paket still weg“ ab, bevor sie auf dem Pi auffallen.
- **Auf dem Pi:** `sudo pi/pruefen.sh` prüft, was nur auf dem Gerät geht (Overlay, `/daten`, Watchdog, Dienst, WLAN, Stream Deck). Die Prüfliste mit Strom ziehen steht im README.
- **Offene Punkte zum Pi:** GitHub-Issues mit dem Label `pi`.
