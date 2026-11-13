#!/bin/bash
# Rendert die Ansichten nach bilder/. Aufruf: bash hardware/gehaeuse/ansichten.sh
cd "$(dirname "$0")"
mkdir -p bilder
r() { # Name, Kamera, weitere -D
  local name=$1 kamera=$2; shift 2
  openscad --imgsize=1600,1200 --projection=p --colorscheme=Tomorrow --camera="$kamera" "$@" -o "bilder/$name.png" gehaeuse.scad 2>&1 | grep -E "ERROR|WARNING"
}
r montiert_vorn    "78,68,55,58,0,335,540" -D 'teil="alles"'
r montiert_hinten  "78,105,40,62,0,150,620" -D 'teil="alles"'
r seite            "78,85,55,90,0,90,520" -D 'teil="alles"'
r innenleben       "78,70,35,48,0,35,420" -D 'teil="innen"'
r explosion        "78,40,215,62,0,335,1400" -D 'teil="explosion"'
exit 0
