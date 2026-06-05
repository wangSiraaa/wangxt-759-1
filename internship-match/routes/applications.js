const express = require('express');
const { runAll, runOne, runRun, runInsert, transaction } = require('../db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { v4: uuid } = require('uuid');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  let apps;

  if (req.user.role === 'student') {
    apps = runAll(`
      SELECT a.*, p.title AS position_title, p.company_id,
             c.name AS company_name, p.status AS position_status,
             r.college_status AS resume_college_status
      FROM applications a
      JOIN positions p ON a.position_id = p.id
      JOIN companies c ON p.company_id = c.id
      JOIN resumes r ON a.resume_id = r.id
      WHERE a.student_id = ?
      ORDER BY a.created_at DESC
    `, [req.user.id]);
  } else if (req.user.role === 'enterprise_mentor') {
    apps = runAll(`
      SELECT a.*, p.title AS position_title, p.company_id,
             c.name AS company_name, p.status AS position_status,
             u.name AS student_name, r.college_status AS resume_college_status, r.content AS resume_content
      FROM applications a
      JOIN positions p ON a.position_id = p.id
      JOIN companies c ON p.company_id = c.id
      JOIN users u ON a.student_id = u.id
      JOIN resumes r ON a.resume_id = r.id
      WHERE p.created_by = ?
      ORDER BY a.created_at DESC
    `, [req.user.id]);
  } else if (req.user.role === 'college_teacher') {
    apps = runAll(`
      SELECT a.*, p.title AS position_title, p.company_id,
             c.name AS company_name, p.status AS position_status,
             u.name AS student_name, r.college_status AS resume_college_status
      FROM applications a
      JOIN positions p ON a.position_id = p.id
      JOIN companies c ON p.company_id = c.id
      JOIN users u ON a.student_id = u.id
      JOIN resumes r ON a.resume_id = r.id
      WHERE u.college_id = ?
      ORDER BY a.created_at DESC
    `, [req.user.college_id]);
  } else {
    apps = runAll(`
      SELECT a.*, p.title AS position_title, p.company_id,
             c.name AS company_name, p.status AS position_status,
             u.name AS student_name, r.college_status AS resume_college_status, r.content AS resume_content
      FROM applications a
      JOIN positions p ON a.position_id = p.id
      JOIN companies c ON p.company_id = c.id
      JOIN users u ON a.student_id = u.id
      JOIN resumes r ON a.resume_id = r.id
      ORDER BY a.created_at DESC
    `);
  }

  res.json(apps);
});

router.get('/:id', authMiddleware, (req, res) => {
  const app = runOne(`
    SELECT a.*, p.title AS position_title, p.capacity, p.hired_count, p.status AS position_status,
           c.name AS company_name,
           u.name AS student_name, u.college_id AS student_college_id,
           r.content AS resume_content, r.college_status AS resume_college_status
    FROM applications a
    JOIN positions p ON a.position_id = p.id
    JOIN companies c ON p.company_id = c.id
    JOIN users u ON a.student_id = u.id
    JOIN resumes r ON a.resume_id = r.id
    WHERE a.id = ?
  `, [req.params.id]);
  if (!app) return res.status(404).json({ error: '投递记录不存在' });
  res.json(app);
});

router.post('/', authMiddleware, roleMiddleware('student'), (req, res) => {
  const { position_id } = req.body;
  if (!position_id) return res.status(400).json({ error: '请选择岗位' });

  const position = runOne('SELECT * FROM positions WHERE id = ?', [position_id]);
  if (!position) return res.status(404).json({ error: '岗位不存在' });

  if (position.status === 'closed' || position.hired_count >= position.capacity) {
    return res.status(400).json({ error: '岗位已满员，无法投递' });
  }

  const resume = runOne('SELECT * FROM resumes WHERE student_id = ?', [req.user.id]);
  if (!resume) return res.status(400).json({ error: '请先创建简历' });

  if (resume.college_status !== 'approved') {
    return res.status(400).json({ error: '简历尚未通过学院审核，无法投递' });
  }

  const existing = runOne('SELECT id FROM applications WHERE student_id = ? AND position_id = ?', [req.user.id, position_id]);
  if (existing) return res.status(400).json({ error: '已投递过该岗位' });

  const id = uuid();
  runInsert(
    `INSERT INTO applications (id, student_id, position_id, resume_id, status) VALUES (?, ?, ?, ?, 'pending')`,
    [id, req.user.id, position_id, resume.id]
  );

  const application = runOne('SELECT * FROM applications WHERE id = ?', [id]);
  res.status(201).json(application);
});

router.patch('/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  const validTransitions = {
    enterprise_mentor: ['enterprise_reviewing', 'hired', 'rejected'],
    college_teacher: ['college_approved', 'rejected'],
    employment_admin: ['pending', 'college_approved', 'enterprise_reviewing', 'hired', 'rejected', 'closed'],
  };

  const allowed = validTransitions[req.user.role];
  if (!allowed || !allowed.includes(status)) {
    return res.status(400).json({ error: '无权执行此状态变更' });
  }

  const app = runOne('SELECT * FROM applications WHERE id = ?', [req.params.id]);
  if (!app) return res.status(404).json({ error: '投递记录不存在' });

  if (req.user.role === 'enterprise_mentor') {
    const pos = runOne('SELECT * FROM positions WHERE id = ?', [app.position_id]);
    if (pos.created_by !== req.user.id) return res.status(403).json({ error: '只能操作自己发布岗位的投递' });
  }

  if (req.user.role === 'college_teacher') {
    const student = runOne('SELECT college_id FROM users WHERE id = ?', [app.student_id]);
    if (student.college_id !== req.user.college_id) return res.status(403).json({ error: '只能操作本学院学生的投递' });
  }

  const now = new Date().toISOString();

  if (status === 'hired') {
    transaction(() => {
      runRun('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?',
        ['hired', now, req.params.id]);

      runRun(
        `UPDATE applications SET status = 'closed', updated_at = ? WHERE student_id = ? AND id != ? AND status NOT IN ('hired', 'rejected', 'closed')`,
        [now, app.student_id, req.params.id]
      );

      const pos = runOne('SELECT * FROM positions WHERE id = ?', [app.position_id]);
      const newHiredCount = pos.hired_count + 1;

      if (newHiredCount >= pos.capacity) {
        runRun(
          `UPDATE applications SET status = 'closed', updated_at = ? WHERE position_id = ? AND id != ? AND status NOT IN ('hired', 'rejected', 'closed')`,
          [now, app.position_id, req.params.id]
        );

        runRun('UPDATE positions SET hired_count = ?, status = ? WHERE id = ?',
          [newHiredCount, 'closed', app.position_id]);
      } else {
        runRun('UPDATE positions SET hired_count = ? WHERE id = ?',
          [newHiredCount, app.position_id]);
      }
    });
  } else {
    runRun('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?',
      [status, now, req.params.id]);
  }

  const updated = runOne('SELECT * FROM applications WHERE id = ?', [req.params.id]);
  res.json(updated);
});

module.exports = router;
