// ============================================================
// CALENDRIER CUSTOM VANILLA (style façon shadcn/ui)
// Utilisé sur le formulaire public et dans l'espace Admin.
// ============================================================

const CalendarState = {
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(), // 0-11
    selectedDate: null,               // 'YYYY-MM-DD'
    offDays: [],                      // dates off
    dayBookings: {}                   // { 'YYYY-MM-DD': [bookings] }
};

const CAL_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const CAL_DAYS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

// Charge les données (off_days + bookings) depuis Supabase
async function loadCalendarData() {
    try {
        const [offRes, bookRes] = await Promise.all([
            window.supabaseClient.from('off_days').select('off_date'),
            window.supabaseClient.from('bookings').select('date, time, status')
        ]);

        CalendarState.offDays = (offRes.data || []).map(d => d.off_date);

        CalendarState.dayBookings = {};
        (bookRes.data || []).forEach(b => {
            if (!CalendarState.dayBookings[b.date]) CalendarState.dayBookings[b.date] = [];
            CalendarState.dayBookings[b.date].push(b);
        });
    } catch (e) {
        console.error('Erreur chargement données calendrier:', e);
    }
}

// Rendu du calendrier dans un conteneur.
// selectable : si true, les jours cliquables déclenchent selectCalendarDate.
function renderCalendar(containerId, selectable) {
    const container = document.getElementById(containerId);
    if (!container) return;

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
                <button type="button" class="sc-cal-nav" onclick="calendarNav(-1,'${containerId}',${selectable})">‹</button>
                <div class="sc-cal-title">${CAL_MONTHS[month]} ${year}</div>
                <button type="button" class="sc-cal-nav" onclick="calendarNav(1,'${containerId}',${selectable})">›</button>
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

        const click = selectableDay ? `onclick="selectCalendarDate('${dateStr}','${containerId}')"` : '';
        html += `<div class="${cls}" ${click}>${day}</div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;
}

// Navigation mois précédent / suivant
function calendarNav(dir, containerId, selectable) {
    CalendarState.viewMonth += dir;
    if (CalendarState.viewMonth < 0) {
        CalendarState.viewMonth = 11;
        CalendarState.viewYear--;
    } else if (CalendarState.viewMonth > 11) {
        CalendarState.viewMonth = 0;
        CalendarState.viewYear++;
    }
    renderCalendar(containerId, selectable);
}

// Sélection d'une date (formulaire public)
function selectCalendarDate(dateStr, containerId) {
    CalendarState.selectedDate = dateStr;

    const input = document.getElementById('booking-date-input');
    if (input) input.value = dateStr;

    // Afficher les créneaux de la date
    if (typeof renderSlotsForDate === 'function') {
        renderSlotsForDate(dateStr);
    }

    renderCalendar(containerId, true);
}

// Initialisation : charge les données puis rend le calendrier
async function initCalendar(containerId, selectable) {
    await loadCalendarData();
    renderCalendar(containerId, selectable);
}