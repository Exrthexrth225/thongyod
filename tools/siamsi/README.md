# เซียมซี verse checker (#131)

`sticks.py` holds the 28 slips with syllables separated by `.` (the source of `apps/web/src/config/fortunes.ts`).
`check.py` checks every slip against the กลอนสุภาพ rules: 7–9 syllables per วรรค, outer rhymes (สดับ → word 3 of รับ,
รับ → รอง, รอง → word 3 of ส่ง, ส่ง → รับ of the next บท), end tones, and the closing เอย.

```
pip install pythainlp python-crfsuite
python3 tools/siamsi/check.py tools/siamsi/sticks.py
```

Edit a verse here first, run the check, then copy the line (without dots) into `fortunes.ts`.
