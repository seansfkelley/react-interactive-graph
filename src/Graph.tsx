import * as React from "react";
import type { Node, Edge, Position } from "./types";

export interface Props<N extends Node = Node, E extends Edge = Edge> {
  nodes: N[];
  edges: E[];

  defs?: React.ReactNode[];
  gridDotSize?: number;
  gridSpacing?: number;

  shouldStartPan?: (e: React.MouseEvent) => boolean;

  renderNode?: (node: N) => React.ReactNode;
  renderEdge?: (edge: E, source: N, target: N) => React.ReactNode;
  renderIncompleteEdge?: (source: N, target: Position) => React.ReactNode;

  shouldStartNodeDrag?: (e: React.MouseEvent, node: N) => boolean;
  onNodeDragStart?: (e: React.MouseEvent, node: N) => void;
  onNodeDragMove?: (e: React.MouseEvent, node: N, x: number, y: number) => void;
  onNodeDragEnd?: (e: React.MouseEvent, node: N, x: number, y: number) => void;

  shouldStartCreateEdge?: (e: React.MouseEvent, node: N) => boolean;
  onStartCreateEdge?: (source: N) => void;
  onCreateEdge?: (source: N, target: N) => void;
}

export function defaultShouldStartPan(e: React.MouseEvent) {
  return e.buttons === 1;
}

export function defaultShouldStartNodeDrag(e: React.MouseEvent) {
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

interface PanState {
  lastX: number;
  lastY: number;
}

export function Graph<N extends Node = Node, E extends Edge = Edge>(props: Props<N, E>) {
  const renderNode = props.renderNode ?? defaultRenderNode;
  const renderEdge = props.renderEdge ?? defaultRenderEdge;
  const shouldStartNodeDrag = props.shouldStartNodeDrag ?? defaultShouldStartNodeDrag;
  const shouldStartPan = props.shouldStartPan ?? defaultShouldStartPan;
  const gridDotSize = props.gridDotSize ?? 2;
  const gridSpacing = props.gridSpacing ?? 50;

  const [currentDrag, setCurrentDrag] = React.useState<DragState | undefined>();
  const [currentPan, setCurrentPan] = React.useState<PanState | undefined>();
  const [viewTranslation, setViewTranslation] = React.useState({ x: 0, y: 0 });
  const [viewZoom, setViewZoom] = React.useState(1);

  const nodesById = React.useMemo(() => {
    const keyed: Record<string, N> = {};
    props.nodes.forEach((n) => (keyed[n.id] = n));
    return keyed;
  }, [props.nodes]);

  const onBackgroundMouseDown = React.useCallback((e: React.MouseEvent<SVGElement>) => {
    if (shouldStartPan(e)) {
      setCurrentPan({ lastX: e.pageX, lastY: e.pageY });
    }
  }, []);

  const onNodeMouseDown = React.useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      if (currentDrag == null) {
        // TODO: Non-null assertion okay?
        const node = nodesById[e.currentTarget.dataset.id!];
        if (shouldStartNodeDrag(e, node)) {
          props.onNodeDragStart?.(e, node);
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
    [currentDrag, shouldStartNodeDrag, props.onNodeDragStart, nodesById],
  );

  const onContainerMouseMove = React.useCallback(
    (e: React.MouseEvent) => {
      if (currentDrag) {
        const node = nodesById[currentDrag.nodeId];
        props.onNodeDragMove?.(
          e,
          node,
          e.pageX - currentDrag.startX + node.x,
          e.pageY - currentDrag.startY + node.y,
        );
        setCurrentDrag({ ...currentDrag, currentX: e.pageX, currentY: e.pageY });
      }

      if (currentPan) {
        const { pageX, pageY } = e;

        setCurrentPan({
          lastX: pageX,
          lastY: pageY,
        });
        setViewTranslation(({ x, y }) => ({
          x: x + pageX - currentPan.lastX,
          y: y + pageY - currentPan.lastY,
        }));
      }
    },
    [currentDrag, nodesById, currentPan],
  );

  const onContainerMouseUp = React.useCallback(
    (e: React.MouseEvent) => {
      if (currentDrag) {
        const node = nodesById[currentDrag.nodeId];
        props.onNodeDragEnd?.(
          e,
          node,
          e.pageX - currentDrag.startX + node.x,
          e.pageY - currentDrag.startY + node.y,
        );
        setCurrentDrag(undefined);
      }

      setCurrentPan(undefined);
    },
    [currentDrag, nodesById],
  );

  return (
    <svg onMouseMove={onContainerMouseMove} onMouseUp={onContainerMouseUp}>
      <defs>
        {props.defs}
        <pattern id="grid" width={gridSpacing} height={gridSpacing} patternUnits="userSpaceOnUse">
          <circle cx={gridSpacing / 2} cy={gridSpacing / 2} r={gridDotSize}></circle>
        </pattern>
      </defs>
      <g transform={`translate(${viewTranslation.x}, ${viewTranslation.y})`}>
        <rect fill="url(#grid)" width="1000" height="1000" onMouseDown={onBackgroundMouseDown} />
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
            <g key={n.id} data-id={n.id} onMouseDown={onNodeMouseDown} transform={transform}>
              {renderNode(n)}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
