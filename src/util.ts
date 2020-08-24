import type { Position } from "./types";

export function pathD(source: Position, target: Position) {
  return `M${source.x},${source.y}L${target.x},${target.y}`;
}
