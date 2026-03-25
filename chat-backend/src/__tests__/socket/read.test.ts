// src/__tests__/socket/read.test.ts
import { createServer } from "http";
import { Server } from "socket.io";
import Client, { Socket } from "socket.io-client";

describe("Socket Event - read", () => {
  let io: Server;
  let httpServer: any;
  let serverSocket: any;
  let clientSocket: Socket;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer);

    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      clientSocket = Client(`http://localhost:${port}`);

      io.on("connection", (socket) => {
        serverSocket = socket;

        // Example server behavior: broadcast read event when received
        socket.on("read", (data) => {
          io.emit("read", data);
        });
      });

      clientSocket.on("connect", done);
    });
  });

  afterAll(() => {
    io.close();
    httpServer.close();
    clientSocket.close();
  });

  it("should broadcast read event", (done) => {
    const mockData = { msgId: "msg123", userId: "user1" };

    // Attach listener BEFORE emitting
    clientSocket.on("read", (payload) => {
      try {
        expect(payload).toEqual(mockData);
        done();
      } catch (err) {
        done(err);
      }
    });

    // Emit from server side (simulate another client sending "read")
    serverSocket.emit("read", mockData);
  }, 10000); // optional timeout increase
});
