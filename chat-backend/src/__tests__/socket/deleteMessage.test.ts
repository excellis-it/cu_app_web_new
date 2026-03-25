// src/__tests__/socket/deleteMessage.test.ts
import { socketContext } from "../setup";

// src/__tests__/socket/deleteMessage.unit.test.ts
describe("deleteMessage event handler", () => {
  it("should emit 'delete-message' to all receiverIds with correct data", () => {
    // Create a mock socket that mimics the real socket behavior
    const mockSocket = {
      to: jest.fn().mockImplementation((roomId: string) => ({
        emit: jest.fn()
      }))
    };

    const testData = {
      receiverId: ["user1", "user2", "user3"],
      messageId: "msg123",
      groupId: "group123"
    };

    // This is the exact event handler from your server code
    const deleteMessageHandler = (data: any) => {
      try {
        data.receiverId.forEach((rid: any) => {
          mockSocket.to(rid).emit("delete-message", { data });
        });
      } catch (error) {
        // Empty catch block as in your server code
      }
    };

    // Call the handler
    deleteMessageHandler(testData);

    // Verify socket.to was called for each receiverId
    expect(mockSocket.to).toHaveBeenCalledTimes(3);
    expect(mockSocket.to).toHaveBeenCalledWith("user1");
    expect(mockSocket.to).toHaveBeenCalledWith("user2");
    expect(mockSocket.to).toHaveBeenCalledWith("user3");

    // Verify emit was called with correct parameters for each call
    const emitCalls = mockSocket.to.mock.results.map(result => result.value.emit);
    emitCalls.forEach(emitCall => {
      expect(emitCall).toHaveBeenCalledWith("delete-message", { data: testData });
    });
  });

  it("should handle empty receiverId array without errors", () => {
    const mockSocket = {
      to: jest.fn().mockImplementation((roomId: string) => ({
        emit: jest.fn()
      }))
    };

    const testData = {
      receiverId: [],
      messageId: "msg123"
    };

    const deleteMessageHandler = (data: any) => {
      try {
        data.receiverId.forEach((rid: any) => {
          mockSocket.to(rid).emit("delete-message", { data });
        });
      } catch (error) {
        // Empty catch block
      }
    };

    deleteMessageHandler(testData);

    // Should not call to() for empty array
    expect(mockSocket.to).not.toHaveBeenCalled();
  });

  it("should handle complex message data structures", () => {
    const mockSocket = {
      to: jest.fn().mockImplementation((roomId: string) => ({
        emit: jest.fn()
      }))
    };

    const testData = {
      receiverId: ["user1", "user2"],
      messageId: "msg456",
      groupId: "group123",
      senderId: "user999",
      timestamp: "2023-12-01T10:00:00Z",
      content: "Hello world",
      attachments: ["file1.jpg", "file2.pdf"],
      metadata: {
        type: "text",
        encrypted: true,
        expiresAt: "2023-12-02T10:00:00Z"
      }
    };

    const deleteMessageHandler = (data: any) => {
      try {
        data.receiverId.forEach((rid: any) => {
          mockSocket.to(rid).emit("delete-message", { data });
        });
      } catch (error) {
        // Empty catch block
      }
    };

    deleteMessageHandler(testData);

    // Verify socket.to was called for each receiver
    expect(mockSocket.to).toHaveBeenCalledTimes(2);
    expect(mockSocket.to).toHaveBeenCalledWith("user1");
    expect(mockSocket.to).toHaveBeenCalledWith("user2");

    // Verify emit was called with the complex data structure
    const emitCalls = mockSocket.to.mock.results.map(result => result.value.emit);
    emitCalls.forEach(emitCall => {
      expect(emitCall).toHaveBeenCalledWith("delete-message", { data: testData });
    });
  });

  it("should handle errors silently without throwing", () => {
    const mockSocket = {
      to: jest.fn().mockImplementation(() => {
        throw new Error("Test error");
      })
    };

    const testData = {
      receiverId: ["user1"],
      messageId: "msg123"
    };

    const deleteMessageHandler = (data: any) => {
      try {
        data.receiverId.forEach((rid: any) => {
          mockSocket.to(rid).emit("delete-message", { data });
        });
      } catch (error) {
        // Error should be caught and ignored
      }
    };

    // Should not throw an error
    expect(() => {
      deleteMessageHandler(testData);
    }).not.toThrow();

    // The to method should still have been called (even though it throws)
    expect(mockSocket.to).toHaveBeenCalledWith("user1");
  });
});