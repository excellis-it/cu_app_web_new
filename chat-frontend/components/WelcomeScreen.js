import React, { useState, useMemo, useEffect } from "react";
import axios from "axios";
import { useAppContext } from "../appContext/appContext";
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
    isToday,
    parseISO,
    isAfter,
    isBefore,
} from "date-fns";
import {
    Box,
    Typography,
    IconButton,
    Paper,
    Grid,
    Badge,
    List,
    ListItem,
    ListItemText,
    Divider,
    Avatar,
    Button,
    Chip,
    Tooltip,
    Tabs,
    Tab,
    CircularProgress,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TodayIcon from "@mui/icons-material/Today";
import EventIcon from "@mui/icons-material/Event";
import VideocamIcon from "@mui/icons-material/Videocam";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import GoogleIcon from "@mui/icons-material/Google";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";
import Swal from 'sweetalert2';
import MeetingActionButton from "./meetingActionButton";
import CachedIcon from '@mui/icons-material/Cached';

const WelcomeScreen = ({
    showActivity,
    callHistoryActivity,
    meetingsActivity,
    meetings = [],
    setSelected,
    setShowActivity,
    setMeetingsActivity,
    setCallHistoryActivity,
    activeIndex,
    setActiveIndex,
    currentMonth,
    setCurrentMonth,
    googleConnected,
    onSyncRefresh,
    onGoogleConnect,
    onGoogleDisconnect,
    setMeetingTypeFilter,
    meetingTypeFilter,
    isFetchingMeetings // Added prop
}) => {
    const { globalUser } = useAppContext();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [filterTab, setFilterTab] = useState(0); // 0: All, 1: Upcoming, 2: Past

    // Helper to parse dates safely, especially for all-day Google events (YYYY-MM-DD)
    const safeParseDate = (dateStr) => {
        if (!dateStr) return new Date();
        if (dateStr instanceof Date) return dateStr; // Start: Handle Date objects directly
        // If it's a date-only string (10 chars), parse it in local time
        if (typeof dateStr === 'string' && dateStr.length === 10 && dateStr.includes('-')) {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        return parseISO(dateStr);
    };



    const handleMeetingClick = (meeting) => {
        if (typeof setSelected === 'function') {
            // Google meetings: open in new tab
            if (meeting.isGoogleEvent && meeting.link && !meeting.isHoliday) {
                window.open(meeting.link, '_blank');
                return; // Don't redirect the main view
            }

            // Holidays: open in Google Calendar
            if (meeting.isHoliday) {
                const calendarLink = meeting.link || 'https://calendar.google.com';
                window.open(calendarLink, '_blank');
                return;
            }

            // For internal ExTalk meetings: switch to meetings tab
            setSelected(meeting);
            if (typeof setShowActivity === 'function') setShowActivity(false);
            if (typeof setMeetingsActivity === 'function') setMeetingsActivity(true);
            if (typeof setCallHistoryActivity === 'function') setCallHistoryActivity(false);
            if (typeof setActiveIndex === 'function') setActiveIndex(2); // Index for Meetings

            // Switch filter tab if it's a guest meeting
            if (meeting.isGuestMeeting) {
                if (typeof setMeetingTypeFilter === 'function') setMeetingTypeFilter('guest');
            } else {
                if (typeof setMeetingTypeFilter === 'function') setMeetingTypeFilter('groups');
            }
        }
    };

    const handleCopyLink = (e, meeting) => {
        if (e) e.stopPropagation();
        const startTime = format(parseISO(meeting?.meetingStartTime), "MM/dd/yyyy hh:mm a");
        const copyText = ` join the meeting ..
time: ${startTime}
link: ${meeting?.link || ''}
pin: ${meeting?.pin || ''}
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

    const handleGoogleDelete = async (e, eventId) => {
        if (e) e.stopPropagation();

        const result = await Swal.fire({
            title: 'Delete from Google Calendar?',
            text: "This will permanently remove the event.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#f44336',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Yes, delete it!'
        });

        if (result.isConfirmed) {
            try {
                const config = {
                    params: {
                        userId: globalUser?.data?.user?._id,
                        eventId: eventId
                    }
                };
                const response = await axios.delete(`/api/auth/google/events`, config);
                if (response.data.success) {
                    Swal.fire('Deleted!', 'Event has been removed.', 'success');
                    if (onSyncRefresh) onSyncRefresh();
                } else {
                    Swal.fire('Error!', response.data.message || 'Failed to delete event', 'error');
                }
            } catch (err) {
                console.error("Delete Google event failed:", err);
                Swal.fire('Error!', 'Something went wrong.', 'error');
            }
        }
    };

    const handleGoogleAccept = async (e, eventId) => {
        if (e) e.stopPropagation();
        try {
            const body = {
                userId: globalUser?.data?.user?._id,
                eventId: eventId,
                response: 'accepted'
            };
            const response = await axios.post(`/api/auth/google/respond`, body);
            if (response.data.success) {
                Swal.fire('Accepted!', 'You have accepted the invitation.', 'success');
                if (onSyncRefresh) onSyncRefresh();
            } else {
                Swal.fire('Error!', response.data.message || 'Failed to respond', 'error');
            }
        } catch (err) {
            console.error("Accept Google event failed:", err);
            Swal.fire('Error!', 'Something went wrong.', 'error');
        }
    };

    const [isLoading, setIsLoading] = useState(false);

    // Sync loading state with parent's fetching status
    useEffect(() => {
        setIsLoading(isFetchingMeetings);
    }, [isFetchingMeetings]);

    const nextMonth = () => {
        // setIsLoading(true); // Handled by prop now
        setCurrentMonth(addMonths(currentMonth, 1));
    };

    const prevMonth = () => {
        // setIsLoading(true); // Handled by prop now
        setCurrentMonth(subMonths(currentMonth, 1));
    };

    const onDateClick = (day) => setSelectedDate(day);

    const filteredMeetings = useMemo(() => {
        const now = new Date();
        return meetings.filter(m => {
            if (!m.meetingStartTime) return false;
            const startTime = safeParseDate(m.meetingStartTime);
            const endTime = m.meetingEndTime ? safeParseDate(m.meetingEndTime) : startTime;

            // Upcoming: meeting hasn't ended yet
            if (filterTab === 1) {
                return isAfter(endTime, now);
            }
            // Past: meeting has ended
            if (filterTab === 2) {
                return isBefore(endTime, now);
            }
            return true;
        });
    }, [meetings, filterTab]);

    const handleCalendarButtonClick = () => {
        if (!googleConnected) {
            // Not connected - trigger connection
            if (onGoogleConnect) onGoogleConnect();
        } else {
            // Connected - show options menu
            Swal.fire({
                title: 'Google Calendar',
                html: `
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                        <button id="sync-btn" class="syncnow">
                            Sync Now
                        </button>
                        <button id="disconnect-btn" class="disconnectbtn">
                            Disconnect
                        </button>
                    </div>
                `,
                showConfirmButton: false,
                showCancelButton: false,
                didOpen: () => {
                    document.getElementById('sync-btn').addEventListener('click', async () => {
                        Swal.fire({
                            title: 'Syncing...',
                            text: 'Syncing ExTalk meetings to Google Calendar',
                            allowOutsideClick: false,
                            allowEscapeKey: false,
                            showConfirmButton: false,
                            didOpen: () => {
                                Swal.showLoading();
                            }
                        });

                        // Small delay to ensure the loading shows
                        setTimeout(() => {
                            if (onSyncRefresh) onSyncRefresh();
                            setTimeout(() => {
                                Swal.close();
                            }, 500);
                        }, 100);
                    });
                    document.getElementById('disconnect-btn').addEventListener('click', () => {
                        Swal.close();
                        // Use setTimeout to ensure the previous Swal is fully closed before showing the new one
                        setTimeout(() => {
                            if (onGoogleDisconnect) onGoogleDisconnect();
                        }, 100);
                    });
                }
            });
        }
    };

    const renderHeader = () => {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'nowrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600, color: '#404d63', letterSpacing: -0.5, fontSize: { xs: '1rem', sm: '1.5rem' } }}>
                        {format(currentMonth, "MMMM yyyy")}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', minWidth: 60, justifyContent: 'center' }}>
                        {isLoading ? (
                            <CircularProgress size={20} sx={{ color: '#f37e20' }} />
                        ) : (
                            <>
                                <IconButton onClick={prevMonth} size="small" sx={{ border: '1px solid #f37e20', color: '#f37e20', p: 0.5 }}>
                                    <ChevronLeftIcon fontSize="small" />
                                </IconButton>
                                <IconButton onClick={nextMonth} size="small" sx={{ border: '1px solid #f37e20', color: '#f37e20', p: 0.5 }}>
                                    <ChevronRightIcon fontSize="small" />
                                </IconButton>
                            </>
                        )}
                    </Box>
                </Box>
                <Button
                    variant="contained"
                    startIcon={googleConnected ? <GoogleIcon sx={{ color: '#fff' }} /> : <img
                        src="calender_g.png"
                        alt=""
                        width={18}
                        height={18}
                        style={{ objectFit: "contain" }}
                    />}
                    size="small"
                    sx={{
                        color: googleConnected ? '#fff' : '#404d63',
                        textTransform: 'none',
                        px: 2,
                        py: 0.8,
                        borderRadius: '20px',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        bgcolor: googleConnected ? '#34a853 !important' : '#fff',
                        boxShadow: '0 4px 10px 0 rgba(2, 2, 2, 0.3)',
                        '&:hover': { bgcolor: googleConnected ? '#2d9246' : '#f8f8f8' }
                    }}
                    onClick={handleCalendarButtonClick}
                >
                    {googleConnected ? "Connected" : "Connect"}
                </Button>
            </Box>
        );
    };

    const renderDays = () => {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return (
            <Grid container columns={7} sx={{ bgcolor: 'rgba(0,0,0,0.02)', borderRadius: '8px 8px 0 0' }}>
                {days.map((day, i) => (
                    <Grid item xs={1} key={i}>
                        <Typography align="center" variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', py: 1, display: 'block', fontSize: '0.65rem' }}>
                            {day.toUpperCase()}
                        </Typography>
                    </Grid>
                ))}
            </Grid>
        );
    };

    const renderCells = () => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);

        const allDaysInRange = eachDayOfInterval({
            start: startDate,
            end: endDate
        });

        return (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '0 0 8px 8px', overflow: 'hidden', flex: 1 }}>
                {allDaysInRange.map((day, i) => {
                    const meetingsOnThisDay = meetings.filter(m =>
                        m.meetingStartTime && isSameDay(safeParseDate(m.meetingStartTime), day)
                    );

                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isSelected = isSameDay(day, selectedDate);
                    const isTodayDay = isToday(day);

                    return (
                        <Box
                            key={i}
                            onClick={() => onDateClick(day)}
                            sx={{
                                width: '14.285%',
                                height: '16.666%', // Approx for 5-6 rows to fit in flex:1
                                minHeight: 34,
                                border: '0.5px solid rgba(0,0,0,0.05)',
                                p: 0.5,
                                display: 'flex',
                                flexDirection: 'column',
                                cursor: 'pointer',
                                bgcolor: isSelected ? 'rgba(243, 126, 32, 0.05)' : isCurrentMonth ? 'transparent' : 'rgba(0,0,0,0.015)',
                                transition: 'all 0.1s',
                                '&:hover': { bgcolor: 'rgba(243, 126, 32, 0.03)' },
                                position: 'relative',
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    fontWeight: isTodayDay || isSelected ? 900 : 500,
                                    color: isTodayDay ? '#fff' : isCurrentMonth ? 'text.primary' : 'text.disabled',
                                    width: 18,
                                    height: 18,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '50%',
                                    bgcolor: isTodayDay ? '#f37e20' : isSelected ? 'rgba(243, 126, 32, 0.2)' : 'transparent',
                                    fontSize: '0.7rem',
                                    mb: 0.2
                                }}
                            >
                                {format(day, "d")}
                            </Typography>

                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                                {isLoading ? (
                                    <Box sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <CircularProgress size={14} sx={{ color: '#f37e20' }} />
                                    </Box>
                                ) : (
                                    <>
                                        {meetingsOnThisDay.some(m => !m.isGoogleEvent) && (
                                            <Box
                                                sx={{
                                                    width: meetingsOnThisDay.some(m => m.isGoogleEvent) ? 18 : 22,
                                                    height: meetingsOnThisDay.some(m => m.isGoogleEvent) ? 18 : 22,
                                                    borderRadius: '50%',
                                                    bgcolor: '#f37e20',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: '0 2px 4px rgba(243, 126, 32, 0.2)'
                                                }}
                                            >
                                                <VideocamIcon sx={{ fontSize: meetingsOnThisDay.some(m => m.isGoogleEvent) ? 11 : 13, color: '#fff' }} />
                                            </Box>
                                        )}
                                        {meetingsOnThisDay.some(m => m.isGoogleEvent) && (
                                            <Box
                                                sx={{
                                                    width: meetingsOnThisDay.some(m => !m.isGoogleEvent) ? 18 : 22,
                                                    height: meetingsOnThisDay.some(m => !m.isGoogleEvent) ? 18 : 22,
                                                    borderRadius: '50%',
                                                    bgcolor: '#fff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                                    border: '1px solid #dadce0'
                                                }}
                                            >
                                                <GoogleIcon sx={{ fontSize: meetingsOnThisDay.some(m => !m.isGoogleEvent) ? 10 : 13 }} />
                                            </Box>
                                        )}
                                    </>
                                )}
                            </Box>

                            {isSelected && (
                                <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, bgcolor: '#f37e20' }} />
                            )}
                        </Box>
                    );
                })}
            </Box>
        );
    };

    const renderMeetingList = () => {
        const now = new Date();

        // Filter to show only ExTalk meetings and holidays
        const meetingsToDisplay = meetings.filter(m => {
            const startTime = safeParseDate(m.meetingStartTime);
            const isOnSelectedDate = isSameDay(startTime, selectedDate); // Check date match first
            if (!isOnSelectedDate) return false;

            const isExTalkMeeting = !m.isGoogleEvent; // ExTalk meetings
            const isHoliday = m.isHoliday; // Holidays from Google Calendar
            const isGuestMeeting = m.isGuestMeeting; // Explicitly include guest meetings

            // Filter by Tab
            // Tab 1: Upcoming - Show only if start time is in the future
            if (filterTab === 1 && !isAfter(startTime, now)) return false;

            // Tab 2: Past - Show if start time is in the past (or now)
            if (filterTab === 2 && isAfter(startTime, now)) return false;

            return (isExTalkMeeting || isHoliday || isGuestMeeting);
        }).sort((a, b) => {
            // Sort by createdAt in descending order (latest created first)
            const timeA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeB - timeA; // Descending order
        });

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TodayIcon sx={{ fontSize: 18, color: '#f37e20' }} />
                        {format(selectedDate, "MMM do")} Agenda
                    </Typography>

                    <Tabs
                        value={filterTab}
                        onChange={(e, v) => setFilterTab(v)}
                        sx={{
                            minHeight: 'auto',
                            borderRadius: '8px',
                            p: 0.3,
                            '& .MuiTab-root': { minHeight: 'auto', py: 0.5, px: 1.5, fontSize: '0.7rem', textTransform: 'none', fontWeight: 700, borderRadius: '6px', bgcolor: '#f3f5f7', color: '#404d63', marginRight: 1 },
                            '& .Mui-selected': { color: '#fff !important', bgcolor: '#f37e20' },
                            '& .MuiTabs-indicator': { display: 'none' }
                        }}
                    >
                        <Tab label="All" />
                        <Tab label="Upcoming" />
                        <Tab label="Past" />
                    </Tabs>
                </Box>

                <Box sx={{ flex: 1, overflowY: 'auto', pr: 0 }}>
                    {meetingsToDisplay.length > 0 ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            {meetingsToDisplay.map((meeting) => {
                                const startTime = safeParseDate(meeting.meetingStartTime);
                                const isPast = isBefore(startTime, now) && !isSameDay(startTime, now);
                                const isLive = isSameDay(startTime, now) && isBefore(startTime, now) && isAfter(safeParseDate(meeting.meetingEndTime), now);

                                return (
                                    <Paper
                                        key={meeting._id}
                                        elevation={0}
                                        onClick={() => handleMeetingClick(meeting)}
                                        sx={{
                                            p: 1.5,
                                            borderRadius: '12px',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            display: 'flex',
                                            flexDirection: 'column', // Stack vertically
                                            cursor: 'pointer',
                                            bgcolor: isLive ? 'rgba(243, 126, 32, 0.02)' : 'background.paper',
                                            '&:hover': {
                                                borderColor: '#f37e20',
                                                bgcolor: 'rgba(243, 126, 32, 0.01)',
                                                transform: 'translateY(-2px)',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                                            },
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                            <Avatar
                                                src={meeting.groupImage || ""}
                                                sx={{
                                                    width: 36,
                                                    height: 36,
                                                    bgcolor: meeting.isHoliday ? '#4caf50' : '#f37e20',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 800
                                                }}
                                            >
                                                {meeting.isHoliday ? <EventIcon /> : meeting.groupName?.charAt(0)}
                                            </Avatar>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#20446c', fontSize: '0.9rem', lineHeight: 1.3 }}>
                                                        {meeting.groupName}
                                                    </Typography>
                                                    {isLive && <Chip label="LIVE" size="small" sx={{ bgcolor: '#f44336', color: '#fff', height: 16, fontSize: '9px', fontWeight: 900 }} />}
                                                    {meeting.isGoogleEvent && !meeting.isHoliday && <Chip icon={<GoogleIcon sx={{ fontSize: '10px !important' }} />} label="Google" size="small" sx={{ height: 18, fontSize: '10px', fontWeight: 700, bgcolor: 'rgba(66, 133, 244, 0.1)', color: '#4285F4' }} />}
                                                    {meeting.isHoliday && <Chip label="Holiday" size="small" sx={{ height: 18, fontSize: '10px', fontWeight: 700, bgcolor: 'rgba(76, 175, 80, 0.1)', color: '#2e7d32' }} />}
                                                </Box>
                                                {!meeting.isHoliday && (
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                                        <AccessTimeIcon sx={{ fontSize: 13, color: '#f37e20' }} />
                                                        {format(startTime, "h:mm a")}
                                                        {meeting.link && meeting.isGoogleEvent && !meeting.isHoliday && (
                                                            <a href={meeting.link} target="_blank" rel="noopener noreferrer" style={{ color: '#f37e20', marginLeft: '5px', textDecoration: 'none' }}>
                                                                [Join]
                                                            </a>
                                                        )}
                                                    </Typography>
                                                )}
                                            </Box>
                                            <Box>
                                                {!meeting.isHoliday && isAfter(meeting.meetingEndTime ? safeParseDate(meeting.meetingEndTime) : startTime, now) && (
                                                    <Tooltip title="Copy Link" arrow>
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => handleCopyLink(e, meeting)}
                                                            sx={{
                                                                color: '#f37e20',
                                                                bgcolor: 'rgba(243, 126, 32, 0.05)',
                                                                '&:hover': { bgcolor: 'rgba(243, 126, 32, 0.15)' }
                                                            }}
                                                        >
                                                            <ContentCopyIcon sx={{ fontSize: 16 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        </Box>

                                        {/* Action Buttons Row */}
                                        {!meeting.isGoogleEvent && isAfter(safeParseDate(meeting.meetingEndTime), now) && (
                                            <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                                                <MeetingActionButton meetingId={meeting._id} initialAction={meeting.userAction} />
                                            </Box>
                                        )}
                                    </Paper>
                                );
                            })}
                        </Box>
                    ) : (
                        <Box sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>
                            <EventIcon sx={{ fontSize: 40, opacity: 0.1, mb: 1 }} />
                            <Typography variant="caption" sx={{ display: 'block' }}>No meetings</Typography>
                        </Box>
                    )}
                </Box>

            </Box>
        );
    };

    // if (showActivity) {
    //     return (
    //         <Box className="chat_cu_logo" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4, textAlign: 'center' }}>
    //             <img src="extalk.png" alt="cu-logo" style={{ width: '180px', marginBottom: '20px' }} />
    //             <Typography variant="h4" sx={{ color: '#f37e20', fontWeight: 900, mb: 1 }}>Chats</Typography>
    //             <Typography variant="body2" color="text.secondary">Select a conversation to start messaging</Typography>
    //         </Box>
    //     );
    // }

    // if (callHistoryActivity) {
    //     return (
    //         <Box className="chat_cu_logo" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4, textAlign: 'center' }}>
    //             <img src="extalk.png" alt="cu-logo" style={{ width: '180px', marginBottom: '20px' }} />
    //             <Typography variant="h4" sx={{ color: '#f37e20', fontWeight: 900, mb: 1 }}>Call History</Typography>
    //             <Typography variant="body2" color="text.secondary">Review your recent voice and video calls</Typography>
    //         </Box>
    //     );
    // }

    if (meetingsActivity || showActivity || callHistoryActivity) {
        return (
            <Box sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                p: { xs: 2, md: 3 },
                bgcolor: '#fff',
                overflow: 'hidden'
            }}>
                {/* <Box sx={{ mb: 3 }}>
                    <Typography variant="h4" sx={{ fontWeight: 300, color: '#20446c', mb: 0.5, fontSize: '30px' }}>
                        Calendar
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, color: '#64789b' }}>
                        Your professional workspace.
                    </Typography>
                </Box> */}

                <Box sx={{
                    flex: 1,
                    display: 'flex',
                    gap: 3,
                    minHeight: 0,
                    flexDirection: { xs: 'column', md: 'row' }
                }}>
                    {/* Left: Calendar (Flexible) */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                borderRadius: '16px',
                                border: '1px solid rgba(0,0,0,0.08)',
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1,
                                minHeight: 0
                            }}
                        >
                            {renderHeader()}
                            {renderDays()}
                            {renderCells()}
                        </Paper>
                    </Box>

                    {/* Right: Agenda (Scrollable internally) */}
                    <Box sx={{ flex: { xs: 1, md: '0 0 350px' }, width: { md: '350px' }, minHeight: 0 }}>
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2.5,
                                borderRadius: '16px',
                                border: '1px solid rgba(0,0,0,0.08)',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            {renderMeetingList()}
                        </Paper>
                    </Box>
                </Box>
            </Box>
        );
    }

    return (
        <Box className="chat_cu_logo" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4, textAlign: 'center' }}>
            <img src="extalk.png" alt="cu-logo" style={{ width: '220px', marginBottom: '30px' }} />
            <Typography variant="h3" sx={{ color: '#f37e20', fontWeight: 900, mb: 1 }}>Welcome to ExTalk</Typography>
            <Typography variant="body1" color="text.secondary">Collaborate and communicate with your team effortlessly</Typography>
        </Box>
    );
};

export default WelcomeScreen;
