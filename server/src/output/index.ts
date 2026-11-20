import type { Settings } from "@parrafraktor/protocol";
import type { Output } from "./output.js";
import { ArtnetOutput } from "./artnet.js";
import { Rs485Output } from "./rs485.js";
import { SacnOutput } from "./sacn.js";

export type { Output } from "./output.js";

// Create all enabled outputs. Several at once are possible.
export function createOutputs(e: Settings): Output[] {
  const outputs: Output[] = [];
  if (e.artnet.an) outputs.push(new ArtnetOutput(e.artnet));
  if (e.sacn.an) outputs.push(new SacnOutput(e.sacn));
  if (e.rs485.an) outputs.push(new Rs485Output(e.rs485));
  return outputs;
}
