import * as React from "react";
import { useDocumentEvent } from "./hooks";
import type { Node, NodeComponentProps } from "./types";

interface ScreenPosition {
  screenX: number;
  screenY: number;
}

// TODO: And another one of these but for edge creation.
export interface Props<N extends Node, X> {
  nodeId: string;
  node: N;
  nodeWrapperComponent: React.ComponentType<{ id: string }>;
  nodeComponent: React.ComponentType<NodeComponentProps<N> & X>;
  startPosition: ScreenPosition;
  onDragFinish: (e: MouseEvent) => void;
  scale: number;
  extraProps: X;
}

export function DraggingSubgraph<N extends Node, X>(props: Props<N, X>) {
  const { onDragFinish } = props;
  const [lastPosition, setLastPosition] = React.useState<ScreenPosition>(props.startPosition);

  const onMouseMoveDocument = React.useCallback((e: MouseEvent) => {
    setLastPosition({ screenX: e.screenX, screenY: e.screenY });
  }, []);

  useDocumentEvent("mousemove", onMouseMoveDocument);

  const onMouseUpDocument = React.useCallback(
    (e: MouseEvent) => {
      onDragFinish(e);
    },
    [onDragFinish],
  );

  useDocumentEvent("mouseup", onMouseUpDocument);

  const transformedNode = {
    ...props.node,
    x: (lastPosition.screenX - props.startPosition.screenX) / props.scale + props.node.x,
    y: (lastPosition.screenY - props.startPosition.screenY) / props.scale + props.node.y,
  };

  return (
    <>
      <props.nodeWrapperComponent id={props.nodeId}>
        <props.nodeComponent node={transformedNode} nodeId={props.nodeId} {...props.extraProps} />
      </props.nodeWrapperComponent>
    </>
  );
}
