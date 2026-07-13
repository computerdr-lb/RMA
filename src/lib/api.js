import { supabase } from "./supabase.js";

/* Postgres columns are snake_case; the app speaks camelCase. Translate here
   and nowhere else. */
const toClient = (r) => ({
  id: r.id,
  name: r.name || "",
  phone: r.phone || "",
  altPhone: r.alt_phone || "",
  email: r.email || "",
  address: r.address || "",
  createdAt: r.created_at,
});
const fromClient = (c) => ({
  name: c.name,
  phone: c.phone || "",
  alt_phone: c.altPhone || "",
  email: c.email || "",
  address: c.address || "",
});

const toTicket = (r) => ({
  id: r.id,
  no: r.no,
  clientId: r.client_id,
  deviceType: r.device_type || "",
  model: r.model || "",
  withCharger: !!r.with_charger,
  withBag: !!r.with_bag,
  note: r.note || "",
  cost: Number(r.cost || 0),
  status: r.status || "Received",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const fromTicket = (t) => ({
  client_id: t.clientId,
  device_type: t.deviceType || "",
  model: t.model || "",
  with_charger: !!t.withCharger,
  with_bag: !!t.withBag,
  note: t.note || "",
  cost: Number(t.cost) || 0,
  status: t.status || "Received",
});

const ok = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

export const api = {
  clients: {
    async list() {
      const d = ok(await supabase.from("clients").select("*").order("created_at", { ascending: false }));
      return d.map(toClient);
    },
    async create(c) {
      const d = ok(await supabase.from("clients").insert(fromClient(c)).select().single());
      return toClient(d);
    },
    async update(id, c) {
      const d = ok(await supabase.from("clients").update(fromClient(c)).eq("id", id).select().single());
      return toClient(d);
    },
  },

  tickets: {
    async list() {
      const d = ok(await supabase.from("tickets").select("*").order("created_at", { ascending: false }));
      return d.map(toTicket);
    },
    // no ticket number is sent — Postgres assigns it from a sequence
    async create(t) {
      const d = ok(await supabase.from("tickets").insert(fromTicket(t)).select().single());
      return toTicket(d);
    },
    async update(id, t) {
      const d = ok(await supabase.from("tickets")
        .update({ ...fromTicket(t), updated_at: new Date().toISOString() })
        .eq("id", id).select().single());
      return toTicket(d);
    },
    async remove(id) {
      ok(await supabase.from("tickets").delete().eq("id", id));
    },
  },

  items: {
    async list() {
      const d = ok(await supabase.from("items").select("*").order("sort_order"));
      return d.map((r) => r.name);
    },
    async save(list) {
      ok(await supabase.from("items").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
      if (list.length) {
        ok(await supabase.from("items").insert(list.map((name, i) => ({ name, sort_order: i }))));
      }
      return list;
    },
  },

  settings: {
    async get() {
      const { data, error } = await supabase.from("settings").select("value").eq("key", "app").maybeSingle();
      if (error) throw new Error(error.message);
      return data?.value || {};
    },
    async save(s) {
      ok(await supabase.from("settings").upsert({ key: "app", value: s }, { onConflict: "key" }));
      return s;
    },
  },

  auth: {
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
    session: () => supabase.auth.getSession(),
    onChange: (cb) => supabase.auth.onAuthStateChange((_e, s) => cb(s)),
  },

  /* live sync: any change on the other PC lands here within a second */
  subscribe(onChange) {
    const ch = supabase
      .channel("shop")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, onChange)
      .subscribe();
    return () => supabase.removeChannel(ch);
  },
};
