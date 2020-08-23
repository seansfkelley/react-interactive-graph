import * as React from "react";
import * as ReactDOM from "react-dom";
import { Graph, Node, Edge, pathD, Position } from "../";
// TODO: Probably shouldn't reach into this internal import?
import { objectValues } from "../lang";
import { useDocumentEvent } from "../hooks";

let _id = 0;

function nextId() {
  return (++_id).toString();
}

interface SelectionSet<K extends string> {
  count(): number;
  has(type: K, id: string): boolean;
  add(type: K, id: string): void;
  remove(type: K, id: string): void;
  toggle(type: K, id: string): void;
  clear(type?: K): void;
}

function useSelectionSet<K extends string>(): SelectionSet<K> {
  const sets: { current: Partial<Record<K, Set<string> | undefined>> } = React.useRef({});

  const count = React.useCallback(
    () =>
      objectValues<Set<string> | undefined>(sets.current).reduce((sum, set) => sum + set!.size, 0),
    [],
  );

  const has = React.useCallback((type: K, id: string) => {
    const s = sets.current[type];
    return s && s.has(id);
  }, []);

  const add = React.useCallback((type: K, id: string) => {
    if (!sets.current[type]) {
      sets.current[type] = new Set();
    }
    const shouldUpdate = !sets.current[type]!.has(id);
    sets.current[type]!.add(id);
    if (shouldUpdate) {
      updateSelectionSet();
    }
  }, []);

  const remove = React.useCallback((type: K, id: string) => {
    if (sets.current[type]?.delete(id)) {
      updateSelectionSet();
    }
  }, []);

  const toggle = React.useCallback((type: K, id: string) => {
    if (!sets.current[type]) {
      sets.current[type] = new Set();
      sets.current[type]!.add(id);
    } else if (sets.current[type]!.has(id)) {
      sets.current[type]!.delete(id);
    } else {
      sets.current[type]!.add(id);
    }
    updateSelectionSet();
  }, []);

  const clear = React.useCallback((type?: K) => {
    if (type == null) {
      sets.current = {};
    } else {
      sets.current[type]?.clear();
    }
    updateSelectionSet();
  }, []);

  function make(): SelectionSet<K> {
    return {
      count,
      has,
      add,
      remove,
      toggle,
      clear,
    };
  }

  const [selectionSet, setSelectionSet] = React.useState<SelectionSet<K>>(make);

  const updateSelectionSet = React.useCallback(() => {
    setSelectionSet(make());
  }, [count, has, add, remove, toggle, clear]);

  return selectionSet;
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

  const selection = useSelectionSet<"node" | "edge">();
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
        setNodes((nodes) => nodes.filter(({ id }) => !selection.has("node", id)));
        setEdges((edges) =>
          edges.filter(
            ({ id, sourceId, targetId }) =>
              !selection.has("edge", id) &&
              !selection.has("node", sourceId) &&
              !selection.has("node", targetId),
          ),
        );
      }
    },
    [selection],
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
      const isSelected = selection.has("node", node.id);
      return (
        <>
          <circle
            cx={node.x}
            cy={node.y}
            r="40"
            strokeWidth={1}
            fill="white"
            stroke={isSelected ? "lightblue" : "black"}
            filter={isSelected ? "url(#drop-shadow-node-highlight)" : "url(#drop-shadow-node)"}
          />
          <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle">
            node id: {node.id}
          </text>
        </>
      );
    },
    [selection],
  );

  const renderEdge = React.useCallback(
    (edge: Edge, source: Node, target: Node) => {
      const isSelected = selection.has("edge", edge.id);
      return (
        <>
          <path
            d={pathD(source, target)}
            stroke={isSelected ? "lightblue" : "transparent"}
            // Superfat edge to make the click target larger.
            strokeWidth={isSelected ? 4 : 40}
            filter={isSelected ? "url(#drop-shadow-edge-highlight)" : undefined}
          />
          <path
            d={pathD(source, target)}
            stroke="black"
            strokeWidth={2}
            filter={isSelected ? undefined : "url(#drop-shadow-edge)"}
          />
        </>
      );
    },
    [selection],
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
    <div>
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
        style={{ width: 400, height: 600 }}
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
            selection.toggle("node", n.id);
          } else {
            selection.clear();
            selection.add("node", n.id);
          }
        }}
        onClickEdge={(event, e) => {
          if (event.shiftKey) {
            // nop; this is the hotkey for dragging
          } else if (event.metaKey) {
            selection.toggle("edge", e.id);
          } else {
            selection.clear();
            selection.add("edge", e.id);
          }
        }}
        onClickBackground={(e, { x, y }) => {
          selection.clear();
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
            <feDropShadow dx="1" dy="1" stdDeviation="1" floodColor="blue" />
          </filter>
          <filter id="drop-shadow-edge">
            <feDropShadow dx="1" dy="1" stdDeviation="1" floodColor="black" />
          </filter>
          <filter id="drop-shadow-edge-highlight">
            <feDropShadow dx="1" dy="1" stdDeviation="2" floodColor="blue" />
          </filter>
        </defs>
      </Graph>
    </div>
  );
}

ReactDOM.render(<Demo />, document.getElementById("container"));
