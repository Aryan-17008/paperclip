// DOM Elements
const welcomePopup = document.getElementById('welcomePopup');
const infoPopup = document.getElementById('infoPopup');
const infoBtn = document.getElementById('infoBtn');
const celebrateBtn = document.getElementById('celebrateBtn');
const confettiCanvas = document.getElementById('confettiCanvas');
const ctx = confettiCanvas.getContext('2d');

// Popup Functions
function openPopup(popup) {
    popup.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePopup(popup) {
    popup.classList.remove('active');
    document.body.style.overflow = '';
}

function closeAllPopups() {
    document.querySelectorAll('.popup-overlay.active').forEach(popup => {
        closePopup(popup);
    });
}

// Welcome popup on page load (slight delay for smooth entry)
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        openPopup(welcomePopup);
    }, 600);
});

// Close popup buttons
 document.querySelectorAll('.popup-close, .popup-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const popupId = btn.getAttribute('data-popup');
        const popup = document.getElementById(popupId);
        if (popup) closePopup(popup);
    });
});

// Close popup on overlay click
 document.querySelectorAll('.popup-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closePopup(overlay);
        }
    });
});

// Close popup on Escape key
 document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllPopups();
    }
});

// Info button
infoBtn.addEventListener('click', () => {
    closeAllPopups();
    setTimeout(() => openPopup(infoPopup), 100);
});

// Confetti System
let confettiParticles = [];
let confettiAnimationId = null;

function resizeCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class ConfettiParticle {
    constructor() {
        this.x = Math.random() * confettiCanvas.width;
        this.y = -20;
        this.size = Math.random() * 10 + 5;
        this.speedY = Math.random() * 3 + 2;
        this.speedX = (Math.random() - 0.5) * 4;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = (Math.random() - 0.5) * 10;
        this.color = this.getRandomColor();
        this.opacity = 1;
        this.decay = Math.random() * 0.008 + 0.004;
    }

    getRandomColor() {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
            '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
            '#BB8FCE', '#85C1E9', '#F8B500', '#6C5CE7'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
        this.y += this.speedY;
        this.x += this.speedX + Math.sin(this.y * 0.01) * 2;
        this.rotation += this.rotationSpeed;
        this.opacity -= this.decay;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }
}

function launchConfetti() {
    // Create burst of confetti
    for (let i = 0; i < 100; i++) {
        confettiParticles.push(new ConfettiParticle());
    }

    if (!confettiAnimationId) {
        animateConfetti();
    }
}

function animateConfetti() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    confettiParticles = confettiParticles.filter(particle => {
        particle.update();
        particle.draw();
        return particle.opacity > 0 && particle.y < confettiCanvas.height + 20;
    });

    if (confettiParticles.length > 0) {
        confettiAnimationId = requestAnimationFrame(animateConfetti);
    } else {
        confettiAnimationId = null;
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
}

// Celebrate button
celebrateBtn.addEventListener('click', () => {
    closeAllPopups();
    launchConfetti();

    // Show a temporary celebration message
    const message = document.createElement('div');
    message.textContent = '🎉 Woohoo! 🎉';
    message.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 24px 48px;
        border-radius: 16px;
        font-size: 1.5rem;
        font-weight: bold;
        color: #764ba2;
        box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        z-index: 2000;
        animation: celebratePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;
    document.body.appendChild(message);

    setTimeout(() => {
        message.style.transition = 'all 0.3s ease';
        message.style.opacity = '0';
        message.style.transform = 'translate(-50%, -50%) scale(0.8)';
        setTimeout(() => message.remove(), 300);
    }, 1500);
});

// Add celebrate animation keyframes dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes celebratePop {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    }
`;
document.head.appendChild(style);
