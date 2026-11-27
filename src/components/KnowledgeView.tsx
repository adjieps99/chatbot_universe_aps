import { useEffect, useState } from 'react';
import {
  BookOpen,
  Eye,
  FileSpreadsheet,
  FileUp,
  Globe,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ChatbotRecord, KnowledgeItem } from '../types';

interface KnowledgeViewProps {
  chatbots: ChatbotRecord[];
}

interface ChunkPreviewItem {
  id: string;
  chunk_index: number;
  content: string;
  token_estimate: number;
}

export function KnowledgeView({ chatbots }: KnowledgeViewProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [selectedBotId, setSelectedBotId] = useState(chatbots[0]?.id || '');
  const [urlInput, setUrlInput] = useState('');
  const [faqTitle, setFaqTitle] = useState('');
  const [faqContent, setFaqContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<{
    mode: string;
    chunks: Array<{ chunkId: string; title: string; content: string; score: number }>;
  } | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewChunks, setPreviewChunks] = useState<ChunkPreviewItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadItems = async () => {
    const res = await apiFetch<{ items: KnowledgeItem[] }>('/api/knowledge');
    setItems(res.items);
  };

  useEffect(() => {
    if (!selectedBotId && chatbots[0]?.id) setSelectedBotId(chatbots[0].id);
    void loadItems();
  }, [chatbots.length]);

  const handleFileUpload = async (file: File | undefined) => {
    if (!file || !selectedBotId) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const fd = new FormData();
      fd.append('chatbotId', selectedBotId);
      fd.append('file', file);
      await apiFetch('/api/knowledge/upload', { method: 'POST', body: fd });
      setMessage(`Uploaded and indexed "${file.name}".`);
      await loadItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'File upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleImportSampleLogis = async () => {
    if (!selectedBotId) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await apiFetch<{ indexing: { chunkCount: number } }>(
        '/api/knowledge/import-sample-logis',
        {
          method: 'POST',
          body: JSON.stringify({ chatbotId: selectedBotId }),
        }
      );
      setMessage(
        `Imported LOGis QnA spreadsheet (logis.xlsx) — ${res.indexing.chunkCount} Q&A row chunks indexed.`
      );
      await loadItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import logis.xlsx.');
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewChunks = async (item: KnowledgeItem) => {
    setError('');
    try {
      const res = await apiFetch<{ chunks: ChunkPreviewItem[] }>(
        `/api/knowledge/${encodeURIComponent(item.id)}/chunks`
      );
      setPreviewTitle(item.title);
      setPreviewChunks(res.chunks);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load chunks.');
    }
  };

  const handleUrlIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || !selectedBotId) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/knowledge/url', {
        method: 'POST',
        body: JSON.stringify({ chatbotId: selectedBotId, url: urlInput.trim() }),
      });
      setUrlInput('');
      setMessage('Website crawled and indexed.');
      await loadItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'URL ingestion failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleFaqSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqTitle.trim() || !faqContent.trim() || !selectedBotId) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/chatbots/${encodeURIComponent(selectedBotId)}/knowledge`, {
        method: 'POST',
        body: JSON.stringify({ title: faqTitle, content: faqContent, sourceType: 'faq' }),
      });
      setFaqTitle('');
      setFaqContent('');
      setMessage('FAQ entry added and indexed.');
      await loadItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add FAQ.');
    } finally {
      setBusy(false);
    }
  };

  const handleTestRetrieval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBotId || !searchQuery.trim()) return;
    const res = await apiFetch<{
      mode: string;
      chunks: Array<{ chunkId: string; title: string; content: string; score: number }>;
    }>('/api/knowledge/test-retrieval', {
      method: 'POST',
      body: JSON.stringify({ chatbotId: selectedBotId, query: searchQuery.trim() }),
    });
    setSearchResult(res);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Knowledge Base & Hybrid RAG</h1>
          <p className="text-sm text-slate-500">
            Ingest XLSX, CSV, PDF, DOCX, HTML, web URLs, or manual FAQs into SQLite FTS5 + Vector chunks.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={busy || !selectedBotId}
            onClick={handleImportSampleLogis}
            className="inline-flex items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Sample logis.xlsx
          </button>
          <select
            aria-label="Target chatbot for knowledge"
            value={selectedBotId}
            onChange={(e) => setSelectedBotId(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800"
          >
            {chatbots.map((b) => (
              <option key={b.id} value={b.id}>
                Target Bot: {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <FileUp className="h-4 w-4 text-blue-600" />
            Upload Document
          </div>
          <p className="text-xs text-slate-500">Supports .xlsx, .csv, .pdf, .docx, .txt, .html up to 15 MB.</p>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:border-blue-400 hover:bg-blue-50/40">
            <span className="text-xs font-semibold text-slate-700">
              {busy ? 'Processing...' : 'Click to choose file'}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.docx,.txt,.md,.html,.htm"
              disabled={busy}
              onChange={(e) => void handleFileUpload(e.target.files?.[0])}
              className="hidden"
            />
          </label>
        </div>

        <form onSubmit={handleUrlIngest} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Globe className="h-4 w-4 text-blue-600" />
            Crawl Website URL
          </div>
          <input
            aria-label="Website URL to crawl"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/docs/faq"
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !urlInput.trim()}
            className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Fetch & Index URL
          </button>
        </form>

        <form onSubmit={handleFaqSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Plus className="h-4 w-4 text-blue-600" />
            Add Manual FAQ / Note
          </div>
          <input
            aria-label="FAQ title"
            value={faqTitle}
            onChange={(e) => setFaqTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
          />
          <textarea
            aria-label="FAQ content"
            rows={2}
            value={faqContent}
            onChange={(e) => setFaqContent(e.target.value)}
            placeholder="Answer or policy details..."
            className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !faqTitle.trim() || !faqContent.trim()}
            className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Save Knowledge
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Search className="h-4 w-4 text-blue-600" />
          Hybrid Retrieval Tester
        </div>
        <form onSubmit={handleTestRetrieval} className="flex gap-2">
          <input
            aria-label="Retrieval test query"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Enter a test query (e.g. UJP pending SAP, POD approval, OBD offline)..."
            className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Test Query
          </button>
        </form>
        {searchResult && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Mode: <span className="font-mono">{searchResult.mode}</span> · {searchResult.chunks.length} match(es)
            </p>
            {searchResult.chunks.map((c) => (
              <div key={c.chunkId} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>{c.title}</span>
                  <span className="font-mono text-blue-700">score {c.score}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-600">{c.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
          <BookOpen className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-900">Indexed Sources ({items.length})</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="text-xs text-slate-500">
                  {item.chatbot_name || 'Chatbot'} · {item.source_type.toUpperCase()} · {item.chunk_count} chunks · {item.status}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handlePreviewChunks(item)}
                  aria-label={`Inspect chunks for ${item.title}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Inspect Chunks
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/knowledge/${item.id}/reindex`, { method: 'POST' });
                    await loadItems();
                  }}
                  aria-label={`Reindex ${item.title}`}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/knowledge/${item.id}`, { method: 'DELETE' });
                    await loadItems();
                  }}
                  aria-label={`Delete ${item.title}`}
                  className="rounded-lg border border-slate-200 p-2 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">No knowledge items uploaded yet.</div>
          )}
        </div>
      </div>

      {previewChunks !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Indexed Chunks — {previewTitle}</h3>
                <p className="text-xs text-slate-500">Showing {previewChunks.length} stored chunk(s)</p>
              </div>
              <button
                type="button"
                aria-label="Close chunk preview"
                onClick={() => setPreviewChunks(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
              {previewChunks.map((ch) => (
                <div key={ch.id} className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                  <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-slate-500">
                    <span>Chunk #{ch.chunk_index + 1}</span>
                    <span>~{ch.token_estimate} tokens</span>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">{ch.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
