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
  resultsTimer: null
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
const joinSection = document.getElementById('joinSection');
const createSection = document.getElementById('createSection');

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
const timerDisplay = document.getElementById('timerDisplay');
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

function startTimer(duration) {
  state.timeLeft = duration;
  updateTimerDisplay();
  
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
  }
  
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
    if (state.timeLeft <= 3) {
      timerDisplay.classList.add('urgent');
    }
  }
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

// Check for room code in URL and setup auto-join
function checkUrlForRoomCode() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get('room');
  const nameParam = urlParams.get('name') || urlParams.get('username');
  if (roomCode) {
    // Show only join section, hide create section
    roomCodeInput.value = roomCode;
    if (createSection) createSection.style.display = 'none';
    if (joinSection) joinSection.style.display = 'block';
    
    // If a name is provided, auto-join the room
    if (nameParam) {
      const cleanedName = decodeURIComponent(nameParam).trim().slice(0, 20);
      joinUsernameInput.value = cleanedName;
      state.username = cleanedName;
      const tryJoin = () => {
        socket.emit('joinRoom', { roomId: roomCode.toLowerCase(), username: cleanedName });
        showToast('Joining room…', 'info');
      };
      if (socket.connected) tryJoin();
      else socket.once('connect', tryJoin);
    } else {
      joinUsernameInput.focus();
    }
    
    // Update page title
    document.title = `Join Room ${roomCode} - Rock Paper Scissors`;
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
    // Host cannot play
    if (state.isHost) {
      showToast('You are the host - observer only!', 'warning');
      return;
    }
    
    // Don't allow if timer expired
    if (state.timeLeft <= 0) return;

    const choice = btn.dataset.choice;
    const previousChoice = state.currentChoice;
    state.currentChoice = choice;

    // Update button styles - allow changing
    choiceBtns.forEach(b => {
      b.classList.remove('selected');
    });
    btn.classList.add('selected');

    if (previousChoice && previousChoice !== choice) {
      choiceStatus.textContent = `Changed to ${choice}! (You can change again)`;
    } else {
      choiceStatus.textContent = `You chose ${choice}! (You can change until time runs out)`;
    }
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

socket.on('gameStarted', ({ roundNumber: round, timerDuration }) => {
  state.currentChoice = null;
  roundNumber.textContent = round;
  readyStatus.textContent = '0/0 players ready';
  
  // Show different message for host (observer)
  if (state.isHost) {
    choiceStatus.textContent = '👁️ You are observing - watch the players!';
    choiceBtns.forEach(btn => {
      btn.classList.remove('selected', 'disabled');
      btn.classList.add('host-disabled');
    });
  } else {
    choiceStatus.textContent = '';
    choiceBtns.forEach(btn => {
      btn.classList.remove('selected', 'disabled', 'host-disabled');
    });
  }

  showScreen('game');
  showToast(`Round ${round}! ${timerDuration} seconds to choose!`, 'success');
  
  // Start the countdown timer
  startTimer(timerDuration);
});

socket.on('playerReady', ({ readyCount, totalCount }) => {
  readyStatus.textContent = `${readyCount}/${totalCount} players ready`;
});

socket.on('gameResults', ({ results, choiceCounts, roundNumber: round, hasWinner, isTie, winners, pointsToWin }) => {
  // Stop the timer
  stopTimer();
  
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
    
    // Highlight winners
    if (player.totalPoints >= pointsToWin) {
      tr.classList.add('winner');
    }
    
    // Add medal for top 3
    let rankDisplay = index + 1;
    if (index === 0) rankDisplay = '🥇';
    else if (index === 1) rankDisplay = '🥈';
    else if (index === 2) rankDisplay = '🥉';

    tr.innerHTML = `
      <td>${rankDisplay}</td>
      <td>${player.username}${player.id === state.playerId ? ' (You)' : ''}</td>
      <td>${getChoiceEmoji(player.choice)}</td>
      <td class="round-wins">+${player.roundWins}</td>
      <td class="round-losses">-${player.roundLosses}</td>
      <td>${player.roundTies}</td>
      <td class="total-points">${player.totalPoints}</td>
    `;
    resultsBody.appendChild(tr);
  });

  // Update winner display
  const winnerDisplay = document.getElementById('winnerDisplay');
  const nextRoundCountdown = document.getElementById('nextRoundCountdown');
  
  if (hasWinner) {
    if (isTie) {
      winnerDisplay.innerHTML = `<div class="tie-message">🏆 TIE! ${winners.join(' & ')} reached ${pointsToWin} points!<br><small>Host: Create a tiebreaker room!</small></div>`;
    } else {
      winnerDisplay.innerHTML = `<div class="winner-message">🎉 ${winners[0]} WINS with ${pointsToWin} points! 🎉</div>`;
    }
    winnerDisplay.style.display = 'block';
    nextRoundCountdown.style.display = 'none';
    
    // Show host controls for new game
    if (state.isHost) {
      playAgainBtn.style.display = 'none';
      backToLobbyBtn.style.display = 'inline-block';
    }
  } else {
    winnerDisplay.style.display = 'none';
    nextRoundCountdown.style.display = 'block';
    
    // Start countdown to next round
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
  }

  updateHostUI();
  showScreen('results');
});

socket.on('returnedToLobby', () => {
  state.currentChoice = null;
  stopTimer();
  if (state.resultsTimer) {
    clearInterval(state.resultsTimer);
    state.resultsTimer = null;
  }
  showScreen('lobby');
  showToast('Returned to lobby - scores reset', 'success');
});

socket.on('choiceChanged', ({ from, to }) => {
  showToast(`Changed from ${from} to ${to}`, 'info');
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
