import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";

describe("Admin Get All Group", () => {
  it("GET /api/admin/groups/get-all-group → should return all groups", async () => {
    const data:any = await signInAdmin();
    const group = await request(app)
      .post("/api/groups/create")
      .set("access-token", data.data.token)
      .field("groupName", "Test Group")
      .field("groupDescription", "A group for testing")
      .field("users", JSON.stringify([]));
    expect(group.status).toBe(200);
    expect(group.body.success).toBe(true);
    expect(group.body.data).toHaveProperty("_id");    
    const res:any = await request(app).post("/api/admin/groups/get-all").set("access-token", data.data.token);
    console.log("Get all groups response:", res.body);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty("_id");
    expect(res.body.data[0]).toHaveProperty("groupName");
    expect(res.body.data[0]).toHaveProperty("groupDescription");
    expect(res.body.data[0]).toHaveProperty("createdBy");
    expect(res.body.data[0]).toHaveProperty("createdAt");
    expect(res.body.data[0]).toHaveProperty("updatedAt");
  });
});