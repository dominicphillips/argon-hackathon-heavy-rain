import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Tree = { [k: string]: string | Tree };
function read(name: string): Tree {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8"));
}
function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[path] = v;
    else Object.assign(out, flatten(v, path));
  }
  return out;
}

describe("copy schema", () => {
  it("keys.json has only empty leaves and values.json matches its key set", () => {
    const keys = flatten(read("keys.json"));
    const values = flatten(read("values.json"));
    for (const [k, v] of Object.entries(keys)) assert.equal(v, "", `schema leaf ${k} must be empty`);
    assert.deepEqual(Object.keys(values).sort(), Object.keys(keys).sort());
  });
});
