import type { Position } from "./types";
import { assertNever } from "./lang";

export enum PathType {
  STRAIGHT = "straight",
  RIGHT = "right-auto",
  THREE_PART = "three-part",
  BEZIER = "bezier",
}

export enum PathDirection {
  HORIZONTAL_FIRST = "horizontal-first",
  VERTICAL_FIRST = "vertical-first",
  AUTO = "auto",
}

export function pathD(
  source: Position,
  target: Position,
  pathType: PathType = PathType.STRAIGHT,
  preferredPathDirection: PathDirection = PathDirection.AUTO,
) {
  if (pathType === PathType.STRAIGHT) {
    return _straight(source, target);
  } else {
    const direction =
      preferredPathDirection === PathDirection.AUTO
        ? _getAutoDirection(source, target)
        : preferredPathDirection;
    if (pathType === PathType.RIGHT) {
      return _right(source, target, direction);
    } else if (pathType === PathType.THREE_PART) {
      return _threePart(source, target, direction);
    } else if (pathType === PathType.BEZIER) {
      return _bezier(source, target, direction);
    } else {
      return assertNever(pathType);
    }
  }
}

function _getAutoDirection(source: Position, target: Position) {
  const deltaX = Math.abs(source.x - target.x);
  const deltaY = Math.abs(source.y - target.y);
  // Attempt to draw the longest, straightest line.
  return deltaX > deltaY ? PathDirection.VERTICAL_FIRST : PathDirection.HORIZONTAL_FIRST;
}

function _straight(source: Position, target: Position) {
  return `M${source.x},${source.y}L${target.x},${target.y}`;
}

function _right(source: Position, target: Position, direction: PathDirection) {}

function _threePart(source: Position, target: Position, direction: PathDirection) {}

function _bezier(source: Position, target: Position, direction: PathDirection) {}
