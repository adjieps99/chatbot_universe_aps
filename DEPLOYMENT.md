# KRESNA V3 — Docker Desktop Deployment Guide

This guide deploys KRESNA locally on Windows 10/11 using Docker Desktop and PowerShell. The default profile is for local MVP testing only: SQLite persistence, local single-user mode, and no registration/sign-in.

## 1. Prerequisites

- Windows 10/11.
- Docker Desktop with the WSL2 backend enabled.
- Docker Compose v2 (`docker compose version`).
- At least 8 GB RAM recommended if running Ollama locally; more RAM is needed for larger local models.

Verify Docker:

```powershell
docker version
docker info --format '{{.OSType}}'
docker compose version
```

`docker info` should report `linux` for `OSType`.

## 2. One-command startup

Open PowerShell in the extracted project root and run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\scripts\docker-up.ps1
```

The script:

1. Creates `.env` from `.env.example` if needed.
2. Generates a persistent 32-byte encryption key if `KRESNA_ENCRYPTION_KEY` is empty.
3. Builds the KRESNA image.
4. Starts KRESNA, Ollama and Qdrant.
5. Waits for `/api/health`.
6. Opens `http://127.0.0.1:3000`.

No user registration or sign-in is required in this local MVP mode.

## 3. Verify the stack

```powershell
docker compose ps
docker compose logs --tail 100 kresna
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Expected services:

- `kresna-app` — application and local SQLite database.
- `kresna-ollama` — optional local model runtime, ready for model pulls.
- `kresna-qdrant` — optional vector index for semantic retrieval.

SQLite FTS5 retrieval remains available even if Qdrant is unavailable. Gemini or Azure OpenAI can be used without pulling a local chat model.

## 4. Configure an AI model

### Azure OpenAI

Open **AI Models** → **Connect Azure OpenAI / Custom LLM** and provide:

- Connection name — any descriptive name.
- Endpoint — your Azure OpenAI resource endpoint, for example `https://<resource-name>.openai.azure.com`.
- Deployment name — the exact deployment name created in Azure AI Foundry, not just the base model family.
- API key — KEY 1 or KEY 2 from the Azure resource.
- API version — use the version supported by your Azure resource; the UI default may be retained if it matches your endpoint.
- Embedding deployment — optional. Configure a compatible embedding deployment if you want provider-side embeddings; SQLite FTS5 remains the lexical fallback.

Click **Save & Test Connection**. Select the connection/model for the chatbot after the test succeeds.

### Gemini

For server-managed Gemini, edit `.env` and set:

```text
GEMINI_API_KEY=your-gemini-api-key
```

Then restart the app:

```powershell
docker compose up -d --force-recreate kresna
```

Alternatively, use a workspace BYOK Gemini connection from **AI Models**.

### Local Ollama

Pull a chat model and embedding model:

```powershell
docker compose exec ollama ollama pull qwen2.5:7b
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama list
```

Then open **AI Models** → **Refresh Installed Models**, test the connection and select the model.

## 5. Test the conversational runtime

Use **My Chatbots → Playground**.

Suggested FAQ test:

1. Ask a domain-specific question from the uploaded knowledge.
2. Answer the agent's clarification with a short contextual reply.
3. Change topic, then return to the previous issue.
4. Ask a follow-up that references an entity from the previous turn.
5. Ask the agent to create a support ticket and verify that it requests confirmation before writing.

Suggested Vehicle Intelligence test:

1. Open **Nusantara Fleet Copilot**.
2. Ask for the position of one simulator vehicle.
3. Ask “sudah berapa lama di sana?” without repeating the plate.
4. Ask for nearby vehicles.
5. Ask for trip history or device health and check whether the selected provider supports the capability.

The simulator is fictional demo data. It must not be represented as live Astra FMS telemetry.

## 6. Configure a real vehicle provider

Open **Vehicle Providers** for the Vehicle Intelligence chatbot.

- **Traccar**: enter the Traccar server URL and supported authentication credentials, test the connection, then map device identifiers to KRESNA vehicle records.
- **Generic REST**: configure the base URL, endpoint definitions, authentication, response mapping, and required fields. Use the OpenAPI/Swagger importer where applicable.
- **Skyward Legacy**: the adapter extension point is retained. A live connection requires the actual approved Skyward endpoints, schema, credentials, and network access. Do not treat the extension point as a verified live integration.

Credentials are stored server-side and encrypted at rest. Never paste credentials into chatbot knowledge documents or prompts.

If the FMS API uses a private RFC1918 address, the SSRF guard may reject it by default. Only for a trusted local development environment, review the endpoint and explicitly set `ALLOW_PRIVATE_CONNECTORS=true` in `.env`; never use this as a blanket production setting.

## 7. Backup and restore

Create a consistent SQLite and upload backup:

```powershell
.\scripts\backup.ps1
```

Restore a backup:

```powershell
.\scripts\restore.ps1 -BackupDir .\backups\<timestamp>
```

Keep `.env` and the backup folder private. The encryption key in `.env` is required to decrypt stored connector and model credentials after restore.

## 8. Common operations

```powershell
# View services
docker compose ps

# Follow app logs
docker compose logs -f kresna

# Restart app only
docker compose restart kresna

# Rebuild after source changes
docker compose up -d --build

# Stop services without deleting persistent volumes
docker compose down

# Stop and DELETE all local database/model/vector volumes (destructive)
# Do not run unless you intentionally want to reset all local data.
docker compose down -v
```

## 9. Local security notes

- The app is bound to `127.0.0.1:3000`; Ollama and Qdrant are also bound to loopback.
- Local single-user mode bypasses the login screen. Anyone who can access the local machine/browser session can use the local workspace.
- Do not expose this stack through a public reverse proxy or public tunnel while local single-user mode is enabled.
- Keep `.env`, database backups and uploaded files private.
- Write API connector methods (`POST`, `PUT`, `PATCH`, `DELETE`) are confirmation-gated in the agent runtime. Backend authorization and SSRF validation remain authoritative.
