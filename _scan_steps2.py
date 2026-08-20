import re
from pathlib import Path

t = Path("public/assets/CheckoutPage-kwbUh1zB.js").read_text(encoding="utf-8", errors="ignore")
# find step rendering - does it unmount previous steps?
for m in re.finditer(r"u===1|u===2|u===3|m===1|step", t):
    pass
# look for conditional payment section
idx = t.find("Ir para Pagamento")
print(re.sub(r"\s+", " ", t[max(0,idx-800):idx+200])[:1000])
print("---")
idx2 = t.find("Identificação")
print("id count", t.count("name:\"name\""), "cep count", t.count("name:\"cep\""))
# are inputs always rendered?
for label in ["u===1", "u===2", "u===3", "u>1", "u>=2"]:
    print(label, t.count(label))
