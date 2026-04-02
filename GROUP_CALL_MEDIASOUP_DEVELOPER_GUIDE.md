# Group Call (mediasoup + Socket.IO) — Complete Developer Guide

This guide explains the full group-call flow used in this project, from room join to media production/consumption, reconnect, ICE restart, and leave/end behavior.

It is written to help developers integrating from any client stack (React, Flutter, Laravel backend bridge, native mobile, etc.).

---

## 1) High-level architecture

- **Signaling layer**: Socket.IO events (`BE-*`, `FE-*`, `MS-*`)
- **Media layer**: mediasoup SFU (router, transports, producers, consumers)
- **Client media stack**: WebRTC + `mediasoup-client` device/transports
- **Persistence/state**: Mongo models for call status, participants, and notifications

Server-side key files:

- `chat-backend/src/socket/index.ts` (all signaling handlers)
- `chat-backend/src/mediasoup/mediaRoomManager.ts` (SFU room/transport/producer/consumer logic)
- `chat-backend/src/mediasoup/recordingManager.ts` (server-side recording, SDP/FFmpeg pipeline, rotation handling)

Client key files:

- `chat-frontend/components/room.js` (room UI + signaling + mediasoup init)
- `chat-frontend/utils/callService.js` (socket helper wrappers, including `MS-produce` `appData`)

---

## 1.1) Latest group-call updates (important for app developers)

This project now includes cross-platform and recording-oriented updates for group calls:

1. `MS-produce` supports video metadata via `appData: { width, height, rotation }`.
2. `MS-get-producers` can return `width/height/rotation` for video producers.
3. Group-call media codec policy is now strict: **audio/opus + video/VP8 only**.
4. Server recorder now preserves RTP header extensions (`a=extmap`) and applies explicit rotation transforms (`90/180/270`) when provided.

### App developer update checklist

1. Update your client `MS-produce` payload to include `appData.rotation` (normalized to `0/90/180/270`, default `0`).
2. Keep sending `appData.width` and `appData.height` for video producers.
3. Do not strip RTP header extensions from produced RTP params (especially `urn:3gpp:video-orientation`).
4. Continue consume flow exactly: `MS-consume` → attach track → `MS-resume-consumer`.
5. Ensure clients send/consume **Opus + VP8** capabilities and do not publish H264 in group-call flows.

---

## 2) Networking and environment requirements (critical)

For production, mediasoup needs:

- API/signaling port (example: `10018`)
- RTP/RTCP UDP/TCP range (in this app: `40000-49999`)

Required backend env:

```env
MEDIASOUP_ANNOUNCED_IP=<public_server_ip>
MEDIASOUP_ENABLE_UDP=true
MEDIASOUP_ENABLE_TCP=true
MEDIASOUP_PREFER_TCP=false

STUN_URL=stun:your-stun:3478
TURN_URL_1=turn:your-turn:3478
TURN_URL_UDP=turn:your-turn:3478?transport=udp
TURN_URL_TCP=turn:your-turn:3478?transport=tcp
TURN_USERNAME=...
TURN_CREDENTIAL=...
ICE_POLICY=all   # or relay
```

If `MEDIASOUP_ANNOUNCED_IP` or RTP firewall rules are wrong, signaling may succeed but media will fail (black video/no audio).

---

## 3) Event naming conventions

- `BE-*`: client → backend request events
- `FE-*`: backend → frontend/client notify events
- `MS-*`: mediasoup signaling events (request + notify)

Note: Existing project event uses typo **`incomming_call`** (double `m`) in some places. Keep exact string for compatibility.

---

## 4) End-to-end lifecycle (step-by-step)

## Step A: Join signaling room

Client emits:

### `BE-join-room` (ACK expected)

**Request payload**

```json
{
  "roomId": "69b81151f7369a77bd3c5da6",
  "userName": "69b8108df7369a77bd3c5d3a",
  "fullName": "John",
  "callType": "video",
  "video": true,
  "audio": true,
  "mobileSDP": {}
}
```

**ACK success**

```json
{ "ok": true }
```

**ACK failure**

```json
{ "ok": false, "error": "join-room-failed" }
```

Server actions:

1. Joins Socket.IO room (`socket.join(roomId)`)
2. Registers peer info in `socketList`
3. Registers mediasoup peer via `addPeer(roomId, userName)`
4. Emits `FE-user-join` (to self and others)
5. Updates DB participant status (`videoCall`, `USERS.isActiveInCall`)
6. For first participant, may trigger `incomming_call` / `waiting_call` + push notifications

---

## Step B: Get router capabilities

### `MS-get-rtp-capabilities` (ACK)

**Request**

```json
{ "roomId": "69b81151f7369a77bd3c5da6" }
```

**ACK**

```json
{
  "ok": true,
  "rtpCapabilities": {
    "codecs": [
      { "kind": "audio", "mimeType": "audio/opus", "clockRate": 48000, "channels": 2, "preferredPayloadType": 111 },
      { "kind": "video", "mimeType": "video/VP8", "clockRate": 90000, "preferredPayloadType": 96 }
    ],
    "headerExtensions": [],
    "fecMechanisms": []
  }
}
```

Client loads these into mediasoup `Device.load({ routerRtpCapabilities })`.

**Cross-platform requirement (Web ↔ Flutter):**

- Group calls are now enforced as **VP8 video + Opus audio**.
- Clients should filter consume capabilities to Opus/VP8 (plus VP8 RTX) before calling `MS-consume`.

---

## Step C: Get ICE server config (STUN/TURN)

### `MS-get-ice-servers` (ACK)

**Request**

No payload; callback only.

**ACK**

```json
{
  "ok": true,
  "iceServers": [
    { "urls": "stun:142.93.74.226:3478" },
    {
      "urls": ["turn:142.93.74.226:3478?transport=udp", "turn:142.93.74.226:3478?transport=tcp"],
      "username": "cuapp_turn",
      "credential": "TurnPass123!"
    }
  ],
  "iceTransportPolicy": "all"
}
```

Use these in both send and recv transport creation client-side.

---

## Step D: Create transports

Each peer creates:

- 1 send transport (`direction: "send"`)
- 1 recv transport (`direction: "recv"`)

### `MS-create-transport` (ACK)

**Request**

```json
{
  "roomId": "69b81151f7369a77bd3c5da6",
  "userId": "69b8108df7369a77bd3c5d3a",
  "direction": "send"
}
```

**ACK**

```json
{
  "ok": true,
  "id": "21c692ab-da92-4a1f-b90d-22a8640dbae4",
  "iceParameters": { "usernameFragment": "...", "password": "...", "iceLite": true },
  "iceCandidates": [{ "foundation": "...", "priority": 12345, "ip": "13.51.47.108", "protocol": "udp", "port": 45xxx, "type": "host" }],
  "dtlsParameters": { "role": "auto", "fingerprints": [{ "algorithm": "sha-256", "value": "..." }] }
}
```

Server logs transport state changes:

- `icestatechange`
- `iceselectedtuplechange`
- `dtlsstatechange`

---

## Step E: Connect transports (DTLS)

When mediasoup-client transport emits `connect`, client sends:

### `MS-connect-transport` (ACK)

**Request**

```json
{
  "roomId": "69b81151f7369a77bd3c5da6",
  "userId": "69b8108df7369a77bd3c5d3a",
  "transportId": "21c692ab-da92-4a1f-b90d-22a8640dbae4",
  "dtlsParameters": { "role": "client", "fingerprints": [{ "algorithm": "sha-256", "value": "..." }] }
}
```

**ACK**

```json
{ "ok": true }
```

---

## Step F: Produce local media (audio/video)

When send transport emits `produce`, client sends:

### `MS-produce` (ACK)

**Request**

```json
{
  "roomId": "69b81151f7369a77bd3c5da6",
  "userId": "69b8108df7369a77bd3c5d3a",
  "transportId": "21c692ab-da92-4a1f-b90d-22a8640dbae4",
  "kind": "video",
  "rtpParameters": { "mid": "0", "codecs": [], "headerExtensions": [], "encodings": [], "rtcp": {} },
  "encodings": [{ "maxBitrate": 450000, "maxFramerate": 15, "scalabilityMode": "L1T1" }],
  "appData": { "width": 360, "height": 640, "rotation": 90 }
}
```

For **video** producers, send `appData.width`, `appData.height`, and `appData.rotation`.

- `rotation` should be normalized to: `0 | 90 | 180 | 270`
- If unknown, send `rotation: 0`

**ACK**

```json
{ "ok": true, "id": "f3879f77-b944-44ae-bb52-cd58772d3cad" }
```

After creating producer, backend emits to other peers:

### `MS-new-producer` (notify)

```json
{
  "producerId": "f3879f77-b944-44ae-bb52-cd58772d3cad",
  "userId": "69b8108df7369a77bd3c5d3a",
  "kind": "video"
}
```

---

## Step G: Consume remote media

There are two consumption entry points:

1. **Initial catch-up**: `MS-get-producers` then consume each
2. **Real-time**: on `MS-new-producer`

### `MS-get-producers` (ACK)

**Request**

```json
{
  "roomId": "69b81151f7369a77bd3c5da6",
  "userId": "69b8108df7369a77bd3c5d3a"
}
```

**ACK**

```json
{
  "ok": true,
  "producers": [
    {
      "producerId": "6d668d07-ab11-4c33-96f6-de139f2cc020",
      "userId": "otherUserId",
      "kind": "video",
      "width": 360,
      "height": 640,
      "rotation": 90
    }
  ]
}
```

`width/height/rotation` are optional metadata (mainly for video/recording layout).

### `MS-consume` (ACK)

**Request**

```json
{
  "roomId": "69b81151f7369a77bd3c5da6",
  "userId": "69b8108df7369a77bd3c5d3a",
  "producerId": "6d668d07-ab11-4c33-96f6-de139f2cc020",
  "rtpCapabilities": { "codecs": [], "headerExtensions": [] }
}
```

**ACK**

```json
{
  "ok": true,
  "id": "consumer-id",
  "producerId": "6d668d07-ab11-4c33-96f6-de139f2cc020",
  "kind": "video",
  "rtpParameters": {},
  "type": "simple",
  "producerPaused": false,
  "paused": true
}
```

Important: server creates consumer with `paused: true`; client must resume explicitly after attaching track.

---

## Step H: Resume consumer + set preferred layers

### `MS-resume-consumer` (ACK optional)

**Request**

```json
{
  "roomId": "69b81151f7369a77bd3c5da6",
  "userId": "69b8108df7369a77bd3c5d3a",
  "consumerId": "consumer-id"
}
```

**ACK**

```json
{ "ok": true }
```

### `MS-set-preferred-layers` (for video consumers)

**Request**

```json
{
  "roomId": "69b81151f7369a77bd3c5da6",
  "userId": "69b8108df7369a77bd3c5d3a",
  "consumerId": "consumer-id",
  "spatialLayer": 0,
  "temporalLayer": 0
}
```

**ACK**

```json
{ "ok": true }
```

---

## Step I: ICE restart and recovery flow

When transport becomes `disconnected`/`failed`, client attempts lightweight recovery first.

### `MS-restart-ice` (ACK)

**Request**

```json
{
  "roomId": "69b81151f7369a77bd3c5da6",
  "userId": "69b8108df7369a77bd3c5d3a",
  "transportId": "21c692ab-da92-4a1f-b90d-22a8640dbae4"
}
```

**ACK**

```json
{
  "ok": true,
  "iceParameters": { "usernameFragment": "...", "password": "...", "iceLite": true }
}
```

Then client runs:

```js
await transport.restartIce({ iceParameters });
```

If ICE restart fails, app performs full mediasoup re-initialization:

1. close producers/transports
2. clear consumed producer cache
3. re-run init flow from RTP capabilities onward

---

## Step J: Leave and call termination

### `BE-leave-room`

**Request**

```json
{
  "roomId": "69b81151f7369a77bd3c5da6",
  "leaver": "69b8108df7369a77bd3c5d3a"
}
```

Server actions:

1. Mark user left in DB
2. `removePeer(roomId, leaver)` in mediasoup
3. Broadcast `call-status-change`
4. If none left:
   - mark call ended
   - emit `FE-call-ended`
   - send push notifications
   - create end-call system message
5. If users remain:
   - emit `FE-user-leave` and `FE-leave`

---

## 5) Presence / UX events (non-mediasoup media signaling)

## `FE-user-join`

Emitted on join to self (list) and to others (new participant).

Example:

```json
[
  {
    "userId": "socket-id",
    "info": {
      "userName": "mongoUserId",
      "fullName": "John",
      "video": true,
      "audio": true
    }
  }
]
```

## `FE-user-leave`

```json
{
  "userId": "socket-id",
  "userName": "mongoUserId",
  "fullName": "John",
  "roomId": "roomId",
  "joinUserCount": 2
}
```

## `call-status-change`

```json
{
  "groupId": "roomId",
  "isActive": true,
  "participantCount": 3
}
```

## `incomming_call` (existing typo kept)

```json
{
  "uid": "targetUserId",
  "socketId": "callerSocketId",
  "roomId": "roomId",
  "groupName": "Team Call",
  "groupImage": null,
  "callerName": "John",
  "callType": "video"
}
```

## `waiting_call`

```json
{
  "uid": "targetUserId",
  "socketId": "callerSocketId",
  "roomId": "roomId",
  "groupName": "Team Call",
  "groupImage": null,
  "callerName": "John",
  "callType": "video",
  "isDirect": false
}
```

---

## 6) mediasoup server internals (important behavior)

From `mediaRoomManager.ts`:

- One or more workers initialized across CPU cores
- Worker RTP port allocation in range `40000-49999`
- Room state:
  - `router`
  - peers map by `userId`
- Peer state:
  - `transports` (direction-aware)
  - `producers`
  - `consumers`
  - `producerMeta` (`width/height/rotation` per producer)

Behavior details:

- `createConsumer` only uses peer's **recv** transport
- `router.canConsume` guard prevents incompatible consume
- server consume path uses router `canConsume` strictly with Opus/VP8-filtered capabilities
- consumers start paused and require `MS-resume-consumer`
- periodic video keyframe requests improve freeze recovery
- when last peer leaves room, router is closed and room deleted

---

## 7) Client sequence diagram (conceptual)

1. `BE-join-room` ACK
2. `MS-get-rtp-capabilities` ACK
3. `MS-get-ice-servers` ACK
4. `MS-create-transport(send)` ACK
5. `MS-connect-transport(send)` ACK (via transport connect callback)
6. `MS-produce(audio)` ACK
7. `MS-produce(video)` ACK
8. `MS-create-transport(recv)` ACK
9. `MS-connect-transport(recv)` ACK
10. `MS-get-producers` ACK
11. `MS-consume` ACK (per producer)
12. `MS-resume-consumer` (per consumer)
13. `MS-set-preferred-layers` (video)
14. Listen `MS-new-producer` and repeat consume path for new peers

---

## 8) Cross-platform integration notes

## Codec compatibility rules (critical for Web ↔ Flutter)

- Router advertises **audio/opus** and **video/VP8** for group calls.
- Web and mobile clients should explicitly prefer VP8 for video produce and pass Opus/VP8 capabilities for consume.
- Server rejects non-Opus audio or non-VP8 video `MS-produce` requests with `unsupported-codec`.
- Server-side recorder must keep codec parsing dynamic from SDP, but active group-call producers are VP8/Opus.

## Orientation / rotation rules (critical for server recording)

- **Do not filter out** RTP header extension `urn:3gpp:video-orientation` in any client or gateway.
- When producing video from mobile/web clients, send `appData.width`, `appData.height`, and `appData.rotation`.
- Recorder SDP now preserves RTP header extensions (`a=extmap`) so orientation metadata is available to FFmpeg.
- Recording rotation logic:
  - if explicit `rotation` exists, recorder applies exact transform (`90`, `180`, `270`)
  - if explicit rotation is missing, recorder falls back to legacy portrait transpose behavior
- Keep web rendering with `object-fit: contain`; do not add CSS rotation in the player unless debugging a specific device issue.

## React / Web

- Use `mediasoup-client` `Device`, `createSendTransport`, `createRecvTransport`
- Persist socket and mediasoup state in refs/store to survive rerenders
- On video produce, pass `appData: { width, height, rotation }` (rotation normalized to `0/90/180/270`)
- On socket reconnect:
  - re-join room
  - reinitialize transports/producers/consumers

## Flutter

- Use WebRTC package + custom signaling (Socket.IO client)
- Mirror same event contract and ACK handling
- Keep separate send/recv transports conceptually, matching backend `direction`
- Implement consume-resume flow exactly (`consume` then `resume`)
- Ensure produced RTP parameters are passed as generated by Flutter WebRTC (no custom stripping of header extensions)
- Send producer appData width/height/rotation when available (rotation fallback to `0` if unknown)

## Laravel / Other backend adapters

- If Laravel acts as gateway/orchestrator, keep event payloads and ACKs unchanged
- Do not mutate `roomId/userId/producerId/consumerId` semantics
- Ensure horizontal scaling uses sticky sessions or shared signaling state strategy

---

## 9) Error handling contract

Most ACK handlers return:

```json
{ "ok": false, "error": "failed" }
```

Possible errors in flow:

- `join-room-failed`
- `no-producer`
- `cannot-consume`
- `transport-not-found`
- generic `failed`

Client should:

1. log event + payload
2. show user-safe message
3. retry only where safe (`MS-restart-ice`, re-init mediasoup)

---

## 10) Debug checklist for “call connected but no media”

1. Confirm `MEDIASOUP_ANNOUNCED_IP` is public reachable IP
2. Open firewall for `40000-49999` UDP/TCP on server
3. Verify TURN credentials and `MS-get-ice-servers` response
4. Check server logs:
   - `transport ice state`
   - `transport selected tuple`
   - `transport dtls state`
5. Check `MS-get-rtp-capabilities` contains Opus + VP8 (and VP8 RTX, if present)
6. Confirm `MS-resume-consumer` is being sent after track attach
7. Confirm no duplicate/stale consumed producer cache blocking re-consume

## 10.1) Debug checklist for rotated recordings (app → web/server-side recording)

1. Confirm producer metadata includes width/height/rotation (`appData.width`, `appData.height`, `appData.rotation`)
2. Confirm no client/gateway code strips `urn:3gpp:video-orientation`
3. Confirm recorder receives/extmaps in SDP (`a=extmap`) and applies explicit rotation when provided
4. For legacy clients without `rotation`, confirm fallback portrait transpose still works
5. Confirm web player uses `object-fit: contain` without additional CSS transform rotation

## 10.2) Debug checklist for `cannot-consume` in mixed Web/Flutter rooms

1. Verify router capabilities include Opus + VP8.
2. Confirm client consume payload is filtered to Opus/VP8 (plus VP8 RTX if present).
3. Check `MS-produce` failures for `unsupported-codec` (indicates client still sending H264 or non-Opus).
4. Re-check consume flow: `MS-consume` -> attach track -> `MS-resume-consumer`.

---

## 11) Minimal pseudo-code for any client

```text
connect socket
emit BE-join-room (wait ack)
emit MS-get-rtp-capabilities -> load device
emit MS-get-ice-servers
emit MS-create-transport(send) -> create send transport
on send transport connect -> emit MS-connect-transport
on send transport produce -> emit MS-produce
emit MS-create-transport(recv) -> create recv transport
on recv transport connect -> emit MS-connect-transport
emit MS-get-producers
for each producer -> emit MS-consume -> recvTransport.consume(...)
emit MS-resume-consumer
listen MS-new-producer -> consume/resume new producer
on transport disconnected -> emit MS-restart-ice, else full re-init
on leave -> emit BE-leave-room
```

---

## 12) Compatibility and contract stability

If you build new clients (React Native, Flutter, native iOS/Android, desktop):

- Keep event names unchanged
- Keep ACK shapes unchanged (`ok`, `error`, IDs/params)
- Keep order constraints (`consume` before `resume`)
- Keep dual transport model (`send` + `recv`)

This preserves backend compatibility and avoids subtle one-way media bugs.
