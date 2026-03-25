import React, { useEffect, useState, memo, useMemo, useRef } from "react";
import styles from "../src/styles/planning.module.css";
import MenuIcon from "@mui/icons-material/Menu";
import useWindowSize from "@rooks/use-window-size";
import moment from "moment";
import CircularProgress from "@mui/material/CircularProgress";
import CallIcon from "@mui/icons-material/Call";
import VideocamIcon from "@mui/icons-material/Videocam";
import { RadioButtonChecked } from "@mui/icons-material";
import GroupIcon from "@mui/icons-material/Group";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import GoogleIcon from "@mui/icons-material/Google";
import Swal from "sweetalert2";

// Memoized Formatter to avoid repeated moment calls
const getFormattedMessageTime = (timestamp) => {
  if (!timestamp) return "";
  const messageTime = moment(timestamp);
  const now = moment();
  const startOfToday = now.clone().startOf("day");
  if (messageTime.isSame(startOfToday, "day"))
    return messageTime.format("HH:mm");
  const startOfYesterday = now.clone().subtract(1, "day").startOf("day");
  const endOfYesterday = now.clone().subtract(1, "day").endOf("day");
  if (messageTime.isBetween(startOfYesterday, endOfYesterday, null, "[]"))
    return "Yesterday " + messageTime.format("HH:mm");
  if (now.diff(messageTime, "days") < 7)
    return messageTime.format("dddd HH:mm");
  return messageTime.format("MM/DD/YYYY HH:mm");
};

const GroupItem = memo(
  ({
    values,
    selected,
    globalUser,
    styles,
    windowWidth,
    activeCall,
    waitingCall,
    onSelect,
    getFormattedMessageTime,
    type, // 'chat', 'call', 'meeting'
  }) => {
    const isSelected =
      type === "call" && values.uniqueId
        ? selected?.uniqueId === values.uniqueId
        : selected?._id === values._id;
    const lastMsg = values?.lastMessage;
    const unreadCount = values?.unreadCount;

    const handleClick = (e) => {
      e.stopPropagation();
      onSelect(values);
    };

    const handleCopyLink = (e) => {
      e.stopPropagation();
      const time = moment(values?.meetingStartTime).format(
        "MM/DD/YYYY hh:mm A",
      );
      const copyText = ` join the meeting ...
time: ${time}
link: ${values?.link || ""}
pin: ${values?.pin || ""}
`;
      navigator.clipboard.writeText(copyText).then(() => {
        Swal.fire({
          // icon: 'success',
          title: "Copied!",
          text: "Meeting details copied to clipboard",
          timer: 1500,
          showConfirmButton: false,
          width: "300px",
        });
      });
    };

    // Get display name - for direct chats, show the other user's name
    const getDisplayName = () => {
      if (values?.isDirect) {
        // Find the other user (not current user)
        const currentUserId = globalUser?.data?.user?._id;
        const otherUser = values?.currentUsers?.find(
          (user) => (user._id || user) !== currentUserId,
        );
        return otherUser?.name || values?.groupName || "Chat";
      }
      return values?.groupName || "Group";
    };

    // Get display image - for direct chats, show the other user's avatar
    const getDisplayImage = () => {
      if (values?.isDirect) {
        const currentUserId = globalUser?.data?.user?._id;
        const otherUser = values?.currentUsers?.find(
          (user) => (user._id || user) !== currentUserId,
        );
        return otherUser?.image || null;
      }
      return values?.groupImage || null;
    };

    const displayName = getDisplayName();
    const displayImage = getDisplayImage();

    const renderLastMessageContent = () => {
      if (
        !values?.isGuestMeeting &&
        !values?.isDirect &&
        !values?.currentUsersId?.includes(globalUser?.data?.user?._id)
      )
        return "You left";
      if (!lastMsg) return "Start conversation";
      const sender = lastMsg.senderId?.name || lastMsg.senderName || "Unknown";
      // For direct chats, don't show sender prefix since it's obvious
      const prefix = values?.isDirect ? "" : `${sender}: `;
      if (lastMsg.messageType === "image") return prefix + "Photo";
      if (lastMsg.messageType === "video") return prefix + "Video";
      if (lastMsg.messageType === "doc") return prefix + "Document";
      return prefix + lastMsg.message;
    };

    const renderCallInfo = () => {
      if (type !== "call") return null;
      let callLabel = "";
      if (values?.missedCalled !== undefined) {
        callLabel = values.missedCalled
          ? "Missed Call"
          : values.callStatus === "outgoing"
            ? "Outgoing Call"
            : "Received Call";
      } else {
        const userId = globalUser?.data?.user?._id;
        const activity = values?.Video_call_details?.userActivity || [];
        const userJoined = activity.some((act) => act.user === userId);
        const sortedActivity = [...activity].sort(
          (a, b) => new Date(a.joinedAt) - new Date(b.joinedAt),
        );
        const isOutgoing =
          sortedActivity.length > 0 && sortedActivity[0].user === userId;
        callLabel = userJoined
          ? isOutgoing
            ? "Outgoing Call"
            : "Received Call"
          : "Missed Call";
      }

      return (
        <span
          className="vendcont"
          style={{ fontWeight: unreadCount ? "bold" : "normal" }}
        >
          {callLabel}
        </span>
      );
    };

    return (
      <div
        className={`${styles.listdiv1} ${isSelected ? styles.selectedGroup : ""}`}
        style={{
          gap: "0px",
          gridGap: "0px",
          padding: type === "meeting" ? "10px 5% 25px" : "10px 5%",
          position: type === "meeting" ? "relative" : "static",
        }}
        onClick={handleClick}
      >
        <div
          style={{
            display: "flex",
            gap: "20px",
            width: windowWidth > 1150 ? "80%" : "75%",
          }}
        >
          <article style={{ width: "100%", justifyContent: "start" }}>
            {values?.isGoogleEvent ? (
              <div
                className="imgmessagediv"
                style={{
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                }}
              >
                <GoogleIcon sx={{ color: "#4285F4", fontSize: "24px" }} />
              </div>
            ) : displayImage ? (
              <img className="imgmessagediv" src={displayImage} alt="" />
            ) : (
              <div className="imgmessagediv">
                {displayName?.substring(0, 1)}
              </div>
            )}
            <span className="vendnamemes">
              <h4
                style={{
                  textTransform: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                {values?.isGoogleEvent && (
                  <GoogleIcon sx={{ fontSize: "16px", color: "#4285F4" }} />
                )}
                <span>{displayName?.substring(0, 15)}</span>
                {values?.isGuestMeeting && (
                  <span
                    className="guest-label"
                    style={{
                      backgroundColor: "#e0e0e0",
                      color: "#ff0000ff",
                      padding: "2px 6px",
                      borderRadius: "10px",
                      fontSize: "10px",
                      marginLeft: "5px",
                      fontWeight: "bold",
                      border: "1px solid #ccc",
                    }}
                  >
                    Guest
                  </span>
                )}
                {!values?.isDirect && !values?.isGoogleEvent && (
                  <GroupIcon
                    style={{ color: "rgb(176 176 176)", fontSize: "16px" }}
                  />
                )}
              </h4>
              {type === "call" ? (
                renderCallInfo()
              ) : (
                <span
                  className="vendcont"
                  style={{ fontWeight: unreadCount ? "bold" : "normal" }}
                >
                  {values?.isGoogleEvent
                    ? values.isHoliday
                      ? "Holiday"
                      : "Google Event"
                    : renderLastMessageContent()}
                </span>
              )}
            </span>
          </article>
        </div>

        <div
          className={styles.blinkingGreen}
          style={{
            fontSize: "15px",
            width: windowWidth > 1150 ? "20%" : "25%",
            justifyContent: "end",
          }}
        >
          {activeCall?.includes(values._id) && (
            <p className="blinkingGreen">
              <RadioButtonChecked style={{ color: "#25767b" }} />
            </p>
          )}
          {waitingCall && (
            <p
              className="blinkingGreenWaiting"
              style={{ animation: "blink 1.5s infinite" }}
            >
              <RadioButtonChecked style={{ color: "#25767b" }} />
            </p>
          )}
        </div>

        <div
          className={type === "call" ? styles.callTodoBtn : styles.todoBtn}
          style={{
            width: windowWidth > 1150 ? "20%" : "25%",
            justifyContent: "end",
            textAlign: "right",
          }}
        >
          {unreadCount > 0 && (
            <p style={{ color: "#25767b", fontWeight: 900, margin: 0 }}>
              {unreadCount}
            </p>
          )}
          {type === "call" && (
            <p
              style={{
                color: "#25767b",
                fontWeight: 900,
                margin: 0,
                backgroundColor: "#25767b26",
                borderRadius: "50%",
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "15px",
              }}
            >
              {values?.Video_call_details?.callType === "audio" ? (
                <CallIcon style={{ color: "#25767b", fontSize: "15px" }} />
              ) : (
                <VideocamIcon style={{ color: "#25767b", fontSize: "15px" }} />
              )}
            </p>
          )}
          <span>
            {getFormattedMessageTime(lastMsg?.timestamp)}
            <br />
          </span>
        </div>

        {type === "meeting" && (
          <div
            className="meeting_schedule"
            style={{
              display: "flex",
              justifyContent: "end",
              alignItems: "center",
              zIndex: 0,
            }}
          >
            <span>
              {moment(values.meetingEndTime) < moment()
                ? `Ended: ${moment(values?.meetingEndTime).format("MM/DD/YYYY hh:mm A")}`
                : `Scheduled: ${moment(values?.meetingStartTime).format("MM/DD/YYYY hh:mm A")}`}
            </span>
            {moment(values.meetingEndTime) >= moment() && (
              <ContentCopyIcon
                onClick={handleCopyLink}
                style={{
                  fontSize: "18px",
                  cursor: "pointer",
                  marginLeft: "10px",
                  color: "#f37e20",
                }}
                titleAccess="Copy Meeting Link"
              />
            )}
          </div>
        )}
      </div>
    );
  },
);

const SingleTodo = ({
  groupList,
  selected,
  globalUser,
  setSelected,
  setALLmessages,
  setShowAllMessage,
  setModifiedMsgs,
  onReset,
  setIsHidden,
  setShowSidebar,
  socketRef,
  showActivity,
  meetingsActivity,
  callHistoryActivity,
  isLoading,
  isPaginationLoading,
  pastMeetings,
  scheduledMeetings,
  setDelayLodar,
  hasMoreGroups,
  handleLoadMoreGroups,
  guestMeetingsActivity,
  waitingCalls,
  meetingTypeFilter,
}) => {
  const { innerWidth: windowWidth } = useWindowSize();
  const [activeCall, setActiveCall] = useState([]);
  const loaderRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreGroups && !isLoading) {
          handleLoadMoreGroups();
        }
      },
      { threshold: 0.1 },
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => {
      if (loaderRef.current) {
        observer.unobserve(loaderRef.current);
      }
    };
  }, [hasMoreGroups, isLoading, handleLoadMoreGroups]);

  // Always compute a unified "activity time" so latest items (chat/call/meeting)
  // can consistently be shown at the top in the sidebar.
  const getItemActivityTime = (item) => {
    if (!item) return 0;
    // For calls, prioritize the call creation time
    if (callHistoryActivity) {
      if (item.Video_call_details?.createdAt)
        return new Date(item.Video_call_details?.createdAt).getTime();
      if (item.createdAt) return new Date(item.createdAt).getTime();
    }
    if (item.meetingStartTime) return new Date(item.meetingStartTime).getTime();
    if (item.lastMessage?.timestamp)
      return new Date(item.lastMessage.timestamp).getTime();
    return item.createdAt ? new Date(item.createdAt).getTime() : 0;
  };

  const checkActiveCall = async (group_id) => {
    try {
      const userStorage = localStorage.getItem("user");
      const token = userStorage ? JSON.parse(userStorage).data?.token : "";
      const response = await fetch(
        `/api/groups/check-active-call?group_id=${group_id}`,
        {
          headers: { "access-token": token },
        },
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.activeCall) {
          setActiveCall((prev) => [...new Set([...prev, group_id])]);
        } else {
          setActiveCall((prev) => prev.filter((id) => id !== group_id));
        }
      }
    } catch (error) {
      console.error("Error checking active call:", error);
    }
  };

  // Throttle socket-triggered checks to avoid rapid-fire API calls
  const socketCheckThrottleRef = useRef({});
  const throttledCheckActiveCall = (group_id) => {
    const now = Date.now();
    const lastCheck = socketCheckThrottleRef.current[group_id] || 0;
    const throttleDelay = 2000; // Only check once every 2 seconds per group

    if (now - lastCheck < throttleDelay) {
      return; // Skip if checked recently
    }

    socketCheckThrottleRef.current[group_id] = now;
    checkActiveCall(group_id);
  };

  useEffect(() => {
    if (!socketRef.current) return;
    const updateCalls = (data) => {
      if (data?.roomId) {
        throttledCheckActiveCall(data.roomId.toString());
      }
      if (data?.groupId) {
        throttledCheckActiveCall(data.groupId.toString());
      }
    };
    socketRef.current.on("incomming_call", updateCalls);
    socketRef.current.on("FE-leave", updateCalls);
    socketRef.current.on("FE-call-ended", updateCalls);
    socketRef.current.on("call-status-change", updateCalls);
    return () => {
      socketRef.current.off("incomming_call", updateCalls);
      socketRef.current.off("FE-leave", updateCalls);
      socketRef.current.off("FE-call-ended", updateCalls);
      socketRef.current.off("call-status-change", updateCalls);
    };
  }, [socketRef.current]);

  // Track which groups have been checked recently to avoid duplicate calls
  const checkedGroupsRef = useRef(new Set());
  const checkTimeoutRef = useRef(null);
  const cleanupTimeoutsRef = useRef([]); // Track all timeouts for proper cleanup

  useEffect(() => {
    if (!groupList?.length) return;

    // Clear any pending checks
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
      checkTimeoutRef.current = null;
    }

    // Clear all previous cleanup timeouts
    cleanupTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    cleanupTimeoutsRef.current = [];

    // Debounce: Wait 500ms before checking, and batch all checks together
    checkTimeoutRef.current = setTimeout(() => {
      const groupsToCheck = groupList
        .filter((group) => {
          // Only check groups that appear to have active calls
          const hasActiveStatus =
            group?.Video_call_details?.status === "active";
          // Don't re-check groups we've checked in the last 5 seconds
          const recentlyChecked = checkedGroupsRef.current.has(group._id);
          return hasActiveStatus && !recentlyChecked;
        })
        .slice(0, 10); // Limit to first 10 groups to avoid overwhelming the API

      // Mark groups as checked and set up cleanup
      groupsToCheck.forEach((group) => {
        checkedGroupsRef.current.add(group._id);
        // Remove from checked set after 5 seconds to allow re-checking
        const cleanupTimeout = setTimeout(() => {
          checkedGroupsRef.current.delete(group._id);
          // Remove from cleanup array
          cleanupTimeoutsRef.current = cleanupTimeoutsRef.current.filter(
            (t) => t !== cleanupTimeout,
          );
        }, 5000);
        cleanupTimeoutsRef.current.push(cleanupTimeout);
      });

      // Batch check groups with a small delay between each to avoid overwhelming
      groupsToCheck.forEach((group, index) => {
        const checkTimeout = setTimeout(() => {
          checkActiveCall(group._id);
          // Remove from cleanup array after execution
          cleanupTimeoutsRef.current = cleanupTimeoutsRef.current.filter(
            (t) => t !== checkTimeout,
          );
        }, index * 100); // Stagger calls by 100ms
        cleanupTimeoutsRef.current.push(checkTimeout);
      });
    }, 500); // Debounce by 500ms

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
        checkTimeoutRef.current = null;
      }
      // Clean up all tracked timeouts
      cleanupTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      cleanupTimeoutsRef.current = [];
    };
  }, [groupList?.length]); // Only re-run when length changes for efficiency

  const handleSelect = (values) => {
    if (selected?._id === values._id) return;
    onReset();
    setIsHidden(true);
    if (setShowSidebar) setShowSidebar(false); // Hide sidebar when chat is opened
    setALLmessages([]);
    setModifiedMsgs([]);
    setALLmessages([]);
    setModifiedMsgs([]);
    setSelected(values);
    setDelayLodar(true);
    if (windowWidth < 901) setShowAllMessage(true);
    if (windowWidth < 901) setShowAllMessage(true);
  };

  const filteredItems = useMemo(() => {
    if (!groupList) return [];
    if (showActivity) {
      const sortedChats = [...groupList].sort(
        (a, b) => getItemActivityTime(b) - getItemActivityTime(a),
      );
      return sortedChats.map((item) => ({ item, type: "chat" }));
    }
    if (callHistoryActivity) {
      const calls = groupList.filter((v) => v.Video_call_details != null);
      const sortedCalls = [...calls].sort(
        (a, b) => getItemActivityTime(b) - getItemActivityTime(a),
      );
      return sortedCalls.map((item) => ({ item, type: "call" }));
    }
    if (meetingsActivity) {
      const now = moment();
      const filtered = groupList.filter((v) => {
        // Only filter by Past/Scheduled
        // Optimize: Check if meetingEndTime exists before calling moment
        if (!v.meetingEndTime) return false;

        const isPast = moment(v.meetingEndTime).isBefore(now);
        const timeMatch =
          (pastMeetings && isPast) || (scheduledMeetings && !isPast);
        return timeMatch;
      });

      // Sort meetings by createdAt in descending order (latest created first)
      const sorted = [...filtered].sort((a, b) => {
        const timeA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        // Descending order: timeB - timeA (latest created date appears first)
        return timeB - timeA;
      });

      return sorted.map((item) => ({ item, type: "meeting" }));
    }
    if (guestMeetingsActivity) {
      // For guest meetings, we show all since we don't have past/scheduled filters yet
      const sorted = [...groupList].sort((a, b) => {
        const timeA = a.meetingStartTime
          ? new Date(a.meetingStartTime).getTime()
          : 0;
        const timeB = b.meetingStartTime
          ? new Date(b.meetingStartTime).getTime()
          : 0;
        return timeB - timeA;
      });
      return sorted.map((item) => ({ item, type: "meeting" }));
    }
    return [];
  }, [
    groupList,
    showActivity,
    callHistoryActivity,
    meetingsActivity,
    guestMeetingsActivity,
    pastMeetings,
    scheduledMeetings,
    meetingTypeFilter,
  ]);

  return (
    <>
      {isLoading ? (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <CircularProgress />
        </div>
      ) : filteredItems.length > 0 ? (
        filteredItems.map(({ item, type }) => {
          // Get current active call ID to exclude from waiting calls
          const activeCallId =
            typeof window !== "undefined"
              ? sessionStorage.getItem("activeCallId")
              : null;
          // Don't show waiting call indicator for the group user is currently in
          const isWaitingCall =
            waitingCalls?.some((c) => c.roomId === item._id) &&
            activeCallId !== item._id;

          return (
            <GroupItem
              key={item.uniqueId || item._id}
              values={item}
              type={type}
              selected={selected}
              globalUser={globalUser}
              styles={styles}
              windowWidth={windowWidth}
              activeCall={activeCall}
              waitingCall={isWaitingCall}
              onSelect={handleSelect}
              getFormattedMessageTime={getFormattedMessageTime}
            />
          );
        })
      ) : hasMoreGroups &&
        (showActivity ||
          callHistoryActivity ||
          meetingsActivity ||
          guestMeetingsActivity) &&
        !isLoading ? (
        <div
          style={{
            textAlign: "center",
            marginTop: "20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <CircularProgress size={20} />
          <span style={{ color: "#888", fontSize: "14px" }}>Searching...</span>
        </div>
      ) : (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          {guestMeetingsActivity || (meetingsActivity && meetingTypeFilter === "guest")
            ? "No guest meeting is scheduled"
            : meetingsActivity
              ? "No meeting is scheduled"
              : "No Data Found"}
        </div>
      )}

      {(showActivity ||
        callHistoryActivity ||
        meetingsActivity ||
        guestMeetingsActivity) &&
        hasMoreGroups &&
        !isLoading &&
        (filteredItems.length >= 16 || isPaginationLoading) && (
          <div ref={loaderRef} style={{ textAlign: "center", padding: "10px" }}>
            <CircularProgress size={20} />
          </div>
        )}
    </>
  );
};

export default memo(SingleTodo);
