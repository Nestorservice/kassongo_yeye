/* ═══════════════════════════════════════════════════════════════
   KASSONGO RUN — game.js (main entry, type="module")
   Chase-style: Warthog flees, Lion pursues. Tap to boost!
   ═══════════════════════════════════════════════════════════════ */

import {
    CONFIG, AssetLoader, EnvironmentManager, BackgroundRenderer,
    Warthog, ChaseLion, ObstacleManager, RainSystem, ScoreManager, AudioManager
} from './engine.js';

const STATE = { LOADING: 0, MENU: 1, PLAYING: 2, CAVE_TRANSITION: 3, GAMEOVER: 4, WIN: 5 };

class Game {
    constructor() {
        this._state = STATE.LOADING;
        this._canvas = document.getElementById('game-canvas');
        this._ctx = this._canvas.getContext('2d');
        this._assets = new AssetLoader();
        this._env = new EnvironmentManager();
        this._bg = null;
        this._warthog = null;
        this._lion = null;
        this._obstacles = null;
        this._rain = new RainSystem();
        this._score = new ScoreManager();
        this._audio = null;
        this._gap = 0;
        this._lionSpeed = CONFIG.LION_BASE_SPEED;
        this._scrollSpeed = CONFIG.BASE_SCROLL;
        this._lastTime = 0;
        this._animId = null;
        this._caveAlpha = 0;
        this._cavePhase = 0;
        this._caveTimer = 0;
        this._dangerFlash = 0;
        this._screens = {
            loading: document.getElementById('screen-loading'),
            menu: document.getElementById('screen-menu'),
            game: document.getElementById('screen-game'),
            gameover: document.getElementById('screen-gameover'),
            win: document.getElementById('screen-win'),
        };
        this._els = {
            hudScore: document.getElementById('hud-score'),
            hudBest: document.getElementById('hud-best'),
            hudWeather: document.getElementById('hud-weather'),
            hudGap: document.getElementById('hud-gap-fill'),
            menuBest: document.getElementById('menu-best-score'),
            menuWeather: document.getElementById('menu-weather'),
            goScore: document.getElementById('gameover-score'),
            goBest: document.getElementById('gameover-best'),
            winScore: document.getElementById('win-score'),
            btnPlay: document.getElementById('btn-play'),
            btnMute: document.getElementById('btn-mute'),
            btnRetry: document.getElementById('btn-retry'),
            btnMenu: document.getElementById('btn-menu'),
            btnMenuWin: document.getElementById('btn-menu-win'),
        };
        this._bound_loop = this._loop.bind(this);
        this._setupResize();
        this._setupInput();
    }

    async init() {
        this._resizeCanvas();
        try { await this._assets.loadAll(); } catch (e) {}
        this._bg = new BackgroundRenderer(this._assets);
        this._audio = new AudioManager(this._assets);
        try { await this._env.init(); } catch (e) {}
        this._bg.setMode(this._env.isDay());
        if (this._env.isRaining()) this._rain.activate(this._canvas.width, this._canvas.height);
        if (this._els.menuWeather) this._els.menuWeather.textContent = this._env.getWeatherText();
        if (this._els.hudWeather) this._els.hudWeather.textContent = this._env.getWeatherText();
        this._showScreen('menu');
        this._updateMenuBest();
    }

    _showScreen(name) {
        Object.values(this._screens).forEach((s) => { if (s) s.classList.remove('active'); });
        const target = this._screens[name];
        if (target) target.classList.add('active');
    }

    _resizeCanvas() {
        const w = window.innerWidth, h = window.innerHeight;
        this._canvas.width = w;
        this._canvas.height = h;
        this._rain.resize(w, h);
        if (this._warthog) this._warthog.resize(w, h);
        if (this._lion) this._lion.resize(h);
    }

    _setupResize() { window.addEventListener('resize', () => this._resizeCanvas()); }

    _setupInput() {
        this._canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (this._state === STATE.PLAYING && this._warthog) {
                if (!this._warthog.isJumping) {
                    this._warthog.jump();
                } else {
                    this._warthog.accelerate();
                }
            }
        });
        document.addEventListener('keydown', (e) => {
            if ((e.code === 'Space' || e.code === 'ArrowUp') && this._state === STATE.PLAYING && this._warthog) {
                e.preventDefault();
                if (!this._warthog.isJumping) {
                    this._warthog.jump();
                } else {
                    this._warthog.accelerate();
                }
            }
        });
        if (this._els.btnPlay) this._els.btnPlay.addEventListener('click', () => this._start());
        if (this._els.btnRetry) this._els.btnRetry.addEventListener('click', () => this._start());
        if (this._els.btnMenu) this._els.btnMenu.addEventListener('click', () => this._toMenu());
        if (this._els.btnMenuWin) this._els.btnMenuWin.addEventListener('click', () => this._toMenu());
        if (this._els.btnMute) {
            this._els.btnMute.addEventListener('click', () => {
                if (this._audio) { this._audio.toggle(); this._els.btnMute.textContent = this._audio.isMuted() ? '🔇 Sound OFF' : '🔊 Sound ON'; }
            });
        }
    }

    _toMenu() {
        this._state = STATE.MENU;
        this._updateMenuBest();
        this._showScreen('menu');
    }

    _updateMenuBest() {
        const fmt = this._score.format(this._score.best);
        if (this._els.menuBest) this._els.menuBest.textContent = 'Best: ' + fmt;
    }

    _start() {
        this._state = STATE.PLAYING;
        this._scrollSpeed = CONFIG.BASE_SCROLL;
        this._lionSpeed = CONFIG.LION_BASE_SPEED;
        this._gap = this._canvas.width * CONFIG.GAP_START_RATIO;
        this._caveAlpha = 0;
        this._cavePhase = 0;
        this._lastTime = 0;
        this._dangerFlash = 0;
        this._score.reset();
        this._warthog = new Warthog(this._canvas.width, this._canvas.height);
        this._lion = new ChaseLion(this._canvas.width, this._canvas.height);
        this._obstacles = new ObstacleManager();
        if (this._audio) this._audio.start();
        this._showScreen('game');
        if (this._animId) cancelAnimationFrame(this._animId);
        this._animId = requestAnimationFrame(this._bound_loop);
    }

    _loop(timestamp) {
        if (this._state !== STATE.PLAYING && this._state !== STATE.CAVE_TRANSITION) return;
        if (this._lastTime === 0) this._lastTime = timestamp;
        const dt = Math.min(timestamp - this._lastTime, 50);
        this._lastTime = timestamp;
        const dtF = dt / 16.667;

        if (this._state === STATE.PLAYING) {
            /* Lion accelerates over time */
            this._lionSpeed += CONFIG.LION_ACCEL * dtF;
            /* Gap shrinks as lion approaches, grows with warthog boost */
            this._gap -= this._lionSpeed * dtF;
            this._gap += this._warthog.boost * dtF;
            /* Scroll speed: progression temporelle + boost */
            const progress = Math.min(this._score.current / CONFIG.WIN_SCORE, 1);
            this._scrollSpeed = CONFIG.BASE_SCROLL + progress * 4 + this._warthog.boost * 0.6;
            this._scrollSpeed = Math.min(this._scrollSpeed, CONFIG.MAX_SCROLL);
            /* Update everything */
            this._bg.update(this._scrollSpeed * dtF);
            this._warthog.update();
            this._lion.update(this._lionSpeed);
            this._lion.updatePosition(this._warthog.x, this._gap);
            this._obstacles.update(this._scrollSpeed, this._canvas.width, this._canvas.height);
            this._rain.update();
            this._score.update();
            /* Danger flash when lion is close */
            const dangerRatio = 1 - Math.min(this._gap / (this._canvas.width * 0.3), 1);
            this._dangerFlash = dangerRatio;
            /* Lion collision check */
            if (this._gap <= this._warthog.width * 0.3) {
                this._gameOver();
                return;
            }
            /* Obstacle collision check */
            if (this._obstacles.checkCollision(this._warthog)) {
                this._gameOver();
                return;
            }
            /* Win check */
            if (this._score.current >= CONFIG.WIN_SCORE) {
                this._startCaveTransition();
                this._animId = requestAnimationFrame(this._bound_loop);
                return;
            }
        } else if (this._state === STATE.CAVE_TRANSITION) {
            this._updateCaveTransition(dt);
        }

        this._draw();
        this._updateHUD();
        this._animId = requestAnimationFrame(this._bound_loop);
    }

    _draw() {
        const ctx = this._ctx;
        const w = this._canvas.width, h = this._canvas.height;
        ctx.clearRect(0, 0, w, h);
        this._bg.draw(ctx, w, h);
        /* Ground overlay */
        const groundY = h * CONFIG.GROUND_RATIO;
        ctx.fillStyle = 'rgba(80, 50, 20, 0.25)';
        ctx.fillRect(0, groundY, w, h - groundY);
        /* Lion (behind warthog) */
        const lionSheet = this._assets.get('lion_sheet');
        if (this._lion) this._lion.draw(ctx, lionSheet);
        /* Obstacles */
        if (this._obstacles) this._obstacles.draw(ctx, this._assets);
        /* Warthog */
        const warthogSheet = this._assets.get('warthog_sheet');
        if (this._warthog) this._warthog.draw(ctx, warthogSheet);
        /* Speed lines when boosting */
        if (this._warthog && this._warthog.boost > 0.5) {
            ctx.save();
            const alpha = Math.min(this._warthog.boost / 5, 0.6);
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
            ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                const ly = this._warthog.y + Math.random() * this._warthog.height;
                const lx = this._warthog.x - 10 - Math.random() * 40;
                ctx.beginPath();
                ctx.moveTo(lx, ly);
                ctx.lineTo(lx - 20 - Math.random() * 30, ly);
                ctx.stroke();
            }
            ctx.restore();
        }
        /* Danger vignette */
        if (this._dangerFlash > 0.1) {
            const grd = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h);
            grd.addColorStop(0, 'rgba(255,0,0,0)');
            grd.addColorStop(1, `rgba(255,0,0,${this._dangerFlash * 0.35})`);
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, w, h);
        }
        this._rain.draw();
        /* Cave fade */
        if (this._caveAlpha > 0) {
            ctx.fillStyle = `rgba(0,0,0,${this._caveAlpha})`;
            ctx.fillRect(0, 0, w, h);
        }
    }

    _updateHUD() {
        if (this._els.hudScore) this._els.hudScore.textContent = this._score.format(this._score.current);
        if (this._els.hudBest) this._els.hudBest.textContent = 'HI ' + this._score.format(this._score.best);
        /* Gap bar */
        if (this._els.hudGap) {
            const maxGap = this._canvas.width * CONFIG.GAP_START_RATIO;
            const pct = Math.max(0, Math.min(100, (this._gap / maxGap) * 100));
            this._els.hudGap.style.width = pct + '%';
            if (pct < 25) this._els.hudGap.style.background = '#ff4444';
            else if (pct < 50) this._els.hudGap.style.background = '#ffaa00';
            else this._els.hudGap.style.background = '#44cc44';
        }
    }

    _startCaveTransition() {
        this._state = STATE.CAVE_TRANSITION;
        this._cavePhase = 0;
        this._caveTimer = 0;
    }

    _updateCaveTransition(dt) {
        this._caveTimer += dt;
        if (this._cavePhase === 0) {
            if (this._warthog) this._warthog.x += 4;
            this._caveAlpha = Math.min(this._caveTimer / 1500, 1);
            if (this._caveTimer >= 1500) { this._cavePhase = 1; this._caveTimer = 0; }
        } else if (this._cavePhase === 1) {
            this._caveAlpha = 1;
            if (this._caveTimer >= 800) {
                this._caveAlpha = 0;
                this._win();
            }
        }
    }

    _win() {
        this._state = STATE.WIN;
        if (this._animId) cancelAnimationFrame(this._animId);
        if (this._els.winScore) this._els.winScore.textContent = this._score.format(this._score.current);
        this._showScreen('win');
    }

    _gameOver() {
        this._state = STATE.GAMEOVER;
        if (this._animId) cancelAnimationFrame(this._animId);
        this._draw();
        if (this._els.goScore) this._els.goScore.textContent = this._score.format(this._score.current);
        if (this._els.goBest) this._els.goBest.textContent = this._score.format(this._score.best);
        this._showScreen('gameover');
    }
}

const game = new Game();
game.init();
