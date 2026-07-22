const storageKey = 'ange-muu-bookings';
const offDaysKey = 'ange-muu-off-days';
const notifyKey = 'ange-muu-notify';
let bookingPickerInstance = null;
let offRangePickerInstance = null;

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDisplayDate(value) {
  const date = typeof value === 'string' ? parseDateKey(value) : value;
  if (!date) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

function getMonthDates(year, month) {
  const firstDay = new Date(year, month, 1);
  const startDay = new Date(firstDay);
  startDay.setDate(startDay.getDate() - ((firstDay.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    days.push(d);
  }
  return days;
}

function getOffDays() {
  return readStorage(offDaysKey, []).sort();
}

function getDisabledDates() {
  return getOffDays().map((day) => parseDateKey(day));
}

function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const days = getMonthDates(year, month);
  const bookings = readStorage(storageKey, []);
  const offDays = getOffDays();
  const calendar = document.getElementById('calendar-grid');
  if (!calendar) return;

  calendar.innerHTML = '';
  const weekLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  weekLabels.forEach((label) => {
    const labelCell = document.createElement('div');
    labelCell.className = 'fw-bold text-center text-muted';
    labelCell.textContent = label;
    calendar.appendChild(labelCell);
  });

  days.forEach((day) => {
    const cell = document.createElement('div');
    const key = formatDateKey(day);
    const isCurrentMonth = day.getMonth() === month;
    const isOff = offDays.includes(key);
    const isBooked = bookings.some((booking) => booking.date === key);
    const isToday = key === formatDateKey(now);
    cell.className = `calendar-cell ${isCurrentMonth ? '' : 'muted'} ${isToday ? 'today' : ''} ${isOff ? 'off-day' : ''} ${isBooked ? 'booked-day' : ''}`;
    cell.innerHTML = `<div class="fw-bold">${day.getDate()}</div>${isOff ? '<span class="calendar-pill off">Jour off</span>' : ''}${isBooked ? '<span class="calendar-pill">RDV</span>' : ''}`;
    calendar.appendChild(cell);
  });
}

function renderBookings() {
  const bookings = readStorage(storageKey, []);
  const list = document.getElementById('booking-list');
  if (!list) return;

  if (!bookings.length) {
    list.innerHTML = '<div class="booking-card">Aucune réservation pour le moment.</div>';
    return;
  }

  list.innerHTML = bookings
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((booking) => `
      <div class="booking-card">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <h5>${booking.clientName}</h5>
            <p class="mb-1"><strong>${booking.date}</strong> à ${booking.time}</p>
            <p class="mb-1">${booking.service} • ${booking.location}</p>
            <p class="mb-0 text-muted">${booking.phone}${booking.email ? ` • ${booking.email}` : ''}</p>
          </div>
          <span class="status-pill ${booking.status || 'pending'}">${booking.status || 'En attente'}</span>
        </div>
        <div class="d-flex gap-2 flex-wrap mt-3">
          <button class="action-chip" data-action="confirm" data-id="${booking.id}">Confirmer</button>
          <button class="action-chip" data-action="cancel" data-id="${booking.id}">Annuler</button>
          <button class="action-chip" data-action="notify" data-id="${booking.id}">Notifier</button>
        </div>
      </div>
    `).join('');
}

function renderOffDays() {
  const offDays = getOffDays();
  const list = document.getElementById('off-days-list');
  if (!list) return;
  list.innerHTML = offDays.length
    ? offDays.map((day) => `<li class="list-group-item d-flex justify-content-between align-items-center">${day}<button class="btn btn-sm btn-outline-danger" data-remove-day="${day}">Supprimer</button></li>`).join('')
    : '<li class="list-group-item">Aucun jour off enregistré.</li>';
}

function renderNotifications() {
  const notifyState = readStorage(notifyKey, { email: true, whatsapp: true });
  const email = document.getElementById('notify-email');
  const whatsapp = document.getElementById('notify-whatsapp');
  if (email) email.checked = notifyState.email;
  if (whatsapp) whatsapp.checked = notifyState.whatsapp;
}

function refreshPickers() {
  if (bookingPickerInstance) {
    bookingPickerInstance.set('disable', getDisabledDates());
    const input = document.getElementById('booking-date-input');
    if (input && input.value) {
      bookingPickerInstance.setDate(parseDateKey(input.value), true);
    }
  }
  if (offRangePickerInstance) {
    offRangePickerInstance.set('disable', getDisabledDates());
  }
}

function addOffDayRange(selectedDates) {
  if (!selectedDates || !selectedDates.length) {
    alert('Sélectionnez au moins une date.');
    return;
  }

  const start = selectedDates[0];
  const end = selectedDates[selectedDates.length - 1];
  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  const offDays = getOffDays();
  const merged = Array.from(new Set([...offDays, ...dates])).sort();
  writeStorage(offDaysKey, merged);
  renderOffDays();
  renderCalendar();
  refreshPickers();
  const summary = document.getElementById('off-range-summary');
  if (summary) summary.textContent = `Plage enregistrée : ${dates.length} jour(s) marqués comme off.`;
}

function removeOffDay(day) {
  const offDays = getOffDays();
  const updated = offDays.filter((item) => item !== day);
  writeStorage(offDaysKey, updated);
  renderOffDays();
  renderCalendar();
  refreshPickers();
}

function updateBooking(id, status) {
  const bookings = readStorage(storageKey, []);
  const booking = bookings.find((item) => item.id === id);
  const updated = bookings.map((item) => (item.id === id ? { ...item, status } : item));
  writeStorage(storageKey, updated);
  renderBookings();
  renderCalendar();
  if (status === 'confirmed' && booking) {
    sendNotification(booking);
  }
}

function sendNotification(booking) {
  const notifyState = readStorage(notifyKey, { email: true, whatsapp: true });
  const message = `Bonjour ${booking.clientName}, votre rendez-vous pour ${booking.service} est confirmé le ${booking.date} à ${booking.time}. Merci, Ange Muu.`;
  const methods = [];

  if (notifyState.email && booking.email) {
    const subject = encodeURIComponent('Confirmation de votre rendez-vous chez Ange Muu');
    const body = encodeURIComponent(message);
    window.open(`mailto:${booking.email}?subject=${subject}&body=${body}`, '_blank');
    methods.push('email');
  }

  if (notifyState.whatsapp && booking.phone) {
    const phone = booking.phone.replace(/\D/g, '');
    if (phone) {
      const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
      methods.push('WhatsApp');
    }
  }

  if (!methods.length) {
    alert('Aucun canal de notification n’a été configuré pour ce client.');
    return;
  }

  alert(`Notification envoyée à ${booking.clientName} via ${methods.join(' + ')}.`);
}

function notifyBooking(id) {
  const bookings = readStorage(storageKey, []);
  const booking = bookings.find((item) => item.id === id);
  if (!booking) return;
  sendNotification(booking);
}

function saveBooking(formData) {
  const bookings = readStorage(storageKey, []);
  const compulsoryFields = ['clientName', 'phone', 'date', 'time', 'service', 'location'];
  const missing = compulsoryFields.filter((field) => !formData[field]);
  if (missing.length) {
    alert('Veuillez remplir tous les champs requis.');
    return false;
  }

  const offDays = getOffDays();
  if (offDays.includes(formData.date)) {
    alert('Cette date est marquée comme jour off. Veuillez choisir un autre jour.');
    return false;
  }

  const booking = {
    id: `booking-${Date.now()}`,
    clientName: formData.clientName,
    phone: formData.phone,
    email: formData.email || '',
    date: formData.date,
    time: formData.time,
    service: formData.service,
    location: formData.location,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  bookings.push(booking);
  writeStorage(storageKey, bookings);
  return booking;
}

function initializePickers() {
  const bookingInput = document.getElementById('booking-date-input');
  const bookingContainer = document.getElementById('booking-date-picker');
  if (bookingContainer && bookingInput) {
    bookingPickerInstance = flatpickr(bookingContainer, {
      inline: true,
      dateFormat: 'Y-m-d',
      minDate: 'today',
      disable: getDisabledDates(),
      defaultDate: bookingInput.value || null,
      onChange: function (selectedDates) {
        if (selectedDates[0]) {
          bookingInput.value = formatDateKey(selectedDates[0]);
        }
      }
    });
  }

  const offRangeContainer = document.getElementById('off-range-picker');
  if (offRangeContainer) {
    offRangePickerInstance = flatpickr(offRangeContainer, {
      inline: true,
      mode: 'range',
      dateFormat: 'Y-m-d',
      minDate: 'today',
      disable: getDisabledDates(),
      onChange: function (selectedDates) {
        const summary = document.getElementById('off-range-summary');
        if (!summary) return;
        if (!selectedDates.length) {
          summary.textContent = 'Sélectionnez une plage de jours off.';
        } else if (selectedDates.length === 1) {
          summary.textContent = `Début de plage : ${formatDisplayDate(selectedDates[0])}`;
        } else {
          summary.textContent = `Plage sélectionnée : ${formatDisplayDate(selectedDates[0])} → ${formatDisplayDate(selectedDates[selectedDates.length - 1])}`;
        }
      }
    });
  }
}

function initializeAdmin() {
  renderCalendar();
  renderBookings();
  renderOffDays();
  renderNotifications();
  initializePickers();

  const addOffDayButton = document.getElementById('apply-off-range');
  if (addOffDayButton) {
    addOffDayButton.addEventListener('click', () => {
      const selectedDates = offRangePickerInstance ? offRangePickerInstance.selectedDates : [];
      addOffDayRange(selectedDates);
      if (offRangePickerInstance) offRangePickerInstance.clear();
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    const action = target.closest('[data-action]');
    const removeDay = target.closest('[data-remove-day]');
    if (action) {
      const id = action.getAttribute('data-id');
      const type = action.getAttribute('data-action');
      if (type === 'confirm') updateBooking(id, 'confirmed');
      if (type === 'cancel') updateBooking(id, 'canceled');
      if (type === 'notify') notifyBooking(id);
    }
    if (removeDay) {
      removeOffDay(removeDay.getAttribute('data-remove-day'));
    }
  });

  const notifyForm = document.getElementById('notify-settings');
  if (notifyForm) {
    notifyForm.addEventListener('change', () => {
      const settings = {
        email: document.getElementById('notify-email').checked,
        whatsapp: document.getElementById('notify-whatsapp').checked,
      };
      writeStorage(notifyKey, settings);
    });
  }

  const bookingForm = document.getElementById('booking-form');
  if (bookingForm) {
    bookingForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = Object.fromEntries(new FormData(bookingForm).entries());
      const booking = saveBooking(formData);
      if (booking) {
        bookingForm.reset();
        if (bookingPickerInstance) bookingPickerInstance.clear();
        renderBookings();
        renderCalendar();
        refreshPickers();
        alert(`Réservation enregistrée pour ${booking.date} à ${booking.time}.`);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initializeAdmin);
