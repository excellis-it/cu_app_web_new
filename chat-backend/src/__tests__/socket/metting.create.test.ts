import { socketContext } from "../setup"; // adjust import path to your setup file
import { Server } from "socket.io";

describe("Socket.IO - meeting_created event", () => {
  let io: Server;
  let clientSocket: any;
  let serverSocket: any;

  beforeAll(() => {
    io = socketContext.io;
    clientSocket = socketContext.clientSocket;
    serverSocket = socketContext.serverSocket;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should broadcast meeting_created to specified room ids", (done) => {
    const testData = {
      currentUsers: [serverSocket.id], // tell server to emit to this socket
      meetingId: "meeting123",
    };

    // Listen for meeting_created on the client
    clientSocket.on("meeting_created", (payload: any) => {
      try {
        console.log("Client received meeting_created:", payload);
        expect(payload.meetingId).toBe("meeting123");
        expect(payload.currentUsers).toContain(serverSocket.id);
        done();
      } catch (err) {
        done(err);
      }
    });

    // Simulate the server receiving meeting_created from this socket
    serverSocket.emit("meeting_created", testData);
  });
});
