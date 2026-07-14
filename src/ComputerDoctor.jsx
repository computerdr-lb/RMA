import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, onSyncChange, newTicketNo } from "./lib/api.js";

/* ============================================================
   COMPUTER DOCTOR — RMA / device intake system
   Data lives in Supabase (Postgres). Ticket numbers come from a
   Postgres sequence, so two PCs can never take the same one.
   ============================================================ */

/* ---------------- defaults ---------------- */
const DEFAULT_ITEMS = [
  "Laptop",
  "Desktop PC",
  "All-in-One",
  "Monitor",
  "Printer",
  "Tablet",
  "Phone",
  "Server",
  "UPS / Battery",
  "Other",
];

const DEFAULT_SETTINGS = {
  shopName: "Computer Doctor",
  shopPhone: "+961 1 000 000",
  shopAddress: "Beirut, Lebanon",
  terms:
    "Estimate only; final cost confirmed before repair. Devices left over 60 days may be disposed of. Data backup is the customer's responsibility.",
  currency: "$",
  receiptWidth: 80, // mm
  labelWidth: 40, // mm
  labelHeight: 20, // mm
};

const STATUSES = ["Received", "In progress", "Ready", "Delivered"];

/* ---------------- helpers ---------------- */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const digits = (s) => (s || "").replace(/\D/g, "");
const money = (n, c) => `${c}${(Number(n) || 0).toFixed(2)}`;
const fmtDate = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const fmtDay = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit" });

/* ---------------- Code 39 barcode ---------------- */
const C39 = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn",
  F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn",
  P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn",
  U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn",
  Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
};

function Barcode({ value, height = "6mm" }) {
  const text = `*${String(value || "").toUpperCase().replace(/[^0-9A-Z\-. ]/g, "")}*`;
  const NARROW = 1, WIDE = 3, GAP = 1;
  const bars = [];
  let x = 0;
  for (const ch of text) {
    const pattern = C39[ch];
    if (!pattern) continue;
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === "w" ? WIDE : NARROW;
      if (i % 2 === 0) bars.push({ x, w }); // even index = bar
      x += w;
    }
    x += GAP; // inter-character space
  }
  const total = Math.max(x, 1);
  return (
    <svg
      className="barcode"
      viewBox={`0 0 ${total} 40`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="0" y="0" width={total} height="40" fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y="0" width={b.w} height="40" fill="#000" />
      ))}
    </svg>
  );
}

/* ---------------- print documents ---------------- */
function ReceiptDoc({ ticket, client, settings }) {
  const acc = [
    ticket.withCharger ? "Charger" : null,
    ticket.withBag ? "Bag" : null,
  ].filter(Boolean);
  return (
    <div className="doc doc-receipt" style={{ width: `${settings.receiptWidth}mm` }}>
      <div className="r-shop">{settings.shopName}</div>
      <div className="r-sub">{settings.shopAddress}</div>
      <div className="r-sub">{settings.shopPhone}</div>
      <div className="r-rule" />
      <div className="r-title">DEVICE INTAKE RECEIPT</div>
      <div className="r-no">{ticket.no}</div>
      <Barcode value={ticket.no} height="9mm" />
      <div className="r-rule" />
      <div className="r-row"><span>Date</span><b>{fmtDate(ticket.createdAt)}</b></div>
      <div className="r-row"><span>Client</span><b>{client?.name || "—"}</b></div>
      <div className="r-row"><span>Phone</span><b>{client?.phone || "—"}</b></div>
      <div className="r-rule dashed" />
      <div className="r-row"><span>Device</span><b>{ticket.deviceType || "—"}</b></div>
      {ticket.model ? <div className="r-row"><span>Model / SN</span><b>{ticket.model}</b></div> : null}
      <div className="r-row"><span>Handed in</span><b>{acc.length ? acc.join(" + ") : "Device only"}</b></div>
      <div className="r-row"><span>Status</span><b>{ticket.status}</b></div>
      <div className="r-rule dashed" />
      <div className="r-block-title">Reported problem</div>
      <div className="r-note">{ticket.note || "—"}</div>
      <div className="r-rule dashed" />
      <div className="r-total">
        <span>Estimated cost</span>
        <b>{money(ticket.cost, settings.currency)}</b>
      </div>
      <div className="r-rule" />
      <div className="r-terms">{settings.terms}</div>
      <div className="r-sign">
        <div className="r-sign-line" />
        <div className="r-sign-label">Customer signature</div>
      </div>
      <div className="r-foot">Keep this receipt — it is required to collect the device.</div>
      <div className="r-cut">✂ — — — — — — — — — — — — — — —</div>
    </div>
  );
}

function LabelDoc({ ticket, client, settings }) {
  const acc = `${ticket.withCharger ? "CHG" : ""}${ticket.withCharger && ticket.withBag ? "+" : ""}${ticket.withBag ? "BAG" : ""}` || "—";
  return (
    <div
      className="doc doc-label"
      style={{ width: `${settings.labelWidth}mm`, height: `${settings.labelHeight}mm` }}
    >
      <div className="l-top">
        <span className="l-no">{ticket.no}</span>
        <span className="l-date">{fmtDay(ticket.createdAt)}</span>
      </div>
      <Barcode value={ticket.no} height="4.8mm" />
      <div className="l-name">{client?.name || "—"}</div>
      <div className="l-meta">
        <span>{client?.phone || "—"}</span>
        <span className="l-acc">{acc}</span>
      </div>
      <div className="l-dev">{ticket.deviceType || "—"}{ticket.model ? ` · ${ticket.model}` : ""}</div>
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */
export default function ComputerDoctor({ user, onSignOut }) {
  const [loaded, setLoaded] = useState(false);
  const [clients, setClients] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [route, setRoute] = useState({ name: "intake" });
  const [toast, setToast] = useState(null);
  const [printJob, setPrintJob] = useState(null); // {kind, ticket, client}
  const [sync, setSync] = useState({ online: navigator.onLine, pending: 0, syncing: false });

  const say = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // reads always come from the local store — instant, and correct offline
  const loadLocal = async () => {
    const [c, t, i, s] = await Promise.all([
      api.clients.list(), api.tickets.list(), api.items.list(), api.settings.get(),
    ]);
    setClients(c);
    setTickets(t);
    setItems(i && i.length ? i : DEFAULT_ITEMS);
    setSettings({ ...DEFAULT_SETTINGS, ...s });
    setLoaded(true);
  };

  useEffect(() => {
    loadLocal();                 // show data immediately, works with no internet
    api.init();                  // pulls from Supabase and drains the queue, in the background
    const offSync = onSyncChange((status) => { setSync(status); loadLocal(); });
    const unsubRealtime = api.subscribe(() => loadLocal());
    return () => { offSync(); unsubRealtime(); };
  }, []); // eslint-disable-line

  /* every mutation writes to the local store immediately (so it works
     offline) and queues for Supabase; failures here are unexpected —
     the local write already succeeded, so we just tell the person and
     let the sync queue keep trying */
  const guard = async (fn, msg) => {
    try {
      return await fn();
    } catch (e) {
      say(msg ? `${msg} ${e.message}` : e.message);
      throw e;
    }
  };

  const saveItems = (next) => guard(() => api.items.save(next), "Could not save the device list:");
  const saveSettings = (next) => guard(() => api.settings.save(next), "Could not save setup:");

  const addClient = (data) =>
    guard(async () => {
      const c = await api.clients.create(data);
      await loadLocal();
      return c;
    }, "Could not add the client:");

  const updateClient = (id, patch) =>
    guard(async () => {
      const c = await api.clients.update(id, patch);
      await loadLocal();
      return c;
    }, "Could not save the client:");

  const saveTicket = (draft) =>
    guard(async () => {
      const saved = draft.id ? await api.tickets.update(draft.id, draft) : await api.tickets.create(draft);
      await loadLocal();
      return saved;
    }, "Could not save the ticket:");

  const deleteTicket = (id) =>
    guard(async () => {
      await api.tickets.remove(id);
      await loadLocal();
    }, "Could not delete the ticket:");

  /* printing */
  const doPrint = (kind, ticket, client) => setPrintJob({ kind, ticket, client });

  useEffect(() => {
    if (!printJob) return;
    const rule = document.getElementById("cd-page-rule");
    if (rule) {
      rule.textContent =
        printJob.kind === "receipt"
          ? `@page { size: ${settings.receiptWidth}mm auto; margin: 3mm; }`
          : `@page { size: ${settings.labelWidth}mm ${settings.labelHeight}mm; margin: 0; }`;
    }
    const t = setTimeout(() => {
      try {
        window.print();
      } catch (e) {
        say("Printing was blocked by the browser.");
      }
      setPrintJob(null);
    }, 120);
    return () => clearTimeout(t);
  }, [printJob]); // eslint-disable-line

  const clientById = (id) => clients.find((c) => c.id === id) || null;
  const ticketsOf = (clientId) => tickets.filter((t) => t.clientId === clientId);

  if (!loaded) {
    return (
      <div className="cd-boot">
        <style>{CSS}</style>
        <div className="boot-pulse" />
        <span>Opening the workshop…</span>
      </div>
    );
  }

  const nav = [
    { id: "intake", label: "Intake", hint: "Phone lookup" },
    { id: "tickets", label: "Tickets", hint: `${tickets.length}` },
    { id: "clients", label: "Clients", hint: `${clients.length}` },
    { id: "items", label: "Items & setup", hint: `${items.length}` },
  ];
  const openCount = tickets.filter((t) => t.status !== "Delivered").length;

  return (
    <div className="cd">
      <style>{CSS}</style>
      <style id="cd-page-rule">{`@page { size: auto; margin: 6mm; }`}</style>

      <div className="app-shell">
        <SyncLight sync={sync} />
        {/* ---- left rail ---- */}
        <aside className="rail">
          <div className="brand">
            <div className="brand-mark">
              <span className="pulse-dot" />
              <svg viewBox="0 0 100 40" className="pulse-line" aria-hidden="true">
                <polyline points="0,20 24,20 32,6 40,34 48,20 62,20 68,14 74,26 80,20 100,20" />
              </svg>
            </div>
            <div className="brand-name">
              <b>COMPUTER</b>
              <span>DOCTOR</span>
            </div>
            <div className="brand-tag">Device intake &amp; repair tracking</div>
          </div>

          <nav className="nav">
            {nav.map((n) => (
              <button
                key={n.id}
                className={`nav-btn ${route.name === n.id || (n.id === "tickets" && route.name === "ticket") || (n.id === "clients" && route.name === "client") ? "on" : ""}`}
                onClick={() => setRoute({ name: n.id })}
              >
                <span>{n.label}</span>
                <em>{n.hint}</em>
              </button>
            ))}
          </nav>

          <div className="rail-foot">
            <div className="chart">
              <div className="chart-k">On the bench</div>
              <div className="chart-v">{openCount}</div>
              <div className="chart-k">Signed in</div>
              <div className="chart-v mono sm">{user?.email || "—"}</div>
              {sync.pending > 0 && (
                <>
                  <div className="chart-k">Waiting to sync</div>
                  <div className="chart-v mono" style={{ color: "var(--amber)" }}>{sync.pending}</div>
                </>
              )}
              <button className="signout" onClick={onSignOut}>Sign out</button>
            </div>
          </div>
        </aside>

        {/* ---- main ---- */}
        <main className="main">
          {route.name === "intake" && (
            <Intake
              clients={clients}
              tickets={tickets}
              settings={settings}
              onAddClient={addClient}
              openClient={(id) => setRoute({ name: "client", id })}
              openTicket={(id) => setRoute({ name: "ticket", id })}
              newTicket={(clientId) => setRoute({ name: "ticket", clientId })}
              say={say}
            />
          )}

          {route.name === "clients" && (
            <ClientList
              clients={clients}
              tickets={tickets}
              openClient={(id) => setRoute({ name: "client", id })}
              newTicket={(clientId) => setRoute({ name: "ticket", clientId })}
              goIntake={() => setRoute({ name: "intake" })}
            />
          )}

          {route.name === "client" && (
            <ClientPage
              client={clientById(route.id)}
              tickets={ticketsOf(route.id)}
              settings={settings}
              onSave={updateClient}
              openTicket={(id) => setRoute({ name: "ticket", id })}
              newTicket={() => setRoute({ name: "ticket", clientId: route.id })}
              back={() => setRoute({ name: "clients" })}
              say={say}
            />
          )}

          {route.name === "tickets" && (
            <TicketList
              tickets={tickets}
              clients={clients}
              settings={settings}
              openTicket={(id) => setRoute({ name: "ticket", id })}
              goIntake={() => setRoute({ name: "intake" })}
            />
          )}

          {route.name === "ticket" && (
            <TicketPage
              key={route.id || route.clientId || "new"}
              existing={tickets.find((t) => t.id === route.id) || null}
              client={clientById(route.id ? (tickets.find((t) => t.id === route.id) || {}).clientId : route.clientId)}
              items={items}
              settings={settings}
              onAddItem={async (name) => {
                if (!name || items.includes(name)) return;
                await saveItems([...items, name]);
              }}
              onSave={saveTicket}
              onDelete={deleteTicket}
              onPrint={doPrint}
              afterSave={(t) => setRoute({ name: "ticket", id: t.id })}
              back={() => setRoute({ name: "tickets" })}
              say={say}
            />
          )}

          {route.name === "items" && (
            <ItemsPage
              items={items}
              settings={settings}
              onSaveItems={saveItems}
              onSaveSettings={saveSettings}
              say={say}
            />
          )}
        </main>
      </div>

      {/* ---- print surface ---- */}
      <div id="print-root">
        {printJob?.kind === "receipt" && (
          <ReceiptDoc ticket={printJob.ticket} client={printJob.client} settings={settings} />
        )}
        {printJob?.kind === "label" && (
          <LabelDoc ticket={printJob.ticket} client={printJob.client} settings={settings} />
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SyncLight({ sync }) {
  // always mounted, same size always — only color/label change, so the
  // page layout never shifts as sync state comes and goes
  let state = "green", label = "Online — all synced";
  if (!sync.online) {
    state = "yellow";
    label = sync.pending > 0
      ? `Working offline — ${sync.pending} change${sync.pending === 1 ? "" : "s"} will sync when you're back online`
      : "Working offline — saves stay on this device and sync once you're back online";
  } else if (sync.syncing || sync.pending > 0) {
    state = "yellow";
    label = sync.syncing ? "Syncing…" : `${sync.pending} change${sync.pending === 1 ? "" : "s"} waiting to sync`;
  }
  return (
    <div className={`sync-light sync-${state}`} title={label}>
      <span className="sync-dot" />
      <span className="sync-label">{label}</span>
    </div>
  );
}

/* ============================================================
   INTAKE — phone first
   ============================================================ */
function Intake({ clients, tickets, settings, onAddClient, openClient, openTicket, newTicket, say }) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState(null); // null | {found:client} | {missing:true}
  const [form, setForm] = useState({ name: "", phone: "", altPhone: "", email: "", address: "" });
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const lookup = () => {
    const d = digits(phone);
    if (d.length < 4) {
      say("Enter at least 4 digits of the phone number.");
      return;
    }
    const hit = clients.find((c) => digits(c.phone) === d || digits(c.altPhone) === d) ||
      clients.find((c) => digits(c.phone).endsWith(d) && d.length >= 6);
    if (hit) {
      setResult({ found: hit });
    } else {
      setForm({ name: "", phone: phone.trim(), altPhone: "", email: "", address: "" });
      setResult({ missing: true });
    }
  };

  const createAndGo = async () => {
    if (!form.name.trim()) { say("The client needs a name."); return; }
    if (!digits(form.phone)) { say("The client needs a phone number."); return; }
    const c = await onAddClient({
      name: form.name.trim(),
      phone: form.phone.trim(),
      altPhone: form.altPhone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
    });
    say(`${c.name} added.`);
    newTicket(c.id);
  };

  const hist = result?.found ? tickets.filter((t) => t.clientId === result.found.id) : [];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Front desk</div>
          <h1>Who's at the counter?</h1>
        </div>
      </header>

      <section className="lookup">
        <label className="lookup-label" htmlFor="phone">Phone number</label>
        <div className="lookup-row">
          <input
            id="phone"
            ref={inputRef}
            className="lookup-input mono"
            placeholder="03 000 000"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setResult(null); }}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            inputMode="tel"
          />
          <button className="btn primary lg" onClick={lookup}>Look up</button>
        </div>
        <div className="lookup-hint">Press Enter to search. Unknown numbers open a new client card.</div>
      </section>

      {result?.found && (
        <section className="card found">
          <div className="found-head">
            <div>
              <div className="eyebrow">Existing client</div>
              <h2>{result.found.name}</h2>
              <div className="found-meta mono">
                {result.found.phone}
                {result.found.altPhone ? ` · ${result.found.altPhone}` : ""}
                {result.found.email ? ` · ${result.found.email}` : ""}
              </div>
            </div>
            <div className="found-actions">
              <button className="btn ghost" onClick={() => openClient(result.found.id)}>Open client</button>
              <button className="btn primary" onClick={() => newTicket(result.found.id)}>Start new ticket</button>
            </div>
          </div>

          {hist.length > 0 && (
            <div className="hist">
              <div className="hist-title">Previous tickets</div>
              {hist.map((t) => (
                <button key={t.id} className="hist-row" onClick={() => openTicket(t.id)}>
                  <span className="mono strong">{t.no}</span>
                  <span>{t.deviceType}</span>
                  <span className="dim">{fmtDay(t.createdAt)}</span>
                  <span className={`pill s-${t.status.replace(/\s/g, "").toLowerCase()}`}>{t.status}</span>
                  <span className="mono">{money(t.cost, settings.currency)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {result?.missing && (
        <section className="card">
          <div className="eyebrow">No match</div>
          <h2 className="mb">New client card</h2>
          <div className="grid2">
            <Field label="Full name" required>
              <input className="in" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rami Haddad" />
            </Field>
            <Field label="Phone" required>
              <input className="in mono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Second phone">
              <input className="in mono" value={form.altPhone} onChange={(e) => setForm({ ...form, altPhone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="in" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Address" wide>
              <input className="in" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
          </div>
          <div className="row-end">
            <button className="btn primary lg" onClick={createAndGo}>Add client and start ticket</button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================================================
   CLIENT LIST
   ============================================================ */
function ClientList({ clients, tickets, openClient, newTicket, goIntake }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const d = digits(q);
    if (!term) return clients;
    return clients.filter((c) => {
      const byName = c.name.toLowerCase().includes(term);
      const byPhone = d && (digits(c.phone).includes(d) || digits(c.altPhone).includes(d));
      return byName || byPhone;
    });
  }, [q, clients]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Directory</div>
          <h1>Clients</h1>
        </div>
        <button className="btn primary" onClick={goIntake}>New intake</button>
      </header>

      <input
        className="in search"
        placeholder="Filter by name or phone number"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {filtered.length === 0 ? (
        <Empty
          title={clients.length ? "Nothing matches that filter." : "No clients yet."}
          body={clients.length ? "Try fewer characters, or search the phone number instead." : "Start at the front desk — type a phone number and the card gets created for you."}
          action={<button className="btn primary" onClick={goIntake}>Go to intake</button>}
        />
      ) : (
        <div className="table">
          <div className="tr th">
            <span>Name</span><span>Phone</span><span>Tickets</span><span>Last visit</span><span />
          </div>
          {filtered.map((c) => {
            const ts = tickets.filter((t) => t.clientId === c.id);
            const last = ts[0];
            return (
              <div key={c.id} className="tr" onClick={() => openClient(c.id)}>
                <span className="strong">{c.name}</span>
                <span className="mono">{c.phone}</span>
                <span>{ts.length || "—"}</span>
                <span className="dim">{last ? fmtDay(last.createdAt) : "—"}</span>
                <span className="tr-actions">
                  <button
                    className="btn tiny"
                    onClick={(e) => { e.stopPropagation(); newTicket(c.id); }}
                  >
                    New ticket
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CLIENT PAGE
   ============================================================ */
function ClientPage({ client, tickets, settings, onSave, openTicket, newTicket, back, say }) {
  const [form, setForm] = useState(client || {});
  useEffect(() => setForm(client || {}), [client?.id]); // eslint-disable-line

  if (!client) return <Empty title="Client not found." body="It may have been removed." action={<button className="btn" onClick={back}>Back to clients</button>} />;

  const save = async () => {
    if (!form.name?.trim()) { say("The client needs a name."); return; }
    await onSave(client.id, {
      name: form.name.trim(),
      phone: (form.phone || "").trim(),
      altPhone: (form.altPhone || "").trim(),
      email: (form.email || "").trim(),
      address: (form.address || "").trim(),
    });
    say("Client saved.");
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <button className="link" onClick={back}>← Clients</button>
          <h1>{client.name}</h1>
        </div>
        <button className="btn primary" onClick={newTicket}>New ticket</button>
      </header>

      <section className="card">
        <div className="grid2">
          <Field label="Full name"><input className="in" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone"><input className="in mono" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Second phone"><input className="in mono" value={form.altPhone || ""} onChange={(e) => setForm({ ...form, altPhone: e.target.value })} /></Field>
          <Field label="Email"><input className="in" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Address" wide><input className="in" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        </div>
        <div className="row-end"><button className="btn primary" onClick={save}>Save changes</button></div>
      </section>

      <section className="card">
        <h2 className="mb">Repair history</h2>
        {tickets.length === 0 ? (
          <p className="dim">No tickets for this client yet.</p>
        ) : (
          <div className="hist">
            {tickets.map((t) => (
              <button key={t.id} className="hist-row" onClick={() => openTicket(t.id)}>
                <span className="mono strong">{t.no}</span>
                <span>{t.deviceType}</span>
                <span className="dim">{fmtDay(t.createdAt)}</span>
                <span className={`pill s-${t.status.replace(/\s/g, "").toLowerCase()}`}>{t.status}</span>
                <span className="mono">{money(t.cost, settings.currency)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================================================
   TICKET LIST
   ============================================================ */
function TicketList({ tickets, clients, settings, openTicket, goIntake }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const name = (id) => clients.find((c) => c.id === id)?.name || "—";
  const phone = (id) => clients.find((c) => c.id === id)?.phone || "";

  const filtered = tickets.filter((t) => {
    const okStatus = status === "All" || t.status === status;
    const term = q.trim().toLowerCase();
    const okQ =
      !term ||
      t.no.toLowerCase().includes(term) ||
      (t.deviceType || "").toLowerCase().includes(term) ||
      name(t.clientId).toLowerCase().includes(term) ||
      digits(phone(t.clientId)).includes(digits(q));
    return okStatus && okQ;
  });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Workshop</div>
          <h1>Tickets</h1>
        </div>
        <button className="btn primary" onClick={goIntake}>New intake</button>
      </header>

      <div className="filters">
        <input className="in search" placeholder="Search ticket no., client, phone or device" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {["All", ...STATUSES].map((s) => (
            <button key={s} className={`chip ${status === s ? "on" : ""}`} onClick={() => setStatus(s)}>{s}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty title="No tickets here." body="Tickets appear once a device is checked in at the front desk." action={<button className="btn primary" onClick={goIntake}>Go to intake</button>} />
      ) : (
        <div className="table t5">
          <div className="tr th">
            <span>Ticket</span><span>Client</span><span>Device</span><span>Status</span><span>Cost</span>
          </div>
          {filtered.map((t) => (
            <div key={t.id} className="tr" onClick={() => openTicket(t.id)}>
              <span className="mono strong">{t.no}<em className="dim block">{fmtDay(t.createdAt)}</em></span>
              <span>{name(t.clientId)}<em className="dim block mono">{phone(t.clientId)}</em></span>
              <span>{t.deviceType}{(t.withCharger || t.withBag) && <em className="dim block">{[t.withCharger && "charger", t.withBag && "bag"].filter(Boolean).join(" + ")}</em>}</span>
              <span><span className={`pill s-${t.status.replace(/\s/g, "").toLowerCase()}`}>{t.status}</span></span>
              <span className="mono">{money(t.cost, settings.currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TICKET PAGE (RMA)
   ============================================================ */
function TicketPage({ existing, client, items, settings, onAddItem, onSave, onDelete, onPrint, afterSave, back, say }) {
  const blank = {
    clientId: client?.id,
    deviceType: items[0] || "",
    model: "",
    withCharger: false,
    withBag: false,
    note: "",
    cost: "",
    status: "Received",
    no: newTicketNo(), // generated once, here — this exact number prints and saves
  };
  const [draft, setDraft] = useState(existing || blank);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState("");

  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };

  // the ticket number is assigned by the database on save — never guessed here
  const preview = {
    ...draft,
    no: draft.no || "CD-·····",
    createdAt: draft.createdAt || new Date().toISOString(),
  };

  if (!client) {
    return <Empty title="No client attached." body="A ticket always belongs to a client. Start from the intake desk." action={<button className="btn" onClick={back}>Back to tickets</button>} />;
  }

  const commit = async () => {
    const t = await onSave({ ...draft, clientId: client.id, cost: draft.cost === "" ? 0 : Number(draft.cost) });
    setDraft(t);
    setDirty(false);
    if (!existing) afterSave(t);
    return t;
  };

  const saveOnly = async () => {
    try { await commit(); say("Ticket saved."); } catch { /* toast already shown */ }
  };

  // the ticket saved locally the instant it was created (even offline), so
  // printing never has to wait on the network
  const saveAndPrint = async (kind) => {
    try {
      const t = await commit();
      onPrint(kind, t, client);
    } catch { /* toast already shown */ }
  };

  const addItemNow = async () => {
    const n = newItem.trim();
    if (!n) return;
    await onAddItem(n);
    set({ deviceType: n });
    setNewItem("");
    setAdding(false);
    say(`"${n}" added to the device list.`);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <button className="link" onClick={back}>← Tickets</button>
          <h1>
            {draft.no ? <span className="mono">{draft.no}</span> : "New ticket"}
            {dirty && <span className="dot-dirty" title="Unsaved changes" />}
          </h1>
          <div className="dim">{client.name} · <span className="mono">{client.phone}</span></div>
        </div>
        <div className="head-actions">
          {existing && (
            <button
              className="btn danger ghost"
              onClick={async () => { await onDelete(existing.id); say("Ticket deleted."); back(); }}
            >
              Delete
            </button>
          )}
          <button className="btn primary" onClick={saveOnly}>Save ticket</button>
        </div>
      </header>

      <div className="ticket-grid">
        {/* form */}
        <section className="card sheet">
          <div className="perf" />
          <div className="sheet-title">
            <span className="eyebrow">Service worksheet</span>
            <StatusPicker value={draft.status} onChange={(s) => set({ status: s })} />
          </div>

          <Field label="Type of device" required>
            {!adding ? (
              <div className="combo">
                <select className="in" value={draft.deviceType} onChange={(e) => set({ deviceType: e.target.value })}>
                  {!items.includes(draft.deviceType) && draft.deviceType ? (
                    <option value={draft.deviceType}>{draft.deviceType}</option>
                  ) : null}
                  {items.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
                <button className="btn tiny" onClick={() => setAdding(true)}>+ Add type</button>
              </div>
            ) : (
              <div className="combo">
                <input
                  className="in"
                  autoFocus
                  placeholder="e.g. Gaming laptop"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addItemNow(); if (e.key === "Escape") setAdding(false); }}
                />
                <button className="btn tiny primary" onClick={addItemNow}>Add</button>
                <button className="btn tiny" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            )}
            <div className="sub">The list is managed on the Items &amp; setup page.</div>
          </Field>

          <Field label="Make / model / serial">
            <input className="in" placeholder="Optional — e.g. Dell 5520, SN 9F2K1" value={draft.model || ""} onChange={(e) => set({ model: e.target.value })} />
          </Field>

          <Field label="Handed in with the device">
            <div className="checks">
              <label className={`check ${draft.withCharger ? "on" : ""}`}>
                <input type="checkbox" checked={!!draft.withCharger} onChange={(e) => set({ withCharger: e.target.checked })} />
                <span>With charger</span>
              </label>
              <label className={`check ${draft.withBag ? "on" : ""}`}>
                <input type="checkbox" checked={!!draft.withBag} onChange={(e) => set({ withBag: e.target.checked })} />
                <span>With bag</span>
              </label>
            </div>
          </Field>

          <Field label="What needs repair" required>
            <textarea
              className="in ta"
              rows={5}
              placeholder="Customer's description, visible damage, what you observed at the counter…"
              value={draft.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </Field>

          <Field label="Repair cost">
            <div className="cost">
              <span className="cost-cur">{settings.currency}</span>
              <input
                className="in mono cost-in"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={draft.cost}
                onChange={(e) => set({ cost: e.target.value })}
              />
              <span className="sub">Estimate printed on the receipt.</span>
            </div>
          </Field>
        </section>

        {/* previews + print */}
        <aside className="side">
          <div className="side-block">
            <div className="side-head">
              <span className="eyebrow">Label · {settings.labelWidth} × {settings.labelHeight} mm</span>
              <button className="btn primary sm" onClick={() => saveAndPrint("label")}>Print label</button>
            </div>
            <div className="paper-wrap">
              <LabelDoc ticket={preview} client={client} settings={settings} />
            </div>
            <div className="sub center">Shown at true size — this is what the label printer feeds.</div>
          </div>

          <div className="side-block">
            <div className="side-head">
              <span className="eyebrow">Receipt · {settings.receiptWidth} mm</span>
              <button className="btn primary sm" onClick={() => saveAndPrint("receipt")}>Print receipt</button>
            </div>
            <div className="paper-wrap scroll">
              <ReceiptDoc ticket={preview} client={client} settings={settings} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatusPicker({ value, onChange }) {
  return (
    <div className="chips">
      {STATUSES.map((s) => (
        <button key={s} className={`chip ${value === s ? "on" : ""}`} onClick={() => onChange(s)}>{s}</button>
      ))}
    </div>
  );
}

/* ============================================================
   ITEMS & SETUP
   ============================================================ */
function ItemsPage({ items, settings, onSaveItems, onSaveSettings, say }) {
  const [newItem, setNewItem] = useState("");
  const [edit, setEdit] = useState(null);
  const [tmp, setTmp] = useState("");
  const [s, setS] = useState(settings);

  const add = async () => {
    const n = newItem.trim();
    if (!n) return;
    if (items.some((i) => i.toLowerCase() === n.toLowerCase())) { say("That type is already on the list."); return; }
    await onSaveItems([...items, n]);
    setNewItem("");
  };
  const rename = async (i) => {
    const n = tmp.trim();
    if (!n) return;
    await onSaveItems(items.map((x, idx) => (idx === i ? n : x)));
    setEdit(null);
  };
  const remove = async (i) => onSaveItems(items.filter((_, idx) => idx !== i));
  const move = async (i, dir) => {
    const next = [...items];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    await onSaveItems(next);
  };

  const saveSetup = async () => {
    await onSaveSettings({
      ...s,
      receiptWidth: Number(s.receiptWidth) || 80,
      labelWidth: Number(s.labelWidth) || 40,
      labelHeight: Number(s.labelHeight) || 20,
    });
    say("Setup saved.");
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Configuration</div>
          <h1>Items &amp; setup</h1>
        </div>
      </header>

      <div className="two-col">
        <section className="card">
          <h2 className="mb">Device types</h2>
          <p className="sub mb">These fill the combo box on every ticket. Order matters — the first one is the default.</p>

          <div className="combo mb">
            <input
              className="in"
              placeholder="Add a device type"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <button className="btn primary" onClick={add}>Add</button>
          </div>

          <ul className="items">
            {items.map((it, i) => (
              <li key={it + i} className="item">
                {edit === i ? (
                  <>
                    <input className="in" autoFocus value={tmp} onChange={(e) => setTmp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename(i)} />
                    <button className="btn tiny primary" onClick={() => rename(i)}>Save</button>
                    <button className="btn tiny" onClick={() => setEdit(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="item-n mono">{String(i + 1).padStart(2, "0")}</span>
                    <span className="item-name">{it}</span>
                    <button className="btn tiny" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                    <button className="btn tiny" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                    <button className="btn tiny" onClick={() => { setEdit(i); setTmp(it); }}>Rename</button>
                    <button className="btn tiny danger" onClick={() => remove(i)}>Remove</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="mb">Shop &amp; printers</h2>
          <Field label="Shop name"><input className="in" value={s.shopName} onChange={(e) => setS({ ...s, shopName: e.target.value })} /></Field>
          <div className="grid2">
            <Field label="Shop phone"><input className="in mono" value={s.shopPhone} onChange={(e) => setS({ ...s, shopPhone: e.target.value })} /></Field>
            <Field label="Currency symbol"><input className="in mono" value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} /></Field>
            <Field label="Address" wide><input className="in" value={s.shopAddress} onChange={(e) => setS({ ...s, shopAddress: e.target.value })} /></Field>
          </div>
          <Field label="Receipt terms">
            <textarea className="in ta" rows={3} value={s.terms} onChange={(e) => setS({ ...s, terms: e.target.value })} />
          </Field>
          <div className="grid3">
            <Field label="Receipt width (mm)"><input className="in mono" type="number" value={s.receiptWidth} onChange={(e) => setS({ ...s, receiptWidth: e.target.value })} /></Field>
            <Field label="Label width (mm)"><input className="in mono" type="number" value={s.labelWidth} onChange={(e) => setS({ ...s, labelWidth: e.target.value })} /></Field>
            <Field label="Label height (mm)"><input className="in mono" type="number" value={s.labelHeight} onChange={(e) => setS({ ...s, labelHeight: e.target.value })} /></Field>
          </div>
          <div className="row-end"><button className="btn primary" onClick={saveSetup}>Save setup</button></div>

          <div className="tip">
            <b>Printer tip.</b> In the browser print dialog choose your receipt or label printer, set margins to
            <span className="mono"> None</span> and scale to <span className="mono">100%</span>. The page size is already
            set to {s.receiptWidth}mm for receipts and {s.labelWidth}×{s.labelHeight}mm for labels.
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------- small UI parts ---------------- */
function Field({ label, children, required, wide }) {
  return (
    <div className={`field ${wide ? "wide" : ""}`}>
      <label>{label}{required && <i>*</i>}</label>
      {children}
    </div>
  );
}

function Empty({ title, body, action }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

/* ============================================================
   STYLES
   ============================================================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');

.cd {
  --mat: #14464F;
  --mat-2: #0C2B31;
  --bg: #C9D7D3;
  --surface: #FFFFFF;
  --ink: #11262B;
  --muted: #64807F;
  --line: #D7E2DF;
  --amber: #F0A81C;
  --amber-d: #C4830B;
  --red: #C4402E;
  --green: #2E7D5B;
  --display: 'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif;
  --body: 'Inter', system-ui, -apple-system, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, 'Courier New', monospace;

  font-family: var(--body);
  color: var(--ink);
  background: var(--bg);
  min-height: 100vh;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}
.cd *, .cd *::before, .cd *::after { box-sizing: border-box; }
.cd .mono { font-family: var(--mono); }
.cd .dim { color: var(--muted); }
.cd .strong { font-weight: 600; }
.cd .block { display: block; font-style: normal; font-size: 11px; margin-top: 2px; }
.cd .mb { margin-bottom: 14px; }
.cd .center { text-align: center; }
.cd .sub { font-size: 12px; color: var(--muted); margin-top: 6px; line-height: 1.45; }

.cd-boot {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  min-height: 60vh; background: #C9D7D3; color: #14464F;
  font-family: 'Barlow Condensed', sans-serif; letter-spacing: .12em; text-transform: uppercase;
}
.boot-pulse { width: 10px; height: 10px; border-radius: 50%; background: #F0A81C; animation: bp 1s infinite; }
@keyframes bp { 0%,100% { opacity: .25; transform: scale(.8);} 50% { opacity: 1; transform: scale(1.3);} }

/* layout */
.app-shell { display: grid; grid-template-columns: 232px 1fr; min-height: 100vh; }

/* rail */
.rail {
  background: var(--mat);
  background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,.06) 1px, transparent 0);
  background-size: 7px 7px;
  color: #DCEAE7; padding: 22px 16px; display: flex; flex-direction: column; gap: 26px;
  border-right: 3px solid var(--mat-2);
}
.brand-mark { position: relative; height: 26px; margin-bottom: 10px; }
.pulse-line { width: 100%; height: 26px; overflow: visible; }
.pulse-line polyline { fill: none; stroke: var(--amber); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round;
  stroke-dasharray: 160; stroke-dashoffset: 160; animation: trace 3.2s ease-in-out infinite; }
@keyframes trace { 0% { stroke-dashoffset: 160; } 45%,100% { stroke-dashoffset: 0; } }
.pulse-dot { position: absolute; right: -2px; top: 9px; width: 7px; height: 7px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 0 rgba(240,168,28,.6); animation: ring 3.2s ease-out infinite; }
@keyframes ring { 0%,40% { box-shadow: 0 0 0 0 rgba(240,168,28,.5);} 60% { box-shadow: 0 0 0 9px rgba(240,168,28,0);} 100% { box-shadow: 0 0 0 0 rgba(240,168,28,0);} }
.brand-name { font-family: var(--display); line-height: .92; }
.brand-name b { display: block; font-size: 27px; letter-spacing: .04em; color: #fff; font-weight: 700; }
.brand-name span { display: block; font-size: 27px; letter-spacing: .3em; color: var(--amber); font-weight: 600; }
.brand-tag { margin-top: 9px; font-size: 10.5px; color: #8FB2AE; line-height: 1.4; letter-spacing: .02em; }

.nav { display: flex; flex-direction: column; gap: 2px; }
.nav-btn {
  display: flex; justify-content: space-between; align-items: center;
  background: none; border: 0; color: #B9D2CE; cursor: pointer;
  font-family: var(--display); font-size: 17px; letter-spacing: .07em; text-transform: uppercase;
  padding: 9px 10px; border-left: 3px solid transparent; text-align: left; transition: .14s;
}
.nav-btn em { font-family: var(--mono); font-style: normal; font-size: 11px; color: #6E9691; }
.nav-btn:hover { color: #fff; background: rgba(255,255,255,.05); }
.nav-btn.on { color: #fff; border-left-color: var(--amber); background: rgba(0,0,0,.18); }
.nav-btn.on em { color: var(--amber); }

.rail-foot { margin-top: auto; }
.chart { border-top: 1px dashed rgba(255,255,255,.2); padding-top: 14px; }
.chart-k { font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: #77A09B; }
.chart-v { font-family: var(--display); font-size: 26px; color: #fff; line-height: 1.1; margin-bottom: 10px; }
.chart-v.mono { font-family: var(--mono); font-size: 14px; color: var(--amber); }

/* page */
.main { padding: 30px 34px 60px; overflow-x: hidden; }
.page { max-width: 1080px; margin: 0 auto; }
.page-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; margin-bottom: 22px; }
.page-head h1 { font-family: var(--display); font-size: 40px; font-weight: 600; letter-spacing: .01em; margin: 2px 0 0; line-height: 1; }
.head-actions { display: flex; gap: 8px; }
.eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: .18em; color: var(--muted); font-weight: 600; }
.link { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0; font-size: 12px; font-family: var(--body); }
.link:hover { color: var(--ink); }

.card { background: var(--surface); border: 1px solid var(--line); border-radius: 3px; padding: 22px; margin-bottom: 18px; box-shadow: 0 1px 0 rgba(17,38,43,.05), 0 12px 24px -20px rgba(17,38,43,.4); }
.card h2 { font-family: var(--display); font-size: 24px; font-weight: 600; margin: 0; }

/* lookup */
.lookup { background: var(--surface); border: 1px solid var(--line); border-top: 3px solid var(--mat); border-radius: 3px; padding: 26px; margin-bottom: 18px; }
.lookup-label { font-size: 10px; text-transform: uppercase; letter-spacing: .18em; color: var(--muted); font-weight: 600; }
.lookup-row { display: flex; gap: 10px; margin-top: 10px; }
.lookup-input { flex: 1; font-size: 34px; letter-spacing: .06em; padding: 8px 14px; border: 0; border-bottom: 2px solid var(--ink); background: #F6FAF9; border-radius: 2px 2px 0 0; color: var(--ink); outline: none; min-width: 0; }
.lookup-input:focus { border-bottom-color: var(--amber); background: #FFFDF6; }
.lookup-hint { margin-top: 10px; font-size: 12px; color: var(--muted); }

/* found */
.found-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.found-head h2 { margin: 3px 0 4px; font-size: 30px; }
.found-meta { font-size: 13px; color: var(--muted); }
.found-actions { display: flex; gap: 8px; }
.card.found { border-left: 3px solid var(--green); }

.hist { margin-top: 18px; border-top: 1px solid var(--line); }
.hist-title { font-size: 10px; text-transform: uppercase; letter-spacing: .18em; color: var(--muted); font-weight: 600; padding: 12px 0 6px; }
.hist-row { display: grid; grid-template-columns: 100px 1fr 90px 110px 80px; gap: 10px; align-items: center; width: 100%; text-align: left;
  background: none; border: 0; border-bottom: 1px solid var(--line); padding: 11px 6px; cursor: pointer; font-family: var(--body); font-size: 13px; color: var(--ink); }
.hist-row:hover { background: #F3F8F7; }

/* forms */
.field { margin-bottom: 16px; }
.field.wide { grid-column: 1 / -1; }
.field > label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: var(--muted); font-weight: 600; margin-bottom: 6px; }
.field > label i { color: var(--red); font-style: normal; margin-left: 3px; }
.in { width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 2px; background: #F9FCFB; font-family: var(--body); font-size: 14px; color: var(--ink); outline: none; transition: .12s; }
.in:focus { border-color: var(--mat); background: #fff; box-shadow: 0 0 0 3px rgba(20,70,79,.09); }
select.in { cursor: pointer; }
.ta { resize: vertical; line-height: 1.55; }
.search { max-width: 520px; margin-bottom: 16px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 12px; }
.row-end { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.combo { display: flex; gap: 8px; align-items: center; }
.combo .in { flex: 1; }

.checks { display: flex; gap: 10px; flex-wrap: wrap; }
.check { display: flex; align-items: center; gap: 9px; padding: 11px 16px; border: 1px solid var(--line); border-radius: 2px; cursor: pointer; background: #F9FCFB; font-size: 14px; user-select: none; transition: .12s; }
.check input { width: 16px; height: 16px; accent-color: var(--mat); cursor: pointer; }
.check:hover { border-color: var(--mat); }
.check.on { background: #FFF8E7; border-color: var(--amber); font-weight: 600; }

.cost { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cost-cur { font-family: var(--display); font-size: 26px; color: var(--muted); }
.cost-in { max-width: 180px; font-size: 20px; }
.cost .sub { margin: 0; }

/* buttons */
.btn { font-family: var(--display); font-size: 15px; letter-spacing: .07em; text-transform: uppercase; font-weight: 600;
  padding: 10px 16px; border: 1px solid var(--ink); background: #fff; color: var(--ink); border-radius: 2px; cursor: pointer; transition: .12s; white-space: nowrap; }
.btn:hover { background: var(--ink); color: #fff; }
.btn.primary { background: var(--mat); border-color: var(--mat); color: #fff; }
.btn.primary:hover { background: var(--mat-2); border-color: var(--mat-2); }
.btn.lg { padding: 13px 26px; font-size: 17px; }
.btn.sm { padding: 7px 12px; font-size: 13px; }
.btn.tiny { padding: 5px 9px; font-size: 11px; letter-spacing: .06em; border-color: var(--line); }
.btn.tiny:hover { border-color: var(--ink); }
.btn.tiny.primary { border-color: var(--mat); }
.btn.ghost { border-color: var(--line); }
.btn.danger { color: var(--red); border-color: #E7C8C2; }
.btn.danger:hover { background: var(--red); border-color: var(--red); color: #fff; }
.btn:focus-visible, .nav-btn:focus-visible, .in:focus-visible, .chip:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }

.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { font-family: var(--mono); font-size: 11px; padding: 6px 10px; border: 1px solid var(--line); background: #fff; color: var(--muted); border-radius: 999px; cursor: pointer; transition: .12s; }
.chip:hover { border-color: var(--mat); color: var(--ink); }
.chip.on { background: var(--ink); border-color: var(--ink); color: #fff; }

.pill { font-family: var(--mono); font-size: 10px; padding: 4px 8px; border-radius: 999px; white-space: nowrap; border: 1px solid; }
.pill.s-received { color: #8A5A00; background: #FFF4DC; border-color: #F1DCA8; }
.pill.s-inprogress { color: #1C4E7A; background: #E4F0FA; border-color: #BCD9EE; }
.pill.s-ready { color: #1F6349; background: #E1F4EB; border-color: #B4E0CC; }
.pill.s-delivered { color: #5D6E6C; background: #EEF2F1; border-color: #D8E1DF; }

/* tables */
.filters { margin-bottom: 16px; }
.filters .search { margin-bottom: 10px; }
.table { background: var(--surface); border: 1px solid var(--line); border-radius: 3px; overflow: hidden; }
.tr { display: grid; grid-template-columns: 1.4fr 1fr .6fr .8fr auto; gap: 12px; align-items: center; padding: 13px 16px; border-bottom: 1px solid var(--line); cursor: pointer; font-size: 13px; }
.table.t5 .tr { grid-template-columns: 1fr 1.2fr 1.3fr .8fr .6fr; }
.tr:last-child { border-bottom: 0; }
.tr:hover { background: #F3F8F7; }
.tr.th { background: #EDF3F2; cursor: default; font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: var(--muted); font-weight: 600; }
.tr.th:hover { background: #EDF3F2; }
.tr-actions { display: flex; justify-content: flex-end; }

/* ticket page */
.ticket-grid { display: grid; grid-template-columns: 1fr 320px; gap: 18px; align-items: start; }
.sheet { position: relative; padding-top: 26px; }
.perf { position: absolute; left: 0; right: 0; top: 8px; height: 1px; border-top: 2px dotted var(--line); }
.sheet-title { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.dot-dirty { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--amber); margin-left: 8px; vertical-align: middle; }

.side { position: sticky; top: 20px; display: flex; flex-direction: column; gap: 14px; }
.side-block { background: var(--surface); border: 1px solid var(--line); border-radius: 3px; padding: 14px; }
.side-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
.paper-wrap { display: flex; justify-content: center; padding: 10px; background: #EDF3F2; border: 1px dashed var(--line); border-radius: 2px; }
.paper-wrap.scroll { max-height: 420px; overflow: auto; align-items: flex-start; }
.paper-wrap .doc { box-shadow: 0 2px 12px -4px rgba(17,38,43,.35); }

/* two col */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
.items { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.item { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--line); }
.item-n { font-size: 11px; color: var(--muted); width: 22px; }
.item-name { flex: 1; font-size: 14px; }
.tip { margin-top: 18px; padding: 12px 14px; background: #FFF8E7; border-left: 3px solid var(--amber); font-size: 12px; line-height: 1.55; color: #6A5312; }

.empty { background: var(--surface); border: 1px dashed var(--line); border-radius: 3px; padding: 44px; text-align: center; }
.empty h2 { font-family: var(--display); font-size: 26px; margin: 0 0 8px; }
.empty p { color: var(--muted); margin: 0 0 18px; }

.sync-light {
  position: fixed; top: 14px; right: 18px; z-index: 50;
  display: flex; align-items: center; gap: 7px;
  background: #fff; border: 1px solid var(--line); border-radius: 999px;
  padding: 6px 12px 6px 9px; box-shadow: 0 6px 16px -8px rgba(17,38,43,.3);
  font-size: 12px; color: var(--ink); max-width: 260px;
}
.sync-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.sync-green .sync-dot { background: var(--green); }
.sync-yellow .sync-dot { background: var(--amber); animation: sync-pulse 1.6s ease-in-out infinite; }
@keyframes sync-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
.sync-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 980px) {
  .sync-light { max-width: 46px; }
  .sync-label { display: none; }
}
.chart-v.sm { font-size: 11px; color: #B9D2CE; word-break: break-all; }
.signout { margin-top: 12px; background: none; border: 1px solid rgba(255,255,255,.25); color: #B9D2CE;
  font-family: var(--display); font-size: 13px; letter-spacing: .08em; text-transform: uppercase;
  padding: 7px 10px; border-radius: 2px; cursor: pointer; width: 100%; }
.signout:hover { background: rgba(255,255,255,.1); color: #fff; }

.toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 11px 20px; border-radius: 2px; font-size: 13px; box-shadow: 0 12px 30px -10px rgba(0,0,0,.5); z-index: 60; animation: up .2s ease-out; }
@keyframes up { from { opacity: 0; transform: translate(-50%, 8px); } }

/* ---------- printable documents ---------- */
/* Thermal printers dither grey into a faint mess: every mark here is pure
   black and bold, sized for a 203 dpi head. */
.doc { background: #fff; color: #000; }
.doc *, .doc *::before, .doc *::after { color: #000; }
.doc-receipt { padding: 3mm 2mm; font-family: var(--mono); font-size: 10.5pt; font-weight: 600; line-height: 1.4; }
.r-shop { font-family: var(--display); font-size: 22pt; font-weight: 700; text-align: center; letter-spacing: .04em; text-transform: uppercase; }
.r-sub { text-align: center; font-size: 9pt; font-weight: 600; }
.r-rule { border-top: 2px solid #000; margin: 2mm 0; }
.r-rule.dashed { border-top: 2px dashed #000; }
.r-title { text-align: center; font-size: 9.5pt; font-weight: 700; letter-spacing: .16em; }
.r-no { text-align: center; font-size: 19pt; font-weight: 700; letter-spacing: .08em; margin: 1mm 0; }
.r-row { display: flex; justify-content: space-between; gap: 4mm; padding: .9mm 0; font-size: 10pt; }
.r-row span { font-weight: 700; }
.r-row b { text-align: right; font-weight: 700; word-break: break-word; }
.r-block-title { font-size: 9pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.r-note { font-size: 11pt; font-weight: 700; white-space: pre-wrap; word-break: break-word; margin-top: 1.2mm; line-height: 1.4; }
.r-total { display: flex; justify-content: space-between; align-items: baseline; font-size: 13pt; font-weight: 700; padding: 1.2mm 0; }
.r-terms { font-size: 8.5pt; font-weight: 600; line-height: 1.4; }
.r-sign { margin-top: 8mm; }
.r-sign-line { border-top: 2px solid #000; }
.r-sign-label { font-size: 9pt; font-weight: 700; margin-top: 1mm; }
.r-foot { text-align: center; font-size: 9pt; font-weight: 700; margin-top: 3mm; line-height: 1.4; }
.r-cut { text-align: center; font-size: 9pt; font-weight: 700; margin-top: 2mm; letter-spacing: .1em; }

.doc-label { padding: 0.7mm 1.4mm; font-family: var(--mono); font-weight: 700; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; }
.l-top { display: flex; justify-content: space-between; align-items: baseline; }
.l-no { font-size: 7pt; font-weight: 700; letter-spacing: .01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 26mm; }
.l-date { font-size: 6pt; font-weight: 700; }
.l-name { font-size: 8.5pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: .3mm; }
.l-meta { display: flex; justify-content: space-between; gap: 2mm; font-size: 6.8pt; font-weight: 700; }
.l-acc { font-weight: 700; }
.l-dev { font-size: 6.8pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

#print-root { display: none; }

@media print {
  .cd { background: #fff !important; }
  .app-shell, .toast { display: none !important; }
  #print-root { display: block !important; }
  #print-root .doc { box-shadow: none !important; }
  #print-root .doc, #print-root .doc * {
    color: #000 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    text-rendering: geometricPrecision;
  }
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
}

@media (max-width: 980px) {
  .app-shell { grid-template-columns: 1fr; }
  .rail { flex-direction: row; align-items: center; gap: 16px; border-right: 0; border-bottom: 3px solid var(--mat-2); padding: 14px; flex-wrap: wrap; }
  .brand-tag, .rail-foot { display: none; }
  .nav { flex-direction: row; flex-wrap: wrap; }
  .nav-btn { border-left: 0; border-bottom: 3px solid transparent; padding: 6px 8px; }
  .nav-btn.on { border-left: 0; border-bottom-color: var(--amber); }
  .main { padding: 20px 16px 50px; }
  .ticket-grid, .two-col, .grid2, .grid3 { grid-template-columns: 1fr; }
  .side { position: static; }
  .lookup-input { font-size: 24px; }
  .page-head h1 { font-size: 30px; }
  .tr, .table.t5 .tr, .hist-row { grid-template-columns: 1fr 1fr; gap: 6px; }
  .tr.th { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .cd *, .cd *::before, .cd *::after { animation: none !important; transition: none !important; }
}
`;
