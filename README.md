[![Build Status](https://travis-ci.org/MoveOnOrg/sharebandit.svg?branch=master)](https://travis-ci.org/MoveOnOrg/sharebandit)

# ShareBandit

ShareBandit automatically tests Facebook sharing Title-Description-Image possibilities, and then promotes the most successful one as a winner becomes clear.

It is a system that runs separately from your regular website, but with some integration will handle share requests for your website.  When you do this, you can create multiple options of Title-Description-Image and then ShareBandit will automatically run tests and choose the winner of the best option you created.

* See /docs/WORKFLOW.md for typical workflow using ShareBandit.
* See /docs/INTEGRATION.md for instructions to integrate ShareBandit with a site.
* See /docs/MODULES.md for instructions to add modules to ShareBandit.

## How to run locally:

1. `git clone https://github.com/MoveOnOrg/sharebandit.git`

2. Install node, on Linux: `sudo apt-get install node` and on MacOS `brew install node` (or use nvm, whatever you prefer)

3. In the root of the app run `npm install` to get and install all packages

4. Config base template
   * `cp config/config.json.template config/config.json`
   * change "baseUrl" to e.g. "http://localhost:3000"
   * change "port" to e.g. 3000
   * add a secret string for "sessionSecret" key

5. Setup the database with the "db" key in config.json:
   * Install sqlite3 and/or postgres libs and module installed on your computer (apt, brew, etc)
   * Do not use sqlite for production.
   * If you use sqlite, you need to run
      (NOT necessary for postgres)   
      npm install --dev
      npm install -g sequelize-cli
   * If you use postgres, before you can run migrations, you'll need to:
      create database sharebandit;

6. Run database migrations
   * sequelize db:migrate
   * NODE_ENV=db sequelize db:migrate --config config/config.json # or this, depending on how you manage your envs

7. Setup Auth
   * If you are doing development on domain localhost,
     you can skip auth by adding `"develMode": true,` to your config.json
   * If you want to use google auth for the admin:

     1. start here: https://console.developers.google.com/home/dashboard
        a. create a project, and then within the project, under credentials, add a new oauth client id
        b. enable your project to have the Google+ (plus) API (to get the email address)
        c. In config.json
           i. set "oauth" creds to the credentials from the google project
           ii. Set the origin to whatever domain you're connecting to locally (i do http://sharebandit.dev or localhost:3000)
        d. Set the redirect URI in the Google dashboard for the app
           to <baseUrl> + /auth/google/callback (e.g. http://localhost:3000/auth/google/callback)
     2. In config.json
        * set "oauthAllowedUsers": { "domain": "yourdomain.com"} to allow all domain users to have access
          * You can also add "users": ["youremail@gmail.com", "yourfriend@gmail.com"]
          *  and/or "ip_addresses": ["127.0.0.1", "<whitelisted ip addresses>"]

## How to run (after installing node):

   `node index.js`
   # and then navigate to http://localhost:3000/

## How to run tests

   `npm run test`

## How to Install in Production:

### Classic hosting

You can do this all ways that run nodejs apps in production.
Included in the codebase is the nginx/ directory that could help facilitate that
on Ubuntu systems.

1. Run (or run the commands yourself) nginx/install.sh as root
2. Copy the sharebandit.conf file to /etc/nginx/sites-enabled/
3. Install your SSL certificates at /etc/nginx/cert.* (or modify sharebandit.conf to map your server layout)

#### How to run in production

if you haven't already, install pm2
$sudo npm install pm2 --global
pm2 pm2.yml --env production

### AWS Lambda (serverless deploy)

1. Make an RDS postgres database and Redis instance (for session storage)
2. Set the config variables into a file called `./config/lambda.json`
   - Connect the redis session store with

```
  "redisSessionStore": {
    "prefix": "SHAREBANDIT_",
    "host": "yourRedisHost.0001.usw1.cache.amazonaws.com",
    "port": 6379
  },
```

3. Install Claudia.js with:
   `npm install claudia -g`
   and see the rest of the [Claudia documentation](https://claudiajs.com/tutorials/installing.html) if you do not have an amazon environment already
4. Then create your api gateway and lambda instance with a (single!) command that will START like this:
   `claudia create --handler lambda.handler --deploy-proxy-api <MORE OPTIONS HERE>`
   Run (`claudia create --help` for more info. We recommend running behind a vpc, with a security group, etc)
   It's also likely you will need to use the `--use-s3-bucket` option because the final lambda zip file will be large.
