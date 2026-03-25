import webPush from "web-push";
import USERS from "../db/schemas/users.schema";
import mongoose, { ObjectId } from "mongoose";

// Load environment variables
const publicVapidKey = process.env.WEB_PUSH_PUBLIC_KEY || "";
const privateVapidKey = process.env.WEB_PUSH_PRIVATE_KEY || "";
const rawEmail = process.env.email || "admin@example.com";
const contactEmail = rawEmail.startsWith("mailto:") ? rawEmail : `mailto:${rawEmail}`;

// Fail-soft: if missing envs, export a no-op implementation instead of throwing
const webPushDisabled = (!publicVapidKey || !privateVapidKey || !rawEmail);

interface WebPushToken {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Manual timeout wrapper for push notification
const timeoutPromise = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebPushTimeout")), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

class ClassPush {
  private webpush = webPush;

  constructor() {
    if (!webPushDisabled) {
      this.webpush.setVapidDetails(contactEmail, publicVapidKey, privateVapidKey);
    }
  }

  sendWebPush = async (
    receiverIds: (string | ObjectId)[],
    title: string,
    body: string,
    groupId: string,
    msgType: string
  ): Promise<boolean> => {
    console.log(`📤 [WebPush] Starting push to ${receiverIds.length} recipients | Type: ${msgType}`);

    if (webPushDisabled) {
      console.warn("⚠️ [WebPush] Web Push not configured. Check: WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, email env vars");
      return false;
    }
    try {
      const pushTasks = receiverIds.map(async (rid) => {
        try {
          const userData: any = await USERS.findById(rid).lean();
          if (!userData?.webPushToken) {
            console.log(`⏭️ [WebPush] User ${rid} has no webPushToken saved - skipping`);
            return;
          }

          let token: WebPushToken;
          try {
            token = JSON.parse(userData.webPushToken);
            console.log(`🔑 [WebPush] Token parsed for user ${rid}`);
          } catch (err) {
            console.error(`❌ [WebPush] Failed to parse token for user ${rid}:`, err);
            return;
          }

          if (!token?.endpoint) {
            console.log(`⏭️ [WebPush] User ${rid} token has no endpoint - skipping`);
            return;
          }

          console.log(`🚀 [WebPush] Sending to user ${rid} - endpoint: ${token.endpoint.substring(0, 50)}...`);

          const payload = JSON.stringify({
            title,
            body,
            icon: "/extalk.png",
            badge: "/extalk.png",
            tag: "chat-notification",
            requireInteraction: false,
            silent: false,
            groupId,
            msgType,
            click_action: "/",
          });

          // Send with manual timeout (e.g., 4000 ms)
          await timeoutPromise(
            this.webpush.sendNotification(token, payload),
            4000
          );
          console.log(`✅ [WebPush] Successfully sent to user ${rid}`);

        } catch (error: any) {
          const code = error?.code || error?.statusCode || error?.message;

          console.error(`❌ Push failed for user ${rid} | Code: ${code}`);

          if (code === 410 || code === 404) {
          } else if (code === "ETIMEDOUT") {
            console.log(`⏱️ Timeout sending push to user ${rid} — skipping.`);
          } else if (code === "ERR_HTTP2_STREAM_CANCEL") {
            console.log(`🔌 HTTP/2 stream cancelled for user ${rid} — possible TLS/network issue.`);
          } else if (code === "WebPushTimeout") {
            console.log(`⏳ Manual push timeout reached for user ${rid}.`);
          } else {
            console.error(`💥 Unknown error for user ${rid}:`, error);
          }
        }
      });

      await Promise.allSettled(pushTasks);
      return true;
    } catch (err) {
      console.error("🚨 sendWebPush top-level failure:", err);
      throw err;
    }
  };
}

export default new ClassPush();
