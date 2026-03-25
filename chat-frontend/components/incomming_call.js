import React, { useState, useEffect, useRef } from "react";
import { Button, Modal, IconButton, Box, Typography, Avatar } from "@mui/material";
import { Call as CallIcon, CallEnd as CallEndIcon, Videocam as VideocamIcon, Phone as PhoneIcon } from "@mui/icons-material";
import Room from "./room";

const IncomingCallButton = ({ socketRef, user_name, userId }) => {
  const [fullScreenCall, setFullScreenCall] = useState(false); // Fullscreen call state
  const [incomingCall, setIncomingCall] = useState(null); // Incoming call data
  const [producers, setProducers] = useState({ audio: null, video: null });
  const [openRoom, setopenRoom] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [err, setErr] = useState(false);
  const timeoutRef = useRef(null);
  const ringtoneRef = useRef(null);
  const [user_id, SetUser_id] = useState(null);
  const [group_id, SetGroup_id] = useState(null);
  const [callType, setCallType] = useState("");




  useEffect(() => {
    if (!socketRef.current) return;

    socketRef?.current.on("incomming_call", async (data) => {
      const userStorage = localStorage.getItem('user');
      const token = userStorage ? JSON.parse(userStorage).data?.token : '';
      const response = await fetch(`/api/groups/check-active-call?group_id=${data.roomId}`, {
        headers: {
          "access-token": token,
        }
      });
      const result = await response.json();
      if (result.success && !result.data.activeCall) { return; } // Ignore if no active call
      setIncomingCall(data);
      SetUser_id(data.uid);
      SetGroup_id(data.roomId);
      setCallType(data.callType);

      // Try to start ringtone immediately on incoming call.
      // This may be blocked by autoplay policies if the user has never interacted,
      // but will work once the user has clicked anywhere on the page.
      playRingtone();

      // Clear any previous timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        stopCall();
      }, 1000 * 30); // Example: 30 seconds
    });

    socketRef?.current.on("FE-call-ended", (data) => {
      stopCall();
    })

    return () => {
      socketRef.current.off("incomming_call");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [socketRef.current]);



  useEffect(() => {
    socketRef?.current?.on("FE-error-user-exist", ({ error, roomId, callType }) => {
      let callStatus = sessionStorage.getItem("callStatus");
      if (
        !error &&
        incomingCall?.uid?.toString() === userId?.toString() &&
        callStatus === "incoming"
      ) {
        const roomName = incomingCall?.roomId || group_id;
        const userName = incomingCall?.uid || userId;
        SetUser_id(userName);
        SetGroup_id(roomName);

        sessionStorage.setItem("user", userName);
        sessionStorage.setItem("fullName", user_name);
        setErr(false);
        setErrMsg("");
        setopenRoom(true);
      } else {
        setErr(error);
        setErrMsg("User name already exist");
      }
    });
  }, [incomingCall]);

  async function clickJoin() {
    // Check if user is already in a call
    const userInActiveCall = sessionStorage.getItem("userInActiveCall");
    const activeCallId = sessionStorage.getItem("activeCallId");
    const incomingGroupId = incomingCall?.roomId || group_id;

    if (userInActiveCall === "true" && activeCallId && activeCallId !== incomingGroupId?.toString()) {
      // User is in a different call
      const { default: Swal } = await import('sweetalert2');
      await Swal.fire({
        title: 'Already in a Call',
        text: 'You are already in an active call. Please end the current call before joining another one.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#f37e20 !important'
      });
      // Reject the incoming call
      stopCall();
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasAudio = devices.some((device) => device.kind === "audioinput");
    const hasVideo = devices.some((device) => device.kind === "videoinput");

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    stopRingtone();
    setIncomingCall(null);
    const roomName = incomingCall?.roomId || group_id;
    const userName = incomingCall?.uid || user_id;
    if (!roomName || !userName) {
      setErr(true);
      setErrMsg('Enter Room Name or User Name');
    } else {
      sessionStorage.setItem('user', userName);
      setErr(false);
      setErrMsg('');
      // Route.push(`/room/${r/oomName}`);
      sessionStorage.setItem("callStatus", 'incoming');
      sessionStorage.setItem("userInActiveCall", true);
      sessionStorage.setItem("activeCallId", roomName);
      socketRef.current.emit('BE-check-user', { roomId: roomName, userName }, (ack) => {
      });
    }

  }

  const playRingtone = () => {
    try {
      const audio = new Audio("/ringtone.mp3"); // Add a ringtone file in your public folder
      audio.loop = true;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch((err) => {
          // Autoplay may be blocked until user interacts; log and continue.
          console.warn("Ringtone play blocked or failed:", err?.name || err);
        });
      }
      ringtoneRef.current = audio;
      setIncomingCall((prev) => ({ ...prev, ringtone: audio }));
    } catch (e) {
      console.warn("Failed to start ringtone:", e);
    }
  };

  const stopRingtone = () => {
    const audio = ringtoneRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      ringtoneRef.current = null; // Clear it out
    } else {
      console.log("No ringtone to stop.");
    }
  };




  const stopCall = () => {
    try {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      stopRingtone();
      setIncomingCall(null);
      // Stop all media tracks

      if (producers.audio && producers.audio.track) {
        producers.audio.track.stop();
      }
      if (producers.video && producers.video.track) {
        producers.video.track.stop();
      }
      socketRef.current.emit("call_disconnect", { roomId: group_id, userId: user_id });

      setProducers({ audio: null, video: null });
      setFullScreenCall(false); // Close the call UI
    } catch (error) {
      console.error("Error stopping media stream:", error);
    }
  };

  const handelState = (data) => {
    if (data === "close") {
      setopenRoom(false);
    }
  }

  return openRoom ? (
    <Room
      socketRef={socketRef}
      room_id={group_id}
      onSendData={handelState}
      callType={callType}
      joinEvent={"BE-join-room"}
      leaveEvent={""}
    />
  ) :
    (
      <>
        {/* Start Call Button */}
        <Modal open={!!incomingCall} onClose={stopCall}>
          <Box
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              bgcolor: "white",
              p: 3,
              borderRadius: "8px",
              width: 400,
              textAlign: "center",
              boxShadow: 24,
            }}
          >
            <Typography variant="h6">Incoming Call From {incomingCall?.groupName || "Unknown"} Group</Typography>
            <Avatar
              sx={{
                width: 80,
                height: 80,
                bgcolor: "#1976d2",
                mx: "auto",
                mt: 2,
              }}
            >
              <PhoneIcon sx={{ color: "white" }} />
            </Avatar>
            <Typography variant="body1" sx={{ mt: 2 }}>
              {incomingCall?.callerName || "Unknown Caller"}
            </Typography>
            <Box sx={{ display: "flex", justifyContent: "center", gap: 2, mt: 3 }}>
              {/* Join Button */}
              <IconButton
                onClick={() => {
                  clickJoin();
                }}
                sx={{
                  bgcolor: "green",
                  color: "white",
                  "&:hover": {
                    bgcolor: "darkgreen",
                  },
                  padding: "12px",
                }}
              >
                <CallIcon sx={{
                  bgcolor: "green",
                  color: "white"
                }} />
              </IconButton>
              {/* End Call Button */}
              <IconButton
                onClick={stopCall}
                sx={{
                  bgcolor: "red",
                  color: "white",
                  "&:hover": {
                    bgcolor: "darkred",
                  },
                  padding: "12px",
                }}
              >
                <CallEndIcon sx={{
                  bgcolor: "red",
                  color: "white",
                }} />
              </IconButton>
            </Box>
          </Box>
        </Modal>
      </>
    );
};

export default IncomingCallButton;
