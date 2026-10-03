# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

## Live motion monitoring

Tap **Start live monitoring** to read the accelerometer and gyroscope in real
time. Samples are sent in small batches to a local API and saved in MongoDB.
Tap **Stop live monitoring** to stop sensor updates and flush pending samples.
The app does not request physical activity permission or try to detect whether
the user is driving.

### Run MongoDB and the API with Docker

1. Install Docker Desktop and start it.
2. From the project root, start MongoDB and the API:

   ```bash
   docker compose up --build -d
   ```

3. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_URL` for where
   the app is running (PowerShell: `Copy-Item .env.example .env.local`):
   - iOS simulator: `http://localhost:3000`
   - Android emulator: `http://10.0.2.2:3000`
   - Physical phone: `http://<computer-Wi-Fi-IPv4>:3000` (phone and computer
     must be on the same trusted Wi-Fi network). Find the computer's address
     with `ipconfig`; the current development PC address is `10.32.152.67`.
4. Build and start the development app with local HTTP networking enabled:

   ```powershell
   $env:APP_ENV = "development"
   npx expo run:android
   ```

   Use `npx expo run:ios` on macOS for an iOS simulator or device. The
   development-only config allows local HTTP for the API; release builds do
   not enable this setting. After installing the development build, start
   Metro with `npx expo start` and enable live monitoring in the app.
5. Check the API at `http://localhost:3000/health`. MongoDB data persists in
   the `mongodb_data` Docker volume. To stop the containers without deleting
   data, run `docker compose down`.

To inspect recent records:

```bash
docker compose exec mongo mongosh drivescore --eval "db.sensorSamples.find().sort({ receivedAt: -1 }).limit(10).pretty()"
```

MongoDB is not exposed to the phone. The API connects to it over Docker's private network using
`mongodb://mongo:27017/drivescore`; this is a local Docker address, not a
MongoDB Atlas URI. The API accepts unauthenticated sample uploads and is
intended for local development on a trusted network only. Do not expose it to
the public internet.

For a local database GUI such as MongoDB Compass, connect on this computer with
`mongodb://127.0.0.1:27017/drivescore`. Port `27017` is bound to loopback only;
it is not available to other devices on your network. Port `3000` is the HTTP
API and cannot be used as a MongoDB connection address.

The phone app cannot use `localhost` to reach an API running on your computer:
on a physical device, use the computer's LAN IP and allow port 3000 through the
computer's firewall for your private network. The iOS development build also
needs local network access, which is configured by the development config
plugin. Sensor sampling runs only while the app is active. Samples are batched
in memory during the session; if the API is unavailable, uploads are retried
while monitoring continues.

Sensor documents expire 24 hours after the API receives them. MongoDB's TTL
monitor deletes expired documents in the background, so deletion may happen
shortly after the 24-hour mark rather than at the exact second.

If the phone shows `fetch failed`, check `http://<computer-Wi-Fi-IPv4>:3000/health`
in the phone's browser. Both devices must be on the same Wi-Fi, Docker Compose
must be running, and the phone app must use the computer's Wi-Fi IPv4 address,
not `localhost`. Restart Expo after changing `.env.local` so the new URL is
included in the JavaScript bundle. On Windows, set the trusted Wi-Fi network
profile to **Private** and allow inbound TCP port 3000 on that private
network. After changing the development config plugin, rebuild/reinstall the
development app so iOS local-network access and Android cleartext HTTP settings
take effect.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
