import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formPath, shareUrl } from "@/lib/utils";
import type { IntakeLink } from "@/lib/intake-api";
import { cn } from "@/lib/utils";

export function SharePanel({ link }: { link: IntakeLink }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(formPath(link.token));

  useEffect(() => {
    const next = shareUrl(link.token);
    setUrl(/grok/i.test(next) ? formPath(link.token) : next);
  }, [link.token]);

  async function copy() {
    const value = /grok/i.test(url) ? formPath(link.token) : url;
    const el = document.getElementById("share-url") as HTMLInputElement | null;
    el?.focus();
    el?.select();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      try {
        document.execCommand("copy");
      } catch {
        /* URL field is selected for a manual copy */
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <p className="mb-1 text-sm font-medium text-fg">This send’s link</p>
      <p className="mb-3 text-xs text-muted">
        Private to this filing. Do not reuse it for another desk.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="share-url"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <div className="flex gap-2">
          <Button onClick={copy} className="min-w-28 flex-1 sm:flex-none">
            {copied ? (
              <>
                <Check className="size-4" strokeWidth={1.75} />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-4" strokeWidth={1.75} />
                Copy link
              </>
            )}
          </Button>
          <Link
            to="/r/$token"
            params={{ token: link.token }}
            className={cn(buttonVariants({ variant: "outline" }), "px-3")}
          >
            <ExternalLink className="size-4" strokeWidth={1.75} />
            Open
          </Link>
        </div>
      </div>
    </div>
  );
}
