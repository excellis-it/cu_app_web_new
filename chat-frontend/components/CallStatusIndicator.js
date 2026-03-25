import React, { useState, useEffect } from 'react';
import { Box, Chip, Avatar, Typography, Button } from '@mui/material';
import { Call as CallIcon, Group as GroupIcon } from '@mui/icons-material';

const CallStatusIndicator = ({ group_id, user_id, socketRef, onJoinCall }) => {
  const [activeCall, setActiveCall] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [callDuration, setCallDuration] = useState(0);
  const [callStartTime, setCallStartTime] = useState(null);

  // Effect 1: Initial API check and socket setup - only runs when group_id or socketRef changes
  useEffect(() => {
    if (!socketRef.current) return;

    // Initialize by checking if there's an active call
    const checkActiveCall = async () => {
      try {
        const response = await fetch(`/api/groups/check-active-call?group_id=${group_id}`, {
          headers: {
            "access-token": localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).data?.token : '',
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Fixed: Check data.data?.activeCall instead of data.activeCall
        if (data.success && data.data?.activeCall) {
          setActiveCall(true);
          setParticipants(data.data.participants || []);
          setCallStartTime(data.data.startedAt || Date.now());
        } else {
          setActiveCall(false);
          setParticipants([]);
          setCallDuration(0);
          setCallStartTime(null);
        }
      } catch (error) {
        console.error("Error checking active call:", error);
      }
    };

    checkActiveCall();
    
    // Listen for call status updates
    const handleCallStatusChange = (data) => {
      if (data.groupId === group_id) {
        setActiveCall(data.isActive);
        setParticipants(data.participants || []);
        
        if (data.isActive) {
          setCallStartTime(data.startedAt || Date.now());
        } else {
          setCallStartTime(null);
          setCallDuration(0);
        }
      }
    };
    
    socketRef.current.on('call-status-change', handleCallStatusChange);
    socketRef.current.on('call-participant-update', (data) => {
      if (data.groupId === group_id) {
        setParticipants(data.participants || []);
      }
    });
    
    // Request current call status when mounted
    socketRef.current.emit('get-call-status', { groupId: group_id });
    
    return () => {
      socketRef.current.off('call-status-change', handleCallStatusChange);
      socketRef.current.off('call-participant-update');
    };
  }, [group_id, socketRef]); // FIXED: Removed activeCall and callStartTime from dependencies

  // Effect 2: Timer for call duration - separate effect that doesn't call API
  useEffect(() => {
    if (!activeCall || !callStartTime) {
      setCallDuration(0);
      return;
    }

    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - callStartTime) / 1000);
      setCallDuration(seconds);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [activeCall, callStartTime]); // This effect only updates the timer, doesn't call API
  
  // Format call duration as MM:SS
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Don't show anything if there's no active call
  if (!activeCall) return null;
  
  return (
    <Box 
      sx={{ 
        position: 'relative', 
        width: '100%',
        padding: '8px 12px',
        backgroundColor: 'rgba(25, 118, 210, 0.08)',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: 2
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <CallIcon sx={{ 
          color: '#1976d2', 
          mr: 1, 
          animation: 'pulse 1.5s infinite',
          '@keyframes pulse': {
            '0%': { opacity: 0.6 },
            '50%': { opacity: 1 },
            '100%': { opacity: 0.6 },
          }
        }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
            Active Call • {formatDuration(callDuration)}
          </Typography>
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center' }}>
            <GroupIcon sx={{ fontSize: 16, mr: 0.5 }} /> 
            {participants.length} participant{participants.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
      </Box>
      
      <Button 
        variant="contained" 
        size="small"
        color="primary"
        onClick={onJoinCall}
        sx={{ fontSize: '12px' }}
      >
        Join Call
      </Button>
    </Box>
  );
};

export default CallStatusIndicator;
