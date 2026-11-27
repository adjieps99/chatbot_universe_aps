# KRESNA V3 — Unified Agent Runtime Architecture

## Design objective

Keep the LLM-led conversational experience of the earlier Universal AI Chatbot runtime while preserving the product integrations and UI from the newer `chatbot_universe` codebase.

The result is one runtime for `knowledge_faq` and `vehicle_intelligence`. Chatbot type controls the capabilities exposed to the planner; it does not select a separate conversation engine.

## Runtime loop

```text
User message
  -> workspace/chatbot-scoped conversation history
  -> structured memory load
  -> available knowledge + registered tool catalog
  -> LLM planner (submit_agent_plan function)
       -> retrieve_knowledge
       -> call_tool
       -> confirm_pending_tool
       -> ask_clarification
       -> escalate
       -> respond
  -> backend retrieval / validation / execution
  -> observation + verified memory update
  -> LLM re-evaluation (bounded, max 5 iterations by default)
  -> natural final response + citations + UI components
```

`submit_agent_plan` is a structured planning function. It is not an external tool and cannot execute a connector. Backend code resolves every requested tool name against the workspace/chatbot-scoped registry before any execution.

## Structured conversation memory

The new runtime restores and adapts the earlier memory model to the newer SQLite schema (`conversation_memory.summary`, `facts_json`, `updated_at`). The memory tracks:

- Active objective and topic.
- User-reported facts (not system-verified).
- Verified facts from successful tools.
- Extracted entities.
- Pending questions.
- Previous tool calls and actual results.
- Unresolved and paused tasks.
- Pending write confirmation.
- Frustration level.
- Provider-specific context facts, including the last vehicle identifier and coordinates.

The JSON storage is versioned as `__agentMemoryV3`. The current Phase-1 flat `facts_json` format remains readable and its top-level facts are retained.

## Knowledge intelligence

The LLM chooses whether knowledge retrieval is needed and can request up to three focused queries. It may constrain retrieval to one or more known source IDs. Retrieval uses the existing SQLite FTS5 and optional Qdrant/Gemini embedding implementation. Results are returned as observations with source title, excerpt, score and citation metadata.

Retrieved documents are evidence, not instructions. The planner is explicitly told not to obey prompt-like text embedded in documents or API responses.

## Tool registry and safety

Available tools are assembled per workspace and chatbot:

- Built-in support ticket creation.
- Enabled registered REST API connectors assigned to the chatbot or workspace.
- Vehicle telemetry tools only when the chatbot type is `vehicle_intelligence` and the feature flag is enabled.

The backend validates required fields and primitive types. Unknown tools cannot execute. Connector credentials remain in encrypted backend storage and are not included in the planner prompt. All connector requests continue through the SSRF guard.

Write methods (`POST`, `PUT`, `PATCH`, `DELETE`) and connectors explicitly marked `requires_confirmation` require a pending confirmation. The LLM must identify contextual user consent on a later turn before the backend executes. A pending write action is never automatically retried.

## Provider and model compatibility

The existing LLM gateway is retained. It supports Gemini, Azure OpenAI, OpenAI-compatible endpoints and Ollama. The planner uses the gateway's common function-calling interface to request a flat structured plan, then executes the selected capability in backend code. If a provider ignores function calling but returns valid JSON, the runtime has a JSON fallback; plain text is treated as a direct response, not as an executable action.

## Product capability preservation

The following newer modules remain in place: Azure OpenAI setup, Gemini BYOK, Ollama discovery, connectors UI, knowledge ingestion, vehicle provider registry, simulator, Traccar adapter, Generic REST/OpenAPI importer, Skyward Legacy extension point, MapLibre components, analytics, execution inspector, feedback and widget code.

## Operational limits

- Planner loop is bounded to five iterations by default and hard-capped at six.
- Knowledge retrieval is limited to three focused queries per retrieval action.
- Conversation context is limited to the latest 20 messages plus structured memory.
- Tool outputs persisted to memory are compacted; planner observations are truncated to bounded size.
- Local SQLite FTS5 remains the fallback when vector retrieval is unavailable.
- Skyward Legacy is an adapter extension point unless the actual approved endpoint/schema/credentials are configured and tested.
- The included fleet simulator is fictional demo data, not live FMS data.

## Files changed in V3

- `src/server/agent-runtime.ts` — LLM-led planner, bounded agent loop, dynamic retrieval, connector/vehicle tool selection, observation and synthesis.
- `src/server/agent-memory.ts` — structured memory model adapted to the current database schema, with flat Phase-1 memory compatibility.
- `src/server/llm-gateway.ts` — shared max-output-token handling for planner/final synthesis across providers.
- `src/server/gemini-gateway.ts` — Gemini generation token limit forwarding.
- `src/server/ollama-client.ts` — Ollama `num_predict` forwarding.
- `src/server/retrieval.ts` and `src/server/qdrant-client.ts` — optional source-specific retrieval filters.
- `src/server/agent-runtime.test.ts` — planner retrieval/memory and confirmation-gate regression tests.
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `scripts/docker-up.ps1` — local Docker deployment.
