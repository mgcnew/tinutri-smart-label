import React from "react";
import { createRoot } from "react-dom/client";
import { ContractJourney } from "../../src/components/contracting/ContractJourney";
import { ContractOfferModal } from "../../src/components/master/ContractOfferModal";
import { fixture } from "./contracting-functions.stub";
import "../../src/styles.css";
const scenario = new URLSearchParams(window.location.search).get("scenario");
createRoot(document.getElementById("root")!).render(
  scenario?.startsWith("master") ? (
    <ContractOfferModal
      contract={{
        id: fixture.id,
        client_id: fixture.id,
        title: fixture.title,
        body: "Documento completo para testar o compartilhamento.",
        status: "em_revisao",
        company_snapshot: {
          name: fixture.company_name,
          responsible_name: "Representante teste",
          email: "cliente@example.com",
        },
        plan_snapshot: fixture.commercial.plan,
        commercial_snapshot: fixture.commercial,
        created_by: fixture.id,
        created_at: "2026-10-20T12:00:00Z",
        updated_at: "2026-10-20T12:00:00Z",
      }}
      onClose={() => {}}
    />
  ) : (
    <ContractJourney token={"a".repeat(43)} />
  ),
);
