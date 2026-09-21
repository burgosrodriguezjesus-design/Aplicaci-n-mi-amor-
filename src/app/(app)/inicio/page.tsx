import type { Metadata } from "next";
import { Dashboard } from "@/components/library/Dashboard";

export const metadata: Metadata = { title: "Inicio" };

export default function HomePage() {
  return <Dashboard />;
}
