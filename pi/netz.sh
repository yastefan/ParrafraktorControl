#!/usr/bin/env bash
# Wendet die Netz-Einstellungen aus dem Netz-Menü am Stream Deck an (NetworkManager).
#
# pi/einrichten.sh --netz-code kopiert diese Datei nach /usr/local/sbin/parrafraktor-netz (gehört root,
# nur root darf sie ändern) und setzt die Platzhalter. Der Dienst darf per sudo genau
#   /usr/local/sbin/parrafraktor-netz anwenden
# aufrufen; beim Hochfahren ruft parrafraktor-netz.service dasselbe auf, weil Änderungen von nmcli
# bei aktivem Schreibschutz im RAM liegen und sonst verloren gingen.
#
# Die Datei netz.json schreibt der Dienst (Benutzer ohne root) – deshalb wird jeder Wert hier streng
# geprüft und nur als einzelnes Argument an nmcli gegeben, nie durch eine Shell.
#
# Verbindungen:
#   parrafraktor-ap   eigenes WLAN (von einrichten.sh angelegt)
#   lichtnetz         LAN mit fester IP, Priorität 100
#   lichtnetz-dhcp    LAN per DHCP, Priorität 110: NetworkManager versucht es zuerst; antwortet kein
#                     DHCP-Server binnen 15 s, nimmt er lichtnetz (Rückfall auf die feste IP)
set -euo pipefail

DATEI="@DATEN@/netz.json"
SCHNITTSTELLE="@SCHNITTSTELLE@"

[ "${1:-}" = anwenden ] || { echo "Aufruf: $0 anwenden" >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "nur als root" >&2; exit 1; }

# netz.json lesen und prüfen; bei kaputter Datei die Sicherung (siehe server/src/speicher.ts)
werte=""
for d in "$DATEI" "$DATEI.bak"; do
  [ -f "$d" ] || continue
  if werte="$(python3 -I - "$d" <<'PY'
import json, sys
w = json.load(open(sys.argv[1], encoding="utf-8"))
ap = w["ap"]; lan = w["lan"]; modus = lan["modus"]; a = lan["adresse"]; p = lan["praefix"]
assert isinstance(ap, bool)
assert modus in ("dhcp", "fest")
assert isinstance(a, list) and len(a) == 4 and all(type(x) is int and 0 <= x <= 255 for x in a)
assert type(p) is int and 1 <= p <= 30
print("an" if ap else "aus", modus, ".".join(map(str, a)) + "/" + str(p))
PY
)"; then break; fi
  echo "$d unlesbar, versuche Sicherung" >&2
  werte=""
done
[ -n "$werte" ] || { echo "keine gültige netz.json" >&2; exit 1; }
read -r AP MODUS ADRESSE <<<"$werte"
echo "WLAN $AP, LAN $MODUS, feste IP $ADRESSE"

# grep ohne -q: mit pipefail meldete -q sonst „fehlt“, wenn grep vor nmcli fertig ist (SIGPIPE)
hat() { nmcli -t -f NAME connection show | grep -x "$1" >/dev/null; }

# ---------- LAN ----------
if hat lichtnetz; then
  nmcli connection modify lichtnetz ipv4.method manual ipv4.addresses "$ADRESSE" \
    connection.autoconnect yes connection.autoconnect-priority 100
else
  nmcli connection add type ethernet ifname "$SCHNITTSTELLE" con-name lichtnetz ipv4.method manual \
    ipv4.addresses "$ADRESSE" ipv4.never-default yes ipv6.method disabled \
    connection.autoconnect yes connection.autoconnect-priority 100
fi
if ! hat lichtnetz-dhcp; then
  nmcli connection add type ethernet ifname "$SCHNITTSTELLE" con-name lichtnetz-dhcp ipv4.method auto \
    ipv4.dhcp-timeout 15 ipv6.method disabled connection.autoconnect no \
    connection.autoconnect-priority 110 connection.autoconnect-retries 1
fi
kabel=0
[ "$(cat "/sys/class/net/$SCHNITTSTELLE/carrier" 2>/dev/null || echo 0)" = 1 ] && kabel=1
if [ "$MODUS" = dhcp ]; then
  nmcli connection modify lichtnetz-dhcp connection.autoconnect yes
  if [ "$kabel" = 1 ]; then
    nmcli --wait 25 connection up lichtnetz-dhcp || {
      echo "kein DHCP – feste IP $ADRESSE"
      nmcli connection up lichtnetz || true
    }
  fi
else
  nmcli connection modify lichtnetz-dhcp connection.autoconnect no
  nmcli connection down lichtnetz-dhcp >/dev/null 2>&1 || true
  [ "$kabel" = 1 ] && { nmcli connection up lichtnetz || true; }
fi

# ---------- Eigenes WLAN ----------
if hat parrafraktor-ap; then
  if [ "$AP" = an ]; then
    nmcli connection modify parrafraktor-ap connection.autoconnect yes
    nmcli connection up parrafraktor-ap || true
  else
    nmcli connection modify parrafraktor-ap connection.autoconnect no
    nmcli connection down parrafraktor-ap >/dev/null 2>&1 || true
  fi
elif [ "$AP" = an ]; then
  echo "kein eigenes WLAN eingerichtet (pi/einrichten.sh --ap-ssid)" >&2
fi
