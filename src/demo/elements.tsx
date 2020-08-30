import * as React from "react";
import type { SelectionSet } from "./hooks";
import { shape, intersect } from "svg-intersections";
import {
  Position,
  NodeComponentProps,
  EdgeComponentProps,
  selfEdgePathD,
  pathD,
  PathType,
  PathDirection,
} from "../";
import type { IncompleteEdgeComponentProps } from "../types";

export const NODE_RADIUS = 40;
export const SELECTION_COLOR = "#5558fc";
export const ARROW_SIZE = 10;

export interface ExtraProps {
  nodeSelection: SelectionSet;
  edgeSelection: SelectionSet;
  snap: <T extends Position>(v: T) => T;
  pathType: PathType;
  pathDirection: PathDirection;
  dropShadows: boolean;
}

export function Node(props: NodeComponentProps & ExtraProps) {
  const node = props.snap(props.node);
  const isSelected = props.nodeSelection.has(props.nodeId);
  return (
    <>
      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS}
        strokeWidth={isSelected ? 2 : 1}
        fill="white"
        stroke={isSelected ? SELECTION_COLOR : "black"}
        filter={
          props.dropShadows
            ? isSelected
              ? "url(#drop-shadow-node-highlight)"
              : "url(#drop-shadow-node)"
            : undefined
        }
      />
      <text
        x={node.x}
        y={node.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="36"
        fontFamily="sans-serif"
      >
        {props.nodeId}
      </text>
    </>
  );
}

export function Edge(props: EdgeComponentProps & ExtraProps) {
  const isSelected = props.edgeSelection.has(props.edgeId);

  const snappedSource = props.snap(props.source);
  const snappedTarget = props.snap(props.target);

  const { points: targetIntersections } = intersect(
    shape("circle", { cx: snappedTarget.x, cy: snappedTarget.y, r: NODE_RADIUS }),
    shape("line", {
      x1: snappedSource.x,
      y1: snappedSource.y,
      x2: snappedTarget.x,
      y2: snappedTarget.y,
    }),
  );

  const targetPoint = targetIntersections.length > 0 ? targetIntersections[0] : snappedTarget;

  const d =
    props.edge.sourceId === props.edge.targetId
      ? selfEdgePathD(snappedSource, 150)
      : pathD(snappedSource, targetPoint, props.pathType, props.pathDirection);

  return (
    <>
      {/* Superfat edge to make the click target larger. */}
      <path d={d} stroke="transparent" strokeWidth={40} fill="transparent" />
      <path
        d={d}
        stroke={isSelected ? SELECTION_COLOR : "transparent"}
        strokeWidth={3}
        fill="transparent"
        filter={isSelected && props.dropShadows ? "url(#drop-shadow-edge-highlight)" : undefined}
      />
      <path
        d={d}
        stroke="black"
        strokeWidth={isSelected ? 1 : 2}
        fill="transparent"
        filter={isSelected || !props.dropShadows ? undefined : "url(#drop-shadow-edge)"}
        style={{ markerEnd: "url(#arrow)" }}
      />
    </>
  );
}

export function IncompleteEdge(props: IncompleteEdgeComponentProps & ExtraProps) {
  return (
    <path
      d={
        props.sourceId === props.targetId
          ? selfEdgePathD(props.snap(props.source), 150)
          : pathD(
              props.snap(props.source),
              props.target ? props.snap(props.target) : props.position,
            )
      }
      stroke="black"
      strokeWidth={2}
      strokeDasharray="20,10"
      fill="transparent"
      filter={props.dropShadows ? "url(#drop-shadow-edge)" : undefined}
    />
  );
}

export function Defs() {
  return (
    <defs>
      {/* TODO: Can this be one drop shadow with different colors at the usage site? */}
      <filter id="drop-shadow-node">
        <feDropShadow dx="1" dy="1" stdDeviation="2" floodColor="black" />
      </filter>
      <filter id="drop-shadow-node-highlight">
        <feDropShadow dx="1" dy="1" stdDeviation="3" floodColor={SELECTION_COLOR} />
      </filter>
      <filter id="drop-shadow-edge">
        <feDropShadow dx="1" dy="1" stdDeviation="1" floodColor="black" />
      </filter>
      <filter id="drop-shadow-edge-highlight">
        <feDropShadow dx="1" dy="1" stdDeviation="2" floodColor={SELECTION_COLOR} />
      </filter>
      <marker
        id="arrow"
        viewBox={`0 -${ARROW_SIZE / 2} ${ARROW_SIZE} ${ARROW_SIZE}`}
        refX={ARROW_SIZE}
        markerWidth={ARROW_SIZE}
        markerHeight={ARROW_SIZE}
        orient="auto"
      >
        <path
          d={`M0,-${ARROW_SIZE / 2}L${ARROW_SIZE},0L0,${ARROW_SIZE / 2}`}
          width={ARROW_SIZE}
          height={ARROW_SIZE}
        />
      </marker>
    </defs>
  );
}
