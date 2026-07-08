#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  getBunFailCounts,
  hasBunRunSummary,
  shouldNormalizeBunStatus99,
} from "./test-cloud-run-helpers.mjs";

const greenOutput = `
 500 pass
 0 fail
 1257 expect() calls
Ran 501 tests across 80 files. [44.97s]
`;

assert.deepEqual(getBunFailCounts(greenOutput), [0]);
assert.equal(hasBunRunSummary(greenOutput), true);
assert.equal(
  shouldNormalizeBunStatus99({
    status: 99,
    signal: null,
    output: greenOutput,
  }),
  true,
);

assert.equal(
  shouldNormalizeBunStatus99({
    status: 99,
    signal: null,
    output: greenOutput.replace(" 0 fail", " 1 fail"),
  }),
  false,
);

assert.equal(
  shouldNormalizeBunStatus99({
    status: 1,
    signal: null,
    output: greenOutput,
  }),
  false,
);

assert.equal(
  shouldNormalizeBunStatus99({
    status: 99,
    signal: "SIGTERM",
    output: greenOutput,
  }),
  false,
);

assert.equal(
  shouldNormalizeBunStatus99({
    status: 99,
    signal: null,
    output: " 0 fail\n",
  }),
  false,
);

console.log("[test-cloud-run-helpers] self-test passed");
