var preq = require('preq');

function updateFacebookCache (config, schema, sequelize, interval, shouldContinue) {
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
      // console.log('staleUrls', shouldContinue, staleUrls)
      for (var i=0,l=staleUrls.length; i<l; i++) {
        if (typeof shouldContinue == 'function' && !shouldContinue(1000*10, staleUrls)) {
          return
        }
        var entry = staleUrls[i];
        preq.post({
          uri: 'https://graph.facebook.com',
          query: {
            id: config.baseUrl + '/r/0/' + entry.dataValues.url,
            scrape: true,
            access_token: config.fbAccessToken
          }
        }).then(function(response) {
          console.log(response);
        }).catch(function(error) {
          console.log('Facebook cache Graph API update error:', error);
        });
      }
    } else {
      console.log('No metadata needs updating');
    }
  }).catch(function(error) {
    console.log('Facebook cache update query failed:', error);
  });
}

module.exports = updateFacebookCache;
