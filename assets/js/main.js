/* ==========================================================================
   Избушка дизайна — интерактив
   Без библиотек и сетевых запросов: всё считается в браузере посетителя.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------- общий тикер: один requestAnimationFrame на все эффекты ---------- */
  var jobs = [];
  var last = performance.now();
  function tick(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (var i = 0; i < jobs.length; i++) jobs[i](dt, now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- 0. Прелоадер ---------- */
  (function preloader() {
    var el = document.getElementById("preloader");
    if (!el) return;
    var minTime = root.classList.contains("is-quick") || reduceMotion ? 450 : 2100;
    var started = performance.now();
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      el.classList.add("is-done");
      root.classList.add("is-loaded");
      revealHero();
    }
    function onLoad() { setTimeout(finish, Math.max(0, minTime - (performance.now() - started))); }
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    setTimeout(finish, 4200); // страховка, если что-то грузится слишком долго
  })();

  /* ---------- появление при скролле ---------- */
  var heroRevealItems = Array.prototype.slice.call(document.querySelectorAll(".hero [data-reveal]"));
  heroRevealItems.forEach(function (el, i) { el.style.setProperty("--i", i); });
  function revealHero() { heroRevealItems.forEach(function (el) { el.classList.add("is-in"); }); }

  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("is-in"); revealIO.unobserve(e.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  document.querySelectorAll("[data-reveal]").forEach(function (el) {
    if (!el.closest(".hero")) revealIO.observe(el);
  });

  /* ---------- шапка ---------- */
  (function header() {
    var h = document.getElementById("header");
    var nav = document.getElementById("nav");
    var burger = document.getElementById("burger");
    var lastY = window.scrollY;
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      h.classList.toggle("is-scrolled", y > 30);
      h.classList.toggle("is-hidden", y > lastY && y > 400 && !nav.classList.contains("is-open"));
      lastY = y;
    }, { passive: true });
    burger.addEventListener("click", function () {
      var open = !nav.classList.contains("is-open");
      nav.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) { nav.classList.remove("is-open"); burger.setAttribute("aria-expanded", "false"); }
    });
  })();

  /* ---------- курсор-огонёк ---------- */
  (function cursor() {
    if (!finePointer) return;
    var c = document.querySelector(".cursor");
    var dot = c.querySelector(".cursor__dot");
    var ring = c.querySelector(".cursor__ring");
    var x = -100, y = -100, rx = -100, ry = -100;
    root.classList.add("has-cursor");
    window.addEventListener("pointermove", function (e) {
      x = e.clientX; y = e.clientY;
      c.classList.remove("is-hidden");
      var interactive = e.target.closest && e.target.closest("a, button, [data-tile]");
      c.classList.toggle("is-hover", !!interactive);
    }, { passive: true });
    window.addEventListener("pointerdown", function () { c.classList.add("is-down"); });
    window.addEventListener("pointerup", function () { c.classList.remove("is-down"); });
    document.addEventListener("pointerleave", function () { c.classList.add("is-hidden"); });
    jobs.push(function () {
      rx = lerp(rx, x, 0.18); ry = lerp(ry, y, 0.18);
      dot.style.transform = "translate(" + x + "px," + y + "px)";
      ring.style.transform = "translate(" + rx + "px," + ry + "px)";
    });
  })();

  /* ---------- магнитные кнопки ---------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll("[data-magnetic]").forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty("--mx", ((e.clientX - r.left - r.width / 2) * 0.25).toFixed(1) + "px");
        el.style.setProperty("--my", ((e.clientY - r.top - r.height / 2) * 0.35).toFixed(1) + "px");
      });
      el.addEventListener("pointerleave", function () {
        el.style.setProperty("--mx", "0px");
        el.style.setProperty("--my", "0px");
      });
    });
  }

  /* ==========================================================================
     1. Фонарь: гравюрные линии проявляются тёплым светом под курсором
     ========================================================================== */
  (function lantern() {
    var hero = document.getElementById("hero");
    var baseCv = document.getElementById("engrave-base");
    var litCv = document.getElementById("engrave-lit");
    if (!hero || !baseCv || !litCv || !baseCv.getContext) return;

    var bctx = baseCv.getContext("2d");
    var ctx = litCv.getContext("2d");
    var litLayer = document.createElement("canvas");   // готовые «светящиеся» линии
    var lctx = litLayer.getContext("2d");
    var mask = document.createElement("canvas");       // след фонаря (пол-разрешения)
    var mctx = mask.getContext("2d");

    var W = 0, H = 0, dpr = 1, MS = 0.5;
    var visible = true;
    var pointer = { x: 0, y: 0, px: 0, py: 0, active: false, lastMove: -1e9 };
    var auto = { t: Math.random() * 100 };
    var embers = [];

    /* --- шум Перлина (2D) --- */
    var perm = new Uint8Array(512);
    (function () {
      var p = [], i, j, t, seed = 7;
      for (i = 0; i < 256; i++) p[i] = i;
      for (i = 255; i > 0; i--) {
        seed = (seed * 16807) % 2147483647;
        j = seed % (i + 1); t = p[i]; p[i] = p[j]; p[j] = t;
      }
      for (i = 0; i < 512; i++) perm[i] = p[i & 255];
    })();
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function grad(h, x, y) { var u = h & 1 ? -x : x, v = h & 2 ? -y : y; return (h & 4 ? u + v : u - v) * 0.7071; }
    function noise(x, y) {
      var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      var u = fade(x), v = fade(y);
      var a = perm[X] + Y, b = perm[X + 1] + Y;
      return lerp(lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
                  lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v);
    }

    /* --- линии потока с равным шагом: выглядят как гравюра по дереву --- */
    function buildLines() {
      var sep = W < 700 ? 8 : 7, step = 3.2, cell = sep;
      var cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
      var grid = new Uint8Array(cols * rows);
      var lines = [];
      var sc = 0.0019;
      function angle(x, y) { return noise(x * sc, y * sc) * Math.PI * 2.4 + noise(x * sc * 3 + 40, y * sc * 3) * 0.6 - 0.5; }
      function free(x, y) {
        if (x < -10 || y < -10 || x > W + 10 || y > H + 10) return false;
        var cx = Math.floor(x / cell), cy = Math.floor(y / cell);
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return true;
        return !grid[cy * cols + cx];
      }
      function mark(pts) {
        for (var k = 0; k < pts.length; k += 2) {
          var cx = Math.floor(pts[k] / cell), cy = Math.floor(pts[k + 1] / cell);
          if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) grid[cy * cols + cx] = 1;
        }
      }
      function trace(x, y, dir) {
        var out = [], n = 0;
        while (n++ < 160) {
          var a = angle(x, y);
          x += Math.cos(a) * step * dir; y += Math.sin(a) * step * dir;
          if (!free(x, y)) break;
          out.push(x, y);
        }
        return out;
      }
      var tries = Math.round((W * H) / 260);
      var seed = 12345;
      function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      for (var t = 0; t < tries; t++) {
        var sx = rnd() * W, sy = rnd() * H;
        if (!free(sx, sy)) continue;
        var fwd = trace(sx, sy, 1), back = trace(sx, sy, -1);
        if (fwd.length + back.length < 24) continue;
        var pts = [];
        for (var i = back.length - 2; i >= 0; i -= 2) pts.push(back[i], back[i + 1]);
        pts.push(sx, sy);
        pts = pts.concat(fwd);
        mark(pts);
        lines.push(pts);
      }
      return lines;
    }

    function strokeLine(c, pts) {
      c.beginPath();
      c.moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
      c.stroke();
    }

    var palette = ["#ffd59a", "#ffb15c", "#ff9b5a", "#ffc47a", "#ffe2b0"];
    function render() {
      var rect = hero.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      [baseCv, litCv, litLayer].forEach(function (cv) { cv.width = W * dpr; cv.height = H * dpr; });
      mask.width = Math.ceil(W * MS); mask.height = Math.ceil(H * MS);
      [bctx, ctx, lctx].forEach(function (c) { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.lineCap = "round"; c.lineJoin = "round"; });

      var lines = buildLines();
      bctx.clearRect(0, 0, W, H);
      lctx.clearRect(0, 0, W, H);
      bctx.lineWidth = 1;
      lctx.lineWidth = 1.25;
      for (var i = 0; i < lines.length; i++) {
        var p = lines[i];
        var shade = 0.5 + noise(p[0] * 0.004 + 9, p[1] * 0.004);
        bctx.strokeStyle = "rgba(233, 214, 180," + (0.035 + shade * 0.07).toFixed(3) + ")";
        strokeLine(bctx, p);
        var cool = p[0] / W + noise(p[0] * 0.003, p[1] * 0.003 + 5) * 0.6 > 1.18;
        lctx.strokeStyle = cool ? "#bfe3ff" : palette[i % palette.length];
        lctx.globalAlpha = 0.55 + shade * 0.45;
        strokeLine(lctx, p);
      }
      lctx.globalAlpha = 1;
      // мягкое свечение поверх линий
      try {
        lctx.save();
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.filter = "blur(" + Math.round(4 * dpr) + "px)";
        lctx.globalCompositeOperation = "lighter";
        lctx.globalAlpha = 0.9;
        lctx.drawImage(litLayer, 0, 0);
        lctx.restore();
      } catch (e) { lctx.restore(); }

      mctx.clearRect(0, 0, mask.width, mask.height);
      if (reduceMotion) {
        // без анимации: статичное тёплое пятно у куба
        brush(W * 0.72, H * 0.5, Math.max(W, H) * 0.35, 0.8);
      }
      compose();
    }

    function brush(x, y, r, a) {
      var g = mctx.createRadialGradient(x * MS, y * MS, 0, x * MS, y * MS, r * MS);
      g.addColorStop(0, "rgba(0,0,0," + a + ")");
      g.addColorStop(0.5, "rgba(0,0,0," + a * 0.45 + ")");
      g.addColorStop(1, "rgba(0,0,0,0)");
      mctx.fillStyle = g;
      mctx.beginPath();
      mctx.arc(x * MS, y * MS, r * MS, 0, Math.PI * 2);
      mctx.fill();
    }

    function compose() {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(litLayer, 0, 0, W, H);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }

    function setPointer(e) {
      var r = litCv.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      if (!pointer.active) { pointer.px = pointer.x; pointer.py = pointer.y; }
      pointer.active = true;
      pointer.lastMove = performance.now();
    }
    hero.addEventListener("pointermove", setPointer, { passive: true });
    hero.addEventListener("pointerdown", setPointer, { passive: true });
    hero.addEventListener("pointerleave", function () { pointer.active = false; });

    var radius = function () { return clamp(Math.min(W, H) * 0.2, 90, 190); };
    var lastAuto = null;

    jobs.push(function (dt, now) {
      if (!visible || reduceMotion || !W) return;

      // затухание следа
      mctx.globalCompositeOperation = "destination-out";
      mctx.fillStyle = "rgba(0,0,0," + (1.6 * dt).toFixed(3) + ")";
      mctx.fillRect(0, 0, mask.width, mask.height);
      mctx.globalCompositeOperation = "source-over";

      var idle = now - pointer.lastMove > 4500;
      var x, y, px, py, strength;
      if (pointer.active && !idle) {
        x = pointer.x; y = pointer.y; px = pointer.px; py = pointer.py; strength = 1;
        pointer.px = x; pointer.py = y;
        lastAuto = null;
      } else {
        // автопилот: фонарь сам неспешно бродит, подсказывая, что фон живой
        auto.t += dt * 0.22;
        x = W * (0.5 + 0.36 * Math.sin(auto.t * 1.3) * Math.cos(auto.t * 0.4));
        y = H * (0.5 + 0.32 * Math.sin(auto.t * 0.9 + 1.2));
        px = lastAuto ? lastAuto.x : x; py = lastAuto ? lastAuto.y : y;
        lastAuto = { x: x, y: y };
        strength = 0.5;
      }

      // штрих от прошлой точки к новой, чтобы след был непрерывным
      var dist = Math.hypot(x - px, y - py);
      var steps = Math.max(1, Math.ceil(dist / 14));
      var r = radius();
      for (var s = 1; s <= steps; s++) {
        var k = s / steps;
        brush(lerp(px, x, k), lerp(py, y, k), r, strength * 0.5);
      }

      // искры-угольки
      var spawn = Math.min(4, dist / 18) + (Math.random() < 0.08 ? 1 : 0);
      for (var n = 0; n < spawn && embers.length < 140; n++) {
        embers.push({
          x: x + (Math.random() - 0.5) * r * 0.6,
          y: y + (Math.random() - 0.5) * r * 0.6,
          vx: (Math.random() - 0.5) * 18,
          vy: -12 - Math.random() * 30,
          life: 0,
          max: 1.2 + Math.random() * 1.6,
          size: 0.8 + Math.random() * 1.8
        });
      }

      compose();

      // мягкий ореол фонаря
      ctx.globalCompositeOperation = "lighter";
      var g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.5);
      g.addColorStop(0, "rgba(255,177,92," + (0.1 * strength + 0.02) + ")");
      g.addColorStop(1, "rgba(255,177,92,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);

      for (var i = embers.length - 1; i >= 0; i--) {
        var e = embers[i];
        e.life += dt;
        if (e.life > e.max) { embers.splice(i, 1); continue; }
        e.vx += Math.sin((e.life + i) * 3) * 6 * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        var a = Math.sin((e.life / e.max) * Math.PI);
        ctx.fillStyle = "rgba(255," + (190 + ((i * 7) % 50)) + ",120," + (a * 0.9).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    });

    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(hero);

    var rt;
    var lastW = 0;
    function onResize() {
      clearTimeout(rt);
      rt = setTimeout(function () {
        // на телефонах высота прыгает из-за адресной строки — перестраиваем только при смене ширины
        if (Math.abs(window.innerWidth - lastW) < 2 && W) return;
        lastW = window.innerWidth;
        render();
      }, 180);
    }
    window.addEventListener("resize", onResize);
    lastW = window.innerWidth;
    render();
  })();

  /* ---------- 1. Окно-портал: работы вращаются по кругу, рядом — «черновики» в сепии ---------- */
  (function portal() {
    var root = document.getElementById("portal");
    if (!root) return;
    var pane = document.getElementById("portal-pane");
    var ring = document.getElementById("portal-ring");
    var tilt = document.getElementById("portal-tilt");
    var cards = Array.prototype.slice.call(ring.querySelectorAll(".portal__card"));
    var dots = Array.prototype.slice.call(root.querySelectorAll(".portal__dot"));
    var N = cards.length, STEP = 360 / N, DELAY = 3200;
    var index = 0, angle = 0, target = 0, radius = 200;
    var hovered = false, visible = true, nextAt = performance.now() + DELAY + 1800;

    function layout() {
      var w = ring.offsetWidth;
      // радиус кольца, при котором соседние карточки не наезжают друг на друга
      radius = (w / 2) / Math.tan(Math.PI / N) * 1.08;
      ring.style.setProperty("--r", radius.toFixed(1) + "px");
    }
    function go(i) {
      var diff = ((i - index) % N + N) % N;
      if (diff > N / 2) diff -= N;          // крутим коротким путём
      index = (index + diff + N) % N;
      target -= diff * STEP;
      nextAt = performance.now() + DELAY;
      dots.forEach(function (d, k) { d.classList.toggle("is-on", k === index); d.setAttribute("aria-current", k === index ? "true" : "false"); });
    }
    dots.forEach(function (d) { d.addEventListener("click", function () { if (!root.classList.contains("is-open")) openShutters(); go(+d.dataset.go); }); });
    var swiped = false;
    cards.forEach(function (c, k) { c.addEventListener("click", function () { if (swiped) { swiped = false; return; } go(k !== index ? k : index + 1); }); });

    // пауза при наведении, свайп на телефоне
    root.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") hovered = true; });
    root.addEventListener("pointerleave", function () { hovered = false; tilt.style.setProperty("--rx", "0deg"); tilt.style.setProperty("--ry", "0deg"); });
    var sx = null;
    pane.addEventListener("pointerdown", function (e) { sx = e.clientX; });
    pane.addEventListener("pointerup", function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 30) { swiped = true; go(index + (dx < 0 ? 1 : -1)); setTimeout(function () { swiped = false; }, 50); }
    });
    pane.addEventListener("pointercancel", function () { sx = null; });

    if (finePointer && !reduceMotion) {
      root.addEventListener("pointermove", function (e) {
        var r = root.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty("--ry", (nx * 10).toFixed(2) + "deg");
        tilt.style.setProperty("--rx", (-ny * 7).toFixed(2) + "deg");
      });
    }

    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(root);
    window.addEventListener("resize", layout);
    layout();
    go(0);

    function paint() {
      ring.style.transform = "translateZ(" + (-radius).toFixed(1) + "px) rotateY(" + angle.toFixed(2) + "deg)";
      cards.forEach(function (c, k) {
        var rel = ((angle + k * STEP) % 360 + 540) % 360 - 180; // -180…180, 0 — карточка смотрит на нас
        var f = Math.max(0, Math.cos(rel * Math.PI / 180));
        var front = Math.pow(f, 3);
        c.style.filter = "sepia(" + ((1 - front) * 0.85).toFixed(2) + ") brightness(" + (0.42 + front * 0.58).toFixed(2) + ")";
        c.classList.toggle("is-front", Math.abs(rel) < STEP / 2);
      });
    }
    paint();

    // ставни закрыты, пока идёт прелоадер; распахиваются — и только потом карточки начинают вращаться
    var opened = false;
    function openShutters() {
      root.classList.add("is-open");
      nextAt = performance.now() + (reduceMotion ? DELAY : 1900 + DELAY * 0.4);
    }

    jobs.push(function (dt, now) {
      if (!opened && document.documentElement.classList.contains("is-loaded")) {
        opened = true;
        nextAt = Infinity;
        setTimeout(openShutters, reduceMotion ? 0 : 450);
      }
      if (!opened) nextAt = Infinity;
      if (!visible) return;
      if (!hovered && !reduceMotion && now > nextAt && document.visibilityState === "visible") go(index + 1);
      if (Math.abs(target - angle) < 0.01) return;
      angle = reduceMotion ? target : lerp(angle, target, 1 - Math.pow(0.004, dt));
      if (Math.abs(target - angle) < 0.01) angle = target;
      paint();
    });
  })();

  /* ---------- 2. Бегущая строка: скорость зависит от скролла ---------- */
  (function marquee() {
    var tracks = Array.prototype.slice.call(document.querySelectorAll(".marquee__track"));
    if (!tracks.length) return;
    var section = tracks[0].closest(".marquee");
    var items = tracks.map(function (track) {
      var group = track.querySelector(".marquee__group");
      // дублируем группу, чтобы лента была бесконечной на любой ширине экрана
      var copies = Math.max(2, Math.ceil((window.innerWidth * 2) / Math.max(1, group.offsetWidth)) + 1);
      for (var i = 1; i < copies; i++) {
        var c = group.cloneNode(true);
        c.setAttribute("aria-hidden", "true");
        track.appendChild(c);
      }
      return { track: track, group: group, x: 0, speed: parseFloat(track.dataset.speed) || 0.5 };
    });
    var visible = true, lastY = window.scrollY, boost = 0;
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(section);
    if (reduceMotion) return;
    jobs.push(function (dt) {
      var y = window.scrollY;
      var v = (y - lastY) / Math.max(dt, 0.001);
      lastY = y;
      boost = lerp(boost, clamp(v / 400, -6, 6), 0.08);
      if (!visible) return;
      items.forEach(function (it) {
        var w = it.group.offsetWidth;
        if (!w) return;
        var dir = it.speed > 0 ? 1 : -1;
        // скролл вниз ускоряет ленту, скролл вверх разворачивает её
        it.x -= (Math.abs(it.speed) * 60 + boost * 60) * dir * dt;
        it.x = ((it.x % w) - w) % w;
        it.track.style.transform = "translate3d(" + it.x.toFixed(2) + "px,0,0)";
      });
    });
  })();

  /* ---------- 3. Текст проявляется по словам по мере скролла ---------- */
  (function words() {
    var els = Array.prototype.slice.call(document.querySelectorAll("[data-words]"));
    if (!els.length || reduceMotion) return;
    var hot = /мастерск|визуал|продава|эффективн|карточк/i;
    var all = els.map(function (el) {
      var parts = el.textContent.trim().split(/(\s+)/);
      el.textContent = "";
      var spans = [];
      parts.forEach(function (p) {
        if (/^\s+$/.test(p)) { el.appendChild(document.createTextNode(p)); return; }
        var s = document.createElement("span");
        s.className = "w" + (hot.test(p) ? " is-hot" : "");
        s.textContent = p;
        el.appendChild(s);
        spans.push(s);
      });
      return { el: el, spans: spans };
    });
    function update() {
      var vh = window.innerHeight;
      all.forEach(function (it) {
        var r = it.el.getBoundingClientRect();
        var p = clamp((vh * 0.88 - r.top) / (r.height + vh * 0.35), 0, 1);
        var n = Math.round(p * it.spans.length);
        it.spans.forEach(function (s, i) {
          s.classList.toggle("on", i < n);
          s.classList.toggle("hot", i < n && s.classList.contains("is-hot"));
        });
      });
    }
    var queued = false;
    window.addEventListener("scroll", function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; update(); });
    }, { passive: true });
    window.addEventListener("resize", update);
    update();
  })();

  /* ---------- 3. Окно наклоняется за курсором ---------- */
  (function windowTilt() {
    var w = document.getElementById("window");
    if (!w || !finePointer || reduceMotion) return;
    var zone = w.parentElement;
    zone.addEventListener("pointermove", function (e) {
      var r = zone.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width - 0.5;
      var ny = (e.clientY - r.top) / r.height - 0.5;
      w.style.setProperty("--ry", (nx * 14).toFixed(2) + "deg");
      w.style.setProperty("--rx", (-ny * 10).toFixed(2) + "deg");
    });
    zone.addEventListener("pointerleave", function () {
      w.style.setProperty("--ry", "0deg");
      w.style.setProperty("--rx", "0deg");
    });
  })();

  /* ---------- 3. Счётчики цифр ---------- */
  (function counters() {
    var els = document.querySelectorAll("[data-count]");
    if (!els.length || reduceMotion) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var el = e.target, to = parseFloat(el.dataset.count), suf = el.dataset.suffix || "";
        var t0 = performance.now(), dur = 1400;
        (function step(now) {
          var k = clamp((now - t0) / dur, 0, 1);
          var eased = 1 - Math.pow(1 - k, 3);
          el.textContent = Math.round(to * eased) + suf;
          if (k < 1) requestAnimationFrame(step);
        })(t0);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- 5. До / После: «после» проявляется кругом из точки, где курсор вошёл ----------
     Наведение показывает результат, пока курсор на фото. Нажатие закрепляет «после»:
     оно уходит, только если нажать другое фото или ничего не делать 15 секунд. */
  (function beforeAfter() {
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-ba]"));
    if (!items.length) return;
    var pinned = null, idleTimer = null, IDLE = 15000;
    function origin(el, e) {
      var frame = el.querySelector(".ba__frame");
      var r = frame.getBoundingClientRect();
      var x = e && e.clientX ? (e.clientX - r.left) / r.width * 100 : 50;
      var y = e && e.clientY ? (e.clientY - r.top) / r.height * 100 : 50;
      el.style.setProperty("--x", clamp(x, 0, 100).toFixed(1) + "%");
      el.style.setProperty("--y", clamp(y, 0, 100).toFixed(1) + "%");
    }
    function set(el, on) { el.classList.toggle("is-on", on); el.setAttribute("aria-pressed", String(on && el === pinned)); }
    function unpin() {
      if (!pinned) return;
      var el = pinned;
      pinned = null;
      el.classList.remove("is-pinned");
      if (!el.matches(":hover")) set(el, false); else el.setAttribute("aria-pressed", "false");
    }
    function armIdle() {
      clearTimeout(idleTimer);
      if (pinned) idleTimer = setTimeout(unpin, IDLE);
    }
    function pin(el, e) {
      if (pinned && pinned !== el) unpin();
      if (!el.classList.contains("is-on")) origin(el, e);
      pinned = el;
      el.classList.add("is-pinned");
      set(el, true);
      armIdle();
    }
    // любое действие посетителя продлевает закреплённое «после»
    ["pointermove", "pointerdown", "keydown", "scroll", "wheel", "touchstart"].forEach(function (t) {
      window.addEventListener(t, function () { if (pinned) armIdle(); }, { passive: true });
    });
    items.forEach(function (el) {
      el.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && el !== pinned) { origin(el, e); set(el, true); } });
      el.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && el !== pinned) { origin(el, e); set(el, false); } });
      el.addEventListener("click", function (e) { pin(el, e); });
      el.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        pin(el, null);
      });
    });
  })();

  /* ---------- Просмотр работы целиком: общий для мастерской и чердака ---------- */
  var lightbox = (function () {
    var lb = document.getElementById("lightbox");
    if (!lb) return { open: function () {} };
    var lbImg = document.getElementById("lb-img");
    var lbTitle = document.getElementById("lb-title");
    var lbCount = document.getElementById("lb-count");
    var lbThumbs = document.getElementById("lb-thumbs");
    var prev = document.getElementById("lb-prev");
    var next = document.getElementById("lb-next");
    var state = { list: [], i: 0, opener: null, title: "" };

    function render() {
      var n = state.list.length;
      lbImg.classList.add("is-loading");
      lbImg.onload = function () {
        lbImg.classList.remove("is-loading");
        lbImg.classList.toggle("is-wide", lbImg.naturalWidth > lbImg.naturalHeight * 1.05);
      };
      lbImg.src = state.list[state.i];
      lbImg.alt = state.title + " — слайд " + (state.i + 1) + " из " + n;
      lbCount.textContent = (state.i + 1) + " / " + n;
      prev.hidden = next.hidden = lbThumbs.hidden = n < 2;
      Array.prototype.forEach.call(lbThumbs.children, function (t, k) {
        t.classList.toggle("is-on", k === state.i);
        if (k === state.i) t.scrollIntoView({ block: "nearest", inline: "center" });
      });
    }
    function step(d) {
      var n = state.list.length;
      if (n < 2) return;
      state.i = (state.i + d + n) % n; // по кругу: после последнего — снова первый
      render();
    }
    var api = {
      open: function (title, list, i, opener) {
        state = { list: list, i: i || 0, opener: opener, title: title };
        lbTitle.textContent = title;
        lbThumbs.textContent = "";
        list.forEach(function (src, k) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "lightbox__thumb";
          b.setAttribute("aria-label", "Слайд " + (k + 1));
          var t = document.createElement("img");
          t.src = src; t.alt = ""; t.loading = "lazy";
          t.onload = function () { b.classList.toggle("is-wide", t.naturalWidth > t.naturalHeight * 1.05); };
          b.appendChild(t);
          b.addEventListener("click", function () { state.i = k; render(); });
          lbThumbs.appendChild(b);
        });
        lb.hidden = false;
        root.classList.add("is-locked");
        render();
        (list.length > 1 ? next : lb.querySelector(".lightbox__close")).focus({ preventScroll: true });
      },
      close: function () {
        lb.hidden = true;
        root.classList.remove("is-locked");
        if (state.opener) state.opener.focus({ preventScroll: true });
      }
    };
    prev.addEventListener("click", function () { step(-1); });
    next.addEventListener("click", function () { step(1); });
    lb.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) api.close(); });
    document.addEventListener("keydown", function (e) {
      if (lb.hidden) return;
      if (e.key === "Escape") api.close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Tab") { // фокус не уходит из окна просмотра
        var f = Array.prototype.filter.call(lb.querySelectorAll("button"), function (b) { return !b.hidden && b.offsetParent; });
        if (!f.length) return;
        var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
    var sx = null;
    lbImg.addEventListener("pointerdown", function (e) { sx = e.clientX; });
    lbImg.addEventListener("pointerup", function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    });
    return api;
  })();

  /* ---------- 6–7. Мастерская и чердак: нажатие открывает все слайды работы ---------- */
  (function works() {
    document.querySelectorAll("[data-work]").forEach(function (el) {
      var n = +el.dataset.slides, base = el.dataset.base || "assets/img/portfolio/" + el.dataset.work + "/";
      var list = [];
      for (var i = 1; i <= n; i++) list.push(base + i + ".webp");
      var loaded = false;
      el.addEventListener("pointerenter", function () {
        if (loaded) return;
        loaded = true;
        list.slice(1, 4).forEach(function (src) { var im = new Image(); im.src = src; });
      });
      el.addEventListener("click", function () { lightbox.open(el.dataset.title, list, 0, el); });
    });
  })();

  /* ---------- 8. Прайс: вкладки и калькуляторы ---------- */
  (function prices() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".ptabs__btn"));
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle("is-on", on);
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t); });
      t.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        var next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
        select(next); next.focus();
      });
    });

    var fmt = function (n) { return n.toLocaleString("ru-RU").replace(/\u00a0/g, "\u202f") + "\u00a0₽"; };
    document.querySelectorAll("[data-calc]").forEach(function (calc) {
      var rows = Array.prototype.slice.call(calc.querySelectorAll(".calc__row"));
      var toggle = calc.querySelector("[data-toggle-item]");
      var sumEl = calc.querySelector("[data-sum]");
      var noteEl = calc.querySelector("[data-note]");
      var copyBtn = calc.querySelector("[data-copy]");
      var lines = [];
      function name(el) { return el.querySelector(".calc__name").firstChild.textContent.trim(); }
      function update() {
        var sum = 0, from = false;
        lines = [];
        var kit = calc.querySelector("input[name=kit]:checked");
        if (kit && +kit.value) { sum += +kit.value; lines.push(kit.dataset.kitName + " — " + fmt(+kit.value)); }
        rows.forEach(function (r) {
          var q = +r.querySelector("output").value || 0, price = +r.dataset.price;
          r.classList.toggle("is-active", q > 0);
          r.querySelector("[data-dec]").disabled = q === 0;
          if (!q) return;
          sum += q * price;
          if (r.hasAttribute("data-from")) from = true;
          lines.push(name(r) + " × " + q + " — " + (r.hasAttribute("data-from") ? "от " : "") + fmt(q * price));
        });
        if (toggle && toggle.querySelector("input").checked) {
          sum += +toggle.dataset.price; from = true;
          lines.push(name(toggle) + " — от " + fmt(+toggle.dataset.price));
        }
        sumEl.textContent = (from && sum ? "от " : "") + fmt(sum);
        noteEl.textContent = lines.length
          ? (from ? "Итог ориентировочный: точную цену назову после обсуждения задачи." : "Позиций в расчёте: " + lines.length + ". Цена фиксированная.")
          : "Добавьте услуги — сумма посчитается сама.";
        copyBtn.disabled = !lines.length;
        return { sum: sum, from: from };
      }
      rows.forEach(function (r) {
        var out = r.querySelector("output");
        out.value = 0;
        r.querySelector("[data-inc]").addEventListener("click", function () { out.value = Math.min(99, (+out.value || 0) + 1); update(); });
        r.querySelector("[data-dec]").addEventListener("click", function () { out.value = Math.max(0, (+out.value || 0) - 1); update(); });
      });
      calc.addEventListener("change", update);
      copyBtn.addEventListener("click", function () {
        var t = update();
        var text = "Расчёт «" + calc.dataset.calc + "»:\n" + lines.join("\n") + "\nИтого: " + (t.from ? "от " : "") + fmt(t.sum);
        var done = function () { copyBtn.textContent = "Скопировано ✓"; setTimeout(function () { copyBtn.textContent = "Скопировать расчёт"; }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
      });
      update();
    });
  })();

  /* ---------- 10. Как я работаю: карандаш рисует путь через шаги по мере скролла ---------- */
  (function process() {
    var track = document.getElementById("process-track");
    if (!track) return;
    var svg = track.querySelector(".process__line");
    var bg = track.querySelector(".process__path--bg");
    var ink = track.querySelector(".process__path--ink");
    var pencil = track.querySelector(".process__pencil");
    var steps = Array.prototype.slice.call(track.querySelectorAll("[data-step]"));
    var len = 0, marks = [];
    function build() {
      var r = track.getBoundingClientRect();
      svg.setAttribute("viewBox", "0 0 " + r.width.toFixed(0) + " " + r.height.toFixed(0));
      var pts = steps.map(function (st) {
        var d = st.querySelector(".step__dot").getBoundingClientRect();
        return { x: d.left + d.width / 2 - r.left, y: d.top + d.height / 2 - r.top };
      });
      var wide = pts.length > 1 && Math.abs(pts[0].x - pts[1].x) < 2 && r.width > 600;
      var d = "M" + pts[0].x.toFixed(1) + " " + (pts[0].y - 40).toFixed(1) + " L" + pts[0].x.toFixed(1) + " " + pts[0].y.toFixed(1);
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], my = (a.y + b.y) / 2;
        // на широком экране путь виляет к той стороне, где стоит карточка
        var sway = wide ? (i % 2 ? 70 : -70) : 0;
        d += " C" + (a.x + sway).toFixed(1) + " " + my.toFixed(1) + " " + (b.x + sway).toFixed(1) + " " + my.toFixed(1) + " " + b.x.toFixed(1) + " " + b.y.toFixed(1);
      }
      bg.setAttribute("d", d);
      ink.setAttribute("d", d);
      len = ink.getTotalLength();
      ink.style.strokeDasharray = len.toFixed(1);
      // какую долю пути нужно пройти, чтобы дойти до каждого шага
      marks = pts.map(function (pt) {
        var lo = 0, hi = len;
        for (var k = 0; k < 18; k++) { var mid = (lo + hi) / 2; if (ink.getPointAtLength(mid).y < pt.y) lo = mid; else hi = mid; }
        return hi / len;
      });
      update();
    }
    function update() {
      if (!len) return;
      var r = track.getBoundingClientRect(), vh = window.innerHeight;
      var p = reduceMotion ? 1 : clamp((vh * 0.62 - r.top) / r.height, 0, 1);
      ink.style.strokeDashoffset = (len * (1 - p)).toFixed(1);
      var at = len * p, pt = ink.getPointAtLength(at), pt2 = ink.getPointAtLength(Math.max(0, at - 2));
      var ang = Math.atan2(pt.y - pt2.y, pt.x - pt2.x) * 180 / Math.PI;
      // карандаш стоит на конце линии грифелем вниз по ходу движения
      pencil.style.transform = "translate(" + pt.x.toFixed(1) + "px," + pt.y.toFixed(1) + "px) rotate(" + (ang + 180).toFixed(1) + "deg)";
      pencil.style.opacity = p > 0.995 ? "0" : "1";
      steps.forEach(function (st, i) { st.classList.toggle("is-on", p >= marks[i] - 0.005); });
    }
    var queued = false;
    window.addEventListener("scroll", function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; update(); });
    }, { passive: true });
    window.addEventListener("resize", build);
    window.addEventListener("load", build);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    build();
  })();

  /* ---------- 11. Отзывы: сообщения появляются по очереди, как в живом чате ---------- */
  (function reviews() {
    document.querySelectorAll("[data-chat]").forEach(function (chat) {
      var msgs = Array.prototype.slice.call(chat.querySelectorAll("[data-msg]"));
      var typing = chat.querySelector(".msg--typing");
      if (reduceMotion) { msgs.forEach(function (m) { m.classList.add("is-shown"); }); return; }
      var io = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        var i = 0;
        (function next() {
          if (i >= msgs.length) { typing.classList.remove("is-on"); return; }
          var m = msgs[i];
          typing.classList.toggle("is-me", m.classList.contains("msg--me"));
          typing.classList.add("is-on");
          m.parentNode.insertBefore(typing, m);
          setTimeout(function () {
            typing.classList.remove("is-on");
            m.classList.add("is-shown");
            i++;
            setTimeout(next, 450);
          }, Math.min(1600, 500 + m.textContent.length * 4));
        })();
      }, { threshold: 0.45 });
      io.observe(chat);
    });
  })();

  /* ---------- 12. Канал: веер постов и текст выбранного поста ---------- */
  (function channel() {
    var fan = document.getElementById("fan");
    if (!fan) return;
    var cards = Array.prototype.slice.call(fan.querySelectorAll(".fan__card"));
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".post-tabs__btn"));
    var texts = Array.prototype.slice.call(document.querySelectorAll("[data-post-text]"));
    var cur = 0, touched = false, visible = false;
    function show(i) {
      cur = i;
      cards.forEach(function (c, k) { c.classList.toggle("is-on", k === i); });
      tabs.forEach(function (t, k) { t.classList.toggle("is-on", k === i); t.setAttribute("aria-selected", String(k === i)); });
      texts.forEach(function (t, k) { t.hidden = k !== i; t.classList.toggle("is-on", k === i); });
    }
    cards.concat(tabs).forEach(function (el) {
      el.addEventListener("click", function () { touched = true; show(+el.dataset.post); });
    });
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(fan);
    // пока посетитель сам не выбрал пост, посты сменяются сами
    if (!reduceMotion) setInterval(function () { if (!touched && visible && document.visibilityState === "visible") show((cur + 1) % cards.length); }, 7000);
    show(0);
  })();

  /* ---------- 1. Верх окна — на уровне верха заголовка (на широких экранах) ---------- */
  (function alignPortal() {
    var scene = document.getElementById("scene");
    var title = document.getElementById("hero-title");
    if (!scene || !title) return;
    var wide = window.matchMedia("(min-width: 901px)");
    function align() { scene.style.paddingTop = wide.matches ? title.offsetTop + "px" : ""; }
    window.addEventListener("resize", align);
    window.addEventListener("load", align);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(align);
    align();
  })();

  /* ---------- 7. Эмодзи-пак: главный эмодзи сменяется по кругу ---------- */
  (function emojiPack() {
    var img = document.getElementById("emoji-main");
    if (!img || reduceMotion) return;
    var tile = img.closest(".exhibit"), n = +tile.dataset.slides, i = 1, visible = false;
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(tile);
    setInterval(function () {
      if (!visible || document.visibilityState !== "visible") return;
      i = i % n + 1;
      var next = new Image();
      next.onload = function () {
        img.classList.add("is-swap");
        setTimeout(function () { img.src = next.src; img.classList.remove("is-swap"); }, 250);
      };
      next.src = "assets/img/attic/emoji/" + i + ".webp";
    }, 1800);
  })();

  /* ---------- 4. Плитки: фонарь внутри и лёгкий 3D-наклон ---------- */
  (function tiles() {
    if (!finePointer) return;
    document.querySelectorAll("[data-tile]").forEach(function (el) {
      var big = el.classList.contains("strip");
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var x = e.clientX - r.left, y = e.clientY - r.top;
        el.style.setProperty("--mx", x.toFixed(0) + "px");
        el.style.setProperty("--my", y.toFixed(0) + "px");
        if (reduceMotion || big) return;
        el.style.setProperty("--ry", ((x / r.width - 0.5) * 7).toFixed(2) + "deg");
        el.style.setProperty("--rx", ((0.5 - y / r.height) * 7).toFixed(2) + "deg");
      });
      el.addEventListener("pointerleave", function () {
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
      });
    });
  })();
})();
