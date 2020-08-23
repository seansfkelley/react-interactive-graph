import * as React from "react";
import Panzoom, { PanzoomObject } from "@panzoom/panzoom";
import type { Node, Edge, Position } from "./types";
import { assertNonNull, keyBy } from "./lang";
import { useDocumentEvent } from "./hooks";

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
  const gridDotSize = (typeof props.grid !== "boolean" ? props.grid?.dotSize : undefined) ?? 2;
  const gridSpacing = (typeof props.grid !== "boolean" ? props.grid?.spacing : undefined) ?? 50;
  const gridFill = (typeof props.grid !== "boolean" ? props.grid?.fill : undefined) ?? "lightgrey";

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

  const getLogicalPosition = React.useCallback((e: React.MouseEvent | MouseEvent): Position => {
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

  const onMouseDownBackground = React.useCallback((e: React.MouseEvent<SVGElement>) => {
    if (shouldStartPan(e)) {
      const { screenX, screenY } = e;
      panRef.current = {
        screenSpaceStartX: screenX,
        screenSpaceStartY: screenY,
        screenSpaceLastX: screenX,
        screenSpaceLastY: screenY,
      };
    }
  }, []);

  const onMouseUpBackground = React.useCallback((e: React.MouseEvent) => {
    if (props.onClickBackground) {
      // Note that this only works because this handler fires before the document handler, which
      // is the one that ends the panning.
      const { current: pan } = panRef;
      if (
        !pan ||
        (Math.abs(pan.screenSpaceStartX - e.screenX) <= 2 &&
          Math.abs(pan.screenSpaceStartY - e.screenY) <= 2)
      ) {
        props.onClickBackground(e, getLogicalPosition(e));
      }
    }
  }, []);

  const onMouseDownNode = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      const { id } = e.currentTarget.dataset;
      assertNonNull(id);
      const node = nodesById[id];
      const { screenX, screenY } = e;
      // TODO: This is a little odd to have a callback + check wrapped up in one method.
      if (props.onCreateEdgeStart?.(e, node)) {
        setIncompleteEdge({
          source: node,
          screenSpaceStartX: screenX,
          screenSpaceStartY: screenY,
          screenSpaceCurrentX: screenX,
          screenSpaceCurrentY: screenY,
        });
      } else if (nodeMouseState == null) {
        setNodeMouseState({
          nodeId: id,
          dragging: shouldStartNodeDrag(e.nativeEvent, node),
          screenSpaceStartX: screenX,
          screenSpaceStartY: screenY,
          screenSpaceCurrentX: screenX,
          screenSpaceCurrentY: screenY,
        });
      }
    },
    [shouldStartNodeDrag, props.onDragStartNode, nodesById, nodeMouseState],
  );

  const onMouseUpNode = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (incompleteEdge && props.onCreateEdge) {
        const { id } = e.currentTarget.dataset;
        assertNonNull(id);
        const node = nodesById[id];
        props.onCreateEdge(e, incompleteEdge.source, node);
      }
    },
    [props.onCreateEdge, incompleteEdge],
  );

  const onClickEdge = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (props.onClickEdge) {
        const { id } = e.currentTarget.dataset;
        assertNonNull(id);
        const edge = edgesById[id];
        props.onClickEdge(
          e,
          edge,
          nodesById[edge.sourceId],
          nodesById[edge.targetId],
          getLogicalPosition(e),
        );
      }
    },
    [props.onClickEdge, nodesById, edgesById],
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
        props.onDragMoveNode?.(
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
    [nodeMouseState, nodesById],
  );

  useDocumentEvent("mousemove", onMouseMoveDocument);

  const onMouseUpDocument = React.useCallback(
    (e: MouseEvent) => {
      if (nodeMouseState) {
        const node = nodesById[nodeMouseState.nodeId];
        const { screenX, screenY } = e;
        if (nodeMouseState.dragging) {
          const scale = transformRef.current?.getScale() ?? 1;
          props.onDragEndNode?.(
            e,
            node,
            (screenX - nodeMouseState.screenSpaceStartX) / scale + node.x,
            (screenY - nodeMouseState.screenSpaceStartY) / scale + node.y,
          );
        } else if (
          Math.abs(nodeMouseState.screenSpaceStartX - screenX) <= 2 &&
          Math.abs(nodeMouseState.screenSpaceStartY - screenY) <= 2
        ) {
          props.onClickNode?.(e, node, getLogicalPosition(e));
        }
        setNodeMouseState(undefined);
      }

      setIncompleteEdge(undefined);

      panRef.current = undefined;
    },
    [nodeMouseState, nodesById, props.onDragEndNode, props.onClickNode],
  );

  useDocumentEvent("mouseup", onMouseUpDocument);

  // This MUST have a stable identity, otherwise it gets called on every render; I guess because
  // React wants to make sure that as the function identity changes it's always been called?
  const { current: initializeTransformRef } = React.useRef((e: SVGGElement) => {
    transformRef.current = e
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
      <g ref={initializeTransformRef}>
        {/* TODO: Making a huge rect is kind of a cheat. Can we make it functionally infinite somehow? */}
        <rect
          className="panzoom-exclude"
          fill={props.grid === false ? "transparent" : "url(#grid)"}
          x="-500"
          y="-500"
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
            <g key={e.id} data-id={e.id} className="panzoom-exclude" onClick={onClickEdge}>
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
