/* ===== PARTICLES ===== */
function createParticles() {
    const container = document.getElementById('particles');
    const colors = ['#ff006e', '#8338ec', '#3a86ff', '#06ffa5', '#ffbe0b', '#fb5607'];
    const particleCount = 25;

    for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 8 + 4;
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.left = `${Math.random() * 100}%`;
        p.style.animationDuration = `${Math.random() * 8 + 6}s`;
        p.style.animationDelay = `${Math.random() * 5}s`;
        container.appendChild(p);
    }
}

/* ===== POPUP SYSTEM ===== */
function showPopup(id) {
    const popup = document.getElementById(id);
    if (!popup) return;
    popup.classList.add('active');

    if (id === 'confettiPopup') {
        launchConfetti();
    }
}

function hidePopup(id) {
    const popup = document.getElementById(id);
    if (!popup) return;
    popup.classList.remove('active');
}

function setupPopups() {
    // Close buttons
    document.querySelectorAll('.popup-close').forEach(btn => {
        btn.addEventListener('click', () => {
            hidePopup(btn.dataset.popup);
        });
    });

    // Close on overlay click
    document.querySelectorAll('.popup-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // Trigger buttons
    document.getElementById('infoBtn')?.addEventListener('click', () => showPopup('infoPopup'));
    document.getElementById('confettiBtn')?.addEventListener('click', () => showPopup('confettiPopup'));
}

/* ===== CONFETTI SYSTEM ===== */
const canvas = document.getElementById('confettiCanvas');
const ctx = canvas.getContext('2d');
let confettiParticles = [];
let confettiAnimating = false;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function createConfettiPiece() {
    const colors = ['#ff006e', '#8338ec', '#3a86ff', '#06ffa5', '#ffbe0b', '#fb5607', '#ffffff'];
    return {
        x: Math.random() * canvas.width,
        y: -20,
        size: Math.random() * 10 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedY: Math.random() * 4 + 2,
        speedX: Math.random() * 4 - 2,
        rotation: Math.random() * 360,
        rotationSpeed: Math.random() * 8 - 4,
        opacity: 1,
        shape: Math.random() > 0.5 ? 'rect' : 'circle'
    };
}

function launchConfetti() {
    confettiParticles = [];
    for (let i = 0; i < 120; i++) {
        confettiParticles.push(createConfettiPiece());
    }
    if (!confettiAnimating) {
        confettiAnimating = true;
        animateConfetti();
    }
}

function animateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    confettiParticles.forEach((p, i) => {
        p.y += p.speedY;
        p.x += p.speedX;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.003;

        if (p.opacity <= 0 || p.y > canvas.height + 20) {
            confettiParticles.splice(i, 1);
            return;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;

        if (p.shape === 'rect') {
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    });

    if (confettiParticles.length > 0) {
        requestAnimationFrame(animateConfetti);
    } else {
        confettiAnimating = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

/* ===== INIT ===== */
window.addEventListener('DOMContentLoaded', () => {
    createParticles();
    setupPopups();
    resizeCanvas();

    // Show welcome popup after card entrance
    setTimeout(() => {
        showPopup('welcomePopup');
    }, 900);
});

window.addEventListener('resize', resizeCanvas);
