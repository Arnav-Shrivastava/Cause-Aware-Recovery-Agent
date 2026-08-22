# backend/test_rules_engine.py
from backend.rules_engine import evaluate_failure

def test_rules_engine():
    # 1. Grace Period
    res1 = evaluate_failure(days_since_first_failure=3, retry_count=0, classified_cause="INSUFFICIENT_FUNDS")
    assert res1["decision"] == "pending", f"Expected pending, got {res1['decision']}"
    
    # 2. Abandon After (Age checked before retry count)
    res2 = evaluate_failure(days_since_first_failure=25, retry_count=5, classified_cause="INSUFFICIENT_FUNDS")
    assert res2["decision"] == "abandon", f"Expected abandon, got {res2['decision']}"
    
    # 3. Blocked (Retry Cap)
    res3 = evaluate_failure(days_since_first_failure=15, retry_count=3, classified_cause="INSUFFICIENT_FUNDS")
    assert res3["decision"] == "blocked", f"Expected blocked, got {res3['decision']}"
    
    # 4. Execute (Insufficient Funds)
    res4 = evaluate_failure(days_since_first_failure=10, retry_count=1, classified_cause="INSUFFICIENT_FUNDS")
    assert res4["decision"] == "execute", f"Expected execute, got {res4['decision']}"
    assert res4["action"] == "Delayed retry"
    assert res4["channel"] == "WhatsApp"
    
    # 5. Execute (Mandate Expired)
    res5 = evaluate_failure(days_since_first_failure=14, retry_count=2, classified_cause="MANDATE_EXPIRED")
    assert res5["decision"] == "execute"
    assert res5["action"] == "New mandate link"
    
    print("All rules engine tests passed!")

if __name__ == "__main__":
    test_rules_engine()
