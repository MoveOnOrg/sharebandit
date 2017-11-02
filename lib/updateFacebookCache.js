var preq = require('preq');

function updateFacebookCache (config, schema, sequelize, interval) {
  interval = interval || 60 * 60;
  return schema.Metadata.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('url')), 'url' ], 'id' ],
    where: {
      updatedAt: {
        $gte: (new Date() - 1000 * interval)
      }
    }
  }).then(function(staleUrls) {
    if (staleUrls) {
      staleUrls.forEach(function(entry) {
        preq.post({
          uri: 'https://graph.facebook.com',
          query: {
            id: config.baseUrl + '/r/' + entry.id + '/' + entry.url,
            scrape: true,
            access_token: config.fbAccessToken
          }
        }).then(function(response) {
          console.log(response);
        }).catch(function(error) {
          console.log('Facebook cache Graph API update error:', error);
        });

        preq.post({
          uri: 'https://graph.facebook.com',
          query: {
            id: config.baseUrl + '/r/0/' + entry.url,
            scrape: true,
            access_token: config.fbAccessToken
          }
        }).then(function(response) {
          console.log(response);
        }).catch(function(error) {
          console.log('Facebook cache Graph API update error:', error);
        });
      });
    } else {
      console.log('No metadata needs updating');
    }
  }).catch(function(error) {
    console.log('Facebook cache update query failed:', error);
  });
}

module.exports = updateFacebookCache;