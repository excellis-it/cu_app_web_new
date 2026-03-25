import React, { useRef, useEffect } from "react";
import Modal from "react-bootstrap/Modal";
import { TextField, Checkbox } from "@mui/material";
import GroupIcon from "@mui/icons-material/Group";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import { Scrollbar } from "react-scrollbars-custom";
import styles from "../src/styles/planning.module.css";

const CreateGroupModal = ({
    show,
    handleClose,
    step,
    handleNext,
    handlePrev,
    handleShow,
    filteredALLUSR,
    checkedIds,
    handleCheckboxChange,
    currentPage,
    totalPages,
    totalCount,
    newGroupImage,
    uploadGroupImg,
    setNewGroupName,
    setNewGroupDescription,
    createGroup,
    label,
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
            handleShow(currentPage + 1, 10);

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
                                    handleShow(currentPage, 10);
                                } else {
                                    handleShow(1, 10, searchValue);
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
                        <a
                            onClick={handleNext}
                            className="primary_btn"
                            href="javascript:void(0)"
                        >
                            Next
                        </a>
                    </Modal.Footer>
                </div>
                <div className={step === 2 ? "group_second_step" : "hidden"}>
                    <Modal.Header closeButton>
                        <Modal.Title>Create Group</Modal.Title>
                    </Modal.Header>
                    <div className="px-3 pb-3">
                        <div className="group_img_wrapper">
                            {newGroupImage ? (
                                <div className="group_img">
                                    <img
                                        src={URL.createObjectURL(newGroupImage)}
                                        alt="Group Icon"
                                        className="group_img"
                                    />
                                </div>
                            ) : (
                                <div className="group_img">
                                    <GroupIcon className="group_icon_demo" />
                                </div>
                            )}
                            <span className="group_img_upload_icon">
                                <AddAPhotoIcon>
                                    <input
                                        type="file"
                                        id="file-input2"
                                        className={styles.fileInput}
                                        onChange={(e) => uploadGroupImg(e.target.files[0])}
                                        accept=".jpg, .jpeg, .png"
                                    />
                                </AddAPhotoIcon>
                            </span>
                        </div>
                        <div className="group_other_info">
                            <TextField
                                id="filled-password-input"
                                label="Add Group Name"
                                type="text"
                                autoComplete="current-password"
                                fullWidth
                                className="mb-4"
                                onChange={(e) => setNewGroupName(e.target.value)}
                            />
                            <TextField
                                id="outlined-multiline-static"
                                label="Add Group Description"
                                multiline
                                rows={4}
                                defaultValue=""
                                fullWidth
                                onChange={(e) => setNewGroupDescription(e.target.value)}
                            />
                        </div>
                    </div>
                    <Modal.Footer>
                        <a
                            onClick={handlePrev}
                            className="sec_btn"
                            href="javascript:void(0)"
                        >
                            Prev
                        </a>
                        <a
                            className="primary_btn"
                            onClick={createGroup}
                            href="javascript:void(0)"
                        >
                            Create Group
                        </a>
                    </Modal.Footer>
                </div>
            </Modal.Body>
        </Modal>
    );
};

export default CreateGroupModal;
