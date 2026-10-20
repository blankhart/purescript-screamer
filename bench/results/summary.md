# js-framework-benchmark on this machine

Written by `bench/measure.mjs`. Mean total duration in ms (script time in
parentheses), from a Chrome trace of each run, as krausest/js-framework-benchmark
measures it; see that script for the method. Memory is in MB.

* halogen (non-keyed): chromium 156.0.8078.4, 15 runs, 2026-10-20T03:04:10.226Z
* screamer: chromium 156.0.8078.4, 15 runs, 2026-10-20T03:16:32.939Z
* solid: chromium 156.0.8078.4, 15 runs, 2026-10-20T02:58:20.661Z
* vanillajs: chromium 156.0.8078.4, 15 runs, 2026-10-20T02:52:30.669Z

| | create1k | replace1k | update10th | select | swap | remove | create10k | append1k | clear |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| halogen | 60.3 (14.0) | 32.4 (9.8) | 59.0 (30.1) | 38.6 (30.9) | 47.7 (24.1) | 53.8 (14.9) | 653.9 (166.1) | 78.1 (22.8) | 35.5 (32.2) |
| screamer | 59.1 (13.4) | 63.7 (17.5) | 32.9 (5.3) | 7.2 (0.9) | 34.2 (1.8) | 33.5 (0.9) | 623.1 (109.8) | 69.7 (14.0) | 22.1 (18.4) |
| solid | 52.1 (5.8) | 57.6 (10.8) | 29.7 (2.2) | 8.0 (1.3) | 34.3 (1.6) | 27.2 (0.7) | 553.8 (50.9) | 59.2 (5.9) | 22.5 (19.0) |
| vanillajs | 48.4 (3.2) | 52.1 (6.5) | 28.2 (1.0) | 7.0 (0.6) | 32.7 (0.5) | 28.4 (0.7) | 530.9 (31.6) | 57.4 (3.4) | 21.2 (16.5) |

| | readyMemory | runMemory | createClear5Memory |
|---|---:|---:|---:|
| halogen | 1.4 | 6.3 | 6.5 |
| screamer | 1.3 | 4.6 | 1.6 |
| solid | 1.1 | 3.3 | 1.3 |
| vanillajs | 1.1 | 2.4 | 1.2 |
