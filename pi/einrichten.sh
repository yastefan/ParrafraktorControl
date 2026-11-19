#!/usr/bin/env bash
# Richtet einen Raspberry Pi 4 mit frisch geflashtem Raspberry Pi OS Lite (64 Bit, Debian 13 „Trixie“)
# als eigenständiges Steuergerät für ParrafraktorControl ein. Ziel: Der Pi startet zuverlässig,
# auch wenn einfach der Strom gezogen wird.
#
#   - Datenpartition: kleine ext4-Partition hinter dem System, nur für daten/ (PARRAFRAKTOR_DATEN)
#   - Node 20 aus Debian, npm ci, Build
#   - systemd-Dienst mit Neustart bei Absturz, Hardware-Watchdog
#   - journald nur im RAM, keine Swap-Datei, keine automatischen apt-Läufe
#   - udev-Regel fürs Stream Deck + (Zugriff ohne root)
#   - feste IP im Lichtnetz (NetworkManager), wenn --ip angegeben
#   - eigenes WLAN (Access Point) fürs iPad, wenn --ap-ssid angegeben
#   - zum Schluss: System schreibgeschützt (Overlay-Dateisystem über raspi-config)
#
# Voraussetzung: Vor dem ersten Start auf der Bootpartition in cmdline.txt das Wort „resize“
# entfernt, damit die Systempartition nicht die ganze Karte belegt (siehe README).
# RS485 (UART) wird hier nicht angefasst: serielle Schnittstelle und Konsole bleiben, wie sie sind.
#
# Aufruf im Repo auf dem Pi:
#   sudo pi/einrichten.sh --ip 2.0.0.50/8 [--gateway 2.0.0.1] [--root-gb 8] [--daten-mb 1024] [--ohne-overlay] [--ohne-streamdeck]
#        [--ap-ssid Parrafraktor --ap-passwort geheim123 [--ap-adresse 192.168.4.1/24] [--ap-band a|bg] [--land DE]]
# Läuft mehrfach ohne Schaden; was schon erledigt ist, wird übersprungen.
set -euo pipefail

ROOT_GB=8
DATEN_MB=1024
IP=""
GATEWAY=""
OVERLAY=1
STREAMDECK=1
DATEN_LABEL=pfdaten
DATEN_MOUNT=/daten
SCHNITTSTELLE=eth0
AP_SSID=""
AP_PASSWORT=""
AP_ADRESSE=192.168.4.1/24
AP_BAND=a
LAND=DE

hilfe() { awk 'NR>1 && !/^#/ {exit} NR>1 {sub(/^# ?/, ""); print}' "$0"; exit "${1:-0}"; }
while [ $# -gt 0 ]; do
  case "$1" in
    --ip) IP="$2"; shift 2 ;;
    --gateway) GATEWAY="$2"; shift 2 ;;
    --root-gb) ROOT_GB="$2"; shift 2 ;;
    --daten-mb) DATEN_MB="$2"; shift 2 ;;
    --schnittstelle) SCHNITTSTELLE="$2"; shift 2 ;;
    --ohne-overlay) OVERLAY=0; shift ;;
    --ohne-streamdeck) STREAMDECK=0; shift ;;
    --ap-ssid) AP_SSID="$2"; shift 2 ;;
    --ap-passwort) AP_PASSWORT="$2"; shift 2 ;;
    --ap-adresse) AP_ADRESSE="$2"; shift 2 ;;
    --ap-band) AP_BAND="$2"; shift 2 ;;
    --land) LAND="$2"; shift 2 ;;
    -h|--help) hilfe 0 ;;
    *) echo "Unbekannte Option: $1" >&2; hilfe 1 ;;
  esac
done

schritt() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
hinweis() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
abbruch() { printf '\033[1;31mAbbruch: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || abbruch "bitte mit sudo starten"
BENUTZER="${SUDO_USER:-}"
[ -n "$BENUTZER" ] && [ "$BENUTZER" != root ] || abbruch "mit sudo als normaler Benutzer starten (der Dienst läuft unter diesem Benutzer)"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$REPO/package.json" ] || abbruch "Repo nicht gefunden ($REPO)"
[ "$(uname -m)" = aarch64 ] || abbruch "braucht Raspberry Pi OS 64 Bit (aarch64)"
. /etc/os-release
[ "${VERSION_CODENAME:-}" = trixie ] || hinweis "Getestet für Trixie, gefunden: ${PRETTY_NAME:-unbekannt}"
if [ -n "$AP_SSID" ]; then
  [ ${#AP_PASSWORT} -ge 8 ] && [ ${#AP_PASSWORT} -le 63 ] || abbruch "--ap-passwort braucht 8 bis 63 Zeichen (WPA2)"
  case "$AP_BAND" in bg|a) ;; *) abbruch "--ap-band ist bg (2,4 GHz) oder a (5 GHz)" ;; esac
fi
if grep -q "overlayroot=tmpfs" /proc/cmdline; then
  abbruch "Overlay ist aktiv – erst ausschalten: sudo pi/wartung.sh aus"
fi

# ---------- 1. Datenpartition ----------
schritt "Datenpartition"
ROOT_DEV="$(findmnt -no SOURCE /)"
case "$ROOT_DEV" in
  /dev/mmcblk*p2) DISK="${ROOT_DEV%p2}"; PTEIL="${DISK}p" ;;
  /dev/sd*2|/dev/nvme*p2) abbruch "System läuft nicht von der SD-Karte ($ROOT_DEV) – dieses Skript ist für SD-Karten" ;;
  *) abbruch "unerwartete Systempartition $ROOT_DEV" ;;
esac
DATEN_DEV="${PTEIL}3"
NAME="$(basename "$DISK")"

if [ -b "$DATEN_DEV" ]; then
  echo "Partition 3 ($DATEN_DEV) gibt es schon."
else
  # Größen in Sektoren zu 512 Byte (so zählt /sys/block)
  KARTE=$(cat "/sys/block/$NAME/size")
  START2=$(cat "/sys/block/$NAME/${NAME}p2/start")
  GROESSE2=$(cat "/sys/block/$NAME/${NAME}p2/size")
  MIB=2048
  ZIEL2=$(( ROOT_GB * 1024 * MIB ))
  [ "$GROESSE2" -gt "$ZIEL2" ] && ZIEL2=$GROESSE2
  ENDE2=$(( START2 + ZIEL2 ))
  START3=$(( (ENDE2 + MIB - 1) / MIB * MIB ))
  GROESSE3=$(( DATEN_MB * MIB ))
  if [ $(( START3 + GROESSE3 )) -gt "$KARTE" ]; then
    if [ $(( START2 + GROESSE2 + MIB )) -ge "$KARTE" ]; then
      abbruch "Die Systempartition belegt schon die ganze Karte – beim ersten Start wurde sie vergrößert.
  Karte neu flashen und VOR dem ersten Start „resize“ aus cmdline.txt entfernen (README, Abschnitt Raspberry Pi)."
    fi
    abbruch "Zu wenig Platz: System ${ROOT_GB} GiB + Daten ${DATEN_MB} MiB passen nicht auf die Karte (--root-gb/--daten-mb kleiner wählen)"
  fi
  if [ "$ZIEL2" -gt "$GROESSE2" ]; then
    echo "Systempartition auf ${ROOT_GB} GiB vergrößern …"
    echo "${START2},${ZIEL2}" | sfdisk --force --no-reread --no-tell-kernel -N 2 "$DISK"
    partx -u --nr 2 "$DISK"
    resize2fs "$ROOT_DEV"
  fi
  echo "Datenpartition mit ${DATEN_MB} MiB anlegen …"
  echo "${START3},${GROESSE3},83" | sfdisk --force --no-reread --no-tell-kernel --append "$DISK"
  partx -a --nr 3 "$DISK" || true
  udevadm settle
  [ -b "$DATEN_DEV" ] || abbruch "Kernel kennt $DATEN_DEV noch nicht – einmal neu starten (sudo reboot) und das Skript erneut aufrufen"
fi

TYP="$(blkid -o value -s TYPE "$DATEN_DEV" || true)"
if [ -z "$TYP" ]; then
  # Journal mit Prüfsummen (metadata_csum ist Vorgabe), kein reservierter Platz für root
  mkfs.ext4 -F -q -L "$DATEN_LABEL" -m 0 "$DATEN_DEV"
elif [ "$TYP" != ext4 ]; then
  abbruch "$DATEN_DEV enthält schon ein Dateisystem ($TYP) – bitte prüfen, nichts überschrieben"
fi

# data=journal: auch Dateiinhalte gehen durchs Journal, commit=5: spätestens nach 5 s auf der Karte.
# nofail: fehlt die Partition, startet das System trotzdem (der Dienst nimmt dann die Vorgaben).
# Prüfreihenfolge 2: fsck repariert beim Start, was ein Stromausfall hinterlassen hat.
FSTAB="LABEL=$DATEN_LABEL $DATEN_MOUNT ext4 defaults,noatime,data=journal,commit=5,nofail,x-systemd.device-timeout=10s 0 2"
mkdir -p "$DATEN_MOUNT"
if grep -q "LABEL=$DATEN_LABEL" /etc/fstab; then
  sed -i "\#LABEL=$DATEN_LABEL#c\\$FSTAB" /etc/fstab
else
  echo "$FSTAB" >> /etc/fstab
fi
systemctl daemon-reload
mountpoint -q "$DATEN_MOUNT" || mount "$DATEN_MOUNT"
DATEN="$DATEN_MOUNT/parrafraktor"
mkdir -p "$DATEN"
# Vorhandene Daten aus dem Repo übernehmen (nur beim ersten Mal)
if [ -d "$REPO/daten" ] && [ -z "$(ls -A "$DATEN")" ]; then
  cp -a "$REPO/daten/." "$DATEN/"
  echo "daten/ aus dem Repo nach $DATEN kopiert."
fi
chown -R "$BENUTZER:" "$DATEN"

# ---------- 2. Node und Build ----------
schritt "Node und Build"
apt-get update
# dnsmasq-base: DHCP/DNS für das eigene WLAN (NetworkManager, ipv4.method shared)
# build-essential, python3, node-gyp, libudev-dev: falls node-hid (Stream Deck) kein passendes
# vorgebautes Modul findet, baut npm es selbst – ohne diese Pakete fällt das Stream Deck still weg
apt-get install -y --no-install-recommends nodejs npm git dnsmasq-base \
  build-essential python3 node-gyp libudev-dev
NODE_VERSION="$(node -p 'process.versions.node')"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=19)?0:1)' \
  || abbruch "Node $NODE_VERSION ist zu alt (Vite braucht 20.19 oder neuer)"
echo "Node $NODE_VERSION"
sudo -u "$BENUTZER" -H bash -c "cd '$REPO' && npm ci --no-audit --no-fund && npm run build"
# Optionale Pakete lässt npm bei Fehlern still weg – hier laut werden
if [ "$STREAMDECK" -eq 1 ]; then
  if ! sudo -u "$BENUTZER" -H bash -c "cd '$REPO/server' && node -e 'require(\"node-hid\"); require(\"@napi-rs/canvas\")'" ; then
    abbruch "Stream-Deck-Pakete fehlen oder laden nicht (node-hid, @napi-rs/canvas).
  Ursache anzeigen:  cd $REPO && npm rebuild node-hid --foreground-scripts
  Ohne Stream Deck weiter:  sudo pi/einrichten.sh … --ohne-streamdeck"
  fi
  echo "Stream-Deck-Pakete geladen."
fi

# ---------- 3. Stream Deck + ----------
schritt "udev-Regel Stream Deck"
cat > /etc/udev/rules.d/50-elgato-stream-deck.rules <<'EOF'
# Elgato Stream Deck (Vendor 0fd9): Zugriff für die Gruppe plugdev, damit der Dienst ohne root läuft
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", MODE="0660", GROUP="plugdev", TAG+="uaccess"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", MODE="0660", GROUP="plugdev", TAG+="uaccess"
EOF
udevadm control --reload-rules
udevadm trigger --subsystem-match=usb --subsystem-match=hidraw || true
# plugdev fürs Stream Deck, dialout für RS485 über UART (später)
usermod -aG plugdev,dialout "$BENUTZER"

# ---------- 4. Dienst ----------
schritt "systemd-Dienst"
TLS_ZEILEN="Environment=PORT=8080"
if [ -f "$REPO/zertifikate/server.pem" ] && [ -f "$REPO/zertifikate/server-key.pem" ]; then
  TLS_ZEILEN="Environment=PORT=8443 TLS_CERT=zertifikate/server.pem TLS_KEY=zertifikate/server-key.pem"
  echo "Zertifikate gefunden: HTTPS auf Port 8443"
fi
cat > /etc/systemd/system/parrafraktor.service <<EOF
[Unit]
Description=ParrafraktorControl
# Datenpartition, wenn vorhanden – fehlt sie, startet der Dienst trotzdem
Wants=network-online.target daten.mount
After=network-online.target daten.mount
# Nie aufgeben: in der Ausstellung ist niemand da, der neu startet
StartLimitIntervalSec=0

[Service]
User=$BENUTZER
WorkingDirectory=$REPO
Environment=NODE_ENV=production PARRAFRAKTOR_DATEN=$DATEN
$TLS_ZEILEN
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=2
# SIGTERM: Server gibt die Spiegel frei und schreibt Ausstehendes
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable parrafraktor.service
systemctl restart parrafraktor.service

# ---------- 5. Watchdog ----------
schritt "Hardware-Watchdog"
# bcm2835-wdt: höchstens knapp 16 s. systemd stößt ihn alle 7,5 s an; hängt das System, startet der Pi neu.
CONFIG=/boot/firmware/config.txt
grep -q '^dtparam=watchdog=on' "$CONFIG" || printf '\n# ParrafraktorControl: Hardware-Watchdog\ndtparam=watchdog=on\n' >> "$CONFIG"
mkdir -p /etc/systemd/system.conf.d
cat > /etc/systemd/system.conf.d/50-parrafraktor-watchdog.conf <<'EOF'
[Manager]
RuntimeWatchdogSec=15
RebootWatchdogSec=2min
EOF

# ---------- 6. Schreiben vermeiden ----------
schritt "Logs im RAM, keine Swap-Datei, keine automatischen apt-Läufe"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/50-parrafraktor.conf <<'EOF'
[Journal]
Storage=volatile
RuntimeMaxUse=32M
EOF
# Swap-Datei auf der Karte (ältere Images); zram-Swap von rpi-swap liegt im RAM und bleibt
if systemctl list-unit-files dphys-swapfile.service >/dev/null 2>&1; then
  systemctl disable --now dphys-swapfile.service || true
fi
for t in apt-daily.timer apt-daily-upgrade.timer man-db.timer; do
  systemctl disable --now "$t" 2>/dev/null || true
done
# cloud-init (Raspberry Pi Imager) würde mit Overlay jeden Start für den ersten halten
# und z. B. neue SSH-Schlüssel erzeugen
if [ -d /etc/cloud ]; then
  touch /etc/cloud/cloud-init.disabled
fi

# ---------- 7. Feste IP ----------
schritt "Netz"
if [ -n "$IP" ]; then
  VERBINDUNG=lichtnetz
  nmcli connection delete "$VERBINDUNG" >/dev/null 2>&1 || true
  ARGS=(type ethernet ifname "$SCHNITTSTELLE" con-name "$VERBINDUNG" ipv4.method manual ipv4.addresses "$IP"
        ipv6.method disabled connection.autoconnect yes connection.autoconnect-priority 100)
  # Ohne Gateway keine Standardroute übers Lichtnetz (Internet z. B. per WLAN bleibt)
  if [ -n "$GATEWAY" ]; then ARGS+=(ipv4.gateway "$GATEWAY"); else ARGS+=(ipv4.never-default yes); fi
  nmcli connection add "${ARGS[@]}"
  echo "Feste IP $IP auf $SCHNITTSTELLE (gilt ab dem nächsten Start bzw. sobald das Kabel steckt)."
else
  hinweis "Keine --ip angegeben: $SCHNITTSTELLE bleibt bei DHCP"
fi

# ---------- 7b. Eigenes WLAN ----------
schritt "WLAN-Access-Point"
if [ -n "$AP_SSID" ]; then
  AP=parrafraktor-ap
  raspi-config nonint do_wifi_country "$LAND"
  rfkill unblock wlan || true
  nmcli connection delete "$AP" >/dev/null 2>&1 || true
  # Kanal fest (6 bzw. 36), WPA2 mit CCMP; PMF aus und Stromsparen aus – beides macht der WLAN-Chip
  # des Pi als Access Point erfahrungsgemäß unzuverlässig. ipv4.method shared: NetworkManager verteilt
  # Adressen per DHCP, ohne Weiterleitung ins Lichtnetz (keine Standardroute über das WLAN).
  KANAL=6; [ "$AP_BAND" = a ] && KANAL=36
  nmcli connection add type wifi ifname wlan0 con-name "$AP" ssid "$AP_SSID" \
    802-11-wireless.mode ap 802-11-wireless.band "$AP_BAND" 802-11-wireless.channel "$KANAL" \
    802-11-wireless.powersave 2 \
    wifi-sec.key-mgmt wpa-psk wifi-sec.proto rsn wifi-sec.pairwise ccmp wifi-sec.group ccmp \
    wifi-sec.pmf disable wifi-sec.psk "$AP_PASSWORT" \
    ipv4.method shared ipv4.addresses "$AP_ADRESSE" ipv4.never-default yes ipv6.method disabled \
    connection.autoconnect yes connection.autoconnect-priority 100
  echo "WLAN „$AP_SSID“ mit ${AP_ADRESSE%/*} gilt ab dem nächsten Start."
  echo "Das bisherige WLAN (Internet) bleibt gespeichert und kommt nur, wenn der Access Point aus ist (pi/wartung.sh update)."
  hinweis "Wer gerade per WLAN verbunden ist, kommt nach dem Neustart über „$AP_SSID“ auf ${AP_ADRESSE%/*}."
else
  echo "Kein --ap-ssid: kein eigenes WLAN."
fi

# ---------- 8. Schreibschutz ----------
schritt "Overlay-Dateisystem"
if [ "$OVERLAY" -eq 1 ]; then
  # Root per Overlay im RAM, Bootpartition schreibgeschützt (eine nonint-Antwort gilt für beide Fragen)
  sed -i 's#\(/boot/firmware.*defaults\)\(,ro\)\+#\1#' /etc/fstab   # nicht doppelt bei erneutem Aufruf
  raspi-config nonint do_overlayfs 0
  echo "Overlay ist eingetragen und gilt ab dem nächsten Start."
else
  hinweis "Overlay nicht eingeschaltet (--ohne-overlay)"
fi

schritt "Fertig"
cat <<EOF
Jetzt neu starten:   sudo reboot
Danach prüfen:       sudo $REPO/pi/pruefen.sh
Weboberfläche:       http://<IP>:8080 (bzw. https://<IP>:8443 mit Zertifikat)${AP_SSID:+
iPad:                WLAN „$AP_SSID“, dann http://${AP_ADRESSE%/*}:8080}
Daten:               $DATEN
EOF
