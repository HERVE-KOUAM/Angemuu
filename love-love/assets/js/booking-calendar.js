// ============================================================
// CALENDRIER CUSTOM VANILLA (style façon shadcn/ui)
// Utilisé sur le formulaire public et dans l'espace Admin.
// ============================================================

const CalendarState = {
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(), // 0-11
    selectedDate: null,               // 'YYYY-MM-DD'
    offDays: [],                      // dates off
    dayBookings: {},                  // { 'YYYY-MM-DD': [bookings] }
    loadError: false,
    loadVersion: 0
};

const CAL_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const CAL_DAYS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

// Charge les données (off_days + bookings) depuis Supabase
async function loadCalendarData(year = CalendarState.viewYear, month = CalendarState.viewMonth) {
    const loadVersion = ++CalendarState.loadVersion;
    const rangeStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const rangeEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    try {
        const [offRes, bookRes] = await Promise.all([
            window.supabaseClient.from('off_days').select('off_date'),
            window.supabaseClient.rpc('get_public_booking_availability', {
                p_start_date: rangeStart,
                p_end_date: rangeEnd
            })
        ]);

        if (loadVersion !== CalendarState.loadVersion) return false;
        if (offRes.error || bookRes.error) {
            console.error('Erreur chargement disponibilités:', offRes.error || bookRes.error);
            CalendarState.loadError = true;
            return false;
        }

        CalendarState.offDays = (offRes.data || []).map(d => d.off_date);

        CalendarState.dayBookings = {};
        (bookRes.data || []).forEach(b => {
            const date = b.booking_date;
            if (!CalendarState.dayBookings[date]) CalendarState.dayBookings[date] = [];
            CalendarState.dayBookings[date].push({ time: String(b.booking_time).slice(0, 5), status: 'confirmed' });
        });
        CalendarState.loadError = false;
        return true;
    } catch (e) {
        console.error('Erreur chargement données calendrier:', e);
        if (loadVersion === CalendarState.loadVersion) CalendarState.loadError = true;
        return false;
    }
}

// Rendu du calendrier dans un conteneur.
// selectable : si true, les jours cliquables déclenchent selectCalendarDate.
function renderCalendar(containerId, selectable) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (CalendarState.loadError) {
        container.innerHTML = '<div class="sc-calendar-error" role="alert"><p>Impossible de charger les disponibilités pour le moment.</p><button type="button" class="sc-calendar-retry" data-calendar-retry>Réessayer</button></div>';
        return;
    }

    const year = CalendarState.viewYear;
    const month = CalendarState.viewMonth;
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = `
        <div class="sc-calendar">
            <div class="sc-cal-header">
                <button type="button" class="sc-cal-nav" data-nav="-1">‹</button>
                <div class="sc-cal-title">${CAL_MONTHS[month]} ${year}</div>
                <button type="button" class="sc-cal-nav" data-nav="1">›</button>
            </div>
            <div class="sc-cal-grid">
                ${CAL_DAYS.map(d => `<div class="sc-cal-dow">${d}</div>`).join('')}
    `;

    for (let i = 0; i < startWeekday; i++) {
        html += `<div class="sc-cal-cell empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const d = new Date(year, month, day);
        const isPast = d < today;
        const isOff = CalendarState.offDays.includes(dateStr);
        const bookings = CalendarState.dayBookings[dateStr] || [];
        const hasActive = bookings.some(b => b.status === 'pending' || b.status === 'confirmed');
        const selectableDay = selectable && isDaySelectable(dateStr, bookings, CalendarState.offDays);
        const isSelected = CalendarState.selectedDate === dateStr;

        let cls = 'sc-cal-cell';
        if (isPast) cls += ' past';
        else if (isOff) cls += ' off';
        else if (selectable && !selectableDay) cls += ' full';
        if (hasActive) cls += ' booked';
        if (isSelected) cls += ' selected';

        const dateAttr = selectableDay ? `data-select-date="${dateStr}"` : '';
        html += `<div class="${cls}" ${dateAttr}>${day}</div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;
}

// Navigation mois précédent / suivant
async function calendarNav(dir, containerId, selectable) {
    CalendarState.viewMonth += dir;
    if (CalendarState.viewMonth < 0) {
        CalendarState.viewMonth = 11;
        CalendarState.viewYear--;
    } else if (CalendarState.viewMonth > 11) {
        CalendarState.viewMonth = 0;
        CalendarState.viewYear++;
    }
    const container = document.getElementById(containerId);
    if (container) container.setAttribute('aria-busy', 'true');
    await loadCalendarData(CalendarState.viewYear, CalendarState.viewMonth);
    if (container) container.removeAttribute('aria-busy');
    renderCalendar(containerId, selectable);
}

// Sélection d'une date (formulaire public)
function selectCalendarDate(dateStr, containerId) {
    CalendarState.selectedDate = dateStr;

    const input = document.getElementById('booking-date-input');
    if (input) input.value = dateStr;
    const timeInput = document.getElementById('booking-time-input');
    if (timeInput) timeInput.value = '';

    // Afficher les créneaux de la date
    if (typeof renderSlotsForDate === 'function') {
        renderSlotsForDate(dateStr);
    }

    renderCalendar(containerId, true);
}

// Initialisation : charge les données puis rend le calendrier
// Délégation d'événements (addEventListener) : compatible CSP strict
// (les attributs onclick inline sont bloqués par le CSP).
async function initCalendar(containerId, selectable) {
    const container = document.getElementById(containerId);
    if (!container) return;

    await loadCalendarData(CalendarState.viewYear, CalendarState.viewMonth);

    if (!container.dataset.calendarReady) {
        container.dataset.calendarReady = '1';
        container.addEventListener('click', function(e) {
            const retryBtn = e.target.closest('[data-calendar-retry]');
            if (retryBtn) {
                initCalendar(containerId, selectable);
                return;
            }
            const navBtn = e.target.closest('[data-nav]');
            if (navBtn) {
                calendarNav(parseInt(navBtn.dataset.nav, 10), containerId, selectable);
                return;
            }
            const dayCell = e.target.closest('[data-select-date]');
            if (dayCell) {
                selectCalendarDate(dayCell.dataset.selectDate, containerId);
            }
        });
    }

    renderCalendar(containerId, selectable);
}
