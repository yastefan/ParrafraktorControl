# shellcheck shell=bash
# Packages that pi/setup.sh installs (also on every "parrafraktor update"; sourced, not executed).
# nodejs comes from the NodeSource repository (see setup.sh).
#   dnsmasq-base       DHCP/DNS for the own Wi-Fi (NetworkManager, ipv4.method shared)
#   fonts-dejavu-core  Pi OS Lite has no font otherwise, the Stream Deck then shows no text
#   initramfs-tools    update-initramfs, to keep the overlay module in the initramfs (raspi-config#306)
#   build-essential, python3, cmake, libudev-dev
#                      in case node-hid or jpeg-turbo find no matching prebuilt module
# shellcheck disable=SC2034 # used by setup.sh
PACKAGES=(nodejs git dnsmasq-base fonts-dejavu-core initramfs-tools build-essential python3 cmake libudev-dev)
