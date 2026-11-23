# Checks กลอนสุภาพ rules for the เซียมซี verses. Syllables are separated by '.' in the source.
import sys, importlib.util, re
from pythainlp.khavee import KhaveeVerifier
from pythainlp.util import tone_detector
K = KhaveeVerifier()
MARKS = set('่้๊๋')
NAMES = ['สดับ', 'รับ', 'รอง', 'ส่ง']

def rh(a, b):
    try: return K.is_sumpus(a, b)
    except Exception: return False

OVERRIDE = {'ทรัพย์': 'h'}  # tone_detector misreads the silent ย์
def tone(s):
    if s in OVERRIDE: return OVERRIDE[s]
    try: return tone_detector(s)
    except Exception: return '?'

def check(no, stick, prev_errors):
    errs = []
    w = [v.split('.') for v in stick['verse']]
    if len(w) != 16: errs.append(f'{len(w)} วรรค (need 16)')
    for i, syl in enumerate(w):
        if not 7 <= len(syl) <= 9: errs.append(f'วรรค {i+1} has {len(syl)} syllables: {"".join(syl)}')
    for b in range(len(w) // 4):
        s1, s2, s3, s4 = w[b*4:b*4+4]
        tag = f'บท {b+1}'
        # tones
        t1, t2, t3, t4 = (tone(x[-1]) for x in (s1, s2, s3, s4))
        if t1 == 'm': errs.append(f'{tag} สดับ ends mid tone: {s1[-1]}')
        if t2 not in ('r', 'l', 'f'): errs.append(f'{tag} รับ ends {t2}: {s2[-1]}')
        if t3 != 'm' or MARKS & set(s3[-1]): errs.append(f'{tag} รอง ends {t3}/mark: {s3[-1]}')
        if t4 != 'm' or MARKS & set(s4[-1]): errs.append(f'{tag} ส่ง ends {t4}/mark: {s4[-1]}')
        # outer rhymes
        if not (rh(s1[-1], s2[2]) or (len(s2) > 4 and rh(s1[-1], s2[4]))): errs.append(f'{tag} สดับ {s1[-1]} !~ รับ[3] {s2[2]}')
        if rh(s1[-1], s2[1]) and not rh(s1[-1], s2[2]): errs.append(f'{tag} ชิงสัมผัส รับ[2] {s2[1]}')
        if not rh(s2[-1], s3[-1]): errs.append(f'{tag} รับ {s2[-1]} !~ รอง {s3[-1]}')
        if s2[-1] == s3[-1]: errs.append(f'{tag} สัมผัสซ้ำ {s2[-1]}')
        if not (rh(s3[-1], s4[2]) or (len(s4) > 4 and rh(s3[-1], s4[4]))): errs.append(f'{tag} รอง {s3[-1]} !~ ส่ง[3] {s4[2]}')
        if b > 0:
            p4 = w[b*4-1]
            if not rh(p4[-1], s2[-1]): errs.append(f'{tag} prev ส่ง {p4[-1]} !~ รับ {s2[-1]}')
            if p4[-1] == s2[-1]: errs.append(f'{tag} ซ้ำ with prev ส่ง {s2[-1]}')
    if w and w[-1][-1] != 'เอย': errs.append('last วรรค must end with เอย')
    return errs

spec = importlib.util.spec_from_file_location('sticks', sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
total = 0
for no, st in sorted(m.STICKS.items()):
    e = check(no, st, None); total += len(e)
    print(f'ใบ {no} ({st["level"]}): ' + ('OK' if not e else f'{len(e)} problems'))
    for x in e: print('   -', x)
print('levels', {l: sum(1 for s in m.STICKS.values() if s['level'] == l) for l in ('good', 'fair', 'bad')}, 'problems', total)
