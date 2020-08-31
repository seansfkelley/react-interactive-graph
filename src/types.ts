export interface Position {
  x: number;
  y: number;
}

export interface Node extends Position {}

export interface Edge {
  sourceId: string;
  targetId: string;
}

export interface NodeComponentProps<N extends Node = Node> {
  node: N;
  nodeId: string;
}

export interface EdgeComponentProps<N extends Node = Node, E extends Edge = Edge> {
  edge: E;
  edgeId: string;
  source: N;
  target: N;
}

export interface IncompleteEdgeComponentProps<N extends Node = Node> {
  source: N;
  sourceId: string;
  position: Position;
  target?: N;
  targetId?: string;
}

export interface NodeEventDetails<N extends Node = Node> {
  node: N;
  id: string;
  position: Position;
}

export interface EdgeEventDetails<N extends Node = Node, E extends Edge = Edge> {
  edge: E;
  id: string;
  source: N;
  target: N;
  position: Position;
}

export interface CreateEdgeEventDetails<N extends Node = Node> {
  source: N;
  sourceId: string;
  target: N;
  targetId: string;
}
