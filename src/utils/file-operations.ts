


export function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }
  let normalized = path.replace(/\\/g, "/");
  
  while (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}


export function getParentPath(path: string): string | undefined {
  const normalized = normalizePath(path);
  if (normalized === "/" || normalized === "") {
    return undefined;
  }
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) {
    return "/";
  }
  return normalized.substring(0, lastSlash) || "/";
}


export function getFileName(path: string): string {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return normalized;
  }
  return normalized.substring(lastSlash + 1) || "/";
}


export function joinPath(...segments: string[]): string {
  const parts = segments
    .map((s) => s.replace(/\\/g, "/").replace(/\/$/, ""))
    .filter((s) => s.length > 0);
  const joined = parts.join("/");
  
  if (!joined.startsWith("/")) {
    return "/" + joined;
  }
  return joined || "/";
}
