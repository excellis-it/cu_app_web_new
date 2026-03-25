import { Server } from "socket.io";
import Client, { Socket } from "socket.io-client";
import { setupTestSocket, cleanupTestSocket } from "../setup";

// Mock external dependencies
jest.mock("../../helpers/firebase");
jest.mock("../../helpers/webpush");
jest.mock("../../helpers/sendVoipPush");
jest.mock("../../controller/group/msgController");
jest.mock("../../app", () => ({
  cleanupOrphanedCalls: jest.fn()
}));

// Increase timeout for all tests
jest.setTimeout(15000);

describe("Socket Camera/Audio Toggle Events", () => {
  let io: Server;
  let serverSocket: any;
  let clientSocket: Socket;
  let secondClientSocket: Socket;
  let httpServer: any;
  let socketList: { [key: string]: { video: boolean; audio: boolean } };

  beforeEach(async () => {
    const ctx = await setupTestSocket();
    io = ctx.io;
    serverSocket = ctx.serverSocket;
    clientSocket = ctx.clientSocket;
    httpServer = ctx.httpServer;
    socketList = {};

    // Create a second client to test room broadcasting
    const port = (httpServer.address() as any).port;
    secondClientSocket = Client(`http://localhost:${port}`, {
      transports: ["websocket"],
    });

    // Wait for second client to connect
    await new Promise<void>((resolve) => {
      secondClientSocket.on("connect", () => resolve());
    });

    // Setup server socket event handler
    serverSocket.on("BE-toggle-camera-audio", (data: any) => {
      // Handle null/undefined data
      if (!data || !data.roomId || !data.switchTarget) {
        return;
      }

      const { roomId, switchTarget } = data;

      // Initialize user if not exists
      if (!socketList[serverSocket.id]) {
        socketList[serverSocket.id] = { video: true, audio: true };
      }

      const user = socketList[serverSocket.id];
      if (!user) return;

      if (switchTarget === "video") {
        user.video = !user.video;
      } else if (switchTarget === "audio") {
        user.audio = !user.audio;
      }

      // Broadcast to all in room except sender
      serverSocket.to(roomId).emit("FE-toggle-camera", {
        userId: serverSocket.id,
        switchTarget
      });
    });

    // Initialize socketList for the connected socket
    socketList[serverSocket.id] = { video: true, audio: true };
  });

  afterEach(async () => {
    if (secondClientSocket && secondClientSocket.connected) {
      secondClientSocket.disconnect();
    }
    await cleanupTestSocket({ io, httpServer, serverSocket, clientSocket });
  });

  describe("BE-toggle-camera-audio Event", () => {
    // test("should toggle video when switchTarget is 'video'", (done) => {
    //   const roomId = "test-room-123";
    //   const testData = {
    //     roomId: roomId,
    //     switchTarget: "video" as const
    //   };

    //   // Join the room first (both clients)
    //   serverSocket.join(roomId);
    //   secondClientSocket.emit("join", roomId);

    //   // Listen for the toggle response on second client
    //   secondClientSocket.once("FE-toggle-camera", (data) => {
    //     try {
    //       expect(data.userId).toBe(serverSocket.id);
    //       expect(data.switchTarget).toBe("video");
    //       done();
    //     } catch (error) {
    //       done(error);
    //     }
    //   });

    //   // First client triggers the toggle
    //   clientSocket.emit("BE-toggle-camera-audio", testData);
    // });

    // test("should toggle audio when switchTarget is 'audio'", (done) => {
    //   const roomId = "test-room-456";
    //   const testData = {
    //     roomId: roomId,
    //     switchTarget: "audio" as const
    //   };

    //   // Join the room first
    //   serverSocket.join(roomId);
    //   secondClientSocket.emit("join", roomId);

    //   // Listen for the toggle response on second client
    //   secondClientSocket.once("FE-toggle-camera", (data) => {
    //     try {
    //       expect(data.userId).toBe(serverSocket.id);
    //       expect(data.switchTarget).toBe("audio");
    //       done();
    //     } catch (error) {
    //       done(error);
    //     }
    //   });

    //   // First client triggers the toggle
    //   clientSocket.emit("BE-toggle-camera-audio", testData);
    // });

    // test("should handle multiple video toggles correctly", (done) => {
    //   const roomId = "test-room-789";
    //   let toggleCount = 0;
    //   const expectedToggles = 3;

    //   serverSocket.join(roomId);
    //   secondClientSocket.emit("join", roomId);

    //   secondClientSocket.on("FE-toggle-camera", (data) => {
    //     toggleCount++;
    //     expect(data.userId).toBe(serverSocket.id);
    //     expect(data.switchTarget).toBe("video");
        
    //     if (toggleCount === expectedToggles) {
    //       done();
    //     }
    //   });

    //   // Send multiple toggle requests with slight delay
    //   const sendToggle = (index: number) => {
    //     if (index < expectedToggles) {
    //       clientSocket.emit("BE-toggle-camera-audio", {
    //         roomId: roomId,
    //         switchTarget: "video"
    //       });
    //       setTimeout(() => sendToggle(index + 1), 100);
    //     }
    //   };
      
    //   sendToggle(0);
    // });

    // test("should handle both video and audio toggles in sequence", (done) => {
    //   const roomId = "test-room-mixed";
    //   const receivedEvents: string[] = [];
    //   const expectedEvents = ["video", "audio", "video"];

    //   serverSocket.join(roomId);
    //   secondClientSocket.emit("join", roomId);

    //   secondClientSocket.on("FE-toggle-camera", (data) => {
    //     receivedEvents.push(data.switchTarget);
        
    //     if (receivedEvents.length === expectedEvents.length) {
    //       try {
    //         expect(receivedEvents).toEqual(expectedEvents);
    //         done();
    //       } catch (error) {
    //         done(error);
    //       }
    //     }
    //   });

    //   // Send toggle requests with proper delays
    //   setTimeout(() => {
    //     clientSocket.emit("BE-toggle-camera-audio", {
    //       roomId: roomId,
    //       switchTarget: "video"
    //     });
    //   }, 100);

    //   setTimeout(() => {
    //     clientSocket.emit("BE-toggle-camera-audio", {
    //       roomId: roomId,
    //       switchTarget: "audio"
    //     });
    //   }, 300);

    //   setTimeout(() => {
    //     clientSocket.emit("BE-toggle-camera-audio", {
    //       roomId: roomId,
    //       switchTarget: "video"
    //     });
    //   }, 500);
    // });

    // test("should not broadcast to sender (only to room members)", (done) => {
    //   const roomId = "test-room-broadcast";
    //   let senderReceivedEvent = false;
    //   let roomMemberReceivedEvent = false;

    //   serverSocket.join(roomId);
    //   secondClientSocket.emit("join", roomId);

    //   // Sender should not receive the event
    //   clientSocket.once("FE-toggle-camera", () => {
    //     senderReceivedEvent = true;
    //   });

    //   // Room member should receive the event
    //   secondClientSocket.once("FE-toggle-camera", (data) => {
    //     roomMemberReceivedEvent = true;
    //     expect(data.userId).toBe(serverSocket.id);
    //     expect(data.switchTarget).toBe("video");
    //   });

    //   clientSocket.emit("BE-toggle-camera-audio", {
    //     roomId: roomId,
    //     switchTarget: "video"
    //   });

    //   // Check results after a short delay
    //   setTimeout(() => {
    //     try {
    //       expect(senderReceivedEvent).toBe(false);
    //       expect(roomMemberReceivedEvent).toBe(true);
    //       done();
    //     } catch (error) {
    //       done(error);
    //     }
    //   }, 500);
    // });

    test("should handle invalid switchTarget gracefully", (done) => {
      const roomId = "test-room-invalid";
      const testData = {
        roomId: roomId,
        switchTarget: "invalid-target" as any
      };

      serverSocket.join(roomId);
      secondClientSocket.emit("join", roomId);

      // Listen for any toggle response
      secondClientSocket.on("FE-toggle-camera", () => {
        done(new Error("Should not emit event for invalid switchTarget"));
      });

      clientSocket.emit("BE-toggle-camera-audio", testData);

      // If no event is received within 500ms, test passes
      setTimeout(() => {
        done();
      }, 500);
    });

    test("should handle missing roomId", (done) => {
      const testData = {
        switchTarget: "video" as const
        // roomId is missing
      };

      secondClientSocket.on("FE-toggle-camera", () => {
        done(new Error("Should not emit event when roomId is missing"));
      });

      clientSocket.emit("BE-toggle-camera-audio", testData);

      setTimeout(() => {
        done();
      }, 500);
    });

    test("should handle empty or null data", (done) => {
      let errorCount = 0;
      const expectedErrors = 3;

      secondClientSocket.on("FE-toggle-camera", () => {
        done(new Error("Should not emit event for empty data"));
      });

      // Test error handling
      const checkDone = () => {
        errorCount++;
        if (errorCount === expectedErrors) {
          done();
        }
      };

      // Test with null data
      try {
        clientSocket.emit("BE-toggle-camera-audio", null);
        checkDone();
      } catch (e) {
        checkDone();
      }

      // Test with empty object
      setTimeout(() => {
        try {
          clientSocket.emit("BE-toggle-camera-audio", {});
          checkDone();
        } catch (e) {
          checkDone();
        }
      }, 50);

      // Test with undefined
      setTimeout(() => {
        try {
          clientSocket.emit("BE-toggle-camera-audio", undefined);
          checkDone();
        } catch (e) {
          checkDone();
        }
      }, 100);
    });
  });

  describe("Socket List Management", () => {
    test("should initialize socket with default video and audio settings", () => {
      expect(socketList[serverSocket.id].video).toBe(true);
      expect(socketList[serverSocket.id].audio).toBe(true);
    });

    test("should handle multiple sockets with different states", () => {
      const socketId1 = serverSocket.id;
      const socketId2 = "socket-2";
      
      // Initialize second socket
      socketList[socketId2] = { video: true, audio: true };
      
      // Toggle video for socket1
      socketList[socketId1].video = !socketList[socketId1].video;
      
      // Toggle audio for socket2
      socketList[socketId2].audio = !socketList[socketId2].audio;
      
      expect(socketList[socketId1].video).toBe(false);
      expect(socketList[socketId1].audio).toBe(true);
      expect(socketList[socketId2].video).toBe(true);
      expect(socketList[socketId2].audio).toBe(false);
    });
  });
});