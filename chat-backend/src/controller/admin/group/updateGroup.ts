import Group from "../../../db/schemas/group.schema";
import USERS from "../../../db/schemas/users.schema";
import { upload } from "../../../helpers/upload";

export async function updateGroup(data: any, groupImage: any,req:any) {
  try {
    let { groupId, groupName, users } = data;
    if (!groupId || !groupName || !users) {
      throw new Error("Invalid data");
    }

    if (typeof users == "string") {
      data.users = JSON.parse(users);
    }
    if (groupImage) {
      let imageURL = await upload(groupImage);


      data.groupImage = imageURL;
    }
    const superAdmin: any = await USERS.findOne({ userType: "SuperAdmin" });

    if (!data.users.includes(superAdmin.id)) data.users.push(superAdmin._id);
    
    const existingGroup: any = await Group.findById(groupId);


    // Remove admins who are not in the updated users list
    existingGroup.admins = existingGroup.admins.filter((admin: any) =>
      data.users.includes(admin.toString())
    );
    if(!existingGroup.admins.includes(req.user._id.toString())){
      existingGroup.admins.push(req.user._id.toString())
    }
    

    existingGroup.groupName = groupName;
    existingGroup.currentUsers = data.users;
    existingGroup.groupImage = data.groupImage;
    existingGroup.groupDescription = data.groupDescription;

    const updatedGroup = await existingGroup.save();

    return updatedGroup;
  } catch (error: any) {
    throw new Error(error);
  }
}
