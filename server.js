const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,      // 60 seconds before considering connection dead
  pingInterval: 25000,     // Send ping every 25 seconds
  upgradeTimeout: 30000,   // 30 seconds to upgrade connection
  allowEIO3: true          // Allow older clients
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const roomIdToRoom = new Map(); // Maps room codes to room objects for quick lookup
const CHOICES = ['rock', 'paper', 'scissors'];
const TIMER_DURATION = 7;
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
      roomIdToRoom.delete(room.roomCode);
      rooms.delete(roomId);
    }
  });
}, 60000);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', (username) => {
    const internalId = uuidv4(); // Internal room identifier (never changes)
    const roomCode = uuidv4().substring(0, 8); // Public room code (can be changed)
    const room = {
      id: internalId,
      roomCode: roomCode,
      hostId: socket.id,
      players: new Map(),
      gameState: 'lobby',
      roundNumber: 0,
      roundTimer: null,
      resultsTimer: null,
      pairings: [],
      leftover: null,
      chatLocked: false,
      chatHistory: []
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

    rooms.set(internalId, room);
    roomIdToRoom.set(roomCode, room);
    socket.join(internalId);
    socket.roomId = internalId;

    socket.emit('roomCreated', { roomId: internalId, roomCode, playerId: socket.id, isHost: true });
    io.to(internalId).emit('playerList', getPlayerList(room));
  });

  // Handle reconnection - try to rejoin room with same username
  socket.on('rejoinRoom', ({ roomCode, username }) => {
    const room = roomIdToRoom.get(roomCode);
    if (!room) {
      // Room no longer exists
      socket.emit('rejoinFailed');
      return;
    }

    // Check if this player was already in the room (by username)
    let existingPlayer = null;
    let existingPlayerId = null;
    room.players.forEach((player, id) => {
      if (player.username.toLowerCase() === username.toLowerCase()) {
        existingPlayer = player;
        existingPlayerId = id;
      }
    });

    if (existingPlayer) {
      // Remove old player entry and add with new socket id
      const wasHost = existingPlayer.isHost;
      const wins = existingPlayer.wins;
      room.players.delete(existingPlayerId);
      
      room.players.set(socket.id, {
        id: socket.id,
        username,
        isHost: wasHost,
        choice: existingPlayer.choice,
        isReady: existingPlayer.isReady,
        wins: wins,
        roundResult: existingPlayer.roundResult,
        opponentChoice: existingPlayer.opponentChoice
      });

      if (wasHost) {
        room.hostId = socket.id;
      }

      socket.join(room.id);
      socket.roomId = room.id;

      socket.emit('rejoinSuccess', { 
        roomId: room.id, 
        roomCode, 
        playerId: socket.id, 
        isHost: wasHost, 
        username,
        gameState: room.gameState,
        chatLocked: room.chatLocked
      });
      
      // Send current state
      io.to(room.id).emit('playerList', getPlayerList(room));
      
      // Send chat history
      if (room.chatHistory && room.chatHistory.length > 0) {
        socket.emit('chatHistory', room.chatHistory);
      }
    } else {
      // Player not found in room, rejoin failed
      socket.emit('rejoinFailed');
    }
  });

  socket.on('joinRoom', ({ roomCode, username }) => {
    const room = roomIdToRoom.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found or link is no longer valid' });
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

    socket.join(room.id);
    socket.roomId = room.id;

    socket.emit('roomJoined', { roomId: room.id, roomCode, playerId: socket.id, isHost: false, username, chatLocked: room.chatLocked });
    
    // Send chat history to the new player
    if (room.chatHistory && room.chatHistory.length > 0) {
      socket.emit('chatHistory', room.chatHistory);
    }
    
    io.to(room.id).emit('playerList', getPlayerList(room));
    io.to(room.id).emit('playerJoined', { username });
    io.to(room.id).emit('chatSystem', { message: `${username} joined the room` });
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
    
    if (nonHostPlayers.length % 2 !== 0) {
      socket.emit('error', { message: `Need an even number of players to start. Currently ${nonHostPlayers.length} players.` });
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

  socket.on('generateNewRoom', () => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;
    
    // Remove old room code mapping
    roomIdToRoom.delete(room.roomCode);
    
    // Generate a new room code
    const newRoomCode = uuidv4().substring(0, 8);
    room.roomCode = newRoomCode;
    
    // Add new room code mapping
    roomIdToRoom.set(newRoomCode, room);
    
    socket.emit('roomCodeChanged', { newRoomCode });
  });

  socket.on('changeRoomCode', () => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;
    
    // Remove old room code mapping
    roomIdToRoom.delete(room.roomCode);
    
    // Generate a new room code
    const newRoomCode = uuidv4().substring(0, 8);
    room.roomCode = newRoomCode;
    
    // Add new room code mapping
    roomIdToRoom.set(newRoomCode, room);
    
    socket.emit('roomCodeChanged', { newRoomCode });
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

  // Cancel game handler - returns to lobby and resets all progress
  socket.on('cancelGame', () => {
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

    io.to(room.id).emit('gameCancelled');
    io.to(room.id).emit('chatSystem', { message: 'Game was cancelled by the host' });
    io.to(room.id).emit('playerList', getPlayerList(room));
  });

  // Chat message handler
  socket.on('chatMessage', ({ message }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (!player) return;
    
    // Check if chat is locked (host can still send)
    if (room.chatLocked && room.hostId !== socket.id) return;
    
    // Rate limiting - 1 message per second
    const now = Date.now();
    if (player.lastMessageTime && now - player.lastMessageTime < 1000) {
      socket.emit('error', { message: 'Slow down! Wait a moment before sending another message.' });
      return;
    }
    player.lastMessageTime = now;
    
    // Validate message
    if (!message || typeof message !== 'string') return;
    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0 || trimmedMessage.length > 200) return;
    
    // Generate unique message ID
    const messageId = `${socket.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const chatMsg = {
      sender: player.username,
      message: trimmedMessage,
      senderId: socket.id,
      messageId: messageId
    };
    
    // Store in chat history (limit to last 100 messages)
    if (!room.chatHistory) room.chatHistory = [];
    room.chatHistory.push(chatMsg);
    if (room.chatHistory.length > 100) {
      room.chatHistory.shift();
    }
    
    // Broadcast the message to all players in the room
    io.to(room.id).emit('chatMessage', chatMsg);
  });

  // Delete message handler (host only)
  socket.on('deleteMessage', ({ messageId }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    
    // Only host can delete messages
    if (room.hostId !== socket.id) return;
    
    // Broadcast deletion to all players in the room
    io.to(room.id).emit('messageDeleted', { messageId });
  });

  // Toggle chat lock (host only)
  socket.on('toggleChatLock', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    
    // Only host can lock/unlock chat
    if (room.hostId !== socket.id) return;
    
    room.chatLocked = !room.chatLocked;
    io.to(room.id).emit('chatLocked', { locked: room.chatLocked });
    io.to(room.id).emit('chatSystem', { message: room.chatLocked ? 'Chat has been locked by the host' : 'Chat has been unlocked by the host' });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const room = rooms.get(socket.roomId);
    if (!room) return;

    const player = room.players.get(socket.id);
    const wasHost = player?.isHost;
    const username = player?.username;

    room.players.delete(socket.id);

    // If host leaves, close entire room and kick everyone
    if (wasHost) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      if (room.resultsTimer) clearTimeout(room.resultsTimer);
      io.to(room.id).emit('hostLeft');
      // Kick all remaining players
      room.players.forEach((p, id) => {
        io.sockets.sockets.get(id)?.leave(room.id);
      });
      roomIdToRoom.delete(room.roomCode);
      rooms.delete(socket.roomId);
      return;
    }

    if (room.players.size === 0) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      if (room.resultsTimer) clearTimeout(room.resultsTimer);
      roomIdToRoom.delete(room.roomCode);
      rooms.delete(socket.roomId);
      return;
    }

    io.to(room.id).emit('playerList', getPlayerList(room));
    io.to(room.id).emit('playerLeft', { username });
    io.to(room.id).emit('chatSystem', { message: `${username} left the room` });
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
