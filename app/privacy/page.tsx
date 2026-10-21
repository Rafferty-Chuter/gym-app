import type { Metadata } from "next";
import Link from "next/link";
import DocPage, { type DocSection } from "@/components/ui/DocPage";

export const metadata: Metadata = { title: "Privacy · Gym AI", description: "What Gym AI stores, where, and what leaves your phone." };

/**
 * The privacy policy (polish, App Store readiness). Every statement here
 * describes what the code does; change the code and this page together.
 */
const SECTIONS: readonly DocSection[] = [
  {
    title: "Stored on your phone",
    body: (
      <>
        <p>Everything you log stays on your phone: food, weight, waist, sleep, workouts, your goal and your settings. Gym AI has no accounts, and we do not keep a copy of your log on our servers.</p>
        <p>In the iPhone app, a second copy is kept in the app&apos;s own folder so a cleared web cache does not lose your history. Deleting the app deletes both.</p>
      </>
    ),
  },
  {
    title: "Apple Health",
    body: (
      <>
        <p>In the iPhone app, Gym AI asks to read the types you choose: weight, body fat, sleep, steps, resting heart rate and heart rate variability. They are read on the phone and stored with the rest of your log. Gym AI never writes to Apple Health.</p>
        <p>Health data is never used for advertising, never sold and never shared with anyone except as described below. You can change access at any time in Settings → Health → Data Access & Devices.</p>
        <p>If you use the Health Auto Export app instead, it sends the data you select to our server, stored against a random token we only keep in hashed form, so your phone can fetch it. Disconnecting in Profile deletes everything stored for that token.</p>
      </>
    ),
  },
  {
    title: "What leaves your phone, and why",
    body: (
      <ul>
        <li>
          <strong>Describe a meal:</strong> the text you type is sent to our server and to Anthropic (Claude) to work out the foods and amounts. For a restaurant chain, a web search looks up its published nutrition.
        </li>
        <li>
          <strong>The coach chat</strong>, where available: your question and a summary of your numbers (goal, weight trend, intake, training and sleep) are sent to Anthropic to write the answer.
        </li>
        <li>
          <strong>Food search and barcodes:</strong> the words or barcode are sent through our server to Open Food Facts.
        </li>
        <li>
          <strong>Reminders</strong>, if you turn them on: your device&apos;s push address, time zone, reminder time, and which recent days have a weigh-in or food logged (dates only, no amounts). Turning reminders off deletes this.
        </li>
      </ul>
    ),
  },
  {
    title: "Our service providers",
    body: (
      <ul>
        <li>Anthropic processes Describe and chat requests on our behalf. Under its commercial terms it does not use this data to train its models.</li>
        <li>Vercel hosts the app and keeps standard request logs (IP address, time and page) for security and reliability.</li>
        <li>Supabase stores Health Auto Export samples and reminder settings, only if you use those features.</li>
        <li>Open Food Facts receives food searches and barcodes.</li>
      </ul>
    ),
  },
  {
    title: "What we log",
    body: <p>Our server records how many requests each phone makes and what they cost, so a daily limit can be enforced. It never logs what you typed, what you ate, your weight or your sleep. There are no analytics or advertising tools in the app.</p>,
  },
  {
    title: "Your rights",
    body: (
      <>
        <p>Under UK data protection law you can ask what we hold about you, and ask us to correct or delete it. Because your log lives on your phone, you control most of it directly: edit or delete entries in the app, or delete the app. To delete server-side data, disconnect Health Auto Export and turn off reminders in Profile, or contact us through the <Link href="/support" className="underline" style={{ color: "var(--text)" }}>support page</Link>.</p>
      </>
    ),
  },
  {
    title: "Health and age",
    body: <p>Gym AI gives general information about food, training and sleep. It is not medical advice and does not diagnose or treat anything. Talk to a doctor or registered dietitian before big changes, especially with a medical condition, pregnancy or a history of disordered eating. Gym AI is not intended for anyone under 16, and it does not set calorie deficits for anyone under 18.</p>,
  },
  {
    title: "Changes",
    body: <p>When this policy changes, this page and its date change with it. A change that affects what leaves your phone will also be explained in the app.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <DocPage
      title="Privacy"
      updated="21 October 2026"
      intro={<p>Gym AI keeps your log on your phone. This page says exactly what is stored, where, and what is sent elsewhere to make a feature work.</p>}
      sections={SECTIONS}
    />
  );
}
