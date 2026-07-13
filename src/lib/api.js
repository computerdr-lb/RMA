import { supabase } from "./supabase.js";
import * as ldb from "./localdb.js";

/* ============================================================
   OFFLINE-FIRST DATA LAYER
   Every read comes from IndexedDB — instant, and works with no
   internet. Every write lands in IndexedDB immediately, then queues
   for Supabase. When the connection returns, the queue drains in
   order. Nothing the counter does ever waits on the network.
   ============================================================ */

const uid = () => crypto.randomUUID();

/* ---- device tag ---------------------------------------------------
   Ticket numbers are generated right here in the browser, not by the
   database — that's what lets them be created offline. Each device
   gets its own short tag on first use, so two shops PCs, both offline
   at the same moment, can never hand out the same ticket number.
   The number is permanent: it is never renumbered after syncing. */
function deviceTag() {
  let tag = localStorage.getItem("cd:deviceTag");
  if (!tag) {
    tag = Math.random().toString(36).slice(2, 6).toUpperCase();
    localStorage.setItem("cd:deviceTag", tag);
  }
  return tag;
}
export function newTicketNo() {
  const key = "cd:ticketCounter";
  const n = Number(localStorage.getItem(key) || "0") + 1;
  localStorage.setItem(key, String(n));
  return `CD-${deviceTag()}-${String(n).padStart(4, "0")}`;
}

/* ---- row <-> app shape mapping (Postgres is snake_case) ----------- */
const toClient = (r) => ({
  id: r.id, name: r.name || "", phone: r.phone || "", altPhone: r.alt_phone || "",
  email: r.email || "", address: r.address || "", createdAt: r.created_at,
});
const clientInsertRow = (row) => ({
  id: row.id, name: row.name, phone: row.phone || "", alt_phone: row.altPhone || "",
  email: row.email || "", address: row.address || "", created_at: row.createdAt,
});
const clientPatchRow = (p) => {
  const r = {};
  if ("name" in p) r.name = p.name;
  if ("phone" in p) r.phone = p.phone || "";
  if ("altPhone" in p) r.alt_phone = p.altPhone || "";
  if ("email" in p) r.email = p.email || "";
  if ("address" in p) r.address = p.address || "";
  return r;
};

const toTicket = (r) => ({
  id: r.id, no: r.no, clientId: r.client_id, deviceType: r.device_type || "",
  model: r.model || "", withCharger: !!r.with_charger, withBag: !!r.with_bag,
  note: r.note || "", cost: Number(r.cost || 0), status: r.status || "Received",
  createdAt: r.created_at, updatedAt: r.updated_at,
});
const ticketInsertRow = (row) => ({
  id: row.id, no: row.no, client_id: row.clientId, device_type: row.deviceType || "",
  model: row.model || "", with_charger: !!row.withCharger, with_bag: !!row.withBag,
  note: row.note || "", cost: Number(row.cost) || 0, status: row.status || "Received",
  created_at: row.createdAt,
});
const ticketPatchRow = (p) => {
  const r = {};
  if ("deviceType" in p) r.device_type = p.deviceType || "";
  if ("model" in p) r.model = p.model || "";
  if ("withCharger" in p) r.with_charger = !!p.withCharger;
  if ("withBag" in p) r.with_bag = !!p.withBag;
  if ("note" in p) r.note = p.note || "";
  if ("cost" in p) r.cost = Number(p.cost) || 0;
  if ("status" in p) r.status = p.status || "Received";
  return r;
};

/* ---- status broadcast: the UI subscribes to this for its banner --- */
const listeners = new Set();
export function onSyncChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
async function broadcast(extra = {}) {
  const pending = (await ldb.getQueue()).length;
  for (const cb of listeners) cb({ online: navigator.onLine, pending, syncing: false, ...extra });
}

/* ---- pull: merge Supabase into the local store --------------------
   Local records with a change still waiting in the queue are left
   alone, so a pull can never stomp on something not yet sent.
   Known limitation: a delete made on the OTHER device while this one
   was offline won't remove the local copy until you tell it to — see
   README. Fine for a two-PC shop; would need tombstones at bigger scale. */
export async function pullRemote() {
  if (!navigator.onLine) return;
  const queue = await ldb.getQueue();
  const pending = new Set(queue.map((e) => e.entityId));

  const [{ data: clients }, { data: tickets }, { data: items }, { data: srow }] = await Promise.all([
    supabase.from("clients").select("*"),
    supabase.from("tickets").select("*"),
    supabase.from("items").select("*").order("sort_order"),
    supabase.from("settings").select("value").eq("key", "app").maybeSingle(),
  ]);

  if (clients) for (const r of clients) if (!pending.has(r.id)) await ldb.put("clients", toClient(r));
  if (tickets) for (const r of tickets) if (!pending.has(r.id)) await ldb.put("tickets", toTicket(r));
  if (items) await ldb.put("items", { key: "list", value: items.map((r) => r.name) });
  if (srow?.value) await ldb.put("settings", { key: "app", value: srow.value });
}

/* ---- push: drain the queue in order -------------------------------- */
let draining = false;
export async function flushQueue() {
  if (!navigator.onLine || draining) return;
  draining = true;
  await broadcast({ syncing: true });
  try {
    const queue = (await ldb.getQueue()).sort((a, b) => a.qid - b.qid);
    for (const entry of queue) {
      try {
        await send(entry);
        await ldb.removeFromQueue(entry.qid);
      } catch (e) {
        console.error("Sync waiting — will retry:", entry.table, entry.op, e.message);
        break; // keep this and everything after it queued; try again later
      }
    }
    await pullRemote(); // pick up anything the other PC did meanwhile
  } finally {
    draining = false;
    await broadcast();
  }
}

async function send(entry) {
  const { table, op, payload } = entry;
  const check = (r) => { if (r.error) throw new Error(r.error.message); return r; };

  if (table === "clients") {
    if (op === "insert") return check(await supabase.from("clients").insert(payload));
    if (op === "update") return check(await supabase.from("clients").update(payload.patch).eq("id", payload.id));
  }
  if (table === "tickets") {
    if (op === "insert") return check(await supabase.from("tickets").insert(payload));
    if (op === "update") return check(await supabase.from("tickets").update(payload.patch).eq("id", payload.id));
    if (op === "delete") return check(await supabase.from("tickets").delete().eq("id", payload.id));
  }
  if (table === "items" && op === "replace") {
    await check(await supabase.from("items").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
    if (payload.length) await check(await supabase.from("items").insert(payload.map((name, i) => ({ name, sort_order: i }))));
    return;
  }
  if (table === "settings" && op === "upsert") {
    return check(await supabase.from("settings").upsert({ key: "app", value: payload }, { onConflict: "key" }));
  }
}

/* try again whenever the browser tells us the network changed, and
   as a safety net every 15s in case that event doesn't fire */
window.addEventListener("online", () => flushQueue());
window.addEventListener("offline", () => broadcast());
setInterval(() => { if (navigator.onLine) flushQueue(); }, 15000);

/* ---- the app-facing API — same shape as before, local-first now --- */
const enqueue = async (entry) => {
  await ldb.addToQueue(entry);
  await broadcast();
  if (navigator.onLine) flushQueue();
};

export const api = {
  async init() {
    await pullRemote();
    await flushQueue();
    await broadcast();
  },

  clients: {
    async list() {
      const rows = await ldb.getAll("clients");
      return rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    },
    async create(c) {
      const row = { id: uid(), name: c.name, phone: c.phone || "", altPhone: c.altPhone || "",
        email: c.email || "", address: c.address || "", createdAt: new Date().toISOString() };
      await ldb.put("clients", row);
      await enqueue({ table: "clients", op: "insert", entityId: row.id, payload: clientInsertRow(row) });
      return row;
    },
    async update(id, patch) {
      const existing = await ldb.getOne("clients", id);
      const row = { ...existing, ...patch };
      await ldb.put("clients", row);
      await enqueue({ table: "clients", op: "update", entityId: id, payload: { id, patch: clientPatchRow(patch) } });
      return row;
    },
  },

  tickets: {
    async list() {
      const rows = await ldb.getAll("tickets");
      return rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    },
    async create(t) {
      const row = { id: uid(), no: t.no || newTicketNo(), createdAt: new Date().toISOString(), ...t };
      await ldb.put("tickets", row);
      await enqueue({ table: "tickets", op: "insert", entityId: row.id, payload: ticketInsertRow(row) });
      return row;
    },
    async update(id, patch) {
      const existing = await ldb.getOne("tickets", id);
      const row = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      await ldb.put("tickets", row);
      await enqueue({ table: "tickets", op: "update", entityId: id, payload: { id, patch: ticketPatchRow(patch) } });
      return row;
    },
    async remove(id) {
      // if the create for this ticket never left the queue, just drop
      // both — the server never heard of it, so there's nothing to delete
      const queue = await ldb.getQueue();
      const pendingInsert = queue.find((e) => e.entityId === id && e.table === "tickets" && e.op === "insert");
      await ldb.remove("tickets", id);
      if (pendingInsert) await ldb.removeFromQueue(pendingInsert.qid);
      else await enqueue({ table: "tickets", op: "delete", entityId: id, payload: { id } });
    },
  },

  items: {
    async list() {
      const r = await ldb.getOne("items", "list");
      return r?.value || [];
    },
    async save(list) {
      await ldb.put("items", { key: "list", value: list });
      await enqueue({ table: "items", op: "replace", entityId: "list", payload: list });
      return list;
    },
  },

  settings: {
    async get() {
      const r = await ldb.getOne("settings", "app");
      return r?.value || {};
    },
    async save(s) {
      await ldb.put("settings", { key: "app", value: s });
      await enqueue({ table: "settings", op: "upsert", entityId: "app", payload: s });
      return s;
    },
  },

  auth: {
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
    session: () => supabase.auth.getSession(),
    onChange: (cb) => supabase.auth.onAuthStateChange((_e, s) => cb(s)),
  },

  /* realtime only fires while online — offline periods are covered by
     pullRemote()/flushQueue() running on reconnect instead */
  subscribe(onChange) {
    const ch = supabase
      .channel("shop")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" },
        () => pullRemote().then(onChange))
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" },
        () => pullRemote().then(onChange))
      .subscribe();
    return () => supabase.removeChannel(ch);
  },
};
