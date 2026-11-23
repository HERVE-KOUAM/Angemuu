// ============================================================
// Edge Function : admin-actions
// Actions réservées aux administrateurs (vérifié via is_admin) :
//  - confirm    : confirme une réservation (booking.confirmed)
//  - reject     : refuse une réservation (booking.rejected)
//  - cancel     : annule une réservation (booking.canceled)
//  - accept_modification : accepte une demande de modification
//      (vérifie la dispo, met à jour la réservation, libère l'ancien créneau)
//  - reject_modification : refuse une demande de modification
//
// Déploiement :
//   supabase functions deploy admin-actions --no-verify-jwt
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const actionSchema = z.object({
  action: z.enum(["confirm", "reject", "cancel", "accept_modification", "reject_modification"]),
  id: z.union([z.string(), z.number()]),
});

// Règles métier partagées
const MAX_BOOKINGS_PER_DAY = 2;
const BLOCK_HOURS = 6;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Vérifier que l'appelant est un admin (JWT)
    const authHeader = req.headers.get("Authorization") ?? "";
    const adminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uErr } = await adminClient.auth.getUser();
    if (uErr || !user) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: isAdmin } = await adminClient.rpc("is_admin");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Valider l'action
    const body = await req.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const id = String(parsed.data.id);

    // Opérations internes avec service_role (contourne les RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 3. Actions directes sur la réservation
    if (parsed.data.action === "confirm" || parsed.data.action === "reject" || parsed.data.action === "cancel") {
      const statusMap: Record<string, string> = { confirm: "confirmed", reject: "rejected", cancel: "canceled" };
      const eventMap: Record<string, string> = { confirm: "booking.confirmed", reject: "booking.rejected", cancel: "booking.canceled" };

      const { error } = await supabase
        .from("bookings")
        .update({ status: statusMap[parsed.data.action] })
        .eq("id", id);
      if (error) {
        return new Response(
          JSON.stringify({ error: "db_error", message: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase.from("outbox_events").insert({
        event_type: eventMap[parsed.data.action],
        payload: { booking_id: id },
        status: "pending",
      });

      return new Response(
        JSON.stringify({ ok: true, status: statusMap[parsed.data.action] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Gestion d'une demande de modification
    const { data: mod, error: mErr } = await supabase
      .from("modification_requests")
      .select("*")
      .eq("id", id)
      .single();
    if (mErr || !mod) {
      return new Response(
        JSON.stringify({ error: "modification_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (parsed.data.action === "reject_modification") {
      await supabase.from("modification_requests")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("id", id);
      await supabase.from("outbox_events").insert({
        event_type: "modification.rejected",
        payload: { modification_id: id, booking_id: mod.booking_id },
        status: "pending",
      });
      return new Response(
        JSON.stringify({ ok: true, status: "rejected" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // accept_modification : vérifier la disponibilité du nouveau créneau
    const { data: existing, error: eErr } = await supabase
      .from("bookings")
      .select("time, status")
      .eq("date", mod.new_date)
      .neq("id", mod.booking_id);
    if (eErr) {
      return new Response(
        JSON.stringify({ error: "db_error", message: eErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const active = (existing || []).filter(b => b.status === "pending" || b.status === "confirmed");

    let valid = true;
    let reason = "";
    const requestedTime = String(mod.new_time).slice(0, 5);
    if (!/^(0[5-9]|1[0-9]):00$/.test(requestedTime)) {
      valid = false;
      reason = "invalid_time";
    } else if (active.length >= MAX_BOOKINGS_PER_DAY) {
      valid = false;
      reason = "day_full";
    } else if (active.some(b => b.time === mod.new_time)) {
      valid = false;
      reason = "slot_taken";
    } else {
      const slotMin = timeToMinutes(mod.new_time);
      if (active.some(b => Math.abs(slotMin - timeToMinutes(b.time)) < BLOCK_HOURS * 60)) {
        valid = false;
        reason = "slot_blocked";
      }
    }

    if (!valid) {
      await supabase.from("modification_requests")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("id", id);
      await supabase.from("outbox_events").insert({
        event_type: "modification.rejected",
        payload: { modification_id: id, booking_id: mod.booking_id, reason },
        status: "pending",
      });
      return new Response(
        JSON.stringify({ error: reason }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Acceptation : met à jour la réservation (l'ancien créneau est libéré automatiquement)
    await supabase.from("bookings")
      .update({ date: mod.new_date, time: mod.new_time, status: "confirmed" })
      .eq("id", mod.booking_id);
    await supabase.from("modification_requests")
      .update({ status: "accepted", resolved_at: new Date().toISOString() })
      .eq("id", id);
    await supabase.from("outbox_events").insert({
      event_type: "modification.accepted",
      payload: {
        modification_id: id,
        booking_id: mod.booking_id,
        new_date: mod.new_date,
        new_time: mod.new_time,
      },
      status: "pending",
    });

    return new Response(
      JSON.stringify({ ok: true, status: "accepted" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "bad_request", message: String(e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
