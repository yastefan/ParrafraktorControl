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

Der Server liefert den gebauten Client selbst aus: http://<rechner>:8080. Einstellungen und die zuletzt eingestellten Parameter liegen in `daten/`. Presets liegen in `daten/presets.json`. Nach einem Neustart ist der Output immer aus, es fährt also zuerst die MA.

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
│Pattern ›│Presets ›│Impulse ›│ Seite › │   │  Platz  │  Platz  │  Platz  │  Platz  │
├─────────┼─────────┼─────────┼─────────┤   ├─────────┼─────────┼─────────┼─────────┤
│ Ordnung │Elemente │  Pause  │ Output  │   │‹ Zurück │  Platz  │  Platz  │ Seite › │
└─────────┴─────────┴─────────┴─────────┘   └─────────┴─────────┴─────────┴─────────┘

Impulse (Live-Seite)
┌─────────┬─────────┬─────────┬─────────┐
│Flash auf│Flash zu │  Loch   │  Iris   │
├─────────┼─────────┼─────────┼─────────┤
│‹ Zurück │Elemente │ Regler  │Symmetr. │
└─────────┴─────────┴─────────┴─────────┘
```

| Bedienteil | Funktion |
|---|---|
| Pattern › | Grundbewegung direkt wählen |
| Presets › | Tippen ruft ab, **Halten** (0,8 s) speichert den aktuellen Look (2 Seiten à 6) |
| Seite › | nächste Reglerseite, darunter ihr Name |
| Ordnung, Elemente | nächste Stufe der Verteilung (gedämpft, wenn die Grundbewegung sie nicht nutzt) |
| Impulse › | obere Reihe wählt die Art (löst nichts aus); Elemente schaltet die Element-Folge, Regler die Drehregler-Seite (Hülle: Attack, Sustain, Release, Stärke; Lauf: Ausbreitung, Breite, Versatz), Symmetrisch schaltet die Spiegelung |
| Touchstreifen im Impulse-Menü | **Tippen** = gewählte Art von dieser Stelle aus, **Wischen** = sie läuft in Wischrichtung durch |
| Output | **gedrückt halten** (0,6 s): App fährt die Spiegel an bzw. gibt an die MA ab |
| Drehregler | Seiten je nach Grundbewegung, nur mit Reglern, die sie benutzt: **Bewegung** (Offset, Amplitude, Speed und Wellen bzw. Wiederkehr bzw. Wellenlänge; beim Sinus auf der zweiten Seite Breite und Speed bis), **Verteilung** (Ordnung, Elemente, Fächer, Gegenlauf), **Fein** (Group, Ping-Pong). Leere Seiten fallen weg, bei Ruhe bleibt nur Offset. Schalter: rechts drehen = an, drücken = umschalten |
| Regler drücken / Streifen antippen | Vorgabewert (außer im Impulse-Menü) |
| Touchstreifen wischen | Reglerseite wechseln (außer im Impulse-Menü) |

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

## Pattern und Regler

Ein Pattern ist die Grundbewegung, die dauerhaft läuft:

- **Sinus**: die klassische Welle.
- **Pendelwelle**: Jeder Spiegel schwingt etwas schneller als sein Vorgänger, wie bei einer Pendelwelle aus echten Pendeln. Die Reihe läuft aus dem Gleichlauf in Schlangen und scheinbares Chaos und wieder zusammen, wenn der erste Spiegel so oft geschwungen hat, wie **Wiederkehr** sagt (dann hat jeder folgende einen Schwung mehr geschafft). Speed ist das Tempo des ersten Spiegels und beschleunigt das ganze Bild; je kleiner die Wiederkehr, desto schneller laufen die hinteren Spiegel. Startet beim Wählen im Gleichlauf.
- **Wind**: Böen ziehen entlang der Ordnung durch die Spiegel und verändern sich dabei langsam, wiederholt sich nie. **Wellenlänge** = wie viele Spiegel eine Böe breit ist, Speed = Tempo (eine Wellenlänge je Durchlauf).
- **Rotation**: endlos über TiltRotate. **Phase** dreht die Spiegel gegeneinander versetzt, **Breite** lässt jeden Spiegel eine Umdrehung in Schüben machen und dann stehen, **Fächer** staffelt die Drehzahl entlang der Ordnung, **Group** wiederholt das Muster in Gruppen, **Gegenlauf** dreht die linke Hälfte andersherum. TiltRotate kennt nur eine Drehzahl, deshalb rechnet die App den Winkel nur mit: Am echten Aufbau kann er abweichen. Die Breite kann nicht kleiner werden, als die Einstellung „TiltRotate max.“ erlaubt: bei 10 U/min und 3 BPM etwa 56 %.
- **Öffnung**: für den Aufbau hintereinander. Ein Loch wandert durch alle drei Elemente: Jedes Element öffnet nur einen Schlitz, die drei Schlitze kreuzen sich im Loch. **Bahn** = Kreis, Linie (waagrecht), Iris (geht in der Mitte auf und zu) oder Drift (zieht frei umher). **Größe** = Radius, **Weite** = wie weit es wandert (Iris: um so viel geht es auf), **Kante** = hart bis weich, **Wabern** = atmet, driftet und verformt sich, **Nachlauf** = die Elemente laufen einander nach, das Loch wird schief und geht zu und auf. Offset, Amplitude, Phase und Verteilung gelten hier nicht; zu = 0°, offen = 90°. Die Rechnung nutzt die Drehung aus Einstellungen → Aufbau, die muss also zum echten Aufbau passen. Wandert das Loch weit nach außen (ab etwa 37 cm), blitzen an den Spitzen des gedrehten Elements kleine Dreiecke auf, weil dort nur dieses eine Element abdeckt.
- **Ruhe**: alle Spiegel stehen auf Offset, nur Impulse bewegen sie.

Alle Formen fahren ohne Sprünge an und ab; ein Wechsel der Form blendet über die eingestellte Überblendzeit über. Regler, die eine Form nicht benutzt, blendet der Client aus.

| Regler | Wirkung |
|---|---|
| Offset | Grundstellung. Mit dem Schloss 🔒/🔓 je Element einstellbar |
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
| Gegenlauf | linke Hälfte jedes Elements gespiegelt, auch der Offset (Offset 30° = links −30°, rechts +30°) |
| Ping-Pong | Muster läuft hin und wieder zurück |

Ältere Dateien werden beim Laden umgewandelt: Symmetrie von innen/außen = Ordnung Mitte → außen bzw. außen → Mitte mit Gegenlauf, Richtung zurück = rechts → links, Reihenfolge „je Element“ = Elemente zusammen, „alle 36“ = vorn → hinten. Symmetrie über alle 36 Spiegel gibt es nicht mehr, die Mitte ist jetzt die Mitte jedes Elements. Dreieck und Rechteck sowie die früheren Formen Sägezahn, Puls, Flyout, Blinder und Funkeln werden zum Sinus (ein Flyout spielt man jetzt als Impuls mit Ausbreitung).

## Impulse

Live-Ereignisse über dem laufenden Pattern, wie Flash-Tasten am Lichtpult. Oben wählt man die **Art**, ausgelöst wird auf dem **Streifen** (Touchstreifen am Stream Deck, Streifen im Client): **Tippen** startet den Impuls an dieser Stelle, **Wischen** lässt ihn vom Rand in Wischrichtung durchlaufen. Danach läuft die Hüllkurve von selbst ab.

- **Flash auf / Flash zu**: Spiegel auf einen festen Tilt. „Auf“ für Licht von hinten, „Zu“ für Licht von außen.
- **Loch**: Alle Spiegel schließen sich bis auf ein Loch, wie bei der Grundbewegung Öffnung: Getippt geht es an dieser Stelle auf (waagrecht, in der Bildmitte), gewischt fährt es quer durchs Bild. **Größe** ist sein Radius. Am besten mit dem Aufbau hintereinander in der Ansicht Bühne zu sehen.
- **Iris**: wie Loch, wächst aber mit der Hüllkurve aus einem Punkt und schrumpft wieder.
- Winkel unter Einstellungen → Impulse: Flash auf/zu (Platzhalter 90° und 0°).
- **Hüllkurve**: Attack (hin), Sustain (bleiben), Release (zurück), Stärke. Im Client die Punkte ziehen: oben links = Attack und Stärke, oben rechts = Ende des Sustain, unten = Ende des Release. Während eines Impulses läuft ein Punkt auf der Kurve mit.
- **Element-Folge**: zusammen, vorn → hinten oder hinten → vorn, mit Element-Versatz. Element 1 ist vorn.
- **Stärke**: wie weit zum Ziel (auch als Griff in der Hüllkurve).
- **Breite**: Getippt wirkt der Impuls nur auf so viele Spiegel um den Startpunkt („alle“ = ganzes Element). Gewischt läuft er immer durch das ganze Element.
- **Symmetrisch**: Der Impuls startet zugleich am gespiegelten Punkt, die linke Hälfte ist gespiegelt wie beim Gegenlauf (Flash-Winkel und Ausschlag umgekehrt).
- **Ausbreitung**: Zeit, bis der Impuls ein Element durchquert hat. Aus = alle Spiegel zugleich. Bei Loch und Iris: Zeit, die das gewischte Loch quer durchs Bild braucht (aus = die ganze Hüllkurve lang).
- Mehrere Impulse dürfen sich überlagern; der zuletzt gestartete liegt oben.

Art, Hüllkurve, Element-Folge, Ausbreitung, Breite und Symmetrie werden in `daten/impuls.json` gespeichert. Ideen stehen in [docs/konzept-bewegung.md](docs/konzept-bewegung.md).

## Oberfläche

Der Client passt ab etwa 1000 × 620 Punkten ohne Scrollen auf eine Fläche, darunter stehen die Module untereinander und es darf gescrollt werden. Module: Vorschau, Pattern, Presets, Bewegung, Verteilung (bei der Öffnung: Bahn) und unten das Impulsband. Unter **Mehr** am Impulsband liegen Element-Folge, Versatz sowie Attack, Sustain und Release.

**Fader** verstellen relativ: Antippen ändert nichts, erst Ziehen verändert den Wert, damit in der Show nichts springt. Doppeltippen auf den Namen setzt den Vorgabewert. Der Knopf **3×** am Offset teilt ihn in je einen Fader pro Element, **1×** führt ihn wieder zusammen.

## Vorschau

Die Vorschau im Client rechnet mit derselben Engine wie der Server. Wie sie aussieht, hängt vom Aufbau ab (Einstellungen → Aufbau):

- **nebeneinander**: Draufsicht, jeder Spiegel als Strich.
- **hintereinander, gedreht** (wie „Classic“ in der Simulation, Vorgabe vorn 0°, Mitte 45°, hinten 90°): Vorderansicht durch alle drei Elemente, rechts jedes Element einzeln. Die Spitzen des gedrehten Elements dürfen dabei über den Bildrand ragen. Unten links schaltet man um: **Spiegel** zeigt die Spiegel mit Gegenlicht, **Bühne** hart in Schwarz und Weiß nur das Licht, das von hinten durch alle drei Lagen kommt, **Wärmebild** dasselbe Licht unscharf in Falschfarben, also die Form, die man aus der Entfernung wahrnimmt. Die Wahl merkt sich jedes Gerät selbst.

Der Aufbau betrifft nur die Vorschau, nicht die Ausgabe an die Spiegel.

Im Kopf der Vorschau schaltet man zwischen **Simple** (die Ansicht nach Aufbau, siehe oben), **Phaser** und **Reflexion** um. Der Phaser zeigt wie der Phaser-Editor der grandMA3 jeden Spiegel als Punkt: waagrecht seine Lage (Element 1–3, je 12 Spiegel), senkrecht seinen Winkel. Dahinter zieht eine kurze Spur die letzte Bewegung nach, die Achse wächst mit dem größten Ausschlag. Unter jedem Element steht es von oben wie in Simple, jeder Spiegel als Strich unter seinem Punkt. **Reflexion** zeigt wie die Website-Simulation den Raum von oben, nur einfacher: die Elemente nebeneinander und ein Scheinwerfer, den man mit dem Finger verschiebt (er zielt immer auf die Mitte; unten links ein Fader für den Zoom, 4–120° Öffnungswinkel), die Strahlen werden an den Spiegeln reflektiert (bis zu dreimal, Rückseiten schlucken) und leuchten auf den Wänden. Auch diese Wahl merkt sich jedes Gerät.

## Presets

12 Plätze für Looks: Pattern, Offset, Amplitude, Speed von/bis, Phase, Breite, Group und Reihenfolge (nicht Pause). Abrufen blendet über die eingestellte Überblendzeit von der aktuellen Stellung in den neuen Look, damit die Motoren nicht springen. Im Client: Tippen ruft ab, Halten speichert, unter „Bearbeiten“ umbenennen und löschen.

**Auto** fährt die ausgewählten Presets der Reihe nach ab. Unter „Auswahl“ legt man per Tippen fest, welche mitlaufen (die Marke oben rechts zeigt es), und stellt zwei Zeiten ein: **Überblenden** ist die Dauer des Übergangs, **Halten** die Zeit, die der Look danach steht. Solange Auto läuft, leuchtet der Rahmen des Moduls Presets und daneben steht die Restzeit. Auto braucht mindestens zwei Presets. Es schaltet den Output nicht ein oder aus und startet nach einem Neustart immer aus. Sobald man den Look von Hand verändert oder ein Preset abruft, endet Auto; die Pause hält es nur an. Am Stream Deck gibt es Auto noch nicht, dort beendet ein Preset-Abruf oder ein Regler es aber ebenfalls.

## Ausgabe und Output

Im Einstellungsmenü lassen sich Art-Net, sACN und (später) RS485 einzeln einschalten, jeweils mit Ziel-IP und Netzwerkkarte.

- **sACN** sendet mit Priority 150, die MA mit 100. Beim Abgeben schickt die App „Stream Terminated“ und der Node fällt sofort auf die MA zurück. Der Node muss dafür sACN-Priority auswerten.
- **Art-Net** hat keine Priority. Läuft die MA parallel, entscheidet der Merge im Node. Beim Abgeben hört die App nur auf zu senden.
- **Überblendung**: Beim Übernehmen und Abgeben blendet die App über die eingestellte Zeit von bzw. zur Stellung der MA. Die liest sie im Netz mit (sACN-Multicast oder Art-Net-Broadcast). Empfängt sie nichts, springen die Spiegel.
