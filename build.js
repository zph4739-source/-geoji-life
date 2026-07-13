#!/bin/sh
# 선택: 6개 소스를 하나의 game.js로 결합(배포 최적화용).
# 평소엔 index.html이 6개를 순서대로 로드하므로 실행할 필요 없습니다.
cat data.js core.js economy.js rivals.js ui.js main.js > game.js
echo "built game.js ($(wc -l < game.js) lines)"