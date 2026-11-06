#!/bin/bash
# Rendert die Ansichten nach bilder/. Aufruf: bash hardware/gehaeuse/ansichten.sh
cd "$(dirname "$0")"
mkdir -p bilder
r() { # Name, Kamera, weitere -D
  local name=$1 kamera=$2; shift 2
  openscad --imgsize=1600,1200 --projection=p --colorscheme=Tomorrow --camera="$kamera" "$@" -o "bilder/$name.png" gehaeuse.scad 2>&1 | grep -E "ERROR|WARNING"
}
r montiert_vorn    "90,75,60,58,0,335,620" -D 'teil="alles"'
r montiert_hinten  "90,100,50,62,0,150,700" -D 'teil="alles"' -D 'mit_haube=true'
r ohne_haube_hinten "90,100,50,62,0,150,620" -D 'teil="alles"' -D 'mit_haube=false'
r seite            "90,80,60,90,0,90,620" -D 'teil="alles"'
r innenleben       "90,70,40,48,0,35,470" -D 'teil="innen"'
r explosion        "90,50,120,62,0,335,1050" -D 'teil="explosion"'
