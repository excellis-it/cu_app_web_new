// Message controller with guest meeting support
import Group from "../../db/schemas/group.schema";
import Message from "../../db/schemas/message.schema";
import Report from "../../db/schemas/report.schema";
import USERS from "../../db/schemas/users.schema";
import VideoCall from "../../db/schemas/videocall.schema";
import initializeFirebase from "../../helpers/firebase";
import sendWebPush from '../../helpers/webpush'
import { upload } from "../../helpers/upload";
import GroupAction from "../../db/schemas/group.action.schema";
import GuestMeeting from "../../db/schemas/guest-meeting.schema";
const mongoose = require("mongoose");
const GmailMailer = require("../../helpers/gmailer");
import { createCalendarEvent, updateCalendarEvent } from "../../helpers/googleCalendar.helper";
import GuestMeetingMessage from "../../db/schemas/guest-meeting-message.schema";

interface GetGroupsOptions {
  searchQuery?: string;
  limit?: number;
  offset?: number;
  groupType?: string;
  slug?: string;
  startDate?: string;
  endDate?: string;
  _id?: string;
  pin?: string;
  filter?: string;
}

export async function GetGroups(user: any, options: GetGroupsOptions = {}, req: any) {
  // ... (existing code for GetGroups)
  const {
    searchQuery = '',
    limit = undefined,
    offset = 0,
    groupType = 'group',
    slug = 'group',
    startDate,
    endDate,
    _id,
    pin,
    filter
  } = options;
  try {
    const query: any = {
      currentUsers: { $in: [user._id] },
    };

    // Search by ID or PIN
    if (_id) {
      query._id = _id;
    } else if (pin) {
      query.pin = pin;
    }

    // Add search functionality
    if (searchQuery) {
      query.$or = [
        { groupName: { $regex: new RegExp(searchQuery, "i") } },
        // Add more fields for search if needed
      ];
    }

    // Filter by group type - use isTemp field to distinguish between groups and meetings
    if (slug === 'meeting') {
      query.isTemp = true;
      query.meetingStartTime = { $exists: true, $ne: null };

      // Add date range filtering for meetings
      if (startDate && endDate) {
        query.meetingStartTime = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      } else if (startDate) {
        query.meetingStartTime = { $gte: new Date(startDate) };
      } else if (endDate) {
        query.meetingStartTime = { $lte: new Date(endDate) };
      }
    } else {
      query.isTemp = false;
    }

    // Build sort criteria
    const sortCriteria: any = slug === 'meeting'
      ? { meetingStartTime: -1 } // Sort meetings by meetingStartTime ASCENDING for calendar
      : { updatedAt: -1 };

    // Optimization: Pre-process simple filters into the main query
    // This allows us to filter BEFORE the expensive lookup and pagination
    if (filter === 'favorite') {
      query.isFavorite = true;
    } else if (filter === 'groups') {
      query.isTemp = false;
      query.isDirect = { $ne: true };
    }

    // Start building the pipeline
    const pipeline: any[] = [
      { $match: query }
    ];

    // CRITICAL OPTIMIZATION:
    // If we are NOT filtering by 'unread' (which requires the lookup first),
    // we should paginate (Sort -> Skip -> Limit) BEFORE the expensive lookup.
    // This means we only calculate unread counts for the 16 items on the current page,
    // instead of calculation for ALL 1000+ items and then throwing most away.
    if (filter !== 'unread') {
      pipeline.push({ $sort: sortCriteria });
      pipeline.push({ $skip: Number(offset) || 0 });
      if (limit !== undefined) {
        pipeline.push({ $limit: Number(limit) });
      }
    }

    // Add the expensive lookup for unread messages
    pipeline.push(
      {
        $lookup: {
          from: "messages",
          let: { groupId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$groupId", "$$groupId"] },
                    { $not: { $in: [user._id, "$readBy.user"] } }
                  ]
                },
              },
            },
            {
              $count: "count",
            }
          ],
          as: "unreadMessages",
        }
      },
      {
        $addFields: {
          unreadCount: {
            $cond: {
              if: { $gt: [{ $size: "$unreadMessages" }, 0] },
              then: { $arrayElemAt: ["$unreadMessages.count", 0] },
              else: 0
            }
          }
        }
      },
      {
        $addFields: {
          isGroup: {
            $and: [
              { $eq: ["$isTemp", false] },     // Not a meeting
              { $ne: ["$isDirect", true] }      // Not a direct/1:1 chat
            ]
          }
        }
      },
      {
        $project: {
          unreadMessages: 0
        }
      }
    );

    // Apply 'unread' filter if needed
    // In this case, we couldn't paginate early, so we filter then paginate
    if (filter === 'unread') {
      pipeline.push({
        $match: {
          unreadCount: { $gt: 0 }
        }
      });
      pipeline.push({ $sort: sortCriteria });
      pipeline.push({ $skip: Number(offset) || 0 });
      if (limit !== undefined) {
        pipeline.push({ $limit: Number(limit) });
      }
    }

    // Execute the optimized pipeline
    const groups = await Group.aggregate(pipeline).allowDiskUse(true);

    const populatedGroups = await Promise.all(
      groups.map(async (group: any) => {
        const temp = [...group.currentUsers];
        await Group.populate(group, {
          path: "currentUsers",
          select: "_id name phone image email userType", // Add the fields you want in currentUsersId
          model: "users", // Assuming User is the model name for the users
        });
        let lastMessage = null;
        let unreadCount = 0;
        let Video_call_details = null;
        let userAction = null;

        // Optimize: Skip expensive message/call lookups for bulk meeting fetches
        if (slug !== 'meeting') {
          lastMessage = await Message.findOne({
            groupId: group._id,
            deletedBy: { $nin: [user._id] },
          })
            .sort({ timestamp: -1 })
            .populate({
              path: "senderId", select: "_id name",
              model: "users",
            })
            .exec();

          unreadCount = await Message.countDocuments({
            groupId: group._id,
            "readBy.user": { $ne: user._id },
          });

          Video_call_details = await VideoCall.findOne({
            groupId: group._id,
          }).sort({ createdAt: -1 }).exec();
        }

        // Fetch user action for this meeting/group - Needed for meetings too
        userAction = await GroupAction.findOne({
          groupId: group._id,
          userId: user._id
        }).exec();

        return {
          ...group,
          currentUsersId: temp,
          lastMessage: lastMessage || null,
          unreadCount: unreadCount,
          Video_call_details: Video_call_details || null,
          userAction: userAction || null,
        };
      })
    );

    let GuestMeeting = null;
    if (slug === 'meeting') {
      GuestMeeting = await GetAllGuestMeeting(req);
    }

    return populatedGroups;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
export async function GetOrCreateDirectChat(targetUserId: string, currentUser: any) {
  try {
    if (!targetUserId) {
      throw new Error("Target user ID is required");
    }

    // Check if target user exists
    const targetUser: any = await USERS.findById(targetUserId);
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    // Can't chat with yourself
    if (targetUserId === currentUser._id.toString()) {
      throw new Error("Cannot create a direct chat with yourself");
    }

    // Find existing direct chat between these two users
    const existingChat = await Group.findOne({
      isDirect: true,
      currentUsers: {
        $all: [currentUser._id, new mongoose.Types.ObjectId(targetUserId)],
        $size: 2
      }
    }).populate("currentUsers", "_id name phone image email userType");

    if (existingChat) {
      // Return existing chat with last message info
      const lastMessage = await Message.findOne({
        groupId: existingChat._id,
        deletedBy: { $nin: [currentUser._id] },
      })
        .sort({ timestamp: -1 })
        .populate({ path: "senderId", select: "_id name", model: "users" })
        .exec();

      const unreadCount = await Message.countDocuments({
        groupId: existingChat._id,
        "readBy.user": { $ne: currentUser._id },
      });

      return {
        ...existingChat.toObject(),
        currentUsersId: [currentUser._id.toString(), targetUserId],
        lastMessage: lastMessage || null,
        unreadCount: unreadCount,
        isNew: false
      };
    }

    // Create new direct chat - use target user's name as group name
    const newDirectChat = new Group({
      groupName: targetUser.name, // Will be replaced with actual user name on frontend
      currentUsers: [currentUser._id, new mongoose.Types.ObjectId(targetUserId)],
      admins: [currentUser._id, new mongoose.Types.ObjectId(targetUserId)], // Both are admins in 1:1
      isDirect: true,
      isTemp: false,
      createdBy: currentUser._id,
    });

    await newDirectChat.save();

    // Populate the users before returning
    await newDirectChat.populate("currentUsers", "_id name phone image email userType");

    return {
      ...newDirectChat.toObject(),
      currentUsersId: [currentUser._id.toString(), targetUserId],
      lastMessage: null,
      unreadCount: 0,
      isNew: true
    };
  } catch (error: any) {
    console.error("Error in GetOrCreateDirectChat:", error);
    throw new Error(error.message);
  }
}
export async function GetGroupsActivity(
  user: any,
  searchQuery: string,
  limit: number | 1000,
  offset: number = 0,
  req: import('express').Request
) {
  try {

    let conditions: any = {};
    let and_clauses = [];
    and_clauses.push({ "groupDetails.currentUsers": { $in: [user._id] } });
    conditions['$and'] = and_clauses;

    let aggregate = VideoCall.aggregate([
      {
        $lookup: {
          "from": "groups",
          "let": { groupId: "$groupId" },
          "pipeline": [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $convert: { input: "$_id", to: "string" } }, "$$groupId"] },
                    { $in: [user._id, "$currentUsers"] }

                  ]
                }
              }
            },
            {
              $project: {
                _id: "$_id",
                groupName: "$groupName",
                groupDescription: "$groupDescription",
                groupImage: "$groupImage",
                currentUsers: "$currentUsers",
                serial_key: "$serial_key",
              }
            }
          ],
          "as": "groupDetails"
        }
      },
      { "$unwind": "$groupDetails" },
      {
        $addFields: {
          missedCalled: {
            $cond: {
              if: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: "$userActivity",
                        as: "activity",
                        cond: {
                          $eq: ["$$activity.user", new mongoose.Types.ObjectId(user._id)]
                        }
                      }
                    }
                  },
                  0
                ]
              },
              then: false,
              else: true
            }
          },



        }
      },
      {
        $addFields: {
          myActivity: {
            $first: {
              $filter: {
                input: "$userActivity",
                as: "activity",
                cond: { $eq: ["$$activity.user", user._id] }
              }
            }
          }
        }
      },
      {
        $addFields: {
          callStatus: {
            $cond: {
              if: {
                $eq: [
                  { $toDate: "$myActivity.joinedAt" },
                  {
                    $min: {
                      $map: {
                        input: "$userActivity",
                        as: "a",
                        in: { $toDate: "$$a.joinedAt" }
                      }
                    }
                  }
                ]
              },
              then: "outgoing",
              else: "incoming"
            }
          },
          callDurationInMinutes: {
            $round: [
              {
                $divide: [
                  {
                    $subtract: [
                      { $toDate: "$myActivity.leftAt" },
                      { $toDate: "$myActivity.joinedAt" }
                    ]
                  },
                  1000 * 60 // milliseconds to minutes
                ]
              },
              2 // round to 2 decimal places
            ]
          }
        }
      },
      {
        $project: {
          myActivity: 0 // optional: remove temp field from output
        }
      },
      { $match: conditions },
      {
        $sort: { "createdAt": -1 } // Sort by group name and createdAt
      },
      {
        $project: {
          createdAt: 0,
          updatedAt: 0,
          userActivity: 0,
        }
      },

    ]);

    // If page is provided, calculate skip. Otherwise use offset.
    // Ensure perPage is a valid number.
    const normalizedPage = Math.max(parseInt(req.query.page as string || '0'), 1);
    const normalizedLimit = parseInt(req.query.per_page as string || '0') || Number(limit) || 10;

    // If offset is explicitly provided (and not just default 0 from function param), use it.
    // Otherwise calculate from page.
    let skip = Number(offset);
    if (req.query.page) {
      skip = (normalizedPage - 1) * normalizedLimit;
    }

    // Add $skip and $limit to the aggregation pipeline
    // Important: $skip and $limit must be numbers, not strings
    aggregate.pipeline().push({ $skip: skip }, { $limit: normalizedLimit });
    const allUsers = await aggregate.exec();
    return allUsers;


  } catch (error) {
    console.error(error);
    throw error;
  }
}
export async function GetSingleGroupDetails(id: any) {
  try {
    const group = await Group.findById(id)
      .populate("currentUsers", "name phone image userType email")
      .exec();

    if (!group) return null;

    const actions = await GroupAction.find({ groupId: new mongoose.Types.ObjectId(id) }).exec();

    return {
      ...group.toObject(),
      participantActions: actions
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
}
export const GetSingleGroupMessages = async (data: any, user: any) => {
  try {
    const groupId = new mongoose.Types.ObjectId(data.id);

    // Run mark-as-read in parallel (fire and forget - don't wait for it)
    // This significantly speeds up the response time
    Message.updateMany(
      {
        groupId: data.id,
        "readBy.user": { $nin: [user._id] },
      },
      {
        $push: {
          readBy: { user: user._id, timestamp: data.timestamp },
        },
      }
    ).exec().catch(err => console.error("Error marking messages as read:", err));

    // Optimized aggregation pipeline with early $project to reduce data transfer
    const groups = await Message.aggregate([
      {
        $match: {
          groupId: groupId,
          deletedBy: { $nin: [user._id] },
        },
      },
      {
        $lookup: {
          from: "groups",
          localField: "groupId",
          foreignField: "_id",
          as: "groupDetails"
        }
      },
      {
        $unwind: "$groupDetails"
      },

      {
        $lookup: {
          from: "users",
          let: { senderId: "$senderId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$_id", "$$senderId"],
                },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                phone: 1,
                image: 1,
                userType: 1,
                email: 1,
              },
            },
          ],
          as: "currentUsersId",
        },
      },
      {
        $sort: { createdAt: -1 }, // Uses compound index: groupId + createdAt
      },
      {
        $skip: data.offset || 0,
      },
      {
        $limit: data.limit || 50,
      },
      // Project only needed fields early to reduce memory usage
      {
        $project: {
          groupId: 1,
          senderId: 1,
          currentUsers: "$groupDetails.currentUsers",
          currentUsersId: 1,
          senderName: 1,
          message: 1,
          fileName: 1,
          messageType: 1,
          replyOf: 1,
          forwarded: 1,
          allRecipients: 1,
          deliveredTo: 1,
          readBy: 1,
          deletedBy: 1,
          timestamp: 1,
          createdAt: 1,
          serial_key: 1,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "senderId",
          foreignField: "_id",
          pipeline: [
            { $project: { _id: 1, name: 1, image: 1 } } // Only get needed fields
          ],
          as: "senderDataAll",
        },
      },
      {
        $unwind: { path: "$senderDataAll", preserveNullAndEmptyArrays: true },
      },
      // Skip the expensive readBy lookup for initial load - not critical for display
      // The readBy data is already in the document, we don't need to populate user details
      {
        $sort: { createdAt: 1 }, // Final sort for chronological order
      },
    ]).allowDiskUse(true);
    return groups;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
function normalizeToArray(input: any): string[] {
  if (Array.isArray(input)) {
    return input.map((id: any) => id.toString());
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return parsed.map((id: any) => id.toString());
      } else {
        return [parsed.toString()]; // single string like '6850fb1fe60613461d6817ec'
      }
    } catch (err) {
      return [input.toString()];
    }
  }
  return [input.toString()];
}
function generateRandomNumber(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
export async function CreateNewGroup(data: any, groupImage: any, user: any) {
  try {
    const { groupName, users } = data;
    var isMeetingGroup = data?.isTemp === true || data?.isTemp === "true";
    if (!data.admins || data.admins == 'undefined') data.admins = [user._id];

    data.users = normalizeToArray(users);

    data.admins = normalizeToArray(data.admins || user._id);
    if (groupImage) {
      let imageURL = await upload(groupImage);
      data.groupImage = imageURL;
    }
    // Find the contact by its ID
    const existingGroup: any = await Group.findOne({ groupName });

    if (isMeetingGroup) {
      const now = new Date();

      if (!data.meetingStartTime || !data.meetingEndTime) {
        throw new Error("Meeting start time and end time are required for a meeting group.");
      }

      const meetingStart = new Date(data.meetingStartTime);
      const meetingEnd = new Date(data.meetingEndTime);

      if (meetingStart < now) {
        throw new Error("Meeting start time must be greater than or equal to the current time.");
      }

      if (meetingEnd <= meetingStart) {
        throw new Error("Meeting end time must be greater than the start time.");
      }
    } else {
      if (existingGroup) {
        throw new Error("Group already exists");
      }
    }

    const superAdmin: any = await USERS.findOne({ userType: "SuperAdmin" });
    if (!data.users.includes(superAdmin._id.toString()))
      data.users.push(superAdmin._id.toString());
    if (user.userType == 'admin' && !data.users.includes(user._id.toString())) {
      data.users.push(user._id.toString());
    }
    if (user.userType == 'admin' && !data.admins.includes(user._id.toString())) {
      data.admins.push(user._id.toString());
    }
    if (!data.admins.includes(superAdmin._id.toString()))
      data.admins.push(superAdmin._id.toString());
    const pin = generateRandomNumber();
    const groupId = new mongoose.Types.ObjectId();
    const newGroup = new Group({
      _id: groupId,
      groupName,
      currentUsers: data.users,
      admins: [...data.admins],
      groupImage: data.groupImage,
      groupDescription: data.groupDescription,
      createdBy: user._id,
      createdByTimeZone: data.createdByTimeZone ? data.createdByTimeZone : "UTC",
      isTemp: data?.isTemp ? data.isTemp : false,
      meetingStartTime: data.meetingStartTime ? data.meetingStartTime : null,
      meetingEndTime: data.meetingEndTime ? data.meetingEndTime : null,
      pin: pin,
      link: `${process.env.FRONTEND_LINK}/messages?pin=${pin}&groupId=${groupId}`
    });

    const new_group = await newGroup.save();

    // Sync to Google Calendar if it's a meeting
    if (isMeetingGroup) {
      try {
        const eventDetails = {
          summary: `📅 ${groupName}`,
          description: data.groupDescription || 'ExTalk Meeting',
          startTime: data.meetingStartTime,
          endTime: data.meetingEndTime,
          timeZone: data.createdByTimeZone || 'UTC'
        };

        // Attempt to create event in Google Calendar
        // helper handles check if user is connected
        const googleEvent = await createCalendarEvent(user._id, eventDetails);

        if (googleEvent && googleEvent.id) {
          await Group.findByIdAndUpdate(new_group._id, {
            googleEventId: googleEvent.id
          });
          // Update local object so it's returned correctly
          new_group.googleEventId = googleEvent.id;
        }
      } catch (err: any) {
        console.log("Google Calendar sync skipped/failed:", err.message);
      }
    }

    let readBy = [{ user: user._id, timestamp: Date.now() }];
    let deliveredTo = [{ user: user._id, timestamp: Date.now() }];
    const newMessage: any = {
      groupId: newGroup._id,
      senderId: user._id,
      senderName: user.name,
      // receiverId,
      message: "created",
      allRecipients: data.users,
      messageType: "created",
      readBy,
      deliveredTo,
      isTemp: data?.isTemp ? data.isTemp : false,
    };
    await Message.create(newMessage);

    // send push notification to all users in the group
    if (isMeetingGroup) {
      const recipientIds = data.users.filter((userId: string) => userId !== user._id.toString());

      if (recipientIds.length > 0) {
        const sendData = {
          receiverId: recipientIds,
          senderName: user.name,
          message: `${groupName} : meeting scheduled`,
          groupId: newGroup._id.toString(),
          messageType: "meeting_created"
        };

        var sendPush = sendPushNotification(sendData);
      }
    }


    return newGroup;
  } catch (error: any) {
    throw new Error(error);
  }
}
export async function CreateGuestMeeting(data: any, user: any) {
  const session = await mongoose.startSession();

  try {
    // Start transaction
    session.startTransaction();

    const {
      guestName,
      guestEmail,
      groupName: topic,
      meetingStartTime,
      meetingEndTime,
      groupDescription
    } = data;

    // Support both single guest (legacy) and multiple guests
    let guests = [];

    if (data.guests && Array.isArray(data.guests)) {
      // New format: multiple guests
      guests = data.guests;
    } else if (guestName && guestEmail) {
      // Legacy format: single guest
      guests = [{ name: guestName, email: guestEmail }];
    }

    // Validate guests
    if (!guests || guests.length === 0) {
      throw new Error("At least one guest is required");
    }

    // Validate each guest has name and email
    for (const guest of guests) {
      if (!guest.name || !guest.email) {
        throw new Error("Each guest must have a name and email");
      }
    }

    // Basic validity checks
    if (!topic || !meetingStartTime || !meetingEndTime) {
      throw new Error("Missing required guest meeting fields");
    }

    const pin = generateRandomNumber();

    // Create new GuestMeeting within transaction
    const newGuestMeeting = new GuestMeeting({
      topic: topic,
      description: groupDescription,
      guest: guests, // Use the guest array
      startTime: meetingStartTime,
      endTime: meetingEndTime,
      hostId: user._id,
      pin: pin,
      meetingLink: `${process.env.FRONTEND_LINK}/guest-meeting`,
      status: 'scheduled'
    });

    // Save meeting within the transaction
    const savedMeeting = await newGuestMeeting.save({ session });

    // Sync to Google Calendar
    if (user.googleTokens) {
      try {
        const eventDetails = {
          summary: `📅 ${topic}`,
          description: groupDescription || 'ExTalk Guest Meeting',
          startTime: meetingStartTime,
          endTime: meetingEndTime,
          timeZone: data.createdByTimeZone || 'UTC'
        };

        const googleEvent = await createCalendarEvent(user._id, eventDetails);

        if (googleEvent && googleEvent.id) {
          (savedMeeting as any).googleEventId = googleEvent.id;
          // Save the updated googleEventId within the same transaction
          await savedMeeting.save({ session });
        }
      } catch (bookingErr: any) {
        console.log("Google Calendar sync skipped/failed for Guest Meeting:", bookingErr.message);
      }
    } else {
      console.log("User not connected to Google Calendar, skipping event creation");
    }

    // Send email to each guest
    const emailSubject = `📅 Meeting Invitation: ${topic}`;
    const fromEmail = user.email || process.env.GMAIL_USER || 'noreply@extalk.com';

    const emailPromises = guests.map(async (guest: { name: string; email: string }) => {
      const emailData = {
        guestName: guest.name,
        hostName: user.name,
        hostEmail: user.email,
        topic: topic,
        description: groupDescription || '',
        startTime: meetingStartTime,
        endTime: meetingEndTime,
        pin: pin,
        meetingLink: savedMeeting.meetingLink
      };

      try {
        await GmailMailer.sendMail(
          fromEmail,
          guest.email,
          emailSubject,
          'guest-meeting',
          emailData
        );
      } catch (emailError: any) {
        console.error(`Failed to send email to ${guest.email}:`, emailError);
        throw new Error(`Failed to send meeting invitation to ${guest.email}: ${emailError.message || emailError}`);
      }
    });

    try {
      // Send all emails
      await Promise.all(emailPromises);

      // Commit transaction if all emails sent successfully
      await session.commitTransaction();

    } catch (emailError: any) {
      // Abort transaction - automatic rollback
      await session.abortTransaction();

      // Throw error to inform the caller
      throw new Error(`Failed to send meeting invitation email: ${emailError.message || emailError}`);
    }

    return savedMeeting;

  } catch (error: any) {
    // Abort transaction on any error
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw new Error(error.message || error);
  } finally {
    // End session
    session.endSession();
  }
}
export async function UpdateGuestMeeting(data: any, user: any) {
  try {
    // Build update object with only allowed fields
    const updateFields: any = {};
    if (data.topic !== undefined) updateFields.topic = data.topic;
    if (data.description !== undefined) updateFields.description = data.description;

    // Handle guest array update if provided
    if (data.guests && Array.isArray(data.guests)) {
      updateFields.guest = data.guests;
    }
    // Legacy support
    else if (data.guestName && data.guestEmail) {
      updateFields.guest = [{ name: data.guestName, email: data.guestEmail }];
    }

    if (data.startTime !== undefined) updateFields.startTime = data.startTime;
    if (data.endTime !== undefined) updateFields.endTime = data.endTime;
    if (data.status !== undefined) updateFields.status = data.status;

    const originalMeeting = await GuestMeeting.findById(data._id);
    if (!originalMeeting) {
      throw new Error('Meeting not found');
    }

    const updatedMeeting = await GuestMeeting.findByIdAndUpdate(
      data._id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedMeeting) {
      throw new Error('Meeting not found during update');
    }

    // Update Google Calendar if connected and event exists
    if (user.googleTokens && (updatedMeeting as any).googleEventId) {
      try {
        const eventDetails = {
          summary: `📅 ${updatedMeeting.topic}`,
          description: updatedMeeting.description || 'ExTalk Guest Meeting',
          startTime: updatedMeeting.startTime,
          endTime: updatedMeeting.endTime,
          timeZone: data.createdByTimeZone || 'UTC'
        };

        await updateCalendarEvent(user._id, (updatedMeeting as any).googleEventId, eventDetails);
        console.log(`Updated Google Calendar event ${(updatedMeeting as any).googleEventId} for meeting ${updatedMeeting._id}`);
      } catch (calParamErr: any) {
        console.log("Google Calendar update skipped/failed:", calParamErr.message);
      }
    }

    return updatedMeeting;
  } catch (error: any) {
    throw new Error(error.message || error);
  }
}
export async function GetGuestMeetingByPin(pin: string, email: string) {
  try {
    const meeting: any = await GuestMeeting.findOne({ pin, guest: { $elemMatch: { email: email } } }).populate('hostId', 'name email');

    if (!meeting) {
      throw new Error('Meeting not found');
    }

    // Return meeting details with host name
    return {
      _id: meeting._id,
      topic: meeting.topic,
      description: meeting.description,
      guest: meeting.guest,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      pin: meeting.pin,
      meetingLink: meeting.meetingLink,
      status: meeting.status,
      hostName: meeting.hostId?.name || 'ExTalk User',
      hostEmail: meeting.hostId?.email
    };
  } catch (error: any) {
    throw new Error(error.message || error);
  }
}
export async function GetAllGuestMeeting(req: any) {
  try {
    const andClause: any[] = [];
    // andClause.push({ status: 'scheduled' });

    // Convert string ID to ObjectId for aggregation
    const userObjectId = new mongoose.Types.ObjectId(req.user._id);

    // Filter by hostId if user is admin
    if (req.user.userType === 'admin') {
      andClause.push({ hostId: userObjectId });
    }
    if (req.query.searchQuery) {
      console.log(req.query.searchQuery);
      andClause.push({
        $or: [
          { topic: { $regex: req.query.searchQuery, $options: 'i' } },
          { "guest.name": { $regex: req.query.searchQuery, $options: 'i' } },
          { "guest.email": { $regex: req.query.searchQuery, $options: 'i' } }
        ]
      });
    }

    const conditions: any = {};
    if (andClause.length > 0) {
      conditions.$and = andClause;
    }

    const meeting: any = await GuestMeeting.aggregate([
      {
        $match: conditions
      },
      {
        $lookup: {
          from: 'users',
          localField: 'hostId',
          foreignField: '_id',
          as: 'hostId'
        }
      },
      {
        $unwind: { path: "$hostId", preserveNullAndEmptyArrays: true }
      }
    ]);

    return meeting;
  } catch (error: any) {
    throw new Error(error.message || error);
  }
}
export async function GetAllGuestMeetingMessage(req: any) {
  try {
    const { meetingId } = req.query;
    const matchStage: any = {};

    if (meetingId) {
      matchStage.meetingId = new mongoose.Types.ObjectId(meetingId);
    }

    const meeting: any = await GuestMeetingMessage.aggregate([
      {
        $match: matchStage
      },
      {
        $lookup: {
          from: 'guestmeetings',
          localField: 'meetingId',
          foreignField: '_id',
          as: 'meetingDetails'
        }
      },
      {
        $unwind: { path: "$meetingDetails", preserveNullAndEmptyArrays: true }
      }
    ]);

    return meeting;
  } catch (error: any) {
    throw new Error(error.message || error);
  }
}
export async function AddGuestMeetingMessage(data: any) {
  try {
    const meetingMessage = new GuestMeetingMessage(data);
    await meetingMessage.save();
    return meetingMessage;
  } catch (error: any) {
    throw new Error(error.message || error);
  }
}
export async function updateGroup(
  groupId: string,
  groupName: any,
  groupDescription: any,
  groupImage: any,
  meetingStartTime?: string,
  meetingEndTime?: string
) {
  try {
    let updateQuery: any = {};
    if (groupName) updateQuery.groupName = groupName;
    if (groupName) updateQuery.groupDescription = groupDescription;
    if (groupImage) {
      let imageURL = await upload(groupImage);

      updateQuery.groupImage = imageURL;
    }
    // If meeting times provided, validate and set (only for meetings)
    if (meetingStartTime || meetingEndTime) {
      const existingGroup: any = await Group.findById(groupId);
      if (!existingGroup) {
        throw new Error("Group not found");
      }
      // Only allow for meeting groups
      if (!existingGroup.isTemp) {
        throw new Error("Meeting times can only be updated for meeting groups");
      }

      const now = new Date();
      const start = meetingStartTime ? new Date(meetingStartTime) : new Date(existingGroup.meetingStartTime);
      const end = meetingEndTime ? new Date(meetingEndTime) : new Date(existingGroup.meetingEndTime);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error("Invalid meeting start or end time provided");
      }
      if (start < now) {
        throw new Error("Meeting start time must be greater than or equal to the current time.");
      }
      if (end <= start) {
        throw new Error("Meeting end time must be greater than the start time.");
      }
      updateQuery.meetingStartTime = start;
      updateQuery.meetingEndTime = end;
    }

    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $set: updateQuery },
      { new: true }
    );

    if (!updatedGroup) {
      throw new Error("Group not found");
    }

    return updatedGroup;
  } catch (error: any) {
    console.error("Error updating group:", error);
    throw new Error(error);
  }
}
export async function AddUserToGroup(data: any) {
  try {
    const { groupId, userId } = data;
    const existingGroup: any = await Group.findById(groupId);
    if (!existingGroup) {
      throw new Error("Group not found");
    }
    const userIdArray = Array.isArray(userId) ? userId : JSON.parse(userId);
    for (const id of userIdArray) {
      const user: any = await USERS.findById(id);
      if (!user) {
        throw new Error(`User with ID ${id} not found`);
      }
      if (existingGroup.currentUsers.includes(id)) {
        throw new Error(`User with ID ${id} already exists in the group`);
      }
      existingGroup.currentUsers.push(id);
    }
    await existingGroup.save();
    return existingGroup;
  } catch (error: any) {
    throw new Error(error);
  }
}
export async function RemoveUserFromGroup(data: any) {
  try {
    const { groupId, userId } = data;

    // Find the group by its ID
    const existingGroup: any = await Group.findById(groupId);

    if (!existingGroup) {
      throw new Error("Group not found");
    }

    // Check if the user exists
    const user: any = await USERS.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.userType === "SuperAdmin")
      throw new Error("Cannot remove super admin");
    // Check if the userId exists in currentUsers array
    const userIndex = existingGroup.currentUsers.indexOf(userId);
    if (userIndex === -1) {
      throw new Error("User does not exist in the group");
    }

    // Remove the userId from currentUsers array
    existingGroup.currentUsers.splice(userIndex, 1);
    // existingGroup.previousUsers.push({userId, leaveTime: Date.now()})
    await existingGroup.save();
    return existingGroup;
  } catch (error: any) {
    throw new Error(error);
  }
}
export async function AddNewGroupMessage(data: any, user: any, file: any) {
  try {
    const {
      groupId,
      senderId,
      senderName,
      messageType,
    } = data;

    if (file) {
      let imageURL = await upload(file);
      data.message = imageURL;
    }
    // Find the contact by its ID
    const group: any = await Group.findById(groupId);
    const Admin: any = await USERS.findOne({ userType: 'SuperAdmin' })

    if (!group) {
      throw new Error("No message found");
    }
    let readBy = [{ user: senderId, timestamp: Date.now() }, { user: Admin._id, timestamp: Date.now() }];
    let deliveredTo = [{ user: senderId, timestamp: Date.now() }, { user: Admin._id, timestamp: Date.now() }];
    // Create a new message
    const newMessage: any = {
      groupId: groupId,
      senderId,
      senderName,
      message: data.message,
      allRecipients: group.currentUsers,
      messageType,
      readBy,
      deliveredTo,
    };
    data.replyOf ? (newMessage.replyOf = JSON.parse(data.replyOf)) : null;
    file ? (newMessage.fileName = file.originalname) : null;

    group.updatedAt = new Date();

    await group.save();
    const newMsg = await Message.create(newMessage);

    return {
      data: newMsg,
      msgId: group._id,
    };
  } catch (error) {
    console.error(error);
    throw new Error("No message found");
  }
}
export async function DeleteGroupMessage(data: any, user: any) {
  try {
    const msgInDB: any = await Message.deleteOne(new mongoose.Types.ObjectId(data.messageId));
    // msgInDB.deletedBy.push(new mongoose.Types.ObjectId(user._id));
    // await msgInDB.save();
    return "Success";
  } catch (error) {
    console.error(error);
    throw new Error("No message found");
  }
}
export async function ReportGroup(data: any, user: any) {
  try {
    const createReport = await Report.create({
      type: "group",
      description: data.description,
      userId: user._id,
      groupId: data.groupId,
    });
    return createReport;
  } catch (error) {
    console.error(error);
    throw new Error("No message found");
  }
}
export async function ReportMessage(data: any, user: any) {
  try {
    const createReport = await Report.create({
      type: "message",
      description: data.description,
      userId: user._id,
      groupId: data.groupId,
      messageId: data.msgId,
    });
    return createReport;
  } catch (error) {
    console.error(error);
    throw new Error("No message found");
  }
}
export async function infoMessage(data: any, req: any) {
  try {

    if (!mongoose.Types.ObjectId.isValid(data.msgId)) {
      // return {}
      throw new Error("Message ID is required");
    }
    const message = await Message.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(data.msgId),
        },
      },
      {
        $lookup: {
          from: "groups",
          localField: "groupId",
          foreignField: "_id",
          as: "groupData"
        }
      },
      {
        $unwind: "$groupData"
      },
      {
        $lookup: {
          from: "users",
          let: {
            readByUser: "$readBy.user",
            readTimestamps: "$readBy.timestamp",
            currentUsers: "$groupData.currentUsers"
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$_id", "$$readByUser"] }, // Match users whose _id is in readBy.user
                    { $not: { $eq: ["$_id", new mongoose.Types.ObjectId(req.user._id)] } },
                    { $not: { $eq: ["$userType", "SuperAdmin"] } },
                    { $in: ["$_id", "$$currentUsers"] } // Only include users who are in the group
                  ]
                },
              },
            },
            {
              $addFields: {
                timestamp: {
                  $arrayElemAt: [
                    "$$readTimestamps",
                    { $indexOfArray: ["$$readByUser", "$_id"] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                image: 1,
                timestamp: 1, // Corrected field name
              },
            },
          ],
          as: "readUserData",
        },
      },
      {
        $lookup: {
          from: "users",
          "let": {
            "readByUser": "$readBy.user",
            "deliveredToUser": "$deliveredTo.user",
            readTimestamps: "$deliveredTo.timestamp",
            currentUsers: "$groupData.currentUsers"
          },
          "pipeline": [
            {
              "$match": {
                "$expr": {
                  $and: [
                    { $in: ["$_id", "$$deliveredToUser"] }, // User is in deliveredTo
                    { $not: { $in: ["$_id", "$$readByUser"] } },
                    { $not: { $eq: ["$_id", new mongoose.Types.ObjectId(req.user._id)] } }, // User is NOT in readBy
                    { $not: { $eq: ["$userType", "SuperAdmin"] } },

                    { $in: ["$_id", "$$currentUsers"] } // Only include users who are in the group
                  ]
                }
              },
            },
            {
              $addFields: {
                timestamp: {
                  $arrayElemAt: [
                    "$$readTimestamps",
                    { $indexOfArray: ["$$deliveredToUser", "$_id"] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                image: 1,
                timestamp: 1, // Corrected field name
              },
            },
          ],
          as: "deliveredToData",
        },
      },

      {
        $project: {
          deliveredToData: 1,
          readUserData: 1,
          message: 1,
          createdAt: 1,
          messageType: 1,
          fileName: 1,
        },
      },
    ]);
    return message ? message[0] : {};
  } catch (error) {
    throw new Error("No message found");
  }
}
export async function testMessage(data: any, user: any) {
  try {
    let send = await initializeFirebase(data.receiverId,
      data.title,
      data.body,
      data.groupId,
      data.msgType)
    return send;
  } catch (error) {
    console.error(error);
    throw new Error("No message found");
  }
}
export async function sendPushNotification(data: any) {
  try {
    initializeFirebase(
      data.receiverId,
      data.senderName,
      data.message,
      data.groupId,
      data.messageType
    );
    sendWebPush.sendWebPush(data.receiverId,
      data.senderName,
      data.message,
      data.groupId,
      data.messageType)
    return "Notification sent successfully";
  } catch (error) {
    console.error(error);
    // throw new Error("No message found");
    return "Error sending notification";
  }
}
export async function deliverySeen(data: any, user: any) {
  try {





    return "success";
  } catch (error) {
    console.error(error);
    throw new Error("No message found");
  }
}
export const checkActiveCall = async (groupId: string, user: any) => {
  try {
    const VideoCall = require('../../db/schemas/videocall.schema').default;
    const User = require('../../db/schemas/users.schema').default;

    // Find active call in this group
    const groupCall = await VideoCall.findOne({
      groupId,
      status: 'active'
    }).lean();
    if (!groupCall) {
      return {
        activeCall: false,
        participantCount: 0
      };
    }


    // Count participants with 'joined' status - add null check for user property
    const activeParticipants = groupCall.userActivity.filter(
      (activity: any) => activity.user && activity.status === 'joined'
    );

    // If no active participants, update call status to ended
    if (activeParticipants.length === 0) {
      await VideoCall.updateOne(
        { _id: groupCall._id },
        { $set: { status: 'ended', endedAt: new Date(), incommingCall: false } }
      );

      return {
        activeCall: false,
        participantCount: 0
      };
    }

    // Get participant details - with a null check
    const participantIds = activeParticipants
      .filter((p: { user: any }) => p.user) // Filter out any undefined users
      .map((p: any) => p.user);

    // Extra guard against stale "joined" states:
    // if none of the joined users are currently active in calls, auto-end the call.
    const activeUsersInCall = await User.find(
      { _id: { $in: participantIds }, isActiveInCall: true },
      { _id: 1 }
    ).lean();
    const activeUserIds = new Set(activeUsersInCall.map((u: any) => u._id.toString()));

    if (activeUserIds.size === 0) {
      await VideoCall.updateOne(
        { _id: groupCall._id },
        {
          $set: {
            status: 'ended',
            endedAt: new Date(),
            incommingCall: false,
            "userActivity.$[elem].status": "left",
            "userActivity.$[elem].leftAt": new Date(),
          }
        },
        {
          arrayFilters: [{ "elem.status": "joined" }]
        }
      );
      return {
        activeCall: false,
        participantCount: 0
      };
    }

    // Fetch participant details from User collection
    const participants = await User.find(
      { _id: { $in: Array.from(activeUserIds) } },
      { name: 1, image: 1 }
    ).lean();



    return {
      activeCall: true,
      participantCount: participants.length,
      participants,
      startedAt: groupCall.startedAt,
      callType: groupCall.callType,

    };
  } catch (error) {
    console.error("Error checking active call:", error);
    throw error;
  }
};
export async function GetSingleGroupCallDetails(groupId: any) {
  try {
    // Find the most recent call for this group
    const latestCall = await VideoCall.findOne({
      groupId: groupId
    })
      .sort({ createdAt: -1 })
      .populate({
        path: 'userActivity.user',
        select: 'name image phone userType',
        model: 'users' // Fix: Use lowercase 'users' to match the registered model name
      })
      .lean();

    if (!latestCall) {
      return {
        hasCall: false,
        message: "No call history found for this group"
      };
    }

    // Calculate call duration
    const startTime = latestCall.startedAt;
    const endTime = latestCall.endedAt || new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));

    // Separate users who joined vs those who were invited but didn't join
    const joinedUsers = latestCall.userActivity.filter(
      (activity: any) => activity.status === 'joined' || activity.status === 'left'
    );

    const invitedOnlyUsers = latestCall.userActivity.filter(
      (activity: any) => activity.status === 'invited'
    );

    // Calculate individual user call durations for joined users
    const userCallDetails = joinedUsers.map((activity: any) => {
      const joinTime = activity.joinedAt;
      const leaveTime = activity.leftAt || (latestCall.status === 'active' ? new Date() : latestCall.endedAt);

      let userDurationMs = 0;
      if (joinTime && leaveTime) {
        userDurationMs = leaveTime.getTime() - joinTime.getTime();
      }
      const userDurationMinutes = Math.round(userDurationMs / (1000 * 60));

      return {
        user: activity.user,
        status: activity.status,
        joinedAt: activity.joinedAt,
        leftAt: activity.leftAt,
        durationMinutes: userDurationMinutes,
        durationFormatted: formatDuration(userDurationMinutes)
      };
    });

    return {
      hasCall: true,
      callId: latestCall._id,
      groupId: latestCall.groupId,
      status: latestCall.status,
      callType: latestCall.callType,
      startedAt: latestCall.startedAt,
      endedAt: latestCall.endedAt,
      totalDurationMinutes: durationMinutes,
      totalDurationFormatted: formatDuration(durationMinutes),
      participantCount: joinedUsers.length,
      invitedCount: invitedOnlyUsers.length,
      joinedUsers: userCallDetails,
      invitedOnlyUsers: invitedOnlyUsers.map((activity: any) => ({
        user: activity.user,
        status: activity.status
      }))
    };
  } catch (error) {
    console.error("Error fetching group call details:", error);
    throw error;
  }
}
function formatDuration(minutes: number): string {
  if (minutes < 1) {
    return "< 1 min";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  return `${remainingMinutes}m`;
}
export async function AddGroupAction(data: any, user: any) {
  try {
    if (data.groupId == "" || data.groupId == null || data.groupId == undefined || data.groupId == "undefined" || data.groupId == "null") {
      throw new Error("Group ID is required");
    }
    if (data.action == "" || data.action == null || data.action == undefined || data.action == "undefined" || data.action == "null") {
      throw new Error("Action is required");
    }
    if (data.action == "reject") {
      if (data.actionDescription == "" || data.actionDescription == null || data.actionDescription == undefined || data.actionDescription == "undefined" || data.actionDescription == "null") {
        throw new Error("Action description is required");
      }
    }
    data.userId = user._id;
    if (data.action == "accept") {
      data.actionDescription = "Group joined successfully";
    } else {
      data.actionDescription = data.actionDescription;
    }

    const checkAction = await GroupAction.findOne({
      groupId: data.groupId,
      userId: data.userId
    });
    if (checkAction) {
      return {
        success: true,
        message: "You have already taken action on this group"
      };
    }

    const groupAction = new GroupAction(data);
    await groupAction.save();
    return groupAction;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
