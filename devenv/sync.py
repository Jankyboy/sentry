from __future__ import annotations

import importlib.metadata
import json
import os
import shlex
import shutil
import subprocess

from devenv import constants
from devenv.lib import colima, config, fs, limactl, proc, venv


# TODO: need to replace this with a nicer process executor in devenv.lib
def run_procs(
    repo: str,
    reporoot: str,
    venv_path: str,
    _procs: tuple[tuple[str, tuple[str, ...], dict[str, str]], ...],
    verbose: bool = False,
) -> bool:
    procs: list[tuple[str, tuple[str, ...], subprocess.Popen[bytes]]] = []

    stdout = subprocess.PIPE if not verbose else None
    stderr = subprocess.STDOUT if not verbose else None

    for name, cmd, extra_env in _procs:
        print(f"⏳ {name}")
        if constants.DEBUG:
            proc.xtrace(cmd)
        env = {
            **constants.user_environ,
            **proc.base_env,
            "VIRTUAL_ENV": venv_path,
            "PATH": f"{venv_path}/bin:{reporoot}/.devenv/bin:{proc.base_path}",
        }
        if extra_env:
            env = {**env, **extra_env}
        procs.append(
            (
                name,
                cmd,
                subprocess.Popen(
                    cmd,
                    stdout=stdout,
                    stderr=stderr,
                    env=env,
                    cwd=reporoot,
                ),
            )
        )

    all_good = True
    for name, final_cmd, p in procs:
        out, _ = p.communicate()
        if p.returncode != 0:
            all_good = False
            out_str = f"Output:\n{out.decode()}" if not verbose else ""
            print(
                f"""
❌ {name}

failed command (code {p.returncode}):
    {shlex.join(final_cmd)}

{out_str}

"""
            )
        else:
            print(f"✅ {name}")

    return all_good


# Temporary, see https://github.com/getsentry/sentry/pull/78881
def check_minimum_version(minimum_version: str) -> bool:
    version = importlib.metadata.version("sentry-devenv")

    parsed_version = tuple(map(int, version.split(".")))
    parsed_minimum_version = tuple(map(int, minimum_version.split(".")))

    return parsed_version >= parsed_minimum_version


def installed_pnpm(version: str, binroot: str) -> bool:
    if shutil.which("pnpm", path=binroot) != f"{binroot}/pnpm" or not os.path.exists(
        f"{binroot}/node-env/bin/pnpm"
    ):
        return False

    stdout = proc.run((f"{binroot}/pnpm", "--version"), stdout=True)
    installed_version = stdout.strip()
    return version == installed_version


def install_pnpm(version: str, reporoot: str) -> None:
    binroot = fs.ensure_binroot(reporoot)

    if installed_pnpm(version, binroot):
        return

    print(f"installing pnpm {version}...")

    # {binroot}/npm is a devenv-managed shim, so
    # this install -g ends up putting pnpm into
    # .devenv/bin/node-env/bin/pnpm which is pointed
    # to by the {binroot}/pnpm shim
    proc.run((f"{binroot}/npm", "install", "-g", f"pnpm@{version}"), stdout=True)

    fs.write_script(
        f"{binroot}/pnpm",
        """#!/bin/sh
export PATH={binroot}/node-env/bin:"${{PATH}}"
exec {binroot}/node-env/bin/pnpm "$@"
""",
        shell_escape={"binroot": binroot},
    )


def main(context: dict[str, str]) -> int:
    minimum_version = "1.14.2"
    if not check_minimum_version(minimum_version):
        raise SystemExit(
            f"""
Hi! To reduce potential breakage we've defined a minimum
devenv version ({minimum_version}) to run sync.

Please run the following to update your global devenv:

devenv update

Then, use it to run sync this one time.

{constants.root}/bin/devenv sync
"""
        )

    repo = context["repo"]
    reporoot = context["reporoot"]
    repo_config = config.get_config(f"{reporoot}/devenv/config.ini")

    # TODO: context["verbose"]
    verbose = os.environ.get("SENTRY_DEVENV_VERBOSE") is not None

    FRONTEND_ONLY = os.environ.get("SENTRY_DEVENV_FRONTEND_ONLY") is not None
    SKIP_FRONTEND = os.environ.get("SENTRY_DEVENV_SKIP_FRONTEND") is not None

    USE_OLD_DEVSERVICES = os.environ.get("USE_OLD_DEVSERVICES") == "1"

    if constants.DARWIN and os.path.exists(f"{constants.root}/bin/colima"):
        binroot = f"{reporoot}/.devenv/bin"
        colima.uninstall(binroot)
        limactl.uninstall(binroot)

    from devenv.lib import node

    node.install(
        repo_config["node"]["version"],
        repo_config["node"][constants.SYSTEM_MACHINE],
        repo_config["node"][f"{constants.SYSTEM_MACHINE}_sha256"],
        reporoot,
    )

    with open(f"{reporoot}/package.json") as f:
        package_json = json.load(f)
        pnpm = package_json["packageManager"]
        pnpm_version = pnpm.split("@")[-1]

    # TODO: move pnpm install into devenv
    install_pnpm(pnpm_version, reporoot)

    # no more imports from devenv past this point! if the venv is recreated
    # then we won't have access to devenv libs until it gets reinstalled

    # venv's still needed for frontend because repo-local devenv and pre-commit
    # exist inside it
    venv_dir, python_version, requirements, editable_paths, bins = venv.get(reporoot, repo)
    url, sha256 = config.get_python(reporoot, python_version)
    print(f"ensuring {repo} venv at {venv_dir}...")
    venv.ensure(venv_dir, python_version, url, sha256)

    if not run_procs(
        repo,
        reporoot,
        venv_dir,
        (
            # TODO: devenv should provide a job runner (jobs run in parallel, tasks run sequentially)
            (
                "python dependencies (1/3)",
                (
                    # upgrading pip first
                    "pip",
                    "install",
                    "--constraint",
                    "requirements-dev-frozen.txt",
                    "pip",
                ),
                {},
            ),
        ),
        verbose,
    ):
        return 1

    if not SKIP_FRONTEND and not run_procs(
        repo,
        reporoot,
        venv_dir,
        (
            (
                # Spreading out the network load by installing js,
                # then py in the next batch.
                "javascript dependencies (1/1)",
                (
                    "pnpm",
                    "install",
                    "--frozen-lockfile",
                    "--reporter=append-only",
                ),
                {
                    "NODE_ENV": "development",
                    # this ensures interactive prompts are answered by
                    # the defaults (usually yes), useful for recreating
                    # node_modules if configuration or node version changes
                    "CI": "true",
                },
            ),
        ),
        verbose,
    ):
        return 1

    if not run_procs(
        repo,
        reporoot,
        venv_dir,
        (
            # could opt out of syncing python if FRONTEND_ONLY but only if repo-local devenv
            # and pre-commit were moved to inside devenv and not the sentry venv
            (
                "python dependencies (2/3)",
                (
                    "pip",
                    "install",
                    "--constraint",
                    "requirements-dev-frozen.txt",
                    "-r",
                    "requirements-dev-frozen.txt",
                ),
                {},
            ),
        ),
        verbose,
    ):
        return 1

    if not run_procs(
        repo,
        reporoot,
        venv_dir,
        (
            (
                "python dependencies (3/3)",
                ("python3", "-m", "tools.fast_editable", "--path", "."),
                {},
            ),
            ("pre-commit dependencies", ("pre-commit", "install", "--install-hooks", "-f"), {}),
        ),
        verbose,
    ):
        return 1

    fs.ensure_symlink("../../config/hooks/post-merge", f"{reporoot}/.git/hooks/post-merge")

    sentry_conf = os.environ.get("SENTRY_CONF", f"{constants.home}/.sentry")

    if not os.path.exists(f"{sentry_conf}/config.yml") or not os.path.exists(
        f"{sentry_conf}/sentry.conf.py"
    ):
        proc.run((f"{venv_dir}/bin/sentry", "init", "--dev"))

    # Frontend engineers don't necessarily always have devservices running and
    # can configure to skip them to save on local resources
    if FRONTEND_ONLY:
        print("Skipping python migrations since SENTRY_DEVENV_FRONTEND_ONLY is set.")
        return 0

    if USE_OLD_DEVSERVICES:
        # Ensure new devservices is not being used, otherwise ports will conflict
        proc.run(
            (f"{venv_dir}/bin/devservices", "down"),
            pathprepend=f"{reporoot}/.devenv/bin",
            exit=True,
        )
        # TODO: check healthchecks for redis and postgres to short circuit this
        proc.run(
            (
                f"{venv_dir}/bin/{repo}",
                "devservices",
                "up",
                "redis",
                "postgres",
            ),
            pathprepend=f"{reporoot}/.devenv/bin",
            exit=True,
        )
    else:
        # Ensure old sentry devservices is not being used, otherwise ports will conflict
        proc.run(
            (
                f"{venv_dir}/bin/{repo}",
                "devservices",
                "down",
            ),
            pathprepend=f"{reporoot}/.devenv/bin",
            exit=True,
        )
        proc.run(
            (f"{venv_dir}/bin/devservices", "up", "--mode", "migrations"),
            pathprepend=f"{reporoot}/.devenv/bin",
            exit=True,
        )

    if not run_procs(
        repo,
        reporoot,
        venv_dir,
        (
            (
                "python migrations",
                ("make", "apply-migrations"),
                {},
            ),
        ),
        verbose,
    ):
        return 1

    postgres_container = (
        "sentry_postgres" if os.environ.get("USE_OLD_DEVSERVICES") == "1" else "sentry-postgres-1"
    )

    # faster prerequisite check than starting up sentry and running createuser idempotently
    stdout = proc.run(
        (
            "docker",
            "exec",
            postgres_container,
            "psql",
            "sentry",
            "postgres",
            "-t",
            "-c",
            "select exists (select from auth_user where email = 'admin@sentry.io')",
        ),
        stdout=True,
    )
    if stdout != "t":
        proc.run(
            (
                f"{venv_dir}/bin/sentry",
                "createuser",
                "--superuser",
                "--email",
                "admin@sentry.io",
                "--password",
                "admin",
                "--no-input",
            )
        )

    return 0
