// MIDI controller – placeholder.
//
// Planned: controllers via USB MIDI (e.g. with the package "@julusian/midi"), mapping from a
// file in the data directory: CC → adjust(name, …) or absolute values via RANGES,
// notes → selectPattern / togglePause / setTakeover. Feedback (LEDs, motor faders) via
// the controller's "change" event.
import type { ModuleStatus } from "@parrafraktor/protocol";
import type { Controller } from "../controller.js";
import type { InputModule } from "./input.js";

export class MidiModule implements InputModule {
  readonly name = "MIDI";

  constructor(readonly controller: Controller) {}

  async start(): Promise<void> {}

  async close(): Promise<void> {}

  status(): ModuleStatus {
    return { name: this.name, art: "eingabe", zustand: "aus", text: "not implemented yet" };
  }
}
