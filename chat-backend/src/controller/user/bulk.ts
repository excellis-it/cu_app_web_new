import bcrypt from "bcrypt";
import USERS from "../../db/schemas/users.schema";
import fs from "fs/promises"
import Group from "../../db/schemas/group.schema";
import Message from "../../db/schemas/message.schema";
export async function bulk() {
    const jsonDataStr = await fs.readFile("cpscom_backup.json", "utf8");
    const jsonData = JSON.parse(jsonDataStr);
    const users = jsonData.users
    try {
        for (const key in users) {
            if (Object.hasOwnProperty.call(users, key)) {
                const userData = users[key];
                const sl = await getNewSl();
                const username = generateUsername(userData.name, sl);
                const hashedPassword = await hashPassword("cpscom@#2024");

                const user = new USERS({
                    name: userData?.name,
                    email: userData?.email,
                    image: userData?.profile_picture,
                    userName: userData?.uid, // Assuming username is the part before @ in email
                    phone:sl,
                    password:hashedPassword,
                    userType: userData.isSuperAdmin ? "SuperAdmin" : (userData.isAdmin ? "admin" : "user"),
                    accountStatus:"Active" ,
                    createdAt: new Date(),
                    sl: sl, // Assuming you generate some random sl value
                });
    
                try {
                    await user.save();
                } catch (error:any) {
                    console.error(`Error inserting user ${userData.name}: ${error.message}`);
                }
            }
        }
    } catch (error) {
        console.error("Error reading or processing JSON file:", error);
    }
}
export async function bulkGroup() {
    const jsonDataStr = await fs.readFile("cpscom_backup.json", "utf8");
    const jsonData = JSON.parse(jsonDataStr);
    const groups = jsonData.groups;

    try {
        for (const key in groups) {
            if (Object.hasOwnProperty.call(groups, key)) {
                const groupData = groups[key];
                const currentUsers = await Promise.all(groupData.members.map(async (member:any) => {
                    const user = await USERS.findOne({ email: member.email }); // Assuming email is unique identifier
                    return user ? user._id : null;
                }));
                const group = new Group({
                    groupName: groupData.name,
                    groupImage: groupData.profile_picture,
                    groupDescription: groupData.group_description,
                    currentUsers: currentUsers.filter(Boolean), // Remove null values
                    admins: currentUsers.filter((userId, index) => groupData.members[index]?.isAdmin), // Filter admin users
                    createdAt: new Date(groupData.time),
                });

                const savedGroup = await group.save();

                const groupMessages = groupData.__collections__.chats;

                for (const messageId in groupMessages) {
                    if (Object.hasOwnProperty.call(groupMessages, messageId)) {
                        const chatData = groupMessages[messageId];

                        const sender:any = await USERS.findOne({ userName: chatData.sendById });
                        if (sender) {
                            let messageType;
                        if (chatData.type === "img") {
                            messageType = "image";
                        } else if (chatData.type === "notify") {
                            messageType = "text";
                        } else {
                            messageType = "text";
                        }
                        const message = new Message({
                            groupId: savedGroup._id,
                            senderId: sender._id,
                            senderName: chatData.sendBy,
                            message: chatData.message,
                            messageType: messageType,
                            timestamp: new Date(chatData.time),
                        });

                        try {
                            message.save();
                        } catch (error:any) {
                            console.error(`Error inserting message: ${error.message}`);
                        }
                    }
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error reading or processing JSON file:", error);
    }
}
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
        let username = `${name.slice(0,6)}${serial.toString(16)}`.toLowerCase();
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