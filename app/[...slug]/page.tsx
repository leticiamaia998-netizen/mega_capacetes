import AdminEntryPage from "../admin/page";
import AdminPanelPage from "../admin/login/page";
import { StoreShell } from "../store-shell";
import { redirect } from "next/navigation";

type StorefrontRouteProps = {
  params: Promise<{ slug: string[] }>;
};

export default async function StorefrontRoute({ params }: StorefrontRouteProps) {
  const { slug } = await params;
  const pathname = `/${slug.join("/")}`;

  if (pathname === "/admin/login" || pathname === "/admin/login/") {
    redirect("/xxx");
  }

  if (pathname === "/xxx/login") {
    redirect("/admin");
  }

  if (pathname === "/admin" || pathname === "/admin/") {
    return <AdminEntryPage />;
  }

  if (pathname === "/admin/login") {
    return <AdminPanelPage />;
  }

  return <StoreShell />;
}
