import React, { useEffect, useState, useRef } from 'react';
import {
  Box,
  Typography,
  Alert,
  Paper,
  useTheme,
  Modal,
  Button,
  IconButton,
  Avatar
} from '@mui/material';
import {
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon,
  Call as CallIcon,
} from '@mui/icons-material';
import { createDummyMediaStream } from '../utils/createDummyMediaStream';
import moment from 'moment';
import { useRouter } from 'next/router';
import Room from '../components/room';

const MeetingStatusBanner = ({ selected, globalUser, socketRef, onStartCall, user_id, group_id, user_name, isActiveRoom }) => {
  const [timeOffset, setTimeOffset] = useState(0); // milliseconds offset from server
  const [now, setNow] = useState(moment());
  const theme = useTheme(); // for dark/light compatibility
  const [start, setStart] = useState(moment(selected.meetingStartTime));
  const [end, setEnd] = useState(moment(selected.meetingEndTime));
  const router = useRouter();
  const [hasLeft, setHasLeft] = useState(false);
  const [callType, setCallType] = useState('video');
  const [activeCall, setActiveCall] = useState(false);
  const [openRoom, setopenRoom] = useState(false);

  // Preview Modal States
  const [openPreview, setOpenPreview] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [producers, setProducers] = useState({ audio: null, video: null });
  const localVideoRef = useRef(null);
  const previewStreamRef = useRef(null);
  const [stream, setStream] = useState(null);

  // Helper function to get server-synchronized time
  const getServerTime = () => {
    return moment(Date.now() + timeOffset);
  };

  // Sync time with server on mount
  useEffect(() => {
    const syncTimeWithServer = async () => {
      try {
        const requestTime = Date.now();
        const response = await fetch('/api/server-time', {
          method: 'GET',
        });
        const receiveTime = Date.now();

        if (response.ok) {
          const data = await response.json();
          const serverTime = data.serverTime;

          // Calculate round-trip time and estimate server time at this moment
          const roundTripTime = receiveTime - requestTime;
          const estimatedServerTime = serverTime + (roundTripTime / 2);

          // Calculate offset (positive if server is ahead, negative if behind)
          const offset = estimatedServerTime - receiveTime;
          setTimeOffset(offset);

          console.log('Time synchronized with server. Offset:', offset, 'ms');
        }
      } catch (error) {
        console.warn('Failed to sync time with server, using local time:', error);
        // Continue using local time if sync fails
        setTimeOffset(0);
      }
    };

    syncTimeWithServer();
    // Re-sync every 5 minutes to account for clock drift
    const syncInterval = setInterval(syncTimeWithServer, 5 * 60 * 1000);
    return () => clearInterval(syncInterval);
  }, []);

  useEffect(() => {
    setStart(moment(selected.meetingStartTime));
    setEnd(moment(selected.meetingEndTime));
  }, [selected.meetingStartTime, selected.meetingEndTime]);

  useEffect(() => {
    const interval = setInterval(() => setNow(getServerTime()), 1000);
    return () => clearInterval(interval);
  }, [timeOffset]);

  useEffect(() => {
    if (now.isBetween(start, end)) {
      setActiveCall(true);
    }
    if (!hasLeft && now.isAfter(end)) {
      setHasLeft(true);
      goToBack();
    }
  }, [now, end, hasLeft]);

  useEffect(() => {
    const start = moment(selected?.meetingStartTime);
    const end = moment(selected?.meetingEndTime);

    if (selected?.isTemp && !now.isBetween(start, end)) {
      setopenRoom(false);
      setCallType(null);
      sessionStorage.removeItem("userInActiveCall");
      sessionStorage.removeItem("callStatus");
    }
  }, [now, selected]);

  // Ref to track if we've auto-opened the preview for this session
  const hasAutoOpenedRef = useRef(false);
  // Ref to track if this was a deep link navigation
  const wasDeepLinkRef = useRef(false);

  // Detect deep link on mount
  useEffect(() => {
    // Check URL params first (in case they're still there)
    const urlParams = new URLSearchParams(window.location.search);
    const hasUrlParams = urlParams.has('pin') || urlParams.has('groupId');

    // Check sessionStorage for deep link flag (set by messages/index.js)
    const deepLinkFlag = sessionStorage.getItem('isDeepLinkNavigation');

    if (hasUrlParams) {
      wasDeepLinkRef.current = true;
      // Set flag in sessionStorage for reliability
      sessionStorage.setItem('isDeepLinkNavigation', 'true');
      console.log('[MeetingStatusBanner] ✅ Deep link detected from URL:', {
        pin: urlParams.get('pin'),
        groupId: urlParams.get('groupId')
      });
    } else if (deepLinkFlag === 'true') {
      wasDeepLinkRef.current = true;
      console.log('[MeetingStatusBanner] ✅ Deep link detected from sessionStorage');
    }
  }, []); // Run once on mount

  // Auto-open preview when activeCall becomes true (after deep link)
  useEffect(() => {
    // Only proceed if this was a deep link navigation
    if (!wasDeepLinkRef.current) {
      return;
    }

    // Don't auto-open if we've already done it
    if (hasAutoOpenedRef.current) {
      return; // Silently skip - no need to log every second
    }

    // Check if meeting is currently active (use current time, not dependency)
    const currentTime = getServerTime();
    const isMeetingActive = currentTime.isBetween(start, end);

    // Check if user is already in a call or preview is already open
    const isInCall = openRoom || openPreview;
    const userInActiveCall = sessionStorage.getItem("userInActiveCall");

    // Auto-open preview if meeting is active and call exists
    if (isMeetingActive && !isInCall && !userInActiveCall && activeCall) {
      console.log('[MeetingStatusBanner] ✅✅✅ Auto-opening preview NOW for active meeting deep link!');
      hasAutoOpenedRef.current = true;
      wasDeepLinkRef.current = false; // Clear flag

      // Clear sessionStorage flag
      sessionStorage.removeItem('isDeepLinkNavigation');

      setTimeout(() => {
        openPreviewModal();
        // Clear URL params
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('pin') || urlParams.has('groupId')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }, 300);
    }
  }, [activeCall, openRoom, openPreview, start, end]); // Removed 'now' from dependencies to prevent continuous re-runs

  // Periodic check for deep link auto-open (optimized - single interval with dynamic timing)
  useEffect(() => {
    // Only check if this was a deep link and we haven't auto-opened yet
    if (!wasDeepLinkRef.current || hasAutoOpenedRef.current) {
      return;
    }

    // Helper function to trigger auto-open (extracted to avoid duplication)
    const triggerAutoOpen = () => {
      hasAutoOpenedRef.current = true;
      wasDeepLinkRef.current = false;
      sessionStorage.removeItem('isDeepLinkNavigation');
      setTimeout(() => {
        openPreviewModal();
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('pin') || urlParams.has('groupId')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }, 300);
    };

    // Only set up periodic check if meeting hasn't started yet
    const currentTime = getServerTime();
    if (currentTime.isAfter(start)) {
      return; // Meeting has started, rely on activeCall change instead
    }

    // Calculate time until meeting starts and determine check interval
    const timeUntilStart = start.diff(currentTime);
    const checkInterval = timeUntilStart > 60000 ? 30000 : 5000; // 30s if >1min, else 5s

    const interval = setInterval(() => {
      // Early exit if already opened
      if (hasAutoOpenedRef.current) {
        clearInterval(interval);
        return;
      }

      const checkTime = getServerTime();
      const isMeetingActive = checkTime.isBetween(start, end);
      const isInCall = openRoom || openPreview;
      const userInActiveCall = sessionStorage.getItem("userInActiveCall");

      if (isMeetingActive && activeCall && !isInCall && !userInActiveCall) {
        triggerAutoOpen();
        clearInterval(interval);
      }
    }, checkInterval);

    return () => clearInterval(interval);
  }, [start, end]); // Removed activeCall, openRoom, openPreview from deps - they're checked inside interval



  useEffect(() => {
    if (!socketRef.current) return;
    socketRef.current.on("FE-leave", (data) => {
      checkActiveCall();
    })
    socketRef.current.on("FE-call-ended", (data) => {
      checkActiveCall();
    })
    socketRef.current.on("FE-error-user-exist", ({ error, roomId }) => {
      let callStatus = sessionStorage.getItem("callStatus");
      if (!error && callStatus === "outgoing") {
        const roomName = group_id;
        const userName = user_id;
        sessionStorage.setItem("user", userName);
        sessionStorage.setItem("fullName", user_name);
        setopenRoom(true);
        closePreviewModal();
      }
    });

    return () => {
      socketRef.current.off("FE-call-ended");
      socketRef.current.off("FE-user-leave");
      socketRef.current.off("FE-error-user-exist");
    }

  }, [socketRef.current]);

  const userIncluded = selected.currentUsersId.includes(globalUser.data.user._id);

  if (!selected.isTemp || !userIncluded) return null;

  function getDummyStream() {
    return createDummyMediaStream();
  }

  const openPreviewModal = async () => {
    try {
      const devices = await navigator?.mediaDevices?.enumerateDevices();
      const hasAudio = devices?.some((d) => d?.kind === "audioinput");
      const hasVideo = devices?.some((d) => d?.kind === "videoinput");
      const mediaStream = await navigator?.mediaDevices?.getUserMedia({
        video: hasVideo,
        audio: hasAudio,
      });

      if (hasAudio || hasVideo) {
        setStream(mediaStream);
        previewStreamRef.current = mediaStream;
        setProducers({
          audio: { track: mediaStream?.getAudioTracks()[0] },
          video: { track: mediaStream?.getVideoTracks()[0] },
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

      setOpenPreview(true);

      setTimeout(() => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
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
      setOpenPreview(true);

      setTimeout(() => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = dummyStream;
        }
      }, 50);
    }
  };

  const closePreviewModal = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current?.getTracks()?.forEach((t) => t?.stop());
      previewStreamRef.current = null;
    }
    setOpenPreview(false);
    setProducers({ audio: null, video: null });
    setMicOn(true);
    setCameraOn(true);
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

  const formatCountdown = (duration) => {
    const days = duration.days();
    const hours = duration.hours();
    const minutes = duration.minutes();
    const seconds = duration.seconds();
    let parts = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} min`);
    if (seconds >= 0) parts.push(`${seconds} sec`);
    return parts.join(' ');
  };

  const goToBack = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (hasLeft) return; // Prevent double execution
    // Stop media tracks
    if (window.userStream) { // or however you access the stream
      window.userStream.getTracks().forEach(track => track.stop());
      window.userStream = null;
    }
    setHasLeft(true);
    setopenRoom(false);
    sessionStorage.removeItem("userInActiveCall");
    sessionStorage.removeItem("activeCallId");
    const activeCallId = sessionStorage.getItem("activeCallId");
    socketRef.current.emit("BE-leave-room", { roomId: activeCallId, leaver: globalUser.data.user._id });
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("callStatus");

    router.push("/messages");
  };

  const checkActiveCall = async () => {
    try {
      const userStorage = localStorage.getItem('user');
      const token = userStorage ? JSON.parse(userStorage).data?.token : '';

      const response = await fetch(`/api/groups/check-active-call?group_id=${group_id}`, {
        headers: {
          "access-token": token,
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success && data.data && data.data.activeCall) {
        setCallType(data.data.callType);
        setActiveCall(true);
      } else {
        setActiveCall(false);
      }
    } catch (error) {
      console.error("Error checking active call:", error);
    }
  };

  const handelState = (data) => {
    if (data === "close") {
      setopenRoom(false);
    }

  }

  const clickJoinCall = () => {
    const roomName = group_id;
    const userName = user_id;
    setHasLeft(false);

    if (!roomName || !userName) {
    } else {
      sessionStorage.setItem("user", userName);
      sessionStorage.setItem("activeCallId", roomName);
      sessionStorage.setItem("callStatus", 'outgoing');
      sessionStorage.setItem("userInActiveCall", true);
      sessionStorage.setItem("activeCallId", roomName);
      sessionStorage.setItem("fullName", user_name);
      setopenRoom(true);
      onStartCall?.('video', group_id);
      closePreviewModal();

      socketRef.current.emit("BE-check-user", { roomId: roomName, userName, callType: 'video' });
    }
  }


  if (now.isBefore(start)) {
    const duration = moment.duration(start.diff(now));
    return (
      <div style={{ mt: 2, borderRadius: 5, backgroundColor: theme.palette.mode === 'dark' ? '#1e3a5f' : '#e3f2fd', padding: 10, color: theme.palette.mode === 'dark' ? '#fff' : '#1565c0', border: theme.palette.mode === 'dark' ? '1px solid #2d4a6b' : '1px solid #90caf9' }}>
        <Typography variant="body1" fontWeight="medium">
          ⏳ Meeting hasn't started yet — Starts in {formatCountdown(duration)}
        </Typography>
      </div>
    );
  }

  if (now.isBetween(start, end)) {
    const duration = moment.duration(end.diff(now));
    return (
      <>
        <Paper
          elevation={3}
          sx={{
            my: 3,
            px: 2,
            backgroundColor: theme.palette.mode === 'dark' ? '#1a237e' : '#f2f2f2',
            borderRadius: 1,
            border: theme.palette.mode === 'dark' ? '1px solid #3f51b5' : '1px solid #9fa8da',

          }}
        >
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }} >
            {/* Call Button */}
            <Box display="flex" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                ⏱
              </Typography>
              <Typography variant="body2" color="text.secondary" ml={1}>
                Meeting ends in {formatCountdown(duration)}
              </Typography>
            </Box>


            <>

              {activeCall ? (
                <Box >
                  <span onClick={openPreviewModal} style={{
                    color: '#4caf50', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap', animation: 'colorchange 1.5s infinite alternate;',
                    '@keyframes colorchange': {
                      '0%': { color: 'rgba(76, 175, 80, 1)' },
                      '50%': { color: 'rgba(76, 175, 80, 0)' },
                      '100%': { color: 'rgba(76, 175, 80, 0)' },
                    },
                  }}>Join Call</span>
                </Box>
              ) : (<></>)}

            </>



            {/* Meeting countdown text with icon */}

          </Box>
        </Paper>

        {/* Preview Modal */}
        <Modal open={openPreview} onClose={closePreviewModal}>
          <Box
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              bgcolor: "#ffffff",
              p: 3,
              borderRadius: "8px",
              width: 500,
              textAlign: "center",
            }}
          >
            <Typography variant="h6" sx={{ mb: 2, color: "#2d3748", fontWeight: 700 }}>
              Meeting Preview
            </Typography>

            <Paper
              elevation={3}
              sx={{
                width: "100%",
                height: 250,
                bgcolor: "#000",
                position: "relative",
                borderRadius: "8px",
                overflow: "hidden",
                mb: 2
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

            {/* Controls */}
            {/* <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 2 }}>
              <IconButton
                onClick={toggleMic}
                sx={{
                  bgcolor: micOn ? '#4caf50' : '#f44336',
                  color: '#fff',
                  '&:hover': { bgcolor: micOn ? '#45a049' : '#e53935' }
                }}
              >
                {micOn ? <MicIcon /> : <MicOffIcon />}
              </IconButton>
              <IconButton
                onClick={toggleCamera}
                sx={{
                  bgcolor: cameraOn ? '#4caf50 !important' : '#f44336 !important',
                  color: '#fff',
                  '&:hover': { bgcolor: cameraOn ? '#45a049' : '#e53935' }
                }}
              >
                {cameraOn ? <VideocamIcon /> : <VideocamOffIcon />}
              </IconButton>
            </Box> */}

            <Button
              variant="contained"
              color="primary"
              fullWidth
              startIcon={<CallIcon />}
              onClick={clickJoinCall}
              sx={{
                backgroundColor: "#f37e20 !important",
                color: "white",
                borderRadius: "30px",
                py: 1.5,
                fontSize: '16px',
                fontWeight: 700,
                '&:hover': { backgroundColor: "#e06d10" }
              }}
            >
              {activeCall ? "Join Meeting" : "Start Meeting"}
            </Button>
          </Box>
        </Modal>

        {/* Render the Room when user joins */}
        {openRoom && (
          <Room
            roomId={group_id}
            userId={user_id}
            socketRef={socketRef}
            callType={callType}
            onClose={() => handelState("close")}
          />
        )}
      </>
    );
  }

  return (
    <Alert severity="error" sx={{ mt: 2, borderRadius: 2, backgroundColor: theme.palette.mode === 'dark' ? '#1a237e' : '#f2f2f2', border: theme.palette.mode === 'dark' ? '1px solid #f37e20' : '1px solid #f37e20' }}>
      <Typography variant="body1" fontWeight="medium">
        📴 Meeting has ended
      </Typography>
    </Alert>
  );
};

export default MeetingStatusBanner;
