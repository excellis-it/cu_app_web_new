  
  const showNotification = ({ title, groupName, text }) => {    
    if (!("Notification" in window)) {
      console.error("This browser does not support desktop notifications.");
      return;
    }
  
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        const notification = new Notification(title, {
          body: `${groupName}: ${text}`,
        });  
        notification.onclick = () => {
          window.focus();
        };
      }
    });
  };
  
  // Wrapper function like `MsgToast`
  export const Notify = (props) => showNotification(props);
  
  // Example usage: Notify.success(...)
  Notify.success = (props) => showNotification(props);
  