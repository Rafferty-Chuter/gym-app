# J. Do the report's findings say the right thing? (E1, 2026-10-21)

The founder asked for a test with fake data showing the report could be useful: responses rooted in the person's own data and in what evidence supports. Examples given were short sleep with little progress, too little protein, eating too much, and someone logging very little who still isn't losing weight. For the last case: is under-logging the likely cause, and does it matter?

Script: `npx tsx scripts/study-findings.ts 30` (raw output in `J-findings-study.json`). Each simulated person has a known truth: what they eat, how much of it they log, how they sleep and what their lifts do. Each is run through the real engine for 11 weeks, with 3 weeks of training before the goal. The findings (`lib/physique/findings.ts`) are read at the end. Every persona runs 30 times with different random seeds.

## Results

| Person | Should say | Said it | False alarms |
|---|---|---|---|
| Lean gain, 6.1 h sleep, lifts flat | Short sleep, lifts not progressing | 25/30 | 0/30 |
| Cut, 6.1 h sleep, lifts down 7% | Short sleep, lifts down | 30/30 | 0/30 |
| Cut, protein about 1.1 g/kg | Protein under 1.8 g/kg | 30/30 | 0/30 |
| Lean gain, protein about 1.3 g/kg | Protein under 1.6 g/kg | 30/30 | 0/30 |
| Lean gain, eats 600 over target | Gaining faster than useful | 30/30 | 0/30 |
| Cut, 1,100 kcal deficit, lifts down 7% | Losing fast while lifts drop | 30/30 | 0/30 |
| Eats maintenance (2,800), logs 60% | Food likely missing from the log | 30/30 | 0/30 |
| Control: cut on target, good sleep and protein | Nothing | – | 0/30 |
| Control: lean gain on target, lifts rising | Nothing | – | 0/30 |
| Control: eats 2,200, logs all, losing | Nothing | – | 0/30 |
| Control: 58 kg woman eating 1,500, logs all, losing | Nothing | – | 0/30 |
| Control: 6.1 h sleep but lifts rising 6% | Nothing | – | 0/30 |
| Control: good sleep, lifts flat | Nothing | – | 0/30 |
| Control: logs 85% of what is eaten | Nothing | – | 0/30 |

The 5 misses for short sleep on a lean gain are runs where session noise made flat lifts read as progressing more than 1% over eight weeks. In those runs the finding stays silent rather than guessing.

## Logging very little and not losing weight

**Can the report see it?** Yes, when the log is well short. Take an 85 kg man eating 2,800 kcal at maintenance. The finding fires every time when he logs 65% or less, 19 of 30 times at 70%, 2 of 30 at 75%, and never at 80% or more. The test is energy balance. A steady weight means what is logged is what is burned. When that comes out under resting energy plus about 10% for digestion (Mifflin-St Jeor; Westerterp 2004), it can't be the whole intake. Moderate under-logging (15 to 25%) can't be told apart from a low maintenance, so the report says nothing about it.

**Does it matter?** It depends how short the log is. The weekly trace below is for someone who logs about the target but eats more (true maintenance 2,800):

| | Maintenance the app estimates | Target | Logged | Really eaten | Weight over 10 weeks |
|---|---|---|---|---|---|
| Logs everything | 2,760 to 3,000 | 2,330 to 2,560 | about 2,400 | about 2,400 | 84.0 to 80.7 kg |
| Logs 70% | 2,020 to 2,250 | 1,590 to 1,810 | about 1,650 | about 2,350 | 83.9 to 80.5 kg |
| Logs 55% | 1,540 to 1,820 | 1,500 (the floor) | about 1,500 | about 2,700 | 84.3 to 83.3 kg |

- **Consistent, moderate under-logging barely matters for weight.** The maintenance estimate is worked out from the same log, so it reads low by the same share. Targets set from it still move the scale at the planned rate: 70% logged lost the same weight as logging everything. Only the numbers shown are low.
- **Heavy under-logging stalls the goal.** At 55% the estimate wants targets under the 1,500 kcal safety floor. The target stops there, the person "eats" 1,500 on paper and about 2,700 in reality, and the weight barely moves. This is the "logging very little and not losing weight" case. The findings name it with the person's own numbers and the doubly labelled water evidence (Lichtman 1992; Schoeller 1995; Hill and Davies 2001).
- **It also skews the food numbers.** Protein read from an incomplete log is understated. With a 60% log the protein finding fired 30/30 before it was held back; it is now suppressed whenever the log looks incomplete.

## Eating over target on a cut

That case is covered by the report's Food and weight card, which does the energy-balance arithmetic. For a cut eaten 400 kcal over target it reads: "Weight came down slower than planned. Over the last 4 weeks you ate 2,783 kcal a day, 290 over the 2,493 target. Against maintenance of about 2,908, that is a 125 kcal deficit, about 0.1 kg of fat loss a week."

## Thresholds and their evidence

| Finding | Gate | Source |
|---|---|---|
| Food missing from the log | 21+ food days and 14+ weigh-ins in 4 weeks; what is burned under 1.1 × resting energy | Mifflin 1990; Westerterp 2004; Lichtman 1992; Schoeller 1995; Hill and Davies 2001 |
| Short sleep, lifts not progressing | 14+ nights averaging under 7 h; on a cut a main lift down 3%+ over 8 weeks, otherwise main lifts together under +1% | Watson 2015; Nedeltcheva 2010 (cut); Saner 2020; Knowles 2018 |
| Protein low | 14+ complete days; under 1.8 g/kg on a cut, 1.6 otherwise | Helms 2014 (cut); Morton 2018 |
| Gaining faster than useful | Trend over 4 weeks above the lean-gain band + 0.15 %/wk | Iraki 2019; Garthe 2013 |
| Losing fast while lifts drop | Trend faster than −1.0 %/wk with a main lift down 3%+ | Garthe 2011 |
