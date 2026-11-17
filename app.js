import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// =========================================================================
// 1. CONFIGURACIÓN DE FIREBASE
// =========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCaYLz3916DtXsKH5YPLAJLaa5E0H5NYEY",
  authDomain: "purificadora-28bc0.firebaseapp.com",
  projectId: "purificadora-28bc0",
  storageBucket: "purificadora-28bc0.firebasestorage.app",
  messagingSenderId: "158957539658",
  appId: "1:158957539658:web:d694522b0dd1a9a7eaf1b3",
  measurementId: "G-NX9WBHR7Q6"
};

// Correo fijo autorizado como Administrador
const DEFAULT_ADMIN_EMAIL = "pinguinotext10@gmail.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// =========================================================================
// 2. ESTADO GLOBAL DE LA APLICACIÓN
// =========================================================================
let currentUser = null;
const authorizedAdminEmail = DEFAULT_ADMIN_EMAIL.toLowerCase().trim();
let cart = [];
let allSales = [];
let allExpenses = [];
let currentPeriod = "today";

// =========================================================================
// 3. ELEMENTOS DEL DOM
// =========================================================================
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const btnGoogleLogin = document.getElementById("btn-google-login");
const btnLogout = document.getElementById("btn-logout");
const loginError = document.getElementById("login-error");

const cartContainer = document.getElementById("cart-items-container");
const cartTotalUnitsEl = document.getElementById("cart-total-units");
const cartTotalAmountEl = document.getElementById("cart-total-amount");
const btnSubmitSale = document.getElementById("btn-submit-sale");
const btnClearCart = document.getElementById("btn-clear-cart");
const saleNoteInput = document.getElementById("sale-note");

// =========================================================================
// 4. AUTENTICACIÓN CON GOOGLE
// =========================================================================
btnGoogleLogin.addEventListener("click", async () => {
  loginError.classList.add("hidden");
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    loginError.textContent = "No se pudo iniciar sesión: " + error.message;
    loginError.classList.remove("hidden");
  }
});

btnLogout.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("user-name").textContent = user.displayName || "Operador";
    document.getElementById("user-email").textContent = user.email;
    document.getElementById("user-photo").src = user.photoURL || "https://via.placeholder.com/40";

    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");

    updateAdminAccessUI();
    listenToSales();
    if (isUserAdmin()) {
      listenToExpenses();
    }
  } else {
    currentUser = null;
    appScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
  }
});

// =========================================================================
// 5. VALIDACIÓN DEL ADMINISTRADOR POR CORREO FIJO
// =========================================================================
function isUserAdmin() {
  return currentUser && currentUser.email.toLowerCase() === authorizedAdminEmail;
}

function updateAdminAccessUI() {
  const lockIcon = document.getElementById("admin-lock-icon");
  const deniedCard = document.getElementById("admin-denied");
  const adminPanel = document.getElementById("admin-panel");

  const deniedCurrentEl = document.getElementById("denied-current-email");
  const deniedAdminEl = document.getElementById("denied-admin-email");

  if (deniedCurrentEl) deniedCurrentEl.textContent = currentUser?.email || "";
  if (deniedAdminEl) deniedAdminEl.textContent = authorizedAdminEmail;

  if (isUserAdmin()) {
    lockIcon.textContent = "🔓";
    deniedCard.classList.add("hidden");
    adminPanel.classList.remove("hidden");
  } else {
    lockIcon.textContent = "🔒";
    deniedCard.classList.remove("hidden");
    adminPanel.classList.add("hidden");
  }
}

// =========================================================================
// 6. NAVEGACIÓN ENTRE PESTAÑAS
// =========================================================================
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "admin") updateAdminAccessUI();
  });
});

// =========================================================================
// 7. LÓGICA DEL PUNTO DE VENTA (TARIFAS Y LISTA DE VENTA)
// =========================================================================
// Botones de tarifas fijas ($11, $17, $18, $20) - suman 1 unidad por clic
document.querySelectorAll(".price-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const category = btn.dataset.category;
    const price = parseFloat(btn.dataset.price);
    addItemToCart(category, price, 1);
  });
});

// Formulario de Precio Especial
document.getElementById("special-price-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const labelInput = document.getElementById("special-label").value.trim();
  const price = parseFloat(document.getElementById("special-amount").value);
  const qty = parseInt(document.getElementById("special-qty").value, 10);

  if (isNaN(price) || price <= 0 || isNaN(qty) || qty < 1) return;

  const category = labelInput ? `Especial (${labelInput})` : "Precio Especial";
  addItemToCart(category, price, qty);

  document.getElementById("special-label").value = "";
  document.getElementById("special-amount").value = "";
  document.getElementById("special-qty").value = "1";
});

function addItemToCart(category, unitPrice, qty) {
  const existingIndex = cart.findIndex(
    (item) => item.category === category && item.unitPrice === unitPrice
  );

  if (existingIndex >= 0) {
    cart[existingIndex].qty += qty;
  } else {
    cart.push({ category, unitPrice, qty });
  }
  renderCart();
}

function updateCartItemQty(index, delta) {
  cart[index].qty += delta;
  if (cart[index].qty <= 0) {
    cart.splice(index, 1);
  }
  renderCart();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  renderCart();
}

btnClearCart.addEventListener("click", () => {
  cart = [];
  renderCart();
});

function renderCart() {
  if (cart.length === 0) {
    cartContainer.innerHTML = `
      <div class="empty-state">
        <p>Aún no has agregado productos a esta venta.</p>
        <small>Haz clic en una tarifa de la izquierda para comenzar.</small>
      </div>`;
    cartTotalUnitsEl.textContent = "0";
    cartTotalAmountEl.textContent = "$0.00";
    btnSubmitSale.disabled = true;
    return;
  }

  let totalUnits = 0;
  let totalAmount = 0;

  cartContainer.innerHTML = cart
    .map((item, idx) => {
      const subtotal = item.qty * item.unitPrice;
      totalUnits += item.qty;
      totalAmount += subtotal;
      return `
        <div class="cart-item">
          <div class="cart-item-info">
            <strong>${item.category}</strong>
            <small>${item.qty} x $${item.unitPrice.toFixed(2)} = <b>$${subtotal.toFixed(2)}</b></small>
          </div>
          <div class="cart-item-controls">
            <button type="button" class="btn-qty" onclick="window.posChangeQty(${idx}, -1)">-</button>
            <span><b>${item.qty}</b></span>
            <button type="button" class="btn-qty" onclick="window.posChangeQty(${idx}, 1)">+</button>
            <button type="button" class="btn-del" onclick="window.posRemoveItem(${idx})">✕</button>
          </div>
        </div>
      `;
    })
    .join("");

  cartTotalUnitsEl.textContent = totalUnits;
  cartTotalAmountEl.textContent = `$${totalAmount.toFixed(2)}`;
  btnSubmitSale.disabled = false;
}

window.posChangeQty = updateCartItemQty;
window.posRemoveItem = removeCartItem;

// Enviar venta a Firestore ("Venta del día")
btnSubmitSale.addEventListener("click", async () => {
  if (cart.length === 0 || !currentUser) return;

  btnSubmitSale.disabled = true;
  btnSubmitSale.textContent = "Enviando...";

  const totalUnits = cart.reduce((acc, i) => acc + i.qty, 0);
  const totalAmount = cart.reduce((acc, i) => acc + i.qty * i.unitPrice, 0);

  try {
    await addDoc(collection(db, "sales"), {
      items: cart,
      totalUnits,
      totalAmount,
      note: saleNoteInput.value.trim(),
      sellerName: currentUser.displayName || "Operador",
      sellerEmail: currentUser.email.toLowerCase(),
      createdAt: serverTimestamp(),
      clientTimestamp: Date.now()
    });

    cart = [];
    saleNoteInput.value = "";
    renderCart();
    showToast("✅ Venta enviada al corte del día");
  } catch (err) {
    alert("Error al guardar la venta: " + err.message);
  } finally {
    btnSubmitSale.textContent = "Enviar a Venta del Día";
    btnSubmitSale.disabled = cart.length === 0;
  }
});

// =========================================================================
// 8. ESCUCHA EN TIEMPO REAL DE VENTAS Y GASTOS
// =========================================================================
function listenToSales() {
  const q = query(collection(db, "sales"), orderBy("clientTimestamp", "desc"));
  onSnapshot(q, (snapshot) => {
    allSales = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMyTodaySales();
    renderAdminDashboard();
  });
}

function listenToExpenses() {
  const q = query(collection(db, "expenses"), orderBy("clientTimestamp", "desc"));
  onSnapshot(q, (snapshot) => {
    allExpenses = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAdminDashboard();
  });
}

// Registrar nuevo gasto (Solo Administrador)
document.getElementById("expense-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isUserAdmin()) return;

  const concept = document.getElementById("expense-concept").value.trim();
  const category = document.getElementById("expense-category").value;
  const amount = parseFloat(document.getElementById("expense-amount").value);

  if (!concept || isNaN(amount) || amount <= 0) return;

  try {
    await addDoc(collection(db, "expenses"), {
      concept,
      category,
      amount,
      createdBy: currentUser.email.toLowerCase(),
      createdAt: serverTimestamp(),
      clientTimestamp: Date.now()
    });

    document.getElementById("expense-concept").value = "";
    document.getElementById("expense-amount").value = "";
    showToast("💸 Gasto registrado y descontado del balance");
  } catch (err) {
    alert("Error al registrar gasto: " + err.message);
  }
});

function getStartOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function renderMyTodaySales() {
  if (!currentUser) return;
  const startToday = getStartOfDay();
  const mySales = allSales.filter(
    (s) =>
      s.sellerEmail === currentUser.email.toLowerCase() &&
      (s.clientTimestamp || 0) >= startToday
  );

  let units = 0;
  let total = 0;
  const tbody = document.getElementById("my-sales-tbody");

  if (mySales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center muted">Aún no registras ventas hoy.</td></tr>`;
  } else {
    tbody.innerHTML = mySales
      .map((s) => {
        units += s.totalUnits || 0;
        total += s.totalAmount || 0;
        const time = new Date(s.clientTimestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        });
        const detail = (s.items || [])
          .map((i) => `${i.qty}x ${i.category} ($${i.unitPrice})`)
          .join(", ");
        return `
          <tr>
            <td>${time}</td>
            <td>${detail}</td>
            <td>${s.note || "-"}</td>
            <td>${s.totalUnits}</td>
            <td><b>$${Number(s.totalAmount).toFixed(2)}</b></td>
          </tr>`;
      })
      .join("");
  }

  document.getElementById("my-today-units").textContent = units;
  document.getElementById("my-today-total").textContent = `$${total.toFixed(2)}`;
}

// =========================================================================
// 9. PANEL DE ADMINISTRADOR (FILTROS, BALANCE, DESGLOSE Y CSV)
// =========================================================================
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentPeriod = btn.dataset.period;
    renderAdminDashboard();
  });
});

document.getElementById("btn-apply-dates").addEventListener("click", () => {
  document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
  currentPeriod = "custom";
  renderAdminDashboard();
});

function filterByPeriod(records) {
  const now = new Date();
  const startToday = getStartOfDay(now);

  return records.filter((item) => {
    const ts = item.clientTimestamp || 0;
    if (currentPeriod === "today") return ts >= startToday;
    if (currentPeriod === "week") return ts >= startToday - 6 * 24 * 60 * 60 * 1000;
    if (currentPeriod === "month") return ts >= new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    if (currentPeriod === "custom") {
      const startVal = document.getElementById("filter-start-date").value;
      const endVal = document.getElementById("filter-end-date").value;
      const startMs = startVal ? new Date(startVal + "T00:00:00").getTime() : 0;
      const endMs = endVal ? new Date(endVal + "T23:59:59").getTime() : Infinity;
      return ts >= startMs && ts <= endMs;
    }
    return true;
  });
}

function renderAdminDashboard() {
  if (!isUserAdmin()) return;

  const filteredSales = filterByPeriod(allSales);
  const filteredExpenses = filterByPeriod(allExpenses);

  let totalRevenue = 0;
  let totalUnits = 0;
  const categoryStats = {};
  const sellerStats = {};

  filteredSales.forEach((sale) => {
    totalRevenue += sale.totalAmount || 0;
    totalUnits += sale.totalUnits || 0;

    const seller = sale.sellerName || sale.sellerEmail;
    if (!sellerStats[seller]) sellerStats[seller] = { units: 0, money: 0 };
    sellerStats[seller].units += sale.totalUnits || 0;
    sellerStats[seller].money += sale.totalAmount || 0;

    (sale.items || []).forEach((item) => {
      const key = `${item.category} ($${item.unitPrice})`;
      if (!categoryStats[key]) categoryStats[key] = { units: 0, money: 0 };
      categoryStats[key].units += item.qty;
      categoryStats[key].money += item.qty * item.unitPrice;
    });
  });

  const totalExpenses = filteredExpenses.reduce((acc, exp) => acc + (exp.amount || 0), 0);
  const netBalance = totalRevenue - totalExpenses;

  document.getElementById("kpi-revenue").textContent = `$${totalRevenue.toFixed(2)}`;
  document.getElementById("kpi-expenses").textContent = `$${totalExpenses.toFixed(2)}`;

  const balanceEl = document.getElementById("kpi-balance");
  balanceEl.textContent = `${netBalance < 0 ? "-" : ""}$${Math.abs(netBalance).toFixed(2)}`;
  balanceEl.className = netBalance >= 0 ? "text-success" : "text-danger";

  document.getElementById("kpi-units").textContent = totalUnits;
  document.getElementById("kpi-tickets").textContent = filteredSales.length;
  document.getElementById("admin-record-count").textContent = `${filteredSales.length} ventas`;
  document.getElementById("admin-expense-count").textContent = `${filteredExpenses.length} gastos`;

  // Render desglose por tarifa
  const catContainer = document.getElementById("breakdown-categories");
  catContainer.innerHTML =
    Object.entries(categoryStats)
      .map(
        ([name, st]) => `
      <div class="breakdown-row">
        <span><b>${name}</b> (${st.units} uds.)</span>
        <strong>$${st.money.toFixed(2)}</strong>
      </div>`
      )
      .join("") || `<p class="muted">Sin datos en este período.</p>`;

  // Render desglose por vendedor
  const selContainer = document.getElementById("breakdown-sellers");
  selContainer.innerHTML =
    Object.entries(sellerStats)
      .map(
        ([name, st]) => `
      <div class="breakdown-row">
        <span><b>${name}</b> (${st.units} uds.)</span>
        <strong>$${st.money.toFixed(2)}</strong>
      </div>`
      )
      .join("") || `<p class="muted">Sin datos en este período.</p>`;

  // Tabla de gastos
  const expTbody = document.getElementById("admin-expenses-tbody");
  expTbody.innerHTML =
    filteredExpenses
      .map((ex) => {
        const dateStr = new Date(ex.clientTimestamp).toLocaleString([], {
          dateStyle: "short",
          timeStyle: "short"
        });
        return `
          <tr>
            <td>${dateStr}</td>
            <td><b>${ex.category}</b></td>
            <td>${ex.concept}</td>
            <td class="text-danger"><b>-$${Number(ex.amount).toFixed(2)}</b></td>
            <td>
              <button class="btn-del" onclick="window.adminDeleteExpense('${ex.id}')">Borrar</button>
            </td>
          </tr>`;
      })
      .join("") || `<tr><td colspan="5" class="text-center muted">No hay gastos registrados en este período.</td></tr>`;

  // Tabla general de ventas
  const tbody = document.getElementById("admin-sales-tbody");
  tbody.innerHTML = filteredSales
    .map((s) => {
      const dateStr = new Date(s.clientTimestamp).toLocaleString([], {
        dateStyle: "short",
        timeStyle: "short"
      });
      const detail = (s.items || [])
        .map((i) => `${i.qty}x ${i.category} ($${i.unitPrice})`)
        .join("<br>");
      return `
        <tr>
          <td>${dateStr}</td>
          <td>${s.sellerName}<br><small class="muted">${s.sellerEmail}</small></td>
          <td>${detail}</td>
          <td>${s.note || "-"}</td>
          <td>${s.totalUnits}</td>
          <td><b>$${Number(s.totalAmount).toFixed(2)}</b></td>
          <td>
            <button class="btn-del" onclick="window.adminDeleteSale('${s.id}')">Borrar</button>
          </td>
        </tr>`;
    })
    .join("");
}

window.adminDeleteSale = async (saleId) => {
  if (!isUserAdmin()) return;
  if (!confirm("¿Seguro que deseas eliminar este registro de venta?")) return;
  await deleteDoc(doc(db, "sales", saleId));
  showToast("Venta eliminada");
};

window.adminDeleteExpense = async (expenseId) => {
  if (!isUserAdmin()) return;
  if (!confirm("¿Seguro que deseas eliminar este gasto?")) return;
  await deleteDoc(doc(db, "expenses", expenseId));
  showToast("Gasto eliminado");
};

// Exportar reporte de ventas y gastos a CSV
document.getElementById("btn-export-csv").addEventListener("click", () => {
  const filteredSales = filterByPeriod(allSales);
  const filteredExpenses = filterByPeriod(allExpenses);
  if (!filteredSales.length && !filteredExpenses.length) {
    return alert("No hay movimientos para exportar en este filtro.");
  }

  const headers = ["Tipo", "Fecha", "Responsable / Categoría", "Detalle / Concepto", "Nota", "Unidades", "Monto"];
  const saleRows = filteredSales.map((s) => [
    `"INGRESO"`,
    `"${new Date(s.clientTimestamp).toLocaleString()}"`,
    `"${s.sellerName} (${s.sellerEmail})"`,
    `"${(s.items || []).map((i) => `${i.qty}x ${i.category} ($${i.unitPrice})`).join(" | ")}"`,
    `"${(s.note || "").replace(/"/g, '""')}"`,
    s.totalUnits,
    s.totalAmount.toFixed(2)
  ]);

  const expenseRows = filteredExpenses.map((ex) => [
    `"GASTO"`,
    `"${new Date(ex.clientTimestamp).toLocaleString()}"`,
    `"${ex.category}"`,
    `"${ex.concept.replace(/"/g, '""')}"`,
    `"-"`,
    0,
    (-ex.amount).toFixed(2)
  ]);

  const csvContent =
    "data:text/csv;charset=utf-8," +
    [headers.join(","), ...saleRows.map((r) => r.join(",")), ...expenseRows.map((r) => r.join(","))].join("\n");

  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", `balance_pos_${currentPeriod}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3000);
}