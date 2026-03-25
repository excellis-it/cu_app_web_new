// src/__tests__/socket/updateGroup.debug.test.ts
import { socketContext } from "../setup";

describe("Debug Socket Connection", () => {
  let serverSocket: any;
  let clientSocket: any;

  beforeAll((done) => {
    ({ serverSocket, clientSocket } = socketContext);
    
    console.log("Testing connection...");
    
    clientSocket.on("connect", () => {
      console.log("Client connected successfully");
      done();
    });

    clientSocket.on("connect_error", (error: any) => {
      console.log("Connection error:", error);
      done(error);
    });
  });

  afterAll(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  it("should test basic socket communication", (done) => {
    console.log("Testing basic emit/on...");
    
    // Test if server can receive events
    serverSocket.on("test_event", (data: any) => {
      console.log("Server received test_event:", data);
      serverSocket.emit("test_response", { received: true });
    });

    clientSocket.on("test_response", (data: any) => {
      console.log("Client received test_response:", data);
      expect(data.received).toBe(true);
      done();
    });

    clientSocket.emit("test_event", { message: "hello" });
  }, 5000);

  it("should test if update-group event is received by server", (done) => {
    let eventReceived = false;
    
    serverSocket.on("update-group", (data: any) => {
      console.log("Server received update-group:", data);
      eventReceived = true;
      done();
    });

    clientSocket.emit("update-group", { test: "data" });

    // Fallback timeout
    setTimeout(() => {
      if (!eventReceived) {
        done(new Error("update-group event not received by server"));
      }
    }, 1000);
  }, 5000);
});