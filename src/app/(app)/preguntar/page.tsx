import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatView } from "@/components/chat/ChatView";

export const metadata: Metadata = { title: "Preguntar" };

export default function PreguntarPage() {
  return (
    <Suspense>
      <ChatView />
    </Suspense>
  );
}
