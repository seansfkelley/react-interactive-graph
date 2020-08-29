export interface Position {
  x: number;
  y: number;
}

export interface Node extends Position {
  id: string;
  width: number;
  height: number;
}

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
}
