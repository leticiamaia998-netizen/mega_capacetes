import assert from "node:assert/strict";
import test from "node:test";

// Inline copy of H thresholds for unit test (mirrors lib/store/tracking.ts)
const H = { FALHA1: 195 + 22 / 60, TAXA: 262 + 53 / 60, SAIU: 171 + 22 / 60 };

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

test("timeline recente: sem falha nem taxa", async () => {
  const { timelineFrom } = await import("../lib/store/tracking-ui.ts");
  const result = timelineFrom(hoursAgo(24), { cidade: "João Pessoa", estado: "PB" });
  assert.equal(result.falhaEntrega, false);
  assert.equal(result.aguardandoTaxa, false);
  assert.ok(result.timeline.some((s) => s.etapa === "Saiu para entrega") === false || result.timeline.find((s) => s.etapa === "Saiu para entrega")?.concluido === false);
});

test("timeline antiga: falha e taxa aparecem", async () => {
  const { timelineFrom } = await import("../lib/store/tracking-ui.ts");
  const result = timelineFrom(hoursAgo(H.TAXA + 1), { cidade: "João Pessoa", estado: "PB" });
  assert.equal(result.falhaEntrega, true);
  assert.equal(result.aguardandoTaxa, true);
  assert.ok(result.timeline.some((s) => s.erro));
  assert.ok(result.timeline.some((s) => s.taxa));
  assert.equal(result.status, "Taxa de reenvio");
});

test("timeline pós-saiu: falha ainda não", async () => {
  const { timelineFrom } = await import("../lib/store/tracking-ui.ts");
  const result = timelineFrom(hoursAgo(H.SAIU + 1), { cidade: "Recife", estado: "PE" });
  assert.equal(result.falhaEntrega, false);
  assert.equal(result.aguardandoTaxa, false);
  assert.ok(result.timeline.find((s) => s.etapa === "Saiu para entrega")?.concluido);
});
