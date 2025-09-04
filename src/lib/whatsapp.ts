export async function notifyWhatsApp(text: string) {
  const id = import.meta.env.WHATSAPP_PHONE_ID;
  const token = import.meta.env.WHATSAPP_TOKEN;
  const to = import.meta.env.WHATSAPP_TO;
  if (!id || !token || !to) return;
  await fetch(`https://graph.facebook.com/v20.0/${id}/messages`, {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ messaging_product:'whatsapp', to, text:{ body:text } })
  });
}