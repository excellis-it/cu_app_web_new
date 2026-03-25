import supertest from 'supertest';
import { app } from '../../app';
import USERS from '../../db/schemas/users.schema';
import { hashPassword } from '../../controller/user/signUp';

describe('POST /api/groups/report-message', () => {
  let token: string;
  let groupId: string;
  let messageId: string;
  beforeEach(async () => {
    await USERS.deleteMany({});
    await USERS.create({ sl: 0, name: 'Super Admin', email: 'superadmin@example.com', password: await hashPassword('password123'), phone: '+000', userType: 'SuperAdmin', accountStatus: 'Active' });
    await USERS.create({ sl: 1, name: 'Member User', email: 'member@example.com', password: await hashPassword('password123'), phone: '+111', userType: 'user', accountStatus: 'Active' });
    const signIn = await supertest(app).post('/api/users/sign-in').send({ id: 'member@example.com', password: 'password123' }).expect(200);
    token = signIn.body.data.token;
    const member = await USERS.findOne({ email: 'member@example.com' });
    const created = await supertest(app)
      .post('/api/groups/create')
      .set('access-token', token)
      .field('groupName', 'Report Group')
      .field('groupDescription', 'Desc')
      .field('users', JSON.stringify([String(member?._id)]))
      .expect(200);
    groupId = created.body.data?._id || created.body.data?.group?._id || created.body.data?.groupId;

    const addRes = await supertest(app)
      .post('/api/groups/addnewmsg')
      .set('access-token', token)
      .send({ groupId, senderId: String(member?._id), senderName: String(member?.name), message: 'report me', messageType: 'text' })
      .expect(200);
    messageId = addRes.body.data?._id || addRes.body.data?.message?._id || addRes.body.data?.messageId;
  });

  it('reports a message', async () => {
    const res = await supertest(app)
      .post('/api/groups/report-message')
      .set('access-token', token)
      .send({ msgId: messageId, groupId, description: 'abuse' })
      .expect(200);
    expect(res.body.success).toBe(true);
  });
});


