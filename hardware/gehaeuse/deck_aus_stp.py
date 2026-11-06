# Erzeugt lokal/deck.stl aus Elgatos STP-Modell, nur für die Prüfung. Nicht ins Repo.
# Aufruf: DECK_STP=~/Downloads/stream-deck-stp-1.stp /Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd hardware/gehaeuse/deck_aus_stp.py
import os
import MeshPart
import Part
quelle = os.path.expanduser(os.environ["DECK_STP"])
ziel = os.path.join(os.environ.get("DECK_ZIEL", "hardware/gehaeuse/lokal"), "deck.stl")
os.makedirs(os.path.dirname(ziel), exist_ok=True)
s = Part.Shape()
s.read(quelle)
gehaeuse = max(s.Shells, key=lambda x: x.BoundBox.DiagonalLength if len(x.Faces) > 2000 else 0)
MeshPart.meshFromShape(Shape=gehaeuse, LinearDeflection=0.05, AngularDeflection=0.3).write(ziel)
print("geschrieben", ziel)
