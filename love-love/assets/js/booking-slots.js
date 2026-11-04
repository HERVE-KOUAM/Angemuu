// ============================================================
// SÉLECTEUR DE CRÉNEAUX HORAIRES (formulaire public)
// ============================================================

// Rendu des créneaux disponibles pour une date donnée
async function renderSlotsForDate(dateStr) {
    const container = document.getElementById('booking-slots');
    if (!container) return;

    if (!dateStr) {
        container.innerHTML = '<p class="sc-slots-hint">Sélectionnez une date pour voir les créneaux disponibles.</p>';
        return;
    }

    // Charger les réservations actives de cette date
    let bookings = [];
    try {
        const { data, error } = await window.supabaseClient
            .from('bookings')
            .select('time, status')
            .eq('date', dateStr);
        if (!error && data) bookings = data;
    } catch (e) {
        console.error('Erreur chargement créneaux:', e);
    }

    const { slots, dayFull } = computeDaySlots(bookings);

    if (dayFull) {
        container.innerHTML = '<p class="sc-slots-hint">Cette journée est complète.</p>';
        return;
    }

    container.innerHTML = `
        <div class="sc-slots-title">Choisissez une heure</div>
        <div class="sc-slots-grid">
            ${slots.map(s => `
                <button type="button" class="sc-slot ${s.available ? '' : 'disabled'}"
                    ${s.available ? `onclick="selectSlot('${s.time}')"` : 'disabled'}>
                    ${s.time}
                </button>
            `).join('')}
        </div>
    `;
}

// Sélection d'un créneau
function selectSlot(time) {
    const input = document.getElementById('booking-time-input');
    if (input) input.value = time;

    document.querySelectorAll('.sc-slot').forEach(el => {
        el.classList.toggle('selected', el.textContent.trim() === time);
    });
}