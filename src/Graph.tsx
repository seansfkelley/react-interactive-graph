import * as React from "react";
import Panzoom, { PanzoomObject } from "@panzoom/panzoom";
import type {
  Node,
  Edge,
  Position,
  NodeComponentProps,
  EdgeComponentProps,
  IncompleteEdgeComponentProps,
  NodeEventDetails,
  EdgeEventDetails,
  CreateEdgeEventDetails,
} from "./types";
import { assertNonNull, assertEqual, objectEntries } from "./lang";
import { useDocumentEvent, useThrottledState } from "./hooks";

interface PanzoomEvent {
  detail: {
    x: number;
    y: number;
    scale: number;
  };
}

class Bounds {
  constructor(
    private minX: number,
    private maxX: number,
    private minY: number,
    private maxY: number,
  ) {}

  containsNode(n: Node) {
    const { x, y, width, height } = n;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    return this._overlaps(x - halfWidth, x + halfWidth, y - halfHeight, y + halfHeight);
  }

  containsEdge(n1: Node, n2: Node) {
    const { x: n1X, y: n1Y } = n1;
    const { x: n2X, y: n2Y } = n2;
    return this._overlaps(
      Math.min(n1X, n2X),
      Math.max(n1X, n2X),
      Math.min(n1Y, n2Y),
      Math.max(n1Y, n2Y),
    );
  }

  private _overlaps(minX: number, maxX: number, minY: number, maxY: number) {
    return maxX > this.minX && minX < this.maxX && maxY > this.minY && minY < this.maxY;
  }
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

export interface Props<N extends Node = Node, E extends Edge = Edge, X extends object = {}> {
  nodes: Record<string, N>;
  edges: Record<string, E>;
  grid?: Partial<Grid> | boolean;

  nodeComponent: React.ComponentType<NodeComponentProps<N> & X>;
  edgeComponent: React.ComponentType<EdgeComponentProps<N, E> & X>;
  incompleteEdgeComponent?: React.ComponentType<IncompleteEdgeComponentProps<N> & X>;
  extraProps?: X;

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

  onClickNode?: (e: React.MouseEvent, details: NodeEventDetails<N>) => void;
  onClickEdge?: (e: React.MouseEvent, details: EdgeEventDetails<N, E>) => void;
  onClickBackground?: (e: React.MouseEvent, position: Position) => void;

  shouldStartNodeDrag?: (e: MouseEvent, details: NodeEventDetails<N>) => boolean;
  onNodeDragEnd?: (e: MouseEvent, details: NodeEventDetails<N>) => void;

  shouldStartCreateEdge?: (e: React.MouseEvent, details: NodeEventDetails<N>) => boolean;
  onCreateEdgeEnd?: (e: React.MouseEvent, details: CreateEdgeEventDetails<N>) => void;

  className?: string;
  style?: React.SVGAttributes<SVGSVGElement>["style"];
  clickFudgeFactor?: number;
}

export const DEFAULT_MIN_ZOOM = 0.25;
export const DEFAULT_MAX_ZOOM = 2;
export const DEFAULT_ZOOM_SPEED = 0.15;
export const DEFAULT_GRID_DOT_SIZE = 2;
export const DEFAULT_GRID_SPACING = 50;
export const DEFAULT_GRID_FILL = "#dddddd";
export const DEFAULT_CLICK_FUDGE_FACTOR = 2;

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

interface EdgeCreateState {
  sourceId: string;
  targetId?: string;
  start: ScreenPosition;
  last: ScreenPosition;
  didLeaveOriginalNode: boolean;
}

export function Graph<N extends Node = Node, E extends Edge = Edge, X extends object = {}>(
  props: React.PropsWithChildren<Props<N, E, X>>,
) {
  const { nodes, edges } = props;
  const [incompleteEdge, setIncompleteEdge] = React.useState<EdgeCreateState | undefined>();

  const [worldSpaceBounds, setWorldSpaceBounds] = useThrottledState<Bounds>(
    new Bounds(-Infinity, Infinity, -Infinity, Infinity),
  );

  // This must be null, not undefined, to appease the typechecker/React.
  const rootRef = React.useRef<SVGSVGElement | null>(null);
  const backgroundRef = React.useRef<SVGRectElement | null>(null);

  // Note that zooming and panning are handled separately. This is because -- while we want to zoom
  // with all the normal interactions always (scroll, pinch) on the pan/zoom transform container
  // that holds all graph entities -- we only want to pan when interacting with the background. This
  // means we can't attach panzoom to a single element and be done with it. Furthermore, we want to
  // have a single instance, because panning and zooming is stateful and we want to have a single
  // source of truth. Lastly, zooming is mathier and I don't want to have to deal with the pinch
  // interaction. Therefore, we pick the element that should undergo the view transforms to host
  // panzoom and keep the zoom interactions enabled, then forward pans to it manually.
  const transformRef = React.useRef<PanzoomObject | undefined>();
  const panStateRef = React.useRef<PanState | undefined>();

  // These two refs are a bit of a hack, but they seem stable enough. The idea is that both node
  // dragging and background panning have the same problem: we want to support mouseup-mousedown to
  // implement them and _also_ clicks, but we only want to fire one for any given pair. This
  // solution is multifaceted:
  //
  //  - We rely on the native "onclick" event, rather than synthesizing our own from mouseup. This
  //    should generally be safer, but we have to make sure to swallow it if we did drag or pan.
  //  - The API shape means we don't have to commit up-front to whether a given motion is a drag or
  //    pan. There are only "should start" and "finished", with no "did start" and "did move".
  //    "Should" does not necessitate "did", so even if the consumer tells us that yes, this event
  //    can start a drag/pan, we can still wait for a mouse move/up to decide which one to do.
  //  - Fudge factor. Sometimes we _do_ trigger a drag/pan and a click off the same motion. This is
  //    what clickFudgeFactor is for, but the idea is that the number is so small that a user might
  //    not even notice that they technically dragged one pixel, so it shouldn't cause weird UX to
  //    trigger a click after a tiny drag/pan.
  //
  // So, to put that all together: we _always_ capture the start position for a drag/pan, but also
  // keep track of whether it should actually drag or pan. When we get a document mouseup, we
  // inspect the start position to know if we should fire a click too. Then we set these refs to
  // communicate to the click handler whether it should swallow or not. The HTML spec guarantees
  // that a mouseup finishes getting handled before the corresponding click is started.
  //
  // Lastly, we use the ID rather than a boolean for the node variant simply for sanity-checking. It
  // could be relaxed if necessary, but it seemed nice and free to backstop against and really weird
  // race conditions that might arise from this state management.
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
  const clickFudgeFactor = props.clickFudgeFactor ?? DEFAULT_CLICK_FUDGE_FACTOR;

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

  const toWorldSpacePosition = React.useCallback(
    (e: { clientX: number; clientY: number }): Position => {
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
    },
    [],
  );

  const isWithinFudgeFactor = React.useCallback(
    (e: MouseEvent | React.MouseEvent, start: ScreenPosition) => {
      return (
        Math.abs(e.screenX - start.screenX) <= clickFudgeFactor &&
        Math.abs(e.screenY - start.screenY) <= clickFudgeFactor
      );
    },
    [clickFudgeFactor],
  );

  const onMouseDownBackground = React.useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      const { screenX, screenY } = e;
      panStateRef.current = {
        panning: shouldStartPan?.(e) ?? false,
        start: { screenX, screenY },
        last: { screenX, screenY },
      };
    },
    [shouldStartPan],
  );

  const onClickBackgroundWrapper = React.useCallback(
    (e: React.MouseEvent) => {
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
      const node = nodes[id];
      const { screenX, screenY } = e;
      const details: NodeEventDetails<N> = { node, id, position: toWorldSpacePosition(e) };
      if (shouldStartCreateEdge?.(e, details)) {
        setIncompleteEdge({
          sourceId: id,
          // Note that we don't set target here; if you want to create a self-edge you have to leave
          // and come back. This is... fine. If this behavior ever changes, make sure to change the
          // semantics of didLeaveOriginalNode as well. That value is used to differentiate between
          // self-edge creations and clicks without moving, and if you can self-edge create without
          // moving, it'll have to change to compensate.
          start: { screenX, screenY },
          last: { screenX, screenY },
          didLeaveOriginalNode: false,
        });
      } else {
        setDragState({
          id,
          dragging: shouldStartNodeDrag?.(e.nativeEvent, details) ?? false,
          start: { screenX, screenY },
          last: { screenX, screenY },
        });
      }
    },
    [shouldStartCreateEdge, shouldStartNodeDrag, toWorldSpacePosition, nodes],
  );

  const onMouseUpNode = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (incompleteEdge) {
        const { id } = e.currentTarget.dataset;
        assertNonNull(id);
        if (!isWithinFudgeFactor(e, incompleteEdge.start) || incompleteEdge.didLeaveOriginalNode) {
          shouldSkipNextNodeClick.current = id;
          if (onCreateEdgeEnd) {
            onCreateEdgeEnd(e, {
              source: nodes[incompleteEdge.sourceId],
              sourceId: incompleteEdge.sourceId,
              target: nodes[id],
              targetId: id,
            });
          }
        }
        setIncompleteEdge(undefined);
      }
    },
    [onCreateEdgeEnd, incompleteEdge, nodes, isWithinFudgeFactor],
  );

  const onMouseEnterNode = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      const { id } = e.currentTarget.dataset;
      assertNonNull(id);
      setIncompleteEdge((edge) => {
        if (edge) {
          return {
            ...edge,
            target: nodes[id],
          };
        } else {
          return undefined;
        }
      });
    },
    [nodes],
  );

  const onMouseLeaveNode = React.useCallback(() => {
    setIncompleteEdge((edge) => {
      // Check to see if we need to actually shallowly mutate and rerender first...
      if (edge && (edge?.targetId != null || edge?.didLeaveOriginalNode !== true)) {
        // We don't know if the node that's being left is the original node, but you can't
        // enter another node without first leaving this one, so it's safe to set.
        return { ...edge, targetId: undefined, didLeaveOriginalNode: true };
      } else {
        return edge;
      }
    });
  }, []);

  const onClickNodeWrapper = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      const { id } = e.currentTarget.dataset;
      assertNonNull(id);
      if (shouldSkipNextNodeClick.current != null) {
        assertEqual(shouldSkipNextNodeClick.current, id);
        shouldSkipNextNodeClick.current = undefined;
      } else if (onClickNode) {
        const node = nodes[id];
        onClickNode(e, { node, id, position: toWorldSpacePosition(e) });
      }
    },
    [onClickNode, nodes, toWorldSpacePosition],
  );

  const onClickEdgeWrapper = React.useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (onClickEdge) {
        const { id } = e.currentTarget.dataset;
        assertNonNull(id);
        const edge = edges[id];
        onClickEdge(e, {
          edge,
          id,
          source: nodes[edge.sourceId],
          target: nodes[edge.targetId],
          position: toWorldSpacePosition(e),
        });
      }
    },
    [onClickEdge, nodes, edges, toWorldSpacePosition],
  );

  const onWheelContainer = React.useCallback((e: React.WheelEvent) => {
    // Wheel zooms are not bound by default, so forward them here.
    transformRef.current?.zoomWithWheel(e.nativeEvent);
  }, []);

  const onMouseMoveDocument = React.useCallback(
    (e: MouseEvent) => {
      const { screenX, screenY } = e;
      const scale = transformRef.current?.getScale() ?? 1;

      if (dragState?.dragging) {
        setDragState({
          ...dragState,
          last: { screenX, screenY },
        });
      }

      setIncompleteEdge((edge) => (edge ? { ...edge, last: { screenX, screenY } } : undefined));

      const { current: panState } = panStateRef;
      if (panState?.panning) {
        transformRef.current?.pan(
          (screenX - panState.last.screenX) / scale,
          (screenY - panState.last.screenY) / scale,
          { relative: true, force: true },
        );
        panStateRef.current = {
          ...panState,
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
        if (!isWithinFudgeFactor(e, dragState.start)) {
          shouldSkipNextNodeClick.current = dragState.id;
          if (onNodeDragEnd) {
            const node = nodes[dragState.id];
            const scale = transformRef.current?.getScale() ?? 1;
            onNodeDragEnd(e, {
              node,
              id: dragState.id,
              position: {
                x: (e.screenX - dragState.start.screenX) / scale + node.x,
                y: (e.screenY - dragState.start.screenY) / scale + node.y,
              },
            });
          }
        }
        setDragState(undefined);
      }

      const { current: panState } = panStateRef;
      if (panState) {
        shouldSkipNextBackgroundClick.current = !isWithinFudgeFactor(e, panState.start);
        panStateRef.current = undefined;
      }

      // If we didn't release on a node, stop creation anyway.
      setIncompleteEdge(undefined);
    },
    [dragState, nodes, onNodeDragEnd, isWithinFudgeFactor],
  );

  useDocumentEvent("mouseup", onMouseUpDocument);

  // This MUST have a stable identity, otherwise it gets called on every render; I guess because
  // React wants to make sure that as the function identity changes it's always been called?
  const { current: initializeTransform } = React.useRef((e: SVGGElement | null) => {
    if (e) {
      transformRef.current = Panzoom(e, {
        // Per the comment on this ref, we forward panning commands manually. This is also why
        // you'll see force: true set on those pan commands.
        disablePan: true,
        cursor: "default",
        // TODO: Are these values captured once, or do we capture a live reference to props?
        minScale: props.zoomConstraints?.min ?? DEFAULT_MIN_ZOOM,
        maxScale: props.zoomConstraints?.max ?? DEFAULT_MAX_ZOOM,
        step: props.zoomConstraints?.speed ?? DEFAULT_ZOOM_SPEED,
      });

      // TODO: Slight bug here: if the background is remounted but no pan is performed afterwards,
      // it'll be misaligned. We need to do this on background mount too.
      e.addEventListener("panzoomchange", (poorlyTypedEvent: unknown) => {
        const {
          detail: { x, y },
        } = poorlyTypedEvent as PanzoomEvent;
        // TODO: Pull this out into an InfiniteTiled component or something.
        if (backgroundRef.current) {
          backgroundRef.current.style["transform"] = `translate(${
            -x - gridSpacing / 2 + (x % gridSpacing)
          }px,${-y - gridSpacing / 2 + (y % gridSpacing)}px)`;
        }

        if (rootRef.current) {
          const rect = rootRef.current.getBoundingClientRect();
          const { x: minX, y: minY } = toWorldSpacePosition({
            clientX: rect.left,
            clientY: rect.top,
          });
          const { x: maxX, y: maxY } = toWorldSpacePosition({
            clientX: rect.right,
            clientY: rect.bottom,
          });
          setWorldSpaceBounds(new Bounds(minX, maxX, minY, maxY));
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
          // TODO: This height thing works, but it's also overkill, cause when you zoom it it gets HUGE.
          width={`${props.zoomConstraints?.max ?? DEFAULT_MAX_ZOOM * 100 * 2}%`}
          height={`${props.zoomConstraints?.max ?? DEFAULT_MAX_ZOOM * 100 * 2}%`}
          onMouseDown={onMouseDownBackground}
          onClick={onClickBackgroundWrapper}
        />
        {objectEntries(edges).map(([id, e]) => {
          let source = nodes[e.sourceId];
          let target = nodes[e.targetId];

          if (source == null || target == null) {
            // TODO: We should warn about this, but probably not explode?
            return;
          }

          // TODO: Can this use translation or something less heavyweight?
          if (dragState) {
            if (dragState.id === e.sourceId) {
              source = {
                ...source,
                x: (dragState.last.screenX - dragState.start.screenX) / scale + source.x,
                y: (dragState.last.screenY - dragState.start.screenY) / scale + source.y,
              };
            }
            if (dragState.id === e.targetId) {
              target = {
                ...target,
                x: (dragState.last.screenX - dragState.start.screenX) / scale + target.x,
                y: (dragState.last.screenY - dragState.start.screenY) / scale + target.y,
              };
            }
          }

          if (worldSpaceBounds.containsEdge(source, target)) {
            return (
              <g key={id} data-id={id} className="panzoom-exclude" onClick={onClickEdgeWrapper}>
                <props.edgeComponent
                  edge={e}
                  edgeId={id}
                  source={source}
                  target={target}
                  {...(props.extraProps as any)}
                />
              </g>
            );
          } else {
            return null;
          }
        })}
        {incompleteEdge && props.incompleteEdgeComponent && (
          <g className="panzoom-exclude">
            <props.incompleteEdgeComponent
              source={nodes[incompleteEdge.sourceId]}
              sourceId={incompleteEdge.sourceId}
              position={{
                x:
                  (incompleteEdge.last.screenX - incompleteEdge.start.screenX) / scale +
                  nodes[incompleteEdge.sourceId].x,
                y:
                  (incompleteEdge.last.screenY - incompleteEdge.start.screenY) / scale +
                  nodes[incompleteEdge.sourceId].y,
              }}
              target={incompleteEdge.targetId ? nodes[incompleteEdge.targetId] : undefined}
              targetId={incompleteEdge.targetId}
              {...(props.extraProps as any)}
            />
          </g>
        )}
        {objectEntries(nodes).map(([id, n]) => {
          const transformedNode =
            dragState?.id === id
              ? {
                  ...n,
                  x: (dragState.last.screenX - dragState.start.screenX) / scale + n.x,
                  y: (dragState.last.screenY - dragState.start.screenY) / scale + n.y,
                }
              : n;

          if (worldSpaceBounds.containsNode(n)) {
            return (
              <g
                key={id}
                data-id={id}
                onMouseDown={onMouseDownNode}
                onMouseUp={onMouseUpNode}
                onMouseEnter={onMouseEnterNode}
                onMouseLeave={onMouseLeaveNode}
                onClick={onClickNodeWrapper}
                className="panzoom-exclude"
              >
                <props.nodeComponent
                  node={transformedNode}
                  nodeId={id}
                  {...(props.extraProps as any)}
                />
              </g>
            );
          } else {
            return null;
          }
        })}
        {props.children}
      </g>
    </svg>
  );
}
