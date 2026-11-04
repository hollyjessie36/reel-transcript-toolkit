# Reel Transcript Toolkit

Convert numbered SRT subtitles to transcript text or a millisecond cue table using Python 3. No extra packages, account or network connection required.

    python srt_export.py example.srt
    python srt_export.py example.srt --csv > cues.csv

The CSV keeps both ends of each cue in integer milliseconds. TXT keeps only the whole-second start for reading. Multiline cues are joined with spaces. Input must be UTF-8 SRT with comma milliseconds; WebVTT and positioned cues are outside scope. The sample dialogue is synthetic, not benchmark data.

The [Media to Words export guide](https://mediatowords.com/instagram-transcript-txt-vs-srt) explains how these timestamp formats are used.

See [subtitle review checklist](checklist.md) and [expected CSV output](example.csv).
