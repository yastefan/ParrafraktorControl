# Tischgehäuse Stream Deck + und Raspberry Pi 4

Keilförmiges Tischgehäuse für FoH und Ausstellung im Innenraum oder trocken und ohne pralle Sonne. Das Deck liegt 30° geneigt bündig im Korpus: Die Oberseite greift als Blende über seinen Rand, von innen hält es ein Bett an den schrägen Originalgewinden. Von außen sind keine Schrauben zu sehen, und das Deck lässt sich nicht nach oben herausheben. Der Pi liegt darunter. Außenmaße mit Füßen 156 × 135 × 122 mm, mit Haube 200 mm tief; Kanten 4 mm gerundet.

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

**Zuerst `bett.stl` drucken.** Es enthält die Sitze, trägt also das, was am Deck passen muss. Gewindeeinsätze noch nicht nötig: Deck auflegen, Originalschrauben von unten von Hand eindrehen. Passt das, die übrigen Teile drucken; ob die Blende passt, zeigt dann der Korpus.

Noch offen, in `gehaeuse.scad`:

| Maß | Parameter | Wert jetzt | Stand |
|---|---|---|---|
| USB-Winkelstecker am Deck | `usb_gehaeuse`, `usb_hals_l` | Gehäuse 18 × 8 mm, Abgang quer | **Nach Händlerbild.** Hals muss höchstens 8,5 mm dick sein, sonst passt er nicht in die Mulde. Am gekauften Kabel messen und einmal ans Deck stecken |
| Stecker am Pi | `stecker_*` | USB-A 35 mm, RJ45 45 mm, Netz 30 mm | **Annahme.** Netzstecker darf länger sein, er ragt dann durchs Ø14-Loch |
| Panel-Buchse samt Stecker innen | `d_tiefe` | 47 mm | **Annahme, knapp:** kurzen oder gewinkelten RJ45-Stecker nehmen und messen |
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

Druckteile (PETG, zusammen etwa 500 g mit Haube, laut `pruefbericht.txt` überschlägig):

| Teil | Zweck |
|---|---|
| `korpus` | Keil mit Blende und Schacht fürs Deck |
| `boden` | Boden und Rückwand als ein Teil, trägt Pi, Ballast und Zugentlastung |
| `bett` | trägt das Deck von innen: schräge Sitze, Laschen. Einzeln nachdruckbar |
| `einsatz_d` | Einsatzplatte mit Neutrik-D-Ausschnitt für Ethernet, für DMX ein zweites Mal |
| `einsatz_blind` | verschließt die RS485-Bucht bis zur Entscheidung |
| `zugentlastung` | Klemme fürs Netzkabel, außen an der Rückwand |
| `ballastdeckel` | hält den Ballast |
| `haube` | nur beim Publikum: deckt Stecker und Schrauben hinten ab, Kabel laufen unten heraus |

Kaufteile:

| Menge | Teil |
|---|---|
| 24 (+4 für RS485) | Gewindeeinsatz M3 × 5,7 |
| 4 | Gewindeeinsatz M2,5 |
| 2 | Originalschrauben des Deck-Fußes, dazu Kreuzschlitz-Dreher |
| 4 | M3 × 10, Bett in den Schacht, von unten |
| 8 | Sicherheits-Torx: 4 × M3 × 10 Boden, 4 × M3 × 14 Rückwand mit Haube (ohne Haube M3 × 10) |
| 8 | M3 × 8, Einsatzplatten |
| 2 + 2 | M3 × 12 Zugentlastung, M3 × 5 Ballastdeckel |
| 2 | M3 × 10 mit Mutter für die Panel-Buchse |
| 4 | M2,5 × 6 für den Pi |
| 1 | Neutrik NE8FDP (etherCON, nimmt auch normales RJ45) |
| 1 | RJ45-Patchkabel 0,25 m mit kurzem oder gewinkeltem Stecker, innen |
| 1 | USB-C-Winkelstecker auf USB-A, 30 cm, Deck zu Pi (vom User besorgt; der USB-C des Pi 4 ist nur Strom) |
| 1 | Offizielles Pi-4-Netzteil oder gleichwertig |
| 1 | Kühlkörper Pi 4, höchstens 15 mm |
| 1 | Flachstahl 105 × 30 × 6 mm, etwa 148 g |
| 4 | Gummifuß Ø12, 6 mm hoch (1 mm eingelassen) |
| 2 | M5-Schraube, Scheibe, Mutter für den Tisch (beim Publikum Pflicht) |
| 3 | Kabelbinder |
| optional | Lüfter 40 × 40 × 10 mm 5 V, dazu 4 × M3 × 16 mit Mutter |

## Drucken

PETG, 0,4-mm-Düse, 0,2 mm Schicht, 5 Wände, 25 % Gyroid, keine Stützen. Klebestift oder Trennmittel auf glattem Bett, damit PETG nicht ausreißt. Heller Filament, falls Sonne nicht ganz auszuschließen ist.

| Teil | Lage (STL ist schon so gedreht) |
|---|---|
| `korpus` | Oberseite auf dem Druckbett, Öffnung oben. Die Blende wird so glatt wie das Druckbett. Die gerundeten Kanten liegen am Druckbett und hängen unten über: unterste Schichten prüfen, im Slicer Brim oder kleinere Rundung wählen, falls sie sich lösen |
| `bett` | Boden auf dem Druckbett. Die Schraubenkanäle liegen knapp über 45°; nacharbeiten, falls etwas hängt |
| `boden` | Boden auf dem Bett, Rückwand steht. **Brücken** über den 34-mm-Buchten und im Lüftungsbereich, sind später von der Platte verdeckt; Brim empfohlen |
| `haube` | Rückseite auf dem Bett |
| Rest | flach |

Überhänge zeigt `pruefbericht.txt`. Die Flächen dort sind kurze Brücken und beim Korpus und der Haube die Rundungen; ob sie sauber werden, zeigt erst der Druck.

## Montage

1. Einsätze mit dem Lötkolben setzen. Pi-Säulen und Fußtaschen ansehen, ob Grate stören.
2. Füße kleben. Ballast in die Wanne, Deckel drauf.
3. Pi mit Kühlkörper auf den Boden schrauben. Netzteilstecker von außen durch das Ø14-Loch führen und einstecken. Kabel außen in einem Bogen nach oben führen und mit der Zugentlastung klemmen.
4. Panel-Buchse in `einsatz_d`, Patchkabel zum Pi, Einsatzplatten verschrauben.
5. Beim Publikum: Boden mit den zwei M5-Schrauben auf den Tisch schrauben (Bohrungen im Boden, etwa 80 mm Abstand).
6. Fuß vom Deck abschrauben. Deck auf das Bett legen, die zwei Originalschrauben von unten durch die schrägen Kanäle eindrehen. Nur handfest, das Gewinde sitzt im Deck.
7. USB-Kabel ins Deck stecken. Deck mit Bett von unten in den Schacht des Korpus schieben, bis der Rand an der Blende liegt, und das Bett mit vier M3 × 10 von unten anschrauben. Kabel in den Pi stecken, mit Kabelbindern an den Ösen führen, Schlaufe lassen.
8. Korpus senkrecht über den Boden stülpen. Die Rippe unter der Oberseite fasst die Oberkante der Rückwand. Von unten vier Schrauben; hinten vier, oder am FoH ohne Haube vier kürzere.
9. Beim Publikum: Stecker einstecken, Haube mit vier Schrauben von hinten befestigen, Kabel unten herausführen und am Tisch sichern.

Für die SD-Karte muss der Korpus ab (Boden bleibt verschraubt), das ist gewollt.

## Entscheidungen

- **Neigung 30°:** flach genug für den Griff von oben im Stehen, am FoH sitzend noch lesbar. Parameter `neigung`; ändern verschiebt die Höhe. Nur am Modell beurteilt.
- **Bündiges Deck, schmal und flach:** Wunsch des Users. Seitlich sind es außen 10,5 mm bis zur Sichtöffnung, die Bett-Schrauben sitzen dort, wo sich die Rückseite des Decks zur Seite wegschrägt. Tiefe begrenzt das schräg nach hinten ragende Deck: `rand_hinten` kleiner stößt es an die Rückwand. Vorderkante 42 mm, damit die Ethernet-Buchse des Pi unter das Bett passt.
- **Keine Abdichtung:** laut User nur außerhalb der Regie. PETG reicht dort; es wird ab etwa 70 °C weich, deshalb nicht in die Sonne stellen. Das Deck selbst ist nicht wetterfest.
- **Haube statt verschraubter Buchsen allein:** Stecker und Schrauben hinten sind ohne Werkzeug nicht erreichbar, am FoH bleibt die Haube weg.
- **Einsatzplatten:** Stecker und Adapter für RS485 sind offen. Bucht 34 × 34 mm, Platte 50 × 50 mm, freier Raum innen `rs485_platz` (31 × 40 × 10 mm), vier Einsatzsäulen. Der Raum reicht für kleine Wandlerplatinen, nicht mehr für große USB-DMX-Adapter. Ein HAT auf dem Pi ist nicht modelliert, Höhe und Stecker dann prüfen.
- **Lüftung:** Zuluft durch Schlitze im Boden (Füße heben 5 mm an), Abluft oben durch die Rückwand, 17 Schlitze. Gitter und Löcher rechts für einen 40-mm-Lüfter. **Kühlung nicht gemessen.** Im Dauerbetrieb prüfen:

```bash
vcgencmd measure_temp
```

```bash
vcgencmd get_throttled
```

  Bleibt der Pi unter 70 °C und `get_throttled` meldet `0x0`, reicht es. Sonst Lüfter einbauen.

## Geprüft am Modell

Siehe `pruefbericht.txt`: alle STL dicht, passen in den Bauraum, keine Überschneidung zwischen Teilen und Platzhaltern für Deck, Pi, USB-, RJ45- und Netzstecker, Panel-Buchsen, RS485 und Lüfter.

Das echte Elgato-Modell wird punktweise gegen die Teile geprüft, weil sein Netz nicht geschlossen ist. Auch der Gegentest war positiv: Schon 0,25 mm Versatz des Betts meldet Berührung; Sitze und Bohrungen fluchten im Schnitt mit den Domen. Die Prüfung läuft nur, wenn `lokal/deck.stl` vorhanden ist:

```bash
DECK_STP=~/Downloads/stream-deck-stp-1.stp /Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd hardware/gehaeuse/deck_aus_stp.py
```

**Standfestigkeit:** Waagerecht an der Deck-Oberkante kippt das Gehäuse überschlägig schon bei etwa 5–6 N (0,5–0,6 kg), mit Ballast. Das kleinere Gehäuse kippt leichter als die größere Fassung. Frei stehend ist das nur am FoH vertretbar. **Beim Publikum das Gehäuse auf den Tisch schrauben.** Mehr Ballast verschiebt das kaum genug.

Nicht geprüft: Festigkeit, vor allem der schrägen Sitze unter Zug, Passung der Einsätze, Temperatur, Kabelführung im Raum (Biegeradien), echte Bedienung. Platzhalter für Stecker und Pi sind einfache Quader.

## Anregungen und Lizenzen

Neu konstruiert, keine fremde Geometrie übernommen; aus Elgatos STP stammen nur Maße, die Datei selbst liegt nicht im Repo. Als Idee dienten der [Ständer für XL und Pi 5](https://makerworld.com/de/models/2168960-stream-deck-xl-raspberry-pi-5-hybrid-stand) (CC BY-SA), das [CompanionPi4-Gehäuse](https://makerworld.com/de/models/1533869-companionpi4-streamdeck-case) und der [Adapter für den Stream Deck +](https://makerworld.com/de/models/946518-1-4-20-mount-adapter-for-stream-deck-plus) (CC BY-NC-SA, bestätigt die Nutzung der Fußschrauben).
