// =====================================================================
// Labeeb - app wiring: simulation loop, response sequence, ground
// decision, analyst, findings explorer, researcher inputs.
// =====================================================================
(function () {
  const C = window.LABEEB_CONFIG, AI = window.LabeebAI, SC = window.LabeebScene;
  const $ = (id) => document.getElementById(id);
  const eng = new window.SensorEngine();
  const STEPS = ["Detect", "Identify", "Predict", "Release", "Suppress", "Verify", "Report"];
  const TEAM = { name: "TawQ", leader: "Layal AlQahtani", members: ["Mayar Alzahrani", "Rama AlOtaibi", "Noura Alzahrani"] };

  let st = {}; // UI / sequence state
  function resetState() {
    st = { step: 0, stepT: {}, faulted: false, decisionShown: false, cmd: null, verifiedAt: null, reported: false,
      lastAnalystStep: -1, analyst: null, analystAt: 0, azureBusy: false, sceneMode: null };
  }

  // ---------- controls ----------
  function fillSelect(el, obj, val) { el.innerHTML = Object.entries(obj).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join(""); el.value = val; }
  fillSelect($("selScenario"), C.scenarios, "overheat");
  fillSelect($("selAtm"), C.atmospheres, "iss");
  fillSelect($("selGrav"), C.gravity, "micro");
  fillSelect($("selLoc"), C.locations, "moon");

  function opts() { return { scenario: $("selScenario").value, atmosphere: $("selAtm").value, gravity: $("selGrav").value, location: $("selLoc").value }; }
  function doReset() { eng.reset(opts()); eng.ventOn = $("chkVent").checked; eng.setParams(readSliders()); resetState(); hide("decision"); setEarth("STANDBY", ""); renderSteps(); }
  $("btnReset").onclick = doReset;
  $("selScenario").onchange = () => { const sc = C.scenarios[$("selScenario").value]; setSlider("heat", sc.heat_C_s); doReset(); };
  $("selGrav").onchange = $("selLoc").onchange = doReset;
  $("selAtm").onchange = () => { const a = C.atmospheres[$("selAtm").value]; setSlider("o2", a.o2); setSlider("pressure", a.pressure); doReset(); };

  // ---------- researcher inputs (sliders with scientific limits) ----------
  const SL = [
    { k: "o2", label: "Oxygen", unit: "%", min: 15, max: 40, step: 0.5, val: 21, tested: [[15, 21.5], [32.5, 35.5]],
      info: "Limits 15-40%. NASA-tested: up to 21% (BASS-II) and 34% (Exploration atmosphere). Below ~17% flames do not spread in microgravity." },
    { k: "pressure", label: "Pressure", unit: "kPa", min: 30, max: 101.3, step: 0.1, val: 101.3, tested: [[56.5, 101.3]],
      info: "Limits 30-101.3 kPa. Tested: 101.3 kPa (ISS) and 56.5 kPa (Exploration atmosphere)." },
    { k: "fanFlow", label: "Ventilation flow", unit: "cm/s", min: 0, max: 55, step: 1, val: 20, tested: [[0, 55]],
      info: "Limits 0-55 cm/s (BASS-II range). Flames quench below ~2 cm/s (SoFIE); Saffire used 20-25 cm/s." },
    { k: "heat", label: "Heating rate", unit: "°C/s", min: 1, max: 10, step: 0.1, val: 7.5, tested: [],
      info: "Fault heating rate. Design assumption (time-compressed for the demo)." },
    { k: "release", label: "Capsule release", unit: "°C", min: 80, max: 200, step: 1, val: 125, tested: [[120, 130]],
      info: "Limits 80-200 °C. Research target 120-130 °C (Liu 2024, patents 80-130 °C). Published C6F12O@Chitosan: ~200 °C." },
    { k: "damage", label: "Component damage limit", unit: "°C", min: 150, max: 250, step: 1, val: 170, tested: [],
      info: "Design assumption. Release must happen below this limit." }
  ];
  function band(d) {
    const pct = (v) => ((v - d.min) / (d.max - d.min)) * 100;
    if (!d.tested.length) return "linear-gradient(90deg,#1b3442,#1b3442)";
    const stops = ["#1b3442 0%"];
    d.tested.forEach(([a, b]) => stops.push(`#1b3442 ${pct(a)}%`, `#1f8f9c ${pct(a)}%`, `#1f8f9c ${pct(b)}%`, `#1b3442 ${pct(b)}%`));
    stops.push("#1b3442 100%");
    return `linear-gradient(90deg,${stops.join(",")})`;
  }
  $("sliders").innerHTML = SL.map(d => `<div class="sl"><div class="sl-top"><span>${d.label}<span class="info" title="${d.info}">i</span></span><span class="v" id="v-${d.k}">${d.val} ${d.unit}</span></div>
    <input type="range" id="s-${d.k}" min="${d.min}" max="${d.max}" step="${d.step}" value="${d.val}" style="background:${band(d)}">
    <div class="sl-lim"><span>${d.min}</span><span>${d.max} ${d.unit}</span></div></div>`).join("");
  function readSliders() { const o = {}; SL.forEach(d => (o[d.k] = +$("s-" + d.k).value)); return o; }
  function inTested(d, v) { return !d.tested.length || d.tested.some(([a, b]) => v >= a && v <= b); }
  function refreshSliderLabels() {
    const warn = [];
    SL.forEach(d => { const v = +$("s-" + d.k).value; const el = $("v-" + d.k); el.textContent = `${v} ${d.unit}`;
      const out = !inTested(d, v); el.classList.toggle("out", out); if (out) warn.push(d.label); });
    const p = readSliders();
    if (p.release >= p.damage) warn.push("release is above the damage limit");
    $("inWarn").textContent = warn.length ? "Outside NASA-tested range: " + warn.join(", ") : "";
  }
  function setSlider(k, v) { const el = $("s-" + k); if (el) { el.value = v; refreshSliderLabels(); } }
  SL.forEach(d => $("s-" + d.k).addEventListener("input", () => { refreshSliderLabels(); eng.setParams({ [d.k]: +$("s-" + d.k).value }); }));
  refreshSliderLabels();
  $("btnInputs").onclick = () => $("inputs").classList.toggle("hidden");
  $("inClose").onclick = () => hide("inputs");
  $("chkVent").onchange = (e) => eng.cmdVentilation(e.target.checked);
  $("btnFault").onclick = () => { if (!st.faulted) { eng.startFault($("selScenario").value); st.faulted = true; } };

  document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b));
    $("tab-monitor").classList.toggle("hidden", b.dataset.tab !== "monitor");
    $("tab-findings").classList.toggle("hidden", b.dataset.tab !== "findings");
    if (b.dataset.tab === "findings") renderFindings(true);
  });

  const show = (id) => $(id).classList.remove("hidden"), hide = (id) => $(id).classList.add("hidden");
  function setEarth(txt, cls) { $("earthState").textContent = txt; $("earthBadge").className = "earth " + (cls || ""); }

  // ---------- settings ----------
  $("btnSettings").onclick = () => { const s = AI.settings(); $("sEndpoint").value = s.endpoint || ""; $("sDeploy").value = s.deployment || ""; $("sKey").value = s.key || ""; $("sVer").value = s.apiVersion || "2025-04-01-preview"; $("sMsg").textContent = ""; show("settings"); };
  $("sClose").onclick = () => hide("settings");
  // Accepts either a bare endpoint (https://x.openai.azure.com) or the full "Target URI" copied from Foundry.
  function parseTarget(raw, dep, ver) {
    const out = { endpoint: raw.trim(), deployment: dep.trim(), apiVersion: ver.trim() || "2025-04-01-preview", v1: false };
    try {
      const u = new URL(raw.trim());
      out.endpoint = u.origin;
      const m = u.pathname.match(/\/openai\/deployments\/([^/]+)/);
      if (m) out.deployment = decodeURIComponent(m[1]);
      if (/\/openai\/v1\//.test(u.pathname) || /\/models\/chat\/completions/.test(u.pathname)) out.v1 = true;
      const av = u.searchParams.get("api-version"); if (av) out.apiVersion = av;
    } catch (e) {}
    return out;
  }
  const readSettings = () => { const t = parseTarget($("sEndpoint").value, $("sDeploy").value, $("sVer").value);
    $("sEndpoint").value = t.endpoint; if (t.deployment) $("sDeploy").value = t.deployment; $("sVer").value = t.apiVersion;
    return { ...t, key: $("sKey").value.trim() }; };
  $("sSave").onclick = () => { AI.saveSettings(readSettings()); $("sMsg").textContent = "Saved."; updateEngineLabel(); };
  $("sTest").onclick = async () => {
    AI.saveSettings(readSettings()); $("sMsg").textContent = "Testing…";
    try { const s = eng.snapshot(); const r = AI.risk(s); await AI.azureAnalyst(s, 0, r, {}, AI.rankFindings(s, 0)); $("sMsg").textContent = "✓ Azure OpenAI responded."; }
    catch (e) { $("sMsg").textContent = "✗ " + e.message + " (offline rules will be used)"; }
    updateEngineLabel();
  };
  function updateEngineLabel() { const s = AI.settings(); $("aEngine").textContent = s.key ? `SI: Azure OpenAI · ${s.deployment}` : "SI: offline rules (configure ⚙ SI)"; }

  // ---------- sequence logic ----------
  function advance(s, r) {
    const z = s.zones.find(q => q.id === s.faultZone);
    const set = (n) => { if (st.step < n) { st.step = n; st.stepT[n] = s.t; } };
    if (!st.faulted) return;
    if (st.step < 1 && (r.pct >= 12 || s.co > 4 || s.particles > 15 || z.rate > 1.2)) set(1);
    if (st.step === 1 && s.t - st.stepT[1] > 1.5) set(2);
    if (st.step === 2 && s.t - st.stepT[2] > 1.5) set(3);
    if (st.step === 3 && !st.decisionShown && !z.released) openDecision(s, 1);
    // second chance: agent released but the heat source is still powered -> suppression is only temporary
    if ((st.step >= 5 || (st.rejected && s.co > 15 && !z.released)) && z.powerOn && !st.decision2 && (!st.cmd || st.cmd.done) && $("decision").classList.contains("hidden") && s.t - (st.step >= 5 ? st.stepT[5] : st.decisionAt) > 3) { st.decision2 = true; st.cmd = null; openDecision(s, z.released ? 2 : 3); }
    if (s.zones.some(q => q.released)) set(4);
    if (st.step >= 4 && (z.rate < -0.3 || s.zones.some(q => q.suppressant > 0.1))) set(5);
    const calm = z.T < C.microcapsules.verify_T_C && s.co < C.microcapsules.verify_CO_ppm && !s.burning && !s.residual;
    const acted = s.zones.some(q => q.released) || !z.powerOn;
    if (st.step >= 3 && acted && calm) { set(6); if (!st.verifiedAt) st.verifiedAt = s.t; }
    if (st.step === 6 && s.t - st.verifiedAt > 2) { set(7); }
    if (st.step === 7 && !st.reported) { st.reported = true; }
    if (st.decisionShown && $("chkDemo").checked && !st.cmd && !$("decision").classList.contains("hidden") && s.t - st.decisionAt > 2.5) approve();
  }

  // ---------- ground decision ----------
  function openDecision(s, mode) {
    st.decisionShown = true; st.decisionAt = s.t; st.decisionMode = mode;
    const z = s.zones.find(q => q.id === s.faultZone);
    st.acts = AI.recommend(s);
    $("dTitle").textContent = (mode === 2 ? "⚠ Heat source still on · " : mode === 3 ? "⚠ CO rising · " : "⚠ Fire risk detected · ") + z.name;
    setEarth("AWAITING DECISION", "warn"); show("decision"); updateDecisionTimer();
  }
  function updateDecisionTimer() {
    if ($("decision").classList.contains("hidden")) return;
    const s = eng.snapshot(), z = s.zones.find(q => q.id === s.faultZone), r = AI.risk(s);
    $("dBody").textContent = `${z.T.toFixed(0)} °C ${z.rate >= 0 ? "rising" : "falling"} · CO ${s.co.toFixed(0)} ppm · Risk ${r.pct}% ${r.label}`;
  }
  function approve() {
    const ids = (st.acts || []).map(a => a.id);
    hide("decision");
    const rtt = C.locations[eng.opts.location].rtt_s;
    st.cmd = { ids, sentAt: eng.t, arriveAt: eng.t + rtt, done: false };
    eng.log("cmd", `Ground approved: ${ids.join(", ")} · in transit ${rtt} s`);
  }
  $("dApprove").onclick = approve;
  $("dReject").onclick = () => { hide("decision"); st.rejected = true; eng.log("cmd", "Ground rejected - passive layer on watch"); setEarth("PASSIVE MODE", "warn"); };
  function processCommand() {
    if (!st.cmd || st.cmd.done) return;
    const left = st.cmd.arriveAt - eng.t;
    if (left > 0) { setEarth(`COMMAND IN TRANSIT · ${left >= 120 ? (left / 60).toFixed(0) + " min" : left.toFixed(1) + " s"}`, "warn"); return; }
    const fz = eng.faultZone().id;
    for (const id of st.cmd.ids) { if (id === "vent") { eng.cmdVentilation(false); $("chkVent").checked = false; } if (id === "power") eng.cmdCutPower(fz); if (id === "release") eng.cmdRelease(fz); }
    st.cmd.done = true; setEarth("COMMAND EXECUTED", "ok");
  }

  // ---------- analyst ----------
  async function updateAnalyst(s, r, force) {
    const z = s.zones.find(q => q.id === s.faultZone);
    const eta = { release: z.etaRelease, decomp: z.etaDecomp };
    const local = AI.localAnalyst(s, st.step, r, eta);
    // ask the model again when the phase, the risk level or the flame state changes
    const aKey = `${st.step}|${r.label}|${s.burning}`;
    const useAzure = AI.settings().key && aKey !== st.lastAnalystKey && !st.azureBusy && st.faulted;
    // offline analysis: keep its citations inside the top-5 the table marks as "sent to SI"
    if (!(st.analystAzure && st.analystAzureStep === st.step)) {
      const top5 = AI.rankFindings(s, st.step).slice(0, 5).map(x => x.f.id);
      const keep = (local.cites || []).filter(id => top5.includes(id));
      local.cites = keep.length ? keep : top5.slice(0, 2);
    }
    st.analyst = st.analystAzure && st.analystAzureStep === st.step ? st.analystAzure : local;
    if (useAzure) {
      st.lastAnalystKey = aKey; st.azureBusy = true;
      const reqStep = st.step;
      const rankedNow = AI.rankFindings(s, st.step);
      AI.azureAnalyst(s, st.step, r, eta, rankedNow)
        .then(o => { if (reqStep !== st.step) return;            // stale answer from an earlier phase: ignore
          st.analystAzure = o; st.analystAzureStep = reqStep; st.analystRank = rankedNow; $("aEngine").textContent = `SI: Azure OpenAI · ${AI.settings().deployment} · live`; })
        .catch(e => { $("aEngine").textContent = `SI: offline rules (Azure: ${e.message})`; })
        .finally(() => { st.azureBusy = false; });
    }
    const a = st.analyst;
    $("aTitle").textContent = a.title; $("aTitle").className = "a-title " + (a.tone || "ok");
    $("aBody").textContent = a.body;
    const citesHtml = (a.cites || []).map(id => `<span class="chip" data-id="${id}" title="${AI.byId[id] ? AI.byId[id].experiment : id}">NASA · ${id}</span>`).join("");
    if ($("aCites").innerHTML !== citesHtml) { $("aCites").innerHTML = citesHtml; renderFindings(true); }   // keep table in step with the analysis
  }
  $("aCites").onclick = (e) => { const id = e.target.dataset && e.target.dataset.id; if (id) { document.querySelector('.tab[data-tab="findings"]').click(); openRows.add(id); renderFindings(true); setTimeout(() => { const el = document.querySelector(`tr.row[data-id="${id}"]`); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 50); } };

  // ---------- render dashboard ----------
  function renderSteps() {
    $("steps").innerHTML = STEPS.map((l, i) => {
      const n = i + 1; let cls = "step";
      if (n < st.step) cls += " done";
      if (n === st.step) cls += n === 3 ? " alert" : n === 6 ? " amber" : " on";
      return `<div class="${cls}"><div class="n">${n}</div><div class="l">${l}</div></div>`;
    }).join("");
  }
  const fmt = (v, d) => v.toFixed(d);
  function renderUI(s, r, c) {
    const setK = (id, v, warn, bad) => { $(id).textContent = v; $(id).closest(".kpi").className = "kpi" + (bad ? " bad" : warn ? " warn" : ""); };
    setK("kT", fmt(s.temp, 1), s.temp > 60, s.temp > eng.params.release);
    setK("kCO", fmt(s.co, 1), s.co > 6, s.co > 35);
    setK("kP", fmt(s.particles, 0), s.particles > 15, s.particles > 60);
    setK("kO2", fmt(s.o2, 2), false, false);
    setK("kPr", fmt(s.pressure, 2), false, false);
    setK("kS", fmt(s.strain, 0), s.strain > 200, s.strain > 260);
    $("conf").textContent = `CONFIDENCE ${c.pct}%`; $("conf").title = "NASA data coverage:\n- " + c.why.join("\n- ");
    $("aBar").style.width = r.pct + "%";
    $("zoneBody").innerHTML = s.zones.map(z => {
      const rel = z.released ? "-" : isFinite(z.etaRelease) && z.rate > 0.4 && z.T > 35 ? z.etaRelease.toFixed(1) + " s" : "-";
      return `<tr><td>${z.name}</td><td class="num">${fmt(z.T, 0)} °C</td><td class="num">${z.rate >= 0 ? "+" : ""}${fmt(z.rate, 1)}</td><td class="num">${rel}</td><td class="st-${z.state}">${z.state}</td></tr>`;
    }).join("");
    $("events").innerHTML = eng.events.slice(-6).reverse().map(e => `<div><b>T+${e.t.toFixed(1)}s</b> ${e.msg}</div>`).join("");
    const z = s.zones.find(q => q.id === s.faultZone);
    $("chartTitle").textContent = `${z.name} temperature and forecast`;
    $("caption").textContent = caption(s, z);
    renderSteps();
    if (!$("decision").classList.contains("hidden")) updateDecisionTimer();
    if (z.released && (!st.cmd || st.cmd.done) && st.step < 6 && $("decision").classList.contains("hidden") && $("earthState").textContent !== "COMMAND EXECUTED") setEarth("RELEASE CONFIRMED", "ok");
    if (st.step >= 6 && !st.sceneMode) setEarth("SAFE · VERIFIED", "ok");
  }
  function caption(s, z) {
    if (!st.faulted) return `${C.gravity[s.opts.gravity].label} · all systems nominal`;
    if (s.burning) return "Spherical blue flame: no buoyancy in microgravity";
    if (st.step >= 6) return "Suppression verified. The sample canister is untouched";
    if (z.released) return z.everBurned ? "Microcapsules release and put out the fire" : "Microcapsules released before the component damage limit";
    if (st.step >= 1) return "SI detects abnormal heating and forecasts the release point";
    return "Fault developing…";
  }

  // ---------- findings explorer: one ranked table, click a row for details ----------
  const ATTRS = [["objective", "Objective"], ["hardware", "Hardware"], ["fuel", "Fuel / sample"], ["o2", "Oxygen"], ["flow", "Airflow"], ["pressure", "Pressure"], ["gravity", "Gravity"], ["measurements", "Sensors / measurements"]];
  const esc = (t) => String(t == null ? "" : t).replace(/</g, "&lt;");
  const openRows = new Set();
  function numLabel(k, v) {
    const units = [["_pct", "%"], ["_cm_s", " cm/s"], ["_mm_s", " mm/s"], ["_kPa", " kPa"], ["_kW", " kW"], ["_ppm", " ppm"], ["_nm", " nm"]];
    let u = ""; for (const [suf, un] of units) if (k.includes(suf)) { u = un; k = k.replace(suf, ""); }
    k = k.replace(/_/g, " ").replace(/\b(co|o2|iss|ea|pmma|cfi g|loi)\b/gi, (m) => m.toUpperCase()).replace(/^./, (c) => c.toUpperCase());
    return `${k}: ${Array.isArray(v) ? v.join("–") : v}${u}`;
  }
  $("fBody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr.row"); if (!tr || e.target.closest("a")) return;
    const id = tr.dataset.id; openRows.has(id) ? openRows.delete(id) : openRows.add(id); renderFindings(true);
  });
  let lastFindingsRender = 0;
  function renderFindings(force) {
    if ($("tab-findings").classList.contains("hidden")) return;
    const now = performance.now(); if (!force && now - lastFindingsRender < 1500) return; lastFindingsRender = now;
    const s = eng.snapshot();
    const PH = ["Monitoring", "Detect", "Identify", "Predict", "Release", "Suppress", "Verify", "Report"];
    // The table always shows the exact ranking behind the analysis on screen.
    // Live AI analysis -> the ranking sent with it. Offline -> live ranking, frozen after Report.
    const usingAzure = !!(st.analystAzure && st.analystAzureStep === st.step && st.analystRank);
    let r;
    if (usingAzure) r = st.analystRank;
    else if (st.step >= 7) { if (!st.frozenRank) st.frozenRank = AI.rankFindings(s, st.step); r = st.frozenRank; }
    else r = AI.rankFindings(s, st.step);
    $("fPhase").textContent = st.faulted ? `· Ranked for: ${PH[st.step]} phase${st.step >= 7 ? " (frozen)" : ""} · ▍ sent to SI` : "";
    const sent = new Set(r.slice(0, 5).map(x => x.f.id));
    const cited = new Set((st.analyst && st.analyst.cites) || []);
    $("fBody").innerHTML = r.map((x, i) => {
      const f = x.f, open = openRows.has(f.id);
      let html = `<tr class="row ${open ? "open" : ""} ${sent.has(f.id) ? "sent" : ""}" data-id="${f.id}" title="${sent.has(f.id) ? "Sent to the SI model" : ""}">
        <td class="rk">${i + 1}</td>
        <td class="nm"><b>${esc(f.experiment)}${cited.has(f.id) ? '<span class="cited">Cited by SI</span>' : ""}</b><span>${esc(f.platform)}</span></td>
        <td class="rel">${x.rel}%<span class="bar"><i style="width:${x.rel}%"></i></span></td>
        <td class="sm">${esc(f.o2_s)}</td><td class="sm">${esc(f.flow_s)}</td><td class="sm">${esc(f.g_s)}</td>
        <td class="kf">${esc(f.short)}</td><td class="chev">${open ? "▴" : "▾"}</td></tr>`;
      if (open) {
        const nums = Object.entries(f.numbers || {}).map(([k, v]) => `<span class="chip">${numLabel(k, v)}</span>`).join(" ");
        const why = x.matched.length ? `Relevant now because: <b>${x.matched.join(", ").replace(/_/g, " ")}</b>. ${f.sim_use}` : f.sim_use;
        html += `<tr class="det"><td></td><td colspan="7"><div class="det-grid">
          <div><div class="f-sec">Summary</div><div class="f-txt">${f.key_finding}</div>
            <div class="f-sec" style="margin-top:8px">Interpretation for Labeeb</div><div class="f-why">${why}</div>
            <div class="f-txt" style="margin-top:6px"><b>Fire-safety implication:</b> ${f.safety_implication}</div>
            ${nums ? `<div class="f-nums" style="margin-top:8px">${nums}</div>` : ""}</div>
          <div><dl class="f-attr">${ATTRS.map(([k, l]) => f[k] ? `<dt>${l}</dt><dd>${esc(f[k])}</dd>` : "").join("")}</dl>
            <div class="f-src" style="margin-top:8px">${f.sources.map(u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).join("")}</div></div>
        </div></td></tr>`;
      }
      return html;
    }).join("");
  }
  $("btnExport").onclick = () => {
    const rows = [["id", "experiment", "platform", "years", "objective", "hardware", "fuel", "o2", "flow", "pressure", "gravity", "measurements", "key_finding", "key_numbers", "used_in_simulation_as", "sources"]];
    for (const f of window.NASA_KB.findings) rows.push([f.id, f.experiment, f.platform, f.years, f.objective, f.hardware, f.fuel, f.o2, f.flow, f.pressure, f.gravity, f.measurements, f.short,
      Object.entries(f.numbers || {}).map(([k, v]) => k + "=" + (Array.isArray(v) ? v.join("-") : v)).join("; "), f.sim_use, f.sources.join(" ")]);
    const csv = rows.map(r => r.map(v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = "labeeb_nasa_investigations.csv"; a.click();
  };

  // ---------- twin: click a part to see its material ----------
  let inspectKey = null;
  function renderInspect(s) {
    const box = $("inspect"); if (!inspectKey) { box.classList.add("hidden"); return; }
    const p = SC.PARTS[inspectKey]; const z = p.zone ? s.zones.find(q => q.id === p.zone) : null;
    const row = (k, v) => `<div class="ir"><span>${k}</span><b>${v}</b></div>`;
    let html = `<div class="ih"><b>${z ? z.name : p.name}</b><button id="iClose" title="Close">✕</button></div>`;
    html += row("Material", z ? z.material : p.material) + row("Function", p.fn);
    if (z) {
      const eta = z.released ? "-" : isFinite(z.etaRelease) && z.rate > 0.4 && z.T > 35 ? z.etaRelease.toFixed(1) + " s" : "-";
      html += row("Temperature", `${fmt(z.T, 1)} °C`) + row("Rate", `${z.rate >= 0 ? "+" : ""}${fmt(z.rate, 1)} °C/s`)
        + row("Release at", `${z.release_C} °C`) + row("Release in", eta) + row("Microcapsules", z.released ? "Released" : "Armed");
    } else html += row("Monitoring", "Not a monitored zone");
    box.innerHTML = html; box.classList.remove("hidden");
    $("iClose").onclick = (e) => { e.stopPropagation(); inspectKey = null; renderInspect(s); };
  }
  $("twin").addEventListener("click", (e) => {
    const r = $("twin").getBoundingClientRect();
    inspectKey = SC.hitTwin(e.clientX - r.left, e.clientY - r.top);
    renderInspect(eng.snapshot());
  });
  $("twin").addEventListener("mousemove", (e) => {
    const r = $("twin").getBoundingClientRect();
    $("twin").style.cursor = SC.hitTwin(e.clientX - r.left, e.clientY - r.top) ? "pointer" : "default";
  });

  // ---------- main loop ----------
  let last = performance.now(), acc = 0, uiAcc = 0, rr = { pct: 0, label: "NOMINAL" };
  function frame(now) {
    const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
    const speed = +$("selSpeed").value;
    acc += dtReal * speed * C.timeScale;
    while (acc >= 0.05) { eng.step(0.05); acc -= 0.05; }
    processCommand();
    const s = eng.snapshot();
    SC.drawTwin($("twin"), s, now / 1000, inspectKey);
    if (inspectKey && uiAcc + dtReal > C.tick_ms / 1000) renderInspect(s);
    uiAcc += dtReal;
    if (uiAcc > C.tick_ms / 1000) {
      uiAcc = 0;
      rr = AI.risk(s); const c = AI.confidence(s);
      advance(s, rr); renderUI(s, rr, c); updateAnalyst(s, rr);
      const z = s.zones.find(q => q.id === s.faultZone);
      SC.drawChart($("chart"), eng.history, z, z.rate); SC.drawGauge($("gauge"), rr);
      renderFindings(false);
    }
    requestAnimationFrame(frame);
  }

  // expose for testing / console
  window.LabeebApp = { eng, get state() { return st; }, approve };
  doReset(); updateEngineLabel(); requestAnimationFrame(frame);
})();
