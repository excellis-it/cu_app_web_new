import React, { useEffect, useRef, useState, useCallback } from "react";
import styled from "styled-components";
import ParticipantInitialAvatar from "./ParticipantInitialAvatar";

// Mediasoup-only VideoCard: receives a MediaStream directly instead of a simple-peer instance.
const VideoCard = ({
  stream,
  username,
  fullName,
  isMuted,
  isScreenShare,
  onFreeze,
  /** Degrees from producerAppDataRotationToCssDeg; 0 for screen share */
  rotationDeg = 0,
  /** Smaller name pill for filmstrip / gallery strip */
  compact = false,
}) => {
  const videoRef = useRef();
  /** True when a video track is live & enabled (show picture); false for audio-only or cam off */
  const [videoTrackLive, setVideoTrackLive] = useState(false);

  useEffect(() => {
    if (!stream) {
      setVideoTrackLive(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return undefined;
    }

    const syncVideoTrackLive = () => {
      const v = stream.getVideoTracks()[0];
      setVideoTrackLive(!!(v && v.readyState === "live" && v.enabled));
    };

    syncVideoTrackLive();

    const onTrackListOrMute = () => {
      syncVideoTrackLive();
    };

    stream.addEventListener("addtrack", onTrackListOrMute);
    stream.addEventListener("removetrack", onTrackListOrMute);

    const vts = stream.getVideoTracks();
    vts.forEach((t) => {
      t.addEventListener("ended", onTrackListOrMute);
      t.addEventListener("mute", onTrackListOrMute);
      t.addEventListener("unmute", onTrackListOrMute);
    });

    const applyStream = () => {
      if (videoRef.current && stream) {
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }
        const playPromise = videoRef.current.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch((err) => {
            if (err?.name === "AbortError") return;
            console.warn("Video play failed:", err);
          });
        }
      }
    };
    applyStream();
    const t = setTimeout(applyStream, 100);

    return () => {
      clearTimeout(t);
      stream.removeEventListener("addtrack", onTrackListOrMute);
      stream.removeEventListener("removetrack", onTrackListOrMute);
      stream.getVideoTracks().forEach((track) => {
        track.removeEventListener("ended", onTrackListOrMute);
        track.removeEventListener("mute", onTrackListOrMute);
        track.removeEventListener("unmute", onTrackListOrMute);
      });
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream]);

  // Log when a remote video appears frozen so freezes can be correlated with transport/network logs.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return undefined;

    let lastFrames = -1;
    let lastTs = 0;
    let lastCurrentTime = 0;
    let stuckForMs = 0;
    let isFrozenEpisode = false;
    const FREEZE_THRESHOLD_MS = 5000;

    const onWaiting = () => {
      console.warn("[VideoCard] remote video waiting", {
        username,
        fullName,
        currentTime: el.currentTime,
      });
    };
    const onStalled = () => {
      console.warn("[VideoCard] remote video stalled", {
        username,
        fullName,
        currentTime: el.currentTime,
      });
    };
    const onPlaying = () => {
      if (isFrozenEpisode) {
        console.log("[VideoCard] remote video recovered", {
          username,
          fullName,
          currentTime: el.currentTime,
        });
      }
      isFrozenEpisode = false;
      stuckForMs = 0;
      console.log("[VideoCard] remote video resumed", {
        username,
        fullName,
        currentTime: el.currentTime,
      });
    };

    el.addEventListener("waiting", onWaiting);
    el.addEventListener("stalled", onStalled);
    el.addEventListener("playing", onPlaying);

    const timer = setInterval(() => {
      const vt = stream.getVideoTracks?.()?.[0];
      if (!vt || vt.readyState !== "live" || !vt.enabled) {
        return;
      }

      const q =
        typeof el.getVideoPlaybackQuality === "function"
          ? el.getVideoPlaybackQuality()
          : null;
      const totalFrames =
        q && typeof q.totalVideoFrames === "number" ? q.totalVideoFrames : -1;
      const now = performance.now();

      if (lastTs === 0) {
        lastTs = now;
        lastFrames = totalFrames;
        return;
      }

      const dt = now - lastTs;
      const frameDelta =
        totalFrames >= 0 && lastFrames >= 0 ? totalFrames - lastFrames : -1;
      const currentTimeDelta = Math.abs((el.currentTime || 0) - lastCurrentTime);
      const looksStuck =
        !document.hidden &&
        !el.paused &&
        !el.ended &&
        el.readyState >= 3 &&
        frameDelta === 0 &&
        currentTimeDelta < 0.01;

      if (looksStuck) {
        stuckForMs += dt;
        if (stuckForMs >= FREEZE_THRESHOLD_MS && !isFrozenEpisode) {
          isFrozenEpisode = true;
          console.warn("[VideoCard] remote video freeze detected", {
            username,
            fullName,
            currentTime: el.currentTime,
            readyState: el.readyState,
            networkState: el.networkState,
            totalVideoFrames: totalFrames,
            droppedVideoFrames:
              q && typeof q.droppedVideoFrames === "number"
                ? q.droppedVideoFrames
                : null,
            timestamp: new Date().toISOString(),
          });
          if (typeof onFreeze === "function") onFreeze(username);
        }
      } else {
        if (isFrozenEpisode) {
          console.log("[VideoCard] remote video freeze ended", {
            username,
            fullName,
            currentTime: el.currentTime,
            timestamp: new Date().toISOString(),
          });
        }
        isFrozenEpisode = false;
        stuckForMs = 0;
      }

      lastTs = now;
      lastFrames = totalFrames;
      lastCurrentTime = el.currentTime || 0;
    }, 500);

    return () => {
      clearInterval(timer);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("stalled", onStalled);
      el.removeEventListener("playing", onPlaying);
    };
  }, [stream, username, fullName, onFreeze]);

  const displayName = fullName || username;

  const setVideoRef = useCallback(
    (el) => {
      videoRef.current = el;
      if (el && stream) {
        el.srcObject = stream;
        el.play().catch((e) => {
          if (e?.name !== "AbortError") console.warn("Video play failed:", e);
        });
      }
    },
    [stream, rotationDeg]
  );

  const showLoader = !stream || (isScreenShare && !videoTrackLive);
  const showInitial =
    !!stream && !videoTrackLive && !isScreenShare;

  return (
    <VideoContainer>
      <VideoElement
        ref={setVideoRef}
        $rotationDeg={isScreenShare ? 0 : rotationDeg}
        autoPlay
        playsInline
        controls={false}
        style={{ opacity: videoTrackLive ? 1 : 0 }}
      />
      {showLoader && (
        <Loader
          $compact={compact}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <LoaderSpinner $compact={compact}>⟳</LoaderSpinner>
          {isScreenShare ? "Loading screen share..." : "Connecting..."}
        </Loader>
      )}

      {showInitial && (
        <ParticipantInitialAvatar name={displayName} compact={compact} />
      )}

      <NameLabel $compact={compact}>{displayName}</NameLabel>
      {isMuted && <MuteIconContainer>🔇</MuteIconContainer>}
    </VideoContainer>
  );
};

// Styled Components
const VideoContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  background-color: #222;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
`;

const VideoElement = styled.video`
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
  background-color: #000;
  transform: ${(p) =>
    p.$rotationDeg ? `rotate(${p.$rotationDeg}deg)` : "none"};

  &::-webkit-media-controls {
    display: none !important;
  }
  &::-webkit-media-controls-enclosure {
    display: none !important;
  }
  &::-webkit-media-controls-panel {
    display: none !important;
  }
`;

const NameLabel = styled.div`
  position: absolute;
  top: ${(p) => (p.$compact ? "4px" : "auto")};
  bottom: ${(p) => (p.$compact ? "auto" : "8px")};
  left: ${(p) => (p.$compact ? "4px" : "8px")};
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: ${(p) => (p.$compact ? "2px 6px" : "4px 8px")};
  border-radius: 4px;
  font-size: ${(p) => (p.$compact ? "11px" : "14px")};
  z-index: 2;
  max-width: ${(p) => (p.$compact ? "90%" : "80%")};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const Loader = styled.div`
  color: white;
  font-size: ${(p) => (p.$compact ? "12px" : "16px")};
  font-weight: 500;
  text-align: center;
  padding: ${(p) => (p.$compact ? "8px" : "16px")};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  animation: pulse 1.5s infinite;
  z-index: 1;

  @keyframes pulse {
    0% {
      opacity: 0.3;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.3;
    }
  }
`;

const LoaderSpinner = styled.div`
  font-size: ${(p) => (p.$compact ? "22px" : "32px")};
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
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

export default VideoCard;
