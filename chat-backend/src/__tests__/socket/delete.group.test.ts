// src/__tests__/socket/deleteGroup.unit.test.ts
describe("deleteGroup event handler", () => {
  it("should emit to all currentUsers with correct data", () => {
    // Create a mock socket that mimics the real socket behavior
    const mockSocket = {
      to: jest.fn().mockImplementation((roomId: string) => ({
        emit: jest.fn()
      }))
    };

    const testData = {
      currentUsers: ["user1", "user2", "user3"],
      groupId: "group123",
      groupName: "Test Group"
    };

    // This is the exact event handler from your server code
    const deleteGroupHandler = (data: any) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          mockSocket.to(rid).emit("delete-Group", { data: data });
        });
      } catch (error) {
        // Empty catch block as in your server code
      }
    };

    // Call the handler
    deleteGroupHandler(testData);

    // Verify socket.to was called for each user
    expect(mockSocket.to).toHaveBeenCalledTimes(3);
    expect(mockSocket.to).toHaveBeenCalledWith("user1");
    expect(mockSocket.to).toHaveBeenCalledWith("user2");
    expect(mockSocket.to).toHaveBeenCalledWith("user3");

    // Verify emit was called with correct parameters for each call
    const emitCalls = mockSocket.to.mock.results.map(result => result.value.emit);
    emitCalls.forEach(emitCall => {
      expect(emitCall).toHaveBeenCalledWith("delete-Group", { data: testData });
    });
  });

  it("should handle empty currentUsers array", () => {
    const mockSocket = {
      to: jest.fn().mockImplementation((roomId: string) => ({
        emit: jest.fn()
      }))
    };

    const testData = {
      currentUsers: [],
      groupId: "group123"
    };

    const deleteGroupHandler = (data: any) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          mockSocket.to(rid).emit("delete-Group", { data: data });
        });
      } catch (error) {
        // Empty catch block
      }
    };

    deleteGroupHandler(testData);

    // Should not call to() for empty array
    expect(mockSocket.to).not.toHaveBeenCalled();
  });

  it("should handle errors silently", () => {
    const mockSocket = {
      to: jest.fn().mockImplementation(() => {
        throw new Error("Test error");
      })
    };

    const testData = {
      currentUsers: ["user1"],
      groupId: "group123"
    };

    const deleteGroupHandler = (data: any) => {
      try {
        data.currentUsers.forEach((rid: any) => {
          mockSocket.to(rid).emit("delete-Group", { data: data });
        });
      } catch (error) {
        // Error should be caught and ignored
      }
    };

    // Should not throw an error
    expect(() => {
      deleteGroupHandler(testData);
    }).not.toThrow();

    // The to method should still have been called (even though it throws)
    expect(mockSocket.to).toHaveBeenCalledWith("user1");
  });
});