var axios = require('axios');
var config = require('../config/config.json');

function updateFacebookCache (schema) {

	schema.Metadata.findAll({
	    attributes: [
	        [Sequelize.fn('DISTINCT', Sequelize.col('url')) ,'url'],
	    ]
	}).then(staleUrls => {
		if (staleUrls) {
			staleUrls.forEach((entry) => {
				axios.post('https://graph.facebook.com', { 
					id: 'https://petitions.moveon.org/sign/rep-faso-owned-by-nra?source=homepage', scrape: true, access_token: config.fbAccessToken 
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