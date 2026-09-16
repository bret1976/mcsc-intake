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
  return "/desk";
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

export async function ringDesk(opts: { title: string; body: string }) {
  try {
    const settings = await readDeskPing();
    if (!settings?.pingOn || !settings.pingTopic) return;
    const headers: Record<string, string> = {
      Title: opts.title,
      Priority: "high",
      Tags: "inbox_tray",
    };
    const click = deskUrl();
    if (click.startsWith("http")) headers.Click = click;
    if (settings.pingEmail) headers.Email = settings.pingEmail;
    await fetch(`https://ntfy.sh/${encodeURIComponent(settings.pingTopic)}`, {
      method: "POST",
      headers,
      body: opts.body,
    });
  } catch {
    /* a missed ping must never block a filing */
  }
}

export function doorbellUrl(topic: string) {
  return `https://ntfy.sh/${encodeURIComponent(topic)}`;
}
