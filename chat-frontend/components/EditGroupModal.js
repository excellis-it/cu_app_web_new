import React, { useEffect, useRef, useState, useMemo } from "react";
import styles from "../src/styles/Modal.module.css"; // Import the CSS module
import axios from "axios";
import { useRouter } from "next/router";
import { useAppContext } from "../appContext/appContext";
import GroupIcon from "@mui/icons-material/Group";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import { Scrollbar } from "react-scrollbars-custom";
import DeleteIcon from "@mui/icons-material/Delete";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import Drawer from "@mui/material/Drawer";
import { toast } from "react-toastify";
import { Checkbox, CircularProgress } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import moment from "moment"
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";
import MeetingScheduler from "./MeetingScheduler";
import ReactDOM from "react-dom";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";

const EditGroupModal = ({
  isOpen,
  setOpenEditModal,
  selected,
  setSelected,
  getContact,
  refreshGuestMeetings,
  groupDataDetails,
  socketRef,
  now,
}) => {
  const router = useRouter();
  const { globalUser, setGlobalUser } = useAppContext();
  const config = {
    headers: { "access-token": globalUser?.data?.token },
  };
  if (!isOpen) {
    return null; // Don't render the modal if it's not open
  }

  const [editMode, setEditMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [SEOmodalIsOpen, SEOsetModalIsOpen] = useState(false);
  const [SEOmodalIsOpen2, SEOsetModalIsOpen2] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [isLoading, setIsLoading] = useState(false)
  const [meetingTimes, setMeetingTimes] = useState({ meetingStartTime: '', meetingEndTime: '' });
  const [meetingEditOpen, setMeetingEditOpen] = useState(false);
  const [meetingError, setMeetingError] = useState('');

  // Guest Meeting State
  const [guestData, setGuestData] = useState({
    topic: "",
    description: "",
    guest: [], // Array of guests
    startTime: "",
    endTime: ""
  });

  useEffect(() => {
    if (selected?.isGuestMeeting || selected?.guest) {
      setGuestData({
        topic: selected.groupName || selected.subject || "",
        description: selected.groupDescription || selected.description || "",
        guest: selected.guest || [],
        startTime: selected.meetingStartTime || selected.startTime || new Date().toISOString(),
        endTime: selected.meetingEndTime || selected.endTime || new Date().toISOString()
      });
    }
  }, [selected]);

  useEffect(() => {
    setMeetingTimes({
      meetingStartTime: selected?.meetingStartTime || selected?.startTime || '',
      meetingEndTime: selected?.meetingEndTime || selected?.endTime || ''
    });
  }, [selected]);

  const handleGuestSave = async () => {
    try {
      setIsLoading(true);
      const payload = {
        _id: selected._id,
        ...guestData
      };
      const res = await axios.post("/api/groups/update-guest-meeting", payload, config);
      setIsLoading(false);
      if (res.data.success) {
        toast.success("Guest meeting updated");
        setOpenEditModal(false);
        setSelected({
          ...selected,
          groupName: guestData.topic,
          subject: guestData.topic,
          groupDescription: guestData.description,
          description: guestData.description,
          guestName: guestData.guestName,
          guestEmail: guestData.guestEmail,
          meetingStartTime: guestData.startTime,
          meetingEndTime: guestData.endTime
        });
        if (refreshGuestMeetings) {
          refreshGuestMeetings();
        } else if (getContact) {
          getContact();
        }
      }
    } catch (e) {
      setIsLoading(false);
      toast.error(e.response?.data?.message || "Error updating");
    }
  }

  const handleGuestTimeSaveLocal = () => {
    if (!meetingTimes.meetingStartTime || !meetingTimes.meetingEndTime) {
      setMeetingError('Please pick a valid start time and duration.');
      return;
    }
    setGuestData(prev => ({
      ...prev,
      startTime: meetingTimes.meetingStartTime,
      endTime: meetingTimes.meetingEndTime
    }));
    setMeetingEditOpen(false);
  };

  const handleEditClick = () => {
    setNewName(selected?.groupName || ''); // Set current name when entering edit mode
    setEditMode(true);
  };

  const handleSaveClick = async () => {
    const result = await axios.post(
      `/api/groups/update-group`,
      { groupId: selected._id, groupName: newName },
      config
    );
    socketRef.current.emit("update-group", { data: result.data.data });
    setSelected({
      ...selected,
      groupName: result.data.data.groupName,
      groupImage: result.data.data.groupImage,
      groupDescription: result.data.data.groupDescription,
    });
    getContact();
    setEditMode(false);
  };

  const handleInputChange = (e) => {
    setNewName(e.target.value);
  };

  const handleCancelClick = () => {
    setEditMode(false);
  };
  const [editMode2, setEditMode2] = useState(false);
  const [newName2, setNewName2] = useState("");

  const handleEditClick2 = () => {
    setNewName2(selected?.groupDescription || ''); // Set current description when entering edit mode
    setEditMode2(true);
  };

  const handleSaveClick2 = async () => {
    const result = await axios.post(
      `/api/groups/update-group`,
      {
        groupId: selected._id,
        groupName: selected.groupName,
        groupDescription: newName2,
      },
      config
    );
    socketRef.current.emit("update-group", { data: result.data.data });
    setSelected({
      ...selected,
      groupName: result.data.data.groupName,
      groupImage: result.data.data.groupImage,
      groupDescription: result.data.data.groupDescription,
    });
    getContact();
    setEditMode2(false);
  };

  const handleMeetingTimeChange = (times) => {
    setMeetingTimes(times);
    setMeetingError('');
  };

  const saveMeetingTimes = async () => {
    try {
      if (!meetingTimes.meetingStartTime || !meetingTimes.meetingEndTime) {
        setMeetingError('Please pick a valid start time and duration.');
        return;
      }
      const result = await axios.post(
        `/api/groups/update-group`,
        {
          groupId: selected._id,
          groupName: selected.groupName,
          groupDescription: selected.groupDescription,
          meetingStartTime: meetingTimes.meetingStartTime,
          meetingEndTime: meetingTimes.meetingEndTime,
        },
        config
      );
      socketRef.current.emit("update-group", { data: result.data.data });
      setSelected({
        ...selected,
        meetingStartTime: result.data.data.meetingStartTime,
        meetingEndTime: result.data.data.meetingEndTime,
      });
      toast.success('Meeting time updated');
      setMeetingEditOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update meeting time');
    }
  }

  const userupdate = async () => {
    // Avoid updating Guest Meetings via this general group update logic
    if (selected?.isGuestMeeting || selected?.guestEmail) return;
    try {
      const resp = await axios.get(`/api/users/get-user`, config);
      const result = await axios.get(selected?.isTemp ? `/api/groups/getallmeetings` : `/api/groups/getall`, config);
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
          if (selected._id == e._id) {
            setSelected({
              ...selected,
              currentUsers: e.currentUsers,
            });
          }
        })

        // Persist the updated user object in localStorage
        localStorage.setItem("user", JSON.stringify(updatedGlobalUser));

      } else {
        console.error("Failed to fetch user data", resp.data.message);
      }
    } catch (error) {
      console.error("Error updating user:", error.message);
    }
  };


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

  const handleInputChange2 = (e) => {
    setNewName2(e.target.value);
  };

  const handleCancelClick2 = () => {
    setEditMode2(false);
  };
  const sendMessage = async (e, msgtype) => {
    let formData = new FormData();
    formData.append("groupId", selected._id);
    formData.append("senderId", globalUser?.data?.user._id);
    formData.append("senderName", globalUser?.data?.user.name);
    formData.append(
      "message",
      msgtype == "added"
        ? selected?.isTemp ? `${e} has joined the meeting.` : `${e} has joined the group.`
        : selected?.isTemp ? `${e} has been removed from the meeting.` : `${e} has been removed from the group.`
    );
    formData.append("messageType", msgtype);
    const res = await axios.post(`/api/groups/addnewmsg`, formData, config);
    let socketBody = {};
    socketBody._id = res?.data?.data?.data?._id;
    socketBody.receiverId = selected?.currentUsersId?.filter(
      (userId) => userId !== globalUser?.data?.user?._id
    );
    socketBody.senderId = globalUser?.data?.user?._id;
    socketBody.time = new Date(Date.now()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    socketRef.current.emit("message", socketBody);
  };
  const [grpName, setGrpName] = useState("");
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [usersNotAdded, setUsersNotAdded] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  // Handler to toggle selection of a user
  const handleUserSelection = (userId) => {
    const isSelected = selectedUsers.includes(userId);
    if (isSelected) {
      setSelectedUsers(selectedUsers.filter((id) => id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, userId]);
    }
  };
  const addParticipants = async () => {
    if (selectedUsers.length === 0) {
      toast.error("At least select one participant");
      return;
    }
    setIsLoading(true)
    const res = await axios.post(
      `/api/groups/adduser`,
      {
        groupId: selected._id,
        userId: selectedUsers,
      },
      config
    );
    if (res?.data?.success) {
      for (const id of selectedUsers) {
        const sel = usersNotAdded.find((user) => user._id === id);
        if (sel) {
          try {
            await sendMessage(sel.name, "added");
          } catch (error) {
            console.error("Error sending message:", error);
          }
        }
      }
      setSelectedUsers([]);
      // socketRef.current.emit("addremoveuser", res.data.data);
      socketRef.current.emit("update-group", res.data);
      const result = await axios.get(selected?.isTemp ? `/api/groups/getallmeetings` : `/api/groups/getall`, config);
      result.data.data.find((contact) => contact._id === selected._id);
      selected &&
        setSelected({
          ...selected,
          admins: result?.data?.data?.find(
            (contact) => contact?._id === selected?._id
          )?.admins,
          currentUsers: result?.data?.data?.find(
            (contact) => contact?._id === selected?._id
          )?.currentUsers,
          currentUsersId: result?.data?.data?.find(
            (contact) => contact?._id === selected?._id
          )?.currentUsersId,
        });

      setIsLoading(false)

      if (selectedUsers.length > 0) {
        // toggleDrawer('right', false)()  
        setState({})
        toast.success("Added successfully");

      }


    }
  };
  const removeParticipants = async (e) => {
    setIsLoading(true)

    const res = await axios.post(
      `/api/groups/removeuser`,
      {
        groupId: selected._id,
        userId: e._id,
      },
      config
    );

    if (res?.data?.success) {
      sendMessage(e.name, "removed");
      // socketRef.current.emit("addremoveuser", res.data.data);
      socketRef.current.emit("update-group", res.data);
      const result = await axios.get(
        selected?.isTemp ? `/api/groups/getallmeetings` : `/api/groups/getall`,

        config
      );
      result?.data?.data?.find((contact) => contact?._id === selected?._id);
      selected &&
        setSelected({
          ...selected,
          admins: result?.data?.data?.find(
            (contact) => contact?._id === selected?._id
          )?.admins,
          currentUsers: result?.data?.data?.find(
            (contact) => contact?._id === selected?._id
          )?.currentUsers,
          currentUsersId: result?.data?.data?.find(
            (contact) => contact?._id === selected?._id
          )?.currentUsersId,
        });
      setIsLoading(false)

      toast.success("remove successfully");
    }
  };
  const fetchAllUsr = async () => {
    const allUsers = await axios.post(
      "/api/admin/users/all-users",
      {},
      config
    );
    const filtererArr = allUsers.data.data.filter(
      (user) => !selected.currentUsersId.includes(user._id)
    );
    setUsersNotAdded(filtererArr);
  };
  useEffect(() => {
    if (globalUser && selected) {
      if (selected?.admins?.includes(globalUser?.data?.user?._id)) {
        setIsGroupAdmin(true);
        fetchAllUsr();
      }
    }

  }, [selected, globalUser]);
  const fileInputRef = useRef(null);

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    // You can handle the selected file here, like uploading it to a server or processing it
    update(file);
  };
  const update = async (imagefile) => {
    const formData = new FormData();
    formData.append("file", imagefile);
    formData.append("groupId", selected._id);
    const result = await axios.post(
      `/api/groups/update-group`,
      formData,
      config
    );
    if (result.data.success) {
      toast.success("Success");
      setOpenEditModal(false);
      socketRef.current.emit("update-group", { data: result.data.data });
      setSelected({
        ...selected,
        groupName: result.data.data.groupName,
        groupImage: result.data.data.groupImage,
        groupDescription: result.data.data.groupDescription,
      });
      getContact();
    }
  };
  const otherUser = useMemo(() => {
    if (!selected?.isDirect) return null;
    const users = groupDataDetails?.currentUsers || selected?.currentUsers;
    const currentUserId = globalUser?.data?.user?._id;
    return users?.find(
      (user) => (user?._id || user) !== currentUserId
    );
  }, [selected, groupDataDetails, globalUser]);

  const [state, setState] = React.useState({
    right: false,
  });

  const toggleDrawer = (anchor, open) => (event) => {
    if (
      event.type === "keydown" &&
      (event.key === "Tab" || event.key === "Shift")
    ) {
      return;
    }

    setState({ ...state, [anchor]: open });
  };

  return (
    <>
      {isLoading &&
        ReactDOM.createPortal(
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: "rgba(255, 255, 255, 0.7)",
              zIndex: 13000,
            }}
          >
            <CircularProgress />
          </div>,
          document.body
        )
      }
      <div className={`${styles.modalContainer} add_groupinfo_modal`}>
        <div className={`${styles.modalContent} modal-body`}>
          <header className={`${styles.modalHeader} modal-header`}>
            <h4>{selected?.isTemp ? 'Meeting Info' : selected?.isDirect ? 'Personal Information' : 'Group Info'}</h4>
            <a
              className="cancelButton btn-close"
              aria-label="close"
              onClick={() => setOpenEditModal(false)}
            >
            </a>
          </header>
          <section className="modalSection">
            <div className={styles.formGroup}>
              {selected?.isDirect ? (
                <div className={styles.personal_info_wrapper + " p-4"}>
                  <div className="top_group_info text-center mb-4">
                    <div className="mb-3" style={{ position: 'relative', display: 'inline-block' }}>
                      {otherUser?.image ? (
                        <img src={otherUser?.image} className={styles.personal_info_img} onClick={() => SEOsetModalIsOpen(true)} />
                      ) : (
                        <div className={styles.personal_info_img + " d-flex align-items-center justify-content-center"} style={{ fontSize: '40px', backgroundColor: '#1da678', color: '#fff' }}>
                          {otherUser?.name?.substring(0, 1)}
                        </div>
                      )}
                    </div>
                    <h3 className="mt-2 mb-1" style={{ fontWeight: '700', color: '#1a202c', fontSize: '24px' }}>{otherUser?.name}</h3>
                    <div className={styles.user_badge}>
                      {otherUser?.userType || 'User'}
                    </div>
                  </div>

                  <div className="details_card_list mt-5">
                    <div className={styles.info_card}>
                      <div className={styles.icon_wrapper}>
                        <EmailIcon fontSize="small" />
                      </div>
                      <div className={styles.info_text}>
                        <label>Email Address</label>
                        <span>{otherUser?.email || 'Not Provided'}</span>
                      </div>
                    </div>

                    <div className={styles.info_card}>
                      <div className={styles.icon_wrapper}>
                        <PhoneIcon fontSize="small" />
                      </div>
                      <div className={styles.info_text}>
                        <label>Mobile Number</label>
                        <span>{otherUser?.phone || 'Not Provided'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : selected?.isGuestMeeting || selected?.guestEmail ? (
                <div className="p-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                  <div className="mb-3">
                    <label className="form-label fw-bold" style={{ color: '#4a5568' }}>Meeting Topic</label>
                    <input
                      type="text"
                      className="form-control"
                      value={guestData.topic}
                      onChange={(e) => setGuestData({ ...guestData, topic: e.target.value })}
                      style={{ borderRadius: '8px', padding: '10px' }}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold" style={{ color: '#4a5568' }}>Description</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      value={guestData.description}
                      onChange={(e) => setGuestData({ ...guestData, description: e.target.value })}
                      style={{ borderRadius: '8px', padding: '10px' }}
                    />
                  </div>

                  <div className="row">
                    <div className="col-12 mb-3">
                      <label className="form-label fw-bold" style={{ color: '#4a5568' }}>
                        Guest Participants ({guestData.guest?.length || 0})
                      </label>
                      <div style={{
                        background: '#f8fafc',
                        borderRadius: '8px',
                        padding: '12px',
                        border: '1px solid #e2e8f0'
                      }}>
                        {guestData.guest && guestData.guest.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {guestData.guest.map((guest, index) => (
                              <div key={index} style={{
                                background: 'white',
                                padding: '10px',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                              }}>
                                <div style={{
                                  width: '36px',
                                  height: '36px',
                                  borderRadius: '50%',
                                  background: '#1da678',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 'bold',
                                  fontSize: '14px'
                                }}>
                                  {guest.name?.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: '600', color: '#2d3748', fontSize: '14px' }}>
                                    {guest.name}
                                  </div>
                                  <div style={{ color: '#718096', fontSize: '13px' }}>
                                    {guest.email}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: '#718096', fontSize: '14px', textAlign: 'center', padding: '10px' }}>
                            No guests added
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <label className="form-label fw-bold m-0" style={{ color: '#4a5568' }}>Meeting Schedule</label>
                      <Button
                        size="small"
                        onClick={() => setMeetingEditOpen(true)}
                        sx={{ color: '#1da678', fontWeight: 'bold' }}
                      >
                        Change Time
                      </Button>
                    </div>
                    <div className="p-3 bg-light rounded border d-flex align-items-center gap-2">
                      <GroupIcon sx={{ color: '#718096' }} />
                      <span style={{ fontWeight: 500 }}>
                        {moment(guestData.startTime).format('MMM DD, YYYY · hh:mm A')} - {moment(guestData.endTime).format('hh:mm A')}
                      </span>
                    </div>
                  </div>

                  <div className="d-flex justify-content-end gap-2 pt-2 border-top">
                    <Button variant="outlined" color="error" onClick={() => setOpenEditModal(false)}>Cancel</Button>
                    <Button
                      variant="contained"
                      onClick={handleGuestSave}
                      sx={{ bgcolor: '#1da678 !important', '&:hover': { bgcolor: '#178f5e' } }}
                    >
                      Save Changes
                    </Button>
                  </div>

                  {/* Reuse Meeting Dialog for Guest */}
                  <Dialog open={meetingEditOpen} onClose={() => setMeetingEditOpen(false)} style={{ width: '100%' }}>
                    <DialogTitle>Edit meeting time</DialogTitle>
                    <DialogContent>
                      <MeetingScheduler
                        initialStartTime={guestData.startTime}
                        initialDurationMin={Math.max(15, Math.min(120, Math.round((new Date(guestData.endTime) - new Date(guestData.startTime)) / (1000 * 60))))}
                        onTimeChange={handleMeetingTimeChange}
                      />
                      {meetingError && <div style={{ color: 'red', marginTop: 8 }}>{meetingError}</div>}
                    </DialogContent>
                    <DialogActions>
                      <Button className="sec_btn" onClick={() => setMeetingEditOpen(false)}>Cancel</Button>
                      <Button className="primary_btn" onClick={handleGuestTimeSaveLocal}>Update Time</Button>
                    </DialogActions>
                  </Dialog>
                </div>
              ) : (
                <>
                  <div className="top_group_info text-center pt-3 px-3">
                    <div className="group_img_wrapper mb-3">
                      {selected?.groupImage && selected?.isTemp == false ? (
                        <img src={selected?.groupImage} className="group_img" onClick={() => SEOsetModalIsOpen(true)} />
                      ) : (
                        <div className="group_img">
                          <GroupIcon className="group_icon_demo"></GroupIcon>
                        </div>
                      )}
                      <div>
                        <Dialog open={SEOmodalIsOpen} onClose={() => { SEOsetModalIsOpen(false); }}>
                          <DialogContent>
                            {/* <div style={{ display: "flex" }}> */}
                            <img src={selected?.groupImage} />
                            {/* </div> */}
                          </DialogContent>
                          <DialogActions>
                            <Button onClick={() => SEOsetModalIsOpen(false)}>Close</Button>
                          </DialogActions>
                        </Dialog>
                      </div>

                      {isGroupAdmin && selected?.isTemp == false && (
                        <span
                          className="group_img_upload_icon"
                          onClick={handleUploadClick}
                        >
                          <AddAPhotoIcon></AddAPhotoIcon>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handleFileChange}
                          />
                        </span>
                      )}
                    </div>
                    <h4 className="">
                      {editMode ? (
                        <input
                          type="text"
                          className="group_descr_input"
                          value={newName}
                          onChange={handleInputChange}
                        />
                      ) : (
                        <span style={{ textTransform: "none" }} >{selected?.groupName}</span>
                      )}
                      {editMode ? null : (
                        <EditIcon
                          className="group_name_edit_icon"
                          onClick={handleEditClick}
                        ></EditIcon>
                      )}
                      {editMode && (
                        <div>
                          <button
                            onClick={handleSaveClick}
                            style={{ marginRight: "10px" }}
                          >
                            Save
                          </button>
                          <button onClick={handleCancelClick} className="text-danger">Cancel</button>
                        </div>
                      )}
                    </h4>
                    {selected?.isTemp && !selected?.isGuestMeeting && !selected?.guestEmail && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                          <strong>Meeting Time:</strong>
                          <span>
                            {moment(selected?.meetingStartTime).format('lll')} - {moment(selected?.meetingEndTime).format('lll')}
                          </span>
                          {moment(now).isBefore(selected.meetingStartTime) && ['admin', 'superAdmin'].includes(globalUser?.data?.user?.userType) && (<EditIcon
                            className="group_name_edit_icon"
                            onClick={() => setMeetingEditOpen(true)}
                          ></EditIcon>)}
                        </div>
                        <Dialog open={meetingEditOpen} onClose={() => setMeetingEditOpen(false)} style={{ width: '100%' }}>
                          <DialogTitle>Edit meeting time</DialogTitle>
                          <DialogContent>
                            <MeetingScheduler
                              initialStartTime={selected?.isGuestMeeting ? guestData.startTime : selected?.meetingStartTime}
                              initialDurationMin={Math.max(15, Math.min(120, Math.round((new Date(selected?.isGuestMeeting ? guestData.endTime : selected?.meetingEndTime) - new Date(selected?.isGuestMeeting ? guestData.startTime : selected?.meetingStartTime)) / (1000 * 60))))}
                              onTimeChange={handleMeetingTimeChange}
                            />
                            {meetingError && <div style={{ color: 'red', marginTop: 8 }}>{meetingError}</div>}
                          </DialogContent>
                          <DialogActions>
                            <Button className="sec_btn" onClick={() => setMeetingEditOpen(false)}>Cancel</Button>
                            <Button className="primary_btn" onClick={selected?.isGuestMeeting ? handleGuestTimeSaveLocal : saveMeetingTimes}>Save</Button>
                          </DialogActions>
                        </Dialog>
                      </div>
                    )}
                    <span className="d-block group_create_date">
                      Created On: {moment(selected?.createdAt).format('ll')}
                    </span>
                    <p className="group_description_people">{selected?.isTemp ? 'Meeting' : 'Group'}: {selected?.currentUsers?.length - 1 < 0 ? 0 : globalUser?.data?.user?.userType == "SuperAdmin" ? selected?.currentUsers?.length : selected?.currentUsers?.length - 1 || 0} People</p>
                  </div>
                  <div className="group_description mb-3">
                    <h4 className="group_description_title mb-3">
                      {selected?.isTemp ? 'Meeting' : 'Group'} Description{" "}
                      <EditIcon
                        className="group_name_edit_icon"
                        onClick={handleEditClick2}
                      ></EditIcon>{" "}
                    </h4>
                    {editMode2 ? (
                      <input className="group_descr_input"
                        type="text"
                        value={newName2}
                        onChange={handleInputChange2}
                      />
                    ) : (
                      <span className="group_description_text">{selected?.groupDescription}</span>
                    )}
                    {editMode2 && (
                      <div>
                        <button
                          onClick={handleSaveClick2}
                          style={{ marginRight: "10px" }}
                        >
                          Save
                        </button>
                        <button onClick={handleCancelClick2} className="text-danger">Cancel</button>
                      </div>
                    )}
                  </div>
                  <div className="group_participant_list">
                    <div className="participant_title d-flex align-items-center justify-content-between mb-3">
                      <h4>{selected?.currentUsers?.length - 1 < 0 ? 0 : globalUser?.data?.user?.userType == "SuperAdmin" ? selected?.currentUsers?.length : selected?.currentUsers?.length - 1 || 0} Participant</h4>
                      {isGroupAdmin && (
                        <>
                          <a href="#"></a>

                          <div>
                            {["right"].map((anchor) => (
                              <React.Fragment key={anchor}>
                                <a href="#" onClick={toggleDrawer(anchor, true)}>
                                  <AddCircleIcon className="add_member_icon"></AddCircleIcon>
                                </a>
                                <Drawer
                                  anchor={anchor}
                                  open={state[anchor]}
                                  onClose={toggleDrawer(anchor, false)}
                                  className="custom_drawer"
                                >
                                  <div className="participant_list_wrapper custom_drawer ps-4 pe-4 pt-3" style={{ backgroundColor: '#ffffff', }}>
                                    <div className="d-flex align-items-center add_participant_header justify-content-between border-bottom pb-3">
                                      <h4 className="add_participant_header_title">Select Participant</h4>
                                      <a href="#" onClick={addParticipants}>
                                        Add Participant
                                      </a>
                                    </div>
                                    <Scrollbar style={{ height: "85vh" }}>
                                      {usersNotAdded.map((e, key) => {
                                        return (
                                          <div className="single_participants d-flex align-items-center justify-content-between">
                                            <div className="participant_wrapper d-flex align-items-center">
                                              {e.image ? (
                                                <img
                                                  className="participants_dp"
                                                  src={e.image}
                                                />
                                              ) : (
                                                <div className="participants_dp">
                                                  {e?.name?.substring(0, 1)}
                                                </div>
                                              )}
                                              <div className="partifipant_info">
                                                <h4>{e?.name}</h4>
                                                <p>{e?.email}</p>
                                              </div>
                                            </div>
                                            <div className="participant_checkbox">
                                              <Checkbox
                                                checked={selectedUsers?.includes(
                                                  e?._id
                                                )} // Check if the user is selected
                                                onChange={() =>
                                                  handleUserSelection(e?._id)
                                                } // Call handleUserSelection when checkbox is toggled
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </Scrollbar>
                                  </div>
                                </Drawer>
                              </React.Fragment>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    {groupDataDetails?.currentUsers?.map((e) => {
                      if (e.userType !== "SuperAdmin" || globalUser?.data?.user?.userType == "SuperAdmin") {
                        return (
                          <div className="participant_list_wrapper_group" key={e.id}>
                            <div className="single_participants d-flex align-items-center justify-content-between">
                              <div className="participant_wrapper d-flex align-items-center">
                                {e.image ? (
                                  <img className="participants_dp" src={e.image} onClick={() => { setSelectedParticipant(e); SEOsetModalIsOpen2(true) }} />
                                ) : (
                                  <div className="participants_dp">
                                    {e.name.substring(0, 1)}
                                  </div>
                                )}
                                <div className="partifipant_info">
                                  <h4>{globalUser.data.user._id === e._id ? globalUser.data.user.name : e.name}</h4>
                                  <p>
                                    {selected?.admins?.includes(e._id)
                                      ? "Admin"
                                      : "Member"}
                                  </p>
                                  <div>
                                    <Dialog open={SEOmodalIsOpen2} onClose={(e) => { SEOsetModalIsOpen2(false) }}>
                                      <DialogContent>
                                        <img src={selectedParticipant?.image} />
                                      </DialogContent>
                                      <DialogActions>
                                        <Button onClick={() => SEOsetModalIsOpen2(false)}>Close</Button>
                                      </DialogActions>
                                    </Dialog>
                                  </div>


                                  {/* <p>{e.email}</p> */}
                                </div>
                              </div>
                              <div
                                className="participant_checkbox"
                                onClick={() => removeParticipants(e)}
                              >
                                {isGroupAdmin && !selected?.admins?.includes(e?._id) && (
                                  selected?.isTemp ?
                                    !now.isBetween(moment(selected.meetingStartTime), moment(selected.meetingEndTime)) &&
                                    <a href="#" style={{ paddingLeft: "50px" }}>
                                      <DeleteIcon />
                                    </a>
                                    :
                                    <a href="#" style={{ paddingLeft: "50px" }}>
                                      <DeleteIcon />
                                    </a>

                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
};

export default EditGroupModal;
