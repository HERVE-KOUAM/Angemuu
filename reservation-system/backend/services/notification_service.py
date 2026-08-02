# Simple notification service skeleton
# Implement SMTP for email and Twilio (or other) for WhatsApp in later steps

def send_email(to_email: str, subject: str, body: str) -> bool:
    """Placeholder: send an email. Return True on success."""
    print(f"[notification] email -> {to_email}: {subject}")
    return True


def send_whatsapp(to_number: str, message: str) -> bool:
    """Placeholder: send a WhatsApp message via Twilio or provider."""
    print(f"[notification] whatsapp -> {to_number}: {message}")
    return True
