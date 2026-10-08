import re

with open('js/app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Replace data layer
new_data_layer = """
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
"""
code = re.sub(r'function loadDB\(\) \{.*?function clearSession\(\) \{\n    localStorage.removeItem\(SESSION_KEY\);\n\}', new_data_layer.strip(), code, flags=re.DOTALL)

# 2. Make render async
code = code.replace('function render() {', 'async function render() {\n    await fetchDB();')
code = code.replace("window.addEventListener('hashchange', render);", "window.addEventListener('hashchange', () => render());")
code = code.replace("window.addEventListener('DOMContentLoaded', render);", "window.addEventListener('DOMContentLoaded', () => render());")

# 3. Handle Register
new_handle_register = """
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
"""
code = re.sub(r'App\.handleRegister = function \(e\) \{.*?return false;\n\};', new_handle_register.strip(), code, flags=re.DOTALL)

# 4. Handle Create Ticket
new_create_ticket = """
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
"""
code = re.sub(r'App\.handleCreateTicket = function \(e\) \{.*?return false;\n\};', new_create_ticket.strip(), code, flags=re.DOTALL)

# 5. Handle Add Comment
new_add_comment = """
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
"""
code = re.sub(r'App\.handleAddComment = function \(e, ticketId\) \{.*?return false;\n\};', new_add_comment.strip(), code, flags=re.DOTALL)

# 6. Updates (Status, Priority, Assign, Role)
new_updates = """
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
"""
code = re.sub(r'App\.updateStatus = function \(ticketId, newStatus\) \{.*?renderViewTicket\(ticketId\);\n\};', new_updates.strip(), code, flags=re.DOTALL)

new_change_role = """
App.changeRole = async function (userId, newRole) {
    const me = currentUser();
    if (userId === me.id) return;
    await fetch(`/api/users/${userId}`, {
        method: 'PATCH', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ role: newRole })
    });
    render();
};
"""
code = re.sub(r'App\.changeRole = function \(userId, newRole\) \{.*?renderManageUsers\(\);\n\};', new_change_role.strip(), code, flags=re.DOTALL)

# 7. Demo Data
new_seed = """
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
"""
code = re.sub(r'function seedDemoData\(\) \{.*?saveDB\(\{ users, tickets, comments, history \}\);\n\}\n\n/\* ---------------- Dashboard ---------------- \*/', new_seed.strip() + '\n\n/* ---------------- Dashboard ---------------- */', code, flags=re.DOTALL)
code = re.sub(r'App\.loadDemoData = function \(\) \{.*?\n\};\n', '', code, flags=re.DOTALL)
code = code.replace('window.App = App;', 'window.App = App;\n' + 'App.loadDemoData = ' + new_seed.split('App.loadDemoData =')[1] if 'App.loadDemoData =' in new_seed else 'window.App = App;\n')
# Wait, my regex deleted App.loadDemoData earlier if it was matched poorly. Let's just do it cleanly by rewriting the whole section.
code = re.sub(r'App\.loadDemoData = function \(\) \{.*?saveDB\(\{ users, tickets, comments, history \}\);\n\}', new_seed.strip(), code, flags=re.DOTALL)


with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(code)
