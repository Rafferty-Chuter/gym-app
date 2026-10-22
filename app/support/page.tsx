import type { Metadata } from "next";
import Link from "next/link";
import DocPage, { type DocSection } from "@/components/ui/DocPage";
import { FEEDBACK_URL } from "@/lib/feedback";

export const metadata: Metadata = { title: "Support · Liftworks", description: "Help with Liftworks and how to get in touch." };

const linkStyle = { color: "var(--text)" };

/** Support (polish, App Store readiness): how to reach us, and answers to what testers ask first. */
export default function SupportPage() {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const form = FEEDBACK_URL;
  const sections: DocSection[] = [
    {
      title: "Getting in touch",
      body: (
        <ul>
          {email && (
            <li>
              Email{" "}
              <a href={`mailto:${email}`} className="underline" style={linkStyle}>
                {email}
              </a>
              . A reply usually comes within two working days.
            </li>
          )}
          {form && (
            <li>
              {email ? "Or use the" : "Use the"}{" "}
              <a href={form} className="underline" style={linkStyle} target="_blank" rel="noopener noreferrer">
                feedback form
              </a>
              , also at the top of Profile. A screenshot helps.
            </li>
          )}
          {!email && !form && <li>This version has no contact details set yet.</li>}
        </ul>
      ),
    },
    {
      title: "Why does it say Calibrating?",
      body: <p>The coach stays quiet until the data can support a verdict. With a weigh-in most mornings and most days&apos; food logged, the first read comes in about three weeks, and the maintenance estimate settles over the following month. Weighing in 4 or more days a week and logging most days is what makes the verdicts reliable.</p>,
    },
    {
      title: "Apple Health",
      body: <p>In the iPhone app: Profile → Apple Health → Connect Apple Health, then allow the types you want. Sleep, weight, steps, resting heart rate and HRV are read each time the app opens. In the web app, the same sheet explains how to send them with Health Auto Export instead.</p>,
    },
    {
      title: "Moving to a new phone, or into the iPhone app",
      body: <p>On the old phone or the web app: Profile → Move to another phone → copy. On the new one: Profile → Import → paste. Your log lives on the phone, so do this before deleting the old app.</p>,
    },
    {
      title: "Deleting your data",
      body: (
        <p>
          Edit or delete any entry from the day it was logged, or delete the app to remove everything. Disconnecting Health Auto Export and turning reminders off delete what the server holds. The <Link href="/privacy" className="underline" style={linkStyle}>privacy policy</Link> lists every place data goes.
        </p>
      ),
    },
    {
      title: "Not medical advice",
      body: <p>Liftworks gives general information about food, training and sleep, worked out from what you log. It is not medical advice. If you have a medical condition, are pregnant or have a history of disordered eating, talk to a doctor or registered dietitian before changing how you eat.</p>,
    },
  ];
  return <DocPage title="Support" updated="21 October 2026" sections={sections} />;
}
