#!/usr/bin/env python3
"""
golden-bridge — unifica Vercel / Cloudflare / LLM local (lab 512).

Replica o provider que vive no lab 512. Lê de stdin o request do
model_runtime (JSON {prompt, catalog, intent}) e tenta em ordem:

1. Vercel AI Gateway  (VERCEL_AI_GATEWAY_URL + TOKEN)
2. Cloudflare Workers AI via AI Gateway (AI_GATEWAY_URL + TOKEN)
3. LLM local           (LOCAL_LLM_URL, ex http://10.88.0.10:1234/v1/chat/completions)

Sem heurística. Falha fecha com AdapterError para o Worker retornar 502/503.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error

def _post_json(url: str, payload: dict, headers: dict | None = None, timeout: int = 30) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={
        "Content-Type": "application/json",
        **(headers or {}),
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())

def call_vercel(prompt: str) -> dict | None:
    url = os.environ.get("VERCEL_AI_GATEWAY_URL") or os.environ.get("AI_GATEWAY_URL")
    token = os.environ.get("VERCEL_AI_GATEWAY_TOKEN") or os.environ.get("AI_GATEWAY_TOKEN")
    if not url or not token:
        return None
    # Vercel AI Gateway é OpenAI-compat: POST /v1/chat/completions
    try:
        res = _post_json(
            f"{url.rstrip('/')}/v1/chat/completions",
            {"model": os.environ.get("VERCEL_MODEL", "openai/gpt-4o-mini"), "messages": [{"role": "user", "content": prompt}], "temperature": 0},
            {"Authorization": f"Bearer {token}"},
        )
        text = res["choices"][0]["message"]["content"]
        return json.loads(text[text.find("{"): text.rfind("}")+1])
    except Exception as e:
        print(f"[golden-bridge] vercel failed: {e}", file=sys.stderr)
        return None

def call_local(prompt: str) -> dict | None:
    url = os.environ.get("LOCAL_LLM_URL", "http://10.88.0.10:1234/v1/chat/completions")
    token = os.environ.get("LOCAL_LLM_TOKEN") or os.environ.get("LAB512_GATEWAY_KEY", "")
    try:
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        # Ollama/mistral.rs OpenAI-compat; modelo Mistral-Nemo-12B Q4 no lab 512
        res = _post_json(
            url,
            {"model": os.environ.get("LOCAL_LLM_MODEL", "mistral-nemo-12b"), "messages": [{"role": "user", "content": prompt}], "temperature": 0, "stream": False},
            headers,
            timeout=60,
        )
        text = res["choices"][0]["message"]["content"] if "choices" in res else res.get("response", "")
        # LLM pode envolver em markdown
        s = text.find("{")
        e = text.rfind("}")
        if s != -1 and e != -1:
            return json.loads(text[s:e+1])
        return json.loads(text)
    except Exception as e:
        print(f"[golden-bridge] local failed: {e}", file=sys.stderr)
        return None

def main() -> int:
    req = json.load(sys.stdin)
    prompt = req.get("prompt") or req.get("prompt_text") or json.dumps(req, ensure_ascii=False)

    # ordem do lab 512: Vercel -> Cloudflare (feito no Worker) -> local
    # aqui só Vercel + local; CF fica no Worker via AI binding
    out = call_vercel(prompt)
    if out:
        json.dump(out, sys.stdout, ensure_ascii=False)
        return 0
    out = call_local(prompt)
    if out:
        json.dump(out, sys.stdout, ensure_ascii=False)
        return 0
    print(json.dumps({"error": "all providers failed — configure VERCEL_AI_GATEWAY or LOCAL_LLM_URL"}), file=sys.stderr)
    return 2

if __name__ == "__main__":
    sys.exit(main())
