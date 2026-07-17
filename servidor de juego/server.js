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

app.use(express.static(path.join(__dirname, 'public')));

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
            
            // Usar el mapa seleccionado por el jugador
            const mapaKey = data.mapa || 'mapa1';
            jugador.mapaActual = mapaKey;
            
            const mapaData = DATOS_MAPAS_SERVIDOR[mapaKey] || DATOS_MAPAS_SERVIDOR['mapa1'];
            
            const sala = {
                codigo,
                jugadores: [jugador],
                enemigos: Array.from({ length: 20 }, () => crearEnemigo()),
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
                enemigos: Array.from({ length: 20 }, () => crearEnemigo()),
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
                    
                    // Si se envió un mapa, actualizarlo
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
                    
                    // Propagar vidas y estado
                    if (data.vidas !== undefined) jugador.vidas = data.vidas;
                    if (data.muerto !== undefined) jugador.muerto = data.muerto;
                    if (data.enemigosParaRevivir !== undefined) jugador.enemigosParaRevivir = data.enemigosParaRevivir;
                    
                    socket.to(codigo).emit('jugadorMovido', { 
                        id: socket.id, 
                        x: data.x, 
                        y: data.y,
                        vidas: jugador.vidas,
                        muerto: jugador.muerto,
                        vx: data.vx || 0,
                        vy: data.vy || 0
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

                for (let enemigo of sala.enemigos) {
                    const dist = Math.sqrt((enemigo.x - jugador.x) ** 2 + (enemigo.y - jugador.y) ** 2);
                    if (dist < 60) {
                        const dano = (data.dano || jugador.danoBase) + Math.floor(Math.random() * 3);
                        const critico = data.critico || (Math.random() < 0.12);
                        enemigo.vida -= dano;
                        
                        io.to(codigo).emit('ataqueRealizado', {
                            atacanteId: socket.id,
                            objetivoId: enemigo.id,
                            dano: dano,
                            critico: critico,
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
                                vidaMaxima: jugador.vidaMaxima,
                                vidas: jugador.vidas
                            });
                            
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
        
        // Limpiar salas al desconectar
        for (let codigo in salas) {
            const idx = salas[codigo].jugadores.findIndex(j => j.id === socket.id);
            if (idx !== -1) {
                const username = salas[codigo].jugadores[idx].username;
                salas[codigo].jugadores.splice(idx, 1);
                
                if (salas[codigo].jugadores.length === 0) {
                    delete salas[codigo];
                } else {
                    io.to(codigo).emit('jugadorSalioLobby', salas[codigo]);
                    io.to(codigo).emit('jugadorDesconectado', { id: socket.id, username: username });
                }
                break;
            }
        }
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
                if (jugador.muerto) continue;
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