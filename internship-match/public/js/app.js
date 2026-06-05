const API = '';

const ROLE_LABELS = {
  student: '学生',
  enterprise_mentor: '企业导师',
  college_teacher: '学院老师',
  employment_admin: '就业管理员',
};

const STATUS_LABELS = {
  pending: '待审核',
  college_approved: '学院已通过',
  enterprise_reviewing: '企业审核中',
  hired: '已录用',
  rejected: '已拒绝',
  closed: '已关闭',
};

const COLLEGE_STATUS_LABELS = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};

let currentUser = null;

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function statusBadge(status, type = 'app') {
  const labels = type === 'resume' ? COLLEGE_STATUS_LABELS : STATUS_LABELS;
  const label = labels[status] || status;
  return `<span class="status-badge status-${status}">${label}</span>`;
}

function renderNavbar() {
  const nav = document.getElementById('navbar');
  if (!currentUser) {
    nav.innerHTML = `<a class="navbar-brand" href="#">校企实习岗位撮合平台</a>`;
    return;
  }
  nav.innerHTML = `
    <a class="navbar-brand" href="#">校企实习岗位撮合平台</a>
    <div class="navbar-user">
      <span>${currentUser.name}</span>
      <span class="role-badge">${ROLE_LABELS[currentUser.role]}</span>
      <button class="btn btn-outline btn-sm" onclick="logout()">退出</button>
    </div>
  `;
}

function renderMenu() {
  const menu = document.getElementById('sidebar');
  const role = currentUser.role;
  let items = [];

  items.push({ label: '岗位列表', action: 'showPositions' });

  if (role === 'student') {
    items.push({ label: '我的简历', action: 'showMyResume' });
    items.push({ label: '我的投递', action: 'showMyApplications' });
  }
  if (role === 'college_teacher') {
    items.push({ label: '简历审核', action: 'showResumeReview' });
    items.push({ label: '学生投递', action: 'showMyApplications' });
  }
  if (role === 'enterprise_mentor') {
    items.push({ label: '发布岗位', action: 'showCreatePosition' });
    items.push({ label: '投递管理', action: 'showMyApplications' });
  }
  if (role === 'employment_admin') {
    items.push({ label: '全部投递', action: 'showAllApplications' });
    items.push({ label: '用户管理', action: 'showUserMgmt' });
    items.push({ label: '数据统计', action: 'showStats' });
  }

  menu.innerHTML = items.map(i => `<div class="menu-item" onclick="${i.action}()">${i.label}</div>`).join('');
  if (items.length > 0) {
    items[0].action();
  }
}

async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    currentUser = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    renderNavbar();
    renderMenu();
  } catch (e) {
    document.getElementById('login-error').textContent = e.message;
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  renderNavbar();
  showLogin();
}

async function checkAuth() {
  try {
    currentUser = await api('/api/auth/me');
    renderNavbar();
    renderMenu();
  } catch {
    showLogin();
  }
}

function showLogin() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <h2>校企实习岗位撮合平台</h2>
        <p>请登录以继续</p>
        <div id="login-error" class="alert alert-error" style="display:none"></div>
        <div class="form-group">
          <label>用户名</label>
          <input type="text" id="username" placeholder="请输入用户名" onkeydown="if(event.key==='Enter')login()">
        </div>
        <div class="form-group">
          <label>密码</label>
          <input type="password" id="password" placeholder="请输入密码" onkeydown="if(event.key==='Enter')login()">
        </div>
        <button class="btn btn-primary" onclick="login()">登录</button>
        <div style="margin-top:20px;font-size:12px;color:var(--text-secondary)">
          <p><b>测试账号:</b></p>
          <p>就业管理员: admin / admin123</p>
          <p>学院老师: teacher1 / teacher123</p>
          <p>企业导师: mentor1 / mentor123</p>
          <p>学&ensp;生: student1 / student123</p>
        </div>
      </div>
    </div>
  `;
}

async function showPositions() {
  const positions = await api('/api/positions');
  const isStudent = currentUser.role === 'student';
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <h1>岗位列表</h1>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>岗位名称</th>
              <th>企业</th>
              <th>容量</th>
              <th>已录用</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${positions.map(p => `
              <tr>
                <td><a href="#" onclick="showPositionDetail('${p.id}')">${p.title}</a></td>
                <td>${p.company_name}</td>
                <td>${p.hired_count}/${p.capacity}</td>
                <td>${p.hired_count}</td>
                <td>${statusBadge(p.status === 'open' ? 'open' : 'closed', 'resume')}</td>
                <td class="actions-cell">
                  <button class="btn btn-outline btn-sm" onclick="showPositionDetail('${p.id}')">详情</button>
                  ${isStudent && p.status === 'open' && p.hired_count < p.capacity ? `<button class="btn btn-primary btn-sm" onclick="applyPosition('${p.id}')">投递</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function showPositionDetail(id) {
  const data = await api(`/api/positions/${id}`);
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <h1>${data.title}</h1>
      <button class="btn btn-outline" onclick="showPositions()">返回列表</button>
    </div>
    <div class="card">
      <div class="detail-grid">
        <dt>企业</dt><dd>${data.company_name}</dd>
        <dt>描述</dt><dd>${data.description || '-'}</dd>
        <dt>容量</dt><dd>${data.hired_count}/${data.capacity}</dd>
        <dt>状态</dt><dd>${statusBadge(data.status === 'open' ? 'open' : 'closed', 'resume')}</dd>
        <dt>创建人</dt><dd>${data.creator_name}</dd>
      </div>
    </div>
    <div class="card">
      <div class="card-header">投递列表</div>
      ${data.applications.length === 0 ? '<div class="empty-state">暂无投递</div>' : `
        <table>
          <thead><tr><th>学生</th><th>状态</th><th>投递时间</th></tr></thead>
          <tbody>
            ${data.applications.map(a => `
              <tr>
                <td>${a.student_name}</td>
                <td>${statusBadge(a.status)}</td>
                <td>${a.created_at || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

async function applyPosition(positionId) {
  try {
    await api('/api/applications', {
      method: 'POST',
      body: JSON.stringify({ position_id: positionId }),
    });
    alert('投递成功！');
    showMyApplications();
  } catch (e) {
    alert('投递失败: ' + e.message);
  }
}

async function showMyResume() {
  const resumes = await api('/api/resumes');
  const main = document.getElementById('main-content');
  const resume = resumes.length > 0 ? resumes[0] : null;

  main.innerHTML = `
    <div class="page-header"><h1>我的简历</h1></div>
    <div class="card">
      ${resume ? `
        <div class="detail-grid">
          <dt>审核状态</dt><dd>${statusBadge(resume.college_status, 'resume')}</dd>
          ${resume.reviewer_name ? `<dt>审核人</dt><dd>${resume.reviewer_name}</dd>` : ''}
          ${resume.reviewed_at ? `<dt>审核时间</dt><dd>${resume.reviewed_at}</dd>` : ''}
        </div>
        <div style="margin-top:16px">
          <div class="form-group">
            <label>简历内容</label>
            <textarea id="resume-content" rows="6">${resume.content}</textarea>
          </div>
          <button class="btn btn-primary" onclick="saveResume()">保存修改</button>
          <span style="margin-left:12px;font-size:13px;color:var(--text-secondary)">修改后需重新审核</span>
        </div>
      ` : `
        <div class="form-group">
          <label>简历内容</label>
          <textarea id="resume-content" rows="6" placeholder="请输入您的简历信息"></textarea>
        </div>
        <button class="btn btn-primary" onclick="saveResume()">提交简历</button>
      `}
    </div>
  `;
}

async function saveResume() {
  const content = document.getElementById('resume-content').value;
  try {
    await api('/api/resumes', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    alert('简历已保存');
    showMyResume();
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

async function showMyApplications() {
  const apps = await api('/api/applications');
  const main = document.getElementById('main-content');
  const isMentor = currentUser.role === 'enterprise_mentor';
  const isTeacher = currentUser.role === 'college_teacher';

  main.innerHTML = `
    <div class="page-header"><h1>${isMentor ? '投递管理' : isTeacher ? '学生投递' : '我的投递'}</h1></div>
    <div class="card">
      ${apps.length === 0 ? '<div class="empty-state">暂无投递记录</div>' : `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                ${isMentor || isTeacher ? '<th>学生</th>' : ''}
                <th>岗位</th>
                <th>企业</th>
                <th>简历审核</th>
                <th>投递状态</th>
                <th>投递时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${apps.map(a => `
                <tr>
                  ${isMentor || isTeacher ? `<td>${a.student_name || '-'}</td>` : ''}
                  <td>${a.position_title}</td>
                  <td>${a.company_name}</td>
                  <td>${statusBadge(a.resume_college_status, 'resume')}</td>
                  <td>${statusBadge(a.status)}</td>
                  <td>${a.created_at || '-'}</td>
                  <td class="actions-cell">
                    ${isMentor && a.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="updateAppStatus('${a.id}','enterprise_reviewing')">开始审核</button>` : ''}
                    ${isMentor && a.status === 'enterprise_reviewing' ? `
                      <button class="btn btn-success btn-sm" onclick="updateAppStatus('${a.id}','hired')">录用</button>
                      <button class="btn btn-danger btn-sm" onclick="updateAppStatus('${a.id}','rejected')">拒绝</button>
                    ` : ''}
                    ${isTeacher && a.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="updateAppStatus('${a.id}','college_approved')">通过</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

async function updateAppStatus(appId, status) {
  try {
    await api(`/api/applications/${appId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    showMyApplications();
  } catch (e) {
    alert('操作失败: ' + e.message);
  }
}

async function showResumeReview() {
  const resumes = await api('/api/resumes');
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header"><h1>简历审核</h1></div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>学生</th><th>简历内容</th><th>审核状态</th><th>操作</th></tr>
          </thead>
          <tbody>
            ${resumes.map(r => `
              <tr>
                <td>${r.student_name}</td>
                <td style="max-width:300px">${r.content}</td>
                <td>${statusBadge(r.college_status, 'resume')}</td>
                <td class="actions-cell">
                  ${r.college_status === 'pending' ? `
                    <button class="btn btn-success btn-sm" onclick="reviewResume('${r.id}','approved')">通过</button>
                    <button class="btn btn-danger btn-sm" onclick="reviewResume('${r.id}','rejected')">拒绝</button>
                  ` : `<span style="font-size:12px;color:var(--text-secondary)">${r.reviewer_name || '-'}</span>`}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function reviewResume(resumeId, status) {
  try {
    await api(`/api/resumes/${resumeId}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ college_status: status }),
    });
    showResumeReview();
  } catch (e) {
    alert('审核失败: ' + e.message);
  }
}

async function showCreatePosition() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header"><h1>发布岗位</h1></div>
    <div class="card">
      <div class="form-group">
        <label>岗位名称</label>
        <input type="text" id="pos-title" placeholder="例如：Java开发实习生">
      </div>
      <div class="form-group">
        <label>岗位描述</label>
        <textarea id="pos-desc" rows="4" placeholder="请描述岗位职责和要求"></textarea>
      </div>
      <div class="form-group">
        <label>招聘容量</label>
        <input type="number" id="pos-capacity" value="1" min="1">
      </div>
      <button class="btn btn-primary" onclick="createPosition()">发布</button>
    </div>
  `;
}

async function createPosition() {
  const title = document.getElementById('pos-title').value;
  const description = document.getElementById('pos-desc').value;
  const capacity = parseInt(document.getElementById('pos-capacity').value);
  try {
    await api('/api/positions', {
      method: 'POST',
      body: JSON.stringify({ title, description, capacity }),
    });
    alert('岗位发布成功');
    showPositions();
  } catch (e) {
    alert('发布失败: ' + e.message);
  }
}

async function showAllApplications() {
  const apps = await api('/api/admin/all-applications');
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header"><h1>全部投递</h1></div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>学生</th><th>岗位</th><th>企业</th><th>简历审核</th><th>投递状态</th><th>投递时间</th></tr>
          </thead>
          <tbody>
            ${apps.map(a => `
              <tr>
                <td>${a.student_name}</td>
                <td>${a.position_title}</td>
                <td>${a.company_name}</td>
                <td>${statusBadge(a.resume_college_status, 'resume')}</td>
                <td>${statusBadge(a.status)}</td>
                <td>${a.created_at || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function showUserMgmt() {
  const users = await api('/api/admin/users');
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header"><h1>用户管理</h1></div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>用户名</th><th>姓名</th><th>角色</th><th>学院</th><th>企业</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${u.username}</td>
                <td>${u.name}</td>
                <td><span class="role-badge">${ROLE_LABELS[u.role]}</span></td>
                <td>${u.college_name || '-'}</td>
                <td>${u.company_name || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function showStats() {
  const stats = await api('/api/admin/stats');
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header"><h1>数据统计</h1></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px">
      <div class="card" style="text-align:center">
        <div style="font-size:32px;font-weight:700;color:var(--primary)">${stats.total_students}</div>
        <div style="color:var(--text-secondary)">学生数</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:32px;font-weight:700;color:var(--primary)">${stats.total_positions}</div>
        <div style="color:var(--text-secondary)">岗位数</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:32px;font-weight:700;color:var(--success)">${stats.open_positions}</div>
        <div style="color:var(--text-secondary)">开放岗位</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:32px;font-weight:700;color:var(--warning)">${stats.total_applications}</div>
        <div style="color:var(--text-secondary)">投递数</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:32px;font-weight:700;color:var(--success)">${stats.hired}</div>
        <div style="color:var(--text-secondary)">已录用</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:32px;font-weight:700;color:var(--danger)">${stats.pending_resumes}</div>
        <div style="color:var(--text-secondary)">待审核简历</div>
      </div>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', checkAuth);
