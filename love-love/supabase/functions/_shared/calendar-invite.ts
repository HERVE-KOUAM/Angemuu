export const CALENDAR_TIME_ZONE = "Africa/Douala";
export const CALENDAR_EVENT_DURATION_HOURS = 7;

function escapeIcsText(value: unknown): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function formatIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function createCalendarInvite(booking: Record<string, unknown>): { ics: string; utcStart: Date } {
  const date = String(booking.date ?? "");
  const time = String(booking.time ?? "").slice(0, 5);
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) throw new Error("Invalid booking date or time for calendar invite");

  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  // Cameroon uses UTC+1. Keep the local event wall time and convert .ics dates to UTC.
  const localStart = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  const localEnd = new Date(localStart.getTime() + CALENDAR_EVENT_DURATION_HOURS * 60 * 60 * 1000);
  const utcStart = new Date(localStart.getTime() - 60 * 60 * 1000);
  const utcEnd = new Date(localEnd.getTime() - 60 * 60 * 1000);
  const title = `Rendez-vous Ange Muu — ${String(booking.service ?? "Coiffure")}`;
  const description = `Rendez-vous Ange Muu pour ${String(booking.client_name ?? "la cliente")}. Un rappel est prévu 24 heures avant le rendez-vous.`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ange Muu//Booking Calendar//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:angemuu-booking-${escapeIcsText(booking.id)}@angemuu.net`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${formatIcsUtc(utcStart)}`,
    `DTEND:${formatIcsUtc(utcEnd)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(booking.location ?? "Ange Muu")}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-P1D",
    "DESCRIPTION:Rappel de votre rendez-vous Ange Muu demain",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  return { ics, utcStart };
}

export function icsAsBase64(ics: string): string {
  const bytes = new TextEncoder().encode(ics);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

export function toBase64Url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function signCalendarToken(bookingId: string, expiresAt: number, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${bookingId}.${expiresAt}`));
  return toBase64Url(new Uint8Array(signature));
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
