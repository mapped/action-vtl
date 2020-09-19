import {Context} from '@actions/github/lib/context';

const SEMVER_REGEX = /(?<=^v?|\sv?)(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[\da-z-]*[a-z-][\da-z-]*)(?:\.(?:0|[1-9]\d*|[\da-z-]*[a-z-][\da-z-]*))*))?(?:\+([\da-z-]+(?:\.[\da-z-]+)*))?(?=$|\s)/i;

export interface Version {
  tag: string;
  semVer: string;
  major: number;
  minor: number;
  patch: number;
  preRelease: string;
  build: string;
}

export async function SemVer(
  baseVer: string,
  branchMappings: Map<string, string>,
  preReleasePrefix: string,
  context: Context,
): Promise<Version> {
  return new Promise(resolve => {
    // Validate the base SEMVER
    const baseVerParts = baseVer.match(SEMVER_REGEX);
    if (baseVerParts == null || baseVerParts.length < 3) {
      throw new Error(`base-version of "${baseVer}" is not a valid SEMVER`);
    }

    // Get the pre-release prefix
    if (preReleasePrefix.length > 0) {
      preReleasePrefix += '.';
    }

    // Unless a tag changes it, the base ver is what we work from
    const ver: Version = {
      major: parseInt(baseVerParts[1] ?? '0', 10),
      minor: parseInt(baseVerParts[2] ?? '0', 10),
      patch: parseInt(baseVerParts[3] ?? '0', 10),
      preRelease: preReleasePrefix + context.runNumber.toString(),
      build: `${new Date().toISOString().replace(/[.:-]/g, '')}.${context.sha.substring(0, 8)}`,
      tag: '',
      semVer: '',
    };

    // Get the ref value, which is something like:
    //  - 'refs/pull/<prNumber>/merge'
    //  - 'refs/heads/<branchName>'
    //  - 'refs/tags/v1.2.3'

    // Split the ref by slashes and grab the last piece
    const refEnd = context.ref.split('/').pop() ?? '';

    // If the ref is a tag, validate it as a SEMVER
    ver.tag = refEnd;
    if (context.ref.startsWith('refs/tags')) {
      // Parse and validate the tag
      const tagParts = refEnd.match(SEMVER_REGEX);
      if (tagParts == null || tagParts.length === 0) {
        throw new Error(`Tag of "${refEnd}" is not a valid SEMVER`);
      }

      // Tag wins
      ver.major = parseInt(tagParts[1] ?? '0', 10);
      ver.minor = parseInt(tagParts[2] ?? '0', 10);
      ver.patch = parseInt(tagParts[3] ?? '0', 10);
      ver.preRelease = tagParts[4] ?? '';
    } else {
      // Handle any mappings
      if (branchMappings.has(refEnd.toLowerCase())) {
        const targetTag = branchMappings.get(refEnd.toLowerCase());
        if (targetTag == null) {
          throw new Error("Target tag existed and then it didn't");
        }
        ver.tag = targetTag;
      }
    }

    // Put the SEMVER back together
    ver.semVer = `${ver.major}.${ver.minor}.${ver.patch}`;
    if (ver.preRelease.length > 0) {
      ver.semVer += `-${ver.preRelease}`;
    }
    if (ver.build.length > 0) {
      ver.semVer += `+${ver.build}`;
    }

    // Done
    resolve(ver);
  });
}
