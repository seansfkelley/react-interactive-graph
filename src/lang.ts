export function assertNonNull(v: unknown, message?: string): asserts v {
  if (v == null) {
    throw new Error(`assertion failure: ${message || "expected non-null value"}`);
  }
}

export function assertNever(v: never): never {
  throw new Error(`assertion failure: expected ${v} to be never`);
}
