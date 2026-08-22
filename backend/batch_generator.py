import random
import uuid

CAUSE_DISTRIBUTION = {
    "INSUFFICIENT_FUNDS": 0.42,
    "MANDATE_EXPIRED": 0.28,
    "CARD_EXPIRED": 0.18,
    "BANK_CHANGED": 0.12,
}

def generate_batch(seed: int, n: int = 500) -> list:
    """
    Deterministically generates a batch of failed payment events.
    """
    rng = random.Random(seed)
    
    causes = list(CAUSE_DISTRIBUTION.keys())
    weights = list(CAUSE_DISTRIBUTION.values())
    
    events = []
    
    for _ in range(n):
        # Cause
        cause = rng.choices(causes, weights=weights, k=1)[0]
        
        # Age distribution: Triangular approximation, peaking around 13 (0-26 range)
        days_since_first_failure = int((rng.uniform(0, 26) + rng.uniform(0, 26)) / 2)
        
        # Retry count strongly correlated with age to prevent nonsensical states
        base_retries = min(3, max(0, days_since_first_failure - 7) // 6)
        
        # Add a little noise so it's not perfectly mechanical
        # If we can add one without exceeding MAX_RETRY_ATTEMPTS (3)
        if base_retries < 3 and rng.random() > 0.7:
            retry_count = base_retries + 1
        else:
            retry_count = base_retries
            
        CUSTOMER_PROFILES = [
            {"name": "Priya Nair", "subscription": "Gym Membership - FitHub"},
            {"name": "Rohan Mehta", "subscription": "SaaS Seat - TeamSync Pro"},
            {"name": "Ananya Iyer", "subscription": "D2C Skincare Box - Glow"},
            {"name": "Vikram Singh", "subscription": "Cloud Storage - 500GB"},
            {"name": "Sneha Reddy", "subscription": "Meal Prep Weekly - FreshBites"},
            {"name": "Rahul Desai", "subscription": "Streaming - FlixIndia Premium"},
            {"name": "Kavita Joshi", "subscription": "EdTech Course - CodeCamp"},
            {"name": "Amit Patel", "subscription": "Newsletter - FinInsights"},
            {"name": "Neha Gupta", "subscription": "SaaS Seat - TeamSync Pro"},
            {"name": "Siddharth Rao", "subscription": "Coffee Subscription - BeanBliss"},
            {"name": "Pooja Sharma", "subscription": "Co-working Pass - DeskSpace"},
            {"name": "Aditya Verma", "subscription": "VPN - SecureNet Annual"},
            {"name": "Karan Kapoor", "subscription": "Gym Membership - FitHub"},
            {"name": "Swati Mishra", "subscription": "D2C Pet Food - BarkBox"},
            {"name": "Tarun Menon", "subscription": "SaaS Seat - TeamSync Pro"}
        ]
        
        customer = rng.choice(CUSTOMER_PROFILES)
        
        mrr = round(rng.uniform(500, 5000), 2)
        
        raw_decline_map = {
            "INSUFFICIENT_FUNDS": ["05 - Do Not Honor", "51 - Insufficient Funds"],
            "MANDATE_EXPIRED": ["MD01 - Mandate Expired", "R08 - Payment Stopped"],
            "CARD_EXPIRED": ["54 - Expired Card"],
            "BANK_CHANGED": ["R02 - Account Closed", "14 - Invalid Account"]
        }
        raw_decline_code = rng.choice(raw_decline_map[cause])
            
        event = {
            "id": str(uuid.UUID(int=rng.getrandbits(128))), # Deterministic-ish random UUID for consistent UI keys? No, better use standard uuid, but we want deterministic so:
            "customer_id": str(uuid.UUID(int=rng.getrandbits(128))),
            "customer_name": customer["name"],
            "subscription_type": customer["subscription"],
            "mrr_amount": mrr,
            "raw_decline_code": raw_decline_code,
            "decline_code": cause, # Using clean code, the LLM step will simulate noisy codes if needed, or we just pass this
            "days_since_first_failure": days_since_first_failure,
            "retry_count": retry_count
        }
        events.append(event)
        
    return events
