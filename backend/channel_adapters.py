import random

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
            "customer_responded": customer_responded
        }

class WhatsAppAdapter(MockChannelAdapter):
    def __init__(self):
        super().__init__(name="WhatsApp", success_rate=0.68)

class EmailAdapter(MockChannelAdapter):
    def __init__(self):
        super().__init__(name="Email", success_rate=0.22)

class CardUpdaterAdapter(MockChannelAdapter):
    def __init__(self):
        super().__init__(name="CardUpdater", success_rate=0.55)

# Singleton instances for use across the app
whatsapp_adapter = WhatsAppAdapter()
email_adapter = EmailAdapter()
card_updater_adapter = CardUpdaterAdapter()

def get_adapter_for_channel(channel: str) -> MockChannelAdapter:
    channel_lower = channel.lower()
    if "whatsapp" in channel_lower:
        return whatsapp_adapter
    elif "email" in channel_lower:
        return email_adapter
    elif "card updater" in channel_lower or "card_updater" in channel_lower:
        return card_updater_adapter
    else:
        # Fallback to email adapter if unknown
        return email_adapter
