import React, { useState } from "react";
import styles from "../src/styles/planning.module.css";
import { Menu, MenuItem } from "@mui/material";

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import DoneIcon from "@mui/icons-material/Done";
import DownloadIcon from "@mui/icons-material/Download";
import moment from "moment"
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";

const MegaMessage = ({
  selected,
  message,
  setDelMsg,
  setFrwdMsg,
  setRplyMsg,
  setOpenModalInfo,
  setOpenReportModal,
  setReportType,
  groupDataDetails,
  onReplyJump,
  isGuestMeeting
}) => {
  const [anchorEl, setAnchorEl] = useState();
  const [SEOmodalIsOpen, SEOsetModalIsOpen] = useState(false);
  const open = Boolean(anchorEl);
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  // Backend returns `/uploads/...` but frontend may run on a different port.
  // Prefix uploads URLs with NEXT_PUBLIC_PROXY when needed.
  const proxyBase = process.env.NEXT_PUBLIC_PROXY || "";
  const resolveUploadsUrl = (url) => {
    if (!url || typeof url !== "string") return url;
    if (url.startsWith("/uploads/") && proxyBase) {
      return `${String(proxyBase).replace(/\/+$/, "")}${url}`;
    }
    return url;
  };
  const [anchorEl1, setAnchorEl1] = useState();
  const open1 = Boolean(anchorEl1);
  const handleClick1 = (event) => {
    setAnchorEl1(event.currentTarget);
  };

  // In your MegaMessage component, update the replyClick function:
  const replyClick = () => {
    const replyId = message?.replyOf?.msgId;
    if (!replyId) return;

    const el = document.getElementById(`message-${replyId}`);

    if (el) {
      // Message is already loaded, scroll to it
      const messageContainer = document.getElementById("message_body_wrapper");
      if (messageContainer) {
        const containerRect = messageContainer.getBoundingClientRect();
        const messageRect = el.getBoundingClientRect();
        const scrollTop = messageContainer.scrollTop + messageRect.top - containerRect.top - 100;

        messageContainer.scrollTo({
          top: scrollTop,
          behavior: "smooth"
        });

        el.style.backgroundColor = "rgba(255,255,0,0.3)";
        el.style.transition = "background-color 0.3s ease";
        setTimeout(() => (el.style.backgroundColor = ""), 1500);
      }
    } else {
      // Message not loaded, ask parent to fetch it
      if (typeof onReplyJump === "function") {
        onReplyJump(replyId);
      }
    }
  };

  const handleClose1 = () => {
    setAnchorEl1(null);
  };
  const ITEM_HEIGHT = 48;

  // Helper function to render message text with clickable links
  const renderMessageWithLinks = (text) => {
    if (!text) return null;
    // Regex that captures:
    // 1. http:// or https:// URLs
    // 2. www. URLs  
    // 3. domain.extension patterns
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/g;

    const parts = text.split(urlRegex);

    return parts.map((part, index) => {
      // Check if this part matches our URL pattern
      if (urlRegex.test(part)) {
        // Reset regex lastIndex since we're reusing it
        urlRegex.lastIndex = 0;

        // Determine the proper href
        let href = part;
        if (!part.startsWith("http://") && !part.startsWith("https://")) {
          href = `https://${part}`;
        }

        return (
          <a
            key={index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "underline" }}
          >
            {part} ↗
          </a>
        );
      } else {
        return <span key={index}>{part}</span>;
      }
    });
  };

  if (message.textFileType === "created") {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <p>{groupDataDetails?.isTemp == true ? "Meeting created" : "Group created"}</p>
      </div>
    );
  } else if (message.textFileType === "callEnd") {
    return (
      <div id={`message-${message._id}`} className={styles.yourmessagebloackmaindiv}>
        <div className={styles.yourmessage}>
          <div className={styles.yourmessagenametime}>
            <div className={styles.yourmessageimgwrapper}>
              {selected?.image ? (
                <img
                  className={styles.yourmessageimg}
                  src={selected?.image}
                  alt={message?.name?.substring(0, 1)}
                />
              ) : (
                <p className={styles.yourmessageimgtext}>
                  {message?.name?.substring(0, 1)}
                </p>
              )}
            </div>
          </div>
          <div className={styles.yourmessagebodymaindiv}>
            <article className={styles.yourMessagebody}>
              <span className={styles.yourmessagename}>{message.name}</span>

              {!isGuestMeeting && (
                <div className={styles.arrowdownmess1}>
                  <KeyboardArrowDownIcon
                    aria-label="more"
                    id="long-button1"
                    aria-controls={open1 ? "long-menu" : undefined}
                    aria-expanded={open1 ? "true" : undefined}
                    aria-haspopup="true"
                    onClick={handleClick1}
                  ></KeyboardArrowDownIcon>
                  <Menu
                    id="long-menu"
                    MenuListProps={{
                      "aria-labelledby": "long-button1",
                    }}
                    anchorEl={anchorEl1}
                    open={open1}
                    onClose={handleClose1}
                    PaperProps={{
                      style: {
                        maxHeight: ITEM_HEIGHT * 4.5,
                        width: "20ch",
                      },
                    }}
                  >
                    <MenuItem
                      onClick={() => {
                        setDelMsg(message._id);
                        handleClose1();
                      }}
                    >
                      Delete
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        setOpenReportModal(true);
                        setReportType("message");
                      }}
                    >
                      Report
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        setFrwdMsg(message);
                        setOpenModalInfo(true);
                      }}
                    >
                      info
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        setRplyMsg(message);
                        handleClose1();
                      }}
                    >
                      Reply
                    </MenuItem>
                  </Menu>
                </div>
              )}
              {message.replyOf && (
                <div
                  className="w-100"
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    width: "100%",
                    background: "rgba(0,0,0,.1)",
                    borderRadius: "5px",
                    padding: "3px 10px",
                    fontSize: "15px",
                    marginBottom: "3px",
                  }}
                >
                  <div
                    className="w-100"
                    style={{ display: "flex", flexDirection: "row", cursor: "pointer" }}
                    onClick={replyClick}
                  >
                    <div style={{ display: "flex", flexDirection: "column", paddingRight: "10px" }}>
                      <span style={{ fontWeight: "600" }}>
                        {message.replyOf.sender}
                      </span>

                      <span style={{ fontWeight: "300" }}>
                        Reply
                      </span>
                    </div>
                    <div style={{ paddingLeft: "10px" }}>
                      {message.replyOf.msgType == "image" ? (
                        <img
                          height="100px"
                          className={styles.replyOfMyFilebody}
                          src={message.replyOf.msg}
                        />
                      ) : message.replyOf.msgType == "video" || message.replyOf.msgType === "screen_recording" ? (
                        <video
                          className={styles.replyOfMyFilebody}
                          height="100px"
                            src={resolveUploadsUrl(message.replyOf.msg)}
                        // controls
                        // playsInline
                        // preload="metadata"
                        >
                          Your browser does not support the video tag.
                        </video>
                      ) : message.replyOf.msgType === "doc" ? (
                        <div className="link_message">
                          <a href={message.replyOf.msg} download>
                            <button>
                              <DownloadIcon></DownloadIcon>
                            </button>
                          </a>
                        </div>
                      ) : (
                        <span>
                          {message?.replyOf?.msg?.substring(0, 30)}
                          {message?.replyOf?.msg?.length > 30 && "..."}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {message.textFileType == "image" ? (
                <img className={styles.yourFilebody} src={message.message} onClick={() => SEOsetModalIsOpen(true)} />
              ) : message.textFileType == "video" || message.textFileType === "screen_recording" ? (
                <div>
                  {message.textFileType === "screen_recording" && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#7c3aed', display: 'inline-block' }} />
                      Screen Recording
                    </div>
                  )}
                  {message.textFileType === "screen_recording" && message.message === "expired" ? (
                    <div style={{ padding: '16px 20px', background: 'rgba(124,58,237,0.08)', borderRadius: 8, color: '#888', fontSize: 13, textAlign: 'center' }}>
                      This screen recording has expired and is no longer available.
                      <div style={{ fontSize: 11, marginTop: 4, color: '#aaa' }}>{message.fileName}</div>
                    </div>
                  ) : (
                    <>
                      <video
                        className={styles.yourFilebody}
                        controls
                        playsInline
                        preload="auto"
                        src={resolveUploadsUrl(message.message)}
                        width="100%"
                        style={{ display: 'block', width: '100%', maxWidth: '400px', borderRadius: '8px' }}
                      >
                        Your browser does not support the video tag.
                      </video>
                      {message.fileName && (
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{message.fileName}</div>
                      )}
                    </>
                  )}
                </div>
              ) : message.textFileType === "doc" ? (
                <div className="link_message">
                  <a href={message.message} download target="_blank">
                    <p>{message.fileName}</p>
                    <button>
                      <DownloadIcon></DownloadIcon>
                    </button>
                  </a>
                </div>
              ) : (
                <>
                  <div className="main_message">
                    {renderMessageWithLinks(message.message)}
                  </div>
                </>
              )}
              <div>
                <Dialog open={SEOmodalIsOpen} onClose={() => SEOsetModalIsOpen(false)}>
                  <DialogContent>
                    <img src={message.message} />
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={() => SEOsetModalIsOpen(false)}>Close</Button>
                  </DialogActions>
                </Dialog>
              </div>
            </article>

            <span className={styles.yourmessagetime}>
              {moment(message.time || message.timestamp).format('MM/DD/YYYY HH:mm')}
            </span>
          </div>
          {message.forwarded && <p style={{ color: "red" }}>Forwarded</p>}
        </div>
      </div>
    );
  } else if (
    message.textFileType === "added" ||
    message.textFileType === "removed"
  ) {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <p>{message.message}</p>
      </div>
    );
  } else {
    if (message.type === "receiver") {
      return (
        <div id={`message-${message._id}`} className={styles.mymessagebloackmaindiv}>
          <div className={styles.mymessage}>
            <div className={styles.mymessagenametime}>
            </div>
            <div className={styles.mymessagebodymaindiv}>
              <div className="message_send_time_wrapper d-flex align-items-center">
                <div className="message_send_time">
                  {moment(message.time || message.timestamp).format('MM/DD/YYYY HH:mm')}
                </div>
                {!isGuestMeeting && (
                  <div>
                    <span className={styles.mymessagetimeself}>
                      {message.deliveredTo.length <
                        message?.allRecipients?.length && (
                          <DoneIcon className="tick_design"></DoneIcon>
                        )}
                      {message.allRecipients.length ==
                        message?.deliveredTo?.length &&
                        message?.readBy?.length <
                        message?.allRecipients?.length && (
                          <DoneAllIcon className="tick_design"></DoneAllIcon>
                        )}
                      {message.allRecipients.length ==
                        message?.deliveredTo?.length &&
                        message?.allRecipients?.length ==
                        message?.readBy?.length && (
                          <DoneAllIcon
                            className="tick_design"
                            style={{ color: "blue" }}
                          ></DoneAllIcon>
                        )}
                    </span>
                  </div>
                )}
              </div>
              <article className={styles.myMessagebody}>
                {!isGuestMeeting && (
                  <div className={styles.arrowdownmess}>
                    <KeyboardArrowDownIcon
                      aria-label="more"
                      id="long-button"
                      aria-controls={open ? "long-menu" : undefined}
                      aria-expanded={open ? "true" : undefined}
                      aria-haspopup="true"
                      onClick={handleClick}
                    ></KeyboardArrowDownIcon>
                    <Menu
                      id="long-menu"
                      MenuListProps={{
                        "aria-labelledby": "long-button",
                      }}
                      anchorEl={anchorEl}
                      open={open}
                      onClose={handleClose}
                      PaperProps={{
                        style: {
                          maxHeight: ITEM_HEIGHT * 4.5,
                          width: "20ch",
                        },
                      }}
                    >
                      <MenuItem
                        onClick={() => {
                          setDelMsg(message._id);
                          handleClose();
                        }}
                      >
                        Delete
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setFrwdMsg(message);
                          setOpenModalInfo(true);
                        }}
                      >
                        info
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setRplyMsg(message);
                          handleClose();
                        }}
                      >
                        Reply
                      </MenuItem>
                    </Menu>
                  </div>
                )}
                {message.replyOf && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      width: "100%",
                      background: "rgba(0,0,0,.1)",
                      borderRadius: "5px",
                      padding: "3px 10px",
                      fontSize: "15px",
                      marginBottom: "3px",
                    }}
                  >
                    <div style={{ display: "flex", cursor: "pointer", flexDirection: "row" }} onClick={replyClick}>
                      <div style={{ display: "flex", flexDirection: "column", paddingRight: "10px" }}>
                        <span style={{ fontWeight: "600" }}>
                          {message.replyOf.sender}
                        </span>

                        <span style={{ fontWeight: "300" }}>
                          Reply
                        </span>
                      </div>
                      <div style={{ paddingLeft: "10px" }}>
                        {message.replyOf.msgType === "image" ? (
                          <img
                            height="100px"
                            className={styles.replyOfMyFilebody}
                            src={message.replyOf.msg}
                          />
                        ) : message.replyOf.msgType === "video" ? (
                          <video
                            className={styles.replyOfMyFilebody}
                            height="100px"
                            src={resolveUploadsUrl(message.replyOf.msg)}
                          // controls
                          // playsInline
                          // preload="metadata"
                          >
                            Your browser does not support the video tag.
                          </video>
                        ) : message.replyOf.msgType === "doc" ? (
                          <div className="link_message">
                            <img
                              src="/document-svgrepo-com.svg"
                              alt="Document Icon"
                              width="50px"
                              height="50px"
                            />
                            <a href={message.replyOf.msg} download>
                              <p>{message.fileName}</p>
                              <button>
                                <DownloadIcon></DownloadIcon>
                              </button>
                            </a>
                          </div>
                        ) : (
                          <span>
                            {message?.replyOf?.msg?.substring(0, 30)}
                            {message?.replyOf?.msg?.length > 30 && "..."}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {message.textFileType === "image" ? (
                  <img className={styles.myFilebody} src={message.message} onClick={() => SEOsetModalIsOpen(true)} />
                ) : message.textFileType === "video" || message.textFileType === "screen_recording" ? (
                  <div>
                    {message.textFileType === "screen_recording" && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#7c3aed', display: 'inline-block' }} />
                        Screen Recording
                      </div>
                    )}
                    {message.textFileType === "screen_recording" && message.message === "expired" ? (
                      <div style={{ padding: '16px 20px', background: 'rgba(124,58,237,0.08)', borderRadius: 8, color: '#888', fontSize: 13, textAlign: 'center' }}>
                        This screen recording has expired and is no longer available.
                        <div style={{ fontSize: 11, marginTop: 4, color: '#aaa' }}>{message.fileName}</div>
                      </div>
                    ) : (
                      <>
                        <video
                          className={styles.myFilebody}
                          controls
                          playsInline
                          preload="auto"
                          src={resolveUploadsUrl(message.message)}
                          width="100%"
                          style={{ display: 'block', width: '100%', maxWidth: '400px', borderRadius: '8px' }}
                        >
                          Your browser does not support the video tag.
                        </video>
                        {message.fileName && (
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{message.fileName}</div>
                        )}
                      </>
                    )}
                  </div>
                ) : message.textFileType === "doc" ? (
                  <div className="link_message">
                    <a href={message.message} download target="_blank">
                      <p>{message.fileName}</p>
                      <button>
                        <DownloadIcon></DownloadIcon>
                      </button>
                    </a>
                  </div>
                ) : (
                  <>
                    <div className="main_message_self">{renderMessageWithLinks(message.message)}</div>
                  </>
                )}
              </article>
            </div>
            {message.forwarded && <p style={{ color: "red" }}>Forwarded</p>}
          </div>
          <div>
            <Dialog open={SEOmodalIsOpen} onClose={() => SEOsetModalIsOpen(false)}>
              <DialogContent>
                <img src={message.message} />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => SEOsetModalIsOpen(false)}>Close</Button>
              </DialogActions>
            </Dialog>
          </div>
        </div>
      );
    } else {
      return (
        <div id={`message-${message._id}`} className={styles.yourmessagebloackmaindiv}>
          <div className={styles.yourmessage}>
            <div className={styles.yourmessagenametime}>
              <div className={styles.yourmessageimgwrapper}>
                {selected?.image ? (
                  <img
                    className={styles.yourmessageimg}
                    src={selected?.image}
                    alt={message?.name?.substring(0, 1)}
                  />
                ) : (
                  <p className={styles.yourmessageimgtext}>
                    {message?.name?.substring(0, 1)}
                  </p>
                )}
              </div>
            </div>
            <div className={styles.yourmessagebodymaindiv}>
              <article className={styles.yourMessagebody}>
                <span className={styles.yourmessagename}>{message.name}</span>

                {!isGuestMeeting && (
                  <div className={styles.arrowdownmess1}>
                    <KeyboardArrowDownIcon
                      aria-label="more"
                      id="long-button1"
                      aria-controls={open1 ? "long-menu" : undefined}
                      aria-expanded={open1 ? "true" : undefined}
                      aria-haspopup="true"
                      onClick={handleClick1}
                    ></KeyboardArrowDownIcon>
                    <Menu
                      id="long-menu"
                      MenuListProps={{
                        "aria-labelledby": "long-button1",
                      }}
                      anchorEl={anchorEl1}
                      open={open1}
                      onClose={handleClose1}
                      PaperProps={{
                        style: {
                          maxHeight: ITEM_HEIGHT * 4.5,
                          width: "20ch",
                        },
                      }}
                    >
                      <MenuItem
                        onClick={() => {
                          setOpenReportModal(true);
                          setReportType("message");
                        }}
                      >
                        Report
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setFrwdMsg(message);
                          setOpenModalInfo(true);
                        }}
                      >
                        info
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setRplyMsg(message);
                          handleClose1();
                        }}
                      >
                        Reply
                      </MenuItem>
                    </Menu>
                  </div>
                )}
                {message.replyOf && (
                  <div
                    className="w-100"
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      width: "100%",
                      background: "rgba(0,0,0,.1)",
                      borderRadius: "5px",
                      padding: "3px 10px",
                      fontSize: "15px",
                      marginBottom: "3px",
                    }}
                  >
                    <div
                      className="w-100"
                      style={{ display: "flex", flexDirection: "row" }}
                    >
                      <div style={{ display: "flex", cursor: "pointer", flexDirection: "column", paddingRight: "10px" }} onClick={replyClick}>
                        <span style={{ fontWeight: "600" }}>
                          {message.replyOf.sender}
                        </span>

                        <span style={{ fontWeight: "300" }}>
                          Reply
                        </span>
                      </div>
                      <div style={{ paddingLeft: "10px" }}>
                        {message.replyOf.msgType == "image" ? (
                          <img
                            height="100px"
                            className={styles.replyOfMyFilebody}
                            src={message.replyOf.msg}
                          />
                        ) : message.replyOf.msgType == "video" || message.replyOf.msgType === "screen_recording" ? (
                          <video
                            className={styles.replyOfMyFilebody}
                            height="100px"
                            src={resolveUploadsUrl(message.replyOf.msg)}
                          // controls
                          // playsInline
                          // preload="metadata"
                          >
                            Your browser does not support the video tag.
                          </video>
                        ) : message.replyOf.msgType === "doc" ? (
                          <div className="link_message">
                            <a href={message.replyOf.msg} download>
                              <button>
                                <DownloadIcon></DownloadIcon>
                              </button>
                            </a>
                          </div>
                        ) : (
                          <span>
                            {message?.replyOf?.msg?.substring(0, 30)}
                            {message?.replyOf?.msg?.length > 30 && "..."}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {message.textFileType == "image" ? (
                  <img className={styles.yourFilebody} src={message.message} onClick={() => SEOsetModalIsOpen(true)} />
                ) : message.textFileType == "video" || message.textFileType === "screen_recording" ? (
                  <div>
                    {message.textFileType === "screen_recording" && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#7c3aed', display: 'inline-block' }} />
                        Screen Recording
                      </div>
                    )}
                    {message.textFileType === "screen_recording" && message.message === "expired" ? (
                      <div style={{ padding: '16px 20px', background: 'rgba(124,58,237,0.08)', borderRadius: 8, color: '#888', fontSize: 13, textAlign: 'center' }}>
                        This screen recording has expired and is no longer available.
                        <div style={{ fontSize: 11, marginTop: 4, color: '#aaa' }}>{message.fileName}</div>
                      </div>
                    ) : (
                      <>
                        <video
                          className={styles.yourFilebody}
                          controls
                          playsInline
                          preload="auto"
                          src={resolveUploadsUrl(message.message)}
                          width="100%"
                          style={{ display: 'block', width: '100%', maxWidth: '400px', borderRadius: '8px' }}
                        >
                          Your browser does not support the video tag.
                        </video>
                        {message.fileName && (
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{message.fileName}</div>
                        )}
                      </>
                    )}
                  </div>
                ) : message.textFileType === "doc" ? (
                  <div className="link_message">
                    <a href={message.message} download target="_blank">
                      <p>{message.fileName}</p>
                      <button>
                        <DownloadIcon></DownloadIcon>
                      </button>
                    </a>
                  </div>
                ) : (
                  <>
                    <div className="main_message">{renderMessageWithLinks(message.message)}</div>
                  </>
                )}
                <div>
                  <Dialog open={SEOmodalIsOpen} onClose={() => SEOsetModalIsOpen(false)}>
                    <DialogContent>
                      <img src={message.message} />
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={() => SEOsetModalIsOpen(false)}>Close</Button>
                    </DialogActions>
                  </Dialog>
                </div>
              </article>

              <span className={styles.yourmessagetime}>
                {moment(message.time || message.timestamp).format('MM/DD/YYYY HH:mm')}
              </span>
            </div>
            {message.forwarded && <p style={{ color: "red" }}>Forwarded</p>}
          </div>
        </div>
      );
    }
  }
};
export default MegaMessage;