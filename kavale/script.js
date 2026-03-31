// 1. INITIALISATION DE SUPABASE (REMPLACE PAR TES INFOS)
const SUPABASE_URL = 'https://pdybshweyfvxzvngnuxe.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkeWJzaHdleWZ2eHp2bmdudXhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDg2MDAsImV4cCI6MjA5MDUyNDYwMH0.u442X28Mhs-4T-tydabnMm8now8VfAEeNU-Sicuipq4'; 
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. VARIABLES GLOBALES
const menu = document.getElementById('menu');
const gameContainer = document.getElementById('gameContainer');
const statusText = document.getElementById('status');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myRole = 0; // 1 (Cyan) ou 2 (Magenta)
let channel;
let gameInterval;
const gridSize = 10;
const width = canvas.width;
const height = canvas.height;

// État initial des joueurs
let players = {
    1: { x: 100, y: 300, color: '#00FFFF', direction: 'right', nextDirection: 'right', trail: [], dead: false },
    2: { x: 500, y: 300, color: '#FF00FF', direction: 'left', nextDirection: 'left', trail: [], dead: false }
};

// 3. LOGIQUE DU MENU
document.getElementById('btnP1').onclick = () => connectToRoom(1);
document.getElementById('btnP2').onclick = () => connectToRoom(2);

function connectToRoom(role) {
    const roomName = document.getElementById('roomName').value.trim();
    if (!roomName) return alert("Veuillez entrer un nom de salle !");

    myRole = role;
    menu.style.display = 'none';
    gameContainer.style.display = 'block';
    
    // Décoration du canvas selon le joueur
    canvas.style.borderColor = myRole === 1 ? '#00FFFF' : '#FF00FF';
    canvas.style.boxShadow = `0 0 20px ${myRole === 1 ? 'rgba(0,255,255,0.4)' : 'rgba(255,0,255,0.4)'}`;

    statusText.innerText = "Connexion...";
    statusText.style.color = "white";

    // Rejoindre le canal Supabase (BROADCAST, pas de base de données)
    channel = supabase.channel('kavale-' + roomName);

    // Écouter les mouvements de l'adversaire
    channel.on('broadcast', { event: 'move' }, (payload) => {
        const data = payload.payload;
        if (data.role !== myRole) {
            // On met à jour la position exacte et la direction de l'adversaire
            players[data.role].nextDirection = data.direction;
            players[data.role].x = data.x;
            players[data.role].y = data.y;
        }
    });

    // Écouter le signal de départ
    channel.on('broadcast', { event: 'start_game' }, () => {
        startGameLoop();
    });

    // S'abonner au canal
    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            if (myRole === 1) {
                statusText.innerText = "En attente du Joueur 2...";
            } else {
                statusText.innerText = "Prêt !";
                // Le joueur 2 donne le top départ
                channel.send({ type: 'broadcast', event: 'start_game', payload: {} });
                startGameLoop();
            }
        }
    });
}

// 4. LA BOUCLE DE JEU
function startGameLoop() {
    statusText.innerText = "GO !";
    setTimeout(() => { statusText.innerText = ""; }, 1000);
    
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(update, 80); // Vitesse du jeu (80ms)
}

function update() {
    ctx.clearRect(0, 0, width, height);

    [1, 2].forEach(id => {
        const p = players[id];
        if (p.dead) return;

        // Ajouter la position actuelle à la traînée
        p.trail.push({ x: p.x, y: p.y });

        // Appliquer la nouvelle direction
        p.direction = p.nextDirection;

        // Déplacement
        if (p.direction === 'up') p.y -= gridSize;
        if (p.direction === 'down') p.y += gridSize;
        if (p.direction === 'left') p.x -= gridSize;
        if (p.direction === 'right') p.x += gridSize;

        checkCollisions(id);

        // Dessiner la traînée avec un effet néon
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        p.trail.forEach(pos => ctx.fillRect(pos.x, pos.y, gridSize, gridSize));
        
        // Dessiner la tête (moto)
        ctx.fillStyle = 'white';
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'white';
        ctx.fillRect(p.x, p.y, gridSize, gridSize);
        
        // Reset shadow pour ne pas faire bugger la grille
        ctx.shadowBlur = 0;
    });

    checkGameEnd();
}

// 5. CONTRÔLES DU CLAVIER
window.addEventListener('keydown', e => {
    if (!players[myRole] || players[myRole].dead) return;

    let newDir = null;
    const p = players[myRole];

    // Empêcher de faire demi-tour directement sur soi-même
    if (e.code === 'ArrowUp' && p.direction !== 'down') newDir = 'up';
    if (e.code === 'ArrowDown' && p.direction !== 'up') newDir = 'down';
    if (e.code === 'ArrowLeft' && p.direction !== 'right') newDir = 'left';
    if (e.code === 'ArrowRight' && p.direction !== 'left') newDir = 'right';

    if (newDir && newDir !== p.nextDirection) {
        p.nextDirection = newDir;
        
        // Envoi immédiat à l'adversaire via Supabase Broadcast
        channel.send({
            type: 'broadcast',
            event: 'move',
            payload: { role: myRole, direction: newDir, x: p.x, y: p.y }
        });
    }
});

// 6. COLLISIONS
function checkCollisions(id) {
    const p = players[id];
    const otherId = id === 1 ? 2 : 1;
    const otherP = players[otherId];

    // Murs
    if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) p.dead = true;

    // Sa propre traînée
    for (let i = 0; i < p.trail.length; i++) {
        if (p.x === p.trail[i].x && p.y === p.trail[i].y) p.dead = true;
    }

    // Traînée de l'autre
    for (let i = 0; i < otherP.trail.length; i++) {
        if (p.x === otherP.trail[i].x && p.y === otherP.trail[i].y) p.dead = true;
    }

    // Choc frontal
    if (p.x === otherP.x && p.y === otherP.y) {
        p.dead = true;
        otherP.dead = true;
    }
}

function checkGameEnd() {
    if (players[1].dead || players[2].dead) {
        clearInterval(gameInterval);
        
        if (players[1].dead && players[2].dead) {
            statusText.innerText = "CRASH ! ÉGALITÉ";
            statusText.style.color = "white";
        } else if (players[2].dead) {
            statusText.innerText = "VICTOIRE CYAN !";
            statusText.style.color = "#00FFFF";
        } else {
            statusText.innerText = "VICTOIRE MAGENTA !";
            statusText.style.color = "#FF00FF";
        }
        
        setTimeout(() => supabase.removeChannel(channel), 1000);
    }
}