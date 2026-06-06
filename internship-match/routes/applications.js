const express = require('express');
const { runAll, runOne, runRun, runInsert, transaction } = require('../db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { v4: uuid } = require('uuid');

const router = express.Router();

function addStatusHistory(applicationId, status, changedBy, remark) {
  const id = uuid();
  runInsert(
    `INSERT INTO application_status_history (id, application_id, status, changed_by, remark) VALUES (?, ?, ?, ?, ?)`,
    [id, applicationId, status, changedBy, remark || null]
  );
}

function getTimeline(applicationId) {
  const statusHistory = runAll(`
    SELECT h.*, u.name AS changed_by_name
    FROM application_status_history h
    LEFT JOIN users u ON h.changed_by = u.id
    WHERE h.application_id = ?
    ORDER BY h.changed_at ASC
  `, [applicationId]);

  const confirmations = runAll(`
    SELECT c.*, u.name AS confirmed_by_name
    FROM confirmations c
    LEFT JOIN users u ON c.confirmed_by = u.id
    WHERE c.application_id = ?
    ORDER BY c.confirmed_at ASC
  `, [applicationId]);

  const timeline = [];

  statusHistory.forEach(h => {
    timeline.push({
      type: 'status',
      time: h.changed_at,
      status: h.status,
      operator: h.changed_by_name,
      remark: h.remark,
      _sort: h.changed_at
    });
  });

  confirmations.forEach(c => {
    timeline.push({
      type: 'confirmation',
      time: c.confirmed_at,
      confirm_type: c.confirm_type,
      operator: c.confirmed_by_name,
      remark: c.remark,
      _sort: c.confirmed_at
    });
  });

  timeline.sort((a, b) => new Date(a._sort) - new Date(b._sort));
  return timeline;
}

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

  const timeline = getTimeline(req.params.id);
  const confirmations = runAll(`
    SELECT c.*, u.name AS confirmed_by_name
    FROM confirmations c
    LEFT JOIN users u ON c.confirmed_by = u.id
    WHERE c.application_id = ?
    ORDER BY c.confirmed_at ASC
  `, [req.params.id]);

  res.json({ ...app, timeline, confirmations });
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

  transaction(() => {
    const id = uuid();
    runInsert(
      `INSERT INTO applications (id, student_id, position_id, resume_id, status) VALUES (?, ?, ?, ?, 'pending')`,
      [id, req.user.id, position_id, resume.id]
    );
    addStatusHistory(id, 'pending', req.user.id, '学生投递');

    const application = runOne('SELECT * FROM applications WHERE id = ?', [id]);
    res.status(201).json(application);
  });
});

router.patch('/:id/status', authMiddleware, (req, res) => {
  const { status, remark } = req.body;
  const validTransitions = {
    enterprise_mentor: ['enterprise_reviewing', 'hired', 'rejected', 'enterprise_confirmed'],
    college_teacher: ['college_approved', 'rejected'],
    employment_admin: ['pending', 'college_approved', 'enterprise_reviewing', 'hired', 'rejected', 'closed', 'student_confirmed', 'enterprise_confirmed'],
    student: ['student_confirmed'],
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

  if (req.user.role === 'student') {
    if (app.student_id !== req.user.id) return res.status(403).json({ error: '只能操作自己的投递' });
    if (app.status !== 'hired' && app.status !== 'enterprise_confirmed') {
      return res.status(400).json({ error: '只有已录用的投递才能确认' });
    }
  }

  const now = new Date().toISOString();

  transaction(() => {
    if (status === 'hired') {
      runRun('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?',
        ['hired', now, req.params.id]);
      addStatusHistory(req.params.id, 'hired', req.user.id, remark || '企业录用');

      runRun(
        `UPDATE applications SET status = 'closed', updated_at = ? WHERE student_id = ? AND id != ? AND status NOT IN ('hired', 'rejected', 'closed', 'student_confirmed', 'enterprise_confirmed')`,
        [now, app.student_id, req.params.id]
      );

      const pos = runOne('SELECT * FROM positions WHERE id = ?', [app.position_id]);
      const newHiredCount = pos.hired_count + 1;

      if (newHiredCount >= pos.capacity) {
        runRun(
          `UPDATE applications SET status = 'closed', updated_at = ? WHERE position_id = ? AND id != ? AND status NOT IN ('hired', 'rejected', 'closed', 'student_confirmed', 'enterprise_confirmed')`,
          [now, app.position_id, req.params.id]
        );

        runRun('UPDATE positions SET hired_count = ?, status = ? WHERE id = ?',
          [newHiredCount, 'closed', app.position_id]);
      } else {
        runRun('UPDATE positions SET hired_count = ? WHERE id = ?',
          [newHiredCount, app.position_id]);
      }
    } else {
      runRun('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?',
        [status, now, req.params.id]);
      addStatusHistory(req.params.id, status, req.user.id, remark);
    }
  });

  const updated = runOne('SELECT * FROM applications WHERE id = ?', [req.params.id]);
  res.json(updated);
});

router.post('/:id/confirm', authMiddleware, (req, res) => {
  const { confirm_type, remark } = req.body;
  const validTypes = ['enterprise_offer', 'student_accept', 'enterprise_final', 'student_final'];

  if (!validTypes.includes(confirm_type)) {
    return res.status(400).json({ error: '无效的确认类型' });
  }

  const app = runOne('SELECT * FROM applications WHERE id = ?', [req.params.id]);
  if (!app) return res.status(404).json({ error: '投递记录不存在' });

  if (confirm_type.startsWith('enterprise')) {
    if (req.user.role !== 'enterprise_mentor') {
      return res.status(403).json({ error: '只有企业导师可以执行企业确认' });
    }
    const pos = runOne('SELECT * FROM positions WHERE id = ?', [app.position_id]);
    if (pos.created_by !== req.user.id) {
      return res.status(403).json({ error: '只能操作自己发布岗位的投递' });
    }
    if (app.status !== 'hired' && app.status !== 'student_confirmed') {
      return res.status(400).json({ error: '只有已录用或学生已确认的投递才能进行企业确认' });
    }
  }

  if (confirm_type.startsWith('student')) {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: '只有学生可以执行学生确认' });
    }
    if (app.student_id !== req.user.id) {
      return res.status(403).json({ error: '只能操作自己的投递' });
    }
    if (app.status !== 'hired' && app.status !== 'enterprise_confirmed') {
      return res.status(400).json({ error: '只有已录用或企业已确认的投递才能进行学生确认' });
    }
  }

  const existing = runOne(
    'SELECT id FROM confirmations WHERE application_id = ? AND confirm_type = ?',
    [req.params.id, confirm_type]
  );
  if (existing) return res.status(400).json({ error: '该类型确认已存在' });

  transaction(() => {
    const id = uuid();
    runInsert(
      `INSERT INTO confirmations (id, application_id, confirm_type, confirmed_by, remark) VALUES (?, ?, ?, ?, ?)`,
      [id, req.params.id, confirm_type, req.user.id, remark || null]
    );

    let newStatus = null;
    if (confirm_type === 'student_final') newStatus = 'student_confirmed';
    if (confirm_type === 'enterprise_final') newStatus = 'enterprise_confirmed';

    if (newStatus) {
      const now = new Date().toISOString();
      runRun('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?',
        [newStatus, now, req.params.id]);
      addStatusHistory(req.params.id, newStatus, req.user.id, remark || '二次确认');
    }
  });

  const confirmations = runAll(`
    SELECT c.*, u.name AS confirmed_by_name
    FROM confirmations c
    LEFT JOIN users u ON c.confirmed_by = u.id
    WHERE c.application_id = ?
    ORDER BY c.confirmed_at ASC
  `, [req.params.id]);

  res.status(201).json(confirmations);
});

router.get('/:id/timeline', authMiddleware, (req, res) => {
  const app = runOne('SELECT id FROM applications WHERE id = ?', [req.params.id]);
  if (!app) return res.status(404).json({ error: '投递记录不存在' });

  const timeline = getTimeline(req.params.id);
  res.json(timeline);
});

module.exports = router;
