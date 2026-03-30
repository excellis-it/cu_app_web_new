import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import moment from 'moment';
import axios from 'axios';
import { io } from "socket.io-client";
import Room from "../../../components/room";
import {
    Button,
    Modal,
    Box,
    Paper,
    Avatar,
    IconButton,
} from "@mui/material";
import {
    Mic as MicIcon,
    MicOff as MicOffIcon,
    Videocam as VideocamIcon,
    VideocamOff as VideocamOffIcon,
    Call as CallIcon,
    KeyboardArrowDown as KeyboardArrowDownIcon
} from "@mui/icons-material";
import { useAppContext } from '../../../appContext/appContext';
import { toast } from 'react-toastify';
import stylesPlanning from "../../styles/planning.module.css";


const GuestJoinButton = ({ startTime, endTime, onJoin }) => {
    const [timeLeft, setTimeLeft] = useState(null);
    const [status, setStatus] = useState('loading');

    useEffect(() => {
        const calculateStatus = () => {
            const now = moment();
            const start = moment(startTime);
            const end = moment(endTime);

            if (now.isAfter(end)) {
                setStatus('expired');
                setTimeLeft(null);
                return;
            }

            if (now.isBefore(start)) {
                setStatus('upcoming');
                const diff = start.diff(now);
                const duration = moment.duration(diff);
                const hours = Math.floor(duration.asHours());
                const minutes = duration.minutes();
                const seconds = duration.seconds();

                let timeString = '';
                if (hours > 0) timeString += `${hours}h `;
                if (minutes > 0 || hours > 0) timeString += `${minutes}m `;
                timeString += `${seconds}s`;

                setTimeLeft(timeString);
                return;
            }

            setStatus('active');
            setTimeLeft(null);
        };

        calculateStatus();
        const timer = setInterval(calculateStatus, 1000);
        return () => clearInterval(timer);
    }, [startTime, endTime]);

    if (status === 'expired') {
        return (
            <button style={{ ...styles.joinButton, background: '#e53935', cursor: 'not-allowed', opacity: 0.7 }} disabled>
                Meeting Expired
            </button>
        );
    }

    if (status === 'upcoming') {
        return (
            <button style={{ ...styles.joinButton, background: '#757575', cursor: 'not-allowed', opacity: 0.8 }} disabled>
                Starts in {timeLeft}
            </button>
        );
    }

    // Active
    return (
        <button style={styles.joinButton} onClick={onJoin}>
            🚀 Join Meeting
        </button>
    );
};

export default function GuestMeeting() {
    const router = useRouter();
    const { pin } = router.query;
    const [meeting, setMeeting] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pinInput, setPinInput] = useState("");
    const [emailInput, setEmailInput] = useState("");

    // Join Flow State
    const [showPreview, setShowPreview] = useState(false);
    const [stream, setStream] = useState(null);
    const [micOn, setMicOn] = useState(true);
    const [cameraOn, setCameraOn] = useState(true);
    const [openRoom, setOpenRoom] = useState(false);
    const [guestName, setGuestName] = useState("");
    const { globalUser } = useAppContext();

    // Chat Related States
    const [message, setMessage] = useState("");
    const [modifiedMsgs, setModifiedMsgs] = useState([]);
    const [allMessages, setALLmessages] = useState([]);
    const [sendLoading, setSendLoading] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [typingUser, setTypingUser] = useState("");
    const messagesEndRef = useRef(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState("");
    const [Uploadstatus, setUploadstatus] = useState(false);
    const [skip, setSkip] = useState(0);
    const [delayLodar, setDelayLodar] = useState(false);
    const [lastElement, setLastElement] = useState(null);
    const [rplyMsg, setRplyMsg] = useState(null);

    const localVideoRef = useRef(null);
    const socketRef = useRef();

    useEffect(() => {
        if (router.isReady) {
            if (pin) {
                setPinInput();
                // Optional: Auto-fetch if PIN is in URL, or let user click verify?
                // User requirement: "pin willbe put by user manually then verify"
                // This usually implies forcing the verify step even if auto-filled, 
                // OR not auto-filling at all. 
                // I will auto-fill but NOT auto-fetch, forcing the user to click "Verify".
                setLoading(false);
            } else {
                setLoading(false);
            }
        }
    }, [router.isReady, pin]);

    const fetchMeetingDetails = async () => {
        if (!pinInput) {
            setError("Please enter a meeting PIN");
            return;
        }

        try {
            setLoading(true);
            // Use Next.js proxy path instead of direct backend URL for production compatibility
            const response = await axios.get(`/api/groups/guest-meeting?pin=${pinInput}&email=${emailInput}`);
            console.log(response.data);
            if (response.data?.success) {
                setMeeting(response.data?.data);
                setGuestName(response.data?.data?.guest.filter((item) => item.email === emailInput)[0].name || "");
                setError(null);
            } else {
                setError('Meeting not found. Please try again.');
                setMeeting(null);
            }
        } catch (err) {
            setError('Meeting not found. Please try again.');
            setMeeting(null);
        } finally {
            setLoading(false);
        }
    };

    const scrollTobottom = () => {
        const el = document.getElementById("message_body_wrapper");
        if (el) {
            requestAnimationFrame(() => {
                el.scrollTo({
                    top: el.scrollHeight,
                    behavior: "smooth"
                });
            });
        }
    };

    const transformMessagesInstant = (messages) => {
        if (!messages || messages.length === 0) return [];

        return messages.map((message) => {
            const currentUserId = globalUser?.data?.user?._id?.toString() || globalUser?.data?._id?.toString() || sessionStorage.getItem("user");
            const msgSenderId = message.senderId?.toString() || message.sender;
            const messageType = (msgSenderId === currentUserId) ? "receiver" : "sender";

            return {
                time: message.timestamp,
                type: messageType,
                textFileType: message?.messageType || message?.type || "text",
                name: message?.senderDataAll?.name || message?.senderName || message?.sender || "Unknown",
                senderId: message?.senderId || message?.sender,
                img: "",
                allRecipients: message?.allRecipients || [],
                message: message?.message || message?.content,
                deliveredTo: message?.deliveredTo || [],
                readBy: message?.readBy || [],
                _id: message?._id,
                forwarded: message?.forwarded,
                replyOf: message?.replyOf,
                fileName: message?.fileName,
            };
        });
    };

    const getMsg = async (groupId = meeting?._id) => {
        if (!groupId) return;

        try {
            setDelayLodar(true);
            const res = await axios.get(`/api/groups/get-guest-messages`, {
                params: { meetingId: groupId }
            });

            if (res.data?.success) {
                const rawMessages = res.data.data || [];
                const formattedMessages = rawMessages.map(m => ({
                    _id: m._id,
                    senderId: m.senderId || m.sender || "Unknown",
                    senderName: m.senderName || m.sender,
                    message: m.content,
                    messageType: m.type,
                    timestamp: m.createdAt,
                    allRecipients: [],
                    deliveredTo: [],
                    readBy: []
                }));

                const transformed = transformMessagesInstant(formattedMessages);
                setALLmessages(formattedMessages);
                setModifiedMsgs(transformed);
                setSkip(formattedMessages.length);
                if (transformed.length > 0) {
                    setLastElement(transformed[transformed.length - 1]);
                }
                setTimeout(() => scrollTobottom(), 100);
            }
        } catch (error) {
            console.error('Error fetching guest messages:', error);
        } finally {
            setDelayLodar(false);
        }
    };

    const handleTyping = () => {
        if (socketRef.current && meeting) {
            socketRef.current.emit("typing", {
                groupId: meeting._id,
                userName: guestName || sessionStorage.getItem("fullName"),
                isTyping: true
            });
        }
    };

    const sendMessage = async (formData, msgtype, msgTxt) => {
        if (!meeting) return;
        setSendLoading(true);

        const config = {
            headers: {
                "Content-Type": formData instanceof FormData ? "multipart/form-data" : "application/json",
            }
        };

        try {
            let res;
            if (msgtype === "text") {
                const payload = {
                    meetingId: meeting._id,
                    sender: globalUser?.data?.user?.email || sessionStorage.getItem("user") || "Guest",
                    senderId: globalUser?.data?.user?._id || sessionStorage.getItem("user") || "",
                    senderName: guestName || sessionStorage.getItem("fullName") || "Guest",
                    content: msgTxt,
                    type: "text"
                };
                res = await axios.post(`/api/groups/add-guest-message`, payload, config);
            } else {
                formData.append("meetingId", meeting._id);
                formData.append("sender", globalUser?.data?.user?.email || sessionStorage.getItem("user") || "Guest");
                formData.append("senderId", globalUser?.data?.user?._id || sessionStorage.getItem("user") || "");
                formData.append("senderName", guestName || sessionStorage.getItem("fullName") || "Guest");
                formData.append("content", "file");
                formData.append("type", msgtype === "image" ? "image" : "file");
                res = await axios.post(`/api/groups/add-guest-message`, formData, config);
            }

            if (res.data?.success) {
                setMessage("");
                const newMsg = res.data.data.data;

                // Emit via socket
                if (socketRef.current) {
                    socketRef.current.emit("message", {
                        _id: newMsg._id,
                        meetingId: meeting._id,
                        isGuestMeeting: true
                    });
                }

                // Update local state immediately
                const formatted = {
                    _id: newMsg._id,
                    senderId: newMsg.senderId || newMsg.sender,
                    senderName: newMsg.senderName || newMsg.sender,
                    message: newMsg.content,
                    messageType: newMsg.type,
                    timestamp: newMsg.createdAt,
                    allRecipients: [],
                    deliveredTo: [],
                    readBy: []
                };

                setALLmessages(prev => [...prev, formatted]);
                setModifiedMsgs(prev => [...prev, ...transformMessagesInstant([formatted])]);
                setTimeout(() => scrollTobottom(), 50);
            }
        } catch (error) {
            console.error("Error sending guest message:", error);
            toast.error("Failed to send message");
        } finally {
            setSendLoading(false);
        }
    };

    const uploadFile = async (e) => {
        if (e) {
            const maxSizeInBytes = 100 * 1024 * 1024; // 100MB
            if (e.size > maxSizeInBytes) {
                toast.error("File size exceeds 100MB limit");
                return;
            }

            let type = "doc";
            if (e.type.startsWith("image/")) {
                type = "image";
            } else if (e.type.startsWith("video/")) {
                type = "video";
            }

            const formData = new FormData();
            formData.append("file", e);

            sendMessage(formData, type, message);

            // Clear inputs
            const ids = ["file-input", "file-input-image", "file-input-pdf", "file-input-image-2", "file-input-pdf-2"];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = null;
            });
        }
    };

    const now = moment();

    const handleJoinClick = async () => {
        setShowPreview(true);
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasVideo = devices.some((d) => d.kind === "videoinput");
            const hasAudio = devices.some((d) => d.kind === "audioinput");

            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: hasVideo,
                audio: hasAudio,
            });
            setStream(mediaStream);
        } catch (err) {
            console.error("Error accessing media devices:", err);
            alert("Could not access camera or microphone. Please allow permissions.");
        }
    };

    useEffect(() => {
        if (showPreview && stream && localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
        }
    }, [showPreview, stream]);

    const toggleMic = () => {
        if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setMicOn(audioTrack.enabled);
            }
        }
    };

    const toggleCamera = () => {
        if (stream) {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setCameraOn(videoTrack.enabled);
            }
        }
    };

    const handleStartCall = () => {
        if (!meeting) return;

        const baseUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:10018';
        socketRef.current = io(baseUrl);

        // Save guest details to sessionStorage as expected by Room component
        sessionStorage.setItem("user", meeting.guest.filter((item) => item.email === emailInput)[0].email || `${emailInput}`);
        sessionStorage.setItem("fullName", guestName || meeting.guest.filter((item) => item.email === emailInput)[0].name);
        sessionStorage.setItem("callStatus", "incoming");
        sessionStorage.setItem("isGuestMeeting", "true");

        // Socket Listeners for Chat
        socketRef.current.on("message", (msgdata) => {
            const msg = msgdata.data;
            if (msg.meetingId === meeting._id) {
                const transformed = transformMessagesInstant([msg]);
                setModifiedMsgs(prev => {
                    // Prevent duplicates
                    if (prev.find(m => m._id === msg._id)) return prev;
                    return [...prev, ...transformed];
                });
                setALLmessages(prev => {
                    if (prev.find(m => m._id === msg._id)) return prev;
                    return [...prev, msg];
                });
                setTimeout(() => scrollTobottom(), 50);
            }
        });

        socketRef.current.on("typing", (data) => {
            if (data.groupId === meeting._id && data.userName !== (guestName || sessionStorage.getItem("fullName"))) {
                setIsTyping(data.isTyping);
                setTypingUser(data.userName);
                // Clear typing indicator after 3 seconds
                setTimeout(() => setIsTyping(false), 3000);
            }
        });

        // Fetch initial messages
        getMsg(meeting._id);

        // Stop preview stream tracks to release device for Room component
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        setShowPreview(false);
        setOpenRoom(true);
    };

    if (openRoom && meeting) {
        return (
            <Room
                room_id={meeting._id}
                user_name={emailInput}
                socketRef={socketRef}
                callType="video"
                isGuestMeeting={true}
                joinEvent="BE-join-guest-room"
                leaveEvent="BE-leave-guest-room"
                chatAreaProps={{
                    selected: {
                        ...meeting,
                        _id: meeting._id,
                        isGuestMeeting: true,
                        isTemp: true,
                        meetingStartTime: meeting.startTime,
                        meetingEndTime: meeting.endTime
                    },
                    isTyping,
                    typingUser,
                    groupDataDetails: meeting,
                    globalUser: globalUser || { data: { user: { _id: meeting.guestEmail || sessionStorage.getItem("user"), name: guestName || sessionStorage.getItem("fullName"), email: meeting.guestEmail || sessionStorage.getItem("user") } } },
                    socketRef,
                    modifiedMsgs,
                    message,
                    setMessage,
                    sendMessage,
                    handleTyping,
                    sendLoading,
                    Uploadstatus,
                    progress,
                    status,
                    messagesEndRef,
                    handleScrollToBottom: scrollTobottom,
                    rplyMsg,
                    setRplyMsg,
                    uploadFile,
                    now,
                    sendLoading,
                    setSendLoading,
                    styles: stylesPlanning,
                    onBack: () => setOpenRoom(false)
                }}
                onSendData={(data) => {
                    if (data === "close") {
                        window.location.reload();
                    }
                }}
            />
        );
    }

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <h1 style={styles.title}>Loading...</h1>
                    <div style={styles.loader}></div>
                </div>
            </div>
        );
    }

    // Manual Entry Form (Show if no meeting loaded yet)
    if (!meeting) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.header}>
                        <h1 style={styles.headerTitle}>Join a Meeting</h1>
                    </div>
                    <div style={styles.content}>
                        <p style={styles.text}>Enter your meeting Details to join.</p>

                        <div style={{ marginBottom: '20px' }}>
                            <input
                                type="text"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                placeholder="Enter Invite Your Email"
                                style={styles.input}
                                autoComplete="off"
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <input
                                type="text"
                                value={pinInput}
                                onChange={(e) => setPinInput(e.target.value)}
                                placeholder="Enter Meeting PIN"
                                style={styles.input}
                                autoComplete="off"
                            />
                        </div>

                        {error && <p style={styles.error}>{error}</p>}

                        <button style={styles.joinButton} onClick={fetchMeetingDetails}>
                            Verify
                        </button>

                        <button
                            style={{ ...styles.button, background: 'transparent', color: '#666', marginTop: '10px' }}
                            onClick={() => router.push('/')}
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Meeting Details View
    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.header}>
                    <h1 style={styles.headerTitle}>📅 Meeting Invitation</h1>
                </div>

                <div style={styles.content}>
                    <h2 style={styles.topic}>{meeting.topic}</h2>

                    {meeting.description && (
                        <div style={styles.section}>
                            <p style={styles.label}>Description</p>
                            <p style={styles.value}>{meeting.description}</p>
                        </div>
                    )}

                    <div style={styles.section}>
                        <p style={styles.label}>🗓️ Start Time</p>
                        <p style={styles.value}>
                            {new Date(meeting.startTime).toLocaleString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </p>
                    </div>

                    <div style={styles.section}>
                        <p style={styles.label}>⏰ End Time</p>
                        <p style={styles.value}>
                            {new Date(meeting.endTime).toLocaleString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </p>
                    </div>

                    <div style={styles.section}>
                        <p style={styles.label}>🔑 Meeting PIN</p>
                        <p style={styles.pin}>{meeting.pin}</p>
                    </div>

                    <GuestJoinButton
                        startTime={meeting.startTime}
                        endTime={meeting.endTime}
                        onJoin={handleJoinClick}
                    />

                    <p style={styles.footer}>
                        Invited by: <strong>{meeting.hostName || 'ExTalk User'}</strong>
                    </p>
                </div>
            </div>

            {/* Preview Modal */}
            <Modal open={showPreview} onClose={() => setShowPreview(false)}>
                <Box
                    sx={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        bgcolor: "#ffffff",
                        p: 3,
                        borderRadius: "8px",
                        maxWidth: 500,
                        width: "95%",
                        textAlign: "center",
                        outline: "none"
                    }}
                >
                    <h2 style={{ marginBottom: '20px', color: '#333' }}>Ready to Join?</h2>
                    <Paper
                        elevation={3}
                        sx={{
                            width: "100%",
                            height: 300,
                            bgcolor: "#000",
                            position: "relative",
                            borderRadius: "8px",
                            overflow: "hidden",
                            marginBottom: '20px'
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
                                    bgcolor: "#222",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <Avatar sx={{ width: 80, height: 80, bgcolor: "#555" }}>
                                    <VideocamOffIcon sx={{ fontSize: 40 }} />
                                </Avatar>
                            </Box>
                        )}
                    </Paper>

                    <Box sx={{ display: "flex", justifyContent: "center", gap: 2, marginBottom: "20px" }}>
                        <IconButton
                            onClick={toggleMic}
                            sx={{
                                bgcolor: micOn ? "#1da678" : "#d32f2f",
                                color: "white",
                                "&:hover": { bgcolor: micOn ? "#d86b16" : "#b71c1c" }
                            }}
                        >
                            {micOn ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>
                        <IconButton
                            onClick={toggleCamera}
                            sx={{
                                bgcolor: cameraOn ? "#1da678" : "#d32f2f",
                                color: "white",
                                "&:hover": { bgcolor: cameraOn ? "#d86b16" : "#b71c1c" }
                            }}
                        >
                            {cameraOn ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                    </Box>

                    <Button
                        variant="contained"
                        onClick={handleStartCall}
                        fullWidth
                        sx={{
                            background: 'linear-gradient(135deg, #1da678 0%, #ad1e23 100%)',
                            color: "white",
                            padding: "12px",
                            fontSize: "16px",
                            fontWeight: "bold",
                            borderRadius: "6px",
                            textTransform: "none"
                        }}
                    >
                        Join Now
                    </Button>
                </Box>
            </Modal>
        </div>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f4f4f4',
        padding: '20px',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    },
    card: {
        maxWidth: '600px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        overflow: 'hidden',
    },
    header: {
        background: 'linear-gradient(135deg, #1da678 0%, #ad1e23 100%)',
        padding: '40px 30px',
        textAlign: 'center',
    },
    headerTitle: {
        margin: 0,
        color: '#ffffff',
        fontSize: '28px',
        fontWeight: '600',
    },
    content: {
        padding: '40px 30px',
    },
    topic: {
        margin: '0 0 30px 0',
        color: '#1da678',
        fontSize: '24px',
        fontWeight: '600',
    },
    section: {
        marginBottom: '20px',
    },
    label: {
        margin: '0 0 5px 0',
        color: '#666666',
        fontSize: '14px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    value: {
        margin: 0,
        color: '#333333',
        fontSize: '15px',
        lineHeight: '1.5',
    },
    pin: {
        margin: 0,
        color: '#333333',
        fontSize: '24px',
        fontWeight: '700',
        letterSpacing: '2px',
        fontFamily: "'Courier New', monospace",
    },
    joinButton: {
        width: '100%',
        padding: '16px 40px',
        background: 'linear-gradient(135deg, #1da678 0%, #ad1e23 100%)',
        color: '#ffffff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '16px',
        fontWeight: '600',
        cursor: 'pointer',
        marginTop: '30px',
        boxShadow: '0 4px 12px rgba(243, 126, 32, 0.3)',
        transition: 'transform 0.2s',
    },
    footer: {
        marginTop: '20px',
        fontSize: '14px',
        color: '#666666',
        textAlign: 'center',
    },
    title: {
        color: '#333333',
        fontSize: '24px',
        marginBottom: '20px',
        textAlign: 'center',
    },
    text: {
        color: '#666666',
        fontSize: '16px',
        textAlign: 'center',
        marginBottom: '20px',
    },
    error: {
        color: '#d32f2f',
        fontSize: '16px',
        textAlign: 'center',
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#ffebee',
        borderRadius: '4px',
    },
    button: {
        padding: '12px 30px',
        background: '#1da678',
        color: '#ffffff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '16px',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'block',
        margin: '0 auto',
    },
    loader: {
        border: '4px solid #f3f3f3',
        borderTop: '4px solid #1da678',
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        animation: 'spin 1s linear infinite',
        margin: '20px auto',
    },
    input: {
        width: '100%',
        padding: '15px',
        fontSize: '18px',
        border: '2px solid #ddd',
        borderRadius: '6px',
        textAlign: 'center',
        letterSpacing: '2px',
        transition: 'border-color 0.3s'
    }
};
