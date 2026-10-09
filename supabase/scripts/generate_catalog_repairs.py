"""Generate safe, conditional catalog corrections from the reviewed manifest."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sql(value):
 return 'NULL' if value is None else "'"+str(value).replace("'","''")+"'"
manifest=json.loads((ROOT/'catalog-source-repairs-v2.json').read_text())
lines=['-- Reviewed source corrections from the user-supplied reference repository.', '-- Metadata presence is not a promise of future provider availability.', '-- Conditional updates preserve manager edits and existing library relationships.']
for r in manifest['repairs']:
 artist=r.get('new_artist',r['artist']);artist_ref=f'(select id from public.artists where lower(name)=lower({sql(artist)}))'
 updates=[f'audio_url={sql(r["new_source"])}','is_playable=NULL','audio_checked_at=NULL']
 if r.get('new_artist'):
  lines.append(f'insert into public.artists(name) values({sql(artist)}) on conflict do nothing;')
  album=r.get('new_album',r['title'])
  lines.append(f'insert into public.albums(title,artist_id) values({sql(album)},{artist_ref}) on conflict do nothing;')
  updates.extend([f'artist_id={artist_ref}',f'album_id=(select id from public.albums where artist_id={artist_ref} and title={sql(album)})'])
 lines.append(f'update public.songs s set '+','.join(updates)+f' where s.title={sql(r["title"])} and s.artist_id=(select id from public.artists where name={sql(r["artist"])}) and s.audio_url is not distinct from {sql(r["old_source"])};')
(ROOT/'migrations/202610070005_reference_catalog.sql').write_text('\n'.join(lines)+'\n')
print('Wrote',len(manifest['repairs']),'conditional source repairs')
