// Frontend: call.js
import React, { useEffect, useRef, useState } from "react";


const Call = ({ group_id, user_id, socketRef }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(new MediaStream());
  const pcRefs = useRef({});
  const localStreamRef = useRef(null);

  useEffect(() => {
    const initWebRTC = async () => {
      try {
        // Check available devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasAudio = devices.some((device) => device.kind === "audioinput");
        const hasVideo = devices.some((device) => device.kind === "videoinput");
        // Request only available media
        const constraints = { audio: hasAudio, video: hasVideo };
        localStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
        localVideoRef.current.srcObject = localStreamRef.current;

        socketRef.current.emit("joinRoom", { roomId: group_id, userId: user_id });
      } catch (error) {
        alert("Error accessing media devices:", error);
      }
    };

    socketRef.current.on("userJoined", async (data) => {
      // Only create peer connection if it's not ourselves
      if (data.socketId !== socketRef.current.id) {
        await createPeerConnection(data.socketId);
      }
      await createPeerConnection(data.socketId);
    });

    socketRef.current.on("offer", async ({ offer, from }) => {
      
      if (!pcRefs.current[from]) await createPeerConnection(from);
      const pc = pcRefs.current[from];
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit("answer", { to: from, answer });
    });

    socketRef.current.on("answer", ({ answer, from }) => {
      const pc = pcRefs.current[from];
      pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socketRef.current.on("ice-candidate", ({ candidate, from }) => {
      const pc = pcRefs.current[from];
      if (pc && candidate) pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    initWebRTC();

    return () => {
      // socketRef.current.disconnect();
      Object.values(pcRefs.current).forEach(pc => pc.close());
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [socketRef, group_id, user_id]);

  const createPeerConnection = async (socketId) => {
    // Check for existing connection
    if (pcRefs.current[socketId]) {
      console.warn(`Peer connection already exists for ${socketId}`);
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    pcRefs.current[socketId] = pc;

    // Add state tracking
    let makingOffer = false;
    let ignoreOffer = false;

    // Handle negotiation events
    pc.onnegotiationneeded = async () => {
      try {
        makingOffer = true;
        await pc.setLocalDescription(await pc.createOffer());
        socketRef.current.emit("offer", {
          to: socketId,
          offer: pc.localDescription
        });
      } catch (err) {
        console.error("Negotiation error:", err);
      } finally {
        makingOffer = false;
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socketRef.current.emit("ice-candidate", {
          to: socketId,
          candidate
        });
      }
    };

    // Handle incoming tracks
    pc.ontrack = ({ streams: [stream] }) => {
      setRemoteStream(prev => [...prev, stream]);
    };

    // Add existing tracks
    localStreamRef.current.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current);
    });

    // Handle signaling messages
    const handleSignaling = async ({ description, candidate }) => {

      try {
        if (description) {
          const isStable = !makingOffer && pc.signalingState === "stable";
          const offerCollision = description.type === "offer" && !isStable;

          ignoreOffer = !isPolitePeer && offerCollision;
          if (ignoreOffer) return;

          await pc.setRemoteDescription(description);

          if (description.type === "offer") {
            await pc.setLocalDescription(await pc.createAnswer());
            socketRef.current.emit("answer", {
              to: socketId,
              answer: pc.localDescription
            });
          }
        } else if (candidate) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (err) {
            if (!ignoreOffer) throw err;
          }
        }
      } catch (err) {
        console.error("Signaling error:", err);
      }
    };

    // Listen for signaling messages specific to this peer
    socketRef.current.on(`signal:${socketId}`, handleSignaling);

    return pc;
  };

  return (
    <div>
      <video ref={localVideoRef} autoPlay muted />
      <video ref={remoteVideoRef} autoPlay />
    </div>
  );
};

export default Call;