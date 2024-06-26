import * as github from '@actions/github';
import type {GitHub} from '@actions/github/lib/utils.js';

export class GitHubClient {
  private octokit: InstanceType<typeof GitHub>;

  constructor(
    token: string,
    private owner: string,
    private repo: string,
  ) {
    this.octokit = github.getOctokit(token);
  }

  async getTags(): Promise<TagInfo[]> {
    const res = await this.octokit.rest.repos.listTags({
      owner: this.owner,
      repo: this.repo,
      per_page: 100, // There might be some custom tags. Take the maximum amount of items to avoid searching for the valid latest release through several pages
    });

    return res.data;
  }

  async getCommits(startFromSha: string): Promise<CommitInfo[]> {
    const res = await this.octokit.rest.repos.listCommits({
      owner: this.owner,
      repo: this.repo,
      sha: startFromSha,
      per_page: 100, // Do not search for the latest release commit forever
    });

    return res.data;
  }

  async createTag(tagName: string, comments: string, commitSha: string): Promise<void> {
    await this.octokit.rest.git.createTag({
      owner: this.owner,
      repo: this.repo,
      tag: tagName,
      message: comments,
      object: commitSha,
      type: 'commit',
    });

    await this.octokit.rest.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/tags/${tagName}`,
      sha: commitSha,
    });
  }
}

export interface TagInfo {
  name: string;
  commit: {
    sha: string;
  };
}

export interface CommitInfo {
  sha: string;
  commit: {
    message: string;
  };
}
