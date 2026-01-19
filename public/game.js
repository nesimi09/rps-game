// Connect to Socket.io server
const socket = io();

// State
let state = {
  roomId: null,
  playerId: null,
  isHost: false,
  username: '',
  currentChoice: null,
  timerInterval: null,
  timeLeft: 5,
  resultsTimer: null,
  opponent: null
};

// DOM Elements
const screens = {
  home: document.getElementById('homeScreen'),
  join: document.getElementById('joinScreen'),
  lobby: document.getElementById('lobbyScreen'),
  game: document.getElementById('gameScreen'),
  results: document.getElementById('resultsScreen')
};

// Home Screen Elements
const hostUsernameInput = document.getElementById('hostUsername');
const createRoomBtn = document.getElementById('createRoomBtn');

// Join Screen Elements
const joinUsernameInput = document.getElementById('joinUsername');
const joinRoomBtn = document.getElementById('joinRoomBtn');

// Lobby Screen Elements
const roomCodeDisplay = document.getElementById('roomCode');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const playerList = document.getElementById('playerList');
const playerCount = document.getElementById('playerCount');
const startGameBtn = document.getElementById('startGameBtn');
const waitingMessage = document.getElementById('waitingMessage');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');

// Game Screen Elements
const roundNumber = document.getElementById('roundNumber');
const opponentInfo = document.getElementById('opponentInfo');
const timerDisplay = document.getElementById('timerDisplay');
const choiceBtns = document.querySelectorAll('.choice-btn');
const choiceStatus = document.getElementById('choiceStatus');

// Results Screen Elements
const resultsRound = document.getElementById('resultsRound');
const roundResult = document.getElementById('roundResult');
const resultsBody = document.getElementById('resultsBody');
const backToLobbyBtn = document.getElementById('backToLobbyBtn');
const nextRoundCountdown = document.getElementById('nextRoundCountdown');
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
  setTimeout(() => toast.remove(), 3000);
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

function startTimer(duration) {
  state.timeLeft = duration;
  updateTimerDisplay();
  
  if (state.timerInterval) clearInterval(state.timerInterval);
  
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    updateTimerDisplay();
    
    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      choiceBtns.forEach(b => b.classList.add('disabled'));
      if (!state.currentChoice) {
        choiceStatus.textContent = "Time's up! You didn't choose.";
      } else {
        choiceStatus.textContent = `Time's up! Your choice: ${state.currentChoice}`;
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  if (timerDisplay) {
    timerDisplay.textContent = state.timeLeft;
    timerDisplay.className = 'timer-display';
    if (state.timeLeft <= 3) timerDisplay.classList.add('urgent');
  }
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

// Check for room code in URL
function checkUrlForRoomCode() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get('room');
  if (roomCode) {
    state.roomId = roomCode.toLowerCase();
    showScreen('join');
    document.title = `Join Room - Rock Paper Scissors Event`;
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
  if (!username) {
    showToast('Please enter your name', 'error');
    return;
  }
  if (!state.roomId) {
    showToast('No room to join', 'error');
    return;
  }
  state.username = username;
  socket.emit('joinRoom', { roomId: state.roomId, username });
});

copyLinkBtn.addEventListener('click', () => {
  const link = `${window.location.origin}?room=${state.roomId}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Link copied!', 'success');
  });
});

copyCodeBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(state.roomId).then(() => {
    showToast('Room code copied!', 'success');
  });
});

startGameBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

leaveRoomBtn.addEventListener('click', () => {
  window.location.href = window.location.origin;
});

choiceBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (state.isHost) {
      showToast('You are the host - observer only!', 'warning');
      return;
    }
    if (state.timeLeft <= 0) return;

    const choice = btn.dataset.choice;
    state.currentChoice = choice;

    choiceBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    choiceStatus.textContent = `You chose ${choice}!`;
    socket.emit('makeChoice', choice);
  });
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

  document.querySelectorAll('.kick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('kickPlayer', btn.dataset.id);
    });
  });
});

socket.on('playerJoined', ({ username }) => {
  showToast(`${username} joined`, 'success');
});

socket.on('playerLeft', ({ username }) => {
  showToast(`${username} left`, 'warning');
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

socket.on('gameStarted', ({ roundNumber: round, timerDuration, opponent }) => {
  state.currentChoice = null;
  state.opponent = opponent;
  roundNumber.textContent = round;
  
  if (state.isHost) {
    opponentInfo.innerHTML = '👁️ <strong>You are observing</strong>';
    choiceBtns.forEach(btn => {
      btn.classList.remove('selected', 'disabled');
      btn.classList.add('host-disabled');
    });
    choiceStatus.textContent = '';
  } else if (opponent) {
    opponentInfo.innerHTML = `⚔️ You are playing against: <strong>${opponent}</strong>`;
    choiceBtns.forEach(btn => {
      btn.classList.remove('selected', 'disabled', 'host-disabled');
    });
    choiceStatus.textContent = '';
  } else {
    opponentInfo.innerHTML = '👀 No opponent this round (odd number of players)';
    choiceBtns.forEach(btn => {
      btn.classList.add('disabled');
    });
    choiceStatus.textContent = 'Waiting for next round...';
  }

  showScreen('game');
  showToast(`Round ${round}!`, 'success');
  startTimer(timerDuration);
});

socket.on('gameResults', ({ leaderboard, roundNumber: round, yourResult, opponentName, yourChoice, opponentChoice }) => {
  stopTimer();
  
  resultsRound.textContent = round;
  
  // Show personal result for this round
  if (state.isHost) {
    roundResult.innerHTML = '👁️ You observed this round';
  } else if (yourResult === 'win') {
    roundResult.innerHTML = `🎉 You <strong>WON</strong> against ${opponentName}! (${getChoiceEmoji(yourChoice)} vs ${getChoiceEmoji(opponentChoice)})`;
    roundResult.className = 'round-result win';
  } else if (yourResult === 'lose') {
    roundResult.innerHTML = `😢 You <strong>LOST</strong> to ${opponentName} (${getChoiceEmoji(yourChoice)} vs ${getChoiceEmoji(opponentChoice)})`;
    roundResult.className = 'round-result lose';
  } else if (yourResult === 'tie') {
    roundResult.innerHTML = `🤝 <strong>TIE</strong> with ${opponentName}! (${getChoiceEmoji(yourChoice)} vs ${getChoiceEmoji(opponentChoice)})`;
    roundResult.className = 'round-result tie';
  } else if (yourResult === 'no_opponent') {
    roundResult.innerHTML = '👀 You had no opponent this round';
    roundResult.className = 'round-result';
  } else {
    roundResult.innerHTML = '';
    roundResult.className = 'round-result';
  }

  // Render leaderboard (sorted by wins)
  resultsBody.innerHTML = '';
  leaderboard.forEach((player, index) => {
    const tr = document.createElement('tr');
    if (player.id === state.playerId) tr.classList.add('highlight');
    
    let rankDisplay = index + 1;
    if (index === 0) rankDisplay = '🥇';
    else if (index === 1) rankDisplay = '🥈';
    else if (index === 2) rankDisplay = '🥉';

    tr.innerHTML = `
      <td>${rankDisplay}</td>
      <td>${player.username}${player.id === state.playerId ? ' (You)' : ''}</td>
      <td>${player.wins}</td>
    `;
    resultsBody.appendChild(tr);
  });

  // Countdown to next round
  let countdown = 5;
  nextRoundCountdown.textContent = `Next round in ${countdown}...`;
  
  if (state.resultsTimer) clearInterval(state.resultsTimer);
  state.resultsTimer = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      nextRoundCountdown.textContent = `Next round in ${countdown}...`;
    } else {
      nextRoundCountdown.textContent = 'Starting...';
      clearInterval(state.resultsTimer);
    }
  }, 1000);

  updateHostUI();
  showScreen('results');
});

socket.on('returnedToLobby', () => {
  state.currentChoice = null;
  state.opponent = null;
  stopTimer();
  if (state.resultsTimer) {
    clearInterval(state.resultsTimer);
    state.resultsTimer = null;
  }
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
  if (state.roomId && screens.lobby.classList.contains('active')) {
    showToast('Reconnected!', 'success');
  }
});

// Initialize
checkUrlForRoomCode();
