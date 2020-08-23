export interface Position {
  x: number;
  y: number;
}

export interface Node extends Position {
  id: string;
}

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
}
