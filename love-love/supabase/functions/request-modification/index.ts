// ============================================================
// Edge Function : request-modification
// Le client demande une modification SANS créer de compte :
//  - Vérifie le token HMAC (lien reçu par email)
//  - Vérifie la disponibilité du nouveau créneau
//  - Insère modification_requests (status pending)
//  - Émet l'événement modification.requested (outbox)
//
// Déploiement :
//   supabase functions deploy request-modification --no-verify-jwt
//
// Secrets : MODIFICATION_SECRET (partagé avec save-booking)
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MODIFICATION_SECRET = Deno.env.get("MODIFICATION_SECRET") ?? "angemuu-change-me-secret";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  booking_id: z.union([z.string(), z.number()]),
  token: z.string().min(10, "Token invalide"),
  new_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  new_time: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide"),
  justification: z.string().trim().min(10, "Justification trop courte").max(1000, "Justification trop longue"),
});

// Règles métier partagées
const MAX_BOOKINGS_PER_DAY = 2;
const BLOCK_HOURS = 5;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

async function signToken(input: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function verifyToken(token: string, bookingId: string): Promise<boolean> {
  const expected = await signToken(bookingId, MODIFICATION_SECRET);
  return token === expected;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bookingId = String(parsed.data.booking_id);

    // 1. Vérification du token HMAC (lié à la réservation)
    const okToken = await verifyToken(parsed.data.token, bookingId);
    if (!okToken) {
      return new Response(
        JSON.stringify({ error: "invalid_token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 2. La réservation existe-t-elle ?
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();
    if (bErr || !booking) {
      return new Response(
        JSON.stringify({ error: "booking_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (booking.status === "canceled") {
      return new Response(
        JSON.stringify({ error: "booking_canceled" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Disponibilité du nouveau créneau (en excluant la réservation elle-même)
    const { data: existing, error: eErr } = await supabase
      .from("bookings")
      .select("time, status")
      .eq("date", parsed.data.new_date)
      .neq("id", bookingId);
    if (eErr) {
      return new Response(
        JSON.stringify({ error: "db_error", message: eErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const active = (existing || []).filter(b => b.status === "pending" || b.status === "confirmed");

    if (active.length >= MAX_BOOKINGS_PER_DAY) {
      return new Response(
        JSON.stringify({ error: "day_full" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (active.some(b => b.time === parsed.data.new_time)) {
      return new Response(
        JSON.stringify({ error: "slot_taken" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const slotMin = timeToMinutes(parsed.data.new_time);
    if (active.some(b => {
      const H = timeToMinutes(b.time);
      return slotMin >= H && slotMin <= H + BLOCK_HOURS * 60;
    })) {
      return new Response(
        JSON.stringify({ error: "slot_blocked" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Insérer la demande de modification
    const { data: mod, error: mErr } = await supabase
      .from("modification_requests")
      .insert({
        booking_id: bookingId,
        new_date: parsed.data.new_date,
        new_time: parsed.data.new_time,
        justification: parsed.data.justification,
        status: "pending",
      })
      .select()
      .single();
    if (mErr) {
      return new Response(
        JSON.stringify({ error: "db_error", message: mErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Outbox : événement modification.requested
    await supabase.from("outbox_events").insert({
      event_type: "modification.requested",
      payload: {
        modification_id: mod.id,
        booking_id: bookingId,
        client_name: booking.client_name,
        new_date: parsed.data.new_date,
        new_time: parsed.data.new_time,
      },
      status: "pending",
    });

    return new Response(
      JSON.stringify({ ok: true, modification: mod }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "bad_request", message: String(e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});