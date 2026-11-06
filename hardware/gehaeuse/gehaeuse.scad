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
teil = "alles";          // korpus, boden, bett, einsatz_d, einsatz_blind, zugentlastung, ballastdeckel, haube, alles, explosion, innen
lage = "druck";          // druck = Drucklage, montiert = Einbaulage
mit_haube = true;        // nur für die Gesamtansicht

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
usb_b = 26;              // Durchlass im Bett für Stecker und Knickschutz
usb_h = 20;
usb_stecker_l = 40;      // [ANNAHME] Stecker mit Knickschutz, gerade

/* [Grundform] */
neigung = 30;            // Grad, siehe README (stehend und am FoH)
b = 180;                 // Breite außen
h_vorn = 50;             // Höhe der Vorderkante
wand = 3.2;              // Seiten und Vorderwand
platte = 3.2;            // Oberseite, wird um das Deck zur Blende
rand_vorn = 4;           // Oberseite vor dem Schacht
rand_hinten = 24;        // Oberseite hinter dem Schacht, ergibt Tiefe für die Stecker
fase = 2;                // Kante außen
boden_d = 4;
rueck_d = 4;
luft = 0.3;              // Spiel zwischen gefügten Teilen je Seite

/* [Deck-Bett und Blende] */
// Das Deck liegt bündig im Korpus: Die Oberseite greift als Blende über seinen Rand.
// Eingesetzt wird von unten, das Bett hält es von innen.
blende = 2.5;            // Überstand auf den Rand; Tasten enden 9 mm davor [CAD]
blende_luft = 0.3;       // zwischen Rand und Blende
spiel = 0.5;             // Abstand Deck zum Schacht je Seite
rahmen_b = 5;            // Wand des Schachts und Rand des Betts
rahmen_hoehe = 10;       // Rand des Betts über der Rückplatte, darauf steht der Schacht
bett_d = 6;              // Boden des Betts unter der Rückplatte
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
pi_x = 12;               // Lage der Platine, Rand zur SD-Karte
pi_y_hinten = 88;        // Lage der Kante mit USB-C
pi_abstand = 6;          // Abstandshalter
pi_l = 85;               // [RPi]
pi_b = 56;               // [RPi]
pi_d = 1.4;
kuehler_h = 15;          // [ANNAHME] passiver Kühlkörper auf dem SoC, Höhe ab Platine
pi_loecher = [[3.5,3.5],[61.5,3.5],[3.5,52.5],[61.5,52.5]];  // [RPi] u von SD-Kante, v von USB-C-Kante

/* [Stecker im Gehäuse] */
stecker_usb_a_l = 40;    // [ANNAHME] USB-A mit Knickschutz
stecker_rj45_l = 45;     // [ANNAHME]
stecker_strom_l = 30;    // [ANNAHME] USB-C des Netzteils
kabel_d = 5;             // [ANNAHME] Netzkabel, messen
klemmung = 0.5;          // so viel drückt die Zugentlastung das Kabel zusammen
tuelle_d = 14;           // Durchgang für den USB-C-Stecker, danach Gummitülle
d_tiefe = 60;            // [ANNAHME] Panel-Buchse samt Stecker hinter der Wand

/* [Einsatzplatten] */
bucht_l = 44;            // Öffnung in der Rückwand
einsatz_b = 60;          // Platte
einsatz_d_t = 3;
einsatz_loch = 26;       // Schrauben der Platte, ± von der Mitte
bucht_z = 40;
bucht_x_rs485 = 68;
bucht_x_ethernet = 133;
neutrik_d = 24;          // Neutrik RRE8F-Z-Zeichnung: ≥ Ø24, Ø3,2, 19 × 24; für NE8FDP noch prüfen
neutrik_loch_x = 19;
neutrik_loch_y = 24;
neutrik_loch_d = 3.2;

/* [RS485-Platz] */
rs485_platz = [146, 34, 26, 50, 14];   // x, y, Breite, Tiefe, Höhe des freien Raums im Modell
rs485_boehnchen = [[150,38],[168,38],[150,78],[168,78]];

/* [Haube für Publikum] */
haube_tiefe = 65;         // RJ45/etherCON samt Knick, Stecker vorher nachmessen
haube_innen_z = 72;
haube_wand = 2.5;

/* [Ballast] */
ballast = [130, 20, 15]; // Flachstahl, etwa 306 g
wanne = [16, 5, 148, 25, 17]; // x, y, Länge, Tiefe, Höhe ohne Boden

/* [Lüfter im Korpus, rechts] */
luefter_y = 108;
luefter_z = 52;

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
function z_unten(y) = h_vorn + y * tan(neigung) - platte / cos(neigung);
leiste_y = tiefe - rueck_d - leiste_d;
x0 = wand + luft;                                         // Boden/Rückwand von links
x1 = b - wand - luft;
pi_z = boden_d + pi_abstand;

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

function aussen_punkte() = [[0, 0], [0, h_vorn], [tiefe, h_hinten], [tiefe, 0]];

// Laschen des Betts, links und rechts außen. Plattenkoordinaten
function laschen() = [for (sx = [-1, 1], ds = [-45, 45])
    [cx + sx * (deck_b / 2 + spiel + rahmen_b + 4.5), s0 + deck_h / 2 + ds]];

// ---------------- Korpus ----------------

// Schacht unter der Oberseite, trägt das Bett. Plattenkoordinaten
module schacht() {
    translate([0, 0, schacht_unten]) {
        translate([cx - deck_b / 2 - spiel - rahmen_b, s0 - spiel - rahmen_b, 0])
            linear_extrude(-schacht_unten - platte + 0.01) offset(r = 3) offset(delta = -3)
                square([deck_b + 2 * spiel + 2 * rahmen_b, deck_h + 2 * spiel + 2 * rahmen_b]);
        for (p = laschen()) translate([p[0] - 6.5, p[1] - 6.5, 0]) cube([13, 13, -schacht_unten - platte + 0.01]);
    }
}

module korpus_aussen() {
    hull() {
        profil(fase, b - fase) polygon(aussen_punkte());
        profil(0, b) offset(delta = -fase) polygon(aussen_punkte());
    }
}

module korpus_innenraum() {
    profil(wand, b - wand)
        polygon([[wand, -1], [wand, z_unten(wand)], [tiefe + 1, z_unten(tiefe + 1)], [tiefe + 1, -1]]);
}

module saeule(x, y) {
    translate([x, y, boden_d + luft]) cylinder(d = 10, h = h_hinten);
}

module innen_verstaerkung() {
    intersection() {
        korpus_innenraum();
        union() {
            for (x = [wand + 4.5, b - wand - 4.5]) saeule(x, wand + 4.5);
            for (x = [wand - eps, b - wand - leiste_b + eps])
                translate([x, leiste_y, boden_d + luft]) cube([leiste_b, leiste_d, h_hinten]);
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
hinten_z = [18, 58, 90];   // Schrauben Rückwand/Haube in die Leisten

module korpus() {
    difference() {
        union() {
            difference() { korpus_aussen(); korpus_innenraum(); }
            intersection() { korpus_aussen(); innen_verstaerkung(); }
            auf_platte() schacht();
        }
        for (p = boden_schrauben()) einsatz_von_unten(p[0], p[1]);
        // Einsätze von hinten in die Leisten
        for (x = ls_x(), z = hinten_z)
            translate([x, tiefe - rueck_d + eps, z]) rotate([90, 0, 0]) cylinder(d = einsatz_m3_d, h = einsatz_m3_t);
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
            // Einsätze für das Bett, von unten
            for (p = laschen()) translate([p[0], p[1], schacht_unten - 0.01]) cylinder(d = einsatz_m3_d, h = einsatz_m3_t);
        }
        // Lüftergitter rechts, passt für 40-mm-Lüfter (Lochabstand 32 mm)
        translate([b - wand - 1, luefter_y, luefter_z]) rotate([0, 90, 0]) {
            for (u = [-15:6:15], v = [-15:6:15]) if (norm([u, v]) < 18.5)
                translate([u, v, 0]) cylinder(d = 4, h = wand + 2);
            for (u = [-16, 16], v = [-16, 16]) translate([u, v, 0]) cylinder(d = m3_frei, h = wand + 2);
        }
    }
}

// ---------------- Boden mit Rückwand (ein Teil) ----------------

module rueckwand_platte() {
    z_o = z_unten(tiefe) - luft;
    z_i = z_unten(tiefe - rueck_d) - luft;
    profil(x0, x1) polygon([[tiefe - rueck_d, 0], [tiefe, 0], [tiefe, z_o], [tiefe - rueck_d, z_i]]);
}

module bucht_boss(x, z) {
    // 45° nach unten, damit stehend ohne Stütze druckbar
    translate([x - 4, 0, 0]) rotate([90, 0, 90]) linear_extrude(8)
        polygon([[tiefe - rueck_d + eps, z + 4], [tiefe - rueck_d - 6, z + 4],
                 [tiefe - rueck_d - 6, z - 4], [tiefe - rueck_d + eps, z - 10.5]]);
}

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
            translate([x, wanne[3] / 2, boden_d + wanne[4] - einsatz_m3_t + eps]) cylinder(d = einsatz_m3_d, h = einsatz_m3_t);
    }
}

zug_y = 120;
zug_x = 27;
zug_z = 16;

module zugblock() {
    difference() {
        translate([zug_x - 11, zug_y, 0]) cube([22, 12, zug_z]);
        translate([zug_x, zug_y - 1, zug_z + kabel_d / 2 - 1.2]) rotate([-90, 0, 0]) cylinder(d = kabel_d, h = 14);
        for (sx = [-8, 8]) translate([zug_x + sx, zug_y + 6, zug_z - einsatz_m3_t + eps]) cylinder(d = einsatz_m3_d, h = einsatz_m3_t);
    }
}

module boden() {
    difference() {
        union() {
            translate([x0, wand + luft, 0]) cube([x1 - x0, tiefe - wand - luft, boden_d]);
            rueckwand_platte();
            for (p = pi_loecher) pi_saeule(p);
            wanne();
            zugblock();
            kabelbinder_oese(120, 116);
            kabelbinder_oese(150, 116);
            for (p = rs485_boehnchen) translate([p[0], p[1], 0]) cylinder(d = 7, h = pi_z);
            for (x = [bucht_x_rs485, bucht_x_ethernet], dx = [-einsatz_loch, einsatz_loch], dz = [-einsatz_loch, einsatz_loch])
                bucht_boss(x + dx, bucht_z + dz);
        }
        // Schrauben von unten in den Korpus
        for (p = boden_schrauben()) translate([p[0], p[1], -1]) cylinder(d = m3_frei, h = boden_d + 2);
        // Köpfe versenkt, damit sie nicht auf dem Tisch aufliegen
        for (p = boden_schrauben()) translate([p[0], p[1], -1]) cylinder(d = 6.5, h = 3);
        // Pi
        for (p = pi_loecher) translate([pi_x + p[0], pi_y_hinten - p[1], pi_z - einsatz_m25_t + eps]) cylinder(d = einsatz_m25_d, h = einsatz_m25_t);
        for (p = rs485_boehnchen) translate([p[0], p[1], pi_z - einsatz_m3_t + eps]) cylinder(d = einsatz_m3_d, h = einsatz_m3_t);
        // Zuluft unter dem Pi und neben den Steckern
        for (x = [22:6:92]) translate([x, 42, -1]) hull() { cylinder(d = 3, h = boden_d + 2); translate([0, 36, 0]) cylinder(d = 3, h = boden_d + 2); }
        for (x = [106:6:140]) translate([x, 72, -1]) hull() { cylinder(d = 3, h = boden_d + 2); translate([0, 34, 0]) cylinder(d = 3, h = boden_d + 2); }
        // Befestigung am Tisch, Durchgang M5
        for (p = [[105, 38], [105, 128]]) translate([p[0], p[1], -1]) cylinder(d = 5.5, h = boden_d + 2);
        // Gummifüße, 1 mm eingelassen
        for (p = fuesse()) translate([p[0], p[1], -1]) cylinder(d = 12.5, h = 2);
        // Rückwand: Buchten
        for (x = [bucht_x_rs485, bucht_x_ethernet]) {
            translate([x - bucht_l / 2, tiefe - rueck_d - 8, bucht_z - bucht_l / 2]) cube([bucht_l, rueck_d + 9, bucht_l]);
            for (dx = [-einsatz_loch, einsatz_loch], dz = [-einsatz_loch, einsatz_loch])
                translate([x + dx, tiefe + eps, bucht_z + dz]) rotate([90, 0, 0]) cylinder(d = einsatz_m3_d, h = einsatz_m3_t + 1);
        }
        // Durchgang Strom
        translate([zug_x, tiefe + 1, zug_z + kabel_d / 2 - 1.2]) rotate([90, 0, 0]) cylinder(d = tuelle_d, h = rueck_d + 2);
        // Schrauben in die Leisten
        for (x = ls_x(), z = hinten_z) translate([x, tiefe + 1, z]) rotate([90, 0, 0]) cylinder(d = m3_frei, h = rueck_d + 2);
        // Abluft oben, senkrechte Schlitze
        for (x = [30:6:160]) translate([x, tiefe + 1, 78]) rotate([90, 0, 0]) hull() {
            cylinder(d = 3, h = rueck_d + 2);
            translate([0, 16, 0]) cylinder(d = 3, h = rueck_d + 2);
        }
    }
}

function fuesse() = [[24, 18], [b - 24, 18], [24, tiefe - 14], [b - 24, tiefe - 14]];

// ---------------- Kleine Teile, montiert liegend ----------------

// Bett in Deck-Koordinaten. Trägt das Deck: schräge Sitze auf den Domen, Haken am Tastenrand.
module bett_lokal() {
    aussen_x = deck_b / 2 + spiel + rahmen_b;
    s_a = -spiel - rahmen_b;
    s_b = deck_h + spiel + rahmen_b;
    difference() {
        union() {
            difference() {
                union() {
                    // Boden mit Rampe unter dem Reglerrand
                    translate([-aussen_x, 0, 0]) rotate([90, 0, 90]) linear_extrude(2 * aussen_x)
                        polygon([[s_a, -bett_d], [s_b, -bett_d], [s_b, 7.8], [130, 7.8], [116, -bett_luft],
                                 [41, -bett_luft], [18, 1.6], [s_a, 1.6]]);
                    // Rand
                    difference() {
                        translate([-aussen_x, s_a, -bett_d]) linear_extrude(rahmen_hoehe + bett_d)
                            offset(r = 3) offset(delta = -3) square([2 * aussen_x, s_b - s_a]);
                        translate([-deck_b / 2 - spiel, -spiel, -bett_d - 1]) linear_extrude(rahmen_hoehe + bett_d + 2)
                            offset(r = 2) offset(delta = -2) square([deck_b + 2 * spiel, deck_h + 2 * spiel]);
                    }
                    // Laschen, stoßen von unten an den Schacht
                    for (sx = [-1, 1], ds = [-45, 45]) translate([sx * (aussen_x + 4.5) - 6.5, deck_h / 2 + ds - 6.5, -bett_d])
                        cube([13, 13, rahmen_hoehe + bett_d]);
                    // Sitze: voller Querschnitt bis zur Stirnfläche
                    for (sx = [-1, 1]) am_dom(sx) translate([0, 0, -8]) cylinder(d = dom_d - 0.4, h = 8);
                }
                // Platz für den Dom und alles davor im Deck
                for (sx = [-1, 1]) am_dom(sx) cylinder(d = dom_d + 0.8, h = 20);
                // Boden unter dem Bett plan, untere Ecken 45° abgeschrägt (Platz für Ballast, Pi, Rückwand)
                translate([-200, -50, -bett_d - 50]) cube([400, 400, 50]);
                translate([-200, 0, 0]) rotate([90, 0, 90]) linear_extrude(400) {
                    polygon([[s_a - 1, -bett_d - 1], [s_a + 13, -bett_d - 1], [s_a - 1, 7]]);
                    polygon([[s_b + 1, -bett_d - 1], [s_b - 13, -bett_d - 1], [s_b + 1, 7]]);
                }
            }
        }
        for (sx = [-1, 1]) am_dom(sx) {
            translate([0, 0, -20]) cylinder(d = m3_frei, h = 25);
            translate([0, 0, -sitz - 25]) cylinder(d = 6.5, h = 25);   // Kopf und Schraubendreher
        }
        // USB
        translate([-usb_b / 2, usb_s - usb_h / 2, -bett_d - 1]) linear_extrude(rahmen_hoehe)
            offset(r = 3) offset(delta = -3) square([usb_b, usb_h]);
        // Laschen: Schraube von unten in den Schacht
        for (sx = [-1, 1], ds = [-45, 45]) translate([sx * (aussen_x + 4.5), deck_h / 2 + ds, 0]) {
            translate([0, 0, -bett_d - 1]) cylinder(d = m3_frei, h = rahmen_hoehe + bett_d + 2);
            translate([0, 0, -bett_d - 1]) cylinder(d = 6.5, h = bett_d + rahmen_hoehe - 6 + 1);
        }
    }
}

module bett() { im_deck() bett_lokal(); }

module einsatz_grund() {
    difference() {
        translate([-einsatz_b / 2, -einsatz_b / 2, 0]) cube([einsatz_b, einsatz_b, einsatz_d_t]);
        for (dx = [-einsatz_loch, einsatz_loch], dy = [-einsatz_loch, einsatz_loch])
            translate([dx, dy, -1]) cylinder(d = m3_frei, h = einsatz_d_t + 2);
    }
}

module einsatz_blind() { einsatz_grund(); }

module einsatz_d() {
    difference() {
        einsatz_grund();
        translate([0, 0, -1]) cylinder(d = neutrik_d, h = einsatz_d_t + 2);
        for (sx = [-1, 1], sy = [-1, 1]) translate([sx * neutrik_loch_x / 2, sy * neutrik_loch_y / 2, -1])
            cylinder(d = neutrik_loch_d, h = einsatz_d_t + 2);
    }
}

// Einbaulage: Platte außen an der Rückwand, Oberseite zeigt nach hinten
module an_bucht(x) { translate([x, tiefe, bucht_z]) rotate([-90, 0, 0]) children(); }

module zugentlastung() {
    difference() {
        translate([-11, -6, 0]) cube([22, 12, 6]);
        translate([0, -7, kabel_d / 2 - 1.2 - klemmung]) rotate([-90, 0, 0]) cylinder(d = kabel_d, h = 14);
        for (sx = [-8, 8]) translate([sx, 0, -1]) cylinder(d = m3_frei, h = 8);
    }
}

module ballastdeckel() {
    difference() {
        cube([wanne[2], wanne[3], 3]);
        for (x = [4, wanne[2] - 4]) translate([x, wanne[3] / 2, -1]) cylinder(d = m3_frei, h = 5);
    }
}

// Haube in Einbaulage, deckt Stecker und Schrauben ab. Kabel laufen unten heraus.
module haube() {
    hb = x1 - x0;
    difference() {
        union() {
            difference() {
                translate([x0, tiefe, 0]) cube([hb, haube_tiefe, haube_innen_z + haube_wand]);
                translate([x0 + haube_wand, tiefe - 1, -1]) cube([hb - 2 * haube_wand, haube_tiefe - haube_wand + 1, haube_innen_z + 1]);
            }
            for (x = ls_x(), z = hinten_z) if (z < haube_innen_z) {
                richtung = x < cx ? 1 : -1;
                seite = x < cx ? x0 + haube_wand - eps : x1 - haube_wand + eps;
                innen = x + richtung * 6.5;
                translate([0, 0, z - 6]) linear_extrude(12) polygon([
                    [seite, tiefe], [innen, tiefe], [innen, tiefe + 6],
                    [seite, tiefe + 6 + abs(innen - seite)]]);
            }
        }
        for (x = ls_x(), z = hinten_z) if (z < haube_innen_z) {
            translate([x, tiefe - 1, z]) rotate([-90, 0, 0]) cylinder(d = m3_frei, h = 8);
            translate([x, tiefe + 5, z]) rotate([-90, 0, 0]) cylinder(d = 6.5, h = haube_tiefe);
        }
    }
}

// ---------------- Gerät und Stecker (nur Prüfung und Ansicht) ----------------

module m_deck() {
    im_deck() difference() {
        union() {
            translate([-deck_b / 2, 0, 0]) rotate([90, 0, 90]) linear_extrude(deck_b) polygon(deck_profil);
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
    im_deck() translate([-7, usb_s - 4.5, usb_z - usb_stecker_l]) cube([14, 9, usb_stecker_l]);
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
module m_kabel_klemme() {
    translate([zug_x, zug_y - 1, zug_z + kabel_d / 2 - 1.2]) rotate([-90, 0, 0]) cylinder(d = kabel_d, h = tiefe - zug_y + 1);
}
module m_d_innen(x) {
    translate([x - 13, tiefe - rueck_d - d_tiefe, bucht_z - 13]) cube([26, d_tiefe + rueck_d - 0.1, 26]);
}
module m_rs485() {
    translate([rs485_platz[0], rs485_platz[1], pi_z]) cube([rs485_platz[2], rs485_platz[3], rs485_platz[4]]);
}
module m_ballast() {
    translate([wanne[0] + 9, wanne[1] + 2.5, boden_d]) cube(ballast);
}
module m_luefter() {
    translate([b - wand - 10.5, luefter_y - 20, luefter_z - 20]) cube([10, 40, 40]);
}

// ---------------- Einbaulage ----------------

module montiert(name) {
    if (name == "korpus") korpus();
    if (name == "boden") boden();
    if (name == "bett") bett();
    if (name == "deck_echt") m_deck_echt();
    if (name == "einsatz_ethernet") an_bucht(bucht_x_ethernet) einsatz_d();
    if (name == "einsatz_rs485") an_bucht(bucht_x_rs485) einsatz_blind();
    if (name == "zugentlastung") translate([zug_x, zug_y + 6, zug_z]) zugentlastung();
    if (name == "ballastdeckel") translate([wanne[0], wanne[1], boden_d + wanne[4]]) ballastdeckel();
    if (name == "haube") haube();
    if (name == "deck") m_deck();
    if (name == "deck_usb") m_deck_usb();
    if (name == "pi") m_pi();
    if (name == "usb_a") m_usb_a();
    if (name == "rj45") m_rj45();
    if (name == "strom") m_strom();
    if (name == "d_ethernet") m_d_innen(bucht_x_ethernet);
    if (name == "d_rs485") m_d_innen(bucht_x_rs485);
    if (name == "rs485") m_rs485();
    if (name == "ballast") m_ballast();
    if (name == "luefter") m_luefter();
}

// Drucklage
module drucklage(name) {
    if (name == "korpus") translate([0, laenge, 0]) rotate([180, 0, 0]) rotate([-neigung, 0, 0]) translate([0, 0, -h_vorn]) korpus();
    if (name == "boden") boden();
    if (name == "bett") translate([0, 0, bett_d]) bett_lokal();
    if (name == "einsatz_d") einsatz_d();
    if (name == "einsatz_blind") einsatz_blind();
    if (name == "zugentlastung") translate([0, 0, 6]) rotate([180, 0, 0]) zugentlastung();
    if (name == "ballastdeckel") ballastdeckel();
    if (name == "haube") translate([0, 0, tiefe + haube_tiefe]) rotate([-90, 0, 0]) haube();
}


// ---------------- Ansichten ----------------

farbe_korpus = "#3a3f47";
farbe_boden = "#5a6470";
farbe_rahmen = "#2b2e33";
farbe_klein = "#7f8c99";

module teile_farbig(ex = 0) {
    // ex = 0 zusammengebaut, 1 Explosion
    color(farbe_korpus) translate([0, 0, ex * 370]) montiert("korpus");
    color(farbe_rahmen) translate([0, ex * -6, ex * 100]) montiert("bett");
    color("#111418") translate([0, ex * -30, ex * 185]) montiert("deck");
    color(farbe_boden) montiert("boden");
    color("#2f7d4f") translate([0, 0, ex * 22]) montiert("pi");
    color(farbe_klein) translate([0, 0, ex * 45]) montiert("ballastdeckel");
    color("#9aa3ad") translate([0, 0, ex * 22]) montiert("ballast");
    color(farbe_klein) translate([0, 0, ex * 35]) montiert("zugentlastung");
    color("#d08a2b") translate([0, ex * 30, 0]) montiert("einsatz_ethernet");
    color("#d08a2b") translate([0, ex * 30, 0]) montiert("einsatz_rs485");
    if (mit_haube) color(farbe_rahmen) translate([0, ex * 95, 0]) montiert("haube");
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
    color(farbe_klein) montiert("zugentlastung");
    color("#d08a2b") montiert("einsatz_ethernet");
    color("#d08a2b") montiert("einsatz_rs485");
    color("#c9a227") montiert("usb_a");
    color("#c9a227") montiert("deck_usb");
    color("#2d6cdf") montiert("rj45");
    color("#c0392b") montiert("strom");
    color("#2d6cdf", 0.45) montiert("d_ethernet");
    color("#a05cc8", 0.45) montiert("d_rs485");
    color("#a05cc8", 0.6) montiert("rs485");
    color("#555555", 0.5) montiert("luefter");
}

if (teil == "alles") { teile_farbig(0); m_bedienung(); }
else if (teil == "innen") innenleben();
else if (teil == "explosion") { teile_farbig(1); translate([0, -30, 185]) m_bedienung(); }
else if (lage == "montiert") montiert(teil);
else drucklage(teil);
