import * as github from '@actions/github';
import type {GitHub} from '@actions/github/lib/utils.js';
import {ReleaseTagVersion} from './releasetagversion.js';

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
    let tags: TagInfo[] = [];

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

    tags = tags.filter(t => {
      if (options?.contains) {
        return t.name.includes(options.contains);
      }

      return true;
    });

    tags = tags.sort((a, b) => {
      const versionA = ReleaseTagVersion.parse(a.name.replace(options?.contains || '', ''));
      const versionB = ReleaseTagVersion.parse(b.name.replace(options?.contains || '', ''));

      if (versionA === null || versionB === null) {
        return 0;
      }

      return versionA.isGreaterOrEqualTo(versionB) ? 1 : -1;
    });

    console.log('Found tags:', tags.map(t => t.name).join(', '));

    return tags;
  }

  async getCommits(options: {startFromSha: string; stopAtSha?: string}): Promise<CommitInfo[]> {
    const commits: CommitInfo[] = [];

    console.log('Fetching commits until tag sha:', options.stopAtSha);

    const fetchCommits = async (page: number) => {
      return await this.octokit.rest.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        sha: options.startFromSha,
        page,
        per_page: 100,
      });
    };

    let page = 1;
    let res = await fetchCommits(page);

    while (res.data.length > 0) {
      commits.push(...res.data);

      if (options?.stopAtSha && res.data.find(c => c.sha === options.stopAtSha)) {
        console.log('Found commit', options.stopAtSha, '-- Commits fetching stopped.');
        break;
      }

      page++;
      res = await fetchCommits(page);
    }

    return commits;
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
