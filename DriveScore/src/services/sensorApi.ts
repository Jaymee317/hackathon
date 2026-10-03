import type { SensorSample } from "./riskEngine";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ||
  "http://localhost:3000";

async function fetchSensorApi(
  path: string,
  options?: RequestInit
): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, options);
  } catch (error) {
    throw new Error(
      `Could not reach the sensor API at ${API_BASE_URL}. Make sure Docker is running and the phone is on the same Wi-Fi as this computer.`,
      { cause: error }
    );
  }
}

export async function checkSensorApi(): Promise<void> {
  const response = await fetchSensorApi("/health");
  if (!response.ok) {
    throw new Error(`Sensor API health check failed (${response.status})`);
  }
}

export async function uploadSensorSamples(
  sessionId: string,
  samples: SensorSample[]
): Promise<number> {
  const response = await fetchSensorApi("/api/sensor-samples", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, samples }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Sensor upload failed (${response.status})${
        responseBody ? `: ${responseBody}` : ""
      }`
    );
  }

  const result: unknown = await response.json();
  if (
    result === null ||
    typeof result !== "object" ||
    !("insertedCount" in result) ||
    typeof result.insertedCount !== "number"
  ) {
    throw new Error("Sensor API returned an invalid upload response");
  }

  return result.insertedCount;
}
