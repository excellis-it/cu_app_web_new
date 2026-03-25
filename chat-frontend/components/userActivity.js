import { useEffect } from "react";

function NotificationSound() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data.type === "playSound") {
          const audio = new Audio(event.data.soundUrl);
          audio.play()
            .then(() => console.log("Sound played successfully"))
            .catch((err) => console.warn("Failed to play sound:", err));
        }
      });
    }
  }, []);

  return null; // This component doesn't render anything
}

export default NotificationSound;