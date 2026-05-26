import { useEffect, useRef, useState } from 'react';
import { getAccessibleBuckets, getFiles, deleteFile, getFileUrls, generateThumbnail } from '../api/resources';
import { useSearchSocket } from '../hooks/useSearchSocket';
import { useGlobalSearch, type GlobalSearchResult } from '../hooks/useGlobalSearch';
import { CONFIG } from '../config';
import UploadModal from './UploadModal';

type Bucket = { id: string; display_name: string; description: string; cloudfront_base_url: string | null; root_path: string; allow_delete: boolean; allow_upload: boolean };
type FileItem = { resource_name: string; type: 'file' | 'folder'; cloudfront_url?: string | null; thumbnail_url?: string | null; uploaded_at: string; file_size?: number | null; prefix?: string; full_path?: string };
type UrlMap = Record<string, { file_url: string; thumbnail_url: string | null }>;

export default function Resources({ isAdmin = false }: { isAdmin?: boolean }) {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(true);
  const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);
  const [initialPrefix, setInitialPrefix] = useState('');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalViewMode, setGlobalViewMode] = useState<'list' | 'grid'>('list');
  const [previewItem, setPreviewItem] = useState<FileItem | null>(null);
  const [previewIsPrivate, setPreviewIsPrivate] = useState(false);
  const globalSearch = useGlobalSearch();
  const globalSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getAccessibleBuckets().then(setBuckets).finally(() => setLoadingBuckets(false));
  }, []);

  function handleGlobalSearch(val: string) {
    setGlobalSearchQuery(val);
    if (globalSearchTimer.current) clearTimeout(globalSearchTimer.current);
    if (val.length < CONFIG.search.minChars) { globalSearch.clear(); return; }
    globalSearchTimer.current = setTimeout(() => {
      globalSearch.search(buckets, val);
    }, CONFIG.search.debounceMs);
  }

  function closeGlobalSearch() {
    setGlobalSearchOpen(false);
    setGlobalSearchQuery('');
    globalSearch.clear();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleResultNavigate(r: GlobalSearchResult) {
    const bucket = buckets.find(b => b.id === r.bucketId);
    if (!bucket) return;
    const rootPath = r.bucketRootPath;
    const targetPath = r.type === 'folder' ? r.full_path : r.prefix;
    const relPath = rootPath && targetPath.startsWith(rootPath) ? targetPath.slice(rootPath.length) : targetPath;
    closeGlobalSearch();
    setInitialPrefix(relPath);
    setSelectedBucket(bucket);
  }

  async function handleResultClick(r: GlobalSearchResult) {
    if (r.type === 'folder') { handleResultNavigate(r); return; }
    const bucket = buckets.find(b => b.id === r.bucketId);
    try {
      const urls = await getFileUrls(r.bucketId, [r.full_path]);
      const urlData = urls[r.full_path];
      if (urlData) {
        setPreviewIsPrivate(!bucket?.cloudfront_base_url);
        setPreviewItem({ resource_name: r.resource_name, type: 'file', cloudfront_url: urlData.file_url, thumbnail_url: urlData.thumbnail_url, uploaded_at: r.uploaded_at || '', file_size: r.file_size, full_path: r.full_path });
      }
    } catch {}
  }

  if (loadingBuckets) return <div style={s.centered}><span style={s.muted}>Loading...</span></div>;

  if (!selectedBucket) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: globalSearchOpen ? '12px' : '20px' }}>
          <h2 style={{ ...s.sectionTitle, margin: 0 }}>Your Buckets</h2>
          <button style={s.globalSearchToggle} title={globalSearchOpen ? 'Close search' : 'Search all buckets'}
            onClick={() => globalSearchOpen ? closeGlobalSearch() : setGlobalSearchOpen(true)}>
            {globalSearchOpen
              ? <span style={{ fontSize: 14, lineHeight: 1 }}>✕</span>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            }
          </button>
        </div>

        {globalSearchOpen && (
          <div style={{ marginBottom: '20px' }}>
            <input autoFocus style={{ ...s.searchInput, marginBottom: '8px', width: '100%', boxSizing: 'border-box' as const }}
              placeholder="Search across all your buckets..."
              value={globalSearchQuery}
              onChange={e => handleGlobalSearch(e.target.value)} />

            {(globalSearch.searching || globalSearch.isDone) && globalSearchQuery.length >= CONFIG.search.minChars && (
              <div style={{ marginBottom: '8px' }}>
                {/* Macro: bucket counter */}
                {(() => {
                  const failedBuckets = Object.values(globalSearch.bucketStates).filter(st => st.failed);
                  const allDone = globalSearch.isDone;
                  const anyFailed = failedBuckets.length > 0;
                  const dotColor = !allDone ? '#3B82F6' : anyFailed ? '#EF4444' : '#16A34A';
                  const statusText = !allDone
                    ? `Searching bucket ${globalSearch.bucketsDone + 1} of ${globalSearch.bucketsTotal}…`
                    : anyFailed
                      ? `⚠ ${failedBuckets.length} bucket${failedBuckets.length !== 1 ? 's' : ''} failed — results may be incomplete`
                      : `✓ All ${globalSearch.bucketsTotal} bucket${globalSearch.bucketsTotal !== 1 ? 's' : ''} searched`;
                  return (
                    <div style={s.searchStatus}>
                      <span style={{ ...s.searchDot, background: dotColor, animation: globalSearch.searching ? 'pulse-dot 1.2s ease-in-out infinite' : 'none' }} />
                      <span style={{ ...s.searchStatusText, color: allDone && anyFailed ? '#EF4444' : undefined }}>{statusText}</span>
                      <span style={s.searchCount}>{globalSearch.results.length} result{globalSearch.results.length !== 1 ? 's' : ''}</span>
                    </div>
                  );
                })()}
                {/* Micro: per-bucket active folder (flickers rapidly while scanning) */}
                {Object.entries(globalSearch.bucketStates)
                  .filter(([, st]) => !st.done && st.currentFolder)
                  .map(([bid, st]) => (
                    <div key={bid} style={s.globalBucketProgress}>
                      <span style={s.globalBucketName}>{st.name}</span>
                      <span style={s.globalBucketFolder}>{st.currentFolder}</span>
                    </div>
                  ))
                }
              </div>
            )}

            {globalSearch.results.length > 0 && (
              <>
                {/* View toggle — appears once results start coming in */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                  <div style={s.viewToggle}>
                    <button style={{ ...s.viewBtn, ...(globalViewMode === 'grid' ? s.viewBtnActive : {}) }} onClick={() => setGlobalViewMode('grid')} title="Grid view">⊞</button>
                    <button style={{ ...s.viewBtn, ...(globalViewMode === 'list' ? s.viewBtnActive : {}) }} onClick={() => setGlobalViewMode('list')} title="List view">☰</button>
                  </div>
                </div>

                {globalViewMode === 'list' ? (
                  <div style={s.globalResultList}>
                    {globalSearch.results.map((r, i) => {
                      const ext = r.type === 'file' ? (r.resource_name.split('.').pop()?.toLowerCase() || '') : '';
                      const color = EXT_COLORS[ext] || '#78909c';
                      const displayPath = (r.bucketRootPath && r.prefix.startsWith(r.bucketRootPath)
                        ? r.prefix.slice(r.bucketRootPath.length) : r.prefix
                      ).replace(/\/$/, '').replace(/\//g, ' / ') || '/';
                      return (
                        <div key={i} style={s.globalResultItem} onClick={() => handleResultClick(r)}>
                          <div style={{ ...s.globalResultIcon, background: r.type === 'folder' ? '#E2E8F0' : color }}>
                            {r.type === 'folder'
                              ? <span style={{ fontSize: 13 }}>📁</span>
                              : <span style={{ fontSize: 8, fontWeight: 900, color: 'white', fontFamily: 'Arial Black, Arial, sans-serif', letterSpacing: 0.3 }}>{ext.toUpperCase().slice(0, 4)}</span>
                            }
                          </div>
                          <span style={s.globalResultName}>{r.resource_name}</span>
                          <span style={s.globalResultBucket}>{r.bucketName}</span>
                          <span style={s.globalResultPath}>{displayPath}</span>
                          {r.type === 'file' && (
                            <button style={s.globalResultNav} title="Go to folder" onClick={e => { e.stopPropagation(); handleResultNavigate(r); }}>↗</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={s.fileGrid}>
                    {globalSearch.results.map((r, i) => (
                      <GlobalResultCard key={i} r={r} onClick={() => handleResultClick(r)} onNavigate={() => handleResultNavigate(r)} />
                    ))}
                  </div>
                )}
              </>
            )}

            {globalSearch.isDone && globalSearch.results.length === 0 && globalSearchQuery.length >= CONFIG.search.minChars && (
              <p style={{ ...s.muted, padding: '8px 0' }}>No results for "{globalSearchQuery}"</p>
            )}
          </div>
        )}

        {buckets.length === 0 && <p style={s.muted}>No buckets assigned to you yet.</p>}
        <div style={s.bucketGrid}>
          {buckets.map(b => (
            <button key={b.id} style={s.bucketCard} onClick={() => { setInitialPrefix(''); setSelectedBucket(b); }}>
              <div style={{ ...s.bucketIcon, background: b.cloudfront_base_url ? '#EFF6FF' : '#F0FDF4', color: b.cloudfront_base_url ? '#3B82F6' : '#16A34A' }}>
                {b.cloudfront_base_url ? 'CDN' : 'S3'}
              </div>
              <div style={s.bucketInfo}>
                <p style={s.bucketName}>{b.display_name}</p>
                {isAdmin && b.description && <p style={s.bucketDesc}>{b.description}</p>}
                {!b.cloudfront_base_url && <p style={{ ...s.bucketDesc, color: '#16A34A', fontWeight: 600 }}>Private</p>}
              </div>
            </button>
          ))}
        </div>
        {previewItem && (
          <PreviewModal item={previewItem} isPrivateBucket={previewIsPrivate} onClose={() => setPreviewItem(null)} />
        )}
      </div>
    );
  }

  return <FileBrowser bucket={selectedBucket} onBack={() => { setSelectedBucket(null); setInitialPrefix(''); }} initialPrefix={initialPrefix} />;
}

// ─── FILE BROWSER ─────────────────────────────────────────────────────────────

function FileBrowser({ bucket, onBack, initialPrefix = '' }: { bucket: Bucket; onBack: () => void; initialPrefix?: string }) {
  const [pathStack, setPathStack] = useState<string[]>(
    initialPrefix ? initialPrefix.split('/').filter(Boolean).map(s => `${s}/`) : []
  );
  const [items, setItems] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [privateUrlToast, setPrivateUrlToast] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [virtualFolders, setVirtualFolders] = useState<string[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'level' | 'full'>('full');
  const socket = useSearchSocket();
  const [previewItem, setPreviewItem] = useState<FileItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [urlMap, setUrlMap] = useState<UrlMap>({});
  const [rateLimitToast, setRateLimitToast] = useState(false);
  const rateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const currentPrefix = pathStack.join('');
  const isPrivateBucket = !bucket.cloudfront_base_url;
  const isSearchMode = searchQuery.length >= CONFIG.search.minChars;
  const hasMore = !isSearchMode && items.length < total;
  const wsFileItems: FileItem[] = socket.results.map(r => ({
    resource_name: r.resource_name,
    type: r.type,
    uploaded_at: r.uploaded_at || new Date().toISOString(),
    file_size: r.file_size,
    prefix: r.prefix,
    full_path: r.full_path,
  }));
  const displayItems = isSearchMode ? wsFileItems : items;
  const selectableFiles = displayItems.filter(i => i.type === 'file');

  // Inject URLs from urlMap. Search results carry a per-item prefix; browse items share currentPrefix.
  const resolvedItems = displayItems.map(item => {
    if (item.type !== 'file') return item;
    const itemPrefix = item.prefix ?? currentPrefix;
    const s3Key = (bucket.root_path || '') + itemPrefix + item.resource_name;
    const urls = urlMap[s3Key];
    if (!urls) return { ...item, full_path: item.full_path ?? s3Key };
    return { ...item, full_path: item.full_path ?? s3Key, cloudfront_url: urls.file_url, thumbnail_url: urls.thumbnail_url };
  });

  useEffect(() => { setUrlMap({}); load(0); socket.clear(); setSearchQuery(''); }, [currentPrefix]);
  useEffect(() => { setSelectedItems(new Set()); }, [currentPrefix, isSearchMode]);

  // Batch-fetch URLs for search results when a search completes (files only)
  useEffect(() => {
    if (!socket.isDone || socket.results.length === 0) return;
    const keys = socket.results
      .filter(r => r.type === 'file')
      .map(r => (bucket.root_path || '') + r.prefix + r.resource_name);
    if (keys.length === 0) return;
    getFileUrls(bucket.id, keys)
      .then(map => setUrlMap(prev => ({ ...prev, ...map })))
      .catch(() => {});
  }, [socket.isDone]);

  async function load(newOffset: number, append = false) {
    setLoading(true);
    try {
      const res = await getFiles(bucket.id, currentPrefix, CONFIG.pagination.pageSize, newOffset);
      if (append) {
        setItems(prev => [...prev, ...res.items]);
      } else {
        setItems(res.items);
      }
      setTotal(res.total);
      setOffset(newOffset);

      // Non-blocking batch URL fetch for file items on this page
      const fileKeys = (res.items as FileItem[])
        .filter(i => i.type === 'file')
        .map(i => (bucket.root_path || '') + currentPrefix + i.resource_name);
      if (fileKeys.length > 0) {
        getFileUrls(bucket.id, fileKeys)
          .then(map => setUrlMap(prev => ({ ...prev, ...map })))
          .catch(() => {});
      }
    } catch (err: any) {
      if (err?.response?.status === 429) await new Promise(r => setTimeout(r, 3_000));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!sentinelRef.current || loading || !hasMore || isSearchMode) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) load(offset + CONFIG.pagination.pageSize, true);
    });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loading, hasMore, isSearchMode, offset]);

  function enterFolder(name: string, fullPath?: string) {
    if (fullPath) {
      // Absolute navigation from a search result — strip root_path, build pathStack
      const rootPath = bucket.root_path || '';
      const relPath = rootPath && fullPath.startsWith(rootPath)
        ? fullPath.slice(rootPath.length)
        : fullPath;
      setPathStack(relPath.split('/').filter(Boolean).map(s => `${s}/`));
    } else {
      setPathStack(prev => [...prev, `${name}/`]);
    }
    setVirtualFolders([]);
    setShowNewFolder(false);
    setNewFolderName('');
    setSearchQuery('');
    socket.clear();
  }

  function navigateTo(index: number) {
    setPathStack(prev => prev.slice(0, index));
    setVirtualFolders([]);
    setShowNewFolder(false);
    setNewFolderName('');
  }

  function createVirtualFolder() {
    const name = newFolderName.trim().replace(/[/\\]/g, '');
    if (!name) return;
    if (!virtualFolders.includes(name) && !items.find(i => i.resource_name === name && i.type === 'folder')) {
      setVirtualFolders(prev => [...prev, name]);
    }
    setNewFolderName('');
    setShowNewFolder(false);
  }

  function copyUrl(url: string, isPrivate: boolean) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
    if (isPrivate) {
      setPrivateUrlToast(true);
      setTimeout(() => setPrivateUrlToast(false), 6000);
    }
  }

  function fallbackCopy(url: string) {
    const el = document.createElement('textarea');
    el.value = url;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }

  async function handleDelete(resourceName: string) {
    if (!confirm(`Delete "${resourceName}"? This cannot be undone.`)) return;
    const s3Key = (bucket.root_path || '') + currentPrefix + resourceName;
    try {
      await deleteFile(bucket.id, s3Key);
      load(0);
    } catch (err: any) {
      const code = err.response?.data?.code;
      setDeleteError(
        code === 'S3_ACCESS_DENIED' ? 'S3 rejected the delete. IAM policy may be missing s3:DeleteObject.' :
        code === 'DELETE_NOT_ALLOWED' ? 'You do not have delete permission on this bucket.' :
        'Delete failed. Please try again.'
      );
      setTimeout(() => setDeleteError(''), 6000);
    }
  }

  function toggleSelect(name: string) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function selectAll() {
    setSelectedItems(new Set(selectableFiles.map(i => i.resource_name)));
  }

  async function handleBulkDelete() {
    const names = [...selectedItems];
    if (!confirm(`Delete ${names.length} file${names.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    let failed = 0;
    for (const name of names) {
      const s3Key = (bucket.root_path || '') + currentPrefix + name;
      try { await deleteFile(bucket.id, s3Key); } catch { failed++; }
    }
    setSelectedItems(new Set());
    load(0);
    if (failed > 0) {
      setDeleteError(`${failed} file(s) could not be deleted.`);
      setTimeout(() => setDeleteError(''), 6000);
    }
  }

  function handleRateLimited() {
    if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
    setRateLimitToast(true);
    rateLimitTimerRef.current = setTimeout(() => setRateLimitToast(false), 6000);
  }

  function handleSearchInput(val: string) {
    setSearchQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.length < CONFIG.search.minChars) { socket.clear(); return; }
    searchTimer.current = setTimeout(() => {
      socket.search(bucket.id, val, currentPrefix, searchScope);
    }, CONFIG.search.debounceMs);
  }

  function handleScopeChange(scope: 'level' | 'full') {
    setSearchScope(scope);
    if (searchQuery.length >= CONFIG.search.minChars) {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      socket.search(bucket.id, searchQuery, currentPrefix, scope);
    }
  }

  return (
    <div>
      {previewItem && (
        <PreviewModal item={previewItem} isPrivateBucket={isPrivateBucket} onClose={() => setPreviewItem(null)} />
      )}

      {showUpload && bucket.allow_upload && (
        <UploadModal
          bucketId={bucket.id}
          prefix={currentPrefix}
          existingFiles={items.filter(i => i.type === 'file').map(i => i.resource_name)}
          onClose={() => setShowUpload(false)}
          onUploaded={() => load(0)}
        />
      )}

      {/* Breadcrumb + toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={s.breadcrumb}>
          <button style={s.backBtn} onClick={onBack}>← Buckets</button>
          <span style={s.breadcrumbSep}>/</span>
          <button style={s.crumb} onClick={() => navigateTo(0)}>{bucket.display_name}</button>
          {pathStack.map((segment, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={s.breadcrumbSep}>/</span>
              <button style={s.crumb} onClick={() => navigateTo(i + 1)}>{segment.replace(/\/$/, '')}</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={s.viewToggle}>
            <button style={{ ...s.viewBtn, ...(viewMode === 'grid' ? s.viewBtnActive : {}) }} onClick={() => setViewMode('grid')} title="Grid view">⊞</button>
            <button style={{ ...s.viewBtn, ...(viewMode === 'list' ? s.viewBtnActive : {}) }} onClick={() => setViewMode('list')} title="List view">☰</button>
          </div>
          {bucket.allow_upload && (showNewFolder ? (
            <div style={{ display: 'flex', gap: '6px' }}>
              <input style={s.folderInput} autoFocus placeholder="Folder name" value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createVirtualFolder(); if (e.key === 'Escape') setShowNewFolder(false); }} />
              <button style={s.uploadBtn} onClick={createVirtualFolder}>Create</button>
              <button style={s.cancelFolderBtn} onClick={() => setShowNewFolder(false)}>✕</button>
            </div>
          ) : (
            <button style={s.newFolderBtn} onClick={() => setShowNewFolder(true)}>+ Folder</button>
          ))}
          {bucket.allow_upload && (
            <button style={s.uploadBtn} onClick={() => setShowUpload(true)}>↑ Upload</button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {deleteError && <div style={s.deleteErrorBanner}>{deleteError}</div>}

      {/* Private URL toast */}
      {privateUrlToast && (
        <div style={s.privateUrlToast}>
          This URL expires in 7 days. Be careful when sharing or embedding it.
          <button style={s.toastClose} onClick={() => setPrivateUrlToast(false)}>✕</button>
        </div>
      )}

      {rateLimitToast && (
        <div style={s.rateLimitToast}>
          Thumbnail generation is busy — previews will load on your next visit.
          <button style={s.toastClose} onClick={() => setRateLimitToast(false)}>✕</button>
        </div>
      )}

      {/* Search bar */}
      <div style={s.searchRow}>
        <input style={s.searchInput} type="text" placeholder="Search files (min 3 chars)..."
          value={searchQuery} onChange={e => handleSearchInput(e.target.value)} />
        <div style={s.scopeToggle}>
          <button style={{ ...s.scopeBtn, ...(searchScope === 'level' ? s.scopeBtnActive : {}) }} onClick={() => handleScopeChange('level')}>This folder</button>
          <button style={{ ...s.scopeBtn, ...(searchScope === 'full' ? s.scopeBtnActive : {}) }} onClick={() => handleScopeChange('full')}>Entire bucket</button>
        </div>
        {isSearchMode && (
          <button style={s.clearSearch} onClick={() => { setSearchQuery(''); socket.clear(); }}>✕ Clear</button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedItems.size > 0 ? (
        <div style={s.bulkBar}>
          <span style={s.bulkCount}>{selectedItems.size} selected</span>
          {selectedItems.size < selectableFiles.length && (
            <button style={s.bulkBtn} onClick={selectAll}>Select all {selectableFiles.length}</button>
          )}
          <button style={s.bulkBtn} onClick={() => setSelectedItems(new Set())}>Deselect</button>
          {bucket.allow_delete && (
            <button style={s.bulkDeleteBtn} onClick={handleBulkDelete}>Delete selected</button>
          )}
        </div>
      ) : selectableFiles.length > 0 ? (
        <div style={{ marginBottom: '12px' }}>
          <button style={s.selectAllLink} onClick={selectAll}>Select all files</button>
        </div>
      ) : null}

      {/* Search status bar */}
      {isSearchMode && (socket.searching || socket.isDone) && (
        <div style={s.searchStatus}>
          <span style={{
            ...s.searchDot,
            background: socket.isDone ? '#16A34A' : '#3B82F6',
            animation: socket.searching ? 'pulse-dot 1.2s ease-in-out infinite' : 'none',
          }} />
          <span style={s.searchStatusText}>
            {socket.searching
              ? socket.currentFolder
                ? <>Scanning <span style={s.searchFolder} title={socket.currentFolder}>{socket.currentFolder}</span></>
                : 'Scanning…'
              : `✓ Done`}
          </span>
          <span style={s.searchCount}>{socket.results.length} result{socket.results.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Content */}
      {isSearchMode && !socket.searching && socket.results.length === 0 && socket.isDone ? (
        <div style={s.emptyState}><p style={s.muted}>No results for "{searchQuery}"</p></div>
      ) : loading && !isSearchMode && items.length === 0 ? (
        <div style={s.centered}><span style={s.muted}>Loading...</span></div>
      ) : displayItems.length === 0 && virtualFolders.length === 0 ? (
        <div style={s.emptyState}><p style={s.muted}>This folder is empty.</p></div>
      ) : viewMode === 'grid' ? (
        <div style={s.fileGrid}>
          {virtualFolders.map(name => (
            <FileCard key={`vf-${name}`}
              item={{ resource_name: name, type: 'folder', uploaded_at: new Date().toISOString() }}
              bucketId={bucket.id} onEnterFolder={enterFolder} onCopyUrl={copyUrl} copied={false} isVirtual
              isPrivateBucket={isPrivateBucket} onPreview={() => {}} selected={false} onSelect={() => {}} />
          ))}
          {resolvedItems.map((item, i) => (
            <div key={i} className={isSearchMode ? 'search-result-enter' : undefined}>
              <FileCard item={item} bucketId={bucket.id} onEnterFolder={enterFolder} onCopyUrl={copyUrl}
                copied={copiedUrl === item.cloudfront_url} isPrivateBucket={isPrivateBucket}
                allowDelete={bucket.allow_delete} onDelete={handleDelete}
                onPreview={() => item.type === 'file' && setPreviewItem(item)}
                selected={selectedItems.has(item.resource_name)}
                onSelect={() => item.type === 'file' && toggleSelect(item.resource_name)}
                onRateLimited={handleRateLimited} />
            </div>
          ))}
        </div>
      ) : (
        <ListView
          items={resolvedItems} virtualFolders={virtualFolders} onEnterFolder={enterFolder}
          onCopyUrl={copyUrl} copiedUrl={copiedUrl} isPrivateBucket={isPrivateBucket}
          allowDelete={bucket.allow_delete} onDelete={handleDelete}
          onPreview={(item) => setPreviewItem(item)}
          selectedItems={selectedItems} onSelect={toggleSelect} bucketId={bucket.id}
          onRateLimited={handleRateLimited} />
      )}

      {!isSearchMode && <div ref={sentinelRef} style={{ height: 1 }} />}
      {!isSearchMode && loading && items.length > 0 && (
        <p style={{ textAlign: 'center', padding: '16px 0', color: '#94A3B8', fontSize: '13px', margin: 0 }}>Loading more…</p>
      )}
    </div>
  );
}

// ─── PREVIEW MODAL ────────────────────────────────────────────────────────────

function PreviewModal({ item, isPrivateBucket, onClose }: { item: FileItem; isPrivateBucket: boolean; onClose: () => void }) {
  const ext = item.resource_name.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'].includes(ext);
  const isVideo = ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
  const isPdf = ext === 'pdf';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={s.previewOverlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.previewModal}>
        <div style={s.previewHeader}>
          <span style={s.previewTitle} title={item.resource_name}>{item.resource_name}</span>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
            {isPrivateBucket && <span style={s.previewPrivateBadge}>7-day link</span>}
            <button style={s.previewOpenBtn} onClick={() => window.open(item.cloudfront_url!, '_blank')}>Open in new tab ↗</button>
            <button style={s.previewCloseBtn} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={s.previewContent}>
          {isImage && (
            <img src={item.cloudfront_url!} alt={item.resource_name} style={s.previewImage}
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }} />
          )}
          {isVideo && (
            <video src={item.cloudfront_url!} controls autoPlay style={s.previewVideo} />
          )}
          {isPdf && (
            <iframe src={item.cloudfront_url!} title={item.resource_name} style={s.previewPdf} />
          )}
          {!isImage && !isVideo && !isPdf && (
            <div style={s.previewFallback}>
              {item.thumbnail_url && (
                <img src={item.thumbnail_url} style={{ width: 120, height: 120, borderRadius: 12 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              <p style={s.previewFileName}>{item.resource_name}</p>
              <p style={s.previewMuted}>Preview not available for this file type</p>
              <button style={s.previewOpenBtnLarge} onClick={() => window.open(item.cloudfront_url!, '_blank')}>Open file ↗</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── LIST VIEW ────────────────────────────────────────────────────────────────

function ListView({ items, virtualFolders, onEnterFolder, onCopyUrl, copiedUrl, isPrivateBucket, allowDelete, onDelete, onPreview, selectedItems, onSelect, bucketId, onRateLimited }: {
  items: FileItem[];
  virtualFolders: string[];
  onEnterFolder: (name: string, fullPath?: string) => void;
  onCopyUrl: (url: string, isPrivate: boolean) => void;
  copiedUrl: string | null;
  isPrivateBucket: boolean;
  allowDelete?: boolean;
  onDelete?: (name: string) => void;
  onPreview: (item: FileItem) => void;
  selectedItems: Set<string>;
  onSelect: (name: string) => void;
  bucketId: string;
  onRateLimited?: () => void;
}) {
  return (
    <div style={s.listTable}>
      <div style={s.listHeader}>
        <div style={{ width: 28 }} />
        <div style={{ width: 48 }} />
        <div style={{ flex: 1 }}>Name</div>
        <div style={{ width: 80 }}>Size</div>
        <div style={{ width: 100 }}>Date</div>
        <div style={{ width: 160 }}>Actions</div>
      </div>

      {virtualFolders.map(name => (
        <div key={`vf-${name}`} style={s.listRow}>
          <div style={{ width: 28 }} />
          <div style={{ width: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 22 }}>📁</span>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <button style={s.listName} onClick={() => onEnterFolder(name)}>{name} <span style={s.virtualTag}>new</span></button>
          </div>
          <div style={{ width: 80 }} /><div style={{ width: 100 }} /><div style={{ width: 160 }} />
        </div>
      ))}

      {items.map((item, i) => {
        const isFolder = item.type === 'folder';
        const previewSrc = item.thumbnail_url || item.cloudfront_url;
        const ext = item.resource_name.split('.').pop()?.toLowerCase() || '';
        return (
          <ListRow key={i} item={item} isFolder={isFolder} previewSrc={previewSrc} ext={ext}
            selectedItems={selectedItems} onSelect={onSelect} onEnterFolder={onEnterFolder}
            onPreview={onPreview} onCopyUrl={onCopyUrl} copiedUrl={copiedUrl}
            isPrivateBucket={isPrivateBucket} allowDelete={allowDelete} onDelete={onDelete}
            bucketId={bucketId} onRateLimited={onRateLimited} />
        );
      })}
    </div>
  );
}

function ListRow({ item, isFolder, previewSrc, ext, selectedItems, onSelect, onEnterFolder, onPreview, onCopyUrl, copiedUrl, isPrivateBucket, allowDelete, onDelete, bucketId, onRateLimited }: {
  item: FileItem; isFolder: boolean; previewSrc: string | null | undefined; ext: string;
  selectedItems: Set<string>; onSelect: (name: string) => void;
  onEnterFolder: (name: string, fullPath?: string) => void; onPreview: (item: FileItem) => void;
  onCopyUrl: (url: string, isPrivate: boolean) => void; copiedUrl: string | null;
  isPrivateBucket: boolean; allowDelete?: boolean; onDelete?: (name: string) => void;
  bucketId: string; onRateLimited?: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setImgFailed(false);
    setImgLoaded(false);
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setImgLoaded(true);
  }, [previewSrc]);

  return (
    <div style={{ ...s.listRow, background: selectedItems.has(item.resource_name) ? '#EFF6FF' : undefined }}>
      <div style={{ width: 28, display: 'flex', alignItems: 'center' }}>
        {!isFolder && (
          <input type="checkbox" checked={selectedItems.has(item.resource_name)}
            onChange={() => onSelect(item.resource_name)} style={{ cursor: 'pointer' }} />
        )}
      </div>
      <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0, overflow: 'hidden', borderRadius: 4, cursor: isFolder ? 'pointer' : 'zoom-in' }}
        onClick={() => isFolder ? onEnterFolder(item.resource_name, item.full_path) : onPreview(item)}>
        {isFolder ? (
          <span style={{ fontSize: 22, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📁</span>
        ) : (
          <>
            <FileTypeIcon ext={ext} compact />
            {previewSrc && !imgFailed && (
              <img ref={imgRef} src={previewSrc} alt="" crossOrigin="anonymous"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.15s ease' }}
                onLoad={() => setImgLoaded(true)}
                onError={() => { setImgFailed(true); if (item.thumbnail_url && item.full_path) generateThumbnail(bucketId, item.full_path, onRateLimited); }} />
            )}
          </>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
        {isFolder ? (
          <button style={s.listName} onClick={() => onEnterFolder(item.resource_name, item.full_path)}>{item.resource_name}</button>
        ) : (
          <button style={s.listName} onClick={() => onPreview(item)}>{item.resource_name}</button>
        )}
      </div>
      <div style={{ width: 80, fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center' }}>
        {item.file_size != null ? formatBytes(item.file_size) : '—'}
      </div>
      <div style={{ width: 100, fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center' }}>
        {item.uploaded_at ? new Date(item.uploaded_at).toLocaleDateString() : '—'}
      </div>
      <div style={{ width: 160, display: 'flex', alignItems: 'center', gap: 6 }}>
        {item.type === 'file' && item.cloudfront_url && (
          <button style={{ ...s.copyBtn, ...(copiedUrl === item.cloudfront_url ? s.copyBtnDone : {}) }}
            onClick={() => onCopyUrl(item.cloudfront_url!, isPrivateBucket)}>
            {copiedUrl === item.cloudfront_url ? '✓' : 'Copy'}
          </button>
        )}
        {item.type === 'file' && allowDelete && onDelete && (
          <button style={s.listDeleteBtn} onClick={() => onDelete(item.resource_name)}>Delete</button>
        )}
      </div>
    </div>
  );
}

// ─── FILE CARD (GRID) ─────────────────────────────────────────────────────────

function FileCard({ item, bucketId, onEnterFolder, onCopyUrl, copied, isVirtual, allowDelete, onDelete, isPrivateBucket, onPreview, selected, onSelect, onRateLimited }: {
  item: FileItem;
  bucketId: string;
  onEnterFolder: (name: string, fullPath?: string) => void;
  onCopyUrl: (url: string, isPrivate: boolean) => void;
  copied: boolean;
  isVirtual?: boolean;
  allowDelete?: boolean;
  onDelete?: (name: string) => void;
  isPrivateBucket?: boolean;
  onPreview: () => void;
  selected: boolean;
  onSelect: () => void;
  onRateLimited?: () => void;
}) {
  const ext = item.resource_name.split('.').pop()?.toLowerCase() || '';
  const previewSrc = item.thumbnail_url || item.cloudfront_url;
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setImgFailed(false);
    setImgLoaded(false);
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setImgLoaded(true);
  }, [previewSrc]);

  function handlePreviewClick() {
    if (item.type === 'folder') {
      onEnterFolder(item.resource_name, item.full_path);
    } else {
      onPreview();
    }
  }

  return (
    <div style={{ ...s.fileCard, outline: selected ? '2px solid #3B82F6' : 'none', outlineOffset: '-2px' }}>
      {/* Checkbox — top left, files only */}
      {item.type === 'file' && !isVirtual && (
        <input type="checkbox" checked={selected} onChange={onSelect} style={s.cardCheckbox} />
      )}

      <div style={{ ...s.filePreview, cursor: item.type === 'folder' ? 'pointer' : 'zoom-in' }} onClick={handlePreviewClick}>
        {item.type === 'folder' ? (
          <div style={s.fileIcon}>📁</div>
        ) : (
          <>
            <FileTypeIcon ext={ext} />
            {previewSrc && !imgFailed && (
              <img ref={imgRef} src={previewSrc} alt={item.resource_name} crossOrigin="anonymous"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.15s ease' }}
                onLoad={() => setImgLoaded(true)}
                onError={() => { setImgFailed(true); if (item.thumbnail_url && item.full_path) generateThumbnail(bucketId, item.full_path, onRateLimited); }} />
            )}
          </>
        )}
      </div>

      <div style={s.fileMeta}>
        <p style={s.fileName} title={item.resource_name}>
          {item.resource_name}{isVirtual && <span style={s.virtualTag}> new</span>}
        </p>
        {item.type === 'file' && item.file_size != null && (
          <p style={s.fileSize}>{formatBytes(item.file_size)}</p>
        )}
        {item.type === 'file' && item.cloudfront_url && (
          <button style={{ ...s.copyBtn, ...(copied ? s.copyBtnDone : {}) }}
            onClick={() => onCopyUrl(item.cloudfront_url!, !!isPrivateBucket)}>
            {copied ? '✓ Copied' : 'Copy URL'}
          </button>
        )}
        {item.type === 'file' && !isVirtual && allowDelete && onDelete && (
          <button style={s.deleteBtn} onClick={() => onDelete(item.resource_name)}>Delete</button>
        )}
      </div>
    </div>
  );
}

// ─── GLOBAL RESULT CARD (GRID MODE) ──────────────────────────────────────────

function GlobalResultCard({ r, onClick, onNavigate }: { r: GlobalSearchResult; onClick: () => void; onNavigate: () => void }) {
  const ext = r.type === 'file' ? (r.resource_name.split('.').pop()?.toLowerCase() || '') : '';
  const displayPath = (r.bucketRootPath && r.prefix.startsWith(r.bucketRootPath)
    ? r.prefix.slice(r.bucketRootPath.length) : r.prefix
  ).replace(/\/$/, '') || '/';

  return (
    <div style={{ ...s.fileCard, cursor: 'pointer' }} onClick={onClick}>
      {r.type === 'file' && (
        <button style={s.globalResultCardNav} title="Go to folder" onClick={e => { e.stopPropagation(); onNavigate(); }}>↗</button>
      )}
      <div style={{ ...s.filePreview }}>
        {r.type === 'folder' ? (
          <div style={s.fileIcon}>📁</div>
        ) : (
          <FileTypeIcon ext={ext} />
        )}
      </div>
      <div style={s.fileMeta}>
        <p style={s.fileName} title={r.resource_name}>{r.resource_name}</p>
        <p style={{ ...s.fileSize, color: '#3B82F6', fontWeight: 600 }}>{r.bucketName}</p>
        {displayPath !== '/' && <p style={s.fileSize} title={displayPath}>{displayPath}</p>}
      </div>
    </div>
  );
}

// ─── FILE TYPE ICON ──────────────────────────────────────────────────────────
// Matches the thumbnail-generator Lambda's color scheme. Shown when no
// thumbnail exists or when the thumbnail image fails to load.

const EXT_COLORS: Record<string, string> = {
  pdf: '#c0392b',
  doc: '#2980b9', docx: '#2980b9', odt: '#2980b9', rtf: '#2980b9',
  txt: '#546e7a', md: '#37474f',
  xls: '#27ae60', xlsx: '#27ae60', csv: '#27ae60', ods: '#27ae60',
  ppt: '#e67e22', pptx: '#e67e22', odp: '#e67e22',
  mp4: '#6a1b9a', mkv: '#6a1b9a', avi: '#6a1b9a', mov: '#6a1b9a',
  flv: '#6a1b9a', wmv: '#6a1b9a', webm: '#6a1b9a',
  mp3: '#ad1457', wav: '#ad1457', aac: '#ad1457', flac: '#ad1457',
  ogg: '#ad1457', m4a: '#ad1457',
  zip: '#4527a0', rar: '#4527a0', '7z': '#4527a0', tar: '#4527a0',
  gz: '#4527a0', bz2: '#4527a0',
  html: '#e44d26', htm: '#e44d26',
  css: '#264de4',
  js: '#d4aa00', ts: '#007acc',
  json: '#37474f', xml: '#37474f', yaml: '#37474f', yml: '#37474f',
  sql: '#78909c', sh: '#37474f', py: '#3572A5', rb: '#701516',
};

// Fills its parent absolutely — parent must have position:relative + overflow:hidden.
// compact=true for small thumbnails (list view 36px): just shows colored square + label.
function FileTypeIcon({ ext, compact = false }: { ext: string; compact?: boolean }) {
  const color = EXT_COLORS[ext] || '#78909c';
  const label = ext ? ext.toUpperCase().slice(0, 4) : '?';
  return (
    <div style={{ position: 'absolute', inset: 0, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {compact ? (
        <span style={{ fontSize: 9, fontWeight: 900, color: 'white', fontFamily: 'Arial Black, Arial, sans-serif', letterSpacing: 0.3 }}>{label}</span>
      ) : (
        <svg width="52" height="62" viewBox="0 0 52 62" fill="none">
          <path d="M4 2 H33 L48 17 V58 Q48 60 46 60 H6 Q4 60 4 58 Z" fill="white" opacity="0.93"/>
          <path d="M33 2 L48 17 H33 Z" fill={color} opacity="0.4"/>
          <rect x="11" y="24" width="22" height="3" rx="1.5" fill={color} opacity="0.2"/>
          <rect x="11" y="31" width="18" height="3" rx="1.5" fill={color} opacity="0.2"/>
          <rect x="11" y="38" width="20" height="3" rx="1.5" fill={color} opacity="0.2"/>
          <rect x="9"  y="44" width="34" height="14" rx="2.5" fill={color}/>
          <text x="26" y="55.5" textAnchor="middle"
            fontFamily="Arial Black, Arial, sans-serif" fontWeight="900"
            fontSize={label.length <= 3 ? 10 : 8} fill="white" letterSpacing="0.3">
            {label}
          </text>
        </svg>
      )}
    </div>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  centered: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' },
  muted: { color: '#94A3B8', fontSize: '14px', margin: 0 },
  sectionTitle: { margin: '0 0 20px 0', fontSize: '16px', fontWeight: '700', color: '#1E293B' },

  bucketGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' },
  bucketCard: { display: 'flex', alignItems: 'center', gap: '14px', padding: '20px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', cursor: 'pointer', textAlign: 'left', width: '100%' },
  bucketIcon: { width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '11px', flexShrink: 0 },
  bucketInfo: { overflow: 'hidden' },
  bucketName: { margin: 0, fontWeight: '600', fontSize: '14px', color: '#1E293B' },
  bucketDesc: { margin: '4px 0 0 0', fontSize: '12px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  breadcrumb: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const, flex: 1, minWidth: 0 },
  backBtn: { padding: '6px 12px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#475569', fontWeight: '500', flexShrink: 0 },
  breadcrumbSep: { color: '#CBD5E1', fontSize: '14px' },
  crumb: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#3B82F6', fontWeight: '500', padding: '2px 4px' },

  viewToggle: { display: 'flex', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' },
  viewBtn: { padding: '7px 12px', background: '#fff', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#94A3B8' },
  viewBtnActive: { background: '#EFF6FF', color: '#3B82F6' },

  fileGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' },
  fileCard: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', position: 'relative' as const },
  cardCheckbox: { position: 'absolute' as const, top: 8, left: 8, zIndex: 2, width: 16, height: 16, cursor: 'pointer', accentColor: '#3B82F6' },
  filePreview: { position: 'relative' as const, height: '120px', overflow: 'hidden' },
  fileIcon: { fontSize: '40px' },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  fileMeta: { padding: '10px 12px' },
  fileName: { margin: '0 0 8px 0', fontSize: '12px', fontWeight: '500', color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileSize: { margin: '0 0 6px 0', fontSize: '11px', color: '#94A3B8' },
  copyBtn: { padding: '4px 10px', background: '#EFF6FF', color: '#3B82F6', border: '1px solid #BFDBFE', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '500', width: '100%' },
  copyBtnDone: { background: '#F0FDF4', color: '#16A34A', borderColor: '#BBF7D0' },
  deleteBtn: { marginTop: '4px', padding: '4px 10px', background: 'transparent', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '500', width: '100%' },

  listTable: { display: 'flex', flexDirection: 'column' as const, border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', background: '#fff' },
  listHeader: { display: 'flex', alignItems: 'center', gap: 0, padding: '8px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12px', fontWeight: '600', color: '#64748B' },
  listRow: { display: 'flex', alignItems: 'center', gap: 0, padding: '8px 16px', borderBottom: '1px solid #F1F5F9' },
  listName: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1E293B', fontWeight: '500', textAlign: 'left' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0, width: '100%' },
  listDeleteBtn: { padding: '3px 8px', background: 'transparent', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' as const },

  bulkBar: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', padding: '10px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', flexWrap: 'wrap' as const },
  bulkCount: { fontSize: '13px', fontWeight: '600', color: '#1E40AF' },
  bulkBtn: { padding: '4px 12px', background: '#fff', border: '1px solid #BFDBFE', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#3B82F6', fontWeight: '500' },
  bulkDeleteBtn: { padding: '4px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#DC2626', fontWeight: '600', marginLeft: 'auto' },
  selectAllLink: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#94A3B8', padding: 0, textDecoration: 'underline' },

  // Preview modal
  previewOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' },
  previewModal: { background: '#1E293B', borderRadius: '16px', width: '100%', maxWidth: '1100px', height: '90vh', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' },
  previewHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', gap: '16px', flexShrink: 0 },
  previewTitle: { fontSize: '14px', fontWeight: '600', color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  previewPrivateBadge: { fontSize: '11px', background: '#F59E0B22', color: '#F59E0B', border: '1px solid #F59E0B44', borderRadius: '5px', padding: '2px 8px', flexShrink: 0 },
  previewOpenBtn: { padding: '6px 14px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', flexShrink: 0, whiteSpace: 'nowrap' as const },
  previewCloseBtn: { background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94A3B8', fontSize: '18px', cursor: 'pointer', borderRadius: '6px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  previewContent: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '20px' },
  previewImage: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' },
  previewVideo: { maxWidth: '100%', maxHeight: '100%', borderRadius: '4px' },
  previewPdf: { width: '100%', height: '100%', border: 'none', borderRadius: '4px' },
  previewFallback: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '16px', textAlign: 'center' as const },
  previewFileName: { margin: 0, fontSize: '16px', fontWeight: '600', color: '#E2E8F0' },
  previewMuted: { margin: 0, fontSize: '13px', color: '#64748B' },
  previewOpenBtnLarge: { padding: '10px 24px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },

  deleteErrorBanner: { marginBottom: '16px', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#DC2626', fontSize: '13px' },
  privateUrlToast: { position: 'fixed' as const, bottom: '24px', right: '24px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#92400E', maxWidth: '320px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'flex-start', gap: '10px', zIndex: 1000 },
  rateLimitToast: { position: 'fixed' as const, bottom: '24px', left: '24px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#475569', maxWidth: '320px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'flex-start', gap: '10px', zIndex: 1000 },
  toastClose: { background: 'none', border: 'none', cursor: 'pointer', color: '#92400E', fontSize: '14px', padding: '0', flexShrink: 0, lineHeight: 1 },

  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: '32px' },
  pageBtn: { padding: '7px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', color: '#475569' },
  pageInfo: { fontSize: '13px', color: '#64748B' },
  emptyState: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', border: '2px dashed #E2E8F0', borderRadius: '12px', background: '#fff' },

  uploadBtn: { padding: '9px 20px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  searchRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' as const },
  searchInput: { flex: 1, minWidth: '200px', padding: '9px 14px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', color: '#1E293B', outline: 'none', background: '#fff' },
  scopeToggle: { display: 'flex', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' },
  scopeBtn: { padding: '8px 14px', background: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#64748B' },
  scopeBtnActive: { background: '#EFF6FF', color: '#3B82F6', fontWeight: '600' },
  clearSearch: { padding: '8px 12px', background: 'none', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', color: '#94A3B8', cursor: 'pointer' },
  searchStatus: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '8px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px' },
  searchDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'inline-block' },
  searchStatusText: { color: '#475569', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  searchFolder: { color: '#3B82F6', direction: 'rtl' as const, display: 'inline-block', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom', unicodeBidi: 'embed' as const },
  searchCount: { color: '#94A3B8', flexShrink: 0, fontSize: '12px' },
  newFolderBtn: { padding: '9px 16px', background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  folderInput: { padding: '8px 12px', border: '1px solid #3B82F6', borderRadius: '8px', fontSize: '14px', outline: 'none', width: '160px' },
  cancelFolderBtn: { padding: '8px 10px', background: 'none', border: '1px solid #E2E8F0', borderRadius: '8px', cursor: 'pointer', color: '#94A3B8', fontSize: '14px' },
  virtualTag: { fontSize: '10px', color: '#F59E0B', fontWeight: '600', marginLeft: '2px' },

  globalSearchToggle: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', cursor: 'pointer', padding: '7px 10px', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  globalResultList: { border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', background: '#fff' },
  globalResultItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 16px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', transition: 'background 0.1s' },
  globalResultIcon: { width: 28, height: 28, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  globalResultName: { fontSize: '13px', fontWeight: '600', color: '#1E293B', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  globalResultBucket: { fontSize: '11px', color: '#3B82F6', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '2px 7px', flexShrink: 0, whiteSpace: 'nowrap' as const },
  globalResultPath: { fontSize: '11px', color: '#94A3B8', flexShrink: 0, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, direction: 'rtl' as const },
  globalResultNav: { flexShrink: 0, background: 'none', border: '1px solid #E2E8F0', borderRadius: '5px', cursor: 'pointer', color: '#94A3B8', fontSize: '12px', padding: '2px 7px', lineHeight: '1.4' },
  globalResultCardNav: { position: 'absolute' as const, top: 6, right: 6, zIndex: 1, background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '5px', cursor: 'pointer', color: 'white', fontSize: '11px', padding: '3px 7px', lineHeight: '1.4' },
  globalBucketProgress: { display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 12px', fontSize: '11px' },
  globalBucketName: { color: '#3B82F6', fontWeight: '600', flexShrink: 0, minWidth: '100px' },
  globalBucketFolder: { color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, direction: 'rtl' as const, flex: 1 },
};
