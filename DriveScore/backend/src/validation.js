export const MAX_BATCH_SIZE = 100;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isVector(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z)
  );
}

export function validateSampleBatch(body) {
  if (
    body === null ||
    typeof body !== "object" ||
    typeof body.sessionId !== "string" ||
    body.sessionId.length < 1 ||
    body.sessionId.length > 100 ||
    !Array.isArray(body.samples) ||
    body.samples.length < 1 ||
    body.samples.length > MAX_BATCH_SIZE
  ) {
    return null;
  }

  const samples = body.samples;
  const valid = samples.every(
    (sample) =>
      sample !== null &&
      typeof sample === "object" &&
      isFiniteNumber(sample.timestamp) &&
      sample.timestamp > 0 &&
      Number.isFinite(new Date(sample.timestamp).getTime()) &&
      isVector(sample.acceleration) &&
      isVector(sample.rotation)
  );

  if (!valid) {
    return null;
  }

  return {
    sessionId: body.sessionId,
    samples: samples.map((sample) => ({
      timestamp: new Date(sample.timestamp),
      acceleration: sample.acceleration,
      rotation: sample.rotation,
    })),
  };
}
