import { Router } from "express";
import serverResponse from "../helpers/serverResponse";
import authMiddleware from "../middleware/authMiddleware";
import { AddNewGroupMessage, AddUserToGroup, CreateNewGroup, DeleteGroupMessage, GetGroups, GetSingleGroupDetails, GetSingleGroupMessages, updateGroup, RemoveUserFromGroup, ReportGroup, ReportMessage, testMessage, deliverySeen, infoMessage, checkActiveCall, GetGroupsActivity, GetSingleGroupCallDetails, GetOrCreateDirectChat, AddGroupAction, CreateGuestMeeting, GetGuestMeetingByPin, GetAllGuestMeeting, UpdateGuestMeeting, AddGuestMeetingMessage, GetAllGuestMeetingMessage } from "../controller/group/msgController";
import {
  completeRecordingUpload,
  getRecordingStatus,
  initRecordingUpload,
  uploadRecordingChunk,
} from "../controller/group/recordingController";
import {
  initScreenRecording,
  uploadScreenRecordingChunk,
  completeScreenRecording,
  getScreenRecordingStatus,
  getScreenRecordingsList,
} from "../controller/group/screenRecordingController";
import multer from "multer";
import { upload } from "../helpers/upload";
import adminMiddleware from "../middleware/adminMiddleware";
const groupRouter = Router();
const storage = multer.memoryStorage();
const uploadFile = multer({ storage: storage });

// NEW: Get or create a direct (1:1) chat with another user
groupRouter.post("/direct", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Direct chat retrieved successfully", await GetOrCreateDirectChat(req.body.targetUserId, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error getting direct chat", error.message, res);
    }
});

groupRouter.post("/create", authMiddleware, uploadFile.single('file'), async (req: any, res: any) => {
    try {
        serverResponse(true, "Group created successfully", await CreateNewGroup(req.body, req.file, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error creating group", error.message, res);
    }
});

groupRouter.get("/guest-meeting/getall", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Guest Meeting details fetched successfully", await GetAllGuestMeeting(req), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching guest meeting details", error, res);
    }
});

// NEW: Get guest meeting details by PIN (Public access)
groupRouter.get("/guest-meeting", async (req: any, res: any) => {
    try {
        serverResponse(true, "Guest Meeting details fetched successfully", await GetGuestMeetingByPin(req.query.pin, req.query.email), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching guest meeting details", error.message, res);
    }
});

groupRouter.post("/create-guest-meeting", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Guest Meeting created successfully", await CreateGuestMeeting(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error creating guest meeting", error.message, res);
    }
});

groupRouter.post("/update-guest-meeting", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Guest Meeting updated successfully", await UpdateGuestMeeting(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error updating guest meeting", error.message, res);
    }
});

groupRouter.post("/add-guest-message", async (req: any, res: any) => {
    try {
        serverResponse(true, "Guest Message added successfully", { data: await AddGuestMeetingMessage(req.body) }, res);
    } catch (error: any) {
        serverResponse(false, "Error adding guest Message", error.message, res);
    }
});

groupRouter.get("/get-guest-messages", async (req: any, res: any) => {
    try {
        serverResponse(true, "Guest Messages fetched successfully", await GetAllGuestMeetingMessage(req), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching guest Messages", error.message, res);
    }
});

groupRouter.post("/upload-image", authMiddleware, uploadFile.single('file'), async (req: any, res: any) => {
    try {
        serverResponse(true, "Group updated successfully", await upload(req.file), res);
    } catch (error: any) {
        serverResponse(false, "Error updating group", error.message, res);
    }
});

groupRouter.post("/update-group", authMiddleware, uploadFile.single('file'), async (req: any, res: any) => {
    try {
        serverResponse(
            true,
            "Group updated successfully",
            await updateGroup(
                req.body.groupId,
                req.body.groupName,
                req.body.groupDescription,
                req.file,
                req.body.meetingStartTime,
                req.body.meetingEndTime
            ),
            res
        );
    } catch (error: any) {
        serverResponse(false, "Error updating group", error.message, res);
    }
});

groupRouter.post("/adduser", adminMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "User added successfully", await AddUserToGroup(req.body), res);
    } catch (error: any) {
        serverResponse(false, "Error adding user", error.message, res);
    }
})
groupRouter.post("/removeuser", adminMiddleware, async (req: any, res: any) => {
    try {

        serverResponse(true, "User added successfully", await RemoveUserFromGroup(req.body), res);
    } catch (error: any) {
        serverResponse(false, "Error removing user", error.message, res);
    }
})

groupRouter.get("/getall", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Groups fetched successfully", await GetGroups(req.user, {
            searchQuery: req.query.searchQuery,
            limit: req.query.limit,
            offset: req.query.skip,
            slug: req.query.slug,
            filter: req.query.filter
        }, req), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching groups", error.message, res);
    }
});

groupRouter.get("/getallmeetings", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Meetings fetched successfully", await GetGroups(req.user, {
            searchQuery: req.query.searchQuery,
            limit: req.query.limit,
            offset: req.query.skip,
            slug: 'meeting',
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            _id: req.query._id,
            pin: req.query.pin
        }, req), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching meetings", error.message, res);
    }
});

groupRouter.get("/getall/Activity", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Group activity fetched successfully", await GetGroupsActivity(req.user, req.query.searchQuery, req.query.limit, req.query.skip, req), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching groups", error.message, res);
    }
});

groupRouter.get("/get-group-details", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Groups fetched successfully", await GetSingleGroupDetails(req.query.id), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching groups", error.message, res);
    }
});

groupRouter.get("/get-group-call-details", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Groups fetched successfully", await GetSingleGroupCallDetails(req.query.id), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching groups", error.message, res);
    }
});

groupRouter.post("/getonegroup", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Groups fetched successfully", await GetSingleGroupMessages(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching groups", error.message, res);
    }
});

groupRouter.post("/addnewmsg", authMiddleware, uploadFile.single('file'), async (req: any, res: any) => {
    try {

        serverResponse(true, "Groups fetched successfully", await AddNewGroupMessage(req.body, req.user, req.file), res);
    } catch (error: any) {
        serverResponse(false, "Error adding message", error.message, res);
    }
});

groupRouter.post("/deletemsg", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Groups fetched successfully", await DeleteGroupMessage(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error adding message", error.message, res);
    }
})
groupRouter.post("/report", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Group reported successfully", await ReportGroup(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error adding report", error.message, res);
    }
});
groupRouter.post("/report-message", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Message reported successfully", await ReportMessage(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error adding report", error.message, res);
    }
});

groupRouter.post("/info-message", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Message info fetched successfully", await infoMessage(req.body, req), res);
    } catch (error: any) {
        serverResponse(false, "Error adding report", error.message, res);
    }
});

groupRouter.post("/test/firebase", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Message send successfully", await testMessage(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error adding report", error.message, res);
    }
});

groupRouter.get("/check-active-call", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Call status retrieved successfully", await checkActiveCall(req.query.group_id, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error checking call status", error.message, res);
    }
});

groupRouter.get("/deliveried", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Message send successfully", await deliverySeen(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error adding report", error.message, res);
    }
});

// ========================
// Call recording endpoints
// ========================
groupRouter.post("/recordings/init", authMiddleware, async (req: any, res: any) => {
    try {
        // eslint-disable-next-line no-console
        console.log("[routes] POST /groups/recordings/init", {
            roomId: req?.body?.roomId,
            recordingId: req?.body?.recordingId,
            userId: req?.user?._id?.toString?.(),
        });
        serverResponse(true, "Recording upload initialized successfully", await initRecordingUpload(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error initializing recording upload", error.message, res);
    }
});

groupRouter.post("/recordings/chunk", authMiddleware, uploadFile.single("chunk"), async (req: any, res: any) => {
    try {
        // eslint-disable-next-line no-console
        console.log("[routes] POST /groups/recordings/chunk", {
            roomId: req?.body?.roomId,
            recordingId: req?.body?.recordingId,
            uploadSessionId: req?.body?.uploadSessionId,
            chunkIndex: req?.body?.chunkIndex,
            userId: req?.user?._id?.toString?.(),
            chunkSize: req?.file?.buffer?.length || 0,
        });
        serverResponse(true, "Recording chunk uploaded successfully", await uploadRecordingChunk(req.body, req.user, req.file), res);
    } catch (error: any) {
        serverResponse(false, "Error uploading recording chunk", error.message, res);
    }
});

groupRouter.post("/recordings/complete", authMiddleware, async (req: any, res: any) => {
    try {
        // eslint-disable-next-line no-console
        console.log("[routes] POST /groups/recordings/complete", {
            roomId: req?.body?.roomId,
            recordingId: req?.body?.recordingId,
            totalChunks: req?.body?.totalChunks,
            durationSec: req?.body?.durationSec,
            userId: req?.user?._id?.toString?.(),
        });
        serverResponse(true, "Recording upload completed successfully", await completeRecordingUpload(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error completing recording upload", error.message, res);
    }
});

groupRouter.get("/recordings/status", authMiddleware, async (req: any, res: any) => {
    try {
        // eslint-disable-next-line no-console
        console.log("[routes] GET /groups/recordings/status", {
            roomId: req?.query?.roomId,
            recordingId: req?.query?.recordingId,
            userId: req?.user?._id?.toString?.(),
        });
        serverResponse(true, "Recording status fetched successfully", await getRecordingStatus(req.query, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching recording status", error.message, res);
    }
});

// ==============================
// Screen recording endpoints
// ==============================
groupRouter.post("/screen-recordings/init", authMiddleware, async (req: any, res: any) => {
    try {
        console.log("[routes] POST /groups/screen-recordings/init", {
            groupId: req?.body?.groupId,
            userId: req?.user?._id?.toString?.(),
        });
        serverResponse(true, "Screen recording initialized successfully", await initScreenRecording(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error initializing screen recording", error.message, res);
    }
});

groupRouter.post("/screen-recordings/chunk", authMiddleware, uploadFile.single("chunk"), async (req: any, res: any) => {
    try {
        console.log("[routes] POST /groups/screen-recordings/chunk", {
            groupId: req?.body?.groupId,
            recordingId: req?.body?.recordingId,
            chunkIndex: req?.body?.chunkIndex,
            chunkSize: req?.file?.buffer?.length || 0,
        });
        serverResponse(true, "Screen recording chunk uploaded successfully", await uploadScreenRecordingChunk(req.body, req.user, req.file), res);
    } catch (error: any) {
        serverResponse(false, "Error uploading screen recording chunk", error.message, res);
    }
});

groupRouter.post("/screen-recordings/complete", authMiddleware, async (req: any, res: any) => {
    try {
        console.log("[routes] POST /groups/screen-recordings/complete", {
            groupId: req?.body?.groupId,
            recordingId: req?.body?.recordingId,
            totalChunks: req?.body?.totalChunks,
            durationSec: req?.body?.durationSec,
        });
        serverResponse(true, "Screen recording completed successfully", await completeScreenRecording(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error completing screen recording", error.message, res);
    }
});

groupRouter.get("/screen-recordings/status", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Screen recording status fetched successfully", await getScreenRecordingStatus(req.query, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching screen recording status", error.message, res);
    }
});

groupRouter.get("/screen-recordings/list", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Screen recordings fetched successfully", await getScreenRecordingsList(req.query, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching screen recordings", error.message, res);
    }
});

// Handle browser unload events to mark the user as left
groupRouter.post("/user-left-call", async (req: any, res: any) => {
    try {
        const { roomId, userId } = req.body;

        if (!roomId || !userId) {
            return res.status(400).send({ success: false, message: "Missing required parameters" });
        }

        const VideoCall = require('../db/schemas/videocall.schema').default;

        // Update user status to left
        await VideoCall.updateOne(
            {
                groupId: roomId,
                "userActivity.user": userId,
                "userActivity.status": "joined"
            },
            {
                $set: {
                    "userActivity.$.status": "left",
                    "userActivity.$.leftAt": new Date()
                }
            }
        );

        // Check if call should be ended (no active participants)
        const activeCall = await VideoCall.findOne({ groupId: roomId, status: "active" });
        if (activeCall) {
            const remainingActive = activeCall.userActivity.filter(
                (activity: any) => activity.status === "joined"
            );

            if (remainingActive.length === 0) {
                await VideoCall.updateOne(
                    { _id: activeCall._id },
                    { $set: { status: "ended", endedAt: new Date() } }
                );
            }
        }

        // Return success response, though client may not process it
        return res.status(200).send({ success: true });
    } catch (error: any) {
        console.error("Error handling user left call:", error);
        // Still return success since browser is unloading anyway
        return res.status(200).send({ success: false });
    }
});

groupRouter.post("/group-action", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "Group action added successfully", await AddGroupAction(req.body, req.user), res);
    } catch (error: any) {
        serverResponse(false, "Error adding group action", error.message, res);
    }
});

export default groupRouter;
