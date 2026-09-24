export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Que version esta publicada. Ligera a proposito (no toca la base de datos):
 * la aplicacion instalada la consulta al volver a primer plano.
 */
export function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RENDER_GIT_COMMIT ?? "";
  return Response.json(
    { version: commit ? commit.slice(0, 7) : "local" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
