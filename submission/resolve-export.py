# EXPORT the CURRENT timeline to a YouTube-ready MP4 via Resolve's own render pipeline.
# Paste into DaVinci Resolve Console (Workspace -> Console -> Py3) whenever you want the
# latest cut exported. This renders exactly what's on the timeline (your trims, VO, titles).
# Output: C:\Users\Ryan\OneDrive\Desktop\vantage-take-03-final.mp4
try:
    resolve
except NameError:
    import DaVinciResolveScript as bmd
    resolve = bmd.scriptapp("Resolve")

proj = resolve.GetProjectManager().GetCurrentProject()
tl = proj.GetCurrentTimeline()
if not tl:
    print("!! no current timeline - open the cut timeline first"); raise SystemExit
print("exporting timeline:", tl.GetName())

resolve.OpenPage("deliver")
# Try the built-in YouTube preset; fall back to explicit H.264 MP4 if the name differs.
try:
    proj.LoadRenderPreset("YouTube 1080p")
except Exception as e:
    print("preset note:", e)
proj.SetCurrentRenderFormatAndCodec("mp4", "H264")
proj.SetRenderSettings({
    "TargetDir": r"C:\Users\Ryan\OneDrive\Desktop",
    "CustomName": "vantage-take-03-final",
    "SelectAllFrames": True,
})
jid = proj.AddRenderJob()
ok = proj.StartRendering(jid)
print("render started:", ok, "job", jid)
print("-> Desktop\\vantage-take-03-final.mp4  (progress shows in the Deliver page render queue)")
