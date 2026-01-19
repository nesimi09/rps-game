// Connect to Socket.io server
const socket = io();

// State
let state = {
  roomId: null,
  playerId: null,
  isHost: false,
  username: '',
  currentChoice: null
};

// DOM Elements
const screens = {
  home: document.getElementById('homeScreen'),
  lobby: document.getElementById('lobbyScreen'),
  game: document.getElementById('gameScreen'),
  results: document.getElementById('resultsScreen')
};

// Home Screen Elements
const hostUsernameInput = document.getElementById('hostUsername');
const joinUsernameInput = document.getElementById('joinUsername');
const roomCodeInput = document.getElementById('roomCodeInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');

// Lobby Screen Elements
const roomCodeDisplay = document.getElementById('roomCode');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const playerList = document.getElementById('playerList');
const playerCount = document.getElementById('playerCount');
const startGameBtn = document.getElementById('startGameBtn');
const waitingMessage = document.getElementById('waitingMessage');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');

// Game Screen Elements
const roundNumber = document.getElementById('roundNumber');
const readyStatus = document.getElementById('readyStatus');
const choiceBtns = document.querySelectorAll('.choice-btn');
const choiceStatus = document.getElementById('choiceStatus');

// Results Screen Elements
const resultsRound = document.getElementById('resultsRound');
const rockCount = document.getElementById('rockCount').querySelector('.count');
const paperCount = document.getElementById('paperCount').querySelector('.count');
const scissorsCount = document.getElementById('scissorsCount').querySelector('.count');
const resultsBody = document.getElementById('resultsBody');
const playAgainBtn = document.getElementById('playAgainBtn');
const backToLobbyBtn = document.getElementById('backToLobbyBtn');
const waitingNextRound = document.getElementById('waitingNextRound');

// Toast Container
const toastContainer = document.getElementById('toastContainer');

// Helper Functions
function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[screenName].classList.add('active');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function updateHostUI() {
  const hostOnlyElements = document.querySelectorAll('.host-only');
  hostOnlyElements.forEach(el => {
    el.style.display = state.isHost ? 'inline-block' : 'none';
  });

  waitingMessage.style.display = state.isHost ? 'none' : 'block';
  waitingNextRound.style.display = state.isHost ? 'none' : 'block';
}

function getChoiceEmoji(choice) {
  const emojis = { rock: '✊', paper: '✋', scissors: '✌️', none: '❓' };
  return emojis[choice] || '❓';
}

// Check for room code in URL
function checkUrlForRoomCode() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get('room');
  if (roomCode) {
    roomCodeInput.value = roomCode;
    joinUsernameInput.focus();
  }
}

// Event Listeners
createRoomBtn.addEventListener('click', () => {
  const username = hostUsernameInput.value.trim();
  if (!username) {
    showToast('Please enter your name', 'error');
    return;
  }
  state.username = username;
  socket.emit('createRoom', username);
});

joinRoomBtn.addEventListener('click', () => {
  const username = joinUsernameInput.value.trim();
  const roomId = roomCodeInput.value.trim().toLowerCase();

  if (!username) {
    showToast('Please enter your name', 'error');
    return;
  }
  if (!roomId) {
    showToast('Please enter a room code', 'error');
    return;
  }

  state.username = username;
  socket.emit('joinRoom', { roomId, username });
});

copyLinkBtn.addEventListener('click', () => {
  const link = `${window.location.origin}?room=${state.roomId}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Link copied to clipboard!', 'success');
  });
});

startGameBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

leaveRoomBtn.addEventListener('click', () => {
  window.location.reload();
});

choiceBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (state.currentChoice) return;

    const choice = btn.dataset.choice;
    state.currentChoice = choice;

    choiceBtns.forEach(b => {
      b.classList.remove('selected');
      b.classList.add('disabled');
    });
    btn.classList.add('selected');
    btn.classList.remove('disabled');

    choiceStatus.textContent = `You chose ${choice}! Waiting for others...`;
    socket.emit('makeChoice', choice);
  });
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

backToLobbyBtn.addEventListener('click', () => {
  socket.emit('returnToLobby');
});

// Socket Event Handlers
socket.on('roomCreated', ({ roomId, playerId, isHost }) => {
  state.roomId = roomId;
  state.playerId = playerId;
  state.isHost = isHost;

  roomCodeDisplay.textContent = roomId;
  updateHostUI();
  showScreen('lobby');

  // Update URL without reload
  window.history.pushState({}, '', `?room=${roomId}`);
  showToast('Room created!', 'success');
});

socket.on('roomJoined', ({ roomId, playerId, isHost, username }) => {
  state.roomId = roomId;
  state.playerId = playerId;
  state.isHost = isHost;
  state.username = username;

  roomCodeDisplay.textContent = roomId;
  updateHostUI();
  showScreen('lobby');
  showToast('Joined room!', 'success');
});

socket.on('playerList', (players) => {
  playerList.innerHTML = '';
  playerCount.textContent = `(${players.length})`;

  players.forEach(player => {
    const li = document.createElement('li');
    li.className = 'player-item';

    const isMe = player.id === state.playerId;
    const badges = [];
    if (player.isHost) badges.push('<span class="player-badge">Host</span>');
    if (isMe) badges.push('<span class="player-badge you">You</span>');

    li.innerHTML = `
      <div class="player-info">
        <span class="player-name">${player.username}</span>
        ${badges.join('')}
      </div>
      ${state.isHost && !isMe ? `<button class="kick-btn" data-id="${player.id}">Kick</button>` : ''}
    `;

    playerList.appendChild(li);
  });

  // Add kick button listeners
  document.querySelectorAll('.kick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('kickPlayer', btn.dataset.id);
    });
  });
});

socket.on('playerJoined', ({ username }) => {
  showToast(`${username} joined the room`, 'success');
});

socket.on('playerLeft', ({ username }) => {
  showToast(`${username} left the room`, 'warning');
});

socket.on('playerKicked', ({ username }) => {
  showToast(`${username} was kicked`, 'warning');
});

socket.on('kicked', () => {
  showToast('You were kicked from the room', 'error');
  setTimeout(() => {
    window.location.href = window.location.origin;
  }, 1500);
});

socket.on('becameHost', () => {
  state.isHost = true;
  updateHostUI();
  showToast('You are now the host!', 'success');
});

socket.on('gameStarted', ({ roundNumber: round }) => {
  state.currentChoice = null;
  roundNumber.textContent = round;
  readyStatus.textContent = '0/0 players ready';
  choiceStatus.textContent = '';

  choiceBtns.forEach(btn => {
    btn.classList.remove('selected', 'disabled');
  });

  showScreen('game');
  showToast(`Round ${round} started!`, 'success');
});

socket.on('playerReady', ({ readyCount, totalCount }) => {
  readyStatus.textContent = `${readyCount}/${totalCount} players ready`;
});

socket.on('gameResults', ({ results, choiceCounts, roundNumber: round }) => {
  resultsRound.textContent = round;
  rockCount.textContent = choiceCounts.rock;
  paperCount.textContent = choiceCounts.paper;
  scissorsCount.textContent = choiceCounts.scissors;

  resultsBody.innerHTML = '';
  results.forEach((player, index) => {
    const tr = document.createElement('tr');
    if (player.id === state.playerId) {
      tr.classList.add('highlight');
    }

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${player.username}${player.id === state.playerId ? ' (You)' : ''}</td>
      <td>${getChoiceEmoji(player.choice)}</td>
      <td>${player.wins}</td>
      <td>${player.losses}</td>
      <td>${player.ties}</td>
      <td>${player.score > 0 ? '+' : ''}${player.score}</td>
    `;
    resultsBody.appendChild(tr);
  });

  updateHostUI();
  showScreen('results');
});

socket.on('returnedToLobby', () => {
  state.currentChoice = null;
  showScreen('lobby');
  showToast('Returned to lobby', 'success');
});

socket.on('error', ({ message }) => {
  showToast(message, 'error');
});

socket.on('disconnect', () => {
  showToast('Disconnected from server', 'error');
});

socket.on('connect', () => {
  if (state.roomId) {
    showToast('Reconnected!', 'success');
  }
});

// Initialize
checkUrlForRoomCode();
