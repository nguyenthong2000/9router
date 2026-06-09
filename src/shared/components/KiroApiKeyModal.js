"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Modal, Button } from "@/shared/components";

/**
 * Kiro API Key Modal
 * Add one or more Kiro API keys (ksk_...). Each key is validated against
 * Kiro's getUsageLimits endpoint (no credit cost) before being saved, and a
 * per-key result is shown. Keys are stored as apikey connections.
 */
export default function KiroApiKeyModal({ isOpen, onSuccess, onClose }) {
  const [input, setInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const reset = () => {
    setInput("");
    setError(null);
    setResults(null);
    setImporting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Count distinct candidate keys for the button label.
  const keyCount = input
    .split(/[\s,]+/)
    .map((k) => k.trim())
    .filter(Boolean).length;

  const handleImport = async () => {
    try {
      setError(null);
      setResults(null);
      setImporting(true);

      const res = await fetch("/api/oauth/kiro/import-apikey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeys: input }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      setResults(data);
      if (data.imported > 0 && onSuccess) onSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title="Add Kiro API Keys" onClose={handleClose} size="lg">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          Paste one or more Kiro API keys (
          <code className="px-1 bg-black/5 dark:bg-white/5 rounded">ksk_…</code>),
          one per line. Each key is validated against your Kiro account before
          it is saved.
        </p>

        <div>
          <p className="text-sm font-medium mb-2">
            API keys{keyCount > 0 ? ` (${keyCount})` : ""}
          </p>
          <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); setResults(null); }}
            placeholder={"ksk_xxxxxxxxxxxxxxxxxxxx\nksk_yyyyyyyyyyyyyyyyyyyy"}
            rows={8}
            className="w-full px-3 py-2 bg-surface rounded border border-border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 resize-y"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded bg-red-500/10 text-red-600 dark:text-red-400 text-sm">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {results && (
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">
              {results.imported} added · {results.failed} failed
            </div>
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
              {results.results.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                    r.success
                      ? "bg-green-500/10 text-green-700 dark:text-green-400"
                      : "bg-red-500/10 text-red-600 dark:text-red-400"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {r.success ? "check_circle" : "cancel"}
                  </span>
                  <code className="font-mono">{r.key}</code>
                  {r.success ? (
                    <span className="text-text-muted">
                      {r.plan || "OK"}
                      {r.creditsLimit != null
                        ? ` · ${r.creditsUsed ?? 0}/${r.creditsLimit} credits`
                        : ""}
                    </span>
                  ) : (
                    <span>{r.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleImport}
            fullWidth
            disabled={importing || keyCount === 0}
            loading={importing}
          >
            {importing
              ? "Validating…"
              : `Add${keyCount > 0 ? ` ${keyCount} key${keyCount > 1 ? "s" : ""}` : ""}`}
          </Button>
          <Button onClick={handleClose} variant="ghost" fullWidth>
            {results ? "Done" : "Cancel"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

KiroApiKeyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onSuccess: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
