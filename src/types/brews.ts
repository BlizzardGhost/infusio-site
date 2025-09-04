// /src/types/brew.ts
export interface Brew {
  id: string;
  tea: string;
  tier: string;
  tagline: string;
  icon: string;
  blurb: string;
  features: string[];
  sla: string;
  setup?: string;
  monthly?: string;
  ctaHref: string; // usually "#book"
}