#!/usr/bin/env python3
"""Build a signed JWT assertion for the Chrome Web Store API from a service
account key file, and print it to stdout.

Google's client libraries normally do this; doing it here keeps the repo free of
dependencies. Signing is delegated to the openssl binary because the Python
standard library has no RSA.

Usage: cws-jwt.py <path-to-service-account-key.json>
"""

import base64
import json
import os
import subprocess
import sys
import tempfile
import time

SCOPE = "https://www.googleapis.com/auth/chromewebstore"
AUDIENCE = "https://oauth2.googleapis.com/token"


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def compact(obj) -> bytes:
    return json.dumps(obj, separators=(",", ":")).encode()


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    try:
        with open(sys.argv[1]) as fh:
            key = json.load(fh)
    except OSError as exc:
        print(f"ERROR: cannot read service account key: {exc}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"ERROR: service account key is not valid JSON: {exc}", file=sys.stderr)
        return 1

    for field in ("client_email", "private_key"):
        if not key.get(field):
            print(
                f"ERROR: service account key has no '{field}'. Download the JSON key "
                "from Google Cloud -> IAM -> Service Accounts -> Keys.",
                file=sys.stderr,
            )
            return 1

    now = int(time.time())
    signing_input = "{}.{}".format(
        b64url(compact({"alg": "RS256", "typ": "JWT"})),
        b64url(compact({
            "iss": key["client_email"],
            "scope": SCOPE,
            "aud": AUDIENCE,
            "exp": now + 3600,
            "iat": now,
        })),
    )

    # openssl needs the key as a file; keep it short-lived and owner-only.
    fd, path = tempfile.mkstemp(prefix="cws-key-")
    try:
        os.write(fd, key["private_key"].encode())
        os.close(fd)
        try:
            signature = subprocess.run(
                ["openssl", "dgst", "-sha256", "-sign", path],
                input=signing_input.encode(),
                capture_output=True,
                check=True,
            ).stdout
        except subprocess.CalledProcessError as exc:
            print(f"ERROR: openssl could not sign the assertion: "
                  f"{exc.stderr.decode().strip()}", file=sys.stderr)
            return 1
    finally:
        os.unlink(path)

    print("{}.{}".format(signing_input, b64url(signature)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
