import * as github from '@actions/github';
import type { GitHub } from '@actions/github/lib/utils.js';

export class GitHubClient {
  private octokit: InstanceType<typeof GitHub>;

  constructor(
    token: string,
    private owner: string,
    private repo: string,
  ) {
    this.octokit = github.getOctokit(token);
  }

  async getTags(options?: {
    contains?: string | null;
    stopFetchingOnFirstMatch?: boolean;
  }): Promise<TagInfo[]> {
    const tags: TagInfo[] = [];

    const fetchTags = async (page: number) => {
      return await this.octokit.rest.repos.listTags({
        owner: this.owner,
        repo: this.repo,
        per_page: 100,
        page,
      });
    };

    let page = 1;
    let res = await fetchTags(page);

    while (res.data.length > 0) {
      tags.push(...res.data);

      if (
        options?.stopFetchingOnFirstMatch &&
        options?.contains &&
        res.data.find(t => t.name.includes(options?.contains || ''))
      ) {
        break;
      }

      page++;
      res = await fetchTags(page);
    }

    const filteredTags = tags.filter(t => {
      if (options?.contains) {
        return t.name.includes(options.contains);
      }

      return true;
    });

    console.log(filteredTags.map(t => t.name).join(', '));

    return filteredTags;
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
