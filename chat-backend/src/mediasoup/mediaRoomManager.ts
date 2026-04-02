import { types, createWorker } from "mediasoup";
import * as os from "os";

type Direction = "send" | "recv";

interface PeerTransport {
  transport: types.WebRtcTransport;
  direction: Direction;
}

type ProducerMeta = {
  width?: number;
  height?: number;
  rotation?: number;
  source?: string;
  portraitLock?: boolean;
};

export interface PeerState {
  transports: Map<string, PeerTransport>;
  producers: Map<string, types.Producer>;
  consumers: Map<string, types.Consumer>;
  producerMeta: Map<string, ProducerMeta>;
}

export interface RoomState {
  id: string;
  router: types.Router;
  peers: Map<string, PeerState>; // key: userId
}

const rooms: Map<string, RoomState> = new Map();

// Keyframe request timers: consumerId → NodeJS.Timeout
// Without periodic keyframe requests, VP8 video freezes after any packet loss
// because the decoder can't reconstruct frames without a keyframe.
const keyframeTimers: Map<string, NodeJS.Timeout> = new Map();

export function startKeyframeTimer(consumer: types.Consumer): void {
  if (consumer.kind !== "video") return;
  if (keyframeTimers.has(consumer.id)) return;
  // Request immediately to give the decoder a clean start
  try { consumer.requestKeyFrame(); } catch { }
  const timer = setInterval(() => {
    if (consumer.closed) {
      clearInterval(timer);
      keyframeTimers.delete(consumer.id);
      return;
    }
    try { consumer.requestKeyFrame(); } catch { }
  }, 2000); // faster recovery on lossy mobile links
  keyframeTimers.set(consumer.id, timer);
}

export function stopKeyframeTimer(consumerId: string): void {
  const timer = keyframeTimers.get(consumerId);
  if (timer) {
    clearInterval(timer);
    keyframeTimers.delete(consumerId);
  }
}

// Use one worker per CPU core to avoid single-core saturation that causes system hangs
const numWorkers = Math.max(1, os.cpus().length);
const workers: types.Worker[] = [];
let workerIndex = 0;

async function initWorkers(): Promise<void> {
  if (workers.length > 0) return;
  const minBasePort = 40000;
  const maxBasePort = 49999;
  const totalRange = maxBasePort - minBasePort;
  const portsPerWorker = Math.floor(totalRange / numWorkers);

  for (let i = 0; i < numWorkers; i++) {
    const minPort = minBasePort + i * portsPerWorker;
    const maxPort = Math.min(maxBasePort, minPort + portsPerWorker - 1);
    const worker = await createWorker({
      logLevel: "warn",
      rtcMinPort: minPort,
      rtcMaxPort: maxPort,
    });
    worker.on("died", () => {
      console.error(`[mediasoup] Worker ${i} died, restarting...`);
      workers[i] = null as any;
      createWorker({ logLevel: "warn", rtcMinPort: minPort, rtcMaxPort: maxPort }).then(
        (w) => { workers[i] = w; }
      );
    });
    workers.push(worker);
  }
}

async function getWorker(): Promise<types.Worker> {
  await initWorkers();
  // Round-robin across workers
  const worker = workers[workerIndex % workers.length];
  workerIndex++;
  return worker;
}

const SUPPORTED_VIDEO_MIME_TYPES = new Set(["video/h264", "video/vp8"]);

// Group-call codec policy: Opus audio + H264 preferred video with VP8 fallback.
const mediaCodecs: types.RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 111,
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    preferredPayloadType: 102,
    parameters: {
      "packetization-mode": 1,
      "level-asymmetry-allowed": 1,
      "profile-level-id": "42e01f",
      "x-google-start-bitrate": 500,
      "x-google-max-bitrate": 2500,
      "x-google-min-bitrate": 150,
    },
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    preferredPayloadType: 96,
    parameters: {
      "x-google-start-bitrate": 500,  // kbps - start lower to avoid immediate congestion
      "x-google-max-bitrate": 2500,    // kbps - allow higher quality if link supports it
      "x-google-min-bitrate": 150,     // kbps
    },
  },
];

const VIDEO_ORIENTATION_URI = "urn:3gpp:video-orientation";

function hasCodecMimeType(
  rtpParameters: types.RtpParameters,
  mimeType: string,
): boolean {
  const expectedMimeType = mimeType.toLowerCase();
  return (rtpParameters.codecs || []).some(
    (codec) => (codec.mimeType || "").toLowerCase() === expectedMimeType,
  );
}

function filterSupportedConsumeCapabilities(
  rtpCapabilities: types.RtpCapabilities,
): types.RtpCapabilities {
  const codecs = rtpCapabilities.codecs || [];
  const supportedVideoPayloadTypes = new Set<number>();
  for (const codec of codecs) {
    const mimeType = (codec.mimeType || "").toLowerCase();
    if (!SUPPORTED_VIDEO_MIME_TYPES.has(mimeType)) continue;
    if (typeof codec.preferredPayloadType === "number") {
      supportedVideoPayloadTypes.add(codec.preferredPayloadType);
    }
  }

  const filteredCodecs = codecs.filter((codec) => {
    const mimeType = (codec.mimeType || "").toLowerCase();
    if (mimeType === "audio/opus" || SUPPORTED_VIDEO_MIME_TYPES.has(mimeType)) {
      return true;
    }
    if (mimeType !== "video/rtx") {
      return false;
    }

    const apt = Number((codec.parameters as Record<string, unknown> | undefined)?.apt);
    return Number.isFinite(apt) && supportedVideoPayloadTypes.has(apt);
  });

  return { ...rtpCapabilities, codecs: filteredCodecs };
}

function getHeaderExtensions(
  rtpCapabilities: types.RtpCapabilities,
): types.RtpHeaderExtension[] {
  const value = (rtpCapabilities as any).headerExtensions;
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function hasHeaderExtension(
  headerExtensions: types.RtpHeaderExtension[],
  uri: string,
  kind?: types.MediaKind,
): boolean {
  const expectedUri = uri.toLowerCase();
  const expectedKind = kind?.toLowerCase();

  return headerExtensions.some((ext) => {
    const extUri = String((ext as any).uri || "").toLowerCase();
    if (extUri !== expectedUri) return false;

    if (!expectedKind) return true;

    const extKind = String((ext as any).kind || "").toLowerCase();
    return extKind === expectedKind;
  });
}

function ensureConsumeHeaderExtensions(
  consumeCaps: types.RtpCapabilities,
  routerCaps: types.RtpCapabilities,
): types.RtpCapabilities {
  const consumeHeaderExtensions = getHeaderExtensions(consumeCaps);
  const routerHeaderExtensions = getHeaderExtensions(routerCaps);

  if (routerHeaderExtensions.length === 0) {
    return consumeCaps;
  }

  if (consumeHeaderExtensions.length === 0) {
    return {
      ...(consumeCaps as any),
      headerExtensions: routerHeaderExtensions,
    } as types.RtpCapabilities;
  }

  if (
    hasHeaderExtension(
      consumeHeaderExtensions,
      VIDEO_ORIENTATION_URI,
      "video",
    )
  ) {
    return consumeCaps;
  }

  const routerVideoOrientation = routerHeaderExtensions.find((ext) => {
    const uri = String((ext as any).uri || "").toLowerCase();
    const kind = String((ext as any).kind || "").toLowerCase();
    return uri === VIDEO_ORIENTATION_URI && kind === "video";
  });

  if (!routerVideoOrientation) {
    return consumeCaps;
  }

  return {
    ...(consumeCaps as any),
    headerExtensions: [...consumeHeaderExtensions, routerVideoOrientation],
  } as types.RtpCapabilities;
}

export async function getOrCreateRoom(roomId: string): Promise<RoomState> {
  let room = rooms.get(roomId);
  if (room) return room;

  const worker = await getWorker();
  const router = await worker.createRouter({ mediaCodecs });

  room = {
    id: roomId,
    router,
    peers: new Map(),
  };

  rooms.set(roomId, room);
  return room;
}

export function getRoom(roomId: string): RoomState | undefined {
  return rooms.get(roomId);
}

export async function addPeer(roomId: string, userId: string): Promise<PeerState> {
  const room = await getOrCreateRoom(roomId);
  let peer = room.peers.get(userId);
  if (!peer) {
    peer = {
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      producerMeta: new Map(),
    };
    room.peers.set(userId, peer);
  }
  return peer;
}

export async function removePeer(roomId: string, userId: string): Promise<void> {
  const room = rooms.get(roomId);
  if (!room) return;

  const peer = room.peers.get(userId);
  if (peer) {
    peer.consumers.forEach((c) => {
      stopKeyframeTimer(c.id);
      try { c.close(); } catch { }
    });
    peer.producers.forEach((p) => {
      try { p.close(); } catch { }
    });
    peer.transports.forEach(({ transport }) => {
      try { transport.close(); } catch { }
    });
    room.peers.delete(userId);
  }

  if (room.peers.size === 0) {
    try {
      await room.router.close();
    } catch { }
    rooms.delete(roomId);
  }
}

export async function createWebRtcTransport(
  roomId: string,
  userId: string,
  direction: Direction
): Promise<types.WebRtcTransport> {
  const room = await getOrCreateRoom(roomId);
  const peer = await addPeer(roomId, userId);

  const { router } = room;

  const preferTcp = String(process.env.MEDIASOUP_PREFER_TCP || "").toLowerCase() === "true";
  const enableUdp = String(process.env.MEDIASOUP_ENABLE_UDP || "true").toLowerCase() !== "false";
  const enableTcp = String(process.env.MEDIASOUP_ENABLE_TCP || "true").toLowerCase() !== "false";
  const initialOutgoingBitrate = Number(process.env.MEDIASOUP_INITIAL_OUTGOING_BITRATE || 1000000);
  const maxIncomingBitrate = Number(process.env.MEDIASOUP_MAX_INCOMING_BITRATE || 3000000);
  const maxOutgoingBitrate = Number(process.env.MEDIASOUP_MAX_OUTGOING_BITRATE || 2500000);

  const transport = await router.createWebRtcTransport({
    listenIps: [
      // Adjust ip and announcedIp for your deployment
      { ip: "0.0.0.0", announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined },
    ],
    enableUdp,
    enableTcp,
    preferUdp: !preferTcp,
    preferTcp,
    enableSctp: false,
    initialAvailableOutgoingBitrate: initialOutgoingBitrate,
  });

  console.log("[MS] transport created", {
    roomId,
    userId,
    direction,
    transportId: transport.id,
    announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || null,
    enableUdp,
    enableTcp,
    preferTcp,
    initialOutgoingBitrate,
  });

  transport.on("icestatechange", (iceState) => {
    console.log("[MS] transport ice state", {
      roomId,
      userId,
      direction,
      transportId: transport.id,
      iceState,
    });
  });

  transport.on("iceselectedtuplechange", (tuple) => {
    console.log("[MS] transport selected tuple", {
      roomId,
      userId,
      direction,
      transportId: transport.id,
      protocol: tuple?.protocol,
      localIp: tuple?.localIp,
      localPort: tuple?.localPort,
      remoteIp: tuple?.remoteIp,
      remotePort: tuple?.remotePort,
    });
  });

  transport.on("dtlsstatechange", (dtlsState) => {
    console.log("[MS] transport dtls state", {
      roomId,
      userId,
      direction,
      transportId: transport.id,
      dtlsState,
    });
  });

  // Cap how much the server will push to each receiving client (prevents flooding on slow links)
  if (direction === "recv") {
    // SFU -> Client
    await transport.setMaxOutgoingBitrate(maxOutgoingBitrate);
  } else {
    // Client -> SFU
    await transport.setMaxIncomingBitrate(maxIncomingBitrate);
  }

  peer.transports.set(transport.id, { transport, direction });
  return transport;
}

export async function connectTransport(
  roomId: string,
  userId: string,
  transportId: string,
  dtlsParameters: types.DtlsParameters
): Promise<void> {
  const room = rooms.get(roomId);
  if (!room) return;
  const peer = room.peers.get(userId);
  if (!peer) return;
  const entry = peer.transports.get(transportId);
  if (!entry) return;
  await entry.transport.connect({ dtlsParameters });
}

export async function createProducer(
  roomId: string,
  userId: string,
  transportId: string,
  kind: types.MediaKind,
  rtpParameters: types.RtpParameters,
  encodings?: types.RtpEncodingParameters[],
  appData?: {
    width?: number;
    height?: number;
    rotation?: number;
    source?: string;
    portraitLock?: boolean;
  },
): Promise<types.Producer | null> {
  const room = rooms.get(roomId);
  if (!room) return null;
  const peer = room.peers.get(userId);
  if (!peer) return null;
  const entry = peer.transports.get(transportId);
  if (!entry || entry.direction !== "send") return null;
  const transport = entry.transport;

  const producerRtpParameters = encodings
    ? { ...rtpParameters, encodings }
    : rtpParameters;

  if (kind === "audio" && !hasCodecMimeType(producerRtpParameters, "audio/opus")) {
    return null;
  }
  if (
    kind === "video" &&
    !(
      hasCodecMimeType(producerRtpParameters, "video/h264") ||
      hasCodecMimeType(producerRtpParameters, "video/vp8")
    )
  ) {
    return null;
  }

  const producer = await transport.produce({
    kind,
    rtpParameters: producerRtpParameters,
  });
  peer.producers.set(producer.id, producer);

  if (
    appData &&
    (appData.width ||
      appData.height ||
      appData.rotation !== undefined ||
      appData.source ||
      appData.portraitLock !== undefined)
  ) {
    peer.producerMeta.set(producer.id, {
      width: appData.width,
      height: appData.height,
      rotation: appData.rotation,
      source: appData.source,
      portraitLock: appData.portraitLock,
    });
  }

  return producer;
}

export async function createConsumer(
  roomId: string,
  userId: string,
  producerId: string,
  rtpCapabilities: types.RtpCapabilities
): Promise<{ consumer: types.Consumer; peerUserId: string } | null> {
  const room = rooms.get(roomId);
  if (!room) return null;

  const consumeRtpCapabilities = ensureConsumeHeaderExtensions(
    filterSupportedConsumeCapabilities(rtpCapabilities),
    room.router.rtpCapabilities,
  );
  if (!room.router.canConsume({ producerId, rtpCapabilities: consumeRtpCapabilities })) {
    return null;
  }

  // Find which peer owns this producer
  let targetPeer: PeerState | null = null;
  let targetUserId = "";
  for (const [pid, peer] of room.peers.entries()) {
    if (peer.producers.has(producerId)) {
      targetPeer = peer;
      targetUserId = pid;
      break;
    }
  }

  if (!targetPeer || !targetUserId) return null;

  const peer = room.peers.get(userId);
  if (!peer) return null;

  // Pick this peer's recv transport (never the send transport)
  const recvEntry = Array.from(peer.transports.values()).find(
    (t) => t.direction === "recv"
  );
  if (!recvEntry) return null;
  const transport = recvEntry.transport;

  const consumer = await transport.consume({
    producerId,
    rtpCapabilities: consumeRtpCapabilities,
    paused: true,  // Always start paused; client must explicitly resume after setup
  });

  peer.consumers.set(consumer.id, consumer);
  startKeyframeTimer(consumer);
  return { consumer, peerUserId: targetUserId };
}

export async function resumeConsumer(
  roomId: string,
  userId: string,
  consumerId: string
): Promise<void> {
  const room = rooms.get(roomId);
  if (!room) return;
  const peer = room.peers.get(userId);
  if (!peer) return;
  const consumer = peer.consumers.get(consumerId);
  if (!consumer) return;
  await consumer.resume();
}

export async function setConsumerPreferredLayers(
  roomId: string,
  userId: string,
  consumerId: string,
  spatialLayer: number,
  temporalLayer: number
): Promise<void> {
  const room = rooms.get(roomId);
  if (!room) return;
  const peer = room.peers.get(userId);
  if (!peer) return;
  const consumer = peer.consumers.get(consumerId);
  if (!consumer || consumer.kind !== "video") return;
  try {
    await consumer.setPreferredLayers({ spatialLayer, temporalLayer });
  } catch {
    // ignore if codec doesn't support layers
  }
}

export function getRouterRtpCapabilities(roomId: string): types.RtpCapabilities | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  return room.router.rtpCapabilities;
}

export async function restartTransportIce(
  roomId: string,
  userId: string,
  transportId: string
): Promise<types.IceParameters | null> {
  const room = rooms.get(roomId);
  if (!room) return null;
  const peer = room.peers.get(userId);
  if (!peer) return null;
  const entry = peer.transports.get(transportId);
  if (!entry) return null;
  return entry.transport.restartIce();
}

export function getRoomProducers(
  roomId: string,
  excludeUserId?: string
): {
  producerId: string;
  userId: string;
  kind: types.MediaKind;
  width?: number;
  height?: number;
  rotation?: number;
  source?: string;
  portraitLock?: boolean;
}[] {
  const room = rooms.get(roomId);
  if (!room) return [];

  const result: {
    producerId: string;
    userId: string;
    kind: types.MediaKind;
    width?: number;
    height?: number;
    rotation?: number;
    source?: string;
    portraitLock?: boolean;
  }[] = [];

  for (const [userId, peer] of room.peers.entries()) {
    if (excludeUserId && userId === excludeUserId) continue;

    peer.producers.forEach((producer, producerId) => {
      const meta = peer.producerMeta.get(producerId);
      result.push({
        producerId,
        userId,
        kind: producer.kind,
        width: meta?.width,
        height: meta?.height,
        rotation: meta?.rotation,
        source: meta?.source,
        portraitLock: meta?.portraitLock,
      });
    });
  }

  return result;
}
