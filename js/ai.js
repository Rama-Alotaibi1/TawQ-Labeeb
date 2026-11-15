// =====================================================================
// Labeeb - SI layer
//  1) Risk score      : deterministic, explainable (no training)
//  2) Confidence      : how well NASA data covers the current conditions
//  3) Findings ranking: summarize / rank / interpret NASA microgravity findings
//  4) Analyst text    : Azure OpenAI (if configured) with offline fallback
// =====================================================================
(function () {
  const C = window.LABEEB_CONFIG;
  const KB = window.NASA_KB.findings;
  const byId = Object.fromEntries(KB.map(f => [f.id, f]));
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  // ---------- 1. Risk ----------
  function risk(s) {
    const z = s.zones.find(q => q.id === s.faultZone);
    const rT = clamp((z.T - 40) / (z.decomp_C - 40));
    const rRate = clamp(z.rate / 8);
    const rCO = clamp((s.co - 2) / 40);               // Saffire IV-VI: CO is the leading hazard
    const rP = clamp((s.particles - 8) / 80);         // SAME: pre-fire smoke
    const rF = s.burning ? 1 : (s.residual ? 0.35 : 0);
    let r = 1 - (1 - 0.55 * rT) * (1 - 0.35 * rRate) * (1 - 0.6 * rCO) * (1 - 0.3 * rP) * (1 - 0.85 * rF);
    const o2f = s.sustainable ? clamp(0.75 + (s.o2 - s.loi) / 40, 0.75, 1.15) : 0.7;  // BASS-II margin
    const supp = z.released ? (1 - 0.4 * z.suppressant) : 1;
    r = clamp(r * o2f * supp);
    const pct = Math.round(r * 100);
    const label = pct < 15 ? "NOMINAL" : pct < 40 ? "STANDBY" : pct < 70 ? "HIGH" : "CRITICAL";
    return { pct, label, parts: { rT, rRate, rCO, rP, rF, o2f } };
  }

  // ---------- 2. Confidence = NASA data coverage ----------
  function confidence(s) {
    let c = 0.96; const why = [];
    const p = s.params || {};
    const o2 = p.o2 != null ? p.o2 : s.o2;
    const nearEA = Math.abs(o2 - 34) <= 1.5, inBass = o2 >= 15 && o2 <= 21.5;
    if (!inBass && !nearEA) { c -= 0.15; why.push("O2 outside NASA-tested values (BASS-II ≤21%, Exploration atmosphere 34%)"); }
    else if (nearEA) { c -= 0.08; why.push("34% O2: covered by Saffire IV-VI exploration-atmosphere tests, not by BASS-II"); }
    if (p.pressure != null && (p.pressure < 56 || p.pressure > 102)) { c -= 0.06; why.push("Pressure outside tested range (56.5-101.3 kPa)"); }
    if (p.release != null && (p.release < 120 || p.release > 130)) { why.push("Release temperature outside the 120-130 °C research window"); }
    if (p.heat != null) { why.push("Heating rate set manually (assumption)"); }
    if (s.opts.gravity !== "micro") { c -= 0.25; why.push("No flight data yet for partial gravity (FM2 pending)"); }
    if (s.opts.scenario === "smolder") { c -= 0.05; why.push("Smoldering source: SAME covers smoke, not long smolder"); }
    why.push("Material thresholds are team assumptions (reference pending)");
    c -= 0.06;
    return { pct: Math.round(clamp(c, 0.3, 0.96) * 100), why };
  }

  // ---------- 3. Rank NASA findings for the current situation ----------
  function rankFindings(s, step) {
    const w = {};
    const add = (tags, v) => tags.forEach(t => (w[t] = (w[t] || 0) + v));
    add(["response_procedure"], 0.4);
    if (s.co > 4) add(["CO", "combustion_products", "detection"], 1.2);
    if (s.particles > 12) add(["smoke", "particles", "pre_fire", "electronics", "detection"], 1.0);
    if (s.burning) add(["flame_spread", "airflow", "large_scale", "vehicle_impact"], 1.3);
    if (s.ventOn && (s.burning || s.co > 4)) add(["airflow", "suppression_by_flow_reduction"], 0.8);
    if (s.o2 > 22) add(["exploration_atmosphere", "oxygen", "scenario_range", "high_oxygen"], 1.2);
    if (s.o2 > 50) add(["high_oxygen", "gaseous_flames"], 1.5);
    else add(["oxygen", "flammability_limit"], 0.4);
    if (s.opts.gravity !== "micro") add(["partial_gravity", "lunar", "test_method"], 1.6);
    if (s.particles > 12) add(["instrument"], 0.6);
    if (step >= 4) add(["suppression", "extinction", "diluent"], 1.0);
    if (step >= 5) add(["cool_flames", "extinction"], 1.0);
    if (step >= 2) add(["response_procedure", "power"], 0.6);
    const scored = KB.map(f => {
      const matched = f.tags.filter(t => w[t]);
      let score = matched.reduce((a, t) => a + w[t], 0);
      return { f, score, matched };
    }).sort((a, b) => b.score - a.score);
    const max = scored[0].score || 1;
    return scored.map(x => ({ ...x, rel: Math.round((x.score / max) * 100) }));
  }

  // ---------- recommended actions (ISS-FDS order, NASA-backed) ----------
  function recommend(s) {
    const z = s.zones.find(q => q.id === s.faultZone);
    const acts = [];
    if (s.ventOn) acts.push({ id: "vent", label: "Stop ventilation in electronics bay", why: "Airflow feeds microgravity flames; quench below ~2 cm/s", src: ["SAFFIRE-I-III", "SOFIE", "ISS-FDS"] });
    if (z.powerOn) acts.push({ id: "power", label: `Remove power from ${z.name}`, why: "Isolate the ignition source (ISS fire response step 2)", src: ["ISS-FDS"] });
    if (!z.released) acts.push({ id: "release", label: "Pre-trigger microcapsules (local heater)", why: "Release agent before the component damage limit", src: ["FLEX"] });
    return acts;
  }

  // ---------- 4. Analyst text: offline rules ----------
  function localAnalyst(s, step, r, eta) {
    const z = s.zones.find(q => q.id === s.faultZone);
    const f = (x) => (isFinite(x) ? x.toFixed(1) + " s" : "—");
    if (step === 0) return { title: "All zones nominal", tone: "ok",
      body: `Cabin ${s.o2.toFixed(1)}% O2, ventilation ${s.flow.toFixed(0)} cm/s. Monitoring CO first: Saffire IV-VI showed CO rises before temperature in spacecraft fires.`, cites: ["SAFFIRE-IV-VI"] };
    if (s.burning) return { title: `Flame in ${z.name}`, tone: "bad",
      body: `Spherical microgravity flame spreading ~${s.spread_mm_s.toFixed(1)} mm/s at ${s.flow.toFixed(0)} cm/s flow. Stopping ventilation would drop flow below the ~2 cm/s quench limit.`, cites: ["SAFFIRE-I-III", "SOFIE"] };
    if (step <= 3 && !z.released) {
      const lead = s.co > 4 && z.T < 90 ? `CO up to ${s.co.toFixed(0)} ppm while temperature is only ${z.T.toFixed(0)} °C - early warning from gas, not heat. ` : "";
      return { title: `Overheating: damage risk in ${z.name}`, tone: "warn",
        body: `${lead}Rising ${z.rate.toFixed(1)} °C/s. Release target ${z.release_C} °C in ${f(eta.release)}, component damage limit ${z.decomp_C} °C in ${f(eta.decomp)}. Flame would ${s.sustainable ? "be sustainable" : "NOT be sustainable"} (O2 ${s.o2.toFixed(1)}% vs limit ${s.loi.toFixed(0)}%, flow ${s.flow.toFixed(0)} cm/s).`,
        cites: ["BASS-II", "SAFFIRE-IV-VI", "SAME"] };
    }
    if (z.released && z.state === "Suppressing") return { title: "Suppression in progress", tone: "ok",
      body: `Capsules released. Zone cooling at ${Math.abs(z.rate).toFixed(1)} °C/s, CO ${s.co.toFixed(0)} ppm. Verified when temperature < ${C.microcapsules.verify_T_C} °C and CO < ${C.microcapsules.verify_CO_ppm} ppm (FLEX: flames can persist invisibly).`, cites: ["FLEX"] };
    if (step >= 6) return { title: "Suppression verified", tone: "ok",
      body: `Temperature ${z.T.toFixed(0)} °C, CO ${s.co.toFixed(1)} ppm. Sample canister isolated. Post-event: check for HF from agent decomposition before re-powering.`, cites: ["SAFFIRE-IV-VI", "FLEX"] };
    return { title: "Monitoring", tone: "ok", body: `CO ${s.co.toFixed(1)} ppm, ${z.name} ${z.T.toFixed(0)} °C.`, cites: [] };
  }

  // ---------- 4b. Azure OpenAI ----------
  function settings() {
    try { return JSON.parse(localStorage.getItem("labeeb_ai") || "{}"); } catch (e) { return {}; }
  }
  function saveSettings(o) { try { localStorage.setItem("labeeb_ai", JSON.stringify(o)); } catch (e) {} }

  async function azureAnalyst(s, step, r, eta, ranked) {
    const st = settings();
    if (!st.endpoint || !st.key || !st.deployment) throw new Error("not configured");
    const kb = ranked.slice(0, 5).map(x => ({ id: x.f.id, finding: x.f.key_finding, implication: x.f.safety_implication }));
    const sys = "You are the SI fire-safety analyst of Labeeb, a capsule electronics-bay protection system. " +
      "Use ONLY the NASA findings provided. Be concise (max 55 words in body). Cite finding ids. " +
      "Follow the 'status' field. If status.resolved is true (phases Verify/Report) the event is over: tone must be 'ok', " +
      "the title states the outcome (e.g. 'Suppression verified'), and the body summarizes what happened plus the post-event check (e.g. HF). " +
      "Do not raise new alarms unless status.flame_visible is true or co_ppm is above 6. " +
      "Return strict JSON: {\"title\": str (max 8 words), \"tone\": \"ok\"|\"warn\"|\"bad\", \"body\": str, \"cites\": [ids]}";
    const PH = ["Monitoring", "Detect", "Identify", "Predict", "Release", "Suppress", "Verify", "Report"];
    const zf = s.zones.find(q => q.id === s.faultZone);
    const status = { phase: PH[step] || "Monitoring", resolved: step >= 6 && !s.burning, flame_visible: s.burning,
      capsules_released: !!(zf && zf.released), power_isolated: !!(zf && !zf.powerOn), verify_rule: "T < 45 °C and CO < 6 ppm" };
    const user = JSON.stringify({ response_step: step, status, risk: r, eta_s: eta, sensors: {
      T: s.temp, zone: s.faultZone, co_ppm: s.co, particles: s.particles, o2_pct: s.o2, flow_cm_s: s.flow,
      flame_sustainable: s.sustainable, burning: s.burning, ventilation: s.ventOn, gravity: s.opts.gravity },
      zones: s.zones.map(z => ({ id: z.id, T: Math.round(z.T), state: z.state })), nasa_findings: kb });
    const base = st.endpoint.replace(/\/+$/, "");
    const url = st.v1 ? `${base}/openai/v1/chat/completions`
      : `${base}/openai/deployments/${encodeURIComponent(st.deployment)}/chat/completions?api-version=${st.apiVersion || "2025-04-01-preview"}`;
    const messages = [{ role: "system", content: sys }, { role: "user", content: user }];
    // Try classic chat params first (gpt-4.1 family); if the model rejects them (gpt-5 family / reasoning
    // models need max_completion_tokens and no temperature), retry automatically.
    const bodies = [
      { messages, temperature: 0.2, max_tokens: 300, response_format: { type: "json_object" } },
      { messages, max_completion_tokens: 2000, response_format: { type: "json_object" } }
    ];
    if (st.v1) bodies.forEach(b => (b.model = st.deployment));
    // Route: direct to Azure, or through the local relay (tools/serve.py) when the page is served by it.
    const viaLocal = location.protocol.startsWith("http") && (location.port === "8000" || st.useProxy);
    async function send(body, signal, proxy) {
      if (proxy) return fetch("/proxy/azure", { method: "POST", signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: base, deployment: st.deployment, apiVersion: st.apiVersion || "2025-04-01-preview", v1: !!st.v1, key: st.key, body }) });
      return fetch(url, { method: "POST", signal, headers: { "Content-Type": "application/json", "api-key": st.key }, body: JSON.stringify(body) });
    }
    let j = null, lastErr = "";
    for (const body of bodies) {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000);
      try {
        let res;
        try { res = await send(body, ctl.signal, viaLocal); }
        catch (e) { if (!viaLocal && location.protocol.startsWith("http") && e.name !== "AbortError") res = await send(body, ctl.signal, true); else throw e; }
        clearTimeout(to);
        if (res.ok) { j = await res.json(); break; }
        let detail = ""; try { const eb = await res.json(); detail = (eb.error && (eb.error.message || eb.error)) || ""; } catch (_) {}
        lastErr = "HTTP " + res.status + (detail ? " · " + String(detail).slice(0, 120) : "");
        if (res.status !== 400) break;           // only a parameter error is worth a retry
      } catch (e) { clearTimeout(to); lastErr = e.name === "AbortError" ? "timeout" : e.message; break; }
    }
    if (!j) throw new Error(lastErr);
    const out = JSON.parse(j.choices[0].message.content);
    const sentIds = new Set(kb.map(k => k.id));                // only accept experiments the model was given
    out.cites = (out.cites || []).filter(id => byId[id] && sentIds.has(id));
    if (status.resolved) out.tone = "ok";                      // guard: never alarm after verification
    return out;
  }

  window.LabeebAI = { risk, confidence, rankFindings, recommend, localAnalyst, azureAnalyst, settings, saveSettings, byId };
})();
