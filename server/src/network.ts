// Network settings of the Pi, operated through the network menu on the Stream Deck: own Wi-Fi on/off,
// LAN port via DHCP (falling back to the fixed IP) or fixed, fixed IP.
//
// Only active when pi/setup.sh turns it on (PARRAFRAKTOR_NETZ_CODE); the server never asks
// which system it runs on (docs/platforms.md).
//
// The server only remembers the wish (netz.json in the data directory, survives the write protection).
// A small helper applies it as root (/usr/local/sbin/parrafraktor-netz, from pi/network.sh), which
// the service may call via sudo – only this one, with a fixed argument. It reads netz.json itself
// and checks every value; at boot the same command applies the wish again.
// netz.json, its keys and the argument "anwenden" are shared with pi/network.sh and stay German.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { errorText, log } from "./log.js";
import type { Store } from "./store.js";

const execute = promisify(execFile);

export const NETWORK_FILE = "netz.json";

export type LanMode = "dhcp" | "fest";

export interface NetworkWish {
  ap: boolean;                       // own Wi-Fi
  lan: {
    modus: LanMode;                 // dhcp: DHCP first, the fixed IP without an answer
    adresse: [number, number, number, number];
    praefix: number;                 // netmask as prefix, e.g. 8 for 255.0.0.0
  };
}

export interface NetworkStatus {
  cable: boolean | null;             // null = unknown
  lanAddresses: string[];             // current IPv4 addresses of the LAN port with prefix
  apOn: boolean;
  dhcpActive: boolean;                // LAN currently runs via DHCP (otherwise fixed IP)
}

export const PREFIXES = [8, 16, 24] as const;

export const NETWORK_DEFAULTS: Readonly<NetworkWish> = {
  ap: true,
  lan: { modus: "fest", adresse: [2, 0, 0, 50], praefix: 8 },
};

type Raw = Record<string, unknown>;
const asObject = (x: unknown): Raw => (typeof x === "object" && x !== null ? (x as Raw) : {});
const octet = (x: unknown, old: number): number =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 255 ? x : old;

// Check a wish from the file or the controls; invalid parts keep the old value
export function checkNetwork(raw: unknown, basis: NetworkWish = NETWORK_DEFAULTS): NetworkWish {
  const r = asObject(raw), l = asObject(r.lan);
  const a = Array.isArray(l.adresse) && l.adresse.length === 4 ? l.adresse : [];
  const p = l.praefix;
  return {
    ap: typeof r.ap === "boolean" ? r.ap : basis.ap,
    lan: {
      modus: l.modus === "dhcp" || l.modus === "fest" ? l.modus : basis.lan.modus,
      adresse: [0, 1, 2, 3].map((i) => octet(a[i], basis.lan.adresse[i]!)) as NetworkWish["lan"]["adresse"],
      praefix: typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 30 ? p : basis.lan.praefix,
    },
  };
}

// Code: four keys 1 … 8 (top left 1, bottom right 8)
export const isNetworkCode = (code: string): boolean => /^[1-8]{4}$/.test(code);

export const formatAddress = (w: NetworkWish): string => `${w.lan.adresse.join(".")}/${w.lan.praefix}`;

export const sameWish = (a: NetworkWish, b: NetworkWish): boolean => JSON.stringify(a) === JSON.stringify(b);

export interface Network {
  readonly code: string;
  readonly wish: NetworkWish;
  readonly status: NetworkStatus;
  readonly applying: boolean;
  readonly message: string;          // result of the last apply, e.g. an error
  refresh(): Promise<void>;
  set(w: NetworkWish): Promise<void>;
}

export interface NetworkOptions {
  code: string;
  command: string;                   // helper, called via sudo
  iface: string;                     // LAN port, e.g. eth0
}

export class NetworkPi implements Network {
  private _wish: NetworkWish;
  private _status: NetworkStatus = { cable: null, lanAddresses: [], apOn: false, dhcpActive: false };
  private _applying = false;
  private _message = "";

  constructor(private readonly store: Store, private readonly o: NetworkOptions) {
    this._wish = checkNetwork(store.read(NETWORK_FILE));
  }

  get code(): string { return this.o.code; }
  get wish(): NetworkWish { return this._wish; }
  get status(): NetworkStatus { return this._status; }
  get applying(): boolean { return this._applying; }
  get message(): string { return this._message; }

  // Read only, the service may do that without root
  async refresh(): Promise<void> {
    const s = this.o.iface;
    let cable: boolean | null = null;
    try {
      cable = readFileSync(`/sys/class/net/${s}/carrier`, "utf8").trim() === "1";
    } catch {
      // a port without a link reports an error here instead of 0
      cable = false;
    }
    const [addresses, active] = await Promise.all([
      execute("ip", ["-4", "-o", "addr", "show", "dev", s]).then((r) => r.stdout, () => ""),
      execute("nmcli", ["-t", "-f", "NAME", "connection", "show", "--active"]).then((r) => r.stdout, () => ""),
    ]);
    const names = active.split("\n").map((z) => z.trim());
    this._status = {
      cable,
      lanAddresses: [...addresses.matchAll(/inet (\d+\.\d+\.\d+\.\d+\/\d+)/g)].map((m) => m[1]!),
      apOn: names.includes("parrafraktor-ap"),
      dhcpActive: names.includes("lichtnetz-dhcp"),
    };
  }

  async set(w: NetworkWish): Promise<void> {
    if (this._applying) return;
    this._wish = checkNetwork(w, this._wish);
    this.store.writeNow(NETWORK_FILE, this._wish);
    this._applying = true;
    this._message = "";
    try {
      await execute("sudo", ["-n", this.o.command, "anwenden"], { timeout: 60_000 });
      this._message = "applied";
      log("network", `applied: Wi-Fi ${this._wish.ap ? "on" : "off"}, LAN ${this._wish.lan.modus === "dhcp" ? "DHCP" : "fixed"} ${formatAddress(this._wish)}`);
    } catch (e) {
      const text = (e as { stderr?: string }).stderr?.trim().split("\n").pop() || errorText(e);
      this._message = `error: ${text}`;
      log("network", `applying failed: ${text}`);
    } finally {
      this._applying = false;
    }
    await this.refresh().catch(() => {});
  }
}

// From the environment (pi/setup.sh sets it in the service); without a valid code no network menu
export function networkFromEnv(store: Store, env: NodeJS.ProcessEnv = process.env): Network | null {
  const code = env.PARRAFRAKTOR_NETZ_CODE ?? "";
  if (!code) return null;
  if (!isNetworkCode(code)) {
    log("network", "PARRAFRAKTOR_NETZ_CODE invalid (four digits 1–8) – network menu off");
    return null;
  }
  return new NetworkPi(store, {
    code,
    command: env.PARRAFRAKTOR_NETZ_BEFEHL || "/usr/local/sbin/parrafraktor-netz",
    iface: env.PARRAFRAKTOR_NETZ_SCHNITTSTELLE || "eth0",
  });
}
