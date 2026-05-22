# ✉ mail-man

**Lightweight Postman alternative for your terminal.**  
Store, organise, and fire HTTP requests from the CLI — with environment variables, auth helpers, per-request history, a browser response viewer, and a visual dashboard.

---

## Install

```bash
cd ~/Developer/mail-man
bash install.sh
```

The installer checks for Node ≥ 16, runs `npm install`, sets permissions, and runs `npm link` so `mm` is available everywhere.

Or manually:

```bash
npm install
chmod +x bin/mm
npm link
```

---

## Quick Start

```bash
# 1. Create an environment
mm env new dev
mm env set dev BASE_URL https://api.yourapp.com
mm env set dev TOKEN your-jwt-here
mm env use dev

# 2. Add a request  (collection is created automatically)
mm add my-api/get-users
#  ↳ walks you through: method · URL · headers · body · auth · description

# 3. See everything you have
mm ls

# 4. Fire it
mm hit my-api/get-users

# 5. View the response in Chrome
mm beautify my-api/get-users

# 6. Open the visual dashboard
mm start
```

---

## Commands

All requests are addressed as `collection/request` — a single path, one slash.

### `mm ls`
List every collection and request as a tree.

```
  my-api  (3 requests)
  ├── GET     get-users        Fetch all users
  ├── POST    create-user
  └── DELETE  delete-user      Remove a user

  payments  (2 requests)
  ├── POST    charge            Charge a card
  └── POST    refund

  2 collections · 5 requests
```

---

### `mm add <col/req>`
Add a new request or edit an existing one.  
Creates the collection automatically if it doesn't exist.  
If the request already exists, its current values are loaded as defaults (edit mode).

```bash
mm add my-api/get-users      # new request
mm add my-api/get-users      # edit it — re-prompts with current values
```

Interactive prompts:
1. HTTP method (GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS)
2. URL — supports `{{VARIABLE}}` tokens
3. Headers — key/value pairs, loop until done
4. Body — opens `$EDITOR` (JSON or raw)
5. Auth — None / Bearer Token / Basic Auth / API Key
6. Description (optional)

---

### `mm hit <col/req>`
Execute a saved request.

```bash
mm hit my-api/get-users
mm hit payments/charge
```

- Resolves `{{VARIABLE}}` from the active environment before sending
- Warns about any unresolved placeholders
- Prints colour-coded status, headers, and syntax-highlighted JSON
- Saves full snapshot to global history and per-request history

---

### `mm remove <col/req>` · `mm remove <col>`
Delete a single request or an entire collection (asks for confirmation).

```bash
mm remove my-api/get-users   # remove one request
mm remove my-api             # remove entire collection + all its requests
```

---

### `mm beautify [col/req]`
Open the last response in a Chrome tab — VS Code dark theme, collapsible JSON tree, copy button.

```bash
mm beautify                      # last response from any request
mm beautify my-api/get-users     # last response for this specific request
mm beautify /tmp/output.json     # any JSON file on disk
```

The viewer spins up a local HTTP server and auto-closes it after 5 minutes.

---

### `mm history [col/req]`
```bash
mm history                       # global table — last 50 across all requests
mm history my-api/get-users      # full per-request history (up to 50 stored)
mm history clear                 # wipe global history
```

**Global view** — summary table:
```
  Request History  (last 50)

  Time                 Method   Status  ms      Path                  URL
  ─────────────────────────────────────────────────────────────────────────
  22/05/26 14:32:01   GET       200     142ms   my-api/get-users      https://…
  22/05/26 14:30:55   POST      201     89ms    my-api/create-user    https://…
```

**Per-request view** — full detail per hit (request headers, response preview):
```
  History: my-api/get-users  (3 of 50 stored)

  #01  22/05/26 14:32:01  GET  200  142ms
       https://api.yourapp.com/users
       req headers: Authorization: Bearer eyJ…  ·  Content-Type: application/json
       response:    [{"id":1,"name":"Alice"},{"id":2,"name":"Bob"},…
```

Each request stores its own `.history.jsonl` file, capped at **50 entries** (newest first).

---

### `mm start` · `mm stop`
Start (or stop) the visual dashboard server.

```bash
mm start    # spawns background server, opens Chrome automatically
mm stop     # sends SIGTERM, cleans up PID file
```

The dashboard runs at `http://127.0.0.1:<port>` and provides:
- **Collections sidebar** — all collections and requests, live-refreshed every 5 s
- **Request panel** — method, URL, headers, body, auth at a glance
- **▶ Run button** — fires the request, updates the response panel in-place
- **Response panel** — status badge, duration, collapsible JSON tree, copy button
- **History strip** — last 30 requests scrollable at the bottom
- **Env switcher** — dropdown to change the active environment without leaving the browser
- **■ Stop button** — shuts down the server from inside the dashboard

The server PID and port are saved to `data/.mm-server.pid`.  
If already running, `mm start` just re-opens the tab.

---

### `mm import <file>`
Import a **Postman v2 / v2.1** collection JSON file.

```bash
mm import MyAPI.postman_collection.json
```

- Reads the Postman collection name as the mm collection name
- Converts each request — method, URL, headers, body (raw JSON / urlencoded / formdata), auth (bearer / basic / API key)
- Nested folders are flattened with a hyphen prefix (`folder-requestname`)
- Skips items with no URL and warns you
- Merges into an existing collection of the same name if one exists

---

### `mm env`
Manage environments. Variables are substituted as `{{KEY}}` in any request field.

```bash
mm env new dev                             # create
mm env new prod
mm env ls                                  # list all  (active marked with ●)
mm env use prod                            # switch active environment
mm env set prod BASE_URL https://api.com   # set a variable
mm env set prod TOKEN eyJhbGc…
mm env show prod                           # print all variables
mm env rm prod TOKEN                       # remove one variable
mm env rm prod                             # remove entire environment
```

Use `{{VARIABLE_NAME}}` anywhere in a request:

```
URL:    {{BASE_URL}}/api/users
Header: Authorization: Bearer {{TOKEN}}
Body:   { "org": "{{ORG_ID}}" }
```

---

### `mm auth`
Shorthand helpers that write directly to the active environment.

```bash
mm auth bearer eyJhbGciOiJIUzI1…   # saves as TOKEN  → use {{TOKEN}}
mm auth basic admin s3cr3t          # saves base64    → use {{AUTH_BASIC}}
mm auth apikey X-API-Key abc-123    # saves header + key in active env
```

---

## Data Storage

Everything lives in `~/Developer/mail-man/data/` — plain JSON, fully version-control-friendly.

```
data/
├── collections/
│   └── my-api/
│       ├── get-users.json           ← request definition
│       ├── get-users.last.json      ← last response snapshot (mm beautify)
│       ├── get-users.history.jsonl  ← per-request history (50 entries, newest first)
│       └── create-user.json
├── environments/
│   ├── dev.json
│   └── prod.json
├── history.jsonl                    ← global history (summary)
├── .state.json                      ← active env + last response reference
└── .mm-server.pid                   ← dashboard server PID (while running)
```

### Request file (`*.json`)

```json
{
  "name": "get-users",
  "method": "GET",
  "url": "{{BASE_URL}}/api/users",
  "headers": { "Accept": "application/json" },
  "body": null,
  "auth": { "type": "bearer", "token": "{{TOKEN}}" },
  "description": "Fetch all users",
  "createdAt": "2026-05-22T00:00:00.000Z"
}
```

### Environment file (`*.json`)

```json
{
  "name": "dev",
  "variables": {
    "BASE_URL": "http://localhost:3000",
    "TOKEN": "eyJhbGc..."
  },
  "createdAt": "2026-05-22T00:00:00.000Z"
}
```

---

## Architecture

mail-man follows **Model-View-Controller**:

```
src/
├── models/          ← data layer, all file I/O
│   ├── db.js            path constants + ensureDirs()
│   ├── Collection.js    collection + request CRUD
│   ├── Environment.js   environment CRUD
│   ├── History.js       global + per-request history
│   └── State.js         active env + last-response persistence
│
├── views/           ← presentation layer, no I/O
│   ├── console.js       success / error / info / warn helpers
│   ├── TreeView.js      mm ls tree renderer
│   ├── ResponseView.js  colour-coded response output
│   ├── HistoryView.js   history table + per-request detail
│   └── DashboardView.js self-contained HTML for mm start
│
├── controllers/     ← business logic, orchestrates models + views
│   ├── LsController.js
│   ├── HitController.js
│   ├── RequestController.js
│   ├── RemoveController.js
│   ├── BeautifyController.js
│   ├── HistoryController.js
│   ├── EnvironmentController.js
│   ├── AuthController.js
│   ├── ServerController.js
│   └── ImportController.js
│
├── server/          ← standalone dashboard HTTP server
│   └── index.js
│
└── utils/
    ├── interpolate.js   {{VAR}} resolver
    └── pathHelper.js    parsePath("col/req")
```

---

## Tips

- `mm --help` or `mm <command> --help` for per-command usage.
- Set `DEBUG=1` to see full error stack traces.
- All data files are plain JSON — edit them directly if you need to.
- Commit `data/` to git to version-control your entire API workspace.
- `mm import` lets you migrate a Postman collection in one command.
