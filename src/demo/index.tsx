import * as React from "react";
// eslint-disable-next-line import/no-extraneous-dependencies
import * as ReactDOM from "react-dom";
import { Graph, Node, Edge, pathD, Position } from "../";

import { useSelectionSet } from "./hooks";
import { useDocumentEvent } from "../hooks";

const SELECTION_COLOR = "#5558fc";

let _id = 0;

function nextId() {
  return (++_id).toString();
}

const INITIAL_NODES: Node[] = [
  { id: nextId(), x: -100, y: -100 },
  { id: nextId(), x: 150, y: 175 },
  { id: nextId(), x: 0, y: 50 },
  { id: nextId(), x: 50, y: -100 },
];
const INITIAL_EDGES: Edge[] = [
  {
    id: nextId(),
    sourceId: INITIAL_NODES[0].id,
    targetId: INITIAL_NODES[1].id,
  },
  {
    id: nextId(),
    sourceId: INITIAL_NODES[1].id,
    targetId: INITIAL_NODES[2].id,
  },
  {
    id: nextId(),
    sourceId: INITIAL_NODES[2].id,
    targetId: INITIAL_NODES[3].id,
  },
];

export function Demo() {
  const [nodes, setNodes] = React.useState<Node[]>(INITIAL_NODES);
  const [edges, setEdges] = React.useState<Edge[]>(INITIAL_EDGES);

  const [gridEnabled, setGridEnabled] = React.useState(true);

  const nodeSelection = useSelectionSet();
  const edgeSelection = useSelectionSet();
  const isCreatingEdge = React.useRef(false);

  const onCreateEdgeStart = React.useCallback((e: React.MouseEvent) => {
    if (e.ctrlKey) {
      isCreatingEdge.current = true;
      return true;
    } else {
      return false;
    }
  }, []);

  const onCreateEdge = React.useCallback((_e: React.MouseEvent, source: Node, target: Node) => {
    isCreatingEdge.current = false;

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

  const onDocumentContextMenu = React.useCallback((e: MouseEvent) => {
    if (isCreatingEdge.current) {
      e.preventDefault();
    }
  }, []);

  useDocumentEvent("contextmenu", onDocumentContextMenu);

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
      <div>
        <input
          type="checkbox"
          checked={gridEnabled}
          onChange={() => {
            setGridEnabled(!gridEnabled);
          }}
        />
      </div>
      <Graph
        style={{ flex: 1 }}
        grid={gridEnabled}
        nodes={nodes}
        edges={edges}
        onDragEndNode={(_, n, x, y) => {
          setNodes(nodes.map((node) => (node.id === n.id ? { ...node, x, y } : node)));
        }}
        renderNode={renderNode}
        renderEdge={renderEdge}
        renderIncompleteEdge={renderIncompleteEdge}
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
        onClickBackground={(e, { x, y }) => {
          nodeSelection.clear();
          edgeSelection.clear();
          if (e.shiftKey) {
            setNodes((nodes) => [...nodes, { id: nextId(), x, y }]);
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
