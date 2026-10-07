-- Repair only catalog sources still matching the audited legacy values.
-- Official artist/label links were identified through primary YouTube results
-- and checked with YouTube oEmbed on 2026-10-07. Metadata is not a playback
-- guarantee: reset availability to unknown rather than claiming a source works.
-- Missing sources with ambiguous titles remain untouched. Manager changes to
-- the source URL, song title, or artist are preserved.

with repairs(title, artist_name, old_source, new_source) as (
  values
    -- Adele | https://www.youtube.com/watch?v=hLQl3WQQoQ0
    ('Someone Like You', 'Adele', 'https://www.youtube.com/embed/hHUbLv4ThOo', 'https://www.youtube.com/embed/hLQl3WQQoQ0'),
    -- KatyPerryVEVO | https://www.youtube.com/watch?v=tAp9BKosZXs
    ('I Kissed a Girl', 'Katy Perry', 'https://www.youtube.com/embed/6FOUqQt3Kg0', 'https://www.youtube.com/embed/tAp9BKosZXs'),
    -- Coldplay | https://www.youtube.com/watch?v=yKNxeF4KMsY
    ('Yellow', 'Coldplay', 'https://www.youtube.com/embed/sLprVF6d7Ug', 'https://www.youtube.com/embed/yKNxeF4KMsY'),
    -- CalvinHarrisVEVO | https://www.youtube.com/watch?v=8Ee4QjCEHHc
    ('Slide', 'Calvin Harris', 'https://www.youtube.com/embed/kJQP7kiw9Fk', 'https://www.youtube.com/embed/8Ee4QjCEHHc'),
    -- Pritam - Topic | https://www.youtube.com/watch?v=W8OoagONXmg
    ('Tum Hi Ho Bandhu', 'Moosic Mood Mix', NULL::text, 'https://www.youtube.com/embed/W8OoagONXmg'),
    -- T-Series | https://www.youtube.com/watch?v=JknhdDv9CRc
    ('Uff Teri Adaa', 'Moosic Mood Mix', NULL::text, 'https://www.youtube.com/embed/JknhdDv9CRc'),
    -- T-Series | https://www.youtube.com/watch?v=nj-UhS4ZtQg
    ('Sooraj Ki Baahon Mein', 'Moosic Mood Mix', NULL::text, 'https://www.youtube.com/embed/nj-UhS4ZtQg'),
    -- T-Series | https://www.youtube.com/watch?v=19nnjV93N0s
    ('Phir Kabhi', 'Moosic Mood Mix', NULL::text, 'https://www.youtube.com/embed/19nnjV93N0s'),
    -- Sachin-Jigar - Topic | https://www.youtube.com/watch?v=AsLPGPs5iQk
    ('Jeena Jeena', 'Moosic Mood Mix', NULL::text, 'https://www.youtube.com/embed/AsLPGPs5iQk'),
    -- T-Series | https://www.youtube.com/watch?v=CNZMIhckaA0
    ('Aaoge Jab Tum', 'Moosic Mood Mix', NULL::text, 'https://www.youtube.com/embed/CNZMIhckaA0'),
    -- Pritam - Topic | https://www.youtube.com/watch?v=3chj4ooasmE
    ('Mere Bina', 'Moosic Mood Mix', NULL::text, 'https://www.youtube.com/embed/3chj4ooasmE'),
    -- T-Series | https://www.youtube.com/watch?v=poYtscS7bto
    ('Tum Ho Toh', 'Moosic Mood Mix', NULL::text, 'https://www.youtube.com/embed/poYtscS7bto'),
    -- T-Series | https://www.youtube.com/watch?v=XBr11cQDg-E
    ('Kaisi Hai Ye Rut', 'Moosic Mood Mix', NULL::text, 'https://www.youtube.com/embed/XBr11cQDg-E')
)
update public.songs as song
set audio_url = repairs.new_source,
    is_playable = NULL,
    audio_checked_at = NULL
from repairs, public.artists as artist
where song.artist_id = artist.id
  and song.title = repairs.title
  and artist.name = repairs.artist_name
  and song.audio_url is not distinct from repairs.old_source;
