const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = new Map();

io.on('connection', (socket) => {
    socket.on('joinRoom', (data) => {
        const roomId = data.roomId;
        if (!rooms.has(roomId)) {
            rooms.set(roomId, { users: new Set(), state: 'paused', readyCount: 0, currentTime: 0, timeout: null });
        }
        socket.join(roomId);
        rooms.get(roomId).users.add(socket.id);
        const assignedRole = rooms.get(roomId).users.size === 1 ? 'host' : 'guest';
        socket.emit('roleAssigned', assignedRole);
    });

    socket.on('mediaAction', (data) => {
        const room = rooms.get(data.roomId);
        if (!room) return;
        
        if (data.action === 'REQUEST_PLAY') {
            room.state = 'buffering';
            room.readyCount = 0;
            room.currentTime = data.time || 0; // Sauvegarde du temps
            io.to(data.roomId).emit('syncAction', { action: 'PREPARE_PLAY' });

            if (room.timeout) clearTimeout(room.timeout);
            room.timeout = setTimeout(() => {
                if (room.state === 'buffering') {
                    io.to(data.roomId).emit('syncAction', { action: 'SYNC_ERROR', message: "Oups, timeout!" });
                    room.state = 'paused';
                }
            }, 5000);
        } else if (data.action === 'REQUEST_PAUSE') {
            io.to(data.roomId).emit('syncAction', { action: 'EXECUTE_PAUSE', time: data.time || 0 });
        }
    });

    socket.on('clientReady', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.state === 'buffering') {
            room.readyCount++;
            if (room.readyCount >= room.users.size) {
                if (room.timeout) clearTimeout(room.timeout);
                room.state = 'playing';
                // On s'assure de renvoyer le currentTime sauvegardé
                io.to(roomId).emit('syncAction', { 
                    action: 'EXECUTE_PLAY', 
                    executeAt: Date.now() + 500, 
                    time: room.currentTime 
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Serveur actif sur le port ${PORT}`));