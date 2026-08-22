from backend.batch_generator import generate_batch
from backend.rules_engine import evaluate_failure

def test_batch_generator():
    seed = 42
    batch1 = generate_batch(seed)
    batch2 = generate_batch(seed)
    
    assert len(batch1) == 500
    assert batch1 == batch2, "Batch generation must be perfectly deterministic for a given seed."
    
    # Check distribution
    cause_counts = {}
    for ev in batch1:
        c = ev["decline_code"]
        cause_counts[c] = cause_counts.get(c, 0) + 1
        
    print("Cause distribution:")
    for c, count in cause_counts.items():
        expected = {'INSUFFICIENT_FUNDS': 0.42, 'MANDATE_EXPIRED': 0.28, 'CARD_EXPIRED': 0.18, 'BANK_CHANGED': 0.12}[c]
        print(f"  {c}: {count/500:.2f} (expected roughly {expected})")
        
    # Check rule evaluation distribution
    decision_counts = {}
    for ev in batch1:
        res = evaluate_failure(ev["days_since_first_failure"], ev["retry_count"], ev["decline_code"])
        decision_counts[res["decision"]] = decision_counts.get(res["decision"], 0) + 1
        
    print("\nDecision distribution:")
    for d, count in decision_counts.items():
        print(f"  {d}: {count}")
        
    # Check that retry limits make sense
    for ev in batch1:
        if ev["days_since_first_failure"] < 7:
            assert ev["retry_count"] <= 1, "Should not have many retries early on"
            
    print("\nBatch generator tests passed!")

if __name__ == "__main__":
    test_batch_generator()
