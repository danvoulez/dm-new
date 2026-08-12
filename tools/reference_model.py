#!/usr/bin/env python3
"""Deterministic command-model fixture for exercising the real inference boundary.

This is intentionally not presented as an LLM. It proves that the Lab actually invokes
an operator-registered model process, passes structured context, receives JSON, cages it
with the registered schema, receipts it, and registers the candidate separately.
Replace this command with an Ollama/llama.cpp/provider bridge in a real deployment.
"""
import json
import sys

request = json.load(sys.stdin)
input_value = request.get("input")
if isinstance(input_value, dict):
    subject = json.dumps(input_value, sort_keys=True, ensure_ascii=False)
elif input_value is None:
    subject = request.get("task", "")
else:
    subject = str(input_value)
citations = list(request.get("input_hashes", [])) + list(request.get("projection_hashes", []))
json.dump(
    {
        "summary": f"reference-model processed: {subject}",
        "citations": citations,
        "requested_action": "register_candidate",
    },
    sys.stdout,
    ensure_ascii=False,
)
