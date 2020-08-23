import * as React from "react";
import * as ReactDOM from "react-dom";
import { Graph, Node, Edge } from "../";

export function Demo() {
  const [nodes, setNodes] = React.useState<Node[]>([
    { id: "1", x: 0, y: 0 },
    { id: "2", x: 100, y: 100 },
  ]);
  const [edges] = React.useState<Edge[]>([{ sourceId: "1", targetId: "2" }]);

  const [gridEnabled, setGridEnabled] = React.useState(true);

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
        onNodeDragEnd={(_, n, x, y) => {
          setNodes(nodes.map((node) => (node.id === n.id ? { ...node, x, y } : node)));
        }}
        onClickNode={(_, n) => {
          console.log(n);
        }}
      />
    </div>
  );
}

ReactDOM.render(<Demo />, document.getElementById("container"));
