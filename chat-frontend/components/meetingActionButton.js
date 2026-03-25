import React, { useState } from "react";
import axios from "axios";
import { toast } from 'react-toastify';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Chip,
    Box
} from "@mui/material";
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

import { useAppContext } from "../appContext/appContext";

const MeetingActionButton = ({ meetingId, initialAction }) => {
    const { globalUser } = useAppContext();
    const [openDeclineModal, setOpenDeclineModal] = useState(false);
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);
    const [actionStatus, setActionStatus] = useState(initialAction?.action || null);

    // Sync internal state with prop changes (e.g. after refresh or group switch)
    React.useEffect(() => {
        setActionStatus(initialAction?.action || null);
    }, [initialAction?.action]);

    const config = {
        headers: { "access-token": globalUser?.data?.token },
    };

    const handleMeetingAction = async (status, description = "") => {
        const actionType = status === 1 ? "accept" : "reject";
        setLoading(true);
        try {
            const response = await axios.post(`/api/groups/group-action`, {
                groupId: meetingId,
                action: actionType,
                userId: globalUser?.data?.user?._id || globalUser?.data?._id,
                actionDescription: description
            }, config);

            if (response.data.success) {
                toast.success(response.data.message || `Meeting ${actionType}ed successfully`);
                setActionStatus(actionType);
                if (status === 0) {
                    setOpenDeclineModal(false);
                    setReason("");
                }
            } else {
                toast.error(response.data.message || `Meeting ${actionType}ed failed`);
            }
        } catch (error) {
            console.error("Error updating meeting status", error);
            toast.error(error.response?.data?.message || `Meeting ${actionType}ed failed`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeclineClick = (e) => {
        if (e) e.stopPropagation();
        setOpenDeclineModal(true);
    };

    const handleModalSubmit = () => {
        if (!reason.trim()) {
            toast.warning("Please provide a reason for declining");
            return;
        }
        handleMeetingAction(0, reason);
    };

    if (actionStatus) {
        return (
            <Box onClick={(e) => e.stopPropagation()} sx={{ ml: 'auto' }}>
                <Chip
                    icon={actionStatus === 'accept' ? <CheckCircleIcon /> : <CancelIcon />}
                    label={actionStatus === 'accept' ? 'Accepted' : 'Rejected'}
                    color={actionStatus === 'accept' ? 'success' : 'error'}
                    variant="outlined"
                    size="small"
                    sx={{
                        fontWeight: 800,
                        fontSize: '10px',
                        borderRadius: '6px',
                        textTransform: 'uppercase',
                        borderWidth: '1.5px'
                    }}
                />
            </Box>
        );
    }

    return (
        <div
            className="flex gap-1 shrink-0 ml-auto"
            onClick={(e) => e.stopPropagation()}
        >
            <Button
                variant="contained"
                size="small"
                onClick={(e) => {
                    if (e) e.stopPropagation();
                    handleMeetingAction(1);
                }}
                disabled={loading}
                sx={{
                    backgroundColor: '#4caf50 !important',
                    color: '#ffffff !important',
                    fontWeight: 700,
                    fontSize: '11px',
                    textTransform: 'none',
                    px: {
                        xs: 1.5,
                        sm: 3
                    },
                    py: {
                        xs: .8,
                        sm: 1.5
                    },
                    borderRadius: '6px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    '&:hover': {
                        backgroundColor: '#388e3c !important',
                    },
                    '&.Mui-disabled': {
                        backgroundColor: '#e0e0e0 !important',
                        color: '#9e9e9e !important',
                    }
                }}
            >
                Accept
            </Button>
            <Button
                variant="contained"
                size="small"
                onClick={handleDeclineClick}
                disabled={loading}
                sx={{
                    backgroundColor: '#f44336 !important',
                    color: '#ffffff !important',
                    fontWeight: 700,
                    fontSize: '11px',
                    textTransform: 'none',
                    px: {
                        xs: 1.5,
                        sm: 3
                    },
                    py: {
                        xs: .8,
                        sm: 1.5
                    },
                    borderRadius: '6px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    '&:hover': {
                        backgroundColor: '#d32f2f !important',
                    },
                    '&.Mui-disabled': {
                        backgroundColor: '#e0e0e0 !important',
                        color: '#9e9e9e !important',
                    }
                }}
            >
                Decline
            </Button>

            <Dialog
                open={openDeclineModal}
                onClose={() => setOpenDeclineModal(false)}
                onClick={(e) => e.stopPropagation()}
                fullWidth
                maxWidth="xs"
                PaperProps={{
                    sx: { overflow: 'hidden' }
                }}
            >
                <DialogTitle sx={{ fontWeight: 800, color: '#f37e20' }}>Decline Meeting</DialogTitle>
                <DialogContent sx={{ overflow: 'hidden' }}>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Reason for declining"
                        type="text"
                        fullWidth
                        variant="outlined"
                        multiline
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Please tell us why you are declining this meeting..."
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setOpenDeclineModal(false)} sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleModalSubmit}
                        variant="contained"
                        disabled={loading}
                        sx={{
                            backgroundColor: '#f44336 !important',
                            color: '#ffffff !important',
                            '&:hover': { backgroundColor: '#d32f2f !important' },
                            fontWeight: 700
                        }}
                    >
                        {loading ? 'Submitting...' : 'Submit'}
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default MeetingActionButton;