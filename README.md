# ParrafraktorControl

Steuer-App für den Parrafraktor, eine Lichtinstallation von Friedrich Gobbesso aus drei Elementen mit je zwölf drehbaren Spiegeln. Ein Server auf einem Mac, Windows-PC oder Raspberry Pi rechnet dieselben Pattern wie die Simulation auf der Website und sendet die Spiegelstellungen per Art-Net oder sACN an den DMX-Node. Bedient wird er über ein Elgato Stream Deck+ am selben Rechner oder über eine Web-App (PWA) auf dem iPad. Die grandMA3 kann parallel im Netz bleiben und fährt wieder, sobald man den Output der App ausschaltet.

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

Node.js 22.18 oder neuer (empfohlen 24; das Stream Deck braucht 22.18).

```bash
npm install
```

```bash
npm run dev
```

Startet den Server (Port 8080) und Vite (Port 5173, im LAN erreichbar). Den Client unter http://localhost:5173 öffnen. Wer im Dev-Betrieb Port 8080 öffnet, wird zu Vite weitergeleitet, statt einen alten Build aus `client/dist` zu sehen; ein dort früher angemeldeter Service Worker meldet sich dabei ab. Die Daten liegen im Dev-Betrieb in `server/daten/`, bei `npm start` in `daten/`.

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

Der Server liefert den gebauten Client selbst aus: http://<rechner>:8080. Einstellungen und die zuletzt eingestellten Parameter liegen in `daten/`. Presets liegen in `daten/presets.json`. Jede Datei wird mit `fsync` geschrieben, die vorige Fassung bleibt als `*.bak` und springt ein, wenn die Datei nach einem Stromausfall unlesbar ist. Nach einem Neustart ist der Output aus, es fährt also zuerst die MA – außer „Autostart output“ ist eingeschaltet.

| Umgebungsvariable | Bedeutung |
|---|---|
| `PORT` | Port, Vorgabe 8080 |
| `HTTP_PORT` | mit HTTPS zusätzlich unverschlüsselt auf diesem Port, als Rückfall, wenn das Zertifikat Ärger macht |
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

Die Tasten zeigen ein Hauptmenü mit Untermenüs. Jedes Menü hat seine Neonfarbe: **Pattern cyan, Presets grün, Impulse magenta**, Output rot. Im Hauptmenü leuchten Schrift und Rand der Menütasten in dieser Farbe, im Untermenü sind alle Tasten dunkel getönt, der gewählte Eintrag leuchtet. Der Touchstreifen zeigt oben in der Farbe der Reglergruppe, welche Seite gerade auf den Drehreglern liegt: **Bewegung gelb, Verteilung violett, Fein stahlgrau**, Impulse magenta. Die Weboberfläche nutzt dieselben Farben.

```
Hauptmenü                                   Untermenü (Pattern, Presets)
┌─────────┬─────────┬─────────┬─────────┐   ┌─────────┬─────────┬─────────┬─────────┐
│Pattern ›│Presets ›│Impulse ›│  Auto   │   │  Platz  │  Platz  │  Platz  │  Platz  │
├─────────┼─────────┼─────────┼─────────┤   ├─────────┼─────────┼─────────┼─────────┤
│ Ordnung │Elemente │  Pause  │ Output  │   │‹ Zurück │  Platz  │  Platz  │ Seite › │
└─────────┴─────────┴─────────┴─────────┘   └─────────┴─────────┴─────────┴─────────┘

Impulse (Live-Seite)
┌─────────┬─────────┬─────────┬─────────┐
│  Open   │  Close  │  Hole   │  Iris   │
├─────────┼─────────┼─────────┼─────────┤
│‹ Zurück │Elemente │ Regler  │Symmetr. │
└─────────┴─────────┴─────────┴─────────┘
```

| Bedienteil | Funktion |
|---|---|
| Pattern › | Grundbewegung direkt wählen |
| Presets › | Tippen ruft ab, **Halten** (0,8 s) speichert den aktuellen Look (2 Seiten à 6) |
| Auto | Tippen startet und stoppt Auto. Läuft es, leuchtet die Taste voll und zeigt den aktuellen Look. Gedämpft, wenn weniger als zwei Presets ausgewählt sind. Auswahl und Zeiten stellt man im Client ein |
| Ordnung, Elemente | nächste Stufe der Verteilung (gedämpft, wenn die Grundbewegung sie nicht nutzt) |
| Impulse › | obere Reihe wählt die Art (löst nichts aus); Elemente schaltet die Element-Folge, Regler die Drehregler-Seite (Hülle: Attack, Sustain, Release, Stärke; Lauf: Ausbreitung, Breite, Versatz), Symmetrisch schaltet die Spiegelung |
| Touchstreifen im Impulse-Menü | **Tippen** = gewählte Art von dieser Stelle aus, **Wischen** = sie läuft in Wischrichtung durch |
| Output | **gedrückt halten** (0,6 s): App fährt die Spiegel an bzw. gibt an die MA ab |
| Drehregler | Seiten je nach Grundbewegung, nur mit Reglern, die sie benutzt: **Bewegung** (Offset, Amplitude, Speed und Wellen bzw. Wiederkehr bzw. Wellenlänge; beim Sinus auf der zweiten Seite Breite und Speed bis), **Verteilung** (Ordnung, Elemente, Fächer, Gegenlauf, Element-Phase), **Fein** (Group, Ping-Pong, Speed je Element). Leere Seiten fallen weg, bei Ruhe bleibt nur Offset. Schalter: rechts drehen = an, drücken = umschalten |
| Offset-Regler lange drücken (0,6 s) | **Offset je Element**: die Regler stellen Off. 1, 2, 3 und alle zusammen (verschiebt alle, Abstände bleiben). Drücken setzt ein Element auf den gemeinsamen Offset, der vierte Regler gedrückt macht alle gleich (Vorgabe). Lange drücken oder Wischen: zurück. Haben die Elemente verschiedene Offsets, heißt das Feld „Offset 1–3“ |
| Regler drücken / Streifen antippen | Vorgabewert (außer im Impulse-Menü) |
| Touchstreifen wischen | Reglerseite wechseln (außer im Impulse-Menü) |
| Output halten, Order dazu, 2 s | nur auf dem Pi mit Netz-Menü: Code-Eingabe, siehe [Netz-Menü](#netz-menü-am-stream-deck-nur-pi) |

### Raspberry Pi als Steuergerät

Was sich zwischen Mac, Windows und Pi unterscheidet, steht in [docs/plattformen.md](docs/plattformen.md).

Ein Raspberry Pi 4 mit SD-Karte läuft als eigenständiges Gerät, auch ohne grandMA3 (z. B. in einer Ausstellung). Ziel: Er startet zuverlässig, auch wenn einfach der Strom gezogen wird. Dafür ist das System schreibgeschützt (Overlay-Dateisystem im RAM), nur eine kleine Datenpartition für Presets und Einstellungen ist beschreibbar, und der Server schreibt dorthin mit `fsync` und Sicherungskopie (`*.bak`).

| Teil | Wie |
|---|---|
| System | Raspberry Pi OS Lite 64 Bit (Trixie, Stand Oktober 2026: Image vom 6.10.2026, Kernel 6.18); Node 24 aus dem apt-Repository von NodeSource, weil das Stream Deck Node ≥ 22.18 braucht und Debian nur Node 20 hat |
| Schreibschutz | `raspi-config nonint do_overlayfs 0`: Root per `overlayroot=tmpfs:recurse=0` in `cmdline.txt` (recurse=0, sonst legt overlayroot auch über `/daten` ein Overlay im RAM), Bootpartition `ro` in `/etc/fstab` |
| Daten | Partition 3, ext4 (`data=journal,commit=5`), Label `pfdaten`, eingebunden unter `/daten`, `PARRAFRAKTOR_DATEN=/daten/parrafraktor` |
| Logs | journald nur im RAM (`Storage=volatile`), keine Swap-Datei, keine apt-Timer, cloud-init nach der Einrichtung aus |
| Dienst | `parrafraktor.service`, `Restart=always`, gibt nie auf |
| Watchdog | Hardware-Watchdog des BCM2711 (höchstens ca. 16 s), systemd `RuntimeWatchdogSec=15` |
| Stream Deck | udev-Regel für Gruppe `plugdev`, der Dienst läuft ohne root |
| Netz | feste IP im Lichtnetz über NetworkManager (Verbindung `lichtnetz`) |
| WLAN | auf Wunsch eigenes WLAN fürs iPad (Access Point, Verbindung `parrafraktor-ap`, DHCP über NetworkManager) |
| RS485 | noch nichts eingerichtet; der Benutzer ist schon in `dialout`, die serielle Schnittstelle bleibt unberührt |

**1. Karte vorbereiten (am Mac)**

1. Mit dem Raspberry Pi Imager „Raspberry Pi OS Lite (64-bit)“ schreiben. In den Einstellungen Hostname (z. B. `parrafraktor`), Benutzer, SSH und für die Einrichtung WLAN mit Internet setzen.
2. **Vor dem ersten Start**: Die Bootpartition erscheint am Mac als Laufwerk `bootfs`. In `cmdline.txt` das Wort `resize` löschen (die Datei bleibt eine Zeile). Sonst vergrößert der Pi beim ersten Start die Systempartition auf die ganze Karte, und für die Datenpartition bleibt kein Platz. Hat man es vergessen, bricht das Einrichtungsskript mit einem Hinweis ab; dann neu flashen.

**2. Einrichten (auf dem Pi, mit Internet)**

```bash
sudo apt-get update && sudo apt-get install -y git
```

```bash
git clone https://github.com/yastefan/ParrafraktorControl.git && cd ParrafraktorControl
```

Der Dienst läuft unter diesem Benutzer direkt aus dem geklonten Verzeichnis (die Befehle unten gehen vom Heimverzeichnis aus).

Der Dienst läuft per HTTP auf Port 80, die nackte Adresse (z. B. `192.168.4.1`) geht also in jedem Browser. Optional vorher die Zertifikate (siehe oben) nach `zertifikate/` kopieren, dann läuft er zusätzlich per HTTPS auf Port 8443 – für die iPad-App mit Offline-Cache (`https://192.168.4.1:8443`). Bewusst nicht 443: Firefox und Chrome probieren bei eingetippten Adressen zuerst HTTPS auf 443 und blieben dann am Zertifikat hängen, statt auf HTTP zurückzufallen. IP und Präfix für das Lichtnetz einsetzen:

```bash
sudo pi/einrichten.sh --ip 2.0.0.50/8
```

Soll der Pi ein eigenes WLAN fürs iPad aufmachen, Name und Passwort (8–63 Zeichen) dazu angeben:

```bash
sudo pi/einrichten.sh --ip 2.0.0.50/8 --ap-ssid Parrafraktor --ap-passwort 'geheimes-passwort'
```

Mit `--netz-code NNNN` kommt das [Netz-Menü am Stream Deck](#netz-menü-am-stream-deck-nur-pi) dazu.

Das iPad findet die App dann unter https://192.168.4.1:8443 bzw. http://192.168.4.1 (`--ap-adresse`, Vorgabe `192.168.4.1/24`) oder unter parrafraktor.local. Vorgabe ist 5 GHz auf Kanal 36, meist ruhiger in Räumen mit vielen Netzen; `--ap-band bg` nimmt 2,4 GHz (Kanal 6), das reicht weiter und durch Wände. Der Ländercode (`--land`, Vorgabe DE) gibt die erlaubten Kanäle vor. Der WLAN-Chip des Pi kann nicht gleichzeitig Access Point und mit einem anderen WLAN verbunden sein: Das WLAN, über das man einrichtet, bleibt gespeichert, kommt aber erst wieder, wenn der Access Point aus ist (`parrafraktor internet an`; `parrafraktor update` macht das selbst). Ins Lichtnetz wird nichts weitergeleitet. Für HTTPS die Adresse des Access Points beim `mkcert`-Aufruf mit angeben (z. B. `192.168.4.1`).

Das Skript vergrößert die Systempartition auf 8 GiB (`--root-gb`), legt dahinter die Datenpartition mit 1 GiB an (`--daten-mb`), installiert Node, baut die App, richtet Dienst, Watchdog, Logs, udev und Netz ein und schaltet zum Schluss den Schreibschutz ein. Mit `--gateway` bekommt das Lichtnetz eine Standardroute, sonst bleibt das Internet beim WLAN. Ein erneuter Aufruf schadet nicht. Danach:

```bash
sudo reboot
```

```bash
parrafraktor pruefen
```

Das zeigt, ob Overlay, Datenpartition, Dienst, Watchdog, Logs und Stream Deck stimmen.

**Der Befehl `parrafraktor`**: Das Einrichtungsskript legt ihn an, damit man sich keine Einzelbefehle merken muss. Ohne Argument öffnet er ein Auswahlmenü (wie `raspi-config`), `parrafraktor hilfe` zeigt alle Befehle. Was root braucht, fragt selbst nach sudo.

| Befehl | Was |
|---|---|
| `parrafraktor` | Auswahlmenü |
| `parrafraktor status` | Überblick: Schreibschutz, Daten, Dienst, WLAN, Adressen, Stand des Repos |
| `parrafraktor pruefen` | alle Prüfungen (`pi/pruefen.sh`) |
| `parrafraktor schreibschutz aus` / `an` | Schreibschutz aus- bzw. einschalten (startet neu) |
| `parrafraktor update` | apt, Pakete, `git pull`, Build, Dienst neu (Schreibschutz muss aus sein) |
| `parrafraktor internet an` / `aus` | eigenes WLAN aus, damit sich der Pi mit dem gespeicherten WLAN mit Internet verbindet / wieder an |
| `parrafraktor log` | Log des Dienstes live (`log update`, `log netz` für Update und Netz) |
| `parrafraktor neustart` | nur den Dienst neu starten |
| `parrafraktor einrichten` | Einrichtung erneut, ohne Optionen mit denen vom letzten Mal (gemerkt in `/etc/parrafraktor/einrichten.conf`, nur für root lesbar) |

**Netz-Menü am Stream Deck (nur Pi)**

Mit `--netz-code NNNN` beim Einrichten (vier Ziffern 1–8) gibt es am Stream Deck ein Netz-Menü – ohne Rechner, auch wenn WLAN oder LAN gerade falsch stehen. Den Code nur beim Einrichten angeben, nicht ins Repo schreiben.

1. Im Hauptmenü **Output** drücken und halten, innerhalb von 0,6 s **Order** dazu, beide 2 s halten. Output schaltet dabei nicht um, Order nicht weiter; beide Tasten zeigen „Network · hold …“.
2. Code über die Tasten: oben links 1 … oben rechts 4, unten links 5 … unten rechts 8. Der Streifen zeigt die Eingabe als Punkte. Falscher Code oder 10 s ohne Eingabe: zurück ins Hauptmenü.
3. Im Menü:

```
┌──────────┬──────────┬──────────┬──────────┐
│  WLAN    │  LAN     │  Mask    │  Apply   │
├──────────┼──────────┼──────────┼──────────┤
│‹ Back    │  Reset   │ LAN jetzt│WLAN jetzt│
└──────────┴──────────┴──────────┴──────────┘
```

| Bedienteil | Funktion |
|---|---|
| WLAN | eigenes WLAN an/aus |
| LAN | **DHCP** (antwortet binnen 15 s kein DHCP-Server, gilt die feste IP) oder **fixed IP** |
| Mask | Netzmaske /8, /16, /24 |
| Drehregler | je einer für die vier Zahlen der festen IP (schnell drehen: Zehnerschritte), Drücken: Zahl wie gespeichert |
| Apply | wendet den Entwurf an (leuchtet, wenn es Änderungen gibt) |
| Reset | Entwurf verwerfen |
| LAN jetzt, WLAN jetzt | aktueller Stand: Adresse der LAN-Buchse (oder „no cable“), WLAN an/aus |

Gespeichert wird in `/daten/parrafraktor/netz.json`; beim Hochfahren wendet `parrafraktor-netz.service` die Einstellungen erneut an, weil der Schreibschutz Änderungen am System sonst verwirft. Angewendet wird von `/usr/local/sbin/parrafraktor-netz` (aus `pi/netz.sh`), das der Dienst per sudo aufrufen darf – nur dieses eine Programm. Ändert sich das Lichtnetz, im Einstellungsmenü der App die Ziel-IP von Art-Net/sACN prüfen.

**3. Ausstellung ohne MA**: Im Einstellungsmenü der App unter **Autostart** „Autostart output“ einschalten, bei Bedarf auch „Autostart Auto“ (siehe [Ausgabe und Output](#ausgabe-und-output)).

**Updates und Wartung**: Der Schreibschutz muss dafür aus sein. Alles, was bei aktivem Overlay außerhalb von `/daten` geändert wird, ist nach dem Neustart weg.

```bash
parrafraktor schreibschutz aus
```

Nach dem Neustart (System beschreibbar): apt-Updates, nötige Pakete (`pi/pakete.sh`), `git pull`, `npm ci`, Build, Dienst neu starten. Ein eigenes WLAN wird dafür kurz ausgeschaltet, damit sich der Pi mit dem gespeicherten WLAN mit Internet verbinden kann (alternativ Internet übers Kabel). Weil dabei eine SSH-Verbindung über dieses WLAN abreißt, läuft das Update dann losgelöst als Dienst `parrafraktor-update` weiter. Fertig ist es, wenn das eigene WLAN wieder da ist; das Ergebnis zeigt `journalctl -u parrafraktor-update --no-pager | tail -15` (mitlesen mit `-f`, z. B. über das WLAN mit Internet unter `parrafraktor.local`):

```bash
parrafraktor update
```

App prüfen, dann den Schreibschutz wieder einschalten (startet neu):

```bash
parrafraktor schreibschutz an
```

`parrafraktor status` zeigt den Zustand. Ändert sich etwas an der Einrichtung selbst (z. B. Ports, Netz-Menü), statt `update` bei ausgeschaltetem Schreibschutz `parrafraktor einrichten` aufrufen. Bekannte Stolperstellen unter Trixie: Nach einem Kernel-Update auf 6.18.29 griff das Overlay bei manchen nicht mehr ([raspi-config#306](https://github.com/RPi-Distro/raspi-config/issues/306)) – deshalb nach jedem Update `parrafraktor pruefen` laufen lassen. Beim Ausschalten bleibt `overlayroot=tmpfs` manchmal in `cmdline.txt` stehen; `parrafraktor schreibschutz aus` entfernt es dann selbst.

**Prüfliste am echten Gerät** (vor der ersten Ausstellung):

1. Einrichten wie oben, `parrafraktor pruefen` ohne Fehler.
2. Presets speichern, Einstellungen ändern, Autostart output einschalten.
3. Mehrmals im Betrieb den Strom ziehen, auch **direkt nach dem Speichern eines Presets** (innerhalb einer Sekunde) und während Auto überblendet.
4. Mit eigenem WLAN: iPad verbindet sich nach jedem Start von selbst und erreicht die App.
5. Mit Netz-Menü: WLAN aus/an, LAN auf DHCP (ohne DHCP-Server: feste IP nach etwa 15 s), andere feste IP – jeweils auch nach einem Neustart noch so.
5. Nach jedem Start: Presets und Einstellungen sind da (im Log `journalctl -u parrafraktor` steht ggf. „Sicherung … verwendet“), das Stream Deck läuft, der Output startet von selbst, `parrafraktor pruefen` ist grün.

Quellen: [Raspberry Pi OS Downloads](https://www.raspberrypi.com/software/operating-systems/), [Raspberry Pi Dokumentation: Konfiguration (Overlay File System)](https://www.raspberrypi.com/documentation/computers/configuration.html), [raspi-config, Zweig trixie (`do_overlayfs`)](https://github.com/RPi-Distro/raspi-config/blob/trixie/raspi-config), [raspberrypi-sys-mods, Zweig pios/trixie (`resize_early`, `rpi-resize.service`)](https://github.com/RPi-Distro/raspberrypi-sys-mods/tree/pios/trixie), [Forum: Resize unter Trixie](https://forums.raspberrypi.com/viewtopic.php?t=395602), [systemd-system.conf (Watchdog)](https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html), [Linux-Treiber bcm2835_wdt](https://github.com/torvalds/linux/blob/master/drivers/watchdog/bcm2835_wdt.c), [NetworkManager: nmcli-Einstellungen (wifi, `ipv4.method shared`)](https://networkmanager.dev/docs/api/latest/nm-settings-nmcli.html), [Whitepaper „Making a more resilient file system“](https://pip.raspberrypi.com/documents/RP-003610-WP-Making-a-more-resilient-file-system.pdf), [Debian: nodejs in Trixie](https://packages.debian.org/trixie/nodejs), [NodeSource-Distributionen](https://github.com/nodesource/distributions), [trixie-feedback#75](https://github.com/raspberrypi/trixie-feedback/issues/75).

## Begriffe am Pult

Die Oberfläche (Client und Stream Deck) ist englisch, diese Anleitung deutsch. Die wichtigsten Begriffe:

| Pult | hier |
|---|---|
| Motion / Distribution / Fine | Bewegung / Verteilung / Fein |
| Speed from / Speed to | Speed von / Speed bis |
| Width, Fan, Return, Wavelength | Breite, Fächer, Wiederkehr, Wellenlänge |
| Element phase, Counter-motion, Speed per element | Element-Phase, Gegenlauf, Speed je Element |
| Order, Elements (together, front → back, back → front, center → out) | Ordnung, Element-Folge (zusammen, vorn → hinten, hinten → vorn, Mitte → außen) |
| Coupling, Noise, Range | Kopplung, Rauschen, Reichweite |
| Path (Circle, Line, Iris, Drift), Size, Travel, Edge, Wobble, Pulse, Lag | Bahn (Kreis, Linie, Iris, Drift), Größe, Weite, Kante, Wabern, Puls, Nachlauf |
| Impulses: Open, Close, Hole, Iris; Strength, Spread, Element delay, Envelope | Impulse: Flash auf, Flash zu, Loch, Iris; Stärke, Ausbreitung, Element-Versatz, Hülle |
| Settings: Layout, Crossfade, Read MA | Einstellungen: Aufbau, Überblendung, MA mitlesen |
| Preview: Reflection, Haze, Mirror / Stage / Thermal | Vorschau: Reflexion, Nebel, Spiegel / Bühne / Wärmebild |
| „mir.“ als Einheit | Spiegel |

## Pattern und Regler

Ein Pattern ist die Grundbewegung, die dauerhaft läuft:

- **Sine** (Sinus): die klassische Welle.
- **Pendulum wave** (Pendelwelle, vorerst nicht am Pult wählbar, nur noch über alte Presets): Jeder Spiegel schwingt etwas schneller als sein Vorgänger, wie bei einer Pendelwelle aus echten Pendeln. Die Reihe läuft aus dem Gleichlauf in Schlangen und scheinbares Chaos und wieder zusammen, wenn der erste Spiegel so oft geschwungen hat, wie **Wiederkehr** sagt (dann hat jeder folgende einen Schwung mehr geschafft). Speed ist das Tempo des ersten Spiegels und beschleunigt das ganze Bild; je kleiner die Wiederkehr, desto schneller laufen die hinteren Spiegel. Startet beim Wählen im Gleichlauf.
- **Wind**: Böen ziehen entlang der Ordnung durch die Spiegel und verändern sich dabei langsam, wiederholt sich nie. **Wellenlänge** = wie viele Spiegel eine Böe breit ist, Speed = Tempo (eine Wellenlänge je Durchlauf).
- **Swarm** (Schwarm): Jeder Spiegel läuft wie beim Sinus, aber mit eigenem Tempo (Speed von → bis), und zieht die anderen zu sich (Kuramoto-Modell, mit Rauschen und Reichweite wie ein Vogelschwarm im Vicsek-Modell). **Kopplung** aus = jeder für sich wie Speed je Spiegel, ab etwa 30 % rasten sie ein, dazwischen bilden sich Inseln und Ausreißer. Mit Phase rasten sie nicht in den Gleichlauf, sondern in die Welle der Phase ein. **Rauschen** stört jeden Spiegel für sich und bricht die Ordnung wieder auf (ab etwa 50 % deutlich). **Reichweite** = wie viele Plätze je Seite ein Spiegel sieht (aus = alle): klein gibt wandernde Fronten statt einem Gleichlauf. Startet beim Wählen verstreut (Nachbarn ähnlich, verdeckt von der Überblendung). Kein Spiegel läuft langsamer als das halbe oder schneller als das 1,5-fache Speed, auch wenn Kopplung oder Rauschen mehr verlangen; das Rauschen trifft immer mehrere Nachbarn zusammen wie eine Böe.
- **Flash** (Glühwürmchen): Jeder Spiegel lädt sich im Durchlauf auf und „blitzt“: ein Ausschlag zur Seite und zurück, so lang wie die **Breite** (wirkt zwischen 30 und 40 %, darunter wäre er zu schnell, darüber fehlt die Pause). Wer blitzt, stößt die anderen weiter, je voller sie schon sind, desto mehr. Wer dadurch voll ist, blitzt mit: Lawinen, bis alle im Takt blitzen (meist nach ½–1 min). Dazu passen sie ihr Tempo an: Wer kurz nach dem eigenen Blitz einen sieht, wird langsamer, wer kurz davor einen sieht, schneller. Alles das passiert nur in der Pause, man sieht es nicht; jeder Blitz läuft im eigenen Tempo und sieht gleich aus. Mit Phase wandert der Blitz als Welle durch. Kopplung, Rauschen und Reichweite wie bei Swarm.
- **Rotation**: endlos über TiltRotate. **Phase** dreht die Spiegel gegeneinander versetzt, **Breite** lässt jeden Spiegel eine Umdrehung in Schüben machen und dann stehen, **Fächer** staffelt die Drehzahl entlang der Ordnung, **Group** wiederholt das Muster in Gruppen, **Gegenlauf** dreht die linke Hälfte andersherum. TiltRotate kennt nur eine Drehzahl, deshalb rechnet die App den Winkel nur mit: Am echten Aufbau kann er abweichen. Die Breite kann nicht kleiner werden, als die Einstellung „TiltRotate max.“ erlaubt: bei 10 U/min und 3 BPM etwa 56 %.
- **Aperture** (Öffnung): für den Aufbau hintereinander. Ein Loch wandert durch alle drei Elemente: Jedes Element öffnet nur einen Schlitz, die drei Schlitze kreuzen sich im Loch. **Bahn** = Kreis, Linie (waagrecht), Iris (geht in der Mitte auf und zu) oder Drift (zieht frei umher). **Größe** = Radius, **Weite** = wie weit es wandert (Iris: um so viel geht es auf), **Kante** = hart bis weich, **Wabern** = atmet, driftet und verformt sich (zufällig), **Puls** = die Größe schwankt im Takt der Bahn, zweimal je Umlauf um ± so viel Prozent (bleibt periodisch, anders als Wabern), **Nachlauf** = die Elemente laufen einander nach, das Loch wird schief und geht zu und auf. Offset, Amplitude, Phase und Verteilung gelten hier nicht; zu = 0°, offen = 90°. Die Rechnung nutzt die Drehung aus Einstellungen → Aufbau, die muss also zum echten Aufbau passen. Wandert das Loch weit nach außen (ab etwa 37 cm), blitzen an den Spitzen des gedrehten Elements kleine Dreiecke auf, weil dort nur dieses eine Element abdeckt.
- **Rest** (Ruhe, vorerst nicht am Pult wählbar, nur noch über alte Presets): alle Spiegel stehen auf Offset, nur Impulse bewegen sie.

Alle Formen fahren ohne Sprünge an und ab; ein Wechsel der Form blendet über die eingestellte Überblendzeit über. Regler, die eine Form nicht benutzt, blendet der Client aus.

| Regler | Wirkung |
|---|---|
| Offset | Grundstellung. Mit **3×** je Element einstellbar (siehe [Oberfläche](#oberfläche)), am Stream Deck durch langes Drücken des Offset-Reglers |
| Amplitude | Ausschlag |
| Speed von/bis | Tempo in BPM (Durchläufe pro Minute, 0–10); mit „bis“ läuft der letzte Spiegel anders schnell als der erste |
| Phase | Versatz über die Spiegel wie in der grandMA3: 0° alle gleich, 360° eine Welle über alle, 720° zwei |
| Breite | nur Sinus, wie Width im Phaser der grandMA3: unter 100 % bewegt sich jeder Spiegel nur in diesem Anteil des Durchlaufs und steht sonst auf Offset – eine schmale Welle zieht über die ruhenden Spiegel. Mit Phase 360° und Breite 10 % bewegen sich etwa 10 % der Spiegel zugleich |
| Group | Muster wiederholt sich alle n Spiegel |
| Fächer | Amplitude wächst entlang der Ordnung, bei Mitte/außen zum Rand hin |

**Verteilung** – wo das Muster anfängt und wie es weiterläuft:

| Regler | Wirkung |
|---|---|
| Ordnung | innerhalb jedes Elements: links → rechts, rechts → links, Mitte → außen, außen → Mitte, verschachtelt (erst gerade, dann ungerade), Zufall (feste Mischung) |
| Elemente | zusammen (alle drei gleich), vorn → hinten oder hinten → vorn (das Muster läuft über alle 36 weiter), Mitte → außen (erst das mittlere, dann beide äußeren; das erste ist das Spiegelbild des dritten – mit Gegenlauf und Ordnung Mitte → außen ist die ganze Installation symmetrisch) |
| Element-Phase | aus: die Phase läuft mit der Element-Folge über die Elemente weiter. Sonst läuft die Phase in jedem Element für sich, und die Elemente sind nach der Element-Folge um so viel versetzt (vorn → hinten mit 15°: 0°, 15°, 30°; Mitte → außen: beide äußeren 15° hinter dem mittleren; bei zusammen ohne Wirkung) |
| Gegenlauf | linke Hälfte jedes Elements gespiegelt, auch der Offset (Offset 30° = links −30°, rechts +30°) |
| Ping-Pong | Muster läuft hin und wieder zurück |
| Speed je Element | Speed von → bis gilt für die Elemente statt für die Spiegel: alle Spiegel eines Elements gleich schnell, die Elemente nach der Element-Folge gestaffelt. Bei Phase 90° und 3 → 4 BPM sind alle nach 2 min wieder deckungsgleich |

Ältere Dateien werden beim Laden umgewandelt: Symmetrie von innen/außen = Ordnung Mitte → außen bzw. außen → Mitte mit Gegenlauf, Richtung zurück = rechts → links, Reihenfolge „je Element“ = Elemente zusammen, „alle 36“ = vorn → hinten. Symmetrie über alle 36 Spiegel gibt es nicht mehr, die Mitte ist jetzt die Mitte jedes Elements. Dreieck und Rechteck sowie die früheren Formen Sägezahn, Puls, Flyout, Blinder und Funkeln werden zum Sinus (ein Flyout spielt man jetzt als Impuls mit Ausbreitung).

## Impulse

Live-Ereignisse über dem laufenden Pattern, wie Flash-Tasten am Lichtpult. Oben wählt man die **Art**, ausgelöst wird auf dem **Streifen** (Touchstreifen am Stream Deck, Streifen im Client): **Tippen** startet den Impuls an dieser Stelle, **Wischen** lässt ihn vom Rand in Wischrichtung durchlaufen. Danach läuft die Hüllkurve von selbst ab.

- **Open / Close**: Spiegel auf einen festen Tilt. „Open“ für Licht von hinten, „Close“ für Licht von außen.
- **Hole**: Alle Spiegel schließen sich bis auf ein Loch, wie bei der Grundbewegung Aperture: Getippt geht es an dieser Stelle auf (waagrecht, in der Bildmitte), gewischt fährt es quer durchs Bild. **Größe** ist sein Radius. Am besten mit dem Aufbau hintereinander in der Ansicht Bühne zu sehen.
- **Iris**: wie Loch, wächst aber mit der Hüllkurve aus einem Punkt und schrumpft wieder.
- Winkel unter Einstellungen → Impulse: Open/Close (Platzhalter 90° und 0°).
- **Hüllkurve**: Attack (hin), Sustain (bleiben), Release (zurück), Stärke. Im Client die Punkte ziehen: oben links = Attack und Stärke, oben rechts = Ende des Sustain, unten = Ende des Release. Während eines Impulses läuft ein Punkt auf der Kurve mit.
- **Element-Folge**: zusammen, vorn → hinten oder hinten → vorn, mit Element-Versatz. Element 1 ist vorn.
- **Stärke**: wie weit zum Ziel (auch als Griff in der Hüllkurve).
- **Breite**: Getippt wirkt der Impuls nur auf so viele Spiegel um den Startpunkt („alle“ = ganzes Element). Gewischt läuft er immer durch das ganze Element.
- **Symmetrisch**: Der Impuls startet zugleich am gespiegelten Punkt, die linke Hälfte ist gespiegelt wie beim Gegenlauf (Winkel von Open/Close und Ausschlag umgekehrt).
- **Ausbreitung**: Zeit, bis der Impuls ein Element durchquert hat. Aus = alle Spiegel zugleich. Bei Loch und Iris: Zeit, die das gewischte Loch quer durchs Bild braucht (aus = die ganze Hüllkurve lang).
- Mehrere Impulse dürfen sich überlagern; der zuletzt gestartete liegt oben.

Art, Hüllkurve, Element-Folge, Ausbreitung, Breite und Symmetrie werden in `daten/impuls.json` gespeichert. Ideen stehen in [docs/konzept-bewegung.md](docs/konzept-bewegung.md).

## Oberfläche

Der Client passt ab etwa 1000 × 620 Punkten ohne Scrollen auf eine Fläche, darunter stehen die Module untereinander und es darf gescrollt werden. Module: Vorschau, Pattern, Presets, Bewegung, Verteilung (bei der Öffnung: Bahn) und unten das Impulsband. Unter **Mehr** am Impulsband liegen Element-Folge, Versatz sowie Attack, Sustain und Release.

**Fader** verstellen relativ: Antippen ändert nichts, erst Ziehen verändert den Wert, damit in der Show nichts springt. Am Rechner geht auch das **Mausrad** über dem Fader: je Rastung 2 % des Bereichs, mit Umschalttaste der kleinste Schritt. Doppeltippen auf den Namen setzt den Vorgabewert.

**Offset je Element**: Der Knopf **3×** am Offset klappt je einen Fader pro Element auf, **1×** wieder zu. Zugeklappt bleiben die Werte der Elemente erhalten: Der Knopf leuchtet, und die Marken **1, 2, 3** auf der Spur zeigen, wo die Elemente stehen. Bewegt man ihn, verschieben sich alle Elemente um denselben Betrag – die Abstände bleiben (am Rand des Bereichs bleibt er stehen). Doppeltippen auf den Namen setzt die Vorgabe und macht alle Elemente wieder gleich.

## Vorschau

Die Vorschau im Client rechnet mit derselben Engine wie der Server. Wie sie aussieht, hängt vom Aufbau ab (Einstellungen → Aufbau):

- **nebeneinander**: Draufsicht, jeder Spiegel als Strich.
- **hintereinander, gedreht** (wie „Classic“ in der Simulation, Vorgabe vorn 0°, Mitte 45°, hinten 90°): Vorderansicht durch alle drei Elemente, rechts jedes Element einzeln. Die Spitzen des gedrehten Elements dürfen dabei über den Bildrand ragen. Unten links schaltet man um: **Spiegel** zeigt die Spiegel mit Gegenlicht, **Bühne** hart in Schwarz und Weiß nur das Licht, das von hinten durch alle drei Lagen kommt, **Wärmebild** dasselbe Licht unscharf in Falschfarben, also die Form, die man aus der Entfernung wahrnimmt. Die Wahl merkt sich jedes Gerät selbst.

Der Aufbau betrifft nur die Vorschau, nicht die Ausgabe an die Spiegel.

Im Kopf der Vorschau schaltet man zwischen **Simple** (die Ansicht nach Aufbau, siehe oben), **Phaser** und **Reflexion** um. Der Phaser zeigt wie der Phaser-Editor der grandMA3 jeden Spiegel als Punkt: waagrecht seine Lage (Element 1–3, je 12 Spiegel), senkrecht seinen Winkel. Dahinter zieht eine kurze Spur die letzte Bewegung nach, die Achse wächst mit dem größten Ausschlag. Unter jedem Element steht es von oben wie in Simple, jeder Spiegel als Strich unter seinem Punkt. **Reflexion** zeigt wie die Website-Simulation den Raum von oben, nur einfacher: die Elemente nebeneinander und ein Scheinwerfer, den man mit dem Finger verschiebt (er zielt immer auf die Mitte; unten links ein Fader für den Zoom, 4–120° Öffnungswinkel), die Strahlen werden an den Spiegeln reflektiert (bis zu dreimal, Rückseiten schlucken) und leuchten auf den Wänden. Auch diese Wahl merkt sich jedes Gerät.

## Presets

12 Plätze für Looks: Pattern, Offset, Amplitude, Speed von/bis, Phase, Breite, Group und Reihenfolge (nicht Pause). Abrufen blendet über die eingestellte Überblendzeit von der aktuellen Stellung in den neuen Look, damit die Motoren nicht springen. Im Client: Tippen ruft ab, Halten speichert, unter „Bearbeiten“ umbenennen und löschen.

**Auto** fährt die ausgewählten Presets der Reihe nach ab. Unter „Auswahl“ legt man per Tippen fest, welche mitlaufen (die Marke oben rechts zeigt es), und stellt zwei Zeiten ein: **Überblenden** ist die Dauer des Übergangs, **Halten** die Zeit, die der Look danach steht. Solange Auto läuft, leuchtet der Rahmen des Moduls Presets und daneben steht die Restzeit. Auto braucht mindestens zwei Presets. Es schaltet den Output nicht ein oder aus und startet nach einem Neustart aus, außer „Autostart Auto“ ist eingeschaltet. Sobald man den Look von Hand verändert oder ein Preset abruft, endet Auto; die Pause hält es nur an. Das gilt auch am Stream Deck, dort startet und stoppt man Auto mit der eigenen Taste im Hauptmenü.

## Ausgabe und Output

Im Einstellungsmenü lassen sich Art-Net, sACN und (später) RS485 einzeln einschalten, jeweils mit Ziel-IP und Netzwerkkarte.

- **sACN** sendet mit Priority 150, die MA mit 100. Beim Abgeben schickt die App „Stream Terminated“ und der Node fällt sofort auf die MA zurück. Der Node muss dafür sACN-Priority auswerten.
- **Art-Net** hat keine Priority. Läuft die MA parallel, entscheidet der Merge im Node. Beim Abgeben hört die App nur auf zu senden.
- **Überblendung**: Beim Übernehmen und Abgeben blendet die App über die eingestellte Zeit von bzw. zur Stellung der MA. Die liest sie im Netz mit (sACN-Multicast oder Art-Net-Broadcast). Empfängt sie nichts, springen die Spiegel.
- **Autostart** (Einstellungsmenü, für den Betrieb ohne MA, z. B. in einer Ausstellung): **Autostart output** schaltet den Output nach jedem Neustart des Servers sofort ein, ohne Halten. Weil keine MA mitgelesen wird, gibt es keine Überblendung: Die Spiegel fahren direkt in den Look, so schnell die Motoren es zulassen. Auch mit MA im Netz übernimmt die App dann nach jedem Neustart – deshalb leuchtet im Kopf der App rot „Autostart“, die Gruppe im Einstellungsmenü ist rot, und das Menü zeigt eine Warnung. **Autostart Auto** startet Auto nach dem Neustart (mindestens zwei ausgewählte Presets). Beides ist ab Werk aus und wird in `einstellungen.json` gespeichert.
