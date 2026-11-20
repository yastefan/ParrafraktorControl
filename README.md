# ParrafraktorControl

Steuer-App für den Parrafraktor, eine Lichtinstallation von Friedrich Gobbesso aus drei Elementen mit je zwölf drehbaren Spiegeln. Ein Server auf einem Mac, Windows-PC oder Raspberry Pi rechnet dieselben Pattern wie die Simulation auf der Website und sendet die Spiegelstellungen per Art-Net oder sACN an den DMX-Node. Bedient wird er über ein Elgato Stream Deck+ am selben Rechner oder über eine Web-App (PWA) auf dem iPad. Die grandMA3 kann parallel im Netz bleiben und fährt wieder, sobald man den Output der App ausschaltet.

## Aufbau

```
packages/engine      Pattern-Engine und DMX-Abbildung (ohne Abhängigkeiten, läuft im Server und im Browser)
packages/protocol    gemeinsame Typen: Parameter-Bereiche, Einstellungen, WebSocket-Nachrichten
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
| Output halten, Order dazu, 2 s | nur auf dem Pi mit Netz-Menü: Code-Eingabe, siehe [Network menu](#network-menu-on-the-stream-deck-pi-only) |

### Raspberry Pi as controller

*This section is in English, like everything around the Pi (the rest of the README follows).* What differs between Mac, Windows and Pi is in [docs/platforms.md](docs/platforms.md).

A Raspberry Pi 4 with an SD card runs as a stand-alone device, also without a grandMA3 (e.g. in an exhibition). Goal: it starts reliably, even when someone simply pulls the power. So the system is write-protected (overlay file system in RAM), only a small data partition for presets and settings is writable, and the server writes there with `fsync` and a backup copy (`*.bak`).

| Part | How |
|---|---|
| System | Raspberry Pi OS Lite 64 bit (Trixie, as of October 2026: image from 2026-10-06, kernel 6.18); Node 24 from the NodeSource apt repository, because the Stream Deck needs Node ≥ 22.18 and Debian only has Node 20 |
| Write protection | `raspi-config nonint do_overlayfs 0`: root via `overlayroot=tmpfs:recurse=0` in `cmdline.txt` (recurse=0, otherwise overlayroot also puts `/daten` into RAM), boot partition `ro` in `/etc/fstab`, module `overlay` in every initramfs ([raspi-config#306](https://github.com/RPi-Distro/raspi-config/issues/306)) |
| Data | partition 3, ext4 (`data=journal,commit=5`), label `pfdaten`, mounted at `/daten`, `PARRAFRAKTOR_DATEN=/daten/parrafraktor` |
| Logs | journald in RAM only (`Storage=volatile`), no swap file, no apt timers, cloud-init off after setup |
| Service | `parrafraktor.service`, `Restart=always`, never gives up |
| Watchdog | hardware watchdog of the BCM2711 (at most about 16 s), systemd `RuntimeWatchdogSec=15` |
| Stream Deck | udev rule for the group `plugdev`, the service runs without root |
| Network | fixed IP in the lighting network via NetworkManager (connection `lichtnetz`) |
| Wi-Fi | optionally an own Wi-Fi for the iPad (access point, connection `parrafraktor-ap`, DHCP via NetworkManager) |
| Update | `parrafraktor update`: one step, continues across reboots (`parrafraktor-update.service`, state and log on `/daten`) |
| RS485 | nothing set up yet; the user is already in `dialout`, the serial port stays untouched |

**1. Prepare the card (on the Mac)**

1. Write "Raspberry Pi OS Lite (64-bit)" with the Raspberry Pi Imager. In its settings set hostname (e.g. `parrafraktor`), user, SSH and, for the setup, a Wi-Fi with internet.
2. **Before the first boot**: the boot partition shows up on the Mac as drive `bootfs`. In `cmdline.txt` delete the word `resize` (the file stays one line). Otherwise the Pi grows the system partition to the whole card on the first boot and there is no room for the data partition. If you forgot, the setup script stops with a hint; then flash again.

**2. Set up (on the Pi, with internet)**

```bash
sudo apt-get update && sudo apt-get install -y git
```

```bash
git clone https://github.com/yastefan/ParrafraktorControl.git && cd ParrafraktorControl
```

The service runs as this user straight from the cloned directory (the commands below assume the home directory).

The service serves HTTP on port 80, so the bare address (e.g. `192.168.4.1`) works in every browser. Optionally copy the certificates (see above) to `zertifikate/` first; then it also serves HTTPS on port 8443 – for the iPad app with offline cache (`https://192.168.4.1:8443`). Deliberately not 443: Firefox and Chrome try HTTPS on 443 first for typed addresses and would get stuck at the certificate instead of falling back to HTTP. Fill in IP and prefix for the lighting network:

```bash
sudo pi/setup.sh --ip 2.0.0.50/8
```

For an own Wi-Fi for the iPad, add name and password (8–63 characters):

```bash
sudo pi/setup.sh --ip 2.0.0.50/8 --ap-ssid Parrafraktor --ap-password 'secret-password'
```

`--net-code NNNN` adds the [network menu on the Stream Deck](#network-menu-on-the-stream-deck-pi-only).

The iPad then finds the app at https://192.168.4.1:8443 or http://192.168.4.1 (`--ap-address`, default `192.168.4.1/24`) or at parrafraktor.local. Default is 5 GHz on channel 36, usually quieter in rooms with many networks; `--ap-band bg` uses 2.4 GHz (channel 6), which reaches further and through walls. The country code (`--country`, default DE) sets the allowed channels. The Pi's Wi-Fi chip cannot be an access point and join another Wi-Fi at the same time: the Wi-Fi used for the setup stays saved but only comes back while the access point is off (`parrafraktor hotspot off`; `parrafraktor update` does that by itself). Nothing is forwarded into the lighting network. For HTTPS, include the access point's address in the `mkcert` call (e.g. `192.168.4.1`).

The script grows the system partition to 8 GiB (`--root-gb`), creates the data partition with 1 GiB behind it (`--data-mb`), installs Node, builds the app, sets up service, watchdog, logs, udev, network and the update unit, and finally turns the write protection on. With `--gateway` the lighting network gets a default route, otherwise internet stays with the Wi-Fi. Running it again does no harm. The options are saved (`/etc/parrafraktor/setup.conf`, root only); the old German option names still work. Then:

```bash
sudo reboot
```

```bash
parrafraktor check
```

This shows whether overlay, data partition, service, watchdog, logs and Stream Deck are right.

**The command `parrafraktor`**: the setup creates it so nobody has to remember single commands. Without an argument it opens a menu (like `raspi-config`) that shows protection (now and after the next reboot), own Wi-Fi and the last update; `parrafraktor help` lists all commands. What needs root asks for sudo by itself. The old German commands (`schreibschutz an`, `pruefen`, …) still work.

| Command | What |
|---|---|
| `parrafraktor` | menu |
| `parrafraktor status` | overview: protection now/after reboot, data, service, Wi-Fi, addresses, version, last update |
| `parrafraktor check` | all checks; fails if the protection is off, the overlay module is missing or the last update failed |
| `parrafraktor update` | everything in one go, see below |
| `parrafraktor update abort` | forget an update that got stuck (leaves the protection as it is) |
| `parrafraktor protect on` / `off` | write protection on/off for good (reboots; `--no-reboot` to reboot later) |
| `parrafraktor hotspot off` / `on` | own Wi-Fi off, so the Pi joins the saved Wi-Fi with internet / on again |
| `parrafraktor log` | follow the service log (`log update`, `log network` for update and network) |
| `parrafraktor restart` | restart the service only |
| `parrafraktor setup` | run the setup again, without options with the ones from last time |

#### Network menu on the Stream Deck (Pi only)

With `--net-code NNNN` at setup (four digits 1–8) the Stream Deck has a network menu – without a computer, even when Wi-Fi or LAN are set wrong. Give the code only at setup, never write it into the repository.

1. In the main menu press and hold **Output**, within 0.6 s add **Order**, hold both for 2 s. Output does not switch and Order does not advance; both keys show "Network · hold …".
2. Enter the code with the keys: top left 1 … top right 4, bottom left 5 … bottom right 8. The strip shows the input as dots. Wrong code or 10 s without input: back to the main menu.
3. In the menu:

```
┌──────────┬──────────┬──────────┬──────────┐
│  WLAN    │  LAN     │  Mask    │  Apply   │
├──────────┼──────────┼──────────┼──────────┤
│‹ Back    │  Reset   │ LAN now  │ WLAN now │
└──────────┴──────────┴──────────┴──────────┘
```

| Control | Function |
|---|---|
| WLAN | own Wi-Fi on/off |
| LAN | **DHCP** (if no DHCP server answers within 15 s, the fixed IP applies) or **fixed IP** |
| Mask | netmask /8, /16, /24 |
| Encoders | one each for the four numbers of the fixed IP (turn fast: steps of ten), press: number as saved |
| Apply | applies the draft (lights up when there are changes) |
| Reset | discard the draft |
| LAN now, WLAN now | current state: address of the LAN port (or "no cable"), Wi-Fi on/off |

Saved in `/daten/parrafraktor/netz.json`; at boot `parrafraktor-netz.service` applies the settings again, because the write protection discards changes to the system otherwise. They are applied by `/usr/local/sbin/parrafraktor-netz` (from `pi/network.sh`), which the service may call via sudo – only this one program. If the lighting network changes, check the target IP of Art-Net/sACN in the app's settings menu.

**3. Exhibition without MA**: in the app's settings menu under **Autostart** turn on "Autostart output", if needed also "Autostart Auto" (see [Ausgabe und Output](#ausgabe-und-output)).

**Updates**: one command does everything and continues across reboots by itself:

```bash
parrafraktor update
```

1. protection off, reboot (skipped if the system is writable already),
2. own Wi-Fi off, so the Pi joins the saved Wi-Fi with internet (or internet via a LAN cable with gateway),
3. apt full-upgrade, `git pull`, then `pi/setup.sh --refresh` with the saved options: packages (`pi/packages.sh`), `npm ci`, build, service, watchdog, network menu, update unit – partitions and network connections stay untouched,
4. overlay module into every initramfs, protection on, reboot,
5. check that the protection is really active (root is `overlay`; if not: rebuild the initramfs and reboot once more), own Wi-Fi on, service running.

An SSH session over the own Wi-Fi drops at step 2; that does not matter, the update runs as `parrafraktor-update.service`. It takes about 10–20 minutes; it is done when the own Wi-Fi is back. State and log are on `/daten/.parrafraktor-update/` (journald is in RAM): `parrafraktor log update` follows it, `parrafraktor status` shows the result. If something fails (no internet, apt, `git pull`, build), the update still ends protected and with the own Wi-Fi on; after a failed build it rolls the repository back to the previous version and builds that. The error shows in `parrafraktor status`, the menu and `parrafraktor check`. Power loss in the middle: the update continues at the next boot (at most twice).

**Moving from the German tools** (Pis set up before 2026-11-20, once): the old Pi has no update unit yet, so `parrafraktor update` cannot continue across reboots there. Once by hand:

```bash
parrafraktor schreibschutz aus
```

```bash
git -C ~/ParrafraktorControl pull
```

```bash
parrafraktor update
```

The last one runs the new setup with the saved options (`/etc/parrafraktor/einrichten.conf` becomes `setup.conf`) and ends protected.

For maintenance by hand (other changes to the system): `parrafraktor protect off`, work, `parrafraktor protect on`. Everything changed outside `/daten` while the protection is on is gone after the next reboot.

**Checklist on the real device** (before the first exhibition):

1. Set up as above, `parrafraktor check` without errors.
2. Save presets, change settings, turn on Autostart output.
3. Pull the power several times during operation, also **right after saving a preset** (within a second) and while Auto is cross-fading.
4. With own Wi-Fi: the iPad reconnects by itself after every start and reaches the app.
5. With network menu: Wi-Fi off/on, LAN to DHCP (without DHCP server: fixed IP after about 15 s), another fixed IP – each still so after a reboot.
6. `parrafraktor update` from start to end, also with SSH over the own Wi-Fi: afterwards `parrafraktor status` shows protection ON/ON, own Wi-Fi on, the new version and "last one ok"; `parrafraktor check` is green.
7. After every start: presets and settings are there (the log `journalctl -u parrafraktor` may say "Sicherung … verwendet"), the Stream Deck runs, the output starts by itself, `parrafraktor check` is green.

Sources: [Raspberry Pi OS downloads](https://www.raspberrypi.com/software/operating-systems/), [Raspberry Pi documentation: configuration (overlay file system)](https://www.raspberrypi.com/documentation/computers/configuration.html), [raspi-config, branch trixie (`do_overlayfs`)](https://github.com/RPi-Distro/raspi-config/blob/trixie/raspi-config), [raspi-config#306 (overlay missing after kernel update)](https://github.com/RPi-Distro/raspi-config/issues/306), [raspberrypi-sys-mods, branch pios/trixie (`resize_early`, `rpi-resize.service`)](https://github.com/RPi-Distro/raspberrypi-sys-mods/tree/pios/trixie), [forum: resize on Trixie](https://forums.raspberrypi.com/viewtopic.php?t=395602), [systemd-system.conf (watchdog)](https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html), [Linux driver bcm2835_wdt](https://github.com/torvalds/linux/blob/master/drivers/watchdog/bcm2835_wdt.c), [NetworkManager: nmcli settings (wifi, `ipv4.method shared`)](https://networkmanager.dev/docs/api/latest/nm-settings-nmcli.html), [white paper "Making a more resilient file system"](https://pip.raspberrypi.com/documents/RP-003610-WP-Making-a-more-resilient-file-system.pdf), [Debian: nodejs in Trixie](https://packages.debian.org/trixie/nodejs), [NodeSource distributions](https://github.com/nodesource/distributions), [trixie-feedback#75](https://github.com/raspberrypi/trixie-feedback/issues/75).

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
