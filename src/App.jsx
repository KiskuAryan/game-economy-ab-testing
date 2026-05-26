import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* ─── Simulation Core (ported from Python) ─────────────────────────── */
const FUEL_MULT_CAP = 3.0;
const BIO_PRICE_MIN = 500,
  BIO_PRICE_MAX = 5000;
const MAX_INCOME = 3000,
  MIN_INCOME = 100;
const CATASTRO_CAP = 3000;

function gauss(mean, std, rng) {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function seededRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function runSimulation(cfg) {
  const {
    days = 30,
    numPlayers = 500,
    dropRate = 0.1,
    fuelMult = 1.0,
    catChance = 0.03,
    churnDays = 5,
    aid = 500,
    seed = 42,
  } = cfg;
  const rng = seededRng(seed);

  const archetypes = ["Casual", "Hardcore", "PvP"];
  const archCfg = {
    Casual: { mean: 850, std: 150, sink: 400 },
    Hardcore: { mean: 1150, std: 220, sink: 950 },
    PvP: { mean: 950, std: 300, sink: 800 },
  };

  const players = Array.from({ length: numPlayers }, (_, i) => {
    const r = rng();
    const arch = r < 0.6 ? "Casual" : r < 0.9 ? "Hardcore" : "PvP";
    return {
      id: i,
      arch,
      credits: 1000,
      bioCores: 0,
      gearScore: 1,
      daysPlayed: 0,
      povertyDays: 0,
      churned: false,
      raidProtected: false,
    };
  });

  const dailySummary = [];
  let curFuel = fuelMult;

  for (let day = 1; day <= days; day++) {
    const active = players.filter((p) => !p.churned);
    if (!active.length) break;
    if (day % 10 === 0) curFuel = Math.min(curFuel * 1.15, FUEL_MULT_CAP);

    const totalCores = active.reduce((s, p) => s + p.bioCores, 0);
    const totalDemand = active.length * 0.5;
    const bioPrice = Math.max(
      BIO_PRICE_MIN,
      Math.min(
        BIO_PRICE_MAX,
        Math.round(1000 + 50 * (totalDemand - totalCores)),
      ),
    );

    // shuffle active
    for (let i = active.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [active[i], active[j]] = [active[j], active[i]];
    }
    active.forEach((p) => {
      p.raidProtected = false;
    });

    active.forEach((p) => {
      p.daysPlayed++;
      const cfg2 = archCfg[p.arch];
      let income = Math.round(gauss(cfg2.mean, cfg2.std, rng));
      income = Math.max(MIN_INCOME, Math.min(income, MAX_INCOME));
      p.credits += income;
      if (rng() < dropRate) p.bioCores++;

      if (p.arch === "PvP") {
        if (rng() < 0.55) {
          const victims = active.filter(
            (v) => v.id !== p.id && !v.raidProtected && v.credits > 300,
          );
          if (victims.length) {
            const victim = victims[Math.floor(rng() * victims.length)];
            const stolen = Math.min(
              victim.credits,
              Math.round(100 + rng() * 400),
            );
            victim.credits -= stolen;
            p.credits += stolen;
            victim.raidProtected = true;
          }
        } else {
          p.credits -= Math.round(50 + rng() * 100);
        }
      }

      if (rng() < catChance) {
        p.credits -= Math.min(300 + Math.round(p.credits * 0.1), CATASTRO_CAP);
      }
      if (rng() < 0.01)
        p.credits += Math.round(500 + 200 * Math.sqrt(p.gearScore));

      const fuelCost = Math.round(100 * curFuel);
      const repairCost = Math.max(
        50,
        Math.round(Math.sqrt(p.gearScore) * gauss(120, 25, rng)),
      );
      const ammoCost = Math.max(100, Math.round(gauss(cfg2.sink, 100, rng)));
      p.credits -= fuelCost + repairCost + ammoCost;

      if (p.bioCores >= 8) {
        p.bioCores -= 3;
        p.credits += 3 * bioPrice;
      }
      if (p.bioCores >= 5 && p.credits >= 5000) {
        p.credits -= 5000;
        p.bioCores -= 5;
        p.gearScore++;
      }

      if (p.credits < 200) p.povertyDays++;
      else p.povertyDays = 0;

      if (p.povertyDays >= churnDays) {
        const churnChance = { Casual: 0.4, Hardcore: 0.15, PvP: 0.25 }[p.arch];
        if (rng() < churnChance) {
          p.churned = true;
          return;
        }
      }
      if (p.credits < 300) p.credits += aid;
      if (p.credits < 0) p.credits = 0;
    });

    const stillActive = players.filter((p) => !p.churned);
    const avgCredits = stillActive.length
      ? stillActive.reduce((s, p) => s + p.credits, 0) / stillActive.length
      : 0;
    const avgGear = stillActive.length
      ? stillActive.reduce((s, p) => s + p.gearScore, 0) / stillActive.length
      : 0;
    const avgCores = stillActive.length
      ? stillActive.reduce((s, p) => s + p.bioCores, 0) / stillActive.length
      : 0;

    const byArch = {};
    archetypes.forEach((a) => {
      const ap = stillActive.filter((p) => p.arch === a);
      byArch[a] = ap.length
        ? Math.round(ap.reduce((s, p) => s + p.credits, 0) / ap.length)
        : 0;
    });

    dailySummary.push({
      day,
      active: stillActive.length,
      churned: players.filter((p) => p.churned).length,
      avgCredits: Math.round(avgCredits),
      avgGear: +avgGear.toFixed(2),
      avgCores: +avgCores.toFixed(2),
      bioPrice,
      fuelMult: +curFuel.toFixed(2),
      casual: byArch.Casual,
      hardcore: byArch.Hardcore,
      pvp: byArch.PvP,
    });
  }

  const finalActive = players.filter((p) => !p.churned);
  const retention = (finalActive.length / numPlayers) * 100;
  const archCounts = {};
  archetypes.forEach((a) => {
    archCounts[a] = finalActive.filter((p) => p.arch === a).length;
  });
  const archChurn = {};
  archetypes.forEach((a) => {
    const total = players.filter((p) => p.arch === a).length;
    const churned = players.filter((p) => p.arch === a && p.churned).length;
    archChurn[a] = total ? +((churned / total) * 100).toFixed(1) : 0;
  });

  return {
    daily: dailySummary,
    retention: +retention.toFixed(1),
    avgCredits: Math.round(
      finalActive.reduce((s, p) => s + p.credits, 0) /
        (finalActive.length || 1),
    ),
    avgGear: +(
      finalActive.reduce((s, p) => s + p.gearScore, 0) /
      (finalActive.length || 1)
    ).toFixed(2),
    avgCores: +(
      finalActive.reduce((s, p) => s + p.bioCores, 0) /
      (finalActive.length || 1)
    ).toFixed(2),
    churned: players.filter((p) => p.churned).length,
    richest: Math.max(...players.map((p) => p.credits)),
    finalBioPrice: dailySummary[dailySummary.length - 1]?.bioPrice ?? 1000,
    archCounts,
    archChurn,
  };
}

/* ─── Color Palette ──────────────────────────────────────────────────── */
const C = {
  bg: "#0D0F14",
  surface: "#13161E",
  card: "#181C27",
  border: "#252A38",
  borderL: "#2E3447",
  text: "#CBD5E1",
  muted: "#64748B",
  dim: "#475569",
  gold: "#F5A623",
  goldL: "#FFD080",
  amber: "#FB923C",
  teal: "#2DD4BF",
  tealD: "#0D9488",
  blue: "#60A5FA",
  blueD: "#2563EB",
  red: "#F87171",
  redD: "#DC2626",
  green: "#4ADE80",
  purple: "#A78BFA",
  white: "#F1F5F9",
  casual: "#FB923C",
  hardcore: "#F87171",
  pvp: "#A78BFA",
};

/* ─── Micro Components ──────────────────────────────────────────────── */
const Tag = ({ children, color = C.gold }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 10px",
      borderRadius: 4,
      border: `1px solid ${color}33`,
      background: `${color}14`,
      color,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      fontFamily: "'DM Mono', monospace",
    }}
  >
    {children}
  </span>
);

const Divider = () => (
  <div style={{ height: 1, background: C.border, margin: "0 -1.5rem" }} />
);

function StatCard({ label, value, delta, color = C.teal, icon }) {
  const positive = delta >= 0;
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "1.1rem 1.3rem",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${color}, transparent)`,
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: C.muted,
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {icon && <span style={{ fontSize: 16, opacity: 0.6 }}>{icon}</span>}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: C.white,
          fontFamily: "'Syne', sans-serif",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {delta !== undefined && (
        <div
          style={{
            fontSize: 11,
            color: positive ? C.green : C.red,
            fontFamily: "'DM Mono', monospace",
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          <span>{positive ? "▲" : "▼"}</span>
          <span>
            {positive ? "+" : ""}
            {delta}
          </span>
          <span style={{ color: C.dim }}>vs baseline</span>
        </div>
      )}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange, color = C.gold }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: C.muted,
            fontFamily: "'DM Mono', monospace",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 12,
            color,
            fontFamily: "'DM Mono', monospace",
            fontWeight: 700,
          }}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          appearance: "none",
          height: 3,
          background: `linear-gradient(90deg, ${color} ${((value - min) / (max - min)) * 100}%, ${C.border} 0)`,
          borderRadius: 2,
          outline: "none",
          cursor: "pointer",
        }}
      />
    </div>
  );
}

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.borderL}`,
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        fontFamily: "'DM Mono', monospace",
      }}
    >
      <div style={{ color: C.muted, marginBottom: 6, fontSize: 11 }}>
        Day {label}
      </div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}:{" "}
          <span style={{ color: C.white }}>
            {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ─── Main App ─────────────────────────────────────────────────────── */
export default function App() {
  const [tab, setTab] = useState("overview");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  // Variant A (Control)
  const [aDays, setADays] = useState(30);
  const [aPlayers, setAPlayers] = useState(500);
  const [aDrop, setADrop] = useState(0.1);
  const [aFuel, setAFuel] = useState(1.0);
  const [aCat, setACat] = useState(0.03);
  const [aChurn, setAChurn] = useState(5);
  const [aAid, setAAid] = useState(500);
  // Variant B (Experiment)
  const [bDrop, setBDrop] = useState(0.15);
  const [bFuel, setBFuel] = useState(1.0);
  const [bCat, setBCat] = useState(0.03);
  const [bChurn, setBChurn] = useState(7);
  const [bAid, setBAid] = useState(700);

  const run = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const rA = runSimulation({
        days: aDays,
        numPlayers: aPlayers,
        dropRate: aDrop,
        fuelMult: aFuel,
        catChance: aCat,
        churnDays: aChurn,
        aid: aAid,
        seed: 42,
      });
      const rB = runSimulation({
        days: aDays,
        numPlayers: aPlayers,
        dropRate: bDrop,
        fuelMult: bFuel,
        catChance: bCat,
        churnDays: bChurn,
        aid: bAid,
        seed: 1042,
      });
      setResults({ a: rA, b: rB });
      setRunning(false);
    }, 50);
  }, [
    aDays,
    aPlayers,
    aDrop,
    aFuel,
    aCat,
    aChurn,
    aAid,
    bDrop,
    bFuel,
    bCat,
    bChurn,
    bAid,
  ]);

  useEffect(() => {
    run();
  }, []);

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "economy", label: "Economy" },
    { id: "archetypes", label: "Archetypes" },
    { id: "headtohead", label: "Head-to-Head" },
  ];

  return (
    <div
      style={{
        fontFamily: "'Syne', 'DM Sans', sans-serif",
        background: C.bg,
        color: C.text,
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        input[type=range]::-webkit-slider-thumb {
          appearance: none; width: 12px; height: 12px;
          border-radius: 50%; background: ${C.gold};
          cursor: pointer; border: 2px solid ${C.bg};
        }
        select { background: ${C.card}; color: ${C.text}; border: 1px solid ${C.border};
          border-radius: 6px; padding: 4px 8px; font-size: 12px; outline: none; }
      `}</style>

      {/* Top Bar */}
      <div
        style={{
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          padding: "0 2rem",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          height: 72,
          padding: "0 2rem",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: C.gold,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 800,
              color: C.bg,
            }}
          >
            ☣
          </div>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: C.white,
                fontFamily: "'Syne', sans-serif",
                letterSpacing: "0.05em",
              }}
            >
              DEAD FRONTIER
            </div>
            <div
              style={{
                fontSize: 9,
                color: C.dim,
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                marginTop: -1,
              }}
            >
              Economy Lab
            </div>
          </div>
        </div>
        <div style={{ width: 1, height: 28, background: C.border }} />
        <div style={{ display: "flex", gap: 6 }}>
          <Tag color={C.teal}>A/B Testing</Tag>
          <Tag color={C.amber}>Live-Service</Tag>
          <Tag color={C.purple}>Sim Engine</Tag>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? `${C.gold}18` : "transparent",
                border:
                  tab === t.id
                    ? `1px solid ${C.gold}44`
                    : "1px solid transparent",
                color: tab === t.id ? C.gold : C.dim,
                borderRadius: 6,
                padding: "5px 14px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            width: 280,
            minWidth: 280,
            height: "100%",
            background: C.surface,
            borderRight: `1px solid ${C.border}`,
            padding: "1.25rem",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: C.dim,
              fontFamily: "'DM Mono', monospace",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            ⚙ Global Settings
          </div>
          <SliderRow
            label="Sim Days"
            value={aDays}
            min={10}
            max={90}
            step={5}
            onChange={setADays}
          />
          <SliderRow
            label="Players"
            value={aPlayers}
            min={100}
            max={1000}
            step={50}
            onChange={setAPlayers}
          />

          <div style={{ height: 1, background: C.border, margin: "14px 0" }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: C.red,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: C.red,
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Variant A · Control
            </span>
          </div>
          <SliderRow
            label="Drop Rate"
            value={aDrop}
            min={0.01}
            max={0.3}
            step={0.01}
            onChange={setADrop}
            color={C.red}
          />
          <SliderRow
            label="Fuel Mult"
            value={aFuel}
            min={0.5}
            max={3.0}
            step={0.1}
            onChange={setAFuel}
            color={C.red}
          />
          <SliderRow
            label="Catastrophe"
            value={aCat}
            min={0}
            max={0.15}
            step={0.01}
            onChange={setACat}
            color={C.red}
          />
          <SliderRow
            label="Churn Days"
            value={aChurn}
            min={1}
            max={10}
            step={1}
            onChange={setAChurn}
            color={C.red}
          />
          <SliderRow
            label="Emerg. Aid"
            value={aAid}
            min={0}
            max={2000}
            step={50}
            onChange={setAAid}
            color={C.red}
          />

          <div style={{ height: 1, background: C.border, margin: "14px 0" }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: C.teal,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: C.teal,
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Variant B · Experiment
            </span>
          </div>
          <SliderRow
            label="Drop Rate"
            value={bDrop}
            min={0.01}
            max={0.3}
            step={0.01}
            onChange={setBDrop}
            color={C.teal}
          />
          <SliderRow
            label="Fuel Mult"
            value={bFuel}
            min={0.5}
            max={3.0}
            step={0.1}
            onChange={setBFuel}
            color={C.teal}
          />
          <SliderRow
            label="Catastrophe"
            value={bCat}
            min={0}
            max={0.15}
            step={0.01}
            onChange={setBCat}
            color={C.teal}
          />
          <SliderRow
            label="Churn Days"
            value={bChurn}
            min={1}
            max={10}
            step={1}
            onChange={setBChurn}
            color={C.teal}
          />
          <SliderRow
            label="Emerg. Aid"
            value={bAid}
            min={0}
            max={2000}
            step={50}
            onChange={setBAid}
            color={C.teal}
          />

          <div style={{ height: 1, background: C.border, margin: "14px 0" }} />
          <button
            onClick={run}
            disabled={running}
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 8,
              cursor: running ? "not-allowed" : "pointer",
              background: running
                ? C.border
                : `linear-gradient(135deg, ${C.gold}, ${C.amber})`,
              border: "none",
              color: running ? C.dim : C.bg,
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              transition: "opacity 0.2s",
              opacity: running ? 0.6 : 1,
            }}
          >
            {running ? "⟳ Running..." : "⚡ Run Simulation"}
          </button>
        </div>

        {/* Main content */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "1.5rem",
          }}
        >
          {!results ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 40, opacity: 0.2 }}>☣</div>
              <div
                style={{
                  color: C.dim,
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 12,
                  letterSpacing: "0.1em",
                }}
              >
                Awaiting simulation...
              </div>
            </div>
          ) : (
            <>
              {tab === "overview" && <OverviewTab r={results} />}
              {tab === "economy" && <EconomyTab r={results} days={aDays} />}
              {tab === "archetypes" && <ArchetypesTab r={results} />}
              {tab === "headtohead" && (
                <HeadToHeadTab
                  r={results}
                  cfgA={{
                    drop: aDrop,
                    fuel: aFuel,
                    cat: aCat,
                    churn: aChurn,
                    aid: aAid,
                  }}
                  cfgB={{
                    drop: bDrop,
                    fuel: bFuel,
                    cat: bCat,
                    churn: bChurn,
                    aid: bAid,
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Overview Tab ──────────────────────────────────────────────────── */
function OverviewTab({ r }) {
  const { a, b } = r;
  const retDiff = +(b.retention - a.retention).toFixed(1);
  const credDiff = b.avgCredits - a.avgCredits;
  const gearDiff = +(b.avgGear - a.avgGear).toFixed(2);
  const churnDiff = b.churned - a.churned;

  const wins = [
    b.retention > a.retention,
    b.avgCredits > a.avgCredits,
    b.avgGear > a.avgGear,
  ].filter(Boolean).length;
  const winner = wins >= 2 ? "B" : "A";

  return (
    <div>
      <SectionHeader
        title="A/B Overview"
        sub="Economy health snapshot — final simulation day"
      />

      {/* KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard
          label="Retention Δ"
          value={`${retDiff > 0 ? "+" : ""}${retDiff}pp`}
          delta={retDiff}
          color={retDiff >= 0 ? C.teal : C.red}
          icon="🔒"
        />
        <StatCard
          label="Credits Δ"
          value={
            credDiff >= 0
              ? `+${credDiff.toLocaleString()}`
              : credDiff.toLocaleString()
          }
          delta={credDiff}
          color={credDiff >= 0 ? C.teal : C.red}
          icon="💰"
        />
        <StatCard
          label="Churn Δ"
          value={churnDiff >= 0 ? `+${churnDiff}` : `${churnDiff}`}
          delta={-churnDiff}
          color={churnDiff <= 0 ? C.teal : C.red}
          icon="⚰️"
        />
        <StatCard
          label="Gear Score Δ"
          value={`${gearDiff >= 0 ? "+" : ""}${gearDiff}`}
          delta={gearDiff}
          color={gearDiff >= 0 ? C.teal : C.red}
          icon="⚔️"
        />
      </div>

      {/* Two-column variant stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <VariantCard label="Variant A · Control" s={a} color={C.red} />
        <VariantCard label="Variant B · Experiment" s={b} color={C.teal} />
      </div>

      {/* Charts row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <ChartCard title="Active Players Over Time">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={r.a.daily.map((d, i) => ({
                day: d.day,
                a: d.active,
                b: r.b.daily[i]?.active,
              }))}
            >
              <defs>
                <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.red} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C.red} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.teal} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={C.teal} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: C.dim, fontSize: 10 }} />
              <YAxis tick={{ fill: C.dim, fontSize: 10 }} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
              <Area
                type="monotone"
                dataKey="a"
                name="Control"
                stroke={C.red}
                fill="url(#ga)"
                strokeWidth={2}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="b"
                name="Experiment"
                stroke={C.teal}
                fill="url(#gb)"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 3"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Economy Health Radar">
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart
              data={[
                { metric: "Retention", a: a.retention, b: b.retention },
                {
                  metric: "Avg Credits",
                  a: a.avgCredits / 100,
                  b: b.avgCredits / 100,
                },
                {
                  metric: "Gear Score",
                  a: a.avgGear * 100,
                  b: b.avgGear * 100,
                },
                { metric: "Bio Cores", a: a.avgCores * 10, b: b.avgCores * 10 },
                {
                  metric: "Bio Price",
                  a: a.finalBioPrice / 100,
                  b: b.finalBioPrice / 100,
                },
              ]}
            >
              <PolarGrid stroke={C.border} />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: C.dim, fontSize: 10 }}
              />
              <Radar
                name="Control"
                dataKey="a"
                stroke={C.red}
                fill={C.red}
                fillOpacity={0.15}
                strokeWidth={2}
              />
              <Radar
                name="Experiment"
                dataKey="b"
                stroke={C.teal}
                fill={C.teal}
                fillOpacity={0.1}
                strokeWidth={2}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Verdict */}
      <div
        style={{
          background: winner === "B" ? `${C.teal}0F` : `${C.red}0F`,
          border: `1px solid ${winner === "B" ? C.teal : C.red}44`,
          borderRadius: 10,
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div style={{ fontSize: 28 }}>{winner === "B" ? "✅" : "🔴"}</div>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: winner === "B" ? C.teal : C.red,
              fontFamily: "'Syne', sans-serif",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Simulation Verdict — Variant {winner} Wins
          </div>
          <div
            style={{
              fontSize: 12,
              color: C.muted,
              marginTop: 2,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Variant {winner} shows stronger economy health across {wins}/3 key
            metrics (retention, credit balance, gear progression). Recommend
            further playtesting before shipping.
          </div>
        </div>
      </div>
    </div>
  );
}

function VariantCard({ label, s, color }) {
  const rows = [
    ["Retention Rate", `${s.retention}%`],
    ["Avg Credits", s.avgCredits.toLocaleString()],
    ["Players Churned", s.churned.toLocaleString()],
    ["Avg Gear Score", s.avgGear.toFixed(2)],
    ["Avg Bio Cores", s.avgCores.toFixed(2)],
    ["Final Bio Price", s.finalBioPrice.toLocaleString()],
    ["Richest Player", s.richest.toLocaleString()],
  ];
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{ width: 8, height: 8, borderRadius: 2, background: color }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color,
            fontFamily: "'Syne', sans-serif",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ padding: "0.75rem 1rem" }}>
        {rows.map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "5px 0",
              borderBottom: `1px solid ${C.border}11`,
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: C.dim,
                fontFamily: "'DM Mono', monospace",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {k}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: C.white,
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Economy Tab ───────────────────────────────────────────────────── */
function EconomyTab({ r }) {
  const combined = r.a.daily.map((d, i) => ({
    day: d.day,
    aCredits: d.avgCredits,
    bCredits: r.b.daily[i]?.avgCredits,
    aBioPrice: d.bioPrice,
    bBioPrice: r.b.daily[i]?.bioPrice,
    aGear: d.avgGear,
    bGear: r.b.daily[i]?.avgGear,
    aCores: d.avgCores,
    bCores: r.b.daily[i]?.avgCores,
    fuel: d.fuelMult,
  }));

  return (
    <div>
      <SectionHeader
        title="Economy Metrics"
        sub="Daily averages and market dynamics over simulation"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <ChartCard title="Average Credits Over Time">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={combined}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: C.dim, fontSize: 10 }} />
              <YAxis tick={{ fill: C.dim, fontSize: 10 }} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="aCredits"
                name="Control"
                stroke={C.red}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="bCredits"
                name="Experiment"
                stroke={C.teal}
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 3"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Bio-Core Market Price">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={combined}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: C.dim, fontSize: 10 }} />
              <YAxis tick={{ fill: C.dim, fontSize: 10 }} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="aBioPrice"
                name="Control"
                stroke={C.red}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="bBioPrice"
                name="Experiment"
                stroke={C.teal}
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 3"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Avg Gear Score Progression">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={combined}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: C.dim, fontSize: 10 }} />
              <YAxis
                tick={{ fill: C.dim, fontSize: 10 }}
                tickFormatter={(v) => v.toFixed(1)}
              />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="aGear"
                name="Control"
                stroke={C.red}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="bGear"
                name="Experiment"
                stroke={C.teal}
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 3"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Seasonal Fuel Price Escalation">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={combined}>
              <defs>
                <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.amber} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.amber} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: C.dim, fontSize: 10 }} />
              <YAxis tick={{ fill: C.dim, fontSize: 10 }} domain={[0.8, 3.2]} />
              <Tooltip content={<TT />} />
              <Area
                type="stepAfter"
                dataKey="fuel"
                name="Fuel Mult"
                stroke={C.amber}
                fill="url(#gf)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

/* ─── Archetypes Tab ────────────────────────────────────────────────── */
function ArchetypesTab({ r }) {
  const ARCH_COLORS = { Casual: C.casual, Hardcore: C.hardcore, PvP: C.purple };
  const archetypes = ["Casual", "Hardcore", "PvP"];

  const pieA = archetypes.map((a) => ({
    name: a,
    value: r.a.archCounts[a] || 0,
  }));
  const pieB = archetypes.map((a) => ({
    name: a,
    value: r.b.archCounts[a] || 0,
  }));

  const churnData = archetypes.map((a) => ({
    arch: a,
    a: r.a.archChurn[a],
    b: r.b.archChurn[a],
  }));

  const creditsByArch = r.a.daily.map((d, i) => ({
    day: d.day,
    casual: d.casual,
    hardcore: d.hardcore,
    pvp: d.pvp,
  }));

  return (
    <div>
      <SectionHeader
        title="Archetype Analysis"
        sub="Player segment breakdown and churn rates"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <ChartCard title="Control — Active Player Mix">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={pieA}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={3}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {pieA.map((e) => (
                  <Cell key={e.name} fill={ARCH_COLORS[e.name]} />
                ))}
              </Pie>
              <Tooltip content={<TT />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Experiment — Active Player Mix">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={pieB}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={3}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {pieB.map((e) => (
                  <Cell key={e.name} fill={ARCH_COLORS[e.name]} />
                ))}
              </Pie>
              <Tooltip content={<TT />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
        }}
      >
        <ChartCard title="Control — Credits by Archetype">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={creditsByArch}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: C.dim, fontSize: 10 }} />
              <YAxis tick={{ fill: C.dim, fontSize: 10 }} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="casual"
                name="Casual"
                stroke={C.casual}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="hardcore"
                name="Hardcore"
                stroke={C.hardcore}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="pvp"
                name="PvP"
                stroke={C.purple}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Churn Rate by Archetype — A vs B">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={churnData} layout="vertical" barCategoryGap={8}>
              <CartesianGrid
                stroke={C.border}
                strokeDasharray="3 3"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: C.dim, fontSize: 10 }}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="arch"
                tick={{ fill: C.muted, fontSize: 11 }}
                width={60}
              />
              <Tooltip content={<TT />} formatter={(v) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="a"
                name="Control"
                fill={C.red}
                radius={[0, 3, 3, 0]}
              />
              <Bar
                dataKey="b"
                name="Experiment"
                fill={C.teal}
                radius={[0, 3, 3, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

/* ─── Head-to-Head Tab ──────────────────────────────────────────────── */
function HeadToHeadTab({ r, cfgA, cfgB }) {
  const { a, b } = r;
  const metrics = [
    {
      name: "Retention Rate",
      ka: a.retention,
      kb: b.retention,
      fmt: (v) => `${v}%`,
      higher: true,
    },
    {
      name: "Avg Credits",
      ka: a.avgCredits,
      kb: b.avgCredits,
      fmt: (v) => v.toLocaleString(),
      higher: true,
    },
    {
      name: "Players Churned",
      ka: a.churned,
      kb: b.churned,
      fmt: (v) => v.toLocaleString(),
      higher: false,
    },
    {
      name: "Avg Gear Score",
      ka: a.avgGear,
      kb: b.avgGear,
      fmt: (v) => v.toFixed(2),
      higher: true,
    },
    {
      name: "Avg Bio Cores",
      ka: a.avgCores,
      kb: b.avgCores,
      fmt: (v) => v.toFixed(2),
      higher: true,
    },
    {
      name: "Final Bio Price",
      ka: a.finalBioPrice,
      kb: b.finalBioPrice,
      fmt: (v) => v.toLocaleString(),
      higher: false,
    },
    {
      name: "Richest Player",
      ka: a.richest,
      kb: b.richest,
      fmt: (v) => v.toLocaleString(),
      higher: true,
    },
  ];

  const cfgRows = [
    {
      name: "Bio-Core Drop Rate",
      va: cfgA.drop,
      vb: cfgB.drop,
      fmt: (v) => `${(v * 100).toFixed(0)}%`,
      higher: true,
    },
    {
      name: "Fuel Price Mult",
      va: cfgA.fuel,
      vb: cfgB.fuel,
      fmt: (v) => `×${v.toFixed(1)}`,
      higher: false,
    },
    {
      name: "Catastrophe Chance",
      va: cfgA.cat,
      vb: cfgB.cat,
      fmt: (v) => `${(v * 100).toFixed(0)}%`,
      higher: false,
    },
    {
      name: "Poverty Churn Days",
      va: cfgA.churn,
      vb: cfgB.churn,
      fmt: (v) => `${v}d`,
      higher: true,
    },
    {
      name: "Emergency Aid",
      va: cfgA.aid,
      vb: cfgB.aid,
      fmt: (v) => v.toLocaleString(),
      higher: true,
    },
  ];

  return (
    <div>
      <SectionHeader
        title="Head-to-Head"
        sub="Direct metric comparison and config diff"
      />

      {/* Comparison table */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 100px",
            padding: "8px 16px",
            borderBottom: `1px solid ${C.border}`,
            background: C.surface,
          }}
        >
          {["Metric", "Control A", "Experiment B", "Winner"].map((h) => (
            <div
              key={h}
              style={{
                fontSize: 10,
                color: C.dim,
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {h}
            </div>
          ))}
        </div>
        {metrics.map(({ name, ka, kb, fmt, higher }) => {
          const win = ka === kb ? "TIE" : kb > ka === higher ? "B" : "A";
          const wc = win === "B" ? C.teal : win === "A" ? C.red : C.dim;
          return (
            <div
              key={name}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 100px",
                padding: "10px 16px",
                borderBottom: `1px solid ${C.border}11`,
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>
                {name}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: C.red,
                  fontFamily: "'DM Mono', monospace",
                  fontWeight: 700,
                }}
              >
                {fmt(ka)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: C.teal,
                  fontFamily: "'DM Mono', monospace",
                  fontWeight: 700,
                }}
              >
                {fmt(kb)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: wc,
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                }}
              >
                {win === "TIE" ? "—" : `VAR ${win}`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bar charts side by side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <ChartCard title="Retention Rate %">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={[
                { name: "Control", v: a.retention },
                { name: "Experiment", v: b.retention },
              ]}
            >
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} />
              <YAxis tick={{ fill: C.dim, fontSize: 10 }} domain={[0, 105]} />
              <Tooltip content={<TT />} formatter={(v) => `${v}%`} />
              <Bar dataKey="v" name="Retention" radius={[4, 4, 0, 0]}>
                <Cell fill={C.red} />
                <Cell fill={C.teal} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Avg Credits">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={[
                { name: "Control", v: a.avgCredits },
                { name: "Experiment", v: b.avgCredits },
              ]}
            >
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} />
              <YAxis tick={{ fill: C.dim, fontSize: 10 }} />
              <Tooltip content={<TT />} formatter={(v) => v.toLocaleString()} />
              <Bar dataKey="v" name="Credits" radius={[4, 4, 0, 0]}>
                <Cell fill={C.red} />
                <Cell fill={C.teal} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Config diff */}
      <SectionHeader
        title="Configuration Diff"
        sub="Parameter changes between variants"
        small
      />
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 120px",
            padding: "8px 16px",
            borderBottom: `1px solid ${C.border}`,
            background: C.surface,
          }}
        >
          {["Parameter", "Control A", "Experiment B", "Impact"].map((h) => (
            <div
              key={h}
              style={{
                fontSize: 10,
                color: C.dim,
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {h}
            </div>
          ))}
        </div>
        {cfgRows.map(({ name, va, vb, fmt, higher }) => {
          const changed = va !== vb;
          const diff = vb - va;
          const pct = va ? Math.abs((diff / va) * 100).toFixed(1) : "–";
          const good = changed ? diff > 0 === higher : true;
          const dc = good ? C.teal : C.red;
          return (
            <div
              key={name}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 120px",
                padding: "10px 16px",
                borderBottom: `1px solid ${C.border}11`,
                background: changed ? `${C.teal}05` : "transparent",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: C.text,
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: C.red,
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                {fmt(va)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: C.teal,
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                {fmt(vb)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: changed ? dc : C.dim,
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                {changed ? `${diff > 0 ? "▲" : "▼"} ${pct}%` : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Helper Components ─────────────────────────────────────────────── */
function SectionHeader({ title, sub, small }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div
        style={{
          fontSize: small ? 14 : 18,
          fontWeight: 800,
          color: C.white,
          fontFamily: "'Syne', sans-serif",
          letterSpacing: "0.03em",
        }}
      >
        {title}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: C.dim,
            marginTop: 2,
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.06em",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "1rem",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: C.muted,
          fontFamily: "'DM Mono', monospace",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
