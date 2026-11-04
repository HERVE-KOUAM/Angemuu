document.addEventListener('DOMContentLoaded', function() {
    const bookingForm = document.getElementById('booking-form');

    // Initialisation du sélecteur de date public (jours off désactivés)
    initPublicDatePicker();
    
    if (bookingForm) {
        bookingForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Récupération des valeurs
            const formData = new FormData(bookingForm);
            const data = Object.fromEntries(formData.entries());
            
            const clientName = data.clientName ? data.clientName.trim() : '';
            const phone = (data.phonePrefix + ' ' + data.phoneNumber).trim();
            const date = data.date || '';
            const time = data.time || '';
            const email = data.email ? data.email.trim() : null;
            const service = data.service ? data.service.trim() : '';
            const location = data.location || 'Chez Ange Muu';
            const comment = data.comment ? data.comment.trim() : '';

            // Validation de base
            if (!clientName || !data.phoneNumber || !date || !time || !service) {
                alert('Veuillez remplir tous les champs obligatoires.');
                return;
            }

            // --- TENTATIVE D'INSERTION VIA EDGE FUNCTION (validation serveur) ---
            // La fonction save-booking valide les données (zod), insère la réservation
            // de façon atomique (contrainte UNIQUE partielle) et notifie l'admin (ntfy).
            let dbError = null;
            if (typeof window.supabaseClient !== 'undefined') {
                const { data, error } = await window.supabaseClient.functions.invoke('save-booking', {
                    body: {
                        client_name: clientName,
                        phone: phone,
                        email: email,
                        date: date,
                        time: time,
                        service: service,
                        location: location,
                        comment: comment
                    }
                });

                // Créneau déjà pris (contrainte UNIQUE) -> erreur 409 / slot_taken
                if (data && data.error === 'slot_taken') {
                    alert('❌ Ce créneau (date et heure) est déjà réservé. Veuillez choisir un autre créneau.');
                    return;
                }

                if (error) {
                    console.error('Erreur Edge Function :', error);
                    dbError = (data && data.message) || error.message || 'Erreur lors de l\'enregistrement';
                } else if (data && data.error) {
                    console.error('Erreur Edge Function :', data);
                    dbError = data.message || data.error;
                }
            } else {
                dbError = 'supabaseClient non défini';
            }

            // --- CONSTRUCTION DU MESSAGE WHATSAPP ---
            const message = '*NOUVELLE RÉSERVATION — Ange Muu*\n' +
                            '─────────────────────────────\n' +
                            '*Nom :* ' + clientName + '\n' +
                            '*Téléphone :* ' + phone + '\n' +
                            '*Date :* ' + date + '\n' +
                            '*Heure :* ' + time + '\n' +
                            '*Email :* ' + (email || 'Non renseigné') + '\n' +
                            '*Service :* ' + service + '\n' +
                            '*Lieu :* ' + location + '\n' +
                            '*Commentaire :* ' + (comment || 'Aucun') + '\n' +
                            '─────────────────────────────';
            
            const numeroWhatsApp = '237656142787';
            const url = 'https://wa.me/' + numeroWhatsApp + '?text=' + encodeURIComponent(message);
            
            // --- REDIRECTION ET FEEDBACK ---
            if (dbError) {
                alert('⚠️ Votre réservation a été transmise par WhatsApp, mais une erreur technique a empêché l\'enregistrement dans notre base de données (Erreur: ' + dbError + ').');
            } else {
                alert('✅ Votre réservation a bien été enregistrée et transmise !');
                bookingForm.reset();
            }

            // Redirection toujours exécutée
            window.open(url, '_blank');
        });
    }
});


// ============================================================
// DATE PICKER PUBLIC : jours off désactivés depuis Supabase
// ============================================================
async function initPublicDatePicker() {
    const picker = document.getElementById('booking-date-picker');
    if (!picker || typeof flatpickr === 'undefined') return;

    let disabledDates = [];
    try {
        const { data: offDays, error } = await window.supabaseClient
            .from('off_days')
            .select('off_date');
        if (error) {
            console.error('Erreur chargement off_days:', error);
        } else if (offDays) {
            disabledDates = offDays.map(d => d.off_date);
        }
    } catch (e) {
        console.error('Erreur chargement off_days:', e);
    }

    const localeFr = (flatpickr.l10ns && flatpickr.l10ns.fr) ? flatpickr.l10ns.fr : 'default';
    flatpickr('#booking-date-picker', {
        inline: true,
        locale: localeFr,
        dateFormat: 'Y-m-d',
        minDate: 'today',
        disable: disabledDates,
        onChange: function(selectedDates, dateStr) {
            const input = document.getElementById('booking-date-input');
            if (input) input.value = dateStr;
        }
    });
}
