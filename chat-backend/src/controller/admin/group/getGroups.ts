import Group from "../../../db/schemas/group.schema";
import Message from "../../../db/schemas/message.schema";

export async function GetGroups(
  {
    searchQuery,
    limit = 10000,
    offset = 0,
  }: { searchQuery: string; limit: number; offset: number },
  user: any
) {
  try {
    const query: any = {};

    if (searchQuery) {
      query.$or = [
        { groupName: { $regex: new RegExp(searchQuery, "i") } },
        // Add more fields for search if needed
      ];
    }
    // Assuming `userId` is the ID of the current user
    const userId = user._id;

    // // Add the condition to filter groupwhes re the user is a current member
    // Add the condition to filter groups where the user is an admin
    query.admins = { $in: [userId] };

    const groups = await Group.find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
    const populatedGroups = await Promise.all(
      groups.map(async (group: any) => {
        const temp = [...group.currentUsers];
        const currentUsersId = await Group.populate(group, {
          path: "currentUsers",
          select: "_id name phone image", // Add the fields you want in currentUsersId
          model: "users", // Assuming User is the model name for the users
        });
        const lastMessage = await Message.findOne({ groupId: group._id })
          .sort({ timestamp: -1 })
          .populate("senderId", "senderName")
          .exec();

        return {
          ...group.toObject(),
          currentUsersId: temp,
          lastMessage: lastMessage || null,
        };
      })
    );

    return populatedGroups;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
