export default function AdminPanelPage() {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html, body { background: #09090b !important; color: #fff !important; margin: 0; }
            #root { min-height: 100vh; background: #09090b; }
            #mc-admin-loading { min-height: 100vh; display: grid; place-items: center; background: #09090b; font-family: system-ui, Segoe UI, Arial, sans-serif; }
            #mc-admin-loading p { color: #a1a1aa; margin: 0; font-size: 14px; }
          `,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{if(!localStorage.getItem("mcAdminToken"))location.replace("/admin");}catch(e){location.replace("/admin");}})();`,
        }}
      />
      <div id="root">
        <main id="mc-admin-loading">
          <p>Carregando painel...</p>
        </main>
      </div>
      <script src="/admin-boot.js?v=23" defer />
    </>
  );
}
