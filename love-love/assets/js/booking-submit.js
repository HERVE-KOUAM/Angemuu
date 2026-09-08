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

            // Insertion dans Supabase
            if (typeof window.supabaseClient !== 'undefined') {
                const { error } = await supabaseClient
                    window.supabaseClient.from('bookings')
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
                    alert('Erreur lors de l\\'enregistrement : ' + error.message);
                    return;
                }
            } else {
                console.error('supabaseClient non défini !');
                alert('Erreur technique.');
                return;
            }

            // Construction du message WhatsApp
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
            
            // Redirection
            window.open(url, '_blank');
            bookingForm.reset();
            alert('Votre réservation a bien été enregistrée et transmise !');
        });
    }
});
