import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ContractJourney } from "@/components/contracting/ContractJourney";

export const Route = createFileRoute("/contratar")({
  head: () => ({
    meta: [
      { title: "Sua contratação | TiNutri Smart Label" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ContractPage,
});
function ContractPage() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setToken(window.location.hash.slice(1));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return token === null ? (
    <p role="status" className="p-8">
      Abrindo contratação…
    </p>
  ) : (
    <ContractJourney token={token} />
  );
}
