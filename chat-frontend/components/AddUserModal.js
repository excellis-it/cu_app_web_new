import React from "react";
import Modal from "react-bootstrap/Modal";

const AddUserModal = ({
    show,
    onHide,
    step,
    formData,
    setFormData,
    handleAddUser,
    globalUser
}) => {
    return (
        <Modal
            className="add_group_modal"
            show={show}
            onHide={onHide}
            size="lg"
            centered
        >
            <Modal.Body>
                <div className={step === 1 ? "group_first_step" : "hidden"}>
                    <Modal.Header closeButton className="mb-3">
                        <div>Add User</div>
                    </Modal.Header>
                    <div className="px-3">
                    <form onSubmit={handleAddUser} autoComplete="off">
                        <div className="mb-3">
                            <label className="form-label" style={{ color: '#000000' }}>Full Name</label>
                            <input
                                type="text"
                                className="form-control"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label" style={{ color: '#000000' }}>Email Address</label>
                            <input
                                type="email"
                                className="form-control"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label" style={{ color: '#000000' }}>Password</label>
                            <input
                                autoComplete="new-password"
                                type="password"
                                className="form-control"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                required
                            />
                        </div>

                        {globalUser?.data?.user?.userType === 'SuperAdmin' && (
                            <div className="mb-3">
                                <label className="form-label" style={{ color: '#000000' }}>Role</label>
                                <select
                                    className="form-control"
                                    value={formData.userType}
                                    onChange={(e) => setFormData({ ...formData, userType: e.target.value })}
                                    required
                                >
                                    <option value="">Select Role</option>
                                    <option value="admin">Admin</option>
                                    <option value="user">Member</option>
                                </select>
                            </div>
                        )}

                        <Modal.Footer>
                            <button type="submit" className="primary_btn">
                                submit
                            </button>
                        </Modal.Footer>
                    </form>
                    </div>
                </div>
            </Modal.Body>
        </Modal>
    );
};

export default AddUserModal;
