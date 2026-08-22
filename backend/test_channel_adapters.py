import random
from backend.channel_adapters import whatsapp_adapter, email_adapter, card_updater_adapter

def test_adapters():
    rng = random.Random(42)
    
    # Run 1000 trials to check rates
    trials = 1000
    wa_success = sum(1 for _ in range(trials) if whatsapp_adapter.send(rng)["customer_responded"])
    email_success = sum(1 for _ in range(trials) if email_adapter.send(rng)["customer_responded"])
    card_success = sum(1 for _ in range(trials) if card_updater_adapter.send(rng)["customer_responded"])
    
    print(f"WhatsApp success rate: {wa_success / trials:.2f} (expected ~0.68)")
    print(f"Email success rate: {email_success / trials:.2f} (expected ~0.22)")
    print(f"CardUpdater success rate: {card_success / trials:.2f} (expected ~0.55)")
    
    # It shouldn't diverge much over 1000 trials
    assert 0.60 < wa_success / trials < 0.75
    assert 0.15 < email_success / trials < 0.30
    assert 0.45 < card_success / trials < 0.65
    print("Channel adapter tests passed!")

if __name__ == "__main__":
    test_adapters()
