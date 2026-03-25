import { ObjectId } from "mongodb";
import USERS from "../../../db/schemas/users.schema";
import filterUser from "../../../helpers/filterUser";
import { fromEnumUserTypes } from "../../../helpers/constants";
import mongoose from "mongoose";
export async function getAUserById(userId: string) {
  try {
    const user = await USERS.findOne({
      _id: new ObjectId(userId),
      status: { $ne: "deleted" },
    }).lean();
    return user;
  } catch (error) {
    throw error;
  }
}

export async function getAUserByMail(mail: string) {
  try {
    const user = await USERS.findOne({
      email: mail,
      status: { $ne: "deleted" },
    }).lean();
    return user;
  } catch (error) {
    throw error;
  }
}

export async function getAUser(id: string) {
  try {
    return await USERS.findOne({
      $or: [{ email: id }, { username: id }],
    }).lean();
  } catch (error) {
    throw error;
  }
}

export async function getAllUsers({
  userType = "",
  searchQuery,
  limit = 10,
  page = 1,
}: {
  userType: string;
  searchQuery: string;
  limit: number;
  page: number;
}, req: any) {
  try {
    var query: any = {};
    if (userType && userType != "") {
      if (userType === "admin") {
        query.userType = { $in: ["admin", "SuperAdmin"] };
      } else {
        query.userType = userType;
      }
    }
    if (req.user.userType && req.user.userType === "admin") {
      query.added_member_by = { $in: [new mongoose.Types.ObjectId(req.user._id)] };
    }
    if (searchQuery) {

      query.$or = [
        { name: { $regex: new RegExp(searchQuery, "i") } },
        { email: { $regex: new RegExp(searchQuery, "i") } },
        // Add more fields for search if needed
      ];
    }

    // Calculate offset from page number
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const totalCount = await USERS.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    const users = await USERS.find(query)
      .skip(offset)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    const filteredUsers = users.map((user: any) => {
      let userType: string = user.userType;
      user.userType = fromEnumUserTypes[userType];
      return filterUser(user);
    });

    return {
      data: filteredUsers,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  } catch (error) {
    throw error;
  }
}


export async function AllUsers({
  userType = "",
}: {
  userType: string;
}, req: any) {
  try {
    var query: any = {};
    if (req.body._id) {
      query._id = new mongoose.Types.ObjectId(req.body._id);
    }
    if (userType && userType != "") {
      if (userType === "admin") {
        query.userType = { $in: ["admin", "SuperAdmin"] };
      } else {
        query.userType = userType;
      }
    }
    if (req.user.userType && req.user.userType === "admin") {
      query.added_member_by = { $in: [new mongoose.Types.ObjectId(req.user._id)] };
    }
    const users = await USERS.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const filteredUsers = users.map((user: any) => {
      let userType: string = user.userType;
      user.userType = fromEnumUserTypes[userType];
      return filterUser(user);
    });

    return filteredUsers

  } catch (error) {
    throw error;
  }
}


