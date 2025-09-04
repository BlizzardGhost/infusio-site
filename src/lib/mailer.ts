export async function sendLeadEmail({ name, email, message }: {name:string,email:string,message?:string}) {
  const key = import.meta.env.RESEND_API_KEY!;
  const from = import.meta.env.RESEND_FROM!;
  const to = import.meta.env.ALERT_TO!;
  const r = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' },
    body: JSON.stringify({
      from, to, subject: `New lead: ${name}`,
      html: `<p><b>Name:</b> ${name}<br/><b>Email:</b> ${email}<br/>${message??''}</p>`
    })
  });
  if (!r.ok) console.warn('Resend failed', await r.text());
}