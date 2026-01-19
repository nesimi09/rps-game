const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store rooms and players
const rooms = new Map();

// Game choices
const CHOICES = ['rock', 'paper', 'scissors'];

// Timer duration in seconds
const TIMER_DURATION = 7;

// Determine winner between two choices
function getResult(choice1, choice2) {
  if (choice1 === choice2) return 'tie';
  if (
    (choice1 === 'rock' && choice2 === 'scissors') ||
    (choice1 === 'paper' && choice2 === 'rock') ||
    (choice1 === 'scissors' && choice2 === 'paper')
  ) {
    return 'win';
  }
  return 'lose';
}

// Calculate game results with cumulative points
function calculateResults(room) {
  const players = Array.from(room.players.values());
  const results = [];
  
  // Count choices (only from players who made a choice)
  const choiceCounts = { rock: 0, paper: 0, scissors: 0 };
  const playersWhoChose = players.filter(p => p.choice);
  const playersWhoDidntChoose = players.filter(p => !p.choice);
  
  playersWhoChose.forEach(player => {
    choiceCounts[player.choice]++;
  });

  // Calculate each player's round score
  players.forEach(player => {
    let roundWins = 0;
    let roundLosses = 0;
    let roundTies = 0;

    if (player.choice) {
      // Player made a choice - compare against others who chose
      playersWhoChose.forEach(opponent => {
        if (player.id !== opponent.id) {
          const result = getResult(player.choice, opponent.choice);
          if (result === 'win') roundWins++;
          else if (result === 'lose') roundLosses++;
          else roundTies++;
        }
      });
      // Player who chose beats everyone who didn't choose
      roundWins += playersWhoDidntChoose.length;
    } else {
      // Player didn't choose - loses to everyone who did choose
      roundLosses = playersWhoChose.length;
    }

    // Update cumulative points (1 point per win)
    player.totalPoints = (player.totalPoints || 0) + roundWins;

    results.push({
      id: player.id,
      username: player.username,
      choice: player.choice || 'none',
      roundWins,
      roundLosses,
      roundTies,
      roundScore: roundWins - roundLosses,
      totalPoints: player.totalPoints
    });
  });

  // Sort by total points (cumulative ranking)
  results.sort((a, b) => b.totalPoints - a.totalPoints);

  return { results, choiceCounts };
}

// End the round (called by timer or when all players ready)
function endRound(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gameState !== 'playing') return;

  // Clear the timer
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  room.gameState = 'results';
  const { results, choiceCounts } = calculateResults(room);
  io.to(room.id).emit('gameResults', { results, choiceCounts, roundNumber: room.roundNumber });
}

// Clean up empty rooms periodically
setInterval(() => {
  rooms.forEach((room, roomId) => {
    if (room.players.size === 0) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      rooms.delete(roomId);
    }
  });
}, 60000);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Check if username is available in a room
  socket.on('checkUsername', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('usernameCheckResult', { available: false, error: 'Room not found' });
      return;
    }

    const existingUsernames = Array.from(room.players.values()).map(p => p.username.toLowerCase());
    const isAvailable = !existingUsernames.includes(username.toLowerCase());
    
    socket.emit('usernameCheckResult', { available: isAvailable, error: isAvailable ? null : 'Username already taken' });
  });

  // Create a new room
  socket.on('createRoom', (username) => {
    const roomId = uuidv4().substring(0, 8);
    const room = {
      id: roomId,
      hostId: socket.id,
      players: new Map(),
      gameState: 'lobby', // lobby, playing, results
      roundNumber: 0,
      roundTimer: null
    };

    room.players.set(socket.id, {
      id: socket.id,
      username: username,
      isHost: true,
      choice: null,
      isReady: false,
      totalPoints: 0
    });

    rooms.set(roomId, room);
    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('roomCreated', {
      roomId,
      playerId: socket.id,
      isHost: true
    });

    io.to(roomId).emit('playerList', getPlayerList(room));
  });

  // Join an existing room
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

    // Check for duplicate username (case-insensitive, reject if taken)
    const existingUsernames = Array.from(room.players.values()).map(p => p.username.toLowerCase());
    if (existingUsernames.includes(username.toLowerCase())) {
      socket.emit('error', { message: 'Username already taken. Please choose a different name.' });
      return;
    }

    room.players.set(socket.id, {
      id: socket.id,
      username: username,
      isHost: false,
      choice: null,
      isReady: false,
      totalPoints: 0
    });

    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('roomJoined', {
      roomId,
      playerId: socket.id,
      isHost: false,
      username: username
    });

    io.to(roomId).emit('playerList', getPlayerList(room));
    io.to(roomId).emit('playerJoined', { username: username });
  });

  // Host starts the game
  socket.on('startGame', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }

    if (room.players.size < 2) {
      socket.emit('error', { message: 'Need at least 2 players to start' });
      return;
    }

    room.gameState = 'playing';
    room.roundNumber++;

    // Reset all player choices for new round (keep totalPoints)
    room.players.forEach(player => {
      player.choice = null;
      player.isReady = false;
    });

    // Start the 7-second timer
    io.to(room.id).emit('gameStarted', { 
      roundNumber: room.roundNumber,
      timerDuration: TIMER_DURATION
    });

    // Set timer to end round after 7 seconds
    room.roundTimer = setTimeout(() => {
      endRound(room.id);
    }, TIMER_DURATION * 1000);
  });

  // Player makes a choice
  socket.on('makeChoice', (choice) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    if (room.gameState !== 'playing') {
      socket.emit('error', { message: 'Game is not in progress' });
      return;
    }

    if (!CHOICES.includes(choice)) {
      socket.emit('error', { message: 'Invalid choice' });
      return;
    }

    const player = room.players.get(socket.id);
    if (player && !player.choice) {
      player.choice = choice;
      player.isReady = true;
    }

    // Notify all players about ready status
    io.to(room.id).emit('playerReady', {
      playerId: socket.id,
      username: player.username,
      readyCount: Array.from(room.players.values()).filter(p => p.isReady).length,
      totalCount: room.players.size
    });

    // Check if all players have made their choice - end early
    const allReady = Array.from(room.players.values()).every(p => p.isReady);
    if (allReady) {
      endRound(room.id);
    }
  });

  // Host kicks a player
  socket.on('kickPlayer', (playerId) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit('error', { message: 'Only the host can kick players' });
      return;
    }

    if (playerId === socket.id) {
      socket.emit('error', { message: 'Cannot kick yourself' });
      return;
    }

    const kickedPlayer = room.players.get(playerId);
    if (kickedPlayer) {
      room.players.delete(playerId);
      io.to(playerId).emit('kicked');
      io.sockets.sockets.get(playerId)?.leave(room.id);
      io.to(room.id).emit('playerList', getPlayerList(room));
      io.to(room.id).emit('playerKicked', { username: kickedPlayer.username });
    }
  });

  // Return to lobby (host only)
  socket.on('returnToLobby', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit('error', { message: 'Only the host can return to lobby' });
      return;
    }

    // Clear timer if exists
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }

    room.gameState = 'lobby';
    room.players.forEach(player => {
      player.choice = null;
      player.isReady = false;
      player.totalPoints = 0; // Reset points when returning to lobby
    });
    room.roundNumber = 0;

    io.to(room.id).emit('returnedToLobby');
    io.to(room.id).emit('playerList', getPlayerList(room));
  });

  // Handle disconnect
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
      rooms.delete(socket.roomId);
      return;
    }

    // Transfer host if host left
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
    isReady: player.isReady,
    totalPoints: player.totalPoints || 0
  }));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
