// from https://github.com/Microsoft/TypeScript/pull/21316, ctrl-f FunctionPropertyNames
type PropertyNamesOfType<T, U> = Extract<
  { [K in keyof T]: T[K] extends U ? K : never }[keyof T],
  string
>;

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

export function keyBy<T extends object, K extends PropertyNamesOfType<T, string>>(
  objects: T[],
  key: K,
): Record<string, T> {
  const keyed: Record<string, T> = {};
  objects.forEach((o) => {
    keyed[(o[key] as unknown) as string] = o;
  });
  return keyed;
}

export function objectEntries<T>(o: Record<string, T>): [string, T][] {
  return Object.entries(o);
}

export function objectValues<T>(o: Record<string, T>): T[] {
  return Object.values(o);
}
