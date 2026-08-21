export default function AdminShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#09090b",
        color: "#fff",
      }}
    >
      {children}
    </div>
  );
}
