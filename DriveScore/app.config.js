const { expo } = require("./app.json");

module.exports = {
  ...expo,
  plugins: [
    ...expo.plugins,
    ...(process.env.APP_ENV === "development"
      ? ["./plugins/withLocalApiNetwork"]
      : []),
  ],
};
