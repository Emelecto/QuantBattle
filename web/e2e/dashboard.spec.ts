import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("analytics accepts supported events and rejects invalid payloads", async ({ request }) => {
  const accepted = await request.post("/api/analytics/event", {data: {event: "tour_started"}});
  expect(accepted.status()).toBe(200);
  expect(await accepted.json()).toEqual({ok: true});
  const rejected = await request.post("/api/analytics/event", {data: {event: "not-a-supported-event"}});
  expect(rejected.status()).toBe(400);
  const funnel = await request.get("/api/analytics/funnel");
  expect(funnel.status()).toBe(200);
  expect((await funnel.json()).steps).toHaveLength(5);
});

test("strategy cache isolates accounts and tolerates unavailable storage", () => {
  const source = readFileSync("src/lib/runs.ts", "utf8");
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const data = new Map([
    ["ql_runs", JSON.stringify([{id:"legacy-unknown-owner"}])],
    ["ql_runs:alice", JSON.stringify([{id:"private-alice"}])],
    ["ql_runs:bob", JSON.stringify([{id:"private-bob"}])],
  ]);
  const exports: Record<string, (arg?: string) => {id:string}[]> = {};
  const window = {localStorage:{getItem:(key: string)=>data.get(key) ?? null}};
  vm.runInNewContext(compiled, {exports,window});
  expect(exports.getRuns("alice").map(run=>run.id)).toEqual(["private-alice"]);
  expect(exports.getRuns("bob").map(run=>run.id)).toEqual(["private-bob"]);
  expect(exports.getRuns()).toEqual([]);
  window.localStorage.getItem=()=>{throw new Error("Storage blocked");};
  expect(exports.getRuns("alice")).toEqual([]);
});
