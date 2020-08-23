import * as React from "react";
import Panzoom, { PanzoomObject } from "@panzoom/panzoom";
import type { Node, Edge, Position } from "./types";
import { assertNonNull, keyBy } from "./lang";

export interface Grid {
  dotSize: number;
  spacing: number;
}

export interface Pan {
  x: number;
  y: number;
}

export interface PanConstraints {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface ZoomConstraints {
  min: number;
  max: number;
  speed: number;
}

export interface Props<N extends Node = Node, E extends Edge = Edge> {
  nodes: N[];
  edges: E[];

  defs?: React.ReactNode[];
  grid?: Partial<Grid> | boolean;

  // TODO: All of these.
  pan?: Partial<Pan> | boolean;
  onPan?: (pan: Pan) => void;
  panConstraints?: Partial<PanConstraints>;
  zoom?: number | boolean;
  onZoom?: (zoom: number) => void;
  zoomConstraints?: Partial<ZoomConstraints>;

  // TODO: Move this into PanConstraints -> PanSettings?
  shouldStartPan?: (e: React.MouseEvent) => boolean;
  // TODO
  // shouldZoom?: (e: React.MouseEvent) => boolean;

  renderNode?: (node: N) => React.ReactNode;
  renderEdge?: (edge: E, source: N, target: N) => React.ReactNode;
  renderIncompleteEdge?: (source: N, target: Position) => React.ReactNode;

  onClickNode?: (e: React.MouseEvent, node: N) => void;
  onClickEdge?: (e: React.MouseEvent, edge: E, source: N, target: N) => void;
  onClickBackground?: (e: React.MouseEvent) => void;

  shouldStartNodeDrag?: (e: MouseEvent, node: N) => boolean;
  onNodeDragStart?: (e: MouseEvent, node: N) => void;
  onNodeDragMove?: (e: MouseEvent, node: N, x: number, y: number) => void;
  onNodeDragEnd?: (e: MouseEvent, node: N, x: number, y: number) => void;

  shouldStartCreateEdge?: (e: React.MouseEvent, source: N) => boolean;
  onStartCreateEdge?: (source: N) => void;
  onCreateEdge?: (source: N, target: N) => void;

  className?: string;
  style?: React.SVGAttributes<SVGSVGElement>["style"];
}

export const defaultShouldStartPan: NonNullable<Props["shouldStartPan"]> = (e) => {
  return e.buttons === 1;
};

export const defaultShouldStartNodeDrag: NonNullable<Props["shouldStartNodeDrag"]> = (e) => {
  return e.buttons === 1;
};

export const defaultRenderNode: NonNullable<Props["renderNode"]> = (n) => {
  return <circle cx={n.x} cy={n.y} r="10"></circle>;
};

export const defaultRenderEdge: NonNullable<Props["renderEdge"]> = (_e, source, target) => {
  return (
    <path d={`M${source.x},${source.y}L${target.x},${target.y}`} stroke="grey" strokeWidth={2} />
  );
};

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

export function Graph<N extends Node = Node, E extends Edge = Edge>(
  props: React.PropsWithChildren<Props<N, E>>,
) {
  const nodesById = React.useMemo(() => keyBy(props.nodes as Node[], "id"), [
    props.nodes,
  ]) as Record<string, N>;

  const edgesById = React.useMemo(() => keyBy(props.edges as Edge[], "id"), [
    props.edges,
  ]) as Record<string, E>;

  const onMouseMoveDocument = React.useRef<(e: MouseEvent) => void>();
  const onMouseUpDocument = React.useRef<(e: MouseEvent) => void>();

  React.useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      onMouseMoveDocument.current?.(e);
    };
    document.addEventListener("mousemove", onMouseMove);

    const onMouseUp = (e: MouseEvent) => {
      onMouseUpDocument.current?.(e);
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
  const gridDotSize = (typeof props.grid !== "boolean" ? props.grid?.dotSize : undefined) ?? 2;
  const gridSpacing = (typeof props.grid !== "boolean" ? props.grid?.spacing : undefined) ?? 50;

  const [currentDrag, setCurrentDrag] = React.useState<DragState | undefined>();

  const onMouseDownBackground = React.useCallback((e: React.MouseEvent<SVGElement>) => {
    if (shouldStartPan(e)) {
      currentPan.current = { screenSpaceLastX: e.screenX, screenSpaceLastY: e.screenY };
    }
  }, []);

  const onMouseDownNode = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (currentDrag == null) {
        const { id } = e.currentTarget.dataset;
        assertNonNull(id);
        const node = nodesById[id];
        const { screenX, screenY } = e;
        if (shouldStartNodeDrag(e.nativeEvent, node)) {
          setCurrentDrag({
            nodeId: id,
            screenSpaceStartX: screenX,
            screenSpaceStartY: screenY,
            screenSpaceCurrentX: screenX,
            screenSpaceCurrentY: screenY,
          });
        }
      }
    },
    [shouldStartNodeDrag, props.onNodeDragStart, nodesById, currentDrag],
  );

  const onClickNode = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      // TODO: How to prevent this firing after a drag finishes?
      if (props.onClickNode) {
        const { id } = e.currentTarget.dataset;
        assertNonNull(id);
        props.onClickNode(e, nodesById[id]);
      }
    },
    [props.onClickNode, currentDrag, nodesById],
  );

  const onClickEdge = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (props.onClickEdge) {
        const { id } = e.currentTarget.dataset;
        assertNonNull(id);
        const edge = edgesById[id];
        props.onClickEdge(e, edge, nodesById[edge.sourceId], nodesById[edge.targetId]);
      }
    },
    [props.onClickEdge, nodesById, edgesById],
  );

  const onWheelContainer = React.useCallback((e: React.WheelEvent) => {
    panzoom.current?.zoomWithWheel(e.nativeEvent);
  }, []);

  onMouseMoveDocument.current = React.useCallback(
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

  onMouseUpDocument.current = React.useCallback(
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
          minScale: props.zoomConstraints?.min ?? DEFAULT_MIN_ZOOM,
          maxScale: props.zoomConstraints?.max ?? DEFAULT_MAX_ZOOM,
          step: props.zoomConstraints?.speed ?? DEFAULT_ZOOM_SPEED,
        })
      : undefined;
  });

  React.useEffect(() => {
    // TODO: Does this snap back to the constrained settings if the range is reduced below current?
    panzoom.current?.setOptions({
      minScale: props.zoomConstraints?.min ?? DEFAULT_MIN_ZOOM,
      maxScale: props.zoomConstraints?.max ?? DEFAULT_MAX_ZOOM,
      step: props.zoomConstraints?.speed ?? DEFAULT_ZOOM_SPEED,
    });
  }, [props.zoomConstraints?.min, props.zoomConstraints?.max, props.zoomConstraints?.speed]);

  const scale = panzoom.current?.getScale() ?? 1;

  return (
    <svg onWheel={onWheelContainer} className={props.className} style={props.style}>
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
          fill={props.grid === false ? "transparent" : "url(#grid)"}
          x="-500"
          y="-500"
          width="1000"
          height="1000"
          onMouseDown={onMouseDownBackground}
          onClick={props.onClickBackground}
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
            <g key={e.id} data-id={e.id} className="panzoom-exclude" onClick={onClickEdge}>
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
              onMouseDown={onMouseDownNode}
              onClick={onClickNode}
              transform={transform}
              className="panzoom-exclude"
            >
              {renderNode(n)}
            </g>
          );
        })}
        {props.children}
      </g>
    </svg>
  );
}
