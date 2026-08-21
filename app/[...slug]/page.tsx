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

  if (pathname === "/xxx") {
    return (
      <>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{document.documentElement.style.background="#09090b";document.body.style.background="#09090b";document.body.style.color="#fff";if(!localStorage.getItem("mcAdminToken"))location.replace("/xxx/login");}catch(e){}})();`,
          }}
        />
        <LegacyStorefront />
      </>
    );
  }

  return <LegacyStorefront />;
}
