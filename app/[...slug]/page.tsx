import LegacyStorefront from "../legacy-storefront";
import { redirect } from "next/navigation";

type StorefrontRouteProps = {
  params: Promise<{ slug: string[] }>;
};

export default async function StorefrontRoute({ params }: StorefrontRouteProps) {
  const { slug } = await params;
  const pathname = `/${slug.join("/")}`;

  if (pathname === "/xxx" || pathname === "/xxx/") {
    redirect("/admin");
  }

  if (pathname === "/xxx/login") {
    redirect("/admin");
  }

  return <LegacyStorefront />;
}
