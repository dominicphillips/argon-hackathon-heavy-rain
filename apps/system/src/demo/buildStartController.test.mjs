import { test } from "node:test";
import assert from "node:assert/strict";
import { BuildStartController, buildStartLabel, DEFAULT_BUILD_MODE } from "./buildStartController.ts";
import liveCopy from "../copy/live.json" with { type: "json" };

function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject}; }
const request = () => ({
  idempotency_key: "marcus-test-dealpulse",
  requested_by: { persona_id: "marcus", name: "Marcus Vance", role: "VP, Deal Sourcing & Screening" },
  workflow: { title: "Pre-call scramble", summary: "Seven manual steps per call.", tools: ["Outlook"], weekly_hours_saved: 9.2 },
  app: { name: "DealPulse AutoBrief", purpose: "Pre-call brief and post-call recap.", features: ["Brief"], assumptions: [] },
});
function fixture(start) {
  const calls = [];
  const controller = new BuildStartController({
    request,
    start: async (payload) => { calls.push(payload); return start ? start(payload) : { runId: "run_live_01", status: "queued", model: "gemini-3.8-flash" }; },
  });
  return { controller, calls };
}
const label = (controller) => buildStartLabel(controller.getState().mode, liveCopy.buildMode);

test("defaults to Flash and labels the Start button for it", () => {
  const f = fixture();
  assert.equal(DEFAULT_BUILD_MODE, "flash");
  assert.equal(f.controller.getState().mode, "flash");
  assert.equal(label(f.controller), "Start with Flash");
  assert.equal(f.controller.getState().error, null);
  assert.equal(f.calls.length, 0);
});

test("choosing Argon relabels Start and sends nothing", () => {
  const f = fixture();
  let notified = 0;
  f.controller.subscribe(() => { notified += 1; });
  f.controller.selectMode("argon");
  assert.equal(f.controller.getState().mode, "argon");
  assert.equal(label(f.controller), "Start with Argon");
  assert.equal(notified, 1);
  assert.equal(f.calls.length, 0);
});

test("Start sends the Marcus request with the explicit build mode", async () => {
  const f = fixture();
  const flash = await f.controller.start();
  assert.equal(flash.status, "queued");
  assert.equal(f.calls[0].build_mode, "flash");
  assert.equal(f.calls[0].idempotency_key, "marcus-test-dealpulse");
  assert.equal(f.calls[0].requested_by.persona_id, "marcus");
  f.controller.selectMode("argon");
  await f.controller.start();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].build_mode, "argon");
});

test("a pending start blocks a second request and mode changes until the server answers", async () => {
  const pending = deferred();
  const f = fixture(() => pending.promise);
  const first = f.controller.start();
  assert.equal(f.controller.getState().starting, true);
  const second = await f.controller.start();
  assert.equal(second, null);
  f.controller.selectMode("argon");
  assert.equal(f.controller.getState().mode, "flash");
  assert.equal(f.calls.length, 1);
  pending.resolve({ runId: "run_live_01", status: "queued", model: "gemini-3.8-flash" });
  const accepted = await first;
  assert.equal(accepted.runId, "run_live_01");
  assert.equal(f.controller.getState().starting, false);
  f.controller.selectMode("argon");
  assert.equal(f.controller.getState().mode, "argon");
});

test("a rejected start keeps the chosen mode, shows the error, and clears it on the next attempt", async () => {
  const pending = deferred();
  let attempts = 0;
  const f = fixture(() => { attempts += 1; if (attempts === 1) throw new Error("503 Service Unavailable: live builder disabled"); return pending.promise; });
  f.controller.selectMode("argon");
  assert.equal(await f.controller.start(), null);
  assert.equal(f.controller.getState().mode, "argon");
  assert.equal(label(f.controller), "Start with Argon");
  assert.equal(f.controller.getState().starting, false);
  assert.equal(f.controller.getState().error, "503 Service Unavailable: live builder disabled");
  const retry = f.controller.start();
  assert.equal(f.controller.getState().error, null);
  assert.equal(f.controller.getState().starting, true);
  pending.resolve({ runId: "run_live_02", status: "queued", model: "gemini-4-argon" });
  assert.equal((await retry).runId, "run_live_02");
  assert.equal(f.controller.getState().starting, false);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].build_mode, "argon");
});
