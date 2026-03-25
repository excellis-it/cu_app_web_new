import React, { useState, useEffect } from "react";
import Modal from "react-bootstrap/Modal";
import axios from "axios";
import CircularProgress from "@mui/material/CircularProgress";
import SearchIcon from "@mui/icons-material/Search";
import PersonIcon from "@mui/icons-material/Person";

const StartDirectChatModal = ({
    show,
    onHide,
    globalUser,
    onChatStarted, // Callback when chat is started
    existingGroupList // To check if chat already exists
}) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [startingChat, setStartingChat] = useState(null); // Track which user we're starting chat with

    // Fetch all users when modal opens
    useEffect(() => {
        if (show) {
            fetchUsers();
        }
    }, [show]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/users/getall', {
                headers: { "access-token": globalUser?.data?.token }
            });
            if (response.data.success) {
                // Filter out current user and SuperAdmin
                const filteredUsers = response.data.data.filter(
                    user => user._id !== globalUser?.data?.user?._id &&
                        user.userType !== 'SuperAdmin'
                );
                setUsers(filteredUsers);
            }
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const startDirectChat = async (targetUser) => {
        setStartingChat(targetUser._id);
        try {
            const response = await axios.post('/api/groups/direct', {
                targetUserId: targetUser._id
            }, {
                headers: { "access-token": globalUser?.data?.token }
            });

            if (response.data.success) {
                const directChat = response.data.data;

                // Call the callback with the new/existing chat
                onChatStarted(directChat);
                onHide();
            }
        } catch (error) {
            console.error('Error starting direct chat:', error);
            alert('Failed to start chat. Please try again.');
        } finally {
            setStartingChat(null);
        }
    };

    // Filter users based on search
    const filteredUsers = users.filter(user =>
        user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Check if direct chat already exists with a user
    const hasExistingChat = (userId) => {
        return existingGroupList?.some(group =>
            group.isDirect &&
            group.currentUsers?.some(u => (u._id || u) === userId)
        );
    };

    return (
        <Modal
            className="add_group_modal"
            show={show}
            onHide={onHide}
            size="md"
            centered
        >
            <Modal.Header closeButton>
                <Modal.Title style={{ color: '#000', fontSize: '18px' }}>
                    Start New Chat
                </Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ maxHeight: '60vh', overflow: 'hidden' }}>
                {/* Search Input */}
                <div className="search-container mb-3" style={{ position: 'relative' }}>
                    <SearchIcon style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#999'
                    }} />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="form-control"
                        style={{
                            paddingLeft: '45px',
                            borderRadius: '25px',
                            border: '1px solid #ddd'
                        }}
                    />
                </div>

                {/* User List */}
                <div style={{
                    maxHeight: '400px',
                    overflowY: 'auto',
                    paddingRight: '5px'
                }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <CircularProgress size={30} style={{ color: '#F47920' }} />
                            <p style={{ marginTop: '10px', color: '#666' }}>Loading users...</p>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                            {searchQuery ? 'No users found' : 'No users available'}
                        </div>
                    ) : (
                        filteredUsers.map(user => (
                            <div
                                key={user._id}
                                onClick={() => !startingChat && startDirectChat(user)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '12px 15px',
                                    borderRadius: '10px',
                                    marginBottom: '8px',
                                    cursor: startingChat ? 'wait' : 'pointer',
                                    backgroundColor: startingChat === user._id ? '#f5f5f5' : '#fff',
                                    border: '1px solid #eee',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                    if (!startingChat) {
                                        e.currentTarget.style.backgroundColor = '#fff5ef';
                                        e.currentTarget.style.borderColor = '#F47920';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!startingChat) {
                                        e.currentTarget.style.backgroundColor = '#fff';
                                        e.currentTarget.style.borderColor = '#eee';
                                    }
                                }}
                            >
                                {/* User Avatar */}
                                {user.image ? (
                                    <img
                                        src={user.image}
                                        alt={user.name}
                                        style={{
                                            width: '45px',
                                            height: '45px',
                                            borderRadius: '50%',
                                            objectFit: 'cover',
                                            marginRight: '12px'
                                        }}
                                    />
                                ) : (
                                    <div style={{
                                        width: '45px',
                                        height: '45px',
                                        borderRadius: '50%',
                                        backgroundColor: '#F47920',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginRight: '12px',
                                        color: '#fff',
                                        fontWeight: 'bold',
                                        fontSize: '18px'
                                    }}>
                                        {user.name?.charAt(0).toUpperCase()}
                                    </div>
                                )}

                                {/* User Info */}
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        fontWeight: '600',
                                        color: '#333',
                                        fontSize: '15px'
                                    }}>
                                        {user.name}
                                    </div>
                                    <div style={{
                                        fontSize: '13px',
                                        color: '#888',
                                        marginTop: '2px'
                                    }}>
                                        {user.email}
                                    </div>
                                </div>

                                {/* Status/Action */}
                                <div>
                                    {startingChat === user._id ? (
                                        <CircularProgress size={20} style={{ color: '#F47920' }} />
                                    ) : hasExistingChat(user._id) ? (
                                        <span style={{
                                            fontSize: '12px',
                                            color: '#4CAF50',
                                            backgroundColor: '#e8f5e9',
                                            padding: '4px 10px',
                                            borderRadius: '12px'
                                        }}>
                                            Chat exists
                                        </span>
                                    ) : (
                                        <span style={{
                                            fontSize: '12px',
                                            color: '#F47920',
                                            fontWeight: '500'
                                        }}>
                                            Start Chat →
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Modal.Body>
        </Modal>
    );
};

export default StartDirectChatModal;
