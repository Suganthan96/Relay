# Relay sandbox image (md 6·2) — where the Tester runs a cloned repo's own
# scripts (npm install / npm test / postinstall) with no access to the host.
#
#   docker build -t relay-sandbox:latest backend/sandbox
#
# The pipeline invokes it as:
#   docker run --rm --network none -v <clone>:/work -w /work relay-sandbox:latest sh -lc "<command>"
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ curl \
 && rm -rf /var/lib/apt/lists/*

# non-root by default
USER node
WORKDIR /work
