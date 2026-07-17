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
    pingTimeout: 60000,
    pingInterval: 25000
});

// ============================================================
// BASE DE DATOS DE MAPAS
// ============================================================
const DATOS_MAPAS_SERVIDOR = {
    mapa1: { 
        nombre: 'Bosque Principiante', 
        ancho: 3200, 
        alto: 800, 
        colorFondo: '#87CEEB',
        dificultad: 1,
        maxJugadores: 4
    },
    mapa2: { 
        nombre: 'Cuevas Oscuras', 
        ancho: 4000, 
        alto: 800, 
        colorFondo: '#1a1a2e',
        dificultad: 2,
        maxJugadores: 4
    },
    mapa3: { 
        nombre: 'Montañas del Viento', 
        ancho: 4800, 
        alto: 900, 
        colorFondo: '#87CEEB',
        dificultad: 3,
        maxJugadores: 4
    },
    mapa4: { 
        nombre: 'Volcán Ardiente', 
        ancho: 5200, 
        alto: 850, 
        colorFondo: '#2d1a0a',
        dificultad: 4,
        maxJugadores: 4
    },
    mapa5: { 
        nombre: 'Castillo Final', 
        ancho: 6000, 
        alto: 900, 
        colorFondo: '#0a0a1a',
        dificultad: 5,
        maxJugadores: 4
    }
};

// ============================================================
// ALMACENAMIENTO DE SALAS Y JUGADORES
// ============================================================
const salas = {};
const jugadoresConectados = {};

// ============================================================
// FUNCIONES UTILITARIAS
// ============================================================
function generarCodigo() {
    const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigo = '';
    for (let i = 0; i < 4; i++) {
        codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    // Verificar que no exista
    if (salas[codigo]) return generarCodigo();
    return codigo;
}

function generarIdUnico() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function crearEnemigo(ancho, alto, tipoEspecifico) {
    const tiposEnemigos = [
        { 
            nombre: 'Slime Verde', 
            color: '#6bcb77', 
            vida: 30, 
            vidaMax: 30,
            dano: 5, 
            experiencia: 15, 
            monedas: 5, 
            tamaño: 14, 
            tipo: 'slime',
            velocidad: 0.8,
            rango: 100
        },
        { 
            nombre: 'Slime Rojo', 
            color: '#ff6b6b', 
            vida: 50, 
            vidaMax: 50,
            dano: 8, 
            experiencia: 25, 
            monedas: 10, 
            tamaño: 16, 
            tipo: 'slime',
            velocidad: 1.0,
            rango: 120
        },
        { 
            nombre: 'Esqueleto Guardián', 
            color: '#ddd', 
            vida: 80, 
            vidaMax: 80,
            dano: 15, 
            experiencia: 40, 
            monedas: 20, 
            tamaño: 18, 
            tipo: 'esqueleto',
            velocidad: 1.5,
            rango: 150
        },
        { 
            nombre: 'Lobo Gris', 
            color: '#888', 
            vida: 100, 
            vidaMax: 100,
            dano: 18, 
            experiencia: 55, 
            monedas: 30, 
            tamaño: 20, 
            tipo: 'lobo',
            velocidad: 2.5,
            rango: 200
        },
        { 
            nombre: 'Golem de Piedra', 
            color: '#8B7355', 
            vida: 150, 
            vidaMax: 150,
            dano: 25, 
            experiencia: 80, 
            monedas: 50, 
            tamaño: 26, 
            tipo: 'golem',
            velocidad: 0.6,
            rango: 80
        },
        { 
            nombre: 'Dragón de Fuego', 
            color: '#ff4444', 
            vida: 300, 
            vidaMax: 300,
            dano: 40, 
            experiencia: 200, 
            monedas: 100, 
            tamaño: 35, 
            tipo: 'dragon',
            velocidad: 2.0,
            rango: 300
        }
    ];
    
    let tipoElegido;
    if (tipoEspecifico) {
        tipoElegido = tiposEnemigos.find(t => t.tipo === tipoEspecifico) || tiposEnemigos[0];
    } else {
        // Más probabilidad de enemigos débiles
        const probabilidad = Math.random();
        if (probabilidad < 0.35) tipoElegido = tiposEnemigos[0]; // Slime Verde
        else if (probabilidad < 0.55) tipoElegido = tiposEnemigos[1]; // Slime Rojo
        else if (probabilidad < 0.75) tipoElegido = tiposEnemigos[2]; // Esqueleto
        else if (probabilidad < 0.88) tipoElegido = tiposEnemigos[3]; // Lobo
        else if (probabilidad < 0.96) tipoElegido = tiposEnemigos[4]; // Golem
        else tipoElegido = tiposEnemigos[5]; // Dragón
    }
    
    return {
        id: generarIdUnico(),
        nombre: tipoElegido.nombre,
        color: tipoElegido.color,
        vida: tipoElegido.vida,
        vidaMax: tipoElegido.vidaMax,
        dano: tipoElegido.dano,
        experiencia: tipoElegido.experiencia,
        monedas: tipoElegido.monedas,
        tamaño: tipoElegido.tamaño,
        tipoClase: tipoElegido.tipo,
        velocidad: tipoElegido.velocidad,
        rango: tipoElegido.rango,
        x: Math.random() * (ancho - 200) + 100,
        y: Math.random() * (alto - 200) + 100,
        estado: 'patrullando',
        objetivoX: null,
        objetivoY: null
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
        saltoFuerza: 13,
        armaEquipada: 'espadaBasica',
        colorSkin: esCreador ? '#4d96ff' : '#ff6b6b',
        mapaActual: 'mapa1',
        conectado: true,
        ultimaActividad: Date.now()
    };
}

function obtenerSalaDeJugador(socketId) {
    for (let codigo in salas) {
        const sala = salas[codigo];
        const jugador = sala.jugadores.find(j => j.id === socketId);
        if (jugador) return { sala, jugador, codigo };
    }
    return null;
}

function limpiarSalasVacias() {
    for (let codigo in salas) {
        if (salas[codigo].jugadores.length === 0) {
            delete salas[codigo];
            console.log('🗑️ Sala eliminada por vacía:', codigo);
        }
    }
}

// ============================================================
// CONFIGURACIÓN DE ARMAS
// ============================================================
const armasBase = {
    'espadaBasica': { 
        nombre: 'Espada Básica', 
        velocidad: 1.2, 
        dano: 10, 
        alcance: 50,
        precio: 0,
        nivelRequerido: 1,
        rareza: 'comun'
    },
    'espadaHierro': { 
        nombre: 'Espada de Hierro', 
        velocidad: 1.0, 
        dano: 18, 
        alcance: 55,
        precio: 100,
        nivelRequerido: 3,
        rareza: 'raro'
    },
    'hachaBatalla': { 
        nombre: 'Hacha de Batalla', 
        velocidad: 0.8, 
        dano: 28, 
        alcance: 60,
        precio: 250,
        nivelRequerido: 5,
        rareza: 'epico'
    }
};

// ============================================================
// EVENTOS DE SOCKET.IO
// ============================================================
io.on('connection', (socket) => {
    console.log('✅ Jugador conectado:', socket.id);
    console.log('📊 Jugadores totales conectados:', io.engine.clientsCount);
    
    // Registrar jugador
    jugadoresConectados[socket.id] = {
        id: socket.id,
        conectadoDesde: new Date().toISOString(),
        salaActual: null
    };

    // Enviar ping de bienvenida
    socket.emit('notificacionSala', {
        mensaje: '✅ Conectado al servidor de Batalla Pixel',
        tipo: 'exito'
    });

    // ==================== JUGAR SOLO ====================
    socket.on('jugarSolo', (data) => {
        try {
            // Validar datos
            if (!data || !data.username) {
                socket.emit('error', 'Nombre de jugador requerido');
                return;
            }
            
            const codigo = generarCodigo();
            const jugador = crearJugador(socket, data.username, true);
            const mapaKey = data.mapa || 'mapa1';
            
            // Validar que el mapa existe
            if (!DATOS_MAPAS_SERVIDOR[mapaKey]) {
                socket.emit('error', 'Mapa no válido');
                return;
            }
            
            jugador.mapaActual = mapaKey;
            
            const mapaData = DATOS_MAPAS_SERVIDOR[mapaKey];
            const cantidadEnemigos = 10 + (mapaData.dificultad * 5);
            const enemigos = Array.from({ length: cantidadEnemigos }, () => 
                crearEnemigo(mapaData.ancho, mapaData.alto)
            );
            
            const sala = {
                codigo: codigo,
                jugadores: [jugador],
                enemigos: enemigos,
                objetosSuelo: [],
                mapaData: mapaData,
                partidaIniciada: true,
                creadaEn: new Date().toISOString(),
                tipo: 'solo'
            };
            
            salas[codigo] = sala;
            socket.join(codigo);
            jugadoresConectados[socket.id].salaActual = codigo;
            
            socket.emit('irAlJuego', {
                jugador: jugador,
                sala: sala,
                armas: armasBase
            });
            
            console.log('⚔️ Juego individual creado:', codigo, '- Mapa:', mapaKey, '- Enemigos:', cantidadEnemigos);
        } catch (error) {
            console.error('Error crítico en jugarSolo:', error);
            socket.emit('error', 'Error interno del servidor');
        }
    });

    // ==================== CREAR SALA MULTIJUGADOR ====================
    socket.on('crearSalaLobby', (data) => {
        try {
            if (!data || !data.username) {
                socket.emit('error', 'Nombre de jugador requerido');
                return;
            }
            
            const codigo = generarCodigo();
            const jugador = crearJugador(socket, data.username, true);
            
            const sala = {
                codigo: codigo,
                jugadores: [jugador],
                enemigos: [],
                objetosSuelo: [],
                mapaData: DATOS_MAPAS_SERVIDOR['mapa1'],
                partidaIniciada: false,
                creadaEn: new Date().toISOString(),
                tipo: 'multijugador'
            };
            
            salas[codigo] = sala;
            socket.join(codigo);
            jugadoresConectados[socket.id].salaActual = codigo;
            
            socket.emit('salaCreadaLobby', {
                jugador: jugador,
                sala: sala,
                armas: armasBase
            });
            
            console.log('📁 Sala multijugador creada:', codigo, '- Líder:', data.username);
        } catch (error) {
            console.error('Error crítico en crearSalaLobby:', error);
            socket.emit('error', 'Error interno del servidor');
        }
    });

    // ==================== UNIRSE A SALA ====================
    socket.on('unirseASala', (data) => {
        try {
            if (!data || !data.codigo || !data.username) {
                socket.emit('error', 'Código de sala y nombre requeridos');
                return;
            }
            
            const codigo = data.codigo.toUpperCase();
            const sala = salas[codigo];
            
            if (!sala) {
                socket.emit('error', 'Sala no encontrada. Verifica el código.');
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
            
            // Verificar nombre duplicado
            if (sala.jugadores.some(j => j.username === data.username)) {
                socket.emit('error', 'Ya hay un jugador con ese nombre en la sala');
                return;
            }
            
            const jugador = crearJugador(socket, data.username, false);
            sala.jugadores.push(jugador);
            socket.join(codigo);
            jugadoresConectados[socket.id].salaActual = codigo;
            
            // Enviar datos al nuevo jugador
            socket.emit('unidoALobby', {
                jugador: jugador,
                sala: sala,
                armas: armasBase
            });
            
            // Notificar a los demás
            socket.to(codigo).emit('jugadorUnidoALobby', sala);
            socket.to(codigo).emit('notificacionSala', {
                mensaje: '👤 ' + data.username + ' se ha unido a la sala',
                tipo: 'info'
            });
            
            console.log('👤 Jugador unido a sala:', codigo, '-', data.username);
        } catch (error) {
            console.error('Error crítico en unirseASala:', error);
            socket.emit('error', 'Error interno del servidor');
        }
    });

    // ==================== INICIAR JUEGO DESDE LOBBY ====================
    socket.on('iniciarJuegoDesdeLobby', (data) => {
        try {
            const resultado = obtenerSalaDeJugador(socket.id);
            if (!resultado) {
                socket.emit('error', 'No estás en ninguna sala');
                return;
            }
            
            const { sala, jugador, codigo } = resultado;
            
            if (!jugador.esCreador) {
                socket.emit('error', 'Solo el líder puede iniciar la partida');
                return;
            }
            
            if (sala.partidaIniciada) {
                socket.emit('error', 'La partida ya está en curso');
                return;
            }
            
            if (sala.jugadores.length < 1) {
                socket.emit('error', 'Se necesita al menos 1 jugador');
                return;
            }
            
            sala.partidaIniciada = true;
            
            // Actualizar mapa si se especificó
            if (data && data.mapa && DATOS_MAPAS_SERVIDOR[data.mapa]) {
                sala.mapaData = DATOS_MAPAS_SERVIDOR[data.mapa];
            }
            
            // Generar enemigos
            const cantidadEnemigos = 15 + (sala.mapaData.dificultad * 5);
            sala.enemigos = Array.from({ length: cantidadEnemigos }, () => 
                crearEnemigo(sala.mapaData.ancho, sala.mapaData.alto)
            );
            
            // Reposicionar jugadores
            sala.jugadores.forEach((j, index) => {
                j.x = 200 + (index * 50);
                j.y = 400;
                j.vidas = 3;
                j.muerto = false;
                j.enemigosParaRevivir = 0;
            });
            
            io.to(codigo).emit('iniciarJuegoTodos', { sala });
            io.to(codigo).emit('notificacionSala', {
                mensaje: '⚔️ ¡La partida ha comenzado!',
                tipo: 'exito'
            });
            
            console.log('⚔️ Partida multijugador iniciada:', codigo, '- Jugadores:', sala.jugadores.length);
        } catch (error) {
            console.error('Error crítico en iniciarJuegoDesdeLobby:', error);
            socket.emit('error', 'Error interno del servidor');
        }
    });

    // ==================== CAMBIAR MAPA EN LOBBY ====================
    socket.on('cambiarMapaLobby', (data) => {
        try {
            const resultado = obtenerSalaDeJugador(socket.id);
            if (!resultado) return;
            
            const { sala, jugador, codigo } = resultado;
            
            if (!jugador.esCreador) {
                socket.emit('error', 'Solo el líder puede cambiar el mapa');
                return;
            }
            
            if (sala.partidaIniciada) {
                socket.emit('error', 'No se puede cambiar el mapa durante la partida');
                return;
            }
            
            if (!data || !data.mapa || !DATOS_MAPAS_SERVIDOR[data.mapa]) {
                socket.emit('error', 'Mapa no válido');
                return;
            }
            
            sala.mapaData = DATOS_MAPAS_SERVIDOR[data.mapa];
            
            io.to(codigo).emit('notificacionSala', {
                mensaje: '🗺️ Mapa cambiado a: ' + DATOS_MAPAS_SERVIDOR[data.mapa].nombre,
                tipo: 'info'
            });
            
            console.log('🗺️ Mapa cambiado en sala:', codigo, '-', data.mapa);
        } catch (error) {
            console.error('Error en cambiarMapaLobby:', error);
        }
    });

    // ==================== MOVIMIENTO DE JUGADOR ====================
    socket.on('mover', (data) => {
        try {
            if (!data || data.x === undefined || data.y === undefined) return;
            
            const resultado = obtenerSalaDeJugador(socket.id);
            if (!resultado) return;
            
            const { sala, jugador, codigo } = resultado;
            
            // Actualizar posición
            jugador.x = data.x;
            jugador.y = data.y;
            
            // Actualizar estado
            if (data.vidas !== undefined) jugador.vidas = data.vidas;
            if (data.muerto !== undefined) jugador.muerto = data.muerto;
            if (data.enemigosParaRevivir !== undefined) jugador.enemigosParaRevivir = data.enemigosParaRevivir;
            if (data.mapa) jugador.mapaActual = data.mapa;
            
            jugador.ultimaActividad = Date.now();
            
            // Notificar a otros jugadores
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
        } catch (error) {
            console.error('Error en mover:', error);
        }
    });

    // ==================== ATAQUE ====================
    socket.on('atacar', (data) => {
        try {
            const resultado = obtenerSalaDeJugador(socket.id);
            if (!resultado) return;
            
            const { sala, jugador, codigo } = resultado;
            
            if (!sala.partidaIniciada || jugador.muerto) return;
            
            // Buscar enemigo más cercano en la dirección del ataque
            let enemigoGolpeado = null;
            let distanciaMinima = 60;
            
            for (let enemigo of sala.enemigos) {
                if (enemigo.vida <= 0) continue;
                
                const dx = enemigo.x - jugador.x;
                const dy = enemigo.y - jugador.y;
                const distancia = Math.sqrt(dx * dx + dy * dy);
                
                if (distancia < distanciaMinima) {
                    distanciaMinima = distancia;
                    enemigoGolpeado = enemigo;
                }
            }
            
            if (enemigoGolpeado) {
                const arma = armasBase[jugador.armaEquipada] || armasBase['espadaBasica'];
                const critico = Math.random() < 0.12;
                const danoBase = arma.dano + Math.floor(Math.random() * 5);
                const dano = critico ? Math.floor(danoBase * 1.5) : danoBase;
                
                enemigoGolpeado.vida -= dano;
                
                // Notificar ataque
                io.to(codigo).emit('ataqueRealizado', {
                    atacanteId: socket.id,
                    objetivoId: enemigoGolpeado.id,
                    dano: dano,
                    critico: critico,
                    objetivoX: enemigoGolpeado.x,
                    objetivoY: enemigoGolpeado.y
                });
                
                // Verificar muerte del enemigo
                if (enemigoGolpeado.vida <= 0) {
                    sala.enemigos = sala.enemigos.filter(e => e.id !== enemigoGolpeado.id);
                    
                    // Recompensas
                    jugador.experiencia += enemigoGolpeado.experiencia;
                    jugador.monedas += enemigoGolpeado.monedas;
                    
                    // Verificar subida de nivel
                    while (jugador.experiencia >= jugador.experienciaParaSubir) {
                        jugador.nivel++;
                        jugador.experiencia -= jugador.experienciaParaSubir;
                        jugador.experienciaParaSubir = Math.floor(jugador.experienciaParaSubir * 1.5);
                        jugador.danoBase += 3;
                        jugador.vidaMaxima += 10;
                    }
                    
                    // Notificar muerte del enemigo
                    io.to(codigo).emit('enemigoDerrotado', {
                        enemigoId: enemigoGolpeado.id,
                        jugadorId: socket.id,
                        experiencia: enemigoGolpeado.experiencia,
                        monedas: enemigoGolpeado.monedas,
                        posX: enemigoGolpeado.x,
                        posY: enemigoGolpeado.y,
                        loot: []
                    });
                    
                    // Actualizar jugador
                    io.to(codigo).emit('actualizarJugador', {
                        id: socket.id,
                        nivel: jugador.nivel,
                        experiencia: jugador.experiencia,
                        monedas: jugador.monedas,
                        danoBase: jugador.danoBase,
                        vidas: jugador.vidas,
                        muerto: jugador.muerto
                    });
                    
                    // Revivir compañeros si aplica
                    for (let j of sala.jugadores) {
                        if (j.id !== socket.id && j.muerto && j.enemigosParaRevivir > 0) {
                            j.enemigosParaRevivir--;
                            if (j.enemigosParaRevivir <= 0) {
                                j.muerto = false;
                                j.vidas = 1;
                                j.x = jugador.x;
                                j.y = jugador.y;
                                io.to(codigo).emit('actualizarJugador', {
                                    id: j.id,
                                    vidas: j.vidas,
                                    muerto: false
                                });
                                io.to(codigo).emit('notificacionSala', {
                                    mensaje: '💖 ' + j.username + ' ha sido revivido!',
                                    tipo: 'exito'
                                });
                            }
                        }
                    }
                    
                    // Respawn de enemigo
                    setTimeout(() => {
                        if (salas[codigo] && salas[codigo].partidaIniciada) {
                            const nuevo = crearEnemigo(sala.mapaData.ancho, sala.mapaData.alto);
                            salas[codigo].enemigos.push(nuevo);
                            io.to(codigo).emit('nuevoEnemigo', nuevo);
                        }
                    }, 5000);
                }
            }
            
            // Animación de ataque
            io.to(codigo).emit('animacionAtaque', {
                id: socket.id,
                x: jugador.x,
                y: jugador.y,
                direccion: data.direccion || 0
            });
            
        } catch (error) {
            console.error('Error en atacar:', error);
        }
    });

    // ==================== CHAT ====================
    socket.on('enviarMensaje', (data) => {
        try {
            if (!data || !data.texto || data.texto.trim() === '') return;
            
            const resultado = obtenerSalaDeJugador(socket.id);
            if (!resultado) return;
            
            const { jugador, codigo } = resultado;
            const textoLimpio = data.texto.trim().substring(0, 200);
            
            io.to(codigo).emit('nuevoMensaje', {
                username: jugador.username,
                texto: textoLimpio
            });
            
            console.log('💬 Chat [' + codigo + '] ' + jugador.username + ': ' + textoLimpio);
        } catch (error) {
            console.error('Error en enviarMensaje:', error);
        }
    });

    // ==================== SALIR DEL LOBBY ====================
    socket.on('salirDelLobby', () => {
        try {
            const resultado = obtenerSalaDeJugador(socket.id);
            if (!resultado) return;
            
            const { sala, jugador, codigo } = resultado;
            const index = sala.jugadores.findIndex(j => j.id === socket.id);
            
            if (index !== -1) {
                const username = jugador.username;
                sala.jugadores.splice(index, 1);
                
                if (sala.jugadores.length === 0) {
                    delete salas[codigo];
                    console.log('🗑️ Sala eliminada:', codigo);
                } else {
                    // Si el creador sale, asignar nuevo creador
                    if (jugador.esCreador && sala.jugadores.length > 0) {
                        sala.jugadores[0].esCreador = true;
                    }
                    
                    io.to(codigo).emit('jugadorSalioLobby', sala);
                    io.to(codigo).emit('jugadorDesconectado', { 
                        id: socket.id, 
                        username: username 
                    });
                    io.to(codigo).emit('notificacionSala', {
                        mensaje: '👋 ' + username + ' ha salido de la sala',
                        tipo: 'info'
                    });
                }
                
                socket.leave(codigo);
                jugadoresConectados[socket.id].salaActual = null;
            }
        } catch (error) {
            console.error('Error en salirDelLobby:', error);
        }
    });

    // ==================== DESCONEXIÓN ====================
    socket.on('disconnect', () => {
        console.log('❌ Jugador desconectado:', socket.id);
        
        // Limpiar salas
        for (let codigo in salas) {
            const index = salas[codigo].jugadores.findIndex(j => j.id === socket.id);
            if (index !== -1) {
                const username = salas[codigo].jugadores[index].username;
                salas[codigo].jugadores.splice(index, 1);
                
                if (salas[codigo].jugadores.length === 0) {
                    delete salas[codigo];
                    console.log('🗑️ Sala eliminada por desconexión:', codigo);
                } else {
                    if (salas[codigo].jugadores.length > 0 && !salas[codigo].jugadores.some(j => j.esCreador)) {
                        salas[codigo].jugadores[0].esCreador = true;
                    }
                    
                    io.to(codigo).emit('jugadorSalioLobby', salas[codigo]);
                    io.to(codigo).emit('jugadorDesconectado', { 
                        id: socket.id, 
                        username: username 
                    });
                }
                break;
            }
        }
        
        // Limpiar registro
        delete jugadoresConectados[socket.id];
        console.log('📊 Jugadores restantes:', io.engine.clientsCount);
    });
});

// ============================================================
// SISTEMA DE IA DE ENEMIGOS
// ============================================================
setInterval(() => {
    for (let codigo in salas) {
        const sala = salas[codigo];
        
        // Verificar que la sala está activa
        if (!sala.partidaIniciada || sala.jugadores.length === 0) continue;
        
        // Verificar jugadores inactivos (desconectados)
        const ahora = Date.now();
        sala.jugadores = sala.jugadores.filter(j => {
            if (j.ultimaActividad && ahora - j.ultimaActividad > 30000) {
                console.log('⏰ Jugador inactivo removido:', j.username);
                return false;
            }
            return true;
        });
        
        if (sala.jugadores.length === 0) {
            delete salas[codigo];
            continue;
        }
        
        // IA de enemigos
        for (let enemigo of sala.enemigos) {
            if (enemigo.vida <= 0) continue;
            
            let jugadorMasCercano = null;
            let distanciaMinima = Infinity;
            
            for (let jugador of sala.jugadores) {
                if (jugador.muerto) continue;
                
                const dx = enemigo.x - jugador.x;
                const dy = enemigo.y - jugador.y;
                const distancia = Math.sqrt(dx * dx + dy * dy);
                
                if (distancia < distanciaMinima) {
                    distanciaMinima = distancia;
                    jugadorMasCercano = jugador;
                }
            }
            
            if (jugadorMasCercano && distanciaMinima < enemigo.rango) {
                // Perseguir al jugador
                const angulo = Math.atan2(
                    jugadorMasCercano.y - enemigo.y,
                    jugadorMasCercano.x - enemigo.x
                );
                
                enemigo.x += Math.cos(angulo) * enemigo.velocidad;
                enemigo.y += Math.sin(angulo) * enemigo.velocidad;
                
                enemigo.estado = 'persiguiendo';
            } else {
                // Patrullaje aleatorio
                if (!enemigo.patrullaAngulo) {
                    enemigo.patrullaAngulo = Math.random() * Math.PI * 2;
                }
                
                enemigo.patrullaAngulo += (Math.random() - 0.5) * 0.3;
                enemigo.x += Math.cos(enemigo.patrullaAngulo) * enemigo.velocidad * 0.3;
                enemigo.y += Math.sin(enemigo.patrullaAngulo) * enemigo.velocidad * 0.3;
                
                enemigo.estado = 'patrullando';
            }
            
            // Limitar al mapa
            enemigo.x = Math.max(20, Math.min(sala.mapaData.ancho - 20, enemigo.x));
            enemigo.y = Math.max(20, Math.min(sala.mapaData.alto - 20, enemigo.y));
        }
        
        // Enviar actualización de enemigos
        io.to(codigo).emit('actualizarEnemigos', {
            enemigos: sala.enemigos
                .filter(e => e.vida > 0)
                .map(e => ({
                    id: e.id,
                    x: e.x,
                    y: e.y,
                    vida: e.vida,
                    vidaMax: e.vidaMax,
                    color: e.color,
                    tamaño: e.tamaño,
                    tipoClase: e.tipoClase,
                    nombre: e.nombre,
                    estado: e.estado
                }))
        });
    }
}, 50);

// ============================================================
// SINCRONIZACIÓN DE JUGADORES
// ============================================================
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
                nivel: j.nivel,
                enemigosParaRevivir: j.enemigosParaRevivir || 0
            }))
        });
    }
}, 100);

// ============================================================
// LIMPIEZA PERIÓDICA DE SALAS VACÍAS
// ============================================================
setInterval(() => {
    limpiarSalasVacias();
    console.log('📊 Estado del servidor - Salas activas:', Object.keys(salas).length, '- Jugadores:', io.engine.clientsCount);
}, 60000);

// ============================================================
// INICIAR SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════');
    console.log('🚀 SERVIDOR INICIADO CORRECTAMENTE');
    console.log('═══════════════════════════════════');
    console.log('📡 Puerto:', PORT);
    console.log('🗺️ Mapas disponibles:', Object.keys(DATOS_MAPAS_SERVIDOR).join(', '));
    console.log('👾 Tipos de enemigos: Slime, Esqueleto, Lobo, Golem, Dragón');
    console.log('⚔️ Armas:', Object.keys(armasBase).join(', '));
    console.log('👥 Máximo jugadores por sala: 4');
    console.log('💾 Salas en memoria:', Object.keys(salas).length);
    console.log('═══════════════════════════════════');
});