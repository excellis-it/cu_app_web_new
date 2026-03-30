import React, { useState, useEffect, useRef } from "react";
import { Button, Modal, IconButton, Box, Typography, Avatar } from "@mui/material";
import { Call as CallIcon, CallEnd as CallEndIcon, Videocam as VideocamIcon, Phone as PhoneIcon } from "@mui/icons-material";
import Room from "./room";

const IncomingCallButton = ({ socketRef, user_name, userId, onAcceptIncomingCall }) => {
  const [fullScreenCall, setFullScreenCall] = useState(false); // Fullscreen call state
  const [incomingCall, setIncomingCall] = useState(null); // Incoming call data
  const [producers, setProducers] = useState({ audio: null, video: null });
  const [openRoom, setopenRoom] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [err, setErr] = useState(false);
  const timeoutRef = useRef(null);
  const ringtoneRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const [user_id, SetUser_id] = useState(null);
  const [group_id, SetGroup_id] = useState(null);
  const [callType, setCallType] = useState("");

  // Unlock audio context on first user interaction.
  // Chrome blocks audio.play() until the user has clicked/pressed a key.
  // We pre-create the Audio element and silently play+pause it on first gesture,
  // which tells the browser "this tab has user interaction → allow audio".
  useEffect(() => {
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      try {
        if (!ringtoneRef.current) {
          ringtoneRef.current = new Audio("/ringtone.mp3");
          ringtoneRef.current.loop = true;
        }
        const p = ringtoneRef.current.play();
        if (p) {
          p.then(() => {
            ringtoneRef.current.pause();
            ringtoneRef.current.currentTime = 0;
            audioUnlockedRef.current = true;
          }).catch(() => {});
        }
      } catch (_) {}
    };
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);




  useEffect(() => {
    if (!socketRef.current) return;

    const handleIncomingCall = async (data) => {
      // If the user was already in this call (e.g. page reload during an active call),
      // don't show the incoming call modal or play the ringtone again.
      const userInActiveCall = sessionStorage.getItem("userInActiveCall");
      const activeCallId = sessionStorage.getItem("activeCallId");
      if (userInActiveCall === "true" && activeCallId === data.roomId?.toString()) {
        return;
      }

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
    };

    const handleCallEnded = (data) => {
      stopCall();
    };

    socketRef?.current.on("incomming_call", handleIncomingCall);
    socketRef?.current.on("FE-call-ended", handleCallEnded);

    return () => {
      socketRef.current.off("incomming_call", handleIncomingCall);
      socketRef.current.off("FE-call-ended", handleCallEnded);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      stopRingtone();
    };
  }, [socketRef.current]);



  useEffect(() => {
    const handleUserExist = ({ error, roomId, callType }) => {
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
        if (typeof onAcceptIncomingCall === "function") {
          onAcceptIncomingCall({
            roomId: roomName,
            callType: callType || incomingCall?.callType || "video",
            callerName: incomingCall?.callerName,
            groupName: incomingCall?.groupName,
          });
        } else {
          setopenRoom(true);
        }
      } else {
        setErr(error);
        setErrMsg("User name already exist");
      }
    };

    socketRef?.current?.on("FE-error-user-exist", handleUserExist);

    return () => {
      socketRef?.current?.off("FE-error-user-exist", handleUserExist);
    };
  }, [incomingCall, onAcceptIncomingCall, callType, group_id, userId, user_name]);

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
        confirmButtonColor: '#1da678 !important'
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
      if (typeof onAcceptIncomingCall === "function") {
        onAcceptIncomingCall({
          roomId: roomName,
          callType: callType || incomingCall?.callType || "video",
          callerName: incomingCall?.callerName,
          groupName: incomingCall?.groupName,
        });
      }
      socketRef.current.emit('BE-check-user', { roomId: roomName, userName }, (ack) => {
      });
    }

  }

  const retryListenersRef = useRef(null);

  const cleanupRetryListeners = () => {
    if (!retryListenersRef.current) return;
    const { retryPlay, onVisibilityChange } = retryListenersRef.current;
    document.removeEventListener("click", retryPlay);
    document.removeEventListener("keydown", retryPlay);
    document.removeEventListener("touchstart", retryPlay);
    document.removeEventListener("pointerdown", retryPlay);
    window.removeEventListener("focus", retryPlay);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    retryListenersRef.current = null;
  };

  const playRingtone = () => {
    try {
      // Reuse one Audio instance to avoid overlapping loops from duplicate events.
      if (!ringtoneRef.current) {
        ringtoneRef.current = new Audio("/ringtone.mp3");
        ringtoneRef.current.loop = true;
      }

      const attemptPlay = () => {
        const audio = ringtoneRef.current;
        if (!audio) return;
        // Try muted first (browsers allow muted autoplay), then unmute once playing.
        audio.muted = true;
        audio.play()
          .then(() => {
            audio.muted = false;
            cleanupRetryListeners();
          })
          .catch(() => {
            audio.muted = false;
            // Still blocked — keep retry listeners active for next interaction.
          });
      };

      const playPromise = ringtoneRef.current.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise
          .then(() => {
            cleanupRetryListeners();
          })
          .catch((err) => {
            // Autoplay blocked — set up persistent retry listeners.
            // Do NOT use { once: true } so retries keep working if the first one also fails.
            console.warn("Ringtone play blocked, will retry on next interaction:", err?.name || err);

            cleanupRetryListeners(); // Remove any stale listeners first.

            const retryPlay = () => attemptPlay();
            const onVisibilityChange = () => {
              if (document.visibilityState === "visible") attemptPlay();
            };

            retryListenersRef.current = { retryPlay, onVisibilityChange };

            document.addEventListener("click", retryPlay);
            document.addEventListener("keydown", retryPlay);
            document.addEventListener("touchstart", retryPlay);
            document.addEventListener("pointerdown", retryPlay);
            // Fires when the user clicks a push notification and the tab gets focused.
            window.addEventListener("focus", retryPlay);
            // Fires when the tab becomes visible after being hidden.
            document.addEventListener("visibilitychange", onVisibilityChange);
          });
      }
    } catch (e) {
      console.warn("Failed to start ringtone:", e);
    }
  };

  const stopRingtone = () => {
    cleanupRetryListeners();
    const audio = ringtoneRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
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
      if (group_id && user_id) {
        socketRef.current.emit("call_disconnect", { roomId: group_id, userId: user_id });
      }

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
