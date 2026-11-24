// ============================================================
// CLIENT SUPABASE
// ============================================================
// Le client est initialisé dans assets/js/supabase-client.js
// (chargé avant ce fichier). window.supabaseClient est disponible.


// ============================================================
// ADMINS AUTORISES
// ============================================================

const ADMIN_EMAILS = [
    'murielleangemetiegamkengne@gmail.com',
    'hkouamherve145@gmail.com'
];

let selectedOffDates = [];

// Pagination & filtre des réservations
let currentPage = 0;
const PAGE_SIZE = 20;
let statusFilter = 'all';
let bookingSort = 'date_asc';


// ============================================================
// INITIALISATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    initCalendars(); // Initialiser les calendriers sur toutes les pages

    const isAdminPage = window.location.pathname.includes('/admin/') || document.getElementById('admin-content');

    if (isAdminPage) {
        await checkAdminSession();
    }
});

// ============================================================
// DÉLÉGATION D'ÉVÉNEMENTS (compatible CSP strict)
// Remplace les attributs onclick inline, bloqués par le CSP.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Boutons de la liste des réservations (confirmer / annuler / supprimer / pagination)
    const bookingList = document.getElementById('booking-list');
    if (bookingList && !bookingList.dataset.actionsReady) {
        bookingList.dataset.actionsReady = '1';
        bookingList.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === 'confirm') updateBooking(id, 'confirmed', btn);
            else if (action === 'resend-email') updateBooking(id, 'resend_confirmation', btn);
            else if (action === 'cancel') updateBooking(id, 'canceled');
            else if (action === 'delete') deleteBooking(id);
            else if (action === 'prev') prevPage();
            else if (action === 'next') nextPage();
        });
    }

    const sort = document.getElementById('booking-sort');
    if (sort && !sort.dataset.sortReady) {
        sort.dataset.sortReady = '1';
        sort.addEventListener('change', function() {
            bookingSort = this.value;
            currentPage = 0;
            renderBookings();
        });
    }

    // Filtre par statut (remplace onchange inline)
    const filter = document.getElementById('booking-status-filter');
    if (filter && !filter.dataset.filterReady) {
        filter.dataset.filterReady = '1';
        filter.addEventListener('change', function() {
            setStatusFilter(this.value);
        });
    }

    // Jours off : boutons Supprimer
    const offList = document.getElementById('off-days-list');
    if (offList && !offList.dataset.offReady) {
        offList.dataset.offReady = '1';
        offList.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-action="delete-off"]');
            if (btn) deleteOffDay(btn.dataset.id);
        });
    }
});


// ============================================================
// VERIFIER LA SESSION
// ============================================================

async function checkAdminSession() {
    const {
        data: { session },
        error
    } = await supabaseClient.auth.getSession();

    if (error || !session) {
        if (error) console.error(error);
        showLogin();
        return;
    }

    const email = session.user.email.toLowerCase();

    if (!ADMIN_EMAILS.includes(email)) {
        await supabaseClient.auth.signOut();
        alert('Accès administrateur refusé.');
        showLogin();
        return;
    }

    showAdmin();
}


// ============================================================
// AFFICHER LOGIN
// ============================================================

function showLogin() {
    const adminContent = document.getElementById('admin-content');
    if (adminContent) {
        adminContent.hidden = true;
    }

    let login = document.getElementById('admin-login');

    if (!login) {
        login = document.createElement('div');
        login.id = 'admin-login';
        login.className = 'admin-login';
        login.hidden = true;
        login.innerHTML = `
            <section class="admin-login-panel" aria-labelledby="admin-login-title">
                <h2 id="admin-login-title">Connexion administrateur</h2>
                <p>Connectez-vous pour accéder aux réservations.</p>

                <form id="admin-login-form">
                    <label for="admin-email">Adresse email</label>
                    <input type="email" id="admin-email" autocomplete="email" required>

                    <label for="admin-password">Mot de passe</label>
                    <input type="password" id="admin-password" autocomplete="current-password" required>

                    <button id="admin-login-button" type="submit">Se connecter</button>
                </form>

                <p id="admin-login-error" role="alert" aria-live="polite"></p>
            </section>
        `;

        document.body.prepend(login);

        document.getElementById('admin-login-form').addEventListener('submit', function (event) {
            event.preventDefault();
            adminLogin();
        });
    }

    login.hidden = false;
}


// ============================================================
// CONNEXION
// ============================================================

async function adminLogin() {
    const email = document.getElementById('admin-email').value.trim().toLowerCase();
    const password = document.getElementById('admin-password').value;
    const errorElement = document.getElementById('admin-login-error');

    errorElement.textContent = '';

    if (!email || !password) {
        errorElement.textContent = 'Veuillez entrer votre email et votre mot de passe.';
        return;
    }

    if (!ADMIN_EMAILS.includes(email)) {
        errorElement.textContent = 'Cette adresse email n’est pas autorisée.';
        return;
    }

    const button = document.getElementById('admin-login-button');
    button.disabled = true;
    button.textContent = 'Connexion…';
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient.auth.signInWithPassword({ email, password }));
    } catch (requestError) {
        console.error('Erreur de connexion admin :', requestError);
        errorElement.textContent = 'La connexion est indisponible. Vérifiez votre réseau puis réessayez.';
        button.disabled = false;
        button.textContent = 'Se connecter';
        return;
    }

    if (error) {
        console.error(error);
        errorElement.textContent = 'Email ou mot de passe incorrect.';
        button.disabled = false;
        button.textContent = 'Se connecter';
        return;
    }

    if (!data.user) {
        errorElement.textContent = 'Impossible de récupérer votre compte.';
        button.disabled = false;
        button.textContent = 'Se connecter';
        return;
    }

    showAdmin();
}


// ============================================================
// AFFICHER L'ADMIN ET INITIALISER LES COMPOSANTS
// ============================================================

function showAdmin() {
    const login = document.getElementById('admin-login');
    if (login) {
        login.hidden = true;
    }

    const adminContent = document.getElementById('admin-content');
    if (adminContent) {
        adminContent.hidden = false;
    }

    renderBookings();
    initCalendars();
    loadOffDays();
}


// ============================================================
// INITIALISATION DES CALENDRIERS (FLATPICKR)
// ============================================================

function initCalendars() {
    // 1. Calendrier principal "Mois en cours" (style shadcn)
    if (document.getElementById('calendar-grid')) {
        initCalendar('calendar-grid', false);
    }

    // 2. Sélecteur d'intervalle "Jours off"
    const localeFr = (flatpickr.l10ns && flatpickr.l10ns.fr) ? flatpickr.l10ns.fr : 'default';
    if (document.getElementById('off-range-picker')) {
        flatpickr('#off-range-picker', {
            inline: true,
            mode: 'range',
            locale: localeFr,
            dateFormat: 'Y-m-d',
            onChange: function(selectedDates, dateStr) {
                const summary = document.getElementById('off-range-summary');
                if (summary) {
                    summary.textContent = dateStr ? `Sélectionné : ${dateStr}` : 'Sélectionnez une plage de jours off.';
                }
                selectedOffDates = selectedDates;
            }
        });
    }

    // Bouton d'enregistrement d'intervalle de jours off
    const applyBtn = document.getElementById('apply-off-range');
    if (applyBtn) {
        applyBtn.addEventListener('click', saveOffRange);
    }
}


// Le calendrier principal est géré par booking-calendar.js (style shadcn).


// ============================================================
// RAFRAICHIR LE CALENDRIER PRINCIPAL (après confirm/suppr.)
// ============================================================

function refreshCalendarGrid() {
    const el = document.getElementById('calendar-grid');
    if (!el) return;
    initCalendar('calendar-grid', false);
}


// ============================================================
// ENREGISTRER UN INTERVALLE DE JOURS OFF (persisté dans Supabase)
// ============================================================

function formatDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function saveOffRange() {
    if (selectedOffDates.length === 0) {
        alert('Veuillez sélectionner au moins une date.');
        return;
    }

    // Conversion locale (évite le décalage de fuseau de toISOString)
    const rows = selectedOffDates.map(date => ({
        off_date: formatDateLocal(date)
    }));

    const { error } = await supabaseClient
        .from('off_days')
        .upsert(rows, { onConflict: 'off_date' });

    if (error) {
        console.error('Erreur Supabase off_days:', error);
        alert("⚠️ Impossible d'enregistrer les jours off : " + error.message);
        return;
    }

    // Réinitialiser la sélection et recharger la liste
    selectedOffDates = [];
    const summary = document.getElementById('off-range-summary');
    if (summary) summary.textContent = 'Sélectionnez une plage de jours off.';

    await loadOffDays();
}


// ============================================================
// CHARGER LES JOURS OFF DEPUIS SUPABASE
// ============================================================

async function loadOffDays() {
    const list = document.getElementById('off-days-list');
    if (!list) return;

    const { data: offDays, error } = await supabaseClient
        .from('off_days')
        .select('id, off_date')
        .order('off_date', { ascending: true });

    if (error) {
        console.error('Erreur Supabase off_days:', error);
        list.innerHTML = '<li class="list-group-item text-muted">Impossible de charger les jours off.</li>';
        return;
    }

    if (!offDays || offDays.length === 0) {
        list.innerHTML = '<li class="list-group-item text-muted">Aucun jour off enregistré.</li>';
        return;
    }

    list.innerHTML = offDays.map(day => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <span>${escapeHtml(day.off_date)}</span>
            <button class="btn btn-sm btn-outline-danger" data-action="delete-off" data-id="${day.id}">Supprimer</button>
        </li>
    `).join('');
}


// ============================================================
// SUPPRIMER UN JOUR OFF
// ============================================================

async function deleteOffDay(id) {
    if (!confirm('Supprimer ce jour off ?')) return;

    const { error } = await supabaseClient
        .from('off_days')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Erreur Supabase off_days:', error);
        alert('Impossible de supprimer le jour off : ' + error.message);
        return;
    }

    await loadOffDays();
}


// ============================================================
// AFFICHER LES RESERVATIONS
// ============================================================

async function renderBookings() {
    const list = document.getElementById('booking-list');
    if (!list) return;

    list.innerHTML = '<p>Chargement des réservations...</p>';

    let query = supabaseClient.from('bookings').select('*', { count: 'exact' });
    if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
    }

    const sortOptions = {
        date_asc: [['date', true], ['time', true]],
        date_desc: [['date', false], ['time', false]],
        created_desc: [['created_at', false]],
        name_asc: [['client_name', true]]
    };
    for (const [column, ascending] of sortOptions[bookingSort] || sortOptions.date_asc) {
        query = query.order(column, { ascending });
    }
    const { data: bookings, error, count } = await query
        .range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) {
        console.error('Erreur Supabase:', error);
        list.innerHTML = `
            <div>
                <p>Impossible de charger les réservations.</p>
                <small>${error.message}</small>
            </div>
        `;
        return;
    }

    if (!bookings || bookings.length === 0) {
        list.innerHTML = '<p>Aucune réservation.</p>';
        return;
    }

    const total = count || 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    list.innerHTML = bookings
        .map(booking => `
            <div class="booking-card mb-3 p-3 border rounded shadow-sm bg-white">
                <h4>${escapeHtml(booking.client_name || '')}</h4>
                <p class="mb-1"><strong>Date :</strong> ${escapeHtml(booking.date || '')}</p>
                <p class="mb-1"><strong>Heure :</strong> ${escapeHtml(booking.time || '')}</p>
                <p class="mb-1"><strong>Téléphone :</strong> ${escapeHtml(booking.phone || '')}</p>
                <p class="mb-1"><strong>Email :</strong> ${escapeHtml(booking.email || '')}</p>
                <p class="mb-1"><strong>Service :</strong> ${escapeHtml(booking.service || '')}</p>
                ${booking.comment ? `<p class="mb-1"><strong>Précisions / inspiration :</strong> ${escapeHtml(booking.comment)}</p>` : ''}
                <p class="mb-1"><strong>Lieu :</strong> ${escapeHtml(booking.location || '')}</p>
                <p class="mb-2"><strong>Statut :</strong> ${escapeHtml(booking.status || 'pending')}</p>

                <div class="btn-group">
                    ${booking.status === 'pending' ? `<button class="btn btn-sm btn-success" data-action="confirm" data-id="${booking.id}">Confirmer</button>` : ''}
                    ${booking.status === 'confirmed' ? `<button class="btn btn-sm btn-outline-primary" data-action="resend-email" data-id="${booking.id}">Renvoyer les courriels</button>` : ''}
                    ${booking.status === 'pending' || booking.status === 'confirmed' ? `<button class="btn btn-sm btn-warning" data-action="cancel" data-id="${booking.id}">Annuler</button>` : ''}
                    <button class="btn btn-sm btn-danger" data-action="delete" data-id="${booking.id}">Supprimer</button>
                </div>
            </div>
        `)
        .join('') + `
        <div class="d-flex justify-content-between align-items-center mt-3">
            <small class="text-muted">${total} réservation(s) — page ${currentPage + 1}/${totalPages}</small>
            <div class="btn-group">
                <button class="btn btn-sm btn-outline-secondary" data-action="prev" ${currentPage === 0 ? 'disabled' : ''}>← Précédent</button>
                <button class="btn btn-sm btn-outline-secondary" data-action="next" ${currentPage + 1 >= totalPages ? 'disabled' : ''}>Suivant →</button>
            </div>
        </div>`;
}

// Filtre par statut
function setStatusFilter(value) {
    statusFilter = value;
    currentPage = 0;
    renderBookings();
}

// Pagination
function prevPage() {
    if (currentPage > 0) {
        currentPage--;
        renderBookings();
    }
}

function nextPage() {
    currentPage++;
    renderBookings();
}


// ============================================================
// CONFIRMER / ANNULER / SUPPRIMER
// ============================================================

// Vérifie la session et, si absente, affiche le login au lieu de recharger.
// getUser() tente aussi de rafraîchir le token si la session est expirée.
async function ensureAdminSession() {
    const { data: { user }, error } = await supabaseClient.auth.getUser();

    if (error || !user) {
        console.error('Session absente/expirée:', error);
        showLogin();
        return false;
    }

    const email = user.email ? user.email.toLowerCase() : '';
    if (!ADMIN_EMAILS.includes(email)) {
        await supabaseClient.auth.signOut();
        alert('Accès administrateur refusé.');
        showLogin();
        return false;
    }

    return true;
}

async function updateBooking(id, status, button) {
    const ok = await ensureAdminSession();
    if (!ok) return;

    const message = document.getElementById('booking-action-message');
    if (message) {
        message.className = 'small mb-3 text-muted';
        message.textContent = status === 'resend_confirmation' ? 'Envoi des courriels…' : 'Enregistrement de la confirmation…';
    }
    if (button) {
        button.disabled = true;
        button.textContent = 'En cours…';
    }

    // Passage par la Edge Function admin-actions : met à jour le statut
    // ET émet l'événement outbox (booking.confirmed / booking.canceled).
    const action = status === 'confirmed' ? 'confirm' : status === 'canceled' ? 'cancel' : status;
    const { data: res, error } = await supabaseClient.functions.invoke('admin-actions', {
        body: { action, id }
    });

    if (error) {
        console.error('Erreur admin-actions:', error);
        if (message) {
            message.className = 'small mb-3 text-danger';
            message.textContent = status === 'resend_confirmation' ? 'Le renvoi des courriels a échoué. Réessayez.' : 'La confirmation n’a pas été enregistrée. Réessayez.';
        }
        if (button) {
            button.disabled = false;
            button.textContent = status === 'resend_confirmation' ? 'Renvoyer les courriels' : 'Confirmer';
        }
        return;
    }

    if (message && (status === 'confirmed' || status === 'resend_confirmation')) {
        const email = res && res.email;
        message.className = 'small mb-3 ' + (email && (email.client === 'failed' || email.admin === 'failed') ? 'text-warning' : 'text-success');
        if (res && res.already_processed) {
            message.textContent = 'Cette réservation avait déjà été traitée.';
        } else if (email && email.client === 'sent' && email.admin === 'sent') {
            message.textContent = 'Réservation confirmée. Les courriels ont été envoyés à la cliente et à Ange Muu.';
        } else if (email && email.client === 'sent' && email.admin === 'failed') {
            message.textContent = 'Réservation confirmée et courriel cliente envoyé, mais le courriel Ange Muu a échoué.';
        } else if (email && email.client === 'failed' && email.admin === 'sent') {
            message.textContent = 'Réservation confirmée et courriel Ange Muu envoyé. Vérifiez l’adresse ou la configuration du courriel cliente.';
        } else if (email && email.client === 'skipped') {
            message.textContent = email.admin === 'sent'
                ? 'Réservation confirmée et courriel Ange Muu envoyé. Aucun courriel cliente : son adresse est absente.'
                : 'Réservation confirmée, mais le courriel Ange Muu a échoué. Aucun courriel cliente : son adresse est absente.';
        } else {
            message.textContent = 'Réservation confirmée, mais l’envoi des courriels n’a pas abouti. Vérifiez la configuration Resend.';
        }
    }

    await renderBookings();
    refreshCalendarGrid();
}

async function deleteBooking(id) {
    if (!confirm('Voulez-vous vraiment supprimer cette réservation ?')) return;

    const ok = await ensureAdminSession();
    if (!ok) return;

    const { error } = await supabaseClient
        .from('bookings')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Erreur delete bookings:', error);
        alert('Impossible de supprimer la réservation : ' + error.message +
            (error.details ? '\nDétails : ' + error.details : ''));
        return;
    }

    await renderBookings();
    refreshCalendarGrid();
}


// ============================================================
// SECURITE AFFICHAGE
// ============================================================

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
