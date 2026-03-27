// Centralized mediasoup/call helpers for the web client.
// Encapsulates socket emissions for room join/leave and MS-* signaling.

/**
 * Join a mediasoup-backed room (regular or guest).
 * Returns the ack payload from the server (if any).
 */
export function joinRoom(socket, { joinEvent = "BE-join-room", payload }) {
  return new Promise((resolve, reject) => {
    try {
      socket.emit(joinEvent, payload, (ack) => {
        resolve(ack || {});
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Leave a mediasoup-backed room (regular or guest).
 */
export function leaveRoom(socket, { leaveEvent = "BE-leave-room", roomId, leaver }) {
  try {
    socket.emit(leaveEvent, { roomId, leaver });
  } catch (err) {
    console.error("leaveRoom emit failed:", err);
  }
}

// ---- Mediasoup SFU signaling helpers ----

export function getIceServers(socket) {
  return new Promise((resolve, reject) => {
    socket.emit("MS-get-ice-servers", (res) => {
      if (res && res.ok) resolve({ iceServers: res.iceServers, iceTransportPolicy: res.iceTransportPolicy });
      else reject(res?.error || "failed");
    });
  });
}

export function getRtpCapabilities(socket, { roomId }) {
  return new Promise((resolve, reject) => {
    socket.emit("MS-get-rtp-capabilities", { roomId }, (res) => {
      if (res && res.ok && res.rtpCapabilities) resolve(res.rtpCapabilities);
      else reject(res?.error || "failed");
    });
  });
}

export function createTransport(socket, { roomId, userId, direction }) {
  return new Promise((resolve, reject) => {
    socket.emit(
      "MS-create-transport",
      { roomId, userId, direction },
      (res) => {
        if (res && res.ok) resolve(res);
        else reject(res?.error || "failed");
      }
    );
  });
}

export function connectTransport(socket, { roomId, userId, transportId, dtlsParameters }) {
  return new Promise((resolve, reject) => {
    socket.emit(
      "MS-connect-transport",
      { roomId, userId, transportId, dtlsParameters },
      (res) => {
        if (res && res.ok) resolve(res);
        else reject(res?.error || "failed");
      }
    );
  });
}

export function produce(socket, { roomId, userId, transportId, kind, rtpParameters, encodings }) {
  return new Promise((resolve, reject) => {
    socket.emit(
      "MS-produce",
      { roomId, userId, transportId, kind, rtpParameters, encodings },
      (res) => {
        if (res && res.ok && res.id) resolve(res.id);
        else reject(res?.error || "failed");
      }
    );
  });
}

export function getProducers(socket, { roomId, userId }) {
  return new Promise((resolve, reject) => {
    socket.emit(
      "MS-get-producers",
      { roomId, userId },
      (res) => {
        if (res && res.ok) resolve(res.producers || []);
        else reject(res?.error || "failed");
      }
    );
  });
}

export function consume(socket, { roomId, userId, producerId, rtpCapabilities }) {
  return new Promise((resolve, reject) => {
    socket.emit(
      "MS-consume",
      { roomId, userId, producerId, rtpCapabilities },
      (res) => {
        if (res && res.ok) resolve(res);
        else reject(res?.error || "failed");
      }
    );
  });
}

