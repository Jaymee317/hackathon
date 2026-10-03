export type SensorSample = {
  timestamp: number;
  latitude?: number;
  longitude?: number;
  speedMps?: number;
  acceleration: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    x: number;
    y: number;
    z: number;
  };
};

export type RiskResult = {
  score: number;
  level: "low" | "medium" | "high";
  events: string[];
};

function magnitude(x: number, y: number, z: number) {
  return Math.sqrt(x * x + y * y + z * z);
}

export function calculateRisk(
  samples: SensorSample[]
): RiskResult {
  if (samples.length === 0) {
    return {
      score: 0,
      level: "low",
      events: [],
    };
  }

  let score = 0;
  const events: string[] = [];

  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];

    const previousSpeed = previous.speedMps ?? 0;
    const currentSpeed = current.speedMps ?? 0;

    const speedChange = currentSpeed - previousSpeed;

    // Approximate hard acceleration
    if (speedChange > 2.5) {
      score += 8;
      events.push("Rapid acceleration");
    }

    // Approximate hard braking
    if (speedChange < -3.0) {
      score += 12;
      events.push("Hard braking");
    }

    const rotationMagnitude = magnitude(
      current.rotation.x,
      current.rotation.y,
      current.rotation.z
    );

    // Initial sharp-turn heuristic
    if (rotationMagnitude > 2.5) {
      score += 7;
      events.push("Sharp movement");
    }

    const accelerationMagnitude = magnitude(
      current.acceleration.x,
      current.acceleration.y,
      current.acceleration.z
    );

    // Large impact-like movement
    if (accelerationMagnitude > 3.0) {
      score += 20;
      events.push("Large impact-like movement");
    }
  }

  const finalScore = Math.min(score, 100);

  let level: RiskResult["level"] = "low";

  if (finalScore >= 60) {
    level = "high";
  } else if (finalScore >= 30) {
    level = "medium";
  }

  return {
    score: finalScore,
    level,
    events: [...new Set(events)],
  };
}
