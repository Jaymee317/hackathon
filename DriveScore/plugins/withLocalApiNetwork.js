const {
  withAndroidManifest,
  withInfoPlist,
} = require("@expo/config-plugins");

module.exports = function withLocalApiNetwork(config) {
  if (process.env.APP_ENV !== "development") {
    return config;
  }

  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error("Android application manifest entry is missing.");
    }

    application.$["android:usesCleartextTraffic"] = "true";
    return modConfig;
  });

  return withInfoPlist(config, (modConfig) => {
    const currentSettings =
      modConfig.modResults.NSAppTransportSecurity;
    modConfig.modResults.NSAppTransportSecurity = {
      ...(typeof currentSettings === "object" && currentSettings
        ? currentSettings
        : {}),
      NSAllowsLocalNetworking: true,
    };
    modConfig.modResults.NSLocalNetworkUsageDescription =
      "DriveScore connects to your computer's local sensor API to save motion samples to MongoDB.";
    return modConfig;
  });
};
