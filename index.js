const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = new Map();

io.on('connection', (socket) => {
    socket.on('joinRoom', (data) => {
        const roomId = data.roomId;
        if (!rooms.has(roomId)) {
            rooms.set(roomId, { users: new Set(), state: 'paused', readyCount: 0, currentTime: 0 });
        }
        
        socket.join(roomId);
        rooms.get(roomId).users.add(socket.id);
        
        // Logique de rôle : le premier utilisateur est le HOST
        const assignedRole = rooms.get(roomId).users.size === 1 ? 'host' : 'guest';
        socket.emit('roleAssigned', assignedRole);
    });

    socket.on('mediaAction', (data) => {
        const { roomId, action, time } = data;
        const room = rooms.get(roomId);
        if (!room) return;

        if (action === 'REQUEST_PLAY') {
            room.state = 'buffering';
            room.readyCount = 0;
            room.currentTime = time || room.currentTime;
            io.to(roomId).emit('syncAction', { action: 'PREPARE_PLAY' });
        } else if (action === 'REQUEST_PAUSE') {
            room.state = 'paused';
            room.currentTime = time || room.currentTime;
            io.to(roomId).emit('syncAction', { action: 'EXECUTE_PAUSE', time: room.currentTime });
        }
    });

    socket.on('clientReady', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.state === 'buffering') {
            room.readyCount++;
            if (room.readyCount >= room.users.size) {
                room.state = 'playing';
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