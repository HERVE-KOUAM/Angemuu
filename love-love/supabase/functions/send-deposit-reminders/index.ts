// Scheduled every minute by Supabase Cron. The handler validates a private header.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Angemuu <contact@angemuu.net>";
const WHATSAPP_NUMBER = Deno.env.get("WHATSAPP_BUSINESS_NUMBER") ?? "237656142787";

function safeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[character]!));
}

function reminderHtml(booking: Record<string, unknown>, whatsappUrl: string): string {
  const name = escapeHtml(booking.client_name);
  const date = escapeHtml(booking.booking_date);
  const time = escapeHtml(String(booking.booking_time ?? "").slice(0, 5));
  const service = escapeHtml(booking.service);
  const safeWhatsappUrl = escapeHtml(whatsappUrl);
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f1ed;color:#332822;font-family:Georgia,'Times New Roman',serif"><div style="max-width:580px;margin:30px auto;padding:0 16px"><div style="overflow:hidden;border:1px solid #eaded5;border-radius:18px;background:#fff"><div style="padding:30px 32px;background:#49372f;color:#fff"><p style="margin:0;color:#e6c6b3;font:700 11px Arial,sans-serif;letter-spacing:3px">ANGE MUU</p><h1 style="margin:13px 0 0;font-size:26px;font-weight:400">Finalisez votre réservation</h1></div><div style="padding:28px 32px"><p style="font-size:17px;line-height:1.65">Bonjour ${name},<br>Pour réserver votre place, un acompte doit être effectué auprès d’Ange Muu sur WhatsApp.</p><div style="margin:22px 0;padding:17px 19px;border-left:3px solid #b8876f;background:#faf6f3;font:14px/1.7 Arial,sans-serif"><strong>${service}</strong><br>${date} · ${time}</div><p style="font:14px/1.65 Arial,sans-serif;color:#6c5d55">Écrivez-nous pour connaître les modalités de paiement et finaliser votre réservation.</p><p style="margin:26px 0"><a href="${safeWhatsappUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#276b4b;color:#fff;font:700 14px Arial,sans-serif;text-decoration:none">Continuer sur WhatsApp</a></p><p style="font:13px/1.6 Arial,sans-serif;color:#786c65">À bientôt,<br><strong>L’équipe Ange Muu</strong></p></div></div><p style="margin:15px 0;text-align:center;color:#9b8e87;font:11px Arial,sans-serif">Ce message fait suite à votre demande de rendez-vous Ange Muu.</p></div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !RESEND_API_KEY) {
    console.error("Deposit reminder is missing a required Supabase or Resend secret.");
    return new Response("Service unavailable", { status: 503 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: reminders, error } = await supabase.rpc("claim_due_booking_deposit_reminders", { p_limit: 20 });
  if (error) {
    console.error("Could not claim deposit reminders:", error.message);
    return new Response("Could not claim reminders", { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const reminder of reminders ?? []) {
    let result: "sent" | "failed" | "skipped" = "failed";
    let errorMessage: string | null = null;

    if (!reminder.email || !["pending", "confirmed"].includes(reminder.booking_status)) {
      result = "skipped";
    } else {
      const whatsappText = [
        "Bonjour Ange Muu, je souhaite effectuer l’acompte pour réserver mon rendez-vous.",
        `Coiffure : ${reminder.service}`,
        `Date : ${reminder.booking_date} à ${String(reminder.booking_time).slice(0, 5)}`,
        `Nom : ${reminder.client_name}`,
      ].join("\n");
      const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappText)}`;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `booking-deposit-reminder/${reminder.reminder_id}`,
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [reminder.email],
            subject: "Votre acompte pour réserver votre rendez-vous — Ange Muu",
            html: reminderHtml(reminder, whatsappUrl),
          }),
        });
        if (response.ok) {
          result = "sent";
        } else {
          errorMessage = `resend_http_${response.status}`;
          console.error("Resend rejected a deposit reminder:", response.status);
        }
      } catch (sendError) {
        errorMessage = String(sendError).slice(0, 500);
        console.error("Deposit reminder send failed:", sendError);
      }
    }

    const { error: finishError } = await supabase.rpc("finish_booking_deposit_reminder", {
      p_reminder_id: reminder.reminder_id,
      p_result: result,
      p_error: errorMessage,
    });
    if (finishError) console.error("Could not finish deposit reminder:", finishError.message);
    if (result === "sent") sent++;
    else if (result === "skipped") skipped++;
    else failed++;
  }

  return Response.json({ ok: true, processed: (reminders ?? []).length, sent, skipped, failed });
});
