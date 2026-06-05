const express = require('express');
const { runAll, runOne, runRun, runInsert } = require('../db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { v4: uuid } = require('uuid');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  let resumes;

  if (req.user.role === 'student') {
    resumes = runAll(`
      SELECT r.*, u.name AS student_name, u.college_id,
             rv.name AS reviewer_name
      FROM resumes r
      JOIN users u ON r.student_id = u.id
      LEFT JOIN users rv ON r.reviewed_by = rv.id
      WHERE r.student_id = ?
      ORDER BY r.id
    `, [req.user.id]);
  } else if (req.user.role === 'college_teacher') {
    resumes = runAll(`
      SELECT r.*, u.name AS student_name, u.college_id,
             rv.name AS reviewer_name
      FROM resumes r
      JOIN users u ON r.student_id = u.id
      LEFT JOIN users rv ON r.reviewed_by = rv.id
      WHERE u.college_id = ?
      ORDER BY r.id
    `, [req.user.college_id]);
  } else {
    resumes = runAll(`
      SELECT r.*, u.name AS student_name, u.college_id,
             rv.name AS reviewer_name
      FROM resumes r
      JOIN users u ON r.student_id = u.id
      LEFT JOIN users rv ON r.reviewed_by = rv.id
      ORDER BY r.id
    `);
  }

  res.json(resumes);
});

router.get('/:id', authMiddleware, (req, res) => {
  const resume = runOne(`
    SELECT r.*, u.name AS student_name, u.college_id,
           rv.name AS reviewer_name
    FROM resumes r
    JOIN users u ON r.student_id = u.id
    LEFT JOIN users rv ON r.reviewed_by = rv.id
    WHERE r.id = ?
  `, [req.params.id]);
  if (!resume) return res.status(404).json({ error: '简历不存在' });
  res.json(resume);
});

router.post('/', authMiddleware, roleMiddleware('student'), (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: '简历内容不能为空' });

  const existing = runOne('SELECT id FROM resumes WHERE student_id = ?', [req.user.id]);
  if (existing) {
    runRun('UPDATE resumes SET content = ?, college_status = ?, reviewed_by = NULL, reviewed_at = NULL WHERE id = ?',
      [content, 'pending', existing.id]);
    const updated = runOne('SELECT * FROM resumes WHERE id = ?', [existing.id]);
    return res.json(updated);
  }

  const id = uuid();
  runInsert('INSERT INTO resumes (id, student_id, content, college_status) VALUES (?, ?, ?, ?)',
    [id, req.user.id, content, 'pending']);
  const resume = runOne('SELECT * FROM resumes WHERE id = ?', [id]);
  res.status(201).json(resume);
});

router.patch('/:id/review', authMiddleware, roleMiddleware('college_teacher'), (req, res) => {
  const { college_status } = req.body;
  if (!['approved', 'rejected'].includes(college_status)) {
    return res.status(400).json({ error: '审核状态只能为 approved 或 rejected' });
  }

  const resume = runOne(`
    SELECT r.*, u.college_id AS student_college_id
    FROM resumes r
    JOIN users u ON r.student_id = u.id
    WHERE r.id = ?
  `, [req.params.id]);

  if (!resume) return res.status(404).json({ error: '简历不存在' });
  if (resume.student_college_id !== req.user.college_id) {
    return res.status(403).json({ error: '只能审核本学院学生的简历' });
  }

  const now = new Date().toISOString();
  runRun('UPDATE resumes SET college_status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?',
    [college_status, req.user.id, now, req.params.id]);

  res.json({ ...resume, college_status, reviewed_by: req.user.id, reviewed_at: now });
});

module.exports = router;
