# Multiplayer Guide

## Modes

Quick Match currently supports:

- `Single Player`
- `Local Split-Screen (2 Players)`
- `LAN Remote Controller (Player 2)`

## Local Split-Screen

### Requirements

- Host device running the game.
- Two local control sources:
  - Player 1: keyboard/mouse (and/or gamepad 0)
  - Player 2: gamepad 1

### Setup

1. Open Quick Match.
2. Set `Multiplayer` to `Local Split-Screen (2 Players)`.
3. Start the match.

### Behavior

- Screen is split vertically (left/right).
- Each local player has independent camera follow.
- Player switching and throw control are per player.
- AI controls any players not currently controlled by P1/P2.

## LAN Remote Controller

This mode lets Player 2 control from a second device over websocket.

### Host Setup

1. Open Quick Match.
2. Set `Multiplayer` to `LAN Remote Controller (Player 2)`.
3. Set:
   - `LAN Relay WebSocket URL` (default production: `wss://fqd.penguins.fg-goose.online/ws`)
   - `Room Code` (same code used by controller)
4. Start the match.

### Controller Setup (Second Device)

1. Open `https://fqd.penguins.fg-goose.online/controller.html`.
2. Enter the same relay URL and room code.
3. Tap `Connect`.

You can also use the prefilled controller link shown in Quick Match setup.

### Controller Inputs

On-screen controls include:

- Move pad
- Aim pad
- Throw/Forehand/Sprint/Jump
- Switch
- Hammer/Blade/Thumber
- High/Low release
- Curve +/- (hyzer/anhyzer)

The controller page also supports one connected gamepad.

## Lowest-Latency LAN Option

For best local-network latency, run the relay close to both players:

```bash
npm run lan:relay
```

Then use:

- Relay URL: `ws://<relay-machine-local-ip>:8787/ws`
- Same room code on host and controller.

Use `wss://` only when terminating TLS in front of the relay.

## Troubleshooting

### Controller never connects

- Confirm host and controller use exact same relay URL and room.
- Verify relay health endpoint returns OK (`/health`).
- Check relay service logs if self-hosted.

### Host shows disconnected LAN badge

- Controller likely disconnected or joined different room.
- Reconnect controller and confirm `Connected` status on the controller page.

### `/ws` returns 404 in browser

- Normal for plain HTTP GET.
- `/ws` is a websocket endpoint and requires websocket upgrade.

### High latency or stutter

- Prefer LAN relay URL (`ws://local-ip:8787/ws`) over public internet route.
- Reduce Wi-Fi contention or move both devices to same AP/band.

## Security Note

Relay rooms are lightweight session channels, not authenticated identities. For public deployments, add access controls and rate limiting before exposing relay endpoints broadly.
