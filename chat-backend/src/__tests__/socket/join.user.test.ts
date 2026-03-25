import { setupTestSocket } from '../setup';
import { io, Socket } from "socket.io-client";
import { Server, Socket as ServerSocket } from "socket.io";
import mongoose from 'mongoose';

// Mock external modules
const mockUSERS = {
  findByIdAndUpdate: jest.fn(),
  find: jest.fn(),
};

const mockVideoCall = {
  findOne: jest.fn(),
  updateOne: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

const mockGroup = {
  find: jest.fn(),
};

const mockSendApplePush = jest.fn();
const mockInitializeFirebase = jest.fn();
const mockSendWebPush = {
  sendWebPush: jest.fn(),
};

jest.mock('../../db/schemas/users.schema', () => ({ default: mockUSERS }));
jest.mock('../../db/schemas/videocall.schema', () => ({ default: mockVideoCall }));
jest.mock('../../db/schemas/group.schema', () => ({ default: mockGroup }));
jest.mock('../../helpers/sendVoippush.ts', () => ({ default: mockSendApplePush }));
jest.mock('../../helpers/firebase', () => ({ initializeFirebase: mockInitializeFirebase }));
jest.mock('../../helpers/webPush', () => ({ default: mockSendWebPush }));

const ROOM_ID = 'test-room-123';
const CALLER_USER_ID = '65d1d60a1d4b6842b10287a2'; 
const CALLER_FULL_NAME = 'Test User 1';
const EXISTING_USER_ID = '65d1d60a1d4b6842b10287a3'; 
const CALL_TYPE = 'video';

describe('Socket.io - BE-join-room event', () => {
  let ioServer: Server;
  let httpServer: any;
  let socket1: Socket;
  let socket2: Socket;

  beforeAll(async () => {
    const context = await setupTestSocket();
    ioServer = context.io;
    httpServer = context.httpServer;

    ioServer.on('connection', (serverSocket: ServerSocket) => {
      serverSocket.on("BE-join-room", async ({ roomId, userName, fullName, mobileSDP = {}, callType }) => {
        let connectedUser: { roomId: string; userId: string; };
        
        const socketList: { [key: string]: { userName: string; fullName: string; mobileSDP: any; video: boolean; audio: boolean; }; } = {
          [serverSocket.id]: {
            userName,
            fullName,
            mobileSDP,
            video: true,
            audio: true,
          }
        };

        try {
          serverSocket.join(roomId);
          
          const clients = await ioServer.in(roomId).allSockets();
          const users = [...clients].map((clientId) => ({
            userId: clientId,
            info: socketList[clientId as keyof typeof socketList] || {},
          }));

          serverSocket.emit("FE-user-join", users);
          serverSocket.broadcast.to(roomId).emit("FE-user-join", [{
            userId: serverSocket.id,
            info: socketList[serverSocket.id]
          }]);
          
          await mockUSERS.findByIdAndUpdate(userName, { "isActiveInCall": true });
          
          const groupCall = await mockVideoCall.findOne({ groupId: roomId, status: "active" });
          if (groupCall) {
            const existingUser = groupCall.userActivity.find((activity: { user: string; }) =>
              activity.user === userName
            );
            if (existingUser) {
              await mockVideoCall.updateOne(
                {
                  _id: groupCall._id,
                  groupId: roomId,
                  status: "active",
                  "userActivity.user": userName,
                  "userActivity.status": "left"
                },
                {
                  $set: {
                    "userActivity.$.status": "joined",
                    "userActivity.$.joinedAt": new Date()
                  }
                }
              );
            } else {
              await mockVideoCall.updateOne(
                {
                  _id: groupCall._id,
                  groupId: roomId,
                  status: "active",
                },
                {
                  $push: {
                    userActivity: {
                      user: userName,
                      status: "joined",
                      joinedAt: new Date()
                    }
                  }
                }
              );
            }
          } else {
            const newGroupCall = {
              save: mockVideoCall.save,
            };
            await newGroupCall.save();
          }

          const groups = await mockGroup.find({ _id: roomId });
          if (groups && groups[0] && groups[0].currentUsers) {
             groups[0].currentUsers.forEach(async (uid: any) => {
              const connectedSockets = ioServer.sockets.adapter.rooms.get(uid) || new Set();
              if (connectedSockets.size > 0) {
                let checkUser = await mockVideoCall.find({ groupId: roomId, userActivity: { $elemMatch: { "user": uid, "status": "joined" } } });
                let Check_user = await mockUSERS.find({ _id: uid });
                let check_incomming_call = await mockVideoCall.find({ groupId: roomId, status: "active" });

                if (checkUser.length < 1 && !Check_user[0]?.isActiveInCall && !check_incomming_call[0]?.incommingCall) {
                  await mockVideoCall.updateOne({ _id: check_incomming_call[0]?._id }, { $set: { incommingCall: true } });
                  
                  if(groups[0].isTemp === false){
                    connectedSockets.forEach(socketId => {
                      ioServer.to(socketId).emit("incomming_call", {
                        uid,
                        socketId: serverSocket.id,
                        roomId,
                        groupName: groups[0].groupName,
                        groupImage: groups[0]?.groupImage ? groups[0].groupImage : null,
                        callerName: fullName,
                        callType: callType,
                      });
                    });

                    if (checkUser[0]?._id?.toString() !== userName.toString()) {
                      mockSendApplePush({
                        deviceToken: Check_user[0]?.applePushToken ?? "",
                        fullName,
                        groupName: groups[0].groupName,
                        groupId: roomId,
                        callType: callType,
                        userId: userName
                      });
                    }
                  }
                }
              }
            });
          }

          const checkFirebase = await mockVideoCall.find({ groupId: roomId, status: "active" });
          if (!checkFirebase[0]?.incommingCall) {
            if(groups[0]?.isTemp === false){
              mockInitializeFirebase(
                groups[0]?.currentUsers.filter((uid: any) => uid.toString() !== userName.toString()),
                `${groups[0]?.groupName}`,
                `Incoming ${callType} call from ${fullName}`,
                roomId,
                "incomming_call",
                callType,
                [],
                "null"
              );  
              mockSendWebPush.sendWebPush(
                groups[0]?.currentUsers
                  .filter((uid: mongoose.Types.ObjectId) => uid.toString() !== userName.toString())
                  .map((uid: mongoose.Types.ObjectId) => uid.toString()),
                fullName,
                `${fullName} is calling from ${groups[0].groupName}`,
                roomId,
                "incomming_call"
              );
            } else {
              mockInitializeFirebase(
                groups[0]?.currentUsers.filter((uid: any) => uid.toString() !== userName.toString()),
                `${groups[0]?.groupName}`,
                `${fullName} has joined the meeting: ${groups[0].groupName}`,
                roomId,
                "text",
                callType,
                [],
                "null"
              );  
            }
          }
        } catch (err) {
          console.error("Error in BE-join-room mock:", err);
          serverSocket.emit("FE-error-user-exist", { err: true });
        }
      });
    });

    const port = (httpServer.address() as any).port;
    socket1 = io(`http://localhost:${port}`, { transports: ["websocket"] });
    socket2 = io(`http://localhost:${port}`, { transports: ["websocket"] });
    
    await new Promise<void>((resolve) => {
      let connectedCount = 0;
      socket1.on("connect", () => { connectedCount++; if (connectedCount === 2) resolve(); });
      socket2.on("connect", () => { connectedCount++; if (connectedCount === 2) resolve(); });
    });

  });

  afterAll(async () => {
    // Clean up sockets
    if (socket1 && socket1.connected) {
      socket1.removeAllListeners();
      socket1.disconnect();
    }
    if (socket2 && socket2.connected) {
      socket2.removeAllListeners();
      socket2.disconnect();
    }
    
    // Wait for disconnection
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Clean up server
    if (ioServer) {
      ioServer.removeAllListeners();
      await ioServer.close();
    }
    
    // Close HTTP server
    if (httpServer) {
      await new Promise((resolve) => {
        httpServer.close((err: any) => {
          if (err) console.error('Error closing HTTP server:', err);
          resolve(undefined);
        });
      });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should correctly handle a new user joining a room with an existing user', async () => {
    // Correctly mock initial database state for this test
    mockVideoCall.findOne.mockResolvedValue(null);
    mockVideoCall.find.mockResolvedValue([]);
    mockVideoCall.save.mockResolvedValue(null);
    mockGroup.find.mockResolvedValue([{
      _id: ROOM_ID,
      isTemp: false,
      groupName: 'Test Group',
      currentUsers: [],
    }]);

    // Step 1: Have socket2 join the room and wait for the event
    const socket2Promise = new Promise<void>((resolve) => {
      socket2.once('FE-user-join', (data) => {
        expect(data.length).toBe(1);
        expect(data[0].userId).toBe(socket2.id);
        expect(data[0].info.userName).toBe(EXISTING_USER_ID);
        resolve();
      });
    });

    socket2.emit('BE-join-room', {
      roomId: ROOM_ID,
      userName: EXISTING_USER_ID,
      fullName: 'Existing User',
      callType: CALL_TYPE,
    });
    
    await socket2Promise;

    // Add a small delay to ensure all async operations complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Reset mocks for the second user joining
    jest.clearAllMocks();
    
    // Mock the database state for when the caller joins
    mockUSERS.find.mockResolvedValue([
      { isActiveInCall: false, applePushToken: 'token123', _id: EXISTING_USER_ID }
    ]);
    
    // Mock that there are no existing users in the call initially for the first find call
    mockVideoCall.find
      .mockResolvedValueOnce([]) // First call for checkUser
      .mockResolvedValueOnce([   // Second call for check_incomming_call
        { incommingCall: false, _id: 'call-id-123' }
      ])
      .mockResolvedValueOnce([   // Third call for checkFirebase
        { incommingCall: false }
      ]);

    mockGroup.find.mockResolvedValue([
      {
        _id: ROOM_ID,
        isTemp: false,
        groupName: 'Test Group',
        currentUsers: [new mongoose.Types.ObjectId(EXISTING_USER_ID)],
      }
    ]);

    // Mock an existing call but the new user is NOT in userActivity yet (so it goes to $push)
    mockVideoCall.findOne.mockResolvedValue({
      _id: 'existing-call-id',
      groupId: ROOM_ID,
      status: 'active',
      userActivity: [{ user: EXISTING_USER_ID, status: 'joined' }], // Only existing user, not the caller
    });
    
    mockVideoCall.updateOne.mockResolvedValue({ acknowledged: true });

    // Step 2: Have socket1 join and assert both events
    const userJoinPromise = new Promise<void>((resolve) => {
      socket1.once('FE-user-join', (data) => {
        expect(data.length).toBe(2);
        const userIds = data.map((user: any) => user.userId).sort();
        expect(userIds).toEqual(expect.arrayContaining([socket1.id, socket2.id]));
        resolve();
      });
    });

    const broadcastPromise = new Promise<void>((resolve) => {
      socket2.once('FE-user-join', (data) => {
        expect(data.length).toBe(1);
        expect(data[0].userId).toBe(socket1.id);
        expect(data[0].info.userName).toBe(CALLER_USER_ID);
        resolve();
      });
    });

    socket1.emit("BE-join-room", {
      roomId: ROOM_ID,
      userName: CALLER_USER_ID,
      fullName: CALLER_FULL_NAME,
      callType: CALL_TYPE,
    });

    await Promise.all([userJoinPromise, broadcastPromise]);

    // Add a small delay to ensure all async operations complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the calls
    expect(mockUSERS.findByIdAndUpdate).toHaveBeenCalledWith(CALLER_USER_ID, { "isActiveInCall": true });
    expect(mockGroup.find).toHaveBeenCalledWith({ _id: ROOM_ID });
    
    // ✅ FIXED: Expect the $push operation since the user is NOT in userActivity
    expect(mockVideoCall.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ 
        _id: 'existing-call-id', 
        groupId: ROOM_ID,
        status: "active"
      }),
      expect.objectContaining({
        $push: expect.objectContaining({
          userActivity: expect.objectContaining({
            user: CALLER_USER_ID,
            status: "joined"
          })
        })
      })
    );
    
    expect(mockInitializeFirebase).toHaveBeenCalled();
    expect(mockSendWebPush.sendWebPush).toHaveBeenCalled();

  }, 20000);
});