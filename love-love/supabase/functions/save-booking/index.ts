// ============================================================
// Edge Function : save-booking
// Valide la réservation (zod), l'insère dans la table bookings,
// puis notifie l'admin via ntfy (push).
//
// Déploiement :
//   supabase functions deploy save-booking --no-verify-jwt
//
// Variables d'environnement (dashboard Supabase > Edge Functions) :
//   NTFY_TOPIC : topic ntfy (défaut "angemuu-reservations")
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NTFY_TOPIC = Deno.env.get("NTFY_TOPIC") ?? "angemuu-reservations";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Angemuu <contact@angemuu.net>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Schéma de validation des réservations
const bookingSchema = z.object({
  client_name: z.string().trim().min(2, "Nom trop court").max(120, "Nom trop long"),
  phone: z.string().trim().min(6, "Téléphone invalide").max(30, "Téléphone trop long"),
  email: z.string().trim().email("Email invalide").optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide"),
  service: z.string().trim().min(2, "Service requis").max(200, "Service trop long"),
  location: z.string().trim().min(2, "Lieu requis").max(100, "Lieu trop long"),
  comment: z.string().trim().max(1000, "Commentaire trop long").optional().nullable(),
});

// Règles métier
const MAX_BOOKINGS_PER_DAY = 2;
const BLOCK_HOURS = 5;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

Deno.serve(async (req) => {
  // Préflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // 1. Validation serveur
    const parsed = bookingSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "validation_failed", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Vérification des règles métier (limite 2/jour + blocage 5h)
    // Opérations internes avec la clé service_role (côté serveur) :
    // l'appelant est anonyme et les RLS réservent le SELECT bookings aux admins.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: existing, error: fetchError } = await supabase
      .from("bookings")
      .select("time, status")
      .eq("date", parsed.data.date);

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: "db_error", message: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const active = (existing || []).filter(b => b.status === "pending" || b.status === "confirmed");

    // Limite de RDV par jour
    if (active.length >= MAX_BOOKINGS_PER_DAY) {
      return new Response(
        JSON.stringify({ error: "day_full" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Créneau déjà réservé
    if (active.some(b => b.time === parsed.data.time)) {
      return new Response(
        JSON.stringify({ error: "slot_taken" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Blocage 5h : un RDV à H bloque [H, H+5h]
    const slotMin = timeToMinutes(parsed.data.time);
    const blocked = active.some(b => {
      const H = timeToMinutes(b.time);
      return slotMin >= H && slotMin <= H + BLOCK_HOURS * 60;
    });
    if (blocked) {
      return new Response(
        JSON.stringify({ error: "slot_blocked" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Insertion
    const { data, error } = await supabase
      .from("bookings")
      .insert([{ ...parsed.data, status: "pending" }])
      .select()
      .single();

    if (error) {
      // 23505 = violation de contrainte UNIQUE -> créneau déjà pris
      if (error.code === "23505") {
        return new Response(
          JSON.stringify({ error: "slot_taken" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "db_error", message: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Outbox : événement booking.created (pour n8n)
    try {
      await supabase.from("outbox_events").insert({
        event_type: "booking.created",
        payload: {
          booking_id: data.id,
          client_name: parsed.data.client_name,
          email: parsed.data.email,
          date: parsed.data.date,
          time: parsed.data.time,
          service: parsed.data.service,
        },
        status: "pending",
      });
    } catch (e) {
      console.error("outbox error:", e);
    }

    // 5. Email de réception (Resend) — transitoire, en attendant n8n
    if (RESEND_API_KEY && parsed.data.email) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [parsed.data.email],
            subject: "Votre demande de réservation — Ange Muu",
            html: `<p>Bonjour <strong>${parsed.data.client_name}</strong>,</p>
                   <p>Nous avons bien reçu votre demande de réservation :</p>
                   <ul>
                     <li>Service : ${parsed.data.service}</li>
                     <li>Date : ${parsed.data.date}</li>
                     <li>Heure : ${parsed.data.time}</li>
                     <li>Lieu : ${parsed.data.location}</li>
                   </ul>
                   <p>Nous vous confirmerons votre rendez-vous très prochainement.</p>
                   <p>À bientôt,<br>L'équipe Ange Muu</p>`,
          }),
        });
      } catch (e) {
        console.error("resend error:", e);
      }
    }

    // 6. Notification admin (ntfy) — non bloquante
    try {
      const msg =
        `Nouvelle réservation : ${parsed.data.client_name} — ${parsed.data.service} ` +
        `le ${parsed.data.date} à ${parsed.data.time} (${parsed.data.location})`;
      await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
        method: "POST",
        body: msg,
        headers: { Title: "Nouvelle réservation Angemuu", Priority: "high" },
      });
    } catch (e) {
      console.error("ntfy error:", e);
    }

    return new Response(
      JSON.stringify({ ok: true, booking: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "bad_request", message: String(e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});