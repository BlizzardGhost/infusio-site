// /backend/src/app/api/health/route.ts
export async function GET() {
  return new Response('ok ' + new Date().toISOString());
}
