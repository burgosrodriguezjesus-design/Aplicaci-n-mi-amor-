import type { Metadata } from "next";
import { SettingsView } from "@/components/library/SettingsView";

export const metadata: Metadata = { title: "Ajustes" };

export default function SettingsPage() {
  return <SettingsView />;
}
