// Tischgehäuse Parrafraktor: Stream Deck + und Raspberry Pi 4 als eine Einheit.
// Material PETG, Drucker Prusa CORE One L (300 × 300 × 330 mm).
//
// Achsen im montierten Zustand: x = Breite, y = von vorn (Bediener) nach hinten,
// z = nach oben, z = 0 ist die Unterseite des Gehäuses (Gummifüße darunter).
//
// Quellen stehen in README.md. Kennzeichnung der Maße:
//   [CAD]       aus Elgatos STP-Modell des Stream Deck + (Version 1), vom User bestätigt: 140/135/30, 83
//   [Elgato]    offizielles Datenblatt, [RPi] offizielle Zeichnung
//   [ANNAHME]   nicht belegt, vor dem Druck am Gerät messen!

/* [Ausgabe] */
teil = "alles";          // korpus, boden, bett, kasten, ballastdeckel, alles, explosion, innen
lage = "druck";          // druck = Drucklage, montiert = Einbaulage

/* [Stream Deck +] */
// Koordinaten am Deck: x quer, s vom Reglerrand zum Tastenrand, z ab Rückplatte zur Front.
deck_b = 140.03;         // [CAD]
deck_h = 135.47;         // [CAD]
deck_rand_z = 29.37;     // [CAD] Vorderkante des Rands über der Rückplatte
deck_profil = [          // [CAD] Rückseite (Schnitt) für Platzhalter, ohne Dome
    [0, 17], [7.93, 7.3], [15.7, 4], [18, 2.5], [41, 0], [115, 0], [130, 8.6], [135.47, 17],
    [135.47, deck_rand_z], [0, deck_rand_z]];
loch_abstand = 83;       // [CAD], vom User gemessen
loch_s = 21.24;          // [CAD] Mitte der Dom-Stirnfläche
loch_z = 0.88;           // [CAD]
loch_kippung = 49.68;    // [CAD] Winkel der Schraubenachse zur Normalen der Rückplatte
dom_d = 8;               // [CAD] Dom mit Stirnfläche, in den das Gewinde führt
auge_d = 15.3;           // [CAD] Vertiefung vor dem Dom
loch_tiefe = 6.3;        // [CAD] Sackloch ab Stirnfläche
schraube_l = 8;          // [Elgato] Originalschraube M3 × 0,5, Länge 8 mm
sitz = 3;                // Material zwischen Dom und Schraubenkopf; 8 − 3 = 5 mm Gewinde
usb_s = 106.55;          // [CAD] Mitte der USB-C-Buchse auf der Rückplatte
usb_z = 3.05;            // [CAD] Boden der Stecker-Mulde über der Rückplatte
usb_fenster = [-13, 28, 18]; // Durchlass im Bett: x von, x bis, Höhe in s; Kabel läuft nach rechts ab
// Winkelstecker, Abgang quer zum Deck [Händlerbild, ANNAHME: nachmessen]
usb_gehaeuse = [18, 8];  // Länge quer, Dicke
usb_hals_l = 4;          // [ANNAHME] Hals bis zum Gehäuse, ragt in die Mulde
usb_stecker_l = 12;      // Mulde bis Unterkante Steckergehäuse

/* [Grundform] */
neigung = 30;            // Grad, siehe README (stehend und am FoH)
b = 156;                 // Breite außen
h_vorn = 42;             // Höhe der Vorderkante
wand = 3.2;              // Seiten und Vorderwand
platte = 3.2;            // Oberseite, wird um das Deck zur Blende
rand_vorn = 2.5;         // Oberseite vor dem Schacht
rand_hinten = 12;        // Oberseite hinter dem Schacht; das Deck ragt schräg nach hinten, kleiner geht nicht
rundung = 4;             // Außenkanten
boden_d = 4;
rueck_d = 4;
luft = 0.3;              // Spiel zwischen gefügten Teilen je Seite

/* [Deck-Bett und Blende] */
// Das Deck liegt bündig im Korpus: Die Oberseite greift als Blende über seinen Rand.
// Eingesetzt wird von unten, das Bett hält es von innen.
blende = 2.5;            // Überstand auf den Rand; Tasten enden 9 mm davor [CAD]
blende_luft = 0.3;       // zwischen Rand und Blende
spiel = 0.5;             // Abstand Deck zum Schacht je Seite
rahmen_b = 2.5;          // Vorder- und Rückwand des Schachts
rahmen_hoehe = 10;       // Unterkante des Schachts über der Rückplatte
schacht_hinten = 20;     // hinten höher: Das Deck kommt sonst der Rückwand zu nah
bett_d = 4;              // Boden des Betts unter der Rückplatte
bett_luft = 0.3;         // Rückplatte liegt so viel über dem Boden, die Schrauben ziehen auf die Sitze

/* [Befestigung] */
einsatz_m3_d = 4.0;      // Gewindeeinsatz M3 × 5,7, Bohrung laut Hersteller des Einsatzes prüfen
einsatz_m3_t = 7;
einsatz_m25_d = 3.5;     // Gewindeeinsatz M2,5, Bohrung ebenso prüfen
einsatz_m25_t = 5;
m3_frei = 3.4;
leiste_b = 11;           // senkrechte Schraubleisten hinten im Korpus
leiste_d = 9;
schraube_x = wand + 6.3;

/* [Raspberry Pi 4, offizielle Zeichnung] */
pi_x = 14;               // Lage der Platine, Rand zur SD-Karte
pi_y_hinten = 101;       // Kante mit USB-C: Netzstecker endet an der Rückwand
pi_abstand = 5;          // Abstandshalter
pi_l = 85;               // [RPi]
pi_b = 56;               // [RPi]
pi_d = 1.4;
kuehler_h = 15;          // [ANNAHME] passiver Kühlkörper auf dem SoC, Höhe ab Platine
pi_loecher = [[3.5,3.5],[61.5,3.5],[3.5,52.5],[61.5,52.5]];  // [RPi] u von SD-Kante, v von USB-C-Kante

/* [Stecker im Gehäuse] */
stecker_usb_a_l = 35;    // Händlerbild: 12 Metall, 16 Gehäuse, Knickschutz geschätzt
stecker_rj45_l = 45;     // [ANNAHME]
stecker_strom_l = 30;    // [ANNAHME] USB-C-Stecker am Kabel der Neutrik-Buchse

/* [Kasten hinten mit Neutrik-Buchsen, D-Norm, Flansch außen] */
kasten_t = 32;           // Tiefe hinter dem Keil
kasten_h = 46;           // Oberkante des Deckels
kasten_wand = 3;         // Rückwand: XLR-D-Buchsen 1–3 mm (Händlerangabe), etherCON bis 4 mm [Neutrik]
kasten_deckel = 3;
buchse_z = 22;           // Mitte der Buchsen
buchse_x_usb = 30;       // Neutrik NAUSBC-5G-FL, USB-C mit Kabel innen
buchse_x_xlr = 75;       // Neutrik NC3FD-L-1, DMX
buchse_x_eth = 120;      // Neutrik NE8FDP, etherCON
tiefe_usb = 30;          // [Neutrik] 29,4 mm ab Flanschfront
tiefe_xlr = 32;          // [ANNAHME] samt Lötkelchen und Litzen
tiefe_eth = 60;          // [Neutrik] 30 mm Buchse, dazu RJ45-Stecker [ANNAHME]
neutrik_d = 24;          // [Neutrik] Ausschnitt ≥ Ø24, Löcher ≥ Ø3,2 im Abstand 19 × 24 (diagonal)
neutrik_loch_x = 19;
neutrik_loch_y = 24;
neutrik_loch_d = 3.2;
neutrik_flansch = [26, 31];

/* [Lüfter, optional: 40 × 40 × 10 mm, linke Seitenwand neben dem Pi, saugt an] */
luefter = [40, 10];      // Kantenlänge, Dicke
luefter_y = 100;
luefter_z = 25;
luefter_loch = 32;       // Lochabstand der Befestigung

/* [RS485: M5Stack Unit RS485-ISO (U094), 56 × 24 × 10,2 mm, stehend an der rechten Wand] */
rs485_modul = [10.2, 56, 24];
rs485_y = 63;           // zwischen Ethernet-Stecker des Pi und Schraubleiste

/* [Ballast] */
ballast = [105, 30, 6];  // Flachstahl, etwa 148 g
wanne = [16, 3.5, b - 32, 35.5, 7]; // x, y, Länge, Tiefe, Höhe ohne Boden; flach unter dem Bett
wannendeckel = 1.6;

$fn = 48;
eps = 0.01;

// abgeleitete Maße
s0 = rand_vorn + rahmen_b + spiel;                        // Reglerrand des Decks auf der Platte
laenge = s0 + deck_h + spiel + rahmen_b + rand_hinten;    // Plattenlänge
tiefe = laenge * cos(neigung);
h_hinten = h_vorn + laenge * sin(neigung);
cx = b / 2;
deck_lage = -(platte + blende_luft + deck_rand_z);        // Rückplatte unter der Oberseite
schacht_unten = deck_lage + rahmen_hoehe;
bett_x = b / 2 - wand - luft;                             // halbe Breite des Betts
lasche_x = 70;                                            // Schrauben des Betts, ± von der Mitte
lasche_s = [30, 112];
gesamt = tiefe + kasten_t;                                // Tiefe außen
function buchsen() = [[buchse_x_usb, tiefe_usb], [buchse_x_xlr, tiefe_xlr], [buchse_x_eth, tiefe_eth]];
function z_unten(y) = h_vorn + y * tan(neigung) - platte / cos(neigung);
leiste_y = tiefe - rueck_d - leiste_d;
x0 = wand + luft;                                         // Boden/Rückwand von links
x1 = b - wand - luft;
pi_z = boden_d + pi_abstand;
strom_z = pi_z + pi_d + 2;

assert(schraube_l - sitz <= loch_tiefe - 0.3, "Schraube ginge bis auf den Grund des Sacklochs");
assert(rahmen_hoehe < deck_rand_z - 5, "Rand zu hoch, Bedienung wäre behindert");

// Montageplatte als Koordinatensystem: x, s entlang der Platte, Normale nach außen.
module auf_platte() { translate([0, 0, h_vorn]) rotate([neigung, 0, 0]) children(); }

// Koordinaten am Deck, Ursprung: Mitte des Reglerrands auf Höhe der Rückplatte
module im_deck() { auf_platte() translate([cx, s0, deck_lage]) children(); }

// Am Dom: Ursprung auf der Stirnfläche, z zeigt ins Deck
module am_dom(sx) { translate([sx * loch_abstand / 2, loch_s, loch_z]) rotate([-loch_kippung, 0, 0]) children(); }

module profil(x_a, x_b) {
    translate([x_a, 0, 0]) rotate([90, 0, 90]) linear_extrude(x_b - x_a) children();
}

function oben_z(y) = h_vorn + y * tan(neigung);

// ---------------- Korpus ----------------

// Schacht unter der Oberseite. Plattenkoordinaten. Seiten gehen in die Seitenwände über.
module schacht() {
    difference() {
        translate([cx - bett_x - 1.5, s0 - spiel - rahmen_b, schacht_unten])
            cube([2 * bett_x + 3, deck_h + 2 * spiel + 2 * rahmen_b, -schacht_unten - platte + 0.01]);
        // hinten nur oben, Seiten enden davor
        translate([cx - 200, s0 + 128, schacht_unten - 1])
            cube([400, 100, deck_lage + schacht_hinten - schacht_unten + 1]);
    }
}

// Laschen unter dem Rand des Decks, dort schrägt sich seine Rückseite weg. Deck-Koordinaten
module schacht_laschen() {
    for (sx = [-1, 1], ss = lasche_s) translate([0, ss, 0]) mirror([sx < 0 ? 1 : 0, 0, 0])
        translate([0, -7, 0]) rotate([-90, 0, 0]) mirror([0, 1, 0]) linear_extrude(14)
            polygon([[67.8, rahmen_hoehe], [bett_x + 1.5, rahmen_hoehe], [bett_x + 1.5, 19.2], [70.52, 19.2], [67.8, 16.5]]);
}

module korpus_aussen() {
    r = rundung;
    hull() {
        for (x = [r, b - r]) {
            translate([x, r, 0]) cylinder(r = r, h = 0.01);
            translate([x, r, oben_z(r) - r / cos(neigung)]) sphere(r = r);
            translate([x, tiefe - r, oben_z(tiefe - r) - r / cos(neigung)]) sphere(r = r);
        }
        // hinten unten eckig, dort schließt der Kasten an
        translate([0, tiefe - 0.01, 0]) cube([b, 0.01, kasten_h]);
    }
}

module kasten_aussen() {
    r = rundung;
    hull() {
        translate([0, tiefe, 0]) cube([b, 0.01, kasten_h]);
        for (x = [r, b - r]) {
            translate([x, gesamt - r, 0]) cylinder(r = r, h = kasten_h - r);
            translate([x, gesamt - r, kasten_h - r]) sphere(r = r);
        }
    }
}

module gesamt_aussen() { union() { korpus_aussen(); kasten_aussen(); } }

module korpus_innenraum() {
    profil(wand, b - wand)
        polygon([[wand, -1], [wand, z_unten(wand)], [tiefe - rueck_d, z_unten(tiefe - rueck_d)], [tiefe - rueck_d, -1]]);
    // unter dem Kastendeckel offen nach hinten (nur die Rückwand, sonst schnitte es vorn durch die Oberseite)
    translate([wand, tiefe - rueck_d - 1, -1]) cube([b - 2 * wand, rueck_d + 2, kasten_h + 1]);
}

module saeule(x, y) {
    translate([x, y, boden_d + luft]) cylinder(d = 10, h = h_hinten);
}

module innen_verstaerkung() {
    intersection() {
        korpus_innenraum();
        union() {
            for (x = [wand + 4.5, b - wand - 4.5]) saeule(x, wand + 4.5);
            // Leisten enden unter dem Bett
            // oben zur Seitenwand hin abgeschrägt, druckt ohne Stütze
            for (x = [wand - eps, b - wand - leiste_b + eps]) hull() {
                translate([x, leiste_y, boden_d + luft]) cube([leiste_b, leiste_d, leiste_oben - leiste_b - boden_d - luft]);
                translate([x < cx ? x : x + leiste_b - 1, leiste_y, boden_d + luft]) cube([1, leiste_d, leiste_oben - boden_d - luft]);
            }
        }
    }
}

module einsatz_von_unten(x, y) {
    translate([x, y, boden_d + luft - eps]) cylinder(d = einsatz_m3_d, h = einsatz_m3_t);
}

function ls_x() = [schraube_x, b - schraube_x];
function boden_schrauben() = [
    [wand + 4.5, wand + 4.5], [b - wand - 4.5, wand + 4.5],
    [schraube_x, leiste_y + leiste_d / 2], [b - schraube_x, leiste_y + leiste_d / 2]];
leiste_oben = 66;

module korpus() {
    difference() {
        union() {
            difference() {
                union() {
                    difference() { korpus_aussen(); korpus_innenraum(); }
                    intersection() { korpus_aussen(); union() { innen_verstaerkung(); auf_platte() schacht(); } }
                }
                auf_platte() {
                    // Schacht fürs Deck
                    translate([cx - deck_b / 2 - spiel, s0 - spiel, schacht_unten - 1])
                        linear_extrude(-schacht_unten - platte + 1) offset(r = 2) offset(delta = -2) square([deck_b + 2 * spiel, deck_h + 2 * spiel]);
                    // Blende: Sichtöffnung, Kante gefast
                    hull() {
                        translate([cx - deck_b / 2 + blende, s0 + blende, -platte - 1]) linear_extrude(platte)
                            offset(r = 6) offset(delta = -6) square([deck_b - 2 * blende, deck_h - 2 * blende]);
                        translate([cx - deck_b / 2 + blende - 1, s0 + blende - 1, -0.01]) linear_extrude(1)
                            offset(r = 7) offset(delta = -7) square([deck_b - 2 * blende + 2, deck_h - 2 * blende + 2]);
                    }
                }
            }
            intersection() { korpus_aussen(); im_deck() schacht_laschen(); }
        }
        for (p = boden_schrauben()) einsatz_von_unten(p[0], p[1]);
        // Lüftergitter links, auch ohne Lüfter als Zuluft
        translate([-1, luefter_y, luefter_z]) rotate([0, 90, 0]) {
            for (u = [-15:6:15], v = [-15:6:15]) if (norm([u, v]) < 18.5)
                translate([u, v, 0]) cylinder(d = 4, h = wand + 2);
            for (u = [-1, 1], v = [-1, 1]) translate([u * luefter_loch / 2, v * luefter_loch / 2, 0]) cylinder(d = m3_frei, h = wand + 2);
        }
        // Abluft oben in der Rückwand über dem Kasten
        for (x = [30:6:b - 30]) translate([x, tiefe + 1, kasten_h + 8]) rotate([90, 0, 0]) hull() {
            cylinder(d = 3, h = rueck_d + 2);
            translate([0, 34, 0]) cylinder(d = 3, h = rueck_d + 2);
        }
        // Einsätze für das Bett, von unten
        im_deck() for (sx = [-1, 1], ss = lasche_s) translate([sx * lasche_x, ss, rahmen_hoehe - 0.01]) cylinder(d = einsatz_m3_d, h = 6);
    }
}

// ---------------- Boden ----------------

module pi_saeule(p) {
    translate([pi_x + p[0], pi_y_hinten - p[1], 0]) cylinder(d = 7, h = pi_z);
}

module kabelbinder_oese(x, y) {
    difference() {
        translate([x - 6, y - 4, boden_d - eps]) cube([12, 8, 9]);
        translate([x - 7, y - 2, boden_d + 3]) cube([14, 4, 3.5]);
    }
}

module wanne() {
    translate([wanne[0], wanne[1], 0]) difference() {
        cube([wanne[2], wanne[3], boden_d + wanne[4]]);
        translate([8, 2, boden_d]) cube([wanne[2] - 16, wanne[3] - 4, wanne[4] + 1]);
        for (x = [4, wanne[2] - 4])
            translate([x, wanne[3] / 2, boden_d + wanne[4] - einsatz_m3_t + eps + 1]) cylinder(d = einsatz_m3_d, h = einsatz_m3_t);
    }
}

function kasten_schrauben() = [for (x = [wand + 4.5, b - wand - 4.5], y = [tiefe + 4.5, gesamt - kasten_wand - 4.5]) [x, y]];
rs485_x = x1 - 0.2 - rs485_modul[0];

// Halter für das RS485-Modul, stehend an der rechten Wand, mit Kabelbinder gesichert
module rs485_tasche() {
    difference() {
        translate([rs485_x - 2.4, rs485_y - 0.4, 0]) cube([x1 - rs485_x + 2.4, rs485_modul[1] + 0.8, boden_d + 12]);
        translate([rs485_x - 0.3, rs485_y - 1, boden_d]) cube([rs485_modul[0] + 1, rs485_modul[1] + 2, 20]);
        // Schlitz für einen Kabelbinder um Modul und Wand
        translate([rs485_x - 3, rs485_y + rs485_modul[1] / 2 - 2, boden_d + 6]) cube([4, 4, 3]);
    }
}

module boden() {
    difference() {
        intersection() {
            gesamt_aussen();
            union() {
                translate([x0, wand + luft, 0]) cube([x1 - x0, gesamt - kasten_wand - 2 * luft - wand, boden_d]);
                for (p = pi_loecher) pi_saeule(p);
                wanne();
                kabelbinder_oese(92, 118);
                kabelbinder_oese(70, 118);
                rs485_tasche();
            }
        }
        // Schrauben von unten in Korpus und Kasten
        for (p = concat(boden_schrauben(), kasten_schrauben())) {
            translate([p[0], p[1], -1]) cylinder(d = m3_frei, h = boden_d + 2);
            translate([p[0], p[1], -1]) cylinder(d = 6.5, h = 3);   // Köpfe versenkt
        }
        // Pi
        for (p = pi_loecher) translate([pi_x + p[0], pi_y_hinten - p[1], pi_z - einsatz_m25_t + eps]) cylinder(d = einsatz_m25_d, h = einsatz_m25_t);
        // Zuluft unter dem Pi und neben den Steckern
        for (x = [24:6:94]) translate([x, 54, -1]) hull() { cylinder(d = 3, h = boden_d + 2); translate([0, 36, 0]) cylinder(d = 3, h = boden_d + 2); }
        for (x = [108:6:134]) translate([x, 58, -1]) hull() { cylinder(d = 3, h = boden_d + 2); translate([0, 22, 0]) cylinder(d = 3, h = boden_d + 2); }
        // Befestigung am Tisch, Durchgang M5
        for (p = [[105, 45], [100, gesamt - 20]]) translate([p[0], p[1], -1]) cylinder(d = 5.5, h = boden_d + 2);
        // Gummifüße, 1 mm eingelassen
        for (p = fuesse()) translate([p[0], p[1], -1]) cylinder(d = 12.5, h = 2);
    }
}

function fuesse() = [[24, 18], [b - 24, 18], [24, gesamt - 14], [b - 24, gesamt - 14]];

// ---------------- Kasten hinten ----------------

// Ausschnitt für eine Neutrik-Buchse in D-Norm. Unten spitz, damit der Kasten mit dem Deckel nach unten
// ohne Stütze druckt; die Spitze liegt unter dem Flansch. Lokale z-Achse durch die Wand.
module neutrik_ausschnitt(h) {
    linear_extrude(h) intersection() {
        hull() { circle(d = neutrik_d); polygon([[-8.5, -8.5], [8.5, -8.5], [0, -17]]); }
        translate([-20, -neutrik_flansch[1] / 2 + 2, 0]) square([40, 40]);
    }
    for (sx = [-1, 1], sy = [-1, 1]) translate([sx * neutrik_loch_x / 2, sy * neutrik_loch_y / 2, 0])
        cylinder(d = neutrik_loch_d, h = h);
}

module kasten() {
    innen_z = kasten_h - kasten_deckel;
    difference() {
        union() {
            difference() {
                union() {
                    kasten_aussen();
                    // Zunge unter der Rückwand des Korpus
                    translate([x0, tiefe - rueck_d, innen_z]) cube([x1 - x0, rueck_d + 0.01, kasten_deckel]);
                }
                translate([wand, tiefe - rueck_d - 1, -1]) cube([b - 2 * wand, kasten_t - kasten_wand + rueck_d + 1, innen_z + 1]);
            }
            // Säulen für die Schrauben von unten
            intersection() {
                translate([wand, tiefe, 0]) cube([b - 2 * wand, kasten_t - kasten_wand + 0.01, innen_z + 0.01]);
                for (p = kasten_schrauben()) translate([p[0], p[1], boden_d + luft]) cylinder(d = 9, h = kasten_h);
            }
        }
        for (p = kasten_schrauben()) translate([p[0], p[1], boden_d + luft - eps]) cylinder(d = einsatz_m3_d, h = einsatz_m3_t);
        for (p = buchsen()) translate([p[0], gesamt + 1, buchse_z]) rotate([90, 0, 0]) neutrik_ausschnitt(kasten_wand + 2);
    }
}

// ---------------- Kleine Teile, montiert liegend ----------------

// Bett in Deck-Koordinaten. Trägt das Deck von innen: schräge Sitze auf den Domen.
module bett_lokal() {
    s_a = -spiel - rahmen_b + 0.2;
    difference() {
        difference() {
            union() {
                // Boden, Rampen folgen der Rückseite des Decks, Unterseite 45° abgeschrägt
                translate([-bett_x, 0, 0]) rotate([90, 0, 90]) linear_extrude(2 * bett_x)
                    polygon([[s_a, 0], [s_a + 3.5, -bett_d], [120, -bett_d], [131, 7.8], [130, 7.8], [116, -bett_luft],
                             [41, -bett_luft], [18, 1.6], [s_a, 1.6]]);
                // Laschen, stoßen von unten an die Laschen des Schachts
                for (sx = [-1, 1], ss = lasche_s) translate([sx * (66.5 + bett_x) / 2 - (bett_x - 66.5) / 2, ss - 7, -bett_d])
                    cube([bett_x - 66.5, 14, rahmen_hoehe + bett_d]);
                // Sitze: voller Querschnitt bis zur Stirnfläche
                for (sx = [-1, 1]) am_dom(sx) translate([0, 0, -8]) cylinder(d = dom_d - 0.4, h = 8);
            }
            // Platz für den Dom und alles davor im Deck
            for (sx = [-1, 1]) am_dom(sx) cylinder(d = dom_d + 0.8, h = 20);
            // Unterseite plan
            translate([-200, -50, -bett_d - 50]) cube([400, 400, 50]);
        }
        for (sx = [-1, 1]) am_dom(sx) {
            translate([0, 0, -20]) cylinder(d = m3_frei, h = 25);
            translate([0, 0, -sitz - 25]) cylinder(d = 6.5, h = 25);   // Kopf und Schraubendreher
        }
        // USB
        translate([usb_fenster[0], usb_s - usb_fenster[2] / 2, -bett_d - 1]) linear_extrude(rahmen_hoehe)
            offset(r = 3) offset(delta = -3) square([usb_fenster[1] - usb_fenster[0], usb_fenster[2]]);
        // Laschen: Schraube von unten in den Schacht
        for (sx = [-1, 1], ss = lasche_s) translate([sx * lasche_x, ss, 0]) {
            translate([0, 0, -bett_d - 1]) cylinder(d = m3_frei, h = rahmen_hoehe + bett_d + 2);
            translate([0, 0, -bett_d - 1]) cylinder(d = 6.5, h = bett_d + 5);
        }
    }
}

module bett() { im_deck() bett_lokal(); }

module ballastdeckel() {
    difference() {
        cube([wanne[2], wanne[3], wannendeckel]);
        for (x = [4, wanne[2] - 4]) translate([x, wanne[3] / 2, -1]) cylinder(d = m3_frei, h = 5);
    }
}

// ---------------- Gerät und Stecker (nur Prüfung und Ansicht) ----------------

module m_deck() {
    im_deck() difference() {
        union() {
            intersection() {
                translate([-deck_b / 2, 0, 0]) rotate([90, 0, 90]) linear_extrude(deck_b) polygon(deck_profil);
                // Rückseite schrägt sich zu den Seiten weg [CAD]
                translate([0, 200, 0]) rotate([90, 0, 0]) linear_extrude(400)
                    polygon([[-70.02, 40], [70.02, 40], [70.02, 19.4], [67.7, 19.4], [62, 7.2], [56.3, -1],
                             [-56.3, -1], [-62, 7.2], [-67.7, 19.4], [-70.02, 19.4]]);
            }
            for (sx = [-1, 1]) am_dom(sx) cylinder(d = dom_d, h = 8);
        }
        for (sx = [-1, 1]) am_dom(sx) translate([0, 0, -20]) cylinder(d = auge_d, h = 20);
    }
}
// Echtes Elgato-Modell, nur lokal (siehe deck_aus_stp.py)
module m_deck_echt() {
    im_deck() translate([0, 32.1912, 21.98]) rotate([40.32, 0, 0]) import("lokal/deck.stl");
}
module m_deck_usb() {
    im_deck() {
        // Hals in der Mulde
        translate([-5.5, usb_s - 4, usb_z - usb_hals_l]) cube([11, 8, usb_hals_l]);
        // Gehäuse, Abgang nach rechts (Stecker lässt sich drehen)
        translate([-5, usb_s - usb_gehaeuse[1] / 2, usb_z - usb_stecker_l]) cube([usb_gehaeuse[0], usb_gehaeuse[1], usb_stecker_l - usb_hals_l]);
        translate([13, usb_s - 2.5, usb_z - usb_stecker_l + 1.5]) cube([15, 5, 5]);
    }
}
module m_pi() {
    translate([pi_x, pi_y_hinten - pi_b, pi_z]) {
        cube([pi_l, pi_b, pi_d]);
        // Buchsen laut Zeichnung: v von der USB-C-Kante, Höhe ab Platine
        for (v = [9, 27]) translate([69, pi_b - v - 7.25, pi_d]) cube([19, 14.5, 16]);
        translate([66, pi_b - 45.75 - 8, pi_d]) cube([22, 16, 13.5]);
        translate([11.2 - 4.5, pi_b - 7, pi_d]) cube([9, 8, 3.2]);
        translate([29 - 20, pi_b - 32.5 - 15, pi_d]) cube([40, 30, kuehler_h]);
        translate([7, 2, pi_d]) cube([50, 5, 8.5]);
    }
}
module m_usb_a() { // Deck-Kabel am oberen USB-Port
    translate([pi_x + 88, pi_y_hinten - 27 - 7, pi_z + pi_d + 7]) cube([stecker_usb_a_l, 14, 9]);
}
module m_rj45() {
    translate([pi_x + 88, pi_y_hinten - 45.75 - 7, pi_z + pi_d + 1]) cube([stecker_rj45_l, 14, 12]);
}
module m_strom() {
    translate([pi_x + 11.2 - 7, pi_y_hinten, pi_z + pi_d - 3]) cube([14, stecker_strom_l, 10]);
}
module m_buchse(x, t) {
    translate([x - 13, gesamt - kasten_wand - t, buchse_z - 14]) cube([26, t - 0.01, 28]);
}
module m_luefter() {
    translate([wand + 0.2, luefter_y - luefter[0] / 2, luefter_z - luefter[0] / 2]) cube([luefter[1], luefter[0], luefter[0]]);
}
module m_rs485() {
    translate([rs485_x, rs485_y, boden_d]) cube(rs485_modul);
}
module m_ballast() {
    translate([wanne[0] + 9, wanne[1] + 2.75, boden_d]) cube(ballast);
}
// ---------------- Einbaulage ----------------

module montiert(name) {
    if (name == "korpus") korpus();
    if (name == "boden") boden();
    if (name == "bett") bett();
    if (name == "kasten") kasten();
    if (name == "deck_echt") m_deck_echt();
    if (name == "ballastdeckel") translate([wanne[0], wanne[1], boden_d + wanne[4]]) ballastdeckel();
    if (name == "deck") m_deck();
    if (name == "deck_usb") m_deck_usb();
    if (name == "pi") m_pi();
    if (name == "usb_a") m_usb_a();
    if (name == "rj45") m_rj45();
    if (name == "strom") m_strom();
    if (name == "buchse_usb") m_buchse(buchse_x_usb, tiefe_usb);
    if (name == "buchse_xlr") m_buchse(buchse_x_xlr, tiefe_xlr);
    if (name == "buchse_eth") m_buchse(buchse_x_eth, tiefe_eth);
    if (name == "rs485") m_rs485();
    if (name == "luefter") m_luefter();
    if (name == "ballast") m_ballast();
}

// Drucklage
module drucklage(name) {
    if (name == "korpus") translate([0, laenge, 0]) rotate([180, 0, 0]) rotate([-neigung, 0, 0]) translate([0, 0, -h_vorn]) korpus();
    if (name == "boden") boden();
    if (name == "bett") translate([0, 0, bett_d]) bett_lokal();
    if (name == "kasten") translate([0, 0, kasten_h]) rotate([180, 0, 0]) kasten();
    if (name == "ballastdeckel") ballastdeckel();
}

// ---------------- Ansichten ----------------

farbe_korpus = "#3a3f47";
farbe_boden = "#5a6470";
farbe_rahmen = "#2b2e33";
farbe_klein = "#7f8c99";

module teile_farbig(ex = 0) {
    // ex = 0 zusammengebaut, 1 Explosion
    color(farbe_korpus) translate([0, 0, ex * 310]) montiert("korpus");
    color(farbe_rahmen) translate([0, ex * -6, ex * 80]) montiert("bett");
    color("#111418") translate([0, ex * -30, ex * 165]) montiert("deck");
    color(farbe_boden) montiert("boden");
    color(farbe_korpus) translate([0, ex * 70, ex * 30]) montiert("kasten");
    color("#2f7d4f") translate([0, 0, ex * 22]) montiert("pi");
    color(farbe_klein) translate([0, 0, ex * 45]) montiert("ballastdeckel");
    color("#9aa3ad") translate([0, 0, ex * 22]) montiert("ballast");
    color("#a05cc8") translate([0, 0, ex * 22]) montiert("rs485");
    for (n = ["buchse_usb", "buchse_xlr", "buchse_eth"]) color("#c9ccd1") translate([0, ex * 70, ex * 30]) montiert(n);
}

// Bedienelemente nur als Ansicht, Lage geschätzt
module m_bedienung() {
    im_deck() translate([0, 0, deck_rand_z]) {
        for (x = [-44.25, -14.75, 14.75, 44.25]) {
            translate([x, 28.82, -1]) color("#b8bec6") cylinder(d = 14.5, h = 13);
            for (s = [92, 114]) translate([x - 10, s - 10, 0]) color("#27c4d9") cube([20, 20, 0.6]);
        }
        translate([-54, 48, 0]) color("#e04fd0") cube([108, 14, 0.6]);
    }
}

module innenleben() {
    color(farbe_boden) montiert("boden");
    color("#2f7d4f") montiert("pi");
    color(farbe_klein) montiert("ballastdeckel");
    color("#c9a227") montiert("usb_a");
    color("#c9a227") montiert("deck_usb");
    color("#2d6cdf") montiert("rj45");
    color("#c0392b") montiert("strom");
    color("#c0392b", 0.6) montiert("buchse_usb");
    color("#a05cc8", 0.6) montiert("buchse_xlr");
    color("#2d6cdf", 0.6) montiert("buchse_eth");
    color("#a05cc8") montiert("rs485");
    color(farbe_korpus, 0.35) montiert("kasten");
    color("#555555", 0.6) montiert("luefter");
}

if (teil == "alles") { teile_farbig(0); m_bedienung(); }
else if (teil == "innen") innenleben();
else if (teil == "explosion") { teile_farbig(1); translate([0, -30, 165]) m_bedienung(); }
else if (lage == "montiert") montiert(teil);
else drucklage(teil);
