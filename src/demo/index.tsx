import * as React from "react";
import * as ReactDOM from "react-dom";
import { Graph, Node, Edge } from "../";
// TODO: Probably shouldn't reach into this internal import?
import { objectValues } from "../lang";
import { useDocumentEvent } from "../hooks";

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

export function Demo() {
  const [nodes, setNodes] = React.useState<Node[]>([
    { id: "1", x: 100, y: 100 },
    { id: "2", x: 200, y: 200 },
  ]);
  const [edges, setEdges] = React.useState<Edge[]>([{ id: "1-2", sourceId: "1", targetId: "2" }]);

  const [gridEnabled, setGridEnabled] = React.useState(true);

  const selection = useSelectionSet<"node" | "edge">();

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

  const renderNode = React.useCallback(
    (node: Node) => {
      return (
        <>
          {selection.has("node", node.id) && (
            <circle cx={node.x} cy={node.y} r="14" fill="blue"></circle>
          )}
          <circle cx={node.x} cy={node.y} r="10"></circle>
        </>
      );
    },
    [selection],
  );

  const renderEdge = React.useCallback(
    (edge: Edge, source: Node, target: Node) => {
      return (
        <>
          <path
            d={`M${source.x},${source.y}L${target.x},${target.y}`}
            stroke="grey"
            strokeWidth={2}
          />
          <path
            d={`M${source.x},${source.y}L${target.x},${target.y}`}
            stroke={selection.has("edge", edge.id) ? "blue" : "transparent"}
            strokeWidth={selection.has("edge", edge.id) ? 6 : 30}
          />
        </>
      );
    },
    [selection],
  );

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
        onClickBackground={() => {
          selection.clear();
        }}
      />
    </div>
  );
}

ReactDOM.render(<Demo />, document.getElementById("container"));
