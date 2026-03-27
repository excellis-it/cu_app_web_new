import React, { useState, useEffect, useRef } from "react";
import { IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import styled, { keyframes } from "styled-components";
import VideoCard from "./VideoCard";
import BottomBar from "./BottomBar";
import ChatArea from "./ChatArea";
import { useRouter } from 'next/router';
import { toast } from "react-toastify";
import ReconnectModal from "./reconnectionModalComponant";
import { useAppContext } from "../appContext/appContext";
import { Device } from "mediasoup-client";
import { createDummyMediaStream } from "../utils/createDummyMediaStream";
import * as callService from "../utils/callService";

const Room = ({ socketRef, room_id, onSendData, callType, joinEvent, leaveEvent, isGuestMeeting, chatAreaProps }) => {

  const { globalUser, setGlobalUser } = useAppContext();
  const currentUser = sessionStorage.getItem("user");
  const currentUserFullName = sessionStorage.getItem("fullName");
  const [userVideoAudio, setUserVideoAudio] = useState({
    localUser: { video: true, audio: true },
  });
  const [constraints, setConstraints] = useState({ audio: true, video: true });
  const [videoDevices, setVideoDevices] = useState([]);
  const [screenShare, setScreenShare] = useState(false);
  const [screenShareLoading, setScreenShareLoading] = useState(false);
  const [currentScreenSharer, setCurrentScreenSharer] = useState(null); // Track who is sharing
  const [showVideoDevices, setShowVideoDevices] = useState(false);
  const [showModal, setShowModal] = useState(true);
  const [isFloating, setIsFloating] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [stream, setStream] = useState(null);
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const [hasRealDevices, setHasRealDevices] = useState(false);
  const [hasRealVideo, setHasRealVideo] = useState(false);
  const [waitingCalls, setWaitingCalls] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Phase 1 call recording (admin controlled)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlinkOn, setRecordingBlinkOn] = useState(true);
  // Used to prevent duplicate clicks during network upload/processing.
  // Must be false while the MediaRecorder is actively capturing, otherwise Stop stays disabled.
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [activeRecordingId, setActiveRecordingId] = useState(null);

  const isAudioOnlyCall = callType === "audio";

  const groupAdmins =
    chatAreaProps?.groupDataDetails?.admins ||
    chatAreaProps?.selected?.admins ||
    [];
  const isGroupAdmin = Array.isArray(groupAdmins)
    ? groupAdmins.some((adminId) => String(adminId) === String(currentUser))
    : false;

  // Mediasoup-specific refs/state (web SFU path)
  // Mediasoup SFU is now always enabled for web calls.
  const useMediasoup = true;
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const audioProducerRef = useRef(null);
  const videoProducerRef = useRef(null);
  const remoteStreamsRef = useRef({}); // userId -> MediaStream
  const consumedProducerIdsRef = useRef(new Set()); // track consumed producerIds to prevent duplicates
  const callGenRef = useRef(0); // incremented each time initializeMediasoup runs; stale retries self-invalidate
  const [remotePeers, setRemotePeers] = useState([]); // [{ userId, stream }]

  const userVideoRef = useRef();
  const screenTrackRef = useRef();
  const wasVideoProducerPausedBeforeShareRef = useRef(false);
  const userStream = useRef();
  const roomId = room_id;
  const router = useRouter();
  const hasReceivedInitialUsers = useRef(false);
  const socketHandlersRegisteredRef = useRef(false);
  const pendingConsumePeerIdsRef = useRef(new Set());

  // MediaRecorder / mixing refs (browser-side recorder)
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingStartTimeRef = useRef(null);
  const recordingCanvasRef = useRef(null);
  const recordingDrawTimerRef = useRef(null);

  const boxRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({
    x: 0,
    y: 0
  });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!isRecording) {
      setRecordingBlinkOn(true);
      return;
    }
    const timer = setInterval(() => {
      setRecordingBlinkOn((prev) => !prev);
    }, 700);
    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    const handleOffline = (e) => {
      toast.error("You are offline!", {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
    };

    const handleOnline = async (e) => {
      toast.success("You are back online!", {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
      setShowReconnectModal(true);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    if (dragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, offset]);

  // Use shared dummy stream helper
  function getDummyStream() {
    return createDummyMediaStream();
  }

  // Fallback: fetch and consume producers for a newly joined peer (in case MS-new-producer was missed)
  const fetchAndConsumeProducersForNewPeer = async (rId, myUserId, newPeerUserId, retryCount = 0, callGen = callGenRef.current) => {
    // Abort if a new call has started since this retry chain was created
    if (callGenRef.current !== callGen) {
      console.log("[room.js] fetchAndConsumeProducers: stale call gen, aborting", { callGen, current: callGenRef.current });
      return;
    }
    const socket = socketRef.current;
    // Use refs first; fall back to socket-stored (survives Room remounts)
    const device = deviceRef.current || socket?.mediasoupDevice;
    const recvTransport = recvTransportRef.current || socket?.mediasoupRecvTransport;
    // Also check device.loaded — device object may exist but rtpCapabilities empty
    // if initializeMediasoup hasn't finished device.load() yet → causes cannot-consume errors
    if (!socket || !device || !device.loaded || !recvTransport) {
      console.warn("[room.js] fetchAndConsumeProducers: mediasoup not ready", {
        hasSocket: !!socket,
        hasDeviceRef: !!deviceRef.current,
        deviceLoaded: !!device?.loaded,
        hasDeviceOnSocket: !!socket?.mediasoupDevice,
        hasRecvRef: !!recvTransportRef.current,
        hasRecvOnSocket: !!socket?.mediasoupRecvTransport,
        retryCount,
      });
      if (retryCount < 15) {
        console.log("[room.js] fetchAndConsumeProducers: retrying in 1s", {
          attempt: retryCount + 1,
          max: 15,
        });
        setTimeout(() => fetchAndConsumeProducersForNewPeer(rId, myUserId, newPeerUserId, retryCount + 1, callGen), 1000);
      }
      return;
    }
    const stream = remoteStreamsRef.current[newPeerUserId];
    if (!stream || stream.getTracks().length > 0) return; // already have tracks
    try {
      const roomIdStr = String(rId);
      console.log("[room.js] fetchAndConsumeProducers: calling MS-get-producers", {
        roomId: roomIdStr,
        myUserId,
        newPeerUserId,
      });
      const existing = await callService.getProducers(socket, { roomId: roomIdStr, userId: myUserId });
      const forPeer = existing.filter((p) => String(p.userId) === String(newPeerUserId));
      console.log("[room.js] fetchAndConsumeProducers", {
        newPeerUserId,
        totalProducers: existing.length,
        forThisPeer: forPeer.length,
      });
      if (forPeer.length === 0) {
        // Peer joined the socket room but hasn't published mediasoup producers yet — retry
        if (retryCount < 15) {
          console.log("[room.js] fetchAndConsumeProducers: no producers yet for peer, retrying in 1s", {
            newPeerUserId,
            attempt: retryCount + 1,
            max: 15,
          });
          setTimeout(() => fetchAndConsumeProducersForNewPeer(rId, myUserId, newPeerUserId, retryCount + 1, callGen), 1000);
        }
        return;
      }
      for (const p of forPeer) {
        try {
          if (consumedProducerIdsRef.current.has(p.producerId)) {
            console.log("[room.js] fetchAndConsumeProducers: skipping duplicate producer", p.producerId);
            continue;
          }
          consumedProducerIdsRef.current.add(p.producerId);
          console.log("[room.js] fetchAndConsumeProducers: consuming producer", {
            producerId: p.producerId,
            kind: p.kind,
          });
          const consumeInfo = await callService.consume(socket, {
            roomId: rId,
            userId: myUserId,
            producerId: p.producerId,
            rtpCapabilities: device.rtpCapabilities,
          });
          const consumer = await recvTransport.consume({
            id: consumeInfo.id,
            producerId: consumeInfo.producerId,
            kind: consumeInfo.kind,
            rtpParameters: consumeInfo.rtpParameters,
            paused: consumeInfo.paused ?? true,
          });
          console.log("[room.js] consumer track state (retry)", { kind: consumer.kind, paused: consumer.paused, trackMuted: consumer.track.muted, trackReadyState: consumer.track.readyState });
          const kind = consumeInfo.kind || p.kind;
          let existingStream = remoteStreamsRef.current[newPeerUserId];
          if (!existingStream) existingStream = new MediaStream();
          else {
            if (kind === "video") existingStream.getVideoTracks().forEach((t) => existingStream.removeTrack(t));
            else if (kind === "audio") existingStream.getAudioTracks().forEach((t) => existingStream.removeTrack(t));
          }
          existingStream.addTrack(consumer.track);
          const newStream = new MediaStream(existingStream.getTracks());
          remoteStreamsRef.current[newPeerUserId] = newStream;
          setRemotePeers(Object.entries(remoteStreamsRef.current).map(([uid, s]) => ({ userId: uid, stream: s })));
          console.log("[room.js] fetchAndConsumeProducers: consumed producer for", newPeerUserId);

          // Resume consumer — server creates consumers paused=true
          socket.emit("MS-resume-consumer", { roomId: rId, userId: myUserId, consumerId: consumer.id });
          if (kind === "video") {
            socket.emit("MS-set-preferred-layers", {
              roomId: rId,
              userId: myUserId,
              consumerId: consumer.id,
              spatialLayer: 0,
              temporalLayer: 1,
            });
          }
        } catch (err) {
          consumedProducerIdsRef.current.delete(p.producerId); // allow retry on failure
          console.error("[room.js] Error consuming producer in fallback:", err);
        }
      }
    } catch (err) {
      console.error("[room.js] fetchAndConsumeProducers failed:", err);
    }
  };

  useEffect(() => {
    window.userStream = userStream.current; // or use a React Context
  }, [userStream.current]);

  // Debug: log whenever remotePeers changes so we can see who is being rendered
  useEffect(() => {
    console.log("[room.js] remotePeers updated:", remotePeers.map(p => ({
      userId: p.userId,
      hasAudio: !!p.stream?.getAudioTracks()?.length,
      hasVideo: !!p.stream?.getVideoTracks()?.length,
    })));
  }, [remotePeers]);

  // Local audio level detector to indicate when user is speaking
  useEffect(() => {
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    let audioContext;
    let source;
    let analyser;
    let rafId;

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;

      audioContext = new AC();
      const stream = new MediaStream([audioTrack]);
      source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] - 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        // Slightly lower threshold so normal speech is detected
        setIsSpeaking(rms > 4);
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    } catch (e) {
      console.warn("Audio level meter init failed:", e);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      try { source && source.disconnect(); } catch { }
      try { analyser && analyser.disconnect(); } catch { }
      try { audioContext && audioContext.close(); } catch { }
    };
  }, [stream]);



  const initializeMedia = async () => {
    try {
      console.log("[room.js] initializeMedia start", {
        useMediasoup,
        socketReady: !!socketRef.current,
        roomId,
        currentUser,
      });
      // Reset the flag when initializing media (happens on mount/rejoin)
      // This ensures we properly detect initial sync when rejoining
      hasReceivedInitialUsers.current = false;

      let localStreamRef;
      let deviceCheckPassed = false;
      let videoCheckPassed = false;
      // Declare tracks outside so they are always in scope
      let audioTrack = null;
      let videoTrack = null;

      try {
        // If a pre-call stream was provided by the start_call popup, reuse it
        // so we don't request camera/mic again and risk failures.
        if (typeof window !== "undefined" && window.exTalkPreCallStream) {
          localStreamRef = window.exTalkPreCallStream;
          window.exTalkPreCallStream = null;
          audioTrack = localStreamRef.getAudioTracks()[0] || null;
          videoTrack = localStreamRef.getVideoTracks()[0] || null;
          deviceCheckPassed = !!(audioTrack || videoTrack);
          videoCheckPassed = !!videoTrack;
          console.log("[room.js] Reusing pre-call media stream", {
            streamId: localStreamRef.id,
            hasAudio: !!audioTrack,
            hasVideo: !!videoTrack,
          });
        } else if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          console.warn("mediaDevices.enumerateDevices not available; skipping device check and using dummy stream.");
          // Leave deviceCheckPassed = false so we hit the dummy-stream fallback below.
        } else {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const hasAudio = devices.some((device) => device.kind === "audioinput");
          const hasVideo = devices.some((device) => device.kind === "videoinput");

          setVideoDevices(devices.filter((device) => device.kind === "videoinput"));

          // First, try to get audio if available
          if (hasAudio) {
            try {
              const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
              audioTrack = audioStream.getAudioTracks()[0];
              console.log("[room.js] Successfully captured audio track");
            } catch (audioErr) {
              console.warn("Audio capture failed:", audioErr);
              if (audioErr.name === "NotAllowedError") {
                toast.error("Microphone permission denied. Please allow access to microphone.");
              }
            }
          }

          // Always try to get video on video calls, regardless of enumerateDevices(),
          // and fall back gracefully if it fails or there is no physical camera.
          if (!isAudioOnlyCall) {
            try {
              const videoStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  frameRate: { ideal: 30, max: 30 }
                }
              });
              videoTrack = videoStream.getVideoTracks()[0];
              console.log("[room.js] Successfully captured video track");
            } catch (videoErr) {
              console.warn("Video capture failed:", videoErr);
              if (videoErr.name === "NotAllowedError") {
                toast.error("Camera permission denied. Please allow access to camera.");
              }
            }
          }
        }

        // Build the local stream based on what we got
        const tracks = [];

        // Create dummy stream once (we'll extract tracks from it as needed)
        let dummyStream = null;
        const getDummy = () => {
          if (!dummyStream) {
            dummyStream = getDummyStream();
          }
          return dummyStream;
        };

        // Add real audio track if we got it, otherwise create silent dummy
        if (audioTrack) {
          tracks.push(audioTrack);
          deviceCheckPassed = true;
          console.log("[room.js] Using real audio track");
        } else {
          // Only use dummy audio if we absolutely couldn't get real audio
          const dummy = getDummy();
          const dummyAudioTrack = dummy.getAudioTracks()[0];
          tracks.push(dummyAudioTrack);
          console.log("[room.js] Using dummy audio track (no microphone available)");
        }

        // Add real video track if we got it, otherwise create dummy video track.
        // For audio-only calls we skip adding any video track so nothing is broadcast.
        if (!isAudioOnlyCall) {
          if (videoTrack) {
            tracks.push(videoTrack);
            deviceCheckPassed = true;
            videoCheckPassed = true;
            console.log("[room.js] Using real video track");
          } else {
            // Always add a dummy video track for screen sharing support
            const dummy = getDummy();
            const dummyVideoTrack = dummy.getVideoTracks()[0];
            tracks.push(dummyVideoTrack);
            console.log("[room.js] Using dummy video track (no camera)", {
              trackId: dummyVideoTrack?.id,
              enabled: dummyVideoTrack?.enabled,
              readyState: dummyVideoTrack?.readyState
            });
          }
        }

        localStreamRef = new MediaStream(tracks);

        console.log("[room.js] ✅ Local stream created successfully:", {
          streamId: localStreamRef.id,
          audioTracks: localStreamRef.getAudioTracks().length,
          videoTracks: localStreamRef.getVideoTracks().length,
          audioEnabled: localStreamRef.getAudioTracks()[0]?.enabled,
          audioLabel: localStreamRef.getAudioTracks()[0]?.label,
          audioReadyState: localStreamRef.getAudioTracks()[0]?.readyState,
          videoEnabled: localStreamRef.getVideoTracks()[0]?.enabled,
          videoLabel: localStreamRef.getVideoTracks()[0]?.label,
          videoReadyState: localStreamRef.getVideoTracks()[0]?.readyState,
          hasRealDevices: deviceCheckPassed
        });



        setHasRealDevices(deviceCheckPassed);
        setHasRealVideo(!isAudioOnlyCall && videoCheckPassed);
        setUserVideoAudio(prev => ({
          ...prev,
          // Set video/audio to true if tracks exist in stream (including dummy tracks)
          localUser: {
            video: localStreamRef.getVideoTracks().length > 0,
            audio: localStreamRef.getAudioTracks().length > 0
          }
        }));

      } catch (err) {
        console.error("getUserMedia / enumerateDevices failed:", err);
        if (err.name === "NotReadableError") {
          toast.error("Camera or microphone is already in use.");
        } else if (err.name === "NotAllowedError") {
          toast.error("Permission denied. Please allow access to camera and microphone.");
        } else {
          console.warn("Media access failed, using dummy stream");
        }
      }

      if (!deviceCheckPassed) {
        if (isAudioOnlyCall) {
          // For audio-only calls with no real devices, create a dummy stream
          // that only contains an (almost silent) audio track.
          const dummy = getDummyStream();
          const dummyAudio = dummy.getAudioTracks()[0];
          localStreamRef = new MediaStream(dummyAudio ? [dummyAudio] : []);
        } else {
          localStreamRef = getDummyStream();
        }
        setHasRealDevices(false);
        setHasRealVideo(false);
        setUserVideoAudio(prev => ({
          ...prev,
          // Even dummy stream has video/audio tracks that should be shown
          localUser: {
            video: localStreamRef.getVideoTracks().length > 0,
            audio: localStreamRef.getAudioTracks().length > 0
          }
        }));

        console.log("[room.js] Using fallback dummy stream with tracks:", {
          videoTracks: localStreamRef.getVideoTracks().length,
          audioTracks: localStreamRef.getAudioTracks().length
        });
      }

      setStream(localStreamRef);
      userStream.current = localStreamRef;

      if (userVideoRef.current) {
        userVideoRef.current.srcObject = localStreamRef;
        try {
          if (userVideoRef.current.readyState >= 2) {
            const playPromise = userVideoRef.current.play();
            if (playPromise && typeof playPromise.catch === "function") {
              playPromise.catch((err) => {
                if (err?.name === "AbortError") {
                  return; // ignore interrupted play requests
                }
                console.warn("Video play failed:", err);
              });
            }
          }
        } catch (playError) {
          console.warn("Video play failed:", playError);
        }
      }

      // Debug: Log local stream tracks
      if (localStreamRef) {
        if (localStreamRef.getVideoTracks().length > 0) {
          console.log("[room.js] Local video track readyState:", localStreamRef.getVideoTracks()[0].readyState);
        }
      }

      // Ensure socket event handlers are registered BEFORE we join the room,
      // so we don't miss FE-user-join and other events emitted from BE-join-room.
      if (!socketHandlersRegisteredRef.current && socketRef.current) {
        socketHandlersRegisteredRef.current = true;

        // Socket event handlers (presence / UX only; media is handled by mediasoup)
        socketRef.current.on("FE-user-join", (users) => {
        console.log("[room.js] FE-user-join received:", {
          rawUsers: users,
          currentUser,
        });
        // If receiving multiple users, it's the initial sync (when joining/rejoining)
        // If receiving a single user, it's a new user actually joining
        // Note: Backend sends all users including yourself, so if length > 1, it's initial sync
        const isInitialSync = users.length > 1;

        // Count how many non-self users we're processing
        const otherUsers = users.filter(({ info }) => info && info.userName !== currentUser);
        const isProcessingMultipleOtherUsers = otherUsers.length > 1;

        // Mark that we've received the initial user list BEFORE processing users
        // This ensures we don't show toasts during initial sync
        if (isInitialSync || isProcessingMultipleOtherUsers) {
          hasReceivedInitialUsers.current = true;
        }

        users.forEach(({ userId, info }) => {
          if (!info) {
            console.log("[room.js] FE-user-join: skipping user with missing info", { userId });
            return;
          }
          const { userName, video, audio, name, fullName, senderName } = info;
          // Treat participants as "remote" based on socket id, not username.
          // Use String() to avoid type mismatches (e.g. undefined vs "undefined").
          const myId = socketRef.current?.id;
          if (!myId || String(userId) === String(myId)) {
            return;
          }
          if (!userName) {
            console.log("[room.js] FE-user-join: skipping user with missing userName", { userId, info });
            return;
          }
          {
            console.log("[room.js] registering remote user from FE-user-join", {
              userId,
              userName,
              video,
              audio,
            });
            const displayName = senderName || name || fullName || userName;
            setUserVideoAudio((prev) => ({
              ...prev,
              [userName]: {
                video,
                audio,
                senderName,
                name: displayName,
                fullName: displayName,
                socketId: userId,
              },
            }));

              // Ensure we have a remote MediaStream entry for this user so that
              // a tile is shown even before mediasoup finishes attaching tracks.
              if (!remoteStreamsRef.current[userName]) {
                remoteStreamsRef.current[userName] = new MediaStream();
                pendingConsumePeerIdsRef.current.add(userName);
                setRemotePeers(
                  Object.entries(remoteStreamsRef.current).map(([uid, stream]) => ({
                    userId: uid,
                    stream,
                  }))
                );
                // Fallback: call immediately (will retry every 1s if mediasoup not ready yet)
                fetchAndConsumeProducersForNewPeer(roomId, currentUser, userName);
              }

            const shouldShowToast =
              !isInitialSync &&
              !isProcessingMultipleOtherUsers &&
              hasReceivedInitialUsers.current;

            if (shouldShowToast) {
              toast.success(`${fullName || userName} joined the call`, {
                position: "top-right",
                autoClose: 3000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
              });
            }
          }
        });

        // Mark that we've received initial users if it was a single user (edge case)
        // This handles the case where we receive a single user before any initial sync
        if (!isInitialSync && !isProcessingMultipleOtherUsers && !hasReceivedInitialUsers.current) {
          hasReceivedInitialUsers.current = true;
        }
      });

        socketRef.current.on("FE-recording-started", (payload) => {
          try {
            const startedRecordingId = payload?.recordingId;
            const startedBy = payload?.startedBy;

            console.log("[room.js][REC] FE-recording-started", {
              payload,
              currentUser,
              isGroupAdmin,
            });

            setActiveRecordingId(startedRecordingId || null);
            setIsRecording(true);
            // Recording is active now; allow Stop button immediately.
            setRecordingBusy(false);

            // Server-side recording: do not start browser MediaRecorder/upload.
          } catch (e) {
            console.error("[room.js] FE-recording-started handler error", e);
          }
        });

        socketRef.current.on("FE-recording-stopped", (payload) => {
          try {
            const stoppedRecordingId = payload?.recordingId;
            const stoppedBy = payload?.stoppedBy;
            const startedBy = payload?.startedBy || stoppedBy;

            console.log("[room.js][REC] FE-recording-stopped", {
              payload,
              currentUser,
              startedBy,
              stoppedBy,
              willStopLocal:
                Boolean(startedBy) && String(startedBy) === String(currentUser),
            });

            setIsRecording(false);
            setRecordingBusy(false);
            setActiveRecordingId(null);

            // Server-side recording: do not stop browser MediaRecorder/upload.
          } catch (e) {
            console.error("[room.js] FE-recording-stopped handler error", e);
          }
        });

        socketRef.current.on("FE-recording-error", (payload) => {
          const message = payload?.message || "Recording error";
          toast.error(message, { position: "top-right", autoClose: 3500 });
          setRecordingBusy(false);
        });

        socketRef.current.on("FE-user-leave", ({ userId, userName, fullName }) => {
        if (!userName) {
          console.warn("[room.js] FE-user-leave: skipping, no userName in payload", { userId });
          return;
        }
        const info = userVideoAudio[userName] || {};
        const displayName =
          info.senderName || info.name || fullName || info.fullName || userName;
        toast.info(`${displayName} left the call`, {
          position: "top-right",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });

        setUserVideoAudio((prevUserVideoAudio) => {
          const { [userName]: _, ...rest } = prevUserVideoAudio;
          return rest;
        });

        // Remove any mediasoup-rendered stream for this user
        if (remoteStreamsRef.current[userName]) {
          delete remoteStreamsRef.current[userName];
          setRemotePeers(
            Object.entries(remoteStreamsRef.current).map(([uid, stream]) => ({
              userId: uid,
              stream,
            }))
          );
        }
      });

        socketRef.current.on("FE-toggle-camera", ({ userId, switchTarget }) => {
        const targetUserName = Object.keys(userVideoAudio).find(
          (name) => name === userId || userVideoAudio[name]?.socketId === userId
        );
        if (!targetUserName) return;

        setUserVideoAudio((prev) => ({
          ...prev,
          [targetUserName]: {
            ...prev[targetUserName],
            video:
              switchTarget === "video"
                ? !prev[targetUserName]?.video
                : prev[targetUserName]?.video,
            audio:
              switchTarget === "audio"
                ? !prev[targetUserName]?.audio
                : prev[targetUserName]?.audio,
          },
        }));
      });

        socketRef.current.on("FE-toggle-screen-share", ({ userId, isScreenShare, userName }) => {
        const peerIdx = findPeer(userId);
        if (peerIdx) {
          setUserVideoAudio((prev) => ({
            ...prev,
            [peerIdx.userName]: {
              ...prev[peerIdx.userName],
              isScreenShare: isScreenShare
            },
          }));

          // Track who is currently sharing
          if (isScreenShare) {
            setCurrentScreenSharer({ userId, userName: peerIdx.userName });
          } else {
            // Clear if this user stopped sharing
            setCurrentScreenSharer(prev =>
              prev?.userId === userId ? null : prev
            );
          }
        }
      });

        socketRef.current.on("FE-user-disconnected", (data) => {
        const disconnectedUserId = data?.userSocketId;
        if (!disconnectedUserId) return;

        // Show toast notification when user disconnects
        const displayName =
          data?.fullName || data?.userName || "A participant";
        toast.warning(`${displayName} disconnected from the call`, {
          position: "top-right",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });

        const userNameToRemove = data?.userName;

        if (userNameToRemove) {
          setUserVideoAudio((prevUserVideoAudio) => {
            const { [userNameToRemove]: _, ...rest } = prevUserVideoAudio;
            if (!rest.localUser && prevUserVideoAudio.localUser) {
              rest.localUser = prevUserVideoAudio.localUser;
            }
            return rest;
          });

          if (remoteStreamsRef.current[userNameToRemove]) {
            delete remoteStreamsRef.current[userNameToRemove];
            setRemotePeers(
              Object.entries(remoteStreamsRef.current).map(([uid, stream]) => ({
                userId: uid,
                stream,
              }))
            );
          }
        }
      });

        socketRef.current.on("FE-guest-disconnected", (data) => {
        const disconnectedUserId = data?.userSocketId;
        if (!disconnectedUserId) return;

        const userNameToRemove = data?.userName;

        if (userNameToRemove) {
          // Show toast notification when guest disconnects
          const displayName =
            data?.senderName || data?.name || data?.fullName || userNameToRemove || "Guest";
          toast.warning(`${displayName} disconnected from the call`, {
            position: "top-right",
            autoClose: 3000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });

          setUserVideoAudio((prevUserVideoAudio) => {
            const { [userNameToRemove]: _, ...rest } = prevUserVideoAudio;
            if (!rest.localUser && prevUserVideoAudio.localUser) {
              rest.localUser = prevUserVideoAudio.localUser;
            }
            return rest;
          });

          if (remoteStreamsRef.current[userNameToRemove]) {
            delete remoteStreamsRef.current[userNameToRemove];
            setRemotePeers(
              Object.entries(remoteStreamsRef.current).map(([uid, stream]) => ({
                userId: uid,
                stream,
              }))
            );
          }
        }
      });

        socketRef.current.on("waiting_call", (data) => {
        setWaitingCalls(prev => {
          // Avoid duplicates based on roomId or socketId
          if (prev.find(c => c.roomId === data.roomId)) return prev;
          return [...prev, data];
        });
        const callerDisplay = data.isDirect ? data.callerName : data.groupName;
        toast.info(`${callerDisplay} is calling (${data.callType})... Call is waiting.`);
      });

        // Clear waiting calls when a call ends
        socketRef.current.on("FE-call-ended", (data) => {
        if (data?.roomId) {
          setWaitingCalls(prev => prev.filter(c => c.roomId !== data.roomId));
        }
      });

        // Clear waiting calls when user leaves
        socketRef.current.on("FE-leave", (data) => {
        if (data?.roomId) {
          setWaitingCalls(prev => prev.filter(c => c.roomId !== data.roomId));
        }
      });
      }

      // Join room with device capability info via callService
      try {
        const ack = await callService.joinRoom(socketRef.current, {
          joinEvent,
          payload: {
            roomId,
            userName: currentUser,
            fullName: currentUserFullName
              ? currentUserFullName
              : globalUser?.data?.user?.name,
            callType,
            hasRealDevices,
            video: localStreamRef.getVideoTracks().length > 0,
            audio: localStreamRef.getAudioTracks().length > 0,
          },
        });
        if (ack?.error) {
          console.error("Error joining room:", ack.error);
          toast.error(ack.error);
        } else {
          console.log("Joined room successfully:", ack);
        }
      } catch (err) {
        console.error("Error joining room:", err);
        toast.error("Failed to join room. Please try again.");
      }
      // Initialize mediasoup SFU for this room.
      console.log("[room.js] calling initializeMediasoup", {
        roomId,
        currentUser,
      });
      await initializeMediasoup(roomId, currentUser);

    } catch (error) {
      console.error("Error initializing media:", error);
      toast.error("Failed to initialize media. Please refresh and try again.");
    }
  };

  // ======================= Mediasoup initialization (web SFU) =======================
  const initializeMediasoup = async (roomId, userId) => {
    try {
      const socket = socketRef.current;
      if (!socket) {
        console.warn("[room.js] initializeMediasoup called without socket");
        return;
      }

      callGenRef.current++; // invalidate any pending retries from the previous call
      consumedProducerIdsRef.current.clear(); // reset on each mediasoup init (handles reconnects)
      sendTransportRef.current = null; // invalidate stale refs so old retries don't pass readiness check
      recvTransportRef.current = null;
      deviceRef.current = null;
      if (socket) { socket.mediasoupDevice = null; socket.mediasoupRecvTransport = null; }
      console.log("[room.js] initializeMediasoup start", {
        roomId,
        userId,
        socketId: socket.id,
      });

      // 1) Get RTP capabilities
      let rtpCaps;
      try {
        rtpCaps = await callService.getRtpCapabilities(socket, { roomId });
        console.log("[room.js] got rtpCaps", rtpCaps);
      } catch (e) {
        console.error("[room.js] getRtpCapabilities failed", e);
        throw e;
      }

      // 2) Create Device
      const device = new Device();
      console.log("[room.js] Device created, loading with routerRtpCapabilities");
      await device.load({ routerRtpCapabilities: rtpCaps });
      deviceRef.current = device;
      socket.mediasoupDevice = device; // Persist on socket for fetchAndConsumeProducers (survives remounts)
      console.log("[room.js] Device loaded and stored", {
        canProduceAudio: device.canProduce("audio"),
        canProduceVideo: device.canProduce("video"),
      });

      // 3) Create send transport
      let sendInfo;
      try {
        sendInfo = await callService.createTransport(socket, {
          roomId,
          userId,
          direction: "send",
        });
        console.log("[room.js] send transport info", sendInfo);
      } catch (e) {
        console.error("[room.js] createTransport(send) failed", e);
        throw e;
      }

      const sendTransport = device.createSendTransport({
        id: sendInfo.id,
        iceParameters: sendInfo.iceParameters,
        iceCandidates: sendInfo.iceCandidates,
        dtlsParameters: sendInfo.dtlsParameters,
      });

      sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
        callService
          .connectTransport(socket, {
            roomId,
            userId,
            transportId: sendTransport.id,
            dtlsParameters,
          })
          .then(() => {
            console.log("[room.js] sendTransport connected");
            callback();
          })
          .catch((error) => {
            console.error("[room.js] sendTransport connect failed", error);
            errback(error);
          });
      });

      sendTransport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
        console.log("[room.js] sendTransport produce requested", { kind });
        socket.emit(
          "MS-produce",
          { roomId, userId, transportId: sendTransport.id, kind, rtpParameters },
          (res) => {
            if (res && res.ok && res.id) callback({ id: res.id });
            else errback(new Error(res?.error || "produce-failed"));
          }
        );
      });

      sendTransportRef.current = sendTransport;
      sendTransport.on("connectionstatechange", (state) => {
        console.log("[room.js] sendTransport connectionstatechange", state);
      });

      // 4) Create recv transport
      let recvInfo;
      try {
        recvInfo = await callService.createTransport(socket, {
          roomId,
          userId,
          direction: "recv",
        });
        console.log("[room.js] recv transport info", recvInfo);
      } catch (e) {
        console.error("[room.js] createTransport(recv) failed", e);
        throw e;
      }

      const recvTransport = device.createRecvTransport({
        id: recvInfo.id,
        iceParameters: recvInfo.iceParameters,
        iceCandidates: recvInfo.iceCandidates,
        dtlsParameters: recvInfo.dtlsParameters,
      });

      recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
        callService
          .connectTransport(socket, {
            roomId,
            userId,
            transportId: recvTransport.id,
            dtlsParameters,
          })
          .then(() => {
            console.log("[room.js] recvTransport connected");
            callback();
          })
          .catch((error) => {
            console.error("[room.js] recvTransport connect failed", error);
            errback(error);
          });
      });

      recvTransportRef.current = recvTransport;
      recvTransport.on("connectionstatechange", (state) => {
        console.log("[room.js] recvTransport connectionstatechange", state);
      });
      socket.mediasoupRecvTransport = recvTransport; // Persist on socket for fetchAndConsumeProducers (survives remounts)

      // 5) Produce local tracks
      const local = userStream.current;
      if (local) {
        const audioTrack = local.getAudioTracks()[0];
        const videoTrack = local.getVideoTracks()[0];
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
        const isSafariBrowser =
          /Safari/i.test(ua) && !/Chrome|Chromium|Edg|CriOS|FxiOS/i.test(ua);
        console.log("[room.js] local tracks before produce", {
          hasAudio: !!audioTrack,
          hasVideo: !!videoTrack,
          isSafariBrowser,
        });
        if (audioTrack) {
          audioProducerRef.current = await sendTransport.produce({
            track: audioTrack,
          });
          console.log("[room.js] audio producer created", {
            id: audioProducerRef.current.id,
          });
        }
        // For pure audio calls, do not create a video producer so that
        // no video track is broadcast to other participants.
        if (videoTrack && !isAudioOnlyCall) {
          // Safari is sensitive to some simulcast/scalability combinations;
          // keep it on single encoding to reduce freezes and A/V breakups.
          const videoEncodings = isSafariBrowser
            ? undefined
            : [
              {
                maxBitrate: 300_000,
                scalabilityMode: "L1T2",
              },
              {
                maxBitrate: 1_200_000,
                scalabilityMode: "L1T3",
              },
            ];

          videoProducerRef.current = await sendTransport.produce({
            track: videoTrack,
            encodings: videoEncodings,
          });
          console.log("[room.js] video producer created", {
            id: videoProducerRef.current.id,
          });
        }
      }

      // 6) Consume already-existing producers in this room (users who joined before us)
      try {
        const existing = await callService.getProducers(socket, {
          roomId,
          userId,
        });
        console.log("[room.js] existing producers", existing);

        for (const p of existing) {
          try {
            if (consumedProducerIdsRef.current.has(p.producerId)) {
              console.log("[room.js] existing producers: skipping duplicate producer", p.producerId);
              continue;
            }
            consumedProducerIdsRef.current.add(p.producerId);
            const consumeInfo = await callService.consume(socket, {
              roomId,
              userId,
              producerId: p.producerId,
              rtpCapabilities: device.rtpCapabilities,
            });
            console.log("[room.js] consume existing producer response", consumeInfo);

            const consumer = await recvTransport.consume({
              id: consumeInfo.id,
              producerId: consumeInfo.producerId,
              kind: consumeInfo.kind,
              rtpParameters: consumeInfo.rtpParameters,
              paused: consumeInfo.paused ?? true,
            });
            console.log("[room.js] consumer track state (existing)", { kind: consumer.kind, paused: consumer.paused, trackMuted: consumer.track.muted, trackReadyState: consumer.track.readyState });

            // Merge audio/video tracks per remote user
            const kind = consumeInfo.kind || p.kind;
            let existingStream = remoteStreamsRef.current[p.userId];
            if (!existingStream) {
              existingStream = new MediaStream();
            } else {
              if (kind === "video") {
                existingStream.getVideoTracks().forEach((t) => existingStream.removeTrack(t));
              } else if (kind === "audio") {
                existingStream.getAudioTracks().forEach((t) => existingStream.removeTrack(t));
              }
            }
            existingStream.addTrack(consumer.track);
            // Create a new MediaStream reference so VideoCard's useEffect re-runs and shows the video
            const newStream = new MediaStream(existingStream.getTracks());
            remoteStreamsRef.current[p.userId] = newStream;
            setRemotePeers(
              Object.entries(remoteStreamsRef.current).map(([uid, stream]) => ({
                userId: uid,
                stream,
              }))
            );
            console.log("[room.js] remotePeers after consuming existing", {
              keys: Object.keys(remoteStreamsRef.current),
            });

            // Resume consumer now that the track is set up in the stream.
            // Server creates consumers paused=true; we must explicitly resume.
            socket.emit("MS-resume-consumer", { roomId, userId, consumerId: consumer.id });

            // For video: start at the lower temporal layer (L1T1 = 300kbps) so the
            // browser's REMB/TWCC can ramp up only as bandwidth allows.
            if (kind === "video") {
              socket.emit("MS-set-preferred-layers", {
                roomId,
                userId,
                consumerId: consumer.id,
                spatialLayer: 0,
                temporalLayer: 1,
              });
            }
          } catch (err) {
            consumedProducerIdsRef.current.delete(p.producerId); // allow retry on failure
            console.error("Error consuming existing producer:", err);
          }
        }
      } catch (err) {
        console.error("MS-get-producers failed:", err);
      }

      // 7) Listen for new remote producers (remove stale handler first to prevent duplicates on reconnect)
      socket.off("MS-new-producer");
      socket.on("MS-new-producer", async ({ producerId, userId: remoteUserId, kind }) => {
        try {
          console.log("[room.js] MS-new-producer received", {
            producerId,
            remoteUserId,
            kind,
          });
          if (consumedProducerIdsRef.current.has(producerId)) {
            console.log("[room.js] MS-new-producer: skipping duplicate producer", producerId);
            return;
          }
          consumedProducerIdsRef.current.add(producerId);
          // Request consumer for this producer
          const consumeInfo = await callService.consume(socket, {
            roomId,
            userId,
            producerId,
            rtpCapabilities: device.rtpCapabilities,
          });

          const consumer = await recvTransport.consume({
            id: consumeInfo.id,
            producerId: consumeInfo.producerId,
            kind: consumeInfo.kind,
            rtpParameters: consumeInfo.rtpParameters,
            paused: consumeInfo.paused ?? true,
          });
          console.log("[room.js] consumer track state (new-producer)", { kind: consumer.kind, paused: consumer.paused, trackMuted: consumer.track.muted, trackReadyState: consumer.track.readyState });

          const trackKind = consumeInfo.kind || kind;
          let existingStream = remoteStreamsRef.current[remoteUserId];
          if (!existingStream) {
            existingStream = new MediaStream();
          } else {
            if (trackKind === "video") {
              existingStream.getVideoTracks().forEach((t) => existingStream.removeTrack(t));
            } else if (trackKind === "audio") {
              existingStream.getAudioTracks().forEach((t) => existingStream.removeTrack(t));
            }
          }
          existingStream.addTrack(consumer.track);
          // Create a new MediaStream reference so VideoCard's useEffect re-runs and shows the video
          const newStream = new MediaStream(existingStream.getTracks());
          remoteStreamsRef.current[remoteUserId] = newStream;
          setRemotePeers(
            Object.entries(remoteStreamsRef.current).map(([uid, stream]) => ({
              userId: uid,
              stream,
            }))
          );
          console.log("[room.js] remotePeers after MS-new-producer", {
            keys: Object.keys(remoteStreamsRef.current),
          });

          // Resume consumer now that the track is set up in the stream.
          socket.emit("MS-resume-consumer", { roomId, userId, consumerId: consumer.id });

          // For video: request lower temporal layer initially so REMB can ramp up naturally.
          if (trackKind === "video") {
            socket.emit("MS-set-preferred-layers", {
              roomId,
              userId,
              consumerId: consumer.id,
              spatialLayer: 0,
              temporalLayer: 1,
            });
          }
        } catch (err) {
          consumedProducerIdsRef.current.delete(producerId); // allow retry on failure
          console.error("Error consuming remote producer:", err);
        }
      });

      // 8) Consume any remote peers that joined before we were ready (fixes timing race)
      for (const [peerId, s] of Object.entries(remoteStreamsRef.current)) {
        if (s.getTracks().length === 0) {
          console.log("[room.js] mediasoup ready: consuming pending peer", peerId);
          fetchAndConsumeProducersForNewPeer(roomId, userId, peerId);
        }
      }
    } catch (err) {
      console.error("initializeMediasoup failed:", err);
      toast.error("Failed to initialize high-quality media. Falling back to basic call.");
    }
  };

  useEffect(() => {
    initializeMedia();

    socketRef.current.on("reconnect_error", (err) => {
      console.error("Socket reconnect error:", err);
    });

    // Re-initialize mediasoup and re-join the room when the socket reconnects
    // (e.g. brief network drop). The initial connection is handled by initializeMedia above.
    let isInitialConnect = true;
    const handleSocketConnect = async () => {
      if (isInitialConnect) {
        isInitialConnect = false;
        return;
      }
      console.log("[room.js] socket reconnected — re-initializing mediasoup");
      // Reset per-call state so stale producer IDs / streams don't block re-consumption
      remoteStreamsRef.current = {};
      consumedProducerIdsRef.current.clear();
      pendingConsumePeerIdsRef.current.clear();
      hasReceivedInitialUsers.current = false;
      setRemotePeers([]);
      setUserVideoAudio({ localUser: { video: true, audio: true } });
      // Re-join the signalling room so BE restores presence / FE-user-join events
      try {
        await callService.joinRoom(socketRef.current, {
          joinEvent,
          payload: {
            roomId,
            userName: currentUser,
            fullName: currentUserFullName || globalUser?.data?.user?.name,
            callType,
            video: userStream.current?.getVideoTracks().length > 0,
            audio: userStream.current?.getAudioTracks().length > 0,
          },
        });
      } catch (err) {
        console.error("[room.js] re-join failed after socket reconnect:", err);
      }
      // Rebuild send/recv transports and re-produce/consume
      await initializeMediasoup(roomId, currentUser);
    };
    socketRef.current.on("connect", handleSocketConnect);

    window.addEventListener("popstate", goToBack);

    return () => {
      socketRef.current.off("connect", handleSocketConnect);
      socketRef.current.off("FE-user-join");
      socketRef.current.off("FE-user-leave");
      socketRef.current.off("FE-toggle-camera");
      socketRef.current.off("FE-user-disconnected");
      socketRef.current.off("FE-guest-disconnected");
      socketRef.current.off("waiting_call");
      socketRef.current.off("FE-call-ended");
      socketRef.current.off("FE-leave");
      socketRef.current.off("MS-new-producer");
      window.removeEventListener("popstate", goToBack);
      // Reset the flag when leaving the room
      hasReceivedInitialUsers.current = false;

      // Cleanup local stream tracks to prevent resource leaks
      if (userStream.current) {
        userStream.current.getTracks().forEach((track) => {
          track.stop();
        });
        userStream.current = null;
      }
      // Cleanup mediasoup transports/producers
      try {
        audioProducerRef.current && audioProducerRef.current.close();
      } catch { }
      try {
        videoProducerRef.current && videoProducerRef.current.close();
      } catch { }
      try {
        sendTransportRef.current && sendTransportRef.current.close();
      } catch { }
      try {
        recvTransportRef.current && recvTransportRef.current.close();
      } catch { }
      audioProducerRef.current = null;
      videoProducerRef.current = null;
      sendTransportRef.current = null;
      recvTransportRef.current = null;
    };
  }, [socketRef.current]);

  useEffect(() => {
    if (showModal) {
      setTimeout(() => {
        if (userVideoRef.current && userStream.current) {
          userVideoRef.current.srcObject = userStream.current;
          userVideoRef.current.play().catch(() => { });
        }
      }, 700);
    }
  }, [showModal]);

  useEffect(() => {
    if (userVideoRef.current && userStream.current) {
      if (!screenShare && !screenShareLoading) {
        userVideoRef.current.srcObject = userStream.current;
      }

      const playPromise = userVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn("Video play rejected:", err);
          }
        });
      }
    }
  }, [isFloating, stream, screenShare, screenShareLoading]);


  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && userVideoRef.current) {
        // Only set back to userStream if we are NOT screen sharing
        if (!screenShare && !screenShareLoading && userStream.current) {
          userVideoRef.current.srcObject = userStream.current;
        }
        userVideoRef.current.play().catch(() => { });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [screenShare, screenShareLoading]);

  function writeUserName(userName) {
    if (userVideoAudio[userName] && !userVideoAudio[userName].video) {
      return <UserName key={userName}>{userName}</UserName>;
    }
  }

  // Helper to map signaling userId (socket.id) to our stored user entry
  function findPeer(socketId) {
    if (!socketId) return null;
    const entry = Object.entries(userVideoAudio).find(
      ([, info]) => info && info.socketId === socketId
    );
    if (!entry) return null;
    const [userName, info] = entry;
    return { userName, info };
  }
  //  className={`width-peer${peers.length > 8 ? "" : peers.length}`}


  const goToBack = (e) => {
    e.preventDefault();
    setShowReconnectModal(false);
    const activeCallId = sessionStorage.getItem("activeCallId");
    socketRef.current.emit(leaveEvent || "BE-leave-room", { roomId: activeCallId, leaver: currentUser });
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("callStatus");
    sessionStorage.removeItem("userInActiveCall");
    sessionStorage.removeItem("activeCallId");
    sessionStorage.removeItem("isGuestMeeting");
    setShowModal(false);
    if (userStream.current) {
      userStream.current.getTracks().forEach((track) => track.stop());
      userStream.current = null;
    }
    if (window.userStream) {
      window.userStream.getTracks().forEach(track => track.stop());
      window.userStream = null;
    }

    // Re-register socket for normal messaging after leaving call
    if (globalUser?.data?.user?._id) {
      socketRef.current.emit("joinSelf", globalUser.data.user._id);
    }

    onSendData("close");
  };

  const toggleCameraAudio = (target) => {
    if (!hasRealDevices) {
      toast.info("No camera or microphone available on this device.");
      return;
    }

    setUserVideoAudio((preList) => {
      const newState = { ...preList.localUser };

      // Use userStream.current (the original stream) instead of userVideoRef.current.srcObject
      // because during screen share, userVideoRef contains the screen share stream
      const stream = userStream.current;

      if (!stream) return preList;

      if (target === "video") {
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          newState.video = !newState.video;
          videoTracks[0].enabled = newState.video;
        }
      } else {
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          newState.audio = !newState.audio;
          audioTracks[0].enabled = newState.audio;
        }
      }

      return { ...preList, localUser: newState };
    });

    // Also control mediasoup producers if enabled
    if (useMediasoup) {
      try {
        if (target === "video" && videoProducerRef.current) {
          if (videoProducerRef.current.paused) {
            videoProducerRef.current.resume();
          } else {
            videoProducerRef.current.pause();
          }
        } else if (target === "audio" && audioProducerRef.current) {
          if (audioProducerRef.current.paused) {
            audioProducerRef.current.resume();
          } else {
            audioProducerRef.current.pause();
          }
        }
      } catch (e) {
        console.warn("Error toggling mediasoup producer", e);
      }
    }

    socketRef.current.emit("BE-toggle-camera-audio", { roomId, switchTarget: target });
  };

  const clickScreenSharing = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      toast.info("Screen sharing is not supported by your browser.");
      return;
    }

    if (!screenShare) {
      // Check if someone else is already sharing
      if (currentScreenSharer) {
        toast.warning(`Screen is already sharing. Please wait for them to stop.`);
        return;
      }

      setScreenShareLoading(true); // Start loading
      navigator.mediaDevices.getDisplayMedia({
        cursor: true,
        video: {
          displaySurface: 'monitor' // Prefer full monitor to avoid window recursion
        }
      }).then(async (stream) => {
        const screenTrack = stream.getTracks()[0];

        const originalVideoTrack = userStream.current?.getVideoTracks()[0];

        // Update local preview
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
          userVideoRef.current.play().catch(() => { });
        }

        // Replace track in mediasoup video producer (SFU path)
        if (useMediasoup && videoProducerRef.current && screenTrack) {
          try {
            wasVideoProducerPausedBeforeShareRef.current = !!videoProducerRef.current.paused;
            await videoProducerRef.current.replaceTrack({ track: screenTrack });
            // If user had video paused, sharing should still be visible remotely.
            if (videoProducerRef.current.paused) {
              await videoProducerRef.current.resume();
            }
            console.log("[room.js] screen share track replaced on producer");
          } catch (err) {
            console.error("Failed to replace track on video producer for screen share:", err);
          }
        }

        screenTrack.onended = () => {
          // Stop all tracks in the screen share stream to remove browser UI
          stream.getTracks().forEach(track => track.stop());

          const originalVideoTrack = userStream.current?.getVideoTracks()[0];

          // Restore local preview
          if (userVideoRef.current && userStream.current) {
            userVideoRef.current.srcObject = userStream.current;
            // Force video element to re-render properly
            userVideoRef.current.play().catch(() => { });
          }

          // Restore original track on mediasoup producer
          if (useMediasoup && videoProducerRef.current && originalVideoTrack) {
            videoProducerRef.current
              .replaceTrack({ track: originalVideoTrack })
              .then(async () => {
                // Restore previous paused state after screen sharing ends.
                if (wasVideoProducerPausedBeforeShareRef.current && !videoProducerRef.current.paused) {
                  await videoProducerRef.current.pause();
                }
                wasVideoProducerPausedBeforeShareRef.current = false;
                console.log("[room.js] original video track restored after screen share");
              })
              .catch((err) => {
                console.warn("Failed to restore original track on video producer:", err);
              });
          }
          setScreenShare(false);
          setScreenShareLoading(false);
          setCurrentScreenSharer(null); // Clear current sharer
          socketRef.current.emit("BE-toggle-screen-share", { roomId, isScreenShare: false });
        };

        if (userVideoRef.current) {
          // Set stream and ensure proper playback
          userVideoRef.current.srcObject = stream;
          userVideoRef.current.play().catch((err) => {
            console.warn("Screen share video play warning:", err);
          });
        }
        screenTrackRef.current = screenTrack;

        // Small delay to ensure stream is ready before hiding loader
        setTimeout(() => {
          setScreenShare(true);
          setScreenShareLoading(false);
          // Set self as current sharer
          setCurrentScreenSharer({ userId: socketRef.current.id, userName: 'You' });
          socketRef.current.emit("BE-toggle-screen-share", { roomId, isScreenShare: true });
        }, 500);
      }).catch((err) => {
        console.error("Screen sharing failed:", err);
        setScreenShareLoading(false); // Stop loading on error
        if (err.name === 'NotAllowedError') {
          toast.info("Screen sharing permission denied.");
        } else {
          toast.error("Screen sharing failed. Please try again.");
        }
      });
    } else {
      if (screenTrackRef.current) {
        screenTrackRef.current.onended();
      }
    }
  };

  const expandScreen = (e) => {
    // Target the parent container (VideoBox) to preserve CSS transforms like mirroring
    const elem = e.target.closest('div') || e.target;
    if (elem.requestFullscreen) elem.requestFullscreen();
    else if (elem.mozRequestFullScreen) elem.mozRequestFullScreen();
    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
  };

  const clickBackground = () => {
    if (showVideoDevices) setShowVideoDevices(false);
  };

  const clickCameraDevice = (event) => {
    if (!hasRealDevices) {
      toast.info("No camera devices available on this device.");
      return;
    }

    const deviceId = event?.target?.dataset?.value;
    if (!deviceId) return;

    const enabledAudio =
      userStream.current?.getAudioTracks()[0]?.enabled ?? true;

    navigator.mediaDevices
      .getUserMedia({ video: { deviceId }, audio: enabledAudio })
      .then(async (newStream) => {
        const newTrack = newStream.getTracks().find((t) => t.kind === "video");
        if (!newTrack || !userStream.current) return;

        const oldTrack = userStream.current
          .getTracks()
          .find((t) => t.kind === "video");

        if (oldTrack) {
          userStream.current.removeTrack(oldTrack);
        }
        userStream.current.addTrack(newTrack);

        // Update local preview if not screen sharing
        if (!screenShare && userVideoRef.current) {
          userVideoRef.current.srcObject = userStream.current;
          userVideoRef.current.play().catch(() => {});
        }

        // Update mediasoup video producer track if available
        if (videoProducerRef.current && useMediasoup) {
          try {
            await videoProducerRef.current.replaceTrack({ track: newTrack });
          } catch (e) {
            console.error(
              "Failed to replace track on mediasoup video producer:",
              e
            );
            toast.error("Failed to apply camera change to the call.");
          }
        }
      })
      .catch((err) => {
        console.error("Camera device switch failed:", err);
        toast.error("Failed to switch camera device.");
      });
  };

  const handleMouseDown = (e) => {
    if (!isFloating) {
      setPosition({ x: 0, y: 0 });
      setOffset({ x: 0, y: 0 });
      setDragging(false);
      e.stopPropagation();
      return;
    } else {
      const rect = boxRef.current.getBoundingClientRect();
      setOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setDragging(true);
      e.stopPropagation();
    }
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    setPosition({
      x: e.clientX - offset.x,
      y: e.clientY - offset.y
    });
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  const requestStartRecording = () => {
    if (!socketRef?.current) {
      toast.error("Socket is not ready.");
      return;
    }
    if (!isGroupAdmin) {
      return;
    }
    if (recordingBusy) return;
    console.log("[room.js][REC] requestStartRecording", {
      roomId,
      currentUser,
      isGroupAdmin,
      recordingBusy,
    });
    setRecordingBusy(true);
    socketRef.current.emit("BE-start-recording", { roomId });
  };

  const requestStopRecording = (recordingIdToStop) => {
    if (!socketRef?.current) {
      toast.error("Socket is not ready.");
      return;
    }
    if (!isGroupAdmin) {
      return;
    }
    if (!recordingIdToStop) {
      toast.error("No active recording to stop.");
      return;
    }
    if (recordingBusy) return;
    console.log("[room.js][REC] requestStopRecording", {
      roomId,
      recordingIdToStop,
      activeRecordingId,
      currentUser,
      isGroupAdmin,
      recordingBusy,
    });
    setRecordingBusy(true);
    socketRef.current.emit("BE-stop-recording", { roomId, recordingId: recordingIdToStop });
  };

  function pickPrimaryVideoStream() {
    // Phase 1 policy (video call): deterministically pick the first stream
    // that has a video track (remote first, then local).
    if (!isAudioOnlyCall) {
      for (const stream of Object.values(remoteStreamsRef.current || {})) {
        if (stream && stream.getVideoTracks && stream.getVideoTracks().length > 0) {
          return stream;
        }
      }
    }
    return userStream.current || null;
  }

  async function uploadRecordedBlob(blob, recordingId, durationSec) {
    if (!blob || !blob.size || !recordingId) {
      console.warn("[room.js][REC] uploadRecordedBlob skipped (missing blob/size/recordingId)", {
        blobSize: blob?.size,
        blobType: blob?.type,
        recordingId,
      });
      return;
    }

    const proxyBase = process.env.NEXT_PUBLIC_PROXY || process.env.NEXT_PUBLIC_API_URL || "";
    const apiBase = proxyBase ? String(proxyBase).replace(/\/+$/, "") : "";

    try {
      console.log("[room.js][REC] uploadRecordedBlob start", {
        recordingId,
        blobSize: blob.size,
        blobType: blob.type,
        durationSec,
        apiBase,
      });

      const mimeType = blob.type || "video/webm";

      const initUrl = apiBase ? `${apiBase}/api/v1/groups/recordings/init` : "/api/v1/groups/recordings/init";
      const chunkUrl = apiBase ? `${apiBase}/api/v1/groups/recordings/chunk` : "/api/v1/groups/recordings/chunk";
      const completeUrl = apiBase ? `${apiBase}/api/v1/groups/recordings/complete` : "/api/v1/groups/recordings/complete";

      const initRes = await fetch(initUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // authMiddleware also accepts cookies, but this helps if cookies aren't sent.
          "access-token": globalUser?.data?.token || "",
        },
        body: JSON.stringify({
          roomId,
          recordingId,
          mimeType,
        }),
      });

      const initRaw = await initRes.text();
      let initJson = null;
      try {
        initJson = initRaw ? JSON.parse(initRaw) : null;
      } catch (e) {
        console.error("[room.js][REC] /recordings/init non-json response", {
          url: initUrl,
          status: initRes.status,
          bodyPreview: initRaw?.slice(0, 300),
        });
      }
      console.log("[room.js][REC] /recordings/init", {
        status: initRes.status,
        ok: initRes.ok,
        data: initJson?.data
          ? { uploadSessionId: initJson.data.uploadSessionId }
          : initJson,
      });
      if (!initRes.ok || !initJson?.success) {
        throw new Error(initJson?.message || "Failed to initialize recording upload.");
      }

      const uploadSessionId = initJson?.data?.uploadSessionId;
      if (!uploadSessionId) throw new Error("Missing uploadSessionId from server.");

      const chunkSize = 5 * 1024 * 1024; // 5MB chunks
      const totalChunks = Math.ceil(blob.size / chunkSize);
      console.log("[room.js][REC] totalChunks", { totalChunks, chunkSize });

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, blob.size);
        const chunkBlob = blob.slice(start, end);

        const formData = new FormData();
        formData.append("roomId", roomId);
        formData.append("recordingId", recordingId);
        formData.append("uploadSessionId", uploadSessionId);
        formData.append("chunkIndex", `${chunkIndex}`);
        formData.append("chunk", chunkBlob, `chunk-${chunkIndex}.webm`);

        const chunkRes = await fetch(chunkUrl, {
          method: "POST",
          headers: {
            "access-token": globalUser?.data?.token || "",
          },
          body: formData,
        });

        const chunkRaw = await chunkRes.text();
        let chunkJson = null;
        try {
          chunkJson = chunkRaw ? JSON.parse(chunkRaw) : null;
        } catch (e) {
          console.error("[room.js][REC] /recordings/chunk non-json response", {
            url: chunkUrl,
            status: chunkRes.status,
            chunkIndex,
            bodyPreview: chunkRaw?.slice(0, 300),
          });
        }
        if (chunkIndex < 3 || chunkIndex === totalChunks - 1) {
          console.log("[room.js][REC] chunk upload", {
            chunkIndex,
            status: chunkRes.status,
            ok: chunkRes.ok,
            receivedChunks: chunkJson?.data?.receivedChunks,
            serverSuccess: chunkJson?.success,
            serverError: chunkJson?.error,
          });
        }
        if (!chunkRes.ok || !chunkJson?.success) {
          if (!chunkJson) {
            throw new Error(
              `Chunk upload failed at index ${chunkIndex}. Server did not return valid JSON (status ${chunkRes.status}). Body preview: ${chunkRaw?.slice(0, 300)}`,
            );
          }
          throw new Error(
            chunkJson?.error
              ? `${chunkJson?.message || "Chunk upload failed"}: ${String(chunkJson?.error)}`
              : chunkJson?.message || `Chunk upload failed at index ${chunkIndex}.`,
          );
        }
      }

      const completeRes = await fetch(completeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access-token": globalUser?.data?.token || "",
        },
        body: JSON.stringify({
          roomId,
          recordingId,
          uploadSessionId,
          totalChunks,
          durationSec: durationSec || 0,
        }),
      });

      const completeRaw = await completeRes.text();
      let completeJson = null;
      try {
        completeJson = completeRaw ? JSON.parse(completeRaw) : null;
      } catch (e) {
        console.error("[room.js][REC] /recordings/complete non-json response", {
          url: completeUrl,
          status: completeRes.status,
          bodyPreview: completeRaw?.slice(0, 300),
        });
      }
      console.log("[room.js][REC] /recordings/complete", {
        status: completeRes.status,
        ok: completeRes.ok,
        data: completeJson?.data,
        message: completeJson?.message,
      });
      if (!completeRes.ok || !completeJson?.success) {
        throw new Error(completeJson?.message || "Failed to complete recording upload.");
      }
    } catch (e) {
      console.error("[room.js] uploadRecordedBlob failed", e);
      toast.error(e?.message || "Failed to upload recording.");
      throw e;
    }
  }

  function startLocalRecorder(startingRecordingId) {
    if (!startingRecordingId) {
      toast.error("Recording id missing.");
      return;
    }
    if (!window.MediaRecorder) {
      toast.error("MediaRecorder is not supported in this browser.");
      return;
    }

    console.log("[room.js][REC] startLocalRecorder", {
      startingRecordingId,
      roomId,
      callType,
      isAudioOnlyCall,
    });

    const primaryVideoStream = pickPrimaryVideoStream();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      toast.error("AudioContext not supported in this browser.");
      return;
    }

    // Build a mixed-audio destination from all current participant audio tracks.
    const audioContext = new AudioContextClass();
    const destination = audioContext.createMediaStreamDestination();

    const addAudioTrackToMix = (track) => {
      if (!track) return;
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0;
      source.connect(gainNode).connect(destination);
    };

    // Local audio
    if (userStream.current) {
      const localAudioTracks = userStream.current.getAudioTracks();
      if (localAudioTracks && localAudioTracks.length > 0) {
        addAudioTrackToMix(localAudioTracks[0]);
      }
    }

    // Remote audio
    for (const stream of Object.values(remoteStreamsRef.current || {})) {
      if (!stream || !stream.getAudioTracks) continue;
      const tracks = stream.getAudioTracks();
      if (tracks && tracks.length > 0) addAudioTrackToMix(tracks[0]);
    }

    // Choose mime type
    // - Video call: prefer video/webm (vp9/vp8) with opus audio
    // - Audio call: prefer audio/webm with opus (no video tracks)
    let mimeType = undefined;
    if (isAudioOnlyCall) {
      const preferredAudio = "audio/webm;codecs=opus";
      mimeType = MediaRecorder.isTypeSupported(preferredAudio) ? preferredAudio : "audio/webm";
    } else {
      mimeType = "video/webm;codecs=vp9,opus";
      if (!MediaRecorder.isTypeSupported(mimeType))
        mimeType = "video/webm;codecs=vp8,opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    }

    const chosenMimeType = mimeType;
    console.log("[room.js][REC] chosenMimeType", {
      chosenMimeType,
      isAudioOnlyCall,
    });

    // Build the final composed stream (video tile for video calls, audio-only for audio calls)
    let composedStream;
    let drawTimer = null;
    let canvas = null;
  let videoEls = [];

    if (!isAudioOnlyCall) {
      // Phase 2: record a single "mosaic" video by drawing all participant tiles
      // into one canvas (grid layout).
      // Include remote MediaStreams even if their tracks aren't populated yet.
      // mediasoup attaches tracks asynchronously; video elements can render once tracks appear.
      const remoteEntries = Object.entries(remoteStreamsRef.current || {})
        .filter(([, s]) => Boolean(s) && typeof s.getVideoTracks === "function")
        .sort(([aKey], [bKey]) => String(aKey).localeCompare(String(bKey)));

      const remoteVideoStreams = remoteEntries.map(([, s]) => s);
      const localVideoStreams =
        userStream.current && userStream.current.getVideoTracks && userStream.current.getVideoTracks().length > 0
          ? [userStream.current]
          : [];

      const gridStreams =
        remoteVideoStreams.length > 0
          ? remoteVideoStreams
          : localVideoStreams.length > 0
            ? localVideoStreams
            : primaryVideoStream
              ? [primaryVideoStream]
              : [];

      console.log("[room.js][REC] mosaic streams", {
        remoteVideoCount: remoteVideoStreams.length,
        localVideoCount: localVideoStreams.length,
        gridStreamsCount: gridStreams.length,
      });

      if (gridStreams.length === 0) {
        toast.error("No video streams available for recording mosaic.");
        audioContext.close().catch(() => {});
        return;
      }

      canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      recordingCanvasRef.current = canvas;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        toast.error("Canvas context unavailable.");
        audioContext.close().catch(() => {});
        return;
      }

      videoEls = gridStreams.map((stream) => {
        const el = document.createElement("video");
        el.srcObject = stream;
        el.muted = true;
        el.playsInline = true;
        el.autoplay = true;
        const playPromise = el.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
        return el;
      });

      const w = canvas.width;
      const h = canvas.height;
      const n = videoEls.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const tileW = Math.floor(w / cols);
      const tileH = Math.floor(h / rows);

      drawTimer = window.setInterval(() => {
        try {
          // Background
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, w, h);

          for (let i = 0; i < videoEls.length; i += 1) {
            const video = videoEls[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * tileW;
            const y = row * tileH;
            ctx.drawImage(video, x, y, tileW, tileH);
          }
        } catch (e) {
          // Drawing failures can happen while the stream is negotiating; ignore.
        }
      }, 100);

      recordingDrawTimerRef.current = drawTimer;
      const canvasStream = canvas.captureStream(30);
      composedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
    } else {
      composedStream = destination.stream;
    }

    if (!composedStream) {
      toast.error("Failed to build a media stream for recording.");
      audioContext.close().catch(() => {});
      return;
    }

    console.log("[room.js][REC] composedStream tracks", {
      videoTracks: composedStream.getVideoTracks().length,
      audioTracks: composedStream.getAudioTracks().length,
    });

    if (composedStream.getAudioTracks().length === 0 && isAudioOnlyCall) {
      toast.error("No audio tracks found for recording.");
      audioContext.close().catch(() => {});
      return;
    }

    const recordedChunks = [];
    recordedChunksRef.current = recordedChunks;

    const recorder = new MediaRecorder(composedStream, { mimeType: chosenMimeType });
    mediaRecorderRef.current = recorder;
    recordingStartTimeRef.current = Date.now();

    let ondataLogged = false;
    recorder.ondataavailable = (event) => {
      try {
        if (event.data && event.data.size > 0) recordedChunksRef.current.push(event.data);
        if (!ondataLogged && event.data && event.data.size > 0) {
          ondataLogged = true;
          console.log("[room.js][REC] first ondataavailable", {
            size: event.data.size,
            mimeType: chosenMimeType,
          });
        }
      } catch (e) {
        // ignore
      }
    };

    recorder.onstop = async () => {
      try {
        console.log("[room.js][REC] recorder stopped, chunks:", recordedChunksRef.current?.length || 0);
        // Stop drawing
        if (recordingDrawTimerRef.current) {
          window.clearInterval(recordingDrawTimerRef.current);
          recordingDrawTimerRef.current = null;
        }

        const elapsedSec = Math.round(((Date.now() - recordingStartTimeRef.current) || 0) / 1000);

        const finalBlob = new Blob(recordedChunksRef.current || [], {
          type: chosenMimeType,
        });

        console.log("[room.js][REC] finalBlob ready", {
          blobSize: finalBlob.size,
          blobType: finalBlob.type,
        });

        const durationForServer = Number.isFinite(elapsedSec) ? elapsedSec : 0;

        setRecordingBusy(true);
        await uploadRecordedBlob(finalBlob, startingRecordingId, durationForServer);
      } catch (e) {
        // uploadRecordedBlob already toasts errors
        console.error("[room.js][REC] recorder.onstop error", e);
      } finally {
        try {
          await audioContext.close();
        } catch (_) {}
        setRecordingBusy(false);
      }
    };

    recorder.start(2000); // Collect chunks every 2 seconds
  }

  function stopLocalRecorder() {
    try {
      const recorder = mediaRecorderRef.current;
      console.log("[room.js][REC] stopLocalRecorder called", {
        recorderState: recorder?.state,
      });
      if (recorder && recorder.state === "recording") {
        console.log("[room.js][REC] stopping recorder now");
        recorder.stop();
      }
    } catch (e) {
      console.error("[room.js] stopLocalRecorder failed", e);
      toast.error("Failed to stop recorder.");
    }
  }

  // Chat implementation: Toggle sidebar
  const clickChat = () => {
    setShowChat(!showChat);
    // Also ensure we are not floating if we open chat
    if (isFloating) setIsFloating(false);
  };

  return (
    <>
      {showModal && (
        <div className={isFloating ? 'minimize' : 'maximize'}
          onMouseDown={handleMouseDown}
          ref={boxRef}
          style={{
            left: isFloating ? position.x : '0px',
            top: isFloating ? position.y : '0px',
            right: "auto",
            bottom: "auto",




          }}>
          <ModalContent onClick={(e) => e.stopPropagation()} $isFloating={isFloating}>
            <ReconnectModal
              visible={showReconnectModal}
              goToBack={goToBack}
            />
            <div className="modal-header">
              <h5
                className="modal-title"
                style={{
                  color: "white",
                  marginRight: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                {callType.toUpperCase()} CALL
                {isRecording ? (
                  <span style={{ color: recordingBlinkOn ? "#ef4444" : "#fca5a5", fontSize: 12 }}>
                    {" "} | {recordingBlinkOn ? "REC" : "RECORDING"}
                  </span>
                ) : null}
              </h5>
              {waitingCalls.length > 0 && (
                <PulsingAlert>
                  <span>
                    <i className="fas fa-phone-volume" style={{ marginRight: '8px' }}></i>
                    Waiting: {waitingCalls.map(c => c.isDirect ? c.callerName : c.groupName).join(', ')}
                  </span>
                </PulsingAlert>
              )}

              <button
                type="button"
                onClick={() => setIsFloating(!isFloating)}
                style={{
                  backgroundColor: "white",
                  width: "25px",
                  height: "25px",
                  borderRadius: "5px",
                  color: "black",
                  marginRight: "8px",
                  lineHeight: "0px",
                  padding: "0",
                  fontSize: "28px",
                }}
              >
                -
              </button>
              {isGroupAdmin ? (
                <button
                  type="button"
                  onClick={() => {
                    if (isRecording) {
                      if (!activeRecordingId) {
                        toast.error("No active recording to stop.");
                        return;
                      }
                      requestStopRecording(activeRecordingId);
                    } else {
                      requestStartRecording();
                    }
                  }}
                  disabled={recordingBusy}
                  style={{
                    backgroundColor: isRecording ? "#ef4444" : "white",
                    width: "auto",
                    height: "25px",
                    borderRadius: "5px",
                    color: isRecording ? "white" : "black",
                    marginRight: "8px",
                    lineHeight: "0px",
                    padding: "0 10px",
                    fontSize: 12,
                    border: isRecording ? "none" : "1px solid #e5e7eb",
                    cursor: recordingBusy ? "not-allowed" : "pointer",
                  }}
                  title="Record/Stop (admin only)"
                >
                  {isRecording ? "Stop" : "Record"}
                </button>
              ) : isRecording ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginRight: "8px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: recordingBlinkOn ? "#ef4444" : "#fca5a5",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: recordingBlinkOn ? "#ef4444" : "#fca5a5",
                    }}
                  />
                  Recording
                </span>
              ) : null}
            </div>
            <div style={{ display: 'flex', width: '100%', height: 'calc(100% - 50px)', position: 'relative' }}>
              <VideoContainer $isFloating={isFloating} className={`width-peer${remotePeers.length > 8 ? "" : remotePeers.length}`} style={{ flex: 1, height: '100%' }}>
                <VideoBox>
                  {userVideoAudio["localUser"].video ? <Label>You</Label> : <UserName>You</UserName>}
                  {/* Hide expand icon during screen share to prevent infinite loop */}
                  {!screenShare && <FaIcon className="fas fa-expand" onClick={expandScreen} />}
                  <MyVideo
                    ref={userVideoRef}
                    muted
                    autoPlay
                    playsInline
                    controls={false}
                    style={{
                      transform: (screenShare || !hasRealVideo) ? "scaleX(1)" : "scaleX(-1)",
                      cursor: screenShare ? "default" : "pointer",
                      opacity: screenShareLoading ? 0.5 : 1
                    }}
                    onClick={!screenShare ? expandScreen : undefined}
                  />
                  {/* Screen share loading indicator */}
                  {screenShareLoading && (
                    <LoadingOverlay>
                      <LoadingSpinner />
                      <LoadingText>Starting Screen Share...</LoadingText>
                    </LoadingOverlay>
                  )}
                  {!userVideoAudio["localUser"].audio && (
                    <MuteIconContainer>
                      🔇
                    </MuteIconContainer>
                  )}
                  {isSpeaking && userVideoAudio["localUser"].audio && (
                    <SpeakingDot />
                  )}
                </VideoBox>
                {remotePeers.map((remote, index, arr) => {
                const info = userVideoAudio[remote.userId] || {};
                const displayName =
                  info.senderName || info.name || info.fullName || remote.userId;
                  const isMuted = info.audio === false;
                  const isScreenSharing = info.isScreenShare;

                  return (
                    <VideoBox
                      key={remote.userId}
                      onClick={!isScreenSharing ? expandScreen : undefined}
                      $isScreenShare={isScreenSharing}
                      style={{
                        cursor: isScreenSharing ? "default" : "pointer"
                      }}
                    >
                      {writeUserName(displayName)}
                      {/* Hide expand icon when screen sharing to prevent infinite loop */}
                      {!isScreenSharing && <FaIcon className="fas fa-expand" />}
                      <VideoCard
                        stream={remote.stream}
                        username={remote.userId}
                        number={arr.length}
                        fullName={displayName}
                        isMuted={isMuted}
                        isScreenShare={isScreenSharing}
                        callType={callType}
                      />
                    </VideoBox>
                  );
                })}
              </VideoContainer>
              {showChat && (
                <ChatSidebarContainer show={showChat}>
                  <ChatSidebarHeader>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="fas fa-comments" style={{ color: 'var(--primary-color)' }} />
                      <span style={{ fontWeight: 600, fontSize: '1rem', color: '#334155' }}>In-call Messages</span>
                    </div>
                    <IconButton onClick={() => setShowChat(false)} size="small">
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </ChatSidebarHeader>
                  <ChatSidebarBody>
                    <ChatArea
                      {...chatAreaProps}
                      isMeetingOverlay={true}
                      forceChatView={true}
                      onBack={() => setShowChat(false)}
                    />
                  </ChatSidebarBody>
                </ChatSidebarContainer>
              )}
            </div>

            <BottomBar
              clickScreenSharing={clickScreenSharing}
              clickCameraDevice={clickCameraDevice}
              goToBack={goToBack}
              toggleCameraAudio={toggleCameraAudio}
              userVideoAudio={userVideoAudio["localUser"]}
              screenShare={screenShare}
              videoDevices={videoDevices}
              showVideoDevices={showVideoDevices}
              setShowVideoDevices={setShowVideoDevices}
              callType={callType}
              hasRealDevices={hasRealDevices}
              currentScreenSharer={currentScreenSharer}
              isGuestMeeting={isGuestMeeting}
              clickChat={clickChat}
            />

          </ModalContent>
        </div>
      )}
    </>
  );
};

export default Room;

// Styled Components
const ModalOverlay = styled.div`
  position: fixed;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  width: 100%;
  height: 100%;
  right: 0;
  bottom: 0;
`;

const ChatSidebarContainer = styled.div`
  width: 350px;
  height: calc(100% - 20px);
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  box-shadow: -2px 0 10px rgba(0,0,0,0.1);
  animation: slideIn 0.3s ease-out;
  flex-shrink: 0;
  z-index: 100;

  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  @media (max-width: 768px) {
    position: fixed;
    top: 0;
    right: 0;
    width: 100%;
    z-index: 10000;
  }
`;

const ChatSidebarHeader = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
`;

const ChatSidebarBody = styled.div`
  flex: 1;
  overflow: hidden;
  height: calc(100% - 48px);
`;

const ModalOverlay_minimize = styled.div`
  position: fixed;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  width: 270px;
  height: 270px;
  right: 0;
  bottom: 0;
`;

const ModalContent = styled.div`
  background: #1a1a1a;
  padding: ${props => props?.$isFloating ? '20px' : '10px'};
  border-radius: 12px;
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.5);
  width: 100%;
  height: ${props => props?.$isFloating ? '100%' : '100vh'};
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  
  ${props => !props?.$isFloating && `
    .header-section {
      flex-shrink: 0;
    }
    
    .video-section {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    
    .bottom-section {
      flex-shrink: 0;
      height: 50px;
    }
  `}
`;
// grid-template-columns: ${props => props?.isFloating ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))'};
const VideoContainer = styled.div`
   ${props => !props?.$isFloating && `display: grid;`}
  
  gap: ${props => props?.$isFloating ? '8px' : '8px'};
  height: ${props => props?.$isFloating ? 'calc(100% - 50px)' : 'calc(100% - 100px)'};
  overflow: hidden;
  padding: 0 5px;
  min-height: 0;
  align-content: center;
  transition: all 0.3s ease-in-out;
  overflow-y: auto;
  
  ${props => !props?.$isFloating && `
    @media (max-width: 768px) {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 6px;
    }
    
    @media (max-width: 480px) {
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 4px;
    }
  `}
`;

const VideoBox = styled.div`
  background: #2c2c2c;
  border-radius: 8px;
  padding: ${props => props?.$isFloating ? '8px' : '4px'};
  position: relative;
  width: 100%;
  // aspect-ratio: ${props => props?.isFloating ? '4/3' : '16/9'};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  
  /* Main screen share takes full area */
  ${props => props?.$isMainShare && `
    width: 100%;
    height: 100%;
    background: #000;
    padding: 0;
  `}
  
  /* Make screen shares bigger by spanning 2 columns in grid */
  ${props => props?.$isScreenShare && !props?.$isFloating && !props?.$isMainShare && `
    grid-column: span 2;
    @media (max-width: 768px) {
      grid-column: span 1; /* Mobile: take full width */
    }
  `}
  
  ${props => !props?.$isFloating && !props?.$isMainShare && `
    @media (max-width: 768px) {
      padding: 3px;
    }
    
    @media (max-width: 480px) {
      padding: 2px;
    }
  `}
`;

const MyVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 10px;
`;

const UserName = styled.div`
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 8px;
  color: white;
  border-radius: 5px;
  font-size: 12px;
  z-index: 2;
`;

const Label = styled(UserName)`
  background-color: #1abc9c;
`;

const FaIcon = styled.i`
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 14px;
  color: white;
  cursor: pointer;
  z-index: 2;
`;

const pulseAnimation = keyframes`
  0% { background-color: #802d00ff; }
  50% { background-color: #b13e00ff; }
  100% { background-color: #963400ff; }
`;

const PulsingAlert = styled.div`
  background-color: #E65100;
  padding: 8px 12px;
  border-radius: 5px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  margin-right: 10px;
  color: #fff;
  font-weight: bold;
  cursor: pointer;
  animation: ${pulseAnimation} 1.5s infinite;
`;

const MuteIconContainer = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: rgba(211, 150, 156, 0.8);
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  z-index: 2;
`;

const SpeakingDot = styled.div`
  position: absolute;
  bottom: 8px;
  right: 32px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.9);
`;

// Google Meet-style Layout Components
const ScreenShareLayout = styled.div`
  display: flex;
  flex-direction: row;
  gap: 10px;
  width: 100%;
  height: calc(100vh - 200px);
  padding: ${props => props?.$isFloating ? '5px' : '10px'};
  box-sizing: border-box;

  ${props => props?.$isFloating && `
    height: 100%;
    padding: 5px;
  `}

  @media (max-width: 768px) {
    flex-direction: column;
    height: calc(100vh - 180px);
  }
`;

const MainScreenShareArea = styled.div`
  flex: 1;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;

  @media (max-width: 768px) {
    height: 60%;
  }
`;

const ParticipantsSidebar = styled.div`
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  background: #1a1a1a;
  border-radius: 8px;
  padding: 8px;
  
  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: #2c2c2c;
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #666;
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: #888;
  }

  @media (max-width: 768px) {
    width: 100%;
    height: 40%;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    
    & > * {
      min-width: 120px;
    }
  }
`;

// Loading indicator components for screen share
const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: 8px;
`;

const spinAnimation = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const LoadingSpinner = styled.div`
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid #fff;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: ${spinAnimation} 1s linear infinite;
`;

const LoadingText = styled.div`
  color: #fff;
  margin-top: 12px;
  font-size: 14px;
  font-weight: 500;
`;