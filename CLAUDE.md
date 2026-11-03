# ParrafraktorControl

Plattformunabhängige Steuerung (macOS, Windows, Raspberry Pi) für den **Parrafraktor**, eine Lichtinstallation von Friedrich Gobbesso: 3 Elemente × 12 drehbare Spiegel = 36 Spiegel, Schrittmotoren, DMX. Ein Node-Server rechnet die Pattern der Website-Simulation und sendet per Art-Net/sACN (später RS485 am Pi). Bedienung: Stream Deck+ am Server-Rechner, PWA auf dem iPad, später MIDI/OSC.

Sprache im Projekt: Deutsch (Bezeichner, Kommentare, UI, Doku) – wie in der Simulation und der ESP32-Remote. Bedienung und Aufbau für Menschen stehen in der README.

## Befehle

- `npm run dev` – Server (tsx watch, Port 8080) + Vite (Port 5173, Proxy für `/ws`)
- `npm test` – Vitest: Engine gegen Simulation, Pakete, Übernahme
- `npm run typecheck`, `npm run build`, `npm start` (gebauter Server liefert `client/dist` aus)
- `npm run icons` – App-Icons nach `client/public`

## Aufbau (npm-Workspaces, ESM, TypeScript strict)

- `packages/engine` – Pattern-Engine (`Engine`, `MODI`, `Parameter`) und DMX-Abbildung (`schreibeUniversen`, `leseStellungen`). Ohne Abhängigkeiten, läuft auch im Browser für die Vorschau. **Muss identisch zu `parrafraktor.js` rechnen**; Test vergleicht mit `test/referenz.json` (erzeugt von `scripts/referenz-erzeugen.mjs`).
- `packages/protokoll` – `BEREICHE` (Wertebereiche aller Parameter, eine Quelle für Client/Stream Deck/MIDI), `Einstellungen` + `pruefeEinstellungen`, WebSocket-Nachrichten.
- `server/src`
  - `steuerung.ts` – zentraler Zustand + Aktionen (`waehlePattern`, `verstelle`, `vorgabe`, `setzeUebernahme`, …), Ereignis `aenderung`. Alle Bedienungen gehen nur hierüber.
  - `takt.ts` – 40 Hz, Übernahme-Zustandsmaschine (`aus → blendetEin → an → blendetAus`), sendet nur während Übernahme.
  - `ausgabe/` – Schnittstelle `Ausgabe` (`sende`, `gibFrei`, `schliesse`, `status`); Art-Net, sACN, RS485-Platzhalter. Werden bei jeder Einstellungsänderung neu erzeugt.
  - `eingabe/` – Schnittstelle `Eingabemodul`; Stream Deck+ (`streamdeck/`, Belegung in `belegung.ts`), MIDI/OSC als Platzhalter. Neue Module in `index.ts` eintragen.
  - `mitlesen.ts` – empfängt die MA (sACN/Art-Net) für die Überblendung.
  - `web/server.ts` – statische Dateien (Cache-Header für PWA) + WebSocket `/ws`.
- `client/src` – Preact. `verbindung.ts` (Reconnect, Zombie-Erkennung), `laden.ts` (Stand + optimistische lokale Werte), `vorschau.ts` (lokale Engine, per `takt` synchronisiert), `teile/`.

Workspace-Pakete werden im Entwicklungsbetrieb über die Export-Bedingung `source` direkt aus `src` geladen (tsconfig `customConditions`, Vite/Vitest `resolve.conditions`, `tsx --conditions=source`); der Build nutzt `dist` (`tsconfig.build.json`).

## Hardware und Patch

grandMA3-Fixture „Gobbesso Parrafraktor“, Mode Standard, **37 Kanäle je Element** (vom User bestätigt). Je Spiegel i (0–11): Kanal 3i+1/3i+2 Tilt 16 Bit −180…+180°, 3i+3 TiltRotate 8 Bit (0x7F steht, 0/255 volle Drehung), Kanal 37 Dimmer (nur 3D-Preview der MA, wird auf 255 gesetzt). Universe/Adressen im Einstellungsmenü, Vorgabe Universe 1, Adressen 1/38/75. Tilt außerhalb ±180° wird begrenzt, nicht umgebrochen.

## Entscheidungen

- **Ausgabe**: Art-Net (Vorgabe, auf Wunsch des Users) und sACN (Priority 150, MA 100, Stream Terminated beim Abgeben) als umschaltbare Module; beide Pakete selbst gebaut (`node:dgram`), keine Bibliothek. Art-Net hat keine Priority – sauberes Zurückfallen auf die MA nur mit sACN.
- **Output** (intern „Übernahme“) startet nach jedem Serverneustart aus. Am Stream Deck und im Client nur durch **Halten** (600 ms). Am Stream Deck nur im Hauptmenü (Wunsch des Users).
- **Stream Deck**: Hauptmenü mit Untermenüs Pattern und Presets, dort unten links Zurück, unten rechts Seite (`belegung.ts`).
- **Presets** (`protokoll/presets.ts`): 12 Look-Presets (Parameter ohne `laeuft`), in `daten/presets.json`. Abrufen blendet über `ueberblendungS` von der festgehaltenen aktuellen Stellung in den neuen Look (Takt `appStellungen`, Vorschau `blenden`).
- **Überblendung** (Einstellung, 0–10 s, Vorgabe 2 s) von/zur Stellung der MA, die mitgelesen wird; ohne Mitlesen wird gesprungen.
- **TiltRotate**: `rotateMaxUpm` = U/min bei DMX 0/255, Platzhalter 10 (bewusst langsam), Regler im Einstellungsmenü.
- **Vorschau-Aufbau** (`einstellungen.aufbau`): nebeneinander (Draufsicht) oder hintereinander mit Drehung je Element (Vorderansicht mit Modus Spiegel/Licht, Modus pro Gerät in `localStorage`). Nur Darstellung, Reihenfolge bleibt eigener Parameter.
- **Ausgaben neu starten** nur bei Änderung von Art-Net/sACN/RS485/Patch (sonst gäbe sACN kurz an die MA ab).
- **IP-Konfiguration** im Einstellungsmenü (Ziel-IP, Netzwerkkarte je Ausgabe); die IP des Rechners selbst stellt die App nicht ein.
- **Pattern = Grundbewegung**, alles andere sind Regler (Konzept `docs/konzept-bewegung.md`): Sinus, Pendelwelle (Spiegel schwingt mit Speed × (1 + platz/schwuenge): nach `schwuenge` Schwüngen des ersten wieder Gleichlauf, Speed beschleunigt das ganze Bild; startet im Gleichlauf), Wind (Gradientenrauschen, das entlang der Ordnung zieht: `rauschen(platz/wellenlaenge − umlaufVon, 0.4·umlaufVon)`, eine Lage – zwei Lagen ohne Zug waren dem User zu chaotisch), dazu noch Sägezahn/Puls/Flyout/Blinder/Funkeln (sollen Impulse werden) und Rotation. **Verteilung** (`auswahl` in `pattern.ts`): Ordnung innerhalb des Elements (links, rechts, mitteAussen, aussenMitte, verschachtelt, zufall), dann Element-Folge (zusammen = früher „je Element“, vorneHinten = früher „alle 36“), dann Group; Gegenlauf (linke Hälfte jedes Elements gespiegelt), Ping-Pong, Fächer. Symmetrie/Richtung/Reihenfolge sind darin aufgegangen (Wunsch des Users); `migriereParameter` wandelt alte Dateien. Offset je Element über `offsetGetrennt` + `offsetElemente` (Schloss im Client, Stream Deck noch nicht). `benutzt(modus, regler)` blendet im Client unbenutzte Regler aus. **Weiche Bewegungen**: alle Formen ohne Sprünge, `weich` quintisch. Formwechsel blendet wie Presets. Website-Simulation rechnet gleich (ohne Offset je Element); Referenztest setzt den Umlauf je Spiegel direkt und vergleicht nur die Form.
- **Impulse** (`engine/impuls.ts`, Konzept in `docs/konzept-bewegung.md`): Flash auf/zu wie Flash-Tasten am Pult, Hüllkurve Attack/Hold/Release/Stärke, Element-Folge mit Versatz (Element 1 = vorn, Release in derselben Folge). Liegen über dem Look (nach Preset-Blende), unter der Output-Überblendung; Vorschau rechnet sie lokal mit `alterS` aus dem Stand weiter. Steuerung hält sie mit Quelle (`ws<n>:ziel`, `streamdeck:<taste>`); Verbindungsabbruch lässt los. Winkel in `einstellungen.flash`, Hüllkurve in `daten/impuls.json`. Stream Deck: Hauptmenü-Taste 4 ist „Impulse ›“, 3 „Elemente“, 5 „Ordnung“; Drehregler-Seite 3 mit Schaltern. Website-Simulation kennt keine Impulse.
- **Pattern-Engine** wie Simulation; Fokus entfällt. Bewusste Abweichung: Umlauf je Spiegel statt zwei Zählern (von/bis). Sind alle Speeds gleich, laufen die Spiegel weich wieder zusammen (`GLEICHLAUF_S`). In der Simulation bleibt nach „Speed bis“ ein fester Versatz zurück (Fehler dort). Rotation läuft über TiltRotate, Tilt bleibt auf Offset.
- **Client**: PWA, Service Worker (`registerType: "prompt"`, kein Auto-Reload in der Show). Server schickt immer den vollständigen Stand (bei Änderung, sonst jede Sekunde) – kein Nachholen nach Abbruch nötig. Offline-Cache auf dem iPad braucht HTTPS (mkcert, siehe README).
- Stream Deck: `@elgato-stream-deck/node` + `@napi-rs/canvas` als `optionalDependencies`, dynamisch geladen; fehlen sie, läuft der Server ohne.

## Quellen

- Projektbeschreibung: `/Users/stefanschmidt/Projects/WebsiteKlaus/src/projekte/Parrafraktor/index.md`
- Simulation: `/Users/stefanschmidt/Projects/WebsiteKlaus/src/js/parrafraktor.js` (`auswahl`, `laufzeit`, `pattern`, `schleife`)
- MA-Fixture: `/Users/stefanschmidt/Downloads/Gobbesso@Parrafraktor@0001.xml`
- ESP32-Remote (gleiche Engine in C++, sACN, Übernahme): `/Users/stefanschmidt/Projects/Parrafraktor-Remote/`

## Offen

- Echte Drehzahl von TiltRotate und Verhalten der Spiegel-Firmware bei Tilt während/nach TiltRotate.
- Art-Net vs. sACN im echten Aufbau: Was sendet die MA, kann der Node Priority/Merge?
- RS485 am Pi (UART, Break), MIDI- und OSC-Modul.
- `npm audit`: kritische Meldung in `tinypool` (nur Dev-Abhängigkeit von Vitest).
