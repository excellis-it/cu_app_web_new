import { Router } from "express";
import serverResponse from "../helpers/serverResponse";
import authMiddleware from "../middleware/authMiddleware";
import { AddNewGroupMessage, AddUserToGroup, CreateNewGroup, DeleteGroupMessage, GetGroups, GetSingleGroupDetails, GetSingleGroupMessages, updateGroup, RemoveUserFromGroup, ReportGroup, ReportMessage, testMessage, deliverySeen, infoMessage, checkActiveCall, GetGroupsActivity, GetSingleGroupCallDetails, GetOrCreateDirectChat, AddGroupAction, CreateGuestMeeting, GetGuestMeetingByPin, GetAllGuestMeeting, UpdateGuestMeeting, AddGuestMeetingMessage, GetAllGuestMeetingMessage } from "../controller/group/msgController";
import {
  getScreenRecordingStatus,
  getScreenRecordingsList,
} from "../controller/group/screenRecordingController";
import ScreenRecording from "../db/schemas/screen-recording.schema";
import multer from "multer";
import { upload } from "../helpers/upload";
import adminMiddleware from "../middleware/adminMiddleware";
import { autoStopRecordingsForRoom, getIoInstance } from "../socket";
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

// ==============================
// Screen recording endpoints
// ==============================
groupRouter.post("/screen-recordings/init", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(
            false,
            "Screen recording upload API is disabled.",
            "Use server-side socket recording events only (BE-start-screen-recording / BE-stop-screen-recording).",
            res,
            410,
        );
    } catch (error: any) {
        serverResponse(false, "Error initializing screen recording", error.message, res);
    }
});

groupRouter.post("/screen-recordings/chunk", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(
            false,
            "Screen recording upload API is disabled.",
            "Use server-side socket recording events only (BE-start-screen-recording / BE-stop-screen-recording).",
            res,
            410,
        );
    } catch (error: any) {
        serverResponse(false, "Error uploading screen recording chunk", error.message, res);
    }
});

groupRouter.post("/screen-recordings/complete", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(
            false,
            "Screen recording upload API is disabled.",
            "Use server-side socket recording events only (BE-start-screen-recording / BE-stop-screen-recording).",
            res,
            410,
        );
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

// Legacy endpoint kept for the mobile app (late-joiner sync). Now backed by
// ScreenRecording instead of the removed CallRecording. Returns the same
// shape the mobile client already expects: { isRecording, recordingId, ... }.
groupRouter.get("/recordings/ongoing", authMiddleware, async (req: any, res: any) => {
    try {
        const groupId = req.query?.groupId;
        if (!groupId) {
            return serverResponse(false, "Missing groupId", null, res);
        }
        const active = await ScreenRecording.findOne(
            { groupId, status: "recording" },
            { _id: 1, startedBy: 1, createdAt: 1 },
        ).lean() as any;
        serverResponse(true, "Recording ongoing status fetched successfully", {
            isRecording: !!active,
            recordingId: active?._id?.toString?.() || null,
            startedBy: active?.startedBy?.toString?.() || null,
            startedAt: active?.createdAt || null,
        }, res);
    } catch (error: any) {
        serverResponse(false, "Error checking recording status", error.message, res);
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
                // Auto-stop any active recordings before ending the call
                const io = getIoInstance();
                if (io) {
                    await autoStopRecordingsForRoom(roomId, io);
                }

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
