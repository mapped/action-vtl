import * as github from '@actions/github';
import {SEMVER_REGEX, type Version, compareSemvers} from './version.js';
import type {components} from '@octokit/openapi-types';
import type {Context} from '@actions/github/lib/context.js';
import type {KnownPayload} from './oci.js';

type ReposListReleasesResponseData = components['schemas']['release'];
// NOTE: This works for the above as well, but following the post refactor chaos of
//       https://github.com/octokit/types.ts/issues/267 seems to indicate components['schemas'] is better
//       import {Endpoints} from '@octokit/types';
//       type ReposListReleasesResponseData = Endpoints['GET /repos/{owner}/{repo}/releases']['response'];

export interface DockerInfo {
  dtag: string;
  tags: string;
  push: string;
}

export async function GetDockerInfo(
  dockerImage: string,
  version: Version,
  dockerPlatformSuffix: string,
  context: Context,
  token: string | null,
): Promise<DockerInfo> {
  // If we have repo info and a token, get releases first
  const payload = context.payload as KnownPayload;
  let releases: ReposListReleasesResponseData[] | null = null;
  if (payload && token) {
    const octoKit = github.getOctokit(token);
    const response = await octoKit.rest.repos.listReleases({
      owner: context.repo.owner, // payload.repository.owner.name ?? '',
      repo: context.repo.repo, //payload.repository.name,
    });
    if (!Array.isArray(response)) {
      releases = [];
    } else {
      releases = response;
    }
  }

  const tags = new Array<string>();
  let shouldPush = true;

  // Add the `-` separator to dockerPlatformSuffix
  if (dockerPlatformSuffix.length > 0) {
    dockerPlatformSuffix = `-${dockerPlatformSuffix}`;
  }

  // Get a deterministic tag
  let dtag = '';

  // Add the version tag if it is not latest
  if (version.tag !== 'latest') {
    // Without any 'v' prefix
    let tag = '';
    if (SEMVER_REGEX.test(version.tag) && version.tag.substring(0, 1).toLowerCase() === 'v') {
      tag = `${dockerImage}:${version.tag.substring(1)}${dockerPlatformSuffix}`;
    } else {
      tag = `${dockerImage}:${version.tag}${dockerPlatformSuffix}`;
    }
    tags.push(tag);
    dtag = tag;
  }

  // For any push we add a sha tag
  if (context.eventName === 'push') {
    const tag = `${dockerImage}:sha-${context.sha.substring(0, 8)}${dockerPlatformSuffix}`;
    tags.push(tag);

    // SHA based is always the most deterministic, so overwrite the semver dtag from above
    dtag = tag;
  }

  // If the version's tag is a SEMVER, we need semver stable tags
  const semVerParts = version.tag.match(SEMVER_REGEX);
  if (semVerParts) {
    // Is this a pre-release?
    if (version.preRelease && version.preRelease.length > 0) {
      // Pre-release, only the full semver
      const tag = `${dockerImage}:${version.semVerNoMeta}${dockerPlatformSuffix}`;
      tags.push(tag);
      // If we don't already have a dtag, use this
      if (!dtag) {
        dtag = tag;
      }
    } else {
      // Not a pre-release, get all stable tags
      tags.push(`${dockerImage}:${version.major}${dockerPlatformSuffix}`);
      tags.push(`${dockerImage}:${version.major}.${version.minor}${dockerPlatformSuffix}`);

      const fulltag = `${dockerImage}:${version.major}.${version.minor}.${version.patch}${dockerPlatformSuffix}`;
      tags.push(fulltag);

      // If we don't already have a dtag, use this
      if (!dtag) {
        dtag = fulltag;
      }

      // Tagged build gets the 'latest' tag if it is the highest semver tag created
      if (releases) {
        // Look through all the releases for a newer tag
        let newest = true;
        for (const release of releases) {
          // Skip pre-releases
          if (release.prerelease) {
            continue;
          }

          if (compareSemvers(version.tag, release.tag_name) < 0) {
            // Found a newer tag that already existed
            newest = false;
            break;
          }
        }

        // If we didn't find a newer tag, add latest
        if (newest) {
          tags.push(`${dockerImage}:latest${dockerPlatformSuffix}`);
        }
      }
    }
  }

  // PRs don't get pushed
  if (context.eventName === 'pull_request') {
    shouldPush = false;
  }

  // Remove duplicates tags
  const uniqueTags = [...new Set(tags)];

  // Put together the output
  const dockerInfo: DockerInfo = {
    dtag,
    tags: uniqueTags.join(','),
    push: shouldPush.toString(),
  };

  return dockerInfo;
}
