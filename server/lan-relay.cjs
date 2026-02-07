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
        peers = { host: null, controller: null };
        rooms.set(room, peers);
    }
    return peers;
}

function removeRoomIfEmpty(room) {
    const peers = rooms.get(room);
    if (!peers) return;
    if (!peers.host && !peers.controller) {
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
        connected: Boolean(peers.controller),
    });
}

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.room = '';
    ws.role = '';

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

        if (msg && msg.type === 'join_controller' && typeof msg.room === 'string') {
            const room = msg.room.trim();
            if (!room) return;
            const peers = getOrCreateRoom(room);
            if (peers.controller && peers.controller !== ws) {
                peers.controller.close(4002, 'new controller connected');
            }
            peers.controller = ws;
            ws.room = room;
            ws.role = 'controller';
            notifyHostPeerState(room);
            return;
        }

        if (msg && msg.type === 'controller_input' && ws.role === 'controller') {
            const peers = rooms.get(ws.room);
            if (!peers || !peers.host) return;
            sendJson(peers.host, msg);
            return;
        }

        // WebRTC signaling: forward between host and controller in same room
        if (msg && (msg.type === 'rtc_offer' || msg.type === 'rtc_answer' || msg.type === 'rtc_ice')) {
            const peers = rooms.get(ws.room);
            if (!peers) return;
            if (ws.role === 'host' && peers.controller) {
                sendJson(peers.controller, msg);
            } else if (ws.role === 'controller' && peers.host) {
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
        if (ws.role === 'controller' && peers.controller === ws) {
            peers.controller = null;
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
