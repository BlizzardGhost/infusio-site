export type Role = 'system' | 'user' | 'assistant';
export type Message = { role: Role; content: string };

export type Lead = {
  name?: string;
  email?: string;
  phone?: string;
  locale?: 'en' | 'es';
  intent?: 'website' | 'automation' | 'book' | 'bug' | 'whatsapp' | 'generic';
  transcript?: string;   // full convo
  utm?: Record<string,string>;
  tz?: string;
  ua?: string;
};