# Shared helpers for pi/parrafraktor and pi/setup.sh (sourced, not executed).
#
# Paths can be overridden through the environment only for the dry-run test (pi/test/run.sh);
# sudo resets the environment, and systemd starts the update unit with a clean one.
# shellcheck shell=bash

PF_DATA_MOUNT="${PF_DATA_MOUNT:-/daten}"
PF_BOOT="${PF_BOOT:-/boot/firmware}"
PF_CMDLINE="${PF_CMDLINE:-$PF_BOOT/cmdline.txt}"
PF_PROC_CMDLINE="${PF_PROC_CMDLINE:-/proc/cmdline}"
PF_FSTAB="${PF_FSTAB:-/etc/fstab}"
PF_ETC="${PF_ETC:-/etc/parrafraktor}"
PF_SYSTEMD="${PF_SYSTEMD:-/etc/systemd/system}"
PF_INITRAMFS_MODULES="${PF_INITRAMFS_MODULES:-/etc/initramfs-tools/modules}"
PF_BIN="${PF_BIN:-/usr/local/bin/parrafraktor}"
# Update state lives on the data partition: it is writable with and without protection
PF_UPDATE_DIR="${PF_UPDATE_DIR:-$PF_DATA_MOUNT/.parrafraktor-update}"
PF_AP=parrafraktor-ap           # own Wi-Fi (access point), NetworkManager connection
PF_SETUP_CONF="$PF_ETC/setup.conf"
PF_SETUP_CONF_OLD="$PF_ETC/einrichten.conf"   # written by the German setup before 2026-11

step() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
note() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------- write protection (overlayroot) ----------
# "active": the running system is protected. "configured": it will be after the next boot.
# The root file system type is the real proof; the kernel command line only says what was asked for.
protect_active() { [ "$(findmnt -no FSTYPE / 2>/dev/null)" = overlay ]; }
protect_requested() { grep "overlayroot=tmpfs" "$PF_PROC_CMDLINE" >/dev/null 2>&1; }
protect_configured() { grep "overlayroot=tmpfs" "$PF_CMDLINE" >/dev/null 2>&1; }
protect_word() { if "$@"; then echo ON; else echo OFF; fi; }

boot_rw() { mount -o remount,rw "$PF_BOOT" 2>/dev/null || true; }

# raspi-config#306: after a kernel update the initramfs may lack the overlay module, and the
# protection silently stays off. Loading it explicitly in every initramfs avoids that (issue #35).
ensure_overlay_module() {
  if ! grep -x overlay "$PF_INITRAMFS_MODULES" >/dev/null 2>&1; then
    echo overlay >> "$PF_INITRAMFS_MODULES"
    echo "Added overlay to $PF_INITRAMFS_MODULES"
  fi
  boot_rw
  update-initramfs -u -k all
}

# Turns protection on for the next boot (does not reboot).
protect_enable() {
  ensure_overlay_module
  # raspi-config appends another ",ro" to the boot entry every time – remove ours first
  sed -i 's#\(/boot/firmware.*defaults\)\(,ro\)\+#\1#' "$PF_FSTAB"
  raspi-config nonint do_overlayfs 0
  # Without recurse=0 overlayroot also puts every other fstab entry into RAM – then /daten
  # would be in RAM as well and nothing would survive a reboot
  boot_rw
  sed -i 's/overlayroot=tmpfs\( \|$\)/overlayroot=tmpfs:recurse=0\1/' "$PF_CMDLINE"
  grep "overlayroot=tmpfs:recurse=0" "$PF_CMDLINE" >/dev/null || { echo "overlayroot=tmpfs:recurse=0 missing in $PF_CMDLINE" >&2; return 1; }
}

# Turns protection off for the next boot (does not reboot).
protect_disable() {
  raspi-config nonint do_overlayfs 1 || true
  # raspi-config only removes "overlayroot=tmpfs " – with :recurse=0 the entry stays, remove it here
  if protect_configured; then
    boot_rw
    sed -i 's/overlayroot=tmpfs[^ ]* \?//' "$PF_CMDLINE"
  fi
  ! protect_configured || { echo "could not remove overlayroot from $PF_CMDLINE" >&2; return 1; }
}

# ---------- own Wi-Fi ----------
# grep without -q: with pipefail, -q can report "missing" when grep exits before nmcli (SIGPIPE)
ap_exists() { nmcli -t -f NAME connection show 2>/dev/null | grep -x "$PF_AP" >/dev/null; }
ap_active() { nmcli -t -f NAME connection show --active 2>/dev/null | grep -x "$PF_AP" >/dev/null; }

have_internet() { getent hosts deb.debian.org >/dev/null 2>&1; }
wait_internet() {
  local _
  for _ in $(seq "${1:-60}"); do have_internet && return 0; sleep 1; done
  return 1
}

# ---------- saved setup options ----------
# Prints the saved options as a shell-quoted line (root only: contains the Wi-Fi password).
saved_setup_options() {
  if [ -r "$PF_SETUP_CONF" ]; then cat "$PF_SETUP_CONF"
  elif [ -r "$PF_SETUP_CONF_OLD" ]; then cat "$PF_SETUP_CONF_OLD"
  else return 1; fi
}

# The user the service runs as: owner of the repository
repo_user() { stat -c %U "$1"; }

# ---------- update unit ----------
# Installed by setup, enabled permanently. It only runs while an update is in progress (state file
# on /daten), so starting an update never has to write to /etc – which may be protected (RAM).
install_update_unit() {
  cat > "$PF_SYSTEMD/parrafraktor-update.service" <<EOF
[Unit]
Description=ParrafraktorControl: update (continues across reboots)
ConditionPathExists=$PF_UPDATE_DIR/state
RequiresMountsFor=$PF_DATA_MOUNT
Wants=network-online.target
After=network-online.target NetworkManager.service parrafraktor-netz.service

[Service]
Type=exec
ExecStart=$PF_BIN update --resume
# Give a running apt or build time to finish when someone reboots by hand
TimeoutStopSec=15min
KillMode=process

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable parrafraktor-update.service
}
