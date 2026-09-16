import { useEffect, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  disablePing,
  enablePing,
  getPingSettings,
  sendTestPing,
  type PingSettings,
} from "@/lib/intake-api";

export function PingPanel() {
  const [settings, setSettings] = useState<PingSettings | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    getPingSettings()
      .then((next) => {
        setSettings(next);
        if (next?.pingEmail) setEmail(next.pingEmail);
      })
      .catch(() => undefined);
  }, []);

  async function turnOn() {
    setError(null);
    setBusy(true);
    try {
      const next = await enablePing({ data: { email } });
      setSettings(next);
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn pings on.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setError(null);
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
    setBusy(true);
    try {
      await sendTestPing();
      setTested(true);
      window.setTimeout(() => setTested(false), 2000);
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
          <p className="mb-1 text-sm font-medium text-fg">Phone ping</p>
          <p className="text-xs text-muted">
            When a customer hits Send request, this doorbell rings. Put the email
            that lives on your phone.
          </p>
        </div>
        {on ? (
          <Bell className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
        ) : (
          <BellOff className="size-4 shrink-0 text-subtle" strokeWidth={1.75} />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-1.5">
          <label htmlFor="ping-email" className="text-xs font-medium tracking-wide text-muted">
            Email on your phone
          </label>
          <Input
            id="ping-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="martin@…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          {on ? (
            <>
              <Button type="button" variant="outline" onClick={turnOff} disabled={busy}>
                Off
              </Button>
              <Button type="button" onClick={test} disabled={busy}>
                {tested ? (
                  <>
                    <Check className="size-4" strokeWidth={1.75} />
                    Sent
                  </>
                ) : (
                  "Test ping"
                )}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={turnOn} disabled={busy}>
              {busy ? "Saving…" : "Turn pings on"}
            </Button>
          )}
        </div>
      </div>

      {on && settings?.doorbell ? (
        <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
          <p className="mb-2 text-xs text-muted">
            Louder doorbell: open this once on the phone and allow alerts.
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

      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
