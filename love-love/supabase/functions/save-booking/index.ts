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
const NTFY_TOPIC = Deno.env.get("NTFY_TOPIC") ?? "angemuu-reservations";

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

    // 2. Insertion (hérite du rôle de l'appelant -> les RLS s'appliquent)
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

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

    // 3. Notification admin (ntfy) — non bloquante
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