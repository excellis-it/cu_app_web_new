import { ObjectId } from "mongodb";
import USERS from "../../db/schemas/users.schema";
import mongoose from "mongoose";
export async function getAUserById(userId: string) {
    try {
        return await USERS.findOne({_id: new ObjectId(userId), status:{$ne: "deleted"}}).lean();        
    } catch (error) {
        throw error;
    }
}

export async function getAUser(id:string){
    try {
        return await USERS.findOne({$or: [{email: id}, {username: id}]}).lean();
    } catch (error) {
        throw error;
    }
}

export async function getAllUsers(searchQuery:string, limit:number , offset:number ){
    try {
        let query:any = {}
        if (searchQuery) {
            query.$or = [
              { name: { $regex: new RegExp(searchQuery, "i") } },
              // Add more fields for search if needed
            ];
          }
        return await USERS.find(query)
        .lean();
    } catch (error) {
        throw error;
    }
}


export async function getuserLogout(user_id:string,){
    try {
        if (user_id) {
            return await USERS.findByIdAndUpdate(new mongoose.Types.ObjectId(user_id),{firebaseToken:"", applePushToken:""})
        }else{
            return await USERS.findOne({"_id":new mongoose.Types.ObjectId(user_id)})
        }
        
    } catch (error) {
        throw error;
    }
}


export async function getuserLogoutWeb(user_id:string,){
    try {
        if (user_id) {
            return await USERS.findByIdAndUpdate(new mongoose.Types.ObjectId(user_id),{webPushToken:""})
        }else{
            return await USERS.findOne({"_id":new mongoose.Types.ObjectId(user_id)})
        }
        
    } catch (error) {
        console.log(error)
        throw error;
    }
}