(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const overlay = document.getElementById("overlay");
  const howto = document.getElementById("howto");
  const gameover = document.getElementById("gameover");
  const hud = document.getElementById("hud");
  const touchUI = document.getElementById("touch-ui");
  const helpBtn = document.getElementById("btn-howto");

  const elScore = document.getElementById("score");
  const elCombo = document.getElementById("combo");
  const elBest = document.getElementById("best");
  const elOverclock = document.getElementById("overclock");
  const elFormBadge = document.getElementById("form-badge");
  const elFinalScore = document.getElementById("final-score");
  const elFinalCombo = document.getElementById("final-combo");
  const elFinalDist = document.getElementById("final-dist");

  const FORMS = {
    spike: { id: "spike", name: "△ SPIKE", color: "#00f0ff", accent: "#7cffff" },
    glide: { id: "glide", name: "◇ GLIDE", color: "#ff2bd6", accent: "#ff9ae8" },
    pulse: { id: "pulse", name: "⬡ PULSE", color: "#ffe566", accent: "#fff1a8" },
  };
  const FORM_ORDER = ["spike", "glide", "pulse"];

  const LANES = [-1, 0, 1];
  const BEST_KEY = "neon-morph-best";

  const state = {
    mode: "menu", // menu | playing | over
    w: 0,
    h: 0,
    dpr: 1,
    t: 0,
    dt: 0,
    last: 0,
    speed: 12,
    baseSpeed: 12,
    distance: 0,
    score: 0,
    combo: 1,
    maxCombo: 1,
    comboTimer: 0,
    overclock: 0,
    overclockActive: false,
    overclockTimer: 0,
    form: "spike",
    lane: 0,
    targetLane: 0,
    laneX: 0,
    y: 0,
    vy: 0,
    grounded: true,
    sliding: false,
    slideTimer: 0,
    pulseTimer: 0,
    invuln: 0,
    shake: 0,
    spawnTimer: 0,
    patternIndex: 0,
    entities: [],
    particles: [],
    sparks: [],
    speedLines: [],
    gridOffset: 0,
    trail: [],
    nearMissCooldown: 0,
    morphFlash: 0,
    started: false,
  };

  let audioCtx = null;

  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = window.innerWidth;
    state.h = window.innerHeight;
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    canvas.style.width = state.w + "px";
    canvas.style.height = state.h + "px";
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function beep(freq, dur, type, gain) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain || 0.04, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function loadBest() {
    const v = Number(localStorage.getItem(BEST_KEY) || 0);
    elBest.textContent = String(v);
    return v;
  }

  function saveBest(score) {
    const prev = loadBest();
    if (score > prev) {
      localStorage.setItem(BEST_KEY, String(score));
      elBest.textContent = String(score);
    }
  }

  function laneToX(lane) {
    const roadW = Math.min(state.w * 0.72, 520);
    return state.w / 2 + lane * (roadW / 3.15);
  }

  function perspectiveY(z) {
    const horizon = state.h * 0.28;
    const ground = state.h * 0.92;
    const t = 1 / (1 + z * 0.018);
    return horizon + (ground - horizon) * t;
  }

  function perspectiveScale(z) {
    return Math.max(0.08, 1 / (1 + z * 0.018));
  }

  function setForm(form) {
    if (!FORMS[form] || state.form === form) return;
    state.form = form;
    state.morphFlash = 0.35;
    updateFormUI();
    beep(form === "spike" ? 520 : form === "glide" ? 340 : 680, 0.08, "sawtooth", 0.035);
    spawnBurst(laneToX(state.laneX), playerScreenY(), FORMS[form].color, 14);
  }

  function cycleForm(dir) {
    const i = FORM_ORDER.indexOf(state.form);
    const next = FORM_ORDER[(i + dir + FORM_ORDER.length) % FORM_ORDER.length];
    setForm(next);
  }

  function updateFormUI() {
    const f = FORMS[state.form];
    elFormBadge.textContent = f.name;
    elFormBadge.className = "form-badge " + (state.form === "spike" ? "" : state.form);
    document.querySelectorAll(".morph-card").forEach((el) => {
      el.classList.toggle("active", el.dataset.form === state.form);
    });
  }

  function playerScreenY() {
    const base = state.h * 0.72;
    return base + state.y;
  }

  function resetRun() {
    state.mode = "playing";
    state.speed = 12;
    state.baseSpeed = 12;
    state.distance = 0;
    state.score = 0;
    state.combo = 1;
    state.maxCombo = 1;
    state.comboTimer = 0;
    state.overclock = 0;
    state.overclockActive = false;
    state.overclockTimer = 0;
    state.form = "spike";
    state.lane = 0;
    state.targetLane = 0;
    state.laneX = 0;
    state.y = 0;
    state.vy = 0;
    state.grounded = true;
    state.sliding = false;
    state.slideTimer = 0;
    state.pulseTimer = 0;
    state.invuln = 0.8;
    state.shake = 0;
    state.spawnTimer = 0.6;
    state.patternIndex = 0;
    state.entities = [];
    state.particles = [];
    state.sparks = [];
    state.trail = [];
    state.nearMissCooldown = 0;
    state.morphFlash = 0;
    updateFormUI();
    elScore.textContent = "0";
    elCombo.textContent = "×1";
    elOverclock.style.width = "0%";
    seedSpeedLines();
  }

  function seedSpeedLines() {
    state.speedLines = [];
    for (let i = 0; i < 48; i++) {
      state.speedLines.push({
        x: Math.random() * state.w,
        y: Math.random() * state.h,
        len: 40 + Math.random() * 120,
        speed: 0.6 + Math.random() * 1.8,
        alpha: 0.15 + Math.random() * 0.45,
        hue: Math.random() < 0.5 ? 180 : 310,
      });
    }
  }

  function spawnBurst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 220;
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.4,
        max: 0.75,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  function spawnScorePopup(x, y, text, color) {
    state.sparks.push({ x, y, text, color, life: 0.8, vy: -40 });
  }

  // Obstacle types: low (smash with spike jump or match), high (glide under), block (pulse or match), gate
  function spawnEntity(kind, lane, formMatch, z) {
    state.entities.push({
      kind,
      lane,
      formMatch: formMatch || null,
      z: z == null ? 110 + Math.random() * 20 : z,
      hit: false,
      collected: false,
      wiggle: Math.random() * Math.PI * 2,
    });
  }

  const PATTERNS = [
    () => {
      spawnEntity("low", LANES[(Math.random() * 3) | 0], "spike");
    },
    () => {
      spawnEntity("high", LANES[(Math.random() * 3) | 0], "glide");
    },
    () => {
      spawnEntity("block", LANES[(Math.random() * 3) | 0], "pulse");
    },
    () => {
      const l = LANES[(Math.random() * 3) | 0];
      spawnEntity("low", l, "spike");
      spawnEntity("orb", LANES.filter((x) => x !== l)[(Math.random() * 2) | 0], null, 125);
    },
    () => {
      // wall with one gap
      const gap = LANES[(Math.random() * 3) | 0];
      LANES.forEach((l) => {
        if (l !== gap) spawnEntity("block", l, FORM_ORDER[(Math.random() * 3) | 0]);
      });
    },
    () => {
      // matching wave
      const f = FORM_ORDER[(Math.random() * 3) | 0];
      const kind = f === "spike" ? "low" : f === "glide" ? "high" : "block";
      LANES.forEach((l, i) => spawnEntity(kind, l, f, 110 + i * 8));
    },
    () => {
      spawnEntity("high", -1, "glide");
      spawnEntity("low", 1, "spike", 118);
      spawnEntity("orb", 0, null, 130);
    },
    () => {
      spawnEntity("rail", 0, null);
      spawnEntity("orb", -1, null, 120);
      spawnEntity("orb", 1, null, 128);
    },
    () => {
      const l = LANES[(Math.random() * 3) | 0];
      spawnEntity("spinner", l, FORM_ORDER[(Math.random() * 3) | 0]);
    },
  ];

  function maybeSpawn(dt) {
    state.spawnTimer -= dt;
    if (state.spawnTimer > 0) return;
    const density = Math.max(0.55, 1.35 - state.distance / 2500);
    state.spawnTimer = density * (0.85 + Math.random() * 0.55);
    if (state.overclockActive) state.spawnTimer *= 0.85;

    const fn = PATTERNS[state.patternIndex % PATTERNS.length];
    state.patternIndex++;
    // mix random
    if (Math.random() < 0.45) PATTERNS[(Math.random() * PATTERNS.length) | 0]();
    else fn();

    // occasional triple orbs
    if (Math.random() < 0.12) {
      spawnEntity("orb", LANES[(Math.random() * 3) | 0], null, 140 + Math.random() * 30);
    }
  }

  function addCombo(n) {
    state.combo = Math.min(32, Math.round((state.combo + n) * 2) / 2);
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.comboTimer = 2.4;
    elCombo.textContent = "×" + state.combo;
  }

  function resetCombo() {
    state.combo = 1;
    state.comboTimer = 0;
    elCombo.textContent = "×1";
  }

  function addScore(base) {
    const gain = Math.floor(base * state.combo * (state.overclockActive ? 3 : 1));
    state.score += gain;
    elScore.textContent = String(state.score);
    return gain;
  }

  function fillOverclock(amount) {
    if (state.overclockActive) return;
    state.overclock = Math.min(100, state.overclock + amount);
    elOverclock.style.width = state.overclock + "%";
  }

  function activateOverclock() {
    if (state.mode !== "playing") return;
    if (state.overclock < 100 || state.overclockActive) return;
    state.overclockActive = true;
    state.overclockTimer = 5.5;
    state.overclock = 0;
    elOverclock.style.width = "0%";
    state.invuln = Math.max(state.invuln, 0.4);
    beep(220, 0.15, "sawtooth", 0.05);
    beep(440, 0.2, "square", 0.04);
    spawnBurst(laneToX(state.laneX), playerScreenY(), "#7cff6b", 28);
  }

  function jump() {
    if (state.mode !== "playing") return;
    if (!state.grounded || state.sliding) return;
    state.vy = -920;
    state.grounded = false;
    beep(480, 0.06, "triangle", 0.03);
  }

  function slide() {
    if (state.mode !== "playing") return;
    if (!state.grounded) return;
    state.sliding = true;
    state.slideTimer = 0.55;
    if (state.form !== "glide") setForm("glide");
    beep(180, 0.07, "triangle", 0.03);
  }

  function switchLane(dir) {
    if (state.mode !== "playing") return;
    state.targetLane = Math.max(-1, Math.min(1, state.targetLane + dir));
    beep(300 + Math.abs(state.targetLane) * 40, 0.04, "square", 0.02);
  }

  function startPulse() {
    if (state.mode !== "playing") return;
    setForm("pulse");
    state.pulseTimer = 0.85;
    state.invuln = Math.max(state.invuln, 0.85);
    fillOverclock(4);
    beep(700, 0.1, "sawtooth", 0.04);
  }

  function kill() {
    if (state.invuln > 0 || state.overclockActive) {
      state.shake = 0.2;
      spawnBurst(laneToX(state.laneX), playerScreenY(), "#ffffff", 10);
      return;
    }
    state.mode = "over";
    state.shake = 0.55;
    spawnBurst(laneToX(state.laneX), playerScreenY(), "#ff3366", 40);
    beep(90, 0.35, "sawtooth", 0.07);
    beep(60, 0.45, "square", 0.05);
    saveBest(state.score);
    elFinalScore.textContent = String(state.score);
    elFinalCombo.textContent = "×" + state.maxCombo;
    elFinalDist.textContent = Math.floor(state.distance) + "m";
    hud.classList.add("hidden");
    touchUI.classList.add("hidden");
    gameover.classList.remove("hidden");
    helpBtn.classList.remove("hidden");
  }

  function entityColor(e) {
    if (e.kind === "orb") return "#7cff6b";
    if (e.kind === "rail") return "#8aa0b8";
    if (e.formMatch && FORMS[e.formMatch]) return FORMS[e.formMatch].color;
    return "#ff3366";
  }

  function canPass(e) {
    if (e.kind === "orb" || e.kind === "rail") return true;
    if (state.pulseTimer > 0 && state.form === "pulse") return true;
    if (e.formMatch && state.form === e.formMatch) return true;

    if (e.kind === "low") {
      // jump over OR smash with spike while airborne-ish / matching
      if (state.y < -40) return true;
      if (state.form === "spike" && state.y < -10) return true;
    }
    if (e.kind === "high") {
      if (state.sliding || (state.form === "glide" && state.grounded)) return true;
    }
    if (e.kind === "block" || e.kind === "spinner") {
      if (state.form === "pulse" && state.pulseTimer > 0) return true;
    }
    return false;
  }

  function smashReward(e) {
    const matched = e.formMatch && e.formMatch === state.form;
    const gain = addScore(matched ? 120 : 60);
    addCombo(matched ? 1 : 0.5);
    if (matched) fillOverclock(8);
    else fillOverclock(3);
    const c = entityColor(e);
    spawnBurst(laneToX(e.lane), perspectiveY(e.z), c, matched ? 22 : 12);
    spawnScorePopup(laneToX(e.lane), perspectiveY(e.z) - 20, "+" + gain, c);
    beep(matched ? 660 : 420, 0.07, "square", 0.035);
  }

  function update(dt) {
    state.t += dt;
    if (state.mode !== "playing") {
      updateDecor(dt * 0.35);
      return;
    }

    const slow = state.overclockActive ? 0.55 : 1;
    const simDt = dt; // gameplay time stays responsive; visuals use slow overlay
    const moveScale = state.overclockActive ? 1.15 : 1;

    state.baseSpeed = 12 + Math.min(18, state.distance / 180);
    state.speed = state.baseSpeed * moveScale;

    state.distance += state.speed * simDt * 8;
    state._scoreAcc = (state._scoreAcc || 0) + simDt * state.speed * 1.2 * state.combo;
    if (state._scoreAcc >= 1) {
      const chunk = Math.floor(state._scoreAcc);
      state._scoreAcc -= chunk;
      addScore(chunk);
    }

    // lane lerp
    state.laneX += (state.targetLane - state.laneX) * Math.min(1, 14 * simDt);
    state.lane = Math.round(state.laneX);

    // jump physics
    if (!state.grounded) {
      state.vy += 2600 * simDt;
      state.y += state.vy * simDt;
      if (state.y >= 0) {
        state.y = 0;
        state.vy = 0;
        state.grounded = true;
      }
    }

    if (state.sliding) {
      state.slideTimer -= simDt;
      if (state.slideTimer <= 0) state.sliding = false;
    }

    if (state.pulseTimer > 0) state.pulseTimer -= simDt;
    if (state.invuln > 0) state.invuln -= simDt;
    if (state.morphFlash > 0) state.morphFlash -= simDt;
    if (state.shake > 0) state.shake -= simDt;
    if (state.nearMissCooldown > 0) state.nearMissCooldown -= simDt;

    if (state.comboTimer > 0) {
      state.comboTimer -= simDt;
      if (state.comboTimer <= 0) resetCombo();
    }

    if (state.overclockActive) {
      state.overclockTimer -= simDt;
      // visual meter drain
      elOverclock.style.width = Math.max(0, (state.overclockTimer / 5.5) * 100) + "%";
      if (state.overclockTimer <= 0) {
        state.overclockActive = false;
        elOverclock.style.width = "0%";
        beep(160, 0.12, "triangle", 0.04);
      }
    }

    maybeSpawn(simDt);
    updateEntities(simDt);
    updateDecor(simDt);
    updateParticles(simDt);

    // trail
    state.trail.unshift({
      x: laneToX(state.laneX),
      y: playerScreenY() + (state.sliding ? 18 : 0),
      form: state.form,
      life: 0.35,
    });
    if (state.trail.length > 18) state.trail.pop();
    state.trail.forEach((p) => (p.life -= simDt));
    state.trail = state.trail.filter((p) => p.life > 0);
  }

  function updateEntities(dt) {
    const playerZ = 8;
    const hitZ = 14;
    const px = state.laneX;

    for (const e of state.entities) {
      e.z -= state.speed * dt * (state.overclockActive ? 0.9 : 1) * 9.5;
      e.wiggle += dt * 6;

      if (e.collected || e.hit) continue;

      // collect orbs
      if (e.kind === "orb" && e.z < hitZ && e.z > 0 && Math.abs(e.lane - px) < 0.55) {
        e.collected = true;
        const g = addScore(40);
        fillOverclock(12);
        addCombo(0.25);
        spawnBurst(laneToX(e.lane), perspectiveY(e.z), "#7cff6b", 12);
        spawnScorePopup(laneToX(e.lane), perspectiveY(e.z), "+" + g, "#7cff6b");
        beep(880, 0.05, "sine", 0.03);
        continue;
      }

      // collision window
      if (e.z < hitZ && e.z > 2 && Math.abs(e.lane - px) < 0.45) {
        if (e.kind === "rail") {
          // speed pad
          if (!e.hit) {
            e.hit = true;
            state.speed += 2;
            fillOverclock(5);
            addScore(25);
            beep(500, 0.05, "triangle", 0.025);
          }
          continue;
        }

        if (canPass(e)) {
          e.hit = true;
          if (e.kind !== "orb") smashReward(e);
        } else {
          kill();
          e.hit = true;
        }
      } else if (
        e.z < hitZ + 10 &&
        e.z > hitZ &&
        Math.abs(e.lane - px) > 0.55 &&
        Math.abs(e.lane - px) < 1.15 &&
        state.nearMissCooldown <= 0 &&
        e.kind !== "orb"
      ) {
        // near miss
        state.nearMissCooldown = 0.35;
        addCombo(0.5);
        const g = addScore(30);
        fillOverclock(4);
        spawnScorePopup(laneToX(px), playerScreenY() - 50, "NEAR +" + g, "#ffe566");
        beep(920, 0.04, "sine", 0.025);
      }
    }

    state.entities = state.entities.filter((e) => e.z > -20 && !((e.hit || e.collected) && e.z < 0));
  }

  function updateDecor(dt) {
    state.gridOffset = (state.gridOffset + state.speed * dt * 40) % 80;
    for (const s of state.speedLines) {
      s.y += (200 + state.speed * 35) * s.speed * dt;
      if (s.y - s.len > state.h) {
        s.y = -Math.random() * 80;
        s.x = Math.random() * state.w;
        s.len = 40 + Math.random() * 140;
      }
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);

    for (const s of state.sparks) {
      s.life -= dt;
      s.y += s.vy * dt;
    }
    state.sparks = state.sparks.filter((s) => s.life > 0);
  }

  function draw() {
    const w = state.w;
    const h = state.h;
    let ox = 0;
    let oy = 0;
    if (state.shake > 0) {
      ox = (Math.random() - 0.5) * 16 * state.shake;
      oy = (Math.random() - 0.5) * 16 * state.shake;
    }

    ctx.save();
    ctx.translate(ox, oy);

    // background
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#120628");
    g.addColorStop(0.45, "#070214");
    g.addColorStop(1, "#010008");
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    // nebula blobs
    drawNebula();
    drawSpeedLines();
    drawPerspectiveGrid();
    drawRoad();
    drawEntities();
    drawTrail();
    drawPlayer();
    drawParticles();
    drawVignette();

    if (state.overclockActive) {
      ctx.fillStyle = "rgba(124, 255, 107, 0.06)";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(124, 255, 107, 0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, w - 20, h - 20);
    }

    ctx.restore();
  }

  function drawNebula() {
    const w = state.w;
    const h = state.h;
    const t = state.t;
    const blobs = [
      [w * 0.2, h * 0.15, 180, "rgba(0, 200, 255, 0.08)"],
      [w * 0.8, h * 0.2, 220, "rgba(255, 0, 180, 0.07)"],
      [w * 0.5, h * 0.05, 260, "rgba(120, 40, 255, 0.1)"],
    ];
    for (const [x, y, r, c] of blobs) {
      const grd = ctx.createRadialGradient(x + Math.sin(t) * 20, y, 10, x, y, r);
      grd.addColorStop(0, c);
      grd.addColorStop(1, "transparent");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h * 0.55);
    }
  }

  function drawSpeedLines() {
    for (const s of state.speedLines) {
      const grd = ctx.createLinearGradient(s.x, s.y - s.len, s.x, s.y);
      grd.addColorStop(0, "transparent");
      grd.addColorStop(1, `hsla(${s.hue}, 100%, 65%, ${s.alpha})`);
      ctx.strokeStyle = grd;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - s.len);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }

    // side rush lines
    const rush = 10 + (state.speed | 0);
    for (let i = 0; i < rush; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = state.w / 2 + side * (state.w * 0.18 + (i * 17) % (state.w * 0.35));
      const y = ((state.t * 700 * state.speed * 0.08 + i * 90) % (state.h + 100)) - 50;
      ctx.strokeStyle = side > 0 ? "rgba(0,240,255,0.18)" : "rgba(255,43,214,0.16)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * 8, y + 50 + state.speed);
      ctx.stroke();
    }
  }

  function drawPerspectiveGrid() {
    const horizon = state.h * 0.28;
    const ground = state.h * 0.95;
    const cx = state.w / 2;

    // skyline silhouette
    ctx.fillStyle = "#0a0418";
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= state.w; x += 28) {
      const bh = 20 + ((Math.sin(x * 0.05 + 2) + 1) * 35) + (x * 17) % 50;
      ctx.lineTo(x, horizon - bh * 0.35);
    }
    ctx.lineTo(state.w, horizon);
    ctx.closePath();
    ctx.fill();

    // neon windows
    for (let x = 20; x < state.w; x += 36) {
      const bh = 18 + (x * 13) % 40;
      ctx.fillStyle = Math.random() > 0.7 ? "rgba(0,240,255,0.35)" : "rgba(255,43,214,0.25)";
      // stable pseudo random
      const on = ((x * 41) % 7) > 3;
      if (on) ctx.fillRect(x, horizon - bh * 0.35 + 8, 3, 3);
    }

    // vanishing point glow
    const vg = ctx.createRadialGradient(cx, horizon, 4, cx, horizon, 160);
    vg.addColorStop(0, "rgba(0,240,255,0.35)");
    vg.addColorStop(0.4, "rgba(255,43,214,0.12)");
    vg.addColorStop(1, "transparent");
    ctx.fillStyle = vg;
    ctx.fillRect(cx - 160, horizon - 80, 320, 160);

    // horizontal grid lines
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const z = i * 8 + (state.gridOffset / 80) * 8;
      const y = perspectiveY(z);
      if (y < horizon || y > ground) continue;
      const scale = perspectiveScale(z);
      const half = Math.min(state.w * 0.48, 360) * scale + 40;
      const alpha = 0.08 + scale * 0.35;
      ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(cx - half, y);
      ctx.lineTo(cx + half, y);
      ctx.stroke();
    }

    // vertical lane guides converging
    for (const lane of [-1.5, -0.5, 0.5, 1.5]) {
      ctx.beginPath();
      for (let z = 0; z <= 130; z += 4) {
        const y = perspectiveY(z);
        const scale = perspectiveScale(z);
        const roadW = Math.min(state.w * 0.72, 520) * scale;
        const x = cx + lane * (roadW / 3);
        if (z === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(255, 43, 214, 0.22)";
      ctx.stroke();
    }
  }

  function drawRoad() {
    const cx = state.w / 2;
    const horizon = state.h * 0.28;
    const ground = state.h * 0.95;
    const nearHalf = Math.min(state.w * 0.48, 380);
    const farHalf = 28;

    const road = ctx.createLinearGradient(0, horizon, 0, ground);
    road.addColorStop(0, "rgba(20, 8, 40, 0.3)");
    road.addColorStop(1, "rgba(10, 4, 24, 0.85)");
    ctx.fillStyle = road;
    ctx.beginPath();
    ctx.moveTo(cx - farHalf, horizon);
    ctx.lineTo(cx + farHalf, horizon);
    ctx.lineTo(cx + nearHalf, ground);
    ctx.lineTo(cx - nearHalf, ground);
    ctx.closePath();
    ctx.fill();

    // edge neon
    ctx.strokeStyle = "rgba(0,240,255,0.55)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(cx - farHalf, horizon);
    ctx.lineTo(cx - nearHalf, ground);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,43,214,0.55)";
    ctx.shadowColor = "#ff2bd6";
    ctx.beginPath();
    ctx.moveTo(cx + farHalf, horizon);
    ctx.lineTo(cx + nearHalf, ground);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // center dashes
    for (let i = 0; i < 20; i++) {
      const z1 = (i * 8 + state.gridOffset * 0.2) % 140;
      const z2 = z1 + 3;
      const y1 = perspectiveY(z1);
      const y2 = perspectiveY(z2);
      const s1 = perspectiveScale(z1);
      ctx.strokeStyle = `rgba(255,255,255,${0.1 + s1 * 0.35})`;
      ctx.lineWidth = 2 * s1;
      ctx.beginPath();
      ctx.moveTo(cx, y1);
      ctx.lineTo(cx, y2);
      ctx.stroke();
    }
  }

  function drawEntities() {
    const sorted = [...state.entities].sort((a, b) => b.z - a.z);
    for (const e of sorted) {
      if (e.collected) continue;
      const scale = perspectiveScale(e.z);
      const x = laneToX(e.lane) ; // lane is fixed in world; use perspective blend
      // better: interpolate lane x by scale toward center
      const cx = state.w / 2;
      const roadW = Math.min(state.w * 0.72, 520) * scale;
      const ex = cx + e.lane * (roadW / 3.15);
      const ey = perspectiveY(e.z);
      const color = entityColor(e);
      const alpha = e.hit ? 0.25 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(ex, ey);
      ctx.scale(scale, scale);

      if (e.kind === "orb") drawOrb(color);
      else if (e.kind === "low") drawLowBarrier(color);
      else if (e.kind === "high") drawHighGate(color);
      else if (e.kind === "block") drawBlock(color);
      else if (e.kind === "rail") drawRail();
      else if (e.kind === "spinner") drawSpinner(color, e.wiggle);

      ctx.restore();
    }
  }

  function glowShape(color, drawFn) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    drawFn();
    ctx.shadowBlur = 0;
    drawFn();
    ctx.restore();
  }

  function drawOrb(color) {
    glowShape(color, () => {
      ctx.beginPath();
      ctx.arc(0, -30, 14, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(-4, -34, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawLowBarrier(color) {
    glowShape(color, () => {
      ctx.fillStyle = color;
      ctx.fillRect(-46, -28, 92, 28);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(-40, -22, 80, 8);
      // spikes
      ctx.beginPath();
      for (let i = -3; i <= 3; i++) {
        ctx.moveTo(i * 12 - 6, -28);
        ctx.lineTo(i * 12, -46);
        ctx.lineTo(i * 12 + 6, -28);
      }
      ctx.fillStyle = color;
      ctx.fill();
    });
    // form hint
    ctx.fillStyle = "#05010f";
    ctx.font = "bold 16px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("△", 0, -8);
  }

  function drawHighGate(color) {
    glowShape(color, () => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-50, -110);
      ctx.lineTo(-50, -40);
      ctx.lineTo(50, -40);
      ctx.lineTo(50, -110);
      ctx.stroke();
      // beam
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(-46, -70, 92, 10);
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = color;
    ctx.font = "bold 16px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("◇", 0, -55);
  }

  function drawBlock(color) {
    glowShape(color, () => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -100);
      ctx.lineTo(42, -70);
      ctx.lineTo(42, -20);
      ctx.lineTo(0, 0);
      ctx.lineTo(-42, -20);
      ctx.lineTo(-42, -70);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(5,1,15,0.45)";
      ctx.beginPath();
      ctx.moveTo(0, -85);
      ctx.lineTo(28, -68);
      ctx.lineTo(28, -35);
      ctx.lineTo(0, -20);
      ctx.lineTo(-28, -35);
      ctx.lineTo(-28, -68);
      ctx.closePath();
      ctx.fill();
    });
    ctx.fillStyle = "#05010f";
    ctx.font = "bold 18px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⬡", 0, -45);
  }

  function drawRail() {
    ctx.strokeStyle = "#7cff6b";
    ctx.shadowColor = "#7cff6b";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-40, -8);
    ctx.lineTo(40, -8);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(124,255,107,0.25)";
    ctx.fillRect(-40, -14, 80, 12);
  }

  function drawSpinner(color, wiggle) {
    ctx.rotate(wiggle);
    glowShape(color, () => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, -45, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-34, -45);
      ctx.lineTo(34, -45);
      ctx.moveTo(0, -79);
      ctx.lineTo(0, -11);
      ctx.stroke();
    });
  }

  function drawTrail() {
    for (let i = state.trail.length - 1; i >= 0; i--) {
      const p = state.trail[i];
      const f = FORMS[p.form];
      ctx.globalAlpha = Math.max(0, p.life * 0.45);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 + i * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const x = laneToX(state.laneX);
    const y = playerScreenY();
    const f = FORMS[state.form];
    const sliding = state.sliding;
    const pulse = state.pulseTimer > 0;

    ctx.save();
    ctx.translate(x, y);

    // ground shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 10, sliding ? 34 : 24, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (state.morphFlash > 0) {
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = state.morphFlash;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, sliding ? 0 : -28, 40 + (0.35 - state.morphFlash) * 80, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (pulse) {
      ctx.strokeStyle = "rgba(255,229,102,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -28, 36 + Math.sin(state.t * 20) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowColor = f.color;
    ctx.shadowBlur = 22;
    ctx.translate(0, sliding ? 6 : -28);
    if (sliding) ctx.scale(1.25, 0.55);

    const bob = Math.sin(state.t * (state.grounded ? 14 : 0)) * (state.grounded ? 2 : 0);
    ctx.translate(0, bob);

    if (state.form === "spike") drawPlayerSpike(f);
    else if (state.form === "glide") drawPlayerGlide(f);
    else drawPlayerPulse(f);

    // eyes / core
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // invuln flicker ring
    if (state.invuln > 0 && Math.floor(state.t * 20) % 2 === 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(x, y - 28, 32, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlayerSpike(f) {
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(22, 22);
    ctx.lineTo(0, 12);
    ctx.lineTo(-22, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = f.accent;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(10, 10);
    ctx.lineTo(0, 6);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawPlayerGlide(f) {
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(26, 0);
    ctx.lineTo(0, 28);
    ctx.lineTo(-26, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = f.accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function drawPlayerPulse(f) {
    ctx.fillStyle = f.color;
    const r = 24;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = f.accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.font = "bold 16px Orbitron, sans-serif";
    for (const s of state.sparks) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawVignette() {
    const grd = ctx.createRadialGradient(
      state.w / 2, state.h / 2, state.h * 0.2,
      state.w / 2, state.h / 2, state.h * 0.85
    );
    grd.addColorStop(0, "transparent");
    grd.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, state.w, state.h);

    // scanlines
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let y = 0; y < state.h; y += 4) {
      ctx.fillRect(0, y, state.w, 1);
    }
  }

  function frame(ts) {
    if (!state.last) state.last = ts;
    state.dt = Math.min(0.033, (ts - state.last) / 1000);
    state.last = ts;
    update(state.dt);
    draw();
    requestAnimationFrame(frame);
  }

  function showMenu() {
    state.mode = "menu";
    overlay.classList.remove("hidden");
    gameover.classList.add("hidden");
    howto.classList.add("hidden");
    hud.classList.add("hidden");
    touchUI.classList.add("hidden");
    helpBtn.classList.remove("hidden");
  }

  function startGame() {
    ensureAudio();
    overlay.classList.add("hidden");
    gameover.classList.add("hidden");
    howto.classList.add("hidden");
    hud.classList.remove("hidden");
    helpBtn.classList.add("hidden");
    if (window.matchMedia("(pointer: coarse)").matches) {
      touchUI.classList.remove("hidden");
    }
    resetRun();
    beep(440, 0.08, "square", 0.04);
    beep(660, 0.1, "square", 0.03);
  }

  // input
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    if (keys.has(e.code)) return;
    keys.add(e.code);

    if (state.mode === "menu" && (e.code === "Space" || e.code === "Enter")) {
      startGame();
      return;
    }
    if (state.mode === "over" && (e.code === "Space" || e.code === "Enter")) {
      startGame();
      return;
    }
    if (state.mode !== "playing") return;

    if (e.code === "ArrowLeft" || e.code === "KeyA") switchLane(-1);
    if (e.code === "ArrowRight" || e.code === "KeyD") switchLane(1);
    if (e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Space") {
      if (state.form !== "spike") setForm("spike");
      jump();
    }
    if (e.code === "ArrowDown" || e.code === "KeyS") slide();
    if (e.code === "KeyQ") cycleForm(-1);
    if (e.code === "KeyE") cycleForm(1);
    if (e.code === "Digit1") setForm("spike");
    if (e.code === "Digit2") setForm("glide");
    if (e.code === "Digit3") { setForm("pulse"); startPulse(); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") activateOverclock();
    if (e.code === "KeyF") startPulse();
  });

  window.addEventListener("keyup", (e) => keys.delete(e.code));

  // touch swipe
  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    if (e.changedTouches[0]) {
      touchStart = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
        t: performance.now(),
      };
    }
  }, { passive: true });

  canvas.addEventListener("touchend", (e) => {
    if (!touchStart || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (state.mode === "menu" || state.mode === "over") {
      // ignore; buttons handle
    } else if (state.mode === "playing") {
      if (Math.max(absX, absY) < 24) {
        // tap = pulse
        startPulse();
      } else if (absX > absY) {
        switchLane(dx > 0 ? 1 : -1);
      } else if (dy < 0) {
        if (state.form !== "spike") setForm("spike");
        jump();
      } else {
        slide();
      }
    }
    touchStart = null;
  }, { passive: true });

  // buttons
  document.getElementById("btn-start").addEventListener("click", startGame);
  document.getElementById("btn-retry").addEventListener("click", startGame);
  document.getElementById("btn-menu").addEventListener("click", showMenu);
  document.getElementById("btn-howto").addEventListener("click", () => {
    howto.classList.remove("hidden");
  });
  document.getElementById("btn-howto-close").addEventListener("click", () => {
    howto.classList.add("hidden");
  });

  document.querySelectorAll(".t-form").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      ensureAudio();
      if (btn.id === "t-overclock") {
        activateOverclock();
        return;
      }
      const form = btn.dataset.form;
      if (form === "pulse") startPulse();
      else setForm(form);
      if (form === "spike") jump();
      if (form === "glide") slide();
    });
  });

  // preview morph cards on menu
  let morphPreviewTimer = 0;
  setInterval(() => {
    if (state.mode !== "menu") return;
    morphPreviewTimer = (morphPreviewTimer + 1) % 3;
    document.querySelectorAll(".morph-card").forEach((el, i) => {
      el.classList.toggle("active", i === morphPreviewTimer);
    });
  }, 900);

  window.addEventListener("resize", () => {
    resize();
    seedSpeedLines();
  });

  // boot
  loadBest();
  updateFormUI();
  resize();
  seedSpeedLines();
  requestAnimationFrame(frame);

  // expose for debug
  window.NEON_MORPH = state;
})();
