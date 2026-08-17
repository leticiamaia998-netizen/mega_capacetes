import LegacyStorefront from "../legacy-storefront";
import { redirect } from "next/navigation";

type StorefrontRouteProps = {
  params: Promise<{ slug: string[] }>;
};

export default async function StorefrontRoute({ params }: StorefrontRouteProps) {
  const { slug } = await params;
  const pathname = `/${slug.join("/")}`;

  if (pathname === "/admin/login") {
    redirect("/xxx/login");
  }

  if (pathname === "/admin") {
    redirect("/xxx");
  }

  return <LegacyStorefront />;
}
