import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";
import Message from "../../../db/schemas/message.schema";
jest.setTimeout(20000);
describe("Admin Delete Group", () => {
  it("DELETE /api/admin/groups/delete-group → should delete a group", async () => {
    const data:any = await signInAdmin();
    const groupRes = await request(app)
      .post("/api/groups/create")
      .set("access-token", data.data.token)
      .field("groupName", "Group To Be Deleted")
      .field("groupDescription", "This group will be deleted in the test")
      .field("users", JSON.stringify([]));
        expect(groupRes.status).toBe(200);
        expect(groupRes.body.success).toBe(true);
        const groupId = groupRes.body.data._id;
        // 3. Call delete-group endpoint    
        const res = await request(app)
            .delete("/api/admin/groups/delete-group")
            .set("access-token", data.data.token)
            .query({ id:groupId });        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe("Group deleted successfully");
  });
  
  it("should return 404 if group not found", async () => {
    const data:any = await signInAdmin();
    const res = await request(app)
        .delete("/api/admin/groups/delete-group")
        .set("access-token", data.data.token)
        .query({ id: "64b64c4f4f4f4f4f4f4f4f4f" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("message");   
    expect(res.body.data.message).toBe('Group not found.');
  });
});