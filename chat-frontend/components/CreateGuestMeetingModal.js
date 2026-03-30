import React, { useState } from 'react';
import Modal from 'react-bootstrap/Modal';
import { TextField, Button, IconButton, Chip } from '@mui/material';
import MeetingScheduler from './MeetingScheduler';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';

const CreateGuestMeetingModal = ({
    show,
    handleClose,
    handleCreate,
    handleTimeChange,
    guests,
    setGuests,
    setSubject,
    setDescription,
    isLoading
}) => {
    const [currentGuestName, setCurrentGuestName] = useState('');
    const [currentGuestEmail, setCurrentGuestEmail] = useState('');

    const addGuest = () => {
        if (!currentGuestName.trim() || !currentGuestEmail.trim()) {
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(currentGuestEmail)) {
            alert('Please enter a valid email address');
            return;
        }

        // Check for duplicate emails
        if (guests.some(g => g.email === currentGuestEmail)) {
            alert('This guest email is already added');
            return;
        }

        setGuests([...guests, { name: currentGuestName, email: currentGuestEmail }]);
        setCurrentGuestName('');
        setCurrentGuestEmail('');
    };

    const removeGuest = (index) => {
        setGuests(guests.filter((_, i) => i !== index));
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addGuest();
        }
    };

    return (
        <Modal show={show} onHide={handleClose} centered size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Create Guest Meeting</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div className="p-3">
                    <TextField
                        label="Subject"
                        fullWidth
                        className="mb-3"
                        onChange={(e) => setSubject(e.target.value)}
                    />
                    <TextField
                        label="Description (Optional)"
                        fullWidth
                        multiline
                        rows={3}
                        className="mb-3"
                        onChange={(e) => setDescription(e.target.value)}
                    />

                    {/* Guest Input Section */}
                    <div className="mb-3" style={{
                        border: '1px solid #e0e0e0',
                        borderRadius: '8px',
                        padding: '16px',
                        backgroundColor: '#f9f9f9'
                    }}>
                        <h6 style={{ marginBottom: '12px', color: '#333', fontWeight: '600' }}>
                            Add Guests
                        </h6>

                        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                            <TextField
                                label="Guest Name"
                                value={currentGuestName}
                                onChange={(e) => setCurrentGuestName(e.target.value)}
                                onKeyPress={handleKeyPress}
                                size="small"
                                style={{ flex: 1 }}
                            />
                            <TextField
                                label="Guest Email"
                                value={currentGuestEmail}
                                onChange={(e) => setCurrentGuestEmail(e.target.value)}
                                onKeyPress={handleKeyPress}
                                type="email"
                                size="small"
                                style={{ flex: 1 }}
                            />
                            <Button
                                variant="outlined"
                                onClick={addGuest}
                                style={{
                                    borderColor: '#1da678',
                                    color: '#1da678',
                                    borderRadius: '8px',
                                    height: '40px',
                                    textTransform: 'none',
                                    fontWeight: 600
                                }}
                                disabled={!currentGuestName.trim() || !currentGuestEmail.trim()}
                                startIcon={<AddIcon />}
                            >
                                Add Guest
                            </Button>
                        </div>

                        {/* Guest List */}
                        {guests.length > 0 && (
                            <div style={{
                                marginTop: '12px',
                                padding: '12px',
                                backgroundColor: 'white',
                                borderRadius: '6px',
                                border: '1px solid #e0e0e0'
                            }}>
                                <div style={{
                                    fontSize: '12px',
                                    color: '#666',
                                    marginBottom: '8px',
                                    fontWeight: '500'
                                }}>
                                    Guests ({guests.length})
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {guests.map((guest, index) => (
                                        <Chip
                                            key={index}
                                            label={`${guest.name} (${guest.email})`}
                                            onDelete={() => removeGuest(index)}
                                            deleteIcon={<CloseIcon />}
                                            style={{
                                                backgroundColor: '#fff',
                                                border: '1px solid #1da678',
                                                color: '#333'
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <MeetingScheduler onTimeChange={handleTimeChange} />
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={handleClose} style={{ marginRight: '10px', color: '#666' }}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleCreate}
                    disabled={isLoading || guests.length === 0}
                    style={{
                        backgroundColor: '#1da678',
                        color: 'white',
                        boxShadow: 'none'
                    }}
                >
                    {isLoading ? 'Creating...' : `Create Meeting${guests.length > 0 ? ` (${guests.length} guest${guests.length > 1 ? 's' : ''})` : ''}`}
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default CreateGuestMeetingModal;
