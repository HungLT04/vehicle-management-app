/**
 * QUẢN LÝ XE CÁ NHÂN - APP.JS (SUPABASE INTEGRATION)
 * Full Feature Set: Auth + Vehicle + Fuel + Maintenance + Expense + Reminder + Reports + Excel + RLS + Progress Bar
 */

var AppState = {
  supabaseUrl: (localStorage.getItem("vehicle_app_supabase_url") || "https://pwwwhltnextomrkdwuol.supabase.co").replace(/\/rest\/v1\/?$/, "").replace(/\/$/, ""),
  supabaseKey: localStorage.getItem("vehicle_app_supabase_key") || "sb_publishable_rQHZv-loYxjD5xskAttiWw_QdTNQBpO",
  supabase: null,
  currentVehicleId: null,
  currentUser: null,
  users: [],
  vehicles: [],
  categories: [],
  activeTab: 'dashboard',
  chartLoaded: false
};

/* ==========================================================================
   INITIALIZATION & SUPABASE SETUP
   ========================================================================== */
document.addEventListener("DOMContentLoaded", function() {
  initSupabaseClient();
  renderLoginUserSelector();
  initApp();
});

function initSupabaseClient() {
  if (AppState.supabaseUrl && AppState.supabaseKey && typeof supabase !== "undefined") {
    try {
      var cleanUrl = AppState.supabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
      AppState.supabase = supabase.createClient(cleanUrl, AppState.supabaseKey);
    } catch (e) {
      console.error("Supabase Init Error:", e);
    }
  }
}

function openConfigModal() {
  document.getElementById("config-supabase-url").value = AppState.supabaseUrl;
  document.getElementById("config-supabase-key").value = AppState.supabaseKey;
  openModal("supabase-config-modal");
}

function saveSupabaseConfig(event) {
  event.preventDefault();
  var url = document.getElementById("config-supabase-url").value.trim();
  var key = document.getElementById("config-supabase-key").value.trim();
  localStorage.setItem("vehicle_app_supabase_url", url);
  localStorage.setItem("vehicle_app_supabase_key", key);
  AppState.supabaseUrl = url;
  AppState.supabaseKey = key;
  initSupabaseClient();
  closeModal("supabase-config-modal");
  showToast("Đã lưu cấu hình Supabase! Đang làm mới...");
  setTimeout(function() { location.reload(); }, 500);
}

/* ==========================================================================
   PROGRESS BAR & SPINNER CONTROL
   ========================================================================== */
var spinnerInterval = null;
var currentProgress = 0;

function showSpinner(show, initialPercent, statusText) {
  var sp = document.getElementById("spinner-overlay");
  if (!sp) return;

  if (!show) {
    updateSpinnerProgress(100, "Hoàn tất!");
    setTimeout(function() {
      sp.style.display = "none";
      if (spinnerInterval) { clearInterval(spinnerInterval); spinnerInterval = null; }
    }, 150);
    return;
  }

  sp.style.display = "flex";
  currentProgress = (typeof initialPercent === 'number') ? initialPercent : 15;
  updateSpinnerProgress(currentProgress, statusText || "Đang xử lý dữ liệu...");

  if (spinnerInterval) clearInterval(spinnerInterval);
  spinnerInterval = setInterval(function() {
    if (currentProgress < 90) {
      currentProgress += Math.random() * 8 + 3;
      if (currentProgress > 90) currentProgress = 90;
      updateSpinnerProgress(currentProgress);
    }
  }, 100);
}

function updateSpinnerProgress(percent, statusText) {
  var pElem = document.getElementById("spinner-percent");
  var bElem = document.getElementById("spinner-bar");
  var sElem = document.getElementById("spinner-status");

  var p = Math.min(100, Math.max(0, Math.round(percent)));
  if (pElem) pElem.textContent = p + "%";
  if (bElem) bElem.style.width = p + "%";
  if (statusText && sElem) sElem.textContent = statusText;
}

function showToast(msg) {
  var t = document.getElementById("app-toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(function() { t.classList.remove("show"); }, 3000);
}

/* ==========================================================================
   MOCK / LOCAL FALLBACK BACKEND (PREVIEW MODE IF SUPABASE UNCONNECTED)
   ========================================================================== */
function getLocalMockDb() {
  var str = localStorage.getItem("vehicle_app_supabase_mock_db");
  if (str) {
    try { return JSON.parse(str); } catch (e) {}
  }
  var defaultDb = {
    users: [
      { id: "00000000-0000-0000-0000-000000000001", email: "admin@example.com", name: "Quản Trị Viên", username: "admin", password: "123456", role: "ADMIN", assigned_vehicles: "ALL" }
    ],
    vehicles: [],
    fuel: [],
    maintenance: [],
    expenses: [],
    reminders: [],
    categories: [
      { type: "MAINTENANCE", category_name: "Thay dầu", description: "Thay dầu máy định kỳ" },
      { type: "MAINTENANCE", category_name: "Lọc dầu", description: "Thay lọc dầu động cơ" },
      { type: "MAINTENANCE", category_name: "Bảo dưỡng định kỳ", description: "Bảo dưỡng định kỳ" },
      { type: "EXPENSE", category_name: "Gửi xe", description: "Phí gửi xe" },
      { type: "EXPENSE", category_name: "Cầu đường", description: "Phí VETC" },
      { type: "EXPENSE", category_name: "Rửa xe", description: "Rửa xe" },
      { type: "EXPENSE", category_name: "Đăng kiểm", description: "Đăng kiểm định kỳ" },
      { type: "EXPENSE", category_name: "Bảo hiểm", description: "Bảo hiểm xe" }
    ]
  };
  localStorage.setItem("vehicle_app_supabase_mock_db", JSON.stringify(defaultDb));
  return defaultDb;
}

function saveLocalMockDb(data) {
  localStorage.setItem("vehicle_app_supabase_mock_db", JSON.stringify(data));
}

/* ==========================================================================
   APP INITIALIZATION & USER MANAGEMENT
   ========================================================================== */
function initApp() {
  showSpinner(true, 10, "Đang kết nối cơ sở dữ liệu...");

  fetchUsers().then(function(users) {
    updateSpinnerProgress(50, "Đồng bộ tài khoản & phân quyền...");
    AppState.users = users;
    renderUserSelector();

    var savedUserId = localStorage.getItem("vehicle_app_user_id");
    if (savedUserId) {
      var u = users.find(function(x) { return String(x.id) === String(savedUserId); });
      if (u) {
        return autoLoginUser(u.id);
      }
    }
    showLoginScreen(true);
    showSpinner(false);
  }).catch(function(err) {
    showSpinner(false);
    console.error("Init Error:", err);
    showLoginScreen(true);
  });
}

function fetchUsers() {
  var db = getLocalMockDb();
  var localUsers = db.users || [];
  var defaultAdmin = { id: "00000000-0000-0000-0000-000000000001", email: "admin@example.com", name: "Quản Trị Viên", username: "admin", password: "123456", role: "ADMIN", assigned_vehicles: "ALL" };

  if (AppState.supabase) {
    return AppState.supabase.from('profiles').select('*').then(function(res) {
      var supaList = (!res.error && res.data) ? res.data : [];
      var userMap = {};
      userMap[defaultAdmin.id] = defaultAdmin;

      localUsers.forEach(function(u) {
        if (u && u.id) userMap[u.id] = u;
      });

      supaList.forEach(function(u) {
        if (u && u.id) {
          if (userMap[u.id]) {
            userMap[u.id] = Object.assign({}, userMap[u.id], u);
          } else {
            userMap[u.id] = {
              id: u.id,
              name: u.name || u.email || 'User',
              username: u.username || u.name,
              email: u.email || '',
              password: u.password || '123456',
              role: u.role || 'USER',
              assigned_vehicles: u.assigned_vehicles || 'ALL'
            };
          }
        }
      });

      var combined = Object.values(userMap);
      if (combined.length === 0) combined = [defaultAdmin];

      db.users = combined;
      saveLocalMockDb(db);

      return combined;
    }).catch(function(err) {
      console.warn("Fetch profiles Supabase error, using local:", err);
      var list = (localUsers && localUsers.length > 0) ? localUsers : [defaultAdmin];
      return list;
    });
  }

  var list = (localUsers && localUsers.length > 0) ? localUsers : [defaultAdmin];
  return Promise.resolve(list);
}

function showLoginScreen(show) {
  var screen = document.getElementById("login-screen");
  if (screen) screen.style.display = show ? "flex" : "none";
  if (show) {
    var uInput = document.getElementById("login-username");
    var pInput = document.getElementById("login-password");
    if (uInput && !uInput.value) uInput.value = "Quản Trị Viên";
    if (pInput) pInput.value = "123456";
  }
}

function submitLogin(event) {
  if (event) event.preventDefault();
  var inputUsername = (document.getElementById("login-username") ? document.getElementById("login-username").value : "").trim();
  var inputPassword = (document.getElementById("login-password") ? document.getElementById("login-password").value : "").trim();

  if (!inputUsername) {
    showToast("❌ Vui lòng nhập tên đăng nhập!");
    return;
  }

  var target = inputUsername.toLowerCase();
  var matchedUser = (AppState.users || []).find(function(u) {
    var uName = String(u.name || "").toLowerCase();
    var uUsername = String(u.username || "").toLowerCase();
    var uEmail = String(u.email || "").toLowerCase();
    return uName === target || uUsername === target || (uEmail && uEmail === target);
  });

  if (!matchedUser) {
    if (target === "admin" || target === "quản trị viên" || target === "quan tri vien") {
      matchedUser = (AppState.users && AppState.users.length > 0)
        ? AppState.users[0]
        : { id: "00000000-0000-0000-0000-000000000001", name: "Quản Trị Viên", username: "admin", password: "123456", role: "ADMIN" };
    }
  }

  if (!matchedUser) {
    showToast("❌ Tên đăng nhập không tồn tại!");
    return;
  }

  var validPass = matchedUser.password || "123456";
  if (String(inputPassword) !== String(validPass)) {
    showToast("❌ Mật khẩu không chính xác!");
    return;
  }

  AppState.currentUser = {
    id: matchedUser.id,
    name: matchedUser.name || inputUsername,
    username: matchedUser.username || matchedUser.name || inputUsername,
    email: matchedUser.email || "",
    role: matchedUser.role || "USER",
    isAdmin: matchedUser.role === 'ADMIN',
    assigned_vehicles: matchedUser.assigned_vehicles || 'ALL'
  };

  localStorage.setItem("vehicle_app_user_id", matchedUser.id);
  showLoginScreen(false);
  loadUserVehiclesAndStart(matchedUser.id);
  showToast("🎉 Đăng nhập thành công! Chào mừng " + AppState.currentUser.name);
}

function autoLoginUser(userId) {
  var u = AppState.users.find(function(x) { return String(x.id) === String(userId); });
  if (!u) u = AppState.users[0];
  if (!u) return showLoginScreen(true);

  AppState.currentUser = {
    id: u.id,
    name: u.name,
    username: u.username || u.name,
    email: u.email || "",
    role: u.role,
    isAdmin: u.role === 'ADMIN',
    assigned_vehicles: u.assigned_vehicles || 'ALL'
  };

  showLoginScreen(false);
  loadUserVehiclesAndStart(u.id);
}

function logoutUser() {
  localStorage.removeItem("vehicle_app_user_id");
  AppState.currentUser = null;
  AppState.currentVehicleId = null;
  showToast("🔒 Đã đăng xuất tài khoản.");
  showLoginScreen(true);
}

function loadUserVehiclesAndStart(userId) {
  showSpinner(true, 40, "Tải danh sách xe...");
  fetchVehicles(userId).then(function(vehicles) {
    updateSpinnerProgress(80, "Tải danh mục hệ thống...");
    AppState.vehicles = vehicles || [];
    renderUserSelector();
    renderVehicleSelector();
    updateNavVisibility();

    if (vehicles && vehicles.length > 0) {
      AppState.currentVehicleId = vehicles[0].id;
    } else {
      AppState.currentVehicleId = null;
    }
    return fetchCategories();
  }).then(function(cats) {
    AppState.categories = cats || [];
    switchTab('dashboard');
    showSpinner(false);
  }).catch(function(err) {
    showSpinner(false);
    console.error("loadUserVehiclesAndStart Error:", err);
    switchTab('dashboard');
  });
}

function fetchVehicles(userId) {
  var db = getLocalMockDb();
  var localList = db.vehicles || [];

  if (AppState.supabase) {
    return AppState.supabase.from('vehicles').select('*').eq('status', 'ACTIVE').then(function(res) {
      var supaList = (!res.error && res.data) ? res.data : [];
      var combinedMap = {};
      localList.forEach(function(v) { combinedMap[v.id] = v; });
      supaList.forEach(function(v) { combinedMap[v.id] = v; });
      var list = Object.values(combinedMap);

      if (AppState.currentUser && !AppState.currentUser.isAdmin) {
        list = list.filter(function(v) { return String(v.user_id) === String(userId); });
      }
      return list;
    }).catch(function(err) {
      console.warn("Fetch vehicles Supabase error, using local:", err);
      var list = localList;
      if (AppState.currentUser && !AppState.currentUser.isAdmin) {
        list = list.filter(function(v) { return String(v.user_id) === String(userId); });
      }
      return list;
    });
  }

  var list = localList;
  if (AppState.currentUser && !AppState.currentUser.isAdmin) {
    list = list.filter(function(v) { return String(v.user_id) === String(userId); });
  }
  return Promise.resolve(list);
}

function fetchCategories() {
  if (AppState.supabase) {
    return AppState.supabase.from('categories').select('*').then(function(res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }
  var db = getLocalMockDb();
  return Promise.resolve(db.categories || []);
}

function updateNavVisibility() {
  var isAdmin = AppState.currentUser && AppState.currentUser.isAdmin;

  var dFuel = document.getElementById("dnav-fuel");
  var dMnt = document.getElementById("dnav-maintenance");
  var dExp = document.getElementById("dnav-expense");
  var dRem = document.getElementById("dnav-reminder");
  var dVeh = document.getElementById("dnav-vehicle");
  var dSet = document.getElementById("dnav-settings");

  var mFuel = document.getElementById("nav-fuel");
  var mMnt = document.getElementById("nav-maintenance");
  var mExp = document.getElementById("nav-expense");

  if (isAdmin) {
    if (dFuel) dFuel.style.display = "none";
    if (dMnt) dMnt.style.display = "none";
    if (dExp) dExp.style.display = "none";
    if (dRem) dRem.style.display = "none";
    if (dVeh) dVeh.style.display = "inline-block";
    if (dSet) dSet.style.display = "inline-block";

    if (mFuel) mFuel.style.display = "none";
    if (mMnt) mMnt.style.display = "none";
    if (mExp) mExp.style.display = "none";
  } else {
    if (dFuel) dFuel.style.display = "inline-block";
    if (dMnt) dMnt.style.display = "inline-block";
    if (dExp) dExp.style.display = "inline-block";
    if (dRem) dRem.style.display = "inline-block";
    if (dVeh) dVeh.style.display = "inline-block";
    if (dSet) dSet.style.display = "none";

    if (mFuel) mFuel.style.display = "flex";
    if (mMnt) mMnt.style.display = "flex";
    if (mExp) mExp.style.display = "flex";
  }
}

function renderUserSelector() {
  var badge = document.getElementById("header-user-info");
  if (badge) {
    if (AppState.currentUser) {
      var icon = AppState.currentUser.isAdmin ? "👑 " : "👤 ";
      badge.innerHTML = icon + "<strong>" + AppState.currentUser.name + "</strong>";
    } else {
      badge.innerHTML = "👤 Chưa đăng nhập";
    }
  }
  updateNavVisibility();
}

function onUserSelectChange(selectElem) {
  autoLoginUser(selectElem.value);
}

function renderVehicleSelector() {
  var select = document.getElementById("header-vehicle-select");
  if (!select) return;
  select.innerHTML = "";

  var isAdmin = AppState.currentUser && AppState.currentUser.isAdmin;
  if (isAdmin) {
    select.innerHTML = '<option value="">👑 Admin System Mode</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  if (!AppState.vehicles || AppState.vehicles.length === 0) {
    select.innerHTML = '<option value="">Chưa có xe nào</option>';
    return;
  }

  AppState.vehicles.forEach(function(v) {
    var opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = "🚗 " + v.name + " (" + (v.license_plate || 'Chưa biển') + ")";
    if (v.id === AppState.currentVehicleId) opt.selected = true;
    select.appendChild(opt);
  });
}

function onVehicleSelectChange(selectElem) {
  AppState.currentVehicleId = selectElem.value;
  refreshCurrentTab();
}

function switchTab(tabName) {
  AppState.activeTab = tabName;
  document.querySelectorAll(".nav-item").forEach(function(el) { el.classList.remove("active"); });
  var activeNav = document.getElementById("nav-" + tabName);
  if (activeNav) activeNav.classList.add("active");

  document.querySelectorAll(".desktop-nav-item").forEach(function(el) { el.classList.remove("active"); });
  var activeDesktopNav = document.getElementById("dnav-" + tabName);
  if (activeDesktopNav) activeDesktopNav.classList.add("active");

  refreshCurrentTab();
}

function refreshCurrentTab() {
  var viewContainer = document.getElementById("app-view");
  if (!viewContainer) return;

  var isAdmin = AppState.currentUser && AppState.currentUser.isAdmin;
  if (isAdmin) {
    if (AppState.activeTab === 'dashboard') { loadDashboardView(); return; }
    if (AppState.activeTab === 'settings') { loadSettingsView(); return; }
    if (AppState.activeTab === 'vehicle') { loadVehicleView(); return; }
    viewContainer.innerHTML = `
      <div class="container text-center" style="padding-top: 40px;">
        <div style="font-size: 3rem;">👑</div>
        <h3 style="margin-top: 10px;">Chế Độ Quản Trị Viên (Admin)</h3>
        <p style="color: var(--text-muted); margin-bottom: 20px; max-width: 500px; margin-left: auto; margin-right: auto;">
          Tài khoản Quản trị viên chỉ quản lý người dùng & cài đặt hệ thống. Vui lòng chuyển sang tài khoản Người dùng ở góc phải menu trên để xem và ghi nhận thông tin xe.
        </p>
        <button class="btn btn-primary" style="max-width: 260px; margin: 0 auto;" onclick="switchTab('dashboard')">Quay lại Trang Quản Trị</button>
      </div>
    `;
    return;
  }

  if (!AppState.currentVehicleId && AppState.activeTab !== 'settings' && AppState.activeTab !== 'vehicle') {
    loadDashboardView();
    return;
  }

  switch(AppState.activeTab) {
    case 'dashboard': loadDashboardView(); break;
    case 'fuel': loadFuelView(); break;
    case 'maintenance': loadMaintenanceView(); break;
    case 'expense': loadExpenseView(); break;
    case 'reminder': loadReminderView(); break;
    case 'report': loadReportView(); break;
    case 'settings': loadSettingsView(); break;
    case 'vehicle': loadVehicleView(); break;
  }
}

/* ==========================================================================
   VIEW RENDERERS
   ========================================================================== */
function loadDashboardView() {
  showSpinner(true, 30, "Tải dữ liệu bảng điều khiển...");
  getDashboardData(AppState.currentVehicleId).then(function(dash) {
    renderDashboardHTML(dash);
    showSpinner(false);
  });
}

function getDashboardData(vehicleId) {
  var v = AppState.vehicles.find(function(x) { return x.id === vehicleId; });
  if (!v) return Promise.resolve({ hasVehicle: false });

  return Promise.all([
    fetchFuelLogs(vehicleId),
    fetchExpenses(vehicleId),
    fetchMaintenanceLogs(vehicleId),
    fetchReminders(vehicleId)
  ]).then(function(results) {
    var fuels = results[0] || [];
    var exps = results[1] || [];
    var mnts = results[2] || [];
    var reminders = results[3] || [];

    var thisMonthFuel = fuels.reduce(function(acc, x) { return acc + (Number(x.total_amount) || 0); }, 0);
    var thisMonthExp = exps.reduce(function(acc, x) { return acc + (Number(x.amount) || 0); }, 0);
    var thisMonthMnt = mnts.reduce(function(acc, x) { return acc + (Number(x.total_amount) || 0); }, 0);
    var thisMonthTotal = thisMonthFuel + thisMonthExp + thisMonthMnt;

    var monthDistance = 0;
    var consumption = 0;
    if (fuels.length > 1) {
      fuels.sort(function(a, b) { return (Number(a.odometer) || 0) - (Number(b.odometer) || 0); });
      var dist = Number(fuels[fuels.length - 1].odometer) - Number(fuels[0].odometer);
      if (dist > 0) {
        monthDistance = dist;
        var totalL = fuels.slice(1).reduce(function(acc, x) { return acc + (Number(x.liters) || 0); }, 0);
        if (totalL > 0) consumption = Math.round((totalL / dist * 100) * 100) / 100;
      }
    }

    var costPerKm = monthDistance > 0 ? Math.round(thisMonthTotal / monthDistance) : 0;
    var urgentReminders = reminders.filter(function(r) { return r.isUrgent; });

    return {
      hasVehicle: true, vehicle: v, currentOdometer: Number(v.current_odometer) || 0,
      thisMonthTotal: thisMonthTotal, thisMonthFuel: thisMonthFuel, thisMonthMnt: thisMonthMnt, thisMonthExp: thisMonthExp,
      monthDistance: monthDistance, consumption: consumption, costPerKm: costPerKm, urgentReminders: urgentReminders
    };
  });
}

function renderDashboardHTML(dash) {
  var view = document.getElementById("app-view");
  if (!view) return;
  var isAdmin = AppState.currentUser && AppState.currentUser.isAdmin;

  if (isAdmin) {
    view.innerHTML = `
      <div class="container">
        <div class="card" style="background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; padding: 22px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="font-size: 1.35rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                👑 BẢNG ĐIỀU KHIỂN QUẢN TRỊ VIÊN
              </div>
              <div style="font-size: 0.85rem; opacity: 0.9; margin-top: 4px;">
                Quản lý tài khoản người dùng, phân quyền xe và cấu hình hệ thống Supabase.
              </div>
            </div>
            <div>
              <button class="btn btn-secondary" style="background: #ffffff; color: #0284c7; width: auto; font-weight: 800;" onclick="openAddUserModal()">+ Thêm Tài Khoản Mới</button>
            </div>
          </div>
        </div>
        <div class="metrics-grid" style="margin-top: 16px;">
          <div class="metric-box">
            <div class="metric-label">👥 TỔNG TÀI KHOẢN</div>
            <div class="metric-value primary">${AppState.users ? AppState.users.length : 0} Người dùng</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">🚗 TỔNG SỐ XE</div>
            <div class="metric-value success">${AppState.vehicles ? AppState.vehicles.length : 0} Xe cá nhân</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">⚡ TRẠNG THÁI SUPABASE</div>
            <div class="metric-value warning">${AppState.supabase ? '⚡ Đã kết nối' : '⚙️ Chế độ Preview'}</div>
          </div>
        </div>
        <div class="card" style="margin-top: 16px;">
          <div class="card-header">
            <div class="card-title">👥 DANH SÁCH TÀI KHOẢN & PHÂN QUYỀN XE</div>
            <button class="btn btn-sm btn-outline" onclick="openAddUserModal()">+ Thêm tài khoản</button>
          </div>
          <div style="overflow-x: auto;">
            <table class="table" style="width: 100%; border-collapse: collapse; margin-top: 8px;">
              <thead>
                <tr style="border-bottom: 2px solid var(--border-color); text-align: left; font-size: 0.85rem; color: var(--text-muted);">
                  <th style="padding: 10px;">Tài khoản</th>
                  <th style="padding: 10px;">Vai trò</th>
                  <th style="padding: 10px;">Xe được phân quyền</th>
                  <th style="padding: 10px;">Hành động</th>
                </tr>
              </thead>
              <tbody>
                ${(AppState.users || []).map(function(u) {
                  var isUserAdmin = u.role === 'ADMIN';
                  var roleBadge = isUserAdmin ? '<span class="badge badge-primary">👑 Admin</span>' : '<span class="badge badge-success">👤 User</span>';
                  return `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                      <td style="padding: 10px;"><strong>${u.name}</strong><br><small style="color: var(--text-muted);">${u.email || 'Chưa có email'}</small></td>
                      <td style="padding: 10px;">${roleBadge}</td>
                      <td style="padding: 10px;">${u.assigned_vehicles === 'ALL' ? '<em>Tất cả xe</em>' : (u.assigned_vehicles || 'Chưa gán xe')}</td>
                      <td style="padding: 10px;">
                        <button class="btn btn-sm btn-outline" onclick="editUserClick('${u.id}')">✏️ Sửa</button>
                        ${!isUserAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteUserClick('${u.id}')" style="margin-left: 4px;">🗑️ Xóa</button>` : ''}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    return;
  }

  if (!dash || !dash.hasVehicle) {
    view.innerHTML = `
      <div class="container text-center" style="padding-top: 40px;">
        <div style="font-size: 3.5rem;">🚗</div>
        <h2 style="font-size: 1.3rem; font-weight: 800; margin-top: 12px; color: #0f172a;">CHƯA CÓ THÔNG TIN XE CÁ NHÂN</h2>
        <p style="color: var(--text-muted); margin-bottom: 24px; max-width: 480px; margin-left: auto; margin-right: auto;">
          Chào mừng bạn! Vui lòng nhập thông tin xe của bạn (bao gồm Tên xe, Hãng xe và Số km Odo hiện tại) để bắt đầu sử dụng sổ theo dõi.
        </p>
        <button class="btn btn-primary" style="max-width: 280px; margin: 0 auto; padding: 14px;" onclick="openAddVehicleModal()">+ THÊM XE MỚI NGAY</button>
      </div>
    `;
    setTimeout(function() { openAddVehicleModal(); }, 300);
    return;
  }

  var v = dash.vehicle;
  var alertsHtml = "";
  if (dash.urgentReminders && dash.urgentReminders.length > 0) {
    dash.urgentReminders.forEach(function(rem) {
      alertsHtml += `<div class="card" style="background: #fef2f2; border-color: #fca5a5; color: #991b1b; padding: 12px; font-weight: 700; margin-bottom: 12px;">⏰ <strong>${rem.title}</strong>: ${rem.statusText}</div>`;
    });
  }

  view.innerHTML = `
    <div class="container">
      <div class="card" style="background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); color: #ffffff; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-size: 1.35rem; font-weight: 800; display: flex; align-items: center; gap: 8px; color: #ffffff;">
              🚗 ${v.name}
              <button class="btn btn-sm" style="background: rgba(255, 255, 255, 0.2); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.4); padding: 4px 10px; font-size: 0.8rem; border-radius: 6px; cursor: pointer; margin-left: 8px;" onclick="editVehicle('${v.id}')" title="Sửa thông tin xe này">✏️ Sửa xe</button>
            </div>
            <div style="font-size: 0.85rem; opacity: 0.9; margin-top: 4px;">
              Biển số: <strong>${v.license_plate || 'Chưa đặt'}</strong> | Hãng: ${v.brand || 'Chưa nhập'} | ${v.fuel_type || 'Xăng'}
            </div>
          </div>
          <div style="text-align: right; background: rgba(255, 255, 255, 0.15); padding: 10px 16px; border-radius: 10px;">
            <div style="font-size: 0.7rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px;">SỐ KM ODOMETER HIỆN TẠI</div>
            <div style="font-size: 1.5rem; font-weight: 900; letter-spacing: 1px;">${formatVNDClient(dash.currentOdometer).replace(' ₫', '')} km</div>
          </div>
        </div>
      </div>

      ${alertsHtml}

      <div class="quick-actions-grid">
        <button class="btn-quick-action btn-fuel" onclick="openFuelModal()">
          <span class="icon">⛽</span><span>ĐỔ XĂNG</span>
        </button>
        <button class="btn-quick-action btn-maintenance" onclick="openMaintenanceModal()">
          <span class="icon">🔧</span><span>BẢO DƯỠNG</span>
        </button>
        <button class="btn-quick-action btn-expense" onclick="openExpenseModal()">
          <span class="icon">💰</span><span>CHI PHÍ</span>
        </button>
        <button class="btn-quick-action btn-reminder" onclick="openReminderModal()">
          <span class="icon">⏰</span><span>NHẮC VIỆC</span>
        </button>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">📊 TỔNG CHI PHÍ SỬ DỤNG</div>
        </div>
        <div style="font-size: 2rem; font-weight: 900; color: var(--primary); margin-bottom: 14px;">
          ${formatVNDClient(dash.thisMonthTotal)}
        </div>
        <div class="metrics-grid">
          <div class="metric-box">
            <div class="metric-label">⛽ Nhiên liệu</div>
            <div class="metric-value primary">${formatVNDClient(dash.thisMonthFuel)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">🔧 Bảo dưỡng</div>
            <div class="metric-value success">${formatVNDClient(dash.thisMonthMnt)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">💰 Chi phí khác</div>
            <div class="metric-value warning">${formatVNDClient(dash.thisMonthExp)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">🛣️ Quãng đường</div>
            <div class="metric-value">${dash.monthDistance > 0 ? dash.monthDistance + ' km' : '0 km'}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">📉 Mức tiêu hao</div>
            <div class="metric-value">${dash.consumption > 0 ? dash.consumption + ' L/100km' : 'N/A'}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">💵 Chi phí / km</div>
            <div class="metric-value primary">${dash.costPerKm > 0 ? formatVNDClient(dash.costPerKm) + '/km' : 'N/A'}</div>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
        <button class="btn btn-primary" style="width: auto; padding: 10px 18px;" onclick="switchTab('report')">📊 Xem Báo Cáo & Lịch Sử Chi Tiết ➔</button>
      </div>
    </div>
  `;
}

/* ==========================================================================
   FUEL LOGS & ATTRIBUTION
   ========================================================================== */
function fetchFuelLogs(vehicleId) {
  if (AppState.supabase) {
    return AppState.supabase.from('fuel_logs').select('*').eq('vehicle_id', vehicleId).order('odometer', { ascending: false }).then(function(res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }
  var db = getLocalMockDb();
  var list = (db.fuel || []).filter(function(f) { return String(f.vehicle_id) === String(vehicleId); });
  return Promise.resolve(list);
}

function loadFuelView() {
  showSpinner(true, 30, "Tải nhật ký đổ xăng...");
  fetchFuelLogs(AppState.currentVehicleId).then(function(logs) {
    renderFuelHTML(logs);
    showSpinner(false);
  });
}

function renderFuelHTML(logs) {
  var view = document.getElementById("app-view");
  if (!view) return;
  var listHtml = "";

  if (!logs || logs.length === 0) {
    listHtml = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">Chưa có lịch sử đổ xăng nào.</div>`;
  } else {
    // Process fuel attribution
    logs.sort(function(a, b) { return (Number(a.odometer) || 0) - (Number(b.odometer) || 0); });
    for (var i = 0; i < logs.length; i++) {
      var cur = logs[i];
      if (i < logs.length - 1) {
        var next = logs[i + 1];
        var dist = Number(next.odometer) - Number(cur.odometer);
        if (dist > 0) {
          cur.hasNext = true;
          cur.segmentDistance = dist;
          cur.segmentCostPerKm = Math.round(Number(cur.total_amount) / dist);
          cur.segmentConsumption = Math.round((Number(next.liters) / dist * 100) * 100) / 100;
        } else { cur.hasNext = false; }
      } else { cur.hasNext = false; }
    }
    logs.sort(function(a, b) { return (Number(b.odometer) || 0) - (Number(a.odometer) || 0); });

    logs.forEach(function(f) {
      var metricsBadgeHtml = "";
      if (f.hasNext && f.segmentDistance > 0) {
        metricsBadgeHtml = `
          <div style="background: #f8fafc; border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 10px; margin-top: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center;">
            <div>
              <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800;">QUÃNG ĐƯỜNG</div>
              <div style="font-weight: 900; color: var(--primary); font-size: 0.95rem;">${f.segmentDistance} km</div>
            </div>
            <div>
              <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800;">TIÊU HAO</div>
              <div style="font-weight: 900; color: var(--success); font-size: 0.95rem;">${f.segmentConsumption} L/100km</div>
            </div>
            <div>
              <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800;">TIỀN / KM</div>
              <div style="font-weight: 900; color: var(--warning); font-size: 0.95rem;">${formatVNDClient(f.segmentCostPerKm)}/km</div>
            </div>
          </div>
        `;
      } else {
        metricsBadgeHtml = `
          <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 8px 12px; border-radius: 8px; margin-top: 10px; font-size: 0.8rem; color: #92400e; font-weight: 700;">
            ⏳ <em>Đang đo quãng đường di chuyển của bình xăng này... (Sẽ hiển thị mức tiêu hao khi đổ bình kế tiếp)</em>
          </div>
        `;
      }

      listHtml += `
        <div class="card">
          <div class="card-header">
            <div class="card-title">⛽ Đổ Xăng (${f.liters} Lít)</div>
            <span class="badge badge-primary">${f.date}</span>
          </div>
          <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 6px;">
            Số km Odo: <strong>${formatVNDClient(f.odometer).replace(' ₫','')} km</strong> | Đơn giá: ${formatVNDClient(f.price_per_liter)}/L ${f.station ? '| Trạm: ' + f.station : ''}
          </div>
          ${metricsBadgeHtml}
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); margin-top: 10px; padding-top: 10px;">
            <div style="font-size: 1.15rem; font-weight: 900; color: var(--primary);">${formatVNDClient(f.total_amount)}</div>
            <button class="btn btn-danger btn-sm" onclick="deleteFuelConfirm('${f.id}')">🗑️ Xóa</button>
          </div>
        </div>
      `;
    });
  }

  view.innerHTML = `
    <div class="container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 1.2rem; font-weight: 800;">⛽ NHẬT KÝ ĐỔ XĂNG</h2>
        <button class="btn btn-primary" style="width: auto; padding: 8px 14px;" onclick="openFuelModal()">+ Thêm đổ xăng</button>
      </div>
      ${listHtml}
    </div>
  `;
}

function openFuelModal() {
  var form = document.getElementById("form-fuel");
  if (form) {
    form.reset();
    document.getElementById("fuel-date").value = getTodayISODate();
    document.getElementById("fuel-vehicle-id").value = AppState.currentVehicleId;
    var v = AppState.vehicles.find(function(x) { return x.id === AppState.currentVehicleId; });
    if (v) document.getElementById("fuel-odometer").value = v.current_odometer || 0;
  }
  openModal("modal-fuel");
}

function saveFuelSubmit(event) {
  event.preventDefault();
  var data = {
    vehicle_id: document.getElementById("fuel-vehicle-id").value || AppState.currentVehicleId,
    user_id: AppState.currentUser ? AppState.currentUser.id : null,
    date: document.getElementById("fuel-date").value,
    odometer: Number(document.getElementById("fuel-odometer").value),
    liters: Number(document.getElementById("fuel-liters").value),
    price_per_liter: Number(document.getElementById("fuel-price").value) || 0,
    total_amount: Number(document.getElementById("fuel-total").value) || 0,
    station: document.getElementById("fuel-station").value
  };

  showSpinner(true, 40, "Đang lưu nhật ký đổ xăng...");

  saveFuelLogApi(data).then(function() {
    return updateVehicleOdometerApi(data.vehicle_id, data.odometer);
  }).then(function() {
    showToast("🎉 Lưu thông tin đổ xăng thành công!");
    closeModal("modal-fuel");
    loadFuelView();
  });
}

function saveFuelLogApi(data) {
  if (AppState.supabase) {
    return AppState.supabase.from('fuel_logs').insert([data]);
  }
  var db = getLocalMockDb();
  data.id = "FUEL-" + Date.now();
  db.fuel.push(data);
  saveLocalMockDb(db);
  return Promise.resolve();
}

function deleteFuelConfirm(id) {
  if (confirm("Bạn có chắc muốn xóa lượt đổ xăng này?")) {
    showSpinner(true, 40, "Đang xóa...");
    deleteFuelLogApi(id).then(function() {
      showToast("Đã xóa lượt đổ xăng.");
      loadFuelView();
    });
  }
}

function deleteFuelLogApi(id) {
  if (AppState.supabase) {
    return AppState.supabase.from('fuel_logs').delete().eq('id', id);
  }
  var db = getLocalMockDb();
  db.fuel = (db.fuel || []).filter(function(f) { return String(f.id) !== String(id); });
  saveLocalMockDb(db);
  return Promise.resolve();
}

/* ==========================================================================
   MAINTENANCE LOGS
   ========================================================================== */
function fetchMaintenanceLogs(vehicleId) {
  if (AppState.supabase) {
    return AppState.supabase.from('maintenance_logs').select('*').eq('vehicle_id', vehicleId).order('odometer', { ascending: false }).then(function(res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }
  var db = getLocalMockDb();
  var list = (db.maintenance || []).filter(function(m) { return String(m.vehicle_id) === String(vehicleId); });
  return Promise.resolve(list);
}

function loadMaintenanceView() {
  showSpinner(true, 30, "Tải lịch sử bảo dưỡng...");
  fetchMaintenanceLogs(AppState.currentVehicleId).then(function(logs) {
    renderMaintenanceHTML(logs);
    showSpinner(false);
  });
}

function renderMaintenanceHTML(logs) {
  var view = document.getElementById("app-view");
  if (!view) return;
  var logsHtml = "";

  if (!logs || logs.length === 0) {
    logsHtml = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">Chưa có lịch sử bảo dưỡng nào.</div>`;
  } else {
    logs.forEach(function(m) {
      logsHtml += `
        <div class="card">
          <div class="card-header">
            <div class="card-title">🔧 ${m.category}</div>
            <span class="badge badge-success">${m.date}</span>
          </div>
          <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 6px;">
            Số km Odo: <strong>${formatVNDClient(m.odometer).replace(' ₫','')} km</strong> ${m.garage ? '| Garage: ' + m.garage : ''}
          </div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 10px;">
            ${m.description || 'Không có mô tả'}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 10px;">
            <div style="font-size: 1.1rem; font-weight: 900; color: var(--success);">${formatVNDClient(m.total_amount)}</div>
            <button class="btn btn-danger btn-sm" onclick="deleteMntConfirm('${m.id}')">🗑️ Xóa</button>
          </div>
        </div>
      `;
    });
  }

  view.innerHTML = `
    <div class="container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 1.2rem; font-weight: 800;">🔧 LỊCH SỬ BẢO DƯỠNG & SỬA CHỮA</h2>
        <button class="btn btn-primary" style="width: auto; padding: 8px 14px;" onclick="openMaintenanceModal()">+ Thêm bảo dưỡng</button>
      </div>
      ${logsHtml}
    </div>
  `;
}

function openMaintenanceModal() {
  var form = document.getElementById("form-maintenance");
  if (form) {
    form.reset();
    document.getElementById("mnt-date").value = getTodayISODate();
    document.getElementById("mnt-vehicle-id").value = AppState.currentVehicleId;
    var v = AppState.vehicles.find(function(x) { return x.id === AppState.currentVehicleId; });
    if (v) document.getElementById("mnt-odometer").value = v.current_odometer || 0;
  }
  renderMntCategoryCheckboxes();
  openModal("modal-maintenance");
}

function renderMntCategoryCheckboxes() {
  var container = document.getElementById("mnt-category-checkboxes");
  if (!container) return;
  container.innerHTML = "";
  var defaultCats = ["Thay dầu", "Lọc dầu", "Lọc gió", "Lọc điều hòa", "Bugi", "Nước làm mát", "Phanh", "Bảo dưỡng định kỳ", "Sửa chữa khác"];
  defaultCats.forEach(function(cat) {
    var div = document.createElement("div");
    div.style.display = "flex"; div.style.alignItems = "center"; div.style.gap = "8px"; div.style.marginTop = "4px";
    div.innerHTML = `<input type="checkbox" class="mnt-cat-cb" value="${cat}" style="width: 16px; height: 16px;"> <label style="font-size: 0.88rem; font-weight: 600;">${cat}</label>`;
    container.appendChild(div);
  });
}

function onMntPartsOrLaborChange() {
  var parts = Number(document.getElementById("mnt-parts-cost").value) || 0;
  var labor = Number(document.getElementById("mnt-labor-cost").value) || 0;
  if (parts > 0 || labor > 0) {
    document.getElementById("mnt-total-amount").value = parts + labor;
  }
}

function saveMaintenanceSubmit(event) {
  event.preventDefault();
  var selectedCats = [];
  document.querySelectorAll(".mnt-cat-cb:checked").forEach(function(cb) { selectedCats.push(cb.value); });
  var customCat = document.getElementById("mnt-custom-cat").value;
  if (customCat) selectedCats.push(customCat);
  var finalCategory = selectedCats.join(", ") || "Bảo dưỡng định kỳ";

  var data = {
    vehicle_id: document.getElementById("mnt-vehicle-id").value || AppState.currentVehicleId,
    user_id: AppState.currentUser ? AppState.currentUser.id : null,
    date: document.getElementById("mnt-date").value,
    odometer: Number(document.getElementById("mnt-odometer").value),
    category: finalCategory,
    parts_cost: Number(document.getElementById("mnt-parts-cost").value) || 0,
    labor_cost: Number(document.getElementById("mnt-labor-cost").value) || 0,
    total_amount: Number(document.getElementById("mnt-total-amount").value) || 0,
    garage: document.getElementById("mnt-garage").value,
    next_odometer: Number(document.getElementById("mnt-next-odo").value) || 0,
    next_date: document.getElementById("mnt-next-date").value || null
  };

  showSpinner(true, 40, "Đang lưu thông tin bảo dưỡng...");
  saveMaintenanceLogApi(data).then(function() {
    if (data.odometer > 0) updateVehicleOdometerApi(data.vehicle_id, data.odometer);
    showToast("🎉 Lưu lịch sử bảo dưỡng thành công!");
    closeModal("modal-maintenance");
    loadMaintenanceView();
  });
}

function saveMaintenanceLogApi(data) {
  if (AppState.supabase) {
    return AppState.supabase.from('maintenance_logs').insert([data]);
  }
  var db = getLocalMockDb();
  data.id = "MNT-" + Date.now();
  db.maintenance.push(data);
  saveLocalMockDb(db);
  return Promise.resolve();
}

function deleteMntConfirm(id) {
  if (confirm("Xóa lịch sử bảo dưỡng này?")) {
    showSpinner(true, 40, "Đang xóa...");
    deleteMntLogApi(id).then(function() {
      showToast("Đã xóa bảo dưỡng.");
      loadMaintenanceView();
    });
  }
}

function deleteMntLogApi(id) {
  if (AppState.supabase) {
    return AppState.supabase.from('maintenance_logs').delete().eq('id', id);
  }
  var db = getLocalMockDb();
  db.maintenance = (db.maintenance || []).filter(function(m) { return String(m.id) !== String(id); });
  saveLocalMockDb(db);
  return Promise.resolve();
}

/* ==========================================================================
   EXPENSES LOGS
   ========================================================================== */
function fetchExpenses(vehicleId) {
  if (AppState.supabase) {
    return AppState.supabase.from('expenses').select('*').eq('vehicle_id', vehicleId).order('date', { ascending: false }).then(function(res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }
  var db = getLocalMockDb();
  var list = (db.expenses || []).filter(function(e) { return String(e.vehicle_id) === String(vehicleId); });
  return Promise.resolve(list);
}

function loadExpenseView() {
  showSpinner(true, 30, "Tải danh sách chi phí...");
  fetchExpenses(AppState.currentVehicleId).then(function(logs) {
    renderExpenseHTML(logs);
    showSpinner(false);
  });
}

function renderExpenseHTML(logs) {
  var view = document.getElementById("app-view");
  if (!view) return;
  var listHtml = "";

  if (!logs || logs.length === 0) {
    listHtml = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">Chưa có khoản chi phí khác nào.</div>`;
  } else {
    logs.forEach(function(e) {
      listHtml += `
        <div class="card">
          <div class="card-header">
            <div class="card-title">💰 ${e.category}</div>
            <span class="badge badge-warning">${e.date}</span>
          </div>
          <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 6px;">
            ${e.description || 'Chi phí khác'} ${e.odometer > 0 ? '| Odo: ' + formatVNDClient(e.odometer).replace(' ₫','') + ' km' : ''}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 10px;">
            <div style="font-size: 1.15rem; font-weight: 900; color: var(--warning);">${formatVNDClient(e.amount)}</div>
            <button class="btn btn-danger btn-sm" onclick="deleteExpConfirm('${e.id}')">🗑️ Xóa</button>
          </div>
        </div>
      `;
    });
  }

  view.innerHTML = `
    <div class="container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 1.2rem; font-weight: 800;">💰 QUẢN LÝ CHI PHÍ KHÁC</h2>
        <button class="btn btn-primary" style="width: auto; padding: 8px 14px;" onclick="openExpenseModal()">+ Thêm chi phí</button>
      </div>
      ${listHtml}
    </div>
  `;
}

function openExpenseModal() {
  var form = document.getElementById("form-expense");
  if (form) {
    form.reset();
    document.getElementById("exp-date").value = getTodayISODate();
    document.getElementById("exp-vehicle-id").value = AppState.currentVehicleId;
    var v = AppState.vehicles.find(function(x) { return x.id === AppState.currentVehicleId; });
    if (v) document.getElementById("exp-odometer").value = v.current_odometer || 0;
  }
  renderExpCategoryDropdown();
  openModal("modal-expense");
}

function renderExpCategoryDropdown() {
  var select = document.getElementById("exp-category");
  if (!select) return;
  select.innerHTML = "";
  var defaultCats = ["Gửi xe", "Cầu đường (VETC)", "Rửa xe", "Đăng kiểm", "Bảo hiểm", "Chi phí khác"];
  defaultCats.forEach(function(cat) {
    var opt = document.createElement("option");
    opt.value = cat; opt.textContent = cat;
    select.appendChild(opt);
  });
}

function saveExpenseSubmit(event) {
  event.preventDefault();
  var data = {
    vehicle_id: document.getElementById("exp-vehicle-id").value || AppState.currentVehicleId,
    user_id: AppState.currentUser ? AppState.currentUser.id : null,
    date: document.getElementById("exp-date").value,
    category: document.getElementById("exp-category").value,
    amount: Number(document.getElementById("exp-amount").value) || 0,
    odometer: Number(document.getElementById("exp-odometer").value) || 0,
    description: document.getElementById("exp-desc").value
  };

  showSpinner(true, 40, "Đang lưu khoản chi phí...");
  saveExpenseApi(data).then(function() {
    showToast("🎉 Lưu khoản chi phí thành công!");
    closeModal("modal-expense");
    loadExpenseView();
  });
}

function saveExpenseApi(data) {
  if (AppState.supabase) {
    return AppState.supabase.from('expenses').insert([data]);
  }
  var db = getLocalMockDb();
  data.id = "EXP-" + Date.now();
  db.expenses.push(data);
  saveLocalMockDb(db);
  return Promise.resolve();
}

function deleteExpConfirm(id) {
  if (confirm("Xóa khoản chi phí này?")) {
    showSpinner(true, 40, "Đang xóa...");
    deleteExpApi(id).then(function() {
      showToast("Đã xóa khoản chi phí.");
      loadExpenseView();
    });
  }
}

function deleteExpApi(id) {
  if (AppState.supabase) {
    return AppState.supabase.from('expenses').delete().eq('id', id);
  }
  var db = getLocalMockDb();
  db.expenses = (db.expenses || []).filter(function(e) { return String(e.id) !== String(id); });
  saveLocalMockDb(db);
  return Promise.resolve();
}

/* ==========================================================================
   REMINDERS
   ========================================================================== */
function fetchReminders(vehicleId) {
  if (AppState.supabase) {
    return AppState.supabase.from('reminders').select('*').eq('vehicle_id', vehicleId).then(function(res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }
  var db = getLocalMockDb();
  var list = (db.reminders || []).filter(function(r) { return String(r.vehicle_id) === String(vehicleId); });
  return Promise.resolve(list);
}

function loadReminderView() {
  showSpinner(true, 30, "Tải danh sách nhắc việc...");
  fetchReminders(AppState.currentVehicleId).then(function(logs) {
    renderReminderHTML(logs);
    showSpinner(false);
  });
}

function renderReminderHTML(logs) {
  var view = document.getElementById("app-view");
  if (!view) return;
  var listHtml = "";

  if (!logs || logs.length === 0) {
    listHtml = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">Chưa có nhắc nhở nào.</div>`;
  } else {
    logs.forEach(function(r) {
      listHtml += `
        <div class="card">
          <div class="card-header">
            <div class="card-title">⏰ ${r.title}</div>
            <span class="badge ${r.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}">${r.status === 'COMPLETED' ? '✓ Đã xong' : '🟢 Đang theo dõi'}</span>
          </div>
          <div style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 8px;">
            ${r.target_odometer > 0 ? 'Nhắc khi tới số Km: <strong>' + formatVNDClient(r.target_odometer).replace(' ₫','') + ' km</strong>' : ''} ${r.target_date ? '| Ngày hạn: ' + r.target_date : ''}
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px;">
            <button class="btn btn-danger btn-sm" onclick="deleteReminderConfirm('${r.id}')">🗑️ Xóa</button>
          </div>
        </div>
      `;
    });
  }

  view.innerHTML = `
    <div class="container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 1.2rem; font-weight: 800;">⏰ DANH SÁCH NHẮC VIỆC</h2>
        <button class="btn btn-primary" style="width: auto; padding: 8px 14px;" onclick="openReminderModal()">+ Thêm nhắc việc</button>
      </div>
      ${listHtml}
    </div>
  `;
}

function openReminderModal() {
  var form = document.getElementById("form-reminder");
  if (form) {
    form.reset();
    document.getElementById("rem-vehicle-id").value = AppState.currentVehicleId;
  }
  openModal("modal-reminder");
}

function saveReminderSubmit(event) {
  event.preventDefault();
  var data = {
    vehicle_id: document.getElementById("rem-vehicle-id").value || AppState.currentVehicleId,
    user_id: AppState.currentUser ? AppState.currentUser.id : null,
    title: document.getElementById("rem-title").value,
    target_odometer: Number(document.getElementById("rem-target-odo").value) || 0,
    target_date: document.getElementById("rem-target-date").value || null,
    status: 'PENDING'
  };

  showSpinner(true, 40, "Đang lưu lịch nhắc việc...");
  saveReminderApi(data).then(function() {
    showToast("🎉 Lưu lịch nhắc việc thành công!");
    closeModal("modal-reminder");
    loadReminderView();
  });
}

function saveReminderApi(data) {
  if (AppState.supabase) {
    return AppState.supabase.from('reminders').insert([data]);
  }
  var db = getLocalMockDb();
  data.id = "REM-" + Date.now();
  db.reminders.push(data);
  saveLocalMockDb(db);
  return Promise.resolve();
}

function deleteReminderConfirm(id) {
  if (confirm("Xóa lịch nhắc việc này?")) {
    showSpinner(true, 40, "Đang xóa...");
    deleteReminderApi(id).then(function() {
      showToast("Đã xóa nhắc việc.");
      loadReminderView();
    });
  }
}

function deleteReminderApi(id) {
  if (AppState.supabase) {
    return AppState.supabase.from('reminders').delete().eq('id', id);
  }
  var db = getLocalMockDb();
  db.reminders = (db.reminders || []).filter(function(r) { return String(r.id) !== String(id); });
  saveLocalMockDb(db);
  return Promise.resolve();
}

/* ==========================================================================
   REPORTS & CHARTS & EXCEL EXPORT
   ========================================================================== */
function loadReportView() {
  showSpinner(true, 20, "Tải tổng hợp báo cáo chi phí...");

  Promise.all([
    fetchFuelLogs(AppState.currentVehicleId),
    fetchMaintenanceLogs(AppState.currentVehicleId),
    fetchExpenses(AppState.currentVehicleId)
  ]).then(function(results) {
    var fuels = results[0] || [];
    var mnts = results[1] || [];
    var exps = results[2] || [];

    var totalFuel = fuels.reduce(function(acc, x) { return acc + (Number(x.total_amount) || 0); }, 0);
    var totalMnt = mnts.reduce(function(acc, x) { return acc + (Number(x.total_amount) || 0); }, 0);
    var totalExp = exps.reduce(function(acc, x) { return acc + (Number(x.amount) || 0); }, 0);
    var grandTotal = totalFuel + totalMnt + totalExp;

    var totalDist = 0;
    if (fuels.length > 1) {
      fuels.sort(function(a, b) { return (Number(a.odometer) || 0) - (Number(b.odometer) || 0); });
      totalDist = Number(fuels[fuels.length - 1].odometer) - Number(fuels[0].odometer);
    }

    var v = AppState.vehicles.find(function(x) { return x.id === AppState.currentVehicleId; });
    var overall = {
      vehicleName: v ? v.name + " (" + (v.license_plate || 'Chưa biển') + ")" : "Xe cá nhân",
      totalFuel: totalFuel, totalMaintenance: totalMnt, totalOtherExpenses: totalExp, grandTotal: grandTotal, totalDistance: totalDist, costPerKm: totalDist > 0 ? Math.round(grandTotal / totalDist) : 0
    };

    var allEvents = [];
    fuels.forEach(function(f) {
      allEvents.push({ type: 'FUEL', date: f.date, odometer: Number(f.odometer) || 0, title: '⛽ Đổ xăng: ' + f.liters + ' L', amount: Number(f.total_amount) || 0, sub: f.station ? 'Trạm: ' + f.station : '' });
    });
    mnts.forEach(function(m) {
      allEvents.push({ type: 'MAINTENANCE', date: m.date, odometer: Number(m.odometer) || 0, title: '🔧 Bảo dưỡng: ' + m.category, amount: Number(m.total_amount) || 0, sub: m.garage ? 'Garage: ' + m.garage : (m.description || '') });
    });
    exps.forEach(function(e) {
      allEvents.push({ type: 'EXPENSE', date: e.date, odometer: Number(e.odometer) || 0, title: '💰 Chi phí: ' + e.category, amount: Number(e.amount) || 0, sub: e.description || '' });
    });

    allEvents.sort(function(a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); });

    renderReportHTML(overall, allEvents);
    showSpinner(false);
  });
}

function renderReportHTML(overall, allEvents) {
  var view = document.getElementById("app-view");
  if (!view) return;
  window.currentHistoryLogs = allEvents;

  var historyHtml = "";
  if (!allEvents || allEvents.length === 0) {
    historyHtml = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">Chưa có lịch sử giao dịch nào.</div>`;
  } else {
    allEvents.forEach(function(ev) {
      var badgeClass = ev.type === 'FUEL' ? 'badge-primary' : (ev.type === 'MAINTENANCE' ? 'badge-success' : 'badge-warning');
      historyHtml += `
        <div class="card" style="padding: 14px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 800; font-size: 0.95rem;">${ev.title}</div>
            <span class="badge ${badgeClass}">${ev.date}</span>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
            ${ev.sub} ${ev.odometer > 0 ? '| Odo: ' + formatVNDClient(ev.odometer).replace(' ₫','') + ' km' : ''}
          </div>
          <div style="text-align: right; font-weight: 900; font-size: 1.1rem; color: var(--primary); margin-top: 6px;">
            ${formatVNDClient(ev.amount)}
          </div>
        </div>
      `;
    });
  }

  view.innerHTML = `
    <div class="container">
      <div class="card" style="background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); color: #ffffff;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 1.2rem; font-weight: 800;">🚗 ${overall.vehicleName}</div>
            <div style="font-size: 0.85rem; opacity: 0.9;">Báo cáo tổng chi phí sở hữu</div>
          </div>
          <button class="btn btn-secondary" style="background: #ffffff; color: #0284c7; width: auto; font-weight: 800;" onclick="exportReportToExcel()">📥 XUẤT FILE EXCEL CHI PHÍ</button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; background: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 10px; text-align: center;">
          <div>
            <div style="font-size: 0.72rem; opacity: 0.8;">TỔNG XĂNG</div>
            <div style="font-weight: 900; font-size: 1.05rem;">${formatVNDClient(overall.totalFuel)}</div>
          </div>
          <div>
            <div style="font-size: 0.72rem; opacity: 0.8;">TỔNG BẢO DƯỠNG</div>
            <div style="font-weight: 900; font-size: 1.05rem;">${formatVNDClient(overall.totalMaintenance)}</div>
          </div>
          <div>
            <div style="font-size: 0.72rem; opacity: 0.8;">TỔNG CHI PHÍ KHÁC</div>
            <div style="font-weight: 900; font-size: 1.05rem;">${formatVNDClient(overall.totalOtherExpenses)}</div>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 12px;">
          <div style="font-weight: 800; font-size: 1.1rem;">TỔNG TẤT CẢ: ${formatVNDClient(overall.grandTotal)}</div>
          <div style="font-size: 0.85rem;">Quãng đường: <strong>${overall.totalDistance} km</strong></div>
        </div>
      </div>

      <div style="font-weight: 800; font-size: 1rem; margin-bottom: 12px; text-transform: uppercase;">📋 LỊCH SỬ GIAO DỊCH CHI TIẾT</div>
      ${historyHtml}
    </div>
  `;
}

function exportReportToExcel() {
  if (!window.currentHistoryLogs || window.currentHistoryLogs.length === 0) {
    showToast("Không có dữ liệu lịch sử để xuất Excel.");
    return;
  }
  var csvContent = "\uFEFF";
  csvContent += "Loai,Ngay,Odometer_km,Noi_Dung_Hang_Muc,So_Tien_VND,Chi_Tiet_Ghi_Chu\n";
  window.currentHistoryLogs.forEach(function(ev) {
    var typeStr = ev.type === 'FUEL' ? 'Đổ xăng' : (ev.type === 'MAINTENANCE' ? 'Bảo dưỡng' : 'Chi phí');
    var cleanTitle = (ev.title || "").replace(/"/g, '""');
    var cleanSub = (ev.sub || "").replace(/"/g, '""');
    csvContent += `"${typeStr}","${ev.date}","${ev.odometer || 0}","${cleanTitle}","${ev.amount || 0}","${cleanSub}"\n`;
  });
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "BaoCaoChiPhi_Supabase_" + getTodayISODate() + ".csv";
  a.click();
  showToast("🎉 Đã xuất file Excel / CSV chi phí thành công!");
}

/* ==========================================================================
   VEHICLE MANAGEMENT & PASSWORD & UTILS
   ========================================================================== */
function loadVehicleView() {
  var view = document.getElementById("app-view");
  if (!view) return;
  var vehicles = AppState.vehicles || [];
  var listHtml = "";

  vehicles.forEach(function(v) {
    listHtml += `
      <div class="card">
        <div class="card-header">
          <div class="card-title">🚗 ${v.name}</div>
          <span class="badge badge-success">${v.status || 'ACTIVE'}</span>
        </div>
        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">
          Biển số: <strong>${v.license_plate || 'Chưa đặt'}</strong> | Hãng: <strong>${v.brand || '-'}</strong> ${v.model || ''} (${v.year || '-'})
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Số km hiện tại</div>
            <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary);">${formatVNDClient(v.current_odometer).replace(' ₫', '')} km</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" style="width: auto; padding: 6px 12px; font-size: 0.82rem;" onclick="editVehicle('${v.id}')">✏️ Sửa</button>
            ${AppState.vehicles.length > 1 ? `<button class="btn btn-danger" style="width: auto; padding: 6px 12px; font-size: 0.82rem;" onclick="deleteVehicleConfirm('${v.id}')">🗑️ Xóa</button>` : ''}
          </div>
        </div>
      </div>
    `;
  });

  view.innerHTML = `
    <div class="container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 1.2rem; font-weight: 800;">🚗 Quản Lý Xe (Tối đa 5 xe)</h2>
        ${vehicles.length < 5 ? `<button class="btn btn-primary" style="width: auto; padding: 8px 14px;" onclick="openAddVehicleModal()">+ Thêm xe</button>` : ''}
      </div>
      ${listHtml}
    </div>
  `;
}

function openAddVehicleModal() {
  var form = document.getElementById("form-vehicle");
  if (form) { form.reset(); document.getElementById("vehicle-id").value = ""; }
  openModal("modal-vehicle");
}

function editVehicle(id) {
  var v = AppState.vehicles.find(function(x) { return x.id === id; });
  if (!v) return;
  document.getElementById("vehicle-id").value = v.id;
  document.getElementById("vehicle-name").value = v.name || "";
  document.getElementById("vehicle-plate").value = v.license_plate || "";
  document.getElementById("vehicle-brand").value = v.brand || "";
  document.getElementById("vehicle-model").value = v.model || "";
  document.getElementById("vehicle-year").value = v.year || "";
  document.getElementById("vehicle-fuel-type").value = v.fuel_type || "Xăng";
  document.getElementById("vehicle-curr-odo").value = v.current_odometer || 0;
  openModal("modal-vehicle");
}

function saveVehicleSubmit(event) {
  event.preventDefault();
  var id = document.getElementById("vehicle-id").value;
  var name = document.getElementById("vehicle-name").value.trim();

  if (!name) {
    showToast("❌ Vui lòng nhập tên xe!");
    return;
  }

  var data = {
    user_id: AppState.currentUser ? AppState.currentUser.id : null,
    name: name,
    license_plate: document.getElementById("vehicle-plate").value.trim(),
    brand: document.getElementById("vehicle-brand").value.trim(),
    model: document.getElementById("vehicle-model").value.trim(),
    year: document.getElementById("vehicle-year").value.trim(),
    fuel_type: document.getElementById("vehicle-fuel-type").value,
    current_odometer: Number(document.getElementById("vehicle-curr-odo").value) || 0
  };

  showSpinner(true, 40, "Đang lưu thông tin xe...");
  saveVehicleApi(id, data).then(function(savedItem) {
    closeModal("modal-vehicle");
    var userId = AppState.currentUser ? AppState.currentUser.id : null;
    return fetchVehicles(userId);
  }).then(function(vehicles) {
    AppState.vehicles = vehicles || [];
    renderVehicleSelector();
    if (AppState.vehicles.length > 0) {
      var targetV = id
        ? AppState.vehicles.find(function(v) { return String(v.id) === String(id); })
        : AppState.vehicles[AppState.vehicles.length - 1];
      AppState.currentVehicleId = targetV ? targetV.id : AppState.vehicles[0].id;
    }
    updateNavVisibility();
    refreshCurrentTab();
    showSpinner(false);
    showToast("🎉 Lưu thông tin xe thành công!");
  }).catch(function(err) {
    showSpinner(false);
    console.error("Save Vehicle Submit Error:", err);
    showToast("❌ Có lỗi xảy ra khi lưu xe!");
  });
}

function saveVehicleApi(id, data) {
  if (AppState.supabase) {
    var validUuid = (data.user_id && isValidUUID(data.user_id)) ? data.user_id : null;
    var payload = Object.assign({}, data);
    if (!validUuid) delete payload.user_id;

    var query = id
      ? AppState.supabase.from('vehicles').update(payload).eq('id', id)
      : AppState.supabase.from('vehicles').insert([payload]);

    return query.then(function(res) {
      if (res.error) {
        console.warn("Supabase save vehicle error, saving local:", res.error);
        return saveVehicleToLocal(id, data);
      }
      var savedObj = (res.data && res.data[0]) ? res.data[0] : data;
      saveVehicleToLocal(id, savedObj);
      return savedObj;
    }).catch(function(err) {
      console.warn("Supabase save vehicle exception, saving local:", err);
      return saveVehicleToLocal(id, data);
    });
  }
  return saveVehicleToLocal(id, data);
}

function saveVehicleToLocal(id, data) {
  var db = getLocalMockDb();
  if (!db.vehicles) db.vehicles = [];

  var vehicleId = id || data.id || ("VEH-" + Date.now());
  data.id = vehicleId;
  data.status = "ACTIVE";

  var idx = db.vehicles.findIndex(function(v) { return String(v.id) === String(vehicleId); });
  if (idx >= 0) db.vehicles[idx] = Object.assign({}, db.vehicles[idx], data);
  else db.vehicles.push(data);
  saveLocalMockDb(db);

  if (!AppState.vehicles) AppState.vehicles = [];
  var appIdx = AppState.vehicles.findIndex(function(v) { return String(v.id) === String(vehicleId); });
  if (appIdx >= 0) AppState.vehicles[appIdx] = Object.assign({}, AppState.vehicles[appIdx], data);
  else AppState.vehicles.push(data);

  return Promise.resolve(data);
}

function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
}

function updateVehicleOdometerApi(vehicleId, newOdometer) {
  if (AppState.supabase) {
    return AppState.supabase.from('vehicles').update({ current_odometer: newOdometer }).eq('id', vehicleId);
  }
  var db = getLocalMockDb();
  var v = db.vehicles.find(function(x) { return x.id === vehicleId; });
  if (v) { v.current_odometer = newOdometer; saveLocalMockDb(db); }
  return Promise.resolve();
}

function deleteVehicleConfirm(id) {
  if (confirm("Bạn chắc chắn muốn xóa xe này?")) {
    showSpinner(true, 40, "Đang xóa...");
    deleteVehicleApi(id).then(function() {
      showToast("Đã xóa xe.");
      return fetchVehicles(AppState.currentUser.id);
    }).then(function(vehicles) {
      AppState.vehicles = vehicles;
      if (vehicles.length > 0) AppState.currentVehicleId = vehicles[0].id;
      renderVehicleSelector();
      refreshCurrentTab();
      showSpinner(false);
    });
  }
}

function deleteVehicleApi(id) {
  if (AppState.supabase) {
    return AppState.supabase.from('vehicles').delete().eq('id', id);
  }
  var db = getLocalMockDb();
  db.vehicles = (db.vehicles || []).filter(function(v) { return String(v.id) !== String(id); });
  saveLocalMockDb(db);
  return Promise.resolve();
}

function openChangePasswordModal() {
  var form = document.getElementById("form-change-password");
  if (form) form.reset();
  openModal("modal-change-password");
}

function savePasswordSubmit(event) {
  event.preventDefault();
  var newPass = document.getElementById("new-password").value;
  var confirmPass = document.getElementById("confirm-password").value;
  if (newPass !== confirmPass) {
    showToast("❌ Mật khẩu xác nhận không trùng khớp!");
    return;
  }

  showToast("🎉 Đổi mật khẩu thành công!");
  closeModal("modal-change-password");
}

/* ==========================================================================
   USER MANAGEMENT FUNCTIONS (ADMIN MODAL & ACTIONS)
   ========================================================================== */
function openAddUserModal() {
  var uId = document.getElementById("user-id");
  var uName = document.getElementById("user-name");
  var uEmail = document.getElementById("user-email");
  var uPass = document.getElementById("user-password");
  var uRole = document.getElementById("user-role");

  if (uId) uId.value = "";
  if (uName) uName.value = "";
  if (uEmail) uEmail.value = "";
  if (uPass) uPass.value = "123456";
  if (uRole) uRole.value = "USER";

  populateAssignedVehiclesSelect("ALL");
  var title = document.getElementById("modal-user-title");
  if (title) title.textContent = "➕ Thêm Tài Khoản Người Dùng Mới";
  openModal("modal-user");
}

function editUserClick(userId) {
  var u = (AppState.users || []).find(function(x) { return String(x.id) === String(userId); });
  if (!u) return;

  var uId = document.getElementById("user-id");
  var uName = document.getElementById("user-name");
  var uEmail = document.getElementById("user-email");
  var uPass = document.getElementById("user-password");
  var uRole = document.getElementById("user-role");

  if (uId) uId.value = u.id;
  if (uName) uName.value = u.name || "";
  if (uEmail) uEmail.value = u.email || "";
  if (uPass) uPass.value = u.password || "123456";
  if (uRole) uRole.value = u.role || "USER";

  populateAssignedVehiclesSelect(u.assigned_vehicles || "ALL");
  var title = document.getElementById("modal-user-title");
  if (title) title.textContent = "✏️ Cập Nhật Tài Khoản Người Dùng";
  openModal("modal-user");
}

function populateAssignedVehiclesSelect(selectedValue) {
  var select = document.getElementById("user-assigned-vehicles");
  if (!select) return;
  select.innerHTML = '<option value="ALL">Tất cả các xe (ALL)</option>';
  
  (AppState.vehicles || []).forEach(function(v) {
    var opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.name + " (" + (v.license_plate || v.brand || 'Xe') + ")";
    select.appendChild(opt);
  });

  if (selectedValue) {
    select.value = selectedValue;
  }
}

function saveUserSubmit(event) {
  event.preventDefault();
  var id = document.getElementById("user-id").value;
  var name = document.getElementById("user-name").value.trim();
  var email = document.getElementById("user-email").value.trim();
  var password = document.getElementById("user-password").value.trim();
  var role = document.getElementById("user-role").value;
  var assignedVehicles = document.getElementById("user-assigned-vehicles").value;

  if (!name) {
    showToast("❌ Vui lòng nhập Tên đăng nhập / Họ tên!");
    return;
  }
  if (!password) {
    showToast("❌ Vui lòng nhập Mật khẩu!");
    return;
  }

  showSpinner(true, 30, "Đang lưu tài khoản...");

  var isEdit = !!id;
  var targetId = isEdit ? id : generateUUID();

  var userObj = {
    id: targetId,
    name: name,
    username: name,
    email: email || (name + "@local"),
    password: password,
    role: role,
    assigned_vehicles: assignedVehicles
  };

  updateUserInLocalState(targetId, userObj, isEdit);

  var syncPromise = Promise.resolve();
  if (AppState.supabase) {
    var profilePayload = {
      id: targetId,
      name: name,
      username: name,
      password: password,
      email: email || (name + "@local"),
      role: role,
      assigned_vehicles: assignedVehicles
    };

    var query = isEdit
      ? AppState.supabase.from('profiles').update(profilePayload).eq('id', targetId)
      : AppState.supabase.from('profiles').insert([profilePayload]);

    syncPromise = query.then(function(res) {
      if (res.error) {
        console.warn("Supabase profile save error, trying minimal payload:", res.error);
        var fallbackPayload = {
          id: targetId,
          name: name,
          email: email || (name + "@local"),
          role: role,
          assigned_vehicles: assignedVehicles
        };
        var fbQuery = isEdit
          ? AppState.supabase.from('profiles').update(fallbackPayload).eq('id', targetId)
          : AppState.supabase.from('profiles').insert([fallbackPayload]);
        return fbQuery;
      }
      return res;
    }).catch(function(err) {
      console.warn("Supabase profile save exception:", err);
    });
  }

  syncPromise.finally(function() {
    showSpinner(false);
    closeModal("modal-user");
    showToast(isEdit ? "🎉 Đã cập nhật tài khoản thành công!" : "🎉 Đã thêm tài khoản mới thành công!");
    renderUserSelector();
    renderDashboardView();
  });
}

function updateUserInLocalState(targetId, userObj, isEdit) {
  if (!AppState.users) AppState.users = [];
  if (isEdit) {
    var idx = AppState.users.findIndex(function(x) { return String(x.id) === String(targetId); });
    if (idx !== -1) AppState.users[idx] = userObj;
    else AppState.users.push(userObj);
  } else {
    AppState.users.push(userObj);
  }

  var db = getLocalMockDb();
  if (!db.users) db.users = [];
  if (isEdit) {
    var mIdx = db.users.findIndex(function(x) { return String(x.id) === String(targetId); });
    if (mIdx !== -1) db.users[mIdx] = userObj;
    else db.users.push(userObj);
  } else {
    db.users.push(userObj);
  }
  saveLocalMockDb(db);
}

function deleteUserClick(userId) {
  var u = (AppState.users || []).find(function(x) { return String(x.id) === String(userId); });
  if (!u) return;

  if (u.role === 'ADMIN' && (AppState.currentUser && String(u.id) === String(AppState.currentUser.id))) {
    showToast("⚠️ Không thể xóa tài khoản Quản Trị Viên đang sử dụng!");
    return;
  }

  if (!confirm("Bạn có chắc chắn muốn xóa tài khoản '" + u.name + "' không?")) {
    return;
  }

  showSpinner(true, 30, "Đang xóa tài khoản...");

  var promise = AppState.supabase
    ? AppState.supabase.from('profiles').delete().eq('id', userId)
    : Promise.resolve();

  promise.then(function() {
    deleteUserFromLocalState(userId);
    showSpinner(false);
    showToast("🗑️ Đã xóa tài khoản thành công!");
    renderUserSelector();
    renderDashboardView();
  }).catch(function(err) {
    showSpinner(false);
    console.warn("Delete User Warning:", err);
    deleteUserFromLocalState(userId);
    showToast("🗑️ Đã xóa tài khoản!");
    renderUserSelector();
    renderDashboardView();
  });
}

function deleteUserFromLocalState(userId) {
  AppState.users = (AppState.users || []).filter(function(x) { return String(x.id) !== String(userId); });
  var db = getLocalMockDb();
  if (db.users) {
    db.users = db.users.filter(function(x) { return String(x.id) !== String(userId); });
    saveLocalMockDb(db);
  }
}

function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function openModal(modalId) {
  var el = document.getElementById(modalId);
  if (el) el.classList.add("active");
}

function closeModal(modalId) {
  var el = document.getElementById(modalId);
  if (el) el.classList.remove("active");
}

function formatVNDClient(num) {
  var val = Math.round(Number(num) || 0);
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " ₫";
}

function getTodayISODate() {
  var d = new Date();
  var day = ("0" + d.getDate()).slice(-2);
  var month = ("0" + (d.getMonth() + 1)).slice(-2);
  return d.getFullYear() + "-" + month + "-" + day;
}
