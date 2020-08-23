import * as React from "react";
import Panzoom, { PanzoomObject } from "@panzoom/panzoom";
import type { Node, Edge, Position } from "./types";
import { assertNonNull, assertEqual, keyBy } from "./lang";
import { useDocumentEvent } from "./hooks";

interface PanzoomEvent {
  detail: {
    x: number;
    y: number;
    scale: number;
  };
}

export interface Grid {
  dotSize?: number;
  spacing?: number;
  fill?: string;
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
  grid?: Partial<Grid> | boolean;

  renderNode: (node: N) => React.ReactNode;
  renderEdge: (edge: E, source: N, target: N) => React.ReactNode;
  renderIncompleteEdge?: (source: N, target: Position) => React.ReactNode;

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

  onClickNode?: (e: React.MouseEvent, node: N, position: Position) => void;
  onClickEdge?: (e: React.MouseEvent, edge: E, source: N, target: N, position: Position) => void;
  onClickBackground?: (e: React.MouseEvent, position: Position) => void;

  shouldStartNodeDrag?: (e: MouseEvent, node: N) => boolean;
  onNodeDragEnd?: (e: MouseEvent, node: N, position: Position) => void;

  shouldStartCreateEdge?: (e: React.MouseEvent, source: N) => boolean;
  onCreateEdgeEnd?: (e: React.MouseEvent, source: N, target: N) => void;

  className?: string;
  style?: React.SVGAttributes<SVGSVGElement>["style"];
}

export function pathD(source: Position, target: Position) {
  return `M${source.x},${source.y}L${target.x},${target.y}`;
}

export const DEFAULT_MIN_ZOOM = 0.25;
export const DEFAULT_MAX_ZOOM = 2;
export const DEFAULT_ZOOM_SPEED = 0.15;
export const DEFAULT_GRID_DOT_SIZE = 2;
export const DEFAULT_GRID_SPACING = 50;
export const DEFAULT_GRID_FILL = "#dddddd";

interface ScreenPosition {
  screenX: number;
  screenY: number;
}

interface NodeDragState {
  id: string;
  dragging: boolean;
  start: ScreenPosition;
  last: ScreenPosition;
}

interface PanState {
  panning: boolean;
  start: ScreenPosition;
  last: ScreenPosition;
}

interface EdgeCreateState<N extends Node> {
  source: N;
  start: ScreenPosition;
  last: ScreenPosition;
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

  const [incompleteEdge, setIncompleteEdge] = React.useState<EdgeCreateState<N> | undefined>();

  // This must be null, not undefined, to appease the typechecker/React.
  const rootRef = React.useRef<SVGSVGElement | null>(null);
  const backgroundRef = React.useRef<SVGRectElement | null>(null);

  // Note that zooming and panning are handled separately. This is because, while we want to zoom
  // with all the normal interactions always (scroll, pinch), we only want to pan when interacting
  // with the background. This means we can't attach panzoom to a single element and be done with
  // it. Furthermore, we want to have a single instance, because panning and zooming is stateful
  // and we want to have a single source of truth. Therefore, we pick the element that should
  // undergo the view transforms to host panzoom, and we forward pan events to it manually.
  const transformRef = React.useRef<PanzoomObject | undefined>();
  const panRef = React.useRef<PanState | undefined>();
  const shouldSkipNextNodeClick = React.useRef<string | undefined>();
  const shouldSkipNextBackgroundClick = React.useRef(false);

  const {
    onClickBackground,
    onClickNode,
    onClickEdge,
    shouldStartNodeDrag,
    onNodeDragEnd,
    shouldStartCreateEdge,
    onCreateEdgeEnd,
    shouldStartPan,
  } = props;
  const gridDotSize =
    (typeof props.grid !== "boolean" ? props.grid?.dotSize : undefined) ?? DEFAULT_GRID_DOT_SIZE;
  const gridSpacing =
    (typeof props.grid !== "boolean" ? props.grid?.spacing : undefined) ?? DEFAULT_GRID_SPACING;
  const gridFill =
    (typeof props.grid !== "boolean" ? props.grid?.fill : undefined) ?? DEFAULT_GRID_FILL;

  const [dragState, setDragState] = React.useState<NodeDragState | undefined>();

  React.useEffect(() => {
    const { current: root } = rootRef;
    assertNonNull(root);
    const { current: transform } = transformRef;
    assertNonNull(transform);
    const rect = root.getBoundingClientRect();
    // TODO: Does this need to divide by scale, like other transformations?
    transform.pan(rect.width / 2, rect.height / 2, { force: true });
  }, []);

  const toWorldSpacePosition = React.useCallback((e: React.MouseEvent | MouseEvent): Position => {
    const { current: root } = rootRef;
    assertNonNull(root);
    const { current: transform } = transformRef;
    assertNonNull(transform);

    const scale = transform.getScale();
    const { x, y } = transform.getPan();
    const rect = root.getBoundingClientRect();

    return {
      x: (e.clientX - rect.left - root.clientLeft) / scale - x,
      y: (e.clientY - rect.top - root.clientTop) / scale - y,
    };
  }, []);

  const onMouseDownBackground = React.useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      const { screenX, screenY } = e;
      panRef.current = {
        panning: shouldStartPan?.(e) ?? false,
        start: { screenX, screenY },
        last: { screenX, screenY },
      };
    },
    [shouldStartPan],
  );

  const onClickBackgroundWrapper = React.useCallback(
    (e: React.MouseEvent) => {
      console.log("get", shouldSkipNextBackgroundClick.current);
      if (shouldSkipNextBackgroundClick.current) {
        shouldSkipNextBackgroundClick.current = false;
      } else if (onClickBackground) {
        onClickBackground(e, toWorldSpacePosition(e));
      }
    },
    [onClickBackground, toWorldSpacePosition],
  );

  const onMouseDownNode = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      const { id } = e.currentTarget.dataset;
      assertNonNull(id);
      const node = nodesById[id];
      const { screenX, screenY } = e;
      if (shouldStartCreateEdge?.(e, node)) {
        setIncompleteEdge({
          source: node,
          start: { screenX, screenY },
          last: { screenX, screenY },
        });
      } else {
        setDragState({
          id,
          dragging: shouldStartNodeDrag?.(e.nativeEvent, node) ?? false,
          start: { screenX, screenY },
          last: { screenX, screenY },
        });
      }
    },
    [shouldStartCreateEdge, shouldStartNodeDrag, nodesById],
  );

  const onMouseUpNode = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (incompleteEdge && onCreateEdgeEnd) {
        const { id } = e.currentTarget.dataset;
        assertNonNull(id);
        const node = nodesById[id];
        onCreateEdgeEnd(e, incompleteEdge.source, node);
      }
    },
    [onCreateEdgeEnd, incompleteEdge, nodesById],
  );

  const onClickNodeWrapper = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      const { id } = e.currentTarget.dataset;
      assertNonNull(id);
      if (shouldSkipNextNodeClick.current != null) {
        assertEqual(shouldSkipNextNodeClick.current, id);
        shouldSkipNextNodeClick.current = undefined;
      } else if (onClickNode) {
        const node = nodesById[id];
        onClickNode(e, node, toWorldSpacePosition(e));
      }
    },
    [onClickNode, nodesById, toWorldSpacePosition],
  );

  const onClickEdgeWrapper = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (onClickEdge) {
        const { id } = e.currentTarget.dataset;
        assertNonNull(id);
        const edge = edgesById[id];
        onClickEdge(
          e,
          edge,
          nodesById[edge.sourceId],
          nodesById[edge.targetId],
          toWorldSpacePosition(e),
        );
      }
    },
    [onClickEdge, nodesById, edgesById, toWorldSpacePosition],
  );

  const onWheelContainer = React.useCallback((e: React.WheelEvent) => {
    transformRef.current?.zoomWithWheel(e.nativeEvent);
  }, []);

  const onMouseMoveDocument = React.useCallback(
    (e: MouseEvent) => {
      const { screenX, screenY } = e;
      const scale = transformRef.current?.getScale() ?? 1;

      if (dragState) {
        setDragState({
          ...dragState,
          last: { screenX, screenY },
        });
      }

      setIncompleteEdge((edge) => (edge ? { ...edge, last: { screenX, screenY } } : undefined));

      const { current: pan } = panRef;
      if (pan) {
        transformRef.current?.pan(
          (screenX - pan.last.screenX) / scale,
          (screenY - pan.last.screenY) / scale,
          { relative: true, force: true },
        );
        panRef.current = {
          ...pan,
          last: { screenX, screenY },
        };
      }
    },
    [dragState],
  );

  useDocumentEvent("mousemove", onMouseMoveDocument);

  const onMouseUpDocument = React.useCallback(
    (e: MouseEvent) => {
      if (dragState) {
        const { screenX, screenY } = e;
        if (dragState.start.screenX - screenX !== 0 || dragState.start.screenY - screenY !== 0) {
          shouldSkipNextNodeClick.current = dragState.id;
          if (onNodeDragEnd) {
            const node = nodesById[dragState.id];
            const scale = transformRef.current?.getScale() ?? 1;
            onNodeDragEnd(e, node, {
              x: (screenX - dragState.start.screenX) / scale + node.x,
              y: (screenY - dragState.start.screenY) / scale + node.y,
            });
          }
        }
        setDragState(undefined);
      }

      const { current: pan } = panRef;
      if (pan) {
        if (pan.start.screenX - screenX === 0 && pan.start.screenY - screenY === 0) {
          shouldSkipNextBackgroundClick.current = true;
        }
        panRef.current = undefined;
      }
      console.log("set", shouldSkipNextBackgroundClick.current);

      setIncompleteEdge(undefined);
    },
    [dragState, nodesById, onNodeDragEnd],
  );

  useDocumentEvent("mouseup", onMouseUpDocument);

  // This MUST have a stable identity, otherwise it gets called on every render; I guess because
  // React wants to make sure that as the function identity changes it's always been called?
  const { current: initializeTransform } = React.useRef((e: SVGGElement | null) => {
    if (e) {
      transformRef.current = Panzoom(e, {
        disablePan: true,
        cursor: "default",
        // TODO: Are these values captured once, or do we capture a live reference to props?
        minScale: props.zoomConstraints?.min ?? DEFAULT_MIN_ZOOM,
        maxScale: props.zoomConstraints?.max ?? DEFAULT_MAX_ZOOM,
        step: props.zoomConstraints?.speed ?? DEFAULT_ZOOM_SPEED,
      });

      // TODO: How do we remove this listener when this ref is unmounted?
      // TODO: Slight bug here: if the background is remounted but no pan is performed afterwards,
      // it'll be misaligned. We need to do this on background mount too.
      e.addEventListener("panzoompan", (poorlyTypedEvent: unknown) => {
        const {
          detail: { x, y },
        } = poorlyTypedEvent as PanzoomEvent;
        // TODO: This is a cute trick to have an infinite background. We should also resize the
        // background to make sure it's always larger than the SVG's bounding box by a reasonable.
        // TODO: Pull this out into an InfiniteTiled component or something.
        // TODO: -250 was chosen arbitrarily to fit the background; it should probably be a function
        // of the size of the SVG.
        if (backgroundRef.current) {
          backgroundRef.current.style["transform"] = `translate(${-x - 250 + (x % gridSpacing)}px,${
            -y - 250 + (y % gridSpacing)
          }px)`;
        }
      });
    } else {
      transformRef.current = undefined;
    }
  });

  React.useEffect(() => {
    // TODO: Does this snap back to the constrained settings if the range is reduced below current?
    transformRef.current?.setOptions({
      minScale: props.zoomConstraints?.min ?? DEFAULT_MIN_ZOOM,
      maxScale: props.zoomConstraints?.max ?? DEFAULT_MAX_ZOOM,
      step: props.zoomConstraints?.speed ?? DEFAULT_ZOOM_SPEED,
    });
  }, [props.zoomConstraints?.min, props.zoomConstraints?.max, props.zoomConstraints?.speed]);

  const scale = transformRef.current?.getScale() ?? 1;

  return (
    <svg onWheel={onWheelContainer} className={props.className} style={props.style} ref={rootRef}>
      <defs>
        <pattern id="grid" width={gridSpacing} height={gridSpacing} patternUnits="userSpaceOnUse">
          <circle
            cx={gridSpacing / 2}
            cy={gridSpacing / 2}
            r={gridDotSize}
            fill={gridFill}
          ></circle>
        </pattern>
      </defs>
      <g ref={initializeTransform}>
        <rect
          ref={backgroundRef}
          className="panzoom-exclude"
          fill={props.grid === false ? "transparent" : "url(#grid)"}
          width="1000"
          height="1000"
          onMouseDown={onMouseDownBackground}
          onClick={onClickBackgroundWrapper}
        />
        {props.edges.map((e) => {
          let source = nodesById[e.sourceId];
          let target = nodesById[e.targetId];

          if (source == null || target == null) {
            // TODO: We should warn about this, but probably not explode?
            return;
          }

          // TODO: Can this use translation or something less heavyweight like the node renderer?
          if (dragState) {
            if (dragState.id === source.id) {
              source = {
                ...source,
                x: (dragState.last.screenX - dragState.start.screenX) / scale + source.x,
                y: (dragState.last.screenY - dragState.start.screenY) / scale + source.y,
              };
            }
            if (dragState.id === target.id) {
              target = {
                ...target,
                x: (dragState.last.screenX - dragState.start.screenX) / scale + target.x,
                y: (dragState.last.screenY - dragState.start.screenY) / scale + target.y,
              };
            }
          }

          return (
            <g key={e.id} data-id={e.id} className="panzoom-exclude" onClick={onClickEdgeWrapper}>
              {props.renderEdge(e, source, target)}
            </g>
          );
        })}
        {incompleteEdge && props.renderIncompleteEdge && (
          <g className="panzoom-exclude">
            {props.renderIncompleteEdge(incompleteEdge.source, {
              x:
                (incompleteEdge.last.screenX - incompleteEdge.start.screenX) / scale +
                incompleteEdge.source.x,
              y:
                (incompleteEdge.last.screenY - incompleteEdge.start.screenY) / scale +
                incompleteEdge.source.y,
            })}
          </g>
        )}
        {props.nodes.map((n) => {
          const transform =
            dragState?.id === n.id
              ? `translate(${(dragState.last.screenX - dragState.start.screenX) / scale}, ${
                  (dragState.last.screenY - dragState.start.screenY) / scale
                })`
              : undefined;
          return (
            <g
              key={n.id}
              data-id={n.id}
              onMouseDown={onMouseDownNode}
              onMouseUp={onMouseUpNode}
              onClick={onClickNodeWrapper}
              transform={transform}
              className="panzoom-exclude"
            >
              {props.renderNode(n)}
            </g>
          );
        })}
        {props.children}
      </g>
    </svg>
  );
}
