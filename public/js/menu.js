const ambientMusic = new Audio('sonido/sonidoMenu.wav');
ambientMusic.loop = true;
ambientMusic.volume = 0.20;

let audioStarted = false;

function startAmbientAudio() {
  if (!audioStarted) {
    ambientMusic.play().then(() => {
      audioStarted = true;
    }).catch(err => console.log("Esperando interacción del usuario para audio...", err));
  }
}

function stopAmbientAudio() {
  if (ambientMusic) {
    ambientMusic.pause();
    ambientMusic.currentTime = 0;
    audioStarted = false; // Permite que se pueda volver a activar al regresar al menú
  }
}

document.addEventListener('click', startAmbientAudio, { once: true });
document.addEventListener('touchstart', startAmbientAudio, { once: true });

// Entrar al menú desde la portada
function enterMenu() {
  startAmbientAudio();
  document.getElementById('intro-screen').classList.remove('active');
  document.getElementById('menu-screen').classList.add('active');
}

// Salir del menú (para ir al combate o cerrar)
function exitMenu() {
  stopAmbientAudio(); // Pausa la música de fondo
  document.getElementById('menu-screen').classList.remove('active'); // Quita el menú
  document.getElementById('free-play-modal').style.display = 'none'; // Cierra el modal 1v1 si estaba abierto
  document.getElementById('tournament-modal').style.display = 'none'; // Cierra el modal de torneo si estaba abierto
}

function startGame() {
  openFreePlayModal();
}

function startVsBot() {
  location.href = 'select_difficulty.html';
}

// Conexión Socket
// const socket = io();
// --- CONEXIÓN A SOCKET.IO CON AUTENTICACIÓN JWT ---
// Obtener el token guardado tras el Login
const token = localStorage.getItem('token');
// Conectar Socket.io enviando el token en auth
const socket = io({
    auth: {
        token: token
    }
});
// MODALES PELEA LIBRE 1v1
function openFreePlayModal() {
  document.getElementById('free-play-modal').style.display = 'flex';
}

function closeFreePlayModal() {
  document.getElementById('free-play-modal').style.display = 'none';
}

// MODALES TORNEO
function openTournamentModal() {
  document.getElementById('tournament-modal').style.display = 'flex';
}

function closeTournamentModal() {
  document.getElementById('tournament-modal').style.display = 'none';
  document.getElementById('tournament-setup-panel').style.display = 'block';
  document.getElementById('tournament-lobby-status').style.display = 'none';
}

// CONTROLES TORNEO
document.getElementById('btn-create-tournament').addEventListener('click', () => {
  const username = document.getElementById('tournament-username').value.trim();
  const maxPlayers = document.getElementById('tournament-size').value;

  if (!username) return alert('Por favor, ingresá tu nombre.');
  socket.emit('createTournament', { username, maxPlayers });
});

document.getElementById('btn-join-tournament').addEventListener('click', () => {
  const username = document.getElementById('tournament-username').value.trim();
  const tCode = document.getElementById('tournament-code-input').value.trim();

  if (!username || !tCode) return alert('Ingresá tu nombre y el código de torneo.');
  socket.emit('joinTournament', { username, tCode });
});

// RESPUESTAS SOCKET - TORNEO
socket.on('tournamentCreated', (data) => {
  document.getElementById('tournament-setup-panel').style.display = 'none';
  document.getElementById('tournament-lobby-status').style.display = 'block';
  
  document.getElementById('t-code-display').textContent = data.tCode;
  document.getElementById('t-status-msg').textContent = `Esperando jugadores (1/${data.maxPlayers})...`;
  updatePlayersList(data.players);
});

socket.on('tournamentPlayerJoined', (data) => {
  // 1. Ocultar el formulario de registro/unirse y mostrar la vista del lobby (PARA AMBOS JUGADORES)
  document.getElementById('tournament-setup-panel').style.display = 'none';
  document.getElementById('tournament-lobby-status').style.display = 'block';

  // 2. Colocar el código en la pantalla del usuario que se acaba de unir
  if (data.tCode) {
    document.getElementById('t-code-display').textContent = data.tCode;
  }

  // 3. Bloquear el input del nombre para que no lo edite durante la espera
  const nameInput = document.getElementById('tournament-username');
  if (nameInput) nameInput.disabled = true;

  // 4. Actualizar contador y lista de usuarios conectados en tiempo real
  document.getElementById('t-status-msg').textContent = `Esperando jugadores (${data.players.length}/${data.maxPlayers})...`;
  updatePlayersList(data.players);
});

socket.on('errorMsg', (msg) => alert(msg));

function updatePlayersList(players) {
  const listContainer = document.getElementById('t-players-list');
  listContainer.innerHTML = '';
  players.forEach((p, index) => {
    const li = document.createElement('li');
    li.textContent = `${index + 1}. ${p.name}`;
    listContainer.appendChild(li);
  });
}

// MOSTRAR ÁRBOL DE TORNEO EN VIVO
socket.on('tournamentStateUpdate', (data) => {
  document.getElementById('tournament-modal').style.display = 'none';

  // VALIDACIÓN: Solo mostrar el bracket si la pantalla de juego NO está activa
  const gameScreen = document.getElementById('game-screen');
  const isPlaying = gameScreen && (gameScreen.style.display === 'block' || gameScreen.style.display === 'flex');

  if (!isPlaying) {
    document.getElementById('tournament-bracket-screen').style.display = 'flex';
  }

  if (data.nextMatch) {
    document.getElementById('next-match-text').textContent = 
      `¡PRÓXIMO COMBATE!: ${data.nextMatch.p1} VS ${data.nextMatch.p2}`;
  }

  const winnersDiv = document.getElementById('winners-matches');
  winnersDiv.innerHTML = '';

  data.matches.forEach(m => {
    const matchBox = document.createElement('div');
    matchBox.className = `match-node ${m.id === data.nextMatch?.matchId ? 'active' : ''}`;
    
    const p1Name = m.p1 ? m.p1.name : 'TBD';
    const p2Name = m.p2 ? m.p2.name : 'TBD';
    const winnerName = m.winner ? m.winner.name : '';

    matchBox.innerHTML = `
      <div class="player-slot ${winnerName === p1Name ? 'winner' : ''}">
        <span>${p1Name}</span>
      </div>
      <div class="player-slot ${winnerName === p2Name ? 'winner' : ''}">
        <span>${p2Name}</span>
      </div>
    `;
    winnersDiv.appendChild(matchBox);
  });
});

// EVENTO DE LANZAMIENTO DE PELEA (SINGLE PAGE - SIN CAMBIO DE URL)
// socket.on('launchMatch', (data) => {
//   sessionStorage.setItem('roomCode', data.roomCode);
//   sessionStorage.setItem('myRole', data.role);
//   sessionStorage.setItem('bgMap', data.bgMap);

//   // Ocultar menús y árboles
//   document.getElementById('tournament-bracket-screen').style.display = 'none';
//   document.getElementById('free-play-modal').style.display = 'none';
//   document.getElementById('menu-screen').classList.remove('active');

//   // Mostrar el Canvas del juego
//   document.getElementById('game-screen').style.display = 'block';
//   document.getElementById('display-room-code').textContent = data.roomCode;
// });

// EVENTO DE VUELTA AL ÁRBOL TRAS TERMINAR LA PELEA
socket.on('returnToBracket', () => {
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('tournament-bracket-screen').style.display = 'flex';
});

// En menu.js

socket.on('tournamentFinished', (data) => {
  // 1. Ocultar pantalla de juego
  const gameScreen = document.getElementById('game-screen');
  if (gameScreen) gameScreen.style.display = 'none';
  if (window.gameStarted) window.gameStarted = false;

  // 2. Extraer lista de posiciones desde standings
  const standings = (data && data.standings) ? data.standings : [];
  
  let standingsHTML = '';
  if (standings.length > 0) {
    standings.forEach((player, index) => {
      const pos = index + 1;
      const color = pos === 1 ? '#ffd700' : (pos === 2 ? '#c0c0c0' : (pos === 3 ? '#cd7f32' : '#ffffff'));
      standingsHTML += `<p style="color: ${color}; margin: 3px 0; font-size: 1.1em;"><b>${pos}° LUGAR:</b> ${player.name}</p>`;
    });
  } else {
    standingsHTML = `<p style="color: #00e5ff;">Torneo concluido.</p>`;
  }

  // 3. Actualizar la tarjeta superior con el Podio
  const matchText = document.getElementById('next-match-text');
  if (matchText) {
    matchText.innerHTML = `
      <div style="text-align: center; font-size: 1.1em; line-height: 1.4;">
        <h2 style="color: #ffd700; margin: 0 0 10px 0;">🏆 POSICIONES FINALES DEL TORNEO 🏆</h2>
        ${standingsHTML}
      </div>
    `;
  }

  // 4. Mostrar la pantalla del bracket
  const bracketModal = document.getElementById('tournament-bracket-screen');
  if (bracketModal) bracketModal.style.display = 'flex';

  // 5. Botón de salir
  let btnExit = document.getElementById('btn-exit-tournament');
  if (!btnExit && bracketModal) {
    const card = bracketModal.querySelector('.modal-content') || bracketModal;
    btnExit = document.createElement('button');
    btnExit.id = 'btn-exit-tournament';
    btnExit.className = 'btn-option btn-action';
    btnExit.style.cssText = 'margin: 20px auto; padding: 12px 24px; font-size: 16px; cursor: pointer; display: block;';
    btnExit.textContent = 'VOLVER AL MENÚ PRINCIPAL';
    btnExit.onclick = exitTournamentToMenu;
    card.appendChild(btnExit);
  } else if (btnExit) {
    btnExit.style.display = 'block';
  }
});

// Función para limpiar el estado y volver al menú
function exitTournamentToMenu() {
  // Limpiar variables de sesión
  sessionStorage.removeItem('myRole');
  sessionStorage.removeItem('roomCode');
  sessionStorage.removeItem('bgMap');

  // Ocultar modales y pantallas
  const bracketModal = document.getElementById('tournament-bracket-screen');
  const gameScreen = document.getElementById('game-screen');
  const menuScreen = document.getElementById('menu-screen');

  if (bracketModal) bracketModal.style.display = 'none';
  if (gameScreen) gameScreen.style.display = 'none';
  if (menuScreen) menuScreen.style.display = 'flex';

  // Recargar la página para limpiar sockets e instancias limpias
  window.location.reload();
}


// En menu.js

function returnToMenu() {
  // 1. Ocultar totalmente la pantalla y contenedor del juego
  const gameScreen = document.getElementById('game-screen');
  if (gameScreen) {
    gameScreen.style.display = 'none';
    gameScreen.classList.remove('active');
  }

  // Ocultar modales por si alguno quedó abierto
  const freePlayModal = document.getElementById('free-play-modal');
  if (freePlayModal) freePlayModal.style.display = 'none';

  const tournamentModal = document.getElementById('tournament-modal');
  if (tournamentModal) tournamentModal.style.display = 'none';

  // 2. Reactivar el Menú Principal
  const menuScreen = document.getElementById('menu-screen');
  if (menuScreen) {
    menuScreen.style.display = 'flex';
    menuScreen.classList.add('active');
  }

  // 3. Ocultar la pantalla de intro si hubiera quedado
  const introScreen = document.getElementById('intro-screen');
  if (introScreen) {
    introScreen.style.display = 'none';
    introScreen.classList.remove('active');
  }

  // 4. Reiniciar la música del menú
  startAmbientAudio();
}


// --- GESTIÓN DEL MODAL DE EVENTO ESPECIAL ---
function openSpecialEventModal() {
  const modal = document.getElementById('special-event-modal');
  if (modal) {
    modal.style.display = 'flex';
    // Restablecer vistas al abrir
    document.getElementById('special-event-join-panel').style.display = 'block';
    document.getElementById('special-event-lobby-status').style.display = 'none';
    document.getElementById('special-event-status').textContent = '';
  }
}

function closeSpecialEventModal() {
  const modal = document.getElementById('special-event-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}