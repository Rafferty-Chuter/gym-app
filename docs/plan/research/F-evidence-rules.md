# F: Evidence base and judge rules for the physique-coaching engine

Compiled 2026-10-16. Audience: AI agents who will implement these thresholds, and the humans reviewing them.

## How to read this

- **[Primary]** means an RCT, meta-analysis, position stand, consensus statement or narrative review in a peer-reviewed journal. **[Secondary]** means MacroFactor/Stronger By Science articles, app help pages, books or blogs. Secondary sources only fill gaps where no primary data exists, and they are tagged every time.
- **[Derived]** means the threshold is not stated in any source. It is computed from cited data, and the arithmetic is shown. Treat derived numbers as tunable defaults, not facts.
- Confidence levels: **high** means several consistent primary sources in a relevant population. **Medium** means some primary evidence, but the population or design is indirect. **Low** means expert consensus, a case study, or a derived value.
- Most of the evidence comes from small samples (n = 10–60), short durations (2–16 weeks), and often populations that are not the target user (overweight adults, cyclists, military recruits). Very little of it studies intermediate-to-advanced natural lifters directly. In this audience a false positive costs more than silence, so the rules below are deliberately conservative about firing.

### Conventions the rules rely on (implement these first)

| Term | Definition |
|---|---|
| `BW` | Mean of the raw weigh-ins in the analysis window (kg). |
| `rate` (%BW/wk) | OLS slope of raw daily weigh-ins against day number over the window, × 7 ÷ `BW` × 100. Positive means gaining. Do **not** take the slope of an EMA: an EMA with α = 0.1 lags by about (1−α)/α = 9 days [Derived from Walker, below]. |
| `SE_adj` | OLS slope standard error × 1.6. The inflation factor covers day-to-day autocorrelation of water weight [Derived, §5]. Better: estimate each user's lag-1 residual autocorrelation and compute the GLS/Newey-West SE. |
| "Confidently above X" | `(rate − X) / SE_adj > 1.645` (one-sided 95%). "Confidently below X" is the mirror image. |
| Window | Always a whole number of weeks (14/21/28/42 days), so the weekend cycle cancels out [Turicchi 2020; Orsama 2014]. |
| Phase-change mask | Ignore the first 7 days after the start of a cut, a bulk, a diet break, or the return to a deficit. During those days glycogen and gut-content shifts dominate the scale [Hall 2008; Kreitzman 1992]. |
| `e1RM_adj` | `load × (1 + (reps + RIR)/30)`. This is Epley with RIR added. Use only sets with reps + RIR ≤ 12 [Derived; see §7]. Note that `lib/trainingMetrics.ts` currently uses plain Epley without RIR, so a shift from RIR 1 to RIR 3 reads as a drop of about 6–7%. |
| Main lifts | The user's 2–4 most frequently logged compound lifts, each with ≥1 exposure per week. |
| Complete-log day | A day the user marks as fully logged, or a day whose intake is ≥ 60% of their 28-day median. This is a [Derived] heuristic and should be tuned. |

---

## 1. Rate of weight loss for muscle retention

**Evidence**
- Helms, Aragon & Fitschen 2014 (natural bodybuilding contest-prep review) recommend losing **0.5–1.0 %BW/week** to maximise muscle retention. [Primary] https://doi.org/10.1186/1550-2783-11-20
- Garthe et al. 2011 (RCT, n = 24 elite athletes, 4 resistance-training sessions per week) planned 0.7 vs 1.4 %BW/week. The groups actually achieved **0.7 vs 1.0 %/week**. LBM rose 2.1% in the slow group and was unchanged in the fast group (−0.2%). Their conclusion: aim for **0.7 %/week** to gain LBM and 1RM while cutting. [Primary] https://doi.org/10.1123/ijsnem.21.2.97
- Mero et al. 2010 (RCT, n = 15 trained women, about 66 kg, 4 weeks). The group targeting 1 kg/week (a deficit of about 1,100 kcal/day, roughly 1.5 %BW/week) lost 30% of its testosterone and bench 1RM. The group targeting 0.5 kg/week (550 kcal/day deficit) had neither change. [Primary] https://doi.org/10.1186/1550-2783-7-4
- Roberts, Helms, Trexler & Fitschen 2020 (physique-athlete review): during contest prep, "slower rates of weight loss (**≤0.5% of body mass per week**) are preferable for attenuating the loss of fat-free mass". [Primary] https://doi.org/10.2478/hukin-2019-0096
- ISSN position stand (Aragon et al. 2017): the higher the starting body fat, the more aggressive the deficit can be. Slower loss better preserves lean mass in leaner people. [Primary] https://doi.org/10.1186/s12970-017-0174-y
- Murphy & Koehler 2022 (meta-analysis and meta-regression of resistance training in an energy deficit): a deficit of **~500 kcal/day prevented lean-mass gains**. People trying to keep lean mass should "avoid energy deficits >500 kcal/day". Strength gains were *not* significantly impaired by a deficit (ES −0.31, p = 0.28). [Primary] https://doi.org/10.1111/sms.14075
  - [Derived] At 7,700 kcal/kg, 500 kcal/day equals about 0.45 kg/week, which is about 0.5 %BW/week for an 85–95 kg lifter. This agrees with the Roberts 2020 ceiling.

**What counts as "too fast"**
- Above 1.0 %BW/week is outside every primary recommendation. Garthe's fast group at about 1.0%/week did not *lose* LBM, but it gave up the LBM gain. So a rate just above 1.0% is a "watch" signal, not an emergency, unless lifts are also falling.
- Above about 1.5 %BW/week has direct harm data (Mero 2010) and is outside all guidance.
- Users near their goal, or self-identified as advanced or lean, should use an upper bound of **0.7 %/week** (Garthe 2011; Roberts 2020; Aragon 2017). Medium confidence: "lean" cannot be measured reliably (§10), so use the user's stated phase or proximity to goal.

---

## 2. Rate of gain for a lean bulk, by training status

**Evidence**
- Iraki et al. 2019 (off-season bodybuilding review) recommend a surplus of about 10–20% and a target gain of **~0.25–0.5 %BW/week for novice/intermediate** lifters. Advanced lifters "should be more conservative". [Primary] https://doi.org/10.3390/sports7070154
- Helms et al. 2023 (RCT, trained lifters, maintenance vs +5% vs +15% energy for 8 weeks, n = 17 completers). Faster body-mass gain "primarily increase[s] rates of fat gain rather than augmenting 1-RM or muscle thickness". Body-mass change predicted skinfold change (R² = 0.49) but predicted biceps thickness only weakly (R² = 0.24). [Primary] https://doi.org/10.1186/s40798-023-00651-y
- Garthe et al. 2013 (elite athletes, 8–12 weeks): a dietitian-guided surplus raised BW 3.9% vs 1.5% ad libitum. Fat mass rose 15% vs 3%, and **the LBM gain was not different between groups**. [Primary] https://doi.org/10.1080/17461391.2011.643923
- Slater et al. 2019: the energy surplus needed for maximal hypertrophy is unknown, and textbook figures based on tissue energy are unvalidated. [Primary] https://doi.org/10.3389/fnut.2019.00131
- MacroFactor's "How Fast Should You Gain Weight When Bulking?" (Nuckols, 2024) pools Garthe, Helms, Sanchez, Smith and Rozenek. **[Secondary]**
  - Suggested "happy medium" rates in %BW/week: beginner 0.5, intermediate 0.325, experienced 0.15.
  - Conservative to aggressive ranges: beginner 0.2–0.8, intermediate 0.15–0.575, experienced 0.1–0.35.
  - Garthe 2013 re-expressed: about 0.16%/week gave roughly 85% lean/15% fat; about 0.38%/week gave roughly 65/35.
  - Link: https://macrofactor.com/bulking-calculator/
- "Aragon model" of maximum *lean* gain: novice 1–1.5 %BW/month, intermediate 0.5–1, advanced 0.25–0.5. **[Secondary, expert opinion, no peer-reviewed source]** Summary: https://www.rntfitness.co.uk/realistic-rates-muscle-gain/
  - [Derived] Total weight gain must exceed the lean rate, because 15–35% of gain is fat even when gaining slowly (Garthe 2013). Converting gives total-weight targets of roughly novice 0.33–0.5, intermediate 0.16–0.35, advanced 0.08–0.19 %/week.

**Engine bands** (%BW/week; medium confidence on direction, low on the exact edges)

| Status (consistent training years) | Target band | "Gaining faster than needed" if confidently above |
|---|---|---|
| Novice (< 2) | 0.25–0.5 | 0.5 |
| Intermediate (2–4), **the default** | 0.15–0.35 | 0.35 |
| Advanced (≥ 5) | 0.1–0.25 | 0.25 |

The sources conflict. Iraki 2019 puts intermediates at 0.25–0.5. The secondary sources and Helms 2023 support a lower band. These bands follow the more conservative evidence because Helms 2023 is the only controlled study in trained lifters.

---

## 3. Protein, fat, carbohydrate

**Protein**
- Morton et al. 2018 (meta-analysis, 49 RCTs): gains in FFM plateau at **1.62 g/kg/day**. The 95% CI runs 1.03–2.20, so 2.2 is the conservative upper bound. Most included trials were at maintenance or in a surplus. [Primary] https://doi.org/10.1136/bjsports-2017-097608
- Nunes et al. 2022 (meta-analysis, 74 RCTs): more protein produced a small extra LBM gain (SMD 0.22). In adults under 65 the effect was significant at **≥1.6 g/kg/day**. Effects on strength were small. [Primary] https://doi.org/10.1002/jcsm.12922
- In a deficit:
  - Helms, Zinn et al. 2014 (systematic review of lean, trained lifters in caloric restriction): **2.3–3.1 g/kg of FFM**. [Primary] https://doi.org/10.1123/ijsnem.2013-0054
  - ISSN protein position stand (Jäger 2017): 1.4–2.0 g/kg is enough for most people, and 2.3–3.1 g/kg may be needed in hypocaloric phases. [Primary] https://doi.org/10.1186/s12970-017-0177-8
  - Roberts 2020: **1.8–2.7 g/kg** of bodyweight. [Primary]
  - Hector & Phillips 2018: 1.6–2.4 g/kg. [Primary] https://doi.org/10.1123/ijsnem.2017-0273
  - Longland et al. 2016 (RCT, 40% deficit plus hard training): 2.4 g/kg raised LBM by 1.2 kg while 1.2 g/kg kept it unchanged, and fat loss was greater. [Primary] https://doi.org/10.3945/ajcn.115.119339
- In a surplus: Iraki 2019 recommends 1.6–2.2 g/kg. [Primary]
- **Engine thresholds**
  - Deficit: flag if the 7-day mean is < 1.8 g/kg BW (or < 2.3 g/kg FFM when FFM is known) in ≥2 of the last 3 weeks.
  - Maintenance or surplus: flag if < 1.6 g/kg BW.
  - Never comment when protein is already inside the band. PRODUCT.md calls generic "eat more protein" advice an anti-pattern.

**Fat**
- Helms 2014 recommends 15–30% of kcal. Roberts 2020 allows 10–25% during contest prep. Iraki 2019 gives **0.5–1.5 g/kg/day** for the off-season.
- Whittaker & Wu 2021 (meta-analysis, 6 intervention studies, n = 206): low-fat diets lowered total testosterone (SMD −0.38) and free testosterone. [Primary] https://doi.org/10.1016/j.jsbmb.2021.105878
  - A corrigendum was published (https://doi.org/10.1016/j.jsbmb.2025.106880). Its content was not reviewed here, so check whether the effect sizes changed before citing exact numbers.
  - The evidence is modest and does not tie a specific g/kg level to a physique outcome.
- **Engine threshold** [Derived from Iraki 2019 and Helms 2014]: flag (info only) if the 14-day mean is < 0.5 g/kg **and** < 15% of kcal. Low–medium confidence.

**Carbohydrate**
- Iraki 2019 suggests ≥3–5 g/kg/day to fuel training. [Primary]
- Henselmans et al. 2022 (systematic review, 49 studies) found that carbohydrate intake is unlikely to affect strength training performance **in a fed state for workouts of up to about 10 sets per muscle group**. Benefits appear mainly with higher volumes, fasted controls, or twice-daily sessions. Long-term performance was unaffected in 15 of 17 studies. [Primary] https://doi.org/10.3390/nu14040856
- **Engine implication:** do not blame low carbs for lost strength unless session volume is above 10 sets per muscle **and** carbs are below about 3 g/kg. Even then, low confidence.

---

## 4. Energy density of weight change, adaptive thermogenesis, back-calculated expenditure

**Energy density**
- Hall 2008: metabolisable energy density is **39.5 MJ/kg (about 9,400 kcal/kg) for fat mass** and **7.6 MJ/kg (about 1,800 kcal/kg) for lean mass**. The "3,500 kcal/lb" rule (32.2 MJ/kg, about 7,700 kcal/kg) roughly holds only for people starting with more than 30 kg of fat. With less than 25 kg of fat, the energy per kg lost is significantly lower, because more of the loss is lean tissue and water. Glycogen-water effects typically occur within the first week. [Primary] https://doi.org/10.1038/sj.ijo.0803720
- Thomas et al. 2013 found that the 3,500-kcal rule grossly overestimates actual weight loss in seven controlled experiments. [Primary] https://doi.org/10.1038/ijo.2013.51
- Hall & Chow 2013 explain why the static rule fails over time: expenditure falls as weight falls. [Primary] https://doi.org/10.1038/ijo.2013.112
- Hall et al. 2011 (Lancet): weight responds slowly to a sustained intake change, with a half-time of about 1 year. [Primary] https://doi.org/10.1016/S0140-6736(11)60812-X
- Glycogen is stored with **3–4 g of water per g**, so early dieting and refeeds shift the scale without changing fat (Kreitzman 1992). [Primary] https://doi.org/10.1093/ajcn/56.1.292S
- **Engine constants** [Derived]
  - Cut: 7,700 kcal/kg. In lifters who train and eat enough protein, most of the loss should be fat. Garthe 2011's slow group *gained* LBM, which shifts the density towards 9,400, while Forbes-type lean loss would push it lower. The two errors partly cancel.
  - Bulk: **~5,000 kcal/kg**. With 15–35% of gain as fat (Garthe 2013), stored energy is about 3,000–4,500 kcal/kg, plus an unquantified synthesis cost (Slater 2019).
  - Both constants are uncertain by ±30%. The step clamps in the rules table absorb that error.

**Adaptive thermogenesis**
- Leibel, Rosenbaum & Hirsch 1995: holding weight ≥10% below usual lowered total energy expenditure by **6 ± 3 kcal/kg FFM/day** in never-obese subjects, about 400 kcal/day at 70 kg FFM. Roughly half was resting and half non-resting. [Primary] https://doi.org/10.1056/NEJM199503093321001
- Rosenbaum & Leibel 2010 review. [Primary] https://doi.org/10.1038/ijo.2010.184
- Martins et al. 2020 measured RMR adaptation of **−92 kcal/day** while subjects were in deficit. It halved to −38 kcal/day after 4 weeks of weight stability, was absent at 1 year, and did not predict regain. [Primary] https://doi.org/10.1093/ajcn/nqaa220
- Lean athletes show larger relative drops in single cases. In one drug-free bodybuilder, RMR fell from 107% to 81% of predicted over 8 months of prep and largely recovered within 5 months (Pardue 2017). [Primary, n = 1] https://doi.org/10.1123/ijsnem.2017-0064
- Trexler et al. 2014 review. [Primary] https://doi.org/10.1186/1550-2783-11-7
- **Implication:** do not model adaptive thermogenesis separately. Back-calculated expenditure already absorbs it, along with reduced NEAT and lower body mass.

**Why back-calculated expenditure self-corrects**
- Hall & Chow 2011 derived intake changes from longitudinal weight data. Assuming day-to-day weight noise of SD ≈ 0.5 kg, they needed **daily weights for >28 days to get a 95% CI below about 300 kcal/day**. Their worked 28-day example gave ±350 kcal/day. [Primary] https://doi.org/10.3945/ajcn.111.014399
- MacroFactor computes expenditure as logged intake minus the change in stored energy implied by trend weight. **[Secondary]** https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/ and https://help.macrofactorapp.com/dashboard/expenditure
  - The estimate typically settles after about 14–30 days.
  - It starts reacting to a deviation after about 4–5 days.
  - Partial logging (unlogged meals) is the main failure mode.
- Mechanism [Derived]: if a user under-logs by a *constant* X kcal/day, estimated expenditure is also low by X. The next target (estimated expenditure ± desired gap) is "too low" by the same X on paper, but the user's real outcome matches the goal because the bias cancels. This holds only while the logging bias stays constant. A new habit, such as no longer logging cooking oil, breaks it and looks like a drop in expenditure.

---

## 5. Weight noise and minimum data

**Sources of noise**
- Glycogen and water (Kreitzman 1992).
- Weekly rhythm: weight is about 0.35% higher at weekends than midweek (Turicchi 2020, n = 1,421). [Primary] https://doi.org/10.1371/journal.pone.0232152 Orsama 2014 found the same pattern. [Primary] https://doi.org/10.1159/000356147
- Holidays: weight rose about 1.35% over Christmas (Turicchi 2020).
- Menstrual cycle: self-reported fluid retention peaks on day 1 of menses and is lowest mid-follicular (White et al. 2011, 765 cycles). [Primary] https://doi.org/10.1155/2011/138451 Studies that *measured* weight are small and inconsistent and generally report changes under about 1 kg. Treat this as weak evidence.
- Creatine: loading raises total body water by about 1.4% (Bone 2017). [Primary] https://doi.org/10.1249/MSS.0000000000001174
  - Muscle creatine rises about 20% in 6 days at 20 g/day, or over about 28 days at 3 g/day (Hultman 1996). [Primary] https://doi.org/10.1152/jappl.1996.81.1.232
- Sodium: we found no good data that quantifies single-meal effects in free-living lifters. Treat it as unexplained noise.

**Smoothing**
- The Hacker's Diet uses an exponentially smoothed average with a smoothing constant of 0.9, which equals α = 0.1 on the new reading. Walker describes its lag as roughly that of a 20-day simple moving average. [Secondary] https://www.fourmilab.ch/hackdiet/e4/signalnoise.html
- MacroFactor uses a recency-weighted moving average with linear interpolation across missing days. It recommends weighing daily, or at least 3 times per week. **[Secondary]** https://help.macrofactorapp.com/dashboard/weight_trend/
- Libra (Android) is often said to use the Hacker's Diet EMA. **Not verified.**
- Recommendation: use an EMA (α = 0.1) only for the *displayed* trend. Compute *rates* from a regression over a fixed window. An EMA's slope reacts late, so a "too fast" verdict would arrive about 9 days late [Derived].

**How much data before a rate can be trusted** [Derived; assumes residual SD 0.5 kg as in Hall & Chow 2011, AR(1) φ = 0.5, BW 85 kg]

| Window | Weigh-ins/week | 95% CI half-width of rate (%BW/wk), no autocorrelation | Same with φ = 0.5 |
|---|---|---|---|
| 7 d | 7 | ±1.53 | ±1.89 |
| 14 d | 7 | ±0.54 | ±0.79 |
| 14 d | 4 | ±0.69 | ±0.79 |
| 21 d | 7 | ±0.29 | ±0.45 |
| 28 d | 7 | ±0.19 | ±0.30 |
| 28 d | 4 | ±0.25 | ±0.31 |
| 42 d | 7 | ±0.10 | ±0.17 |

What the table means:
- **One week of data says almost nothing**, so the engine must never issue a rate verdict on 7 days.
- With autocorrelated noise, weighing 4 times a week costs little compared with daily weighing.
- Cut verdicts at the 0.5–1.0% band edges need about **21 days**. Bulk verdicts at the 0.25–0.35% edges need **28–42 days**.

Fallback margins when the engine cannot compute `SE_adj` (one-sided 95% at 85 kg; scale by 85/BW):
- 14 d: +0.66 %/week
- 21 d: +0.38 %/week
- 28 d: +0.25 %/week
- 42 d: +0.14 %/week

So at 21 days, "losing faster than 1.0%" fires only if the observed rate is above 1.38%.

---

## 6. Sleep in a deficit

**Body composition**
- Nedeltcheva et al. 2010 (randomized crossover, n = 10, 14 days at 90% of RMR) compared 8.5 h and 5.5 h in bed. Actual sleep was **7 h 25 min vs 5 h 14 min**. [Primary] https://doi.org/10.7326/0003-4819-153-7-201010050-00006
  - Weight loss was the same (2.9 vs 3.0 kg).
  - Fat loss was 1.4 vs 0.6 kg. The share of weight lost as fat fell **55%** with short sleep (56% to 25% of the loss).
  - FFM loss was 1.5 vs 2.4 kg, which is **60% more** with short sleep.
  - Hunger was higher with short sleep.
- Wang et al. 2018 (RCT, n = 36, 8 weeks of caloric restriction) cut sleep by about **1 h/night on 5 nights a week**, a net loss of 169 min/week, with catch-up sleep on the other 2 nights. Total weight loss was similar, but **a smaller share of the loss was fat** (p = 0.016). Catch-up sleep did not fully reverse the effect. [Primary] https://doi.org/10.1093/sleep/zsy027
- Mechanisms:
  - One night without sleep lowered muscle protein synthesis by 18% and testosterone by 24% (Lamon 2021). [Primary] https://doi.org/10.14814/phy2.14660
  - Five nights of 4 h in bed lowered myofibrillar protein synthesis (Saner 2020). [Primary] https://doi.org/10.1113/JP278828
  - Dáttilo 2011 sets out the hypothesis. [Primary, hypothesis paper] https://doi.org/10.1016/j.mehy.2011.04.017
- All the outcome studies used overweight adults who were not lifters.

**Hunger and intake**
- Two nights of 4 h sleep: leptin −18%, ghrelin +28%, hunger +24% (Spiegel 2004). [Primary] https://doi.org/10.7326/0003-4819-141-11-200412070-00008
- Meta-analysis of partial sleep deprivation: **+385 kcal/day intake** with no change in expenditure (Al Khatib 2017). [Primary] https://doi.org/10.1038/ejcn.2016.201

**Strength**
- Knowles et al. 2018 (systematic review, studies of weak to moderate quality): one night of total deprivation had little effect on strength, but **consecutive nights of restriction reduced force in multi-joint lifts, not single-joint ones**. [Primary] https://doi.org/10.1016/j.jsams.2018.01.012
- Craven et al. 2022 (meta-analysis, defining sleep loss as ≤6 h): performance fell **−7.56%** overall. The drop was consistent for deprivation and late restriction and was mostly absent in morning sessions. [Primary] https://doi.org/10.1007/s40279-022-01706-y

**Thresholds**
- AASM/SRS consensus: adults need **≥7 h** regularly. [Primary] https://doi.org/10.5664/jcsm.4758
- Engine thresholds:
  - "Short" means a 7-night mean below 6.0 h. This sits between Nedeltcheva's 5.2 h and the 7 h recommendation and matches Craven's ≤6 h definition.
  - "Restriction pattern" means ≥4 of 7 nights at least 1 h below the user's own 28-day median (Wang 2018).
  - Below 7 h alone is informational only.
- Device caveat: consumer trackers detect sleep well but wake poorly (epoch specificity 0.18–0.54), so they tend to *overestimate* sleep. Sleep-stage output is unreliable (Chinoy 2021). [Primary] https://doi.org/10.1093/sleep/zsaa291 The thresholds above are therefore conservative. Never judge "deep sleep" or "REM".

---

## 7. Strength as a signal

**Evidence**
- In a deficit, **strength usually holds or rises**. Strength gains were not significantly impaired, while lean mass was (Murphy & Koehler 2022). So a sustained drop across several lifts is unusual and informative. A small drop in one lift is not.
- Measurement noise:
  - Test-retest CV of 1RM ranges 0.5–12.1%, with a **median of 4.2%** (Grgic 2020, 32 studies). [Primary] https://doi.org/10.1186/s40798-020-00260-z
  - Lifters underpredict reps to failure by about **0.95 reps**, and accuracy improves closer to failure (Halperin 2022). [Primary] https://doi.org/10.1007/s40279-021-01559-x
  - One rep is about 2.4% (bench, from Reynolds 2006's 5RM equation) to 3.3% (Epley) of e1RM.
  - Prediction from lower-rep sets is more accurate (Reynolds 2006). [Primary] https://doi.org/10.1519/R-15304.1
  - RIR-based autoregulation background: Helms et al. 2016. [Primary] https://doi.org/10.1519/SSC.0000000000000218
- Lean-loss evidence that involves strength:
  - Mero 2010: bench 1RM fell at about 1.5%/week of loss.
  - Rossow 2013 (case study, 4.5% body fat at stage): strength fell during prep and had not fully recovered 6 months later. [Primary, n = 1] https://doi.org/10.1123/ijspp.8.5.582
- Confounders that lower strength without any muscle loss:
  - Low glycogen in high-volume sessions (Henselmans 2022).
  - Glycogen and water shifts also distort DXA "lean mass" by 2–3% (Bone 2017).
  - Short sleep (Knowles 2018; Craven 2022).
  - Higher reported RIR.
  - Deloads, program changes, illness.

**Derived thresholds**
- Comparison: the median `e1RM_adj` of the last 3 exposures against the median of the 3 exposures before the phase started.
  - With a per-session CV of about 4%, the SD of that difference is about 4% × √(2/3) ≈ 3.3%.
  - A one-sided 95% threshold is 1.645 × 3.3 ≈ **5%**.
  - Requiring the drop in **≥2 main lifts** sharply cuts false positives. If the lifts' errors are independent, the false-positive rate squares.
- Timing: exclude the first 14 days of a cut (early glycogen and fatigue dip). With 1–2 exposures per lift per week, the earliest meaningful call comes **≥3 weeks into the cut, with ≥3 exposures per lift after the exclusion window**.
- Sessions to exclude: those after a night under 5 h, or 2 consecutive nights under 6 h (Knowles; Craven); deload weeks; and the first 2 sessions after a rep-range change of more than 3 reps.
- Even when the rule fires, the verdict is "lifts are dropping", **not** "you are losing muscle".

---

## 8. Diet breaks, refeeds, maintenance phases

- **MATADOR** (Byrne 2018, obese men): eight 2-week deficit blocks alternated with 2 weeks at maintenance (16 weeks of deficit over 30 weeks in total). [Primary] https://doi.org/10.1038/ijo.2017.206
  - Weight loss was greater: 14.1 vs 9.1 kg.
  - The drop in resting energy expenditure, adjusted for body composition, was smaller.
  - Weight changed by 0.0 ± 0.3 kg during the maintenance blocks.
  - These were obese, untrained men.
- **ICECAP** (Peos 2021, 61 resistance-trained adults): 4 × 3 weeks of deficit with 1-week maintenance breaks between blocks, against 12 weeks of continuous deficit. [Primary] https://doi.org/10.1249/MSS.0000000000002636
  - **No difference in fat mass, FFM, strength, REE or hormones.**
  - Hunger and desire to eat were lower, and satisfaction higher, in the break group.
- **Siedler 2023** (38 trained women): a 1-week break after every 2 weeks of 25% deficit. No difference in body composition or RMR, and disinhibition was lower. [Primary] https://doi.org/10.5114/jhk/159960
- **Refeeds** (Campbell 2020, 27 trained adults, 7 weeks): two carbohydrate refeed days each week. The authors reported better FFM and RMR retention. [Primary] https://doi.org/10.3390/jfmk5010019
  - A reanalysis found **only dry FFM differed** (https://pmc.ncbi.nlm.nih.gov/articles/PMC7739336/). The evidence is mixed.
- **Maintenance between cut and bulk:** no controlled trials were identified on maintenance phases or "reverse dieting".
  - Case studies show hormonal and RMR recovery takes months after extreme prep (Pardue 2017; Rossow 2013).
  - The strongest practical reason is about measurement. A new maintenance estimate needs about 14–30 days of data (MacroFactor [Secondary]) and is only confident after more than 28 days (Hall & Chow 2011).
- **Implication:** offer diet breaks as an *adherence and hunger* tool, not as a fat-loss or muscle-sparing tool.

---

## 9. Safety floors and screening

**Low energy availability**
- Energy availability (EA) = (intake − exercise energy expenditure) / FFM.
- Loucks & Thuma 2003 (women, 5 days): LH pulsatility held at 30 kcal/kg LBM/day and was **disrupted below 30**. [Primary] https://doi.org/10.1210/jc.2002-020369
- Koehler 2016 (6 exercising men, 4 days at 15 kcal/kg FFM): leptin fell 53–56% and insulin fell, while T3, testosterone and IGF-1 were unchanged. Men appear more robust over the short term. [Primary] https://doi.org/10.1080/02640414.2016.1142109
- Fagerberg 2018 (review of natural male bodybuilders) reports harm in several of these systems at sustained EA below 25 kcal/kg FFM. [Primary] https://doi.org/10.1123/ijsnem.2016-0332
  - Sustained EA **below 25 kcal/kg FFM** was linked to muscle loss, hormonal and psychological problems, and cardiovascular effects.
  - Case studies at **below 20** showed more than 40% of weight lost as muscle.
  - The review suggests EA above 25 as more tempered, but adds that "more research is needed".
- IOC REDs consensus 2023: LEA ranges from adaptable to problematic. There is **no single universal cut-off**, especially for males. It introduces the REDs CAT2 assessment tool. [Primary] https://doi.org/10.1136/bjsports-2023-106994
- **Limitation:** the engine rarely knows FFM or exercise energy expenditure well. Treat EA rules as a supplement to the symptom checks and the rate caps.

**Calorie floors**
- MyFitnessPal reportedly blocks goals below **1,200 kcal/day for women and 1,500 for men**. **[Secondary; third-party reports, not confirmed with MFP]** For example: https://nutrola.app/en/blog/why-calorie-trackers-recommend-1200-calories-and-why-its-dangerous
- An NIH task force (1993) describes standard low-calorie diets at about 1,200 kcal/day and very-low-calorie diets (under 800) as needing medical supervision. [Primary] https://pubmed.ncbi.nlm.nih.gov/8345648/
- These floors are conventions, not physiology. For lifters they almost never bind, so treat them as a hard guard.

**Signs to stop or pause a cut**
- Loss or disruption of menstrual periods (a primary REDs indicator; Mountjoy 2023).
- **Low libido in men.** It was the only LEAM-Q item that told LEA cases from controls (Lundy 2022). [Primary] https://doi.org/10.3390/nu14091873
- Dizziness, recurrent illness or injury, persistent fatigue or low mood.
- Females: LEAF-Q has 78% sensitivity and 90% specificity in endurance athletes (Melin 2014). [Primary] https://doi.org/10.1136/bjsports-2013-093240 It performed poorly in footballers, so its validity in lifters is unknown.

**Disordered eating**
- SCOFF has 5 yes/no items, and **≥2 "yes" = possible ED**. In the original clinical sample it had 100% sensitivity and 87.5% specificity (Morgan 1999). [Primary] https://doi.org/10.1136/bmj.319.7223.1467
  - The item "lost more than one stone (6.35 kg) in 3 months" will be true for many normal cuts, so **never score it from scale data alone**.
- Screening language [Derived from the sources above; tone guidance]:
  - Do not diagnose.
  - Name the specific observation, e.g. "You mentioned skipping periods for 2 months."
  - Say plainly that it can signal under-fuelling, recommend moving to maintenance, and recommend a doctor or registered dietitian.
  - Give a helpline appropriate to the region.
  - No moral language about food ("cheat", "bad", "earned").
  - Never praise faster loss.
  - Stop issuing deficit advice until the user indicates the issue has been addressed.

---

## 10. Measuring "lean", and recomposition

**Smart scales and BIA**
- Against DXA, three consumer scales had median fat-mass errors of −2.2 to −4.4 kg, with wide IQRs, and the error depended on BMI and body fat (Frija-Masson 2021). [Primary] https://doi.org/10.2196/22487
- When resistance-trained men bulked, most methods produced **blunted or exaggerated changes** unless pre-test conditions were standardised. DXA and some digital-anthropometry methods were the most robust (Tinsley 2022). [Primary] https://doi.org/10.1017/S0007114521002579
- **DXA itself** read lean mass 2–3% higher after glycogen loading (Bone 2017).

**Navy (circumference) method**
- In 1,407 recruits it underestimated %BF by about 6 points. Over 8 weeks of training it **missed the change in women** (0.0% vs −4.0% by DXA) and underestimated it in men (−2.2% vs −3.3%). Foulis 2023. [Primary] https://doi.org/10.3389/fphys.2023.1183836

**Waist circumference**
- It is a valid risk marker when measured with a standard protocol (Ross 2020 consensus). [Primary] https://doi.org/10.1038/s41574-019-0310-7
- Reported measurement error ranges from **0.7 to 15 cm**. A maintained, clinically relevant change is about 3%, or 1.8–4.1 cm. The authors recommend a uniform protocol and repeated measures (Verweij 2013). [Primary] https://doi.org/10.1017/S1368980012002741
- Engine rule: a weekly self-measurement at the navel, in the morning, after voiding, on a relaxed exhale, taking the mean of 2 readings. Treat a change under **2 cm** (compared with the mean of the 3 earlier measurements) as noise. [Derived]

**Progress photos**
- No validation studies were found. Store them for the user, but never use them as a decision input or to estimate body fat.

**Recomposition**
- It is feasible, especially in novices, people returning after a layoff, people with higher body fat, and with high protein and a small deficit or maintenance intake.
  - Barakat et al. 2020 review. [Primary] https://doi.org/10.1519/SSC.0000000000000584
  - Murphy & Koehler 2022: lean mass still rose with deficits under about 500 kcal/day.
  - Garthe 2011: the slow-loss group gained LBM.
  - Longland 2016: LBM rose even in a 40% deficit with 2.4 g/kg protein, in untrained or recreationally active young men.
  - Helms 2023: lifters eating at maintenance gained muscle similar to those in a surplus.
- In trained lifters it is slow and hard to measure. Detect it only from the *combination* of a flat scale, rising lifts and a falling waist.

---

## Judge rules table

Global gating applies to **every** verdict rule:
- **G1:** respect the phase-change mask.
- **G2:** use whole-week windows.
- **G3:** for rate rules, require the confidence condition ("confidently above/below") or the fallback margins from §5.
- **G4:** for kcal-based rules, ≥80% of days in the window must be complete-log days.
- **G5:** never change kcal more than once per 14 days.
- **G6:** clamp every recommended kcal step to the range in the row.
- **G7:** never output a target below 1,500 kcal (men) or 1,200 kcal (women).
- **G8:** when any SAFE rule fires, suppress every deficit-deepening recommendation.

Kcal step formula [Derived]: `Δkcal/day = |rate_obs − rate_target_mid| × BW × ED / 7 / 100`, with ED = 7,700 for cuts and 5,000 for bulks, then clamped to the range shown.

| ID | Signal(s) | Threshold | Minimum data before firing | Verdict | Recommended action | Evidence | Confidence |
|---|---|---|---|---|---|---|---|
| **G-NOISE-1** | Phase change (start of cut, bulk or break, or return to deficit) | Days 0–6 after the change | none | (Suppress.) No rate verdicts; say the early drop or jump is mostly water and glycogen if the user asks | none | Hall 2008; Kreitzman 1992 | high |
| **G-NOISE-2** | Single-day jump | ≥1% BW above the trend after a high-carb or high-sodium day, travel, or a refeed | 1 day | (Suppress.) No "fat gain" comment | none | Kreitzman 1992; Turicchi 2020 | high |
| **G-NOISE-3** | Creatine started | Within 7 days of starting a load, or 28 days of starting 3–5 g/day | log of start date | Expect about +0.5–1 kg of water; exclude it from bulk-rate rules or widen the margin | none | Bone 2017 (TBW +1.4%); Hultman 1996 | medium |
| **G-NOISE-4** | Menstrual cycle logged | The window's start and end fall in different phases (luteal or menses vs follicular) | cycle log | Shift the window to end in the same phase it started in, or use ≥28 d | none | White 2011 (weak) | low |
| **G-EXP-1** | Back-calculated expenditure | — | ≥14 d to display; ≥28 d before stating it with ±300 kcal confidence | "Maintenance estimate still settling" before 28 d | Base kcal targets on rate-vs-target rules until the estimate matures | Hall & Chow 2011; MacroFactor [Secondary] | high |
| **G-EXP-2** | Logged intake falls ≥15% with no matching trend change, or <80% complete-log days | over 14 d | 14 d | "Logging gap likely, not a metabolism change" | Ask the user to confirm logging; hold targets | MacroFactor help [Secondary]; [Derived] | medium |
| **LOSS-1** | Cut: `rate` (loss) **and** STR-1 | Confidently above 1.0 %BW/wk, **and** e1RM_adj down ≥5% on ≥2 main lifts | ≥21 d weights (≥12 weigh-ins); ≥3 post-mask exposures per lift; cut ≥3 wk old | "Losing faster than the muscle-retention range, and your main lifts are dropping." | **+150–300 kcal/day** (formula, target mid 0.75%); reassess in 14 d | Helms 2014; Garthe 2011; Mero 2010; Murphy & Koehler 2022; Roberts 2020 | medium-high (rate); medium (combination) |
| **LOSS-2** | Cut: `rate`; lifts stable (within ±3%) | Confidently above 1.0 %BW/wk | ≥21 d | "Faster than needed. Lifts are holding, so no change is needed unless you're near goal or this continues 2 more weeks." | none; or +100–150 kcal if the user is near goal or advanced | Garthe 2011 (≈1.0%/wk kept LBM but gained none); Helms 2014 | medium |
| **LOSS-3** | Cut: `rate` | Confidently above 1.5 %BW/wk (lifts irrelevant) | ≥14 d after the mask | "Losing very fast. This rate is linked to strength and hormone losses." | **+250–300 kcal/day**; reassess in 14 d | Mero 2010; Garthe 2011 (planned 1.4%); Fagerberg 2018 | medium |
| **LOSS-4** | Cut, user flagged near goal, advanced or lean | Confidently above 0.7 %BW/wk **and** STR-1 | as LOSS-1 | As LOSS-1, with "at your stage" | +100–200 kcal/day | Garthe 2011; Roberts 2020; Aragon 2017 | medium-low |
| **LOSS-5** | Cut: estimated deficit (expenditure − intake) | >500 kcal/day sustained for 3 wk **and** STR-1 | G-EXP-1 mature (≥28 d) | Supports LOSS-1 (use as corroboration, not a standalone trigger) | Size the step so the deficit lands at ≤500 kcal/day | Murphy & Koehler 2022 | medium |
| **LOSS-6** | Cut: `rate` too slow | Confidently below 0.5 %BW/wk **and** point estimate <0.3 %/wk, **and** no RECOMP-1 | ≥28 d (≥16 weigh-ins), G4 met | "Fat loss has stalled below the target range." | **−100–200 kcal/day** (or +activity of equal size); reassess in 14 d | Helms 2014 (lower bound 0.5); [Derived] margins | medium |
| **GAIN-1** | Bulk: `rate` vs status band | Confidently above the band ceiling (novice 0.5, intermediate 0.35, advanced 0.25 %BW/wk) | ≥28 d (novice or intermediate); ≥42 d (advanced) | "Gaining faster than a lean bulk needs. The extra is mostly fat, not muscle." | **−100–200 kcal/day** (formula, ED 5,000); reassess in 14–28 d | Iraki 2019; Helms 2023; Garthe 2013; MacroFactor [Secondary] | medium (direction); low (band edges) |
| **GAIN-2** | Bulk: `rate` low **and** lifts flat | Confidently below the band floor (0.25/0.15/0.1) **and** e1RM_adj change within ±2% on all main lifts over ≥4 wk | ≥28 d weights; ≥4 exposures per lift | "Not gaining, and lifts have stalled." | **+100–200 kcal/day** | Iraki 2019; Slater 2019 | low-medium |
| **GAIN-3** | Bulk: `rate` low, lifts rising (≥2.5% on ≥2 lifts) | below the band floor | ≥28 d | (Suppress the GAIN-2 verdict.) "Lifts are still progressing near maintenance, so no change is needed." | none | Helms 2023 (maintenance gains similar); Murphy & Koehler 2022 | medium |
| **GAIN-4** | Bulk: waist | +≥2 cm vs the 3-measure baseline over ≥4 wk while `rate` is at or above the band ceiling | ≥4 weekly waist measures | Strengthens GAIN-1 (never fires on its own) | as GAIN-1 | Verweij 2013; Ross 2020 | low |
| **STR-1** | e1RM_adj trend | Median of last 3 exposures ≤ −5% vs pre-phase median, on ≥2 main lifts, after exclusions (§7) | ≥3 post-exclusion exposures per lift; ≥3 wk into the phase | Building block: "lifts are dropping". Never phrase it as "muscle loss". | via LOSS/GAIN rules | Grgic 2020; Halperin 2022; Murphy & Koehler 2022; [Derived] | low-medium |
| **STR-2** | Only 1 lift down ≥5% | — | as STR-1 | Lift-specific (program, technique, fatigue), **not** a nutrition verdict | Hand off to the training engine | [Derived]; Murphy & Koehler 2022 | medium |
| **STR-3** | e1RM drop in cut days 0–13, or in sessions with >10 sets per muscle and carbs <3 g/kg | — | — | (Suppress the lean-loss framing.) "Early-cut and glycogen dips are common." | none | Henselmans 2022; Bone 2017; Iraki 2019 | medium |
| **SLEEP-1** | Cut: sleep | 7-night mean <6.0 h, **or** ≥4 of 7 nights ≥1 h below the user's 28-d median, for ≥2 consecutive weeks | ≥10 of 14 nights logged | "Short sleep during a cut shifts more of the loss toward lean tissue." | Prioritise ≥7 h. **Don't deepen the deficit** while this holds; if LOSS-1 or LOSS-3 also fire, prefer adding kcal | Nedeltcheva 2010; Wang 2018; Watson 2015 | medium |
| **SLEEP-2** | Session after <5 h, or after 2 nights <6 h | — | sleep log for that night | Exclude the session from STR-1. Optionally note it: "compound lifts are most affected by short sleep" | none | Knowles 2018; Craven 2022 (−7.6%) | medium |
| **SLEEP-3** | Sleep short (SLEEP-1) **and** intake over target on ≥3 days/wk | — | 14 d | "Short sleep raises intake by about 385 kcal/day on average. It's likely part of the overshoot." | Address sleep before cutting kcal further | Al Khatib 2017; Spiegel 2004 | medium |
| **PRO-1** | Cut: protein | 7-d mean <1.8 g/kg BW (or <2.3 g/kg FFM) in ≥2 of the last 3 wk | 14 d of complete logs | "Protein is below the range shown to retain lean mass in a deficit." | Raise to 1.8–2.7 g/kg BW | Helms 2014 (IJSNEM); Roberts 2020; Longland 2016; Jäger 2017 | high (direction); medium (cut-off) |
| **PRO-2** | Maintenance or bulk: protein | 14-d mean <1.6 g/kg BW | 14 d | "Protein is below the level where muscle gains plateau." | Raise to 1.6–2.2 g/kg | Morton 2018; Nunes 2022; Iraki 2019 | high |
| **FAT-1** | Fat intake | 14-d mean <0.5 g/kg **and** <15% kcal | 14 d | Info: "Fat is below the usual minimum." | Raise to ≥0.5 g/kg (prefer 20–30% kcal) | Iraki 2019; Helms 2014; Whittaker & Wu 2021 | low-medium |
| **DB-1** | Cut ≥6 wk, **and** user-reported hunger or fatigue, or ≥3 days/wk over target for 2 wk | — | 14 d | "A 1–2 week diet break may help adherence. In trials it didn't slow fat loss." | 1–2 wk at estimated maintenance. Pre-warn of about +0.5–1.5 kg of water/glycogen and suppress rate verdicts for 7 d after the break | Peos 2021; Siedler 2023; Byrne 2018; Kreitzman 1992 | medium (adherence); low (body comp) |
| **DB-2** | Cut ended (≥8 wk), user is starting a bulk | — | — | "Run ≥2–4 weeks at maintenance first, so the new maintenance can be measured." | Maintenance for ≥2–4 wk; start the bulk from the measured value | Hall & Chow 2011; MacroFactor [Secondary]; Pardue 2017; Rossow 2013 | high (measurement); low (physiology) |
| **SAFE-1** | Target kcal | Would fall below 1,500 (M) / 1,200 (F) | — | "Won't go lower than this floor." | Hold at the floor, suggest maintenance, and refer to a professional if needed | NIH 1993; MFP convention [Secondary] | medium (convention) |
| **SAFE-2** | EA (only if FFM and exercise energy expenditure are known) | <30 kcal/kg FFM/day (F), <25 (M), sustained 14 d; <20 for anyone means stop | 14 d | "Energy availability looks low enough to affect health." | Raise kcal to bring EA above the threshold, or pause the cut | Loucks 2003; Fagerberg 2018; Koehler 2016; Mountjoy 2023 | medium (F); low (M) |
| **SAFE-3** | User-reported red flags: missed or absent periods, low libido (M), dizziness, recurrent illness or injury, persistent low mood | any, reported | — | "These can be signs of under-fuelling." | Pause the cut and go to maintenance; recommend a doctor or RD; trigger G8 | Mountjoy 2023; Lundy 2022; Melin 2014 | medium-high |
| **SAFE-4** | `rate` | Confidently above 1.5 %BW/wk for ≥3 wk despite LOSS-3, **or** goal weight implying BMI <18.5 | 21 d | "Not going to coach this rate or goal." | Recommend maintenance and a professional | Mero 2010; WHO BMI categories (https://www.who.int/europe/news-room/fact-sheets/item/a-healthy-lifestyle---who-recommendations) | medium |
| **SAFE-5** | ED indicators: user mentions vomiting, loss of control, food dominating life, or ≥2 SCOFF "yes" on an optional check | — | — | Supportive, non-diagnostic message (§9) | Stop deficit coaching and give resources; trigger G8 | Morgan 1999 | medium |
| **M-1** | Smart-scale or BIA %BF, Navy %BF | — | — | Never a decision input; display only, with an error caveat | none | Frija-Masson 2021; Tinsley 2022; Foulis 2023; Bone 2017 | high |
| **RECOMP-1** | Weight flat **and** lifts up **and** waist down | abs(`rate`) <0.25 %/wk over ≥28 d; e1RM_adj up ≥2.5% on ≥2 lifts; waist ≤ −1.5 cm vs baseline mean | ≥28 d weights; ≥4 waist measures; ≥4 exposures per lift | "Scale is flat but lifts are up and waist is down, so this looks like recomposition. No change needed." Also suppresses LOSS-6 and GAIN-2 | none | Barakat 2020; Murphy & Koehler 2022; Garthe 2011; Helms 2023 | low-medium |

---

## Things the engine must NOT claim

1. **It must not claim kilograms of muscle gained or lost**, from the scale, smart-scale BIA, the Navy method or photos. Validity for tracking change is poor (Frija-Masson 2021; Tinsley 2022; Foulis 2023), and even DXA lean mass moves 2–3% with glycogen (Bone 2017).
2. **It must not say "you are losing muscle" from a drop in strength.** Say "lifts are dropping". Strength falls from fatigue, glycogen, sleep and RIR drift, and in deficits strength usually holds even when lean mass does not (Murphy & Koehler 2022).
3. **It must not issue a rate verdict on less than 14 days of data**, or on cut-band edges with less than about 21 days, or on bulk-band edges with less than 28–42 days (§5 table).
4. **It must not attribute a single-day or single-week jump to fat gain.**
5. **It must not cite "metabolic damage" or "starvation mode" as the reason fat loss stopped.**
   - Measured adaptive thermogenesis is modest: an RMR drop of about −90 kcal/day in deficit that halves at maintenance (Martins 2020), and about 6 kcal/kg FFM/day of total energy expenditure at a sustained −10% (Leibel 1995).
   - A stall is usually explained by lower body mass, lower NEAT, logging drift or water.
6. **It must not state the maintenance kcal to better than about ±300 kcal/day before 28 days of data**, nor treat 7,700 kcal/kg as exact. It is wrong for lean people and for gains (Hall 2008; Thomas 2013; Hall & Chow 2011).
7. **It must not say that diet breaks or refeeds preserve muscle, speed fat loss, or "reset metabolism"** in trained lifters. ICECAP and Siedler 2023 were null on body composition, Campbell 2020 is contested, and MATADOR studied obese men. Adherence and hunger benefits are the defensible claims.
8. **It must not say that protein above about 2.2 g/kg (surplus) or 2.7 g/kg (deficit) adds muscle**, and must not make per-meal "can only absorb X g" claims. Timing effects are small (Helms 2014; Schoenfeld & Aragon 2018 https://doi.org/10.1186/s12970-018-0215-1).
9. **It must not blame low carbohydrates for strength loss** unless session volume is above 10 sets per muscle (Henselmans 2022).
10. **It must not predict testosterone or other hormone levels** from fat intake, sleep or deficit size for an individual. The effects are group-level and modest (Whittaker & Wu 2021, with a corrigendum pending review; Koehler 2016).
11. **It must not judge sleep stages ("low deep sleep", "REM")** from wearables (Chinoy 2021). It also must not present sleep thresholds as proven in lifters, since the key studies used overweight non-lifters (Nedeltcheva 2010; Wang 2018).
12. **It must not quantify menstrual-cycle water retention in kg** for a user. The data are mostly self-reported and inconsistent (White 2011).
13. **It must not present lean-bulk rate bands, the "Aragon model", or the training-status cut-offs as established science.** They are expert consensus plus one small RCT (Iraki 2019; Helms 2023; secondary sources).
14. **It must not apply RED-S/LEA numeric thresholds to men as established.** There is no universal male threshold (Mountjoy 2023; Koehler 2016).
15. **It must not diagnose an eating disorder or RED-S**, score SCOFF from scale data, or use shaming or moralising food language.
16. **It must not claim recomposition is impossible for trained lifters, or guaranteed.** It is plausible under specific conditions and slow to show up (Barakat 2020).
17. **It must not recommend reverse dieting protocols as evidence-based.** No controlled trials were found.

---

## Reference list (by key, as cited above)

**Weight-loss and gain rates**
- Helms ER, Aragon AA, Fitschen PJ 2014. JISSN. https://doi.org/10.1186/1550-2783-11-20
- Garthe I et al. 2011. IJSNEM. https://doi.org/10.1123/ijsnem.21.2.97
- Garthe I et al. 2013. Eur J Sport Sci. https://doi.org/10.1080/17461391.2011.643923
- Mero AA et al. 2010. JISSN. https://doi.org/10.1186/1550-2783-7-4
- Roberts BM, Helms ER, Trexler ET, Fitschen PJ 2020. J Hum Kinet. https://doi.org/10.2478/hukin-2019-0096
- Aragon AA et al. 2017, ISSN position stand on diets and body composition. https://doi.org/10.1186/s12970-017-0174-y
- Murphy C, Koehler K 2022. Scand J Med Sci Sports. https://doi.org/10.1111/sms.14075
- Iraki J et al. 2019. Sports. https://doi.org/10.3390/sports7070154
- Helms ER et al. 2023. Sports Med Open. https://doi.org/10.1186/s40798-023-00651-y
- Slater GJ et al. 2019. Front Nutr. https://doi.org/10.3389/fnut.2019.00131

**Protein, fat, carbohydrate**
- Morton RW et al. 2018. BJSM. https://doi.org/10.1136/bjsports-2017-097608
- Nunes EA et al. 2022. J Cachexia Sarcopenia Muscle. https://doi.org/10.1002/jcsm.12922
- Helms ER, Zinn C, Rowlands DS, Brown SR 2014. IJSNEM. https://doi.org/10.1123/ijsnem.2013-0054
- Jäger R et al. 2017, ISSN position stand on protein. https://doi.org/10.1186/s12970-017-0177-8
- Hector AJ, Phillips SM 2018. IJSNEM. https://doi.org/10.1123/ijsnem.2017-0273
- Longland TM et al. 2016. AJCN. https://doi.org/10.3945/ajcn.115.119339
- Schoenfeld BJ, Aragon AA 2018. JISSN. https://doi.org/10.1186/s12970-018-0215-1
- Whittaker J, Wu K 2021. J Steroid Biochem Mol Biol. https://doi.org/10.1016/j.jsbmb.2021.105878 (corrigendum: https://doi.org/10.1016/j.jsbmb.2025.106880)
- Henselmans M et al. 2022. Nutrients. https://doi.org/10.3390/nu14040856

**Energy balance and expenditure**
- Hall KD 2008. IJO. https://doi.org/10.1038/sj.ijo.0803720
- Thomas DM et al. 2013. IJO. https://doi.org/10.1038/ijo.2013.51
- Hall KD, Chow CC 2013. IJO. https://doi.org/10.1038/ijo.2013.112
- Hall KD et al. 2011. Lancet. https://doi.org/10.1016/S0140-6736(11)60812-X
- Hall KD, Chow CC 2011. AJCN. https://doi.org/10.3945/ajcn.111.014399
- Leibel RL, Rosenbaum M, Hirsch J 1995. NEJM. https://doi.org/10.1056/NEJM199503093321001
- Rosenbaum M, Leibel RL 2010. IJO. https://doi.org/10.1038/ijo.2010.184
- Martins C et al. 2020. AJCN. https://doi.org/10.1093/ajcn/nqaa220
- Trexler ET, Smith-Ryan AE, Norton LE 2014. JISSN. https://doi.org/10.1186/1550-2783-11-7

**Weight noise**
- Kreitzman SN et al. 1992. AJCN. https://doi.org/10.1093/ajcn/56.1.292S
- Turicchi J et al. 2020. PLoS One. https://doi.org/10.1371/journal.pone.0232152
- Orsama AL et al. 2014. Obes Facts. https://doi.org/10.1159/000356147
- White CP et al. 2011. Obstet Gynecol Int. https://doi.org/10.1155/2011/138451
- Bone JL et al. 2017. MSSE. https://doi.org/10.1249/MSS.0000000000001174
- Hultman E et al. 1996. J Appl Physiol. https://doi.org/10.1152/jappl.1996.81.1.232

**Sleep**
- Nedeltcheva AV et al. 2010. Ann Intern Med. https://doi.org/10.7326/0003-4819-153-7-201010050-00006
- Wang X et al. 2018. Sleep. https://doi.org/10.1093/sleep/zsy027
- Watson NF et al. 2015, AASM/SRS consensus. https://doi.org/10.5664/jcsm.4758
- Knowles OE et al. 2018. J Sci Med Sport. https://doi.org/10.1016/j.jsams.2018.01.012
- Dáttilo M et al. 2011. Med Hypotheses. https://doi.org/10.1016/j.mehy.2011.04.017
- Lamon S et al. 2021. Physiol Rep. https://doi.org/10.14814/phy2.14660
- Saner NJ et al. 2020. J Physiol. https://doi.org/10.1113/JP278828
- Craven J et al. 2022. Sports Med. https://doi.org/10.1007/s40279-022-01706-y
- Spiegel K et al. 2004. Ann Intern Med. https://doi.org/10.7326/0003-4819-141-11-200412070-00008
- Al Khatib HK et al. 2017. EJCN. https://doi.org/10.1038/ejcn.2016.201
- Chinoy ED et al. 2021. Sleep. https://doi.org/10.1093/sleep/zsaa291

**Strength measurement**
- Grgic J et al. 2020. Sports Med Open. https://doi.org/10.1186/s40798-020-00260-z
- Halperin I et al. 2022. Sports Med. https://doi.org/10.1007/s40279-021-01559-x
- Reynolds JM et al. 2006. JSCR. https://doi.org/10.1519/R-15304.1
- Helms ER et al. 2016. Strength Cond J. https://doi.org/10.1519/SSC.0000000000000218

**Contest prep case studies**
- Rossow LM et al. 2013. IJSPP. https://doi.org/10.1123/ijspp.8.5.582
- Pardue A et al. 2017. IJSNEM. https://doi.org/10.1123/ijsnem.2017-0064

**Diet breaks and refeeds**
- Byrne NM et al. 2018 (MATADOR). IJO. https://doi.org/10.1038/ijo.2017.206
- Peos JJ et al. 2021 (ICECAP). MSSE. https://doi.org/10.1249/MSS.0000000000002636
- Siedler MR et al. 2023. J Hum Kinet. https://doi.org/10.5114/jhk/159960
- Campbell BI et al. 2020. JFMK. https://doi.org/10.3390/jfmk5010019 (reanalysis comment: https://pmc.ncbi.nlm.nih.gov/articles/PMC7739336/)

**Safety and screening**
- Loucks AB, Thuma JR 2003. JCEM. https://doi.org/10.1210/jc.2002-020369
- Koehler K et al. 2016. J Sports Sci. https://doi.org/10.1080/02640414.2016.1142109
- Fagerberg P 2018. IJSNEM. https://doi.org/10.1123/ijsnem.2016-0332
- Mountjoy M et al. 2023, IOC REDs consensus. BJSM. https://doi.org/10.1136/bjsports-2023-106994
- Melin A et al. 2014 (LEAF-Q). BJSM. https://doi.org/10.1136/bjsports-2013-093240
- Lundy B et al. 2022 (LEAM-Q). Nutrients. https://doi.org/10.3390/nu14091873
- Morgan JF, Reid F, Lacey JH 1999 (SCOFF). BMJ. https://doi.org/10.1136/bmj.319.7223.1467
- NIH National Task Force 1993, very-low-calorie diets. https://pubmed.ncbi.nlm.nih.gov/8345648/

**Body composition measurement and recomposition**
- Ross R et al. 2020. Nat Rev Endocrinol. https://doi.org/10.1038/s41574-019-0310-7
- Verweij LM et al. 2013. Public Health Nutr. https://doi.org/10.1017/S1368980012002741
- Frija-Masson J et al. 2021. JMIR mHealth. https://doi.org/10.2196/22487
- Tinsley GM et al. 2022. Br J Nutr. https://doi.org/10.1017/S0007114521002579
- Foulis SA et al. 2023. Front Physiol. https://doi.org/10.3389/fphys.2023.1183836
- Barakat C et al. 2020. Strength Cond J. https://doi.org/10.1519/SSC.0000000000000584

**Secondary sources**
- Nuckols G, "How Fast Should You Gain Weight When Bulking?", MacroFactor 2024. https://macrofactor.com/bulking-calculator/
- Nuckols G, "MacroFactor's Algorithms and Core Philosophy". https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/
- MacroFactor help: weight trend (https://help.macrofactorapp.com/dashboard/weight_trend/) and expenditure (https://help.macrofactorapp.com/dashboard/expenditure).
- Walker J, *The Hacker's Diet*, "Signal and Noise". https://www.fourmilab.ch/hackdiet/e4/signalnoise.html
- Aragon muscle-gain model, as summarised by RNT Fitness. https://www.rntfitness.co.uk/realistic-rates-muscle-gain/
- MyFitnessPal calorie floor, as reported by third parties (unverified). https://nutrola.app/en/blog/why-calorie-trackers-recommend-1200-calories-and-why-its-dangerous
