# Konzept: Bewegung in drei Ebenen

Stand: November 2026. Ziel ist, weg von einer Liste von „Pattern“ (eine Kurve, die zeitversetzt über
die Spiegel läuft) hin zu Bausteinen, die man vorher einstellt und live spielt.

## Warum

Bisher spielt jeder Spiegel dieselbe Kurve, nur zeitversetzt. Ob Sinus, Flyout oder Puls – man sieht
immer eine Welle durch die Reihe laufen, die Form ändert nur deren Aussehen. Flyout, Blinder und
Sägezahn sind eigentlich Ereignisse, die in eine Schleife gepackt wurden.

## Die drei Ebenen

| Ebene | Inhalt | Regler |
|---|---|---|
| **Grundbewegung** | Ruhe, Welle, Pendelwelle, Wind, Drehen | Offset (je Element möglich), Amplitude, Speed, Phase |
| **Verteilung** | Ordnung, Gegenlauf, Gruppe, Fächer, Element-Folge | gilt für beide anderen Ebenen |
| **Impulse** | Flash auf, Flash zu, Stoß, Flyout, Glitzern | Hüllkurve A/H/R, Stärke, Element-Versatz |

Vor der Show wird die Grundbewegung eingestellt, live werden Impulse gedrückt.

### 1. Grundbewegung (läuft dauerhaft, eine ist aktiv)

- **Ruhe** – alle auf Offset, nur Impulse bewegen.
- **Welle** – der bisherige Sinus, mit Ping-Pong als Option.
- **Pendelwelle** – jeder Spiegel mit leicht anderer Periode (Speed × (1 + Platz/Wiederkehr)): Gleichlauf →
  Schlangen → Chaos → Gleichlauf. Regler: Speed (ganzes Bild), Wiederkehr (Schwünge), Amplitude.
- **Wind** – Böen ziehen entlang der Ordnung durch und verändern sich langsam, wiederholt sich nie.
  Regler: Wellenlänge, Tempo, Amplitude.
- **Drehen** – TiltRotate (bisher „Rotation“).

**Offset je Element:** Normal ein Offset für alle. Im Client öffnet ein Schloss drei Schieber
(einer je Element), am Stream Deck Element-Taste halten und Offset drehen.

### 2. Verteilung

Symmetrie, Richtung und Reihenfolge beantworten dieselbe Frage – wo fängt es an, wie geht es weiter –
und gehen in **einem** Wähler auf:

- **Ordnung:** links → rechts, rechts → links, Mitte → außen, außen → Mitte, je Element,
  verschachtelt (gerade/ungerade), Zufall (feste Mischung).
- **Gegenlauf** (an/aus): linke Hälfte gespiegelt.
- **Gruppe**, **Fächer**: wie bisher.
- **Element-Folge:** zusammen, vorne → hinten, hinten → vorne, mit **Element-Versatz** (Zeit).
  „Vorne“ = Element 1 (wie im Vorschau-Aufbau „hintereinander“).

Die Ordnung gilt für beide Ebenen: Die Welle läuft entlang der Ordnung, ein Impuls startet an ihrem
Anfang. Tippen auf den Touch-Strip übersteuert den Startpunkt für diesen einen Impuls.

### 3. Impulse (live, wie Flash am Lichtpult)

Drücken = Attack (hinfahren), Halten = Hold (bleiben), Loslassen = Release (zurück in die Grundbewegung).
Mehrere Impulse dürfen sich überlagern, der zuletzt gedrückte liegt oben.

- **Flash auf / Flash zu** – alle Spiegel zu einer Ziel-Stellung. „Auf“ (Licht von hinten, häufigster
  Fall) und „Zu“ (Licht von außen) sind Winkel im Einstellungsmenü, weil sie vom Aufbau abhängen.
- **Stoß** – Ruck, der als gekoppelte Welle durch die Reihe läuft, an den Enden zurückkommt und ausschwingt.
- **Flyout** – Spiegel kippen nacheinander weg und zurück, einmalig.
- **Glitzern** – solange gehalten, zucken einzelne Spiegel nach Zufall.

**Hüllkurve:** Attack, Hold (solange gedrückt; optional feste Zeit = „Go“), Release, Stärke.
Im Client als kleine Kurve mit ziehbaren Punkten und einem Punkt, der während eines Impulses mitläuft.
Am Stream Deck stellen die Knöpfe Attack, Release, Stärke, Versatz.

**Element-Folge bei Impulsen:** z. B. erst Element 1, dann 2, dann 3 auf – und beim Loslassen in derselben
Folge wieder zurück.

**Sicherheit:** Geht die Verbindung des Geräts verloren, das einen Impuls hält, wird er losgelassen.

## Bedienung

- **Stream Deck:** Untermenü „Impulse ›“ mit Pads; Drehregler dort: Attack, Release, Stärke, Versatz.
  Später: Touch-Strip als Raumachse (Ursprung, Wisch = Richtung und Tempo).
- **iPad:** Impuls-Bereich unter der Vorschau mit Pads (Mehrfinger), Hüllkurve, Element-Folge.

## Reihenfolge der Umsetzung

1. **Prototyp Impulse:** Flash auf/zu, Hüllkurve, Element-Folge – Engine, Server, Client, Stream Deck. ✅
2. Verteilung zusammenlegen (Ordnung, Gegenlauf), Offset je Element. ✅ (Ordnung gilt innerhalb jedes
   Elements, die Element-Folge ersetzt „alle 36 / je Element“; Element-Folge der Impulse bleibt eigene Einstellung)
3. Grundbewegungen Pendelwelle und Wind ✅; Formen Flyout/Blinder/Sägezahn/Funkeln werden Impulse (offen,
   bleiben bis dahin als Formen).
4. Impulse Stoß (Federkopplung), Flyout, Glitzern; Touch-Strip als Ursprung; Quantisierung auf den Takt.

## Offen

- Wie schnell fährt Tilt wirklich? Davon hängt ab, wie kurz Attack sinnvoll ist.
- Winkel für „auf“ und „zu“ am echten Aufbau bestimmen (Vorgabe: auf 90°, zu 0°, Platzhalter).
- Website-Simulation: bleibt vorerst beim alten Modell.
