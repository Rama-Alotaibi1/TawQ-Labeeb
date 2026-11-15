// =====================================================================
// Labeeb - canvas rendering: digital twin, chart, gauge
// Pure Canvas 2D: no libraries, works offline.
// =====================================================================
(function () {
  const C = window.LABEEB_CONFIG;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function fit(canvas) {
    const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    const W = Math.max(10, Math.round(r.width * d)), H = Math.max(10, Math.round(r.height * d));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext("2d"); ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }

  function heatColor(T, a) {
    const t = clamp((T - 30) / 140, 0, 1);
    const c1 = [67, 215, 230], c2 = [242, 169, 59], c3 = [255, 60, 70];
    const c = t < 0.5 ? c1.map((v, i) => lerp(v, c2[i], t * 2)) : c2.map((v, i) => lerp(v, c3[i], (t - 0.5) * 2));
    return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  }

  // ------------------------------------------------------------------ twin
  // Flat 2D technical cross-section (side view). Normalised coords:
  // u = 0..1 across the 81 cm width, v = 0..1 down the 50 cm height.
  const smoke = [], agent = [];
  const COL = { pica: "#D8D08C", struct: "#9AA5B1", cavity: "#111a29", canister: "#CFD6DD", head: "#B9C3CC", capture: "#8FD0B0",
    seal: "#2B2F36", sla: "#C9742E", board: "#5AA56A", power: "#6B7A8A", harness: "#E0A53A", chute: "#8B94A0", cyan: "#2EC4B6" };
  const SH = {
    pica:    [[0.30, 0.00], [0.70, 0.00], [1.00, 0.42], [0.00, 0.42]],
    hsStruct:[[0.325, 0.03], [0.675, 0.03], [0.955, 0.40], [0.045, 0.40]],
    hsCav:   [[0.345, 0.055], [0.655, 0.055], [0.925, 0.40], [0.075, 0.40]],
    sla:     [[0.00, 0.455], [1.00, 0.455], [0.73, 0.90], [0.27, 0.90]],
    bsStruct:[[0.055, 0.47], [0.945, 0.47], [0.70, 0.875], [0.30, 0.875]],
    bsCav:   [[0.085, 0.48], [0.915, 0.48], [0.685, 0.86], [0.315, 0.86]]
  };
  const R = { // rectangles [u, v, du, dv]
    canister: [0.40, 0.12, 0.20, 0.28], head: [0.435, 0.16, 0.13, 0.10], capture: [0.425, 0.28, 0.15, 0.05],
    latch: [0.375, 0.19, 0.03, 0.05], hinge: [0.10, 0.35, 0.045, 0.06],
    sealL: [0.015, 0.405, 0.075, 0.055], sealR: [0.91, 0.405, 0.075, 0.055],
    deck: [0.175, 0.625, 0.65, 0.022], avionics: [0.20, 0.535, 0.21, 0.085], power: [0.25, 0.652, 0.17, 0.10],
    chute: [0.43, 0.90, 0.14, 0.10]
  };
  const HARNESS = [[0.34, 0.752], [0.355, 0.815], [0.40, 0.832], [0.62, 0.832], [0.70, 0.76], [0.755, 0.66], [0.79, 0.565]];
  const CENTER = { avionics: [0.305, 0.577], power: [0.335, 0.702], harness: [0.55, 0.832], seal: [0.947, 0.432] };
  const SENSORS = [["T", 0.45, 0.565], ["G", 0.58, 0.565], ["P", 0.66, 0.60], ["O", 0.52, 0.715], ["R", 0.21, 0.505], ["S", 0.835, 0.30]];
  const PARTS = {
    pica:     { name: "PICA heat shield", material: "PICA (phenolic-impregnated carbon ablator)", fn: "Ablates during Earth entry and protects the capsule from entry heating" },
    hsStruct: { name: "Heat shield structure", material: "Reference design part", fn: "Carries the heat shield and entry loads" },
    canister: { name: "Canister", material: "Reference design part", fn: "Keeps the returned sample sealed. No microcapsules inside" },
    head:     { name: "Sample head", material: "Reference design part", fn: "Sample collection head stored inside the canister" },
    capture:  { name: "Capture mechanism", material: "Reference design part", fn: "Holds the sample head in place" },
    latch:    { name: "Canister latch", material: "Reference design part", fn: "Locks the canister closed" },
    hinge:    { name: "Hinge linkages", material: "Reference design part", fn: "Joins the backshell and heat shield at the rim" },
    bsStruct: { name: "Backshell structure", material: "Reference design part", fn: "Carries the backshell and internal units" },
    deck:     { name: "Avionics deck", material: "Reference design part", fn: "Mounting deck for the electronics" },
    sla:      { name: "SLA-561V backshell", material: "SLA-561V ablator", fn: "Protects the backshell during entry" },
    chute:    { name: "Parachute housing", material: "Reference design part", fn: "Stores the parachute for descent" },
    avionics: { zone: "avionics", fn: "Flight computer and sensor electronics" },
    power:    { zone: "power", fn: "Battery and power distribution" },
    harness:  { zone: "harness", fn: "Carries power and signals between units" },
    seal:     { zone: "seal", fn: "Thermal seals at the heat shield and backshell joint" }
  };
  let geo = null; // last layout, used for click hit-testing

  function inPoly(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const inRect = (p, r, pad = 0) => p[0] >= r[0] - pad && p[0] <= r[0] + r[2] + pad && p[1] >= r[1] - pad && p[1] <= r[1] + r[3] + pad;
  function distSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }

  function hitTwin(px, py) {
    if (!geo) return null;
    for (const l of geo.labels) if (px >= l.x0 && px <= l.x1 && Math.abs(py - l.y) < 9) return l.key;
    const p = [(px - geo.x0) / geo.W, (py - geo.y0) / geo.H];
    if (HARNESS.some((a, i) => i && distSeg(p, HARNESS[i - 1], a) < 0.018)) return "harness";
    for (const k of ["latch", "hinge", "capture", "head", "canister", "avionics", "power", "deck", "chute"]) if (inRect(p, R[k], 0.006)) return k;
    if (inRect(p, R.sealL, 0.006) || inRect(p, R.sealR, 0.006)) return "seal";
    if (inPoly(p, SH.bsCav)) return null;
    if (inPoly(p, SH.bsStruct)) return "bsStruct";
    if (inPoly(p, SH.sla)) return "sla";
    if (inPoly(p, SH.hsCav)) return null;
    if (inPoly(p, SH.hsStruct)) return "hsStruct";
    if (inPoly(p, SH.pica)) return "pica";
    return null;
  }

  function drawTwin(canvas, s, time, selected) {
    const { ctx, w, h } = fit(canvas);
    if (w < 60 || h < 60) return;
    ctx.clearRect(0, 0, w, h);

    const side = clamp(w * 0.18, 120, 165);
    const W = Math.max(80, Math.min(w - 2 * side - 20, (h - 96) * 81 / 50)), H = W * 50 / 81;
    const x0 = (w - W) / 2, y0 = 34 + Math.max(0, (h - 96 - H) / 2);
    const X = (u) => x0 + u * W, Y = (v) => y0 + v * H, P = (u, v) => [X(u), Y(v)];
    const zone = (id) => s.zones.find(z => z.id === id);

    // faint engineering grid
    ctx.strokeStyle = "rgba(120,160,200,0.06)"; ctx.lineWidth = 1;
    for (let gx = x0 - side; gx < x0 + W + side; gx += 20) { ctx.beginPath(); ctx.moveTo(gx, 24); ctx.lineTo(gx, h - 40); ctx.stroke(); }
    for (let gy = 24; gy < h - 40; gy += 20) { ctx.beginPath(); ctx.moveTo(x0 - side, gy); ctx.lineTo(x0 + W + side, gy); ctx.stroke(); }

    const poly = (pts, fill, stroke) => {
      ctx.beginPath(); pts.forEach(([u, v], i) => i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v))); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    };
    const rect = (r, fill, stroke, rad = 2) => {
      ctx.beginPath(); ctx.roundRect(X(r[0]), Y(r[1]), r[2] * W, r[3] * H, rad);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    };
    const edge = "rgba(10,16,28,0.9)";

    // shells
    poly(SH.pica, COL.pica, edge); poly(SH.hsStruct, COL.struct, edge); poly(SH.hsCav, COL.cavity);
    poly(SH.sla, COL.sla, edge); poly(SH.bsStruct, COL.struct, edge); poly(SH.bsCav, COL.cavity);
    // rim, seals, hinge
    rect([0.045, 0.40, 0.91, 0.055], "#5b6572", edge, 0);
    rect(R.sealL, COL.seal, "#59606b"); rect(R.sealR, COL.seal, "#59606b");
    rect(R.hinge, "#7d8894", edge);
    ctx.fillStyle = "#4b5560"; ctx.beginPath(); ctx.arc(X(0.1225), Y(0.38), Math.max(2, W * 0.007), 0, 7); ctx.fill();
    // parachute housing
    rect(R.chute, COL.chute, edge, 3);
    ctx.strokeStyle = "rgba(20,28,40,0.5)"; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(X(0.43 + i * 0.035), Y(0.91)); ctx.lineTo(X(0.43 + i * 0.035), Y(0.99)); ctx.stroke(); }
    // canister, sample head, capture mechanism, latch
    rect(R.canister, COL.canister, edge, 4); rect(R.head, COL.head, "#8e9aa6", 6); rect(R.capture, COL.capture, "#5f9e80", 3);
    rect(R.latch, "#7d8894", edge, 1);
    // avionics deck, board, power module
    rect(R.deck, COL.struct, edge, 1);
    rect(R.avionics, COL.board, "#3c7a4a", 2);
    ctx.fillStyle = "#1d2a22"; for (let i = 0; i < 4; i++) ctx.fillRect(X(0.215 + i * 0.048), Y(0.552), W * 0.032, H * 0.035);
    ctx.fillStyle = "#c8b25a"; for (let i = 0; i < 9; i++) ctx.fillRect(X(0.21 + i * 0.022), Y(0.603), 2, 3);
    rect(R.power, COL.power, "#465361", 2);
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(X(0.25 + i * 0.0425), Y(0.665)); ctx.lineTo(X(0.25 + i * 0.0425), Y(0.74)); ctx.stroke(); }

    // microcapsule layer: dashed cyan outlines (filled when released)
    const mc = (id, draw) => {
      const z = zone(id); ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = COL.cyan;
      draw(z); ctx.restore();
    };
    const mcRect = (r, z) => {
      const pad = 0.012; ctx.beginPath(); ctx.roundRect(X(r[0] - pad), Y(r[1] - pad * 1.6), (r[2] + 2 * pad) * W, (r[3] + 3.2 * pad) * H, 4);
      if (z && (z.released || z.suppressant > 0.05)) { ctx.fillStyle = `rgba(46,196,182,${0.10 + 0.25 * clamp(z.suppressant, 0, 1)})`; ctx.fill(); }
      ctx.stroke();
    };
    mc("avionics", z => mcRect(R.avionics, z)); mc("power", z => mcRect(R.power, z));
    mc("seal", z => { mcRect(R.sealL, z); mcRect(R.sealR, z); });
    const hz = zone("harness");
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); HARNESS.forEach(([u, v], i) => i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v)));
    if (hz.released || hz.suppressant > 0.05) { ctx.strokeStyle = `rgba(46,196,182,${0.15 + 0.3 * clamp(hz.suppressant, 0, 1)})`; ctx.lineWidth = 13; ctx.stroke(); }
    ctx.setLineDash([5, 4]); ctx.strokeStyle = COL.cyan; ctx.lineWidth = 11; ctx.globalAlpha = 0.9; ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.strokeStyle = COL.cavity; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = COL.harness; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.restore();

    // selection highlight
    if (selected) {
      ctx.save(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.shadowColor = "#fff"; ctx.shadowBlur = 8;
      const k = selected;
      if (SH[k]) poly(SH[k], null, "#ffffff");
      else if (k === "seal") { rect(R.sealL, null, "#fff"); rect(R.sealR, null, "#fff"); }
      else if (k === "harness") { ctx.beginPath(); HARNESS.forEach(([u, v], i) => i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v))); ctx.stroke(); }
      else if (R[k]) rect(R[k], null, "#fff");
      ctx.restore();
    }

    // heat glow (red-orange) on the monitored zones
    for (const z of s.zones) {
      const t = clamp((z.T - 35) / 135, 0, 1); if (t <= 0.02) continue;
      const pts = z.id === "seal" ? [CENTER.seal, [0.053, 0.432]] : [CENTER[z.id]];
      for (const [u, v] of pts) {
        const [cx, cy] = P(u, v), Rr = W * (0.04 + 0.09 * t);
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rr);
        rg.addColorStop(0, heatColor(z.T, 0.30 + 0.55 * t)); rg.addColorStop(1, heatColor(z.T, 0));
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, Rr, 0, 7); ctx.fill();
      }
    }
    // small spherical flame (microgravity: no buoyancy)
    for (const z of s.zones) {
      if (!z.burning) continue;
      const [cx, cy] = P(...CENTER[z.id]);
      const Rf = W * 0.05 * (1 + 0.12 * Math.sin(time * 9) + 0.06 * Math.sin(time * 23));
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rf);
      fg.addColorStop(0, "rgba(255,255,255,0.95)"); fg.addColorStop(0.35, "rgba(110,170,255,0.85)");
      fg.addColorStop(0.75, "rgba(255,110,50,0.55)"); fg.addColorStop(1, "rgba(255,80,40,0)");
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, Rf, 0, 7); ctx.fill();
      for (let i = 0; i < 5; i++) { const a = time * 2 + i * 1.3; ctx.fillStyle = "rgba(255,170,60,0.85)"; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * Rf * 0.75, cy + Math.sin(a) * Rf * 0.75, 1.6, 0, 7); ctx.fill(); }
    }

    // smoke (grey) and microcapsule agent cloud (cyan-white), clipped to the interior
    ctx.save(); ctx.beginPath();
    for (const pts of [SH.hsCav, SH.bsCav]) { pts.forEach(([u, v], i) => i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v))); ctx.closePath(); }
    ctx.rect(X(0), Y(0.40), W, H * 0.065); ctx.clip();
    const [sx, sy] = P(...CENTER[s.faultZone]);
    if (s.particles > 12 && Math.random() < clamp(s.particles / 120, 0.05, 0.9)) smoke.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 14 + (s.ventOn ? 10 : 0), vy: (Math.random() - 0.5) * 14, r: 3 + Math.random() * 4, a: 0.45, smoke: 1 });
    for (const z of s.zones) if (z.suppressant > 0.08 && Math.random() < z.suppressant * 0.6) {
      const [ax, ay] = P(...CENTER[z.id]); const ang = Math.random() * 6.28, sp = 15 + Math.random() * 30;
      agent.push({ x: ax, y: ay, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 4 + Math.random() * 8, a: 0.32 * z.suppressant + 0.12 });
    }
    const dt = 1 / 60;
    for (const arr of [smoke, agent]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; p.r += dt * 4; p.a -= dt * (arr === smoke ? 0.12 : 0.18);
        if (p.a <= 0) { arr.splice(i, 1); continue; }
        ctx.fillStyle = arr === smoke ? `rgba(130,130,135,${p.a * 0.6})` : `rgba(200,250,255,${p.a * 0.6})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
      if (arr.length > 220) arr.splice(0, arr.length - 220);
    }
    ctx.restore();

    // sensors
    const sr = clamp(W * 0.016, 6, 9);
    ctx.font = `700 ${Math.round(sr * 1.2)}px Inter, Segoe UI, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const [t, u, v] of SENSORS) {
      const [cx, cy] = P(u, v);
      ctx.fillStyle = "#0e2a33"; ctx.strokeStyle = COL.cyan; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, sr, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COL.cyan; ctx.fillText(t, cx, cy + 0.5);
    }
    ctx.textBaseline = "alphabetic";

    // labels with leader lines
    const zl = (id) => { const z = zone(id); return { text: `${z.name} · ${Math.round(z.T)} °C`, color: z.T >= 60 ? heatColor(z.T, 1) : "#e8f2f6" }; };
    const right = [["pica", "PICA heat shield", 0.845, 0.22], ["hsStruct", "Heat shield structure", 0.862, 0.30], ["canister", "Canister", 0.59, 0.135],
      ["head", "Sample head", 0.55, 0.20], ["capture", "Capture mechanism", 0.56, 0.305], ["seal", null, 0.95, 0.432],
      ["bsStruct", "Backshell structure", 0.89, 0.52], ["sla", "SLA-561V backshell", 0.84, 0.62], ["deck", "Avionics deck", 0.76, 0.636],
      ["chute", "Parachute housing", 0.56, 0.96]];
    const left = [["latch", "Canister latch", 0.39, 0.215], ["hinge", "Hinge linkages", 0.12, 0.39], ["avionics", null, 0.22, 0.577],
      ["power", null, 0.27, 0.70], ["harness", null, 0.38, 0.832]];
    geo = { x0, y0, W, H, labels: [] };
    const fs = w < 900 ? 11 : 12;
    ctx.font = `600 ${fs}px Inter, Segoe UI, sans-serif`; ctx.lineWidth = 1;
    const place = (list, isRight) => {
      const top = y0 + 4, bot = y0 + H - 2, n = list.length, step = (bot - top) / Math.max(1, n - 1);
      list.forEach(([key, label, u, v], i) => {
        const ly = isRight ? top + i * step : clamp(Y(v), top + i * 22, bot - (n - 1 - i) * 22);
        const zi = PARTS[key].zone ? zl(PARTS[key].zone) : { text: label, color: "#e8f2f6" };
        const sel = selected === key;
        const lx = isRight ? x0 + W + 18 : x0 - 30;
        const [px, py] = P(u, v);
        ctx.strokeStyle = sel ? "#ffffff" : "rgba(210,225,235,0.55)";
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(isRight ? lx - 8 : lx + 8, ly); ctx.lineTo(lx, ly); ctx.stroke();
        ctx.fillStyle = "#cfe3ea"; ctx.beginPath(); ctx.arc(px, py, 2, 0, 7); ctx.fill();
        ctx.fillStyle = sel ? "#ffffff" : zi.color; ctx.textAlign = isRight ? "left" : "right";
        ctx.fillText(zi.text, isRight ? lx + 4 : lx - 4, ly + 4);
        const tw = ctx.measureText(zi.text).width;
        geo.labels.push(isRight ? { key, x0: lx, x1: lx + tw + 8, y: ly } : { key, x0: lx - tw - 8, x1: lx, y: ly });
      });
    };
    place(right, true); place(left, false);

    // dimension lines
    ctx.strokeStyle = "rgba(200,215,225,0.7)"; ctx.fillStyle = "#cfe3ea"; ctx.font = `600 ${fs}px Inter, Segoe UI, sans-serif`;
    const dy = y0 + H + 16, dx = x0 - 14;
    ctx.beginPath(); ctx.moveTo(x0, dy); ctx.lineTo(x0 + W, dy); ctx.moveTo(x0, dy - 5); ctx.lineTo(x0, dy + 5); ctx.moveTo(x0 + W, dy - 5); ctx.lineTo(x0 + W, dy + 5); ctx.stroke();
    ctx.textAlign = "center"; ctx.fillStyle = "#0B1220"; ctx.fillRect(x0 + W / 2 - 24, dy - 8, 48, 16);
    ctx.fillStyle = "#cfe3ea"; ctx.fillText("81 cm", x0 + W / 2, dy + 4);
    ctx.beginPath(); ctx.moveTo(dx, y0); ctx.lineTo(dx, y0 + H); ctx.moveTo(dx - 5, y0); ctx.lineTo(dx + 5, y0); ctx.moveTo(dx - 5, y0 + H); ctx.lineTo(dx + 5, y0 + H); ctx.stroke();
    ctx.save(); ctx.translate(dx, y0 + H / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = "#0B1220"; ctx.fillRect(-24, -8, 48, 16);
    ctx.fillStyle = "#cfe3ea"; ctx.fillText("50 cm", 0, 4); ctx.restore();

    // legend
    ctx.font = `500 ${fs - 1}px Inter, Segoe UI, sans-serif`; ctx.textAlign = "left"; ctx.fillStyle = "#9fb3c0";
    const leg = "Sensors: T temperature · G gas (CO, VOC) · P particles · O oxygen · R pressure · S strain";
    ctx.fillText(leg, 8, 14);
    const lw = ctx.measureText(leg).width + 22;
    ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = COL.cyan; ctx.lineWidth = 1.5; ctx.strokeRect(lw, 6, 18, 10); ctx.restore();
    ctx.fillText("C6F12O@Chitosan microcapsule layer · click a part for its material", lw + 24, 14);
  }

  // ------------------------------------------------------------------ chart
  function drawChart(canvas, hist, zone, rate) {
    const { ctx, w, h } = fit(canvas);
    if (w < 60 || h < 30) return;
    ctx.clearRect(0, 0, w, h);
    const padL = 8, padR = 200, padT = 8, padB = 8;
    const Tmin = 20, Tmax = 215, span = 60, fut = 20;
    const now = hist.length ? hist[hist.length - 1].t : 0;
    const X = (t) => padL + ((t - (now - span)) / (span + fut)) * (w - padL - padR);
    const Y = (T) => padT + (1 - (clamp(T, Tmin, Tmax) - Tmin) / (Tmax - Tmin)) * (h - padT - padB);
    const line = (T, col, label) => {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, Y(T)); ctx.lineTo(w - padR + 6, Y(T)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.font = "11px DejaVu Sans Mono, monospace"; ctx.fillText(label, w - padR + 10, Y(T) + 4);
    };
    line(C.microcapsules.reportedRelease_C, "rgba(255,120,120,.75)", `published release ~${C.microcapsules.reportedRelease_C} °C`);
    line(zone.decomp_C, "#f2a93b", `component damage limit ${zone.decomp_C} °C`);
    line(zone.release_C, "#43d7e6", `release target ${zone.release_C} °C`);
    line(C.microcapsules.verify_T_C, "rgba(62,224,143,.6)", `verified < ${C.microcapsules.verify_T_C} °C`);
    if (hist.length > 1) {
      ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 2; ctx.beginPath();
      hist.filter(p => p.t >= now - span).forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.T)) : ctx.moveTo(X(p.t), Y(p.T))));
      ctx.stroke();
      const last = hist[hist.length - 1];
      if (Math.abs(rate) > 0.5) {
        ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.moveTo(X(last.t), Y(last.T)); ctx.lineTo(X(last.t + fut), Y(last.T + rate * fut)); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = "11px Inter, sans-serif"; ctx.fillText("forecast", X(last.t + fut * 0.45), Y(last.T + rate * fut * 0.45) - 6);
      }
      ctx.fillStyle = "#ffb347"; ctx.beginPath(); ctx.arc(X(last.t), Y(last.T), 3, 0, 7); ctx.fill();
    }
  }

  // ------------------------------------------------------------------ gauge
  function drawGauge(canvas, r) {
    const { ctx, w, h } = fit(canvas);
    if (w < 30 || h < 30) return;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.78, R = Math.min(w * 0.38, h * 0.62);
    const col = r.label === "NOMINAL" ? "#43d7e6" : r.label === "STANDBY" ? "#f2a93b" : r.label === "HIGH" ? "#f2a93b" : "#ff4d5e";
    ctx.lineWidth = 12; ctx.lineCap = "round";
    ctx.strokeStyle = "#173444"; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, Math.PI + Math.PI * Math.max(0.01, r.pct / 100)); ctx.stroke();
    ctx.fillStyle = col; ctx.textAlign = "center"; ctx.font = "26px DejaVu Sans Mono, monospace"; ctx.fillText(r.pct + "%", cx, cy - 6);
    ctx.font = "700 11px Inter, sans-serif"; ctx.fillText(r.label, cx, cy + 12); ctx.textAlign = "left";
  }

  window.LabeebScene = { drawTwin, drawChart, drawGauge, hitTwin, PARTS };
})();
