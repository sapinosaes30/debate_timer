# Asian Parliamentary Debate Timer — Render deployment

A Node.js + Express + Socket.IO website with a laptop controller and synchronized TV/projector display.

## Deploy to Render

This project includes a `render.yaml` Blueprint file. Render can use it to configure the service automatically.

### 1. Put the project on GitHub

Render deploys this project from a Git repository.

1. Download and extract `asian-parliamentary-timer-render.zip`.
2. Sign in to [GitHub](https://github.com/) and create a **New repository**.
3. Give it a name such as `asian-parliamentary-timer`.
4. Upload the extracted project files and folders to the repository's root. Make sure `server.js`, `package.json`, `render.yaml`, `README.md`, and the `public` folder are at the repository root—not inside an extra nested project folder.
5. Commit the files to the repository.

### 2. Create the Render service

1. Sign in to [Render](https://render.com/).
2. Open the dashboard and choose **New** → **Blueprint** (or **New Web Service** if you prefer manual setup).
3. Connect the GitHub repository you just created.
4. If you choose Blueprint, Render reads `render.yaml` and proposes the web service settings.
5. Confirm and create the service. If asked for settings manually, use:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Health check path:** `/health`
6. Wait for the first deployment to finish. The Render dashboard will show the public `onrender.com` URL.

The service binds to `0.0.0.0` and uses Render's assigned `PORT` environment variable automatically. Socket.IO uses the same HTTP server and supports the real-time controller/display connection.

## Open the two views

Replace `YOUR-SERVICE.onrender.com` with the URL shown in your Render dashboard. Use the same room code on both devices.

- Controller: `https://YOUR-SERVICE.onrender.com/?room=ROUND1`
- TV / projector: `https://YOUR-SERVICE.onrender.com/display?room=ROUND1`

For another independent debate, use a different room code, such as `ROUND2`.

## Features

- Separate laptop controller and TV/projector display
- Real-time synchronization with Socket.IO room codes
- Correct eight-speaker AP order: PM, LO, DPM, DLO, GW, OW, Opposition Reply, Government Reply
- Five presets plus custom substantive and reply durations
- Configurable grace period after the allotted speech time
- Automatic POI availability during substantive speeches only, after minute one and before the final minute
- Visual timing states and progress indicator
- Controller-side audible signals

## Timing and audio notes

The included presets use the following speech times:

| Format | Substantive | Reply |
|---|---:|---:|
| Preliminary (standard) | 6 min | 3 min |
| Preliminary (short) | 5 min | 2 min |
| Quarterfinals / Semifinals | 7 min | 3 min |
| Grand Final | 7 min | 4 min |
| Extended Grand Final | 8 min | 4 min |

The default grace period is 60 seconds and can be changed in the controller. Confirm the exact grace convention with the tournament adjudication team.

Audible markers are played in the controller browser. Browsers may require a user gesture before audio can play, so click Start on the controller and ensure the tab is not muted.

## Render notes

- Render's free web services may spin down after inactivity. The first visit after a period of inactivity can take a little time while the service starts.
- The server keeps active room state in memory. Restarting or redeploying the service clears active timers and room state. Do not redeploy during a debate round.
- This project is designed as a single web service instance. Do not enable multiple instances or horizontal scaling without adding shared state (for example Redis); otherwise different instances could hold different room states.
- Both devices need internet access to reach the Render service. They do not have to be on the same Wi-Fi network.
- Test the controller, TV display, network, and audio setup before using it in a real competition.

## Troubleshooting

- **TV does not update:** verify that both URLs use the exact same room code and the service is live.
- **Connection keeps dropping:** check the Render Events/Logs page and refresh both views after the service is live.
- **No sound:** click Start on the controller, check browser sound permissions, and make sure Audio signals is enabled.
- **Wrong speech time:** pause, apply the intended preset or custom durations, select the correct speaker, reset, and start again.

## Local testing (optional)

Install Node.js 18 or newer, then run:

```bash
npm install
npm start
```

Open `http://localhost:3000/` for the controller and `http://localhost:3000/display?room=ROUND1` for the display.
