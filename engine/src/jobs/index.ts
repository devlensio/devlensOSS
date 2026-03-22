import { InMemoryQueue } from "./queue/memory";
import { JobQueue }      from "./queue/interface";


function createQueue(): JobQueue {
  return new InMemoryQueue();
}

// Singleton Queue
//
// One queue instance for the entire server process.
// All handlers import this — never instantiate their own queue.
// This is what ensures job deduplication works across requests.

export const queue: JobQueue = createQueue();



export type { JobQueue }                                    from "./queue/interface";
export type { Job, JobSummary, JobStatus, JobPhase,
              ProgressEvent, JobInput }                     from "./types";
export { isTerminal, isResumable, toJobSummary }           from "./types";