import React, { useEffect, useRef, useState } from "react";
import styles from "../src/styles/Modal.module.css"; // Import the CSS module
import axios from "axios";
import { useRouter } from "next/router";
import styles2 from "../src/styles/planning.module.css";
import { useAppContext } from "../appContext/appContext";
import { PROXY } from "../config";
import GroupIcon from "@mui/icons-material/Group";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import { Scrollbar } from "react-scrollbars-custom";
import DeleteIcon from "@mui/icons-material/Delete";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import WestIcon from "@mui/icons-material/West";
import { toast } from "react-toastify";
const deletegroupModal = ({ isOpen, setOpenDeleteModal, groupId, type, socketRef, onDeleteResponse, selected}) => {
  const router = useRouter();
  const { globalUser, setGlobalUser } = useAppContext();
  const [description, setDescription] = useState('')
  const config = {
    headers: { "access-token": globalUser?.data?.token },
    params: {
      id: groupId
    },
  };
  if (!isOpen) {
    return null; // Don't render the modal if it's not open
  }
  const deleteGroup = async () => { // replace this with your real token


    try {
      const response = await fetch(
        `/api/admin/groups/delete-group?id=${groupId}`,
        {
          method: 'DELETE',
          headers: { 'access-token': globalUser?.data?.token },
        }
      );
      const data = await response.json();
      console.log("deleteGroupData=====>", data)
      if (data.data.statusCode === 200) {
        socketRef?.current?.emit('deleteGroup', data?.data?.deleteGroupResult);
        onDeleteResponse({ data: data?.data?.deleteGroupResult });

        toast.success(`${type} Deleted successfully`)
        setOpenDeleteModal(false)
        router.push('/messages')
      } 
    } catch (error) {
      console.error('Error deleting group:',error);
    }

  }

  return (
    <div className={`${styles.modalContainer} add_groupinfo_modal`}>
      <div className={`${styles.modalContent} modal-body`}>
        <header className={`${styles.modalHeader} modal-header`}>
          
          <h4>Delete {selected?.isTemp?'Meeting':'Group'}</h4>
          <a
            className="cancelButton btn-close"
            aria-label="close"
            onClick={() => setOpenDeleteModal(false)}
          >
          </a>
        </header>
        <section className="modalSection">
          <div className={styles.formGroup}>
            <div className="top_group_info text-center pt-3">
              <h4>Do You Want to Delete this {type}?</h4>
              <button className="sec_btn" onClick={deleteGroup}>confirm</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default deletegroupModal;
