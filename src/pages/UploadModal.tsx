import { useCallback, useRef, useState } from 'react';
import { presignFiles } from '../api/resources';
import { CONFIG } from '../config';
import axios from 'axios';

interface UploadFile {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  cloudfrontUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

interface Props {
  bucketId: string;
  prefix: string;
  existingFiles?: string[];
  onClose: () => void;
  onUploaded: () => void;
}

export default function UploadModal({ bucketId, prefix, existingFiles = [], onClose, onUploaded }: Props) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const newFiles: UploadFile[] = [];
    for (const file of Array.from(incoming)) {
      if (file.size > CONFIG.upload.maxFileSizeBytes) {
        newFiles.push({ file, status: 'error', progress: 0, error: `Exceeds ${CONFIG.upload.maxFileSizeMB}MB limit` });
      } else {
        newFiles.push({ file, status: 'pending', progress: 0 });
      }
    }
    setFiles(prev => [...prev, ...newFiles]);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  function handleUploadClick() {
    const eligible = files.filter(f => f.status === 'pending');
    if (eligible.length === 0) return;
    const dupes = eligible.map(f => f.file.name).filter(name => existingFiles.includes(name));
    if (dupes.length > 0) {
      setDuplicateWarning(dupes);
      return;
    }
    startUpload();
  }

  async function startUpload() {
    setDuplicateWarning([]);
    const eligible = files.filter(f => f.status === 'pending');
    if (eligible.length === 0) return;

    setUploading(true);

    // Get presigned URLs for all eligible files at once
    let presigned: Array<{ presignedUrl: string; cloudfrontUrl: string; thumbnailUrl: string; filename: string }>;
    try {
      presigned = await presignFiles(eligible.map(f => ({
        bucketId,
        path: prefix,
        filename: f.file.name,
        size: f.file.size,
        contentType: f.file.type || 'application/octet-stream',
      })));
    } catch (err: any) {
      setFiles(prev => prev.map(f =>
        f.status === 'pending' ? { ...f, status: 'error', error: 'Failed to get upload URL' } : f
      ));
      setUploading(false);
      return;
    }

    // Upload all files in parallel
    await Promise.all(eligible.map(async (uploadFile, i) => {
      const { presignedUrl, cloudfrontUrl, thumbnailUrl } = presigned[i];

      setFiles(prev => prev.map(f =>
        f.file === uploadFile.file ? { ...f, status: 'uploading' } : f
      ));

      try {
        await axios.put(presignedUrl, uploadFile.file, {
          headers: { 'Content-Type': uploadFile.file.type || 'application/octet-stream', 'Content-Disposition': 'inline' },
          onUploadProgress: (e) => {
            const pct = Math.round((e.loaded / (e.total || uploadFile.file.size)) * 100);
            setFiles(prev => prev.map(f =>
              f.file === uploadFile.file ? { ...f, progress: pct } : f
            ));
          },
        });

        setFiles(prev => prev.map(f =>
          f.file === uploadFile.file ? { ...f, status: 'done', progress: 100, cloudfrontUrl, thumbnailUrl } : f
        ));
      } catch {
        setFiles(prev => prev.map(f =>
          f.file === uploadFile.file ? { ...f, status: 'error', error: 'Upload failed' } : f
        ));
      }
    }));

    setUploading(false);
    setDone(true);
    onUploaded();
  }

  const pendingCount = files.filter(f => f.status === 'pending').length;

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget && !uploading) onClose(); }}>
      <div style={s.modal}>
        <div style={s.header}>
          <h2 style={s.title}>Upload Files</h2>
          {!uploading && <button style={s.closeBtn} onClick={onClose}>✕</button>}
        </div>

        {/* Drop zone */}
        {!done && (
          <div
            style={{ ...s.dropZone, ...(dragging ? s.dropZoneActive : {}) }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
            <p style={s.dropText}>Drag & drop files here or <span style={s.dropLink}>browse</span></p>
            <p style={s.dropHint}>Max {CONFIG.upload.maxFileSizeMB}MB per file</p>
          </div>
        )}

        {/* File list */}
        {files.length > 0 && (
          <div style={s.fileList}>
            {files.map((f, i) => (
              <div key={i} style={s.fileRow}>
                <div style={s.fileRowLeft}>
                  <span style={s.fileRowName}>{f.file.name}</span>
                  <span style={s.fileRowSize}>{(f.file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <div style={s.fileRowRight}>
                  {f.status === 'pending' && !uploading && (
                    <button style={s.removeBtn} onClick={() => removeFile(i)}>✕</button>
                  )}
                  {f.status === 'uploading' && (
                    <div style={s.progressBar}>
                      <div style={{ ...s.progressFill, width: `${f.progress}%` }} />
                    </div>
                  )}
                  {f.status === 'done' && <span style={s.statusDone}>✓ Done</span>}
                  {f.status === 'error' && <span style={s.statusError}>{f.error}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Duplicate warning */}
        {duplicateWarning.length > 0 && (
          <div style={s.dupeWarning}>
            <p style={s.dupeTitle}>⚠ These files already exist in this folder:</p>
            <ul style={s.dupeList}>
              {duplicateWarning.map(name => <li key={name} style={s.dupeItem}>{name}</li>)}
            </ul>
            <p style={s.dupeHint}>Uploading will overwrite the existing files.</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button style={s.btnSecondary} onClick={() => setDuplicateWarning([])}>Go back</button>
              <button style={{ ...s.btnPrimary, background: '#EF4444' }} onClick={startUpload}>Overwrite & Upload</button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={s.footer}>
          {done ? (
            <button style={s.btnPrimary} onClick={onClose}>Close</button>
          ) : (
            <>
              <button style={s.btnSecondary} onClick={onClose} disabled={uploading}>Cancel</button>
              <button
                style={{ ...s.btnPrimary, opacity: pendingCount === 0 || uploading ? 0.5 : 1 }}
                disabled={pendingCount === 0 || uploading}
                onClick={handleUploadClick}
              >
                {uploading ? 'Uploading...' : `Upload ${pendingCount > 0 ? pendingCount : ''} File${pendingCount !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '14px', width: '560px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #E2E8F0' },
  title: { margin: 0, fontSize: '17px', fontWeight: '700', color: '#1E293B' },
  closeBtn: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94A3B8', lineHeight: 1 },
  dropZone: {
    margin: '20px 24px 0', border: '2px dashed #CBD5E1', borderRadius: '10px',
    padding: '36px 20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
  },
  dropZoneActive: { borderColor: '#3B82F6', background: '#EFF6FF' },
  dropText: { margin: '0 0 6px', fontSize: '14px', color: '#475569' },
  dropLink: { color: '#3B82F6', fontWeight: '600' },
  dropHint: { margin: 0, fontSize: '12px', color: '#94A3B8' },
  fileList: { flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' },
  fileRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' },
  fileRowLeft: { flex: 1, overflow: 'hidden' },
  fileRowName: { display: 'block', fontSize: '13px', fontWeight: '500', color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileRowSize: { fontSize: '11px', color: '#94A3B8' },
  fileRowRight: { flexShrink: 0, display: 'flex', alignItems: 'center' },
  removeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '14px', padding: '2px 4px' },
  progressBar: { width: '120px', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' },
  progressFill: { height: '100%', background: '#3B82F6', borderRadius: '3px', transition: 'width 0.2s' },
  statusDone: { fontSize: '12px', color: '#16A34A', fontWeight: '600' },
  statusError: { fontSize: '12px', color: '#DC2626', maxWidth: '160px', textAlign: 'right' },
  dupeWarning: { margin: '0 24px', padding: '14px 16px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px' },
  dupeTitle: { margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: '#92400E' },
  dupeList: { margin: '0 0 8px', paddingLeft: '18px' },
  dupeItem: { fontSize: '13px', color: '#92400E', marginBottom: '2px' },
  dupeHint: { margin: 0, fontSize: '12px', color: '#B45309' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 24px', borderTop: '1px solid #E2E8F0' },
  btnPrimary: { padding: '9px 20px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  btnSecondary: { padding: '9px 20px', background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
};
