import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Leaf, Sprout, TreePine, Mountain, Ship, Tent,
  Map as MapIcon, Calendar as CalendarIcon, Wallet,
  Settings as SettingsIcon, Bell, Plus, Trash2, Pencil, X, Users,
  Car, FileText, Snowflake, Compass, Home,
  ChevronLeft, ChevronRight, Circle, CheckCircle2, PiggyBank,
  DollarSign, Clock, Luggage, Camera, Flag, Info, Heart,
  Save, ListChecks, LayoutDashboard, ChevronDown, Ticket, Upload, Loader2, Plane,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import { MapContainer, TileLayer, Marker, Tooltip as LeafletTooltip, Polyline } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { supabase } from "./lib/supabaseClient";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

/* ------------------------------------------------------------------ */
/*  THEME                                                              */
/* ------------------------------------------------------------------ */
const THEMES = {
  fernwood: {
    label: "Fernwood",
    paper: "#E7E2D3", paper2: "#F7F3E9", card: "#FFFFFF",
    ink: "#33352B", sub: "#726E5B",
    primary: "#586B45", primaryDark: "#43533A", primarySoft: "#E3E8D7",
    accent: "#C9963A", accentSoft: "#F2E7CB",
    clay: "#B0684A",
    water: "#5B7C8A", waterSoft: "#DCE6EA",
    line: "#D9D1BC", danger: "#B0503B", ok: "#5E7B4E",
  },
  claycoast: {
    label: "Clay Coast",
    paper: "#EBE1D4", paper2: "#F8F1E7", card: "#FFFFFF",
    ink: "#3A322A", sub: "#7A6B5C",
    primary: "#A45C3C", primaryDark: "#874A30", primarySoft: "#F0DECF",
    accent: "#C9963A", accentSoft: "#F2E7CB",
    clay: "#6E8B6A",
    water: "#6E8B8F", waterSoft: "#DEE7E6",
    line: "#DDCFBD", danger: "#9A4736", ok: "#6E8B6A",
  },
  lakeside: {
    label: "Lakeside",
    paper: "#E1E4DE", paper2: "#F1F4EF", card: "#FFFFFF",
    ink: "#2E332F", sub: "#657069",
    primary: "#4B7480", primaryDark: "#3A5C66", primarySoft: "#D9E5E6",
    accent: "#C9963A", accentSoft: "#F1E7CC",
    clay: "#B0684A",
    water: "#4B7480", waterSoft: "#D9E5E6",
    line: "#CFD6CE", danger: "#A6533F", ok: "#5E7B4E",
  },
};

/* ------------------------------------------------------------------ */
/*  STORAGE                                                            */
/*  Shared: one row in Supabase (public.app_state), synced live via    */
/*  Realtime. Anyone can read it (share the link); only signed-in      */
/*  editors can write, enforced by Row Level Security — see            */
/*  supabase/migrations/. Callers only invoke set() when canEdit.      */
/* ------------------------------------------------------------------ */
const store = {
  async get() {
    const { data, error } = await supabase.from("app_state").select("data").eq("id", 1).single();
    if (error) { console.error("Failed to load trip data:", error.message); return null; }
    return data?.data || null;
  },
  async set(val) {
    const { error } = await supabase.from("app_state").update({ data: val }).eq("id", 1);
    if (error) console.error("Failed to save trip data:", error.message);
  },
};

/* ------------------------------------------------------------------ */
/*  DATE HELPERS (parse YYYY-MM-DD as LOCAL to avoid tz drift)         */
/* ------------------------------------------------------------------ */
const pd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtLong = (s) => { const d = pd(s); return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const fmtShort = (s) => { const d = pd(s); return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`; };
const daysBetween = (a, b) => Math.round((pd(b) - pd(a)) / 86400000);
const todayISO = () => iso(new Date());
const uid = () => Math.random().toString(36).slice(2, 9);

/* ------------------------------------------------------------------ */
/*  SEED DATA — the Nova Scotia + Newfoundland trip                    */
/* ------------------------------------------------------------------ */
const seedTrip = () => ({
  id: "ns-nl-2027",
  name: "Nova Scotia + Newfoundland",
  subtitle: "15-day family road trip · icebergs, ferries & easy trails",
  startDate: "2027-06-26",
  endDate: "2027-07-10",
  homeBase: "Plainville, MA",
  emoji: "🧭",
  status: "planning",
  days: [
    { id: uid(), n: 1, date: "2027-06-26", overnight: "Yarmouth, NS", lodging: "Hotel",
      title: "Plainville → Bar Harbor → CAT ferry", drive: "≈4½ hr drive + ferry",
      plan: ["Leave Plainville around 7:00 AM.", "Drive to Bar Harbor (~4½ hr). Lunch + early-afternoon there.", "Take the CAT ferry Bar Harbor → Yarmouth (~3½ hr, confirm 2027 schedule).", "Check into hotel in Yarmouth."],
      hike: null, tags: ["car", "ferry"] },
    { id: uid(), n: 2, date: "2027-06-27", overnight: "Peggy's Cove / St. Margaret's Bay", lodging: "Hotel or Airbnb",
      title: "Yarmouth → Lunenburg → Peggy's Cove", drive: "≈4 hr total driving",
      plan: ["Drive Yarmouth → Lunenburg (~2¾–3 hr).", "2½–3 hr in Lunenburg: colourful waterfront, historic streets, lunch.", "Drive Lunenburg → Peggy's Cove (~1¼ hr).", "Afternoon/evening at Peggy's Cove and the coast."],
      hike: { name: "Peggy's Cove granite shoreline walk", diff: "Easy", note: "Flat rock scramble by the lighthouse. Stay on the light-grey rock — black rock near the water is wet and dangerous. Great for the boys with close hand-holding." },
      tags: ["car", "hike"] },
    { id: uid(), n: 3, date: "2027-06-28", overnight: "Baddeck (Night 1)", lodging: "Hotel or Airbnb",
      title: "Peggy's Cove → Baddeck", drive: "≈4½ hr",
      plan: ["Scenic travel day (~4½ hr).", "Lunch/stretch stop around Antigonish or Port Hawkesbury.", "Arrive Baddeck mid/late afternoon; settle in."],
      hike: { name: "Uisge Bàn Falls (optional if energy)", diff: "Easy–Medium", note: "~2.4 km loop to a waterfall through mossy forest. Save for tomorrow if arriving late." },
      tags: ["car"] },
    { id: uid(), n: 4, date: "2027-06-29", overnight: "Baddeck (Night 2)", lodging: "Hotel or Airbnb",
      title: "Cabot Trail — full scenic day", drive: "Loop drive, plan stops",
      plan: ["Full day through Cape Breton Highlands National Park.", "One family hike + major overlooks rather than every trail.", "Park admission required (Parks Canada).", "If choosing Skyline, verify 2027 parking-reservation rules first."],
      hike: { name: "Bog Trail + Middle Head Trail", diff: "Easy", note: "Bog Trail = 0.5 km boardwalk, perfect for a 4-year-old. Middle Head = ~3.8 km with ocean views on both sides (turn back early if the little one tires). Skip Skyline with a 4-yo unless you'll carry him." },
      tags: ["hike", "mountain"] },
    { id: uid(), n: 5, date: "2027-06-30", overnight: "Baddeck (Night 3)", lodging: "Hotel or Airbnb",
      title: "Slow Cape Breton day", drive: "Minimal",
      plan: ["Keep it intentionally relaxed after the Cabot Trail.", "Option A: Alexander Graham Bell National Historic Site.", "Option B: Bras d'Or Lake cruise.", "Option C: Uisge Bàn Falls (if not done yet).", "Option D: sleep in, Baddeck waterfront, ice cream, easy lunch."],
      hike: { name: "Uisge Bàn Falls (relaxed pace)", diff: "Easy–Medium", note: "Shaded, water at the end — kids love the payoff. Turn it into a picnic." },
      tags: ["hike"] },
    { id: uid(), n: 6, date: "2027-07-01", overnight: "Overnight ferry", lodging: "Ferry cabin (book one)",
      title: "Baddeck → North Sydney → Argentia ferry", drive: "≈45 min + overnight ferry",
      plan: ["Relaxed Baddeck morning.", "Drive Baddeck → North Sydney (~45 min).", "Leave ~11:30 AM–noon for plenty of terminal time.", "Marine Atlantic ferry departs Thu ~5:00 PM; crossing ~16.5 hr.", "Sleep aboard — a cabin is worth it with kids."],
      hike: null, tags: ["ferry", "car"] },
    { id: uid(), n: 7, date: "2027-07-02", overnight: "Twillingate (Night 1)", lodging: "Hotel, Airbnb or coastal camping",
      title: "Argentia → Twillingate", drive: "≈4½ hr",
      plan: ["Arrive Newfoundland in the morning after the overnight ferry.", "Drive Argentia → Twillingate (~4½ hr).", "No big activity today — check in, explore, dinner, relax.", "Scan the water: you're now in Iceberg Alley."],
      hike: null, tags: ["car", "iceberg"] },
    { id: uid(), n: 8, date: "2027-07-03", overnight: "Twillingate (Night 2)", lodging: "Hotel, Airbnb or coastal camping",
      title: "Twillingate — whales + icebergs", drive: "Local",
      plan: ["Morning: whale + iceberg boat tour (reserve ahead).", "Afternoon: lunch, Long Point Lighthouse, coastal exploring.", "Keep Sunday as weather backup if today's tour is cancelled."],
      hike: { name: "Rockcut Trails / Long Point", diff: "Easy–Medium", note: "Short, well-marked coastal loops near the lighthouse. Excellent iceberg viewpoints. Pick a shorter segment for the 4-yo." },
      tags: ["ferry", "iceberg", "hike"] },
    { id: uid(), n: 9, date: "2027-07-04", overnight: "Twillingate (Night 3)", lodging: "Hotel, Airbnb or coastal camping",
      title: "Twillingate — free / weather backup", drive: "None",
      plan: ["No major driving.", "Backup boat-tour day if needed.", "Otherwise: hike, explore fishing villages, iceberg-spotting, kayak if calm, or just a slow vacation day."],
      hike: { name: "Lower Little Harbour / coastal paths", diff: "Easy", note: "Gentle village-and-shore walking. Good day to let the boys set the pace." },
      tags: ["iceberg", "hike"] },
    { id: uid(), n: 10, date: "2027-07-05", overnight: "Gros Morne (Night 1)", lodging: "Hotel, Airbnb or oTENTik/yurt",
      title: "Twillingate → Gros Morne", drive: "≈5–5½ hr",
      plan: ["Leave ~8:00 AM; lunch + stretch stop en route.", "Arrive Gros Morne in the afternoon.", "Easy evening: check in, dinner, sunset/scenery."],
      hike: null, tags: ["car"] },
    { id: uid(), n: 11, date: "2027-07-06", overnight: "Gros Morne (Night 2)", lodging: "Hotel, Airbnb or oTENTik/yurt",
      title: "Gros Morne — Western Brook Pond", drive: "Local",
      plan: ["Drive to the Western Brook Pond trailhead.", "Walk ~3 km (flat) to the dock.", "Boat tour through the fjord (~2 hr) — reserve ahead.", "Walk back; easy afternoon at Rocky Harbour or Lobster Cove Head."],
      hike: { name: "Western Brook Pond approach trail", diff: "Easy", note: "~3 km each way, flat gravel/boardwalk across the coastal plain. Very doable for both boys with snack breaks." },
      tags: ["ferry", "hike"] },
    { id: uid(), n: 12, date: "2027-07-07", overnight: "Gros Morne (Night 3)", lodging: "Hotel, Airbnb or oTENTik/yurt",
      title: "Gros Morne — Tablelands / Earth's Mantle", drive: "Local",
      plan: ["Morning: guided 'Walk Upon the Earth's Mantle' if the 2027 schedule works.", "Alternative: independent Tablelands Trail.", "Exposed mantle rock — a signature geology stop.", "Keep the afternoon flexible; add a second short hike only if everyone's game."],
      hike: { name: "Tablelands Trail", diff: "Easy–Medium", note: "~4 km return, flat gravel through orange mantle rock. Feels like another planet — kids love it. Bring water; little shade." },
      tags: ["hike", "mountain"] },
    { id: uid(), n: 13, date: "2027-07-08", overnight: "Overnight ferry", lodging: "Ferry (cabin optional)",
      title: "Gros Morne → Port aux Basques → ferry", drive: "≈4 hr + ferry",
      plan: ["Drive Gros Morne → Port aux Basques (~4 hr). Lunch en route.", "Late Port aux Basques → North Sydney ferry (~7 hr).", "Overnight on the ferry."],
      hike: null, tags: ["car", "ferry"] },
    { id: uid(), n: 14, date: "2027-07-09", overnight: "Bay of Fundy area", lodging: "Hotel or Airbnb",
      title: "North Sydney → Bay of Fundy", drive: "≈5–6 hr",
      plan: ["Arrive Nova Scotia in the morning.", "Drive to the Burntcoat Head / Minas Basin area (~5–6 hr).", "Use the 2027 tide table to time it right.", "Goal: walk the sea floor at low tide; watch the tide return if timing allows."],
      hike: { name: "Burntcoat Head ocean-floor walk", diff: "Easy", note: "At low tide you walk where the ocean was — the world's highest tides. Magical and easy for the boys. Check the tide chart the night before." },
      tags: ["car", "hike"] },
    { id: uid(), n: 15, date: "2027-07-10", overnight: "HOME — Plainville, MA", lodging: "Home 🏡",
      title: "Bay of Fundy → Plainville", drive: "≈7–8 hr",
      plan: ["Breakfast + a final look at the coast.", "Drive home (~7–8 hr depending on overnight location).", "Arrive Plainville Saturday afternoon/evening — Sunday free before work Monday."],
      hike: null, tags: ["car", "home"] },
  ],
  todos: [
    { id: uid(), title: "Check everyone's passport validity (all 4)", cat: "Documents", due: "2026-12-01", pri: "very-high", done: false, notes: "Renewals take weeks. Kids need their own passports to cross into Canada." },
    { id: uid(), title: "Book Marine Atlantic: North Sydney → Argentia (Thu Jul 1)", cat: "Ferries", due: "2027-02-15", pri: "very-high", done: false, notes: "~16.5 hr overnight crossing. Reserve vehicle space + a cabin. Book the moment the 2027 schedule opens." },
    { id: uid(), title: "Book Marine Atlantic: Port aux Basques → North Sydney (Thu Jul 8)", cat: "Ferries", due: "2027-02-15", pri: "very-high", done: false, notes: "~7 hr crossing, runs daily. Choose the late sailing that fits the day." },
    { id: uid(), title: "Book CAT ferry: Bar Harbor → Yarmouth (Jun 26)", cat: "Ferries", due: "2027-03-01", pri: "high", done: false, notes: "Confirm the 2027 CAT schedule when released, then book." },
    { id: uid(), title: "Reserve Western Brook Pond boat tour (Jul 6)", cat: "Tours", due: "2027-03-15", pri: "very-high", done: false, notes: "Sells out. Build the Gros Morne day around the tour time." },
    { id: uid(), title: "Reserve Twillingate whale + iceberg boat tour (Jul 3)", cat: "Tours", due: "2027-03-15", pri: "high", done: false, notes: "Book a morning tour. Keep Sun Jul 4 as weather backup." },
    { id: uid(), title: "Book lodging: Yarmouth (Jun 26)", cat: "Lodging", due: "2027-02-01", pri: "high", done: false, notes: "1 night." },
    { id: uid(), title: "Book lodging: Peggy's Cove / St. Margaret's Bay (Jun 27)", cat: "Lodging", due: "2027-02-01", pri: "high", done: false, notes: "1 night." },
    { id: uid(), title: "Book lodging: Baddeck × 3 nights (Jun 28–30)", cat: "Lodging", due: "2027-02-01", pri: "high", done: false, notes: "Same base 3 nights — request a family room." },
    { id: uid(), title: "Book lodging: Twillingate × 3 nights (Jul 2–4)", cat: "Lodging", due: "2027-02-01", pri: "high", done: false, notes: "Windy coast = fewer black flies. Good camping candidate for up to 2 nights if you want it." },
    { id: uid(), title: "Book lodging: Gros Morne × 3 nights (Jul 5–7)", cat: "Lodging", due: "2027-02-01", pri: "high", done: false, notes: "Look at Parks Canada oTENTiks / cabins or a Rocky Harbour rental." },
    { id: uid(), title: "Book lodging: Bay of Fundy area (Jul 9)", cat: "Lodging", due: "2027-02-01", pri: "high", done: false, notes: "1 night near Burntcoat Head / Minas Basin." },
    { id: uid(), title: "Ferry cabins for both overnight crossings", cat: "Ferries", due: "2027-02-20", pri: "high", done: false, notes: "Especially the 16.5-hr Argentia route. Worth it with kids." },
    { id: uid(), title: "Check Skyline Trail 2027 parking-reservation rules", cat: "Tours", due: "2027-04-15", pri: "medium", done: false, notes: "If reservations are required and it's a hassle, pick Bog + Middle Head instead." },
    { id: uid(), title: "Buy Parks Canada admission (Cape Breton Highlands + Gros Morne)", cat: "Tours", due: "2027-05-01", pri: "medium", done: false, notes: "A family Discovery Pass may be cheaper than day passes — compare." },
    { id: uid(), title: "Confirm 'Walk Upon the Earth's Mantle' guided program (Jul 7)", cat: "Tours", due: "2027-05-01", pri: "low", done: false, notes: "Book if a good time is offered; otherwise the independent Tablelands Trail is flexible." },
    { id: uid(), title: "Check 2027 Bay of Fundy tide table", cat: "Planning", due: "2027-06-01", pri: "medium", done: false, notes: "Time the Jul 9 arrival for low tide at Burntcoat Head." },
    { id: uid(), title: "Car insurance valid in Canada + get roadside coverage", cat: "Vehicle", due: "2027-05-15", pri: "high", done: false, notes: "Confirm coverage crosses the border; carry proof." },
    { id: uid(), title: "Service the Santa Fe before the trip", cat: "Vehicle", due: "2027-06-12", pri: "high", done: false, notes: "Oil, tires, brakes, wipers. Long rural stretches with few services." },
    { id: uid(), title: "Fit rooftop cargo bag/box to the roof rack", cat: "Packing", due: "2027-06-15", pri: "medium", done: false, notes: "Frees up cabin room. Keep heavy/rarely-used gear up top; snacks + rain layers inside." },
    { id: uid(), title: "Download offline maps for NL + NS", cat: "Planning", due: "2027-06-20", pri: "medium", done: false, notes: "Cell coverage is spotty in rural Newfoundland." },
    { id: uid(), title: "Notify bank of travel + get some CAD cash", cat: "Money", due: "2027-06-20", pri: "medium", done: false, notes: "Small vendors may be cash-only." },
    { id: uid(), title: "Refill any prescriptions + pack a family first-aid kit", cat: "Health", due: "2027-06-18", pri: "high", done: false, notes: "Include kids' meds, motion-sickness options for ferries, sunscreen, bug protection." },
    { id: uid(), title: "Pack the car (layers, rain gear, bug protection, snacks)", cat: "Packing", due: "2027-06-24", pri: "medium", done: false, notes: "Coastal NS + NL weather turns fast even in July. Layers > bulk." },
  ],
  budget: {
    savingsGoal: 9000,
    saved: 0,
    categories: [
      { id: uid(), name: "Ferries", est: 1500 },
      { id: uid(), name: "Lodging", est: 3200 },
      { id: uid(), name: "Fuel", est: 900 },
      { id: uid(), name: "Food", est: 1800 },
      { id: uid(), name: "Tours & Activities", est: 700 },
      { id: uid(), name: "Park Admission", est: 150 },
      { id: uid(), name: "Souvenirs & Misc", est: 400 },
    ],
    expenses: [],
  },
  reservations: [],
});

const seedState = () => ({
  settings: {
    appName: "Fern & Ferry",
    theme: "fernwood",
    currency: "USD",
    reminderLeadDays: 14,
    notifications: true,
    family: [
      { id: uid(), name: "Me", role: "adult", emoji: "🧑", color: "#586B45" },
      { id: uid(), name: "My Partner", role: "adult", emoji: "🧑", color: "#B0684A" },
      { id: uid(), name: "Oldest (7)", role: "child", emoji: "🧒", color: "#C9963A" },
      { id: uid(), name: "Youngest (4)", role: "child", emoji: "🧒", color: "#5B7C8A" },
    ],
  },
  trips: [seedTrip()],
  activeTripId: "ns-nl-2027",
});

/* ------------------------------------------------------------------ */
/*  SMALL UI PRIMITIVES                                                */
/* ------------------------------------------------------------------ */
const PRI = {
  "very-high": { label: "Very high", c: "#B0503B" },
  high: { label: "High", c: "#C9963A" },
  medium: { label: "Medium", c: "#586B45" },
  low: { label: "Low", c: "#8A8672" },
};
const CAT_ICON = {
  Ferries: Ship, Lodging: Home, Tours: Camera, Documents: FileText,
  Vehicle: Car, Health: Heart, Packing: Luggage, Money: Wallet, Planning: Compass,
};
const TAG_ICON = { car: Car, ferry: Ship, hike: Mountain, iceberg: Snowflake, mountain: TreePine, home: Home };

function Btn({ children, onClick, t, kind = "primary", small, style, title }) {
  const base = {
    primary: { bg: t.primary, fg: "#fff", bd: t.primary },
    ghost: { bg: "transparent", fg: t.ink, bd: t.line },
    soft: { bg: t.primarySoft, fg: t.primaryDark, bd: t.primarySoft },
    danger: { bg: "transparent", fg: t.danger, bd: t.line },
  }[kind];
  return (
    <button onClick={onClick} title={title}
      className="inline-flex items-center gap-1.5 rounded-full font-medium transition active:scale-95"
      style={{ background: base.bg, color: base.fg, border: `1px solid ${base.bd}`,
        padding: small ? "5px 12px" : "9px 16px", fontSize: small ? 13 : 14, ...style }}>
      {children}
    </button>
  );
}

function Card({ children, t, style, onClick }) {
  return (
    <div onClick={onClick}
      style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18,
        boxShadow: "0 1px 2px rgba(60,55,40,.04), 0 6px 18px rgba(60,55,40,.05)", ...style }}>
      {children}
    </div>
  );
}

function Modal({ open, onClose, title, t, children, wide }) {
  if (!open) return null;
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(40,38,28,.45)" }}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col"
        style={{ background: t.paper2, maxWidth: wide ? 640 : 460, maxHeight: "92vh", border: `1px solid ${t.line}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${t.line}` }}>
          <h3 style={{ fontFamily: "Georgia, serif", color: t.ink, fontSize: 18, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ color: t.sub }}><X size={22} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, t }) {
  return (
    <label className="block mb-3">
      <span className="block mb-1.5" style={{ fontSize: 12.5, fontWeight: 600, color: t.sub, letterSpacing: .2 }}>{label}</span>
      {children}
    </label>
  );
}
const inputStyle = (t) => ({
  width: "100%", padding: "10px 12px", borderRadius: 12, border: `1px solid ${t.line}`,
  background: "#fff", color: t.ink, fontSize: 14, outline: "none",
});

function Progress({ value, max, t, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: t.line, borderRadius: 999, height: 10, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color || t.primary, borderRadius: 999, transition: "width .4s" }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN APP                                                           */
/* ------------------------------------------------------------------ */
export default function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState("dashboard");
  const [focusReservationId, setFocusReservationId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState(undefined); // undefined = still checking
  const saveTimer = useRef(null);
  const justWroteRef = useRef(false);
  const canEdit = !!session;

  useEffect(() => {
    (async () => {
      const saved = await store.get();
      setState(saved || seedState());
      setLoaded(true);
    })();

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));

    const channel = supabase
      .channel("app_state_changes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_state" }, (payload) => {
        if (justWroteRef.current) return; // ignore the echo of our own write
        if (payload.new?.data) setState(payload.new.data);
      })
      .subscribe();

    return () => {
      sub.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !state || !canEdit) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      justWroteRef.current = true;
      store.set(state).finally(() => { setTimeout(() => { justWroteRef.current = false; }, 800); });
    }, 400);
  }, [state, loaded, canEdit]);

  if (!state) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#E7E2D3", color: "#586B45" }}>
      <Leaf className="animate-pulse" /> </div>;
  }

  const t = THEMES[state.settings.theme] || THEMES.fernwood;
  const trip = state.trips.find((x) => x.id === state.activeTripId) || state.trips[0];

  // ---- state updaters ----
  const setSettings = (patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const updateTrip = (patch) => setState((s) => ({
    ...s, trips: s.trips.map((tr) => tr.id === trip.id ? { ...tr, ...patch } : tr),
  }));
  const setActiveTrip = (id) => setState((s) => ({ ...s, activeTripId: id }));
  const addTrip = (tr) => setState((s) => ({ ...s, trips: [...s.trips, tr], activeTripId: tr.id }));
  const removeTrip = (id) => setState((s) => {
    const trips = s.trips.filter((x) => x.id !== id);
    return { ...s, trips, activeTripId: trips[0]?.id || null };
  });

  const NAV = [
    { id: "dashboard", label: "Home", Icon: LayoutDashboard },
    { id: "itinerary", label: "Trip", Icon: MapIcon },
    { id: "calendar", label: "Calendar", Icon: CalendarIcon },
    { id: "todos", label: "Checklist", Icon: ListChecks },
    { id: "reservations", label: "Reserved", Icon: Ticket },
    { id: "budget", label: "Budget", Icon: Wallet },
    { id: "settings", label: "Settings", Icon: SettingsIcon },
  ];

  const shared = { t, state, setState, trip, updateTrip, setSettings, setView, canEdit, focusReservationId, setFocusReservationId };

  return (
    <div style={{ background: t.paper, minHeight: "100vh", color: t.ink,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-30" style={{ background: t.paper, borderBottom: `1px solid ${t.line}` }}>
        <div className="px-4 md:px-8 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center rounded-2xl flex-shrink-0" style={{ width: 40, height: 40, background: t.primary }}>
              <Sprout size={22} color="#fff" />
            </div>
            <div className="min-w-0">
              <div className="truncate" style={{ fontFamily: "Georgia, serif", fontSize: 18, lineHeight: 1, color: t.ink }}>{state.settings.appName}</div>
              <div style={{ fontSize: 11.5, color: t.sub }}>Family travel, well-planned</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <AuthControl t={t} session={session} />
            <TripSwitcher {...shared} setActiveTrip={setActiveTrip} />
          </div>
        </div>
        {session === null && (
          <div className="px-4 md:px-8 pb-2" style={{ fontSize: 12, color: t.sub }}>
            Viewing only — sign in to make changes.
          </div>
        )}
      </header>

      {/* Body */}
      <main className="px-4 md:px-8 pb-28 pt-4">
        {view === "dashboard" && <Dashboard {...shared} />}
        {view === "itinerary" && <Itinerary {...shared} />}
        {view === "calendar" && <CalendarView {...shared} />}
        {view === "todos" && <Todos {...shared} />}
        {view === "reservations" && <Reservations {...shared} />}
        {view === "budget" && <Budget {...shared} />}
        {view === "settings" && <SettingsView {...shared} addTrip={addTrip} removeTrip={removeTrip} setActiveTrip={setActiveTrip} />}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40" style={{ background: t.paper2, borderTop: `1px solid ${t.line}` }}>
        <div className="grid grid-cols-7">
          {NAV.map(({ id, label, Icon }) => {
            const active = view === id;
            return (
              <button key={id} onClick={() => setView(id)} className="flex flex-col items-center gap-0.5 py-2.5 transition"
                style={{ color: active ? t.primary : t.sub }}>
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AUTH (header)                                                      */
/* ------------------------------------------------------------------ */
function AuthControl({ t, session }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  if (session === undefined) return null; // still checking

  if (session) {
    return (
      <button onClick={() => supabase.auth.signOut()} title={session.user.email}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
        style={{ background: t.primarySoft, border: `1px solid ${t.line}`, fontSize: 12.5, fontWeight: 600, color: t.primaryDark }}>
        <CheckCircle2 size={14} /> Editing
      </button>
    );
  }

  const signIn = async () => {
    if (!email.trim() || !password) return;
    setStatus("Signing in…");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setStatus(error ? error.message : "");
    if (!error) { setOpen(false); setPassword(""); }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
        style={{ background: t.card, border: `1px solid ${t.line}`, fontSize: 12.5, fontWeight: 600, color: t.sub }}>
        Sign in to edit
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl p-3.5 z-50"
          style={{ background: t.paper2, border: `1px solid ${t.line}`, boxShadow: "0 10px 30px rgba(50,45,30,.15)" }}>
          <Field label="Email" t={t}>
            <input style={inputStyle(t)} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Password" t={t}>
            <input style={inputStyle(t)} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signIn()} placeholder="••••••••" />
          </Field>
          <Btn t={t} small onClick={signIn} style={{ width: "100%", justifyContent: "center" }}>Sign in</Btn>
          {status && <div style={{ fontSize: 11.5, color: t.danger, marginTop: 8, lineHeight: 1.4 }}>{status}</div>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TRIP SWITCHER (header)                                             */
/* ------------------------------------------------------------------ */
function TripSwitcher({ t, state, trip, setActiveTrip, setView }) {
  const [open, setOpen] = useState(false);
  if (!trip) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
        style={{ background: t.card, border: `1px solid ${t.line}` }}>
        <span style={{ fontSize: 16 }}>{trip.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.ink, maxWidth: 120 }} className="truncate">{trip.name}</span>
        <ChevronDown size={15} color={t.sub} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-2xl overflow-hidden z-50"
          style={{ background: t.paper2, border: `1px solid ${t.line}`, boxShadow: "0 10px 30px rgba(50,45,30,.15)" }}>
          {state.trips.map((tr) => (
            <button key={tr.id} onClick={() => { setActiveTrip(tr.id); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
              style={{ background: tr.id === trip.id ? t.primarySoft : "transparent", borderBottom: `1px solid ${t.line}` }}>
              <span style={{ fontSize: 17 }}>{tr.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: t.ink }}>{tr.name}</div>
                <div style={{ fontSize: 11, color: t.sub }}>{fmtShort(tr.startDate)} – {fmtShort(tr.endDate)}</div>
              </div>
              {tr.id === trip.id && <CheckCircle2 size={16} color={t.primary} />}
            </button>
          ))}
          <button onClick={() => { setView("settings"); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5" style={{ color: t.primary, fontSize: 13, fontWeight: 600 }}>
            <Plus size={16} /> New trip (in Settings)
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DASHBOARD                                                          */
/* ------------------------------------------------------------------ */
function Dashboard({ t, trip, state, setView, updateTrip }) {
  if (!trip) return <EmptyTrips t={t} setView={setView} />;
  const today = todayISO();
  const dTo = daysBetween(today, trip.startDate);
  const totalDays = trip.days.length;
  const doneTodos = trip.todos.filter((x) => x.done).length;
  const openTodos = trip.todos.filter((x) => !x.done);
  const lead = state.settings.reminderLeadDays;
  const dueSoon = openTodos
    .filter((x) => x.due && daysBetween(today, x.due) <= lead)
    .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  const overdue = openTodos.filter((x) => x.due && daysBetween(today, x.due) < 0);
  const est = trip.budget.categories.reduce((s, c) => s + (+c.est || 0), 0);
  const spent = trip.budget.expenses.reduce((s, e) => s + (+e.amount || 0), 0);
  const cur = state.settings.currency;

  return (
    <div className="space-y-4">
      {/* Countdown hero */}
      <Card t={t} style={{ overflow: "hidden" }}>
        <div style={{ background: t.primary, padding: "18px 20px", color: "#fff", position: "relative" }}>
          <div className="flex items-center gap-2" style={{ opacity: .9, fontSize: 13 }}>
            <span style={{ fontSize: 18 }}>{trip.emoji}</span> {trip.name}
          </div>
          <div className="flex items-end gap-3 mt-1">
            <div style={{ fontFamily: "Georgia, serif", fontSize: 44, lineHeight: 1 }}>
              {dTo > 0 ? dTo : dTo === 0 ? "Today" : "—"}
            </div>
            {dTo > 0 && <div style={{ paddingBottom: 6, opacity: .9 }}>days to go</div>}
          </div>
          <div style={{ fontSize: 13, opacity: .9, marginTop: 6 }}>
            {fmtLong(trip.startDate)} → {fmtLong(trip.endDate)} · {totalDays} days
          </div>
          <Leaf size={110} color="#fff" style={{ position: "absolute", right: -18, bottom: -30, opacity: .08 }} />
        </div>
        <div className="grid grid-cols-3 divide-x" style={{ borderColor: t.line }}>
          <Stat t={t} label="Checklist" value={`${doneTodos}/${trip.todos.length}`} sub="done" />
          <Stat t={t} label="Budget est." value={money(est, cur)} sub={`${money(spent, cur)} logged`} />
          <Stat t={t} label="Overnights" value={String(totalDays)} sub="nights planned" />
        </div>
      </Card>

      {/* Reminders */}
      {(overdue.length > 0 || dueSoon.length > 0) && (
        <Card t={t}>
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <Bell size={17} color={t.accent} />
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: 16, margin: 0 }}>Coming up</h3>
            <span style={{ fontSize: 11.5, color: t.sub }}>· within {lead} days</span>
          </div>
          <div className="px-2 pb-2">
            {overdue.map((x) => <ReminderRow key={x.id} x={x} t={t} today={today} overdue />)}
            {dueSoon.filter((x) => daysBetween(today, x.due) >= 0).map((x) => <ReminderRow key={x.id} x={x} t={t} today={today} />)}
          </div>
          <button onClick={() => setView("todos")} className="w-full py-2.5" style={{ color: t.primary, fontSize: 13, fontWeight: 600, borderTop: `1px solid ${t.line}` }}>
            Open full checklist →
          </button>
        </Card>
      )}

      {/* Trip signatures */}
      <div className="grid grid-cols-2 gap-3">
        <HighlightCard t={t} Icon={Snowflake} title="Icebergs" text="Twillingate sits in Iceberg Alley. Late June–early July is prime; check icebergfinder.com before the boat tour." />
        <HighlightCard t={t} Icon={Mountain} title="Kid-friendly trails" text="One easy/medium hike per big day — Bog Trail, Western Brook Pond, Tablelands, Fundy sea floor." />
        <HighlightCard t={t} Icon={Tent} title="Black-fly note" text="Late June is still fly season inland. Camp on windy coasts (Twillingate) and lean on hotels/yurts elsewhere." />
        <HighlightCard t={t} Icon={Car} title="Packing the Santa Fe" text="Roof cargo bag up top for bulky gear; keep the cabin roomy for 4 people + snacks on long drives." />
      </div>

      {/* Next stop */}
      {trip.days[0] && (
        <Card t={t}>
          <div className="px-4 py-3 flex items-center justify-between">
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: 16, margin: 0 }}>The route ahead</h3>
            <button onClick={() => setView("itinerary")} style={{ color: t.primary, fontSize: 13, fontWeight: 600 }}>See all →</button>
          </div>
          <div className="px-4 pb-4 flex gap-2 overflow-x-auto">
            {trip.days.slice(0, 6).map((d) => (
              <div key={d.id} className="flex-shrink-0 rounded-2xl px-3 py-2.5" style={{ background: t.primarySoft, width: 130 }}>
                <div style={{ fontSize: 11, color: t.primaryDark, fontWeight: 700 }}>Day {d.n} · {fmtShort(d.date)}</div>
                <div style={{ fontSize: 12.5, color: t.ink, marginTop: 3, lineHeight: 1.25 }}>{d.overnight}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ t, label, value, sub }) {
  return (
    <div className="px-3 py-3 text-center" style={{ borderColor: t.line }}>
      <div style={{ fontSize: 11, color: t.sub, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, color: t.ink, fontFamily: "Georgia, serif", marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: t.sub }}>{sub}</div>
    </div>
  );
}
function HighlightCard({ t, Icon, title, text }) {
  return (
    <Card t={t} style={{ padding: 14 }}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={18} color={t.primary} />
        <div style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>{title}</div>
      </div>
      <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.4 }}>{text}</div>
    </Card>
  );
}
function ReminderRow({ x, t, today, overdue }) {
  const Icon = CAT_ICON[x.cat] || Circle;
  const d = daysBetween(today, x.due);
  const when = overdue ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : `in ${d}d`;
  return (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl">
      <div className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, background: overdue ? "#F3DCD5" : t.accentSoft }}>
        <Icon size={15} color={overdue ? t.danger : t.accent} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate" style={{ fontSize: 13, color: t.ink, fontWeight: 500 }}>{x.title}</div>
        <div style={{ fontSize: 11, color: t.sub }}>{x.cat} · {fmtShort(x.due)}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: overdue ? t.danger : t.primary }}>{when}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DAY STOPS — approximate coordinates for the map, keyed by trip id  */
/*  then day number. Not part of the shared/editable data model; if a  */
/*  day isn't listed here, its card just shows no map.                */
/* ------------------------------------------------------------------ */
const DAY_STOPS = {
  "ns-nl-2027": {
    1: [{ name: "Plainville, MA", lat: 42.0084, lng: -71.3373 }, { name: "Bar Harbor, ME", lat: 44.3876, lng: -68.2039 }, { name: "Yarmouth, NS", lat: 43.8374, lng: -66.1174 }],
    2: [{ name: "Yarmouth, NS", lat: 43.8374, lng: -66.1174 }, { name: "Lunenburg, NS", lat: 44.3776, lng: -64.3103 }, { name: "Peggy's Cove, NS", lat: 44.4926, lng: -63.9188 }],
    3: [{ name: "Peggy's Cove, NS", lat: 44.4926, lng: -63.9188 }, { name: "Baddeck, NS", lat: 46.1004, lng: -60.7530 }],
    4: [{ name: "Baddeck, NS", lat: 46.1004, lng: -60.7530 }, { name: "Middle Head / Ingonish, NS", lat: 46.6580, lng: -60.3796 }],
    5: [{ name: "Baddeck, NS", lat: 46.1004, lng: -60.7530 }, { name: "Uisge Bàn Falls trailhead", lat: 46.0201, lng: -60.6270 }],
    6: [{ name: "Baddeck, NS", lat: 46.1004, lng: -60.7530 }, { name: "North Sydney, NS", lat: 46.2151, lng: -60.2564 }, { name: "Argentia, NL", lat: 47.2989, lng: -53.9909 }],
    7: [{ name: "Argentia, NL", lat: 47.2989, lng: -53.9909 }, { name: "Twillingate, NL", lat: 49.6425, lng: -54.7458 }],
    8: [{ name: "Twillingate, NL", lat: 49.6425, lng: -54.7458 }, { name: "Long Point Lighthouse", lat: 49.6772, lng: -54.7756 }],
    9: [{ name: "Twillingate, NL", lat: 49.6425, lng: -54.7458 }, { name: "Lower Little Harbour, NL", lat: 49.6198, lng: -54.7524 }],
    10: [{ name: "Twillingate, NL", lat: 49.6425, lng: -54.7458 }, { name: "Rocky Harbour, NL (Gros Morne)", lat: 49.5892, lng: -57.8763 }],
    11: [{ name: "Rocky Harbour, NL", lat: 49.5892, lng: -57.8763 }, { name: "Western Brook Pond trailhead", lat: 49.7648, lng: -57.8933 }],
    12: [{ name: "Rocky Harbour, NL", lat: 49.5892, lng: -57.8763 }, { name: "Tablelands Trail", lat: 49.4931, lng: -57.9522 }],
    13: [{ name: "Rocky Harbour, NL", lat: 49.5892, lng: -57.8763 }, { name: "Port aux Basques, NL", lat: 47.5711, lng: -59.1400 }, { name: "North Sydney, NS", lat: 46.2151, lng: -60.2564 }],
    14: [{ name: "North Sydney, NS", lat: 46.2151, lng: -60.2564 }, { name: "Burntcoat Head, NS", lat: 45.3106, lng: -63.7994 }],
    15: [{ name: "Burntcoat Head, NS", lat: 45.3106, lng: -63.7994 }, { name: "Plainville, MA", lat: 42.0084, lng: -71.3373 }],
  },
};

function DayMap({ t, stops, planPreview }) {
  if (!stops || stops.length === 0) return null;
  const bounds = stops.map((s) => [s.lat, s.lng]);
  return (
    <div className="rounded-2xl overflow-hidden sm:w-1/2 flex-shrink-0" style={{ height: 200, border: `1px solid ${t.line}`, position: "relative", zIndex: 0 }}>
      <MapContainer bounds={bounds} boundsOptions={{ padding: [28, 28] }} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={bounds} pathOptions={{ color: t.primary, weight: 3, dashArray: "6 8" }} />
        {stops.map((s, i) => (
          <Marker key={i} position={[s.lat, s.lng]}
            eventHandlers={{ click: () => window.open(`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`, "_blank", "noopener") }}>
            <LeafletTooltip direction="top" offset={[0, -30]}>
              <div style={{ maxWidth: 200 }}>
                <div style={{ fontWeight: 700 }}>{s.name}</div>
                {planPreview && <div style={{ fontSize: 11, marginTop: 2 }}>{planPreview}</div>}
                <div style={{ fontSize: 10.5, marginTop: 3, opacity: .75 }}>Click for Google Maps →</div>
              </div>
            </LeafletTooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ITINERARY                                                          */
/* ------------------------------------------------------------------ */
function Itinerary({ t, trip, updateTrip, canEdit, setView, setFocusReservationId }) {
  const [editDay, setEditDay] = useState(null);
  if (!trip) return null;

  const saveDay = (day) => {
    updateTrip({ days: trip.days.map((d) => d.id === day.id ? day : d) });
    setEditDay(null);
  };

  const goToReservations = (dayReservations) => {
    if (dayReservations.length === 1) setFocusReservationId(dayReservations[0].id);
    setView("reservations");
  };

  return (
    <div className="space-y-3">
      <SectionHeader t={t} title={trip.name} sub={`${fmtLong(trip.startDate)} → ${fmtLong(trip.endDate)}`} />
      {trip.days.map((d) => {
        const dayReservations = (trip.reservations || []).filter((r) => reservationDayIds(r).includes(d.id));
        return (
        <Card key={d.id} t={t}>
          <div className="px-4 pt-3.5 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex flex-col items-center justify-center rounded-xl" style={{ background: t.primary, color: "#fff", width: 46, height: 46 }}>
                  <span style={{ fontSize: 9, opacity: .85, lineHeight: 1 }}>DAY</span>
                  <span style={{ fontSize: 20, fontFamily: "Georgia, serif", lineHeight: 1 }}>{d.n}</span>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: t.sub, fontWeight: 600 }}>{fmtLong(d.date)}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.ink, lineHeight: 1.2 }}>{d.title}</div>
                </div>
              </div>
              {canEdit && <button onClick={() => setEditDay(d)} style={{ color: t.sub }}><Pencil size={16} /></button>}
            </div>

            {dayReservations.length > 0 && (
              <button onClick={() => goToReservations(dayReservations)}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 mt-2.5"
                style={{ fontSize: 11.5, fontWeight: 700, background: t.primarySoft, color: t.primaryDark }}>
                <Ticket size={12} /> {dayReservations.length === 1 ? "View reservation" : `${dayReservations.length} reservations`} →
              </button>
            )}

            <div className="flex flex-col sm:flex-row gap-4 mt-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip t={t} icon={<Home size={12} />} text={d.overnight} solid />
                  {d.lodging && <Chip t={t} icon={<Tent size={12} />} text={d.lodging} />}
                  {d.drive && <Chip t={t} icon={<Clock size={12} />} text={d.drive} />}
                  {(d.tags || []).map((tag) => {
                    const I = TAG_ICON[tag] || Flag;
                    return <span key={tag} className="inline-flex items-center justify-center rounded-full" style={{ width: 24, height: 24, background: t.waterSoft }}><I size={13} color={t.water} /></span>;
                  })}
                </div>

                <ul className="mt-3 space-y-1.5">
                  {d.plan.map((p, i) => (
                    <li key={i} className="flex gap-2" style={{ fontSize: 13.5, color: t.ink, lineHeight: 1.4 }}>
                      <span style={{ color: t.primary, marginTop: 2 }}>•</span><span>{p}</span>
                    </li>
                  ))}
                </ul>

                {d.hike && (
                  <div className="mt-3 rounded-2xl px-3 py-2.5" style={{ background: t.primarySoft }}>
                    <div className="flex items-center gap-1.5">
                      <Mountain size={14} color={t.primaryDark} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: t.primaryDark }}>{d.hike.name}</span>
                      <span className="ml-auto rounded-full px-2 py-0.5" style={{ fontSize: 10.5, fontWeight: 700, background: "#fff", color: t.primaryDark }}>{d.hike.diff}</span>
                    </div>
                    <div style={{ fontSize: 12, color: t.primaryDark, marginTop: 4, lineHeight: 1.4, opacity: .92 }}>{d.hike.note}</div>
                  </div>
                )}
              </div>

              <DayMap t={t} stops={DAY_STOPS[trip.id]?.[d.n]} planPreview={d.plan[0]} />
            </div>
          </div>
        </Card>
        );
      })}

      <DayEditModal day={editDay} onClose={() => setEditDay(null)} onSave={saveDay} t={t} />
    </div>
  );
}

function Chip({ t, icon, text, solid }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
      style={{ fontSize: 11.5, fontWeight: 600, background: solid ? t.accentSoft : t.card, color: solid ? "#8A6A22" : t.sub, border: solid ? "none" : `1px solid ${t.line}` }}>
      {icon}{text}
    </span>
  );
}

function DayEditModal({ day, onClose, onSave, t }) {
  const [d, setD] = useState(day);
  useEffect(() => setD(day), [day]);
  if (!day || !d) return null;
  const setPlanItem = (i, v) => setD({ ...d, plan: d.plan.map((p, idx) => idx === i ? v : p) });
  return (
    <Modal open={!!day} onClose={onClose} title={`Edit Day ${d.n}`} t={t} wide>
      <Field label="Title" t={t}><input style={inputStyle(t)} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Overnight" t={t}><input style={inputStyle(t)} value={d.overnight} onChange={(e) => setD({ ...d, overnight: e.target.value })} /></Field>
        <Field label="Lodging type" t={t}><input style={inputStyle(t)} value={d.lodging || ""} onChange={(e) => setD({ ...d, lodging: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" t={t}><input type="date" style={inputStyle(t)} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
        <Field label="Drive time" t={t}><input style={inputStyle(t)} value={d.drive || ""} onChange={(e) => setD({ ...d, drive: e.target.value })} /></Field>
      </div>
      <Field label="Plan (one step per line)" t={t}>
        <textarea style={{ ...inputStyle(t), minHeight: 120, resize: "vertical" }}
          value={d.plan.join("\n")} onChange={(e) => setD({ ...d, plan: e.target.value.split("\n").filter((x) => x.trim() !== "" || true) })} />
      </Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn t={t} kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn t={t} onClick={() => onSave({ ...d, plan: d.plan.filter((p) => p.trim() !== "") })}><Save size={15} /> Save day</Btn>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  CALENDAR                                                           */
/* ------------------------------------------------------------------ */
function CalendarView({ t, trip, setView }) {
  const start = trip ? pd(trip.startDate) : new Date();
  const [cursor, setCursor] = useState({ y: start.getFullYear(), m: start.getMonth() });
  if (!trip) return null;

  // build lookup maps
  const dayMap = {}; trip.days.forEach((d) => { dayMap[d.date] = d; });
  const todoMap = {}; trip.todos.forEach((x) => { if (x.due) (todoMap[x.due] ||= []).push(x); });

  const first = new Date(cursor.y, cursor.m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const shift = (delta) => {
    let m = cursor.m + delta, y = cursor.y;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    setCursor({ y, m });
  };
  const monthTodos = trip.todos.filter((x) => x.due && pd(x.due).getMonth() === cursor.m && pd(x.due).getFullYear() === cursor.y)
    .sort((a, b) => a.due.localeCompare(b.due));

  return (
    <div className="space-y-4">
      <SectionHeader t={t} title="Calendar" sub="Trip days and every to-do due date, together" />
      <Card t={t}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => shift(-1)} style={{ color: t.sub }}><ChevronLeft size={22} /></button>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 17, color: t.ink }}>{MONTHS[cursor.m]} {cursor.y}</div>
          <button onClick={() => shift(1)} style={{ color: t.sub }}><ChevronRight size={22} /></button>
        </div>
        <div className="grid grid-cols-7 px-2">
          {DOW.map((d) => <div key={d} className="text-center py-1" style={{ fontSize: 10.5, fontWeight: 700, color: t.sub }}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 px-2 pb-3">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const key = iso(new Date(cursor.y, cursor.m, d));
            const isTripDay = !!dayMap[key];
            const todos = todoMap[key] || [];
            const isToday = key === todayISO();
            return (
              <div key={i} className="rounded-xl flex flex-col items-center py-1.5" style={{
                minHeight: 46, background: isTripDay ? t.primarySoft : "transparent",
                border: isToday ? `1.5px solid ${t.accent}` : `1px solid transparent`,
              }}>
                <span style={{ fontSize: 12.5, fontWeight: isTripDay ? 700 : 500, color: isTripDay ? t.primaryDark : t.ink }}>{d}</span>
                {isTripDay && <span style={{ fontSize: 8.5, color: t.primaryDark, fontWeight: 700 }}>D{dayMap[key].n}</span>}
                {todos.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {todos.slice(0, 3).map((x) => <span key={x.id} style={{ width: 5, height: 5, borderRadius: 999, background: PRI[x.pri].c }} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 px-4 py-2.5 flex-wrap" style={{ borderTop: `1px solid ${t.line}`, fontSize: 11, color: t.sub }}>
          <span className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, borderRadius: 4, background: t.primarySoft, display: "inline-block" }} /> Trip day</span>
          <span className="flex items-center gap-1.5"><span style={{ width: 6, height: 6, borderRadius: 999, background: t.accent, display: "inline-block" }} /> To-do due</span>
          <span className="flex items-center gap-1.5"><span style={{ width: 12, height: 12, borderRadius: 4, border: `1.5px solid ${t.accent}`, display: "inline-block" }} /> Today</span>
        </div>
      </Card>

      {monthTodos.length > 0 && (
        <Card t={t}>
          <div className="px-4 py-3" style={{ fontFamily: "Georgia, serif", fontSize: 15 }}>Due in {MONTHS[cursor.m]}</div>
          <div className="px-2 pb-2">
            {monthTodos.map((x) => {
              const Icon = CAT_ICON[x.cat] || Circle;
              return (
                <div key={x.id} className="flex items-center gap-2.5 px-2 py-2">
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: PRI[x.pri].c }} />
                  <Icon size={15} color={t.sub} />
                  <div className="flex-1 min-w-0"><div className="truncate" style={{ fontSize: 13, color: x.done ? t.sub : t.ink, textDecoration: x.done ? "line-through" : "none" }}>{x.title}</div></div>
                  <span style={{ fontSize: 11.5, color: t.sub, fontWeight: 600 }}>{fmtShort(x.due)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TODOS / CHECKLIST                                                  */
/* ------------------------------------------------------------------ */
function Todos({ t, trip, updateTrip, state, canEdit }) {
  const [edit, setEdit] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [filter, setFilter] = useState("all");
  if (!trip) return null;

  const toggle = (id) => updateTrip({ todos: trip.todos.map((x) => x.id === id ? { ...x, done: !x.done } : x) });
  const save = (todo) => {
    if (todo.id) updateTrip({ todos: trip.todos.map((x) => x.id === todo.id ? todo : x) });
    else updateTrip({ todos: [...trip.todos, { ...todo, id: uid() }] });
    setEdit(null);
  };
  const del = (id) => { updateTrip({ todos: trip.todos.filter((x) => x.id !== id) }); setEdit(null); };

  const cats = ["all", ...Array.from(new Set(trip.todos.map((x) => x.cat)))];
  let list = trip.todos.filter((x) => filter === "all" || x.cat === filter);
  const open = list.filter((x) => !x.done).sort((a, b) => (a.due || "9").localeCompare(b.due || "9"));
  const done = list.filter((x) => x.done);
  const pct = trip.todos.length ? Math.round(trip.todos.filter((x) => x.done).length / trip.todos.length * 100) : 0;
  const reservedIds = new Set((trip.reservations || []).flatMap((r) => reservationTodoIds(r)));

  return (
    <div className="space-y-4">
      <SectionHeader t={t} title="Pre-trip checklist" sub={`${trip.todos.filter((x) => x.done).length} of ${trip.todos.length} complete`}
        action={canEdit && <Btn t={t} small onClick={() => setEdit({ title: "", cat: "Planning", due: "", pri: "medium", done: false, notes: "" })}><Plus size={15} /> Add</Btn>} />

      <Card t={t} style={{ padding: 14 }}>
        <div className="flex items-center justify-between mb-2"><span style={{ fontSize: 12.5, fontWeight: 600, color: t.sub }}>Overall progress</span><span style={{ fontSize: 13, fontWeight: 700, color: t.primary }}>{pct}%</span></div>
        <Progress value={pct} max={100} t={t} />
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {cats.map((c) => (
          <button key={c} onClick={() => setFilter(c)} className="flex-shrink-0 rounded-full px-3 py-1.5"
            style={{ fontSize: 12.5, fontWeight: 600, background: filter === c ? t.primary : t.card, color: filter === c ? "#fff" : t.sub, border: `1px solid ${filter === c ? t.primary : t.line}` }}>
            {c === "all" ? "All" : c}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {open.map((x) => <TodoRow key={x.id} x={x} t={t} onToggle={toggle} onEdit={setEdit} canEdit={canEdit} reserved={reservedIds.has(x.id)} />)}
      </div>

      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone((s) => !s)} className="flex items-center gap-1.5 py-2" style={{ color: t.sub, fontSize: 13, fontWeight: 600 }}>
            <ChevronDown size={16} style={{ transform: showDone ? "rotate(180deg)" : "none", transition: "transform .2s" }} /> Completed ({done.length})
          </button>
          {showDone && <div className="space-y-2">{done.map((x) => <TodoRow key={x.id} x={x} t={t} onToggle={toggle} onEdit={setEdit} canEdit={canEdit} reserved={reservedIds.has(x.id)} />)}</div>}
        </div>
      )}

      <TodoEditModal todo={edit} onClose={() => setEdit(null)} onSave={save} onDelete={del} t={t} />
    </div>
  );
}

function TodoRow({ x, t, onToggle, onEdit, canEdit, reserved }) {
  const Icon = CAT_ICON[x.cat] || Circle;
  const overdue = x.due && !x.done && daysBetween(todayISO(), x.due) < 0;
  return (
    <Card t={t} style={{ padding: 0 }}>
      <div className="flex items-start gap-3 px-3.5 py-3">
        <button onClick={canEdit ? () => onToggle(x.id) : undefined} className="mt-0.5" style={{ cursor: canEdit ? "pointer" : "default" }}>
          {x.done ? <CheckCircle2 size={22} color={t.primary} /> : <Circle size={22} color={t.line} />}
        </button>
        <div className="flex-1 min-w-0" onClick={canEdit ? () => onEdit(x) : undefined} style={{ cursor: canEdit ? "pointer" : "default" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: x.done ? t.sub : t.ink, textDecoration: x.done ? "line-through" : "none", lineHeight: 1.3 }}>{x.title}</div>
          {x.notes && <div className="truncate" style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{x.notes}</div>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ fontSize: 10.5, fontWeight: 600, background: t.primarySoft, color: t.primaryDark }}><Icon size={11} /> {x.cat}</span>
            {x.due && <span style={{ fontSize: 11, fontWeight: 600, color: overdue ? t.danger : t.sub }}>{overdue ? "⚠ " : ""}{fmtShort(x.due)}</span>}
            <span className="rounded-full px-2 py-0.5" style={{ fontSize: 10, fontWeight: 700, background: "#fff", color: PRI[x.pri].c, border: `1px solid ${PRI[x.pri].c}` }}>{PRI[x.pri].label}</span>
            {reserved && <span className="inline-flex items-center gap-1" style={{ fontSize: 10.5, fontWeight: 700, color: t.primaryDark }}><Ticket size={11} /> Booked</span>}
          </div>
        </div>
        {canEdit && <button onClick={() => onEdit(x)} style={{ color: t.sub }}><Pencil size={15} /></button>}
      </div>
    </Card>
  );
}

function TodoEditModal({ todo, onClose, onSave, onDelete, t }) {
  const [x, setX] = useState(todo);
  useEffect(() => setX(todo), [todo]);
  if (!todo) return null;
  const cats = ["Ferries", "Lodging", "Tours", "Documents", "Vehicle", "Health", "Packing", "Money", "Planning"];
  return (
    <Modal open={!!todo} onClose={onClose} title={todo.id ? "Edit item" : "New checklist item"} t={t}>
      <Field label="What needs doing?" t={t}><input style={inputStyle(t)} value={x.title} onChange={(e) => setX({ ...x, title: e.target.value })} placeholder="e.g. Book the ferry" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" t={t}>
          <select style={inputStyle(t)} value={x.cat} onChange={(e) => setX({ ...x, cat: e.target.value })}>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Priority" t={t}>
          <select style={inputStyle(t)} value={x.pri} onChange={(e) => setX({ ...x, pri: e.target.value })}>
            {Object.entries(PRI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Due date" t={t}><input type="date" style={inputStyle(t)} value={x.due || ""} onChange={(e) => setX({ ...x, due: e.target.value })} /></Field>
      <Field label="Notes" t={t}><textarea style={{ ...inputStyle(t), minHeight: 70, resize: "vertical" }} value={x.notes || ""} onChange={(e) => setX({ ...x, notes: e.target.value })} /></Field>
      <div className="flex justify-between items-center mt-2">
        {todo.id ? <Btn t={t} kind="danger" small onClick={() => onDelete(todo.id)}><Trash2 size={14} /> Delete</Btn> : <span />}
        <div className="flex gap-2">
          <Btn t={t} kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn t={t} onClick={() => x.title.trim() && onSave(x)}><Save size={15} /> Save</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  RESERVATIONS                                                       */
/* ------------------------------------------------------------------ */
const RESERVATION_TYPES = ["Hotel", "Ferry", "Tour", "Flight", "Car Rental", "Other"];
const RES_TYPE_ICON = { Hotel: Home, Ferry: Ship, Tour: Camera, Flight: Plane, "Car Rental": Car, Other: FileText };
const BOOKABLE_CATEGORIES = ["Ferries", "Lodging", "Tours"];
const CAT_TO_RES_TYPE = { Ferries: "Ferry", Lodging: "Hotel", Tours: "Tour" };
// Reservations used to store a single `dayId`; multi-day linking needs an
// array. Fall back to the old field so reservations saved before this
// change keep working without a data migration.
const reservationDayIds = (r) => r.dayIds || (r.dayId ? [r.dayId] : []);
const reservationTodoIds = (r) => r.todoIds || (r.todoId ? [r.todoId] : []);
const blankReservation = () => ({
  type: "Hotel", title: "", host: "", location: "", confirmationNumber: "",
  startDate: "", endDate: "", startTime: "", endTime: "", dayIds: [], todoIds: [], notes: "", filePath: null,
});

function Reservations({ t, trip, updateTrip, canEdit, focusReservationId, setFocusReservationId }) {
  const [edit, setEdit] = useState(null);
  const list = trip?.reservations || [];

  useEffect(() => {
    if (!focusReservationId) return;
    const found = list.find((r) => r.id === focusReservationId);
    if (found) setEdit(found);
    setFocusReservationId(null);
  }, [focusReservationId]);

  if (!trip) return null;

  const save = (r) => {
    if (r.id) updateTrip({ reservations: list.map((x) => x.id === r.id ? r : x) });
    else updateTrip({ reservations: [...list, { ...r, id: uid() }] });
    setEdit(null);
  };
  const del = (id) => { updateTrip({ reservations: list.filter((x) => x.id !== id) }); setEdit(null); };

  const sorted = [...list].sort((a, b) => (a.startDate || "9").localeCompare(b.startDate || "9"));
  const bookable = trip.todos.filter((x) => BOOKABLE_CATEGORIES.includes(x.cat));
  const openCount = bookable.filter((x) => !list.some((r) => reservationTodoIds(r).includes(x.id))).length;

  const addForTodo = (x) => setEdit({ ...blankReservation(), type: CAT_TO_RES_TYPE[x.cat] || "Other", title: x.title, todoIds: [x.id] });

  return (
    <div className="space-y-4">
      <SectionHeader t={t} title="Reservations" sub={`${list.length} tracked`}
        action={canEdit && <Btn t={t} small onClick={() => setEdit(blankReservation())}><Plus size={15} /> Add</Btn>} />

      {bookable.length > 0 && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: t.sub, marginBottom: 6 }}>
            Needs a booking {openCount > 0 ? `(${openCount} open)` : "— all set"}
          </div>
          <div className="space-y-2">
            {bookable.map((x) => (
              <BookingRow key={x.id} x={x} t={t} canEdit={canEdit} reservations={list} onAdd={() => addForTodo(x)} onEditReservation={setEdit} />
            ))}
          </div>
        </div>
      )}

      <div>
        {bookable.length > 0 && <div style={{ fontSize: 12.5, fontWeight: 700, color: t.sub, marginBottom: 6 }}>All reservations</div>}
        {sorted.length === 0 ? (
          <Card t={t} style={{ padding: 30, textAlign: "center" }}>
            <Ticket size={30} color={t.line} className="mx-auto mb-2" />
            <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.4 }}>
              No reservations tracked yet.{canEdit ? " Add hotels, ferries, tours — anything that needs a confirmation number." : ""}
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {sorted.map((r) => (
              <ReservationRow key={r.id} r={r} t={t} trip={trip} onEdit={canEdit ? () => setEdit(r) : undefined} />
            ))}
          </div>
        )}
      </div>

      <ReservationEditModal reservation={edit} onClose={() => setEdit(null)} onSave={save} onDelete={del} t={t} trip={trip} />
    </div>
  );
}

function BookingRow({ x, t, canEdit, reservations, onAdd, onEditReservation }) {
  const Icon = CAT_ICON[x.cat] || Circle;
  const linked = reservations.filter((r) => reservationTodoIds(r).includes(x.id));
  const booked = linked.length > 0;
  return (
    <Card t={t} style={{ padding: 0 }}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 34, height: 34, background: booked ? t.primarySoft : t.accentSoft }}>
          <Icon size={16} color={booked ? t.primaryDark : t.accent} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: t.ink }}>{x.title}</div>
          <div style={{ fontSize: 11, color: t.sub, marginTop: 1 }}>{x.cat}{x.due ? ` · due ${fmtShort(x.due)}` : ""}</div>
        </div>
        {booked ? (
          <button onClick={() => onEditReservation(linked[0])} className="flex items-center gap-1 rounded-full px-2.5 py-1 flex-shrink-0"
            style={{ fontSize: 11.5, fontWeight: 700, color: t.primaryDark, background: t.primarySoft }}>
            <CheckCircle2 size={13} /> {linked.length > 1 ? `${linked.length} booked` : "Booked"}
          </button>
        ) : canEdit ? (
          <Btn t={t} small kind="soft" onClick={onAdd} style={{ flexShrink: 0 }}><Plus size={13} /> Add</Btn>
        ) : (
          <span style={{ fontSize: 11, color: t.sub, flexShrink: 0 }}>Not booked</span>
        )}
      </div>
    </Card>
  );
}

function dayRangeLabel(dayNumbers) {
  const ns = [...dayNumbers].sort((a, b) => a - b);
  if (ns.length === 0) return null;
  if (ns.length === 1) return `Day ${ns[0]}`;
  const contiguous = ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
  return contiguous ? `Days ${ns[0]}–${ns[ns.length - 1]}` : `Days ${ns.join(", ")}`;
}

function ReservationRow({ r, t, trip, onEdit }) {
  const Icon = RES_TYPE_ICON[r.type] || FileText;
  const days = reservationDayIds(r).map((id) => trip.days.find((d) => d.id === id)).filter(Boolean);
  const dayLabel = dayRangeLabel(days.map((d) => d.n));
  const todos = reservationTodoIds(r).map((id) => trip.todos.find((x) => x.id === id)).filter(Boolean);
  return (
    <Card t={t} style={{ padding: 0 }} onClick={onEdit}>
      <div className="flex items-start gap-3 px-3.5 py-3" style={{ cursor: onEdit ? "pointer" : "default" }}>
        <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 34, height: 34, background: t.primarySoft }}>
          <Icon size={16} color={t.primaryDark} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate" style={{ fontSize: 14, fontWeight: 600, color: t.ink }}>{r.title || r.type}</div>
          {(r.host || r.location) && (
            <div className="truncate" style={{ fontSize: 12, color: t.sub, marginTop: 1 }}>
              {r.host}{r.host && r.location ? " · " : ""}{r.location}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ fontSize: 10.5, fontWeight: 600, background: t.primarySoft, color: t.primaryDark }}>{r.type}</span>
            {r.startDate && (
              <span style={{ fontSize: 11, color: t.sub, fontWeight: 600 }}>
                {fmtShort(r.startDate)}{r.endDate && r.endDate !== r.startDate ? ` – ${fmtShort(r.endDate)}` : ""}{r.startTime ? ` · ${r.startTime}` : ""}
              </span>
            )}
            {r.confirmationNumber && <span style={{ fontSize: 11, color: t.sub }}>Conf# {r.confirmationNumber}</span>}
            {dayLabel && <span style={{ fontSize: 11, color: t.primary, fontWeight: 600 }}>{dayLabel}</span>}
            {todos.length > 0 && (
              <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: t.sub }}>
                <ListChecks size={11} /> {todos.map((x) => x.title).join(", ")}
              </span>
            )}
          </div>
        </div>
        {onEdit && <Pencil size={15} color={t.sub} style={{ flexShrink: 0 }} />}
      </div>
    </Card>
  );
}

function ReservationEditModal({ reservation, onClose, onSave, onDelete, t, trip }) {
  const [r, setR] = useState(reservation);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    setR(reservation ? { ...reservation, dayIds: reservationDayIds(reservation), todoIds: reservationTodoIds(reservation) } : reservation);
    setStatus("");
  }, [reservation]);

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setStatus("Uploading…");
    try {
      const path = `${trip.id}/${uid()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("reservation-files").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      setStatus("Reading with AI…");
      const { data, error: fnErr } = await supabase.functions.invoke("parse-reservation", { body: { path } });
      if (fnErr) {
        // supabase-js's error.message is a generic "non-2xx status" wrapper --
        // the useful detail is in the response body it wraps.
        let detail = fnErr.message;
        try {
          const body = await fnErr.context?.json();
          if (body?.error) detail = body.error;
        } catch { /* body wasn't JSON, fall back to the generic message */ }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      setR((prev) => ({
        ...prev,
        ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== "" && v != null)),
        filePath: path,
      }));
      setStatus("AI-filled below — please check before saving.");
    } catch (e) {
      setStatus("Couldn't read that file: " + (e.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!reservation) return;
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      handleFile(item.getAsFile());
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  if (!reservation || !r) return null;

  return (
    <Modal open={!!reservation} onClose={onClose} title={reservation.id ? "Edit reservation" : "New reservation"} t={t} wide>
      <div className="rounded-2xl px-3 py-3 mb-3" style={{ background: t.paper2, border: `1px dashed ${t.line}` }}>
        <label className="flex items-center gap-2 justify-center" style={{ fontSize: 13, fontWeight: 600, color: t.primary, cursor: busy ? "default" : "pointer" }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {busy ? "Working…" : "Upload a screenshot or file — AI fills in the fields"}
          <input type="file" accept="image/*,.pdf" className="hidden" disabled={busy} onChange={(e) => handleFile(e.target.files?.[0])} />
        </label>
        {!busy && <div style={{ fontSize: 11, color: t.sub, marginTop: 4, textAlign: "center" }}>or just paste (Ctrl+V / ⌘V) a copied screenshot anywhere in this form</div>}
        {status && <div style={{ fontSize: 11.5, color: t.sub, marginTop: 6, textAlign: "center" }}>{status}</div>}
      </div>

      <Field label="Type" t={t}>
        <select style={inputStyle(t)} value={r.type} onChange={(e) => setR({ ...r, type: e.target.value })}>
          {RESERVATION_TYPES.map((x) => <option key={x}>{x}</option>)}
        </select>
      </Field>
      <Field label="Title" t={t}><input style={inputStyle(t)} value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} placeholder="e.g. Baddeck Hotel" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Host / provider" t={t}><input style={inputStyle(t)} value={r.host} onChange={(e) => setR({ ...r, host: e.target.value })} /></Field>
        <Field label="Location" t={t}><input style={inputStyle(t)} value={r.location} onChange={(e) => setR({ ...r, location: e.target.value })} /></Field>
      </div>
      <Field label="Confirmation number" t={t}><input style={inputStyle(t)} value={r.confirmationNumber} onChange={(e) => setR({ ...r, confirmationNumber: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" t={t}><input type="date" style={inputStyle(t)} value={r.startDate} onChange={(e) => setR({ ...r, startDate: e.target.value })} /></Field>
        <Field label="End date" t={t}><input type="date" style={inputStyle(t)} value={r.endDate} onChange={(e) => setR({ ...r, endDate: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start time" t={t}><input type="time" style={inputStyle(t)} value={r.startTime} onChange={(e) => setR({ ...r, startTime: e.target.value })} /></Field>
        <Field label="End time" t={t}><input type="time" style={inputStyle(t)} value={r.endTime} onChange={(e) => setR({ ...r, endTime: e.target.value })} /></Field>
      </div>
      <Field label="Linked days (optional — pick more than one for a multi-night stay)" t={t}>
        <div className="flex flex-wrap gap-1.5 p-2 rounded-xl" style={{ border: `1px solid ${t.line}`, maxHeight: 160, overflowY: "auto" }}>
          {trip.days.map((d) => {
            const on = (r.dayIds || []).includes(d.id);
            return (
              <button key={d.id} type="button"
                onClick={() => setR({ ...r, dayIds: on ? r.dayIds.filter((id) => id !== d.id) : [...(r.dayIds || []), d.id] })}
                className="rounded-full px-2.5 py-1" title={`${fmtShort(d.date)} · ${d.overnight}`}
                style={{ fontSize: 11.5, fontWeight: 600, background: on ? t.primary : t.paper2, color: on ? "#fff" : t.sub, border: `1px solid ${on ? t.primary : t.line}` }}>
                Day {d.n}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Linked checklist items (optional — pick more than one if it covers several)" t={t}>
        <div className="space-y-0.5 p-2 rounded-xl" style={{ border: `1px solid ${t.line}`, maxHeight: 160, overflowY: "auto" }}>
          {trip.todos.map((x) => {
            const on = (r.todoIds || []).includes(x.id);
            return (
              <label key={x.id} className="flex items-center gap-2 px-1.5 py-1 rounded-lg" style={{ fontSize: 12.5, color: t.ink, cursor: "pointer", background: on ? t.primarySoft : "transparent" }}>
                <input type="checkbox" checked={on}
                  onChange={() => setR({ ...r, todoIds: on ? r.todoIds.filter((id) => id !== x.id) : [...(r.todoIds || []), x.id] })} />
                <span className="truncate">{x.title}</span>
              </label>
            );
          })}
        </div>
      </Field>
      <Field label="Notes" t={t}><textarea style={{ ...inputStyle(t), minHeight: 70, resize: "vertical" }} value={r.notes} onChange={(e) => setR({ ...r, notes: e.target.value })} /></Field>

      <div className="flex justify-between items-center mt-2">
        {reservation.id ? <Btn t={t} kind="danger" small onClick={() => onDelete(reservation.id)}><Trash2 size={14} /> Delete</Btn> : <span />}
        <div className="flex gap-2">
          <Btn t={t} kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn t={t} onClick={() => (r.title.trim() || r.host.trim()) && onSave(r)}><Save size={15} /> Save</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  BUDGET                                                             */
/* ------------------------------------------------------------------ */
function Budget({ t, trip, updateTrip, state, canEdit }) {
  const [addExp, setAddExp] = useState(false);
  const [editSavings, setEditSavings] = useState(false);
  if (!trip) return null;
  const b = trip.budget;
  const cur = state.settings.currency;
  const est = b.categories.reduce((s, c) => s + (+c.est || 0), 0);
  const spent = b.expenses.reduce((s, e) => s + (+e.amount || 0), 0);

  const setBudget = (patch) => updateTrip({ budget: { ...b, ...patch } });
  const addExpense = (e) => { setBudget({ expenses: [{ ...e, id: uid() }, ...b.expenses] }); setAddExp(false); };
  const delExpense = (id) => setBudget({ expenses: b.expenses.filter((x) => x.id !== id) });
  const setEst = (id, v) => setBudget({ categories: b.categories.map((c) => c.id === id ? { ...c, est: v } : c) });

  // spent per category
  const byCat = {};
  b.expenses.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + (+e.amount || 0); });
  const pieData = b.categories.filter((c) => (+c.est || 0) > 0).map((c) => ({ name: c.name, value: +c.est }));
  const PIE = [t.primary, t.accent, t.clay, t.water, "#8A8672", t.primaryDark, "#C9A66B"];

  return (
    <div className="space-y-4">
      <SectionHeader t={t} title="Budget" sub="Save toward the trip, then track what you spend" />

      {/* Savings goal */}
      <Card t={t}>
        <div style={{ background: t.primary, borderRadius: "17px 17px 0 0", padding: "16px 18px", color: "#fff" }} className="relative">
          <div className="flex items-center gap-2" style={{ fontSize: 13, opacity: .9 }}><PiggyBank size={17} /> Savings goal</div>
          <div className="flex items-end gap-2 mt-1">
            <span style={{ fontFamily: "Georgia, serif", fontSize: 32 }}>{money(b.saved, cur)}</span>
            <span style={{ paddingBottom: 4, opacity: .85 }}>of {money(b.savingsGoal, cur)}</span>
          </div>
          <div className="mt-2"><Progress value={b.saved} max={b.savingsGoal} t={t} color="#fff" /></div>
          {canEdit && <button onClick={() => setEditSavings(true)} className="absolute" style={{ top: 14, right: 16, color: "#fff", opacity: .9 }}><Pencil size={16} /></button>}
        </div>
        <div className="grid grid-cols-3 divide-x" style={{ borderColor: t.line }}>
          <Stat t={t} label="Estimated cost" value={money(est, cur)} sub="all categories" />
          <Stat t={t} label="Logged so far" value={money(spent, cur)} sub={`${est ? Math.round(spent / est * 100) : 0}% of est.`} />
          <Stat t={t} label="Still to save" value={money(Math.max(0, b.savingsGoal - b.saved), cur)} sub="to hit goal" />
        </div>
      </Card>

      {/* Estimate breakdown */}
      <Card t={t}>
        <div className="px-4 py-3 flex items-center justify-between">
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: 16, margin: 0 }}>Where the money goes</h3>
          <span style={{ fontSize: 11.5, color: t.sub }}>tap a number to edit</span>
        </div>
        <div className="px-4 pb-2 flex items-center gap-3">
          <div style={{ width: 120, height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={30} outerRadius={55} paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                </Pie>
                <RTooltip formatter={(v) => money(v, cur)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1.5">
            {b.categories.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                <span style={{ width: 9, height: 9, borderRadius: 2, background: PIE[i % PIE.length] }} />
                <span className="flex-1" style={{ fontSize: 12.5, color: t.ink }}>{c.name}</span>
                <input value={c.est} disabled={!canEdit} onChange={(e) => setEst(c.id, e.target.value.replace(/[^0-9.]/g, ""))}
                  style={{ width: 66, textAlign: "right", padding: "3px 6px", borderRadius: 8, border: `1px solid ${t.line}`, fontSize: 12.5, color: t.ink, background: t.paper2 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: `1px solid ${t.line}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>Total estimate</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: t.primary, fontFamily: "Georgia, serif" }}>{money(est, cur)}</span>
        </div>
      </Card>

      {/* Expenses log */}
      <Card t={t}>
        <div className="px-4 py-3 flex items-center justify-between">
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: 16, margin: 0 }}>Spending log</h3>
          {canEdit && <Btn t={t} small onClick={() => setAddExp(true)}><Plus size={15} /> Add</Btn>}
        </div>
        {b.expenses.length === 0 ? (
          <div className="px-4 pb-5 pt-1 text-center" style={{ color: t.sub, fontSize: 13 }}>
            <Wallet size={26} color={t.line} className="mx-auto mb-1.5" />
            Nothing logged yet. Add deposits and purchases as you go to watch spending against your estimate.
          </div>
        ) : (
          <div className="px-2 pb-2">
            {b.expenses.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-2 py-2.5" style={{ borderTop: `1px solid ${t.line}` }}>
                <div className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: t.accentSoft }}>
                  {React.createElement(CAT_ICON[e.category] || DollarSign, { size: 15, color: t.accent })}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate" style={{ fontSize: 13.5, color: t.ink, fontWeight: 500 }}>{e.label}</div>
                  <div style={{ fontSize: 11, color: t.sub }}>{e.category}{e.date ? ` · ${fmtShort(e.date)}` : ""}{e.who ? ` · ${e.who}` : ""}</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>{money(e.amount, cur)}</span>
                {canEdit && <button onClick={() => delExpense(e.id)} style={{ color: t.line }}><Trash2 size={15} /></button>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <ExpenseModal open={addExp} onClose={() => setAddExp(false)} onSave={addExpense} t={t} cats={b.categories} family={state.settings.family} />
      <SavingsModal open={editSavings} onClose={() => setEditSavings(false)} b={b} onSave={(patch) => { setBudget(patch); setEditSavings(false); }} t={t} cur={cur} />
    </div>
  );
}

function ExpenseModal({ open, onClose, onSave, t, cats, family }) {
  const [e, setE] = useState({ label: "", category: cats[0]?.name || "Food", amount: "", date: todayISO(), who: "" });
  useEffect(() => { if (open) setE({ label: "", category: cats[0]?.name || "Food", amount: "", date: todayISO(), who: "" }); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Log spending" t={t}>
      <Field label="What was it?" t={t}><input style={inputStyle(t)} value={e.label} onChange={(ev) => setE({ ...e, label: ev.target.value })} placeholder="e.g. Marine Atlantic deposit" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" t={t}><input style={inputStyle(t)} inputMode="decimal" value={e.amount} onChange={(ev) => setE({ ...e, amount: ev.target.value.replace(/[^0-9.]/g, "") })} placeholder="0.00" /></Field>
        <Field label="Category" t={t}><select style={inputStyle(t)} value={e.category} onChange={(ev) => setE({ ...e, category: ev.target.value })}>{cats.map((c) => <option key={c.id}>{c.name}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" t={t}><input type="date" style={inputStyle(t)} value={e.date} onChange={(ev) => setE({ ...e, date: ev.target.value })} /></Field>
        <Field label="Paid by" t={t}><select style={inputStyle(t)} value={e.who} onChange={(ev) => setE({ ...e, who: ev.target.value })}><option value="">—</option>{family.map((f) => <option key={f.id}>{f.name}</option>)}</select></Field>
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <Btn t={t} kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn t={t} onClick={() => e.label.trim() && e.amount && onSave({ ...e, amount: +e.amount })}><Plus size={15} /> Add expense</Btn>
      </div>
    </Modal>
  );
}

function SavingsModal({ open, onClose, b, onSave, t, cur }) {
  const [goal, setGoal] = useState(b.savingsGoal);
  const [saved, setSaved] = useState(b.saved);
  useEffect(() => { if (open) { setGoal(b.savingsGoal); setSaved(b.saved); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Savings goal" t={t}>
      <Field label={`Goal amount (${cur})`} t={t}><input style={inputStyle(t)} inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value.replace(/[^0-9.]/g, ""))} /></Field>
      <Field label={`Saved so far (${cur})`} t={t}><input style={inputStyle(t)} inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value.replace(/[^0-9.]/g, ""))} /></Field>
      <div className="flex justify-end gap-2 mt-1">
        <Btn t={t} kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn t={t} onClick={() => onSave({ savingsGoal: +goal || 0, saved: +saved || 0 })}><Save size={15} /> Save</Btn>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  SETTINGS                                                           */
/* ------------------------------------------------------------------ */
function SettingsView({ t, state, setSettings, addTrip, removeTrip, setActiveTrip, trip, setView, canEdit }) {
  const s = state.settings;
  const [editMember, setEditMember] = useState(null);
  const [newTrip, setNewTrip] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState("");

  const saveMember = (m) => {
    if (m.id) setSettings({ family: s.family.map((f) => f.id === m.id ? m : f) });
    else setSettings({ family: [...s.family, { ...m, id: uid() }] });
    setEditMember(null);
  };
  const delMember = (id) => { setSettings({ family: s.family.filter((f) => f.id !== id) }); setEditMember(null); };

  const requestNotify = async () => {
    try {
      if (typeof Notification === "undefined") { setNotifyStatus("This browser preview can't show system notifications — in-app reminders still work."); return; }
      const p = await Notification.requestPermission();
      setNotifyStatus(p === "granted" ? "Browser notifications on. Reminders will pop while the app is open." : "Permission denied — in-app reminders still work.");
    } catch { setNotifyStatus("Notifications aren't available in this preview — in-app reminders still work."); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader t={t} title="Settings" sub="Make the app yours" />

      {/* Profile / family */}
      <Card t={t}>
        <SettingHead t={t} Icon={Users} title="Family profile" action={canEdit && <Btn t={t} small kind="soft" onClick={() => setEditMember({ name: "", role: "child", emoji: "🧒", color: t.accent })}><Plus size={14} /> Add</Btn>} />
        <div className="px-3 pb-3 space-y-2">
          {s.family.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: t.paper2 }}>
              <div className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: f.color, fontSize: 19 }}>{f.emoji}</div>
              <div className="flex-1"><div style={{ fontSize: 14, fontWeight: 600, color: t.ink }}>{f.name}</div><div style={{ fontSize: 11.5, color: t.sub, textTransform: "capitalize" }}>{f.role}</div></div>
              {canEdit && <button onClick={() => setEditMember(f)} style={{ color: t.sub }}><Pencil size={15} /></button>}
            </div>
          ))}
        </div>
      </Card>

      {/* Appearance */}
      <Card t={t}>
        <SettingHead t={t} Icon={Leaf} title="Appearance" />
        <div className="px-4 pb-4">
          <div style={{ fontSize: 12.5, fontWeight: 600, color: t.sub, marginBottom: 8 }}>Theme</div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(THEMES).map(([k, th]) => (
              <button key={k} onClick={canEdit ? () => setSettings({ theme: k }) : undefined} className="rounded-2xl p-2.5 text-left"
                style={{ border: `2px solid ${s.theme === k ? th.primary : t.line}`, background: th.paper2, cursor: canEdit ? "pointer" : "default" }}>
                <div className="flex gap-1 mb-1.5">
                  {[th.primary, th.accent, th.water].map((c, i) => <span key={i} style={{ width: 16, height: 16, borderRadius: 5, background: c }} />)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: th.ink }}>{th.label}</div>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Field label="App name" t={t}><input style={inputStyle(t)} disabled={!canEdit} value={s.appName} onChange={(e) => setSettings({ appName: e.target.value })} /></Field>
          </div>
        </div>
      </Card>

      {/* Reminders */}
      <Card t={t}>
        <SettingHead t={t} Icon={Bell} title="Reminders & alerts" />
        <div className="px-4 pb-4 space-y-3">
          <Field label="Remind me this many days before a due date" t={t}>
            <select style={inputStyle(t)} disabled={!canEdit} value={s.reminderLeadDays} onChange={(e) => setSettings({ reminderLeadDays: +e.target.value })}>
              {[3, 7, 14, 21, 30].map((n) => <option key={n} value={n}>{n} days</option>)}
            </select>
          </Field>
          <div className="flex items-center justify-between rounded-2xl px-3 py-3" style={{ background: t.paper2 }}>
            <div><div style={{ fontSize: 13.5, fontWeight: 600, color: t.ink }}>Browser notifications</div><div style={{ fontSize: 11.5, color: t.sub }}>Pop-ups while the app is open</div></div>
            <Btn t={t} small kind="soft" onClick={requestNotify}>Enable</Btn>
          </div>
          {notifyStatus && <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.4 }}>{notifyStatus}</div>}
          <div className="rounded-2xl px-3 py-3 flex gap-2.5" style={{ background: t.accentSoft }}>
            <Info size={16} color={t.accent} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: "#7a5c1e", lineHeight: 1.45 }}>
              <b>About text alerts:</b> real SMS texts need a hosted backend with a texting service, which can't run inside this shared web app. Your reminders live on the Home screen and (optionally) as browser pop-ups. Want true texts? I can help you deploy this as a hosted app with SMS wired in.
            </div>
          </div>
        </div>
      </Card>

      {/* Currency */}
      <Card t={t}>
        <SettingHead t={t} Icon={Wallet} title="Money" />
        <div className="px-4 pb-4">
          <Field label="Currency" t={t}>
            <select style={inputStyle(t)} disabled={!canEdit} value={s.currency} onChange={(e) => setSettings({ currency: e.target.value })}>
              {["USD", "CAD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      {/* Trips manager */}
      <Card t={t}>
        <SettingHead t={t} Icon={MapIcon} title="My trips" action={canEdit && <Btn t={t} small kind="soft" onClick={() => setNewTrip(true)}><Plus size={14} /> New</Btn>} />
        <div className="px-3 pb-3 space-y-2">
          {state.trips.map((tr) => (
            <div key={tr.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: tr.id === state.activeTripId ? t.primarySoft : t.paper2 }}>
              <span style={{ fontSize: 19 }}>{tr.emoji}</span>
              <div className="flex-1 min-w-0"><div className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: t.ink }}>{tr.name}</div><div style={{ fontSize: 11, color: t.sub }}>{fmtShort(tr.startDate)} – {fmtShort(tr.endDate)}</div></div>
              {tr.id !== state.activeTripId && <button onClick={() => setActiveTrip(tr.id)} style={{ fontSize: 12, fontWeight: 600, color: t.primary }}>Open</button>}
              {canEdit && state.trips.length > 1 && <button onClick={() => { if (confirm(`Delete "${tr.name}"? This can't be undone.`)) removeTrip(tr.id); }} style={{ color: t.line }}><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
      </Card>

      {/* Sharing note */}
      <div className="rounded-2xl px-4 py-3.5 flex gap-2.5" style={{ background: t.card, border: `1px solid ${t.line}` }}>
        <Heart size={16} color={t.primary} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.5 }}>
          <b style={{ color: t.ink }}>Sharing:</b> anyone with the link can view this trip — no account needed. Only people you've invited to sign in (top right) can make changes, and edits sync live to everyone else who's looking. If two editors change the exact same thing at once, the last save wins.
        </div>
      </div>

      <MemberModal member={editMember} onClose={() => setEditMember(null)} onSave={saveMember} onDelete={delMember} t={t} canDelete={s.family.length > 1} />
      <NewTripModal open={newTrip} onClose={() => setNewTrip(false)} onSave={(tr) => { addTrip(tr); setNewTrip(false); setView("itinerary"); }} t={t} />
    </div>
  );
}

function SettingHead({ t, Icon, title, action }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3.5">
      <Icon size={18} color={t.primary} />
      <h3 style={{ fontFamily: "Georgia, serif", fontSize: 16, margin: 0, flex: 1 }}>{title}</h3>
      {action}
    </div>
  );
}

function MemberModal({ member, onClose, onSave, onDelete, t, canDelete }) {
  const [m, setM] = useState(member);
  useEffect(() => setM(member), [member]);
  if (!member) return null;
  const emojis = ["🧑", "👩", "👨", "🧒", "👦", "👧", "👶", "🧓", "🐕", "🐈"];
  const colors = [t.primary, t.clay, t.accent, t.water, t.primaryDark, "#8A8672"];
  return (
    <Modal open={!!member} onClose={onClose} title={member.id ? "Edit person" : "Add person"} t={t}>
      <Field label="Name" t={t}><input style={inputStyle(t)} value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></Field>
      <Field label="Role" t={t}>
        <select style={inputStyle(t)} value={m.role} onChange={(e) => setM({ ...m, role: e.target.value })}><option value="adult">Adult</option><option value="child">Child</option><option value="pet">Pet</option></select>
      </Field>
      <Field label="Icon" t={t}>
        <div className="flex flex-wrap gap-2">{emojis.map((em) => <button key={em} onClick={() => setM({ ...m, emoji: em })} className="rounded-xl" style={{ width: 40, height: 40, fontSize: 20, background: m.emoji === em ? t.primarySoft : t.paper2, border: `2px solid ${m.emoji === em ? t.primary : "transparent"}` }}>{em}</button>)}</div>
      </Field>
      <Field label="Colour" t={t}>
        <div className="flex gap-2">{colors.map((c) => <button key={c} onClick={() => setM({ ...m, color: c })} className="rounded-full" style={{ width: 34, height: 34, background: c, border: `3px solid ${m.color === c ? t.ink : "transparent"}` }} />)}</div>
      </Field>
      <div className="flex justify-between items-center mt-2">
        {member.id && canDelete ? <Btn t={t} kind="danger" small onClick={() => onDelete(member.id)}><Trash2 size={14} /> Remove</Btn> : <span />}
        <div className="flex gap-2"><Btn t={t} kind="ghost" onClick={onClose}>Cancel</Btn><Btn t={t} onClick={() => m.name.trim() && onSave(m)}><Save size={15} /> Save</Btn></div>
      </div>
    </Modal>
  );
}

function NewTripModal({ open, onClose, onSave, t }) {
  const [tr, setTr] = useState({ name: "", start: "", end: "", emoji: "🌲" });
  useEffect(() => { if (open) setTr({ name: "", start: "", end: "", emoji: "🌲" }); }, [open]);
  const emojis = ["🌲", "🏔️", "🏖️", "🏕️", "🗺️", "🧭", "🚗", "✈️", "⛵", "🍁"];
  const create = () => {
    if (!tr.name.trim() || !tr.start || !tr.end) return;
    onSave({
      id: uid(), name: tr.name, subtitle: "", startDate: tr.start, endDate: tr.end,
      homeBase: "", emoji: tr.emoji, status: "planning", days: [], todos: [],
      budget: { savingsGoal: 0, saved: 0, categories: [
        { id: uid(), name: "Travel", est: 0 }, { id: uid(), name: "Lodging", est: 0 },
        { id: uid(), name: "Food", est: 0 }, { id: uid(), name: "Activities", est: 0 },
      ], expenses: [] },
      reservations: [],
    });
  };
  return (
    <Modal open={open} onClose={onClose} title="Start a new trip" t={t}>
      <Field label="Trip name" t={t}><input style={inputStyle(t)} value={tr.name} onChange={(e) => setTr({ ...tr, name: e.target.value })} placeholder="e.g. PEI Summer 2028" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" t={t}><input type="date" style={inputStyle(t)} value={tr.start} onChange={(e) => setTr({ ...tr, start: e.target.value })} /></Field>
        <Field label="End date" t={t}><input type="date" style={inputStyle(t)} value={tr.end} onChange={(e) => setTr({ ...tr, end: e.target.value })} /></Field>
      </div>
      <Field label="Icon" t={t}>
        <div className="flex flex-wrap gap-2">{emojis.map((em) => <button key={em} onClick={() => setTr({ ...tr, emoji: em })} className="rounded-xl" style={{ width: 40, height: 40, fontSize: 20, background: tr.emoji === em ? t.primarySoft : t.paper2, border: `2px solid ${tr.emoji === em ? t.primary : "transparent"}` }}>{em}</button>)}</div>
      </Field>
      <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.4, marginBottom: 10 }}>Starts empty — add days, checklist items and a budget once it's created.</div>
      <div className="flex justify-end gap-2"><Btn t={t} kind="ghost" onClick={onClose}>Cancel</Btn><Btn t={t} onClick={create}><Plus size={15} /> Create trip</Btn></div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  SHARED BITS                                                        */
/* ------------------------------------------------------------------ */
function SectionHeader({ t, title, sub, action }) {
  return (
    <div className="flex items-end justify-between mb-1">
      <div>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, margin: 0, color: t.ink }}>{title}</h2>
        {sub && <div style={{ fontSize: 12.5, color: t.sub, marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}
function EmptyTrips({ t, setView }) {
  return (
    <Card t={t} style={{ padding: 30, textAlign: "center" }}>
      <Compass size={34} color={t.line} className="mx-auto mb-2" />
      <div style={{ fontFamily: "Georgia, serif", fontSize: 18, color: t.ink }}>No trip selected</div>
      <div style={{ fontSize: 13, color: t.sub, margin: "6px 0 14px" }}>Create one in Settings to get started.</div>
      <Btn t={t} onClick={() => setView("settings")}><Plus size={15} /> Go to Settings</Btn>
    </Card>
  );
}

const CUR_SYM = { USD: "$", CAD: "CA$", EUR: "€", GBP: "£" };
function money(n, cur = "USD") {
  const v = Number(n) || 0;
  return `${CUR_SYM[cur] || "$"}${v.toLocaleString(undefined, { maximumFractionDigits: v % 1 ? 2 : 0 })}`;
}
