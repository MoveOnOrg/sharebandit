How to setup:
-------------

0. Install nodejs

1. Config base template
   * `cp config.json.template config.json`
   * change "baseUrl" to e.g. "http://localhost:3000"
   * change "port" to e.g. 3000
   * add a secret string for "sessionSecret" key

2. Setup the database with the "db" key in config.json:
   * Install sqlite3 and/or postgres libs and module installed on your computer (apt, brew, etc)
   * Do not use sqlite for production.
   * If you use sqlite, you need to run
      (NOT necessary for postgres)   
      npm install --dev

3. Setup Auth
   * If you are doing development on domain localhost, 
     you can skip auth by adding `"develMode": true,` to your config.json
   * If you want to use google auth for the admin:

     1. start here: https://console.developers.google.com/home/dashboard
        a. create a project, and then within the project, under credentials, add a new oauth client id
        b. enable your project to have the Google+ (plus) API (to get the email address)
        c. In config.json
           i. set "oauth" creds to the credentials from the google project
           ii. Set the origin to whatever domain you're connecting to locally (i do http://josh.dev or localhost:3000)
        d. Set the redirect URI in the google dashboard for the app
           to <baseUrl> + /auth/google/callback (e.g. http://localhost:3000/auth/google/callback)
     2. In config.json
        * set "oauthAllowedUsers": { "domain": "yourdomain.com"} to allow all domain users to have access
          * You can also add "users": ["youremail@gmail.com", "yourfriend@gmail.com"]
          *  and/or "ip_addresses": ["127.0.0.1", "<whitelisted ip addresses>"]

How to run (after installing nodejs):
-------------------------------------

   `nodejs index.js`


Installing 'Modules'
--------------------

A module extends navigation and admin.  Include it in your module js code
somewhere locally and add in config.json

  "extensionModules": ["path/to/module.js"],

Your module.js file should look something like this:
```
   var init = function(app, schema, sequelize, adminauth) {
        app.get('/yourapp/admin',
          adminauth,
          function(req, res) {
            res.send( "here is your admin");
          });
      //TODO:
      // sequelize.SETUP_SCHEMA_BLALHLAHBLAB

      return {
         link: {link: '/supershare/admin', title: 'SuperShare'},
         viewDirectory: __dirname + "views/"
      }
   }

   module.exports = init;
```