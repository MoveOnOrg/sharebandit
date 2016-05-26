ShareBandit
===========

ShareBandit automatically tests Facebook sharing Title-Description-Image possibilities, and then promotes the
most successful one as a winner becomes clear.  This should allow you to create 

It is a system that runs separately from your regular website, but with some integration will handle
share requests for your website.  When you do this, you can create multiple options of Title-Description-Image
and then ShareBandit will automatically run tests and choose the winner of the best option you created.


Expected Workflow
-----------------

This describes the experience from a non-technical author using your website and ShareBandit.

1. The author/editor logs in to ShareBandit and *adds* a new URL to test.
1.1  They input what the final URL will be (where we will redirect visits)
1.2  They create multiple "treatments": Headline/Description/ImageLink combinations
2. Author goes into your CMS/website system and marks the page somehow as using ShareBandit.
3. After publishing, as users share your page, ShareBandit tests the options and determines how successful 
   each one is (after about 100-200 shares).  As one takes the lead, ShareBandit will make it more likely 
   that that candidate is tried, so you don't have to evaluate real-time, and you can let the system do that.
4. As shares come in, you can *View Report* on the ShareBandit URL page and see which candidate is winning/has won.

Example Workflow with screenshots
-----------------
The author/editor logs in to ShareBandit, adds a new URL to test, and several treatment options for the URL (treatment options are Headline/Description/ImageLink combinations)
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB1.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB2.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB3.png )

Author goes into your CMS/website system and marks the page  as "using ShareBandit". In our custom petition system, we tag a petition as "sharebandit" and in the petition system server logic, construct URLs pointing to share.moveon.org (where we have deployed sharebandit). The implementation of this step will be specific to the system that is using sharebandit. 
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB4.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB5.png )

When users share the page served by your CMS that has been instrumented by you to serve up share links from sharebandit, your share page gets one of the treatments you set up in sharebandit. In this example, our CMS is our petition system. So to demonstrate, we sign the test petition (the URL we load = the URL we added in ShareBandit admin), and on our petition system's thanks page, there is an option to share the petition. 
 
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB6.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB7.png )

Here our system has been instrumented to share the link https://share.moveon.org/r/0/petitions.moveon.org/sign/sharebandit-test and sharebandit takes this request and redirects to a particular treatment, like https://share.moveon.org/r/8/petitions.moveon.org/sign/sharebandit-test

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB9.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB10.png )

The first few hundred requests return a treatment at random. But as the bandit algorithm learns and trains, it starts to send back "winning" treatments.

Then when users share this link, they are sharing a particular treatment. You can see we use a private facebook group for testing:
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB11.png )

Other users can then click on this link, are taken to our petition page, and if they sign the petition, our petition server has been instrumented to make a callback to sharebandit letting it know this trial was a success. The implementation of how and when to make the "success" callback will depend on the system integrating with sharebandit, and is an important choice point for the implementer. 

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB12.png )

Here's an example of how we make this callback on petition signature, using the abver and abid params passed into the petition page URL by the link that was posted on facebook:

```perl
http://share.moveon.org/a/$abver/$petition_share?abid=$abid
```

After the "success" callback has been made, you can navigate back to the sharebandit admin, and click View Report for a given treatment, and then see a graph of successes for various treatments over time. It will take hundreds of data points for these graphs to become meaningful, but they are intended to show the progress of the algorithm, and how long it took to converge on a winner.

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB13.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB14.png )

To add data points in this example, you need to sign this same petition again (with a different email address, in our system) to get a potentially different share treatment (remember that this is chosen at random at first):

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB15.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB16.png ) 

Technical/System Workflow
-------------------------

This describes what is happening atthe system level as people share a URL, etc.

* TODO


How to integrate ShareBandit with a website (programming required)
------------------------------------------------------------------

### The Simplest Integration ###

1. Make some tag/option to 'mark' which of your pages is using a ShareBandit page
2. For those pages:
2.1 Make an og:url META tag in your HEAD element:

    &lt;meta name="og:url" value="http://{{YOUR_SHAREBANDIT_URL}}<b>/r/0/</b>{{URL_FOR_PAGE WITHOUT PROTOCOL}}" />

Example: If your sharebandit instance is at `https://share.example.com` and the URL for the page is
`http://www.example.com/story/the-world-is-burning` Then the tag should be:

    <meta name="og:url" value="https://share.example.com/r/0/www.example.com/story/the-world-is-burning" />

2.2 On any share links to your page, embed the javascript file

    <script src="{{YOUR_SHAREBANDIT_URL}}<b>/js/</b>{{URL_FOR_PAGE WITHOUT PROTOCOL}}" ></script>

Example (same case as above):

    <script src="https://share.example.com/js/www.example.com/story/the-world-is-burning" ></script>

2.3 On the same share links, add `class="sharebandit-fb"`

With `2.2` and `2.3` done, the javascript should replace the `href=""` or `data-href=""` attributes with the ShareBandit share URL in its place.  (See `views/jsshare.html` to review the code that is actually run)

### Deeper integration: Using ShareBandit Based on Actions/Conversions ###

The 'simple' integration above will only trigger ShareBandit based on facebook clicks.
If you are a news/content site, that may be all you want.  However, if there is a subsequent
action or conversion that you want users to take (e.g. donate or sign a petition), then you can have
ShareBandit run based on those actions instead.  After the simple integration, make the following integration changes:

1. Send action events to ShareBandit:
In order for ShareBandit to trigger based on actions, we obviously need to know when that takes place.
When ShareBandit redirects pages from Facebook to your site, it adds two query parameters to the page
`abver` and `abid`  so from the above, example, the page's visit will be something like:

   http://www.example.com/story/the-world-is-burning<b>?abid=123&abver=abc789</b>

In that case, you need to call this URL *after* your conversion action:

   https://share.example.com/a/abc789/www.example.com/story/the-world-is-burning?abid=123

As a template this looks like:

   {{YOUR_SHAREBANDIT_URL}}<b>/a/</b>{{abver}}/{{URL_FOR_PAGE WITHOUT PROTOCOL}}?abid={{abid}}

This URL actually returns a <a href="http://probablyprogramming.com/2009/03/15/the-tiniest-gif-ever">
     super-duper small image file</a> so if you have a 'Thanks'/completion page, you can just include the
     HTML:

   &lt;img src="{{conversion url above}}" width="1" height="1" />


2. Instead of the <b>/js/</b> `script` element in the simple version, replace that URL with <b>/jsaction/</b>
   This will trigger the share links' content based on action conversions rather than clicks.


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


How to Install in Production
----------------------------

You can do this all ways that run nodejs apps in production.
Included in the codebase in the nginx/ directory that could help facilitate that
on Ubuntu systems.

1. Run (or run the commands yourself) nginx/install.sh as root
2. Copy the sharebandit.conf file to /etc/nginx/sites-enabled/
3. Install your SSL certificates at /etc/nginx/cert.* (or modify sharebandit.conf to map your server layout)

Writing and Installing 'Modules'
--------------------------------

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
