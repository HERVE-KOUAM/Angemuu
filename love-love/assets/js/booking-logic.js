// ============================================================
// LOGIQUE MÉTIER DES CRÉNEAUX DE RÉSERVATION
// Règles :
//  - Créneaux toutes les heures de 08:00 à 19:00
//  - 2 RDV max par jour
//  - Un RDV à H bloque les 5h suivantes [H, H+5h]
// ============================================================

const BOOKING_CONFIG = {
    OPEN_HOUR: 8,          // 08:00
    CLOSE_HOUR: 19,        // 19:00 (dernier créneau)
    SLOT_STEP_HOURS: 1,    // toutes les 1h
    MAX_BOOKINGS_PER_DAY: 2,
    BLOCK_HOURS: 5         // blocage des 5h suivantes
};

// Génère la liste des créneaux horaires "HH:MM"
function getBookingSlots() {
    const slots = [];
    for (let h = BOOKING_CONFIG.OPEN_HOUR; h <= BOOKING_CONFIG.CLOSE_HOUR; h++) {
        slots.push(String(h).padStart(2, '0') + ':00');
    }
    return slots;
}

// Convertit "HH:MM" en minutes depuis minuit
function timeToMinutes(t) {
    const parts = String(t).split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
}

// Calcule les créneaux disponibles pour une date donnée.
// bookings : liste des réservations actives (pending/confirmed) de cette date.
// Retourne { slots: [{time, available, reason}], dayFull: bool }
function computeDaySlots(bookings) {
    const slots = getBookingSlots();
    const active = (bookings || []).filter(b => b.status === 'pending' || b.status === 'confirmed');
    const dayFull = active.length >= BOOKING_CONFIG.MAX_BOOKINGS_PER_DAY;
    const startTimes = active.map(b => timeToMinutes(b.time));

    return {
        dayFull,
        slots: slots.map(slot => {
            const slotMin = timeToMinutes(slot);
            let available = true;
            let reason = '';

            // 1. Créneau déjà réservé exactement
            if (active.some(b => b.time === slot)) {
                available = false;
                reason = 'booked';
            }
            // 2. Blocage 5h : un RDV à H bloque [H, H+5h]
            else if (startTimes.some(H => slotMin >= H && slotMin <= H + BOOKING_CONFIG.BLOCK_HOURS * 60)) {
                available = false;
                reason = 'blocked';
            }
            // 3. Journée pleine
            else if (dayFull) {
                available = false;
                reason = 'day_full';
            }

            return { time: slot, available, reason };
        })
    };
}

// Vérifie si une date est sélectionnable (pas passée, pas off, pas pleine)
function isDaySelectable(dateStr, bookings, offDays) {
    if (offDays && offDays.includes(dateStr)) return false;

    const active = (bookings || []).filter(b => b.status === 'pending' || b.status === 'confirmed');
    if (active.length >= BOOKING_CONFIG.MAX_BOOKINGS_PER_DAY) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T00:00:00');
    if (d < today) return false;

    return true;
}

// Vérifie si un créneau (date, time) est valide selon les règles métier.
// Utilisé côté serveur (Edge Function) et côté client.
function isSlotValid(dateStr, time, bookings) {
    const active = (bookings || []).filter(b => b.status === 'pending' || b.status === 'confirmed');

    // Limite de RDV par jour
    if (active.length >= BOOKING_CONFIG.MAX_BOOKINGS_PER_DAY) {
        return { valid: false, reason: 'day_full' };
    }

    const slotMin = timeToMinutes(time);
    const startTimes = active.map(b => timeToMinutes(b.time));

    // Créneau déjà réservé
    if (active.some(b => b.time === time)) {
        return { valid: false, reason: 'slot_taken' };
    }

    // Blocage 5h
    if (startTimes.some(H => slotMin >= H && slotMin <= H + BOOKING_CONFIG.BLOCK_HOURS * 60)) {
        return { valid: false, reason: 'slot_blocked' };
    }

    return { valid: true };
}