<p align="center">
  <a href="https://github.com/mapped/action-version/actions"><img alt="action-semver status" src="https://github.com/mapped/action-version/workflows/build-test/badge.svg"></a>
</p>

# GitHub Action for Consistent Versioning, Taging, and Labeleling of Builds

This GitHub Action creates consistent versioning, tagging, and labels for use in package/assembly versions and docker images.

## Version automatic increment

All versions are stored inside of tags. After every commit inside of the main branch (you may override it by `releasesBranch` parameter) version is incremented acconding to [conventional commit messages](https://www.conventionalcommits.org/en/v1.0.0/) and saved into a new tag. There are some quick examples:
| Commit | What happens to versioning |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `feat(#task123): allow users to edit their profile` | Increment **MINOR** version |
| `fix: remove memory leak inside of WebController` | Increment **PATCH** version |
| `feat(#task123)!: rewrite user JSON representation in API` | Add **MAJOR** version (by adding `!` sign) |
| `fix: Remove wrong user name\nBREAKING CHANGE: Changed user name format` | Increment **MAJOR** version (by adding `BREAKING CHANGE:` somewhere inside of commit message. Note that in must be in uppercase and contain `:` without any spaces in between) |
| `Rename user profile classes` | If you do NOT follow the [conventional commit messages](https://www.conventionalcommits.org/en/v1.0.0/) then it will increment **PATCH** |

**NOTE**: Tags are only created in `main` branch. So if you work in a separate branch it will NOT create any release until you merge the changes into `main`.

**NOTE**: If you want tags to be created on every build even if there is no any change detected from previous release then set `forcePatchIncrementIfNoChanges: true` parameter.

## Versioning

| Event          | Ref                           | Commit SHA | Base Ver | Run # | `${{ ver_semVer }}`                                    | `${{ ver_tag }}` |
| -------------- | ----------------------------- | ---------- | -------- | ----- | ------------------------------------------------------ | ---------------- |
| `schedule`     |                               |            | `1.2.3`  | `99`  | `1.2.3-prerelease.99+20200919T202359087Z`              | `nightly`        |
| `pull_request` | `refs/pull/2/merge`           | `a123b570` | `1.2.3`  | `99`  | `1.2.3-prerelease.99+20200919T202359087Z.sha-a123b570` | `pr-2`           |
| `push`         | `refs/heads/<default_branch>` | `676cae2a` | `1.2.3`  | `99`  | `1.2.3-prerelease.99+20200919T202359087Z.sha-676cae2a` | `edge`           |
| `push`         | `refs/heads/dev`              | `cf202579` | `1.2.3`  | `99`  | `1.2.3-prerelease.99+20200919T202359087Z.sha-cf202579` | `dev`            |
| `push`         | `refs/heads/my/branch`        | `a5df6872` | `1.2.3`  | `99`  | `1.2.3-prerelease.99+20200919T202359087Z.sha-a5df6872` | `my/branch`      |
| `push tag`     | `refs/tags/v1.2.3`            |            | `1.2.3`  | `99`  | `1.2.3+20200919T202359087Z.sha-a8cb3d0e`               | `v1.2.3`         |
| `push tag`     | `refs/tags/v1.2.3-alpha.1`    |            | `1.2.3`  | `99`  | `1.2.3-alpha.1+20200919T202359087Z.sha-a8cb3d0e`       | `v1.2.3-alpha.1` |

## Docker Tags

Borrowed logic from the [docker/build-push-action](https://github.com/docker/build-push-action/blob/master/README.md#complete-workflow) and [Docker Tagging: Best practices for tagging and versioning docker images](https://stevelasker.blog/2018/03/01/docker-tagging-best-practices-for-tagging-and-versioning-docker-images/) _(both of which are worth reading)_, this action also produces docker tags and a push flag that are for use in a subsequent Docker build or push.

| Event          | Ref                           | Commit SHA | `${{ docker_tag }}`           | `${{ docker_push }}` |
| -------------- | ----------------------------- | ---------- | ----------------------------- | -------------------- |
| `schedule`     |                               |            | `nightly`                     | true                 |
| `pull_request` | `refs/pull/2/merge`           | `a123b57`  | `pr-2`                        | false                |
| `push`         | `refs/heads/<default_branch>` | `676cae2`  | `sha-676cae2`, `edge`         | true                 |
| `push`         | `refs/heads/dev`              | `cf20257`  | `sha-cf20257`, `dev`          | true                 |
| `push`         | `refs/heads/my/branch`        | `a5df687`  | `sha-a5df687`, `my-branch`    | true                 |
| `push tag`     | `refs/tags/v1.2.3`            |            | `1.2.3`, `1.2`, `1`, `latest` | true                 |
| `push tag`     | `refs/tags/v1.2.3-alpha.1`    |            | `1.2.3-alpha.1`               | true                 |

**NOTE**: the `latest` docker tag is only added if the **release** repo tag is actually the highest SEMVER tag that exists for the repo. This ensures that a patch release of v1.2.3 will not steal the latest tag from v2.1.7. No `latest` docker tag is created for a pre-release repo tag.

## Open Container Image Format Labels

This action also produces [OCI Image Format Specification](https://github.com/opencontainers/image-spec/blob/master/annotations.md) labels for use in a subsequent Docker build or push. These labels are produced from repository information and generated version information to provide, as an example, for this repository this action produces:

```bash
steps.vtl.outputs.oci_title="action-vtl"
steps.vtl.outputs.oci_description="GitHub Action for establishing a consistent semver"
steps.vtl.outputs.oci_url="https://github.com/mapped/action-vtl"
steps.vtl.outputs.oci_source="https://github.com/mapped/action-vtl.git"
steps.vtl.outputs.oci_version="1.2.3-prerelease.21+20200919T205832346Z.sha-caed088d"
steps.vtl.outputs.oci_created="2020-09-19T20:58:32.346Z"
steps.vtl.outputs.oci_revision="caed088d0624b0dcb22cdf31b70ff0daff4c10d1"
steps.vtl.outputs.oci_licenses="MIT"
steps.vtl.outputs.oci_labels="org.opencontainers.image.title=action-vtl
                org.opencontainers.image.description=GitHub Action for establishing a consistent semver
                org.opencontainers.image.url=https://github.com/mapped/action-vtl
                org.opencontainers.image.source=https://github.com/mapped/action-vtl.git
                org.opencontainers.image.version=1.2.3-prerelease.21+20200919T205832346Z.sha-caed088d
                org.opencontainers.image.created=2020-09-19T20:58:32.346Z
                org.opencontainers.image.revision=caed088d0624b0dcb22cdf31b70ff0daff4c10d1
                org.opencontainers.image.licenses=MIT"
```

_(These outputs are not shown in the examples below for brevity)_

## Usage:

```yml
# For the latest version built in main branch
- uses: mapped/action-vtl@latest
  with:
    baseVersion: '1.2.3'

# For specific version (DEPRECATED, switched to latest branch. Use commit hash if you need to pin to a specific version)
- uses: mapped/action-vtl@v0.2.0
  with:
    baseVersion: '1.2.3'

# For testing the latest build from any branch
- uses: mapped/action-vtl@dev
  with:
    baseVersion: '1.2.3'
```

### Inputs

The following inputs can be passed to this action as `step.with` keys:

| Name                             | Type   | Description                                                                                                                     |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `baseVersion`                    | String | The base version of this repo. The first version of release. Applied if there is no any release yet. "v" prefix is optional.    |
| `dockerImage`                    | String | The name of the docker image to produce tags for. If omitted, no docker tags will be produced. (default ``)                     |
| `gitHubToken`                    | String | The GITHUB_TOKEN value. Required to produce latest tags. (default ``)                                                           |
| `branchMappings`                 | List   | Used for mapping untagged branches to tag names. Mappings are one per line, each as `branch:target_name`. (default `main:edge`) |
| `prereleasePrefix`               | String | The <pre-release> prefix on an untagged run. (default `prerelease`)                                                             |
| `versionFile`                    | String | A filename where the full SEMVER and commit SHA will be written. (default `VERSION`)                                            |
| `releasesBranch`                 | String | Branch where automatic releases should be created. Set to empty string to deactivate releases creation. (default `main`)        |
| `forcePatchIncrementIfNoChanges` | String | Forces to increment patch if no changes were made since the last release. (default ``)                                          |
| `dockerPlatformSuffix`           | String | Adds a suffix to the docker tag to identify the platform that can be referenced by a composit manifest. (default ``)            |

## Examples:

### 1. Release Tag Created

With the following input:

- Action run# 23
- Action YML:
  ```yml
  - uses: mapped/action-version
    id: vtl
    with:
      baseVersion: '1.2.3'
      dockerImage: 'owner/container-name'
      gitHubToken: ${{ secrets.GITHUB_TOKEN }}
      branchMappings: |
        main:latest
      prereleasePrefix: 'prerelease'
      versionFile: 'VERSION'
  ```
- Last commit in the tag: `a8cb3d0eae1f1a064896493f4cf63dafc17bafcf`
- `v1.3.5` **release tag is created**

This action will produce the following output variables:

```bash
steps.vtl.outputs.ver_major=1
steps.vtl.outputs.ver_minor=3
steps.vtl.outputs.ver_patch=5
steps.vtl.outputs.ver_preRelease=''
steps.vtl.outputs.ver_metadata='20200919T202359087Z.sha-a8cb3d0e'
steps.vtl.outputs.ver_buildNumber='23'
steps.vtl.outputs.ver_created='2020-09-19T20:23:59.087Z'
steps.vtl.outputs.ver_tag='v1.3.5'
steps.vtl.outputs.ver_semVer='1.3.5+20200919T202359087Z.sha-a8cb3d0e'
steps.vtl.outputs.ver_semVerNoMeta='1.3.5'

steps.vtl.outputs.docker_tags='owner/container-name:v1.3.5,owner/container-name:v1,owner/container-name:v1.3'
steps.vtl.outputs.docker_push='true'
```

and create a `VERSION` file with the contents:

```
1.3.5+20200919T202359087Z.sha-a8cb3d0e
```

_Note that the `20200918T041126920Z` portions are UTC datetime strings representing the time the action was run._

### 2a. Push to a Mapped Branch

With the following input:

- Action run# 23
- Action YML:
  ```yml
  - uses: mapped/action-version
    id: vtl
    with:
      baseVersion: '1.2.3'
      dockerImage: 'owner/container-name'
      gitHubToken: ${{ secrets.GITHUB_TOKEN }}
      branchMappings: |
        main:latest
      prereleasePrefix: 'prerelease'
      versionFile: 'VERSION'
  ```
- **Push to `main` branch** with a commit hash of `a8cb3d0eae1f1a064896493f4cf63dafc17bafcf`

This action will produce the following output variables:

```bash
steps.vtl.outputs.ver_major=1
steps.vtl.outputs.ver_minor=2
steps.vtl.outputs.ver_patch=3
steps.vtl.outputs.ver_preRelease='prerelease.23'
steps.vtl.outputs.ver_metadata='20200919T202219571Z.sha-a8cb3d0e'
steps.vtl.outputs.ver_buildNumber='23'
steps.vtl.outputs.ver_created='2020-09-19T20:22:19.571Z'
steps.vtl.outputs.ver_tag='edge'
steps.vtl.outputs.ver_semVer='1.2.3-prerelease.23+20200919T202219571Z.sha-a8cb3d0e'
steps.vtl.outputs.ver_semVerNoMeta='1.2.3-prerelease.23'

steps.vtl.outputs.docker_tags='owner/container-name:edge,owner/container-name:sha-a8cb3d0e'
steps.vtl.outputs.docker_push='true'
```

and create a `VERSION` file with the contents:

```
1.2.3-prerelease.23+20200918T041126920Z.a8cb3d0e
```

### 2b. Push to an Unmapped Branch

With the following input:

- Action run# 23
- Action YML:
  ```yml
  - uses: mapped/action-version
    id: vtl
    with:
      baseVersion: '1.2.3'
      dockerImage: 'owner/container-name'
      gitHubToken: ${{ secrets.GITHUB_TOKEN }}
      branchMappings: |
        main:latest
      prereleasePrefix: 'prerelease'
      versionFile: 'VERSION'
  ```
- **Push to `my-working-branch` branch** with a commit hash of `a8cb3d0eae1f1a064896493f4cf63dafc17bafcf`

This action will produce the following output variables:

```bash
steps.vtl.outputs.ver_major=1
steps.vtl.outputs.ver_minor=2
steps.vtl.outputs.ver_patch=3
steps.vtl.outputs.ver_preRelease='prerelease.23'
steps.vtl.outputs.ver_metadata='20200919T201859527Z.sha-a8cb3d0e'
steps.vtl.outputs.ver_buildNumber='23'
steps.vtl.outputs.ver_created='2020-09-19T20:18:59.527Z'
steps.vtl.outputs.ver_tag='my-working-branch'
steps.vtl.outputs.ver_semVer='1.2.3-prerelease.23+20200919T201859527Z.sha-a8cb3d0e'
steps.vtl.outputs.ver_semVerNoMeta='1.2.3-prerelease.23'

steps.vtl.outputs.docker_tags='owner/container-name:my-working-branch,owner/container-name:sha-a8cb3d0e'
steps.vtl.outputs.docker_push='true'
```

and create a `VERSION` file with the contents:

```
1.2.3-prerelease.23+20200918T041126920Z.a8cb3d0e
```

### 3. Pull Request

With the following input:

- Action run# 23
- Action YML:
  ```yml
  - uses: mapped/action-version
    id: vtl
    with:
      baseVersion: '1.2.3'
      dockerImage: 'owner/container-name'
      gitHubToken: ${{ secrets.GITHUB_TOKEN }}
      branchMappings: |
        main:latest
      prereleasePrefix: 'prerelease'
      versionFile: 'VERSION'
  ```
- **Pull Request** with a head commit hash of `a8cb3d0eae1f1a064896493f4cf63dafc17bafcf`

This action will produce the following output variables:

```yml
steps.vtl.outputs.ver_major=1
steps.vtl.outputs.ver_minor=2
steps.vtl.outputs.ver_patch=3
steps.vtl.outputs.ver_preRelease='prerelease.23'
steps.vtl.outputs.ver_metadata='20200919T201457882Z.sha-a8cb3d0e'
steps.vtl.outputs.ver_buildNumber='23'
steps.vtl.outputs.ver_created='2020-09-19T20:14:57.882Z'
steps.vtl.outputs.ver_tag='pr-37'
steps.vtl.outputs.ver_semVer='1.2.3-prerelease.17+20200919T201457882Z.sha-a8cb3d0e'
steps.vtl.outputs.ver_semVerNoMeta='1.2.3-prerelease.23'

steps.vtl.outputs.docker_tags='owner/container-name:pr-37'
steps.vtl.outputs.docker_push='false'
```

and create a `VERSION` file with the contents:

```
1.2.3-prerelease.23+20200918T041126920Z.a8cb3d0e
```

## Building / Testing / Contributing

1. Install the dependencies

   ```bash
   $ npm install
   ```

1. Build the package

   ```bash
   $ npm run all
   ```

1. Commit to the repo and it will automatically publish to `latest` (if you pushed to `main`) or `dev` (if you are outside of `main`) branch
