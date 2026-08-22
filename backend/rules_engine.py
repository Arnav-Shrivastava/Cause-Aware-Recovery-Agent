# backend/rules_engine.py

GRACE_PERIOD_DAYS = 7
ABANDON_AFTER_DAYS = 21
MAX_RETRY_ATTEMPTS = 3

CAUSE_TO_ACTION = {
    "INSUFFICIENT_FUNDS": {
        "action": "Delayed retry",
        "channel": "WhatsApp",
        "reason": "Retry timed to when balance is more likely available, not immediately"
    },
    "MANDATE_EXPIRED": {
        "action": "New mandate link",
        "channel": "WhatsApp",
        "reason": "WhatsApp recovery rate is roughly 3x email for this"
    },
    "CARD_EXPIRED": {
        "action": "Card updater flow",
        "channel": "Email",
        "reason": "Simulated card-updater call"
    },
    "BANK_CHANGED": {
        "action": "Escalate to human",
        "channel": "None",
        "reason": "Low auto-recovery probability, don't burn automated attempts"
    }
}

def evaluate_failure(days_since_first_failure: int, retry_count: int, classified_cause: str) -> dict:
    """
    Evaluates a failure event and returns a deterministic decision and action plan.
    Returns a dictionary with:
    - decision: 'pending' | 'abandon' | 'blocked' | 'execute'
    - action: The action string if executing, else None
    - channel: The channel string if executing, else None
    - reason: The plain English reason for the decision, for the audit log
    """
    
    if days_since_first_failure < GRACE_PERIOD_DAYS:
        return {
            "decision": "pending",
            "action": None,
            "channel": None,
            "reason": f"Event is only {days_since_first_failure} days old (still in {GRACE_PERIOD_DAYS}-day grace period)."
        }
    
    if days_since_first_failure > ABANDON_AFTER_DAYS:
        return {
            "decision": "abandon",
            "action": None,
            "channel": None,
            "reason": f"Event is {days_since_first_failure} days old, exceeding {ABANDON_AFTER_DAYS}-day abandonment window. Subscription paused."
        }
        
    if retry_count >= MAX_RETRY_ATTEMPTS:
        return {
            "decision": "blocked",
            "action": None,
            "channel": None,
            "reason": f"Retry cap of {MAX_RETRY_ATTEMPTS} reached. No further automated attempts allowed."
        }
        
    # Otherwise -> execute
    mapping = CAUSE_TO_ACTION.get(classified_cause)
    if not mapping:
        # Fallback for completely unmapped causes
        return {
            "decision": "execute",
            "action": "Generic retry",
            "channel": "Email",
            "reason": "Unrecognized cause, falling back to generic email retry."
        }
        
    return {
        "decision": "execute",
        "action": mapping["action"],
        "channel": mapping["channel"],
        "reason": f"Cause is {classified_cause}: {mapping['reason']}"
    }
