import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { publicId, randomToken } from "@/lib/ids";
import type { Status } from "@/lib/catalog";
import { PRODUCTS, UNITS, TERMS, PAYMENT_TERMS, STATUSES } from "@/lib/catalog";
import { doorbellUrl, normalizePhone, readDeskPing, ringDesk, savePushSubscription, type DeskPing } from "@/lib/ping";

export type Submission = {
  product: string;
  quantity: string;
  unit: string;
  terms: string;
  paymentTerms: string;
  deliveryWindow: string;
  businessLicense: string;
  rcn: string;
  notes: string;
};

export type Quote = {
  price: string;
  validity: string;
  incoterms: string;
  notes: string;
  quotedAt: string | null;
};

export type IntakeLink = {
  id: string;
  token: string;
  publicId: string;
  label: string;
  status: Status;
  createdAt: string;
  openedAt: string | null;
  submittedAt: string | null;
  quote: Quote | null;
  submission: Submission | null;
};

type LinkRow = {
  id: string;
  token: string;
  public_id: string;
  label: string;
  status: string;
  created_at: string;
  opened_at: string | null;
  submitted_at: string | null;
  quote_price: string | null;
  quote_validity: string | null;
  quote_incoterms: string | null;
  quote_notes: string | null;
  quoted_at: string | null;
  product: string | null;
  quantity: string | null;
  unit: string | null;
  terms: string | null;
  payment_terms: string | null;
  delivery_window: string | null;
  business_license: string | null;
  rcn: string | null;
  notes: string | null;
};

const LINK_SELECT = `
  l.id,
  l.token,
  l.public_id,
  l.label,
  l.status,
  l.created_at::text as created_at,
  l.opened_at::text as opened_at,
  l.submitted_at::text as submitted_at,
  coalesce(l.quote_price, '') as quote_price,
  coalesce(l.quote_validity, '') as quote_validity,
  coalesce(l.quote_incoterms, '') as quote_incoterms,
  coalesce(l.quote_notes, '') as quote_notes,
  l.quoted_at::text as quoted_at,
  s.product,
  s.quantity,
  s.unit,
  s.terms,
  s.payment_terms,
  s.delivery_window,
  s.business_license,
  s.rcn,
  s.notes
`;

function mapLink(row: LinkRow): IntakeLink {
  const submission: Submission | null =
    row.product && row.quantity && row.unit && row.terms
      ? {
          product: row.product,
          quantity: row.quantity,
          unit: row.unit,
          terms: row.terms,
          paymentTerms: row.payment_terms ?? "",
          deliveryWindow: row.delivery_window ?? "",
          businessLicense: row.business_license ?? "",
          rcn: row.rcn ?? "",
          notes: row.notes ?? "",
        }
      : null;
  const quote: Quote | null =
    row.quoted_at || (row.quote_price && row.quote_price.trim())
      ? {
          price: row.quote_price ?? "",
          validity: row.quote_validity ?? "",
          incoterms: row.quote_incoterms ?? "",
          notes: row.quote_notes ?? "",
          quotedAt: row.quoted_at,
        }
      : null;
  return {
    id: row.id,
    token: row.token,
    publicId: row.public_id,
    label: row.label,
    status: (STATUSES as readonly string[]).includes(row.status)
      ? (row.status as Status)
      : "sent",
    createdAt: row.created_at,
    openedAt: row.opened_at,
    submittedAt: row.submitted_at,
    quote,
    submission,
  };
}

async function fetchLinkByToken(token: string): Promise<IntakeLink | null> {
  const sql = await getSql();
  const rows = await sql.query<LinkRow>(
    `select ${LINK_SELECT}
     from intake_links l
     left join submissions s on s.link_id = l.id
     where l.token = $1
     limit 1`,
    [token],
  );
  return rows[0] ? mapLink(rows[0]) : null;
}

export const listLinks = createServerFn({ method: "POST" }).handler(
  async (): Promise<IntakeLink[]> => {
    const sql = await getSql();
    const rows = await sql.query<LinkRow>(
      `select ${LINK_SELECT}
       from intake_links l
       left join submissions s on s.link_id = l.id
       order by l.created_at desc
       limit 80`,
    );
    return rows.map(mapLink);
  },
);

export const createLink = createServerFn({ method: "POST" })
  .validator(
    z.object({
      label: z.string().trim().max(80).optional(),
    }),
  )
  .handler(async ({ data }): Promise<IntakeLink> => {
    const sql = await getSql();
    const id = randomToken(22);
    const token = randomToken(20);
    const pid = publicId();
    const label = data.label?.trim() ?? "";
    await sql.query(
      `insert into intake_links (id, token, public_id, label, status)
       values ($1, $2, $3, $4, 'sent')`,
      [id, token, pid, label],
    );
    const link = await fetchLinkByToken(token);
    if (!link) throw new Error("Failed to create intake link");
    return link;
  });

export const getLink = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().trim().min(1).max(64) }))
  .handler(async ({ data }): Promise<IntakeLink | null> => {
    return fetchLinkByToken(data.token);
  });

export const openLink = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().trim().min(1).max(64) }))
  .handler(async ({ data }): Promise<IntakeLink | null> => {
    const sql = await getSql();
    await sql.query(
      `update intake_links
       set status = 'opened',
           opened_at = coalesce(opened_at, now())
       where token = $1 and status = 'sent'`,
      [data.token],
    );
    return fetchLinkByToken(data.token);
  });

const openSchema = z.object({
  product: z.enum(PRODUCTS),
  quantity: z.string().trim().min(1).max(40),
  unit: z.enum(UNITS),
  terms: z.enum(TERMS),
  paymentTerms: z.union([z.enum(PAYMENT_TERMS), z.literal("")]),
  deliveryWindow: z.string().trim().max(80),
  businessLicense: z.string().trim().max(80),
  rcn: z.string().trim().max(80),
  notes: z.string().trim().max(2000),
});

export const submitOpen = createServerFn({ method: "POST" })
  .validator(openSchema)
  .handler(async ({ data }): Promise<IntakeLink> => {
    const sql = await getSql();
    const id = randomToken(22);
    const token = randomToken(20);
    const pid = publicId();
    await sql.query(
      `insert into intake_links (id, token, public_id, label, status, opened_at, submitted_at)
       values ($1, $2, $3, '', 'submitted', now(), now())`,
      [id, token, pid],
    );
    const subId = randomToken(22);
    await sql.query(
      `insert into submissions (
         id, link_id, product, quantity, unit, terms,
         payment_terms, delivery_window, business_license, rcn, notes
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        subId,
        id,
        data.product,
        data.quantity.trim(),
        data.unit,
        data.terms,
        data.paymentTerms,
        data.deliveryWindow.trim(),
        data.businessLicense.trim(),
        data.rcn.trim(),
        data.notes.trim(),
      ],
    );
    const updated = await fetchLinkByToken(token);
    if (!updated) throw new Error("Saved, but failed to reload the request.");
    await ringFor(updated);
    return updated;
  });


export const submitIntake = createServerFn({ method: "POST" })
  .validator(openSchema.extend({ token: z.string().trim().min(1).max(64) }))
  .handler(async ({ data }): Promise<IntakeLink> => {
    const sql = await getSql();
    const links = await sql.query<{ id: string; status: string }>(
      `select id, status from intake_links where token = $1 limit 1`,
      [data.token],
    );
    const link = links[0];
    if (!link) throw new Error("This intake link is not valid.");
    if (link.status === "closed") {
      throw new Error("This link is no longer accepting requests.");
    }
    if (link.status === "submitted" || link.status === "review" || link.status === "quoted") {
      throw new Error("This request was already submitted.");
    }
    const subId = randomToken(22);
    await sql.query(
      `insert into submissions (
         id, link_id, product, quantity, unit, terms,
         payment_terms, delivery_window, business_license, rcn, notes
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        subId,
        link.id,
        data.product,
        data.quantity.trim(),
        data.unit,
        data.terms,
        data.paymentTerms,
        data.deliveryWindow.trim(),
        data.businessLicense.trim(),
        data.rcn.trim(),
        data.notes.trim(),
      ],
    );
    await sql.query(
      `update intake_links
       set status = 'submitted',
           submitted_at = now(),
           opened_at = coalesce(opened_at, now())
       where id = $1`,
      [link.id],
    );
    const updated = await fetchLinkByToken(data.token);
    if (!updated) throw new Error("Saved, but failed to reload the request.");
    await ringFor(updated);
    return updated;
  });

export const setLinkStatus = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string().trim().min(1).max(64),
      status: z.enum(["review", "quoted", "closed"]),
    }),
  )
  .handler(async ({ data }): Promise<IntakeLink> => {
    const sql = await getSql();
    const rows = await sql.query<{ id: string; status: string }>(
      `select id, status from intake_links where token = $1 limit 1`,
      [data.token],
    );
    if (!rows[0]) throw new Error("Link not found.");
    await sql.query(`update intake_links set status = $1 where token = $2`, [
      data.status,
      data.token,
    ]);
    const updated = await fetchLinkByToken(data.token);
    if (!updated) throw new Error("Failed to update status.");
    return updated;
  });

function ringFor(link: IntakeLink) {
  const sub = link.submission;
  const body = sub
    ? `${link.publicId} filed: ${sub.quantity} ${sub.unit} ${sub.product}`
    : `${link.publicId} just filed`;
  return ringDesk({ title: "MCSC Intake", body }).catch(() => undefined);
}

export const sendQuote = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string().trim().min(1).max(64),
      price: z.string().trim().min(1).max(80),
      validity: z.string().trim().min(1).max(80),
      incoterms: z.enum(TERMS),
      notes: z.string().trim().max(2000),
    }),
  )
  .handler(async ({ data }): Promise<IntakeLink> => {
    const sql = await getSql();
    const rows = await sql.query<{ id: string; status: string }>(
      `select id, status from intake_links where token = $1 limit 1`,
      [data.token],
    );
    const row = rows[0];
    if (!row) throw new Error("Link not found.");
    if (row.status === "closed") {
      throw new Error("This link is closed.");
    }
    if (row.status === "sent" || row.status === "opened") {
      throw new Error("Nothing to quote yet. Wait until they file.");
    }
    await sql.query(
      `update intake_links
       set quote_price = $1,
           quote_validity = $2,
           quote_incoterms = $3,
           quote_notes = $4,
           quoted_at = now(),
           status = 'quoted'
       where token = $5`,
      [
        data.price.trim(),
        data.validity.trim(),
        data.incoterms,
        data.notes.trim(),
        data.token,
      ],
    );
    const updated = await fetchLinkByToken(data.token);
    if (!updated) throw new Error("Quote saved, but failed to reload.");
    return updated;
  });

export type PingSettings = DeskPing & { doorbell: string };

const pingInput = z.object({
  email: z.string().trim().max(120),
  phone: z.string().trim().max(32),
  whatsappKey: z.string().trim().max(80),
  signalKey: z.string().trim().max(80),
  webhook: z.string().trim().max(500),
});

async function upsertPing(data: z.infer<typeof pingInput>): Promise<PingSettings> {
  const email = data.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("That email doesn’t look right.");
  }
  const phone = data.phone.trim() ? normalizePhone(data.phone) : "";
  const webhook = data.webhook.trim();
  if (webhook) {
    let parsed: URL;
    try {
      parsed = new URL(webhook);
    } catch {
      throw new Error("That webhook isn’t a valid URL.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("Webhook must start with https://");
    }
  }
  if (!email && !phone && !webhook) {
    throw new Error("Add an email, a phone number, or a webhook.");
  }
  const sql = await getSql();
  const existing = await readDeskPing();
  const topic = existing?.pingTopic || `mcsc-${randomToken(18)}`;
  await sql.query(
    `insert into desk_settings (
       id, ping_topic, ping_email, ping_phone, ping_whatsapp_key,
       ping_signal_key, ping_webhook, ping_on, updated_at
     ) values (1, $1, $2, $3, $4, $5, $6, true, now())
     on conflict (id) do update set
       ping_email = excluded.ping_email,
       ping_phone = excluded.ping_phone,
       ping_whatsapp_key = excluded.ping_whatsapp_key,
       ping_signal_key = excluded.ping_signal_key,
       ping_webhook = excluded.ping_webhook,
       ping_on = true,
       updated_at = now()`,
    [
      topic,
      email,
      phone,
      data.whatsappKey.trim(),
      data.signalKey.trim(),
      webhook,
    ],
  );
  const settings = await readDeskPing();
  if (!settings) throw new Error("Could not turn pings on.");
  return { ...settings, doorbell: doorbellUrl(settings.pingTopic) };
}

export const getPingSettings = createServerFn({ method: "POST" }).handler(
  async (): Promise<PingSettings | null> => {
    const settings = await readDeskPing();
    if (!settings) return null;
    return { ...settings, doorbell: doorbellUrl(settings.pingTopic) };
  },
);

export const enablePing = createServerFn({ method: "POST" })
  .validator(pingInput)
  .handler(async ({ data }): Promise<PingSettings> => {
    return upsertPing(data);
  });

export const disablePing = createServerFn({ method: "POST" }).handler(
  async (): Promise<PingSettings | null> => {
    const sql = await getSql();
    await sql.query(
      `update desk_settings set ping_on = false, updated_at = now() where id = 1`,
    );
    const settings = await readDeskPing();
    if (!settings) return null;
    return { ...settings, doorbell: doorbellUrl(settings.pingTopic) };
  },
);

export const sendTestPing = createServerFn({ method: "POST" })
  .validator(pingInput)
  .handler(async ({ data }): Promise<{ ok: true; detail: string }> => {
    await upsertPing(data);
    return ringDesk({
      title: "MCSC Intake — test ping",
      body: "Test ping. If you got this, the doorbell works.",
      requireEmail: true,
    });
  });

export const savePushSub = createServerFn({ method: "POST" })
  .validator(
    z.object({
      endpoint: z.string().trim().min(8).max(2000),
      p256dh: z.string().trim().min(8).max(500),
      auth: z.string().trim().min(4).max(200),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await savePushSubscription(data);
    return { ok: true };
  });
