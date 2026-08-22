import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, ForeignKey, DateTime, Uuid
from sqlalchemy.orm import relationship
from backend.database import Base

def utcnow():
    return datetime.now(timezone.utc)

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    subscription_type = Column(String, nullable=True)
    mrr_amount = Column(Float, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    
    failure_events = relationship("FailureEvent", back_populates="customer")

class FailureEvent(Base):
    __tablename__ = "failure_events"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(Uuid(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    decline_code = Column(String, nullable=False)
    raw_decline_code = Column(String, nullable=True)
    classified_cause = Column(String, nullable=True) # filled by LLM or direct mapping
    confidence = Column(Float, nullable=True)
    days_since_first_failure = Column(Integer, nullable=False)
    retry_count = Column(Integer, default=0)
    detected_at = Column(DateTime, default=utcnow)
    
    customer = relationship("Customer", back_populates="failure_events")
    recovery_actions = relationship("RecoveryAction", back_populates="failure_event")

class RecoveryAction(Base):
    __tablename__ = "recovery_actions"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    failure_event_id = Column(Uuid(as_uuid=True), ForeignKey("failure_events.id"), nullable=False)
    action_type = Column(String, nullable=False)
    channel = Column(String, nullable=False)
    scheduled_for = Column(DateTime, nullable=True)
    executed_at = Column(DateTime, nullable=True)
    cost_estimate = Column(Float, nullable=True)
    status = Column(String, nullable=False)
    
    failure_event = relationship("FailureEvent", back_populates="recovery_actions")
    outcomes = relationship("RecoveryOutcome", back_populates="recovery_action")

class RecoveryOutcome(Base):
    __tablename__ = "recovery_outcomes"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recovery_action_id = Column(Uuid(as_uuid=True), ForeignKey("recovery_actions.id"), nullable=False)
    outcome = Column(String, nullable=False) # 'recovered' | 'no_response' | 'blocked' | 'abandoned' | 'pending'
    amount_recovered = Column(Float, default=0.0)
    resolved_at = Column(DateTime, default=utcnow)
    
    recovery_action = relationship("RecoveryAction", back_populates="outcomes")

class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type = Column(String, nullable=False) # e.g., 'FailureEvent'
    entity_id = Column(Uuid(as_uuid=True), nullable=False)
    event_type = Column(String, nullable=False) # e.g., 'classification', 'decision', 'execution'
    actor = Column(String, nullable=False) # 'agent' | 'rules_engine' | 'human'
    reason_text = Column(String, nullable=False)
    created_at = Column(DateTime, default=utcnow)
