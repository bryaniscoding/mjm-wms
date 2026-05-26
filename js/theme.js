// ============================================================
//  theme.js — Dark mode, particles, scroll animations
// ============================================================

// ── THEME ─────────────────────────────────────────────────────
function initTheme() {
  const saved  = localStorage.getItem('mjm_theme');
  const prefer = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const theme  = saved || prefer;
  applyTheme(theme, false);
}

function applyTheme(theme, animate = true) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mjm_theme', theme);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  if (animate) {
    btn?.classList.add('spin');
    setTimeout(() => btn?.classList.remove('spin'), 400);
  }
  // Update particle colours
  if (window._particleCtx) initParticles();
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// ── PARTICLES ─────────────────────────────────────────────────
let _particles = [], _particleRAF = null, _particleCtx = null;
const PARTICLE_COUNT = 55;

function getThemeColours() {
  const s   = getComputedStyle(document.documentElement);
  const p   = s.getPropertyValue('--accent-primary').trim() || '#8B6914';
  const sg  = s.getPropertyValue('--accent-sage').trim()    || '#5C7A5C';
  return [p, sg];
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '139,105,20';
}

function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  _particleCtx  = canvas.getContext('2d');
  window._particleCtx = _particleCtx;
  resizeCanvas();
  const colours = getThemeColours();
  _particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x:    Math.random() * canvas.width,
    y:    Math.random() * canvas.height,
    r:    1.5 + Math.random() * 2,
    vx:   (Math.random() - .5) * .35,
    vy:   (Math.random() - .5) * .35,
    opacity: .07 + Math.random() * .08,
    colour: colours[Math.floor(Math.random() * colours.length)],
  }));
  if (_particleRAF) cancelAnimationFrame(_particleRAF);
  tickParticles();
}

function resizeCanvas() {
  const c = document.getElementById('particle-canvas');
  if (!c) return;
  c.width  = window.innerWidth;
  c.height = window.innerHeight;
}

function tickParticles() {
  if (document.hidden) { _particleRAF = requestAnimationFrame(tickParticles); return; }
  const canvas = document.getElementById('particle-canvas');
  if (!canvas || !_particleCtx) return;
  _particleCtx.clearRect(0, 0, canvas.width, canvas.height);

  _particles.forEach((p, i) => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x = canvas.width;
    if (p.x > canvas.width)  p.x = 0;
    if (p.y < 0) p.y = canvas.height;
    if (p.y > canvas.height) p.y = 0;

    const rgb = hexToRgb(p.colour);
    _particleCtx.beginPath();
    _particleCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    _particleCtx.fillStyle = `rgba(${rgb},${p.opacity})`;
    _particleCtx.fill();

    // Connect nearby particles
    for (let j = i + 1; j < _particles.length; j++) {
      const q   = _particles[j];
      const dx  = p.x - q.x; const dy = p.y - q.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 130) {
        _particleCtx.beginPath();
        _particleCtx.moveTo(p.x, p.y);
        _particleCtx.lineTo(q.x, q.y);
        _particleCtx.strokeStyle = `rgba(${rgb},${(1 - dist/130) * 0.06})`;
        _particleCtx.lineWidth   = .5;
        _particleCtx.stroke();
      }
    }
  });
  _particleRAF = requestAnimationFrame(tickParticles);
}

// Pause when tab hidden
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !_particleRAF) tickParticles();
});

// ── SCROLL ANIMATIONS ─────────────────────────────────────────
function initScrollAnimations() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        const delay = Math.min(i, 3) * 70;
        setTimeout(() => entry.target.classList.add('visible'), delay);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.fade-up').forEach(el => obs.observe(el));
}

// Re-run scroll animations when page changes
function refreshScrollAnimations() {
  setTimeout(() => {
    document.querySelectorAll('.fade-up:not(.visible)').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) el.classList.add('visible');
    });
    initScrollAnimations();
  }, 100);
}

// ── THEME TOGGLE SPIN ANIMATION ───────────────────────────────
const spinStyle = document.createElement('style');
spinStyle.textContent = `
  .theme-toggle.spin { animation: themeSpin 400ms cubic-bezier(0.34,1.56,0.64,1) both; }
  @keyframes themeSpin { from{transform:scale(0.5) rotate(-90deg);opacity:0;} to{transform:none;opacity:1;} }
`;
document.head.appendChild(spinStyle);

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('resize', resizeCanvas);
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  // Only start particles if no reduced-motion preference
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    initParticles();
  }
  initScrollAnimations();
});