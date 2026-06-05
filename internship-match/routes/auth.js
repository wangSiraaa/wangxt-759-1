const express = require('express');
const bcrypt = require('bcryptjs');
const { runOne, runAll } = require('../db');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

  const user = runOne('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: '用户名或密码错误' });

  const token = generateToken(user);
  res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    college_id: user.college_id,
    company_id: user.company_id,
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: '已登出' });
});

router.get('/me', (req, res) => {
  const { authMiddleware } = require('../middleware/auth');
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');
    const user = jwt.verify(token, JWT_SECRET);
    res.json(user);
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
});

module.exports = router;
