// An asset's description (family SITE-TYPE-CONTRACT draft 12, owner 2026-11-03): a small JSON file beside the asset, its
// path plus `.about.json` ("assets/gases/barometer.png.about.json"), holding Alembic's title, what it shows (its alt
// text), subject, topic, source, credit and licence. It moves, is copied and is deleted with its asset. To Coursewerk it
// is no asset of its own: it needs no provenance record and no visual review (req.records.asset-description).
export const ASSET_DESCRIPTION_SUFFIX = ".about.json";
/** Is a path (package-relative or relative to assets/) an asset's description? */
export const isAssetDescription = (rel) => {
  const r = String(rel || "").replace(/\\/g, "/");
  return r.endsWith(ASSET_DESCRIPTION_SUFFIX) && r.length > ASSET_DESCRIPTION_SUFFIX.length && !r.endsWith(`/${ASSET_DESCRIPTION_SUFFIX}`);
};
