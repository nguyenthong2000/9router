"use client";

import { useState, useRef } from "react";
import PropTypes from "prop-types";
import { Modal, Button } from "@/shared/components";

/**
 * Codex Import JSON Modal
 * Import a full Codex CLI auth.json (~/.codex/auth.json) — either by
 * selecting a file or pasting the JSON. Creates an OAuth connection with
 * refresh token support (so 9router can auto-refresh the account).
 */
export default function CodexImportModal({ isOpen, onSuccess, onClose }) {
  const [jsonInput, setJsonInput] = useState("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const reset = () => {
    setJsonInput("");
    setFileName("");
    setError(null);
    setImporting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setJsonInput(String(event.target?.result || ""));
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  };

  const handleImport = async () => {
    try {
      setError(null);
      setImporting(true);

      let parsed;
      try {
        parsed = JSON.parse(jsonInput.trim());
      } catch {
        throw new Error("Invalid JSON format");
      }

      if (!parsed.access_token && !parsed.accessToken) {
        throw new Error("JSON must contain an access_token field");
      }

      const res = await fetch("/api/oauth/codex/import-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      reset();
      if (onSuccess) onSuccess(data.connection);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title="Import Codex JSON" onClose={handleClose} size="lg">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          Import a full Codex CLI credential file (
          <code className="px-1 bg-black/5 dark:bg-white/5 rounded">~/.codex/auth.json</code>).
          This imports the refresh token so 9router can auto-refresh the account.
        </p>

        {/* File picker */}
        <div>
          <p className="text-sm font-medium mb-2">Option 1: Choose a JSON file</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <span className="material-symbols-outlined text-[18px] mr-1">upload_file</span>
              Select File
            </Button>
            {fileName && (
              <span className="text-xs text-text-muted truncate">{fileName}</span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-text-muted uppercase tracking-wider">Or paste JSON</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Paste */}
        <div>
          <p className="text-sm font-medium mb-2">Option 2: Paste the JSON content</p>
          <textarea
            value={jsonInput}
            onChange={(e) => { setJsonInput(e.target.value); setFileName(""); }}
            placeholder='{ "access_token": "...", "refresh_token": "...", "id_token": "...", ... }'
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

        <div className="flex gap-2">
          <Button onClick={handleImport} fullWidth disabled={importing || !jsonInput.trim()} loading={importing}>
            {importing ? "Importing…" : "Import"}
          </Button>
          <Button onClick={handleClose} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

CodexImportModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onSuccess: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
