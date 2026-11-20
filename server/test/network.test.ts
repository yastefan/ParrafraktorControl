import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARAMETER_DEFAULTS } from "@parrafraktor/engine";
import { SETTINGS_DEFAULTS, checkPresets } from "@parrafraktor/protocol";
import { HOLD_MS, MAIN, NETWORK_KEYS, CODE_WAIT_MS } from "../src/input/streamdeck/layout.js";
import { StreamDeckModule } from "../src/input/streamdeck/index.js";
import { NETWORK_DEFAULTS, isNetworkCode, networkFromEnv, checkNetwork, type Network, type NetworkStatus, type NetworkWish } from "../src/network.js";
import { Controller } from "../src/controller.js";

vi.mock("../src/log.js", () => ({ log: () => {}, errorText: (e: unknown) => String(e) }));

describe("network wish", () => {
  it("checks file and controls, anything invalid keeps the old value", () => {
    expect(checkNetwork(undefined)).toEqual(NETWORK_DEFAULTS);
    expect(checkNetwork({ ap: false, lan: { modus: "dhcp", adresse: [10, 0, 0, 7], praefix: 16 } }))
      .toEqual({ ap: false, lan: { modus: "dhcp", adresse: [10, 0, 0, 7], praefix: 16 } });
    expect(checkNetwork({ ap: "nein", lan: { modus: "x", adresse: [300, -1, 1.5, "2"], praefix: 33 } })).toEqual(NETWORK_DEFAULTS);
    expect(checkNetwork({ lan: { adresse: [1, 2, 3] } }).lan.adresse).toEqual(NETWORK_DEFAULTS.lan.adresse);
  });

  it("code: four keys 1–8", () => {
    expect(isNetworkCode("2468")).toBe(true);
    expect(isNetworkCode("1290")).toBe(false);
    expect(isNetworkCode("131")).toBe(false);
    expect(isNetworkCode("24682")).toBe(false);
  });

  it("no network menu without a valid code", () => {
    const store = { read: () => undefined, writeNow: () => {} } as never;
    expect(networkFromEnv(store, {})).toBeNull();
    expect(networkFromEnv(store, { PARRAFRAKTOR_NETZ_CODE: "1290" })).toBeNull();
    expect(networkFromEnv(store, { PARRAFRAKTOR_NETZ_CODE: "2468" })?.code).toBe("2468");
  });
});

class FakeNetwork implements Network {
  code = "2468";
  wish: NetworkWish = structuredClone(NETWORK_DEFAULTS) as NetworkWish;
  status: NetworkStatus = { cable: true, lanAddresses: ["2.0.0.50/8"], apOn: true, dhcpActive: false };
  applying = false;
  message = "";
  applied: NetworkWish[] = [];
  async refresh(): Promise<void> {}
  async set(w: NetworkWish): Promise<void> {
    this.applied.push(w);
    this.wish = w;
    this.message = "applied";
  }
}

// Private members of the Stream Deck module the tests drive directly
interface DeckInternals {
  menu: string;
  keyDown(k: number): void;
  keyUp(k: number): void;
  turn(i: number, steps: number): void;
  keyContent(k: number): { title: string; below?: string };
  fields(): { title: string; value: string }[];
  close(): Promise<void>;
}

describe("network menu on the Stream Deck", () => {
  let s: Controller, network: FakeNetwork, deck: DeckInternals;
  beforeEach(() => {
    vi.useFakeTimers();
    s = new Controller({ ...PARAMETER_DEFAULTS }, structuredClone(SETTINGS_DEFAULTS), checkPresets([]));
    network = new FakeNetwork();
    deck = new StreamDeckModule(s, network) as unknown as DeckInternals;
  });
  afterEach(async () => {
    await deck.close();
    vi.useRealTimers();
  });

  const combo = () => {
    deck.keyDown(MAIN.output);
    vi.advanceTimersByTime(300);
    deck.keyDown(MAIN.ordering);
  };
  const tap = (...keys: number[]) => keys.forEach((k) => { deck.keyDown(k); deck.keyUp(k); });

  it("hold Output, add Order, 2 s: code entry, without switching Output or Order", () => {
    const ordering = s.parameter.ordnung;
    combo();
    vi.advanceTimersByTime(HOLD_MS.network - 1);
    expect(deck.menu).toBe("main");
    vi.advanceTimersByTime(1);
    expect(deck.menu).toBe("code");
    deck.keyUp(MAIN.ordering);
    deck.keyUp(MAIN.output);
    expect(s.takeover.soll).toBe(false);
    expect(s.parameter.ordnung).toBe(ordering);
  });

  it("released too early: nothing happens", () => {
    combo();
    vi.advanceTimersByTime(1000);
    deck.keyUp(MAIN.ordering);
    vi.advanceTimersByTime(HOLD_MS.network);
    expect(deck.menu).toBe("main");
    expect(s.takeover.soll).toBe(false);
  });

  it("holding Output alone still switches as before", () => {
    deck.keyDown(MAIN.output);
    vi.advanceTimersByTime(HOLD_MS.output);
    deck.keyUp(MAIN.output);
    expect(s.takeover.soll).toBe(true);
  });

  it("the right code opens the menu, a wrong one goes back", () => {
    combo();
    vi.advanceTimersByTime(HOLD_MS.network);
    tap(1, 3, 5, 7);   // 2 4 6 8
    expect(deck.menu).toBe("network");

    deck.keyDown(NETWORK_KEYS.back);
    combo();
    vi.advanceTimersByTime(HOLD_MS.network);
    tap(1, 3, 5);
    expect(deck.fields().map((f) => f.value)).toEqual(["●", "●", "●", "○"]);
    tap(0);
    expect(deck.menu).toBe("main");
  });

  it("code entry without keys times out", () => {
    combo();
    vi.advanceTimersByTime(HOLD_MS.network);
    tap(0);
    vi.advanceTimersByTime(CODE_WAIT_MS);
    expect(deck.menu).toBe("main");
  });

  it("draft with keys and encoders, only Apply applies", async () => {
    combo();
    vi.advanceTimersByTime(HOLD_MS.network);
    tap(1, 3, 5, 7);
    tap(NETWORK_KEYS.wifi, NETWORK_KEYS.lan, NETWORK_KEYS.prefix);
    deck.turn(3, 5);                 // 2.0.0.55
    deck.turn(0, 8);                 // 10.0.0.55
    expect(network.applied).toEqual([]);
    expect(deck.keyContent(NETWORK_KEYS.apply).below).toBe("changes");
    expect(deck.fields().map((f) => f.value)).toEqual(["10", "0", "0", "55"]);
    tap(NETWORK_KEYS.apply);
    await vi.runOnlyPendingTimersAsync();
    expect(network.applied).toEqual([{ ap: false, lan: { modus: "dhcp", adresse: [10, 0, 0, 55], praefix: 16 } }]);
    expect(deck.keyContent(NETWORK_KEYS.apply).below).toBe("applied");
  });

  it("Reset drops the draft, encoders stay within 0 … 255", () => {
    combo();
    vi.advanceTimersByTime(HOLD_MS.network);
    tap(1, 3, 5, 7);
    deck.turn(1, -3);
    deck.turn(2, 300);
    expect(deck.fields().map((f) => f.value)).toEqual(["2", "0", "255", "50"]);
    tap(NETWORK_KEYS.reset);
    expect(deck.fields().map((f) => f.value)).toEqual(["2", "0", "0", "50"]);
  });

  it("without network (Mac, Windows) there is no combination", () => {
    const without = new StreamDeckModule(s) as unknown as DeckInternals;
    const ordering = s.parameter.ordnung;
    without.keyDown(MAIN.output);
    without.keyDown(MAIN.ordering);
    vi.advanceTimersByTime(HOLD_MS.network);
    expect(without.menu).toBe("main");
    expect(s.parameter.ordnung).not.toBe(ordering);   // Order steps as always
  });
});
