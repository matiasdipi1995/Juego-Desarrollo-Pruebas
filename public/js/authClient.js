document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const authError = document.getElementById('auth-error');
    
    const showRegisterBtn = document.getElementById('show-register');
    const showLoginBtn = document.getElementById('show-login');
    const authTitle = document.getElementById('auth-title');

    document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

    // Si ya existe sesión, saltar directamente al menú
    if (token && usuario.role !== 'admin') {
        const authModal = document.getElementById('auth-container');
        const menuScreen = document.getElementById('menu-screen');

        if (authModal) authModal.style.display = 'none';
        if (menuScreen) menuScreen.style.display = 'block';
    }
});
    // Cambiar entre Login y Registro
    if (showRegisterBtn) {
        showRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
            authTitle.innerText = 'Crear Cuenta';
            if (authError) authError.style.display = 'none';
        });
    }

    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.style.display = 'none';
            loginForm.style.display = 'block';
            authTitle.innerText = 'Iniciar Sesión';
            if (authError) authError.style.display = 'none';
        });
    }

   // 1. MANEJAR INICIO DE SESIÓN EN LA MISMA PÁGINA
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al iniciar sesión');
            }

            // Guardar token y datos del usuario
            localStorage.setItem('token', data.token);
            localStorage.setItem('usuario', JSON.stringify(data.usuario));

            // Si es ADMIN, lo mandamos a su panel
            if (data.usuario.role === 'admin') {
                window.location.href = 'admin.html';
                return;
            }

            // --- JUGADOR NORMAL (OCULTAR LOGIN Y MOSTRAR MENÚ) ---
            const authModal = document.getElementById('auth-container');
            const menuScreen = document.getElementById('menu-screen');

            if (authModal) {
                authModal.classList.remove('active');
                authModal.style.display = 'none'; // Oculta la tarjeta de login
            }

            if (menuScreen) {
                menuScreen.style.display = 'block'; // Muestra el menú de modos de juego
                menuScreen.classList.add('active');
            }

            // Opcional: Autocompletar el nombre de usuario en los inputs de los modales
            const usernameInput = document.getElementById('username');
            const tournamentUserInput = document.getElementById('tournament-username');
            const specialEventUserInput = document.getElementById('special-event-username');

            if (usernameInput) usernameInput.value = data.usuario.username;
            if (tournamentUserInput) tournamentUserInput.value = data.usuario.username;
            if (specialEventUserInput) specialEventUserInput.value = data.usuario.username;

        } catch (err) {
            if (authError) {
                authError.innerText = err.message;
                authError.style.display = 'block';
            }
        }
    });
}

    // 2. MANEJAR REGISTRO
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('reg-username').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Error al registrar usuario');
                }

                alert('¡Cuenta creada exitosamente! Ahora inicia sesión.');
                // Volver a la vista de Login
                registerForm.style.display = 'none';
                loginForm.style.display = 'block';
                authTitle.innerText = 'Iniciar Sesión';

            } catch (err) {
                if (authError) {
                    authError.innerText = err.message;
                    authError.style.display = 'block';
                }
            }
        });
    }
});
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  
  // Si venimos de local_game.html o la URL trae "?screen=menu"
  if (urlParams.get('screen') === 'menu') {
    const loginScreen = document.getElementById('login-screen'); // Ajusta con el ID de tu pantalla de login
    const menuScreen = document.getElementById('menu-screen');   // Ajusta con el ID de tu menú de modos

    if (loginScreen && menuScreen) {
      loginScreen.classList.remove('active');
      loginScreen.style.display = 'none';

      menuScreen.classList.add('active');
      menuScreen.style.display = 'block';
    }
  }
});
// FUNCIÓN GLOBAL PARA CERRAR SESIÓN
function logout() {
    // 1. Eliminar datos guardados en LocalStorage
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');

    // 2. Ocultar el menú del juego
    const menuScreen = document.getElementById('menu-screen');
    if (menuScreen) {
        menuScreen.style.display = 'none';
        menuScreen.classList.remove('active');
    }

    // 3. Mostrar nuevamente el modal de autenticación
    const authModal = document.getElementById('auth-container');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const authTitle = document.getElementById('auth-title');

    if (authModal) {
        authModal.style.display = 'flex';
        authModal.classList.add('active');
    }

    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
    if (authTitle) authTitle.innerText = 'Iniciar Sesión';

    // 4. Limpiar los campos del formulario de login
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    if (emailInput) emailInput.value = '';
    if (passInput) passInput.value = '';
}