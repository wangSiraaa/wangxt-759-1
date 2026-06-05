const express = require('express');
const { runAll, runOne, runRun, runInsert } = require('../db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { v4: uuid } = require('uuid');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  let positions;
  if (req.user.role === 'enterprise_mentor') {
    positions = runAll(`
      SELECT p.*, c.name AS company_name, u.name AS creator_name
      FROM positions p
      JOIN companies c ON p.company_id = c.id
      JOIN users u ON p.created_by = u.id
      WHERE p.created_by = ?
      ORDER BY p.created_at DESC
    `, [req.user.id]);
  } else {
    positions = runAll(`
      SELECT p.*, c.name AS company_name, u.name AS creator_name
      FROM positions p
      JOIN companies c ON p.company_id = c.id
      JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
    `);
  }
  res.json(positions);
});

router.get('/:id', authMiddleware, (req, res) => {
  const position = runOne(`
    SELECT p.*, c.name AS company_name, u.name AS creator_name
    FROM positions p
    JOIN companies c ON p.company_id = c.id
    JOIN users u ON p.created_by = u.id
    WHERE p.id = ?
  `, [req.params.id]);
  if (!position) return res.status(404).json({ error: '岗位不存在' });

  const apps = runAll(`
    SELECT a.*, u.name AS student_name, u.username AS student_username
    FROM applications a
    JOIN users u ON a.student_id = u.id
    WHERE a.position_id = ?
    ORDER BY a.created_at DESC
  `, [req.params.id]);

  res.json({ ...position, applications: apps });
});

router.post('/', authMiddleware, roleMiddleware('enterprise_mentor'), (req, res) => {
  const { title, description, capacity } = req.body;
  if (!title) return res.status(400).json({ error: '岗位名称不能为空' });
  if (!capacity || capacity < 1) return res.status(400).json({ error: '容量必须大于0' });

  const id = uuid();
  runInsert(
    `INSERT INTO positions (id, company_id, title, description, capacity, hired_count, status, created_by) VALUES (?, ?, ?, ?, ?, 0, 'open', ?)`,
    [id, req.user.company_id, title, description || '', capacity, req.user.id]
  );

  const position = runOne('SELECT * FROM positions WHERE id = ?', [id]);
  res.status(201).json(position);
});

router.put('/:id', authMiddleware, roleMiddleware('enterprise_mentor'), (req, res) => {
  const pos = runOne('SELECT * FROM positions WHERE id = ?', [req.params.id]);
  if (!pos) return res.status(404).json({ error: '岗位不存在' });
  if (pos.created_by !== req.user.id) return res.status(403).json({ error: '只能修改自己创建的岗位' });

  const { title, description, capacity } = req.body;
  const newTitle = title || pos.title;
  const newDesc = description !== undefined ? description : pos.description;
  let newCapacity = pos.capacity;
  let newStatus = pos.status;

  if (capacity && capacity >= pos.hired_count) {
    newCapacity = capacity;
    if (pos.hired_count >= capacity) {
      newStatus = 'closed';
    }
  }

  runRun(
    `UPDATE positions SET title = ?, description = ?, capacity = ?, status = ? WHERE id = ?`,
    [newTitle, newDesc, newCapacity, newStatus, pos.id]
  );

  const updated = runOne('SELECT * FROM positions WHERE id = ?', [req.params.id]);
  res.json(updated);
});

router.patch('/:id/status', authMiddleware, roleMiddleware('enterprise_mentor'), (req, res) => {
  const { status } = req.body;
  if (!['open', 'closed'].includes(status)) return res.status(400).json({ error: '无效状态' });

  const pos = runOne('SELECT * FROM positions WHERE id = ?', [req.params.id]);
  if (!pos) return res.status(404).json({ error: '岗位不存在' });
  if (pos.created_by !== req.user.id) return res.status(403).json({ error: '只能操作自己创建的岗位' });

  runRun('UPDATE positions SET status = ? WHERE id = ?', [status, pos.id]);
  res.json({ ...pos, status });
});

module.exports = router;
