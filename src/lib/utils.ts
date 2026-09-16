import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formPath(token: string) {
  return `/r/${token}`;
}

const BLOCKED_HOST = /grok/i;

function fromEnvShareOrigin(): string {
  const raw = String(import.meta.env.VITE_SHARE_ORIGIN ?? "")
    .trim()
    .replace(/\/$/, "");
  if (!raw || BLOCKED_HOST.test(raw)) return "";
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (BLOCKED_HOST.test(u.hostname)) return "";
    return u.origin;
  } catch {
    return "";
  }
}

function originIfClean(value: string): string {
  try {
    const u = new URL(value);
    if (BLOCKED_HOST.test(u.hostname) || BLOCKED_HOST.test(u.origin)) return "";
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.origin;
  } catch {
    return "";
  }
}

/** Public origin for copied intake links. Never includes "grok". */
export function shareOrigin(): string {
  const configured = fromEnvShareOrigin();
  if (configured) return configured;

  if (typeof window === "undefined") return "";

  const page = originIfClean(window.location.origin);
  if (page) return page;

  if (typeof location.ancestorOrigins !== "undefined") {
    for (let i = 0; i < location.ancestorOrigins.length; i += 1) {
      const ancestor = originIfClean(location.ancestorOrigins[i]);
      if (ancestor) return ancestor;
    }
  }

  try {
    const u = new URL(window.location.origin);
    const host = u.hostname
      .replace(/\.grok\.me$/i, ".vercel.app")
      .replace(/grok/gi, "mcsc");
    if (host.includes(".") && !BLOCKED_HOST.test(host)) {
      return `${u.protocol}//${host}`;
    }
  } catch {
    /* fall through */
  }

  return "https://mcsc-intake.vercel.app";
}

export function shareUrl(token: string) {
  const url = `${shareOrigin()}${formPath(token)}`;
  if (BLOCKED_HOST.test(url)) {
    return `https://mcsc-intake.vercel.app${formPath(token)}`;
  }
  return url;
}

/** @deprecated use shareUrl — kept for path-only SSR */
export function formUrl(token: string) {
  return shareUrl(token);
}

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
