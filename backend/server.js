const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { readDb, writeDb } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// ---------- helpers ----------

function serTx(t) {
  return {
    id: t.id,
    desc: t.desc,
    amount: t.amount,
    category: t.category,
    type: t.type,
    date: t.date,
  };
}

function userStats(db, email) {
  const txs = db.transactions.filter((t) => t.email === email);
  const totalInc = txs.filter((t) => t.type === "income").reduce((s, t) => s + (t.amount || 0), 0);
  const totalExp = txs.filter((t) => t.type === "expense").reduce((s, t) => s + (t.amount || 0), 0);
  return {
    transaction_count: txs.length,
    total_income: totalInc,
    total_expense: totalExp,
    balance: totalInc - totalExp,
  };
}

function getUser(db, email) {
  const u = db.users.find((u) => u.email === email);
  return u || null;
}

function isAdmin(db, email) {
  const u = getUser(db, email);
  return u ? !!u.is_admin : false;
}

function publicUser(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

// ---------- auth ----------

app.post("/api/auth/register", (req, res) => {
  const { name, email, password, is_admin } = req.body || {};
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: "Invalid" });
  }
  const db = readDb();
  if (db.users.some((u) => u.email === email)) {
    return res.status(400).json({ error: "User already exists" });
  }
  const isAdminFlag = is_admin === true || is_admin === "true" || is_admin === "admin";
  db.users.push({
    name,
    email,
    password_hash: bcrypt.hashSync(password, 10),
    is_admin: isAdminFlag,
    created_at: new Date().toISOString(),
  });
  writeDb(db);
  res.json({ msg: "Registered" });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const db = readDb();
  const u = getUser(db, email);
  if (!u) return res.status(401).json({ error: "User not found" });
  if (!bcrypt.compareSync(password || "", u.password_hash || "")) {
    return res.status(401).json({ error: "Invalid" });
  }
  res.json({ user: { name: u.name, email: u.email }, is_admin: !!u.is_admin });
});

// ---------- current user / dashboard ----------

app.get("/api/me", (req, res) => {
  const email = req.query.email;
  const db = readDb();
  const u = getUser(db, email);
  if (!u) return res.status(401).json({ error: "User not found" });

  const txs = db.transactions.filter((t) => t.email === email);
  const resp = {
    user: { name: u.name, email: u.email },
    is_admin: !!u.is_admin,
    transactions: txs.map(serTx),
  };

  if (u.is_admin) {
    resp.users = db.users.map((usr) => ({
      ...publicUser(usr),
      ...userStats(db, usr.email),
    }));
  } else {
    resp.users = [];
  }
  res.json(resp);
});

// ---------- admin ----------

app.get("/api/admin/overview", (req, res) => {
  const email = req.query.email;
  const db = readDb();
  if (!isAdmin(db, email)) return res.status(403).json({ error: "Forbidden" });

  const allTxs = db.transactions;
  const totalInc = allTxs.filter((t) => t.type === "income").reduce((s, t) => s + (t.amount || 0), 0);
  const totalExp = allTxs.filter((t) => t.type === "expense").reduce((s, t) => s + (t.amount || 0), 0);

  const usersEnriched = db.users.map((usr) => ({
    ...publicUser(usr),
    ...userStats(db, usr.email),
  }));

  const recent = [...allTxs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 10).map(serTx);

  res.json({
    summary: {
      total_users: db.users.length,
      total_transactions: allTxs.length,
      total_income: totalInc,
      total_expense: totalExp,
    },
    users: usersEnriched,
    recent_transactions: recent,
  });
});

app.delete("/api/admin/users/:targetEmail", (req, res) => {
  const adminEmail = req.query.email;
  const targetEmail = req.params.targetEmail;
  const db = readDb();
  if (!isAdmin(db, adminEmail)) return res.status(403).json({ error: "Forbidden" });
  if (adminEmail === targetEmail) return res.status(400).json({ error: "Cannot delete self" });

  db.users = db.users.filter((u) => u.email !== targetEmail);
  db.transactions = db.transactions.filter((t) => t.email !== targetEmail);
  writeDb(db);
  res.json({ msg: "User deleted" });
});

app.post("/api/admin/users/:targetEmail/promote", (req, res) => {
  const adminEmail = req.query.email;
  const targetEmail = req.params.targetEmail;
  const db = readDb();
  if (!isAdmin(db, adminEmail)) return res.status(403).json({ error: "Forbidden" });

  const u = getUser(db, targetEmail);
  if (!u) return res.status(404).json({ error: "User not found" });
  if (u.is_admin) return res.json({ msg: "Already admin" });

  u.is_admin = true;
  writeDb(db);
  res.json({ msg: "Promoted" });
});

// ---------- transactions ----------

app.post("/api/transactions", (req, res) => {
  const { email, desc, amount, category, type, date } = req.body || {};
  if (!email || !desc || !amount || !category || !type || !date) {
    return res.status(400).json({ error: "Missing" });
  }
  const db = readDb();
  const u = getUser(db, email);
  if (!u) return res.status(401).json({ error: "User not found" });

  const id = uuidv4();
  db.transactions.push({
    id,
    email,
    desc,
    amount,
    category,
    type,
    date,
    created_at: new Date().toISOString(),
  });
  writeDb(db);
  res.status(201).json({ id });
});

app.put("/api/transactions/:txId", (req, res) => {
  const txId = req.params.txId;
  const data = req.body || {};
  const email = data.email;
  const db = readDb();
  const u = getUser(db, email);
  if (!u) return res.status(401).json({ error: "User not found" });

  const tx = db.transactions.find((t) => t.id === txId && t.email === email);
  if (tx) {
    Object.keys(data).forEach((k) => {
      if (k !== "email" && k !== "id") tx[k] = data[k];
    });
    writeDb(db);
  }
  res.json({ msg: "Updated" });
});

app.delete("/api/transactions/:txId", (req, res) => {
  const txId = req.params.txId;
  const email = req.headers["email"];
  const db = readDb();
  const u = getUser(db, email);
  if (!u) return res.status(401).json({ error: "User not found" });

  db.transactions = db.transactions.filter((t) => !(t.id === txId && t.email === email));
  writeDb(db);
  res.json({ msg: "Deleted" });
});

app.listen(PORT, () => {
  console.log(`Expense Tracker backend running at http://localhost:${PORT}`);
});
