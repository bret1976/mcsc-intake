import webpush from "web-push";
import { getSql } from "@/lib/db";
import { randomToken } from "@/lib/ids";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid-public";

type DeskPing = {
  pingOn: boolean;
  pingTopic: string;
  pingEmail: string;
  pingPhone: string;
  pingWhatsappKey: string;
  pingSignalKey: string;
  pingWebhook: string;
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

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const compact = trimmed.replace(/[^\d+]/g, "");
  const digits = compact.replace(/\D/g, "");
  if (compact.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new Error("That phone number doesn’t look right. Use +1…");
}

export async function readDeskPing(): Promise<DeskPing | null> {
  const sql = await getSql();
  const rows = await sql.query<{
    ping_on: boolean;
    ping_topic: string;
    ping_email: string;
    ping_phone: string | null;
    ping_whatsapp_key: string | null;
    ping_signal_key: string | null;
    ping_webhook: string | null;
  }>(
    `select ping_on, ping_topic, ping_email,
            coalesce(ping_phone, '') as ping_phone,
            coalesce(ping_whatsapp_key, '') as ping_whatsapp_key,
            coalesce(ping_signal_key, '') as ping_signal_key,
            coalesce(ping_webhook, '') as ping_webhook
     from desk_settings where id = 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    pingOn: Boolean(row.ping_on),
    pingTopic: row.ping_topic,
    pingEmail: row.ping_email ?? "",
    pingPhone: row.ping_phone ?? "",
    pingWhatsappKey: row.ping_whatsapp_key ?? "",
    pingSignalKey: row.ping_signal_key ?? "",
    pingWebhook: row.ping_webhook ?? "",
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

  const origin = deskUrl().replace(/\/desk$/, "");
  const res = await fetch(
    `https://formsubmit.co/ajax/${encodeURIComponent(to)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: origin,
        Referer: `${origin}/desk`,
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

async function sendSms(phone: string, text: string): Promise<string> {
  const sid = String(process.env.TWILIO_ACCOUNT_SID ?? "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  const from = String(process.env.TWILIO_FROM ?? "").trim();
  if (sid && token && from) {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: from, To: phone, Body: text }),
        signal: AbortSignal.timeout(12000),
      },
    );
    const raw = await res.text();
    if (!res.ok) throw new Error(raw.slice(0, 160) || "SMS did not send.");
    return "SMS sent.";
  }

  const key = String(process.env.TEXTBELT_KEY ?? "textbelt").trim() || "textbelt";
  const res = await fetch("https://textbelt.com/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, message: text, key }),
    signal: AbortSignal.timeout(12000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  };
  if (!json.success) {
    throw new Error(
      json.error ||
        "SMS needs a sender. Add a Signal or WhatsApp key, or a Zapier webhook.",
    );
  }
  return "SMS sent.";
}

async function sendCallMeBot(
  kind: "signal" | "whatsapp",
  phone: string,
  apikey: string,
  text: string,
): Promise<string> {
  const url =
    kind === "signal"
      ? `https://api.callmebot.com/signal/send.php?phone=${encodeURIComponent(phone)}&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(text)}`
      : `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const raw = await res.text();
  if (!res.ok || /invalid|error|apikey/i.test(raw)) {
    throw new Error(
      raw.slice(0, 160) ||
        `${kind === "signal" ? "Signal" : "WhatsApp"} ping failed. Check the key.`,
    );
  }
  return kind === "signal" ? "Signal ping sent." : "WhatsApp ping sent.";
}

async function sendWebhook(url: string, title: string, body: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      body,
      text: `${title}\n${body}`,
      desk: deskUrl(),
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error(`Webhook ${res.status}. Check that Zapier URL.`);
  }
  return "Webhook fired.";
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

  const desk = deskUrl();
  const text = `${opts.body}\n\nDesk: ${desk}`;
  const hits: string[] = [];
  const misses: string[] = [];

  const pushed = await sendWebPushes(opts.title, opts.body);
  if (pushed > 0) hits.push("phone alert");

  const email = settings.pingEmail.trim();
  if (email) {
    try {
      await sendPingEmail({ to: email, subject: opts.title, text });
      hits.push("email");
    } catch (err) {
      misses.push(err instanceof Error ? err.message : "Email failed.");
    }
  }

  const phone = settings.pingPhone.trim();
  if (phone) {
    try {
      hits.push(await sendSms(phone, `${opts.title}: ${opts.body}`));
    } catch (err) {
      misses.push(err instanceof Error ? err.message : "SMS failed.");
    }
  }

  if (phone && settings.pingSignalKey.trim()) {
    try {
      hits.push(
        await sendCallMeBot(
          "signal",
          phone,
          settings.pingSignalKey.trim(),
          `${opts.title}\n${opts.body}\n${desk}`,
        ),
      );
    } catch (err) {
      misses.push(err instanceof Error ? err.message : "Signal failed.");
    }
  }

  if (phone && settings.pingWhatsappKey.trim()) {
    try {
      hits.push(
        await sendCallMeBot(
          "whatsapp",
          phone,
          settings.pingWhatsappKey.trim(),
          `${opts.title}\n${opts.body}\n${desk}`,
        ),
      );
    } catch (err) {
      misses.push(err instanceof Error ? err.message : "WhatsApp failed.");
    }
  }

  const hook = settings.pingWebhook.trim();
  if (hook) {
    try {
      hits.push(await sendWebhook(hook, opts.title, opts.body));
    } catch (err) {
      misses.push(err instanceof Error ? err.message : "Webhook failed.");
    }
  }

  if (hits.length > 0) {
    const detail = `Sent via ${hits.join(", ").replace(/\. /g, ", ")}.`;
    if (misses.length && opts.requireEmail) {
      return { ok: true, detail: `${detail} ${misses[0]}` };
    }
    return { ok: true, detail };
  }

  if (opts.requireEmail) {
    throw new Error(
      misses[0] ||
        "Nothing to ping. Add email, phone + Signal/WhatsApp key, or a webhook.",
    );
  }
  return { ok: true, detail: misses[0] || "No ping targets on file." };
}

export function doorbellUrl(topic: string) {
  return `https://ntfy.sh/${encodeURIComponent(topic)}`;
}
