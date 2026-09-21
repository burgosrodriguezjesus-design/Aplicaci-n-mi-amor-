import { Suspense } from "react";
import { DocumentView } from "@/components/document/DocumentView";
import { Skeleton } from "@/components/ui/Primitives";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <DocumentView documentId={id} />
    </Suspense>
  );
}
