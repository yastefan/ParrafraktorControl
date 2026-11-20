// Elgato Stream Deck+ as a control on the server computer.
//
// The device may be plugged in or out at any time: without a device it searches every 2 s.
// macOS/Windows: the Elgato software must be quit, otherwise the device is busy.
// Linux/Raspberry Pi: needs a udev rule (see README).
import type { DeviceModelId, StreamDeck } from "@elgato-stream-deck/core";
import {
  ELEMENT_ORDERS, ELEMENT_ORDER_NAME, IMPULSE_NAME, MODES_SELECTABLE, isApertureKind, MODE_NAME, PARAMETER_DEFAULTS,
} from "@parrafraktor/engine";
import {
  RANGES, IMPULSE_RANGES, PRESET_COUNT, isUsed, offsetsDiffer, SWITCHES, STEPPED, impulseValue, formatImpulse, formatValue, type ModuleStatus,
} from "@parrafraktor/protocol";
import { errorText, log } from "../../log.js";
import { PREFIXES, sameWish, formatAddress, type Network, type NetworkWish } from "../../network.js";
import type { Controller } from "../../controller.js";
import type { InputModule } from "../input.js";
import {
  CODE_WAIT_MS, MAIN, HOLD_MS, IMPULSE_KIND_KEYS, NETWORK_KEYS, IMPULSE_ENCODER_PAGES, SLOTS, KEY_ELEMENT_ORDER,
  KEY_IMPULSE_ENCODERS, KEY_PAGE, KEY_SYMMETRIC, KEY_BACK,
  entryAt, encoderPages, pageCount, type Menu, type Encoder, type EncoderPage,
} from "./layout.js";
import { COLOR, Painter, TONE, type Hue, type Field, type KeyContent } from "./images.js";

// @elgato-stream-deck/node needs node-hid (native) and is optional. Types come from the pure JS
// package @elgato-stream-deck/core, so the build also works without the native package (e.g. on the Pi).
interface Library {
  listStreamDecks(): Promise<{ model: DeviceModelId; path: string }[]>;
  openStreamDeck(path: string, options?: { resetToLogoOnClose?: boolean }): Promise<StreamDeck>;
  DeviceModelId: typeof DeviceModelId;
}
const LIBRARY: string = "@elgato-stream-deck/node";

const SEARCH_MS = 2000;
const DRAW_MS = 50;      // at most 20 frames per second
const FAST_MS = 60;       // detents faster than this count several times
const SAVED_MS = 1200; // a preset key shows "saved" this long

// What a key does: tap, hold or both (then a tap only triggers on release)
interface Action {
  tap?: () => void;
  hold?: { ms: number; run: () => void };
}

export class StreamDeckModule implements InputModule {
  readonly name = "Stream Deck+";
  private lib: Library | null = null;
  private painter: Painter | null = null;
  private deck: StreamDeck | null = null;
  private searchTimer: NodeJS.Timeout | undefined;
  private state: ModuleStatus["zustand"] = "bereit";
  private text = "looking for device …";
  private stopped = false;

  private menu: Menu = "main";
  private page = 0;            // page in the submenu
  private encoderPage = 0;
  private impulseEncoderPage = 0;
  private lastTurn = [0, 0, 0, 0];
  // Offset per element: a long press on the offset encoder puts Off. 1–3 and the common offset on
  // the four encoders, a long press on one of them goes back. A short press only acts on release.
  private offsetPerElement = false;
  private encoderHold: { index: number; timer: NodeJS.Timeout; triggered: boolean } | null = null;
  private hold: { key: number; tap?: () => void; timer: NodeJS.Timeout; triggered: boolean } | null = null;
  private saved: { nr: number; bis: number } | null = null;

  // Network menu (only with network): key combination, code, draft of the settings
  private combo: NodeJS.Timeout | null = null;
  private code = "";
  private codeTimer: NodeJS.Timeout | undefined;
  private draft: NetworkWish | null = null;
  private networkTimer: NodeJS.Timeout | undefined;

  // Last drawn images, so only what changed goes to the device
  private drawn = new Map<string, string>();
  private drawing = false;
  private again = false;
  private drawTimer: NodeJS.Timeout | undefined;
  private readonly onChange = () => this.drawSoon();

  constructor(private readonly controller: Controller, private readonly network: Network | null = null) {}

  async start(): Promise<void> {
    try {
      this.lib = (await import(LIBRARY)) as Library;
      this.painter = new Painter(await import("@napi-rs/canvas"));
    } catch (e) {
      this.report("fehler", `packages missing: ${errorText(e)}`);
      return;
    }
    this.controller.on("change", this.onChange);
    await this.search();
  }

  async close(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.searchTimer);
    clearTimeout(this.drawTimer);
    clearTimeout(this.codeTimer);
    clearInterval(this.networkTimer);
    if (this.combo) clearTimeout(this.combo);
    if (this.encoderHold) clearTimeout(this.encoderHold.timer);
    this.controller.off("change", this.onChange);
    const deck = this.deck;
    this.deck = null;
    if (deck) {
      await deck.clearPanel().catch(() => {});
      await deck.close().catch(() => {});
    }
  }

  status(): ModuleStatus {
    return { name: this.name, art: "eingabe", zustand: this.state, text: this.text };
  }

  // ---------- Device ----------

  private async search(): Promise<void> {
    if (this.stopped || this.deck || !this.lib) return;
    try {
      const devices = await this.lib.listStreamDecks();
      const plus = devices.find((g) => g.model === this.lib!.DeviceModelId.PLUS);
      if (plus) {
        await this.connect(plus.path);
        return;
      }
      this.report("bereit", devices.length ? "only Stream Deck+ is supported" : "no device found");
    } catch (e) {
      this.report("fehler", errorText(e));
    }
    this.searchTimer = setTimeout(() => void this.search(), SEARCH_MS);
  }

  private async connect(path: string): Promise<void> {
    try {
      const deck = await this.lib!.openStreamDeck(path, { resetToLogoOnClose: true });
      this.deck = deck;
      deck.on("down", (c) => (c.type === "button" ? this.keyDown(c.index) : this.encoderDown(c.index)));
      deck.on("up", (c) => (c.type === "button" ? this.keyUp(c.index) : this.encoderUp(c.index)));
      deck.on("rotate", (c, steps) => this.turn(c.index, steps));
      // A tap on the strip acts like pressing the encoder below it, in the impulse menu it triggers an impulse
      deck.on("lcdShortPress", (c, pos) => this.tapStrip(pos.x / c.pixelSize.width));
      deck.on("lcdLongPress", (c, pos) => this.tapStrip(pos.x / c.pixelSize.width));
      deck.on("lcdSwipe", (c, from, until) => this.swipe(from.x / c.pixelSize.width, (until.x - from.x) / c.pixelSize.width));
      deck.on("error", (e) => void this.disconnected(e));
      await deck.setBrightness(80);
      await deck.clearPanel();
      this.drawn.clear();
      this.report("aktiv", `connected (${await deck.getSerialNumber().catch(() => "?")})`);
      log("streamdeck", "connected");
      this.drawSoon();
    } catch (e) {
      // typical on the Mac: the Elgato software holds the device
      this.report("fehler", `cannot open – is the Elgato software running? (${errorText(e)})`);
      this.deck = null;
      this.searchTimer = setTimeout(() => void this.search(), SEARCH_MS);
    }
  }

  private async disconnected(e: unknown): Promise<void> {
    log("streamdeck", `disconnected: ${errorText(e)}`);
    const deck = this.deck;
    this.deck = null;
    await deck?.close().catch(() => {});
    this.report("bereit", "disconnected, looking for device …");
    this.searchTimer = setTimeout(() => void this.search(), SEARCH_MS);
  }

  private report(state: ModuleStatus["zustand"], text: string): void {
    if (this.state === state && this.text === text) return;
    this.state = state;
    this.text = text;
    this.controller.changed();
  }

  // ---------- Operation ----------

  private keyDown(key: number): void {
    // hold Output, then add Order: Output does not switch, Order does not step; after 2 s the code
    const output = this.hold;
    if (this.network && this.menu === "main" && key === MAIN.ordering && output?.key === MAIN.output && !output.triggered) {
      clearTimeout(output.timer);
      this.hold = null;
      this.combo = setTimeout(() => {
        this.combo = null;
        this.open("code");
        this.drawSoon();
      }, HOLD_MS.network);
      this.drawSoon();
      return;
    }
    const action = this.action(key);
    if (!action) return;
    if (!action.hold) {
      action.tap?.();
      this.drawSoon();
      return;
    }
    if (this.hold) clearTimeout(this.hold.timer);
    const h = action.hold;
    const held = {
      key: key,
      tap: action.tap,
      triggered: false,
      timer: setTimeout(() => {
        held.triggered = true;
        h.run();
        this.drawSoon();
      }, h.ms),
    };
    this.hold = held;
    this.drawSoon();
  }

  private keyUp(key: number): void {
    if (this.combo && (key === MAIN.output || key === MAIN.ordering)) {
      clearTimeout(this.combo);   // released too early
      this.combo = null;
      this.drawSoon();
      return;
    }
    const h = this.hold;
    if (!h || h.key !== key) return;
    clearTimeout(h.timer);
    this.hold = null;
    if (!h.triggered) h.tap?.();   // short tap
    this.drawSoon();
  }

  private open(menu: Menu, page = 0): void {
    this.menu = menu;
    this.page = page;
    clearTimeout(this.codeTimer);
    clearInterval(this.networkTimer);
    this.networkTimer = undefined;
    if (menu === "code") {
      this.code = "";
      this.codeTimer = setTimeout(() => { this.open("main"); this.drawSoon(); }, CODE_WAIT_MS);
    }
    if (menu === "network" && this.network) {
      const network = this.network;
      this.draft = structuredClone(network.wish);
      const refresh = () => void network.refresh().then(() => this.drawSoon(), () => {});
      refresh();
      this.networkTimer = setInterval(refresh, 2000);
    }
  }

  private codeDigit(digit: number): void {
    this.code += String(digit);
    clearTimeout(this.codeTimer);
    if (this.code.length < 4) {
      this.codeTimer = setTimeout(() => { this.open("main"); this.drawSoon(); }, CODE_WAIT_MS);
      return;
    }
    if (this.code === this.network?.code) {
      log("streamdeck", "network menu opened");
      this.open("network");
    } else {
      log("streamdeck", "network menu: wrong code");
      this.open("main");
    }
  }

  private networkAction(key: number): Action | undefined {
    const network = this.network, e = this.draft;
    if (!network || !e) return undefined;
    switch (key) {
      case NETWORK_KEYS.wifi: return { tap: () => { e.ap = !e.ap; } };
      case NETWORK_KEYS.lan: return { tap: () => { e.lan.modus = e.lan.modus === "dhcp" ? "fest" : "dhcp"; } };
      case NETWORK_KEYS.prefix: return {
        tap: () => {
          const i = (PREFIXES as readonly number[]).indexOf(e.lan.praefix);
          e.lan.praefix = PREFIXES[(i + 1) % PREFIXES.length]!;
        },
      };
      case NETWORK_KEYS.apply: return {
        tap: () => {
          if (network.applying || sameWish(e, network.wish)) return;
          void network.set(structuredClone(e)).then(() => {
            if (this.menu === "network") this.draft = structuredClone(network.wish);
            this.drawSoon();
          });
        },
      };
      case NETWORK_KEYS.back: return { tap: () => this.open("main") };
      case NETWORK_KEYS.reset: return { tap: () => { this.draft = structuredClone(network.wish); } };
      default: return undefined;
    }
  }

  private action(key: number): Action | undefined {
    const s = this.controller;
    if (this.menu === "main") {
      switch (key) {
        case MAIN.pattern: {
          const i = Math.max(0, MODES_SELECTABLE.indexOf(s.parameter.modus));
          return { tap: () => this.open("pattern", Math.floor(i / SLOTS.length)) };
        }
        case MAIN.presets: {
          const i = s.lastPreset ?? 0;
          return { tap: () => this.open("presets", Math.floor(i / SLOTS.length)) };
        }
        case MAIN.auto: return { tap: () => s.setAuto(!s.autoOn) };
        case MAIN.elements: return { tap: () => s.cycleStep("elementFolge") };
        case MAIN.impulse: return { tap: () => this.open("impulse") };
        case MAIN.ordering: return { tap: () => s.cycleStep("ordnung") };
        case MAIN.pause: return { tap: () => s.togglePause() };
        // only switch after holding, so a brush of the hand does not take over the show
        case MAIN.output: return { hold: { ms: HOLD_MS.output, run: () => s.setTakeover(!s.takeover.soll) } };
        default: return undefined;
      }
    }
    if (this.menu === "code") return { tap: () => this.codeDigit(key + 1) };
    if (this.menu === "network") return this.networkAction(key);
    if (key === KEY_BACK) return { tap: () => this.open("main") };
    if (this.menu === "impulse") {
      const kind = IMPULSE_KIND_KEYS[key];
      if (kind) return { tap: () => s.setImpulse({ art: kind }) };
      if (key === KEY_ELEMENT_ORDER) {
        const i = ELEMENT_ORDERS.indexOf(s.impulse.elementFolge);
        return { tap: () => s.setImpulse({ elementFolge: ELEMENT_ORDERS[(i + 1) % ELEMENT_ORDERS.length] }) };
      }
      if (key === KEY_SYMMETRIC) return { tap: () => s.setImpulse({ symmetrisch: !s.impulse.symmetrisch }) };
      if (key === KEY_IMPULSE_ENCODERS) {
        return { tap: () => { this.impulseEncoderPage = (this.impulseEncoderPage + 1) % IMPULSE_ENCODER_PAGES.length; } };
      }
      return undefined;
    }
    const count = this.menu === "pattern" ? MODES_SELECTABLE.length : PRESET_COUNT;
    if (key === KEY_PAGE) return { tap: () => { this.page = (this.page + 1) % pageCount(count); } };
    const i = entryAt(this.page, key, count);
    if (i === undefined) return undefined;
    if (this.menu === "pattern") return { tap: () => s.selectPattern(MODES_SELECTABLE[i]!) };
    return {
      tap: () => s.recallPreset(i),
      hold: {
        ms: HOLD_MS.presetStore,
        run: () => {
          s.storePreset(i);
          this.saved = { nr: i, bis: Date.now() + SAVED_MS };
          setTimeout(() => this.drawSoon(), SAVED_MS + 10);
        },
      },
    };
  }

  // Encoder pages of the current base movement; the number stays when the shape changes, but adapts
  private pages(): EncoderPage[] {
    return encoderPages(this.controller.parameter.modus);
  }

  private currentPage(): { page: EncoderPage; nr: number; count: number } {
    const pages = this.pages();
    const nr = this.encoderPage % pages.length;
    return { page: pages[nr]!, nr, count: pages.length };
  }

  private turnPage(direction: number): void {
    const n = this.pages().length;
    this.encoderPage = (((this.currentPage().nr + direction) % n) + n) % n;
  }

  private encoders(index: number): Encoder | undefined {
    return this.currentPage().page.encoders[index];
  }

  private impulseEncoders(index: number) {
    const name = IMPULSE_ENCODER_PAGES[this.impulseEncoderPage]?.encoders[index];
    // hole and iris have a size instead of the width
    return name === "breite" && isApertureKind(this.controller.impulse.art) ? "groesse" : name;
  }

  private turn(index: number, steps: number): void {
    const now = Date.now();
    const fast = now - (this.lastTurn[index] ?? 0) < FAST_MS;
    this.lastTurn[index] = now;
    if (this.menu === "code") return;
    if (this.menu === "network") {
      // one number of the fixed IP per encoder
      const a = this.draft?.lan.adresse;
      if (!a) return;
      a[index] = Math.min(255, Math.max(0, a[index]! + steps * (fast ? 10 : 1)));
      this.drawSoon();
      return;
    }
    if (this.menu === "impulse") {
      const name = this.impulseEncoders(index);
      if (name) this.controller.adjustImpulse(name, steps * (fast ? 5 : 1));
      return;
    }
    if (this.offsetMode()) {
      const n = steps * (fast ? 5 : 1);
      if (index < 3) this.controller.adjustElementOffset(index, n);
      else this.controller.adjust("offset", n);   // shifts all, distances stay
      return;
    }
    const r = this.encoders(index);
    if (!r) return;
    if (r.kind === "numeric") {
      const b = RANGES[r.name];
      // with large ranges and a fine step (speed) turning fast acts more strongly
      const factor = fast ? (b.step < 1 ? 10 : 5) : 1;
      this.controller.adjust(r.name, steps * factor);
    } else if (r.kind === "stepped") {
      this.controller.cycleStep(r.name, Math.sign(steps));
    } else if ((steps > 0) !== this.controller.parameter[r.name]) {
      this.controller.toggle(r.name);   // turn right = on, left = off
    }
  }

  // Offset per element only applies in the main menu and the submenus with encoder pages, as long as
  // the base movement uses the offset
  private offsetMode(): boolean {
    if (!this.offsetPerElement) return false;
    if (["impulse", "code", "network"].includes(this.menu) || !isUsed(this.controller.parameter.modus, "offset")) {
      this.offsetPerElement = false;
      return false;
    }
    return true;
  }

  // long press only on the offset encoder (or on every one in offset-per-element mode); otherwise immediately as before
  private encoderDown(index: number): void {
    const long = this.offsetMode() || (["main", "pattern", "presets"].includes(this.menu) && this.encoders(index)?.name === "offset");
    if (!long) {
      this.encoderPress(index);
      return;
    }
    if (this.encoderHold) clearTimeout(this.encoderHold.timer);
    const h = {
      index,
      triggered: false,
      timer: setTimeout(() => {
        h.triggered = true;
        this.offsetPerElement = !this.offsetPerElement;
        const p = this.controller.parameter;
        // first time per element: all start at the common offset
        if (this.offsetPerElement && !p.offsetGetrennt) {
          this.controller.set({ offsetGetrennt: true, offsetElemente: p.offsetElemente.map(() => p.offset) });
        }
        this.drawSoon();
      }, HOLD_MS.encoderLong),
    };
    this.encoderHold = h;
  }

  private encoderUp(index: number): void {
    const h = this.encoderHold;
    if (!h || h.index !== index) return;
    clearTimeout(h.timer);
    this.encoderHold = null;
    if (!h.triggered) this.encoderPress(index);
    this.drawSoon();
  }

  private encoderPress(index: number): void {
    if (this.menu === "code") return;
    if (this.offsetMode()) {
      const p = this.controller.parameter;
      // element: back to the common offset; common encoder: reset, all alike
      if (index < 3) this.controller.set({ offsetElemente: p.offsetElemente.map((w, i) => (i === index ? p.offset : w)) });
      else this.controller.reset("offset");
      return;
    }
    if (this.menu === "network") {
      // press: this number as saved again
      const a = this.draft?.lan.adresse, w = this.network?.wish.lan.adresse;
      if (a && w) a[index] = w[index]!;
      this.drawSoon();
      return;
    }
    if (this.menu === "impulse") {
      const name = this.impulseEncoders(index);
      if (name) this.controller.resetImpulse(name);
      return;
    }
    const r = this.encoders(index);
    if (!r) return;
    if (r.kind === "numeric") this.controller.reset(r.name);
    else if (r.kind === "switch") this.controller.toggle(r.name);
    else this.controller.set({ [r.name]: PARAMETER_DEFAULTS[r.name] });
  }

  // x: 0 = left … 1 = right
  private tapStrip(x: number): void {
    if (this.menu === "code") return;
    if (this.menu === "impulse") {
      this.controller.tapImpulse(x);
      return;
    }
    this.encoderPress(Math.min(3, Math.floor(x * 4)));
  }

  // from: start (0 … 1), dx: distance as a fraction of the strip width
  private swipe(from: number, dx: number): void {
    if (this.menu === "code" || this.menu === "network") return;
    if (this.menu === "impulse") {
      // a short swipe counts as a tap, otherwise the impulse runs from the edge in the direction of the swipe
      if (Math.abs(dx) < 0.05) this.tapStrip(from);
      else this.controller.tapImpulse(dx > 0 ? 0 : 1, true);
      return;
    }
    if (Math.abs(dx) < 0.05) return;
    this.offsetPerElement = false;
    this.turnPage(dx < 0 ? 1 : -1);
    this.drawSoon();
  }

  // ---------- Display ----------

  private drawSoon(): void {
    if (!this.deck || this.drawTimer) return;
    this.drawTimer = setTimeout(() => {
      this.drawTimer = undefined;
      void this.draw();
    }, DRAW_MS);
  }

  private async draw(): Promise<void> {
    if (this.drawing) { this.again = true; return; }
    const deck = this.deck, painter = this.painter;
    if (!deck || !painter) return;
    this.drawing = true;
    try {
      for (const c of deck.CONTROLS) {
        if (c.type === "button" && c.feedbackType === "lcd") {
          const content = this.keyContent(c.index);
          if (this.next(`key${c.index}`, content)) {
            await deck.fillKeyBuffer(c.index, painter.key(c.pixelSize.width, c.pixelSize.height, content), { format: "rgba" });
          }
        } else if (c.type === "lcd-segment") {
          const fields = this.fields();
          const { name, tone } = this.stripHeader();
          if (this.next("strip", { fields, name, tone })) {
            await deck.fillLcd(c.id, painter.strip(c.pixelSize.width, c.pixelSize.height, fields, name, tone), { format: "rgba" });
          }
        }
      }
    } catch (e) {
      log("streamdeck", `drawing: ${errorText(e)}`);
    } finally {
      this.drawing = false;
    }
    if (this.again) {
      this.again = false;
      this.drawSoon();
    }
  }

  private next(cacheKey: string, content: unknown): boolean {
    const text = JSON.stringify(content);
    if (this.drawn.get(cacheKey) === text) return false;
    this.drawn.set(cacheKey, text);
    return true;
  }

  private keyContent(key: number): KeyContent {
    // main menu: menu keys dark with neon text and neon border
    const menuKey = (tone: Hue): Partial<KeyContent> => ({ background: tone.dark, text: tone.bright, border: tone.bright, borderWidth: 3 });
    const { parameter, takeover: uebernahme, presets, lastPreset: letztesPreset } = this.controller;
    const holding = this.hold?.key === key && !this.hold.triggered ? "hold …" : undefined;
    if (this.menu === "code") {
      return { title: String(key + 1), background: TONE.network.dark, text: TONE.network.bright };
    }
    if (this.menu === "network") return this.networkKey(key);
    if (this.menu === "main" && this.combo && (key === MAIN.output || key === MAIN.ordering)) {
      return { title: "Network", below: "hold …", background: TONE.network.dark, text: TONE.network.bright, border: TONE.network.bright };
    }
    if (this.menu === "main") {
      switch (key) {
        case MAIN.pattern: return { title: "Pattern ›", below: MODE_NAME[parameter.modus], ...menuKey(TONE.pattern) };
        case MAIN.presets: {
          const p = letztesPreset === null ? null : presets[letztesPreset];
          return { title: "Presets ›", below: p?.name ?? "–", ...menuKey(TONE.presets) };
        }
        case MAIN.impulse: return { title: "Impulses ›", below: IMPULSE_NAME[this.controller.impulse.art], ...menuKey(TONE.impulse) };
        // Auto running: fully lit like the frame in the client, the current look below
        case MAIN.auto: {
          const s = this.controller;
          if (s.autoOn) {
            const p = letztesPreset === null ? null : presets[letztesPreset];
            return { title: "AUTO", below: p?.name ?? "–", background: TONE.presets.bright, text: TONE.presets.on };
          }
          return s.autoStartable
            ? { title: "Auto", below: "off", ...menuKey(TONE.presets) }
            : { title: "Auto", below: "too few presets", muted: true };
        }
        // with Rest, Order and Elements have no effect: dimmed
        case MAIN.ordering:
          return { title: "Order", below: STEPPED.ordnung.text[parameter.ordnung], muted: !isUsed(parameter.modus, "ordnung") };
        case MAIN.elements:
          return { title: "Elements", below: STEPPED.elementFolge.text[parameter.elementFolge], muted: !isUsed(parameter.modus, "elementFolge") };
        case MAIN.pause: return parameter.laeuft ? { title: "Pause" } : { title: "Resume", border: COLOR.accent };
        case MAIN.output:
          switch (uebernahme.zustand) {
            case "an": return { title: "OUTPUT", below: holding ?? "on", background: COLOR.live };
            case "blendetEin":
            case "blendetAus":
              return { title: `${Math.round(uebernahme.anteil * 100)} %`, below: "Output fading", background: COLOR.fading };
            default: return { title: "Output", below: holding ?? "off · hold", background: COLOR.liveDark, border: COLOR.live };
          }
        default: return { title: "" };
      }
    }
    // submenus: everything in the menu's colour, the selected entry bright
    const tone: Hue = TONE[this.menu];
    const entry = (title: string, selected: boolean, extra: Partial<KeyContent> = {}): KeyContent =>
      selected ? { title, background: tone.bright, text: tone.on, ...extra } : { title, background: tone.dark, ...extra };
    if (key === KEY_BACK) return { title: "‹ Back", border: tone.bright };
    if (this.menu === "impulse") {
      const e = this.controller.impulse;
      const kind = IMPULSE_KIND_KEYS[key];
      if (kind) {
        // selected kind bright, running ones with a bright border
        const running = this.controller.impulses().some((i) => i.art === kind);
        return entry(IMPULSE_NAME[kind], e.art === kind, running && e.art !== kind ? { border: tone.bright } : {});
      }
      if (key === KEY_ELEMENT_ORDER) return entry("Elements", false, { below: ELEMENT_ORDER_NAME[e.elementFolge] });
      if (key === KEY_SYMMETRIC) return entry("Symmetric", e.symmetrisch, { below: e.symmetrisch ? "on" : "off" });
      if (key === KEY_IMPULSE_ENCODERS) {
        return entry("Controls ›", false, { below: IMPULSE_ENCODER_PAGES[this.impulseEncoderPage]?.name });
      }
      return { title: "" };
    }
    const count = this.menu === "pattern" ? MODES_SELECTABLE.length : PRESET_COUNT;
    if (key === KEY_PAGE) {
      return pageCount(count) > 1
        ? entry("Page ›", false, { below: `${this.page + 1}/${pageCount(count)}` })
        : { title: "" };
    }
    const i = entryAt(this.page, key, count);
    if (i === undefined) return { title: "" };
    if (this.menu === "pattern") return entry(MODE_NAME[MODES_SELECTABLE[i]!], parameter.modus === MODES_SELECTABLE[i]);
    const p = presets[i];
    const saved = this.saved?.nr === i && Date.now() < this.saved.bis;
    if (!p) return { title: String(i + 1), below: saved ? "stored" : holding ?? "empty · hold", muted: true, background: COLOR.field };
    return entry(p.name, letztesPreset === i, { below: saved ? "stored" : holding ?? String(i + 1) });
  }

  private networkKey(key: number): KeyContent {
    const network = this.network, e = this.draft;
    if (!network || !e) return { title: "" };
    const tone = TONE.network;
    const st = network.status;
    const changed = !sameWish(e, network.wish);
    const toggle = (title: string, on: boolean, below: string): KeyContent =>
      on ? { title, below, background: tone.bright, text: tone.on } : { title, below, background: tone.dark };
    switch (key) {
      case NETWORK_KEYS.wifi: return toggle("WLAN", e.ap, e.ap ? "on" : "off");
      case NETWORK_KEYS.lan: return toggle("LAN", e.lan.modus === "dhcp", e.lan.modus === "dhcp" ? "DHCP" : "fixed IP");
      case NETWORK_KEYS.prefix: return { title: "Mask", below: `/${e.lan.praefix}`, background: tone.dark };
      case NETWORK_KEYS.apply:
        if (network.applying) return { title: "Apply", below: "applying …", background: COLOR.fading };
        return changed
          ? { title: "Apply", below: "changes", background: tone.bright, text: tone.on }
          : { title: "Apply", below: network.message || "no changes", muted: true, background: tone.dark };
      case NETWORK_KEYS.back: return { title: "‹ Back", border: tone.bright };
      case NETWORK_KEYS.reset: return changed ? { title: "Reset", below: "draft", background: tone.dark } : { title: "Reset", muted: true };
      case NETWORK_KEYS.lanState: {
        const below = st.lanAddresses[0] ?? (st.cable === false ? "no cable" : "no address");
        return { title: st.dhcpActive ? "LAN · DHCP" : "LAN", below, background: COLOR.field };
      }
      case NETWORK_KEYS.wifiState: return { title: "WLAN now", below: st.apOn ? "on" : "off", background: COLOR.field };
      default: return { title: "" };
    }
  }

  // Header of the touch strip: name of the encoder page and its colour
  private stripHeader(): { name: string; tone: Hue } {
    if (this.menu === "code") return { name: "Network · enter code", tone: TONE.network };
    if (this.menu === "network") {
      const e = this.draft;
      const mode = e?.lan.modus === "dhcp" ? "DHCP, else fixed IP" : "fixed IP";
      return { name: `Network · LAN ${mode} · ${e ? formatAddress(e) : ""}`, tone: TONE.network };
    }
    if (this.menu === "impulse") {
      const page = IMPULSE_ENCODER_PAGES[this.impulseEncoderPage];
      return { name: `${page?.name ?? ""} · Strip: ${IMPULSE_NAME[this.controller.impulse.art]}`, tone: TONE.impulse };
    }
    if (this.offsetMode()) return { name: "Offset per element · hold to leave", tone: TONE.motion };
    const { page, nr, count } = this.currentPage();
    return { name: count > 1 ? `${page.name} ${nr + 1}/${count}` : page.name, tone: TONE[page.tone] };
  }

  private fields(): Field[] {
    if (this.menu === "code") {
      return [0, 1, 2, 3].map((i): Field => ({ title: "Code", value: i < this.code.length ? "●" : "○", fraction: null }));
    }
    if (this.menu === "network") {
      const a = this.draft?.lan.adresse ?? [0, 0, 0, 0];
      const w = this.network?.wish.lan.adresse;
      return a.map((z, i): Field => ({ title: `IP ${i + 1}${w && w[i] !== z ? " *" : ""}`, value: String(z), fraction: z / 255 }));
    }
    if (this.menu === "impulse") {
      const e = this.controller.impulse;
      // always four fields, so each stands above its encoder
      return [0, 1, 2, 3].map((i): Field => {
        const name = this.impulseEncoders(i);
        if (!name) return { title: "", value: "", fraction: null };
        const b = IMPULSE_RANGES[name], w = impulseValue(e, name);
        return { title: b.short, value: formatImpulse(name, w), fraction: (w - b.min) / (b.max - b.min) };
      });
    }
    const p = this.controller.parameter;
    if (this.offsetMode()) {
      const b = RANGES.offset;
      const values = [...(p.offsetGetrennt ? p.offsetElemente : p.offsetElemente.map(() => p.offset)), p.offset];
      return values.map((w, i): Field => ({
        title: i < 3 ? `Off. ${i + 1}` : "Off. all",
        value: formatValue("offset", w),
        fraction: (w - b.min) / (b.max - b.min),
      }));
    }
    return [0, 1, 2, 3].map((i): Field => {
      const r = this.encoders(i);
      if (!r) return { title: "", value: "", fraction: null };
      if (r.kind === "numeric") {
        const b = RANGES[r.name];
        // offset per element in play: make it visible, a long press shows the three
        const title = r.name === "offset" && offsetsDiffer(p) ? "Offset 1–3" : b.short;
        return { title: title, value: formatValue(r.name, p[r.name]), fraction: (p[r.name] - b.min) / (b.max - b.min) };
      }
      if (r.kind === "switch") return { title: SWITCHES[r.name], value: p[r.name] ? "on" : "off", fraction: null };
      const st = STEPPED[r.name];
      return { title: st.name, value: (st.text as Record<string, string>)[p[r.name]] ?? "", fraction: null };
    });
  }
}
