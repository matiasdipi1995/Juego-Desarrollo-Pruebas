// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { getPlayerLoadout, awardCoins, registerEconomyRoutes } = require('./economy');
const { registerAdminRoutes } = require('./adminRoutes');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const io = new Server(server, { cors: { origin: '*' } });

// ==========================================
// MIDDLEWARE DE AUTENTICACIÓN JWT
// ==========================================
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado.' });
  }
}

// ==========================================
// API REST: AUTH, ESTADÍSTICAS Y ECONOMÍA
// ==========================================
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO usuarios (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, monedas, rol`,
      [username.trim(), email.trim().toLowerCase(), passwordHash]
    );

    const newUser = result.rows[0];
    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, rol: newUser.rol },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: newUser });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'El nombre de usuario o el correo ya están registrados.' });
    }
    console.error('[REGISTER ERROR]', err);
    res.status(500).json({ error: 'Error interno al registrar el usuario.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        monedas: user.monedas,
        rol: user.rol
      }
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ error: 'Error interno al iniciar sesión.' });
  }
});

app.get('/api/me', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, monedas, rol FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('[ME ERROR]', err);
    res.status(500).json({ error: 'Error al validar la sesión.' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM personajes_stats ORDER BY id ASC');
    const statsByClass = {};
    result.rows.forEach(row => {
      statsByClass[row.clase] = {
        vida: row.vida_base,
        mana: row.mana_base,
        ataque: row.ataque_base,
        defensa: row.defensa_base
      };
    });
    res.json(statsByClass);
  } catch (err) {
    console.error('[STATS ERROR]', err);
    res.status(500).json({ error: 'Error al obtener estadísticas de personajes.' });
  }
});

registerEconomyRoutes(app, verifyToken);
registerAdminRoutes(app, verifyToken);
// ==========================================
// ESTADO DE SALAS, TORNEOS Y UTILIDADES
// ==========================================
const rooms = {};
const tournaments = {};
const mapBackgrounds = ['buenosaires.jpg', 'tokyo.jpg', 'newyork.jpg'];
const VALID_CLASSES = ['warrior', 'mage', 'archer', 'ninja'];

let specialEventLobby = [];
let specialEventActive = false;
let adminSocketId = null;

function sanitizeClass(charClass) {
  return VALID_CLASSES.includes(charClass) ? charClass : 'warrior';
}

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function clearRoomTimers(room) {
  if (!room) return;
  if (room.countdownTimer) {
    clearInterval(room.countdownTimer);
    room.countdownTimer = null;
  }
  if (room.nextRoundTimer) {
    clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = null;
  }
}

function cleanupRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearRoomTimers(room);
  delete rooms[roomCode];
}

function getValidatedRoom(socket, claimedRoomCode = null) {
  const code = socket.roomCode;
  if (!code) return null;
  if (claimedRoomCode && claimedRoomCode !== code) return null;

  const room = rooms[code];
  if (!room) return null;

  const isMember = room.players.some(p => p.id === socket.id);
  if (!isMember) return null;

  return { code, room };
}

function leaveCombatRoom(socket, notifyOpponent = true) {
  const code = socket.roomCode;
  if (!code) return;

  socket.leave(code);
  socket.roomCode = null;
  socket.slot = null;

  const room = rooms[code];
  if (!room) return;

  const leavingPlayer = room.players.find(p => p.id === socket.id);
  room.players = room.players.filter(p => p.id !== socket.id);

  // Si era pelea de torneo en curso y el rival sigue adentro, gana por abandono
  if (room.tournamentCode && !room.finished && room.players.length === 1 && leavingPlayer) {
    const remaining = room.players[0];
    room.finished = true;
    clearRoomTimers(room);

    io.to(remaining.id).emit('roundResult', {
      roomCode: code,
      scores: room.scores,
      winnerSlot: remaining.slot,
      winnerName: remaining.name,
      isGameOver: true,
      byDisconnect: true
    });
    io.to(remaining.id).emit('returnToBracket');

    const remSocket = io.sockets.sockets.get(remaining.id);
    if (remSocket) {
      remSocket.leave(code);
      remSocket.roomCode = null;
      remSocket.slot = null;
    }

    recordMatchResult(room.tournamentCode, room.matchId, remaining.slot);
    cleanupRoom(code);
    return;
  }

  // Partida 1v1 normal: avisar al oponente si aún queda alguien
  if (notifyOpponent && !room.finished && room.players.length > 0) {
    io.to(code).emit('playerLeft', { roomCode: code });
  }

  if (room.players.length === 0 || room.finished) {
    cleanupRoom(code);
  }
}

function startCountdown(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  clearRoomTimers(room);
  room.roundActive = false;
  room.roundEnding = false;

  let count = 3;
  io.to(roomCode).emit('countdownTick', { roomCode, count });

  room.countdownTimer = setInterval(() => {
    const activeRoom = rooms[roomCode];
    if (!activeRoom) {
      clearInterval(room.countdownTimer);
      return;
    }

    count--;
    if (count > 0) {
      io.to(roomCode).emit('countdownTick', { roomCode, count });
    } else {
      clearInterval(activeRoom.countdownTimer);
      activeRoom.countdownTimer = null;
      activeRoom.roundActive = true;
      io.to(roomCode).emit('startNewRound', { roomCode });
    }
  }, 1000);
}

// ==========================================
// LÓGICA DE TORNEOS (CON 4 CLASES Y EQUIPAMIENTO)
// ==========================================
function createTournamentBracket(tournament) {
  let players = [...tournament.players];
  tournament.matches = [];
  tournament.currentRound = 1;

  const targetCount = Math.pow(2, Math.ceil(Math.log2(players.length)));
  tournament.totalRounds = Math.log2(targetCount);
  tournament.standings = new Array(players.length).fill(null);

  while (players.length < targetCount) {
    players.push({ id: null, name: 'BYE', isBye: true });
  }

  for (let i = 0; i < players.length; i += 2) {
    const p1 = players[i];
    const p2 = players[i + 1];
    const matchId = `R1_M${(i / 2) + 1}`;
    const isP1Bye = !!p1.isBye;
    const isP2Bye = !!p2.isBye;

    if (isP2Bye && !isP1Bye) {
      tournament.matches.push({
        id: matchId, round: 1, range: [1, targetCount],
        p1, p2, winner: p1, loser: p2, played: true, inProgress: false
      });
    } else if (isP1Bye && !isP2Bye) {
      tournament.matches.push({
        id: matchId, round: 1, range: [1, targetCount],
        p1, p2, winner: p2, loser: p1, played: true, inProgress: false
      });
    } else {
      tournament.matches.push({
        id: matchId, round: 1, range: [1, targetCount],
        p1, p2, winner: null, loser: null, played: false, inProgress: false
      });
    }
  }
}

function recordMatchResult(tCode, matchId, winnerSlot) {
  const t = tournaments[tCode];
  if (!t) return;

  const match = t.matches.find(m => m.id === matchId);
  if (!match || match.played) return;

  const winnerPlayer = winnerSlot === 'p1' ? match.p1 : match.p2;
  const loserPlayer = winnerSlot === 'p1' ? match.p2 : match.p1;

  match.winner = winnerPlayer;
  match.loser = loserPlayer;
  match.played = true;
  match.inProgress = false;

  console.log(`[TORNEO ${tCode}] 🏆 ${matchId} finalizado. Ganador: ${winnerPlayer.name}`);

  io.to(tCode).emit('tournamentStateUpdate', {
    matches: t.matches,
    standings: t.standings,
    currentRound: t.currentRound
  });

  checkAndBuildNextRound(tCode);
}

async function advanceTournament(tCode) {
  const t = tournaments[tCode];
  if (!t || t.isAdvancing) return;
  t.isAdvancing = true;

  // Resolver BYEs pendientes
  t.matches.forEach(m => {
    if (m.round === t.currentRound && !m.played) {
      if (m.p1?.isBye && m.p2?.isBye) {
        m.played = true; m.winner = m.p1; m.loser = m.p2;
      } else if (m.p2?.isBye) {
        m.played = true; m.winner = m.p1; m.loser = m.p2;
      } else if (m.p1?.isBye) {
        m.played = true; m.winner = m.p2; m.loser = m.p1;
      }
    }
  });

  const readyMatches = t.matches.filter(m =>
    !m.played && !m.inProgress && m.round === t.currentRound &&
    m.p1 && !m.p1.isBye && m.p2 && !m.p2.isBye
  );

  if (readyMatches.length > 0) {
    io.to(tCode).emit('tournamentStateUpdate', {
      matches: t.matches,
      standings: t.standings,
      currentRound: t.currentRound
    });

    for (const match of readyMatches) {
      match.inProgress = true;
      const subRoomCode = `${tCode}_${match.id}`;
      const selectedBg = mapBackgrounds[Math.floor(Math.random() * mapBackgrounds.length)];

      const charP1 = sanitizeClass(match.p1.charClass || 'warrior');
      const charP2 = sanitizeClass(match.p2.charClass || 'mage');

      const [loadoutP1, loadoutP2] = await Promise.all([
        getPlayerLoadout(match.p1.userId, charP1),
        getPlayerLoadout(match.p2.userId, charP2)
      ]);

      const matchPlayers = [
        {
          id: match.p1.id, userId: match.p1.userId, name: match.p1.name,
          slot: 'p1', charClass: charP1,
          stats: loadoutP1.stats, equipment: loadoutP1.equipment
        },
        {
          id: match.p2.id, userId: match.p2.userId, name: match.p2.name,
          slot: 'p2', charClass: charP2,
          stats: loadoutP2.stats, equipment: loadoutP2.equipment
        }
      ];

      const initialScores = { p1: 0, p2: 0 };

      rooms[subRoomCode] = {
        players: matchPlayers,
        scores: initialScores,
        bgMap: selectedBg,
        tournamentCode: tCode,
        matchId: match.id,
        roundActive: false,
        roundEnding: false,
        finished: false,
        countdownTimer: null,
        nextRoundTimer: null
      };

      const socketP1 = io.sockets.sockets.get(match.p1.id);
      const socketP2 = io.sockets.sockets.get(match.p2.id);

      [
        { s: socketP1, slot: 'p1' },
        { s: socketP2, slot: 'p2' }
      ].forEach(({ s, slot }) => {
        if (!s) return;
        if (s.roomCode && s.roomCode !== subRoomCode) {
          s.leave(s.roomCode);
        }
        s.join(subRoomCode);
        s.roomCode = subRoomCode;
        s.slot = slot;
      });

      setTimeout(() => {
        if (!rooms[subRoomCode]) return;

        if (socketP1) {
          io.to(match.p1.id).emit('launchMatch', {
            roomCode: subRoomCode,
            slot: 'p1',
            charClass: charP1,
            bgMap: selectedBg,
            opponent: match.p2.name,
            players: matchPlayers,
            scores: initialScores
          });
        }
        if (socketP2) {
          io.to(match.p2.id).emit('launchMatch', {
            roomCode: subRoomCode,
            slot: 'p2',
            charClass: charP2,
            bgMap: selectedBg,
            opponent: match.p1.name,
            players: matchPlayers,
            scores: initialScores
          });
        }

        startCountdown(subRoomCode);
      }, 2500);
    }
  } else {
    const currentMatches = t.matches.filter(m => m.round === t.currentRound);
    const roundFinished = currentMatches.every(m => m.played);

    if (roundFinished) {
      if (t.currentRound < t.totalRounds) {
        t.isAdvancing = false;
        buildNextRound(tCode);
        return;
      } else {
        io.to(tCode).emit('tournamentFinished', { standings: t.standings });
        delete tournaments[tCode];
      }
    }
  }

  t.isAdvancing = false;
}

function checkAndBuildNextRound(tCode) {
  const t = tournaments[tCode];
  if (!t) return;
  const currentRoundMatches = t.matches.filter(m => m.round === t.currentRound);
  if (currentRoundMatches.every(m => m.played)) {
    buildNextRound(tCode);
  }
}

function buildNextRound(tCode) {
  const t = tournaments[tCode];
  if (!t) return;

  const currentMatches = t.matches.filter(m => m.round === t.currentRound);
  let winners = currentMatches.map(m => m.winner).filter(w => w !== null && !w.isBye);

  if (winners.length <= 1) {
    const champion = winners[0] || t.players[0];
    const finalMatch = currentMatches.find(m => m.winner && m.winner.id === champion.id);
    const runnerUp = finalMatch ? finalMatch.loser : null;

    const finalStandings = [champion];
    if (runnerUp && !runnerUp.isBye) finalStandings.push(runnerUp);
    t.players.forEach(p => {
      if (!p.isBye && !finalStandings.some(s => s.id === p.id)) finalStandings.push(p);
    });

    t.standings = finalStandings;
    io.to(tCode).emit('tournamentFinished', { winner: champion, standings: t.standings });
    delete tournaments[tCode];
    return;
  }

  t.currentRound += 1;
  const nextRound = t.currentRound;
  const nextMatches = [];
  let matchIndex = 1;

  if (winners.length % 2 !== 0) {
    winners.push({ id: null, name: 'BYE', isBye: true });
  }

  for (let i = 0; i < winners.length; i += 2) {
    const p1 = winners[i];
    const p2 = winners[i + 1];
    const matchId = `R${nextRound}_M${matchIndex++}`;
    const isP1Bye = !!p1.isBye;
    const isP2Bye = !!p2.isBye;

    if (isP2Bye && !isP1Bye) {
      nextMatches.push({ id: matchId, round: nextRound, range: [1, 2], p1, p2, winner: p1, loser: p2, played: true, inProgress: false });
    } else if (isP1Bye && !isP2Bye) {
      nextMatches.push({ id: matchId, round: nextRound, range: [1, 2], p1, p2, winner: p2, loser: p1, played: true, inProgress: false });
    } else {
      nextMatches.push({ id: matchId, round: nextRound, range: [1, 2], p1, p2, winner: null, loser: null, played: false, inProgress: false });
    }
  }

  t.matches.push(...nextMatches);

  io.to(tCode).emit('tournamentStateUpdate', {
    matches: t.matches,
    standings: t.standings,
    currentRound: t.currentRound
  });

  t.isAdvancing = false;
  advanceTournament(tCode);
}

// ==========================================
// AUTENTICACIÓN JWT EN SOCKET.IO
// ==========================================
function attachTokenToSocket(socket, token) {
  if (!token) {
    socket.userId = null;
    socket.username = null;
    return;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.username = decoded.username;
  } catch (err) {
    socket.userId = null;
    socket.username = null;
  }
}

io.use((socket, next) => {
  attachTokenToSocket(socket, socket.handshake.auth?.token);
  next();
});

// ==========================================
// EVENTOS SOCKET.IO
// ==========================================
io.on('connection', (socket) => {
  socket.roomCode = null;
  socket.slot = null;
  socket.tCode = null;
  socket.specialLobby = false;

  // Permite vincular el JWT inmediatamente después de iniciar sesión sin recargar la página
  socket.on('authenticateSocket', ({ token }) => {
    attachTokenToSocket(socket, token);
  });

  // --- EVENTO ESPECIAL (ADMIN VERIFICADO EN BD) ---
  socket.on('registerAdmin', async () => {
    if (!socket.userId) return;
    try {
      const res = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [socket.userId]);
      if (res.rows[0]?.rol !== 'admin') return;

      adminSocketId = socket.id;
      socket.join('special_event_lobby');
      socket.emit('updateSpecialEventLobby', specialEventLobby);
    } catch (err) {
      console.error('[REGISTER ADMIN SOCKET ERROR]', err.message);
    }
  });

  socket.on('joinSpecialEventLobby', (data) => {
    const rawName = (typeof data === 'object' && data.username) ? data.username : data;
    const cleanName = (rawName || 'Jugador').toString().trim();
    const charClass = sanitizeClass(typeof data === 'object' ? data.charClass : 'warrior');

    if (specialEventActive) {
      return socket.emit('errorMsg', 'El torneo especial ya está en curso.');
    }

    leaveCombatRoom(socket);
    specialEventLobby = specialEventLobby.filter(p => p && p.id !== socket.id);
    specialEventLobby.push({ id: socket.id, userId: socket.userId, name: cleanName, charClass });

    socket.join('special_event_lobby');
    socket.specialLobby = true;

    socket.emit('specialEventLobbyJoined', { totalPlayers: specialEventLobby.length });
    io.to('special_event_lobby').emit('updateSpecialEventLobby', specialEventLobby);
    if (adminSocketId) io.to(adminSocketId).emit('updateSpecialEventLobby', specialEventLobby);
  });

  socket.on('adminStartSpecialEvent', () => {
    if (!socket.userId || socket.id !== adminSocketId) {
      return socket.emit('adminError', 'No tienes permisos de administrador.');
    }
    if (socket.id !== adminSocketId) return;
    if (specialEventLobby.length < 2) {
      return socket.emit('adminError', 'Se requieren al menos 2 jugadores para iniciar.');
    }

    const tCode = generateCode();
    const totalPlayers = specialEventLobby.length;

    tournaments[tCode] = {
      host: adminSocketId,
      maxPlayers: totalPlayers,
      players: [...specialEventLobby],
      matches: [],
      standings: [],
      currentRound: 1,
      started: true
    };

    specialEventActive = true;
    socket.emit('specialEventStartedSuccess', { tCode });

    specialEventLobby.forEach(player => {
      const s = io.sockets.sockets.get(player.id);
      if (s) {
        s.leave('special_event_lobby');
        s.specialLobby = false;
        s.join(tCode);
        s.tCode = tCode;
      }
    });

    createTournamentBracket(tournaments[tCode]);
    io.to(tCode).emit('tournamentCreated', { tCode, maxPlayers: totalPlayers, players: tournaments[tCode].players });
    advanceTournament(tCode);

    specialEventLobby = [];
    specialEventActive = false;
  });

  // --- SALAS PRIVADAS 1 VS 1 ONLINE ---
  socket.on('createRoom', async ({ username, charClass }) => {
    leaveCombatRoom(socket);

    const roomCode = generateCode();
    const selectedBg = mapBackgrounds[Math.floor(Math.random() * mapBackgrounds.length)];
    const chosenClass = sanitizeClass(charClass);
    const cleanName = (username || 'Jugador 1').toString().trim();
    const loadout = await getPlayerLoadout(socket.userId, chosenClass);

    rooms[roomCode] = {
      players: [{
        id: socket.id, userId: socket.userId, name: cleanName,
        slot: 'p1', charClass: chosenClass,
        stats: loadout.stats, equipment: loadout.equipment
      }],
      scores: { p1: 0, p2: 0 },
      bgMap: selectedBg,
      roundActive: false,
      roundEnding: false,
      finished: false,
      countdownTimer: null,
      nextRoundTimer: null
    };

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.slot = 'p1';

    socket.emit('roomCreated', {
      roomCode,
      slot: 'p1',
      charClass: chosenClass,
      bgMap: selectedBg
    });
  });

  socket.on('joinRoom', async ({ username, roomCode, charClass }) => {
    const code = (roomCode || '').toString().trim().toUpperCase();
    const room = rooms[code];

    if (!room || room.finished) return socket.emit('errorMsg', 'La sala no existe o ya finalizó.');
    if (room.tournamentCode) return socket.emit('errorMsg', 'Esa sala pertenece a un torneo en curso.');
    if (room.players.length >= 2) return socket.emit('errorMsg', 'La sala está llena.');
    if (room.players.some(p => p.id === socket.id)) return socket.emit('errorMsg', 'Ya estás en esta sala.');

    leaveCombatRoom(socket);

    const chosenClass = sanitizeClass(charClass);
    const cleanName = (username || 'Jugador 2').toString().trim();
    const loadout = await getPlayerLoadout(socket.userId, chosenClass);

    room.players.push({
      id: socket.id, userId: socket.userId, name: cleanName,
      slot: 'p2', charClass: chosenClass,
      stats: loadout.stats, equipment: loadout.equipment
    });

    socket.join(code);
    socket.roomCode = code;
    socket.slot = 'p2';

    socket.emit('roomJoined', {
      roomCode: code,
      slot: 'p2',
      charClass: chosenClass,
      players: room.players,
      bgMap: room.bgMap
    });

    io.to(code).emit('gameStart', {
      roomCode: code,
      players: room.players,
      scores: room.scores,
      bgMap: room.bgMap
    });

    startCountdown(code);
  });

  // --- TORNEOS EN RED LOCAL ---
  socket.on('createTournament', ({ username, maxPlayers, charClass }) => {
    leaveCombatRoom(socket);
    const tCode = generateCode();
    const parsedMax = parseInt(maxPlayers, 10) || 4;
    const chosenClass = sanitizeClass(charClass);

    tournaments[tCode] = {
      host: socket.id,
      maxPlayers: parsedMax,
      players: [{ id: socket.id, userId: socket.userId, name: (username || 'Jugador').trim(), charClass: chosenClass }],
      matches: [],
      standings: [],
      currentRound: 1,
      started: false
    };

    socket.join(tCode);
    socket.tCode = tCode;
    socket.emit('tournamentCreated', { tCode, maxPlayers: parsedMax, players: tournaments[tCode].players });
  });

  socket.on('joinTournament', ({ username, tCode, charClass }) => {
    const code = (tCode || '').toString().trim().toUpperCase();
    const t = tournaments[code];

    if (!t) return socket.emit('errorMsg', 'El torneo no existe.');
    if (t.started || t.players.length >= t.maxPlayers) return socket.emit('errorMsg', 'El torneo está lleno o ya comenzó.');
    if (t.players.some(p => p.id === socket.id)) return socket.emit('errorMsg', 'Ya estás anotado en este torneo.');

    leaveCombatRoom(socket);

    const chosenClass = sanitizeClass(charClass);
    t.players.push({ id: socket.id, userId: socket.userId, name: (username || 'Jugador').trim(), charClass: chosenClass });

    socket.join(code);
    socket.tCode = code;

    io.to(code).emit('tournamentPlayerJoined', {
      tCode: code,
      players: t.players,
      maxPlayers: t.maxPlayers
    });

    if (t.players.length === t.maxPlayers) {
      t.started = true;
      createTournamentBracket(t);
      advanceTournament(code);
    }
  });

  socket.on('joinTournamentMatch', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.slot = player.slot;
  });

  // --- SALIR LIMPIAMENTE DE CUALQUIER SALA (ANTI-FANTASMA) ---
  socket.on('leaveAllRooms', () => {
    leaveCombatRoom(socket, true);

    if (socket.specialLobby) {
      specialEventLobby = specialEventLobby.filter(p => p.id !== socket.id);
      socket.leave('special_event_lobby');
      socket.specialLobby = false;
      io.to('special_event_lobby').emit('updateSpecialEventLobby', specialEventLobby);
      if (adminSocketId) io.to(adminSocketId).emit('updateSpecialEventLobby', specialEventLobby);
    }

    if (socket.tCode) {
      const t = tournaments[socket.tCode];
      if (t && !t.started) {
        t.players = t.players.filter(p => p.id !== socket.id);
        io.to(socket.tCode).emit('tournamentPlayerJoined', {
          tCode: socket.tCode,
          players: t.players,
          maxPlayers: t.maxPlayers
        });
        if (t.players.length === 0) delete tournaments[socket.tCode];
      }
      socket.leave(socket.tCode);
      socket.tCode = null;
    }
  });

  // --- COMBATE EN TIEMPO REAL (VALIDADO POR SALA Y PERTENENCIA) ---
  socket.on('playerAction', (data) => {
    const valid = getValidatedRoom(socket, data?.roomCode);
    if (!valid) return;

    socket.to(valid.code).emit('enemyAction', {
      ...data,
      roomCode: valid.code,
      slot: socket.slot
    });
  });

  socket.on('sendDamage', (data) => {
    const valid = getValidatedRoom(socket, data?.roomCode);
    if (!valid || !valid.room.roundActive) return;

    const amount = Number(data?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1500) return;

    const opponentSlot = socket.slot === 'p1' ? 'p2' : 'p1';
    socket.to(valid.code).emit('playerDamaged', {
      roomCode: valid.code,
      targetSlot: opponentSlot,
      amount
    });
  });

  socket.on('combatShoot', (data) => {
    const valid = getValidatedRoom(socket, data?.roomCode);
    if (!valid || !valid.room.roundActive) return;

    socket.to(valid.code).emit('spawnProjectile', {
      ...data,
      roomCode: valid.code,
      slot: socket.slot
    });
  });

  socket.on('combatSpecial', (data) => {
    const valid = getValidatedRoom(socket, data?.roomCode);
    if (!valid || !valid.room.roundActive) return;

    socket.to(valid.code).emit('triggerSpecial', {
      ...data,
      roomCode: valid.code,
      slot: socket.slot
    });
  });

  socket.on('combatSound', (data) => {
    const valid = getValidatedRoom(socket, data?.roomCode);
    if (!valid) return;

    socket.to(valid.code).emit('playRemoteSound', {
      roomCode: valid.code,
      slot: socket.slot,
      sound: data?.sound
    });
  });

  // --- FIN DE RONDA Y PARTIDA (CON RECOMPENSA EN MONEDAS) ---
  socket.on('roundWon', async (data) => {
    const valid = getValidatedRoom(socket, data?.roomCode);
    if (!valid) return;

    const { code, room } = valid;
    if (room.roundEnding || room.finished) return;

    const winnerSlot = data?.winnerSlot === 'p1' || data?.winnerSlot === 'p2' ? data.winnerSlot : null;
    if (!winnerSlot) return;

    room.roundEnding = true;
    room.roundActive = false;
    room.scores[winnerSlot] = (room.scores[winnerSlot] || 0) + 1;

    const winnerObj = room.players.find(p => p.slot === winnerSlot);
    const isGameOver = room.scores[winnerSlot] >= 3;

    let rewards = null;
    if (isGameOver) {
      rewards = {};
      const winCoins = room.tournamentCode ? 150 : 120;
      const loseCoins = 45;

      for (const p of room.players) {
        const earned = p.slot === winnerSlot ? winCoins : loseCoins;
        const total = await awardCoins(p.userId, earned);
        rewards[p.slot] = { earned, total };
      }
    }

    io.to(code).emit('roundResult', {
      roomCode: code,
      scores: room.scores,
      winnerSlot,
      winnerName: winnerObj ? winnerObj.name : winnerSlot.toUpperCase(),
      isGameOver,
      rewards
    });

    if (isGameOver) {
      room.finished = true;
      clearRoomTimers(room);

      if (room.tournamentCode) {
        const tCode = room.tournamentCode;
        const matchId = room.matchId;

        io.to(code).emit('returnToBracket');

        room.players.forEach(p => {
          const s = io.sockets.sockets.get(p.id);
          if (s) {
            s.leave(code);
            s.roomCode = null;
            s.slot = null;
          }
        });

        cleanupRoom(code);
        recordMatchResult(tCode, matchId, winnerSlot);
      } else {
        room.players.forEach(p => {
          const s = io.sockets.sockets.get(p.id);
          if (s) {
            s.leave(code);
            s.roomCode = null;
            s.slot = null;
          }
        });
        cleanupRoom(code);
      }
    } else {
      room.nextRoundTimer = setTimeout(() => {
        if (rooms[code] && !rooms[code].finished) {
          startCountdown(code);
        }
      }, 2000);
    }
  });

  // --- DESCONEXIÓN ---
  socket.on('disconnect', () => {
    if (socket.id === adminSocketId) {
      adminSocketId = null;
    }

    if (socket.specialLobby) {
      specialEventLobby = specialEventLobby.filter(p => p.id !== socket.id);
      io.to('special_event_lobby').emit('updateSpecialEventLobby', specialEventLobby);
      if (adminSocketId) io.to(adminSocketId).emit('updateSpecialEventLobby', specialEventLobby);
    }

    if (socket.tCode) {
      const t = tournaments[socket.tCode];
      if (t && !t.started) {
        t.players = t.players.filter(p => p.id !== socket.id);
        io.to(socket.tCode).emit('tournamentPlayerJoined', {
          tCode: socket.tCode,
          players: t.players,
          maxPlayers: t.maxPlayers
        });
        if (t.players.length === 0) delete tournaments[socket.tCode];
      }
    }

    leaveCombatRoom(socket, true);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Servidor corriendo en http://localhost:${PORT}`));