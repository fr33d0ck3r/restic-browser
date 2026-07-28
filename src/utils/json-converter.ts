


export function parseJsonSource(source: unknown): Record<string, unknown> {
  if (typeof source === "string") {
    try {
      return JSON.parse(source) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (source && typeof source === "object") {
    return source as Record<string, unknown>;
  }
  return {};
}


export function convertJsonValue<T>(value: unknown, _type: string): T {
  return value as T;
}
