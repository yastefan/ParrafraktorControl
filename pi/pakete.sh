# Pakete, die pi/einrichten.sh und pi/wartung.sh update installieren (wird eingebunden, nicht ausgeführt).
# nodejs kommt aus dem Repository von NodeSource (siehe einrichten.sh).
#   dnsmasq-base       DHCP/DNS für das eigene WLAN (NetworkManager, ipv4.method shared)
#   fonts-dejavu-core  Pi OS Lite hat sonst keine Schrift, das Stream Deck zeigt dann keinen Text
#   build-essential, python3, cmake, libudev-dev
#                      falls node-hid oder jpeg-turbo kein passendes vorgebautes Modul finden
PAKETE=(nodejs git dnsmasq-base fonts-dejavu-core build-essential python3 cmake libudev-dev)
