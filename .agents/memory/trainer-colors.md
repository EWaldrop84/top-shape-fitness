---
name: Trainer color map
description: Canonical display_color key → hex mapping for all 5 trainers; used across AdminCalendar, AdminPayroll, TrainerSchedule.
---

## Trainer color keys (stored in `trainers.display_color`)

| Trainer | display_color | Hex      |
|---------|---------------|----------|
| Eric    | cyan          | #06A29E  |
| Patrick | banana        | #F6C026  |
| Emma    | grape         | #8B5CF6  |
| Nick    | tomato        | #F97316  |
| Jack    | basil         | #16A34A  |

**Why:** These are the canonical hex values the owner specified. banana and grape hex values differ from older defaults (#E8B84B, #7C3AED) — always use the values above.

**How to apply:**
- `TRAINER_HEX` constant defined in AdminCalendar.tsx and TrainerSchedule.tsx
- `TRAINER_PALETTE` in AdminPayroll.tsx
- AdminCalendar: appointment blocks use `backgroundColor: trainerHex` (solid fill, white text)
- TrainerSchedule: appointment cards use `borderLeftColor: viewingTrainerHex` (left-border accent)
- If adding a new trainer, add their display_color key to all three TRAINER_HEX/TRAINER_PALETTE maps
