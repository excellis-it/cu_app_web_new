import bcrypt from "bcrypt";
import { hashPassword } from "./signUp";
import { comparePassword } from "./signIn";
import USERS from "../../../db/schemas/users.schema";
import { upload } from "../../../helpers/upload";
import { sendMail } from "../../../helpers/mailer";
const mailer = require('../../../helpers/gmailer')


export default async function updatUserDetails(data: any, file: any) {
  try {
    let updateQuery: any = {};
    if (data.name) updateQuery.name = data.name;
    if (data.userName) updateQuery.userName = data.userName;
    if (data.email) updateQuery.email = data.email;
    if (data.phone) updateQuery.phone = data.phone;
    if (['user', 'admin'].includes(data?.userType)) {
      updateQuery.userType = data.userType;
    }
    if (data.accountStatus) updateQuery.accountStatus = data.accountStatus;
    if (file) {
      let imageURL = await upload(file);

      updateQuery.image = imageURL;
    }
    if (data.password) {
      updateQuery.password = await hashPassword(data.password);

      //********send mail oparetion ******** //

      let emailData = {
        name: `${data.name}`,
        message: "Welcome to ExTalk ! We’re excited to have you on board. Here are your login credentials:",
        username: `${data.email}`,
        password: `${data.password}`
      };

      // let sendMail = await mailer.sendMail(
      //   process.env.email,
      //   `${data.email}`,
      //   `Welcome to ExTalk`,
      //   "send_mail",
      //   emailData
      // );

    }
    const updatedUser = await USERS.findByIdAndUpdate(
      data._id,
      { $set: updateQuery },
      { new: true }
    );
    return updatedUser;
  } catch (error) {
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
        throw new Error("Password is incorrect");
      } else {
        let hashedPassword = await hashPassword(data.password);
        let passwordUpdate: any = await USERS.findByIdAndUpdate(
          id,
          { password: hashedPassword },
          {
            new: true,
          }
        ).lean();
        return passwordUpdate;
      }
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
}
