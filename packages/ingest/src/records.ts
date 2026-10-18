import type {
  Commit,
  CommitComment,
  CommitDetail,
  Issue,
  IssueComment,
  Pull,
  Review,
  ReviewComment,
} from "./github.js";
import type { CallEdge, FunctionNode } from "./parse.js";

export type IngestionRecords = {
  commits: Commit[];
  details: CommitDetail[];
  pulls: Pull[];
  pullCommits: Map<number, Commit[]>;
  reviews: Map<number, Review[]>;
  reviewComments: Map<number, ReviewComment[]>;
  issues: Issue[];
  issueComments: Map<number, IssueComment[]>;
  commitComments: Map<string, CommitComment[]>;
  functions: FunctionNode[];
  calls: CallEdge[];
  modifiedFunctions: {
    commit: string;
    fn: string;
    lines_changed: number;
    valid_from: string | null;
  }[];
};
