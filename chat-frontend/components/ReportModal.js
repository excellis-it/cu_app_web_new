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
const ReportModal = ({ isOpen, setOpenReportModal, groupId , msgId, type , selected}) => {
  const router = useRouter();
  const { globalUser, setGlobalUser } = useAppContext();
  const [description, setDescription]= useState('')
  const config = {
    headers: { "access-token": globalUser?.data?.token },
  };
  if (!isOpen) {
    return null; // Don't render the modal if it's not open
  }
  const reportGroup = async ()=>{
    const resp= await axios.post ('/api/groups/report', {
        description: description, 
        groupId: groupId
    }, config)
    if(resp.data.success){
        toast.success('Report added successfully')
        setOpenReportModal(false)
    }
  }
  const reportMessage = async ()=>{
    const resp= await axios.post ('/api/groups/report-message', {
        description: description, 
        groupId: groupId
    }, config)
    if(resp.data.success){
        toast.success('Report added successfully')
        setOpenReportModal(false)
    }
  }

  return (
    <div className={`${styles.modalContainer} add_groupinfo_modal`}>
      <div className={`${styles.modalContent} modal-body`}>
        <header className={`${styles.modalHeader} modal-header`}>
          
          <h4>{selected?.isTemp?'Report Meeting':'Report Group'}</h4>
          <a
            className="cancelButton btn-close"
            aria-label="close"
            onClick={() => setOpenReportModal(false)}
          >
          </a>
        </header>
        <section className="modalSection">
            <div className={styles.formGroup}>
              <div className="top_group_info text-center p-3">
                <h4>Write down the reason</h4>
                    <textarea className="report_textarea" onChange={(e)=>setDescription(e.target.value)} style={{width:'100%'}} rows={5}/>
                    <button className="sec_btn" onClick={type=="group"? reportGroup: reportMessage}>Submit Report</button>
                  </div>
                </div>
        </section>
      </div>
    </div>
  );
};

export default ReportModal;
