# Infinite Hex Tic-Tac-Toe

A browser-based infinite hex-grid strategy game where players race to connect **6 in a row**.  
It includes stackable rule modes like `Duck`, `King Duck`, `Echo`, `Orbit`, and `Meteor`.

## Quick Start

1. Clone this repository.
2. For local play only, open [hex_tictactoe_absurd_modes.html](./hex_tictactoe_absurd_modes.html) in a modern browser.
3. For online rooms, run:

```bash
npm install
npm start
```

4. Open `http://localhost:8080` in both browsers/tabs.

No build step is required.

## Online Rooms

- Online rooms require the Node server (`server.js`) so WebSockets are available.
- Turn control is server-authoritative: spectators cannot submit moves, and players can only update state on their own turn.
- State updates are revision-checked to prevent stale overwrites when two clients act at once.

### Cloud hosting

The server is cloud-friendly by default:

- Binds to `PORT` (for platforms like Render/Railway/Fly/Heroku).
- Uses WebSocket heartbeat pings (default `25000ms`) to keep proxy connections alive.
- Exposes `GET /healthz` for health checks.

Optional server env vars:

- `WS_PATH` (default `/ws`)
- `WS_HEARTBEAT_MS` (minimum `5000`, default `25000`)

If your frontend and backend are on different hosts, set the client WebSocket endpoint using one of:

- Query string: `?ws=wss://your-server.example/ws`
- `<meta name="hex-ws-url" content="wss://your-server.example/ws" />`
- `window.HEX_TTT_WS_URL = "wss://your-server.example/ws"`

## Rules

- Player 1 opens with **1 placement**.
- Every turn after that uses **2 placements**.
- The first move must be at **(0, 0)**.
- Later placements must be within **8 hexes** of an existing occupied hex.
- A line of **6 stones** wins.

## Controls

- Left click: place/move
- Right click or middle mouse drag: pan
- Mouse wheel: zoom
- `New Game`: restart with selected modes
- `Undo`: revert one action
- `Centre Board`: reset camera

## Modes

- **Duck**: move duck after your placements; no one can place on it.
- **King Duck**: adds a panic ring around the king duck.
- **Echo**: mirrors placements/bird moves after two full turns.
- **Orbit**: stones move one orbit step per full turn (birds stay put).
- **Meteor**: every 3 full turns, farthest occupied hexes are removed.

## Project Structure

```text
hex_tictactoe_absurd_modes.html   # Markup shell
hex_tictactoe_absurd_modes.css    # Styling and animated background
hex_tictactoe_absurd_modes.js     # Game logic and rendering
```

## GitHub Pages

This repo includes a workflow at `.github/workflows/pages.yml` for static deployment.

1. Push to `main`.
2. In GitHub repository settings, enable **Pages** with **GitHub Actions** as source.
3. The workflow will publish the site automatically on pushes to `main`.

## License

This project is licensed under the [MIT License](./LICENSE).
