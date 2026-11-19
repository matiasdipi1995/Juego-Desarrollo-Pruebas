// public/js/menu.js
const ambientMusic = new Audio('sonido/sonidoMenu.wav');
ambientMusic.loop = true;
ambientMusic.volume = 0.20;

let audioStarted = false;

function startAmbientAudio() {
  if (!audioStarted) {
    ambientMusic.play().then(() => {
      audioStarted = true;
    }).catch(() => {});
  }
}

function stopAmbientAudio() {
  if (ambientMusic) {
    ambientMusic.pause();
    ambientMusic.currentTime = 0;
    audioStarted = false;
  }
}

document.addEventListener('click', startAmbientAudio, { once: true });
document.addEventListener('touchstart', startAmbientAudio, { once: true });

function enterMenu() {
  startAmbientAudio();
  const intro = document.getElementById('intro-screen');
  const menu = document.getElementById('menu-screen');
  if (intro) intro.classList.remove('active');
  if (menu) {
    menu.style.display = 'flex';
    menu.classList.add('active');
  }
}

function exitMenu() {
  stopAmbientAudio();
  const menu = document.getElementById('menu-screen');
  if (menu) {
    menu.classList.remove('active');
    menu.style.display = 'none';
  }
  ['free-play-modal', 'tournament-modal', 'special-event-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function startVsBot() {
  location.href = 'select_difficulty.html';
}

// --- MODALES PELEA LIBRE 1v1 ---
function openFreePlayModal() {
  const statusEl = document.getElementById('menu-status');
  if (statusEl) statusEl.textContent = '';
  const modal = document.getElementById('free-play-modal');
  if (modal) modal.style.display = 'flex';
}

function closeFreePlayModal() {
  if (typeof socket !== 'undefined') socket.emit('leaveAllRooms');
  const modal = document.getElementById('free-play-modal');
  if (modal) modal.style.display = 'none';
  const statusEl = document.getElementById('menu-status');
  if (statusEl) statusEl.textContent = '';
}

// --- MODALES TORNEO ---
function openTournamentModal() {
  const modal = document.getElementById('tournament-modal');
  if (modal) modal.style.display = 'flex';
}

function closeTournamentModal() {
  if (typeof socket !== 'undefined') socket.emit('leaveAllRooms');
  const modal = document.getElementById('tournament-modal');
  if (modal) modal.style.display = 'none';
  const setup = document.getElementById('tournament-setup-panel');
  const lobby = document.getElementById('tournament-lobby-status');
  if (setup) setup.style.display = 'block';
  if (lobby) lobby.style.display = 'none';

  const nameInput = document.getElementById('tournament-username');
  const charSelect = document.getElementById('tournament-char');
  if (nameInput) nameInput.disabled = false;
  if (charSelect) charSelect.disabled = false;
}

// --- CONTROLES TORNEO ---
const btnCreateTournament = document.getElementById('btn-create-tournament');
if (btnCreateTournament) {
  btnCreateTournament.addEventListener('click', () => {
    const username = document.getElementById('tournament-username').value.trim();
    const maxPlayers = document.getElementById('tournament-size').value;
    const charClass = document.getElementById('tournament-char')?.value || 'warrior';

    if (!username) return alert('Por favor, ingresá tu nombre.');
    socket.emit('createTournament', { username, maxPlayers, charClass });
  });
}

const btnJoinTournament = document.getElementById('btn-join-tournament');
if (btnJoinTournament) {
  btnJoinTournament.addEventListener('click', () => {
    const username = document.getElementById('tournament-username').value.trim();
    const tCode = document.getElementById('tournament-code-input').value.trim();
    const charClass = document.getElementById('tournament-char')?.value || 'warrior';

    if (!username || !tCode) return alert('Ingresá tu nombre y el código de torneo.');
    socket.emit('joinTournament', { username, tCode, charClass });
  });
}

// --- RESPUESTAS SOCKET - TORNEO ---
socket.off('tournamentCreated');
socket.on('tournamentCreated', (data) => {
  const setup = document.getElementById('tournament-setup-panel');
  const lobby = document.getElementById('tournament-lobby-status');
  if (setup) setup.style.display = 'none';
  if (lobby) lobby.style.display = 'block';

  const codeDisplay = document.getElementById('t-code-display');
  const statusMsg = document.getElementById('t-status-msg');
  if (codeDisplay) codeDisplay.textContent = data.tCode;
  if (statusMsg) statusMsg.textContent = `Esperando jugadores (${data.players.length}/${data.maxPlayers})...`;

  const nameInput = document.getElementById('tournament-username');
  const charSelect = document.getElementById('tournament-char');
  if (nameInput) nameInput.disabled = true;
  if (charSelect) charSelect.disabled = true;

  updatePlayersList(data.players);
});

socket.off('tournamentPlayerJoined');
socket.on('tournamentPlayerJoined', (data) => {
  const setup = document.getElementById('tournament-setup-panel');
  const lobby = document.getElementById('tournament-lobby-status');
  if (setup) setup.style.display = 'none';
  if (lobby) lobby.style.display = 'block';

  const codeDisplay = document.getElementById('t-code-display');
  if (data.tCode && codeDisplay) codeDisplay.textContent = data.tCode;

  const nameInput = document.getElementById('tournament-username');
  const charSelect = document.getElementById('tournament-char');
  if (nameInput) nameInput.disabled = true;
  if (charSelect) charSelect.disabled = true;

  const statusMsg = document.getElementById('t-status-msg');
  if (statusMsg) statusMsg.textContent = `Esperando jugadores (${data.players.length}/${data.maxPlayers})...`;
  updatePlayersList(data.players);
});

function updatePlayersList(players) {
  const listContainer = document.getElementById('t-players-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';
  players.forEach((p, index) => {
    const li = document.createElement('li');
    const label = (typeof CHARACTER_LABELS !== 'undefined' && CHARACTER_LABELS[p.charClass])
      ? ` (${CHARACTER_LABELS[p.charClass]})`
      : '';
    li.textContent = `${index + 1}. ${p.name}${label}`;
    listContainer.appendChild(li);
  });
}

// --- ÁRBOL DE TORNEO EN VIVO ---
socket.off('tournamentStateUpdate');
socket.on('tournamentStateUpdate', (data) => {
  const tModal = document.getElementById('tournament-modal');
  const seModal = document.getElementById('special-event-modal');
  if (tModal) tModal.style.display = 'none';
  if (seModal) seModal.style.display = 'none';

  const gameScreen = document.getElementById('game-screen');
  const isPlaying = gameScreen && (gameScreen.style.display === 'block' || gameScreen.style.display === 'flex');

  if (!isPlaying) {
    const bracketScreen = document.getElementById('tournament-bracket-screen');
    if (bracketScreen) bracketScreen.style.display = 'flex';
  }

  const nextMatchText = document.getElementById('next-match-text');
  if (nextMatchText && data.currentRound) {
    nextMatchText.textContent = `RONDA ${data.currentRound} EN PROGRESO`;
  }

  const winnersDiv = document.getElementById('winners-matches');
  if (!winnersDiv) return;
  winnersDiv.innerHTML = '';

  (data.matches || []).forEach(m => {
    const matchBox = document.createElement('div');
    matchBox.className = `match-node ${m.inProgress ? 'active' : ''}`;

    const p1Name = m.p1 ? m.p1.name : 'TBD';
    const p2Name = m.p2 ? m.p2.name : 'TBD';
    const winnerName = m.winner ? m.winner.name : '';

    matchBox.innerHTML = `
      <div style="font-size: 11px; color: #888; margin-bottom: 4px;">Ronda ${m.round} - ${m.id}</div>
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

socket.off('returnToBracket');
socket.on('returnToBracket', () => {
  if (typeof stopOnlineGameLoop === 'function') stopOnlineGameLoop();
  const gameScreen = document.getElementById('game-screen');
  const bracketScreen = document.getElementById('tournament-bracket-screen');
  if (gameScreen) gameScreen.style.display = 'none';
  if (bracketScreen) bracketScreen.style.display = 'flex';
});

socket.off('tournamentFinished');
socket.on('tournamentFinished', (data) => {
  if (typeof stopOnlineGameLoop === 'function') stopOnlineGameLoop();
  const gameScreen = document.getElementById('game-screen');
  if (gameScreen) gameScreen.style.display = 'none';

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

  const matchText = document.getElementById('next-match-text');
  if (matchText) {
    matchText.innerHTML = `
      <div style="text-align: center; font-size: 1.1em; line-height: 1.4;">
        <h2 style="color: #ffd700; margin: 0 0 10px 0;">🏆 POSICIONES FINALES DEL TORNEO 🏆</h2>
        ${standingsHTML}
      </div>
    `;
  }

  const bracketModal = document.getElementById('tournament-bracket-screen');
  if (bracketModal) bracketModal.style.display = 'flex';
});

function exitTournamentToMenu() {
  if (typeof socket !== 'undefined') socket.emit('leaveAllRooms');
  if (typeof stopOnlineGameLoop === 'function') stopOnlineGameLoop();

  sessionStorage.removeItem('mySlot');
  sessionStorage.removeItem('roomCode');
  sessionStorage.removeItem('bgMap');

  const bracketModal = document.getElementById('tournament-bracket-screen');
  if (bracketModal) bracketModal.style.display = 'none';

  returnToMenu();
}

function returnToMenu() {
  if (typeof stopOnlineGameLoop === 'function') stopOnlineGameLoop();

  ['game-screen', 'free-play-modal', 'tournament-modal', 'special-event-modal', 'tournament-bracket-screen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      el.classList.remove('active');
    }
  });

  const setup = document.getElementById('tournament-setup-panel');
  const lobby = document.getElementById('tournament-lobby-status');
  if (setup) setup.style.display = 'block';
  if (lobby) lobby.style.display = 'none';

  const nameInput = document.getElementById('tournament-username');
  const charSelect = document.getElementById('tournament-char');
  if (nameInput) nameInput.disabled = false;
  if (charSelect) charSelect.disabled = false;

  const menuScreen = document.getElementById('menu-screen');
  if (menuScreen) {
    menuScreen.style.display = 'flex';
    menuScreen.classList.add('active');
  }

  startAmbientAudio();
}

// --- MODAL EVENTO ESPECIAL ---
function openSpecialEventModal() {
  const modal = document.getElementById('special-event-modal');
  if (modal) {
    modal.style.display = 'flex';
    const joinPanel = document.getElementById('special-event-join-panel');
    const lobbyStatus = document.getElementById('special-event-lobby-status');
    const status = document.getElementById('special-event-status');
    if (joinPanel) joinPanel.style.display = 'block';
    if (lobbyStatus) lobbyStatus.style.display = 'none';
    if (status) status.textContent = '';
  }
}

function closeSpecialEventModal() {
  if (typeof socket !== 'undefined') socket.emit('leaveAllRooms');
  const modal = document.getElementById('special-event-modal');
  if (modal) modal.style.display = 'none';
}