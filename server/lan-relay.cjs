#!/usr/bin/env node
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8787);
const WS_PATH = process.env.WS_PATH || '/ws';
const HOST = process.env.HOST || '0.0.0.0';

const rooms = new Map();

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
        return;
    }

    if (req.url === '/' || req.url === '/status') {
        const activeRooms = Array.from(rooms.entries()).map(([room, peers]) => ({
            room,
            host: Boolean(peers.host),
            controller: Boolean(peers.controller),
        }));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, activeRooms }));
        return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const rawUrl = request.url || '';
    const path = rawUrl.split('?')[0] || '';
    if (path !== WS_PATH) {
        socket.destroy();
        return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

function getOrCreateRoom(room) {
    let peers = rooms.get(room);
    if (!peers) {
        peers = { 
            host: null, 
            controllers: new Map(), 
            spectators: new Set(),
            metadata: {
                homeName: 'Home',
                awayName: 'Away',
                homeScore: 0,
                awayScore: 0,
                phase: 'pre_pull',
                playerCount: 0,
                spectatorCount: 0,
                lastUpdate: Date.now(),
                joinable: true
            }
        };
        rooms.set(room, peers);
    }
    return peers;
}

function removeRoomIfEmpty(room) {
    const peers = rooms.get(room);
    if (!peers) return;
    if (!peers.host && peers.controllers.size === 0 && peers.spectators.size === 0) {
        rooms.delete(room);
    }
}

function sendJson(ws, payload) {
    if (!ws || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(payload));
}

function notifyHostPeerState(room) {
    const peers = rooms.get(room);
    if (!peers || !peers.host) return;
    sendJson(peers.host, {
        type: 'peer_state',
        connected: peers.controllers.size > 0,
        controllerCount: peers.controllers.size,
        spectatorCount: peers.spectators.size,
    });
}

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.room = '';
    ws.role = '';
    ws.id = Math.random().toString(36).substring(2, 9);

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (raw) => {
        let msg = null;
        try {
            msg = JSON.parse(String(raw));
        } catch {
            return;
        }

        if (msg && msg.type === 'list_rooms') {
            const list = Array.from(rooms.entries()).map(([name, r]) => ({
                room: name,
                ...r.metadata,
                controllerCount: r.controllers.size,
                spectatorCount: r.spectators.size,
                hasHost: Boolean(r.host)
            })).filter(r => r.hasHost);
            sendJson(ws, { type: 'room_list', rooms: list });
            return;
        }

        if (msg && msg.type === 'join_host' && typeof msg.room === 'string') {
            const room = msg.room.trim();
            if (!room) return;
            const peers = getOrCreateRoom(room);
            if (peers.host && peers.host !== ws) {
                peers.host.close(4001, 'new host connected');
            }
            peers.host = ws;
            ws.room = room;
            ws.role = 'host';
            notifyHostPeerState(room);
            return;
        }

        if (msg && msg.type === 'host_metadata' && ws.role === 'host') {
            const peers = rooms.get(ws.room);
            if (peers) {
                peers.metadata = {
                    ...peers.metadata,
                    ...msg.metadata,
                    lastUpdate: Date.now()
                };
            }
            return;
        }

        if (msg && msg.type === 'join_controller' && typeof msg.room === 'string') {
            const room = msg.room.trim();
            if (!room) return;
            const peers = getOrCreateRoom(room);
            peers.controllers.set(ws.id, ws);
            ws.room = room;
            ws.role = 'controller';
            notifyHostPeerState(room);
            return;
        }

        if (msg && msg.type === 'join_spectator' && typeof msg.room === 'string') {
            const room = msg.room.trim();
            if (!room) return;
            const peers = getOrCreateRoom(room);
            peers.spectators.add(ws);
            ws.room = room;
            ws.role = 'spectator';
            notifyHostPeerState(room);
            return;
        }

        if (msg && msg.type === 'controller_input' && ws.role === 'controller') {
            const peers = rooms.get(ws.room);
            if (!peers || !peers.host) return;
            // Inject controller ID into message
            msg.controllerId = ws.id;
            sendJson(peers.host, msg);
            return;
        }

        if (msg && msg.type === 'broadcast_state' && ws.role === 'host') {
            const peers = rooms.get(ws.room);
            if (!peers) return;
            
            // Forward to all spectators and controllers
            for (const controller of peers.controllers.values()) {
                sendJson(controller, msg);
            }
            for (const spectator of peers.spectators) {
                sendJson(spectator, msg);
            }
            return;
        }

        // WebRTC signaling: forward between host and controller in same room
        if (msg && (msg.type === 'rtc_offer' || msg.type === 'rtc_answer' || msg.type === 'rtc_ice')) {
            const peers = rooms.get(ws.room);
            if (!peers) return;
            if (ws.role === 'host' && msg.controllerId) {
                const target = peers.controllers.get(msg.controllerId);
                if (target) sendJson(target, msg);
            } else if (ws.role === 'controller' && peers.host) {
                msg.controllerId = ws.id;
                sendJson(peers.host, msg);
            }
        }
    });

    ws.on('close', () => {
        if (!ws.room) return;
        const peers = rooms.get(ws.room);
        if (!peers) return;
        if (ws.role === 'host' && peers.host === ws) {
            peers.host = null;
        }
        if (ws.role === 'controller') {
            peers.controllers.delete(ws.id);
        }
        if (ws.role === 'spectator') {
            peers.spectators.delete(ws);
        }
        notifyHostPeerState(ws.room);
        removeRoomIfEmpty(ws.room);
    });
});

const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
        if (!client.isAlive) {
            client.terminate();
            continue;
        }
        client.isAlive = false;
        client.ping();
    }
}, 10000);

wss.on('close', () => {
    clearInterval(heartbeat);
});

server.listen(PORT, HOST, () => {
    console.log(`LAN relay listening on http://${HOST}:${PORT}${WS_PATH}`);
});
