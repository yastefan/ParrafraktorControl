// DMX512 over RS485 on the serial port of the Raspberry Pi – not implemented yet.
//
// Planned: UART (/dev/serial0) at 250 000 baud, 8N2, with an RS485 transceiver in front
// (e.g. MAX485 or a ready-made DMX HAT). Every packet starts with a break (≥ 88 µs) and
// mark-after-break (≥ 8 µs), then start code 0 and 512 channels. On the Pi the break is easiest
// made by briefly sending a 0 at a low baud rate.
// Only one universe per port: the universe of the first element is sent.
import type { ModuleStatus, Rs485Settings } from "@parrafraktor/protocol";
import type { Output } from "./output.js";

export class Rs485Output implements Output {
  readonly name = "DMX RS485";

  constructor(private readonly e: Rs485Settings) {}

  send(): void {}

  release(): void {}

  async close(): Promise<void> {}

  status(): ModuleStatus {
    return { name: this.name, art: "ausgabe", zustand: "fehler", text: `${this.e.geraet}: not implemented yet` };
  }
}
