# Rock Paper Scissors - Multiplayer

A real-time multiplayer Rock Paper Scissors game built with Node.js, Express, and Socket.io.

## Features

- **Create & Join Rooms**: Host creates a unique room code, others join via link or code
- **Real-time Gameplay**: All players see updates instantly via WebSockets
- **Host Controls**: Start game, kick players, manage rounds
- **Multi-player Support**: Supports many players in the same room
- **Round-based Scoring**: Track wins, losses, and ties against all opponents
- **Responsive Design**: Works on desktop and mobile

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open in browser:**
   ```
   http://localhost:3000
   ```

## How to Play

1. **Create a Room**: Enter your name and click "Create Room"
2. **Share the Link**: Copy the room link and share with friends
3. **Wait for Players**: Players join by opening the link and entering their name
4. **Start the Game**: Host clicks "Start Game" when ready
5. **Make Your Choice**: Everyone picks Rock, Paper, or Scissors
6. **View Results**: See how you did against all other players!

## Deployment (Free Hosting Options)

### Option 1: Render.com (Recommended)

1. Push code to GitHub
2. Go to [render.com](https://render.com) and create account
3. Click "New" → "Web Service"
4. Connect your GitHub repo
5. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Deploy!

### Option 2: Railway.app

1. Go to [railway.app](https://railway.app)
2. Click "Start New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Railway auto-detects Node.js and deploys

### Option 3: Glitch.com

1. Go to [glitch.com](https://glitch.com)
2. Click "New Project" → "Import from GitHub"
3. Paste your repo URL
4. Project auto-deploys

### Option 4: Fly.io

1. Install Fly CLI: `brew install flyctl`
2. Login: `fly auth login`
3. Launch: `fly launch`
4. Deploy: `fly deploy`

## Project Structure

```
rps/
├── server.js          # Node.js server with Socket.io
├── package.json       # Dependencies and scripts
├── public/
│   ├── index.html     # Main HTML file
│   ├── styles.css     # Styling
│   └── game.js        # Client-side JavaScript
└── README.md          # This file
```

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML, CSS, JavaScript
- **Real-time**: WebSockets via Socket.io

## Game Rules

Each player's choice is compared against ALL other players:
- Rock beats Scissors
- Scissors beats Paper  
- Paper beats Rock

**Scoring**: `Score = Wins - Losses`

Players are ranked by their score at the end of each round.

## License

MIT
