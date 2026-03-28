"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { SignInButton, UserButton } from "@clerk/nextjs";

const SYSTEM_PROMPT = `You are a travel planner AI.
Return a JSON object only. No markdown, no explanation, no backticks.
Schema:
{
  "trip_name": "string",
  "destination": "string",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD",
      "activities": [
        {
          "name": "string",
          "type": "hotel | restaurant | activity | transport",
          "address": "string",
          "latitude": 0.0,
          "longitude": 0.0,
          "start_time": "HH:MM",
          "end_time": "HH:MM",
          "estimated_cost": 0.0,
          "notes": "string"
        }
      ]
    }
  ]
}
Constraints:
- Each day must have 3–6 activities.
- Include at least 1 restaurant and 1 activity per day.
- Estimate costs realistically; total must not exceed budget.
- Latitude/longitude must be accurate real-world coordinates.
- Return valid JSON ONLY.`;

const PRIMARY = "#2b9dee";
const BG = "#f6f7f8";

const INTERESTS = [
  { id: "food",      label: "Foodie",    icon: "restaurant" },
  { id: "nature",    label: "Nature",    icon: "forest" },
  { id: "history",   label: "History",   icon: "museum" },
  { id: "nightlife", label: "Nightlife", icon: "nightlife" },
  { id: "shopping",  label: "Shopping",  icon: "shopping_bag" },
  { id: "adventure", label: "Adventure", icon: "hiking" },
  { id: "art",       label: "Art",       icon: "palette" },
  { id: "wellness",  label: "Wellness",  icon: "spa" },
];

const BUDGETS = [
  { id: "economy",  label: "Economy",   icon: "payments",              range: "< $1,000", val: "800" },
  { id: "midrange", label: "Mid-range", icon: "account_balance_wallet", range: "$1k–3k",  val: "2000" },
  { id: "luxury",   label: "Luxury",    icon: "diamond",               range: "$3,000+",  val: "5000" },
];

const TYPE = {
  hotel:      { icon: "hotel",               color: "#2b9dee", label: "CHECK-IN" },
  restaurant: { icon: "restaurant",          color: "#f97316", label: "DINING" },
  activity:   { icon: "explore",             color: "#22c55e", label: "ACTIVITY" },
  transport:  { icon: "directions_transit",  color: "#a855f7", label: "TRANSIT" },
};

function getPeriod(act) {
  if (act.type === "hotel") return { label: "CHECK-IN", color: "#2b9dee" };
  if (act.type === "transport") return { label: "TRANSIT", color: "#a855f7" };
  const h = act.start_time ? parseInt(act.start_time, 10) : 12;
  if (h < 11) return { label: "MORNING",   color: "#2b9dee" };
  if (h < 14) return { label: "LUNCH",     color: "#f97316" };
  if (h < 18) return { label: "AFTERNOON", color: "#2b9dee" };
  return          { label: "EVENING",   color: "#8b5cf6" };
}

function fmt(n) { return `$${(n || 0).toFixed(0)}`; }
function totalCost(trip) {
  return (trip?.days || []).reduce((s, d) =>
    s + (d.activities || []).reduce((a, x) => a + (x.estimated_cost || 0), 0), 0);
}
function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtShort(d) {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function useTrips() {
  const [trips, setTrips] = useState(() => {
    try { return JSON.parse(localStorage.getItem("trips_v3") || "[]"); } catch { return []; }
  });
  const save = useCallback(trip => setTrips(prev => {
    const next = [{ ...trip, _at: Date.now() }, ...prev.filter(t => t.trip_name !== trip.trip_name)];
    localStorage.setItem("trips_v3", JSON.stringify(next));
    return next;
  }), []);
  const remove = useCallback(name => setTrips(prev => {
    const next = prev.filter(t => t.trip_name !== name);
    localStorage.setItem("trips_v3", JSON.stringify(next));
    return next;
  }), []);
  return { trips, save, remove };
}

function exportPDF(trip) {
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;color:#111;padding:0 20px}
h1{font-size:2rem;margin-bottom:4px}
.sub{color:#666;margin-bottom:28px;font-size:.9rem}
.day{margin-bottom:24px}
.day h2{font-size:1.1rem;font-weight:800;border-bottom:2px solid #2b9dee;padding-bottom:6px;margin-bottom:10px;color:#2b9dee}
.act{display:flex;gap:10px;padding:10px;border:1px solid #eee;border-radius:8px;margin-bottom:8px}
.act-body .name{font-weight:700}.act-body .meta{font-size:.8rem;color:#888;margin-top:2px}
.total{background:#2b9dee10;border-radius:10px;padding:12px 16px;font-weight:800;color:#2b9dee;margin-top:20px}
</style></head><body>
<h1>${trip.trip_name}</h1>
<p class="sub">${trip.destination} · ${trip.start_date} → ${trip.end_date} · Est. total: ${fmt(totalCost(trip))}</p>
${(trip.days || []).map(d => `
<div class="day"><h2>Day ${d.day_number} — ${d.date}</h2>
${(d.activities || []).map(a => `<div class="act"><div class="act-body">
  <div class="name">${a.name}</div>
  <div class="meta">${a.address || ""} · ${a.start_time || ""}${a.end_time ? "–" + a.end_time : ""} · ${fmt(a.estimated_cost)}</div>
  ${a.notes ? `<div class="meta">${a.notes}</div>` : ""}
</div></div>`).join("")}
</div>`).join("")}
<div class="total">Estimated Total: ${fmt(totalCost(trip))}</div>
</body></html>`;
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([body], { type: "text/html" })),
    download: trip.trip_name.replace(/\s+/g, "_") + ".html"
  });
  a.click();
}

function Icon({ name, sz = 24, col, cls = "" }) {
  return <span className={`material-symbols-outlined ${cls}`}
    style={{ fontSize: sz, lineHeight: 1, color: col, userSelect: "none", flexShrink: 0 }}>{name}</span>;
}

function BottomNav({ active, go }) {
  const tabs = [
    { id: "welcome", icon: "explore",         label: "Explore" },
    { id: "mytrips", icon: "business_center", label: "Trips"   },
    { id: "saved",   icon: "favorite",        label: "Saved"   },
    { id: "profile", icon: "person",          label: "Profile" },
  ];
  return (
    <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 480, zIndex: 60,
      background: "rgba(255,255,255,0.96)", backdropFilter: "blur(16px)",
      borderTop: "1px solid rgba(43,157,238,0.1)",
      display: "flex", justifyContent: "space-around", padding: "8px 0 20px" }}>
      {tabs.map(t => {
        const on = active === t.id;
        return (
          <button key={t.id} onClick={() => go(t.id)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            color: on ? PRIMARY : "#94a3b8", background: "none", border: "none", cursor: "pointer",
            flex: 1, padding: "4px 0", transition: "color .15s" }}>
            <span className="material-symbols-outlined"
              style={{ fontSize: 24, lineHeight: 1, userSelect: "none", flexShrink: 0,
                fontVariationSettings: on ? "'FILL' 1" : "'FILL' 0" }}>
              {t.icon}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── SCREEN 5: SAVED / MY COLLECTION ─────────────────────────────────────────
function Saved({ trips, onViewTrip, onNewTrip, onNavigate }) {
  const [filter, setFilter] = useState("All Items");
  const [search, setSearch] = useState("");

  const filters = ["All Items", "Stays", "Dining", "To-do", "Itineraries"];

  const placeCards = [
    { name: "The Azure Resort",  loc: "Santorini, Greece", cat: "Stay",   price: "From $320/night", rating: "4.9",
      img: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=400&q=70" },
    { name: "Lumara Table",      loc: "Tokyo, Japan",      cat: "Dining", price: "Fusion • $$$",    rating: "4.7",
      img: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=70" },
    { name: "Ubud Jungle Villa", loc: "Bali, Indonesia",   cat: "Stay",   price: "From $180/night", rating: "4.8",
      img: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=400&q=70" },
    { name: "Le Petit Bistro",   loc: "Paris, France",     cat: "Dining", price: "French • $$",     rating: "4.6",
      img: "https://images.unsplash.com/photo-1550966871-3ed3cfd6f8c1?w=400&q=70" },
  ];

  // Saved itineraries = actual user trips
  const itinItems = trips.map((t, i) => ({
    trip: t,
    name: t.trip_name,
    sub: t.destination,
    days: t.days?.length || 0,
    places: (t.days || []).reduce((s, d) => s + (d.activities || []).length, 0),
    img: [
      "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=200&q=60",
      "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=200&q=60",
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&q=60",
    ][i % 3],
  }));

  const catMap = { "All Items": null, "Stays": "Stay", "Dining": "Dining", "To-do": null, "Itineraries": "itinerary" };
  const catFilter = catMap[filter];
  const visiblePlaces = placeCards.filter(p =>
    (!catFilter || catFilter === p.cat) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.loc.toLowerCase().includes(search.toLowerCase()))
  );
  const showItins = filter === "All Items" || filter === "Itineraries";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: BG }}>
      {/* Sticky header */}
      <header style={{ position: "sticky", top: 0, zIndex: 50,
        background: "rgba(246,247,248,0.88)", backdropFilter: "blur(14px)",
        borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", justifyContent: "space-between" }}>
          <button onClick={() => onNavigate("welcome")} style={{ width: 40, height: 40, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer", color: "#0f172a",
            transition: "background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>
            <Icon name="arrow_back" sz={24} />
          </button>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700, flex: 1, textAlign: "center", color: "#0f172a" }}>
            My Collection
          </h1>
          <button style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer", color: "#0f172a" }}>
            <Icon name="settings" sz={22} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 0, height: 48,
            borderRadius: 12, background: "rgba(226,232,240,0.6)", overflow: "hidden" }}>
            <div style={{ paddingLeft: 14, display: "flex", alignItems: "center", flexShrink: 0 }}>
              <Icon name="search" sz={20} col="#94a3b8" />
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search your saved gems…"
              style={{ flex: 1, border: "none", background: "transparent", outline: "none",
                fontSize: ".9rem", color: "#0f172a", padding: "0 12px", fontFamily: "inherit" }} />
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 10, padding: "0 16px 14px", overflowX: "auto" }}>
          {filters.map(f => {
            const on = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                flexShrink: 0, height: 36, padding: "0 18px", borderRadius: 999,
                fontSize: ".83rem", fontWeight: 600, border: "none", cursor: "pointer", transition: "all .15s",
                background: on ? PRIMARY : "rgba(226,232,240,0.7)",
                color: on ? "#fff" : "#64748b" }}>
                {f}
              </button>
            );
          })}
        </div>
      </header>

      <main style={{ flex: 1, paddingBottom: 100 }}>
        {/* Saved Places */}
        {(filter === "All Items" || filter === "Stays" || filter === "Dining") && (
          <section style={{ padding: "20px 16px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>Saved Places</h2>
              <button style={{ fontSize: ".83rem", fontWeight: 700, color: PRIMARY, background: "none", border: "none", cursor: "pointer" }}>
                View map
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {visiblePlaces.map(p => (
                <div key={p.name} style={{ borderRadius: 14, overflow: "hidden", background: "#fff",
                  border: "1px solid #f1f5f9", boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
                  cursor: "pointer", transition: "box-shadow .15s" }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,0,0,0.06)"}>
                  <div style={{ position: "relative", height: 140, overflow: "hidden" }}>
                    <img src={p.img} alt={p.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {/* Heart */}
                    <button style={{ position: "absolute", top: 10, right: 10, width: 32, height: 32,
                      borderRadius: "50%", background: "rgba(255,255,255,0.92)", border: "none",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}>
                      <span className="material-symbols-outlined"
                        style={{ fontSize: 17, color: PRIMARY, fontVariationSettings: "'FILL' 1" }}>
                        favorite
                      </span>
                    </button>
                    {/* Category badge */}
                    <div style={{ position: "absolute", bottom: 10, left: 10,
                      background: "rgba(255,255,255,0.92)", padding: "3px 9px", borderRadius: 6,
                      fontSize: ".68rem", fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase",
                      color: "#0f172a" }}>
                      {p.cat}
                    </div>
                  </div>
                  <div style={{ padding: "10px 12px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                      <h3 style={{ fontSize: ".88rem", fontWeight: 700, color: "#0f172a",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        flex: 1, marginRight: 6 }}>{p.name}</h3>
                      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                        <span className="material-symbols-outlined"
                          style={{ fontSize: 14, color: "#eab308", fontVariationSettings: "'FILL' 1" }}>star</span>
                        <span style={{ fontSize: ".8rem", fontWeight: 700, color: "#0f172a" }}>{p.rating}</span>
                      </div>
                    </div>
                    <p style={{ fontSize: ".78rem", color: "#94a3b8", marginBottom: 5 }}>{p.loc}</p>
                    <p style={{ fontSize: ".8rem", fontWeight: 700, color: PRIMARY }}>{p.price}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Saved Itineraries */}
        {showItins && (
          <section style={{ padding: "28px 16px 0" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a", marginBottom: 14 }}>
              Saved Itineraries
            </h2>
            {itinItems.length === 0 ? (
              <div style={{ padding: "24px", borderRadius: 14, background: "#fff",
                border: "1px solid #f1f5f9", textAlign: "center", color: "#94a3b8", fontSize: ".88rem" }}>
                No saved itineraries yet. Generate a trip and save it!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {itinItems.map(it => (
                  <div key={it.name} onClick={() => onViewTrip(it.trip)}
                    style={{ display: "flex", gap: 14, background: "#fff", padding: 12,
                      borderRadius: 14, border: "1px solid #f1f5f9",
                      boxShadow: "0 1px 6px rgba(0,0,0,0.05)", cursor: "pointer",
                      transition: "box-shadow .15s" }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.09)"}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,0,0,0.05)"}>
                    <div style={{ width: 88, height: 88, borderRadius: 10, flexShrink: 0, overflow: "hidden" }}>
                      <img src={it.img} alt={it.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
                      justifyContent: "space-between", padding: "2px 0" }}>
                      <div>
                        <h3 style={{ fontSize: ".93rem", fontWeight: 700, color: "#0f172a",
                          marginBottom: 4, lineHeight: 1.3 }}>{it.name}</h3>
                        <p style={{ fontSize: ".75rem", color: "#94a3b8" }}>{it.sub}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                        <div style={{ display: "flex", gap: 14 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4,
                            fontSize: ".75rem", fontWeight: 600, color: "#94a3b8" }}>
                            <Icon name="calendar_today" sz={14} col="#94a3b8" /> {it.days} Days
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4,
                            fontSize: ".75rem", fontWeight: 600, color: "#94a3b8" }}>
                            <Icon name="location_on" sz={14} col="#94a3b8" /> {it.places} Places
                          </span>
                        </div>
                        <button style={{ color: PRIMARY, background: "none", border: "none",
                          cursor: "pointer", padding: 4 }}>
                          <Icon name="more_horiz" sz={20} col={PRIMARY} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Create New Collection */}
        <div style={{ padding: "24px 16px" }}>
          <button onClick={onNewTrip} style={{
            width: "100%", padding: "18px", borderRadius: 14,
            background: `${PRIMARY}10`, border: `2px dashed ${PRIMARY}40`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            color: PRIMARY, fontSize: ".92rem", fontWeight: 700, cursor: "pointer",
            transition: "background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = `${PRIMARY}18`}
            onMouseLeave={e => e.currentTarget.style.background = `${PRIMARY}10`}>
            <Icon name="add_circle" sz={20} col={PRIMARY} /> Create New Collection
          </button>
        </div>
      </main>

      <BottomNav active="saved" go={onNavigate} />
    </div>
  );
}

// ── SCREEN 6: PROFILE ────────────────────────────────────────────────────────
function Profile({ onNavigate }) {
  const menuItems = [
    { icon: "explore",       title: "Travel Preferences",    sub: "Edit interests and budget" },
    { icon: "person",        title: "Account Settings",      sub: "Email, password, and security" },
    { icon: "notifications", title: "Notification Settings", sub: "Push, email, and trip alerts" },
    { icon: "help_center",   title: "Help & Support",        sub: "FAQs and contact us" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: BG }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "14px 16px 12px",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10,
        background: "rgba(246,247,248,0.9)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${PRIMARY}14` }}>
        <button onClick={() => onNavigate("welcome")} style={{ width: 44, height: 44,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "none", border: "none", cursor: "pointer", color: "#0f172a" }}>
          <Icon name="arrow_back" sz={24} />
        </button>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, flex: 1, textAlign: "center", color: "#0f172a" }}>Profile</h2>
        <button style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
          background: "none", border: "none", cursor: "pointer", color: "#0f172a" }}>
          <Icon name="settings" sz={22} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 100 }}>
        {/* Avatar + name */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
          padding: "28px 24px 20px", gap: 14 }}>
          <div style={{ width: 112, height: 112, borderRadius: "50%", overflow: "hidden",
            border: `4px solid ${PRIMARY}30`, flexShrink: 0 }}>
            <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80"
              alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Alex Johnson</p>
            <p style={{ fontSize: ".95rem", fontWeight: 600, color: PRIMARY, marginBottom: 4 }}>Global Explorer</p>
            <p style={{ fontSize: ".8rem", color: "#94a3b8" }}>Member since March 2023</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 10, padding: "0 16px 20px" }}>
          {[{ n: "24", l: "Countries" }, { n: "128", l: "Cities" }, { n: "12", l: "Trips" }].map(s => (
            <div key={s.l} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              gap: 4, padding: "16px 8px", borderRadius: 14,
              border: `1px solid ${PRIMARY}15`, background: "#fff",
              boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, color: PRIMARY }}>{s.n}</span>
              <span style={{ fontSize: ".68rem", fontWeight: 700, color: "#94a3b8",
                textTransform: "uppercase", letterSpacing: ".07em" }}>{s.l}</span>
            </div>
          ))}
        </div>

        {/* Menu */}
        <div style={{ padding: "0 16px" }}>
          <p style={{ fontSize: ".73rem", fontWeight: 700, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: ".1em", padding: "0 4px 14px" }}>
            Travel & Account
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {menuItems.map(m => (
              <button key={m.title} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderRadius: 14, background: "#fff",
                border: `1px solid ${PRIMARY}08`, cursor: "pointer",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)", transition: "background .15s",
                width: "100%" }}
                onMouseEnter={e => e.currentTarget.style.background = `${PRIMARY}05`}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${PRIMARY}12`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={m.icon} sz={20} col={PRIMARY} />
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ fontSize: ".93rem", fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>{m.title}</p>
                    <p style={{ fontSize: ".75rem", color: "#94a3b8" }}>{m.sub}</p>
                  </div>
                </div>
                <Icon name="chevron_right" sz={22} col="#94a3b8" />
              </button>
            ))}
          </div>
        </div>

        {/* Logout */}
        <div style={{ padding: "20px 16px" }}>
          <button style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "16px", borderRadius: 14, background: "#e2e8f0",
            border: "none", cursor: "pointer", fontSize: ".97rem", fontWeight: 700,
            color: "#0f172a", transition: "background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#cbd5e1"}
            onMouseLeave={e => e.currentTarget.style.background = "#e2e8f0"}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#ef4444" }}>logout</span>
            Log Out
          </button>
        </div>
      </div>

      <BottomNav active="profile" go={onNavigate} />
    </div>
  );
}

// ── SCREEN 1: WELCOME ────────────────────────────────────────────────────────
function Welcome({ onStart }) {
  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column" }}>
      
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px",
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: BG
        }}
      >
        <div style={{ width: 40 }} />

        <h2
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            flex: 1,
            textAlign: "center",
            color: "#0f172a"
          }}
        >
          AI Travel Planner
        </h2>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SignInButton mode="modal">
            <button
              style={{
                background: PRIMARY,
                color: "#fff",
                border: "none",
                borderRadius: 20,
                padding: "7px 16px",
                fontSize: ".83rem",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Sign In
            </button>
          </SignInButton>

          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <div
        style={{
          width: "100%",
          aspectRatio: "16/9",
          minHeight: 320,
          maxHeight: 440,
          backgroundImage:
            "url(https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=900&q=80)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          position: "relative",
          borderRadius: "0 0 28px 28px",
          overflow: "hidden",
          flexShrink: 0
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, rgba(16,26,34,0.45) 0%, transparent 55%)"
          }}
        />
      </div>

      <div
        style={{
          padding: "36px 24px 120px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center"
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 16px",
            borderRadius: 999,
            background: `${PRIMARY}18`,
            color: PRIMARY,
            fontSize: ".82rem",
            fontWeight: 700,
            marginBottom: 20
          }}
        >
          <Icon name="auto_awesome" sz={15} col={PRIMARY} /> Next-Gen Travel
        </div>

        <h1
          style={{
            fontSize: "2.35rem",
            fontWeight: 800,
            lineHeight: 1.18,
            textAlign: "center",
            letterSpacing: "-.025em",
            marginBottom: 14,
            color: "#0f172a"
          }}
        >
          Your Perfect Trip,{" "}
          <span style={{ color: PRIMARY }}>AI-Powered.</span>
        </h1>

        <p
          style={{
            color: "#64748b",
            fontSize: ".97rem",
            lineHeight: 1.7,
            textAlign: "center",
            maxWidth: 380,
            marginBottom: 32
          }}
        >
          Experience personalized itineraries, smart bookings, and hidden gems
          discovered just for you by our advanced travel intelligence.
        </p>

        <button
          onClick={onStart}
          style={{
            width: "100%",
            maxWidth: 360,
            height: 56,
            borderRadius: 12,
            background: PRIMARY,
            color: "#fff",
            fontSize: "1.05rem",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            boxShadow: `0 8px 28px ${PRIMARY}45`,
            transition: "opacity .15s, transform .12s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = ".9";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "none";
          }}
        >
          Start Planning <Icon name="arrow_forward" sz={20} col="#fff" />
        </button>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
            marginTop: 44,
            width: "100%",
            paddingTop: 36,
            borderTop: "1px solid #e2e8f0"
          }}
        >
          {[
            { icon: "map", l: "Custom Maps" },
            { icon: "event_note", l: "Smart Itinerary" },
            { icon: "hotel", l: "Curated Stays" }
          ].map((f) => (
            <div
              key={f.l}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: `${PRIMARY}18`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Icon name={f.icon} sz={22} col={PRIMARY} />
              </div>
              <span
                style={{
                  fontSize: ".75rem",
                  fontWeight: 600,
                  color: "#64748b",
                  textAlign: "center"
                }}
              >
                {f.l}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          height: 8,
          background: PRIMARY,
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100
        }}
      />
    </div>
  );
}

// ── SCREEN 2: PLAN FORM ──────────────────────────────────────────────────────
function Plan({ onBack, onGenerate, initError }) {
  const [dest, setDest] = useState("");
  const [s, setS] = useState("");
  const [e, setE] = useState("");
  const [budget, setBudget] = useState("midrange");
  const [ints, setInts] = useState(["food", "history"]);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState(initError || "");

  function go() {
    if (!dest.trim()) { setErr("Please enter a destination."); return; }
    if (!s || !e)     { setErr("Please select travel dates."); return; }
    if (new Date(e) < new Date(s)) { setErr("End date must be after start date."); return; }
    setErr("");
    onGenerate({ destination: dest.trim(), startDate: s, endDate: e,
      budget: BUDGETS.find(b => b.id === budget)?.val || "2000",
      interests: ints.join(", "), travelerInfo: notes });
  }

  const inp = { width: "100%", height: 52, padding: "0 16px 0 46px", borderRadius: 12,
    border: "1px solid #e2e8f0", background: "#fff", fontSize: ".93rem", color: "#0f172a",
    outline: "none", fontFamily: "inherit", transition: "border-color .15s" };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: BG }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 8px",
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(246,247,248,0.9)", backdropFilter: "blur(12px)" }}>
        <button onClick={onBack} style={{ width: 44, height: 44, display: "flex", alignItems: "center",
          justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "#0f172a" }}>
          <Icon name="arrow_back" sz={24} />
        </button>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, flex: 1, textAlign: "center",
          paddingRight: 44, color: "#0f172a" }}>Plan Your Trip</h2>
      </div>

      <div style={{ padding: "12px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: ".9rem", fontWeight: 600, color: "#0f172a" }}>Creating your itinerary</span>
          <span style={{ fontSize: ".8rem", color: "#94a3b8" }}>Step 1 of 4</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: `${PRIMARY}25`, overflow: "hidden" }}>
          <div style={{ width: "25%", height: "100%", borderRadius: 999, background: PRIMARY }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 110 }}>
        {err && (
          <div style={{ margin: "14px 16px 0", padding: "11px 16px", borderRadius: 10,
            background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", fontSize: ".85rem" }}>
            ⚠ {err}
          </div>
        )}

        {/* Destination */}
        <section style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: "1.4rem", fontWeight: 800, padding: "0 16px 16px", color: "#0f172a" }}>Where to next?</h3>
          <div style={{ padding: "0 16px", position: "relative" }}>
            <div style={{ position: "absolute", left: 28, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <Icon name="location_on" sz={20} col={PRIMARY} />
            </div>
            <input value={dest} onChange={e => setDest(e.target.value)} style={inp}
              placeholder="Enter destination (e.g. Kyoto, Japan)"
              onFocus={e => e.target.style.borderColor = PRIMARY}
              onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
          </div>
        </section>

        {/* Dates */}
        <section style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 800, padding: "0 16px 16px", color: "#0f172a" }}>Travel Dates</h3>
          <div style={{ padding: "0 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "START DATE", icon: "calendar_today", val: s, set: setS },
              { label: "END DATE",   icon: "calendar_month",  val: e, set: setE },
            ].map(d => (
              <div key={d.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: ".7rem", fontWeight: 700, color: "#94a3b8",
                  letterSpacing: ".08em", paddingLeft: 4 }}>{d.label}</span>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                    <Icon name={d.icon} sz={17} col={PRIMARY} />
                  </div>
                  <input type="date" value={d.val} onChange={ev => d.set(ev.target.value)}
                    style={{ ...inp, paddingLeft: 38, height: 48, fontSize: ".85rem",
                      color: d.val ? "#0f172a" : "#94a3b8" }}
                    onFocus={ev => ev.target.style.borderColor = PRIMARY}
                    onBlur={ev => ev.target.style.borderColor = "#e2e8f0"} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Budget */}
        <section style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 800, padding: "0 16px 16px", color: "#0f172a" }}>Select Budget</h3>
          <div style={{ padding: "0 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {BUDGETS.map(b => {
              const on = budget === b.id;
              return (
                <button key={b.id} onClick={() => setBudget(b.id)} style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  padding: "14px 6px", borderRadius: 12, cursor: "pointer", gap: 5, transition: "all .15s",
                  border: `2px solid ${on ? PRIMARY : "#e2e8f0"}`,
                  background: on ? `${PRIMARY}12` : "#fff",
                }}>
                  <Icon name={b.icon} sz={22} col={on ? PRIMARY : "#94a3b8"} />
                  <span style={{ fontSize: ".82rem", fontWeight: 700, color: on ? PRIMARY : "#64748b" }}>{b.label}</span>
                  <span style={{ fontSize: ".68rem", color: on ? `${PRIMARY}aa` : "#94a3b8" }}>{b.range}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Interests */}
        <section style={{ marginTop: 28 }}>
          <div style={{ padding: "0 16px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a" }}>What are your interests?</h3>
            <span style={{ fontSize: ".7rem", fontWeight: 700, color: "#94a3b8",
              letterSpacing: ".07em", textTransform: "uppercase", cursor: "pointer" }}
              onClick={() => setInts(ints.length === INTERESTS.length ? [] : INTERESTS.map(i => i.id))}>
              Select all
            </span>
          </div>
          <div style={{ padding: "0 16px", display: "flex", flexWrap: "wrap", gap: 10 }}>
            {INTERESTS.map(i => {
              const on = ints.includes(i.id);
              return (
                <button key={i.id} onClick={() => setInts(p => p.includes(i.id) ? p.filter(x => x !== i.id) : [...p, i.id])}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px",
                    borderRadius: 999, fontSize: ".88rem", fontWeight: 600, cursor: "pointer", transition: "all .15s",
                    border: `1px solid ${on ? PRIMARY : "#e2e8f0"}`,
                    background: on ? PRIMARY : "#fff", color: on ? "#fff" : "#475569" }}>
                  <Icon name={i.icon} sz={17} col={on ? "#fff" : "#94a3b8"} />
                  {i.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Notes */}
        <section style={{ marginTop: 24, padding: "0 16px" }}>
          <div style={{ padding: "14px 16px", borderRadius: 12, background: "#fff",
            border: "1px solid #e2e8f0" }}>
            <label style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8",
              letterSpacing: ".07em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
              Special notes (optional)
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="e.g. vegetarian, traveling with kids, prefer local transport…"
              style={{ width: "100%", border: "none", outline: "none", fontSize: ".88rem", color: "#0f172a",
                fontFamily: "inherit", resize: "none", background: "transparent", lineHeight: 1.6 }} />
          </div>
        </section>

        {/* Map preview */}
        <div style={{ margin: "20px 16px 0", height: 140, borderRadius: 14, overflow: "hidden",
          position: "relative", border: "1px solid #e2e8f0", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=600&q=60"
            alt="map" style={{ width: "100%", height: "100%", objectFit: "cover",
              opacity: .55, filter: "grayscale(25%)" }} />
          <div style={{ position: "absolute", inset: 0,
            background: "linear-gradient(to top, rgba(246,247,248,0.9) 0%, transparent 100%)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "rgba(255,255,255,0.94)", backdropFilter: "blur(8px)",
              padding: "9px 18px", borderRadius: 10, border: `1px solid ${PRIMARY}28`,
              display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
              <Icon name="auto_awesome" sz={17} col={PRIMARY} />
              <span style={{ fontSize: ".84rem", fontWeight: 700, color: "#0f172a" }}>AI is calculating routes…</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480, padding: "12px 16px 28px",
        background: "linear-gradient(to top, rgba(246,247,248,1) 65%, transparent)" }}>
        <div style={{ marginBottom: 10, padding: "10px 14px", borderRadius: 10,
          background: "#fff7ed", border: "1px solid #fed7aa",
          display: "flex", alignItems: "center", gap: 8 }}>
          <span className="material-symbols-outlined"
            style={{ fontSize: 18, color: "#f97316", lineHeight: 1, userSelect: "none" }}>info</span>
          <span style={{ fontSize: ".82rem", color: "#c2410c", fontWeight: 600 }}>
            Maximum of 3 days only for now
          </span>
        </div>
        <button onClick={go} style={{
          width: "100%", height: 54, borderRadius: 12, background: PRIMARY, color: "#fff",
          fontSize: "1rem", fontWeight: 700, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          boxShadow: `0 6px 22px ${PRIMARY}45`, transition: "opacity .15s" }}
          onMouseEnter={e => e.currentTarget.style.opacity = ".88"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
          Generate Itinerary <Icon name="arrow_forward" sz={20} col="#fff" />
        </button>
      </div>
    </div>
  );
}

// ── LOADING ──────────────────────────────────────────────────────────────────
function Loading({ dest }) {
  const [d, setD] = useState(".");
  useEffect(() => {
    const t = setInterval(() => setD(p => p.length >= 3 ? "." : p + "."), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${PRIMARY}15`,
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <Icon name="flight_takeoff" sz={36} col={PRIMARY} />
      </div>
      <h2 style={{ fontSize: "1.45rem", fontWeight: 800, marginBottom: 10, color: "#0f172a", textAlign: "center" }}>
        Crafting your perfect trip{d}
      </h2>
      {dest && <p style={{ color: "#94a3b8", fontSize: ".9rem", marginBottom: 32, textAlign: "center" }}>
        Discovering the best of {dest}
      </p>}
      <div style={{ width: "100%", maxWidth: 280, height: 6, borderRadius: 999,
        background: `${PRIMARY}20`, overflow: "hidden", marginBottom: 36 }}>
        <div style={{ height: "100%", borderRadius: 999, background: PRIMARY,
          animation: "lb 1.8s ease-in-out infinite" }} />
      </div>
      <style>{`@keyframes lb{0%{width:0%;margin-left:0}50%{width:70%;margin-left:0}100%{width:0%;margin-left:100%}}`}</style>
      {["Finding top-rated activities", "Sourcing best restaurants", "Optimizing your schedule"].map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
          borderRadius: 10, background: "#fff", border: "1px solid #f1f5f9",
          width: "100%", maxWidth: 300, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: PRIMARY, flexShrink: 0,
            animation: `pulse ${0.8 + i * 0.3}s ease-in-out infinite alternate` }} />
          <span style={{ fontSize: ".85rem", color: "#64748b" }}>{s}</span>
        </div>
      ))}
      <style>{`@keyframes pulse{from{opacity:.3;transform:scale(.8)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

// ── SCREEN 3: MY TRIPS ───────────────────────────────────────────────────────
function MyTrips({ trips, onView, onNew, onBack, onNavigate, onRemove }) {
  const [tab, setTab] = useState("upcoming");
  const imgs = [
    "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=600&q=70",
    "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=600&q=70",
    "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=70",
    "https://images.unsplash.com/photo-1503917988258-f87a78e3c995?w=600&q=70",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh",
      background: "#fff", maxWidth: 480, margin: "0 auto" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10,
        background: "rgba(255,255,255,0.88)", backdropFilter: "blur(14px)",
        borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", justifyContent: "space-between" }}>
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer", color: "#0f172a",
            transition: "background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>
            <Icon name="arrow_back" sz={24} />
          </button>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, flex: 1, textAlign: "center", color: "#0f172a" }}>My Trips</h2>
          <button style={{ width: 40, height: 40, display: "flex", alignItems: "center",
            justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "#0f172a" }}>
            <Icon name="search" sz={22} />
          </button>
        </div>
        <div style={{ padding: "0 16px", display: "flex", gap: 32, borderBottom: "1px solid #f1f5f9" }}>
          {["upcoming", "past"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              paddingBottom: 12, paddingTop: 8, fontSize: ".88rem", fontWeight: 700,
              background: "none", border: "none", cursor: "pointer", textTransform: "capitalize",
              color: tab === t ? PRIMARY : "#94a3b8",
              borderBottom: `2px solid ${tab === t ? PRIMARY : "transparent"}`,
              transition: "all .15s" }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === "upcoming" && trips.length > 0 && (
                <span style={{ marginLeft: 6, background: `${PRIMARY}18`, color: PRIMARY,
                  fontSize: ".7rem", fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>
                  {trips.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "16px", paddingBottom: 120,
        display: "flex", flexDirection: "column", gap: 20 }}>
        {trips.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 20px", color: "#94a3b8" }}>
            <Icon name="luggage" sz={52} col="#e2e8f0" />
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#64748b", marginTop: 16, marginBottom: 8 }}>
              No trips yet
            </div>
            <div style={{ fontSize: ".88rem" }}>Tap + to plan your first adventure</div>
          </div>
        ) : trips.map((trip, idx) => (
          <div key={trip.trip_name} style={{
            borderRadius: 16, overflow: "hidden", border: "1px solid #f1f5f9",
            background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", cursor: "pointer",
            transition: "box-shadow .2s, transform .15s" }}
            onClick={() => onView(trip)}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "none"; }}>
            <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0,
                backgroundImage: `url(${imgs[idx % imgs.length]})`,
                backgroundSize: "cover", backgroundPosition: "center",
                transition: "transform .5s" }} />
              <div style={{ position: "absolute", top: 12, right: 12 }}>
                <button onClick={ev => { ev.stopPropagation(); onRemove(trip.trip_name); }}
                  style={{ width: 32, height: 32, borderRadius: "50%",
                    background: "rgba(255,255,255,0.92)", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", transition: "background .15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,1)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.92)"}>
                  <Icon name="more_horiz" sz={17} col="#0f172a" />
                </button>
              </div>
            </div>
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: 5 }}>{trip.trip_name}</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8" }}>
                  <Icon name="calendar_today" sz={14} col="#94a3b8" />
                  <span style={{ fontSize: ".82rem", fontWeight: 500 }}>
                    {fmtDate(trip.start_date)} – {fmtDate(trip.end_date)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                paddingTop: 12, borderTop: "1px solid #f8fafc" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex" }}>
                    {[0, 1].map(n => (
                      <div key={n} style={{ width: 28, height: 28, borderRadius: "50%",
                        border: "2px solid #fff", background: `${PRIMARY}18`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        marginLeft: n > 0 ? -8 : 0 }}>
                        <Icon name="person" sz={14} col={PRIMARY} />
                      </div>
                    ))}
                  </div>
                  <span style={{ fontSize: ".78rem", color: "#94a3b8", fontWeight: 500 }}>
                    {trip.days?.length || 0} days · {fmt(totalCost(trip))}
                  </span>
                </div>
                <button onClick={ev => { ev.stopPropagation(); onView(trip); }}
                  style={{ background: PRIMARY, color: "#fff", fontSize: ".78rem", fontWeight: 700,
                    padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                    transition: "opacity .15s" }}
                  onMouseEnter={e => e.currentTarget.style.opacity = ".85"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                  View Details
                </button>
              </div>
            </div>
          </div>
        ))}
      </main>

      {/* FAB */}
      <button onClick={onNew} style={{
        position: "fixed", bottom: 84, right: "max(16px, calc(50% - 224px))",
        width: 56, height: 56, borderRadius: "50%", background: PRIMARY, color: "#fff",
        border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 6px 24px ${PRIMARY}55`, zIndex: 40, transition: "transform .15s" }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
        <Icon name="add" sz={30} col="#fff" />
      </button>

      <BottomNav active="mytrips" go={onNavigate} />
    </div>
  );
}

// ── SCREEN 4: ITINERARY DASHBOARD ────────────────────────────────────────────
function Itinerary({ trip, onBack, onSave, onNavigate, alreadySaved }) {
  const [day, setDay] = useState(trip?.days?.[0]?.day_number ?? 1);
  const [mapOn, setMapOn] = useState(false);
  const [saved, setSaved] = useState(alreadySaved);
  const [leaflet, setLeaflet] = useState(!!window.L);
  const mapRef = useRef(null);
  const mapI = useRef(null);
  const marks = useRef([]);

  useEffect(() => {
    if (window.L) { setLeaflet(true); return; }
    const lnk = document.createElement("link");
    lnk.rel = "stylesheet"; lnk.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(lnk);
    const sc = document.createElement("script");
    sc.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    sc.onload = () => setLeaflet(true);
    document.head.appendChild(sc);
  }, []);

  useEffect(() => {
    if (!mapOn || !leaflet || !mapRef.current || !trip) return;
    const L = window.L;
    if (!mapI.current) {
      mapI.current = L.map(mapRef.current);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" })
        .addTo(mapI.current);
    }
    marks.current.forEach(m => m.remove()); marks.current = [];
    const b = [];
    (trip.days?.find(d => d.day_number === day)?.activities || []).forEach(act => {
      if (!act.latitude || !act.longitude) return;
      const meta = TYPE[act.type] || TYPE.activity;
      const ic = L.divIcon({ className: "",
        html: `<div style="background:${meta.color};border:3px solid #fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25)"><span class="material-symbols-outlined" style="font-size:16px;color:#fff">${meta.icon}</span></div>`,
        iconSize: [32, 32], iconAnchor: [16, 16] });
      const mk = L.marker([act.latitude, act.longitude], { icon: ic })
        .bindPopup(`<b>${act.name}</b><br><small>${act.address || ""}</small>`)
        .addTo(mapI.current);
      marks.current.push(mk);
      b.push([act.latitude, act.longitude]);
    });
    if (b.length) mapI.current.fitBounds(b, { padding: [36, 36] });
  }, [mapOn, leaflet, day, trip]);

  if (!trip) return null;
  const curDay = trip.days?.find(d => d.day_number === day);
  const hotel = curDay?.activities?.find(a => a.type === "hotel");
  const acts = (curDay?.activities || []).filter(a => a.type !== "hotel");
  const cost = totalCost(trip);
  const actImgs = [
    "https://images.unsplash.com/photo-1513407030348-c983a97b98d8?w=200&q=60",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=200&q=60",
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=200&q=60",
    "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=200&q=60",
    "https://images.unsplash.com/photo-1490367532201-b9bc1dc483f6?w=200&q=60",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh",
      background: BG, maxWidth: 480, margin: "0 auto" }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 50,
        background: "rgba(246,247,248,0.9)", backdropFilter: "blur(14px)",
        padding: "12px 16px", borderBottom: `1px solid ${PRIMARY}14`,
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer", color: "#0f172a",
            transition: "background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = `${PRIMARY}12`}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>
            <Icon name="arrow_back" sz={22} />
          </button>
          <div>
            <h2 style={{ fontSize: "1.08rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
              {trip.trip_name}
            </h2>
            <p style={{ fontSize: ".73rem", color: "#94a3b8" }}>
              {fmtDate(trip.start_date)} – {fmtDate(trip.end_date)} · {trip.days?.length} days · {fmt(cost)}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { onSave(trip); setSaved(true); }}
            style={{ width: 40, height: 40, borderRadius: 10, border: "none", cursor: "pointer",
              background: `${PRIMARY}14`, color: PRIMARY,
              display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s" }}>
            <Icon name={saved ? "favorite" : "favorite_border"} sz={20} col={PRIMARY} />
          </button>
          <button style={{ width: 40, height: 40, borderRadius: 10, background: PRIMARY,
            color: "#fff", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 4px 12px ${PRIMARY}40` }}>
            <Icon name="more_vert" sz={20} col="#fff" />
          </button>
        </div>
      </header>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 10, padding: "12px 16px", overflowX: "auto" }}>
        {[
          { label: mapOn ? "Hide Map" : "View on Map", icon: "map",         fn: () => setMapOn(v => !v), fill: true },
          { label: "Export to PDF",                    icon: "picture_as_pdf", fn: () => exportPDF(trip), fill: false },
          { label: "Edit Trip",                        icon: "edit",          fn: () => {},               fill: false },
        ].map(b => (
          <button key={b.label} onClick={b.fn} style={{
            display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
            padding: "9px 16px", borderRadius: 999, fontSize: ".83rem", fontWeight: 700,
            cursor: "pointer", flexShrink: 0, transition: "all .15s",
            background: b.fill ? PRIMARY : "#fff",
            color: b.fill ? "#fff" : PRIMARY,
            border: b.fill ? "none" : `1px solid ${PRIMARY}30`,
            boxShadow: b.fill ? `0 4px 14px ${PRIMARY}35` : "none" }}>
            <Icon name={b.icon} sz={16} col={b.fill ? "#fff" : PRIMARY} />
            {b.label}
          </button>
        ))}
      </div>

      {/* Map */}
      {mapOn && leaflet && (
        <div style={{ margin: "0 16px 12px", borderRadius: 14, overflow: "hidden",
          border: `1px solid ${PRIMARY}20`, height: 260, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        </div>
      )}

      {/* Day tabs */}
      <div style={{ position: "sticky", top: 72, zIndex: 40, background: BG,
        borderBottom: `1px solid ${PRIMARY}10` }}>
        <div style={{ display: "flex", padding: "0 16px", gap: 24, overflowX: "auto" }}>
          {(trip.days || []).map(d => (
            <button key={d.day_number} onClick={() => setDay(d.day_number)} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              paddingBottom: 12, paddingTop: 10, flexShrink: 0, gap: 2,
              background: "none", border: "none",
              borderBottom: `2px solid ${day === d.day_number ? PRIMARY : "transparent"}`,
              color: day === d.day_number ? PRIMARY : "#94a3b8",
              cursor: "pointer", transition: "all .15s" }}>
              <span style={{ fontSize: ".85rem", fontWeight: 700 }}>Day {d.day_number}</span>
              <span style={{ fontSize: ".68rem", fontWeight: 500 }}>
                {d.date ? fmtShort(d.date) : ""}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main style={{ flex: 1, padding: "16px", paddingBottom: 100 }}>
        {/* Hotel */}
        {hotel && (
          <section style={{ marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Icon name="hotel" sz={20} col={PRIMARY} />
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>Accommodation</h3>
            </div>
            <div style={{ borderRadius: 16, overflow: "hidden", background: "#fff",
              border: "1px solid #f1f5f9", boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
              <div style={{ height: 150,
                backgroundImage: "url(https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=70)",
                backgroundSize: "cover", backgroundPosition: "center" }} />
              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>{hotel.name}</h4>
                    <p style={{ fontSize: ".8rem", color: "#94a3b8", marginTop: 3 }}>{hotel.address || hotel.notes}</p>
                  </div>
                  <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: ".7rem",
                    fontWeight: 700, padding: "4px 10px", borderRadius: 8, flexShrink: 0, marginLeft: 10 }}>
                    Confirmed
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: ".77rem", fontWeight: 600, color: "#64748b" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Icon name="calendar_today" sz={13} col={PRIMARY} /> Check-in: {hotel.start_time || "3:00 PM"}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Icon name="star" sz={13} col={PRIMARY} /> {fmt(hotel.estimated_cost)}/night
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Schedule */}
        {acts.length > 0 && (
          <section style={{ marginTop: hotel ? 24 : 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="explore" sz={20} col={PRIMARY} />
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>Daily Schedule</h3>
              </div>
              <span style={{ fontSize: ".78rem", fontWeight: 700, color: PRIMARY }}>{acts.length} Activities</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {acts.map((act, i) => {
                const { label, color } = getPeriod(act);
                const h = act.start_time ? parseInt(act.start_time, 10) : null;
                const isLast = i === acts.length - 1;
                return (
                  <div key={i} style={{ display: "flex", gap: 14 }}>
                    {/* Timeline dot */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                        background: i === 0 ? PRIMARY : "#f1f5f9",
                        color: i === 0 ? "#fff" : "#64748b",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: ".78rem", fontWeight: 800 }}>
                        {h != null ? (h > 12 ? h - 12 : h || 12) : i + 1}
                      </div>
                      {!isLast && <div style={{ width: 1, flex: 1, minHeight: 16,
                        background: `${PRIMARY}20`, margin: "4px 0" }} />}
                    </div>
                    {/* Card */}
                    <div style={{ flex: 1, paddingBottom: isLast ? 0 : 14 }}>
                      <div style={{ borderRadius: 14, background: "#fff", padding: 14,
                        border: "1px solid #f1f5f9", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                        <div style={{ display: "flex", gap: 12 }}>
                          <div style={{ width: 76, height: 76, borderRadius: 10, flexShrink: 0,
                            backgroundImage: `url(${actImgs[i % actImgs.length]})`,
                            backgroundSize: "cover", backgroundPosition: "center" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                              <span style={{ fontSize: ".7rem", fontWeight: 800, color, letterSpacing: ".06em" }}>{label}</span>
                              <span style={{ fontSize: ".7rem", color: "#94a3b8", flexShrink: 0, marginLeft: 4 }}>
                                {act.start_time}{act.end_time ? `–${act.end_time}` : ""}
                              </span>
                            </div>
                            <h4 style={{ fontSize: ".94rem", fontWeight: 700, color: "#0f172a",
                              marginBottom: 4, lineHeight: 1.3 }}>{act.name}</h4>
                            {act.notes && (
                              <p style={{ fontSize: ".78rem", color: "#94a3b8", lineHeight: 1.5,
                                overflow: "hidden", display: "-webkit-box",
                                WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{act.notes}</p>
                            )}
                            <div style={{ marginTop: 6, textAlign: "right" }}>
                              <span style={{ fontSize: ".82rem", fontWeight: 700, color: PRIMARY }}>
                                {fmt(act.estimated_cost)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Day total */}
        <div style={{ marginTop: 20, padding: "14px 16px", borderRadius: 12,
          background: `${PRIMARY}08`, border: `1px solid ${PRIMARY}15`,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: ".85rem", color: "#64748b", fontWeight: 600 }}>Day {day} total</span>
          <span style={{ fontSize: ".95rem", fontWeight: 800, color: PRIMARY }}>
            {fmt((curDay?.activities || []).reduce((s, a) => s + (a.estimated_cost || 0), 0))}
          </span>
        </div>
      </main>

      <BottomNav active="welcome" go={onNavigate} />
    </div>
  );
}

// ── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { trips, save, remove } = useTrips();
  const [screen, setScreen] = useState("welcome");
  const [trip, setTrip] = useState(null);
  const [loadDest, setLoadDest] = useState("");
  const [initErr, setInitErr] = useState("");

  async function generate({ destination, startDate, endDate, budget, interests, travelerInfo }) {
    setLoadDest(destination); setScreen("loading"); setInitErr("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, startDate, endDate, budget, interests, travelerInfo }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const trip = await res.json();
      setTrip(trip);
      setScreen("itinerary");
    } catch (e: any) {
      setInitErr(e.message);
      setScreen("plan");
    }
  }

  function go(id) {
    const valid = ["welcome", "plan", "mytrips", "saved", "profile"];
    if (valid.includes(id)) setScreen(id);
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Plus Jakarta Sans',sans-serif;background:${BG};-webkit-font-smoothing:antialiased}
        .material-symbols-outlined{font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24;font-family:'Material Symbols Outlined';display:inline-block;line-height:1}
        button{font-family:'Plus Jakarta Sans',sans-serif}
        input,textarea{font-family:'Plus Jakarta Sans',sans-serif}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
      `}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
        {screen === "welcome"   && <Welcome onStart={() => setScreen("plan")} />}
        {screen === "plan"      && <Plan onBack={() => setScreen("welcome")} onGenerate={generate} initError={initErr} />}
        {screen === "loading"   && <Loading dest={loadDest} />}
        {screen === "itinerary" && trip && (
          <Itinerary trip={trip} onBack={() => setScreen("mytrips")}
            onSave={save} alreadySaved={trips.some(t => t.trip_name === trip.trip_name)}
            onNavigate={go} />
        )}
        {screen === "mytrips" && (
          <MyTrips trips={trips} onView={t => { setTrip(t); setScreen("itinerary"); }}
            onNew={() => setScreen("plan")} onBack={() => setScreen("welcome")}
            onNavigate={go} onRemove={remove} />
        )}
        {screen === "saved" && (
          <Saved trips={trips}
            onViewTrip={t => { setTrip(t); setScreen("itinerary"); }}
            onNewTrip={() => setScreen("plan")}
            onNavigate={go} />
        )}
        {screen === "profile" && <Profile onNavigate={go} />}
      </div>
    </>
  );
}
