import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import USERS from "../../../db/schemas/users.schema";
import GROUPS from "../../../db/schemas/group.schema";
import parseMongoErrors from "../../../helpers/parseMongoErrors";
import { toEnumUserTypes } from "../../../helpers/constants";
const mailer =  require('../../../helpers/gmailer')

async function getNewSl() {
  try {
    const last = await USERS.findOne().sort({ sl: -1 }).lean();
    if (!last) return 1;
    return last.sl + 1;
  } catch (error) {
    throw error;
  }
}

function generateUsername(name: string, serial: number) {
  try {
    name = name.toLowerCase().replace(/ /g, "");
    let username = `${name.slice(0, 6)}${serial.toString(16)}`.toLowerCase();
    return username;
  } catch (error) {
    throw error;
  }
}

export async function hashPassword(password: string) {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
  } catch (error) {
    throw error;
  }
}

export async function createUser(data: userCreatePayload,req:any) {
  try {

    if (!data.email) throw new Error("Email is required");
    data.email = data.email.toLowerCase().replace(/ /g, "");
    let existing = await USERS.findOne({ email: data.email }).lean();
    if (existing && existing._id){
      let Checkuser = await USERS.findOne({_id : existing._id ,added_member_by: { $in: [new mongoose.Types.ObjectId(req.user._id)] } }).lean();
      if(Checkuser){
        return {
          status: true,
          statusCode: 200,
          statusText: `This user is already exists`,
          groupUpdate: ``,
        };
      }else{
        await USERS.updateOne({_id : existing._id},{$push:{added_member_by:req.user._id}});
        return existing;
      }
    }else{   

      let added_member: mongoose.Types.ObjectId[] = [];
    if( req.user.userType == "superadmin"){
      added_member = [req.user._id];
    }else if(req.user.userType == "admin"){
      await USERS.find({userType: "SuperAdmin"}).then((superAdmins: any) => {
        if (superAdmins && superAdmins.length > 0) {  
          added_member = [req.user._id, superAdmins[0]._id];
        }
      }
      );  
    }
    
    const sl = await getNewSl();
    const username = generateUsername(data.name, sl);
    const hashedPassword = await hashPassword(data.password);
    const user = await USERS.create({
      sl,
      username,
      email: data.email,
      phone: data.phone ? data.phone : "0000000000",
      password: hashedPassword,
      name: data.name,
      accountStatus: data.status,
      userType: toEnumUserTypes[data.userType],
      added_member_by:added_member
    });
        let emailData = { name: `${data.name}`,
        message:"Welcome to ExTalk ! We’re excited to have you on board. Here are your login credentials:",
        username:`${data.email}`, 
        password: `${data.password}`};

                  // ****** send mail oparation ******
  
      // let sendMail = await mailer.sendMail(
      //   process.env.email,
      //   `${data.email}`,
      //   `Welcome to ExTalk`,
      //   "send_mail",
      //   emailData
      // );
      // console.log("sendMail",sendMail);

      console.log(user);
    return user;
    };
  } catch (error) {
    throw parseMongoErrors(error);
  }
}

export async function deleteUser(id: string,userData:any) {

  // Ensure id is a valid ObjectId string
  if (!ObjectId.isValid(id)) {
    throw new Error(`Invalid ObjectId: ${id}`);
  }

  try {
    // Convert id to ObjectId
    const objectId = new ObjectId(id);

    // Check if the user ID is present in any group's currentUsers
    const isUserInGroups = await GROUPS.findOne({
      currentUsers: objectId,
    });

    let user:any = null;
    if(userData.userType == "SuperAdmin" ){
    // Delete the user by ID
      user = await USERS.findByIdAndDelete(objectId);
      if (!user) {
        return { message: `User not found.` };
      }
    }else{
      // If the user is not a superadmin, check if they are an admin of the group
      user = await USERS.findOneAndUpdate(
        { _id: objectId, added_member_by: { $in: [userData._id] } },
        { $pull: { added_member_by: userData._id } },
        { new: true }
      );

      if (!user) {
        return { message: `User not found or not an admin.` };
      }
    }
    

    // If the user is not in any group's currentUsers, commit the transaction and return
    if (!isUserInGroups) {
      return {
        status: true,
        statusCode: 200,
        statusText: `User deleted successfully.`,
        groupUpdate: `User was not in any group.`,
        delete_user:user
      };
    }

    // Remove the user ID from currentUsers in all groups
    const groupUpdateResult = await GROUPS.updateMany(
      { currentUsers: objectId,admins:{$in:[userData._id]} },
      { $pull: { currentUsers: objectId } }
    );
    return {
      status: true,
      statusCode: 200,
      statusText: `User deleted successfully and removed from groups.`,
      groupUpdate: `User removed from ${groupUpdateResult.modifiedCount} groups.`,
      delete_user:user
    };
  } catch (error) {
    console.error(`Error deleting user`, error);
    throw error;
  }
}

type userCreatePayload = {
  email: string;
  password: string;
  name: string;
  phone: string;
  userType: string;
  status: string;
};
