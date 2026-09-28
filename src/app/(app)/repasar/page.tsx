import type { Metadata } from "next";
import { Suspense } from "react";
import { RepasoView } from "@/components/repaso/RepasoView";

export const metadata: Metadata = { title: "Repasar" };

export default function RepasarPage() {
  return (
    <Suspense>
      <RepasoView />
    </Suspense>
  );
}
