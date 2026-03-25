import React, { useRef, useState } from "react";

const FloatingModal = ({ userVideoRef, setIsFloating }) => {
  const modalRef = useRef(null);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [dragging, setDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    setDragging(true);
    const rect = modalRef.current.getBoundingClientRect();
    offset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    setPosition({
      x: e.clientX - offset.current.x,
      y: e.clientY - offset.current.y,
    });
  };

  const handleMouseUp = () => setDragging(false);

  return (
    <div
      ref={modalRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="floating-modal"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: "300px",
        height: "180px",
        background: "black",
        zIndex: 10000,
        borderRadius: "10px",
        overflow: "hidden",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      <video
        ref={userVideoRef}
        muted
        autoPlay
        playsInline
        style={{ width: "100%", height: "100%" }}
      />
      <button
        onClick={() => setIsFloating(false)}
        style={{
          position: "absolute",
          top: 5,
          right: 5,
          color: "white",
          zIndex: 10001,
        }}
      >
        &#x26F6;
      </button>
    </div>
  );
};

export default FloatingModal;
