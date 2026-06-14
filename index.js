// index.js
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
            rooms.set(roomId, { users: new Set() });
        }
        socket.join(roomId);
        rooms.get(roomId).users.add(socket.id);
    });

    socket.on('mediaAction', (data) => {
        if (data.action === 'REQUEST_CHANGE_TRACK') {
            io.to(data.roomId).emit('syncAction', { action: 'EXECUTE_CHANGE_TRACK', trackId: data.trackId });
        } else if (data.action === 'REQUEST_PLAY') {
            io.to(data.roomId).emit('syncAction', { action: 'EXECUTE_PLAY', time: data.time || 0 });
        } else if (data.action === 'REQUEST_PAUSE') {
            io.to(data.roomId).emit('syncAction', { action: 'EXECUTE_PAUSE', time: data.time || 0 });
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach(room => room.users.delete(socket.id));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Serveur actif sur le port ${PORT}`));