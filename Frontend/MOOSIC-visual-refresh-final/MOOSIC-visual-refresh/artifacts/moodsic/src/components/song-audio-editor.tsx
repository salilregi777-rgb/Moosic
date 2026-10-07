import { useEffect, useId, useRef, useState } from 'react';
import { requireSupabase, supabaseApiRequest } from '@/lib/supabase';
import { resolvePlaybackSource } from '@/lib/playback-source';

export type SavedSongAudio = {
  id: number;
  audio_url: string | null;
  is_playable?: boolean | null;
};

type SongAudioEditorProps = {
  songId: number;
  currentUrl?: string | null;
  onSaved: (song: SavedSongAudio) => void;
  onError: (message: string) => void;
};

const audioTypes: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', ogg: 'audio/ogg',
  oga: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', webm: 'audio/webm',
};

export function SongAudioEditor({ songId, currentUrl, onSaved, onError }: SongAudioEditorProps) {
  const fieldId = useId();
  const [url, setUrl] = useState(currentUrl ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(currentUrl ?? '');
    setFile(null);
    setStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [songId, currentUrl]);

  const saveUrl = async (nextUrl: string) => {
    const saved = await supabaseApiRequest(`/manager/songs/${songId}`, {
      method: 'PUT', body: JSON.stringify({ audio_url: nextUrl }),
    }) as SavedSongAudio;
    onSaved(saved);
    setStatus('Audio source saved. This song is ready for playback.');
  };

  const saveSource = async () => {
    const nextUrl = url.trim();
    if (!/^https?:\/\//i.test(nextUrl) || !resolvePlaybackSource(nextUrl)) {
      onError('Enter a complete audio URL or a valid YouTube video link.');
      return;
    }
    setBusy(true);
    setStatus('Saving audio source…');
    try {
      await saveUrl(nextUrl);
    } catch (error) {
      setStatus('Source not saved. You can retry with the URL below.');
      onError(error instanceof Error ? error.message : 'Could not save this audio source.');
    } finally {
      setBusy(false);
    }
  };

  const uploadAudio = async () => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const contentType = audioTypes[extension];
    if (!contentType) {
      onError('Choose an MP3, M4A, OGG, WAV, FLAC or WebM audio file.');
      return;
    }
    if (file.size === 0 || file.size > 50 * 1024 * 1024) {
      onError('Choose an audio file between 1 byte and 50 MB.');
      return;
    }
    setBusy(true);
    setStatus(`Uploading ${file.name}…`);
    let uploaded = false;
    try {
      const client = requireSupabase();
      const storage = client.storage.from('music');
      const path = `${songId}/${crypto.randomUUID()}.${extension}`;
      // The bucket's RLS policy restricts this write to manager accounts.
      const { error } = await storage.upload(path, file, {
        contentType, cacheControl: '3600', upsert: false,
      });
      if (error) throw error;
      uploaded = true;
      const { data: { publicUrl } } = storage.getPublicUrl(path);
      setUrl(publicUrl);
      setStatus('Audio uploaded. Saving its link to this song…');
      await saveUrl(publicUrl);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      // Keep a successfully uploaded URL available for retry. A failed network
      // response can arrive after the server has already saved the song, so
      // deleting the uploaded object here could break its current source.
      setStatus(uploaded
        ? 'Upload complete. Press Save source to retry linking this file to the song.'
        : 'Upload failed. Your existing audio source is unchanged.');
      onError(error instanceof Error ? error.message : 'Could not upload this audio file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset disabled={busy} style={{ border: '1px solid var(--line, #ffffff24)', margin: '16px 0', padding: 16 }}>
      <legend style={{ padding: '0 6px', fontSize: 13 }}>Audio source</legend>
      <label htmlFor={`${fieldId}-url`} style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
        Audio file URL or YouTube link
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          id={`${fieldId}-url`} type="url" value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…" aria-describedby={`${fieldId}-status`}
          style={{ flex: '1 1 260px', minWidth: 0, padding: '10px 12px', background: '#0c0d12', color: 'inherit', border: '1px solid #ffffff30' }}
        />
        <button type="button" className="outline-button small-button" onClick={() => void saveSource()} disabled={!url.trim()}>
          Save source
        </button>
      </div>
      <label htmlFor={`${fieldId}-file`} style={{ display: 'block', fontSize: 12, margin: '16px 0 8px' }}>
        Upload audio · up to 50 MB
      </label>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={fileInputRef} id={`${fieldId}-file`} type="file"
          accept=".mp3,.m4a,.mp4,.ogg,.oga,.wav,.flac,.webm,audio/*"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          style={{ minWidth: 0, flex: '1 1 240px', fontSize: 12 }}
        />
        <button type="button" className="solid-button small-button" onClick={() => void uploadAudio()} disabled={!file}>
          {busy ? 'Working…' : 'Upload and save'}
        </button>
      </div>
      <p style={{ fontSize: 11, opacity: 0.65, margin: '10px 0 0' }}>MP3, M4A, OGG, WAV, FLAC or WebM. Upload music you have permission to stream.</p>
      <p id={`${fieldId}-status`} role="status" style={{ fontSize: 12, margin: status ? '10px 0 0' : 0 }}>{status}</p>
    </fieldset>
  );
}
