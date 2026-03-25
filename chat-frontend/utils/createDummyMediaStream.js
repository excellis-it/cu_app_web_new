// Shared dummy media stream helper for when real devices are unavailable.
// Creates a black canvas video track and a very quiet audio track.

export function createDummyMediaStream() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    const draw = () => {
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText("No Camera", canvas.width / 2, canvas.height / 2);
    };

    const intervalId = setInterval(draw, 1000);
    draw();

    const videoStream = canvas.captureStream(15);
    const videoTrack = videoStream.getVideoTracks()[0];

    const originalVideoStop = videoTrack.stop.bind(videoTrack);
    videoTrack.stop = () => {
      clearInterval(intervalId);
      originalVideoStop();
    };

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioContext = AudioCtx ? new AudioCtx() : null;
    let audioTrack = null;

    if (audioContext) {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.01;
      oscillator.type = "sine";
      oscillator.frequency.value = 20;
      const destination = audioContext.createMediaStreamDestination();
      oscillator.connect(gainNode);
      gainNode.connect(destination);
      oscillator.start();
      audioTrack = destination.stream.getAudioTracks()[0] || null;

      if (audioTrack) {
        const originalAudioStop = audioTrack.stop.bind(audioTrack);
        audioTrack.stop = () => {
          try {
            oscillator.stop();
          } catch {}
          originalAudioStop();
          if (audioContext.state !== "closed") {
            audioContext.close().catch(() => {});
          }
        };
      }
    }

    const tracks = [videoTrack];
    if (audioTrack) tracks.push(audioTrack);

    return new MediaStream(tracks);
  } catch (err) {
    console.error("createDummyMediaStream failed, fallback canvas only:", err);
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const stream = canvas.captureStream(5);
    return new MediaStream([stream.getVideoTracks()[0]]);
  }
}

