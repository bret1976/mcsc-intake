export const PRODUCTS = [
  "WTI Crude",
  "Brent Crude",
  "Dubai Crude",
  "Oman Crude",
  "Condensate",
  "Naphtha",
  "Gasoline (RBOB)",
  "Reformate",
  "Jet A-1",
  "ULSD",
  "Gasoil 10ppm",
  "Fuel Oil 0.5%S",
  "Fuel Oil 3.5%S",
  "VGO",
  "Propane",
  "Butane",
  "Natural Gasoline",
  "LNG",
  "Natural Gas",
] as const;

export const UNITS = [
  "BBL",
  "KBBL",
  "MT",
  "KT",
  "Gallons",
  "m³",
  "MMBTU",
  "Cargoes",
] as const;

export const TERMS = [
  "FOB",
  "CIF",
  "CFR",
  "DAP",
  "DES",
  "DAT",
  "EXW",
  "Pipeline / FIP",
  "In-tank",
] as const;

export const PAYMENT_TERMS = [
  "Irrevocable LC",
  "SBLC",
  "Wire / T/T",
  "Prepay",
  "Net 10",
  "Net 30",
  "Documentary collection",
  "Open account",
] as const;

export const STATUSES = [
  "sent",
  "opened",
  "submitted",
  "review",
  "quoted",
  "closed",
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  sent: "Link sent",
  opened: "Opened",
  submitted: "Submitted",
  review: "In review",
  quoted: "Quoted",
  closed: "Closed",
};

export const TRACKER_STEPS: { key: Status; label: string }[] = [
  { key: "sent", label: "Sent" },
  { key: "opened", label: "Open" },
  { key: "submitted", label: "Filed" },
  { key: "review", label: "Review" },
  { key: "closed", label: "Done" },
];

export function trackerIndex(status: Status): number {
  if (status === "quoted") return 3;
  const i = TRACKER_STEPS.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}

export function isOpenStatus(status: Status) {
  return status === "sent" || status === "opened";
}
