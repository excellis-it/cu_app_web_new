import React, { useEffect, useRef, useState } from 'react';
import styles from '../src/styles/Modal.module.css'; // Import the CSS module
import { io } from 'socket.io-client';
import { selectUser } from '../redux/reducer/appEssentials';
import axios from 'axios';
import { PROXY } from '../config/index';
import { useSelector } from 'react-redux';
import styles2 from '../src/styles/planning.module.css';
import { Box, Checkbox, Modal } from '@mui/material';
import useWindowSize from '@rooks/use-window-size';
import { pink } from '@mui/material/colors';
const ForwardMsg = ({ isOpen, setOpenModal, openModal, message }) => {
  const globleuser = useSelector(selectUser);
  const config = {
    headers: { authorization: globleuser?.data?.token },
  };
  if (!isOpen) {
    return null; // Don't render the modal if it's not open
  }
  const {
    innerWidth: windowWidth,
    innerHeight,
    outerHeight,
    outerWidth,
  } = useWindowSize();
  const [connections, setConnections] = useState([]);
  const [selectedPeople, setSelectedPeople] = useState([]);
  const socketRef = useRef(null);
  const handleCheckboxChange = (vendor) => {
    const isChecked = selectedPeople.some(
      (selectedVendor) => selectedVendor.vendorId === vendor.vendorId
    );

    if (isChecked) {
      // If vendor is already in the selectedPeople array, remove them
      setSelectedPeople(
        selectedPeople.filter((v) => v.vendorId !== vendor.vendorId)
      );
    } else {
      // If vendor is not in the selectedPeople array, add them
      setSelectedPeople([...selectedPeople, vendor]);
    }
  };
  const getContact = async () => {
    const result = await axios.post(
      `${PROXY}/contacts/getall`,
      {
        vendorId: globleuser?.data?._id,
      },
      config
    );
    setConnections(result.data);
  };
  const forwardmsg = async (event) => {
    event.preventDefault();
    socketRef.current.emit('forward', {

      message: message,
      senderName: globleuser?.data?.name,
      prospectId: globleuser?.data?._id,
      people: selectedPeople,

    });
    setOpenModal(false)


  };
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'ws://69.62.84.25:10018';
    socketRef.current = io.connect(socketUrl, {
      transports: ["polling", "websocket"],
      allowEIO3: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);
  useEffect(() => {
    globleuser && getContact();
  }, [globleuser, isOpen, openModal]);
  const style = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: windowWidth >= 900 ? '350px' : windowWidth >= 460 ? '95%' : '95%',
    bgcolor: 'background.paper',
    boxShadow: 24,
    p: 2,
    borderRadius: '10px',
    height: windowWidth >= 900 ? 'fit-content' : 'fit-content',
    overflow: 'scroll',
    zIndex: '-1',
  };
  return (
    <Modal
      open={openModal}
      onClose={() => setOpenModal(false)}
      aria-labelledby='modal-modal-title'
      aria-describedby='modal-modal-description'
    >
      <Box sx={style}>
        <div
          className={styles.mainModaldiv}
          style={{ position: 'relative' }}
        >
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <header className={styles.modalHeader}>
              <h4 style={{ color: '#db3673', fontWeight: '600' }}>
                Forward To
              </h4>
            </header>
            <span
              className={styles.seemoreX}
              onClick={() => setOpenModal(false)}
            >
              <img
                src='/images/Vector12.png'
                alt=''
              />
            </span>
          </div>
          <section
            className={styles.modalSection}
            style={{ width: '100%', overflow: 'hidden', marginBottom: '0px' }}
          >
            <form onSubmit={forwardmsg}>
              <div>


              </div>
              <div className={styles.formGroup}>
                <div>
                  <ul
                    style={{
                      paddingLeft: '0px',
                      maxHeight: '350px',
                      overflow: 'scroll',
                    }}
                  >
                    {connections.map((person) => (
                      <li
                        key={person.prospectId ? person.prospectId : person.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '5px',
                          color: selectedPeople.includes(person) ? 'gray' : '',
                          fontFamily: 'Inter',
                          backgroundColor: selectedPeople.includes(person)
                            ? '#db367371'
                            : '',
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexDirection: 'row-reverse',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              gap: '10px',
                              fontSize: '15px',
                              fontWeight: '600',
                              alignItems: 'center',
                            }}
                          >
                            <img
                              className={styles2.imgmessagediv}
                              style={{ minWidth: '40px' }}
                              src={person.prospectImage ? person.prospectImage : null}
                            />
                            <span>{person.prospectName ? person.prospectName : person.groupName}</span>
                          </div>
                          <Checkbox
                            sx={{
                              color: pink[800],
                              '&.Mui-checked': {
                                color: pink[600],
                              },
                            }}
                            checked={selectedPeople.includes(person)}
                            onChange={() => handleCheckboxChange(person)}
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <footer className={styles.modalFooter}>
                <button
                  type='submit'
                  className={styles.submitButton}
                >
                  Submit
                </button>
                <button
                  type='button'
                  className={styles.cancelButton}
                  onClick={() => setOpenModal(false)}
                >
                  Cancel
                </button>
              </footer>
            </form>
          </section>
        </div>
      </Box>
    </Modal>
  );
};

export default ForwardMsg;
