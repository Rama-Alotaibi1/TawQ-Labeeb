// =====================================================================
// Labeeb - simulation configuration
// Every number here is either taken from a NASA finding (see "src")
// or marked as a TEAM ASSUMPTION that must be backed by a reference.
// Edit freely: the dashboard reads everything from this file.
// =====================================================================
window.LABEEB_CONFIG = {

  // ---- Compartment (digital twin reference: OSIRIS-REx SRC, 81 x 50 cm) ----
  compartment: { name: "Electronics bay", diameter_cm: 81, height_cm: 50, ambientC: 28 },

  // ---- Cabin atmosphere presets (replaces the unrealistic 61% O2) ----
  atmospheres: {
    iss:  { label: "ISS air - 21% O2 / 101.3 kPa", o2: 21.0, pressure: 101.3, src: "EXPLORATION-ATM" },
    ea:   { label: "Exploration atm - 34% O2 / 56.5 kPa", o2: 34.0, pressure: 56.5, src: "EXPLORATION-ATM" }
  },

  // ---- Gravity levels ----
  gravity: {
    micro: { label: "Microgravity (cruise)", g: 0.0,   buoyantFlow_cm_s: 0,  src: "SAFFIRE-I-III" },
    moon:  { label: "Lunar gravity (1/6 g)", g: 0.166, buoyantFlow_cm_s: 8,  src: "FM2" },
    mars:  { label: "Mars gravity (0.38 g)", g: 0.38,  buoyantFlow_cm_s: 13, src: "FM2" }
  },

  // ---- Where the capsule is (sets Earth round-trip command delay) ----
  // Round-trip light time; physics, not an assumption.
  locations: {
    leo:    { label: "Low Earth orbit",               rtt_s: 0.5 },
    moon:   { label: "Lunar distance",                rtt_s: 2.6 },
    cruise: { label: "Earth-return cruise (~0.1 AU)", rtt_s: 100 },
    mars:   { label: "Mars distance (min-max)",       rtt_s: 1200 }
  },

  // ---- Combustion physics anchors (NASA) ----
  physics: {
    baseSpread_mm_s: 1.8,     // Saffire-I concurrent spread at 20 cm/s  (src SAFFIRE-I-III)
    baseFlow_cm_s: 20,        // Saffire / SoFIE standard forced flow
    quenchFlow_cm_s: 2,       // radiative quenching below ~2 cm/s      (src SOFIE)
    loiMicro_pct: 17,         // PMMA sustains spread at 17% O2 in ug   (src BASS-II)
    loi1g_pct: 18,            // vs 18% in 1 g                          (src BASS-II)
    coLeadsTemperature: true, // CO rise more significant than T rise   (src SAFFIRE-IV-VI)
    smokeBeforeFlame: true,   // overheated materials smoke before ignition (src SAME)
    coolFlameRisk: true       // flame can persist invisibly after visible extinction (src FLEX)
  },

  // ---- Zones inside the electronics bay ----
  // release_C : microcapsule release TARGET 125 °C = middle of the 120-130 °C research window (team proposal).
  //             Published C6F12O@Chitosan releases at ~200 °C (Huang et al. 2026, PSEP) - too high for electronics.
  //             Window supported by C6F12O microcapsules releasing at ~120 °C (Liu et al. 2024, Heliyon e27454).
  // decomp_C  : COMPONENT DAMAGE LIMIT 170 °C (design assumption) - release must happen below it.
  // ignite_C  : design assumption
  zones: [
    { id: "avionics", name: "Avionics board", material: "FR-4 epoxy / Kapton",  release_C: 125, decomp_C: 170, ignite_C: 260, x: 0.30, y: 0.42 },
    { id: "harness",  name: "Wire harness",   material: "PTFE / Kapton insulation", release_C: 125, decomp_C: 170, ignite_C: 280, x: 0.62, y: 0.62 },
    { id: "power",    name: "Power module",   material: "Polymer potting / FR-4", release_C: 125, decomp_C: 170, ignite_C: 250, x: 0.38, y: 0.62 },
    { id: "seal",     name: "Seal polymer",   material: "Silicone rubber",      release_C: 125, decomp_C: 170, ignite_C: 300, x: 0.70, y: 0.40 }
  ],

  // ---- Microcapsule layer (C6F12O @ Chitosan) - TEAM ASSUMPTION ----
  microcapsules: {
    agent: "C6F12O (FK-5-1-12)", shell: "Crosslinked chitosan",
    passiveRelease_C: 125,     // research target (window 120-130 °C)
    targetWindow_C: [120, 130],
    reportedRelease_C: 200,    // published C6F12O@Chitosan (Huang et al. 2026)
    componentDamage_C: 170,    // design assumption
    verify_T_C: 45, verify_CO_ppm: 6,
    hfWarning: "C6F12O can decompose to HF at high temperature - check electronics corrosion"
  },

  // ---- Fault scenarios ----
  scenarios: {
    overheat: { label: "Slow overheat (power module)",       zone: "power",    heat_C_s: 7.5, arc: false, smolder: false },
    arc:      { label: "Electrical arc (wire harness)",      zone: "harness",  heat_C_s: 6.5, arc: true,  smolder: false },
    smolder:  { label: "Smoldering insulation (avionics)",   zone: "avionics", heat_C_s: 2.8, arc: false, smolder: true  }
  },

  // ---- Demo pacing ----
  tick_ms: 250,     // sensor sample period (real time)
  timeScale: 1.0    // 1 sim second per real second (time-compressed scenario)
};
