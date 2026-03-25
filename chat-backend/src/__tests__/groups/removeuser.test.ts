import supertest from 'supertest';
import { app } from '../../app';
import USERS from '../../db/schemas/users.schema';
import { hashPassword } from '../../controller/user/signUp';

describe('POST /api/groups/removeuser', () => {
  beforeEach(async () => {
    await USERS.deleteMany({});
    await USERS.create({ sl: 0, name: 'Super Admin', email: 'superadmin@example.com', password: await hashPassword('password123'), phone: '+000', userType: 'SuperAdmin', accountStatus: 'Active' });
    await USERS.create({ sl: 1, name: 'Admin', email: 'admin@example.com', password: await hashPassword('password123'), phone: '+111', userType: 'admin', accountStatus: 'Active' });
    await USERS.create({ sl: 2, name: 'Member', email: 'member@example.com', password: await hashPassword('password123'), phone: '+222', userType: 'user', accountStatus: 'Active' });
  });

  it('removes member from group (admin only)', async () => {
    const adminSignIn = await supertest(app).post('/api/users/sign-in').send({ id: 'admin@example.com', password: 'password123' }).expect(200);
    const adminToken = adminSignIn.body.data.token;
    const member = await USERS.findOne({ email: 'member@example.com' });

    const created = await supertest(app)
      .post('/api/groups/create')
      .set('access-token', adminToken)
      .field('groupName', 'Admin Group')
      .field('groupDescription', 'Desc')
      .field('users', JSON.stringify([String(member?._id)]))
      .expect(200);
    const groupId = created.body.data?._id || created.body.data?.group?._id || created.body.data?.groupId;

    const res = await supertest(app)
      .post('/api/groups/removeuser')
      .set('access-token', adminToken)
      .send({ groupId, userId: String(member?._id) })
      .expect(200);
    expect(res.body.success).toBe(true);
  });
});


