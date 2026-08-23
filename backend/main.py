import asyncio
import uuid
import random
from datetime import datetime, timezone
import os
from fastapi import FastAPI, Depends, HTTPException, Query, Form, Request, Response
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
        raw_decline_code=event_data["raw_decline_code"],
        classified_cause=classification["cause"],
        confidence=classification["confidence"],
        days_since_first_failure=event_data["days_since_first_failure"],
        retry_count=event_data["retry_count"]
    )
    db.merge(failure_event)
    
    db.add(AuditLog(
        entity_type="FailureEvent",
        entity_id=failure_event.id,
        event_type="classification",
        actor="agent",
        reason_text=f"Bank declined: \"{event_data['raw_decline_code']}\" -> classified as {classification['cause']} (confidence {classification['confidence']:.2f})"
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
    action_cost = 0.0
    
    CHANNEL_COSTS = {
        "whatsapp": 0.50,
        "email": 0.10,
        "card_updater": 2.00,
    }
    
    # 5. Action Execution
    if eval_result["decision"] == "execute":
        channel_name = eval_result["channel"]
        action_cost = CHANNEL_COSTS.get(channel_name.lower(), 0.0)
        action = RecoveryAction(
            failure_event_id=failure_event.id,
            action_type=eval_result["action"],
            channel=channel_name,
            cost_estimate=action_cost,
            executed_at=utcnow(),
            status="executed"
        )
        db.add(action)
        db.flush() # flush to get action.id
        
        # LLM Nudge Copy
        nudge = await generate_nudge_copy(customer.name, action.action_type)
        action.message_text = nudge
        
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
        "recovered": amount_recovered,
        "cost": action_cost
    }

async def process_naive_event(event_data, rng: random.Random):
    # Deliberately dumb simulation: ignore cause, just retry via Email immediately
    # No DB writes, no LLM calls
    adapter = get_adapter_for_channel("Email")
    sim_result = adapter.send(rng)
    
    outcome_status = "recovered" if sim_result["customer_responded"] else "no_response"
    amount = event_data["mrr_amount"] if outcome_status == "recovered" else 0.0
    cost = 0.10 # Email cost
    
    return {
        "mrr_amount": event_data["mrr_amount"],
        "recovered": amount,
        "cost": cost
    }

@app.post("/batch/run-naive")
async def run_naive_batch(n: int = Query(500), seed: int = Query(42)):
    events = generate_batch(seed=seed, n=n)
    rng = random.Random(seed)
    
    results = []
    for ev in events:
        results.append(await process_naive_event(ev, rng))
        
    at_risk = sum(r["mrr_amount"] for r in results)
    recovered = sum(r["recovered"] for r in results)
    total_cost = sum(r["cost"] for r in results)
    
    return {
        "status": "success",
        "events_processed": n,
        "at_risk": at_risk,
        "recovered": recovered,
        "total_cost": total_cost,
        "net_recovered": recovered - total_cost,
        "recovery_rate": (recovered / at_risk) if at_risk > 0 else 0
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
    total_cost = sum(r["cost"] for r in results)
    
    return {
        "status": "success",
        "events_processed": n,
        "at_risk": at_risk,
        "recovered": recovered,
        "total_cost": total_cost,
        "net_recovered": recovered - total_cost,
        "recovery_rate": (recovered / at_risk) if at_risk > 0 else 0
    }

@app.get("/batch/{batch_id}/summary") # using a dummy id since we don't have batch runs table
def get_batch_summary(db: Session = Depends(get_db)):
    # We aggregate over all outcomes in the DB. For a real app we'd filter by batch_id
    outcomes = db.query(RecoveryOutcome).all()
    recovered = 0
    outcome_counts = {"recovered": 0, "no_response": 0, "pending": 0, "blocked": 0, "abandon": 0}
    
    for outcome in outcomes:
        outcome_counts[outcome.outcome] = outcome_counts.get(outcome.outcome, 0) + 1
        recovered += outcome.amount_recovered
        
    actions = db.query(RecoveryAction).all()
    total_cost = sum(a.cost_estimate or 0.0 for a in actions)
        
    customers = db.query(Customer).all()
    at_risk = 0
    daily_at_risk_totals = [0.0] * 7
    for c in customers:
        at_risk += c.mrr_amount
        bucket = c.id.int % 7
        daily_at_risk_totals[bucket] += c.mrr_amount
        
    import datetime
    days_of_week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    today_idx = datetime.datetime.now().weekday()
    labels = [days_of_week[(today_idx - 6 + i) % 7] for i in range(7)]
    
    daily_at_risk = [
        {"day": labels[i], "at_risk": round(daily_at_risk_totals[i], 2)}
        for i in range(7)
    ]
    
    naive_baseline = 0.20
    
    return {
        "at_risk": round(at_risk, 2),
        "recovered": round(recovered, 2),
        "total_cost": round(total_cost, 2),
        "net_recovered": round(recovered - total_cost, 2),
        "recovery_rate": (recovered / at_risk) if at_risk > 0 else 0,
        "naive_baseline": naive_baseline,
        "outcome_counts": outcome_counts,
        "daily_at_risk": daily_at_risk
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
            "raw_decline_code": ev.raw_decline_code,
            "action_taken": action.action_type if action else "None",
            "decision": action.status if action else "pending",
            "outcome": outcome.outcome if outcome else "pending",
            "amount_recovered": outcome.amount_recovered if outcome else 0.0,
            "mrr_amount": ev.customer.mrr_amount
        })
    return feed

class DemoSendRequest(BaseModel):
    failure_event_id: str
    channel: str
    target_contact: str

@app.post("/demo/send-real")
async def demo_send_real(request: DemoSendRequest, db: Session = Depends(get_db)):
    event_uuid = uuid.UUID(request.failure_event_id)
    event = db.query(FailureEvent).filter(FailureEvent.id == event_uuid).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    customer = event.customer
    
    # Retrieve existing action text or generate a new one
    action = db.query(RecoveryAction).filter(RecoveryAction.failure_event_id == event_uuid).first()
    if action and action.message_text:
        message_text = action.message_text
        action_type = action.action_type
    else:
        action_type = "Delayed retry"
        message_text = await generate_nudge_copy(customer.name, action_type)
        
    demo_action = RecoveryAction(
        failure_event_id=event.id,
        action_type=action_type,
        channel=request.channel,
        message_text=message_text,
        status="executed",
        executed_at=utcnow()
    )
    db.add(demo_action)
    db.flush()
    
    db.add(AuditLog(
        entity_type="RecoveryAction",
        entity_id=demo_action.id,
        event_type="execution",
        actor="agent",
        reason_text=f"Live demo send via {request.channel} to {request.target_contact}."
    ))
    
    rng = random.Random()
    adapter = get_adapter_for_channel(request.channel)
    
    # The adapter will try real sending if allowlist matches, else fallback to mock
    result = adapter.send(rng, target_contact=request.target_contact, message_text=message_text)
    
    if result.get("provider_message_id"):
        demo_action.provider_message_id = result["provider_message_id"]
        
    db.add(AuditLog(
        entity_type="RecoveryAction",
        entity_id=demo_action.id,
        event_type="demo_result",
        actor="agent",
        reason_text=f"Live demo send result: delivered={result.get('delivered')} provider_id={result.get('provider_message_id')}"
    ))
    
    if result.get("pending"):
        outcome_str = "pending"
    else:
        outcome_str = "recovered" if result.get("customer_responded") else "no_response"
    outcome = RecoveryOutcome(
        recovery_action_id=demo_action.id,
        outcome=outcome_str,
        amount_recovered=customer.mrr_amount if outcome_str == "recovered" else 0.0
    )
    db.add(outcome)
    db.commit()
    
    return {
        "success": True,
        "provider_message_id": demo_action.provider_message_id,
        "message_sent": message_text,
        "result": result,
        "recovery_action_id": str(demo_action.id)
    }

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
    
    return {
        "logs": [
            {
                "id": log.id,
                "event_type": log.event_type,
                "actor": log.actor,
                "reason_text": log.reason_text,
                "created_at": log.created_at
            }
            for log in logs
        ],
        "message_text": actions[0].message_text if actions and actions[0].status == "executed" else None
    }

@app.post("/webhooks/whatsapp")
async def whatsapp_webhook(
    request: Request,
    From: str = Form(...),
    Body: str = Form(...),
    MessageSid: str = Form(...),
    db: Session = Depends(get_db)
):
    twiml_response = Response(content="<Response></Response>", media_type="application/xml")
    
    phone_number = From.replace("whatsapp:", "").strip()
    allowlist = os.environ.get("REAL_SEND_ALLOWLIST_PHONE", "").split(",")
    allowlist = [phone.strip() for phone in allowlist if phone.strip()]
    
    if phone_number not in allowlist:
        dummy_uuid = uuid.UUID(int=0)
        db.add(AuditLog(
            entity_type="System",
            entity_id=dummy_uuid,
            event_type="webhook_ignored",
            actor="system",
            reason_text=f"Ignored inbound WhatsApp message from non-allowlisted number: {phone_number}"
        ))
        db.commit()
        return twiml_response
        
    action = db.query(RecoveryAction)\
        .join(RecoveryOutcome)\
        .filter(
            RecoveryAction.channel == "whatsapp",
            RecoveryAction.status == "executed",
            RecoveryOutcome.outcome == "pending"
        )\
        .order_by(RecoveryAction.executed_at.desc())\
        .first()
        
    if action:
        outcome = action.outcomes[0]
        outcome.outcome = "recovered"
        outcome.amount_recovered = action.failure_event.customer.mrr_amount
        outcome.resolved_at = utcnow()
        
        action.status = "completed"
        
        db.add(AuditLog(
            entity_type="RecoveryAction",
            entity_id=action.id,
            event_type="demo_reply",
            actor="customer",
            reason_text=f"Customer replied via WhatsApp: \"{Body}\" — recovery action marked complete."
        ))
        db.commit()
    else:
        dummy_uuid = uuid.UUID(int=0)
        db.add(AuditLog(
            entity_type="System",
            entity_id=dummy_uuid,
            event_type="webhook_unmatched",
            actor="system",
            reason_text=f"Unmatched inbound WhatsApp message: {Body}"
        ))
        db.commit()
        
    return twiml_response

@app.get("/demo/status/{recovery_action_id}")
def get_demo_status(recovery_action_id: str, db: Session = Depends(get_db)):
    action = db.query(RecoveryAction).filter(RecoveryAction.id == uuid.UUID(recovery_action_id)).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
        
    outcome = action.outcomes[0] if action.outcomes else None
    
    reply_text = None
    if outcome and outcome.outcome == "recovered":
        log = db.query(AuditLog).filter(
            AuditLog.entity_id == action.id,
            AuditLog.event_type == "demo_reply"
        ).first()
        if log:
            import re
            m = re.search(r'Customer replied via WhatsApp: "(.*?)" — recovery action', log.reason_text)
            if m:
                reply_text = m.group(1)
                
    return {
        "status": action.status,
        "outcome": outcome.outcome if outcome else None,
        "reply_text": reply_text
    }
