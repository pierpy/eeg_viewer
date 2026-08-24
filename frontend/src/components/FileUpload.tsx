import { useRef, useState } from "react";
import { uploadEdf } from "../api/client";
import type { FileInfo } from "../types";

interface Props {
  onLoaded: (info: FileInfo) => void;
}

export function FileUpload({ onLoaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const info = await uploadEdf(file);
      onLoaded(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="file-upload">
      <label className="file-upload__button">
        {busy ? "Caricamento..." : "Apri file .edf"}
        <input
          ref={inputRef}
          type="file"
          accept=".edf"
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
          hidden
        />
      </label>
      {error && <div className="file-upload__error">{error}</div>}
    </div>
  );
}
