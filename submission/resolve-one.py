# VANTAGE ONE — the single Resolve script for the Take03 film (free-edition safe).
# Run it any time (Workspace -> Scripts -> Vantage ONE). It is IDEMPOTENT and NEVER
# deletes or moves clips, so your manual work (V2 titles, trims, VO) is always safe.
#
# What it does each run:
#   1. Imports any missing media (10 beats + intro + endcard + punch-in climax)
#   2. If the film timeline doesn't exist yet -> builds it via CreateTimelineFromClips
#      (intro -> beats 01-04 -> PUNCH-IN climax -> 06-10 -> endcard). If it exists ->
#      just opens it, leaving every manual edit untouched.
#   3. Refreshes MARKERS only (wipes and re-adds at the true clip positions)
#   4. Prints a status report: every timeline, the current clip list, total runtime,
#      and a WARNING if the film is over the 3:00 hackathon cap.
#
# Export stays separate: Workspace -> Scripts -> Vantage Export Final.
import os
try:
    resolve
except NameError:
    import DaVinciResolveScript as bmd
    resolve = bmd.scriptapp("Resolve")

proj = resolve.GetProjectManager().GetCurrentProject()
mp = proj.GetMediaPool()
FPS = 60
BEAT_DIR = r"C:\Users\Ryan\OneDrive\Desktop\vantage-beats"
TIMELINE = "Take03 - film"
CAP_SECONDS = 180  # 3:00 hackathon hard cap

# Film order. Flip these to change what a FRESH build includes (existing timelines
# are never rebuilt - to apply a change, Remove the timeline in the bin and rerun).
USE_INTRO   = False   # 4s animated open; pushes runtime over the cap unless trimmed
USE_PUNCHIN = True    # slow push-in on the climax
USE_ENDCARD = True    # 6s animated credits

FILM = []
if USE_INTRO:
    FILM.append(("00-intro.mp4", "Green", "INTRO", "Animated open"))
FILM += [
    ("01-open-anchors.mp4",  "Blue", "B1 Open + anchors", "An AI market desk - swappable animated anchors"),
    ("02-nflx-add.mp4",      "Blue", "B2 ADD NFLX",       "One command - the whole desk retargets"),
    ("03-owner.mp4",         "Blue", "B3 owner",          "Answers from a live DataHub catalog"),
    ("04-lineage.mp4",       "Blue", "B4 lineage",        "Lineage in a second - every upstream"),
    (("05-climax-refusal-PUNCHIN.mp4" if USE_PUNCHIN else "05-climax-refusal.mp4"),
                             "Yellow", "B5 CLIMAX refusal", "No owner recorded - the model is REMOVED from the path"),
    ("06-foobar-refusal.mp4","Blue", "B6 foobar refusal", "It won't invent a column either"),
    ("07-report-modal.mp4",  "Blue", "B7 report + modal", "Drafts a report you can review, edit, export"),
    ("08-stock-school-teach.mp4", "Blue", "B8 Stock School",  "Teaches - fully local, no keys, no credits"),
    ("09-stock-school-quiz.mp4",  "Blue", "B8b quiz correct", "Interactive lessons, scored"),
    ("10-close.mp4",         "Blue", "B9 close",          "Clean desk"),
]
if USE_ENDCARD:
    FILM.append(("11-endcard.mp4", "Green", "END CARD", "VANTAGE - repo - Apache-2.0"))

# marker metadata for EVERY known clip (used when refreshing markers on any timeline,
# regardless of which variants the timeline actually contains)
ALL_META = {
    "00-intro":                ("Green",  "INTRO",             "Animated open"),
    "01-open-anchors":         ("Blue",   "B1 Open + anchors", "An AI market desk - swappable animated anchors"),
    "02-nflx-add":             ("Blue",   "B2 ADD NFLX",       "One command - the whole desk retargets"),
    "03-owner":                ("Blue",   "B3 owner",          "Answers from a live DataHub catalog"),
    "04-lineage":              ("Blue",   "B4 lineage",        "Lineage in a second - every upstream"),
    "05-climax-refusal-PUNCHIN":("Yellow","B5 CLIMAX refusal", "No owner recorded - the model is REMOVED from the path"),
    "05-climax-refusal":       ("Yellow", "B5 CLIMAX refusal", "No owner recorded - the model is REMOVED from the path"),
    "06-foobar-refusal":       ("Blue",   "B6 foobar refusal", "It won't invent a column either"),
    "07-report-modal":         ("Blue",   "B7 report + modal", "Drafts a report you can review, edit, export"),
    "08-stock-school-teach":   ("Blue",   "B8 Stock School",   "Teaches - fully local, no keys, no credits"),
    "09-stock-school-quiz":    ("Blue",   "B8b quiz correct",  "Interactive lessons, scored"),
    "10-close":                ("Blue",   "B9 close",          "Clean desk"),
    "11-endcard":              ("Green",  "END CARD",          "VANTAGE - repo - Apache-2.0"),
}

def dur_str(frames):
    s = int(frames) // FPS
    return "%d:%02d" % (s // 60, s % 60)

# ---- 1. media ----
def collect(folder, acc):
    for c in folder.GetClipList():
        acc[c.GetName()] = c
    for sf in folder.GetSubFolderList():
        collect(sf, acc)
    return acc

pool = collect(mp.GetRootFolder(), {})
wanted = [f for (f, _, _, _) in FILM]
missing = [f for f in wanted if f not in pool]
if missing:
    paths = [os.path.join(BEAT_DIR, f) for f in missing]
    bad = [p for p in paths if not os.path.exists(p)]
    if bad:
        print("!! files not on disk:"); [print("   " + b) for b in bad]; raise SystemExit
    resolve.GetMediaStorage().AddItemListToMediaPool(paths)
    pool = collect(mp.GetRootFolder(), {})
    print("imported %d missing clip(s)" % len(missing))

# ---- 2. timeline: prefer the OPEN film timeline, else by name, build only if absent ----
def is_film(t):
    if not t:
        return False
    names = [(x.GetName() or "") for x in (t.GetItemListInTrack("video", 1) or [])]
    hits = sum(1 for nm in names for frag in ALL_META if frag in nm)
    return hits >= 5  # looks like the film if most beats are on it

tl = proj.GetCurrentTimeline()
if is_film(tl):
    print("using the OPEN film timeline '%s' - manual edits untouched" % tl.GetName())
else:
    tl = None
    for i in range(1, (proj.GetTimelineCount() or 0) + 1):
        t = proj.GetTimelineByIndex(i)
        if t and (t.GetName() == TIMELINE or is_film(t)):
            tl = t
            break
if tl:
    proj.SetCurrentTimeline(tl)
    print("timeline '%s' - opened, manual edits untouched" % tl.GetName())
else:
    clips = [pool.get(f) for f in wanted]
    if not all(clips):
        print("!! missing in pool:", [f for f, c in zip(wanted, clips) if not c]); raise SystemExit
    tl = mp.CreateTimelineFromClips(TIMELINE, clips)
    if not tl:
        print("!! CreateTimelineFromClips failed"); raise SystemExit
    proj.SetCurrentTimeline(tl)
    print("timeline '%s' BUILT (%d clips)" % (TIMELINE, len(clips)))

# ---- 3. refresh markers (markers only - clips are never touched) ----
tl.DeleteMarkersByColor("All")
tl_start = tl.GetStartFrame()
v1 = tl.GetItemListInTrack("video", 1) or []
marks = 0
for it in v1:
    nm = (it.GetName() or "").rsplit(".", 1)[0]
    meta = ALL_META.get(nm)
    if not meta:  # fall back to fragment match (handles renamed/trimmed clips)
        for frag, m in ALL_META.items():
            if frag in nm:
                meta = m
                break
    if meta:
        color, label, note = meta
        if tl.AddMarker(int(it.GetStart() - tl_start), color, label, note, 1):
            marks += 1
print("markers refreshed: %d" % marks)

# ---- 3b. FUSION FX: scripted motion graphics INSIDE each clip's Fusion comp ----
# No timeline inserts (the fragile part) - animated nodes are injected into the clip
# comps themselves. Idempotent: a clip is skipped if it already carries VantageFX
# nodes, and lower-thirds are skipped for any beat that already has a manual V2
# title overlapping it. Delete a clip's FX by opening it on the Fusion page and
# deleting the tools whose names start with VantageFX.
FUSION_LOWER_THIRDS = True   # animated fade/scale-in lower-third per beat
FUSION_CLIMAX_ZOOM  = True   # keyframed 8% push-in on the climax (skipped for PUNCHIN clip)

v2 = tl.GetItemListInTrack("video", 2) or []
def has_manual_title(item):
    s, e = item.GetStart(), item.GetEnd()
    return any((t.GetStart() < e and t.GetEnd() > s) for t in v2)

def comp_range(comp):
    a = comp.GetAttrs() or {}
    return int(a.get("COMPN_RenderStart", 0)), int(a.get("COMPN_RenderEnd", 100))

def keyframe(tool, input_name, comp, frames_values):
    # animate a NUMBER input: attach a BezierSpline, then index-assign keyframes
    setattr(tool, input_name, comp.BezierSpline)
    inp = getattr(tool, input_name)
    for fr, val in frames_values:
        inp[fr] = val

fx_l3 = fx_zoom = fx_skip = 0
for it in v1:
    nm = (it.GetName() or "").rsplit(".", 1)[0]
    meta = ALL_META.get(nm)
    if not meta:
        for frag, m in ALL_META.items():
            if frag in nm:
                meta = m
                break
    if not meta or nm.startswith(("00-intro", "11-endcard")):
        continue  # cards animate themselves
    try:
        comp = it.GetFusionCompByIndex(1)
        if not comp:
            continue
        if comp.FindTool("VantageFX_L3") or comp.FindTool("VantageFX_Zoom"):
            fx_skip += 1
            continue  # already done on a previous run
        rs, re_ = comp_range(comp)
        mi = comp.FindTool("MediaIn1")
        mo = comp.FindTool("MediaOut1")
        if not (mi and mo):
            continue
        comp.Lock()
        try:
            head = mi  # whatever currently feeds the graph

            # climax push-in: keyframed Transform 1.00 -> 1.08 across the clip
            if FUSION_CLIMAX_ZOOM and "climax" in nm and "PUNCHIN" not in nm:
                xf = comp.AddTool("Transform")
                xf.SetAttrs({"TOOLS_Name": "VantageFX_Zoom"})
                xf.Input = head
                keyframe(xf, "Size", comp, [(rs, 1.0), (re_, 1.08)])
                head = xf
                fx_zoom += 1

            # animated lower-third: TextPlus faded/scaled in over the first ~0.5s
            if FUSION_LOWER_THIRDS and not has_manual_title(it):
                txt = comp.AddTool("TextPlus")
                txt.SetAttrs({"TOOLS_Name": "VantageFX_L3txt"})
                txt.StyledText = meta[2]
                txt.Font = "Arial"
                txt.Style = "Bold"
                txt.Size = 0.045
                txt.Center = {1: 0.5, 2: 0.09}
                # backing shadow so it reads over any UI
                txt.Enabled4 = 1            # shading element 4 = background border
                mrg = comp.AddTool("Merge")
                mrg.SetAttrs({"TOOLS_Name": "VantageFX_L3"})
                mrg.Background = head
                mrg.Foreground = txt
                keyframe(mrg, "Blend", comp, [(rs, 0.0), (rs + 30, 1.0)])          # fade in
                keyframe(txt, "Size", comp, [(rs, 0.038), (rs + 30, 0.045)])       # grow in
                head = mrg
                fx_l3 += 1

            if head is not mi:
                mo.Input = head
        finally:
            comp.Unlock()
    except Exception as ex:
        print("  fusion fx failed on %s: %s" % (nm, ex))
print("fusion fx: %d lower-thirds, %d zooms, %d already done" % (fx_l3, fx_zoom, fx_skip))

# ---- 4. status report ----
print("--- timelines ---")
cur_name = tl.GetName()
for i in range(1, (proj.GetTimelineCount() or 0) + 1):
    t = proj.GetTimelineByIndex(i)
    if not t:
        continue
    items = t.GetItemListInTrack("video", 1) or []
    total = sum((x.GetEnd() - x.GetStart()) for x in items)
    print("  %-22s V1:%2d  %s%s" % (t.GetName(), len(items), dur_str(total),
                                    "   <== CURRENT" if t.GetName() == cur_name else ""))
print("--- current timeline '%s' ---" % cur_name)
for ti in range(1, (tl.GetTrackCount("video") or 0) + 1):
    items = tl.GetItemListInTrack("video", ti) or []
    print("  V%d (%d):" % (ti, len(items)), ", ".join((x.GetName() or "?")[:26] for x in items))
total = sum((x.GetEnd() - x.GetStart()) for x in v1)
secs = int(total) // FPS
print("runtime: %s" % dur_str(total))
if secs > CAP_SECONDS:
    print("!! OVER the 3:00 cap by %ds - trim beat tails or drop 10-close" % (secs - CAP_SECONDS))
else:
    print("under the 3:00 cap with %ds margin - good" % (CAP_SECONDS - secs))
print("next: V2 titles (manual), VO on Fairlight, then Scripts -> Vantage Export Final")
