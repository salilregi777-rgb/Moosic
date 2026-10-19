import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, Disc3, LoaderCircle, Music2, Sparkles, WandSparkles } from 'lucide-react';
import { SongArtwork } from '@/components/song-artwork';
import { supabaseApiRequest } from '@/lib/supabase';
import './ai-studio.css';

type Track = { id?: number; title: string; artist: string; duration: string; mood: 'Sad' | 'Happy' | 'Neutral' | 'Exhausted' | 'Angry'; language?: string; genre?: string; audioUrl?: string; coverUrl?: string };
type Message = { role: 'user' | 'assistant'; content: string };
type Pick = { song: { id: number }; reason: string };
function aiError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : '';
  if (/endpoint not found/i.test(message)) return 'Supabase is missing the AI route. Deploy the updated api Edge Function; if you have not already, add OPENAI_API_KEY under Edge Function Secrets first.';
  if (/receiving too many requests|rate limit|\b429\b/i.test(message)) return 'OpenAI rejected this request (HTTP 429). If it keeps happening, check that API billing is active and the project usage limit has room; a temporary rate limit usually clears after a short wait.';
  return message || 'The AI service is unavailable right now.';
}
export function AIStudio({ tracks, playTrack }: { tracks: Track[]; playTrack: (track: Track) => void }) {
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: 'Hi, I’m your MOOSIC companion. I can help you find something for the way you feel, talk through what you’ve been listening to, or chat about anything on your mind.' }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [summary, setSummary] = useState('');
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  const getRecommendations = async () => {
    setRecommendationBusy(true); setError('');
    try {
      const result = await supabaseApiRequest('/ai', { method: 'POST', body: JSON.stringify({ action: 'recommendations' }) }) as { picks: Pick[]; summary: string };
      setPicks(result.picks || []); setSummary(result.summary || '');
    } catch (cause) { setError(aiError(cause)); }
    finally { setRecommendationBusy(false); }
  };
  const send = async (event: FormEvent) => {
    event.preventDefault(); const content = draft.trim(); if (!content || busy) return;
    const next = [...messages, { role: 'user' as const, content }]; setMessages(next); setDraft(''); setBusy(true); setError('');
    try {
      const result = await supabaseApiRequest('/ai', { method: 'POST', body: JSON.stringify({ action: 'chat', messages: next.slice(-12) }) }) as { answer: string };
      setMessages(current => [...current, { role: 'assistant', content: result.answer }]);
    } catch (cause) { setError(aiError(cause)); }
    finally { setBusy(false); }
  };

  return <section className="page ai-studio">
    <header className="ai-studio-heading"><span className="eyebrow"><Sparkles size={13} /> YOUR LISTENING, UNDERSTOOD</span><h1>A little more<br /><em>in tune.</em></h1><p>A listening companion that learns from your history and meets you where you are.</p></header>
    <div className="ai-studio-grid">
      <section className="ai-card recommendations-card" aria-labelledby="ai-recommendations-title">
        <div className="ai-card-heading"><div className="ai-card-icon"><WandSparkles size={18} /></div><div><span className="eyebrow">MADE FOR YOUR ROTATION</span><h2 id="ai-recommendations-title">Your next records</h2></div></div>
        <p className="ai-card-intro">Thoughtful picks based on what you play, finish, skip, and save.</p>
        <button className="solid-button ai-recommend-button" onClick={getRecommendations} disabled={recommendationBusy}><WandSparkles size={15} />{recommendationBusy ? 'Listening back…' : picks.length ? 'Refresh my picks' : 'Read my listening'}</button>
        {summary && <p className="ai-summary" aria-live="polite">{summary}</p>}
        <div className="ai-pick-list">
          {picks.map(pick => {
            const track = tracks.find(item => item.id === pick.song.id);
            if (!track) return null;
            return <article className="ai-pick" key={track.id}><SongArtwork track={track} className="ai-pick-art" /><div className="ai-pick-copy"><strong>{track.title}</strong><span>{track.artist}</span><small>{pick.reason}</small></div><button type="button" className="ai-play-button" aria-label={`Play ${track.title}`} onClick={() => playTrack(track)}><Music2 size={16} /></button></article>;
          })}
        </div>
        {!picks.length && !recommendationBusy && !error && <div className="ai-empty"><Disc3 size={33} /><p>Your listening history becomes the liner notes for this mix.</p></div>}
      </section>

      <section className="ai-card ai-chat-card" aria-labelledby="ai-chat-title">
        <div className="ai-card-heading"><div className="ai-card-icon"><Bot size={18} /></div><div><span className="eyebrow">HERE FOR THE CONVERSATION</span><h2 id="ai-chat-title">Ask MOOSIC</h2></div><span className="ai-online-dot" aria-label="Assistant ready" /></div>
        <div className="ai-chat-messages" ref={scrollRef} aria-live="polite">{messages.map((message, index) => <div key={index} className={`ai-message ai-message--${message.role}`}><span>{message.role === 'assistant' ? 'M' : 'YOU'}</span><p>{message.content}</p></div>)}{busy && <div className="ai-thinking"><LoaderCircle size={15} /> Finding the right words…</div>}</div>
        {error && <p className="ai-error" role="alert">{error}</p>}
        <form className="ai-chat-form" onSubmit={send}><textarea aria-label="Message MOOSIC" placeholder="Tell me what you’re in the mood for…" value={draft} onChange={event => setDraft(event.target.value)} maxLength={500} rows={2} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(event as unknown as FormEvent); } }} /><button type="submit" aria-label="Send message" disabled={busy || !draft.trim()}><ArrowUp size={18} /></button></form>
        <p className="ai-footnote">Messages go to OpenAI for replies. Listening history is sent only when you request personalized picks; MOOSIC does not save chat.</p>
      </section>
    </div>
  </section>;
}
