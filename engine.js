

export const CONFIG = {
    WEATHER_API_KEY: 'e19f5f4ce30ec1034569ca385306561d', 
    GRAVITY: 0.52,
    JUMP_FORCE: -13,
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
        this._isCloudy = false;
        this._isSunny = false;
        this._temp = 25;
    }

    async init() {
        const hour = new Date().getHours();
        this._isDay = (hour >= 6 && hour < 19);
        this._isSunny = this._isDay;

        let lat = null, lon = null;

        // 1. Essayer la géolocalisation GPS
        try {
            const pos = await this._getPosition();
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
        } catch (_) {
            // 2. Fallback : géolocalisation par adresse IP (aucune permission requise)
            try {
                const res = await fetch('https://ip-api.com/json/');
                const d = await res.json();
                if (d.status === 'success') { lat = d.lat; lon = d.lon; }
            } catch (_2) {}
        }

        if (lat !== null && lon !== null) {
            await this._fetchWeather(lat, lon);
        }
    }

    _getPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('no geolocation'));
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
        });
    }

    async _fetchWeather(lat, lon) {
        if (!CONFIG.WEATHER_API_KEY || CONFIG.WEATHER_API_KEY === 'YOUR_API_KEY') return;
        try {
            const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${CONFIG.WEATHER_API_KEY}`);
            const data = await res.json();
            if (data.main) this._temp = Math.round(data.main.temp);
            if (data.weather && data.weather.length > 0) {
                const m = data.weather[0].main.toLowerCase();
                this._isRaining = m === 'rain' || m === 'drizzle' || m === 'thunderstorm';
                this._isCloudy  = m === 'clouds' || m === 'atmosphere' || this._isRaining;
                this._isSunny   = m === 'clear';
            }
            // Lever/coucher du soleil astronomique exact pour la localisation
            if (data.sys && data.sys.sunrise && data.sys.sunset) {
                const now = Math.floor(Date.now() / 1000);
                this._isDay = now >= data.sys.sunrise && now <= data.sys.sunset;
            }
        } catch (e) {
            console.error('Weather fetch error', e);
        }
    }

    isDay()      { return this._isDay; }
    isRaining()  { return this._isRaining; }
    isCloudy()   { return this._isCloudy; }
    isSunny()    { return this._isSunny; }

    getWeatherText() {
        const tod  = this._isDay ? '☀️' : '🌙';
        const rain = this._isRaining ? '🌧️' : '';
        const cld  = (!this._isRaining && this._isCloudy) ? '☁️' : '';
        return `${tod}${rain}${cld} ${this._temp}°C`;
    }
}

export class WeatherRenderer {
    constructor() {
        this._isDay    = true;
        this._isSunny  = false;
        this._isCloudy = false;
        this._clouds   = [];
        this._tick     = 0;
    }

    setup(isDay, isSunny, isCloudy, cw, ch) {
        this._isDay    = isDay;
        this._isSunny  = isSunny;
        this._isCloudy = isCloudy;
        this._clouds   = [];
        // Nombre de nuages selon la météo
        const count = isCloudy ? 6 : 2;
        for (let i = 0; i < count; i++) {
            this._clouds.push({
                x:     Math.random() * cw,
                y:     ch * (0.04 + Math.random() * 0.16),
                scale: 0.5 + Math.random() * 0.9,
                speed: 0.15 + Math.random() * 0.25,
                alpha: isCloudy ? (0.70 + Math.random() * 0.30) : (0.18 + Math.random() * 0.14),
                cw, ch,
            });
        }
    }

    update(cw, ch) {
        this._tick++;
        for (const c of this._clouds) {
            c.x -= c.speed;
            if (c.x + c.scale * 160 < 0) {
                c.x = cw + 20;
                c.y = ch * (0.04 + Math.random() * 0.16);
            }
        }
    }

    draw(ctx, cw, ch) {
        if (this._isDay)  this._drawSun(ctx, cw, ch);
        if (!this._isDay) this._drawMoon(ctx, cw, ch);
        for (const c of this._clouds) this._drawCloud(ctx, c.x, c.y, c.scale, c.alpha);
    }

    _drawSun(ctx, cw, ch) {
        const x = cw * 0.82, y = ch * 0.10;
        const r = Math.min(cw, ch) * 0.052;
        const t = this._tick * 0.012;

        // Halo
        const grd = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.2);
        grd.addColorStop(0, 'rgba(255,230,80,0.40)');
        grd.addColorStop(1, 'rgba(255,200,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Rayons
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t);
        ctx.strokeStyle = 'rgba(255,215,60,0.55)';
        ctx.lineWidth = Math.max(2, r * 0.13);
        ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
            ctx.lineTo(Math.cos(a) * r * 2.0, Math.sin(a) * r * 2.0);
            ctx.stroke();
        }
        ctx.restore();

        // Disque solaire
        ctx.fillStyle = '#FFE040';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // Reflet
        ctx.fillStyle = 'rgba(255,255,200,0.55)';
        ctx.beginPath();
        ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawMoon(ctx, cw, ch) {
        const x = cw * 0.14, y = ch * 0.10;
        const r = Math.min(cw, ch) * 0.042;

        // Étoiles
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        const stars = [[0.55,0.06],[0.72,0.04],[0.38,0.13],[0.85,0.11],[0.62,0.15],[0.25,0.07]];
        for (const [sx, sy] of stars) {
            const sr = 1.2 + Math.sin(this._tick * 0.04 + sx * 12) * 0.7;
            ctx.beginPath();
            ctx.arc(cw * sx, ch * sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }

        // Halo lune
        const grd = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.8);
        grd.addColorStop(0, 'rgba(200,220,255,0.28)');
        grd.addColorStop(1, 'rgba(100,140,255,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.8, 0, Math.PI * 2);
        ctx.fill();

        // Croissant de lune
        ctx.fillStyle = '#DDE8F8';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // Masque pour créer le croissant
        ctx.fillStyle = '#0d1b3e';
        ctx.beginPath();
        ctx.arc(x + r * 0.42, y - r * 0.08, r * 0.80, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawCloud(ctx, x, y, scale, alpha) {
        const w = 130 * scale;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        const parts = [
            [0.50, 0.68, 0.30],
            [0.24, 0.74, 0.21],
            [0.76, 0.74, 0.20],
            [0.38, 0.42, 0.23],
            [0.65, 0.40, 0.19],
        ];
        for (const [cx, cy, cr] of parts) {
            ctx.beginPath();
            ctx.arc(x + w * cx, y + w * cy * 0.55, w * cr, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
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
        this.scale = 0.38;
        this.frameWidth = 271.5;
        this.frameHeight = 724;
        this.width = this.frameWidth * this.scale;
        this.height = this.frameHeight * this.scale;
        this.yOffset = this.height * 0.65; // Larger offset to compensate for the tall sprite frame

        this.x = Warthog.calcX(cw);
        this.baseY = ch * CONFIG.GROUND_RATIO - this.height + this.yOffset;
        this.y = this.baseY;

        this.boost = 0;
        this.vy = 0;
        this.isJumping = false;
        this.isRolling = false;
        this._rollTimer = 0;
        this._rollDuration = 42;
        this.frameTimer = 0;
        this.frame = 0;
        this.maxFrames = 6;
    }

    static calcX(cw) {
        if (cw < 600) return cw * 0.20;                    // Mobile: 20% depuis la gauche, 80% visible à droite
        if (cw < 900) return cw * 0.38;                    // Tablette
        return cw - Math.max(250, cw * 0.38);              // Desktop
    }

    resize(cw, ch) {
        this.x = Warthog.calcX(cw);
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

    roll() {
        if (!this.isJumping && !this.isRolling) {
            this.isRolling = true;
            this._rollTimer = 0;
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

        if (this.isRolling) {
            this._rollTimer++;
            if (this._rollTimer >= this._rollDuration) {
                this.isRolling = false;
                this._rollTimer = 0;
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

        if (this.isRolling) {
            const progress = this._rollTimer / this._rollDuration;
            const angle = progress * Math.PI * 2.5;
            const cx = this.x + this.width * 0.5;
            const cy = this.y + this.height * 0.5;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            if (sheet) {
                ctx.drawImage(sheet, this.frame * this.frameWidth, 0, this.frameWidth, this.frameHeight,
                    -this.width * 0.5, -this.height * 0.5, this.width, this.height);
            } else {
                ctx.fillStyle = '#ff8800';
                ctx.fillRect(-this.width * 0.5, -this.height * 0.5, this.width, this.height);
            }
            ctx.restore();
            return;
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
        if (this._obstacles.length > 0 && this._obstacles[this._obstacles.length - 1].x > cw) return;
        const type = this._types[Math.floor(Math.random() * this._types.length)];
        const groundY = ch * CONFIG.GROUND_RATIO;
        const h = ch * (0.09 + Math.random() * 0.05);
        const w = h * (0.50 + Math.random() * 0.28);
        // Décalage vers le bas pour que l'obstacle touche visuellement le sol
        const sinkY = ch * 0.04;
        const spawnX = cw + Math.max(80, cw * 0.4);
        this._obstacles.push({ type, x: spawnX, y: groundY - h + sinkY, w, h });
    }

    checkCollision(warthog) {
        const wx1 = warthog.x + warthog.width * 0.28;
        const wx2 = warthog.x + warthog.width * 0.72;
        const wy1 = warthog.y;
        const wy2 = warthog.y + warthog.height * 0.28;
        for (const obs of this._obstacles) {
            // En saut : seule la moitié avant (droite) de l'obstacle peut toucher.
            // Une fois le centre de l'obstacle dépassé, le saut est réussi.
            const obsRightEdge = warthog.isJumping ? obs.x + obs.w * 0.5 : obs.x + obs.w * 0.85;
            if (wx1 < obsRightEdge && wx2 > obs.x + obs.w * 0.15 &&
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

export class DustSystem {
    constructor() { this._particles = []; }

    reset() { this._particles = []; }

    emit(wx, wy, ww, wh, scrollSpeed) {
        if (!this._particles.length < 200 && Math.random() > 0.8) return;
        const rate = Math.min(0.75, 0.25 + scrollSpeed * 0.06);
        if (Math.random() > rate) return;
        const count = 1 + Math.floor(scrollSpeed * 0.15);
        for (let i = 0; i < count; i++) {
            this._particles.push({
                x:    wx + ww * (0.05 + Math.random() * 0.30),
                y:    wy + wh * 0.33 + Math.random() * 5,
                vx:   -(0.4 + Math.random() * 2.8),
                vy:   -(0.1 + Math.random() * 1.0),
                life: 1.0,
                r:    2.5 + Math.random() * 5.5,
            });
        }
    }

    update() {
        for (let i = this._particles.length - 1; i >= 0; i--) {
            const p = this._particles[i];
            p.x   += p.vx;
            p.y   += p.vy;
            p.vy  += 0.055;
            p.vx  *= 0.95;
            p.r   += 0.25;
            p.life -= 0.032;
            if (p.life <= 0) this._particles.splice(i, 1);
        }
    }

    draw(ctx) {
        for (const p of this._particles) {
            ctx.save();
            ctx.globalAlpha = p.life * 0.50;
            ctx.fillStyle = '#c4a45e';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}

export class RainSystem {
    constructor() {
        this.active = false;
        this.drops  = [];
        this.canvas = document.getElementById('rain-canvas');
        if (this.canvas) this.ctx = this.canvas.getContext('2d');
    }

    _newDrop(w, h, randomY) {
        const vy = 11 + Math.random() * 13;
        return {
            x:       Math.random() * (w + 100) - 50,
            y:       randomY ? Math.random() * h : -25,
            vy,
            vx:      -1.5 - Math.random() * 1.2,
            l:       16 + Math.random() * 20,
            lw:      0.8 + Math.random() * 1.3,
            alpha:   0.55 + Math.random() * 0.40,
            splash:  0,
            splashX: 0,
        };
    }

    activate(w, h) {
        this.active = true;
        this.drops  = [];
        if (this.canvas) {
            this.canvas.classList.add('rain-active');
            this.resize(w, h);
            for (let i = 0; i < 300; i++) {
                this.drops.push(this._newDrop(w, h, true));
            }
        }
    }

    resize(w, h) {
        if (this.canvas) {
            this.canvas.width  = w;
            this.canvas.height = h;
        }
    }

    update() {
        if (!this.active || !this.canvas) return;
        const w = this.canvas.width, h = this.canvas.height;
        const groundY = h * CONFIG.GROUND_RATIO;
        for (let i = 0; i < this.drops.length; i++) {
            const d = this.drops[i];
            if (d.splash > 0) {
                d.splash -= 0.10;
                if (d.splash <= 0) this.drops[i] = this._newDrop(w, h, false);
                continue;
            }
            d.y += d.vy;
            d.x += d.vx;
            if (d.y >= groundY) {
                d.splash  = 1.0;
                d.splashX = d.x;
            }
            if (d.x < -60) d.x = w + 40;
        }
    }

    draw() {
        if (!this.active || !this.ctx) return;
        const w = this.canvas.width, h = this.canvas.height;
        const groundY = h * CONFIG.GROUND_RATIO;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.lineCap = 'round';

        for (const d of this.drops) {
            if (d.splash > 0) {
                // Arc de rebond au sol
                this.ctx.strokeStyle = `rgba(160,210,240,${d.splash * 0.60})`;
                this.ctx.lineWidth   = 0.9;
                this.ctx.beginPath();
                this.ctx.ellipse(d.splashX, groundY, d.splash * 8, d.splash * 3, 0, Math.PI, 0, false);
                this.ctx.stroke();
            } else {
                // Goutte diagonale
                const ex = d.x + (d.vx / d.vy) * d.l;
                const ey = d.y + d.l;
                this.ctx.strokeStyle = `rgba(160,210,240,${d.alpha})`;
                this.ctx.lineWidth   = d.lw;
                this.ctx.beginPath();
                this.ctx.moveTo(d.x, d.y);
                this.ctx.lineTo(ex, ey);
                this.ctx.stroke();
            }
        }
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
