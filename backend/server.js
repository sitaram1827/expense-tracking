const $ = id => document.getElementById(id);
const API = "https://expense-tracking-9ahv.onrender.com/api";
const fmt = n => `Rs ${Number(n).toFixed(2)}`;
const getUser = () => localStorage.getItem("user");
const setUser = e => localStorage.setItem("user", e);
const clearUser = () => localStorage.removeItem("user");

// ── server wake-up banner ───────────────────────────────────────────────────
// Render free tier sleeps after 15 min idle; first request takes ~30 s.
// We ping /api/auth/login with a dummy body, ignore the 401, and show a
// "Connecting…" banner so users know the site isn't broken.
(async function warmUp() {
  const banner = document.createElement("div");
  banner.id = "wakeupBanner";
  banner.textContent = "⏳ Connecting to server… (first load may take ~30s)";
  Object.assign(banner.style, {
    position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
    background: "#f59e0b", color: "#fff", textAlign: "center",
    padding: "10px", fontWeight: "bold", fontSize: "14px"
  });
  document.body.prepend(banner);

  const start = Date.now();
  let ok = false;
  while (!ok && Date.now() - start < 60000) {
    try {
      await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "__ping__", password: "__ping__" })
      });
      ok = true;
    } catch (_) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  if (ok) {
    banner.textContent = "✅ Server connected!";
    banner.style.background = "#11a36a";
    setTimeout(() => banner.remove(), 2000);
  } else {
    banner.textContent = "❌ Could not reach server. Please refresh.";
    banner.style.background = "#ef4444";
  }
})();

// ── fetch wrapper ───────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error");
  return data;
}

// ── state ───────────────────────────────────────────────────────────────────
let user = null, page = "dashboard", isAdmin = false, txs = [];
const pages = Array.from(document.querySelectorAll(".page"));
const navBtns = Array.from(document.querySelectorAll(".nav-btn"));

function setPage(p) {
  page = p;
  pages.forEach(el => {
    el.classList.toggle("active", el.id === `page-${p}`);
    el.classList.toggle("hidden", el.id !== `page-${p}`);
  });
  navBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.page === p));
  if (p === "admin" && !isAdmin) { setPage("dashboard"); return; }
  // FIX: refresh admin data every time the admin tab is opened
  if (p === "admin" && isAdmin) renderAdmin();
}

// ── budget helpers ──────────────────────────────────────────────────────────
const getBudgetKey = e => `budget:${e}`;
const getBudget = e => { const v = Number(localStorage.getItem(getBudgetKey(e))); return Number.isFinite(v) && v > 0 ? v : 0; };
const setBudget = (e, a) => localStorage.setItem(getBudgetKey(e), String(a));

function getTotals() {
  let inc = 0, exp = 0;
  txs.forEach(tx => { if (tx.type === "income") inc += tx.amount; else exp += tx.amount; });
  return { inc, exp, bal: inc - exp };
}

// ── nav ─────────────────────────────────────────────────────────────────────
navBtns.forEach(btn => btn.addEventListener("click", () => setPage(btn.dataset.page)));

// ── auth ─────────────────────────────────────────────────────────────────────
const loginForm = $("loginForm"), regForm = $("registerForm"), logoutBtn = $("logoutBtn");
const loginBtn = $("loginBtn"), loginTab = $("loginTab"), regTab = $("registerTab");
const loginPane = $("loginPane"), regPane = $("registerPane");

function setAuthTab(t) {
  const isLog = t === "login";
  loginPane.classList.toggle("active", isLog);
  regPane.classList.toggle("active", !isLog);
  loginTab.classList.toggle("active", isLog);
  regTab.classList.toggle("active", !isLog);
  $("authMessage").textContent = "";
}
if (loginTab) loginTab.addEventListener("click", () => setAuthTab("login"));
if (regTab) regTab.addEventListener("click", () => setAuthTab("register"));

async function doLogin() {
  const btn = $("loginBtn");
  btn.disabled = true; btn.textContent = "Logging in…";
  try {
    const em = $("loginEmail").value.trim(), p = $("loginPassword").value;
    const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: em, password: p }) });
    setUser(res.user.email);
    await loadDash();
    setPage("dashboard");
  } catch (e) {
    $("authMessage").textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = "Login";
  }
}
if (regForm) {
  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sbtn = regForm.querySelector("button[type=submit]");
    sbtn.disabled = true; sbtn.textContent = "Registering…";
    try {
      const n = $("registerName").value.trim(), em = $("registerEmail").value.trim(), p = $("registerPassword").value;
      await api("/auth/register", { method: "POST", body: JSON.stringify({ name: n, email: em, password: p, is_admin: false }) });
      $("authMessage").textContent = "Registered! Login now.";
      regForm.reset();
      setAuthTab("login");
    } catch (e) {
      $("authMessage").textContent = e.message;
    } finally {
      sbtn.disabled = false; sbtn.textContent = "Register";
    }
  });
}
if (loginForm) loginForm.addEventListener("submit", async (e) => { e.preventDefault(); await doLogin(); });
if (loginBtn) loginBtn.addEventListener("click", doLogin);

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearUser(); user = null; isAdmin = false; txs = [];
    $("authContainer").classList.remove("hidden");
    $("dashboardContainer").classList.add("hidden");
    loginForm.reset();
    setAuthTab("login");
  });
}

// ── load dashboard data ─────────────────────────────────────────────────────
async function loadDash() {
  const em = getUser();
  if (!em) return;
  try {
    const res = await api(`/me?email=${encodeURIComponent(em)}`);
    user = res;
    isAdmin = res.is_admin;
    txs = res.transactions || [];
    $("userChip").textContent = res.user.email;
    $("authContainer").classList.add("hidden");
    $("dashboardContainer").classList.remove("hidden");
    $("adminBtn").classList.toggle("hidden", !isAdmin);
    render();
  } catch (e) {
    clearUser();
    $("dashboardContainer").classList.add("hidden");
    $("authContainer").classList.remove("hidden");
  }
}

// ── render ──────────────────────────────────────────────────────────────────
async function render() {
  renderDash();
  renderHistory();
  renderVisual();
  renderBudget();
  // FIX: await renderAdmin so it actually completes before returning
  if (isAdmin) await renderAdmin();
}

function renderDash() {
  const { inc, exp, bal } = getTotals();
  const cats = [...new Set(txs.map(t => t.category))];
  let topCat = "-";
  if (cats.length > 0) {
    topCat = cats.reduce((max, c) => {
      const sum = txs.filter(t => t.category === c && t.type === "expense").reduce((s, t) => s + t.amount, 0);
      return sum > txs.filter(t => t.category === max && t.type === "expense").reduce((s, t) => s + t.amount, 0) ? c : max;
    });
  }
  $("totalIncome").textContent = fmt(inc);
  $("totalExpense").textContent = fmt(exp);
  $("balance").textContent = fmt(bal);
  $("topExpenseCategory").textContent = topCat;
}

function renderHistory() {
  const tbody = $("historyTable");
  if (!tbody) return;
  tbody.innerHTML = "";
  let runningBalance = 0;
  txs.forEach(tx => {
    runningBalance += tx.type === "income" ? tx.amount : -tx.amount;
    const tr = $("txRow").content.cloneNode(true);
    tr.querySelector(".tx-date").textContent = tx.date;
    tr.querySelector(".tx-desc").textContent = tx.desc;
    tr.querySelector(".tx-cat").textContent = tx.category;
    tr.querySelector(".tx-type").textContent = tx.type;
    tr.querySelector(".tx-amt").textContent = fmt(tx.amount);
    tr.querySelector(".tx-bal").textContent = fmt(runningBalance);
    tr.querySelector(".edit-btn").onclick = () => editTx(tx.id);
    tr.querySelector(".del-btn").onclick = () => delTx(tx.id);
    tbody.appendChild(tr);
  });
  $("emptyMsg").classList.toggle("hidden", txs.length > 0);
}

function renderVisual() {
  const { inc, exp } = getTotals();
  $("visualIncome").textContent = fmt(inc);
  $("visualExpense").textContent = fmt(exp);
  const canvas = $("donutChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const total = inc + exp;
  ctx.clearRect(0, 0, 300, 300);
  if (total === 0) return;
  const cx = 150, cy = 150, r = 80;
  let angle = -Math.PI / 2;
  const incA = (inc / total) * 2 * Math.PI;
  ctx.fillStyle = "#11a36a";
  ctx.beginPath(); ctx.arc(cx, cy, r, angle, angle + incA); ctx.lineTo(cx, cy); ctx.fill();
  angle += incA;
  ctx.fillStyle = "#ff5470";
  ctx.beginPath(); ctx.arc(cx, cy, r, angle, angle + (2 * Math.PI - incA)); ctx.lineTo(cx, cy); ctx.fill();
}

function renderBudget() {
  const em = getUser();
  if (!em) return;
  const bud = getBudget(em);
  const spent = txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const rem = bud - spent;
  $("budgetAmount").textContent = fmt(bud);
  $("budgetSpent").textContent = fmt(spent);
  $("budgetRemaining").textContent = fmt(Math.max(rem, 0));
  if (bud > 0) $("progressFill").style.width = Math.min((spent / bud) * 100, 100) + "%";
}

// ── admin ────────────────────────────────────────────────────────────────────
async function renderAdmin() {
  $("adminBtn").classList.remove("hidden");
  const tbody = $("adminUsersTable");
  // FIX: show a loading row so the user knows a request is in-flight
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#888">Loading…</td></tr>`;
  }
  try {
    const res = await api(`/admin/overview?email=${encodeURIComponent(getUser())}`);
    $("adminUsers").textContent = res.summary.total_users || 0;
    $("adminTx").textContent = res.summary.total_transactions || 0;
    $("adminIncome").textContent = fmt(res.summary.total_income || 0);
    $("adminExpense").textContent = fmt(res.summary.total_expense || 0);

    if (tbody) {
      tbody.innerHTML = "";
      const usersList = res.users || [];
      if (usersList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#888">No users found.</td></tr>`;
        return;
      }
      usersList.forEach(u => {
        const isSelf = (u.email === getUser());
        const isAdminUser = !!u.is_admin;
        // FIX: only disable buttons for self or existing admins (not regular users)
        const canAct = !isSelf && !isAdminUser;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${u.name || "-"}</td>
          <td>${u.email || "-"}</td>
          <td>${u.transaction_count || 0}</td>
          <td>${fmt(u.total_income || 0)}</td>
          <td>${fmt(u.total_expense || 0)}</td>
          <td>${fmt(u.balance || 0)}</td>
          <td>
            <button class="edit-btn make-admin-btn" ${canAct ? "" : "disabled"}>Make Admin</button>
            <button class="del-btn delete-user-btn" ${canAct ? "" : "disabled"}>Delete</button>
          </td>`;

        // FIX: attach listeners directly, only when button is not disabled
        if (canAct) {
          tr.querySelector(".make-admin-btn").addEventListener("click", async () => {
            if (!confirm(`Promote ${u.email} to admin?`)) return;
            try {
              await api(`/admin/users/${encodeURIComponent(u.email)}/promote?email=${encodeURIComponent(getUser())}`, { method: "POST" });
              await renderAdmin();
            } catch (e) { alert("Promote failed: " + e.message); }
          });

          // FIX: was only running when `!deleteDisabled` (empty string = falsy) — now always runs for canAct users
          tr.querySelector(".delete-user-btn").addEventListener("click", async () => {
            if (!confirm(`Delete user ${u.email} and all their data?`)) return;
            try {
              await api(`/admin/users/${encodeURIComponent(u.email)}?email=${encodeURIComponent(getUser())}`, { method: "DELETE" });
              await renderAdmin();
            } catch (e) { alert("Delete failed: " + e.message); }
          });
        }
        tbody.appendChild(tr);
      });
    }
  } catch (e) {
    // FIX: show error in table instead of silent console.error
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ef4444">Failed to load: ${e.message}. <a href="#" onclick="renderAdmin();return false;">Retry</a></td></tr>`;
    console.error("Admin load error", e);
  }
}

// ── transactions ─────────────────────────────────────────────────────────────
const txForm = $("transactionForm");
if (txForm) {
  txForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const em = getUser();
    if (!em) return;
    const sbtn = $("submitBtn");
    sbtn.disabled = true;
    try {
      const d = $("description").value, a = parseFloat($("amount").value);
      const c = $("category").value, t = $("type").value, dt = $("date").value;
      const id = txForm.dataset.txId;
      if (id) {
        await api(`/transactions/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ email: em, desc: d, amount: a, category: c, type: t, date: dt }) });
      } else {
        await api("/transactions", { method: "POST", body: JSON.stringify({ email: em, desc: d, amount: a, category: c, type: t, date: dt }) });
      }
      txForm.reset();
      delete txForm.dataset.txId;
      sbtn.textContent = "Add";
      await loadDash();
      setPage("dashboard");
    } catch (e) { alert(e.message); }
    finally { sbtn.disabled = false; }
  });
}

const cancelBtn = $("cancelBtn");
if (cancelBtn) {
  cancelBtn.addEventListener("click", () => {
    txForm.reset();
    delete txForm.dataset.txId;
    $("submitBtn").textContent = "Add";
    cancelBtn.classList.add("hidden");
    setPage("dashboard");
  });
}

function editTx(id) {
  const tx = txs.find(t => t.id === id);
  if (!tx) return;
  $("description").value = tx.desc;
  $("amount").value = tx.amount;
  $("category").value = tx.category;
  $("type").value = tx.type;
  $("date").value = tx.date;
  txForm.dataset.txId = id;
  $("submitBtn").textContent = "Update";
  if (cancelBtn) cancelBtn.classList.remove("hidden");
  setPage("add-tx");
}

async function delTx(id) {
  if (!confirm("Delete this transaction?")) return;
  const em = getUser();
  if (!em) return;
  try {
    await api(`/transactions/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "Email": em } });
    await loadDash();
  } catch (e) { alert(e.message); }
}

// ── budget ───────────────────────────────────────────────────────────────────
if ($("saveBudgetBtn")) {
  $("saveBudgetBtn").addEventListener("click", () => {
    const em = getUser();
    if (!em) return;
    const a = Number($("budgetInput").value);
    if (!Number.isFinite(a) || a < 0) return;
    setBudget(em, a);
    $("budgetMsg").textContent = "Budget saved!";
    renderBudget();
  });
}

// ── CSV export ────────────────────────────────────────────────────────────────
if ($("exportCsv")) {
  $("exportCsv").addEventListener("click", () => {
    if (txs.length === 0) { alert("No data"); return; }
    const csv = [["Date", "Desc", "Category", "Type", "Amount"], ...txs.map(t => [t.date, t.desc, t.category, t.type, t.amount])].map(r => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "transactions.csv"; a.click();
    URL.revokeObjectURL(url);
  });
}

// ── init ──────────────────────────────────────────────────────────────────────
if (getUser()) loadDash();
