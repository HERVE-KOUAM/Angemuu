document.addEventListener('DOMContentLoaded', function() {
    const bookingForm = document.getElementById('booking-form');
    
    if (bookingForm) {
        bookingForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Récupération des valeurs
            const formData = new FormData(bookingForm);
            const data = Object.fromEntries(formData.entries());
            
            // Construction du message WhatsApp
            const message = `*NOUVELLE RÉSERVATION — Ange Muu*
─────────────────────────────
*Nom :* ${data.clientName}
*Téléphone :* ${data.phonePrefix} ${data.phoneNumber}
*Date :* ${data.date}
*Heure :* ${data.time}
*Email :* ${data.email}
*Service :* ${data.service}
*Lieu :* ${data.location}
*Commentaire :* ${data.comment || 'Aucun'}
─────────────────────────────`;
            
            const numeroWhatsApp = '237656142787';
            const url = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(message)}`;
            
            // Redirection
            window.open(url, '_blank');
            bookingForm.reset();
            alert('Votre réservation est envoyée !');
        });
    }
});