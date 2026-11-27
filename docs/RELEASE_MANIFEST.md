# Release Manifest — KRESNA V3.0.0

## Base

- Product source: newer `chatbot_universe.zip` supplied by the user.
- Conversational reference: earlier `kresna-—-universal-ai-chatbot-platform.zip` supplied by the user.
- User-provided vehicle expansion requirements: preserved in the current product modules and deployment guide.

## Data retained from the newer source

- Existing local workspace and two seeded chatbots.
- Existing `logis.xlsx` knowledge item and its 47 atomic chunks.
- Existing workspace-level weather REST connector.
- Existing 22-unit Vehicle Intelligence simulator configuration.
- Existing model connection records. No API keys or connector credentials were present in the source database snapshot.

## Release changes

- Replaced the fixed pre-retrieval-first runtime with a single LLM-led planner loop.
- Restored structured conversational memory in the current SQLite schema.
- Added dynamic multi-query knowledge retrieval and source filtering.
- Preserved the newer provider gateway and vehicle/API tool execution modules.
- Added confirmation gating for write connectors and support-ticket creation.
- Added Dockerfile, Docker Compose, `.env.example`, PowerShell bootstrap, backup and restore guidance.

## Verification evidence

- Changed TypeScript files: syntax-transpilation checks passed.
- Changed runtime/memory/gateway/retrieval/test files: isolated TypeScript type-check passed using temporary declarations for unavailable external package types.
- Node tests executed with temporary external-module stubs: 18 passed, 0 failed across agent runtime, crypto, database, vehicle, and shared logic tests.
- `docker-compose.yml`: YAML parsing passed.
- Full npm dependency installation, full npm test suite (including real XLSX parser test), Vite production build, and Docker image startup were not executed in this build environment because npm installation timed out and Docker CLI was unavailable.

## Important

The included simulator is fictional demo data. Skyward Legacy is not a verified production connection. Configure and test real Azure/Gemini/Ollama and FMS credentials locally before operational use.
