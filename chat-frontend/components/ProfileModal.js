import React, { useRef } from "react";
import Modal from "react-bootstrap/Modal";
import {
  IconButton,
  InputAdornment,
  FormControl,
  InputLabel,
  OutlinedInput,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import GroupIcon from "@mui/icons-material/Group";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import styles from "../src/styles/planning.module.css";

const ProfileModal = ({
  show,
  handleClose,
  step2,
  handleNext2,
  handlePrev2,
  globalUser,
  handleUploadClick,
  handleFileChange,
  showPassword,
  handleClickShowPassword,
  handleMouseDownPassword,
  setOldPassword,
  setNewPassword,
  changePassword,
  fileInputRef,
  googleConnected,
  handleGoogleConnect,
  handleGoogleDisconnect,
}) => {
  return (
    <Modal
      className="add_group_modal"
      show={show}
      onHide={handleClose}
      size=""
      centered
    >
      <Modal.Body>
        <div>
          <div className={styles.modalContent}>
            <header className="d-flex align-items-center justify-content-between mb-3 modal-header">
              <h5 className="mb-0">My Profile</h5>
              <a
                className="cancelButton btn-close"
                aria-label="close"
                onClick={handleClose}
                href="javascript:void(0)"
              ></a>
            </header>
            <section className={step2 === 1 ? "modalSection" : "hidden"}>
              <div className={styles.formGroup}>
                <div className="top_group_info text-center pt-4 pb-5">
                  <div className="group_img_wrapper mb-4">
                    {globalUser?.data?.user?.image ? (
                      <img
                        src={globalUser?.data?.user?.image}
                        className="group_img"
                        alt="Profile"
                      />
                    ) : (
                      <div className="group_img">
                        <GroupIcon className="group_icon_demo"></GroupIcon>
                      </div>
                    )}
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
                  </div>
                  <h4>{globalUser?.data?.user?.name}</h4>
                  <p className="mb-1">{globalUser?.data?.user?.email}</p>
                  <p>
                    Status: <strong className="">Available</strong>
                  </p>
                  <div className="mt-3 mb-3">
                    {/* {googleConnected ? (
                                            <button
                                                onClick={handleGoogleDisconnect}
                                                className="primary_btn"
                                                style={{ backgroundColor: '#dc3545', borderColor: '#dc3545' }}
                                            >
                                                Disconnect Google Calendar
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleGoogleConnect}
                                                className="primary_btn"
                                                style={{ backgroundColor: '#4285F4', borderColor: '#4285F4' }}
                                            >
                                                Connect Google Calendar
                                            </button>
                                        )} */}
                  </div>
                  <a
                    onClick={handleNext2}
                    className="primary_btn"
                    href="javascript:void(0)"
                  >
                    Change Password
                  </a>
                </div>
              </div>
            </section>

            <div className={step2 === 2 ? "change_password_step" : "hidden"}>
              <div className="change_password_form p-3">
                <div className="">
                  <FormControl
                    sx={{ width: "100%" }}
                    variant="outlined"
                    className="mb-3"
                  >
                    <InputLabel htmlFor="outlined-adornment-password">
                      Enter previous password
                    </InputLabel>
                    <OutlinedInput
                      id="outlined-adornment-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="off"
                      endAdornment={
                        <InputAdornment position="end">
                          <IconButton
                            aria-label="toggle password visibility"
                            onClick={handleClickShowPassword}
                            onMouseDown={handleMouseDownPassword}
                            edge="end"
                          >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      }
                      label="Password"
                      onChange={(e) => setOldPassword(e.target.value)}
                    />
                  </FormControl>

                  <FormControl sx={{ width: "100%" }} variant="outlined">
                    <InputLabel htmlFor="outlined-adornment-confirm-password">
                      Enter new Password
                    </InputLabel>
                    <OutlinedInput
                      id="outlined-adornment-confirm-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      endAdornment={
                        <InputAdornment position="end">
                          <IconButton
                            aria-label="toggle password visibility"
                            onClick={handleClickShowPassword}
                            onMouseDown={handleMouseDownPassword}
                            edge="end"
                          >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      }
                      label="Retype Password"
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </FormControl>
                </div>
              </div>
              <div className="d-flex align-items-center justify-content-between p-3 pt-0">
                <button className="primary_btn" onClick={changePassword}>
                  Change Password
                </button>
                <a
                  onClick={handlePrev2}
                  className="btn btn-warning"
                  href="javascript:void(0)"
                >
                  Cancel
                </a>
              </div>
            </div>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default ProfileModal;
