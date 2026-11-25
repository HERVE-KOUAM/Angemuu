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
import { createCalendarInvite, icsAsBase64, signCalendarToken } from "../_shared/calendar-invite.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Angemuu <contact@angemuu.net>";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "murielleangemetiegamkengne@gmail.com,hkouamherve145@gmail.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const actionSchema = z.object({
  action: z.enum(["confirm", "reject", "cancel", "resend_confirmation", "accept_modification", "reject_modification"]),
  id: z.union([z.string(), z.number()]),
});

// Règles métier partagées
const MAX_BOOKINGS_PER_DAY = 2;
const BLOCK_HOURS = 6;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[character]!));
}

async function calendarDownloadUrl(booking: Record<string, unknown>): Promise<string> {
  const { utcStart } = createCalendarInvite(booking);
  const expiresAt = Math.floor((utcStart.getTime() + 7 * 24 * 60 * 60 * 1000) / 1000);
  const bookingId = String(booking.id);
  const signature = await signCalendarToken(bookingId, expiresAt, SUPABASE_SERVICE_KEY);
  const url = new URL("/functions/v1/download-calendar-invite", SUPABASE_URL);
  url.searchParams.set("booking_id", bookingId);
  url.searchParams.set("expires_at", String(expiresAt));
  url.searchParams.set("signature", signature);
  return url.toString();
}

function confirmationEmailHtml(booking: Record<string, unknown>, isAdmin = false, calendarUrl = ""): string {
  const name = escapeHtml(booking.client_name);
  const detailRows = [
    ["Service", booking.service], ["Date", booking.date], ["Heure", booking.time], ["Lieu", booking.location],
  ].map(([label, value]) => `<tr><td style="padding:10px 0;color:#756b68;border-bottom:1px solid #eee7e4">${label}</td><td style="padding:10px 0;text-align:right;color:#292321;border-bottom:1px solid #eee7e4;font-weight:600">${escapeHtml(value)}</td></tr>`).join("");
  const title = isAdmin ? "Rendez-vous confirmé" : "Votre rendez-vous est confirmé";
  const intro = isAdmin
    ? `La réservation de <strong>${name}</strong> vient d’être confirmée.`
    : `Bonjour ${name}, votre rendez-vous avec Ange Muu est confirmé. Nous avons hâte de vous accueillir.`;
  const calendarButton = !isAdmin && calendarUrl
    ? `<div style="margin:24px 0 8px"><a href="${escapeHtml(calendarUrl)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#8a624e;color:#fff;font-weight:700;text-decoration:none">Ajouter à mon calendrier</a></div><p style="font-size:12px;line-height:1.5;color:#756b68">Le fichier calendrier inclut un rappel prévu 24 heures avant le rendez-vous.</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f7f4f2;font-family:Arial,sans-serif;color:#292321"><div style="max-width:560px;margin:32px auto;padding:0 16px"><div style="background:#fff;border:1px solid #eee7e4;border-radius:16px;overflow:hidden"><div style="padding:28px 32px;background:#392923;color:#fff"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e8c9b9">ANGE MUU</div><h1 style="font-size:23px;margin:12px 0 0">${title}</h1></div><div style="padding:28px 32px"><p style="line-height:1.6">${intro}</p><table style="width:100%;border-collapse:collapse;margin:22px 0">${detailRows}</table>${calendarButton}<p style="font-size:13px;line-height:1.6;color:#756b68">Pour toute question, contactez-nous directement. À bientôt,<br><strong style="color:#392923">L’équipe Ange Muu</strong></p></div></div><p style="text-align:center;color:#958985;font-size:11px;margin:16px 0">Ange Muu · Élégance &amp; modernité</p></div></body></html>`;
}

async function sendEmail(to: string[], subject: string, html: string, attachments: Record<string, string>[] = []): Promise<boolean> {
  if (!RESEND_API_KEY || !to.length) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html, ...(attachments.length ? { attachments } : {}) }),
  });
  if (!response.ok) console.error("Resend confirmation email failed:", response.status, await response.text());
  return response.ok;
}

async function deliverConfirmationEmails(booking: Record<string, unknown>) {
  let client: "sent" | "failed" | "skipped" = "skipped";
  let admin: "sent" | "failed" | "skipped" = "skipped";
  if (!RESEND_API_KEY) {
    return { client: booking.email ? "failed" : "skipped", admin: ADMIN_EMAILS.length ? "failed" : "skipped" };
  }
  try {
    const calendar = createCalendarInvite(booking);
    const calendarUrl = booking.email ? await calendarDownloadUrl(booking) : "";
    client = booking.email
      ? (await sendEmail(
        [String(booking.email)],
        "Votre rendez-vous est confirmé — Ange Muu",
        confirmationEmailHtml(booking, false, calendarUrl),
        [{ filename: "rendez-vous-ange-muu.ics", content: icsAsBase64(calendar.ics), content_type: "text/calendar; method=PUBLISH; charset=UTF-8" }],
      ) ? "sent" : "failed")
      : "skipped";
    admin = ADMIN_EMAILS.length
      ? (await sendEmail(ADMIN_EMAILS, `Rendez-vous confirmé — ${String(booking.client_name ?? "Ange Muu")}`, confirmationEmailHtml(booking, true)) ? "sent" : "failed")
      : "skipped";
  } catch (emailError) {
    console.error("Confirmation email error:", emailError);
    if (client === "skipped" && booking.email) client = "failed";
    if (admin === "skipped" && ADMIN_EMAILS.length) admin = "failed";
  }
  return { client, admin };
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

    if (parsed.data.action === "resend_confirmation") {
      const { data: booking, error: bookingError } = await supabase.from("bookings")
        .select("id, client_name, email, service, date, time, location, status")
        .eq("id", id).maybeSingle();
      if (bookingError || !booking) {
        return new Response(JSON.stringify({ error: "booking_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (booking.status !== "confirmed") {
        return new Response(JSON.stringify({ error: "booking_not_confirmed" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const email = await deliverConfirmationEmails(booking);
      return new Response(JSON.stringify({ ok: true, status: "confirmed", email }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Actions directes sur la réservation
    if (parsed.data.action === "confirm" || parsed.data.action === "reject" || parsed.data.action === "cancel") {
      const statusMap: Record<string, string> = { confirm: "confirmed", reject: "rejected", cancel: "canceled" };
      const eventMap: Record<string, string> = { confirm: "booking.confirmed", reject: "booking.rejected", cancel: "booking.canceled" };

      if (parsed.data.action === "confirm") {
        const { data: booking, error: bookingError } = await supabase.from("bookings")
          .select("id, client_name, email, service, date, time, location, status")
          .eq("id", id).maybeSingle();
        if (bookingError || !booking) {
          return new Response(JSON.stringify({ error: "booking_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (booking.status !== "pending") {
          return new Response(JSON.stringify({ ok: true, status: booking.status, already_processed: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { data: confirmed, error: confirmError } = await supabase.from("bookings")
          .update({ status: "confirmed" }).eq("id", id).eq("status", "pending")
          .select("id, client_name, email, service, date, time, location").maybeSingle();
        if (confirmError || !confirmed) {
          return new Response(JSON.stringify({ error: "confirmation_conflict" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { error: outboxError } = await supabase.from("outbox_events").insert({
          event_type: eventMap.confirm, payload: { booking_id: id }, status: "pending",
        });
        if (outboxError) console.error("Could not record confirmation event:", outboxError.message);

        const email = await deliverConfirmationEmails(confirmed);
        return new Response(JSON.stringify({ ok: true, status: "confirmed", email }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

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
