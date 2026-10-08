/* ============================================================
   ServiceDesk (client-side edition)
   No server, no database — everything is stored in the
   browser's localStorage. Open index.html and go.
   ============================================================ */

const DB_KEY = 'sd_db_v1';
const SESSION_KEY = 'sd_session_v1';

/* ---------------- Data layer ---------------- */

let remoteDB = { users: [], tickets: [], comments: [], history: [] };

async function fetchDB() {
    try {
        const res = await fetch('/api/db');
        if (res.ok) {
            remoteDB = await res.json();
        }
    } catch (e) {
        console.error("Failed to fetch DB", e);
    }
}

function loadDB() {
    return remoteDB;
}

function saveDB(db) {
    // No-op for local, handled by API now
}

function getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
}

function setSession(userId) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

function currentUser() {
    const s = getSession();
    if (!s) return null;
    const db = loadDB();
    return db.users.find(u => u.id === s.userId) || null;
}

function nextId(arr) {
    return arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
}

function fmtDate(iso, withTime = true) {
    const d = new Date(iso);
    return withTime
        ? d.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function slug(status) {
    return status.toLowerCase().replace(/ /g, '-');
}

function logHistory(db, ticketId, field, oldVal, newVal, userId) {
    db.history.push({
        id: nextId(db.history),
        ticket_id: ticketId,
        field_changed: field,
        old_value: oldVal,
        new_value: newVal,
        changed_by: userId,
        changed_at: new Date().toISOString()
    });
}

function generateTicketNumber(db) {
    return 'INC' + String(db.tickets.length + 1).padStart(4, '0');
}

function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

/* ---------------- Router ---------------- */

function go(hash) {
    location.hash = hash;
}

async function render() {
    await fetchDB();
    const hash = (location.hash || '#/login').slice(1);
    const [path, query] = hash.split('?');
    const params = new URLSearchParams(query || '');
    const user = currentUser();

    const publicRoutes = ['/login', '/register'];

    if (!user && !publicRoutes.includes(path)) { go('#/login'); return; }
    if (user && publicRoutes.includes(path)) { go('#/dashboard'); return; }

    if (path === '/login') return renderLogin();
    if (path === '/register') return renderRegister();
    if (path === '/dashboard') return renderShell(renderDashboard);
    if (path === '/create-ticket') return renderShell(renderCreateTicket);
    if (path === '/ticket') return renderShell(() => renderViewTicket(parseInt(params.get('id'))));
    if (path === '/my-tickets') return renderShell(renderMyTickets);
    if (path === '/all-tickets') return renderShell(renderAllTickets);
    if (path === '/manage-users') return renderShell(renderManageUsers);

    go('#/dashboard');
}

window.addEventListener('hashchange', () => render());
window.addEventListener('DOMContentLoaded', () => render());

/* ---------------- Layout shell (sidebar + content) ---------------- */

function renderShell(contentFn) {
    const user = currentUser();
    const path = (location.hash || '').split('?')[0].slice(1);
    const root = document.getElementById('root');

    const navItem = (href, icon, label, activePaths) => `
        <a href="#${href}" class="${activePaths.includes(path) ? 'active' : ''}">
            <span class="icon">${icon}</span> ${label}
        </a>`;

    root.innerHTML = `
    <div class="app-shell">
        <aside class="sidebar">
            <div class="brand"><span class="brand-icon">◆</span><span class="brand-text">ServiceDesk</span></div>
            <nav class="nav-menu">
                ${navItem('/dashboard', '▤', 'Dashboard', ['/dashboard'])}
                ${navItem('/create-ticket', '＋', 'New Ticket', ['/create-ticket'])}
                ${navItem('/my-tickets', '☰', 'My Tickets', ['/my-tickets'])}
                ${['agent', 'admin'].includes(user.role) ? navItem('/all-tickets', '⚙', 'Queue (All Tickets)', ['/all-tickets']) : ''}
                ${user.role === 'admin' ? navItem('/manage-users', '👤', 'Manage Users', ['/manage-users']) : ''}
            </nav>
            <div class="sidebar-footer">
                <div class="user-chip">
                    <div class="avatar">${esc(user.name[0].toUpperCase())}</div>
                    <div class="user-meta">
                        <div class="user-name">${esc(user.name)}</div>
                        <div class="user-role">${esc(cap(user.role))}</div>
                    </div>
                </div>
                <a href="#" class="logout-link" onclick="App.logout(); return false;">Log Out</a>
            </div>
        </aside>
        <main class="main-content" id="content"></main>
    </div>`;

    contentFn();
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---------------- Auth pages ---------------- */

function renderLogin() {
    const root = document.getElementById('root');
    root.innerHTML = `
    <div class="auth-body">
    <div class="auth-wrapper">
        <div class="auth-card">
            <div class="auth-brand">
                <span class="brand-icon">◆</span>
                <h1>ServiceDesk</h1>
                <p>IT Help Desk &amp; Request Management</p>
            </div>
            <div id="auth-message"></div>
            <form onsubmit="return App.handleLogin(event)" class="auth-form">
                <label>Email</label>
                <input type="email" id="login-email" placeholder="you@company.com" required autofocus>
                <label>Password</label>
                <input type="password" id="login-password" placeholder="••••••••" required>
                <button type="submit" class="btn btn-primary btn-block">Sign In</button>
            </form>
            <p class="auth-switch">Don't have an account? <a href="#/register">Create one</a></p>
            <p class="auth-hint">Tip: the very first person to register becomes the Admin automatically.</p>
            <div class="auth-demo">
                <button onclick="App.loadDemoData()">⚡ Load demo data instead</button>
                <p>Seeds 3 sample accounts (Admin/Agent/Employee) and sample tickets so you can explore instantly.</p>
            </div>
        </div>
    </div>
    </div>`;
    document.body.className = 'auth-active';
}

function renderRegister() {
    const root = document.getElementById('root');
    const isFirst = loadDB().users.length === 0;
    root.innerHTML = `
    <div class="auth-body">
    <div class="auth-wrapper">
        <div class="auth-card">
            <div class="auth-brand">
                <span class="brand-icon">◆</span>
                <h1>Create Account</h1>
                <p>${isFirst ? "You'll be the first user — automatically made Admin." : 'Join ServiceDesk to raise or manage tickets'}</p>
            </div>
            <div id="auth-message"></div>
            <form onsubmit="return App.handleRegister(event)" class="auth-form">
                <label>Full Name</label>
                <input type="text" id="reg-name" placeholder="Jane Doe" required autofocus>
                <label>Email</label>
                <input type="email" id="reg-email" placeholder="you@company.com" required>
                <label>Department</label>
                <input type="text" id="reg-department" placeholder="e.g. Sales, IT, HR" value="General">
                <label>Password</label>
                <input type="password" id="reg-password" placeholder="At least 6 characters" required>
                <label>Confirm Password</label>
                <input type="password" id="reg-confirm" placeholder="Repeat password" required>
                <button type="submit" class="btn btn-primary btn-block">Create Account</button>
            </form>
            <p class="auth-switch">Already have an account? <a href="#/login">Sign in</a></p>
        </div>
    </div>
    </div>`;
    document.body.className = 'auth-active';
}

/* ---------------- Auth handlers ---------------- */

const App = {};

App.handleLogin = function (e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const db = loadDB();
    const user = db.users.find(u => u.email.toLowerCase() === email && u.password === password);
    const msg = document.getElementById('auth-message');
    if (!user) {
        msg.innerHTML = `<div class="alert alert-error">Invalid email or password.</div>`;
        return false;
    }
    setSession(user.id);
    go('#/dashboard');
    return false;
};

App.handleRegister = async function (e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const department = document.getElementById('reg-department').value.trim() || 'General';
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const msg = document.getElementById('auth-message');

    if (password !== confirm) {
        msg.innerHTML = `<div class="alert alert-error">Passwords do not match.</div>`;
        return false;
    }
    if (password.length < 6) {
        msg.innerHTML = `<div class="alert alert-error">Password must be at least 6 characters.</div>`;
        return false;
    }
    const db = loadDB();
    if (db.users.some(u => u.email.toLowerCase() === email)) {
        msg.innerHTML = `<div class="alert alert-error">An account with that email already exists.</div>`;
        return false;
    }
    const isFirst = db.users.length === 0;
    
    const user = {
        name, email, password, department,
        role: isFirst ? 'admin' : 'employee',
        created_at: new Date().toISOString()
    };
    
    const res = await fetch('/api/users', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(user)
    });
    const data = await res.json();
    setSession(data.id);
    go('#/dashboard');
    return false;
};

App.logout = function () {
    clearSession();
    go('#/login');
};


/* ---------------- Demo data seeding ---------------- */

async function seedDemoData() {
    const now = Date.now();
    const iso = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();

    const users = [
        { id: 1, name: 'Ava Patel', email: 'admin@demo.com', password: 'admin123', role: 'admin', department: 'IT', created_at: iso(30) },
        { id: 2, name: 'Rohan Shah', email: 'agent@demo.com', password: 'agent123', role: 'agent', department: 'IT Support', created_at: iso(28) },
        { id: 3, name: 'Priya Nair', email: 'employee@demo.com', password: 'employee123', role: 'employee', department: 'Sales', created_at: iso(25) },
        { id: 4, name: 'Karan Mehta', email: 'karan@demo.com', password: 'employee123', role: 'employee', department: 'Finance', created_at: iso(20) }
    ];

    const tickets = [
        { id: 1, ticket_number: 'INC0001', subject: "Laptop won't turn on", description: 'Pressed the power button several times this morning, no lights, no fan noise. Tried a different outlet too.', category: 'Hardware', priority: 'High', status: 'In Progress', created_by: 3, assigned_to: 2, created_at: iso(6), updated_at: iso(1), resolved_at: null },
        { id: 2, ticket_number: 'INC0002', subject: 'Need access to Finance shared drive', description: 'Starting a new project with the Finance team and need read/write access to the shared drive folder "FY26-Budget".', category: 'Access', priority: 'Medium', status: 'Resolved', created_by: 4, assigned_to: 2, created_at: iso(9), updated_at: iso(7), resolved_at: iso(7) },
        { id: 3, ticket_number: 'INC0003', subject: 'VPN keeps disconnecting', description: 'VPN drops every 10-15 minutes while working from home, forcing me to reconnect constantly.', category: 'Network', priority: 'Critical', status: 'New', created_by: 3, assigned_to: null, created_at: iso(1), updated_at: iso(1), resolved_at: null },
        { id: 4, ticket_number: 'INC0004', subject: 'Requesting 2 days of casual leave', description: 'Requesting casual leave for next Monday and Tuesday for a family function.', category: 'Leave Request', priority: 'Low', status: 'Closed', created_by: 4, assigned_to: 1, created_at: iso(15), updated_at: iso(14), resolved_at: iso(14) },
        { id: 5, ticket_number: 'INC0005', subject: 'Outlook crashing when opening attachments', description: 'Outlook freezes and crashes specifically when opening .xlsx attachments larger than 5MB.', category: 'Software', priority: 'Medium', status: 'Assigned', created_by: 3, assigned_to: 2, created_at: iso(2), updated_at: iso(2), resolved_at: null },
        { id: 6, ticket_number: 'INC0006', subject: 'Noise complaint about open office AC unit', description: 'The AC unit near the west wing desks has been making a loud rattling noise for two days, quite distracting.', category: 'Complaint', priority: 'Low', status: 'New', created_by: 4, assigned_to: null, created_at: iso(0.5), updated_at: iso(0.5), resolved_at: null }
    ];

    const comments = [
        { id: 1, ticket_id: 1, user_id: 2, comment: 'Picked this up — swapping the power adapter first to rule out a charging issue.', is_work_note: 1, created_at: iso(2) },
        { id: 2, ticket_id: 1, user_id: 2, comment: "We're testing with a spare adapter, will update you by end of day.", is_work_note: 0, created_at: iso(1) },
        { id: 3, ticket_id: 2, user_id: 2, comment: 'Access granted via the Finance shared drive group. Please confirm you can see the folder.', is_work_note: 0, created_at: iso(7) },
        { id: 4, ticket_id: 2, user_id: 4, comment: 'Confirmed, I can see it now. Thanks!', is_work_note: 0, created_at: iso(6.5) },
        { id: 5, ticket_id: 4, user_id: 1, comment: 'Approved. Enjoy the time off.', is_work_note: 0, created_at: iso(14.2) }
    ];

    const history = [
        { id: 1, ticket_id: 1, field_changed: 'status', old_value: null, new_value: 'New', changed_by: 3, changed_at: iso(6) },
        { id: 2, ticket_id: 1, field_changed: 'assigned_to', old_value: 'Unassigned', new_value: 'Rohan Shah', changed_by: 1, changed_at: iso(5) },
        { id: 3, ticket_id: 1, field_changed: 'status', old_value: 'Assigned', new_value: 'In Progress', changed_by: 2, changed_at: iso(2) },
        { id: 4, ticket_id: 2, field_changed: 'status', old_value: null, new_value: 'New', changed_by: 4, changed_at: iso(9) },
        { id: 5, ticket_id: 2, field_changed: 'assigned_to', old_value: 'Unassigned', new_value: 'Rohan Shah', changed_by: 1, changed_at: iso(8) },
        { id: 6, ticket_id: 2, field_changed: 'status', old_value: 'In Progress', new_value: 'Resolved', changed_by: 2, changed_at: iso(7) },
        { id: 7, ticket_id: 4, field_changed: 'status', old_value: 'Resolved', new_value: 'Closed', changed_by: 1, changed_at: iso(14) },
        { id: 8, ticket_id: 5, field_changed: 'assigned_to', old_value: 'Unassigned', new_value: 'Rohan Shah', changed_by: 1, changed_at: iso(2) }
    ];

    await fetch('/api/seed', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ users, tickets, comments, history })
    });
}

App.loadDemoData = async function () {
    await seedDemoData();
    await fetchDB();
    toast('Demo data loaded — signed in as Admin');
    const db = loadDB();
    const admin = db.users.find(u => u.email === 'admin@demo.com');
    if (admin) {
        setSession(admin.id);
        go('#/dashboard');
    }
};

/* ---------------- Dashboard ---------------- */

function renderDashboard() {
    const user = currentUser();
    const db = loadDB();
    const content = document.getElementById('content');

    const scoped = user.role === 'employee' ? db.tickets.filter(t => t.created_by === user.id) : db.tickets;
    const countBy = s => scoped.filter(t => t.status === s).length;
    const open = countBy('New') + countBy('Assigned') + countBy('In Progress') + countBy('Reopened') + countBy('On Hold');
    const resolved = countBy('Resolved');
    const closed = countBy('Closed');
    const total = scoped.length;
    const unassigned = db.tickets.filter(t => !t.assigned_to && !['Resolved', 'Closed'].includes(t.status)).length;

    const recent = [...scoped].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);

    content.innerHTML = `
    <div class="page-header">
        <div>
            <h1>Welcome, ${esc(user.name)} 👋</h1>
            <p class="subtitle">Here's what's happening with your ${user.role === 'employee' ? 'requests' : 'service desk'} today.</p>
        </div>
        <a href="#/create-ticket" class="btn btn-primary">＋ New Ticket</a>
    </div>

    <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon icon-blue">▤</div><div class="stat-value">${total}</div><div class="stat-label">Total Tickets</div></div>
        <div class="stat-card"><div class="stat-icon icon-orange">◷</div><div class="stat-value">${open}</div><div class="stat-label">Open / In Progress</div></div>
        <div class="stat-card"><div class="stat-icon icon-green">✓</div><div class="stat-value">${resolved}</div><div class="stat-label">Resolved</div></div>
        <div class="stat-card"><div class="stat-icon icon-gray">■</div><div class="stat-value">${closed}</div><div class="stat-label">Closed</div></div>
        ${['agent', 'admin'].includes(user.role) ? `<div class="stat-card"><div class="stat-icon icon-red">!</div><div class="stat-value">${unassigned}</div><div class="stat-label">Unassigned</div></div>` : ''}
    </div>

    <div class="panel">
        <div class="panel-header">
            <h2>${user.role === 'employee' ? 'Your Recent Tickets' : 'Recent Activity'}</h2>
            <a href="#${user.role === 'employee' ? '/my-tickets' : '/all-tickets'}" class="link">View all →</a>
        </div>
        ${recent.length === 0 ? `
            <div class="empty-state"><p>No tickets yet.</p><a href="#/create-ticket" class="btn btn-primary">Create your first ticket</a></div>
        ` : `
        <table class="data-table">
            <thead><tr><th>Ticket #</th><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th>
            ${user.role !== 'employee' ? '<th>Requested By</th>' : ''}<th>Assigned To</th><th>Updated</th></tr></thead>
            <tbody>${recent.map(t => ticketRow(t, db, user)).join('')}</tbody>
        </table>`}
    </div>`;
}

function ticketRow(t, db, user) {
    const assignee = db.users.find(u => u.id === t.assigned_to);
    const creator = db.users.find(u => u.id === t.created_by);
    return `
    <tr class="clickable-row" onclick="location.hash='#/ticket?id=${t.id}'">
        <td class="mono">${esc(t.ticket_number)}</td>
        <td>${esc(t.subject)}</td>
        <td>${esc(t.category)}</td>
        <td><span class="badge priority-${t.priority.toLowerCase()}">${esc(t.priority)}</span></td>
        <td><span class="badge status-${slug(t.status)}">${esc(t.status)}</span></td>
        ${user.role !== 'employee' ? `<td>${esc(creator ? creator.name : '—')}</td>` : ''}
        <td>${esc(assignee ? assignee.name : 'Unassigned')}</td>
        <td>${fmtDate(t.updated_at)}</td>
    </tr>`;
}

/* ---------------- Create ticket ---------------- */

function renderCreateTicket() {
    const content = document.getElementById('content');
    content.innerHTML = `
    <div class="page-header">
        <div><h1>Raise a New Ticket</h1><p class="subtitle">Describe your issue or request and our team will pick it up.</p></div>
    </div>
    <div class="panel form-panel">
        <div id="ticket-message"></div>
        <form onsubmit="return App.handleCreateTicket(event)" class="stacked-form">
            <label>Subject</label>
            <input type="text" id="t-subject" placeholder="Short summary, e.g. 'Laptop won't turn on'" required>
            <div class="form-row">
                <div class="form-col">
                    <label>Category</label>
                    <select id="t-category">
                        ${['Hardware', 'Software', 'Network', 'Access', 'Leave Request', 'Complaint', 'Other'].map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <div class="form-col">
                    <label>Priority</label>
                    <select id="t-priority">
                        ${['Low', 'Medium', 'High', 'Critical'].map(p => `<option value="${p}" ${p === 'Medium' ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
            </div>
            <label>Description</label>
            <textarea id="t-description" rows="6" placeholder="Provide as much detail as possible..." required></textarea>
            <div class="form-actions">
                <a href="#/dashboard" class="btn btn-secondary">Cancel</a>
                <button type="submit" class="btn btn-primary">Submit Ticket</button>
            </div>
        </form>
    </div>`;
}

App.handleCreateTicket = async function (e) {
    e.preventDefault();
    const user = currentUser();
    const subject = document.getElementById('t-subject').value.trim();
    const description = document.getElementById('t-description').value.trim();
    const category = document.getElementById('t-category').value;
    const priority = document.getElementById('t-priority').value;

    if (!subject || !description) {
        document.getElementById('ticket-message').innerHTML = `<div class="alert alert-error">Subject and description are required.</div>`;
        return false;
    }

    const db = loadDB();
    const ticket = {
        ticket_number: generateTicketNumber(db),
        subject, description, category, priority,
        status: 'New',
        created_by: user.id,
        assigned_to: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        resolved_at: null
    };
    
    const res = await fetch('/api/tickets', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(ticket)
    });
    const data = await res.json();
    
    await fetch('/api/history', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ticket_id: data.id,
            field_changed: 'status',
            old_value: null,
            new_value: 'New',
            changed_by: user.id,
            changed_at: new Date().toISOString()
        })
    });
    
    go(`#/ticket?id=${data.id}&created=1`);
    return false;
};

/* ---------------- View ticket ---------------- */

function renderViewTicket(ticketId) {
    const user = currentUser();
    const db = loadDB();
    const content = document.getElementById('content');
    const ticket = db.tickets.find(t => t.id === ticketId);

    if (!ticket) { go('#/dashboard'); return; }
    if (user.role === 'employee' && ticket.created_by !== user.id) { go('#/dashboard'); return; }

    const canManage = ['agent', 'admin'].includes(user.role);
    const creator = db.users.find(u => u.id === ticket.created_by);
    const assignee = db.users.find(u => u.id === ticket.assigned_to);
    const agents = db.users.filter(u => ['agent', 'admin'].includes(u.role));

    const comments = db.comments
        .filter(c => c.ticket_id === ticket.id && (canManage || !c.is_work_note))
        .map(c => ({ type: 'comment', time: c.created_at, data: c }));
    const history = db.history
        .filter(h => h.ticket_id === ticket.id)
        .map(h => ({ type: 'history', time: h.changed_at, data: h }));
    const timeline = [...comments, ...history].sort((a, b) => new Date(a.time) - new Date(b.time));

    const wasJustCreated = location.hash.includes('created=1');

    content.innerHTML = `
    ${wasJustCreated ? `<div class="alert alert-success">✓ Ticket ${esc(ticket.ticket_number)} created successfully.</div>` : ''}
    <div class="page-header">
        <div>
            <h1>${esc(ticket.ticket_number)} — ${esc(ticket.subject)}</h1>
            <p class="subtitle">Opened by ${esc(creator ? creator.name : 'Unknown')} on ${fmtDate(ticket.created_at)}</p>
        </div>
        <div class="header-badges">
            <span class="badge status-${slug(ticket.status)} badge-lg">${esc(ticket.status)}</span>
            <span class="badge priority-${ticket.priority.toLowerCase()} badge-lg">${esc(ticket.priority)}</span>
        </div>
    </div>

    <div class="ticket-layout">
        <div class="ticket-main">
            <div class="panel">
                <div class="panel-header"><h2>Description</h2></div>
                <p class="ticket-description">${esc(ticket.description)}</p>
                <div class="meta-row">
                    <div><span class="meta-label">Category</span><span>${esc(ticket.category)}</span></div>
                    <div><span class="meta-label">Assigned To</span><span>${esc(assignee ? assignee.name : 'Unassigned')}</span></div>
                    <div><span class="meta-label">Last Updated</span><span>${fmtDate(ticket.updated_at)}</span></div>
                </div>
            </div>

            <div class="panel" id="activity">
                <div class="panel-header"><h2>Activity</h2></div>
                <div class="timeline">
                    ${timeline.length === 0 ? '<p class="empty-hint">No activity yet.</p>' : timeline.map(item => timelineItem(item, db)).join('')}
                </div>
                <form onsubmit="return App.handleAddComment(event, ${ticket.id})" class="comment-form">
                    <textarea id="new-comment" rows="3" placeholder="Add a comment..." required></textarea>
                    <div class="comment-form-footer">
                        ${canManage ? `<label class="checkbox-label"><input type="checkbox" id="is-work-note"> Internal work note (hidden from requester)</label>` : '<span></span>'}
                        <button type="submit" class="btn btn-primary">Post</button>
                    </div>
                </form>
            </div>
        </div>

        <div class="ticket-sidebar">
            <div class="panel">
                <div class="panel-header"><h2>Requester</h2></div>
                <div class="requester-card">
                    <div class="avatar avatar-lg">${esc((creator ? creator.name[0] : '?').toUpperCase())}</div>
                    <div><div class="user-name">${esc(creator ? creator.name : 'Unknown')}</div><div class="user-role">${esc(creator ? creator.email : '')}</div></div>
                </div>
            </div>

            ${canManage ? `
            <div class="panel">
                <div class="panel-header"><h2>Workflow</h2></div>
                <div class="stacked-form compact-form">
                    <label>Status</label>
                    <select onchange="App.updateStatus(${ticket.id}, this.value)">
                        ${['New', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Reopened'].map(s => `<option value="${s}" ${ticket.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="stacked-form compact-form">
                    <label>Priority</label>
                    <select onchange="App.updatePriority(${ticket.id}, this.value)">
                        ${['Low', 'Medium', 'High', 'Critical'].map(p => `<option value="${p}" ${ticket.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
                <div class="stacked-form compact-form">
                    <label>Assign To</label>
                    <select onchange="App.assignTicket(${ticket.id}, this.value)">
                        <option value="">— Select agent —</option>
                        ${agents.map(a => `<option value="${a.id}" ${ticket.assigned_to === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
                    </select>
                </div>
            </div>` : ''}
        </div>
    </div>`;
}

function timelineItem(item, db) {
    if (item.type === 'comment') {
        const c = item.data;
        const author = db.users.find(u => u.id === c.user_id);
        return `
        <div class="timeline-item ${c.is_work_note ? 'work-note' : ''}">
            <div class="timeline-avatar">${esc((author ? author.name[0] : '?').toUpperCase())}</div>
            <div class="timeline-body">
                <div class="timeline-head">
                    <strong>${esc(author ? author.name : 'Unknown')}</strong>
                    ${c.is_work_note ? '<span class="tag-worknote">Internal Work Note</span>' : ''}
                    <span class="timeline-time">${fmtDate(c.created_at)}</span>
                </div>
                <p>${esc(c.comment)}</p>
            </div>
        </div>`;
    } else {
        const h = item.data;
        const changer = db.users.find(u => u.id === h.changed_by);
        return `
        <div class="timeline-item timeline-system">
            <div class="timeline-avatar system-avatar">⚙</div>
            <div class="timeline-body">
                <p class="system-text">
                    <strong>${esc(changer ? changer.name : 'Unknown')}</strong> changed <strong>${esc(h.field_changed.replace('_', ' '))}</strong>
                    from <em>${esc(h.old_value || '—')}</em> to <em>${esc(h.new_value)}</em>
                    <span class="timeline-time">${fmtDate(h.changed_at)}</span>
                </p>
            </div>
        </div>`;
    }
}

App.handleAddComment = async function (e, ticketId) {
    e.preventDefault();
    const user = currentUser();
    const text = document.getElementById('new-comment').value.trim();
    const isWorkNote = document.getElementById('is-work-note');
    if (!text) return false;

    await fetch('/api/comments', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ticket_id: ticketId,
            user_id: user.id,
            comment: text,
            is_work_note: (isWorkNote && isWorkNote.checked) ? 1 : 0,
            created_at: new Date().toISOString()
        })
    });
    render();
    return false;
};

App.updateStatus = async function (ticketId, newStatus) {
    const user = currentUser();
    const db = loadDB();
    const ticket = db.tickets.find(t => t.id === ticketId);
    if (!ticket || ticket.status === newStatus) return;
    
    await fetch('/api/history', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ticket_id: ticketId, field_changed: 'status', old_value: ticket.status, new_value: newStatus, changed_by: user.id, changed_at: new Date().toISOString()
        })
    });
    
    const updates = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        resolved_at: ['Resolved', 'Closed'].includes(newStatus) ? new Date().toISOString() : null
    };
    await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(updates)
    });
    render();
};

App.updatePriority = async function (ticketId, newPriority) {
    const user = currentUser();
    const db = loadDB();
    const ticket = db.tickets.find(t => t.id === ticketId);
    if (!ticket || ticket.priority === newPriority) return;
    
    await fetch('/api/history', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ticket_id: ticketId, field_changed: 'priority', old_value: ticket.priority, new_value: newPriority, changed_by: user.id, changed_at: new Date().toISOString()
        })
    });
    
    await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ priority: newPriority, updated_at: new Date().toISOString() })
    });
    render();
};

App.assignTicket = async function (ticketId, agentId) {
    const user = currentUser();
    const db = loadDB();
    const ticket = db.tickets.find(t => t.id === ticketId);
    const agent = db.users.find(u => u.id === parseInt(agentId));
    if (!ticket || !agent) return;
    
    const oldAssignee = db.users.find(u => u.id === ticket.assigned_to);
    
    await fetch('/api/history', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ticket_id: ticketId, field_changed: 'assigned_to', old_value: oldAssignee ? oldAssignee.name : 'Unassigned', new_value: agent.name, changed_by: user.id, changed_at: new Date().toISOString()
        })
    });
    
    const updates = {
        assigned_to: agent.id,
        updated_at: new Date().toISOString()
    };
    if (ticket.status === 'New') updates.status = 'Assigned';
    
    await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(updates)
    });
    render();
};

/* ---------------- My tickets ---------------- */

function renderMyTickets() {
    const user = currentUser();
    const db = loadDB();
    const content = document.getElementById('content');
    const hashParams = new URLSearchParams((location.hash.split('?')[1] || ''));
    const statusFilter = hashParams.get('status') || 'all';

    let tickets = db.tickets.filter(t => t.created_by === user.id);
    if (statusFilter !== 'all') tickets = tickets.filter(t => t.status === statusFilter);
    tickets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const statuses = ['all', 'New', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed'];

    content.innerHTML = `
    <div class="page-header">
        <div><h1>My Tickets</h1><p class="subtitle">All requests you've submitted.</p></div>
        <a href="#/create-ticket" class="btn btn-primary">＋ New Ticket</a>
    </div>
    <div class="filter-bar">
        ${statuses.map(s => `<a href="#/my-tickets?status=${encodeURIComponent(s)}" class="filter-chip ${statusFilter === s ? 'active' : ''}">${s === 'all' ? 'All' : s}</a>`).join('')}
    </div>
    <div class="panel">
        ${tickets.length === 0 ? `<div class="empty-state"><p>No tickets found.</p><a href="#/create-ticket" class="btn btn-primary">Create a ticket</a></div>` : `
        <table class="data-table">
            <thead><tr><th>Ticket #</th><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Assigned To</th><th>Created</th></tr></thead>
            <tbody>${tickets.map(t => ticketRow(t, db, user)).join('')}</tbody>
        </table>`}
    </div>`;
}

/* ---------------- All tickets (agent/admin queue) ---------------- */

function renderAllTickets() {
    const user = currentUser();
    if (!['agent', 'admin'].includes(user.role)) { go('#/dashboard'); return; }
    const db = loadDB();
    const content = document.getElementById('content');
    const hashParams = new URLSearchParams((location.hash.split('?')[1] || ''));
    const statusFilter = hashParams.get('status') || 'all';
    const assignFilter = hashParams.get('assign') || 'all';

    let tickets = [...db.tickets];
    if (statusFilter !== 'all') tickets = tickets.filter(t => t.status === statusFilter);
    if (assignFilter === 'mine') tickets = tickets.filter(t => t.assigned_to === user.id);
    if (assignFilter === 'unassigned') tickets = tickets.filter(t => !t.assigned_to);

    const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    tickets.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || new Date(b.created_at) - new Date(a.created_at));

    const statuses = ['all', 'New', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed'];
    const assignOptions = [['all', 'Everyone'], ['mine', 'Assigned to Me'], ['unassigned', 'Unassigned']];

    content.innerHTML = `
    <div class="page-header">
        <div><h1>Ticket Queue</h1><p class="subtitle">All tickets across the organization, sorted by priority.</p></div>
    </div>
    <div class="filter-bar">
        ${statuses.map(s => `<a href="#/all-tickets?status=${encodeURIComponent(s)}&assign=${encodeURIComponent(assignFilter)}" class="filter-chip ${statusFilter === s ? 'active' : ''}">${s === 'all' ? 'All' : s}</a>`).join('')}
    </div>
    <div class="filter-bar secondary">
        ${assignOptions.map(([v, l]) => `<a href="#/all-tickets?status=${encodeURIComponent(statusFilter)}&assign=${encodeURIComponent(v)}" class="filter-chip ${assignFilter === v ? 'active' : ''}">${l}</a>`).join('')}
    </div>
    <div class="panel">
        ${tickets.length === 0 ? `<div class="empty-state"><p>No tickets match this filter.</p></div>` : `
        <table class="data-table">
            <thead><tr><th>Ticket #</th><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Requester</th><th>Assigned To</th><th>Updated</th></tr></thead>
            <tbody>${tickets.map(t => ticketRow(t, db, user)).join('')}</tbody>
        </table>`}
    </div>`;
}

/* ---------------- Manage users (admin) ---------------- */

function renderManageUsers() {
    const user = currentUser();
    if (user.role !== 'admin') { go('#/dashboard'); return; }
    const db = loadDB();
    const content = document.getElementById('content');

    const rows = [...db.users].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(u => {
        const raised = db.tickets.filter(t => t.created_by === u.id).length;
        const assigned = db.tickets.filter(t => t.assigned_to === u.id).length;
        const roleCell = u.id === user.id
            ? `<span class="badge status-in-progress">${cap(u.role)} (you)</span>`
            : `<select onchange="App.changeRole(${u.id}, this.value)">
                 ${['employee', 'agent', 'admin'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${cap(r)}</option>`).join('')}
               </select>`;
        return `<tr>
            <td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.department)}</td>
            <td>${roleCell}</td><td>${raised}</td><td>${assigned}</td><td>${fmtDate(u.created_at, false)}</td>
        </tr>`;
    }).join('');

    content.innerHTML = `
    <div class="page-header">
        <div><h1>Manage Users</h1><p class="subtitle">Assign roles: Employee (raises tickets), Agent (resolves tickets), Admin (full control).</p></div>
    </div>
    <div class="panel">
        <table class="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Raised</th><th>Assigned</th><th>Joined</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

App.changeRole = async function (userId, newRole) {
    const me = currentUser();
    if (userId === me.id) return;
    await fetch(`/api/users/${userId}`, {
        method: 'PATCH', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ role: newRole })
    });
    render();
};

window.App = App;
App.loadDemoData =  async function () {
    await seedDemoData();
    await fetchDB();
    toast('Demo data loaded — signed in as Admin');
    const db = loadDB();
    const admin = db.users.find(u => u.email === 'admin@demo.com');
    if (admin) {
        setSession(admin.id);
        go('#/dashboard');
    }
};

