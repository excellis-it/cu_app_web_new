import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import styled, { keyframes } from "styled-components";
import VideoCard from "./VideoCard";
import ParticipantInitialAvatar from "./ParticipantInitialAvatar";
import BottomBar from "./BottomBar";
import ChatArea from "./ChatArea";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import ReconnectModal from "./reconnectionModalComponant";
import { useAppContext } from "../appContext/appContext";
import { Device } from "mediasoup-client";
import { createDummyMediaStream } from "../utils/createDummyMediaStream";
import axios from "axios";
import * as callService from "../utils/callService";
import {
  computeVideoProducerOrientation,
  localPreviewCssRotationDeg,
  producerAppDataRotationToCssDeg,
} from "../utils/videoProducerOrientation";
import { getEqualCallGridStyle } from "../utils/equalCallGridLayout";
import { MAIN_STAGE_MAX } from "../utils/callStageLayout";

const Room = ({
  socketRef,
  room_id,
  onSendData,
  callType,
  joinEvent,
  leaveEvent,
  isGuestMeeting,
  chatAreaProps,
}) => {
  const { globalUser, setGlobalUser } = useAppContext();
  const currentUser = sessionStorage.getItem("user");
  const currentUserFullName = sessionStorage.getItem("fullName");
  const [userVideoAudio, setUserVideoAudio] = useState({
    localUser: { video: true, audio: true },
  });
  /** Always current map for socket handlers registered once inside initializeMedia (avoids stale closure). */
  const userVideoAudioRef = useRef(userVideoAudio);
  useEffect(() => {
    userVideoAudioRef.current = userVideoAudio;
  }, [userVideoAudio]);
  /** Dedup "left" vs "disconnected" toasts (graceful leave + socket disconnect both fire). */
  const participantLeaveToastDedupeRef = useRef({});
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
  const peerAudioRmsRef = useRef({});
  const speakerLevelEmaRef = useRef({});
  /** Stabilizes active speaker so tiles don’t swap on sub‑second silence (debounced + EMA). */
  const dominantStickyRef = useRef({
    committedId: null,
    pendingId: null,
    pendingSince: 0,
  });
  const [dominantSpeakerId, setDominantSpeakerId] = useState(null);
  /** Two participants pinned to the main stage; filmstrip holds the rest. Swaps when a bottom user becomes dominant. */
  const [focusPairIds, setFocusPairIds] = useState(null);
  /** Comma-sorted ids with raw RMS ≥ threshold; updated on rAF for realtime dots / rings (not for stage swap timing). */
  const [liveSpeakingKey, setLiveSpeakingKey] = useState("");
  const liveSpeakingSet = useMemo(() => {
    if (!liveSpeakingKey) return new Set();
    return new Set(liveSpeakingKey.split(","));
  }, [liveSpeakingKey]);

  // Screen recording (SuperAdmin / admin role only — server-side via mediasoup)
  const [isScreenRecording, setIsScreenRecording] = useState(false);
  const [screenRecordingBusy, setScreenRecordingBusy] = useState(false);
  const screenRecordingStartTimeRef = useRef(null);
  const screenRecTimerRef = useRef(null);

  // Call recording (server-side via mediasoup — started by group admin)
  const [isCallRecording, setIsCallRecording] = useState(false);

  const isAudioOnlyCall = callType === "audio";

  /** Byte time-domain RMS; keep in sync with local `setIsSpeaking(rms > 4)` and dominant rawPick. */
  const SPEAKING_RMS_THRESHOLD = 4;

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
  const recoveryTimerRef = useRef(null);
  const recoveryInProgressRef = useRef(false);
  const unmountingRef = useRef(false);
  const iceRestartInProgressRef = useRef(false); // true while an ICE restart is pending
  const consumeRtpCapabilitiesRef = useRef(null);

  const [localPreviewRotationDeg, setLocalPreviewRotationDeg] = useState(0);
  /** Mediasoup producer appData per remote userId (rotation from mobile/web produce). */
  const [remoteProducerAppData, setRemoteProducerAppData] = useState({});

  const refreshLocalPreviewOrientation = useCallback(() => {
    if (isAudioOnlyCall) {
      setLocalPreviewRotationDeg(0);
      return;
    }
    const t = userStream.current?.getVideoTracks?.()?.[0];
    if (!t || t.readyState === "ended") {
      setLocalPreviewRotationDeg(0);
      return;
    }
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isMobileBrowser = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const meta = computeVideoProducerOrientation(t, isMobileBrowser);
    setLocalPreviewRotationDeg(localPreviewCssRotationDeg(meta));
  }, [isAudioOnlyCall]);

  const setRemoteVideoMeta = useCallback((userId, partial) => {
    if (userId == null) return;
    const uid = String(userId);
    setRemoteProducerAppData((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], ...partial },
    }));
  }, []);

  const clearRemoteVideoMeta = useCallback((userId) => {
    if (userId == null) return;
    const uid = String(userId);
    setRemoteProducerAppData((prev) => {
      if (!(uid in prev)) return prev;
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }, []);

  const filterPreferredCodecs = (caps) => {
    if (!caps || !Array.isArray(caps.codecs)) return caps;
    const supportedVideoMimeTypes = new Set(["video/h264", "video/vp8"]);
    const videoPayloadTypes = new Set(
      caps.codecs
        .filter((codec) =>
          supportedVideoMimeTypes.has(
            String(codec?.mimeType || "").toLowerCase(),
          ),
        )
        .map((codec) => codec.preferredPayloadType)
        .filter((pt) => typeof pt === "number"),
    );

    return {
      ...caps,
      codecs: caps.codecs.filter((codec) => {
        const mimeType = String(codec?.mimeType || "").toLowerCase();
        if (
          mimeType === "audio/opus" ||
          supportedVideoMimeTypes.has(mimeType)
        ) {
          return true;
        }
        if (mimeType !== "video/rtx") return false;
        const apt = Number(codec?.parameters?.apt);
        return Number.isFinite(apt) && videoPayloadTypes.has(apt);
      }),
    };
  };

  const getPreferredVideoCodec = (codecs) => {
    if (!Array.isArray(codecs)) return undefined;
    const h264Codec = codecs.find(
      (codec) => String(codec?.mimeType || "").toLowerCase() === "video/h264",
    );
    if (h264Codec) return h264Codec;
    return codecs.find(
      (codec) => String(codec?.mimeType || "").toLowerCase() === "video/vp8",
    );
  };

  const boxRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({
    x: 0,
    y: 0,
  });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

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

  // ICE restart for a single transport. Asks the server to regenerate ICE credentials,
  // then tells the mediasoup-client transport to use them.
  // This recovers from NAT binding expiry without tearing down producers/consumers.
  const restartTransportIce = async (
    transport,
    transportId,
    roomId,
    userId,
  ) => {
    const socket = socketRef.current;
    if (!socket || !transport || transport.closed) return false;
    try {
      const res = await new Promise((resolve) => {
        socket.emit("MS-restart-ice", { roomId, userId, transportId }, resolve);
      });
      if (!res?.ok || !res.iceParameters) return false;
      await transport.restartIce({ iceParameters: res.iceParameters });
      console.log("[room.js] ICE restart applied", { transportId });
      return true;
    } catch (err) {
      console.warn("[room.js] ICE restart failed", { transportId, err });
      return false;
    }
  };

  // Called by VideoCard when a remote video stream appears frozen for >5s.
  // Attempts a lightweight ICE restart of the recv transport to restore packet flow.
  const handleRemoteVideoFreeze = async (username) => {
    if (recoveryInProgressRef.current || iceRestartInProgressRef.current)
      return;
    const recvTransport = recvTransportRef.current;
    if (!recvTransport || recvTransport.closed) return;
    iceRestartInProgressRef.current = true;
    console.warn(
      "[room.js] remote video freeze — attempting ICE restart of recvTransport",
      { username },
    );
    try {
      const ok = await restartTransportIce(
        recvTransport,
        recvTransport.id,
        roomId,
        currentUser,
      );
      if (!ok) {
        console.warn(
          "[room.js] ICE restart failed after freeze; falling back to full transport rebuild",
        );
        recoveryInProgressRef.current = true;
        consumedProducerIdsRef.current.clear();
        try {
          sendTransportRef.current?.close();
        } catch {}
        try {
          recvTransportRef.current?.close();
        } catch {}
        sendTransportRef.current = null;
        recvTransportRef.current = null;
        deviceRef.current = null;
        await initializeMediasoup(roomId, currentUser);
      }
    } finally {
      iceRestartInProgressRef.current = false;
      recoveryInProgressRef.current = false;
    }
  };

  // Fallback: fetch and consume producers for a newly joined peer (in case MS-new-producer was missed)
  const fetchAndConsumeProducersForNewPeer = async (
    rId,
    myUserId,
    newPeerUserId,
    retryCount = 0,
    callGen = callGenRef.current,
  ) => {
    if (String(newPeerUserId) === String(myUserId)) {
      console.log("[room.js] fetchAndConsumeProducers: skip (cannot consume own user)");
      return;
    }
    // Abort if a new call has started since this retry chain was created
    if (callGenRef.current !== callGen) {
      console.log(
        "[room.js] fetchAndConsumeProducers: stale call gen, aborting",
        { callGen, current: callGenRef.current },
      );
      return;
    }
    const socket = socketRef.current;
    // Use refs first; fall back to socket-stored (survives Room remounts)
    const device = deviceRef.current || socket?.mediasoupDevice;
    const recvTransport =
      recvTransportRef.current || socket?.mediasoupRecvTransport;
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
        setTimeout(
          () =>
            fetchAndConsumeProducersForNewPeer(
              rId,
              myUserId,
              newPeerUserId,
              retryCount + 1,
              callGen,
            ),
          1000,
        );
      }
      return;
    }
    const stream = remoteStreamsRef.current[newPeerUserId];
    if (!stream || stream.getTracks().length > 0) return; // already have tracks
    try {
      const roomIdStr = String(rId);
      console.log(
        "[room.js] fetchAndConsumeProducers: calling MS-get-producers",
        {
          roomId: roomIdStr,
          myUserId,
          newPeerUserId,
        },
      );
      const existing = await callService.getProducers(socket, {
        roomId: roomIdStr,
        userId: myUserId,
      });
      const forPeer = existing.filter(
        (p) => String(p.userId) === String(newPeerUserId),
      );
      console.log("[room.js] fetchAndConsumeProducers", {
        newPeerUserId,
        totalProducers: existing.length,
        forThisPeer: forPeer.length,
      });
      if (forPeer.length === 0) {
        // Peer joined the socket room but hasn't published mediasoup producers yet — retry
        if (retryCount < 15) {
          console.log(
            "[room.js] fetchAndConsumeProducers: no producers yet for peer, retrying in 1s",
            {
              newPeerUserId,
              attempt: retryCount + 1,
              max: 15,
            },
          );
          setTimeout(
            () =>
              fetchAndConsumeProducersForNewPeer(
                rId,
                myUserId,
                newPeerUserId,
                retryCount + 1,
                callGen,
              ),
            1000,
          );
        }
        return;
      }
      for (const p of forPeer) {
        try {
          if (consumedProducerIdsRef.current.has(p.producerId)) {
            console.log(
              "[room.js] fetchAndConsumeProducers: skipping duplicate producer",
              p.producerId,
            );
            continue;
          }
          consumedProducerIdsRef.current.add(p.producerId);
          console.log(
            "[room.js] fetchAndConsumeProducers: consuming producer",
            {
              producerId: p.producerId,
              kind: p.kind,
            },
          );
          const consumeInfo = await callService.consume(socket, {
            roomId: rId,
            userId: myUserId,
            producerId: p.producerId,
            rtpCapabilities:
              consumeRtpCapabilitiesRef.current || device.rtpCapabilities,
          });
          const consumer = await recvTransport.consume({
            id: consumeInfo.id,
            producerId: consumeInfo.producerId,
            kind: consumeInfo.kind,
            rtpParameters: consumeInfo.rtpParameters,
            paused: consumeInfo.paused ?? true,
          });
          console.log("[room.js] consumer track state (retry)", {
            kind: consumer.kind,
            paused: consumer.paused,
            trackMuted: consumer.track.muted,
            trackReadyState: consumer.track.readyState,
          });
          const kind = consumeInfo.kind || p.kind;
          let existingStream = remoteStreamsRef.current[newPeerUserId];
          if (!existingStream) existingStream = new MediaStream();
          else {
            if (kind === "video")
              existingStream
                .getVideoTracks()
                .forEach((t) => existingStream.removeTrack(t));
            else if (kind === "audio")
              existingStream
                .getAudioTracks()
                .forEach((t) => existingStream.removeTrack(t));
          }
          existingStream.addTrack(consumer.track);
          const newStream = new MediaStream(existingStream.getTracks());
          remoteStreamsRef.current[newPeerUserId] = newStream;
          setRemotePeers(
            Object.entries(remoteStreamsRef.current).map(([uid, s]) => ({
              userId: uid,
              stream: s,
            })),
          );
          if (kind === "video") {
            setRemoteVideoMeta(newPeerUserId, {
              rotation: p.rotation,
              width: p.width,
              height: p.height,
            });
          }
          console.log(
            "[room.js] fetchAndConsumeProducers: consumed producer for",
            newPeerUserId,
          );

          // Resume consumer — server creates consumers paused=true
          socket.emit("MS-resume-consumer", {
            roomId: rId,
            userId: myUserId,
            consumerId: consumer.id,
          });
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
    console.log(
      "[room.js] remotePeers updated:",
      remotePeers.map((p) => ({
        userId: p.userId,
        hasAudio: !!p.stream?.getAudioTracks()?.length,
        hasVideo: !!p.stream?.getVideoTracks()?.length,
      })),
    );
  }, [remotePeers]);

  useEffect(() => {
    refreshLocalPreviewOrientation();
  }, [stream, refreshLocalPreviewOrientation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOrient = () => refreshLocalPreviewOrientation();
    window.addEventListener("orientationchange", onOrient);
    const so = typeof screen !== "undefined" ? screen.orientation : null;
    if (so && typeof so.addEventListener === "function") {
      so.addEventListener("change", onOrient);
    }
    return () => {
      window.removeEventListener("orientationchange", onOrient);
      if (so && typeof so.removeEventListener === "function") {
        so.removeEventListener("change", onOrient);
      }
    };
  }, [refreshLocalPreviewOrientation]);

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
        peerAudioRmsRef.current.localUser = rms;
        setIsSpeaking(rms > SPEAKING_RMS_THRESHOLD);
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    } catch (e) {
      console.warn("Audio level meter init failed:", e);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      try {
        source && source.disconnect();
      } catch {}
      try {
        analyser && analyser.disconnect();
      } catch {}
      try {
        audioContext && audioContext.close();
      } catch {}
    };
  }, [stream]);

  const remoteStreamsSignature = useMemo(
    () =>
      remotePeers
        .map(
          (p) =>
            `${String(p.userId)}:${p.stream?.id ?? ""}:${p.stream?.getAudioTracks?.()?.[0]?.id ?? ""}`,
        )
        .join("|"),
    [remotePeers],
  );

  // Remote mic levels for active-speaker detection (every participant runs this on received audio)
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (isFloating || remotePeers.length === 0) return undefined;

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return undefined;

    let ctx;
    const cleanups = [];
    const entries = [];

    try {
      ctx = new AC();
    } catch (e) {
      console.warn("[room] AudioContext for remote levels failed:", e);
      return undefined;
    }

    remotePeers.forEach((peer) => {
      const track = peer.stream?.getAudioTracks?.()?.[0];
      if (!track || track.readyState === "ended") return;
      try {
        const src = ctx.createMediaStreamSource(new MediaStream([track]));
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        entries.push([String(peer.userId), an]);
        cleanups.push(() => {
          try {
            src.disconnect();
          } catch {}
          try {
            an.disconnect();
          } catch {}
        });
      } catch (e) {
        console.warn("[room] remote audio analyser failed:", peer.userId, e);
      }
    });

    if (entries.length === 0) {
      ctx.close().catch(() => {});
      return undefined;
    }

    ctx.resume?.().catch(() => {});

    const buf = new Uint8Array(512);
    let raf;
    const tick = () => {
      for (const [uid, an] of entries) {
        try {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = buf[i] - 128;
            sum += v * v;
          }
          peerAudioRmsRef.current[uid] = Math.sqrt(sum / buf.length);
        } catch {
          peerAudioRmsRef.current[uid] = 0;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      cleanups.forEach((fn) => fn());
      entries.forEach(([uid]) => {
        delete peerAudioRmsRef.current[uid];
      });
      ctx.close().catch(() => {});
    };
  }, [remoteStreamsSignature, isFloating]);

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
        } else if (
          !navigator ||
          !navigator.mediaDevices ||
          !navigator.mediaDevices.enumerateDevices
        ) {
          console.warn(
            "mediaDevices.enumerateDevices not available; skipping device check and using dummy stream.",
          );
          // Leave deviceCheckPassed = false so we hit the dummy-stream fallback below.
        } else {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const hasAudio = devices.some(
            (device) => device.kind === "audioinput",
          );
          const hasVideo = devices.some(
            (device) => device.kind === "videoinput",
          );

          setVideoDevices(
            devices.filter((device) => device.kind === "videoinput"),
          );

          // First, try to get audio if available
          if (hasAudio) {
            try {
              const audioStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
              });
              audioTrack = audioStream.getAudioTracks()[0];
              console.log("[room.js] Successfully captured audio track");
            } catch (audioErr) {
              console.warn("Audio capture failed:", audioErr);
              if (audioErr.name === "NotAllowedError") {
                toast.error(
                  "Microphone permission denied. Please allow access to microphone.",
                );
              }
            }
          }

          // Always try to get video on video calls, regardless of enumerateDevices(),
          // and fall back gracefully if it fails or there is no physical camera.
          if (!isAudioOnlyCall) {
            try {
              const ua =
                typeof navigator !== "undefined" ? navigator.userAgent : "";
              const isMobileBrowser = /Android|iPhone|iPad|iPod|Mobile/i.test(
                ua,
              );
              const effectiveType = navigator?.connection?.effectiveType || "";
              const lowBandwidthNet =
                effectiveType === "slow-2g" ||
                effectiveType === "2g" ||
                effectiveType === "3g";
              const mobileVideoConstraints =
                isMobileBrowser || lowBandwidthNet
                  ? {
                      width: { ideal: 480, max: 640 },
                      height: { ideal: 270, max: 360 },
                      frameRate: { ideal: 10, max: 12 },
                    }
                  : {
                      width: { ideal: 960, max: 1280 },
                      height: { ideal: 540, max: 720 },
                      frameRate: { ideal: 15, max: 20 },
                    };
              const videoStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: mobileVideoConstraints,
              });
              videoTrack = videoStream.getVideoTracks()[0];
              console.log("[room.js] Successfully captured video track");
            } catch (videoErr) {
              console.warn("Video capture failed:", videoErr);
              if (videoErr.name === "NotAllowedError") {
                toast.error(
                  "Camera permission denied. Please allow access to camera.",
                );
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
          console.log(
            "[room.js] Using dummy audio track (no microphone available)",
          );
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
              readyState: dummyVideoTrack?.readyState,
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
          hasRealDevices: deviceCheckPassed,
        });

        setHasRealDevices(deviceCheckPassed);
        setHasRealVideo(!isAudioOnlyCall && videoCheckPassed);
        setUserVideoAudio((prev) => ({
          ...prev,
          // Set video/audio to true if tracks exist in stream (including dummy tracks)
          localUser: {
            video: localStreamRef.getVideoTracks().length > 0,
            audio: localStreamRef.getAudioTracks().length > 0,
          },
        }));
      } catch (err) {
        console.error("getUserMedia / enumerateDevices failed:", err);
        if (err.name === "NotReadableError") {
          toast.error("Camera or microphone is already in use.");
        } else if (err.name === "NotAllowedError") {
          toast.error(
            "Permission denied. Please allow access to camera and microphone.",
          );
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
        setUserVideoAudio((prev) => ({
          ...prev,
          // Even dummy stream has video/audio tracks that should be shown
          localUser: {
            video: localStreamRef.getVideoTracks().length > 0,
            audio: localStreamRef.getAudioTracks().length > 0,
          },
        }));

        console.log("[room.js] Using fallback dummy stream with tracks:", {
          videoTracks: localStreamRef.getVideoTracks().length,
          audioTracks: localStreamRef.getAudioTracks().length,
        });
      }

      setStream(localStreamRef);
      userStream.current = localStreamRef;
      refreshLocalPreviewOrientation();

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
          console.log(
            "[room.js] Local video track readyState:",
            localStreamRef.getVideoTracks()[0].readyState,
          );
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
          const otherUsers = users.filter(
            ({ info }) => info && info.userName !== currentUser,
          );
          const isProcessingMultipleOtherUsers = otherUsers.length > 1;

          // Mark that we've received the initial user list BEFORE processing users
          // This ensures we don't show toasts during initial sync
          if (isInitialSync || isProcessingMultipleOtherUsers) {
            hasReceivedInitialUsers.current = true;
          }

          users.forEach(({ userId, info }) => {
            if (!info) {
              console.log(
                "[room.js] FE-user-join: skipping user with missing info",
                { userId },
              );
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
              console.log(
                "[room.js] FE-user-join: skipping user with missing userName",
                { userId, info },
              );
              return;
            }
            {
              console.log(
                "[room.js] registering remote user from FE-user-join",
                {
                  userId,
                  userName,
                  video,
                  audio,
                },
              );
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
                  Object.entries(remoteStreamsRef.current).map(
                    ([uid, stream]) => ({
                      userId: uid,
                      stream,
                    }),
                  ),
                );
                // Fallback: call immediately (will retry every 1s if mediasoup not ready yet)
                fetchAndConsumeProducersForNewPeer(
                  roomId,
                  currentUser,
                  userName,
                );
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
          if (
            !isInitialSync &&
            !isProcessingMultipleOtherUsers &&
            !hasReceivedInitialUsers.current
          ) {
            hasReceivedInitialUsers.current = true;
          }
        });

        // Screen recording socket events
        socketRef.current.on("FE-screen-recording-started", (payload) => {
          try {
            console.log(
              "[room.js][SCREC] FE-screen-recording-started",
              payload,
            );
            setIsScreenRecording(true);
            toast.info("Recording started", {
              position: "top-right",
              autoClose: 2000,
            });
            // Start duration timer for non-admin participants (admin starts it locally)
            if (!screenRecordingStartTimeRef.current) {
              screenRecordingStartTimeRef.current = Date.now();
            }
            startDurationTimer();
          } catch (e) {
            console.error(
              "[room.js] FE-screen-recording-started handler error",
              e,
            );
          }
        });

        socketRef.current.on("FE-screen-recording-stopped", (payload) => {
          try {
            console.log(
              "[room.js][SCREC] FE-screen-recording-stopped",
              payload,
            );
            setIsScreenRecording(false);
            toast.info("Recording stopped. Processing...", {
              position: "top-right",
              autoClose: 3000,
            });
            stopDurationTimer();
          } catch (e) {
            console.error(
              "[room.js] FE-screen-recording-stopped handler error",
              e,
            );
          }
        });

        socketRef.current.on("FE-screen-recording-error", (payload) => {
          const message = payload?.message || "Screen recording error";
          toast.error(message, { position: "top-right", autoClose: 3500 });
          setScreenRecordingBusy(false);
        });

        // Call recording socket events (server-side recording started by group admin)
        socketRef.current.on("FE-recording-started", (payload) => {
          try {
            console.log("[room.js] FE-recording-started", payload);
            setIsCallRecording(true);
          } catch (e) {
            console.error("[room.js] FE-recording-started handler error", e);
          }
        });

        socketRef.current.on("FE-recording-stopped", (payload) => {
          try {
            console.log("[room.js] FE-recording-stopped", payload);
            setIsCallRecording(false);
          } catch (e) {
            console.error("[room.js] FE-recording-stopped handler error", e);
          }
        });

        const LEAVE_TOAST_DEDUP_MS = 7000;
        const toastOptsParticipantGone = {
          position: "top-right",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        };
        const resolveParticipantGoneLabel = (userIdKey, data) => {
          const info = userIdKey
            ? userVideoAudioRef.current[userIdKey] || {}
            : {};
          const raw =
            data?.fullName ||
            info.senderName ||
            info.name ||
            info.fullName ||
            data?.senderName ||
            data?.name ||
            data?.userName ||
            userIdKey ||
            "";
          const s = String(raw).trim();
          if (!s) return "A participant";
          if (/^[a-f0-9]{24}$/i.test(s)) return "A participant";
          return s;
        };
        const showParticipantGoneToastOnce = (userKey, kind, data) => {
          const k = userKey != null ? String(userKey) : "";
          if (!k) return;
          const now = Date.now();
          const map = participantLeaveToastDedupeRef.current;
          if (map[k] != null && now - map[k] < LEAVE_TOAST_DEDUP_MS) return;
          map[k] = now;
          const label = resolveParticipantGoneLabel(k, data || {});
          if (kind === "graceful") {
            toast.info(`${label} left the call`, toastOptsParticipantGone);
          } else {
            toast.warning(
              `${label} disconnected from the call`,
              toastOptsParticipantGone,
            );
          }
        };

        socketRef.current.on(
          "FE-user-leave",
          ({ userId, userName, fullName }) => {
            if (!userName) {
              console.warn(
                "[room.js] FE-user-leave: skipping, no userName in payload",
                { userId },
              );
              return;
            }
            showParticipantGoneToastOnce(userName, "graceful", {
              fullName,
              userName,
            });

            setUserVideoAudio((prevUserVideoAudio) => {
              const { [userName]: _, ...rest } = prevUserVideoAudio;
              return rest;
            });

            // Remove any mediasoup-rendered stream for this user
            if (remoteStreamsRef.current[userName]) {
              delete remoteStreamsRef.current[userName];
              clearRemoteVideoMeta(userName);
              setRemotePeers(
                Object.entries(remoteStreamsRef.current).map(
                  ([uid, stream]) => ({
                    userId: uid,
                    stream,
                  }),
                ),
              );
            }
          },
        );

        socketRef.current.on("FE-toggle-camera", ({ userId, switchTarget }) => {
          const uv = userVideoAudioRef.current;
          const targetUserName = Object.keys(uv).find(
            (name) =>
              name === userId ||
              String(uv[name]?.socketId ?? "") === String(userId),
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

        socketRef.current.on(
          "FE-toggle-screen-share",
          ({ userId, isScreenShare, userName }) => {
            const uv = userVideoAudioRef.current;
            const found = Object.entries(uv).find(
              ([, inf]) =>
                inf &&
                String(inf.socketId ?? "") === String(userId),
            );
            const peerUserName = found ? found[0] : null;
            if (peerUserName) {
              setUserVideoAudio((prev) => ({
                ...prev,
                [peerUserName]: {
                  ...prev[peerUserName],
                  isScreenShare: isScreenShare,
                },
              }));

              // Track who is currently sharing
              if (isScreenShare) {
                setCurrentScreenSharer({ userId, userName: peerUserName });
              } else {
                // Clear if this user stopped sharing
                setCurrentScreenSharer((prev) =>
                  prev?.userId === userId ? null : prev,
                );
              }
            }
          },
        );

        socketRef.current.on("FE-user-disconnected", (data) => {
          const disconnectedUserId = data?.userSocketId;
          if (!disconnectedUserId) return;

          const userNameToRemove = data?.userName;
          showParticipantGoneToastOnce(
            userNameToRemove || disconnectedUserId,
            "abrupt",
            data,
          );


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
              clearRemoteVideoMeta(userNameToRemove);
              setRemotePeers(
                Object.entries(remoteStreamsRef.current).map(
                  ([uid, stream]) => ({
                    userId: uid,
                    stream,
                  }),
                ),
              );
            }
          }
        });

        socketRef.current.on("FE-guest-disconnected", (data) => {
          const disconnectedUserId = data?.userSocketId;
          if (!disconnectedUserId) return;

          const userNameToRemove = data?.userName;

          if (userNameToRemove) {
            showParticipantGoneToastOnce(userNameToRemove, "abrupt", {
              senderName: data?.senderName,
              name: data?.name,
              fullName: data?.fullName,
              userName: userNameToRemove,
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
              clearRemoteVideoMeta(userNameToRemove);
              setRemotePeers(
                Object.entries(remoteStreamsRef.current).map(
                  ([uid, stream]) => ({
                    userId: uid,
                    stream,
                  }),
                ),
              );
            }
          }
        });

        socketRef.current.on("waiting_call", (data) => {
          setWaitingCalls((prev) => {
            // Avoid duplicates based on roomId or socketId
            if (prev.find((c) => c.roomId === data.roomId)) return prev;
            return [...prev, data];
          });
          const callerDisplay = data.isDirect
            ? data.callerName
            : data.groupName;
          toast.info(
            `${callerDisplay} is calling (${data.callType})... Call is waiting.`,
          );
        });

        // Clear waiting calls when a call ends
        socketRef.current.on("FE-call-ended", (data) => {
          if (data?.roomId) {
            setWaitingCalls((prev) =>
              prev.filter((c) => c.roomId !== data.roomId),
            );
          }
        });

        // Clear waiting calls when user leaves
        socketRef.current.on("FE-leave", (data) => {
          if (data?.roomId) {
            setWaitingCalls((prev) =>
              prev.filter((c) => c.roomId !== data.roomId),
            );
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

          // Check if a call recording is already ongoing (late joiner support)
          try {
            const token = globalUser?.data?.token;
            const res = await axios.get("/api/groups/recordings/ongoing", {
              headers: { "access-token": token },
              params: { groupId: roomId },
            });
            if (res?.data?.data?.isRecording) {
              setIsCallRecording(true);
            }
          } catch (e) {
            console.error("[room.js] Failed to check ongoing recording", e);
          }
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
      consumeRtpCapabilitiesRef.current = null;
      if (socket) {
        socket.mediasoupDevice = null;
        socket.mediasoupRecvTransport = null;
      }
      console.log("[room.js] initializeMediasoup start", {
        roomId,
        userId,
        socketId: socket.id,
      });

      // 1) Get RTP capabilities
      let rtpCaps;
      try {
        const routerCaps = await callService.getRtpCapabilities(socket, {
          roomId,
        });
        rtpCaps = filterPreferredCodecs(routerCaps);
        console.log("[room.js] got rtpCaps", rtpCaps);
      } catch (e) {
        console.error("[room.js] getRtpCapabilities failed", e);
        throw e;
      }

      // 2) Create Device
      const device = new Device();
      console.log(
        "[room.js] Device created, loading with routerRtpCapabilities",
      );
      await device.load({ routerRtpCapabilities: rtpCaps });
      consumeRtpCapabilitiesRef.current = filterPreferredCodecs(
        device.rtpCapabilities,
      );
      deviceRef.current = device;
      socket.mediasoupDevice = device; // Persist on socket for fetchAndConsumeProducers (survives remounts)
      console.log("[room.js] Device loaded and stored", {
        canProduceAudio: device.canProduce("audio"),
        canProduceVideo: device.canProduce("video"),
      });

      // 2.5) Fetch ICE servers (STUN/TURN) from backend
      let iceServers = [];
      let iceTransportPolicy = "all";
      try {
        const iceConfig = await callService.getIceServers(socket);
        iceServers = iceConfig.iceServers || [];
        iceTransportPolicy = iceConfig.iceTransportPolicy || "all";
        console.log("[room.js] got iceServers", {
          count: iceServers.length,
          iceTransportPolicy,
        });
      } catch (e) {
        console.warn(
          "[room.js] getIceServers failed, continuing without TURN",
          e,
        );
      }

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
        iceServers,
        iceTransportPolicy,
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

      sendTransport.on(
        "produce",
        ({ kind, rtpParameters, appData }, callback, errback) => {
          console.log("[room.js] sendTransport produce requested", { kind });
          socket.emit(
            "MS-produce",
            {
              roomId,
              userId,
              transportId: sendTransport.id,
              kind,
              rtpParameters,
              appData,
            },
            (res) => {
              if (res && res.ok && res.id) callback({ id: res.id });
              else errback(new Error(res?.error || "produce-failed"));
            },
          );
        },
      );

      sendTransportRef.current = sendTransport;
      sendTransport.on("connectionstatechange", (state) => {
        console.log("[room.js] sendTransport connectionstatechange", state);
        if (state === "connected") {
          if (recoveryTimerRef.current) {
            clearTimeout(recoveryTimerRef.current);
            recoveryTimerRef.current = null;
          }
          iceRestartInProgressRef.current = false;
          return;
        }
        if (
          state === "disconnected" &&
          !recoveryInProgressRef.current &&
          !recoveryTimerRef.current &&
          !iceRestartInProgressRef.current
        ) {
          // Disconnected is often transient — wait briefly then try ICE restart before full rebuild
          recoveryTimerRef.current = setTimeout(async () => {
            recoveryTimerRef.current = null;
            if (recoveryInProgressRef.current || unmountingRef.current) return;
            if (!socketRef.current?.connected) return;
            if (sendTransport.connectionState === "connected") return; // recovered on its own
            iceRestartInProgressRef.current = true;
            console.warn(
              "[room.js] send transport disconnected; attempting ICE restart",
            );
            const ok = await restartTransportIce(
              sendTransport,
              sendTransport.id,
              roomId,
              userId,
            );
            iceRestartInProgressRef.current = false;
            if (!ok && sendTransport.connectionState !== "connected") {
              // ICE restart didn't help — full rebuild
              recoveryInProgressRef.current = true;
              console.warn(
                "[room.js] send transport ICE restart failed; rebuilding mediasoup transports",
              );
              try {
                try {
                  audioProducerRef.current?.close();
                } catch {}
                try {
                  videoProducerRef.current?.close();
                } catch {}
                try {
                  sendTransportRef.current?.close();
                } catch {}
                try {
                  recvTransportRef.current?.close();
                } catch {}
                audioProducerRef.current = null;
                videoProducerRef.current = null;
                sendTransportRef.current = null;
                recvTransportRef.current = null;
                deviceRef.current = null;
                consumedProducerIdsRef.current.clear();
                await initializeMediasoup(roomId, userId);
              } catch (err) {
                console.error("[room.js] send transport recovery failed", err);
              } finally {
                recoveryInProgressRef.current = false;
              }
            }
          }, 3500);
        } else if (
          state === "failed" &&
          !recoveryInProgressRef.current &&
          !recoveryTimerRef.current
        ) {
          // Failed is definitive — rebuild immediately after a short grace period
          recoveryTimerRef.current = setTimeout(async () => {
            recoveryTimerRef.current = null;
            if (recoveryInProgressRef.current || unmountingRef.current) return;
            if (!socketRef.current?.connected) return;
            recoveryInProgressRef.current = true;
            console.warn(
              "[room.js] send transport failed; rebuilding mediasoup transports",
            );
            try {
              try {
                audioProducerRef.current?.close();
              } catch {}
              try {
                videoProducerRef.current?.close();
              } catch {}
              try {
                sendTransportRef.current?.close();
              } catch {}
              try {
                recvTransportRef.current?.close();
              } catch {}
              audioProducerRef.current = null;
              videoProducerRef.current = null;
              sendTransportRef.current = null;
              recvTransportRef.current = null;
              deviceRef.current = null;
              consumedProducerIdsRef.current.clear();
              await initializeMediasoup(roomId, userId);
            } catch (err) {
              console.error("[room.js] send transport recovery failed", err);
            } finally {
              recoveryInProgressRef.current = false;
            }
          }, 1000);
        }
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
        iceServers,
        iceTransportPolicy,
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
        if (state === "connected") {
          if (recoveryTimerRef.current) {
            clearTimeout(recoveryTimerRef.current);
            recoveryTimerRef.current = null;
          }
          iceRestartInProgressRef.current = false;
          return;
        }
        if (
          state === "disconnected" &&
          !recoveryInProgressRef.current &&
          !recoveryTimerRef.current &&
          !iceRestartInProgressRef.current
        ) {
          // Disconnected is often transient — wait briefly then try ICE restart before full rebuild
          recoveryTimerRef.current = setTimeout(async () => {
            recoveryTimerRef.current = null;
            if (recoveryInProgressRef.current || unmountingRef.current) return;
            if (!socketRef.current?.connected) return;
            if (recvTransport.connectionState === "connected") return; // recovered on its own
            iceRestartInProgressRef.current = true;
            console.warn(
              "[room.js] recv transport disconnected; attempting ICE restart",
            );
            const ok = await restartTransportIce(
              recvTransport,
              recvTransport.id,
              roomId,
              userId,
            );
            iceRestartInProgressRef.current = false;
            if (!ok && recvTransport.connectionState !== "connected") {
              // ICE restart didn't help — full rebuild
              recoveryInProgressRef.current = true;
              console.warn(
                "[room.js] recv transport ICE restart failed; rebuilding mediasoup transports",
              );
              try {
                try {
                  audioProducerRef.current?.close();
                } catch {}
                try {
                  videoProducerRef.current?.close();
                } catch {}
                try {
                  sendTransportRef.current?.close();
                } catch {}
                try {
                  recvTransportRef.current?.close();
                } catch {}
                audioProducerRef.current = null;
                videoProducerRef.current = null;
                sendTransportRef.current = null;
                recvTransportRef.current = null;
                deviceRef.current = null;
                consumedProducerIdsRef.current.clear();
                await initializeMediasoup(roomId, userId);
              } catch (err) {
                console.error("[room.js] recv transport recovery failed", err);
              } finally {
                recoveryInProgressRef.current = false;
              }
            }
          }, 3500);
        } else if (
          state === "failed" &&
          !recoveryInProgressRef.current &&
          !recoveryTimerRef.current
        ) {
          // Failed is definitive — rebuild after short grace period
          recoveryTimerRef.current = setTimeout(async () => {
            recoveryTimerRef.current = null;
            if (recoveryInProgressRef.current || unmountingRef.current) return;
            if (!socketRef.current?.connected) return;
            recoveryInProgressRef.current = true;
            console.warn(
              "[room.js] recv transport failed; rebuilding mediasoup transports",
            );
            try {
              try {
                audioProducerRef.current?.close();
              } catch {}
              try {
                videoProducerRef.current?.close();
              } catch {}
              try {
                sendTransportRef.current?.close();
              } catch {}
              try {
                recvTransportRef.current?.close();
              } catch {}
              audioProducerRef.current = null;
              videoProducerRef.current = null;
              sendTransportRef.current = null;
              recvTransportRef.current = null;
              deviceRef.current = null;
              consumedProducerIdsRef.current.clear();
              await initializeMediasoup(roomId, userId);
            } catch (err) {
              console.error("[room.js] recv transport recovery failed", err);
            } finally {
              recoveryInProgressRef.current = false;
            }
          }, 1000);
        }
      });
      socket.mediasoupRecvTransport = recvTransport; // Persist on socket for fetchAndConsumeProducers (survives remounts)

      // 5) Produce local tracks
      const local = userStream.current;
      if (local) {
        let audioTrack = local.getAudioTracks()[0];
        let videoTrack = local.getVideoTracks()[0];

        // When a transport is closed during recovery, mediasoup-client stops the producer tracks.
        // Re-acquire any ended tracks so the produce() calls succeed.
        if (audioTrack?.readyState === "ended") {
          try {
            const s = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });
            const fresh = s.getAudioTracks()[0];
            local.removeTrack(audioTrack);
            local.addTrack(fresh);
            audioTrack = fresh;
            console.log("[room.js] re-acquired ended audio track");
          } catch (e) {
            console.warn("[room.js] could not re-acquire audio track", e);
            audioTrack = null;
          }
        }
        if (videoTrack?.readyState === "ended" && !isAudioOnlyCall) {
          try {
            const effectiveType = navigator?.connection?.effectiveType || "";
            const lowBandwidthNet =
              effectiveType === "slow-2g" ||
              effectiveType === "2g" ||
              effectiveType === "3g";
            const s = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: lowBandwidthNet
                ? {
                    width: { ideal: 480, max: 640 },
                    height: { ideal: 270, max: 360 },
                    frameRate: { ideal: 10, max: 12 },
                  }
                : {
                    width: { ideal: 960, max: 1280 },
                    height: { ideal: 540, max: 720 },
                    frameRate: { ideal: 15, max: 20 },
                  },
            });
            const fresh = s.getVideoTracks()[0];
            local.removeTrack(videoTrack);
            local.addTrack(fresh);
            videoTrack = fresh;
            // Also update the local preview element
            if (userVideoRef.current) userVideoRef.current.srcObject = local;
            refreshLocalPreviewOrientation();
            console.log("[room.js] re-acquired ended video track");
          } catch (e) {
            console.warn("[room.js] could not re-acquire video track", e);
            videoTrack = null;
          }
        }

        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
        const isSafariBrowser =
          /Safari/i.test(ua) && !/Chrome|Chromium|Edg|CriOS|FxiOS/i.test(ua);
        const isMobileBrowser = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
        console.log("[room.js] local tracks before produce", {
          hasAudio: !!audioTrack,
          hasVideo: !!videoTrack,
          isSafariBrowser,
          isMobileBrowser,
        });
        const audioCodec = (device.rtpCapabilities?.codecs || []).find(
          (codec) =>
            String(codec?.mimeType || "").toLowerCase() === "audio/opus",
        );
        const videoCodec = getPreferredVideoCodec(
          device.rtpCapabilities?.codecs || [],
        );
        if (audioTrack) {
          audioProducerRef.current = await sendTransport.produce({
            track: audioTrack,
            codec: audioCodec,
          });
          console.log("[room.js] audio producer created", {
            id: audioProducerRef.current.id,
          });
        }
        // For pure audio calls, do not create a video producer so that
        // no video track is broadcast to other participants.
        if (videoTrack && !isAudioOnlyCall) {
          console.log("[room.js] selected video codec", {
            mimeType: String(videoCodec?.mimeType || "auto"),
          });
          // Keep video on a conservative single layer to improve stability
          // on lossy links and avoid simulcast layer churn freezes.
          const videoEncodings = [
            {
              maxBitrate: isMobileBrowser
                ? 220_000
                : isSafariBrowser
                  ? 350_000
                  : 450_000,
              maxFramerate: isMobileBrowser ? 12 : 15,
              scalabilityMode: "L1T1",
            },
          ];

          const {
            reportedWidth,
            reportedHeight,
            reportedRotation,
          } = computeVideoProducerOrientation(videoTrack, isMobileBrowser);
          videoProducerRef.current = await sendTransport.produce({
            track: videoTrack,
            encodings: videoEncodings,
            codec: videoCodec,
            appData: {
              width: reportedWidth,
              height: reportedHeight,
              rotation: reportedRotation,
              source: "web",
              platform: "web",
            },
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
            if (String(p.userId) === String(userId)) {
              console.log(
                "[room.js] existing producers: skipping own producer",
                p.producerId,
              );
              continue;
            }
            if (consumedProducerIdsRef.current.has(p.producerId)) {
              console.log(
                "[room.js] existing producers: skipping duplicate producer",
                p.producerId,
              );
              continue;
            }
            consumedProducerIdsRef.current.add(p.producerId);
            const consumeInfo = await callService.consume(socket, {
              roomId,
              userId,
              producerId: p.producerId,
              rtpCapabilities:
                consumeRtpCapabilitiesRef.current || device.rtpCapabilities,
            });
            console.log(
              "[room.js] consume existing producer response",
              consumeInfo,
            );

            const consumer = await recvTransport.consume({
              id: consumeInfo.id,
              producerId: consumeInfo.producerId,
              kind: consumeInfo.kind,
              rtpParameters: consumeInfo.rtpParameters,
              paused: consumeInfo.paused ?? true,
            });
            console.log("[room.js] consumer track state (existing)", {
              kind: consumer.kind,
              paused: consumer.paused,
              trackMuted: consumer.track.muted,
              trackReadyState: consumer.track.readyState,
            });

            // Merge audio/video tracks per remote user
            const kind = consumeInfo.kind || p.kind;
            let existingStream = remoteStreamsRef.current[p.userId];
            if (!existingStream) {
              existingStream = new MediaStream();
            } else {
              if (kind === "video") {
                existingStream
                  .getVideoTracks()
                  .forEach((t) => existingStream.removeTrack(t));
              } else if (kind === "audio") {
                existingStream
                  .getAudioTracks()
                  .forEach((t) => existingStream.removeTrack(t));
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
              })),
            );
            if (kind === "video") {
              setRemoteVideoMeta(p.userId, {
                rotation: p.rotation,
                width: p.width,
                height: p.height,
              });
            }
            console.log("[room.js] remotePeers after consuming existing", {
              keys: Object.keys(remoteStreamsRef.current),
            });

            // Resume consumer now that the track is set up in the stream.
            // Server creates consumers paused=true; we must explicitly resume.
            socket.emit("MS-resume-consumer", {
              roomId,
              userId,
              consumerId: consumer.id,
            });

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
      socket.on(
        "MS-new-producer",
        async ({
          producerId,
          userId: remoteUserId,
          kind,
          width,
          height,
          rotation,
        }) => {
          try {
            console.log("[room.js] MS-new-producer received", {
              producerId,
              remoteUserId,
              kind,
              width,
              height,
              rotation,
            });
            if (String(remoteUserId) === String(userId)) {
              console.log(
                "[room.js] MS-new-producer: skipping own producer",
                producerId,
              );
              return;
            }
            if (kind === "video") {
              setRemoteVideoMeta(remoteUserId, { rotation, width, height });
            }
            if (consumedProducerIdsRef.current.has(producerId)) {
              console.log(
                "[room.js] MS-new-producer: skipping duplicate producer",
                producerId,
              );
              return;
            }
            consumedProducerIdsRef.current.add(producerId);
            // Request consumer for this producer
            const consumeInfo = await callService.consume(socket, {
              roomId,
              userId,
              producerId,
              rtpCapabilities:
                consumeRtpCapabilitiesRef.current || device.rtpCapabilities,
            });

            const consumer = await recvTransport.consume({
              id: consumeInfo.id,
              producerId: consumeInfo.producerId,
              kind: consumeInfo.kind,
              rtpParameters: consumeInfo.rtpParameters,
              paused: consumeInfo.paused ?? true,
            });
            console.log("[room.js] consumer track state (new-producer)", {
              kind: consumer.kind,
              paused: consumer.paused,
              trackMuted: consumer.track.muted,
              trackReadyState: consumer.track.readyState,
            });

            const trackKind = consumeInfo.kind || kind;
            let existingStream = remoteStreamsRef.current[remoteUserId];
            if (!existingStream) {
              existingStream = new MediaStream();
            } else {
              if (trackKind === "video") {
                existingStream
                  .getVideoTracks()
                  .forEach((t) => existingStream.removeTrack(t));
              } else if (trackKind === "audio") {
                existingStream
                  .getAudioTracks()
                  .forEach((t) => existingStream.removeTrack(t));
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
              })),
            );
            console.log("[room.js] remotePeers after MS-new-producer", {
              keys: Object.keys(remoteStreamsRef.current),
            });

            // Resume consumer now that the track is set up in the stream.
            socket.emit("MS-resume-consumer", {
              roomId,
              userId,
              consumerId: consumer.id,
            });

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
        },
      );

      // 8) Consume any remote peers that joined before we were ready (fixes timing race)
      for (const [peerId, s] of Object.entries(remoteStreamsRef.current)) {
        if (s.getTracks().length === 0) {
          console.log(
            "[room.js] mediasoup ready: consuming pending peer",
            peerId,
          );
          fetchAndConsumeProducersForNewPeer(roomId, userId, peerId);
        }
      }
    } catch (err) {
      console.error("initializeMediasoup failed:", err);
      toast.error(
        "Failed to initialize high-quality media. Falling back to basic call.",
      );
    }
  };

  useEffect(() => {
    unmountingRef.current = false;
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
      setRemoteProducerAppData({});
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
      unmountingRef.current = true;
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }

      // Clean up duration timer on unmount
      stopDurationTimer();

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
      socketRef.current.off("FE-screen-recording-started");
      socketRef.current.off("FE-screen-recording-stopped");
      socketRef.current.off("FE-screen-recording-error");
      socketRef.current.off("FE-recording-started");
      socketRef.current.off("FE-recording-stopped");
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
      } catch {}
      try {
        videoProducerRef.current && videoProducerRef.current.close();
      } catch {}
      try {
        sendTransportRef.current && sendTransportRef.current.close();
      } catch {}
      try {
        recvTransportRef.current && recvTransportRef.current.close();
      } catch {}
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
          userVideoRef.current.play().catch(() => {});
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
          if (err.name !== "AbortError") {
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
        userVideoRef.current.play().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [screenShare, screenShareLoading]);

  const participantOrder = useMemo(
    () => ["localUser", ...remotePeers.map((p) => String(p.userId))],
    [remotePeers],
  );

  const anyoneScreenSharing = useMemo(
    () =>
      screenShare ||
      !!currentScreenSharer ||
      remotePeers.some((p) => userVideoAudio[p.userId]?.isScreenShare),
    [screenShare, currentScreenSharer, remotePeers, userVideoAudio],
  );

  const useStageLayout = useMemo(
    () =>
      !isFloating &&
      !anyoneScreenSharing &&
      participantOrder.length > MAIN_STAGE_MAX,
    [isFloating, anyoneScreenSharing, participantOrder.length],
  );

  const { stageIds, filmstripIds } = useMemo(() => {
    if (!useStageLayout) {
      return { stageIds: participantOrder, filmstripIds: [] };
    }
    if (!focusPairIds || focusPairIds.length !== 2) {
      if (participantOrder.length > MAIN_STAGE_MAX) {
        const stageIds = participantOrder.slice(0, MAIN_STAGE_MAX);
        const filmstripIds = participantOrder.slice(MAIN_STAGE_MAX);
        return { stageIds, filmstripIds };
      }
      return { stageIds: participantOrder, filmstripIds: [] };
    }
    const fset = new Set(focusPairIds);
    const filmstripIds = participantOrder.filter((id) => !fset.has(id));
    const d = dominantSpeakerId;
    let stageIds = [...focusPairIds];
    if (d != null && fset.has(d)) {
      const other = focusPairIds.find((x) => String(x) !== String(d));
      if (other != null) {
        stageIds = [d, other];
      }
    }
    return { stageIds, filmstripIds };
  }, [
    useStageLayout,
    focusPairIds,
    participantOrder,
    dominantSpeakerId,
  ]);

  useEffect(() => {
    if (!useStageLayout) {
      setFocusPairIds(null);
      return;
    }
    setFocusPairIds((prev) => {
      const order = participantOrder;
      if (order.length < 2) {
        return null;
      }
      if (prev && prev.length === 2) {
        const still = prev.filter((id) => order.includes(id));
        if (still.length === 2) {
          return prev;
        }
        if (still.length === 1) {
          const keep = still[0];
          const fill = order.find((id) => id !== keep);
          return fill ? [keep, fill] : [order[0], order[1]];
        }
      }
      return [order[0], order[1]];
    });
  }, [useStageLayout, participantOrder]);

  useEffect(() => {
    if (!useStageLayout || !focusPairIds || focusPairIds.length !== 2) {
      return;
    }
    const d = dominantSpeakerId;
    if (d == null) {
      return;
    }
    if (focusPairIds.some((id) => String(id) === String(d))) {
      return;
    }
    const [a, b] = focusPairIds;
    const emaA = speakerLevelEmaRef.current[a] ?? 0;
    const emaB = speakerLevelEmaRef.current[b] ?? 0;
    const keep = emaA >= emaB ? a : b;
    setFocusPairIds([d, keep]);
  }, [dominantSpeakerId, useStageLayout, focusPairIds]);

  /** Active speaker from mic levels — all call sizes (not only 5+ / stage layout). */
  const shouldDetectActiveSpeaker = useMemo(
    () => !isFloating && participantOrder.length > 1,
    [isFloating, participantOrder.length],
  );

  useEffect(() => {
    if (!shouldDetectActiveSpeaker) {
      speakerLevelEmaRef.current = {};
      dominantStickyRef.current = {
        committedId: null,
        pendingId: null,
        pendingSince: 0,
      };
      setDominantSpeakerId(null);
      return undefined;
    }

    const allowed = new Set(participantOrder);
    for (const k of Object.keys(speakerLevelEmaRef.current)) {
      if (!allowed.has(k)) {
        delete speakerLevelEmaRef.current[k];
      }
    }

    /** Slightly higher alpha = RMS reacts faster; still smoothed vs raw samples. */
    const EMA_ALPHA = 0.4;
    /** How long a new loudest participant must win before we commit (avoids dot/tile flicker). */
    const MIN_SWITCH_MS = 340;
    /** How long silence must hold before clearing the active speaker. */
    const CLEAR_SILENCE_MS = 480;
    const TICK_MS = 120;

    const id = window.setInterval(() => {
      const st0 = dominantStickyRef.current;
      if (
        st0.committedId != null &&
        !participantOrder.includes(st0.committedId)
      ) {
        st0.committedId = null;
        st0.pendingId = null;
        setDominantSpeakerId(null);
      }

      for (const pid of participantOrder) {
        const inst = peerAudioRmsRef.current[pid] ?? 0;
        const prev = speakerLevelEmaRef.current[pid] ?? 0;
        speakerLevelEmaRef.current[pid] = prev * (1 - EMA_ALPHA) + inst * EMA_ALPHA;
      }

      let bestId = null;
      let bestSm = 0;
      for (const pid of participantOrder) {
        const sm = speakerLevelEmaRef.current[pid] ?? 0;
        if (sm > bestSm) {
          bestSm = sm;
          bestId = pid;
        }
      }
      const rawPick = bestSm >= SPEAKING_RMS_THRESHOLD ? bestId : null;

      const st = dominantStickyRef.current;
      const now = Date.now();

      if (rawPick !== null && st.pendingId === "__clear__") {
        st.pendingId = null;
      }

      if (rawPick === st.committedId) {
        st.pendingId = null;
        return;
      }

      if (rawPick === null) {
        if (st.committedId == null) {
          st.pendingId = null;
          return;
        }
        if (st.pendingId !== "__clear__") {
          st.pendingId = "__clear__";
          st.pendingSince = now;
          return;
        }
        if (now - st.pendingSince >= CLEAR_SILENCE_MS) {
          st.committedId = null;
          st.pendingId = null;
          setDominantSpeakerId(null);
        }
        return;
      }

      if (st.committedId == null) {
        if (st.pendingId !== rawPick) {
          st.pendingId = rawPick;
          st.pendingSince = now;
          return;
        }
        if (now - st.pendingSince >= MIN_SWITCH_MS * 0.38) {
          st.committedId = rawPick;
          st.pendingId = null;
          setDominantSpeakerId(rawPick);
        }
        return;
      }

      if (st.pendingId !== rawPick) {
        st.pendingId = rawPick;
        st.pendingSince = now;
        return;
      }
      if (now - st.pendingSince >= MIN_SWITCH_MS) {
        st.committedId = rawPick;
        st.pendingId = null;
        setDominantSpeakerId(rawPick);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [shouldDetectActiveSpeaker, participantOrder]);

  useEffect(() => {
    if (!shouldDetectActiveSpeaker) {
      setLiveSpeakingKey("");
      return undefined;
    }

    let rafId = 0;
    let lastSig = "";
    const tick = () => {
      const rmsMap = peerAudioRmsRef.current;
      const active = [];
      for (const pid of participantOrder) {
        if ((rmsMap[pid] ?? 0) >= SPEAKING_RMS_THRESHOLD) {
          active.push(String(pid));
        }
      }
      active.sort();
      const sig = active.join(",");
      if (sig !== lastSig) {
        lastSig = sig;
        setLiveSpeakingKey(sig);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [shouldDetectActiveSpeaker, participantOrder]);

  function writeUserName(userName) {
    if (userVideoAudio[userName] && !userVideoAudio[userName].video) {
      return <UserName key={userName}>{userName}</UserName>;
    }
  }

  // Helper to map signaling userId (socket.id) to our stored user entry
  function findPeer(socketId) {
    if (!socketId) return null;
    const entry = Object.entries(userVideoAudio).find(
      ([, info]) => info && info.socketId === socketId,
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
    socketRef.current.emit(leaveEvent || "BE-leave-room", {
      roomId: activeCallId,
      leaver: currentUser,
    });
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
      window.userStream.getTracks().forEach((track) => track.stop());
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

    socketRef.current.emit("BE-toggle-camera-audio", {
      roomId,
      switchTarget: target,
    });
  };

  const clickScreenSharing = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      toast.info("Screen sharing is not supported by your browser.");
      return;
    }

    if (!screenShare) {
      // Check if someone else is already sharing
      if (currentScreenSharer) {
        toast.warning(
          `Screen is already sharing. Please wait for them to stop.`,
        );
        return;
      }

      setScreenShareLoading(true); // Start loading
      navigator.mediaDevices
        .getDisplayMedia({
          cursor: true,
          video: {
            displaySurface: "monitor", // Prefer full monitor to avoid window recursion
          },
        })
        .then(async (stream) => {
          const screenTrack = stream.getTracks()[0];

          const originalVideoTrack = userStream.current?.getVideoTracks()[0];

          // Update local preview
          if (userVideoRef.current) {
            userVideoRef.current.srcObject = stream;
            userVideoRef.current.play().catch(() => {});
          }

          // Replace track in mediasoup video producer (SFU path)
          if (useMediasoup && videoProducerRef.current && screenTrack) {
            try {
              wasVideoProducerPausedBeforeShareRef.current =
                !!videoProducerRef.current.paused;
              await videoProducerRef.current.replaceTrack({
                track: screenTrack,
              });
              // If user had video paused, sharing should still be visible remotely.
              if (videoProducerRef.current.paused) {
                await videoProducerRef.current.resume();
              }
              console.log("[room.js] screen share track replaced on producer");
            } catch (err) {
              console.error(
                "Failed to replace track on video producer for screen share:",
                err,
              );
            }
          }

          screenTrack.onended = () => {
            // Stop all tracks in the screen share stream to remove browser UI
            stream.getTracks().forEach((track) => track.stop());

            const originalVideoTrack = userStream.current?.getVideoTracks()[0];

            // Restore local preview
            if (userVideoRef.current && userStream.current) {
              userVideoRef.current.srcObject = userStream.current;
              // Force video element to re-render properly
              userVideoRef.current.play().catch(() => {});
            }

            // Restore original track on mediasoup producer
            if (
              useMediasoup &&
              videoProducerRef.current &&
              originalVideoTrack
            ) {
              videoProducerRef.current
                .replaceTrack({ track: originalVideoTrack })
                .then(async () => {
                  // Restore previous paused state after screen sharing ends.
                  if (
                    wasVideoProducerPausedBeforeShareRef.current &&
                    !videoProducerRef.current.paused
                  ) {
                    await videoProducerRef.current.pause();
                  }
                  wasVideoProducerPausedBeforeShareRef.current = false;
                  console.log(
                    "[room.js] original video track restored after screen share",
                  );
                })
                .catch((err) => {
                  console.warn(
                    "Failed to restore original track on video producer:",
                    err,
                  );
                });
            }
            setScreenShare(false);
            setScreenShareLoading(false);
            setCurrentScreenSharer(null); // Clear current sharer
            socketRef.current.emit("BE-toggle-screen-share", {
              roomId,
              isScreenShare: false,
            });
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
            setCurrentScreenSharer({
              userId: socketRef.current.id,
              userName: "You",
            });
            socketRef.current.emit("BE-toggle-screen-share", {
              roomId,
              isScreenShare: true,
            });
          }, 500);
        })
        .catch((err) => {
          console.error("Screen sharing failed:", err);
          setScreenShareLoading(false); // Stop loading on error
          if (err.name === "NotAllowedError") {
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
    const elem = e.target.closest("div") || e.target;
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

    const effectiveType = navigator?.connection?.effectiveType || "";
    const lowBandwidthNet =
      effectiveType === "slow-2g" ||
      effectiveType === "2g" ||
      effectiveType === "3g";

    navigator.mediaDevices
      .getUserMedia({
        video: lowBandwidthNet
          ? {
              deviceId,
              width: { ideal: 480, max: 640 },
              height: { ideal: 270, max: 360 },
              frameRate: { ideal: 10, max: 12 },
            }
          : {
              deviceId,
              width: { ideal: 960, max: 1280 },
              height: { ideal: 540, max: 720 },
              frameRate: { ideal: 15, max: 20 },
            },
        audio: enabledAudio,
      })
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
        refreshLocalPreviewOrientation();

        // Update mediasoup video producer track if available
        if (videoProducerRef.current && useMediasoup) {
          try {
            await videoProducerRef.current.replaceTrack({ track: newTrack });
          } catch (e) {
            console.error(
              "Failed to replace track on mediasoup video producer:",
              e,
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
        y: e.clientY - rect.top,
      });
      setDragging(true);
      e.stopPropagation();
    }
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    setPosition({
      x: e.clientX - offset.x,
      y: e.clientY - offset.y,
    });
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  // =============================================
  // Screen Recording (SuperAdmin / admin only)
  // =============================================
  const userType = globalUser?.data?.user?.userType;
  const canScreenRecord = userType === "SuperAdmin" || userType === "admin";

  function formatDuration(totalSec) {
    const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function startDurationTimer() {
    stopDurationTimer();
    const tick = () => {
      if (!screenRecordingStartTimeRef.current) return;
      const elapsed = Math.floor(
        (Date.now() - screenRecordingStartTimeRef.current) / 1000,
      );
      // Update all duration display elements directly — zero re-renders
      document.querySelectorAll("[data-screc-duration]").forEach((el) => {
        el.textContent = formatDuration(elapsed);
      });
    };
    tick();
    screenRecTimerRef.current = setInterval(tick, 1000);
  }

  function stopDurationTimer() {
    if (screenRecTimerRef.current) {
      clearInterval(screenRecTimerRef.current);
      screenRecTimerRef.current = null;
    }
    document.querySelectorAll("[data-screc-duration]").forEach((el) => {
      el.textContent = "00:00";
    });
  }

  function requestStartScreenRecording() {
    if (!canScreenRecord) return;
    if (screenRecordingBusy || isScreenRecording) return;
    if (!socketRef?.current) {
      toast.error("Socket is not ready.");
      return;
    }

    setScreenRecordingBusy(true);
    console.log("[room.js][SCREC] requesting server-side start", {
      roomId,
      currentUser,
    });
    socketRef.current.emit("BE-start-screen-recording", {
      roomId,
      userId: currentUser,
    });
    // UI update happens when FE-screen-recording-started is received
    setTimeout(() => setScreenRecordingBusy(false), 3000); // fallback in case event doesn't arrive
  }

  function requestStopScreenRecording() {
    if (!canScreenRecord) return;
    if (screenRecordingBusy) return;
    if (!socketRef?.current) {
      toast.error("Socket is not ready.");
      return;
    }

    console.log("[room.js][SCREC] requesting server-side stop", {
      roomId,
      currentUser,
    });
    socketRef.current.emit("BE-stop-screen-recording", {
      roomId,
      userId: currentUser,
    });
    // UI update happens when FE-screen-recording-stopped is received
  }

  // Chat implementation: Toggle sidebar
  const clickChat = () => {
    setShowChat(!showChat);
    // Also ensure we are not floating if we open chat
    if (isFloating) setIsFloating(false);
  };

  const renderGallerySlot = (slotId, filmstripMode) => {
    const fs = filmstripMode;
    // Meet-style filmstrip: fixed 16:9 tiles, scroll horizontally
    const boxStyle = fs
      ? {
          width: 160,
          minWidth: 160,
          height: 90,
          flexShrink: 0,
          boxSizing: "border-box",
        }
      : undefined;
    const isLiveNow = shouldDetectActiveSpeaker
      ? liveSpeakingSet.has(String(slotId))
      : String(slotId) === "localUser" && isSpeaking;
    const localSpeaking =
      isLiveNow && userVideoAudio["localUser"].audio;

    if (slotId === "localUser") {
      const localShowInitial =
        !screenShare &&
        !screenShareLoading &&
        (isAudioOnlyCall ||
          !userVideoAudio["localUser"].video ||
          !hasRealVideo);

      return (
        <VideoBox
          key={`${fs ? "fs" : "st"}-local`}
          style={boxStyle}
          $isActiveSpeaker={localSpeaking}
          $isFilmstrip={fs}
        >
          <LocalNameLabel
            style={
              fs
                ? {
                    fontSize: 11,
                    padding: "2px 6px",
                    top: 4,
                    bottom: "auto",
                    left: 4,
                    maxWidth: "92%",
                  }
                : undefined
            }
          >
            You
          </LocalNameLabel>
          {!fs && !screenShare && (
            <FaIcon className="fas fa-expand" onClick={expandScreen} />
          )}
          <MyVideo
            ref={userVideoRef}
            muted
            autoPlay
            playsInline
            controls={false}
            style={{
              transform: (() => {
                if (screenShare || !hasRealVideo) return "scaleX(1)";
                const rot = localPreviewRotationDeg;
                if (rot) return `rotate(${rot}deg) scaleX(-1)`;
                return "scaleX(-1)";
              })(),
              cursor: screenShare ? "default" : "pointer",
              opacity: screenShareLoading
                ? 0.5
                : localShowInitial
                  ? 0
                  : 1,
            }}
            onClick={!screenShare ? expandScreen : undefined}
          />
          {localShowInitial && (
            <ParticipantInitialAvatar
              compact={fs}
              name={
                currentUserFullName ||
                globalUser?.data?.user?.name ||
                currentUser ||
                "You"
              }
            />
          )}
          {screenShareLoading && (
            <LoadingOverlay>
              <LoadingSpinner />
              <LoadingText>Starting Screen Share...</LoadingText>
            </LoadingOverlay>
          )}
          {!userVideoAudio["localUser"].audio && (
            <MuteIconContainer>🔇</MuteIconContainer>
          )}
          {localSpeaking && (
            <SpeakingBadge $compact={fs}>Speaking</SpeakingBadge>
          )}
        </VideoBox>
      );
    }

    const remote = remotePeers.find((p) => String(p.userId) === String(slotId));
    if (!remote) return null;
    const info = userVideoAudio[remote.userId] || {};
    const displayName =
      info.senderName || info.name || info.fullName || remote.userId;
    const isMuted = info.audio === false;
    const isScreenSharing = info.isScreenShare;
    const showRemoteSpeaking =
      liveSpeakingSet.has(String(remote.userId)) && !isMuted;

    return (
      <VideoBox
        key={`${fs ? "fs" : "st"}-remote-${remote.userId}`}
        onClick={!isScreenSharing ? expandScreen : undefined}
        $isScreenShare={isScreenSharing}
        $isActiveSpeaker={showRemoteSpeaking}
        $isFilmstrip={fs}
        style={{
          cursor: isScreenSharing ? "default" : "pointer",
          ...boxStyle,
        }}
      >
        {writeUserName(displayName)}
        {!fs && !isScreenSharing && (
          <FaIcon className="fas fa-expand" />
        )}
        <VideoCard
          stream={remote.stream}
          username={remote.userId}
          number={remotePeers.length}
          fullName={displayName}
          isMuted={isMuted}
          isScreenShare={isScreenSharing}
          callType={callType}
          onFreeze={handleRemoteVideoFreeze}
          compact={fs}
          rotationDeg={producerAppDataRotationToCssDeg(
            remoteProducerAppData[remote.userId]?.rotation,
          )}
        />
        {showRemoteSpeaking && (
          <SpeakingBadge $compact={fs}>Speaking</SpeakingBadge>
        )}
      </VideoBox>
    );
  };

  return (
    <>
      {showModal && (
        <div
          className={isFloating ? "minimize" : "maximize"}
          onMouseDown={handleMouseDown}
          ref={boxRef}
          style={{
            left: isFloating ? position.x : "0px",
            top: isFloating ? position.y : "0px",
            right: "auto",
            bottom: "auto",
          }}
        >
          <ModalContent
            onClick={(e) => e.stopPropagation()}
            $isFloating={isFloating}
          >
            <ReconnectModal visible={showReconnectModal} goToBack={goToBack} />
            <div className="modal-header" style={{ flexShrink: 0 }}>
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
              </h5>
              {waitingCalls.length > 0 && (
                <PulsingAlert>
                  <span>
                    <i
                      className="fas fa-phone-volume"
                      style={{ marginRight: "8px" }}
                    ></i>
                    Waiting:{" "}
                    {waitingCalls
                      .map((c) => (c.isDirect ? c.callerName : c.groupName))
                      .join(", ")}
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
              {/* Screen Recording button - SuperAdmin / admin role only (hidden during call recording) */}
              {canScreenRecord && !isCallRecording ? (
                <button
                  type="button"
                  onClick={() => {
                    if (isScreenRecording) {
                      requestStopScreenRecording();
                    } else {
                      requestStartScreenRecording();
                    }
                  }}
                  disabled={screenRecordingBusy}
                  style={{
                    backgroundColor: isScreenRecording ? "#7c3aed" : "white",
                    width: "auto",
                    height: "25px",
                    borderRadius: "5px",
                    color: isScreenRecording ? "white" : "black",
                    marginRight: "8px",
                    lineHeight: "0px",
                    padding: "0 10px",
                    fontSize: 12,
                    border: isScreenRecording ? "none" : "1px solid #e5e7eb",
                    cursor: screenRecordingBusy ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                  title="Screen Record (admin only)"
                >
                  {isScreenRecording ? (
                    <>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: "#ef4444",
                          animation: "blink 1s infinite",
                        }}
                      />
                      {screenRecordingBusy ? "Saving..." : "Stop"}
                    </>
                  ) : screenRecordingBusy ? (
                    "Saving..."
                  ) : (
                    "Screen Rec"
                  )}
                </button>
              ) : isScreenRecording ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginRight: "8px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#7c3aed",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: "#ef4444",
                      animation: "blink 1s infinite",
                    }}
                  />
                  REC
                </span>
              ) : null}
              {/* Call recording indicator (visible to all participants) */}
              {isCallRecording && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginRight: "8px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#ef4444",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: "#ef4444",
                      animation: "blink 1s infinite",
                    }}
                  />
                  REC
                </span>
              )}
            </div>
            <div
              style={{
                display: "flex",
                width: "100%",
                flex: 1,
                minHeight: 0,
                position: "relative",
                /* BottomBar is position:absolute; reserve its height so filmstrip/name labels are not covered */
                paddingBottom: 52,
                boxSizing: "border-box",
              }}
            >
              {useStageLayout ? (
                <MeetStageColumn>
                  <MeetStageMain>
                    <VideoContainer
                      $isFloating={isFloating}
                      $stageLayout
                      style={{
                        flex: 1,
                        minHeight: 0,
                        width: "100%",
                        display: "grid",
                        ...getEqualCallGridStyle(stageIds.length),
                      }}
                    >
                      {stageIds.map((slotId) => renderGallerySlot(slotId, false))}
                    </VideoContainer>
                  </MeetStageMain>
                  {filmstripIds.length > 0 ? (
                    <MeetFilmstripBar>
                      {filmstripIds.map((slotId) =>
                        renderGallerySlot(slotId, true),
                      )}
                    </MeetFilmstripBar>
                  ) : null}
                </MeetStageColumn>
              ) : (
                <VideoContainer
                  $isFloating={isFloating}
                  style={{
                    flex: 1,
                    minHeight: 0,
                    width: "100%",
                    display: "grid",
                    ...getEqualCallGridStyle(1 + remotePeers.length),
                  }}
                >
                  <VideoBox
                    $isActiveSpeaker={
                      shouldDetectActiveSpeaker
                        ? liveSpeakingSet.has("localUser")
                        : isSpeaking
                    }
                  >
                    <LocalNameLabel>You</LocalNameLabel>
                    {!screenShare && (
                      <FaIcon className="fas fa-expand" onClick={expandScreen} />
                    )}
                    <MyVideo
                      ref={userVideoRef}
                      muted
                      autoPlay
                      playsInline
                      controls={false}
                      style={{
                        transform: (() => {
                          if (screenShare || !hasRealVideo) return "scaleX(1)";
                          const rot = localPreviewRotationDeg;
                          if (rot)
                            return `rotate(${rot}deg) scaleX(-1)`;
                          return "scaleX(-1)";
                        })(),
                        cursor: screenShare ? "default" : "pointer",
                        opacity: (() => {
                          if (screenShareLoading) return 0.5;
                          const showInit =
                            !screenShare &&
                            !screenShareLoading &&
                            (isAudioOnlyCall ||
                              !userVideoAudio["localUser"].video ||
                              !hasRealVideo);
                          return showInit ? 0 : 1;
                        })(),
                      }}
                      onClick={!screenShare ? expandScreen : undefined}
                    />
                    {!screenShare &&
                      !screenShareLoading &&
                      (isAudioOnlyCall ||
                        !userVideoAudio["localUser"].video ||
                        !hasRealVideo) && (
                        <ParticipantInitialAvatar
                          compact={false}
                          name={
                            currentUserFullName ||
                            globalUser?.data?.user?.name ||
                            currentUser ||
                            "You"
                          }
                        />
                      )}
                    {screenShareLoading && (
                      <LoadingOverlay>
                        <LoadingSpinner />
                        <LoadingText>Starting Screen Share...</LoadingText>
                      </LoadingOverlay>
                    )}
                    {!userVideoAudio["localUser"].audio && (
                      <MuteIconContainer>🔇</MuteIconContainer>
                    )}
                    {(shouldDetectActiveSpeaker
                      ? liveSpeakingSet.has("localUser")
                      : isSpeaking) &&
                      userVideoAudio["localUser"].audio && (
                      <SpeakingBadge $compact={false}>Speaking</SpeakingBadge>
                    )}
                  </VideoBox>
                  {remotePeers.map((remote, index, arr) => {
                    const info = userVideoAudio[remote.userId] || {};
                    const displayName =
                      info.senderName ||
                      info.name ||
                      info.fullName ||
                      remote.userId;
                    const isMuted = info.audio === false;
                    const isScreenSharing = info.isScreenShare;
                    const isRemoteLive = liveSpeakingSet.has(
                      String(remote.userId),
                    );
                    const showRemoteSpeaking = isRemoteLive && !isMuted;

                    return (
                      <VideoBox
                        key={remote.userId}
                        onClick={!isScreenSharing ? expandScreen : undefined}
                        $isScreenShare={isScreenSharing}
                        $isActiveSpeaker={showRemoteSpeaking}
                        style={{
                          cursor: isScreenSharing ? "default" : "pointer",
                        }}
                      >
                        {writeUserName(displayName)}
                        {!isScreenSharing && (
                          <FaIcon className="fas fa-expand" />
                        )}
                        <VideoCard
                          stream={remote.stream}
                          username={remote.userId}
                          number={arr.length}
                          fullName={displayName}
                          isMuted={isMuted}
                          isScreenShare={isScreenSharing}
                          callType={callType}
                          onFreeze={handleRemoteVideoFreeze}
                          rotationDeg={producerAppDataRotationToCssDeg(
                            remoteProducerAppData[remote.userId]?.rotation,
                          )}
                        />
                        {showRemoteSpeaking && (
                          <SpeakingBadge $compact={false}>Speaking</SpeakingBadge>
                        )}
                      </VideoBox>
                    );
                  })}
                </VideoContainer>
              )}
              {showChat && (
                <ChatSidebarContainer show={showChat}>
                  <ChatSidebarHeader>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <i
                        className="fas fa-comments"
                        style={{ color: "var(--primary-color)" }}
                      />
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "1rem",
                          color: "#334155",
                        }}
                      >
                        In-call Messages
                      </span>
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
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
  animation: slideIn 0.3s ease-out;
  flex-shrink: 0;
  z-index: 100;

  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
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
  position: relative;
  background: #1a1a1a;
  padding: ${(props) => (props?.$isFloating ? "20px" : "10px")};
  border-radius: 12px;
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.5);
  width: 100%;
  min-height: 0;
  flex: 1;
  height: ${(props) => (props?.$isFloating ? "100%" : "100%")};
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;

  ${(props) =>
    !props?.$isFloating &&
    `
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
/** Meet-style: main grid sits on dark canvas above the filmstrip */
const MeetStageColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
`;

const MeetStageMain = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #131314;
  padding: 12px;
  box-sizing: border-box;
  overflow: hidden;
`;

const MeetFilmstripBar = styled.div`
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 10px;
  padding: 10px 16px 12px;
  overflow-x: auto;
  overflow-y: hidden;
  align-items: center;
  background: #202124;
  border-top: 1px solid #3c4043;
  min-height: 118px;
  max-height: 118px;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: #5f6368 #131314;

  &::-webkit-scrollbar {
    height: 6px;
  }
  &::-webkit-scrollbar-track {
    background: #131314;
  }
  &::-webkit-scrollbar-thumb {
    background: #5f6368;
    border-radius: 3px;
  }
`;

// grid-template-columns: ${props => props?.isFloating ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))'};
const VideoContainer = styled.div`
  gap: ${(props) =>
    props?.$stageLayout ? "10px" : props?.$isFloating ? "8px" : "8px"};
  height: ${(props) =>
    props?.$isFloating
      ? "calc(100% - 50px)"
      : props?.$stageLayout
        ? "auto"
        : "100%"};
  ${(props) =>
    props?.$stageLayout &&
    `
    flex: 1;
  `}
  box-sizing: border-box;
  overflow: hidden;
  padding: ${(props) => (props?.$stageLayout ? "0" : "0 5px")};
  min-height: 0;
  align-content: stretch;
  align-items: stretch;
  justify-items: stretch;
  transition: all 0.3s ease-in-out;
`;

const VideoBox = styled.div`
  background: #2c2c2c;
  border-radius: 8px;
  padding: ${(props) =>
    props?.$isFilmstrip ? "2px" : props?.$isFloating ? "8px" : "4px"};
  position: relative;
  width: 100%;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: stretch;
  overflow: hidden;

  ${(props) =>
    props?.$isActiveSpeaker &&
    (props?.$isFilmstrip
      ? `
    box-shadow:
      0 0 0 1.5px #5dff5a,
      0 0 12px rgba(93, 255, 90, 0.45),
      0 0 20px rgba(34, 197, 94, 0.2);
    z-index: 2;
  `
      : `
    box-shadow:
      0 0 0 2px #5dff5a,
      0 0 18px rgba(93, 255, 90, 0.55),
      0 0 36px rgba(34, 197, 94, 0.35);
    z-index: 2;
  `)}

  /* Main screen share takes full area */
  ${(props) =>
    props?.$isMainShare &&
    `
    width: 100%;
    height: 100%;
    background: #000;
    padding: 0;
  `}

  /* Make screen shares bigger by spanning 2 columns in grid */
  ${(props) =>
    props?.$isScreenShare &&
    !props?.$isFloating &&
    !props?.$isMainShare &&
    `
    grid-column: span 2;
    @media (max-width: 768px) {
      grid-column: span 1; /* Mobile: take full width */
    }
  `}
  
  ${(props) =>
    !props?.$isFloating &&
    !props?.$isMainShare &&
    `
    @media (max-width: 768px) {
      padding: 3px;
    }
    
    @media (max-width: 480px) {
      padding: 2px;
    }
  `}
`;

const MyVideo = styled.video`
  flex: 1;
  min-height: 0;
  width: 100%;
  border-radius: 10px;
  /* contain: full preview without cover-crop; aligns with how recordings are usually framed */
  object-fit: contain;
  background-color: #000;
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

/** Matches VideoCard NameLabel (bottom-left) for local “You” */
const LocalNameLabel = styled.div`
  position: absolute;
  bottom: 8px;
  left: 8px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
  z-index: 2;
  max-width: 80%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background-color: #15724c;
  padding: 8px 12px;
  border-radius: 5px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
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

/** Top-right label; matches neon border on VideoBox when $isActiveSpeaker. */
const SpeakingBadge = styled.span`
  position: absolute;
  top: ${(p) => (p.$compact ? "5px" : "10px")};
  right: ${(p) => (p.$compact ? "6px" : "10px")};
  z-index: 4;
  font-size: ${(p) => (p.$compact ? "9px" : "13px")};
  font-weight: 600;
  color: #5dff5a;
  letter-spacing: 0.03em;
  pointer-events: none;
  line-height: 1.2;
  text-shadow:
    0 0 8px rgba(93, 255, 90, 0.95),
    0 0 16px rgba(34, 197, 94, 0.65);
`;

// Google Meet-style Layout Components
const ScreenShareLayout = styled.div`
  display: flex;
  flex-direction: row;
  gap: 10px;
  width: 100%;
  height: calc(100vh - 200px);
  padding: ${(props) => (props?.$isFloating ? "5px" : "10px")};
  box-sizing: border-box;

  ${(props) =>
    props?.$isFloating &&
    `
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
