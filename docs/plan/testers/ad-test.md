# Instagram ad test: £30, 7 days

A demand test as much as a recruiting channel. In a week it shows whether strangers who lift want this, by what a sign-up costs, before the £79 Apple fee is spent. **Images (22 Oct, the founder's direction):** `ads/ad-insights-feed.png` (4:5, Feed and Explore) and `ads/ad-insights-story.png` (9:16, Stories and Reels). It reads as a lifting app at a glance: a barbell, "for natural lifters", the headline "What's moving your lifts?", and a squat estimated-1RM chart (16 weeks of sessions, with the ones after a night under 6½ h marked). That chart is an illustration of what the app reads; in the app it shows as the session dots on a Connections row and the squat chart under Over time. Each card's headline is a plain finding ("Weaker after short nights"), with the numbers under it as estimated 1RM, not "squat 7 kg heavier", which reads like one set. There are three cards: performance after short nights, recovery signals (HRV, resting heart rate) and the food log checked against the weight. Each is something the app really reads; heart-rate dip and eating close to bed aren't, so they stay out. The first design, the Connections screenshot (`ads/ad-feed.png`, `ads/ad-story.png`), is kept as a fallback. All images are labelled "Example data" on the image itself; rebuild them with `scripts/ad-images.mjs`.

## What you set up (I can't: it needs your accounts and card)

1. **Facebook Page** (Meta needs one even for Instagram-only ads): facebook.com/pages/create, name "Liftworks", category "App page". The app icon as its picture.
2. **Instagram account** for Liftworks (optional, but ads then show its name), linked to the Page: Page settings → Linked accounts → Instagram.
3. **Ads Manager** (adsmanager.facebook.com): create an ad account in GBP, time zone London, and add your card.

## The campaign (step by step; Meta renames buttons often, so look for the nearest match)

**Campaign**
- Objective: **Traffic**. Name: "Beta testers UK Oct". Advantage campaign budget: off.

**Ad set**
- Conversion location: **Website**. Performance goal: **Maximise number of link clicks** (needs no pixel).
- Budget: **£4 a day**, start today, end in **7 days** (about £28).
- Audience: if Ads Manager offers "Advantage+ audience", choose the original audience options instead, so it stays on the people below.
  - Location: **United Kingdom** (add Ireland if you like).
  - Age: **20 to 40**. All genders.
  - Detailed targeting (interests): **Bodybuilding, Powerlifting, Weight training, Strength training**; add "Natural bodybuilding" if it's offered.
  - Language: English.
- Placements: **Manual**, Instagram only: **Feed, Explore, Stories, Reels**.
- Devices: **Mobile → iOS devices only** (under the placements' advanced options or "Specific mobile devices and operating systems"). Android users can't test, so don't pay for them.

**Ads: three in this ad set, one per text below; Meta shifts the budget to the best one.**
- Format: single image. **Customise media per placement:** `ad-insights-feed.png` for Feed and Explore, `ad-insights-story.png` for Stories and Reels.
- Website: **https://tally.so/r/BEzj4R**. Call to action: **Sign up**.
- **Turn off Advantage+ creative enhancements** (Meta's automatic edits to images and text). The label and the wording have to stay as they are.
- Publish. The first review can take up to a day.

## The ad text

All three end with "Screens: example data". The image is labelled too. None says what the reader is or has (Meta rejects ads that do), and none puts a single lift's kilos in the headline.

**A: what's moving your lifts**
- Primary text: Clearly weaker after short nights? Low-HRV mornings? A food log that says 500 kcal under while the weight barely moves? Liftworks reads sleep, recovery, food and training together and shows what your own log is telling you. Free 8-week iPhone beta. Screens: example data.
- Headline: What's moving your lifts?
- Description: Free iPhone beta · 8 weeks

**B: three apps, one read**
- Primary text: Food in one app, lifts in another, sleep on your watch. Liftworks reads them together: how your estimated 1RM moves after short nights, what your recovery signals line up with, and whether your food log matches what your weight actually did. Free 8-week iPhone beta. Screens: example data.
- Headline: Testers wanted: free iPhone beta
- Description: Built for natural lifters

**C: against the chatbot apps**
- Primary text: No AI coach telling you what to do. Liftworks reads your own training, food and sleep and shows what actually lined up with your performance, and says so when nothing did. Free 8-week iPhone beta. Screens: example data.
- Headline: Plain statistics on your own log
- Description: Free iPhone beta · 8 weeks

## Counting sign-ups from the ad

During the test, sign-ups who answer "Instagram, TikTok or X" on the form come from the ad, as long as you aren't posting on Instagram or TikTok that week. If you are, add a hidden field `ref` to the Tally form and use https://tally.so/r/BEzj4R?ref=ig-ad as the ad's link.

A **qualified sign-up** answers Yes to the iPhone question, trains 3 or more times a week, and answers Yes or Probably to the 8-week question.

## Each day (2 minutes)

In Ads Manager: spend, link clicks, cost per link click, link CTR. In Tally: new sign-ups and how many are qualified. Reply to each sign-up the same day ("You're on the list…", `outreach.md`).

## The pass line

**Cost per qualified sign-up = total spend ÷ qualified sign-ups from the ad.**

| After about £28 | What it means | Then |
|---|---|---|
| **£5 or less** (6 or more qualified) | Strangers want this, as pitched | Pay Apple when you reach 25 qualified sign-ups, from all channels together |
| **£5 to £10** (3 to 5) | Some interest, weak | One more £20 round: the best ad only, one change (headline or first line) |
| **Over £10** (0 to 2) | Strangers aren't biting on this pitch | Don't pay Apple yet. Rethink the pitch, for example the free analysis of their own exports |

**Stop early** if, by day 3 (about £12), there are no sign-ups and link CTR is under 0.5%: the image and headline aren't landing.

**Reading the middle of the funnel:**
- Link CTR of 1% or more is healthy; under 0.5%, the image or headline is the problem.
- Form completion (sign-ups ÷ link clicks) of 8% or more is healthy. If people click but don't finish, the form is too long for strangers; cut it to the six questions that decide picking (first name, email, iPhone, sessions a week, what you log in now, the 8-week question).

These are working guides for a first test, not proven benchmarks for this app (`research/K-tester-channels.md`, and the benchmark sources noted on 22 Oct: fitness ads averaged about $1.33 a click in 2025).
