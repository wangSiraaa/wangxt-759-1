const request = require('supertest');
const { v4: uuid } = require('uuid');

const BASE = 'http://localhost:3000';

function api(agent) {
  return {
    get: (path) => agent.get(path),
    post: (path, data) => agent.post(path).send(data),
    patch: (path, data) => agent.patch(path).send(data),
    login: (username, password) =>
      agent.post('/api/auth/login').send({ username, password }),
    getPositions: () => agent.get('/api/positions'),
    getPosition: (id) => agent.get(`/api/positions/${id}`),
    createPosition: (data) => agent.post('/api/positions').send(data),
    getResumes: () => agent.get('/api/resumes'),
    reviewResume: (id, status) =>
      agent.patch(`/api/resumes/${id}/review`).send({ college_status: status }),
    getApplications: () => agent.get('/api/applications'),
    getApplication: (id) => agent.get(`/api/applications/${id}`),
    apply: (position_id) =>
      agent.post('/api/applications').send({ position_id }),
    updateAppStatus: (id, status) =>
      agent.patch(`/api/applications/${id}/status`).send({ status }),
    confirm: (id, confirm_type, remark) =>
      agent.post(`/api/applications/${id}/confirm`).send({ confirm_type, remark }),
  };
}

function makeAgent() {
  return request.agent(BASE);
}

async function loginAs(username, password) {
  const agent = makeAgent();
  await api(agent).login(username, password);
  return agent;
}

describe('校企实习岗位撮合 - Smoke Test', () => {
  const a = {};

  beforeAll(async () => {
    a.mentor1 = await loginAs('mentor1', 'mentor123');
    a.teacher1 = await loginAs('teacher1', 'teacher123');
    a.teacher2 = await loginAs('teacher2', 'teacher123');
    a.student1 = await loginAs('student1', 'student123');
    a.student2 = await loginAs('student2', 'student123');
    a.student3 = await loginAs('student3', 'student123');
    a.student4 = await loginAs('student4', 'student123');
    a.admin = await loginAs('admin', 'admin123');
  }, 30000);

  test('企业导师可以查看岗位列表', async () => {
    const res = await api(a.mentor1).getPositions();
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('学生未审核简历不能投递', async () => {
    const positions = await api(a.student2).getPositions();
    expect(positions.status).toBe(200);
    const openPos = positions.body.find((p) => p.status === 'open');
    expect(openPos).toBeDefined();

    const res = await api(a.student2).apply(openPos.id);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('审核');
  });

  test('岗位满员后停止投递', async () => {
    const createRes = await api(a.mentor1).createPosition({
      title: '容量1测试岗位_' + uuid().slice(0, 8),
      description: '测试岗位容量',
      capacity: 1,
    });
    expect(createRes.status).toBe(201);
    const posId = createRes.body.id;

    const app1 = await api(a.student1).apply(posId);
    expect(app1.status).toBe(201);

    const app2 = await api(a.student3).apply(posId);
    expect(app2.status).toBe(201);

    const mentorApps = await api(a.mentor1).getApplications();
    const posApps = mentorApps.body.filter((a) => a.position_id === posId);
    expect(posApps.length).toBe(2);

    const reviewing = posApps.find((a) => a.status === 'pending');
    await api(a.mentor1).updateAppStatus(reviewing.id, 'enterprise_reviewing');
    await api(a.mentor1).updateAppStatus(reviewing.id, 'hired');

    const posAfter = await api(a.mentor1).getPosition(posId);
    expect(posAfter.body.status).toBe('closed');
    expect(posAfter.body.hired_count).toBe(1);

    const tryApply = await api(a.student4).apply(posId);
    expect(tryApply.status).toBe(400);
    expect(tryApply.body.error).toContain('满员');
  });

  test('录用一个学生并验证其他投递状态被关闭', async () => {
    const createRes = await api(a.mentor1).createPosition({
      title: '录用关闭测试_' + uuid().slice(0, 8),
      description: '测试录用后其他投递关闭',
      capacity: 2,
    });
    expect(createRes.status).toBe(201);
    const posId = createRes.body.id;

    const pos2List = await api(a.mentor1).getPositions();
    const otherPos = pos2List.body.find((p) => p.id !== posId && p.status === 'open' && p.capacity > p.hired_count);
    if (!otherPos) {
      const altRes = await api(a.mentor1).createPosition({
        title: '第二岗位_' + uuid().slice(0, 8),
        description: '第二岗位',
        capacity: 2,
      });
      var otherPosId = altRes.body.id;
    } else {
      var otherPosId = otherPos.id;
    }

    await api(a.student1).apply(posId);
    await api(a.student1).apply(otherPosId);

    const studentApps = await api(a.student1).getApplications();
    const apps = studentApps.body.filter(
      (a) => a.position_id === posId || a.position_id === otherPosId
    );
    expect(apps.length).toBe(2);
    apps.forEach((a) => expect(a.status).toBe('pending'));

    const mentorApps = await api(a.mentor1).getApplications();
    const targetApp = mentorApps.body.find((a) => a.student_id === apps.find(x => x.position_id === posId).student_id && a.position_id === posId);
    expect(targetApp).toBeDefined();

    await api(a.mentor1).updateAppStatus(targetApp.id, 'enterprise_reviewing');
    const hireRes = await api(a.mentor1).updateAppStatus(targetApp.id, 'hired');
    expect(hireRes.status).toBe(200);
    expect(hireRes.body.status).toBe('hired');

    const updatedApps = await api(a.student1).getApplications();
    const hiredApp = updatedApps.body.find((a) => a.position_id === posId);
    expect(hiredApp.status).toBe('hired');

    const otherApp = updatedApps.body.find((a) => a.position_id === otherPosId);
    expect(otherApp.status).toBe('closed');
  });

  test('学院老师审核简历后学生可以投递', async () => {
    const resumes = await api(a.teacher1).getResumes();
    const pending = resumes.body.find((r) => r.college_status === 'pending');
    if (!pending) return;

    const approveRes = await api(a.teacher1).reviewResume(pending.id, 'approved');
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.college_status).toBe('approved');

    const positions = await api(a.student2).getPositions();
    const openPos = positions.body.find((p) => p.status === 'open' && p.hired_count < p.capacity);
    if (!openPos) return;

    const applyRes = await api(a.student2).apply(openPos.id);
    expect(applyRes.status).toBe(201);
  });

  test('就业管理员可以查看统计和全部投递', async () => {
    const statsRes = await api(a.admin).get('/api/admin/stats');
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.total_students).toBeGreaterThan(0);

    const usersRes = await api(a.admin).get('/api/admin/users');
    expect(usersRes.status).toBe(200);
    expect(usersRes.body.length).toBeGreaterThan(0);

    const appsRes = await api(a.admin).get('/api/admin/all-applications');
    expect(appsRes.status).toBe(200);
  });

  describe('二次确认功能测试', () => {
    test('企业录用后学生可以最终确认入职', async () => {
      const createRes = await api(a.mentor1).createPosition({
        title: '二次确认测试_' + uuid().slice(0, 8),
        description: '测试二次确认流程',
        capacity: 1,
      });
      expect(createRes.status).toBe(201);
      const posId = createRes.body.id;

      const applyRes = await api(a.student1).apply(posId);
      expect(applyRes.status).toBe(201);
      const appId = applyRes.body.id;

      await api(a.mentor1).updateAppStatus(appId, 'enterprise_reviewing');
      const hireRes = await api(a.mentor1).updateAppStatus(appId, 'hired');
      expect(hireRes.status).toBe(200);
      expect(hireRes.body.status).toBe('hired');

      const confirmRes = await api(a.student1).confirm(appId, 'student_final', '确认入职');
      expect(confirmRes.status).toBe(201);
      expect(confirmRes.body.length).toBeGreaterThan(0);

      const detailRes = await api(a.student1).getApplication(appId);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.status).toBe('student_confirmed');
      expect(detailRes.body.timeline).toBeDefined();
      expect(detailRes.body.timeline.length).toBeGreaterThan(0);
      expect(detailRes.body.confirmations.length).toBeGreaterThan(0);
    });

    test('【失败用例】未被录用的学生不能进行二次确认', async () => {
      const createRes = await api(a.mentor1).createPosition({
        title: '失败用例测试_' + uuid().slice(0, 8),
        description: '测试失败场景',
        capacity: 1,
      });
      expect(createRes.status).toBe(201);
      const posId = createRes.body.id;

      const applyRes = await api(a.student1).apply(posId);
      expect(applyRes.status).toBe(201);
      const appId = applyRes.body.id;

      const confirmRes = await api(a.student1).confirm(appId, 'student_final', '试图提前确认');
      expect(confirmRes.status).toBe(400);
      expect(confirmRes.body.error).toContain('只有已录用');
    });

    test('企业和学生双方完成二次确认后详情页时间线正确展示', async () => {
      const createRes = await api(a.mentor1).createPosition({
        title: '双方确认测试_' + uuid().slice(0, 8),
        description: '测试双方确认和时间线',
        capacity: 1,
      });
      expect(createRes.status).toBe(201);
      const posId = createRes.body.id;

      const applyRes = await api(a.student1).apply(posId);
      expect(applyRes.status).toBe(201);
      const appId = applyRes.body.id;

      await api(a.mentor1).updateAppStatus(appId, 'enterprise_reviewing');
      await api(a.mentor1).updateAppStatus(appId, 'hired');

      await api(a.student1).confirm(appId, 'student_final', '学生确认入职');
      await api(a.mentor1).confirm(appId, 'enterprise_final', '企业确认录用');

      const detailRes = await api(a.student1).getApplication(appId);
      expect(detailRes.status).toBe(200);
      
      const timeline = detailRes.body.timeline;
      expect(timeline.length).toBeGreaterThanOrEqual(4);
      
      const statusEvents = timeline.filter(t => t.type === 'status');
      const confirmEvents = timeline.filter(t => t.type === 'confirmation');
      expect(statusEvents.length).toBeGreaterThan(0);
      expect(confirmEvents.length).toBe(2);
    });
  });
});
