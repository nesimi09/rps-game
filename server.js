const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const CHOICES = ['rock', 'paper', 'scissors'];
const TIMER_DURATION = 5;
const RESULTS_DURATION = 5;
const WINS_TO_WIN = 10;

function getResult(choice1, choice2) {
  if (choice1 === choice2) return 'tie';
  if (
    (choice1 === 'rock' && choice2 === 'scissors') ||
    (choice1 === 'paper' && choice2 === 'rock') ||
    (choice1 === 'scissors' && choice2 === 'paper')
  ) return 'win';
  return 'lose';
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createPairings(players) {
  const shuffled = shuffleArray(players);
  const pairs = [];
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }
  // If odd, last player has no opponent
  const leftover = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : null;
  return { pairs, leftover };
}

function endRound(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gameState !== 'playing') return;

  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  room.gameState = 'results';

  // Process pairings
  room.pairings.forEach(([p1, p2]) => {
    const player1 = room.players.get(p1.id);
    const player2 = room.players.get(p2.id);
    if (!player1 || !player2) return;

    const c1 = player1.choice || null;
    const c2 = player2.choice || null;

    if (c1 && c2) {
      const result = getResult(c1, c2);
      if (result === 'win') {
        player1.wins++;
        player1.roundResult = 'win';
        player2.roundResult = 'lose';
      } else if (result === 'lose') {
        player2.wins++;
        player1.roundResult = 'lose';
        player2.roundResult = 'win';
      } else {
        player1.roundResult = 'tie';
        player2.roundResult = 'tie';
      }
    } else if (c1 && !c2) {
      player1.wins++;
      player1.roundResult = 'win';
      player2.roundResult = 'lose';
    } else if (!c1 && c2) {
      player2.wins++;
      player1.roundResult = 'lose';
      player2.roundResult = 'win';
    } else {
      player1.roundResult = 'tie';
      player2.roundResult = 'tie';
    }

    player1.opponentChoice = c2;
    player2.opponentChoice = c1;
  });

  if (room.leftover) {
    const p = room.players.get(room.leftover.id);
    if (p) p.roundResult = 'no_opponent';
  }

  // Build leaderboard (non-host players sorted by wins)
  const leaderboard = Array.from(room.players.values())
    .filter(p => !p.isHost)
    .map(p => ({ id: p.id, username: p.username, wins: p.wins }))
    .sort((a, b) => b.wins - a.wins);

  // Send results to each player
  room.players.forEach((player, id) => {
    const opponent = room.pairings.find(pair => pair[0].id === id || pair[1].id === id);
    let opponentName = null;
    let opponentChoice = null;
    if (opponent) {
      const other = opponent[0].id === id ? opponent[1] : opponent[0];
      const otherPlayer = room.players.get(other.id);
      opponentName = otherPlayer?.username || 'Unknown';
      opponentChoice = player.opponentChoice;
    }

    io.to(id).emit('gameResults', {
      leaderboard,
      roundNumber: room.roundNumber,
      yourResult: player.isHost ? 'observer' : player.roundResult,
      opponentName,
      yourChoice: player.choice,
      opponentChoice
    });
  });

  // Check for winners (10+ wins)
  const winners = leaderboard.filter(p => p.wins >= WINS_TO_WIN);
  
  if (winners.length > 0) {
    // Game over!
    room.gameState = 'finished';
    io.to(room.id).emit('gameOver', {
      winners: winners.map(w => w.username),
      leaderboard
    });
  } else {
    // Auto-start next round
    room.resultsTimer = setTimeout(() => {
      startNextRound(roomId);
    }, RESULTS_DURATION * 1000);
  }
}

function startNextRound(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gameState !== 'results') return;

  if (room.resultsTimer) {
    clearTimeout(room.resultsTimer);
    room.resultsTimer = null;
  }

  room.gameState = 'playing';
  room.roundNumber++;

  // Reset choices
  room.players.forEach(player => {
    player.choice = null;
    player.isReady = false;
    player.roundResult = null;
    player.opponentChoice = null;
  });

  // Create new random pairings (non-host players)
  const nonHostPlayers = Array.from(room.players.values())
    .filter(p => !p.isHost)
    .map(p => ({ id: p.id, username: p.username }));

  const { pairs, leftover } = createPairings(nonHostPlayers);
  room.pairings = pairs;
  room.leftover = leftover;

  // Build opponent map
  const opponentMap = {};
  pairs.forEach(([p1, p2]) => {
    opponentMap[p1.id] = p2.username;
    opponentMap[p2.id] = p1.username;
  });

  // Emit to each player with their opponent
  room.players.forEach((player, id) => {
    io.to(id).emit('gameStarted', {
      roundNumber: room.roundNumber,
      timerDuration: TIMER_DURATION,
      opponent: opponentMap[id] || null
    });
  });

  room.roundTimer = setTimeout(() => {
    endRound(room.id);
  }, TIMER_DURATION * 1000);
}

setInterval(() => {
  rooms.forEach((room, roomId) => {
    if (room.players.size === 0) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      if (room.resultsTimer) clearTimeout(room.resultsTimer);
      rooms.delete(roomId);
    }
  });
}, 60000);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', (username) => {
    const roomId = uuidv4().substring(0, 8);
    const room = {
      id: roomId,
      hostId: socket.id,
      players: new Map(),
      gameState: 'lobby',
      roundNumber: 0,
      roundTimer: null,
      resultsTimer: null,
      pairings: [],
      leftover: null
    };

    room.players.set(socket.id, {
      id: socket.id,
      username,
      isHost: true,
      choice: null,
      isReady: false,
      wins: 0,
      roundResult: null,
      opponentChoice: null
    });

    rooms.set(roomId, room);
    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('roomCreated', { roomId, playerId: socket.id, isHost: true });
    io.to(roomId).emit('playerList', getPlayerList(room));
  });

  socket.on('joinRoom', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    if (room.gameState !== 'lobby') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }

    const existingUsernames = Array.from(room.players.values()).map(p => p.username.toLowerCase());
    if (existingUsernames.includes(username.toLowerCase())) {
      socket.emit('error', { message: 'Name already taken. Choose a different name.' });
      return;
    }

    room.players.set(socket.id, {
      id: socket.id,
      username,
      isHost: false,
      choice: null,
      isReady: false,
      wins: 0,
      roundResult: null,
      opponentChoice: null
    });

    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('roomJoined', { roomId, playerId: socket.id, isHost: false, username });
    io.to(roomId).emit('playerList', getPlayerList(room));
    io.to(roomId).emit('playerJoined', { username });
  });

  socket.on('startGame', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (room.hostId !== socket.id) {
      socket.emit('error', { message: 'Only the host can start' });
      return;
    }

    const nonHostPlayers = Array.from(room.players.values()).filter(p => !p.isHost);
    if (nonHostPlayers.length < 2) {
      socket.emit('error', { message: 'Need at least 2 players to start' });
      return;
    }

    room.gameState = 'playing';
    room.roundNumber++;

    room.players.forEach(player => {
      player.choice = null;
      player.isReady = false;
      player.roundResult = null;
      player.opponentChoice = null;
    });

    const { pairs, leftover } = createPairings(nonHostPlayers.map(p => ({ id: p.id, username: p.username })));
    room.pairings = pairs;
    room.leftover = leftover;

    const opponentMap = {};
    pairs.forEach(([p1, p2]) => {
      opponentMap[p1.id] = p2.username;
      opponentMap[p2.id] = p1.username;
    });

    room.players.forEach((player, id) => {
      io.to(id).emit('gameStarted', {
        roundNumber: room.roundNumber,
        timerDuration: TIMER_DURATION,
        opponent: opponentMap[id] || null
      });
    });

    room.roundTimer = setTimeout(() => {
      endRound(room.id);
    }, TIMER_DURATION * 1000);
  });

  socket.on('makeChoice', (choice) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.gameState !== 'playing') return;
    if (!CHOICES.includes(choice)) return;

    const player = room.players.get(socket.id);
    if (!player || player.isHost) return;

    player.choice = choice;
    player.isReady = true;

    // Check if all paired players are ready
    const allReady = room.pairings.every(([p1, p2]) => {
      const pl1 = room.players.get(p1.id);
      const pl2 = room.players.get(p2.id);
      return pl1?.isReady && pl2?.isReady;
    });

    if (allReady && room.pairings.length > 0) {
      endRound(room.id);
    }
  });

  socket.on('kickPlayer', (playerId) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id || playerId === socket.id) return;

    const kickedPlayer = room.players.get(playerId);
    if (kickedPlayer) {
      room.players.delete(playerId);
      io.to(playerId).emit('kicked');
      io.sockets.sockets.get(playerId)?.leave(room.id);
      io.to(room.id).emit('playerList', getPlayerList(room));
      io.to(room.id).emit('playerKicked', { username: kickedPlayer.username });
    }
  });

  socket.on('returnToLobby', () => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;

    if (room.roundTimer) clearTimeout(room.roundTimer);
    if (room.resultsTimer) clearTimeout(room.resultsTimer);

    room.gameState = 'lobby';
    room.roundNumber = 0;
    room.pairings = [];
    room.leftover = null;

    room.players.forEach(player => {
      player.choice = null;
      player.isReady = false;
      player.wins = 0;
      player.roundResult = null;
      player.opponentChoice = null;
    });

    io.to(room.id).emit('returnedToLobby');
    io.to(room.id).emit('playerList', getPlayerList(room));
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const room = rooms.get(socket.roomId);
    if (!room) return;

    const player = room.players.get(socket.id);
    const wasHost = player?.isHost;
    const username = player?.username;

    room.players.delete(socket.id);

    if (room.players.size === 0) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      if (room.resultsTimer) clearTimeout(room.resultsTimer);
      rooms.delete(socket.roomId);
      return;
    }

    if (wasHost) {
      const newHost = room.players.values().next().value;
      if (newHost) {
        newHost.isHost = true;
        room.hostId = newHost.id;
        io.to(newHost.id).emit('becameHost');
      }
    }

    io.to(room.id).emit('playerList', getPlayerList(room));
    io.to(room.id).emit('playerLeft', { username });
  });
});

function getPlayerList(room) {
  return Array.from(room.players.values()).map(player => ({
    id: player.id,
    username: player.username,
    isHost: player.isHost,
    wins: player.wins
  }));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
