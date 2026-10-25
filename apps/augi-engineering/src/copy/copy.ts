import keys from "./keys.json";
import values from "./values.json";

/**
 * Copy lookup. `keys.json` is the schema (empty leaves) owned by the UI build;
 * `values.json` holds Argon-authored strings. Empty values render as visible
 * key-path placeholders until the copy handoff fills them.
 */
type CopyTree = { [key: string]: string | CopyTree };

function lookup(tree: CopyTree, path: string): string | undefined {
  let cursor: string | CopyTree | undefined = tree;
  for (const part of path.split(".")) {
    if (!cursor || typeof cursor === "string") return undefined;
    cursor = cursor[part];
  }
  return typeof cursor === "string" ? cursor : undefined;
}

export function hasCopy(path: string): boolean {
  const v = lookup(values as CopyTree, path);
  return typeof v === "string" && v.length > 0;
}

export function t(path: string): string {
  const v = lookup(values as CopyTree, path);
  if (typeof v === "string" && v.length > 0) return v;
  // Unknown keys and empty values both render as visible placeholders.
  void keys;
  return `[${path}]`;
}
