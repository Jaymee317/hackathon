import "./locationTask";

import { useState } from "react";
import {
  View,
  Text,
  Button,
  StyleSheet,
  Alert
} from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { LOCATION_TASK_NAME } from "./locationTask";

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [pointCount, setPointCount] = useState(0);

  async function startTrip() {
    const foreground =
      await Location.requestForegroundPermissionsAsync();

    if (!foreground.granted) {
      Alert.alert(
        "Permission required",
        "Location permission is needed to record a trip."
      );
      return;
    }

    const background =
      await Location.requestBackgroundPermissionsAsync();

    if (!background.granted) {
      Alert.alert(
        "Background permission required",
        "Allow background location so the trip can continue when the phone is locked."
      );
      return;
    }

    await AsyncStorage.setItem("currentTrip", "[]");

    await Location.startLocationUpdatesAsync(
      LOCATION_TASK_NAME,
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "DriveScore is recording",
          notificationBody: "Your driving trip is being recorded."
        }
      }
    );

    setIsRecording(true);
  }

  async function stopTrip() {
    const registered =
      await TaskManager.isTaskRegisteredAsync(
        LOCATION_TASK_NAME
      );

    if (registered) {
      await Location.stopLocationUpdatesAsync(
        LOCATION_TASK_NAME
      );
    }

    const trip =
      JSON.parse(
        await AsyncStorage.getItem("currentTrip")
      ) || [];

    setPointCount(trip.length);
    setIsRecording(false);

    Alert.alert(
      "Trip saved",
      `${trip.length} GPS points were recorded.`
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DriveScore</Text>

      <Text style={styles.status}>
        {isRecording
          ? "Trip recording is active"
          : "No active trip"}
      </Text>

      {!isRecording ? (
        <Button
          title="Start Trip"
          onPress={startTrip}
        />
      ) : (
        <Button
          title="End Trip"
          onPress={stopTrip}
        />
      )}

      <Text style={styles.points}>
        Last trip points: {pointCount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 20
  },
  status: {
    fontSize: 18,
    marginBottom: 30
  },
  points: {
    marginTop: 25,
    fontSize: 16
  }
});
 