// Connect to Socket.io server with reconnection settings
const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 60000
});

// Handle reconnection
socket.on('connect', () => {
  console.log('Connected to server');
  // If we have room info, try to rejoin
  if (state.roomCode && state.username) {
    socket.emit('rejoinRoom', { roomCode: state.roomCode, username: state.username });
  }
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  if (reason === 'io server disconnect') {
    // Server disconnected us, try to reconnect
    socket.connect();
  }
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  showToast('Reconnected to server', 'success');
});

socket.on('reconnect_error', () => {
  showToast('Connection lost, trying to reconnect...', 'warning');
});

// State
let state = {
  roomId: null,
  roomCode: null,
  playerId: null,
  isHost: false,
  username: '',
  currentChoice: null,
  timerInterval: null,
  timeLeft: 5,
  resultsTimer: null,
  opponent: null,
  changeRoomClickState: 0, // 0 = not clicked, 1 = ready to change
  cancelGameClickState: 0 // 0 = not clicked, 1 = ready to cancel
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
const roomCodeSection = document.getElementById('roomCodeSection');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const changeRoomCodeBtn = document.getElementById('changeRoomCodeBtn');
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

// Cancel Game Buttons
const cancelGameBtn = document.getElementById('cancelGameBtn');
const cancelGameResultsBtn = document.getElementById('cancelGameResultsBtn');

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
  
  // Show/hide room code section based on host status
  if (roomCodeSection) {
    roomCodeSection.style.display = state.isHost ? 'flex' : 'none';
  }
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
    state.roomCode = roomCode.toLowerCase();
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
  if (!state.roomCode) {
    showToast('No room to join', 'error');
    return;
  }
  state.username = username;
  socket.emit('joinRoom', { roomCode: state.roomCode, username });
});

copyLinkBtn.addEventListener('click', () => {
  const link = `${window.location.origin}?room=${state.roomCode}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Link copied!', 'success');
  });
});

copyCodeBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(state.roomCode).then(() => {
    showToast('Room code copied!', 'success');
  });
});

startGameBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

leaveRoomBtn.addEventListener('click', () => {
  window.location.href = window.location.origin;
});

if (changeRoomCodeBtn) {
  changeRoomCodeBtn.addEventListener('click', () => {
    if (state.changeRoomClickState === 0) {
      // First click - show confirmation state
      state.changeRoomClickState = 1;
      changeRoomCodeBtn.textContent = 'Click again to change';
      changeRoomCodeBtn.classList.add('ready-to-change');
      showToast('Click again to change room code. Old links will stop working!', 'warning');
    } else {
      // Second click - actually change the room code
      state.changeRoomClickState = 0;
      changeRoomCodeBtn.textContent = 'Change Room Code & Link';
      changeRoomCodeBtn.classList.remove('ready-to-change');
      socket.emit('changeRoomCode');
    }
  });
}

// Cancel Game button handlers (both game screen and results screen)
function handleCancelGameClick(btn) {
  if (state.cancelGameClickState === 0) {
    // First click - show confirmation state
    state.cancelGameClickState = 1;
    btn.textContent = 'Click again to confirm';
    btn.classList.add('ready-to-cancel');
    showToast('Click again to cancel the game', 'warning');
    
    // Reset after 3 seconds if not clicked again
    setTimeout(() => {
      if (state.cancelGameClickState === 1) {
        state.cancelGameClickState = 0;
        resetCancelButtons();
      }
    }, 3000);
  } else {
    // Second click - actually cancel the game
    state.cancelGameClickState = 0;
    resetCancelButtons();
    socket.emit('cancelGame');
  }
}

function resetCancelButtons() {
  if (cancelGameBtn) {
    cancelGameBtn.textContent = 'Cancel Game';
    cancelGameBtn.classList.remove('ready-to-cancel');
  }
  if (cancelGameResultsBtn) {
    cancelGameResultsBtn.textContent = 'Cancel Game';
    cancelGameResultsBtn.classList.remove('ready-to-cancel');
  }
}

if (cancelGameBtn) {
  cancelGameBtn.addEventListener('click', () => handleCancelGameClick(cancelGameBtn));
}

if (cancelGameResultsBtn) {
  cancelGameResultsBtn.addEventListener('click', () => handleCancelGameClick(cancelGameResultsBtn));
}

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
socket.on('roomCreated', ({ roomId, roomCode, playerId, isHost }) => {
  state.roomId = roomId;
  state.roomCode = roomCode;
  state.playerId = playerId;
  state.isHost = isHost;

  roomCodeDisplay.textContent = roomCode;
  updateHostUI();
  showScreen('lobby');
  window.history.pushState({}, '', `?room=${roomCode}`);
  showToast('Room created!', 'success');
});

socket.on('roomJoined', ({ roomId, roomCode, playerId, isHost, username }) => {
  state.roomId = roomId;
  state.roomCode = roomCode;
  state.playerId = playerId;
  state.isHost = isHost;
  state.username = username;

  roomCodeDisplay.textContent = roomCode;
  updateHostUI();
  showScreen('lobby');
  showToast('Joined room!', 'success');
});

// Handle successful rejoin after reconnection
socket.on('rejoinSuccess', ({ roomId, roomCode, playerId, isHost, username, gameState, chatLocked }) => {
  state.roomId = roomId;
  state.roomCode = roomCode;
  state.playerId = playerId;
  state.isHost = isHost;
  state.username = username;

  roomCodeDisplay.textContent = roomCode;
  updateHostUI();
  
  // Show appropriate screen based on game state
  if (gameState === 'lobby') {
    showScreen('lobby');
  }
  // If game is in progress, the next round/result event will update the screen
  
  showToast('Reconnected!', 'success');
});

// Handle failed rejoin - reset to home
socket.on('rejoinFailed', () => {
  state.roomId = null;
  state.roomCode = null;
  state.playerId = null;
  state.isHost = false;
  state.username = '';
  showScreen('home');
  showToast('Room no longer exists', 'warning');
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
  updateGameLayout(true);
  
  if (state.isHost) {
    opponentInfo.innerHTML = '<strong>You are observing</strong>';
    choiceBtns.forEach(btn => {
      btn.classList.remove('selected', 'disabled');
      btn.classList.add('host-disabled');
    });
    choiceStatus.textContent = '';
  } else if (opponent) {
    opponentInfo.innerHTML = `You are playing against: <strong>${opponent}</strong>`;
    choiceBtns.forEach(btn => {
      btn.classList.remove('selected', 'disabled', 'host-disabled');
    });
    choiceStatus.textContent = '';
  } else {
    opponentInfo.innerHTML = 'No opponent this round (odd number of players)';
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
    roundResult.innerHTML = 'You observed this round';
  } else if (yourResult === 'win') {
    roundResult.innerHTML = `You <strong>WON</strong> against ${opponentName}! (${getChoiceEmoji(yourChoice)} vs ${getChoiceEmoji(opponentChoice)})`;
    roundResult.className = 'round-result win';
  } else if (yourResult === 'lose') {
    roundResult.innerHTML = `You <strong>LOST</strong> to ${opponentName} (${getChoiceEmoji(yourChoice)} vs ${getChoiceEmoji(opponentChoice)})`;
    roundResult.className = 'round-result lose';
  } else if (yourResult === 'tie') {
    roundResult.innerHTML = `<strong>TIE</strong> with ${opponentName}! (${getChoiceEmoji(yourChoice)} vs ${getChoiceEmoji(opponentChoice)})`;
    roundResult.className = 'round-result tie';
  } else if (yourResult === 'no_opponent') {
    roundResult.innerHTML = 'You had no opponent this round';
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

socket.on('gameOver', ({ winners, leaderboard }) => {
  stopTimer();
  if (state.resultsTimer) {
    clearInterval(state.resultsTimer);
    state.resultsTimer = null;
  }
  
  // Show winner banner
  let winnerText = '';
  if (winners.length === 1) {
    winnerText = `${winners[0]} WINS with 10 points!`;
  } else {
    winnerText = `TIE! ${winners.join(' & ')} reached 10 points!`;
  }
  
  roundResult.innerHTML = winnerText;
  roundResult.className = 'round-result win game-over';
  
  // Render final leaderboard
  resultsBody.innerHTML = '';
  leaderboard.forEach((player, index) => {
    const tr = document.createElement('tr');
    if (player.id === state.playerId) tr.classList.add('highlight');
    if (winners.some(w => w === player.username)) tr.classList.add('winner');
    
    let rankDisplay = index + 1;

    tr.innerHTML = `
      <td>${rankDisplay}</td>
      <td>${player.username}${player.id === state.playerId ? ' (You)' : ''}</td>
      <td>${player.wins}</td>
    `;
    resultsBody.appendChild(tr);
  });

  nextRoundCountdown.textContent = 'Game Over!';
  if (state.isHost) backToLobbyBtn.style.display = 'inline-block';
  
  showScreen('results');
});

socket.on('returnedToLobby', () => {
  state.currentChoice = null;
  state.opponent = null;
  state.changeRoomClickState = 0;
  state.cancelGameClickState = 0;
  resetCancelButtons();
  updateGameLayout(false);
  if (changeRoomCodeBtn) {
    changeRoomCodeBtn.textContent = 'Change Room Code & Link';
    changeRoomCodeBtn.classList.remove('ready-to-change');
  }
  stopTimer();
  if (state.resultsTimer) {
    clearInterval(state.resultsTimer);
    state.resultsTimer = null;
  }
  showScreen('lobby');
  showToast('Returned to lobby', 'success');
});

socket.on('gameCancelled', () => {
  state.currentChoice = null;
  state.opponent = null;
  state.changeRoomClickState = 0;
  state.cancelGameClickState = 0;
  resetCancelButtons();
  updateGameLayout(false);
  if (changeRoomCodeBtn) {
    changeRoomCodeBtn.textContent = 'Change Room Code & Link';
    changeRoomCodeBtn.classList.remove('ready-to-change');
  }
  stopTimer();
  if (state.resultsTimer) {
    clearInterval(state.resultsTimer);
    state.resultsTimer = null;
  }
  showScreen('lobby');
  showToast('Game was cancelled by the host', 'warning');
});

socket.on('roomCodeChanged', ({ newRoomCode }) => {
  state.roomCode = newRoomCode;
  state.changeRoomClickState = 0;
  if (changeRoomCodeBtn) {
    changeRoomCodeBtn.textContent = 'Change Room Code & Link';
    changeRoomCodeBtn.classList.remove('ready-to-change');
  }
  roomCodeDisplay.textContent = newRoomCode;
  window.history.pushState({}, '', `?room=${newRoomCode}`);
  showToast('Room code changed! Old links will no longer work.', 'success');
});

socket.on('newRoomGenerated', ({ newRoomId }) => {
  // Legacy handler - no longer used
});

socket.on('hostLeft', () => {
  showToast('Host left - room closed', 'error');
  setTimeout(() => {
    window.location.href = window.location.origin;
  }, 2000);
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

// ==================== CHAT FUNCTIONALITY ====================

// Chat DOM Elements - Global Sidebar
const chatSidebar = document.getElementById('chatSidebar');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const closeChatBtn = document.getElementById('closeChatBtn');
const chatContainer = document.getElementById('chatContainer');
const chatToggleFloat = document.getElementById('chatToggleFloat');
const chatUnreadBadge = document.getElementById('chatUnreadBadge');

// Chat State
let chatOpen = false;
let chatHidden = false;
let messageIdCounter = 0;
let chatLocked = false;
let unreadCount = 0;

// Chat Lock DOM Elements
const lockChatBtn = document.getElementById('lockChatBtn');
const chatLockIndicator = document.getElementById('chatLockIndicator');

// Show/hide chat sidebar based on room state
function updateChatVisibility() {
  const inRoom = state.roomId !== null;
  
  if (chatToggleFloat) {
    chatToggleFloat.style.display = inRoom ? 'flex' : 'none';
  }
  
  if (chatSidebar) {
    if (!inRoom) {
      chatSidebar.style.display = 'none';
      chatSidebar.classList.remove('chat-open');
      chatOpen = false;
    }
  }
}

// Open/close chat functions
function openChat() {
  chatOpen = true;
  if (chatSidebar) {
    chatSidebar.style.display = 'flex';
    chatSidebar.classList.remove('chat-closed');
    setTimeout(() => chatSidebar.classList.add('chat-open'), 10);
  }
  // Clear unread count
  unreadCount = 0;
  updateUnreadBadge();
  // Focus input
  if (chatInput) {
    setTimeout(() => chatInput.focus(), 300);
  }
}

function closeChat() {
  chatOpen = false;
  if (chatSidebar) {
    chatSidebar.classList.remove('chat-open');
    // Wait for animation then hide
    setTimeout(() => {
      if (!chatOpen) {
        chatSidebar.style.display = 'none';
      }
    }, 300);
  }
}

function updateUnreadBadge() {
  if (chatUnreadBadge) {
    if (unreadCount > 0 && !chatOpen) {
      chatUnreadBadge.style.display = 'flex';
      chatUnreadBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    } else {
      chatUnreadBadge.style.display = 'none';
    }
  }
}

// Update layout for game/results screens (shift content for chat sidebar)
function updateGameLayout(isInGame) {
  if (isInGame) {
    document.body.classList.add('in-game');
  } else {
    document.body.classList.remove('in-game');
  }
}

// Chat Helper Functions
function addChatMessage(container, sender, text, isOwn = false, isSystem = false, messageId = null, senderId = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message';
  
  // Use provided messageId or generate a local one
  const msgId = messageId || `local-${++messageIdCounter}`;
  messageDiv.dataset.messageId = msgId;
  if (senderId) messageDiv.dataset.senderId = senderId;
  
  if (isSystem) {
    messageDiv.classList.add('system');
    messageDiv.innerHTML = `<span class="chat-message-text">${text}</span>`;
  } else {
    if (isOwn) messageDiv.classList.add('own');
    
    // Add delete and kick buttons for host (only on non-own messages)
    const deleteBtn = state.isHost && !isOwn && !isSystem ? `<button class="chat-delete-btn" data-msg-id="${msgId}" title="Delete message">×</button>` : '';
    const kickBtn = state.isHost && !isOwn && !isSystem && senderId ? `<button class="chat-kick-btn" data-sender-id="${senderId}" title="Kick player">Kick</button>` : '';
    
    messageDiv.innerHTML = `
      ${deleteBtn}
      ${kickBtn}
      <div class="chat-message-sender">${sender}</div>
      <div class="chat-message-text">${text}</div>
    `;
    
    // Attach delete event listener
    if (state.isHost && !isOwn && !isSystem) {
      const delBtn = messageDiv.querySelector('.chat-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          socket.emit('deleteMessage', { messageId: msgId });
        });
      }
      
      // Attach kick event listener (double click confirmation)
      const kickButton = messageDiv.querySelector('.chat-kick-btn');
      if (kickButton && senderId) {
        let kickConfirm = false;
        kickButton.addEventListener('click', () => {
          if (!kickConfirm) {
            kickConfirm = true;
            kickButton.textContent = 'Sure?';
            kickButton.classList.add('confirm');
            setTimeout(() => {
              kickConfirm = false;
              kickButton.textContent = 'Kick';
              kickButton.classList.remove('confirm');
            }, 3000);
          } else {
            socket.emit('kickPlayer', senderId);
            kickConfirm = false;
          }
        });
      }
    }
  }
  
  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}

function syncChatMessages() {
  // No longer needed with single chat sidebar
}

function sendChatMessage(inputElement) {
  const message = inputElement.value.trim();
  if (!message) return;
  if (!state.roomId) return;
  
  socket.emit('chatMessage', { message });
  inputElement.value = '';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Chat Event Listeners - Lobby
if (sendChatBtn) {
  sendChatBtn.addEventListener('click', () => sendChatMessage(chatInput));
}

if (chatInput) {
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage(chatInput);
    }
  });
}

// Chat toggle button (floating) - toggles open/close
if (chatToggleFloat) {
  chatToggleFloat.addEventListener('click', () => {
    if (chatOpen) {
      closeChat();
    } else {
      openChat();
    }
  });
}

// Close chat when clicking outside on mobile
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 1000 && chatOpen) {
    if (!chatSidebar.contains(e.target) && !chatToggleFloat.contains(e.target)) {
      closeChat();
    }
  }
});

// Socket Chat Events
socket.on('chatMessage', ({ sender, message, senderId, messageId }) => {
  const isOwn = senderId === state.playerId;
  const escapedMessage = escapeHtml(message);
  const escapedSender = escapeHtml(sender);
  
  // Add to chat sidebar
  if (chatMessages) {
    addChatMessage(chatMessages, escapedSender, escapedMessage, isOwn, false, messageId, senderId);
  }
  
  // Increment unread count if chat is closed and message is not from self
  if (!chatOpen && !isOwn) {
    unreadCount++;
    updateUnreadBadge();
  }
});

// Chat history for new players joining
socket.on('chatHistory', (history) => {
  if (!chatMessages) return;
  
  history.forEach(({ sender, message, senderId, messageId }) => {
    const isOwn = senderId === state.playerId;
    const escapedMessage = escapeHtml(message);
    const escapedSender = escapeHtml(sender);
    addChatMessage(chatMessages, escapedSender, escapedMessage, isOwn, false, messageId, senderId);
  });
});

socket.on('messageDeleted', ({ messageId }) => {
  // Remove message from both chat containers
  document.querySelectorAll(`[data-message-id="${messageId}"]`).forEach(el => {
    el.remove();
  });
});

socket.on('chatLocked', ({ locked }) => {
  chatLocked = locked;
  updateChatLockUI();
});

function updateChatLockUI() {
  // Update lock indicator
  if (chatLockIndicator) {
    chatLockIndicator.style.display = chatLocked ? 'inline' : 'none';
  }
  
  // Update lock button text
  const btnText = chatLocked ? 'Unlock' : 'Lock';
  if (lockChatBtn) lockChatBtn.textContent = btnText;
  
  // Disable/enable inputs for non-hosts
  const isDisabled = chatLocked && !state.isHost;
  
  if (chatInput) {
    chatInput.disabled = isDisabled;
    chatInput.placeholder = isDisabled ? 'Chat is locked by host' : 'Type a message...';
  }
  if (sendChatBtn) sendChatBtn.disabled = isDisabled;
}

// Lock chat button event listener
if (lockChatBtn) {
  lockChatBtn.addEventListener('click', () => {
    socket.emit('toggleChatLock');
  });
}

socket.on('chatSystem', ({ message }) => {
  const escapedMessage = escapeHtml(message);
  
  // Add to chat sidebar
  if (chatMessages) {
    addChatMessage(chatMessages, '', escapedMessage, false, true);
  }
});

// Clear chat when joining a new room
const originalRoomCreated = socket.listeners('roomCreated')[0];
socket.off('roomCreated');
socket.on('roomCreated', (data) => {
  // Clear chat messages and reset lock state
  if (chatMessages) chatMessages.innerHTML = '';
  chatLocked = false;
  updateChatLockUI();
  updateGameLayout(false);
  
  // Call original handler
  state.roomId = data.roomId;
  state.roomCode = data.roomCode;
  state.playerId = data.playerId;
  state.isHost = data.isHost;

  roomCodeDisplay.textContent = data.roomCode;
  updateHostUI();
  updateChatVisibility();
  showScreen('lobby');
  window.history.pushState({}, '', `?room=${data.roomCode}`);
  showToast('Room created!', 'success');
});

const originalRoomJoined = socket.listeners('roomJoined')[0];
socket.off('roomJoined');
socket.on('roomJoined', (data) => {
  // Clear chat messages and set lock state from server
  if (chatMessages) chatMessages.innerHTML = '';
  chatLocked = data.chatLocked || false;
  updateChatLockUI();
  updateGameLayout(false);
  
  // Call original handler logic
  state.roomId = data.roomId;
  state.roomCode = data.roomCode;
  state.playerId = data.playerId;
  state.isHost = data.isHost;
  state.username = data.username;

  roomCodeDisplay.textContent = data.roomCode;
  updateHostUI();
  updateChatVisibility();
  showScreen('lobby');
  showToast('Joined room!', 'success');
});

// Initialize
checkUrlForRoomCode();
