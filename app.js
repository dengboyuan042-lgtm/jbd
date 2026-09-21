(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const formatNumber = (value, digits = 2) => {
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  };
  const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const app = {
    currentView: 'probability',
    toastTimer: null,
  };

  function showToast(message) {
    const toast = $('#toast');
    $('#toastMessage').textContent = message;
    toast.classList.add('show');
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
  }

  function setRangeProgress(input) {
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value);
    const progress = ((value - min) / (max - min)) * 100;
    input.style.setProperty('--range-progress', `${clamp(progress, 0, 100)}%`);
  }

  $$('input[type="range"]').forEach(setRangeProgress);

  // ---------------------------------------------------------------------------
  // Navigation and shared modal
  // ---------------------------------------------------------------------------
  const viewNames = {
    probability: '概率模拟',
    flow: '流场艺术',
    vector: '矢量场',
    plotter: '函数绘图',
  };

  function activateView(name) {
    if (!viewNames[name]) return;
    app.currentView = name;
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === name));
    $$('.view').forEach((view) => view.classList.toggle('active', view.dataset.viewPanel === name));
    $('#breadcrumbCurrent').textContent = viewNames[name];
    if (name === 'flow') {
      requestAnimationFrame(() => resizeFlowCanvas());
    } else if (name === 'vector') {
      requestAnimationFrame(() => resizeVectorCanvas());
    } else if (name === 'plotter') {
      requestAnimationFrame(() => resizePlotCanvas());
    }
  }

  $$('.nav-item').forEach((button) => {
    button.addEventListener('click', () => activateView(button.dataset.view));
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      const names = Object.keys(viewNames);
      const next = names[(names.indexOf(app.currentView) + 1) % names.length];
      activateView(next);
      showToast(`已切换到 ${viewNames[next]}`);
    }
  });

  const aboutModal = $('#aboutModal');
  $('#aboutButton').addEventListener('click', () => {
    aboutModal.classList.add('open');
    aboutModal.setAttribute('aria-hidden', 'false');
  });
  $$('[data-close-about]').forEach((button) => button.addEventListener('click', () => {
    aboutModal.classList.remove('open');
    aboutModal.setAttribute('aria-hidden', 'true');
  }));

  // ---------------------------------------------------------------------------
  // Small expression compiler shared by vector fields and function plots.
  // It deliberately accepts a compact, educational math vocabulary only.
  // ---------------------------------------------------------------------------
  const expressionFunctions = [
    'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh', 'cbrt',
    'ceil', 'cos', 'cosh', 'exp', 'floor', 'log', 'log10', 'max', 'min', 'pow',
    'round', 'sign', 'sin', 'sinh', 'sqrt', 'tan', 'tanh',
  ];

  function normalizeExpression(expression) {
    let source = String(expression || '').trim();
    source = source.replace(/[−–—]/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
    source = source.replace(/π/g, 'pi').replace(/\bln\b/gi, 'log').replace(/\^/g, '**');
    if (!source) throw new Error('请输入一个方程');
    if (/[;{}[\]`'"\\]/.test(source)) throw new Error('方程中包含不支持的字符');
    if (source.length > 140) throw new Error('方程太长了');
    expressionFunctions.forEach((name) => {
      source = source.replace(new RegExp(`\\b${name}\\s*\\(`, 'gi'), `Math.${name}(`);
    });
    source = source.replace(/\bpi\b/gi, 'Math.PI').replace(/\be\b/g, 'Math.E');
    return source;
  }

  function compileExpression(expression) {
    const source = normalizeExpression(expression);
    let evaluator;
    try {
      evaluator = new Function('x', 'y', 't', `"use strict"; return (${source});`); // eslint-disable-line no-new-func
      // Force an early syntax check and make typos visible before drawing.
      const testValue = evaluator(0.37, -0.24, 0);
      if (typeof testValue !== 'number' || Number.isNaN(testValue)) throw new Error('结果不是有效数字');
    } catch (error) {
      throw new Error('方程无法解析，请检查括号或函数名');
    }
    return (x, y = 0, t = 0) => {
      const value = evaluator(x, y, t);
      return Number.isFinite(value) ? value : NaN;
    };
  }

  // ---------------------------------------------------------------------------
  // Probability simulator
  // ---------------------------------------------------------------------------
  const probability = {
    mode: 'dice',
    target: 600,
    speed: 8,
    completed: 0,
    counts: [0, 0, 0, 0, 0, 0],
    running: false,
    frame: null,
  };

  function probabilityLabels() {
    return probability.mode === 'dice' ? ['1', '2', '3', '4', '5', '6'] : ['正面', '反面'];
  }

  function buildProbabilityChart() {
    const chart = $('#probabilityChart');
    chart.innerHTML = '';
    chart.classList.toggle('coin-chart', probability.mode === 'coin');
    probabilityLabels().forEach((label, index) => {
      const column = document.createElement('div');
      column.className = 'histogram-column';
      column.innerHTML = `<span class="bar-value" data-bar-value="${index}">0</span><div class="bar-wrap"><div class="bar" data-bar="${index}" style="height: 2px"></div></div><span class="bar-label">${label}</span>`;
      chart.appendChild(column);
    });
    const marker = document.createElement('div');
    marker.className = 'theory-marker';
    marker.innerHTML = '<span>理论平均</span>';
    chart.appendChild(marker);
  }

  function setProbabilityButton(label, icon = '▶') {
    $('#probRunButton').innerHTML = `<span class="button-icon">${icon}</span><span>${label}</span>`;
  }

  function updateProbabilityMeta() {
    const dice = probability.mode === 'dice';
    $('#probModeCaption').textContent = dice ? '六面骰子 · 每一面理论概率 1/6' : '公平硬币 · 正反面理论概率各 1/2';
    $('#probChartTitle').textContent = dice ? '每个点数出现的次数' : '每种结果出现的次数';
    $('#theoryLineLabel').innerHTML = `<span></span> 理论平均线 · ${dice ? '16.7%' : '50.0%'}`;
    $('#probAxisMid').textContent = '频数';
  }

  function renderProbability() {
    const chart = $('#probabilityChart');
    const count = probability.mode === 'dice' ? 6 : 2;
    const theoretical = probability.target / count;
    const highest = Math.max(theoretical * 1.48, ...probability.counts, 1);
    const barHeight = Math.max(chart.clientHeight - 19, 1);
    probability.counts.slice(0, count).forEach((value, index) => {
      const bar = $(`[data-bar="${index}"]`, chart);
      const valueLabel = $(`[data-bar-value="${index}"]`, chart);
      if (!bar || !valueLabel) return;
      bar.style.height = `${Math.max(1.3, (value / highest) * 100)}%`;
      valueLabel.textContent = value.toLocaleString('zh-CN');
    });
    const marker = $('.theory-marker', chart);
    if (marker) marker.style.bottom = `${19 + (theoretical / highest) * barHeight}px`;
    $('#probCompleted').textContent = probability.completed.toLocaleString('zh-CN');
    $('#probAxisMax').textContent = Math.ceil(highest).toLocaleString('zh-CN');
    $('#probAxisMid').textContent = Math.ceil(highest / 2).toLocaleString('zh-CN');

    if (!probability.completed) {
      $('#probBestOutcome').textContent = '—';
      $('#probBestOutcomeLabel').textContent = '暂时还没有结果';
      $('#probDeviation').textContent = '—';
      $('#probConvergence').textContent = '0%';
      $('#probConvergenceBar').style.width = '0%';
      return;
    }
    const frequencies = probability.counts.slice(0, count).map((value) => value / probability.completed);
    const averageDeviation = frequencies.reduce((sum, frequency) => sum + Math.abs(frequency - (1 / count)), 0) / count;
    const convergence = clamp(100 - averageDeviation * 430, 0, 100);
    const bestValue = Math.max(...probability.counts.slice(0, count));
    const bestIndex = probability.counts.slice(0, count).indexOf(bestValue);
    const labels = probabilityLabels();
    $('#probBestOutcome').textContent = labels[bestIndex];
    $('#probBestOutcomeLabel').textContent = `当前出现最多 · ${bestValue} 次`;
    $('#probDeviation').textContent = `${(averageDeviation * 100).toFixed(1)}%`;
    $('#probConvergence').textContent = `${convergence.toFixed(0)}%`;
    $('#probConvergenceBar').style.width = `${convergence}%`;
  }

  function setProbabilityStatus(label, state = '') {
    const status = $('#probRunStatus');
    status.className = `run-status ${state}`;
    status.innerHTML = `<span class="status-dot"></span><span>${label}</span>`;
  }

  function resetProbability() {
    probability.running = false;
    if (probability.frame) cancelAnimationFrame(probability.frame);
    probability.frame = null;
    probability.completed = 0;
    probability.counts = Array(probability.mode === 'dice' ? 6 : 2).fill(0);
    setProbabilityStatus('准备开始');
    setProbabilityButton('开始实验', '▶');
    buildProbabilityChart();
    updateProbabilityMeta();
    renderProbability();
  }

  function probabilityStep() {
    if (!probability.running) return;
    const batch = Math.min(probability.speed, probability.target - probability.completed);
    for (let i = 0; i < batch; i += 1) {
      const result = probability.mode === 'dice' ? randomInt(0, 5) : randomInt(0, 1);
      probability.counts[result] += 1;
      probability.completed += 1;
    }
    renderProbability();
    if (probability.completed >= probability.target) {
      probability.running = false;
      probability.frame = null;
      setProbabilityStatus('实验完成', 'finished');
      setProbabilityButton('再做一次', '↻');
      return;
    }
    probability.frame = requestAnimationFrame(probabilityStep);
  }

  function toggleProbability() {
    if (probability.running) {
      probability.running = false;
      if (probability.frame) cancelAnimationFrame(probability.frame);
      probability.frame = null;
      setProbabilityStatus('已暂停');
      setProbabilityButton('继续实验', '▶');
      return;
    }
    if (probability.completed >= probability.target) resetProbability();
    probability.running = true;
    setProbabilityStatus('实验进行中', 'running');
    setProbabilityButton('暂停实验', 'Ⅱ');
    probability.frame = requestAnimationFrame(probabilityStep);
  }

  $$('.mode-tab').forEach((button) => button.addEventListener('click', () => {
    if (probability.running) toggleProbability();
    probability.mode = button.dataset.probMode;
    $$('.mode-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
    resetProbability();
  }));

  $$('.speed-tabs button').forEach((button) => button.addEventListener('click', () => {
    probability.speed = Number(button.dataset.probSpeed);
    $$('.speed-tabs button').forEach((tab) => tab.classList.toggle('active', tab === button));
  }));

  function setTrialTarget(value, reset = true) {
    const target = clamp(Math.round(Number(value) / 10) * 10, 20, 3000);
    probability.target = target;
    $('#trialTargetRange').value = target;
    $('#trialTargetNumber').value = target;
    $('#trialTargetOutput').textContent = target.toLocaleString('zh-CN');
    setRangeProgress($('#trialTargetRange'));
    if (reset) resetProbability();
  }

  $('#trialTargetRange').addEventListener('input', (event) => setTrialTarget(event.target.value));
  $('#trialTargetNumber').addEventListener('change', (event) => setTrialTarget(event.target.value));
  $('#probRunButton').addEventListener('click', toggleProbability);
  $('#probResetButton').addEventListener('click', () => {
    resetProbability();
    showToast('实验已重置，可以重新猜想');
  });
  buildProbabilityChart();
  updateProbabilityMeta();
  renderProbability();

  // ---------------------------------------------------------------------------
  // Flow field generative art
  // ---------------------------------------------------------------------------
  const flowPalettes = {
    aurora: { label: '极光', bg: '#080d1c', colors: ['#50dfcc', '#a991ff', '#e883d0', '#65bddb'], accent: '#80e9de' },
    ember: { label: '余烬', bg: '#160d18', colors: ['#ff7d61', '#ffc66e', '#e7649b', '#d783b6'], accent: '#ffb16a' },
    ocean: { label: '深海', bg: '#07121e', colors: ['#4bcbe7', '#5e7cff', '#a6eeff', '#3ba0d3'], accent: '#6bd9f1' },
    candy: { label: '糖果', bg: '#150e20', colors: ['#ff8fc8', '#7be8ff', '#f4ed84', '#c7a1ff'], accent: '#fa9dd4' },
  };
  const flow = {
    canvas: $('#flowCanvas'),
    wrap: $('#flowCanvasWrap'),
    ctx: $('#flowCanvas').getContext('2d'),
    width: 0,
    height: 0,
    dpr: 1,
    seed: randomInt(10000, 99999),
    speed: .42,
    trail: 72,
    particleCount: 1200,
    palette: 'aurora',
    particles: [],
    paused: false,
    elapsed: 0,
    lastTime: performance.now(),
    raf: null,
  };

  function noise2(x, y, seed) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const xf = x - x0;
    const yf = y - y0;
    const smooth = (value) => value * value * (3 - 2 * value);
    const hash = (ix, iy) => {
      const value = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123;
      return value - Math.floor(value);
    };
    const a = hash(x0, y0);
    const b = hash(x0 + 1, y0);
    const c = hash(x0, y0 + 1);
    const d = hash(x0 + 1, y0 + 1);
    const u = smooth(xf);
    const v = smooth(yf);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  function flowVector(x, y) {
    const scale = .0042;
    const n = noise2(x * scale, y * scale, flow.seed);
    const detail = noise2(x * scale * 2.6 + 31.7, y * scale * 2.6 - 17.3, flow.seed + 8);
    const angle = (n - .5) * Math.PI * 2.6 + (detail - .5) * 1.8;
    const nx = (x - flow.width / 2) / Math.max(flow.width, 1);
    const ny = (y - flow.height / 2) / Math.max(flow.height, 1);
    const radius = Math.sqrt(nx * nx + ny * ny);
    const swirl = Math.atan2(ny, nx) + Math.sin((nx - ny) * 7 + flow.seed) * .15;
    const mix = clamp(.28 + radius * .65, .28, .85);
    return {
      x: Math.cos(angle) * (1 - mix) + Math.cos(swirl + Math.PI / 2) * mix,
      y: Math.sin(angle) * (1 - mix) + Math.sin(swirl + Math.PI / 2) * mix,
    };
  }

  function spawnFlowParticle(particle, initial = false) {
    particle.x = Math.random() * Math.max(flow.width, 1);
    particle.y = Math.random() * Math.max(flow.height, 1);
    particle.px = particle.x;
    particle.py = particle.y;
    particle.vx = 0;
    particle.vy = 0;
    particle.life = initial ? Math.random() * flow.trail : 0;
    particle.maxLife = flow.trail * (.8 + Math.random() * 1.6);
    particle.colorIndex = Math.floor(Math.random() * flowPalettes[flow.palette].colors.length);
    particle.width = .35 + Math.random() * 1.15;
  }

  function clearFlowCanvas() {
    const palette = flowPalettes[flow.palette];
    flow.ctx.save();
    flow.ctx.globalCompositeOperation = 'source-over';
    flow.ctx.fillStyle = palette.bg;
    flow.ctx.fillRect(0, 0, flow.width, flow.height);
    const glow = flow.ctx.createRadialGradient(flow.width * .53, flow.height * .44, 0, flow.width * .53, flow.height * .44, Math.max(flow.width, flow.height) * .72);
    glow.addColorStop(0, 'rgba(40, 62, 100, .18)');
    glow.addColorStop(1, 'rgba(2, 4, 12, .16)');
    flow.ctx.fillStyle = glow;
    flow.ctx.fillRect(0, 0, flow.width, flow.height);
    flow.ctx.restore();
  }

  function resetFlowParticles() {
    flow.particles = Array.from({ length: flow.particleCount }, () => {
      const particle = {};
      spawnFlowParticle(particle, true);
      return particle;
    });
    clearFlowCanvas();
    $('#flowSeedLabel').textContent = `SEED ${flow.seed}`;
    $('#flowParticleLabel').textContent = `${flow.particleCount.toLocaleString('en-US')} PARTICLES`;
    $('#flowTimeLabel').textContent = '00:00';
  }

  function resizeFlowCanvas() {
    const rect = flow.wrap.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const changed = flow.width !== Math.round(rect.width) || flow.height !== Math.round(rect.height);
    flow.width = Math.round(rect.width);
    flow.height = Math.round(rect.height);
    flow.dpr = dpr;
    flow.canvas.width = Math.round(flow.width * dpr);
    flow.canvas.height = Math.round(flow.height * dpr);
    flow.canvas.style.width = `${flow.width}px`;
    flow.canvas.style.height = `${flow.height}px`;
    flow.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (changed || !flow.particles.length) resetFlowParticles();
  }

  function drawFlowFrame(delta) {
    if (!flow.width || !flow.height) return;
    const palette = flowPalettes[flow.palette];
    const ctx = flow.ctx;
    if (flow.paused) return;
    flow.elapsed += delta;
    const fade = clamp(.074 - flow.trail * .00039, .018, .064);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(5, 8, 18, ${fade})`;
    ctx.fillRect(0, 0, flow.width, flow.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const frameScale = Math.min(delta / 16.67, 2.2);
    for (const particle of flow.particles) {
      particle.px = particle.x;
      particle.py = particle.y;
      const vector = flowVector(particle.x, particle.y);
      particle.vx = lerp(particle.vx, vector.x, .06);
      particle.vy = lerp(particle.vy, vector.y, .06);
      const magnitude = 1.05 + flow.speed * 2.8;
      particle.x += particle.vx * magnitude * frameScale;
      particle.y += particle.vy * magnitude * frameScale;
      particle.life += frameScale;
      if (particle.x < -12 || particle.x > flow.width + 12 || particle.y < -12 || particle.y > flow.height + 12 || particle.life > particle.maxLife) {
        spawnFlowParticle(particle);
        continue;
      }
      const alpha = clamp(.12 + (1 - particle.life / particle.maxLife) * .8, .08, .8);
      ctx.strokeStyle = colorWithAlpha(palette.colors[particle.colorIndex], alpha);
      ctx.lineWidth = particle.width;
      ctx.beginPath();
      ctx.moveTo(particle.px, particle.py);
      ctx.lineTo(particle.x, particle.y);
      ctx.stroke();
    }
    ctx.restore();
    const seconds = Math.floor(flow.elapsed / 1000);
    $('#flowTimeLabel').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function colorWithAlpha(hex, alpha) {
    const clean = hex.replace('#', '');
    const value = clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean;
    const number = parseInt(value, 16);
    return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
  }

  function flowLoop(now) {
    const delta = Math.min(now - flow.lastTime, 42);
    flow.lastTime = now;
    drawFlowFrame(delta * (flow.speed / .42));
    flow.raf = requestAnimationFrame(flowLoop);
  }

  $('#flowSeedButton').addEventListener('click', () => {
    flow.seed = randomInt(10000, 99999);
    flow.elapsed = 0;
    resetFlowParticles();
    showToast(`已生成新的随机种子 ${flow.seed}`);
  });
  $('#flowPauseButton').addEventListener('click', () => {
    flow.paused = !flow.paused;
    const button = $('#flowPauseButton');
    button.classList.toggle('paused', flow.paused);
    button.innerHTML = flow.paused ? '<span>▶</span>' : '<span>Ⅱ</span>';
    button.setAttribute('aria-label', flow.paused ? '继续流场' : '暂停流场');
    showToast(flow.paused ? '流场已暂停' : '流场继续演化');
  });
  $('#flowExportButton').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `vectra-flow-${flow.seed}.png`;
    link.href = flow.canvas.toDataURL('image/png');
    link.click();
    showToast('PNG 已导出');
  });
  $('#flowSpeedRange').addEventListener('input', (event) => {
    flow.speed = Number(event.target.value);
    $('#flowSpeedOutput').textContent = flow.speed.toFixed(2);
    setRangeProgress(event.target);
  });
  $('#flowTrailRange').addEventListener('input', (event) => {
    flow.trail = Number(event.target.value);
    $('#flowTrailOutput').textContent = String(flow.trail);
    setRangeProgress(event.target);
  });
  $('#flowParticleRange').addEventListener('input', (event) => {
    flow.particleCount = Number(event.target.value);
    $('#flowParticleOutput').textContent = flow.particleCount.toLocaleString('zh-CN');
    $('#flowParticleLabel').textContent = `${flow.particleCount.toLocaleString('en-US')} PARTICLES`;
    setRangeProgress(event.target);
    resetFlowParticles();
  });
  $$('.palette-swatch').forEach((button) => button.addEventListener('click', () => {
    flow.palette = button.dataset.palette;
    $$('.palette-swatch').forEach((item) => item.classList.toggle('active', item === button));
    $('#flowPaletteOutput').textContent = flowPalettes[flow.palette].label;
    resetFlowParticles();
  }));
  window.addEventListener('resize', () => {
    resizeFlowCanvas();
    resizeVectorCanvas();
    resizePlotCanvas();
  });
  resizeFlowCanvas();
  flow.raf = requestAnimationFrame(flowLoop);

  // ---------------------------------------------------------------------------
  // Vector field renderer
  // ---------------------------------------------------------------------------
  const vectorPresets = {
    vortex: { p: '-y', q: 'x' },
    sink: { p: '-x', q: '-y' },
    wave: { p: 'sin(y * 1.4)', q: 'cos(x * 1.1)' },
    saddle: { p: 'x', q: '-y' },
  };
  const vector = {
    canvas: $('#vectorCanvas'),
    wrap: $('#vectorCanvasWrap'),
    ctx: $('#vectorCanvas').getContext('2d'),
    width: 0,
    height: 0,
    dpr: 1,
    density: 18,
    speed: .7,
    display: 'arrows',
    playing: true,
    time: 0,
    lastTime: performance.now(),
    pExpression: '-y',
    qExpression: 'x',
    p: compileExpression('-y'),
    q: compileExpression('x'),
    error: '',
    particles: [],
    hover: null,
    raf: null,
  };

  function vectorBounds() {
    const xMin = -5;
    const xMax = 5;
    const ySpan = xMax * (vector.height / Math.max(vector.width, 1));
    return { xMin, xMax, yMin: -ySpan / 2, yMax: ySpan / 2 };
  }
  function vectorToScreen(x, y) {
    const bounds = vectorBounds();
    return {
      x: ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * vector.width,
      y: vector.height - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * vector.height,
    };
  }
  function screenToVector(x, y) {
    const bounds = vectorBounds();
    return {
      x: bounds.xMin + (x / vector.width) * (bounds.xMax - bounds.xMin),
      y: bounds.yMin + ((vector.height - y) / vector.height) * (bounds.yMax - bounds.yMin),
    };
  }

  function resizeVectorCanvas() {
    const rect = vector.wrap.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    vector.width = Math.round(rect.width);
    vector.height = Math.round(rect.height);
    vector.dpr = Math.min(window.devicePixelRatio || 1, 2);
    vector.canvas.width = vector.width * vector.dpr;
    vector.canvas.height = vector.height * vector.dpr;
    vector.canvas.style.width = `${vector.width}px`;
    vector.canvas.style.height = `${vector.height}px`;
    vector.ctx.setTransform(vector.dpr, 0, 0, vector.dpr, 0, 0);
    vector.particles = [];
    drawVector();
  }

  function drawVectorGrid(ctx, bounds) {
    ctx.save();
    ctx.lineWidth = 1;
    const xStep = vector.width > 600 ? 1 : 1;
    for (let x = Math.ceil(bounds.xMin / xStep) * xStep; x <= bounds.xMax; x += xStep) {
      const sx = vectorToScreen(x, 0).x;
      ctx.strokeStyle = x === 0 ? 'rgba(117, 216, 220, .28)' : 'rgba(126, 157, 195, .09)';
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, vector.height); ctx.stroke();
    }
    for (let y = Math.ceil(bounds.yMin / xStep) * xStep; y <= bounds.yMax; y += xStep) {
      const sy = vectorToScreen(0, y).y;
      ctx.strokeStyle = y === 0 ? 'rgba(117, 216, 220, .28)' : 'rgba(126, 157, 195, .09)';
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(vector.width, sy); ctx.stroke();
    }
    ctx.restore();
  }

  function evaluateVector(x, y) {
    try {
      const p = vector.p(x, y, vector.time / 1000);
      const q = vector.q(x, y, vector.time / 1000);
      return { p: Number.isFinite(p) ? clamp(p, -20, 20) : 0, q: Number.isFinite(q) ? clamp(q, -20, 20) : 0 };
    } catch (error) {
      return { p: 0, q: 0 };
    }
  }

  function vectorMagnitudeColor(magnitude, alpha = 1) {
    const hue = lerp(184, 269, clamp(magnitude / 2, 0, 1));
    return `hsla(${hue}, 82%, ${lerp(64, 73, clamp(magnitude / 2, 0, 1))}%, ${alpha})`;
  }

  function drawArrow(ctx, sx, sy, dx, dy, magnitude, alpha = .86) {
    const length = 5 + clamp(magnitude, 0, 2.1) * 10;
    const normalized = Math.hypot(dx, dy) || 1;
    const ex = sx + (dx / normalized) * length;
    const ey = sy - (dy / normalized) * length;
    const angle = Math.atan2(ey - sy, ex - sx);
    ctx.strokeStyle = vectorMagnitudeColor(magnitude, alpha);
    ctx.fillStyle = vectorMagnitudeColor(magnitude, alpha);
    ctx.lineWidth = 1.15;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(angle - Math.PI / 6) * 4, ey - Math.sin(angle - Math.PI / 6) * 4);
    ctx.lineTo(ex - Math.cos(angle + Math.PI / 6) * 4, ey - Math.sin(angle + Math.PI / 6) * 4);
    ctx.closePath(); ctx.fill();
  }

  function resetVectorParticles() {
    vector.particles = [];
    const count = Math.round(vector.density * 8);
    for (let i = 0; i < count; i += 1) {
      vector.particles.push({ x: Math.random() * 10 - 5, y: Math.random() * 5 - 2.5, px: 0, py: 0, life: Math.random() });
    }
  }

  function drawStreamline(ctx, startX, startY, direction, bounds) {
    let x = startX;
    let y = startY;
    let drawn = false;
    ctx.beginPath();
    for (let step = 0; step < 78; step += 1) {
      if (x < bounds.xMin || x > bounds.xMax || y < bounds.yMin || y > bounds.yMax) break;
      const screen = vectorToScreen(x, y);
      if (!drawn) { ctx.moveTo(screen.x, screen.y); drawn = true; } else ctx.lineTo(screen.x, screen.y);
      const value = evaluateVector(x, y);
      const magnitude = Math.hypot(value.p, value.q) || .001;
      x += (value.p / magnitude) * .075 * direction;
      y += (value.q / magnitude) * .075 * direction;
    }
    if (drawn) {
      ctx.strokeStyle = vectorMagnitudeColor(Math.min(Math.hypot(evaluateVector(startX, startY).p, evaluateVector(startX, startY).q), 2), .46);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawVector() {
    if (!vector.width || !vector.height) return;
    const ctx = vector.ctx;
    const bounds = vectorBounds();
    ctx.save();
    ctx.clearRect(0, 0, vector.width, vector.height);
    const bg = ctx.createRadialGradient(vector.width * .50, vector.height * .45, 0, vector.width * .50, vector.height * .45, Math.max(vector.width, vector.height) * .75);
    bg.addColorStop(0, '#13253a'); bg.addColorStop(1, '#0b1222');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, vector.width, vector.height);
    drawVectorGrid(ctx, bounds);

    const columns = vector.density;
    const rows = Math.max(5, Math.round(columns * vector.height / vector.width * .72));
    if (vector.display === 'arrows') {
      for (let ix = 0; ix < columns; ix += 1) {
        for (let iy = 0; iy < rows; iy += 1) {
          const x = lerp(bounds.xMin + .22, bounds.xMax - .22, ix / Math.max(columns - 1, 1));
          const y = lerp(bounds.yMin + .22, bounds.yMax - .22, iy / Math.max(rows - 1, 1));
          const screen = vectorToScreen(x, y);
          const value = evaluateVector(x, y);
          drawArrow(ctx, screen.x, screen.y, value.p, value.q, Math.hypot(value.p, value.q));
        }
      }
    } else if (vector.display === 'stream') {
      ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = -vector.time * .018 * vector.speed;
      for (let ix = 0; ix < columns; ix += 1) {
        for (let iy = 0; iy < Math.max(4, Math.round(rows * .75)); iy += 1) {
          const x = lerp(bounds.xMin, bounds.xMax, ix / Math.max(columns - 1, 1));
          const y = lerp(bounds.yMin, bounds.yMax, iy / Math.max(rows - 1, 1));
          drawStreamline(ctx, x, y, 1, bounds);
        }
      }
      ctx.setLineDash([]);
    } else {
      if (!vector.particles.length) resetVectorParticles();
      ctx.globalCompositeOperation = 'lighter';
      for (const particle of vector.particles) {
        const before = vectorToScreen(particle.x, particle.y);
        const value = evaluateVector(particle.x, particle.y);
        const magnitude = Math.hypot(value.p, value.q) || .001;
        particle.x += (value.p / magnitude) * .035 * vector.speed;
        particle.y += (value.q / magnitude) * .035 * vector.speed;
        particle.life += .006 * vector.speed;
        if (particle.x < bounds.xMin || particle.x > bounds.xMax || particle.y < bounds.yMin || particle.y > bounds.yMax || particle.life > 1.6) {
          particle.x = Math.random() * 10 - 5; particle.y = Math.random() * (bounds.yMax - bounds.yMin) + bounds.yMin; particle.life = 0;
        }
        const after = vectorToScreen(particle.x, particle.y);
        ctx.strokeStyle = vectorMagnitudeColor(Math.min(magnitude, 2), .72);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(before.x, before.y); ctx.lineTo(after.x, after.y); ctx.stroke();
        ctx.fillStyle = '#d8feff'; ctx.beginPath(); ctx.arc(after.x, after.y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (vector.hover) {
      const point = vectorToScreen(vector.hover.x, vector.hover.y);
      ctx.strokeStyle = 'rgba(233, 255, 255, .78)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(point.x, point.y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#d9ffff'; ctx.beginPath(); ctx.arc(point.x, point.y, 1.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function setVectorExpressionInputs(p, q) {
    $('#vectorPInput').value = p;
    $('#vectorQInput').value = q;
    vector.pExpression = p;
    vector.qExpression = q;
    vector.error = '';
    $('#vectorError').textContent = '';
    try {
      vector.p = compileExpression(p);
      vector.q = compileExpression(q);
      $('#vectorFieldStatus').textContent = '场域已更新';
      drawVector();
    } catch (error) {
      vector.error = error.message;
      $('#vectorError').textContent = error.message;
      $('#vectorFieldStatus').textContent = '请检查方程';
    }
  }

  function updateVectorExpressions() {
    const p = $('#vectorPInput').value;
    const q = $('#vectorQInput').value;
    try {
      const nextP = compileExpression(p);
      const nextQ = compileExpression(q);
      vector.p = nextP; vector.q = nextQ;
      vector.pExpression = p; vector.qExpression = q;
      vector.error = '';
      $('#vectorError').textContent = '';
      $('#vectorFieldStatus').textContent = '场域已更新';
    } catch (error) {
      vector.error = error.message;
      $('#vectorError').textContent = error.message;
      $('#vectorFieldStatus').textContent = '方程有误';
    }
    drawVector();
  }

  $('#vectorPInput').addEventListener('input', updateVectorExpressions);
  $('#vectorQInput').addEventListener('input', updateVectorExpressions);
  $$('.preset-button').forEach((button) => button.addEventListener('click', () => {
    const preset = vectorPresets[button.dataset.vectorPreset];
    $$('.preset-button').forEach((item) => item.classList.toggle('active', item === button));
    setVectorExpressionInputs(preset.p, preset.q);
  }));
  $$('.display-tabs button').forEach((button) => button.addEventListener('click', () => {
    vector.display = button.dataset.vectorDisplay;
    $$('.display-tabs button').forEach((item) => item.classList.toggle('active', item === button));
    resetVectorParticles();
    drawVector();
  }));
  $('#vectorPlayButton').addEventListener('click', () => {
    vector.playing = !vector.playing;
    const button = $('#vectorPlayButton');
    button.innerHTML = vector.playing ? '<span class="button-icon">Ⅱ</span><span>暂停流动</span>' : '<span class="button-icon">▶</span><span>播放流动</span>';
    showToast(vector.playing ? '流动已播放' : '流动已暂停');
  });
  $('#vectorDensityRange').addEventListener('input', (event) => {
    vector.density = Number(event.target.value);
    const rows = Math.max(5, Math.round(vector.density * vector.height / Math.max(vector.width, 1) * .72));
    $('#vectorDensityOutput').textContent = `${vector.density} × ${rows}`;
    setRangeProgress(event.target);
    resetVectorParticles(); drawVector();
  });
  $('#vectorSpeedRange').addEventListener('input', (event) => {
    vector.speed = Number(event.target.value);
    $('#vectorSpeedOutput').textContent = `${vector.speed.toFixed(1)}×`;
    setRangeProgress(event.target);
  });

  vector.canvas.addEventListener('pointermove', (event) => {
    const rect = vector.canvas.getBoundingClientRect();
    const localX = clamp(event.clientX - rect.left, 0, vector.width);
    const localY = clamp(event.clientY - rect.top, 0, vector.height);
    const point = screenToVector(localX, localY);
    const value = evaluateVector(point.x, point.y);
    vector.hover = point;
    $('#vectorTooltipX').textContent = formatNumber(point.x);
    $('#vectorTooltipY').textContent = formatNumber(point.y);
    $('#vectorTooltipValue').textContent = `(${formatNumber(value.p)}, ${formatNumber(value.q)})`;
    $('#vectorTopReadout').textContent = `x ${formatNumber(point.x)} · y ${formatNumber(point.y)} · F ${formatNumber(Math.hypot(value.p, value.q))}`;
    const tooltip = $('#vectorTooltip');
    tooltip.style.left = `${clamp(localX, 8, Math.max(vector.width - 145, 8))}px`;
    tooltip.style.top = `${clamp(localY, 8, Math.max(vector.height - 100, 8))}px`;
    tooltip.classList.add('show');
    drawVector();
  });
  vector.canvas.addEventListener('pointerleave', () => {
    vector.hover = null;
    $('#vectorTooltip').classList.remove('show');
    $('#vectorTopReadout').textContent = '悬停画布查看矢量值';
    drawVector();
  });

  function vectorLoop(now) {
    const delta = Math.min(now - vector.lastTime, 50);
    vector.lastTime = now;
    if (vector.playing) vector.time += delta;
    if (vector.display === 'particles' || vector.display === 'stream' || vector.playing) drawVector();
    vector.raf = requestAnimationFrame(vectorLoop);
  }
  resizeVectorCanvas();
  vector.raf = requestAnimationFrame(vectorLoop);

  // ---------------------------------------------------------------------------
  // Function plotter
  // ---------------------------------------------------------------------------
  const plotColors = ['#ffb66f', '#65dddc', '#b29cff', '#f47da4', '#9fda78'];
  const plot = {
    canvas: $('#plotCanvas'),
    wrap: $('#plotCanvasWrap'),
    ctx: $('#plotCanvas').getContext('2d'),
    width: 0,
    height: 0,
    dpr: 1,
    grid: true,
    funcs: [
      { id: 1, expression: 'sin(x)', color: plotColors[0], compiled: null, error: '' },
      { id: 2, expression: '0.35 * x', color: plotColors[1], compiled: null, error: '' },
    ],
    nextId: 3,
    view: { xmin: -10, xmax: 10, ymin: -6, ymax: 6 },
    hover: null,
    dragging: false,
    dragStart: null,
  };

  function plotDefaultView() {
    const aspect = plot.width / Math.max(plot.height, 1);
    const xSpan = 20;
    const ySpan = clamp(xSpan / Math.max(aspect, .4), 8, 16);
    return { xmin: -xSpan / 2, xmax: xSpan / 2, ymin: -ySpan / 2, ymax: ySpan / 2 };
  }

  function plotToScreen(x, y) {
    const v = plot.view;
    return { x: (x - v.xmin) / (v.xmax - v.xmin) * plot.width, y: plot.height - (y - v.ymin) / (v.ymax - v.ymin) * plot.height };
  }
  function screenToPlot(x, y) {
    const v = plot.view;
    return { x: v.xmin + x / plot.width * (v.xmax - v.xmin), y: v.ymin + (plot.height - y) / plot.height * (v.ymax - v.ymin) };
  }
  function niceStep(range) {
    const rough = range / 9;
    const power = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-8))));
    const normalized = rough / power;
    let nice = 1;
    if (normalized >= 5) nice = 5; else if (normalized >= 2) nice = 2;
    return nice * power;
  }

  function resizePlotCanvas() {
    const rect = plot.wrap.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const wasEmpty = !plot.width;
    plot.width = Math.round(rect.width);
    plot.height = Math.round(rect.height);
    plot.dpr = Math.min(window.devicePixelRatio || 1, 2);
    plot.canvas.width = plot.width * plot.dpr;
    plot.canvas.height = plot.height * plot.dpr;
    plot.canvas.style.width = `${plot.width}px`;
    plot.canvas.style.height = `${plot.height}px`;
    plot.ctx.setTransform(plot.dpr, 0, 0, plot.dpr, 0, 0);
    if (wasEmpty) plot.view = plotDefaultView();
    drawPlot();
  }

  function drawPlotGrid(ctx) {
    const v = plot.view;
    if (!plot.grid) return;
    const xStep = niceStep(v.xmax - v.xmin);
    const yStep = niceStep(v.ymax - v.ymin);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '9px DM Mono, monospace';
    ctx.textBaseline = 'top';
    for (let x = Math.ceil(v.xmin / xStep) * xStep; x <= v.xmax + xStep * .1; x += xStep) {
      const sx = plotToScreen(x, 0).x;
      ctx.strokeStyle = Math.abs(x) < xStep * .001 ? 'rgba(202, 221, 241, .40)' : 'rgba(125, 159, 199, .12)';
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, plot.height); ctx.stroke();
      if (Math.abs(x) > xStep * .001 && sx > 3 && sx < plot.width - 20) {
        ctx.fillStyle = 'rgba(143, 162, 193, .65)'; ctx.fillText(trimAxisNumber(x), sx + 4, plot.height - 18);
      }
    }
    for (let y = Math.ceil(v.ymin / yStep) * yStep; y <= v.ymax + yStep * .1; y += yStep) {
      const sy = plotToScreen(0, y).y;
      ctx.strokeStyle = Math.abs(y) < yStep * .001 ? 'rgba(202, 221, 241, .40)' : 'rgba(125, 159, 199, .12)';
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(plot.width, sy); ctx.stroke();
      if (Math.abs(y) > yStep * .001 && sy > 13 && sy < plot.height - 3) {
        ctx.fillStyle = 'rgba(143, 162, 193, .65)'; ctx.fillText(trimAxisNumber(y), 7, sy + 4);
      }
    }
    const origin = plotToScreen(0, 0);
    ctx.fillStyle = 'rgba(192, 205, 225, .86)';
    if (origin.x > 18 && origin.x < plot.width - 18) { ctx.fillText('x', plot.width - 16, clamp(origin.y + 6, 5, plot.height - 13)); }
    if (origin.y > 16 && origin.y < plot.height - 16) { ctx.fillText('y', clamp(origin.x + 7, 5, plot.width - 14), 7); }
    ctx.restore();
  }

  function trimAxisNumber(value) {
    if (Math.abs(value) >= 100) return String(Math.round(value));
    return Number(value.toFixed(2)).toString();
  }

  function validatePlotFunction(fn) {
    try {
      fn.compiled = compileExpression(fn.expression);
      fn.compiled(0);
      fn.error = '';
    } catch (error) {
      fn.compiled = null;
      fn.error = error.message;
    }
  }

  function drawFunction(ctx, fn) {
    if (!fn.compiled || fn.error) return;
    const span = plot.view.xmax - plot.view.xmin;
    const samples = Math.max(plot.width, 450);
    const step = span / samples;
    let pathOpen = false;
    let previousY = null;
    ctx.save();
    ctx.strokeStyle = fn.color;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = fn.color;
    ctx.shadowBlur = 7;
    ctx.beginPath();
    for (let i = 0; i <= samples; i += 1) {
      const x = plot.view.xmin + i * step;
      let y;
      try { y = fn.compiled(x); } catch (error) { y = NaN; }
      const discontinuity = !Number.isFinite(y) || Math.abs(y) > 100000 || (previousY !== null && Math.abs(y - previousY) > span * 20);
      if (discontinuity) {
        if (pathOpen) { ctx.stroke(); ctx.beginPath(); }
        pathOpen = false; previousY = null; continue;
      }
      const screen = plotToScreen(x, y);
      if (!pathOpen) { ctx.moveTo(screen.x, screen.y); pathOpen = true; } else ctx.lineTo(screen.x, screen.y);
      previousY = y;
    }
    if (pathOpen) ctx.stroke();
    ctx.restore();
  }

  function drawPlot() {
    if (!plot.width || !plot.height) return;
    const ctx = plot.ctx;
    ctx.save();
    ctx.clearRect(0, 0, plot.width, plot.height);
    const background = ctx.createLinearGradient(0, 0, 0, plot.height);
    background.addColorStop(0, '#101b30'); background.addColorStop(1, '#0b1221');
    ctx.fillStyle = background; ctx.fillRect(0, 0, plot.width, plot.height);
    drawPlotGrid(ctx);
    plot.funcs.forEach((fn) => { validatePlotFunction(fn); drawFunction(ctx, fn); });
    if (plot.hover) {
      const point = plotToScreen(plot.hover.x, plot.hover.y);
      ctx.strokeStyle = 'rgba(255, 215, 158, .38)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(point.x, 0); ctx.lineTo(point.x, plot.height); ctx.moveTo(0, point.y); ctx.lineTo(plot.width, point.y); ctx.stroke(); ctx.setLineDash([]);
      plot.funcs.forEach((fn) => {
        if (!fn.compiled || fn.error) return;
        const y = fn.compiled(plot.hover.x);
        if (!Number.isFinite(y) || y < plot.view.ymin || y > plot.view.ymax) return;
        const curvePoint = plotToScreen(plot.hover.x, y);
        ctx.fillStyle = fn.color; ctx.shadowColor = fn.color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(curvePoint.x, curvePoint.y, 3, 0, Math.PI * 2); ctx.fill();
      });
    }
    ctx.restore();
    updatePlotLabels();
    updatePlotErrors();
  }

  function updatePlotLabels() {
    const v = plot.view;
    $('#plotScaleLabel').textContent = `视窗 · x ${trimAxisNumber(v.xmin)} 到 ${trimAxisNumber(v.xmax)}`;
    $('#plotFunctionCount').textContent = `${plot.funcs.length} 个函数`;
    if (plot.hover) {
      const first = plot.funcs.find((fn) => fn.compiled && !fn.error);
      const y = first ? first.compiled(plot.hover.x) : NaN;
      $('#plotCursorReadout').textContent = `x ${formatNumber(plot.hover.x)} · y ${formatNumber(y)}`;
    } else {
      $('#plotCursorReadout').textContent = 'x — · y —';
    }
  }

  function updatePlotErrors() {
    plot.funcs.forEach((fn) => {
      const row = $(`.function-row[data-function-id="${fn.id}"]`);
      if (!row) return;
      const error = $('.function-error', row);
      error.textContent = fn.error || '';
    });
    const hasError = plot.funcs.some((fn) => fn.error);
    $('#plotFooterMessage').textContent = hasError ? '有一个方程需要检查' : '坐标轴标签 · 即时反馈';
  }

  function renderFunctionList() {
    const list = $('#functionList');
    list.innerHTML = '';
    plot.funcs.forEach((fn, index) => {
      const row = document.createElement('div');
      row.className = 'function-row';
      row.dataset.functionId = String(fn.id);
      row.innerHTML = `<div class="function-row-main"><span class="function-color" style="color:${fn.color};background:${fn.color}"></span><span class="function-index">f${index + 1}</span><input class="function-input" value="${escapeHtml(fn.expression)}" spellcheck="false" aria-label="函数 f${index + 1}" /><button class="remove-function" type="button" aria-label="删除函数">×</button></div><div class="function-error" role="alert"></div>`;
      list.appendChild(row);
      const input = $('.function-input', row);
      input.addEventListener('input', () => {
        fn.expression = input.value;
        validatePlotFunction(fn);
        drawPlot();
      });
      $('.remove-function', row).addEventListener('click', () => {
        if (plot.funcs.length <= 1) { showToast('至少保留一个函数'); return; }
        plot.funcs = plot.funcs.filter((item) => item.id !== fn.id);
        renderFunctionList();
        drawPlot();
      });
    });
    plot.funcs.forEach(validatePlotFunction);
    updatePlotLabels();
    updatePlotErrors();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function zoomPlot(factor, centerX = plot.width / 2, centerY = plot.height / 2) {
    const anchor = screenToPlot(centerX, centerY);
    const v = plot.view;
    const xSpan = clamp((v.xmax - v.xmin) * factor, .05, 10000);
    const ySpan = clamp((v.ymax - v.ymin) * factor, .05, 10000);
    const xRatio = centerX / plot.width;
    const yRatio = 1 - centerY / plot.height;
    plot.view = { xmin: anchor.x - xSpan * xRatio, xmax: anchor.x + xSpan * (1 - xRatio), ymin: anchor.y - ySpan * (1 - yRatio), ymax: anchor.y + ySpan * yRatio };
    drawPlot();
  }

  $('#addFunctionButton').addEventListener('click', () => {
    if (plot.funcs.length >= 5) { showToast('最多同时绘制五个函数'); return; }
    const color = plotColors[plot.funcs.length % plotColors.length];
    plot.funcs.push({ id: plot.nextId++, expression: 'cos(x)', color, compiled: null, error: '' });
    renderFunctionList();
    drawPlot();
    const inputs = $$('.function-input');
    inputs[inputs.length - 1].focus();
  });
  $$('.example-chips button').forEach((button) => button.addEventListener('click', () => {
    const first = plot.funcs[0];
    first.expression = button.dataset.example;
    renderFunctionList();
    drawPlot();
    showToast(`已加载示例 ${button.dataset.example}`);
  }));
  $('#gridToggle').addEventListener('click', () => {
    plot.grid = !plot.grid;
    $('#gridToggle').classList.toggle('active', plot.grid);
    drawPlot();
  });
  $('#plotZoomIn').addEventListener('click', () => zoomPlot(.78));
  $('#plotZoomOut').addEventListener('click', () => zoomPlot(1.28));
  $('#plotResetButton').addEventListener('click', () => {
    plot.view = plotDefaultView();
    drawPlot();
    showToast('视图已重置');
  });

  plot.canvas.addEventListener('pointerdown', (event) => {
    plot.dragging = true;
    plot.dragStart = { x: event.clientX, y: event.clientY, view: { ...plot.view } };
    plot.canvas.setPointerCapture(event.pointerId);
    plot.canvas.style.cursor = 'grabbing';
    $('#plotCanvasHint').style.opacity = '.25';
  });
  plot.canvas.addEventListener('pointermove', (event) => {
    const rect = plot.canvas.getBoundingClientRect();
    const localX = clamp(event.clientX - rect.left, 0, plot.width);
    const localY = clamp(event.clientY - rect.top, 0, plot.height);
    if (plot.dragging && plot.dragStart) {
      const start = plot.dragStart;
      const dx = (event.clientX - start.x) / plot.width * (start.view.xmax - start.view.xmin);
      const dy = (event.clientY - start.y) / plot.height * (start.view.ymax - start.view.ymin);
      plot.view = { xmin: start.view.xmin - dx, xmax: start.view.xmax - dx, ymin: start.view.ymin + dy, ymax: start.view.ymax + dy };
    }
    plot.hover = screenToPlot(localX, localY);
    drawPlot();
  });
  const endPlotDrag = (event) => {
    if (!plot.dragging) return;
    plot.dragging = false;
    plot.dragStart = null;
    plot.canvas.style.cursor = 'crosshair';
    if (event && event.pointerId !== undefined) {
      try { plot.canvas.releasePointerCapture(event.pointerId); } catch (error) { /* capture may already be released */ }
    }
  };
  plot.canvas.addEventListener('pointerup', endPlotDrag);
  plot.canvas.addEventListener('pointercancel', endPlotDrag);
  plot.canvas.addEventListener('pointerleave', () => {
    if (!plot.dragging) { plot.hover = null; drawPlot(); }
  });
  plot.canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = plot.canvas.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, plot.width);
    const y = clamp(event.clientY - rect.top, 0, plot.height);
    zoomPlot(event.deltaY < 0 ? .82 : 1.22, x, y);
  }, { passive: false });

  renderFunctionList();
  resizePlotCanvas();
})();
