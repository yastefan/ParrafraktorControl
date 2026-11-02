# ParrafraktorControl

Steuer-App für den Parrafraktor, eine Lichtinstallation von Friedrich Gobbesso aus drei Elementen mit je zwölf drehbaren Spiegeln. Ein Server auf einem Mac, Windows-PC oder Raspberry Pi rechnet dieselben Pattern wie die Simulation auf der Website und sendet die Spiegelstellungen per Art-Net oder sACN an den DMX-Node. Bedient wird er über ein Elgato Stream Deck+ am selben Rechner oder über eine Web-App (PWA) auf dem iPad. Die grandMA3 kann parallel im Netz bleiben und übernimmt wieder, sobald die App abgibt.

## Aufbau

```
packages/engine      Pattern-Engine und DMX-Abbildung (ohne Abhängigkeiten, läuft im Server und im Browser)
packages/protokoll   gemeinsame Typen: Parameter-Bereiche, Einstellungen, WebSocket-Nachrichten
server/              Node-Server
  src/takt.ts          40 Hz: Engine weiterrechnen, Übernahme/Überblendung, an die Ausgaben senden
  src/steuerung.ts     zentraler Zustand; alle Bedienungen ändern ihn nur über diese Aktionen
  src/ausgabe/         Art-Net, sACN, RS485 (Platzhalter)
  src/eingabe/         Stream Deck+, MIDI und OSC (Platzhalter)
  src/mitlesen.ts      liest die MA mit, damit die Überblendung bei ihrer Stellung beginnt
  src/web/             liefert den Client aus, WebSocket /ws
client/              PWA (Preact + Vite): Vorschau, Pattern, Regler, Einstellungen
```

Der Server schickt den Clients bei jeder Änderung und sonst jede Sekunde den ganzen Stand. Nach einem WLAN-Aussetzer verbindet der Client von selbst neu und ist mit der ersten Nachricht wieder aktuell. Die App selbst liegt im Service Worker, über das WLAN geht danach nur noch der WebSocket.

## Entwickeln

Node.js 20.11 oder neuer.

```bash
npm install
```

```bash
npm run dev
```

Startet den Server (Port 8080) und Vite (Port 5173, im LAN erreichbar). Den Client unter http://localhost:5173 öffnen.

```bash
npm test
```

```bash
npm run typecheck
```

Die Engine wird gegen Referenzwerte aus der Website-Simulation geprüft (`packages/engine/test/referenz.json`). Ändert sich die Simulation, die Werte neu erzeugen:

```bash
node packages/engine/scripts/referenz-erzeugen.mjs /pfad/zu/WebsiteKlaus/src/js/parrafraktor.js
```

## Betrieb

```bash
npm run build && npm start
```

Der Server liefert den gebauten Client selbst aus: http://<rechner>:8080. Einstellungen und die zuletzt eingestellten Parameter liegen in `daten/`. Nach einem Neustart ist die Übernahme immer aus, es fährt also zuerst die MA.

| Umgebungsvariable | Bedeutung |
|---|---|
| `PORT` | Port, Vorgabe 8080 |
| `PARRAFRAKTOR_DATEN` | Datenverzeichnis, Vorgabe `./daten` |
| `TLS_CERT`, `TLS_KEY` | Zertifikat und Schlüssel (PEM) für HTTPS |
| `STREAMDECK=aus` | Stream Deck nicht ansprechen |

### iPad: HTTPS für den Offline-Cache

Safari hält die App nur über HTTPS im Cache. Ohne HTTPS funktioniert sie auch, lädt aber bei jedem Öffnen neu. Ein Zertifikat fürs Lichtnetz lässt sich mit [mkcert](https://github.com/FiloSottile/mkcert) erzeugen (IP und Namen anpassen):

```bash
mkdir -p zertifikate && mkcert -cert-file zertifikate/server.pem -key-file zertifikate/server-key.pem parrafraktor.local 2.0.0.240 localhost
```

```bash
TLS_CERT=zertifikate/server.pem TLS_KEY=zertifikate/server-key.pem PORT=8443 npm start
```

Auf dem iPad einmalig die Stammzertifizierungsstelle installieren: `rootCA.pem` aus `mkcert -CAROOT` per AirDrop aufs iPad, Profil installieren und unter Einstellungen → Allgemein → Info → Zertifikatsvertrauenseinstellungen voll vertrauen. Danach die Seite in Safari öffnen und über Teilen → Zum Home-Bildschirm als App ablegen.

Neue Versionen spielt die App nicht von selbst ein, damit nichts mitten in der Show neu lädt. Stattdessen erscheint oben der Knopf „Neue Version“.

### Stream Deck+

- **macOS/Windows**: Die Elgato-Software muss beendet sein, sonst ist das Gerät belegt.
- **Linux/Raspberry Pi**: udev-Regel anlegen, danach das Gerät neu einstecken:

```bash
printf 'SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", MODE:="666", GROUP="plugdev"\nKERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", MODE:="666", GROUP="plugdev"\n' | sudo tee /etc/udev/rules.d/50-elgato-stream-deck.rules && sudo udevadm control --reload-rules
```

Das Gerät darf jederzeit ab- und angesteckt werden.

| Bedienteil | Funktion |
|---|---|
| Tasten 1–5 | Pattern der aktuellen Pattern-Seite |
| Taste 6 | nächste Pattern-Seite (3 Seiten) |
| Taste 7 | Pause / Weiter |
| Taste 8 | Übernahme: **gedrückt halten** (0,6 s) |
| Drehregler, Seite 1 | Offset, Amplitude, Speed, Phase |
| Drehregler, Seite 2 | Speed bis, Group, Reihenfolge, Pattern |
| Regler drücken / Streifen antippen | Vorgabewert |
| Touchstreifen wischen | Reglerseite wechseln |

### Raspberry Pi als Dienst

```ini
# /etc/systemd/system/parrafraktor.service
[Unit]
Description=ParrafraktorControl
After=network-online.target
Wants=network-online.target

[Service]
User=pi
WorkingDirectory=/home/pi/ParrafraktorControl
Environment=PORT=8443 TLS_CERT=zertifikate/server.pem TLS_KEY=zertifikate/server-key.pem
ExecStart=/usr/bin/node server/dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now parrafraktor
```

## Vorschau

Die Vorschau im Client rechnet mit derselben Engine wie der Server. Wie sie aussieht, hängt vom Aufbau ab (Einstellungen → Aufbau):

- **nebeneinander**: Draufsicht, jeder Spiegel als Strich.
- **hintereinander, gedreht** (wie „Classic“ in der Simulation, Vorgabe vorn 0°, Mitte 45°, hinten 90°): Vorderansicht durch alle drei Elemente, rechts jedes Element einzeln. Unten links schaltet man zwischen **Spiegel** (die Spiegel mit Gegenlicht) und **Licht** um: Dann zeigt die Vorschau nur das Licht, das von hinten durch alle drei Lagen kommt. Die Wahl merkt sich jedes Gerät selbst.

Der Aufbau betrifft nur die Vorschau, nicht die Ausgabe an die Spiegel.

## Ausgabe und Übernahme

Im Einstellungsmenü lassen sich Art-Net, sACN und (später) RS485 einzeln einschalten, jeweils mit Ziel-IP und Netzwerkkarte.

- **sACN** sendet mit Priority 150, die MA mit 100. Beim Abgeben schickt die App „Stream Terminated“ und der Node fällt sofort auf die MA zurück. Der Node muss dafür sACN-Priority auswerten.
- **Art-Net** hat keine Priority. Läuft die MA parallel, entscheidet der Merge im Node. Beim Abgeben hört die App nur auf zu senden.
- **Überblendung**: Beim Übernehmen und Abgeben blendet die App über die eingestellte Zeit von bzw. zur Stellung der MA. Die liest sie im Netz mit (sACN-Multicast oder Art-Net-Broadcast). Empfängt sie nichts, springen die Spiegel.
