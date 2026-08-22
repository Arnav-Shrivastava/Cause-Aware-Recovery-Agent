import os
import json
import logging
from openai import AsyncOpenAI
from backend.rules_engine import CAUSE_TO_ACTION

logger = logging.getLogger(__name__)

# Initialize client if API key is present
api_key = os.getenv("OPENAI_API_KEY")
client = AsyncOpenAI(api_key=api_key) if api_key and api_key != "your_api_key_here" else None

KNOWN_CAUSES = list(CAUSE_TO_ACTION.keys())

async def classify_cause(decline_code: str) -> dict:
    """
    Classifies a decline code into one of the known causes.
    Skips the LLM if the code is already a known clean code.
    """
    code_upper = decline_code.strip().upper()
    if code_upper in KNOWN_CAUSES:
        return {"cause": code_upper, "confidence": 0.99}
        
    if not client:
        # If no client (no API key), fallback to a generic classification
        return {"cause": "INSUFFICIENT_FUNDS", "confidence": 0.50}
        
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini", # Standard fast, cheap model
            messages=[
                {
                    "role": "system",
                    "content": f"You are a payment failure categorization assistant. Map the following decline code to EXACTLY ONE of these categories: {', '.join(KNOWN_CAUSES)}. Respond in JSON format: {{\"cause\": \"CATEGORY\", \"confidence\": 0.0-1.0}}."
                },
                {"role": "user", "content": f"Decline reason: {decline_code}"}
            ],
            response_format={"type": "json_object"},
            timeout=5.0
        )
        
        result_str = response.choices[0].message.content
        result = json.loads(result_str)
        cause = result.get("cause")
        
        if cause not in KNOWN_CAUSES:
            # LLM hallucinated a category, fallback safely
            return {"cause": "INSUFFICIENT_FUNDS", "confidence": 0.10}
            
        return {"cause": cause, "confidence": result.get("confidence", 0.5)}
    except Exception as e:
        logger.error(f"LLM classify_cause failed: {e}")
        return {"cause": "INSUFFICIENT_FUNDS", "confidence": 0.0}

async def generate_nudge_copy(customer_name: str, action: str) -> str:
    """
    Generates short, friendly WhatsApp-style nudge copy.
    MUST never crash the batch run on failure.
    """
    fallback_message = f"Hi {customer_name}, please complete a quick '{action}' step to keep your subscription active."
    
    if not client:
        return fallback_message
        
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a friendly customer success agent writing a WhatsApp message to recover a failed subscription payment. Keep it under 40 words. Be polite, direct, and conversational."
                },
                {"role": "user", "content": f"Customer: {customer_name}, Action required: {action}"}
            ],
            timeout=5.0
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"LLM generate_nudge_copy failed: {e}")
        return fallback_message
