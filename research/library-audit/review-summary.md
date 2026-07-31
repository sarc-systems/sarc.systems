# Library Audit — Review Summary

**Batch:** 10 major synthesizer-manufacturer organizations, their 8 founders (already in the Library), and 8 flagship instruments — selected because the structural report showed these 10 organizations have zero `creators`/`related` entries despite every one of their founders and flagship instruments already pointing *at* them by `ref`. Full detail in `structural-report.md`, `research-report.md`, and machine-readable form in `proposals.yaml`.

## Safe factual corrections (Verified — in `verified.patch`)

Nine reciprocal founder/designer `creators` credits, one per organization, added to entries whose own existing prose already states the fact and whose founder already links back via `related: part-of`:

- arp-instruments → Alan R. Pearlman (founder)
- buchla-and-associates → Don Buchla (founder) — corroborated against Buchla's own official history page
- e-mu-systems → Dave Rossum (founder)
- oberheim-electronics → Tom Oberheim (founder) — two independent sources
- ppg → Wolfgang Palm (founder)
- new-england-digital → Cameron Jones + Sydney Alonso (both founder)

**Held out of the patch despite being well-sourced**, for specific reasons — see each entry in `proposals.yaml`:
- **moog-music** (p004): fact is solid but the *role* (designer vs founder) is an editorial call given Moog Music's convoluted 1971 muSonics-acquisition history — needs a decision, not just a fact-check.
- **roland-corporation** (p007) and **waldorf-music** (p008): the founders (Kakehashi, Düren) aren't yet Library entries, so adding the credit now would create a dangling reference. Blocked on the new-entry candidates below.
- **synton** (p009): the founder claim (Felix Visser) couldn't be traced to a citable source in this pass — downgraded to Unresolved rather than patched.

## High-value relationship additions (Probable — needs a decision, not yet patched)

- **E-mu Systems**: add Scott Wedge as co-founder alongside Dave Rossum (Wikipedia + MIDI.org agree; no primary source available to fully verify). Would also need a new person entry for Wedge.
- **ARP Instruments**: add Lewis G. Pollock and David Friend as co-founders (Wikipedia names them; the Pearlman Foundation's own site doesn't — worth a second source before committing). Would need two new person entries.
- **Moog Music**: correct the rename timeline — current entry says "Moog Music" dates to 1971; two secondary sources agree the actual sequence was R.A. Moog Company → Moog Musonics (1971) → Moog Music, Inc. (1972).

## Possible removals

None identified in this batch. No entries were found with unsupported or contradicted claims that should be removed outright.

## Ontology questions

None raised by this batch — all 10 organizations cleanly fit the existing `organization` public type, and all 8 systems cleanly fit `system`/`instrument` with the existing designer/manufacturer creator-role pattern. This batch is a good sign for the ontology's stability: the "Systems Ontology" ruleset (System coequal with Work, containment via `part-of` only) required no exceptions here.

## New-entry candidates

1. **Ikutaro Kakehashi** (founder, Roland Corporation) — high priority, well-documented (Wikipedia + a Japan Times obituary), and a natural `collaborator-of` link to Dave Smith over MIDI's co-development. Creating this entry unblocks the Roland founder-credit proposal (p007).
2. **Wolfgang Düren** (founder, Waldorf Music) — medium priority, thinner sourcing (Wikipedia only so far); recommend a second source before creating. Unblocks p008.

(Scott Wedge, Lewis G. Pollock, and David Friend are also new-entry candidates implied by the Probable-tier co-founder proposals above, but are secondary to a specific proposal decision rather than free-standing — see `proposals.yaml` p101/p103.)

## Unresolved research

- **New England Digital's closure date**: Wikipedia's own infobox (1993) and body text (company closed 1992, successor "Synclavier Company" formed 1993) conflict with each other. The current entry's "1993" may be conflating the original closure with the successor's founding. Needs a contemporary trade-press or filing source — not resolvable from the sources checked in this pass.
- **Roland Jupiter-8's designer credit**: every other flagship system in this batch credits an individual designer plus the manufacturer; the Jupiter-8 credits only Roland Corporation. May be accurate (team-designed, no single named engineer, unlike ARP/Moog/Oberheim's boutique-era instruments) or may be a genuine gap — flagging rather than guessing a name.
- **Synton's founder attribution**: the entry names Felix Visser as founder, but no citable source could be traced for it in this pass (it appears to be carried over from an earlier, uncited research session). Needs a fresh source-backed check.

## Data-integrity notes (from the structural report, resolved in this pass)

The structural report flagged 3 near-duplicate titles; all three are resolved and require no content change:
- `c-language` / `cpp-language`: confirmed false positive — the detector's title-normalization strips `+` characters, so "C" and "C++" both collapse to "c". A detector artifact, not a content problem (worth a note for whoever next touches `structural_report.py`, out of scope here).
- `jaap-vink` / `jaap-vink-recollection-grm`: confirmed legitimate — a person entry and a correctly self-titled Recollection GRM compilation album crediting that person as composer. Standard pattern, not a duplicate.
- `snd` / `snd-band`: previously confirmed intentional in an earlier session.

No dangling references, unknown relation types, unknown creator roles, duplicate `library.id` values, or parse errors were found anywhere in the full 487-entry catalog (not just this batch) — the graph's mechanical integrity is clean.

## Recommended next research batch

The structural report's 65 isolated entries and 154 single-edge entries are the next clear seam — in particular the isolated organizations (STEIM, IPEM, CCRMA-adjacent studios, several national radio electronic-music studios) are exactly the kind of institution that typically has real, findable person/instrument connections just not yet declared (the same shape of gap this batch addressed for manufacturers). A natural next batch: the isolated national/university electronic-music studios (`elektronmusikstudion-ems`, `polish-radio-experimental-studio`, `experimental-studio-of-czechoslovak-radio`, `danish-radio-electronic-music-studio`, `university-of-helsinki-electronic-music-studio`, `university-of-illinois-experimental-music-studios`, `university-of-iowa-electronic-music-studios`, `ipem`, `steim`, `center-for-experimental-music-and-intermedia`) — each is very likely to have composers, directors, or instruments already in the Library that just aren't cross-linked yet.

## Validation

See the bottom of `structural-report.md` for full mechanical integrity results (0 dangling refs, 0 unknown relations/roles, 0 duplicate IDs, 0 parse errors across all 487 entries). `make check` and `scripts/audit-library-images.py` results for this specific patch are reported separately once the patch is validated (see repository audit log / commit for output, not duplicated here to avoid staleness).
