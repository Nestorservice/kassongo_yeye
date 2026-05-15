

export const CONFIG = {
    WEATHER_API_KEY: 'e19f5f4ce30ec1034569ca385306561d', 
    GRAVITY: 0.48,
    JUMP_FORCE: -16,
    BASE_SCROLL: 3,
    MAX_SCROLL: 8,
    GROUND_RATIO: 0.8,

    /* Chase mechanics */
    GAP_START_RATIO: 0.65,
    LION_BASE_SPEED: 0.15,
    LION_ACCEL: 0.00008,
    BOOST_AMOUNT: 4.5,
    BOOST_DECAY: 0.975,
    WIN_SCORE: 5000,
};

export class AssetLoader {
    constructor() {
        this.cache = {};
        this.loadedCount = 0;
        this.totalCount = 0;
    }

    async loadAll() {
        const manifest = [
            { type: 'image', key: 'background_day', src: 'fond_jour.png' },
            { type: 'image', key: 'background_night', src: 'fond_nuit.png' },
            { type: 'image', key: 'warthog_sheet', src: 'warthog_sheet.png' },
            { type: 'image', key: 'lion_sheet', src: 'lion_sheet.png' },
            { type: 'image', key: 'obstacle_rock', src: 'obstacle_rock.png' },
            { type: 'image', key: 'obstacle_log', src: 'obstacle_log.png' },
            { type: 'image', key: 'obstacle_bush', src: 'obstacle_bush.png' },
            { type: 'audio', key: 'bgm', src: 'https://res.cloudinary.com/dkyxtm1ki/video/upload/v1778721025/audio_fond_iiaot2.mp3' }
        ];

        this.totalCount = manifest.length;
        const promises = manifest.map(item => {
            if (item.type === 'image') {
                return this._loadImage(item.key, item.src).then(img => {
                    if (!img) return;
                    if (item.key === 'warthog_sheet' || item.key === 'lion_sheet') {
                        return this._removeWhiteBG(img).then(processedImg => {
                            this.cache[item.key] = processedImg;
                        });
                    } else {
                        this.cache[item.key] = img;
                    }
                });
            } else {
                return this._loadAudio(item.key, item.src);
            }
        });

        await Promise.all(promises);
    }

    _loadImage(key, src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => { this._updateProgress(); resolve(img); };
            img.onerror = () => { console.warn(`Failed to load ${src}`); this._updateProgress(); resolve(null); };
            img.src = src;
        });
    }

    _loadAudio(key, src) {
        return new Promise((resolve) => {
            const audio = new Audio();
            let settled = false;
            const done = (result) => {
                if (settled) return;
                settled = true;
                this._updateProgress();
                resolve(result);
            };
            audio.oncanplaythrough = () => done(audio);
            audio.onloadeddata = () => done(audio);
            audio.onerror = () => done(null);
            audio.src = src;
            this.cache[key] = audio;
            // Fallback : ne pas bloquer si l'audio tarde à charger
            setTimeout(() => done(audio), 3000);
        });
    }

    _removeWhiteBG(img) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            try {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i], g = data[i + 1], b = data[i + 2];
                    if (r > 230 && g > 230 && b > 230) {
                        data[i + 3] = 0; // Make near-white pixels transparent
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                const newImg = new Image();
                newImg.onload = () => resolve(newImg);
                newImg.src = canvas.toDataURL();
            } catch (e) {
                // If there's a cross-origin error, just fallback to the original image
                resolve(img);
            }
        });
    }

    _updateProgress() {
        this.loadedCount++;
        const el = document.getElementById('loading-bar-fill');
        const text = document.getElementById('loading-text');
        if (!el || !text || this.totalCount === 0) return;
        const pct = Math.floor((this.loadedCount / this.totalCount) * 100);
        el.style.width = `${pct}%`;
        text.textContent = `Loading… ${pct}%`;
    }

    get(key) { return this.cache[key]; }
}

export class EnvironmentManager {
    constructor() {
        this._isDay = true;
        this._isRaining = false;
        this._temp = 25;
    }

    async init() {
        const hour = new Date().getHours();
        this._isDay = (hour >= 6 && hour < 19);

        try {
            const pos = await this._getPosition();
            await this._fetchWeather(pos.coords.latitude, pos.coords.longitude);
        } catch (e) {
            console.log("Using default weather/time data.");
        }
    }

    _getPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
        });
    }

    async _fetchWeather(lat, lon) {
        if (!CONFIG.WEATHER_API_KEY || CONFIG.WEATHER_API_KEY === 'YOUR_API_KEY') return;
        try {
            const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${CONFIG.WEATHER_API_KEY}`);
            const data = await res.json();
            if (data.main) this._temp = Math.round(data.main.temp);
            if (data.weather && data.weather.length > 0) {
                const condition = data.weather[0].main.toLowerCase();
                this._isRaining = condition.includes('rain') || condition.includes('drizzle') || condition.includes('thunderstorm');
            }
        } catch (e) {
            console.error('Weather fetch error', e);
        }
    }

    isDay() { return this._isDay; }
    isRaining() { return this._isRaining; }
    getWeatherText() {
        const tod = this._isDay ? '☀️ Day' : '🌙 Night';
        const weather = this._isRaining ? '🌧️ Rain' : '⛅ Clear';
        return `${tod} | ${weather} | ${this._temp}°C`;
    }
}

export class BackgroundRenderer {
    constructor(assets) {
        this._assets = assets;
        this._img = null;
        this._x = 0;
    }

    setMode(isDay) {
        this._img = this._assets.get(isDay ? 'background_day' : 'background_night');
        document.body.className = isDay ? 'theme-day' : 'theme-night';
    }

    update(speed) {
        if (!this._img) return;
        this._x -= speed * 0.5;
        if (this._x <= -this._img.width) {
            this._x += this._img.width;
        }
    }

    draw(ctx, w, h) {
        if (!this._img) return;
        const ratio = h / this._img.height;
        const imgW = this._img.width * ratio;

        let dx = this._x * ratio; // Scale movement based on ratio
        while (dx < w) {
            ctx.drawImage(this._img, dx, 0, imgW, h);
            dx += imgW;
        }
        this._x = (this._x * ratio % imgW) / ratio;
    }
}

export class Warthog {
    constructor(cw, ch) {
        this.scale = 0.45;
        this.frameWidth = 271.5;
        this.frameHeight = 724;
        this.width = this.frameWidth * this.scale;
        this.height = this.frameHeight * this.scale;
        this.yOffset = this.height * 0.65; // Larger offset to compensate for the tall sprite frame

        this.x = cw * 0.65; // Place warthog on the right side of the screen
        this.baseY = ch * CONFIG.GROUND_RATIO - this.height + this.yOffset;
        this.y = this.baseY;

        this.boost = 0;
        this.vy = 0;
        this.isJumping = false;
        this.frameTimer = 0;
        this.frame = 0;
        this.maxFrames = 6;
    }

    resize(cw, ch) {
        this.baseY = ch * CONFIG.GROUND_RATIO - this.height + this.yOffset;
        if (!this.isJumping) this.y = this.baseY;
    }

    accelerate() {
        this.boost += CONFIG.BOOST_AMOUNT;
        if (this.boost > 15) this.boost = 15;
    }

    jump() {
        if (!this.isJumping) {
            this.vy = CONFIG.JUMP_FORCE;
            this.isJumping = true;
        }
    }

    update() {
        this.boost *= CONFIG.BOOST_DECAY;
        if (this.boost < 0.1) this.boost = 0;

        if (this.isJumping) {
            this.vy += CONFIG.GRAVITY;
            this.y += this.vy;
            if (this.y >= this.baseY) {
                this.y = this.baseY;
                this.vy = 0;
                this.isJumping = false;
            }
        }

        this.frameTimer++;
        if (this.frameTimer > 4) {
            this.frameTimer = 0;
            this.frame = (this.frame + 1) % this.maxFrames;
        }
    }

    draw(ctx, sheet) {
        // Shadow on the ground when airborne
        const groundY = this.baseY + this.height * 0.35;
        const jumpHeight = this.baseY - this.y;
        if (jumpHeight > 2) {
            const maxJump = (CONFIG.JUMP_FORCE * CONFIG.JUMP_FORCE) / (2 * CONFIG.GRAVITY);
            const ratio = Math.max(0, 1 - jumpHeight / maxJump);
            const rx = this.width * 0.3 * (0.25 + ratio * 0.75);
            const ry = rx * 0.22;
            ctx.save();
            ctx.globalAlpha = 0.4 * ratio;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(this.x + this.width * 0.5, groundY + 4, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (!sheet) {
            ctx.fillStyle = '#ff8800';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            return;
        }
        ctx.drawImage(
            sheet,
            this.frame * this.frameWidth, 0, this.frameWidth, this.frameHeight,
            this.x, this.y, this.width, this.height
        );
    }
}

export class ChaseLion {
    constructor(cw, ch) {
        this.scale = 0.45;
        this.frameWidth = 271.5;
        this.frameHeight = 724;
        this.width = this.frameWidth * this.scale;
        this.height = this.frameHeight * this.scale;
        this.yOffset = this.height * 0.65; // Larger offset to compensate for the tall sprite frame

        this.x = -this.width;
        this.baseY = ch * CONFIG.GROUND_RATIO - this.height + this.yOffset;
        this.y = this.baseY;

        this.frameTimer = 0;
        this.frame = 0;
        this.maxFrames = 6;
    }

    resize(ch) {
        this.baseY = ch * CONFIG.GROUND_RATIO - this.height + this.yOffset;
        this.y = this.baseY;
    }

    update(dtSpeed) {
        this.frameTimer += 1;
        let animSpeed = Math.max(2, 6 - dtSpeed);
        if (this.frameTimer > animSpeed) {
            this.frameTimer = 0;
            this.frame = (this.frame + 1) % this.maxFrames;
        }
    }

    updatePosition(warthogX, gap) {
        this.x = warthogX - gap - this.width;
    }

    draw(ctx, sheet) {
        if (!sheet) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            return;
        }
        ctx.drawImage(
            sheet,
            this.frame * this.frameWidth, 0, this.frameWidth, this.frameHeight,
            this.x, this.y, this.width, this.height
        );
    }
}

export class ObstacleManager {
    constructor() {
        this._obstacles = [];
        this._spawnTimer = 0;
        this._nextSpawn = 160;
        this._types = ['rock', 'log', 'bush'];
    }

    reset() {
        this._obstacles = [];
        this._spawnTimer = 0;
        this._nextSpawn = 160;
    }

    update(scrollSpeed, cw, ch) {
        this._spawnTimer++;
        if (this._spawnTimer >= this._nextSpawn) {
            this._spawnTimer = 0;
            // Spawn plus souvent quand le jeu va vite
            this._nextSpawn = Math.max(45, Math.floor((80 + Math.random() * 100) * (CONFIG.BASE_SCROLL / scrollSpeed)));
            this._spawn(cw, ch);
        }
        for (let i = this._obstacles.length - 1; i >= 0; i--) {
            this._obstacles[i].x -= scrollSpeed;
            if (this._obstacles[i].x + this._obstacles[i].w < 0) {
                this._obstacles.splice(i, 1);
            }
        }
    }

    _spawn(cw, ch) {
        if (this._obstacles.length > 0 && this._obstacles[this._obstacles.length - 1].x > cw * 0.75) return;
        const type = this._types[Math.floor(Math.random() * this._types.length)];
        const groundY = ch * CONFIG.GROUND_RATIO;
        const h = ch * (0.10 + Math.random() * 0.06);
        const w = h * (0.65 + Math.random() * 0.35);
        this._obstacles.push({ type, x: cw + 20, y: groundY - h, w, h });
    }

    checkCollision(warthog) {
        // Narrow hitbox: center 44% of sprite width, top 28% of height (actual animal body)
        const wx1 = warthog.x + warthog.width * 0.28;
        const wx2 = warthog.x + warthog.width * 0.72;
        const wy1 = warthog.y;
        const wy2 = warthog.y + warthog.height * 0.28;
        for (const obs of this._obstacles) {
            // Only check central 70% of obstacle width to forgive clipping on edges
            if (wx1 < obs.x + obs.w * 0.85 && wx2 > obs.x + obs.w * 0.15 &&
                wy1 < obs.y + obs.h * 0.9 && wy2 > obs.y) {
                return true;
            }
        }
        return false;
    }

    draw(ctx, assets) {
        for (const obs of this._obstacles) {
            const img = assets.get('obstacle_' + obs.type);
            if (img) {
                ctx.drawImage(img, obs.x, obs.y, obs.w, obs.h);
            } else {
                ctx.fillStyle = obs.type === 'rock' ? '#888' : obs.type === 'log' ? '#8B4513' : '#228B22';
                ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            }
        }
    }
}

export class RainSystem {
    constructor() {
        this.active = false;
        this.drops = [];
        this.canvas = document.getElementById('rain-canvas');
        if (this.canvas) this.ctx = this.canvas.getContext('2d');
    }

    activate(w, h) {
        this.active = true;
        if (this.canvas) {
            this.canvas.classList.add('rain-active');
            this.resize(w, h);
            for (let i = 0; i < 150; i++) {
                this.drops.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    s: Math.random() * 4 + 4,
                    l: Math.random() * 20 + 10
                });
            }
        }
    }

    resize(w, h) {
        if (this.canvas) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
    }

    update() {
        if (!this.active || !this.canvas) return;
        const h = this.canvas.height;
        for (let i = 0; i < this.drops.length; i++) {
            let d = this.drops[i];
            d.y += d.s * 2;
            d.x -= 2;
            if (d.y > h) {
                d.y = -20;
                d.x = Math.random() * this.canvas.width;
            }
        }
    }

    draw() {
        if (!this.active || !this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        for (let i = 0; i < this.drops.length; i++) {
            let d = this.drops[i];
            this.ctx.moveTo(d.x, d.y);
            this.ctx.lineTo(d.x - 2, d.y + d.l);
        }
        this.ctx.stroke();
    }
}

export class ScoreManager {
    constructor() {
        this.current = 0;
        this.best = parseInt(localStorage.getItem('kassongo_best')) || 0;
    }

    reset() {
        this.current = 0;
    }

    update() {
        this.current += 1;
        if (this.current > this.best) {
            this.best = this.current;
            localStorage.setItem('kassongo_best', this.best.toString());
        }
    }

    format(num) {
        return Math.floor(num).toString().padStart(5, '0');
    }
}

export class AudioManager {
    constructor(assets) {
        this._assets = assets;
        this._muted = false;
        this._bgm = null;
    }

    toggle() {
        this._muted = !this._muted;
        if (this._bgm) {
            this._bgm.muted = this._muted;
        }
    }

    isMuted() { return this._muted; }

    start() {
        if (!this._bgm) {
            this._bgm = this._assets.get('bgm');
            if (this._bgm) {
                this._bgm.loop = true;
                this._bgm.volume = 0.5;
            }
        }
        if (this._bgm && !this._muted) {
            this._bgm.play().catch(e => console.log('Audio blocked', e));
        }
    }
}
