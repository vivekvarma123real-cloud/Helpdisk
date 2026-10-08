# ServiceDesk — IT Help Desk Ticketing System (client-side edition)

A mini ServiceNow-style ITSM app: employees raise tickets, IT agents work
them through a status workflow, and every change is logged in an activity
feed — just like a real ServiceNow incident record.

**No installs. No server. No database.** Everything runs in the browser
using `localStorage` for persistence. Just open a file and go.

## How to run it

### Option A — just double-click it
Double-click `index.html`. It opens in your default browser and works
immediately.

### Option B — VS Code Live Server (recommended, still zero installs beyond a free extension)
1. Open the `helpdesk-lite` folder in VS Code.
2. Install the **Live Server** extension (search it in the Extensions panel — one click, no runtime to install).
3. Right-click `index.html` → **Open with Live Server**.

Either way works the same — Live Server just gives you auto-refresh while editing.

## Try it in 5 seconds

On the login screen, click **"⚡ Load demo data instead"**. This seeds:
- **Admin** — `admin@demo.com` / `admin123`
- **Agent** — `agent@demo.com` / `agent123`
- **Employee** — `employee@demo.com` / `employee123`
- 6 sample tickets across every status and priority, with comments and an activity history already in place.

Or skip the demo data and click **"Create one"** to register your own account —
**the very first person to register automatically becomes Admin.**

## Features

- **Auth** — Register / Login (accounts stored in `localStorage`)
- **3 roles**
  - **Employee** — raises tickets, tracks their own requests
  - **Agent** — works the shared queue, updates status/priority, assigns tickets, adds work notes
  - **Admin** — everything Agent can do, plus manages user roles
- **Ticket workflow** — `New → Assigned → In Progress → On Hold → Resolved → Closed` (or `Reopened`)
- **Ticket numbers** — auto-generated like `INC0001`, `INC0002`, ServiceNow-style
- **Activity feed** — comments + an automatic audit trail (status/priority/assignment changes), merged into one timeline
- **Internal work notes** — agents can leave notes hidden from the requester
- **Dashboards** — role-aware stat cards (Open, Resolved, Closed, Unassigned) and recent activity
- **Filters** — ticket queue filterable by status and by "assigned to me / unassigned"

## Project structure

```
helpdesk-lite/
├── index.html        # single page — the whole app renders into this
├── css/
│   └── style.css      # all visual styling
├── js/
│   └── app.js          # data layer (localStorage), router, every page's HTML + logic
└── README.md
```

It's a single-page app: `app.js` reads the URL hash (`#/dashboard`,
`#/ticket?id=3`, etc.), renders the right screen into `#root`, and every
button/form calls a plain JS function — no framework, no build step, no
`npm install`.

## Where your data lives

Everything is saved to your browser's `localStorage` under the key
`sd_db_v1` (plus a small session key). That means:
- Your data persists across page reloads and browser restarts, on that machine/browser.
- It does **not** sync between different browsers or devices — this is a local, single-user-per-browser demo, not a real multi-user backend.
- To wipe all data and start fresh, open DevTools (F12) → Application/Storage tab → clear `localStorage` for the page, or just run `localStorage.clear()` in the browser console.

## A note on "security"

Passwords are stored in plain text in `localStorage` for this demo — there's
no server to hash them against. This is fine for a mini project/demo, but
don't reuse a real password when testing it, and don't treat this as a
template for a production login system.

## Adapting the theme

Ticket `category` already includes **Leave Request** and **Complaint**
alongside Hardware/Software/Network/Access — if your assignment specifically
wants a Leave Management or Complaint System, the workflow underneath
already supports it. You'd just retheme labels like "Ticket" → "Request" in
`app.js`'s render functions.
