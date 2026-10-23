import { test, expect } from "@playwright/test";
import { reviewPredictionCsv, experimentHeader } from "../src/lib/prediction-review";

const index: [string,string][] = [["a","one"],["b","one"],["c","two"],["d","two"]];
test("CSV review accepts quoted UTF-8/BOM/CRLF and reordered IDs", () => {
  expect(reviewPredictionCsv('\uFEFFid,prediction\r\n"d",1\r\n"a",0\r\nb,1e-1\r\nc,.25\r\n',index).valid).toBe(true);
});
test("CSV review explains duplicates, coverage, invalid values and constant eras", () => {
  const bad=reviewPredictionCsv('id,prediction\na,0.2\na,0.2\nx,NaN\nd,1.5\n',index);
  expect(bad.valid).toBe(false);
  expect(bad.duplicates).toBe(1); expect(bad.missing).toBe(2); expect(bad.unknown).toBe(1);
  expect(bad.invalid).toBe(2); expect(bad.constantEras).toBe(1);
  expect(reviewPredictionCsv('id,prediction\na,0.1\nb,0.1\nc,0.5\nd,0.5\n',index).valid).toBe(false);
});
test("CSV review refuses malformed rows, nondecimal values and extra blank rows", () => {
  for(const csv of ['id,wrong\na,0.2\n','id,prediction\na,0x1\n','id,prediction\n"a,0.2\n','id,prediction\na,0.2,extra\n','id,prediction\na,0.2\n\n']) expect(reviewPredictionCsv(csv,index).valid).toBe(false);
});
test("experiment header preserves Spanish characters and bounds metadata", () => {
  const metadata={model_name:"Árbol técnico",parameters:{depth:4},seed:42,note:"validación"};
  expect(JSON.parse(Buffer.from(experimentHeader(metadata),"base64").toString("utf8"))).toEqual(metadata);
  expect(()=>experimentHeader({note:"a".repeat(5000)})).toThrow(/4 KB/);
});
