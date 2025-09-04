// /src/data/brews.ts
import type { Brew } from "../types/brew";

export const brews: Brew[] = [
  {
    id: "mint",
    tea: "Mint Tea",
    tier: "Free Trial",
    tagline: "A calm first sip.",
    icon: "fluent-emoji-high-contrast:leaf-fluttering-in-wind",
    blurb:
      "Try the flavor before you commit. A lightweight AI contact form that delivers leads and transcripts to your inbox.",
    features: [
      "AI-powered contact form (text-only, single language, brand-labeled)",
      "Leads + Transcript delivered to your email",
      "Server-side keys hosted by us (secure + demo-safe)",
      "14-day trial period",
      "No setup or support included"
    ],
    sla: "Trial support is community-only (email reference docs).",
    ctaHref: "#book"
  },
  {
    id: "earl",
    tea: "Earl Grey",
    tier: "Starter",
    tagline: "Your clean base camp.",
    icon: "hugeicons:tea",
    blurb:
      "Leave behind old tech headaches. Earl Grey gives you a fast, secure base with AI intake included.",
    features: [
      "Website migration to Astro + Vercel AI Cloud (CDN, Firewall, scalable)",
      "Development for up to 6 pages",
      "Basic portfolio (up to 15 SKUs)",
      "Single-language site",
      "Modern SEO & Security hardening",
      "Dashboard access: basic CMS, analytics & CRM",
      "AI Receptionist (text-only, single language)"
    ],
    sla: "Regular support: 48–72 hours.",
    setup: "$1,550 setup",
    monthly: "$350/mo",
    ctaHref: "#book"
  },
  {
    id: "matcha",
    tea: "Matcha",
    tier: "Growth",
    tagline: "Daily ritual for momentum.",
    icon: "emojione-monotone:teacup-without-handle",
    blurb:
      "Multilingual reach, bookings, payments, and AI tools that keep momentum steady every day.",
    features: [
      "Everything in Earl Grey",
      "Development for up to 9 pages",
      "Bilingual site (English + Spanish)",
      "Portfolio + Webstore (up to 50 SKUs)",
      "Stripe integration (payments)",
      "Booking/Calendar integration",
      "External CRM/Funnel integration",
      "Bilingual AI Receptionist (text-based)",
      "AI assessment + basic tools tailored to your workflows",
      "Dashboard: AI CMS, analytics, feature controls & CRM"
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
    tagline: "Your private tea house.",
    icon: "game-icons:teapot-leaves",
    blurb:
      "Custom AI systems, experiments, and dedicated support — a private lab where anything can be brewed.",
    features: [
      "Everything in Matcha",
      "Development for up to 12 pages + A/B testing",
      "Custom AI Agents for systems & integrations",
      "Voice AI Receptionist (multilingual)",
      "Dedicated experiment runway & roadmap",
      "Priority support with targets"
    ],
    sla: "Priority support: 12–24 hours.",
    setup: "from $4,000 setup",
    monthly: "custom monthly (by integrations)",
    ctaHref: "#book"
  }
];