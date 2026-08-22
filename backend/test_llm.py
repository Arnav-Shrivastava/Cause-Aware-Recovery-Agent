import asyncio
from backend.llm import classify_cause, generate_nudge_copy

async def test_llm():
    # Test 1: Known cause should skip LLM and return instantly
    res1 = await classify_cause("MANDATE_EXPIRED")
    assert res1["cause"] == "MANDATE_EXPIRED"
    assert res1["confidence"] == 0.99
    
    # Test 2: Nudge copy fallback (assuming no valid API key or test environment)
    # The fallback should be used seamlessly
    nudge = await generate_nudge_copy("Alice", "Update Card")
    assert "Alice" in nudge
    assert "Update Card" in nudge
    
    print("LLM integration tests passed!")

if __name__ == "__main__":
    asyncio.run(test_llm())
