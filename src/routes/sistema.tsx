import { createFileRoute } from "@tanstack/react-router";

import { SystemLanding } from "@/components/landing/SystemLanding";

const TITLE = "TiNutri Smart Label® | Etiquetas e controle de validade para cozinhas";
const DESCRIPTION =
  "Etiquetas térmicas com QR Code e controle de validade PVPS para restaurantes, padarias e indústrias de alimentos. Emita em segundos e comprove as boas práticas na fiscalização.";

export const Route = createFileRoute("/sistema")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
    ],
  }),
  component: SystemLanding,
});
