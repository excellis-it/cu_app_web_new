import { types, createWorker } from "mediasoup";

type Direction = "send" | "recv";

interface PeerTransport {
  transport: types.WebRtcTransport;
  direction: Direction;
}

export interface PeerState {
  transports: Map<string, PeerTransport>;
  producers: Map<string, types.Producer>;
  consumers: Map<string, types.Consumer>;
}

export interface RoomState {
  id: string;
  router: types.Router;
  peers: Map<string, PeerState>; // key: userId
}

const rooms: Map<string, RoomState> = new Map();

let workerPromise: Promise<types.Worker> | null = null;

async function getWorker(): Promise<types.Worker> {
  if (!workerPromise) {
    workerPromise = createWorker({
      logLevel: "warn",
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    });
  }
  return workerPromise;
}

// Basic audio/video codecs – adjust as needed for your deployment
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
    mimeType: "video/VP8",
    clockRate: 90000,
    preferredPayloadType: 96,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

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

  const transport = await router.createWebRtcTransport({
    listenIps: [
      // Adjust ip and announcedIp for your deployment
      { ip: "0.0.0.0", announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 800000,
  });

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
  encodings?: types.RtpEncodingParameters[]
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

  const producer = await transport.produce({
    kind,
    rtpParameters: producerRtpParameters,
  });
  peer.producers.set(producer.id, producer);
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

  if (!room.router.canConsume({ producerId, rtpCapabilities })) {
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
    rtpCapabilities,
    paused: false,
  });

  peer.consumers.set(consumer.id, consumer);
  return { consumer, peerUserId: targetUserId };
}

export function getRouterRtpCapabilities(roomId: string): types.RtpCapabilities | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  return room.router.rtpCapabilities;
}

export function getRoomProducers(
  roomId: string,
  excludeUserId?: string
): { producerId: string; userId: string; kind: types.MediaKind }[] {
  const room = rooms.get(roomId);
  if (!room) return [];

  const result: { producerId: string; userId: string; kind: types.MediaKind }[] = [];

  for (const [userId, peer] of room.peers.entries()) {
    if (excludeUserId && userId === excludeUserId) continue;

    peer.producers.forEach((producer, producerId) => {
      result.push({
        producerId,
        userId,
        kind: producer.kind,
      });
    });
  }

  return result;
}

