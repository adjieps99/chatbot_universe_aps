# KRESNA V3 — Engineering Handover

## Scope delivered

This release merges the earlier LLM-led conversational planning pattern with the newer chatbot product code. It does not replace the UI, database model, model gateway, knowledge ingestion, connector registry, or vehicle provider modules.

## Key architecture decisions

1. **One runtime** for FAQ and Vehicle Intelligence.
2. **LLM decides the next step** through a structured planner function; backend code remains the enforcement boundary.
3. **Structured memory** restores objective/topic, user claims, verified facts, entities, pending questions, task state, tool history/results and confirmation state.
4. **Dynamic knowledge retrieval** can issue up to three focused queries and optionally target source IDs.
5. **Native provider function calling** is reused through the current gateway; valid JSON/plain-text fallback avoids hard failure on models that ignore function calls.
6. **Write confirmation** is enforced by backend metadata and HTTP method, not trusted to the model alone.
7. **Vehicle tools** are available only to the Vehicle Intelligence chatbot and only while `VEHICLE_INTELLIGENCE_ENABLED` is enabled.

## Changed files

See `docs/ARCHITECTURE_V3.md` for the complete list and runtime details.

## Database and data preservation

No destructive database migration was introduced. The current SQLite schema is retained. `conversation_memory.facts_json` stores a versioned structured-memory object and preserves top-level legacy facts for compatibility. The release database snapshot and uploaded sample files are retained from the supplied newer ZIP.

## Local verification status

The source was inspected and the agent runtime tests were updated to cover:

- Structured planner parsing.
- Dynamic knowledge retrieval.
- Structured memory persistence.
- Confirmation required before support-ticket creation.
- Execution only after a contextual confirmation.

**Independent execution status:** This build environment did not have the project npm dependencies installed and the package install attempt timed out. Docker CLI was also unavailable in the build environment. Therefore `npm test`, `npm run lint`, `npm run build`, and `docker compose up` have not been independently executed here. Do not interpret the presence of tests or Docker files as proof that those commands have passed. Run the verification steps in `DEPLOYMENT.md` on the target Docker Desktop machine.

## Known limitations

- The current Qdrant/Gemini embedding pipeline is retained; when embeddings are unavailable, lexical SQLite FTS5 retrieval remains available.
- Azure OpenAI chat is supported by the current gateway. Azure embedding configuration depends on the existing ingestion/retrieval implementation and should be validated separately before relying on semantic Azure embeddings.
- Vehicle providers and UI are preserved from the newer ZIP. A live Traccar or Generic REST connection still requires real endpoint details and successful connection testing.
- Skyward Legacy remains an extension point; no production Skyward endpoint or credentials are included.
- WhatsApp/Telegram and other external messaging channel webhooks remain outside this merge unless already implemented in the newer source.
- Local single-user mode is only for loopback testing. Do not expose it publicly.

## Suggested first-run validation

1. Run `scripts/docker-up.ps1`.
2. Verify `/api/health` and `docker compose ps`.
3. Configure/test Azure OpenAI or Gemini, or pull a local Ollama model.
4. Run one short FAQ answer, one multi-turn FAQ follow-up, one topic switch and return, and one ticket-confirmation scenario.
5. Run Vehicle Simulator questions with a plate reference followed by pronoun/implicit follow-ups.
6. Configure a real provider only after the simulator tests pass.
7. Run `npm test` and `npm run lint` in the container or local Node 22 environment before treating the release as validated.
