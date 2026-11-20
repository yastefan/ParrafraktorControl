// Common interface of all DMX outputs (Art-Net, sACN, later RS485 on the Raspberry Pi).
// The ticker calls send() about 40 times per second while the app drives the mirrors,
// and release() once when it hands back to the MA.
import type { ModuleStatus } from "@parrafraktor/protocol";

export interface Output {
  readonly name: string;
  // universes: universe (1 …) → 512 channels
  send(universes: ReadonlyMap<number, Uint8Array>): void;
  // takeover ended: leave the mirrors to the MA again
  release(): void;
  close(): Promise<void>;
  status(): ModuleStatus;
}
