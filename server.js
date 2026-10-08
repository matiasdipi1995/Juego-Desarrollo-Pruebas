require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path'); // 1. Agregado aquí
const { Server } = require('socket.io');
const cors = require('cors');

// 2. Importar conexión a la Base de Datos y Rutas
const db = require('./config/db');
const authRoutes = require('./routes/authRoutes');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);

// 2. Configuración robusta para la carpeta pública
app.use(express.static(path.join(__dirname, 'public'))); 

const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};
const tournaments = {}; 
const mapBackgrounds = ['buenosaires.jpg', 'tokyo.jpg', 'newyork.jpg'];

// --- NUEVO: ESTADO DEL EVENTO ESPECIAL (ADMIN) ---
let specialEventLobby = []; // Lista de jugadores: [{ id, name }]
let specialEventActive = false;
let adminSocketId = null;

// --- MÉTRICAS DE TRÁFICO Y SATURACIÓN ---
let packetCount = 0;
let actionDetails = { playerAction: 0, sendDamage: 0, other: 0 };

setInterval(() => {
  if (packetCount > 0) {
    // console.log(`\n================== METRICA DE RED ==================`);
    // console.log(`[TOTAL]: ${packetCount} req/s procesadas en el servidor`);
    // console.log(`[DETALLE]: Movimientos: ${actionDetails.playerAction} | Daño: ${actionDetails.sendDamage} | Otros: ${actionDetails.other}`);
    
    if (packetCount > 120) {
      // console.warn(`⚠️ ALERTA DE SATURACIÓN: Tráfico muy elevado (${packetCount} req/s). Se recomienda aplicar throttling.`);
    }
    // console.log(`====================================================\n`);

    // Resetear contadores para el próximo segundo
    packetCount = 0;
    actionDetails = { playerAction: 0, sendDamage: 0, other: 0 };
  }
}, 1000);

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function startCountdown(roomCode) {
  let count = 3;
  io.to(roomCode).emit('countdownTick', count);

  const timer = setInterval(() => {
    count--;
    if (count > 0) {
      io.to(roomCode).emit('countdownTick', count);
    } else {
      clearInterval(timer);
      io.to(roomCode).emit('startNewRound');
    }
  }, 1000);
}

// --- LÓGICA DE TORNEO CON REUBICACIÓN COMPLETA (RANKING 1 A N) ---

function createTournamentBracket(tournament) {
  let players = [...tournament.players];
  tournament.matches = [];
  tournament.currentRound = 1;

  // 1. Calculamos la siguiente potencia de 2 (para 5 jugadores -> objetivo es 8)
  const targetCount = Math.pow(2, Math.ceil(Math.log2(players.length)));
  
  // Total de rondas exacto y entero (para 8 slots -> 3 rondas)
  tournament.totalRounds = Math.log2(targetCount); 
  tournament.standings = new Array(players.length).fill(null);

  // 2. Rellenamos los huecos impares con objetos BYE
  while (players.length < targetCount) {
    players.push({
      id: null,
      name: 'BYE',
      isBye: true
    });
  }

  // 3. Armamos las peleas de la Ronda 1
  for (let i = 0; i < players.length; i += 2) {
    const p1 = players[i];
    const p2 = players[i + 1];
    const matchId = `R1_M${(i / 2) + 1}`;

    // Si alguno de los dos es un BYE (Pase Libre)
    const isP1Bye = p1.isBye || false;
    const isP2Bye = p2.isBye || false;

    if (isP2Bye && !isP1Bye) {
      // P1 pasa automáticamente
      tournament.matches.push({
        id: matchId,
        round: 1,
        range: [1, targetCount],
        p1: p1,
        p2: p2,
        winner: p1,
        loser: p2,
        played: true,        // Ya cuenta como jugada para no trabar la ronda
        inProgress: false
      });
    } else if (isP1Bye && !isP2Bye) {
      // P2 pasa automáticamente
      tournament.matches.push({
        id: matchId,
        round: 1,
        range: [1, targetCount],
        p1: p1,
        p2: p2,
        winner: p2,
        loser: p1,
        played: true,        // Ya cuenta como jugada
        inProgress: false
      });
    } else {
      // Combate real entre dos jugadores
      tournament.matches.push({
        id: matchId,
        round: 1,
        range: [1, targetCount],
        p1: p1,
        p2: p2,
        winner: null,
        loser: null,
        played: false,
        inProgress: false
      });
    }
  }
}




function recordMatchResult(tCode, matchId, winnerRole) {
  const t = tournaments[tCode];
  if (!t) return;

  const match = t.matches.find(m => m.id === matchId);
  if (!match || match.played) return;

  const winnerPlayer = winnerRole === 'warrior' ? match.p1 : match.p2;
  const loserPlayer = winnerRole === 'warrior' ? match.p2 : match.p1;

  match.winner = winnerPlayer;
  match.loser = loserPlayer;
  match.played = true;
  match.inProgress = false;

  console.log(`[MATCH RESULT] 🏆 Combate ${matchId} finalizado. Ganador: ${winnerPlayer.name}`);

  // Emitimos la actualización del estado visual del bracket
  io.to(tCode).emit('tournamentStateUpdate', {
    matches: t.matches,
    standings: t.standings,
    currentRound: t.currentRound
  });

  // Verificamos si la ronda terminó para pasar a la siguiente o declarar campeón
  checkAndBuildNextRound(tCode);
}


function advanceTournament(tCode) {
  const t = tournaments[tCode];
  if (!t) return;

  if (t.isAdvancing) {
    console.warn(`[TORNEO SERVER] ⚠️ Ignorando avance duplicado para ${tCode}`);
    return;
  }
  t.isAdvancing = true;

  // 1. AUTOCOMPLETAR PASE LIBRE (BYE): Resolver cualquier pelea contra BYE antes de evaluar la ronda
  t.matches.forEach(m => {
    if (m.round === t.currentRound && !m.played) {
      if (m.p1 && m.p1.isBye && m.p2 && m.p2.isBye) {
        m.played = true;
        m.winner = m.p1;
        m.loser = m.p2;
      } else if (m.p2 && m.p2.isBye) {
        m.played = true;
        m.winner = m.p1;
        m.loser = m.p2;
      } else if (m.p1 && m.p1.isBye) {
        m.played = true;
        m.winner = m.p2;
        m.loser = m.p1;
      }
    }
  });

  // 2. Filtrar únicamente combates REALES (donde NINGUNO sea un BYE)
  const readyMatches = t.matches.filter(m => 
    !m.played && 
    !m.inProgress && 
    m.round === t.currentRound &&
    m.p1 && !m.p1.isBye && 
    m.p2 && !m.p2.isBye
  );

console.log(`\n======================================================`);
  console.log(`[TORNEO SERVER] 🏆 Avanzando torneo ${tCode} - Ronda ${t.currentRound}`);
  console.log(`[TORNEO SERVER] Peleas reales listas para lanzar: ${readyMatches.length}`);
  console.log(`======================================================\n`);

  if (readyMatches.length > 0) {
    io.to(tCode).emit('tournamentStateUpdate', {
      matches: t.matches,
      standings: t.standings,
      currentRound: t.currentRound
    });

    readyMatches.forEach(match => {
      match.inProgress = true;
      const subRoomCode = `${tCode}_${match.id}`;
      const selectedBg = mapBackgrounds[Math.floor(Math.random() * mapBackgrounds.length)];

      // Roles asignados a cada participante
      const roleP1 = match.p1.role || 'warrior';
      const roleP2 = match.p2.role || 'mage';

      const matchPlayers = [
        { id: match.p1.id, name: match.p1.name, role: roleP1 },
        { id: match.p2.id, name: match.p2.name, role: roleP2 }
      ];

      // Puntajes iniciales dinámicos según el rol
      const initialScores = {};
      initialScores[roleP1] = 0;
      initialScores[roleP2] = 0;

      rooms[subRoomCode] = {
        players: matchPlayers,
        scores: initialScores,
        bgMap: selectedBg,
        tournamentCode: tCode,
        matchId: match.id
      };

      const socketP1 = io.sockets.sockets.get(match.p1.id);
      const socketP2 = io.sockets.sockets.get(match.p2.id);

      // --- LIMPIEZA RIGUROSA DE SALAS PREVIAS ---
      if (socketP1) {
        Array.from(socketP1.rooms).forEach(room => {
          if (room !== socketP1.id && room !== tCode && room.startsWith(tCode)) {
            socketP1.leave(room);
            console.log(`[SERVIDOR] Socket P1 (${socketP1.id}) abandonó la sub-sala previa: ${room}`);
          }
        });
        socketP1.join(subRoomCode); 
        socketP1.roomCode = subRoomCode; 
      }

      if (socketP2) {
        Array.from(socketP2.rooms).forEach(room => {
          if (room !== socketP2.id && room !== tCode && room.startsWith(tCode)) {
            socketP2.leave(room);
            console.log(`[SERVIDOR] Socket P2 (${socketP2.id}) abandonó la sub-sala previa: ${room}`);
          }
        });
        socketP2.join(subRoomCode); 
        socketP2.roomCode = subRoomCode; 
      }

      console.log(`[TORNEO MATCH] ⚔️ Launching Match ID: ${match.id} (Ronda ${match.round}) -> Sala: ${subRoomCode}`);

      setTimeout(() => {
        const payloadP1 = {
          roomCode: subRoomCode,
          role: roleP1,
          bgMap: selectedBg,
          opponent: match.p2.name,
          players: matchPlayers,
          scores: initialScores
        };

        const payloadP2 = {
          roomCode: subRoomCode,
          role: roleP2,
          bgMap: selectedBg,
          opponent: match.p1.name,
          players: matchPlayers,
          scores: initialScores
        };

        if (socketP1) io.to(match.p1.id).emit('launchMatch', payloadP1);
        if (socketP2) io.to(match.p2.id).emit('launchMatch', payloadP2);
        
        startCountdown(subRoomCode);
      }, 3000);
    });

  } else {
    // 3. SI NO HAY PELEAS EN CURSO NI PELEAS PENDIENTES, VERIFICAMOS AVANCE DE RONDA
    const currentMatches = t.matches.filter(m => m.round === t.currentRound);
    const roundFinished = currentMatches.every(m => m.played);

    if (roundFinished) {
      if (t.currentRound < t.totalRounds) {
        console.log(`[TORNEO SERVER] 🔄 Ronda ${t.currentRound} completada. Construyendo siguiente ronda...`);
        
        // Liberamos el flag para poder llamar a buildNextRound/advanceTournament
        t.isAdvancing = false; 
        
        // Llamamos a la función encargada de armar las peleas de la siguiente ronda
        if (typeof buildNextRound === 'function') {
          buildNextRound(tCode);
        } else if (typeof checkRoundCompletion === 'function') {
          checkRoundCompletion(tCode);
        }
        return;
      } else {
        console.log(`[TORNEO SERVER] 🎉 Torneo ${tCode} finalizado completamente.`);
        io.to(tCode).emit('tournamentFinished', { standings: t.standings });
      }
    }
  }

  // Liberamos el bloqueo al terminar el ciclo
  t.isAdvancing = false;
}

function checkAndBuildNextRound(tCode) {
  const t = tournaments[tCode];
  if (!t) return;

  const currentRoundMatches = t.matches.filter(m => m.round === t.currentRound);
  const roundFinished = currentRoundMatches.every(m => m.played);

  console.log(`[CHECK ROUND] Verificando fin de Ronda ${t.currentRound} para torneo ${tCode}`);
  console.log(` ├─ Peleas de la ronda: ${currentRoundMatches.length}`);
  console.log(` └─ ¿Ronda finalizada?: ${roundFinished}`);

  // Si la ronda actual terminó todas sus peleas, construimos la siguiente ronda limpia
  if (roundFinished) {
    buildNextRound(tCode);
  }
}


// --- CONSTRUCCIÓN DE SIGUIENTE RONDA (ELIMINACIÓN SIMPLE) ---
function buildNextRound(tCode) {
  const t = tournaments[tCode];
  if (!t) return;

  // 1. Obtener combates de la ronda actual
  const currentMatches = t.matches.filter(m => m.round === t.currentRound);

  // 2. Extraer a los ganadores de la ronda
  let winners = currentMatches
    .map(m => m.winner)
    .filter(w => w !== null && !w.isBye);

  console.log(`[BUILD ROUND] 🏆 Ganadores Ronda ${t.currentRound}:`, winners.map(w => w.name));

  // 3. SI QUEDA UN SOLO GANADOR: ¡FIN DEL TORNEO!
  if (winners.length === 1) {
    const champion = winners[0];
    console.log(`[TORNEO SERVER] 👑 Campeón del torneo: ${champion.name}`);

    // Construimos la lista de posiciones (Standings) ordenada
    const finalMatch = currentMatches.find(m => m.winner && (m.winner.id === champion.id || m.winner.name === champion.name));
    const runnerUp = finalMatch ? finalMatch.loser : null;

    let finalStandings = [champion];
    if (runnerUp && !runnerUp.isBye) {
      finalStandings.push(runnerUp);
    }

    // Agregar al resto de participantes
    t.players.forEach(p => {
      if (!p.isBye && !finalStandings.some(s => s.id === p.id)) {
        finalStandings.push(p);
      }
    });

    t.standings = finalStandings;

    // Emite el evento que escucha menu.js
    io.to(tCode).emit('tournamentFinished', { 
      winner: champion, 
      standings: t.standings 
    });
    return;
  }

  // 4. Preparamos la siguiente ronda
  t.currentRound += 1;
  const nextRound = t.currentRound;
  let nextMatches = [];
  let matchIndex = 1;

  if (winners.length % 2 !== 0) {
    winners.push({ id: null, name: 'BYE', isBye: true });
  }

  // 5. Crear los combates
  for (let i = 0; i < winners.length; i += 2) {
    const p1 = winners[i];
    const p2 = winners[i + 1];
    const matchId = `R${nextRound}_M${matchIndex++}`;

    const isP1Bye = p1.isBye || false;
    const isP2Bye = p2.isBye || false;

    if (isP2Bye && !isP1Bye) {
      nextMatches.push({
        id: matchId,
        round: nextRound,
        range: [1, 2],
        p1: p1,
        p2: p2,
        winner: p1,
        loser: p2,
        played: true,
        inProgress: false
      });
    } else if (isP1Bye && !isP2Bye) {
      nextMatches.push({
        id: matchId,
        round: nextRound,
        range: [1, 2],
        p1: p1,
        p2: p2,
        winner: p2,
        loser: p1,
        played: true,
        inProgress: false
      });
    } else {
      nextMatches.push({
        id: matchId,
        round: nextRound,
        range: [1, 2],
        p1: p1,
        p2: p2,
        winner: null,
        loser: null,
        played: false,
        inProgress: false
      });
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



// --- EVENTOS SOCKET.IO ---
const jwt = require('jsonwebtoken');
// En server.js:
io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        // Permitir la conexión temporal como invitado/desconectado
        socket.usuario = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.usuario = decoded;
        next();
    } catch (err) {
        // Si el token expiró o es falso, permite continuar o rechaza según prefieras
        socket.usuario = null;
        next();
    }
});

io.on('connection', (socket) => {
  // TEST DE DIAGNÓSTICO
  socket.on('pingTest', (data) => {
    console.log('------------------------------------');
    console.log('   ¡TEST EXITOSO! MENSAJE RECIBIDO   ');
    console.log('   Payload:', data);
    console.log('------------------------------------');
    socket.emit('pongTest', { respuesta: 'Servidor escuchando OK' });
  });

  // ==========================================
  // LÓGICA DEL EVENTO ESPECIAL (ADMIN PANEL)
  // ==========================================

  // 1. REGISTRO DEL ADMIN
  socket.on('registerAdmin', () => {
    adminSocketId = socket.id;
    socket.join('special_event_lobby');
    console.log(`[ADMIN] Panel de Administración vinculado en Socket ID: ${socket.id}`);
    socket.emit('updateSpecialEventLobby', specialEventLobby);
  });

  // 2. UNIRSE AL LOBBY DEL EVENTO ESPECIAL
  socket.on('joinSpecialEventLobby', (data) => {
    const rawName = (typeof data === 'object' && data.username) ? data.username : data;
    const cleanName = (rawName || 'Jugador').toString().trim();

    console.log(`\n[SERVER CHECK] 📩 Petición recibida de: "${cleanName}" (Socket ID: ${socket.id})`);

    if (specialEventActive) {
      console.log(`[EVENTO ESPECIAL] ⛔ Rechazado: el torneo ya inició.`);
      return socket.emit('errorMsg', 'El torneo especial ya está en curso.');
    }

    if (!Array.isArray(specialEventLobby)) {
      specialEventLobby = [];
    }

    specialEventLobby = specialEventLobby.filter(p => p && p.id !== socket.id);
    specialEventLobby.push({ id: socket.id, name: cleanName });
    
    socket.join('special_event_lobby');
    socket.specialLobby = true;

    console.log(`[EVENTO ESPECIAL] ✅ ${cleanName} unído con éxito. Total en lobby: ${specialEventLobby.length}`);

    socket.emit('specialEventLobbyJoined');
    io.to('special_event_lobby').emit('updateSpecialEventLobby', specialEventLobby);
    if (adminSocketId) {
      io.to(adminSocketId).emit('updateSpecialEventLobby', specialEventLobby);
    }
  });

  // 3. INICIO DEL TORNEO DESDE EL PANEL DE ADMIN
  socket.on('adminStartSpecialEvent', () => {
    if (socket.id !== adminSocketId) {
      console.warn(`[ADMIN WARNING] ⚠️ Intento de inicio no autorizado desde: ${socket.id}`);
      return;
    }

    if (specialEventLobby.length < 2) {
      return socket.emit('adminError', 'Se requieren al menos 2 jugadores para iniciar.');
    }

    const tCode = generateCode();
    const totalPlayers = specialEventLobby.length;

    console.log(`\n======================================================`);
    console.log(`[EVENTO ESPECIAL] 🚀 Lanzado por Admin | Código Torneo: ${tCode}`);
    console.log(`[EVENTO ESPECIAL] Jugadores participantes: ${totalPlayers}`);
    console.log(`======================================================\n`);

    tournaments[tCode] = {
      host: adminSocketId,
      maxPlayers: totalPlayers,
      players: [...specialEventLobby],
      matches: [],
      standings: [],
      currentRound: 1
    };

    specialEventActive = true;
    socket.emit('specialEventStartedSuccess', { tCode });

    specialEventLobby.forEach(player => {
      const s = io.sockets.sockets.get(player.id);
      if (s) {
        s.leave('special_event_lobby');
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


  // SALA UNIFORMADA CON ELECCIÓN DE PERSONAJE DINÁMICO
  socket.on('createRoom', ({ username, role }) => {
    const roomCode = generateCode();
    const selectedBg = mapBackgrounds[Math.floor(Math.random() * mapBackgrounds.length)];
    const playerRole = role || 'warrior';

    const initialScores = {};
    initialScores[playerRole] = 0;

    rooms[roomCode] = {
      players: [{ id: socket.id, name: username, role: playerRole }],
      scores: initialScores,
      bgMap: selectedBg
    };

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.emit('roomCreated', { roomCode, role: playerRole, bgMap: selectedBg });
  });

  socket.on('joinRoom', ({ username, roomCode, role }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];

    if (!room) return socket.emit('errorMsg', 'La sala no existe.');
    if (room.players.length >= 2) return socket.emit('errorMsg', 'La sala está llena.');

    const playerRole = role || 'mage';
    room.players.push({ id: socket.id, name: username, role: playerRole });
    
    // Inicializar score para el rol que se acaba de unirse si no existe
    if (room.scores[playerRole] === undefined) {
      room.scores[playerRole] = 0;
    }

    socket.join(code);
    socket.roomCode = code;

    socket.emit('roomJoined', { roomCode: code, role: playerRole, players: room.players, bgMap: room.bgMap });
    io.to(code).emit('gameStart', { players: room.players, scores: room.scores });
    startCountdown(code);
  });

  socket.on('createTournament', ({ username, maxPlayers }) => {
    const tCode = generateCode();
    const parsedMax = parseInt(maxPlayers) || 4;

    tournaments[tCode] = {
      host: socket.id,
      maxPlayers: parsedMax,
      players: [{ id: socket.id, name: username }],
      matches: [],
      standings: [],
      currentRound: 1
    };

    socket.join(tCode);
    socket.tCode = tCode;
    socket.emit('tournamentCreated', { tCode, maxPlayers: parsedMax, players: tournaments[tCode].players });
  });

  socket.on('joinTournamentMatch', ({ roomCode }) => {
    if (roomCode) {
      socket.join(roomCode);
      socket.roomCode = roomCode;
      console.log(`[SERVER] 📥 Socket ${socket.id} actualizado y unido a sub-sala: ${roomCode}`);
    }
  });

  socket.on('joinTournament', ({ username, tCode }) => {
    const code = tCode.toUpperCase();
    const t = tournaments[code];

    if (!t) return socket.emit('errorMsg', 'El torneo no existe.');
    if (t.players.length >= t.maxPlayers) return socket.emit('errorMsg', 'El torneo está lleno.');

    t.players.push({ id: socket.id, name: username });
    
    Array.from(socket.rooms).forEach(room => {
      if (room !== socket.id && room.startsWith(code)) {
        socket.leave(room);
      }
    });

    socket.join(code);
    socket.tCode = code;

    io.to(code).emit('tournamentPlayerJoined', { 
      tCode: code,
      players: t.players, 
      maxPlayers: t.maxPlayers 
    });

    if (t.players.length === t.maxPlayers) {
      createTournamentBracket(t);
      advanceTournament(code);
    }
  });

  socket.on('joinMatchRoom', ({ roomCode }) => {
    socket.join(roomCode);
    socket.roomCode = roomCode;
    const room = rooms[roomCode];
    if (room && room.players.length === 2) {
      io.to(roomCode).emit('gameStart', { players: room.players, scores: room.scores });
      startCountdown(roomCode);
    }
  });

  // GAMEPLAY EN COMBATE (CON TRACKING DE MÉTRICAS Y HABILIDADES DE CLASES)
  socket.on('playerAction', (data) => {
    packetCount++;
    actionDetails.playerAction++;
    if (socket.roomCode) socket.to(socket.roomCode).emit('enemyAction', data);
  });

  socket.on('sendDamage', (data) => {
    if (data.roomCode && socket.roomCode !== data.roomCode) {
      socket.roomCode = data.roomCode;
    }

    if (data.roomCode) {
      socket.to(data.roomCode).emit('playerDamaged', data);
    }
  });

  // --- HABILIDADES DE MAGO ---
  socket.on('mageShoot', (data) => { packetCount++; actionDetails.other++; socket.roomCode && io.to(socket.roomCode).emit('spawnMageProjectile', data); });
  socket.on('mageStartCharge', () => { packetCount++; actionDetails.other++; socket.roomCode && socket.to(socket.roomCode).emit('mageStartCharge'); });
  socket.on('mageStopCharge', () => { packetCount++; actionDetails.other++; socket.roomCode && socket.to(socket.roomCode).emit('mageStopCharge'); });
  socket.on('mageSpecialSound', () => { packetCount++; actionDetails.other++; socket.roomCode && socket.to(socket.roomCode).emit('mageSpecialSound'); });
  socket.on('mageDash', (data) => { packetCount++; actionDetails.other++; socket.roomCode && io.to(socket.roomCode).emit('executeMageDash', data); });

  // --- HABILIDADES DE GUERRERO ---
  socket.on('warriorBeam', (data) => { packetCount++; actionDetails.other++; socket.roomCode && socket.to(socket.roomCode).emit('spawnWarriorBeam', data); });

  // --- HABILIDADES DE ARQUERO (ARCHER) ---
  socket.on('archerShoot', (data) => { packetCount++; actionDetails.other++; socket.roomCode && io.to(socket.roomCode).emit('spawnArcherProjectile', data); });
  socket.on('archerSpecialSound', () => { packetCount++; actionDetails.other++; socket.roomCode && socket.to(socket.roomCode).emit('archerSpecialSound'); });

  // --- SONIDOS GENERALES ---
  socket.on('basicAttackSound', (data) => { packetCount++; actionDetails.other++; socket.roomCode && socket.to(socket.roomCode).emit('basicAttackSound', data); });
  socket.on('defenseSound', () => { packetCount++; actionDetails.other++; socket.roomCode && socket.to(socket.roomCode).emit('defenseSound'); });

  // FIN DE RONDA / PELEA
  socket.on('roundWon', ({ winnerRole }) => {
    const subRoomCode = socket.roomCode;
    if (!subRoomCode) return;

    const room = rooms[subRoomCode];
    if (!room || room.roundEnding) return;

    room.roundEnding = true;

    // Validación de roles soportados: warrior, mage y archer
    const validRole = (winnerRole === 'warrior' || winnerRole === 'mage' || winnerRole === 'archer') ? winnerRole : 'warrior';
    
    if (!room.scores[validRole]) {
      room.scores[validRole] = 0;
    }
    room.scores[validRole]++;

    const isGameOver = room.scores[validRole] >= 3;

    io.to(subRoomCode).emit('roundResult', { 
      scores: room.scores, 
      winnerRole: validRole, 
      isGameOver 
    });


    if (isGameOver) {
      
      // 📊 AQUÍ VA EL GUARDADO EN LA BASE DE DATOS (MySQL)
  
      if (socket.usuario) {
        const usuarioId = socket.usuario.id;

        // Actualizamos victorias, partidas jugadas y sumamos monedas
        db.query(`
          UPDATE estadisticas 
          SET victorias = victorias + 1, 
              partidas_jugadas = partidas_jugadas + 1,
              monedas = monedas + 50
          WHERE usuario_id = ?
        `, [usuarioId])
        .then(() => console.log(`📊 Estadísticas actualizadas para el usuario ID: ${usuarioId}`))
        .catch(err => console.error('Error al actualizar estadísticas en MySQL:', err));
      }
      // =========================================================
      if (room.tournamentCode) {
        const tCode = room.tournamentCode;

        io.to(subRoomCode).emit('returnToBracket');

        recordMatchResult(tCode, room.matchId, validRole);

        room.players.forEach(p => {
          const s = io.sockets.sockets.get(p.id);
          if (s) {
            s.leave(subRoomCode); 
            s.roomCode = tCode;    
          }
        });

        delete rooms[subRoomCode];
      }
    } else {
      setTimeout(() => {
        if (rooms[subRoomCode]) {
          rooms[subRoomCode].roundEnding = false;
          startCountdown(subRoomCode);
        }
      }, 2000);
    }
  });

  // ==========================================
  // MANEJO DE DESCONEXIÓN
  // ==========================================
  socket.on('disconnect', () => {
    if (socket.id === adminSocketId) {
      console.log('[ADMIN] Panel Admin desconectado.');
      adminSocketId = null;
    }

    if (socket.specialLobby) {
      const idx = specialEventLobby.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const removed = specialEventLobby.splice(idx, 1)[0];
        console.log(`[EVENTO ESPECIAL] 🚪 ${removed.name} se desconectó de la sala de espera.`);

        io.to('special_event_lobby').emit('updateSpecialEventLobby', specialEventLobby);
        if (adminSocketId) {
          io.to(adminSocketId).emit('updateSpecialEventLobby', specialEventLobby);
        }
      }
    }

    if (socket.roomCode && rooms[socket.roomCode]) {
      rooms[socket.roomCode].players = rooms[socket.roomCode].players.filter(p => p.id !== socket.id);
      io.to(socket.roomCode).emit('playerLeft');
      if (rooms[socket.roomCode].players.length === 0) delete rooms[socket.roomCode];
    }
  });

}); 

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Servidor corriendo en http://localhost:${PORT}`));