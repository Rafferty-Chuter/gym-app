# Sign-up form

One Tally form, linked from every message in `recruit.md`. **Live at https://tally.so/r/BEzj4R** (published 22 Oct; title, description and thank-you page below are as built there). It picks about 30 testers out of about 50 sign-ups (all strangers found online) and keeps everyone else as the launch waitlist. Connect Tally's Google Sheets integration so the responses become the tester sheet.

**Form title:** "Test Liftworks for 8 weeks"
**Form description:** "Two minutes. iPhone only for now. The test is free, and if you answer the three check-ins your first year is free at launch. We use your answers only to pick testers and to email you about the test; reply to any of our emails and we'll delete them." (No address on the form until the support email exists.)

## Questions

| # | Question | Tally block | Options and logic |
|---|---|---|---|
| 1 | First name | Short answer | Required |
| 2 | Email | Email | Required. The same email goes on every check-in, so the forms join up. |
| 3 | Do you have an iPhone? | Multiple choice | Yes · No. If "No", jump to 13. |
| 4 | How many times a week do you train? | Multiple choice | 1 to 2 · 3 · 4 · 5 or more |
| 5 | How long have you been lifting? | Multiple choice | Under a year · 1 to 2 years · 2 to 5 years · Over 5 years |
| 6 | What do you log in now? | Checkboxes | Hevy · Strong · MacroFactor · MyFitnessPal · Cronometer · Notes or a spreadsheet · Nothing · Other |
| 7 | Do you wear anything that tracks sleep? | Checkboxes | Apple Watch · Oura · WHOOP · Garmin · Other · Nothing |
| 8 | How often do you weigh yourself now? | Multiple choice | Most days · Once or twice a week · Rarely · No scale |
| 9 | What are you doing right now? | Multiple choice | Cutting · Bulking · Maintaining · Not sure |
| 10 | For 8 weeks, could you weigh in most mornings, log food most days and log your sessions? | Multiple choice | Yes · Probably · Not sure |
| 11 | Where did you hear about this? | Multiple choice | Reddit · Discord · Instagram, TikTok or X · A coach · A university society · Other |
| 12 | Which one? | Short answer | Optional. Placeholder "e.g. r/naturalbodybuilding". Tells you which sub or server worked. |
| 13 | If you're not picked this time, can we email you when it launches? | Multiple choice | Yes · No |
| 14 | Anything else we should know? | Long answer | Optional |

**Thank-you page (one for everyone):** "Thanks, you're on the list." then "We'll pick testers when the build is ready and email you either way. It's iPhone only for now: if you don't have one and said yes to the launch email, we'll write when it launches." **Logic:** "No" on 3 hides 4 to 12. **Required:** all but 12 and 14.

## Picking

- **Must have:** an iPhone, 3 or more sessions a week, and "Yes" or "Probably" on 10.
- **Then fill the mix:** at least 3 already logging in Hevy, Strong or MacroFactor (6), at least 3 with a watch (7), some cutting and some bulking (9), and more than one source (11) so one community's habits don't decide the result. Prefer a year or more of lifting (5) and people who already weigh in (8).
- **Wave 1:** the 3 who replied fastest and fit best, a week before everyone else, to find what breaks. Offer each a 10-minute video call for setup.
- **Wave 2:** the rest. Offer the same 10-minute call (install, goal, import, Apple Health); `guide.md` for anyone who'd rather not. Message each person on day 3: with strangers, that first week decides who stays.
- **Invite by email, not the public link:** App Store Connect → TestFlight → the external group → add each picked person with the form's email. Public-link testers show up anonymous and the link can be passed on.
- **Everyone else** with "Yes" on 13 is the launch waitlist, the people the founding price is for.
- Email everyone the outcome, picked or not.

## The sheet

Add these columns to the Tally sheet: Picked (wave 1, wave 2, waitlist, no), Start date, Week 2, Week 4, Week 8 (ticked when that check-in arrives), Founding year (all three ticked). Nothing from their logs goes in it: no weights, food or sleep.
