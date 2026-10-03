import { createServer } from "node:http";
import { MongoClient } from "mongodb";
import { validateSampleBatch } from "./validation.js";

const port = Number(process.env.PORT ?? 3000);
const mongoUri =
  process.env.MONGODB_URI ?? "mongodb://localhost:27017/drivescore";
const client = new MongoClient(mongoUri);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(statusCode === 204 ? undefined : JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.statusCode = 400;
    throw error;
  }
}

async function main() {
  await client.connect();
  const database = client.db("drivescore");
  const samplesCollection = database.collection("sensorSamples");

  await Promise.all([
    samplesCollection.createIndex({ sessionId: 1, timestamp: 1 }),
    samplesCollection.createIndex(
      { receivedAt: 1 },
      {
        name: "sensor_samples_expire_after_one_day",
        expireAfterSeconds: 24 * 60 * 60,
      }
    ),
  ]);

  const server = createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    const pathname = (request.url ?? "/").split("?")[0];

    if (request.method === "GET" && pathname === "/health") {
      try {
        await database.command({ ping: 1 });
        sendJson(response, 200, { status: "ok", database: "connected" });
      } catch (error) {
        console.error("MongoDB health check failed:", error);
        sendJson(response, 503, { error: "Database unavailable" });
      }
      return;
    }

    if (
      request.method === "POST" &&
      pathname === "/api/sensor-samples"
    ) {
      try {
        const body = await readJsonBody(request);
        const batch = validateSampleBatch(body);

        if (!batch) {
          sendJson(response, 400, {
            error: "Invalid sensor sample batch",
          });
          return;
        }

        const receivedAt = new Date();
        const result = await samplesCollection.insertMany(
          batch.samples.map((sample) => ({
            sessionId: batch.sessionId,
            timestamp: sample.timestamp,
            acceleration: sample.acceleration,
            rotation: sample.rotation,
            receivedAt,
          }))
        );

        sendJson(response, 201, {
          insertedCount: result.insertedCount,
        });
      } catch (error) {
        const statusCode = error?.statusCode ?? 500;
        if (statusCode === 500) {
          console.error("Failed to store sensor samples:", error);
        }
        sendJson(response, statusCode, {
          error:
            statusCode === 500
              ? "Failed to store sensor samples"
              : error.message,
        });
      }
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`DriveScore API listening on port ${port}`);
  });

  const shutdown = async () => {
    server.close();
    await client.close();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Unable to start DriveScore API:", error);
  process.exitCode = 1;
});
