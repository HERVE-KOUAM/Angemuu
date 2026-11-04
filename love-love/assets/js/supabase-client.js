// ============================================================
// CLIENT SUPABASE PARTAGÉ (site public + espace Admin)
// ============================================================
// Chargé AVANT booking-submit.js et booking-admin.js.
// Contient UNIQUEMENT l'initialisation du client, afin de ne pas
// exposer la logique Admin sur le site public.

const SUPABASE_URL = 'https://kskjalzggxaycfzfgspc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_yKfW79OSFtVKd5QXDfDsJw_2qciBjoI';

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);