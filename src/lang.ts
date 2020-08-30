export function assertEqual(v1: unknown, v2: unknown, message?: string) {
  if (v1 !== v2) {
    throw new Error(`assertion failure: ${message || `expected ${v1} to equal ${v2}`}`);
  }
}

export function assertNonNull(v: unknown, message?: string): asserts v {
  if (v == null) {
    throw new Error(`assertion failure: ${message || "expected non-null value"}`);
  }
}

export function assertNever(v: never): never {
  throw new Error(`assertion failure: expected ${v} to be never`);
}

export function objectEntries<T>(o: Record<string, T>): [string, T][] {
  return Object.entries(o);
}

export function objectValues<T>(o: Record<string, T>): T[] {
  return Object.values(o);
}

export function omitBy<T>(
  v: Record<string, T>,
  iterator: (k: string, v: T) => boolean,
): Record<string, T> {
  const copy: Record<string, T> = {};
  objectEntries(v).forEach(([k, v]) => {
    if (!iterator(k, v)) {
      copy[k] = v;
    }
  });
  return copy;
}

export function mapValues<T>(
  v: Record<string, T>,
  iterator: (k: string, v: T) => T,
): Record<string, T> {
  const copy: Record<string, T> = {};
  objectEntries(v).forEach(([k, v]) => {
    copy[k] = iterator(k, v);
  });
  return copy;
}
