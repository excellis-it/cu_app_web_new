import { useEffect, useRef } from "react";
import Hls from "hls.js";

/**
 * Video player that auto-detects HLS (.m3u8) URLs and uses hls.js for playback.
 * For non-HLS URLs (mp4, webm), falls back to native <video> element.
 */
const HlsVideo = ({ src, ...props }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const isHls = src.endsWith(".m3u8") || src.includes(".m3u8");

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hlsRef.current = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari has native HLS support
        video.src = src;
      }
    } else {
      video.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

  return <video ref={videoRef} {...props} />;
};

export default HlsVideo;
