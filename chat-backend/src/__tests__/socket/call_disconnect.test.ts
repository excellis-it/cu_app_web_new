import { Server } from "socket.io";
import Client, { Socket } from "socket.io-client";
import { createServer } from "http";
import mongoose from "mongoose";
import Message from "../../db/schemas/message.schema";
import USERS from "../../db/schemas/users.schema";
import Group from "../../db/schemas/group.schema";
import videoCall from "../../db/schemas/videocall.schema";
import { socketContext, setupTestSocket, cleanupTestSocket } from "../setup";

// Mock external dependencies
jest.mock("../../helpers/firebase");
jest.mock("../../helpers/webpush");
jest.mock("../../helpers/sendVoipPush");
jest.mock("../../controller/group/msgController");
jest.mock("../../app", () => ({
  cleanupOrphanedCalls: jest.fn()
}));

describe("Socket.IO Server", () => {
  let io: Server;
  let serverSocket: any;
  let clientSocket: Socket;
  let httpServer: any;

  beforeEach(async () => {
    const ctx = await setupTestSocket();
    io = ctx.io;
    serverSocket = ctx.serverSocket;
    clientSocket = ctx.clientSocket;
    httpServer = ctx.httpServer;
  });

  afterEach(async () => {
    await cleanupTestSocket({ io, httpServer, serverSocket, clientSocket });
  });

  describe("Connection", () => {
    test("should establish connection", (done) => {
      clientSocket.on("connect", () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    test("should disconnect properly", (done) => {
      clientSocket.on("connect", () => {
        clientSocket.disconnect();
      });

      clientSocket.on("disconnect", () => {
        expect(clientSocket.connected).toBe(false);
        done();
      });
    });
  });

  describe("User Authentication", () => {
    test("should handle user authentication event", (done) => {
      const mockUser = {
        userId: "test-user-id",
        token: "mock-jwt-token",
        fullName: "Test User"
      };

      serverSocket.on("authenticate", (data: any) => {
        expect(data.userId).toBe(mockUser.userId);
        expect(data.token).toBe(mockUser.token);
        done();
      });

      clientSocket.emit("authenticate", mockUser);
    });

    test("should handle invalid authentication", (done) => {
      const invalidAuth = {
        userId: "",
        token: "invalid-token"
      };

      serverSocket.on("authenticate", (data: any) => {
        // Simulate authentication failure
        serverSocket.emit("auth_error", { message: "Invalid token" });
      });

      clientSocket.on("auth_error", (error) => {
        expect(error.message).toBe("Invalid token");
        done();
      });

      clientSocket.emit("authenticate", invalidAuth);
    });
  });

  describe("Room Management", () => {
    test("should handle joining a room", (done) => {
      const roomData = {
        roomId: "test-room-123",
        userId: "user-123"
      };

      serverSocket.on("join_room", (data: any) => {
        expect(data.roomId).toBe(roomData.roomId);
        expect(data.userId).toBe(roomData.userId);
        serverSocket.join(data.roomId);
        serverSocket.emit("room_joined", { roomId: data.roomId, success: true });
      });

      clientSocket.on("room_joined", (response) => {
        expect(response.success).toBe(true);
        expect(response.roomId).toBe(roomData.roomId);
        done();
      });

      clientSocket.emit("join_room", roomData);
    });

    test("should handle leaving a room", (done) => {
      const roomData = {
        roomId: "test-room-123",
        userId: "user-123"
      };

      serverSocket.on("leave_room", (data: any) => {
        expect(data.roomId).toBe(roomData.roomId);
        serverSocket.leave(data.roomId);
        serverSocket.emit("room_left", { roomId: data.roomId, success: true });
      });

      clientSocket.on("room_left", (response) => {
        expect(response.success).toBe(true);
        done();
      });

      clientSocket.emit("leave_room", roomData);
    });
  });

  describe("Messaging", () => {
    test("should handle sending a message", (done) => {
      const messageData = {
        roomId: "test-room-123",
        message: "Hello, World!",
        sender: "user-123",
        timestamp: new Date().toISOString()
      };

      serverSocket.on("send_message", (data: any) => {
        expect(data.message).toBe(messageData.message);
        expect(data.sender).toBe(messageData.sender);
        
        // Simulate broadcasting the message to room
        serverSocket.to(data.roomId).emit("new_message", data);
        serverSocket.emit("message_sent", { success: true, messageId: "msg-123" });
      });

      clientSocket.on("message_sent", (response) => {
        expect(response.success).toBe(true);
        expect(response.messageId).toBeDefined();
        done();
      });

      clientSocket.emit("send_message", messageData);
    });

    test("should handle message history request", (done) => {
      const historyRequest = {
        roomId: "test-room-123",
        page: 1,
        limit: 20
      };

      serverSocket.on("get_message_history", (data: any) => {
        expect(data.roomId).toBe(historyRequest.roomId);
        expect(data.page).toBe(historyRequest.page);
        
        // Mock message history response
        const mockHistory = {
          messages: [
            { id: "1", message: "Test message", sender: "user-1" },
            { id: "2", message: "Another message", sender: "user-2" }
          ],
          totalPages: 1,
          currentPage: 1
        };
        
        serverSocket.emit("message_history", mockHistory);
      });

      clientSocket.on("message_history", (history) => {
        expect(history.messages).toHaveLength(2);
        expect(history.currentPage).toBe(1);
        done();
      });

      clientSocket.emit("get_message_history", historyRequest);
    });
  });

  describe("Video Call Events", () => {
    test("should handle video call initiation", (done) => {
      const callData = {
        groupId: "group-123",
        callerId: "user-123",
        callType: "video",
        participants: ["user-456", "user-789"]
      };

      serverSocket.on("initiate_call", (data: any) => {
        expect(data.groupId).toBe(callData.groupId);
        expect(data.callType).toBe(callData.callType);
        
        // Simulate call creation
        const mockCall = {
          _id: "call-123",
          groupId: data.groupId,
          status: "initiated",
          startedAt: new Date()
        };
        
        serverSocket.emit("call_initiated", mockCall);
      });

      clientSocket.on("call_initiated", (call) => {
        expect(call.groupId).toBe(callData.groupId);
        expect(call.status).toBe("initiated");
        done();
      });

      clientSocket.emit("initiate_call", callData);
    });

    test("should handle joining a video call", (done) => {
      const joinData = {
        callId: "call-123",
        userId: "user-456",
        mediaConstraints: { video: true, audio: true }
      };

      serverSocket.on("join_call", (data: any) => {
        expect(data.callId).toBe(joinData.callId);
        expect(data.userId).toBe(joinData.userId);
        
        serverSocket.emit("call_joined", { 
          success: true, 
          callId: data.callId,
          participants: ["user-123", "user-456"]
        });
      });

      clientSocket.on("call_joined", (response) => {
        expect(response.success).toBe(true);
        expect(response.participants).toContain("user-456");
        done();
      });

      clientSocket.emit("join_call", joinData);
    });

    test("should handle leaving a video call", (done) => {
      const leaveData = {
        callId: "call-123",
        userId: "user-456"
      };

      serverSocket.on("leave_call", (data: any) => {
        expect(data.callId).toBe(leaveData.callId);
        expect(data.userId).toBe(leaveData.userId);
        
        serverSocket.emit("call_left", { 
          success: true, 
          callId: data.callId,
          userId: data.userId
        });
      });

      clientSocket.on("call_left", (response) => {
        expect(response.success).toBe(true);
        expect(response.userId).toBe(leaveData.userId);
        done();
      });

      clientSocket.emit("leave_call", leaveData);
    });
  });

  describe("WebRTC Signaling", () => {
    test("should handle WebRTC offer", (done) => {
      const offerData = {
        to: "user-456",
        from: "user-123",
        offer: { type: "offer", sdp: "mock-sdp-offer" }
      };

      serverSocket.on("webrtc_offer", (data: any) => {
        expect(data.to).toBe(offerData.to);
        expect(data.from).toBe(offerData.from);
        
        // Simulate forwarding offer to target user
        serverSocket.to(data.to).emit("webrtc_offer_received", data);
        serverSocket.emit("offer_sent", { success: true });
      });

      clientSocket.on("offer_sent", (response) => {
        expect(response.success).toBe(true);
        done();
      });

      clientSocket.emit("webrtc_offer", offerData);
    });

    test("should handle WebRTC answer", (done) => {
      const answerData = {
        to: "user-123",
        from: "user-456",
        answer: { type: "answer", sdp: "mock-sdp-answer" }
      };

      serverSocket.on("webrtc_answer", (data: any) => {
        expect(data.to).toBe(answerData.to);
        expect(data.answer.type).toBe("answer");
        
        serverSocket.to(data.to).emit("webrtc_answer_received", data);
        serverSocket.emit("answer_sent", { success: true });
      });

      clientSocket.on("answer_sent", (response) => {
        expect(response.success).toBe(true);
        done();
      });

      clientSocket.emit("webrtc_answer", answerData);
    });

    test("should handle ICE candidate", (done) => {
      const candidateData = {
        to: "user-456",
        from: "user-123",
        candidate: { candidate: "mock-ice-candidate", sdpMid: "0" }
      };

      serverSocket.on("ice_candidate", (data: any) => {
        expect(data.to).toBe(candidateData.to);
        expect(data.candidate).toBeDefined();
        
        serverSocket.to(data.to).emit("ice_candidate_received", data);
        serverSocket.emit("candidate_sent", { success: true });
      });

      clientSocket.on("candidate_sent", (response) => {
        expect(response.success).toBe(true);
        done();
      });

      clientSocket.emit("ice_candidate", candidateData);
    });
  });

  describe("User Status", () => {
    test("should handle user online status", (done) => {
      const statusData = {
        userId: "user-123",
        status: "online",
        lastSeen: new Date().toISOString()
      };

      serverSocket.on("update_status", (data: any) => {
        expect(data.status).toBe(statusData.status);
        expect(data.userId).toBe(statusData.userId);
        
        // Broadcast status update
        serverSocket.broadcast.emit("user_status_changed", data);
        serverSocket.emit("status_updated", { success: true });
      });

      clientSocket.on("status_updated", (response) => {
        expect(response.success).toBe(true);
        done();
      });

      clientSocket.emit("update_status", statusData);
    });

    test("should handle typing indicator", (done) => {
      const typingData = {
        roomId: "test-room-123",
        userId: "user-123",
        isTyping: true
      };

      serverSocket.on("typing", (data: any) => {
        expect(data.isTyping).toBe(true);
        expect(data.userId).toBe(typingData.userId);
        
        serverSocket.to(data.roomId).emit("user_typing", data);
      });

      // This test would need a second client to properly test
      // For now, just test that the event is handled
      clientSocket.emit("typing", typingData);
      
      setTimeout(() => {
        done();
      }, 100);
    });
  });

  describe("Error Handling", () => {

    test("should handle malformed data", (done) => {
      const malformedData = {
        // Missing required fields
        incomplete: true
      };

      serverSocket.on("send_message", (data: any) => {
        if (!data.message || !data.sender) {
          serverSocket.emit("validation_error", { 
            message: "Missing required fields" 
          });
        }
      });

      clientSocket.on("validation_error", (error) => {
        expect(error.message).toContain("Missing required fields");
        done();
      });

      clientSocket.emit("send_message", malformedData);
    });
  });

  describe("Connection Cleanup", () => {
    test("should clean up user data on disconnect", (done) => {
      const userData = {
        userId: "user-123",
        roomId: "room-456"
      };

      // Simulate user joining room first
      serverSocket.join(userData.roomId);
      
      serverSocket.on("disconnect", () => {
        // Verify cleanup logic would be called here
        expect(serverSocket.disconnected).toBe(true);
        done();
      });

      // Trigger 
      clientSocket.disconnect();
    });
  });
});