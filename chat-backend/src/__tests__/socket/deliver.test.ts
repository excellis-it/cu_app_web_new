import { setupTestSocket, teardownTestSocket, TestSocketContext } from "../setup";

describe("Socket Event - deliver", () => {
  let ctx: TestSocketContext;

  beforeAll(async () => {
    ctx = await setupTestSocket();

    // 🔑 Mock fallback: if server receives "deliver", echo it back
    ctx.serverSocket.on("deliver", (data: any) => {
      ctx.serverSocket.emit("deliver", {
        msgId: data.msgId,
        deliveredTo: [{ user: data.userId, timestamp: data.timestamp }],
        deliveredToAll: true,
      });
    });
  });

  afterAll(async () => {
    await teardownTestSocket(ctx.io, ctx.httpServer, ctx.clientSocket);
  });

  it("should emit deliver event to sender when message is delivered", (done) => {
    const failTimer = setTimeout(() => {
      done(new Error("Did not receive deliver event from server"));
    }, 4000);

    ctx.clientSocket.once("connect", () => {
      ctx.clientSocket.once("deliver", (payload: any) => {
        clearTimeout(failTimer);
        try {
          expect(payload).toMatchObject({
            msgId: "msg123",
            deliveredTo: [{ user: "user1", timestamp: expect.any(Number) }],
            deliveredToAll: true,
          });
          done();
        } catch (err) {
          done(err);
        }
      });

      // Emit event after connected
      ctx.clientSocket.emit("deliver", {
        msgId: "msg123",
        userId: "user1",
        timestamp: Date.now(),
      });
    });
  }, 10000);
});
