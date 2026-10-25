import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8"));
}

const REQUIRED_KEYS = [
  "appTitle", "partsLabel", "selectedPartLabel", "massLabel", "positionLabel", "heightLabel", "totalMassLabel",
  "frontShareLabel", "rearShareLabel", "cgHeightLabel", "cgPositionLabel", "conceptNote", "resetAction",
  "batteryPartName", "bodyPartName", "frontDrivePartName", "rearDrivePartName", "cabinPartName", "payloadPartName",
  "wheelPartName", "openSableAction", "cameraLabel", "unitsNote",
];

describe("mass ledger copy schema", () => {
  it("mass-keys.json is flat with exactly the required empty leaves", () => {
    const keys = read("mass-keys.json");
    assert.deepEqual(Object.keys(keys).sort(), [...REQUIRED_KEYS].sort());
    for (const [k, v] of Object.entries(keys)) assert.equal(v, "", `schema leaf ${k} must be empty`);
  });

  it("mass-values.json matches the key set with string leaves only", () => {
    const keys = read("mass-keys.json");
    const values = read("mass-values.json");
    assert.deepEqual(Object.keys(values).sort(), Object.keys(keys).sort());
    for (const [k, v] of Object.entries(values)) assert.equal(typeof v, "string", `value ${k} must be a string`);
  });
});
