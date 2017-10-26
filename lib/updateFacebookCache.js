var axios = require('axios');
var config = require('../config/config.json');

function updateFacebookCache (schema, sequelize) {
	sequelize.query(
		"SELECT DISTINCT url FROM metadata WHERE updatedAt <= date('now','-1 hour')", { type: sequelize.QueryTypes.SELECT }
	).then(staleUrls => {
		if (staleUrls) {
			staleUrls.forEach((entry) => {
				axios.post('https://graph.facebook.com', { 
					id: config.baseUrl + '/r/0/' + entry.url, scrape: true, access_token: config.fbAccessToken
				}).then((response) => {
				    console.log(response);
				  })
				  .catch((error) => {
				    console.log(error);
				  });
			});
		} else {
			console.log('No metadata needs updating');
		}
	}).catch((error) => {
		console.log(error);
	});
}

module.exports = updateFacebookCache;