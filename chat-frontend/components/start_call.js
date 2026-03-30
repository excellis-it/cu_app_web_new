import React, { useRef, useState, useEffect } from "react";
import { Button, Modal, IconButton, Box, Paper, Avatar } from "@mui/material";
import {
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon,
  Call as CallIcon,
} from "@mui/icons-material";
import { createDummyMediaStream } from "../utils/createDummyMediaStream";

const CallButton = ({
  user_id,
  group_id,
  socketRef,
  user_name,
  onStartCall,
  renderTrigger,
}) => {
  const [open, setOpen] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [producers, setProducers] = useState({ audio: null, video: null });
  // const [openRoom, setopenRoom] = useState(false); // Removed state
  const [errMsg, setErrMsg] = useState("");
  const [err, setErr] = useState(false);
  const localVideoRef = useRef(null);
  const previewStreamRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [incommingCallStatus, setIncomingCallStatus] = useState(false);
  const [activeCall, setActiveCall] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [callType, setCallType] = useState("audio"); // safe default

  useEffect(() => {
    if (!socketRef.current) return;

    socketRef.current.on("incomming_call", (data) => {
      if (data.roomId.toString() === group_id.toString()) {
        setIncomingCallStatus(true);
        checkActiveCall();
      }
    });

    socketRef.current.on("FE-error-user-exist", ({ error, roomId }) => {
      let callStatus = sessionStorage.getItem("callStatus");
      if (!error && callStatus === "outgoing") {
        const roomName = group_id;
        const userName = user_id;
        sessionStorage.setItem("user", userName);
        sessionStorage.setItem("fullName", user_name);
        setErr(false);
        setErrMsg("");
        // setopenRoom(true); // Handled by parent
      } else {
        setErr(error);
        setErrMsg("User name already exist");
      }
    });

    socketRef.current.on("FE-leave", (data) => {
      if (data?.roomId?.toString() === group_id?.toString()) {
        checkActiveCall();
      }
    });

    socketRef.current.on("FE-call-ended", (data) => {
      if (data?.roomId?.toString() === group_id?.toString()) {
        checkActiveCall();
      }
    });

    checkActiveCall();

    return () => {
      socketRef.current.off("incomming_call");
      socketRef.current.off("FE-error-user-exist");
      socketRef.current.off("FE-call-ended");
      socketRef.current.off("FE-user-leave");
    };
  }, [socketRef.current]);

  // Throttle checkActiveCall to avoid excessive API calls
  const lastCheckRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    // Only check if it's been at least 1 second since last check
    if (now - lastCheckRef.current < 1000) {
      return;
    }
    lastCheckRef.current = now;
    checkActiveCall();
  }, [group_id]);

  function getDummyStream() {
    return createDummyMediaStream();
  }

  const openModal = async () => {
    // Check if user is already in a call
    const userInActiveCall = sessionStorage.getItem("userInActiveCall");
    const activeCallId = sessionStorage.getItem("activeCallId");

    if (
      userInActiveCall === "true" &&
      activeCallId &&
      activeCallId !== group_id.toString()
    ) {
      // User is in a different call
      const { default: Swal } = await import("sweetalert2");
      Swal.fire({
        title: "Already in a Call",
        text: "You are already in an active call. Please end the current call before joining another one.",
        confirmButtonText: "OK",
        confirmButtonColor: "#1da678 !important",
      });
      return;
    }

    try {
      const devices = await navigator?.mediaDevices?.enumerateDevices();
      const hasAudio = devices?.some((d) => d?.kind === "audioinput");
      const hasVideo = devices?.some((d) => d?.kind === "videoinput");
      const stream = await navigator?.mediaDevices?.getUserMedia({
        video: hasVideo,
        audio: hasAudio,
      });

      if (hasAudio || hasVideo) {
        setStream(stream);
        previewStreamRef.current = stream;
        setProducers({
          audio: { track: stream?.getAudioTracks()[0] },
          video: { track: stream?.getVideoTracks()[0] },
        });
      } else {
        const dummyStream = getDummyStream();
        setStream(dummyStream);
        previewStreamRef.current = dummyStream;
        setProducers({
          audio: { track: dummyStream?.getAudioTracks()[0] },
          video: { track: dummyStream?.getVideoTracks()[0] },
        });
      }

      setOpen(true);
      setCallType("video");

      setTimeout(() => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }, 50);
    } catch (error) {
      console.error("Could not access camera/mic", error);
      const dummyStream = getDummyStream();
      setStream(dummyStream);
      previewStreamRef.current = dummyStream;
      setProducers({
        audio: { track: dummyStream?.getAudioTracks()[0] },
        video: { track: dummyStream?.getVideoTracks()[0] },
      });
      setOpen(true);
      setCallType("video");

      setTimeout(() => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = dummyStream;
        }
      }, 50);
    }
  };

  const opencallModal = async () => {
    // Check if user is already in a call
    const userInActiveCall = sessionStorage.getItem("userInActiveCall");
    const activeCallId = sessionStorage.getItem("activeCallId");

    if (
      userInActiveCall === "true" &&
      activeCallId &&
      activeCallId !== group_id.toString()
    ) {
      // User is in a different call
      const { default: Swal } = await import("sweetalert2");
      Swal.fire({
        title: "Already in a Call",
        text: "You are already in an active call. Please end the current call before joining another one.",
        confirmButtonText: "OK",
        confirmButtonColor: "#1da678 !important",
      });
      return;
    }

    try {
      setCameraOn((prev) => {
        if (producers.video?.track) producers.video.track.enabled = !prev;
        return !prev;
      });
      setOpen(true);
      setCallType("audio");
    } catch (error) {
      console.error("Could not access mic", error);
      alert("Could not access camera or mic");
    }
  };

  const checkActiveCall = async () => {
    try {
      setIsChecking(true);
      const userStorage = localStorage.getItem("user");
      const token = userStorage ? JSON.parse(userStorage).data?.token : "";

      const response = await fetch(
        `/api/groups/check-active-call?group_id=${group_id}`,
        {
          headers: {
            "access-token": token,
          },
        },
      );

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success && data.data && data.data.activeCall) {
        setCallType(data.data.callType);
        setActiveCall(true);
        setParticipantCount(data.data.participantCount || 0);
      } else {
        setActiveCall(false);
        setParticipantCount(0);
      }
    } catch (error) {
      console.error("Error checking active call:", error);
    } finally {
      setIsChecking(false);
    }
  };

  // Auto-open preview when navigating from an accepted incoming call
  useEffect(() => {
    const pending = sessionStorage.getItem("pendingCallPreview");
    if (pending && pending === group_id?.toString()) {
      sessionStorage.removeItem("pendingCallPreview");
      // Small delay to let the component fully mount and activeCall state settle
      const timer = setTimeout(() => {
        openModal();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [group_id]);

  useEffect(() => {
    if (open && stream && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  }, [open, stream]);

  const closeModal = () => {
    setOpen(false);
    setProducers({ audio: null, video: null });
    setMicOn(true);
    setCameraOn(true);
  };

  const clickJoin = async () => {
    const roomName = group_id;
    const userName = user_id;

    if (!roomName || !userName) {
      setErr(true);
      setErrMsg("Enter Room Name or User Name");
    } else {
      sessionStorage.setItem("user", userName);
      sessionStorage.setItem("callStatus", "outgoing");
      sessionStorage.setItem("activeCallId", roomName);
      sessionStorage.setItem("userInActiveCall", true);
      // setopenRoom(true); // Removed to prevent double render
      setErr(false);
      setErrMsg("");
      socketRef.current.emit("BE-check-user", {
        roomId: roomName,
        userName,
        callType: callType,
      });
      // Hand off the pre-call media stream to the Room component so it can reuse
      // the same tracks instead of requesting camera/mic again.
      if (typeof window !== "undefined") {
        window.exTalkPreCallStream = previewStreamRef.current || stream;
      }
      onStartCall?.(callType, group_id);
      closeModal();
    }
  };

  const toggleMic = () => {
    setMicOn((prev) => {
      if (producers?.audio?.track) producers.audio.track.enabled = !prev;
      return !prev;
    });
  };

  const toggleCamera = () => {
    setCameraOn((prev) => {
      if (producers?.video?.track) producers.video.track.enabled = !prev;
      return !prev;
    });
  };

  // handelState removed as it was only used for Room onClose

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ openVideo: openModal, openAudio: opencallModal })
      ) : activeCall ? (
        <IconButton
          onClick={callType === "video" ? openModal : opencallModal}
          color={activeCall ? "success" : "primary"}
          title={
            activeCall
              ? `Join ongoing call (${participantCount} participant${
                  participantCount !== 1 ? "s" : ""
                })`
              : "Start a new call"
          }
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              border: "1px solid #4caf50",
              padding: "4px 10px",
              borderRadius: "4px",
              animation: "pulse 1.5s infinite",
              "@keyframes pulse": {
                "0%, 100%": { opacity: 1 },
                "50%": { opacity: 0.7 },
              },
            }}
          >
            {callType === "audio" ? (
              <CallIcon style={{ color: "#4caf50" }} />
            ) : (
              <VideocamIcon style={{ color: "#4caf50" }} />
            )}
            <span
              style={{
                color: "#4caf50",
                fontWeight: "bold",
                fontSize: "14px",
              }}
            >
              Join Call
            </span>
          </Box>
        </IconButton>
      ) : (
        <Box sx={{ display: "inline-flex", gap: 1 }}>
          <Box className="border-right-chat">
            <IconButton onClick={opencallModal} color="primary">
              <CallIcon style={{ color: "#64779a" }} />
            </IconButton>
          </Box>
          <Box className="border-right-chat">
            <IconButton onClick={openModal} color="primary">
              <VideocamIcon style={{ color: "#64779a" }} />
            </IconButton>
          </Box>
        </Box>
      )}

      <Modal open={open} onClose={closeModal}>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            bgcolor: "#ffffff",
            p: 2,
            borderRadius: "8px",
            maxWidth: 500,
            width: "97%",
            textAlign: "center",
          }}
        >
          <Paper
            elevation={3}
            sx={{
              width: "100%",
              height: 250,
              bgcolor: "#000",
              position: "relative",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: "scaleX(-1)",
              }}
            />
            {!cameraOn && (
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  bgcolor: "rgba(0,0,0,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Avatar sx={{ width: 80, height: 80, bgcolor: "#555" }}>
                  <VideocamOffIcon />
                </Avatar>
              </Box>
            )}
          </Paper>
          <Button
            variant="contained"
            color="primary"
            startIcon={<CallIcon />}
            onClick={clickJoin}
            style={{
              backgroundColor: "#1da678",
              color: "white",
              marginTop: "16px",
              borderRadius: "30px",
            }}
          >
            {activeCall ? "Join Call" : "Start Call"}
          </Button>
        </Box>
      </Modal>

      {/* Modal and Room rendering logic updated */}
    </>
  );
};

export default CallButton;
