# Labeeb

## AI-Driven Fire Detection and Autonomous Suppression for Sample Return Capsules

**🔗 Live dashboard:** https://rama-alotaibi1.github.io/TawQ-Labeeb/

**NASA Space Apps Challenge 2026 · Riyadh · Team TawQ**
**Challenge:** Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data

---

## Overview

Labeeb protects the **electronics bay of a robotic sample return capsule** from overheating and fire during the microgravity cruise phase. This includes the avionics board, power module, wire harness and seal polymers.

It combines three layers of protection:

1. **Autonomous microencapsulated suppression.** A silicone protective layer contains C₆F₁₂O (FK-5-1-12) microcapsules with a crosslinked chitosan shell. When a zone reaches its release temperature, the shells rupture and release the clean agent right next to the hot component. No pump, valve or electronic command is needed.
2. **SI layer grounded in NASA experiments.** Live sensor readings are compared with results from NASA microgravity combustion experiments. The system then ranks the most relevant experiments and explains the situation to the operator, citing the experiments behind each statement.
3. **Human-in-the-loop decision.** The ground controller receives a short alert and can approve or reject early safety actions: stop ventilation, isolate power, and pre-trigger the capsules. These actions follow the ISS fire-response sequence. The system accounts for the Earth–capsule command delay. If a command cannot arrive in time, the passive layer protects the bay on its own.

The interactive dashboard summarizes, ranks and interprets NASA findings, as the challenge requires. It also lets researchers explore how oxygen, pressure, airflow and gravity change fire behavior.

---

## Dashboard

### Mission Monitor
- **Six live sensor readings:** temperature, carbon monoxide, particles, oxygen, pressure and structural strain.
- **Digital twin:** a 2D technical cross-section of the capsule (81 × 50 cm), using the OSIRIS-REx SRC as the geometry reference. It labels each part and its material: PICA heat shield, SLA-561V backshell, canister, avionics board, power module, wire harness and thermal seals. Dashed cyan outlines mark the C6F12O@Chitosan microcapsule layer, and letter markers show the six sensors. Monitored zones show their live temperature, and clicking a part shows its material and function. The view also shows the heat glow, the spherical microgravity flame, smoke, and the suppression cloud when the agent is released.
- **SI Analyst:** a live interpretation of the current state, with citations to NASA experiments and a confidence level based on how well NASA data covers the current conditions.
- **Zone table and event log:** per-zone temperature, heating rate, time to release and state.
- **Temperature and forecast chart:** reference lines for the release target (125 °C), the component damage limit (170 °C), the published C₆F₁₂O@chitosan release (~200 °C) and the verification threshold (45 °C).
- **Risk gauge and 7-step response sequence:** Detect → Identify → Predict → Release → Suppress → Verify → Report.
- **Ground alert:** Approve or Reject, with the command status shown in the Earth DataCenter panel.

### NASA Combustion Experiments
- **One ranked table** of 14 NASA experiments, ordered by relevance to the capsule's current state.
- **Row details:** click a row to see its objective, hardware, fuel, oxygen, airflow, pressure, gravity, sensors, key finding, fire-safety implication and sources.
- **Link to the SI Analyst:**
  - The five experiments sent to the SI model are marked with a side line.
  - Experiments the model cited carry a **Cited by SI** badge.
  - After the Report phase, the ranking stays fixed so it matches the final analysis.
- **CSV export** of the full modeling dataset.

### Researcher Inputs
Researchers can set the following inputs with sliders:

- Oxygen: 15–40 %
- Pressure: 30–101.3 kPa
- Ventilation flow: 0–55 cm/s
- Heating rate: 1–10 °C/s
- Capsule release temperature: 80–200 °C
- Component damage limit: 150–250 °C
- Gravity and capsule location

Each slider highlights the range NASA has tested. Values outside that range lower the SI confidence.

---

## NASA Data

| Experiment | Finding used | Role in Labeeb | Source |
|---|---|---|---|
| Saffire I–III | Flame spread ≈ 1.8 mm/s at 20 cm/s; spread scales with airflow | Flame-spread model | https://ntrs.nasa.gov/citations/20170008805 |
| Saffire IV–VI | CO and CO₂ rise is more significant than temperature rise | CO-led early warning, risk weighting | https://ntrs.nasa.gov/citations/20240002981 |
| BASS-II | Materials burn at lower O₂ in microgravity (17 % vs 18 %) | Flammability limit | https://ntrs.nasa.gov/api/citations/20160000593/downloads/20160000593.pdf |
| SoFIE | Flames quench below ~2 cm/s flow | "Stop ventilation" action | https://ntrs.nasa.gov/api/citations/20200000361/downloads/20200000361.pdf |
| FLEX | Flames can keep burning invisibly (cool flames) | Verification by CO and temperature | https://doi.org/10.1007/s12217-014-9372-2 |
| SAME / SAME-R | Overheated materials smoke before ignition (< 500 nm particles) | Particle sensing, pre-fire warning | https://www.nist.gov/node/1863886 |
| ISS Fire Detection & Suppression | Ventilation off → power off → extinguish | Ground action sequence | https://ntrs.nasa.gov/api/citations/20030053429/downloads/20030053429.pdf |
| Exploration Atmosphere | 34 % O₂ at 56.5 kPa for Moon/Mars | Cabin atmosphere option | https://ntrs.nasa.gov/citations/20240003211 |
| FM2 / FLARE | No flight data yet for partial gravity | Confidence adjustment | https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/ |
| ACME, CFI, SPICE/SLICE, DAFT | Experiments listed in the challenge | Explorer and comparison | https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/ |

The full knowledge base, with all source links, is in `data/nasa_findings.json`.

---

## SI Layer

- **Deterministic engine.** Computes the risk score, the confidence level, the experiment ranking, the recommended actions and the time remaining to the release and damage thresholds. It produces the same result for the same inputs, and every rule is traceable to a NASA finding.
- **Language model: GPT-5-mini (Azure OpenAI, Microsoft Foundry).** The model works as the interpreter, using retrieval-augmented generation (RAG). At each phase it receives:
  - the sensor readings
  - the event status
  - the top five ranked NASA experiments

  It returns a short analysis in JSON (title, tone, text and cited experiment IDs). The model is not trained or fine-tuned, and it may only cite the experiments it was given.
- **Safety by design.** Critical decisions do not depend on the model:
  - Thresholds and risk are computed by the engine.
  - The capsules release on their own when they reach the release temperature.
  - The operator approves or rejects every action.
  - If the model is unavailable, the dashboard switches to built-in rules.

---

## Scientific Basis and Limits

- **Release temperature.** The published C₆F₁₂O@chitosan microcapsules release at about 200 °C. Labeeb targets a **120–130 °C release window** (125 °C in the dashboard) by tuning the shell composition, crosslink density and thickness. C₆F₁₂O microcapsules with other shells have already been shown to release at about 120 °C (Liu et al., 2024).
- **Component damage limit.** 170 °C is a design parameter. The release must always happen below it.
- **Sensor model.** The sensors are simulated and calibrated on NASA results. They use the same data format as a real sensor bus, so physical sensors can be connected directly.
- **What the simulation shows.** It shows trends based on NASA findings. It is not a validated CFD model.

---

## Run

**Live dashboard:** https://rama-alotaibi1.github.io/TawQ-Labeeb/

**Run locally:** open `index.html` in Chrome or Edge. No installation is needed.

**Live SI analysis (Azure OpenAI):**

```bash
python tools/serve.py
```

Then click **⚙ SI**, paste the **Target URI** and key from Microsoft Foundry, and click **Test**. The key is stored only in the browser and is never included in this repository.

**Demo:**
1. Choose a scenario: slow overheat, electrical arc or smoldering insulation.
2. Click **Inject fault**.
3. Approve or reject the ground alert.
4. Follow the response sequence and the NASA Combustion Experiments page.

---

## Project Structure

```
index.html               dashboard
css/style.css            design
js/config.js             parameters and thresholds
js/data.js               NASA knowledge base (generated from data/nasa_findings.json)
js/sensors.js            sensor and combustion simulation
js/ai.js                 SI layer: risk, confidence, ranking, Azure OpenAI analyst
js/scene.js              digital twin, temperature chart, risk gauge
js/app.js                application logic and response sequence
data/nasa_findings.json  NASA experiments with sources
tools/serve.py           local server for the live SI demo
tools/build_data.py      rebuilds js/data.js from the JSON
```

---

## Key References

- NASA Space Apps Challenge 2026. *Flame in Freefall.* https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
- NASA Glenn Research Center. *Combustion Science.* https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/
- NASA Physical Sciences Informatics (PSI). https://psi.nasa.gov/
- NASA. *Ames Contributions to OSIRIS-REx.* https://www.nasa.gov/missions/osiris-rex/nasa-ames-contributions-to-osiris-rex/
- Liu, H. et al. (2024). Preparation and thermal responsiveness of microencapsulated fluorinated liquids for automatic fire extinguishing. *Heliyon*, 10(5), e27454. https://doi.org/10.1016/j.heliyon.2024.e27454
- Huang, Q. et al. (2026). Microfluidic perfluorohexanone microcapsules for on-site suppression of confined-space fires and lithium-ion battery thermal runaway propagation. *Process Safety and Environmental Protection.* https://doi.org/10.1016/j.psep.2026.109258
- Li, J. et al. (2025). Fabrication of thermally activated fire-extinguishing microcapsules and silicone rubber composite. *Composites Communications.* https://doi.org/10.1016/j.coco.2025.102256

---

## Use of AI

- **In the product:** GPT-5-mini (Azure OpenAI) generates the SI Analyst text from live readings and the NASA experiments selected by the engine.
- **In development:** Claude (Anthropic) assisted in building the project foundations and the dashboard design.

---

## Team TawQ

Layal AlQahtani (Leader) · Mayar Alzahrani · Rama AlOtaibi · Noura Alzahrani
