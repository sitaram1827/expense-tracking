const $ = (id) => document.getElementById(id);
const API = "https://expense-tracking-9ahv.onrender.com/api";
const fmt = (n) => `Rs ${Number(n).toFixed(2)}`;
const getUser = () => localStorage.getItem("user");
const setUser = (email) => localStorage.setItem("user", email);
const clearUser = () => localStorage.removeItem("user");

// Render free tier can sleep after idle time, so keep a single warm-up ping
// instead of retrying in a loop.
(async function warmUp() {
  if (!document.body) return;
  const banner = document.createElement("div");
  banner.id = "wakeupBanner";
  banner.textContent = "Connecting to server...";
  Object.assign(banner.style, {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    zIndex: "9999",
    background: "#f59e0b",
    color: "#fff",
    textAlign: "center",
    padding: "10px",
    fontWeight: "700",
    fontSize: "14px",
  });
  document.body.prepend(banner);

  try {
    await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "__ping__", password: "__ping__" }),
    });
    banner.textContent = "Server connected";
    banner.style.background = "#10b981";
    setTimeout(() => banner.remove(), 1500);
  } catch (_) {
    banner.textContent = "Server connection failed";
    banner.style.background = "#ef4444";
  }
})();

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error");
  return data;
}

let user = null;
let isAdmin = false;
let txs = [];
let page = "add-tx";

const pages = Array.from(document.querySelectorAll(".page"));
const navBtns = Array.from(document.querySelectorAll(".nav-btn"));
const overviewStrip = $("overviewStrip");
const loginForm = $("loginForm");
const regForm = $("registerForm");
const logoutBtn = $("logoutBtn");
const loginBtn = $("loginBtn");
const loginTab = $("loginTab");
const regTab = $("registerTab");
const loginPane = $("loginPane");
const regPane = $("registerPane");
const txForm = $("transactionForm");
const cancelBtn = $("cancelBtn");
const adminBtn = $("adminBtn");

const getBudgetKey = (email) => `budget:${email}`;
const getBudget = (email) => {
  const value = Number(localStorage.getItem(getBudgetKey(email)));
  return Number.isFinite(value) && value > 0 ? value : 0;
};
const setBudget = (email, amount) => localStorage.setItem(getBudgetKey(email), String(amount));

function getTotals() {
  let inc = 0;
  let exp = 0;
  txs.forEach((tx) => {
    if (tx.type === "income") inc += Number(tx.amount) || 0;
    else exp += Number(tx.amount) || 0;
  });
  return { inc, exp, bal: inc - exp };
}

function setPage(nextPage) {
  let target = nextPage === "dashboard" ? "add-tx" : nextPage;
  if (target === "admin" && !isAdmin) target = "add-tx";
  page = target;

  pages.forEach((el) => {
    const isActive = el.id === `page-${target}`;
    el.classList.toggle("active", isActive);
    el.classList.toggle("hidden", !isActive);
  });

  navBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === target);
  });

  if (target === "admin" && isAdmin) renderAdmin();
}

function syncRoleViews() {
  if (overviewStrip) overviewStrip.classList.toggle("hidden", !isAdmin);

  navBtns.forEach((btn) => {
    const role = btn.dataset.role || "all";
    const visible = role === "all" || (role === "admin" && isAdmin);
    btn.classList.toggle("hidden", !visible);
  });

  if (!isAdmin && page === "admin") {
    setPage("add-tx");
  }
}

navBtns.forEach((btn) => btn.addEventListener("click", () => setPage(btn.dataset.page)));

function setAuthTab(tabName) {
  const isLogin = tabName === "login";
  loginPane.classList.toggle("active", isLogin);
  regPane.classList.toggle("active", !isLogin);
  loginTab.classList.toggle("active", isLogin);
  regTab.classList.toggle("active", !isLogin);
  $("authMessage").textContent = "";
}

if (loginTab) loginTab.addEventListener("click", () => setAuthTab("login"));
if (regTab) regTab.addEventListener("click", () => setAuthTab("register"));

async function loadDash() {
  const email = getUser();
  if (!email) return;

  try {
    const res = await api(`/me?email=${encodeURIComponent(email)}`);
    user = res;
    isAdmin = !!res.is_admin;
    txs = res.transactions || [];

    $("userChip").textContent = res.user.email;
    $("authContainer").classList.add("hidden");
    $("dashboardContainer").classList.remove("hidden");

    syncRoleViews();
    renderAll();
  } catch (error) {
    clearUser();
    user = null;
    isAdmin = false;
    txs = [];
    $("dashboardContainer").classList.add("hidden");
    $("authContainer").classList.remove("hidden");
  }
}

async function doLogin() {
  const btn = $("loginBtn");
  btn.disabled = true;
  btn.textContent = "Logging in...";

  try {
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    const res = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(res.user.email);
    await loadDash();
    setPage("add-tx");
  } catch (error) {
    $("authMessage").textContent = error.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Login";
  }
}

if (loginForm) loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await doLogin();
});
if (loginBtn) loginBtn.addEventListener("click", doLogin);

if (regForm) {
  regForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = regForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Registering...";

    try {
      const name = $("registerName").value.trim();
      const email = $("registerEmail").value.trim();
      const password = $("registerPassword").value;
      const role = $("registerRole").value;

      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, is_admin: role === "admin" }),
      });

      $("authMessage").textContent = "Registered. Please log in.";
      regForm.reset();
      $("registerRole").value = "user";
      setAuthTab("login");
    } catch (error) {
      $("authMessage").textContent = error.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register";
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearUser();
    user = null;
    isAdmin = false;
    txs = [];
    $("authContainer").classList.remove("hidden");
    $("dashboardContainer").classList.add("hidden");
    loginForm.reset();
    if (regForm) regForm.reset();
    setAuthTab("login");
    setPage("add-tx");
    syncRoleViews();
  });
}

function renderAll() {
  renderDash();
  renderHistory();
  renderVisual();
  renderBudget();
  if (isAdmin && page === "admin") renderAdmin();
}

function renderDash() {
  const { inc, exp, bal } = getTotals();
  const categories = [...new Set(txs.map((tx) => tx.category).filter(Boolean))];
  let topCategory = "-";

  if (categories.length > 0) {
    topCategory = categories.reduce((best, current) => {
      const currentExpense = txs.filter((tx) => tx.category === current && tx.type === "expense").reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
      const bestExpense = txs.filter((tx) => tx.category === best && tx.type === "expense").reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
      return currentExpense > bestExpense ? current : best;
    }, categories[0]);
  }

  $("totalIncome").textContent = fmt(inc);
  $("totalExpense").textContent = fmt(exp);
  $("balance").textContent = fmt(bal);
  $("topExpenseCategory").textContent = topCategory;
}

function renderHistory() {
  const tbody = $("historyTable");
  if (!tbody) return;

  tbody.innerHTML = "";
  let runningBalance = 0;

  txs.forEach((tx) => {
    runningBalance += tx.type === "income" ? (Number(tx.amount) || 0) : -(Number(tx.amount) || 0);
    const fragment = $("txRow").content.cloneNode(true);
    const cells = fragment.querySelectorAll("td");
    const values = [tx.date, tx.desc, tx.category, tx.type, fmt(tx.amount), fmt(runningBalance)];
    const labels = ["Date", "Description", "Category", "Type", "Amount", "Balance"];

    cells.forEach((cell, index) => {
      if (index < values.length) {
        cell.textContent = values[index];
        cell.dataset.label = labels[index];
      }
    });

    const actionCell = fragment.querySelector(".edit-btn").parentElement;
    actionCell.dataset.label = "Action";
    fragment.querySelector(".edit-btn").addEventListener("click", () => editTx(tx.id));
    fragment.querySelector(".del-btn").addEventListener("click", () => delTx(tx.id));
    tbody.appendChild(fragment);
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

  const cx = 150;
  const cy = 150;
  const r = 84;
  let angle = -Math.PI / 2;
  const incAngle = (inc / total) * 2 * Math.PI;

  ctx.fillStyle = "#14b8a6";
  ctx.beginPath();
  ctx.arc(cx, cy, r, angle, angle + incAngle);
  ctx.lineTo(cx, cy);
  ctx.fill();

  angle += incAngle;
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.arc(cx, cy, r, angle, angle + (2 * Math.PI - incAngle));
  ctx.lineTo(cx, cy);
  ctx.fill();
}

function renderBudget() {
  const email = getUser();
  if (!email) return;

  const budget = getBudget(email);
  const spent = txs.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const remaining = budget - spent;

  $("budgetAmount").textContent = fmt(budget);
  $("budgetSpent").textContent = fmt(spent);
  $("budgetRemaining").textContent = fmt(Math.max(remaining, 0));

  if (budget > 0) {
    $("progressFill").style.width = `${Math.min((spent / budget) * 100, 100)}%`;
  } else {
    $("progressFill").style.width = "0%";
  }
}

async function renderAdmin() {
  if (!isAdmin) return;

  const tbody = $("adminUsersTable");
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b">Loading...</td></tr>';
  }

  try {
    const res = await api(`/admin/overview?email=${encodeURIComponent(getUser())}`);
    $("adminUsers").textContent = res.summary.total_users || 0;
    $("adminTx").textContent = res.summary.total_transactions || 0;
    $("adminIncome").textContent = fmt(res.summary.total_income || 0);
    $("adminExpense").textContent = fmt(res.summary.total_expense || 0);

    if (!tbody) return;
    tbody.innerHTML = "";

    const users = res.users || [];
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b">No users found.</td></tr>';
      return;
    }

    users.forEach((u) => {
      const isSelf = u.email === getUser();
      const canAct = !isSelf && !u.is_admin;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="Name">${u.name || "-"}</td>
        <td data-label="Email">${u.email || "-"}</td>
        <td data-label="Tx">${u.transaction_count || 0}</td>
        <td data-label="Income">${fmt(u.total_income || 0)}</td>
        <td data-label="Expense">${fmt(u.total_expense || 0)}</td>
        <td data-label="Balance">${fmt(u.balance || 0)}</td>
        <td data-label="Action">
          <button class="edit-btn make-admin-btn" type="button" ${canAct ? "" : "disabled"}>Make Admin</button>
          <button class="del-btn delete-user-btn" type="button" ${canAct ? "" : "disabled"}>Delete</button>
        </td>
      `;

      if (canAct) {
        tr.querySelector(".make-admin-btn").addEventListener("click", async () => {
          if (!confirm(`Promote ${u.email} to admin?`)) return;
          try {
            await api(`/admin/users/${encodeURIComponent(u.email)}/promote?email=${encodeURIComponent(getUser())}`, { method: "POST" });
            await renderAdmin();
          } catch (error) {
            alert(`Promote failed: ${error.message}`);
          }
        });

        tr.querySelector(".delete-user-btn").addEventListener("click", async () => {
          if (!confirm(`Delete user ${u.email} and all their data?`)) return;
          try {
            await api(`/admin/users/${encodeURIComponent(u.email)}?email=${encodeURIComponent(getUser())}`, { method: "DELETE" });
            await renderAdmin();
          } catch (error) {
            alert(`Delete failed: ${error.message}`);
          }
        });
      }

      tbody.appendChild(tr);
    });
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ef4444">Failed to load: ${error.message}. <a href="#" onclick="renderAdmin();return false;">Retry</a></td></tr>`;
    }
  }
}

if (txForm) {
  txForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = getUser();
    if (!email) return;

    const submitBtn = $("submitBtn");
    submitBtn.disabled = true;

    try {
      const desc = $("description").value.trim();
      const amount = parseFloat($("amount").value);
      const category = $("category").value.trim();
      const type = $("type").value;
      const date = $("date").value;
      const txId = txForm.dataset.txId;

      if (txId) {
        await api(`/transactions/${encodeURIComponent(txId)}`, {
          method: "PUT",
          body: JSON.stringify({ email, desc, amount, category, type, date }),
        });
      } else {
        await api("/transactions", {
          method: "POST",
          body: JSON.stringify({ email, desc, amount, category, type, date }),
        });
      }

      txForm.reset();
      delete txForm.dataset.txId;
      $("submitBtn").textContent = "Add";
      if (cancelBtn) cancelBtn.classList.add("hidden");
      await loadDash();
      setPage("history");
    } catch (error) {
      alert(error.message);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

if (cancelBtn) {
  cancelBtn.addEventListener("click", () => {
    txForm.reset();
    delete txForm.dataset.txId;
    $("submitBtn").textContent = "Add";
    cancelBtn.classList.add("hidden");
    setPage("history");
  });
}

function editTx(id) {
  const tx = txs.find((item) => item.id === id);
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
  const email = getUser();
  if (!email) return;

  try {
    await api(`/transactions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Email: email },
    });
    await loadDash();
  } catch (error) {
    alert(error.message);
  }
}

if ($("saveBudgetBtn")) {
  $("saveBudgetBtn").addEventListener("click", () => {
    const email = getUser();
    if (!email) return;
    const amount = Number($("budgetInput").value);
    if (!Number.isFinite(amount) || amount < 0) return;
    setBudget(email, amount);
    $("budgetMsg").textContent = "Budget saved.";
    renderBudget();
  });
}

if ($("exportCsv")) {
  $("exportCsv").addEventListener("click", () => {
    if (txs.length === 0) {
      alert("No data");
      return;
    }

    const csv = [["Date", "Desc", "Category", "Type", "Amount"], ...txs.map((tx) => [tx.date, tx.desc, tx.category, tx.type, tx.amount])]
      .map((row) => row.join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
  });
}

setPage(page);
if (getUser()) loadDash();
