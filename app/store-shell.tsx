const BOOT_VERSION = "37";

export function StoreShell() {
  return (
    <>
      <div id="root" />
      <script src={`/storefront-boot.js?v=${BOOT_VERSION}`} defer />
    </>
  );
}
