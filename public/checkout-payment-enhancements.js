const CARD_OPTION_ID = "checkout-card-option";

function addCardOption() {
  if (document.getElementById(CARD_OPTION_ID)) return;
  const pixLabel = [...document.querySelectorAll("label")].find((label) =>
    label.textContent?.includes("PIX"),
  );
  if (!pixLabel) return;

  const card = document.createElement("div");
  card.id = CARD_OPTION_ID;
  card.className = "mt-3 flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 p-4 opacity-75";
  card.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 bg-white text-xl">💳</span>
      <div>
        <div class="text-[14px] font-semibold text-neutral-900">Cartão de crédito</div>
        <div class="text-[12px] font-medium text-neutral-500">Estrutura pronta · gateway ainda não configurado</div>
      </div>
    </div>
    <span class="rounded-full bg-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-600">Indisponível</span>`;
  pixLabel.parentElement?.insertBefore(card, pixLabel.nextSibling);
}

const observer = new MutationObserver(addCardOption);
observer.observe(document.body, { childList: true, subtree: true });
addCardOption();
