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

    const requestId = String(Number(container.dataset.requestId || 0) + 1);
    container.dataset.requestId = requestId;
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = '<p class="sc-slots-hint">Chargement des disponibilités…</p>';

    try {
        const { data, error } = await window.supabaseClient.rpc('get_public_booking_availability', {
            p_start_date: dateStr,
            p_end_date: dateStr
        });
        if (container.dataset.requestId !== requestId) return;
        if (error) throw error;

        const bookings = (data || []).map(row => ({
            time: String(row.booking_time).slice(0, 5),
            status: 'confirmed'
        }));
        const { slots, dayFull } = computeDaySlots(bookings);

        if (dayFull) {
            container.innerHTML = '<p class="sc-slots-hint">Cette journée est complète. Choisissez une autre date.</p>';
            return;
        }

        // Délégation d'événements : compatible CSP strict (pas d'onclick inline)
        if (!container.dataset.slotsReady) {
            container.dataset.slotsReady = '1';
            container.addEventListener('click', function(e) {
                const btn = e.target.closest('[data-slot]');
                if (btn) selectSlot(btn.dataset.slot);
            });
        }

        container.innerHTML = `
            <div class="sc-slots-title">Choisissez une heure</div>
            <div class="sc-slots-grid">
                ${slots.map(s => `
                    <button type="button" class="sc-slot ${s.available ? '' : 'disabled'}"
                        ${s.available ? `data-slot="${s.time}"` : 'disabled'}>
                        ${s.time}
                    </button>
                `).join('')}
            </div>
        `;
    } catch (e) {
        console.error('Erreur chargement créneaux:', e);
        if (container.dataset.requestId === requestId) {
            container.innerHTML = '<div class="sc-slots-error" role="alert"><p>Impossible de vérifier les horaires. Aucun créneau ne peut être réservé pour le moment.</p><button type="button" data-retry-slots>Réessayer</button></div>';
        }
    } finally {
        if (container.dataset.requestId === requestId) container.removeAttribute('aria-busy');
    }
}

// Sélection d'un créneau
function selectSlot(time) {
    const input = document.getElementById('booking-time-input');
    if (input) input.value = time;

    document.querySelectorAll('.sc-slot').forEach(el => {
        el.classList.toggle('selected', el.textContent.trim() === time);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('booking-slots');
    if (!container) return;
    container.addEventListener('click', function(e) {
        if (e.target.closest('[data-retry-slots]')) {
            renderSlotsForDate(document.getElementById('booking-date-input')?.value || '');
        }
    });
});
