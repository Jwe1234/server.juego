const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const salas = {};

function generarCodigo() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function crearEnemigo() {
    const tipos = [
        { nombre: 'Slime Verde', color: '#6bcb77', vida: 30, dano: 5, exp: 15, monedas: 5, tamaño: 14, tipo: 'slime' },
        { nombre: 'Slime Rojo', color: '#ff6b6b', vida: 50, dano: 8, exp: 25, monedas: 10, tamaño: 16, tipo: 'slime' },
        { nombre: 'Esqueleto', color: '#ddd', vida: 80, dano: 15, exp: 40, monedas: 20, tamaño: 18, tipo: 'esqueleto' },
        { nombre: 'Lobo Gris', color: '#888', vida: 100, dano: 18, exp: 55, monedas: 30, tamaño: 20, tipo: 'lobo' },
        { nombre: 'Golem', color: '#8B7355', vida: 300, dano: 35, exp: 150, monedas: 80, tamaño: 30, tipo: 'golem' },
        { nombre: 'Dragón', color: '#ff4444', vida: 500, dano: 60, exp: 500, monedas: 300, tamaño: 40, tipo: 'dragon' }
    ];
    const t = tipos[Math.floor(Math.random() * tipos.length)];
    return {
        id: 'e_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        nombre: t.nombre, color: t.color, vida: t.vida, vidaMax: t.vida,
        dano: t.dano, experiencia: t.exp, monedas: t.monedas,
        tamaño: t.tamaño, tipoClase: t.tipo, x: 0, y: 0
    };
}

function generarEnemigos(cantidad, ancho, alto) {
    const enemigos = [];
    for (let i = 0; i < cantidad; i++) {
        const e = crearEnemigo();
        e.x = Math.random() * (ancho - 200) + 100;
        e.y = Math.random() * (alto - 200) + 100;
        enemigos.push(e);
    }
    return enemigos;
}

function crearJugador(socket, username, esCreador) {
    return {
        id: socket.id,
        username,
        esCreador,
        x: 400 + Math.random() * 200,
        y: 300 + Math.random() * 100,
        vida: 100,
        vidaMaxima: 100,
        nivel: 1,
        experiencia: 0,
        experienciaParaSubir: 100,
        monedas: 50,
        danoBase: 10,
        defensa: 5,
        velocidad: 4,
        armaEquipada: 'espadaBasica',
        colorSkin: esCreador ? '#4d96ff' : '#ff6b6b'
    };
}

const armasBase = {
    'espadaBasica': { nombre: 'Espada Básica', velocidad: 1.2, dano: 10, alcance: 50, precio: 0, nivelRequerido: 1, rareza: 'comun' },
    'espadaHierro': { nombre: 'Espada de Hierro', velocidad: 1.0, dano: 18, alcance: 55, precio: 100, nivelRequerido: 3, rareza: 'raro' },
    'hachaBatalla': { nombre: 'Hacha de Batalla', velocidad: 0.8, dano: 28, alcance: 60, precio: 250, nivelRequerido: 5, rareza: 'epico' }
};

io.on('connection', (socket) => {
    console.log('✅ Conectado:', socket.id);

    // ========== JUGAR SOLO ==========
    socket.on('jugarSolo', (data) => {
        const username = data.username || 'Jugador 1';
        const codigo = generarCodigo();
        const jugador = crearJugador(socket, username, true);
        
        salas[codigo] = {
            codigo,
            jugadores: [jugador],
            enemigos: generarEnemigos(25, 3000, 2000),
            objetosSuelo: [],
            mapaData: { nombre: 'Bosque Oscuro', ancho: 3000, alto: 2000, colorFondo: '#2d5a1e' },
            partidaIniciada: true
        };
        
        socket.join(codigo);
        socket.emit('irAlJuego', {
            jugador: jugador,
            sala: salas[codigo],
            armas: armasBase
        });
        console.log('⚔️ Jugador SOLO:', username, 'en sala', codigo);
    });

    // ========== CREAR SALA LOBBY ==========
    socket.on('crearSalaLobby', (data) => {
        const username = data.username || 'Jugador 1';
        const codigo = generarCodigo();
        const jugador = crearJugador(socket, username, true);
        
        salas[codigo] = {
            codigo,
            jugadores: [jugador],
            enemigos: generarEnemigos(25, 3000, 2000),
            objetosSuelo: [],
            mapaData: { nombre: 'Bosque Oscuro', ancho: 3000, alto: 2000, colorFondo: '#2d5a1e' },
            partidaIniciada: false
        };
        
        socket.join(codigo);
        socket.emit('salaCreadaLobby', {
            jugador: jugador,
            sala: salas[codigo],
            armas: armasBase
        });
        console.log('📁 Sala lobby:', codigo, 'creada por', username);
    });

    // ========== UNIRSE A SALA ==========
    socket.on('unirseASala', (data) => {
        const { codigo, username } = data;
        const sala = salas[codigo];
        
        if (!sala) { socket.emit('error', 'Sala no existe'); return; }
        if (sala.jugadores.length >= 4) { socket.emit('error', 'Sala llena'); return; }
        if (sala.partidaIniciada) { socket.emit('error', 'Partida en curso'); return; }

        const nombreReal = username || ('Jugador ' + (sala.jugadores.length + 1));
        const jugador = crearJugador(socket, nombreReal, false);
        sala.jugadores.push(jugador);
        socket.join(codigo);

        socket.emit('unidoALobby', {
            jugador: jugador,
            sala: sala,
            armas: armasBase
        });
        socket.to(codigo).emit('jugadorUnidoALobby', sala);
        console.log('👤', nombreReal, 'unido a', codigo);
    });

    // ========== INICIAR JUEGO DESDE LOBBY ==========
    socket.on('iniciarJuegoDesdeLobby', () => {
        for (let codigo in salas) {
            const sala = salas[codigo];
            const jugador = sala.jugadores.find(j => j.id === socket.id);
            if (jugador && jugador.esCreador && !sala.partidaIniciada) {
                sala.partidaIniciada = true;
                io.to(codigo).emit('iniciarJuegoTodos', { sala });
                console.log('⚔️ Partida iniciada en sala:', codigo);
                break;
            }
        }
    });

    // ========== SALIR DEL LOBBY ==========
    socket.on('salirDelLobby', () => {
        for (let codigo in salas) {
            const sala = salas[codigo];
            const idx = sala.jugadores.findIndex(j => j.id === socket.id);
            if (idx !== -1) {
                const username = sala.jugadores[idx].username;
                sala.jugadores.splice(idx, 1);
                if (sala.jugadores.length === 0) {
                    delete salas[codigo];
                    console.log('🗑️ Sala eliminada:', codigo);
                } else {
                    io.to(codigo).emit('jugadorSalioLobby', sala);
                }
                console.log('🚪', username, 'salió de', codigo);
                break;
            }
        }
    });

    // ========== MOVER ==========
    socket.on('mover', (data) => {
        for (let codigo in salas) {
            const sala = salas[codigo];
            const jugador = sala.jugadores.find(j => j.id === socket.id);
            if (jugador) {
                jugador.x = data.x;
                jugador.y = data.y;
                socket.to(codigo).emit('jugadorMovido', { id: socket.id, x: data.x, y: data.y });
                break;
            }
        }
    });

    // ========== ATACAR ==========
    socket.on('atacar', (data) => {
        for (let codigo in salas) {
            const sala = salas[codigo];
            const jugador = sala.jugadores.find(j => j.id === socket.id);
            if (!jugador) continue;

            const direccion = data.direccion;
            const alcance = armasBase[jugador.armaEquipada]?.alcance || 50;
            
            // Buscar enemigos en la dirección del ataque
            let enemigoGolpeado = null;
            let distMin = alcance + 20;
            
            for (let e of sala.enemigos) {
                const dx = e.x - jugador.x;
                const dy = e.y - jugador.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const ang = Math.atan2(dy, dx);
                const diffAng = Math.abs(ang - direccion);
                
                if (dist < alcance + e.tamaño && diffAng < 1.2) {
                    if (dist < distMin) {
                        distMin = dist;
                        enemigoGolpeado = e;
                    }
                }
            }

            if (enemigoGolpeado) {
                const arma = armasBase[jugador.armaEquipada] || armasBase['espadaBasica'];
                const dano = arma.dano + Math.floor(Math.random() * 5);
                enemigoGolpeado.vida -= dano;

                io.to(codigo).emit('ataqueRealizado', {
                    atacanteId: socket.id,
                    objetivoId: enemigoGolpeado.id,
                    dano,
                    critico: Math.random() < 0.15,
                    objetivoX: enemigoGolpeado.x,
                    objetivoY: enemigoGolpeado.y
                });

                if (enemigoGolpeado.vida <= 0) {
                    jugador.experiencia += enemigoGolpeado.experiencia;
                    jugador.monedas += enemigoGolpeado.monedas;
                    
                    // Subir de nivel
                    while (jugador.experiencia >= jugador.experienciaParaSubir) {
                        jugador.experiencia -= jugador.experienciaParaSubir;
                        jugador.nivel++;
                        jugador.experienciaParaSubir = Math.floor(jugador.experienciaParaSubir * 1.5);
                        jugador.danoBase += 3;
                        jugador.vidaMaxima += 15;
                        jugador.vida = jugador.vidaMaxima;
                    }
                    
                    sala.enemigos = sala.enemigos.filter(e => e.id !== enemigoGolpeado.id);
                    
                    io.to(codigo).emit('enemigoDerrotado', {
                        enemigoId: enemigoGolpeado.id,
                        jugadorId: socket.id,
                        experiencia: enemigoGolpeado.experiencia,
                        monedas: enemigoGolpeado.monedas,
                        posX: enemigoGolpeado.x,
                        posY: enemigoGolpeado.y,
                        loot: []
                    });
                    
                    // Actualizar datos del jugador
                    io.to(codigo).emit('actualizarJugador', {
                        id: socket.id,
                        nivel: jugador.nivel,
                        experiencia: jugador.experiencia,
                        monedas: jugador.monedas,
                        danoBase: jugador.danoBase,
                        vidaMaxima: jugador.vidaMaxima
                    });
                    
                    // Respawn enemigo
                    setTimeout(() => {
                        if (salas[codigo]) {
                            const nuevo = crearEnemigo();
                            nuevo.x = Math.random() * 2800 + 100;
                            nuevo.y = Math.random() * 1800 + 100;
                            salas[codigo].enemigos.push(nuevo);
                            io.to(codigo).emit('nuevoEnemigo', nuevo);
                        }
                    }, 5000);
                }
            }
            
            io.to(codigo).emit('animacionAtaque', {
                id: socket.id,
                x: jugador.x,
                y: jugador.y,
                direccion: direccion
            });
            break;
        }
    });

    // ========== CHAT ==========
    socket.on('enviarMensaje', (data) => {
        for (let codigo in salas) {
            const sala = salas[codigo];
            const jugador = sala.jugadores.find(j => j.id === socket.id);
            if (jugador) {
                io.to(codigo).emit('nuevoMensaje', { username: jugador.username, texto: data.texto });
                break;
            }
        }
    });

    // ========== DESCONEXIÓN ==========
    socket.on('disconnect', () => {
        console.log('❌ Desconectado:', socket.id);
        for (let codigo in salas) {
            const sala = salas[codigo];
            const idx = sala.jugadores.findIndex(j => j.id === socket.id);
            if (idx !== -1) {
                const username = sala.jugadores[idx].username;
                sala.jugadores.splice(idx, 1);
                if (sala.jugadores.length === 0) {
                    delete salas[codigo];
                    console.log('🗑️ Sala eliminada por desconexión:', codigo);
                } else {
                    io.to(codigo).emit('jugadorSalioLobby', sala);
                    io.to(codigo).emit('jugadorDesconectado', { id: socket.id });
                }
                break;
            }
        }
    });
});

// IA enemigos
setInterval(() => {
    for (let codigo in salas) {
        const sala = salas[codigo];
        if (!sala.partidaIniciada || sala.jugadores.length === 0) continue;
        
        for (let e of sala.enemigos) {
            let masCercano = null, distMin = Infinity;
            for (let j of sala.jugadores) {
                const d = Math.sqrt((e.x - j.x) ** 2 + (e.y - j.y) ** 2);
                if (d < distMin) { distMin = d; masCercano = j; }
            }
            if (masCercano && distMin < 350) {
                const ang = Math.atan2(masCercano.y - e.y, masCercano.x - e.x);
                const vel = distMin < 50 ? 0.5 : 1.5;
                e.x += Math.cos(ang) * vel;
                e.y += Math.sin(ang) * vel;
                e.x = Math.max(20, Math.min(2980, e.x));
                e.y = Math.max(20, Math.min(1980, e.y));
                
                // Daño a jugador cercano
                if (distMin < 40) {
                    masCercano.vida -= e.dano * 0.016; // daño por frame (~1s)
                    if (masCercano.vida <= 0) {
                        masCercano.vida = masCercano.vidaMaxima;
                        masCercano.x = 400 + Math.random() * 200;
                        masCercano.y = 300 + Math.random() * 100;
                    }
                }
            }
        }
        
        io.to(codigo).emit('actualizarEnemigos', {
            enemigos: sala.enemigos.map(e => ({
                id: e.id, x: e.x, y: e.y, vida: e.vida, vidaMax: e.vidaMax,
                color: e.color, tamaño: e.tamaño, tipoClase: e.tipoClase, nombre: e.nombre
            }))
        });
        
        // Enviar actualización de jugadores
        io.to(codigo).emit('actualizarTodosJugadores', {
            jugadores: sala.jugadores.map(j => ({
                id: j.id,
                x: j.x,
                y: j.y,
                vida: j.vida,
                vidaMaxima: j.vidaMaxima,
                nivel: j.nivel,
                username: j.username
            }))
        });
    }
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('🚀 Servidor en http://localhost:' + PORT);
});