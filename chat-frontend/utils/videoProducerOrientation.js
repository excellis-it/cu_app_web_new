/**
 * Metadata for mediasoup video produce() appData (width, height, rotation).
 * Keep in sync with components/room.js usage and server recording orientation.
 */
export function computeVideoProducerOrientation(videoTrack, isMobileBrowser) {
  if (!videoTrack) {
    return { reportedWidth: 480, reportedHeight: 360, reportedRotation: 0 };
  }

  const videoSettings = videoTrack.getSettings();
  let reportedWidth = videoSettings.width;
  let reportedHeight = videoSettings.height;
  let reportedRotation = 0;

  if (!reportedWidth || !reportedHeight) {
    try {
      const constraints = videoTrack.getConstraints();
      if (!reportedWidth) {
        const wc = constraints?.width;
        reportedWidth =
          typeof wc === "object" ? wc.exact || wc.ideal || wc.max : wc;
      }
      if (!reportedHeight) {
        const hc = constraints?.height;
        reportedHeight =
          typeof hc === "object" ? hc.exact || hc.ideal || hc.max : hc;
      }
    } catch (_) {
      /* ignore */
    }
  }
  if (!reportedWidth) reportedWidth = 480;
  if (!reportedHeight) reportedHeight = 360;

  if (isMobileBrowser && typeof window !== "undefined") {
    const angle = screen?.orientation?.angle ?? window.orientation ?? 0;
    const normalizedAngle = ((Number(angle) % 360) + 360) % 360;
    if (normalizedAngle === 90 || normalizedAngle === 270) {
      reportedRotation = normalizedAngle;
    } else if (normalizedAngle === 180) {
      reportedRotation = 180;
    }
    const isPortraitOrientation =
      normalizedAngle === 0 || normalizedAngle === 180;
    if (isPortraitOrientation && reportedWidth > reportedHeight) {
      [reportedWidth, reportedHeight] = [reportedHeight, reportedWidth];
    }
  }

  return { reportedWidth, reportedHeight, reportedRotation };
}

/**
 * CSS rotation for local camera preview so it matches server-side FFmpeg transpose
 * (recordingManager buildOneVideoBranchToCell) for the same appData.rotation values.
 */
export function localPreviewCssRotationDeg(orientationMeta) {
  const r = ((orientationMeta.reportedRotation % 360) + 360) % 360;
  if (r === 90) return -90;
  if (r === 270) return 90;
  if (r === 180) return 180;
  return 0;
}

/**
 * Same CSS rotation as localPreviewCssRotationDeg for producer `appData.rotation`
 * (0, 90, 180, 270). Use on remote <video> so tiles match server recording orientation.
 */
export function producerAppDataRotationToCssDeg(rotation) {
  const n = rotation == null || Number.isNaN(Number(rotation)) ? 0 : Number(rotation);
  return localPreviewCssRotationDeg({
    reportedWidth: 640,
    reportedHeight: 480,
    reportedRotation: n,
  });
}
