import * as React from "react";
// eslint-disable-next-line import/no-extraneous-dependencies
import * as ReactDOM from "react-dom";
import { shape, intersect } from "svg-intersections";
import {
  Graph,
  Node,
  Edge,
  pathD,
  selfEdgePathD,
  Position,
  Grid,
  DEFAULT_GRID_DOT_SIZE,
  DEFAULT_GRID_SPACING,
  DEFAULT_GRID_FILL,
  PathType,
  PathDirection,
} from "../";

import { useSelectionSet } from "./hooks";
import { useDocumentEvent } from "../hooks";
import { ControlStrip } from "./ControlStrip";
import { ExampleType, GENERATE, nextId } from "./exampleData";
import { snapToGrid } from "../util";

const SELECTION_COLOR = "#5558fc";
const ARROW_SIZE = 10;
const NODE_RADIUS = 40;

export function Demo() {
  const [nodes, setNodes] = React.useState<Node[]>([]);
  const [edges, setEdges] = React.useState<Edge[]>([]);

  React.useEffect(() => {
    const { nodes, edges } = GENERATE[ExampleType.SIMPLE]();
    setNodes(nodes);
    setEdges(edges);
  }, []);

  const [gridEnabled, setGridEnabled] = React.useState(true);
  const [grid, setGrid] = React.useState<Required<Grid>>({
    dotSize: DEFAULT_GRID_DOT_SIZE,
    spacing: DEFAULT_GRID_SPACING,
    fill: DEFAULT_GRID_FILL,
  });
  const [pathType, setPathType] = React.useState(PathType.STRAIGHT);
  const [pathDirection, setPathDirection] = React.useState(PathDirection.AUTO);
  const [gridSnapSize, setGridSnapSize] = React.useState(0);

  const nodeSelection = useSelectionSet();
  const edgeSelection = useSelectionSet();

  const snap = React.useCallback(
    <T extends Position>(position: T): T => {
      if (gridSnapSize !== 0) {
        return snapToGrid(position, gridSnapSize);
      } else {
        return position;
      }
    },
    [gridSnapSize],
  );

  const onCreateEdgeEnd = React.useCallback((_e: React.MouseEvent, source: Node, target: Node) => {
    setEdges((edges) => [...edges, { id: nextId(), sourceId: source.id, targetId: target.id }]);
  }, []);

  const onDocumentKeyUp = React.useCallback(
    (e: KeyboardEvent) => {
      // TODO: Should probably use keycodes here.
      if (e.key === "Delete" || e.key === "Backspace") {
        setNodes((nodes) => nodes.filter(({ id }) => !nodeSelection.has(id)));
        setEdges((edges) =>
          edges.filter(
            ({ id, sourceId, targetId }) =>
              !edgeSelection.has(id) &&
              !nodeSelection.has(sourceId) &&
              !nodeSelection.has(targetId),
          ),
        );
      }
    },
    [nodeSelection, edgeSelection],
  );

  useDocumentEvent("keyup", onDocumentKeyUp);

  const renderNode = React.useCallback(
    (n: Node) => {
      const node = snap(n);
      const isSelected = nodeSelection.has(node.id);
      return (
        <>
          <circle
            cx={node.x}
            cy={node.y}
            r={NODE_RADIUS}
            strokeWidth={isSelected ? 2 : 1}
            fill="white"
            stroke={isSelected ? SELECTION_COLOR : "black"}
            filter={isSelected ? "url(#drop-shadow-node-highlight)" : "url(#drop-shadow-node)"}
          />
          <text
            x={node.x}
            y={node.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="36"
            fontFamily="sans-serif"
          >
            {node.id}
          </text>
        </>
      );
    },
    [nodeSelection, snap],
  );

  const renderEdge = React.useCallback(
    (edge: Edge, source: Node, target: Node) => {
      const isSelected = edgeSelection.has(edge.id);

      const snappedSource = snap(source);
      const snappedTarget = snap(target);

      const { points: targetIntersections } = intersect(
        shape("circle", { cx: snappedTarget.x, cy: snappedTarget.y, r: NODE_RADIUS }),
        shape("line", {
          x1: snappedSource.x,
          y1: snappedSource.y,
          x2: snappedTarget.x,
          y2: snappedTarget.y,
        }),
      );

      const targetPoint = targetIntersections.length > 0 ? targetIntersections[0] : snappedTarget;

      const d =
        source.id === target.id
          ? selfEdgePathD(snappedSource, 150)
          : pathD(snappedSource, targetPoint, pathType, pathDirection);

      return (
        <>
          {/* Superfat edge to make the click target larger. */}
          <path d={d} stroke="transparent" strokeWidth={40} fill="transparent" />
          <path
            d={d}
            stroke={isSelected ? SELECTION_COLOR : "transparent"}
            strokeWidth={3}
            fill="transparent"
            filter={isSelected ? "url(#drop-shadow-edge-highlight)" : undefined}
          />
          <path
            d={d}
            stroke="black"
            strokeWidth={isSelected ? 1 : 2}
            fill="transparent"
            filter={isSelected ? undefined : "url(#drop-shadow-edge)"}
            style={{ markerEnd: "url(#arrow)" }}
          />
        </>
      );
    },
    [edgeSelection, pathType, pathDirection, snap],
  );

  const renderIncompleteEdge = React.useCallback(
    (source: Node, position: Position, target: Node | undefined) => {
      return (
        <path
          d={
            source.id === target?.id
              ? selfEdgePathD(snap(source), 150)
              : pathD(snap(source), target ? snap(target) : position)
          }
          stroke="black"
          strokeWidth={2}
          strokeDasharray="20,10"
          fill="transparent"
          filter="url(#drop-shadow-edge)"
        />
      );
    },
    [snap],
  );

  return (
    <>
      <ControlStrip
        gridEnabled={gridEnabled}
        onChangeGridEnabled={setGridEnabled}
        grid={grid}
        onChangeGrid={setGrid}
        gridSnapSize={gridSnapSize}
        onChangeGridSnapSize={setGridSnapSize}
        pathType={pathType}
        onChangePathType={setPathType}
        preferredPathDirection={pathDirection}
        onChangePreferredPathDirection={setPathDirection}
        onChangeExampleType={(t) => {
          const { nodes, edges } = GENERATE[t]();
          setNodes(nodes);
          setEdges(edges);
        }}
      />
      <Graph
        style={{ flex: 1 }}
        grid={gridEnabled && grid}
        nodes={nodes}
        edges={edges}
        renderNode={renderNode}
        renderEdge={renderEdge}
        renderIncompleteEdge={renderIncompleteEdge}
        onClickNode={(event, n) => {
          if (event.metaKey || event.shiftKey) {
            nodeSelection.toggle(n.id);
          } else {
            edgeSelection.clear();
            nodeSelection.clear();
            nodeSelection.add(n.id);
          }
        }}
        onClickEdge={(event, e) => {
          if (event.metaKey || event.shiftKey) {
            edgeSelection.toggle(e.id);
          } else {
            nodeSelection.clear();
            edgeSelection.clear();
            edgeSelection.add(e.id);
          }
        }}
        onClickBackground={(event, { x, y }) => {
          if (event.altKey) {
            setNodes((nodes) => [...nodes, { id: nextId(), x, y }]);
          } else {
            nodeSelection.clear();
            edgeSelection.clear();
          }
        }}
        shouldStartPan={(event) => !event.altKey}
        shouldStartNodeDrag={(event) => !event.altKey}
        shouldStartCreateEdge={(event) => event.altKey}
        onNodeDragEnd={(_, n, position) => {
          setNodes(nodes.map((node) => (node.id === n.id ? { ...node, ...position } : node)));
        }}
        onCreateEdgeEnd={onCreateEdgeEnd}
      >
        <defs>
          {/* TODO: Can this be one drop shadow with different colors at the usage site? */}
          <filter id="drop-shadow-node">
            <feDropShadow dx="1" dy="1" stdDeviation="2" floodColor="black" />
          </filter>
          <filter id="drop-shadow-node-highlight">
            <feDropShadow dx="1" dy="1" stdDeviation="3" floodColor={SELECTION_COLOR} />
          </filter>
          <filter id="drop-shadow-edge">
            <feDropShadow dx="1" dy="1" stdDeviation="1" floodColor="black" />
          </filter>
          <filter id="drop-shadow-edge-highlight">
            <feDropShadow dx="1" dy="1" stdDeviation="2" floodColor={SELECTION_COLOR} />
          </filter>
          <marker
            id="arrow"
            viewBox={`0 -${ARROW_SIZE / 2} ${ARROW_SIZE} ${ARROW_SIZE}`}
            refX={ARROW_SIZE}
            markerWidth={ARROW_SIZE}
            markerHeight={ARROW_SIZE}
            orient="auto"
          >
            <path
              d={`M0,-${ARROW_SIZE / 2}L${ARROW_SIZE},0L0,${ARROW_SIZE / 2}`}
              width={ARROW_SIZE}
              height={ARROW_SIZE}
            />
          </marker>
        </defs>
      </Graph>
    </>
  );
}

ReactDOM.render(<Demo />, document.getElementById("container"));
