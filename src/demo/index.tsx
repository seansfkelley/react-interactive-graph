import * as React from "react";
// eslint-disable-next-line import/no-extraneous-dependencies
import * as ReactDOM from "react-dom";
import {
  Graph,
  Node,
  Edge,
  pathD,
  Position,
  Grid,
  DEFAULT_GRID_DOT_SIZE,
  DEFAULT_GRID_SPACING,
  DEFAULT_GRID_FILL,
} from "../";

import { useSelectionSet } from "./hooks";
import { useDocumentEvent } from "../hooks";
import { ControlStrip } from "./ControlStrip";
import { ExampleType, GENERATE, nextId } from "./exampleData";

const SELECTION_COLOR = "#5558fc";

export function Demo() {
  const [nodes, setNodes] = React.useState<Node[]>([]);
  const [edges, setEdges] = React.useState<Edge[]>([]);

  React.useEffect(() => {
    const { nodes, edges } = GENERATE[ExampleType.SIMPLE]();
    setNodes(nodes);
    setEdges(edges);
  }, []);

  const [isCreating, setIsCreating] = React.useState(false);

  const [gridEnabled, setGridEnabled] = React.useState(true);
  const [grid, setGrid] = React.useState<Required<Grid>>({
    dotSize: DEFAULT_GRID_DOT_SIZE,
    spacing: DEFAULT_GRID_SPACING,
    fill: DEFAULT_GRID_FILL,
  });

  const nodeSelection = useSelectionSet();
  const edgeSelection = useSelectionSet();

  React.useEffect(() => {
    if (isCreating) {
      nodeSelection.clear();
      edgeSelection.clear();
    }
  }, [isCreating, nodeSelection, edgeSelection]);

  const onCreateEdgeStart = React.useCallback(() => {
    return isCreating;
  }, [isCreating]);

  const onCreateEdge = React.useCallback((_e: React.MouseEvent, source: Node, target: Node) => {
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
    (node: Node) => {
      const isSelected = nodeSelection.has(node.id);
      return (
        <>
          <circle
            cx={node.x}
            cy={node.y}
            r="40"
            strokeWidth={isSelected ? 2 : 1}
            fill="white"
            stroke={isSelected ? SELECTION_COLOR : "black"}
            filter={isSelected ? "url(#drop-shadow-node-highlight)" : "url(#drop-shadow-node)"}
          />
          <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle">
            node id: {node.id}
          </text>
        </>
      );
    },
    [nodeSelection],
  );

  const renderEdge = React.useCallback(
    (edge: Edge, source: Node, target: Node) => {
      const isSelected = edgeSelection.has(edge.id);
      const d = pathD(source, target);
      return (
        <>
          {/* Superfat edge to make the click target larger. */}
          <path d={d} stroke="transparent" strokeWidth={40} />
          <path
            d={d}
            stroke={isSelected ? SELECTION_COLOR : "transparent"}
            strokeWidth={3}
            filter={isSelected ? "url(#drop-shadow-edge-highlight)" : undefined}
          />
          <path
            d={d}
            stroke="black"
            strokeWidth={isSelected ? 1 : 2}
            filter={isSelected ? undefined : "url(#drop-shadow-edge)"}
          />
        </>
      );
    },
    [edgeSelection],
  );

  const renderIncompleteEdge = React.useCallback((source: Node, target: Position) => {
    return (
      <path
        d={pathD(source, target)}
        stroke="black"
        strokeWidth={2}
        strokeDasharray="20,10"
        filter="url(#drop-shadow-edge)"
      />
    );
  }, []);

  return (
    <>
      <ControlStrip
        isCreating={isCreating}
        onChangeIsCreating={setIsCreating}
        gridEnabled={gridEnabled}
        onChangeGridEnabled={setGridEnabled}
        grid={grid}
        onChangeGrid={setGrid}
        onChangeExampleType={(t) => {
          const { nodes, edges } = GENERATE[t]();
          setNodes(nodes);
          setEdges(edges);
        }}
      />
      <Graph
        style={{ flex: 1, cursor: isCreating ? "pointer" : undefined }}
        grid={gridEnabled && grid}
        nodes={nodes}
        edges={edges}
        onDragEndNode={(_, n, x, y) => {
          setNodes(nodes.map((node) => (node.id === n.id ? { ...node, x, y } : node)));
        }}
        renderNode={renderNode}
        renderEdge={renderEdge}
        renderIncompleteEdge={renderIncompleteEdge}
        shouldStartNodeDrag={(event) => {
          return !isCreating || event.shiftKey;
        }}
        onClickNode={(event, n) => {
          if (event.shiftKey) {
            // nop; this is the hotkey for dragging
          } else if (event.metaKey) {
            nodeSelection.toggle(n.id);
          } else {
            edgeSelection.clear();
            nodeSelection.clear();
            nodeSelection.add(n.id);
          }
        }}
        onClickEdge={(event, e) => {
          if (event.shiftKey) {
            // nop; this is the hotkey for dragging
          } else if (event.metaKey) {
            edgeSelection.toggle(e.id);
          } else {
            nodeSelection.clear();
            edgeSelection.clear();
            edgeSelection.add(e.id);
          }
        }}
        onClickBackground={(_event, { x, y }) => {
          if (isCreating) {
            setNodes((nodes) => [...nodes, { id: nextId(), x, y }]);
          } else {
            nodeSelection.clear();
            edgeSelection.clear();
          }
        }}
        onCreateEdgeStart={onCreateEdgeStart}
        onCreateEdge={onCreateEdge}
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
        </defs>
      </Graph>
    </>
  );
}

ReactDOM.render(<Demo />, document.getElementById("container"));
