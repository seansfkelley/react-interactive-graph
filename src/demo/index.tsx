import * as React from "react";
import * as ReactDOM from "react-dom";
import { Graph, Node, Edge } from "../";

const nodes: Node[] = [
  { id: "1", x: 0, y: 0 },
  { id: "2", x: 100, y: 100 },
];

const edges: Edge[] = [{ sourceId: "1", targetId: "2" }];

ReactDOM.render(<Graph nodes={nodes} edges={edges} />, document.getElementById("container"));
