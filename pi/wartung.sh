#!/usr/bin/env bash
# Schreibschutz für Wartung und Updates aus- und wieder einschalten.
#
#   sudo pi/wartung.sh aus          Overlay aus, Neustart → System beschreibbar
#   sudo pi/wartung.sh update       (bei ausgeschaltetem Overlay) apt, git pull, npm ci, Build, Dienst neu
#   sudo pi/wartung.sh an           Overlay an, Neustart → wieder schreibgeschützt
#   pi/wartung.sh status
#
# Die Datenpartition (/daten) bleibt in jedem Fall beschreibbar, Presets und Einstellungen sind davon unberührt.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
overlay_aktiv() { grep -q "overlayroot=tmpfs" /proc/cmdline; }
overlay_eingetragen() { grep -q "overlayroot=tmpfs" /boot/firmware/cmdline.txt; }
# raspi-config hängt sonst bei jedem Einschalten ein weiteres ",ro" an
boot_ro_austragen() { sed -i 's#\(/boot/firmware.*defaults\)\(,ro\)\+#\1#' /etc/fstab; }
root() { [ "$(id -u)" -eq 0 ] || { echo "bitte mit sudo starten" >&2; exit 1; }; }

case "${1:-status}" in
  aus)
    root
    raspi-config nonint do_overlayfs 1
    # Bekanntes Problem unter Trixie: der Eintrag bleibt manchmal stehen – dann von Hand entfernen
    if overlay_eingetragen; then
      mount -o remount,rw /boot/firmware
      sed -i 's/overlayroot=tmpfs //' /boot/firmware/cmdline.txt
    fi
    echo "Overlay ausgetragen, starte neu …"; sleep 2; reboot ;;
  an)
    root
    overlay_aktiv && { echo "Overlay ist schon aktiv."; exit 0; }
    boot_ro_austragen
    raspi-config nonint do_overlayfs 0
    echo "Overlay eingetragen, starte neu …"; sleep 2; reboot ;;
  update)
    root
    overlay_aktiv && { echo "Erst Overlay ausschalten: sudo pi/wartung.sh aus" >&2; exit 1; }
    BENUTZER="${SUDO_USER:?mit sudo als normaler Benutzer starten}"
    # Bei aktivem Overlay konnte raspi-config den Schreibschutz der Bootpartition nicht austragen;
    # Kernel-Updates schreiben dorthin
    mount -o remount,rw /boot/firmware
    apt-get update && apt-get -y full-upgrade
    sudo -u "$BENUTZER" -H bash -c "cd '$REPO' && git pull --ff-only && npm ci --no-audit --no-fund && npm run build"
    systemctl restart parrafraktor
    echo "Fertig. Prüfen (Weboberfläche, Stream Deck), dann: sudo pi/wartung.sh an" ;;
  status)
    if overlay_aktiv; then echo "Overlay aktiv: System schreibgeschützt"; else echo "Overlay aus: System beschreibbar"; fi
    overlay_eingetragen && ! overlay_aktiv && echo "(beim nächsten Start wieder aktiv)"
    ! overlay_eingetragen && overlay_aktiv && echo "(beim nächsten Start aus)"
    findmnt /daten >/dev/null && echo "Daten: /daten eingebunden" || echo "Daten: /daten NICHT eingebunden"
    true ;;
  *) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
