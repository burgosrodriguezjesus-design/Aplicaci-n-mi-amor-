import type { Metadata } from "next";
import { Suspense } from "react";
import { LibraryView } from "@/components/library/LibraryView";
import { CardSkeleton } from "@/components/ui/Primitives";

export const metadata: Metadata = { title: "Biblioteca" };

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      }
    >
      <LibraryView />
    </Suspense>
  );
}
