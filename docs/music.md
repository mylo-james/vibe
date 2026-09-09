# Catalog and music intake

Vibe serves local, credited audio files. The current 10 recordings are marked CC0 1.0 on their linked OpenGameArt source pages, checked on 2026-09-09. Source pages identify the uploaders and artists. Artist credits are retained even where the license does not require attribution.

| Artist | Selection | Source |
| --- | --- | --- |
| Holizna | Chills | [Original upload](https://opengameart.org/content/chills) |
| Chris Murphy | Sherwood | [Original upload](https://opengameart.org/content/sherwood) |
| section31 | Through the Portal | [Original upload](https://opengameart.org/content/through-the-portal) |
| OMF-Games | Lofi Hip Hop Loop | [Original upload](https://opengameart.org/content/lofi-hip-hop-loop) |
| Bobjt | Our expanse | [Original upload](https://opengameart.org/content/our-expanse) |
| Juhani Junkala | Five action chiptunes | [Original collection](https://opengameart.org/content/5-chiptunes-action) |

[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) allows copying and redistribution under its dedication and fallback terms. A site's free download button is not enough: verify the individual recording's permission. Streaming-service access and many background-music licenses do not authorize redistributing standalone audio files in a player.

To add a recording:

1. Review its original source, named artist and exact license. Record any attribution conditions. Do not infer a license from another track on the same site.
2. Download from the verified source. If it is an archive, record the chosen entry. Record the SHA-256 of the original audio file.
3. Convert to a browser-playable MP3 if needed, keeping the source unmodified elsewhere:
   `ffmpeg -i source.ogg -map_metadata -1 -codec:a libmp3lame -b:a 160k public/music/track-key.mp3`
4. Add an entry to `data/catalog.json` using its existing fields. Use a stable, unique `audioPath`, accurate duration, artist and collection, original URL, license URL, verification date, original/output checksums and the conversion note. The current `sourceDate` is the source upload date, not a verified original composition date.
5. Run `npm run check` and `npm run catalog:sync`, then verify playback, seeking, search and the `/credits` entry in a browser.

The importer updates existing tracks by `audioPath`, preserving song IDs and saved playlists. Removing an entry from the JSON file does not delete existing database rows or user memberships. Withdrawal/removal needs an explicit data migration and asset removal so the effect on listeners is reviewable. The seeder intentionally refuses broad automatic undo for the same reason.

Current conversion: 160 kbps MP3 with metadata stripped, no compositional edits. The catalog includes game cues and loops shorter than a full song. Total running time is approximately 14.4 minutes.
