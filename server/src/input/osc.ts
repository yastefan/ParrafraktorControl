// OSC – placeholder.
//
// Planned: UDP port (e.g. 8000) with addresses like /parrafraktor/pattern <name>,
// /parrafraktor/offset <degrees>, /parrafraktor/output <0|1>. Values go through
// checkParameter or the controller's actions, so the same limits apply as everywhere.
import type { ModuleStatus } from "@parrafraktor/protocol";
import type { Controller } from "../controller.js";
import type { InputModule } from "./input.js";

export class OscModule implements InputModule {
  readonly name = "OSC";

  constructor(readonly controller: Controller) {}

  async start(): Promise<void> {}

  async close(): Promise<void> {}

  status(): ModuleStatus {
    return { name: this.name, art: "eingabe", zustand: "aus", text: "not implemented yet" };
  }
}
