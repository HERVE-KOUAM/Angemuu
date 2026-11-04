document.addEventListener('DOMContentLoaded', function() {
    const bookingForm = document.getElementById('booking-form');

    // Initialisation du calendrier public (style shadcn) + créneaux
    initCalendar('booking-date-picker', true);
    const slotsShell = document.getElementById('booking-slots');
    if (slotsShell) slotsShell.innerHTML = '<p class="sc-slots-hint">Sélectionnez une date pour voir les créneaux disponibles.</p>';

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

                // Erreurs métier (validation serveur)
                if (data && data.error === 'slot_taken') {
                    alert('❌ Ce créneau (date et heure) est déjà réservé. Veuillez choisir un autre créneau.');
                    return;
                }
                if (data && data.error === 'slot_blocked') {
                    alert('❌ Ce créneau est dans l\'intervalle de 5h d\'un rendez-vous existant. Choisissez un autre créneau.');
                    return;
                }
                if (data && data.error === 'day_full') {
                    alert('❌ Cette journée a déjà atteint sa limite de rendez-vous. Choisissez une autre date.');
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


// Le calendrier public et les créneaux sont gérés par
// booking-calendar.js et booking-slots.js (style shadcn).
