import * as React from "react";
import * as ReactDOM from "react-dom";
import { Graph, Node, Edge } from "../";

let nodes: Node[] = [
  { id: "1", x: 0, y: 0 },
  { id: "2", x: 100, y: 100 },
];

let edges: Edge[] = [{ sourceId: "1", targetId: "2" }];

function render() {
  ReactDOM.render(
    <Graph
      nodes={nodes}
      edges={edges}
      onDragEnd={(_, n, x, y) => {
        nodes = nodes.map((node) => (node.id === n.id ? { ...node, x, y } : node));
        render();
      }}
    />,
    document.getElementById("container"),
  );
}

// TODO: Wrap this in a top-level component.
render();
