// from https://github.com/Microsoft/TypeScript/pull/21316, ctrl-f FunctionPropertyNames
type PropertyNamesOfType<T, U> = Extract<
  { [K in keyof T]: T[K] extends U ? K : never }[keyof T],
  string
>;

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
