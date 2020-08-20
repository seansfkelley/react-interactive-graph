import * as React from "react";
import Panzoom, { PanzoomObject } from "@panzoom/panzoom";
import type { Node, Edge, Position } from "./types";

export interface Props<N extends Node = Node, E extends Edge = Edge> {
  nodes: N[];
  edges: E[];

  defs?: React.ReactNode[];
  gridDotSize?: number;
  gridSpacing?: number;

  minZoom?: number;
  maxZoom?: number;
  zoomSpeed?: number;

  shouldStartPan?: (e: React.MouseEvent) => boolean;
  // TODO
  // shouldZoom?: (e: React.MouseEvent) => boolean;

  renderNode?: (node: N) => React.ReactNode;
  renderEdge?: (edge: E, source: N, target: N) => React.ReactNode;
  renderIncompleteEdge?: (source: N, target: Position) => React.ReactNode;

  shouldStartNodeDrag?: (e: React.MouseEvent, node: N) => boolean;
  onNodeDragStart?: (e: React.MouseEvent, node: N) => void;
  onNodeDragMove?: (e: MouseEvent, node: N, x: number, y: number) => void;
  onNodeDragEnd?: (e: MouseEvent, node: N, x: number, y: number) => void;

  shouldStartCreateEdge?: (e: React.MouseEvent, node: N) => boolean;
  onStartCreateEdge?: (source: N) => void;
  onCreateEdge?: (source: N, target: N) => void;

  className?: string;
  style?: React.SVGAttributes<SVGSVGElement>["style"];
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

export function defaultRenderEdge(_e: Edge, source: Node, target: Node) {
  return (
    <path d={`M${source.x},${source.y}L${target.x},${target.y}`} stroke="grey" strokeWidth={2} />
  );
}

export const DEFAULT_MIN_ZOOM = 0.25;
export const DEFAULT_MAX_ZOOM = 2;
export const DEFAULT_ZOOM_SPEED = 0.15;

interface DragState {
  nodeId: string;
  screenSpaceStartX: number;
  screenSpaceStartY: number;
  screenSpaceCurrentX: number;
  screenSpaceCurrentY: number;
}

interface PanState {
  screenSpaceLastX: number;
  screenSpaceLastY: number;
}

export function Graph<N extends Node = Node, E extends Edge = Edge>(props: Props<N, E>) {
  const onDocumentMouseMove = React.useRef<(e: MouseEvent) => void>();
  const onDocumentMouseUp = React.useRef<(e: MouseEvent) => void>();

  React.useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      onDocumentMouseMove.current?.(e);
    };
    document.addEventListener("mousemove", onMouseMove);

    const onMouseUp = (e: MouseEvent) => {
      onDocumentMouseUp.current?.(e);
    };
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Note that zooming and panning are handled separately. This is because, while we want to zoom
  // with all the normal interactions always (scroll, pinch), we only want to pan when interacting
  // with the background. This means we can't attach panzoom to a single element and be done with
  // it. Furthermore, we want to have a single instance, because panning and zooming is stateful
  // and we want to have a single source of truth. Therefore, we pick the element that should
  // undergo the view transforms to host panzoom, and we forward pan events to it manually.
  const panzoom = React.useRef<PanzoomObject | undefined>();
  const currentPan = React.useRef<PanState | undefined>();

  const renderNode = props.renderNode ?? defaultRenderNode;
  const renderEdge = props.renderEdge ?? defaultRenderEdge;
  const shouldStartNodeDrag = props.shouldStartNodeDrag ?? defaultShouldStartNodeDrag;
  const shouldStartPan = props.shouldStartPan ?? defaultShouldStartPan;
  const gridDotSize = props.gridDotSize ?? 2;
  const gridSpacing = props.gridSpacing ?? 50;

  const [currentDrag, setCurrentDrag] = React.useState<DragState | undefined>();

  const nodesById = React.useMemo(() => {
    const keyed: Record<string, N> = {};
    props.nodes.forEach((n) => (keyed[n.id] = n));
    return keyed;
  }, [props.nodes]);

  const onBackgroundMouseDown = React.useCallback((e: React.MouseEvent<SVGElement>) => {
    if (shouldStartPan(e)) {
      currentPan.current = { screenSpaceLastX: e.screenX, screenSpaceLastY: e.screenY };
    }
  }, []);

  const onNodeMouseDown = React.useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      if (currentDrag == null) {
        // TODO: Non-null assertion okay?
        const node = nodesById[e.currentTarget.dataset.id!];
        if (shouldStartNodeDrag(e, node)) {
          const { screenX, screenY } = e;
          props.onNodeDragStart?.(e, node);
          setCurrentDrag({
            nodeId: node.id,
            screenSpaceStartX: screenX,
            screenSpaceStartY: screenY,
            screenSpaceCurrentX: screenX,
            screenSpaceCurrentY: screenY,
          });
        }
      }
    },
    [currentDrag, shouldStartNodeDrag, props.onNodeDragStart, nodesById],
  );

  const onContainerScroll = React.useCallback((e: React.WheelEvent) => {
    panzoom.current?.zoomWithWheel(e.nativeEvent);
  }, []);

  onDocumentMouseMove.current = React.useCallback(
    (e: MouseEvent) => {
      const { screenX, screenY } = e;
      const scale = panzoom.current?.getScale() ?? 1;

      if (currentDrag) {
        const node = nodesById[currentDrag.nodeId];
        props.onNodeDragMove?.(
          e,
          node,
          (screenX - currentDrag.screenSpaceStartX) / scale + node.x,
          (screenY - currentDrag.screenSpaceStartY) / scale + node.y,
        );
        setCurrentDrag({
          ...currentDrag,
          screenSpaceCurrentX: screenX,
          screenSpaceCurrentY: screenY,
        });
      }

      if (currentPan.current) {
        panzoom.current?.pan(
          (screenX - currentPan.current.screenSpaceLastX) / scale,
          (screenY - currentPan.current.screenSpaceLastY) / scale,
          { relative: true, force: true },
        );
        currentPan.current = {
          screenSpaceLastX: screenX,
          screenSpaceLastY: screenY,
        };
      }
    },
    [currentDrag, nodesById],
  );

  onDocumentMouseUp.current = React.useCallback(
    (e: MouseEvent) => {
      if (currentDrag) {
        const node = nodesById[currentDrag.nodeId];
        const scale = panzoom.current?.getScale() ?? 1;
        props.onNodeDragEnd?.(
          e,
          node,
          (e.screenX - currentDrag.screenSpaceStartX) / scale + node.x,
          (e.screenY - currentDrag.screenSpaceStartY) / scale + node.y,
        );
        setCurrentDrag(undefined);
      }

      currentPan.current = undefined;
    },
    [currentDrag, nodesById],
  );

  // This MUST have a stable identity, otherwise it gets called on every render; I guess because
  // React wants to make sure that as the function identity changes it's always been called?
  const { current: initializePanzoom } = React.useRef((e: SVGGElement) => {
    panzoom.current = e
      ? Panzoom(e, {
          disablePan: true,
          cursor: "default",
          // TODO: Are these values captured once, or do we capture a live reference to props?
          minScale: props.minZoom ?? DEFAULT_MIN_ZOOM,
          maxScale: props.maxZoom ?? DEFAULT_MAX_ZOOM,
          step: props.zoomSpeed ?? DEFAULT_ZOOM_SPEED,
        })
      : undefined;
  });

  React.useEffect(() => {
    panzoom.current?.setOptions({
      minScale: props.minZoom ?? DEFAULT_MIN_ZOOM,
      maxScale: props.maxZoom ?? DEFAULT_MAX_ZOOM,
      step: props.zoomSpeed ?? DEFAULT_ZOOM_SPEED,
    });
  }, [props.minZoom, props.maxZoom, props.zoomSpeed]);

  const scale = panzoom.current?.getScale() ?? 1;

  return (
    <svg onWheel={onContainerScroll} className={props.className} style={props.style}>
      <defs>
        {props.defs}
        <pattern id="grid" width={gridSpacing} height={gridSpacing} patternUnits="userSpaceOnUse">
          <circle cx={gridSpacing / 2} cy={gridSpacing / 2} r={gridDotSize}></circle>
        </pattern>
      </defs>
      <g ref={initializePanzoom}>
        {/* TODO: Making a huge rect is kind of a cheat. Can we make it functionally infinite somehow? */}
        <rect
          className="panzoom-exclude"
          fill="url(#grid)"
          x="-500"
          y="-500"
          width="1000"
          height="1000"
          onMouseDown={onBackgroundMouseDown}
        />
        {props.edges.map((e) => {
          let source = nodesById[e.sourceId];
          let target = nodesById[e.targetId];

          // TODO: Can this use translation or something less heavyweight like the node renderer?
          if (currentDrag) {
            if (currentDrag.nodeId === source.id) {
              source = {
                ...source,
                x:
                  (currentDrag.screenSpaceCurrentX - currentDrag.screenSpaceStartX) / scale +
                  source.x,
                y:
                  (currentDrag.screenSpaceCurrentY - currentDrag.screenSpaceStartY) / scale +
                  source.y,
              };
            }
            if (currentDrag.nodeId === target.id) {
              target = {
                ...target,
                x:
                  (currentDrag.screenSpaceCurrentX - currentDrag.screenSpaceStartX) / scale +
                  target.x,
                y:
                  (currentDrag.screenSpaceCurrentY - currentDrag.screenSpaceStartY) / scale +
                  target.y,
              };
            }
          }

          return (
            <g key={e.id ?? `${e.sourceId} ~~~ ${e.targetId}`} className="panzoom-exclude">
              {renderEdge(e, source, target)}
            </g>
          );
        })}
        {props.nodes.map((n) => {
          const transform =
            currentDrag?.nodeId === n.id
              ? `translate(${
                  (currentDrag.screenSpaceCurrentX - currentDrag.screenSpaceStartX) / scale
                }, ${(currentDrag.screenSpaceCurrentY - currentDrag.screenSpaceStartY) / scale})`
              : undefined;
          return (
            <g
              key={n.id}
              data-id={n.id}
              onMouseDown={onNodeMouseDown}
              transform={transform}
              className="panzoom-exclude"
            >
              {renderNode(n)}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
