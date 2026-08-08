# Library image proposals — 2026-08-08

Mode C (research-only) — candidates for three specific image requests from
`todo.txt`'s "work for librarian" batch. Proposal-only per the librarian
agent's hard rules — **no image files were downloaded or added**; a human
needs to fetch, crop as noted, and add each to the entry's bundle, then fill
in `images:` using the suggested fields.

---

## system/synclavier-ii

Entry already carries one image (a Wikimedia Commons front-panel photo,
`rights.status: licensed`). The user-supplied candidate below is a magazine
scan showing the instrument in editorial/period context and would work well
as a **second, gallery** image rather than a replacement for the existing
primary.

- **Source:** https://www.muzines.co.uk/articles/synclavier-i/2568 (the article page hosting the image — cite this, not the raw `.jpg`, per CLAUDE.md's source rule)
- **Raw image (for reference only, not a citable source):** https://www.muzines.co.uk/images_mag/articles/emm/EMM_83_06_synclavier_i_full.jpg
- **Suggested caption:** "Synclavier II, as reviewed in Electronics & Music Maker, June 1983."
- **Suggested credit:** *(leave absent unless a photographer is credited in the article; MuzInes is the magazine-archive source, not a credit)*
- **rights.status:** `unknown` — MuzInes hosts scanned back issues of period UK music-tech magazines without republishing the original publisher's copyright terms; note the caveat.
- **use.basis:** `identification` / `archival` — period editorial coverage of the instrument, kept for documentation alongside the existing panel photo.

## organization/columbia-princeton-electronic-music-center + organization/studio-di-fonologia-musicale-rai-milano

Both already had color Wikimedia Commons photographs as their sole image.
**Handled directly in this session, not left as a proposal:** both images
(plus every other non-logo, non-diagram Organization photo in the catalog —
22 files across 21 entries) were converted to grayscale in place with Python/
Pillow and each entry's `rights.note` updated to record "Converted to
grayscale.", matching the existing precedent already in
`organization/studio-fur-elektronische-musik-des-wdr` (`console.jpg`). See
the commit for the full file list. No new image was fetched — this was an
in-place edit of already-committed bundle assets, not a download of new
third-party material.

## work/dresden-venezia-megaton

Entry currently has no image (`images: []`).

- **Source:** https://www.discogs.com/release/484844-Gordon-Mumma-Dresden-Venezia-Megaton (the Discogs release page — cite this, not the raw CDN image URL below)
- **Raw image (for reference only, not a citable source):** https://i.discogs.com/IZ1YH7RdP7139bRo7rP7EMtLFxKdrh7JfsMa-NjLt1A/rs:fit/g:sm/q:90/h:600/w:589/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTQ4NDg0/NC0xNDQyNDY2ODY2/LTM0NjYuanBlZw.jpeg
- **Suggested caption:** "Original 1979 Lovely Music LP artwork."
- **Suggested role:** `cover`
- **rights.status:** `unknown`
- **use.basis:** `identification` — label cover art used to identify the edition, same pattern as `weather-sky`'s cover.

(Separately, and not an image task: the entry's `related` now carries an
edge to `william-s-burroughs` — see commit — since the album's third piece,
*Megaton for William Burroughs*, is dedicated to him.)

## person/conny-plank

Entry currently has no image (`images: []`). Two candidates supplied by the
user; neither page is a clean "provenance" page in the CLAUDE.md sense (an
official archive/estate/publisher), so both land at `rights.status: unknown`
— flagging honestly rather than guessing a license.

**Option 1** (needs a crop, per the user's own note — the background beyond
the photo itself isn't part of the image and should be cropped out before
adding):
- **Source:** https://www.sr-mediathek.de/mediathek-images/16zu9/1714131161_conny_plank_.jpg — this is itself a raw image URL with no contextual page found; if a specific SR (Saarländischer Rundfunk) article or Mediathek program page hosting it can be located, cite that page instead per CLAUDE.md's source rule. Flag this to the human for a better source page before use.
- **rights.status:** `unknown`

**Option 2:**
- **Source:** https://www.loudandquiet.com/files/2017/11/conny-plank-press-101117-3-2560x2700.jpg — also a raw file URL; the containing Loud and Quiet article (search their site for "Conny Plank" press photos, November 2017) would be the correct citable `source` if located.
- **Suggested credit:** *(unclear from the filename alone — likely a press/promo photo from the "Conny Plank: The Potential of Noise" documentary press kit, 2017; needs confirmation before crediting)*
- **rights.status:** `unknown`

Neither option is ready to add as-is: both need the human to locate (or
confirm the absence of) a proper contextual source page, per the site's own
"never a bare CDN image URL as source" rule.
