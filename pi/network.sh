#!/usr/bin/env bash
# Applies the settings of the network menu on the Stream Deck (NetworkManager).
#
# pi/setup.sh --net-code copies this file to /usr/local/sbin/parrafraktor-netz (owned by root, only
# root may change it) and fills in the placeholders. The service may call exactly
#   /usr/local/sbin/parrafraktor-netz anwenden
# via sudo; at boot parrafraktor-netz.service calls the same, because nmcli changes live in RAM
# while the write protection is on and would be lost otherwise.
# The name, the argument "anwenden" ("apply") and the keys in netz.json are shared with the server
# (server/src/network.ts) and stay German until the server code is renamed.
#
# netz.json is written by the service (a user without root) – so every value is checked strictly
# here and only passed to nmcli as a single argument, never through a shell.
#
# Connections:
#   parrafraktor-ap   own Wi-Fi (created by setup.sh)
#   lichtnetz         LAN with fixed IP, priority 100
#   lichtnetz-dhcp    LAN via DHCP, priority 110: NetworkManager tries it first; if no DHCP server
#                     answers within 15 s it takes lichtnetz (falls back to the fixed IP)
set -euo pipefail

FILE="@DATA@/netz.json"
INTERFACE="@INTERFACE@"

[ "${1:-}" = anwenden ] || { echo "usage: $0 anwenden" >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "root only" >&2; exit 1; }

# Read and check netz.json; if it is broken, the backup (see server/src/store.ts)
values=""
for f in "$FILE" "$FILE.bak"; do
  [ -f "$f" ] || continue
  if values="$(python3 -I - "$f" <<'PY'
import json, sys
w = json.load(open(sys.argv[1], encoding="utf-8"))
ap = w["ap"]; lan = w["lan"]; mode = lan["modus"]; a = lan["adresse"]; p = lan["praefix"]
assert isinstance(ap, bool)
assert mode in ("dhcp", "fest")
assert isinstance(a, list) and len(a) == 4 and all(type(x) is int and 0 <= x <= 255 for x in a)
assert type(p) is int and 1 <= p <= 30
print("on" if ap else "off", mode, ".".join(map(str, a)) + "/" + str(p))
PY
)"; then break; fi
  echo "$f unreadable, trying the backup" >&2
  values=""
done
[ -n "$values" ] || { echo "no valid netz.json" >&2; exit 1; }
read -r AP MODE ADDRESS <<<"$values"
echo "Wi-Fi $AP, LAN $MODE, fixed IP $ADDRESS"

# grep without -q: with pipefail, -q can report "missing" when grep exits before nmcli (SIGPIPE)
has() { nmcli -t -f NAME connection show | grep -x "$1" >/dev/null; }

# ---------- LAN ----------
if has lichtnetz; then
  nmcli connection modify lichtnetz ipv4.method manual ipv4.addresses "$ADDRESS" \
    connection.autoconnect yes connection.autoconnect-priority 100
else
  nmcli connection add type ethernet ifname "$INTERFACE" con-name lichtnetz ipv4.method manual \
    ipv4.addresses "$ADDRESS" ipv4.never-default yes ipv6.method disabled \
    connection.autoconnect yes connection.autoconnect-priority 100
fi
if ! has lichtnetz-dhcp; then
  nmcli connection add type ethernet ifname "$INTERFACE" con-name lichtnetz-dhcp ipv4.method auto \
    ipv4.dhcp-timeout 15 ipv6.method disabled connection.autoconnect no \
    connection.autoconnect-priority 110 connection.autoconnect-retries 1
fi
cable=0
[ "$(cat "/sys/class/net/$INTERFACE/carrier" 2>/dev/null || echo 0)" = 1 ] && cable=1
if [ "$MODE" = dhcp ]; then
  nmcli connection modify lichtnetz-dhcp connection.autoconnect yes
  if [ "$cable" = 1 ]; then
    nmcli --wait 25 connection up lichtnetz-dhcp || {
      echo "no DHCP – fixed IP $ADDRESS"
      nmcli connection up lichtnetz || true
    }
  fi
else
  nmcli connection modify lichtnetz-dhcp connection.autoconnect no
  nmcli connection down lichtnetz-dhcp >/dev/null 2>&1 || true
  [ "$cable" = 1 ] && { nmcli connection up lichtnetz || true; }
fi

# ---------- Own Wi-Fi ----------
if has parrafraktor-ap; then
  if [ "$AP" = on ]; then
    nmcli connection modify parrafraktor-ap connection.autoconnect yes
    nmcli connection up parrafraktor-ap || true
  else
    nmcli connection modify parrafraktor-ap connection.autoconnect no
    nmcli connection down parrafraktor-ap >/dev/null 2>&1 || true
  fi
elif [ "$AP" = on ]; then
  echo "no own Wi-Fi set up (pi/setup.sh --ap-ssid)" >&2
fi
