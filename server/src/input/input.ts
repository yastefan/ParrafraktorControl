// Common interface of all controls attached to the server computer
// (Stream Deck+, later MIDI controllers, OSC). A module only operates the controller
// and shows its state; it knows nothing about outputs or clients.
import type { ModuleStatus } from "@parrafraktor/protocol";

export interface InputModule {
  readonly name: string;
  start(): Promise<void>;
  close(): Promise<void>;
  status(): ModuleStatus;
}
