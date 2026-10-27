document.addEventListener('DOMContentLoaded', function() {
    const bookingForm = document.getElementById('booking-form');
    
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

            // --- VÉRIFICATION ANTI DOUBLE RÉSERVATION ---
            // Utilise la RPC is_slot_taken : seul accès public autorisé par les RLS,
            // sans jamais exposer les données des réservations.
            // ponytail: check-then-act = race condition possible si deux soumissions
            // simultanées sur le même créneau. Plafond connu ; correctif définitif :
            // contrainte UNIQUE (date, time) partielle en base.
            if (typeof window.supabaseClient !== 'undefined') {
                const { data: slotTaken, error: checkError } = await window.supabaseClient
                    .rpc('is_slot_taken', { p_date: date, p_time: time });

                if (checkError) {
                    console.error('Erreur vérification Supabase :', checkError);
                } else if (slotTaken) {
                    alert('❌ Ce créneau (date et heure) est déjà réservé. Veuillez choisir un autre créneau.');
                    return;
                }
            }

            // --- TENTATIVE D'INSERTION SUPABASE ---
            let dbError = null;
            if (typeof window.supabaseClient !== 'undefined') {
                const { error } = await window.supabaseClient.from('bookings')
                    .insert([{
                        client_name: clientName,
                        phone: phone,
                        email: email,
                        date: date,
                        time: time,
                        service: service,
                        location: location,
                        status: 'pending'
                    }]);
                
                if (error) {
                    console.error('Erreur Supabase :', error);
                    dbError = error.message;
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
