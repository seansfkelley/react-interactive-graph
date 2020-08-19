import * as React from "react";
import type { Node, Edge } from "./types";

export interface Props<N extends Node = Node, E extends Edge = Edge> {
  nodes: N[];
  edges: E[];
  renderNode?: (n: N) => React.ReactNode;
  renderEdge?: (e: E, source: N, target: N) => React.ReactNode;
  shouldStartDrag?: (e: React.MouseEvent) => boolean;
  onDragStart?: (n: N) => void;
  onDragMove?: (n: N) => void;
  onDragEnd?: (n: N) => void;
}

export function defaultShouldStartDrag(e: React.MouseEvent) {
  return e.buttons === 1;
}

export function defaultRenderNode(n: Node) {
  return <circle key={n.id} cx={n.x} cy={n.y} r="10"></circle>;
}

export function defaultRenderEdge(e: Edge, source: Node, target: Node) {
  return (
    <path
      key={e.id ?? `${e.sourceId} ~~~ ${e.targetId}`}
      d={`M${source.x},${source.y}L${target.x},${target.y}`}
      stroke="grey"
      strokeWidth={2}
    />
  );
}

export function Graph<N extends Node = Node, E extends Edge = Edge>(props: Props<N, E>) {
  const renderNode = props.renderNode || defaultRenderNode;
  const renderEdge = props.renderEdge || defaultRenderEdge;

  const nodesById = React.useMemo(() => {
    const keyed: Record<string, N> = {};
    props.nodes.forEach((n) => (keyed[n.id] = n));
    return keyed;
  }, [props.nodes]);

  return (
    <svg>
      {props.edges.map((e) => renderEdge(e, nodesById[e.sourceId], nodesById[e.targetId]))}
      {props.nodes.map((n) => renderNode(n))}
    </svg>
  );
}
