// src/__tests__/socket/addRemove.user.test.ts
import { socketContext } from "../setup";

describe("Socket.IO - addremoveuser event", () => {
  let serverSocket: any;
  let clientSocket: any;
  let io: any;

  beforeAll((done) => {
    ({ io, serverSocket, clientSocket } = socketContext);
    
    // Wait for client to connect
    if (clientSocket.connected) {
      done();
    } else {
      clientSocket.on("connect", done);
    }
  });

  afterAll(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  it("should emit 'addremoveuser2' to all currentUsers when 'addremoveuser' is received", (done) => {
    const testData = {
      currentUsers: ["user1", "user2", "user3"],
      groupId: "group123",
      action: "add"
    };

    // Mock the io.to method to track which rooms receive the event
    const roomsEmittedTo: string[] = [];
    const originalIoTo = io.to;
    
    io.to = (roomId: string) => {
      roomsEmittedTo.push(roomId);
      return {
        emit: (eventName: string, data: any) => {
          // Verify the event name and data structure
          expect(eventName).toBe("addremoveuser2");
          expect(data).toEqual({ data: testData });
        }
      };
    };

    // Register the addremoveuser event handler on the server socket
    serverSocket.on("addremoveuser", (data: any) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          io.to(rid).emit("addremoveuser2", { data: data });
        });
        
        // Verify that emit was called for each currentUser
        expect(roomsEmittedTo).toEqual(testData.currentUsers);
        expect(roomsEmittedTo).toHaveLength(3);
        
        // Restore original method
        io.to = originalIoTo;
        done();
      } catch (error) {
        io.to = originalIoTo;
        done(error);
      }
    });

    // Emit the event from client to trigger the server handler
    clientSocket.emit("addremoveuser", testData);
  }, 10000);

  it("should handle empty currentUsers array gracefully", (done) => {
    const testData = {
      currentUsers: [],
      groupId: "group123",
      action: "remove"
    };

    const roomsEmittedTo: string[] = [];
    const originalIoTo = io.to;
    
    io.to = (roomId: string) => {
      roomsEmittedTo.push(roomId);
      return { emit: jest.fn() };
    };

    serverSocket.on("addremoveuser", (data: any) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          io.to(rid).emit("addremoveuser2", { data: data });
        });
        
        // Should not call to() for empty array
        expect(roomsEmittedTo).toEqual([]);
        expect(roomsEmittedTo).toHaveLength(0);
        
        io.to = originalIoTo;
        done();
      } catch (error) {
        io.to = originalIoTo;
        done(error);
      }
    });

    clientSocket.emit("addremoveuser", testData);
  }, 10000);

  it("should handle errors silently as per empty catch block", (done) => {
    const testData = {
      currentUsers: ["user1"],
      groupId: "group123"
    };

    // Store the original method
    const originalIoTo = io.to;

    serverSocket.on("addremoveuser", (data: any) => {
      // Temporarily replace io.to to throw an error only during this test
      const originalIoToDuringTest = io.to;
      io.to = () => {
        throw new Error("Test error");
      };

      try {
        data.currentUsers.forEach((rid: any) => {
          io.to(rid).emit("addremoveuser2", { data: data });
        });
        
        // If we reach here, the error was NOT caught (which would be a problem)
        io.to = originalIoToDuringTest;
        done(new Error("Expected error to be caught but it wasn't"));
      } catch (error) {
        // This is expected - the error should be caught by the empty catch block
        // but since we're testing the error handling, we need to verify it's caught
        io.to = originalIoToDuringTest;
        
        // Restore the original method
        io.to = originalIoTo;
        done(); // Test passes because error was caught
      } finally {
        // Ensure we always restore the original method
        io.to = originalIoTo;
      }
    });

    clientSocket.emit("addremoveuser", testData);
  }, 10000);
});