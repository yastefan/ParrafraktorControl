#!/usr/bin/env python3
"""Exportiert die Druckteile und prüft das Modell. Nur am Modell, nichts ersetzt den Probedruck.

Aufruf: python3 hardware/gehaeuse/pruefe.py   (braucht openscad und numpy)
Schreibt teile/*.stl und pruefbericht.txt.

Prüft: dicht (jede Kante zweimal), Bauraum, Überhang über 45°, Überschneidung aller Teile
und Platzhalter in Einbaulage, Standfestigkeit überschlägig.
"""
import itertools
import pathlib
import struct
import subprocess
import sys
import tempfile

import numpy as np

HIER = pathlib.Path(__file__).resolve().parent
SCAD = HIER / "gehaeuse.scad"
BAURAUM = np.array([300.0, 300.0, 330.0])  # Prusa CORE One L, Händlerangaben
DRUCKTEILE = ["korpus", "boden", "bett", "kasten", "ballastdeckel"]
GEHAEUSE = ["korpus", "boden", "bett", "kasten", "ballastdeckel"]
PLATZHALTER = ["deck", "deck_usb", "pi", "usb_a", "rj45", "strom", "buchse_usb",
               "buchse_xlr", "buchse_eth", "rs485", "luefter", "ballast"]
# Diese Paare berühren oder durchdringen sich gewollt
ERLAUBT = {
    frozenset(["deck", "deck_usb"]),   # Stecker sitzt in der Buchse
    frozenset(["deck", "deck_echt"]),
    frozenset(["deck_echt", "deck_usb"]),
    frozenset(["pi", "usb_a"]),        # Stecker steckt im Port
    frozenset(["pi", "rj45"]),
    frozenset(["pi", "strom"]),
}
DICHTE = 1.27      # PETG g/cm³
FUELLANTEIL = 0.85 # überschlägig, Teile sind fast nur Wand


def openscad(ziel, *defs):
    args = ["openscad", "--backend=Manifold", "--export-format=binstl", "-o", str(ziel)]
    for d in defs:
        args += ["-D", d]
    r = subprocess.run(args + [str(SCAD)], capture_output=True, text=True)
    return r


def lies_stl(pfad):
    daten = pathlib.Path(pfad).read_bytes()
    n = struct.unpack("<I", daten[80:84])[0]
    a = np.frombuffer(daten[84:], dtype=np.dtype([
        ("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]), count=n)
    return a["v"].astype(np.float64)


def volumen_schwerpunkt(t):
    v = np.einsum("ij,ij->i", t[:, 0], np.cross(t[:, 1], t[:, 2])) / 6
    s = v.sum()
    c = ((t.sum(axis=1) / 4) * v[:, None]).sum(axis=0) / s if abs(s) > 1e-9 else np.zeros(3)
    return s, c


def dicht(t):
    gerundet = np.round(t, 4)
    kanten = {}
    for tri in gerundet:
        p = [tuple(x) for x in tri]
        for i in range(3):
            k = (p[i], p[(i + 1) % 3])
            kanten[k] = kanten.get(k, 0) + 1
    return all(kanten.get((b, a), 0) == c for (a, b), c in kanten.items())


def ueberhang(t):
    """Fläche, die steiler als 45° nach unten zeigt und nicht auf dem Bett liegt."""
    n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    fl = np.linalg.norm(n, axis=1) / 2
    ok = fl > 1e-9
    nz = np.zeros(len(t))
    nz[ok] = n[ok, 2] / (2 * fl[ok])
    unten = t[:, :, 2].max(axis=1) < t[:, :, 2].min() + 0.01
    return float(fl[(nz < -0.7072) & ~unten].sum())


def punkte_im_koerper(punkte, t):
    """Welche Punkte liegen im geschlossenen Netz t? Strahl nach oben, Dreiecke nach Raster vorsortiert."""
    lo, hi = t.reshape(-1, 3).min(0), t.reshape(-1, 3).max(0)
    pk = punkte[((punkte >= lo) & (punkte <= hi)).all(axis=1)]
    if not len(pk):
        return pk
    raster = 4.0
    fach = {}
    txy = t[:, :, :2]
    a = np.floor((txy.min(axis=1) - lo[:2]) / raster).astype(int)
    b = np.floor((txy.max(axis=1) - lo[:2]) / raster).astype(int)
    for i in range(len(t)):
        for u in range(a[i, 0], b[i, 0] + 1):
            for v in range(a[i, 1], b[i, 1] + 1):
                fach.setdefault((u, v), []).append(i)
    innen = []
    ij = np.floor((pk[:, :2] - lo[:2]) / raster).astype(int)
    for p, k in zip(pk, map(tuple, ij)):
        idx = fach.get(k)
        if not idx:
            continue
        d = t[idx]
        v0, v1, v2 = d[:, 0], d[:, 1], d[:, 2]
        e = (p[0] + 1.3e-4, p[1] + 2.7e-4)   # weg von Kanten
        n = (v1[:, 0] - v0[:, 0]) * (v2[:, 1] - v0[:, 1]) - (v1[:, 1] - v0[:, 1]) * (v2[:, 0] - v0[:, 0])
        ok = np.abs(n) > 1e-12
        w1 = ((e[0] - v0[:, 0]) * (v2[:, 1] - v0[:, 1]) - (e[1] - v0[:, 1]) * (v2[:, 0] - v0[:, 0]))
        w2 = ((v1[:, 0] - v0[:, 0]) * (e[1] - v0[:, 1]) - (v1[:, 1] - v0[:, 1]) * (e[0] - v0[:, 0]))
        with np.errstate(divide="ignore", invalid="ignore"):
            u_, v_ = w1 / n, w2 / n
        tr = ok & (u_ >= 0) & (v_ >= 0) & (u_ + v_ <= 1)
        z = v0[tr, 2] + u_[tr] * (v1[tr, 2] - v0[tr, 2]) + v_[tr] * (v2[tr, 2] - v0[tr, 2])
        if (z > p[2]).sum() % 2 == 1:
            innen.append(p)
    return np.array(innen).reshape(-1, 3)


def main():
    zeilen = []
    def aus(s=""):
        print(s)
        zeilen.append(s)

    teile_dir = HIER / "teile"
    teile_dir.mkdir(exist_ok=True)
    fehler = 0
    aus("Prüfung am Modell (nicht gedruckt)")
    aus("")
    aus("Druckteile: Maße in mm, Bauraum 300 × 300 × 330, Überhang = Fläche steiler 45°")
    aus(f"{'Teil':<16}{'X':>7}{'Y':>7}{'Z':>7}{'Vol cm³':>9}{'ca. g':>7}{'Überhang mm²':>14}  dicht")
    for name in DRUCKTEILE:
        ziel = teile_dir / f"{name}.stl"
        r = openscad(ziel, f'teil="{name}"', 'lage="druck"')
        if r.returncode:
            aus(f"{name}: Export fehlgeschlagen\n{r.stderr}")
            fehler += 1
            continue
        for zeile in r.stderr.splitlines():
            if "WARNING" in zeile:
                aus(f"{name}: {zeile}")
                fehler += 1
        t = lies_stl(ziel)
        groesse = t.reshape(-1, 3).max(0) - t.reshape(-1, 3).min(0)
        vol, _ = volumen_schwerpunkt(t)
        d = dicht(t)
        passt = bool((np.sort(groesse) <= np.sort(BAURAUM)).all() and groesse[2] <= BAURAUM[2])
        z_min = t[:, :, 2].min()
        if not d or not passt or abs(z_min) > 0.01:
            fehler += 1
        aus(f"{name:<16}{groesse[0]:7.1f}{groesse[1]:7.1f}{groesse[2]:7.1f}{vol/1000:9.1f}"
            f"{vol/1000*DICHTE*FUELLANTEIL:7.0f}{ueberhang(t):14.0f}  {'ja' if d else 'NEIN'}"
            f"{'' if passt else '  PASST NICHT'}{'' if abs(z_min) <= 0.01 else f'  z_min={z_min:.2f}'}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        boxen, netze = {}, {}
        echt = (HIER / "lokal" / "deck.stl").exists()
        namen_alle = GEHAEUSE + PLATZHALTER + (["deck_echt"] if echt else [])
        # Das Elgato-Netz ist nicht geschlossen, deshalb punktweise statt mit Boolean-Schnitt
        for name in namen_alle:
            ziel = tmp / f"{name}.stl"
            r = openscad(ziel, f'teil="{name}"', 'lage="montiert"')
            if r.returncode:
                aus(f"{name}: Einbaulage fehlgeschlagen\n{r.stderr}")
                fehler += 1
                continue
            t = lies_stl(ziel)
            netze[name] = t
            boxen[name] = (t.reshape(-1, 3).min(0), t.reshape(-1, 3).max(0))

        aus("")
        aus("Überschneidungen in Einbaulage (Volumen > 1 mm³):")
        namen = sorted(boxen)
        aus("  Deck: " + ("zusätzlich echtes Elgato-Modell (lokal/deck.stl)" if echt else
                          "nur Platzhalter, lokal/deck.stl fehlt (siehe deck_aus_stp.py)"))
        gefunden = 0
        geprueft = 0
        for a, b in itertools.combinations(namen, 2):
            if frozenset([a, b]) in ERLAUBT or "deck_echt" in (a, b):
                continue
            (amin, amax), (bmin, bmax) = boxen[a], boxen[b]
            if (amin >= bmax).any() or (bmin >= amax).any():
                continue
            geprueft += 1
            q = tmp / "schnitt.scad"
            q.write_text(f'intersection() {{ import("{tmp}/{a}.stl"); import("{tmp}/{b}.stl"); }}\n')
            ziel = tmp / "schnitt.stl"
            ziel.unlink(missing_ok=True)
            r = subprocess.run(["openscad", "--backend=Manifold", "--export-format=binstl",
                                "-o", str(ziel), str(q)], capture_output=True, text=True)
            if "ERROR" in r.stderr or (r.returncode and "empty" not in r.stderr):
                aus(f"  {a} ∩ {b}: SCHNITT FEHLGESCHLAGEN")
                fehler += 1
                continue
            if not ziel.exists() or ziel.stat().st_size < 134:
                continue
            s = lies_stl(ziel)
            vol, _ = volumen_schwerpunkt(s)
            if abs(vol) > 1:
                lo, hi = s.reshape(-1, 3).min(0), s.reshape(-1, 3).max(0)
                aus(f"  {a} ∩ {b}: {abs(vol):.0f} mm³, x {lo[0]:.0f}–{hi[0]:.0f}, y {lo[1]:.0f}–{hi[1]:.0f}, z {lo[2]:.0f}–{hi[2]:.0f}")
                gefunden += 1
        aus(f"  {gefunden} Überschneidungen, {geprueft} Paare mit überlappender Hülle geprüft, "
            f"{len(list(itertools.combinations(namen, 2)))} Paare insgesamt.")
        fehler += gefunden

        if echt:
            aus("")
            aus("Echtes Deck gegen Gehäuseteile (Eck- und Flächenpunkte des Elgato-Netzes im Teil):")
            d = netze["deck_echt"]
            punkte = np.unique(np.round(np.vstack([d.reshape(-1, 3), d.mean(axis=1)]), 3), axis=0)
            aus(f"  {len(punkte)} Punkte")
            for name in GEHAEUSE:
                innen = punkte_im_koerper(punkte, netze[name])
                if len(innen):
                    lo, hi = innen.min(0), innen.max(0)
                    aus(f"  {name}: {len(innen)} Punkte im Teil, x {lo[0]:.1f}–{hi[0]:.1f}, y {lo[1]:.1f}–{hi[1]:.1f}, z {lo[2]:.1f}–{hi[2]:.1f}")
                    fehler += 1
                else:
                    aus(f"  {name}: frei")

        # Standfestigkeit: Schwerpunkt aus Volumen, Geräte mit Herstellergewicht
        mg = []
        for name in GEHAEUSE:
            if name in netze:
                v, c = volumen_schwerpunkt(netze[name])
                mg.append((name, v / 1000 * DICHTE * FUELLANTEIL, c))
        for name, m in [("deck", 465), ("pi", 60), ("ballast", 165)]:
            _, c = volumen_schwerpunkt(netze[name])
            mg.append((name, m, c))
        def bericht(titel, liste):
            m = sum(x[1] for x in liste)
            c = sum(x[1] * x[2] for x in liste) / m
            alles = netze["deck"].reshape(-1, 3)
            h = alles[:, 2].max() + 5
            y_oben = alles[np.argmax(alles[:, 2]), 1]
            fuss_v, fuss_h = 18 - 6, netze["boden"][:, :, 1].max() - 14 + 6
            hinten = m * 0.00981 * (fuss_h - c[1]) / h
            vorn = m * 0.00981 * (c[1] - fuss_v) / h
            seite = m * 0.00981 * (min(c[0], netze["korpus"][:, :, 0].max() - c[0]) - 18) / h
            aus(f"  {titel}: Masse {m:.0f} g, Schwerpunkt y {c[1]:.0f} z {c[2]+5:.0f} mm über Tisch")
            aus(f"    Kippkraft waagerecht an der Deck-Oberkante ({h:.0f} mm hoch, Füße y {fuss_v:.0f}…{fuss_h:.0f}):"
                f" nach hinten {hinten:.1f} N, nach vorn {vorn:.1f} N, zur Seite {seite:.1f} N")
        aus("")
        aus("Standfestigkeit überschlägig, ohne Reibung und ohne Tischbefestigung:")
        bericht("mit Ballast", mg)
        bericht("ohne Ballast", [x for x in mg if x[0] not in ("ballast",)])

    (HIER / "pruefbericht.txt").write_text("\n".join(zeilen) + "\n")
    print("\nFehler:", fehler)
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
