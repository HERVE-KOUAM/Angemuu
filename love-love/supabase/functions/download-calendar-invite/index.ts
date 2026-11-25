import { createClient } from "npm:@supabase/supabase-js@2";
import { constantTimeEqual, createCalendarInvite, signCalendarToken } from "../_shared/calendar-invite.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return new Response("Service unavailable", { status: 503 });

  const url = new URL(req.url);
  const bookingId = url.searchParams.get("booking_id") ?? "";
  const expiresAt = Number(url.searchParams.get("expires_at"));
  const providedSignature = url.searchParams.get("signature") ?? "";
  if (!/^\d+$/.test(bookingId) || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return new Response("Invitation expired or invalid", { status: 404 });
  }

  const expectedSignature = await signCalendarToken(bookingId, expiresAt, SUPABASE_SERVICE_KEY);
  if (!constantTimeEqual(providedSignature, expectedSignature)) {
    return new Response("Invitation expired or invalid", { status: 404 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: booking, error } = await supabase.from("bookings")
    .select("id, client_name, service, date, time, location, status")
    .eq("id", bookingId).maybeSingle();
  if (error || !booking || booking.status !== "confirmed") {
    return new Response("Invitation unavailable", { status: 404 });
  }

  let invite: { ics: string };
  try {
    invite = createCalendarInvite(booking);
  } catch {
    return new Response("Invitation unavailable", { status: 422 });
  }

  return new Response(invite.ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="rendez-vous-ange-muu.ics"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
