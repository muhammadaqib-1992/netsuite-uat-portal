import { useState } from 'react';
import type { FileData } from '../types';
import { dataUrl } from '../lib/files';
import { Modal, errorText, useApi, useToast } from './ui';

/** A file name that opens the image from the File Cabinet (via the API) in a viewer. */
export function FileLink({ fileId, name }: { fileId: number; name: string }) {
  const api = useApi();
  const toast = useToast();
  const [file, setFile] = useState<FileData | null>(null);
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      setFile(await api.file(fileId));
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="file-link" onClick={open} disabled={busy}>
        📎 {busy ? 'Opening…' : name || 'Attachment'}
      </button>
      {file && (
        <Modal title={file.name} onClose={() => setFile(null)} wide>
          <div className="viewer">
            <img src={dataUrl(file)} alt={file.name} />
          </div>
          <p>
            <a className="btn btn-sm" href={dataUrl(file)} download={file.name}>
              Download
            </a>
          </p>
        </Modal>
      )}
    </>
  );
}
