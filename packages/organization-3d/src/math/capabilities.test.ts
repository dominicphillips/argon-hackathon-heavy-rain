import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("capabilities registry", () => {
  it("lists unique capability ids with exports and summaries", () => {
    const path = fileURLToPath(new URL("../capabilities.json", import.meta.url));
    const registry = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(registry.package, "@heavy-rain/organization-3d");
    const ids = registry.capabilities.map((c: { id: string }) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const cap of registry.capabilities) {
      assert.ok(cap.export && cap.summary, `capability ${cap.id} needs export and summary`);
    }
  });
});
