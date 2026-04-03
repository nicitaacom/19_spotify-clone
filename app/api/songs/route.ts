export const maxDuration = 60 // max on Hobby plan Vercel 60s

export async function POST(request: Request) {
  // This route is a placeholder to ensure Vercel config is aware of the 60s limit
  // Actual uploads are handled via direct client-to-storage signed URLs for progress tracking
  return new Response(JSON.stringify({ message: "Upload route active" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
