import React from "react";
import styled from "styled-components";

export function getParticipantInitial(displayName) {
  const s = String(displayName ?? "").trim();
  if (!s) return "?";
  const cp = s.codePointAt(0);
  if (cp == null) return "?";
  return String.fromCodePoint(cp).toUpperCase();
}

function hueFromName(name) {
  const s = String(name || "?");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = s.charCodeAt(i) + ((h << 5) - h);
  }
  return Math.abs(h) % 360;
}

const Wrap = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
  background: #2a2a2a;
`;

const Circle = styled.div`
  box-sizing: border-box;
  width: ${(p) =>
    p.$compact
      ? "clamp(40px, 36%, 54px)"
      : "clamp(56px, 26%, 112px)"};
  aspect-ratio: 1;
  max-width: 92%;
  max-height: 92%;
  border-radius: 50%;
  background: ${(p) => p.$tone};
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: ${(p) =>
    p.$compact
      ? "clamp(16px, 5vmin, 24px)"
      : "clamp(22px, 7vmin, 44px)"};
  line-height: 1;
  flex-shrink: 0;
`;

/**
 * Centered initial (audio-only / camera off), Meet-style colored circle.
 */
export default function ParticipantInitialAvatar({ name, compact = false }) {
  const initial = getParticipantInitial(name);
  const hue = hueFromName(name || initial);
  const tone = `hsl(${hue} 38% 40%)`;

  return (
    <Wrap aria-hidden>
      <Circle $compact={compact} $tone={tone}>
        {initial}
      </Circle>
    </Wrap>
  );
}
