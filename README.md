# KRESNA — Universal AI Chatbot Platform (V3)

KRESNA is a local-first, open-source chatbot builder for conversational FAQ/knowledge agents and Vehicle Intelligence agents. It combines an LLM-led conversational planner with a modular capability layer for document retrieval, registered REST connectors, and fleet telemetry providers.

## What is included

- **Unified conversational runtime**: LLM-led planning, contextual follow-up, structured memory, knowledge discovery, tool execution, observation, and bounded re-planning.
- **Knowledge / FAQ chatbots**: XLSX, CSV, PDF, DOCX, TXT, HTML and URL ingestion, SQLite FTS5 retrieval, optional Gemini embeddings and Qdrant hybrid search.
- **Multi-provider model gateway**: Gemini, Azure OpenAI, OpenAI-compatible endpoints, and local Ollama.
- **API Connectors**: registered REST endpoints, encrypted credentials, schema-guided arguments, SSRF checks, execution logs, and confirmation gates for write methods.
- **Vehicle Intelligence**: simulator, Traccar, Generic REST, Skyward Legacy adapter extension point, fleet tools, map and operational UI components.
- **Local MVP**: SQLite persistence, no registration/sign-in, Docker Desktop setup, and local backups.

## Quick start — Windows / Docker Desktop

1. Install and start Docker Desktop (Linux containers / WSL2 backend).
2. Open PowerShell in this project folder.
3. Run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\scripts\docker-up.ps1
```

4. Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Local admin mode is enabled; no registration is required.

The first build can take several minutes because Docker downloads Node, Ollama, and Qdrant images and installs the JavaScript dependencies.

## Choose an AI model

- **Azure OpenAI**: open **AI Models**, add an Azure OpenAI connection, enter endpoint, deployment name, API key and API version, then use **Save & Test Connection**.
- **Gemini**: add a Gemini key in `.env` as `GEMINI_API_KEY`, or configure a workspace BYOK key in **AI Models**.
- **Ollama**: pull a local chat model and an embedding model (commands below), then refresh installed models in **AI Models**.

```powershell
docker compose exec ollama ollama pull qwen2.5:7b
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama list
```

After pulling a model, select it in **AI Models** and test the connection before assigning it to a chatbot.

## Try the two chatbot types

- **KRESNA Support Concierge** — seeded with the existing LOGis Q&A knowledge when that data is present in the release database.
- **Nusantara Fleet Copilot** — seeded with a 22-unit simulator. Simulated values are clearly identified as simulator data and are not live FMS telemetry.

## Useful commands

```powershell
docker compose ps
docker compose logs --tail 150 kresna
docker compose restart kresna
docker compose down
.\scripts\backup.ps1
```

See [DEPLOYMENT.md](DEPLOYMENT.md) and [docs/ARCHITECTURE_V3.md](docs/ARCHITECTURE_V3.md) for detailed setup and engineering notes.

## Local-only security boundary

The default Compose file binds the app, Ollama and Qdrant to `127.0.0.1`. This release uses local single-user mode for MVP testing. Do not expose the dashboard or admin APIs to a public network. Multi-user registration/authentication is retained in the source but is not enabled in the local MVP configuration.
