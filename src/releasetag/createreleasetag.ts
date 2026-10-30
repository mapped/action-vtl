import * as core from '@actions/core';
import {GitHubClient} from './githubclient.js';
import {ReleaseTagVersion} from './releasetagversion.js';
import type {ScopeRules} from './scopes.js';
import type {context} from '@actions/github';

type Context = typeof context;

export class CreateReleaseResult {
  constructor(
    // Not null if push was made in releases branch (usually main) or if someone decided to rerun the latest build. Otherwise set to null.
    public createdReleaseTag: ReleaseTagVersion | null,

    // Represents previous version. Or the latest version if release was not created. Or initial version if there are no any valid releases yet.
    public previousReleaseTag: ReleaseTagVersion,

    // Previous version commit sha. Null if previous version was not created yet (only in case when there are no valid release tags in repo).
    public previousReleaseTagCommitSha: string | null,
  ) {}

  isPrerelease(): boolean {
    return this.createdReleaseTag === null;
  }

  getBaseVersionOverride(): string {
    return (this.createdReleaseTag ?? this.previousReleaseTag).toString();
  }
}

export async function CreateReleaseTag(
  context: Context,
  token: string | null,
  releasesBranch: string,
  baseVersionStr: string | null,
  forcePatchIncrementIfNoChanges: boolean,
  tagPrefix = '',
  // With scope lists, a `feat` whose scopes are all tooling bumps the patch version only.
  scopeRules: ScopeRules | null = null,
): Promise<CreateReleaseResult> {
  const baseVersion = ReleaseTagVersion.parse(baseVersionStr);
  if (baseVersion === null) {
    throw Error(`Failed to parse base version '${baseVersionStr}'`);
  }

  const res = new CreateReleaseResult(null, baseVersion, null);

  if (!token) {
    core.info('GitHub token is missing. Skipping release creation...');
    return res;
  }

  const gitHubClient = new GitHubClient(token, context.repo.owner, context.repo.repo);
  const tags = await gitHubClient.getTags({contains: tagPrefix, stopFetchingOnFirstMatch: true});
  const commits = await gitHubClient.getCommits({
    startFromSha: context.sha,
    stopAtSha: tags?.[0]?.commit?.sha,
  });

  // Find the previous tag
  for (const tag of tags) {
    const tagName = tag.name.replace(tagPrefix, '');
    const ver = ReleaseTagVersion.parse(tagName);

    // Skip releases with invalid format
    if (ver === null) {
      continue;
    }

    // Skip releases that are not related to the current commit.
    // For example this build may run inside of a separate branch that is behind main branch.
    // Or this build may be a rerun of some failed build several commit earlier in main branch.
    if (!commits.find(x => x.sha === tag.commit.sha)) {
      continue;
    }

    if (ver.isGreaterOrEqualTo(res.previousReleaseTag)) {
      res.previousReleaseTag = ver;
      res.previousReleaseTagCommitSha = tag.commit.sha;
    }
  }

  // Do not create release if developer intentionally switched this feature off
  if (!releasesBranch) {
    return res;
  }

  const branchRegExp = new RegExp(`refs/heads/${releasesBranch}`);

  // Tagging is allowed only for one selected branch (usually main branch)
  if (!branchRegExp.test(context.ref)) {
    return res;
  }

  res.createdReleaseTag = ReleaseTagVersion.parse(res.previousReleaseTag.toString());
  if (res.createdReleaseTag == null) {
    throw Error(`Failed to clone previous version '${res.previousReleaseTag.toString()}'`);
  }

  let releaseComments = '';

  // Do not increment version if there is no any valid release tag yet.
  if (res.previousReleaseTagCommitSha !== null) {
    let incrementMajor = false;
    let incrementMinor = false;
    let incrementPatch = false;
    let reachedLatestReleaseCommit = false;
    let pullRequestTitlesAvailable = true;
    const semanticCommitRegExp = /([a-z][a-z0-9_-]*)(\([^)]*\))?(!)?:\s?(.*)/i;
    const squashedCommitRegExp = /^\s*(?:[*-]\s+)?([a-z][a-z0-9_-]*)(\([^)]*\))?(!)?:\s?(.*)/i;

    // Choose the most significant change among all commits since previous release
    for (const commit of commits) {
      if (commit.sha === res.previousReleaseTagCommitSha) {
        reachedLatestReleaseCommit = true;
        break;
      }

      const message = commit.commit.message;

      if (message) {
        releaseComments += `\n${message}`;
      }

      let prTitles: string[] = [];
      if (pullRequestTitlesAvailable) {
        try {
          prTitles = await gitHubClient.getPullRequestTitles(commit.sha);
          /* eslint-disable @typescript-eslint/no-explicit-any */
        } catch (error: any) {
          /* eslint-enable @typescript-eslint/no-explicit-any */
          if (error?.status !== 403 && error?.status !== 404) {
            throw error;
          }
          pullRequestTitlesAvailable = false;
          core.warning(
            `Cannot read pull requests associated with commits (${error.message}). ` +
              "Falling back to commit messages only. Grant 'pull-requests: read' to the workflow to also consider PR titles.",
          );
        }
      }

      const messages = [message, ...prTitles];
      for (const semanticMessage of messages) {
        const matches = semanticCommitRegExp.exec(semanticMessage);

        if (matches === null) {
          // Always increment patch if developer does not write messages in "semantic commits" manner (https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716)
          incrementPatch = true;
          continue;
        }

        // Breaking change rules described here https://www.conventionalcommits.org/en/v1.0.0/
        const breakingChangeSign = matches[3];
        if (breakingChangeSign || semanticMessage.includes('BREAKING CHANGE:')) {
          incrementMajor = true;
          continue;
        }

        const commitType = matches[1].toLowerCase();
        if (commitType === 'feat' && !scopeRules?.isToolingOnly(matches[2])) {
          incrementMinor = true;
          continue;
        }

        incrementPatch = true;
      }

      // Squash merges list the squashed commits in the body (e.g. "* feat: ..."), so a
      // `fix:` PR title must not hide a `feat:` or breaking commit that was squashed into it.
      // As in git, the body starts after the first blank line; earlier lines belong to the subject.
      const bodyStart = (message ?? '').search(/\r?\n\s*\r?\n/);
      const body = bodyStart === -1 ? '' : message.slice(bodyStart);
      for (const line of body.split(/\r?\n/)) {
        const matches = squashedCommitRegExp.exec(line);
        if (matches === null) {
          continue;
        }

        if (matches[3]) {
          incrementMajor = true;
        } else if (matches[1].toLowerCase() === 'feat' && !scopeRules?.isToolingOnly(matches[2])) {
          incrementMinor = true;
        }
      }
    }

    if (!reachedLatestReleaseCommit) {
      throw Error(
        `Failed to reach the latest release tag '${res.previousReleaseTag.toString()}' (${
          res.previousReleaseTagCommitSha
        }) inside of the '${releasesBranch}' branch.`,
      );
    }

    if (incrementMajor) {
      res.createdReleaseTag.incrementMajor();
    } else if (incrementMinor) {
      res.createdReleaseTag.incrementMinor();
    } else if (incrementPatch || forcePatchIncrementIfNoChanges) {
      res.createdReleaseTag.incrementPatch();
    } else {
      core.info(
        'Did not find any new commit since the latest release tag. Seems that release is already created.',
      );
      return res;
    }
  }

  const nextTagName = tagPrefix + res.createdReleaseTag.toString();
  core.info(`Creating a tag '${nextTagName}'...`);

  try {
    await gitHubClient.createTag(nextTagName, releaseComments, context.sha);
    /* eslint-disable @typescript-eslint/no-explicit-any */
  } catch (error: any) {
    if (error && error.message && error.message.includes('Reference already exists')) {
      // We should ignore this error and continue.
      // It happens when several parallel jobs try to create the same release tag.
      core.warning(
        `GitHub API says that tag '${nextTagName}' already exists. Ignoring this error...`,
      );
    } else {
      throw new Error(`Failed to create a tag ${nextTagName}: ${JSON.stringify(error)}`);
    }
  }

  core.info(`Created a tag '${nextTagName}'`);

  return res;
}
