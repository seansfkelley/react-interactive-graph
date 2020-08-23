import * as React from "react";

// export function useAssertConstant<T>(value: T, message?: string) {
//   const { current: initialValue } = React.useRef(value);
//   if (value !== initialValue) {
//     throw new Error(
//       message || `expected value ${initialValue} to stay constant; changed to ${value}`,
//     );
//   }
// }

export function useDocumentEvent<K extends keyof DocumentEventMap>(
  type: K,
  listener: (this: Document, ev: DocumentEventMap[K]) => unknown,
) {
  React.useEffect(() => {
    const capturedType = type;
    const capturedListener = listener;
    document.addEventListener(capturedType, capturedListener);
    return () => {
      document.removeEventListener(capturedType, capturedListener);
    };
  }, [type, listener]);
}
