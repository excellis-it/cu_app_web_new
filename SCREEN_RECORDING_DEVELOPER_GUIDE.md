# Call Recording — Developer Guide (Web + Mobile)

## Overview

Call recording allows **SuperAdmin** and **Admin** users to record a call (all participants' audio + video) during a live call. The recording happens **entirely on the server** using mediasoup — no client-side screen capture or file uploads needed. Both web and mobile apps use the exact same flow: just emit socket events.

**All participants' video feeds are recorded** and composited into a single grid layout (side-by-side for 2 users, 2x2 for 3-4 users, etc.). All audio streams are mixed together. The final output is a single video showing everyone in the call.

After stopping, the server transcodes the recording to MP4, uploads to S3 cloud, and posts a playable video message in the group chat visible to all members. Recordings are automatically deleted after a configurable number of days.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  CLIENT (Web & Mobile — identical)            │
│                                                              │
│  Admin clicks "Record":                                      │
│    socket.emit("BE-start-screen-recording", {roomId, userId})│
│                                                              │
│  Admin clicks "Stop":                                        │
│    socket.emit("BE-stop-screen-recording", {roomId, userId}) │
│                                                              │
│  All participants listen for:                                │
│    "FE-screen-recording-started"  → show ● REC 00:00 timer  │
│    "FE-screen-recording-stopped"  → hide timer               │
│    "message"                      → video appears in chat    │
│                                                              │
│  That's it. No capture. No upload. No chunks. No APIs.       │
└──────────────────────────┬───────────────────────────────────┘
                           │ Socket.IO
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    SERVER (Node.js + Mediasoup)               │
│                                                              │
│  1. Validate role (SuperAdmin/admin only)                    │
│  2. Create PlainTransports for each producer in the call     │
│  3. FFmpeg captures all RTP streams → raw.webm               │
│  4. On stop: transcode to MP4 (H.264 + AAC)                 │
│  5. Upload MP4 to S3 cloud                                   │
│  6. Delete ALL temp files from server                        │
│  7. Create message { type: "screen_recording" } in group     │
│  8. Emit message to all group members via socket             │
│  9. Daily cleanup deletes recordings older than N days        │
└──────────────────────────────────────────────────────────────┘
```

### How Server-Side Recording Works (Mediasoup)

```
Call participants send audio/video → Mediasoup SFU Router
                                          │
                                          ▼
                    Server creates PlainTransport for EVERY producer
                    (all audio producers + all video producers from all participants)
                                          │
                                          ▼
                    Each PlainTransport sends RTP to localhost UDP port
                                          │
                                          ▼
                    FFmpeg reads SDP files, receives ALL RTP streams
                    ffmpeg -i video1.sdp -i video2.sdp ... -i audio1.sdp -i audio2.sdp ...
                           -filter_complex "scale+xstack (video grid) ; amix (audio)"
                           -f webm raw.webm
                                          │
                                          ▼
                    Video grid layout (auto-arranged):
                      1 user  → full 1280x720
                      2 users → side-by-side (640x720 each)
                      3-4     → 2x2 grid (640x360 each)
                      5-6     → 3x2 grid (426x360 each)
                      7-9     → 3x3 grid, etc.
                    Audio: all streams mixed via amix
                                          │
                                          ▼
                    On stop: FFmpeg flushes and exits
                    raw.webm is on disk (temp)
                                          │
                                          ▼
                    Transcode: raw.webm → screen-recording.mp4
                    (H.264, CRF 28, 720p max, AAC 64k mono)
                                          │
                                          ▼
                    Upload MP4 to S3 → get public URL
                                          │
                                          ▼
                    Delete temp files (raw.webm, sdp, mp4)
                                          │
                                          ▼
                    Create chat message with playback URL
                    Emit via socket to all group members
```

### Storage Flow

Nothing is stored permanently on the server.

```
FFmpeg writes   →  raw.webm (temp)
Transcode       →  screen-recording.mp4 (temp)
S3 upload       →  MP4 goes to cloud
Cleanup         →  entire temp folder deleted from server
```

---

## Who Can Record

| Role        | Can Start/Stop Recording | Can View Recording in Chat |
|-------------|--------------------------|---------------------------|
| SuperAdmin  | Yes                      | Yes                       |
| Admin       | Yes                      | Yes                       |
| User        | No                       | Yes                       |

The server checks `user.userType` (not group admin status) — consistent across web and mobile.

---

## Complete Flow — Start to End

### Step 1: Admin Clicks "Record" Button

**Web (room.js):**
```javascript
socket.emit("BE-start-screen-recording", { roomId, userId: currentUser });
```

**iOS (Swift):**
```swift
socket.emit("BE-start-screen-recording", ["roomId": roomId, "userId": userId])
```

**Android (Kotlin):**
```kotlin
socket.emit("BE-start-screen-recording", JSONObject().apply {
    put("roomId", roomId)
    put("userId", userId)
})
```

### Step 2: Server Validates & Starts Recording

```
Server receives "BE-start-screen-recording"
  │
  ├── Check user role is SuperAdmin or admin         → reject if not
  ├── Check there's an active call in this room      → reject if no call
  ├── Check no recording already in progress         → reject if duplicate
  │
  ├── Create ScreenRecording document (status: "recording")
  │
  ├── Notify ALL participants in the room:
  │     emit("FE-screen-recording-started", { roomId, recordingId, startedBy })
  │
  └── Start mediasoup server-side recording:
        ├── Get ALL audio + ALL video producers from every participant
        ├── For each producer → create PlainTransport + Consumer
        ├── Generate SDP files for FFmpeg (video first, then audio)
        ├── Build video grid filter (xstack) based on participant count
        ├── Build audio mix filter (amix) for all audio streams
        ├── Spawn FFmpeg process (composites grid + mixed audio → raw.webm)
        └── Start keyframe request timer (every 2s for all video consumers)
```

### Step 3: All Participants See Recording Indicator

All clients receive `FE-screen-recording-started` via socket.

**Web:**
```
Admin sees:     [● 02:35 Stop]      ← can stop
Others see:     ● REC 02:35          ← view only
```

**Mobile (same for iOS & Android):**
```
Admin sees:     [● 02:35 Stop]      ← can stop
Others see:     ● REC 02:35          ← view only
```

**Timer implementation:**
- Record `startTime = Date.now()` when event received
- Tick every 1 second: `elapsed = floor((now - startTime) / 1000)`
- Display: `MM:SS` format
- Web uses direct DOM update (no React re-render)
- Mobile uses native timer (Handler/Timer)

### Step 4: Admin Clicks "Stop"

**Web:**
```javascript
socket.emit("BE-stop-screen-recording", { roomId, userId: currentUser });
```

**iOS:**
```swift
socket.emit("BE-stop-screen-recording", ["roomId": roomId, "userId": userId])
```

**Android:**
```kotlin
socket.emit("BE-stop-screen-recording", JSONObject().apply {
    put("roomId", roomId)
    put("userId", userId)
})
```

### Step 5: Server Stops Recording & Processes

```
Server receives "BE-stop-screen-recording"
  │
  ├── Validate role (SuperAdmin/admin)
  ├── Find active ScreenRecording document
  ├── Calculate duration = (now - createdAt)
  ├── Update status to "processing"
  │
  ├── Notify ALL participants immediately:
  │     emit("FE-screen-recording-stopped", { roomId, recordingId, stoppedBy })
  │
  └── Background processing (async):
        │
        ├── Stop FFmpeg gracefully (send "q" to stdin)
        │     └── FFmpeg flushes final data → raw.webm is complete
        │
        ├── Close mediasoup PlainTransports & Consumers
        ├── Release allocated UDP ports
        │
        ├── Transcode raw.webm → MP4:
        │     ffmpeg -i raw.webm
        │       -c:v libx264 -preset faster -crf 28 -tune stillimage
        │       -vf "scale to 720p max"
        │       -c:a aac -b:a 64k -ac 1 (mono voice)
        │       -movflags +faststart
        │       screen-recording.mp4
        │
        ├── Upload MP4 to S3 cloud
        │     → Returns public playback URL
        │
        ├── Delete ALL temp files:
        │     rm -rf ./tmp/recordings/screen-recordings/<id>/
        │
        ├── Create chat message:
        │     {
        │       messageType: "screen_recording",
        │       message: "https://s3-url/.../screen-recording.mp4",
        │       fileName: "Screen Recording | 45s"
        │     }
        │
        └── Emit message to all group members:
              emitMessageToUsers()  → personal rooms (works even after leaving call)
              emitMessageToRoom()   → call room (for anyone still in call)
```

### Step 6: Recording Appears in Chat (All Platforms)

All clients receive the `message` socket event with `messageType: "screen_recording"`.

**Chat UI (web & mobile):**
```
┌─────────────────────────────────┐
│ ● Screen Recording              │
│ ┌─────────────────────────────┐ │
│ │                             │ │
│ │     ▶  0:00 / 0:45         │ │
│ │     [video player]          │ │
│ │                             │ │
│ └─────────────────────────────┘ │
│ Screen Recording | 45s          │
│                   03/31 12:00 ✓ │
└─────────────────────────────────┘
```

**Rendering logic:**
```
if messageType === "screen_recording":
    if message === "expired":
        → show "This screen recording has expired and is no longer available."
    else:
        → show video player with src = message (playback URL)
        → show fileName below video (e.g., "Screen Recording | 45s")
```

### Step 7: After N Days — Auto-Cleanup

```
Daily cleanup job (runs every 24 hours)
  │
  ├── Find recordings where createdAt < (now - SCREEN_RECORDING_RETENTION_DAYS)
  ├── Delete file from S3
  ├── Update chat message: message = "expired"
  ├── Delete ScreenRecording document from MongoDB
  │
  └── Chat now shows:
        ┌─────────────────────────────────┐
        │ ● Screen Recording              │
        │                                 │
        │  This screen recording has      │
        │  expired and is no longer       │
        │  available.                     │
        │                                 │
        │  Screen Recording expired       │
        │  (was 45s)                      │
        │                   03/31 12:00   │
        └─────────────────────────────────┘
```

---

## Summary Table

| Step | What Happens | Where | Web Code | Mobile Code |
|------|-------------|-------|----------|-------------|
| 1 | Admin taps Record | Client | `socket.emit("BE-start-screen-recording", {roomId, userId})` | Same |
| 2 | Server starts FFmpeg recording | Server | Automatic | Automatic |
| 3 | All see ● REC timer | Client | `socket.on("FE-screen-recording-started")` | Same |
| 4 | Admin taps Stop | Client | `socket.emit("BE-stop-screen-recording", {roomId, userId})` | Same |
| 5 | Server stops, transcodes, uploads to S3 | Server | Automatic | Automatic |
| 6 | Video appears in chat | Client | `socket.on("message")` → video player | Same |
| 7 | Auto-delete after N days | Server | Automatic | Automatic |

---

## Socket.IO Events Reference

### Events to Emit (Client → Server)

| Event | Payload | Who Can Emit |
|-------|---------|-------------|
| `BE-start-screen-recording` | `{ roomId: string, userId: string }` | SuperAdmin, admin |
| `BE-stop-screen-recording` | `{ roomId: string, userId: string }` | SuperAdmin, admin |

> Always include `userId` — the server uses it as fallback when the socket user map is not yet populated.

### Events to Listen (Server → Client)

| Event | Payload | Who Receives |
|-------|---------|-------------|
| `FE-screen-recording-started` | `{ roomId, recordingId, startedBy }` | All participants in room |
| `FE-screen-recording-stopped` | `{ roomId, recordingId, stoppedBy }` | All participants in room |
| `FE-screen-recording-error` | `{ roomId, message }` | The admin who triggered |
| `message` | Full message object with `messageType: "screen_recording"` | All group members |

---

## Chat Message Format

### Active recording message

| Field       | Value |
|-------------|-------|
| messageType | `"screen_recording"` |
| message     | Playback URL (e.g., `https://s3-bucket.../screen-recording.mp4`) |
| fileName    | `"Screen Recording \| 45s"` |

### Expired recording message

| Field       | Value |
|-------------|-------|
| messageType | `"screen_recording"` |
| message     | `"expired"` |
| fileName    | `"Screen Recording expired (was 45s)"` |

---

## UI Behavior

### Record Button (Admin/SuperAdmin only)

```
Not recording:    [Screen Rec]         ← normal button
Recording:        [● 02:35 Stop]       ← red dot + timer + stop
Processing:       [Saving...]          ← disabled, server processing
```

### Recording Indicator (Non-Admin Users)

```
Not recording:    (nothing shown)
Recording:        ● REC 02:35          ← red blinking dot + live timer
```

### Duration Timer Implementation

**Web:** Direct DOM manipulation via `data-screc-duration` attribute — no React re-render.
```javascript
// Tick every 1s
document.querySelectorAll("[data-screc-duration]").forEach(el => {
    el.textContent = formatDuration(elapsed);
});
```

**iOS:**
```swift
var timer: Timer?
var startTime: Date?

func startTimer() {
    startTime = Date()
    timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
        let elapsed = Int(Date().timeIntervalSince(self.startTime!))
        let mm = String(format: "%02d", elapsed / 60)
        let ss = String(format: "%02d", elapsed % 60)
        self.timerLabel.text = "\(mm):\(ss)"
    }
}
```

**Android:**
```kotlin
private var startTime = 0L
private val handler = Handler(Looper.getMainLooper())

fun startTimer() {
    startTime = System.currentTimeMillis()
    handler.post(object : Runnable {
        override fun run() {
            val elapsed = ((System.currentTimeMillis() - startTime) / 1000).toInt()
            val mm = String.format("%02d", elapsed / 60)
            val ss = String.format("%02d", elapsed % 60)
            timerTextView.text = "$mm:$ss"
            handler.postDelayed(this, 1000)
        }
    })
}
```

---

## Mobile Code Examples (Complete)

### iOS (Swift)

```swift
// ====== ROLE CHECK ======
let canRecord = user.userType == "SuperAdmin" || user.userType == "admin"

// ====== START RECORDING ======
@IBAction func recordTapped(_ sender: UIButton) {
    if isRecording {
        // STOP
        socket.emit("BE-stop-screen-recording", ["roomId": roomId, "userId": userId])
    } else {
        // START
        socket.emit("BE-start-screen-recording", ["roomId": roomId, "userId": userId])
    }
}

// ====== SOCKET LISTENERS ======
socket.on("FE-screen-recording-started") { [weak self] data, _ in
    guard let self = self else { return }
    DispatchQueue.main.async {
        self.isRecording = true
        self.startTimer()
        self.showRecordingIndicator()
    }
}

socket.on("FE-screen-recording-stopped") { [weak self] data, _ in
    guard let self = self else { return }
    DispatchQueue.main.async {
        self.isRecording = false
        self.stopTimer()
        self.hideRecordingIndicator()
    }
}

socket.on("FE-screen-recording-error") { [weak self] data, _ in
    let message = (data[0] as? [String: Any])?["message"] as? String ?? "Recording error"
    DispatchQueue.main.async {
        self?.showError(message)
    }
}

// ====== CHAT MESSAGE RENDERING ======
// In your chat message cell/view:
if message.messageType == "screen_recording" {
    if message.message == "expired" {
        // Show expired placeholder
        showExpiredView(fileName: message.fileName)
    } else {
        // Show video player
        showVideoPlayer(url: URL(string: message.message)!)
        showLabel(text: message.fileName)  // "Screen Recording | 45s"
    }
}
```

### Android (Kotlin)

```kotlin
// ====== ROLE CHECK ======
val canRecord = user.userType == "SuperAdmin" || user.userType == "admin"

// ====== START RECORDING ======
binding.recordButton.setOnClickListener {
    val data = JSONObject().apply {
        put("roomId", roomId)
        put("userId", userId)
    }
    if (isRecording) {
        socket.emit("BE-stop-screen-recording", data)
    } else {
        socket.emit("BE-start-screen-recording", data)
    }
}

// ====== SOCKET LISTENERS ======
socket.on("FE-screen-recording-started") { args ->
    runOnUiThread {
        isRecording = true
        startTimer()
        showRecordingIndicator()
    }
}

socket.on("FE-screen-recording-stopped") { args ->
    runOnUiThread {
        isRecording = false
        stopTimer()
        hideRecordingIndicator()
    }
}

socket.on("FE-screen-recording-error") { args ->
    val msg = (args[0] as? JSONObject)?.optString("message") ?: "Recording error"
    runOnUiThread { showError(msg) }
}

// ====== CHAT MESSAGE RENDERING (RecyclerView Adapter) ======
when {
    msg.messageType == "screen_recording" && msg.message == "expired" -> {
        // Show expired placeholder
        holder.expiredView.visibility = View.VISIBLE
        holder.videoPlayer.visibility = View.GONE
        holder.expiredText.text = msg.fileName
    }
    msg.messageType == "screen_recording" -> {
        // Show ExoPlayer with URL
        holder.expiredView.visibility = View.GONE
        holder.videoPlayer.visibility = View.VISIBLE
        holder.videoPlayer.setMediaItem(MediaItem.fromUri(msg.message))
        holder.videoPlayer.prepare()
        holder.fileNameText.text = msg.fileName  // "Screen Recording | 45s"
    }
}
```

---

## What Mobile Developer Needs From You

### Checklist

| # | Item | Details |
|---|------|---------|
| 1 | API Base URL | Your production/staging server URL |
| 2 | Socket.IO URL | Same server URL (Socket.IO connects here) |
| 3 | This document | Everything they need is in this file |

### What They Need to Implement

| Task | Effort |
|------|--------|
| Record button (admin only) | 1 button + role check |
| Emit 2 socket events | `start` and `stop` — 2 lines of code each |
| Listen 3 socket events | `started`, `stopped`, `error` — show/hide UI |
| Duration timer | Local `MM:SS` timer, start on `started`, stop on `stopped` |
| Chat message rendering | Check `messageType === "screen_recording"` → video player or expired |

### What They Do NOT Need

- No screen capture APIs (ReplayKit / MediaProjection) — server records
- No file handling or chunked uploads — server handles everything
- No S3 credentials — server uploads to cloud
- No FFmpeg — server transcodes
- No REST API calls — everything is via socket
- No cleanup logic — server auto-deletes after N days

### One-Line Summary for Mobile Dev

> "Emit `BE-start-screen-recording` to start, `BE-stop-screen-recording` to stop. Server records the call, uploads to cloud, and posts the video in chat. You just show the button, timer, and video player."

---

## Server-Side Compression

### FFmpeg Recording Settings (Phase 1: Raw Capture)

| Setting           | Value          | Why                                          |
|-------------------|----------------|----------------------------------------------|
| Video Codec       | libvpx (VP8)   | WebM container, real-time encoding           |
| Video Bitrate     | 1 Mbps         | Good quality for grid layout at 720p         |
| Deadline          | realtime       | Low-latency encoding during live call        |
| cpu-used          | 4              | Fast encoding, acceptable quality tradeoff   |
| Video Filter      | xstack         | Composites all participants into grid        |
| Grid Resolution   | 1280x720       | Each cell scaled proportionally              |
| Audio Codec       | libopus        | All audio streams mixed via amix filter      |
| Audio Bitrate     | 128k           | Good voice quality                           |

### Video Grid Layout

| Participants | Layout       | Cell Size (each) |
|-------------|--------------|------------------|
| 1           | Full frame   | 1280x720         |
| 2           | Side-by-side | 640x720          |
| 3-4         | 2x2 grid     | 640x360          |
| 5-6         | 3x2 grid     | 426x360          |
| 7-9         | 3x3 grid     | 426x240          |

Empty grid cells (e.g., 3 users in a 2x2 grid) are filled with black.

### FFmpeg Transcode Settings (Phase 2: MP4 Conversion)

| Setting           | Value          | Why                                          |
|-------------------|----------------|----------------------------------------------|
| Codec             | H.264 (libx264)| Universal playback on all devices            |
| CRF               | 28             | Higher = smaller file, good for call video   |
| Preset            | faster         | Good compression ratio, reasonable speed     |
| Tune              | stillimage     | Optimized for mostly-static content          |
| Resolution cap    | 720p max       | Downscale if source is larger                |
| Audio             | AAC 64k mono   | Voice-only, half the size of stereo          |
| movflags          | +faststart     | Progressive playback (streams while loading) |

### Expected File Sizes

| Duration | Raw WebM (server) | After MP4 Transcode | Stored on S3 |
|----------|-------------------|---------------------|-------------|
| 5 min    | ~30-60 MB         | ~15-30 MB           | ~15-30 MB   |
| 30 min   | ~180-360 MB       | ~90-180 MB          | ~90-180 MB  |
| 1 hour   | ~360-700 MB       | ~150-300 MB         | ~150-300 MB |

---

## Cloud Storage

- All recordings stored on **S3 cloud only** — nothing permanent on server
- S3 upload happens when `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKETS_NAME` are set
- Temp files deleted immediately after S3 upload
- Auto-cleanup job deletes from S3 after `SCREEN_RECORDING_RETENTION_DAYS` days

---

## Environment Variables

| Variable                          | Default              | Description                                  |
|----------------------------------|----------------------|----------------------------------------------|
| `SCREEN_RECORDING_RETENTION_DAYS` | `30`                 | Auto-delete recordings from S3 after N days  |
| `FFMPEG_PATH`                     | `ffmpeg`             | Path to FFmpeg binary on server              |
| `RECORDING_TEMP_UPLOAD_DIR`       | `./tmp/recordings`   | Temp directory during processing             |
| `RECORDING_CDN_BASE_URL`          | _(empty)_            | Optional custom CDN URL for playback         |
| `S3_ACCESS_KEY`                   | —                    | S3 access key (required)                     |
| `S3_SECRET_ACCESS_KEY`            | —                    | S3 secret key (required)                     |
| `S3_REGION`                       | —                    | S3 region (e.g., `nyc3`)                     |
| `S3_BUCKETS_NAME`                 | —                    | S3 bucket name                               |
| `S3_ENDPOINT`                     | _(auto from region)_ | Custom S3 endpoint                           |
| `S3_OBJECT_ACL`                   | `public-read`        | ACL for uploaded objects                     |

---

## Database Schema

### ScreenRecording Collection

```javascript
{
  groupId:          String,       // Group/chat ID
  startedBy:        ObjectId,     // User who started (ref: Users)
  status:           String,       // "recording" | "processing" | "ready" | "failed"
  mimeType:         String,       // e.g., "video/webm"
  durationSec:      Number,       // Duration in seconds
  sizeBytes:        Number,       // Total file size
  rawFilePath:      String,       // Temp file path (cleaned after upload)
  rawObjectKey:     String,       // S3 object key
  playbackUrl:      String,       // Final playback URL
  errorMessage:     String,       // Error details if failed
  createdAt:        Date,
  updatedAt:        Date
}
```

### Message (screen_recording type)

```javascript
{
  groupId:        ObjectId,
  senderId:       ObjectId,       // Admin who started recording
  senderName:     String,
  message:        String,         // Playback URL or "expired"
  fileName:       String,         // "Screen Recording | 45s"
  messageType:    "screen_recording",
  allRecipients:  [ObjectId],
  deliveredTo:    [{user, timestamp}],
  readBy:         [{user, timestamp}],
  timestamp:      Date
}
```

---

## Error Handling

| Error | When |
|-------|------|
| "Missing roomId or user context." | Socket event missing required fields |
| "Only SuperAdmin and Admin can start screen recording." | Non-admin tried to record |
| "No active call found for this room." | No ongoing call in the group |
| "A screen recording is already in progress." | Another recording running |
| "No active screen recording found to stop." | No recording to stop |
| "No audio/video producers found for server-side recording." | No one sharing audio/video in call |

All errors are emitted via `FE-screen-recording-error` socket event.

---

## Files Reference

### Backend

| File | Purpose |
|------|---------|
| `src/mediasoup/recordingManager.ts` | Server-side FFmpeg recording via PlainTransports |
| `src/db/schemas/screen-recording.schema.ts` | MongoDB schema |
| `src/helpers/screenRecordingProcessor.ts` | Background processing (transcode, S3, chat message) |
| `src/helpers/screenRecordingCleanup.ts` | Daily cleanup job (auto-delete after N days) |
| `src/socket/index.ts` | Socket events (start/stop → mediasoup recording) |
| `src/db/schemas/message.schema.ts` | Message schema (includes `screen_recording` type) |

### Frontend (Web)

| File | Purpose |
|------|---------|
| `components/room.js` | Record button, socket emits, duration timer |
| `components/MegaMessage.js` | Renders screen_recording messages (video player + expired) |
| `components/ChatArea.js` | Reply preview for screen_recording messages |
