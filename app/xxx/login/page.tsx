import LoginForm from "./login-form";

export default function AdminLoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#09090b",
        color: "#fff",
        display: "grid",
        placeItems: "center",
        padding: 20,
        fontFamily: "system-ui, Segoe UI, Arial, sans-serif",
      }}
    >
      <LoginForm />
    </div>
  );
}
