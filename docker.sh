#!/bin/sh

set -o pipefail
set -u
set -e

cat > config/config.json <<EOF
{
  "db" : {
    "dialect": "postgres",
    "host": "${DATABASE_HOSTNAME:-localhost}",
    "port": ${DATABASE_PORT:-5432},
    "user": "${DATABASE_USERNAME:-sharebandit}",
    "pass": "${DATABASE_PASSWORD:-sharebandit}",
    "database": "${DATABASE_NAME:-sharebandit}"
  },
  "segment": {
    "key": "",
    "domain": ""
  },
  "oauth": {
    "clientId": "${OAUTH_CLIENT_ID:-}",
    "clientSecret": "${OAUTH_CLIENT_SECRET:-}"
  },
  "oauthAllowedUsers": {
    "domain": "${OAUTH_DOMAIN:-}"
  },
  "baseUrl": "${PROTOCOL:-https}://${DOMAIN:-localhost:3000}",
  "port": 80,
  "sessionSecret": "${SESSION_SECRET}",

  "domain_whitelist": {
    "${ACTION_DOMAIN}": {
      "proto": "https"
    }
  }
}
EOF

exec node $@
