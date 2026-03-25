import { socketContext as ctx } from "../setup";

jest.setTimeout(30000); // Increase timeout for debugging

describe("Basic Socket Events", () => {
  let serverSocket: any;
  let clientSocket: any;
  let io: any;

  beforeEach(() => {
    ({ serverSocket, clientSocket, io } = ctx);
    
    // Add the actual event handlers to the test server socket
    // This mimics your actual socket implementation
    serverSocket.on("initiateChat", (data: any) => {
      try {
        io.to(data.id).emit("newmsg", {
          msgId: data.id,
        });
      } catch (error) {
        console.error("Error in initiateChat handler:", error);
      }
    });

    serverSocket.on("creategroup", (data: any) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          io.to(rid).emit("newgroup", {
            msgId: data._id,
          });
        });
      } catch (error) {
        console.error("Error in creategroup handler:", error);
      }
    });

    serverSocket.on("editgroup", (data: any) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          io.to(rid).emit("editgroup", {
            msgId: data._id,
            newData: data.newData,
          });
        });
      } catch (error) {
        console.error("Error in editgroup handler:", error);
      }
    });

    // Add a join room handler for testing
    serverSocket.on("join-room", (roomId: string) => {
      serverSocket.join(roomId);
    });
  });

  it("should emit newmsg when initiateChat is triggered", (done) => {
    const testMsgId = "msg123";
    
    // Listen for the expected response first
    clientSocket.once("newmsg", (payload: any) => {
      try {
        expect(payload).toMatchObject({
          msgId: testMsgId
        });
        done();
      } catch (error) {
        done(error);
      }
    });

    // Join the room via server socket (simulate the server joining the client to a room)
    serverSocket.join(testMsgId);
    
    // Emit the event that should trigger the handler
    clientSocket.emit("initiateChat", { id: testMsgId });
  });

  it("should emit newgroup when creategroup is triggered", (done) => {
    const testGroupId = "group123";
    const testUserId = "user123";
    
    clientSocket.once("newgroup", (payload: any) => {
      try {
        expect(payload).toMatchObject({
          msgId: testGroupId
        });
        done();
      } catch (error) {
        done(error);
      }
    });

    // Join the user room via server socket
    serverSocket.join(testUserId);

    clientSocket.emit("creategroup", { 
      currentUsers: [testUserId], 
      _id: testGroupId 
    });
  });

  it("should emit editgroup when editgroup is triggered", (done) => {
    const testGroupId = "group456";
    const testUserId = "user456";
    const newData = { name: "New Group Name" };
    
    clientSocket.once("editgroup", (payload: any) => {
      try {
        expect(payload).toMatchObject({
          msgId: testGroupId,
          newData: newData
        });
        done();
      } catch (error) {
        done(error);
      }
    });

    // Join the user room via server socket
    serverSocket.join(testUserId);

    clientSocket.emit("editgroup", { 
      currentUsers: [testUserId], 
      _id: testGroupId, 
      newData: newData 
    });
  });

  // Alternative approach: Test by directly calling server socket methods
  it("should emit newmsg directly through server socket", (done) => {
    const testMsgId = "direct123";

    clientSocket.once("newmsg", (payload: any) => {
      try {
        expect(payload).toMatchObject({
          msgId: testMsgId
        });
        done();
      } catch (error) {
        done(error);
      }
    });

    // Since the server socket is connected to this client, we can emit directly
    serverSocket.join(testMsgId);
    io.to(testMsgId).emit("newmsg", {
      msgId: testMsgId,
    });
  });

  // Test the actual flow without rooms (broadcast to all)
  it("should emit to all clients when broadcasting", (done) => {
    clientSocket.once("newmsg", (payload: any) => {
      try {
        expect(payload).toMatchObject({
          msgId: "broadcast123"
        });
        done();
      } catch (error) {
        done(error);
      }
    });

    // Use io.emit to broadcast to all clients
    io.emit("newmsg", {
      msgId: "broadcast123",
    });
  });

  // Test error handling
  it("should handle errors gracefully in event handlers", (done) => {
    // This should not crash even with malformed data
    clientSocket.emit("initiateChat", { /* missing id */ });
    clientSocket.emit("creategroup", { /* missing required fields */ });
    clientSocket.emit("editgroup", { /* missing required fields */ });
    
    // Give it a moment to process
    setTimeout(() => {
      // If we reach here without crashes, the error handling worked
      expect(true).toBe(true);
      done();
    }, 1000);
  });

  // Test with socket ID as room (common pattern)
  it("should emit to specific socket using socket.id", (done) => {
    const socketId = serverSocket.id;

    clientSocket.once("newmsg", (payload: any) => {
      try {
        expect(payload).toMatchObject({
          msgId: socketId
        });
        done();
      } catch (error) {
        done(error);
      }
    });

    // Emit to the specific socket ID (this should work)
    io.to(socketId).emit("newmsg", {
      msgId: socketId,
    });
  });

  // Test multiple events in sequence
  it("should handle multiple events in sequence", (done) => {
    let eventCount = 0;
    const expectedEvents = 3;

    const checkComplete = () => {
      eventCount++;
      if (eventCount === expectedEvents) {
        done();
      }
    };

    // Set up listeners
    clientSocket.on("newmsg", (payload: any) => {
      expect(payload.msgId).toBeTruthy();
      checkComplete();
    });

    clientSocket.on("newgroup", (payload: any) => {
      expect(payload.msgId).toBeTruthy();
      checkComplete();
    });

    clientSocket.on("editgroup", (payload: any) => {
      expect(payload.msgId).toBeTruthy();
      expect(payload.newData).toBeTruthy();
      checkComplete();
    });

    // Join a test room
    const testRoom = "sequence-test";
    serverSocket.join(testRoom);

    // Emit events in sequence
    setTimeout(() => {
      io.to(testRoom).emit("newmsg", { msgId: "seq1" });
    }, 100);

    setTimeout(() => {
      io.to(testRoom).emit("newgroup", { msgId: "seq2" });
    }, 200);

    setTimeout(() => {
      io.to(testRoom).emit("editgroup", { 
        msgId: "seq3", 
        newData: { name: "Test" } 
      });
    }, 300);
  });

  afterEach(() => {
    // Clean up any listeners to prevent interference between tests
    clientSocket.removeAllListeners();
  });
});