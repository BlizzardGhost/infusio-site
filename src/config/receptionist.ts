// /src/config/receptionist.ts
// -----------------------------------------------------------------------------
// Centralized persona, reference catalog, offline fallback answers, and variables
// for the Infusio AI Receptionist (both Hero Voice Orb and Text Panel).
//
// Spec:  specs/002-natural-low-latency-conversation/spec.md (FR-201, FR-202)
//
// WHY THIS FILE IS STRUCTURED THIS WAY (for debug operators):
//   1. `systemPrompt` sets a natural, consultative human front-desk tone. Earlier
//      versions prescribed a rigid 6-step sales funnel ("greet → ask name → clarify
//      goal → pitch plan → ask email"), which made every turn feel like a canned pitch.
//   2. `fewshot` MUST remain an empty array `[]` (FR-202 / RC-1). Previously, 16 fake
//      user/assistant messages were prepended directly into the live `messages` array
//      ending with the assistant asking "What's your name, and what's the best email
//      or WhatsApp?" for the Mint Tea trial. When a real visitor said "Hi, I'm Boris",
//      the LLM treated it as the answer to that fake turn and immediately pitched the
//      Mint Tea trial.
//   3. Plan names, pricing, and contact links live inside `systemPrompt` under
//      REFERENCE FACTS so the assistant knows them when asked, without reciting them
//      unprompted.
// -----------------------------------------------------------------------------

/** Minimal message shape compatible with openrouter.ts */
type Msg = { role: "system" | "user" | "assistant"; content: string };

export interface ReceptionistConfig {
  systemPrompt: string;
  fewshot: Msg[];
  answers: Record<
    string,
    { patterns: string[]; responses: { en?: string; es?: string } }
  >;
  vars: Record<string, string>;
}

/* =========================
   Client-editable variables
   ========================= */
const vars: ReceptionistConfig["vars"] = {
  brand: "Infusio",

  // Team/booking nouns used in answers:
  teamNoun_en: "our team",
  teamNoun_es: "nuestro equipo",
  bookingNoun_en: "a quick call",
  bookingNoun_es: "una llamada breve",

  // Links & contacts
  booking_url: "https://cal.com/infusio",
  contact_email: "hello@infusio.pro",
  whatsapp: "+57 314 634 6617",

  // Plans (brews): names + one-liners (used when visitor asks about plans or offline fallback)
  plan_mint_en: "Mint Tea — Free Trial",
  plan_mint_es: "Té de menta — Prueba gratuita",
  plan_mint_blurb_en:
    "A calm first sip. Experience ambient intake before committing: intelligent concierge screening inquiries, filtering spam, and delivering structured briefings (14-day free trial).",
  plan_mint_blurb_es:
    "Un primer sorbo tranquilo. Concierge inteligente que filtra spam, califica prospectos y entrega resúmenes estructurados a tu correo (prueba de 14 días sin riesgo).",

  plan_earl_en: "Earl Grey — Starter",
  plan_earl_es: "Té Earl Grey — Inicio",
  plan_earl_blurb_en:
    "Your clean base camp. Replace high-friction forms and old tech headaches with a fast, zero-maintenance intelligent front door for your business ($1,550 setup · $350/mo).",
  plan_earl_blurb_es:
    "Tu campamento base limpio. Reemplaza formularios obsoletos con una presencia rápida y recepción inteligente 24/7 ($1,550 setup · $350/mes).",

  plan_matcha_en: "Matcha — Growth",
  plan_matcha_es: "Té Matcha — Crecimiento",
  plan_matcha_blurb_en:
    "Daily operational momentum. Multilingual concierge, automated scheduling, payments, and workflow handoffs that keep your client pipeline moving quietly (from $2,750 setup · $550/mo).",
  plan_matcha_blurb_es:
    "Impulso operativo diario. Concierge bilingüe, agenda automatizada, cobros y sincronización con CRM que mantienen tu flujo activo (desde $2,750 setup · $550/mes).",

  plan_oolong_en: "Oolong — R&D • Bespoke",
  plan_oolong_es: "Té Oolong — I+D • A la medida",
  plan_oolong_blurb_en:
    "Your private AI systems lab. Bespoke autonomous agents, voice intelligence, and custom workflow architectures designed specifically around your operational bottlenecks (from $4,000 setup · custom monthly).",
  plan_oolong_blurb_es:
    "Tu laboratorio privado de sistemas de IA. Agentes autónomos a medida, inteligencia de voz y arquitecturas de flujo diseñadas para tus cuellos de botella (desde $4,000 setup · mensual a medida).",
};

/* =========================
   System prompt (FR-201: natural, consultative, non-pitchy)
   ========================= */
const systemPrompt: ReceptionistConfig["systemPrompt"] = [
  "You are the receptionist at Infusio, a studio that builds fast Astro/Vercel websites, AI receptionists (voice and chat), and quiet business automations (scheduling, CRM, WhatsApp, payments, and an operator dashboard).",
  "Infusio is a software and AI studio, NOT a medical, IV-therapy, or spa clinic (though we build websites and AI systems for clinics and small businesses).",
  "CONVERSATION STYLE: Speak naturally like a warm, perceptive human front-desk colleague. Listen to what the visitor actually said, respond directly to it, and ask at most one natural follow-up question.",
  "ANTI-PITCH RULE: Never give a scripted sales pitch. Do NOT mention plan names (Mint Tea, Earl Grey, Matcha, Oolong), setup fees, or monthly prices unless the visitor specifically asks about plans, pricing, or a free trial.",
  "Do NOT ask for the visitor's email, phone number, or WhatsApp on the first turn. Have a genuine conversation first; only offer to connect them with our team or book a short call once there is a clear reason or they ask.",
  "If the visitor shares their name, greet them naturally by name once and do not ask for their name again. Do not repeat 'Hi/Hello' on follow-up turns.",
  "Match the visitor's language (English or Spanish). Never use emojis, markdown headings, or bullet lists.",
  "Keep replies concise: 1 to 2 short, natural sentences.",
  `REFERENCE FACTS (use ONLY when the visitor asks about plans, pricing, trials, or contact info):`,
  `1) ${vars.plan_mint_en}: 14-day free trial of our AI concierge screening inquiries and sending structured briefings.`,
  `2) ${vars.plan_earl_en}: Fast Astro/Vercel website + 24/7 AI receptionist ($1,550 setup, $350/mo).`,
  `3) ${vars.plan_matcha_en}: Bilingual concierge + automated scheduling, payments, and CRM workflows (from $2,750 setup, $550/mo).`,
  `4) ${vars.plan_oolong_en}: Bespoke autonomous agents, voice AI, and custom workflows (from $4,000 setup).`,
  `Contact & booking: ${vars.booking_url} | Email: ${vars.contact_email} | WhatsApp: ${vars.whatsapp}.`,
].join(" ");

/* =========================
   Few-shots (FR-202: kept empty so fake turns never pollute live conversation state)
   ========================= */
const fewshot: Msg[] = [];

/* =========================
   Instant local answers (used ONLY as offline fallback if /api/chat fails)
   ========================= */
const answers: ReceptionistConfig["answers"] = {
  whatsapp_number: {
    patterns: [
      "\\b(whats ?app|wa)[\\s-]*(number|no\\.?|contact)\\b",
      "\\bwhat'?s your[\\s-]*(whats ?app|wa)\\b",
      "\\b(n[uú]mero|numero) de[\\s-]*(whats ?app|wa)\\b",
    ],
    responses: {
      en: "Of course — our WhatsApp is {whatsapp}. Feel free to message us there anytime.",
      es: "Claro — nuestro WhatsApp es {whatsapp}. Escríbenos por ahí cuando quieras.",
    },
  },
  schedule_call: {
    patterns: [
      "\\b(schedule|book|set|arrange|organize) (a )?(call|meeting)\\b",
      "\\b(agendar|programar|reservar).*(llamada|reuni[oó]n)\\b",
    ],
    responses: {
      en: "Happy to help — you can grab a time at {booking_url} or tell me what day works for you.",
      es: "Con gusto — puedes elegir horario en {booking_url} o decirme qué día te queda bien.",
    },
  },
  contact_email: {
    patterns: ["\\b(email|correo)(\\s*(address|electr[oó]nico))?\\b"],
    responses: {
      en: "You can reach us at {contact_email}.",
      es: "Puedes escribirnos a {contact_email}.",
    },
  },
  medical_redirect: {
    patterns: ["\\b(spa|massage|medic(al|ina)|clinic|wellness|therap(y|ia))\\b"],
    responses: {
      en: "We don’t provide medical or spa treatments — we build fast websites and AI receptionists for businesses.",
      es: "No ofrecemos tratamientos médicos ni de spa — creamos sitios rápidos y recepcionistas con IA para negocios.",
    },
  },
  plan_mint: {
    patterns: ["\\b(mint tea|mint|free trial|trial)\\b", "\\b(t[eé] de menta|prueba|gratis)\\b"],
    responses: {
      en: "{plan_mint_en}: {plan_mint_blurb_en}",
      es: "{plan_mint_es}: {plan_mint_blurb_es}",
    },
  },
  plan_earl: {
    patterns: ["\\b(earl\\s*grey|starter|base)\\b", "\\b(t[eé]\\s*earl\\s*grey|inicio|base)\\b"],
    responses: {
      en: "{plan_earl_en}: {plan_earl_blurb_en}",
      es: "{plan_earl_es}: {plan_earl_blurb_es}",
    },
  },
  plan_matcha: {
    patterns: ["\\b(matcha|growth)\\b", "\\b(t[eé]\\s*matcha|crecimiento)\\b"],
    responses: {
      en: "{plan_matcha_en}: {plan_matcha_blurb_en}",
      es: "{plan_matcha_es}: {plan_matcha_blurb_es}",
    },
  },
  plan_oolong: {
    patterns: ["\\b(oolong|bespoke|r&d|research)\\b", "\\b(t[eé]\\s*oolong|a la medida|i\\s*\\+\\s*d)\\b"],
    responses: {
      en: "{plan_oolong_en}: {plan_oolong_blurb_en}",
      es: "{plan_oolong_es}: {plan_oolong_blurb_es}",
    },
  },
  which_plan: {
    patterns: ["\\b(which|what).*plan\\b", "\\b(cu[aá]l).*plan\\b", "\\b(choose|elige|recomendaci[oó]n).*plan\\b"],
    responses: {
      en: "We have four options: Mint (14-day free trial), Earl Grey (starter site + AI), Matcha (growth automations), and Oolong (bespoke R&D). What are you building?",
      es: "Tenemos cuatro opciones: Menta (prueba de 14 días), Earl Grey (sitio + IA inicial), Matcha (automatizaciones de crecimiento) y Oolong (a medida). ¿Qué estás construyendo?",
    },
  },
};

const config: ReceptionistConfig = { systemPrompt, fewshot, answers, vars };
export default config;

export const SYSTEM  = systemPrompt;
export const FEWSHOT = fewshot;
export const ANSWERS = answers;
export const VARS    = vars;
