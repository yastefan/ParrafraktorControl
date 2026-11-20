#!/usr/bin/env bash
# Dry run of the Pi tools without a Pi: fake nmcli, systemctl, raspi-config, findmnt, apt-get … in
# PATH, a throw-away git repository as "origin", and a small loop that plays the reboots.
# Runs in CI (Linux) and on a Mac (needs gsed there). Usage: pi/test/run.sh
set -uo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"   # pi/
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
FAILS=0
ok() { printf '\033[32m ok \033[0m %s\n' "$*"; }
fail() { printf '\033[31mFAIL\033[0m %s\n' "$*"; FAILS=$((FAILS + 1)); }
expect() { local text="$1"; shift; if "$@"; then ok "$text"; else fail "$text"; fi; }

# ---------- fake commands ----------
mkdir -p "$T/bin"
fake() { printf '#!/usr/bin/env bash\nF=%q\n%s\n' "$T/f" "$2" > "$T/bin/$1"; chmod +x "$T/bin/$1"; }
fake id         'case "$1" in -u) echo 0 ;; -un) echo pi ;; *) command id "$@" ;; esac'
fake sudo       'while [ $# -gt 0 ]; do case "$1" in -u) shift 2 ;; -H|-n) shift ;; *) break ;; esac; done; exec "$@"'
fake stat       'echo pi'
fake sleep      ':'
fake sync       ':'
fake mount      ':'
fake hostname   'echo parrafraktor'
fake findmnt    'case "$*" in "-no FSTYPE /") cat "$F/root_fstype" ;; *) exit 0 ;; esac'
fake getent     '[ -f "$F/internet" ]'
fake apt-get    'echo "apt-get $*" >> "$F/calls"; [ ! -f "$F/apt_fail" ]'
fake dpkg       ':'
fake npm        'echo "npm $*" >> "$F/calls"'
fake update-initramfs 'echo "update-initramfs $*" >> "$F/calls"'
fake journalctl ':'
fake ip         ':'
fake lsusb      ':'
fake systemctl '
echo "systemctl $*" >> "$F/calls"
case "$*" in
  reboot) touch "$F/rebooted" ;;
  "start --no-block parrafraktor-update.service") touch "$F/unit_started" ;;
  *"is-active --quiet parrafraktor-update") exit 1 ;;
  is-active*) [ ! -f "$F/service_down" ] ;;
esac
exit 0'
# raspi-config: like the real one, disabling only removes "overlayroot=tmpfs " (not with :recurse=0)
fake raspi-config '
c="$PF_CMDLINE"
echo "raspi-config $*" >> "$F/calls"
case "$*" in
  "nonint do_overlayfs 0") grep overlayroot "$c" >/dev/null || sed -i "s/^/overlayroot=tmpfs /" "$c" ;;
  "nonint do_overlayfs 1") sed -i "s/overlayroot=tmpfs //" "$c" ;;
esac'
fake nmcli '
echo "nmcli $*" >> "$F/calls"
case "$*" in
  *"connection show --active") [ -f "$F/ap_active" ] && echo parrafraktor-ap; echo wlan-home ;;
  *"connection show") echo parrafraktor-ap; echo wlan-home ;;
  *"connection down parrafraktor-ap") rm -f "$F/ap_active" ;;
  *"connection up parrafraktor-ap") touch "$F/ap_active" ;;
esac
exit 0'
if ! sed --version >/dev/null 2>&1; then
  command -v gsed >/dev/null || { echo "needs GNU sed (gsed on a Mac)"; exit 1; }
  ln -s "$(command -v gsed)" "$T/bin/sed"
fi
export PATH="$T/bin:$PATH"

# ---------- fake Pi ----------
export PF_DATA_MOUNT="$T/daten" PF_BOOT="$T/boot" PF_PROC_CMDLINE="$T/proc_cmdline" PF_FSTAB="$T/fstab" \
  PF_ETC="$T/etc" PF_SYSTEMD="$T/systemd" PF_INITRAMFS_MODULES="$T/initramfs-modules"
export PF_CMDLINE="$PF_BOOT/cmdline.txt" PF_BIN="$T/repo/pi/parrafraktor"
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid

fresh_pi() {
  rm -rf "${T:?}/f" "${T:?}/daten" "${T:?}/boot" "${T:?}/etc" "${T:?}/systemd" "${T:?}/repo" "${T:?}/origin.git" "${T:?}/work"
  mkdir -p "$T/f" "$T/daten" "$T/boot" "$T/etc" "$T/systemd"
  echo "console=tty1 root=PARTUUID=x rootfstype=ext4 fsck.repair=yes rootwait" > "$PF_CMDLINE"
  echo "PARTUUID=y /boot/firmware vfat defaults 0 2" > "$PF_FSTAB"
  : > "$PF_INITRAMFS_MODULES"
  touch "$T/f/internet" "$T/f/ap_active"
  printf '%q ' --ip 2.0.0.50/8 --ap-ssid Test --ap-password 'secret pass' > "$PF_ETC/setup.conf"
  # Repository: real pi/parrafraktor and lib.sh, setup.sh replaced by a fake
  git init -q --bare "$T/origin.git"
  git clone -q "$T/origin.git" "$T/work" 2>/dev/null
  mkdir -p "$T/work/pi"
  cp "$HERE/parrafraktor" "$HERE/lib.sh" "$T/work/pi/"
  cat > "$T/work/pi/setup.sh" <<'EOF'
#!/usr/bin/env bash
echo "setup $* user=$SUDO_USER" >> "$PF_DATA_MOUNT/../f/calls"
[ ! -f "$PF_DATA_MOUNT/../f/setup_fail" ]
EOF
  chmod +x "$T/work/pi/setup.sh"
  git -C "$T/work" add -A && git -C "$T/work" commit -qm one && git -C "$T/work" push -q origin HEAD 2>/dev/null
  git clone -q "$T/origin.git" "$T/repo"
  echo two > "$T/work/new" && git -C "$T/work" add -A && git -C "$T/work" commit -qm two && git -C "$T/work" push -q origin HEAD 2>/dev/null
  OLD="$(git -C "$T/repo" rev-parse HEAD)"; NEW="$(git -C "$T/work" rev-parse HEAD)"
  # Unit installed by an earlier setup
  touch "$PF_SYSTEMD/parrafraktor-update.service"
}

# Boot: overlay if the command line asks for it and the initramfs can do it
boot() {
  cp "$PF_CMDLINE" "$PF_PROC_CMDLINE"
  if grep overlayroot=tmpfs "$PF_CMDLINE" >/dev/null && [ ! -f "$T/f/bug306" ]; then echo overlay > "$T/f/root_fstype"
  else echo ext4 > "$T/f/root_fstype"; fi
  rm -f "$T/f/bug306"   # the first boot after the fix works
  touch "$T/f/ap_active"   # autoconnect
  rm -f "$T/f/rebooted"
}
protected_pi() { fresh_pi; "$T/repo/pi/parrafraktor" protect on --no-reboot >/dev/null; boot; }

P() { "$T/repo/pi/parrafraktor" "$@"; }
# Starts the update, then plays the unit at every boot until nothing reboots any more
run_update() {
  BOOTS=0
  P update > "$T/out" 2>&1
  while :; do
    if [ -f "$T/f/rebooted" ]; then boot; BOOTS=$((BOOTS + 1)); [ "$BOOTS" -gt 6 ] && { fail "endless reboots"; return; }
    elif [ -f "$T/f/unit_started" ]; then rm -f "$T/f/unit_started"
    else break; fi
    [ -f "$PF_DATA_MOUNT/.parrafraktor-update/state" ] && P update --resume >> "$T/out" 2>&1
  done
}
last() { ( . "$PF_DATA_MOUNT/.parrafraktor-update/last"; eval "echo \"\$$1\"" ); }
protected() { [ "$(cat "$T/f/root_fstype")" = overlay ] && grep "overlayroot=tmpfs:recurse=0" "$PF_CMDLINE" >/dev/null; }
no_state() { [ ! -f "$PF_DATA_MOUNT/.parrafraktor-update/state" ]; }
ap_on() { [ -f "$T/f/ap_active" ]; }
head_is() { [ "$(git -C "$T/repo" rev-parse HEAD)" = "$1" ]; }
called() { grep -- "$1" "$T/f/calls" >/dev/null; }

echo "== syntax"
for f in "$HERE"/parrafraktor "$HERE"/*.sh "$HERE"/test/*.sh; do expect "bash -n ${f#"$HERE"/}" bash -n "$f"; done

echo "== protect on/off"
fresh_pi; boot
P protect on --no-reboot >/dev/null
expect "protect on: recurse=0 in cmdline" grep -q "overlayroot=tmpfs:recurse=0" "$PF_CMDLINE"
expect "protect on: overlay module in initramfs list" grep -qx overlay "$PF_INITRAMFS_MODULES"
expect "protect on: initramfs rebuilt" called "update-initramfs -u -k all"
boot
expect "protected after boot" protected
P protect on --no-reboot >/dev/null; expect "protect on twice: module listed once" [ "$(grep -cx overlay "$PF_INITRAMFS_MODULES")" = 1 ]
P schreibschutz aus >/dev/null
expect "old command 'schreibschutz aus' removes overlayroot" bash -c "! grep overlayroot '$PF_CMDLINE'"
expect "  … and reboots" [ -f "$T/f/rebooted" ]
boot
expect "writable after boot" [ "$(cat "$T/f/root_fstype")" = ext4 ]
expect "status mentions protection" bash -c "'$T/repo/pi/parrafraktor' status | grep -q 'Protection:     OFF now, OFF after reboot'"

echo "== update from protected Pi with own Wi-Fi"
protected_pi; run_update
expect "finished, no state left" no_state
expect "result ok" [ "$(last U_RESULT)" = ok ]
expect "two reboots" [ "$BOOTS" = 2 ]
expect "protected again" protected
expect "own Wi-Fi on again" ap_on
expect "new version pulled" head_is "$NEW"
expect "own Wi-Fi went down for the update" called "connection down parrafraktor-ap"
expect "apt full-upgrade ran" called "apt-get -y -o Dpkg::Options::=--force-confold full-upgrade"
expect "setup --refresh with saved options as repo user" called "setup --refresh --ip 2.0.0.50/8 --ap-ssid Test --ap-password secret pass user=pi"
expect "status shows last update ok" bash -c "'$T/repo/pi/parrafraktor' status | grep -q 'Update:         last one ok'"
expect "log on /daten" grep -q "Update finished" "$PF_DATA_MOUNT/.parrafraktor-update/update.log"

echo "== update from writable Pi (no reboot first)"
fresh_pi; boot; run_update
expect "result ok" [ "$(last U_RESULT)" = ok ]
expect "one reboot" [ "$BOOTS" = 1 ]
expect "protected afterwards" protected
expect "own Wi-Fi on" ap_on

echo "== apt fails"
protected_pi; touch "$T/f/apt_fail"; run_update
expect "result failed" [ "$(last U_RESULT)" = failed ]
expect "error names apt" bash -c "[[ '$(last U_ERROR)' == *apt* ]]"
expect "still protected" protected
expect "own Wi-Fi on" ap_on
expect "status shows the failure" bash -c "'$T/repo/pi/parrafraktor' status | grep -q 'LAST ONE FAILED'"
P check >/dev/null 2>&1; expect "check fails after failed update" [ $? -ne 0 ]

echo "== setup refresh fails → rollback"
protected_pi; touch "$T/f/setup_fail"; run_update
expect "result failed" [ "$(last U_RESULT)" = failed ]
expect "repository back on the old version" head_is "$OLD"
expect "rebuilt old version" called "npm ci --no-audit --no-fund"
expect "still protected" protected
expect "own Wi-Fi on" ap_on

echo "== no saved setup options: only build, never a setup without options"
protected_pi; rm "$PF_ETC/setup.conf"; run_update
expect "setup not run" bash -c "! grep -q '^setup' '$T/f/calls'"
expect "built instead" called "npm ci --no-audit --no-fund"
expect "result failed with a hint" grep -q "U_ERROR=.*parrafraktor.setup" "$PF_DATA_MOUNT/.parrafraktor-update/last"
expect "still protected" protected

echo "== no internet"
protected_pi; rm "$T/f/internet"; run_update
expect "result failed" [ "$(last U_RESULT)" = failed ]
expect "error names internet" bash -c "[[ '$(last U_ERROR)' == *internet* ]]"
expect "nothing pulled" head_is "$OLD"
expect "still protected" protected
expect "own Wi-Fi on" ap_on

echo "== protection does not come back (raspi-config#306): one retry"
protected_pi
# The retry boot fails once more than the first fix: simulate with a hook on the enabling boot
touch "$T/f/bug306_next"
P update > "$T/out" 2>&1; BOOTS=0
while [ -f "$T/f/rebooted" ] || [ -f "$T/f/unit_started" ]; do
  if [ -f "$T/f/rebooted" ]; then
    if [ -f "$T/f/bug306_next" ] && grep overlayroot "$PF_CMDLINE" >/dev/null; then rm "$T/f/bug306_next"; touch "$T/f/bug306"; fi
    boot; BOOTS=$((BOOTS + 1))
  else rm -f "$T/f/unit_started"; fi
  [ "$BOOTS" -gt 6 ] && break
  no_state || P update --resume >> "$T/out" 2>&1
done
expect "result ok after retry" [ "$(last U_RESULT)" = ok ]
expect "three reboots" [ "$BOOTS" = 3 ]
expect "protected" protected

echo "== update while one is running, abort"
protected_pi
mkdir -p "$PF_DATA_MOUNT/.parrafraktor-update"
printf 'U_PHASE=working\nU_STARTED=x\nU_AP=1\n' > "$PF_DATA_MOUNT/.parrafraktor-update/state"
P update > "$T/out" 2>&1; expect "second update refused" [ $? -ne 0 ]
P update abort > "$T/out" 2>&1
expect "abort clears the state" no_state
expect "abort is recorded as failed" [ "$(last U_RESULT)" = failed ]

echo "== old Pi without update unit"
protected_pi; rm "$PF_SYSTEMD/parrafraktor-update.service"
P update > "$T/out" 2>&1; expect "refused with instructions" bash -c "[ $? -ne 0 ] && grep 'protect off' '$T/out' >/dev/null"
fresh_pi; boot; rm "$PF_SYSTEMD/parrafraktor-update.service"; run_update
expect "writable old Pi: unit installed and update ok" bash -c "[ -f '$PF_SYSTEMD/parrafraktor-update.service' ] && [ '$(last U_RESULT)' = ok ]"

echo
if [ "$FAILS" -eq 0 ]; then echo "All good."; else echo "$FAILS failed. Last output:"; cat "$T/out"; exit 1; fi
