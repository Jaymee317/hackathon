import test from "node:test";
import assert from "node:assert/strict";
import { validateSampleBatch } from "./validation.js";

const sample = {
  timestamp: 1_760_000_000_000,
  acceleration: { x: 0.1, y: 0.2, z: 0.3 },
  rotation: { x: 0.4, y: 0.5, z: 0.6 },
};

test("validates and normalizes a sensor batch", () => {
  const result = validateSampleBatch({
    sessionId: "test-session",
    samples: [sample],
  });

  assert.equal(result.sessionId, "test-session");
  assert.equal(result.samples.length, 1);
  assert.ok(result.samples[0].timestamp instanceof Date);
});

test("rejects an invalid vector", () => {
  const result = validateSampleBatch({
    sessionId: "test-session",
    samples: [
      {
        ...sample,
        acceleration: { x: 0, y: Number.NaN, z: 1 },
      },
    ],
  });

  assert.equal(result, null);
});

test("rejects timestamps outside the supported date range", () => {
  const result = validateSampleBatch({
    sessionId: "test-session",
    samples: [{ ...sample, timestamp: Number.MAX_VALUE }],
  });

  assert.equal(result, null);
});

test("rejects a batch that exceeds the maximum size", () => {
  const result = validateSampleBatch({
    sessionId: "test-session",
    samples: Array.from({ length: 101 }, () => sample),
  });

  assert.equal(result, null);
});

test("rejects an empty or malformed batch", () => {
  assert.equal(
    validateSampleBatch({ sessionId: "test-session", samples: [] }),
    null
  );
  assert.equal(validateSampleBatch(null), null);
});
