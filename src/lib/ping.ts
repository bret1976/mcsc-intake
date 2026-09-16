import { getSql } from "@/lib/db";

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

export async function sendPingEmail(opts: {
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
    if (!res.ok) {
      throw new Error(raw.slice(0, 180) || "Email did not send.");
    }
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
      throw new Error("Mail door is busy. Wait a minute and hit Test ping again.");
    }
    throw new Error(message || "Email did not send.");
  }
  return { ok: true, detail: "Sent. Check that inbox (and spam)." };
}

async function ringNtfy(topic: string, title: string, body: string) {
  try {
    const headers: Record<string, string> = {
      Title: title,
      Priority: "high",
      Tags: "inbox_tray",
    };
    const click = deskUrl();
    if (click.startsWith("http")) headers.Click = click;
    await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers,
      body,
    });
  } catch {
    /* extra doorbell — never block email */
  }
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
  const email = settings.pingEmail.trim();
  if (!email) {
    if (opts.requireEmail) {
      throw new Error("Add the email on your phone, then hit Test ping.");
    }
    if (settings.pingTopic) await ringNtfy(settings.pingTopic, opts.title, opts.body);
    return { ok: true, detail: "No email on file." };
  }

  const desk = deskUrl();
  const text = `${opts.body}\n\nDesk: ${desk}`;
  const result = await sendPingEmail({
    to: email,
    subject: opts.title,
    text,
  });
  if (settings.pingTopic) await ringNtfy(settings.pingTopic, opts.title, opts.body);
  return result;
}

export function doorbellUrl(topic: string) {
  return `https://ntfy.sh/${encodeURIComponent(topic)}`;
}
