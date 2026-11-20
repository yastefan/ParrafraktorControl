#!/usr/bin/env bash
# Sets up a Raspberry Pi 4 with a freshly flashed Raspberry Pi OS Lite (64 bit, Debian 13 "Trixie")
# as a stand-alone controller for ParrafraktorControl. Goal: the Pi starts reliably, even when
# someone simply pulls the power.
#
#   - data partition: small ext4 partition behind the system, only for the data (PARRAFRAKTOR_DATEN)
#   - Node 24 from NodeSource (apt), npm ci, build
#   - systemd service that restarts after crashes, hardware watchdog
#   - journald in RAM only, no swap file, no automatic apt runs
#   - udev rule for the Stream Deck + (access without root)
#   - fixed IP in the lighting network (NetworkManager) with --ip
#   - own Wi-Fi (access point) for the iPad with --ap-ssid
#   - network menu on the Stream Deck (Wi-Fi, LAN DHCP/fixed, IP) with --net-code
#   - command "parrafraktor" (/usr/local/bin) with menu, help and the one-step update
#   - finally: system write-protected (overlay file system via raspi-config)
#
# Before the first boot, remove the word "resize" from cmdline.txt on the boot partition, so the
# system partition does not take the whole card (see README).
# RS485 (UART) is not touched: serial port and console stay as they are.
#
# Run in the repository on the Pi:
#   sudo pi/setup.sh --ip 2.0.0.50/8 [--gateway 2.0.0.1] [--root-gb 8] [--data-mb 1024] [--no-overlay] [--no-streamdeck]
#        [--ap-ssid Parrafraktor --ap-password secret123 [--ap-address 192.168.4.1/24] [--ap-band a|bg] [--country DE]]
#        [--net-code NNNN]   four digits 1–8 (keys top left 1 … bottom right 8)
#        [--interface eth0]
# Safe to run again; what is done already is skipped. The options are saved in
# /etc/parrafraktor/setup.conf: "parrafraktor setup" without options uses them again.
# --refresh (used by "parrafraktor update"): only packages, build, service and the files of the
# setup – no partitions, no network connections, protection stays as it is.
set -euo pipefail

ROOT_GB=8
DATA_MB=1024
IP=""
GATEWAY=""
OVERLAY=1
STREAMDECK=1
NODE_MAJOR=24
DATA_LABEL=pfdaten
INTERFACE=eth0
AP_SSID=""
AP_PASSWORD=""
AP_ADDRESS=192.168.4.1/24
AP_BAND=a
COUNTRY=DE
NET_CODE=""
REFRESH=0

REPO="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=pi/lib.sh
. "$REPO/pi/lib.sh"
DATA_MOUNT="$PF_DATA_MOUNT"

usage() { awk 'NR>1 && !/^#/ {exit} NR>1 {sub(/^# ?/, ""); print}' "$0"; exit "${1:-0}"; }
# The German option names (before 2026-11) are still accepted, so old saved options keep working
while [ $# -gt 0 ]; do
  case "$1" in
    --ip) IP="$2"; shift 2 ;;
    --gateway) GATEWAY="$2"; shift 2 ;;
    --root-gb) ROOT_GB="$2"; shift 2 ;;
    --data-mb|--daten-mb) DATA_MB="$2"; shift 2 ;;
    --interface|--schnittstelle) INTERFACE="$2"; shift 2 ;;
    --no-overlay|--ohne-overlay) OVERLAY=0; shift ;;
    --no-streamdeck|--ohne-streamdeck) STREAMDECK=0; shift ;;
    --ap-ssid) AP_SSID="$2"; shift 2 ;;
    --ap-password|--ap-passwort) AP_PASSWORD="$2"; shift 2 ;;
    --ap-address|--ap-adresse) AP_ADDRESS="$2"; shift 2 ;;
    --ap-band) AP_BAND="$2"; shift 2 ;;
    --country|--land) COUNTRY="$2"; shift 2 ;;
    --net-code|--netz-code) NET_CODE="$2"; shift 2 ;;
    --refresh) REFRESH=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown option: $1" >&2; usage 1 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "please run with sudo"
USER_NAME="${SUDO_USER:-}"
[ -n "$USER_NAME" ] && [ "$USER_NAME" != root ] || die "run with sudo as a normal user (the service runs as that user)"
[ -f "$REPO/package.json" ] || die "repository not found ($REPO)"
[ "$(uname -m)" = aarch64 ] || die "needs Raspberry Pi OS 64 bit (aarch64)"
# shellcheck source=/dev/null
. /etc/os-release
[ "${VERSION_CODENAME:-}" = trixie ] || note "Tested on Trixie, found: ${PRETTY_NAME:-unknown}"
if [ -n "$AP_SSID" ]; then
  [ ${#AP_PASSWORD} -ge 8 ] && [ ${#AP_PASSWORD} -le 63 ] || die "--ap-password needs 8 to 63 characters (WPA2)"
  case "$AP_BAND" in bg|a) ;; *) die "--ap-band is bg (2.4 GHz) or a (5 GHz)" ;; esac
fi
if [ -n "$NET_CODE" ] && ! [[ "$NET_CODE" =~ ^[1-8]{4}$ ]]; then
  die "--net-code needs four digits from 1 to 8 (one per key)"
fi
protect_active && die "write protection is active – turn it off first: parrafraktor protect off"

# Save the options with their English names (root only: contains the Wi-Fi password and the code)
OPTIONS=(--root-gb "$ROOT_GB" --data-mb "$DATA_MB" --interface "$INTERFACE" --ap-band "$AP_BAND" --country "$COUNTRY" --ap-address "$AP_ADDRESS")
[ -n "$IP" ] && OPTIONS+=(--ip "$IP")
[ -n "$GATEWAY" ] && OPTIONS+=(--gateway "$GATEWAY")
[ "$OVERLAY" = 0 ] && OPTIONS+=(--no-overlay)
[ "$STREAMDECK" = 0 ] && OPTIONS+=(--no-streamdeck)
[ -n "$AP_SSID" ] && OPTIONS+=(--ap-ssid "$AP_SSID" --ap-password "$AP_PASSWORD")
[ -n "$NET_CODE" ] && OPTIONS+=(--net-code "$NET_CODE")
install -d -m 0755 "$PF_ETC"
( umask 077; printf '%q ' "${OPTIONS[@]}" > "$PF_SETUP_CONF" )
rm -f "$PF_SETUP_CONF_OLD"

DATA="$DATA_MOUNT/parrafraktor"

# ---------- 1. Data partition ----------
if [ "$REFRESH" = 0 ]; then
  step "Data partition"
  ROOT_DEV="$(findmnt -no SOURCE /)"
  case "$ROOT_DEV" in
    /dev/mmcblk*p2) DISK="${ROOT_DEV%p2}"; PPREFIX="${DISK}p" ;;
    /dev/sd*2|/dev/nvme*p2) die "the system does not run from the SD card ($ROOT_DEV) – this script is for SD cards" ;;
    *) die "unexpected system partition $ROOT_DEV" ;;
  esac
  DATA_DEV="${PPREFIX}3"
  NAME="$(basename "$DISK")"

  if [ -b "$DATA_DEV" ]; then
    echo "Partition 3 ($DATA_DEV) exists already."
  else
    # Sizes in sectors of 512 bytes (as /sys/block counts)
    CARD=$(cat "/sys/block/$NAME/size")
    START2=$(cat "/sys/block/$NAME/${NAME}p2/start")
    SIZE2=$(cat "/sys/block/$NAME/${NAME}p2/size")
    MIB=2048
    TARGET2=$(( ROOT_GB * 1024 * MIB ))
    [ "$SIZE2" -gt "$TARGET2" ] && TARGET2=$SIZE2
    END2=$(( START2 + TARGET2 ))
    START3=$(( (END2 + MIB - 1) / MIB * MIB ))
    SIZE3=$(( DATA_MB * MIB ))
    if [ $(( START3 + SIZE3 )) -gt "$CARD" ]; then
      if [ $(( START2 + SIZE2 + MIB )) -ge "$CARD" ]; then
        die "The system partition already takes the whole card – it was grown on the first boot.
  Flash the card again and remove \"resize\" from cmdline.txt BEFORE the first boot (README, section Raspberry Pi)."
      fi
      die "Not enough space: system ${ROOT_GB} GiB + data ${DATA_MB} MiB do not fit on the card (choose smaller --root-gb/--data-mb)"
    fi
    if [ "$TARGET2" -gt "$SIZE2" ]; then
      echo "Growing the system partition to ${ROOT_GB} GiB …"
      echo "${START2},${TARGET2}" | sfdisk --force --no-reread --no-tell-kernel -N 2 "$DISK"
      partx -u --nr 2 "$DISK"
      resize2fs "$ROOT_DEV"
    fi
    echo "Creating the data partition with ${DATA_MB} MiB …"
    echo "${START3},${SIZE3},83" | sfdisk --force --no-reread --no-tell-kernel --append "$DISK"
    partx -a --nr 3 "$DISK" || true
    udevadm settle
    [ -b "$DATA_DEV" ] || die "the kernel does not know $DATA_DEV yet – reboot once (sudo reboot) and run the script again"
  fi

  FSTYPE="$(blkid -o value -s TYPE "$DATA_DEV" || true)"
  if [ -z "$FSTYPE" ]; then
    # Journal with checksums (metadata_csum is the default), no space reserved for root
    mkfs.ext4 -F -q -L "$DATA_LABEL" -m 0 "$DATA_DEV"
  elif [ "$FSTYPE" != ext4 ]; then
    die "$DATA_DEV already holds a file system ($FSTYPE) – please check, nothing was overwritten"
  fi

  # data=journal: file contents go through the journal too, commit=5: on the card after 5 s at the latest.
  # nofail: without the partition the system still starts (the service then uses its defaults).
  # fsck pass 2: repairs at boot what a power cut left behind.
  FSTAB_LINE="LABEL=$DATA_LABEL $DATA_MOUNT ext4 defaults,noatime,data=journal,commit=5,nofail,x-systemd.device-timeout=10s 0 2"
  mkdir -p "$DATA_MOUNT"
  if grep "LABEL=$DATA_LABEL" /etc/fstab >/dev/null; then
    sed -i "\#LABEL=$DATA_LABEL#c\\$FSTAB_LINE" /etc/fstab
  else
    echo "$FSTAB_LINE" >> /etc/fstab
  fi
  systemctl daemon-reload
  mountpoint -q "$DATA_MOUNT" || mount "$DATA_MOUNT"
fi
mountpoint -q "$DATA_MOUNT" || die "$DATA_MOUNT is not mounted"
mkdir -p "$DATA"
# Take over existing data from the repository (first time only)
if [ -d "$REPO/daten" ] && [ -z "$(ls -A "$DATA")" ]; then
  cp -a "$REPO/daten/." "$DATA/"
  echo "Copied daten/ from the repository to $DATA."
fi
chown -R "$USER_NAME:" "$DATA"

# ---------- 2. Node and build ----------
step "Node and build"
apt-get update
# Node 24 from NodeSource instead of Node 20 from Debian: the Stream Deck pulls in @julusian/jpeg-turbo 3.x
# (peer of @elgato-stream-deck/node-lib), which needs Node ≥ 22.18. If that fails, npm silently drops
# the whole Stream Deck package including node-hid. Node 20 is also unmaintained since April 2026.
apt-get install -y --no-install-recommends ca-certificates curl gnupg
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list
# NodeSource before Debian, even if Debian ever offers a higher version
printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 1001\n' > /etc/apt/preferences.d/nodesource
# npm and node-gyp from Debian clash with the nodejs from NodeSource (which brings npm)
apt-get remove -y npm node-gyp >/dev/null 2>&1 || true
apt-get update
# shellcheck source=pi/packages.sh
. "$REPO/pi/packages.sh"
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${PACKAGES[@]}"
NODE_VERSION="$(node -p 'process.versions.node')"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)' \
  || die "Node $NODE_VERSION is too old (the Stream Deck needs 22.18 or newer)"
echo "Node $NODE_VERSION"
sudo -u "$USER_NAME" -H bash -c "cd '$REPO' && npm ci --no-audit --no-fund && npm run build"
# npm silently drops optional packages on errors – complain loudly here
if [ "$STREAMDECK" -eq 1 ]; then
  if ! sudo -u "$USER_NAME" -H bash -c "cd '$REPO/server' && node -e 'require(\"node-hid\"); require(\"@napi-rs/canvas\")'" ; then
    die "Stream Deck packages missing or not loading (node-hid, @napi-rs/canvas).
  Show the cause:  grep -h \"failed optional\" ~/.npm/_logs/*-debug-0.log | grep -v -e rollup -e esbuild -e canvas-
  Continue without Stream Deck:  sudo pi/setup.sh … --no-streamdeck"
  fi
  echo "Stream Deck packages load."
fi

# ---------- 3. Stream Deck + ----------
step "udev rule Stream Deck"
cat > /etc/udev/rules.d/50-elgato-stream-deck.rules <<'EOF'
# Elgato Stream Deck (vendor 0fd9): access for the group plugdev, so the service runs without root
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", MODE="0660", GROUP="plugdev", TAG+="uaccess"
KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", MODE="0660", GROUP="plugdev", TAG+="uaccess"
EOF
udevadm control --reload-rules
udevadm trigger --subsystem-match=usb --subsystem-match=hidraw || true
# plugdev for the Stream Deck, dialout for RS485 over UART (later)
usermod -aG plugdev,dialout "$USER_NAME"

# ---------- 4. Service ----------
step "systemd service"
# HTTP on the standard port 80: the bare address (192.168.4.1) works in every browser. HTTPS deliberately
# NOT on 443 but on 8443, only for the iPad app (offline cache): Firefox and Chrome try HTTPS on 443 first
# for a typed address and get stuck at the mkcert certificate authority instead of falling back to HTTP.
# If nobody answers on 443, they silently fall back to 80.
TLS_LINES="Environment=PORT=80"
if [ -f "$REPO/zertifikate/server.pem" ] && [ -f "$REPO/zertifikate/server-key.pem" ]; then
  TLS_LINES="Environment=PORT=8443 HTTP_PORT=80 TLS_CERT=zertifikate/server.pem TLS_KEY=zertifikate/server-key.pem"
  echo "Certificates found: HTTP on port 80, HTTPS on port 8443 (iPad app)"
fi
# With the network menu the service calls the helper via sudo; a CapabilityBoundingSet would keep sudo
# from becoming root, so then without. Without the network menu the service keeps just this one right.
RIGHTS_LINES="CapabilityBoundingSet=CAP_NET_BIND_SERVICE"
if [ -n "$NET_CODE" ]; then
  RIGHTS_LINES="Environment=PARRAFRAKTOR_NETZ_CODE=$NET_CODE PARRAFRAKTOR_NETZ_SCHNITTSTELLE=$INTERFACE"
fi
cat > "$PF_SYSTEMD/parrafraktor.service" <<EOF
[Unit]
Description=ParrafraktorControl
# Data partition if present – without it the service starts anyway
Wants=network-online.target daten.mount
After=network-online.target daten.mount
# Never give up: nobody is around in an exhibition to restart it
StartLimitIntervalSec=0

[Service]
User=$USER_NAME
WorkingDirectory=$REPO
Environment=NODE_ENV=production PARRAFRAKTOR_DATEN=$DATA
$TLS_LINES
# Ports below 1024 without root: just this one right
AmbientCapabilities=CAP_NET_BIND_SERVICE
$RIGHTS_LINES
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=2
# SIGTERM: the server releases the mirrors and writes what is pending
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable parrafraktor.service
systemctl restart parrafraktor.service

# ---------- 5. Watchdog ----------
step "Hardware watchdog"
# bcm2835-wdt: at most just under 16 s. systemd feeds it every 7.5 s; if the system hangs, the Pi reboots.
CONFIG="$PF_BOOT/config.txt"
boot_rw
grep '^dtparam=watchdog=on' "$CONFIG" >/dev/null || printf '\n# ParrafraktorControl: hardware watchdog\ndtparam=watchdog=on\n' >> "$CONFIG"
mkdir -p /etc/systemd/system.conf.d
cat > /etc/systemd/system.conf.d/50-parrafraktor-watchdog.conf <<'EOF'
[Manager]
RuntimeWatchdogSec=15
RebootWatchdogSec=2min
EOF

# ---------- 6. Avoid writes ----------
step "Logs in RAM, no swap file, no automatic apt runs"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/50-parrafraktor.conf <<'EOF'
[Journal]
Storage=volatile
RuntimeMaxUse=32M
EOF
# Swap file on the card (older images); zram swap from rpi-swap lives in RAM and stays
if systemctl list-unit-files dphys-swapfile.service >/dev/null 2>&1; then
  systemctl disable --now dphys-swapfile.service || true
fi
for t in apt-daily.timer apt-daily-upgrade.timer man-db.timer; do
  systemctl disable --now "$t" 2>/dev/null || true
done
# cloud-init (Raspberry Pi Imager) would take every boot for the first one with the overlay
# and e.g. create new SSH host keys
if [ -d /etc/cloud ]; then
  touch /etc/cloud/cloud-init.disabled
fi

# ---------- 7. Network connections (not on --refresh: they may have been changed in the network menu) ----------
if [ "$REFRESH" = 0 ]; then
  step "Network"
  if [ -n "$IP" ]; then
    CONN=lichtnetz
    nmcli connection delete "$CONN" >/dev/null 2>&1 || true
    ARGS=(type ethernet ifname "$INTERFACE" con-name "$CONN" ipv4.method manual ipv4.addresses "$IP"
          ipv6.method disabled connection.autoconnect yes connection.autoconnect-priority 100)
    # Without a gateway no default route via the lighting network (internet e.g. via Wi-Fi stays)
    if [ -n "$GATEWAY" ]; then ARGS+=(ipv4.gateway "$GATEWAY"); else ARGS+=(ipv4.never-default yes); fi
    nmcli connection add "${ARGS[@]}"
    echo "Fixed IP $IP on $INTERFACE (applies after the next boot or as soon as the cable is plugged in)."
  else
    note "No --ip given: $INTERFACE stays on DHCP"
  fi

  step "Own Wi-Fi (access point)"
  if [ -n "$AP_SSID" ]; then
    raspi-config nonint do_wifi_country "$COUNTRY"
    rfkill unblock wlan || true
    nmcli connection delete "$PF_AP" >/dev/null 2>&1 || true
    # Fixed channel (6 or 36), WPA2 with CCMP; PMF off and power saving off – both make the Pi's Wi-Fi
    # chip unreliable as an access point in our experience. ipv4.method shared: NetworkManager hands
    # out addresses via DHCP, without forwarding into the lighting network (no default route via Wi-Fi).
    CHANNEL=6; [ "$AP_BAND" = a ] && CHANNEL=36
    nmcli connection add type wifi ifname wlan0 con-name "$PF_AP" ssid "$AP_SSID" \
      802-11-wireless.mode ap 802-11-wireless.band "$AP_BAND" 802-11-wireless.channel "$CHANNEL" \
      802-11-wireless.powersave 2 \
      wifi-sec.key-mgmt wpa-psk wifi-sec.proto rsn wifi-sec.pairwise ccmp wifi-sec.group ccmp \
      wifi-sec.pmf disable wifi-sec.psk "$AP_PASSWORD" \
      ipv4.method shared ipv4.addresses "$AP_ADDRESS" ipv4.never-default yes ipv6.method disabled \
      connection.autoconnect yes connection.autoconnect-priority 100
    echo "Wi-Fi \"$AP_SSID\" with ${AP_ADDRESS%/*} applies after the next boot."
    echo "The previous Wi-Fi (internet) stays saved and only comes back while the access point is off (parrafraktor update does that)."
    note "Whoever is connected via Wi-Fi now reaches the Pi after the reboot via \"$AP_SSID\" at ${AP_ADDRESS%/*}."
  else
    echo "No --ap-ssid: no own Wi-Fi."
  fi
fi

# ---------- 8. Network menu on the Stream Deck ----------
step "Network menu"
# Name, argument "anwenden" and the file netz.json are shared with the server (server/src/netz.ts)
NET_HELPER=/usr/local/sbin/parrafraktor-netz
if [ -n "$NET_CODE" ]; then
  # Helper owned by root outside the repository: inside the repository the user could change it
  # and run it as root via sudo
  sed -e "s#@DATA@#$DATA#" -e "s#@INTERFACE@#$INTERFACE#" "$REPO/pi/network.sh" > "$NET_HELPER.new"
  install -o root -g root -m 0755 "$NET_HELPER.new" "$NET_HELPER"
  rm -f "$NET_HELPER.new"
  SUDOERS=/etc/sudoers.d/parrafraktor-netz
  printf '%s ALL=(root) NOPASSWD: %s anwenden\n' "$USER_NAME" "$NET_HELPER" > "$SUDOERS.new"
  visudo -cf "$SUDOERS.new" >/dev/null || die "sudoers rule invalid"
  install -o root -g root -m 0440 "$SUDOERS.new" "$SUDOERS"
  rm -f "$SUDOERS.new"
  # Initial values if there are none yet: as set up above
  if [ ! -f "$DATA/netz.json" ]; then
    START_IP="${IP:-2.0.0.50/8}"
    AP_JSON=false; [ -n "$AP_SSID" ] && AP_JSON=true
    MODE_JSON=fest; [ -z "$IP" ] && MODE_JSON=dhcp
    python3 -I - "$START_IP" "$AP_JSON" "$MODE_JSON" > "$DATA/netz.json" <<'PY'
import json, sys
address, prefix = sys.argv[1].split("/")
print(json.dumps({"ap": sys.argv[2] == "true", "lan": {"modus": sys.argv[3],
  "adresse": [int(x) for x in address.split(".")], "praefix": int(prefix)}}, indent=2))
PY
    chown "$USER_NAME:" "$DATA/netz.json"
  fi
  # Apply at boot: with write protection, nmcli changes only live in RAM
  cat > "$PF_SYSTEMD/parrafraktor-netz.service" <<EOF
[Unit]
Description=ParrafraktorControl: apply network settings from $DATA/netz.json
After=NetworkManager.service daten.mount
Wants=NetworkManager.service daten.mount

[Service]
Type=oneshot
ExecStart=$NET_HELPER anwenden

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable parrafraktor-netz.service
  echo "Network menu on: in the main menu hold Output, add Order, hold both 2 s, then the code."
else
  rm -f "$NET_HELPER" /etc/sudoers.d/parrafraktor-netz
  if [ -f "$PF_SYSTEMD/parrafraktor-netz.service" ]; then
    systemctl disable parrafraktor-netz.service || true
    rm -f "$PF_SYSTEMD/parrafraktor-netz.service"
    systemctl daemon-reload
  fi
  echo "No --net-code: no network menu."
fi

# ---------- 9. Command parrafraktor and update unit ----------
step "Command parrafraktor"
ln -sfn "$REPO/pi/parrafraktor" "$PF_BIN"
install_update_unit
echo "From now on: \"parrafraktor\" (menu) or \"parrafraktor help\"."

# ---------- 10. Write protection ----------
if [ "$REFRESH" = 1 ]; then
  # parrafraktor update turns the protection on itself (with the overlay module in the initramfs)
  step "Done (refresh)"
  exit 0
fi
step "Write protection (overlay file system)"
if [ "$OVERLAY" -eq 1 ]; then
  protect_enable || die "turning the protection on failed"
  echo "Protection is configured and applies after the next boot."
else
  note "Protection not turned on (--no-overlay)"
fi

step "Done"
cat <<EOF
Reboot now:      sudo reboot
Then check:      parrafraktor check   (everything else: parrafraktor)
Web interface:   http://<IP> (with certificate for the iPad app https://<IP>:8443)${AP_SSID:+
iPad:            Wi-Fi "$AP_SSID", then https://${AP_ADDRESS%/*}:8443 (or http://${AP_ADDRESS%/*})}
Data:            $DATA
EOF
