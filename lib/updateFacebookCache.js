var preq = require('preq');

function updateFacebookCache (config, sequelize, interval) {
	interval = interval || '-1 hour'
	return sequelize.query(
		"SELECT DISTINCT url FROM metadata WHERE updatedAt >= date('now', ?)",
		{ type: sequelize.QueryTypes.SELECT, replacements: [interval] }
	).then(staleUrls => {
		if (staleUrls) {
			staleUrls.forEach((entry) => {
				preq.post({
					uri: 'https://graph.facebook.com',
					query: {
						id: config.baseUrl + '/r/0/' + entry.url, scrape: true, access_token: config.fbAccessToken
					}
				}).then((response) => {
				    console.log(response);
				  })
				  .catch((error) => {
				    console.log('Facebook cache Graph API update error:', error);
				  });
			});
		} else {
			console.log('No metadata needs updating');
		}
	}).catch((error) => {
		console.log('Facebook cache update query failed:', error);
	});
}

module.exports = updateFacebookCache;