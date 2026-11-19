// public/js/authClient.js
const API_BASE = typeof URL_SERVER !== 'undefined'
  ? URL_SERVER
  : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3000'
      : 'https://juego-desarrollo-pruebas.onrender.com');

window.currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const showRegisterBtn = document.getElementById('show-register');
  const showLoginBtn = document.getElementById('show-login');
  const authTitle = document.getElementById('auth-title');
  const authError = document.getElementById('auth-error');

  function showError(msg) {
    if (!authError) return;
    authError.textContent = msg;
    authError.style.display = 'block';
  }

  function clearError() {
    if (!authError) return;
    authError.textContent = '';
    authError.style.display = 'none';
  }

  // Cambiar entre Login y Registro
  if (showRegisterBtn) {
    showRegisterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearError();
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
      if (authTitle) authTitle.textContent = 'Crear Cuenta';
    });
  }

  if (showLoginBtn) {
    showLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearError();
      registerForm.style.display = 'none';
      loginForm.style.display = 'block';
      if (authTitle) authTitle.textContent = 'Iniciar Sesión';
    });
  }

  // Enviar Login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      try {
        const res = await fetch(`${API_BASE}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) return showError(data.error || 'Error al iniciar sesión.');

        localStorage.setItem('token', data.token);
        onAuthSuccess(data.user);
      } catch (err) {
        showError('No se pudo conectar con el servidor.');
      }
    });
  }

  // Enviar Registro
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();
      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;

      try {
        const res = await fetch(`${API_BASE}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();

        if (!res.ok) return showError(data.error || 'Error al crear la cuenta.');

        localStorage.setItem('token', data.token);
        onAuthSuccess(data.user);
      } catch (err) {
        showError('No se pudo conectar con el servidor.');
      }
    });
  }

  // Validar sesión automáticamente al cargar la página
  checkSession();
});

async function checkSession() {
  const token = localStorage.getItem('token');
  if (!token) {
    showAuthModal();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      localStorage.removeItem('token');
      showAuthModal();
      return;
    }

    const data = await res.json();
    onAuthSuccess(data.user);
  } catch (err) {
    console.error('[AUTH] Error verificando sesión:', err);
    showAuthModal();
  }
}

function showAuthModal() {
  const authContainer = document.getElementById('auth-container');
  const introScreen = document.getElementById('intro-screen');
  const menuScreen = document.getElementById('menu-screen');

  if (introScreen) introScreen.classList.remove('active');
  if (menuScreen) menuScreen.classList.remove('active');
  if (authContainer) authContainer.style.display = 'flex';
}

function onAuthSuccess(user) {
  window.currentUser = user;

  const token = localStorage.getItem('token');
  if (typeof socket !== 'undefined' && token) {
    socket.auth = { token };
    socket.emit('authenticateSocket', { token });
  }
  
  const authContainer = document.getElementById('auth-container');
  const introScreen = document.getElementById('intro-screen');
  const menuScreen = document.getElementById('menu-screen');

  if (authContainer) authContainer.style.display = 'none';
  if (introScreen) introScreen.classList.remove('active');
  if (menuScreen) {
    menuScreen.style.display = 'flex';
    menuScreen.classList.add('active');
  }

  // Actualizar datos visibles del usuario en el menú
  const userDisplay = document.getElementById('menu-username');
  const coinsDisplay = document.getElementById('menu-coins');
  if (userDisplay) userDisplay.textContent = user.username;
  if (coinsDisplay) coinsDisplay.textContent = user.monedas;

  // Autocompletar inputs de nombre en los modales de 1v1, Torneo y Evento Especial
  ['username', 'tournament-username', 'special-event-username'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = user.username;
  });

  // Mostrar botón de Panel Admin solo si el usuario tiene rol admin
  const btnAdmin = document.getElementById('btn-admin-panel');
  if (btnAdmin) {
    btnAdmin.style.display = user.rol === 'admin' ? 'block' : 'none';
  }
}

window.logout = function() {
  if (confirm('¿Deseas cerrar tu sesión?')) {
    localStorage.removeItem('token');
    window.currentUser = null;
    window.location.reload();
  }
};