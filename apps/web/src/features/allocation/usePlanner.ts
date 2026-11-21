import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AllocationRequest,
  AllocationStrategy,
} from "@earthlab/contracts";
import type { PlanRun } from "./service";
import { planningAssets } from "./map";

export type Phase = AllocationRequest["phase"];
export const strategyNames = {
  independent: "Independent",
  coordinated: "Coordinated",
  bargaining: "Nash bargaining",
};
export const agencyNames = { health: "Health", shelter: "Shelter" };

export function usePlanner(active: boolean) {
  const [run, setRun] = useState<PlanRun | null>(null);
  const [draft, setDraft] = useState<AllocationRequest | null>(null);
  const [submission, setSubmission] = useState<{ request?: AllocationRequest }>(
    {},
  );
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [strategyId, setStrategyId] =
    useState<AllocationStrategy["id"]>("bargaining");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [atHour, setAtHour] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const previous = useRef<typeof submission | null>(null);
  useEffect(() => {
    if (!active || previous.current === submission) return;
    const abort = new AbortController();
    setPending(true);
    setNotice("");
    import("./service")
      .then(async ({ runPlan, example }) => {
        let value: PlanRun;
        try {
          value = await runPlan(submission.request, { signal: abort.signal });
        } catch (error) {
          if (abort.signal.aborted) return;
          value = example(submission.request?.phase ?? "mitigation");
          setNotice(
            error instanceof Error
              ? error.message
              : "The allocation service is unavailable.",
          );
        }
        if (!abort.signal.aborted) {
          setRun(value);
          setDraft(submission.request ?? value.request);
          setAtHour(null);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setNotice(
            "The planning module could not load. Reload the atlas to retry.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          previous.current = submission;
          setPending(false);
        }
      });
    return () => abort.abort();
  }, [active, submission]);
  const strategy = run?.result.strategies.find((s) => s.id === strategyId);
  const end = strategy?.completionHours ?? 0;
  const hour = atHour ?? end;
  useEffect(() => {
    if (!playing || !active || hour >= end) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () => setAtHour(Math.min(end, hour + 1)),
      800,
    );
    return () => window.clearTimeout(timer);
  }, [active, playing, end, hour]);
  const assets = useMemo(
    () => (run && strategy ? planningAssets(run, strategy, hour) : []),
    [run, strategy, hour],
  );
  const dirty = !!run && JSON.stringify(draft) !== JSON.stringify(run.request);
  function update(next: AllocationRequest) {
    setDraft(next);
    setRevision((v) => v + 1);
    setPlaying(false);
  }
  function compare(next = draft) {
    if (!next) return;
    update(next);
    setSubmission({ request: next });
  }
  function selectStrategy(id: AllocationStrategy["id"]) {
    setStrategyId(id);
    setAtHour(null);
    setPlaying(false);
  }
  function selectAsset(id: string | null) {
    setAssetId(id);
    setRevision((v) => v + 1);
  }
  function seek(value: number | null) {
    setPlaying(false);
    setAtHour(value);
  }
  function play() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (hour >= end) setAtHour(0);
    setPlaying(true);
  }
  return {
    run,
    draft,
    pending,
    notice,
    revision,
    assets,
    assetId,
    selectAsset,
    dirty,
    update,
    compare,
    strategy,
    selectStrategy,
    hour,
    end,
    seek,
    playing,
    play,
  };
}
export type Planner = ReturnType<typeof usePlanner>;
