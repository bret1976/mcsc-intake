import { useState } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createLink } from "@/lib/intake-api";
import { shareUrl } from "@/lib/utils";

async function writeClipboard(value: string) {
  const el = document.getElementById("public-form-url") as HTMLInputElement | null;
  el?.focus();
  el?.select();
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    try {
      document.execCommand("copy");
    } catch {
      /* field selected */
    }
  }
}

export function CopyFormLink({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mintAndCopy() {
    setError(null);
    setBusy(true);
    try {
      const link = await createLink({ data: {} });
      const value = shareUrl(link.token);
      if (/grok/i.test(value)) {
        throw new Error("Refusing to copy a Grok host.");
      }
      setUrl(value);
      await writeClipboard(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2 sm:flex-row"}>
        <Input
          id="public-form-url"
          readOnly
          value={url}
          placeholder="New private link appears here"
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Button onClick={mintAndCopy} className="min-w-32" disabled={busy}>
          {copied ? (
            <>
              <Check className="size-4" strokeWidth={1.75} />
              Copied
            </>
          ) : (
            <>
              {url ? (
                <Copy className="size-4" strokeWidth={1.75} />
              ) : (
                <Plus className="size-4" strokeWidth={1.75} />
              )}
              {busy ? "Creating…" : url ? "New link" : "New link"}
            </>
          )}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
