// =====================================================================
// Labeeb - Virtual sensor engine (physics-lite, NASA-calibrated)
// Emits the same record a real sensor bus would:
//   { t, zones:[{id,T,rate,state}], co, particles, o2, pressure, strain }
// Swap this module for a real sensor adapter and the dashboard is unchanged.
// =====================================================================
(function () {
  const C = window.LABEEB_CONFIG;
  const P = C.physics;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const noise = (s) => (Math.random() - 0.5) * 2 * s;

  class SensorEngine {
    constructor() { this.reset(); }

    reset(opts = {}) {
      const atm = C.atmospheres[opts.atmosphere || "iss"];
      this.opts = Object.assign({ atmosphere: "iss", gravity: "micro", location: "moon", scenario: "overheat" }, opts);
      this.t = 0;
      this.ventOn = true;
      this.events = [];
      this.fault = null;
      this.co = 1.2; this.particles = 5; this.o2 = atm.o2; this.o2Base = atm.o2;
      this.pBase = atm.pressure; this.pressure = atm.pressure;
      this.residualCO = 0;   // FLEX "cool flame" style invisible residual burning
      this.zones = C.zones.map(z => ({
        ...z, T: C.compartment.ambientC + noise(1), rate: 0, hist: [],
        powerOn: true, burning: false, released: false, suppressant: 0,
        state: "Stable", everBurned: false
      }));
      this.history = []; // power/fault zone temperature history for the chart
      this.params = { o2: atm.o2, pressure: atm.pressure, fanFlow: P.baseFlow_cm_s, heat: null,
        release: C.zones[0].release_C, damage: C.zones[0].decomp_C };
    }

    // researcher inputs (live, no reset needed)
    setParams(p) {
      Object.assign(this.params, p);
      if ("o2" in p) { this.o2 += p.o2 - this.o2Base; this.o2Base = p.o2; }
      if ("pressure" in p) { this.pBase = p.pressure; }
      if ("release" in p || "damage" in p) for (const z of this.zones) { z.release_C = this.params.release; z.decomp_C = this.params.damage; }
    }

    setOption(k, v) {
      this.opts[k] = v;
      if (k === "atmosphere") {
        const atm = C.atmospheres[v];
        this.o2Base = atm.o2; this.o2 = atm.o2; this.pBase = atm.pressure; this.pressure = atm.pressure;
      }
    }

    startFault(scenarioKey) {
      const s = C.scenarios[scenarioKey || this.opts.scenario];
      this.opts.scenario = scenarioKey || this.opts.scenario;
      this.fault = { ...s, t0: this.t, active: true };
      this.log("fault", `Fault injected: ${s.label}`);
    }

    // --- ground commands (arrive after round-trip delay; handled in app) ---
    cmdVentilation(on) { this.ventOn = on; this.log("cmd", on ? "Ventilation restored" : "Ventilation OFF (ground command)"); }
    cmdCutPower(zoneId) {
      const z = this.zone(zoneId); if (z) { z.powerOn = false; this.log("cmd", `Power removed from ${z.name}`); }
    }
    cmdRelease(zoneId) {
      const z = this.zone(zoneId); if (z && !z.released) this.release(z, "commanded (heater pre-trigger)");
    }

    zone(id) { return this.zones.find(z => z.id === id); }
    faultZone() { return this.fault ? this.zone(this.fault.zone) : this.zone("power"); }

    log(type, msg) { this.events.push({ t: this.t, type, msg }); }

    release(z, how) {
      z.released = true; z.suppressant = 1;
      this.log("release", `Microcapsules released in ${z.name} at ${z.T.toFixed(0)} °C (${how})`);
    }

    // --- NASA-anchored combustion rules ---
    effectiveFlow() {
      const g = C.gravity[this.opts.gravity];
      return (this.ventOn ? this.params.fanFlow : 0) + g.buoyantFlow_cm_s;          // Saffire: forced flow drives the fire
    }
    loi(z) {
      const base = this.opts.gravity === "micro" ? P.loiMicro_pct : P.loi1g_pct; // BASS-II: 17% ug vs 18% 1g
      return base + 14 * (z ? z.suppressant : 0);                                 // agent dilution raises the limit
    }
    sustainable(z) {
      const flow = this.effectiveFlow();
      if (flow < P.quenchFlow_cm_s) return false;                                // SoFIE: quench below ~2 cm/s
      return this.o2 > this.loi(z);
    }
    spreadFactor(z) {
      const flow = this.effectiveFlow();
      const o2m = clamp((this.o2 - this.loi(z)) / 4, 0, 4);
      return (flow / P.baseFlow_cm_s) * o2m;                                       // spread ~ flow (Saffire-I/III)
    }
    spreadRate_mm_s(z) { return P.baseSpread_mm_s * this.spreadFactor(z); }

    step(dt) {
      this.t += dt;
      const amb = C.compartment.ambientC;
      const flow = this.effectiveFlow();
      const f = this.fault;
      let coSrc = 0, partSrc = 0, o2Sink = 0;
      const fz = this.faultZone();

      for (const z of this.zones) {
        const prevT = z.T;
        let qin = 0;
        if (f && f.active && z.id === f.zone && z.powerOn) qin += (this.params.heat != null ? this.params.heat : f.heat_C_s);
        if (z.burning) qin += 2.5 + 2.0 * this.spreadFactor(z);
        // conduction from the hot zone to neighbours
        if (z !== fz) qin += 0.007 * Math.max(0, fz.T - z.T);
        const kCool = 0.012 + 0.0015 * flow + 0.22 * z.suppressant;               // agent absorbs heat
        z.T += (qin - kCool * (z.T - amb)) * dt + noise(0.08);

        // passive microcapsule release (no electronics)
        if (!z.released && z.T >= z.release_C) this.release(z, "passive thermal trigger");
        // suppressant persists longer with ventilation off
        if (z.suppressant > 0) z.suppressant = Math.max(0, z.suppressant - dt / (this.ventOn ? 35 : 110));

        // ignition: bulk temperature, or arc spark on a hot conductor
        const arcSpark = f && f.arc && z.id === f.zone && z.powerOn && z.T > 55 && Math.random() < 0.5 * dt;
        if (!z.burning && (z.T >= z.ignite_C || arcSpark) && this.sustainable(z)) {
          z.burning = true; z.everBurned = true;
          this.log("ignite", `Ignition in ${z.name} (${arcSpark ? "arc spark" : "auto-ignition"}) - spherical microgravity flame`);
        }
        if (z.burning && !this.sustainable(z)) {
          z.burning = false; this.residualCO = 10;                                // FLEX: may keep burning invisibly
          this.log("extinct", `Visible flame out in ${z.name} - verifying (cool-flame risk, FLEX)`);
        }

        // gas & smoke sources
        if (z.burning) { const s = this.spreadFactor(z); coSrc += 9 * s + 4; partSrc += 18 * s + 6; o2Sink += 0.006 * s; }
        if (z.T > z.decomp_C) { coSrc += 1.5 + 0.03 * (z.T - z.decomp_C); partSrc += 2.5; }
        if (z.T > 0.55 * z.decomp_C) partSrc += 0.06 * (z.T - 0.55 * z.decomp_C);  // SAME: smoke before flame
        if (f && f.smolder && z.id === f.zone && z.T > 40 && z.powerOn) { coSrc += 0.6 + 0.05 * (z.T - 40); partSrc += 0.8; } // smoldering: CO first

        // derived rate (°C/s, smoothed)
        const inst = (z.T - prevT) / dt;
        z.rate = z.rate * 0.85 + inst * 0.15;
        z.hist.push({ t: this.t, T: z.T });
        if (z.hist.length > 400) z.hist.shift();
        z.state = this.zoneState(z);
      }

      if (this.residualCO > 0) { coSrc += 0.8; this.residualCO -= dt; }
      // CO removal: scrubber + dilution
      this.co = Math.max(0.8, this.co + (coSrc - this.co * (0.07 + (this.ventOn ? 0.03 : 0))) * dt + noise(0.08));
      this.particles = Math.max(3, this.particles + (partSrc - (this.particles - 4) * 0.05) * dt + noise(0.25));
      this.o2 = clamp(this.o2 - o2Sink * dt + (this.o2Base - this.o2) * 0.01 * dt + noise(0.01), 5, 100);
      const avgT = this.zones.reduce((a, z) => a + z.T, 0) / this.zones.length;
      this.pressure = this.pBase * (1 + (avgT - amb) / 2730) + noise(0.02);
      this.strain = 150 + 0.9 * (fz.T - amb) + noise(1.5);
      this.history.push({ t: this.t, T: fz.T });
      if (this.history.length > 600) this.history.shift();
    }

    zoneState(z) {
      if (z.burning) return "Burning";
      if (z.released && z.suppressant > 0.05 && z.T > C.microcapsules.verify_T_C) return "Suppressing";
      if (z.released && z.T <= C.microcapsules.verify_T_C) return "Released";
      if (z.rate > 0.6 && z.T > 40) return "Heating";
      return "Stable";
    }

    // forecast seconds until a threshold at the current smoothed rate
    eta(z, target) {
      if (z.T >= target) return 0;
      if (z.rate <= 0.05) return Infinity;
      return (target - z.T) / z.rate;
    }

    snapshot() {
      const fz = this.faultZone();
      const hottest = this.zones.reduce((a, z) => (z.T > a.T ? z : a), this.zones[0]);
      return {
        t: this.t, ventOn: this.ventOn, opts: { ...this.opts }, params: { ...this.params },
        flow: this.effectiveFlow(), loi: this.loi(fz), sustainable: this.sustainable(fz),
        spread_mm_s: this.spreadRate_mm_s(fz),
        temp: hottest.T, hottest: hottest.id, faultZone: fz.id,
        co: this.co, particles: this.particles, o2: this.o2, pressure: this.pressure, strain: this.strain,
        burning: this.zones.some(z => z.burning), residual: this.residualCO > 0,
        zones: this.zones.map(z => ({ id: z.id, name: z.name, material: z.material, T: z.T, rate: z.rate, state: z.state,
          released: z.released, suppressant: z.suppressant, burning: z.burning, everBurned: z.everBurned, powerOn: z.powerOn,
          release_C: z.release_C, decomp_C: z.decomp_C, etaRelease: this.eta(z, z.release_C), etaDecomp: this.eta(z, z.decomp_C) }))
      };
    }
  }

  window.SensorEngine = SensorEngine;
})();
