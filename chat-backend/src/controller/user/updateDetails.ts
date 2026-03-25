import { hashPassword } from "./signUp";
import { comparePassword } from "./signIn";
import USERS from "../../db/schemas/users.schema";
import { upload } from "../../helpers/upload";

export default async function updatUserDetails(
  user: any,
  data: any,
  file: any
) {
  try {
    let updateQuery: any = {};
    if (data.name) updateQuery.name = data.name;
    if (data.userName) updateQuery.userName = data.userName;
    if (file) {
      let imageURL = await upload(file);

      updateQuery.image = imageURL;
    }
    const updatedUser = await USERS.findByIdAndUpdate(
      user._id,
      { $set: updateQuery },
      { new: true }
    );
    return updatedUser;
  } catch (error) {
    console.log(error);
    throw error;
  }
}
export async function changePassword(data: any, id: any) {
  try {
    let oldInfo: any = await USERS.findById(id);
    if (!oldInfo) {
      throw new Error("Something went wrong");
    }
    if (
      data.oldPassword &&
      data.password &&
      data.password != "" &&
      data.oldPassword !== data.password &&
      oldInfo
    ) {
      //update password
      // check old Password

      if (!comparePassword(data.oldPassword, oldInfo.password)) {
        throw new Error("Old password is incorrect");
      } else {
        let hashedPassword = await hashPassword(data.password);
        let passwordUpdate: any = await USERS.findByIdAndUpdate(
          id,
          { password: hashedPassword },
          {
            new: true,
          }
        ).lean();
        return true;
      }
    } else {
      throw new Error("Please enter the fields correctly");
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}
