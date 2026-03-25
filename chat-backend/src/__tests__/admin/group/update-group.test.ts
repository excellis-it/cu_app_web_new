import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";
jest.setTimeout(20000);

describe("Admin Update Group", () => {
  it("PUT /api/admin/groups/update-group → should update group details", async () => {
    try {
    const data:any = await signInAdmin();
    const groupRes = await request(app)
      .post("/api/groups/create")
      .set("access-token", data.data.token)
      .field("groupName", "Initial Group")
      .field("groupDescription", "Initial Description")
      .field("users", JSON.stringify([]));
    expect(groupRes.status).toBe(200);
    expect(groupRes.body.success).toBe(true);
    const groupId = groupRes.body.data._id;
    console.log("Created group ID:",groupRes.body);
    // 3. Call update-group endpoint
    const res = await request(app)
      .post("/api/admin/groups/update")
      .set("access-token", data.data.token)
      .send({
        groupId,
        groupName: "Updated Group Name",
        groupDescription: "Updated Description",
        users: groupRes.body.data.users || [],
      });
      console.log("Update group response:", res.body);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("_id");
    expect(res.body.data.groupName).toBe("Updated Group Name");
    expect(res.body.data.groupDescription).toBe("Updated Description");
    } catch (error) {
        console.error("Error during test execution:", error);
        throw error;
    }
  });

  it("should return 404 if group not found", async () => {
    const data:any = await signInAdmin();

    const res = await request(app)
      .put("/api/admin/groups/update-group")
      .set("access-token", data.data.token)
      .send({
        groupId: "64b64c4f4f4f4f4f4f4f4f4f", // Non-existent ID
        groupName: "Non-existent Group",
        groupDescription: "This group does not exist",
        users: [],
      });
    console.log("Update non-existent group response:", res.body);
    expect(res.status).toBe(404);
  });
}); 