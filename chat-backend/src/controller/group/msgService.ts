var q = require("q");
var ContactModels = require("../models/contactModel");
const mongoose = require("mongoose");
const UserModel = require("../../users/models/UserModels");
const messageModel = require("../models/messageModel");
const groupMessageModel = require("../models/groupMessageModel");

export default function ContactServices() {
  function AddGroupMessage(data: any) {
    var deferred = q.defer();
    UserModel.find({ role: "Admin" })
      .select("_id") // Select only the _id field
      .exec((err: any, adminUsers: any) => {
        if (err) {
          // Handle the error
        } else {
          const adminIds = adminUsers.map((user: any) => user._id);
          data.adminId = adminIds;
          groupMessageModel
            .create(data)
            .then(async function (result: any) {
              var resp = {
                success: true,
                message: "Group Added",
                data: result,
              };
              deferred.resolve(resp);
            })
            .catch(function (error: any) {
              var resp = {
                success: false,
                message: "Error in processing",
                data: error,
              };
              deferred.reject(resp);
              console.error("err", resp);
            });
        }
      });

    return deferred.promise;
  }

  function GetGroupMessages(condition: any, userId: any) {
    var deferred = q.defer();

    if (condition.prospectId) {
      condition.prospectId = mongoose.Types.ObjectId(condition.prospectId);
    } else if (condition.vendorId) {
      condition["vendorInfo.vendorId"] = mongoose.Types.ObjectId(
        condition.vendorId
      );
      condition.vendorId = undefined;
    }

    var pipeline = [
      {
        $match: condition,
      },
      {
        $addFields: {
          messages: {
            $filter: {
              input: "$messages",
              as: "message",
              cond: {
                $not: {
                  $in: [mongoose.Types.ObjectId(userId), "$$message.deletedBy"],
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          lastMessage: {
            $arrayElemAt: ["$messages", -1],
          },
        },
      },
      {
        $project: {
          messages: 0,
        },
      },
    ];

    groupMessageModel.aggregate(pipeline).exec((err: any, result: any) => {
      if (err) {
        var resp = {
          success: false,
          message: "Error in processing",
          data: err,
        };
        deferred.reject(resp);
      }
      var resp = {
        success: true,
        message: "Contacts received successfully",
        data: result,
      };
      deferred.resolve(resp);
    });

    return deferred.promise;
  }

  async function GetSingleGroupMessage(
    id: any,
    userId: any,
    offset: number,
    limit: number
  ) {
    return groupMessageModel
      .aggregate([
        {
          $match: {
            $or: [
              { currentUsers: mongoose.Types.ObjectId(userId) },
              {
                previousUsers: {
                  $elemMatch: {
                    id: mongoose.Types.ObjectId(userId),
                    leaveTime: { $exists: false },
                  },
                },
              },
            ],
          },
        },
        { $skip: offset }, // Skip the specified number of documents
        { $limit: limit }, // Limit the number of documents to return
      ])
      .exec((err: any, groupMessage: any) => {
        if (err) {
          // Handle the error
          return { error: "An error occurred" };
        }
        // messages will contain the filtered messages
        return groupMessage[0];
      });
  }

  return {
    AddGroupMessage,
    GetGroupMessages,
    GetSingleGroupMessage,
  };
}
