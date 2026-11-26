/**
 * Starts the full Sunmarke Lab Booking demo site on this computer only (127.0.0.1)
 * and opens it in the default browser. Data is kept in the "data" folder next to
 * this file. Nothing is sent anywhere; sign-in, calendar and Teams are simulated.
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { exec } = require("node:child_process");

const root = __dirname;
const port = process.env.PORT || "3210";
// The browser goes to "localhost" because that is the name Next.js uses in its redirects;
// the server still only listens on this computer (127.0.0.1).
const url = `http://localhost:${port}/`;
const probe = `http://127.0.0.1:${port}/signin`;
const dataDir = path.join(root, "data");

if (process.argv.includes("--reset")) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log("Demo data cleared. It starts fresh next time.");
  process.exit(0);
}

function openBrowser() {
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}
function ping(cb) {
  const req = http.get(probe, (res) => { res.resume(); cb(true); });
  req.on("error", () => cb(false));
  req.setTimeout(1500, () => { req.destroy(); cb(false); });
}

ping((up) => {
  if (up) {
    console.log(`The demo is already running. Opening ${url}`);
    openBrowser();
    setTimeout(() => process.exit(0), 500);
    return;
  }
  Object.assign(process.env, { NODE_ENV: "production", PORT: port, HOSTNAME: "127.0.0.1", DATA_DIR: dataDir, COOKIE_SECURE: "0", NEXT_TELEMETRY_DISABLED: "1" });
  fs.mkdirSync(dataDir, { recursive: true });
  console.log("");
  console.log("  Sunmarke Lab Booking demo");
  console.log("  -------------------------");
  console.log(`  Starting at ${url}`);
  console.log("  Keep this window open while you use the demo. Close it to stop.");
  console.log("");
  require(path.join(root, "app", "apps", "web", "server.js"));
  const started = Date.now();
  const wait = () => ping((ok) => {
    if (ok) {
      console.log("  Ready. Opening your browser. Use the demo accounts on the sign-in page.");
      openBrowser();
    } else if (Date.now() - started < 60_000) setTimeout(wait, 700);
    else console.log(`  Still starting. Open ${url} in your browser in a moment.`);
  });
  setTimeout(wait, 800);
});
