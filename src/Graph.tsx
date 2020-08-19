import * as React from "react";
import type { Node, Edge } from "./types";

export interface Props<N extends Node = Node, E extends Edge = Edge> {
  nodes: N[];
  edges: E[];
  renderNode?: (n: N) => React.ReactNode;
  renderEdge?: (e: E, source: N, target: N) => React.ReactNode;
  shouldStartDrag?: (e: React.MouseEvent, n: N) => boolean;
  onDragStart?: (e: React.MouseEvent, n: N) => void;
  onDragMove?: (e: React.MouseEvent, n: N, x: number, y: number) => void;
  onDragEnd?: (e: React.MouseEvent, n: N, x: number, y: number) => void;
}

export function defaultShouldStartDrag(e: React.MouseEvent) {
  return e.buttons === 1;
}

export function defaultRenderNode(n: Node) {
  return <circle cx={n.x} cy={n.y} r="10"></circle>;
}

export function defaultRenderEdge(e: Edge, source: Node, target: Node) {
  return (
    <path d={`M${source.x},${source.y}L${target.x},${target.y}`} stroke="grey" strokeWidth={2} />
  );
}

interface DragState {
  nodeId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function Graph<N extends Node = Node, E extends Edge = Edge>(props: Props<N, E>) {
  const renderNode = props.renderNode || defaultRenderNode;
  const renderEdge = props.renderEdge || defaultRenderEdge;
  const shouldStartDrag = props.shouldStartDrag || defaultShouldStartDrag;

  const [currentDrag, setCurrentDrag] = React.useState<DragState | undefined>();

  const nodesById = React.useMemo(() => {
    const keyed: Record<string, N> = {};
    props.nodes.forEach((n) => (keyed[n.id] = n));
    return keyed;
  }, [props.nodes]);

  const maybeStartDrag = React.useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      if (currentDrag == null) {
        // TODO: Non-null assertion okay?
        const node = nodesById[e.currentTarget.dataset.id!];
        if (shouldStartDrag(e, node)) {
          props.onDragStart?.(e, node);
          setCurrentDrag({
            nodeId: node.id,
            startX: e.pageX,
            startY: e.pageY,
            currentX: e.pageX,
            currentY: e.pageY,
          });
        }
      }
    },
    [currentDrag, shouldStartDrag, props.onDragStart, nodesById],
  );

  const maybeDrag = React.useCallback(
    (e: React.MouseEvent) => {
      if (currentDrag) {
        const node = nodesById[currentDrag.nodeId];
        props.onDragMove?.(
          e,
          node,
          e.pageX - currentDrag.startX + node.x,
          e.pageY - currentDrag.startY + node.y,
        );
        setCurrentDrag({ ...currentDrag, currentX: e.pageX, currentY: e.pageY });
      }
    },
    [currentDrag, nodesById],
  );

  const maybeEndDrag = React.useCallback(
    (e: React.MouseEvent) => {
      if (currentDrag) {
        const node = nodesById[currentDrag.nodeId];
        props.onDragEnd?.(
          e,
          node,
          e.pageX - currentDrag.startX + node.x,
          e.pageY - currentDrag.startY + node.y,
        );
        setCurrentDrag(undefined);
      }
    },
    [currentDrag, nodesById],
  );

  return (
    <svg onMouseMove={maybeDrag} onMouseUp={maybeEndDrag}>
      {props.edges.map((e) => {
        let source = nodesById[e.sourceId];
        let target = nodesById[e.targetId];

        // TODO: Can this use translation or something less heavyweight like the node renderer?
        if (currentDrag) {
          if (currentDrag.nodeId === source.id) {
            source = {
              ...source,
              x: currentDrag.currentX - currentDrag.startX + source.x,
              y: currentDrag.currentY - currentDrag.startY + source.y,
            };
          }
          if (currentDrag.nodeId === target.id) {
            target = {
              ...target,
              x: currentDrag.currentX - currentDrag.startX + target.x,
              y: currentDrag.currentY - currentDrag.startY + target.y,
            };
          }
        }

        return (
          <g key={e.id ?? `${e.sourceId} ~~~ ${e.targetId}`}>{renderEdge(e, source, target)}</g>
        );
      })}
      {props.nodes.map((n) => {
        const transform =
          currentDrag?.nodeId === n.id
            ? `translate(${currentDrag.currentX - currentDrag.startX}, ${
                currentDrag.currentY - currentDrag.startY
              })`
            : undefined;
        return (
          <g key={n.id} data-id={n.id} onMouseDown={maybeStartDrag} transform={transform}>
            {renderNode(n)}
          </g>
        );
      })}
    </svg>
  );
}
