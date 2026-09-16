import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { publicId, randomToken } from "@/lib/ids";
import type { Status } from "@/lib/catalog";
import { PRODUCTS, UNITS, TERMS, PAYMENT_TERMS, STATUSES } from "@/lib/catalog";

export type Submission = {
  product: string;
  quantity: string;
  unit: string;
  terms: string;
  paymentTerms: string;
  deliveryWindow: string;
  notes: string;
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
  product: string | null;
  quantity: string | null;
  unit: string | null;
  terms: string | null;
  payment_terms: string | null;
  delivery_window: string | null;
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
  s.product,
  s.quantity,
  s.unit,
  s.terms,
  s.payment_terms,
  s.delivery_window,
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
          notes: row.notes ?? "",
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
         payment_terms, delivery_window, notes
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        subId,
        id,
        data.product,
        data.quantity.trim(),
        data.unit,
        data.terms,
        data.paymentTerms,
        data.deliveryWindow.trim(),
        data.notes.trim(),
      ],
    );
    const updated = await fetchLinkByToken(token);
    if (!updated) throw new Error("Saved, but failed to reload the request.");
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
         payment_terms, delivery_window, notes
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        subId,
        link.id,
        data.product,
        data.quantity.trim(),
        data.unit,
        data.terms,
        data.paymentTerms,
        data.deliveryWindow.trim(),
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
