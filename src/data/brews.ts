// /src/data/brews.ts
import type { Brew } from "../types/brews";

export const brews: Brew[] = [
  {
    id: "mint",
    tea: "Mint Tea",
    tier: "Free Trial",
    tagline: "A calm first sip.",
    icon: "fluent-emoji-high-contrast:leaf-fluttering-in-wind",
    blurb:
      "Experience ambient intake before committing. An intelligent concierge that screens inquiries, filters spam, and delivers structured briefings to your inbox.",
    features: [
      "Intelligent intake concierge (calm web interface)",
      "Automated lead qualification & spam filtering",
      "Daily executive briefing + email dispatch",
      "14-day zero-risk trial (hosted infrastructure)",
      "Zero disruption to current workflow"
    ],
    sla: "Trial reference docs & community onboarding.",
    ctaHref: "#book"
  },
  {
    id: "earl",
    tea: "Earl Grey",
    tier: "Starter",
    tagline: "Your clean base camp.",
    icon: "hugeicons:tea",
    blurb:
      "Replace high-friction forms and old tech headaches. Earl Grey establishes a fast, zero-maintenance intelligent front door for your business.",
    features: [
      "High-speed modern digital presence (Astro + Vercel Cloud)",
      "24/7 Text Intake Receptionist & Lead Triage",
      "Intelligent routing to team inbox",
      "Daily executive digest of inquiries and intent",
      "Zero-maintenance infrastructure (CDN, automated SSL, security hardening)",
      "Private client dashboard (lead history & controls)"
    ],
    sla: "Standard support: 24–48 hours.",
    setup: "$1,550 setup",
    monthly: "$350/mo",
    ctaHref: "#book"
  },
  {
    id: "matcha",
    tea: "Matcha",
    tier: "Growth",
    tagline: "Daily operational momentum.",
    icon: "emojione-monotone:teacup-without-handle",
    blurb:
      "Multilingual concierge, automated scheduling, payments, and workflow handoffs that keep your client pipeline moving quietly while you focus on your craft.",
    features: [
      "Everything in Earl Grey",
      "Bilingual AI Concierge (English + Spanish text)",
      "Multi-channel intake (Web + WhatsApp/Telegram concierge handoff)",
      "Automated calendar booking (Google Calendar / Cal.com sync)",
      "Stripe payment capture & invoicing",
      "CRM & pipeline sync (HubSpot, Notion, or Airtable)",
      "Automated follow-up sequences for qualified leads",
      "Studio control panel with prompt tuning & telemetry"
    ],
    sla: "Priority support: 12–24 hours.",
    setup: "from $2,750 setup",
    monthly: "$550/mo",
    ctaHref: "#book"
  },
  {
    id: "oolong",
    tea: "Oolong",
    tier: "R&D • Bespoke",
    tagline: "Your private AI systems lab.",
    icon: "game-icons:teapot-leaves",
    blurb:
      "Bespoke autonomous agents, voice intelligence, and custom workflow architectures designed specifically around your operational bottlenecks.",
    features: [
      "Everything in Matcha",
      "Multilingual Voice AI Receptionist (low-latency conversational orb)",
      "Custom internal agent workflows (n8n / API orchestration)",
      "Private business knowledge base integration (RAG / documentation retrieval)",
      "Custom API connectors & legacy tool automation",
      "Dedicated R&D runway & roadmap co-design",
      "VIP priority architect support"
    ],
    sla: "Direct architect access: <12 hours.",
    setup: "from $4,000 setup",
    monthly: "custom monthly",
    ctaHref: "#book"
  }
];
