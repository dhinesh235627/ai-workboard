// TypeScript auto-associates this with the sibling .js file of the same
// name — reuses the real published types from the root package, since
// @vladmandic/human's own stub for this build only re-exports named types,
// not the default export this project imports.
import Human from "@vladmandic/human"
export default Human
