import { cached, octokit, pages } from "./github.js";
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

export function reviews(owner: string, name: string, number: number) {
  return pages(owner, name, `pull:${number}:reviews`, async (page) => {
    const response = await octokit.pulls.listReviews({
      owner,
      repo: name,
      pull_number: number,
      per_page: 100,
      page,
    });
    return response.data as Review[];
  });
}

export function reviewComments(owner: string, name: string, number: number) {
  return pages(owner, name, `pull:${number}:review-comments`, async (page) => {
    const response = await octokit.pulls.listReviewComments({
      owner,
      repo: name,
      pull_number: number,
      per_page: 100,
      page,
    });
    return response.data as ReviewComment[];
  });
}

export function pullCommits(owner: string, name: string, number: number) {
  return pages(owner, name, `pull:${number}:commits`, async (page) => {
    const response = await octokit.pulls.listCommits({
      owner,
      repo: name,
      pull_number: number,
      per_page: 100,
      page,
    });
    return response.data as Commit[];
  });
}

export function pullFiles(owner: string, name: string, number: number) {
  return pages(owner, name, `pull:${number}:files`, async (page) => {
    const response = await octokit.pulls.listFiles({
      owner,
      repo: name,
      pull_number: number,
      per_page: 100,
      page,
    });
    return response.data;
  });
}

export function issues(owner: string, name: string) {
  return pages<Issue & { pull_request?: { url: string } }>(
    owner,
    name,
    "issues:all",
    async (page) => {
      const response = await octokit.issues.listForRepo({
        owner,
        repo: name,
        state: "all",
        per_page: 100,
        page,
      });
      return response.data as (Issue & { pull_request?: { url: string } })[];
    },
  ).then((issues) => issues.filter((issue) => !issue.pull_request));
}

export function issueComments(owner: string, name: string, number: number) {
  return pages(owner, name, `issue:${number}:comments`, async (page) => {
    const response = await octokit.issues.listComments({
      owner,
      repo: name,
      issue_number: number,
      per_page: 100,
      page,
    });
    return response.data as IssueComment[];
  });
}

export function commitComments(owner: string, name: string, sha: string) {
  return pages(owner, name, `commit:${sha}:comments`, async (page) => {
    const response = await octokit.repos.listCommentsForCommit({
      owner,
      repo: name,
      commit_sha: sha,
      per_page: 100,
      page,
    });
    return response.data as CommitComment[];
  });
}

export function pullDetail(owner: string, name: string, number: number) {
  return cached(owner, name, `pull:${number}:detail`, async () => {
    const response = await octokit.pulls.get({
      owner,
      repo: name,
      pull_number: number,
    });
    return response.data as Pull;
  });
}

export function commitDetails(owner: string, name: string, sha: string) {
  return cached(owner, name, `commit:${sha}`, async () => {
    const response = await octokit.repos.getCommit({
      owner,
      repo: name,
      ref: sha,
    });
    return response.data as CommitDetail;
  });
}

export function commitPullRequests(owner: string, name: string, sha: string) {
  return cached(owner, name, `commit:${sha}:pull-requests`, async () => {
    const response = await octokit.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo: name,
      commit_sha: sha,
    });
    return response.data.map((pull) => pull.number);
  });
}

export function sourceAtCommit(
  owner: string,
  name: string,
  path: string,
  ref: string,
) {
  return cached(owner, name, `source:${ref}:${path}`, async () => {
    const response = await octokit.repos.getContent({
      owner,
      repo: name,
      path,
      ref,
    });
    return response.data;
  }).then((source) => {
    if (
      Array.isArray(source) ||
      source.type !== "file" ||
      !("content" in source)
    )
      throw new Error(
        `GitHub did not return text source for ${path} at ${ref}`,
      );
    if (source.encoding !== "base64" || !source.content)
      throw new Error(
        `GitHub did not return base64 text for ${path} at ${ref}`,
      );
    return Buffer.from(source.content, "base64").toString("utf8");
  });
}
