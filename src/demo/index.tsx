import * as React from "react";
// eslint-disable-next-line import/no-extraneous-dependencies
import * as ReactDOM from "react-dom";

import {
  Node,
  Edge,
  Position,
  Grid,
  DEFAULT_GRID_DOT_SIZE,
  DEFAULT_GRID_SPACING,
  DEFAULT_GRID_FILL,
  PathType,
  PathDirection,
  CreateEdgeEventDetails,
} from "../";
// import { Graph } from "../Graph";
import { Graph } from "../Graph2";

import { useSelectionSet } from "./hooks";
import { useDocumentEvent } from "../hooks";
import { ControlStrip } from "./ControlStrip";
import { ExampleType, GENERATE, nextId, NODE_SIZE } from "./exampleData";
import { snapToGrid } from "../util";
import { keyBy } from "./util";
import {
  Node as NodeComponent,
  Edge as EdgeComponent,
  IncompleteEdge as IncompleteEdgeComponent,
  Defs,
  ExtraProps,
} from "./elements";
import { mapValues, omitBy } from "../lang";

export function Demo() {
  const [nodes, setNodes] = React.useState<Record<string, Node>>({});
  const [edges, setEdges] = React.useState<Record<string, Edge>>({});

  React.useEffect(() => {
    const { nodes, edges } = GENERATE[ExampleType.SIMPLE]();
    setNodes(keyBy(nodes, "id"));
    setEdges(keyBy(edges, "id"));
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
  const [dropShadows, setDropShadows] = React.useState(false);

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

  const extraProps = React.useMemo((): ExtraProps => {
    console.log("recalc");
    return {
      nodeSelection,
      edgeSelection,
      pathType,
      pathDirection,
      snap,
      dropShadows,
    };
  }, [nodeSelection, edgeSelection, pathType, pathDirection, snap, dropShadows]);

  const onCreateEdgeEnd = React.useCallback(
    (_e: React.MouseEvent, { sourceId, targetId }: CreateEdgeEventDetails) => {
      setEdges((edges) => ({ ...edges, [nextId()]: { sourceId, targetId } }));
    },
    [],
  );

  const onDocumentKeyUp = React.useCallback(
    (e: KeyboardEvent) => {
      // TODO: Should probably use keycodes here.
      if (e.key === "Delete" || e.key === "Backspace") {
        setNodes((nodes) => omitBy(nodes, nodeSelection.has));
        setEdges((edges) =>
          omitBy(
            edges,
            (id, { sourceId, targetId }) =>
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
        dropShadows={dropShadows}
        onChangeDropShadows={setDropShadows}
        onChangeExampleType={(t) => {
          const { nodes, edges } = GENERATE[t]();
          setNodes(keyBy(nodes, "id"));
          setEdges(keyBy(edges, "id"));
        }}
      />
      <Graph
        style={{ flex: 1 }}
        grid={gridEnabled && grid}
        nodes={nodes}
        edges={edges}
        nodeComponent={NodeComponent}
        edgeComponent={EdgeComponent}
        incompleteEdgeComponent={IncompleteEdgeComponent}
        extraProps={extraProps}
        onClickNode={(event, n) => {
          if (event.metaKey || event.shiftKey) {
            nodeSelection.toggle(n.id);
          } else {
            edgeSelection.reset();
            nodeSelection.reset(n.id);
          }
        }}
        onClickEdge={(event, e) => {
          if (event.metaKey || event.shiftKey) {
            edgeSelection.toggle(e.id);
          } else {
            nodeSelection.reset();
            edgeSelection.reset(e.id);
          }
        }}
        onClickBackground={(event, { x, y }) => {
          if (event.altKey) {
            setNodes((nodes) => ({
              ...nodes,
              [nextId()]: { x, y, width: NODE_SIZE, height: NODE_SIZE },
            }));
          } else {
            nodeSelection.reset();
            edgeSelection.reset();
          }
        }}
        shouldStartPan={(event) => !event.altKey}
        shouldStartNodeDrag={(event) => !event.altKey}
        shouldStartCreateEdge={(event) => event.altKey}
        onNodeDragEnd={(_, { id: draggedNodeId, position }) => {
          setNodes((nodes) =>
            mapValues(nodes, (id, n) => (id === draggedNodeId ? { ...n, ...position } : n)),
          );
        }}
        onCreateEdgeEnd={onCreateEdgeEnd}
      >
        <Defs />
      </Graph>
    </>
  );
}

ReactDOM.render(<Demo />, document.getElementById("container"));
