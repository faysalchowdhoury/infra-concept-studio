# InfraConcept Studio

**Connected & Electrified Transportation Corridor Screening Studio**

🔗 **Live Demo:** [https://faysalchowdhoury.github.io/infra-concept-studio/](https://faysalchowdhoury.github.io/infra-concept-studio/)  
🎬 **Walkthrough Video:** [InfraConcept_Studio_LinkedIn_Demo.mp4](docs/InfraConcept_Studio_LinkedIn_Demo.mp4)

---

## Overview

**InfraConcept Studio** is a zero-backend, deterministic engineering simulation workstation built with React 18, TypeScript, Vite, Tailwind CSS, and `devicePixelRatio`-scaled HTML5 Canvas. It unifies three interdependent engineering layers of a modern connected and electrified highway corridor into a single 60fps interactive browser environment:

1. **Power & Emissions Layer (`EV Grid & Emissions`)** — En-route DC fast-charging plaza queueing, 12.47 kV distribution feeder loading/voltage drop, and marginal GHG emissions.
2. **Cyber-Physical V2X Layer (`V2X Cyber-Physics`)** — SAE J2735 Basic Safety Message (BSM) kinematic plausibility filtering and real-time false-data injection (FDI) quarantine.
3. **Traffic Operations Layer (`Arterial Work-Zone`)** — HCM 7th Edition work-zone lane-drop capacity, Webster/HCM control delay, Level of Service (LOS A–F), and deterministic upstream queue spillback.

All physics solvers are implemented as pure, deterministic TypeScript modules in `src/physics/` and verified against analytical benchmarks using Vitest.

---

## Module Breakdown & Governing Equations

### 1. EV Corridor Charging & Distribution Feeder Sizer (`src/physics/evGridSolver.ts`)
Models a DC Fast Charging (DCFC) plaza along a 50-mile highway corridor fed by a 12.47 kV three-phase distribution substation at Mile 25.0.
- **Arrival Demand & M/M/c (Erlang-C) Queueing:**
  $$\lambda = V_{\text{peak}} \cdot p_{\text{EV}} \cdot \gamma_{\text{cap}}, \qquad a = \frac{\lambda}{\mu_{\text{srv}}}, \qquad \rho = \frac{a}{c}$$
  $$C(c, a) = \frac{\frac{a^c}{c!(1-\rho)}}{\sum_{k=0}^{c-1}\frac{a^k}{k!} + \frac{a^c}{c!(1-\rho)}}, \qquad W_q = \frac{C(c,a)}{c\mu_{\text{srv}} - \lambda}$$
- **Coincident Load, Feeder Voltage Drop & Marginal Emissions:**
  $$P_{\text{coinc}} = \frac{N_{\text{active}} \cdot P_{\text{charger}} \cdot \text{DF}(N_{\text{active}})}{\eta}, \qquad \Delta V\% = \frac{P_{\text{coinc}} R + Q X}{10\,V_{LL}^2} \cdot L_{\text{mi}}$$
  $$\dot{E}_{\text{CO}_2} = P_{\text{coinc}} \cdot \text{EF}_{\text{marginal}}$$
- **Compliance Screening:** **PASS** when $\text{Transformer Loading} \le 100\%$ and $W_q \le 10\text{ min}$.

### 2. SAE J2735 V2X False-Data Injection (FDI) Sandbox (`src/physics/v2xFdiSolver.ts`)
Evaluates 12 simulated connected vehicles at a 4-leg signalized intersection under interactive cyber-attacks (`Position Spoof +15m`, `Unphysical Jerk/Accel`, `Ghost Vehicle Injection`).
- **Kinematic Plausibility Envelope:**
  $$|a_{\text{lat}}| \le \mu g, \qquad |a_{\text{long}}| \le 0.8g, \qquad |j| = \left|\frac{\Delta a}{\Delta t}\right| \le j_{\max}$$
- **IDM Car-Following & Composite Residual:**
  $$s^*(v, \Delta v) = s_0 + v T + \frac{v\,\Delta v}{2\sqrt{a b}}, \qquad R_i = \sqrt{r_{\text{lat}}^2 + r_{\text{long}}^2 + r_{\text{jerk}}^2 + r_{\text{pos}}^2 + r_{\text{IDM}}^2} + \epsilon_{\text{disc}}(\Delta t)$$
- **Compliance Screening:** **PASS (Protected)** when injected spoofed BSMs are detected and quarantined in $< 50\text{ ms}$ with zero false positives on benign vehicles.

### 3. Signalized Arterial Work-Zone & HCM 7th Ed. LOS Sizer (`src/physics/workZoneSolver.ts`)
Analyzes a 400 m signalized arterial segment (Upstream Intersection A to Downstream Intersection B) with a draggable work-zone lane-drop barrier.
- **Heavy-Vehicle Factor & Bottleneck Capacity:**
  $$f_{HV} = \frac{1}{1 + P_T(E_T - 1)}, \qquad s = s_0 \, N_{\text{wz}} \, f_{HV} \, f_{\text{wz}}, \qquad c = s \cdot \left(\frac{g}{C}\right)$$
- **HCM Control Delay ($d = d_1 + d_2$) & LOS Grade (A–F):**
  $$d_1 = \frac{0.5\,C(1 - g/C)^2}{1 - \min(1, X)(g/C)}, \qquad d_2 = 900\,T\left[(X - 1) + \sqrt{(X - 1)^2 + \frac{8 k I X}{c T}}\right]$$
- **Deterministic Queue Spillback:** Evaluates accumulated cycle-red and overflow queue length $Q_{\text{back}}\text{ (m)}$ against available upstream storage distance to Intersection A.
- **Compliance Screening:** **PASS** when $\text{LOS} \le \text{D}\ (d \le 55\text{ s/veh})$ and $Q_{\text{back}} \le X_{\text{barrier}}$.

---

## Local Development & Testing

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Run deterministic physics unit tests (Vitest)
npm test

# Type-check and build production bundle
npm run build
```

---

## Author & Citation

**Author:** Faysal Chowdhoury, Ph.D. — Postdoctoral Research Associate, Rochester Institute of Technology (RIT)  
**GitHub:** [https://github.com/faysalchowdhoury](https://github.com/faysalchowdhoury)

```bibtex
@software{chowdhoury2026infraconcept,
  author = {Chowdhoury, Faysal},
  title = {InfraConcept Studio: Connected and Electrified Transportation Corridor Screening Workstation},
  year = {2026},
  url = {https://github.com/faysalchowdhoury/infra-concept-studio}
}
```
