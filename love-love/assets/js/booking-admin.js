// ============================================================
// SUPABASE
// ============================================================

const SUPABASE_URL = 'https://kskjalzggxaycfzfgspc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_yKfW79OSFtVKd5QXDfDsJw_2qciBjoI';

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


// ============================================================
// ADMINS AUTORISES
// ============================================================

const ADMIN_EMAILS = [
    'murielleangemetiegamkengne@gmail.com',
    'hkouamherve145@gmail.com'
];

let selectedOffDates = [];


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
        adminContent.style.setProperty('display', 'none', 'important');
    }

    let login = document.getElementById('admin-login');

    if (!login) {
        login = document.createElement('div');
        login.id = 'admin-login';
        login.innerHTML = `
            <div style="
                max-width:420px;
                margin:80px auto;
                padding:30px;
                background:#fff;
                border-radius:15px;
                box-shadow:0 5px 25px rgba(0,0,0,0.1);
            ">
                <h2>Connexion administrateur</h2>
                <p>Connectez-vous pour accéder aux réservations.</p>

                <input
                    type="email"
                    id="admin-email"
                    placeholder="Adresse email"
                    autocomplete="email"
                    style="width:100%; padding:12px; margin:10px 0; box-sizing:border-box;"
                >

                <input
                    type="password"
                    id="admin-password"
                    placeholder="Mot de passe"
                    autocomplete="current-password"
                    style="width:100%; padding:12px; margin:10px 0; box-sizing:border-box;"
                >

                <button
                    id="admin-login-button"
                    style="width:100%; padding:12px; margin-top:10px; cursor:pointer;"
                >
                    Se connecter
                </button>

                <p id="admin-login-error" style="color:red; margin-top:15px;"></p>
            </div>
        `;

        document.body.prepend(login);

        document
            .getElementById('admin-login-button')
            .addEventListener('click', adminLogin);
    }

    login.style.display = 'block';
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

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        console.error(error);
        errorElement.textContent = 'Email ou mot de passe incorrect.';
        return;
    }

    if (!data.user) {
        errorElement.textContent = 'Impossible de récupérer votre compte.';
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
        login.style.display = 'none';
    }

    const adminContent = document.getElementById('admin-content');
    if (adminContent) {
        adminContent.style.setProperty('display', 'block', 'important');
    }

    renderBookings();
    initCalendars();
}


// ============================================================
// INITIALISATION DES CALENDRIERS (FLATPICKR)
// ============================================================

function initCalendars() {
    // Vérifier si Flatpickr est chargé
    if (typeof flatpickr === 'undefined') {
        console.error('Flatpickr n\'est pas chargé !');
        return;
    }
    const localeFr = (flatpickr.l10ns && flatpickr.l10ns.fr) ? flatpickr.l10ns.fr : 'default';

    // 1. Calendrier principal "Mois en cours"
    if (document.getElementById('calendar-grid')) {
        flatpickr('#calendar-grid', {
            inline: true,
            locale: localeFr,
            dateFormat: 'Y-m-d'
        });
    }

    // 2. Sélecteur d'intervalle "Jours off"
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

    // 3. Sélecteur de date dans le formulaire de création
    if (document.getElementById('booking-date-picker')) {
        flatpickr('#booking-date-picker', {
            inline: true,
            locale: localeFr,
            dateFormat: 'Y-m-d',
            minDate: 'today',
            onChange: function(selectedDates, dateStr) {
                const input = document.getElementById('booking-date-input');
                if (input) input.value = dateStr;
            }
        });
    }

    // Bouton d'enregistrement d'intervalle de jours off
    const applyBtn = document.getElementById('apply-off-range');
    if (applyBtn) {
        applyBtn.addEventListener('click', saveOffRange);
    }
}


// ============================================================
// ENREGISTRER UN INTERVALLE DE JOURS OFF
// ============================================================

function saveOffRange() {
    if (selectedOffDates.length === 0) {
        alert('Veuillez sélectionner au moins une date.');
        return;
    }

    const list = document.getElementById('off-days-list');
    if (!list) return;

    selectedOffDates.forEach(date => {
        const formattedDate = date.toISOString().split('T')[0];
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `
            <span>${formattedDate}</span>
            <button class="btn btn-sm btn-outline-danger" onclick="this.parentElement.remove()">Supprimer</button>
        `;
        list.appendChild(li);
    });

    alert('Jours off enregistrés localement.');
}


// ============================================================
// AFFICHER LES RESERVATIONS
// ============================================================

async function renderBookings() {
    const list = document.getElementById('booking-list');
    if (!list) return;

    list.innerHTML = '<p>Chargement des réservations...</p>';

    const { data: bookings, error } = await supabaseClient
        .from('bookings')
        .select('*')
        .order('date', { ascending: true })
        .order('time', { ascending: true });

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

    list.innerHTML = bookings
        .map(booking => `
            <div class="booking-card mb-3 p-3 border rounded shadow-sm bg-white">
                <h4>${escapeHtml(booking.client_name || '')}</h4>
                <p class="mb-1"><strong>Date :</strong> ${escapeHtml(booking.date || '')}</p>
                <p class="mb-1"><strong>Heure :</strong> ${escapeHtml(booking.time || '')}</p>
                <p class="mb-1"><strong>Téléphone :</strong> ${escapeHtml(booking.phone || '')}</p>
                <p class="mb-1"><strong>Email :</strong> ${escapeHtml(booking.email || '')}</p>
                <p class="mb-1"><strong>Service :</strong> ${escapeHtml(booking.service || '')}</p>
                <p class="mb-1"><strong>Lieu :</strong> ${escapeHtml(booking.location || '')}</p>
                <p class="mb-2"><strong>Statut :</strong> ${escapeHtml(booking.status || 'pending')}</p>

                <div class="btn-group">
                    <button class="btn btn-sm btn-success" onclick="updateBooking('${booking.id}', 'confirmed')">Confirmer</button>
                    <button class="btn btn-sm btn-warning" onclick="updateBooking('${booking.id}', 'canceled')">Annuler</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBooking('${booking.id}')">Supprimer</button>
                </div>
            </div>
        `)
        .join('');
}


// ============================================================
// CONFIRMER / ANNULER / SUPPRIMER
// ============================================================

async function updateBooking(id, status) {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        alert('Votre session a expiré.');
        location.reload();
        return;
    }

    const { error } = await supabaseClient
        .from('bookings')
        .update({ status: status })
        .eq('id', id);

    if (error) {
        console.error(error);
        alert('Impossible de modifier la réservation : ' + error.message);
        return;
    }

    await renderBookings();
}

async function deleteBooking(id) {
    if (!confirm('Voulez-vous vraiment supprimer cette réservation ?')) return;

    const { error } = await supabaseClient
        .from('bookings')
        .delete()
        .eq('id', id);

    if (error) {
        console.error(error);
        alert('Impossible de supprimer la réservation : ' + error.message);
        return;
    }

    await renderBookings();
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