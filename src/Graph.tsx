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

export interface Props<N extends Node = Node, E extends Edge = Edge, X extends object = {}> {
  nodes: Record<string, N>;
  edges: Record<string, E>;
  grid?: Partial<Grid> | boolean;

  nodeComponent: React.ComponentType<NodeComponentProps<N> & X>;
  edgeComponent: React.ComponentType<EdgeComponentProps<N, E> & X>;
  incompleteEdgeComponent?: React.ComponentType<IncompleteEdgeComponentProps<N> & X>;
  extraProps?: X;

  // TODO: All of these.
  // pan?: Partial<Pan> | boolean;
  // onPan?: (pan: Pan) => void;
  // panConstraints?: Partial<PanConstraints>;
  // zoom?: number | boolean;
  // onZoom?: (zoom: number) => void;
  // zoomConstraints?: Partial<ZoomConstraints>;

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
  nodeId: string;
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

interface State {
  incompleteEdge?: EdgeCreateState;
  dragState?: NodeDragState;
}

export class Graph<
  N extends Node = Node,
  E extends Edge = Edge,
  X extends object = {}
> extends React.Component<Props<N, E, X>, State> {
  state: State = {};

  // TODO: Why doesn't the compiler respect this?
  static defaultProps = {
    clickFudgeFactor: 2,
  };

  private root = React.createRef<SVGSVGElement>();
  private background = React.createRef<SVGRectElement>();

  // Note that zooming and panning are handled separately. This is because -- while we want to zoom
  // with all the normal interactions always (scroll, pinch) on the pan/zoom transform container
  // that holds all graph entities -- we only want to pan when interacting with the background. This
  // means we can't attach panzoom to a single element and be done with it. Furthermore, we want to
  // have a single instance, because panning and zooming is stateful and we want to have a single
  // source of truth. Lastly, zooming is mathier and I don't want to have to deal with the pinch
  // interaction. Therefore, we pick the element that should undergo the view transforms to host
  // panzoom and keep the zoom interactions enabled, then forward pans to it manually.
  private transform: PanzoomObject | undefined;
  private pan: PanState | undefined;

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
  private shouldSkipNextNodeClick: string | undefined;
  private shouldSkipNextBackgroundClick: boolean = false;

  render() {
    const scale = this.transform?.getScale() ?? 1;
    const { incompleteEdge, dragState } = this.state;
    const { dotSize, spacing, fill } = this._getGrid();

    return (
      <svg
        onWheel={this._onWheelContainer}
        className={this.props.className}
        style={this.props.style}
        ref={this.root}
      >
        <defs>
          <pattern id="grid" width={spacing} height={spacing} patternUnits="userSpaceOnUse">
            <circle cx={spacing / 2} cy={spacing / 2} r={dotSize} fill={fill}></circle>
          </pattern>
        </defs>
        <g ref={this._initializeTransform}>
          <rect
            ref={this.background}
            className="panzoom-exclude"
            fill={this.props.grid === false ? "transparent" : "url(#grid)"}
            // TODO: This height thing works, but it's also overkill, cause when you zoom it it gets HUGE.
            width={`${DEFAULT_MAX_ZOOM * 100 * 2}%`}
            height={`${DEFAULT_MAX_ZOOM * 100 * 2}%`}
            onMouseDown={this._onMouseDownBackground}
            onClick={this._onClickBackground}
            style={{ cursor: "move" }}
          />
          {objectEntries(this.props.edges).map(([id, e]) => {
            let source = this.props.nodes[e.sourceId];
            let target = this.props.nodes[e.targetId];

            // TODO: We should warn about null nodes, but probably not explode?
            if (source == null || target == null) {
              return;
            }

            if (dragState) {
              if (dragState.nodeId === e.sourceId) {
                source = {
                  ...source,
                  x: (dragState.last.screenX - dragState.start.screenX) / scale + source.x,
                  y: (dragState.last.screenY - dragState.start.screenY) / scale + source.y,
                };
              }

              if (dragState.nodeId === e.targetId) {
                target = {
                  ...target,
                  x: (dragState.last.screenX - dragState.start.screenX) / scale + target.x,
                  y: (dragState.last.screenY - dragState.start.screenY) / scale + target.y,
                };
              }
            }

            return (
              <EdgeContainer
                key={id}
                id={id}
                edge={e}
                source={source}
                target={target}
                extraProps={this.props.extraProps}
                contentComponent={this.props.edgeComponent as any}
                onClick={this._onClickEdge}
              />
            );
          })}
          {incompleteEdge && this.props.incompleteEdgeComponent && (
            <g className="panzoom-exclude">
              <this.props.incompleteEdgeComponent
                source={this.props.nodes[incompleteEdge.sourceId]}
                sourceId={incompleteEdge.sourceId}
                position={{
                  x:
                    (incompleteEdge.last.screenX - incompleteEdge.start.screenX) / scale +
                    this.props.nodes[incompleteEdge.sourceId].x,
                  y:
                    (incompleteEdge.last.screenY - incompleteEdge.start.screenY) / scale +
                    this.props.nodes[incompleteEdge.sourceId].y,
                }}
                target={
                  incompleteEdge.targetId ? this.props.nodes[incompleteEdge.targetId] : undefined
                }
                targetId={incompleteEdge.targetId}
                {...(this.props.extraProps as any)}
              />
            </g>
          )}
          {objectEntries(this.props.nodes).map(([id, n]) => {
            let node = n;

            if (dragState?.nodeId === id) {
              node = {
                ...node,
                x: (dragState.last.screenX - dragState.start.screenX) / scale + node.x,
                y: (dragState.last.screenY - dragState.start.screenY) / scale + node.y,
              };
            }

            return (
              <NodeContainer
                key={id}
                id={id}
                node={node}
                extraProps={this.props.extraProps}
                contentComponent={this.props.nodeComponent as any}
                onMouseDown={this._onMouseDownNode}
                onMouseUp={this._onMouseUpNode}
                onMouseEnter={this._onMouseEnterNode}
                onMouseLeave={this._onMouseLeaveNode}
                onClick={this._onClickNode}
              />
            );
          })}
          {this.props.children}
        </g>
      </svg>
    );
  }

  private _getGrid(): Required<Grid> {
    const dotSize =
      (typeof this.props.grid !== "boolean" ? this.props.grid?.dotSize : undefined) ??
      DEFAULT_GRID_DOT_SIZE;
    const spacing =
      (typeof this.props.grid !== "boolean" ? this.props.grid?.spacing : undefined) ??
      DEFAULT_GRID_SPACING;
    const fill =
      (typeof this.props.grid !== "boolean" ? this.props.grid?.fill : undefined) ??
      DEFAULT_GRID_FILL;
    return { dotSize, spacing, fill };
  }

  private _toWorldSpacePosition(e: { clientX: number; clientY: number }): Position {
    const { current: root } = this.root;
    assertNonNull(root);
    const transform = this.transform;
    assertNonNull(transform);

    const scale = transform.getScale();
    const { x, y } = transform.getPan();
    const rect = root.getBoundingClientRect();

    return {
      x: (e.clientX - rect.left - root.clientLeft) / scale - x,
      y: (e.clientY - rect.top - root.clientTop) / scale - y,
    };
  }

  private _isWithinFudgeFactor(p1: ScreenPosition, p2: ScreenPosition) {
    return (
      Math.abs(p1.screenX - p2.screenX) <= this.props.clickFudgeFactor! &&
      Math.abs(p1.screenY - p2.screenY) <= this.props.clickFudgeFactor!
    );
  }

  private _onMouseDownBackground = (e: React.MouseEvent<SVGElement>) => {
    const { screenX, screenY } = e;
    this.pan = {
      panning: this.props.shouldStartPan?.(e) ?? false,
      start: { screenX, screenY },
      last: { screenX, screenY },
    };
  };

  private _onClickBackground = (e: React.MouseEvent) => {
    if (this.shouldSkipNextBackgroundClick) {
      this.shouldSkipNextBackgroundClick = false;
    } else {
      this.props.onClickBackground?.(e, this._toWorldSpacePosition(e));
    }
  };

  private _onMouseDownNode = (e: React.MouseEvent<SVGGElement>) => {
    const { id } = e.currentTarget.dataset;
    assertNonNull(id);
    const node = this.props.nodes[id];
    const { screenX, screenY } = e;
    const details: NodeEventDetails<N> = { node, id, position: this._toWorldSpacePosition(e) };
    if (this.props.shouldStartCreateEdge?.(e, details)) {
      this.setState({
        incompleteEdge: {
          sourceId: id,
          // Note that we don't set target here; if you want to create a self-edge you have to leave
          // and come back. This is... fine. If this behavior ever changes, make sure to change the
          // semantics of didLeaveOriginalNode as well. That value is used to differentiate between
          // self-edge creations and clicks without moving, and if you can self-edge create without
          // moving, it'll have to change to compensate.
          start: { screenX, screenY },
          last: { screenX, screenY },
          didLeaveOriginalNode: false,
        },
      });
    } else if (this.props.shouldStartNodeDrag?.(e.nativeEvent, details)) {
      this.setState({
        dragState: {
          nodeId: id,
          start: { screenX, screenY },
          last: { screenX, screenY },
        },
      });
    }
  };

  private _onMouseUpNode = (e: React.MouseEvent<SVGGElement>) => {
    const { incompleteEdge } = this.state;
    if (incompleteEdge) {
      const { id } = e.currentTarget.dataset;
      assertNonNull(id);
      if (
        incompleteEdge.didLeaveOriginalNode ||
        !this._isWithinFudgeFactor(e, incompleteEdge.start)
      ) {
        this.shouldSkipNextNodeClick = id;
        this.props.onCreateEdgeEnd?.(e, {
          source: this.props.nodes[incompleteEdge.sourceId],
          sourceId: incompleteEdge.sourceId,
          target: this.props.nodes[id],
          targetId: id,
        });
      }
      this.setState({ incompleteEdge: undefined });
    }
  };

  private _onClickNode = (e: React.MouseEvent<SVGGElement>) => {
    const { id } = e.currentTarget.dataset;
    assertNonNull(id);
    if (this.shouldSkipNextNodeClick != null) {
      assertEqual(this.shouldSkipNextNodeClick, id);
      this.shouldSkipNextNodeClick = undefined;
    } else {
      this.props.onClickNode?.(e, {
        node: this.props.nodes[id],
        id,
        position: this._toWorldSpacePosition(e),
      });
    }
  };

  private _onMouseEnterNode = (e: React.MouseEvent<SVGGElement>) => {
    if (this.state.incompleteEdge) {
      const { id } = e.currentTarget.dataset;
      assertNonNull(id);
      this.setState({
        incompleteEdge: {
          ...this.state.incompleteEdge,
          targetId: id,
        },
      });
    }
  };

  private _onMouseLeaveNode = () => {
    const { incompleteEdge } = this.state;
    // Check to see if we need to actually shallowly mutate and rerender first...
    if (
      incompleteEdge &&
      (incompleteEdge.targetId != null || !incompleteEdge.didLeaveOriginalNode)
    ) {
      // We don't know if the node that's being left is the original node, but you can't
      // enter another node without first leaving this one, so it's safe to set.
      this.setState({
        incompleteEdge: {
          ...incompleteEdge,
          targetId: undefined,
          didLeaveOriginalNode: true,
        },
      });
    }
  };

  private _onClickEdge = (e: React.MouseEvent<SVGGElement>) => {
    if (this.props.onClickEdge) {
      const { id } = e.currentTarget.dataset;
      assertNonNull(id);
      const edge = this.props.edges[id];
      this.props.onClickEdge(e, {
        edge,
        id,
        source: this.props.nodes[edge.sourceId],
        target: this.props.nodes[edge.targetId],
        position: this._toWorldSpacePosition(e),
      });
    }
  };

  private _onWheelContainer = (e: React.WheelEvent) => {
    // Wheel zooms are not bound by default, so forward them here.
    this.transform?.zoomWithWheel(e.nativeEvent);
  };

  private _onMouseMoveDocument = (e: MouseEvent) => {
    const { screenX, screenY } = e;
    const scale = this.transform?.getScale() ?? 1;

    if (this.state.dragState) {
      this.setState({
        dragState: {
          ...this.state.dragState,
          last: { screenX, screenY },
        },
      });
    }

    if (this.state.incompleteEdge) {
      this.setState({
        incompleteEdge: {
          ...this.state.incompleteEdge,
          last: { screenX, screenY },
        },
      });
    }

    if (this.pan?.panning) {
      this.transform?.pan(
        (screenX - this.pan.last.screenX) / scale,
        (screenY - this.pan.last.screenY) / scale,
        { relative: true, force: true },
      );
      this.pan.last = { screenX, screenY };
    }
  };

  private _onMouseUpDocument = (e: MouseEvent) => {
    if (this.pan) {
      this.shouldSkipNextBackgroundClick = !this._isWithinFudgeFactor(e, this.pan.start);
      this.pan = undefined;
    }

    const { dragState } = this.state;
    if (dragState) {
      if (!this._isWithinFudgeFactor(e, dragState.start)) {
        this.shouldSkipNextNodeClick = dragState.nodeId;
        if (this.props.onNodeDragEnd) {
          const node = this.props.nodes[dragState.nodeId];
          const scale = this.transform?.getScale() ?? 1;
          this.props.onNodeDragEnd(e, {
            node,
            id: dragState.nodeId,
            position: {
              x: (e.screenX - dragState.start.screenX) / scale + node.x,
              y: (e.screenY - dragState.start.screenY) / scale + node.y,
            },
          });
        }
      }
      this.setState({ dragState: undefined });
    }

    // If we didn't release on a node, stop creation anyway.
    this.setState({ incompleteEdge: undefined });
  };

  private _initializeTransform = (e: SVGGElement | null) => {
    if (e) {
      this.transform = Panzoom(e, {
        // Per the comment on this ref, we forward panning commands manually. This is also why
        // you'll see force: true set on those pan commands.
        disablePan: true,
        // By unsetting this here and instead setting it on the background, we make sure that the
        // cursor only looks like a pan/zoom cursor when it's not on a node/edge by default, even if
        // nodes and edges don't override the style.
        cursor: "default",
        minScale: DEFAULT_MIN_ZOOM,
        maxScale: DEFAULT_MAX_ZOOM,
        step: DEFAULT_ZOOM_SPEED,
      });

      // TODO: Slight bug here: if the background is remounted but no pan is performed afterwards,
      // it'll be misaligned. We need to do this on background mount too.
      e.addEventListener("panzoomchange", (poorlyTypedEvent: unknown) => {
        const {
          detail: { x, y },
        } = poorlyTypedEvent as PanzoomEvent;
        // TODO: Pull this out into an InfiniteTiled component or something.
        if (this.background.current) {
          const { spacing } = this._getGrid();
          this.background.current.style["transform"] = `translate(${
            -x - spacing / 2 + (x % spacing)
          }px,${-y - spacing / 2 + (y % spacing)}px)`;
        }
      });
    } else {
      this.transform = undefined;
    }
  };

  componentDidMount() {
    assertNonNull(this.root.current);
    assertNonNull(this.transform);
    const rect = this.root.current.getBoundingClientRect();
    // TODO: Does this need to divide by scale, like other transformations?
    this.transform.pan(rect.width / 2, rect.height / 2, { force: true });

    document.addEventListener("mousemove", this._onMouseMoveDocument);
    document.addEventListener("mouseup", this._onMouseUpDocument);
  }

  componentWillUnmount() {
    document.removeEventListener("mousemove", this._onMouseMoveDocument);
    document.removeEventListener("mouseup", this._onMouseUpDocument);
  }
}

interface NodeContainerProps<N extends Node, X extends object> {
  id: string;
  node: N;
  extraProps: X | undefined;
  contentComponent: React.ComponentType<NodeComponentProps<N> & X>;
  onMouseDown: (e: React.MouseEvent<SVGGElement>) => void;
  onMouseUp: (e: React.MouseEvent<SVGGElement>) => void;
  onMouseEnter: (e: React.MouseEvent<SVGGElement>) => void;
  onMouseLeave: (e: React.MouseEvent<SVGGElement>) => void;
  onClick: (e: React.MouseEvent<SVGGElement>) => void;
}

const NodeContainer = React.memo(
  <N extends Node, X extends object>(props: NodeContainerProps<N, X>) => (
    <g
      data-id={props.id}
      onMouseDown={props.onMouseDown}
      onMouseUp={props.onMouseUp}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onClick={props.onClick}
      className="panzoom-exclude"
    >
      <props.contentComponent nodeId={props.id} node={props.node} {...(props.extraProps as any)} />
    </g>
  ),
);

interface EdgeContainerProps<N extends Node, E extends Edge, X extends object> {
  id: string;
  edge: E;
  source: N;
  target: N;
  extraProps: X | undefined;
  contentComponent: React.ComponentType<EdgeComponentProps<N, E> & X>;
  onClick: (e: React.MouseEvent<SVGGElement>) => void;
}

const EdgeContainer = React.memo(
  <N extends Node, E extends Edge, X extends object>(props: EdgeContainerProps<N, E, X>) => (
    <g data-id={props.id} className="panzoom-exclude" onClick={props.onClick}>
      <props.contentComponent
        edgeId={props.id}
        edge={props.edge}
        source={props.source}
        target={props.target}
        {...(props.extraProps as any)}
      />
    </g>
  ),
);
