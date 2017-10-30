var _ = require('lodash');
var querystring = require('querystring');
var google = require('googleapis');
var plus = google.plus('v1');
var url = require('url');

var googleAuth = function(params) {
  /*
    params = {
      oauth2Client: <required client instance!>
      app: <your express app>,
      whitelist: {
         //each of these keys is optional
         users: [<email list of users>],
         domain: "<your domain for blanket domain auth>",
         ip_addresses: [<whitelisted ip addresses>]
      }
    }
   */

  var self = {
    oauth2Client: params.oauth2Client,
    redirect: function(res, action) {
      res.redirect("/auth/google?action=" + querystring.escape(action));
    }
  };

  if (params.app) {
    // Auth.
    params.app.get('/auth/google', function (req, res) {
      var authUrl = self.oauth2Client.generateAuthUrl({
        scope: [
          'https://www.googleapis.com/auth/userinfo.email',
        ]
      });
      var query = url.parse(req.url, true).query;
      if (query.action) {
        req.session.action = query.action;
      }
      res.redirect(authUrl + '&approval_prompt=force');
    });
    
    params.app.get('/auth/google/callback', function (req, res) {
      var query = url.parse(req.url, true).query;
      if (query.code) {
        self.oauth2Client.getToken(query.code, function(err, tokens) {
          if (!err) {
            self.oauth2Client.setCredentials(tokens);
            req.session.oauth_access_token = tokens;
          }
          if (req.session.action) {
            res.redirect(req.session.action);
          }
          else {
            return res.redirect('/');
          }
        });
      }
    });
    
    // Logout.
    params.app.get('/logout', function(req, res, next) {
      return self.confirm(req, res, next)
    }, function (req, res) {
      if (req.session && req.session.oauth_access_token) {
        req.session.oauth_access_token = null;
      }
      res.redirect("/");
    });

  }

  self.whitelist = function(allowedopts) {
    return function(req, res, next) {
      if (allowedopts.ip_addresses &&
          _.contains(allowedopts.ip_addresses, req.connection.remoteAddress)) {
        return next();
      }
      if (!req.session.oauth_access_token) {
        self.redirect(res, req.originalUrl);
    	return;
      }
      // this isn't thread-safe, but javascript is just one thread!
      self.oauth2Client.setCredentials(req.session.oauth_access_token);

      plus.people.get({ userId: 'me', auth: self.oauth2Client }, function(err, response) {
        if (err) {
          console.log('authentication error', err)
        }
        if (!response) {
          self.redirect(res, req.originalUrl);
          return;
        }
        var validEmails = response.emails.filter(function(email) {
          if (email.type != 'account') {
            return false;
          }
          return (
            (allowedopts.domain && _.endsWith(email.value, allowedopts.domain))
              || (allowedopts.users && _.contains(allowedopts.users, email.value))
          );
        });
        if (validEmails.length < 1) {
          self.redirect(res, req.originalUrl);
          return;
        }
        next();
      });
    };
  };
  if (params.users) {
    self.users = params.users;
    self.confirm = self.whitelist({users:self.users});
  } else {
    self.confirm = self.whitelist(params.whitelist);
  }
  return self;
};

module.exports = googleAuth;
