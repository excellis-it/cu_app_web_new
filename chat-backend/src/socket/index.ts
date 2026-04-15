import { httpServer } from "..";
import { Server } from "socket.io";
import { MessageObject } from "../helpers/types";
import decodeToken from "../middleware/decodeToken";
import Message from "../db/schemas/message.schema";
import initializeFirebase from "../helpers/firebase";
import USERS from "../db/schemas/users.schema";
const activeChats: any = {};
import sendWebPush from "../helpers/webpush";
import Group from "../db/schemas/group.schema";
import videoCall from "../db/schemas/videocall.schema";
import ScreenRecording from "../db/schemas/screen-recording.schema";
import GuestMeeting from "../db/schemas/guest-meeting.schema";
import mongoose from "mongoose";
import GuestMeetingMessage from "../db/schemas/guest-meeting-message.schema";
import { info, log } from "console";
import { cleanupOrphanedCalls } from "../app";
import moment from "moment";
import sendApplePush from "../helpers/sendVoipPush";
import { checkActiveCall } from "../controller/group/msgController";
import {
  addPeer,
  removePeer,
  createWebRtcTransport,
  connectTransport,
  createProducer,
  createConsumer,
  getRouterRtpCapabilities,
  getOrCreateRoom,
  getRoomProducers,
  resumeConsumer,
  setConsumerPreferredLayers,
  restartTransportIce,
} from "../mediasoup/mediaRoomManager";
import {
  startServerRecording,
  stopServerRecording,
  getActiveRecordingForRoom,
  scheduleRecordingRestart,
  notifyRecordingStopPending,
  notifyRoomRecordingStopPending,
  clearRoomRecordingStopPending,
} from "../mediasoup/recordingManager";
import { processScreenRecordingInBackground } from "../helpers/screenRecordingProcessor";
import { formatDurationShort } from "../helpers/formatDuration";
import type { types as MediasoupTypes } from "mediasoup";

// Define a more comprehensive interface for GroupCall with all required fields
interface GroupCall {
  _id: string;
  groupId: string;
  userActivity: Array<{
    user: mongoose.Types.ObjectId;
    status: string; // Use string instead of strict union to avoid type errors
    joinedAt?: Date;
    leftAt?: Date;
  }>;
  status: string;
  startedAt?: Date;
  endedAt?: Date;
}

interface ApplePushPayload {
  deviceToken: string | undefined;
  fullName: string;
  groupName: string;
  groupId: string;
  callType: string;
}

// Define the user activity interface
interface UserActivity {
  user: mongoose.Types.ObjectId;
  status: string;
  joinedAt?: Date;
  leftAt?: Date;
}

/**
 * Auto-stop any active screen recording for a room when no participants remain
 * in the call. Mirrors the manual-stop flow, including posting a placeholder
 * "processing" chat message so the recording always anchors in chat history
 * (even if the background transcode fails partway through, the placeholder
 * stays visible and can be updated).
 */
export async function autoStopRecordingsForRoom(roomId: string, io: Server) {
  try {
    const activeScreenRec = await ScreenRecording.findOne({
      groupId: roomId,
      status: "recording",
    }).lean() as any;

    if (activeScreenRec?._id) {
      notifyRoomRecordingStopPending(roomId);
      const recordingId = activeScreenRec._id.toString();
      const startedById = activeScreenRec.startedBy?.toString?.() || null;
      const createdAt = activeScreenRec.createdAt ? new Date(activeScreenRec.createdAt) : null;
      const durationSec = createdAt
        ? Math.max(0, Math.round((Date.now() - createdAt.getTime()) / 1000))
        : 0;

      await ScreenRecording.findByIdAndUpdate(recordingId, {
        $set: { status: "processing", durationSec },
      });

      io.in(roomId).emit("FE-screen-recording-stopped", {
        roomId,
        recordingId,
        stoppedBy: "system",
        reason: "auto-stopped: no participants remaining",
      });

      console.log("[auto-stop] stopping screen recording", { roomId, recordingId });

      notifyRecordingStopPending(roomId, recordingId);

      // Stop FFmpeg and post placeholder chat message, then process in background
      (async () => {
        let outputPath = "";
        try {
          const stopped = await stopServerRecording(recordingId);
          outputPath = stopped.outputPath;
        } catch (e: any) {
          console.error("[auto-stop] failed to stop screen recording ffmpeg", {
            roomId, recordingId, error: e?.message || String(e),
          });
          await ScreenRecording.findByIdAndUpdate(recordingId, {
            $set: { status: "failed", errorMessage: e?.message || String(e) },
          });
          return;
        }

        // Create a placeholder "processing" chat message so the recording is
        // visible in history immediately. The processor will later update this
        // message with the playback URL, or mark it failed.
        let placeholderMsgId: string | null = null;
        try {
          const group = await Group.findById(roomId, { currentUsers: 1 }).lean() as any;
          const recipients = group?.currentUsers || [];
          if (recipients.length > 0 && startedById) {
            const senderDoc = await USERS.findOne({ _id: startedById }, { name: 1 }).lean() as any;
            const senderDetailsDoc = await USERS.findOne({ _id: startedById }, { password: 0 }).lean() as any;
            const placeholderMsg = await Message.create({
              senderId: startedById,
              groupId: roomId,
              senderName: senderDoc?.name || "Admin",
              message: "processing",
              fileName: `Call Recording | ${formatDurationShort(durationSec)}`,
              messageType: "screen_recording",
              createdAt: new Date(),
              allRecipients: recipients,
            });
            placeholderMsgId = placeholderMsg._id.toString();

            const socketPayload = {
              ...placeholderMsg.toObject(),
              senderDataAll: senderDetailsDoc,
            };
            const receiverIds = recipients
              .map((id: any) => id?.toString?.() || "")
              .filter((id: string) => id && id !== startedById);
            emitMessageToUsers(startedById, receiverIds, socketPayload);
            emitMessageToRoom(roomId, socketPayload);
          }
        } catch (placeholderErr: any) {
          console.warn("[auto-stop] failed to create placeholder message (non-fatal)", {
            roomId, recordingId, error: placeholderErr?.message || String(placeholderErr),
          });
        }

        await ScreenRecording.findByIdAndUpdate(recordingId, {
          $set: { rawFilePath: outputPath, uploadSessionId: placeholderMsgId },
        });

        processScreenRecordingInBackground(recordingId).catch(async (e: any) => {
          console.error("[auto-stop] processScreenRecordingInBackground failed", {
            roomId, recordingId, error: e?.message || String(e),
          });
          try {
            await ScreenRecording.findByIdAndUpdate(recordingId, {
              $set: { status: "failed", errorMessage: e?.message || String(e) },
            });
            if (placeholderMsgId) {
              await Message.findByIdAndUpdate(placeholderMsgId, {
                $set: { message: "Recording failed", fileName: "Call Recording | Failed" },
              });
            }
          } catch { /* non-fatal */ }
        });
      })();
    }
  } catch (err) {
    console.error("[auto-stop] error stopping recordings for room", { roomId, error: err });
  }
}

/**
 * Periodic safety sweep: every 30s, find any active recording whose room has
 * zero joined participants and force-stop it. Guards against gaps in the
 * participant-leave paths (socket disconnect, REST beacon, etc.).
 */
const RECORDING_SWEEP_INTERVAL_MS = 30000;
let recordingSweepTimer: NodeJS.Timeout | null = null;

function startRecordingSafetySweep(io: Server) {
  if (recordingSweepTimer) return;
  recordingSweepTimer = setInterval(async () => {
    try {
      const activeScreenRecRooms = await ScreenRecording.distinct("groupId", { status: "recording" });
      const roomIds: string[] = Array.from(
        new Set(activeScreenRecRooms.map((id: any) => id?.toString?.() || id))
      ).filter(Boolean);

      for (const roomId of roomIds) {
        const call = await videoCall.findOne({ groupId: roomId, status: "active" }).lean() as any;
        const hasJoinedParticipant = call?.userActivity?.some(
          (a: any) => a.user && a.status === "joined",
        );
        if (!hasJoinedParticipant) {
          console.log("[recording-sweep] force-stopping recording for orphaned room", { roomId });
          await autoStopRecordingsForRoom(roomId, io);
          if (call?._id) {
            await videoCall.updateOne(
              { _id: call._id },
              { $set: { status: "ended", endedAt: new Date(), incommingCall: false } },
            );
          }
        }
      }
    } catch (err) {
      console.error("[recording-sweep] error", err);
    }
  }, RECORDING_SWEEP_INTERVAL_MS);
}

let worker: any;
let router: any;
let transports: any = {}; // Store transports per user
let producers: any = {}; // Store producers per user
let consumers: any = {}; // Store consumers per user
let rooms: any = {}; // store rooms
const socketUserMap = new Map();
const socketRoomMap = new Map();
const socketConnectedAtMap = new Map<string, number>();
export let ioInstance: Server | null = null;
export function getIoInstance(): Server | null {
  return ioInstance;
}
// Shared across all connections - each connection handler previously had its own socketList,
// so callee could not see caller's info when building FE-user-join
const socketList: {
  [key: string]: {
    video: boolean;
    audio: boolean;
    userName?: string;
    fullName?: string;
    name?: string;
    mobileSDP?: object;
  };
} = {};

export default function initializeSocket() {
  // Initialize Socket.IO and mediasoup signaling
  const io = new Server(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === "development"
          ? true
          : [
            "http://134.199.242.61:4000",
            "http://134.199.242.61:3000",
            "http://134.199.242.61:3010",
            "http://localhost:5000",
            "http://localhost:5001",
            "http://localhost:6000",
            "http://69.62.84.25:10016",
            "http://69.62.84.25:10017",
            "http://103.121.157.203:10016",
            "http://103.121.157.203:10017",
            "http://134.199.249.149:10016",
            "http://134.199.249.149:10017",
            "http://localhost:10016",
            "http://localhost:10017",
            "http://69.62.84.25:10018",
            "http://103.121.157.203:10018",
            "http://134.199.249.149:10018",
            "https://extalk.excellisit.net", // Production frontend domain
            "https://extalkapi.excellisit.net", // Production API domain (for Socket.io handshake)
            "https://extalk.excellisit.net/guest-meeting",
            "https://extalk.excellisit.net/guest-meeting/",
            "http://69.62.84.25:10016/guest-meeting",
            "http://69.62.84.25:10016/guest-meeting/",
            "http://103.121.157.203:10016/guest-meeting",
            "http://103.121.157.203:10016/guest-meeting/",
            "http://134.199.249.149:10016/guest-meeting",
            "http://134.199.249.149:10016/guest-meeting/",
            "http://13.51.47.108:10016",
            "http://134.199.242.61:4000",
            "http://134.199.242.61:3000",
            "http://134.199.242.61:3010",
            "http://13.63.9.45:10016",
            "http://13.63.9.45:10018",
            "http://13.63.9.45:10017",
            "https://api.cu-app.us",
            "https://cu-app.us",
          ],
      methods: ["GET", "POST", "PUT", "DELETE", "EMIT"],
      credentials: true,
    },
    allowEIO3: true, // Allow the older version (EIO 3) for compatibility
    transports: ["websocket", "polling",], // Explicitly specify the transports
    // Keep heartbeat frequent enough for mobile carrier NATs.
    pingInterval: 10000,
    pingTimeout: 20000,
  });

  if (!io) {
    return null;
  }

  ioInstance = io;
  startRecordingSafetySweep(io);

  io.on("connection", (socket) => {
    console.log("[SOCKET] new connection", socket.id);
    socketConnectedAtMap.set(socket.id, Date.now());
    const rooms: any = {};

    socketList[socket.id] = { video: true, audio: true };

    // Track user socket connection for later use with call status updates
    let connectedUser: { userId: string; roomId: string } | null = null;
    // ===========================================================================
    // ===========================================================================
    // ===========================================================================
    // =======================  socket for video call start ======================
    // ===========================================================================
    // ===========================================================================
    // ===========================================================================
    socket.on("disconnect", async (reason) => {
      const roomId = socketRoomMap.get(socket.id);
      const userId = socketUserMap.get(socket.id);
      const connectionStartedAt = socketConnectedAtMap.get(socket.id);
      const connectedForMs = connectionStartedAt
        ? Date.now() - connectionStartedAt
        : 0;
      const connectedForSeconds = Math.max(
        0,
        Math.round(connectedForMs / 1000),
      );
      const socketUserInfo = socketList[socket.id] || {};

      console.log("[SOCKET] disconnected", {
        socketId: socket.id,
        reason,
        userId:
          userId || connectedUser?.userId || socketUserInfo?.userName || null,
        userName: socketUserInfo?.userName || null,
        fullName: socketUserInfo?.fullName || socketUserInfo?.name || null,
        roomId: roomId || connectedUser?.roomId || null,
        connectedForSeconds,
        disconnectedAt: new Date().toISOString(),
      });

      // Cleanup mediasoup peer state for this user/room
      try {
        const effectiveUserId = userId || connectedUser?.userId || socketUserInfo?.userName;
        const effectiveRoomId = roomId || connectedUser?.roomId;

        if (effectiveRoomId && effectiveUserId) {
          await removePeer(effectiveRoomId.toString(), effectiveUserId.toString());
        }

        if (effectiveUserId && mongoose.Types.ObjectId.isValid(effectiveUserId)) {
          await USERS.findByIdAndUpdate(effectiveUserId, { isActiveInCall: false });
        }
      } catch (err) {
        console.error("Error cleaning up user state on disconnect:", err);
      }

      // ... existing group notification logic ...
      const groups = await Group.find({ _id: roomId });
      if (groups && groups[0]?.currentUsers.length > 0) {
        groups[0].currentUsers.forEach(async (uid: any) => {
          const connectedSockets =
            io.sockets.adapter.rooms.get(uid.toString()) || [];
          if (connectedSockets) {
            connectedSockets.forEach((socketId) => {
              socket.to(socketId).emit("FE-user-disconnected", {
                userSocketId: socket.id,
                userName: socketList[socket.id]?.userName,
                fullName: socketList[socket.id]?.fullName,
                roomId: roomId,
              });
            });
          }
        });
      }

      delete socketList[socket.id];
      socketUserMap.delete(socket.id);
      socketRoomMap.delete(socket.id);
      socketConnectedAtMap.delete(socket.id);

      // Handle case where user disconnects without properly leaving the call
      // (e.g., browser refresh, close tab, etc.)
      if (connectedUser) {
        const { roomId, userId } = connectedUser;

        try {
          // CHECK FOR GUEST MEETING FIRST
          let isGuestMeeting = false;
          if (mongoose.Types.ObjectId.isValid(roomId)) {
            const guestMeeting = await GuestMeeting.findById(roomId);
            if (guestMeeting) {
              isGuestMeeting = true;
              // Update Guest Schema
              await GuestMeeting.updateOne(
                {
                  _id: roomId,
                  status: "active",
                  "userActivity.user": userId,
                },
                {
                  $set: {
                    "userActivity.$.status": "left",
                    "userActivity.$.leftAt": new Date(),
                  },
                },
              );

              // Notify other participants to remove the disconnected user's video card
              io.to(roomId).emit("FE-guest-disconnected", {
                userSocketId: socket.id,
                userName: userId,
                roomId: roomId,
              });
            }
          }

          // ONLY PROCEED TO VIDEOCALL IF NOT A GUEST MEETING
          if (!isGuestMeeting) {
            // Prevent CastError: Ensure userId is valid ObjectId before querying VideoCall
            if (!mongoose.Types.ObjectId.isValid(userId)) {
              console.log(
                `[Disconnect] User ${userId} is not ObjectId, skipping VideoCall update (likely Guest).`,
              );
              return;
            }

            // Update the user status to left
            await videoCall.updateOne(
              {
                groupId: roomId,
                status: "active",
                "userActivity.user": userId,
                "userActivity.status": "joined",
              },
              {
                $set: {
                  "userActivity.$.status": "left",
                  "userActivity.$.leftAt": new Date(),
                },
              },
            );

            // Check if any active participants remain
            const groupCall = await videoCall
              .findOne({
                groupId: roomId,
                status: "active",
              })
              .lean();

            if (groupCall) {
              const activeParticipants = groupCall.userActivity.filter(
                (activity: any) =>
                  activity.user && activity.status === "joined",
              );

              // If no participants remain, mark the call as ended
              if (activeParticipants.length === 0) {
                // Auto-stop any active recordings before ending the call
                await autoStopRecordingsForRoom(roomId, io);

                await videoCall.updateOne(
                  { _id: groupCall._id },
                  {
                    $set: {
                      status: "ended",
                      endedAt: new Date(),
                      incommingCall: false,
                    },
                  },
                );

                // Notify others that the call has ended
                const group = await Group.findOne({ _id: roomId });
                if (group && group.currentUsers) {
                  group.currentUsers.forEach((uid: any) => {
                    const connectedSockets = io.sockets.adapter.rooms.get(
                      uid.toString(),
                    );
                    if (connectedSockets) {
                      connectedSockets.forEach((socketId) => {
                        io.to(socketId).emit("call-status-change", {
                          groupId: roomId,
                          isActive: false,
                          participantCount: 0,
                        });
                      });
                    }
                  });
                }
              } else {
                // Update the remaining participants about the count
                const participantCount = activeParticipants.length;

                const group = await Group.findOne({ _id: roomId });
                if (group && group.currentUsers) {
                  group.currentUsers.forEach((uid: any) => {
                    const connectedSockets = io.sockets.adapter.rooms.get(
                      uid.toString(),
                    );
                    if (connectedSockets) {
                      connectedSockets.forEach((socketId) => {
                        io.to(socketId).emit("call-status-change", {
                          groupId: roomId,
                          isActive: true,
                          participantCount,
                        });
                      });
                    }
                  });
                }
              }
            }
          }
        } catch (error) {
          console.error("Error handling disconnection cleanup:", error);
        }
      }
    });
    // Optional - Reconnect handler, if using persistent user ID from client
    socket.on("RECONNECT-USER", ({ oldSocketId }) => {
      if (socketList[oldSocketId]) {
        socketList[socket.id] = socketList[oldSocketId];
        delete socketList[oldSocketId];
      }
    });

    socket.on("BE-check-user", async ({ roomId, userName, callType }) => {
      let error = false;
      try {
        const clients = await io.in(roomId).allSockets();
        clients.forEach((client) => {
          if (socketList[client]?.userName === userName) {
            error = true;
          }
        });
        socket.emit("FE-error-user-exist", {
          error,
          roomId,
          userName,
          callType,
        });
      } catch (err) {
        console.error("Error checking user:", err);
      }
    });

    /**
     * Join Room
     * Note: frontend expects an ACK callback from this handler.
     */
    socket.on(
      "BE-join-room",
      async (
        {
          roomId,
          userName,
          fullName,
          mobileSDP = {},
          callType,
          video = true,
          audio = true,
        }: any,
        cb?: (payload: any) => void,
      ) => {
        // Join the room

        connectedUser = { roomId, userId: userName };
        socketRoomMap.set(socket.id, roomId);
        socketUserMap.set(socket.id, userName);
        socket.join(roomId);

        // Debug: log current clients in this room whenever someone joins
        try {
          const clientsInRoom = await io.in(roomId).allSockets();
          console.log("[BE-join-room]", {
            roomId,
            joinedSocket: socket.id,
            userName,
            clients: Array.from(clientsInRoom),
          });
        } catch (e) {
          console.error(
            "[BE-join-room] failed to list clients for room",
            roomId,
            e,
          );
        }

        // Ensure we always have a human-readable fullName for this user
        let effectiveFullName = fullName;
        if (!effectiveFullName && mongoose.Types.ObjectId.isValid(userName)) {
          try {
            const userDoc = await USERS.findById(userName)
              .select("name")
              .lean();
            if (userDoc && userDoc.name) {
              effectiveFullName = userDoc.name;
            }
          } catch (e) {
            console.error("Error looking up user fullName in BE-join-room:", e);
          }
        }

        socketList[socket.id] = {
          ...(socketList[socket.id] || {}), // retain existing state if already set
          userName,
          // expose both name and fullName for frontend compatibility
          name: effectiveFullName,
          fullName: effectiveFullName,
          mobileSDP,
          video: video,
          audio: audio,
        };

        try {
          // Register mediasoup peer for web clients
          await addPeer(roomId, userName.toString());
          // Get all clients in this room
          const clients = await io.in(roomId).allSockets();
          const isCallInitiatorJoin = clients.size === 1;
          // Create a list of all users in the room for the new user
          const users = [...clients].map((client) => ({
            userId: client,
            info: socketList[client],
          }));

          // Send the list to the newly joined user
          socket.emit("FE-user-join", users);

          // Send the new user info to all existing users in the room
          // This is critical for the existing users to create peer connections with the new user
          socket.broadcast.to(roomId).emit("FE-user-join", [
            {
              userId: socket.id,
              info: socketList[socket.id],
            },
          ]);
          await USERS.findByIdAndUpdate(userName, { isActiveInCall: true });

          // Rest of the code for updating group call records in database
          const groupCall = await videoCall.findOne({
            groupId: roomId,
            status: "active",
          });

          if (groupCall) {
            // Check if the user already exists in userActivity
            const existingUser = groupCall.userActivity.find(
              (activity) =>
                activity.user && activity.user.toString() === userName,
            );
            if (existingUser) {
              // Update status if the user already exists
              await videoCall.updateOne(
                {
                  _id: groupCall._id,
                  groupId: roomId,
                  status: "active",
                  "userActivity.user": userName,
                  "userActivity.status": "left",
                },
                {
                  $set: {
                    "userActivity.$.status": "joined",
                    "userActivity.$.joinedAt": new Date(),
                  },
                },
              );
            } else {
              // Add user if they are not in userActivity
              await videoCall.updateOne(
                {
                  _id: groupCall._id,
                  groupId: roomId,
                  status: "active",
                },
                {
                  $push: {
                    userActivity: {
                      user: userName,
                      status: "joined",
                      joinedAt: new Date(),
                    },
                  },
                },
              );
            }
          } else {
            // Create a new group call entry if it doesn't exist
            const newGroupCall = new videoCall({
              groupId: roomId,
              userActivity: [{ user: userName }],
              status: "active",
              callType: callType,
              startedAt: new Date(), // Add startedAt when creating a new call
            });
            await newGroupCall.save();
          }

          const groups = await Group.find({ _id: roomId });

          // Only the very first participant joining a room should trigger outgoing
          // incoming_call/waiting_call/push fanout. This avoids duplicate ringing
          // and race conditions when later participants join.
          if (isCallInitiatorJoin && groups && groups[0].currentUsers) {
            groups[0].currentUsers.forEach(async (uid: any) => {
              const connectedSockets =
                io.sockets.adapter.rooms.get(uid.toString()) || [];
              if (connectedSockets) {
                let checkUser = await videoCall.find({
                  groupId: roomId,
                  userActivity: { $elemMatch: { user: uid, status: "joined" } },
                });
                let Check_user = await USERS.find({ _id: uid });
                let check_incomming_call = await videoCall.find({
                  groupId: roomId,
                  status: "active",
                });

                if (checkUser.length < 1) {
                  console.log(
                    `[Socket] Checking user ${uid}: isActiveInCall=${Check_user[0]?.isActiveInCall}`,
                  );

                  if (
                    !Check_user[0].isActiveInCall &&
                    !check_incomming_call[0]?.incommingCall
                  ) {
                    await videoCall.updateOne(
                      { _id: check_incomming_call[0]?._id },
                      { $set: { incommingCall: true } },
                    );

                    if (groups[0].isTemp == false) {
                      connectedSockets.forEach((socketId) => {
                        socket.broadcast.to(socketId).emit("incomming_call", {
                          uid,
                          socketId: socket.id,
                          roomId,
                          groupName: groups[0].groupName,
                          groupImage: groups[0]?.groupImage
                            ? groups[0].groupImage
                            : null,
                          callerName: fullName,
                          callType: callType,
                        });
                      });

                      // Do not call toString() on possibly-undefined checkUser[0]?._id
                      if (
                        (checkUser[0]?._id?.toString?.() || "") !==
                        userName.toString()
                      ) {
                        sendApplePush({
                          deviceToken: Check_user[0]?.applePushToken ?? "",
                          fullName,
                          groupName: groups[0].groupName,
                          groupId: roomId,
                          callType: callType,
                          userId: userName,
                        });
                      }
                    }
                  } else if (Check_user[0].isActiveInCall) {
                    console.log(
                      `[Socket] User ${uid} is busy. Sending waiting_call.`,
                    );
                    if (groups[0].isTemp == false) {
                      connectedSockets.forEach((socketId) => {
                        console.log(
                          `[Socket] Emitting waiting_call to ${socketId}`,
                        );
                        io.to(socketId).emit("waiting_call", {
                          uid,
                          socketId: socket.id,
                          roomId,
                          groupName: groups[0].groupName,
                          groupImage: groups[0]?.groupImage
                            ? groups[0].groupImage
                            : null,
                          callerName: fullName,
                          callType: callType,
                          isDirect: groups[0].isDirect ?? false,
                        });
                      });
                    }
                  }
                }
              }
            });

            if (groups[0].isTemp == false) {
              initializeFirebase(
                groups[0].currentUsers.filter(
                  (uid: any) => uid.toString() !== userName.toString(),
                ),
                `${groups[0].groupName}`,
                `Incoming ${callType} call from ${fullName}`,
                roomId,
                "incomming_call",
                callType,
                [],
                "null",
              );

              const recipients: string[] = groups[0].currentUsers
                .filter(
                  (uid: mongoose.Types.ObjectId) =>
                    uid.toString() !== userName.toString(),
                )
                .map((uid: mongoose.Types.ObjectId) => uid.toString());

              sendWebPush.sendWebPush(
                recipients,
                fullName,
                `${fullName} is calling from ${groups[0].groupName}`,
                roomId,
                "incomming_call",
              );
            } else {
              initializeFirebase(
                groups[0].currentUsers.filter(
                  (uid: any) => uid.toString() !== userName.toString(),
                ),
                `${groups[0].groupName}`,
                `${fullName} has joined the meeting: ${groups[0].groupName}`,
                roomId,
                "text",
                callType,
                [],
                "null",
              );
            }
          }

          // Signal success to caller (mediasoup initialization waits on this)
          cb && cb({ ok: true });
        } catch (err) {
          console.error("Error in BE-join-room:", err);
          cb && cb({ ok: false, error: "join-room-failed" });
          socket.emit("FE-error-user-exist", { err: true });
        }
      },
    );

    /**
     * Join Guest Room (Separate logic for Guests)
     */
    socket.on(
      "BE-join-guest-room",
      async ({
        roomId,
        userName,
        fullName,
        mobileSDP = {},
        callType,
        video = true,
        audio = true,
      }: any) => {
        try {
          connectedUser = { roomId, userId: userName };
          socketRoomMap.set(socket.id, roomId);
          socketUserMap.set(socket.id, userName);
          socket.join(roomId);

          // Resolve a human-readable name when possible
          let effectiveFullName = fullName;
          if (!effectiveFullName && mongoose.Types.ObjectId.isValid(userName)) {
            try {
              const userDoc = await USERS.findById(userName)
                .select("name")
                .lean();
              if (userDoc && userDoc.name) {
                effectiveFullName = userDoc.name;
              }
            } catch (e) {
              console.error(
                "Error looking up user fullName in BE-join-guest-room:",
                e,
              );
            }
          }

          socketList[socket.id] = {
            ...(socketList[socket.id] || {}),
            userName,
            name: effectiveFullName,
            fullName: effectiveFullName,
            mobileSDP,
            video: video,
            audio: audio,
          };

          // Register mediasoup peer for guest users
          await addPeer(roomId, userName.toString());

          // Get all clients in this room
          const clients = await io.in(roomId).allSockets();
          const users = [...clients].map((client) => ({
            userId: client,
            info: socketList[client],
          }));

          // Send list to self
          socket.emit("FE-user-join", users);

          // Broadcast to others
          socket.broadcast.to(roomId).emit("FE-user-join", [
            {
              userId: socket.id,
              info: socketList[socket.id],
            },
          ]);

          // Update GuestMeeting Database
          if (mongoose.Types.ObjectId.isValid(roomId)) {
            const guestMeeting: any = await GuestMeeting.findById(roomId);
            if (guestMeeting) {
              const existingUser = guestMeeting.userActivity.find(
                (activity: any) => activity.user === userName,
              );

              if (existingUser) {
                await GuestMeeting.updateOne(
                  { _id: roomId, "userActivity.user": userName },
                  {
                    $set: {
                      "userActivity.$.status": "joined",
                      "userActivity.$.joinedAt": new Date(),
                      status: "active",
                      startedAt: guestMeeting.startedAt || new Date(),
                    },
                  },
                );
              } else {
                await GuestMeeting.updateOne(
                  { _id: roomId },
                  {
                    $push: {
                      userActivity: {
                        user: userName, // Email or Guest ID
                        name: fullName || "Guest",
                        status: "joined",
                        joinedAt: new Date(),
                      },
                    },
                    $set: {
                      status: "active",
                      startedAt: guestMeeting.startedAt || new Date(),
                    },
                  },
                );
              }
            }
          }
        } catch (err) {
          console.error("Error in BE-join-guest-room:", err);
          socket.emit("FE-error-user-exist", { err: true });
        }
      },
    );

    /**
     * Leave Guest Room
     */
    socket.on("BE-leave-guest-room", async ({ roomId, leaver }) => {
      try {
        if (mongoose.Types.ObjectId.isValid(roomId)) {
          const guestMeeting: any = await GuestMeeting.findById(roomId);
          if (guestMeeting) {
            await GuestMeeting.updateOne(
              { _id: roomId, "userActivity.user": leaver },
              {
                $set: {
                  "userActivity.$.status": "left",
                  "userActivity.$.leftAt": new Date(),
                },
              },
            );

            const updatedMeeting: any = await GuestMeeting.findById(roomId);
            if (updatedMeeting) {
              const activeParticipants = updatedMeeting.userActivity.filter(
                (activity: any) => activity.status === "joined",
              );
              if (activeParticipants.length === 0) {
                await GuestMeeting.updateOne(
                  { _id: roomId },
                  { $set: { status: "completed", endedAt: new Date() } },
                );
              }
            }

            // Notify others to remove peer
            socket.broadcast.to(roomId).emit("FE-guest-disconnected", {
              userSocketId: socket.id,
              userName: leaver,
              fullName: socketList[socket.id]?.fullName,
              roomId: roomId,
            });

            socket.leave(roomId);
          }
        }
      } catch (e) {
        console.error("Error in BE-leave-guest-room", e);
      }
    });

    socket.on("BE-leave-room", async ({ roomId, leaver }) => {
      // Guard against malformed payloads
      if (!roomId || !leaver) {
        console.warn("[BE-leave-room] missing roomId or leaver", {
          roomId,
          leaver,
          socketId: socket.id,
        });
        return;
      }

      // 1. Update leaver status in database FIRST to prevent race conditions
      await videoCall.updateOne(
        { groupId: roomId, status: "active", "userActivity.user": leaver },
        {
          $set: {
            "userActivity.$.status": "left",
            "userActivity.$.leftAt": new Date(),
          },
        },
      );
      await USERS.findByIdAndUpdate(leaver, { isActiveInCall: false });

      // Cleanup mediasoup peer
      try {
        await removePeer(roomId.toString(), leaver.toString());
      } catch (err) {
        console.error("Error removing mediasoup peer on BE-leave-room:", err);
      }

      // 2. Count remaining participants accurately after update
      const activeCallDoc = (await videoCall
        .findOne({ groupId: roomId, status: "active" })
        .lean()) as any;
      const activeParticipants =
        activeCallDoc?.userActivity?.filter(
          (a: any) => a.user && a.status === "joined",
        ) || [];
      const remainingCount = activeParticipants.length;

      // 3. Notify sidebars throughout the app
      const groups = await Group.find({ _id: roomId });
      if (groups && groups[0]) {
        groups[0].currentUsers.forEach((uid: any) => {
          const connectedSockets = io.sockets.adapter.rooms.get(uid.toString());
          if (connectedSockets) {
            connectedSockets.forEach((socketId) => {
              io.to(socketId).emit("call-status-change", {
                groupId: roomId,
                isActive: remainingCount > 0,
                participantCount: remainingCount,
              });
            });
          }
        });
      }

      // 4. Handle call termination if no one is left
      if (remainingCount === 0 && activeCallDoc) {
        // Auto-stop any active recordings before ending the call
        await autoStopRecordingsForRoom(roomId, io);

        await videoCall.updateOne(
          { _id: activeCallDoc._id },
          {
            $set: {
              status: "ended",
              endedAt: new Date(),
              incommingCall: false,
            },
          },
        );

        if (groups && groups[0]?.currentUsers.length > 0) {
          // Broadcast to room so all clients receive it regardless of socket reconnects
          io.to(roomId).emit("FE-call-ended", {
            userSocketId: socket.id,
            userName: leaver,
            roomId: roomId,
            isActive: false,
          });
          groups[0].currentUsers.forEach(async (uid: any) => {
            // Also emit to each user's personal room as fallback
            io.to(uid.toString()).emit("FE-call-ended", {
              userSocketId: socket.id,
              userName: leaver,
              roomId: roomId,
              isActive: false,
            });

            // Apple Push
            let Check_user = await USERS.findById(uid);
            if (uid.toString() !== leaver.toString()) {
              setTimeout(() => {
                sendApplePush({
                  deviceToken: Check_user?.applePushToken ?? "",
                  fullName: Check_user?.name ?? "Unknown User",
                  groupName: groups[0].groupName || "Meeting",
                  groupId: roomId,
                  callType: activeCallDoc?.callType,
                  msgType: "incoming_call_ended",
                  userId: leaver,
                });
              }, 1000);
            }
          });

          // Firebase Push
          initializeFirebase(
            groups[0].currentUsers.filter(
              (uid: any) => uid?.toString() !== leaver?.toString(),
            ),
            `${groups[0]?.groupName}`,
            `Call has ended`,
            roomId,
            "incomming_call_ended",
            activeCallDoc?.callType,
            [],
            "null",
          );

          // System message
          let leaverUser = await USERS.findById(leaver);
          const start = moment(activeCallDoc?.startedAt);
          const end = moment(new Date());
          const formatted = moment
            .utc(moment.duration(end.diff(start)).asMilliseconds())
            .format("HH:mm:ss");

          let returnMessageData = await Message.create({
            senderId: leaver,
            groupId: roomId,
            senderName: leaverUser?.name || "Unknown User",
            message: `Call Has Ended | ${formatted}`,
            messageType: "text",
            createdAt: new Date(),
            allRecipients: groups[0].currentUsers,
          });

          // Emit message to everyone
          const messageDataWithSender = {
            ...returnMessageData.toObject(),
            senderDataAll: leaverUser,
          };
          io.in(roomId).emit("message", { data: messageDataWithSender });
        }
      } else {
        // People are still in the call, just notify about the leaver
        const restOfUser = await checkActiveCall(roomId, leaver);
        const leaverInfo = socketList[socket.id] || {};
        socket.broadcast.to(roomId).emit("FE-user-leave", {
          userId: socket.id,
          userName: leaver,
          fullName: leaverInfo.fullName,
          roomId: roomId,
          joinUserCount: restOfUser,
        });

        io.to(leaver).emit("FE-user-leave", {
          userId: socket.id,
          userName: leaver,
          fullName: leaverInfo.fullName,
          roomId: roomId,
          joinUserCount: restOfUser,
        });

        io.emit("FE-leave", {
          userId: socket.id,
          userName: leaver,
          roomId: roomId,
          joinUserCount: restOfUser,
          isActive: true,
        });
      }

      await cleanupOrphanedCalls();
      socket.leave(roomId);
      delete socketList[socket.id];
    });

    socket.on("BE-toggle-camera-audio", ({ roomId, switchTarget }) => {
      const user = socketList[socket.id];
      if (!user) return;

      if (switchTarget === "video") {
        user.video = !user.video;
      } else {
        user.audio = !user.audio;
      }

      socket.to(roomId).emit("FE-toggle-camera", {
        userId: socket.id,
        switchTarget,
      });
    });

    socket.on("BE-toggle-screen-share", ({ roomId, isScreenShare }) => {
      socket.to(roomId).emit("FE-toggle-screen-share", {
        userId: socket.id,
        isScreenShare,
      });
    });

    // =====================================================
    // Screen recording control (server-side via mediasoup)
    // =====================================================
    socket.on("BE-start-screen-recording", async ({ roomId, userId: clientUserId }: any) => {
      const userId = socketUserMap.get(socket.id) || clientUserId;
      if (!roomId || !userId) {
        socket.emit("FE-screen-recording-error", {
          roomId,
          message: "Missing roomId or user context.",
        });
        return;
      }

      try {
        // Role check: SuperAdmin / admin only
        const userDoc: any = await USERS.findById(userId, { userType: 1 }).lean();
        if (!userDoc || (userDoc.userType !== "SuperAdmin" && userDoc.userType !== "admin")) {
          socket.emit("FE-screen-recording-error", {
            roomId,
            message: "Only SuperAdmin and Admin can start screen recording.",
          });
          return;
        }

        // Check active call
        const activeCall = await videoCall
          .findOne({ groupId: roomId, status: "active" }, { _id: 1 })
          .lean();
        if (!activeCall?._id) {
          socket.emit("FE-screen-recording-error", {
            roomId,
            message: "No active call found for this room.",
          });
          return;
        }

        // Check no existing recording in progress
        const existing = await ScreenRecording.findOne({
          groupId: roomId,
          status: { $in: ["recording", "uploading", "processing"] },
        }).lean();
        if (existing?._id) {
          socket.emit("FE-screen-recording-error", {
            roomId,
            message: "A screen recording is already in progress.",
          });
          return;
        }

        // Create ScreenRecording document
        const newRecording = await ScreenRecording.create({
          groupId: roomId,
          startedBy: userId.toString(),
          status: "recording",
        });

        const recordingId = newRecording._id.toString();

        console.log("[BE-start-screen-recording] created", {
          roomId,
          recordingId,
          startedBy: userId.toString(),
        });

        // Notify all participants
        io.in(roomId).emit("FE-screen-recording-started", {
          roomId,
          recordingId,
          startedBy: userId.toString(),
        });

        // Start server-side mediasoup recording (FFmpeg captures RTP streams)
        const producersNow = getRoomProducers(roomId);
        const isAudioOnly = !producersNow.some((p) => p.kind === "video");

        startServerRecording({
          roomId,
          recordingId,
          isAudioOnly,
          recordingScope: "screen",
          primaryUserId: userId.toString(),
        }).catch(async (e: any) => {
          console.error("[BE-start-screen-recording] server recording failed", {
            roomId,
            recordingId,
            error: e?.message || String(e),
          });
          await ScreenRecording.findByIdAndUpdate(newRecording._id, {
            $set: { status: "failed", errorMessage: e?.message || String(e) },
          });
          io.in(roomId).emit("FE-screen-recording-error", {
            roomId,
            message: e?.message || "Failed to start server-side recording.",
          });
          io.in(roomId).emit("FE-screen-recording-stopped", {
            roomId,
            recordingId,
            stoppedBy: userId.toString(),
          });
        });
      } catch (error: any) {
        console.error("BE-start-screen-recording error:", error);
        socket.emit("FE-screen-recording-error", {
          roomId,
          message: error?.message || "Failed to start screen recording.",
        });
      }
    });

    socket.on("BE-stop-screen-recording", async ({ roomId, userId: clientUserId }: any) => {
      const userId = socketUserMap.get(socket.id) || clientUserId;
      if (!roomId || !userId) {
        socket.emit("FE-screen-recording-error", {
          roomId,
          message: "Missing roomId or user context.",
        });
        return;
      }

      notifyRoomRecordingStopPending(roomId);

      try {
        // Role check
        const userDoc: any = await USERS.findById(userId, { userType: 1 }).lean();
        if (!userDoc || (userDoc.userType !== "SuperAdmin" && userDoc.userType !== "admin")) {
          clearRoomRecordingStopPending(roomId);
          socket.emit("FE-screen-recording-error", {
            roomId,
            message: "Only SuperAdmin and Admin can stop screen recording.",
          });
          return;
        }

        // Find the active recording
        const recording = await ScreenRecording.findOneAndUpdate(
          { groupId: roomId, status: "recording" },
          { $set: { status: "processing" } },
          { new: true },
        );

        if (!recording?._id) {
          clearRoomRecordingStopPending(roomId);
          socket.emit("FE-screen-recording-error", {
            roomId,
            message: "No active screen recording found to stop.",
          });
          return;
        }

        const recordingId = recording._id.toString();
        const createdAt = recording.createdAt ? new Date(recording.createdAt) : null;
        const durationSec = createdAt
          ? Math.max(0, Math.round((Date.now() - createdAt.getTime()) / 1000))
          : 0;

        await ScreenRecording.findByIdAndUpdate(recordingId, {
          $set: { durationSec },
        });

        notifyRecordingStopPending(roomId, recordingId);

        console.log("[BE-stop-screen-recording] stopping", {
          roomId,
          recordingId,
          durationSec,
        });

        // Notify all participants immediately
        io.in(roomId).emit("FE-screen-recording-stopped", {
          roomId,
          recordingId,
          stoppedBy: userId.toString(),
        });

        // Stop FFmpeg and process in background
        (async () => {
          let outputPath = "";
          try {
            const stopped = await stopServerRecording(recordingId);
            outputPath = stopped.outputPath;
          } catch (e: any) {
            console.error("[BE-stop-screen-recording] failed to stop ffmpeg", {
              roomId,
              recordingId,
              error: e?.message || String(e),
            });
            await ScreenRecording.findByIdAndUpdate(recordingId, {
              $set: { status: "failed", errorMessage: e?.message || String(e) },
            });
            io.in(roomId).emit("FE-screen-recording-error", {
              roomId,
              message: e?.message || "Failed to stop server-side recording.",
            });
            return;
          } finally {
            clearRoomRecordingStopPending(roomId);
          }

          // Save the output path
          await ScreenRecording.findByIdAndUpdate(recordingId, {
            $set: { rawFilePath: outputPath },
          });

          // Create a placeholder "processing" message in chat immediately
          // so users see feedback while transcode + upload runs.
          const group = await Group.findById(roomId, { currentUsers: 1 }).lean() as any;
          const senderDoc = await USERS.findOne({ _id: userId }, { name: 1 }).lean() as any;
          const senderDetailsDoc = await USERS.findOne({ _id: userId }, { password: 0 }).lean() as any;
          const recipients = group?.currentUsers || [];

          let placeholderMsgId: string | null = null;
          if (recipients.length > 0) {
            const placeholderMsg = await Message.create({
              senderId: userId,
              groupId: roomId,
              senderName: senderDoc?.name || "Admin",
              message: "processing",
              fileName: `Call Recording | ${formatDurationShort(durationSec)}`,
              messageType: "screen_recording",
              createdAt: new Date(),
              allRecipients: recipients,
            });
            placeholderMsgId = placeholderMsg._id.toString();

            const socketPayload = {
              ...placeholderMsg.toObject(),
              senderDataAll: senderDetailsDoc,
            };

            const senderId = userId.toString();
            const receiverIds = recipients
              .map((id: any) => id?.toString?.() || "")
              .filter((id: string) => id && id !== senderId);

            emitMessageToUsers(senderId, receiverIds, socketPayload);
            emitMessageToRoom(roomId, socketPayload);
          }

          // Save placeholder message ID so processor can update it
          await ScreenRecording.findByIdAndUpdate(recordingId, {
            $set: { rawFilePath: outputPath, uploadSessionId: placeholderMsgId },
          });

          console.log("[BE-stop-screen-recording] processing", {
            roomId,
            recordingId,
            outputPath,
            placeholderMsgId,
          });

          processScreenRecordingInBackground(recordingId).catch(async (e: any) => {
            console.error("[BE-stop-screen-recording] processing failed", {
              roomId,
              recordingId,
              error: e?.message || String(e),
            });
            try {
              await ScreenRecording.findByIdAndUpdate(recordingId, {
                $set: { status: "failed", errorMessage: e?.message || String(e) },
              });
            } catch { /* non-fatal */ }
            // Update placeholder message so it doesn't stay stuck at "processing"
            try {
              if (placeholderMsgId) {
                await Message.findByIdAndUpdate(placeholderMsgId, {
                  $set: { message: "Recording failed", fileName: "Call Recording | Failed" },
                });
              }
            } catch { /* non-fatal */ }
            io.in(roomId).emit("FE-screen-recording-error", {
              roomId,
              message: e?.message || "Screen recording processing failed.",
            });
          });
        })();
      } catch (error: any) {
        clearRoomRecordingStopPending(roomId);
        console.error("BE-stop-screen-recording error:", error);
        socket.emit("FE-screen-recording-error", {
          roomId,
          message: error?.message || "Failed to stop screen recording.",
        });
      }
    });

    socket.on(
      "call_disconnect",
      async (data: { roomId: string; userId: string }) => {
        const { roomId, userId } = data;
        // Clear the connectedUser tracking when user explicitly disconnects
        connectedUser = null;

        try {
          // CHECK FOR GUEST MEETING FIRST
          let isGuestMeeting = false;
          if (mongoose.Types.ObjectId.isValid(roomId)) {
            const guestMeeting = await GuestMeeting.findById(roomId);
            if (guestMeeting) {
              isGuestMeeting = true;
              // Update Guest Schema
              await GuestMeeting.updateOne(
                {
                  _id: roomId,
                  status: "active",
                  "userActivity.user": userId,
                },
                {
                  $set: {
                    "userActivity.$.status": "left",
                    "userActivity.$.leftAt": new Date(),
                  },
                },
              );

              // Check if any active participants remain (Guest Logic)
              const updatedMeeting: any = await GuestMeeting.findById(roomId);
              if (updatedMeeting) {
                const activeParticipants = updatedMeeting.userActivity.filter(
                  (activity: any) => activity.status === "joined",
                );

                if (activeParticipants.length === 0) {
                  await GuestMeeting.updateOne(
                    { _id: roomId },
                    { $set: { status: "completed", endedAt: new Date() } },
                  );
                }
              }
            }
          }

          if (isGuestMeeting) {
            // For guest meetings, also cleanup mediasoup peer
            try {
              await removePeer(roomId.toString(), userId.toString());
            } catch (err) {
              console.error(
                "Error removing mediasoup peer on guest call_disconnect:",
                err,
              );
            }

            socket.to(roomId).emit("call_disconnected", { userId });
            socket.leave(roomId);
            return; // Done for Guest
          }

          // REGULAR VIDEO CALL LOGIC (Safety Check)
          if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.log(
              `[CallDisconnect] User ${userId} is not ObjectId, skipping VideoCall update.`,
            );
            return;
          }

          // Update the user status to left
          const updateResult = await videoCall.updateOne(
            {
              groupId: roomId,
              status: "active",
              "userActivity.user": userId,
            },
            {
              $set: {
                "userActivity.$.status": "left",
                "userActivity.$.leftAt": new Date(),
              },
            },
          );

          if (updateResult.matchedCount === 0) {
            return;
          }

          // Cleanup mediasoup peer
          try {
            await removePeer(roomId.toString(), userId.toString());
          } catch (err) {
            console.error(
              "Error removing mediasoup peer on call_disconnect:",
              err,
            );
          }

          socket.to(roomId).emit("call_disconnected", { userId });
          socket.leave(roomId); // Leave the room when the call is disconnected

          // Get active call and count active participants
          const groupCall = await videoCall
            .findOne({
              groupId: roomId,
              status: "active",
            })
            .lean();

          if (!groupCall) {
            return;
          }
          // Count active participants - add null check
          const activeParticipants = groupCall.userActivity.filter(
            (activity: any) => activity.status === "joined",
          );
          const participantCount = activeParticipants.length;
          // If no participants left, end the call
          if (participantCount === 0) {
            // Auto-stop any active recordings before ending the call
            await autoStopRecordingsForRoom(roomId, io);

            await videoCall.updateOne(
              { _id: groupCall._id },
              {
                $set: {
                  status: "ended",
                  endedAt: new Date(),
                  incommingCall: false,
                },
              },
            );

            // Notify all users in group that call has ended
            const group = await Group.findOne({ _id: roomId });
            if (group && group.currentUsers) {
              group.currentUsers.forEach((uid: any) => {
                const connectedSockets = io.sockets.adapter.rooms.get(
                  uid.toString(),
                );
                if (connectedSockets) {
                  connectedSockets.forEach((socketId) => {
                    io.to(socketId).emit("call-status-change", {
                      groupId: roomId,
                      isActive: false,
                      participantCount: 0,
                    });
                  });
                }
              });
            }
          } else {
            // Update participant count for remaining users
            const group = await Group.findOne({ _id: roomId });
            if (group && group.currentUsers) {
              group.currentUsers.forEach((uid: any) => {
                const connectedSockets = io.sockets.adapter.rooms.get(
                  uid.toString(),
                );
                if (connectedSockets) {
                  connectedSockets.forEach((socketId) => {
                    io.to(socketId).emit("call-status-change", {
                      groupId: roomId,
                      isActive: true,
                      participantCount,
                    });
                  });
                }
              });
            }
          }
        } catch (error) {
          console.error("Error handling call disconnect:", error);
        }
      },
    );

    // =======================  mediasoup SFU signaling (web)  ======================
    // Get router RTP capabilities for this room
    socket.on(
      "MS-get-rtp-capabilities",
      async ({ roomId }, cb: (payload: any) => void) => {
        try {
          console.log("[MS] get-rtp-capabilities", {
            roomId,
            socketId: socket.id,
          });
          // Ensure room/router exist before returning capabilities
          const room = await getOrCreateRoom(roomId);
          const caps = room.router.rtpCapabilities;
          cb && cb({ ok: true, rtpCapabilities: caps });
        } catch (err) {
          console.error("MS-get-rtp-capabilities error:", err);
          cb && cb({ ok: false, error: "failed" });
        }
      },
    );

    // Return ICE servers (STUN/TURN) for client-side transport creation
    socket.on(
      "MS-get-ice-servers",
      (...args: any[]) => {
        const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : undefined;
        try {
          const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [];

          // STUN server for reflexive candidates
          const stunUrl = process.env.STUN_URL || "stun:stun.l.google.com:19302";
          iceServers.push({ urls: stunUrl });

          const turnUrl1 = process.env.TURN_URL_1;
          const turnUrlUdp = process.env.TURN_URL_UDP;
          const turnUrlTcp = process.env.TURN_URL_TCP;
          const turnUsername = process.env.TURN_USERNAME;
          const turnCredential = process.env.TURN_CREDENTIAL;

          const turnUrls = [turnUrl1, turnUrlUdp, turnUrlTcp].filter(Boolean) as string[];
          if (turnUrls.length > 0 && turnUsername && turnCredential) {
            iceServers.push({
              urls: turnUrls,
              username: turnUsername,
              credential: turnCredential,
            });
          }

          const icePolicy = process.env.ICE_POLICY || "all";
          const iceTransportPolicy = icePolicy; // "all" | "relay"

          console.log("[MS] get-ice-servers", {
            socketId: socket.id,
            turnUrls: turnUrls.length,
            iceTransportPolicy,
          });

          cb && cb({ ok: true, iceServers, iceTransportPolicy });
        } catch (err) {
          console.error("MS-get-ice-servers error:", err);
          cb && cb({ ok: false, error: "failed" });
        }
      },
    );

    // List existing producers in the room for a newly joined peer
    socket.on(
      "MS-get-producers",
      async (
        { roomId, userId }: { roomId: string; userId: string },
        cb: (payload: any) => void,
      ) => {
        try {
          await getOrCreateRoom(roomId);
          const producers = getRoomProducers(roomId, userId.toString());
          console.log("[MS] get-producers", {
            roomId,
            userId,
            count: producers.length,
            producers,
          });
          cb && cb({ ok: true, producers });
        } catch (err) {
          console.error("MS-get-producers error:", err);
          cb && cb({ ok: false, error: "failed" });
        }
      },
    );

    // Create WebRTC transport
    socket.on(
      "MS-create-transport",
      async (
        {
          roomId,
          userId,
          direction,
        }: { roomId: string; userId: string; direction: "send" | "recv" },
        cb: (payload: any) => void,
      ) => {
        try {
          const transport = await createWebRtcTransport(
            roomId,
            userId.toString(),
            direction,
          );
          console.log("[MS] create-transport", {
            roomId,
            userId,
            direction,
            transportId: transport.id,
          });
          cb &&
            cb({
              ok: true,
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters,
            });
        } catch (err) {
          console.error("MS-create-transport error:", err);
          cb && cb({ ok: false, error: "failed" });
        }
      },
    );

    // Connect transport DTLS
    socket.on(
      "MS-connect-transport",
      async (
        {
          roomId,
          userId,
          transportId,
          dtlsParameters,
        }: {
          roomId: string;
          userId: string;
          transportId: string;
          dtlsParameters: MediasoupTypes.DtlsParameters;
        },
        cb: (payload: any) => void,
      ) => {
        try {
          await connectTransport(
            roomId,
            userId.toString(),
            transportId,
            dtlsParameters,
          );
          console.log("[MS] connect-transport", {
            roomId,
            userId,
            transportId,
          });
          cb && cb({ ok: true });
        } catch (err) {
          console.error("MS-connect-transport error:", err);
          cb && cb({ ok: false, error: "failed" });
        }
      },
    );

    // Produce media
    socket.on(
      "MS-produce",
      async (
        {
          roomId,
          userId,
          transportId,
          kind,
          rtpParameters,
          encodings,
          appData,
        }: {
          roomId: string;
          userId: string;
          transportId: string;
          kind: MediasoupTypes.MediaKind;
          rtpParameters: MediasoupTypes.RtpParameters;
          encodings?: MediasoupTypes.RtpEncodingParameters[];
          appData?: {
            width?: number;
            height?: number;
            rotation?: number;
            source?: string;
            portraitLock?: boolean;
          };
        },
        cb: (payload: any) => void,
      ) => {
        (async () => {
          try {
            const isOpusAudio = kind !== "audio"
              || (rtpParameters?.codecs || []).some(
                (codec) => String(codec?.mimeType || "").toLowerCase() === "audio/opus",
              );
            const isSupportedVideo = kind !== "video"
              || (rtpParameters?.codecs || []).some(
                (codec) => {
                  const mimeType = String(codec?.mimeType || "").toLowerCase();
                  return mimeType === "video/h264" || mimeType === "video/vp8";
                },
              );
            if (!isOpusAudio || !isSupportedVideo) {
              cb && cb({ ok: false, error: "unsupported-codec" });
              return;
            }

            const producer = await createProducer(
              roomId,
              userId.toString(),
              transportId,
              kind,
              rtpParameters,
              encodings,
              appData,
            );
            if (!producer) {
              cb && cb({ ok: false, error: "no-producer" });
              return;
            }

            // Notify other peers in the same room
            console.log("[MS] produce", {
              roomId,
              userId,
              transportId,
              kind,
              producerId: producer.id,
              appData: kind === "video" ? appData : undefined,
            });
            socket.to(roomId).emit("MS-new-producer", {
              producerId: producer.id,
              userId,
              kind,
              ...(kind === "video" && appData
                ? {
                  width: appData.width,
                  height: appData.height,
                  rotation: appData.rotation,
                }
                : {}),
            });

            cb && cb({ ok: true, id: producer.id });

            // Refresh recording topology when new producers appear so late joiners
            // are included in ongoing recordings (debounced in recording manager).
            const activeRecordingId = getActiveRecordingForRoom(roomId);
            const shouldRestartOnProducerJoin =
              String(process.env.RECORDING_RESTART_ON_PRODUCER_JOIN || "true").toLowerCase() === "true";
            if (activeRecordingId && shouldRestartOnProducerJoin) {
              scheduleRecordingRestart(roomId, activeRecordingId);
            } else if (shouldRestartOnProducerJoin) {
              // Recording startup and producer events can race. Retry once so an
              // initial video producer is not missed right after recording starts.
              setTimeout(() => {
                const delayedRecordingId = getActiveRecordingForRoom(roomId);
                if (delayedRecordingId) {
                  scheduleRecordingRestart(roomId, delayedRecordingId);
                }
              }, 1200);
            }
          } catch (err) {
            console.error("MS-produce error:", err);
            cb && cb({ ok: false, error: "failed" });
          }
        })();
      },
    );

    // Consume media
    socket.on(
      "MS-consume",
      async (
        {
          roomId,
          userId,
          producerId,
          rtpCapabilities,
        }: {
          roomId: string;
          userId: string;
          producerId: string;
          rtpCapabilities: MediasoupTypes.RtpCapabilities;
        },
        cb: (payload: any) => void,
      ) => {
        try {
          const result = await createConsumer(
            roomId,
            userId.toString(),
            producerId,
            rtpCapabilities,
          );
          if (!result) {
            cb && cb({ ok: false, error: "cannot-consume" });
            return;
          }
          const { consumer } = result;
          console.log("[MS] consume", {
            roomId,
            userId,
            producerId,
            consumerId: consumer.id,
            kind: consumer.kind,
          });
          cb &&
            cb({
              ok: true,
              id: consumer.id,
              producerId: consumer.producerId,
              kind: consumer.kind,
              rtpParameters: consumer.rtpParameters,
              type: consumer.type,
              producerPaused: consumer.producerPaused,
              paused: true,
            });
        } catch (err) {
          console.error("MS-consume error:", err);
          cb && cb({ ok: false, error: "failed" });
        }
      },
    );
    // Resume a paused consumer after the client has set it up
    socket.on(
      "MS-resume-consumer",
      async (
        {
          roomId,
          userId,
          consumerId,
        }: { roomId: string; userId: string; consumerId: string },
        cb: (payload: any) => void,
      ) => {
        try {
          await resumeConsumer(roomId, userId.toString(), consumerId);
          cb && cb({ ok: true });
        } catch (err) {
          console.error("MS-resume-consumer error:", err);
          cb && cb({ ok: false, error: "failed" });
        }
      },
    );

    // Set preferred simulcast/SVC layers for a video consumer (adaptive quality)
    socket.on(
      "MS-set-preferred-layers",
      async (
        {
          roomId,
          userId,
          consumerId,
          spatialLayer,
          temporalLayer,
        }: {
          roomId: string;
          userId: string;
          consumerId: string;
          spatialLayer: number;
          temporalLayer: number;
        },
        cb: (payload: any) => void,
      ) => {
        try {
          await setConsumerPreferredLayers(
            roomId,
            userId.toString(),
            consumerId,
            spatialLayer,
            temporalLayer,
          );
          cb && cb({ ok: true });
        } catch (err) {
          console.error("MS-set-preferred-layers error:", err);
          cb && cb({ ok: false, error: "failed" });
        }
      },
    );

    // ICE restart — client sends this when its transport goes "disconnected".
    // Server restarts ICE on the transport and returns fresh iceParameters.
    // Client calls transport.restartIce({ iceParameters }) to re-establish connectivity.
    // This fixes NAT binding expiry on mobile (ICE-lite SFU never sends keepalives).
    socket.on(
      "MS-restart-ice",
      async (
        {
          roomId,
          userId,
          transportId,
        }: { roomId: string; userId: string; transportId: string },
        cb: (payload: any) => void,
      ) => {
        try {
          const iceParameters = await restartTransportIce(
            roomId,
            userId.toString(),
            transportId,
          );
          if (!iceParameters) {
            cb && cb({ ok: false, error: "transport-not-found" });
            return;
          }
          console.log("[MS] restart-ice", { roomId, userId, transportId });
          cb && cb({ ok: true, iceParameters });
        } catch (err) {
          console.error("MS-restart-ice error:", err);
          cb && cb({ ok: false, error: "failed" });
        }
      },
    );

    // ===========================================================================
    // ===========================================================================
    // ===========================================================================
    // ===========================  socket for video call end  ===================
    // ===========================================================================
    // ===========================================================================
    // ===========================================================================

    socket.on("initiateChat", (data) => {
      try {
        io.to(data.id).emit("newmsg", {
          msgId: data.id,
        });
      } catch (error) { }
    });
    socket.on("creategroup", (data) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          io.to(rid).emit("newgroup", {
            msgId: data._id,
          });
        });
      } catch (error) { }
    });

    socket.on("editgroup", (data) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          io.to(rid).emit("editgroup", {
            msgId: data._id,
            newData: data.newData,
          });
        });
      } catch (error) { }
    });

    socket.on("disconnect", () => {
      try {
        for (const chatId in activeChats) {
          if (activeChats[chatId].user1 === socket.id) {
            delete activeChats[chatId];
            io.to(chatId).emit("userLeft", socket.id);
            break;
          }
        }
      } catch (error) { }
    });
    socket.on("joinSelf", async (userId: any) => {
      try {
        if (userId) {
          if (!socket.rooms.has(userId)) {
            userId && socket.join(userId);
            socketUserMap.set(socket.id, userId);
          }
          const connectedUsers = io.sockets.adapter.rooms;
          try {
            const currTime = Date.now();
            const result: any = await Message.updateMany(
              {
                "deliveredTo.user": { $nin: [userId] },
              },
              {
                $push: {
                  deliveredTo: { user: userId, timestamp: currTime },
                },
              },
            );
            // Check if any documents were modified by the update operation
            if (result.modifiedCount > 0) {
              // If documents were modified, perform additional logic
              const messages = await Message.find({
                "deliveredTo.user": userId,
                "deliveredTo.timestamp": currTime,
              });
              const allmsgsendersSet = new Set<string>();

              for (const message of messages) {
                allmsgsendersSet.add(message.senderId.toString());
              }

              for (const senderId of allmsgsendersSet) {
                socket.to(senderId).emit("deliver", {
                  deliverData: { user: userId, timestamp: currTime },
                });
              }
            }
          } catch (err) {
            console.error(err);
          }
        }
      } catch (error) { }
    });
    socket.on("deliver", async (data: any) => {
      try {
        let deliveredMsg: any;
        if (data.msgId) {
          deliveredMsg = await Message.findOneAndUpdate(
            { _id: data.msgId, "deliveredTo.user": { $ne: data.userId } },
            {
              $push: {
                deliveredTo: { user: data.userId, timestamp: data.timestamp },
              },
            },
            { new: true },
          ).populate("deliveredTo.user", "name image");
          if (deliveredMsg) {
            let deliveredToAll: any;
            if (
              deliveredMsg.allRecipients.length ==
              deliveredMsg.deliveredTo.length
            ) {
              deliveredToAll = true;
              await Message.findOneAndUpdate(
                { _id: data.msgId },
                { deliveredToAll: true },
              );
            }
            socket.to(deliveredMsg.senderId.toString()).emit("deliver", {
              msgId: data.msgId,
              deliveredTo: deliveredMsg.deliveredTo,
              deliveredToAll,
            });
          }
        }
      } catch (error) { }
    });
    socket.on("read", async (data: any) => {
      try {
        let readmsg: any;
        if (data.msgId) {
          readmsg = await Message.findOneAndUpdate(
            { _id: data.msgId, "readBy.user": { $ne: data.userId } }, // Check if the user is not already in the array
            {
              $push: {
                readBy: { user: data.userId, timestamp: data.timestamp },
              },
            },
            { new: true },
          ).populate("readBy.user", "name image");
          if (readmsg) {
            let readByALL: any;
            if (readmsg.allRecipients.length == readmsg.deliveredTo.length) {
              readByALL = true;
              await Message.findOneAndUpdate(
                { _id: data.msgId },
                { readByALL: true },
              );
            }
            data.receiverId.forEach((rid: any) => {
              socket.to(rid).emit("read", {
                msgId: data.msgId,
                readData: readmsg.readBy,
                readByALL: readByALL,
              });
            });
          }
        } else {
          const messages = await Message.find({
            "readBy.user": data.userId,
            "readBy.timestamp": data.timestamp,
          });
          if (messages.length > 0) {
            const filterUser: any = messages[0].allRecipients.filter(
              (e: any) => e.toString() != data.userId.toString(),
            );
            if (filterUser && filterUser.length > 0) {
              for (const recipient of filterUser) {
                if (recipient) {
                  socket.to(recipient.toString()).emit("read", {
                    readData: {
                      user: data.userId,
                      timestamp: data.timestamp,
                    },
                  });
                }
              }
            }
            for (const message of messages) {
              let readByAll: any;
              if (message.readBy.length === message.allRecipients.length) {
                await Message.updateOne(
                  { _id: message._id },
                  { readByAll: true },
                );
                readByAll = true;
              }
            }
          }
        }
      } catch (error) { }
    });
    socket.on("typing", (data) => {
      try {
        const { userId, isTyping, receiverId, msgId } = data;
        receiverId.forEach((rid: any) => {
          socket.to(rid).emit("typing", { userId, typing: isTyping, msgId });
        });
      } catch (error) { }
    });

    socket.on("deleteMessage", (data) => {
      try {
        data.receiverId.forEach((rid: any) => {
          socket.to(rid).emit("delete-message", { data });
        });
      } catch (error) { }
    });

    socket.on("update-group", (data) => {
      try {
        socket.broadcast.emit("updated", { data: data });
      } catch (error) { }
    });

    socket.on("addremoveuser", (data) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          io.to(rid).emit("addremoveuser2", { data: data });
        });
      } catch (error) { }
    });

    // deleteGroup
    socket.on("deleteGroup", (data) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          socket.to(rid).emit("delete-Group", { data: data });
        });
      } catch (error) { }
    });

    socket.on("user_delete", (data) => {
      try {
        socket.broadcast.emit("deleted-User", { data: data.data.delete_user });
      } catch (error) { }
    });

    //user_upadate
    socket.on("user_upadate", () => {
      try {
        socket.broadcast.emit("updated-User");
      } catch (error) { }
    });

    socket.on("message", async (socketdata) => {
      try {
        if (socketdata.isGuestMeeting) {
          const data = await GuestMeetingMessage.findById(socketdata._id);
          if (data) {
            const formattedMsg = {
              ...data.toObject(),
              senderId: (data as any).senderId || data.sender,
              senderName: (data as any).senderName || data.sender,
              message: data.content,
              messageType: data.type,
              timestamp: data.createdAt,
              meetingId: data.meetingId,
              isGuestMeeting: true,
              allRecipients: [],
              deliveredTo: [],
              readBy: [],
            };
            io.to(socketdata.meetingId).emit("message", {
              data: formattedMsg,
            });
          }
          return;
        }

        let data: any = await Message.findById(socketdata._id).populate(
          "readBy.user",
          "name image",
        );
        let senderDetails = await USERS.findOne(
          { _id: socketdata.senderId },
          { password: 0 },
        );
        data = {
          ...data.toObject(),
          senderDataAll: senderDetails,
        };
        io.to(socketdata.senderId).emit("message", {
          data: data,
        });
        initializeFirebase(
          socketdata.receiverId,
          data.senderName,
          data.message,
          data.groupId,
          data.messageType,
          "",
          data.allRecipients,
          data._id,
        );

        sendWebPush.sendWebPush(
          socketdata.receiverId,
          data.senderName,
          data.message,
          data.groupId,
          data.messageType,
        );

        socketdata.receiverId.forEach((rid: any) => {
          io.to(rid).emit("message", {
            data,
          });
        });
      } catch (error) { }
    });

    socket.on("meeting_created", (data) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          io.to(rid).emit("meeting_created", { data: data });
        });
      } catch (error) { }
    });
  });
}

export function emitMessageToUsers(
  senderId: string,
  receiverIds: string[],
  data: any,
) {
  if (!ioInstance) return;

  // Sender should also receive it.
  if (senderId) {
    ioInstance.to(senderId).emit("message", { data });
  }

  receiverIds.forEach((rid) => {
    if (!rid) return;
    ioInstance?.to(rid).emit("message", { data });
  });
}

export function emitMessageToRoom(roomId: string, data: any) {
  if (!ioInstance) return;
  ioInstance.in(roomId).emit("message", { data });
}
