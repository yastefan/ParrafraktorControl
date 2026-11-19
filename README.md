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

Der Server liefert den gebauten Client selbst aus: http://<rechner>:8080. Einstellungen und die zuletzt eingestellten Parameter liegen in `daten/`. Presets liegen in `daten/presets.json`. Jede Datei wird mit `fsync` geschrieben, die vorige Fassung bleibt als `*.bak` und springt ein, wenn die Datei nach einem Stromausfall unlesbar ist. Nach einem Neustart ist der Output aus, es fährt also zuerst die MA – außer „Autostart output“ ist eingeschaltet.

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
| Regler drücken / Streifen antippen | Vorgabewert (außer im Impulse-Menü) |
| Touchstreifen wischen | Reglerseite wechseln (außer im Impulse-Menü) |

### Raspberry Pi als Steuergerät

Ein Raspberry Pi 4 mit SD-Karte läuft als eigenständiges Gerät, auch ohne grandMA3 (z. B. in einer Ausstellung). Ziel: Er startet zuverlässig, auch wenn einfach der Strom gezogen wird. Dafür ist das System schreibgeschützt (Overlay-Dateisystem im RAM), nur eine kleine Datenpartition für Presets und Einstellungen ist beschreibbar, und der Server schreibt dorthin mit `fsync` und Sicherungskopie (`*.bak`).

| Teil | Wie |
|---|---|
| System | Raspberry Pi OS Lite 64 Bit (Trixie, Stand Oktober 2026: Image vom 6.10.2026, Kernel 6.18, Node 20.19 aus Debian) |
| Schreibschutz | `raspi-config nonint do_overlayfs 0`: Root per `overlayroot=tmpfs` in `cmdline.txt`, Bootpartition `ro` in `/etc/fstab` |
| Daten | Partition 3, ext4 (`data=journal,commit=5`), Label `pfdaten`, eingebunden unter `/daten`, `PARRAFRAKTOR_DATEN=/daten/parrafraktor` |
| Logs | journald nur im RAM (`Storage=volatile`), keine Swap-Datei, keine apt-Timer, cloud-init nach der Einrichtung aus |
| Dienst | `parrafraktor.service`, `Restart=always`, gibt nie auf |
| Watchdog | Hardware-Watchdog des BCM2711 (höchstens ca. 16 s), systemd `RuntimeWatchdogSec=15` |
| Stream Deck | udev-Regel für Gruppe `plugdev`, der Dienst läuft ohne root |
| Netz | feste IP im Lichtnetz über NetworkManager (Verbindung `lichtnetz`) |
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

Optional vorher die Zertifikate (siehe oben) nach `zertifikate/` kopieren, dann läuft der Dienst per HTTPS auf Port 8443. IP und Präfix für das Lichtnetz einsetzen:

```bash
sudo pi/einrichten.sh --ip 2.0.0.50/8
```

Das Skript vergrößert die Systempartition auf 8 GiB (`--root-gb`), legt dahinter die Datenpartition mit 1 GiB an (`--daten-mb`), installiert Node, baut die App, richtet Dienst, Watchdog, Logs, udev und Netz ein und schaltet zum Schluss den Schreibschutz ein. Mit `--gateway` bekommt das Lichtnetz eine Standardroute, sonst bleibt das Internet beim WLAN. Ein erneuter Aufruf schadet nicht. Danach:

```bash
sudo reboot
```

```bash
sudo ParrafraktorControl/pi/pruefen.sh
```

`pruefen.sh` zeigt, ob Overlay, Datenpartition, Dienst, Watchdog, Logs und Stream Deck stimmen.

**3. Ausstellung ohne MA**: Im Einstellungsmenü der App unter **Autostart** „Autostart output“ einschalten, bei Bedarf auch „Autostart Auto“ (siehe [Ausgabe und Output](#ausgabe-und-output)).

**Updates und Wartung**: Der Schreibschutz muss dafür aus sein. Alles, was bei aktivem Overlay außerhalb von `/daten` geändert wird, ist nach dem Neustart weg.

```bash
sudo ParrafraktorControl/pi/wartung.sh aus
```

Nach dem Neustart (System beschreibbar): apt-Updates, `git pull`, `npm ci`, Build, Dienst neu starten:

```bash
sudo ParrafraktorControl/pi/wartung.sh update
```

App prüfen, dann den Schreibschutz wieder einschalten (startet neu):

```bash
sudo ParrafraktorControl/pi/wartung.sh an
```

`pi/wartung.sh status` zeigt den Zustand. Bekannte Stolperstellen unter Trixie: Nach einem Kernel-Update auf 6.18.29 griff das Overlay bei manchen nicht mehr ([raspi-config#306](https://github.com/RPi-Distro/raspi-config/issues/306)) – deshalb nach jedem Update `pruefen.sh` laufen lassen. Beim Ausschalten bleibt `overlayroot=tmpfs` manchmal in `cmdline.txt` stehen; `wartung.sh aus` entfernt es dann selbst.

**Prüfliste am echten Gerät** (vor der ersten Ausstellung):

1. Einrichten wie oben, `pruefen.sh` ohne Fehler.
2. Presets speichern, Einstellungen ändern, Autostart output einschalten.
3. Mehrmals im Betrieb den Strom ziehen, auch **direkt nach dem Speichern eines Presets** (innerhalb einer Sekunde) und während Auto überblendet.
4. Nach jedem Start: Presets und Einstellungen sind da (im Log `journalctl -u parrafraktor` steht ggf. „Sicherung … verwendet“), das Stream Deck läuft, der Output startet von selbst, `pruefen.sh` ist grün.

Quellen: [Raspberry Pi OS Downloads](https://www.raspberrypi.com/software/operating-systems/), [Raspberry Pi Dokumentation: Konfiguration (Overlay File System)](https://www.raspberrypi.com/documentation/computers/configuration.html), [raspi-config, Zweig trixie (`do_overlayfs`)](https://github.com/RPi-Distro/raspi-config/blob/trixie/raspi-config), [raspberrypi-sys-mods, Zweig pios/trixie (`resize_early`, `rpi-resize.service`)](https://github.com/RPi-Distro/raspberrypi-sys-mods/tree/pios/trixie), [Forum: Resize unter Trixie](https://forums.raspberrypi.com/viewtopic.php?t=395602), [systemd-system.conf (Watchdog)](https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html), [Linux-Treiber bcm2835_wdt](https://github.com/torvalds/linux/blob/master/drivers/watchdog/bcm2835_wdt.c), [Whitepaper „Making a more resilient file system“](https://pip.raspberrypi.com/documents/RP-003610-WP-Making-a-more-resilient-file-system.pdf), [Debian: nodejs in Trixie](https://packages.debian.org/trixie/nodejs), [trixie-feedback#75](https://github.com/raspberrypi/trixie-feedback/issues/75).

## Presets

12 Plätze für Looks: Pattern, Offset, Amplitude, Speed von/bis, Phase, Breite, Group und Reihenfolge (nicht Pause). Abrufen blendet über die eingestellte Überblendzeit von der aktuellen Stellung in den neuen Look, damit die Motoren nicht springen. Im Client: Tippen ruft ab, Halten speichert, unter „Bearbeiten“ umbenennen und löschen.

**Auto** fährt die ausgewählten Presets der Reihe nach ab. Unter „Auswahl“ legt man per Tippen fest, welche mitlaufen (die Marke oben rechts zeigt es), und stellt zwei Zeiten ein: **Überblenden** ist die Dauer des Übergangs, **Halten** die Zeit, die der Look danach steht. Solange Auto läuft, leuchtet der Rahmen des Moduls Presets und daneben steht die Restzeit. Auto braucht mindestens zwei Presets. Es schaltet den Output nicht ein oder aus und startet nach einem Neustart aus, außer „Autostart Auto“ ist eingeschaltet. Sobald man den Look von Hand verändert oder ein Preset abruft, endet Auto; die Pause hält es nur an. Das gilt auch am Stream Deck, dort startet und stoppt man Auto mit der eigenen Taste im Hauptmenü.

## Ausgabe und Output

Im Einstellungsmenü lassen sich Art-Net, sACN und (später) RS485 einzeln einschalten, jeweils mit Ziel-IP und Netzwerkkarte.

- **sACN** sendet mit Priority 150, die MA mit 100. Beim Abgeben schickt die App „Stream Terminated“ und der Node fällt sofort auf die MA zurück. Der Node muss dafür sACN-Priority auswerten.
- **Art-Net** hat keine Priority. Läuft die MA parallel, entscheidet der Merge im Node. Beim Abgeben hört die App nur auf zu senden.
- **Überblendung**: Beim Übernehmen und Abgeben blendet die App über die eingestellte Zeit von bzw. zur Stellung der MA. Die liest sie im Netz mit (sACN-Multicast oder Art-Net-Broadcast). Empfängt sie nichts, springen die Spiegel.
- **Autostart** (Einstellungsmenü, für den Betrieb ohne MA, z. B. in einer Ausstellung): **Autostart output** schaltet den Output nach jedem Neustart des Servers sofort ein, ohne Halten. Weil keine MA mitgelesen wird, gibt es keine Überblendung: Die Spiegel fahren direkt in den Look, so schnell die Motoren es zulassen. Auch mit MA im Netz übernimmt die App dann nach jedem Neustart – deshalb leuchtet im Kopf der App rot „Autostart“, die Gruppe im Einstellungsmenü ist rot, und das Menü zeigt eine Warnung. **Autostart Auto** startet Auto nach dem Neustart (mindestens zwei ausgewählte Presets). Beides ist ab Werk aus und wird in `einstellungen.json` gespeichert.
