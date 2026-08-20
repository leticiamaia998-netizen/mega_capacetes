import { s as supabase } from "/assets/index-D36WQRm9.js";

const originalInvoke = supabase.functions.invoke.bind(supabase.functions);

supabase.functions.invoke = async (name, options) => {
  if (name === "checkout-create-pix") {
    try {
      const res = await fetch("/api/pix/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options?.body ?? {}),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        return { data, error: { message: data?.error || `HTTP ${res.status}` } };
      }
      return { data, error: null };
    } catch (error) {
      return originalInvoke(name, options);
    }
  }
  return originalInvoke(name, options);
};
