const express = require('express');
const { runAll, runOne } = require('../db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', authMiddleware, roleMiddleware('employment_admin'), (req, res) => {
  const stats = {
    total_students: runOne("SELECT COUNT(*) AS c FROM users WHERE role = 'student'").c,
    total_mentors: runOne("SELECT COUNT(*) AS c FROM users WHERE role = 'enterprise_mentor'").c,
    total_teachers: runOne("SELECT COUNT(*) AS c FROM users WHERE role = 'college_teacher'").c,
    total_positions: runOne('SELECT COUNT(*) AS c FROM positions').c,
    open_positions: runOne("SELECT COUNT(*) AS c FROM positions WHERE status = 'open'").c,
    total_applications: runOne('SELECT COUNT(*) AS c FROM applications').c,
    hired: runOne("SELECT COUNT(*) AS c FROM applications WHERE status = 'hired'").c,
    pending_resumes: runOne("SELECT COUNT(*) AS c FROM resumes WHERE college_status = 'pending'").c,
  };
  res.json(stats);
});

router.get('/users', authMiddleware, roleMiddleware('employment_admin'), (req, res) => {
  const users = runAll(`
    SELECT u.id, u.username, u.role, u.name, u.college_id, u.company_id,
           c.name AS college_name, co.name AS company_name
    FROM users u
    LEFT JOIN colleges c ON u.college_id = c.id
    LEFT JOIN companies co ON u.company_id = co.id
    ORDER BY u.role, u.name
  `);
  res.json(users);
});

router.get('/all-applications', authMiddleware, roleMiddleware('employment_admin'), (req, res) => {
  const apps = runAll(`
    SELECT a.*, p.title AS position_title, c.name AS company_name,
           u.name AS student_name, r.college_status AS resume_college_status
    FROM applications a
    JOIN positions p ON a.position_id = p.id
    JOIN companies c ON p.company_id = c.id
    JOIN users u ON a.student_id = u.id
    JOIN resumes r ON a.resume_id = r.id
    ORDER BY a.created_at DESC
  `);
  res.json(apps);
});

module.exports = router;
