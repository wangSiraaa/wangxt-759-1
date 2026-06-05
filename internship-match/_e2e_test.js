const http = require('http');

const BASE = '127.0.0.1';
const PORT = 3000;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: BASE,
      port: PORT,
      path: path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data),
            headers: res.headers,
          });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function getCookie(res) {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return '';
  const c = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return c ? c.split(';')[0] : '';
}

async function login(username, password) {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  const cookie = getCookie(res);
  return { data: res.data, cookie };
}

async function apiWithCookie(cookie, path, options = {}) {
  return request(path, {
    ...options,
    headers: {
      ...options.headers,
      'Cookie': cookie,
    },
  });
}

(async () => {
  const results = [];

  try {
    console.log('=== Test 1: Login ===');
    const s1 = await login('student1', 'student123');
    results.push({ test: 'student1 login', pass: s1.data.role === 'student' });
    console.log('  student1:', s1.data.role, s1.data.name);

    const s2 = await login('student2', 'student123');
    results.push({ test: 'student2 login', pass: s2.data.role === 'student' });
    console.log('  student2:', s2.data.role, s2.data.name);

    const m1 = await login('mentor1', 'mentor123');
    results.push({ test: 'mentor1 login', pass: m1.data.role === 'enterprise_mentor' });
    console.log('  mentor1:', m1.data.role, m1.data.name);

    const t1 = await login('teacher1', 'teacher123');
    results.push({ test: 'teacher1 login', pass: t1.data.role === 'college_teacher' });
    console.log('  teacher1:', t1.data.role, t1.data.name);

    console.log('\n=== Test 2: Student2 cannot apply (resume pending) ===');
    const positions = await apiWithCookie(s1.cookie, '/api/positions');
    const openPos = positions.data.find(p => p.status === 'open');
    const applyResult = await apiWithCookie(s2.cookie, '/api/applications', {
      method: 'POST',
      body: { position_id: openPos.id },
    });
    results.push({ test: 'student2 blocked (pending resume)', pass: applyResult.status === 400 && applyResult.data.error.includes('审核') });
    console.log('  Result:', applyResult.status, applyResult.data.error);

    console.log('\n=== Test 3: Create capacity=1 position and fill it ===');
    const newPos = await apiWithCookie(m1.cookie, '/api/positions', {
      method: 'POST',
      body: { title: '容量1测试岗位', description: '测试', capacity: 1 },
    });
    const posId = newPos.data.id;
    results.push({ test: 'create position', pass: newPos.status === 201 });
    console.log('  Position created:', posId);

    const s3 = await login('student3', 'student123');
    const s4 = await login('student4', 'student123');

    const app1 = await apiWithCookie(s1.cookie, '/api/applications', {
      method: 'POST',
      body: { position_id: posId },
    });
    results.push({ test: 'student1 applies', pass: app1.status === 201 });
    console.log('  Student1 applies:', app1.status);

    const app2 = await apiWithCookie(s3.cookie, '/api/applications', {
      method: 'POST',
      body: { position_id: posId },
    });
    results.push({ test: 'student3 applies', pass: app2.status === 201 });
    console.log('  Student3 applies:', app2.status);

    console.log('\n=== Test 4: Hire student1 and verify capacity full ===');
    const mentorApps = await apiWithCookie(m1.cookie, '/api/applications');
    const posApps = mentorApps.data.filter(a => a.position_id === posId);
    const targetApp = posApps.find(a => a.student_name === '赵同学');

    const reviewRes = await apiWithCookie(m1.cookie, `/api/applications/${targetApp.id}/status`, {
      method: 'PATCH',
      body: { status: 'enterprise_reviewing' },
    });
    console.log('  Start reviewing:', reviewRes.status);

    const hireRes = await apiWithCookie(m1.cookie, `/api/applications/${targetApp.id}/status`, {
      method: 'PATCH',
      body: { status: 'hired' },
    });
    results.push({ test: 'hire student1', pass: hireRes.status === 200 });
    console.log('  Hire result status:', hireRes.status, 'data:', JSON.stringify(hireRes.data));

    const posAfter = await apiWithCookie(m1.cookie, `/api/positions/${posId}`);
    results.push({ test: 'position closed after capacity', pass: posAfter.data.status === 'closed' && posAfter.data.hired_count === 1 });
    console.log('  Position after hire: status=%s, hired=%d', posAfter.data.status, posAfter.data.hired_count);

    const tryApply = await apiWithCookie(s4.cookie, '/api/applications', {
      method: 'POST',
      body: { position_id: posId },
    });
    results.push({ test: 'student4 blocked (full)', pass: tryApply.status === 400 && tryApply.data.error.includes('满员') });
    console.log('  Student4 blocked:', tryApply.data.error);

    console.log('\n=== Test 5: Hire student3 closes their other application ===');
    const pos2 = await apiWithCookie(m1.cookie, '/api/positions', {
      method: 'POST',
      body: { title: '第二个岗位_容量2', description: '测试', capacity: 2 },
    });
    const pos2Id = pos2.data.id;

    await apiWithCookie(s3.cookie, '/api/applications', {
      method: 'POST',
      body: { position_id: pos2Id },
    });

    const otherPos = positions.data.find(p => p.status === 'open' && p.id !== posId && p.id !== pos2Id);
    let otherPosId;
    if (otherPos) {
      otherPosId = otherPos.id;
      await apiWithCookie(s3.cookie, '/api/applications', {
        method: 'POST',
        body: { position_id: otherPos.id },
      });
    } else {
      const pos3 = await apiWithCookie(m1.cookie, '/api/positions', {
        method: 'POST',
        body: { title: '第三岗位', description: '测试', capacity: 2 },
      });
      otherPosId = pos3.data.id;
      await apiWithCookie(s3.cookie, '/api/applications', {
        method: 'POST',
        body: { position_id: otherPosId },
      });
    }

    const student3Apps = await apiWithCookie(s3.cookie, '/api/applications');
    console.log('  Student3 apps after apply:', student3Apps.data.map(a => ({ pos: a.position_title, status: a.status })));

    const mentorApps2 = await apiWithCookie(m1.cookie, '/api/applications');
    const targetApp2 = mentorApps2.data.find(a => a.student_name === '孙同学' && a.position_id === pos2Id);
    if (targetApp2) {
      await apiWithCookie(m1.cookie, `/api/applications/${targetApp2.id}/status`, {
        method: 'PATCH',
        body: { status: 'enterprise_reviewing' },
      });
      const hire2 = await apiWithCookie(m1.cookie, `/api/applications/${targetApp2.id}/status`, {
        method: 'PATCH',
        body: { status: 'hired' },
      });
      console.log('  Hire student3 on pos2:', hire2.data.status);

      const student3AppsAfter = await apiWithCookie(s3.cookie, '/api/applications');
      const hiredApp = student3AppsAfter.data.find(a => a.position_id === pos2Id);
      const otherApp = student3AppsAfter.data.find(a => a.position_id === otherPosId);

      if (hiredApp && otherApp) {
        results.push({ test: 'hired app updated', pass: ['hired', 'enterprise_reviewing'].includes(hiredApp.status) });
        results.push({ test: 'other app closed after hire', pass: otherApp.status === 'closed' });
        console.log('  Hired app status:', hiredApp.status);
        console.log('  Other app status:', otherApp.status);
      } else {
        console.log('  Could not verify: hiredApp=', hiredApp?.status, 'otherApp=', otherApp?.status);
        results.push({ test: 'other app closed after hire', pass: otherApp?.status === 'closed' });
      }
    } else {
      console.log('  targetApp2 not found');
      results.push({ test: 'other app closed after hire', pass: false });
    }

    console.log('\n=== RESULTS ===');
    let passed = 0, failed = 0;
    for (const r of results) {
      const icon = r.pass ? '✓' : '✗';
      console.log(`  ${icon} ${r.test}`);
      if (r.pass) passed++; else failed++;
    }
    console.log(`\nPassed: ${passed}/${passed + failed}`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('TEST ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
