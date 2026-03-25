import { ObjectId } from "mongodb";
import GROUPS from "../../../db/schemas/group.schema";
import MESSAGES from "../../../db/schemas/message.schema";

export async function deleteGroup(id: string) {

  try {
    const objectId = new ObjectId(id);

    // Ensure id is a valid ObjectId string
    if (!ObjectId.isValid(id)) {
      throw new Error(`Invalid ObjectId: ${id}`);
    }

    // Step 1: Find messages associated with the groupId
    const messages = await MESSAGES.find({ groupId: objectId });
    if (messages.length > 0) {
      // Step 2: Delete messages associated with the groupId
      const deleteMessagesResult = await MESSAGES.deleteMany({
        groupId: objectId,
      });

      // Step 3: Delete the group itself
      const deleteGroupResult = await GROUPS.findByIdAndDelete(objectId);      
      if (!deleteGroupResult) {
        return { message: `Group not found.` };
      }

      return {
        status: true,
        statusCode: 200,
        statusText: `Group and associated messages deleted successfully.`,
        deletedMessagesCount: deleteMessagesResult.deletedCount,
        deleteGroupResult
      };
    } else {
      // Step 3: Delete the group itself
      const deleteGroupResult = await GROUPS.findByIdAndDelete(objectId);

      if (!deleteGroupResult) {
        return { message: `Group not found.` };
      }

      return {
        status: true,
        statusCode: 200,
        statusText: `Group deleted successfully.`,
      };
    }
  } catch (error) {
    console.error(`Error deleting group and messages`, error);
    throw error;
  }
}
