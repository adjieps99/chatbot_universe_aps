import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDbFile = path.join(
  os.tmpdir(),
  `kresna-agent-v3-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);
process.env.KRESNA_DB_PATH = tempDbFile;
process.env.GEMINI_API_KEY = '';

test('Azure OpenAI URL builders format deployment and embeddings endpoints cleanly', async () => {
  const { buildAzureOpenAIChatUrl, buildAzureOpenAIEmbeddingsUrl } = await import('./llm-gateway.ts');
  assert.equal(
    buildAzureOpenAIChatUrl({
      endpoint: 'https://my-kresna-res.openai.azure.com/',
      deployment: 'gpt-4o-mini',
      apiVersion: '2024-10-21',
    }),
    'https://my-kresna-res.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21'
  );
  assert.equal(
    buildAzureOpenAIEmbeddingsUrl({
      endpoint: 'https://my-kresna-res.openai.azure.com',
      deployment: 'text-embedding-3-small',
      apiVersion: '2024-10-21',
    }),
    'https://my-kresna-res.openai.azure.com/openai/deployments/text-embedding-3-small/embeddings?api-version=2024-10-21'
  );
});

test('SSRF guard blocks private localhost and RFC1918 IP addresses', async () => {
  const { assertSafeExternalUrl } = await import('./ssrf.ts');
  await assert.rejects(() => assertSafeExternalUrl('http://127.0.0.1:8080/internal'), /SSRF/i);
  await assert.rejects(() => assertSafeExternalUrl('http://10.0.0.5/api'), /SSRF/i);
  await assert.rejects(() => assertSafeExternalUrl('http://192.168.1.10/status'), /SSRF/i);
  const safe = await assertSafeExternalUrl('https://api.example.com/v1/status');
  assert.equal(safe.hostname, 'api.example.com');
});

test('agent planner dynamically retrieves knowledge and retains structured conversational memory', async () => {
  const { getDb } = await import('./db.ts');
  const { ingestManualKnowledgeRecord } = await import('./knowledge-pipeline.ts');
  const { runAgentTurn, parseAgentPlanResponse } = await import('./agent-runtime.ts');
  const { loadConversationMemory } = await import('./agent-memory.ts');
  const { invokeLlmChat } = await import('./llm-gateway.ts');

  const db = getDb();
  const ws = db.prepare(`SELECT id FROM workspaces LIMIT 1`).get() as { id: string };
  const botRow = db.prepare(`SELECT * FROM chatbots WHERE chatbot_type = 'knowledge_faq' LIMIT 1`).get() as Record<string, unknown>;

  await ingestManualKnowledgeRecord({
    workspaceId: ws.id,
    chatbotId: String(botRow.id),
    title: 'UJP Waiting Process From SAP',
    sourceType: 'faq',
    content: [
      'Q: UJP tidak cair atau pending.',
      'A: Beberapa penyebab yang sering terjadi:',
      '- Status masih Waiting Process From SAP.',
      '- Rekening bank driver bermasalah atau nama tidak sesuai.',
      '- POD belum di-approve di menu Operation.',
    ].join('\n'),
  });

  const parsed = parseAgentPlanResponse({
    text: '',
    toolCalls: [{
      id: 'plan_1',
      name: 'submit_agent_plan',
      arguments: {
        decision: 'retrieve_knowledge',
        knowledge_queries_json: '[{"query":"UJP pending"}]',
      },
    }],
  });
  assert.equal(parsed?.decision, 'retrieve_knowledge');
  assert.equal(parsed?.knowledge_queries?.[0]?.query, 'UJP pending');

  const azureConn = {
    id: 'azure-test-conn',
    provider: 'azure_openai',
    auth_mode: 'byok',
    encrypted_api_key: null,
    endpoint: 'https://demo-azure.openai.azure.com',
    default_model: 'gpt-4o-mini',
    capabilities_json: JSON.stringify({ apiVersion: '2024-10-21' }),
  };

  let plannerCalls = 0;
  let capturedPlannerSystem = '';
  const fakeInvoker: typeof invokeLlmChat = async (request) => {
    plannerCalls += 1;
    capturedPlannerSystem = request.systemInstruction;
    assert.equal(request.tools?.[0]?.name, 'submit_agent_plan');
    if (plannerCalls === 1) {
      return {
        text: '',
        toolCalls: [{
          id: 'plan_retrieve',
          name: 'submit_agent_plan',
          arguments: {
            decision: 'retrieve_knowledge',
            plan_summary: 'Mencari sumber terkait UJP.',
            knowledge_queries_json: JSON.stringify([{ query: 'UJP belum cair Waiting Process From SAP' }]),
            memory_patch_json: JSON.stringify({
              currentObjective: 'Menyelesaikan kendala UJP belum cair',
              currentTopic: 'UJP',
              userReportedFacts: [{ key: 'ujp_status', value: 'belum cair' }],
              extractedEntities: { process: 'UJP' },
            }),
          },
        }],
        inputTokens: 120,
        outputTokens: 35,
      };
    }
    return {
      text: '',
      toolCalls: [{
        id: 'plan_respond',
        name: 'submit_agent_plan',
        arguments: {
          decision: 'respond',
          plan_summary: 'Menjawab berdasarkan knowledge yang ditemukan.',
          direct_response: 'UJP bisa tertahan jika status masih Waiting Process From SAP, rekening driver bermasalah, atau POD belum di-approve. Saat ini status yang terlihat di menu UJP Monitoring apa?',
          suggested_followups_json: JSON.stringify(['Waiting Process From SAP', 'Rekening driver bermasalah', 'POD belum di-approve']),
        },
      }],
      inputTokens: 140,
      outputTokens: 58,
    };
  };

  const turn = await runAgentTurn({
    workspaceId: ws.id,
    chatbot: {
      id: String(botRow.id),
      workspace_id: ws.id,
      public_bot_id: String(botRow.public_bot_id),
      name: String(botRow.name),
      purpose: String(botRow.purpose),
      preset: 'customer_support',
      chatbot_type: 'knowledge_faq',
      language: 'Indonesian',
      style: String(botRow.style || ''),
      escalation_mode: String(botRow.escalation_mode || ''),
      system_instructions: '',
      welcome_message: '',
      model_connection_id: azureConn.id,
      model_id: 'gpt-4o-mini',
      max_output_tokens: 1024,
    },
    connection: azureConn,
    userMessage: 'UJP saya belum cair padahal sudah diajukan',
    channelType: 'playground',
    externalUserId: 'tester@kresna.local',
    llmInvoker: fakeInvoker,
  });

  assert.equal(plannerCalls, 2);
  assert.match(capturedPlannerSystem, /MEMORY TERSTRUKTUR/);
  assert.match(capturedPlannerSystem, /submit_agent_plan/);
  assert.match(turn.assistantMessage.content, /Waiting Process From SAP/);
  assert.ok(turn.trace.retrievalSources.length > 0);
  assert.equal(turn.assistantMessage.suggestedFollowups.length, 3);

  const memory = loadConversationMemory(turn.conversationId);
  assert.equal(memory.currentTopic, 'UJP');
  assert.equal(memory.extractedEntities.process, 'UJP');
  assert.equal(memory.userReportedFacts[0]?.value, 'belum cair');
});

test('write tools require explicit confirmation and execute only after confirmation', async (t) => {
  t.after(() => cleanupDb());
  const { getDb } = await import('./db.ts');
  const { runAgentTurn } = await import('./agent-runtime.ts');
  const { loadConversationMemory } = await import('./agent-memory.ts');
  const { invokeLlmChat } = await import('./llm-gateway.ts');

  const db = getDb();
  const ws = db.prepare(`SELECT id FROM workspaces LIMIT 1`).get() as { id: string };
  const botRow = db.prepare(`SELECT * FROM chatbots WHERE chatbot_type = 'knowledge_faq' LIMIT 1`).get() as Record<string, unknown>;
  const connection = {
    id: 'azure-test-conn', provider: 'azure_openai', auth_mode: 'byok', encrypted_api_key: null,
    endpoint: 'https://demo-azure.openai.azure.com', default_model: 'gpt-4o-mini',
    capabilities_json: JSON.stringify({ apiVersion: '2024-10-21' }),
  };
  const chatbot = {
    id: String(botRow.id), workspace_id: ws.id, public_bot_id: String(botRow.public_bot_id),
    name: String(botRow.name), purpose: String(botRow.purpose), preset: 'customer_support' as const,
    chatbot_type: 'knowledge_faq' as const, language: 'Indonesian', style: '', escalation_mode: '',
    system_instructions: '', welcome_message: '', model_connection_id: connection.id,
    model_id: 'gpt-4o-mini', max_output_tokens: 1024,
  };

  let firstTurnCalls = 0;
  const firstTurnInvoker: typeof invokeLlmChat = async () => {
    firstTurnCalls += 1;
    if (firstTurnCalls === 1) {
      return {
        text: '', inputTokens: 100, outputTokens: 30,
        toolCalls: [{
          id: 'plan_ticket', name: 'submit_agent_plan',
          arguments: {
            decision: 'call_tool',
            tool_name: 'create_support_ticket',
            tool_arguments_json: JSON.stringify({ subject: 'Pool out tidak bisa', summary: 'Pengguna tidak dapat melakukan pool out dan tidak ada pesan error.' }),
            plan_summary: 'Menyiapkan tiket support.',
          },
        }],
      };
    }
    return {
      text: '', inputTokens: 100, outputTokens: 30,
      toolCalls: [{
        id: 'plan_confirm_prompt', name: 'submit_agent_plan',
        arguments: {
          decision: 'respond',
          direct_response: 'Saya sudah rangkum kendalanya: pool out tidak bisa dilakukan dan tidak ada pesan error. Apakah saya boleh membuat tiket support dengan ringkasan tersebut?',
        },
      }],
    };
  };

  const proposed = await runAgentTurn({
    workspaceId: ws.id, chatbot, connection, userMessage: 'Buatkan tiket untuk pool out saya yang tidak bisa.',
    channelType: 'playground', externalUserId: 'tester@kresna.local', llmInvoker: firstTurnInvoker,
  });
  assert.match(proposed.assistantMessage.content, /boleh membuat tiket/i);
  assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM support_tickets WHERE conversation_id = ?`).get(proposed.conversationId) as { count: number }).count, 0);
  assert.equal(loadConversationMemory(proposed.conversationId).pendingConfirmation?.toolName, 'create_support_ticket');

  let confirmCalls = 0;
  const confirmInvoker: typeof invokeLlmChat = async () => {
    confirmCalls += 1;
    if (confirmCalls === 1) {
      return {
        text: '', inputTokens: 100, outputTokens: 30,
        toolCalls: [{ id: 'plan_execute', name: 'submit_agent_plan', arguments: { decision: 'confirm_pending_tool', plan_summary: 'Pengguna mengonfirmasi pembuatan tiket.' } }],
      };
    }
    return {
      text: '', inputTokens: 100, outputTokens: 30,
      toolCalls: [{ id: 'plan_done', name: 'submit_agent_plan', arguments: { decision: 'respond', direct_response: 'Tiket support berhasil dibuat. Nomor tiket sudah tersimpan di riwayat percakapan.' } }],
    };
  };

  const confirmed = await runAgentTurn({
    workspaceId: ws.id, chatbot, connection, userMessage: 'Ya, buatkan.',
    channelType: 'playground', externalUserId: 'tester@kresna.local', conversationId: proposed.conversationId,
    llmInvoker: confirmInvoker,
  });
  assert.match(confirmed.assistantMessage.content, /berhasil dibuat/i);
  assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM support_tickets WHERE conversation_id = ?`).get(proposed.conversationId) as { count: number }).count, 1);
  assert.equal(loadConversationMemory(proposed.conversationId).pendingConfirmation, null);
  assert.ok(loadConversationMemory(proposed.conversationId).actualToolResults.some((result) => result.toolName === 'create_support_ticket' && result.ok));
});

function cleanupDb() {
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(`${tempDbFile}${suffix}`)) fs.rmSync(`${tempDbFile}${suffix}`, { force: true });
  }
}
