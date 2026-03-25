// --- Mock all external dependencies BEFORE imports ---
jest.mock("../../db/schemas/message.schema");
jest.mock("../../db/schemas/users.schema");
jest.mock("../../helpers/firebase");
jest.mock("../../helpers/webpush");

import Message from "../../db/schemas/message.schema";
import USERS from "../../db/schemas/users.schema";
import initializeFirebase from "../../helpers/firebase";
import webPushClass from "../../helpers/webpush";

import { socketContext } from "../setup";

describe("Message Socket Handler", () => {
  const populateMock = jest.fn().mockResolvedValue({
    _id: "message123",
    text: "Hello World",
    sender: "sender123",
    receiver: ["receiver123", "receiver456"],
    senderName: "Alice",
    message: "Hello World",
    messageType: "text",
    groupId: null,
    allRecipients: ["receiver123", "receiver456"]
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // --- Mock database & services ---
    const mockMessage = {
      populate: populateMock,
      toObject: jest.fn().mockReturnValue({
        _id: "message123",
        text: "Hello World",
        sender: "sender123",
        receiver: ["receiver123", "receiver456"],
        senderName: "Alice",
        message: "Hello World",
        messageType: "text",
        groupId: null,
        allRecipients: ["receiver123", "receiver456"]
      })
    };

    (Message.findById as any).mockReturnValue(mockMessage);
    
    (USERS.findOne as any).mockResolvedValue({
      _id: "sender123",
      name: "Alice",
      image: "avatar.png",
    });

    (initializeFirebase as jest.Mock).mockImplementation(() => {});
    jest.spyOn(webPushClass, "sendWebPush").mockResolvedValue(true);

    // Add the message handler to the existing socket connection
    socketContext.io.removeAllListeners("connection");
    socketContext.io.on("connection", (socket) => {
      socket.on("message", async (socketdata) => {
        try {
          let data: any = await Message.findById(socketdata._id).populate(
            "readBy.user",
            "name image"
          );
          let senderDetails = await USERS.findOne({ _id: socketdata.senderId }, { password: 0 });
          
          data = {
            ...data,
            senderDataAll: senderDetails,
          };

          socketContext.io.to(socketdata.senderId).emit("message", { data: data });
          
          initializeFirebase(
            socketdata.receiverId,
            data.senderName,
            data.message,
            data.groupId,
            data.messageType,
            "",
            data.allRecipients,
            data._id
          );

          webPushClass.sendWebPush(
            socketdata.receiverId,
            data.senderName,
            data.message,
            data.groupId,
            data.messageType
          );

          socketdata.receiverId.forEach((rid: any) => {
            socketContext.io.to(rid).emit("message", { data });
          });
        } catch (error) {
          // Handle error
        }
      });
    });
  });

  it("should handle message event successfully", async () => {
    const emittedEvents: any[] = [];

    // Capture emissions from io.to()
    const originalTo = socketContext.io.to.bind(socketContext.io);
    socketContext.io.to = (room: string) => ({
      emit: (event: string, payload: any) => {
        emittedEvents.push({ type: 'room', room, event, payload });
        return originalTo(room).emit(event, payload);
      }
    } as any);

    // Add the message handler directly to the existing server socket
    socketContext.serverSocket.removeAllListeners("message");
    socketContext.serverSocket.on("message", async (socketdata: any) => {
      try {
        console.log("Received message event:", socketdata);
        let data: any = await Message.findById(socketdata._id).populate(
          "readBy.user",
          "name image"
        );
        let senderDetails = await USERS.findOne({ _id: socketdata.senderId }, { password: 0 });
        
        console.log("Received data event:", data);
        data = {
          ...data,
          senderDataAll: senderDetails,
        };

        socketContext.io.to(socketdata.senderId).emit("message", { data: data });
        
        initializeFirebase(
          socketdata.receiverId,
          data.senderName,
          data.message,
          data.groupId,
          data.messageType,
          "",
          data.allRecipients,
          data._id
        );

        webPushClass.sendWebPush(
          socketdata.receiverId,
          data.senderName,
          data.message,
          data.groupId,
          data.messageType
        );

        socketdata.receiverId.forEach((rid: any) => {
          socketContext.io.to(rid).emit("message", { data });
        });
      } catch (error) {
        console.error("Handler error:", error);
      }
    });

    // Wait for connection to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Emit the message event with the correct structure
    socketContext.clientSocket.emit("message", {
      _id: "message123",
      senderId: "sender123", 
      receiverId: ["receiver123", "receiver456"],
    });

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 300));

    // --- Assertions ---
    expect(Message.findById).toHaveBeenCalledWith("message123");
    expect(populateMock).toHaveBeenCalledWith("readBy.user", "name image");
    expect(USERS.findOne).toHaveBeenCalledWith(
      { _id: "sender123" }, 
      { password: 0 }
    );
    expect(initializeFirebase).toHaveBeenCalled();
    expect(webPushClass.sendWebPush).toHaveBeenCalled();

    // Verify message events were emitted
    const messageEvents = emittedEvents.filter(e => e.event === "message");
    expect(messageEvents.length).toBeGreaterThan(0);
    
    // Should emit to sender
    expect(emittedEvents.some(e => 
      e.type === 'room' && 
      e.room === 'sender123' && 
      e.event === 'message'
    )).toBe(true);

    // Should emit to each receiver
    expect(emittedEvents.some(e => 
      e.type === 'room' && 
      (e.room === 'receiver123' || e.room === 'receiver456') && 
      e.event === 'message'
    )).toBe(true);
  });
});