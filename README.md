# Expense Tracker (Node.js + JSON storage)

This is the corrected version of the Expense Tracker:
- Backend: **Node.js (Express)** — Python/Flask removed.
- Storage: **local JSON file** (`backend/data/db.json`) — MongoDB removed.
- Frontend: unchanged (`index.html`, `style.css`, `script.js`).

## Folder structure

```
expense-tracker/
├── backend/
│   ├── server.js        -> Express server (all API routes)
│   ├── db.js             -> JSON file read/write helper
│   ├── package.json
│   └── data/
│       └── db.json       -> auto-created on first run (users + transactions)
└── frontend/
    ├── index.html
    ├── style.css
    └── script.js
```

## Requirements

- Node.js v18+ (includes npm)

## How to run

1. Open a terminal and go to the backend folder:
   ```
   cd expense-tracker/backend
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
   You should see: `Expense Tracker backend running at http://localhost:5000`

4. Open the website:
   - Open the file `expense-tracker/frontend/index.html` directly in your browser (double-click it, or right-click → Open with browser).
   - OR serve it with a simple static server, e.g. from the `frontend` folder:
     ```
     cd ../frontend
     python3 -m http.server 5500
     ```
     then visit `http://localhost:5500` in your browser.

   The frontend talks to the backend at `http://localhost:5000/api`, so make sure the backend (step 3) is running first.

## Notes

- All data (users + transactions) is stored in `backend/data/db.json`. Delete this file any time to reset the app.
- Passwords are hashed with bcrypt before being saved.
- No database server (Mongo or otherwise) needs to be installed or running.
