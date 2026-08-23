import random
import os
import logging
from twilio.rest import Client
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

logger = logging.getLogger(__name__)

class MockChannelAdapter:
    def __init__(self, name: str, success_rate: float):
        self.name = name
        self.success_rate = success_rate
        
    def send(self, rng: random.Random, **kwargs) -> dict:
        """
        Simulates sending a message and returning customer response state.
        Uses the provided RNG to ensure reproducibility.
        """
        # We assume delivery is always successful for the mock,
        # but customer response depends on the channel's success rate.
        customer_responded = rng.random() <= self.success_rate
        
        return {
            "delivered": True,
            "customer_responded": customer_responded,
            "provider_message_id": None
        }

class WhatsAppAdapter(MockChannelAdapter):
    def __init__(self):
        super().__init__(name="WhatsApp", success_rate=0.68)

    def send(self, rng: random.Random, **kwargs) -> dict:
        target_contact = kwargs.get("target_contact")
        message_text = kwargs.get("message_text", "")
        
        allowlist = os.environ.get("REAL_SEND_ALLOWLIST_PHONE", "").split(",")
        allowlist = [phone.strip() for phone in allowlist if phone.strip()]

        if target_contact and target_contact in allowlist:
            account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
            auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
            from_number = os.environ.get("TWILIO_WHATSAPP_FROM")
            
            if account_sid and auth_token and from_number:
                try:
                    client = Client(account_sid, auth_token)
                    message = client.messages.create(
                        from_=from_number,
                        body=message_text,
                        to=f"whatsapp:{target_contact}"
                    )
                    return {
                        "delivered": True,
                        "customer_responded": True, # For demo purposes
                        "provider_message_id": message.sid
                    }
                except Exception as e:
                    logger.error(f"real WhatsApp send failed, falling back to simulated outcome: {e}")

        # Fallback to simulated behavior
        return super().send(rng, **kwargs)

class VoiceAdapter(MockChannelAdapter):
    def __init__(self):
        super().__init__(name="Voice", success_rate=0.45)

    def send(self, rng: random.Random, **kwargs) -> dict:
        target_contact = kwargs.get("target_contact")
        message_text = kwargs.get("message_text", "")
        
        allowlist = os.environ.get("REAL_SEND_ALLOWLIST_PHONE", "").split(",")
        allowlist = [phone.strip() for phone in allowlist if phone.strip()]

        if target_contact and target_contact in allowlist:
            account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
            auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
            from_number = os.environ.get("TWILIO_VOICE_FROM")
            
            if account_sid and auth_token and from_number:
                try:
                    client = Client(account_sid, auth_token)
                    # Twilio TwiML for text-to-speech
                    twiml = f"<Response><Say>{message_text}</Say></Response>"
                    call = client.calls.create(
                        twiml=twiml,
                        to=target_contact,
                        from_=from_number
                    )
                    return {
                        "delivered": True,
                        "customer_responded": True,
                        "provider_message_id": call.sid
                    }
                except Exception as e:
                    logger.error(f"real Voice call failed, falling back to simulated outcome: {e}")

        return super().send(rng, **kwargs)

class EmailAdapter(MockChannelAdapter):
    def __init__(self):
        super().__init__(name="Email", success_rate=0.22)
        
    def send(self, rng: random.Random, **kwargs) -> dict:
        target_contact = kwargs.get("target_contact")
        message_text = kwargs.get("message_text", "")
        
        allowlist = os.environ.get("REAL_SEND_ALLOWLIST_EMAIL", "").split(",")
        allowlist = [email.strip() for email in allowlist if email.strip()]

        if target_contact and target_contact in allowlist:
            api_key = os.environ.get("SENDGRID_API_KEY")
            from_email = os.environ.get("SENDGRID_FROM_EMAIL") # Needed for Sendgrid
            
            if api_key and from_email:
                try:
                    message = Mail(
                        from_email=from_email,
                        to_emails=target_contact,
                        subject='Important update regarding your subscription',
                        html_content=f'<strong>{message_text}</strong>'
                    )
                    sg = SendGridAPIClient(api_key)
                    response = sg.send(message)
                    message_id = response.headers.get('X-Message-Id', 'unknown-sg-id')
                    return {
                        "delivered": True,
                        "customer_responded": True,
                        "provider_message_id": message_id
                    }
                except Exception as e:
                    logger.error(f"real Email send failed, falling back to simulated outcome: {e}")

        return super().send(rng, **kwargs)


class CardUpdaterAdapter(MockChannelAdapter):
    def __init__(self):
        super().__init__(name="CardUpdater", success_rate=0.55)

# Singleton instances for use across the app
whatsapp_adapter = WhatsAppAdapter()
voice_adapter = VoiceAdapter()
email_adapter = EmailAdapter()
card_updater_adapter = CardUpdaterAdapter()

def get_adapter_for_channel(channel: str) -> MockChannelAdapter:
    channel_lower = channel.lower()
    if "whatsapp" in channel_lower:
        return whatsapp_adapter
    elif "voice" in channel_lower:
        return voice_adapter
    elif "email" in channel_lower:
        return email_adapter
    elif "card updater" in channel_lower or "card_updater" in channel_lower:
        return card_updater_adapter
    else:
        # Fallback to email adapter if unknown
        return email_adapter
