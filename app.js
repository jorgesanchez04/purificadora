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
  setDoc,
  updateDoc,
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

// Lista de correos fijos autorizados como Administradores
const ADMIN_EMAILS = [
  "jesus181401@gmail.com",
  "pinguinotext10@gmail.com"
];

// Artículos base que se crean automáticamente si la colección "products" está vacía
const DEFAULT_PRODUCTS = [
  { name: "Planta", price: 11, description: "Precio base directo", channel: "planta", color: "planta", order: 1 },
  { name: "Mayoreo / Ruta 1", price: 17, description: "Tarifa preferencial ruta", channel: "ruta", color: "ruta1", order: 2 },
  { name: "Ruta 2", price: 18, description: "Tarifa intermedia ruta", channel: "ruta", color: "ruta2", order: 3 },
  { name: "Menudeo / Ruta 3", price: 20, description: "Precio público en ruta", channel: "ruta", color: "menudeo", order: 4 }
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// =========================================================================
// 2. ESTADO GLOBAL DE LA APLICACIÓN
// =========================================================================
let currentUser = null;
const authorizedAdminEmails = ADMIN_EMAILS.map((email) => email.toLowerCase().trim());
let cart = [];
let allProducts = [];
let allSales = [];
let allExpenses = [];
let allUsers = [];
let currentPeriod = "today";
let editingSaleItems = [];
let seededDefaultProducts = false;

// Desuscriptores de listeners en tiempo real
let unsubUserStatus = null;
let unsubProducts = null;
let unsubSales = null;
let unsubExpenses = null;
let unsubAllUsers = null;

// Instancias de gráficas Chart.js
let trendChartInstance = null;
let avgTicketChartInstance = null;
let plantRoutesChartInstance = null;
let expensesRoutesChartInstance = null;

// =========================================================================
// 3. ELEMENTOS DEL DOM
// =========================================================================
const loginScreen = document.getElementById("login-screen");
const pendingScreen = document.getElementById("pending-screen");
const appScreen = document.getElementById("app-screen");
const btnGoogleLogin = document.getElementById("btn-google-login");
const btnLogout = document.getElementById("btn-logout");
const btnPendingLogout = document.getElementById("btn-pending-logout");
const loginError = document.getElementById("login-error");

const cartContainer = document.getElementById("cart-items-container");
const cartTotalUnitsEl = document.getElementById("cart-total-units");
const cartTotalAmountEl = document.getElementById("cart-total-amount");
const btnSubmitSale = document.getElementById("btn-submit-sale");
const btnClearCart = document.getElementById("btn-clear-cart");
const saleNoteInput = document.getElementById("sale-note");

// =========================================================================
// 4. AUTENTICACIÓN Y CONTROL DE APROBACIÓN DE USUARIOS
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

function cleanupListeners() {
  if (unsubUserStatus) { unsubUserStatus(); unsubUserStatus = null; }
  if (unsubProducts) { unsubProducts(); unsubProducts = null; }
  if (unsubSales) { unsubSales(); unsubSales = null; }
  if (unsubExpenses) { unsubExpenses(); unsubExpenses = null; }
  if (unsubAllUsers) { unsubAllUsers(); unsubAllUsers = null; }
}

const handleSignOut = () => {
  cleanupListeners();
  signOut(auth);
};

btnLogout.addEventListener("click", handleSignOut);
if (btnPendingLogout) btnPendingLogout.addEventListener("click", handleSignOut);

onAuthStateChanged(auth, (user) => {
  cleanupListeners();

  if (!user) {
    currentUser = null;
    appScreen.classList.add("hidden");
    if (pendingScreen) pendingScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    return;
  }

  currentUser = user;
  const emailLower = user.email.toLowerCase().trim();

  if (isUserAdmin()) {
    enterAuthorizedApp(user);
    return;
  }

  const userDocRef = doc(db, "users", emailLower);
  unsubUserStatus = onSnapshot(
    userDocRef,
    async (docSnap) => {
      if (!docSnap.exists()) {
        try {
          await setDoc(userDocRef, {
            email: emailLower,
            displayName: user.displayName || "Operador",
            photoURL: user.photoURL || "",
            status: "pending",
            requestedAt: serverTimestamp(),
            clientTimestamp: Date.now()
          });
        } catch (err) {
          console.error("Error al registrar solicitud:", err);
        }
        showPendingScreen(emailLower);
        return;
      }

      const userData = docSnap.data();
      if (userData.status === "approved") {
        enterAuthorizedApp(user);
      } else {
        if (unsubSales) { unsubSales(); unsubSales = null; }
        if (unsubProducts) { unsubProducts(); unsubProducts = null; }
        showPendingScreen(emailLower);
      }
    },
    (err) => {
      console.error("Error verificando permiso de usuario:", err);
      showPendingScreen(emailLower);
    }
  );
});

function showPendingScreen(email) {
  loginScreen.classList.add("hidden");
  appScreen.classList.add("hidden");
  if (pendingScreen) {
    document.getElementById("pending-user-email").textContent = email;
    pendingScreen.classList.remove("hidden");
  }
}

function enterAuthorizedApp(user) {
  document.getElementById("user-name").textContent = user.displayName || "Operador";
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("user-photo").src = user.photoURL || "https://via.placeholder.com/40";

  loginScreen.classList.add("hidden");
  if (pendingScreen) pendingScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  updateAdminAccessUI();
  if (!unsubProducts) listenToProducts();
  if (!unsubSales) listenToSales();

  if (isUserAdmin()) {
    if (!unsubExpenses) listenToExpenses();
    if (!unsubAllUsers) listenToUsers();
  }
}

// =========================================================================
// 5. VALIDACIÓN DE ADMINISTRADORES POR CORREOS FIJOS
// =========================================================================
function isUserAdmin() {
  return (
    currentUser &&
    authorizedAdminEmails.includes(currentUser.email.toLowerCase().trim())
  );
}

function updateAdminAccessUI() {
  const lockIcon = document.getElementById("admin-lock-icon");
  const deniedCard = document.getElementById("admin-denied");
  const adminPanel = document.getElementById("admin-panel");

  const deniedCurrentEl = document.getElementById("denied-current-email");
  const deniedAdminEl = document.getElementById("denied-admin-email");

  if (deniedCurrentEl) deniedCurrentEl.textContent = currentUser?.email || "";
  if (deniedAdminEl) deniedAdminEl.textContent = authorizedAdminEmails.join(" / ");

  if (isUserAdmin()) {
    lockIcon.textContent = "🔓";
    deniedCard.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    renderAdminDashboard();
    renderAdminProducts();
    renderUsersManagement();
  } else {
    lockIcon.textContent = "🔒";
    deniedCard.classList.remove("hidden");
    adminPanel.classList.add("hidden");
  }
}

// =========================================================================
// 6. NAVEGACIÓN ENTRE PESTAÑAS PRINCIPALES Y SUB-VENTANAS DE ADMIN
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

document.querySelectorAll(".admin-subtab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-subtab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".admin-subtab-content").forEach((c) => c.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById(`admin-sub-${btn.dataset.subtab}`).classList.add("active");

    if (btn.dataset.subtab === "stats") {
      renderAdminDashboard();
    } else if (btn.dataset.subtab === "products") {
      renderAdminProducts();
    } else if (btn.dataset.subtab === "users") {
      renderUsersManagement();
    }
  });
});

// =========================================================================
// 7. CATÁLOGO DINÁMICO DE ARTÍCULOS Y TARIFAS (CRUD ADMINISTRADOR)
// =========================================================================
function listenToProducts() {
  const q = query(collection(db, "products"), orderBy("order", "asc"));
  unsubProducts = onSnapshot(q, async (snapshot) => {
    // Si aún no existen artículos en Firestore y es admin, sembrar los 4 base
    if (snapshot.empty && isUserAdmin() && !seededDefaultProducts) {
      seededDefaultProducts = true;
      for (const item of DEFAULT_PRODUCTS) {
        await addDoc(collection(db, "products"), {
          ...item,
          createdAt: serverTimestamp()
        });
      }
      return;
    }

    allProducts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPosProducts();
    renderAdminProducts();
    renderAdminDashboard();
  });
}

function renderPosProducts() {
  const grid = document.getElementById("pos-products-grid");
  if (!grid) return;

  if (allProducts.length === 0) {
    grid.innerHTML = `<p class="muted">No hay artículos configurados. Pide al administrador agregar tarifas.</p>`;
    return;
  }

  grid.innerHTML = allProducts
    .map((p) => {
      const colorClass = p.color || (p.channel === "planta" ? "planta" : "ruta1");
      const priceNum = Number(p.price) || 0;
      return `
        <button type="button" class="price-btn ${colorClass}" onclick="window.posSelectProduct('${p.id}')">
          <span class="tag">${p.name}</span>
          <strong class="amount">$${priceNum.toFixed(2)}</strong>
          <small>${p.description || (p.channel === "planta" ? "En Planta" : "En Ruta")}</small>
        </button>
      `;
    })
    .join("");
}

window.posSelectProduct = (productId) => {
  const prod = allProducts.find((p) => p.id === productId);
  if (!prod) return;
  addItemToCart(prod.name, Number(prod.price) || 0, 1);
};

function renderAdminProducts() {
  if (!isUserAdmin()) return;

  const countEl = document.getElementById("admin-products-count");
  if (countEl) countEl.textContent = `${allProducts.length} artículos`;

  const tbody = document.getElementById("admin-products-tbody");
  if (!tbody) return;

  if (allProducts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center muted">No hay artículos registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = allProducts
    .map((p) => {
      const badge =
        p.channel === "planta"
          ? `<span class="badge-planta">Planta</span>`
          : `<span class="badge-ruta">Ruta</span>`;
      return `
        <tr>
          <td><b>${p.name}</b></td>
          <td>${p.description || "-"}</td>
          <td>${badge}</td>
          <td><b>$${Number(p.price).toFixed(2)}</b></td>
          <td>
            <div class="action-btns">
              <button type="button" class="btn-edit" onclick="window.adminOpenEditProduct('${p.id}')">Editar</button>
              <button type="button" class="btn-del" onclick="window.adminDeleteProduct('${p.id}')">Quitar</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

document.getElementById("product-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isUserAdmin()) return;

  const name = document.getElementById("prod-name").value.trim();
  const price = parseFloat(document.getElementById("prod-price").value);
  const description = document.getElementById("prod-desc").value.trim();
  const channel = document.getElementById("prod-channel").value;
  const color = document.getElementById("prod-color").value;

  if (!name || isNaN(price) || price < 0) return;

  const nextOrder =
    allProducts.length > 0
      ? Math.max(...allProducts.map((p) => Number(p.order) || 0)) + 1
      : 1;

  try {
    await addDoc(collection(db, "products"), {
      name,
      price,
      description,
      channel,
      color,
      order: nextOrder,
      createdBy: currentUser.email.toLowerCase(),
      createdAt: serverTimestamp()
    });

    document.getElementById("prod-name").value = "";
    document.getElementById("prod-price").value = "";
    document.getElementById("prod-desc").value = "";
    showToast("✅ Artículo agregado al Punto de Venta");
  } catch (err) {
    alert("Error al agregar artículo: " + err.message);
  }
});

window.adminOpenEditProduct = (productId) => {
  if (!isUserAdmin()) return;
  const prod = allProducts.find((p) => p.id === productId);
  if (!prod) return;

  document.getElementById("edit-prod-id").value = prod.id;
  document.getElementById("edit-prod-name").value = prod.name || "";
  document.getElementById("edit-prod-price").value = prod.price ?? 0;
  document.getElementById("edit-prod-desc").value = prod.description || "";
  document.getElementById("edit-prod-channel").value = prod.channel || "ruta";
  document.getElementById("edit-prod-color").value = prod.color || "ruta1";

  document.getElementById("modal-edit-product").classList.remove("hidden");
};

document.getElementById("form-edit-product").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isUserAdmin()) return;

  const id = document.getElementById("edit-prod-id").value;
  const name = document.getElementById("edit-prod-name").value.trim();
  const price = parseFloat(document.getElementById("edit-prod-price").value);
  const description = document.getElementById("edit-prod-desc").value.trim();
  const channel = document.getElementById("edit-prod-channel").value;
  const color = document.getElementById("edit-prod-color").value;

  if (!id || !name || isNaN(price) || price < 0) return;

  try {
    await updateDoc(doc(db, "products", id), {
      name,
      price,
      description,
      channel,
      color
    });
    window.closeEditModals();
    showToast("✅ Artículo actualizado");
  } catch (err) {
    alert("Error al actualizar artículo: " + err.message);
  }
});

window.adminDeleteProduct = async (productId) => {
  if (!isUserAdmin()) return;
  const prod = allProducts.find((p) => p.id === productId);
  if (!confirm(`¿Quitar "${prod?.name || "este artículo"}" del Punto de Venta?`)) return;

  try {
    await deleteDoc(doc(db, "products", productId));
    showToast("🗑️ Artículo eliminado");
  } catch (err) {
    alert("Error al eliminar artículo: " + err.message);
  }
};

// =========================================================================
// 8. LÓGICA DEL PUNTO DE VENTA (CARRITO Y PRECIO ESPECIAL)
// =========================================================================
document.getElementById("special-price-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const labelInput = document.getElementById("special-label").value.trim();
  const price = parseFloat(document.getElementById("special-amount").value);
  const qty = parseInt(document.getElementById("special-qty").value, 10);

  if (isNaN(price) || price < 0 || isNaN(qty) || qty < 1) return;

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
        <small>Haz clic en un artículo de la izquierda para comenzar.</small>
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
// 9. ESCUCHA EN TIEMPO REAL DE VENTAS, GASTOS Y USUARIOS
// =========================================================================
function listenToSales() {
  const q = query(collection(db, "sales"), orderBy("clientTimestamp", "desc"));
  unsubSales = onSnapshot(q, (snapshot) => {
    allSales = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMyTodaySales();
    renderAdminDashboard();
  });
}

function listenToExpenses() {
  const q = query(collection(db, "expenses"), orderBy("clientTimestamp", "desc"));
  unsubExpenses = onSnapshot(q, (snapshot) => {
    allExpenses = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAdminDashboard();
  });
}

function listenToUsers() {
  const q = query(collection(db, "users"), orderBy("clientTimestamp", "desc"));
  unsubAllUsers = onSnapshot(q, (snapshot) => {
    allUsers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderUsersManagement();
  });
}

// =========================================================================
// 10. GESTIÓN DE REPARTIDORES (APROBAR SOLICITUDES / QUITAR ACCESO)
// =========================================================================
function renderUsersManagement() {
  if (!isUserAdmin()) return;

  const nonAdminUsers = allUsers.filter(
    (u) => !authorizedAdminEmails.includes((u.email || u.id).toLowerCase())
  );
  const pendingUsers = nonAdminUsers.filter((u) => u.status === "pending");
  const approvedUsers = nonAdminUsers.filter((u) => u.status === "approved");

  const navBadge = document.getElementById("pending-users-badge");
  if (navBadge) {
    navBadge.textContent = pendingUsers.length;
    navBadge.classList.toggle("hidden", pendingUsers.length === 0);
  }

  const pendingCountEl = document.getElementById("pending-users-count");
  const approvedCountEl = document.getElementById("approved-users-count");
  if (pendingCountEl) pendingCountEl.textContent = `${pendingUsers.length} pendientes`;
  if (approvedCountEl) approvedCountEl.textContent = `${approvedUsers.length} activos`;

  const pendingListEl = document.getElementById("pending-users-list");
  if (pendingListEl) {
    pendingListEl.innerHTML =
      pendingUsers
        .map((u) => {
          const email = u.email || u.id;
          return `
            <div class="user-access-card">
              <div class="user-access-info">
                <img src="${u.photoURL || "https://via.placeholder.com/40"}" alt="Foto" />
                <div>
                  <strong>${u.displayName || "Usuario"}</strong>
                  <small class="muted">${email}</small>
                </div>
              </div>
              <div class="action-btns">
                <button class="btn-approve" onclick="window.adminApproveUser('${email}')">✓ Aprobar</button>
                <button class="btn-del" onclick="window.adminRemoveUser('${email}', true)">✕ Rechazar</button>
              </div>
            </div>`;
        })
        .join("") || `<p class="muted">No hay solicitudes pendientes por aprobar.</p>`;
  }

  const approvedListEl = document.getElementById("approved-users-list");
  if (approvedListEl) {
    approvedListEl.innerHTML =
      approvedUsers
        .map((u) => {
          const email = u.email || u.id;
          return `
            <div class="user-access-card">
              <div class="user-access-info">
                <img src="${u.photoURL || "https://via.placeholder.com/40"}" alt="Foto" />
                <div>
                  <strong>${u.displayName || "Repartidor"}</strong>
                  <small class="muted">${email}</small>
                </div>
              </div>
              <button class="btn-del" onclick="window.adminRemoveUser('${email}', false)">Quitar acceso</button>
            </div>`;
        })
        .join("") || `<p class="muted">Aún no hay repartidores aprobados.</p>`;
  }
}

window.adminApproveUser = async (email) => {
  if (!isUserAdmin()) return;
  try {
    await updateDoc(doc(db, "users", email.toLowerCase()), {
      status: "approved",
      approvedBy: currentUser.email.toLowerCase(),
      approvedAt: serverTimestamp()
    });
    showToast(`✅ Acceso aprobado para ${email}`);
  } catch (err) {
    alert("Error al aprobar usuario: " + err.message);
  }
};

window.adminRemoveUser = async (email, isRejection = false) => {
  if (!isUserAdmin()) return;
  const msg = isRejection
    ? `¿Rechazar y eliminar la solicitud de ${email}?`
    : `¿Quitar el acceso al sistema a ${email}? Su sesión se bloqueará de inmediato.`;
  if (!confirm(msg)) return;

  try {
    await deleteDoc(doc(db, "users", email.toLowerCase()));
    showToast(isRejection ? "Solicitud rechazada" : "🚫 Acceso revocado al repartidor");
  } catch (err) {
    alert("Error al actualizar acceso: " + err.message);
  }
};

// =========================================================================
// 11. REGISTRO DE GASTOS Y VENTAS DEL OPERADOR HOY
// =========================================================================
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
// 12. PANEL DE ADMINISTRADOR (FILTROS, BALANCE, ESTADÍSTICAS Y CSV)
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

  renderStatisticsAndCharts(filteredSales, filteredExpenses, totalRevenue, totalExpenses, totalUnits);

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
              <div class="action-btns">
                <button class="btn-edit" onclick="window.adminOpenEditExpense('${ex.id}')">Editar</button>
                <button class="btn-del" onclick="window.adminDeleteExpense('${ex.id}')">Borrar</button>
              </div>
            </td>
          </tr>`;
      })
      .join("") || `<tr><td colspan="5" class="text-center muted">No hay gastos registrados en este período.</td></tr>`;

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
            <div class="action-btns">
              <button class="btn-edit" onclick="window.adminOpenEditSale('${s.id}')">Editar</button>
              <button class="btn-del" onclick="window.adminDeleteSale('${s.id}')">Borrar</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");
}

// =========================================================================
// 13. CÁLCULO DE INDICADORES Y GRÁFICAS (CHART.JS)
// =========================================================================
function detectItemChannel(itemCategory, saleNote = "") {
  const matchedProd = allProducts.find(
    (p) => p.name.toLowerCase() === (itemCategory || "").toLowerCase()
  );
  if (matchedProd) return matchedProd.channel;

  const catLower = (itemCategory || "").toLowerCase();
  if (catLower === "planta") return "planta";
  if (catLower.includes("ruta") || catLower.includes("mayoreo") || catLower.includes("menudeo")) {
    return "ruta";
  }
  return (saleNote || "").toLowerCase().includes("ruta") ? "ruta" : "planta";
}

function renderStatisticsAndCharts(sales, expenses, totalRevenue, totalExpenses, totalUnits) {
  const avgUnitPrice = totalUnits > 0 ? totalRevenue / totalUnits : 0;
  const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0;
  const avgTicketGlobal = sales.length > 0 ? totalRevenue / sales.length : 0;

  let plantaTicketsCount = 0;
  let plantaTicketsMoney = 0;
  let rutaTicketsCount = 0;
  let rutaTicketsMoney = 0;

  sales.forEach((s) => {
    let salePlantaMoney = 0;
    let saleRutaMoney = 0;
    let hasPlanta = false;
    let hasRuta = false;

    (s.items || []).forEach((item) => {
      const sub = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
      const channel = detectItemChannel(item.category, s.note);
      if (channel === "planta") {
        salePlantaMoney += sub;
        hasPlanta = true;
      } else {
        saleRutaMoney += sub;
        hasRuta = true;
      }
    });

    if (hasPlanta) {
      plantaTicketsCount += 1;
      plantaTicketsMoney += salePlantaMoney;
    }
    if (hasRuta) {
      rutaTicketsCount += 1;
      rutaTicketsMoney += saleRutaMoney;
    }
  });

  const avgTicketPlanta = plantaTicketsCount > 0 ? plantaTicketsMoney / plantaTicketsCount : 0;
  const avgTicketRuta = rutaTicketsCount > 0 ? rutaTicketsMoney / rutaTicketsCount : 0;

  document.getElementById("stat-avg-unit-price").textContent = `$${avgUnitPrice.toFixed(2)}`;

  const marginEl = document.getElementById("stat-profit-margin");
  marginEl.textContent = `${profitMargin.toFixed(1)}%`;
  marginEl.className = profitMargin >= 0 ? "text-success" : "text-danger";

  const plantaEl = document.getElementById("stat-avg-ticket-planta");
  const rutaEl = document.getElementById("stat-avg-ticket-ruta");
  if (plantaEl) plantaEl.textContent = `$${avgTicketPlanta.toFixed(2)}`;
  if (rutaEl) rutaEl.textContent = `$${avgTicketRuta.toFixed(2)}`;
  document.getElementById("stat-avg-ticket").textContent = `$${avgTicketGlobal.toFixed(2)}`;

  if (typeof Chart === "undefined") return;

  // Gráfica 1: Tendencia Ingresos vs Gastos
  const dailyMap = {};
  const formatBucket = (ts) => {
    const d = new Date(ts);
    if (currentPeriod === "today") {
      return `${String(d.getHours()).padStart(2, "0")}:00`;
    }
    return d.toLocaleDateString([], { day: "2-digit", month: "short" });
  };

  [...sales].reverse().forEach((s) => {
    const key = formatBucket(s.clientTimestamp);
    if (!dailyMap[key]) dailyMap[key] = { income: 0, expense: 0 };
    dailyMap[key].income += s.totalAmount || 0;
  });

  [...expenses].reverse().forEach((ex) => {
    const key = formatBucket(ex.clientTimestamp);
    if (!dailyMap[key]) dailyMap[key] = { income: 0, expense: 0 };
    dailyMap[key].expense += ex.amount || 0;
  });

  const trendLabels = Object.keys(dailyMap);
  const incomeData = trendLabels.map((k) => dailyMap[k].income);
  const expenseData = trendLabels.map((k) => dailyMap[k].expense);

  if (trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(document.getElementById("chart-trend"), {
    type: "bar",
    data: {
      labels: trendLabels.length ? trendLabels : ["Sin movimientos"],
      datasets: [
        {
          label: "Ingresos ($)",
          data: incomeData.length ? incomeData : [0],
          backgroundColor: "#16a34a",
          borderRadius: 6
        },
        {
          label: "Gastos ($)",
          data: expenseData.length ? expenseData : [0],
          backgroundColor: "#dc2626",
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true } }
    }
  });

  // Gráfica 2: Ticket Promedio (Planta vs Ruta)
  const avgTicketCanvas = document.getElementById("chart-avg-ticket");
  if (avgTicketCanvas) {
    if (avgTicketChartInstance) avgTicketChartInstance.destroy();
    avgTicketChartInstance = new Chart(avgTicketCanvas, {
      type: "bar",
      data: {
        labels: [
          `Ventas en Planta (${plantaTicketsCount} envíos)`,
          `Ventas en Ruta (${rutaTicketsCount} envíos)`
        ],
        datasets: [
          {
            label: "Ticket Promedio ($)",
            data: [avgTicketPlanta, avgTicketRuta],
            backgroundColor: ["#10b981", "#2563eb"],
            borderRadius: 8,
            barThickness: 48
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Promedio: $${Number(ctx.raw).toFixed(2)}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (val) => `$${val}` }
          }
        }
      }
    });
  }

  // Gráfica 3: Mezcla de Ventas por Artículo
  const mixMap = {};
  sales.forEach((s) => {
    (s.items || []).forEach((item) => {
      const sub = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
      mixMap[item.category] = (mixMap[item.category] || 0) + sub;
    });
  });

  const mixLabels = Object.keys(mixMap);
  const mixValues = mixLabels.map((k) => mixMap[k]);
  const hasMixData = mixValues.some((v) => v > 0);

  if (plantRoutesChartInstance) plantRoutesChartInstance.destroy();
  plantRoutesChartInstance = new Chart(document.getElementById("chart-plant-vs-routes"), {
    type: "doughnut",
    data: {
      labels: hasMixData ? mixLabels : ["Sin ventas"],
      datasets: [
        {
          data: hasMixData ? mixValues : [1],
          backgroundColor: hasMixData
            ? ["#10b981", "#2563eb", "#eab308", "#ec4899", "#8b5cf6", "#06b6d4", "#f97316"]
            : ["#e2e8f0"]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } }
    }
  });

  // Gráfica 4: Distribución de Gastos
  const expByCat = {};
  expenses.forEach((ex) => {
    expByCat[ex.category] = (expByCat[ex.category] || 0) + (ex.amount || 0);
  });

  const expLabels = Object.keys(expByCat);
  const expValues = expLabels.map((k) => expByCat[k]);

  if (expensesRoutesChartInstance) expensesRoutesChartInstance.destroy();
  expensesRoutesChartInstance = new Chart(document.getElementById("chart-expenses-routes"), {
    type: "doughnut",
    data: {
      labels: expLabels.length ? expLabels : ["Sin gastos"],
      datasets: [
        {
          data: expValues.length ? expValues : [1],
          backgroundColor: expValues.length
            ? ["#ef4444", "#f97316", "#f59e0b", "#3b82f6", "#14b8a6", "#64748b"]
            : ["#e2e8f0"]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } }
    }
  });
}

// =========================================================================
// 14. ELIMINACIÓN Y EDICIÓN DE VENTAS Y GASTOS (SOLO ADMINISTRADORES)
// =========================================================================
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

window.closeEditModals = () => {
  document.getElementById("modal-edit-product").classList.add("hidden");
  document.getElementById("modal-edit-expense").classList.add("hidden");
  document.getElementById("modal-edit-sale").classList.add("hidden");
};

window.adminOpenEditExpense = (expenseId) => {
  if (!isUserAdmin()) return;
  const expense = allExpenses.find((e) => e.id === expenseId);
  if (!expense) return;

  document.getElementById("edit-expense-id").value = expense.id;
  document.getElementById("edit-expense-concept").value = expense.concept || "";
  document.getElementById("edit-expense-category").value = expense.category || "Gasolina / Ruta";
  document.getElementById("edit-expense-amount").value = expense.amount || 0;

  document.getElementById("modal-edit-expense").classList.remove("hidden");
};

document.getElementById("form-edit-expense").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isUserAdmin()) return;

  const id = document.getElementById("edit-expense-id").value;
  const concept = document.getElementById("edit-expense-concept").value.trim();
  const category = document.getElementById("edit-expense-category").value;
  const amount = parseFloat(document.getElementById("edit-expense-amount").value);

  if (!id || !concept || isNaN(amount) || amount <= 0) return;

  try {
    await updateDoc(doc(db, "expenses", id), {
      concept,
      category,
      amount
    });
    window.closeEditModals();
    showToast("✅ Gasto actualizado correctamente");
  } catch (err) {
    alert("Error al actualizar gasto: " + err.message);
  }
});

window.adminOpenEditSale = (saleId) => {
  if (!isUserAdmin()) return;
  const sale = allSales.find((s) => s.id === saleId);
  if (!sale) return;

  document.getElementById("edit-sale-id").value = sale.id;
  document.getElementById("edit-sale-note").value = sale.note || "";
  editingSaleItems = (sale.items || []).map((i) => ({ ...i }));

  renderEditSaleItems();
  document.getElementById("modal-edit-sale").classList.remove("hidden");
};

function renderEditSaleItems() {
  const container = document.getElementById("edit-sale-items-list");
  let totalUnits = 0;
  let totalAmount = 0;

  container.innerHTML = editingSaleItems
    .map((item, idx) => {
      const qty = Number(item.qty) || 0;
      const price = Number(item.unitPrice) || 0;
      totalUnits += qty;
      totalAmount += qty * price;

      return `
        <div class="edit-item-row">
          <input type="text" value="${item.category}" onchange="window.updateEditSaleField(${idx}, 'category', this.value)" placeholder="Tarifa / Concepto" required />
          <input type="number" min="1" value="${qty}" oninput="window.updateEditSaleField(${idx}, 'qty', this.value)" title="Cantidad" required />
          <input type="number" step="0.01" min="0" value="${price}" oninput="window.updateEditSaleField(${idx}, 'unitPrice', this.value)" title="Precio unitario" required />
          <button type="button" class="btn-del" onclick="window.removeEditSaleItem(${idx})">✕</button>
        </div>
      `;
    })
    .join("");

  document.getElementById("edit-sale-total-units").textContent = totalUnits;
  document.getElementById("edit-sale-total-amount").textContent = `$${totalAmount.toFixed(2)}`;
}

window.updateEditSaleField = (idx, field, value) => {
  if (field === "category") {
    editingSaleItems[idx].category = value;
  } else {
    editingSaleItems[idx][field] = parseFloat(value) || 0;
  }
  const totalUnits = editingSaleItems.reduce((acc, i) => acc + (Number(i.qty) || 0), 0);
  const totalAmount = editingSaleItems.reduce(
    (acc, i) => acc + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0),
    0
  );
  document.getElementById("edit-sale-total-units").textContent = totalUnits;
  document.getElementById("edit-sale-total-amount").textContent = `$${totalAmount.toFixed(2)}`;
};

window.removeEditSaleItem = (idx) => {
  if (editingSaleItems.length <= 1) {
    return alert("La venta debe conservar al menos un producto. Si deseas anularla, usa el botón Borrar.");
  }
  editingSaleItems.splice(idx, 1);
  renderEditSaleItems();
};

document.getElementById("btn-add-edit-item").addEventListener("click", () => {
  const defaultProd = allProducts[0] || { name: "Planta", price: 11 };
  editingSaleItems.push({ category: defaultProd.name, unitPrice: Number(defaultProd.price), qty: 1 });
  renderEditSaleItems();
});

document.getElementById("form-edit-sale").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isUserAdmin()) return;

  const id = document.getElementById("edit-sale-id").value;
  const note = document.getElementById("edit-sale-note").value.trim();

  const cleanItems = editingSaleItems
    .map((i) => ({
      category: i.category.trim() || "Tarifa",
      qty: parseInt(i.qty, 10) || 0,
      unitPrice: parseFloat(i.unitPrice) || 0
    }))
    .filter((i) => i.qty > 0 && i.unitPrice >= 0);

  if (!id || cleanItems.length === 0) {
    return alert("Verifica que las cantidades sean mayores a 0.");
  }

  const totalUnits = cleanItems.reduce((acc, i) => acc + i.qty, 0);
  const totalAmount = cleanItems.reduce((acc, i) => acc + i.qty * i.unitPrice, 0);

  try {
    await updateDoc(doc(db, "sales", id), {
      items: cleanItems,
      totalUnits,
      totalAmount,
      note
    });
    window.closeEditModals();
    showToast("✅ Venta actualizada correctamente");
  } catch (err) {
    alert("Error al actualizar la venta: " + err.message);
  }
});

// =========================================================================
// 15. EXPORTAR REPORTE A CSV Y NOTIFICACIONES
// =========================================================================
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