self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data ? await event.data.json() : {};
      } catch (e) {
        console.error("❌ Failed to parse push event data", e);
        data = {};
      }

      // Check if any app tab is currently focused/visible
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const isTabActive = clients.some(client => client.visibilityState === "visible" && client.focused);

      // Skip notification if user is actively viewing the app
      if (isTabActive) {
        console.log("📱 Tab is active, skipping notification");
        return;
      }

      const title = data.title || "🔔 New Notification";
      const options = {
        body: data.body || "You have a new message",
        icon: "/cu-logo-2.svg",
        badge: "/cu-logo-2.svg",
        tag: data.tag || "chat-notification",
        requireInteraction: data.requireInteraction || false,
        silent: false, // Set to false so we can play custom sound
        data, // pass all for click_action, groupId, etc.
      };

      // Play notification sound (only when tab is not active)
      try {
        clients.forEach(client => {
          client.postMessage({ type: "PLAY_NOTIFICATION_SOUND", sound: "/notification.wav" });
        });
      } catch (soundError) {
        console.warn("⚠️ Could not play notification sound:", soundError);
      }

      await self.registration.showNotification(title, options);
      console.log("✅ Notification displayed:", title, options);
    })()
  );
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const groupId = data.groupId;

  // Navigate to the chat/group when notification is clicked
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && "focus" in client) {
          client.focus();
          if (groupId) {
            client.postMessage({ type: "NAVIGATE_TO_CHAT", groupId });
          }
          return;
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        const url = groupId ? `/messages?groupId=${groupId}` : "/messages";
        return self.clients.openWindow(url);
      }
    })
  );
});
