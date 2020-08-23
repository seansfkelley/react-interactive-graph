import * as React from "react";
import Panzoom, { PanzoomObject } from "@panzoom/panzoom";
import type { Node, Edge, Position } from "./types";
import { assertNonNull, keyBy } from "./lang";
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

  onClickNode?: (e: MouseEvent, node: N, position: Position) => void;
  onClickEdge?: (e: React.MouseEvent, edge: E, source: N, target: N, position: Position) => void;
  onClickBackground?: (e: React.MouseEvent, position: Position) => void;

  shouldStartNodeDrag?: (e: MouseEvent, node: N) => boolean;
  onDragStartNode?: (e: MouseEvent, node: N) => void;
  onDragMoveNode?: (e: MouseEvent, node: N, x: number, y: number) => void;
  onDragEndNode?: (e: MouseEvent, node: N, x: number, y: number) => void;

  onCreateEdgeStart?: (e: React.MouseEvent, source: N) => boolean;
  onCreateEdge?: (e: React.MouseEvent, source: N, target: N) => void;

  className?: string;
  style?: React.SVGAttributes<SVGSVGElement>["style"];
}

export const defaultShouldStartPan: NonNullable<Props["shouldStartPan"]> = (e) => {
  return e.buttons === 1;
};

export const defaultShouldStartNodeDrag: NonNullable<Props["shouldStartNodeDrag"]> = (e) => {
  return e.buttons === 1 && e.shiftKey;
};

export function pathD(source: Position, target: Position) {
  return `M${source.x},${source.y}L${target.x},${target.y}`;
}

export const DEFAULT_MIN_ZOOM = 0.25;
export const DEFAULT_MAX_ZOOM = 2;
export const DEFAULT_ZOOM_SPEED = 0.15;
export const DEFAULT_GRID_DOT_SIZE = 2;
export const DEFAULT_GRID_SPACING = 50;
export const DEFAULT_GRID_FILL = "#dddddd";

interface NodeMouseState {
  nodeId: string;
  dragging: boolean;
  screenSpaceStartX: number;
  screenSpaceStartY: number;
  screenSpaceCurrentX: number;
  screenSpaceCurrentY: number;
}

interface PanState {
  screenSpaceStartX: number;
  screenSpaceStartY: number;
  screenSpaceLastX: number;
  screenSpaceLastY: number;
}

interface EdgeCreateState<N extends Node> {
  source: N;
  screenSpaceStartX: number;
  screenSpaceStartY: number;
  screenSpaceCurrentX: number;
  screenSpaceCurrentY: number;
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

  const shouldStartNodeDrag = props.shouldStartNodeDrag ?? defaultShouldStartNodeDrag;
  const shouldStartPan = props.shouldStartPan ?? defaultShouldStartPan;
  const {
    onClickBackground,
    onClickNode,
    onClickEdge,
    onDragStartNode,
    onDragMoveNode,
    onDragEndNode,
    onCreateEdgeStart,
    onCreateEdge,
  } = props;
  const gridDotSize =
    (typeof props.grid !== "boolean" ? props.grid?.dotSize : undefined) ?? DEFAULT_GRID_DOT_SIZE;
  const gridSpacing =
    (typeof props.grid !== "boolean" ? props.grid?.spacing : undefined) ?? DEFAULT_GRID_SPACING;
  const gridFill =
    (typeof props.grid !== "boolean" ? props.grid?.fill : undefined) ?? DEFAULT_GRID_FILL;

  const [nodeMouseState, setNodeMouseState] = React.useState<NodeMouseState | undefined>();

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
      if (shouldStartPan(e)) {
        const { screenX, screenY } = e;
        panRef.current = {
          screenSpaceStartX: screenX,
          screenSpaceStartY: screenY,
          screenSpaceLastX: screenX,
          screenSpaceLastY: screenY,
        };
      }
    },
    [shouldStartPan],
  );

  const onMouseUpBackground = React.useCallback(
    (e: React.MouseEvent) => {
      if (onClickBackground) {
        // Note that this only works because this handler fires before the document handler, which
        // is the one that ends the panning.
        const { current: pan } = panRef;
        if (
          !pan ||
          (Math.abs(pan.screenSpaceStartX - e.screenX) <= 2 &&
            Math.abs(pan.screenSpaceStartY - e.screenY) <= 2)
        ) {
          onClickBackground(e, toWorldSpacePosition(e));
        }
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
      // TODO: This is a little odd to have a callback + check wrapped up in one method.
      if (onCreateEdgeStart?.(e, node)) {
        setIncompleteEdge({
          source: node,
          screenSpaceStartX: screenX,
          screenSpaceStartY: screenY,
          screenSpaceCurrentX: screenX,
          screenSpaceCurrentY: screenY,
        });
      } else if (nodeMouseState == null) {
        const dragging = shouldStartNodeDrag(e.nativeEvent, node);

        setNodeMouseState({
          nodeId: id,
          dragging,
          screenSpaceStartX: screenX,
          screenSpaceStartY: screenY,
          screenSpaceCurrentX: screenX,
          screenSpaceCurrentY: screenY,
        });
        if (dragging) {
          onDragStartNode?.(e.nativeEvent, node);
        }
      }
    },
    [onCreateEdgeStart, shouldStartNodeDrag, onDragStartNode, nodesById, nodeMouseState],
  );

  const onMouseUpNode = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (incompleteEdge && onCreateEdge) {
        const { id } = e.currentTarget.dataset;
        assertNonNull(id);
        const node = nodesById[id];
        onCreateEdge(e, incompleteEdge.source, node);
      }
    },
    [onCreateEdge, incompleteEdge, nodesById],
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

      if (nodeMouseState?.dragging) {
        const node = nodesById[nodeMouseState.nodeId];
        onDragMoveNode?.(
          e,
          node,
          (screenX - nodeMouseState.screenSpaceStartX) / scale + node.x,
          (screenY - nodeMouseState.screenSpaceStartY) / scale + node.y,
        );
        setNodeMouseState({
          ...nodeMouseState,
          screenSpaceCurrentX: screenX,
          screenSpaceCurrentY: screenY,
        });
      }

      setIncompleteEdge((edge) =>
        edge
          ? {
              ...edge,
              screenSpaceCurrentX: screenX,
              screenSpaceCurrentY: screenY,
            }
          : undefined,
      );

      const { current: pan } = panRef;
      if (pan) {
        transformRef.current?.pan(
          (screenX - pan.screenSpaceLastX) / scale,
          (screenY - pan.screenSpaceLastY) / scale,
          { relative: true, force: true },
        );
        panRef.current = {
          ...pan,
          screenSpaceLastX: screenX,
          screenSpaceLastY: screenY,
        };
      }
    },
    [onDragMoveNode, nodeMouseState, nodesById],
  );

  useDocumentEvent("mousemove", onMouseMoveDocument);

  const onMouseUpDocument = React.useCallback(
    (e: MouseEvent) => {
      if (nodeMouseState) {
        const node = nodesById[nodeMouseState.nodeId];
        const { screenX, screenY } = e;
        if (nodeMouseState.dragging) {
          const scale = transformRef.current?.getScale() ?? 1;
          onDragEndNode?.(
            e,
            node,
            (screenX - nodeMouseState.screenSpaceStartX) / scale + node.x,
            (screenY - nodeMouseState.screenSpaceStartY) / scale + node.y,
          );
        } else if (
          Math.abs(nodeMouseState.screenSpaceStartX - screenX) <= 2 &&
          Math.abs(nodeMouseState.screenSpaceStartY - screenY) <= 2
        ) {
          onClickNode?.(e, node, toWorldSpacePosition(e));
        }
        setNodeMouseState(undefined);
      }

      setIncompleteEdge(undefined);

      panRef.current = undefined;
    },
    [nodeMouseState, nodesById, onDragEndNode, onClickNode, toWorldSpacePosition],
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
          onMouseUp={onMouseUpBackground}
        />
        {props.edges.map((e) => {
          let source = nodesById[e.sourceId];
          let target = nodesById[e.targetId];

          if (source == null || target == null) {
            // TODO: We should warn about this, but probably not explode?
            return;
          }

          // TODO: Can this use translation or something less heavyweight like the node renderer?
          if (nodeMouseState) {
            if (nodeMouseState.nodeId === source.id) {
              source = {
                ...source,
                x:
                  (nodeMouseState.screenSpaceCurrentX - nodeMouseState.screenSpaceStartX) / scale +
                  source.x,
                y:
                  (nodeMouseState.screenSpaceCurrentY - nodeMouseState.screenSpaceStartY) / scale +
                  source.y,
              };
            }
            if (nodeMouseState.nodeId === target.id) {
              target = {
                ...target,
                x:
                  (nodeMouseState.screenSpaceCurrentX - nodeMouseState.screenSpaceStartX) / scale +
                  target.x,
                y:
                  (nodeMouseState.screenSpaceCurrentY - nodeMouseState.screenSpaceStartY) / scale +
                  target.y,
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
                (incompleteEdge.screenSpaceCurrentX - incompleteEdge.screenSpaceStartX) / scale +
                incompleteEdge.source.x,
              y:
                (incompleteEdge.screenSpaceCurrentY - incompleteEdge.screenSpaceStartY) / scale +
                incompleteEdge.source.y,
            })}
          </g>
        )}
        {props.nodes.map((n) => {
          const transform =
            nodeMouseState?.nodeId === n.id
              ? `translate(${
                  (nodeMouseState.screenSpaceCurrentX - nodeMouseState.screenSpaceStartX) / scale
                }, ${
                  (nodeMouseState.screenSpaceCurrentY - nodeMouseState.screenSpaceStartY) / scale
                })`
              : undefined;
          return (
            <g
              key={n.id}
              data-id={n.id}
              onMouseDown={onMouseDownNode}
              onMouseUp={onMouseUpNode}
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
