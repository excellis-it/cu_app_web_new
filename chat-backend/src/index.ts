import dotenv from "dotenv";



import express, { Router } from "express";
import cookieParser from "cookie-parser";
import connectDB from "./db";
import { createServer } from "http";
import cors from "cors";
import initializeSocket from "./socket";
import usersRouter from "./routes/users.routes";
import groupRouter from "./routes/group.routes";
import adminRouter from "./routes/admin";
import path, { join } from "path";
import { cleanupOrphanedCalls, reconcileStuckRecordingsOnStartup } from "./app";
import googleRouter from "./routes/google.routes";
import { startScreenRecordingCleanupJob } from "./helpers/screenRecordingCleanup";
import { cleanupOrphanedTempFiles } from "./helpers/screenRecordingProcessor";
import { recoverStaleRecordings } from "./mediasoup/recordingManager";

const port = process.env.PORT || 10018;
const morgan = require("morgan");

// Catch unhandled promise rejections (e.g., mediasoup Channel errors after consumer close)
// to prevent process crashes. Log but don't exit.
process.on("unhandledRejection", (reason: any) => {
  const msg = reason?.message || String(reason);
  // Suppress known mediasoup timing errors that are harmless
  if (msg.includes("Channel request handler") && msg.includes("not found")) {
    console.warn("[process] suppressed mediasoup channel rejection:", msg);
    return;
  }
  console.error("[process] unhandledRejection:", reason);
});

connectDB();

// After MongoDB connection is established, add:
setTimeout(() => {
  cleanupOrphanedCalls()
    .then(() => console.log("Call cleanup completed"))
    .catch(err => console.error("Call cleanup failed:", err));
  // Startup-only: flip recordings stuck in "recording" (from prior crashed
  // process) to "failed" so new recordings can start. Must NOT be invoked
  // from per-request paths — would kill live recordings in this process.
  reconcileStuckRecordingsOnStartup()
    .then(() => console.log("Stuck recording reconciliation completed"))
    .catch(err => console.error("Stuck recording reconciliation failed:", err));
}, 10000);

// Start daily cleanup of expired screen recordings (default: 30 days)
startScreenRecordingCleanupJob();

// Recover stale recording DB records from previous server runs
setTimeout(() => {
  recoverStaleRecordings()
    .then(() => console.log("Stale recording recovery completed"))
    .catch(err => console.error("Stale recording recovery failed:", err));
}, 12000);

// Clean up orphaned temp files from previous server runs
setTimeout(() => {
  cleanupOrphanedTempFiles()
    .then(() => console.log("Orphaned temp file cleanup completed"))
    .catch(err => console.error("Orphaned temp file cleanup failed:", err));
}, 15000);


// initializeSocket();

const app = express();
const corsOptions: any = {
  origin: [
    "http://134.199.242.61:4000",
    "http://134.199.242.61:3000",
    "http://134.199.242.61:3010",
    "http://localhost:5000",
    "http://localhost:5001",
    "http://localhost:6000",
    "http://69.62.84.25:10016",
    "http://69.62.84.25:10017",
    "http://103.121.157.203:10016",
    "http://103.121.157.203:10017",
    "http://134.199.249.149:10016",
    "http://134.199.249.149:10017",
    "http://localhost:10016",
    "http://localhost:10017",
    "http://69.62.84.25:10018",
    "http://103.121.157.203:10018",
    "http://134.199.249.149:10018",
    "https://extalk.excellisit.net",  // Production frontend domain
    "https://extalkapi.excellisit.net", // Production API domain (for Socket.io handshake)
    "https://extalk.excellisit.net/guest-meeting",
    "https://extalk.excellisit.net/guest-meeting/",
    "http://69.62.84.25:10016/guest-meeting",
    "http://69.62.84.25:10016/guest-meeting/",
    "http://103.121.157.203:10016/guest-meeting",
    "http://103.121.157.203:10016/guest-meeting/",
    "http://134.199.249.149:10016/guest-meeting",
    "http://134.199.249.149:10016/guest-meeting/",
    "http://13.51.47.108:10016",
    "http://13.51.47.108:10018",
    "http://13.63.9.45:10016",
    "http://13.63.9.45:10018",
    "http://13.63.9.45:10017",
    "https://api.cu-app.us",
    "https://cu-app.us",

  ],
  methods: "GET,PUT,POST,DELETE,EMIT",
  optionsSuccessStatus: 200,
};
app.use(morgan("dev"));
app.use(cors(corsOptions));
const viewsPath = path.resolve(__dirname, 'views');
console.log('Views Path:', viewsPath); // Debug path
app.set('views', [join(__dirname, './src/views')]);
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, "public")));
const v1Router = Router();

export const httpServer = createServer(app);

httpServer.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
v1Router.use("/users", usersRouter);
v1Router.use("/groups", groupRouter);
v1Router.use("/admin", adminRouter);
v1Router.use("/auth/google", googleRouter);

app.use("/api/v1", v1Router);
app.get("/", (req, res) => {
  res.send("Hello, this is your TypeScript backend!");
});

initializeSocket();

console.log("ENV CHECK:", process.env.MONGO_URI);
console.log("PORT:", process.env.PORT);

console.log("ENV CHECK:", process.env.MONGO_URI);
console.log("MONGO_URI:", process.env.MONGO_URI);
console.log("PORT:", process.env.PORT);
