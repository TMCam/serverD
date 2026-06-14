const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'] // Force le support des deux
});

const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`Client connecté : ${socket.id}`);

    socket.on('syncClock', (t0, callback) => {
        callback({ t1: Date.now(), t2: Date.now(), t0 });
    });

    socket.on('joinRoom', (data) => {
        const roomId = data.roomId || data;
        let assignedRole = 'guest';

        if (!rooms.has(roomId)) {
            rooms.set(roomId, { users: new Set(), state: 'paused', readyCount: 0, currentTime: 0 });
            assignedRole = 'host'; 
            console.log(`Room CRÉÉE par l'hôte : ${roomId}`);
        }

        // --- CORRECTION CRITIQUE : Il manquait cette ligne pour que le client rejoigne vraiment le salon ! ---
        socket.join(roomId);
        
        rooms.get(roomId).users.add(socket.id);
        console.log(`Client ${socket.id} (${assignedRole}) a rejoint la room ${roomId}`);

        socket.emit('roleAssigned', assignedRole);

        const roomData = rooms.get(roomId);
        if (roomData.state === 'playing') {
            socket.emit('syncAction', { action: 'EXECUTE_PLAY', time: roomData.currentTime });
        }
    });

    socket.on('leaveRoom', (roomId) => {
        socket.leave(roomId);
        if (rooms.has(roomId)) {
            rooms.get(roomId).users.delete(socket.id);
            if (rooms.get(roomId).users.size === 0) rooms.delete(roomId);
        }
    });

    socket.on('mediaAction', (data) => {
        const { roomId, action, time } = data; // Extraction du time
        const room = rooms.get(roomId);
        if (!room) return;

        if (action === 'REQUEST_PLAY') {
            room.state = 'buffering';
            room.readyCount = 0;
            if (time !== undefined) room.currentTime = time; // Sauvegarde du timestamp
            io.to(roomId).emit('syncAction', { action: 'PREPARE_PLAY' });
        }

        if (action === 'REQUEST_PAUSE') {
            room.state = 'paused';
            if (time !== undefined) room.currentTime = time;
            io.to(roomId).emit('syncAction', { action: 'EXECUTE_PAUSE', time: room.currentTime });
        }
    });

    socket.on('clientReady', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.state === 'buffering') {
            room.readyCount++;
            if (room.readyCount === room.users.size) {
                room.state = 'playing';
                const targetExecutionTime = Date.now() + 500; 
                io.to(roomId).emit('syncAction', { 
                    action: 'EXECUTE_PLAY', 
                    executeAt: targetExecutionTime, 
                    time: room.currentTime // Imposition du timestamp global
                });
            }
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach((roomData, roomId) => {
            roomData.users.delete(socket.id);
            if (roomData.users.size === 0) rooms.delete(roomId);
        });
        console.log(`Client déconnecté : ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Serveur Deezer Sync sur le port ${PORT}`));