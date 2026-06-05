const { initDb, initSchema, runAll, runOne, runRun, runInsert } = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

async function seed() {
  await initDb();
  initSchema();

  const count = runOne('SELECT COUNT(*) AS c FROM users');
  if (count.c > 0) {
    console.log('Seed data already exists, skipping.');
    return;
  }

  const hash = (pw) => bcrypt.hashSync(pw, 8);

  const colleges = [
    { id: uuid(), name: '计算机学院' },
    { id: uuid(), name: '商学院' },
  ];
  const collegeMap = {};
  for (const c of colleges) {
    runInsert('INSERT INTO colleges (id, name) VALUES (?, ?)', [c.id, c.name]);
    collegeMap[c.name] = c.id;
  }

  const companies = [
    { id: uuid(), name: '智联科技有限公司' },
    { id: uuid(), name: '云端数据科技' },
  ];
  const companyMap = {};
  for (const c of companies) {
    runInsert('INSERT INTO companies (id, name) VALUES (?, ?)', [c.id, c.name]);
    companyMap[c.name] = c.id;
  }

  const users = [
    { id: uuid(), username: 'admin', password: 'admin123', role: 'employment_admin', name: '就业管理员', college_id: null, company_id: null },
    { id: uuid(), username: 'teacher1', password: 'teacher123', role: 'college_teacher', name: '王老师', college_id: collegeMap['计算机学院'], company_id: null },
    { id: uuid(), username: 'teacher2', password: 'teacher123', role: 'college_teacher', name: '李老师', college_id: collegeMap['商学院'], company_id: null },
    { id: uuid(), username: 'mentor1', password: 'mentor123', role: 'enterprise_mentor', name: '张导师', college_id: null, company_id: companyMap['智联科技有限公司'] },
    { id: uuid(), username: 'mentor2', password: 'mentor123', role: 'enterprise_mentor', name: '陈导师', college_id: null, company_id: companyMap['云端数据科技'] },
    { id: uuid(), username: 'student1', password: 'student123', role: 'student', name: '赵同学', college_id: collegeMap['计算机学院'], company_id: null },
    { id: uuid(), username: 'student2', password: 'student123', role: 'student', name: '钱同学', college_id: collegeMap['计算机学院'], company_id: null },
    { id: uuid(), username: 'student3', password: 'student123', role: 'student', name: '孙同学', college_id: collegeMap['商学院'], company_id: null },
    { id: uuid(), username: 'student4', password: 'student123', role: 'student', name: '周同学', college_id: collegeMap['商学院'], company_id: null },
  ];
  const userMap = {};
  for (const u of users) {
    runInsert(
      `INSERT INTO users (id, username, password_hash, role, name, college_id, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [u.id, u.username, hash(u.password), u.role, u.name, u.college_id, u.company_id]
    );
    userMap[u.username] = u.id;
  }

  const positions = [
    { id: uuid(), company_id: companyMap['智联科技有限公司'], title: 'Java后端开发实习生', description: '参与企业级Java后端开发，学习Spring Boot微服务架构。', capacity: 2, created_by: userMap['mentor1'] },
    { id: uuid(), company_id: companyMap['智联科技有限公司'], title: '前端开发实习生', description: '参与React前端项目开发，掌握现代前端工程化实践。', capacity: 1, created_by: userMap['mentor1'] },
    { id: uuid(), company_id: companyMap['云端数据科技'], title: '数据分析实习生', description: '参与大数据分析项目，使用Python和SQL进行数据处理。', capacity: 1, created_by: userMap['mentor2'] },
  ];
  for (const p of positions) {
    runInsert(
      `INSERT INTO positions (id, company_id, title, description, capacity, hired_count, status, created_by) VALUES (?, ?, ?, ?, ?, 0, 'open', ?)`,
      [p.id, p.company_id, p.title, p.description, p.capacity, p.created_by]
    );
  }

  const resumes = [
    { id: uuid(), student_id: userMap['student1'], content: '赵同学 - 计算机学院 - 熟悉Java、Spring Boot - GPA 3.8', college_status: 'approved', reviewed_by: userMap['teacher1'] },
    { id: uuid(), student_id: userMap['student2'], content: '钱同学 - 计算机学院 - 熟悉React、Vue - GPA 3.6', college_status: 'pending', reviewed_by: null },
    { id: uuid(), student_id: userMap['student3'], content: '孙同学 - 商学院 - 熟悉Python、数据分析 - GPA 3.7', college_status: 'approved', reviewed_by: userMap['teacher2'] },
    { id: uuid(), student_id: userMap['student4'], content: '周同学 - 商学院 - 熟悉SQL、Excel - GPA 3.5', college_status: 'approved', reviewed_by: userMap['teacher2'] },
  ];
  for (const r of resumes) {
    const reviewedAt = r.college_status === 'approved' ? new Date().toISOString() : null;
    runInsert(
      `INSERT INTO resumes (id, student_id, content, college_status, reviewed_by, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [r.id, r.student_id, r.content, r.college_status, r.reviewed_by, reviewedAt]
    );
  }

  console.log('Seed data inserted successfully.');
  console.log('Users:');
  for (const u of users) {
    console.log(`  ${u.role.padEnd(20)} ${u.username} / ${u.password}  (${u.name})`);
  }
  console.log('\nPositions:');
  for (const p of positions) {
    console.log(`  ${p.title} (容量: ${p.capacity})`);
  }
  console.log('\nResumes:');
  for (const r of resumes) {
    const uname = users.find(u => u.id === r.student_id).username;
    console.log(`  ${uname}: college_status=${r.college_status}`);
  }
}

seed().catch(console.error);
