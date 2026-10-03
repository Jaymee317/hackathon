import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const LOCATION_TASK_NAME = "drivescore-location-task";

TaskManager.defineTask(
  LOCATION_TASK_NAME,
  async ({ data, error }) => {
    if (error) {
      console.log("Location error:", error.message);
      return;
    }

    if (!data?.locations) {
      return;
    }

    const existingData =
      JSON.parse(
        await AsyncStorage.getItem("currentTrip")
      ) || [];

    const newLocations = data.locations.map((item) => ({
      latitude: item.coords.latitude,
      longitude: item.coords.longitude,
      speed: item.coords.speed,
      accuracy: item.coords.accuracy,
      heading: item.coords.heading,
      timestamp: item.timestamp
    }));

    await AsyncStorage.setItem(
      "currentTrip",
      JSON.stringify([...existingData, ...newLocations])
    );
  }
);
