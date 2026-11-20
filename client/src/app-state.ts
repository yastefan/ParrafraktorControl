// Client state: the last state from the server plus local changes still on their way.
//
// A fader must not jump while dragging when an older state arrives from the server.
// So a local change applies until the server confirms it or it is 1 s old.
import { useEffect, useState } from "preact/hooks";
import type { Parameter } from "@parrafraktor/engine";
import type { ClientMessage, ServerMessage, State } from "@parrafraktor/protocol";
import { Connection, type ConnectionState } from "./connection.js";

const LOCAL_MS = 1000;

type Local = { [K in keyof Parameter]?: { value: Parameter[K]; time: number } };

class AppState {
  state: State | null = null;
  // performance.now() when the state was received: impulses run on locally from then
  stateTime = 0;
  connection: ConnectionState = "verbinde";
  updateReady: (() => void) | null = null;
  private local: Local = {};
  private listeners = new Set<() => void>();
  private pending: Partial<Parameter> | null = null;
  private readonly ws = new Connection(
    (n) => this.receive(n),
    (z) => { this.connection = z; this.report(); },
  );

  start(): void {
    this.ws.start();
  }

  // Parameters with local, not yet confirmed changes
  get parameter(): Parameter | null {
    if (!this.state) return null;
    const p = { ...this.state.parameter } as Record<string, unknown>;
    for (const [k, v] of Object.entries(this.local)) if (v) p[k] = v.value;
    return p as unknown as Parameter;
  }

  get usable(): boolean {
    return this.connection === "verbunden" && this.state !== null;
  }

  // Change parameters. Sends at most every 16 ms. Deliberately setTimeout instead of
  // requestAnimationFrame: that pauses while the page is not visible.
  set(part: Partial<Parameter>): void {
    if (!this.usable) return;
    const time = Date.now();
    for (const [k, value] of Object.entries(part)) (this.local as Record<string, unknown>)[k] = { wert: value, zeit: time };
    const first = this.pending === null;
    this.pending = { ...this.pending, ...part };
    if (first) {
      window.setTimeout(() => {
        const p = this.pending;
        this.pending = null;
        if (p) this.ws.send({ typ: "setze", parameter: p });
      }, 16);
    }
    this.report();
  }

  send(n: ClientMessage): void {
    if (this.usable) this.ws.send(n);
  }

  showUpdate(update: () => void): void {
    this.updateReady = update;
    this.report();
  }

  subscribe(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private receive(n: ServerMessage): void {
    if (n.typ !== "stand") return;
    this.state = n;
    this.stateTime = performance.now();
    // Drop local values that are confirmed or too old
    const now = Date.now();
    for (const [k, v] of Object.entries(this.local) as [keyof Parameter, { value: unknown; time: number }][]) {
      if (n.parameter[k] === v.value || now - v.time > LOCAL_MS) delete this.local[k];
    }
    this.report();
  }

  private report(): void {
    for (const f of this.listeners) f();
  }
}

export const appState = new AppState();

// Redraw the component when something changes
export function useAppState(): AppState {
  const [, setCounter] = useState(0);
  useEffect(() => appState.subscribe(() => setCounter((z) => z + 1)), []);
  return appState;
}
