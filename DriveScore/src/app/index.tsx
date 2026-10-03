import { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  Accelerometer,
  Gyroscope,
} from "expo-sensors";

import {
  calculateRisk,
  type RiskResult,
  type SensorSample,
} from "../services/riskEngine";
import {
  checkSensorApi,
  uploadSensorSamples,
} from "../services/sensorApi";

type PendingSample = {
  sessionId: string;
  sample: SensorSample;
};

type ApiStatus = "checking" | "connected" | "unavailable";

const MAX_PENDING_SAMPLES = 1000;

type SensorValues = {
  x: number;
  y: number;
  z: number;
};

const initialSensorValues: SensorValues = {
  x: 0,
  y: 0,
  z: 0,
};

const initialRisk: RiskResult = {
  score: 0,
  level: "low",
  events: [],
};

function formatValue(value: number) {
  return value.toFixed(3);
}

function getMagnitude(values: SensorValues) {
  return Math.sqrt(
    values.x ** 2 +
      values.y ** 2 +
      values.z ** 2
  );
}

export default function HomeScreen() {
  const { width: screenWidth } = useWindowDimensions();

  const [isRecording, setIsRecording] =
    useState(false);

  const [accelerometer, setAccelerometer] =
    useState<SensorValues>(initialSensorValues);

  const [gyroscope, setGyroscope] =
    useState<SensorValues>(initialSensorValues);

  const [risk, setRisk] =
    useState<RiskResult>(initialRisk);

  const [sensorAvailable, setSensorAvailable] =
    useState(false);

  const [apiStatus, setApiStatus] =
    useState<ApiStatus>("checking");

  const [uploadError, setUploadError] =
    useState<string | null>(null);

  const [uploadedSampleCount, setUploadedSampleCount] =
    useState(0);

  const sensorWindow =
    useRef<SensorSample[]>([]);

  const pendingSamples =
    useRef<PendingSample[]>([]);

  const activeSessionId =
    useRef<string | null>(null);

  const uploadInProgress =
    useRef(false);

  const uploadTimer =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const latestAccelerometer =
    useRef<SensorValues>(initialSensorValues);

  const latestGyroscope =
    useRef<SensorValues>(initialSensorValues);

  const accelerometerSubscription =
    useRef<ReturnType<
      typeof Accelerometer.addListener
    > | null>(null);

  const gyroscopeSubscription =
    useRef<ReturnType<
      typeof Gyroscope.addListener
    > | null>(null);

  useEffect(() => {
    async function checkSensors() {
      if (Platform.OS === "web") {
        setSensorAvailable(false);
        return;
      }

      const accelerometerAvailable =
        await Accelerometer.isAvailableAsync();

      const gyroscopeAvailable =
        await Gyroscope.isAvailableAsync();

      setSensorAvailable(
        accelerometerAvailable &&
          gyroscopeAvailable
      );
    }

    checkSensors();
    void checkSensorApi()
      .then(() => setApiStatus("connected"))
      .catch(() => {
        setApiStatus("unavailable");
      });

    return () => {
      stopSensorListeners();
      if (uploadTimer.current) {
        clearInterval(uploadTimer.current);
      }
    };
  }, []);

  function stopSensorListeners() {
    accelerometerSubscription.current?.remove();
    gyroscopeSubscription.current?.remove();

    accelerometerSubscription.current = null;
    gyroscopeSubscription.current = null;
  }

  function clearSensorData() {
    sensorWindow.current = [];
    latestAccelerometer.current = initialSensorValues;
    latestGyroscope.current = initialSensorValues;

    setAccelerometer(initialSensorValues);
    setGyroscope(initialSensorValues);
    setRisk(initialRisk);
  }

  function processSensorData(
    acceleration: SensorValues,
    rotation: SensorValues
  ) {
    const timestamp = Date.now();
    const sample: SensorSample = {
      timestamp,

      // GPS will be added later
      latitude: undefined,
      longitude: undefined,
      speedMps: 0,

      acceleration: {
        x: acceleration.x,
        y: acceleration.y,
        z: acceleration.z,
      },

      rotation: {
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
      },
    };

    const sessionId = activeSessionId.current;
    if (sessionId) {
      if (pendingSamples.current.length >= MAX_PENDING_SAMPLES) {
        stopRecording();
        setUploadError(
          "Upload queue is full. Monitoring stopped to avoid losing more sensor data."
        );
        return;
      }
      pendingSamples.current.push({ sessionId, sample });
    }

    sensorWindow.current.push(sample);

    const fiveSecondsAgo =
      timestamp - 5000;

    sensorWindow.current =
      sensorWindow.current.filter(
        (item) =>
          item.timestamp >= fiveSecondsAgo
      );

    const result = calculateRisk(
      sensorWindow.current
    );

    setRisk(result);
  }

  async function flushSensorSamples() {
    if (
      uploadInProgress.current ||
      pendingSamples.current.length === 0
    ) {
      return;
    }

    uploadInProgress.current = true;
    try {
      while (pendingSamples.current.length > 0) {
        const sessionId = pendingSamples.current[0].sessionId;
        const batch = pendingSamples.current
          .filter((item) => item.sessionId === sessionId)
          .slice(0, 100);
        const insertedCount = await uploadSensorSamples(
          sessionId,
          batch.map((item) => item.sample)
        );

        if (insertedCount !== batch.length) {
          throw new Error(
            `The API stored ${insertedCount} of ${batch.length} sensor samples.`
          );
        }

        pendingSamples.current.splice(0, batch.length);
        setUploadedSampleCount((count) => count + insertedCount);
        setApiStatus("connected");
        setUploadError(null);
      }
    } catch (error) {
      setApiStatus("unavailable");
      setUploadError(
        error instanceof Error
          ? error.message
          : "Unable to upload sensor samples."
      );
    } finally {
      uploadInProgress.current = false;
    }
  }

  function startRecording() {
    if (
      !sensorAvailable ||
      accelerometerSubscription.current ||
      gyroscopeSubscription.current
    ) {
      return;
    }

    clearSensorData();
    activeSessionId.current =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    Accelerometer.setUpdateInterval(250);
    Gyroscope.setUpdateInterval(250);

    accelerometerSubscription.current =
      Accelerometer.addListener((data) => {
        const nextAcceleration = {
          x: data.x,
          y: data.y,
          z: data.z,
        };

        latestAccelerometer.current = nextAcceleration;
        setAccelerometer(nextAcceleration);

        processSensorData(
          nextAcceleration,
          latestGyroscope.current
        );
      });

    gyroscopeSubscription.current =
      Gyroscope.addListener((data) => {
        const nextRotation = {
          x: data.x,
          y: data.y,
          z: data.z,
        };

        latestGyroscope.current = nextRotation;
        setGyroscope(nextRotation);
      });

    uploadTimer.current = setInterval(() => {
      void flushSensorSamples();
    }, 1000);
    setIsRecording(true);
  }

  function stopRecording() {
    stopSensorListeners();
    if (uploadTimer.current) {
      clearInterval(uploadTimer.current);
      uploadTimer.current = null;
    }
    setIsRecording(false);
    void flushSensorSamples();
  }

  const accelerationMagnitude =
    getMagnitude(accelerometer);

  const rotationMagnitude =
    getMagnitude(gyroscope);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>LIVE MOTION MONITOR</Text>
            <Text style={styles.title}>DriveScore</Text>
          </View>
          <View
            style={[
              styles.liveBadge,
              isRecording && styles.liveBadgeActive,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                isRecording && styles.statusDotActive,
              ]}
            />
            <Text
              style={[
                styles.liveBadgeText,
                isRecording && styles.liveBadgeTextActive,
              ]}
            >
              {isRecording ? "LIVE" : "OFF"}
            </Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Real-time accelerometer and gyroscope readings
        </Text>

        {!sensorAvailable && (
          <Text style={styles.error}>
            {Platform.OS === "web"
              ? "Live motion monitoring requires the iOS or Android app."
              : "Required motion sensors are unavailable on this device."}
          </Text>
        )}
        {uploadError && (
          <Text style={styles.error}>{uploadError}</Text>
        )}
        <View style={styles.apiStatusCard}>
          <View
            style={[
              styles.statusDot,
              apiStatus === "connected" && styles.statusDotActive,
            ]}
          />
          <Text style={styles.apiStatusText}>
            {apiStatus === "connected"
              ? `MongoDB connected · ${uploadedSampleCount} samples saved`
              : apiStatus === "checking"
                ? "Connecting to local MongoDB API..."
                : `MongoDB API not connected yet · ${pendingSamples.current.length} samples queued`}
          </Text>
        </View>
        <View style={styles.statusCard}>
          <View style={styles.statusIcon}>
            <Text style={styles.statusIconText}>
              {isRecording ? "LIVE" : "—"}
            </Text>
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusLabel}>MONITOR STATUS</Text>
            <Text style={styles.statusValue}>
              {isRecording ? "Sensors are active" : "Monitoring is off"}
            </Text>
            <Text style={styles.statusHint}>
              {isRecording
                ? "Accelerometer and gyroscope update live"
                : "Start monitoring to view live motion data"}
            </Text>
          </View>
        </View>

        <View style={styles.riskCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.cardEyebrow}>LIVE ANALYSIS</Text>
              <Text style={styles.cardTitle}>Motion score</Text>
            </View>
            <View
              style={[
                styles.riskPill,
                risk.level === "high" && styles.riskPillHigh,
                risk.level === "medium" && styles.riskPillMedium,
              ]}
            >
              <Text
                style={[
                  styles.riskPillText,
                  risk.level === "high" && styles.highRisk,
                  risk.level === "medium" && styles.mediumRisk,
                  risk.level === "low" && styles.lowRisk,
                ]}
              >
                {risk.level.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.scoreLine}>
            <Text
              style={[
                styles.riskScore,
                risk.level === "high" && styles.highRisk,
                risk.level === "medium" && styles.mediumRisk,
                risk.level === "low" && styles.lowRisk,
              ]}
            >
              {risk.score}
            </Text>
            <Text style={styles.scoreMax}>/ 100</Text>
          </View>
          <View
            style={styles.riskTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: risk.score }}
          >
            <View
              style={[
                styles.riskFill,
                risk.level === "high" && styles.riskFillHigh,
                risk.level === "medium" && styles.riskFillMedium,
                { width: `${risk.score}%` },
              ]}
            />
          </View>
          {risk.events.length > 0 ? (
            <View style={styles.events}>
              {risk.events.map((event, index) => (
                <Text
                  key={`${event}-${index}`}
                  style={styles.event}
                >
                  {event}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.noEvents}>
              No risky events detected in the latest readings
            </Text>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.cardEyebrow}>LIVE TELEMETRY</Text>
            <Text style={styles.sectionTitle}>Motion sensors</Text>
          </View>
          <Text style={styles.sampleRate}>4 samples / sec</Text>
        </View>

        <View
          style={[
            styles.sensorGrid,
            screenWidth >= 640
              ? styles.sensorGridWide
              : styles.sensorGridStacked,
          ]}
        >
          <View style={styles.sensorCard}>
            <View style={styles.sensorHeading}>
              <View style={[styles.sensorIcon, styles.accelIcon]}>
                <Text style={styles.sensorIconText}>A</Text>
              </View>
              <View style={styles.sensorLabelGroup}>
                <Text style={styles.sensorTitle}>Accelerometer</Text>
                <Text style={styles.sensorUnit}>g</Text>
              </View>
            </View>
            <View style={styles.axisList}>
              <Text style={styles.axisValue}>X  {formatValue(accelerometer.x)}</Text>
              <Text style={styles.axisValue}>Y  {formatValue(accelerometer.y)}</Text>
              <Text style={styles.axisValue}>Z  {formatValue(accelerometer.z)}</Text>
            </View>
            <View style={styles.sensorFooter}>
              <Text style={styles.sensorFooterLabel}>MAGNITUDE</Text>
              <Text style={styles.sensorMagnitude}>
                {formatValue(accelerationMagnitude)}
              </Text>
            </View>
          </View>
          <View style={styles.sensorCard}>
            <View style={styles.sensorHeading}>
              <View style={[styles.sensorIcon, styles.gyroIcon]}>
                <Text style={styles.sensorIconText}>G</Text>
              </View>
              <View style={styles.sensorLabelGroup}>
                <Text style={styles.sensorTitle}>Gyroscope</Text>
                <Text style={styles.sensorUnit}>rad/s</Text>
              </View>
            </View>
            <View style={styles.axisList}>
              <Text style={styles.axisValue}>X  {formatValue(gyroscope.x)}</Text>
              <Text style={styles.axisValue}>Y  {formatValue(gyroscope.y)}</Text>
              <Text style={styles.axisValue}>Z  {formatValue(gyroscope.z)}</Text>
            </View>
            <View style={styles.sensorFooter}>
              <Text style={styles.sensorFooterLabel}>MAGNITUDE</Text>
              <Text style={styles.sensorMagnitude}>
                {formatValue(rotationMagnitude)}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            isRecording ? styles.stopButton : styles.startButton,
            !sensorAvailable &&
              styles.disabledButton,
          ]}
          onPress={
            isRecording
              ? stopRecording
              : startRecording
          }
          disabled={!sensorAvailable}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>
            {isRecording
              ? "Stop live monitoring"
              : "Start live monitoring"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.footerNote}>
          Sensor samples are saved to your local MongoDB database.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f7fb",
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  title: {
    marginTop: 3,
    fontSize: 30,
    fontWeight: "800",
    color: "#111827",
  },

  eyebrow: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },

  subtitle: {
    marginTop: 5,
    marginBottom: 20,
    color: "#64748b",
    fontSize: 14,
  },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#e2e8f0",
  },

  liveBadgeActive: {
    backgroundColor: "#dcfce7",
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 7,
    backgroundColor: "#94a3b8",
  },

  statusDotActive: {
    backgroundColor: "#16a34a",
  },

  apiStatusCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },

  apiStatusText: {
    flex: 1,
    color: "#475569",
    fontSize: 12,
  },

  liveBadgeText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  liveBadgeTextActive: {
    color: "#15803d",
  },

  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    marginBottom: 18,
    borderRadius: 18,
    backgroundColor: "#111827",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },

  statusIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#263449",
  },

  statusIconText: {
    color: "#93c5fd",
    fontSize: 14,
    fontWeight: "800",
  },

  statusCopy: {
    flex: 1,
    marginLeft: 14,
  },

  statusLabel: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },

  statusValue: {
    marginTop: 4,
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "700",
  },

  statusHint: {
    marginTop: 3,
    color: "#cbd5e1",
    fontSize: 12,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  cardEyebrow: {
    marginBottom: 4,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },

  cardTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
  },

  riskCard: {
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e6ebf2",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },

  riskPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#dcfce7",
  },

  riskPillHigh: {
    backgroundColor: "#fee2e2",
  },

  riskPillMedium: {
    backgroundColor: "#fef3c7",
  },

  riskPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },

  scoreLine: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 12,
  },

  riskScore: {
    fontSize: 42,
    fontWeight: "800",
  },

  scoreMax: {
    marginLeft: 7,
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },

  riskTrack: {
    height: 8,
    overflow: "hidden",
    marginTop: 10,
    borderRadius: 99,
    backgroundColor: "#e9eef5",
  },

  riskFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#22c55e",
  },

  riskFillMedium: {
    backgroundColor: "#f59e0b",
  },

  riskFillHigh: {
    backgroundColor: "#ef4444",
  },

  events: {
    marginTop: 14,
    gap: 7,
  },

  event: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "600",
  },

  noEvents: {
    marginTop: 13,
    color: "#64748b",
    fontSize: 12,
  },

  sectionTitle: {
    color: "#111827",
    fontSize: 19,
    fontWeight: "800",
  },

  sampleRate: {
    paddingBottom: 2,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
  },

  sensorGrid: {
    gap: 12,
    marginBottom: 20,
  },

  sensorGridWide: {
    flexDirection: "row",
  },

  sensorGridStacked: {
    flexDirection: "column",
  },

  sensorCard: {
    flex: 1,
    minWidth: 0,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e6ebf2",
    borderRadius: 16,
    backgroundColor: "#ffffff",
  },

  sensorHeading: {
    flexDirection: "row",
    alignItems: "center",
  },

  sensorLabelGroup: {
    flex: 1,
    minWidth: 0,
  },

  sensorIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    borderRadius: 11,
  },

  accelIcon: {
    backgroundColor: "#dbeafe",
  },

  gyroIcon: {
    backgroundColor: "#ede9fe",
  },

  sensorIconText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },

  sensorTitle: {
    color: "#1e293b",
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 1,
  },

  sensorUnit: {
    marginTop: 2,
    color: "#94a3b8",
    fontSize: 10,
  },

  axisList: {
    marginTop: 14,
    gap: 5,
  },

  axisValue: {
    color: "#334155",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },

  sensorFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 13,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },

  sensorFooterLabel: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
  },

  sensorMagnitude: {
    color: "#1e293b",
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },

  lowRisk: {
    color: "#15803d",
  },

  mediumRisk: {
    color: "#b45309",
  },

  highRisk: {
    color: "#b91c1c",
  },

  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    borderRadius: 15,
    paddingHorizontal: 18,
    paddingVertical: 15,
    shadowColor: "#1d4ed8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.17,
    shadowRadius: 8,
    elevation: 3,
  },

  startButton: {
    backgroundColor: "#2563eb",
  },

  stopButton: {
    backgroundColor: "#dc2626",
  },

  disabledButton: {
    opacity: 0.5,
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  footerNote: {
    marginTop: 13,
    color: "#94a3b8",
    fontSize: 11,
    textAlign: "center",
  },

  error: {
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: "hidden",
    borderRadius: 10,
    backgroundColor: "#fee2e2",
    color: "#dc2626",
    fontSize: 12,
  },
});
