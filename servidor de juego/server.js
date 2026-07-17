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

// Datos básicos de mapas para el servidor
const DATOS_MAPAS_SERVIDOR = {
    mapa1: { nombre: 'Bosque Principiante', ancho: 3200, alto: 800, colorFondo: '#87CEEB' },
    mapa2: { nombre: 'Cuevas Oscuras', ancho: 4000, alto: 800, colorFondo: '#1a1a2e' },
    mapa3: { nombre: 'Montañas del Viento', ancho: 4800, alto: 900, colorFondo: '#87CEEB' },
    mapa4: { nombre: 'Volcán Ardiente', ancho: 5200, alto: 850, colorFondo: '#2d1a0a' },
    mapa5: { nombre: 'Castillo Final', ancho: 6000, alto: 900, colorFondo: '#0a0a1a' }
};

function generarCodigo() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function crearJugador(socket, username, esCreador) {
    return {
        id: socket.id,
        username: username || 'Jugador',
        esCreador: esCreador,
        x: 200,
        y: 400,
        vidas: 3,
        maxVidas: 3,
        muerto: false,
        enemigosParaRevivir: 0,
        nivel: 1,
        experiencia: 0,
        experienciaParaSubir: 100,
        monedas: 50,
        danoBase: 10,
        velocidad: 5,
        saltoFuerza: 13,
        armaEquipada: 'espadaBasica',
        colorSkin: esCreador ? '#4d96ff' : '#ff6b6b',
        mapaActual: 'mapa1'
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
            
            const mapaKey = data.mapa || 'mapa1';
            jugador.mapaActual = mapaKey;
            
            const mapaData = DATOS_MAPAS_SERVIDOR[mapaKey] || DATOS_MAPAS_SERVIDOR['mapa1'];
            
            const sala = {
                codigo,
                jugadores: [jugador],
                enemigos: [],
                objetosSuelo: [],
                mapaData: mapaData,
                partidaIniciada: true
            };
            
            salas[codigo] = sala;
            socket.join(codigo);
            
            socket.emit('irAlJuego', {
                jugador: jugador,
                sala: sala,
                armas: armasBase
            });
            
            console.log('⚔️ Juego individual creado:', codigo, '- Mapa:', mapaKey);
        } catch (error) {
            console.error('Error en jugarSolo:', error);
            socket.emit('error', 'Error al crear el juego');
        }
    });

    socket.on('crearSalaLobby', (data) => {
        try {
            const codigo = generarCodigo();
            const jugador = crearJugador(socket, data.username, true);
            
            const sala = {
                codigo,
                jugadores: [jugador],
                enemigos: [],
                objetosSuelo: [],
                mapaData: DATOS_MAPAS_SERVIDOR['mapa1'],
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
            socket.emit('error', 'Error al crear la sala');
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
                socket.emit('error', 'Sala llena (máximo 4 jugadores)');
                return;
            }
            if (sala.partidaIniciada) {
                socket.emit('error', 'La partida ya está en curso');
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
            socket.emit('error', 'Error al unirse a la sala');
        }
    });

    socket.on('iniciarJuegoDesdeLobby', (data) => {
        try {
            for (let codigo in salas) {
                const sala = salas[codigo];
                const jugador = sala.jugadores.find(j => j.id === socket.id);
                if (jugador && jugador.esCreador) {
                    sala.partidaIniciada = true;
                    
                    if (data && data.mapa) {
                        sala.mapaData = DATOS_MAPAS_SERVIDOR[data.mapa] || sala.mapaData;
                    }
                    
                    io.to(codigo).emit('iniciarJuegoTodos', { sala });
                    console.log('⚔️ Partida iniciada en sala:', codigo);
                    break;
                }
            }
        } catch (error) {
            console.error('Error en iniciarJuegoDesdeLobby:', error);
        }
    });

    socket.on('cambiarMapaLobby', (data) => {
        try {
            for (let codigo in salas) {
                const sala = salas[codigo];
                const jugador = sala.jugadores.find(j => j.id === socket.id);
                if (jugador && jugador.esCreador && data.mapa) {
                    sala.mapaData = DATOS_MAPAS_SERVIDOR[data.mapa] || sala.mapaData;
                    io.to(codigo).emit('notificacionSala', { 
                        mensaje: '🗺️ Mapa cambiado a: ' + (DATOS_MAPAS_SERVIDOR[data.mapa]?.nombre || data.mapa),
                        tipo: 'info'
                    });
                    break;
                }
            }
        } catch (error) {
            console.error('Error en cambiarMapaLobby:', error);
        }
    });

    socket.on('mover', (data) => {
        try {
            for (let codigo in salas) {
                const jugador = salas[codigo].jugadores.find(j => j.id === socket.id);
                if (jugador) {
                    jugador.x = data.x;
                    jugador.y = data.y;
                    
                    if (data.vidas !== undefined) jugador.vidas = data.vidas;
                    if (data.muerto !== undefined) jugador.muerto = data.muerto;
                    if (data.enemigosParaRevivir !== undefined) jugador.enemigosParaRevivir = data.enemigosParaRevivir;
                    if (data.mapa) jugador.mapaActual = data.mapa;
                    
                    socket.to(codigo).emit('jugadorMovido', { 
                        id: socket.id, 
                        x: data.x, 
                        y: data.y,
                        vidas: jugador.vidas,
                        muerto: jugador.muerto,
                        vx: data.vx || 0,
                        vy: data.vy || 0,
                        enSuelo: data.enSuelo
                    });
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

                const dano = data.dano || jugador.danoBase;
                const critico = data.critico || false;
                
                io.to(codigo).emit('ataqueRealizado', {
                    atacanteId: socket.id,
                    objetivoId: data.enemigoId || 'desconocido',
                    dano: dano,
                    critico: critico,
                    objetivoX: jugador.x + (Math.random() - 0.5) * 40,
                    objetivoY: jugador.y - 20
                });
                
                break;
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
                    io.to(codigo).emit('nuevoMensaje', { 
                        username: jugador.username, 
                        texto: data.texto 
                    });
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
                    const username = salas[codigo].jugadores[idx].username;
                    salas[codigo].jugadores.splice(idx, 1);
                    
                    if (salas[codigo].jugadores.length === 0) {
                        delete salas[codigo];
                        console.log('🗑️ Sala eliminada:', codigo);
                    } else {
                        io.to(codigo).emit('jugadorSalioLobby', salas[codigo]);
                        io.to(codigo).emit('jugadorDesconectado', { id: socket.id, username: username });
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
        
        for (let codigo in salas) {
            const idx = salas[codigo].jugadores.findIndex(j => j.id === socket.id);
            if (idx !== -1) {
                const username = salas[codigo].jugadores[idx].username;
                salas[codigo].jugadores.splice(idx, 1);
                
                if (salas[codigo].jugadores.length === 0) {
                    delete salas[codigo];
                    console.log('🗑️ Sala eliminada por desconexión:', codigo);
                } else {
                    io.to(codigo).emit('jugadorSalioLobby', salas[codigo]);
                    io.to(codigo).emit('jugadorDesconectado', { id: socket.id, username: username });
                }
                break;
            }
        }
    });
});

// Actualización periódica de jugadores
setInterval(() => {
    for (let codigo in salas) {
        const sala = salas[codigo];
        if (!sala.partidaIniciada || sala.jugadores.length === 0) continue;
        
        io.to(codigo).emit('actualizarTodosJugadores', {
            jugadores: sala.jugadores.map(j => ({
                id: j.id,
                x: j.x,
                y: j.y,
                vidas: j.vidas,
                vidaMaxima: j.vidaMaxima || 3,
                muerto: j.muerto,
                username: j.username,
                nivel: j.nivel
            }))
        });
    }
}, 100);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Servidor corriendo en puerto ' + PORT);
    console.log('🗺️ Mapas disponibles: ' + Object.keys(DATOS_MAPAS_SERVIDOR).join(', '));
});