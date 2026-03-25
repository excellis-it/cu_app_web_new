import React, { useEffect, useRef, useState } from "react";
import styles from "../src/styles/Modal.module.css"; // Import the CSS module
import axios from "axios";
import { useRouter } from "next/router";
import { useAppContext } from "../appContext/appContext";
import WestIcon from "@mui/icons-material/West";
import { toast } from "react-toastify";
import moment from "moment";
const ChatInfo = ({ isOpen, setOpenModalInfo, groupId, msgId, type }) => {
  const router = useRouter();
  const { globalUser, setGlobalUser } = useAppContext();
  const [description, setDescription] = useState('')
  const [resp, setResp] = useState([])
  const config = {
    headers: { "access-token": globalUser?.data?.token },
  };
  if (!isOpen) {
    return null; // Don't render the modal if it's not open
  }
  useEffect(() => {
    const chatinfoResp = async () => {
      const resp = await axios.post('/api/groups/info-message', {
        msgId: msgId
      }, config)
      if (!resp.data.success) {
        setOpenModalInfo(false)
      }
      setResp(resp.data)
    }

    chatinfoResp()
  }, [])
  return (
    <div className={`${styles.modalContainer} add_groupinfo_modal`}>
      <div className={`${styles.modalContent} modal-body`}>
        <header className={`${styles.modalHeader} modal-header`}>
          <h4>Chat Info</h4>
          <a
            className="cancelButton btn-close"
            aria-label="close"
            onClick={() => setOpenModalInfo(false)}
          >
          </a>
        </header>
        <section className="modalSection">
          <div className={styles.formGroup}>
            <div className="top_group_info pt-3 px-3">
              <div className="col">
                {/* Read By Section */}
                {resp?.data?.readUserData?.length > 0 ? (

                  <div className="d-block" style={{ padding: '0 20px', textAlign: 'left' }}>
                    <h4>Read By</h4>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '10px' }}>

                      {resp?.data?.readUserData?.map((item, index) => (
                        <div className="d-flex" style={{ padding: '20px 0', textAlign: 'left' }}>
                          <div
                            key={index}
                            className="mb-3 me-2"
                          >
                            <img
                              src={item?.image}
                              className="group_img"
                              style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                              }}
                            />
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 'bold' }}>{item.name}</p>
                            <p style={{ margin: 0, color: '#666' }}>
                              {moment(item.timestamp).format('MM-DD-YYYY hh:mm A')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="d-block" style={{ padding: '0 20px', textAlign: 'left' }}>
                    <h4>Read By</h4>
                    <p style={{ color: '#999', fontSize: '14px', padding: '10px 0' }}>No Data Found</p>
                  </div>
                )}
                <hr />
                {/* Delivered By Section */}
                {resp?.data?.deliveredToData?.length > 0 ? (
                  <div className="row" style={{ padding: '20px', textAlign: 'left' }}>
                    <div className="d-flex" style={{ padding: '0 20px', textAlign: 'left' }}>
                      <h4>Delivered To</h4>
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '10px' }}>
                      {resp?.data?.deliveredToData?.map((item, index) => (
                        <div className="d-flex" style={{ padding: '20px', textAlign: 'left' }}>
                          <div
                            key={index}
                            className="mb-3 me-2"
                          >
                            <img
                              src={item?.image}
                              className="group_img"
                              style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                              }}
                            />
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 'bold' }}>{item.name}</p>
                            <p style={{ margin: 0, color: '#666' }}>
                              {moment(item.timestamp).format('MM-DD-YYYY hh:mm A')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="d-block" style={{ padding: '0 20px', textAlign: 'left' }}>
                    <h4>Delivered To</h4>
                    <p style={{ color: '#999', fontSize: '14px', padding: '10px 0' }}>No Data Found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ChatInfo;
