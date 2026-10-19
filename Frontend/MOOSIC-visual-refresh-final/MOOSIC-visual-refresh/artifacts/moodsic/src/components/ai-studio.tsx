import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, Disc3, ListMusic, LoaderCircle, Music2, Sparkles, WandSparkles } from 'lucide-react';
import { SongArtwork } from '@/components/song-artwork';
import { supabaseApiRequest } from '@/lib/supabase';
import './ai-studio.css';

type Track = { id?: number; title: string; artist: string; duration: string; mood: 'Sad' | 'Happy' | 'Neutral' | 'Exhausted' | 'Angry'; language?: string; genre?: string; audioUrl?: string; coverUrl?: string };
type Pick = { song: { id: number }; reason: string };
type GeneratedPlaylist = { name: string; description: string; picks: Pick[] };
type SaveablePlaylist = { id: string; name: string; mood: Track['mood']; count: number; description: string; trackTitles: string[]; isCustom?: boolean };
type Message = { role: 'user' | 'assistant'; content: string; playlist?: GeneratedPlaylist; saved?: boolean };
function aiError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : '';
  if (/endpoint not found/i.test(message)) return 'Supabase is missing the AI route. Deploy the updated api Edge Function and add NVIDIA_API_KEY under Edge Function Secrets.';
  if (/receiving too many requests|rate limit|\b429\b/i.test(message)) return 'NVIDIA AI is temporarily unavailable or has reached its usage limit. Check your NVIDIA API Catalog limits and try again shortly.';
  if (/NVIDIA_API_KEY|NVIDIA rejected/i.test(message)) return 'Connect your NVIDIA API key in Supabase: Project Settings → Edge Functions → Secrets, then redeploy the api function.';
  return message || 'The AI service is unavailable right now.';
}

export function AIStudio({ tracks, playTrack, onSavePlaylist }: { tracks: Track[]; playTrack: (track: Track) => void; onSavePlaylist: (playlist: SaveablePlaylist) => Promise<boolean | void> | boolean | void }) {
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: 'Hi, I’m your MOOSIC companion. I can help you find something for the way you feel, talk through what you’ve been listening to, or chat about anything on your mind.' }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [recommendation, setRecommendation] = useState<GeneratedPlaylist | null>(null);
  const [summary, setSummary] = useState('');
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [recommendationSaved, setRecommendationSaved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  const tracksFor = (playlist: GeneratedPlaylist) => playlist.picks.flatMap(pick => {
    const track = tracks.find(item => item.id === pick.song.id);
    return track ? [{ track, reason: pick.reason }] : [];
  });
  const save = async (playlist: GeneratedPlaylist, key: string, done: () => void) => {
    const selected = tracksFor(playlist).map(item => item.track);
    if (!selected.length) { setError('These tracks are no longer in your catalog. Ask MOOSIC to make a fresh playlist.'); return; }
    const counts = new Map<Track['mood'], number>();
    selected.forEach(track => counts.set(track.mood, (counts.get(track.mood) || 0) + 1));
    const mood = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    setSavingKey(key); setError('');
    try {
      const saved = await onSavePlaylist({ id: `ai-${Date.now()}`, name: playlist.name, mood, count: selected.length, description: playlist.description, trackTitles: selected.map(track => track.title), isCustom: true });
      if (saved !== false) done();
    } catch (cause) { setError(aiError(cause)); }
    finally { setSavingKey(''); }
  };
  const getRecommendations = async () => {
    setRecommendationBusy(true); setError(''); setRecommendationSaved(false);
    try {
      const result = await supabaseApiRequest('/ai', { method: 'POST', body: JSON.stringify({ action: 'recommendations' }) }) as { name: string; picks: Pick[]; summary: string };
      setRecommendation({ name: result.name || 'Your next records', description: result.summary || 'A mix shaped around your listening.', picks: result.picks || [] }); setSummary(result.summary || '');
    } catch (cause) { setError(aiError(cause)); }
    finally { setRecommendationBusy(false); }
  };
  const send = async (event: FormEvent) => {
    event.preventDefault(); const content = draft.trim(); if (!content || busy) return;
    const next = [...messages, { role: 'user' as const, content }]; setMessages(next); setDraft(''); setBusy(true); setError('');
    try {
      const result = await supabaseApiRequest('/ai', { method: 'POST', body: JSON.stringify({ action: 'chat', messages: next.slice(-12).map(({ role, content }) => ({ role, content })) }) }) as { answer: string; playlist?: GeneratedPlaylist | null };
      setMessages(current => [...current, { role: 'assistant', content: result.answer || 'I’m here. What kind of sound are you looking for?', ...(result.playlist?.picks?.length ? { playlist: result.playlist } : {}) }]);
    } catch (cause) { setError(aiError(cause)); }
    finally { setBusy(false); }
  };
  const playlistCard = (playlist: GeneratedPlaylist, key: string, saved: boolean, markSaved: () => void) => <section className="ai-generated-playlist" aria-label={`${playlist.name} playlist`}>
    <div className="ai-generated-heading"><div className="ai-generated-art"><SongArtwork track={tracksFor(playlist)[0]?.track || { title: playlist.name, artist: 'MOOSIC', duration: '0:00', mood: 'Neutral' }} /></div><div className="ai-generated-copy"><span className="eyebrow"><ListMusic size={12} /> MOOSIC MIX · {tracksFor(playlist).length} TRACKS</span><h3>{playlist.name}</h3><p>{playlist.description}</p></div></div>
    <ol className="ai-track-list">{tracksFor(playlist).map(({ track, reason }, index) => <li className="ai-track-row" key={`${key}-${track.id}`}><span className="ai-track-index">{String(index + 1).padStart(2, '0')}</span><SongArtwork track={track} className="ai-track-art" /><div className="ai-track-copy"><strong>{track.title}</strong><span>{track.artist}{reason ? ` · ${reason}` : ''}</span></div><button type="button" className="ai-play-button" aria-label={`Play ${track.title}`} onClick={() => playTrack(track)}><Music2 size={15} /></button></li>)}</ol>
    <button type="button" className="solid-button ai-save-playlist" disabled={saved || savingKey === key || !tracksFor(playlist).length} onClick={() => void save(playlist, key, markSaved)}><ListMusic size={15} />{saved ? 'Added to my playlists' : savingKey === key ? 'Saving playlist…' : 'Add to my playlists'}</button>
  </section>;

  return <section className="page ai-studio">
    <header className="ai-studio-heading"><span className="eyebrow"><Sparkles size={13} /> YOUR LISTENING, UNDERSTOOD</span><h1>A little more<br /><em>in tune.</em></h1><p>A listening companion that learns from your history and meets you where you are.</p></header>
    <div className="ai-studio-grid">
      <section className="ai-card recommendations-card" aria-labelledby="ai-recommendations-title">
        <div className="ai-card-heading"><div className="ai-card-icon"><WandSparkles size={18} /></div><div><span className="eyebrow">MADE FOR YOUR ROTATION</span><h2 id="ai-recommendations-title">Your next records</h2></div></div>
        <p className="ai-card-intro">A complete playlist built from what you play, finish, skip, and save.</p>
        <button className="solid-button ai-recommend-button" onClick={getRecommendations} disabled={recommendationBusy}><WandSparkles size={15} />{recommendationBusy ? 'Listening back…' : recommendation ? 'Make another playlist' : 'Make my playlist'}</button>
        {recommendation && <>{playlistCard(recommendation, 'recommendations', recommendationSaved, () => setRecommendationSaved(true))}<p className="ai-summary" aria-live="polite">{summary}</p></>}
        {!recommendation && !recommendationBusy && !error && <div className="ai-empty"><Disc3 size={33} /><p>Your listening history becomes the liner notes for this mix.</p></div>}
      </section>

      <section className="ai-card ai-chat-card" aria-labelledby="ai-chat-title">
        <div className="ai-card-heading"><div className="ai-card-icon"><Bot size={18} /></div><div><span className="eyebrow">HERE FOR THE CONVERSATION</span><h2 id="ai-chat-title">Ask MOOSIC</h2></div><span className="ai-online-dot" aria-label="Assistant ready" /></div>
        <div className="ai-chat-messages" ref={scrollRef} aria-live="polite">{messages.map((message, index) => <div key={index} className={`ai-message ai-message--${message.role}`}><span>{message.role === 'assistant' ? 'M' : 'YOU'}</span><div className="ai-message-body"><p>{message.content}</p>{message.playlist && playlistCard(message.playlist, `chat-${index}`, Boolean(message.saved), () => setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, saved: true } : item)))}</div></div>)}{busy && <div className="ai-thinking"><LoaderCircle size={15} /> Finding the right words…</div>}</div>
        {error && <p className="ai-error" role="alert">{error}</p>}
        <form className="ai-chat-form" onSubmit={send}><textarea aria-label="Message MOOSIC" placeholder="Ask for a playlist, or tell me what’s on your mind…" value={draft} onChange={event => setDraft(event.target.value)} maxLength={500} rows={2} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(event as unknown as FormEvent); } }} /><button type="submit" aria-label="Send message" disabled={busy || !draft.trim()}><ArrowUp size={18} /></button></form>
        <p className="ai-footnote">Playlist tracks are chosen from MOOSIC’s playable catalog. Your listening history is only used when you request personalized picks.</p>
      </section>
    </div>
  </section>;
}
