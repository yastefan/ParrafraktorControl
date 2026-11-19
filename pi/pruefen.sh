#!/usr/bin/env bash
# Prüft auf dem Pi, ob die Einrichtung greift: Overlay, Datenpartition, Watchdog, Logs, Dienst, Stream Deck.
# Aufruf: sudo pi/pruefen.sh
set -uo pipefail

FEHLER=0
gut() { printf '\033[32m ok \033[0m %s\n' "$*"; }
schlecht() { printf '\033[31mFEHLT\033[0m %s\n' "$*"; FEHLER=1; }
pruefe() { local text="$1"; shift; if "$@" >/dev/null 2>&1; then gut "$text"; else schlecht "$text"; fi; }

pruefe "Root schreibgeschützt (Overlay aktiv)" sh -c 'grep -q overlayroot=tmpfs /proc/cmdline && findmnt -no FSTYPE / | grep -q overlay'
pruefe "Bootpartition schreibgeschützt" sh -c 'findmnt -no OPTIONS /boot/firmware | grep -qE "(^|,)ro(,|$)"'
pruefe "Datenpartition /daten eingebunden und beschreibbar" sh -c 'findmnt -no FSTYPE /daten | grep -q ext4 && t=/daten/.schreibtest && touch $t && rm $t'
pruefe "Dienst parrafraktor läuft" systemctl is-active --quiet parrafraktor
pruefe "Dienst nutzt /daten" sh -c 'systemctl show -p Environment parrafraktor | grep -q PARRAFRAKTOR_DATEN=/daten/'
pruefe "Watchdog-Gerät vorhanden" test -e /dev/watchdog0
pruefe "systemd stößt den Watchdog an" sh -c 'systemctl show -p RuntimeWatchdogUSec | grep -qv "=0$\|=infinity$"'
pruefe "Journal nur im RAM" sh -c '! test -d /var/log/journal || [ -z "$(ls -A /var/log/journal 2>/dev/null)" ]; journalctl --header 2>/dev/null | grep -q /run/log/journal'
if nmcli -t -f NAME connection show 2>/dev/null | grep -qx parrafraktor-ap; then
  pruefe "Eigenes WLAN (parrafraktor-ap) aktiv" sh -c 'nmcli -t -f NAME connection show --active | grep -qx parrafraktor-ap'
fi
if lsusb 2>/dev/null | grep -qi 0fd9; then
  pruefe "Stream Deck: hidraw-Gerät für plugdev" sh -c 'for d in /dev/hidraw*; do udevadm info -q property -n $d | grep -q ID_VENDOR_ID=0fd9 && stat -c %G $d | grep -q plugdev && exit 0; done; exit 1'
else
  printf ' --  Stream Deck nicht eingesteckt, nicht geprüft\n'
fi

echo
echo "Watchdog:"; wdctl 2>/dev/null | sed 's/^/  /' || true
echo "Partitionen:"; lsblk -o NAME,SIZE,FSTYPE,LABEL,MOUNTPOINTS | sed 's/^/  /'
echo "Letzte Meldungen des Dienstes:"; journalctl -u parrafraktor -n 8 --no-pager | sed 's/^/  /'
exit $FEHLER
