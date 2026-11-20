# Platforms

ParrafraktorControl runs on macOS, Windows and the Raspberry Pi. This page is the one place that says what differs between them and where it is set up.

## Principle

The server never asks which system it runs on. Differences only come from outside: through environment variables and system services set by `pi/setup.sh` (or, on the Mac, by hand). What the Pi does differently can be reproduced and tested on the Mac with the same variables.

| Environment variable | Mac/Windows (development) | Pi (`pi/setup.sh`) |
|---|---|---|
| `PORT` | 8080 | 8443 (HTTPS) with certificate, otherwise 80 |
| `HTTP_PORT` | – | 80 (only with certificate) |
| `TLS_CERT`, `TLS_KEY` | – | `zertifikate/server*.pem`, if present |
| `PARRAFRAKTOR_DATEN` | `./daten` (`npm start`), `server/daten` (`npm run dev`) | `/daten/parrafraktor` |
| `PARRAFRAKTOR_VITE_PORT` | 5173 (set by `npm run dev`) | – |
| `STREAMDECK=aus` | if needed | – |
| `PARRAFRAKTOR_NETZ_CODE` | – | code for the network menu (`--net-code`), without: no menu |
| `PARRAFRAKTOR_NETZ_SCHNITTSTELLE` | – | LAN port, `eth0` (`--interface`) |

The variable names, `netz.json` and the helper `/usr/local/sbin/parrafraktor-netz anwenden` are shared with the server code and keep their German names until the code is renamed.

## What applies where

| Topic | macOS | Windows | Raspberry Pi | Set up in |
|---|---|---|---|---|
| Node | ≥ 22.18 (24 recommended) | ≥ 22.18 | 24 from NodeSource (Debian only has 20) | `pi/setup.sh` |
| Stream Deck + | quit the Elgato software | quit the Elgato software | udev rule, group `plugdev` | README, `pi/setup.sh` |
| Font for the Stream Deck | system font | system font | `fonts-dejavu-core`, registered as `PultSans` in `bilder.ts` | `pi/packages.sh` |
| Native packages (`node-hid`, `@napi-rs/canvas`, `jpeg-turbo`) | prebuilt | prebuilt | prebuilt for arm64; build tools as fallback | `pi/packages.sh` |
| Power loss | – | – | write protection (overlay, `recurse=0`, overlay module in the initramfs), data partition `/daten`, fsync + `.bak` | `pi/setup.sh`, `pi/lib.sh`, `server/src/speicher.ts` |
| Crash, hang | – | – | systemd `Restart=always`, hardware watchdog | `pi/setup.sh` |
| Logs | console | console | journald in RAM only; the update log on `/daten` | `pi/setup.sh` |
| Network | as configured | as configured | fixed IP in the lighting network, own Wi-Fi (5 GHz) | `pi/setup.sh` |
| Network menu on the Stream Deck | – | – | Wi-Fi on/off, LAN DHCP (fallback fixed IP) or fixed, IP; wish saved on `/daten`, applied via sudo by `/usr/local/sbin/parrafraktor-netz` (owned by root), again at boot | `server/src/netz.ts`, `pi/network.sh`, `pi/setup.sh` |
| HTTP/HTTPS | mkcert, port selectable | mkcert, port selectable | HTTP on 80 for all browsers, HTTPS on 8443 only for the iPad app (not 443: browsers try HTTPS there first and get stuck at the mkcert certificate) | `pi/setup.sh` |
| Start without MA | setting "Autostart output" | likewise | likewise, the service starts at boot | client (settings) |
| Updates | `git pull`, `npm ci` | likewise | `parrafraktor update` (one step, continues across reboots, rolls back a failed build, ends protected) | `pi/parrafraktor`, `pi/setup.sh --refresh` |
| Command line | – | – | `parrafraktor` (menu, `help`), as `/usr/local/bin/parrafraktor` | `pi/parrafraktor`, `pi/setup.sh` |
| RS485 (DMX via UART) | – | – | planned, user already in `dialout` | – |

## How it is checked

- **On every PR (GitHub Actions, `.github/workflows/pruefen.yml`):** Linux on ARM (like the Pi) with the minimum Node version and with Node 24, plus macOS and Windows. Each runs `npm ci`, typecheck, tests, build, then whether the native packages for the Stream Deck load. That catches errors like "npm silently drops the Stream Deck package" before they show up on the Pi. A separate job runs `shellcheck` on `pi/` and the dry run `pi/test/run.sh` (fake `nmcli`, `systemctl`, `raspi-config` …, plays the reboots of `parrafraktor update` including failures and rollback).
- **On the Pi:** `parrafraktor check` checks what only works on the device (overlay, overlay module, `/daten`, watchdog, service, Wi-Fi, Stream Deck, last update). The checklist with pulling the power is in the README.
- **Open points about the Pi:** GitHub issues with the label `pi`.
