# Library Research Report — Batch: Classic Synthesizer Manufacturers & Their Systems

**Batch selection rationale:** the structural report shows `serge-modular-synthesizer` and the Serge cluster are already the best-connected part of the graph (highest degree node, 21 edges) — not where the coverage gaps are. The real gap is a specific, coherent, high-value one: **10 major synthesizer-manufacturer organizations have zero `creators` or `related` entries of their own**, despite every one of their flagship instruments already crediting them correctly by `ref`, and despite every one of their founders already having a Library person entry that declares `related: part-of` pointing at them. In other words: the edge exists from the person's side and from the instrument's side, but the organization entry itself carries no founder credit — a real, mechanical, well-defined gap rather than a vague "make the graph denser" exercise. This is exactly the "one manufacturer and its systems" batch shape the brief suggests, scaled across the manufacturers who collectively anchor most of the Systems Ontology work already in the Library.

**Batch (26 entries):** arp-instruments, buchla-and-associates, e-mu-systems, moog-music, oberheim-electronics, ppg, roland-corporation, waldorf-music, synton, new-england-digital (10 orgs) · alan-pearlman, robert-moog, don-buchla, dave-rossum, tom-oberheim, wolfgang-palm, cameron-jones, sydney-alonso (8 founders, all already in the Library) · arp-2600, minimoog-model-d, buchla-100, oberheim-sem, ppg-wave-2, e-mu-emulator-ii, roland-jupiter-8, synclavier-ii (8 flagship systems, spot-checked for correct manufacturer-credit direction).

---

## Organizations

### arp-instruments
**Current:** "Founded by Alan R. Pearlman as Tonus Inc. in 1969... ARP Instruments." No `creators`, no `related`.
**Sources consulted:**
- Wikipedia, "ARP Instruments" — https://en.wikipedia.org/wiki/ARP_Instruments (accessed 2026-07-30): founding year 1969, Lexington MA, $100,000 of Pearlman's own money plus investor funds; **co-founders Lewis G. Pollock and David Friend**.
- The Alan R. Pearlman Foundation, "About ARP" — https://alanrpearlmanfoundation.org/about/ (accessed 2026-07-30): corroborates Pearlman as founder, no mention of Pollock/Friend on this page specifically.
**Confirmed:** Founding year (1969), Pearlman as principal founder, "Tonus Inc." original name — all already correct in the entry.
**Suspected gap:** Pollock and Friend as co-founders. Only located via Wikipedia (one source); the Foundation's own page doesn't name them, which is mildly conflicting for a claim this specific. **Probable**, not Verified — recommend as a review item, not an auto-patch.
**Missing relationship:** No `creators` role:founder citing Alan Pearlman (fact already stated correctly in this entry's own prose — Verified, safe to patch).

### buchla-and-associates
**Current:** "Founded by Don Buchla in 1962... Buchla & Associates." No `creators`, no `related`.
**Sources consulted:**
- Buchla (official company site), "History" — https://buchla.com/history/ (accessed 2026-07-30): primary/official source, confirms 1962 Berkeley founding, commission from Morton Subotnick and Ramon Sender of the San Francisco Tape Music Center.
- Wikipedia, "Buchla Electronic Musical Instruments" — https://en.wikipedia.org/wiki/Buchla_Electronic_Musical_Instruments (accessed 2026-07-30): corroborates.
**Confirmed:** Verified via official primary source. Founding year, location, and founder all correct as written.
**Missing relationship:** No `creators` role:founder citing Don Buchla (Verified, safe to patch).

### e-mu-systems
**Current:** "Founded in Santa Cruz in 1972 by Dave Rossum, E-mu Systems..." No `creators`, no `related`.
**Sources consulted:**
- Wikipedia, "E-mu Systems" — https://en.wikipedia.org/wiki/E-mu_Systems (accessed 2026-07-30): company officially formed 27 November 1972 by **Dave Rossum and Scott Wedge** together; initial 1971 effort also involved Steve Gabriel and Jim Ketcham, who did not continue.
- MIDI.org, "Dave Rossum, The Visionary Behind EMU and Rossum Electro" — https://midi.org/dave-rossum-emu-and-rossum-electro (accessed 2026-07-30): corroborates Wedge as co-founder and later president.
**Suspected error:** The entry credits Rossum alone as founder. Two independent sources (Wikipedia + MIDI.org, an industry standards body) agree Scott Wedge was co-founder, not just an early employee. **Probable** (no primary/official E-mu source exists post-acquisition to check against) — recommend adding Wedge as a second founder credit as a review item.
**Missing relationship:** No `creators` at all. The Rossum-as-founder half of this is already stated in the entry's own prose (Verified, safe to patch for Rossum alone); Wedge is a separate, better-sourced-elsewhere addition (Probable, review item).

### moog-music
**Current:** "Renamed from the R.A. Moog Company in 1971, Moog Music built the voltage-controlled synthesizers designed by Robert Moog..." No `creators`, no `related`.
**Sources consulted:**
- Wikipedia, "Moog Music" — https://en.wikipedia.org/wiki/Moog_Music (accessed 2026-07-30): muSonics acquired the R.A. Moog Company in 1971 and renamed it "Moog Musonics"; the name changed again to "Moog Music, Inc." in **1972**, not 1971.
- referenceforbusiness.com, "Moog Music, Inc." company profile — https://www.referenceforbusiness.com/history2/63/Moog-Music-Inc.html (accessed 2026-07-30): corroborates the two-step 1971→1972 rename.
**Suspected error:** The entry says the "Moog Music" name dates to 1971; both sources agree the actual "Moog Music" name wasn't adopted until 1972, with an intermediate "Moog Musonics" name in 1971. **Probable** correction — this is a specific enough factual claim (an exact rename year) that I'd want a second, ideally primary, source before patching; flagging as a review item rather than downgrading confidently in a patch.
**Missing relationship:** No `creators`. Robert Moog's role is already correctly described in prose (Verified for adding him with a role like designer/founder — see note below on role choice, since "R.A. Moog Company" and "Moog Music" are technically not identically the same entity Moog personally founded, given the muSonics ownership change).

### oberheim-electronics
**Current:** "Founded by Tom Oberheim in Santa Monica in 1969..." No `creators`, no `related`.
**Sources consulted:**
- Wikipedia, "Oberheim Electronics" — https://en.wikipedia.org/wiki/Oberheim_Electronics (accessed 2026-07-30): confirms 1969, Santa Monica, Tom Oberheim.
- MIDI.org, "Tom Oberheim and Oberheim Electronics" — https://midi.org/tom-oberheim-and-oberheim-electronics (accessed 2026-07-30): corroborates.
**Confirmed:** Founding year, location, founder all correct as written. Two independent, reasonably authoritative sources agree.
**Missing relationship:** No `creators` role:founder citing Tom Oberheim (Verified, safe to patch).

### ppg
**Current:** "Palm Products GmbH (PPG), founded by Wolfgang Palm in Hamburg..." No `creators`, no `related`.
**Sources consulted:**
- Wikipedia, "Palm Products GmbH" — https://en.wikipedia.org/wiki/Palm_Products_GmbH (accessed 2026-07-30): confirms Hamburg, 1975, Wolfgang Palm.
- Wikipedia, "Wolfgang Palm" — https://en.wikipedia.org/wiki/Wolfgang_Palm (accessed 2026-07-30): corroborates.
**Confirmed:** As written.
**Missing relationship:** No `creators` role:founder citing Wolfgang Palm (Verified, safe to patch).

### roland-corporation
**Current:** "Founded in Osaka in 1972 by Ikutaro Kakehashi, formerly of Ace Tone..." No `creators`, no `related`.
**Sources consulted:**
- Wikipedia, "Roland Corporation" — https://en.wikipedia.org/wiki/Roland_Corporation (accessed 2026-07-30): incorporated 18 April 1972, Osaka, Kakehashi, ¥33 million capital, prior Ace Tone/Ace Electronic Industries background.
- Japan Times obituary, "Synthesizer pioneer Ikutaro Kakehashi, founder of Roland, dies at 87" — https://www.japantimes.co.jp/culture/2017/04/03/music/synthesizer-pioneer-ikutaro-kakehashi-founder-roland-dies-87/ (accessed 2026-07-30): corroborates, established news source.
**Confirmed:** As written.
**Missing relationship:** No `creators` role:founder citing Ikutaro Kakehashi — **but Kakehashi has no Library person entry at all.** See New Entry Candidates below; this is a "missing relationship" that can't be filled until the person entry exists.

### waldorf-music
**Current:** "Founded in 1988 by Wolfgang Düren, PPG's former German distributor..." No `creators`, no `related`.
**Sources consulted:**
- Wikipedia, "Waldorf Music" — https://en.wikipedia.org/wiki/Waldorf_Music (accessed 2026-07-30): confirms 1988, Wolfgang Düren, prior role as PPG's German distributor, town of Waldorf near Bonn.
**Confirmed:** As written — and worth noting this entry already correctly avoids the common conflation of crediting Wolfgang *Palm* as Waldorf's founder; it correctly names Wolfgang *Düren* instead. No correction needed.
**Missing relationship:** No `creators` — but **Wolfgang Düren has no Library person entry.** See New Entry Candidates.

### synton
**Current:** "Founded in 1973 by Felix Visser..." No `creators`, no `related`.
**Sources consulted:** Reused from this session's own earlier research (WebSearch, unrecorded exact URLs at the time — flagging this as a methodology gap: this entry's founding claim was not captured with a citable source URL when originally written). Not independently re-verified in this pass.
**Status:** **Unresolved** pending a citable source — flagging for a future research pass rather than asserting confidence here.
**Missing relationship:** No `creators`. Felix Visser has no Library person entry (see New Entry Candidates) — the `synton-fenix-i`/`synton-fenix-ii` entries already reference him only as a plain, unref'd name.

### new-england-digital
**Current:** "Founded in Norwich, Vermont in 1976 by Cameron Jones and Sydney Alonso... before closing in 1993." No `creators`, no `related`.
**Sources consulted:**
- Wikipedia, "New England Digital" — https://en.wikipedia.org/wiki/New_England_Digital (accessed 2026-07-30): infobox gives operating years "(1976–1993)"; prose elsewhere states the company "closed its doors in 1992," with a successor support organization, "Synclavier Company," formed by ex-employees in 1993.
**Suspected internal source conflict:** Wikipedia's own infobox (1993) and body text (1992, with a 1993 successor) disagree with each other. This entry's "closing in 1993" may conflate the original company's closure with the successor's founding. **Unresolved** — do not patch either direction without a better source (a contemporary trade-press article or court/business filing would resolve this).
**Confirmed:** Founding year (1976), founders (Jones and Alonso), location all correct and already well-sourced from this session's earlier, more detailed research (Jon Appleton's instigating role, etc.).
**Missing relationship:** No `creators`. Both founders are already correctly named in prose (Verified, safe to patch for both).

---

## People (spot-check: do their existing entries correctly cross-reference the org, and is the underlying bio accurate?)

All eight already declare `related: {ref: <org>, relation: part-of}` pointing at their respective organization — confirmed correct and consistent with each org's own prose. No errors found in this pass for alan-pearlman, robert-moog, don-buchla, tom-oberheim, wolfgang-palm, cameron-jones, or sydney-alonso; their existing bios match the sources reused above.

**dave-rossum**: bio and relationships confirmed accurate against the same E-mu sourcing above. One observation, not an error: the entry doesn't mention Scott Wedge by name at all, which is consistent (correct) given the entry's own framing focuses on Rossum's circuit-design side of E-mu, but is worth knowing if Wedge is ever added as a full person entry — a natural `collaborator-of` candidate.

---

## Systems (spot-check: manufacturer/designer credit direction)

arp-2600, minimoog-model-d, buchla-100, oberheim-sem, ppg-wave-2, e-mu-emulator-ii, synclavier-ii all correctly credit both an individual designer (by `ref`) and the manufacturing organization (by `ref`) in `creators`. **No errors found** — this confirms the System→Org edge direction is sound end-to-end for this batch, which is exactly what you'd want the audit to establish before trusting the graph's overall shape.

**roland-jupiter-8** is the one exception: it credits only "Roland Corporation" generically as manufacturer, with no individual engineer named. This may simply be accurate (Roland's design process was less identified with a single named engineer than, say, ARP or Moog), or there may be a specific named designer this entry is missing. **Unresolved** — flagging as a low-priority research item rather than guessing a name.

---

## New Entry Candidates surfaced by this pass

Two organizations in this exact batch have named founders who lack their own Library person entries — both real, well-documented figures, not speculative additions:

1. **Ikutaro Kakehashi** (Roland Corporation's founder) — extensively documented (Wikipedia, Japan Times obituary, multiple industry retrospectives), designed the TR-808/TB-303/TR-909, co-drove the MIDI standard alongside Dave Smith (who is already in the Library and already has a `collaborator-of`-shaped gap here). High priority.
2. **Wolfgang Düren** (Waldorf Music's founder) — documented via Wikipedia; thinner sourcing than Kakehashi. Medium priority.

See `proposals.yaml` for full structured entries.
