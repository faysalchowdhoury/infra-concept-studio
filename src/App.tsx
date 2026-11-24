import React, { useState } from 'react';
import {
  Activity,
  Construction,
  Download,
  Info,
  Layers,
  RotateCcw,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_EV_GRID_PARAMS,
  EvGridParams,
  solveEvGrid,
} from './physics/evGridSolver';
import {
  DEFAULT_V2X_PARAMS,
  V2xFdiParams,
  solveV2xFdi,
} from './physics/v2xFdiSolver';
import {
  DEFAULT_WORK_ZONE_PARAMS,
  WorkZoneParams,
  solveWorkZone,
} from './physics/workZoneSolver';
import {
  DEFAULT_GEOTECH_PARAMS,
  GeotechWallParams,
  solveGeotechWall,
} from './physics/geotechWallSolver';
import { EvGridModule } from './modules/EvGridModule';
import { V2xFdiModule } from './modules/V2xFdiModule';
import { WorkZoneModule } from './modules/WorkZoneModule';
import { GeotechWallModule } from './modules/GeotechWallModule';

type ModuleId = 'ev_grid' | 'v2x_fdi' | 'work_zone' | 'geotech_wall';

const TABS: { id: ModuleId; label: string; icon: React.ReactNode }[] = [
  { id: 'ev_grid', label: '1. EV Grid & Emissions', icon: <Zap className="h-3.5 w-3.5" /> },
  { id: 'v2x_fdi', label: '2. V2X Cyber-Physics', icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  { id: 'work_zone', label: '3. Arterial Work-Zone', icon: <Construction className="h-3.5 w-3.5" /> },
  { id: 'geotech_wall', label: '4. Geotech Wall & Footing', icon: <Layers className="h-3.5 w-3.5" /> },
];

const DISCLAIMER_TEXT =
  'Concept-Sizing & Educational Screening Tool — Final design requires full CFD/FEA/microsimulation validation';

export function App() {
  const [activeTab, setActiveTab] = useState<ModuleId>('ev_grid');
  const [evParams, setEvParams] = useState<EvGridParams>(() => ({ ...DEFAULT_EV_GRID_PARAMS }));
  const [v2xParams, setV2xParams] = useState<V2xFdiParams>(() => ({
    ...DEFAULT_V2X_PARAMS,
    vehicleAttacks: { ...DEFAULT_V2X_PARAMS.vehicleAttacks },
  }));
  const [workZoneParams, setWorkZoneParams] = useState<WorkZoneParams>(() => ({
    ...DEFAULT_WORK_ZONE_PARAMS,
  }));
  const [geotechParams, setGeotechParams] = useState<GeotechWallParams>(() => ({
    ...DEFAULT_GEOTECH_PARAMS,
  }));

  const handleResetDefaults = () => {
    setEvParams({ ...DEFAULT_EV_GRID_PARAMS });
    setV2xParams({
      ...DEFAULT_V2X_PARAMS,
      vehicleAttacks: { ...DEFAULT_V2X_PARAMS.vehicleAttacks },
    });
    setWorkZoneParams({ ...DEFAULT_WORK_ZONE_PARAMS });
    setGeotechParams({ ...DEFAULT_GEOTECH_PARAMS });
  };

  const handleExportReport = () => {
    const report = {
      application: 'InfraConcept Studio',
      generatedAtIso: new Date().toISOString(),
      disclaimer: DISCLAIMER_TEXT,
      activeModule: activeTab,
      modules: {
        evGridAndEmissions: {
          inputs: evParams,
          outputs: solveEvGrid(evParams),
        },
        v2xCyberPhysics: {
          inputs: v2xParams,
          outputs: solveV2xFdi(v2xParams),
        },
        arterialWorkZone: {
          inputs: workZoneParams,
          outputs: solveWorkZone(workZoneParams),
        },
        geotechWallAndFooting: {
          inputs: geotechParams,
          outputs: solveGeotechWall(geotechParams),
        },
      },
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `infraconcept-studio-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-slate-900">
                InfraConcept Studio
              </h1>
              <p className="font-mono text-[10px] text-slate-500">
                Civil & Smart-Infrastructure Screening Workstation
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={handleExportReport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export JSON Report
            </button>
          </div>
        </div>
      </header>

      {/* Screening Disclaimer Banner */}
      <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5">
        <div className="mx-auto flex items-center justify-center gap-2 text-center text-[11px] font-medium text-amber-900">
          <Info className="h-3.5 w-3.5 shrink-0 text-amber-700" />
          <span>{DISCLAIMER_TEXT}</span>
        </div>
      </div>

      {/* Main 3-Panel Engineering Workstation */}
      <main className="flex-1 min-h-0 p-3 overflow-y-auto lg:overflow-hidden">
        {activeTab === 'ev_grid' && (
          <EvGridModule params={evParams} onChange={setEvParams} />
        )}
        {activeTab === 'v2x_fdi' && (
          <V2xFdiModule params={v2xParams} onChange={setV2xParams} />
        )}
        {activeTab === 'work_zone' && (
          <WorkZoneModule params={workZoneParams} onChange={setWorkZoneParams} />
        )}
        {activeTab === 'geotech_wall' && (
          <GeotechWallModule params={geotechParams} onChange={setGeotechParams} />
        )}
      </main>
    </div>
  );
}

export default App;
