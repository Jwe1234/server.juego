const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const salas = {};

function generarCodigo() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function crearEnemigo() {
    const tipos = [
        { nombre: 'Slime Verde', color: '#6bcb77', vida: 30, dano: 5, exp: 15, monedas: 5, tamaño: 14 },
        { nombre: 'Slime Rojo', color: '#ff6b6b', vida: 50, dano: 8, exp: 25, monedas: 10, tamaño: 16 },
        { nombre: 'Esqueleto', color: '#ddd', vida: 80, dano: 15, exp: 40, monedas: 20, tamaño: 18 },
        { nombre: 'Lobo Gris', color: '#888', vida: 100, dano: 18, exp: 55, monedas: 30, tamaño: 20 }
    ];
    const t = tipos[Math.floor(Math.random() * tipos.length)];
    return {
        id: 'e_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        nombre: t.nombre,
        color: t.color,
        vida: t.vida,
        vidaMax: t.vida,
        dano: t.dano,
        experiencia: t.exp,
        monedas: t.monedas,
        tamaño: t.tamaño,
        x: Math.random() * 2800 + 100,
        y: Math.random() * 1800 + 100
    };
}

function crearJugador(socket, username, esCreador) {
    return {
        id: socket.id,
        username: username || 'Jugador',
        esCreador: esCreador,
        x: 400 + Math.random() * 200,
        y: 300 + Math.random() * 100,
        vida: 100,
        vidaMaxima: 100,
        nivel: 1,
        experiencia: 0,
        experienciaParaSubir: 100,
        monedas: 50,
        danoBase: 10,
        velocidad: 4,
        armaEquipada: 'espadaBasica',
        colorSkin: esCreador ? '#4d96ff' : '#ff6b6b'
    };
}

const armasBase = {
    'espadaBasica': { nombre: 'Espada Básica', velocidad: 1.2, dano: 10, alcance: 50 }
};

io.on('connection', (socket) => {
    console.log('✅ Jugador conectado:', socket.id);

    socket.on('jugarSolo', (data) => {
        try {
            const codigo = generarCodigo();
            const jugador = crearJugador(socket, data.username, true);
            
            const sala = {
                codigo,
                jugadores: [jugador],
                enemigos: Array.from({ length: 20 }, () => crearEnemigo()),
                objetosSuelo: [],
                mapaData: { nombre: 'Bosque Oscuro', ancho: 3000, alto: 2000, colorFondo: '#2d5a1e' },
                partidaIniciada: true
            };
            
            salas[codigo] = sala;
            socket.join(codigo);
            
            socket.emit('irAlJuego', {
                jugador: jugador,
                sala: sala,
                armas: armasBase
            });
            
            console.log('⚔️ Juego individual creado:', codigo);
        } catch (error) {
            console.error('Error en jugarSolo:', error);
        }
    });

    socket.on('crearSalaLobby', (data) => {
        try {
            const codigo = generarCodigo();
            const jugador = crearJugador(socket, data.username, true);
            
            const sala = {
                codigo,
                jugadores: [jugador],
                enemigos: Array.from({ length: 20 }, () => crearEnemigo()),
                objetosSuelo: [],
                mapaData: { nombre: 'Bosque Oscuro', ancho: 3000, alto: 2000, colorFondo: '#2d5a1e' },
                partidaIniciada: false
            };
            
            salas[codigo] = sala;
            socket.join(codigo);
            
            socket.emit('salaCreadaLobby', {
                jugador: jugador,
                sala: sala,
                armas: armasBase
            });
            
            console.log('📁 Sala creada:', codigo);
        } catch (error) {
            console.error('Error en crearSalaLobby:', error);
        }
    });

    socket.on('unirseASala', (data) => {
        try {
            const sala = salas[data.codigo];
            if (!sala) {
                socket.emit('error', 'Sala no encontrada');
                return;
            }
            if (sala.jugadores.length >= 4) {
                socket.emit('error', 'Sala llena');
                return;
            }
            
            const jugador = crearJugador(socket, data.username, false);
            sala.jugadores.push(jugador);
            socket.join(data.codigo);
            
            socket.emit('unidoALobby', {
                jugador: jugador,
                sala: sala,
                armas: armasBase
            });
            
            socket.to(data.codigo).emit('jugadorUnidoALobby', sala);
            console.log('👤 Jugador unido a sala:', data.codigo);
        } catch (error) {
            console.error('Error en unirseASala:', error);
        }
    });

    socket.on('iniciarJuegoDesdeLobby', () => {
        try {
            for (let codigo in salas) {
                const sala = salas[codigo];
                const jugador = sala.jugadores.find(j => j.id === socket.id);
                if (jugador && jugador.esCreador) {
                    sala.partidaIniciada = true;
                    io.to(codigo).emit('iniciarJuegoTodos', { sala });
                    break;
                }
            }
        } catch (error) {
            console.error('Error en iniciarJuegoDesdeLobby:', error);
        }
    });

    socket.on('mover', (data) => {
        try {
            for (let codigo in salas) {
                const jugador = salas[codigo].jugadores.find(j => j.id === socket.id);
                if (jugador) {
                    jugador.x = data.x;
                    jugador.y = data.y;
                    socket.to(codigo).emit('jugadorMovido', { id: socket.id, x: data.x, y: data.y });
                    break;
                }
            }
        } catch (error) {
            console.error('Error en mover:', error);
        }
    });

    socket.on('atacar', (data) => {
        try {
            for (let codigo in salas) {
                const sala = salas[codigo];
                const jugador = sala.jugadores.find(j => j.id === socket.id);
                if (!jugador || !sala.partidaIniciada) continue;

                for (let enemigo of sala.enemigos) {
                    const dist = Math.sqrt((enemigo.x - jugador.x) ** 2 + (enemigo.y - jugador.y) ** 2);
                    if (dist < 60) {
                        const dano = jugador.danoBase + Math.floor(Math.random() * 5);
                        enemigo.vida -= dano;
                        
                        io.to(codigo).emit('ataqueRealizado', {
                            atacanteId: socket.id,
                            objetivoId: enemigo.id,
                            dano: dano,
                            objetivoX: enemigo.x,
                            objetivoY: enemigo.y
                        });

                        if (enemigo.vida <= 0) {
                            sala.enemigos = sala.enemigos.filter(e => e.id !== enemigo.id);
                            jugador.experiencia += enemigo.experiencia;
                            jugador.monedas += enemigo.monedas;
                            
                            io.to(codigo).emit('enemigoDerrotado', {
                                enemigoId: enemigo.id,
                                jugadorId: socket.id,
                                experiencia: enemigo.experiencia,
                                monedas: enemigo.monedas,
                                posX: enemigo.x,
                                posY: enemigo.y
                            });
                            
                            io.to(codigo).emit('actualizarJugador', {
                                id: socket.id,
                                nivel: jugador.nivel,
                                experiencia: jugador.experiencia,
                                monedas: jugador.monedas,
                                danoBase: jugador.danoBase,
                                vidaMaxima: jugador.vidaMaxima
                            });
                            
                            // Respawn
                            setTimeout(() => {
                                if (salas[codigo]) {
                                    const nuevo = crearEnemigo();
                                    salas[codigo].enemigos.push(nuevo);
                                    io.to(codigo).emit('nuevoEnemigo', nuevo);
                                }
                            }, 5000);
                        }
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error en atacar:', error);
        }
    });

    socket.on('enviarMensaje', (data) => {
        try {
            for (let codigo in salas) {
                const jugador = salas[codigo].jugadores.find(j => j.id === socket.id);
                if (jugador) {
                    io.to(codigo).emit('nuevoMensaje', { username: jugador.username, texto: data.texto });
                    break;
                }
            }
        } catch (error) {
            console.error('Error en enviarMensaje:', error);
        }
    });

    socket.on('salirDelLobby', () => {
        try {
            for (let codigo in salas) {
                const idx = salas[codigo].jugadores.findIndex(j => j.id === socket.id);
                if (idx !== -1) {
                    salas[codigo].jugadores.splice(idx, 1);
                    if (salas[codigo].jugadores.length === 0) {
                        delete salas[codigo];
                    } else {
                        io.to(codigo).emit('jugadorSalioLobby', salas[codigo]);
                    }
                    break;
                }
            }
        } catch (error) {
            console.error('Error en salirDelLobby:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ Jugador desconectado:', socket.id);
    });
});

// IA de enemigos
setInterval(() => {
    for (let codigo in salas) {
        const sala = salas[codigo];
        if (!sala.partidaIniciada) continue;
        
        for (let enemigo of sala.enemigos) {
            let masCercano = null;
            let distMin = Infinity;
            
            for (let jugador of sala.jugadores) {
                const dist = Math.sqrt((enemigo.x - jugador.x) ** 2 + (enemigo.y - jugador.y) ** 2);
                if (dist < distMin) {
                    distMin = dist;
                    masCercano = jugador;
                }
            }
            
            if (masCercano && distMin < 300) {
                const ang = Math.atan2(masCercano.y - enemigo.y, masCercano.x - enemigo.x);
                enemigo.x += Math.cos(ang) * 1.5;
                enemigo.y += Math.sin(ang) * 1.5;
            }
        }
        
        io.to(codigo).emit('actualizarEnemigos', {
            enemigos: sala.enemigos.map(e => ({
                id: e.id, x: e.x, y: e.y, vida: e.vida, vidaMax: e.vidaMax,
                color: e.color, tamaño: e.tamaño, nombre: e.nombre
            }))
        });
    }
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Servidor corriendo en puerto', PORT);
});