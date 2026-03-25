import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';

// Mediasoup-only VideoCard: receives a MediaStream directly instead of a simple-peer instance.
const VideoCard = ({ stream, username, fullName, isMuted, isScreenShare }) => {
  const videoRef = useRef();
  const [showVideo, setShowVideo] = useState(false);

  // Update showVideo when stream or its tracks change
  const updateShowVideo = useCallback((s) => {
    if (!s) return false;
    const hasVideo = s.getVideoTracks().length > 0;
    const hasAudio = s.getAudioTracks().length > 0;
    return hasVideo || hasAudio;
  }, []);

  useEffect(() => {
    if (!stream) {
      setShowVideo(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return;
    }

    const hasTracks = updateShowVideo(stream);
    setShowVideo(hasTracks);

    const onTracksChange = () => {
      setShowVideo(updateShowVideo(stream));
    };

    stream.addEventListener("addtrack", onTracksChange);
    stream.addEventListener("removetrack", onTracksChange);

    // Attach stream to video element - use setTimeout to ensure ref is set after render
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
      stream.removeEventListener("addtrack", onTracksChange);
      stream.removeEventListener("removetrack", onTracksChange);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream, updateShowVideo]);

  const displayName = fullName || username;

  // Ref callback: set srcObject as soon as video element mounts (handles tracks arriving async)
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
    [stream]
  );

  // Always mount video element so it can receive stream/tracks immediately;
  // overlay loader when no tracks yet
  return (
    <VideoContainer>
      <VideoElement
        ref={setVideoRef}
        autoPlay
        playsInline
        controls={false}
        style={{ opacity: showVideo ? 1 : 0 }}
      />
      {!showVideo && (
        <Loader style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <LoaderSpinner>⟳</LoaderSpinner>
          {isScreenShare ? "Loading screen share..." : "Loading video..."}
        </Loader>
      )}

      <NameLabel>{displayName}</NameLabel>
      {isMuted && <MuteIconContainer>🔇</MuteIconContainer>}
    </VideoContainer>
  );
};

// Styled Components
const VideoContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  background-color: #222;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const VideoElement = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
  background-color: #000;
  background-color: #000;
  transform: scaleX(1);

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
const Loader = styled.div`
  color: white;
  font-size: 16px;
  font-weight: 500;
  text-align: center;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  animation: pulse 1.5s infinite;

  @keyframes pulse {
    0% { opacity: 0.3; }
    50% { opacity: 1; }
    100% { opacity: 0.3; }
  }
`;

const LoaderSpinner = styled.div`
  font-size: 32px;
  animation: spin 1s linear infinite;
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
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