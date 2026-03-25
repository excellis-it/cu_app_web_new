import React, { useRef, useEffect, useState } from "react";
import Dropdown from "react-bootstrap/Dropdown";
import InfoIcon from "@mui/icons-material/Info";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import ImageIcon from "@mui/icons-material/Image";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendIcon from "@mui/icons-material/Send";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { TextField, InputAdornment, IconButton, CircularProgress, Box, Tooltip, Button } from "@mui/material";
import moment from "moment";
import MegaMessage from "./MegaMessage";
import CallButton from "./start_call";
import MeetingStatusBanner from "./meetingstatus";
import MeetingActionButton from "./meetingActionButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import GoogleIcon from "@mui/icons-material/Google";
import Swal from 'sweetalert2';
import axios from 'axios';

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
            <Button
                variant="contained"
                disabled
                sx={{
                    borderRadius: '20px',
                    px: 4,
                    py: 1,
                    fontWeight: 700,
                    backgroundColor: '#e53935 !important', // Red
                    color: '#fff !important',
                    opacity: '0.7 !important'
                }}
            >
                Expired
            </Button>
        );
    }

    if (status === 'upcoming') {
        return (
            <Button
                variant="contained"
                disabled
                sx={{
                    borderRadius: '20px',
                    px: 4,
                    py: 1,
                    fontWeight: 700,
                    backgroundColor: '#757575 !important', // Grey
                    color: '#fff !important',
                    opacity: '0.8 !important'
                }}
            >
                Starts in {timeLeft}
            </Button>
        );
    }

    // Active
    return (
        <Button
            variant="contained"
            color="primary"
            sx={{
                borderRadius: '20px',
                px: 4,
                py: 1,
                fontWeight: 700,
                backgroundColor: '#f37e20 !important',
                '&:hover': { backgroundColor: '#e06d10 !important' }
            }}
            onClick={onJoin}
        >
            Join Meeting
        </Button>
    );
};

const ChatArea = ({
    selected,
    isTyping,
    typingUser,
    groupDataDetails,
    globalUser,
    socketRef,
    showRoom,
    setCallType,
    setRoomId,
    setShowRoom,
    setOpenEditModal,
    setOpenReportModal,
    setReportType,
    setOpenDeleteModal,
    now,
    fetchMoreMsg,
    showFetchMsg,
    replyJumpingId,
    modifiedMsgs,
    setDelMsg,
    setFrwdMsg,
    setOpenModalInfo,
    setRplyMsg,
    handleReplyJump,
    showScrollButton,
    handleScrollToBottom,
    messagesEndRef,
    handleScroll,
    Uploadstatus,
    progress,
    status,
    rplyMsg,
    message,
    setMessage,
    handleTyping,
    sendLoading,
    sendMessage,
    setSendLoading,
    uploadFile,
    styles,
    onBack,
    forceChatView = false,
    isMeetingOverlay = false,
}) => {
    // Server time state - synced with backend
    const [serverTime, setServerTime] = useState(null);
    const [serverTimeOffset, setServerTimeOffset] = useState(0);

    // Fetch server time on mount and periodically
    useEffect(() => {
        const fetchServerTime = async () => {
            try {
                const response = await axios.get('/api/server-time');
                if (response.data.success) {
                    const backendTime = moment(response.data.serverTime);
                    const clientTime = moment();
                    const offset = backendTime.diff(clientTime, 'milliseconds');
                    setServerTimeOffset(offset);
                    setServerTime(backendTime);
                }
            } catch (error) {
                console.error('Failed to fetch server time:', error);
                // Fallback to client time
                setServerTime(moment());
                setServerTimeOffset(0);
            }
        };

        fetchServerTime();
        // Refresh server time every 30 seconds
        const interval = setInterval(fetchServerTime, 30000);
        return () => clearInterval(interval);
    }, []);

    // Get current server time (with offset applied to current moment)
    const getServerTime = () => {
        return moment().add(serverTimeOffset, 'milliseconds');
    };

    // Get display name - for direct chats, show the other user's name
    const getDisplayName = () => {
        if (selected?.isDirect) {
            const currentUserId = globalUser?.data?.user?._id;
            const otherUser = selected?.currentUsers?.find(
                user => (user._id || user) !== currentUserId
            );
            return otherUser?.name || selected?.groupName || "Chat";
        }
        return selected?.groupName || "Open a Chat";
    };

    // Get display image for header
    const getDisplayImage = () => {
        if (selected?.isDirect) {
            const currentUserId = globalUser?.data?.user?._id;
            const otherUser = selected?.currentUsers?.find(
                user => (user._id || user) !== currentUserId
            );
            return otherUser?.image || null;
        }
        return selected?.image || null;
    };

    // Get user-friendly meeting status
    const getMeetingStatus = () => {
        const startTime = selected?.isGuestMeeting ? selected?.meetingStartTime : (groupDataDetails?.meetingStartTime || selected?.meetingStartTime);
        const endTime = selected?.isGuestMeeting ? selected?.meetingEndTime : (groupDataDetails?.meetingEndTime || selected?.meetingEndTime);

        // Use actual start/end times if available
        const actualStartTime = selected?.isGuestMeeting ? selected?.startedAt : (groupDataDetails?.startedAt || selected?.startedAt);
        const actualEndTime = selected?.isGuestMeeting ? selected?.endedAt : (groupDataDetails?.endedAt || selected?.endedAt);

        const now = getServerTime(); // Use server time instead of client time
        const start = moment(startTime);
        const end = moment(endTime);

        // Calculate duration - strictly use actual times (startedAt / endedAt)
        let durationMinutes = 0;
        let durationText = '';

        if (actualStartTime && actualEndTime) {
            // Use actual meeting duration
            const actualStart = moment(actualStartTime);
            const actualEnd = moment(actualEndTime);
            if (actualStart.isValid() && actualEnd.isValid()) {
                durationMinutes = actualEnd.diff(actualStart, 'minutes');

                // Ensure duration is positive
                durationMinutes = Math.max(0, durationMinutes);

                const durationHours = Math.floor(durationMinutes / 60);
                const remainingMinutes = durationMinutes % 60;
                durationText = durationHours > 0
                    ? `${durationHours}h ${remainingMinutes}m`
                    : `${remainingMinutes}m`;
            }
        }

        // Determine meeting state
        // A meeting has started if we have an actual start time
        const hasStarted = !!actualStartTime;
        // A meeting has ended if we have an actual end time
        const hasEnded = !!actualEndTime;

        // Fallback for display state if actual times are missing but current time is past scheduled times
        // This is purely for determining if we should show "Starts..." or "Ended" status, not for duration calc
        const isPastScheduledEnd = now.isAfter(end);
        const isPastScheduledStart = now.isAfter(start);

        if (!hasStarted && !isPastScheduledStart) {
            // Meeting hasn't started yet and it's before scheduled start
            return {
                text: `Starts ${start.fromNow()}`,
                color: '#f37e20',
                bgColor: 'rgba(243, 126, 32, 0.08)',
                borderColor: 'rgba(243, 126, 32, 0.3)',
                dotColor: '#f37e20',
                animate: true
            };
        } else if ((hasStarted && !hasEnded) || (!hasStarted && isPastScheduledStart && !isPastScheduledEnd)) {
            // Meeting is in progress OR it should have started but we don't have actual times yet
            // If we have actual start time, calculate elapsed
            const startedMoment = hasStarted ? moment(actualStartTime) : start;
            const elapsed = now.diff(startedMoment, 'minutes');

            return {
                text: `Meeting in progress • Started ${startedMoment.fromNow()} • ${elapsed}m elapsed`,
                color: '#16a34a',
                bgColor: 'rgba(22, 163, 74, 0.08)',
                borderColor: 'rgba(22, 163, 74, 0.3)',
                dotColor: '#16a34a',
                animate: true
            };
        } else {
            // Meeting has ended
            const endedMoment = hasEnded ? moment(actualEndTime) : end;

            // Only show duration if we calculated it from actual times
            const durationDisplay = durationText ? ` • Duration: ${durationText}` : '';

            return {
                text: `Meeting ended${durationDisplay} • Ended ${endedMoment.fromNow()}`,
                color: '#64748b',
                bgColor: 'rgba(100, 116, 139, 0.08)',
                borderColor: 'rgba(100, 116, 139, 0.3)',
                dotColor: '#64748b',
                animate: false
            };
        }
    };

    // Check if meeting has ended
    const isMeetingEnded = () => {
        const actualEndTime = selected?.isGuestMeeting ? selected?.endedAt : (groupDataDetails?.endedAt || selected?.endedAt);
        const endTime = selected?.isGuestMeeting ? selected?.meetingEndTime : (groupDataDetails?.meetingEndTime || selected?.meetingEndTime);
        const now = getServerTime();

        // Meeting has ended if there's an actual end time or current time is past scheduled end
        return !!actualEndTime || (endTime && moment(now).isAfter(moment(endTime)));
    };

    const displayName = selected ? getDisplayName() : "Open a Chat";
    const displayImage = getDisplayImage();

    const handleCopyLink = (e) => {
        if (e) e.stopPropagation();
        const startTime = moment(selected?.meetingStartTime).format('MM/DD/YYYY hh:mm A');
        const copyText = ` join the meeting ..
            time: ${startTime}
            link: ${selected?.link || ''}
            pin: ${selected?.pin || ''}
        `;
        navigator.clipboard.writeText(copyText).then(() => {
            Swal.fire({
                // icon: 'success',
                title: 'Copied!',
                text: 'Meeting details copied to clipboard',
                timer: 1500,
                showConfirmButton: false,
                width: '300px'
            });
        });
    };

    return (
        <div className="messagedivbody" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {!isMeetingOverlay && (
                <div className="messagedivhead">
                    <div className="messagedivheadnameOnline d-flex align-items-center">
                        {onBack && (
                            <IconButton
                                onClick={onBack}
                                className="d-md-none"
                                style={{
                                    marginRight: '8px',
                                    color: '#64779a',
                                    padding: '8px'
                                }}
                                aria-label="Back to chat list"
                            >
                                <ArrowBackIcon />
                            </IconButton>
                        )}
                        <div className="user_img_se">
                            {selected?.isGoogleEvent ? (
                                <div className="imgmessagediv" style={{ background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <GoogleIcon sx={{ color: '#4285F4', fontSize: '24px' }} />
                                </div>
                            ) : displayImage ? (
                                <img src={displayImage} alt="Chat" />
                            ) : (
                                <div className="imgmessagediv">
                                    {displayName?.substring(0, 1) || "?"}
                                </div>
                            )}
                        </div>
                        <div className="messageheadname">
                            <span className="membername">
                                {selected?.isGoogleEvent && <GoogleIcon sx={{ fontSize: '18px', color: '#4285F4' }} />}
                                {displayName}
                            </span>
                            <span className="memberonline">
                                {isTyping ? (
                                    <span style={{ color: "#000" }}>
                                        {typingUser} is typing...
                                    </span>
                                ) : (
                                    <span>
                                        {/* For direct chats, don't show member list */}
                                        {selected?.isDirect ? "" : (selected?.isGoogleEvent ? (selected?.isHoliday ? "Public Holiday" : "Google Calendar Event") : groupDataDetails?.currentUsers
                                            ?.map((usr) => {
                                                if (
                                                    usr.userType !== "SuperAdmin" ||
                                                    globalUser?.data?.user?.userType === "SuperAdmin"
                                                ) {
                                                    return usr.name.substring(0, 10);
                                                }
                                                return null;
                                            })
                                            .filter(Boolean)
                                            .join(","))}
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                    <div>
                        {/* Call button for regular chats - check both currentUsersId and currentUsers for membership */}
                        {!selected?.isTemp && (
                            selected?.currentUsersId?.includes(globalUser?.data?.user?._id) ||
                            selected?.currentUsers?.some(user => (user._id || user) === globalUser?.data?.user?._id)
                        ) && (
                                <>
                                    {!showRoom && (
                                        <CallButton
                                            user_id={globalUser?.data?.user?._id}
                                            user_name={globalUser?.data?.user?.name}
                                            group_id={selected?._id}
                                            socketRef={socketRef}
                                            onStartCall={(callType, roomId) => {
                                                setCallType(callType);
                                                setRoomId(roomId);
                                                sessionStorage.setItem(
                                                    "userInActiveCall",
                                                    globalUser?.data?.user?._id
                                                );
                                                sessionStorage.setItem("callStatus", "active");
                                                setShowRoom(true);
                                            }}
                                        />
                                    )}
                                </>
                            )}

                        <div className="d-none d-lg-block">
                            {/* Meeting status banner - check both currentUsersId and currentUsers for membership */}
                            {selected?.isTemp && (
                                selected?.currentUsersId?.includes(globalUser?.data?.user?._id) ||
                                selected?.currentUsers?.some(user => (user._id || user) === globalUser?.data?.user?._id)
                            ) && (
                                    <>
                                        {!showRoom && (
                                            <MeetingStatusBanner
                                                selected={selected}
                                                globalUser={globalUser}
                                                socketRef={socketRef}
                                                user_id={globalUser?.data?.user?._id}
                                                group_id={selected?._id}
                                                user_name={globalUser?.data?.user?.name}
                                                isActiveRoom={showRoom}
                                                onStartCall={(callType, roomId) => {
                                                    setRoomId(roomId);
                                                    sessionStorage.setItem(
                                                        "userInActiveCall",
                                                        globalUser?.data?.user?._id
                                                    );
                                                    sessionStorage.setItem("callStatus", "active");
                                                    setShowRoom(true);
                                                    setCallType(callType);
                                                }}

                                            />
                                        )}
                                    </>
                                )}
                        </div>
                    </div>
                    <div className="messagehead3dots">
                        <Dropdown>
                            <Dropdown.Toggle className="dropdown-toggle-info">
                                <InfoIcon style={{ color: "#64779a", fontSize: "30px" }} />
                            </Dropdown.Toggle>

                            <Dropdown.Menu>
                                <Dropdown.Item href="#" onClick={() => setOpenEditModal(true)}>
                                    {selected?.isGuestMeeting ? "Guest Meeting Info" : selected?.isTemp ? "Meeting Info" : selected?.isDirect ? "Personal Information" : "Group Info"}
                                </Dropdown.Item>

                                {(selected?.isTemp || selected?.isGuestMeeting) && !isMeetingEnded() && (
                                    <Dropdown.Item href="#" onClick={handleCopyLink}>
                                        Copy Meeting Link
                                    </Dropdown.Item>
                                )}

                                {!selected?.isDirect && (
                                    <Dropdown.Item
                                        href="#"
                                        onClick={() => {
                                            setOpenReportModal(true);
                                            setReportType("group");
                                        }}
                                    >
                                        {selected?.isTemp || selected?.isGuestMeeting ? "Report Meeting" : "Report Group"}
                                    </Dropdown.Item>
                                )}

                                {["admin", "SuperAdmin"].includes(
                                    globalUser?.data?.user?.userType
                                ) && !selected?.isDirect && (
                                        <Dropdown.Item
                                            href="#"
                                            onClick={() => {
                                                setOpenDeleteModal(true);
                                                setReportType("group");
                                            }}
                                        >
                                            {selected?.isTemp || selected?.isGuestMeeting
                                                ? !now.isBetween(
                                                    moment(selected?.meetingStartTime),
                                                    moment(selected?.meetingEndTime)
                                                ) && "Delete Meeting"
                                                : "Delete Group"}
                                        </Dropdown.Item>
                                    )}
                            </Dropdown.Menu>
                        </Dropdown>
                    </div>
                </div>
            )}
            <div className="d-block d-lg-none">
                {/* Meeting status banner - check both currentUsersId and currentUsers for membership */}
                {selected?.isTemp && (
                    selected?.currentUsersId?.includes(globalUser?.data?.user?._id) ||
                    selected?.currentUsers?.some(user => (user._id || user) === globalUser?.data?.user?._id)
                ) && (
                        <>
                            {!showRoom && (
                                <MeetingStatusBanner
                                    selected={selected}
                                    globalUser={globalUser}
                                    socketRef={socketRef}
                                    user_id={globalUser?.data?.user?._id}
                                    group_id={selected?._id}
                                    user_name={globalUser?.data?.user?.name}
                                    isActiveRoom={showRoom}
                                    onStartCall={(callType, roomId) => {
                                        setRoomId(roomId);
                                        sessionStorage.setItem(
                                            "userInActiveCall",
                                            globalUser?.data?.user?._id
                                        );
                                        sessionStorage.setItem("callStatus", "active");
                                        setShowRoom(true);
                                        setCallType(callType);
                                    }}
                                />
                            )}
                        </>
                    )}
            </div>
            {(!forceChatView && (selected?.isTemp === true || selected?.isGoogleEvent || selected?.isGuestMeeting) &&
                (selected?.isGoogleEvent || selected?.isGuestMeeting || moment(selected?.meetingStartTime) > moment())) ? (
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px 0',
                    background: '#f8fafc',
                    height: '100%'
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #fb923c 0%, #f37e20 100%)',
                        borderRadius: '24px',
                        padding: '1px',
                        maxWidth: '630px',
                        width: '95%',
                        margin: '0 auto',
                        boxShadow: '0 25px 50px -12px rgba(243, 126, 32, 0.4), 0 15px 25px -10px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{
                            background: '#ffffff',
                            borderRadius: '23px',
                            padding: '30px',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            {/* Decorative background element */}
                            <div style={{
                                position: 'absolute',
                                top: '-50px',
                                right: '-50px',
                                width: '200px',
                                height: '200px',
                                background: 'rgba(243, 126, 32, 0.03)',
                                borderRadius: '50%',
                                zIndex: 0
                            }} />

                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '16px',
                                    marginBottom: '28px'
                                }}>
                                    <div style={{
                                        background: 'linear-gradient(135deg, #f37e20, #e06d10)',
                                        width: '52px',
                                        height: '52px',
                                        borderRadius: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 8px 16px rgba(243, 126, 32, 0.25)'
                                    }}>
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                            <line x1="16" y1="2" x2="16" y2="6" />
                                            <line x1="8" y1="2" x2="8" y2="6" />
                                            <line x1="3" y1="10" x2="21" y2="10" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 style={{
                                            fontSize: '28px',
                                            fontWeight: '800',
                                            color: '#1a202c',
                                            margin: 0,
                                            letterSpacing: '-0.5px'
                                        }}>
                                            Meeting Details
                                        </h2>
                                        {!isMeetingEnded() && (
                                            <Tooltip title="Copy Meeting Link" arrow>
                                                <IconButton
                                                    onClick={handleCopyLink}
                                                    sx={{
                                                        bgcolor: 'rgba(243, 126, 32, 0.1)',
                                                        color: '#f37e20',
                                                        '&:hover': { bgcolor: 'rgba(243, 126, 32, 0.2)' }
                                                    }}
                                                >
                                                    <ContentCopyIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                        <p style={{ color: '#718096', margin: '4px 0 0', fontSize: '14px', fontWeight: '500' }}>
                                            Check schedule and participants
                                        </p>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gap: '24px' }}>
                                    {/* Basic Info Section */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                                        <div style={{
                                            background: '#f8fafc',
                                            borderRadius: '16px',
                                            padding: '20px',
                                            border: '1px solid #edf2f7',
                                            transition: 'all 0.3s ease'
                                        }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#f37e20', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                                                Meeting Name
                                            </div>
                                            <div style={{ fontSize: '18px', fontWeight: '700', color: '#2d3748' }}>
                                                {selected?.isGuestMeeting ? (selected?.groupName || selected?.subject || "Guest Meeting") : (groupDataDetails?.groupName || selected?.groupName || selected?.subject || "Guest Meeting")}
                                            </div>
                                        </div>

                                        <div style={{
                                            background: '#f8fafc',
                                            borderRadius: '16px',
                                            padding: '20px',
                                            border: '1px solid #edf2f7'
                                        }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#ad1e23', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                                                Agenda / Description
                                            </div>
                                            <div style={{ fontSize: '15px', color: '#4a5568', lineHeight: '1.6', fontWeight: '400' }}>
                                                {selected?.isGuestMeeting ? (selected?.groupDescription || selected?.description || "No description provided for this meeting.") : (groupDataDetails?.groupDescription || selected?.groupDescription || selected?.description || "No description provided for this meeting.")}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Participants Section */}
                                    {!selected?.isGoogleEvent && !selected?.isGuestMeeting && (
                                        <div style={{
                                            background: '#f8fafc',
                                            borderRadius: '16px',
                                            padding: '20px',
                                            border: '1px solid #edf2f7'
                                        }}>
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: '16px'
                                            }}>
                                                <div style={{ fontSize: '11px', fontWeight: '700', color: '#f37e20', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                                    Participants ({groupDataDetails?.currentUsers?.filter(user => user?.userType !== "SuperAdmin").length || 0})
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                                {groupDataDetails?.currentUsers
                                                    ?.filter(user => user?.userType !== "SuperAdmin")
                                                    .map((user, index) => {
                                                        const userAction = groupDataDetails.participantActions?.find(
                                                            (action) => String(action.userId) === String(user._id)
                                                        );
                                                        const isAccepted = userAction?.action === 'accept';
                                                        const isRejected = userAction?.action === 'reject';

                                                        return (
                                                            <Tooltip
                                                                key={index}
                                                                title={
                                                                    userAction ? (
                                                                        <Box sx={{ p: 0.5 }}>
                                                                            <div style={{ fontWeight: 700, marginBottom: '2px' }}>
                                                                                {userAction.action === 'accept' ? 'Accepted' : 'Rejected'}
                                                                            </div>
                                                                            <div style={{ fontSize: '11px', opacity: 0.9 }}>
                                                                                {moment(userAction.actionTime || userAction.createdAt).format('MMM DD, YYYY hh:mm A')}
                                                                            </div>
                                                                            {userAction.actionDescription && (
                                                                                <div style={{ marginTop: '8px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: '12px', fontStyle: 'italic' }}>
                                                                                    "{userAction.actionDescription}"
                                                                                </div>
                                                                            )}
                                                                        </Box>
                                                                    ) : 'No response yet'
                                                                }
                                                                arrow
                                                                placement="top"
                                                            >
                                                                <div style={{
                                                                    background: isAccepted ? 'rgba(76, 175, 80, 0.1)' : isRejected ? 'rgba(244, 67, 54, 0.1)' : '#ffffff',
                                                                    border: `1.5px solid ${isAccepted ? '#4caf50' : isRejected ? '#f44336' : '#e2e8f0'}`,
                                                                    padding: '6px 14px',
                                                                    borderRadius: '12px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '8px',
                                                                    transition: 'all 0.2s ease',
                                                                    cursor: userAction ? 'help' : 'default'
                                                                }}>
                                                                    <div style={{
                                                                        width: '24px',
                                                                        height: '24px',
                                                                        borderRadius: '50%',
                                                                        background: isAccepted ? '#4caf50' : isRejected ? '#f44336' : '#cbd5e0',
                                                                        color: '#fff',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontSize: '10px',
                                                                        fontWeight: '700'
                                                                    }}>
                                                                        {user?.name?.charAt(0).toUpperCase()}
                                                                    </div>
                                                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#2d3748' }}>
                                                                        {user?.name}
                                                                    </span>
                                                                    {userAction && (
                                                                        <div style={{
                                                                            width: '6px',
                                                                            height: '6px',
                                                                            borderRadius: '50%',
                                                                            background: isAccepted ? '#4caf50' : '#f44336'
                                                                        }} />
                                                                    )}
                                                                </div>
                                                            </Tooltip>
                                                        );
                                                    })
                                                }
                                            </div>
                                        </div>
                                    )}

                                    {/* Guest Info Section - Styled as Participants */}
                                    {selected?.isGuestMeeting && (
                                        <div style={{
                                            background: '#f8fafc',
                                            borderRadius: '16px',
                                            padding: '20px',
                                            border: '1px solid #edf2f7'
                                        }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#f37e20', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
                                                Guest Participants ({selected?.guest?.length || 0})
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                                {/* Map through all guests */}
                                                {(selected?.guest && selected.guest.length > 0) ? (
                                                    selected.guest.map((guest, index) => (
                                                        <div key={index} style={{
                                                            background: '#ffffff',
                                                            border: '1.5px solid #e2e8f0',
                                                            padding: '6px 14px',
                                                            borderRadius: '12px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '12px',
                                                            minWidth: '200px'
                                                        }}>
                                                            <div style={{
                                                                width: '32px',
                                                                height: '32px',
                                                                borderRadius: '50%',
                                                                background: '#f37e20',
                                                                color: '#fff',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: '14px',
                                                                fontWeight: '700'
                                                            }}>
                                                                {(guest?.name || "G").charAt(0).toUpperCase()}
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span style={{ fontSize: '14px', fontWeight: '600', color: '#2d3748' }}>
                                                                    {guest?.name || "Guest"}
                                                                </span>
                                                                <span style={{ fontSize: '12px', color: '#718096' }}>
                                                                    {guest?.email || "No Email"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div style={{ color: '#718096', fontSize: '14px' }}>
                                                        No guests added
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Schedule Section */}
                                    <div style={{
                                        background: 'linear-gradient(to right, #ffffff, #f8fafc)',
                                        borderRadius: '20px',
                                        padding: '24px',
                                        border: '1px solid #edf2f7',
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '24px',
                                        position: 'relative'
                                    }}>
                                        <div style={{
                                            position: 'absolute',
                                            top: '50%',
                                            left: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            width: '1px',
                                            height: '40px',
                                            background: '#e2e8f0',
                                            display: 'block'
                                        }} />

                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '11px', fontWeight: '800', color: '#718096', textTransform: 'uppercase', marginBottom: '12px' }}>
                                                Start Time
                                            </div>
                                            <div style={{ fontSize: '14px', color: '#4a5568', fontWeight: '500' }}>
                                                {moment(selected?.isGuestMeeting ? selected?.meetingStartTime : (groupDataDetails?.meetingStartTime || selected?.meetingStartTime)).format("ddd, MMM DD")}
                                            </div>
                                            <div style={{ fontSize: '24px', fontWeight: '800', color: '#f37e20', marginTop: '4px' }}>
                                                {moment(selected?.isGuestMeeting ? selected?.meetingStartTime : (groupDataDetails?.meetingStartTime || selected?.meetingStartTime)).format("hh:mm A")}
                                            </div>
                                        </div>

                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '11px', fontWeight: '800', color: '#718096', textTransform: 'uppercase', marginBottom: '12px' }}>
                                                End Time
                                            </div>
                                            <div style={{ fontSize: '14px', color: '#4a5568', fontWeight: '500' }}>
                                                {moment(selected?.isGuestMeeting ? selected?.meetingEndTime : (groupDataDetails?.meetingEndTime || selected?.meetingEndTime)).format("ddd, MMM DD")}
                                            </div>
                                            <div style={{ fontSize: '24px', fontWeight: '800', color: '#ad1e23', marginTop: '4px' }}>
                                                {moment(selected?.isGuestMeeting ? selected?.meetingEndTime : (groupDataDetails?.meetingEndTime || selected?.meetingEndTime)).format("hh:mm A")}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status Banner */}
                                    {(() => {
                                        const status = getMeetingStatus();
                                        return (
                                            <div style={{
                                                padding: '16px 24px',
                                                background: status.bgColor,
                                                borderRadius: '16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '12px',
                                                border: `1px dashed ${status.borderColor}`
                                            }}>
                                                <div style={{
                                                    width: '10px',
                                                    height: '10px',
                                                    borderRadius: '50%',
                                                    background: status.dotColor,
                                                    boxShadow: `0 0 0 4px ${status.bgColor}`,
                                                    animation: status.animate ? 'pulse 2s infinite' : 'none'
                                                }} />
                                                <span style={{ fontSize: '15px', color: status.color, fontWeight: '700' }}>
                                                    {status.text}
                                                </span>
                                            </div>
                                        );
                                    })()}

                                    {/* Action Section */}
                                    <div style={{
                                        marginTop: '8px',
                                        paddingTop: '32px',
                                        borderTop: '1px solid #edf2f7',
                                        display: 'flex',
                                        justifyContent: 'center'
                                    }}>
                                        {!selected?.isGoogleEvent && !selected?.isGuestMeeting && (
                                            <MeetingActionButton
                                                meetingId={selected?._id}
                                                initialAction={groupDataDetails?.participantActions?.find(
                                                    action => String(action.userId) === String(globalUser?.data?.user?._id)
                                                )}
                                            />
                                        )}
                                        {selected?.isGuestMeeting && (
                                            <CallButton
                                                user_id={globalUser?.data?.user?._id}
                                                user_name={globalUser?.data?.user?.name}
                                                group_id={selected?._id}
                                                socketRef={socketRef}
                                                onStartCall={(callType, roomId) => {
                                                    setCallType(callType);
                                                    setRoomId(roomId);
                                                    sessionStorage.setItem(
                                                        "userInActiveCall",
                                                        globalUser?.data?.user?._id
                                                    );
                                                    sessionStorage.setItem("callStatus", "active");
                                                    sessionStorage.setItem("isGuestMeeting", "true");
                                                    setShowRoom(true);
                                                }}
                                                renderTrigger={({ openVideo }) => (
                                                    <GuestJoinButton
                                                        startTime={selected?.isGuestMeeting ? selected?.meetingStartTime : (groupDataDetails?.meetingStartTime || selected?.meetingStartTime)}
                                                        endTime={selected?.isGuestMeeting ? selected?.meetingEndTime : (groupDataDetails?.meetingEndTime || selected?.meetingEndTime)}
                                                        onJoin={openVideo}
                                                    />
                                                )}
                                            />
                                        )}
                                        {selected?.isGoogleEvent && (
                                            <Button
                                                variant="contained"
                                                startIcon={<GoogleIcon />}
                                                sx={{
                                                    bgcolor: '#4285F4',
                                                    '&:hover': { bgcolor: '#357ae8' },
                                                    borderRadius: '20px',
                                                    px: 4,
                                                    py: 1,
                                                    fontWeight: 700
                                                }}
                                                onClick={() => window.open(selected?.link, '_blank')}
                                            >
                                                Join on Google
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div
                        className="message_body_wrapper"
                        id="message_body_wrapper"
                        onScroll={handleScroll}
                        style={{ flex: 1, overflowY: 'auto' }}
                    >
                        <div style={{ padding: "0 30px", paddingTop: "10px" }}></div>
                        <div id="messagebody" className="messagebodyclass">
                            {fetchMoreMsg && showFetchMsg && (
                                <p
                                    style={{
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                        color: "#20446c",
                                        fontStyle: "italic",
                                        fontSize: "16px",
                                    }}
                                >
                                    Fetching older messages...
                                </p>
                            )}
                            {replyJumpingId && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 z-50">
                                    <div className="loader">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                    <p
                                        style={{
                                            display: "flex",
                                            justifyContent: "center",
                                            alignItems: "center",
                                            color: "#f37e20",
                                            fontSize: "20px",
                                        }}
                                    >
                                        Redirecting Message ...
                                    </p>
                                </div>
                            )}

                            {modifiedMsgs?.map((item) => (
                                <div id={`message-${item._id}`} key={item._id}>
                                    <MegaMessage
                                        globalUser={globalUser}
                                        selected={
                                            selected?.currentUsers?.filter(
                                                (e) => e?._id === item?.senderId
                                            )[0]
                                        }
                                        message={item}
                                        setDelMsg={setDelMsg}
                                        setFrwdMsg={setFrwdMsg}
                                        setOpenModalInfo={setOpenModalInfo}
                                        setRplyMsg={setRplyMsg}
                                        setOpenReportModal={setOpenReportModal}
                                        setReportType={setReportType}
                                        groupDataDetails={groupDataDetails}
                                        onReplyJump={handleReplyJump}
                                        isReplyJumping={replyJumpingId === item._id}
                                        isGuestMeeting={selected?.isGuestMeeting}
                                    />
                                </div>
                            ))}

                            {showScrollButton && (
                                <button
                                    onClick={handleScrollToBottom}
                                    style={{
                                        position: "absolute",
                                        bottom: "100px",
                                        right: "20px",
                                        background: "#b5b5b5",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: "85px",
                                        cursor: "pointer",
                                        zIndex: 99999,
                                    }}
                                >
                                    <KeyboardArrowDownIcon
                                        style={{ color: "#fff" }}
                                        aria-label="more"
                                        id="long-button"
                                        aria-haspopup="true"
                                    />
                                </button>
                            )}
                            <div ref={messagesEndRef} style={{ height: "1px" }} />
                        </div>
                    </div>

                    {Uploadstatus && (
                        <div style={{ width: "100%", height: "12%", display: "contents" }}>
                            <div>
                                <div
                                    style={{
                                        width: `${progress}%`,
                                        background: progress === 100 ? "green" : "#f37e20",
                                        transition: "width 1s ease",
                                        display: "flex",
                                        alignItems: "center",
                                        height: "20px",
                                        justifyContent: "space-evenly",
                                    }}
                                >
                                    {status && (
                                        <p
                                            style={{
                                                marginTop: "auto",
                                                textAlign: "center",
                                                fontSize: "15px",
                                                color: progress === 100 ? "White" : "black",
                                            }}
                                        >
                                            {status}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className="inout_message_area">
                {rplyMsg && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            background: "rgba(0,0,0,0.05)",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            fontSize: "14px",
                            marginBottom: "8px",
                            borderLeft: "4px solid #f37e20",
                            position: "relative",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                flex: 1,
                                overflow: "hidden",
                            }}
                        >
                            <span
                                style={{
                                    fontWeight: "600",
                                    color: "#f37e20",
                                    fontSize: "12px",
                                }}
                            >
                                Replying to {rplyMsg.name}
                            </span>
                            <span
                                style={{
                                    fontWeight: "300",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {rplyMsg.textFileType === "image"
                                    ? `Photo : ${rplyMsg.fileName}`
                                    : rplyMsg.textFileType === "video"
                                        ? `Video : ${rplyMsg.fileName}`
                                        : rplyMsg.textFileType === "doc"
                                            ? `Document : ${rplyMsg.fileName}`
                                            : rplyMsg.message}
                            </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center" }}>
                            {(rplyMsg.textFileType === "image" ||
                                rplyMsg.textFileType === "video" ||
                                rplyMsg.textFileType === "doc") && (
                                    <div style={{ marginRight: "10px", flexShrink: 0 }}>
                                        {rplyMsg.textFileType === "image" ? (
                                            <img
                                                style={{
                                                    height: "40px",
                                                    width: "40px",
                                                    objectFit: "cover",
                                                    borderRadius: "4px",
                                                }}
                                                src={rplyMsg.message}
                                                alt="Reply preview"
                                            />
                                        ) : rplyMsg.textFileType === "doc" ? (
                                            <img
                                                style={{
                                                    height: "40px",
                                                    width: "40px",
                                                    objectFit: "cover",
                                                    borderRadius: "4px",
                                                }}
                                                src={"/document-svgrepo-com.svg"}
                                                alt="Document preview"
                                            />
                                        ) : (
                                            <video
                                                style={{
                                                    height: "40px",
                                                    width: "40px",
                                                    objectFit: "cover",
                                                    borderRadius: "4px",
                                                }}
                                                src={rplyMsg.message}
                                            />
                                        )}
                                    </div>
                                )}
                            <CancelOutlinedIcon
                                sx={{
                                    color: "rgba(0,0,0,.6)",
                                    cursor: "pointer",
                                    fontSize: "20px",
                                }}
                                onClick={() => {
                                    setRplyMsg(null);
                                }}
                            />
                        </div>
                    </div>
                )}
                {!selected?.isGoogleEvent && (selected?.isTemp ? (
                    (forceChatView || (selected?.currentUsersId?.includes(globalUser?.data?.user?._id) &&
                        now.isBetween(
                            moment(selected?.meetingStartTime),
                            moment(selected?.meetingEndTime)
                        ))) && (
                        <div className="border-input-container" style={isMeetingOverlay ? { border: '1px solid #e2e8f0', margin: '10px', borderRadius: '8px', background: '#fff' } : {}}>
                            {!isMeetingOverlay && (
                                <svg className="border-svg" viewBox="0 0 318 39" preserveAspectRatio="none">
                                    <defs>
                                        <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
                                            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="orange" floodOpacity="0.9" />
                                        </filter>
                                    </defs>
                                    <path className="border-glow" d="M3 3 H315 Q318 3 318 6 V33 Q318 36 315 36 H3 Q0 36 0 33 V6 Q0 3 3 3 Z" filter="url(#glow)"></path>
                                    <path className="rotating-border" d="M3 3 H315 Q318 3 318 6 V33 Q318 36 315 36 H3 Q0 36 0 33 V6 Q0 3 3 3 Z"></path>
                                </svg>
                            )}
                            <TextField
                                label=""
                                placeholder="Type Your Message..."
                                fullWidth
                                value={message || ""}
                                onChange={(e) => {
                                    handleTyping();
                                    setMessage(e.target.value);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        const trimmedMsg = message?.trim();
                                        if (trimmedMsg && trimmedMsg.length > 0 && !sendLoading) {
                                            sendMessage(null, "text", trimmedMsg);
                                            setSendLoading(true);
                                        }
                                    }
                                }}
                                size="large"
                                multiline
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            {!selected?.isGuestMeeting && (
                                                <>
                                                    <label
                                                        htmlFor="file-input-pdf"
                                                        className={styles.fileLabel}
                                                    >
                                                        <input
                                                            type="file"
                                                            id="file-input-pdf"
                                                            className={styles.fileInput}
                                                            onChange={(e) => uploadFile(e.target.files[0])}
                                                            accept=".jpg, .jpeg, .png, .gif, .mp4, .mov, .avi, .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt, .csv, .zip, .rar"
                                                        />
                                                        <AttachFileIcon
                                                            sx={{
                                                                fontSize: "25px",
                                                                marginRight: "5px",
                                                                color: "rgba(0,0,0,.6)",
                                                                cursor: "pointer",
                                                            }}
                                                        />
                                                    </label>
                                                    <div
                                                        style={{
                                                            height: "25px",
                                                            borderRight: "2px solid darkgrey",
                                                            marginRight: "2px",
                                                            marginLeft: "5px",
                                                        }}
                                                    ></div>
                                                </>
                                            )}

                                            <IconButton
                                                onClick={() => {
                                                    const trimmedMsg = message?.trim();
                                                    if (trimmedMsg && trimmedMsg.length > 0 && !sendLoading) {
                                                        sendMessage(null, "text", trimmedMsg);
                                                        setSendLoading(true);
                                                    }
                                                }}
                                            >
                                                {sendLoading ? (
                                                    <CircularProgress
                                                        size={20}
                                                        sx={{ color: "#ccc" }}
                                                    />
                                                ) : (
                                                    <SendIcon
                                                        sx={{
                                                            color: "#f37e20",
                                                            transform: "rotate(-40deg) translateX(5px)",
                                                        }}
                                                    />
                                                )}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </div>
                    )
                ) : (
                    <div className="border-input-container" style={isMeetingOverlay ? { border: '1px solid #e2e8f0', margin: '10px', borderRadius: '8px', background: '#fff' } : {}}>
                        {!isMeetingOverlay && (<></>
                            // <svg className="border-svg" viewBox="0 0 318 39" preserveAspectRatio="none">
                            //     <defs>
                            //         <filter id="glow-2" x="-100%" y="-100%" width="300%" height="300%">
                            //             <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="orange" floodOpacity="0.9" />
                            //         </filter>
                            //     </defs>
                            //     <path className="border-glow" d="M3 3 H315 Q318 3 318 6 V33 Q318 36 315 36 H3 Q0 36 0 33 V6 Q0 3 3 3 Z" filter="url(#glow-2)"></path>
                            //     <path className="rotating-border" d="M3 3 H315 Q318 3 318 6 V33 Q318 36 315 36 H3 Q0 36 0 33 V6 Q0 3 3 3 Z"></path>
                            // </svg>
                        )}
                        <TextField
                            label=""
                            placeholder="Type Your Message..."
                            fullWidth
                            value={message || ""}
                            onChange={(e) => {
                                handleTyping();
                                setMessage(e.target.value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    const trimmedMsg = message?.trim();
                                    if (trimmedMsg && trimmedMsg.length > 0 && !sendLoading) {
                                        sendMessage(null, "text", trimmedMsg);
                                        setSendLoading(true);
                                    }
                                }
                            }}
                            size="large"
                            multiline
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        {!selected?.isGuestMeeting && (
                                            <>
                                                <label
                                                    htmlFor="file-input-pdf-2"
                                                    className={styles.fileLabel}
                                                >
                                                    <input
                                                        type="file"
                                                        id="file-input-pdf-2"
                                                        className={styles.fileInput}
                                                        onChange={(e) => uploadFile(e.target.files[0])}
                                                        accept=".jpg, .jpeg, .png, .gif, .mp4, .mov, .avi, .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt, .csv, .zip, .rar"
                                                    />
                                                    <AttachFileIcon
                                                        sx={{
                                                            fontSize: "25px",
                                                            marginRight: "5px",
                                                            color: "rgba(0,0,0,.6)",
                                                            cursor: "pointer",
                                                        }}
                                                    />
                                                </label>
                                                <div
                                                    style={{
                                                        height: "25px",
                                                        borderRight: "2px solid darkgrey",
                                                        marginRight: "2px",
                                                        marginLeft: "5px",
                                                    }}
                                                ></div>
                                            </>
                                        )}

                                        <IconButton
                                            onClick={() => {
                                                const trimmedMsg = message?.trim();
                                                if (trimmedMsg && trimmedMsg.length > 0 && !sendLoading) {
                                                    sendMessage(null, "text", trimmedMsg);
                                                    setSendLoading(true);
                                                }
                                            }}
                                        >
                                            {sendLoading ? (
                                                <CircularProgress
                                                    size={20}
                                                    sx={{ color: "#ccc" }}
                                                />
                                            ) : (
                                                <SendIcon
                                                    sx={{
                                                        color: "#f37e20",
                                                        transform: "rotate(-40deg) translateX(5px)",
                                                    }}
                                                />
                                            )}
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </div>
                ))}
            </div>
        </div >
    );
};

export default ChatArea;
