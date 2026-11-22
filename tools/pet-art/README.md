# Pet art pipeline (DECISIONS #80)

Turns a 4×3 pose sheet (`image/13-dragon-poses.png`, `image/14-fish-poses.png`) into the 12 WebP poses in
`apps/web/src/assets/pets/v2/<species>/`. Pose order (row by row): main, blink (eyes closed), happy, wave, shy,
play1, play2, play3, sleep, eat, celebrate, yawn.

Needs Python 3 with `pillow numpy scipy vtracer playwright` and a Chrome/Chromium.

```bash
export PET_WORK=pet-work && mkdir -p $PET_WORK
cp image/13-dragon-poses.png $PET_WORK/dragon-sheet.png
cp image/14-fish-poses.png   $PET_WORK/fish-sheet.png
python3 tools/pet-art/segment.py   # 12 poses per sheet, alpha cleaned, sizes printed
python3 tools/pet-art/place.py     # one shared canvas per species: same scale, same baseline, centred on the body
python3 tools/pet-art/fix_dragon_eat.py   # remove the extra small mouth in the dragon eat pose (looked like a nose)
python3 tools/pet-art/trace.py dragon:main dragon:happy …   # trace ×4 → render 720 px → out-<species>-<pose>.webp
```

Then build the blink frame from the traced main + eyes-closed frames (only the eye area changes; see the commit
that added this folder), copy `out-*.webp` into `assets/pets/v2/<species>/<pose>.webp`, update `aspect` in
`components/pet/species.ts` (canvas w / h printed by place.py), and run the frame checks before pushing:
every move inside its box on iPhone SE / 15 Pro Max / iPad, no two drawings at once when poses change.

Rules for new art: same character, same scale in every pose, transparent background, no shadows, no effects
(the app draws sparks, hearts, puffs, bubbles, z).


## Baby / teen stages (DECISIONS #105)

3×2 sheets (`image/15-dragon-baby.png`, `image/16-dragon-teen.png`), poses row by row: main, blink, happy, eat, sleep, shy.

```bash
python3 tools/pet-art/stage.py image/15-dragon-baby.png apps/web/src/assets/pets/v2/dragon-baby
python3 tools/pet-art/stage.py image/16-dragon-teen.png apps/web/src/assets/pets/v2/dragon-teen
```

Placed on the adult canvas (720×581) with one scale, same baseline, body centred; no tracing. Other poses reuse one of the six (`fill()` in species.ts).

## Sticker sheets (game stickers, racers, souvenirs)

```bash
python3 tools/pet-art/grid.py image/17-game-stickers.png apps/web/src/assets/games 4 4 headsUp,spy,insider,spectrum,codewords,taboo,draw,bomb,mostLikely,neverHave,dice,cups,wheel,fortune,finger,race
python3 tools/pet-art/grid.py image/18-racers.png apps/web/src/assets/racers 4 2 cat,shiba,bunny,duck,frog,penguin,panda,koala --baseline --min 0.06
python3 tools/pet-art/grid.py image/26-racers-fall.png apps/web/src/assets/racers-fall 4 2 cat,shiba,bunny,duck,frog,penguin,panda,koala --baseline --min 0.06
python3 tools/pet-art/grid.py image/27-racers-sleep.png apps/web/src/assets/racers-sleep 4 2 cat,shiba,bunny,duck,frog,penguin,panda,koala --baseline --min 0.005
python3 tools/pet-art/grid.py image/29-cups-bottle.png apps/web/src/assets/party 3 2 cup,bottle,thongyod,candy,cookie,donut --size 256 --min 0.005
python3 tools/pet-art/grid.py image/30-pack-stickers.png apps/web/src/assets/packs 4 4 food,campus,animals,actions,jobs,city,things,sports,life,brain,travel,online,future,chaos,mixed,fantasy --size 160 --min 0.003
python3 tools/pet-art/grid.py image/28-race-props.png apps/web/src/assets/race-props 3 2 rock,peel,bee,zzz,question,exclaim --size 160 --min 0.005
```

Eggs (image/10, 11) and effects (image/09) were cut once with small scripts (tight crop per cell / per connected piece) into `assets/eggs` and `assets/effects` (#115).
