import { useEffect, useState, useMemo } from "react";
import throttle from "lodash.throttle";

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
  useEffect(() => {
    const capturedType = type;
    const capturedListener = listener;
    document.addEventListener(capturedType, capturedListener);
    return () => {
      document.removeEventListener(capturedType, capturedListener);
    };
  }, [type, listener]);
}

export function useThrottledState<T>(initialValue?: T) {
  const [value, setValue] = useState(initialValue);
  const throttledSetValue = useMemo(() => throttle(setValue, 200), []);
  return [value, throttledSetValue] as [T, typeof setValue];
}
