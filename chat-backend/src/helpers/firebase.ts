import USERS from "../db/schemas/users.schema";
import { ObjectId } from "mongodb";

const admin = require("firebase-admin");
const { initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

require("dotenv").config();

function loadServiceAccount(): any | null {
  try {
    // Preferred: base64 encoded JSON in env
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const jsonStr = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
      const obj = JSON.parse(jsonStr);
      if (obj.private_key) obj.private_key = obj.private_key.replace(/\\n/g, "\n");
      return obj;
    }
    // Raw JSON string in env
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      const obj = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      if (obj.private_key) obj.private_key = obj.private_key.replace(/\\n/g, "\n");
      return obj;
    }
    // Individual fields in env
    if (process.env.project_id && process.env.private_key && process.env.client_email) {
      return {
        type: process.env.type || "service_account",
        project_id: process.env.project_id,
        private_key_id: process.env.private_key_id,
        private_key: (process.env.private_key as string).replace(/\\n/g, "\n"),
        client_email: process.env.client_email,
        client_id: process.env.client_id,
        auth_uri: process.env.auth_uri,
        token_uri: process.env.token_uri,
        auth_provider_x509_cert_url: process.env.auth_provider_x509_cert_url,
        client_x509_cert_url: process.env.client_x509_cert_url,
        universe_domain: process.env.universe_domain,
      };
    }
  } catch (e) {
    console.error("Failed to load Firebase service account from env:", e);
  }
  return null;
}

let messaging: any = null;
try {
  const sa = loadServiceAccount();
  let appConfig: any = {};
  if (sa) {
    appConfig.credential = admin.credential.cert(sa);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Uses file mounted at path; set by env var
    appConfig.credential = admin.credential.applicationDefault();
  } else {
    console.warn("Firebase credentials not configured. Push notifications disabled.");
  }

  if (appConfig.credential) {
    const app = initializeApp(appConfig);
    messaging = getMessaging(app);
  }
} catch (e) {
  console.error("Firebase initialization failed. Push notifications disabled.", e);
}

const initializeFirebase = async (
  receiverId: string[] | ObjectId[],
  title: string,
  body: string | object,
  groupId: any,
  msgType: string,
  callType?: string,
  allrecipants?: string[],
  msgId?: any

) => {

  const registrationTokens: any[] = [];

  await Promise.all(
    receiverId.map(async (id) => {
      const data: any = await USERS.findById(id);
      if (data.firebaseToken) {
        registrationTokens.push(data.firebaseToken);
      }
    })
  );

  function bodyMessage(messageType: string, body: string): string {
    switch (messageType) {
      case "text":
        return body;
      case "image":
        return "📸 Image";
      case "audio":
        return "🎵 Audio";
      case "video":
        return "📹 Video";
      case "doc":
        return "📄 Document";
      default:
        return body;
    }
  }

  const message = callType ? {
    android: {
      priority: "high",
    },
    apns: {
      payload: {
        aps: {
          category: "CALL_CATEGORY",
          "content-available": 1,
          sound: "default", // iOS sound
          badge: 0
        },
      },
    },
    data: {
      title,
      body: typeof body === "string" ? body : JSON.stringify(body),
      grp: groupId.toString(),
      msgType: msgType,
      callType: callType ? callType : '',
      allrecipants: allrecipants ? JSON.stringify(allrecipants) : '[]',
      msgId: msgId ? msgId.toString() : 'null',
    },
    tokens: registrationTokens, // List of registration tokens
  } : {
    notification: {
      title, // Notification title
      body: bodyMessage(msgType, typeof body === "string" ? body : JSON.stringify(body)), // Notification body
    },
    android: {
      priority: "high",
      notification: {
        sound: "default", // Android sound
      }
    },
    apns: {
      payload: {
        aps: {
          category: "CALL_CATEGORY",
          "content-available": 1,
          sound: "default", // iOS sound
          badge: 0
        },
      },
    },
    data: {
      title,
      body: typeof body === "string" ? body : JSON.stringify(body),
      grp: groupId.toString(),
      msgType: msgType,
      callType: callType ? callType : '',
      allrecipants: allrecipants ? JSON.stringify(allrecipants) : '[]',
      msgId: msgId ? msgId.toString() : 'null',
    },
    tokens: registrationTokens, // List of registration tokens
  };

  // If Firebase is not initialized, skip sending silently
  if (!messaging) {
    return;
  }

  if (registrationTokens.length > 0) {
    try {
      await messaging.sendEachForMulticast(message).then(async (response: any) => {
        console.log("Firebase Message sent successfully", {
          successCount: response.successCount,
          failureCount: response.failureCount,
        });
        if (response.failureCount > 0) {
          const staleTokenErrors = new Set([
            "messaging/registration-token-not-registered",
            "messaging/invalid-registration-token",
          ]);
          const cleanupPromises: Promise<any>[] = [];
          response.responses.forEach((r: any, i: number) => {
            if (!r.success) {
              const code = r.error?.code;
              console.warn(`Firebase FCM failure for token[${i}]:`, {
                errorCode: code,
                errorMessage: r.error?.message,
                token: registrationTokens[i]?.slice(0, 20) + "...",
              });
              if (staleTokenErrors.has(code)) {
                // Token is permanently invalid — remove it from the DB so it
                // doesn't fail on every subsequent notification
                const staleToken = registrationTokens[i];
                cleanupPromises.push(
                  USERS.updateOne(
                    { firebaseToken: staleToken },
                    { $unset: { firebaseToken: "" } }
                  ).then(() => {
                    console.log(`[FCM] Removed stale token from DB: ${staleToken?.slice(0, 20)}...`);
                  }).catch((err: any) => {
                    console.error("[FCM] Failed to remove stale token from DB:", err);
                  })
                );
              }
            }
          });
          if (cleanupPromises.length > 0) await Promise.all(cleanupPromises);
        }
      });
    } catch (error) {
      console.log(error);
    }
  }
};

export default initializeFirebase;
