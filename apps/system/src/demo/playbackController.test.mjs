import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaybackController, DEMO_STEPS } from "./playbackController.ts";

function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject}; }
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };
function fixture(execute) {
  const scheduled = new Map(); let timerId=0;
  const calls=[], results=[];
  const controller=new PlaybackController({
    orgId:"augi",
    execute:async(step,org,signal)=>{calls.push({step,org,signal}); return execute ? execute(step,org,signal) : {step};},
    onResult:(snapshot,step,org)=>results.push({snapshot,step,org}),
    clock:{setTimeout:(fn)=>{scheduled.set(++timerId,fn);return timerId;},clearTimeout:(id)=>scheduled.delete(id)},
  });
  const tick=async()=>{const entry=scheduled.entries().next().value; assert.ok(entry,"expected a scheduled step"); scheduled.delete(entry[0]);entry[1]();await settle();};
  return {controller,calls,results,scheduled,tick};
}

test("plays confirmed steps in order and stops at review without approving anything",async()=>{
  const f=fixture(); f.controller.play(); await settle();
  for(let i=1;i<DEMO_STEPS.length;i++)await f.tick();
  assert.deepEqual(f.calls.map(x=>x.step),["ingest","review","build","assemble","check","ready"]);
  assert.ok(f.calls.every(x=>x.org==="augi"));
  assert.equal(f.controller.getState().complete,true);
  assert.equal(f.controller.getState().playing,false);
  assert.equal(f.scheduled.size,0);
  f.controller.play();f.controller.next();await settle();assert.equal(f.calls.length,6);
});

test("does not overlap duplicate play/next requests or schedule before a response",async()=>{
  const pending=deferred();const f=fixture(()=>pending.promise);
  f.controller.play();f.controller.play();f.controller.next();
  assert.equal(f.calls.length,1); assert.equal(f.scheduled.size,0); assert.equal(f.controller.getState().completedSteps,0);
  pending.resolve({confirmed:true});await settle();
  assert.equal(f.controller.getState().completedSteps,1);
  assert.equal(f.results.length,1);assert.equal(f.scheduled.size,0);
});

test("pause cancels future timing but preserves an accepted in-flight result",async()=>{
  const pending=deferred();const f=fixture(()=>pending.promise);
  f.controller.play();f.controller.pause();pending.resolve({stage:"stage1"});await settle();
  assert.equal(f.results.length,1);assert.equal(f.controller.getState().busy,false);assert.equal(f.controller.getState().playing,false);assert.equal(f.scheduled.size,0);
});

test("pause between steps prevents later mutations",async()=>{
  const f=fixture();f.controller.play();await settle();assert.equal(f.scheduled.size,1);
  f.controller.pause();assert.equal(f.scheduled.size,0);assert.equal(f.calls.length,1);
  f.controller.next();await settle();assert.equal(f.calls.length,2);assert.equal(f.scheduled.size,0);
});

test("request failure stops playback and never advances optimistic progress",async()=>{
  const f=fixture(async()=>{throw new Error("backend rejected request")});f.controller.play();await settle();
  assert.equal(f.controller.getState().completedSteps,0);assert.equal(f.controller.getState().playing,false);assert.equal(f.controller.getState().busy,false);
  assert.equal(f.controller.getState().error,"backend rejected request");assert.equal(f.results.length,0);assert.equal(f.scheduled.size,0);
});

test("disposal aborts reads and suppresses late org snapshots",async()=>{
  const pending=deferred();const f=fixture(()=>pending.promise);f.controller.play();const signal=f.calls[0].signal;
  f.controller.dispose();assert.equal(signal.aborted,true);pending.resolve({orgId:"augi"});await settle();
  assert.equal(f.results.length,0);assert.equal(f.controller.getState().completedSteps,0);assert.equal(f.scheduled.size,0);
  f.controller.play();assert.equal(f.calls.length,1);
});

test("org replacement never leaks old requests into the new controller",async()=>{
  const pending=deferred();const old=fixture(()=>pending.promise);old.controller.play();old.controller.dispose();
  const next=fixture();next.controller.play();await settle();pending.resolve({old:true});await settle();
  assert.equal(old.results.length,0);assert.equal(next.results.length,1);
});

test("external work and disconnected mode block playback and clear the timer",async()=>{
  const f=fixture();f.controller.setAvailability(false,false);f.controller.play();f.controller.next();assert.equal(f.calls.length,0);
  f.controller.setAvailability(true,false);f.controller.play();await settle();f.controller.setAvailability(true,true);
  assert.equal(f.scheduled.size,0);f.controller.next();await settle();assert.equal(f.calls.length,1);
});

test("reset is local-only and cannot race an accepted mutation",async()=>{
  const pending=deferred();const f=fixture(()=>pending.promise);f.controller.play();f.controller.reset();assert.equal(f.controller.getState().busy,true);
  pending.resolve({ok:true});await settle();f.controller.pause();f.controller.reset();
  assert.equal(f.calls.length,1);assert.equal(f.controller.getState().completedSteps,0);assert.equal(f.controller.getState().complete,false);
});

test("Strict Mode effect disposal/reactivation can still start a fresh command",async()=>{
  const f=fixture();f.controller.dispose();f.controller.activate();f.controller.play();await settle();
  assert.equal(f.results.length,1);assert.equal(f.controller.getState().completedSteps,1);
});
