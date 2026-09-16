import webpush from "web-push";
import { getSql } from "@/lib/db";
import { randomToken } from "@/lib/ids";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid-public";

type DeskPing = {
  pingOn: boolean;
  pingTopic: string;
  pingEmail: string;
};

export type { DeskPing };

function deskUrl() {
  const host = String(process.env.RAILWAY_PUBLIC_DOMAIN ?? "").trim();
  if (host && !/grok/i.test(host)) return `https://${host}/desk`;
  return "https://mcsc-intake-production.up.railway.app/desk";
}

function vapidPrivate() {
  return String(process.env.VAPID_PRIVATE_KEY ?? "").trim();
}

export async function readDeskPing(): Promise<DeskPing | null> {
  const sql = await getSql();
  const rows = await sql.query<{
    ping_on: boolean;
    ping_topic: string;
    ping_email: string;
  }>(`select ping_on, ping_topic, ping_email from desk_settings where id = 1`);
  const row = rows[0];
  if (!row) return null;
  return {
    pingOn: Boolean(row.ping_on),
    pingTopic: row.ping_topic,
    pingEmail: row.ping_email ?? "",
  };
}

export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  const sql = await getSql();
  await sql.query(
    `insert into push_subs (id, endpoint, p256dh, auth)
     values ($1, $2, $3, $4)
     on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth`,
    [randomToken(18), sub.endpoint, sub.p256dh, sub.auth],
  );
}

async function sendWebPushes(title: string, body: string) {
  const privateKey = vapidPrivate();
  if (!privateKey) return 0;
  webpush.setVapidDetails(
    "mailto:desk@mcsc-intake.app",
    VAPID_PUBLIC_KEY,
    privateKey,
  );
  const sql = await getSql();
  const rows = await sql.query<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }>(`select endpoint, p256dh, auth from push_subs`);
  const payload = JSON.stringify({ title, body, url: deskUrl() });
  let sent = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        payload,
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await sql.query(`delete from push_subs where endpoint = $1`, [
          row.endpoint,
        ]);
      }
    }
  }
  return sent;
}

async function sendPingEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: true; detail: string }> {
  const to = opts.to.trim();
  if (!to) throw new Error("Add the email on your phone first.");

  const resend = String(process.env.RESEND_API_KEY ?? "").trim();
  if (resend) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resend}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MCSC Intake <onboarding@resend.dev>",
        to: [to],
        subject: opts.subject,
        text: opts.text,
      }),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(raw.slice(0, 180) || "Email did not send.");
    return { ok: true, detail: "Sent. Check that inbox (and spam)." };
  }

  const res = await fetch(
    `https://formsubmit.co/ajax/${encodeURIComponent(to)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        _subject: opts.subject,
        _template: "box",
        _captcha: "false",
        _url: deskUrl(),
        name: "MCSC Intake",
        message: opts.text,
      }),
      signal: AbortSignal.timeout(12000),
    },
  );
  const raw = await res.text();
  let json: { success?: boolean | string; message?: string } = {};
  try {
    json = JSON.parse(raw) as { success?: boolean | string; message?: string };
  } catch {
    throw new Error(raw.slice(0, 180) || "Email did not send.");
  }
  const success = json.success === true || json.success === "true";
  const message = String(json.message ?? "").trim();
  if (!success) {
    if (/activat/i.test(message)) {
      throw new Error(
        "Check that inbox (and spam) for a confirm email. Click the link once, then hit Test ping again.",
      );
    }
    if (/rate limit/i.test(message)) {
      throw new Error(
        "Mail door is busy. Wait a minute and hit Test ping again.",
      );
    }
    throw new Error(message || "Email did not send.");
  }
  return { ok: true, detail: "Sent. Check that inbox (and spam)." };
}

export async function ringDesk(opts: {
  title: string;
  body: string;
  requireEmail?: boolean;
}): Promise<{ ok: true; detail: string }> {
  const settings = await readDeskPing();
  if (!settings?.pingOn) {
    if (opts.requireEmail) throw new Error("Turn pings on first.");
    return { ok: true, detail: "Pings are off." };
  }

  const pushed = await sendWebPushes(opts.title, opts.body);

  const email = settings.pingEmail.trim();
  if (!email) {
    if (pushed > 0) {
      return { ok: true, detail: "Phone ping sent. Add an email to also hit the inbox." };
    }
    if (opts.requireEmail) {
      throw new Error("Add the email on your phone, then hit Test ping.");
    }
    return { ok: true, detail: "No email on file." };
  }

  const desk = deskUrl();
  const text = `${opts.body}\n\nDesk: ${desk}`;
  try {
    const result = await sendPingEmail({
      to: email,
      subject: opts.title,
      text,
    });
    if (pushed > 0) {
      return { ok: true, detail: `${result.detail} Phone ping sent too.` };
    }
    return result;
  } catch (err) {
    if (pushed > 0) {
      return {
        ok: true,
        detail:
          "Phone ping sent. Inbox send failed — check spam, or hit Test ping again.",
      };
    }
    throw err;
  }
}

export function doorbellUrl(topic: string) {
  return `https://ntfy.sh/${encodeURIComponent(topic)}`;
}
