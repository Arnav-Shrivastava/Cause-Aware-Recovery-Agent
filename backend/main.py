import asyncio
import uuid
import random
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db, engine, Base
from backend.models import Customer, FailureEvent, RecoveryAction, RecoveryOutcome, AuditLog
from backend.batch_generator import generate_batch
from backend.rules_engine import evaluate_failure
from backend.llm import classify_cause, generate_nudge_copy
from backend.channel_adapters import get_adapter_for_channel

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Cause-Aware Recovery Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow frontend to connect
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def utcnow():
    return datetime.now(timezone.utc)

@app.get("/health")
def health_check():
    return {"status": "ok"}

async def process_event(event_data, db: Session, rng: random.Random):
    # 1. Create Customer
    customer = Customer(
        id=uuid.UUID(event_data["customer_id"]),
        name=event_data["customer_name"],
        subscription_type=event_data["subscription_type"],
        mrr_amount=event_data["mrr_amount"]
    )
    db.merge(customer) # merge to avoid unique constraint if we replay
    
    # 2. LLM Classification
    classification = await classify_cause(event_data["decline_code"])
    
    # 3. Create FailureEvent
    failure_event = FailureEvent(
        id=uuid.UUID(event_data["id"]),
        customer_id=customer.id,
        decline_code=event_data["decline_code"],
        classified_cause=classification["cause"],
        confidence=classification["confidence"],
        days_since_first_failure=event_data["days_since_first_failure"],
        retry_count=event_data["retry_count"],
        raw_decline_code=event_data.get("raw_decline_code")
    )
    db.merge(failure_event)
    
    
    raw_code = event_data.get('raw_decline_code', event_data['decline_code'])
    db.add(AuditLog(
        entity_type="FailureEvent",
        entity_id=failure_event.id,
        event_type="classification",
        actor="agent",
        reason_text=f"Bank declined: \"{raw_code}\" -> classified as {classification['cause']} (confidence {classification['confidence']:.2f})"
    ))
    
    # 4. Rules Engine Evaluation
    eval_result = evaluate_failure(
        days_since_first_failure=failure_event.days_since_first_failure,
        retry_count=failure_event.retry_count,
        classified_cause=failure_event.classified_cause
    )
    
    db.add(AuditLog(
        entity_type="FailureEvent",
        entity_id=failure_event.id,
        event_type="decision",
        actor="rules_engine",
        reason_text=eval_result["reason"]
    ))
    
    amount_recovered = 0.0
    
    # 5. Action Execution
    if eval_result["decision"] == "execute":
        action = RecoveryAction(
            failure_event_id=failure_event.id,
            action_type=eval_result["action"],
            channel=eval_result["channel"],
            executed_at=utcnow(),
            status="executed"
        )
        db.add(action)
        db.flush() # flush to get action.id
        
        # LLM Nudge Copy
        nudge = await generate_nudge_copy(customer.name, action.action_type)
        
        db.add(AuditLog(
            entity_type="RecoveryAction",
            entity_id=action.id,
            event_type="execution",
            actor="agent",
            reason_text=f"Generated message: '{nudge}'. Sending via {action.channel}."
        ))
        
        # Mock sending
        adapter = get_adapter_for_channel(action.channel)
        sim_result = adapter.send(rng)
        
        outcome_status = "recovered" if sim_result["customer_responded"] else "no_response"
        amount = customer.mrr_amount if outcome_status == "recovered" else 0.0
        
        outcome = RecoveryOutcome(
            recovery_action_id=action.id,
            outcome=outcome_status,
            amount_recovered=amount
        )
        db.add(outcome)
        amount_recovered = amount
        
    else:
        # Create a dummy action/outcome to record the pending/abandoned/blocked state
        action = RecoveryAction(
            failure_event_id=failure_event.id,
            action_type="None",
            channel="None",
            status=eval_result["decision"]
        )
        db.add(action)
        db.flush()
        outcome = RecoveryOutcome(
            recovery_action_id=action.id,
            outcome=eval_result["decision"],
            amount_recovered=0.0
        )
        db.add(outcome)
        
    return {
        "mrr_amount": customer.mrr_amount,
        "recovered": amount_recovered
    }

@app.post("/batch/run")
async def run_batch(n: int = Query(500), seed: int = Query(42), db: Session = Depends(get_db)):
    """
    Generates a batch, processes it through the pipeline in parallel, and returns a summary.
    """
    events = generate_batch(seed=seed, n=n)
    rng = random.Random(seed) # Deterministic execution
    
    # We will process concurrently to speed up LLM calls (Option B)
    # But pass the rng sequentially to ensure deterministic adapter simulation.
    # Actually, if we gather them, execution order of async tasks is mostly deterministic but not perfectly.
    # To keep the mock adapter completely deterministic, we will just use a sequential rng.
    
    tasks = []
    # Using a list of tasks for asyncio.gather
    for ev in events:
        tasks.append(process_event(ev, db, rng))
        
    results = await asyncio.gather(*tasks)
    
    # Commit all changes to DB
    db.commit()
    
    at_risk = sum(r["mrr_amount"] for r in results)
    recovered = sum(r["recovered"] for r in results)
    
    return {
        "status": "success",
        "events_processed": n,
        "at_risk": at_risk,
        "recovered": recovered,
        "recovery_rate": (recovered / at_risk) if at_risk > 0 else 0
    }

@app.get("/batch/{batch_id}/summary") # using a dummy id since we don't have batch runs table
def get_batch_summary(db: Session = Depends(get_db)):
    # We aggregate over all outcomes in the DB. For a real app we'd filter by batch_id
    outcomes = db.query(RecoveryOutcome).all()
    at_risk = 0
    recovered = 0
    outcome_counts = {"recovered": 0, "no_response": 0, "pending": 0, "blocked": 0, "abandon": 0}
    
    for outcome in outcomes:
        outcome_counts[outcome.outcome] = outcome_counts.get(outcome.outcome, 0) + 1
        recovered += outcome.amount_recovered
        
    customers = db.query(Customer).all()
    at_risk = sum(c.mrr_amount for c in customers)
    
    naive_baseline = 0.20
    
    return {
        "at_risk": at_risk,
        "recovered": recovered,
        "recovery_rate": (recovered / at_risk) if at_risk > 0 else 0,
        "naive_baseline": naive_baseline,
        "outcome_counts": outcome_counts
    }

@app.get("/dashboard/feed")
def get_dashboard_feed(limit: int = Query(20), db: Session = Depends(get_db)):
    events = db.query(FailureEvent).order_by(FailureEvent.detected_at.desc()).limit(limit).all()
    
    feed = []
    for ev in events:
        action = ev.recovery_actions[0] if ev.recovery_actions else None
        outcome = action.outcomes[0] if action and action.outcomes else None
        
        feed.append({
            "id": ev.id,
            "customer_name": ev.customer.name,
            "subscription_type": ev.customer.subscription_type,
            "cause": ev.classified_cause,
            "action_taken": action.action_type if action else "None",
            "decision": action.status if action else "pending",
            "outcome": outcome.outcome if outcome else "pending",
            "amount_recovered": outcome.amount_recovered if outcome else 0.0,
            "mrr_amount": ev.customer.mrr_amount,
            "raw_decline_code": ev.raw_decline_code
        })
    return feed

@app.get("/audit/{failure_event_id}")
def get_audit_trail(failure_event_id: str, db: Session = Depends(get_db)):
    event_uuid = uuid.UUID(failure_event_id)
    
    # Get all logs for this failure event
    # First get logs directly tied to the event
    logs = db.query(AuditLog).filter(
        AuditLog.entity_id == event_uuid
    ).all()
    
    # Also get logs for the associated recovery actions
    actions = db.query(RecoveryAction).filter(RecoveryAction.failure_event_id == event_uuid).all()
    action_ids = [a.id for a in actions]
    
    if action_ids:
        action_logs = db.query(AuditLog).filter(
            AuditLog.entity_id.in_(action_ids)
        ).all()
        logs.extend(action_logs)
        
    logs.sort(key=lambda x: x.created_at)
    
    return [
        {
            "id": log.id,
            "event_type": log.event_type,
            "actor": log.actor,
            "reason_text": log.reason_text,
            "created_at": log.created_at
        }
        for log in logs
    ]
