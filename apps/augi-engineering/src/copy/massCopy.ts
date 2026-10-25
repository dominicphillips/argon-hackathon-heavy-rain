import keys from "./mass-keys.json";
import values from "./mass-values.json";

/**
 * Copy lookup for the mass and center-of-gravity ledger. `mass-keys.json` is the
 * flat schema (empty leaves); `mass-values.json` holds Argon-authored strings.
 * Empty or unknown keys render as visible `[key]` placeholders.
 */
export type MassCopyKey = keyof typeof keys;

const table: Record<string, string> = values;

export function tm(key: MassCopyKey): string {
  const v = table[key];
  return typeof v === "string" && v.length > 0 ? v : `[${key}]`;
}
