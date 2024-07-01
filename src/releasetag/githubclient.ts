import * as github from '@actions/github';
import * as core from '@actions/core';
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
    const tagResp = await this.octokit.rest.git.createTag({
      owner: this.owner,
      repo: this.repo,
      tag: tagName,
      message: comments,
      object: commitSha,
      type: 'commit',
    });

    core.info(`Tag response: ${JSON.stringify(tagResp)}`);

    if (tagResp.status < 200 || tagResp.status > 299) {
      throw Error(`Failed to create tag: ${tagResp.status} ${tagResp.data?.message}`);
    }

    const refResp = await this.octokit.rest.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/tags/${tagName}`,
      sha: commitSha,
    });

    core.info(`Ref response: ${JSON.stringify(refResp)}`);

    if (refResp.status < 200 || refResp.status > 299) {
      throw Error(`Failed to create tag reference. Github API returned code ${refResp.status}`);
    }
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
