import { useEffect, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  disablePing,
  enablePing,
  getPingSettings,
  savePushSub,
  sendTestPing,
  type PingSettings,
} from "@/lib/intake-api";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid-public";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function armThisPhone() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return;
  const reg = await navigator.serviceWorker.register("/sw-ping.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
  await savePushSub({
    data: {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  });
}

export function PingPanel() {
  const [settings, setSettings] = useState<PingSettings | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [signalKey, setSignalKey] = useState("");
  const [whatsappKey, setWhatsappKey] = useState("");
  const [webhook, setWebhook] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    getPingSettings()
      .then((next) => {
        setSettings(next);
        if (!next) return;
        if (next.pingEmail) setEmail(next.pingEmail);
        if (next.pingPhone) setPhone(next.pingPhone);
        if (next.pingSignalKey) setSignalKey(next.pingSignalKey);
        if (next.pingWhatsappKey) setWhatsappKey(next.pingWhatsappKey);
        if (next.pingWebhook) setWebhook(next.pingWebhook);
      })
      .catch(() => undefined);
  }, []);

  function payload() {
    return { email, phone, signalKey, whatsappKey, webhook };
  }

  const canArm = Boolean(email.trim() || phone.trim() || webhook.trim());

  async function turnOn() {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const next = await enablePing({ data: payload() });
      setSettings(next);
      try {
        await armThisPhone();
      } catch {
        /* other channels still work */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn pings on.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const next = await disablePing();
      setSettings(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn pings off.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      try {
        await armThisPhone();
      } catch {
        /* keep going */
      }
      const result = await sendTestPing({ data: payload() });
      const next = await getPingSettings();
      setSettings(next);
      setNote(result.detail);
      setTested(true);
      window.setTimeout(() => setTested(false), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test ping failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyDoorbell() {
    if (!settings?.doorbell) return;
    try {
      await navigator.clipboard.writeText(settings.doorbell);
    } catch {
      /* selected below */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const on = Boolean(settings?.pingOn);

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-4 shadow-panel sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-sm font-medium text-fg">Ping the way you talk</p>
          <p className="text-xs text-muted">
            When they hit Send request, you get a note like{" "}
            <span className="font-mono text-fg">MC-XXXX filed: 24000 BBL ULSD</span>
            . Phone for SMS / Signal / WhatsApp. Keys are one-time from CallMeBot.
            Webhook is Zapier or Make.
          </p>
        </div>
        {on ? (
          <Bell className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
        ) : (
          <BellOff className="size-4 shrink-0 text-subtle" strokeWidth={1.75} />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="ping-email" className="text-xs font-medium tracking-wide text-muted">
            Email on your phone
          </label>
          <Input
            id="ping-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="ping-phone" className="text-xs font-medium tracking-wide text-muted">
            Phone
          </label>
          <Input
            id="ping-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 702 …"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="ping-signal" className="text-xs font-medium tracking-wide text-muted">
            Signal key{" "}
            <span className="font-normal text-subtle">(optional)</span>
          </label>
          <Input
            id="ping-signal"
            autoComplete="off"
            placeholder="From CallMeBot in Signal"
            value={signalKey}
            onChange={(e) => setSignalKey(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="ping-wa" className="text-xs font-medium tracking-wide text-muted">
            WhatsApp key{" "}
            <span className="font-normal text-subtle">(optional)</span>
          </label>
          <Input
            id="ping-wa"
            autoComplete="off"
            placeholder="From CallMeBot in WhatsApp"
            value={whatsappKey}
            onChange={(e) => setWhatsappKey(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <label htmlFor="ping-hook" className="text-xs font-medium tracking-wide text-muted">
            Webhook{" "}
            <span className="font-normal text-subtle">(optional — Zapier / Make)</span>
          </label>
          <Input
            id="ping-hook"
            autoComplete="off"
            placeholder="https://hooks.zapier.com/…"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {on ? (
          <>
            <Button type="button" variant="outline" onClick={turnOff} disabled={busy}>
              Off
            </Button>
            <Button type="button" onClick={test} disabled={busy || !canArm}>
              {tested ? (
                <>
                  <Check className="size-4" strokeWidth={1.75} />
                  Sent
                </>
              ) : busy ? (
                "Sending…"
              ) : (
                "Test ping"
              )}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={turnOn} disabled={busy || !canArm}>
            {busy ? "Saving…" : "Turn pings on"}
          </Button>
        )}
      </div>

      {on && settings?.doorbell ? (
        <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
          <p className="mb-2 text-xs text-muted">
            Backup doorbell: open this once on the phone and allow alerts.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={settings.doorbell} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={copyDoorbell}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <a
              href={settings.doorbell}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm text-fg hover:bg-input"
            >
              Open
            </a>
          </div>
        </div>
      ) : null}

      {note ? (
        <p className="mt-3 text-sm text-primary" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
