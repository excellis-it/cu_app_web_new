// leave-room.test.ts
import { Server } from "socket.io";
import { createServer } from "http";
import ioClient, { Socket } from "socket.io-client";

let io: Server;
let httpServer: any;
let httpServerAddr: any;
let clientSocket1: Socket;
let clientSocket2: Socket;
let roomUsers: Record<string, string[]>;

beforeAll((done) => {
  httpServer = createServer();
  io = new Server(httpServer);
  httpServer.listen(() => {
    httpServerAddr = httpServer.address();
    const url = `http://127.0.0.1:${httpServerAddr.port}`;

    roomUsers = {};

    io.on("connection", (socket) => {
      socket.on("BE-leave-room", ({ roomId, leaver }) => {
        roomUsers[roomId] = (roomUsers[roomId] || []).filter(u => u !== leaver);
        socket.emit("FE-user-leave", { userName: leaver, roomId });
        socket.to(roomId).emit("FE-leave", { userName: leaver, roomId });
        if ((roomUsers[roomId] || []).length === 0) {
          io.in(roomId).emit("FE-call-ended", { userName: leaver, roomId });
        }
        socket.leave(roomId);
      });

      socket.on("BE-join-room", ({ roomId, user }) => {
        socket.join(roomId);
        roomUsers[roomId] = (roomUsers[roomId] || []).concat(user);
      });
    });

    clientSocket1 = ioClient(url);
    clientSocket2 = ioClient(url);

    clientSocket1.emit("BE-join-room", { roomId: "room123", user: "user1" });
    clientSocket2.emit("BE-join-room", { roomId: "room123", user: "user2" });

    // Wait for clients to fully join the room and synchronize
    setTimeout(done, 300);
  });
});

afterAll(async () => {
  clientSocket1.removeAllListeners();
  clientSocket2.removeAllListeners();
  clientSocket1.disconnect();
  clientSocket2.disconnect();
  io.close();
  httpServer.close();
});

it("should emit FE-user-leave when a user leaves the room", (done) => {
  clientSocket1.once("FE-user-leave", (data) => {
    expect(data).toMatchObject({ userName: "user1", roomId: "room123" });
    done();
  });
  clientSocket1.emit("BE-leave-room", { roomId: "room123", leaver: "user1" });
});


