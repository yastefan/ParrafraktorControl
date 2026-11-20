#!/usr/bin/env bash
# Schreibschutz für Wartung und Updates aus- und wieder einschalten.
#
#   sudo pi/wartung.sh aus          Overlay aus, Neustart → System beschreibbar
#   sudo pi/wartung.sh update       (bei ausgeschaltetem Overlay) apt, Pakete, git pull, npm ci, Build, Dienst neu.
#                                   Ist das eigene WLAN an, läuft es losgelöst als Dienst parrafraktor-update
#                                   (das WLAN geht dafür aus, die SSH-Verbindung darüber reißt ab):
#                                   mitlesen mit  journalctl -u parrafraktor-update -f
#   sudo pi/wartung.sh an           Overlay an, Neustart → wieder schreibgeschützt
#   pi/wartung.sh status
#
# Bequemer über den Befehl „parrafraktor“ (Menü, Hilfe), den pi/einrichten.sh anlegt.
#
# Die Datenpartition (/daten) bleibt in jedem Fall beschreibbar, Presets und Einstellungen sind davon unberührt.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
overlay_aktiv() { grep -q "overlayroot=tmpfs" /proc/cmdline; }
overlay_eingetragen() { grep -q "overlayroot=tmpfs" /boot/firmware/cmdline.txt; }
# raspi-config entfernt beim Ausschalten nur „overlayroot=tmpfs “ – mit :recurse=0 bleibt der Eintrag,
# deshalb entfernt „aus“ ihn selbst. raspi-config hängt sonst bei jedem Einschalten ein weiteres ",ro" an
boot_ro_austragen() { sed -i 's#\(/boot/firmware.*defaults\)\(,ro\)\+#\1#' /etc/fstab; }
root() { [ "$(id -u)" -eq 0 ] || { echo "bitte mit sudo starten" >&2; exit 1; }; }

case "${1:-status}" in
  aus)
    root
    raspi-config nonint do_overlayfs 1
    # Bekanntes Problem unter Trixie: der Eintrag bleibt manchmal stehen – dann von Hand entfernen
    if overlay_eingetragen; then
      mount -o remount,rw /boot/firmware
      sed -i 's/overlayroot=tmpfs[^ ]* \?//' /boot/firmware/cmdline.txt
    fi
    echo "Overlay ausgetragen, starte neu …"; sleep 2; reboot ;;
  an)
    root
    overlay_aktiv && { echo "Overlay ist schon aktiv."; exit 0; }
    boot_ro_austragen
    raspi-config nonint do_overlayfs 0
    # recurse=0: nur Root ins Overlay, /daten bleibt die echte Partition (siehe einrichten.sh)
    mount -o remount,rw /boot/firmware
    sed -i 's/overlayroot=tmpfs\( \|$\)/overlayroot=tmpfs:recurse=0\1/' /boot/firmware/cmdline.txt
    echo "Overlay eingetragen, starte neu …"; sleep 2; reboot ;;
  update)
    root
    overlay_aktiv && { echo "Erst Schreibschutz ausschalten: parrafraktor schreibschutz aus" >&2; exit 1; }
    BENUTZER="${SUDO_USER:?mit sudo als normaler Benutzer starten}"
    # Bei aktivem Overlay konnte raspi-config den Schreibschutz der Bootpartition nicht austragen;
    # Kernel-Updates schreiben dorthin
    mount -o remount,rw /boot/firmware
    # Eigenes WLAN belegt den WLAN-Chip: für das Update kurz aus, dann verbindet sich das gespeicherte
    # WLAN mit Internet (oder Internet kommt übers Kabel, wenn das Lichtnetz ein Gateway hat).
    # Wer per SSH über dieses WLAN verbunden ist, verlöre dabei die Sitzung samt Update – deshalb
    # läuft es dann losgelöst als eigener Dienst weiter.
    AP_AN=0
    # grep ohne -q: mit pipefail meldete -q sonst „aus“, wenn grep vor nmcli fertig ist (SIGPIPE)
    nmcli -t -f NAME connection show --active | grep -x parrafraktor-ap >/dev/null && AP_AN=1
    if [ "$AP_AN" = 1 ] && [ -z "${WARTUNG_LOSGELOEST:-}" ]; then
      systemctl reset-failed parrafraktor-update >/dev/null 2>&1 || true
      systemd-run --unit=parrafraktor-update --collect \
        --setenv=SUDO_USER="$BENUTZER" --setenv=WARTUNG_LOSGELOEST=1 "$REPO/pi/wartung.sh" update
      cat <<HINWEIS
Update läuft jetzt losgelöst (Dienst parrafraktor-update). Das eigene WLAN geht gleich aus,
eine SSH-Verbindung darüber reißt ab. Fertig ist es, wenn das WLAN wieder da ist (einige Minuten).
Mitlesen:   journalctl -u parrafraktor-update -f
Ergebnis:   journalctl -u parrafraktor-update --no-pager | tail -15
HINWEIS
      exit 0
    fi
    if [ "$AP_AN" = 1 ]; then
      sleep 2   # Hinweis oben kommt noch an, bevor das WLAN weg ist
      echo "Eigenes WLAN aus für das Update …"
      nmcli connection down parrafraktor-ap
      for _ in $(seq 45); do getent hosts deb.debian.org >/dev/null && break; sleep 1; done
    fi
    trap '[ "$AP_AN" = 1 ] && nmcli connection up parrafraktor-ap >/dev/null' EXIT
    getent hosts deb.debian.org >/dev/null || { echo "Kein Internet – WLAN mit Internet oder Kabel mit Gateway nötig" >&2; exit 1; }
    export DEBIAN_FRONTEND=noninteractive
    . "$REPO/pi/pakete.sh"
    apt-get update && apt-get -y full-upgrade
    apt-get install -y --no-install-recommends "${PAKETE[@]}"
    sudo -u "$BENUTZER" -H bash -c "cd '$REPO' && git pull --ff-only && npm ci --no-audit --no-fund && npm run build"
    systemctl restart parrafraktor
    echo "Fertig. Prüfen (Weboberfläche, Stream Deck), dann: parrafraktor schreibschutz an" ;;
  status)
    if overlay_aktiv; then echo "Overlay aktiv: System schreibgeschützt"; else echo "Overlay aus: System beschreibbar"; fi
    overlay_eingetragen && ! overlay_aktiv && echo "(beim nächsten Start wieder aktiv)"
    ! overlay_eingetragen && overlay_aktiv && echo "(beim nächsten Start aus)"
    findmnt /daten >/dev/null && echo "Daten: /daten eingebunden" || echo "Daten: /daten NICHT eingebunden"
    nmcli -t -f NAME connection show --active 2>/dev/null | grep -x parrafraktor-ap >/dev/null && echo "Eigenes WLAN: an"
    true ;;
  hilfe|-h|--help) awk 'NR>1 && !/^#/ {exit} NR>1 {sub(/^# ?/, ""); print}' "$0" ;;
  *) awk 'NR>1 && !/^#/ {exit} NR>1 {sub(/^# ?/, ""); print}' "$0"; exit 1 ;;
esac
