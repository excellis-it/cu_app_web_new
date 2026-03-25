import { toast } from "react-toastify";

const Msg = ({ title,groupName, text }) => {
  return (
    <div style={{
      backgroundColor: "#f0f0f0",
      borderRadius: "10px",
      padding: "10px",
      marginBottom: "10px",
    }}>
      <p style={{
        fontWeight: "bold",
        margin: "0",
      }}>{groupName}</p>
      <p style={{
        margin: "0",
      }}>{title}: {text}</p>
    </div>
  );
};
  
  export const MsgToast = (myProps, toastProps) =>
    toast(<Msg {...myProps} />, { ...toastProps });
  
  MsgToast.success = (myProps, toastProps) =>
    toast(<Msg {...myProps} />, { ...toastProps });
