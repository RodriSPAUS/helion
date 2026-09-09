import { createFileRoute } from "@tanstack/react-router";
import { HelionApp } from "@/components/helion-app";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <HelionApp />;
}
