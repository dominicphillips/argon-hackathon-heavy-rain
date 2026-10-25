import type { LiveBuildRequest } from "../backend/client";

/**
 * Test request for the live builder, taken from Marcus Vance's persona in the
 * colleague's HeavyRain app. The Start action in the top-right menu sends it so
 * a real build can be launched without that app running.
 */
export function marcusVanceRequest(): LiveBuildRequest {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 17);
  return {
    idempotency_key: `marcus-${stamp}-dealpulse`,
    requested_by: {
      persona_id: "marcus",
      name: "Marcus Vance",
      role: "VP, Deal Sourcing & Screening",
    },
    workflow: {
      title: "The 15-Minute Pre-Meeting Scramble & Post-Call Recap Loop",
      summary: [
        "Uses 3 separate AI tools per meeting, yet still spends 42 mins per call copy-pasting context between Outlook, Affinity CRM, Google Search, Claude, Granola, and Email.",
        "1. 15-Min Pre-Call Panic Trigger (Outlook Calendar, 2 min): Outlook pops a 15-min reminder for the VeloceAI call while Marcus is finishing another task.",
        "2. Dig Up Old Notes & Email Threads (Affinity CRM + Outlook Search, 6.5 min): Searches Affinity CRM and the Outlook inbox for prior touchpoints and the founder's background.",
        "3. Google Company, Competitors & News (Google Search & News, 5 min): Runs 4 quick searches on VeloceAI, recent press releases, and competitor funding.",
        "4. Run AI Pre-Call Review Skill (Claude / Gemini custom skill, 4.5 min): Pastes CRM notes and search snippets into a skill to generate a pre-call brief.",
        "5. Jump on Call & Start Granola (Zoom + Granola AI, 3 min): Starts Granola manually at call start; takes rough shorthand notes during the 45-minute call.",
        "6. Copy Granola Notes into Gemini for Deal Summary (Gemini / Claude chat, 9 min): Exports the Granola transcript and pastes it into Gemini with the IC deal note prompt.",
        "7. Email Summary to Deal Team & Log CRM Fields (Outlook + Affinity CRM, 8 min): Copies the output into an Outlook email to coworkers and manually updates 6 Affinity fields.",
      ].join("\n"),
      tools: [
        "Claude 3.7 (Company Review Skill)",
        "Granola Call Notes",
        "Gemini 4 Recaps",
        "Outlook Calendar",
        "Affinity CRM + Outlook Search",
        "Google Search & News",
        "Zoom + Granola AI",
        "Outlook + Affinity CRM",
      ],
      weekly_hours_saved: 9.2,
    },
    app: {
      name: "DealPulse AutoBrief & Post-Call Loop",
      purpose: "Zero-click pre-call dossier 20m before Outlook meetings + automatic Granola-to-Deal-Team synthesis.",
      features: [
        "T-20m Auto Pre-Call Brief HUD",
        "Public Market Comp Ticker Sidebar",
        "Granola -> Deal Team Email Draft",
      ],
      assumptions: [
        "Security tier: SOC2 Type II • Firm Enclave Approved",
        "Intended architecture: Outlook Webhook (T-20m) -> Affinity CRM + Web Enricher -> Gemini 4 Argon Pre-Call Skill -> Granola Transcript Listener -> 1-Click Deal Team Email + CRM Sync",
      ],
    },
  };
}
