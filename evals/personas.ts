import type { IntentId } from "@/lib/catalog";
import type { EntryBranch, GoalsStatus, WebsiteStatus } from "@/lib/onboarding/entry";

// Scripted users for the entry-flow eval: every path × a range of answer styles.
export type Persona = {
  id: string;
  /** Who they are and how they talk, for the simulated user. */
  script: string;
  expect: {
    branch: EntryBranch;
    website: Exclude<WebsiteStatus, "unknown" | "unreadable">;
    goals: Exclude<GoalsStatus, "unknown">;
    /** Any of these as the top intent counts as a match. Omitted for unsupported goals: the path resolves before any redirect. */
    intents?: IntentId[];
    /** A domain the recorded URL must contain. */
    domain?: string;
    /** They ask for something Ploy doesn't do; it must be flagged as unmatched. */
    unsupported?: boolean;
  };
};

export const personas: Persona[] = [
  // A · site + goal
  {
    id: "a_all_in_first_message",
    script:
      "You run BrightSmile, scheduling software for dental clinics. Site: brightsmile-dental.com. You want more demo bookings. In your very first message, give your site, what you do, and your goal all at once.",
    expect: { branch: "A", website: "has", goals: "has", intents: ["get_more_leads", "convert_site_visitors"], domain: "brightsmile-dental.com" },
  },
  {
    id: "a_frontload_outreach",
    script:
      "You run Pulsecheck, employee survey software for mid-size companies. Site: pulsecheck-hr.com. In your very first message, give your site, what you sell and to whom, and that you want to start cold outreach to HR leaders. After that, answer follow-ups briefly and specifically.",
    expect: { branch: "A", website: "has", goals: "has", intents: ["run_outbound", "get_more_leads"], domain: "pulsecheck-hr.com" },
  },
  {
    id: "a_terse",
    script:
      "You run Tidewater Kayaks, guided kayak tours. Site: tidewaterkayaks.com. Goal: more people who visit the site should book a tour. You're terse: a few words per message, no pleasantries.",
    expect: { branch: "A", website: "has", goals: "has", intents: ["convert_site_visitors", "get_more_leads"], domain: "tidewaterkayaks.com" },
  },
  {
    id: "a_goal_first",
    script:
      "You run PeoplePulse, employee survey software. Site: peoplepulse.io. In your first message, ignore the website question and say you want to start cold outreach to HR leaders. Give the site only when asked again.",
    expect: { branch: "A", website: "has", goals: "has", intents: ["run_outbound", "get_more_leads"], domain: "peoplepulse.io" },
  },
  {
    id: "a_social_link",
    script:
      "You make handmade ceramics (Luna Ceramics). You have no website, only an Instagram: instagram.com/lunaceramics. Give that link when asked about a website. Goal: grow your brand with content.",
    expect: { branch: "A", website: "has", goals: "has", intents: ["grow_content_brand"], domain: "instagram.com" },
  },
  {
    id: "a_typo_url",
    script:
      "You run Greenleaf Landscaping. Your site is greenleaf-landscaping.com, but the first time you type it as 'greenleaf-landscaping,com' (with a comma). If asked to double-check, give it correctly. Goal: start running Google Ads.",
    expect: { branch: "A", website: "has", goals: "has", intents: ["launch_paid_ads"], domain: "greenleaf-landscaping.com" },
  },
  {
    id: "a_multiple_goals",
    script:
      "You run Northwind Logistics, a freight broker. Site: northwindlogistics.com. When asked about goals, list three: more leads, knowing which marketing actually works, and automating follow-ups.",
    expect: {
      branch: "A",
      website: "has",
      goals: "has",
      intents: ["get_more_leads", "measure_performance", "automate_busywork", "nurture_pipeline"],
      domain: "northwindlogistics.com",
    },
  },
  {
    id: "a_vague_goal",
    script:
      "You run Copper Pot Cafe. Site: copperpotcafe.com. When asked about goals, just say you want to 'grow'. If pushed, say more customers.",
    expect: { branch: "A", website: "has", goals: "has", intents: ["get_more_leads", "grow_content_brand"], domain: "copperpotcafe.com" },
  },
  {
    id: "a_pipeline",
    script:
      "You run CloseLoop, a sales consultancy. Site: closeloop-crm.com. Your problem: lots of leads come in but go cold because nobody follows up.",
    expect: { branch: "A", website: "has", goals: "has", intents: ["nurture_pipeline", "automate_busywork"], domain: "closeloop-crm.com" },
  },
  {
    id: "a_measure",
    script:
      "You run Brightbox, a subscription snack box. Site: brightbox-snacks.com. Goal: figure out which marketing channels actually bring customers.",
    expect: { branch: "A", website: "has", goals: "has", intents: ["measure_performance"], domain: "brightbox-snacks.com" },
  },
  {
    id: "a_unsupported_fundraising",
    script:
      "You run FinStack, fintech APIs. Site: finstack.io. When asked about goals, say you mainly need help raising a seed round. If told that's not what Ploy does, say that more developer signups would help too.",
    expect: {
      branch: "A",
      website: "has",
      goals: "has",
      domain: "finstack.io",
      unsupported: true,
    },
  },

  // B · site, no goal
  {
    id: "b_unsure",
    script:
      "You run Harborview Dental Group. Site: harborviewdentalgroup.com. You honestly don't know what to focus on in marketing and want suggestions.",
    expect: { branch: "B", website: "has", goals: "unsure", domain: "harborviewdentalgroup.com" },
  },
  {
    id: "b_taps_chip",
    script:
      "You run Acme Roofing. Site: acme-roofing.com. When asked about goals, reply with exactly the reply chip that says you're not sure and want a suggestion.",
    expect: { branch: "B", website: "has", goals: "unsure", domain: "acme-roofing.com" },
  },
  {
    id: "b_rambling",
    script:
      "You run BrightPath Tutoring. Site: brightpathtutoring.org. You write long, rambling messages about how busy you are. On goals: you have no idea what to prioritize, you just know marketing feels overwhelming.",
    expect: { branch: "B", website: "has", goals: "unsure", domain: "brightpathtutoring.org" },
  },
  {
    id: "b_unsure_first",
    script:
      "You make furniture (Maple & Oak). Site: mapleandoakfurniture.com. In your first message, say a friend recommended Ploy and you're not sure what you need yet. Give the site when asked.",
    expect: { branch: "B", website: "has", goals: "unsure", domain: "mapleandoakfurniture.com" },
  },
  {
    id: "b_marketplace",
    script:
      "You sell embroidered clothing on Etsy: etsy.com/shop/wildthreadco. That's your only site. You're not sure what marketing to focus on.",
    expect: { branch: "B", website: "has", goals: "unsure", domain: "etsy.com" },
  },

  // C · goal, no site
  {
    id: "c_no_site_customers",
    script:
      "You run a mobile dog grooming business. You have no website. You want more customers. Answer one thing at a time.",
    expect: { branch: "C", website: "none", goals: "has", intents: ["get_more_leads"] },
  },
  {
    id: "c_frontload_nosite",
    script:
      "You run Suds on Wheels, a mobile dog grooming van in Austin for busy pet owners. You have no website. In your very first message, say you have no site, what you do and for whom, and that you want more bookings. After that, answer follow-ups briefly.",
    expect: { branch: "C", website: "none", goals: "has", intents: ["get_more_leads"] },
  },
  {
    id: "c_not_live",
    script:
      "You're building a site on Squarespace for your skincare brand but it isn't live yet. Once it's live you want to launch Facebook/Instagram ads.",
    expect: { branch: "C", website: "not_live", goals: "has", intents: ["launch_paid_ads"] },
  },
  {
    id: "c_all_at_once",
    script:
      "Your first message: you have no website, you're a freelance bookkeeper for restaurants, and you want to do cold outreach to restaurant owners.",
    expect: { branch: "C", website: "none", goals: "has", intents: ["run_outbound", "get_more_leads"] },
  },
  {
    id: "c_content",
    script:
      "You're a yoga instructor with no website. You want to build your personal brand on Instagram and LinkedIn.",
    expect: { branch: "C", website: "none", goals: "has", intents: ["grow_content_brand"] },
  },
  {
    id: "c_unsupported_hiring",
    script:
      "You run a small software agency with no website. When asked about goals, say you mostly need help hiring engineers. If told that's not what Ploy does, say more clients would be good too.",
    expect: { branch: "C", website: "none", goals: "has", unsupported: true },
  },

  // D · no site, no goal
  {
    id: "d_bakery",
    script: "You run a small bakery with no website. You're not sure what to do about marketing at all.",
    expect: { branch: "D", website: "none", goals: "unsure" },
  },
  {
    id: "d_terse",
    script:
      "You're a plumber. No website. You answer in 1-3 words ('no site', 'idk', 'plumbing'). You have no marketing goals in mind.",
    expect: { branch: "D", website: "none", goals: "unsure" },
  },
  {
    id: "d_idea_stage",
    script:
      "You haven't launched yet: you're working on an AI meal-planning app. No website. You don't know where to start with marketing.",
    expect: { branch: "D", website: "none", goals: "unsure" },
  },
  {
    id: "d_taps_chips",
    script:
      "You run a photography studio. Answer the website question with exactly the reply chip saying you don't have a website yet, then describe the studio in a sentence if asked, then reply with exactly the chip saying you're not sure and want a suggestion.",
    expect: { branch: "D", website: "none", goals: "unsure" },
  },
];
