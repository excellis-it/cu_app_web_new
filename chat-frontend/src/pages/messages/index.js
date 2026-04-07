import React, { useEffect, useState, useRef, useCallback } from "react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import styles from "../../styles/planning.module.css";
import { IconButton, InputAdornment, TextField, Checkbox } from "@mui/material";
import axios from "axios";
import InfoIcon from "@mui/icons-material/Info";
import MenuIcon from "@mui/icons-material/Menu";
import { io } from "socket.io-client";
import Link from "next/link";
import {
  useAppContext,
  clearClientAuthSession,
  beginVoluntaryLogout,
} from "../../../appContext/appContext";
import EditGroupModal from "../../../components/EditGroupModal";
import SingleTodo from "../../../components/SingleTodo";
import { useRouter } from "next/router";
import { Scrollbar } from "react-scrollbars-custom";
import Dropdown from "react-bootstrap/Dropdown";
import Modal from "react-bootstrap/Modal";
import LogoutIcon from "@mui/icons-material/Logout";
import CloseIcon from "@mui/icons-material/Close";
import ReportModal from "../../../components/ReportModal";
import ChatInfo from "../../../components/chatinfo";
import { toast } from "react-toastify";
import { MsgToast } from "../../../components/MsgToast";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
} from "@mui/material";
import { Notify } from "../../../components/webNotification";
import IncomingCallButton from "../../../components/incomming_call";
import CallStatusIndicator from "../../../components/CallStatusIndicator";
import Swal from "sweetalert2";
import Select from "react-select";
import moment from "moment";
import DeleteGroupModal from "../../../components/DeleteGroupModal";
import ReactDOM from "react-dom";
import SidebarPanel from "../../../components/SidebarPannel";
import Room from "../../../components/room";
import CreateGroupModal from "../../../components/CreateGroupModal";
import CreateMeetingModal from "../../../components/CreateMeetingModal";
import UserManagementModal from "../../../components/UserManagementModal";
import AddUserModal from "../../../components/AddUserModal";
import ProfileModal from "../../../components/ProfileModal";
import ChatArea from "../../../components/ChatArea";
import WelcomeScreen from "../../../components/WelcomeScreen";
import StartDirectChatModal from "../../../components/StartDirectChatModal";
import CreateGuestMeetingModal from "../../../components/CreateGuestMeetingModal";
import Fab from "@mui/material/Fab";
import AddIcon from "@mui/icons-material/Add";

const GroupMessage = () => {
  const router = useRouter();
  const { globalUser, setGlobalUser, loading: authLoading } = useAppContext();
  const config = {
    headers: { "access-token": globalUser?.data?.token },
    onUploadProgress: (progressEvent) => {
      const percentCompleted = Math.round(
        (progressEvent.loaded / progressEvent.total) * 100,
      );
      setProgress(percentCompleted);
    },
  };
  const urlBase64ToUint8Array = (base64String) => {
    if (typeof base64String !== "string") {
      throw new Error("Invalid base64 string input");
    }
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const rawData = atob(base64);
    return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)));
  };
  const [modifiedMsgs, setModifiedMsgs] = useState([]);
  const [isHidden, setIsHidden] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [icon, setIcon] = useState(<MenuIcon />);
  const [AllMEssages, setALLmessages] = useState([]);
  const [groupList, setGroupList] = useState([]);
  const [selected, setSelected] = useState();
  const [chkDel, setChkDel] = useState(true);
  const [update, setUpdate] = useState(false);
  const [message, setMessage] = useState();
  const [showAllMessage, setShowAllMessage] = useState();
  const [latest, setLatest] = useState();
  const [newGrp, setNewGrp] = useState();
  const socketRef = useRef(null);
  const [openModal, setOpenModal] = useState(false);
  const [delMsg, setDelMsg] = useState(null);
  const [frwdMsg, setFrwdMsg] = useState();
  const [rplyMsg, setRplyMsg] = useState(null);
  const [openModalInfo, setOpenModalInfo] = useState(null);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [openReportModal, setOpenReportModal] = useState(false);
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [skip, setSkip] = useState(0);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [showFetchMsg, setShowFetchMsg] = useState(false);
  const [fetchMoreMsg, setFetchMoreMsg] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [lastElement, setLastElement] = useState(null);
  const [readData, setReadData] = useState(null);
  const [deliverData, setDeliverData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaginationLoading, setIsPaginationLoading] = useState(false);
  const [reportType, setReportType] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [Uploadstatus, setUploadstatus] = useState(false);
  const [SEOmodalIsOpen, SEOsetModalIsOpen] = useState(false);
  const bodyLeftSecRef = useRef(null);
  const label = { inputProps: { "aria-label": "Checkbox demo" } };
  const [callActive, setCallActive] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showActivity, setShowActivity] = useState(true);
  const [callHistoryActivity, setCallHistoryActivity] = useState(false);
  const [showAllUsrModal, setShowAllUsrModal] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [groupDataDetails, setGroupDataDetails] = useState(null);
  const [meetingsActivity, setMeetingsActivity] = useState(false);
  const [meetingTypeFilter, setMeetingTypeFilter] = useState("groups");
  const [meetingStartTime, setMeetingStartTime] = useState("");
  const [meetingEndTime, setMeetingEndTime] = useState("");
  const [now, setNow] = useState(moment());
  const [deleteRespData, setDeleteRespData] = useState("");
  const [pastMeetings, setPastMeetings] = useState(false);
  const [scheduledMeetings, setScheduledMeetings] = useState(false);
  const [groupDataCallDetails, setGroupDataCallDetails] = useState(null);
  const [roomGroupId, setRoomGroupId] = useState(null); // ID of the group being called
  const [callSelected, setCallSelected] = useState(null);
  const [callModifiedMsgs, setCallModifiedMsgs] = useState([]);
  const [isCallTyping, setIsCallTyping] = useState(false);
  const [callTypingUser, setCallTypingUser] = useState(null);
  const [callMessage, setCallMessage] = useState("");
  const [callRplyMsg, setCallRplyMsg] = useState(null);
  const [showRoom, setShowRoom] = useState(false); // Controls Room visibility
  const [pendingCallPreview, setPendingCallPreview] = useState(null); // { roomId, callType } — triggers CallButton preview
  const [callType, setCallType] = useState("video"); // Default call type
  const [roomId, setRoomId] = useState(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [delayLodar, setDelayLodar] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false); // Track button visibility
  // Add these state variables to your component
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [replyJumpingId, setReplyJumpingId] = useState(false); // store which reply is loading
  const [groupSkip, setGroupSkip] = useState(0);
  const [hasMoreGroups, setHasMoreGroups] = useState(true);
  const [showDirectChatModal, setShowDirectChatModal] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarMeetings, setCalendarMeetings] = useState([]);
  const [meetingsLoder, setMeetingsLoder] = useState(false);
  const [active, setActive] = useState("all");
  const [showMobileCalendar, setShowMobileCalendar] = useState(false);
  const [mergedGuestMeetings, setMergedGuestMeetings] = useState([]);
  // Message cache for instant display when switching chats
  const messageCache = useRef(new Map());
  const deepLinkProcessedRef = useRef(false);
  const lastSelectedIdRef = useRef(null);

  // Track the *current* sidebar view independently of async closures
  // Possible values: 'chat' | 'meetings' | 'calls' | 'guest_meetings'
  const currentViewRef = useRef("chat");

  const GROUP_LIMIT = 16;

  const [googleConnected, setGoogleConnected] = useState(false);

  useEffect(() => {
    if (showRoom && selected) {
      setCallSelected(selected);
      setCallModifiedMsgs([...modifiedMsgs]);
    } else if (!showRoom) {
      setCallSelected(null);
      setCallModifiedMsgs([]);
      setIsCallTyping(false);
      setCallTypingUser(null);
    }
  }, [showRoom]);

  // Waiting calls state
  const [waitingCalls, setWaitingCalls] = useState([]);
  const webPushSyncInFlightRef = useRef(false);

  // Guest Meeting State
  const [showGuestMeetingModal, setShowGuestMeetingModal] = useState(false);
  const [guestMeetingsActivity, setGuestMeetingsActivity] = useState(false);
  const [guests, setGuests] = useState([]);
  const [guestSubject, setGuestSubject] = useState("");
  const [guestDescription, setGuestDescription] = useState("");
  const [guestStartTime, setGuestStartTime] = useState("");
  const [guestEndTime, setGuestEndTime] = useState("");
  const [guestLoading, setGuestLoading] = useState(false);

  // 3. Add cleanup in component unmount
  useEffect(() => {
    checkGoogleStatus();
    return () => {
      setALLmessages([]);
      setModifiedMsgs([]);
    };
  }, [globalUser]);

  useEffect(() => {
    // Handle Google Calendar connection success
    if (router.query.googleConnected === "success") {
      toast.success("Google Calendar connected successfully!");
      window.history.replaceState({}, document.title, "/messages");
      checkGoogleStatus();
    }

    // Handle deep linking to specific meeting - optimized for instant loading
    // This runs as soon as router.query is available
    if (
      router.isReady &&
      (router.query.groupId || router.query.pin) &&
      !deepLinkProcessedRef.current
    ) {
      const groupId = router.query.groupId;
      const pin = router.query.pin;
      console.log("[Deep Link] Loading meeting:", { groupId, pin });

      // Mark as processed to prevent multiple executions
      deepLinkProcessedRef.current = true;

      // Mark this as a deep link navigation for MeetingStatusBanner
      sessionStorage.setItem("isDeepLinkNavigation", "true");

      // Get token immediately from localStorage (no waiting for state)
      const storedUser = localStorage.getItem("user");

      // If no user/token, save the link and redirect to login
      if (!storedUser || !JSON.parse(storedUser)?.data?.token) {
        console.log(
          "[Deep Link] User not logged in. Saving link and redirecting...",
        );

        // Use router.asPath for the correct full path including all query params
        const redirectUrl = router.asPath;
        console.log("[Deep Link] Saving redirect URL:", redirectUrl);

        localStorage.setItem("redirectAfterLogin", redirectUrl);
        window.location.href = "/login";
        return;
      }

      console.log("[Deep Link] User is logged in. Proceeding...");
      const userData = JSON.parse(storedUser);
      const token = userData?.data?.token;
      // Switch to meetings tab immediately
      setShowActivity(false);
      setCallHistoryActivity(false);
      setMeetingsActivity(true);
      currentViewRef.current = "meetings";
      setActiveIndex(2);

      // Fetch and select the meeting from URL
      const loadMeetingFromUrl = async () => {
        try {
          setMeetingsLoder(true);

          // Validate token exists
          if (!token) {
            console.error("[Deep Link] No token available");
            setMeetingsLoder(false);
            toast.error("Authentication required. Please log in again.");
            return;
          }

          // Fetch specific meeting by ID or PIN - try groupId first, then pin as fallback
          let response;
          let targetMeeting = null;

          // Try with groupId first if available
          if (groupId) {
            const params = { slug: "meeting", _id: groupId };
            console.log("[Deep Link] Fetching meeting with groupId:", params);

            response = await axios.get(`/api/groups/getallmeetings`, {
              headers: { "access-token": token },
              params,
            });

            console.log("[Deep Link] API Response (groupId):", {
              success: response.data?.success,
              dataLength: response.data?.data?.length,
              data: response.data,
            });

            if (
              response.data?.success &&
              response.data?.data &&
              response.data.data.length > 0
            ) {
              targetMeeting = response.data.data[0];
            }
          }

          // If groupId lookup failed and we have a pin, try with pin
          if (!targetMeeting && pin) {
            const params = { slug: "meeting", pin: pin };
            console.log(
              "[Deep Link] Fetching meeting with pin (fallback):",
              params,
            );

            response = await axios.get(`/api/groups/getallmeetings`, {
              headers: { "access-token": token },
              params,
            });

            console.log("[Deep Link] API Response (pin):", {
              success: response.data?.success,
              dataLength: response.data?.data?.length,
              data: response.data,
            });

            if (
              response.data?.success &&
              response.data?.data &&
              response.data.data.length > 0
            ) {
              targetMeeting = response.data.data[0];
            }
          }

          if (targetMeeting) {
            // 1. Determine if meeting is past or future to set correct tab
            const now = new Date();
            const meetingEnd = targetMeeting.meetingEndTime
              ? new Date(targetMeeting.meetingEndTime)
              : targetMeeting.meetingStartTime
                ? new Date(targetMeeting.meetingStartTime)
                : new Date(targetMeeting.createdAt);

            const isPast = meetingEnd < now;

            // 2. Set the correct tab context
            if (isPast) {
              setPastMeetings(true);
              setScheduledMeetings(false);
            } else {
              setPastMeetings(false);
              setScheduledMeetings(true);
            }

            // 3. Ensure meeting has isTemp flag and select IMMEDIATELY to show meeting details page
            const meetingToSelect = {
              ...targetMeeting,
              isTemp: true, // Ensure it's recognized as a meeting
            };
            setSelected(meetingToSelect);
            setMeetingsLoder(false);

            // 4. Load full meetings list in background (don't wait for it)
            axios
              .get(`/api/groups/getallmeetings`, {
                headers: { "access-token": token },
                params: { limit: 1000, slug: "meeting" },
              })
              .then((fullResponse) => {
                if (fullResponse.data?.success && fullResponse.data?.data) {
                  setGroupList(
                    fullResponse.data.data.sort((a, b) => {
                      const timeA = a.meetingStartTime
                        ? new Date(a.meetingStartTime)
                        : new Date(a.createdAt);
                      const timeB = b.meetingStartTime
                        ? new Date(b.meetingStartTime)
                        : new Date(b.createdAt);
                      return timeB - timeA;
                    }),
                  );

                  // Update selected meeting with complete data if available
                  const completeMeeting = fullResponse.data.data.find(
                    (m) => m._id === targetMeeting._id,
                  );
                  if (completeMeeting) {
                    setSelected(completeMeeting);
                  }
                }
              })
              .catch((err) =>
                console.log("[Deep Link] Background load error:", err),
              );

            toast.success("Meeting loaded!", { autoClose: 1500 });

            // 5. Clean URL only AFTER successful load
            window.history.replaceState({}, document.title, "/messages");
          } else {
            setMeetingsLoder(false);
            console.warn("[Deep Link] Meeting not found. Response:", {
              success: response.data?.success,
              data: response.data?.data,
              params,
            });

            // Check if it's an authentication error
            if (
              response.status === 401 ||
              response.data?.error?.includes("token") ||
              response.data?.error?.includes("auth")
            ) {
              toast.error("Session expired. Please log in again.");
              localStorage.removeItem("user");
              window.location.href = "/login";
            } else {
              toast.error("Meeting not found. Please check the meeting link.");
            }
            window.history.replaceState({}, document.title, "/messages");
            // Reset ref on error so it can retry if needed
            deepLinkProcessedRef.current = false;
          }
        } catch (err) {
          console.error("[Deep Link] Error loading meeting from URL:", err);
          setMeetingsLoder(false);

          // Check if it's an authentication error
          if (
            err.response?.status === 401 ||
            err.response?.data?.error?.includes("token") ||
            err.response?.data?.error?.includes("auth")
          ) {
            toast.error("Session expired. Please log in again.");
            localStorage.removeItem("user");
            window.location.href = "/login";
          } else if (err.response?.status === 404) {
            toast.error("Meeting not found. Please check the meeting link.");
          } else {
            toast.error(
              `Failed to load meeting: ${err.response?.data?.error || err.message || "Unknown error"}`,
            );
          }
          window.history.replaceState({}, document.title, "/messages");
          // Reset ref on error so it can retry if needed
          deepLinkProcessedRef.current = false;
        }
      };

      loadMeetingFromUrl();
    }

    // Reset ref when query params change (new deep link)
    if (router.isReady && !(router.query.groupId || router.query.pin)) {
      deepLinkProcessedRef.current = false;
    }
  }, [router.query, router.isReady]);

  // Check for "syncing=true" in URL on mount to show progress bar
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const isSyncing = params.get("syncing") === "true";
      const isConnected = params.get("googleConnected") === "success";

      if (isConnected && isSyncing) {
        // Show progress bar for background sync
        Swal.fire({
          title: "Syncing Calendar...",
          html: "Adding your ExTalk meetings to Google Calendar.<br>This happens in the background.",
          timer: 5000, // Show for 5 seconds to give user feedback
          timerProgressBar: true,
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        }).then(() => {
          // Clean URL
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);

          toast.success("Google Calendar connected!");
          checkGoogleStatus(); // Update status
          fetchCalendarMeetings(); // Refresh events
        });
      } else if (isConnected) {
        // Just connected without sync flag (fallback)
        toast.success("Google Calendar connected successfully!");
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        checkGoogleStatus();
      }
    }
  }, []); // Run once on mount

  const checkGoogleStatus = async () => {
    if (!globalUser?.data?.user?._id) return;
    try {
      const resp = await axios.get(
        `/api/auth/google/status/${globalUser.data.user._id}`,
      );
      setGoogleConnected(resp.data?.data?.isConnected || false);
    } catch (err) {
      console.error("Error checking google status", err);
    }
  };

  const handleGoogleConnect = async () => {
    try {
      const resp = await axios.get(
        `/api/auth/google/url?userId=${globalUser.data.user._id}`,
      );
      console.log("google calendar url", resp);
      if (resp.data.success && resp.data.data) {
        window.location.href = resp.data.data;
      }
    } catch (err) {
      toast.error("Failed to connect to Google");
    }
  };

  const handleGoogleDisconnect = async () => {
    // Show confirmation dialog
    const result = await Swal.fire({
      title: "Disconnect Google Calendar?",
      text: "All ExTalk meetings will be removed from your Google Calendar",
      // icon: 'warning',
      showCancelButton: true,
      confirmButtonText: "Yes, disconnect",
      cancelButtonText: "Cancel",
      customClass: {
        confirmButton: "chat-yes-btn",
        cancelButton: "chat-cancel-btn",
      },
    });

    if (!result.isConfirmed) {
      return; // User cancelled
    }

    // Show loading dialog
    Swal.fire({
      title: "Disconnecting...",
      text: "Removing meetings from Google Calendar",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      await axios.post(`/api/auth/google/disconnect`, {
        userId: globalUser.data.user._id,
      });
      setGoogleConnected(false);
      Swal.close();
      toast.success("Disconnected from Google Calendar");
      fetchCalendarMeetings(); // Refresh the calendar
    } catch (err) {
      Swal.close();
      toast.error("Failed to disconnect");
    }
  };

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    userType: globalUser?.data?.user?.userType === "SuperAdmin" ? "" : "user",
    password: "",
  });

  const [editFormData, setEditFormData] = useState({
    name: "",
    email: "",
    userType: globalUser?.data?.user?.userType === "SuperAdmin" ? "" : "user",
    _id: "",
    password: "",
    accountStatus: globalUser?.data?.user?.accountStatus || "active",
  });

  const [isAddGroupLoading, setIsAddGroupLoading] = useState(false);

  const handleTimeChange = ({
    meetingStartTime: start,
    meetingEndTime: end,
  }) => {
    if (start !== undefined) setMeetingStartTime(start);
    if (end !== undefined) setMeetingEndTime(end);
  };

  const onDeleteResponse = ({ data }) => {
    setDeleteRespData(data);
    setIsLoading(true);
    getAllMeetings();
    if (selected?._id.toString() === data?._id.toString()) {
      setSelected(null);
    }
  };

  const handleLogout = async () => {
    Swal.fire({
      title: "Are you sure?",
      text: "You want to logout?",
      // icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: "#1da678",
      cancelButtonText: "Cancel",
      confirmButtonText: "Yes, logout",
      reverseButtons: true,

      didOpen: () => {
        const confirmBtn = document.querySelector(".swal2-confirm");
        const cancelBtn = document.querySelector(".swal2-cancel");

        if (confirmBtn) {
          confirmBtn.style.backgroundColor = "#1da678";
          confirmBtn.style.color = "#fff";
          confirmBtn.style.border = "none";
          confirmBtn.style.borderRadius = "30px";
        }

        if (cancelBtn) {
          cancelBtn.style.backgroundColor = "#d1d5d8";
          cancelBtn.style.color = "#64789b";
          cancelBtn.style.border = "none";
          cancelBtn.style.borderRadius = "30px";
        }
      },
    }).then(async (result) => {
      if (result.isConfirmed) {
        beginVoluntaryLogout();
        const raw = localStorage.getItem("user");
        try {
          const logoutUser = raw ? JSON.parse(raw) : null;
          if (logoutUser?.data?.user?._id) {
            await axios.post(`/api/users/logout/web`, {
              user_id: logoutUser.data.user._id,
            });
          }
        } catch (e) {
          console.warn("Logout API failed", e);
        }
        clearClientAuthSession(setGlobalUser);
        toast.success("Logged out successfully");
        router.replace("/login");
      }
    });
  };
  const toggleVisibility = () => {
    // Always toggle sidebar visibility, regardless of chat area state
    setShowSidebar(!showSidebar);
    setIcon(isHidden ? <MenuIcon /> : <MenuIcon />);
  };

  const handleReset = () => {
    setIsHidden(true);
    setIcon(<MenuIcon />);
  };

  // On page load (including reload), clear stale call session state.
  // After a reload the Room component is not mounted, so the user is no longer
  // in the call — but sessionStorage still has the old values which would
  // incorrectly suppress incoming-call ringtones or confuse other logic.
  useEffect(() => {
    if (!showRoom) {
      sessionStorage.removeItem("userInActiveCall");
      sessionStorage.removeItem("activeCallId");
      sessionStorage.removeItem("callStatus");
    }
  }, []);

  //socket connection
  useEffect(() => {
    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || "ws://69.62.84.25:10018";
    socketRef.current = io.connect(socketUrl, {
      // Try polling first and upgrade to websocket for mobile-network resiliency.
      transports: ["polling", "websocket"],
      allowEIO3: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    // On reconnect the socket gets a new ID. Re-join the personal user room
    // so targeted events (incomming_call, waiting_call, FE-call-ended, etc.) are received.
    socketRef.current.on("reconnect", () => {
      const userId = globalUser?.data?.user?._id;
      if (userId) {
        socketRef.current.emit("joinSelf", userId);
      }
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  // Service Worker message listener for notification sounds and navigation
  useEffect(() => {
    const handleServiceWorkerMessage = (event) => {
      const { type, sound, groupId } = event.data || {};

      // Play notification sound — only works if the tab has had user interaction first.
      // If blocked by autoplay policy, the error is swallowed silently (no action needed;
      // the OS system notification itself provides the alert).
      if (type === "PLAY_NOTIFICATION_SOUND" && sound) {
        try {
          const audio = new Audio(sound);
          audio.volume = 0.7;
          audio.play().catch(() => {
            // Silently ignore NotAllowedError — the push notification banner still shows
          });
        } catch (_) {}
      }

      // Navigate to chat when notification is clicked
      if (type === "NAVIGATE_TO_CHAT" && groupId) {
        // Find the group in the list and select it
        const targetGroup = groupList.find((g) => g._id === groupId);
        if (targetGroup) {
          setSelected(targetGroup);
        } else {
          // If not in current list, fetch it
          router.push(`/messages?groupId=${groupId}`);
        }
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "message",
        handleServiceWorkerMessage,
      );
    }

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "message",
          handleServiceWorkerMessage,
        );
      }
    };
  }, [groupList, router]);

  const joinSelf = async () => {
    await socketRef.current.emit("joinSelf", globalUser?.data?.user._id);
  };

  useEffect(() => {
    joinSelf();
  }, [globalUser]);

  // Listen for waiting calls socket events
  useEffect(() => {
    if (!socketRef.current) return;

    // Handle waiting calls
    const handleWaitingCall = (data) => {
      setWaitingCalls((prev) => {
        // Use String comparison to avoid ObjectId vs string mismatch
        if (prev.find((c) => String(c.roomId) === String(data.roomId)))
          return prev;
        return [...prev, data];
      });
    };

    // Clear waiting calls when call truly ends (isActive: false)
    const handleCallEnded = (data) => {
      if (data?.roomId) {
        setWaitingCalls((prev) =>
          prev.filter((c) => String(c.roomId) !== String(data.roomId)),
        );
      }
    };

    // Only clear waiting indicator when call is fully over (isActive false), not on mid-call leaves
    const handleLeave = (data) => {
      if (data?.roomId && data?.isActive === false) {
        setWaitingCalls((prev) =>
          prev.filter((c) => String(c.roomId) !== String(data.roomId)),
        );
      }
    };

    socketRef.current.on("waiting_call", handleWaitingCall);
    socketRef.current.on("FE-call-ended", handleCallEnded);
    socketRef.current.on("FE-leave", handleLeave);

    return () => {
      // Always pass handler reference to off() — bare off(event) removes ALL listeners
      // including those registered by child components like SingleTodo
      socketRef.current.off("waiting_call", handleWaitingCall);
      socketRef.current.off("FE-call-ended", handleCallEnded);
      socketRef.current.off("FE-leave", handleLeave);
    };
  }, [socketRef.current]);

  const handleAcceptIncomingCall = useCallback(
    async (callData = {}) => {
      const targetRoomId = callData?.roomId?.toString();
      if (!targetRoomId) return;

      // Route UI to chat view and mark this as a navigation that should auto-open join preview.
      sessionStorage.setItem("isDeepLinkNavigation", "true");
      // Signal CallButton to auto-open the call preview for this group.
      setPendingCallPreview({ roomId: targetRoomId, callType: callData?.callType || "video" });
      setShowActivity(true);
      setCallHistoryActivity(false);
      setMeetingsActivity(false);
      setGuestMeetingsActivity(false);
      currentViewRef.current = "chat";
      setActiveIndex(0);

      const targetFromList = (groupList || []).find(
        (group) => String(group?._id) === targetRoomId,
      );

      if (targetFromList) {
        setSelected(targetFromList);
        setIsHidden(true);
        setShowSidebar(false);
        return;
      }

      try {
        const result = await axios.get(`/api/groups/get-group-details`, {
          params: { id: targetRoomId },
          headers: { "access-token": globalUser?.data?.token },
        });
        const fetchedGroup = result?.data?.data;
        if (fetchedGroup?._id) {
          setGroupList((prev) => [fetchedGroup, ...(prev || [])]);
          setSelected(fetchedGroup);
          setIsHidden(true);
          setShowSidebar(false);
          return;
        }
      } catch (error) {
        console.error("Unable to fetch incoming call group details:", error);
      }

      // Fallback so message panel can still attempt loading by id.
      setSelected({
        _id: targetRoomId,
        groupName: callData?.groupName || "Group",
        isTemp: false,
      });
      setIsHidden(true);
      setShowSidebar(false);
    },
    [groupList, globalUser?.data?.token],
  );

  // Instantly reflect newly created meetings for participants (badge/count + list + calendar)
  useEffect(() => {
    if (!socketRef.current) return;
    const userId = globalUser?.data?.user?._id;

    const handleMeetingCreated = (payload) => {
      // Admin emits `res.data.data`; backend may wrap it. Normalize defensively.
      const meeting = payload?.data?.data || payload?.data || payload;

      if (!meeting?._id) return;

      // If payload includes participants, ignore events not meant for this user.
      const participants =
        meeting?.currentUsersId ||
        meeting?.currentUsers ||
        meeting?.users ||
        [];

      if (userId && Array.isArray(participants) && participants.length > 0) {
        const isParticipant = participants.some(
          (u) => String(u?._id || u) === String(userId),
        );
        if (!isParticipant) return;
      }

      const normalizedMeeting = {
        ...meeting,
        isTemp: true,
      };

      // Give a default unreadCount so the UI badge appears instantly (if backend doesn't provide it)
      if (typeof normalizedMeeting.unreadCount !== "number") {
        normalizedMeeting.unreadCount = 1;
      }

      // Update meeting list instantly ONLY if user is on Meetings screen (avoid polluting chat list)
      if (meetingsActivity) {
        setGroupList((prev) => {
          const prevList = Array.isArray(prev) ? prev : [];
          const existsIdx = prevList.findIndex(
            (g) => String(g._id) === String(normalizedMeeting._id),
          );

          const next =
            existsIdx >= 0
              ? prevList.map((g, idx) =>
                  idx === existsIdx ? { ...g, ...normalizedMeeting } : g,
                )
              : [normalizedMeeting, ...prevList];

          return next.sort((a, b) => {
            const timeA = a.meetingStartTime
              ? new Date(a.meetingStartTime)
              : new Date(a.createdAt || 0);
            const timeB = b.meetingStartTime
              ? new Date(b.meetingStartTime)
              : new Date(b.createdAt || 0);
            return timeB - timeA;
          });
        });
      }

      // Update calendar grid instantly if it falls within visible range
      try {
        const start = startOfWeek(startOfMonth(currentMonth));
        const end = endOfWeek(endOfMonth(currentMonth));
        const startTime = new Date(normalizedMeeting.meetingStartTime);
        if (
          !Number.isNaN(startTime?.getTime()) &&
          startTime >= start &&
          startTime <= end
        ) {
          setCalendarMeetings((prev) => {
            const prevList = Array.isArray(prev) ? prev : [];
            const exists = prevList.some(
              (m) => String(m._id) === String(normalizedMeeting._id),
            );
            if (exists) return prevList;
            return [...prevList, normalizedMeeting];
          });
        }
      } catch (e) {
        // no-op: calendar update is best-effort
      }
    };

    socketRef.current.on("meeting_created", handleMeetingCreated);
    return () => {
      socketRef.current?.off("meeting_created", handleMeetingCreated);
    };
  }, [globalUser?.data?.user?._id, meetingsActivity, currentMonth]);

  useEffect(() => {
    if (!authLoading && !globalUser) {
      router.push("/login");
    }
  }, [globalUser, authLoading]);

  useEffect(() => {
    const syncWebPushToken = async () => {
      if (!globalUser?.data?.token || !globalUser?.data?.user?._id) return;
      if (webPushSyncInFlightRef.current) return;

      const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
      const isSecureContextNow =
        window.isSecureContext ||
        window.location.protocol === "https:" ||
        window.location.hostname === "localhost";

      if (!PUBLIC_VAPID_KEY || !isSecureContextNow) return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

      webPushSyncInFlightRef.current = true;
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") return;
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
          });
        }

        if (!subscription) return;
        const newWebPushToken = JSON.stringify(subscription);
        const currentWebPushToken = globalUser?.data?.user?.webPushToken || "";
        if (newWebPushToken === currentWebPushToken) return;

        const tokenConfig = {
          headers: { "access-token": globalUser?.data?.token },
        };
        const formData = new FormData();
        formData.append("webPushToken", newWebPushToken);
        await axios.post("/api/users/update-user", formData, tokenConfig);

        const updatedUserState = {
          ...globalUser,
          data: {
            ...globalUser.data,
            user: {
              ...globalUser.data.user,
              webPushToken: newWebPushToken,
            },
          },
        };
        setGlobalUser(updatedUserState);
        localStorage.setItem("user", JSON.stringify(updatedUserState));
      } catch (err) {
        console.warn("[Push] webPushToken sync failed:", err);
      } finally {
        webPushSyncInFlightRef.current = false;
      }
    };

    syncWebPushToken();
  }, [globalUser?.data?.token, globalUser?.data?.user?._id]);

  useEffect(() => {
    deleteMsg();
  }, [delMsg]);
  const fileInputRef = useRef(null);

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    // You can handle the selected file here, like uploading it to a server or processing it
    handleUserImageUpload(file);
  };
  const handleUserImageUpload = async (e) => {
    const formData = new FormData();
    formData.append("file", e);
    const resp = await axios.post("/api/users/update-user", formData, config);
    resp.data.success &&
      setGlobalUser({
        ...globalUser,
        data: {
          ...globalUser.data,
          user: {
            ...globalUser.data.user,
            image: resp.data.data.image,
          },
        },
      });
    localStorage.setItem(
      "user",
      JSON.stringify({
        ...globalUser,
        data: {
          ...globalUser.data,
          user: {
            ...globalUser.data.user,
            image: resp?.data?.data?.image,
          },
        },
      }),
    );
  };

  const roleOptions = [
    { value: "admin", label: "Admin" },
    { value: "user", label: "Member" },
  ];
  const selectedRole =
    roleOptions.find(
      (role) => role.value === editFormData?.userType?.toLowerCase(),
    ) || roleOptions.find((role) => role.value === "user");

  const accountStatusOptions = [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ];
  const selectedAccountStatus = accountStatusOptions.find(
    (status) =>
      status.value === editFormData?.accountStatus?.toLocaleLowerCase(),
  );

  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
  };

  useEffect(() => {
    setGroupSkip(0);
    setHasMoreGroups(true);

    if (guestMeetingsActivity) {
      getAllGuestMeetings(0);
    } else if (searchQuery !== "") {
      getSearchContact(0);
    } else {
      if (meetingsActivity) {
        getAllMeetings(0);
      } else {
        // Default to chat contacts if not in meetings/guest meetings
        getContact(0, active);
      }
    }
  }, [searchQuery]);

  const getSearchContact = async (skip = 0) => {
    setLoading(true);
    try {
      // Determine the correct endpoint based on current view
      let url = `/api/groups/getall`; // Default to all groups
      let params = {
        searchQuery: searchQuery,
        limit: GROUP_LIMIT,
        skip: skip,
      };

      if (meetingsActivity) {
        url = `/api/groups/getallmeetings`;
        params.slug = "meeting";
      } else if (guestMeetingsActivity) {
        // Guest meetings have their own endpoint, but for search we might need to handle differently
        url = `/api/groups/getallmeetings`;
        params.slug = "meeting";
      }

      const configWithParams = {
        headers: {
          "access-token": globalUser?.data?.token,
        },
        params: params,
      };

      const result = await axios.get(url, configWithParams);
      if (result.data.success) {
        const newData = result.data.data;
        if (newData.length < GROUP_LIMIT) {
          setHasMoreGroups(false);
        } else {
          setHasMoreGroups(true);
        }

        if (skip === 0) {
          setGroupList(
            newData.sort((a, b) => {
              const timestampA = a.lastMessage
                ? new Date(a.lastMessage.timestamp)
                : new Date(a.createdAt);
              const timestampB = b.lastMessage
                ? new Date(b.lastMessage.timestamp)
                : new Date(b.createdAt);
              return timestampB - timestampA;
            }),
          );
        } else {
          setGroupList((prev) => [...prev, ...newData]);
        }
      }
    } catch (error) {
      console.error("Error fetching searched groups:", error.message);
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const getAllGuestMeetings = async (skip = 0, isPagination = false) => {
    // Only run if we are in a context that expects guest meetings
    if (
      !guestMeetingsActivity &&
      !(meetingsActivity && meetingTypeFilter === "guest")
    ) {
      console.log(
        "[getAllGuestMeetings] Aborted - neither guest view nor guest filter active",
      );
      return;
    }

    try {
      const response = await axios.get(`/api/groups/guest-meeting/getall`, {
        ...config,
        params: {
          searchQuery: searchQuery,
        },
      });

      if (response.data.success) {
        let newData = response.data.data;

        // No pagination logic for now as API might not support it yet
        setHasMoreGroups(false);

        if (skip === 0) {
          const mappedGuest = newData.map((meeting) => ({
            _id: meeting._id,
            groupName: `${meeting.topic || "Guest Meeting"} (Guest)`,
            groupDescription: meeting.description || meeting.status,
            meetingStartTime: meeting.startTime,
            meetingEndTime: meeting.endTime,
            isTemp: true,
            isGuestMeeting: true,
            pin: meeting.pin,
            link: meeting.meetingLink,
            guest: meeting.guest || [], // Array of guests
            // For backward compatibility, set first guest as primary
            guestName: meeting.guest?.[0]?.name || "Guest",
            guestEmail: meeting.guest?.[0]?.email || "",
          }));

          // Store for merged Meetings view
          setMergedGuestMeetings(mappedGuest);

          // When in dedicated Guest Meetings tab, show only guest meetings
          setGroupList(
            mappedGuest.sort((a, b) => {
              const timeA = a.meetingStartTime
                ? new Date(a.meetingStartTime)
                : new Date(a.createdAt);
              const timeB = b.meetingStartTime
                ? new Date(b.meetingStartTime)
                : new Date(b.createdAt);
              return timeB - timeA;
            }),
          );
        } else {
          // Append logic if pagination is supported later
          // setGroupList(prev => [...prev, ...newData]);
        }
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error fetching guest meetings:", error.message);
      setIsLoading(false);
    }
  };

  const getAllMeetings = async (skip = 0, isPagination = false) => {
    // Only run if in meetings view and filter is NOT guest
    if (
      !meetingsActivity ||
      currentViewRef.current !== "meetings" ||
      meetingTypeFilter === "guest"
    ) {
      console.log(
        "[getAllMeetings] Aborted - view inactive or guest filter selected",
      );
      return;
    }

    setLoading(true);
    if (skip === 0) setIsLoading(true);
    if (isPagination) setIsPaginationLoading(true);

    try {
      const config = {
        headers: {
          Authorization: `Bearer ${globalUser.token}`,
        },
      };

      const params = {
        limit: GROUP_LIMIT,
        skip: skip,
        searchQuery: searchQuery,
      };

      let url = `/api/groups/getallmeetings`;
      if (searchQuery) {
        url = `/api/groups/search`;
        params.type = "meeting";
      }

      // Add user ID to params if needed by backend for 'my meetings'
      if (globalUser?.data?.user?._id) {
        params.userId = globalUser.data.user._id;
        params.slug = "meeting";
      }

      const response = await axios.get(url, {
        ...config,
        params: params,
      });

      if (response.data.success) {
        // Guard against stale responses if user switched
        if (
          !meetingsActivity ||
          currentViewRef.current !== "meetings" ||
          meetingTypeFilter === "guest"
        ) {
          console.log(
            "[getAllMeetings] Ignoring response because view changed",
          );
          setIsLoading(false);
          setIsPaginationLoading(false);
          return;
        }

        let newData = response.data.data;
        const rawCount = newData.length;

        // Filter out any items without valid meeting times
        newData = newData.filter((item) => {
          if (!item.meetingStartTime || item.meetingStartTime === "null")
            return false;
          const date = new Date(item.meetingStartTime);
          return !isNaN(date.getTime());
        });

        if (rawCount < GROUP_LIMIT) {
          setHasMoreGroups(false);
        } else {
          setHasMoreGroups(true);
        }

        if (skip === 0) {
          let finalData = [...newData];

          // if (googleConnected && !searchQuery) {
          //   try {
          //     const start = startOfMonth(currentMonth);
          //     const end = endOfMonth(currentMonth);

          //     const calendarResponse = await axios.get('/api/google-calendar/events', {
          //       params: {
          //         start: start.toISOString(),
          //         end: end.toISOString()
          //       },
          //       headers: {
          //         Authorization: `Bearer ${globalUser.token}`
          //       }
          //     });

          //     if (calendarResponse?.data?.success) {
          //       const calendarEvents = calendarResponse.data.data.map(event => ({
          //         _id: event.id,
          //         groupName: event.summary,
          //         groupDescription: event.description,
          //         meetingStartTime: event.start.dateTime || event.start.date,
          //         meetingEndTime: event.end.dateTime || event.end.date,
          //         isGoogleEvent: true,
          //         link: event.htmlLink
          //       }));
          //       finalData = [...finalData, ...calendarEvents];
          //     } else {
          //       finalData = [...finalData, ...newData];
          //     }
          //   } catch (error) {
          //     console.error("Error fetching calendar events:", error);
          //   }
          // }

          setGroupList(
            finalData.sort((a, b) => {
              const timeA = a.meetingStartTime
                ? new Date(a.meetingStartTime)
                : a.lastMessage
                  ? new Date(a.lastMessage.timestamp)
                  : new Date(a.createdAt);
              const timeB = b.meetingStartTime
                ? new Date(b.meetingStartTime)
                : b.lastMessage
                  ? new Date(b.lastMessage.timestamp)
                  : new Date(b.createdAt);
              return timeB - timeA;
            }),
          );
        } else {
          setGroupList((prev) => [...prev, ...newData]);
        }
        setIsLoading(false);
        setIsPaginationLoading(false);
      }
    } catch (error) {
      console.error("Error fetching meetings:", error.message);
      setIsLoading(false);
      setIsPaginationLoading(false);
    }
  };

  const [isFetchingMeetings, setIsFetchingMeetings] = useState(false);

  const fetchCalendarMeetings = async () => {
    setIsFetchingMeetings(true);
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    try {
      const response = await axios.get(`/api/groups/getallmeetings`, {
        ...config,
        params: {
          limit: 1000,
          slug: "meeting",
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
      });

      let allMeetings = [];
      if (response.data.success) {
        allMeetings = response.data.data;
      }

      // Fetch guest meetings
      try {
        const guestResponse = await axios.get(
          `/api/groups/guest-meeting/getall`,
          {
            ...config,
            params: {
              startDate: start.toISOString(),
              endDate: end.toISOString(),
            },
          },
        );

        if (guestResponse.data.success) {
          const guestMeetings = guestResponse.data.data.map((meeting) => ({
            _id: meeting._id,
            groupName: meeting.topic || "Guest Meeting",
            groupDescription: meeting.description || meeting.status,
            meetingStartTime: meeting.startTime,
            meetingEndTime: meeting.endTime,
            isTemp: true,
            isGuestMeeting: true,
            pin: meeting.pin,
            link: meeting.meetingLink,
            guest: meeting.guest || [],
            createdAt: meeting.createdAt, // Include createdAt
          }));
          allMeetings = [...allMeetings, ...guestMeetings];
        }
      } catch (err) {
        console.error("Error fetching guest meetings for calendar:", err);
      }

      // Fetch Google events if connected
      if (googleConnected && globalUser?.data?.user?._id) {
        try {
          const googleResp = await axios.get(`/api/auth/google/events`, {
            params: {
              userId: globalUser.data.user._id,
              timeMin: start.toISOString(),
              timeMax: end.toISOString(),
            },
          });
          if (googleResp.data.success && googleResp.data.data) {
            console.log(
              `[Frontend] Received ${googleResp.data.data.length} Google events from API`,
            );
            // Include all events (including holidays) in calendar view
            const googleEvents = googleResp.data.data.map((event) => ({
              _id: event.id,
              groupName:
                event.summary || event.calendarName || "Untitled Event",
              meetingStartTime: event.start.dateTime || event.start.date,
              meetingEndTime: event.end.dateTime || event.end.date,
              isGoogleEvent: true,
              isHoliday: event.isHoliday,
              link: event.hangoutLink || event.htmlLink,
              groupDescription:
                (event.description || "") +
                (event.isHoliday ? " (Holiday)" : ""),
              isTemp: true,
              createdAt:
                event.created || event.start.dateTime || event.start.date, // Include created or fallback to start time
            }));
            const holidayEvents = googleEvents.filter((e) => e.isHoliday);
            console.log(
              `[Frontend] Mapped to ${googleEvents.length} events (${holidayEvents.length} holidays for calendar)`,
            );
            allMeetings = [...allMeetings, ...googleEvents];
          }
        } catch (err) {
          console.error("Error fetching google events", err);
        }
      }

      setCalendarMeetings(allMeetings);
    } catch (error) {
      console.error("Error fetching calendar meetings:", error.message);
    } finally {
      setIsFetchingMeetings(false);
    }
  };

  // Keep guest meetings data ready for merged Meetings view - NOT NEEDED AS WE REVERTED
  // useEffect(() => {
  //   // When switching into Meetings view, ensure we have the latest guest meetings
  //   if (meetingsActivity) {
  //     console.log("[MergedMeetings] Meetings tab active -> ensure guest meetings are loaded");
  //     // Temporarily set guestMeetingsActivity to true to allow getAllGuestMeetings guard,
  //     // then restore it back. This reuses existing guest fetch logic.
  //     const prevGuestState = guestMeetingsActivity;
  //     setGuestMeetingsActivity(true);
  //     getAllGuestMeetings(0).finally(() => {
  //       setGuestMeetingsActivity(prevGuestState);
  //     });
  //   }
  // }, [meetingsActivity, searchQuery]);

  const handleLoadMoreGroups = useCallback(() => {
    if (!hasMoreGroups || isLoading || isPaginationLoading) return;
    const nextSkip = groupSkip + GROUP_LIMIT;
    setGroupSkip(nextSkip);
    setIsPaginationLoading(true);

    if (guestMeetingsActivity) {
      getAllGuestMeetings(nextSkip, true);
    } else if (searchQuery !== "") {
      getSearchContact(nextSkip, true);
    } else if (meetingsActivity) {
      if (meetingTypeFilter === "guest") {
        getAllGuestMeetings(nextSkip, true);
      } else {
        getAllMeetings(nextSkip, true);
      }
    } else {
      getContact(nextSkip, active, true);
    }
  }, [
    hasMoreGroups,
    isLoading,
    isPaginationLoading,
    groupSkip,
    searchQuery,
    meetingsActivity,
    active,
    guestMeetingsActivity,
    meetingTypeFilter,
  ]);

  // Handle when a direct chat is started from the modal
  const handleDirectChatStarted = (directChat) => {
    // Check if chat already exists in the list
    const existingIndex = groupList.findIndex((g) => g._id === directChat._id);

    if (existingIndex === -1) {
      // New chat - add to list
      setGroupList((prev) => [directChat, ...prev]);
    }

    // Select the chat to open it
    setSelected(directChat);
    setShowDirectChatModal(false);
  };

  // Handle starting a direct chat from the All Members list
  const handleStartDirectChatFromMember = async (member) => {
    // 1st: Instant Local check in groupList
    const targetId = member._id?.toString();
    const existingDirectChat = groupList.find(
      (group) =>
        group.isDirect &&
        group.currentUsersId?.some((id) => id.toString() === targetId),
    );

    if (existingDirectChat) {
      Swal.fire({
        title: "Connecting...",
        didOpen: () => {
          Swal.showLoading();
        },
        allowOutsideClick: false,
        showConfirmButton: false,
        timer: 500,
      });
      handleFinalizeDirectChat(existingDirectChat);
      return;
    }

    // If not local, show "Chat Personally?" prompt
    Swal.fire({
      title: "Chat Personally?",
      text: `Start a private conversation with ${member.name}?`,
      // icon: 'question',
      showCancelButton: true,
      confirmButtonColor: "#F47920",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Send Hi",
      cancelButtonText: "No",
      customClass: {
        confirmButton: "chat-hi-btn",
        cancelButton: "chat-no-btn",
      },
    }).then(async (result) => {
      if (result.isConfirmed) {
        // Show loader while doing API and sending Hi
        Swal.fire({
          title: "Sending...",
          didOpen: () => {
            Swal.showLoading();
          },
          allowOutsideClick: false,
          showConfirmButton: false,
        });

        try {
          const response = await axios.post(
            "/api/groups/direct",
            {
              targetUserId: member._id,
            },
            config,
          );

          if (response.data.success) {
            const directChat = response.data.data;
            const isNew = directChat.isNew;

            // Only send Hi if it's a new conversation
            if (isNew) {
              await handleSendAutoHi(directChat);
            }

            handleFinalizeDirectChat(directChat);
          }
        } catch (error) {
          console.error("Error starting direct chat:", error);
          toast.error("Failed to start chat. Please try again.");
        } finally {
          Swal.close();
        }
      }
    });
  };

  // Helper: Send "Hi" and update socket/cache
  const handleSendAutoHi = async (directChat) => {
    try {
      const messageFormData = new FormData();
      messageFormData.append("groupId", directChat._id);
      messageFormData.append("senderId", globalUser?.data?.user._id);
      messageFormData.append("senderName", globalUser?.data?.user.name);
      messageFormData.append("message", "Hi");
      messageFormData.append("messageType", "text");

      const res = await axios.post(
        `/api/groups/addnewmsg`,
        messageFormData,
        config,
      );

      if (res?.data?.success) {
        const newMessage = res.data.data.data;
        addmsgToSide(newMessage);

        const transformedMessage = {
          time: newMessage.timestamp,
          type: "receiver",
          textFileType: "text",
          name: globalUser?.data?.user.name,
          senderId: globalUser?.data?.user._id,
          img: "",
          allRecipients: newMessage.allRecipients,
          message: "Hi",
          deliveredTo: [],
          readBy: [],
          deliveredToAll: false,
          readByALL: false,
          _id: newMessage._id,
          forwarded: false,
          replyOf: null,
          fileName: null,
          position: "right",
        };

        messageCache.current.set(directChat._id, {
          raw: [newMessage],
          transformed: [transformedMessage],
        });

        if (socketRef.current) {
          let socketBody = {
            _id: newMessage._id,
            receiverId: newMessage.allRecipients.filter(
              (id) => id !== globalUser.data.user._id,
            ),
            senderId: globalUser.data.user._id,
            time: newMessage.timestamp || new Date().toISOString(),
          };
          socketRef.current.emit("message", socketBody);
        }
      }
    } catch (error) {
      console.error("Error sending auto-hi:", error);
    }
  };

  // Helper: Finalize navigation to chat
  const handleFinalizeDirectChat = (directChat) => {
    const existingIndex = groupList.findIndex((g) => g._id === directChat._id);
    if (existingIndex === -1) {
      setGroupList((prev) => [directChat, ...prev]);
    }
    setShowAllUsrModal(false);
    setSelected(directChat);
    setShowActivity(true);
    setCallHistoryActivity(false);
    setMeetingsActivity(false);
  };

  const handelMeetingsActivity = (e) => {
    setShowActivity(false);
    setCallHistoryActivity(false);
    setMeetingsActivity(true);
  };

  const userupdate = async () => {
    try {
      const resp = await axios.get(`/api/users/get-user`, config);
      const result = await axios.get(
        selected?.isTemp ? `/api/groups/getallmeetings` : `/api/groups/getall`,
        config,
      );
      if (resp.data.success) {
        // Extract the user object from the API response
        const updatedUserData = resp.data.data.user;
        // Update the global user object
        const updatedGlobalUser = {
          ...globalUser,
          data: {
            ...globalUser.data,
            user: {
              ...globalUser.data.user, // Preserve existing properties
              ...updatedUserData, // Overwrite with updated data
            },
          },
        };

        // Update global user state
        setGlobalUser(updatedGlobalUser);

        result.data.data.map((e) => {
          if (
            selected?._id == e?._id &&
            e?.currentUsersId?.includes(globalUser?.data?.user?._id)
          ) {
            setSelected({
              ...selected,
              currentUsers: e.currentUsers,
            });
          }
        });

        // Persist the updated user object in localStorage
        localStorage.setItem("user", JSON.stringify(updatedGlobalUser));
      } else {
        console.error("Failed to fetch user data", resp.data.message);
      }
    } catch (error) {
      console.error("Error updating user:", error.message);
    }
  };

  const deleteMsg = async () => {
    if (delMsg) {
      try {
        const response = await axios.post(
          `/api/groups/deletemsg`,
          {
            messageId: delMsg,
          },
          config,
        );

        if (response.data.success) {
          // Emit to other users FIRST
          socketRef.current.emit("deleteMessage", {
            groupId: selected?._id,
            userId: globalUser?.data?.user?._id,
            receiverId: selected?.currentUsersId,
            deleteMsg: delMsg,
          });

          // Then update local state
          const updatedAllMessages = modifiedMsgs.filter(
            (message) => message._id !== delMsg,
          );
          setModifiedMsgs(updatedAllMessages);

          // Clear the delMsg state
          setDelMsg(null);
        } else {
          console.error("Failed to delete message:", response.data.message);
          toast.error("Failed to delete message");
        }
      } catch (error) {
        console.error("Error deleting message:", error);
        toast.error("Error deleting message");
      }
    }
  };

  useEffect(() => {
    if (socketRef.current) {
      const handleDeleteMessage = (data) => {
        console.log("Delete message received:", data.data.de);

        // Update messages for the specific group regardless of current selection
        setModifiedMsgs((prevMsgs) => {
          const updatedMessages = prevMsgs.filter(
            (message) => message._id !== data.data.deleteMsg,
          );
          console.log(
            "Updated messages after deletion:",
            updatedMessages.length,
          );
          return updatedMessages;
        });

        // Also update the group list to reflect the deletion in last message if needed
        setGroupList((prevGroups) => {
          return prevGroups.map((group) => {
            if (
              group._id === data.data.groupId &&
              group.lastMessage?._id === data.data.deleteMsg
            ) {
              // You might want to fetch the previous message or set lastMessage to null
              return { ...group, lastMessage: null };
            }
            return group;
          });
        });
      };

      socketRef.current.on("delete-message", handleDeleteMessage);

      return () => {
        socketRef.current.off("delete-message", handleDeleteMessage);
      };
    }
  }, [socketRef.current]);

  const findAddRemovePerson = async (arr1, arr2) => {
    const removedItems = arr1.filter(
      (item1) => !arr2.some((item2) => item2._id === item1._id),
    );
    const addedItems = arr2.filter(
      (item2) => !arr1.some((item1) => item1._id === item2._id),
    );

    return {
      addedPerson: addedItems,
      removedPerson: removedItems,
    };
    //  setALLmessages(result.data.data.messages);
  };

  const uploadFile = async (e, isCallChat = false) => {
    if (e) {
      const maxSizeInBytes = 100 * 1024 * 1024; // 100MB
      if (e.size > maxSizeInBytes) {
        toast.error("File size exceeds 100MB limit");
        return;
      }

      const targetMessage = isCallChat ? callMessage : message;

      let type = "doc"; // Default to doc for general files (Excel, Word, Zip, etc.)
      if (e.type.startsWith("image/")) {
        type = "image";
      } else if (e.type.startsWith("video/")) {
        type = "video";
      }

      const formData = new FormData();
      formData.append("file", e);

      type
        ? sendMessage(formData, type, targetMessage, isCallChat)
        : toast.error("Unsupported document");
      const fileInput = document.getElementById("file-input");
      if (fileInput) fileInput.value = null;
      const fileInputImg = document.getElementById("file-input-image");
      if (fileInputImg) fileInputImg.value = null;
      const fileInputPdf = document.getElementById("file-input-pdf");
      if (fileInputPdf) fileInputPdf.value = null;
      const fileInputImg2 = document.getElementById("file-input-image-2");
      if (fileInputImg2) fileInputImg2.value = null;
      const fileInputPdf2 = document.getElementById("file-input-pdf-2");
      if (fileInputPdf2) fileInputPdf2.value = null;
    }
  };

  function transformMessages(
    messages,
    initial,
    expectedGroupId = selected?._id,
  ) {
    if (!selected || !messages || selected?._id !== expectedGroupId) {
      return;
    }

    const transformedMessages = [...modifiedMsgs];
    if (messages.length > 0) {
      const existingIds = new Set(transformedMessages.map((m) => m._id));

      messages.forEach((message) => {
        // If message already exists, update it in place (e.g., processing → ready)
        if (existingIds.has(message._id)) {
          const idx = transformedMessages.findIndex((m) => m._id === message._id);
          if (idx !== -1) {
            transformedMessages[idx] = {
              ...transformedMessages[idx],
              message: message?.message || message?.content,
              fileName: message?.fileName,
            };
          }
          return;
        }

        const currentUserId =
          globalUser?.data?.user?._id?.toString() ||
          globalUser?.data?._id?.toString();
        const msgSenderId = message.senderId?.toString();
        const messageType =
          msgSenderId === currentUserId ? "receiver" : "sender";

        const transformedMessage = {
          time: message.timestamp,
          type: messageType,
          textFileType: message?.messageType || message?.type || "text",
          name:
            message?.senderDataAll?.name ||
            message?.senderName ||
            message?.sender ||
            "Unknown",
          senderId: message?.senderId || message?.sender,
          img: "",
          allRecipients: message?.allRecipients || [],
          message: message?.message || message?.content,
          deliveredTo: message?.deliveredTo || [],
          readBy: message?.readBy || [],
          deliveredToAll:
            (message.allRecipients?.length || 0) ==
            (message.deliveredTo?.length || 0) + 1,
          readByALL:
            (message.allRecipients?.length || 0) ==
            (message.readBy?.length || 0) + 1,
          _id: message?._id,
          forwarded: message?.forwarded,
          replyOf: message?.replyOf,
          fileName: message?.fileName,
        };
        transformedMessages.push(transformedMessage);
        existingIds.add(message._id);
      });
    }

    if (transformedMessages.length > 0) {
      if (initial) {
        setLastElement(transformedMessages[transformedMessages.length - 1]);
        setModifiedMsgs(transformedMessages);

        // Scroll to bottom after setting messages for initial load
        setTimeout(() => {
          scrollTobottom();
        }, 150);
      } else {
        setModifiedMsgs(transformedMessages);
        setLastElement(transformedMessages[transformedMessages.length - 1]);
        addmsgToSide(messages[0]);

        // Scroll for new messages
        setTimeout(() => {
          scrollTobottom();
        }, 100);
      }
    }
  }

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
      inline: "nearest",
    });
  };

  const getGroupDetails = async () => {
    if (!selected?._id) return;
    const result = await axios.get(`/api/groups/get-group-details`, {
      params: {
        id: selected?._id,
      },
      headers: {
        "access-token": globalUser?.data?.token,
      },
    });
    if (result.data) {
      setGroupDataDetails(result.data.data);
    }
  };
  const getGroupCallDetails = async () => {
    if (!selected?._id) return;
    const result = await axios.get(`/api/groups/get-group-call-details`, {
      params: {
        id: selected?._id,
      },
      headers: {
        "access-token": globalUser?.data?.token,
      },
    });
    if (result.data) {
      setGroupDataCallDetails(result.data.data);
    }
  };
  const findOddElementsasy = async (arr1, arr2) => {
    const uniqueInArr1 = arr1.filter((item) => !arr2.includes(item));
    const uniqueInArr2 = arr2.filter((item) => !arr1.includes(item));
    return uniqueInArr1.concat(uniqueInArr2); // Combine the unique elements
  };

  // Helper function to transform messages (used inline for instant display)
  const transformMessagesInstant = (messages) => {
    if (!messages || messages.length === 0) return [];

    return messages.map((message) => {
      const currentUserId =
        globalUser?.data?.user?._id?.toString() ||
        globalUser?.data?._id?.toString();
      const msgSenderId = message.senderId?.toString();
      const messageType = msgSenderId === currentUserId ? "receiver" : "sender";

      return {
        time: message.timestamp,
        type: messageType,
        textFileType: message?.messageType || message?.type || "text",
        name:
          message?.senderDataAll?.name ||
          message?.senderName ||
          message?.sender ||
          "Unknown",
        senderId: message?.senderId || message?.sender,
        img: "",
        allRecipients: message?.allRecipients || [],
        message: message?.message || message?.content,
        deliveredTo: message?.deliveredTo || [],
        readBy: message?.readBy || [],
        deliveredToAll:
          (message.allRecipients?.length || 0) ==
          (message.deliveredTo?.length || 0) + 1,
        readByALL:
          (message.allRecipients?.length || 0) ==
          (message.readBy?.length || 0) + 1,
        _id: message?._id,
        forwarded: message?.forwarded,
        replyOf: message?.replyOf,
        fileName: message?.fileName,
      };
    });
  };

  const getMsg = async (groupId = selected?._id, forceRefresh = false) => {
    if (!groupId || selected?.isGoogleEvent) return;

    try {
      setSkip(0);
      const timestamp = Date.now();

      // Check cache first for INSTANT display (cache stores transformed messages)
      const cachedData = messageCache.current.get(groupId);
      if (cachedData && !forceRefresh) {
        // Show cached TRANSFORMED messages immediately - NO transformation needed!
        setModifiedMsgs(cachedData.transformed);
        setALLmessages(cachedData.raw);
        setSkip(cachedData.raw.length);
        setLastElement(
          cachedData.transformed[cachedData.transformed.length - 1],
        );
        setDelayLodar(false);

        // Scroll after state update
        requestAnimationFrame(() => scrollTobottom());

        // Still fetch fresh data in background (silent update)
        axios
          .post(
            `/api/groups/getonegroup`,
            { id: groupId, timestamp, offset: 0, limit: 50 },
            config,
          )
          .then((result) => {
            if (selected?._id === groupId && result.data?.data) {
              const messages = result.data.data;
              const transformed = transformMessagesInstant(messages);
              messageCache.current.set(groupId, { raw: messages, transformed });
              // Only update if data changed
              if (messages.length !== cachedData.raw.length) {
                setALLmessages(messages);
                setModifiedMsgs(transformed);
                setSkip(messages.length);
              }
            }
          })
          .catch((err) => console.error("Background refresh error:", err));

        return; // Early return - cached data already displayed
      }

      // No cache - show loading and fetch
      setALLmessages([]);
      setModifiedMsgs([]);

      let result;
      if (selected?.isGuestMeeting) {
        result = await axios.get(`/api/groups/get-guest-messages`, {
          ...config,
          params: { meetingId: groupId },
        });

        if (selected?._id === groupId && result.data?.success) {
          const rawMessages = result.data.data || [];
          // Transform guest messages to match the expected format
          const formattedMessages = rawMessages.map((m) => ({
            _id: m._id,
            senderId: m.senderId || m.sender || "Unknown",
            senderName: m.senderName || m.sender,
            message: m.content,
            messageType: m.type,
            timestamp: m.createdAt,
            allRecipients: [],
            deliveredTo: [],
            readBy: [],
          }));

          const transformed = transformMessagesInstant(formattedMessages);
          setALLmessages(formattedMessages);
          setModifiedMsgs(transformed);
          setSkip(formattedMessages.length);
          if (transformed.length > 0) {
            setLastElement(transformed[transformed.length - 1]);
          }
          setDelayLodar(false);
          requestAnimationFrame(() => scrollTobottom());
        }
        return;
      }

      result = await axios.post(
        `/api/groups/getonegroup`,
        { id: groupId, timestamp, offset: 0, limit: 50 },
        config,
      );

      // Verify we're still on the same group before setting data
      if (selected?._id === groupId && result.data) {
        const messages = result?.data?.data || [];

        // Transform immediately (not in useEffect)
        const transformed = transformMessagesInstant(messages);

        // Cache both raw and transformed
        messageCache.current.set(groupId, { raw: messages, transformed });

        // Limit cache size
        if (messageCache.current.size > 20) {
          const firstKey = messageCache.current.keys().next().value;
          messageCache.current.delete(firstKey);
        }

        // Set both raw and transformed directly - SKIP useEffect!
        setALLmessages(messages);
        setModifiedMsgs(transformed);
        setSkip(messages.length);
        if (transformed.length > 0) {
          setLastElement(transformed[transformed.length - 1]);
        }
        setDelayLodar(false);

        requestAnimationFrame(() => scrollTobottom());

        socketRef.current.emit("read", {
          groupId: groupId,
          userId: globalUser?.data?.user?._id,
          receiverId: selected?.currentUsersId,
          timestamp,
        });
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      setDelayLodar(false);
    }
  };
  const handleScroll = async (e) => {
    if (e?.preventDefault) {
      e.preventDefault();
    }

    const element =
      e?.target || document.getElementById("message_body_wrapper");
    if (!element || !selected) return;

    if (element.scrollTop + element.clientHeight < element.scrollHeight - 100) {
      // You can adjust this threshold to be smaller or larger
      setShowScrollButton(true);
    } else {
      setShowScrollButton(false);
    }

    // Only trigger if we're at the top and not already loading
    if (fetchMoreMsg && element.scrollTop === 0 && !loadingOlderMessages) {
      try {
        setLoadingOlderMessages(true);
        setShowFetchMsg(true);

        const result = await axios.post(
          `/api/groups/getonegroup`,
          {
            id: selected?._id,
            offset: skip,
            limit: 50,
          },
          config,
        );

        setShowFetchMsg(false);

        if (result.data.data.length > 0) {
          const transformedMessages = result.data.data.map((message) => ({
            time: message.timestamp,
            type:
              message.senderId == globalUser?.data?.user._id
                ? "receiver"
                : "sender",
            textFileType: message?.messageType,
            name: message?.senderName,
            senderId: message?.senderId,
            img: "",
            allRecipients: message?.allRecipients,
            message: message?.message,
            deliveredTo: message?.deliveredTo,
            readBy: message?.readBy,
            deliveredToAll:
              message.allRecipients.length == message.deliveredTo.length + 1,
            readByALL:
              message.allRecipients.length == message.readBy.length + 1,
            _id: message?._id,
            forwarded: message?.forwarded,
            replyOf: message?.replyOf,
            fileName: message?.fileName,
            deletedBy: message?.deletedBy,
          }));

          setModifiedMsgs((prevMsgs) => [...transformedMessages, ...prevMsgs]);
          setSkip((prev) => prev + transformedMessages.length);

          // Maintain scroll position after adding messages
          setTimeout(() => {
            element.scrollTo({
              top: 50, // Small offset to prevent immediate retrigger
              behavior: "auto",
            });
          }, 100);
        } else {
          setFetchMoreMsg(false);
        }
      } catch (error) {
        console.error("Error fetching more messages:", error);
      } finally {
        setLoadingOlderMessages(false);
      }
    }
  };

  const scrollTobottom = () => {
    const messageBodyWrapper = document.getElementById("message_body_wrapper");
    if (messageBodyWrapper) {
      const scrollToEnd = () => {
        messageBodyWrapper.scrollTop = messageBodyWrapper.scrollHeight;
      };
      // alert("scroll")
      scrollToEnd(); // Immediate attempt
      setTimeout(scrollToEnd, 1000); // After next render cycle
      setTimeout(scrollToEnd, 200); // After slower renders
    }
  };
  const sendMessage = async (formData, msgtype, msgTxt, isCallChat = false) => {
    const targetSelected = isCallChat ? callSelected : selected;
    const targetMessage = isCallChat ? callMessage : message;
    const targetRplyMsg = isCallChat ? callRplyMsg : rplyMsg;
    const setTargetRplyMsg = isCallChat
      ? isCallChat === true
        ? setCallRplyMsg
        : setRplyMsg
      : setRplyMsg;
    const setTargetMessage = isCallChat ? setCallMessage : setMessage;

    if (!targetSelected) return;
    if (!formData && /^\s*$/.test(isCallChat ? msgTxt : targetMessage)) {
      return;
    } else {
      const arr = modifiedMsgs;
      let rplyMsgObject;
      targetRplyMsg
        ? (rplyMsgObject = {
            msgId: targetRplyMsg._id,
            sender: targetRplyMsg.name,
            msg: targetRplyMsg.message.trimStart(),
            msgType: targetRplyMsg.textFileType,
          })
        : null;
      if (!formData) {
        formData = new FormData();
      }
      formData.append("groupId", targetSelected?._id);
      formData.append("senderId", globalUser?.data?.user._id);
      formData.append("senderName", globalUser?.data?.user.name);

      if (msgtype === "added") {
        formData.append("message", msgTxt);
      } else if (msgtype === "removed") {
        formData.append("message", msgTxt);
      } else {
        formData.append(
          "message",
          msgtype != "text" ? "file" : msgTxt.trimStart(),
        );
      }
      formData.append("messageType", msgtype);
      // setMessage("");
      if (targetRplyMsg) {
        formData.append("replyOf", JSON.stringify(rplyMsgObject));
      }
      if (msgtype === "image" || msgtype === "doc" || msgtype === "video") {
        setUploadstatus(true);
        setStatus("Uploading...");
        setProgress(0);
      }

      let res;
      if (targetSelected?.isGuestMeeting) {
        if (msgtype === "text") {
          const payload = {
            meetingId: targetSelected?._id,
            sender:
              globalUser?.data?.user?.email ||
              globalUser?.data?.user?.name ||
              "Guest",
            senderId: globalUser?.data?.user?._id || "",
            senderName: globalUser?.data?.user?.name || "Guest",
            content: msgTxt.trimStart(),
            type: "text",
          };
          res = await axios.post(
            `/api/groups/add-guest-message`,
            payload,
            config,
          );
        } else {
          formData.append("meetingId", targetSelected?._id);
          formData.append(
            "sender",
            globalUser?.data?.user?.email ||
              globalUser?.data?.user?.name ||
              "Guest",
          );
          formData.append("senderId", globalUser?.data?.user?._id || "");
          formData.append(
            "senderName",
            globalUser?.data?.user?.name || "Guest",
          );
          formData.append("content", "file");
          formData.append("type", "file");
          res = await axios.post(
            `/api/groups/add-guest-message`,
            formData,
            config,
          );
        }
      } else {
        res = await axios.post(`/api/groups/addnewmsg`, formData, config);
      }

      if (res) {
        setStatus("Upload Complete!");
        setProgress(0);
        setUploadstatus(false);
      } else {
        setStatus("Upload Failed.");
      }
      setTargetMessage("");
      setSendLoading(false);
      addmsgToSide(res?.data?.data?.data);
      setTargetRplyMsg(null);
      let socketBody = {};
      socketBody._id = res?.data?.data?.data?._id;
      if (targetSelected?.isGuestMeeting) {
        socketBody.meetingId = targetSelected?._id;
        socketBody.isGuestMeeting = true;
      } else {
        socketBody.receiverId =
          res?.data?.data?.data?.allRecipients?.filter(
            (userId) => userId !== globalUser.data.user._id,
          ) || [];
      }
      socketBody.senderId = globalUser.data.user._id;
      socketBody.time =
        res?.data?.data?.data?.timestamp || new Date().toISOString();
      targetRplyMsg ? (socketBody.replyOf = rplyMsgObject) : null;
      socketRef.current.emit("message", socketBody);
    }
  };

  const addmsgToSide = (messages) => {
    const updatedgroupList = groupList.map((user) => {
      if (user?._id === (messages?.groupId || messages?.meetingId)) {
        return {
          ...user,
          lastMessage: messages,
        };
      }
      return user;
    });
    setGroupList(
      updatedgroupList.sort((a, b) => {
        const timestampA = a.lastMessage
          ? new Date(a.lastMessage.timestamp)
          : new Date(a.createdAt);
        const timestampB = b.lastMessage
          ? new Date(b.lastMessage.timestamp)
          : new Date(b.createdAt);
        if (timestampA < timestampB) {
          return 1;
        } else if (timestampA > timestampB) {
          return -1;
        } else {
          return 0;
        }
      }),
    );
  };
  const handleTyping = (isCallChat = false) => {
    const targetSelected = isCallChat ? callSelected : selected;
    if (!targetSelected) return;
    socketRef.current.emit("typing", {
      msgId: targetSelected?._id,
      userId: globalUser?.data?.user?.name,
      isTyping: true,
      receiverId: (targetSelected?.currentUsersId || []).filter(
        (userId) => userId !== globalUser.data.user._id,
      ),
    });
    setTimeout(() => {
      socketRef.current.emit("typing", {
        msgId: targetSelected?._id,
        userId: globalUser?.data?.user?.name,
        isTyping: false,
        receiverId: (targetSelected?.currentUsersId || []).filter(
          (userId) => userId !== globalUser.data.user._id,
        ),
      });
    }, 3000);
  };
  useEffect(() => {
    if (!selected?._id) {
      if (!selected) {
        setALLmessages([]);
        setModifiedMsgs([]);
        setDelayLodar(false);
      }
      return;
    }

    // Short-circuit for Google Calendar events
    if (selected?.isGoogleEvent) {
      setALLmessages([]);
      setModifiedMsgs([]);
      setDelayLodar(false);
      lastSelectedIdRef.current = selected?._id;
      return;
    }

    // Determine if this is a fresh selection or just a metadata update
    const isNewSelection = lastSelectedIdRef.current !== selected?._id;

    if (isNewSelection) {
      // Reset pagination and state only for NEW selections
      setSkip(0);
      setFetchMoreMsg(true);
      setRplyMsg(null);

      // Check for cached TRANSFORMED messages - show INSTANTLY
      const cachedData = messageCache.current.get(selected?._id);
      if (cachedData && cachedData.transformed) {
        // Show cached transformed messages IMMEDIATELY - no waiting!
        setModifiedMsgs(cachedData.transformed);
        setALLmessages(cachedData.raw);
        setSkip(cachedData.raw.length);
        if (cachedData.transformed.length > 0) {
          setLastElement(
            cachedData.transformed[cachedData.transformed.length - 1],
          );
        }
        setDelayLodar(false);
        requestAnimationFrame(() => scrollTobottom());
      } else {
        // No cache, show loading state
        setALLmessages([]);
        setModifiedMsgs([]);
        setDelayLodar(true);
      }

      // Update the tracking ref
      lastSelectedIdRef.current = selected?._id;
    }

    // Update group list unread count
    setGroupList((prevList) =>
      prevList.map((group) =>
        group._id === selected?._id ? { ...group, unreadCount: 0 } : group,
      ),
    );

    // Load messages and details IN PARALLEL
    const loadGroupData = async () => {
      try {
        if (selected?.isGuestMeeting) {
          getMsg(selected?._id);
          setDelayLodar(false);
          return;
        }

        const promises = [getMsg(selected?._id), getGroupDetails()];

        if (selected?.isTemp) {
          promises.push(getGroupCallDetails());
        }

        await Promise.all(promises);
      } catch (error) {
        console.error("Error loading group data:", error);
        setDelayLodar(false);
      }
    };

    loadGroupData();
  }, [selected]);

  useEffect(() => {
    // Only scroll if we have messages and a selected group
    if (selected && (lastElement || showAllMessage)) {
      setTimeout(() => {
        scrollTobottom();
      }, 100);
    }
  }, [lastElement, showAllMessage, selected]);

  // NOTE: Transform is now done directly in getMsg() for instant display
  // This useEffect is no longer needed and was causing duplicate messages
  useEffect(() => {
    if (deliverData) {
      if (deliverData?.msgId) {
        const updatedMessages = modifiedMsgs.map((message) => {
          if (deliverData.msgId === message._id) {
            return { ...message, deliveredTo: deliverData?.deliveredTo };
          }
          return message;
        });
        setModifiedMsgs(updatedMessages);
        setDeliverData(null);
      } else if (
        selected?.currentUsersId?.includes(deliverData?.deliverData?.user)
      ) {
        const updatedMessages = modifiedMsgs.map((message) => {
          if (message.deliveredTo) {
            if (
              !message.deliveredTo.some(
                (usr) => usr?.user === deliverData?.deliverData?.user,
              )
            ) {
              return {
                ...message,
                deliveredTo: [...message.deliveredTo, deliverData.deliverData],
              };
            }
            return message;
          } else {
            return { ...message, deliveredTo: [deliverData?.deliverData] };
          }
        });
        setModifiedMsgs(updatedMessages);
        setDeliverData(null);
      }
    }
  }, [deliverData]);
  useEffect(() => {
    if (readData?.readData) {
      if (readData?.msgId) {
        const updatedMessages = modifiedMsgs.map((message) => {
          if (readData.msgId === message._id) {
            return { ...message, readBy: readData?.readData };
          }
          return message;
        });
        setModifiedMsgs(updatedMessages);
        setReadData(null);
      } else {
        const updatedMessages = modifiedMsgs.map((message) => {
          if (message.readBy) {
            if (
              !message.readBy.some(
                (usr) => usr?.user?._id === readData?.readData?.user,
              )
            ) {
              return {
                ...message,
                readBy: [...message.readBy, readData.readData],
              };
            }
            return message;
          } else {
            return { ...message, readBy: [readData?.readData] };
          }
        });
        setModifiedMsgs(updatedMessages);
        setReadData(null);
      }
    }
  }, [readData]);
  ///get contacts
  const getContact = async (skip = 0, filterType = active) => {
    // Snapshot the view when this request starts
    const requestView = currentViewRef.current;

    // Guard clause: Do not fetch contacts if we are supposed to be showing meetings/guest meetings
    if (requestView === "meetings" || requestView === "guest_meetings") {
      console.log(
        "[getContact] Aborted because meetings/guest meetings view is active at request time",
      );
      return;
    }

    try {
      const response = await axios.get(`/api/groups/getall`, {
        ...config,
        params: {
          limit: GROUP_LIMIT,
          skip: skip,
          filter: filterType,
        },
      });
      if (response.data.success) {
        // If the user has switched to a different view (especially meetings/guest meetings)
        // while this request was in-flight, ignore this response so we don't overwrite
        // the currently active tab's list.
        if (
          requestView !== currentViewRef.current ||
          currentViewRef.current === "meetings" ||
          currentViewRef.current === "guest_meetings"
        ) {
          console.log(
            "[getContact] Ignoring response because view changed from",
            requestView,
            "to",
            currentViewRef.current,
          );
          setIsLoading(false);
          setIsPaginationLoading(false);
          return;
        }

        const newData = response.data.data;
        if (newData.length < GROUP_LIMIT) {
          setHasMoreGroups(false);
        } else {
          setHasMoreGroups(true);
        }

        if (skip === 0) {
          setGroupList(
            newData.sort((a, b) => {
              const timestampA = a.lastMessage
                ? new Date(a.lastMessage.timestamp)
                : new Date(a.createdAt);
              const timestampB = b.lastMessage
                ? new Date(b.lastMessage.timestamp)
                : new Date(b.createdAt);
              return timestampB - timestampA;
            }),
          );
        } else {
          setGroupList((prev) => {
            const combined = [...prev, ...newData];
            // Optional: sort combined list if needed, but API should ideally return sorted
            return combined;
          });
        }
        setIsLoading(false);
        setIsPaginationLoading(false);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setIsLoading(false);
      setIsPaginationLoading(false);
    }
  };
  useEffect(() => {
    fetchCalendarMeetings();
  }, [currentMonth, globalUser, googleConnected]);

  // Initial load effect
  // Initial load effect
  useEffect(() => {
    // Only fetch if one of these is true
    if (
      !showActivity &&
      !callHistoryActivity &&
      !meetingsActivity &&
      !guestMeetingsActivity
    )
      return;

    setGroupSkip(0);
    setHasMoreGroups(true);
    setIsLoading(true); // Ensure loading state is set immediately

    if (meetingsActivity) {
      console.log("Fetching meetings... Filter:", meetingTypeFilter);
      if (meetingTypeFilter === "guest") {
        getAllGuestMeetings(0);
      } else {
        // 'groups' or fallback
        getAllMeetings(0);
      }
    } else if (guestMeetingsActivity) {
      // Legacy support if needed, but should be covered by meetingsActivity now
      console.log("Fetching guest meetings (legacy)...");
      getAllGuestMeetings(0);
    } else if (showActivity || callHistoryActivity) {
      console.log("Fetching contacts/chats...");
      getContact(0);
    }
  }, [
    showActivity,
    callHistoryActivity,
    meetingsActivity,
    guestMeetingsActivity,
    globalUser,
    newGrp,
    meetingTypeFilter,
  ]);

  // Filter change effect - only refetch when active filter changes
  useEffect(() => {
    if (showActivity || callHistoryActivity) {
      setGroupSkip(0);
      setHasMoreGroups(true);
      setIsLoading(true);
      getContact(0, active);
    }
  }, [active]);
  ///join self
  useEffect(() => {
    if (latest) {
      const groupId = latest.data.groupId || latest.data.meetingId;

      // Update cache with new message (using new format)
      // Update cache with new message (preventing duplicates)
      if (messageCache.current.has(groupId)) {
        const cachedData = messageCache.current.get(groupId);
        if (cachedData && cachedData.raw && cachedData.transformed) {
          // Check if message ID already exists in cache
          const existingIndex = cachedData.raw.findIndex(
            (m) => m._id === latest.data._id,
          );
          if (existingIndex !== -1) {
            // Update existing message (e.g., processing → ready screen recording)
            const updatedRaw = [...cachedData.raw];
            updatedRaw[existingIndex] = latest.data;
            const updatedTransformed = transformMessagesInstant(updatedRaw);
            messageCache.current.set(groupId, {
              raw: updatedRaw,
              transformed: updatedTransformed,
            });
          } else {
            const newTransformed = transformMessagesInstant([latest.data]);
            messageCache.current.set(groupId, {
              raw: [...cachedData.raw, latest.data],
              transformed: [...cachedData.transformed, ...newTransformed],
            });
          }
        }
      }

      const selectedId = selected?._id?.toString();
      const callSelectedId = callSelected?._id?.toString();

      if (selectedId === groupId?.toString()) {
        transformMessages([latest.data], false);
      }

      // If we are in a call and even if we are not on the call's group page,
      // update the call messages state so the minimized chat stays updated
      if (
        callSelectedId === groupId?.toString() &&
        callSelectedId !== selectedId
      ) {
        const newTransformed = transformMessagesInstant([latest.data]);
        setCallModifiedMsgs((prev) => {
          const existingIdx = prev.findIndex((m) => m._id === latest.data._id);
          if (existingIdx !== -1) {
            // Update existing message (e.g., processing → ready screen recording)
            const updated = [...prev];
            updated[existingIdx] = newTransformed[0];
            return updated;
          }
          return [...prev, ...newTransformed];
        });
      }

      const isDisplayedInEither =
        selectedId === groupId?.toString() ||
        callSelectedId === groupId?.toString();
      if (!isDisplayedInEither) {
        addmsgToSide(latest.data);
      }
    }
  }, [latest, selected, callSelected]);

  useEffect(() => {
    const interval = setInterval(() => setNow(moment()), 1000 * 900);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.on("message", (data) => {
        if (data.data.messageType == "removed") {
          setGroupList(
            groupList.filter((usr) => usr._id !== data.data.groupId),
          );
        }
      });

      socketRef.current.on("deleted-User", (data) => {
        const userIdToRemove = data.data._id;
        let storedData = localStorage.getItem("user");
        if (storedData) {
          let data = JSON.parse(storedData);
          if (
            data.data &&
            data.data.user &&
            data.data.user._id === userIdToRemove
          ) {
            localStorage.removeItem("user");
            router.push("/login");
          } else {
            console.log("User not found in local storage.");
          }
        } else {
          console.log("No data found in local storage.");
        }
      });

      return () => {
        socketRef.current.off("message");
      };
    }
  }, []);

  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.on("updated-User", () => {
        userupdate();
      });

      return () => {
        console.log("disconnecting from socket");
      };
    }
  }, [socketRef.current]);

  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.on("message", (data) => {
        const msg = data.data || data; // Handle potential structure variations
        if (!msg) return;

        console.log("Socket: Received message:", msg);
        const groupId = msg.groupId || msg.meetingId;
        // Use loose equality or String comparison to handle ObjectId vs String mismatches
        const isSelected =
          selected && String(selected?._id) === String(groupId);

        // 1. Emit 'deliver' receipt if we have this group (regardless of selection)
        // Check if group exists using loose equality
        const hasGroup = groupList.some(
          (usr) => String(usr._id) === String(groupId),
        );

        if (hasGroup) {
          socketRef.current.emit("deliver", {
            msgId: msg._id,
            userId: globalUser?.data?.user?._id,
            receiverId: msg.allRecipients.filter(
              (userId) => userId !== globalUser.data.user._id,
            ),
            timestamp: Date.now(),
          });
        }

        // 2. Handle Selected Group Actions
        if (isSelected) {
          setLatest(data); // Update ChatArea - this triggers useEffect to add message

          //           // Append the new message to the active chat area
          // const isMe = msg.senderId === globalUser?.data?.user?._id;
          // const newMessage = {
          //   time: msg.timestamp,
          //   type: isMe ? "receiver" : "sender", // 'receiver' = Right (Me), 'sender' = Left (Them)
          //   textFileType: msg.messageType,
          //   name: msg.senderName,
          //   senderId: msg.senderId,
          //   img: msg.senderDataAll?.image || "",
          //   allRecipients: msg.allRecipients,
          //   message: msg.message,
          //   deliveredTo: msg.deliveredTo,
          //   readBy: msg.readBy,
          //   deliveredToAll: false,
          //   readByALL: false,
          //   _id: msg._id,
          //   forwarded: msg.forwarded,
          //   replyOf: msg.replyOf,
          //   fileName: msg.fileName,
          // };

          // setModifiedMsgs((prev) => [...prev, newMessage]);

          socketRef.current.emit("read", {
            msgId: msg._id,
            userId: globalUser?.data?.user?._id,
            receiverId: selected?.currentUsersId,
            timestamp: Date.now(),
          });
        }

        // 3. Update Group List (Unread Count + Last Message + Sorting)
        setGroupList((prevGroupList) => {
          // Use String comparison for ID finding
          const groupIndex = prevGroupList.findIndex(
            (g) => String(g._id) === String(groupId),
          );

          if (groupIndex === -1) {
            console.log(
              "Socket: Group not found in loaded list (pagination). Fetching details logic initiated for:",
              groupId,
            );

            // WE CANNOT ASYNC FETCH INSIDE THIS SYNCHRONOUS STATE UPDATE
            // We must trigger it outside or handle it differently.
            // Tricky part: We need to update state based on fetch result.
            // Let's trigger a side-effect fetch ONLY if not already fetching?
            // Ideally we shouldn't do side effects in setState.

            // Correct approach: Return prev state here, handle fetch below.
            return prevGroupList;
          }

          const group = prevGroupList[groupIndex];
          const updatedGroup = {
            ...group,
            lastMessage: msg,
            unreadCount: isSelected ? 0 : (group.unreadCount || 0) + 1,
          };

          const newList = [...prevGroupList];
          newList.splice(groupIndex, 1); // Remove from old position
          newList.unshift(updatedGroup); // Add to top
          console.log("Socket: Group moved to top:", groupId);
          return newList;
        });

        // 3b. Handle Missing Group (Pagination Case)
        // Check current list (using the captured 'groupList' from closure or ref would be better,
        // but since we are in useEffect[groupList], 'groupList' is fresh).
        const groupExists = groupList.some(
          (g) => String(g._id) === String(groupId),
        );
        if (!groupExists) {
          console.log("Socket: Fetching missing group:", groupId);
          axios
            .get(`/api/groups/get-group-details`, {
              ...config,
              params: { id: groupId },
            })
            .then((res) => {
              if (res.data && res.data.success) {
                setGroupList((currList) => {
                  // Double check if added meanwhile
                  if (currList.some((g) => String(g._id) === String(groupId)))
                    return currList;

                  const fetchedGroup = res.data.data;
                  // Format it to match list item structure
                  fetchedGroup.lastMessage = msg;
                  fetchedGroup.unreadCount = isSelected ? 0 : 1;

                  console.log("Socket: Added missing group to top:", groupId);
                  return [fetchedGroup, ...currList];
                });
              }
            })
            .catch((err) =>
              console.error("Socket: Error fetching missing group:", err),
            );
        }

        // 4. Show Notification if not selected
        if (!isSelected) {
          const groupName =
            groupList.find((g) => String(g._id) === String(groupId))
              ?.groupName || "New Message";
          MsgToast.success({
            title: msg.senderName,
            groupName: groupName,
            text:
              msg.messageType == "text"
                ? msg.message.substring(0, 15)
                : msg.messageType == "image"
                  ? "Image"
                  : "Document",
          });
        }
      });

      socketRef.current.on("newgroup", (data) => {
        setNewGrp(data.msgId);
      });
      socketRef.current.on("deliver", (data) => {
        setDeliverData(data);
      });
      socketRef.current.on("read", (data) => {
        setReadData(data);
      });
      socketRef.current.on("typing", (data) => {
        const { userId, typing, msgId, groupId } = data;
        const targetId = msgId || groupId;

        if (selected && selected?._id == targetId) {
          setIsTyping(typing);
          setTypingUser(userId);
        }
        if (callSelected && callSelected?._id == targetId) {
          setIsCallTyping(typing);
          setCallTypingUser(userId);
        }
      });
      socketRef.current.on("updated", async (data) => {
        if (selected && selected?._id === data?.data?.data?._id) {
          // Debugging logs to check if currentUsers length is different
          if (
            selected?.currentUsers?.length !==
            data?.data?.data?.currentUsers?.length
          ) {
            // Fetch updated group data
            const result = await axios.get(
              selected?.isTemp
                ? `/api/groups/getallmeetings`
                : `/api/groups/getall`,
              config,
            );
            if (result?.data?.data && result.data.data.length > 0) {
              // Sort the groups by timestamp (descending order)
              const tempResult = result.data.data.sort((a, b) => {
                const timestampA = new Date(a?.lastMessage?.timestamp);
                const timestampB = new Date(b?.lastMessage?.timestamp);
                return timestampB - timestampA; // descending order
              });
              // Update group list
              setGroupList(tempResult);
              // Find the group that matches the updated one
              const matchedContact = tempResult.find(
                (contact) => contact._id === data.data.data._id,
              );
              if (matchedContact) {
                let personArr = await findAddRemovePerson(
                  selected?.currentUsers || [],
                  matchedContact?.currentUsers || [],
                );
                let person = personArr[0];
                if (person.addedPerson.length > 0) {
                  for (let i = 0; i < person.addedPerson.length; i++) {
                    await sendMessage(
                      new FormData(),
                      "added",
                      `${person.addedPerson[i].name} added to the group`,
                      person.addedPerson[i],
                    );
                  }
                } else {
                  for (let i = 0; i < person.removedPerson.length; i++) {
                    await sendMessage(
                      new FormData(),
                      "removed",
                      `${person.removedPerson[i].name} ${selected?.isTemp ? "removed from the meeting" : "removed from the group"}`,
                      person.removedPerson[i],
                    );
                  }
                }
                let checkData = data.data.data.currentUsers.includes(
                  globalUser.data.user._id,
                );
                if (checkData) {
                  setSelected({
                    ...selected,
                    admins: matchedContact.admins,
                    currentUsers: matchedContact.currentUsers,
                    currentUsersId: matchedContact.currentUsersId,
                    groupName: data.data.data.groupName,
                    groupImage: data.data.data.groupImage,
                    groupDescription: data.data.data.groupDescription,
                  });
                  // Optionally, you can call `getGroupDetails` after updating the selected group
                  getGroupDetails();
                } else {
                  setSelected(null);
                  getGroupDetails();
                }
                // Update the selected group only if the matched contact is found
              } else {
                setSelected(null);
                getGroupDetails();
              }
            }
          } else {
            let checkData = data.data.data.currentUsers.includes(
              globalUser.data.user._id,
            );
            if (checkData) {
              if (showActivity || callHistoryActivity) {
                getContact();
              } else if (meetingsActivity) {
                getAllMeetings();
              } else if (guestMeetingsActivity) {
                getAllGuestMeetings(0);
              }
              // Ensure contacts are updated (optional)
              setSelected({
                ...selected,
                admins: data.data.data.admins,
                groupName: data.data.data.groupName,
                groupImage: data.data.data.groupImage,
                groupDescription: data.data.data.groupDescription,
                meetingStartTime: data.data.data.meetingStartTime,
                meetingEndTime: data.data.data.meetingEndTime,
              });
            } else {
              setSelected(null);

              if (showActivity || callHistoryActivity) {
                getContact();
              } else if (meetingsActivity) {
                getAllMeetings();
              }
            }
          }
        }
      });

      socketRef.current.on("delete-Group", async (data) => {
        if (data?.data?._id.toString() === selected?._id.toString()) {
          setSelected(null);
        }
        if (meetingsActivity) {
          setIsLoading(true);
          getAllMeetings();
        }
        if (showActivity || callHistoryActivity) {
          setIsLoading(true);
          getContact();
        } else if (guestMeetingsActivity) {
          setIsLoading(true);
          getAllGuestMeetings(0);
        }
      });
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.off("message");
        socketRef.current.off("newgroup");
        socketRef.current.off("read");
        socketRef.current.off("deliver");
        socketRef.current.off("typing");
        socketRef.current.off("updated");
        socketRef.current.off("addremoveuser");
        socketRef.current.off("delete-Group");
      }
    };
  }, [groupList, selected, showRoom]);
  const [show, setShow] = useState(false);
  const [createMeting, setCreateMeeting] = useState(false);
  const [checkedIds, setCheckedIds] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]); // Store selected user objects
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupImage, setNewGroupImage] = useState();
  const createGroup = async (e) => {
    e.preventDefault();
    if (checkedIds.length > 0 && newGroupName) {
      Swal.fire({
        title: "Creating Group...",
        text: "Please wait while we create the Group",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });
      const formData = new FormData();
      formData.append("file", newGroupImage);
      formData.append("groupName", newGroupName);
      formData.append("groupDescription", newGroupDescription);
      formData.append(
        "users",
        JSON.stringify([...checkedIds, globalUser.data.user._id]),
      );
      const res = await axios.post("/api/groups/create", formData, config);
      if (res.data.success) {
        Swal.close();
        toast.success("Success");
        socketRef.current.emit("creategroup", res.data.data);
        handleClose();
      }
      !res.data.success && toast.error("Error") && Swal.close();
    } else {
      Swal.close();
      toast.error("Please enter group name");
    }
  };

  const handleReplyJump = async (replyId) => {
    setReplyJumpingId(true);
    // 1. If message is already in the DOM → scroll immediately
    const existingElement = document.getElementById(`message-${replyId}`);
    if (existingElement) {
      scrollToMessage(replyId);
      setReplyJumpingId(false);
      return;
    }

    // 2. Otherwise, fetch more pages until found
    setLoadingOlderMessages(true);
    const found = await fetchUntilFound(replyId);
    setLoadingOlderMessages(false);

    // 3. Scroll after load
    if (found) {
      setTimeout(() => scrollToMessage(replyId), 500);
      setReplyJumpingId(false);
    } else {
      setReplyJumpingId(false);
      toast.error("Could not find the replied message");
    }
  };

  const scrollToMessage = (replyId) => {
    const el = document.getElementById(`message-${replyId}`);
    if (el) {
      const messageContainer = document.getElementById("message_body_wrapper");
      if (messageContainer) {
        // Calculate proper scroll position
        const containerRect = messageContainer.getBoundingClientRect();
        const messageRect = el.getBoundingClientRect();
        const scrollTop =
          messageContainer.scrollTop +
          messageRect.top -
          containerRect.top -
          100;

        messageContainer.scrollTo({
          top: scrollTop,
          behavior: "smooth",
        });

        // Highlight the message
        el.style.backgroundColor = "rgba(255,255,0,0.3)";
        el.style.transition = "background-color 0.3s ease";
        setTimeout(() => {
          el.style.backgroundColor = "";
        }, 1500);
      }
    }
  };

  const fetchUntilFound = async (replyId) => {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts && fetchMoreMsg) {
      // Check if message exists in current state
      const messageExists = modifiedMsgs.some((msg) => msg._id === replyId);
      if (messageExists) {
        return true;
      }

      // Check if message exists in DOM (sometimes state and DOM are out of sync)
      if (document.getElementById(`message-${replyId}`)) {
        return true;
      }

      try {
        // Fetch older messages
        const result = await axios.post(
          `/api/groups/getonegroup`,
          {
            id: selected?._id,
            offset: skip + attempts * 50, // Progressive offset
            limit: 50,
          },
          config,
        );

        if (result.data.data.length === 0) {
          // No more messages to load
          setFetchMoreMsg(false);
          break;
        }

        // Transform new messages
        const transformedMessages = result.data.data.map((message) => ({
          time: message.timestamp,
          type:
            message.senderId == globalUser?.data?.user._id
              ? "receiver"
              : "sender",
          textFileType: message?.messageType,
          name: message?.senderName,
          senderId: message?.senderId,
          img: "",
          allRecipients: message?.allRecipients,
          message: message?.message,
          deliveredTo: message?.deliveredTo,
          readBy: message?.readBy,
          deliveredToAll:
            message.allRecipients.length == message.deliveredTo.length + 1,
          readByALL: message.allRecipients.length == message.readBy.length + 1,
          _id: message?._id,
          forwarded: message?.forwarded,
          replyOf: message?.replyOf,
          fileName: message?.fileName,
          deletedBy: message?.deletedBy,
        }));

        // Update state and wait for it to propagate
        await new Promise((resolve) => {
          setModifiedMsgs((prevMsgs) => {
            const newMsgs = [...transformedMessages, ...prevMsgs];
            resolve(newMsgs);
            return newMsgs;
          });
        });

        // Update skip count
        setSkip((prev) => prev + transformedMessages.length);

        // Wait a bit more for DOM to update
        await new Promise((resolve) => setTimeout(resolve, 300));

        attempts++;
      } catch (error) {
        console.error("Error fetching older messages:", error);
        break;
      }
    }

    // Final check
    const finalCheck =
      modifiedMsgs.some((msg) => msg._id === replyId) ||
      document.getElementById(`message-${replyId}`) !== null;

    return finalCheck;
  };

  const createMeeting = async (e) => {
    e.preventDefault();

    if (checkedIds.length > 0 && newGroupName) {
      Swal.fire({
        title: "Creating Meeting...",
        text: "Please wait while we create the meeting",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });
      const formData = new FormData();
      formData.append("file", newGroupImage);
      formData.append("groupName", newGroupName);
      formData.append("groupDescription", newGroupDescription);
      formData.append(
        "users",
        JSON.stringify([...checkedIds, globalUser.data.user._id]),
      );
      formData.append("isTemp", true);
      formData.append("createdByTimeZone", "UTC");
      formData.append("meetingStartTime", moment(meetingStartTime).utc());
      formData.append("meetingEndTime", moment(meetingEndTime).utc());
      const res = await axios.post("/api/groups/create", formData, config);
      if (res.data.success) {
        Swal.close();
        toast.success("Success");
        socketRef.current.emit("creategroup", res.data.data);
        socketRef.current.emit("meeting_created", res.data.data);
        handleClose();
        fetchCalendarMeetings();
      }
      !res.data.success &&
        toast.error("Failed To Create Meeting") &&
        Swal.close();
    } else {
      Swal.close();
      toast.error("Please enter meeting name");
    }
  };

  const uploadGroupImg = async (e) => {
    if (e) {
      setNewGroupImage(e);
      const fileInput2 = document.getElementById("file-input2");
      if (fileInput2) fileInput2.value = null;
    }
  };
  const handleCheckboxChange = (id) => {
    if (checkedIds.includes(id)) {
      setCheckedIds(checkedIds.filter((checkedId) => checkedId !== id));
      setSelectedUsers(selectedUsers.filter((user) => user._id !== id));
    } else {
      setCheckedIds([...checkedIds, id]);
      // Find and add the user object from filteredALLUSR or ALLUSR
      const userToAdd =
        filteredALLUSR.find((user) => user._id === id) ||
        ALLUSR.find((user) => user._id === id);
      if (userToAdd) {
        setSelectedUsers([...selectedUsers, userToAdd]);
      }
    }
  };
  const handleEditUser = async (e) => {
    setShowEditUser(true);
    setEditFormData({
      name: e.name,
      email: e.email,
      _id: e._id,
      userType: e.userType,
      password: e.password,
      accountStatus: e.accountStatus || "active",
    });
  };

  const handleDeletUser = async (e) => {
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      // icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: "#1da678",
      cancelButtonColor: "#1da678",
      confirmButtonText: "Yes, delete it!",
      didOpen: () => {
        const confirmBtn = document.querySelector(".swal2-confirm");
        const cancelBtn = document.querySelector(".swal2-cancel");

        if (confirmBtn) {
          confirmBtn.style.backgroundColor = "#1da678";
          confirmBtn.style.color = "#fff";
          confirmBtn.style.border = "none";
        }

        if (cancelBtn) {
          cancelBtn.style.backgroundColor = "#1da678";
          cancelBtn.style.color = "#fff";
          cancelBtn.style.border = "none";
        }
      },
    }).then(async (result) => {
      if (result.isConfirmed) {
        // Show loading dialog
        Swal.fire({
          title: "Deleting...",
          text: "Please wait while we delete the user",
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        try {
          const { data } = await axios.delete(
            `/api/admin/users/delete-user?id=${e._id}`,
            config,
          );
          if (data.success) {
            Swal.close(); // Close loading dialog
            toast.success("User deleted successfully");
            setALLUSR((prev) => prev.filter((usr) => usr._id !== e._id));
            setFilteredALLUSR((prev) =>
              prev.filter((usr) => usr._id !== e._id),
            );
          } else {
            Swal.close(); // Close loading dialog
            toast.error(`Error: ${data.message}`);
          }
        } catch (error) {
          console.error("Error deleting user:", error);
          Swal.close(); // Close loading dialog
          toast.error("An unexpected error occurred.");
        }
      }
    });
  };

  const handelSubmitEditUser = async (e) => {
    e.preventDefault();
    // Show loading dialog
    Swal.fire({
      title: "Updating User...",
      text: "Please wait while we update the user details",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      const { data } = await axios.post(
        `/api/admin/users/update-user-details`,
        editFormData,
        config,
      );
      if (data.success) {
        Swal.close(); // Close loading dialog
        toast.success("User updated successfully");
        setShowEditUser(false);
        setEditFormData({
          name: "",
          email: "",
          _id: "",
          userType:
            globalUser?.data?.user?.userType === "SuperAdmin" ? "" : "user",
          password: "",
          accountStatus: globalUser?.data?.user?.accountStatus || "active",
        });
        handleClose();
        // Update the user in ALLUSR state
        setALLUSR((prev) =>
          prev.map((usr) => (usr._id === data.data._id ? data.data : usr)),
        );

        setFilteredALLUSR((prev) =>
          prev.map((usr) => (usr._id === data.data._id ? data.data : usr)),
        ) || [];
      } else {
        Swal.close(); // Close loading dialog
        setShowEditUser(false);
        toast.error(`Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Error updating user:", error);
      Swal.close(); // Close loading dialog
      toast.error("An unexpected error occurred.");
    }
  };
  const handleClose = () => {
    setStep(1);
    setCheckedIds([]);
    setSelectedUsers([]);
    setNewGroupDescription("");
    setNewGroupName("");
    setNewGroupImage("");
    setShow(false);
    setCreateMeeting(false);
    setShowAllUsrModal(false);
    setShowEditUser(false);
  };
  const [ALLUSR, setALLUSR] = useState([]);
  const [filteredALLUSR, setFilteredALLUSR] = useState([]);
  const handleShow = async (page = 1, limit = 10, searchQuery = "") => {
    setShow(true);
    setIsAddGroupLoading(true);
    try {
      const response = await axios.post(
        "/api/admin/users/get-all-users",
        { page, limit, searchQuery },
        config,
      );

      const { data, pagination } = response.data.data;

      // For infinite scroll: append data if page > 1, otherwise replace
      if (page > 1) {
        setALLUSR((prev) => [...prev, ...(data || [])]);
        setFilteredALLUSR((prev) => [...prev, ...(data || [])]);
      } else {
        setALLUSR(data || []);
        setFilteredALLUSR(data || []);
      }

      setTotalPages(pagination.totalPages);
      setCurrentPage(pagination.currentPage);
      setTotalCount(pagination.totalCount); // Optional: if you want to show total count
      setIsAddGroupLoading(false);
    } catch (error) {
      setIsAddGroupLoading(false);
      console.error("Error fetching users:", error);
      // Handle error appropriately
    }
  };
  const handelCreteMeeting = async (page = 1, limit = 10, searchQuery = "") => {
    setCreateMeeting(true);
    setIsAddGroupLoading(true);
    try {
      const response = await axios.post(
        "/api/admin/users/get-all-users",
        { page, limit, searchQuery },
        config,
      );

      const { data, pagination } = response.data.data;

      // Filter out current user
      const filteredUsers = data.filter(
        (user) => user._id != globalUser.data.user._id,
      );

      // For infinite scroll: append data if page > 1, otherwise replace
      if (page > 1) {
        setALLUSR((prev) => [...prev, ...filteredUsers]);
        setFilteredALLUSR((prev) => [...prev, ...filteredUsers]);
      } else {
        setALLUSR(filteredUsers);
        setFilteredALLUSR(filteredUsers);
      }

      setTotalPages(pagination.totalPages);
      setCurrentPage(pagination.currentPage);
      setTotalCount(pagination.totalCount); // Optional: if you want to show total count
      setIsAddGroupLoading(false);
    } catch (error) {
      console.error("Error fetching users:", error);
      setIsAddGroupLoading(false);
      // Handle error appropriately
    }
  };
  const handleAddUser = async (e) => {
    e.preventDefault(); // 🔴 This is crucial to prevent page reload

    Swal.fire({
      title: "Creating User...",
      text: "Please wait while we create the user details",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      let chekUser = await axios.get(
        `/api/admin/users/get-user-by-mail?email=${formData.email}`,
        config,
      );
      let result = null;
      if (chekUser?.data?.data) {
        // If the user exists, show the SweetAlert confirmation
        result = await Swal.fire({
          title: "User already registerd!",
          text: "This user is already registerd.  Do you want to add your member list?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Yes, create user",
          cancelButtonText: "No, cancel",
          confirmButtonColor: "#1da678",
          cancelButtonColor: "#1da678",
          customClass: {
            confirmButton: "swal-confirm-btn",
            cancelButton: "swal-cancel-btn",
          },
          backdrop: `
              rgba(0,0,0,0.4)
              left top 
              no-repeat
            `,
        });
        if (result.isConfirmed) {
          await Swal.fire({
            title: " Member Added!",
            text: "your member has been added successfully",
            icon: "success",
            customClass: {
              confirmButton: "swal-confirm-btn",
              cancelButton: "swal-cancel-btn",
            },
            backdrop: `
                  rgba(0,0,0,0.4)
                  left top
                  no-repeat
                `,
          });
          setLoading(false); // Stop loading if user cancels
          let { data } = await axios.post(
            "/api/admin/users/create-user",
            formData,
            config,
          );
          if (data.success) {
            toast.success("Successfully contact has been created");
            setALLUSR((prev) => [...prev, data.data]);
            setShowAddUserModal(false);
            setFormData({
              name: "",
              email: "",
              password: "",
              userType:
                globalUser?.data?.user?.userType === "SuperAdmin" ? "" : "user",
            });
          } else {
            toast.error(`error: ${data.message}`);
            setFormData({
              name: "",
              email: "",
              password: "",
              userType:
                globalUser?.data?.user?.userType === "SuperAdmin" ? "" : "user",
            });
          }
        }
        return; // Exit the function
      } else {
        let { data } = await axios.post(
          "/api/admin/users/create-user",
          formData,
          config,
        );
        if (data.success) {
          Swal.close(); // Close loading dialog
          toast.success("Successfully contact has been created");
          setALLUSR((prev) => [...prev, data.data]);
          setShowAddUserModal(false);
          setFormData({
            name: "",
            email: "",
            password: "",
            userType:
              globalUser?.data?.user?.userType === "SuperAdmin" ? "" : "user",
          });
        } else {
          Swal.close(); // Close loading dialog
          toast.error(`: ${data.message}`);
          setFormData({
            name: "",
            email: "",
            password: "",
            userType:
              globalUser?.data?.user?.userType === "SuperAdmin" ? "" : "user",
          });
        }
      }
    } catch (error) {
      console.error("Add user error:", error);
      toast.error("An unexpected error occurred.");
    }
  };
  const handelPushUser = async (page = 1, limit = 10, searchQuery = "") => {
    setShowAllUsrModal(true);
    setIsAddGroupLoading(true);
    try {
      const response = await axios.post(
        "/api/admin/users/get-all-users",
        { page, limit, searchQuery },
        config,
      );

      const responseData = response?.data?.data || {};
      const { data = [], pagination = {} } = responseData;

      // Filter out current user
      const filteredUsers = data.filter(
        (user) => user._id != globalUser.data.user._id,
      );

      // For infinite scroll: append data if page > 1, otherwise replace
      if (page > 1) {
        setALLUSR((prev) => [...prev, ...filteredUsers]);
        setFilteredALLUSR((prev) => [...prev, ...filteredUsers]);
      } else {
        setALLUSR(filteredUsers);
        setFilteredALLUSR(filteredUsers);
      }

      setTotalPages(pagination.totalPages || 0);
      setCurrentPage(pagination.currentPage || 1);
      setTotalCount(pagination.totalCount || 0); // Optional: if you want to show total count
      setIsAddGroupLoading(false);
    } catch (error) {
      console.error("Error fetching users:", error);
      setIsAddGroupLoading(false);
      // Handle error appropriately
    }
  };

  const ensureScrollToBottom = () => {
    // Method 1: Direct DOM manipulation
    const messageBodyWrapper = document.getElementById("message_body_wrapper");
    if (messageBodyWrapper) {
      messageBodyWrapper.scrollTop = messageBodyWrapper.scrollHeight;
    }

    // Method 2: Using ref (if implemented)
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }

    // Method 3: Retry after short delay
    setTimeout(() => {
      if (messageBodyWrapper) {
        messageBodyWrapper.scrollTop = messageBodyWrapper.scrollHeight;
      }
    }, 100);
  };

  const [show2, setShow2] = useState(false);

  // const handleClose = () => setShow(false);
  const handleClose2 = () => setShow2(!show2);
  // const handleShow = () => setShow(true);
  const handleShow2 = () => setShow2(true);

  const [step, setStep] = useState(1); // Initialize state for current step

  const handleNext = () => {
    checkedIds.length > 0 ? setStep(2) : toast.error("Select atleast one user"); // Update step to show second section
  };

  const handlePrev = () => {
    setStep(1); // Update step to show first section
  };

  const [step2, setStep2] = useState(1); // Initialize state for current step

  const handleNext2 = () => {
    setStep2(2); // Update step to show second section
  };

  const handlePrev2 = () => {
    setStep2(1); // Update step to show first section
  };

  const [showPassword, setShowPassword] = React.useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const changePassword = async () => {
    if (oldPassword === newPassword) {
      toast.error(
        "Your new password must be different from your current password",
      );
      return;
    }
    if (oldPassword.length >= 4 && newPassword.length >= 4) {
      const resp = await axios.post(
        "/api/users/change-password",
        {
          oldPassword: oldPassword,
          password: newPassword,
        },
        config,
      );
      if (resp.data.success) {
        toast.success("Password updated successfully");
        setOldPassword("");
        setNewPassword("");
        handlePrev2();
      } else {
        toast.error("Password not updated");
      }
    }
  };
  const handleClickShowPassword = () => setShowPassword((show) => !show);

  const handleMouseDownPassword = (event) => {
    event.preventDefault();
  };

  const handleJoinCall = () => {
    setShowCallModal(true);
  };

  const handleBodyLeftSecClick = (e) => {
    // Check if the click is inside the activity list container (where chat items are)
    const activityListContainer = e.target.closest(".activity-list-container");
    const activityListScroll = e.target.closest(".activity-list-scroll");
    if (activityListContainer || activityListScroll) {
      // Don't do anything if clicking on a chat item - let the chat item handle it
      return;
    }
    // Close sidebar if open
    if (showSidebar) {
      setShowSidebar(false);
    }
    setIsHidden(false);
  };

  const handleBodyRightSecClick = (e) => {
    // Close sidebar if clicking outside of it
    if (showSidebar) {
      const sidebar = e.target.closest(".sidebar");
      if (!sidebar) {
        setShowSidebar(false);
      }
    }
  };

  const handleGuestTimeChange = ({
    meetingStartTime: start,
    meetingEndTime: end,
  }) => {
    if (start !== undefined) setGuestStartTime(start);
    if (end !== undefined) setGuestEndTime(end);
  };

  const handleCreateGuestMeeting = async () => {
    if (!guestSubject) {
      toast.error("Please enter a subject");
      return;
    }
    if (guests.length === 0) {
      toast.error("Please add at least one guest");
      return;
    }
    if (!guestStartTime) {
      toast.error("Please select a start time");
      return;
    }

    setGuestLoading(true);
    try {
      const payload = {
        guests, // Send guests array
        groupName: guestSubject, // Controller expects groupName as topic
        meetingStartTime: guestStartTime,
        meetingEndTime: guestEndTime,
        groupDescription: guestDescription,
      };

      const res = await axios.post(
        "/api/groups/create-guest-meeting",
        payload,
        config,
      );

      if (res.data.success) {
        toast.success(
          `Guest Meeting scheduled successfully. Invitations sent to ${guests.length} guest${guests.length > 1 ? "s" : ""}`,
        );
        setShowGuestMeetingModal(false);

        // Reset fields
        setGuests([]);
        setGuestSubject("");
        setGuestDescription("");

        // Refresh Lists
        if (
          guestMeetingsActivity ||
          (meetingsActivity && meetingTypeFilter === "guest")
        ) {
          getAllGuestMeetings(0);
        }
        fetchCalendarMeetings();
      } else {
        toast.error("Failed to create meeting");
      }
    } catch (error) {
      console.error("Error creating guest meeting:", error);
      toast.error(error.response?.data?.message || "Error creating meeting");
    } finally {
      setGuestLoading(false);
    }
  };

  const handleCreateMeetingPrompt = () => {
    Swal.fire({
      title: "Create Meeting",
      // text: "Choose the type of meeting you want to create",
      showCancelButton: false,
      // confirmButtonText: "Guest Meeting",
      confirmButtonText: "Group Meeting",
      confirmButtonColor: "#1da678",
      cancelButtonColor: "#ad1e23",
      reverseButtons: true,
      customClass: {
        confirmButton: "swal-guest-btn",
        cancelButton: "swal-normal-btn",
      },
      didOpen: () => {
        const confirmBtn = document.querySelector(".swal-guest-btn");
        const cancelBtn = document.querySelector(".swal-normal-btn");

        if (confirmBtn) {
          confirmBtn.style.backgroundColor = "#1da678";
          confirmBtn.style.color = "#fff";
          confirmBtn.style.border = "none";
          confirmBtn.style.padding = "10px 24px";
          confirmBtn.style.fontSize = "16px";
        }

        if (cancelBtn) {
          cancelBtn.style.backgroundColor = "#ad1e23";
          cancelBtn.style.color = "#fff";
          cancelBtn.style.border = "none";
          cancelBtn.style.padding = "10px 24px";
          cancelBtn.style.fontSize = "16px";
        }
      },
    }).then((result) => {
      if (result.isConfirmed) {
        // Guest Meeting
        // setShowGuestMeetingModal(true);
        handelCreteMeeting();
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        // Normal Meeting
        // handelCreteMeeting();
      }
    });
  };

  const handleSidebarSelect = (index) => {
    setIsHidden(false);
    setShowSidebar(false); // Hide sidebar after selecting an item
    const inCall = sessionStorage.getItem("userInActiveCall") === "true";

    switch (index) {
      case "logo_click":
        if (!inCall) setSelected(null);
        break;
      case "all_groups":
        setShowActivity(true);
        setCallHistoryActivity(false);
        setMeetingsActivity(false);
        setGuestMeetingsActivity(false);
        currentViewRef.current = "chat";
        setGroupList([]); // Clear list to prevent stale data
        if (!inCall) {
          showActivity ? "" : setSelected(null);
        }
        break;

      case "meetings":
        setShowActivity(false);
        setCallHistoryActivity(false);
        setMeetingsActivity(true);
        setGuestMeetingsActivity(false);
        currentViewRef.current = "meetings";
        setPastMeetings(false);
        setScheduledMeetings(true);
        setGroupList([]); // Clear list to prevent stale data
        if (!inCall) {
          meetingsActivity ? "" : setSelected(null);
        }
        break;

      case "guest_meetings":
        setShowActivity(false);
        setCallHistoryActivity(false);
        setMeetingsActivity(false);
        setGuestMeetingsActivity(true);
        currentViewRef.current = "guest_meetings";
        setGroupList([]); // Clear list to prevent stale data
        if (!inCall) {
          guestMeetingsActivity ? "" : setSelected(null);
        }
        break;

      case "call_history":
        setShowActivity(false);
        setCallHistoryActivity(true);
        setMeetingsActivity(false);
        setGuestMeetingsActivity(false);
        currentViewRef.current = "calls";
        setGroupList([]); // Clear list to prevent stale data
        if (!inCall) {
          callHistoryActivity ? "" : setSelected(null);
        }
        break;

      case "add_group":
        handleShow();
        break;

      case "add_member":
        setShowAddUserModal(true);
        break;

      case "create_meeting":
        Swal.fire({
          title: "Create Meeting",
          // text: "Choose the type of meeting you want to create",
          showCancelButton: true,
          confirmButtonText: "Guest Meeting",
          cancelButtonText: "Group Meeting",
          confirmButtonColor: "#1da678",
          cancelButtonColor: "#ad1e23",
          reverseButtons: true,
          customClass: {
            confirmButton: "swal-guest-btn",
            cancelButton: "swal-normal-btn",
          },
          didOpen: () => {
            const confirmBtn = document.querySelector(".swal-guest-btn");
            const cancelBtn = document.querySelector(".swal-normal-btn");

            if (confirmBtn) {
              confirmBtn.style.backgroundColor = "#1da678";
              confirmBtn.style.color = "#fff";
              confirmBtn.style.border = "none";
              confirmBtn.style.padding = "10px 24px";
              confirmBtn.style.fontSize = "16px";
            }

            if (cancelBtn) {
              cancelBtn.style.backgroundColor = "#ad1e23";
              cancelBtn.style.color = "#fff";
              cancelBtn.style.border = "none";
              cancelBtn.style.padding = "10px 24px";
              cancelBtn.style.fontSize = "16px";
            }
          },
        }).then((result) => {
          if (result.isConfirmed) {
            // Guest Meeting
            setShowGuestMeetingModal(true);
          } else if (result.dismiss === Swal.DismissReason.cancel) {
            // Normal Meeting
            handelCreteMeeting();
          }
        });
        break;

      // Map sidebar "Guest Meetings" item (name: 'list_guest_meeting') to guest meetings view
      case "list_guest_meeting":
        setShowActivity(false);
        setCallHistoryActivity(false);
        setMeetingsActivity(false);
        setGuestMeetingsActivity(true);
        currentViewRef.current = "guest_meetings";
        setGroupList([]); // Clear list to prevent stale data
        if (!inCall) {
          guestMeetingsActivity ? "" : setSelected(null);
        }
        break;

      case "create_guest_meeting":
        setShowGuestMeetingModal(true);
        break;

      case "all_members":
        handelPushUser(true);
        break;

      case "new_chat":
        setShowDirectChatModal(true);
        break;
    }
  };

  const handleScrollToBottom = () => {
    const element = document.getElementById("message_body_wrapper");
    if (element) {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: "smooth",
      });
      setShowScrollButton(false);
    }
  };

  // Handler to close mobile calendar when meeting is selected
  const handleMobileCalendarMeetingSelect = (meeting) => {
    setSelected(meeting);
    setShowMobileCalendar(false);
  };

  if (authLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </div>
    );
  }

  if (meetingsLoder) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </div>
    );
  }

  return (
    <>
      <div className="chat_body">
        <div className="max-width-90">
          <div
            className={`chat_wrapper ${isHidden ? "collapsed" : ""}`}
            onReset={handleReset}
          >
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  height: "100%",
                }}
              >
                <div className="VendorManagerBody1 d-block d-md-flex">
                  <div className="d-flex d-md-none justify-content-between align-items-center mobile_topbar_header">
                    <button
                      className="toggle_button me-auto"
                      onClick={toggleVisibility}
                    >
                      {icon}
                    </button>
                    <button
                      className="mobile_calender"
                      onClick={() => setShowMobileCalendar(true)}
                    >
                      <img
                        src="calender_g.png"
                        alt=""
                        width={22}
                        height={22}
                        style={{ objectFit: "contain" }}
                        className="me-3"
                      />
                    </button>
                    <Link href="#" onClick={handleShow2} passHref>
                      <div>
                        <article>
                          <div className="user_img_se">
                            <img
                              src={
                                globalUser?.data?.user?.image
                                  ? globalUser?.data?.user?.image
                                  : "/user.png"
                              }
                              alt="user"
                            />
                          </div>
                        </article>
                      </div>
                    </Link>
                  </div>

                  <SidebarPanel
                    className={showSidebar ? "show" : ""}
                    onSelect={handleSidebarSelect}
                    handleShow2={handleShow2}
                    handleLogout={handleLogout}
                    activeIndex={activeIndex}
                    setActiveIndex={setActiveIndex}
                  />

                  <div
                    className="bodyLeftSec"
                    onClick={handleBodyLeftSecClick}
                    style={{ position: "relative" }}
                  >
                    <div className="monthlyandCat">
                      <div className="d-lg-flex d-none left_top_user">
                        <Link href="#" onClick={handleShow2} passHref>
                          <div>
                            <article>
                              <div className="user_img_se">
                                <img
                                  src={
                                    globalUser?.data?.user?.image
                                      ? globalUser?.data?.user?.image
                                      : "/user.png"
                                  }
                                  alt="user"
                                />
                              </div>
                            </article>
                          </div>
                        </Link>
                        <div className="md:flex">
                          <span className="welcome_text">
                            <b>
                              {globalUser?.data?.user?.name +
                                `${globalUser?.data?.user?.userType === "admin" ? " (Admin)" : globalUser?.data?.user?.userType === "SuperAdmin" ? " (Super Admin)" : ""}`}{" "}
                            </b>
                          </span>
                        </div>
                        <ProfileModal
                          show={show2}
                          handleClose={handleClose2}
                          step2={step2}
                          handleNext2={handleNext2}
                          handlePrev2={handlePrev2}
                          globalUser={globalUser}
                          handleUploadClick={handleUploadClick}
                          handleFileChange={handleFileChange}
                          showPassword={showPassword}
                          handleClickShowPassword={handleClickShowPassword}
                          handleMouseDownPassword={handleMouseDownPassword}
                          setOldPassword={setOldPassword}
                          setNewPassword={setNewPassword}
                          changePassword={changePassword}
                          fileInputRef={fileInputRef}
                          googleConnected={googleConnected}
                          handleGoogleConnect={handleGoogleConnect}
                          handleGoogleDisconnect={handleGoogleDisconnect}
                        />

                        <AddUserModal
                          show={showAddUserModal}
                          onHide={() => setShowAddUserModal(false)}
                          step={step}
                          formData={formData}
                          setFormData={setFormData}
                          handleAddUser={handleAddUser}
                          globalUser={globalUser}
                        />

                        {/* Start Direct Chat Modal */}
                        <StartDirectChatModal
                          show={showDirectChatModal}
                          onHide={() => setShowDirectChatModal(false)}
                          globalUser={globalUser}
                          onChatStarted={handleDirectChatStarted}
                          existingGroupList={groupList}
                        />

                        {/* Create Guest Meeting Modal */}
                        {/* <CreateGuestMeetingModal
                          show={showGuestMeetingModal}
                          handleClose={() => setShowGuestMeetingModal(false)}
                          handleCreate={handleCreateGuestMeeting}
                          handleTimeChange={handleGuestTimeChange}
                          guests={guests}
                          setGuests={setGuests}
                          setSubject={setGuestSubject}
                          setDescription={setGuestDescription}
                          isLoading={guestLoading}
                        /> */}

                        <CreateGroupModal
                          show={show}
                          handleClose={handleClose}
                          step={step}
                          handleNext={handleNext}
                          handlePrev={handlePrev}
                          handleShow={handleShow}
                          filteredALLUSR={filteredALLUSR}
                          checkedIds={checkedIds}
                          handleCheckboxChange={handleCheckboxChange}
                          currentPage={currentPage}
                          totalPages={totalPages}
                          totalCount={totalCount}
                          newGroupImage={newGroupImage}
                          uploadGroupImg={uploadGroupImg}
                          setNewGroupName={setNewGroupName}
                          setNewGroupDescription={setNewGroupDescription}
                          createGroup={createGroup}
                          label={label}
                          isAddGroupLoading={isAddGroupLoading}
                        />

                        <CreateMeetingModal
                          show={createMeting}
                          handleClose={handleClose}
                          step={step}
                          handleNext={handleNext}
                          handlePrev={handlePrev}
                          handelCreteMeeting={handelCreteMeeting}
                          filteredALLUSR={filteredALLUSR}
                          checkedIds={checkedIds}
                          handleCheckboxChange={handleCheckboxChange}
                          currentPage={currentPage}
                          totalPages={totalPages}
                          totalCount={totalCount}
                          setNewGroupName={setNewGroupName}
                          setNewGroupDescription={setNewGroupDescription}
                          handleTimeChange={handleTimeChange}
                          createMeeting={createMeeting}
                          label={label}
                          isAddGroupLoading={isAddGroupLoading}
                          allUsers={ALLUSR}
                          selectedUsers={selectedUsers}
                        />

                        <UserManagementModal
                          show={showAllUsrModal}
                          handleClose={handleClose}
                          showEditUser={showEditUser}
                          setShowEditUser={setShowEditUser}
                          step={step}
                          handelPushUser={handelPushUser}
                          filteredALLUSR={filteredALLUSR}
                          globalUser={globalUser}
                          handleEditUser={handleEditUser}
                          handleDeletUser={handleDeletUser}
                          currentPage={currentPage}
                          totalPages={totalPages}
                          totalCount={totalCount}
                          editFormData={editFormData}
                          setEditFormData={setEditFormData}
                          handelSubmitEditUser={handelSubmitEditUser}
                          accountStatusOptions={accountStatusOptions}
                          selectedAccountStatus={selectedAccountStatus}
                          roleOptions={roleOptions}
                          selectedRole={selectedRole}
                          onStartDirectChat={handleStartDirectChatFromMember}
                          isAddGroupLoading={isAddGroupLoading}
                        />
                      </div>
                      {meetingsActivity && (
                        <div className="d-flex justify-content-around p-3">
                          <button
                            onClick={() => {
                              (setPastMeetings(false),
                                setScheduledMeetings(true));
                            }}
                            className={`btn ${scheduledMeetings ? "btn-dark" : "btn-success"}`}
                            style={{
                              backgroundColor: scheduledMeetings
                                ? "#1da678"
                                : "#198754",
                              // border: "solid 1px #000000",
                              color: "#fff",
                              width: "48%",
                            }}
                          >
                            Scheduled
                          </button>

                          <button
                            onClick={() => {
                              (setPastMeetings(true),
                                setScheduledMeetings(false));
                            }}
                            className={`btn ${pastMeetings ? "btn-dark" : "btn-success"}`}
                            style={{
                              backgroundColor: pastMeetings
                                ? "#1da678"
                                : "#198754",
                              // border: "solid 1px #000000",
                              color: "#fff",
                              width: "48%",
                            }}
                          >
                            Past
                          </button>
                        </div>
                      )}

                      <div className="user_search px-3 py-0 p-lg-3">
                        <input
                          type="search"
                          placeholder={
                            showActivity
                              ? "Search Groups"
                              : meetingsActivity
                                ? "Search Meetings"
                                : "Search Calls"
                          }
                          value={searchQuery}
                          onChange={(e) => handleSearch(e)}
                        />
                      </div>
                      {showActivity && (
                        <div className="filter_all px-3">
                          <ul>
                            <li className={active === "all" ? "active" : ""}>
                              <button onClick={() => setActive("all")}>
                                All
                              </button>
                            </li>
                            <li className={active === "unread" ? "active" : ""}>
                              <button onClick={() => setActive("unread")}>
                                Unread
                              </button>
                            </li>
                            {/* <li className={active === "favourite" ? "active" : ""}>
                            <button onClick={() => setActive("favourite")}>Favourite</button>
                          </li> */}
                            <li className={active === "groups" ? "active" : ""}>
                              <button onClick={() => setActive("groups")}>
                                Groups
                              </button>
                            </li>
                          </ul>
                        </div>
                      )}
                      {meetingsActivity && (
                        <div className="filter_all px-3">
                          <ul>
                            <li
                              className={
                                meetingTypeFilter === "groups" ? "active" : ""
                              }
                            >
                              <button
                                onClick={() => setMeetingTypeFilter("groups")}
                              >
                                Group
                              </button>
                            </li>
                            {/* Guest tab/filter disabled (not needed currently) */}
                            {/* <li
                              className={
                                meetingTypeFilter === "guest" ? "active" : ""
                              }
                            >
                              <button
                                onClick={() => setMeetingTypeFilter("guest")}
                              >
                                Guest
                              </button>
                            </li> */}
                          </ul>
                        </div>
                      )}
                      <div className="activity-list-container">
                        {delayLodar && (
                          <div className="delayLodar">
                            <div style={{ color: "#20446c" }}>
                              <div className="dot-pulse"></div>
                            </div>
                          </div>
                        )}
                        <div
                          className="activity-list-scroll"
                          onScroll={(e) => {
                            const { scrollTop, scrollHeight, clientHeight } =
                              e.currentTarget;
                            if (scrollTop + clientHeight >= scrollHeight - 50) {
                              handleLoadMoreGroups();
                            }
                          }}
                        >
                          <SingleTodo
                            config={config}
                            update={update}
                            setUpdate={setUpdate}
                            globalUser={globalUser}
                            selected={selected}
                            setSelected={setSelected}
                            setALLmessages={setALLmessages}
                            setModifiedMsgs={setModifiedMsgs}
                            setShowAllMessage={setShowAllMessage}
                            groupList={groupList}
                            onReset={handleReset}
                            setIsHidden={setIsHidden}
                            setShowSidebar={setShowSidebar}
                            socketRef={socketRef}
                            showActivity={showActivity}
                            meetingsActivity={meetingsActivity}
                            callHistoryActivity={callHistoryActivity}
                            isLoading={isLoading}
                            isPaginationLoading={isPaginationLoading}
                            pastMeetings={pastMeetings}
                            scheduledMeetings={scheduledMeetings}
                            delayLodar={delayLodar}
                            setDelayLodar={setDelayLodar}
                            handleLoadMoreGroups={handleLoadMoreGroups}
                            hasMoreGroups={hasMoreGroups}
                            guestMeetingsActivity={guestMeetingsActivity}
                            waitingCalls={waitingCalls}
                            meetingTypeFilter={meetingTypeFilter}
                          ></SingleTodo>
                        </div>
                      </div>
                      {meetingsActivity &&
                        globalUser?.data?.user?.userType !== "user" && (
                          <Fab
                            color="primary"
                            aria-label="add"
                            onClick={handleCreateMeetingPrompt}
                            style={{
                              position: "absolute",
                              bottom: "20px",
                              right: "20px",
                              backgroundColor: "#1da678",
                              zIndex: 1000,
                            }}
                          >
                            <AddIcon />
                          </Fab>
                        )}
                    </div>
                  </div>

                  <div
                    className="bodyRightSec"
                    onClick={handleBodyRightSecClick}
                  >
                    <div
                      className={styles.rightsecbody}
                      style={{ height: "100%" }}>
                      {showRoom && roomId && typeof callType === "string" && (
                        <div style={{ position: "absolute", zIndex: 9999 }}>
                          <Room
                            socketRef={socketRef}
                            room_id={roomId}
                            callType={callType}
                            isGuestMeeting={selected?.isGuestMeeting}
                            joinEvent={
                              selected?.isGuestMeeting
                                ? "BE-join-guest-room"
                                : "BE-join-room"
                            }
                            leaveEvent={
                              selected?.isGuestMeeting
                                ? "BE-leave-guest-room"
                                : ""
                            }
                            chatAreaProps={{
                              selected: callSelected || selected,
                              isTyping: isCallTyping,
                              typingUser: callTypingUser,
                              groupDataDetails:
                                callSelected?._id === selected?._id
                                  ? groupDataDetails
                                  : callSelected,
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
                              modifiedMsgs:
                                callSelected?._id === selected?._id
                                  ? modifiedMsgs
                                  : callModifiedMsgs,
                              setDelMsg,
                              setFrwdMsg,
                              setOpenModalInfo,
                              setRplyMsg: setCallRplyMsg,
                              handleReplyJump,
                              showScrollButton,
                              handleScrollToBottom,
                              messagesEndRef,
                              handleScroll: (e) => handleScroll(e), // TBD: handleScroll context
                              Uploadstatus,
                              progress,
                              status,
                              rplyMsg: callRplyMsg,
                              message: callMessage,
                              setMessage: setCallMessage,
                              handleTyping: () => handleTyping(true),
                              sendLoading,
                              sendMessage: (formData, msgtype, msgTxt) =>
                                sendMessage(formData, msgtype, msgTxt, true),
                              setSendLoading,
                              uploadFile: (e) => uploadFile(e, true),
                              styles,
                              onBack: () => setIsHidden(false),
                            }}
                            onSendData={() => {
                              setRoomId(null);
                              setShowRoom(false);
                              sessionStorage.removeItem("userInActiveCall");
                              sessionStorage.removeItem("activeCallId");
                              sessionStorage.removeItem("callStatus");
                              // Re-register socket for messages after call ends
                              if (
                                socketRef.current &&
                                globalUser?.data?.user?._id
                              ) {
                                socketRef.current.emit(
                                  "joinSelf",
                                  globalUser.data.user._id,
                                );
                              }
                            }}
                          />
                        </div>
                      )}

                      {openEditModal && (
                        // <></>
                        <EditGroupModal
                          isOpen={true}
                          setOpenEditModal={setOpenEditModal}
                          selected={selected}
                          setSelected={setSelected}
                          getContact={getContact}
                          refreshGuestMeetings={() => getAllGuestMeetings(0)}
                          // user={globalUser.data}
                          groupDataDetails={groupDataDetails}
                          socketRef={socketRef}
                          now={now}
                        ></EditGroupModal>
                      )}
                      {openReportModal && (
                        // <></>
                        <ReportModal
                          isOpen={true}
                          setOpenReportModal={setOpenReportModal}
                          groupId={selected?._id}
                          type={reportType}
                          selected={selected}
                        ></ReportModal>
                      )}
                      {openDeleteModal && (
                        // <></>
                        <DeleteGroupModal
                          isOpen={true}
                          setOpenDeleteModal={setOpenDeleteModal}
                          groupId={selected?._id}
                          type={selected?.isTemp ? "Meeting" : "Group"}
                          socketRef={socketRef}
                          setMeetingsActivity={setMeetingsActivity}
                          onDeleteResponse={onDeleteResponse}
                          selected={selected}
                        ></DeleteGroupModal>
                      )}
                      {openModalInfo && (
                        // <></>
                        <ChatInfo
                          isOpen={true}
                          msgId={frwdMsg._id}
                          setOpenModalInfo={setOpenModalInfo}
                          groupId={selected?._id}
                          type={reportType}
                        ></ChatInfo>
                      )}
                      <>
                        <IncomingCallButton
                          socketRef={socketRef}
                          user_name={globalUser?.data?.user?.name}
                          userId={globalUser?.data?.user?._id}
                          onAcceptIncomingCall={handleAcceptIncomingCall}
                        />
                        {selected && selected?._id ? (
                          <ChatArea
                            selected={selected}
                            isTyping={isTyping}
                            typingUser={typingUser}
                            groupDataDetails={groupDataDetails}
                            globalUser={globalUser}
                            socketRef={socketRef}
                            showRoom={showRoom}
                            setCallType={setCallType}
                            setRoomId={setRoomId}
                            setShowRoom={setShowRoom}
                            pendingCallPreview={pendingCallPreview}
                            setPendingCallPreview={setPendingCallPreview}
                            setOpenEditModal={setOpenEditModal}
                            setOpenReportModal={setOpenReportModal}
                            setReportType={setReportType}
                            setOpenDeleteModal={setOpenDeleteModal}
                            now={now}
                            fetchMoreMsg={fetchMoreMsg}
                            showFetchMsg={showFetchMsg}
                            replyJumpingId={replyJumpingId}
                            modifiedMsgs={modifiedMsgs}
                            setDelMsg={setDelMsg}
                            setFrwdMsg={setFrwdMsg}
                            setOpenModalInfo={setOpenModalInfo}
                            setRplyMsg={setRplyMsg}
                            handleReplyJump={handleReplyJump}
                            showScrollButton={showScrollButton}
                            handleScrollToBottom={handleScrollToBottom}
                            messagesEndRef={messagesEndRef}
                            handleScroll={handleScroll}
                            Uploadstatus={Uploadstatus}
                            progress={progress}
                            status={status}
                            rplyMsg={rplyMsg}
                            message={message}
                            setMessage={setMessage}
                            handleTyping={handleTyping}
                            sendLoading={sendLoading}
                            sendMessage={sendMessage}
                            setSendLoading={setSendLoading}
                            uploadFile={uploadFile}
                            styles={styles}
                            onBack={() => setIsHidden(false)}
                          />
                        ) : (
                          <>
                            {/* Calendar + Agenda disabled in bodyRightSec */}
                            {/* <WelcomeScreen
                              showActivity={showActivity}
                              callHistoryActivity={callHistoryActivity}
                              meetingsActivity={meetingsActivity}
                              meetings={calendarMeetings}
                              setSelected={setSelected}
                              setShowActivity={setShowActivity}
                              setMeetingsActivity={setMeetingsActivity}
                              setCallHistoryActivity={setCallHistoryActivity}
                              activeIndex={activeIndex}
                              setActiveIndex={setActiveIndex}
                              currentMonth={currentMonth}
                              setCurrentMonth={setCurrentMonth}
                              googleConnected={googleConnected}
                              isGuestMeeting={meetingTypeFilter === "guest"}
                              onSyncRefresh={fetchCalendarMeetings}
                              onGoogleConnect={handleGoogleConnect}
                              onGoogleDisconnect={handleGoogleDisconnect}
                              setMeetingTypeFilter={setMeetingTypeFilter}
                              meetingTypeFilter={meetingTypeFilter}
                              isFetchingMeetings={isFetchingMeetings}
                            /> */}
                          </>
                        )}
                      </>
                    </div>
                  </div>
                </div>
              </div>
              {/* <p
                className="text-center"
                style={{
                  fontSize: "10px",
                  color: "#6c757d",
                  marginBottom: "0px",
                  paddingTop: "15px",
                }}
              >
                Powered by{" "}
                <a
                  href="https://excellisit.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#1da678", textDecoration: "none" }}
                >
                  ExcellisIT
                </a>
              </p> */}
            </>
          </div>
        </div>
      </div>

      {/* Mobile Calendar Modal */}
      <Modal
        show={showMobileCalendar}
        onHide={() => setShowMobileCalendar(false)}
        fullscreen={true}
        className="mobile-calendar-modal"
      >
        <Modal.Header closeButton style={{ marginBottom: "0" }}>
          <Modal.Title>Calendar</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: 0, height: "100%", overflow: "auto" }}>
          <WelcomeScreen
            showActivity={showActivity}
            callHistoryActivity={callHistoryActivity}
            meetingsActivity={meetingsActivity}
            meetings={calendarMeetings}
            setSelected={handleMobileCalendarMeetingSelect}
            setMeetingTypeFilter={setMeetingTypeFilter}
            meetingTypeFilter={meetingTypeFilter}
            setShowActivity={setShowActivity}
            setMeetingsActivity={setMeetingsActivity}
            setCallHistoryActivity={setCallHistoryActivity}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            googleConnected={googleConnected}
            onSyncRefresh={fetchCalendarMeetings}
            onGoogleConnect={handleGoogleConnect}
            onGoogleDisconnect={handleGoogleDisconnect}
            isFetchingMeetings={isFetchingMeetings}
          />
        </Modal.Body>
      </Modal>
    </>
  );
};

export default React.memo(GroupMessage);
