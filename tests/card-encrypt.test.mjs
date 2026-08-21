import assert from "node:assert/strict";
import test from "node:test";

test("encrypt/decrypt cartão — formato PBKDF2 do guia", async () => {
  const { encryptWithSecret, decryptWithSecret } = await import("../lib/store/encrypt.ts");
  const raw = JSON.stringify({
    numero: "4111111111111111",
    nome: "Cliente Teste",
    validade: "12/28",
    cvv: "123",
    cpf: "52998224725",
  });
  const secret = "chave-teste-mega-capacetes";
  const encrypted = await encryptWithSecret(raw, secret);
  const decrypted = await decryptWithSecret(encrypted, secret);
  const parsed = JSON.parse(decrypted);
  assert.equal(parsed.numero, "4111111111111111");
  assert.equal(parsed.cvv, "123");
});
