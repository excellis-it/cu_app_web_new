import React, { useRef, useEffect } from "react";
import Modal from "react-bootstrap/Modal";
import { TextField, Checkbox, Chip, Avatar, Tooltip } from "@mui/material";
import { Scrollbar } from "react-scrollbars-custom";
import MeetingScheduler from "./MeetingScheduler";

const CreateMeetingModal = ({
    show,
    handleClose,
    step,
    handleNext,
    handlePrev,
    handelCreteMeeting,
    filteredALLUSR,
    checkedIds,
    handleCheckboxChange,
    currentPage,
    totalPages,
    totalCount,
    setNewGroupName,
    setNewGroupDescription,
    handleTimeChange,
    createMeeting,
    label,
    isAddGroupLoading,
    allUsers = [],
    selectedUsers = []
}) => {
    const scrollbarRef = useRef(null);
    const isLoadingMore = useRef(false);

    // Handle scroll event for infinite scroll
    const handleScroll = (scrollValues) => {
        const { scrollTop, scrollHeight, clientHeight } = scrollValues;

        // Check if user has scrolled near the bottom (85% of the way)
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

        // Load more if scrolled 85% down and there are more pages
        if (
            scrollPercentage > 0.85 &&
            currentPage < totalPages &&
            !isLoadingMore.current &&
            !isAddGroupLoading
        ) {
            isLoadingMore.current = true;
            handelCreteMeeting(currentPage + 1, 10);

            // Reset loading flag after a short delay
            setTimeout(() => {
                isLoadingMore.current = false;
            }, 500);
        }
    };

    // Reset loading flag when data changes
    useEffect(() => {
        if (!isAddGroupLoading) {
            isLoadingMore.current = false;
        }
    }, [isAddGroupLoading]);

    return (
        <Modal
            className="add_group_modal"
            show={show}
            onHide={handleClose}
            size="lg"
            centered
        >
            <Modal.Body>
                <div className={step === 1 ? "group_first_step" : "hidden"}>
                    <Modal.Header closeButton className="mb-3">
                        <Modal.Title>Add Participants</Modal.Title>
                    </Modal.Header>
                    <div className="participant_search mb-3">
                        <input
                            type="text"
                            placeholder="search participants"
                            className="form-control"
                            onChange={(e) => {
                                const searchValue = e.target.value.toLowerCase();
                                if (searchValue === "") {
                                    handelCreteMeeting(currentPage, 10);
                                } else {
                                    handelCreteMeeting(1, 10, searchValue);
                                }
                            }}
                        />
                    </div>

                    <div className="participant_list_wrapper">
                        <Scrollbar
                            ref={scrollbarRef}
                            style={{ height: "350px" }}
                            onScroll={handleScroll}
                        >
                            {filteredALLUSR?.map((e) => (
                                <div key={e?._id} className="single_participants d-flex align-items-center justify-content-between">
                                    <div className="participant_wrapper d-flex align-items-center">
                                        {e?.image ? (
                                            <img className="participants_dp" src={e?.image} alt={e?.name} />
                                        ) : (
                                            <div className="participants_dp">
                                                {e?.name?.substring(0, 1) || "?"}
                                            </div>
                                        )}
                                        <div className="partifipant_info">
                                            <h4>{e?.name || "?"}</h4>
                                            <p>{e?.email || "?"}</p>
                                        </div>
                                    </div>
                                    <div className="participant_checkbox">
                                        <Checkbox
                                            checked={checkedIds.includes(e?._id)}
                                            onChange={() => handleCheckboxChange(e?._id)}
                                            {...label}
                                        />
                                    </div>
                                </div>
                            ))}
                        </Scrollbar>
                        <div className="border-top pt-2 pb-2">
                            <div className="row">
                                <div className="col-12 col-md-6">
                                    {totalPages > 1 && (
                                        <div className="pagination-info">
                                            <small className="text-muted">
                                                Showing {filteredALLUSR?.length || 0} of {totalCount} participants
                                                {currentPage < totalPages && " - Scroll down for more"}
                                            </small>
                                        </div>
                                    )}
                                </div>
                                <div className="col-12 col-md-6">
                                    {isAddGroupLoading && (
                                        <div className="d-flex justify-content-end">
                                            <div className="spinner-border spinner-border-sm text-warning" role="status">
                                                <span className="visually-hidden">Loading...</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    <Modal.Footer>
                        <a onClick={handleNext} className="primary_btn" href="javascript:void(0)">
                            Next
                        </a>
                    </Modal.Footer>
                </div>
                <div className={step === 2 ? "group_second_step" : "hidden"}>
                    <Modal.Header closeButton>
                        <Modal.Title>Create Meeting</Modal.Title>
                    </Modal.Header>
                    <div className="px-3">
                    {/* Selected Members Section */}
                    {checkedIds.length > 0 && (() => {
                        // Prioritize selectedUsers (maintained state), then allUsers, then filteredALLUSR
                        let selectedMembers = [];
                        if (selectedUsers.length > 0) {
                            // Use the maintained selectedUsers state
                            selectedMembers = selectedUsers.filter((user) => checkedIds.includes(user._id));
                        } else {
                            // Fallback: search in allUsers or filteredALLUSR
                            const usersToSearch = allUsers.length > 0 ? allUsers : filteredALLUSR;
                            selectedMembers = usersToSearch.filter((user) => checkedIds.includes(user._id));
                        }
                        
                        return (
                            <div className="selected_members_section mb-4">
                                <h5 style={{ marginBottom: '12px', fontWeight: '600' }}>Selected Participants ({checkedIds.length})</h5>
                                <div
                                    className="selected_members_list"
                                    style={{
                                        maxHeight: "150px",
                                        overflowY: "auto",
                                        padding: "10px",
                                        backgroundColor: "#f8f9fa",
                                        borderRadius: "6px",
                                        border: "1px solid #e0e0e0",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: "8px",
                                            alignItems: "center",
                                        }}
                                    >
                                        {selectedMembers.length > 0 ? (
                                            selectedMembers.map((user) => {
                                                const name = user?.name || "?";
                                                const email = user?.email || "";
                                                const firstLetter = (name?.substring?.(0, 1) || "?").toUpperCase();
                                                return (
                                                    <Tooltip key={user._id} title={email ? `${name} (${email})` : name} arrow>
                                                        <Chip
                                                            variant="outlined"
                                                            label={name}
                                                            avatar={
                                                                <Avatar src={user?.image || undefined} alt={name}>
                                                                    {firstLetter}
                                                                </Avatar>
                                                            }
                                                            onDelete={() => handleCheckboxChange(user._id)}
                                                            sx={{
                                                                backgroundColor: "#ffffff",
                                                                borderColor: "#dcdcdc",
                                                                "& .MuiChip-label": { fontWeight: 500 },
                                                            }}
                                                        />
                                                    </Tooltip>
                                                );
                                            })
                                        ) : (
                                            <div style={{ padding: "6px", fontSize: "12px", color: "#666", fontStyle: "italic" }}>
                                                {checkedIds.length} participant(s) selected
                                            </div>
                                        )}
                                        {checkedIds.length > selectedMembers.length && (
                                            <div style={{ padding: "6px", fontSize: "12px", color: "#666", fontStyle: "italic" }}>
                                                + {checkedIds.length - selectedMembers.length} more participant(s)
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                    <div className="group_other_info">
                        <TextField
                            style={{ color: '#000000' }}
                            label="Add Meeting Title"
                            type="text"
                            fullWidth
                            className="mb-4"
                            onChange={(e) => setNewGroupName(e.target.value)}
                        />
                        <TextField
                            style={{ color: '#000000' }}
                            label="Add Meeting Description"
                            multiline
                            rows={4}
                            fullWidth
                            onChange={(e) => setNewGroupDescription(e.target.value)}
                        />
                        <MeetingScheduler onTimeChange={handleTimeChange} />
                    </div>
                    </div>
                    <Modal.Footer>
                        <a onClick={handlePrev} className="sec_btn" href="javascript:void(0)">
                            Prev
                        </a>
                        <a className="primary_btn" onClick={createMeeting} href="javascript:void(0)">
                            Create Meeting
                        </a>
                    </Modal.Footer>
                </div>
            </Modal.Body>
        </Modal>
    );
};

export default CreateMeetingModal;
