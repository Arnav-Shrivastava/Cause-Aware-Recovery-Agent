import random
import uuid

CAUSE_DISTRIBUTION = {
    "INSUFFICIENT_FUNDS": 0.42,
    "MANDATE_EXPIRED": 0.28,
    "CARD_EXPIRED": 0.18,
    "BANK_CHANGED": 0.12,
}

DECLINE_CODE_MAPPING = {
    "INSUFFICIENT_FUNDS": ["05 - Do Not Honor", "51 - Insufficient Funds"],
    "MANDATE_EXPIRED": ["MD01 - Mandate Expired", "R08 - Payment Stopped"],
    "CARD_EXPIRED": ["54 - Expired Card"],
    "BANK_CHANGED": ["R02 - Account Closed", "14 - Invalid Account"]
}

CUSTOMER_PROFILES = [
    {"name": "Priya Nair", "subscription": "Gym membership"},
    {"name": "Rohan Mehta", "subscription": "SaaS seat - TeamSync Pro"},
    {"name": "Ananya Iyer", "subscription": "D2C skincare box"},
    {"name": "Vikram Singh", "subscription": "Cloud Storage 2TB"},
    {"name": "Kavita Desai", "subscription": "Streaming Service - Annual"},
    {"name": "Arjun Patel", "subscription": "VPN Premium"},
    {"name": "Neha Sharma", "subscription": "Meal Prep Weekly"},
    {"name": "Siddharth Rao", "subscription": "Fitness App Pro"},
    {"name": "Pooja Reddy", "subscription": "Magazine Digital"},
    {"name": "Rahul Verma", "subscription": "E-Learning Platform"},
    {"name": "Sneha Gupta", "subscription": "Music Streaming Family"},
    {"name": "Amit Joshi", "subscription": "Web Hosting Starter"},
    {"name": "Divya Krishnan", "subscription": "Coffee Subscription"},
    {"name": "Karan Malhotra", "subscription": "Software License"},
    {"name": "Anjali Kapoor", "subscription": "News Premium"}
]

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
            
        mrr = round(rng.uniform(500, 5000), 2)
            
        raw_code = rng.choice(DECLINE_CODE_MAPPING[cause])
        profile = rng.choice(CUSTOMER_PROFILES)
            
        event = {
            "id": str(uuid.UUID(int=rng.getrandbits(128))), # Deterministic-ish random UUID for consistent UI keys? No, better use standard uuid, but we want deterministic so:
            "customer_id": str(uuid.UUID(int=rng.getrandbits(128))),
            "customer_name": profile["name"],
            "subscription_type": profile["subscription"],
            "mrr_amount": mrr,
            "decline_code": cause, # Using clean code, the LLM step will simulate noisy codes if needed, or we just pass this
            "raw_decline_code": raw_code,
            "days_since_first_failure": days_since_first_failure,
            "retry_count": retry_count
        }
        events.append(event)
        
    return events
