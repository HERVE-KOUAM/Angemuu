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
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NTFY_TOPIC = Deno.env.get("NTFY_TOPIC") ?? "angemuu-reservations";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Angemuu <contact@angemuu.net>";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "murielleangemetiegamkengne@gmail.com,hkouamherve145@gmail.com")
  .split(",").map(s => s.trim()).filter(Boolean);
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "";
const WHATSAPP_ADMIN_PHONE = Deno.env.get("WHATSAPP_ADMIN_PHONE") ?? "237656142787";
const WHATSAPP_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE") ?? "nouvelle_reservation";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Schéma de validation des réservations
const bookingSchema = z.object({
  client_name: z.string().trim().min(2, "Nom trop court").max(120, "Nom trop long"),
  phone: z.string().trim().min(6, "Téléphone invalide").max(30, "Téléphone trop long"),
  email: z.string().trim().email("Email invalide").max(254, "Email trop long"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").refine((value) => {
    const parsedDate = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
  }, "Date invalide"),
  time: z.string().regex(/^(0[5-9]|1[0-9]):00$/, "Heure indisponible"),
  service: z.string().trim().min(2, "Service requis").max(200, "Service trop long"),
  location: z.string().trim().min(2, "Lieu requis").max(100, "Lieu trop long"),
  comment: z.string().trim().max(1000, "Commentaire trop long").optional().nullable(),
  deposit_acknowledged: z.literal(true),
});

function escapeHtml(value: string | null | undefined): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  };
  return String(value ?? "").replace(/[&<>\"']/g, (character) => entities[character]);
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

    // 2. Réserver atomiquement : disponibilité, jours off, limite journalière,
    // espacement et insertion sont contrôlés dans la même transaction SQL.
    if (!SUPABASE_SERVICE_KEY) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "service_unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: reservationResult, error } = await supabase.rpc("create_booking_atomic", {
      p_client_name: parsed.data.client_name,
      p_phone: parsed.data.phone,
      p_email: parsed.data.email,
      p_date: parsed.data.date,
      p_time: parsed.data.time,
      p_service: parsed.data.service,
      p_location: parsed.data.location,
      p_comment: parsed.data.comment ?? null,
    });

    if (error) {
      console.error("Erreur création réservation:", error);
      return new Response(
        JSON.stringify({ error: "booking_unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!reservationResult?.ok) {
      const conflictStatuses: Record<string, number> = {
        slot_taken: 409,
        slot_blocked: 409,
        day_full: 409,
        date_unavailable: 409,
        date_in_past: 400,
        invalid_time: 400,
      };
      const reason = reservationResult?.error ?? "booking_unavailable";
      return new Response(
        JSON.stringify({ error: reason }),
        { status: conflictStatuses[reason] ?? 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = reservationResult.booking;

    // Notifications réseau en arrière-plan : elles ne doivent pas faire attendre
    // la cliente après que sa demande a déjà été enregistrée.
    EdgeRuntime.waitUntil((async () => {
    // 5. Email de réception (Resend) — transitoire, en attendant n8n
    if (RESEND_API_KEY && parsed.data.email) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [parsed.data.email],
            subject: "Votre demande de réservation — Ange Muu",
            html: `<p>Bonjour <strong>${escapeHtml(parsed.data.client_name)}</strong>,</p>
                   <p>Nous avons bien reçu votre demande de réservation :</p>
                   <ul>
                     <li>Service : ${escapeHtml(parsed.data.service)}</li>
                     <li>Date : ${escapeHtml(parsed.data.date)}</li>
                     <li>Heure : ${escapeHtml(parsed.data.time)}</li>
                     <li>Lieu : ${escapeHtml(parsed.data.location)}</li>
                   </ul>
                   <p>Nous vous confirmerons votre rendez-vous très prochainement.</p>
                   <p>À bientôt,<br>L'équipe Ange Muu</p>`,
          }),
        });
        if (!response.ok) console.error("Resend a refusé l'email client:", response.status, await response.text());
      } catch (e) {
        console.error("resend error:", e);
      }
    }

    // 6. Notification ADMIN par email (Resend) — à chaque réservation
    if (RESEND_API_KEY && ADMIN_EMAILS.length) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: ADMIN_EMAILS,
            subject: "🔔 Nouvelle réservation — Ange Muu",
            html: `<p><strong>Nouvelle réservation reçue :</strong></p>
                   <ul>
                     <li>Client : ${escapeHtml(parsed.data.client_name)}</li>
                     <li>Téléphone : ${escapeHtml(parsed.data.phone)}</li>
                     <li>Email : ${escapeHtml(parsed.data.email || "non renseigné")}</li>
                     <li>Service : ${escapeHtml(parsed.data.service)}</li>
                     <li>Date : ${escapeHtml(parsed.data.date)} à ${escapeHtml(parsed.data.time)}</li>
                     <li>Lieu : ${escapeHtml(parsed.data.location)}</li>
                     <li>Commentaire : ${escapeHtml(parsed.data.comment || "aucun")}</li>
                   </ul>
                   <p><a href="https://angemuu.net/admin/">Ouvrir l'espace Admin</a> pour confirmer.</p>`,
          }),
        });
        if (!response.ok) console.error("Resend a refusé l'email admin:", response.status, await response.text());
      } catch (e) {
        console.error("resend admin error:", e);
      }
    }

    // 7. Notification ADMIN par WhatsApp (Cloud API) — si configuré
    if (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
      try {
        await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: WHATSAPP_ADMIN_PHONE,
            type: "template",
            template: {
              name: WHATSAPP_TEMPLATE,
              language: { code: "fr" },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: parsed.data.client_name },
                    { type: "text", text: parsed.data.service },
                    { type: "text", text: `${parsed.data.date} à ${parsed.data.time}` },
                  ],
                },
              ],
            },
          }),
        });
      } catch (e) {
        console.error("whatsapp error:", e);
      }
    }

    // 8. Notification admin (ntfy) — non bloquante
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
    })().catch((e) => console.error("Erreur notifications en arrière-plan:", e)));

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
