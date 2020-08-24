import type { Position } from "./types";
import { assertNever } from "./lang";

export enum PathType {
  STRAIGHT = "straight",
  RIGHT = "right",
  THREE_PART = "three-part",
  BEZIER = "bezier",
}

export enum PathDirection {
  AUTO = "auto",
  HORIZONTAL_FIRST = "horizontal-first",
  VERTICAL_FIRST = "vertical-first",
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
  const deltaX = Math.abs(target.x - source.x);
  const deltaY = Math.abs(target.y - source.y);
  // Attempt to draw the longest, straightest line.
  return deltaX > deltaY ? PathDirection.HORIZONTAL_FIRST : PathDirection.VERTICAL_FIRST;
}

function _straight(source: Position, target: Position) {
  return `M${source.x},${source.y}L${target.x},${target.y}`;
}

function _right(source: Position, target: Position, direction: PathDirection) {
  if (direction === PathDirection.HORIZONTAL_FIRST) {
    return `M${source.x},${source.y}L${target.x},${source.y}L${target.x},${target.y}`;
  } else if (direction === PathDirection.VERTICAL_FIRST) {
    return `M${source.x},${source.y}L${source.x},${target.y}L${target.x},${target.y}`;
  } else {
    throw new Error(`unexpected direction ${direction}`);
  }
}

function _threePart(source: Position, target: Position, direction: PathDirection) {
  if (direction === PathDirection.HORIZONTAL_FIRST) {
    const halfway = (source.x + target.x) / 2;
    return `M${source.x},${source.y}L${halfway},${source.y}L${halfway},${target.y}L${target.x},${target.y}`;
  } else if (direction === PathDirection.VERTICAL_FIRST) {
    const halfway = (source.y + target.y) / 2;
    return `M${source.x},${source.y}L${source.x},${halfway}L${target.x},${halfway}L${target.x},${target.y}`;
  } else {
    throw new Error(`unexpected direction ${direction}`);
  }
}

function _bezier(source: Position, target: Position, direction: PathDirection) {
  if (direction === PathDirection.HORIZONTAL_FIRST) {
    const halfway = (source.x + target.x) / 2;
    return `M${source.x},${source.y}C${halfway},${source.y},${halfway},${target.y},${target.x},${target.y}`;
  } else if (direction === PathDirection.VERTICAL_FIRST) {
    const halfway = (source.y + target.y) / 2;
    return `M${source.x},${source.y}C${source.x},${halfway},${target.x},${halfway},${target.x},${target.y}`;
  } else {
    throw new Error(`unexpected direction ${direction}`);
  }
}
