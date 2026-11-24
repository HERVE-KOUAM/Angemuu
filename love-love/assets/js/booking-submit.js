document.addEventListener('DOMContentLoaded', function() {
    const bookingForm = document.getElementById('booking-form');
    const feedback = document.getElementById('booking-feedback');
    const feedbackTitle = document.getElementById('booking-feedback-title');
    const feedbackMessage = document.getElementById('booking-feedback-message');
    const whatsappLink = document.getElementById('booking-whatsapp-link');
    const newRequestButton = document.getElementById('booking-new-request');
    const submitButton = bookingForm?.querySelector('[type="submit"]');
    const steps = Array.from(bookingForm?.querySelectorAll('[data-booking-step]') || []);
    const stepNext = document.getElementById('booking-step-next');
    const stepBack = document.getElementById('booking-step-back');
    const stepError = document.getElementById('booking-step-error');
    const stepCount = document.getElementById('booking-step-count');
    const stepName = document.getElementById('booking-step-name');
    const progressFill = document.getElementById('booking-progress-fill');
    const stepNames = ['Votre coiffure', 'Votre rendez-vous', 'Vos détails'];
    let currentStep = 0;
    let isSubmitting = false;

    initCalendar('booking-date-picker', true);
    const slotsShell = document.getElementById('booking-slots');
    if (slotsShell) slotsShell.innerHTML = '<p class="sc-slots-hint">Sélectionnez une date pour voir les créneaux disponibles.</p>';

    function refreshBookingReview() {
        const service = bookingForm?.elements.service?.value.trim() || 'Votre coiffure';
        const date = bookingForm?.elements.date?.value;
        const time = bookingForm?.elements.time?.value;
        const reviewService = document.getElementById('booking-review-service');
        const reviewSlot = document.getElementById('booking-review-slot');
        if (reviewService) reviewService.textContent = service;
        if (reviewSlot) reviewSlot.textContent = date && time
            ? `${formatDate(date)} · ${time}`
            : 'Choisissez une date et une heure';
    }

    function showStep(index, moveFocus = true) {
        currentStep = Math.max(0, Math.min(index, steps.length - 1));
        steps.forEach((step, stepIndex) => {
            const active = stepIndex === currentStep;
            step.hidden = !active;
            step.classList.toggle('is-active', active);
        });
        document.querySelectorAll('[data-step-indicator]').forEach((indicator, stepIndex) => {
            indicator.classList.toggle('is-current', stepIndex === currentStep);
            indicator.classList.toggle('is-complete', stepIndex < currentStep);
            if (stepIndex === currentStep) indicator.setAttribute('aria-current', 'step');
            else indicator.removeAttribute('aria-current');
        });
        if (stepCount) stepCount.textContent = `Étape ${currentStep + 1} sur ${steps.length}`;
        if (stepName) stepName.textContent = stepNames[currentStep];
        if (progressFill) progressFill.style.width = `${((currentStep + 1) / steps.length) * 100}%`;
        if (stepBack) stepBack.hidden = currentStep === 0;
        if (stepNext) stepNext.hidden = currentStep === steps.length - 1;
        if (submitButton) submitButton.hidden = currentStep !== steps.length - 1;
        if (stepError) {
            stepError.hidden = true;
            stepError.textContent = '';
        }
        if (currentStep === steps.length - 1) refreshBookingReview();
        if (moveFocus) document.getElementById(`booking-step-title-${currentStep}`)?.focus({ preventScroll: true });
    }

    function showStepError(message) {
        if (!stepError) return;
        stepError.textContent = message;
        stepError.hidden = false;
        stepError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    stepNext?.addEventListener('click', function() {
        if (currentStep === 0) {
            const serviceInput = bookingForm.elements.service;
            const inspirationInput = bookingForm.elements.inspirationUrl;
            if (!serviceInput.checkValidity()) return serviceInput.reportValidity();
            if (inspirationInput.value && !inspirationInput.checkValidity()) return inspirationInput.reportValidity();
        }
        if (currentStep === 1) {
            refreshBookingReview();
            if (!bookingForm.elements.date.value || !bookingForm.elements.time.value) {
                showStepError('Choisissez une date et un créneau disponible pour continuer.');
                return;
            }
        }
        if (currentStep < steps.length - 1) showStep(currentStep + 1);
    });

    stepBack?.addEventListener('click', function() {
        if (currentStep > 0) showStep(currentStep - 1);
    });

    bookingForm?.addEventListener('input', refreshBookingReview);
    bookingForm?.addEventListener('change', refreshBookingReview);
    showStep(0, false);

    function formatDate(dateValue) {
        const parsed = new Date(`${dateValue}T00:00:00`);
        return Number.isNaN(parsed.getTime())
            ? dateValue
            : parsed.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function makeWhatsAppUrl(message) {
        return `https://wa.me/237656142787?text=${encodeURIComponent(message)}`;
    }

    function showFeedback(type, title, message, whatsappMessage, canStartOver) {
        if (!feedback) return;
        feedback.classList.toggle('is-error', type === 'error');
        feedback.setAttribute('role', type === 'error' ? 'alert' : 'status');
        feedbackTitle.textContent = title;
        feedbackMessage.textContent = message;
        feedback.hidden = false;

        whatsappLink.href = makeWhatsAppUrl(whatsappMessage);
        whatsappLink.hidden = false;
        whatsappLink.textContent = type === 'success' ? 'Continuer sur WhatsApp' : 'Demander de l’aide sur WhatsApp';
        newRequestButton.hidden = !canStartOver;
        feedback.focus();
    }

    function explainFailure(code) {
        const messages = {
            slot_taken: 'Ce créneau vient d’être réservé. Choisissez une autre heure.',
            slot_blocked: 'Un autre rendez-vous est trop proche de cette heure. Choisissez un autre créneau.',
            day_full: 'Cette journée vient d’atteindre sa limite de rendez-vous. Choisissez une autre date.',
            date_unavailable: 'Cette date n’est plus disponible. Choisissez une autre date.',
            date_in_past: 'La date choisie est passée. Choisissez une date à venir.',
            invalid_time: 'Cette heure n’est pas disponible. Choisissez un créneau proposé dans le calendrier.'
        };
        return messages[code] || 'Nous n’avons pas pu confirmer l’enregistrement de votre demande. Contactez-nous sur WhatsApp pour vérifier avant de la renvoyer.';
    }

    async function readErrorPayload(error, responseData) {
        if (responseData?.error) return responseData;
        const response = error?.context;
        if (response && typeof response.clone === 'function') {
            try {
                return await response.clone().json();
            } catch (_) {
                // L’erreur réseau sera expliquée avec le message générique.
            }
        }
        return {};
    }

    if (newRequestButton) {
        newRequestButton.addEventListener('click', function() {
            bookingForm.reset();
            showStep(0);
            bookingForm.hidden = false;
            feedback.hidden = true;
            feedback.classList.remove('is-error');
            if (feedbackMessage) feedbackMessage.textContent = '';
            if (whatsappLink) whatsappLink.hidden = true;
            if (newRequestButton) newRequestButton.hidden = true;

            CalendarState.selectedDate = null;
            renderCalendar('booking-date-picker', true);
            if (slotsShell) slotsShell.innerHTML = '<p class="sc-slots-hint">Sélectionnez une date pour voir les créneaux disponibles.</p>';
            bookingForm.querySelector('[name="clientName"]')?.focus();
        });
    }

    if (!bookingForm) return;

    bookingForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        if (isSubmitting) return;

        const formData = new FormData(bookingForm);
        const fields = Object.fromEntries(formData.entries());
        const clientName = String(fields.clientName || '').trim();
        const phone = `${fields.phonePrefix || ''} ${fields.phoneNumber || ''}`.trim();
        const date = String(fields.date || '');
        const time = String(fields.time || '');
        const email = String(fields.email || '').trim() || null;
        const service = String(fields.service || '').trim();
        const location = String(fields.location || 'Chez Ange Muu');
        const inspirationUrl = String(fields.inspirationUrl || '').trim();
        const clientComment = String(fields.comment || '').trim();
        const comment = [clientComment, inspirationUrl ? `Lien d’inspiration : ${inspirationUrl}` : ''].filter(Boolean).join('\n');

        if (!clientName || !fields.phoneNumber || !date || !time || !service) {
            showFeedback('error', 'Il manque une information', 'Renseignez votre nom, votre téléphone, un créneau et le service souhaité.', 'Bonjour Ange Muu, pouvez-vous m’aider à prendre rendez-vous ?', false);
            feedback?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const appointmentDetails = [
            '*Demande de rendez-vous — Ange Muu*',
            `*Nom :* ${clientName}`,
            `*Téléphone :* ${phone}`,
            `*Service :* ${service}`,
            `*Date :* ${formatDate(date)}`,
            `*Heure :* ${time}`,
            `*Lieu :* ${location}`,
            `*Email :* ${email || 'Non renseigné'}`,
            ...(inspirationUrl ? [`*Inspiration :* ${inspirationUrl}`] : []),
            `*Détail :* ${comment || 'Aucun'}`
        ].join('\n');

        isSubmitting = true;
        bookingForm.setAttribute('aria-busy', 'true');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Enregistrement…';
        }

        let responseData = null;
        let requestError = null;
        try {
            if (!window.supabaseClient) throw new Error('Service de réservation indisponible');

            const response = await window.supabaseClient.functions.invoke('save-booking', {
                body: {
                    client_name: clientName,
                    phone,
                    email,
                    date,
                    time,
                    service,
                    location,
                    comment
                }
            });
            responseData = response.data;
            requestError = response.error;
        } catch (error) {
            requestError = error;
        }

        if (requestError || !responseData?.ok || !responseData?.booking?.id) {
            console.error('Échec de la réservation :', requestError || responseData);
            const errorPayload = await readErrorPayload(requestError, responseData);
            const failureMessage = explainFailure(errorPayload.error);
            const helpMessage = [
                'Bonjour Ange Muu, je n’ai pas reçu de confirmation après ma demande en ligne. Pouvez-vous vérifier si elle a été enregistrée ?',
                appointmentDetails
            ].join('\n\n');
            showFeedback('error', 'La demande n’est pas encore confirmée', failureMessage, helpMessage, false);
            if (['date_unavailable', 'date_in_past'].includes(errorPayload.error)) {
                CalendarState.selectedDate = null;
                document.getElementById('booking-date-input').value = '';
                document.getElementById('booking-time-input').value = '';
                if (slotsShell) slotsShell.innerHTML = '<p class="sc-slots-hint">Sélectionnez une date pour voir les créneaux disponibles.</p>';
                await initCalendar('booking-date-picker', true);
            } else if (['slot_taken', 'slot_blocked', 'day_full'].includes(errorPayload.error)) {
                await Promise.all([
                    initCalendar('booking-date-picker', true),
                    window.supabaseClient ? renderSlotsForDate(date) : Promise.resolve()
                ]);
            }
            feedback?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            showFeedback(
                'success',
                'Votre demande est enregistrée',
                `Merci ${clientName}. Votre rendez-vous du ${formatDate(date)} à ${time} est en attente de confirmation par Ange Muu.`,
                `Bonjour Ange Muu, je viens d’envoyer une demande de rendez-vous et j’attends votre confirmation.\n\n${appointmentDetails}`,
                true
            );
            bookingForm.hidden = true;
            feedback?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        isSubmitting = false;
        bookingForm.removeAttribute('aria-busy');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Prendre RDV';
        }
    });
});
