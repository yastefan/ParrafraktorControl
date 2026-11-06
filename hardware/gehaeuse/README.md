# Tischgehäuse Stream Deck + und Raspberry Pi 4

Keilförmiges Tischgehäuse für FoH und Ausstellung im Innenraum oder trocken und ohne pralle Sonne. Das Deck sitzt 30° geneigt auf einem eigenen Bett, das die schrägen Originalgewinde nutzt und am Tastenrand zwei Haken gegen Aufhebeln hat. Der Pi liegt darunter.

**Stand: nur am Modell geprüft, nichts gedruckt und nichts an echter Hardware anprobiert.** Die Maße des Decks stammen aus Elgatos CAD-Modell. Zuerst nur `bett.stl` drucken und das Deck einsetzen.

![Zusammengebaut](bilder/montiert_vorn.png)
![Explosion](bilder/explosion.png)
![Innenleben ohne Korpus](bilder/innenleben.png)

Weitere Ansichten liegen in `bilder/`.

## Dateien

| Datei | Inhalt |
|---|---|
| `gehaeuse.scad` | Modell, alle Parameter oben |
| `teile/*.stl` | ein STL je Druckteil, in Drucklage |
| `pruefe.py` | exportiert die STL und prüft das Modell, schreibt `pruefbericht.txt` (braucht `openscad`, `numpy`) |
| `deck_aus_stp.py` | erzeugt `lokal/deck.stl` aus Elgatos STP für die Prüfung; `lokal/` kommt nicht ins Repo |
| `ansichten.sh` | rendert `bilder/` |

Nach jeder Parameteränderung ausführen:

```bash
python3 hardware/gehaeuse/pruefe.py
```

```bash
bash hardware/gehaeuse/ansichten.sh
```

## Vor dem ersten Druck

**Zuerst `bett.stl` drucken.** Es enthält Sitze und Haken, trägt also alles, was am Deck passen muss. Gewindeeinsätze noch nicht nötig: Deck mit dem Tastenrand unter die Haken schieben, Reglerrand absenken, Originalschrauben von unten von Hand eindrehen. Passt das, die übrigen Teile drucken.

Noch offen, in `gehaeuse.scad`:

| Maß | Parameter | Wert jetzt | Stand |
|---|---|---|---|
| Stecker des USB-Kabels | `usb_stecker_l` | 40 mm, Mulde am Deck etwa 15 × 9 mm | **Annahme**, eigenes Kabel messen; dicker Knickschutz passt nicht in die Mulde |
| Stecker am Pi | `stecker_*` | 30–45 mm | **Annahme** |
| Netzkabel | `kabel_d` | 5 mm | **Annahme** |
| Kühlkörper Pi | `kuehler_h` | 15 mm | **Annahme**, Kühler noch offen |
| Panel-Buchse | `neutrik_*` | Ø24, 19 × 24, Ø3,2 | aus der Neutrik-Zeichnung zu RRE8F-Z, **für NE8FDP noch prüfen** |
| Gewindeeinsätze | `einsatz_*_d` | Ø4,0 / Ø3,5 | **Annahme**, Bohrung des gekauften Einsatzes nehmen |
| Gewindetiefe | `sitz`, `loch_tiefe` | 5 mm Schraube im Gewinde | CAD: Sackloch 6,3 mm. **Originalschrauben nutzen, nichts Längeres** |

Maße des Decks aus [Elgatos STP-Modell](https://marketplace.elgato.com/product/render-asset-stream-deck-afa64cad-a62d-4962-be36-aa811310411c) (Version 1), vom User nachgemessen, soweit möglich:

| Maß | CAD | Gemessen |
|---|---|---|
| Breite × Höhe | 140,03 × 135,47 mm | 140 × 135 mm |
| Dicke, Rückplatte bis Rand | 29,37 mm | 29–30 mm |
| Lochabstand | 83 mm | 83 mm |
| Gewinde | Achse 49,7° zur Normalen der Rückplatte, Ø8-Dom, 21,24 mm vom Reglerrand | nicht messbar |
| USB-C | mittig auf der Rückplatte, 106,55 mm vom Reglerrand, Stecker senkrecht | |

Das CAD zeigt die Serie, nicht unbedingt dein Gerät; das Bett prüft es. Außerdem belegt: Gewicht 465 g und Schraube M3 × 0,5, 8 mm ([Elgato](https://help.elgato.com/hc/en-us/articles/10567379685901-Elgato-Stream-Deck-Technical-Specifications)), Lochbild und Buchsen des Pi 4 ([Raspberry Pi](https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-mechanical-drawing.pdf)), Bauraum 300 × 300 × 330 mm ([3DJake](https://www.3djake.com/prusa/core-one-l), Händlerangabe). Die Neutrik-Zeichnung steht bei [Mouser](https://www.mouser.com/datasheet/2/289/Neutrik_11_13_2024_2D_Drawing_RRE8F_Z_112S-3533102.pdf).

## Stückliste

Druckteile (PETG, zusammen etwa 670 g mit Haube, laut `pruefbericht.txt` überschlägig):

| Teil | Zweck |
|---|---|
| `korpus` | Keil mit Öffnung für das Bett |
| `boden` | Boden und Rückwand als ein Teil, trägt Pi, Ballast und Zugentlastung |
| `bett` | trägt das Deck: schräge Sitze, Rand, zwei Haken. Einzeln nachdruckbar |
| `einsatz_d` | Einsatzplatte mit Neutrik-D-Ausschnitt für Ethernet, für DMX ein zweites Mal |
| `einsatz_blind` | verschließt die RS485-Bucht bis zur Entscheidung |
| `zugentlastung` | Klemme fürs Netzkabel |
| `ballastdeckel` | hält den Ballast |
| `haube` | nur beim Publikum: deckt Stecker und Schrauben hinten ab, Kabel laufen unten heraus |

Kaufteile:

| Menge | Teil |
|---|---|
| 26 (+4 für RS485) | Gewindeeinsatz M3 × 5,7 |
| 4 | Gewindeeinsatz M2,5 |
| 2 | Originalschrauben des Deck-Fußes, dazu Kreuzschlitz-Dreher mit mindestens 100 mm Schaft |
| 4 | M3 × 10, Korpus zu Bett, Kopf innen |
| 6 | M3 × 10 Sicherheits-Torx: 4 Boden, 2 Rückwand oben |
| 4 | M3 × 14 Sicherheits-Torx für die Haube (ohne Haube M3 × 10) |
| 8 | M3 × 8, Einsatzplatten |
| 2 + 2 | M3 × 10 Zugentlastung, M3 × 8 Ballastdeckel |
| 2 | M3 × 10 mit Mutter für die Panel-Buchse |
| 4 | M2,5 × 6 für den Pi |
| 1 | Neutrik NE8FDP (etherCON, nimmt auch normales RJ45) |
| 1 | RJ45-Patchkabel 0,25 m, innen |
| 1 | USB-C auf USB-A, 0,5 m, Deck zu Pi (der USB-C des Pi 4 ist nur Strom; das Elgato-Kabel ist C auf C) |
| 1 | Offizielles Pi-4-Netzteil oder gleichwertig |
| 1 | Gummitülle für Ø14-mm-Loch, 4 mm Wand |
| 1 | Kühlkörper Pi 4, höchstens 15 mm |
| 1 | Flachstahl 130 × 20 × 15 mm, etwa 306 g |
| 4 | Gummifuß Ø12, 6 mm hoch (1 mm eingelassen) |
| 2 | M5-Schraube, Scheibe, Mutter für den Tisch (beim Publikum Pflicht) |
| 3 | Kabelbinder |
| optional | Lüfter 40 × 40 × 10 mm 5 V, dazu 4 × M3 × 16 mit Mutter |

## Drucken

PETG, 0,4-mm-Düse, 0,2 mm Schicht, 5 Wände, 25 % Gyroid, keine Stützen. Klebestift oder Trennmittel auf glattem Bett, damit PETG nicht ausreißt. Heller Filament, falls Sonne nicht ganz auszuschließen ist.

| Teil | Lage (STL ist schon so gedreht) |
|---|---|
| `korpus` | Montageplatte auf dem Druckbett, Öffnung oben |
| `bett` | Boden auf dem Druckbett. Die Haken haben 3 mm flachen Überhang, die Schraubenkanäle liegen knapp über 45°; danach nacharbeiten, falls etwas hängt |
| `boden` | Boden auf dem Bett, Rückwand steht. **Brücken** über den 44-mm-Buchten und im Lüftungsbereich, sind später von der Platte verdeckt; Brim empfohlen |
| `haube` | Rückseite auf dem Bett |
| Rest | flach |

Überhänge zeigt `pruefbericht.txt`. Die Flächen dort sind kurze Brücken und die Haken; ob sie sauber werden, zeigt erst der Druck.

## Montage

1. Einsätze mit dem Lötkolben setzen. Pi-Säulen und Fußtaschen ansehen, ob Grate stören.
2. Füße kleben. Ballast in die Wanne, Deckel drauf.
3. Pi mit Kühlkörper auf den Boden schrauben. Netzteilstecker von außen durch das Ø14-Loch führen, einstecken, Kabel mit der Zugentlastung klemmen, Tülle setzen.
4. Panel-Buchse in `einsatz_d`, Patchkabel zum Pi, Einsatzplatten verschrauben.
5. Beim Publikum: Boden mit den zwei M5-Schrauben auf den Tisch schrauben (Bohrungen im Boden, Abstand 90 mm in y).
6. Bett von innen auf den Korpus schrauben. Fuß vom Deck abschrauben. Deck mit dem Tastenrand unter die Haken schieben, Reglerrand absenken, die zwei Originalschrauben von innen durch die schrägen Kanäle eindrehen (Korpus noch ohne Boden, Dreher kommt von unten). Nur handfest, das Gewinde sitzt im Kunststoff oder Einsatz des Decks.
7. USB-Kabel in Deck und Pi stecken, mit den Kabelbindern an den Ösen führen, Schlaufe lassen.
8. Korpus senkrecht über den Boden stülpen, von unten vier Schrauben, hinten zwei.
9. Beim Publikum: Stecker einstecken, Haube mit vier Schrauben von hinten befestigen, Kabel unten herausführen und am Tisch sichern.

Für die SD-Karte muss der Korpus ab (Boden bleibt verschraubt), das ist gewollt.

## Entscheidungen

- **Neigung 30°:** flach genug für den Griff von oben im Stehen, am FoH sitzend noch lesbar. Parameter `neigung`; ändern verschiebt die Höhe. Nur am Modell beurteilt.
- **Keine Abdichtung:** laut User nur außerhalb der Regie. PETG reicht dort; es wird ab etwa 70 °C weich, deshalb nicht in die Sonne stellen. Das Deck selbst ist nicht wetterfest.
- **Haube statt verschraubter Buchsen allein:** Stecker und Schrauben hinten sind ohne Werkzeug nicht erreichbar, am FoH bleibt die Haube weg.
- **Einsatzplatten:** Stecker und Adapter für RS485 sind offen. Bucht 44 × 44 mm, Platte 60 × 60 mm, freier Raum innen `rs485_platz` (26 × 50 × 14 mm), vier Einsatzsäulen. Ein HAT auf dem Pi ist nicht modelliert, Höhe und Stecker dann prüfen.
- **Lüftung:** Zuluft durch Schlitze im Boden (Füße heben 5 mm an), Abluft oben durch die Rückwand, 22 Schlitze. Gitter und Löcher rechts für einen 40-mm-Lüfter. **Kühlung nicht gemessen.** Im Dauerbetrieb prüfen:

```bash
vcgencmd measure_temp
```

```bash
vcgencmd get_throttled
```

  Bleibt der Pi unter 70 °C und `get_throttled` meldet `0x0`, reicht es. Sonst Lüfter einbauen.

## Geprüft am Modell

Siehe `pruefbericht.txt`: alle STL dicht, passen in den Bauraum, keine Überschneidung zwischen Teilen und Platzhaltern für Deck, Pi, USB-, RJ45- und Netzstecker, Panel-Buchsen, RS485 und Lüfter.

Das echte Elgato-Modell wird punktweise gegen die Teile geprüft, weil sein Netz nicht geschlossen ist. Auch der Gegentest war positiv: Schon 0,1 mm Versatz des Betts meldet Berührung; Sitze und Bohrungen fluchten im Schnitt mit den Domen. Die Prüfung läuft nur, wenn `lokal/deck.stl` vorhanden ist:

```bash
DECK_STP=~/Downloads/stream-deck-stp-1.stp /Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd hardware/gehaeuse/deck_aus_stp.py
```

**Standfestigkeit:** Waagerecht an der Deck-Oberkante kippt das Gehäuse überschlägig schon bei etwa 6–8 N (0,6–0,8 kg), auch mit Ballast. Frei stehend ist das nur am FoH vertretbar. **Beim Publikum das Gehäuse auf den Tisch schrauben.** Mehr Ballast verschiebt das kaum genug.

Nicht geprüft: Festigkeit, vor allem der schrägen Sitze unter Zug, Passung der Einsätze, Temperatur, Kabelführung im Raum (Biegeradien), echte Bedienung. Platzhalter für Stecker und Pi sind einfache Quader.

## Anregungen und Lizenzen

Neu konstruiert, keine fremde Geometrie übernommen; aus Elgatos STP stammen nur Maße, die Datei selbst liegt nicht im Repo. Als Idee dienten der [Ständer für XL und Pi 5](https://makerworld.com/de/models/2168960-stream-deck-xl-raspberry-pi-5-hybrid-stand) (CC BY-SA), das [CompanionPi4-Gehäuse](https://makerworld.com/de/models/1533869-companionpi4-streamdeck-case) und der [Adapter für den Stream Deck +](https://makerworld.com/de/models/946518-1-4-20-mount-adapter-for-stream-deck-plus) (CC BY-NC-SA, bestätigt die Nutzung der Fußschrauben).
