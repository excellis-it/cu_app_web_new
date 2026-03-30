import React, { useRef, useEffect } from "react";
import Modal from "react-bootstrap/Modal";
import { Scrollbar } from "react-scrollbars-custom";
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ChatIcon from '@mui/icons-material/Chat';
import Select from 'react-select';
import Swal from 'sweetalert2';

const UserManagementModal = ({
    show,
    handleClose,
    showEditUser,
    setShowEditUser,
    step,
    handelPushUser,
    filteredALLUSR,
    globalUser,
    handleEditUser,
    handleDeletUser,
    currentPage,
    totalPages,
    totalCount,
    editFormData,
    setEditFormData,
    handelSubmitEditUser,
    accountStatusOptions,
    selectedAccountStatus,
    roleOptions,
    selectedRole,
    onStartDirectChat, // NEW: callback to start 1:1 chat
    isAddGroupLoading
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
            handelPushUser(currentPage + 1, 10);

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

    // Pass member to parent for existence check and confirmation
    const handleChatClick = (member) => {
        onStartDirectChat(member);
    };

    return (
        <Modal
            className="add_group_modal"
            show={show}
            onHide={handleClose}
            size="lg"
            centered
        >
            {!showEditUser ? (
                <Modal.Body>
                    <div className={step === 1 ? "group_first_step" : "hidden"}>
                        <Modal.Header closeButton className="mb-3">
                            <Modal.Title>All Participants</Modal.Title>
                        </Modal.Header>
                        <div className="participant_search mb-3">
                            <input
                                type="text"
                                placeholder="search participants"
                                className="form-control"
                                onChange={(e) => {
                                    const searchValue = e.target.value.toLowerCase();
                                    if (searchValue === "") {
                                        handelPushUser(currentPage, 10);
                                    } else {
                                        handelPushUser(1, 10, searchValue);
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
                                    <div key={e?._id} className="single_participants d-flex align-items-center justify-content-between border-bottom">
                                        <div className="participant_wrapper d-flex align-items-center">
                                            {e?.image ? (
                                                <img className="participants_dp" src={e?.image} alt={e?.name} />
                                            ) : (
                                                <div className="participants_dp">
                                                    {e?.name?.substring(0, 1) || "?"}
                                                </div>
                                            )}
                                            <div className="partifipant_info">
                                                <div className="d-flex align-items-center gap-2">
                                                    <h4>{e?.name || "?"}</h4>
                                                    <p style={{ textTransform: "capitalize", color: "#35a200", fontSize: "13px" }}>
                                                        {e.userType === "user"
                                                            ? "Member"
                                                            : e.userType === "Member"
                                                                ? "Member"
                                                                : "Admin"}
                                                    </p>
                                                </div>


                                                <p>{e.email}</p>
                                            </div>
                                        </div>
                                        <div className="participant_checkbox" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            {/* Chat Icon - Start 1:1 chat (only show for other users, not self) */}
                                            {/* {e._id !== globalUser?.data?.user?._id && onStartDirectChat && (
                                                <ChatIcon
                                                    style={{
                                                        cursor: "pointer",
                                                        color: "#F47920",
                                                        fontSize: "22px"
                                                    }}
                                                    titleAccess="Start chat"
                                                    onClick={() => handleChatClick(e)}
                                                />
                                            )} */}
                                            {globalUser?.data?.user?.userType === "admin" ? (
                                                e.userType === "Member" && (
                                                    <EditIcon
                                                        style={{ cursor: "pointer" }}
                                                        onClick={() => handleEditUser(e)}
                                                    />
                                                )
                                            ) : (
                                                <EditIcon
                                                    style={{ cursor: "pointer" }}
                                                    onClick={() => handleEditUser(e)}
                                                />
                                            )}
                                            <DeleteIcon
                                                style={{ cursor: "pointer", color: "red" }}
                                                onClick={() => handleDeletUser(e)}
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
                    </div>
                </Modal.Body>
            ) : (
                <Modal.Body>
                    <div className={step === 1 ? "group_first_step" : "hidden"}>
                        <Modal.Header className="mb-3">
                            <div>Edit User</div>
                        </Modal.Header>
                        <div className="px-3">
                            <form onSubmit={handelSubmitEditUser}>
                                <div className="mb-3">
                                    <label className="form-label">Full Name</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={editFormData.name}
                                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Email Address</label>
                                    <input
                                        type="email"
                                        className="form-control"
                                        value={editFormData.email}
                                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Password</label>
                                    <input
                                        type="password"
                                        className="form-control"
                                        value={editFormData.password}
                                        onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                                    />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Account Status</label>
                                    <Select
                                        options={accountStatusOptions}
                                        value={selectedAccountStatus}
                                        onChange={(selectedOption) =>
                                            setEditFormData({ ...editFormData, accountStatus: selectedOption?.value || '' })
                                        }
                                        placeholder="Select Account Status"
                                        isClearable
                                    />
                                </div>
                                {globalUser?.data?.user?.userType === 'SuperAdmin' && (
                                    <div className="mb-3">
                                        <label className="form-label">Role</label>
                                        <Select
                                            options={roleOptions}
                                            value={selectedRole}
                                            onChange={(selectedOption) =>
                                                setEditFormData({ ...editFormData, userType: selectedOption?.value || '' })
                                            }
                                            placeholder="Select Role"
                                            isClearable
                                        />
                                    </div>
                                )}
                                <Modal.Footer>
                                    <button type="button" className="btn btn-danger" onClick={() => setShowEditUser(false)}>
                                        cancel
                                    </button>
                                    <button type="submit" className="primary_btn">
                                        submit
                                    </button>
                                </Modal.Footer>
                            </form>
                        </div>
                    </div>
                </Modal.Body>
            )}
        </Modal>
    );
};

export default UserManagementModal;
