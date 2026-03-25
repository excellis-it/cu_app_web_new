import USERS from "../../db/schemas/users.schema";
import { upload } from "../../helpers/upload";

export default async function updateUser(user:any,data:any, file:any){
    try {
        if(file) {
            let imageURL=await upload(file)
      
            data.image = imageURL
          }
        const existing = await USERS.findById(user._id).lean();
        if(!existing) throw new Error("User not found");
        if(data.password) {
            delete data.password;
        }
        if(data?.accountStatus == "" || data?.accountStatus == null) {
             data.accountStatus = existing.accountStatus;
        }
        if(data?.firebaseToken == "" || data?.firebaseToken == null) {
            data.firebaseToken = existing.firebaseToken;
        }
        if(data?.applePushToken == "" || data?.applePushToken == null) {
            data.applePushToken = existing.applePushToken;
        }
        let updated = await USERS.findByIdAndUpdate(user._id, data, {new: true}).lean();
        return updated;
      
    } catch (error) {
        throw error;
    }

}