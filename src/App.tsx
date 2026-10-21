import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { UNTAGGED_SERVICES } from "./untagged_services";
import React, { useEffect, useState } from "react";
import { formatRFC7231, formatDistanceToNowStrict } from "date-fns";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckboxItem,
  DropdownMenuRadioItem,
  ItemIndicator,
} from "@radix-ui/react-dropdown-menu";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { CheckIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PAGE_SIZE = 20;

// 7 days
const STALE_AGE_MILLIS = 1000 * 3600 * 24 * 7;

const REF_PARAM = "ref";
const SERVICE_PARAM = "service";
const STANDALONE_PACKAGE_SERVICES = new Set(["convex-py", "convex-rs"]);
// Versioned by bare commit SHA, without a `<service>/<version>` git tag.
const SHA_VERSIONED_SERVICES = new Set(["dashboard", "docs"]);

function readRefFromUrl(): string {
  return new URLSearchParams(window.location.search).get(REF_PARAM) ?? "";
}

function writeRefToUrl(ref: string) {
  const url = new URL(window.location.href);
  if (ref.trim()) {
    url.searchParams.set(REF_PARAM, ref.trim());
  } else {
    url.searchParams.delete(REF_PARAM);
  }
  if (url.toString() !== window.location.href) {
    window.history.replaceState(null, "", url);
  }
}

function readServiceFromUrl(): string {
  return (
    new URLSearchParams(window.location.search).get(SERVICE_PARAM) || "all"
  );
}

function writeServiceToUrl(service: string) {
  const url = new URL(window.location.href);
  if (service === "all") {
    url.searchParams.delete(SERVICE_PARAM);
  } else {
    url.searchParams.set(SERVICE_PARAM, service);
  }
  if (url.toString() !== window.location.href) {
    window.history.pushState(null, "", url);
  }
}

function PushTime({ d }: { d: Date }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className="text-left">{d.toLocaleString()}</div>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <p>{formatRFC7231(d)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function isStale(d: Date): boolean {
  return Date.now() - d.valueOf() >= STALE_AGE_MILLIS;
}

function gitRefFor(service: string, version: string): string {
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

function gitRepositoryFor(service: string): string {
  return STANDALONE_PACKAGE_SERVICES.has(service) ? service : "convex";
}

const PUSH_INSTRUCTIONS_PATHS: Record<string, string | null> = {
  "convex-js": "npm",
  "convex-py": "open-source",
  "convex-rs": "open-source",
  "db-cluster-migration": "db-clusters/migration",
  "auth-emails": null,
  "convex-tools": null,
  data: null,
  "fastlane-offramp": null,
  "fastlane-onramp": null,
  "grafana-mcp": null,
  postalservice: null,
  "service-index": null,
};

function pushInstructionsUrlFor(service: string): string | null {
  const path =
    service in PUSH_INSTRUCTIONS_PATHS
      ? PUSH_INSTRUCTIONS_PATHS[service]
      : service;
  return path === null ? null : `https://go.cvx.is/push/${path}`;
}

function Ago({ d }: { d: Date }) {
  return (
    <div className="ago">
      <span>{formatDistanceToNowStrict(d)} ago</span>
      {isStale(d) && "🥱"}
    </div>
  );
}

function ReleaseTagBadge({ tag }: { tag: string }) {
  const colorClasses: Record<string, string> = {
    default: "bg-blue-100 text-blue-800",
    biz: "bg-green-100 text-green-800",
  };
  const classes = colorClasses[tag] ?? "bg-gray-100 text-gray-800";

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {tag}
    </span>
  );
}

function Row({
  message,
  gitShaToCheck,
}: {
  message: {
    _id: Id<"version_history">;
    version: string;
    url: string;
    service: string;
    release_tag: string;
    pushDate: number;
    _creationTime: number;
    is_stable: boolean;
  };
  gitShaToCheck: string;
}) {
  const compareCommits = useAction(api.github.compareCommits);
  const markReleaseStability = useMutation(
    api.version_history.markReleaseStability,
  );
  const prevDoc = useQuery(api.version_history.prevRev, {
    service: message.service,
    release_tag: message.release_tag,
    _creationTime: message._creationTime,
  });
  const [comparison, setComparison] = useState("");

  const d = new Date(message.pushDate);

  const service = message.service;
  const version = message.version;
  const base =
    service === "convex-js" || STANDALONE_PACKAGE_SERVICES.has(service)
      ? gitRefFor(service, version)
      : version.split("-").pop()!;
  const gitRepository = gitRepositoryFor(service);
  const pushInstructionsUrl = pushInstructionsUrlFor(service);

  const prev = prevDoc?.version || "";

  useEffect(() => {
    const fetchData = async () => {
      setComparison("");
      if (!gitShaToCheck || STANDALONE_PACKAGE_SERVICES.has(service)) {
        return;
      }
      const comparison = await compareCommits({
        head: gitShaToCheck,
        base,
        service,
      });

      const getComparisonEmoji = () => {
        switch (comparison) {
          case "behind":
          case "identical":
            return "✅"; // Green check mark
          case "ahead":
            return "❌"; // Red X
          case "diverged":
          default:
            return "❓"; // Question mark
        }
      };

      setComparison(getComparisonEmoji());
    };
    void fetchData();
  }, [compareCommits, gitShaToCheck, base, service]);

  return (
    <div className="flex gap-2 items-center">
      <div className="w-[10%]">{comparison}</div>
      <div className="flex flex-col w-[35%]">
        <span>
          <a
            className="underline text-blue-800 visited:text-purple-800"
            href={message.url}
          >
            {message.version}
          </a>
        </span>
        <span>
          <a
            className="underline text-primary text-xs"
            href={`https://github.com/convex/${gitRepository}/compare/${gitRefFor(service, prev)}...convex:${gitRepository}:${gitRefFor(service, version)}`}
          >
            diff previous
          </a>{" "}
          <a
            className="underline text-primary text-xs"
            href={`https://github.com/convex/${gitRepository}/compare/${gitRefFor(service, version)}...main`}
          >
            diff main
          </a>
        </span>
      </div>
      <div className="w-[10%]">
        <ReleaseTagBadge tag={message.release_tag} />
      </div>
      <div className="w-[15%]">
        {pushInstructionsUrl ? (
          <a
            className="underline text-blue-800 visited:text-purple-800"
            href={pushInstructionsUrl}
            target="_blank"
            rel="noreferrer"
          >
            {service}
          </a>
        ) : (
          service
        )}
      </div>
      <div className="w-[20%] flex flex-col">
        <PushTime d={new Date(message.pushDate)} />
        <Ago d={d} />
      </div>
      <div className="w-[10%] flex items-center justify-center">
        <input
          type="checkbox"
          checked={message.is_stable}
          onChange={(e) =>
            markReleaseStability({
              service: message.service,
              version: message.version,
              is_stable: e.target.checked,
            })
          }
          title={message.is_stable ? "Stable" : "Unstable"}
        />
      </div>
    </div>
  );
}

function Rows() {
  const [value, setValue] = useState(readServiceFromUrl);
  const [latestOnly, setLatestOnly] = useState(true);
  const displayLatestOnly = latestOnly && value === "all";
  const [gitShaToCheck, setGitShaToCheck] = useState(readRefFromUrl);
  const resolveRef = useAction(api.github.resolveRef);
  const [resolved, setResolved] = useState<{
    sha: string;
    title: string;
    authorName: string;
    authorAvatarUrl: string | null;
    authorProfileUrl: string | null;
    htmlUrl: string;
    prNumber: number | null;
  } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => writeRefToUrl(gitShaToCheck), 300);
    return () => clearTimeout(t);
  }, [gitShaToCheck]);
  useEffect(() => {
    const onPopState = () => {
      setGitShaToCheck(readRefFromUrl());
      setValue(readServiceFromUrl());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    const input = gitShaToCheck.trim();
    setResolved(null);
    setResolveError(null);
    if (!input) {
      setResolving(false);
      return;
    }
    setResolving(true);
    let cancelled = false;
    const t = setTimeout(() => {
      void resolveRef({ input }).then((res) => {
        if (cancelled) return;
        setResolving(false);
        if (res.kind === "ok") {
          setResolved(res);
          setResolveError(null);
        } else {
          setResolved(null);
          setResolveError(res.message);
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [gitShaToCheck, resolveRef]);
  const effectiveSha = resolved?.sha ?? "";
  const serviceToLastPushed = useQuery(api.version_history.services) || [];
  const {
    results: messages,
    status: messagesStatus,
    loadMore,
  } = usePaginatedQuery(
    api.version_history.list,
    { service: value === "all" ? undefined : value },
    { initialNumItems: PAGE_SIZE },
  );
  const latestPushes = useQuery(api.version_history.listLatest) || [];
  const pushes = displayLatestOnly ? latestPushes : messages;

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    setGitShaToCheck(event.target.value);
  };

  const anyStale = Object.entries(serviceToLastPushed).some(
    ([service, lastPushed]) =>
      (value === "all" || service === value) && isStale(new Date(lastPushed)),
  );

  return (
    <div className="max-w-[1600px] w-full">
      <div className="flex ml-4 gap-4 p-4 flex-grow-0 flex-shrink items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              {value === "all" ? "All services" : value}
              {anyStale && "🥱"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              className="w-96"
              value={value}
              onValueChange={(service) => {
                setValue(service);
                writeServiceToUrl(service);
              }}
            >
              <DropdownMenuRadioItem
                className="flex items-center justify-between px-2 cursor-pointer border-2 border-transparent hover:border-primary hover:border-solid"
                value={"all"}
              >
                <span className="w-5 flex-shrink-0">
                  <ItemIndicator>
                    <CheckIcon />
                  </ItemIndicator>
                </span>
                <span className="flex-grow">All services</span>
              </DropdownMenuRadioItem>
              {Object.entries(serviceToLastPushed).map(
                ([service, lastPushed]) => (
                  <DropdownMenuRadioItem
                    key={service}
                    value={service}
                    className="flex items-center justify-between px-2 cursor-pointer border-2 border-transparent hover:border-primary hover:border-solid"
                  >
                    <span className="w-5 flex-shrink-0">
                      <ItemIndicator>
                        <CheckIcon />
                      </ItemIndicator>
                    </span>
                    <span className="flex-grow">{service}</span>
                    <span className="mx-2">
                      <Ago d={new Date(lastPushed)} />
                    </span>
                  </DropdownMenuRadioItem>
                ),
              )}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {value === "all" && (
          <div>
            <Input
              type="checkbox"
              checked={latestOnly}
              onChange={(e) => setLatestOnly(e.target.checked)}
            />
            Latest only
          </div>
        )}
        <Input
          className={`max-w-56 ${resolveError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
          onChange={handleInputChange}
          value={gitShaToCheck}
          placeholder="Paste git SHA or PR #/URL"
        />
        {resolveError && (
          <p className="text-sm text-red-600">{resolveError}</p>
        )}
        {resolving && (
          <div className="flex items-center gap-2 text-sm min-w-0 animate-pulse">
            <span className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0" />
            <span className="h-3 w-20 rounded bg-gray-200 flex-shrink-0" />
            <span className="h-3 w-64 rounded bg-gray-200" />
          </div>
        )}
        {!resolving && resolved && (() => {
          const trailingPr = resolved.title.match(/^(.*?)\s*\(#(\d+)\)\s*$/);
          const titleWithoutTag = trailingPr ? trailingPr[1] : resolved.title;
          const linkedPrNumber = resolved.prNumber ?? (trailingPr ? Number(trailingPr[2]) : null);
          return (
            <div className="flex items-center gap-2 text-sm min-w-0">
              {resolved.authorProfileUrl ? (
                <a
                  href={resolved.authorProfileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 flex-shrink-0 group"
                >
                  {resolved.authorAvatarUrl && (
                    <img
                      src={resolved.authorAvatarUrl}
                      alt={resolved.authorName}
                      className="w-5 h-5 rounded-full"
                    />
                  )}
                  <span className="font-medium group-hover:underline">
                    {resolved.authorName}
                  </span>
                </a>
              ) : (
                <span className="font-medium flex-shrink-0">
                  {resolved.authorName}
                </span>
              )}
              <span className="text-gray-600 truncate">
                <a
                  href={resolved.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {titleWithoutTag}
                </a>
                {linkedPrNumber && (
                  <>
                    {" "}
                    (
                    <a
                      href={`https://github.com/convex/convex/pull/${linkedPrNumber}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      #{linkedPrNumber}
                    </a>
                    )
                  </>
                )}
              </span>
            </div>
          );
        })()}
      </div>
      {gitShaToCheck && !resolveError && (
        <>
          <div>✅ - It's out!</div>
          <div>❌ - It's not out!</div>
          <div>❓ - Not sure.. it diverged</div>
        </>
      )}
      <div>🥱 - It's been over a week</div>
      <div className="flex flex-col p-4 divide-y gap-2">
        <div className="flex gap-2 items-center font-bold text-sm text-gray-600 pb-2">
          <div className="w-[10%]">Status</div>
          <div className="w-[35%]">Version</div>
          <div className="w-[10%]">Tag</div>
          <div className="w-[15%]">Service</div>
          <div className="w-[20%]">Pushed</div>
          <div className="w-[10%] flex items-center justify-center gap-1">
            <span>Stable</span>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoCircledIcon className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Versions default to stable and can be manually marked as
                    unstable if there is a bug.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        {pushes.map((message) => (
          <Row
            key={JSON.stringify(message)}
            message={message}
            gitShaToCheck={effectiveSha}
          />
        ))}
        {!displayLatestOnly &&
          (messagesStatus === "CanLoadMore" ||
            messagesStatus === "LoadingMore") && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                disabled={messagesStatus === "LoadingMore"}
                onClick={() => loadMore(PAGE_SIZE)}
              >
                {messagesStatus === "LoadingMore" ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
      </div>
    </div>
  );
}

export default function App() {
  const lastSync = useQuery(api.last_sync.get);
  const lastSyncTime = lastSync
    ? new Date(lastSync.time * 1000).toLocaleString()
    : "unknown";
  const scream = lastSync && Date.now() - lastSync.time * 1000 >= 5 * 60 * 1000;

  return (
    <main className="flex flex-col h-[100vh] w-[100vw] p-4 gap-2 justify-start items-center">
      <h1 className="text-4xl font-extrabold text-center">isitout</h1>
      <div className="flex flex-col mx-auto gap-2">
        <p className="bg-primary text-primary-foreground p-2 rounded text-center">
          <span>Last sync: {lastSyncTime} </span>
          <br />
          <span>{scream ? "😱😱😱Sync seems broken😱😱😱" : ""}</span>
        </p>
        <p className="note">
          All times are local, hover over timestamp for UTC.
        </p>
      </div>
      <Rows />
      <div>
        <a
          href="https://github.com/convex/isitout"
          className="underline text-blue-800 visited:text-purple-800"
        >
          https://github.com/convex/isitout
        </a>
      </div>
    </main>
  );
}
