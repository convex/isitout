import { UNTAGGED_SERVICES } from "./untagged_services";

export const STANDALONE_PACKAGE_SERVICES = new Set(["convex-py", "convex-rs"]);
// Versioned by bare commit SHA, without a `<service>/<version>` git tag.
const SHA_VERSIONED_SERVICES = new Set(["dashboard", "docs"]);

export function gitRefFor(service: string, version: string): string {
  if (service === "convex-js") {
    return `npm/${version.split("-")[0]}`;
  }
  if (STANDALONE_PACKAGE_SERVICES.has(service)) {
    return `${service}/${version.split("-")[0]}`;
  }
  if (SHA_VERSIONED_SERVICES.has(service)) {
    return version;
  }
  if (UNTAGGED_SERVICES.has(service)) {
    return version.split("-").pop()!;
  }
  return `${service}/${version}`;
}

export function gitRepositoryFor(service: string): string {
  return STANDALONE_PACKAGE_SERVICES.has(service) ? service : "convex";
}

// The ref to pass as `base` to `github.compareCommits` for a pushed version.
export function comparisonBaseFor(service: string, version: string): string {
  return service === "convex-js" || STANDALONE_PACKAGE_SERVICES.has(service)
    ? gitRefFor(service, version)
    : version.split("-").pop()!;
}
